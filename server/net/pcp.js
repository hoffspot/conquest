// PCP, the Port Control Protocol (RFC 6887): NAT-PMP's successor, asked first (generated/
// world_server_plan.md §9.3). One request does both of what the server wants of a router: an
// IPv4 port forwarded through its NAT, and, asked over IPv6, a pinhole through its IPv6 firewall
// for this computer's own address. Asked of the gateway on UDP 5351, as NAT-PMP is; a router that
// speaks NAT-PMP alone answers in NAT-PMP's form, or says it doesn't know this version, and
// PcpUnsupported says so (router.js then asks NAT-PMP).
//
// MAP request: version 2, opcode 1, lifetime, this computer's address (16 bytes); then a nonce
// (12), the protocol (6: TCP), the internal port, the suggested external port and address. The
// answer carries the same nonce, the lifetime granted, and the external port and address assigned.

import { randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { NATPMP_PORT } from "./natpmp.js";
import { addressOf, ask as askUdp, bytesOf } from "./udp.js";

const VERSION = 2;
const MAP = 1;

/** What a PCP server's result codes mean (RFC 6887 §7.4). */
export const PCP_RESULTS = Object.freeze({
    1: "doesn't speak this version",
    2: "refused (forwarding may be turned off in its settings)",
    3: "found the request malformed",
    4: "doesn't know that request",
    5: "doesn't know an option asked for",
    6: "found an option malformed",
    7: "has no connection to the internet",
    8: "has no room for more forwarding",
    9: "doesn't forward that protocol",
    10: "has given this computer all the forwarding it may have",
    11: "can't give that external address",
    12: "sees this computer by another address (another router may be between them)",
    13: "has too many connections already",
});

/** A PCP server's refusal: `code` its result, in words; `lifetime` how long the refusal holds (seconds). */
export class PcpError extends Error {
    constructor(code, lifetime = 0) {
        super(`The router ${PCP_RESULTS[code] ?? `refused (PCP result ${code})`}.`);
        Object.assign(this, { code, lifetime });
    }
}

/** The router doesn't speak PCP (it answered as NAT-PMP, or said it doesn't know this version). */
export class PcpUnsupported extends PcpError {
    constructor() {
        super(1);
    }
}

/**
 * A PCP server at `gateway` (its port `port`), asked as this computer (`client`: the address it's
 * seen by, its LAN address). `ask` (udp.js) for the tests. Returns { kind, map(), unmap() }.
 */
export function pcp({ gateway, client, port = NATPMP_PORT, ask = askUdp, tries = 4, first = 250 }) {
    const map = async ({ internalPort, externalPort = internalPort, lifetime = 7200, protocol = "tcp", nonce = randomBytes(12), internal = client }) => {
        const request = Buffer.alloc(60);

        request[0] = VERSION;
        request[1] = MAP;
        request.writeUInt32BE(lifetime, 4);
        bytesOf(internal).copy(request, 8);
        nonce.copy(request, 24);
        request[36] = protocol === "udp" ? 17 : 6;
        request.writeUInt16BE(internalPort, 40);
        request.writeUInt16BE(externalPort, 42);
        // (Any external address: for IPv4 its mapped form of 0.0.0.0, for IPv6 all zeros)
        (isIP(internal) === 4 ? bytesOf("0.0.0.0") : Buffer.alloc(16)).copy(request, 44);

        const reply = await ask({
            address: gateway,
            port,
            message: request,
            tries,
            first,
            accept: (answer) => {
                // (A NAT-PMP router's answer: version 0)
                if (answer.length >= 2 && answer[0] === 0) {
                    throw new PcpUnsupported();
                }

                if (answer.length < 24 || answer[0] !== VERSION || answer[1] !== (0x80 | MAP)) {
                    return undefined;
                }

                const result = answer[3];

                if (result === 1) {
                    throw new PcpUnsupported();
                }

                // (Another request's answer)
                if (answer.length >= 60 && !answer.subarray(24, 36).equals(nonce)) {
                    return undefined;
                }

                if (result) {
                    throw new PcpError(result, answer.readUInt32BE(4));
                }

                return answer.length >= 60 ? answer : undefined;
            },
        });

        return { internalPort: reply.readUInt16BE(40), externalPort: reply.readUInt16BE(42), externalAddress: addressOf(reply.subarray(44, 60)), lifetime: reply.readUInt32BE(4), epoch: reply.readUInt32BE(8), nonce };
    };

    return {
        kind: "pcp",

        /**
         * A port forwarded (or, over IPv6, a pinhole opened) for `lifetime` seconds, by `nonce` (the
         * same one renews it). Returns { internalPort, externalPort, externalAddress, lifetime, epoch, nonce }.
         */
        map,

        /** A mapping let go (its nonce, as it was made). */
        unmap: ({ internalPort, nonce, protocol = "tcp", internal = client }) => map({ internalPort, externalPort: 0, lifetime: 0, protocol, nonce, internal }),
    };
}
