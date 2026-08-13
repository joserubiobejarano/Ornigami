import { JsonLd } from "@/components/seo/json-ld";
import { CTASection, Eyebrow, FAQItem } from "@/components/marketing/primitives";
import { PricingPlans } from "@/components/marketing/pricing-plans";
import { createPageMetadata } from "@/lib/seo";
import { PLANS, PLAN_ORDER } from "@/lib/billing/plans";

const faqs = [["What happens after the trial?", "Your plan continues after 14 days. Cancel anytime from billing."], ["Do I need a website?", "No. Ornigami works with your Google Business Profile, with or without a website."], ["Will you post without approval?", "Only eligible replies can be configured for automatic posting. Approve-first remains the default."], ["Can I manage more than one location?", "For now, one location per subscription. Managing several at once is on the way."]] as const;

export const metadata = createPageMetadata({ title: "Simple pricing for local reputation workflows | Ornigami", description: "Choose a clear, location-based Ornigami plan for review replies, review follow-ups, or both. Start with a 14-day free trial.", path: "/pricing" });

export default function PricingPage() {
  const offers = PLAN_ORDER.map((planId) => ({ "@type": "Offer", name: PLANS[planId].name, price: String(PLANS[planId].amounts.monthly), priceCurrency: "EUR", url: "https://ornigami.com/pricing" }));
  return <><JsonLd data={{ "@context": "https://schema.org", "@type": "SoftwareApplication", name: "Ornigami", applicationCategory: "BusinessApplication", operatingSystem: "Web", offers }} /><JsonLd data={{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs.map(([question, answer]) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })) }} /><main><section className="bg-surface/60 py-20 text-center md:py-24"><div className="mx-auto max-w-3xl px-4 md:px-6"><Eyebrow tint="butter">Pricing</Eyebrow><h1 className="mt-5 text-balance text-[clamp(2.6rem,6vw,4.5rem)] font-extrabold leading-[1.03] text-primary">Simple pricing for local businesses.</h1><p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">Start free for 14 days. No card required. Cancel anytime.</p></div></section><PricingPlans /><section className="bg-ink-900 px-4 py-20 md:px-6"><div className="mx-auto max-w-3xl"><Eyebrow light tint="butter">Questions</Eyebrow><h2 className="mt-4 text-3xl font-extrabold text-background sm:text-4xl">Answers before you start.</h2><div className="mt-8 space-y-3">{faqs.map(([question, answer]) => <FAQItem dark key={question} question={question} answer={answer} />)}</div></div></section><CTASection title="A calmer way to keep your reputation growing." body="Start free today — no card required." /></main></>;
}
