const REVIEW_API_BASE = "https://mybusiness.googleapis.com/v4";

function safeResourceId(value: string, label: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error(`Invalid Google ${label}.`);
  }
  return value;
}

export function googleAccountName(accountId: string): string {
  return `accounts/${safeResourceId(accountId, "account ID")}`;
}

export function parseGoogleAccountName(accountName: string): { accountName: string; accountId: string } {
  const match = /^accounts\/([A-Za-z0-9_-]+)$/.exec(accountName);
  if (!match) throw new Error("Invalid Google account resource name.");
  return { accountName: `accounts/${match[1]}`, accountId: match[1] };
}

export function googleInformationName(locationId: string): string {
  return `locations/${safeResourceId(locationId, "location ID")}`;
}

export function parseGoogleLocationName(locationName: string): {
  accountName: string;
  accountId: string;
  informationName: string;
  locationId: string;
  locationName: string;
} {
  const match = /^accounts\/([A-Za-z0-9_-]+)\/locations\/([A-Za-z0-9_-]+)$/.exec(locationName);
  if (!match) throw new Error("Invalid Google location resource name.");
  return {
    accountName: `accounts/${match[1]}`,
    accountId: match[1],
    informationName: `locations/${match[2]}`,
    locationId: match[2],
    locationName: `accounts/${match[1]}/locations/${match[2]}`,
  };
}

export function googleReviewName(accountName: string, locationId: string, reviewId: string): string {
  const account = parseGoogleAccountName(accountName);
  return `${account.accountName}/locations/${safeResourceId(locationId, "location ID")}/reviews/${safeResourceId(reviewId, "review ID")}`;
}

export function googleReviewsUrl(
  accountName: string,
  locationId: string,
  query?: URLSearchParams | Record<string, string | number | boolean | undefined>
): string {
  const account = parseGoogleAccountName(accountName);
  const location = safeResourceId(locationId, "location ID");
  const params = query instanceof URLSearchParams ? new URLSearchParams(query) : new URLSearchParams();
  if (query && !(query instanceof URLSearchParams)) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) params.set(key, String(value));
    }
  }
  const suffix = params.size ? `?${params.toString()}` : "";
  return `${REVIEW_API_BASE}/${account.accountName}/locations/${location}/reviews${suffix}`;
}

export function googleReviewReplyUrl(accountName: string, locationId: string, reviewId: string): string {
  return `${REVIEW_API_BASE}/${googleReviewName(accountName, locationId, reviewId)}/reply`;
}
