import { cookies } from "next/headers";
import Link from "next/link";

import {
  DashboardCallout,
  DashboardEmptyState,
  DashboardPage,
  DashboardPageHeader,
} from "@/components/dashboard";
import { ReviewRepliesAgentNav } from "@/components/dashboard/review-replies-agent-nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UpgradeBanner } from "@/components/UpgradeBanner";
import { getDashboardMetrics } from "@/lib/dashboard-metrics";
import { getDashboardAgentAccess } from "@/lib/dashboard-access";
import { userHasGbpConnection } from "@/lib/db/gbp";
import { auth } from "@/auth";
import { AgentActivationPlaceholder } from "@/components/dashboard/agent-activation-placeholder";
import { safeLogger } from "@/lib/safe-logger";

export async function ReviewRepliesDashboardPage() {
  const cookieStore = await cookies();
  const isDemo = cookieStore.get("ll_demo")?.value === "true";

  let entitlement: Awaited<ReturnType<typeof getDashboardAgentAccess>>["entitlement"] | null = null;
  let workspaceOwner = false;
  let googleConnected = false;
  let shouldShowActivation = false;
  let accessError = false;

  if (!isDemo) {
    const session = await auth();
    const user = session?.user;

    if (user?.id) {
      try {
        const access = await getDashboardAgentAccess(user.id, "review_replies");
        entitlement = access.entitlement;
        workspaceOwner = access.context.role === "owner";
        googleConnected = await userHasGbpConnection(access.context.integrationOwnerUserId);
        if (!access.entitlement.hasAccess) {
          shouldShowActivation = true;
        }
      } catch (e) {
        accessError = true;
        safeLogger.error("review_replies_dashboard.plan_failed", {
          error: e instanceof Error ? e.message : "unknown",
        });
      }
    }
  }

  if (shouldShowActivation || accessError) {
    return (
      <DashboardPage width="md">
        <ReviewRepliesAgentNav />
        <DashboardPageHeader
          kicker="Review Replies"
          title="A thoughtful reply, without the inbox sprawl."
          description="See what’s new, what’s drafted, and what still needs your approval."
        />
        {accessError ? <DashboardCallout variant="error"><p>We couldn&apos;t verify this workspace. Refresh the page to try again.</p></DashboardCallout> : <AgentActivationPlaceholder
          agentId="review_replies"
          agentName="Review Replies"
          description="Reply drafting and one-click posting for Google reviews."
          canManageBilling={workspaceOwner}
        />}
      </DashboardPage>
    );
  }
  const metrics = await getDashboardMetrics(isDemo);
  const showError = !isDemo && Boolean(metrics?.criticalError);
  const isEmpty =
    !isDemo && metrics && !metrics.criticalError && metrics.totalReviewsSynced === 0;

  return (
    <DashboardPage width="md">
      <ReviewRepliesAgentNav />
      <DashboardPageHeader
        kicker="Review Replies"
        title="A thoughtful reply, without the inbox sprawl."
        description="See what’s new, what’s drafted, and what still needs your approval."
      />

      {entitlement && workspaceOwner && !isDemo && (
        <UpgradeBanner planStatus={entitlement.planStatus} currentPeriodEnd={entitlement.currentPeriodEnd} />
      )}

      {!isDemo && !googleConnected ? (
        <DashboardCallout variant="warning" title="Google profile disconnected">
          <p>{workspaceOwner ? "Reconnect Google Business Profile to sync reviews and manage replies." : "Ask the workspace owner to reconnect Google Business Profile to resume syncing."}</p>
          {workspaceOwner ? <Link href="/connect" className="mt-2 inline-block text-sm font-medium underline underline-offset-4">Connect Google</Link> : null}
        </DashboardCallout>
      ) : null}

      {showError && (
        <DashboardCallout variant="error">
          <p>{metrics?.criticalError ?? "We couldn't load your stats. Try again in a moment."}</p>
        </DashboardCallout>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="border-[1.5px] border-border bg-tint-navy shadow-ink-sm">
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

        <Card className="border-[1.5px] border-border bg-tint-butter shadow-ink-sm">
          <CardHeader className="space-y-0 pb-3">
            <CardTitle className="text-sm font-medium text-foreground">Awaiting your approval</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-3xl font-bold tabular-nums tracking-tight">
              {metrics?.unansweredReviews ?? 0}
            </div>
            <p className="text-xs leading-relaxed text-foreground">
              {isDemo
                ? "Sample data mirrors reviews waiting for your approval."
                : "Reviews waiting for a draft or your approval before anything posts."}
            </p>
          </CardContent>
        </Card>

        <Card className="border-[1.5px] border-border bg-tint-peach shadow-ink-sm">
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

        <Card className="border-[1.5px] border-border bg-tint-mint shadow-ink-sm">
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
              and sync from Google to load your inbox. Or try the workflow first with{" "}
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
