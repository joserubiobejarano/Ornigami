/**
 * Legacy helper for Bearer tokens (Supabase). Auth is cookie-based via Auth.js , return null.
 * Content/project fetches should rely on same-origin session cookies.
 */
export async function ensureBrowserToken(): Promise<string | null> {
  return null;
}

