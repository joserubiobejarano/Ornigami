import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { safeLogger } from "@/lib/safe-logger";

config({ path: ".env.local" });
config();

import {
  businessPromptSettings,
  businesses,
  conversations,
  formSubmissions,
  leadEvents,
  leads,
  messages,
} from "@/server/db/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to run seed.");
}

const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql);

async function seed() {
  const slug = "demo-dental-studio";

  const existingBusiness = await db
    .select()
    .from(businesses)
    .where(eq(businesses.slug, slug))
    .limit(1);

  const business = existingBusiness[0]
    ? (
        await db
          .update(businesses)
          .set({
            preferredChannel: "whatsapp",
            whatsappSenderStatus: "approved",
            whatsappEnabled: true,
            whatsappActivatedAt: new Date(),
            smsEnabled: true,
            twilioPhoneNumber: "+15799002615",
            notificationEmail: "manager@demodentalstudio.com",
            notificationWhatsapp: "+15557654321",
            notifyOwnerViaEmail: true,
            notifyOwnerViaWhatsapp: true,
            notifyOnUrgent: true,
            notifyOnQualificationReady: true,
            notifyOnNewLead: false,
            updatedAt: new Date(),
          })
          .where(eq(businesses.id, existingBusiness[0].id))
          .returning()
      )[0]
    : (
        await db
          .insert(businesses)
          .values({
            name: "Demo Dental Studio",
            slug,
            email: "hello@demodentalstudio.com",
            phone: "+15551234567",
            preferredChannel: "whatsapp",
            whatsappSenderStatus: "approved",
            whatsappEnabled: true,
            whatsappActivatedAt: new Date(),
            smsEnabled: true,
            twilioPhoneNumber: "+15799002615",
            notificationEmail: "manager@demodentalstudio.com",
            notificationPhone: "+15557654321",
            notificationWhatsapp: "+15557654321",
            notifyOwnerViaEmail: true,
            notifyOwnerViaWhatsapp: true,
            notifyOnUrgent: true,
            notifyOnQualificationReady: true,
            notifyOnNewLead: false,
          })
          .returning()
      )[0];

  const existingLead = await db
    .select()
    .from(leads)
    .where(
      and(
        eq(leads.businessId, business.id),
        eq(leads.phone, "+15559876543"),
        eq(leads.email, "patient@example.com"),
      ),
    )
    .limit(1);

  const lead =
    existingLead[0] ??
    (
      await db
        .insert(leads)
        .values({
          businessId: business.id,
          fullName: "Alex Johnson",
          phone: "+15559876543",
          email: "patient@example.com",
          source: "hosted_form",
          status: "new",
          intent: "teeth_whitening",
          urgency: "this_week",
          summary: "Interested in teeth whitening consultation.",
          notes: "Requested late afternoon call.",
        })
        .returning()
    )[0];

  const existingPromptSettings = await db
    .select({ id: businessPromptSettings.id })
    .from(businessPromptSettings)
    .where(eq(businessPromptSettings.businessId, business.id))
    .limit(1);

  if (existingPromptSettings.length === 0) {
    await db.insert(businessPromptSettings).values({
      businessId: business.id,
      businessDescription:
        "Family-focused dental studio offering preventative and cosmetic dentistry.",
      servicesSummary: "General cleaning, whitening, veneers, emergency dental care.",
      toneOfVoice: "friendly",
      offeredServices: [
        "general cleaning",
        "teeth whitening",
        "veneers",
        "emergency dental care",
      ],
      notOfferedServices: ["orthodontic braces", "wisdom tooth surgery"],
      qualificationRules: {
        askFor: ["service_needed", "timeline", "insurance"],
      },
      faqContext: {
        parking: "Street parking is available.",
        hours: "Mon-Fri 9:00-18:00",
      },
      escalationRules: {
        emergencyKeywords: ["pain", "bleeding", "swelling"],
        notifyPhone: business.notificationPhone,
      },
    });
  }

  const existingConversation = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.businessId, business.id),
        eq(conversations.leadId, lead.id),
        eq(conversations.channel, "whatsapp"),
      ),
    )
    .limit(1);

  const conversation =
    existingConversation[0] ??
    (
      await db
        .insert(conversations)
        .values({
          businessId: business.id,
          leadId: lead.id,
          channel: "whatsapp",
          externalContactId: "whatsapp:+15559876543",
          aiState: {
            stage: "qualification",
            asked: ["service_needed"],
          },
        })
        .returning()
    )[0];

  const existingInbound = await db
    .select({ id: messages.id })
    .from(messages)
    .where(eq(messages.externalMessageId, "SM_DEMO_INBOUND_001"))
    .limit(1);

  if (existingInbound.length === 0) {
    await db.insert(messages).values({
      businessId: business.id,
      conversationId: conversation.id,
      direction: "inbound",
      senderType: "lead",
      channel: "whatsapp",
      externalMessageId: "SM_DEMO_INBOUND_001",
      body: "Hi, I need a teeth whitening appointment this week.",
      rawPayload: { seed: true, type: "inbound" },
      deliveryStatus: "received",
    });
  }

  const existingOutbound = await db
    .select({ id: messages.id })
    .from(messages)
    .where(eq(messages.externalMessageId, "SM_DEMO_OUTBOUND_001"))
    .limit(1);

  if (existingOutbound.length === 0) {
    await db.insert(messages).values({
      businessId: business.id,
      conversationId: conversation.id,
      direction: "outbound",
      senderType: "ai",
      channel: "whatsapp",
      externalMessageId: "SM_DEMO_OUTBOUND_001",
      body: "Thanks for reaching out. Are mornings or afternoons better for you this week?",
      rawPayload: { seed: true, type: "outbound" },
      deliveryStatus: "sent",
    });
  }

  const existingSubmission = await db
    .select({ id: formSubmissions.id })
    .from(formSubmissions)
    .where(
      and(
        eq(formSubmissions.businessId, business.id),
        eq(formSubmissions.sourceLabel, "seed_demo"),
      ),
    )
    .limit(1);

  if (existingSubmission.length === 0) {
    await db.insert(formSubmissions).values({
      businessId: business.id,
      leadId: lead.id,
      sourceLabel: "seed_demo",
      payload: {
        fullName: "Alex Johnson",
        phone: "+15559876543",
        email: "patient@example.com",
        message: "Need teeth whitening consultation.",
      },
    });
  }

  const existingEvent = await db
    .select({ id: leadEvents.id })
    .from(leadEvents)
    .where(
      and(
        eq(leadEvents.businessId, business.id),
        eq(leadEvents.leadId, lead.id),
        eq(leadEvents.eventType, "demo.seeded"),
      ),
    )
    .limit(1);

  if (existingEvent.length === 0) {
    await db.insert(leadEvents).values({
      businessId: business.id,
      leadId: lead.id,
      eventType: "demo.seeded",
      payload: {
        conversationId: conversation.id,
      },
    });
  }

  safeLogger.info(
    'Seed complete: ensured sample business and demo lead/conversation/messages dataset.',
  );
}

seed().catch((error) => {
  safeLogger.error("Seed failed:", { error: error instanceof Error ? error.message : "unknown" });
  process.exitCode = 1;
});
