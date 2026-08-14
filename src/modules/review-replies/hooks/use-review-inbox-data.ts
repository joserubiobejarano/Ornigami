"use client";

import { useCallback, useEffect, useState } from "react";
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

type DraftMap = Record<string, string>;

type ReviewSyncResult = {
  posted?: number;
  drafted?: number;
  autoHandled?: number;
  skippedNoComment?: number;
  errors?: string[];
};

type ReviewInboxData = {
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
  const [locations, setLocations] = useState<ReviewLocation[]>([]);
  const [selectedLocation, setSelectedLocation] = useState("");
  const [reviews, setReviews] = useState<Review[]>([]);
  const [drafts, setDrafts] = useState<DraftMap>({});
  const [savedDraftSnapshots, setSavedDraftSnapshots] = useState<DraftMap>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [autoReplyAllReviews, setAutoReplyAllReviews] = useState(false);

  const loadReviews = useCallback(async (locationName = selectedLocation) => {
    if (!locationName) return;

    setLoading(true);
    setError(null);
    try {
      const items = await fetchReviews(locationName);
      const nextDrafts: DraftMap = {};
      for (const item of items) {
        if (typeof item.draft_reply === "string" && item.draft_reply.trim()) {
          nextDrafts[item.google_review_id] = item.draft_reply;
        }
      }
      setDrafts(nextDrafts);
      setReviews(
        items.map((item) => ({
          google_review_id: item.google_review_id,
          reviewer_name: item.reviewer_name,
          star_rating: item.star_rating,
          comment: item.comment,
          status: item.status,
          isSample: item.isSample,
        }))
      );
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "We couldn't load your reviews. Try again in a moment.");
    } finally {
      setLoading(false);
    }
  }, [selectedLocation]);

  const loadLocations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nextLocations = await fetchReviewLocations();
      setLocations(nextLocations);
      setSelectedLocation((current) => current || nextLocations[0]?.locationName || "");
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "We couldn't load your locations. Try again in a moment.");
    } finally {
      setLoading(false);
    }
  }, []);

  const syncReviews = useCallback(async () => {
    if (!selectedLocation) return;

    setSyncing(true);
    setError(null);
    try {
      const response = await fetch("/api/google/reviews/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationName: selectedLocation }),
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
            body: JSON.stringify({ locationName: selectedLocation }),
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
  }, [hasPaidAccess, loadReviews, selectedLocation]);

  useEffect(() => {
    void loadLocations();
  }, [loadLocations]);

  useEffect(() => {
    let cancelled = false;
    void fetchReplySettings().then((settings) => {
      if (!cancelled && settings) setAutoReplyAllReviews(Boolean(settings.autoReplyAllReviews));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setDrafts({});
    setSavedDraftSnapshots({});
    if (selectedLocation) {
      void loadReviews(selectedLocation);
    } else {
      setReviews([]);
    }
  }, [loadReviews, selectedLocation]);

  return {
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
