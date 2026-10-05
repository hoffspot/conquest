// The downloader (client/js/app/fetcher.js): its controller, and the downloader on a fake clock,
// network and caches
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { downloadLine } from "../client/js/app/debug.js";
import { Controller, Fetcher, PACING } from "../client/js/app/fetcher.js";

const KB = 1024;
const BASE = "https://example.github.io/conquest/";

const hashOf = (bytes) => createHash("sha256").update(bytes).digest("hex").slice(0, 10);

// A file of `bytes` bytes, each its place in it (mod 251), so a part out of place shows
function file(path, bytes) {
    const data = new Uint8Array(bytes).map((_, k) => k % 251);

    return { path, hash: hashOf(data), bytes, data };
}

// The world the downloader runs in: a clock that moves only when it waits or a request takes time
// (`rtt` ms, then `speed` bytes/s), a server with `files` (by path; serving parts unless `ranges`
// is false), caches, and every request it was sent ({ path, from, to, at })
function world({ files = [], ranges = true, rtt = 50, speed = 1024 * KB, connection, onRequest = () => {} } = {}) {
    const clock = { now: 0 };
    const requests = [];
    const stores = new Map();
    const served = new Map(files.map((each) => [`/conquest/${each.path}`, each]));

    const caches = {
        open: async (name) => {
            if (!stores.has(name)) {
                stores.set(name, new Map());
            }

            const store = stores.get(name);

            return {
                match: async (url) => store.get(url)?.clone(),
                put: async (url, response) => {
                    store.set(url, new Response(await response.arrayBuffer(), { headers: response.headers }));
                },
            };
        },
    };

    const fetch = async (url, { headers = {} } = {}) => {
        const { pathname } = new URL(url);
        const found = served.get(pathname);
        const range = /^bytes=(\d+)-(\d+)$/.exec(headers.Range ?? "");
        const request = { path: pathname.replace("/conquest/", ""), at: clock.now };

        requests.push(request);
        onRequest(request, requests.length);

        if (clock.offline) {
            throw new TypeError("Failed to fetch");
        }

        if (!found) {
            return new Response("Not found", { status: 404 });
        }

        if (ranges && range) {
            const from = Number(range[1]);
            const to = Math.min(Number(range[2]), found.bytes - 1);

            Object.assign(request, { from, to });
            clock.now += rtt + ((to - from + 1) / speed) * 1000;

            return new Response(found.data.slice(from, to + 1), { status: 206, headers: { "Content-Range": `bytes ${from}-${to}/${found.bytes}` } });
        }

        // (All of it, as a stream of 16 KB pieces)
        const data = found.data;
        let at = 0;

        clock.now += rtt;

        return new Response(new ReadableStream({
            pull(controller) {
                if (at >= data.length) {
                    controller.close();

                    return;
                }

                controller.enqueue(data.slice(at, at + 16 * KB));
                at += 16 * KB;
            },
        }), { status: 200 });
    };

    const fetcher = new Fetcher({
        base: BASE,
        fetch,
        caches,
        now: () => clock.now,
        sleep: async (ms) => {
            clock.now += Math.max(ms, 1);
            await new Promise((resolve) => setImmediate(resolve));
        },
        digest: (bytes) => crypto.subtle.digest("SHA-256", bytes),
        connection,
    });

    const kept = (path) => stores.get("pellagos-assets-v2")?.get(new URL(`${path}?h=${files.find((each) => each.path === path)?.hash}`, BASE).href);

    return { fetcher, clock, requests, kept, stores };
}

const bytesOf = async (blob) => new Uint8Array(await blob.arrayBuffer());

describe("the downloader's controller", () => {
    it("starts slower playing together than alone, and moves from one to the other", () => {
        const controller = new Controller();

        assert.equal(controller.rate, PACING.start.alone);
        controller.setTogether(true);
        assert.equal(controller.rate, PACING.start.together);
        assert.equal(new Controller({ together: true }).rate, PACING.start.together);
    });

    it("adds to the rate while the round trip stays at its least, and halves it as soon as it grows, waiting a round trip", () => {
        const controller = new Controller({ together: true });

        for (let k = 0; k < 5; k++) {
            controller.sample({ at: k * 1000, rtt: 50 });
        }

        assert.equal(controller.rate, PACING.start.together + 5 * PACING.step);
        assert.equal(controller.base, 50);

        // (One answer late: the page busy as likely as the link queueing, so nothing changes)
        const before = controller.rate;

        controller.sample({ at: 5000, rtt: 300 });
        assert.equal(controller.queueing, 0);
        assert.equal(controller.rate, before + PACING.step);

        // (Late three times running, by 60 ms at the least: queueing over the target)
        controller.sample({ at: 6000, rtt: 110 });
        assert.equal(controller.queueing, 0, "the least of the last three is still 50");
        controller.sample({ at: 7000, rtt: 120 });
        assert.equal(controller.queueing, 60);
        assert.equal(controller.rate, (before + 2 * PACING.step) / 2);
        assert.equal(controller.wait(7000), 120, "a round trip before the next part");

        // (Between half the target and the target: held as it is)
        const held = controller.rate;

        controller.sample({ at: 8000, rtt: 70 });
        assert.equal(controller.rate, held);

        // (Back down: recovering)
        controller.sample({ at: 9000, rtt: 52 });
        assert.equal(controller.rate, held + PACING.step);
    });

    it("halves the rate when the joined game's playout is strained, whatever the round trip", () => {
        const controller = new Controller({ together: true });

        controller.sample({ at: 0, rtt: 50, strained: true });
        assert.equal(controller.rate, PACING.start.together / 2);
    });

    it("never goes slower than its least, nor over its share of what the link carries: half playing together, 80% alone", () => {
        const together = new Controller({ together: true });

        for (let k = 0; k < 20; k++) {
            together.sample({ at: k, rtt: 50 + k * 100 });
        }

        assert.equal(together.rate, PACING.least);

        together.delivered({ bytes: 400 * KB, ms: 1000 });

        for (let k = 0; k < 50; k++) {
            together.sample({ at: 10000 + k, rtt: 50 });
        }

        assert.equal(together.rate, 200 * KB);

        const alone = new Controller();

        alone.delivered({ bytes: 400 * KB, ms: 1000 });
        assert.equal(alone.rate, 320 * KB);
    });

    it("takes the least round trip from the last minute only", () => {
        const controller = new Controller({ together: true });

        controller.sample({ at: 0, rtt: 20 });
        controller.sample({ at: 30000, rtt: 80 });
        assert.equal(controller.base, 20);
        controller.sample({ at: 61000, rtt: 80 });
        assert.equal(controller.base, 80);
        assert.equal(controller.queueing, 0);
    });

    it("holds off while something's so, but no longer than it's allowed", async () => {
        const { fetcher, clock } = world();

        fetcher.hold("joining", { for: 5000, until: () => false, most: 30000 });
        clock.now = 29000;
        assert.deepEqual(fetcher.quiet, ["joining"]);
        clock.now = 30000;
        assert.deepEqual(fetcher.quiet, []);
    });

    it("sizes parts by what the link carries in a moment playing together, the largest alone; and spaces them to keep to the rate", () => {
        const together = new Controller({ together: true });

        assert.equal(together.partSize, PACING.part.least);
        together.delivered({ bytes: 2048 * KB, ms: 1000 });
        assert.equal(together.partSize, Math.round((2048 * KB * PACING.part.time) / 1000));
        together.delivered({ bytes: 100 * 1024 * KB, ms: 1000 });
        assert.equal(together.partSize, PACING.part.most);
        assert.equal(new Controller().partSize, PACING.part.most);

        const spaced = new Controller({ together: true });

        spaced.sent(1000, 64 * KB);
        assert.equal(spaced.wait(1000), 500, "64 KB at 128 KB/s");
        assert.equal(spaced.wait(1600), 0);
    });
});

describe("the downloader", () => {
    it("fetches a file a part at a time, checks it, keeps it where the service worker keeps the catalog's, and hands it over", async () => {
        const dragon = file("models/dragon.glb", 600 * KB);
        const { fetcher, requests, kept } = world({ files: [dragon] });
        const blob = await fetcher.want(dragon, "soon");

        assert.deepEqual(await bytesOf(blob), dragon.data);
        assert.equal(blob.type, "model/gltf-binary");
        assert.deepEqual(requests.map(({ from, to }) => [from, to]), [[0, 256 * KB - 1], [256 * KB, 512 * KB - 1], [512 * KB, 600 * KB - 1]]);
        assert.deepEqual(new Uint8Array(await kept(dragon.path).arrayBuffer()), dragon.data);
        assert.equal(fetcher.done, 1);
        assert.equal(fetcher.fetched, dragon.bytes);
        assert.equal(fetcher.status.current, null);
    });

    it("doesn't fetch a file that's kept already", async () => {
        const dragon = file("models/dragon.glb", 100 * KB);
        const { fetcher, requests } = world({ files: [dragon] });

        await fetcher.want(dragon);
        assert.deepEqual(await bytesOf(await fetcher.want(dragon)), dragon.data);
        assert.equal(requests.length, 1);
    });

    it("playing together, keeps to the rate: small parts, spaced out", async () => {
        const dragon = file("models/dragon.glb", 256 * KB);
        const { fetcher, requests, clock } = world({ files: [dragon] });

        fetcher.together = true;
        await fetcher.want(dragon);

        // 128 KB/s from the start, never over half what the parts came at (about 400 KB/s, with
        // the round trip), in parts of 32 KB, the least: each at least 32 KB / 200 KB/s after the last
        assert.ok(requests.length >= 8, `${requests.length} parts`);
        assert.ok(clock.now >= 1500, `${clock.now} ms for 256 KB at about 128 KB/s`);

        for (const [k, request] of requests.entries()) {
            assert.equal(request.to - request.from + 1, PACING.part.least);

            if (k > 0) {
                assert.ok(request.at - requests[k - 1].at >= 160, `part ${k}: ${request.at - requests[k - 1].at} ms after the last`);
            }
        }
    });

    it("fetches the most wanted first: a file wanted now takes over at the next part, and the one stopped carries on from where it got to", async () => {
        const dragon = file("models/dragon.glb", 1024 * KB);
        const wyvern = file("models/wyvern.glb", 300 * KB);
        let wyvernWanted;
        const { fetcher, requests } = world({
            files: [dragon, wyvern],
            onRequest: (_, count) => {
                if (count === 2) {
                    wyvernWanted = fetcher.want(wyvern, "now");
                }
            },
        });

        const dragonWanted = fetcher.want(dragon, "later");
        const seen = [];
        const watching = setInterval(() => fetcher.status.current && seen.push(fetcher.status.current), 0);

        assert.deepEqual(await bytesOf(await dragonWanted), dragon.data);
        assert.deepEqual(await bytesOf(await wyvernWanted), wyvern.data);
        clearInterval(watching);
        assert.ok(seen.length > 0 && seen.every((current) => Object.keys(current).join() === "path,received,bytes"), "what it's fetching, how far it's got (not its parts)");
        assert.deepEqual(requests.map(({ path, from }) => [path, from / KB]), [
            ["models/dragon.glb", 0],
            ["models/dragon.glb", 256],
            ["models/wyvern.glb", 0],
            ["models/wyvern.glb", 256],
            ["models/dragon.glb", 512],
            ["models/dragon.glb", 768],
        ]);
    });

    it("hears of a file wanted twice once, raised to the more wanted", async () => {
        const dragon = file("models/dragon.glb", 300 * KB);
        const wyvern = file("models/wyvern.glb", 300 * KB);
        const { fetcher, requests } = world({ files: [dragon, wyvern] });

        fetcher.hold("test");

        const first = fetcher.want(wyvern, "soon");
        const later = fetcher.want(dragon, "later");
        const again = fetcher.want(dragon, "now");

        assert.equal(later, again);

        // (Both queued, then let go)
        await new Promise((resolve) => setImmediate(resolve));
        fetcher.release("test");
        await Promise.all([first, later]);
        assert.deepEqual(requests.map(({ path }) => path), ["models/dragon.glb", "models/dragon.glb", "models/wyvern.glb", "models/wyvern.glb"]);
    });

    it("drops a file no longer wanted (heard of as null), carrying on from its parts if it's wanted again", async () => {
        const dragon = file("models/dragon.glb", 600 * KB);
        const { fetcher, requests } = world({
            files: [dragon],
            onRequest: (_, count) => {
                if (count === 2) {
                    fetcher.drop(dragon);
                }
            },
        });

        assert.equal(await fetcher.want(dragon), null);
        assert.deepEqual(await bytesOf(await fetcher.want(dragon)), dragon.data);
        assert.deepEqual(requests.map(({ from }) => from / KB), [0, 256, 512]);
    });

    it("fetches nothing at quiet times: until released, for a while, and until something's so", async () => {
        const dragon = file("models/dragon.glb", 100 * KB);
        const { fetcher, requests, clock } = world({ files: [dragon] });
        let settled = false;

        fetcher.hold("joining");
        fetcher.hold("starting", { for: 10000 });
        fetcher.hold("settling", { for: 5000, until: () => settled });

        const wanted = fetcher.want(dragon);

        await new Promise((resolve) => setImmediate(resolve));
        assert.deepEqual(fetcher.quiet, ["joining", "starting", "settling"]);

        while (clock.now < 20000) {
            await new Promise((resolve) => setImmediate(resolve));
        }

        assert.deepEqual(requests, []);
        assert.deepEqual(fetcher.quiet, ["joining", "settling"]);

        fetcher.release("joining");
        settled = true;
        await wanted;
        assert.deepEqual(fetcher.quiet, []);
        assert.ok(requests[0].at >= 20000);
    });

    it("slows when the round trip grows while it downloads, playing together", async () => {
        const dragon = file("models/dragon.glb", 512 * KB);
        const { fetcher, requests } = world({
            files: [dragon],
            onRequest: (request, count) => {
                // (Round trips heard as it goes: the least, then queueing behind the download)
                fetcher.measure(count < 3 ? 40 : 200);
            },
        });

        fetcher.together = true;
        await fetcher.want(dragon);

        const late = requests.slice(-3);

        assert.equal(fetcher.controller.rate, PACING.least);
        assert.ok(late[2].at - late[1].at >= 1000, `${late[2].at - late[1].at} ms between the last parts`);
    });

    it("asks for a round trip to be measured every 2 s while downloading together", async () => {
        const dragon = file("models/dragon.glb", 512 * KB);
        const { fetcher, clock } = world({ files: [dragon] });
        const probed = [];

        fetcher.together = true;
        fetcher.probe = () => probed.push(clock.now);
        await fetcher.want(dragon);

        assert.ok(probed.length >= 2, `${probed.length} probes over ${clock.now} ms`);
        assert.ok(probed.every((at, k) => k === 0 || at - probed[k - 1] >= PACING.probe));
    });

    it("reads the whole file slowly from a server that doesn't serve parts, keeping to the rate", async () => {
        const dragon = file("models/dragon.glb", 512 * KB);
        const { fetcher, requests, clock } = world({ files: [dragon], ranges: false });

        fetcher.together = true;
        assert.deepEqual(await bytesOf(await fetcher.want(dragon)), dragon.data);
        assert.equal(requests.length, 1);
        assert.ok(clock.now >= 3000, `${clock.now} ms for 512 KB at 128 KB/s`);
    });

    it("neither keeps nor hands over a file that isn't what its hash says", async () => {
        const dragon = { ...file("models/dragon.glb", 100 * KB), hash: "0123456789" };
        const { fetcher, kept } = world({ files: [dragon] });

        await assert.rejects(fetcher.want(dragon), /isn't the file its hash says/);
        assert.equal(kept(dragon.path), undefined);
        assert.equal(fetcher.failed, 1);
    });

    it("gives up on a file that isn't there at once, and on one it can't reach after a few tries", async () => {
        const { fetcher, requests } = world();

        await assert.rejects(fetcher.want({ path: "models/nowhere.glb", hash: "0123456789", bytes: 10 }), /nowhere\.glb \(404\)/);
        assert.equal(requests.length, 1);

        const dragon = file("models/dragon.glb", 100 * KB);
        const offline = world({ files: [dragon] });

        offline.clock.offline = true;
        await assert.rejects(offline.fetcher.want(dragon), /Failed to fetch/);
        assert.equal(offline.requests.length, 3);
        assert.ok(offline.requests[2].at - offline.requests[0].at >= 6000, "waiting longer each time");
    });

    it("fetches only what's wanted now when the player saves data, or the link's 2G", async () => {
        const dragon = file("models/dragon.glb", 100 * KB);

        for (const connection of [{ saveData: true }, { effectiveType: "2g" }, { effectiveType: "slow-2g" }]) {
            const { fetcher, requests } = world({ files: [dragon], connection });

            assert.equal(fetcher.thrifty, true);
            assert.equal(await fetcher.want(dragon, "soon"), null);
            assert.equal(requests.length, 0);
            assert.deepEqual(await bytesOf(await fetcher.want(dragon, "now")), dragon.data);
        }

        assert.equal(world({ connection: { effectiveType: "4g" } }).fetcher.thrifty, false);
    });
});

describe("the downloader in debug mode's overlay (downloadLine)", () => {
    it("says what it's fetching and how far it's got, its rate and the link's, the queueing it sees, what's queued, and why it's quiet", async () => {
        const dragon = file("models/beasts/dragon.glb", 512 * KB);
        const { fetcher } = world({ files: [dragon] });

        assert.equal(downloadLine(fetcher.status), "Downloads idle  1024 KB/s alone  0 queued, 0 done (0 B)");

        fetcher.together = true;
        fetcher.measure(50);
        fetcher.measure(90);
        fetcher.measure(95);
        fetcher.measure(100);
        fetcher.hold("joining");

        try {
            fetcher.want(dragon);
            await new Promise((resolve) => setImmediate(resolve));

            const status = fetcher.status;

            assert.equal(downloadLine(status), "Downloads idle  112 KB/s together  queueing 40 ms over 50  1 queued, 0 done (0 B)  quiet: joining");
            assert.equal(
                downloadLine({ ...status, current: { path: "models/beasts/dragon.glb", received: 128 * KB, bytes: 512 * KB }, throughput: 400 * KB, quiet: [], thrifty: true, done: 2, failed: 1, fetched: 1.5 * 1024 * KB }),
                "Downloads dragon.glb 25%  112 KB/s of 400 KB/s together  queueing 40 ms over 50  1 queued, 2 done, 1 failed (1.5 MB)  saving data",
            );
        } finally {
            fetcher.release("joining");
        }
    });
});
