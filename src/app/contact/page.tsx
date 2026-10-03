import { PageHero } from "@/components/marketing/primitives";
import { ContactForm } from "@/components/marketing/contact-form";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({ title: "Contact Ornigami", description: "Send a message or feedback for the Ornigami team to review.", path: "/contact" });

export default function ContactPage() {
  return <main><PageHero eyebrow="Contact" title="We'd love to hear from you." intro="Questions, ideas, or something not working? Send a message for our team to review." /><section className="mx-auto grid max-w-5xl gap-10 px-4 py-16 md:grid-cols-[.85fr_1.15fr] md:px-6 md:py-20"><div><h2 className="text-2xl font-bold text-primary">Messages are saved for review.</h2><p className="mt-4 leading-relaxed text-muted-foreground">Use the form for general questions or feedback. If you include your email, our team can use it to follow up.</p><div className="mt-8 rounded-2xl border-[1.5px] border-border bg-tint-peach p-6"><p className="text-sm font-semibold text-primary">Feedback</p><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Tell us what felt easy, what felt unclear, or what would make your day better.</p></div></div><ContactForm /></section></main>;
}
