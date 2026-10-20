"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  fetchReplySettings,
  fetchReviewLocations,
  fetchReviews,
} from "@/modules/review-replies/services/review-replies-api.service";
import type {
  Review,
  ReviewLocation,
} from "@/modules/review-replies/types/review.types";
import { reconcileReviewDraft } from "@/components/reviews/review-workflow";

type DraftMap = Record<string, string>;
type DraftScopeCache = {
  drafts: DraftMap;
  snapshots: DraftMap;
  metadata: Record<string, Pick<Review, "draftState" | "draftVersion" | "draftUpdatedAt">>;
};
type LocationReadResult = { requestId: number; locations: ReviewLocation[] | null; error: string | null };

const draftScopeKey = (businessId: string | undefined, location: string) => JSON.stringify([businessId ?? null, location]);

type ReviewSyncResult = {
  posted?: number;
  drafted?: number;
  autoHandled?: number;
  skippedNoComment?: number;
  errors?: string[];
};

type ReviewInboxData = {
  businessId: string | undefined;
  locations: ReviewLocation[];
  selectedLocation: string;
  setSelectedLocation: (locationName: string) => void;
  reviews: Review[];
  setReviews: React.Dispatch<React.SetStateAction<Review[]>>;
  drafts: DraftMap;
  setDrafts: React.Dispatch<React.SetStateAction<DraftMap>>;
  savedDraftSnapshots: DraftMap;
  setSavedDraftSnapshots: React.Dispatch<React.SetStateAction<DraftMap>>;
  rememberDraftMetadata: (reviewId: string, metadata: Pick<Review, "draftState" | "draftVersion" | "draftUpdatedAt">, scope?: { businessId?: string; location: string }, savedReply?: string | null) => void;
  loading: boolean;
  pageLoading: boolean;
  hasPrevious: boolean;
  hasMore: boolean;
  error: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  syncing: boolean;
  autoReplyAllReviews: boolean;
  isOwner: boolean;
  loadReviews: (locationName?: string) => Promise<void>;
  loadLocations: () => Promise<void>;
  loadFirstReviews: () => Promise<void>;
  loadNextReviews: () => Promise<void>;
  loadPreviousReviews: () => Promise<void>;
  syncReviews: () => Promise<void>;
};

function mapSyncError(raw: unknown): string {
  if (raw && typeof raw === "object" && "error" in raw && typeof raw.error === "string") {
    const msg = raw.error.toLowerCase();
    if (msg.includes("location not found")) return "No locations were found for this account.";
    if (msg.includes("no google connection")) return "Google connection failed. Please try again.";
    return raw.error;
  }
  return "Review sync failed. Please try again.";
}

export function useReviewInboxData(hasPaidAccess: boolean): ReviewInboxData {
  const [businessId, setBusinessIdState] = useState<string>();
  const [settingsReady, setSettingsReady] = useState(false);
  const [initialBootstrapReady, setInitialBootstrapReady] = useState(false);
  const [initialLoadReadyState, setInitialLoadReady] = useState(false);
  const [locations, setLocations] = useState<ReviewLocation[]>([]);
  const [selectedLocation, setSelectedLocationState] = useState("");
  const [reviews, setReviewsState] = useState<Review[]>([]);
  const [drafts, setDraftsState] = useState<DraftMap>({});
  const [savedDraftSnapshots, setSavedDraftSnapshotsState] = useState<DraftMap>({});
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(false);
  const [hasPrevious, setHasPrevious] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [autoReplyAllReviews, setAutoReplyAllReviews] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const draftsRef = useRef<DraftMap>({});
  const snapshotsRef = useRef<DraftMap>({});
  const reviewsRef = useRef<Review[]>([]);
  const loadRequestRef = useRef(0);
  const nextCursorRef = useRef<string | null>(null);
  const currentCursorRef = useRef<string | null>(null);
  const pageCursorsRef = useRef<(string | null)[]>([null]);
  const pageIndexRef = useRef(0);
  const draftMetadataRef = useRef<Record<string, Pick<Review, "draftState" | "draftVersion" | "draftUpdatedAt">>>({});
  const draftScopesRef = useRef(new Map<string, DraftScopeCache>());
  const activeScopeRef = useRef({ businessId, selectedLocation });
  const locationsRequestRef = useRef(0);
  const previousScopeRef = useRef({ businessId, selectedLocation });

  const setBusinessId = useCallback((nextBusinessId: string | undefined) => {
    if (nextBusinessId !== activeScopeRef.current.businessId) {
      activeScopeRef.current = { ...activeScopeRef.current, businessId: nextBusinessId };
      loadRequestRef.current += 1;
      setLoading(false);
      setPageLoading(false);
      reviewsRef.current = [];
      setReviewsState([]);
    }
    setBusinessIdState(nextBusinessId);
  }, []);

  const setSelectedLocation = useCallback((update: React.SetStateAction<string>) => {
    const nextLocation = typeof update === "function" ? update(activeScopeRef.current.selectedLocation) : update;
    if (nextLocation !== activeScopeRef.current.selectedLocation) {
      activeScopeRef.current = { ...activeScopeRef.current, selectedLocation: nextLocation };
      loadRequestRef.current += 1;
      nextCursorRef.current = null;
      currentCursorRef.current = null;
      pageCursorsRef.current = [null];
      pageIndexRef.current = 0;
      setLoading(false);
      setPageLoading(false);
      reviewsRef.current = [];
      setReviewsState([]);
    }
    setSelectedLocationState(nextLocation);
  }, []);

  const setDrafts = useCallback((update: React.SetStateAction<DraftMap>) => {
    const nextDrafts = typeof update === "function" ? update(draftsRef.current) : update;
    draftsRef.current = nextDrafts;
    setDraftsState(nextDrafts);
  }, []);

  const setSavedDraftSnapshots = useCallback((update: React.SetStateAction<DraftMap>) => {
    const nextSnapshots = typeof update === "function" ? update(snapshotsRef.current) : update;
    snapshotsRef.current = nextSnapshots;
    setSavedDraftSnapshotsState(nextSnapshots);
  }, []);

  const setReviews = useCallback((update: React.SetStateAction<Review[]>) => {
    const nextReviews = typeof update === "function" ? update(reviewsRef.current) : update;
    reviewsRef.current = nextReviews;
    setReviewsState(nextReviews);
  }, []);

  const initialLoadReady = initialLoadReadyState || (!selectedLocation && settingsReady && initialBootstrapReady);

  const rememberDraftMetadata = useCallback((
    reviewId: string,
    metadata: Pick<Review, "draftState" | "draftVersion" | "draftUpdatedAt">,
    scope: { businessId?: string; location: string } = { businessId: activeScopeRef.current.businessId, location: activeScopeRef.current.selectedLocation },
    savedReply?: string | null,
  ) => {
    const key = draftScopeKey(scope.businessId, scope.location);
    if (key === draftScopeKey(activeScopeRef.current.businessId, activeScopeRef.current.selectedLocation)) {
      draftMetadataRef.current[reviewId] = metadata;
      if (savedReply === null) {
        delete draftsRef.current[reviewId];
        delete snapshotsRef.current[reviewId];
      } else if (savedReply !== undefined) {
        const hasUnsaved = Object.hasOwn(draftsRef.current, reviewId) && draftsRef.current[reviewId] !== snapshotsRef.current[reviewId];
        snapshotsRef.current = { ...snapshotsRef.current, [reviewId]: savedReply };
        if (!hasUnsaved) draftsRef.current = { ...draftsRef.current, [reviewId]: savedReply };
      }
      return;
    }
    const cached = draftScopesRef.current.get(key) ?? { drafts: {}, snapshots: {}, metadata: {} };
    cached.metadata[reviewId] = metadata;
    if (savedReply === null) {
      delete cached.drafts[reviewId];
      delete cached.snapshots[reviewId];
    } else if (savedReply !== undefined) {
      const hasUnsaved = Object.hasOwn(cached.drafts, reviewId) && cached.drafts[reviewId] !== cached.snapshots[reviewId];
      cached.snapshots[reviewId] = savedReply;
      if (!hasUnsaved) cached.drafts[reviewId] = savedReply;
    }
    draftScopesRef.current.set(key, cached);
  }, []);

  const loadReviewPage = useCallback(async (locationName: string, cursor: string | null, direction: "reset" | "next" | "previous" | "refresh") => {
    if (!locationName) return;

    const requestId = ++loadRequestRef.current;
    setPageLoading(true);
    if (reviewsRef.current.length === 0) setLoading(true);
    setError(null);
    try {
      const result = await fetchReviews(locationName, businessId, cursor);
      const items = result.items;
      // Text and baselines are scoped to the selected business/location and survive page changes.
      const nextDrafts: DraftMap = { ...draftsRef.current };
      const nextSnapshots: DraftMap = { ...snapshotsRef.current };
      const unsavedIds = new Set<string>();
      for (const item of items) {
        const savedReply = item.draftReply ?? item.draft_reply;
        const id = item.google_review_id;
        const reconciled = reconcileReviewDraft({
          hasLocalText: Object.hasOwn(draftsRef.current, id),
          localText: draftsRef.current[id],
          savedSnapshot: snapshotsRef.current[id],
          remoteText: savedReply,
          remoteVersion: item.draftVersion,
          baseVersion: draftMetadataRef.current[id]?.draftVersion,
        });
        if (reconciled.draftText !== undefined) nextDrafts[id] = reconciled.draftText;
        else if (!reconciled.hasUnsavedLocalText) delete nextDrafts[id];
        if (reconciled.savedSnapshot !== undefined) nextSnapshots[id] = reconciled.savedSnapshot;
        else if (!reconciled.hasUnsavedLocalText) delete nextSnapshots[id];
        if (reconciled.hasUnsavedLocalText) unsavedIds.add(id);
      }
      if (requestId !== loadRequestRef.current) return;
      if (direction === "reset") {
        pageCursorsRef.current = [null];
        pageIndexRef.current = 0;
      } else if (direction === "next") {
        pageCursorsRef.current = [...pageCursorsRef.current.slice(0, pageIndexRef.current + 1), cursor];
        pageIndexRef.current += 1;
      } else if (direction === "previous") {
        pageIndexRef.current = Math.max(0, pageIndexRef.current - 1);
      }
      currentCursorRef.current = cursor;
      nextCursorRef.current = result.page.nextCursor;
      setHasMore(result.page.hasMore);
      setHasPrevious(pageIndexRef.current > 0);
      setDrafts(nextDrafts);
      setSavedDraftSnapshots(nextSnapshots);
      const mappedItems = items.map((item) => {
        const id = item.google_review_id;
        const wasUnsaved = unsavedIds.has(id);
        const cached = draftMetadataRef.current[id];
        const metadata = {
          draftState: wasUnsaved ? cached?.draftState : item.draftState,
          draftVersion: wasUnsaved ? cached?.draftVersion : item.draftVersion,
          draftUpdatedAt: wasUnsaved ? cached?.draftUpdatedAt : item.draftUpdatedAt,
        };
        draftMetadataRef.current[id] = metadata;
        return {
            google_review_id: item.google_review_id,
            reviewer_name: item.reviewer_name,
            star_rating: item.star_rating,
            comment: item.comment,
            status: item.status,
            review_update_time: item.review_update_time,
            isSample: item.isSample,
            ...metadata,
            postRecoveryStatus: item.postRecoveryStatus ?? null,
        };
      });
      const visibleIds = new Set(items.map((item) => item.google_review_id));
      for (const id of Object.keys(draftMetadataRef.current)) {
        if (!visibleIds.has(id) && (!Object.hasOwn(nextDrafts, id) || nextDrafts[id] === nextSnapshots[id])) {
          delete nextDrafts[id];
          delete nextSnapshots[id];
          delete draftMetadataRef.current[id];
        }
      }
      setDrafts(nextDrafts);
      setSavedDraftSnapshots(nextSnapshots);
      setReviews(mappedItems);
    } catch (cause: unknown) {
      if (requestId !== loadRequestRef.current) return;
      setError(cause instanceof Error ? cause.message : "We couldn't load your reviews. Try again in a moment.");
    } finally {
      if (requestId === loadRequestRef.current) {
        setLoading(false);
        setPageLoading(false);
        setInitialLoadReady(true);
      }
    }
  }, [businessId, setDrafts, setReviews, setSavedDraftSnapshots]);

  const loadReviews = useCallback(async (locationName = selectedLocation) => {
    return loadReviewPage(locationName, currentCursorRef.current, "refresh");
  }, [loadReviewPage, selectedLocation]);

  const loadFirstReviews = useCallback(async () => {
    return loadReviewPage(selectedLocation, null, "reset");
  }, [loadReviewPage, selectedLocation]);

  const loadNextReviews = useCallback(async () => {
    if (!selectedLocation || !nextCursorRef.current || pageLoading) return;
    return loadReviewPage(selectedLocation, nextCursorRef.current, "next");
  }, [loadReviewPage, pageLoading, selectedLocation]);

  const loadPreviousReviews = useCallback(async () => {
    if (!selectedLocation || pageIndexRef.current === 0 || pageLoading) return;
    const cursor = pageCursorsRef.current[pageIndexRef.current - 1] ?? null;
    return loadReviewPage(selectedLocation, cursor, "previous");
  }, [loadReviewPage, pageLoading, selectedLocation]);

  const requestLocations = useCallback(async (scopeBusinessId?: string): Promise<LocationReadResult> => {
    const requestId = ++locationsRequestRef.current;
    try {
      // This endpoint resolves the caller's authorized default business scope.
      // Settings and locations can load together; scoped review operations still
      // wait for settings and send its explicit businessId.
      const allLocations = await fetchReviewLocations(scopeBusinessId);
      return { requestId, locations: allLocations.filter((location) => location.selected === true), error: null };
    } catch (cause: unknown) {
      return {
        requestId,
        locations: null,
        error: cause instanceof Error ? cause.message : "We couldn't load your locations. Try again in a moment.",
      };
    }
  }, []);
  const applyLocationRead = useCallback((result: LocationReadResult) => {
    if (result.requestId !== locationsRequestRef.current) return;
    const locations = result.locations;
    if (!locations) {
      setError(result.error ?? "We couldn't load your locations. Try again in a moment.");
      return;
    }
    setError(null);
    setLocations(locations);
    setSelectedLocation((current) => current && locations.some((item) => item.locationName === current)
      ? current
      : locations[0]?.locationName || "");
  }, [setSelectedLocation]);
  const loadLocations = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await requestLocations(businessId);
    if (result.requestId !== locationsRequestRef.current) return;
    applyLocationRead(result);
    setLoading(false);
  }, [applyLocationRead, businessId, requestLocations]);

  const syncReviews = useCallback(async () => {
    if (!selectedLocation) return;

    setSyncing(true);
    setError(null);
    try {
      const response = await fetch("/api/google/reviews/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(businessId ? { businessId } : {}), locationName: selectedLocation }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(mapSyncError(body));
      }

      await loadReviews(selectedLocation);
      let message = "Reviews synced successfully.";

      if (hasPaidAccess) {
        try {
          const processResponse = await fetch("/api/google/reviews/process-pending", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...(businessId ? { businessId } : {}), locationName: selectedLocation }),
          });
          if (processResponse.ok) {
            const result = (await processResponse.json()) as ReviewSyncResult;
            await loadReviews(selectedLocation);
            const autoHandled = typeof result.autoHandled === "number" && result.autoHandled > 0
              ? result.autoHandled
              : 0;
            if (autoHandled > 0) {
              message = `${autoHandled} review${autoHandled === 1 ? "" : "s"} automatically handled`;
            } else {
              const details: string[] = [];
              if (typeof result.drafted === "number" && result.drafted > 0) {
                details.push(`${result.drafted} saved as drafts`);
              }
              if (typeof result.skippedNoComment === "number" && result.skippedNoComment > 0) {
                details.push(`${result.skippedNoComment} star-only review${result.skippedNoComment === 1 ? "" : "s"} skipped`);
              }
              if (details.length) message += ` ${details.join(", ")}.`;
            }
            if (Array.isArray(result.errors) && result.errors.length > 0) {
              toast.warning("Some reviews weren't processed. Refresh the inbox and check each saved status before taking action.");
            }
          }
        } catch {
          // Keep the base success message when optional processing fails.
        }
      }
      toast.success(message);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Review sync failed. Please try again.");
    } finally {
      setSyncing(false);
    }
  }, [businessId, hasPaidAccess, loadReviews, selectedLocation]);

  useEffect(() => {
    let cancelled = false;
    // Start both reads together. If locations fail before settings has created
    // a first workspace, retry once with the now-known explicit business scope.
    const initialLocations = requestLocations();
    const initialLocationsRequest = locationsRequestRef.current;
    void initialLocations.then((result) => {
      if (!cancelled) applyLocationRead(result);
    });
    void (async () => {
      try {
        const settings = await fetchReplySettings();
        if (cancelled) return;
        if (settings) {
          setBusinessId(settings.businessId);
          setAutoReplyAllReviews(Boolean(settings.autoReplyAllReviews));
          setIsOwner(Boolean(settings.isOwner || settings.role === "owner"));
        }
        setSettingsReady(true);
        const locationsResult = await initialLocations;
        if (settings?.businessId && !locationsResult.locations && !cancelled &&
          locationsRequestRef.current === initialLocationsRequest) {
          setError(null);
          applyLocationRead(await requestLocations(settings.businessId));
        }
        if (!cancelled) setInitialBootstrapReady(true);
      } catch {
        await initialLocations;
        if (!cancelled) {
          setSettingsReady(true);
          setInitialBootstrapReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
      locationsRequestRef.current += 1;
    };
  }, [applyLocationRead, requestLocations, setBusinessId]);

  useEffect(() => {
    const previous = previousScopeRef.current;
    const changedLocation = previous.selectedLocation !== selectedLocation;
    const changedBusiness = previous.businessId !== businessId;
    previousScopeRef.current = { businessId, selectedLocation };
    if (changedLocation || changedBusiness) {
      if (previous.selectedLocation) {
        draftScopesRef.current.set(draftScopeKey(previous.businessId, previous.selectedLocation), {
          drafts: { ...draftsRef.current },
          snapshots: { ...snapshotsRef.current },
          metadata: { ...draftMetadataRef.current },
        });
      }
      const restored = selectedLocation
        ? draftScopesRef.current.get(draftScopeKey(businessId, selectedLocation))
        : undefined;
      loadRequestRef.current += 1;
      nextCursorRef.current = null;
      currentCursorRef.current = null;
      pageCursorsRef.current = [null];
      pageIndexRef.current = 0;
      draftMetadataRef.current = restored?.metadata ?? {};
      setHasPrevious(false);
      setHasMore(false);
      draftsRef.current = restored?.drafts ?? {};
      snapshotsRef.current = restored?.snapshots ?? {};
      reviewsRef.current = [];
      setDrafts(draftsRef.current);
      setSavedDraftSnapshots(snapshotsRef.current);
      setReviews([]);
    }
    if (selectedLocation && settingsReady) {
      void loadReviews(selectedLocation);
    } else if (!selectedLocation) {
      loadRequestRef.current += 1;
    }
  }, [businessId, loadReviews, selectedLocation, setDrafts, setReviews, setSavedDraftSnapshots, settingsReady]);

  return {
    businessId,
    locations,
    selectedLocation,
    setSelectedLocation,
    reviews,
    setReviews,
    drafts,
    setDrafts,
    savedDraftSnapshots,
    setSavedDraftSnapshots,
    rememberDraftMetadata,
    loading: loading || !initialLoadReady,
    error,
    setError,
    syncing,
    pageLoading,
    hasPrevious,
    hasMore,
    autoReplyAllReviews,
    isOwner,
    loadReviews,
    loadLocations,
    loadFirstReviews,
    loadNextReviews,
    loadPreviousReviews,
    syncReviews,
  };
}
