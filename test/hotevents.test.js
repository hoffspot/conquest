// The events a fight is mostly made of, as bytes (core/hotevents.js; the scaling plan's 3-28):
// what's read back is what was told, whatever it held; and a fight of 400 tells one player's
// game its events in under 6 KB a second.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Battle, STEP_MS } from "../client/js/core/battle.js";
import { EventPacker, EventUnpacker, HOT, HOT_KINDS, WORDS } from "../client/js/core/hotevents.js";
import { decodeFrame, VIEW_VERSION } from "../client/js/core/view.js";
import { ViewFeed } from "../client/js/core/viewfeed.js";
import { parseGrid } from "./helpers.js";

const KNOWN = ["a", "b", "c", "d"];
const indexOf = (id) => (KNOWN.includes(id) ? KNOWN.indexOf(id) : undefined);
const idOf = (index) => KNOWN[index];

// A frame's worth told and read back: [events as read, the bytes, how many went as JSON]
function there(events, { packer = new EventPacker(), reader = new EventUnpacker(), time = 5000 } = {}) {
    packer.begin(time, indexOf);

    const sizes = events.map((event) => packer.add(event));
    const { events: cold, hot } = packer.sections;
    const read = hot ? reader.unpack(hot, JSON.parse(cold ?? "[]"), time, idOf) : { events: JSON.parse(cold ?? "[]"), unknown: 0 };

    return { read: read?.events ?? null, unknown: read?.unknown, hot, cold: JSON.parse(cold ?? "[]").length, sizes };
}

describe("the events a fight's mostly made of, as bytes (core/hotevents.js)", () => {
    it("names eight kinds, each field once and no kind with more fields than its bits", () => {
        assert.deepEqual(HOT_KINDS, ["attack", "hit", "miss", "death", "cast", "projectile", "healed", "afflicted"]);
        assert.deepEqual(Object.keys(HOT), HOT_KINDS);

        for (const fields of Object.values(HOT)) {
            assert.deepEqual(fields[0], ["time", "time"]);
            assert.equal(new Set(fields.map(([name]) => name)).size, fields.length);
            assert.ok(fields.length <= 16 && fields.every(([, type]) => ["time", "who", "word", "num", "any"].includes(type)));
        }

        assert.equal(VIEW_VERSION, 7, "5 with these; 6 the legends each player's own (core/summary.js loreOf); 7 a player's duel (the summary's `duels`)");
    });

    it("reads back every kind as it was told, as the battle tells them, in a tenth of the bytes", () => {
        const told = [
            { type: "attack", time: 5000, id: "a", target: "b", weapon: "sword", attack: "slash", animation: "slash-right", duration: 700, hitAt: 300 },
            { type: "attack", time: 5000, id: "b", target: null, weapon: "cleaver", attack: "chop", animation: "chop", duration: 900, hitAt: 450 },
            { type: "hit", time: 5000, id: "b", by: "a", weapon: "sword", attack: "slash", reaction: "flinch", damage: 7, hp: 13, maxHp: 20, projectile: null, spell: null },
            { type: "hit", time: 4950, id: "a", by: null, weapon: null, attack: "burn", reaction: "burn", damage: 2.5, hp: 17.5, maxHp: 20, projectile: 12, spell: "fireball", mount: { hp: 31.25, maxHp: 60 } },
            { type: "miss", time: 5000, id: "c", target: "a", attack: "bite" },
            { type: "miss", time: 5000, id: "c", target: null, attack: "bite" },
            { type: "death", time: 5000, id: "b", by: "a", respawnAt: 912345678901 },
            { type: "death", time: 5000, id: "d", by: null, respawnAt: null, downed: true },
            { type: "cast", time: 5000, id: "a", spell: "heal", target: "a", castTime: 1200 },
            { type: "projectile", time: 5000, projectile: 41, kind: "arrow", id: "c", target: "a", x: 104.3125, y: 88.77, speed: 22 },
            { type: "healed", time: 5000, id: "a", by: "a", spell: "heal", amount: 6, hp: 19, maxHp: 20, cured: [] },
            { type: "healed", time: 5000, id: "c", by: "c", spell: null, attack: "leech", amount: 0.1, hp: 9.1, maxHp: 30, cured: [], from: "a" },
            { type: "healed", time: 5000, id: "d", by: null, spell: null, amount: 1, hp: 2, maxHp: 20 },
            { type: "healed", time: 5000, id: "d", by: "d", spell: null, amount: 3, hp: 5, maxHp: 20, cured: ["poison"], regrown: true },
            { type: "afflicted", time: 5000, id: "a", kind: "poison", change: "on", until: 9000, by: "c", look: null },
            { type: "afflicted", time: 5000, id: "a", kind: "poison", change: "over", look: { tint: "green" } },
        ];
        const { read, hot, cold, unknown } = there(told);

        assert.deepEqual(read, told);
        assert.equal(cold, 0, "each of them as bytes");
        assert.equal(unknown, 0);
        assert.ok(hot.length * 4 < JSON.stringify(told).length, `${hot.length} bytes for ${JSON.stringify(told).length} of JSON`);

        // (And again: the texts are known now, so each is a byte)
        const packer = new EventPacker();
        const reader = new EventUnpacker();
        const first = there(told, { packer, reader });
        const again = there(told, { packer, reader, time: 5050 });

        assert.deepEqual(again.read, told);
        assert.ok(again.hot.length < first.hot.length && again.hot.length * 6 < JSON.stringify(told).length, `${again.hot.length} bytes the second time, ${first.hot.length} the first`);
        assert.ok(again.sizes[0] <= 16, `${again.sizes[0]} bytes for a blow struck`);
    });

    it("loses nothing: numbers of every sort, nulls, a time before the frame's or after it", () => {
        for (const value of [0, 1, -1, 127, 128, 16383, 16384, -70000, 2 ** 31, -(2 ** 40), 281474976710655, 0.5, -0.25, 1 / 3, 1e-9, 1.5e300, 2 ** 60, null]) {
            const told = [{ type: "hit", time: 5000 - (value === null ? 0 : 50), id: "a", by: "b", damage: value, hp: value, maxHp: 20 }, { type: "cast", time: 5050, id: "a", spell: "x", target: "b", castTime: value }];

            assert.deepEqual(there(told).read, told, String(value));
        }

        // (-0 is nought, as JSON has it; what isn't a number at all goes as JSON does it)
        assert.deepEqual(there([{ type: "hit", time: 5000, id: "a", damage: -0 }]).read, [{ type: "hit", time: 5000, id: "a", damage: 0 }]);

        for (const event of [{ type: "hit", time: 5000, id: "a", damage: "7" }, { type: "hit", time: 5000, id: "a", damage: Infinity }, { type: "hit", time: "now", id: "a" }]) {
            const { read, cold } = there([event]);

            assert.equal(cold, 1);
            assert.deepEqual(read, JSON.parse(JSON.stringify([event])));
        }
    });

    it("leaves as JSON what it can't hold: another kind, a field its table hasn't, an id that isn't a text; someone the player's not been told of goes by their id, kept; a field that's undefined is left out as JSON leaves it", () => {
        const odd = [
            { type: "loot", time: 5000, id: "a", gold: 5 },
            { type: "attack", time: 5000, id: "a", target: "b", weapon: "sword", attack: "slash", flourish: true },
            { type: "miss", time: 5000, id: 7, target: "a", attack: "slash" },
            { type: "cast", time: 5000, id: "a", spell: 3, target: "a", castTime: 100 },
        ];
        const { read, cold, hot } = there(odd);

        assert.equal(cold, odd.length);
        assert.equal(hot, undefined);
        assert.deepEqual(read, odd);
        // (A stranger, and the same one again: by their id, a byte the second time)
        const strange = [{ type: "miss", time: 5000, id: "a", target: "site:12:guard:3", attack: "slash" }, { type: "miss", time: 5000, id: "site:12:guard:3", target: "a", attack: "slash" }];
        const met = there(strange);

        assert.deepEqual(met.read, strange);
        assert.equal(met.cold, 0);
        assert.ok(met.sizes[1] < met.sizes[0] - 10, `${met.sizes}`);
        assert.deepEqual(there([{ type: "miss", time: 5000, id: "a", target: undefined, attack: "slash" }]), { ...there([{ type: "miss", time: 5000, id: "a", attack: "slash" }]) });
        assert.deepEqual(there([{ type: "miss", time: 5000, id: "a", target: undefined, attack: "slash" }]).read, [{ type: "miss", time: 5000, id: "a", attack: "slash" }]);
    });

    it("keeps the order told, those in bytes among those in JSON, wherever each falls", () => {
        const hot = (k) => ({ type: "miss", time: 5000, id: KNOWN[k % 4], target: KNOWN[(k + 1) % 4], attack: `swing-${k % 3}` });
        const plain = (k) => ({ type: "said", time: 5000, k });

        for (const shape of ["hhh", "ppp", "hph", "phhp", "pphpphhhp", "hpppp", "ppppph", ""]) {
            const told = [...shape].map((one, k) => (one === "h" ? hot(k) : plain(k)));

            assert.deepEqual(there(told).read, told, shape);
        }
    });

    it("takes back what turned out not to fit, the texts it kept for it forgotten: the next frame reads right", () => {
        const packer = new EventPacker();
        const reader = new EventUnpacker();
        const one = { type: "miss", time: 5000, id: "a", target: "b", attack: "lunge" };
        const two = { type: "miss", time: 5000, id: "b", target: "a", attack: "riposte" };
        const three = { type: "said", time: 5000, words: "no room" };

        packer.begin(5000, indexOf);
        packer.add(one);

        const mark = packer.mark();

        packer.add(two);
        packer.add(three);
        assert.equal(packer.words.size, 2);
        packer.back(mark);
        assert.deepEqual([packer.words.size, packer.packed, packer.plain], [1, 1, 0]);

        const { events, hot } = packer.sections;

        assert.equal(events, undefined);
        assert.deepEqual(reader.unpack(hot, [], 5000, idOf).events, [one]);
        // (Its text told anew the next time: the game never heard it)
        assert.deepEqual(there([two, one], { packer, reader, time: 5050 }).read, [two, one]);
        assert.deepEqual(reader.words, ["lunge", "riposte"]);
    });

    it("keeps no more texts than it may, nor long ones: those are told whole each time", () => {
        const packer = new EventPacker();
        const reader = new EventUnpacker();
        const long = "x".repeat(WORDS.long + 1);
        const many = Array.from({ length: WORDS.most + 50 }, (_, k) => ({ type: "miss", time: 5000, id: "a", target: "b", attack: `a${k}` }));

        for (let k = 0; k < many.length; k += 100) {
            assert.deepEqual(there(many.slice(k, k + 100), { packer, reader }).read, many.slice(k, k + 100));
        }

        assert.equal(packer.words.size, WORDS.most);
        assert.equal(reader.words.length, WORDS.most);

        const told = [{ type: "miss", time: 5000, id: "a", target: "b", attack: long }, { type: "afflicted", time: 5000, id: "a", kind: "curse", change: "on", look: { a: "long look, told whole" } }];

        assert.deepEqual(there(told, { packer, reader }).read, told);
        assert.deepEqual(there(told, { packer, reader }).read, told);
        assert.equal(packer.words.size, WORDS.most);
    });

    it("reads nothing from bytes that aren't right, and never throws; and leaves out an event of someone not known, saying how many", () => {
        const told = [{ type: "attack", time: 5000, id: "a", target: "b", weapon: "sword", attack: "slash", animation: "slash", duration: 700, hitAt: 300 }, { type: "miss", time: 5000, id: "c", target: "d", attack: "bite" }];
        const { hot } = there(told);

        for (let cut = 1; cut < hot.length; cut++) {
            const read = new EventUnpacker().unpack(hot.subarray(0, cut), [], 5000, idOf);

            assert.ok(read === null || read.events.length <= 1, `cut at ${cut}`);
        }

        for (let k = 0; k < 300; k++) {
            const junk = Uint8Array.from({ length: 1 + (k % 40) }, (_, n) => (k * 37 + n * 101 + ((k * n) % 13) * 17) % 256);

            assert.doesNotThrow(() => new EventUnpacker().unpack(junk, [], 5000, idOf));
        }

        assert.equal(new EventUnpacker().unpack(Uint8Array.from([9, 0, 0]), [], 5000, idOf), null, "no such kind");
        assert.equal(new EventUnpacker().unpack(Uint8Array.from([2, 3, 0]), [], 5000, idOf), null, "more before it than there are");
        // (Read by a game that doesn't know the second one's two: left out, and said)
        assert.deepEqual(new EventUnpacker().unpack(hot, [], 5000, (index) => (index < 2 ? KNOWN[index] : undefined)), { events: [told[0]], unknown: 1 });
    });

    it("tells one player's game the events of a fight of 400 in under 6 KB a second, each as the battle told it", () => {
        const battle = new Battle({ blocked: parseGrid(Array.from({ length: 44 }, () => ".".repeat(64))).map((row) => Uint8Array.from(row)) }, { seed: 7 });
        const hero = battle.add({ id: "ann", kind: "player", weapon: "sword", team: "hero", square: [32, 22] });

        // (Two hundred a side, in ranks facing each other, the player's hero between them)
        for (let k = 0; k < 400; k++) {
            const [side, rank, file] = [k % 2, Math.floor(k / 2) % 10, Math.floor(k / 20)];
            const square = [side ? 34 + rank : 30 - rank, 2 + file * 2];

            battle.add({ id: `f${k}`, kind: "orc", weapon: "cleaver", team: side ? "orcs" : "hero", square, ai: "patrol", patrol: [square, [side ? 20 : 44, square[1]]] });
        }

        const hosting = { host: { battle, players: new Map([["ann", {}]]), parties: new Map(), partyIds: new Map() }, session: { players: new Map([["a", "ann"]]), toldSelf: new Map() } };
        const feed = new ViewFeed(hosting);
        const reader = new EventUnpacker();
        const emitted = new Set();
        const canon = (event) => JSON.stringify(Object.fromEntries(Object.entries(event).sort(([a], [b]) => (a < b ? -1 : 1))));
        let [bytes, json, heard, seconds] = [0, 0, 0, 0];
        const kinds = new Map();

        feed.mode = "dark";
        feed.onFrame = (id, frameBytes) => {
            const frame = decodeFrame(frameBytes);
            const cold = JSON.parse(frame.sections.events ?? "[]");
            const viewer = feed.viewers.get(id);
            const read = frame.sections.hot ? reader.unpack(frame.sections.hot, cold, frame.step * STEP_MS, (index) => viewer.byIndex[index]?.actor.id) : { events: cold, unknown: 0 };

            assert.ok(read && read.unknown === 0, `step ${frame.step}: its events read`);
            bytes += (frame.sections.events?.length ?? 0) + (frame.sections.hot?.length ?? 0);

            for (const event of read.events) {
                assert.ok(emitted.has(canon(event)), `as the battle told it: ${JSON.stringify(event)}`);
                json += JSON.stringify(event).length + 1;
                heard++;
                kinds.set(event.type, (kinds.get(event.type) ?? 0) + 1);
            }
        };

        for (let step = 1; step <= 600; step++) {
            const events = battle.advance(STEP_MS);

            for (const event of events) {
                emitted.add(canon(JSON.parse(JSON.stringify(event))));
            }

            // (Kept in it, to hear it all: a hero in the middle of it wouldn't last)
            Object.assign(hero, { hp: hero.maxHp, dead: false });
            feed.heard(events);
            feed.flush(step);
            seconds = step / 20;
        }

        const fighting = battle.actors.filter((actor) => !actor.dead).length;
        const packed = feed.viewers.get("ann").packer;

        assert.ok(heard > 2000, `${heard} events heard in ${seconds} s (${[...kinds].map(([kind, n]) => `${kind} ${n}`).join(", ")})`);
        assert.ok(fighting < 380, `a fight: ${fighting} of 401 standing`);
        assert.ok(bytes / seconds <= 6000, `${Math.round(bytes / seconds)} bytes a second of events (${Math.round(json / seconds)} as JSON)`);
        assert.ok(bytes * 4 < json, `${bytes} bytes for ${json} of JSON`);
        assert.ok(packed.packed > packed.plain * 10, `${packed.packed} as bytes, ${packed.plain} as JSON`);
    });
});
