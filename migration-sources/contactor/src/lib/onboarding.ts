export const onboardingBusinessTypes = [
  "dental_clinic",
  "gym",
  "restaurant",
  "aesthetic_clinic",
  "salon",
  "other",
] as const;

export type OnboardingBusinessType = (typeof onboardingBusinessTypes)[number];

export const ownerNotificationChannels = ["email", "whatsapp"] as const;
export type OwnerNotificationChannel = (typeof ownerNotificationChannels)[number];

export const onboardingPricingModes = [
  "exact",
  "starting_at",
  "varies",
  "do_not_discuss",
] as const;
export type OnboardingPricingMode = (typeof onboardingPricingModes)[number];

export const onboardingTones = ["professional", "warm", "direct"] as const;
export type OnboardingTone = (typeof onboardingTones)[number];

export const websitePlatforms = [
  "wordpress",
  "webflow",
  "framer",
  "squarespace",
  "shopify",
  "custom_code",
  "other",
] as const;
export type WebsitePlatform = (typeof websitePlatforms)[number];

export const onboardingLanguages = ["english", "spanish"] as const;
export type OnboardingLanguage = (typeof onboardingLanguages)[number];

export const businessTypeTemplates: Record<
  OnboardingBusinessType,
  {
    servicesOffered: string[];
    qualificationFields: string[];
  }
> = {
  dental_clinic: {
    servicesOffered: [
      "dental cleaning",
      "whitening",
      "veneers",
      "emergency dental care",
      "checkups",
    ],
    qualificationFields: ["urgency", "preferred timing", "service needed", "name"],
  },
  gym: {
    servicesOffered: [
      "memberships",
      "personal training",
      "group classes",
      "trial session",
    ],
    qualificationFields: ["goal / interest", "preferred timing", "membership type", "name"],
  },
  restaurant: {
    servicesOffered: [
      "reservations",
      "private events",
      "menu questions",
      "takeaway / delivery",
    ],
    qualificationFields: ["date/time", "number of people", "reason for inquiry", "name"],
  },
  aesthetic_clinic: {
    servicesOffered: ["skin consultation", "facials", "laser treatments", "fillers"],
    qualificationFields: ["service needed", "preferred timing", "budget range", "name"],
  },
  salon: {
    servicesOffered: ["haircut", "color", "styling", "bridal packages"],
    qualificationFields: ["service needed", "preferred timing", "stylist preference", "name"],
  },
  other: {
    servicesOffered: [],
    qualificationFields: ["service needed", "preferred timing", "name"],
  },
};

export const businessTypeLabels: Record<OnboardingBusinessType, string> = {
  dental_clinic: "Dental clinic",
  gym: "Gym",
  restaurant: "Restaurant",
  aesthetic_clinic: "Aesthetic clinic",
  salon: "Salon",
  other: "Other",
};

export const pricingModeLabels: Record<OnboardingPricingMode, string> = {
  exact: "Exact prices",
  starting_at: "Starting prices",
  varies: "Prices vary, team will confirm",
  do_not_discuss: "Do not discuss prices",
};

export const toneLabels: Record<OnboardingTone, string> = {
  professional: "Professional",
  warm: "Warm",
  direct: "Direct",
};

export const websitePlatformLabels: Record<WebsitePlatform, string> = {
  wordpress: "WordPress",
  webflow: "Webflow",
  framer: "Framer",
  squarespace: "Squarespace",
  shopify: "Shopify",
  custom_code: "Custom code",
  other: "Other",
};

export const onboardingLanguageLabels: Record<OnboardingLanguage, string> = {
  english: "English",
  spanish: "Spanish",
};
