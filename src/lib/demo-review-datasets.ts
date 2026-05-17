import type { Review } from "@/components/reviews/review-workflow";

export type DemoBusinessType = "restaurant" | "clinic" | "gym" | "salon" | "retail_store";

/** Seed row before mapping to in-app `Review` (adds `isSample`). */
export type DemoSeedReview = {
  google_review_id: string;
  reviewer_name: string;
  star_rating: number;
  comment: string;
  /** Use `replied` for pre-handled cards; otherwise `unanswered`. */
  status: string;
  reply_comment?: string;
  review_update_time?: string;
};

export type DemoBusinessDataset = {
  /** UI label for the business-type selector. */
  label: string;
  /** Passed to the AI reply API in sample mode. */
  businessNameForAi: string;
  cityForAi: string;
  reviews: DemoSeedReview[];
};

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export const DEMO_REVIEW_DATASETS: Record<DemoBusinessType, DemoBusinessDataset> = {
  restaurant: {
    label: "Restaurant",
    businessNameForAi: "Harbor Bistro",
    cityForAi: "Seattle",
    reviews: [
      {
        google_review_id: "demo-rest-1",
        reviewer_name: "Jordan Lee",
        star_rating: 5,
        comment:
          "Best brunch spot in the neighborhood. The eggs Benedict was perfect and our server checked in just the right amount.",
        status: "unanswered",
        review_update_time: daysAgo(2),
      },
      {
        google_review_id: "demo-rest-2",
        reviewer_name: "Priya N.",
        star_rating: 4,
        comment:
          "Food was great and the patio vibe is lovely. We waited almost 40 minutes for a table on Saturday,worth it, but plan ahead.",
        status: "unanswered",
        review_update_time: daysAgo(5),
      },
      {
        google_review_id: "demo-rest-3",
        reviewer_name: "Marcus Webb",
        star_rating: 3,
        comment:
          "Decent meal but my steak came out overcooked compared to how I ordered it. Manager offered a comp dessert which was nice.",
        status: "unanswered",
        review_update_time: daysAgo(8),
      },
      {
        google_review_id: "demo-rest-4",
        reviewer_name: "Elena Rossi",
        star_rating: 2,
        comment:
          "Noise level was unbearable and we found a hair in one appetizer. Staff apologized but we probably won't return.",
        status: "unanswered",
        review_update_time: daysAgo(11),
      },
      {
        google_review_id: "demo-rest-5",
        reviewer_name: "Chris O.",
        star_rating: 1,
        comment:
          "Charged twice on my card and still haven't gotten a refund after two emails. Very frustrated.",
        status: "replied",
        reply_comment:
          "Chris, we're sorry for the billing trouble , that's not the experience we want. Please DM us your reservation name and last four digits of the card and we'll escalate with our payments team today.",
        review_update_time: daysAgo(1),
      },
    ],
  },
  clinic: {
    label: "Clinic",
    businessNameForAi: "Maple Grove Family Clinic",
    cityForAi: "Denver",
    reviews: [
      {
        google_review_id: "demo-clinic-1",
        reviewer_name: "Amanda K.",
        star_rating: 5,
        comment:
          "Dr. Patel was thorough and explained everything in plain language. Front desk was organized and I was seen on time.",
        status: "unanswered",
        review_update_time: daysAgo(3),
      },
      {
        google_review_id: "demo-clinic-2",
        reviewer_name: "Robert Chen",
        star_rating: 4,
        comment:
          "Good care overall. Parking is tight during lunch hour,maybe add directions for the overflow lot on the website.",
        status: "unanswered",
        review_update_time: daysAgo(6),
      },
      {
        google_review_id: "demo-clinic-3",
        reviewer_name: "Sandra M.",
        star_rating: 3,
        comment:
          "Waited 35 minutes past my appointment time with no updates. Nurses were kind once I got back.",
        status: "unanswered",
        review_update_time: daysAgo(9),
      },
      {
        google_review_id: "demo-clinic-4",
        reviewer_name: "Kevin Doyle",
        star_rating: 2,
        comment:
          "Felt rushed during the visit and left with unanswered questions about my medication timing.",
        status: "unanswered",
        review_update_time: daysAgo(12),
      },
      {
        google_review_id: "demo-clinic-5",
        reviewer_name: "Nina F.",
        star_rating: 5,
        comment:
          "Telehealth follow-up was seamless. Prescription sent to my pharmacy within an hour.",
        status: "replied",
        reply_comment:
          "Thank you, Nina , we're glad the telehealth visit worked smoothly. Don't hesitate to reach out if you have any questions about your prescription.",
        review_update_time: daysAgo(4),
      },
    ],
  },
  gym: {
    label: "Gym",
    businessNameForAi: "Iron & Flow Fitness",
    cityForAi: "Austin",
    reviews: [
      {
        google_review_id: "demo-gym-1",
        reviewer_name: "Tyler B.",
        star_rating: 5,
        comment:
          "Clean facility, plenty of racks, and trainers who actually correct form without being intimidating.",
        status: "unanswered",
        review_update_time: daysAgo(2),
      },
      {
        google_review_id: "demo-gym-2",
        reviewer_name: "Melissa H.",
        star_rating: 4,
        comment:
          "Love the class schedule. Locker rooms could use another fan,gets humid after evening classes.",
        status: "unanswered",
        review_update_time: daysAgo(5),
      },
      {
        google_review_id: "demo-gym-3",
        reviewer_name: "James L.",
        star_rating: 3,
        comment:
          "Good equipment but crowding between 5â€“7pm makes leg day tough. Any chance of expanding the free-weight area?",
        status: "unanswered",
        review_update_time: daysAgo(7),
      },
      {
        google_review_id: "demo-gym-4",
        reviewer_name: "Rachel S.",
        star_rating: 2,
        comment:
          "Cancelled my membership but was still billed. Took three calls to get it sorted.",
        status: "unanswered",
        review_update_time: daysAgo(10),
      },
      {
        google_review_id: "demo-gym-5",
        reviewer_name: "Omar V.",
        star_rating: 1,
        comment:
          "Front desk was dismissive when I asked about guest policy. Felt unwelcome on day one.",
        status: "unanswered",
        review_update_time: daysAgo(1),
      },
    ],
  },
  salon: {
    label: "Salon",
    businessNameForAi: "Lumen Hair Studio",
    cityForAi: "Chicago",
    reviews: [
      {
        google_review_id: "demo-salon-1",
        reviewer_name: "Isabella G.",
        star_rating: 5,
        comment:
          "Best color I've had in years,natural grow-out and exactly the tone we discussed. Already booked my next visit.",
        status: "unanswered",
        review_update_time: daysAgo(2),
      },
      {
        google_review_id: "demo-salon-2",
        reviewer_name: "Hannah P.",
        star_rating: 4,
        comment:
          "Lovely stylists and cute space. Appointment ran 20 minutes late which made parking tricky.",
        status: "unanswered",
        review_update_time: daysAgo(6),
      },
      {
        google_review_id: "demo-salon-3",
        reviewer_name: "Quinn R.",
        star_rating: 3,
        comment:
          "Cut was fine but pricing wasn't clear upfront,ended up higher than I expected after add-ons.",
        status: "unanswered",
        review_update_time: daysAgo(8),
      },
      {
        google_review_id: "demo-salon-4",
        reviewer_name: "Dana W.",
        star_rating: 2,
        comment:
          "Asked for a trim and lost several inches. I know miscommunication happens but I left upset.",
        status: "unanswered",
        review_update_time: daysAgo(11),
      },
      {
        google_review_id: "demo-salon-5",
        reviewer_name: "Alex T.",
        star_rating: 5,
        comment:
          "Scalp treatment was amazing,no hard sell on products, just honest recommendations.",
        status: "replied",
        reply_comment:
          "Alex, thank you! We're happy the scalp treatment helped. See you next time at Lumen.",
        review_update_time: daysAgo(4),
      },
    ],
  },
  retail_store: {
    label: "Retail store",
    businessNameForAi: "Northline Outfitters",
    cityForAi: "Portland",
    reviews: [
      {
        google_review_id: "demo-retail-1",
        reviewer_name: "Steve M.",
        star_rating: 5,
        comment:
          "Staff helped me find the right size without hovering. Easy exchange when I changed my mind on color.",
        status: "unanswered",
        review_update_time: daysAgo(2),
      },
      {
        google_review_id: "demo-retail-2",
        reviewer_name: "Yuki A.",
        star_rating: 4,
        comment:
          "Great selection of basics. Checkout line moved slowly,only two registers open on a Saturday.",
        status: "unanswered",
        review_update_time: daysAgo(5),
      },
      {
        google_review_id: "demo-retail-3",
        reviewer_name: "Patricia L.",
        star_rating: 3,
        comment:
          "Website said item was in stock but it wasn't on the shelf. Associate located one in back,took extra time.",
        status: "unanswered",
        review_update_time: daysAgo(7),
      },
      {
        google_review_id: "demo-retail-4",
        reviewer_name: "Greg F.",
        star_rating: 2,
        comment:
          "Bought a jacket that tore at the seam after one week. Return policy felt stricter than advertised.",
        status: "unanswered",
        review_update_time: daysAgo(10),
      },
      {
        google_review_id: "demo-retail-5",
        reviewer_name: "Monica D.",
        star_rating: 1,
        comment:
          "Security followed me around the store the entire time. Extremely uncomfortable shopping experience.",
        status: "unanswered",
        review_update_time: daysAgo(1),
      },
    ],
  },
};

/** Selector order: Restaurant, Clinic, Gym, Salon, Retail store */
export const DEMO_BUSINESS_TYPE_ORDER: DemoBusinessType[] = [
  "restaurant",
  "clinic",
  "gym",
  "salon",
  "retail_store",
];

export const DEMO_BUSINESS_TYPE_OPTIONS: { value: DemoBusinessType; label: string }[] =
  DEMO_BUSINESS_TYPE_ORDER.map((value) => ({
    value,
    label: DEMO_REVIEW_DATASETS[value].label,
  }));

/**
 * Map seed data to app reviews + initial draft/snapshot maps (same rules as demo mode on Reviews).
 */
export function hydrateDemoDataset(seeds: DemoSeedReview[]): {
  reviews: Review[];
  drafts: Record<string, string>;
  savedDraftSnapshots: Record<string, string>;
} {
  const reviews: Review[] = seeds.map((r) => ({
    google_review_id: r.google_review_id,
    reviewer_name: r.reviewer_name,
    star_rating: r.star_rating,
    comment: r.comment,
    status: r.status,
    review_update_time: r.review_update_time ?? null,
    isSample: true,
  }));

  const drafts: Record<string, string> = {};
  const savedDraftSnapshots: Record<string, string> = {};
  for (const r of seeds) {
    if (r.reply_comment) {
      drafts[r.google_review_id] = r.reply_comment;
      if (r.status.toLowerCase() === "replied") {
        savedDraftSnapshots[r.google_review_id] = r.reply_comment;
      }
    }
  }

  return { reviews, drafts, savedDraftSnapshots };
}

export function getDemoDataset(type: DemoBusinessType): DemoBusinessDataset {
  return DEMO_REVIEW_DATASETS[type];
}

