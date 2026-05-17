import { Check } from "lucide-react";

type FeatureSplitProps = {
  label: string;
  title: string;
  description: string;
  bullets: string[];
  variant?: "left" | "right";
};

export function FeatureSplit({
  label,
  title,
  description,
  bullets,
  variant = "left",
}: FeatureSplitProps) {
  const isLeft = variant === "left";
  return (
    <div className="grid gap-8 md:grid-cols-2 md:items-center">
      <div className={isLeft ? "" : "md:order-2"}>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{label}</p>
        <h3 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">{title}</h3>
        <p className="mt-4 text-base text-slate-300/85 sm:text-lg">{description}</p>
        <ul className="mt-5 space-y-3 text-sm text-slate-200/85 sm:text-base">
          {bullets.map((b) => (
            <li key={b} className="flex items-start gap-3">
              <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className={isLeft ? "" : "md:order-1"}>
        <div className="relative min-h-[300px] overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
          {/* Window chrome */}
          <div className="mb-4 flex items-center justify-between">
            <div className="flex gap-2">
              <div className="h-3 w-3 rounded-full bg-slate-700/80" />
              <div className="h-3 w-3 rounded-full bg-slate-700/80" />
              <div className="h-3 w-3 rounded-full bg-slate-700/80" />
            </div>
            <div className="h-2 w-24 rounded-full bg-gradient-to-r from-purple-500/30 via-sky-500/30 to-orange-400/30" />
            <div className="flex gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              <span className="h-2 w-2 rounded-full bg-rose-400" />
            </div>
          </div>

          {/* Feature-specific mockup */}
          <div className="space-y-4">
            {label.toLowerCase().includes("review") && (
              <div className="space-y-3">
                <div className="flex items-center gap-3 rounded-xl border border-purple-500/30 bg-gradient-to-r from-purple-500/20 to-sky-500/20 p-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-sky-400 text-xs font-bold text-white">5*</div>
                  <div className="flex-1">
                    <div className="mb-2 h-2 w-full rounded-full bg-purple-500/40" />
                    <div className="h-2 w-3/4 rounded-full bg-purple-400/30" />
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl border border-orange-500/30 bg-gradient-to-r from-orange-500/20 to-pink-500/20 p-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-pink-400 text-xs font-bold text-white">4*</div>
                  <div className="flex-1">
                    <div className="mb-2 h-2 w-full rounded-full bg-orange-500/40" />
                    <div className="h-2 w-2/3 rounded-full bg-orange-400/30" />
                  </div>
                </div>
              </div>
            )}
            {label.toLowerCase().includes("content") && (
              <div className="space-y-3">
                <div className="rounded-xl border border-orange-500/30 bg-gradient-to-br from-orange-500/20 via-pink-500/20 to-purple-500/20 p-4">
                  <div className="mb-2 h-3 w-3/4 rounded-full bg-orange-400/50" />
                  <div className="mb-2 h-3 w-full rounded-full bg-pink-400/40" />
                  <div className="h-3 w-2/3 rounded-full bg-purple-400/30" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-orange-500/20 bg-gradient-to-br from-orange-500/15 to-pink-500/15 p-3">
                    <div className="mb-1 h-2 w-full rounded-full bg-orange-400/40" />
                    <div className="h-2 w-2/3 rounded-full bg-pink-400/30" />
                  </div>
                  <div className="rounded-lg border border-purple-500/20 bg-gradient-to-br from-purple-500/15 to-sky-500/15 p-3">
                    <div className="mb-1 h-2 w-full rounded-full bg-purple-400/40" />
                    <div className="h-2 w-3/4 rounded-full bg-sky-400/30" />
                  </div>
                </div>
              </div>
            )}
            {label.toLowerCase().includes("audit") && (
              <div className="space-y-3">
                <div className="rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/20 via-teal-500/20 to-sky-500/20 p-4">
                  <div className="mb-3 flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/40">
                      <div className="h-4 w-4 rounded border-2 border-emerald-400 border-t-transparent" />
                    </div>
                    <div className="flex-1">
                      <div className="mb-1 h-2 w-full rounded-full bg-emerald-400/50" />
                      <div className="h-2 w-2/3 rounded-full bg-teal-400/40" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="h-8 rounded bg-emerald-500/30" />
                    <div className="h-8 rounded bg-teal-500/30" />
                    <div className="h-8 rounded bg-sky-500/30" />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-emerald-400" />
                  <div className="h-2 flex-1 rounded-full bg-emerald-500/30" />
                </div>
              </div>
            )}
          </div>

          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-purple-500/5 via-transparent to-orange-500/5" />
        </div>
      </div>
    </div>
  );
}

