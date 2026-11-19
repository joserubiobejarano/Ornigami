import { notFound } from "next/navigation";
import { isCampaignLabAvailable } from "@/lib/campaign-lab/availability";
import { StoryExperiment } from "./story-experiment";
import { resolveStory, STORY_MODES } from "@/lib/campaign-lab/story";
import { loadCampaignCatalog } from "@/lib/campaign-lab/pilots/local-pilot";

export const dynamic = "force-dynamic";
export default async function StoryPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  if (!isCampaignLabAvailable()) notFound();
  const { mode } = await searchParams;
  const selected = STORY_MODES.find(value => value === mode) ?? "static";
  const catalog = loadCampaignCatalog();
  try { resolveStory(catalog); }
  catch (error) { return <main><p role="alert">{error instanceof Error ? error.message : "Approved story material is unavailable."}</p></main>; }
  return <StoryExperiment mode={selected} catalog={catalog} />;
}
