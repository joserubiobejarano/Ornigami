"use client";

import { useEffect, useMemo, useState } from "react";

import {
  DashboardCallout,
  DashboardEmptyState,
  DashboardPage,
  DashboardPageHeader,
} from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { cn } from "@/lib/utils";
import { nativeSelectClassName } from "@/lib/form-controls";
import { useCurrentPlan } from "@/lib/use-current-plan";
import { isPaidUser, isTrialing } from "@/lib/plan";
import { UpgradeBanner, PlanGateModal } from "@/components/PlanGate";
import { toast } from "sonner";
import { ReviewList } from "@/components/reviews/review-list";
import {
  getReviewWorkflowDisplay,
  shouldShowTestWorkflowActions,
  type Review,
  type ReviewApiRow,
} from "@/components/reviews/review-workflow";

type Location = { name: string; title?: string };

function mapSyncError(raw: unknown): string {
  if (raw && typeof raw === "object" && "error" in raw && typeof raw.error === "string") {
    const msg = raw.error.toLowerCase();
    if (msg.includes("location not found")) return "No locations were found for this account.";
    if (msg.includes("no google connection")) return "Google connection failed. Please try again.";
    return raw.error;
  }
  return "Review sync failed. Please try again.";
}

function ReviewsPageContent() {
  const { planStatus, planInfo } = useCurrentPlan();
  const hasPaidAccess = isPaidUser(planStatus) || isTrialing(planStatus);
  const [showPlanGateModal, setShowPlanGateModal] = useState(false);

  const NO_CONNECTED_MSG =
    "No connected Google Business Profile yet. Connect your account to load locations and reviews.";
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLoc, setSelectedLoc] = useState<string>("");
  const [reviews, setReviews] = useState<Review[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  /** Last text snapshot when user clicked Save draft (per review id). */
  const [savedDraftSnapshots, setSavedDraftSnapshots] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [autoReplyAllReviews, setAutoReplyAllReviews] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/settings/reply")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { autoReplyAllReviews?: boolean } | null) => {
        if (!cancelled && d && typeof d.autoReplyAllReviews === "boolean") {
          setAutoReplyAllReviews(d.autoReplyAllReviews);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load locations on mount
  useEffect(() => {
    void loadLocations();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only location bootstrap
  }, []);

  // Load reviews when location changes
  useEffect(() => {
    if (selectedLoc) {
      setDrafts({});
      setSavedDraftSnapshots({});
      void loadReviews();
    } else {
      setReviews([]);
      setDrafts({});
      setSavedDraftSnapshots({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tied to selected location only
  }, [selectedLoc]);

  function handleConnectGoogle() {
    window.location.href = "/api/google/oauth/start";
  }

  async function loadLocations() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/google/locations/list");
      if (!r.ok) {
        if (r.status === 401) {
          setError(NO_CONNECTED_MSG);
        } else {
          setError("Failed to load locations");
        }
        return;
      }
      const j = await r.json();
      if (j.locations) {
        setLocations(j.locations);
        if (j.locations.length > 0 && !selectedLoc) {
          setSelectedLoc(j.locations[0].locationName);
        }
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load locations");
    } finally {
      setLoading(false);
    }
  }

  async function syncReviews() {
    if (!selectedLoc) return;

    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/google/reviews/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationName: selectedLoc }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(mapSyncError(body));
      }

      // Reload reviews after sync
      await loadReviews();

      let message = "Reviews synced successfully.";
      if (hasPaidAccess) {
        try {
          const processRes = await fetch("/api/google/reviews/process-pending", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ locationName: selectedLoc }),
          });
          if (processRes.ok) {
            const pj = (await processRes.json()) as {
              posted?: number;
              drafted?: number;
              autoHandled?: number;
              errors?: string[];
            };
            await loadReviews();
            const autoN =
              typeof pj.autoHandled === "number" && pj.autoHandled > 0 ? pj.autoHandled : 0;
            if (autoN > 0) {
              message = `${autoN} review${autoN === 1 ? "" : "s"} automatically handled`;
            } else {
              const bits: string[] = [];
              if (typeof pj.drafted === "number" && pj.drafted > 0) {
                bits.push(`${pj.drafted} saved as drafts`);
              }
              if (bits.length) message += ` ${bits.join(", ")}.`;
            }
            if (Array.isArray(pj.errors) && pj.errors.length > 0) {
              toast.warning("Some reviews could not be processed. Try again or post manually.");
            }
          }
        } catch {
          /* keep base success message */
        }
      }
      toast.success(message);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Review sync failed. Please try again.";
      setError(message);
      toast.error(message);
    } finally {
      setSyncing(false);
    }
  }

  async function loadReviews() {
    if (!selectedLoc) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reviews?loc=${encodeURIComponent(selectedLoc)}`);
      if (!res.ok) {
        throw new Error("Failed to load reviews");
      }
      const js = await res.json();
      if (Array.isArray(js.items)) {
        const items = js.items as ReviewApiRow[];
        const nextDrafts: Record<string, string> = {};
        for (const it of items) {
          if (typeof it.draft_reply === "string" && it.draft_reply.trim()) {
            nextDrafts[it.google_review_id] = it.draft_reply;
          }
        }
        setDrafts(nextDrafts);
        setReviews(
          items.map((it) => ({
            google_review_id: it.google_review_id,
            reviewer_name: it.reviewer_name,
            star_rating: it.star_rating,
            comment: it.comment,
            status: it.status,
            isSample: it.isSample,
          }))
        );
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load reviews");
    } finally {
      setLoading(false);
    }
  }

  async function generate(review: Review) {
    const body = review.isSample
      ? {
          businessName: "My Business",
          city: "Local",
          rating: Math.min(5, Math.max(1, Number(review.star_rating) || 5)),
          text: review.comment || "",
        }
      : {
          reviewText: review.comment || "",
          businessName: "",
          city: "",
          rating: Math.min(5, Math.max(1, Number(review.star_rating) || 5)),
        };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(review.isSample ? { "x-sample-review": "true" } : {}),
    };

    const r = await fetch("/api/openai/review-reply", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    let j: { reply?: string; markdown?: string; text?: string; error?: string } = {};
    try {
      j = await r.json();
    } catch {
      // non-JSON response
    }

    if (!r.ok) {
      const message = j?.error ?? `Generate failed (${r.status})`;
      toast.error(message);
      return;
    }

    const replyText = j.reply ?? j.markdown ?? j.text ?? "";
    setDrafts((d) => ({ ...d, [review.google_review_id]: replyText }));

    if (review.isSample) {
      toast.success(
        "Reply generated. Review below, save as draft, then mark as posted (test mode) when final."
      );
    } else {
      if (!selectedLoc) {
        toast.error("Select a location before saving or posting a reply.");
        return;
      }
      try {
        if (autoReplyAllReviews && hasPaidAccess) {
          const pr = await fetch("/api/google/replies", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              reviewId: review.google_review_id,
              locationName: selectedLoc,
              reply: replyText,
            }),
          });
          if (pr.ok) {
            setSavedDraftSnapshots((s) => ({ ...s, [review.google_review_id]: replyText }));
            await loadReviews();
            toast.success("Reply generated and posted to Google.");
          } else {
            const dr = await fetch("/api/reviews/draft", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ reviewId: review.google_review_id, reply: replyText }),
            });
            if (dr.ok) {
              setSavedDraftSnapshots((s) => ({ ...s, [review.google_review_id]: replyText }));
            }
            toast.success(
              "Reply generated. Could not post to Google , saved as draft. Edit or post manually when ready."
            );
          }
        } else {
          const dr = await fetch("/api/reviews/draft", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reviewId: review.google_review_id, reply: replyText }),
          });
          if (!dr.ok) {
            toast.error("Reply generated but could not save draft. Try again.");
            return;
          }
          setSavedDraftSnapshots((s) => ({ ...s, [review.google_review_id]: replyText }));
          toast.success(
            autoReplyAllReviews && !hasPaidAccess
              ? "Reply generated and saved as draft. Upgrade to post replies to Google automatically."
              : "Reply generated and saved as draft."
          );
        }
      } catch {
        toast.error("Could not save or post reply. Try again.");
      }
    }
  }

  async function post(review: Review) {
    const reply = drafts[review.google_review_id];
    if (!reply?.trim() || !selectedLoc) {
      toast.error("Write or generate a reply before posting.");
      return;
    }

    const r = await fetch("/api/google/replies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reviewId: review.google_review_id,
        locationName: selectedLoc,
        reply,
      }),
    });

    if (r.ok) {
      await loadReviews();
      toast.success("Reply posted successfully");
    } else {
      toast.error("Failed to post reply");
    }
  }

  function saveTestDraft(review: Review) {
    if (!shouldShowTestWorkflowActions(review, false)) return;
    const text = drafts[review.google_review_id] ?? "";
    if (!text.trim()) {
      toast.error("Nothing to save yet , generate a reply or type your draft first.");
      return;
    }
    setSavedDraftSnapshots((s) => ({
      ...s,
      [review.google_review_id]: text,
    }));
    toast.success(
      "Draft saved. Mark as posted (test mode) when this reply is final, or keep editing."
    );
  }

  function markAsPostedTest(review: Review) {
    if (!shouldShowTestWorkflowActions(review, false)) return;
    const reply = drafts[review.google_review_id];
    if (!reply?.trim()) {
      toast.error("Add or generate a reply first.");
      return;
    }
    setReviews((prev) =>
      prev.map((r) =>
        r.google_review_id === review.google_review_id ? { ...r, status: "replied" } : r
      )
    );
    setSavedDraftSnapshots((s) => ({
      ...s,
      [review.google_review_id]: reply,
    }));
    toast.success(
      "Marked as posted (test mode). This review is handled , no further action needed for this test session."
    );
  }

  const isSampleMode = reviews.length > 0 && reviews.every((r) => r.isSample);
  const displayLocations = locations;
  const hasRealLocations = locations.length > 0;

  // Keep one sample review expanded; default to first when list changes
  useEffect(() => {
    if (isSampleMode && reviews.length > 0) {
      const ids = reviews.map((r) => r.google_review_id);
      setExpandedId((prev) => (prev && ids.includes(prev) ? prev : ids[0]));
    } else {
      setExpandedId(null);
    }
  }, [isSampleMode, reviews]);

  const isNoConnectedOnly = error === NO_CONNECTED_MSG;

  const reviewSummary = useMemo(() => {
    let unanswered = 0;
    let draftsActive = 0;
    let posted = 0;
    for (const rv of reviews) {
      const draftText = drafts[rv.google_review_id] ?? "";
      const { workflow } = getReviewWorkflowDisplay(rv, draftText, savedDraftSnapshots, false);
      if (workflow === "unanswered") unanswered += 1;
      else if (workflow === "posted") posted += 1;
      else draftsActive += 1;
    }
    return { total: reviews.length, unanswered, drafts: draftsActive, posted };
  }, [reviews, drafts, savedDraftSnapshots]);

  return (
    <DashboardPage width="md" className="space-y-8">
      <DashboardPageHeader
        title="Reviews"
        description="Sync reviews from Google Business Profile, we generate the replies and post them to Google or save them in drafts."
      />

      <div className="space-y-3">
        {!hasRealLocations && !loading && (
          <DashboardCallout
            variant="neutral"
            action={
              <Button type="button" size="sm" onClick={handleConnectGoogle}>
                Connect Google Business Profile
              </Button>
            }
          >
            <p className="text-foreground">
              Connect Google Business Profile and sync locations in Settings to load your review inbox.
            </p>
          </DashboardCallout>
        )}

        {isSampleMode && (
          <DashboardCallout variant="neutral" title="Test mode , sample reviews">
            <p className="text-foreground">
              This is a demo. In live mode, replies are posted to your Google Business Profile
              automatically.
            </p>
            <p className="text-foreground mt-2">
              Sample reviews for internal testing. These are not live Google reviews.
            </p>
          </DashboardCallout>
        )}

        {planInfo && hasPaidAccess && (
          <UpgradeBanner planStatus={planStatus} currentPeriodEnd={planInfo.currentPeriodEnd} />
        )}

        {error && isNoConnectedOnly && (
          <DashboardCallout variant="neutral">
            <p className="text-foreground">{error}</p>
          </DashboardCallout>
        )}
        {error && !isNoConnectedOnly && (
          <DashboardCallout variant="error">
            <p>{error}</p>
          </DashboardCallout>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <select
          className={cn(nativeSelectClassName, "min-w-[200px] sm:min-w-[220px] sm:max-w-md sm:flex-1")}
          value={selectedLoc}
          onChange={(e) => setSelectedLoc(e.target.value)}
          disabled={loading}
        >
          <option value="">Select a location</option>
          {displayLocations.map((l) => (
            <option key={l.name} value={l.name}>
              {l.title || l.name}
            </option>
          ))}
        </select>

        <Button
          onClick={() => {
            if (!hasPaidAccess) {
              setShowPlanGateModal(true);
              return;
            }
            syncReviews();
          }}
          disabled={!selectedLoc || syncing || loading}
          title={!hasPaidAccess ? "Premium feature" : undefined}
        >
          {syncing ? "Syncing..." : "Sync reviews now"}
        </Button>
      </div>

      {reviews.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-xs text-foreground"
          aria-live="polite"
        >
          <span className="font-semibold text-foreground">Summary</span>
          <Badge variant="outline" className="font-normal tabular-nums">
            Loaded {reviewSummary.total}
          </Badge>
          <Badge variant="outline" className="font-normal tabular-nums">
            Unanswered {reviewSummary.unanswered}
          </Badge>
          <Badge variant="outline" className="font-normal tabular-nums">
            Drafts {reviewSummary.drafts}
          </Badge>
          <Badge variant="outline" className="font-normal tabular-nums">
            Posted {reviewSummary.posted}
          </Badge>
        </div>
      )}

      {loading && reviews.length === 0 && (
        <div className="rounded-xl border border-border bg-card px-6 py-12 text-center text-sm text-foreground shadow-sm">
          <p>Loading reviewsâ€¦</p>
        </div>
      )}

      {!loading && reviews.length === 0 && (
        <DashboardEmptyState
          title="No reviews yet"
          description="Connect Google Business Profile, then sync locations in Settings to load your review inbox."
        >
          <Button type="button" onClick={handleConnectGoogle}>
            Connect Google Business Profile
          </Button>
        </DashboardEmptyState>
      )}

      <ReviewList
        reviews={reviews}
        drafts={drafts}
        savedDraftSnapshots={savedDraftSnapshots}
        isDemo={false}
        isSampleMode={isSampleMode}
        expandedId={expandedId}
        onExpandedIdChange={setExpandedId}
        onDraftChange={(reviewId, text) =>
          setDrafts((d) => ({ ...d, [reviewId]: text }))
        }
        onGenerate={(rv) => {
          if (!hasPaidAccess && !rv.isSample) {
            setShowPlanGateModal(true);
            return;
          }
          void generate(rv);
        }}
        onPost={(rv) => {
          if (!hasPaidAccess) {
            setShowPlanGateModal(true);
            return;
          }
          void post(rv);
        }}
        onSaveTestDraft={saveTestDraft}
        onMarkPostedTest={markAsPostedTest}
        hasPaidAccess={hasPaidAccess}
      />

      <PlanGateModal
        open={showPlanGateModal}
        onOpenChange={setShowPlanGateModal}
        featureName="Syncing reviews from Google Business Profile, AI reply drafts, and posting replies"
      />
    </DashboardPage>
  );
}

export default function ReviewsPage() {
  return <ReviewsPageContent />;
}


