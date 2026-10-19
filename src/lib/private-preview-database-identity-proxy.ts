import type {
  PrivatePreviewDbIdentityPreflightStatus,
} from "./private-preview-database-identity.ts";

export const PRIVATE_PREVIEW_DATABASE_IDENTITY_PATH = "/api/private-preview/database-identity";

export function isRestrictedDeletionSession(authState: {
  accountLifecycle?: unknown;
  deletionUserId?: unknown;
  user?: { id?: unknown } | null;
} | null | undefined): boolean {
  return authState?.accountLifecycle === "deleting"
    && typeof authState.deletionUserId === "string"
    && !authState.user?.id;
}

export function withPrivatePreviewIdentityPreflight<Args extends [unknown, ...unknown[]], Response>(input: {
  authenticatedProxy: (...args: Args) => Promise<Response> | Response;
  pathname: (request: Args[0]) => string;
  preflight: () => PrivatePreviewDbIdentityPreflightStatus;
  reject: (status: Exclude<PrivatePreviewDbIdentityPreflightStatus, "ready">) => Promise<Response> | Response;
}): (...args: Args) => Promise<Response> {
  return async (...args) => {
    const request = args[0];
    const path = input.pathname(request);
    if (path !== PRIVATE_PREVIEW_DATABASE_IDENTITY_PATH && path !== `${PRIVATE_PREVIEW_DATABASE_IDENTITY_PATH}/`) {
      return input.authenticatedProxy(...args);
    }

    const status = input.preflight();
    if (status === "ready") return input.authenticatedProxy(...args);
    return input.reject(status);
  };
}
