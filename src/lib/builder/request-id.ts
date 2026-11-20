/**
 * Client-generated idempotency key for one builder generation attempt. It must
 * be globally unique across reloads, remounts and tabs so the server's scoped
 * replay protection cannot mistake a new brief for an old request.
 */
export function createBuilderRequestId(): string {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.randomUUID) {
    throw new Error("This browser cannot create a secure request id.");
  }
  return cryptoApi.randomUUID();
}
