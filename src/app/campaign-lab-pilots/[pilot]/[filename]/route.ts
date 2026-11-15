import { isCampaignLabAvailable } from "@/lib/campaign-lab/availability";
import { readLocalPilotAsset } from "@/lib/campaign-lab/pilots/local-pilot";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const contentTypes: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ pilot: string; filename: string }> },
) {
  if (!isCampaignLabAvailable()) return new Response(null, { status: 404 });
  const { pilot, filename } = await params;
  const contentType = contentTypes[filename.split(".").pop() ?? ""];
  if (typeof contentType !== "string") return new Response(null, { status: 404 });

  const bytes = readLocalPilotAsset(pilot, filename);
  if (!bytes) return new Response(null, { status: 404 });
  return new Response(bytes, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex",
    },
  });
}
