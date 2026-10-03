import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      authVersion: number;
    };
    deletionUserId?: string;
    accountLifecycle?: "deleting";
  }
  interface User {
    authVersion?: number;
    privacyDeletionPending?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    authVersion?: number;
    privacyDeletionPending?: boolean;
  }
}
