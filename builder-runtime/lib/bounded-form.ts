export const BUILDER_REDEEM_MAX_BODY_BYTES = 4_096;

export type BoundedUrlEncodedFormResult =
  | { ok: true; params: URLSearchParams }
  | { ok: false; status: 400 | 413 | 415; error: string; message: string };

const TOO_LARGE_MESSAGE = "The invitation request body is too large.";
const MALFORMED_MESSAGE = "Send one invitation token in a form body.";
const UNSUPPORTED_MESSAGE =
  "Invitation redemption requires application/x-www-form-urlencoded.";

/**
 * Reads one bounded URL-encoded form. The stream is the source of truth, so a
 * missing or understated Content-Length cannot bypass the limit. Multipart
 * forms are rejected rather than parsed without a separate bounded parser.
 */
export async function readBoundedUrlEncodedForm(
  request: Request,
  maxBytes: number,
): Promise<BoundedUrlEncodedFormResult> {
  const mediaType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (mediaType !== "application/x-www-form-urlencoded") {
    return {
      ok: false,
      status: 415,
      error: "unsupported_media_type",
      message: UNSUPPORTED_MESSAGE,
    };
  }

  const declared = Number.parseInt(
    request.headers.get("content-length") ?? "",
    10,
  );
  if (Number.isFinite(declared) && declared > maxBytes) {
    return {
      ok: false,
      status: 413,
      error: "request_too_large",
      message: TOO_LARGE_MESSAGE,
    };
  }

  const stream = request.body;
  if (!stream) {
    return {
      ok: false,
      status: 400,
      error: "invalid_invite",
      message: MALFORMED_MESSAGE,
    };
  }

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // The size rejection is already established.
        }
        return {
          ok: false,
          status: 413,
          error: "request_too_large",
          message: TOO_LARGE_MESSAGE,
        };
      }
      chunks.push(value);
    }
  } catch {
    return {
      ok: false,
      status: 400,
      error: "invalid_invite",
      message: MALFORMED_MESSAGE,
    };
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // The stream may already be closed or cancelled.
    }
  }

  if (total === 0) {
    return {
      ok: false,
      status: 400,
      error: "invalid_invite",
      message: MALFORMED_MESSAGE,
    };
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return {
      ok: false,
      status: 400,
      error: "invalid_invite",
      message: MALFORMED_MESSAGE,
    };
  }

  try {
    return { ok: true, params: new URLSearchParams(text) };
  } catch {
    return {
      ok: false,
      status: 400,
      error: "invalid_invite",
      message: MALFORMED_MESSAGE,
    };
  }
}
