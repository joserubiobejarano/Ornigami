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
  if (isTrialing(planStatus) && currentPeriodEnd) {
    const trialEndDate = formatProductDate(currentPeriodEnd);
    return (
      <DashboardCallout
        variant="info"
        action={
          <Button asChild size="sm">
            <Link href="/dashboard/billing">Upgrade now</Link>
          </Button>
        }
      >
        <p>
          Trial ends on <span className="font-medium text-foreground">{trialEndDate}</span>. Upgrade to keep
          syncing reviews, reply drafts, and posting to Google.
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
          <Link href="/dashboard/billing">Choose a plan</Link>
          </Button>
        }
      >
        <p>
          Choose a plan (from €39/month) to connect Google Business Profile, sync reviews, and
          use reply drafts.
        </p>
      </DashboardCallout>
    );
  }

  return null;
}
