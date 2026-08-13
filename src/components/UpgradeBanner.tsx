"use client";

import Link from "next/link";
import { DashboardCallout } from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import type { PlanStatus } from "@/lib/plan";
import { isTrialing, isFreeUser } from "@/lib/plan";
import { formatProductDate } from "@/lib/format-date";

type UpgradeBannerProps = {
  planStatus: PlanStatus;
  currentPeriodEnd: string | null;
};

export function UpgradeBanner({ planStatus, currentPeriodEnd }: UpgradeBannerProps) {
  if (planStatus === "past_due") {
    return (
      <DashboardCallout
        variant="warning"
        title="Payment needs attention"
        action={
          <Button asChild size="sm">
            <Link href="/dashboard/billing">Update payment</Link>
          </Button>
        }
      >
        <p>Your latest payment failed. Update your payment method to keep your subscription active.</p>
      </DashboardCallout>
    );
  }

  if (isTrialing(planStatus) && currentPeriodEnd) {
    const trialEndDate = formatProductDate(currentPeriodEnd);
    return (
      <DashboardCallout
        variant="info"
        action={
          <Button asChild size="sm">
            <Link href="/dashboard/billing">See plans</Link>
          </Button>
        }
      >
        <p>
          You&apos;re on the free trial. It ends on <span className="font-medium text-foreground">{trialEndDate}</span>. Add a payment method before then to keep Ornigami running.
        </p>
      </DashboardCallout>
    );
  }

  if (isFreeUser(planStatus)) {
    return (
      <DashboardCallout
        variant="warning"
        action={
          <Button asChild size="sm">
            <Link href="/dashboard/billing">See plans</Link>
          </Button>
        }
      >
        <p>
          This is part of your free trial. Upgrade anytime to keep Ornigami running.
        </p>
      </DashboardCallout>
    );
  }

  return null;
}
