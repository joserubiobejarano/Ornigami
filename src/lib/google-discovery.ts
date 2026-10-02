import { googleFetch } from "./google.ts";
import { parseGoogleAccountName, parseGoogleLocationName } from "./google-resources.ts";

const ACCOUNT_API = "https://mybusinessaccountmanagement.googleapis.com/v1/accounts";
const BUSINESS_INFORMATION_API = "https://mybusinessbusinessinformation.googleapis.com/v1";
const ACCOUNT_PAGE_SIZE = 20;
const LOCATION_PAGE_SIZE = 100;
const MAX_PAGES_PER_COLLECTION = 100;
// Caps an entire discovery, including all accounts and locations, at 200 provider requests.
const MAX_DISCOVERY_REQUESTS = 200;
const LOCATION_READ_MASK = "name,title,storeCode,storefrontAddress,metadata,categories";

export type GoogleLocationRecord = {
  locationName: string;
  accountName: string;
  informationName: string;
  title: string;
  storeCode: string | null;
  placeId: string | null;
  reviewUrl: string | null;
  address: unknown | null;
  raw: Record<string, unknown>;
};

type Page = { items: Record<string, unknown>[]; nextPageToken: string | null };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readPage(value: unknown, itemsKey: string, message: string): Page {
  if (!isRecord(value)) throw new Error(message);
  const rawItems = value[itemsKey] ?? [];
  if (!Array.isArray(rawItems) || rawItems.some((item) => !isRecord(item))) throw new Error(message);
  const token = value.nextPageToken;
  if (token !== undefined && (typeof token !== "string" || token.length === 0 || token.length > 8192 || value[itemsKey] === undefined)) throw new Error(message);
  return { items: rawItems as Record<string, unknown>[], nextPageToken: typeof token === "string" ? token : null };
}

async function readGoogleJson(ownerUserId: string, url: string, fetchGoogle: typeof googleFetch): Promise<unknown> {
  const response = await fetchGoogle(ownerUserId, url);
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`Google location discovery failed (${response.status}).`);
  }
  try {
    return await response.json();
  } catch {
    throw new Error("Google returned an invalid discovery response.");
  }
}

async function collectPages(
  ownerUserId: string,
  baseUrl: string,
  itemsKey: string,
  pageSize: number,
  extra: Record<string, string> | undefined,
  fetchGoogle: typeof googleFetch,
  budget: { remaining: number }
): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  const seenTokens = new Set<string>();
  let pageToken: string | null = null;
  for (let pageIndex = 0; pageIndex < MAX_PAGES_PER_COLLECTION; pageIndex += 1) {
    if (budget.remaining <= 0) throw new Error("Google location discovery exceeded the request limit.");
    budget.remaining -= 1;
    const url = new URL(baseUrl);
    url.searchParams.set("pageSize", String(pageSize));
    for (const [key, value] of Object.entries(extra ?? {})) url.searchParams.set(key, value);
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const page = readPage(await readGoogleJson(ownerUserId, url.toString(), fetchGoogle), itemsKey, "Google returned an incomplete discovery page.");
    items.push(...page.items);
    if (!page.nextPageToken) return items;
    if (seenTokens.has(page.nextPageToken)) throw new Error("Google returned a repeated pagination token.");
    seenTokens.add(page.nextPageToken);
    pageToken = page.nextPageToken;
  }
  throw new Error("Google location discovery exceeded the pagination limit.");
}

export function createGoogleLocationDiscovery(fetchGoogle: typeof googleFetch) {
  return async function discoverGoogleLocations(ownerUserId: string): Promise<GoogleLocationRecord[]> {
    const budget = { remaining: MAX_DISCOVERY_REQUESTS };
    const accountRecords = await collectPages(ownerUserId, ACCOUNT_API, "accounts", ACCOUNT_PAGE_SIZE, undefined, fetchGoogle, budget);
    const locations: GoogleLocationRecord[] = [];
    const seenAccounts = new Set<string>();
    const seenLocations = new Set<string>();

    for (const account of accountRecords) {
      if (typeof account.name !== "string") throw new Error("Google returned an invalid account resource.");
      const { accountName, accountId } = parseGoogleAccountName(account.name);
      if (seenAccounts.has(accountName)) continue;
      seenAccounts.add(accountName);
      const locationBase = `${BUSINESS_INFORMATION_API}/accounts/${encodeURIComponent(accountId)}/locations`;
      const locationRecords = await collectPages(ownerUserId, locationBase, "locations", LOCATION_PAGE_SIZE, {
        readMask: LOCATION_READ_MASK,
      }, fetchGoogle, budget);

      for (const location of locationRecords) {
        if (typeof location.name !== "string") throw new Error("Google returned an invalid location resource.");
        const locationId = location.name.startsWith("locations/") ? location.name.slice("locations/".length) : "";
        const canonical = parseGoogleLocationName(`${accountName}/${location.name}`);
        if (canonical.locationId !== locationId) throw new Error("Google returned an invalid location resource.");
        if (seenLocations.has(canonical.locationName)) continue;
        seenLocations.add(canonical.locationName);
        const metadata = isRecord(location.metadata) ? location.metadata : {};
        locations.push({
          locationName: canonical.locationName,
          accountName,
          informationName: canonical.informationName,
          title: typeof location.title === "string" ? location.title : "",
          storeCode: typeof location.storeCode === "string" ? location.storeCode : null,
          placeId: typeof metadata.placeId === "string" ? metadata.placeId : null,
          reviewUrl: typeof metadata.newReviewUri === "string" ? metadata.newReviewUri : null,
          address: location.storefrontAddress ?? null,
          raw: location,
        });
      }
    }

    return locations;
  };
}

export const discoverGoogleLocations = createGoogleLocationDiscovery(googleFetch);
