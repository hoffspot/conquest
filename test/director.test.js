// The wilds director (client/js/core/director.js; in play, core/host.js #caches, #deal): every so
// far a player crosses the wilds, the next card of a shuffled deck dealt ahead of them (an
// adventurer's cache, a fallen adventurer's remains, an old campsite), each once a deck; the
// remains searched for a share each, a note in their hand now and then; an old campsite safe to
// camp at with the wild nearer, its fire lit in the ring, the campers waking well rested
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { WILD } from "../client/js/core/creatures.js";
import { DIRECTOR, FINDS, noteOf, PACING, PEACEFUL, peacefulNext, rollRemains, shuffled, WELL_RESTED } from "../client/js/core/director.js";
import { hypot } from "../client/js/core/exact.js";
import { HOST_PLAYER, Host, REST, WILDS } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { CHEST_GOLD } from "../client/js/core/places.js";
import { createRandom } from "../client/js/core/random.js";
import { TREASURE_MAP } from "../client/js/core/treasure.js";
import { decode, encode } from "../client/js/core/wire.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

function run(host, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...host.advance(STEP_MS));
    }

    return events;
}

const put = (actor, [x, y]) => Object.assign(actor, { square: [x, y], x: x + 0.5, y: y + 0.5, path: [], order: null, target: null });

// A world (seed 2) with its player in it, hard to kill, the orc gone; the director's deck theirs to
// set (`deck`: the cards to deal, the next first)
function hosted(deck) {
    const world = buildWorld({ seed: 2 });
    const host = new Host(world, { populate: false });

    host.join({ id: HOST_PLAYER, hero: HERO });
    host.populate();
    Object.assign(host.battle.actor("orc"), { dead: true, respawnAt: Infinity });

    const me = host.battle.actor(HOST_PLAYER);

    Object.assign(me, { hp: 1e6, maxHp: 1e6 });
    host.travel.set(HOST_PLAYER, { at: [me.x, me.y], walked: 0, next: null, heading: null, deck: [...deck] });

    return { host, world, me };
}

// The player walked out of the start town (seed 2's: north-east), `step` metres each half a
// second, from `from` metres out, till something's dealt before them (or they've gone `metres`):
// how far they went, where they are, and what was dealt ({ cache } or { find })
function walk({ host, world, me }, { metres = 1500, step = 8, from = 0 } = {}) {
    const [sx, sy] = world.start.at;
    // (By the ids handed out: the last one dealt may be let go as the next's dealt)
    const [caches, finds] = [host.nextCache, host.nextFind];

    for (let d = from; d <= metres; d += step) {
        const at = [Math.floor(sx + Math.SQRT1_2 * d), Math.floor(sy + Math.SQRT1_2 * d)];

        put(me, at);
        me.hp = me.maxHp;
        run(host, 500);

        if (host.nextCache > caches || host.nextFind > finds) {
            return { d, at, cache: host.nextCache > caches ? host.caches.get(`cache-${caches}`) : null, find: host.nextFind > finds ? host.finds.get(`find-${finds}`) : null };
        }
    }

    return { d: null, at: [me.x, me.y], cache: null, find: null };
}

describe("the wilds director's deck (director.js)", () => {
    it("deals each card once a deck, in an order of its own, never the one just dealt first again", () => {
        const orders = new Set();

        for (let seed = 1; seed <= 60; seed++) {
            const random = createRandom(seed);
            const deck = shuffled(random);

            assert.deepEqual([...deck].sort(), [...DIRECTOR.cards].sort());
            orders.add(deck.join());

            for (const last of DIRECTOR.cards) {
                assert.notEqual(shuffled(random, last)[0], last, `(seed ${seed}, after ${last})`);
            }
        }

        assert.ok(orders.size >= 4, `${orders.size} orders`);
        assert.ok(PEACEFUL.every((card) => DIRECTOR.cards.includes(card)) && !PEACEFUL.includes("cache"));
    });

    it("finds in a fallen adventurer's remains a little gold, richer further out, and now and then a piece of gear, a draught or a treasure map", () => {
        const random = createRandom(7);
        const shares = Array.from({ length: 400 }, () => rollRemains(1, random));
        const far = Array.from({ length: 400 }, () => rollRemains(6, random));
        const often = (share, id) => share.filter(({ items }) => items.some((item) => (id ? item.id === id : !["potion", TREASURE_MAP].includes(item.id)))).length / share.length;

        assert.ok(shares.every(({ gold }) => gold >= FINDS.remains.gold[0] && gold <= FINDS.remains.gold[1]));
        assert.ok(far.every(({ gold }) => gold >= Math.round(FINDS.remains.gold[0] * (1 + CHEST_GOLD * 5))));
        assert.ok(Math.abs(often(shares) - FINDS.remains.gear) < 0.08, `gear ${often(shares)}`);
        assert.ok(Math.abs(often(shares, "potion") - FINDS.remains.potion) < 0.08);
        assert.ok(Math.abs(often(shares, TREASURE_MAP) - FINDS.remains.map) < 0.06);
    });

    it("tells in a note of the nearest place round about not yet found, within its reach", () => {
        const places = [
            { id: "near", at: [100, 0] },
            { id: "nearer", at: [0, 60] },
            { id: "far", at: [FINDS.remains.noteReach + 10, 0] },
        ];

        assert.equal(noteOf(places, [0, 0], () => false), "nearer");
        assert.equal(noteOf(places, [0, 0], (id) => id === "nearer"), "near", "(that one found)");
        assert.equal(noteOf(places, [0, 0], () => true), null);
        assert.equal(noteOf(places.slice(2), [0, 0], () => false), null, "(too far)");
    });
});

describe("the wilds director in play (host.js #caches, #deal, #putFind)", () => {
    it("deals the next card every so far a player crosses the wilds, each once a deck, then the deck shuffled again, not the last first", () => {
        const context = hosted(["remains", "campsite", "cache"]);
        const { host } = context;
        const dealt = [];
        let from = 0;

        for (let k = 0; k < 3; k++) {
            const { d, cache, find } = walk(context, { from });

            assert.ok(d !== null, `(a card dealt, the ${k + 1}th)`);
            assert.ok(d - from >= DIRECTOR.every[0] - 8 && d - from <= DIRECTOR.every[1] + 200, `(dealt ${d - from} m on)`);
            dealt.push(cache ? "cache" : find.kind);
            from = d + 8;
        }

        // (The deck all dealt: shuffled again, the cache not first)
        const { deck, last } = host.travel.get(HOST_PLAYER);

        assert.deepEqual(dealt, ["remains", "campsite", "cache"]);
        assert.deepEqual([...deck].sort(), [...DIRECTOR.cards].sort());
        assert.equal(last, "cache");
        assert.notEqual(deck[0], "cache", "(not the last one first)");
    });

    it("puts a peaceful find ahead of the player, clear of the roads and everything else, as a cache is; let go once every player's far", () => {
        const context = hosted(["campsite"]);
        const { host, me } = context;
        const { at, find } = walk(context);
        const off = hypot(find.at[0] - at[0] - 0.5, find.at[1] - at[1] - 0.5);

        assert.equal(find.kind, "campsite");
        assert.ok(off >= 68 && off <= 102, `${off} m ahead`);
        assert.ok((find.at[0] - at[0]) * Math.SQRT1_2 + (find.at[1] - at[1]) * Math.SQRT1_2 > 0, "before them");

        // (Far off: let go, told)
        put(me, [Math.floor(find.at[0] + FINDS.far + 30), Math.floor(find.at[1])]);

        const gone = run(host, 1000);

        assert.ok(!host.finds.has(find.id));
        assert.ok(gone.some(({ type, find: id, change }) => type === "find" && id === find.id && change === "gone"));
    });

    it("has a share of a fallen adventurer's remains for each player near when they're searched, theirs to take where they lay; searched once", () => {
        const context = hosted(["remains"]);
        const { host, me } = context;
        const { find } = walk(context);
        const chest = host.ground.get(`chest-${find.id}`);

        assert.equal(find.kind, "remains");
        assert.ok(chest?.remains && chest.chest && !chest.locked);

        // (Another player near, and one far off)
        host.join({ id: "guest", hero: { ...HERO, name: "Bram" } });
        host.join({ id: "far", hero: { ...HERO, name: "Cy" } });
        put(me, [find.square[0] + 1, find.square[1]]);
        put(host.battle.actor("guest"), [find.square[0] - 2, find.square[1] + 1]);
        put(host.battle.actor("far"), [find.square[0] + 200, find.square[1]]);

        assert.deepEqual(host.command(HOST_PLAYER, { type: "pickUp", ground: chest.id }), { ok: true });

        const events = run(host, 100);
        const spoils = events.filter(({ type, creature }) => type === "spoils" && creature === "remains");

        assert.deepEqual(spoils.map(({ id }) => id).sort(), [HOST_PLAYER, "guest"].sort());
        assert.ok(spoils.every(({ ground, find: id }) => id === find.id && host.ground.get(ground)?.bundle.gold > 0));
        assert.ok(!host.ground.has(chest.id), "(searched: no more to search)");
        assert.equal(host.finds.get(find.id).searched, true);
        assert.deepEqual(host.command(HOST_PLAYER, { type: "pickUp", ground: chest.id }), { ok: false, reason: "gone" });
    });

    it("lets a player camp at an old campsite with the wild nearer than anywhere else, the fire lit in its ring, waking well rested", () => {
        const context = hosted(["campsite"]);
        const { host, me } = context;
        const { find } = walk(context);
        const wolf = (square) => host.battle.add({ id: "wolf", kind: "beast", weapon: "wolf", team: WILD, square, ai: "wild", wild: { creature: "wolf", tier: 1, temper: "aggressive", guard: 0, roam: 4, leash: 10, pack: "p", leader: null, menace: true, unique: false, darkSight: true } });

        // A wolf 25 m off: no camp 20 m from the ring, as anywhere else; but at it, yes
        put(me, [find.square[0] + 20, find.square[1]]);
        wolf([find.square[0] + 20 + 25, find.square[1]]);
        assert.ok(25 < REST.clear && 25 >= FINDS.campsite.safe);
        assert.equal(host.campRefusal(HOST_PLAYER), "hostiles");
        put(me, [find.square[0] + 3, find.square[1]]);
        Object.assign(host.battle.actor("wolf"), { x: me.x + 25, y: me.y, square: [me.square[0] + 25, me.square[1]] });
        assert.equal(host.campRefusal(HOST_PLAYER), null);

        const events = [];

        host.recorder = null;
        assert.deepEqual(host.command(HOST_PLAYER, { type: "camp" }), { ok: true });
        events.push(...run(host, 100));

        const fire = host.campfires.find(({ player }) => player === HOST_PLAYER);
        const player = host.players.get(HOST_PLAYER);

        assert.deepEqual(fire.fire, find.at, "(lit in its ring)");
        assert.ok(player.boons.some(({ id, recoveryTimes }) => id === WELL_RESTED.id && recoveryTimes === WELL_RESTED.recoveryTimes));
        assert.ok(events.some(({ type, boon, change }) => type === "boon" && boon === WELL_RESTED.id && change === "on"));
        assert.ok(events.some(({ type, find: id, change }) => type === "find" && id === find.id && change === "camped"));
        assert.equal(me.recovery, WELL_RESTED.recoveryTimes);

        // (The wolf within FINDS.campsite.safe: no camp even there)
        Object.assign(host.battle.actor("wolf"), { x: me.x + 10, y: me.y, square: [me.square[0] + 10, me.square[1]] });
        assert.equal(host.campRefusal(HOST_PLAYER), "hostiles");

        // (Kept between visits, as the other boons are)
        const vitals = host.vitalsOf(HOST_PLAYER);

        assert.ok(vitals.boons.some(({ id }) => id === WELL_RESTED.id));
    });

    it("carries on exactly from a snapshot: the finds, the deck, and what's dealt next", () => {
        const context = hosted(["remains", "campsite", "cache"]);
        const { host } = context;

        walk(context);
        assert.equal(host.finds.size, 1);

        const again = Host.restore(buildWorld({ seed: 2 }), decode(encode(host.snapshot())));

        assert.deepEqual([...again.finds.entries()], [...host.finds.entries()]);
        assert.deepEqual([...again.travel.entries()], [...host.travel.entries()]);
        assert.equal(again.nextFind, host.nextFind);
        run(host, 6000);
        run(again, 6000);
        assert.equal(again.checksum(), host.checksum());
        assert.equal("finds" in new Host(buildWorld({ seed: 2 }), { populate: false }).snapshot(), false, "(none kept till one's dealt)");
    });
});

describe("the wilds director's pacing (director.js PACING; host.js #pace)", () => {
    // Out in the wilds 300 m north-east of the start town (seed 2), on foot, the land quiet
    function outside(deck = ["cache", "remains", "campsite"]) {
        const context = hosted(deck);
        const { world, me, host } = context;
        const [sx, sy] = world.start.at;

        put(me, [Math.floor(sx + 212), Math.floor(sy + 212)]);
        host.travel.set(HOST_PLAYER, { at: [me.x, me.y], walked: 0, next: 1e9, heading: [Math.SQRT1_2, Math.SQRT1_2], deck: [...deck] });

        return context;
    }

    const wolf = (host, id, [x, y]) => host.battle.add({ id, kind: "beast", weapon: "wolf", team: WILD, square: [x, y], ai: "wild", wild: { creature: "wolf", tier: 1, temper: "aggressive", guard: 0, roam: 4, leash: 10, pack: id, leader: null, menace: true, unique: false, darkSight: true } });

    it("puts a peaceful card next after a hard fight: the first in the deck, or the deck shuffled again, never the one just dealt first", () => {
        const random = createRandom(5);

        assert.deepEqual(peacefulNext(["cache", "campsite"], random), ["campsite", "cache"]);
        assert.deepEqual(peacefulNext(["remains"], random, "cache"), ["remains"]);

        for (let seed = 1; seed < 80; seed++) {
            for (const last of PEACEFUL) {
                const deck = peacefulNext(["cache"], createRandom(seed), last);

                assert.ok(PEACEFUL.includes(deck[0]) && deck[0] !== last, `(seed ${seed}, after ${last}: ${deck})`);
                assert.deepEqual([...deck].sort(), [...DIRECTOR.cards].sort(), "(a deck shuffled again)");
            }
        }
    });

    it("follows a hard fight with a quiet spell: told, the next card a peaceful one, fewer of the wild about them and no elite", () => {
        const context = outside();
        const { host, me } = context;

        // A fight that took the player below half their health
        wolf(host, "wolf-a", [me.square[0] + 3, me.square[1]]);
        host.battle.actor("wolf-a").target = HOST_PLAYER;
        me.hp = me.maxHp * 0.3;
        run(host, 1000);
        assert.ok(host.travel.get(HOST_PLAYER).pace.fight, "(in a fight)");

        Object.assign(host.battle.actor("wolf-a"), { dead: true, respawnAt: Infinity, target: null });
        me.hp = me.maxHp;

        const events = run(host, PACING.over + 1000);
        const { pace, deck } = host.travel.get(HOST_PLAYER);

        assert.ok(events.some(({ type, id, change }) => type === "pace" && id === HOST_PLAYER && change === "quiet"));
        assert.ok(pace.quietUntil - host.battle.time >= PACING.quiet[0] - PACING.over - 1000 && pace.quietUntil - host.battle.time <= PACING.quiet[1]);
        assert.ok(PEACEFUL.includes(deck[0]), `(next: ${deck[0]})`);

        // (Fewer of the wild come about them meanwhile: those out gone, half as many come back)
        const roaming = () => [...host.wild].filter(([id, one]) => !one.camp && !one.den && !one.lair && !one.place && !one.cache && host.battle.actor(id) && !host.battle.actor(id).dead && hypot(host.battle.actor(id).x - me.x, host.battle.actor(id).y - me.y) < WILDS.about);

        for (const [id] of roaming()) {
            Object.assign(host.battle.actor(id), { dead: true, respawnAt: Infinity, target: null });
        }

        run(host, 3000);
        assert.ok(roaming().length >= 1 && roaming().length <= Math.round(WILDS.count * PACING.fewer), `${roaming().length} come about them`);
    });

    it("leaves an easy fight be: no quiet spell", () => {
        const context = outside();
        const { host, me } = context;

        wolf(host, "wolf-b", [me.square[0] + 3, me.square[1]]);
        host.battle.actor("wolf-b").target = HOST_PLAYER;
        me.hp = me.maxHp * 0.9;
        run(host, 1000);
        Object.assign(host.battle.actor("wolf-b"), { dead: true, respawnAt: Infinity, target: null });

        const events = run(host, PACING.over + 1000);

        assert.ok(!events.some(({ type, change }) => type === "pace" && change === "quiet"));
        assert.equal(host.travel.get(HOST_PLAYER).deck[0], "cache");
    });

    it("builds up after a long calm: the land's hunters heard ahead, then come for the player, running", () => {
        const context = outside();
        const { host, me } = context;

        run(host, 600);

        const pace = host.travel.get(HOST_PLAYER).pace;

        Object.assign(pace, { lastFight: host.battle.time - PACING.calm - 1, calm: PACING.calmMetres + 10 });

        const heard = run(host, 1000).find(({ type, change }) => type === "pace" && change === "build");

        assert.ok(heard, "(a build-up)");

        const far = hypot(heard.at[0] - me.x, heard.at[1] - me.y);

        assert.ok(far >= PACING.from[0] - 2 && far <= PACING.from[1] + 2, `${far} m off`);
        assert.ok(heard.creature, "(what's coming)");
        assert.ok(!run(host, PACING.warn[0] - 1500).some(({ type, change }) => type === "pace" && change === "hunt"), "(not yet)");

        const hunt = run(host, PACING.warn[1] - PACING.warn[0] + 2000).find(({ type, change }) => type === "pace" && change === "hunt");

        assert.ok(hunt?.ids.length >= 2, "(they come)");
        assert.ok(hunt.ids.every((id) => host.battle.actor(id).order?.target === HOST_PLAYER || host.battle.actor(id).target === HOST_PLAYER), "(for the player)");
        assert.equal(host.travel.get(HOST_PLAYER).pace.build, null);
    });

    it("carries the pace on exactly from a snapshot", () => {
        const context = outside();
        const { host } = context;

        run(host, 600);
        Object.assign(host.travel.get(HOST_PLAYER).pace, { lastFight: host.battle.time - PACING.calm - 1, calm: PACING.calmMetres + 10 });
        run(host, 1000);
        assert.ok(host.travel.get(HOST_PLAYER).pace.build);

        const again = Host.restore(buildWorld({ seed: 2 }), decode(encode(host.snapshot())));

        assert.deepEqual(again.travel.get(HOST_PLAYER), host.travel.get(HOST_PLAYER));
        run(host, 25000);
        run(again, 25000);
        assert.equal(again.checksum(), host.checksum());
    });
});
