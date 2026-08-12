type Status = "pending" | "sent" | "failed" | "skipped" | string;

const statusClasses: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800",
  sent: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800",
  failed: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:border-rose-800",
  skipped: "bg-secondary text-muted-foreground border-border"
};

export function StatusBadge({ status }: { status: Status }) {
  const normalized = (status || "").toLowerCase();
  const classes = statusClasses[normalized] || "bg-secondary text-muted-foreground border-border";

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${classes}`}>
      {normalized || "unknown"}
    </span>
  );
}
