import { redirect } from "next/navigation";

export default function DashboardOnboardingRedirectPage() {
  redirect("/admin/onboarding");
}
