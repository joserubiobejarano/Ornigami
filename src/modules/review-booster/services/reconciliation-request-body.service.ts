const DEFAULT_MAX_BODY_BYTES = 2048;
const DEFAULT_TIMEOUT_MS = 5000;

/** Reads a small JSON request without trusting Content-Length or buffering unbounded streams. */
export async function readBoundedReconciliationRequestBody(
  request: Request,
  maxBodyBytes = DEFAULT_MAX_BODY_BYTES,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<string> {
  if (!request.body) throw new Error("body_missing");
  const reader = request.body.getReader();
  let total = 0;
  const chunks: Uint8Array[] = [];
  const deadline = Date.now() + timeoutMs;
  try {
    while (true) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        void reader.cancel().catch(() => undefined);
        throw new Error("body_timeout");
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      let result: ReadableStreamReadResult<Uint8Array>;
      try {
        result = await Promise.race([
          reader.read(),
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => reject(new Error("body_timeout")), remaining);
          }),
        ]);
      } catch (error) {
        void reader.cancel().catch(() => undefined);
        throw error instanceof Error && error.message === "body_timeout" ? error : new Error("body_read_error");
      } finally {
        if (timer) clearTimeout(timer);
      }
      const { done, value } = result;
      if (done) break;
      total += value.byteLength;
      if (total > maxBodyBytes) {
        void reader.cancel().catch(() => undefined);
        throw new Error("body_too_large");
      }
      chunks.push(value);
    }
    const body = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
  } finally {
    try { reader.releaseLock(); } catch { /* a timed-out read may still be settling */ }
  }
}
