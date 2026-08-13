"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ensureBrowserToken } from "@/lib/ensure-token";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useCurrentPlan } from "@/lib/use-current-plan";
import { isPaidUser, isTrialing } from "@/lib/plan";
import { UpgradeBanner, PlanGateModal } from "@/components/PlanGate";
import {
  isDemoMode,
  DEMO_LIMITS,
  DEMO_STORAGE_KEYS,
  incrementDemoUsage,
  checkDemoLimit
} from "@/lib/demo";
import { UpgradeModal } from "@/components/UpgradeModal";
import { toast } from "sonner";
import { DashboardPage, DashboardPageHeader } from "@/components/dashboard";
import { readTextStream } from "@/lib/stream-client";

type GeneratorType = "blog" | "gbp_post" | "faq";

type Project = {
  id: string;
  title: string;
  type: GeneratorType;
  input: {
    businessName?: string;
    city?: string;
    service?: string;
    tone?: string;
    [key: string]: unknown;
  };
  output_md: string | null;
  created_at: string;
};

export default function ContentPage() {
  const { planStatus, isLoading: planLoading, planInfo } = useCurrentPlan();
  const hasPaidAccess = isPaidUser(planStatus) || isTrialing(planStatus);
  const [showPlanGateModal, setShowPlanGateModal] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [type, setType] = useState<GeneratorType>("blog");
  const [businessName, setBusinessName] = useState("");
  const [city, setCity] = useState("");
  const [service, setService] = useState("");
  const [tone, setTone] = useState("Friendly and helpful");
  const [markdown, setMarkdown] = useState("");
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [saving, setSaving] = useState(false);

  const isDemo = isDemoMode();

  const generatorOptions: Array<{ value: GeneratorType; label: string }> =
    useMemo(
      () => [
        { value: "blog", label: "Blog" },
        { value: "gbp_post", label: "GBP Post" },
        { value: "faq", label: "FAQs" },
      ],
      []
    );

  const loadProjects = useCallback(async () => {
    if (isDemo) {
      // Load sample projects for demo
      setProjects([
        {
          id: "demo-1",
          title: "Example: Review marketing — Joe's Pizza",
          type: "blog",
          input: { businessName: "Joe's Pizza", city: "New York", service: "Pizza", tone: "Friendly" },
          output_md: "# The Best Pizza in NYC\n\nCome visit Joe's Pizza for an authentic slice...",
          created_at: new Date().toISOString()
        },
        {
          id: "demo-2",
          title: "Example: Short post — Joe's Pizza",
          type: "gbp_post",
          input: { businessName: "Joe's Pizza", city: "New York", service: "Pizza", tone: "Exciting" },
          output_md: "Pizza craving? Stop by Joe's Pizza today! #NYC #Pizza",
          created_at: new Date(Date.now() - 86400000).toISOString()
        }
      ]);
      return;
    }

    try {
      const t = await ensureBrowserToken();
      console.log(
        "[Content] calling /api/projects with token len:",
        (t || "").length
      );
      const res = await fetch("/api/projects", {
        method: "GET",
        headers: t ? { Authorization: `Bearer ${t}` } : {},
      });

      const data = await res.json();
      if (res.ok) setProjects(data.projects || []);
      else alert(data.error || "Unable to load projects");
    } catch (e: unknown) {
      console.error(e);
      alert(e instanceof Error ? e.message : "Unable to load projects");
    }
  }, [isDemo]);

  useEffect(() => {
    (async () => {
      if (isDemo) {
        loadProjects();
        // Pre-fill fields for demo
        setBusinessName("Joe's Pizza");
        setCity("New York");
        setService("Pizza Restaurant");
      } else {
        const t = await ensureBrowserToken();
        if (t) loadProjects();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemo]);

  const disableGenerate =
    !businessName.trim() || !city.trim() || !service.trim() || loading;

  async function onGenerate() {
    if (disableGenerate) return;

    if (isDemo) {
      if (checkDemoLimit(DEMO_STORAGE_KEYS.CONTENT_USED, DEMO_LIMITS.CONTENT)) {
        setShowUpgradeModal(true);
        return;
      }
    } else if (!hasPaidAccess) {
      setShowPlanGateModal(true);
      return;
    }

    const t = !isDemo ? await ensureBrowserToken() : null;
    setLoading(true);
    setMarkdown("");

    try {
      console.log(
        "[Content] calling /api/openai/generate with token len:",
        (t || "").length
      );
      const res = await fetch("/api/openai/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(t ? { Authorization: `Bearer ${t}` } : {}),
          ...(isDemo ? { "x-demo": "true" } : {}),
        },
        body: JSON.stringify({ type, businessName, city, service, tone }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Generation failed");
      }
      if (res.headers.get("content-type")?.includes("text/event-stream")) {
        await readTextStream(res, (text) => setMarkdown((current) => current + text));
      } else {
        const data = await res.json();
        setMarkdown(data.markdown || "");
      }

      if (isDemo) {
        incrementDemoUsage(DEMO_STORAGE_KEYS.CONTENT_USED);
        toast.success("Demo generation saved (legacy tool).");
      }
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function onSave() {
    if (!markdown) return;

    if (isDemo) {
      setShowUpgradeModal(true);
      return;
    }

    const t = await ensureBrowserToken();
    setSaving(true);

    try {
      const title = `${type.toUpperCase()} - ${businessName} in ${city}`;
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(t ? { Authorization: `Bearer ${t}` } : {}),
        },
        body: JSON.stringify({
          title,
          type,
          input: { businessName, city, service, tone },
          output_md: markdown,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong. Try again in a moment.");

      await loadProjects();
      alert("Saved!");
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  function onCopy() {
    if (!markdown) return;
    navigator.clipboard.writeText(markdown).then(
      () => alert("Done."),
      () => alert("We couldn't copy that. Try again.")
    );
  }

  function onDownload() {
    if (!markdown) return;

    const safeBusinessName = businessName.replace(/\s+/g, "_");
    const blob = new Blob([markdown], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${type}-${safeBusinessName || "content"}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function openProject(project: Project) {
    setType(project.type);
    setBusinessName(project.input.businessName ?? "");
    setCity(project.input.city ?? "");
    setService(project.input.service ?? "");
    setTone(project.input.tone ?? "Friendly and helpful");
    setMarkdown(project.output_md ?? "");
  }

  return (
    <DashboardPage width="lg" className="grid grid-cols-[minmax(0,1fr)_320px] gap-6">
      <div className="space-y-6">
        <div className="rounded-2xl border-[1.5px] border-accent-marigold/35 bg-tint-butter p-4 text-sm text-primary shadow-ink-sm">
          <p className="font-semibold text-primary">Legacy content tool</p>
          <p className="mt-1 text-muted-foreground">
            Ornigami is focused on your <strong>review inbox</strong> and <strong>reply drafts</strong>. Use{" "}
            <Link href="/reviews" className="underline underline-offset-2">
              Reviews
            </Link>{" "}
            for replies and{" "}
            <Link href="/settings" className="underline underline-offset-2">
              Settings
            </Link>{" "}
            for reply defaults and Google Business Profile. This screen may be removed later.
          </p>
        </div>
        <DashboardPageHeader kicker="Content" title="Create a useful draft." description="This older generator is still available, but your review inbox is the main workspace." />

        {planInfo && hasPaidAccess && !isDemo && (
          <UpgradeBanner planStatus={planStatus} currentPeriodEnd={planInfo.currentPeriodEnd} />
        )}

        {!planLoading && !hasPaidAccess && !isDemo && (
          <div className="rounded-2xl border-[1.5px] border-accent-marigold/35 bg-tint-butter p-4 space-y-2 shadow-ink-sm">
            <p className="text-sm font-medium text-primary">
              This legacy generator is not part of the main review product. Upgrade to turn on content suggestions.
            </p>
          </div>
        )}

        <div className="flex gap-2">
          {generatorOptions.map((option) => (
            <Button
              key={option.value}
              variant="default"
              className={type !== option.value ? "opacity-70" : undefined}
              onClick={() => setType(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>

        <div className="grid gap-3 max-w-2xl">
          <Input
            placeholder="Business name"
            value={businessName}
            onChange={(event) => setBusinessName(event.target.value)}
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              placeholder="City"
              value={city}
              onChange={(event) => setCity(event.target.value)}
            />
            <Input
              placeholder="Service (e.g., Italian restaurant)"
              value={service}
              onChange={(event) => setService(event.target.value)}
            />
          </div>

          <Textarea
            placeholder="Tone (e.g., Friendly and helpful)"
            value={tone}
            onChange={(event) => setTone(event.target.value)}
          />

          <div className="flex flex-wrap gap-3">
            <Button
              onClick={onGenerate}
              disabled={disableGenerate || (!hasPaidAccess && !planLoading && !isDemo)}
              title={!hasPaidAccess && !isDemo ? "Premium feature" : undefined}
            >
              {loading ? "Generating..." : "Generate"}
            </Button>
            <Button
              onClick={onSave}
              disabled={!markdown || saving}
              title={isDemo ? "Saving disabled in demo mode" : undefined}
            >
              {saving ? "Saving..." : "Save as Project"}
            </Button>
            <Button onClick={onCopy} disabled={!markdown}>
              Copy
            </Button>
            <Button
              onClick={onDownload}
              disabled={!markdown}
            >
              Download .md
            </Button>
          </div>
        </div>

        <div className="prose max-w-none rounded-2xl border-[1.5px] border-border bg-card p-6 shadow-ink-sm">
          {markdown ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {markdown}
            </ReactMarkdown>
          ) : (
            <p className="text-foreground">
              Your generated Markdown will appear here…
            </p>
          )}
        </div>
      </div>

      <aside className="rounded-2xl border-[1.5px] border-border bg-card p-4 shadow-ink-sm">
        <h3 className="font-bold text-primary mb-2">Your projects</h3>
        <div className="space-y-2 max-h-[80vh] overflow-auto pr-2">
          {projects.map((project) => (
            <button
              key={project.id}
              onClick={() => openProject(project)}
              className="w-full rounded border p-2 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <div className="text-sm font-medium">{project.title}</div>
              <div className="text-xs text-muted-foreground">
                {new Date(project.created_at).toLocaleString()}
              </div>
            </button>
          ))}

          {projects.length === 0 && (
            <p className="text-sm text-muted-foreground">No projects yet.</p>
          )}
        </div>
      </aside>

      <PlanGateModal
        open={showPlanGateModal}
        onOpenChange={setShowPlanGateModal}
        featureName="Content suggestions"
      />

      <UpgradeModal
        open={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        description={
          isDemo
            ? "You've reached the demo limit for this legacy screen. Start free trial for the full review inbox (sync, drafts, posting)."
            : undefined
        }
      />
    </DashboardPage>
  );
}


