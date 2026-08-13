"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";

const groups = [
  { title: "Product", links: [["Review Replies", "/review-replies"], ["Review Booster", "/review-booster"], ["Local visibility", "/local-seo"], ["Pricing", "/pricing"], ["Live demo", "/demo"]] },
  { title: "Company", links: [["About", "/about"], ["Contact", "/contact"]] },
  { title: "Legal", links: [["Privacy", "/privacy"], ["Terms", "/terms"]] },
];

export function Footer() {
  const pathname = usePathname();
  if (pathname === "/demo") return <footer className="border-t border-border bg-background"><div className="mx-auto max-w-7xl px-4 py-6 md:px-6 lg:px-8"><p className="text-center text-sm text-muted-foreground">© {new Date().getFullYear()} Ornigami. All rights reserved.</p></div></footer>;
  return <footer className="border-t border-border bg-background"><div className="mx-auto max-w-7xl px-4 py-14 md:px-6 lg:px-8"><div className="grid gap-10 sm:grid-cols-2 md:grid-cols-[1.7fr_repeat(3,1fr)]"><div><Link href="/" className="inline-flex"><Image src="/logo-ink.svg" alt="Ornigami" width={180} height={72} className="h-10 w-[150px] object-contain object-left dark:hidden" /><Image src="/logo-paper.svg" alt="Ornigami" width={180} height={72} className="hidden h-10 w-[150px] object-contain object-left dark:block" /></Link><p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">Ornigami is a calm workspace for local businesses to reply to reviews, follow up with customers, and stay easy to find.</p></div>{groups.map((group) => <div key={group.title}><h3 className="mb-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">{group.title}</h3><ul className="space-y-2.5 text-sm">{group.links.map(([label, href]) => <li key={href}><Link href={href} className="text-muted-foreground transition-colors hover:text-primary">{label}</Link></li>)}</ul></div>)}</div><div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border pt-6 md:flex-row"><p className="text-xs text-muted-foreground">© {new Date().getFullYear()} Ornigami. All rights reserved.</p><Button variant="accent" asChild><Link href="/signup">Start free trial</Link></Button></div></div></footer>;
}
