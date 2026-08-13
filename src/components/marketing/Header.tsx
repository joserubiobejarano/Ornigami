"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, MapPin, Menu, MessageSquare, Send, X } from "lucide-react";

import { Button } from "@/components/ui/button";

const agents = [
  { name: "Review Replies", description: "Thoughtful replies to every review", href: "/review-replies", icon: MessageSquare, accent: "text-navy" },
  { name: "Review Booster", description: "A gentle nudge for more reviews", href: "/review-booster", icon: Send, accent: "text-accent-green" },
  { name: "Local visibility", description: "Keep your Google profile working", href: "/local-seo", icon: MapPin, accent: "text-accent-marigold" },
];

export function Header() {
  const [productsOpen, setProductsOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => { if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setProductsOpen(false); };
    const handleScroll = () => setScrolled(window.scrollY > 8);
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => { document.removeEventListener("mousedown", handleClickOutside); window.removeEventListener("scroll", handleScroll); };
  }, []);

  return <header className={`sticky top-0 z-50 border-b bg-background/90 backdrop-blur-md transition-shadow ${scrolled ? "border-border shadow-ink-sm" : "border-transparent"}`}>
    <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-4 md:px-6 lg:px-8">
      <Link href="/" className="shrink-0" aria-label="Ornigami home"><Image src="/logo-ink.svg" alt="Ornigami" width={180} height={72} className="h-10 w-[150px] object-contain object-left dark:hidden" priority /><Image src="/logo-paper.svg" alt="Ornigami" width={180} height={72} className="hidden h-10 w-[150px] object-contain object-left dark:block" priority /></Link>
      <nav className="hidden items-center gap-1 md:flex">
        <div ref={dropdownRef} className="relative" onMouseEnter={() => setProductsOpen(true)} onMouseLeave={() => setProductsOpen(false)}>
          <button onClick={() => setProductsOpen((value) => !value)} className="flex items-center gap-1 rounded-full px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" aria-expanded={productsOpen}>Products <ChevronDown className={`h-3.5 w-3.5 transition-transform ${productsOpen ? "rotate-180" : ""}`} /></button>
          <AnimatePresence>{productsOpen ? <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={{ duration: 0.14 }} className="absolute left-0 top-full mt-1.5 w-80 overflow-hidden rounded-2xl border-[1.5px] border-border bg-card p-2 shadow-ink-md">
            {agents.map((agent) => <Link key={agent.href} href={agent.href} onClick={() => setProductsOpen(false)} className="flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-surface"><span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface"><agent.icon className={`h-4 w-4 ${agent.accent}`} /></span><span><span className="block text-sm font-medium text-primary">{agent.name}</span><span className="block text-xs text-muted-foreground">{agent.description}</span></span></Link>)}
            <div className="mt-1 border-t border-border pt-1"><Link href="/demo" onClick={() => setProductsOpen(false)} className="block rounded-xl px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-surface hover:text-primary">See a live demo</Link></div>
          </motion.div> : null}</AnimatePresence>
        </div>
        <Link href="/pricing" className="rounded-full px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface hover:text-primary">Pricing</Link>
      </nav>
      <div className="hidden items-center gap-2 md:flex"><Button variant="ghost" size="sm" asChild><Link href="/login">Log in</Link></Button><Button variant="accent" asChild><Link href="/signup">Start free trial</Link></Button></div>
      <button onClick={() => setMobileOpen((value) => !value)} className="flex h-9 w-9 items-center justify-center rounded-full outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-ring md:hidden" aria-label="Toggle menu" aria-expanded={mobileOpen}>{mobileOpen ? <X className="h-5 w-5 text-muted-foreground" /> : <Menu className="h-5 w-5 text-muted-foreground" />}</button>
    </div>
    <AnimatePresence>{mobileOpen ? <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden border-t border-border bg-background md:hidden"><div className="space-y-1 px-4 pb-5 pt-3"><p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Products</p>{agents.map((agent) => <Link key={agent.href} href={agent.href} onClick={() => setMobileOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-surface"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface"><agent.icon className={`h-4 w-4 ${agent.accent}`} /></span><span className="text-sm font-medium text-primary">{agent.name}</span></Link>)}<div className="mt-2 border-t border-border pt-2"><Link href="/pricing" onClick={() => setMobileOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-surface">Pricing</Link><Link href="/login" onClick={() => setMobileOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-surface">Log in</Link><Button variant="accent" asChild className="mt-2 w-full"><Link href="/signup" onClick={() => setMobileOpen(false)}>Start free trial</Link></Button></div></div></motion.div> : null}</AnimatePresence>
  </header>;
}
