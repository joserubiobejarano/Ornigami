import { notFound, redirect } from "next/navigation";

import { lookupBuilderSessionCookie } from "@builder/lib/session";

import { BuilderRuntimeWorkspace } from "../_components/builder-runtime-workspace";

export const dynamic = "force-dynamic";

export default async function BuilderPage() {
  const lookup = await lookupBuilderSessionCookie();
  if (lookup.status === "active") {
    return <BuilderRuntimeWorkspace subjectId={lookup.subject.id} />;
  }
  if (lookup.status === "closed") notFound();
  if (lookup.status === "unavailable") redirect("/?error=unavailable");
  redirect("/?error=session");
}
