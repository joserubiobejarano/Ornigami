type Status = "pending" | "sent" | "failed" | "skipped" | string;

const statusClasses: Record<string, string> = {
  pending: "bg-accent-yellow/10 text-primary border-accent-yellow/35",
  sent: "bg-accent-green/10 text-primary border-accent-green/35",
  failed: "bg-destructive/10 text-destructive border-destructive/35",
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
