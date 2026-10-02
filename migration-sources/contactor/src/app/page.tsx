import { redirect } from "next/navigation";

export default function HomePage() {
  // LocalLift owns the canonical Ornigami marketing homepage. Contact remains
  // independently deployable for hosted forms and its owner/admin workspace.
  redirect(process.env.NEXT_PUBLIC_ORNIGAMI_URL?.trim() || "https://ornigami.com");
}

