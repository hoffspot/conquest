// Who hears of what (core/eventscope.js; the scaling plan's 3-15): every kind of event the battle
// and the host tell of has an audience and a class; who hears each; and a player's frames carry
// theirs (core/viewfeed.js), with the last command done and their hero's own state
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { AUDIENCES, CLASSES, hears, NEAR, scopeOf, SCOPES, sift } from "../client/js/core/eventscope.js";
import { Host } from "../client/js/core/host.js";
import { Hosting, NET_VERSION } from "../client/js/core/netplay.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { COUNTERS } from "../client/js/core/probe.js";
import { decodeFrame, encodeFrame, originFor, SECTION, VIEW, ViewState } from "../client/js/core/view.js";
import { EVENTS, ViewFeed } from "../client/js/core/viewfeed.js";
import { encode } from "../client/js/core/wire.js";
import { startFor } from "../client/js/core/worldplan/plan.js";

const source = (file) => readFile(new URL(`../client/js/core/${file}`, import.meta.url), "utf8");

// A player as the table asks of them: their id, where their hero stands, whom their game knows of
const viewerOf = (id, { map = "town", x = 0, y = 0, knows = [] } = {}) => ({ id, hero: { map, x, y }, knows: (other) => knows.includes(other) });

// A world as it asks: who's a player, and who's in whose party
const worldOf = (players, parties = []) => ({ players: new Set(players), partyOf: (id) => parties.find((party) => party.includes(id)) });

let made = 0;

// Someone standing somewhere, with what the feed and its frames read
const someone = (x, y, more = {}) => ({ id: `e${made++}`, map: "town", x, y, facing: 0, progress: null, dead: false, running: false, pace: 1.4, attack: null, target: null, order: null, hp: 20, maxHp: 20, ...more });

describe("who hears of what (core/eventscope.js)", () => {
    it("has a scope for every kind of event the battle and the host tell of, and for nothing else", async () => {
        const told = new Set();
        const loose = [];

        for (const [file, call] of [["battle.js", "#emit"], ["host.js", "#event"]]) {
            const text = await source(file);

            // (Every telling names its kind outright: one that didn't couldn't be held to the table)
            for (const [, first] of text.matchAll(new RegExp(`this\\.${call}\\(\\s*([^,)]*)`, "g"))) {
                const named = /^"([A-Za-z][A-Za-z0-9]*)"$/.exec(first.trim());

                if (named) {
                    told.add(named[1]);
                } else {
                    loose.push(`${file}: ${call}(${first.trim()}`);
                }
            }
        }

        assert.deepEqual(loose, [], "a kind told by a name the table can't be checked against");
        assert.ok(told.size >= 180, `${told.size} kinds told`);
        assert.deepEqual([...told].filter((kind) => !Object.hasOwn(SCOPES, kind)).sort(), [], "kinds told of with no scope: give each an audience and a class in core/eventscope.js SCOPES");
        assert.deepEqual(Object.keys(SCOPES).filter((kind) => !told.has(kind)).sort(), [], "scopes for kinds nothing tells of: take them out");

        for (const [kind, scope] of Object.entries(SCOPES)) {
            const [audience, sort, ...more] = scope.split(" ");

            assert.ok(AUDIENCES.includes(audience) && CLASSES.includes(sort) && !more.length, `${kind}: ${scope}`);
            assert.deepEqual(scopeOf(kind), { audience, class: sort });
        }

        assert.deepEqual(AUDIENCES, ["near", "one", "party", "place", "world"]);
        assert.deepEqual(CLASSES, ["must", "may"]);
        assert.deepEqual(scopeOf("no such kind"), { audience: "world", class: "must" }, "a kind with no scope is everyone's, and must be told");
        assert.ok(Object.keys(SCOPES).every((kind, k, kinds) => k === 0 || kinds[k - 1] < kind), "in order, so one's found");
    });

    it("tells of what's near to whoever knows of anyone it's about or stands near where it is; of a place from further; of what names no one and nowhere to everyone", () => {
        const world = worldOf(["ann", "bea"]);
        const ann = viewerOf("ann", { knows: ["wolf", "ann"] });
        const far = viewerOf("bea", { x: 5000, knows: ["bea"] });

        assert.equal(scopeOf("hit").audience, "near");

        // (By whom it's about: the one hit, whoever hit them, anyone among several)
        assert.equal(hears({ type: "hit", id: "wolf", by: "bear" }, ann, world), true);
        assert.equal(hears({ type: "hit", id: "bear", by: "wolf" }, ann, world), true);
        assert.equal(hears({ type: "hit", id: "bear", by: "stag" }, ann, world), false);
        assert.equal(hears({ type: "hit", id: "bear", by: "ann" }, ann, world), true, "their own hero's always known");
        assert.equal(hears({ type: "hit", id: "wolf" }, far, world), false);
        assert.equal(hears({ type: "roused", ids: ["stag", "wolf"] }, ann, world), true);

        // (By where it is: within 192 m of their hero, on its map)
        assert.equal(hears({ type: "blast", x: 100, y: 100, map: "town" }, ann, world), true);
        assert.equal(hears({ type: "blast", x: NEAR.near, y: 0, map: "town" }, ann, world), true);
        assert.equal(hears({ type: "blast", x: NEAR.near + 1, y: 0, map: "town" }, ann, world), false);
        assert.equal(hears({ type: "blast", x: 10, y: 10, map: "inside:4" }, ann, world), false, "on another map");
        assert.equal(hears({ type: "blast", x: 10, y: 10 }, ann, world), true, "no map said: taken as theirs");

        // (About a place: from 512 m)
        assert.equal(scopeOf("camp").audience, "place");
        assert.equal(hears({ type: "camp", at: [400, 0], ids: ["s1", "s2"] }, ann, world), true);
        assert.equal(hears({ type: "camp", at: [NEAR.place + 1, 0], ids: ["s1", "s2"] }, ann, world), false);
        assert.equal(hears({ type: "blast", x: 400, y: 0 }, ann, world), false, "what's only near isn't heard from so far");

        // (Naming no one and nowhere: it can't be said who's near it, so everyone)
        assert.equal(hears({ type: "obstacles", boxes: [] }, ann, world), true);
        assert.equal(hears({ type: "obstacles", boxes: [] }, far, world), true);
        assert.equal(hears({ type: "turn", turn: 4 }, far, world), true);
        assert.equal(scopeOf("turn").audience, "world");
    });

    it("tells a player's own doings to them alone, a party's to its members; and what's about no player after all to those near it", () => {
        const world = worldOf(["ann", "bea", "cat"], [["ann", "bea"]]);
        const [ann, bea, cat] = [viewerOf("ann", { knows: ["trader"] }), viewerOf("bea", { x: 9000 }), viewerOf("cat", { knows: ["ann", "trader"] })];

        assert.equal(scopeOf("bought").audience, "one");
        assert.deepEqual([ann, bea, cat].map((viewer) => hears({ type: "bought", id: "ann", item: "bread" }, viewer, world)), [true, false, false], "not their party, nor whoever's watching");

        assert.equal(scopeOf("treasure").audience, "party");
        assert.deepEqual([ann, bea, cat].map((viewer) => hears({ type: "treasure", id: "ann" }, viewer, world)), [true, true, false]);
        assert.deepEqual([ann, bea, cat].map((viewer) => hears({ type: "treasure", id: "cat" }, viewer, world)), [false, false, true], "a player with no party: themself");

        // (An id that's no player's: wider, to those who know of them, never to no one)
        assert.deepEqual([ann, bea, cat].map((viewer) => hears({ type: "bought", id: "trader" }, viewer, world)), [true, false, true]);
        assert.deepEqual([ann, bea, cat].map((viewer) => hears({ type: "bought" }, viewer, world)), [true, true, true]);
    });

    it("sifts a step's events into those a player must be told and those they may, each in the order they came", () => {
        const world = worldOf(["ann"]);
        const ann = viewerOf("ann", { knows: ["wolf"] });
        const events = [
            { type: "attack", id: "wolf", target: "ann" },
            { type: "hit", id: "ann", by: "wolf", damage: 3 },
            { type: "death", id: "wolf", by: "ann" },
            { type: "hit", id: "bear", by: "stag" },
            { type: "loot", id: "ann", gold: 4 },
            { type: "miss", id: "wolf", target: "ann" },
            { type: "turn", turn: 2 },
        ];
        const heard = sift(events, ann, world);

        assert.deepEqual(heard.must.map(({ type }) => type), ["death", "loot", "turn"]);
        assert.deepEqual(heard.may.map(({ type }) => type), ["attack", "hit", "miss"]);
        assert.deepEqual(sift([], ann, world), { must: [], may: [] });
    });
});

describe("a frame's sections (core/view.js)", () => {
    it("carries a step's events, the last command done and the hero's own state there and back, with or without anyone to tell of; and reads nothing from sections that aren't as they should be", () => {
        const state = new ViewState();
        const origin = originFor(0, 0);
        const events = JSON.stringify([{ type: "loot", id: "ann", gold: 4 }, { type: "talk", id: "ann", with: "Élan the Ælf 🜂" }]);
        const self = JSON.stringify({ gold: 12, pack: ["bread"] });

        // (Sections alone: a frame all the same)
        const alone = encodeFrame(state, { step: 9, origin, sections: { events, done: 41, self } });

        assert.deepEqual(decodeFrame(alone.bytes), { version: 1, step: 9, origin, leaves: [], records: [], sections: { events, done: 41, self } });
        assert.deepEqual(decodeFrame(encodeFrame(state, { step: 9, origin, sections: { done: 4294967295 } }).bytes).sections, { done: 4294967295 });
        assert.equal(encodeFrame(state, { step: 9, origin, sections: {} }).bytes, null, "none of them: no frame");
        assert.deepEqual(SECTION, { events: 1, done: 2, self: 3, enters: 4, own: 5, world: 6, asof: 7 });

        // (With those known: the records have what room the sections leave)
        const actors = Array.from({ length: 100 }, (_, k) => someone(k, 0));
        const battle = { actor: () => null };
        const known = actors.map((actor, index) => ({ index, slot: state.touch(battle, actor, 3), sent: -1 }));
        const plain = encodeFrame(state, { step: 3, origin, known });
        const full = encodeFrame(state, { step: 3, origin, known, sections: { events, done: 7 } });
        const read = decodeFrame(full.bytes);

        assert.ok(full.bytes.length <= VIEW.budget && plain.bytes.length <= VIEW.budget);
        assert.ok(full.told.length < plain.told.length && full.told.length > 0);
        assert.deepEqual(read.sections, { events, done: 7 });
        assert.equal(read.records.length, full.told.length);

        // (Cut short anywhere, a tag there isn't, one twice or out of order, a done of the wrong
        // length, text that isn't text: nothing read, nothing thrown)
        // (but where one section ends and the next would begin: a frame with fewer, whole as far
        // as it goes. A message comes whole or not at all, so nothing's cut there)
        const ends = [VIEW.header, VIEW.header + 3 + Buffer.byteLength(events), VIEW.header + 3 + Buffer.byteLength(events) + 7];

        for (let length = 0; length < alone.bytes.length; length++) {
            const cut = decodeFrame(alone.bytes.subarray(0, length));

            if (ends.includes(length)) {
                assert.equal(Object.keys(cut.sections).length, ends.indexOf(length));
            } else {
                assert.equal(cut, null, `${length} of ${alone.bytes.length}`);
            }
        }

        const at = VIEW.header;
        const changed = (edit) => {
            const bytes = Uint8Array.from(alone.bytes);

            edit(bytes);

            return decodeFrame(bytes);
        };

        assert.equal(alone.bytes[at], SECTION.events);
        assert.equal(changed((bytes) => (bytes[at] = 9)), null);
        assert.equal(changed((bytes) => (bytes[at] = 0)), null);
        assert.equal(changed((bytes) => (bytes[at] = SECTION.self)), null, "out of order");
        assert.equal(changed((bytes) => (bytes[at + 3] = 0xff)), null, "not text");
        assert.equal(decodeFrame(Uint8Array.from([...encodeFrame(state, { step: 1, origin, sections: { done: 5 } }).bytes, SECTION.done, 4, 0, 0, 0, 0, 0])), null, "one twice");

        const short = Uint8Array.from(encodeFrame(state, { step: 1, origin, sections: { done: 5 } }).bytes.subarray(0, VIEW.header + 3 + 3));

        short[VIEW.header + 1] = 3;
        assert.equal(decodeFrame(short), null, "a done of three bytes");
    });
});

describe("a player's events in their frames (core/viewfeed.js)", () => {
    // A feed over a few standing about, two of them players, with a session that's told each
    // their own; each player's frames read as their game would read them
    function fed() {
        const [ann, bea, wolf] = [someone(0, 0), someone(3000, 0), someone(20, 0)];
        const actors = [ann, bea, wolf];
        const battle = { actors, actor: (id) => actors.find((actor) => actor.id === id) ?? null, hostile: () => false };
        const toldSelf = new Map();
        const hosting = { host: { battle, players: new Map([[ann.id, {}], [bea.id, {}]]), parties: new Map(), partyIds: new Map() }, session: { players: new Map([["a", ann.id], ["b", bea.id]]), toldSelf } };
        const feed = new ViewFeed(hosting);
        const frames = new Map([[ann.id, []], [bea.id, []]]);

        feed.mode = "dark";
        feed.onFrame = (id, bytes) => {
            const frame = decodeFrame(bytes);

            assert.ok(frame, `${bytes.length} bytes that read as a frame`);
            frames.get(id).push({ ...frame.sections, events: frame.sections.events === undefined ? undefined : JSON.parse(frame.sections.events), length: bytes.length });
        };

        return { ann, bea, wolf, feed, frames, toldSelf, hosting };
    }

    it("tells each player the events that are theirs, in order, with the frame of the step they came in", () => {
        const { ann, bea, wolf, feed, frames } = fed();
        const events = [
            { type: "attack", time: 50, id: wolf.id, target: ann.id },
            { type: "loot", time: 50, id: ann.id, gold: 4 },
            { type: "loot", time: 50, id: bea.id, gold: 9 },
            { type: "turn", time: 50, turn: 2 },
        ];

        feed.flush(0);
        feed.heard(events);
        feed.flush(1);
        feed.flush(2);

        // (Those that must be told first, then those that may; and none told twice)
        assert.deepEqual(frames.get(ann.id).flatMap((frame) => frame.events ?? []), [events[1], events[3], events[0]]);
        assert.deepEqual(frames.get(bea.id).flatMap((frame) => frame.events ?? []), [events[2], events[3]]);
        assert.equal(feed.viewers.get(ann.id).events, 3);
        assert.ok(["views.events", "views.dropped"].every((name) => COUNTERS.includes(name)));

        // (Off: what's heard isn't kept)
        feed.mode = "off";
        feed.heard(events);
        assert.deepEqual(feed.pending, []);
    });

    it("keeps what must be told for the next frame when a step has more than a frame's worth, in order, and lets go of what only may be for want of room", () => {
        const { ann, wolf, feed, frames } = fed();
        const must = Array.from({ length: 40 }, (_, k) => ({ type: "death", time: 50, id: wolf.id, n: k, note: "x".repeat(60) }));
        const may = Array.from({ length: 40 }, (_, k) => ({ type: "miss", time: 50, id: wolf.id, target: ann.id, n: k }));

        feed.flush(0);
        feed.heard([...may, ...must]);

        for (let step = 1; step < 10; step++) {
            feed.flush(step);
        }

        const mine = frames.get(ann.id);
        const told = mine.flatMap((frame) => frame.events ?? []);
        const deaths = told.filter(({ type }) => type === "death");
        const misses = told.filter(({ type }) => type === "miss");

        assert.deepEqual(deaths.map(({ n }) => n), must.map(({ n }) => n), "every one, in order");
        assert.ok(mine.filter((frame) => frame.events?.some(({ type }) => type === "death")).length >= 3, "over several frames");
        assert.ok(mine.every((frame) => frame.length <= EVENTS.must + EVENTS.may + VIEW.budget));
        assert.ok(misses.length >= 1 && misses.length < may.length, `${misses.length} of ${may.length} misses told`);
        assert.deepEqual(misses.map(({ n }) => n), may.slice(0, misses.length).map(({ n }) => n), "the first of them, while there was room");
        assert.equal(feed.viewers.get(ann.id).dropped, may.length - misses.length);
        assert.equal(feed.viewers.get(ann.id).owed.length, 0);

        // (One that must be told and is longer than a frame's worth is told all the same, alone
        // in a frame as long as it takes, and what's after it in the next: an invasion's coming
        // is a kilobyte or two)
        const long = { type: "death", time: 50, id: wolf.id, note: "y".repeat(3000) };

        feed.heard([long, { type: "death", time: 50, id: wolf.id, n: "after" }]);
        feed.flush(10);
        feed.flush(11);
        assert.deepEqual(mine.at(-2).events, [long]);
        assert.ok(mine.at(-2).length > 3000 && mine.at(-2).length < 3000 + VIEW.budget);
        assert.deepEqual(mine.at(-1).events, [{ type: "death", time: 50, id: wolf.id, n: "after" }]);
        assert.equal(feed.viewers.get(ann.id).dropped, may.length - misses.length, "nothing more let go of");

        // (One that only may be told and is too long is let go of; and one past what a section holds, whichever it is)
        feed.heard([{ type: "miss", time: 50, id: wolf.id, target: ann.id, note: "z".repeat(EVENTS.one) }, { type: "death", time: 50, id: wolf.id, note: "w".repeat(EVENTS.big) }, { type: "death", time: 50, id: wolf.id, n: "last" }]);
        feed.flush(12);
        assert.deepEqual(mine.at(-1).events, [{ type: "death", time: 50, id: wolf.id, n: "last" }]);
        assert.equal(feed.viewers.get(ann.id).dropped, may.length - misses.length + 2);
    });

    it("tells a player the last of their commands done and their hero's own state as the session last told their game, when either's changed and not again", () => {
        const { ann, bea, feed, frames, toldSelf, hosting } = fed();

        feed.flush(0);
        assert.ok(frames.get(ann.id).every((frame) => frame.done === undefined && frame.self === undefined), "nothing told yet");

        toldSelf.set("a", { seq: 3, hero: '{"gold":5}', time: 0 });
        feed.flush(1);
        assert.deepEqual([frames.get(ann.id).at(-1).done, frames.get(ann.id).at(-1).self], [3, '{"gold":5}']);
        assert.ok(frames.get(bea.id).every((frame) => frame.done === undefined), "each their own");

        // (Nothing changed: no frame for it)
        const before = frames.get(ann.id).length;

        feed.flush(2);
        assert.equal(frames.get(ann.id).length, before);

        // (A command done, the hero as it was: the one without the other; then the other)
        toldSelf.set("a", { seq: 4, hero: '{"gold":5}', time: 0 });
        feed.flush(3);
        assert.deepEqual([frames.get(ann.id).at(-1).done, frames.get(ann.id).at(-1).self], [4, undefined]);
        toldSelf.set("a", { seq: 4, hero: '{"gold":9}', time: 0 });
        feed.flush(4);
        assert.deepEqual([frames.get(ann.id).at(-1).done, frames.get(ann.id).at(-1).self], [undefined, '{"gold":9}']);

        // (A player of the host's own game, with no link: none of it)
        hosting.session.players.delete("b");
        toldSelf.set("b", { seq: 1, hero: "{}", time: 0 });
        feed.flush(5);
        assert.ok(frames.get(bea.id).every((frame) => frame.done === undefined && frame.self === undefined));
    });

    it("on a played world: every event told has a scope, each joined player's frames carry their own state and what's theirs to hear, and nothing of lockstep changes for it", () => {
        const play = (mode) => {
            const world = buildWorld({ seed: 2 });
            const host = new Host(world, { populate: false });
            const sent = [];
            const hosting = new Hosting(host, { send: (peer, text) => sent.push(`${peer} ${text}`) });
            const hero = (name, race) => ({ name, race, shape: {}, look: {}, weapon: "sword", boots: false });
            const { at } = startFor(world.plan, "human");
            const kinds = new Set();
            const heard = new Map();
            const sums = [];

            host.join({ id: "p1", hero: hero("P1", "human"), square: [Math.round(at[0]), Math.round(at[1])], map: "town" });
            host.populate();
            hosting.views.mode = mode;
            hosting.views.onFrame = (id, bytes) => {
                const { sections } = decodeFrame(bytes);

                heard.set(id, { events: [...(heard.get(id)?.events ?? []), ...JSON.parse(sections.events ?? "[]")], self: sections.self ?? heard.get(id)?.self, done: sections.done ?? heard.get(id)?.done });
            };
            hosting.hear("a", encode({ kind: "hello", version: NET_VERSION, character: { hero: hero("Ann", "human") } }));

            for (let k = 0; k < 160; k++) {
                if (k === 20) {
                    hosting.hear("a", encode({ kind: "command", seq: 1, command: { type: "emote", emote: "wave" } }));
                    host.command("p1", { type: "move", to: [Math.round(at[0]) + 6, Math.round(at[1]) + 4], run: true });
                }

                const events = host.advance(STEP_MS);

                events.forEach(({ type }) => kinds.add(type));
                hosting.views.heard(events);
                hosting.flush();
                sums.push(host.checksum());
            }

            return { kinds, heard, sums, sent, hosting, host };
        };
        const dark = play("dark");
        const off = play("off");

        assert.deepEqual(dark.sums, off.sums);
        assert.deepEqual(dark.sent, off.sent);
        assert.ok(dark.kinds.size >= 2, [...dark.kinds].join(", "));
        assert.deepEqual([...dark.kinds].filter((kind) => !Object.hasOwn(SCOPES, kind)), []);

        // (The one who joined: their own state as their game was told it, their command done,
        // and their own emote among what they heard)
        const guest = dark.hosting.session.players.get("a");
        const mine = dark.heard.get(guest);

        assert.equal(mine.self, dark.hosting.session.toldSelf.get("a").hero);
        assert.equal(mine.done, 1);
        assert.ok(mine.events.some(({ type, id }) => type === "emote" && id === guest), mine.events.map(({ type }) => type).join(", "));
        assert.equal(off.heard.size, 0);
    });
});
