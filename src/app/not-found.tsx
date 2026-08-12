import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";

export default function NotFound() {
  return (
    <main className="flex min-h-[70vh] items-center justify-center px-6 py-20">
      <div className="max-w-md text-center">
        <BrandMark className="mx-auto h-12 w-12 text-violet-700" />
        <p className="mt-6 text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">404</p>
        <h1 className="mt-3 text-3xl font-semibold">That page is not here</h1>
        <p className="mt-3 text-muted-foreground">The link may be outdated, or the page may have moved.</p>
        <Link href="/" className="mt-7 inline-flex rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90">Back to Ornigami</Link>
      </div>
    </main>
  );
}
