// The world written out (generated/multiplayer_scaling_plan.md 1-4): core/wire.js encode with
// nothing handed back to it for each value, the same text as it always wrote, numbers JSON can't
// carry among it; a world's snapshot written straight from the world's own (core/host.js
// snapshotText), the same text as its snapshot's, over every kept fixture; what a host sends of
// the world to those who join or ask for it again (core/netplay.js Hosting) taken once for however
// many want it as it stands, each one's text what it always was; taking it held to a share of the
// thread where that's asked (sparing), and never in the sending of a step that turned the war;
// and the world server's save for a turn made a few steps after it (server/keeper.js)
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { STEP_MS } from "../client/js/core/battle.js";
import { newGuid } from "../client/js/core/guid.js";
import { HOST_PLAYER, Host, OWN, SNAPSHOT_VERSION } from "../client/js/core/host.js";
import { Hosting, NET_VERSION, WORLDS } from "../client/js/core/netplay.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { createRandom } from "../client/js/core/random.js";
import { WorldRunner } from "../client/js/core/runner.js";
import { decode, encode, encodePlain } from "../client/js/core/wire.js";
import { Keeper, KEEPER } from "../server/keeper.js";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "snapshots");

// encode as it was: every value handed to a replacer
const old = (value) => JSON.stringify(value, (key, each) => (typeof each === "number" && !Number.isFinite(each) ? { $: String(each) } : each));

const guest = (name, race = "human") => ({ hero: { name, shape: {}, look: {}, weapon: "bow", boots: false, race }, progress: { gold: 50 } });

// Plain data made by chance, numbers JSON can't carry among it
function fuzz(random, depth = 0) {
    const pick = random.next();

    if (depth > 4 || pick < 0.35) {
        const leaves = [0, -0, 1.5, -7, 1e21, Infinity, -Infinity, NaN, "", "a $ b", "Infinity", null, true, false, undefined];

        return leaves[Math.floor(random.next() * leaves.length)];
    }

    if (pick < 0.65) {
        return Array.from({ length: Math.floor(random.next() * 5) }, () => fuzz(random, depth + 1));
    }

    const keys = ["a", "b", "$", "time", "at", "0", "deep"];

    return Object.fromEntries(keys.filter(() => random.next() < 0.5).map((key) => [key, fuzz(random, depth + 1)]));
}

describe("text written with no replacer (core/wire.js encode)", () => {
    it("writes the same text as it did with one, over plain data made by chance, and changes nothing of what it writes", () => {
        const random = createRandom(41);

        for (let k = 0; k < 600; k++) {
            const value = fuzz(random);
            const before = old(value);
            const frozen = structuredClone(value);

            assert.equal(encode(value), before, `value ${k}`);
            assert.deepEqual(value, frozen, `value ${k} left as it was`);

            if (value !== null && typeof value === "object") {
                assert.equal(encodePlain(value), before, `value ${k}, as plain data`);
                assert.deepEqual(decode(encode(value)), decode(before));
            }
        }
    });

    it("writes what's frozen, and what's shared in two places, without changing it", () => {
        const never = Object.freeze({ at: -Infinity, seen: Object.freeze([NaN, 2]) });
        const value = Object.freeze({ one: never, two: never, list: Object.freeze([never, Infinity]) });

        assert.equal(encode(value), old(value));
        assert.equal(encodePlain(value), old(value));
        assert.equal(never.at, -Infinity);
        assert.ok(Number.isNaN(never.seen[0]));
    });

    it("writes what isn't plain data as it always did, and says it isn't plain", () => {
        class Kept {
            constructor() {
                this.at = Infinity;
            }

            toJSON() {
                return { kept: this.at };
            }
        }

        const proto = JSON.parse('{"__proto__": {"at": 1}, "b": 2}');
        const odd = [new Kept(), { when: new Date(0) }, { own: { toJSON: () => Infinity } }, new Map([[1, 2]]), { f() {} }, [Symbol.iterator], Object.create({ inherited: 1 })];

        for (const value of odd) {
            assert.equal(encode(value), old(value));
            assert.equal(encodePlain(value), null);
        }

        // (A key that would set what the copy is, holding a number JSON can't carry: the slow way)
        proto.__proto__ = Infinity;
        Object.defineProperty(proto, "__proto__", { value: Infinity, enumerable: true });
        assert.equal(encode(proto), old(proto));
        assert.equal(encode(Infinity), '{"$":"Infinity"}');
        assert.equal(encode(null), "null");
        assert.equal(encode("x"), '"x"');
        assert.equal(encode(undefined), undefined);
        assert.throws(() => encode({ n: 1n }), TypeError);
    });
});

describe("a world's snapshot written straight from the world (core/host.js snapshotText)", () => {
    it("writes every kept fixture's world, carried on and played, as its snapshot's own text", async () => {
        const versions = (await readdir(FIXTURES)).map((name) => Number(/^(\d+)\.json\.gz$/.exec(name)?.[1])).filter(Number.isInteger).sort((a, b) => a - b);

        assert.ok(versions.includes(SNAPSHOT_VERSION));

        for (const version of versions) {
            const kept = decode(gunzipSync(await readFile(path.join(FIXTURES, `${version}.json.gz`))).toString("utf8"));
            const host = Host.restore(buildWorld({ seed: kept.seed }), kept);

            for (const steps of [0, 3, 40]) {
                for (let k = 0; k < steps; k++) {
                    host.advance(STEP_MS);
                }

                const sum = host.checksum();
                const text = host.snapshotText();

                assert.equal(text, old(host.snapshot()), `version ${version}, ${steps} steps on`);
                assert.equal(host.checksum(), sum, "the world left as it was");
            }
        }
    });

    it("writes a world with players in it, numbers JSON can't carry among it, the same; and shares what it holds only while it's written", () => {
        const host = new Host(buildWorld({ seed: 2 }), { populate: false });

        host.join({ id: HOST_PLAYER, hero: { name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false } });
        host.populate();
        host.join({ id: "g1", ...guest("Bryn", "elf") });
        host.own("g1", { settings: { volume: 3 } });

        for (let k = 0; k < 200; k++) {
            host.advance(STEP_MS);
        }

        const text = host.snapshotText();

        assert.equal(text, old(host.snapshot()));
        assert.ok(text.includes('{"$":"-Infinity"}'), "a never-yet among it");
        assert.equal(encodePlain(host.snapshot({ shared: true })), text, "written the quick way: plain data all through");
        assert.deepEqual(decode(text), decode(old(host.snapshot({ shared: true }))));

        // (And a world carried on from the text plays as the world does)
        const copy = Host.restore(buildWorld({ seed: 2 }), decode(text));

        for (let k = 0; k < 60; k++) {
            host.advance(STEP_MS);
            copy.advance(STEP_MS);
        }

        assert.equal(copy.checksum(), host.checksum());
    });
});

// A host's world opened to others, what's sent noted, and how often the world's been taken
function opened({ clock = null, sparing = false } = {}) {
    const host = new Host(buildWorld({ seed: 2 }), { populate: false });

    host.join({ id: HOST_PLAYER, hero: { name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false } });
    host.populate();

    const sent = [];
    const hosting = new Hosting(host, { send: (peer, text) => sent.push({ peer, text }), clock });
    const take = host.snapshot.bind(host);
    let taken = 0;

    hosting.sparing = sparing;
    host.snapshot = (...given) => {
        taken++;

        return take(...given);
    };

    const hello = (peer, name) => hosting.hear(peer, encode({ kind: "hello", version: NET_VERSION, character: guest(name) }));
    const play = (steps) => {
        for (let k = 0; k < steps; k++) {
            host.advance(STEP_MS);
            hosting.flush();
        }
    };
    const of = (kind, peer = null) => sent.filter((one) => (peer === null || one.peer === peer) && one.text.startsWith(`{"kind":"${kind}"`));

    // The world as it was always written for one who's joined (`id`: their own in it, no one else's)
    const worldFor = (id = null) => {
        const snapshot = take();

        for (const player of snapshot.players) {
            if (player.id !== id) {
                for (const key of OWN.keys) {
                    delete player[key];
                }
            }
        }

        return snapshot;
    };

    return { host, hosting, sent, hello, play, of, worldFor, taken: () => taken };
}

describe("the world as a host sends it (core/netplay.js Hosting)", () => {
    it("welcomes one who joins with the text it always did: their own of their hero in it, no one else's", () => {
        const { host, hosting, hello, play, of, worldFor } = opened();
        const bryn = { ...guest("Bryn"), hero: { ...guest("Bryn").hero, guid: newGuid() } };

        hosting.hear("p1", encode({ kind: "hello", version: NET_VERSION, character: bryn }));
        hosting.hear("p1", encode({ kind: "own", own: { settings: { volume: 2 } } }));
        host.own(HOST_PLAYER, { settings: { volume: 9 } });
        play(8);
        hello("p2", "Cato");

        const welcome = of("welcome", "p2")[0].text;

        assert.equal(welcome, old({ kind: "welcome", version: NET_VERSION, id: "guest-2", seed: 2, race: "human", snapshot: worldFor("guest-2"), paused: null }));
        assert.ok(!welcome.includes('"volume"'), "no one else's own told them");

        // (One taking theirs over on another link: the same, told it took them)
        hosting.pause("host", "Ada");
        hosting.hear("p3", encode({ kind: "hello", version: NET_VERSION, character: bryn }));
        assert.equal(of("welcome", "p3")[0].text, old({ kind: "welcome", version: NET_VERSION, id: "guest-1", seed: 2, race: "human", snapshot: worldFor("guest-1"), took: true, paused: { why: "host", by: "Ada" } }));
        assert.ok(of("welcome", "p3")[0].text.includes('"volume":2'), "their own with them");
    });

    it("takes the world once for everyone who asks for it again in a step, and again only once something's been done", () => {
        const { hosting, hello, play, of, worldFor, taken } = opened();

        hello("p1", "Bryn");
        hello("p2", "Cato");
        hello("p3", "Dara");
        play(4);

        const before = taken();

        for (const peer of ["p1", "p2", "p3"]) {
            hosting.asked.add(peer);
        }

        hosting.flush();
        assert.equal(taken() - before, 1);
        assert.equal(of("state").length, 3);
        assert.ok(of("state").every(({ text }) => text === old({ kind: "state", snapshot: worldFor(), paused: null })));

        // (Asked again with nothing done since: the same world, not taken again; one alone has their own in it)
        hosting.hear("p2", encode({ kind: "again" }));
        assert.equal(taken() - before, 1, "as it stands, taken already");
        assert.equal(of("state", "p2")[1].text, old({ kind: "state", snapshot: worldFor("guest-2"), paused: null }));

        hosting.resync();
        assert.equal(taken() - before, 1);

        // (Something done, by a command or a step, or a player's own kept: taken afresh)
        hosting.hear("p1", encode({ kind: "command", seq: 1, command: { type: "stop" } }));
        hosting.hear("p1", encode({ kind: "again" }));
        assert.equal(taken() - before, 2);
        hosting.hear("p3", encode({ kind: "own", own: { settings: { volume: 5 } } }));
        hosting.hear("p3", encode({ kind: "again" }));
        assert.equal(taken() - before, 3);
        assert.equal(of("state", "p3").at(-1).text, old({ kind: "state", snapshot: worldFor("guest-3"), paused: null }));
        play(1);
        hosting.hear("p2", encode({ kind: "again" }));
        assert.equal(taken() - before, 4);
        assert.equal(of("state", "p2").at(-1).text, old({ kind: "state", snapshot: worldFor("guest-2"), paused: null }));
        assert.equal(hosting.taken, taken(), "and counts how often");
    });

    it("writes the world the slow way, the same, when a name in it is what stands for the world while the rest is written", () => {
        const { hosting, hello, of, worldFor } = opened();

        hello("p1", "\u0000world\u0000");
        hosting.pause("host", "\u0000world\u0000");
        hello("p2", "Cato");
        assert.equal(of("welcome", "p2")[0].text, old({ kind: "welcome", version: NET_VERSION, id: "guest-2", seed: 2, race: "human", snapshot: worldFor("guest-2"), paused: { why: "host", by: "\u0000world\u0000" } }));
    });

    it("holds taking the world to a share of the thread where it's asked to: whoever asks too soon after the last waits, and is answered from the next", () => {
        let now = 1000;
        let cost = 0;
        const { host, hosting, hello, play, of, taken } = opened({ clock: () => now, sparing: true });
        const take = host.snapshot;

        // (Each taking of the world costs `cost` ms of the clock)
        host.snapshot = (...given) => {
            now += cost;

            return take(...given);
        };

        hello("p1", "Bryn");
        hello("p2", "Cato");
        play(2);
        cost = 25;

        const before = taken();

        hosting.hear("p1", encode({ kind: "again" }));
        assert.equal(of("state", "p1").length, 1, "the first at once");

        // (A step on, another asks: 25 ms it took, so none for 25 / share = 2 s)
        assert.equal(Math.min(WORLDS.every, 25 / WORLDS.share), 2000);
        now += 50;
        play(1);
        hosting.hear("p2", encode({ kind: "again" }));
        now += 1900;
        play(1);
        hosting.hear("p2", encode({ kind: "ping", t: 1 }));
        assert.equal(of("state", "p2").length, 0, "too soon");
        assert.equal(taken() - before, 1);

        now += 100;
        hosting.hear("p2", encode({ kind: "ping", t: 2 }));
        assert.equal(of("state", "p2").length, 1, "answered as they're next heard from, their time come");
        assert.equal(taken() - before, 2);

        // (A cheap one, 4 ms: the next may be taken a third of a second on, and never later than `every`)
        cost = 4;
        now += 5000;
        play(1);
        hosting.hear("p1", encode({ kind: "again" }));
        now += 4 / WORLDS.share - 10;
        play(1);
        hosting.hear("p2", encode({ kind: "again" }));
        assert.equal(of("state", "p2").length, 1);
        now += 10;
        play(1);
        assert.equal(of("state", "p2").length, 2);

        cost = 400;
        now += 5000;
        hosting.hear("p1", encode({ kind: "again" }));
        now += WORLDS.every;
        play(1);
        hosting.hear("p2", encode({ kind: "again" }));
        assert.equal(of("state", "p2").length, 3, "2 s at the most");
    });

    it("takes no world in the sending of a step that turned the war, where it's held back; and a host that isn't held back answers at once", () => {
        const now = 0;
        const held = opened({ clock: () => now, sparing: true });
        const free = opened({ clock: () => now });

        for (const world of [held, free]) {
            world.hello("p1", "Bryn");
            world.play(2);
            world.hosting.asked.add("p1");
            world.host.advance(STEP_MS);
            world.hosting.turned();
            world.hosting.flush();
        }

        assert.equal(held.of("state").length, 0);
        assert.equal(free.of("state").length, 1);

        held.play(1);
        assert.equal(held.of("state").length, 1, "the step after");

        // (Not held back: everyone asking one after another in a step is answered, as ever)
        free.hello("p2", "Cato");
        free.play(1);
        free.hosting.hear("p1", encode({ kind: "again" }));
        free.hosting.hear("p2", encode({ kind: "again" }));
        assert.equal(free.of("state").length, 3);
    });
});

describe("a world saved a few steps after its war's turn (server/keeper.js)", () => {
    it("saves it KEEPER.after steps after the turn, once for a turn, from the world's own text; and a save asked for meanwhile is the turn's", async () => {
        const host = new Host(buildWorld({ seed: 2 }), { populate: false });

        host.join({ id: HOST_PLAYER, hero: { name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false } });
        host.populate();

        const saves = [];
        const stored = { meta: { played: 0 }, saveText: async (text, about, { why }) => saves.push({ text, about, why, sum: host.checksum() }), journal: async () => {} };
        const runner = new WorldRunner(host);
        const keeper = new Keeper(runner, stored);
        const turned = [];
        const turn = runner.onTurn;

        runner.onTurn = (war) => {
            turned.push(host.battle.time);
            turn(war);
        };

        while (!turned.length) {
            runner.advance(STEP_MS);
        }

        assert.equal(saves.length, 0, "not on the turn's own step");
        runner.advance(STEP_MS * (KEEPER.after - 1));
        assert.equal(saves.length, 0);

        runner.advance(STEP_MS);
        assert.equal(saves.length, 1);
        assert.equal(saves[0].why, "turn");
        assert.equal(saves[0].about.worldTime, turned[0] + KEEPER.after * STEP_MS);
        assert.deepEqual(saves[0].about.versions, { snapshot: SNAPSHOT_VERSION, war: decode(saves[0].text).war.version });
        assert.equal(Host.restore(buildWorld({ seed: 2 }), decode(saves[0].text)).checksum(), saves[0].sum, "the world as it stood then");
        runner.advance(STEP_MS * 20);
        assert.equal(saves.length, 1, "once");

        // (The next turn; the world emptied before its save was due: that save is the turn's)
        while (turned.length < 2) {
            runner.advance(STEP_MS);
        }

        await keeper.save("empty");
        runner.advance(STEP_MS * 20);
        assert.deepEqual(saves.map(({ why }) => why), ["turn", "empty"]);
        assert.equal(keeper.saved, 2);
    });
});
