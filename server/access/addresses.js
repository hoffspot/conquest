// Where a connection comes from (generated/world_server_plan.md §9.1, §13): a home address (the
// Wi-Fi's private IPv4 ranges, link-local, IPv6 unique-local and link-local, and the machine
// itself), or the internet (everything else, the carrier-grade NAT range 100.64/10 among it).
// Plain http and ws are taken only from home; the server-wide management page answers only there.
//
// The machine itself counts as home on the play port (its owner playing on the Mac), but never as
// proof of being its owner: a tunnel (Tailscale Funnel) delivers the internet from localhost, so
// key-free management has its own listener on loopback, and tunnels another (§7.3, §9.4).

import { BlockList, isIP } from "node:net";

const HOME = new BlockList();

for (const [address, prefix] of [["10.0.0.0", 8], ["172.16.0.0", 12], ["192.168.0.0", 16], ["169.254.0.0", 16], ["127.0.0.0", 8]]) {
    HOME.addSubnet(address, prefix, "ipv4");
}

for (const [address, prefix] of [["fc00::", 7], ["fe80::", 10], ["::1", 128]]) {
    HOME.addSubnet(address, prefix, "ipv6");
}

/** An address as it's counted and compared: an IPv4 one carried in IPv6 (::ffff:a.b.c.d) as itself; null if it isn't one. */
export function plainAddress(address) {
    if (typeof address !== "string") {
        return null;
    }

    const bare = address.replace(/^\[|\]$/g, "").replace(/%.*$/, "");
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(bare);
    const plain = mapped ? mapped[1] : bare.toLowerCase();

    return isIP(plain) ? plain : null;
}

/** Whether an address is at home (the Wi-Fi, or the machine itself), not the internet. */
export function isHome(address) {
    const plain = plainAddress(address);

    return plain !== null && HOME.check(plain, isIP(plain) === 6 ? "ipv6" : "ipv4");
}
