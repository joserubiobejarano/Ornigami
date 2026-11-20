import { redirect } from "next/navigation";

import { lookupBuilderSessionCookie } from "@builder/lib/session";

import { BuilderClosedNotice } from "./_components/builder-closed";
import { BuilderSignIn } from "./_components/builder-sign-in";

export const dynamic = "force-dynamic";

type HomeProps = {
  searchParams: Promise<{ error?: string | string[] }>;
};

export default async function BuilderHomePage({ searchParams }: HomeProps) {
  const lookup = await lookupBuilderSessionCookie();
  if (lookup.status === "active") redirect("/builder");
  if (lookup.status === "closed") return <BuilderClosedNotice />;
  if (lookup.status === "unavailable") {
    return <BuilderClosedNotice unavailable />;
  }

  const { error } = await searchParams;
  return <BuilderSignIn error={typeof error === "string" ? error : undefined} />;
}
