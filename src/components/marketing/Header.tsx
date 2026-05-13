"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { ChevronDown, MessageSquare, Star, FileText, Menu, X } from "lucide-react";

const agents = [
  {
    name: "Review Replies",
    description: "AI drafts for every Google review",
    href: "/review-replies",
    icon: MessageSquare,
    gradient: "from-purple-500 to-sky-400",
  },
  {
    name: "Review Booster",
    description: "Turn customers into 5-star reviewers",
    href: "/review-booster",
    icon: Star,
    gradient: "from-orange-400 to-pink-500",
  },
  {
    name: "Local SEO Content",
    description: "Blogs, posts and FAQs for your city",
    href: "/local-seo",
    icon: FileText,
    gradient: "from-emerald-400 to-teal-500",
  },
];

export function Header() {
  const [productsOpen, setProductsOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setProductsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-100 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 md:px-6 lg:px-8">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-orange-400">
            <span className="text-xs font-bold text-white">LL</span>
          </div>
          <span className="text-base font-semibold tracking-tight text-slate-900">LocalLift</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 md:flex">
          <div
            ref={dropdownRef}
            className="relative"
            onMouseEnter={() => setProductsOpen(true)}
            onMouseLeave={() => setProductsOpen(false)}
          >
            <button
              onClick={() => setProductsOpen((v) => !v)}
              className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
            >
              Products
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform duration-200 ${productsOpen ? "rotate-180" : ""}`}
              />
            </button>

            <AnimatePresence>
              {productsOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.97 }}
                  transition={{ duration: 0.14, ease: "easeOut" }}
                  className="absolute left-0 top-full mt-1.5 w-72 overflow-hidden rounded-2xl border border-slate-100 bg-white p-2 shadow-xl shadow-slate-200/70"
                >
                  {agents.map((agent) => (
                    <Link
                      key={agent.href}
                      href={agent.href}
                      onClick={() => setProductsOpen(false)}
                      className="flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-slate-50"
                    >
                      <div
                        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${agent.gradient}`}
                      >
                        <agent.icon className="h-3.5 w-3.5 text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-900">{agent.name}</p>
                        <p className="text-xs text-slate-500">{agent.description}</p>
                      </div>
                    </Link>
                  ))}
                  <div className="mt-1 border-t border-slate-100 pt-1">
                    <Link
                      href="/demo"
                      onClick={() => setProductsOpen(false)}
                      className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
                    >
                      <span>↗</span> Try live demo with sample data
                    </Link>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <Link
            href="/pricing"
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
          >
            Pricing
          </Link>
          <Link
            href="/free-audit"
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
          >
            Free audit
          </Link>
        </nav>

        {/* Desktop actions */}
        <div className="hidden items-center gap-3 md:flex">
          <Link
            href="/login"
            className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="inline-flex items-center rounded-full bg-gradient-to-r from-orange-400 to-pink-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:brightness-105"
          >
            Try it free
          </Link>
        </div>

        {/* Mobile toggle */}
        <button
          onClick={() => setMobileOpen((v) => !v)}
          className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-slate-100 md:hidden"
          aria-label="Toggle menu"
        >
          {mobileOpen ? (
            <X className="h-5 w-5 text-slate-600" />
          ) : (
            <Menu className="h-5 w-5 text-slate-600" />
          )}
        </button>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden border-t border-slate-100 bg-white md:hidden"
          >
            <div className="space-y-1 px-4 pb-5 pt-3">
              <p className="px-3 pb-1 pt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Products
              </p>
              {agents.map((agent) => (
                <Link
                  key={agent.href}
                  href={agent.href}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-slate-50"
                >
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${agent.gradient}`}
                  >
                    <agent.icon className="h-3.5 w-3.5 text-white" />
                  </div>
                  <span className="text-sm font-medium text-slate-700">{agent.name}</span>
                </Link>
              ))}
              <div className="border-t border-slate-100 pt-2">
                <Link
                  href="/pricing"
                  onClick={() => setMobileOpen(false)}
                  className="block rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  Pricing
                </Link>
                <Link
                  href="/free-audit"
                  onClick={() => setMobileOpen(false)}
                  className="block rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  Free audit
                </Link>
              </div>
              <div className="flex flex-col gap-2 border-t border-slate-100 pt-2">
                <Link
                  href="/login"
                  onClick={() => setMobileOpen(false)}
                  className="block rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
                >
                  Log in
                </Link>
                <Link
                  href="/signup"
                  onClick={() => setMobileOpen(false)}
                  className="block rounded-full bg-gradient-to-r from-orange-400 to-pink-500 px-3 py-2.5 text-center text-sm font-semibold text-white"
                >
                  Try it free
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
