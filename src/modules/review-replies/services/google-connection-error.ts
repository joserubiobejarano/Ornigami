export const GOOGLE_CONNECTION_ERROR = "Google connection failed. Please try again.";

export function getGoogleConnectionUrlErrorKey(status: string | null, reason: string | null): string | null {
  return status === "error" ? JSON.stringify([status, reason]) : null;
}

export function getGoogleConnectionUrlError(status: string | null, reason: string | null): string | null {
  if (getGoogleConnectionUrlErrorKey(status, reason) === null) return null;
  if (reason === "missing_refresh_token") return GOOGLE_CONNECTION_ERROR;
  return GOOGLE_CONNECTION_ERROR;
}

export function resolveGoogleConnectionIssue(input: {
  localError: string | null;
  connectionError: string | null;
  urlError: string | null;
  urlErrorDismissed: boolean;
}): string | null {
  return input.localError || (input.urlErrorDismissed ? null : input.urlError) || input.connectionError;
}
