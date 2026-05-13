"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";

import { ReviewList } from "@/components/reviews/review-list";
import {
  getReviewWorkflowDisplay,
  shouldShowTestWorkflowActions,
  type Review,
} from "@/components/reviews/review-workflow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { nativeSelectClassName } from "@/lib/form-controls";
import {
  DEMO_BUSINESS_TYPE_OPTIONS,
  getDemoDataset,
  hydrateDemoDataset,
  type DemoBusinessType,
} from "@/lib/demo-review-datasets";
import {
  DEMO_LIMITS,
  DEMO_STORAGE_KEYS,
  incrementDemoUsage,
  checkDemoLimit,
} from "@/lib/demo";
import { DashboardCallout } from "@/components/dashboard";
import { DashboardTopNav } from "@/components/dashboard/top-nav";
import { ReviewRepliesAgentNav } from "@/components/dashboard/review-replies-agent-nav";
import { toast } from "sonner";

const DEMO_HANDLED_HINT =
  "Handled for this demo - reply area is locked. Switch business type above or refresh the page to reset.";

function loadDemoState(type: DemoBusinessType) {
  return hydrateDemoDataset(getDemoDataset(type).reviews);
}

function DemoLimitCard() {
  const { data: session } = useSession();
  const dashboardHref = session?.user ? "/dashboard" : "/login";

  return (
    <Card className="border-amber-300 bg-amber-50/60">
      <CardHeader>
        <CardTitle className="text-base">Demo limit reached</CardTitle>
        <CardDescription className="text-sm text-slate-700">
          You&apos;ve reached the demo limit. Create a free account to connect your real Google Business
          Profile.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 sm:flex-row">
        <Button asChild>
          <Link href="/signup">Create free account</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href={dashboardHref}>Go to dashboard</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function DemoWorkspace({ businessType }: { businessType: DemoBusinessType }) {
  const seeded = loadDemoState(businessType);
  const [reviews, setReviews] = useState<Review[]>(() => seeded.reviews);
  const [drafts, setDrafts] = useState<Record<string, string>>(() => seeded.drafts);
  const [savedDraftSnapshots, setSavedDraftSnapshots] = useState<Record<string, string>>(
    () => seeded.savedDraftSnapshots
  );
  const [showLimitState, setShowLimitState] = useState(false);

  const isSampleMode = reviews.length > 0 && reviews.every((r) => r.isSample);

  const reviewSummary = useMemo(() => {
    let unanswered = 0;
    let draftsActive = 0;
    let posted = 0;
    const isDemoUi = true;

    for (const rv of reviews) {
      const draftText = drafts[rv.google_review_id] ?? "";
      const { workflow } = getReviewWorkflowDisplay(rv, draftText, savedDraftSnapshots, isDemoUi);
      if (workflow === "unanswered") unanswered += 1;
      else if (workflow === "posted") posted += 1;
      else draftsActive += 1;
    }

    return { total: reviews.length, unanswered, drafts: draftsActive, posted };
  }, [reviews, drafts, savedDraftSnapshots]);

  async function generate(review: Review) {
    if (checkDemoLimit(DEMO_STORAGE_KEYS.REPLIES_USED, DEMO_LIMITS.REPLIES)) {
      setShowLimitState(true);
      return;
    }

    const ds = getDemoDataset(businessType);
    const body = {
      businessName: ds.businessNameForAi,
      city: ds.cityForAi,
      rating: Math.min(5, Math.max(1, Number(review.star_rating) || 5)),
      text: review.comment || "",
    };

    const response = await fetch("/api/openai/review-reply", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-demo": "true",
        "x-sample-review": "true",
      },
      body: JSON.stringify(body),
    });

    let json: { reply?: string; markdown?: string; text?: string; error?: string } = {};
    try {
      json = await response.json();
    } catch {
      // ignore invalid JSON
    }

    if (!response.ok) {
      toast.error(json?.error ?? `Generate failed (${response.status})`);
      return;
    }

    const replyText = json.reply ?? json.markdown ?? json.text ?? "";
    setDrafts((d) => ({ ...d, [review.google_review_id]: replyText }));
    incrementDemoUsage(DEMO_STORAGE_KEYS.REPLIES_USED);
    toast.success("Reply generated. Save as draft or mark as posted (demo) when you are happy with it.");
  }

  function saveTestDraft(review: Review) {
    if (!shouldShowTestWorkflowActions(review, true)) return;
    const text = drafts[review.google_review_id] ?? "";
    if (!text.trim()) {
      toast.error("Nothing to save yet - generate a reply or type your draft first.");
      return;
    }

    setSavedDraftSnapshots((s) => ({ ...s, [review.google_review_id]: text }));
    toast.success("Draft saved. Mark as posted (test mode) when this reply is final, or keep editing.");
  }

  function markAsPostedTest(review: Review) {
    if (!shouldShowTestWorkflowActions(review, true)) return;
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
    setSavedDraftSnapshots((s) => ({ ...s, [review.google_review_id]: reply }));
    toast.success("Marked as posted (demo). This review is handled for this session.");
  }

  return (
    <>
      {showLimitState ? <DemoLimitCard /> : null}

      {reviews.length > 0 ? (
        <div
          className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-xs"
          aria-live="polite"
        >
          <span className="font-semibold">Summary</span>
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
      ) : null}

      <ReviewList
        reviews={reviews}
        drafts={drafts}
        savedDraftSnapshots={savedDraftSnapshots}
        isDemo
        isSampleMode={isSampleMode}
        collapsibleSampleCards={false}
        expandedId={null}
        onExpandedIdChange={() => {}}
        onDraftChange={(reviewId, text) => setDrafts((d) => ({ ...d, [reviewId]: text }))}
        onGenerate={(rv) => void generate(rv)}
        onPost={() => {
          // Test workflow uses Mark as posted instead
        }}
        onSaveTestDraft={saveTestDraft}
        onMarkPostedTest={markAsPostedTest}
        hasPaidAccess
        testModeHandledResetHint={DEMO_HANDLED_HINT}
      />
    </>
  );
}

export function PublicReviewRepliesDemoPage() {
  const [businessType, setBusinessType] = useState<DemoBusinessType>("restaurant");

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex max-w-5xl items-center justify-center px-4 py-3 lg:px-8">
          <DashboardTopNav className="w-full justify-center" />
        </div>
      </header>
      <main className="px-4 py-8 pb-16">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
          <ReviewRepliesAgentNav />

          <section className="space-y-3">
            <label htmlFor="demo-business-type" className="block text-sm font-medium">
              Business type
            </label>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-4">
              <select
                id="demo-business-type"
                className={cn(nativeSelectClassName, "w-full sm:max-w-md sm:shrink-0")}
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value as DemoBusinessType)}
              >
                {DEMO_BUSINESS_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <DashboardCallout
                variant="warning"
                className="min-w-0 flex-1 py-2.5 sm:items-center [&>div]:space-y-0"
              >
                <p>Demo mode: you&apos;re using sample reviews.</p>
              </DashboardCallout>
            </div>
          </section>

          <DemoWorkspace key={businessType} businessType={businessType} />
        </div>
      </main>
    </div>
  );
}
