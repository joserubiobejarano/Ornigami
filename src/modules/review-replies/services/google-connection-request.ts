export type GoogleLocation = {
  id: string;
  locationName: string;
  title: string | null;
  primaryCategory: string | null;
  isSuspended: boolean;
  selected: boolean;
};

export type GoogleConnectionData = {
  connected: boolean;
  canManage?: boolean;
  selectionLocked?: boolean;
  locations?: GoogleLocation[];
};

type FetchLike = (input: string) => Promise<Response>;

export function createConnectionRequestGuard() {
  let sequence = 0;
  let scope = "";
  return {
    setScope(nextScope: string) {
      if (scope !== nextScope) {
        scope = nextScope;
        sequence += 1;
      }
    },
    begin(nextScope: string) {
      scope = nextScope;
      sequence += 1;
      return sequence;
    },
    invalidate() {
      sequence += 1;
    },
    isCurrent(requestSequence: number, requestScope: string) {
      return sequence === requestSequence && scope === requestScope;
    },
  };
}

/** Shares only overlapping reads; later explicit reloads still reach the server. */
export function createGoogleConnectionRequest(fetcher: FetchLike) {
  const inFlight = new Map<string, Promise<GoogleConnectionData>>();

  return function request(businessId?: string, options: { force?: boolean } = {}) {
    const key = businessId ?? "";
    if (options.force) inFlight.delete(key);
    const existing = inFlight.get(key);
    if (existing) return existing;

    const query = businessId ? `?businessId=${encodeURIComponent(businessId)}` : "";
    const pending = fetcher(`/api/google/connection${query}`).then(async (response) => {
      if (!response.ok) throw new Error("We couldn't load your Google connection. Try again in a moment.");
      return response.json() as Promise<GoogleConnectionData>;
    }).finally(() => {
      if (inFlight.get(key) === pending) inFlight.delete(key);
    });
    inFlight.set(key, pending);
    return pending;
  };
}
