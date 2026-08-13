import Link from "next/link";
import { ArrowRight, Check, ChevronDown, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

type Tint = "mint" | "butter" | "peach" | "navy";

const tintClass: Record<Tint, string> = {
  mint: "bg-tint-mint",
  butter: "bg-tint-butter",
  peach: "bg-tint-peach",
  navy: "bg-tint-navy",
};

const accentClass: Record<string, string> = {
  navy: "text-navy",
  green: "text-accent-green",
  marigold: "text-accent-marigold",
  coral: "text-accent-coral",
};

export function Eyebrow({ children, light = false, tint = "mint" }: { children: React.ReactNode; light?: boolean; tint?: Tint }) {
  return <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[0.7rem] font-bold uppercase tracking-[0.12em] ${light ? "border-white/15 bg-white/10 text-background" : `${tintClass[tint]} border-border text-primary`}`}><span className={`h-1.5 w-1.5 rounded-full ${light ? "bg-accent-marigold" : "bg-accent-marigold"}`} />{children}</span>;
}

export function SectionHeading({ eyebrow, title, intro, light = false, align = "left", tint = "mint" }: { eyebrow: string; title: string; intro?: string; light?: boolean; align?: "left" | "center"; tint?: Tint }) {
  return <div className={align === "center" ? "mx-auto max-w-3xl text-center" : "max-w-2xl"}>
    <Eyebrow light={light} tint={tint}>{eyebrow}</Eyebrow>
    <h2 className={`mt-4 text-balance text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-[2.75rem] ${light ? "text-background" : "text-primary"}`}>{title}</h2>
    {intro ? <p className={`mt-4 text-lg leading-relaxed ${light ? "text-background/70" : "text-muted-foreground"}`}>{intro}</p> : null}
  </div>;
}

export function PageHero({ eyebrow, title, intro }: { eyebrow: string; title: string; intro: string }) {
  return <section className="border-b border-border bg-surface/45 py-20 md:py-24"><div className="mx-auto max-w-7xl px-4 text-center md:px-6 lg:px-8"><div className="mx-auto max-w-3xl"><Eyebrow tint="navy">{eyebrow}</Eyebrow><h1 className="mt-5 text-balance text-[clamp(2.5rem,6vw,4.5rem)] font-extrabold leading-[1.03] tracking-tight text-primary">{title}</h1><p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">{intro}</p></div></div></section>;
}

export function FoldedCorner() {
  return <span aria-hidden="true" className="pointer-events-none absolute right-0 top-0 h-12 w-12 overflow-hidden"><span className="absolute -right-6 -top-6 h-12 w-12 rotate-45 border-b border-l border-border bg-surface shadow-ink-sm" /></span>;
}

export function ProductFrame({ children, title = "Review inbox", live = true, className = "" }: { children: React.ReactNode; title?: string; live?: boolean; className?: string }) {
  return <div className={`relative overflow-hidden rounded-2xl border-[1.5px] border-border bg-card shadow-ink-md ${className}`}><FoldedCorner /><div className="flex items-center justify-between border-b border-border px-4 py-3"><div className="flex items-center gap-2"><div className="flex gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-border" /><span className="h-2.5 w-2.5 rounded-full bg-border" /><span className="h-2.5 w-2.5 rounded-full bg-border" /></div><span className="ml-1 text-xs font-semibold text-muted-foreground">{title}</span></div>{live ? <span className="flex items-center gap-1.5 rounded-full bg-tint-mint px-2.5 py-1 text-[10px] font-bold text-accent-green"><span className="h-1.5 w-1.5 rounded-full bg-accent-green" />Live</span> : null}</div>{children}</div>;
}

export function TintCard({ icon: Icon, tint = "mint", accent = "navy", label, title, body, bullets = [], href, children }: { icon?: LucideIcon; tint?: Tint; accent?: string; label?: string; title: string; body: string; bullets?: string[]; href?: string; children?: React.ReactNode }) {
  return <article className={`rounded-2xl border-[1.5px] border-border p-6 shadow-ink-sm transition-shadow hover:-translate-y-1 hover:shadow-ink-md ${tintClass[tint]}`}>
    {Icon ? <div className={`mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-card/70 ${accentClass[accent] ?? "text-primary"}`}><Icon className="h-5 w-5" /></div> : null}
    {label ? <p className="text-[0.7rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</p> : null}
    <h3 className="mt-2 text-xl font-bold text-primary">{title}</h3><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{body}</p>
    {bullets.length ? <ul className="mt-5 space-y-2.5">{bullets.map((bullet) => <li key={bullet} className="flex items-start gap-2 text-sm text-primary"><Check className="mt-0.5 h-4 w-4 shrink-0 text-accent-green" />{bullet}</li>)}</ul> : null}
    {children}
    {href ? <Link href={href} className="group mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary underline-offset-4 hover:underline">Learn more <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></Link> : null}
  </article>;
}

export function FeatureCard(props: { icon: LucideIcon; accent?: "green" | "navy" | "coral" | "marigold"; label?: string; title: string; body: string; bullets?: string[]; href?: string }) {
  const tint = props.accent === "green" ? "mint" : props.accent === "marigold" ? "butter" : props.accent === "coral" ? "peach" : "navy";
  return <TintCard {...props} tint={tint} />;
}

export function StatRow({ stats }: { stats: Array<{ value: string; label: string; detail?: string }> }) {
  return <div className="grid gap-6 sm:grid-cols-3">{stats.map((stat) => <div key={stat.label} className="border-l-2 border-accent-marigold pl-4"><div className="font-mono text-3xl font-semibold tracking-tight text-primary">{stat.value}</div><div className="mt-1 text-sm font-semibold text-primary">{stat.label}</div>{stat.detail ? <div className="mt-1 text-xs text-muted-foreground">{stat.detail}</div> : null}</div>)}</div>;
}

type MarqueeItem = { name: string; quote: string };

export function Marquee({ items }: { items: MarqueeItem[] }) {
  const track = [...items, ...items];
  return <div className="marquee overflow-hidden" aria-label="Example review snippets"><div className="marquee-track flex w-max gap-4 py-2">{track.map((item, index) => <div key={`${item.name}-${index}`} className="w-[240px] shrink-0 rounded-xl border-[1.5px] border-border bg-card px-4 py-3 text-sm text-muted-foreground shadow-ink-sm"><span className="mb-1 block text-[0.65rem] font-bold uppercase tracking-[0.12em] text-accent-marigold">Example review</span><span className="mb-1 block text-xs font-semibold text-primary">{item.name}</span>“{item.quote}”</div>)}</div></div>;
}

export function FAQItem({ question, answer, dark = false }: { question: string; answer: string; dark?: boolean }) {
  return <details className={`group overflow-hidden rounded-2xl border-[1.5px] ${dark ? "border-white/15 bg-white/5" : "border-border bg-card"}`}><summary className={`flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-left text-sm font-semibold marker:hidden ${dark ? "text-background" : "text-primary"}`}>{question}<ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" /></summary><p className={`px-5 pb-5 text-sm leading-relaxed ${dark ? "text-background/70" : "text-muted-foreground"}`}>{answer}</p></details>;
}

export function CTASection({ dark = false, title, body }: { dark?: boolean; title: string; body: string }) {
  return <section className={dark ? "bg-ink-900 py-20 md:py-24" : "relative overflow-hidden bg-surface py-20 md:py-24"}><div className="mx-auto max-w-3xl px-4 text-center md:px-6"><div className={`relative rounded-2xl border-[1.5px] p-8 shadow-ink-md md:p-12 ${dark ? "border-white/15 bg-ink-800" : "border-border bg-card"}`}><FoldedCorner /><h2 className={`text-balance text-3xl font-extrabold sm:text-4xl ${dark ? "text-background" : "text-primary"}`}>{title}</h2><p className={`mx-auto mt-4 max-w-2xl text-lg leading-relaxed ${dark ? "text-background/70" : "text-muted-foreground"}`}>{body}</p><div className="mt-8 flex flex-wrap justify-center gap-3"><Button size="lg" variant="accent" asChild><Link href="/signup">Start free trial <ArrowRight className="h-4 w-4" /></Link></Button><Button size="lg" variant={dark ? "primary-on-ink" : "outline"} asChild><Link href="/demo">See a live demo</Link></Button></div></div></div></section>;
}
