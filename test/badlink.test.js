// The bad-link kit (test/badlink.js; generated/multiplayer_scaling_plan.md F-7): a seeded link
// for the tests in Node, the same every run, ordered (loss shows as hold-ups) or not (loss is
// lost, and what's sent later can overtake); and a TCP proxy that holds a browser test's bytes up
// the same way. The forecast's scenarios (test/forecast.test.js, by test/joinedgame.js) play over
// it, as they played over the link they had of their own.
import assert from "node:assert/strict";
import net from "node:net";
import { describe, it } from "node:test";
import { BadLink, badProxy, LANES, LINKS } from "./badlink.js";

// A link's arrivals for a message sent every `every` ms for `ms`, each lane: [{ sent, got }] as taken
function run(options, { ms = 20000, every = 16, lanes = ["up", "down"] } = {}) {
    const link = new BadLink(options);
    const got = Object.fromEntries(lanes.map((lane) => [lane, []]));
    let k = 0;

    for (; link.now < ms; link.advance(every)) {
        for (const lane of lanes) {
            for (const sent of link.take(lane)) {
                got[lane].push({ ...sent, got: link.now });
            }

            link.send(lane, { k, sent: link.now });
        }

        k++;
    }

    // (And the rest, as it arrives)
    for (const end = link.now + 5000; link.now < end; link.advance(every)) {
        for (const lane of lanes) {
            for (const sent of link.take(lane)) {
                got[lane].push({ ...sent, got: link.now });
            }
        }
    }

    return { link, got, sent: k };
}

describe("a seeded bad link (test/badlink.js BadLink)", () => {
    it("is the same link every run, each way its own, and by the time alone: however much is said", () => {
        const [a, b] = [run(LINKS.far), run(LINKS.far)];

        assert.deepEqual(a.got, b.got);
        assert.notDeepEqual(a.got.up.map(({ got }) => got), a.got.down.map(({ got }) => got), "each way its own hold-ups and jitter");

        // (When something sent at a time would arrive doesn't depend on what else was sent)
        const [quiet, busy] = [new BadLink(LINKS.far), new BadLink(LINKS.far)];

        for (let at = 0; at < 20000; at += 7) {
            busy.now = at;
            busy.send("up", "x");
        }

        for (const at of [0, 990, 5005, 12345, 19999]) {
            assert.equal(quiet.arrival("up", at), busy.arrival("up", at));
        }

        assert.deepEqual(Object.keys(LANES), ["up", "down"]);
        assert.throws(() => quiet.send("sideways", "x"), /no lane called "sideways"/);
    });

    it("carries everything in order on an ordered link, each a half round trip late give or take the jitter, but for the hold-ups", () => {
        const { link, got, sent } = run({ rtt: 300, jitter: 40, stall: { chance: 0 } });

        for (const lane of ["up", "down"]) {
            assert.deepEqual(got[lane].map(({ k }) => k), Array.from({ length: sent }, (_, k) => k), "all of it, in order");
            assert.deepEqual(link.counts(lane), { sent, delivered: sent, lost: 0, held: 0, reordered: 0, bytes: 0 });
            assert.equal(link.pending(lane), 0);

            // (Taken on the first 16 ms tick after it's arrived)
            for (const one of got[lane]) {
                assert.ok(one.got - one.sent >= 130 && one.got - one.sent <= 170 + 16, `${one.got - one.sent} ms`);
            }
        }

        // (No delay at all: there the moment it's sent)
        const perfect = new BadLink(LINKS.perfect);

        perfect.send("up", "now");
        assert.deepEqual(perfect.take("up"), ["now"]);
    });

    it("holds everything up now and then on an ordered link, for 200 to 1,000 ms, as a lost segment holds a stream: late, never lost, never out of order", () => {
        const { link, got, sent } = run({ rtt: 100, jitter: 0, stall: { chance: 0.02 } });
        const late = got.up.filter((one) => one.got - one.sent > 50 + 16);
        const worst = Math.max(...got.up.map((one) => one.got - one.sent));

        assert.deepEqual(got.up.map(({ k }) => k), Array.from({ length: sent }, (_, k) => k));
        // (One sent as a hold-up ends is hardly late at all)
        assert.ok(link.counts("up").held > 0 && late.length > link.counts("up").held / 2, `${link.counts("up").held} sent during a hold-up, ${late.length} late`);
        assert.ok(worst > 50 + 200 && worst <= 50 + 2 * 1000 + 16, `the longest wait ${worst} ms`);

        // (Loss on an ordered link is a hold-up too: what's lost comes late, and all behind it waits)
        const lossy = run({ rtt: 100, jitter: 0, stall: { chance: 0 }, loss: 0.01 });

        assert.deepEqual(lossy.got.up.map(({ k }) => k), Array.from({ length: lossy.sent }, (_, k) => k));
        assert.ok(lossy.link.counts("up").lost > 0);
        assert.equal(lossy.link.counts("up").delivered, lossy.sent);
        assert.ok(lossy.got.up.some((one) => one.got - one.sent >= 50 + 200));
    });

    it("loses for good and lets a later message overtake on an unordered link", () => {
        const { link, got, sent } = run({ rtt: 100, jitter: 80, stall: { chance: 0 }, loss: 0.1, ordered: false });
        const counts = link.counts("up");
        const order = got.up.map(({ k }) => k);

        assert.equal(counts.sent, sent);
        assert.equal(counts.delivered + counts.lost, sent);
        assert.ok(counts.lost > sent * 0.05 && counts.lost < sent * 0.15, `${counts.lost} of ${sent} lost`);
        assert.equal(new Set(order).size, order.length, "nothing twice");
        assert.ok(counts.reordered > 0 && order.some((k, index) => index > 0 && k < order[index - 1]), "some out of order");
        assert.deepEqual([...got.up].sort((x, y) => x.got - y.got).map(({ k }) => k), order, "taken as they arrive");
    });

    it("counts what it carries by its size", () => {
        const link = new BadLink(LINKS.wifi);

        link.send("down", "twelve bytes");
        link.send("down", new Uint8Array(1500));
        assert.equal(link.counts("down").bytes, 1512);
        assert.equal(link.counts("up").bytes, 0);
    });
});

describe("a TCP proxy that holds a browser test's bytes up (test/badlink.js badProxy)", () => {
    it("carries a connection both ways, whole and in order, no sooner than the link's delay", async () => {
        // (A server that says back what it's sent)
        const echo = net.createServer((socket) => socket.pipe(socket));

        await new Promise((resolve) => echo.listen(0, "127.0.0.1", resolve));

        const proxy = await badProxy({ port: echo.address().port, link: { rtt: 120, jitter: 20, stall: { chance: 0 } } });
        const socket = net.connect({ port: proxy.port, host: "127.0.0.1" });
        const sent = Buffer.concat(Array.from({ length: 40 }, (_, k) => Buffer.from(`line ${k} ${"x".repeat(k * 13)}\n`)));
        const parts = [];
        const began = performance.now();
        let first = null;

        try {
            await new Promise((resolve, reject) => {
                socket.on("error", reject);
                socket.on("data", (bytes) => {
                    first ??= performance.now() - began;
                    parts.push(bytes);

                    if (Buffer.concat(parts).length >= sent.length) {
                        resolve();
                    }
                });
                socket.on("connect", () => {
                    // (In pieces, some of them together)
                    for (let at = 0; at < sent.length; at += 97) {
                        socket.write(sent.subarray(at, at + 97));
                    }
                });
            });

            assert.ok(Buffer.concat(parts).equals(sent), "what came back is what was sent, in order");
            // (Up and back: a round trip less the jitter's half each way, and a timer's millisecond)
            assert.ok(first >= 120 - 20 - 2, `the first of it back after ${first.toFixed(0)} ms`);
            assert.deepEqual(proxy.counts(), { connections: 1, up: sent.length, down: sent.length });
        } finally {
            socket.destroy();
            await proxy.close();
            await new Promise((resolve) => echo.close(resolve));
        }
    });
});
