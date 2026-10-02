export function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border-[1.5px] border-border bg-card p-4 shadow-ink-sm">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="mt-2 font-mono text-3xl font-semibold tracking-tight text-card-foreground">{value}</p>
    </div>
  );
}
