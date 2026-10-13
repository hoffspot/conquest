// NAT-PMP (RFC 6886): a router asked for its public address, and to forward a port to this
// computer for a while (generated/world_server_plan.md §9.3). Apple's routers speak it, and many
// others; a router that speaks PCP answers NAT-PMP too, or says it only speaks PCP. Asked of the
// gateway on UDP 5351.
//
//   external address   [0, 0]                                   -> [0, 128, result:2, epoch:4, address:4]
//   map TCP (UDP: 1)   [0, 2, 0:2, internal:2, external:2, life:4] -> [0, 130, result:2, epoch:4, internal:2, external:2, life:4]
//
// A mapping is let go by asking for it again with no lifetime.

import { ask as askUdp } from "./udp.js";

/** The port routers answer NAT-PMP (and PCP) on. */
export const NATPMP_PORT = 5351;

/** What a NAT-PMP router's result codes mean (RFC 6886 §3.5). */
export const NATPMP_RESULTS = Object.freeze({ 1: "doesn't speak this version", 2: "refused (forwarding may be turned off in its settings)", 3: "has no connection to the internet", 4: "has no room for more forwarding", 5: "doesn't know that request" });

/** A NAT-PMP router's refusal: `code` its result, in words. */
export class NatPmpError extends Error {
    constructor(code) {
        super(`The router ${NATPMP_RESULTS[code] ?? `refused (NAT-PMP result ${code})`}.`);
        this.code = code;
    }
}

/**
 * A NAT-PMP router at `gateway` (its port `port`). `ask` (udp.js) for the tests; `tries` and
 * `first` how long it's waited for. Returns { kind, externalAddress(), map(), unmap() }.
 */
export function natpmp({ gateway, port = NATPMP_PORT, ask = askUdp, tries = 4, first = 250 }) {
    const call = (request, opcode, size) =>
        ask({
            address: gateway,
            port,
            message: request,
            tries,
            first,
            accept: (reply) => {
                if (reply.length < 4 || reply[0] !== 0 || reply[1] !== 128 + opcode) {
                    return undefined;
                }

                const result = reply.readUInt16BE(2);

                if (result) {
                    throw new NatPmpError(result);
                }

                return reply.length >= size ? reply : undefined;
            },
        });

    const map = async ({ internalPort, externalPort = internalPort, lifetime = 7200, protocol = "tcp" }) => {
        const opcode = protocol === "udp" ? 1 : 2;
        const request = Buffer.alloc(12);

        request[1] = opcode;
        request.writeUInt16BE(internalPort, 4);
        request.writeUInt16BE(externalPort, 6);
        request.writeUInt32BE(lifetime, 8);

        const reply = await call(request, opcode, 16);

        return { internalPort: reply.readUInt16BE(8), externalPort: reply.readUInt16BE(10), lifetime: reply.readUInt32BE(12), epoch: reply.readUInt32BE(4) };
    };

    return {
        kind: "natpmp",

        /** The router's public address: { address, epoch (seconds since it started: one that goes back means it restarted, and lost its mappings) }. */
        async externalAddress() {
            const reply = await call(Buffer.from([0, 0]), 0, 12);

            return { address: [...reply.subarray(8, 12)].join("."), epoch: reply.readUInt32BE(4) };
        },

        /** A port forwarded for `lifetime` seconds: { internalPort, externalPort (the router may give another), lifetime, epoch }. */
        map,

        /** A mapping let go. */
        unmap: ({ internalPort, protocol = "tcp" }) => map({ internalPort, externalPort: 0, lifetime: 0, protocol }),
    };
}
