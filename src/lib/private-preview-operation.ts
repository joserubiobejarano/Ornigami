/** Fixed response for operations intentionally unavailable in private Preview. */
export function privatePreviewOperationDisabledResponse(): Response {
  return Response.json(
    { error: "This operation is unavailable in private Preview." },
    { status: 503, headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
