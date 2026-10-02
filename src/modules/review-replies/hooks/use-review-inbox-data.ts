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
  loading: boolean;
  error: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  syncing: boolean;
  autoReplyAllReviews: boolean;
  loadReviews: (locationName?: string) => Promise<void>;
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
  const [businessId, setBusinessId] = useState<string>();
  const [settingsReady, setSettingsReady] = useState(false);
  const [locations, setLocations] = useState<ReviewLocation[]>([]);
  const [selectedLocation, setSelectedLocation] = useState("");
  const [reviews, setReviews] = useState<Review[]>([]);
  const [drafts, setDrafts] = useState<DraftMap>({});
  const [savedDraftSnapshots, setSavedDraftSnapshots] = useState<DraftMap>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [autoReplyAllReviews, setAutoReplyAllReviews] = useState(false);
  const draftsRef = useRef(drafts);
  const snapshotsRef = useRef(savedDraftSnapshots);
  const reviewsRef = useRef(reviews);
  const loadRequestRef = useRef(0);
  const locationsRequestRef = useRef(0);
  const previousScopeRef = useRef({ businessId, selectedLocation });
  draftsRef.current = drafts;
  snapshotsRef.current = savedDraftSnapshots;
  reviewsRef.current = reviews;

  const loadReviews = useCallback(async (locationName = selectedLocation) => {
    if (!locationName) return;

    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setError(null);
    try {
      const items = await fetchReviews(locationName, businessId);
      const nextDrafts: DraftMap = {};
      const nextSnapshots: DraftMap = {};
      const previousReviews = new Map(reviewsRef.current.map((review) => [review.google_review_id, review]));
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
          baseVersion: previousReviews.get(id)?.draftVersion,
        });
        if (reconciled.draftText !== undefined) nextDrafts[id] = reconciled.draftText;
        if (reconciled.savedSnapshot !== undefined) nextSnapshots[id] = reconciled.savedSnapshot;
        if (reconciled.hasUnsavedLocalText) unsavedIds.add(id);
      }
      if (requestId !== loadRequestRef.current) return;
      setDrafts(nextDrafts);
      setSavedDraftSnapshots(nextSnapshots);
      setReviews(
        items.map((item) => {
          const wasUnsaved = unsavedIds.has(item.google_review_id);
          const previous = previousReviews.get(item.google_review_id);
          return {
            google_review_id: item.google_review_id,
            reviewer_name: item.reviewer_name,
            star_rating: item.star_rating,
            comment: item.comment,
            status: item.status,
            isSample: item.isSample,
            draftState: wasUnsaved ? previous?.draftState : item.draftState,
            draftVersion: wasUnsaved ? previous?.draftVersion : item.draftVersion,
            draftUpdatedAt: wasUnsaved ? previous?.draftUpdatedAt : item.draftUpdatedAt,
          };
        })
      );
    } catch (cause: unknown) {
      if (requestId !== loadRequestRef.current) return;
      setError(cause instanceof Error ? cause.message : "We couldn't load your reviews. Try again in a moment.");
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false);
    }
  }, [businessId, selectedLocation]);

  const loadLocations = useCallback(async () => {
    const requestId = ++locationsRequestRef.current;
    setLoading(true);
    setError(null);
    try {
      const allLocations = await fetchReviewLocations(businessId);
      if (requestId !== locationsRequestRef.current) return;
      const nextLocations = allLocations.filter((location) => location.selected === true);
      setLocations(nextLocations);
      setSelectedLocation((current) => current && nextLocations.some((item) => item.locationName === current)
        ? current
        : nextLocations[0]?.locationName || "");
    } catch (cause: unknown) {
      if (requestId !== locationsRequestRef.current) return;
      setError(cause instanceof Error ? cause.message : "We couldn't load your locations. Try again in a moment.");
    } finally {
      if (requestId === locationsRequestRef.current) setLoading(false);
    }
  }, [businessId]);

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
              toast.warning("Some reviews weren't processed. Try again or post manually.");
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
    if (settingsReady) void loadLocations();
  }, [loadLocations, settingsReady]);

  useEffect(() => {
    let cancelled = false;
    void fetchReplySettings().then((settings) => {
      if (!cancelled) {
        if (settings) {
          setBusinessId(settings.businessId);
          setAutoReplyAllReviews(Boolean(settings.autoReplyAllReviews));
        }
        setSettingsReady(true);
      }
    }).catch(() => {
      if (!cancelled) setSettingsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const previous = previousScopeRef.current;
    const changedLocation = previous.selectedLocation !== selectedLocation;
    const changedBusiness = previous.businessId !== businessId;
    previousScopeRef.current = { businessId, selectedLocation };
    if (changedLocation || changedBusiness) {
      setDrafts({});
      setSavedDraftSnapshots({});
    }
    if (selectedLocation) {
      void loadReviews(selectedLocation);
    } else {
      setReviews([]);
    }
  }, [businessId, loadReviews, selectedLocation]);

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
    loading,
    error,
    setError,
    syncing,
    autoReplyAllReviews,
    loadReviews,
    syncReviews,
  };
}
