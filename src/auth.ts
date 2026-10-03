import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";

import { ensureUserFromOAuth, findUserByEmail, findUserById } from "@/lib/db/users";
import {
  clearCredentialsLoginFailures,
  isCredentialsLoginRateLimited,
  recordCredentialsLoginFailure,
} from "@/lib/auth-rate-limit";
import { getRequiredEnv } from "@/lib/env";
import { isValidAuthPassword } from "@/lib/auth-password-policy";
import { sanitizeAuthReturnPath } from "@/lib/auth-return-path";
import { getTrustedRequestIp } from "@/lib/trusted-request-ip";
import { EmailSchema } from "@/lib/validators";

export const authConfig = {
  providers: [
    Google({
      clientId: getRequiredEnv("GOOGLE_CLIENT_ID"),
      clientSecret: getRequiredEnv("GOOGLE_CLIENT_SECRET"),
    }),
    Credentials({
      id: "credentials",
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        const parsedEmail = EmailSchema.safeParse(credentials?.email);
        const password = credentials?.password;
        if (!parsedEmail.success || typeof password !== "string" || !isValidAuthPassword(password)) return null;
        const email = parsedEmail.data.toLowerCase();
        const ipAddress = getTrustedRequestIp(request.headers);
        if (await isCredentialsLoginRateLimited(email, ipAddress)) return null;
        const user = await findUserByEmail(email);
        if (!user?.password_hash || !user.email_verified) {
          await recordCredentialsLoginFailure(email, ipAddress);
          return null;
        }
        const ok = await compare(password, user.password_hash);
        if (!ok) {
          await recordCredentialsLoginFailure(email, ipAddress);
          return null;
        }
        await clearCredentialsLoginFailures(email, ipAddress);
        return {
          id: user.id,
          email: user.email,
          name: user.name ?? undefined,
          image: user.image ?? undefined,
          authVersion: user.auth_version,
          privacyDeletionPending: user.privacy_deletion_requested_at != null,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider === "google") {
        return (profile as { email_verified?: boolean } | undefined)?.email_verified === true;
      }
      return true;
    },
    async jwt({ token, user, account }) {
      if (user) {
        if (account?.type === "oauth" && account.provider === "google") {
          if (!user.email) return null;
          try {
            const row = await ensureUserFromOAuth({
              email: user.email,
              name: user.name ?? null,
              image: user.image ?? null,
            });
            token.sub = row.id;
            token.authVersion = row.auth_version;
            token.privacyDeletionPending = row.privacy_deletion_requested_at != null;
          } catch {
            return null;
          }
        } else if (user.id && typeof user.authVersion === "number") {
          token.sub = user.id;
          token.authVersion = user.authVersion;
        } else {
          return null;
        }
      }
      if (!token.sub || typeof token.authVersion !== "number") return null;
      try {
        const current = await findUserById(token.sub);
        if (!current || current.auth_version !== token.authVersion) return null;
        token.privacyDeletionPending = current.privacy_deletion_requested_at != null;
      } catch {
        return null;
      }
      return token;
    },
    async session({ session, token }) {
      if (!session.user || !token.sub || typeof token.authVersion !== "number") {
        throw new Error("Cannot create a session from an invalid authentication token");
      }
      if (token.privacyDeletionPending === true) {
        // Keep the JWT subject internal so this account can resume its pending
        // deletion. Normal route guards receive no usable user id or PII.
        const restrictedUser = session.user as unknown as Record<string, unknown>;
        delete restrictedUser.id;
        delete restrictedUser.email;
        delete restrictedUser.name;
        delete restrictedUser.image;
        delete restrictedUser.authVersion;
        session.deletionUserId = token.sub;
        session.accountLifecycle = "deleting";
        return session;
      }
      session.user.id = token.sub;
      session.user.authVersion = token.authVersion;
      return session;
    },
    async redirect({ url, baseUrl }) {
      try {
        if (url.includes("\\") || /[\u0000-\u001f\u007f]/.test(url) || url.startsWith("//")) {
          return new URL("/dashboard", baseUrl).href;
        }
        const parsed = new URL(url, baseUrl);
        if (parsed.origin !== new URL(baseUrl).origin || parsed.pathname.startsWith("//")) {
          return new URL("/dashboard", baseUrl).href;
        }
        const safePath = sanitizeAuthReturnPath(`${parsed.pathname}${parsed.search}${parsed.hash}`);
        return new URL(safePath, baseUrl).href;
      } catch {
        return new URL("/dashboard", baseUrl).href;
      }
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  trustHost: true,
} satisfies NextAuthConfig;

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
