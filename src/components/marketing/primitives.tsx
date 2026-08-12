"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, Check, ChevronDown, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { reveal, revealTransition } from "@/lib/motion";

export function Eyebrow({ children, light = false }: { children: React.ReactNode; light?: boolean }) {
  return <p className={`text-xs font-bold uppercase tracking-[0.14em] ${light ? "text-slate-300" : "text-muted-foreground"}`}>{children}</p>;
}

export function SectionHeading({ eyebrow, title, intro, light = false, align = "left" }: { eyebrow: string; title: string; intro?: string; light?: boolean; align?: "left" | "center" }) {
  return (
    <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }} variants={reveal} transition={revealTransition} className={align === "center" ? "mx-auto max-w-3xl text-center" : "max-w-2xl"}>
      <Eyebrow light={light}>{eyebrow}</Eyebrow>
      <h2 className={`mt-3 text-3xl font-bold sm:text-4xl lg:text-5xl ${light ? "text-slate-50" : "text-primary"}`}>{title}</h2>
      {intro ? <p className={`mt-4 text-lg leading-relaxed ${light ? "text-slate-300" : "text-muted-foreground"}`}>{intro}</p> : null}
    </motion.div>
  );
}

export function PageHero({ eyebrow, title, intro }: { eyebrow: string; title: string; intro: string }) {
  return (
    <section className="border-b border-border bg-surface/60 py-20 md:py-24">
      <div className="mx-auto max-w-7xl px-4 text-center md:px-6 lg:px-8"><div className="mx-auto max-w-3xl"><Eyebrow>{eyebrow}</Eyebrow><h1 className="mt-4 text-4xl font-bold text-primary sm:text-5xl lg:text-6xl">{title}</h1><p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">{intro}</p></div></div>
    </section>
  );
}

export function FeatureCard({ icon: Icon, accent = "purple", label, title, body, bullets = [], href }: { icon: LucideIcon; accent?: "purple" | "green" | "yellow"; label?: string; title: string; body: string; bullets?: string[]; href?: string }) {
  const accentClass = accent === "green" ? "text-accent-green" : accent === "yellow" ? "text-accent-yellow" : "text-accent-purple";
  return <motion.article whileHover={{ y: -3 }} transition={{ duration: 0.15 }} className="rounded-2xl border border-border bg-card p-6 shadow-sm transition-shadow hover:shadow-md"><div className={`mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-surface ${accentClass}`}><Icon className="h-5 w-5" /></div>{label ? <Eyebrow>{label}</Eyebrow> : null}<h3 className="mt-2 text-xl font-semibold text-primary">{title}</h3><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{body}</p>{bullets.length ? <ul className="mt-5 space-y-2.5">{bullets.map((bullet) => <li key={bullet} className="flex items-start gap-2 text-sm text-primary"><Check className="mt-0.5 h-4 w-4 shrink-0 text-accent-green" />{bullet}</li>)}</ul> : null}{href ? <Link href={href} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary underline-offset-4 hover:underline">Learn more <ArrowRight className="h-4 w-4" /></Link> : null}</motion.article>;
}

export function FAQItem({ question, answer, dark = false }: { question: string; answer: string; dark?: boolean }) {
  return <details className={`group overflow-hidden rounded-2xl border ${dark ? "border-slate-700 bg-slate-900/40" : "border-border bg-card"}`}><summary className={`flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-left text-sm font-semibold marker:hidden ${dark ? "text-slate-100" : "text-primary"}`}>{question}<ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" /></summary><p className={`px-5 pb-5 text-sm leading-relaxed ${dark ? "text-slate-300" : "text-muted-foreground"}`}>{answer}</p></details>;
}

export function CTASection({ dark = false, title, body }: { dark?: boolean; title: string; body: string }) {
  return <section className={dark ? "bg-navy-900 py-20 md:py-24" : "bg-surface py-20 md:py-24"}><motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }} variants={reveal} transition={revealTransition} className="mx-auto max-w-3xl px-4 text-center md:px-6"><h2 className={`text-3xl font-bold sm:text-4xl ${dark ? "text-slate-50" : "text-primary"}`}>{title}</h2><p className={`mx-auto mt-4 max-w-2xl text-lg leading-relaxed ${dark ? "text-slate-300" : "text-muted-foreground"}`}>{body}</p><div className="mt-8 flex flex-wrap justify-center gap-3"><Button size="lg" asChild><Link href="/signup">Start free trial <ArrowRight className="h-4 w-4" /></Link></Button><Button size="lg" variant={dark ? "secondary" : "outline"} asChild><Link href="/demo">See a live demo</Link></Button></div></motion.div></section>;
}

export function FoldedCorner() {
  return <span aria-hidden="true" className="pointer-events-none absolute right-0 top-0 h-12 w-12 overflow-hidden"><span className="absolute -right-6 -top-6 h-12 w-12 rotate-45 border-b border-l border-border bg-surface shadow-sm" /></span>;
}
