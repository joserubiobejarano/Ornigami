import { cookies } from "next/headers";
import Link from "next/link";

import {
  DashboardCallout,
  DashboardEmptyState,
  DashboardPage,
} from "@/components/dashboard";
import { ReviewRepliesAgentNav } from "@/components/dashboard/review-replies-agent-nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UpgradeBanner } from "@/components/UpgradeBanner";
import { getDashboardMetrics } from "@/lib/dashboard-metrics";
import { getUserPlanInfo } from "@/lib/plan-server";
import { isPaidUser, isTrialing } from "@/lib/plan";
import { auth } from "@/auth";

export async function ReviewRepliesDashboardPage() {
  const cookieStore = await cookies();
  const isDemo = cookieStore.get("ll_demo")?.value === "true";

  const metrics = await getDashboardMetrics(isDemo);
  let planInfo = null;
  let hasPaidAccess = false;

  if (!isDemo) {
    const session = await auth();
    const user = session?.user;

    if (user?.id) {
      try {
        planInfo = await getUserPlanInfo(user.id);
        hasPaidAccess = isPaidUser(planInfo.planStatus) || isTrialing(planInfo.planStatus);
      } catch (e) {
        console.error("[Dashboard] Failed to fetch plan info:", e);
      }
    }
  }

  const showError = !isDemo && Boolean(metrics?.criticalError);
  const isEmpty =
    !isDemo && metrics && !metrics.criticalError && metrics.totalReviewsSynced === 0;

  return (
    <DashboardPage width="md">
      <ReviewRepliesAgentNav />

      {planInfo && hasPaidAccess && !isDemo && (
        <UpgradeBanner planStatus={planInfo.planStatus} currentPeriodEnd={planInfo.currentPeriodEnd} />
      )}

      {showError && (
        <DashboardCallout variant="error">
          <p>{metrics?.criticalError ?? "We could not load stats. Please refresh."}</p>
        </DashboardCallout>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="shadow-sm">
          <CardHeader className="space-y-0 pb-3">
            <CardTitle className="text-sm font-medium text-foreground">Reviews loaded</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-3xl font-bold tabular-nums tracking-tight">
              {metrics?.totalReviewsSynced ?? 0}
            </div>
            <p className="text-xs leading-relaxed text-foreground">
              {isDemo
                ? "Sample data mirrors 'Loaded' on Reviews."
                : "Reviews synced into your review inbox from Google Business Profile (all locations)."}
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="space-y-0 pb-3">
            <CardTitle className="text-sm font-medium text-foreground">Unanswered</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-3xl font-bold tabular-nums tracking-tight">
              {metrics?.unansweredReviews ?? 0}
            </div>
            <p className="text-xs leading-relaxed text-foreground">
              {isDemo
                ? "Sample data mirrors 'Unanswered' on Reviews (no reply on Google yet)."
                : "Not yet marked replied on Google after sync. On Reviews, some of these may already have a draft in the editor."}
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="space-y-0 pb-3">
            <CardTitle className="text-sm font-medium text-foreground">Drafts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-3xl font-bold tabular-nums tracking-tight">
              {metrics?.draftsCount ?? 0}
            </div>
            <p className="text-xs leading-relaxed text-foreground">
              {isDemo
                ? "Sample count mirrors drafts in progress on the Reviews page."
                : "Unposted drafts saved in Ornigami (database). Text you only have in the Reviews editor is not counted here."}
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="space-y-0 pb-3">
            <CardTitle className="text-sm font-medium text-foreground">Posted / replied</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-3xl font-bold tabular-nums tracking-tight">
              {metrics?.repliesPostedThisMonth ?? 0}
            </div>
            <p className="text-xs leading-relaxed text-foreground">
              {isDemo
                ? "Sample data shows replied reviews this period in demo."
                : "Reviews marked replied on Google, updated this calendar month."}
            </p>
          </CardContent>
        </Card>
      </div>

      {isEmpty && (
        <DashboardEmptyState
          title="No reviews synced yet"
          description={
            <>
              Open{" "}
              <Link href="/dashboard/agents/review-replies/reviews" className="text-foreground underline-offset-4 hover:underline">
                Reviews
              </Link>{" "}
              and sync from Google Business Profile to load your inbox. Or try the workflow first with{" "}
              <Link href="/demo" className="text-foreground underline-offset-4 hover:underline">
                sample reviews
              </Link>{" "}
              (no GBP required).
            </>
          }
        />
      )}

      {isDemo && (
        <DashboardCallout variant="info">
          <p>
            You&apos;re viewing sample review data. Open{" "}
            <Link href="/demo" className="text-foreground underline-offset-4 hover:underline">
              the live demo
            </Link>{" "}
            to walk through generate, draft, and reply, then connect GBP when you&apos;re ready.
          </p>
        </DashboardCallout>
      )}
    </DashboardPage>
  );
}
