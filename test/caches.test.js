// The adventurers' caches (client/js/core/caches.js; in play, core/host.js #caches): one put out
// ahead of a player about every half a kilometre they cross the wilds, clear of the roads, the
// settlements and the places worth finding; kept by a band of that land's brigands as strong as
// the land or the player, their leader by it and the rest walking a round about it; locked till
// the last of them falls, then a share for each player there; let go once every player's far
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { ICON_KINDS } from "../client/js/app/mapicons.js";
import { STEP_MS } from "../client/js/core/battle.js";
import { CACHE_BANDS, CACHE_GEAR, CACHE_LOOT, CACHE_MAKES, cacheBand, cacheClear, cacheCount, CACHES, cacheTier, rollCache, roundOf, startsOf } from "../client/js/core/caches.js";
import { CREATURES, tierAt, TIERS } from "../client/js/core/creatures.js";
import { hypot } from "../client/js/core/exact.js";
import { GEAR } from "../client/js/core/gear.js";
import { HOST_PLAYER, Host } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { CHEST_GOLD, placesOf } from "../client/js/core/places.js";
import { createRandom } from "../client/js/core/random.js";
import { decode, encode } from "../client/js/core/wire.js";
import { BIOMES } from "../client/js/core/worldplan/races.js";
import { landAt, planWorld } from "../client/js/core/worldplan/plan.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

function run(host, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...host.advance(STEP_MS));
    }

    return events;
}

const put = (actor, [x, y]) => Object.assign(actor, { square: [x, y], x: x + 0.5, y: y + 0.5, path: [], order: null, target: null });

// A world (seed 2) with its player in it, hard to kill, the orc gone
function hosted() {
    const world = buildWorld({ seed: 2 });
    const host = new Host(world, { populate: false });

    host.join({ id: HOST_PLAYER, hero: HERO });
    host.populate();
    Object.assign(host.battle.actor("orc"), { dead: true, respawnAt: Infinity });

    const me = host.battle.actor(HOST_PLAYER);

    Object.assign(me, { hp: 1e6, maxHp: 1e6 });

    return { host, world, me };
}

// The player walked out of the start town (seed 2's: north-east, over meadow and into the
// mountains), `step` metres each half a second, till a cache is put out before them (or they've
// gone `metres`): how far they went, and where they are
function walk({ host, world, me }, { metres = 1200, step = 8, from = 0 } = {}) {
    const [sx, sy] = world.start.at;
    const along = Math.SQRT1_2;

    for (let d = from; d <= metres; d += step) {
        const at = [Math.floor(sx + along * d), Math.floor(sy + along * d)];

        put(me, at);
        me.hp = me.maxHp;
        run(host, 500);

        if (host.caches.size) {
            return { d, at };
        }
    }

    return { d: null, at: [me.x, me.y] };
}

describe("the adventurers' caches (caches.js)", () => {
    it("are kept by brigands of the land they're in, every one with hands (no beasts); outlaws where none's found", () => {
        const random = createRandom(3);

        for (const [id, band] of Object.entries(CACHE_BANDS)) {
            assert.ok(CREATURES[band.leader]?.hands && CREATURES[band.folk]?.hands, id);
            assert.ok(band.lands.every((land) => BIOMES.some((biome) => biome.id === land)), id);
        }

        for (const { id: biome } of BIOMES.filter((each) => !each.water)) {
            const found = Object.keys(CACHE_BANDS).filter((id) => CACHE_BANDS[id].lands.includes(biome));

            assert.ok(found.length, `${biome} has a band`);

            for (let k = 0; k < 20; k++) {
                assert.ok(found.includes(cacheBand(biome, random).id), biome);
            }
        }

        assert.equal(cacheBand("sea", random).id, "bandits");
        // (Where more than one's found, any of them)
        assert.deepEqual(new Set(Array.from({ length: 40 }, () => cacheBand("marsh", random).id)), new Set(["dead", "cultists"]));
    });

    it("is as strong as its land or the mightiest player near it, whichever's the more: three to five keeping it, the most only further out", () => {
        assert.equal(cacheTier(1, 0), 1);
        assert.equal(cacheTier(4, 0), 4);
        assert.equal(cacheTier(2, 5), 6);
        assert.equal(cacheTier(3, 8), 9);
        assert.equal(cacheTier(TIERS, 8), TIERS);

        const random = createRandom(5);
        const counts = (tier) => new Set(Array.from({ length: 80 }, () => cacheCount(tier, random)));

        assert.deepEqual(counts(1), new Set([3]));
        assert.deepEqual(counts(3), new Set([3, 4]));
        assert.deepEqual(counts(5), new Set([3, 4, 5]));
        assert.deepEqual(counts(TIERS), new Set([3, 4, 5]));
    });

    it("has its guards walk a round about it, starting spread along it", () => {
        const round = roundOf([100, 200]);

        assert.equal(round.length, CACHES.stops);
        assert.ok(round.every(([x, y]) => Math.abs(hypot(x - 100, y - 200) - CACHES.round) < 1e-6));
        assert.deepEqual(startsOf(2), [0, 3]);
        assert.deepEqual(startsOf(4), [0, 1, 3, 4]);
        assert.equal(new Set(startsOf(4)).size, 4);
    });

    it("holds some gold and a few pieces of gear as well made as its band was strong (no people's uniform), and a draught most often; the same for the same numbers", () => {
        const random = createRandom(11);
        const makes = (tier) => {
            const seen = {};

            for (let k = 0; k < 200; k++) {
                const { gold, items } = rollCache(tier, random);
                const gear = items.filter(({ id }) => GEAR[id]);

                assert.ok(gold >= Math.round(CACHE_LOOT.gold[0] * (1 + CHEST_GOLD * (tier - 1))) && gold <= Math.round(CACHE_LOOT.gold[1] * (1 + CHEST_GOLD * (tier - 1))), `${tier}: ${gold}`);
                assert.ok(gear.length >= CACHE_LOOT.gear[0] && gear.length <= CACHE_LOOT.gear[1]);
                assert.ok(items.every(({ id }) => GEAR[id] ? CACHE_GEAR.includes(id) && !GEAR[id].uniform : id === "potion"));
                assert.ok(gear.filter(({ id }) => GEAR[id].magic).every(({ boost }) => boost >= 0.1 && boost <= 1), "a wand's boost rolled");

                for (const { quality } of gear) {
                    seen[quality] = (seen[quality] ?? 0) + 1;
                }
            }

            return seen;
        };

        const low = makes(1);
        const high = makes(9);
        const [, highest] = CACHE_MAKES[0];

        assert.ok(low.common > low.fine && !low.legendary, JSON.stringify(low));
        assert.ok(!high.common && !high.fine && Object.keys(high).every((quality) => quality in highest), JSON.stringify(high));
        assert.deepEqual(rollCache(5, createRandom(4)), rollCache(5, createRandom(4)));
    });
});

describe("where a cache may be put (caches.js cacheClear)", () => {
    let plan;
    let world;

    before(() => {
        world = buildWorld({ seed: 2 });
        plan = world.plan;
    });

    it("off the roads by more than its guards walk, out of the settlements and away from the places worth finding, other caches and the water", () => {
        const nearRoad = (x, y, within) => world.maps.town.nearRoad(x, y, within);
        const place = placesOf(plan)[0];
        const town = plan.places[0];

        assert.equal(cacheClear(plan, town.at, { nearRoad }), false, "in a settlement");
        assert.equal(cacheClear(plan, [place.at[0] + 10, place.at[1]], { nearRoad }), false, "by a place");

        // (Out along the walk from the start town, seed 2: wild ground, then a road crossing it)
        const [sx, sy] = world.start.at;
        const wild = Array.from({ length: 200 }, (each, k) => [sx + 300 + k * 7, sy + 300 + ((k * 13) % 90)]).find((at) => cacheClear(plan, at, { nearRoad }));

        assert.ok(wild, "somewhere wild");
        assert.ok(!nearRoad(...wild, CACHES.road + CACHES.round) && !landAt(plan, ...wild).water);
        assert.equal(cacheClear(plan, wild, { nearRoad, others: [[wild[0] + CACHES.apart - 10, wild[1]]] }), false, "by another cache");
        assert.equal(cacheClear(plan, wild, { nearRoad, others: [[wild[0] + CACHES.apart + 10, wild[1]]] }), true);
        assert.equal(cacheClear(plan, wild, { nearRoad: () => true }), false, "by a road");
        assert.equal(cacheClear(plan, [-50, -50], { nearRoad }), false, "off the world: the sea");
        assert.ok(ICON_KINDS.includes("cache"), "marked on the maps");
    });
});

describe("the adventurers' caches in play (host.js #caches)", () => {
    it("one's put out ahead of a player every so far they cross the wilds, off the roads; kept by brigands of the land, three to five, their leader by it two tiers up, the rest walking their round; locked till they fall", () => {
        const context = hosted();
        const { host, world, me } = context;
        const plan = world.plan;
        const { d, at } = walk(context);

        assert.ok(d !== null, "one's put out");

        const [cache] = host.caches.values();
        const travelled = host.travel.get(HOST_PLAYER);
        const off = hypot(cache.at[0] - at[0] - 0.5, cache.at[1] - at[1] - 0.5);

        // (Crossed as far as the least it could be, not further than the most and a step, and
        // counted afresh from there)
        assert.ok(d >= CACHES.every[0] && d <= CACHES.every[1] + 200, `put out after ${d} m`);
        assert.equal(travelled.walked, 0);
        assert.ok(off >= CACHES.ahead[0] - 2 && off <= CACHES.ahead[1] + 2, `${off} m ahead`);
        assert.ok((cache.at[0] - at[0]) * Math.SQRT1_2 + (cache.at[1] - at[1]) * Math.SQRT1_2 > 0, "before them");
        assert.ok(!world.maps.town.nearRoad(...cache.at, CACHES.road + CACHES.round), "off every road, its round and all");

        // Its band: of the land there, as strong as the land (a new adventurer's no mightier)
        const biome = landAt(plan, ...cache.at).biome;
        const band = CACHE_BANDS[cache.band];
        const [leader, ...guards] = cache.ids.map((id) => host.battle.actor(id));

        assert.ok(band.lands.includes(biome), `${cache.band} in the ${biome}`);
        assert.equal(cache.tier, cacheTier(tierAt(cache.at, [world.start.at], biome), 0));
        assert.ok(cache.ids.length >= CACHES.count[0] && cache.ids.length <= CACHES.count[1]);
        assert.equal(leader.wild.creature, band.leader);
        assert.equal(leader.wild.tier, Math.min(TIERS, cache.tier + CACHES.lead));
        assert.ok(hypot(leader.x - cache.at[0], leader.y - cache.at[1]) < 3, "the leader by it");
        assert.ok(guards.every((one) => one.wild.creature === band.folk && one.wild.tier === cache.tier && one.wild.round?.length === CACHES.stops));
        assert.ok([leader, ...guards].every((one) => one.wild.temper === "territorial" && one.wild.guard === CACHES.guard && one.wild.pack === cache.id && host.wild.get(one.id).cache === cache.id));

        // Locked while they keep it
        const chest = host.ground.get(`chest-${cache.id}`);

        assert.ok(chest.chest && chest.locked && chest.until === null);
        put(me, [...chest.square]);
        assert.deepEqual(host.command(HOST_PLAYER, { type: "pickUp", ground: chest.id }), { ok: false, reason: "guarded" });
    });

    it("its guards walk their round, a stop at a time; strike one and those who see it come; put them all down and it's opened, a share for each player there", () => {
        const context = hosted();
        const { host, me } = context;

        walk(context);

        const [cache] = host.caches.values();
        const guard = host.battle.actor(cache.ids[1]);

        // (Watched from out of their reach)
        put(me, [Math.floor(cache.at[0] + 40), Math.floor(cache.at[1])]);

        const stops = new Set();
        const near = [];

        for (let t = 0; t < 40000; t += 500) {
            run(host, 500);
            stops.add(guard.wild.stop);
            near.push(Math.min(...guard.wild.round.map(([x, y]) => hypot(guard.x - x, guard.y - y))));
        }

        assert.ok(stops.size >= 3, `stops ${[...stops]}`);
        assert.ok(near.filter((metres) => metres < 1.5).length > near.length / 4, "standing a while at each");
        assert.ok(near.every((metres) => metres < CACHES.round), "on its round");
        assert.equal(guard.target, null);

        // Their leader struck: the rest who see it, or who struck it, come too (one pack)
        const leader = host.battle.actor(cache.ids[0]);

        put(me, [Math.floor(leader.x) - 1, Math.floor(leader.y)]);
        assert.equal(host.command(HOST_PLAYER, { type: "engage", target: leader.id }).ok, true);

        const struck = run(host, 3000);
        const rest = cache.ids.slice(1).map((id) => host.battle.actor(id));

        assert.ok(struck.some((event) => event.type === "hit" && event.by === HOST_PLAYER && event.id === leader.id), "struck");
        assert.ok(rest.some((one) => one.foes[HOST_PLAYER] > host.battle.time), "the rest come");
        assert.ok(rest.filter((one) => host.battle.canSee(one, leader)).every((one) => one.target === HOST_PLAYER));

        // All put down: it's opened
        put(me, [Math.floor(cache.at[0] + 4), Math.floor(cache.at[1])]);

        for (const id of cache.ids) {
            host.battle.afflict(id, "poison", { by: HOST_PLAYER, damage: 1e7 });
        }

        const events = run(host, 3000);
        const told = events.find((event) => event.type === "spoils" && event.cache);
        const share = host.ground.get(told?.ground);

        assert.ok(cache.opened && !host.ground.has(`chest-${cache.id}`), "the locked chest gone");
        assert.ok(share && share.for === HOST_PLAYER && share.from === "chest" && share.bundle.gold > 0 && share.bundle.items.length >= CACHE_LOOT.gear[0]);
        assert.ok(events.some((event) => event.type === "cache" && event.change === "opened"));

        put(me, [...share.square]);
        assert.equal(host.command(HOST_PLAYER, { type: "pickUp", ground: share.id }).ok, true);
    });

    it("is as strong as a mighty player near it; let go, guards and all, once every player's far", () => {
        const context = hosted();
        const { host, me } = context;
        const player = host.players.get(HOST_PLAYER);

        player.progress.skills.blade = 6000;

        const might = player.progress.might();

        walk(context);

        const [cache] = host.caches.values();

        assert.ok(might >= 5);
        assert.equal(cache.tier, Math.min(TIERS, 1 + might));
        assert.equal(host.battle.actor(cache.ids[0]).wild.tier, Math.min(TIERS, cache.tier + CACHES.lead));

        put(me, [Math.floor(cache.at[0] + CACHES.far + 20), Math.floor(cache.at[1])]);
        run(host, 1000);
        assert.ok(!host.caches.has(cache.id) && !host.ground.has(`chest-${cache.id}`));
        assert.ok(cache.ids.every((id) => !host.wild.has(id) && !host.battle.actor(id)));
    });

    it("counts only the wilds crossed on foot: not ground crossed in a settlement, nor a leap (carried by magic)", () => {
        const context = hosted();
        const { host, world, me } = context;

        // Leaps of 30 m a look: nothing
        walk(context, { metres: 1600, step: 30 });
        assert.equal(host.caches.size, 0);
        assert.ok(host.travel.get(HOST_PLAYER).walked < 1);

        // Round the start town's square: nothing
        const [sx, sy] = world.start.at;

        for (let k = 0; k < 120; k++) {
            put(me, [Math.floor(sx + (k % 2 ? 6 : -6)), Math.floor(sy)]);
            run(host, 500);
        }

        assert.equal(host.caches.size, 0);
        assert.ok(host.travel.get(HOST_PLAYER).walked < 1);
    });

    it("carries on exactly from a snapshot, its band and its round and how far each player's come", () => {
        const context = hosted();
        const { host } = context;

        walk(context);
        assert.equal(host.caches.size, 1);

        const again = Host.restore(buildWorld({ seed: 2 }), decode(encode(host.snapshot())));
        const [id] = host.caches.keys();

        assert.deepEqual([...again.caches.entries()], [...host.caches.entries()]);
        assert.deepEqual([...again.travel.entries()], [...host.travel.entries()]);
        assert.deepEqual(again.ground.get(`chest-${id}`), host.ground.get(`chest-${id}`));

        run(host, 6000);
        run(again, 6000);
        assert.equal(again.checksum(), host.checksum());
        assert.deepEqual(again.battle.actor(host.caches.get(id).ids[1]).wild, host.battle.actor(host.caches.get(id).ids[1]).wild);
    });
});

describe("the caches over many worlds (core/worldplan plan)", () => {
    it("some wild ground in every world fit for one", () => {
        for (const seed of [1, 3]) {
            const plan = planWorld(seed);
            const random = createRandom(seed);
            let found = 0;

            for (let k = 0; k < 400 && found < 5; k++) {
                const at = [random.range(300, 7900), random.range(300, 7900)];

                found += cacheClear(plan, at) ? 1 : 0;
            }

            assert.ok(found >= 5, `seed ${seed}`);
        }
    });
});
