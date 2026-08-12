"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";

const groups = [
  { title: "Product", links: [["Review Replies", "/review-replies"], ["Review Booster", "/review-booster"], ["Pricing", "/pricing"], ["Live demo", "/demo"]] },
  { title: "Company", links: [["About", "/about"], ["Contact", "/contact"]] },
  { title: "Legal", links: [["Privacy", "/privacy"], ["Terms", "/terms"]] },
];

export function Footer() {
  const pathname = usePathname();
  if (pathname === "/demo") return <footer className="border-t border-border bg-white"><div className="mx-auto max-w-7xl px-4 py-6 md:px-6 lg:px-8"><p className="text-center text-sm text-muted-foreground">© {new Date().getFullYear()} Ornigami. All rights reserved.</p></div></footer>;
  return <footer className="border-t border-border bg-white"><div className="mx-auto max-w-7xl px-4 py-10 md:px-6 lg:px-8"><div className="grid gap-8 sm:grid-cols-2 md:grid-cols-4"><div><Link href="/" className="inline-flex items-center gap-2.5"><BrandMark className="h-8 w-8 text-accent-purple" /><span className="text-base font-semibold text-primary">Ornigami</span></Link><p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">Practical tools for reputation and follow-up workflows at local businesses.</p></div>{groups.map((group) => <div key={group.title}><h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">{group.title}</h3><ul className="space-y-2 text-sm">{group.links.map(([label, href]) => <li key={href}><Link href={href} className="text-muted-foreground transition-colors hover:text-primary">{label}</Link></li>)}</ul></div>)}</div><div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-border pt-6 md:flex-row"><p className="text-xs text-muted-foreground">© {new Date().getFullYear()} Ornigami. All rights reserved.</p><Button asChild><Link href="/signup">Start free trial</Link></Button></div></div></footer>;
}
