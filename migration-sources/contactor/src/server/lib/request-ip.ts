export function getTrustedRequestIp(headers: Headers): string | null {
  for (const name of ["x-vercel-forwarded-for", "x-real-ip", "cf-connecting-ip"]) {
    const value = headers.get(name)?.trim();
    if (value) return value;
  }

  const forwarded = headers.get("x-forwarded-for");
  const hops = forwarded?.split(",").map((value) => value.trim()).filter(Boolean) ?? [];
  return hops.at(-1) ?? null;
}
