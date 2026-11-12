// The world server's structured log (generated/multiplayer_scaling_plan.md 6A-5): one line of JSON
// for each thing that happens, beside the journals people read (manage.js, storage/worlds.js),
// for whatever gathers logs to read (journald, Console, a shipper): { t (when, ISO), event (what:
// "player.entered", "refused", "world.life", "journal", "world.journal"...), and that event's fields }. The server
// run from the command line or the Mac app writes them to its output, among what it says there
// (serve.js); a WorldServer made any other way writes none unless it's given somewhere to.
//
// What may be in a line is decided here, in one place, so that a line can never carry what would
// let anyone in or point at anyone's home:
// - a field is written only if its name is one of FIELDS: never a key, a code, a ticket, a
//   session, a token, a cookie or a key's label;
// - an address is never written whole: `net` is the network it's on (an IPv4 address's first
//   three numbers, an IPv6 one's first three groups), enough to see the same visitor trying again;
// - every string is scrubbed all the same (scrub): anything shaped like a key, a long token or a
//   whole address inside it is taken out, so a sentence from a journal can't carry one in.

import { isIP } from "node:net";
import { plainAddress } from "./access/addresses.js";

/** The fields a line may have besides `t` and `event`, and what each is. */
export const FIELDS = Object.freeze({
    world: "a world's id",
    player: "a player's id",
    role: "the part they came in as",
    reason: "why something was refused or closed: one of the server's short codes",
    net: "the network an address is on, never the address",
    keyId: "a key's id (what the management page lists it by), never the key",
    codeId: "a short code's id, never the code",
    listing: "a listing's id on the broker",
    by: "who did it, as the journals say it",
    count: "how many",
    life: "how a world is: stored, loading, running, empty, stopping",
    ms: "how long, or how much time",
    port: "a port the server listens on",
    version: "the server's version",
    worlds: "how many worlds it keeps",
    first: "whether it's the player's first time in",
    text: "a sentence, as the server's journal has it, or a world's",
});

/** What the access hooks tell of (access/policy.js on), as the log names it. */
export const ACCESS_EVENTS = Object.freeze({
    entered: "player.entered",
    left: "player.left",
    refused: "refused",
    keyIssued: "key.issued",
    keyRevoked: "key.revoked",
    keyReplaced: "key.replaced",
    codeMade: "code.made",
    codeRedeemed: "code.redeemed",
    codesBurned: "codes.burned",
    banned: "player.banned",
    unbanned: "player.unbanned",
    announced: "listing.announced",
    withdrawn: "listing.withdrawn",
});

/** The network an address is on ("203.0.113.x", "2001:db8:1::x"), or null if it isn't an address. */
export function netOf(address) {
    const plain = plainAddress(address);

    if (!plain) {
        return null;
    }

    if (isIP(plain) === 4) {
        return `${plain.split(".").slice(0, 3).join(".")}.x`;
    }

    // (An IPv6 address written out in full, then its first three groups)
    const [head, tail = null] = plain.split("::");
    const before = head ? head.split(":") : [];
    const after = tail ? tail.split(":") : [];
    const groups = tail === null ? before : [...before, ...new Array(Math.max(0, 8 - before.length - after.length)).fill("0"), ...after];

    return `${groups.slice(0, 3).join(":")}::x`;
}

// What's taken out of any string: a key or a code as the server writes them (groups of five
// letters and digits), a long run of a token's characters, an IPv4 address, an IPv6 address
const SHAPES = [
    [/\b[A-Z0-9]{5}(?:-[A-Z0-9]{5})+\b/g, () => "[key]"],
    [/[A-Za-z0-9_-]{24,}/g, () => "[token]"],
    [/\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}\b/g, (_, a, b, c) => `${a}.${b}.${c}.x`],
];

// Anything of hex digits, colons and dots that reads as an IPv6 address (one carrying an IPv4
// address among them), its network in its place; a time of day, or a sentence's full stop after
// it, is left as it is
const SIXES = /(?<![0-9A-Za-z:.])[0-9A-Fa-f:.]{2,45}(?![0-9A-Za-z:])/g;

function withoutSixes(text) {
    return text.replace(SIXES, (found) => {
        const address = found.replace(/\.+$/, "");

        return isIP(address) === 6 ? `${netOf(address)}${found.slice(address.length)}` : found;
    });
}

/** `text` with anything shaped like a key, a token or a whole address taken out of it. */
export function scrub(text) {
    let out = withoutSixes(String(text));

    for (const [shape, instead] of SHAPES) {
        out = out.replace(shape, instead);
    }

    return out;
}

/**
 * What a line says of something the access hooks told of: [event, fields], or null for one the log
 * doesn't keep. Its key and code by their ids, its address by its network; its key's label, a
 * ticket or a session never.
 */
export function accessLine(event, detail = {}) {
    const name = ACCESS_EVENTS[event];

    if (!name) {
        return null;
    }

    return [
        name,
        {
            world: detail.world,
            player: detail.player,
            role: detail.role,
            reason: detail.why,
            net: detail.address === undefined ? undefined : netOf(detail.address),
            keyId: detail.key ?? detail.via,
            codeId: detail.code,
            listing: detail.listing,
            by: detail.by,
            count: detail.count,
            first: event === "entered" ? Boolean(detail.new) : undefined,
        },
    ];
}

export class Log {
    /**
     * @param {object} [options]
     * @param {function} [options.write] - Where each line goes (the line, ending in a newline): none, nothing's written.
     * @param {function} [options.clock] - The time (a Date), but for the tests.
     */
    constructor({ write = null, clock = () => new Date() } = {}) {
        this.write = write;
        this.clock = clock;
    }

    /**
     * One line: `event`, and those of `fields` a line may have (FIELDS: any other is left out, as
     * is one that's null, undefined or not a plain value), every string scrubbed. Never throws:
     * a log that can't be written is no reason for the server to stop.
     */
    event(event, fields = {}) {
        if (!this.write) {
            return;
        }

        try {
            const line = { t: this.clock().toISOString(), event: scrub(event) };

            for (const [name, value] of Object.entries(fields ?? {})) {
                if (!Object.hasOwn(FIELDS, name) || value === null || value === undefined) {
                    continue;
                }

                if (typeof value === "string") {
                    line[name] = scrub(value);
                } else if ((typeof value === "number" && Number.isFinite(value)) || typeof value === "boolean") {
                    line[name] = value;
                }
            }

            this.write(`${JSON.stringify(line)}\n`);
        } catch {
            // (Nowhere to write it, or it couldn't be written: the server goes on)
        }
    }

    /** Something the access hooks told of (access/policy.js on), as a line. */
    access(event, detail) {
        const line = accessLine(event, detail);

        if (line) {
            this.event(...line);
        }
    }
}
