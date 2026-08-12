import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-[70vh] items-center justify-center px-6 py-20">
      <div className="max-w-md text-center">
        <BrandMark className="mx-auto h-12 w-12 text-accent-purple" />
        <p className="mt-6 text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">404</p>
        <h1 className="mt-3 text-3xl font-semibold">That page is not here</h1>
        <p className="mt-3 text-muted-foreground">The link may be outdated, or the page may have moved.</p>
        <Button className="mt-7" asChild><Link href="/">Back to Ornigami</Link></Button>
      </div>
    </main>
  );
}
