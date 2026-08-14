export function SummaryCard({
  label,
  value
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border-[1.5px] border-border bg-card p-4 shadow-ink-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 font-mono text-2xl font-semibold text-primary">{value}</p>
    </div>
  );
}
