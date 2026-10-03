type Status = "pending" | "sent" | "failed" | "skipped" | string;

const statusClasses: Record<string, string> = {
  pending: "bg-accent-marigold/10 text-primary border-accent-marigold/35",
  sent: "bg-accent-green/10 text-primary border-accent-green/35",
  accepted: "bg-accent-green/10 text-primary border-accent-green/35",
  delayed: "bg-accent-marigold/10 text-primary border-accent-marigold/35",
  delivered: "bg-accent-green/10 text-primary border-accent-green/35",
  bounced: "bg-destructive/10 text-destructive border-destructive/35",
  complained: "bg-destructive/10 text-destructive border-destructive/35",
  suppressed: "bg-destructive/10 text-destructive border-destructive/35",
  failed: "bg-destructive/10 text-destructive border-destructive/35",
  provider_failed: "bg-destructive/10 text-destructive border-destructive/35",
  skipped: "bg-surface text-muted-foreground border-border",
  deferred_quota: "bg-accent-marigold/10 text-primary border-accent-marigold/35",
  unknown: "bg-accent-marigold/10 text-primary border-accent-marigold/35",
  sending: "bg-accent-marigold/10 text-primary border-accent-marigold/35",
  reconciliation_required: "bg-destructive/10 text-destructive border-destructive/35",
  expired: "bg-surface text-muted-foreground border-border",
  non_sendable: "bg-surface text-muted-foreground border-border",
};

const statusLabels: Record<string, string> = {
  pending: "Scheduled",
  sent: "Accepted by provider",
  accepted: "Accepted by provider",
  delayed: "Delivery delayed",
  delivered: "Delivered",
  bounced: "Bounced",
  complained: "Complaint received",
  suppressed: "Suppressed",
  failed: "Couldn't send",
  skipped: "Skipped",
  provider_failed: "Provider delivery failed",
  deferred_quota: "Waiting for quota",
  unknown: "Delivery status unknown",
  sending: "Delivery being checked",
  reconciliation_required: "Needs review",
  expired: "Expired",
  non_sendable: "Not sendable",
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
