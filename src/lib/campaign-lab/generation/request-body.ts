export type BoundedJsonBodyResult =
  | { ok: true; value: unknown }
  | { ok: false; status: 400 | 413; message: string };

const MALFORMED_JSON_MESSAGE = "Send a JSON request body.";
const TOO_LARGE_MESSAGE = "The request body is too large.";

/**
 * Reads and parses a JSON body while counting the actual UTF-8 bytes. A missing
 * or understated Content-Length cannot bypass the limit because the stream is
 * the source of truth. A declared over-limit body is rejected before reading.
 */
export async function readBoundedJsonBody(
  request: Request,
  maxBytes: number,
): Promise<BoundedJsonBodyResult> {
  const declared = Number.parseInt(
    request.headers.get("content-length") ?? "",
    10,
  );
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, status: 413, message: TOO_LARGE_MESSAGE };
  }

  const stream = request.body;
  if (!stream) {
    return { ok: false, status: 400, message: MALFORMED_JSON_MESSAGE };
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
        return { ok: false, status: 413, message: TOO_LARGE_MESSAGE };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, status: 400, message: MALFORMED_JSON_MESSAGE };
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // The stream may already be closed or cancelled.
    }
  }

  if (total === 0) {
    return { ok: false, status: 400, message: MALFORMED_JSON_MESSAGE };
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
    return { ok: false, status: 400, message: MALFORMED_JSON_MESSAGE };
  }

  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, status: 400, message: MALFORMED_JSON_MESSAGE };
  }
}
