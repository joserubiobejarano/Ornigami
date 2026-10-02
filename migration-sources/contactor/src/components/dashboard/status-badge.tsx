const LEAD_STATUS_CLASSES: Record<string, string> = {
  new: "bg-blue-50 text-blue-700 ring-blue-600/20",
  qualified: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  contacted: "bg-amber-50 text-amber-700 ring-amber-600/20",
  closed: "bg-slate-100 text-slate-700 ring-slate-500/20",
};

const LEAD_STATUS_LABELS: Record<string, string> = {
  new: "New",
  qualified: "Qualified",
  contacted: "Contacted",
  closed: "Closed",
};

export function LeadStatusBadge({ status }: { status: string }) {
  const className = LEAD_STATUS_CLASSES[status] ?? "bg-slate-100 text-slate-700 ring-slate-500/20";
  const label = LEAD_STATUS_LABELS[status] ?? status;

  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${className}`}
    >
      {label}
    </span>
  );
}

const SCORE_BUCKET_CLASSES: Record<string, string> = {
  hot: "bg-rose-50 text-rose-700 ring-rose-600/20",
  warm: "bg-amber-50 text-amber-700 ring-amber-600/20",
  cold: "bg-slate-100 text-slate-700 ring-slate-500/20",
};

const SCORE_BUCKET_LABELS: Record<string, string> = {
  hot: "Hot",
  warm: "Warm",
  cold: "Cold",
};

export function LeadScoreBadge({ bucket }: { bucket: "hot" | "warm" | "cold" }) {
  const className =
    SCORE_BUCKET_CLASSES[bucket] ?? "bg-slate-100 text-slate-700 ring-slate-500/20";
  const label = SCORE_BUCKET_LABELS[bucket] ?? bucket;

  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${className}`}
    >
      {label}
    </span>
  );
}

export function UrgencyBadge({ urgency }: { urgency: string | null }) {
  const normalized = urgency?.trim().toLowerCase() ?? "";
  const className =
    normalized === "urgent"
      ? "bg-rose-50 text-rose-700 ring-rose-600/20"
      : normalized === "non_urgent" || normalized === "not urgent"
        ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
        : "bg-slate-100 text-slate-700 ring-slate-500/20";
  const label =
    normalized === "urgent"
      ? "Urgent"
      : normalized === "non_urgent" || normalized === "not urgent"
        ? "Non-urgent"
        : "Unknown";

  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${className}`}
    >
      {label}
    </span>
  );
}

export function NextStepBadge({ label }: { label: string }) {
  const normalized = label.toLowerCase();
  const className = normalized.includes("call now")
    ? "bg-rose-50 text-rose-700 ring-rose-600/20"
    : normalized.includes("follow up")
      ? "bg-amber-50 text-amber-700 ring-amber-600/20"
      : normalized.includes("no action")
        ? "bg-slate-100 text-slate-700 ring-slate-500/20"
        : "bg-blue-50 text-blue-700 ring-blue-600/20";

  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${className}`}
    >
      {label}
    </span>
  );
}
