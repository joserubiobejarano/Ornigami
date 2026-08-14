import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";

import { ensureUserFromOAuth, findUserByEmail } from "@/lib/db/users";
import {
  clearCredentialsLoginFailures,
  isCredentialsLoginRateLimited,
  recordCredentialsLoginFailure,
} from "@/lib/auth-rate-limit";
import { getRequiredEnv } from "@/lib/env";

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
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const forwarded = request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
        const ipAddress = request.headers.get("x-real-ip") ?? forwarded ?? null;
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
          if (user.email) {
            const row = await ensureUserFromOAuth({
              email: user.email,
              name: user.name ?? null,
              image: user.image ?? null,
            });
            token.sub = row.id;
          }
        } else if (user.id) {
          token.sub = user.id as string;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
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
