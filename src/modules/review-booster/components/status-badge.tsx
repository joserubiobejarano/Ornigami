type Status = "pending" | "sent" | "failed" | "skipped" | string;

const statusClasses: Record<string, string> = {
  pending: "bg-accent-marigold/10 text-primary border-accent-marigold/35",
  sent: "bg-accent-green/10 text-primary border-accent-green/35",
  failed: "bg-destructive/10 text-destructive border-destructive/35",
  skipped: "bg-surface text-muted-foreground border-border"
};

const statusLabels: Record<string, string> = {
  pending: "Scheduled",
  sent: "Sent",
  failed: "Couldn't send",
  skipped: "Skipped",
};

export function StatusBadge({ status }: { status: Status }) {
  const normalized = (status || "").toLowerCase();
  const classes = statusClasses[normalized] || "bg-surface text-muted-foreground border-border";

  return (
    <span className={`inline-flex rounded-full border-[1.5px] px-2.5 py-1 text-xs font-medium capitalize ${classes}`}>
      {statusLabels[normalized] || normalized || "Unknown"}
    </span>
  );
}
