import { redirect } from "next/navigation";

export default function SettingsRoute() {
  redirect("/dashboard/agents/review-replies/settings");
}
