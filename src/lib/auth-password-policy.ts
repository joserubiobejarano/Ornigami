export function isValidAuthPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= 8 && new TextEncoder().encode(value).byteLength <= 72;
}
