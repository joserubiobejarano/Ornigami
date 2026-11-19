import { ApprovedAssetLookupError } from "@/lib/campaign-lab/fixtures";
import { notFound } from "next/navigation";
import { isCampaignLabAvailable } from "@/lib/campaign-lab/availability";
import { StoryExperiment } from "./story-experiment";
import { resolveStory, STORY_MODES, STORY_DEFINITIONS, StoryValidationError } from "@/lib/campaign-lab/story";
import { loadCampaignCatalog } from "@/lib/campaign-lab/pilots/local-pilot";

export const dynamic = "force-dynamic";
export default async function StoryPage({ searchParams }: { searchParams: Promise<{ mode?: string; definition?: string }> }) {
  if (!isCampaignLabAvailable()) notFound();
  const { mode, definition: definitionId } = await searchParams;
  if ((definitionId && !STORY_DEFINITIONS.some(item => item.id === definitionId)) || (mode && !STORY_MODES.some(item => item === mode))) return <main><p role="alert">Unknown registered story definition or mode. Choose a registered definition and static, instant or motion.</p><a href="/campaign-lab/story">Return to the static reference</a></main>;
  const selected = STORY_MODES.find(value => value === mode) ?? "static";
  const catalog = loadCampaignCatalog();
  const definition = STORY_DEFINITIONS.find(item => item.id === definitionId) ?? STORY_DEFINITIONS[0];
  try { resolveStory(catalog, definition); }
  catch (error) { if (!(error instanceof StoryValidationError) && !(error instanceof ApprovedAssetLookupError)) throw error; return <main><p role="alert">{error instanceof Error ? error.message : "Approved story material is unavailable."}</p></main>; }
  return <StoryExperiment mode={selected} definitionId={definition.id} catalog={catalog} />;
}
