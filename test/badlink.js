// The bad-link kit (generated/multiplayer_scaling_plan.md F-7): a link between two ends of a test
// that behaves as a phone's does, the same every run. For the tests in Node, BadLink: what's said
// one way or the other arrives after a delay, with jitter, and now and then everything's held up,
// by nothing but its options and the time, so two runs of a scenario meet the very same link. For
// the browser tests, badProxy: a TCP proxy to stand between a page and the test's server, holding
// up each way's bytes as BadLink holds messages.
//
// A link is ordered or it isn't:
//
// - Ordered (a WebSocket, a WebRTC data channel as the game opens one: TCP's promise). Nothing's
//   lost and nothing overtakes. What a network loses, the transport sends again, and everything
//   behind it waits: loss shows as a stall of 200 to 1,000 ms. So an ordered link has `stall`,
//   hold-ups that come by the clock whatever's said (`chance` of one beginning in each `every`
//   ms), and may have `loss` too: that share of what's sent held up, and all that's behind it.
// - Unordered (datagrams: what the replicated views' frames are made safe for). `loss` is lost
//   for good, and jitter lets a later message overtake an earlier one (`reordered` counts them).
//
// Time is the caller's: `link.now` is set (or `advance`d) by the test, and `take(lane)` gives
// what's arrived by then. Nothing here reads a clock.

import net from "node:net";
import { createRandom } from "../client/js/core/random.js";

/** The lanes a link has unless it's given others: each way its own hold-ups and jitter. */
export const LANES = Object.freeze({ up: Object.freeze({ seed: 17, salt: 7 }), down: Object.freeze({ seed: 23, salt: 11 }) });

/** Links to try a netcode over, by name: `rtt` the round trip (ms), the rest as BadLink takes them. */
export const LINKS = Object.freeze({
    perfect: Object.freeze({ rtt: 0, jitter: 0, stall: Object.freeze({ chance: 0 }) }),
    wifi: Object.freeze({ rtt: 30, jitter: 10, stall: Object.freeze({ chance: 0.002, least: 200, most: 400 }) }),
    // (The forecast's: a phone on a fair signal. test/joinedgame.js)
    phone: Object.freeze({ rtt: 200, jitter: 40, stall: Object.freeze({ chance: 0.02, least: 300, most: 300 }) }),
    // (The plan's Stage 3 gate: a 300 ms round trip with 40 ms of jitter)
    far: Object.freeze({ rtt: 300, jitter: 40, stall: Object.freeze({ chance: 0.02, least: 200, most: 1000 }) }),
    poor: Object.freeze({ rtt: 400, jitter: 120, stall: Object.freeze({ chance: 0.05, least: 200, most: 1000 }) }),
});

// The jitter at a time, as a share (0 to 1): the same for all that's said within 25 ms, and by
// the time alone
const jitterAt = (salt, at) => createRandom((Math.floor(at / 25) * 2654435761 + salt) >>> 0).next();

/**
 * A link between two ends, seeded. `rtt`: the round trip (ms), half of it each way; `jitter`: how
 * much a message's delay varies (ms, half either side); `stall`: { chance (of a hold-up beginning
 * in each `every` ms, 100 unless said), least, most (how long one lasts, ms: 200 to 1,000 unless
 * said) }; `loss`: the share of messages lost (unordered), or held up as a hold-up is (ordered);
 * `ordered`: whether it keeps what's sent in order and loses nothing (true unless said); `lanes`:
 * each way by name, with its `seed` and `salt` (LANES: "up" and "down"); `sizeOf`: a message's
 * size, for what's counted (a text's length, a buffer's bytes).
 */
export class BadLink {
    #lanes = new Map();

    constructor({ rtt = 0, jitter = 0, stall = {}, loss = 0, ordered = true, lanes = LANES, sizeOf = (payload) => payload?.byteLength ?? payload?.length ?? 0 } = {}) {
        Object.assign(this, { rtt, jitter, loss, ordered, sizeOf });
        this.stall = { chance: 0, every: 100, least: 200, most: 1000, ...stall };

        /** The time (ms), as the test has it. */
        this.now = 0;

        for (const [name, { seed, salt }] of Object.entries(lanes)) {
            this.#lanes.set(name, {
                salt,
                // (The hold-ups' own numbers, drawn in the order of the time; and what's lost's, in the order it's said)
                stalling: createRandom(seed),
                losing: createRandom((seed * 31 + 5) >>> 0),
                stalls: [],
                stalledTo: 0,
                last: 0,
                order: 0,
                waiting: [],
                counts: { sent: 0, delivered: 0, lost: 0, held: 0, reordered: 0, bytes: 0 },
            });
        }
    }

    #lane(name) {
        const lane = this.#lanes.get(name);

        if (!lane) {
            throw new Error(`The link has no lane called "${name}": ${[...this.#lanes.keys()].join(", ")}`);
        }

        return lane;
    }

    // The hold-up a lane's in at `at`, if any ([from, to]): its hold-ups worked out as far as that
    #held(lane, at) {
        const { chance, every, least, most } = this.stall;

        for (; chance > 0 && lane.stalledTo <= at; lane.stalledTo += every) {
            if (lane.stalling.next() < chance) {
                lane.stalls.push([lane.stalledTo, lane.stalledTo + (most > least ? least + lane.stalling.next() * (most - least) : least)]);
            }
        }

        return lane.stalls.find(([from, to]) => at >= from && at < to) ?? null;
    }

    /** When what's sent on `lane` at `at` would arrive (ms), hold-ups and jitter counted, order not. */
    arrival(lane, at = this.now) {
        const one = this.#lane(lane);
        const held = this.#held(one, at);

        return (held ? held[1] : at) + this.rtt / 2 + (jitterAt(one.salt, at) - 0.5) * this.jitter;
    }

    /** `payload` sent on `lane` now: it arrives when the link brings it (take), or never. Returns when (ms), or null if it's lost. */
    send(lane, payload) {
        const one = this.#lane(lane);
        const lost = this.loss > 0 && one.losing.next() < this.loss;

        one.counts.sent++;
        one.counts.bytes += this.sizeOf(payload);

        if (lost && !this.ordered) {
            one.counts.lost++;

            return null;
        }

        let at = this.arrival(lane);

        if (this.#held(one, this.now)) {
            one.counts.held++;
        }

        // (Lost on an ordered link: sent again once it's missed, and all behind it waits on it)
        if (lost) {
            at += this.stall.least + one.losing.next() * (this.stall.most - this.stall.least);
            one.counts.lost++;
        }

        if (this.ordered) {
            at = Math.max(one.last, at);
            one.last = at;
            one.waiting.push({ at, order: one.order++, payload });
        } else {
            const before = one.waiting.findIndex((other) => other.at > at);

            if (before >= 0) {
                one.counts.reordered++;
            }

            one.waiting.splice(before < 0 ? one.waiting.length : before, 0, { at, order: one.order++, payload });
        }

        return at;
    }

    /** What's arrived on `lane` by now, in the order it arrived (each taken once). */
    take(lane) {
        const one = this.#lane(lane);
        const arrived = [];

        while (one.waiting.length && one.waiting[0].at <= this.now) {
            arrived.push(one.waiting.shift().payload);
        }

        one.counts.delivered += arrived.length;

        return arrived;
    }

    /** The time moved on by `ms`. */
    advance(ms) {
        this.now += ms;

        return this.now;
    }

    /** How many are still on their way on `lane`. */
    pending(lane) {
        return this.#lane(lane).waiting.length;
    }

    /** What a lane's carried: { sent, delivered, lost, held (sent during a hold-up), reordered, bytes }. */
    counts(lane) {
        return { ...this.#lane(lane).counts };
    }
}

/**
 * A TCP proxy for the browser tests: listens on a port of its own (loopback) and carries each
 * connection to `port` (on `host`), each way's bytes held up as a BadLink of `link`'s options
 * holds messages (an ordered one: this is TCP). The page's "up" lane is what it sends, "down"
 * what it's sent. Point the page at `proxy.port` in place of the server's. Returns { port,
 * counts(), close() } once it's listening.
 */
export async function badProxy({ port, host = "127.0.0.1", link = {}, clock = () => performance.now() }) {
    const sockets = new Set();
    const totals = { connections: 0, up: 0, down: 0 };
    const began = clock();

    const server = net.createServer((near) => {
        const far = net.connect({ port, host });
        // (Each connection its own link, begun as the proxy was: its hold-ups come at the same times in every one)
        const bad = new BadLink({ ...link, ordered: true });
        const timers = new Set();

        totals.connections++;
        sockets.add(near).add(far);

        // One way: each piece sent on when the link has it arrive, in order
        const carry = (lane, from, to) => {
            let last = Promise.resolve();

            from.on("data", (bytes) => {
                bad.now = clock() - began;
                totals[lane] += bytes.length;

                const wait = Math.max(0, bad.send(lane, bytes) - bad.now);
                const due = new Promise((resolve) => {
                    const timer = setTimeout(() => {
                        timers.delete(timer);
                        resolve();
                    }, wait);

                    timers.add(timer);
                });

                last = Promise.all([last, due]).then(() => {
                    if (!to.destroyed) {
                        to.write(bytes);
                    }
                });
            });
            from.on("end", () => last.then(() => to.destroyed || to.end()));
        };

        carry("up", near, far);
        carry("down", far, near);

        for (const [one, other] of [[near, far], [far, near]]) {
            one.on("error", () => other.destroy());
            one.on("close", () => {
                sockets.delete(one);

                if (!sockets.has(other)) {
                    timers.forEach(clearTimeout);
                }
            });
        }
    });

    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
    });

    return {
        port: server.address().port,
        counts: () => ({ ...totals }),
        close: () =>
            new Promise((resolve) => {
                sockets.forEach((socket) => socket.destroy());
                server.close(() => resolve());
            }),
    };
}
