import {
  createBuilderGenerateHandler,
  runBuilderGeneration,
} from "@/lib/builder/generation";
import type { BuilderAccessDecision } from "@/lib/builder/access";

import {
  BUILDER_SUBJECT_HEADER,
  isSameOriginRequest,
  lookupBuilderSessionRequest,
} from "@builder/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_CHANGED_MESSAGE = "Builder session changed.";

function sessionChangedResponse(): Response {
  return Response.json(
    { ok: false, error: SESSION_CHANGED_MESSAGE },
    {
      status: 409,
      headers: {
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    },
  );
}

export async function POST(request: Request) {
  const lookup = await lookupBuilderSessionRequest(request);
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
  if (lookup.status !== "active") {
    return Response.json(
      { ok: false, error: "Not found." },
      {
        status: 404,
        headers: {
          "Cache-Control": "no-store",
          "X-Robots-Tag": "noindex, nofollow",
        },
      },
    );
  }
  if (!isSameOriginRequest(request)) {
    return new Response(null, {
      status: 403,
      headers: { "Cache-Control": "no-store" },
    });
  }
  if (request.headers.get(BUILDER_SUBJECT_HEADER) !== lookup.subject.id) {
    return sessionChangedResponse();
  }

  const sessionId = lookup.session.id;
  const subjectId = lookup.subject.id;
  const access: BuilderAccessDecision = {
    allowed: true,
    reason: "authorized",
    subject: subjectId,
  };
  const handler = createBuilderGenerateHandler({
    access: () => access,
    generate: async (parsed) => {
      if (lookup.config.testGenerationDelayMs > 0) {
        await new Promise((resolve) =>
          setTimeout(resolve, lookup.config.testGenerationDelayMs),
        );
      }
      const result = await runBuilderGeneration(parsed);
      const after = await lookupBuilderSessionRequest(request);
      if (
        after.status !== "active" ||
        after.session.id !== sessionId ||
        after.subject.id !== subjectId
      ) {
        throw new Error("Builder session ended during generation.");
      }
      return result;
    },
  });

  const response = await handler(request);
  response.headers.set("X-Builder-Subject", subjectId);
  return response;
}
