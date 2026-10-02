import type { OnboardingReviewDraft, ReviewIssue } from "@/server/services/onboarding-business-conversion.service";

export type OnboardingReviewActionState = {
  status: "idle" | "error" | "success";
  message: string | null;
  errors: ReviewIssue[];
  warnings: ReviewIssue[];
  createdBusiness: {
    id: string;
    name: string;
    slug: string;
  } | null;
  normalizedDraft: OnboardingReviewDraft | null;
};

export const initialOnboardingReviewActionState: OnboardingReviewActionState = {
  status: "idle",
  message: null,
  errors: [],
  warnings: [],
  createdBusiness: null,
  normalizedDraft: null,
};
