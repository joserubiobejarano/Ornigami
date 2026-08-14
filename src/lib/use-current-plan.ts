"use client";

import { useEffect, useState } from "react";
import type { PlanId, PlanStatus } from "@/lib/plan";
import { safeLogger } from "@/lib/safe-logger";

export type PlanInfo = {
  planId: PlanId;
  planStatus: PlanStatus;
  currentPeriodEnd: string | null;
  aiPostsUsed: number;
  auditsUsed: number;
  usageResetDate: string | null;
};

export function useCurrentPlan(): {
  planId: PlanId;
  planStatus: PlanStatus;
  isLoading: boolean;
  planInfo: PlanInfo | null;
} {
  const [planId, setPlanId] = useState<PlanId>("free");
  const [planStatus, setPlanStatus] = useState<PlanStatus>("free");
  const [planInfo, setPlanInfo] = useState<PlanInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadPlan() {
      try {
        const res = await fetch("/api/user/plan", { credentials: "include" });
        if (!res.ok) {
          setPlanId("free");
          setPlanStatus("free");
          setIsLoading(false);
          return;
        }

        const plan = (await res.json()) as {
          planId: PlanId;
          planStatus: PlanStatus;
          currentPeriodEnd: string | null;
          aiPostsUsed: number;
          auditsUsed: number;
          usageResetDate: string | null;
        };

        const effectiveStatus: PlanStatus =
          plan.planStatus || "free";

        const effectivePlanId: PlanId = plan.planId || "free";

        setPlanId(effectivePlanId);
        setPlanStatus(effectiveStatus);
        setPlanInfo({
          planId: effectivePlanId,
          planStatus: effectiveStatus,
          currentPeriodEnd: plan.currentPeriodEnd,
          aiPostsUsed: plan.aiPostsUsed,
          auditsUsed: plan.auditsUsed,
          usageResetDate: plan.usageResetDate,
        });
      } catch (error) {
        safeLogger.error("current_plan.failed", {
          error: error instanceof Error ? error.message : "unknown",
        });
        setPlanId("free");
        setPlanStatus("free");
      } finally {
        setIsLoading(false);
      }
    }

    loadPlan();
  }, []);

  return { planId, planStatus, isLoading, planInfo };
}
