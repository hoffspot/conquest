// STUN (RFC 8489): how the internet sees this computer, asked of a public STUN server (generated/
// world_server_plan.md §9.3). One binding request over UDP; the answer's XOR-MAPPED-ADDRESS is the
// address and port the request came from, as the internet saw it. Compared with the router's own
// public address, it shows whether another NAT (a provider's CGNAT) stands beyond the router.

import { randomBytes } from "node:crypto";
import { promises as dnsPromises } from "node:dns";
import { isIP } from "node:net";
import { addressOf, ask as askUdp } from "./udp.js";

/** Free STUN servers, with no promise of service: asked in turn. */
export const STUN_SERVERS = Object.freeze([
    { host: "stun.cloudflare.com", port: 3478 },
    { host: "stun.l.google.com", port: 19302 },
]);

const COOKIE = 0x2112a442;
const BINDING = 0x0001;
const SUCCESS = 0x0101;
const MAPPED = 0x0001;
const XOR_MAPPED = 0x0020;

/** A binding request, with its transaction id (12 bytes). */
export function bindingRequest(id = randomBytes(12)) {
    const request = Buffer.alloc(20);

    request.writeUInt16BE(BINDING, 0);
    request.writeUInt32BE(COOKIE, 4);
    id.copy(request, 8);

    return request;
}

/** A binding response's address (XOR-MAPPED-ADDRESS, else MAPPED-ADDRESS): { address, port }, or null if it carries neither. */
export function mappedAddressOf(response) {
    const id = response.subarray(8, 20);
    const end = Math.min(response.length, 20 + response.readUInt16BE(2));
    let mapped = null;

    for (let at = 20; at + 4 <= end; ) {
        const type = response.readUInt16BE(at);
        const length = response.readUInt16BE(at + 2);
        const value = response.subarray(at + 4, at + 4 + length);

        if ((type === XOR_MAPPED || type === MAPPED) && value.length >= 8) {
            const family = value[1];
            const xor = type === XOR_MAPPED;
            const port = value.readUInt16BE(2) ^ (xor ? COOKIE >>> 16 : 0);
            const raw = Buffer.from(value.subarray(4, family === 2 ? 20 : 8));
            const mask = Buffer.concat([Buffer.from([0x21, 0x12, 0xa4, 0x42]), id]);

            if (xor) {
                raw.forEach((byte, index) => (raw[index] = byte ^ mask[index]));
            }

            const address = family === 2 ? addressOf(raw) : [...raw].join(".");

            if (xor) {
                return { address, port };
            }

            mapped ??= { address, port };
        }

        at += 4 + length + ((4 - (length % 4)) % 4);
    }

    return mapped;
}

/**
 * How the internet sees this computer, asked of the STUN server at `host`:`port` (`family` 4 or
 * 6). Returns { address, port }. `lookup` and `ask` for the tests.
 */
export async function stun({ host, port = 3478, family = 4, lookup = (name, options) => dnsPromises.lookup(name, options), ask = askUdp, tries = 3, first = 300 }) {
    const address = isIP(host) ? host : (await lookup(host, { family })).address;
    const id = randomBytes(12);
    const found = await ask({
        address,
        port,
        message: bindingRequest(id),
        tries,
        first,
        accept: (reply) => (reply.length >= 20 && reply.readUInt16BE(0) === SUCCESS && reply.readUInt32BE(4) === COOKIE && reply.subarray(8, 20).equals(id) ? (mappedAddressOf(reply) ?? undefined) : undefined),
    });

    return found;
}

/** How the internet sees this computer, from the first of `servers` to answer; null if none does. */
export async function publicAddress({ servers = STUN_SERVERS, ...options } = {}) {
    for (const server of servers) {
        const found = await stun({ ...server, ...options }).catch(() => null);

        if (found) {
            return found;
        }
    }

    return null;
}
