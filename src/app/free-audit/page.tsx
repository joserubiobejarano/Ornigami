import { FreeAuditForm } from "@/components/marketing/free-audit-form";
import { PageHero, ProductFrame } from "@/components/marketing/primitives";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({ title: "Free Google Business Profile audit | Ornigami", description: "Get a quick, plain-English check of your Google Business Profile and the next fixes worth making.", path: "/free-audit" });

export default function FreeAuditPage() {
  return (
    <main>
      <PageHero
        eyebrow="Free profile check"
        title="See how your Google profile is doing."
        intro="Enter your business and get a quick, plain-English read on what's complete and what's worth fixing — free, no account needed."
      />
      <section className="mx-auto grid max-w-5xl gap-10 px-4 py-16 md:grid-cols-[.9fr_1.1fr] md:px-6 md:py-20">
        <FreeAuditForm />
        <ProductFrame title="Profile check" live={false}>
          <div className="border-b border-border bg-surface px-4 py-3 text-sm font-semibold text-primary">What you&apos;ll get</div>
          <div className="space-y-4 p-5">
            <p className="text-sm leading-relaxed text-muted-foreground">A short review of your profile with the most useful next steps first.</p>
            {["Profile completeness", "Details that help you rank", "Simple actions you can take"].map((item) => (
              <div key={item} className="flex items-center gap-2 text-sm text-primary">
                <span aria-hidden="true" className="h-2 w-2 rounded-full bg-accent-green" />
                {item}
              </div>
            ))}
          </div>
        </ProductFrame>
      </section>
    </main>
  );
}
