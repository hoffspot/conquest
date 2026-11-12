// Coming into a world in turn (core/netplay.js Hosting `welcomes`; generated/
// multiplayer_scaling_plan.md 1-5): where a host lets only so many come in at once (a world
// server's world, by its `welcomes` setting), those who say hello wait, are told their place
// (`queued`), and are let in as the world's next looked at, as many as there's room for, all sent
// the world from one taking of it; a place frees when one's ready, when they leave, or when they've
// taken too long (WELCOMES.timeout); a host that sets no such number (a player's own world)
// welcomes each at once, as ever; and one waiting hears its place (Joining onQueued)
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { HOST_PLAYER, Host } from "../client/js/core/host.js";
import { Hosting, Joining, NET_VERSION, queuedWords, WELCOMES, WORLDS } from "../client/js/core/netplay.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { decode, encode } from "../client/js/core/wire.js";
import { readJSON, writeJSON } from "../server/storage/files.js";
import { DataFolder } from "../server/storage/folder.js";
import { WORLD_SETTINGS } from "../server/storage/worlds.js";

const guest = (name) => ({ hero: { name, shape: {}, look: {}, weapon: "bow", boots: false, race: "human" }, progress: { gold: 50 } });

// A world with no player of its host's (as a world server's), opened to others
function opened({ welcomes = 2, clock = null, sparing = false, most = 100, hostPlayer = false } = {}) {
    const host = new Host(buildWorld({ seed: 2 }), { populate: false });

    if (hostPlayer) {
        host.join({ id: HOST_PLAYER, hero: { name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false } });
    }

    host.populate();

    const sent = [];
    const hosting = new Hosting(host, { send: (peer, text) => sent.push({ peer, text, kind: decode(text).kind }), clock });
    const take = host.snapshot.bind(host);
    let taken = 0;

    hosting.welcomes = welcomes;
    hosting.sparing = sparing;
    hosting.most = most;
    host.snapshot = (...given) => {
        taken++;

        return take(...given);
    };

    const hello = (peer) => hosting.hear(peer, encode({ kind: "hello", version: NET_VERSION, character: guest(`Guest ${peer}`) }));
    const ready = (peer) => hosting.hear(peer, encode({ kind: "ready" }));
    const step = () => {
        host.advance(STEP_MS);
        hosting.flush();
    };
    const of = (kind, peer = null) => sent.filter((one) => one.kind === kind && (peer === null || one.peer === peer));
    const places = (peer) => of("queued", peer).map(({ text }) => decode(text).place);

    return { host, hosting, sent, hello, ready, step, of, places, taken: () => taken };
}

const peers = (count) => Array.from({ length: count }, (_, k) => `p${k + 1}`);

describe("coming into a world in turn (Hosting welcomes)", () => {
    it("takes the world once for ten hellos in a step and welcomes two of them; the rest are told their places", () => {
        const { host, hosting, hello, step, of, places, taken } = opened();

        for (const peer of peers(10)) {
            hello(peer);
        }

        assert.equal(of("welcome").length, 0, "none till the world's next looked at");
        assert.equal(host.players.size, 0);
        step();

        assert.equal(taken(), 1, "one taking of the world");
        assert.deepEqual(of("welcome").map(({ peer }) => peer), ["p1", "p2"]);
        assert.equal(host.players.size, 2, "only those let in are in the world");
        assert.deepEqual([...hosting.waiting.keys()], peers(10).slice(2));
        assert.deepEqual(peers(10).map((peer) => places(peer)), [[], [], [1], [2], [3], [4], [5], [6], [7], [8]]);

        // (Each welcomed with the world as it is with both in it, and their own id)
        for (const [k, { text }] of of("welcome").entries()) {
            const welcome = decode(text);

            assert.equal(welcome.id, `guest-${k + 1}`);
            assert.deepEqual(welcome.snapshot.players.map(({ id }) => id), ["guest-1", "guest-2"]);
        }

        // (Nothing more while they load, however many steps go by)
        for (let k = 0; k < 20; k++) {
            step();
        }

        assert.equal(of("welcome").length, 2);
        assert.equal(of("queued").length, 8, "told their place once, while it's the same");
        assert.equal(taken(), 1);
    });

    it("sends one coming in nothing before their welcome, and everything after: their copy keeps to the host's", () => {
        const { host, hosting, hello, ready, step, sent } = opened({ hostPlayer: true });
        const joined = new Map();
        let delivered = 0;

        // (Each joining game hears what it's sent, in order, as it's sent)
        const deliver = () => {
            for (; delivered < sent.length; delivered++) {
                joined.get(sent[delivered].peer)?.hear(sent[delivered].text);
            }
        };

        for (const peer of peers(5)) {
            const joining = new Joining({ send: (text) => hosting.hear(peer, text) });

            joining.onWelcome = ({ seed, race, snapshot }) => joining.attach(Host.restore(buildWorld({ seed, race }), snapshot));
            joined.set(peer, joining);
            hello(peer);
        }

        for (let k = 0; k < 120; k++) {
            step();
            deliver();

            for (const [peer, joining] of joined) {
                while (joining.step()) {
                    // (Its copy played up to the host's)
                }

                if (joining.me && k % 10 === 9) {
                    ready(peer);
                }
            }

            deliver();
        }

        const firsts = peers(5).map((peer) => sent.find((one) => one.peer === peer && one.kind !== "queued")?.kind);

        assert.deepEqual(firsts, ["welcome", "welcome", "welcome", "welcome", "welcome"], "nothing but their place before their welcome");
        assert.equal(host.players.size, 6);

        for (const [peer, joining] of joined) {
            assert.deepEqual([joining.astray, joining.resyncs], [false, 0], `${peer} never went astray`);
            assert.equal(joining.host.checksum(), host.checksum(), `${peer}'s copy is the host's`);
            assert.equal(joining.queued, null);
        }
    });

    it("frees a place when one's ready, when one leaves, and when one's taken longer than WELCOMES.timeout", () => {
        let now = 0;
        const { hosting, hello, ready, step, of, places } = opened({ clock: () => now });
        const welcomed = () => of("welcome").map(({ peer }) => peer);

        for (const peer of peers(7)) {
            hello(peer);
        }

        step();
        assert.deepEqual(welcomed(), ["p1", "p2"]);

        // Ready: the next comes in, and those behind move up
        ready("p1");
        step();
        assert.deepEqual(welcomed(), ["p1", "p2", "p3"]);
        assert.deepEqual(places("p4"), [2, 1]);
        assert.deepEqual(places("p7"), [5, 4]);

        // Gone while loading (their link, or leaving): counted from who's here, so the place is free
        hosting.gone("p2");
        step();
        assert.deepEqual(welcomed(), ["p1", "p2", "p3", "p4"]);

        // One waiting gone: out of the line, those behind told
        hosting.gone("p6");
        step();
        assert.deepEqual([...hosting.waiting.keys()], ["p5", "p7"]);
        assert.deepEqual(places("p7"), [5, 4, 3, 2]);

        // Too long loading: no longer counted, though still in the world
        now += WELCOMES.timeout - 1;
        step();
        assert.deepEqual(welcomed(), ["p1", "p2", "p3", "p4"]);
        now += 1;
        step();
        assert.deepEqual(welcomed(), ["p1", "p2", "p3", "p4", "p5", "p7"]);
        assert.equal(hosting.players.has("p3") && hosting.players.has("p4"), true);
        assert.equal(hosting.waiting.size, 0);
        assert.equal(WELCOMES.timeout, 60000);
    });

    it("lets those waiting in with no step played, when whoever runs the world looks at it (admit), and never past the most it takes", () => {
        const { host, hosting, hello, ready, of } = opened({ welcomes: 3, most: 4 });

        for (const peer of peers(6)) {
            hello(peer);
        }

        hosting.admit();
        assert.equal(of("welcome").length, 3);

        for (const peer of peers(3)) {
            ready(peer);
        }

        hosting.admit();
        assert.deepEqual(of("welcome").map(({ peer }) => peer), ["p1", "p2", "p3", "p4"]);
        assert.deepEqual(of("refused").map(({ peer, text }) => [peer, decode(text).reason]), [["p5", "full"], ["p6", "full"]], "the world full: told so in their turn");
        assert.equal(host.players.size, 4);
        assert.equal(hosting.waiting.size, 0);
    });

    it("refuses another version at once, and hears a hello only once from one waiting", () => {
        const { hosting, hello, step, of } = opened({ welcomes: 1 });

        hello("p1");
        hello("p2");
        hello("p2");
        hosting.hear("p3", encode({ kind: "hello", version: NET_VERSION - 1, character: guest("Old") }));
        assert.deepEqual(of("refused").map(({ peer, text }) => [peer, decode(text).reason, decode(text).net]), [["p3", "version", NET_VERSION]]);
        step();
        assert.deepEqual([...hosting.waiting.keys()], ["p2"]);
        assert.equal(of("queued", "p2").length, 1);
    });

    it("waits for the world to be taken where that's held to a share of the thread, and never lets anyone in on a step that turned the war", () => {
        let now = 0;
        let cost = 25;
        const { host, hosting, hello, ready, step, of, taken } = opened({ clock: () => now, sparing: true, welcomes: 1 });
        const take = host.snapshot;

        host.snapshot = (...given) => {
            now += cost;

            return take(...given);
        };

        hello("p1");
        hello("p2");
        hello("p3");
        step();
        assert.deepEqual(of("welcome").map(({ peer }) => peer), ["p1"]);
        ready("p1");

        // (A place free, but 25 ms it took: none taken for 2 s)
        now += 25 / WORLDS.share - 10;
        step();
        assert.equal(of("welcome").length, 1);
        now += 10;
        step();
        assert.deepEqual(of("welcome").map(({ peer }) => peer), ["p1", "p2"]);
        assert.equal(taken(), 2);

        // (Its time come, on a step that turned the war: the step after)
        ready("p2");
        cost = 0;
        now += WORLDS.every;
        host.advance(STEP_MS);
        hosting.turned();
        hosting.flush();
        assert.equal(of("welcome").length, 2);
        step();
        assert.deepEqual(of("welcome").map(({ peer }) => peer), ["p1", "p2", "p3"]);
    });

    it("welcomes each at once where no number's set: a player's own world, as ever", () => {
        const { host, hosting, hello, of, taken } = opened({ welcomes: 0, hostPlayer: true });

        assert.equal(new Hosting(new Host(buildWorld({ seed: 2 }), { populate: false }), { send: () => {} }).welcomes, 0, "none set unless whoever runs it does");

        for (const peer of peers(5)) {
            hello(peer);
            assert.equal(of("welcome", peer).length, 1, `${peer} welcomed as its hello's heard`);
        }

        assert.equal(of("queued").length, 0);
        assert.equal(taken(), 5);
        assert.equal(host.players.size, 6);
        assert.equal(hosting.loading.size, 0);
    });

    it("is a world's setting on a world server, two unless its owner says otherwise; a world kept before there was one has two", async () => {
        assert.deepEqual({ ...WORLD_SETTINGS.welcomes, about: null }, { kind: "integer", min: 0, max: 8, default: 2, about: null });

        const root = await mkdtemp(path.join(os.tmpdir(), "pellagos-welcomes-"));

        try {
            const folder = await DataFolder.open(root);
            const made = await folder.worlds.create({ name: "Old Haven", seed: 3, race: "human", settings: { mostPlayers: 4 } });
            const file = path.join(made.folder, "world.json");
            const { welcomes, ...settings } = made.meta.settings;

            assert.equal(welcomes, 2);
            await writeJSON(file, { ...(await readJSON(file)), settings });

            const again = await folder.worlds.open(made.id);

            assert.deepEqual(again.meta.settings, { ...settings, welcomes: 2 });
            assert.deepEqual(Object.keys(again.meta.settings).sort(), Object.keys(WORLD_SETTINGS).sort());
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
});

describe("one waiting to come in (Joining)", () => {
    it("hears its place as it changes, till it's welcomed; and is told in words", () => {
        const joining = new Joining({ send: () => {} });
        const heard = [];

        joining.onQueued = (place) => heard.push(place);
        joining.hear(encode({ kind: "queued", place: 3 }));
        joining.hear(encode({ kind: "queued", place: 1 }));
        joining.hear(encode({ kind: "queued", place: "x" }));
        joining.hear(encode({ kind: "queued", place: 0 }));
        assert.deepEqual(heard, [3, 1]);
        assert.equal(joining.queued, 1);
        assert.equal(queuedWords(3), "Others are coming into that world: 2 before you.");
        assert.equal(queuedWords(1), "Others are coming into that world: you're next.");
    });
});
