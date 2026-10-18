/**
 * Rate-limit key for a client address (docs/DECISIONS.md ADR-026 B). IPv4
 * addresses are used as is; IPv6 addresses are reduced to their /64 prefix,
 * because one subscriber usually controls a whole /64. Anything that does not
 * parse falls back to one shared key, which fails safe. The key is used only
 * for the limiter and is never logged.
 */
export const UNKNOWN_CLIENT_KEY = "unknown";

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const HEXTET = /^[0-9a-f]{1,4}$/i;

function parseIpv4(value: string): string | null {
  const match = value.match(IPV4);
  if (!match) return null;
  const octets = match.slice(1).map(Number);
  return octets.every((octet) => octet <= 255) ? octets.join(".") : null;
}

/** Expands an IPv6 address to eight hextets, or null when it is not valid. */
function parseIpv6(value: string): string[] | null {
  const halves = value.split("::");
  if (halves.length > 2) return null;
  const parts = (half: string | undefined) => (half ? half.split(":") : []);
  const head = parts(halves[0]);
  const tail = parts(halves[1]);
  const last = tail.at(-1) ?? head.at(-1);
  if (last?.includes(".")) {
    // Embedded IPv4 in the last 32 bits.
    const ipv4 = parseIpv4(last);
    if (!ipv4) return null;
    const [a = 0, b = 0, c = 0, d = 0] = ipv4.split(".").map(Number);
    const words = [((a << 8) | b).toString(16), ((c << 8) | d).toString(16)];
    if (tail.length > 0) tail.splice(-1, 1, ...words);
    else head.splice(-1, 1, ...words);
  }
  const groups = [...head, ...tail];
  if (!groups.every((group) => HEXTET.test(group))) return null;
  if (halves.length === 1 ? groups.length !== 8 : groups.length > 7) return null;
  const zeros = Array.from({ length: 8 - groups.length }, () => "0");
  return [...head, ...zeros, ...tail].map((group) => parseInt(group, 16).toString(16));
}

export function clientRateLimitKey(address: string | null): string {
  const value = address?.trim().split("%")[0] ?? "";
  if (value === "") return UNKNOWN_CLIENT_KEY;

  const ipv4 = parseIpv4(value);
  if (ipv4) return `ip4:${ipv4}`;

  const hextets = parseIpv6(value);
  if (!hextets) return UNKNOWN_CLIENT_KEY;
  // IPv4-mapped IPv6 (::ffff:a.b.c.d) is the IPv4 client.
  if (hextets.slice(0, 5).every((group) => group === "0") && hextets[5] === "ffff") {
    const [high = 0, low = 0] = hextets.slice(6).map((group) => parseInt(group, 16));
    return `ip4:${String(high >> 8)}.${String(high & 255)}.${String(low >> 8)}.${String(low & 255)}`;
  }
  return `ip6:${hextets.slice(0, 4).join(":")}::/64`;
}
