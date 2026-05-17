"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { demoAuditMarkdown } from "@/lib/demo-data";
import {
  isDemoMode,
  DEMO_LIMITS,
  DEMO_STORAGE_KEYS,
  incrementDemoUsage,
  checkDemoLimit
} from "@/lib/demo";
import { useCurrentPlan } from "@/lib/use-current-plan";
import { isPaidUser, isTrialing } from "@/lib/plan";
import { UpgradeBanner, PlanGateModal } from "@/components/PlanGate";
import { UpgradeModal } from "@/components/UpgradeModal";
import { toast } from "sonner";

type Location = {
  id: string;
  title: string | null;
};

function AuditPageContent() {
  const isDemo = isDemoMode();
  const { planStatus, isLoading: planLoading, planInfo } = useCurrentPlan();
  const hasPaidAccess = isPaidUser(planStatus) || isTrialing(planStatus);
  const [showPlanGateModal, setShowPlanGateModal] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string | undefined>(undefined);
  const [auditMode, setAuditMode] = useState<"connected" | "quick">("quick");
  const [urlOrName, setUrlOrName] = useState("");
  const [category, setCategory] = useState("");
  const [city, setCity] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [useSampleData, setUseSampleData] = useState(false);

  const loadLocations = useCallback(async () => {
    if (isDemo) {
      return;
    }

    try {
      const res = await fetch("/api/google/locations/list", { credentials: "include" });
      if (res.status !== 200) return;

      const data = await res.json();
      const locs = data.locations as { id: string; title?: string; locationName?: string }[];
      if (!locs?.length) return;

      const mapped: Location[] = locs.map((l) => ({
        id: l.id,
        title: l.title ?? null,
      }));

      if (mapped.length > 0) {
        setLocations(mapped);
        setAuditMode("connected");
        setSelectedLocationId(mapped[0].id);
      }
    } catch (e) {
      console.error("[audit] failed to load locations", e);
    }
  }, [isDemo]);

  useEffect(() => {
    loadLocations();
  }, [loadLocations]);

  // If demo mode is active, automatically show sample data
  useEffect(() => {
    if (isDemo && !useSampleData && !result) {
      setUseSampleData(true);
      setResult(demoAuditMarkdown);
      setError(null);
    }
  }, [isDemo, useSampleData, result]);

  async function runAudit(mode: "connected" | "quick") {
    // Handle demo mode limits
    if (isDemo) {
      if (checkDemoLimit(DEMO_STORAGE_KEYS.AUDITS_USED, DEMO_LIMITS.AUDITS)) {
        setShowUpgradeModal(true);
        return;
      }

      // Simulate loading for demo
      setLoading(true);
      setTimeout(() => {
        setResult(demoAuditMarkdown);
        setLoading(false);
        incrementDemoUsage(DEMO_STORAGE_KEYS.AUDITS_USED);
        toast.success("Sample report ready (legacy audit, demo).");
      }, 1500);
      return;
    }

    // Check plan access for connected mode (quick mode is free via /free-audit)
    if (mode === "connected" && !hasPaidAccess) {
      setShowPlanGateModal(true);
      return;
    }

    if (mode === "connected" && !selectedLocationId) {
      alert("Please select a location");
      return;
    }

    if (mode === "quick" && !urlOrName.trim()) {
      alert("Please enter a GBP URL or business name");
      return;
    }

    setLoading(true);
    setError(null);
    setResult("");

    try {
      const res = await fetch("/api/audit/profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode,
          locationId: selectedLocationId ?? null,
          urlOrName: urlOrName || null,
          city: city || null,
          category: category || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to generate report");
        return;
      }

      setResult(data.markdown || "");
    } catch (e: any) {
      setError(e?.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function onCopy() {
    if (!result) return;
    navigator.clipboard.writeText(result).then(
      () => alert("Copied to clipboard"),
      () => alert("Failed to copy")
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 p-4 text-sm text-amber-950 dark:text-amber-100">
        <p className="font-medium text-foreground">Legacy tool , not part of the review product</p>
        <p className="mt-1 text-foreground">
          For day-to-day work use{" "}
          <Link href="/reviews" className="underline underline-offset-2">
            Reviews
          </Link>{" "}
          (inbox &amp; replies) and{" "}
          <Link href="/settings" className="underline underline-offset-2">
            Settings
          </Link>{" "}
          (reply defaults &amp; Google Business Profile). This page may be removed later.
        </p>
      </div>
      <div>
        <h1 className="text-2xl font-semibold mb-2">Legacy profile report</h1>
        <p className="text-foreground">
          Older local-presence-style report. Your review workflow lives on Reviews.
        </p>
      </div>

      {(isDemo || useSampleData) && (
        <div className="rounded-md border border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-900 p-3">
          <p className="text-sm text-orange-800 dark:text-orange-200">
            Demo mode , sample report only. Connect Google in Settings to sync real reviews to{" "}
            <Link href="/reviews" className="underline underline-offset-2">
              Reviews
            </Link>
            .
          </p>
        </div>
      )}

      {planInfo && hasPaidAccess && !isDemo && (
        <UpgradeBanner planStatus={planStatus} currentPeriodEnd={planInfo.currentPeriodEnd} />
      )}

      {!planLoading && !hasPaidAccess && !isDemo && (
        <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 p-4 space-y-2">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
            Upgrade to LocalLift Starter to connect Google Business Profile, sync reviews, and use the
            review inbox , this legacy report is not the main product.
          </p>
          <p className="text-xs text-amber-800 dark:text-amber-200">
            You can still try a quick check below without a connection. Public tool:{" "}
            <Link href="/free-audit" className="underline">
              /free-audit
            </Link>
            .
          </p>
        </div>
      )}

      <div className="space-y-6">
        {/* Sample audit option */}
        {locations.length === 0 && !result && !useSampleData && !isDemo && (
          <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-900">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium mb-1">Just want to see how it looks?</h3>
                  <p className="text-xs text-foreground">
                    Load a sample legacy report (reviews &amp; replies are on Reviews).
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    setUseSampleData(true);
                    setResult(demoAuditMarkdown);
                    setError(null);
                  }}
                >
                  Load sample report
                </Button>
              </div>
            </CardContent>
          </Card>
        )}


        {/* Connected locations section */}
        <div className="space-y-3">
          <h2 className="text-lg font-medium">Connected locations</h2>
          {locations.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-foreground">
                  No Google Business locations found. Connect in Settings or use the quick check below.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="text-sm font-medium mb-1 block">Location</label>
                <select
                  className="border-input dark:bg-input/30 h-9 w-full rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                  value={selectedLocationId || ""}
                  onChange={(e) => setSelectedLocationId(e.target.value || undefined)}
                >
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.title || "Unnamed location"}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                onClick={() => runAudit("connected")}
                disabled={loading || !selectedLocationId || useSampleData || isDemo || (!hasPaidAccess && !isDemo)}
                title={
                  (useSampleData || isDemo)
                    ? "Exit demo mode to run a connected report"
                    : (!hasPaidAccess ? "Premium feature" : undefined)
                }
              >
                Run connected report
              </Button>
            </div>
          )}
        </div>

        {/* Quick audit section */}
        <div className="space-y-3">
          <h2 className="text-lg font-medium">Quick check (no connection)</h2>
          <div className="grid gap-3 max-w-2xl">
            <div>
              <label className="text-sm font-medium mb-1 block">
                GBP URL or business name + city
              </label>
              <Input
                placeholder="e.g., https://maps.google.com/... or 'Joe's Pizza'"
                value={urlOrName}
                onChange={(e) => setUrlOrName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">City (optional)</label>
                <Input
                  placeholder="City"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Category (optional)</label>
                <Input
                  placeholder="e.g., Italian restaurant"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Button
                onClick={() => runAudit("quick")}
                // Allow quick audit in demo mode (it will just show sample data)
                disabled={loading || (!urlOrName.trim() && !isDemo)}
                title={(useSampleData || isDemo) ? "Run sample report" : undefined}
              >
                Run quick check
              </Button>
              <p className="text-xs text-foreground">
                Or try the public{" "}
                <Link href="/free-audit" className="underline">
                  free check
                </Link>{" "}
                (no login required)
              </p>
            </div>
          </div>
        </div>

        {/* Results section */}
        {loading && (
          <div className="text-foreground">Generating reportâ€¦</div>
        )}

        {error && (
          <div className="text-destructive text-sm">{error}</div>
        )}

        {result && (
          <div className="space-y-3">
            <div className="prose max-w-none border rounded-md p-4">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {result}
              </ReactMarkdown>
            </div>
            <Button onClick={onCopy}>
              Copy
            </Button>
          </div>
        )}
      </div>

      <PlanGateModal
        open={showPlanGateModal}
        onOpenChange={setShowPlanGateModal}
        featureName="Google Business Profile connection and review sync"
      />

      <UpgradeModal
        open={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        description={
          isDemo
            ? "You've reached the demo limit for this legacy screen. Start your free trial for the full review inbox."
            : undefined
        }
      />
    </div>
  );
}

export default function AuditPage() {
  return (
    <Suspense fallback={
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold mb-2">Legacy profile report</h1>
          <p className="text-foreground">Loadingâ€¦</p>
        </div>
        <div className="text-foreground">Loading...</div>
      </div>
    }>
      <AuditPageContent />
    </Suspense>
  );
}


