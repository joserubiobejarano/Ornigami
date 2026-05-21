import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveUser } from "@/lib/user-from-req";
import { generateLocalBlogPost, generateLocalGBPPost, generateLocalFAQs } from "@/lib/agents/localSeoAgent";
import { checkUsageLimit, incrementUsage } from "@/lib/usage";
import { safeLogger } from "@/lib/safe-logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const InputSchema = z.object({
  type: z.enum(["blog", "gbp_post", "faq"]),
  businessName: z.string().min(1),
  city: z.string().min(1),
  service: z.string().min(1),
  tone: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    // Check for demo mode header
    const isDemo = req.headers.get("x-demo") === "true";
    
    if (isDemo) {
      // Return mock response for demo users
      // Delay slightly to simulate generation
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const json = await req.json();
      const type = json.type || "blog";
      
      let mockMarkdown = "";
      if (type === "blog") {
        mockMarkdown = `# Why You Need Professional ${json.service || "Services"} in ${json.city || "Your City"}\n\nAre you looking for the best ${json.service || "service"}? Look no further! We provide top-notch solutions tailored to your needs.\n\n## Benefits\n- High quality\n- Reliable\n- Affordable\n\nContact us today at ${json.businessName || "Our Business"}!`;
      } else if (type === "gbp_post") {
        mockMarkdown = `🎉 **New Update from ${json.businessName || "Us"}!**\n\nWe are now offering premium ${json.service || "services"} in ${json.city || "town"}. Come visit us or call to book an appointment!\n\n#${json.city?.replace(/\s+/g, '') || "Local"} #${json.service?.replace(/\s+/g, '') || "Service"} #LocalBusiness`;
      } else {
        mockMarkdown = `### Frequently Asked Questions\n\n**Q: Do you offer ${json.service || "services"} in ${json.city || "my area"}?**\n\nA: Yes, we serve the entire ${json.city || "region"} with pride!\n\n**Q: How can I book?**\n\nA: Simply call us or visit our website.`;
      }
      
      return NextResponse.json({ markdown: mockMarkdown });
    }

    const user = await resolveUser(req);

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Check usage limits
    const usage = await checkUsageLimit(user.id, "ai_posts");
    if (!usage.allowed) {
      return NextResponse.json(
        {
          error: "Monthly limit reached",
          message: `You've reached your monthly limit of ${usage.limit} generations for this legacy content tool. Your usage will reset on ${usage.resetDate || "the next billing cycle"}.`,
        },
        { status: 403 }
      );
    }

    const json = await req.json();
    const parsed = InputSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }

    const { type, service, ...rest } = parsed.data;
    let markdown = "";

    // Use local SEO agent with category from service field
    const input = {
      ...rest,
      category: service,
    };

    if (type === "blog") markdown = await generateLocalBlogPost(input);
    if (type === "gbp_post") markdown = await generateLocalGBPPost(input);
    if (type === "faq") markdown = await generateLocalFAQs(input);

    // Increment usage after successful generation
    await incrementUsage(user.id, "ai_posts");

    return NextResponse.json({ markdown });
  } catch (e: unknown) {
    safeLogger.error("openai.generate.failed", {
      error: e instanceof Error ? e.message : "unknown",
    });
    return NextResponse.json({ error: "Failed to generate content. Please try again." }, { status: 500 });
  }
}
