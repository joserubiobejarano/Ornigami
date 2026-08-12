"use client";

import { ReactNode } from "react";
import { DashboardCallout } from "@/components/dashboard";
import { UpgradeBanner } from "@/components/UpgradeBanner";
import { useCurrentPlan } from "@/lib/use-current-plan";
import { isPaidUser, isTrialing } from "@/lib/plan";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";

// Re-export UpgradeBanner for convenience
export { UpgradeBanner };

type PlanGateProps = {
  children: ReactNode;
  fallback?: ReactNode;
  showBanner?: boolean;
  featureName?: string;
};

export function PlanGate({ children, fallback, showBanner = true, featureName = "this feature" }: PlanGateProps) {
  const { planStatus, isLoading, planInfo } = useCurrentPlan();

  if (isLoading) {
    return <Skeleton className="h-10 w-full" />;
  }

  const hasAccess = isPaidUser(planStatus) || isTrialing(planStatus);

  if (!hasAccess) {
    return (
      <>
        {showBanner && planInfo && (
          <UpgradeBanner planStatus={planStatus} currentPeriodEnd={planInfo.currentPeriodEnd} />
        )}
        {fallback || (
          <DashboardCallout
            variant="neutral"
            title="Paid plan"
            action={
              <Button asChild size="sm">
                <Link href="/dashboard/billing">Choose a plan</Link>
              </Button>
            }
          >
            <p className="text-muted-foreground">
              {featureName} is available on Ornigami Starter. Upgrade to connect Google Business Profile,
              sync reviews, and use reply drafts.
            </p>
          </DashboardCallout>
        )}
      </>
    );
  }

  return <>{children}</>;
}

type PlanGateModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  featureName?: string;
};

export function PlanGateModal({ open, onOpenChange, featureName = "this feature" }: PlanGateModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upgrade required</DialogTitle>
          <DialogDescription>
            {featureName} is available on Ornigami Starter. Upgrade to connect Google Business Profile,
              sync reviews, and post drafted replies.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Link href="/dashboard/billing">
            <Button>Choose a plan (from €39/month)</Button>
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

