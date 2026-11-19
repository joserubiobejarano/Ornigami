import { isIP } from "node:net";

// Conservative destination policy, independently implemented. See transport docs
// for the reviewed Contentor source and the intentionally narrower IPv6 policy.
const v4Denied: readonly [string, number][] = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10],
  ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24],
  ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
  ["168.63.129.16", 32], // Azure platform virtual address
];
const v4Number = (ip: string) => ip.split(".").reduce((n, x) => n * 256 + Number(x), 0);

/** Only canonical numeric addresses that satisfy this conservative policy pass. */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const n = v4Number(address);
    return !v4Denied.some(([base, bits]) =>
      Math.floor(n / 2 ** (32 - bits)) === Math.floor(v4Number(base) / 2 ** (32 - bits)));
  }
  if (family !== 6 || address.includes("%")) return false;
  // Permit ordinary global unicast only. This also excludes all mapped,
  // compatible, NAT64, local, multicast and unallocated address families.
  const [first, second = "0"] = address.split(":");
  const a = parseInt(first, 16);
  const b = parseInt(second || "0", 16);
  if (!Number.isFinite(a) || a < 0x2000 || a > 0x3fff) return false;
  if (a === 0x2001 && (b < 0x200 || b === 0xdb8)) return false;
  if (a === 0x2002) return false; // 6to4 embeds another destination
  if (a === 0x3fff && b < 0x1000) return false; // documentation /20
  return true;
}

export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return !host || ["localhost", "local", "internal", "home.arpa", "metadata.goog"]
    .some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}
