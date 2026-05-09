type Status = "pending" | "sent" | "failed" | "skipped" | string;

const statusClasses: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  sent: "bg-emerald-50 text-emerald-700 border-emerald-200",
  failed: "bg-rose-50 text-rose-700 border-rose-200",
  skipped: "bg-slate-100 text-slate-700 border-slate-200"
};

export function StatusBadge({ status }: { status: Status }) {
  const normalized = (status || "").toLowerCase();
  const classes = statusClasses[normalized] || "bg-slate-100 text-slate-700 border-slate-200";

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${classes}`}>
      {normalized || "unknown"}
    </span>
  );
}