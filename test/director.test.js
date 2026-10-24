// The wilds director (client/js/core/director.js; in play, core/host.js #caches, #deal): every so
// far a player crosses the wilds, the next card of a shuffled deck dealt ahead of them (an
// adventurer's cache, a fallen adventurer's remains, an old campsite), each once a deck; the
// remains searched for a share each, a note in their hand now and then; an old campsite safe to
// camp at with the wild nearer, its fire lit in the ring, the campers waking well rested; fresh
// tracks to a pack; and the strangers met on the way: a pedlar selling odds and ends, a wounded
// hunter who tells of a place round about for their healing, hungry bandits wanting food or gold
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { LOOKS } from "../client/js/beasts/looks.js";
import { CREATURES, WILD } from "../client/js/core/creatures.js";
import { banditToll, DIRECTOR, FINDS, foodFor, FRESH, freshTrail, noteOf, PACING, PEACEFUL, peacefulNext, rollRemains, shuffled, STRANGERS, TRACKLESS, WELL_RESTED } from "../client/js/core/director.js";
import { hypot } from "../client/js/core/exact.js";
import { HOST_PLAYER, Host, REST, WILDS } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { CHEST_GOLD } from "../client/js/core/places.js";
import { ITEMS } from "../client/js/core/progress.js";
import { createRandom } from "../client/js/core/random.js";
import { rumouredOf } from "../client/js/core/rumours.js";
import { TREASURE_MAP } from "../client/js/core/treasure.js";
import { decode, encode } from "../client/js/core/wire.js";
import { lookPrint } from "../client/js/world/tracks3d.js";

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
// how far they went, where they are, and what was dealt ({ cache }, { find }, { tracks } or
// { stranger })
function walk({ host, world, me }, { metres = 1500, step = 8, from = 0 } = {}) {
    const [sx, sy] = world.start.at;
    // (By the ids handed out: the last one dealt may be let go as the next's dealt)
    const [caches, finds, fresh, strangers] = [host.nextCache, host.nextFind, host.nextFresh, host.nextStranger];

    for (let d = from; d <= metres; d += step) {
        const at = [Math.floor(sx + Math.SQRT1_2 * d), Math.floor(sy + Math.SQRT1_2 * d)];

        put(me, at);
        me.hp = me.maxHp;
        run(host, 500);

        if (host.nextCache > caches || host.nextFind > finds || host.nextFresh > fresh || host.nextStranger > strangers) {
            return {
                d,
                at,
                cache: host.nextCache > caches ? host.caches.get(`cache-${caches}`) : null,
                find: host.nextFind > finds ? host.finds.get(`find-${finds}`) : null,
                tracks: host.nextFresh > fresh ? host.fresh.get(`fresh-${fresh}`) : null,
                stranger: host.nextStranger > strangers ? host.strangers.get(`stranger-${strangers}`) : null,
            };
        }
    }

    return { d: null, at: [me.x, me.y], cache: null, find: null, tracks: null, stranger: null };
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

describe("the wilds director's fresh tracks (director.js FRESH; host.js #putTracks)", () => {
    it("knows what leaves no prints as the world draws them (what flies, floats or swarms)", () => {
        assert.deepEqual([...TRACKLESS].sort(), Object.keys(CREATURES).filter((id) => !lookPrint(id, LOOKS[id]).print).sort());
    });

    it("lays a fresh trail from just ahead of one place to a little short of another, wandering a little", () => {
        const points = freshTrail([0, 0], [0, 80], createRandom(4));
        const along = points.map(([, y]) => y);

        assert.ok(points.length >= 10);
        assert.ok(Math.abs(along[0] - FRESH.start) < 0.01 && along.at(-1) <= 80 - FRESH.short + 0.01);
        assert.ok(along.every((y, k) => !k || y > along[k - 1]), "(on towards it)");
        assert.ok(points.every(([x]) => Math.abs(x) <= 3) && points.some(([x]) => Math.abs(x) > 0.2), "(wandering a little)");
    });

    it("leads fresh tracks to a pack of the wild's out near the player (or one put out ahead), told; let go once that pack's all gone", () => {
        const context = hosted(["tracks"]);
        const { host } = context;
        const { find, cache } = walk(context);

        assert.equal(find, null);
        assert.equal(cache, null);

        const [tracks] = host.fresh.values();

        assert.ok(tracks, "(fresh tracks laid)");

        const pack = [...host.wild].filter(([, one]) => one.pack === tracks.pack).map(([id]) => host.battle.actor(id));
        const end = tracks.points.at(-1);

        assert.ok(pack.length >= 1 && pack.every((one) => !one.dead));
        assert.equal(host.wild.get(pack[0].id).creature, tracks.creature);
        assert.ok(!TRACKLESS.has(tracks.creature), `(${tracks.creature}: they leave prints)`);
        assert.ok(pack.some((one) => hypot(one.x - end[0], one.y - end[1]) <= FRESH.short + FRESH.step + 6), "(leading to them)");

        // (The pack all gone: the tracks too, told)
        for (const one of pack) {
            Object.assign(one, { dead: true, respawnAt: Infinity, target: null });
        }

        const gone = run(host, 1000);

        assert.ok(!host.fresh.has(tracks.id));
        assert.ok(gone.some(({ type, tracks: id, change }) => type === "tracks" && id === tracks.id && change === "gone"));
    });

    it("lets fresh tracks go once they're old, and carries them on exactly from a snapshot", () => {
        const context = hosted(["tracks"]);
        const { host } = context;

        walk(context);

        const [tracks] = host.fresh.values();
        const again = Host.restore(buildWorld({ seed: 2 }), decode(encode(host.snapshot())));

        assert.deepEqual([...again.fresh.entries()], [...host.fresh.entries()]);
        assert.equal(again.nextFresh, host.nextFresh);
        run(host, 3000);
        run(again, 3000);
        assert.equal(again.checksum(), host.checksum());

        tracks.until = host.battle.time;
        run(host, 1000);
        assert.ok(!host.fresh.has(tracks.id), "(old: gone)");
    });
});

describe("the strangers met on the way (director.js STRANGERS; host.js #putStranger)", () => {
    // A stranger of a kind (`kind`) met out in the wilds, the player walked up beside them (their
    // leader, for the bandits), with a healing draught, a hot meal and gold in their pack
    function meet(kind) {
        const context = hosted(["stranger"]);
        const { host, me } = context;

        host.travel.get(HOST_PLAYER).strangers = [kind];

        const { stranger } = walk(context);
        const one = host.battle.actor(stranger.ids[0]);
        const player = host.players.get(HOST_PLAYER);

        player.progress.gold = 500;
        player.progress.stow({ id: "potion", quality: "common" });
        player.progress.stow({ id: "meal", quality: "common" });
        put(me, [one.square[0] + 1, one.square[1]]);

        return { ...context, stranger, one, player };
    }

    const talk = (host, id) => host.command(HOST_PLAYER, { type: "talk", with: id });
    const effect = (host, done) => host.command(HOST_PLAYER, { type: "effect", effect: done });

    it("meets each stranger once before any again, as the cards are dealt; asks a toll of hungry bandits richer further out; takes meat for food before a hot meal", () => {
        for (let seed = 1; seed <= 20; seed++) {
            const random = createRandom(seed);
            const round = shuffled(random, null, STRANGERS.kinds);

            assert.deepEqual([...round].sort(), [...STRANGERS.kinds].sort());
            assert.notEqual(shuffled(random, round.at(-1), STRANGERS.kinds)[0], round.at(-1));
        }

        const random = createRandom(3);
        const near = Array.from({ length: 200 }, () => banditToll(1, random));
        const far = Array.from({ length: 200 }, () => banditToll(6, random));

        assert.ok(near.every((gold) => gold >= STRANGERS.bandits.gold[0] && gold <= STRANGERS.bandits.gold[1]));
        assert.ok(Math.min(...far) > Math.max(...near) * 0.9, "(richer further out)");
        assert.ok(DIRECTOR.cards.includes("stranger") && !PEACEFUL.includes("stranger"));

        const meat = Object.keys(ITEMS).find((id) => ITEMS[id].food);

        assert.deepEqual(foodFor([{ id: meat, count: 3 }, { id: "meal", count: 1 }]), [{ id: meat, count: STRANGERS.bandits.meat }]);
        assert.deepEqual(foodFor([{ id: meat, count: 1 }, { id: "meal", count: 2 }, null]), [{ id: "meal", count: 1 }]);
        assert.equal(foodFor([{ id: meat, count: 1 }, { id: "potion", count: 4 }]), null);
    });

    it("puts a pedlar out ahead of the player, resting by the way, who sells odds and ends out of their own stock, a little dearer than in town", () => {
        const { host, stranger, one, player } = meet("pedlar");
        const folk = host.folk.get(one.id);

        assert.equal(stranger.kind, "pedlar");
        assert.ok(one.neutral && one.kind === "folk" && one.role === "pedlar");
        assert.equal(folk.shop, "pedlar");
        assert.equal(folk.talk, "pedlar");
        assert.equal(host.strangerOf(one.id), stranger);

        const stock = host.stockOf(one.id);
        const potion = stock.wares.find(({ id }) => id === "potion");

        assert.ok(potion, "(a healing draught, always)");
        assert.deepEqual(talk(host, one.id), { ok: true });

        const gold = player.progress.gold;

        assert.deepEqual(host.command(HOST_PLAYER, { type: "buy", item: { id: "potion", quality: "common" }, from: one.id }), { ok: true });
        assert.ok(gold - player.progress.gold > Math.round(ITEMS.potion.price * 1.1), `(${gold - player.progress.gold} gold)`);
        assert.equal(host.stockOf(one.id).wares.find(({ id }) => id === "potion").left, potion.left - 1);
    });

    it("has a wounded hunter, healed with a draught, tell the player of a place round about they hadn't found, then go on their way", () => {
        const { host, stranger, one, player } = meet("hunter");

        assert.ok(one.hp <= one.maxHp * STRANGERS.hunter.wounded + 1, `(${one.hp} of ${one.maxHp})`);
        assert.deepEqual(effect(host, { tend: "draught" }), { ok: false, reason: "talking" }, "(not talking to them)");
        assert.deepEqual(talk(host, one.id), { ok: true });

        const draughts = player.progress.held("potion");

        assert.deepEqual(effect(host, { tend: "draught" }), { ok: true });

        const events = run(host, 100);
        const tended = events.find(({ type, change }) => type === "stranger" && change === "tended");

        assert.equal(player.progress.held("potion"), draughts - 1);
        assert.equal(one.hp, one.maxHp);
        assert.equal(stranger.tended, HOST_PLAYER);
        assert.equal(tended?.by, HOST_PLAYER);
        assert.equal(tended.place, noteOf(rumouredOf(host.world.plan), stranger.at, (id, x, y) => player.explored.knows(id, x, y)));
        assert.ok(tended.place, "(somewhere round about)");
        assert.deepEqual(effect(host, { tend: "draught" }), { ok: false, reason: "command" }, "(once)");

        // (On their way once the talk's over, a while after, at their own pace)
        talk(host, null);

        const speed = one.speed;
        const off = run(host, STRANGERS.hunter.thanks + 1000).find(({ type, change }) => type === "stranger" && change === "off");

        assert.equal(off?.limping, false);
        assert.equal(one.speed, speed);
        assert.ok(one.routine.stops.length === 1 && hypot(one.routine.stops[0].square[0] - one.x, one.routine.stops[0].square[1] - one.y) > STRANGERS.hunter.away / 2, "(going off)");
    });

    it("has a wounded hunter healed by a player's healing spell too; turned down, or left unhealed, limping off", () => {
        const healed = meet("hunter");
        const progress = healed.player.progress;

        progress.learn("vigor");
        healed.host.players.get(HOST_PLAYER).readyAt = {};
        healed.me.spellReadyAt = 0;

        const cast = healed.host.command(HOST_PLAYER, { type: "cast", spell: "vigor", target: healed.one.id });

        assert.deepEqual(cast, { ok: true });
        assert.ok(run(healed.host, 3000).some(({ type, change, by }) => type === "stranger" && change === "tended" && by === HOST_PLAYER));

        // (Turned down: off at once, limping)
        const refused = meet("hunter");
        const speed = refused.one.speed;

        talk(refused.host, refused.one.id);
        assert.deepEqual(effect(refused.host, { tend: "no" }), { ok: true });
        assert.ok(run(refused.host, 100).some(({ type, change, limping }) => type === "stranger" && change === "off" && limping));
        assert.equal(refused.one.speed, speed * STRANGERS.hunter.limp);
        assert.deepEqual(effect(refused.host, { tend: "draught" }), { ok: false, reason: "command" });

        // (Left unhealed: met as the player came near, and off once they've waited long enough)
        const left = meet("hunter");

        run(left.host, 1000);
        assert.ok(left.stranger.met !== null);
        assert.ok(!run(left.host, STRANGERS.hunter.waits - 3000).some(({ type, change }) => type === "stranger" && change === "off"));
        assert.ok(run(left.host, 4000).some(({ type, change, limping }) => type === "stranger" && change === "off" && limping));
    });

    it("has hungry bandits hail a player who comes near, no one's enemy till then; paid in gold, they let them by", () => {
        const { host, stranger, one, me, player } = meet("bandits");
        const bandits = stranger.ids.map((id) => host.battle.actor(id));

        assert.ok(bandits.length >= STRANGERS.bandits.count[0] && bandits.length <= STRANGERS.bandits.count[1]);
        assert.ok(bandits.every((bandit) => bandit.neutral && host.wild.get(bandit.id).stranger === stranger.id));
        assert.equal(host.wild.get(one.id).creature, "banditChief");
        assert.ok(stranger.toll >= STRANGERS.bandits.gold[0]);
        assert.ok(!host.battle.hostile(one, me));

        const hail = run(host, 600).find(({ type, change }) => type === "stranger" && change === "hail");

        assert.equal(hail?.id, HOST_PLAYER);
        assert.equal(hail.by, one.id);
        assert.deepEqual(stranger.hailed, [HOST_PLAYER]);
        assert.deepEqual(talk(host, one.id), { ok: true });

        const gold = player.progress.gold;

        assert.deepEqual(effect(host, { toll: "gold" }), { ok: true });
        assert.equal(player.progress.gold, gold - stranger.toll);
        assert.equal(stranger.paid, HOST_PLAYER);
        assert.deepEqual(effect(host, { toll: "refuse" }), { ok: false, reason: "command" }, "(paid already)");

        // (Walked off: let by)
        talk(host, null);
        put(me, [one.square[0] + STRANGERS.bandits.off + 10, one.square[1]]);
        run(host, 2000);
        assert.ok(bandits.every((bandit) => bandit.neutral && bandit.target === null));
    });

    it("has hungry bandits take food for their toll; refused, or walked away from, they fight", () => {
        const fed = meet("bandits");
        const meat = Object.keys(ITEMS).find((id) => ITEMS[id].food);

        fed.player.progress.stow({ id: meat, quality: "common" }, 2);
        run(fed.host, 600);
        talk(fed.host, fed.one.id);
        assert.deepEqual(effect(fed.host, { toll: "food" }), { ok: true });
        assert.equal(fed.player.progress.held(meat), 0, "(the meat taken)");
        assert.equal(fed.player.progress.held("meal"), 1, "(the meal kept)");

        // (Refused: everyone's enemy, after the player, the talk over)
        const refused = meet("bandits");

        run(refused.host, 600);
        talk(refused.host, refused.one.id);
        assert.deepEqual(effect(refused.host, { toll: "refuse" }), { ok: true });

        const fight = run(refused.host, 600);

        assert.ok(fight.some(({ type, change, id }) => type === "stranger" && change === "fight" && id === HOST_PLAYER));
        assert.ok(refused.stranger.ids.every((id) => !refused.host.battle.actor(id).neutral));
        assert.ok(refused.host.battle.hostile(refused.one, refused.me));
        assert.ok(refused.stranger.ids.some((id) => refused.host.battle.actor(id).target === HOST_PLAYER || refused.host.battle.actor(id).order?.target === HOST_PLAYER));
        assert.equal(refused.me.talkingTo, null);

        // (Walked away from once hailed, unpaid: the same)
        const fled = meet("bandits");

        run(fled.host, 600);
        put(fled.me, [fled.one.square[0] + STRANGERS.bandits.off + 4, fled.one.square[1]]);
        assert.ok(run(fled.host, 600).some(({ type, change }) => type === "stranger" && change === "fight"));
        assert.ok(fled.stranger.fight);
    });

    it("lets a stranger go once every player's far, and carries them on exactly from a snapshot", () => {
        for (const kind of STRANGERS.kinds) {
            const { host, stranger, one, me } = meet(kind);

            run(host, 600);

            const again = Host.restore(buildWorld({ seed: 2 }), decode(encode(host.snapshot())));

            assert.deepEqual([...again.strangers.entries()], [...host.strangers.entries()], kind);
            assert.deepEqual(again.travel.get(HOST_PLAYER), host.travel.get(HOST_PLAYER));

            if (stranger.folk) {
                assert.deepEqual(again.folk.get(one.id), host.folk.get(one.id));
                assert.equal(again.folk.get(one.id), again.strangers.get(stranger.id).folk, "(one record)");
            }

            run(host, 3000);
            run(again, 3000);
            assert.equal(again.checksum(), host.checksum(), kind);

            put(me, [Math.floor(stranger.at[0] + STRANGERS.far + 30), Math.floor(stranger.at[1])]);

            const gone = run(host, 1000);

            assert.ok(!host.strangers.has(stranger.id), kind);
            assert.ok(gone.some(({ type, stranger: id, change }) => type === "stranger" && id === stranger.id && change === "gone"));
            assert.ok(!host.battle.actor(one.id) && !host.folk.has(one.id), `${kind}: gone from the world`);
        }

        assert.equal("strangers" in new Host(buildWorld({ seed: 2 }), { populate: false }).snapshot(), false, "(none kept till one's met)");
    });
});
