import { PageHero } from "@/components/marketing/primitives";
import { ContactForm } from "@/components/marketing/contact-form";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({ title: "Contact Ornigami", description: "Have a question, idea, or issue? Send a message to the Ornigami team and a real person will reply.", path: "/contact" });

export default function ContactPage() {
  return <main><PageHero eyebrow="Contact" title="We'd love to hear from you." intro="Questions, ideas, or something not working — send it over and a real person will reply." /><section className="mx-auto grid max-w-5xl gap-10 px-4 py-16 md:grid-cols-[.85fr_1.15fr] md:px-6 md:py-20"><div><h2 className="text-2xl font-bold text-primary">A real person will read it.</h2><p className="mt-4 leading-relaxed text-muted-foreground">Use the form for general questions or feedback. We keep the conversation clear and useful.</p><div className="mt-8 rounded-2xl border-[1.5px] border-border bg-tint-peach p-6"><p className="text-sm font-semibold text-primary">Feedback</p><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Tell us what felt easy, what felt unclear, or what would make your day better.</p></div></div><ContactForm /></section></main>;
}
