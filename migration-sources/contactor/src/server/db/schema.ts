import {
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const preferredChannelEnum = pgEnum("preferred_channel", ["sms", "whatsapp"]);
export const leadSourceEnum = pgEnum("lead_source", [
  "hosted_form",
  "embed_form",
  "sms",
  "whatsapp",
  "manual",
]);
export const leadStatusEnum = pgEnum("lead_status", [
  "new",
  "qualified",
  "contacted",
  "closed",
]);
export const conversationChannelEnum = pgEnum("conversation_channel", [
  "sms",
  "whatsapp",
]);
export const messageDirectionEnum = pgEnum("message_direction", [
  "inbound",
  "outbound",
]);
export const senderTypeEnum = pgEnum("sender_type", ["lead", "ai", "staff", "system"]);
export const messageChannelEnum = pgEnum("message_channel", ["sms", "whatsapp"]);
export const onboardingRequestStatusEnum = pgEnum("onboarding_request_status", [
  "new",
  "reviewed",
  "configured",
  "archived",
]);
export const onboardingBusinessTypeEnum = pgEnum("onboarding_business_type", [
  "dental_clinic",
  "gym",
  "restaurant",
  "aesthetic_clinic",
  "salon",
  "other",
]);
export const onboardingLeadChannelEnum = pgEnum("onboarding_lead_channel", [
  "whatsapp",
  "sms",
]);
export const onboardingPricingModeEnum = pgEnum("onboarding_pricing_mode", [
  "exact",
  "starting_at",
  "varies",
  "do_not_discuss",
]);
export const onboardingToneEnum = pgEnum("onboarding_tone", [
  "professional",
  "warm",
  "direct",
]);
export const websitePlatformEnum = pgEnum("website_platform", [
  "wordpress",
  "webflow",
  "framer",
  "squarespace",
  "shopify",
  "custom_code",
  "other",
]);
export const languageEnum = pgEnum("language", ["english", "spanish"]);
export const dashboardUserRoleEnum = pgEnum("dashboard_user_role", ["owner", "internal_admin"]);
export const whatsappSenderStatusEnum = pgEnum("whatsapp_sender_status", [
  "not_started",
  "number_assigned",
  "pending_approval",
  "approved",
  "rejected",
]);

export const businesses = pgTable(
  "businesses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 120 }).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    phone: varchar("phone", { length: 40 }).notNull(),
    preferredChannel: preferredChannelEnum("preferred_channel")
      .notNull()
      .default("sms"),
    twilioPhoneNumber: varchar("twilio_phone_number", { length: 40 }),
    whatsappSenderStatus: whatsappSenderStatusEnum("whatsapp_sender_status")
      .notNull()
      .default("not_started"),
    whatsappDisplayName: varchar("whatsapp_display_name", { length: 120 }),
    whatsappBusinessCategory: varchar("whatsapp_business_category", { length: 120 }),
    whatsappActivatedAt: timestamp("whatsapp_activated_at", { withTimezone: true }),
    whatsappEnabled: boolean("whatsapp_enabled").notNull().default(false),
    smsEnabled: boolean("sms_enabled").notNull().default(true),
    notificationEmail: varchar("notification_email", { length: 255 }),
    notificationPhone: varchar("notification_phone", { length: 40 }),
    notificationWhatsapp: varchar("notification_whatsapp", { length: 40 }),
    notifyOwnerViaEmail: boolean("notify_owner_via_email").notNull().default(true),
    notifyOwnerViaWhatsapp: boolean("notify_owner_via_whatsapp").notNull().default(false),
    notifyOnUrgent: boolean("notify_on_urgent").notNull().default(true),
    notifyOnQualificationReady: boolean("notify_on_qualification_ready")
      .notNull()
      .default(true),
    notifyOnNewLead: boolean("notify_on_new_lead").notNull().default(false),
    websitePlatform: websitePlatformEnum("website_platform").notNull().default("other"),
    productionTestCompletedAt: timestamp("production_test_completed_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("businesses_slug_unique").on(table.slug),
    index("businesses_created_at_idx").on(table.createdAt),
  ],
);

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }),
    fullName: varchar("full_name", { length: 200 }),
    phone: varchar("phone", { length: 40 }),
    email: varchar("email", { length: 255 }),
    source: leadSourceEnum("source").notNull(),
    status: leadStatusEnum("status").notNull().default("new"),
    intent: varchar("intent", { length: 255 }),
    urgency: varchar("urgency", { length: 80 }),
    summary: text("summary"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("leads_business_id_idx").on(table.businessId),
    index("leads_business_status_idx").on(table.businessId, table.status),
    index("leads_business_phone_idx").on(table.businessId, table.phone),
    index("leads_business_email_idx").on(table.businessId, table.email),
    index("leads_created_at_idx").on(table.createdAt),
  ],
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    channel: conversationChannelEnum("channel").notNull(),
    externalContactId: varchar("external_contact_id", { length: 100 }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    aiState: jsonb("ai_state").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("conversations_business_id_idx").on(table.businessId),
    index("conversations_lead_id_idx").on(table.leadId),
    index("conversations_lead_channel_idx").on(table.leadId, table.channel),
    index("conversations_last_message_at_idx").on(table.lastMessageAt),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    direction: messageDirectionEnum("direction").notNull(),
    senderType: senderTypeEnum("sender_type").notNull(),
    channel: messageChannelEnum("channel").notNull(),
    externalMessageId: varchar("external_message_id", { length: 100 }),
    body: text("body").notNull(),
    rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>(),
    deliveryStatus: varchar("delivery_status", { length: 60 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("messages_business_id_idx").on(table.businessId),
    index("messages_conversation_id_idx").on(table.conversationId),
    index("messages_external_message_id_idx").on(table.externalMessageId),
    index("messages_created_at_idx").on(table.createdAt),
  ],
);

export const formSubmissions = pgTable(
  "form_submissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
    sourceLabel: varchar("source_label", { length: 120 }),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("form_submissions_business_id_idx").on(table.businessId),
    index("form_submissions_lead_id_idx").on(table.leadId),
    index("form_submissions_created_at_idx").on(table.createdAt),
  ],
);

export const businessPromptSettings = pgTable(
  "business_prompt_settings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    businessDescription: text("business_description"),
    servicesSummary: text("services_summary"),
    toneOfVoice: varchar("tone_of_voice", { length: 80 }),
    offeredServices: jsonb("offered_services").$type<unknown>(),
    notOfferedServices: jsonb("not_offered_services").$type<unknown>(),
    qualificationRules: jsonb("qualification_rules").$type<Record<string, unknown>>(),
    faqContext: jsonb("faq_context").$type<Record<string, unknown>>(),
    escalationRules: jsonb("escalation_rules").$type<Record<string, unknown>>(),
    assistantLanguage: languageEnum("assistant_language").notNull().default("english"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("business_prompt_settings_business_id_unique").on(table.businessId),
  ],
);

export const leadEvents = pgTable(
  "lead_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    eventType: varchar("event_type", { length: 100 }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("lead_events_business_id_idx").on(table.businessId),
    index("lead_events_lead_id_idx").on(table.leadId),
    index("lead_events_event_type_idx").on(table.eventType),
    index("lead_events_created_at_idx").on(table.createdAt),
  ],
);

export const onboardingRequests = pgTable(
  "onboarding_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    status: onboardingRequestStatusEnum("status").notNull().default("new"),
    businessName: varchar("business_name", { length: 200 }).notNull(),
    businessType: onboardingBusinessTypeEnum("business_type").notNull(),
    websiteUrl: varchar("website_url", { length: 500 }),
    websitePlatform: websitePlatformEnum("website_platform").notNull().default("other"),
    onboardingLanguage: languageEnum("onboarding_language").notNull().default("english"),
    assistantLanguage: languageEnum("assistant_language").notNull().default("english"),
    city: varchar("city", { length: 120 }),
    contactName: varchar("contact_name", { length: 200 }).notNull(),
    contactEmail: varchar("contact_email", { length: 255 }).notNull(),
    ownerNotificationEmail: varchar("owner_notification_email", { length: 255 }),
    ownerNotificationWhatsapp: varchar("owner_notification_whatsapp", { length: 40 }),
    preferredLeadChannel: onboardingLeadChannelEnum("preferred_lead_channel")
      .notNull()
      .default("whatsapp"),
    preferredOwnerNotificationChannels: jsonb(
      "preferred_owner_notification_channels",
    )
      .$type<Array<"email" | "whatsapp">>()
      .notNull(),
    servicesOffered: jsonb("services_offered").$type<string[]>().notNull(),
    servicesNotOffered: jsonb("services_not_offered").$type<string[]>(),
    pricingMode: onboardingPricingModeEnum("pricing_mode").notNull(),
    servicePricing: jsonb("service_pricing").$type<
      Array<{
        service: string;
        price: string;
        mode: "exact" | "starting_at";
      }>
    >(),
    qualificationFields: jsonb("qualification_fields").$type<string[]>().notNull(),
    urgencyRules: text("urgency_rules"),
    toneOfVoice: onboardingToneEnum("tone_of_voice").notNull().default("professional"),
    faqNotes: text("faq_notes"),
    doNotSay: text("do_not_say"),
    additionalNotes: text("additional_notes"),
    reviewedPayload: jsonb("reviewed_payload").$type<Record<string, unknown>>(),
    configuredBusinessId: uuid("configured_business_id").references(() => businesses.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    configuredAt: timestamp("configured_at", { withTimezone: true }),
    internalNotes: text("internal_notes"),
    rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("onboarding_requests_status_idx").on(table.status),
    index("onboarding_requests_business_type_idx").on(table.businessType),
    index("onboarding_requests_created_at_idx").on(table.createdAt),
    index("onboarding_requests_contact_email_idx").on(table.contactEmail),
    index("onboarding_requests_configured_business_id_idx").on(table.configuredBusinessId),
  ],
);

export const dashboardUsers = pgTable(
  "dashboard_users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    fullName: varchar("full_name", { length: 200 }).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }),
    role: dashboardUserRoleEnum("role").notNull().default("owner"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("dashboard_users_email_unique").on(table.email),
    uniqueIndex("dashboard_users_business_id_unique").on(table.businessId),
    index("dashboard_users_role_idx").on(table.role),
  ],
);

export const dashboardUserSessions = pgTable(
  "dashboard_user_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => dashboardUsers.id, { onDelete: "cascade" }),
    sessionTokenHash: varchar("session_token_hash", { length: 255 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("dashboard_user_sessions_token_hash_unique").on(table.sessionTokenHash),
    index("dashboard_user_sessions_user_id_idx").on(table.userId),
    index("dashboard_user_sessions_expires_at_idx").on(table.expiresAt),
  ],
);

export const dashboardLoginAttempts = pgTable(
  "dashboard_login_attempts",
  {
    keyHash: varchar("key_hash", { length: 64 }).primaryKey(),
    failures: varchar("failures", { length: 10 }).notNull().default("0"),
    windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull().defaultNow(),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export const formRateLimits = pgTable(
  "form_rate_limits",
  {
    keyHash: varchar("key_hash", { length: 64 }).primaryKey(),
    hits: varchar("hits", { length: 10 }).notNull().default("0"),
    windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export type Business = typeof businesses.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type FormSubmission = typeof formSubmissions.$inferSelect;
export type BusinessPromptSetting = typeof businessPromptSettings.$inferSelect;
export type LeadEvent = typeof leadEvents.$inferSelect;
export type OnboardingRequest = typeof onboardingRequests.$inferSelect;
export type DashboardUser = typeof dashboardUsers.$inferSelect;
export type DashboardUserSession = typeof dashboardUserSessions.$inferSelect;
