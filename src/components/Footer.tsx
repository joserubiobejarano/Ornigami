"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Footer() {
  const pathname = usePathname();
  const isDemoPage = pathname === "/demo";

  if (isDemoPage) {
    return (
      <footer className="border-t border-slate-100 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 lg:px-8">
          <p className="text-center text-sm text-slate-400">
            &copy; {new Date().getFullYear()} LocalLift. All rights reserved.
          </p>
        </div>
      </footer>
    );
  }

  return (
    <footer className="border-t border-slate-100 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-12 md:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="inline-flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-orange-400">
                <span className="text-xs font-bold text-white">LL</span>
              </div>
              <span className="text-base font-semibold text-slate-900">LocalLift</span>
            </Link>
            <p className="mt-3 max-w-xs text-sm text-slate-500">
              AI-powered reputation management for local businesses.
            </p>
          </div>

          {/* Products */}
          <div>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">Products</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/review-replies" className="text-slate-600 hover:text-slate-900">
                  Review Replies
                </Link>
              </li>
              <li>
                <Link href="/review-booster" className="text-slate-600 hover:text-slate-900">
                  Review Booster
                </Link>
              </li>
              <li>
                <Link href="/local-seo" className="text-slate-600 hover:text-slate-900">
                  Local SEO Content
                </Link>
              </li>
              <li>
                <Link href="/free-audit" className="text-slate-600 hover:text-slate-900">
                  Free audit
                </Link>
              </li>
              <li>
                <Link href="/pricing" className="text-slate-600 hover:text-slate-900">
                  Pricing
                </Link>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">Company</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/demo" className="text-slate-600 hover:text-slate-900">
                  Live demo
                </Link>
              </li>
              <li>
                <Link href="/contact" className="text-slate-600 hover:text-slate-900">
                  Contact
                </Link>
              </li>
              <li>
                <Link href="/feedback" className="text-slate-600 hover:text-slate-900">
                  Feedback
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">Legal</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/privacy" className="text-slate-600 hover:text-slate-900">
                  Privacy policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="text-slate-600 hover:text-slate-900">
                  Terms of service
                </Link>
              </li>
              <li>
                <Link href="/legal" className="text-slate-600 hover:text-slate-900">
                  Legal
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-slate-100 pt-8 sm:flex-row">
          <p className="text-sm text-slate-400">
            &copy; {new Date().getFullYear()} LocalLift. All rights reserved.
          </p>
          <Link
            href="/signup"
            className="inline-flex items-center rounded-full bg-gradient-to-r from-orange-400 to-pink-500 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:brightness-105"
          >
            Try it free →
          </Link>
        </div>
      </div>
    </footer>
  );
}
