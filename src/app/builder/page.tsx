import { notFound } from "next/navigation";

import { BuilderWorkspace } from "@/components/builder/builder-workspace";
import { getBuilderAccessDecision } from "@/lib/builder/access";

export const dynamic = "force-dynamic";

export default function BuilderPage() {
  if (!getBuilderAccessDecision().allowed) notFound();
  return <BuilderWorkspace />;
}
