import { lookupBuilderSessionRequest } from "@builder/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const lookup = await lookupBuilderSessionRequest(request);
  if (lookup.status === "active") {
    return Response.json(
      {
        subjectId: lookup.subject.id,
        subjectLabel: lookup.subject.label,
        expiresAt: lookup.session.expiresAt,
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-Robots-Tag": "noindex, nofollow",
          "X-Builder-Subject": lookup.subject.id,
        },
      },
    );
  }
  if (lookup.status === "unavailable") {
    return Response.json(
      { ok: false, error: "Builder access is unavailable." },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
          "X-Robots-Tag": "noindex, nofollow",
        },
      },
    );
  }
  return Response.json(
    { ok: false, error: "Not signed in." },
    {
      status: 401,
      headers: {
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    },
  );
}
