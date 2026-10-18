/** Rate-limit keys from client addresses (docs/DECISIONS.md ADR-026 B). */
import { describe, expect, it } from "vitest";
import { clientRateLimitKey } from "../../server/public/rate-limit-key";

describe("clientRateLimitKey", () => {
  it.each([
    ["203.0.113.5", "ip4:203.0.113.5"],
    [" 198.51.100.9 ", "ip4:198.51.100.9"],
    ["2001:db8:1:2:3:4:5:6", "ip6:2001:db8:1:2::/64"],
    ["2001:0DB8:0001:0002:aaaa:bbbb:cccc:dddd", "ip6:2001:db8:1:2::/64"],
    ["2001:db8::1", "ip6:2001:db8:0:0::/64"],
    ["2001:db8:1:2::", "ip6:2001:db8:1:2::/64"],
    ["::1", "ip6:0:0:0:0::/64"],
    ["fe80::1%eth0", "ip6:fe80:0:0:0::/64"],
    ["::ffff:192.0.2.10", "ip4:192.0.2.10"],
    ["::ffff:c000:20a", "ip4:192.0.2.10"],
    ["64:ff9b::192.0.2.10", "ip6:64:ff9b:0:0::/64"],
  ])("maps %s to %s", (address, key) => {
    expect(clientRateLimitKey(address)).toBe(key);
  });

  it("keeps every address of one /64 on the same key and separates other /64s", () => {
    const a = clientRateLimitKey("2001:db8:aa:bb:1::1");
    expect(clientRateLimitKey("2001:db8:aa:bb:ffff:ffff:ffff:ffff")).toBe(a);
    expect(clientRateLimitKey("2001:db8:aa:bc::1")).not.toBe(a);
  });

  it.each([
    [null],
    [""],
    ["unknown"],
    ["256.1.1.1"],
    ["1.2.3"],
    ["2001:db8::1::2"],
    ["2001:db8:1:2:3:4:5:6:7"],
    ["2001:db8:1:2:3:4:5"],
    ["gggg::1"],
    ["::ffff:300.0.0.1"],
    ["203.0.113.5, 10.0.0.1"],
  ])("falls back to the shared key for %s", (address) => {
    expect(clientRateLimitKey(address)).toBe("unknown");
  });
});
