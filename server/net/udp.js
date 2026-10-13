// A question asked over UDP, as the router's protocols and STUN ask theirs (generated/
// world_server_plan.md §9.3): sent, and sent again while unanswered, a little longer each time
// (RFC 6886 §3.1: 250 ms, doubling), the answer taken only from the address it was asked of. And
// addresses as the protocols carry them: 16 bytes, an IPv4 address in its IPv6-mapped form.

import dgram from "node:dgram";
import { isIP } from "node:net";

/** No answer came. */
export class NoAnswer extends Error {}

// An address as compared: its zone dropped (fe80::1%en0), an IPv4-mapped one as IPv4
const plain = (address) => String(address).replace(/%.*$/, "").replace(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i, "$1").toLowerCase();

/**
 * `message` (a Buffer) sent to `address`:`port`, and again after `first` ms, then twice as long,
 * `tries` times in all. Each reply from that address is given to `accept(reply)`: the first value
 * it returns (other than undefined) is the answer; what it throws, the refusal. Refused with
 * NoAnswer if nothing's accepted in time.
 */
export function ask({ address, port, message, accept = (reply) => reply, tries = 4, first = 250 }) {
    return new Promise((resolve, reject) => {
        const socket = dgram.createSocket(isIP(plain(address)) === 6 ? "udp6" : "udp4");
        let timer = null;
        let sent = 0;
        let wait = first;
        let over = false;

        const done = (error, value) => {
            if (over) {
                return;
            }

            over = true;
            clearTimeout(timer);
            socket.close();
            error ? reject(error) : resolve(value);
        };

        const send = () => {
            if (sent === tries) {
                done(new NoAnswer(`No answer from ${address} (port ${port}).`));

                return;
            }

            sent++;
            socket.send(message, port, address, (error) => error && done(error));
            timer = setTimeout(send, wait);
            wait *= 2;
        };

        socket.on("error", (error) => done(error));
        socket.on("message", (reply, from) => {
            if (plain(from.address) !== plain(address) || from.port !== port) {
                return;
            }

            try {
                const value = accept(reply);

                if (value !== undefined) {
                    done(null, value);
                }
            } catch (error) {
                done(error);
            }
        });
        socket.bind(0, send);
    });
}

/** An IP address as 16 bytes: IPv6's own, an IPv4 address in its IPv6-mapped form (::ffff:a.b.c.d). */
export function bytesOf(address) {
    const bare = plain(address);

    if (isIP(bare) === 4) {
        return Buffer.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xff, ...bare.split(".").map(Number)]);
    }

    if (isIP(bare) !== 6) {
        throw new Error(`${address} isn't an IP address.`);
    }

    // (Written as URLs write it: hex groups alone, an IPv4 tail among them)
    const text = new URL(`http://[${bare}]`).hostname.slice(1, -1);
    const [head, rest = null] = text.split("::");
    const groups = (part) => (part ? part.split(":") : []);
    const all = rest === null ? groups(head) : [...groups(head), ...Array(8 - groups(head).length - groups(rest).length).fill("0"), ...groups(rest)];
    const bytes = Buffer.alloc(16);

    all.forEach((group, at) => bytes.writeUInt16BE(parseInt(group, 16), at * 2));

    return bytes;
}

/** 16 bytes as an IP address: an IPv4-mapped one as IPv4 (a.b.c.d), else IPv6, shortened as written. */
export function addressOf(bytes) {
    if (bytes.subarray(0, 10).every((byte) => byte === 0) && bytes[10] === 0xff && bytes[11] === 0xff) {
        return [...bytes.subarray(12, 16)].join(".");
    }

    const groups = [];

    for (let at = 0; at < 16; at += 2) {
        groups.push(bytes.readUInt16BE(at).toString(16));
    }

    // (The longest run of zero groups, two or more, written ::)
    let best = { at: -1, length: 0 };

    for (let at = 0; at < 8; ) {
        let end = at;

        while (end < 8 && groups[end] === "0") {
            end++;
        }

        if (end - at > best.length) {
            best = { at, length: end - at };
        }

        at = end === at ? at + 1 : end;
    }

    if (best.length < 2) {
        return groups.join(":");
    }

    return `${groups.slice(0, best.at).join(":")}::${groups.slice(best.at + best.length).join(":")}`;
}
