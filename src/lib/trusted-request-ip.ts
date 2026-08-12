export function getTrustedRequestIp(headers: Headers): string | null {
  for (const name of ["x-vercel-forwarded-for", "x-real-ip", "cf-connecting-ip"]) {
    const value = headers.get(name)?.trim();
    if (value) return value;
  }
  const hops = headers.get("x-forwarded-for")?.split(",").map((value) => value.trim()).filter(Boolean) ?? [];
  return hops.at(-1) ?? null;
}
