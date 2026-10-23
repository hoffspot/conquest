// Treasure maps (client/js/core/treasure.js; in play, core/host.js #treasures): a map in every make
// gear comes in, found now and then in chests and a common one sold at the adventurers' guild;
// read out in the world, it marks a circle to search for its reader and their party, the rarer the
// further off, the wider, and the more and the fiercer those keeping it; they wake as a hunter
// comes near; put down, it's dug up, a share for each of the party there or who fought for it
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { CACHE_BANDS, cacheClear, CACHES, cacheTier } from "../client/js/core/caches.js";
import { ELITES, tierAt, TIERS } from "../client/js/core/creatures.js";
import { hypot } from "../client/js/core/exact.js";
import { HOST_PLAYER, Host, SNAPSHOT_STEPS, SNAPSHOT_VERSION } from "../client/js/core/host.js";
import { wayAcross } from "../client/js/core/journey.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { gradeOf, itemLabel, ITEMS, priceOf, QUALITIES, wareKind, wares } from "../client/js/core/progress.js";
import { createRandom } from "../client/js/core/random.js";
import { foundMap, gradeOfMap, huntersOf, MAP_FINDS, MAP_GRADES, MAP_MAKES, nearTreasure, placeTreasure, rollTreasure, TREASURE, TREASURE_MAP, treasureCount, TREASURES, treasureTier, withMap } from "../client/js/core/treasure.js";
import { decode, encode } from "../client/js/core/wire.js";
import { landAt } from "../client/js/core/worldplan/plan.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

function run(host, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...host.advance(STEP_MS));
    }

    return events;
}

const put = (actor, [x, y]) => Object.assign(actor, { square: [x, y], x: x + 0.5, y: y + 0.5, path: [], order: null, target: null });

// A world (seed 2) with its player in it out of the start town, hard to kill, the orc gone; and
// another player there (`guest`), if wanted
function hosted({ guest = false } = {}) {
    const world = buildWorld({ seed: 2 });
    const host = new Host(world, { populate: false });

    host.join({ id: HOST_PLAYER, hero: HERO });

    if (guest) {
        host.join({ id: "guest", hero: { ...HERO, name: "Bram" } });
    }

    host.populate();
    Object.assign(host.battle.actor("orc"), { dead: true, respawnAt: Infinity });

    const [sx, sy] = world.start.at;

    for (const id of guest ? [HOST_PLAYER, "guest"] : [HOST_PLAYER]) {
        const actor = host.battle.actor(id);

        Object.assign(actor, { hp: 1e6, maxHp: 1e6 });
        put(actor, [Math.floor(sx + 200), Math.floor(sy + 200) + (id === HOST_PLAYER ? 0 : 3)]);
    }

    run(host, 500);

    return { host, world, me: host.battle.actor(HOST_PLAYER) };
}

// A map of a make given a player and read where they stand: what was said, and the treasure
function read(host, id, quality = "common") {
    const progress = host.players.get(id).progress;

    progress.stow({ id: TREASURE_MAP, quality }, 1);

    const said = host.command(id, { type: "use", index: progress.slotOf(TREASURE_MAP) });

    return { said, treasure: [...host.treasures.values()].at(-1) ?? null };
}

// Someone set by a treasure's circle, just inside where its keepers wake (TREASURE.rouse)
function nearIt(actor, treasure) {
    const [dx, dy] = [actor.x - treasure.centre[0], actor.y - treasure.centre[1]];
    const d = hypot(dx, dy) || 1;
    const reach = treasure.radius + TREASURE.rouse - 5;

    put(actor, [Math.floor(treasure.centre[0] + (dx / d) * reach), Math.floor(treasure.centre[1] + (dy / d) * reach)]);
}

// Every one of a treasure's keepers put down by a player (and any more who came, against a party:
// strength.js REINFORCE), what was told meanwhile
function putDown(host, treasure, by = HOST_PLAYER) {
    const cache = host.caches.get(treasure.cache);
    const events = [];

    for (let round = 0; round < 5 && cache.ids.some((id) => !host.battle.actor(id)?.dead); round++) {
        for (const id of cache.ids) {
            host.battle.afflict(id, "poison", { by, damage: 1e7 });
        }

        events.push(...run(host, 3000));
    }

    return events;
}

describe("a treasure map (progress.js ITEMS, core/treasure.js)", () => {
    it("comes in every make gear does, named and shown in its make's colour, worth more the rarer; read, and kept with the tomes and scrolls", () => {
        const def = ITEMS[TREASURE_MAP];

        assert.ok(def.map && def.use.treasure && def.about);
        assert.deepEqual(MAP_GRADES, Object.keys(QUALITIES));
        assert.deepEqual(Object.keys(TREASURES), MAP_GRADES);
        assert.equal(itemLabel({ id: TREASURE_MAP, quality: "common" }), "Treasure map");
        assert.equal(itemLabel({ id: TREASURE_MAP, quality: "rare" }), "Rare treasure map");
        assert.equal(itemLabel({ id: TREASURE_MAP, quality: "legendary" }), "Legendary treasure map");

        for (const quality of MAP_GRADES) {
            assert.equal(gradeOf({ id: TREASURE_MAP, quality }), quality);
        }

        const prices = MAP_GRADES.map((quality) => priceOf({ id: TREASURE_MAP, quality }));

        assert.ok(prices.every((price, k) => k === 0 || price > prices[k - 1]), `${prices}`);
        assert.equal(wareKind(TREASURE_MAP), "tome");
        assert.equal(gradeOfMap("nonsense"), "common");
    });

    it("is sold at the adventurers' guild, only ever common; and nowhere else", () => {
        assert.deepEqual(wares("guild").filter(({ id }) => id === TREASURE_MAP), [{ id: TREASURE_MAP, quality: "common" }]);
        assert.equal(priceOf({ id: TREASURE_MAP, quality: "common" }), ITEMS[TREASURE_MAP].price);

        for (const shop of ["smith", "alchemist", "scriptorium", "emporium", "arcane", "abbey", "tavern", "temple"]) {
            assert.ok(!wares(shop).some(({ id }) => id === TREASURE_MAP), shop);
        }
    });

    it("leads the further, the wider its circle, the more and the fiercer keeping it, and the richer, the rarer it is: an elite leading them from very rare on, a prize as well made as the map from fine on", () => {
        const specs = MAP_GRADES.map((quality) => TREASURES[quality]);
        const rising = (of) => specs.every((spec, k) => k === 0 || of(spec) >= of(specs[k - 1]));

        assert.ok(rising(({ reach }) => reach[0]) && rising(({ reach }) => reach[1]) && rising(({ radius }) => radius));
        assert.ok(rising(({ count }) => count[1]) && rising(({ up }) => up) && rising(({ gold }) => gold));
        assert.ok(specs.every(({ reach, count, radius }) => reach[0] < reach[1] && count[0] <= count[1] && count[0] >= CACHES.count[0] && radius > TREASURE.seen));
        assert.deepEqual(
            MAP_GRADES.filter((quality) => TREASURES[quality].elite),
            ["veryRare", "legendary"],
        );
        assert.deepEqual(
            MAP_GRADES.map((quality) => TREASURES[quality].prize),
            [null, "fine", "masterwork", "rare", "veryRare", "legendary"],
        );

        // (Its keepers' tier: a cache's there, and its make's more, never past the last)
        assert.equal(treasureTier(2, 0, "common"), cacheTier(2, 0));
        assert.equal(treasureTier(2, 0, "legendary"), cacheTier(2, 0) + TREASURES.legendary.up);
        assert.equal(treasureTier(TIERS, 8, "legendary"), TIERS);

        const random = createRandom(4);

        for (const quality of MAP_GRADES) {
            for (let k = 0; k < 20; k++) {
                const count = treasureCount(quality, random);

                assert.ok(count >= TREASURES[quality].count[0] && count <= TREASURES[quality].count[1], `${quality}: ${count}`);
            }
        }
    });

    it("holds gold, gear, a draught, a prize as well made as the map from fine on, and now and then another map; the richer the rarer the map and the further out; the same for the same numbers", () => {
        const gold = (quality, tier) => {
            const random = createRandom(9);
            let sum = 0;

            for (let k = 0; k < 40; k++) {
                sum += rollTreasure(tier, quality, random).gold;
            }

            return sum;
        };

        assert.ok(gold("fine", 1) > gold("common", 1) && gold("legendary", 1) > gold("rare", 1));
        assert.ok(gold("common", 6) > gold("common", 1));

        const random = createRandom(11);
        let maps = 0;

        for (const quality of MAP_GRADES) {
            for (let k = 0; k < 60; k++) {
                const { items } = rollTreasure(3, quality, random);
                const gear = items.filter(({ id }) => ITEMS[id].slot);
                const prize = TREASURES[quality].prize;

                assert.ok(gear.length >= TREASURES[quality].gear[0] + (prize ? 1 : 0) && gear.length <= TREASURES[quality].gear[1] + (prize ? 1 : 0), `${quality}: ${gear.length}`);
                assert.ok(items.some(({ id }) => id === "potion"));
                assert.ok(!prize || gear.some((item) => item.quality === prize), `${quality}'s prize`);

                for (const map of items.filter(({ id }) => id === TREASURE_MAP)) {
                    maps++;
                    assert.ok(MAP_GRADES.indexOf(map.quality) - MAP_GRADES.indexOf(quality) <= 1 && MAP_GRADES.indexOf(map.quality) >= MAP_GRADES.indexOf(quality), `${quality} → ${map.quality}`);
                }
            }
        }

        assert.ok(maps > 0 && maps < 6 * 60 * 0.3, `${maps} maps in 360`);
        assert.deepEqual(rollTreasure(5, "rare", createRandom(3)), rollTreasure(5, "rare", createRandom(3)));
    });
});

describe("treasure maps found in chests (core/treasure.js MAP_FINDS, foundMap, withMap)", () => {
    it("now and then, a hoard's more often; as well made as the chest's tier has it, the rarer the further out", () => {
        assert.ok(Object.values(MAP_FINDS).every((chance) => chance > 0 && chance < 1));
        assert.ok(MAP_FINDS.hoard > MAP_FINDS.chest && MAP_FINDS.greatHoard > MAP_FINDS.hoard);
        assert.ok(MAP_MAKES.every(([, makes]) => Math.abs(Object.values(makes).reduce((sum, share) => sum + share, 0) - 1) < 1e-9));

        const random = createRandom(5);
        const made = (tier) => Array.from({ length: 400 }, () => foundMap(tier, random).quality);

        assert.ok(made(1).every((quality) => ["common", "fine"].includes(quality)));
        assert.ok(made(4).every((quality) => ["common", "fine", "masterwork"].includes(quality)));

        const far = made(9);

        assert.ok(far.every((quality) => ["rare", "veryRare", "legendary"].includes(quality)) && far.includes("legendary"));
        assert.ok(foundMap(1, random).id === TREASURE_MAP);
    });

    it("put in a share as often as its chest's kind has it, before an old relic of the dead's", () => {
        const random = createRandom(6);
        let found = 0;

        for (let k = 0; k < 2000; k++) {
            const bundle = withMap({ gold: 10, items: [{ id: "potion", quality: "common" }] }, "chest", 1, random);

            found += bundle.items.filter(({ id }) => id === TREASURE_MAP).length;
        }

        assert.ok(Math.abs(found / 2000 - MAP_FINDS.chest) < 0.03, `${found} in 2000`);

        // (A relic stays the last thing in it)
        const lucky = { next: () => 0, chance: () => true, int: (least) => least, range: (least) => least };
        const relic = withMap({ gold: 10, items: [{ id: "potion" }, { id: "amulet", name: "Reliquary of Old" }] }, "chest", 1, lucky, { relic: true });

        assert.deepEqual(relic.items.map(({ id }) => id), ["potion", TREASURE_MAP, "amulet"]);
    });
});

describe("where a treasure map leads (core/treasure.js placeTreasure)", () => {
    it("as far off as its make has it, any way, where a cache could be, with a way there across the world; its circle round it, the spot well inside it", () => {
        const world = buildWorld({ seed: 2 });
        const plan = world.plan;
        const overworld = world.maps.town;
        const from = [world.start.at[0] + 200, world.start.at[1] + 200];
        const nearRoad = (x, y, within) => overworld.nearRoad(x, y, within);
        const random = createRandom(8);
        const angles = new Set();

        for (const quality of MAP_GRADES) {
            for (let k = 0; k < 4; k++) {
                const found = placeTreasure(plan, from, quality, random, { nearRoad });
                const { reach, radius } = TREASURES[quality];

                assert.ok(found, `${quality}: somewhere`);

                const far = hypot(found.at[0] - from[0], found.at[1] - from[1]);

                assert.ok(far >= reach[0] - 1 && far <= reach[1] + 1, `${quality}: ${far} m`);
                assert.equal(found.radius, radius);
                assert.ok(hypot(found.at[0] - found.centre[0], found.at[1] - found.centre[1]) <= radius * 0.65 + 1e-9, "the spot inside the circle");
                assert.ok(cacheClear(plan, found.at, { nearRoad }) && !landAt(plan, ...found.at).water, "where a cache could be");
                assert.ok(wayAcross(plan, from, found.at), "a way there");
                angles.add(Math.round(Math.atan2(found.at[1] - from[1], found.at[0] - from[0]) * 2));
            }
        }

        assert.ok(angles.size >= 4, "any way");
    });

    it("never near another treasure, nor off the world, nor in the sea; nowhere at all from out at sea", () => {
        const world = buildWorld({ seed: 2 });
        const plan = world.plan;
        const from = [world.start.at[0] + 200, world.start.at[1] + 200];
        const first = placeTreasure(plan, from, "common", createRandom(1));
        const random = createRandom(2);

        for (let k = 0; k < 10; k++) {
            const next = placeTreasure(plan, from, "common", random, { others: [first.at] });

            assert.ok(!next || hypot(next.at[0] - first.at[0], next.at[1] - first.at[1]) >= CACHES.apart);
        }

        assert.equal(placeTreasure(plan, [30, 30], "legendary", createRandom(3)), null);
    });
});

describe("treasure hunted (host.js #treasures)", () => {
    it("read out in the world, it's marked for its reader, as far off as its make has it, its keepers as strong as the land there; the map gone", () => {
        const { host, world, me } = hosted();
        const { said, treasure } = read(host, HOST_PLAYER, "rare");
        const events = run(host, 200);

        assert.deepEqual(said, { ok: true });
        assert.ok(treasure && treasure.owner === HOST_PLAYER && treasure.name === "Ada" && treasure.grade === "rare");
        assert.equal(host.players.get(HOST_PLAYER).progress.count(TREASURE_MAP), 0, "the map gone");

        const far = hypot(treasure.at[0] - me.x, treasure.at[1] - me.y);
        const land = landAt(world.plan, ...treasure.at);

        assert.ok(far >= TREASURES.rare.reach[0] - 2 && far <= TREASURES.rare.reach[1] + 2, `${far} m`);
        assert.equal(treasure.tier, treasureTier(tierAt(treasure.at, [world.start.at], land.biome), 0, "rare"));
        assert.ok(CACHE_BANDS[treasure.band] && treasure.cache === null && treasure.spot === null);
        assert.ok(events.some((event) => event.type === "treasure" && event.change === "marked" && event.id === HOST_PLAYER && event.grade === "rare" && event.radius === TREASURES.rare.radius));
        assert.deepEqual(host.treasuresOf(HOST_PLAYER), [treasure]);
    });

    it("refused indoors, and once its reader's on the trail of three of their own; the map kept", () => {
        const { host, me } = hosted();

        for (let k = 0; k < TREASURE.most; k++) {
            assert.equal(read(host, HOST_PLAYER).said.ok, true);
        }

        assert.deepEqual(read(host, HOST_PLAYER).said, { ok: false, reason: "hunting" });
        assert.equal(host.players.get(HOST_PLAYER).progress.count(TREASURE_MAP), 1, "the map kept");
        assert.equal(host.treasures.size, TREASURE.most);

        // (Given up, one more can be read)
        const [first] = host.treasures.keys();

        assert.deepEqual(host.command(HOST_PLAYER, { type: "treasure", do: "abandon", treasure: first }), { ok: true });
        assert.equal(host.command(HOST_PLAYER, { type: "use", index: host.players.get(HOST_PLAYER).progress.slotOf(TREASURE_MAP) }).ok, true);

        // (Indoors: not read)
        me.map = "inside";
        assert.deepEqual(read(host, HOST_PLAYER).said, { ok: false, reason: "unsheltered" });
    });

    it("its keepers wake only once one of its hunters comes near its circle: of the land's brigands, as many and as fierce as its make has it, an elite leading a legendary's", () => {
        const { host, me } = hosted();
        const { treasure } = read(host, HOST_PLAYER, "legendary");

        // (Not yet: they're far off)
        run(host, 2000);
        assert.equal(treasure.cache, null);
        assert.equal(nearTreasure(treasure, [me.x, me.y]), false);

        nearIt(me, treasure);

        const events = run(host, 1000);
        const cache = host.caches.get(treasure.cache);

        assert.ok(cache && cache.treasure === treasure.id && treasure.spot, "woken, about where it's buried");
        assert.ok(hypot(treasure.spot[0] - treasure.at[0], treasure.spot[1] - treasure.at[1]) <= TREASURE.shift + 1);
        assert.ok(events.some((event) => event.type === "treasure" && event.change === "roused" && event.by === HOST_PLAYER));
        assert.ok(!host.ground.has(`chest-${cache.id}`), "buried: no chest to see");

        const [leader, ...rest] = cache.ids.map((id) => host.battle.actor(id));
        const band = CACHE_BANDS[treasure.band];

        assert.ok(cache.ids.length >= TREASURES.legendary.count[0], `${cache.ids.length} keep it`);
        assert.ok(leader.wild.elite && host.wild.get(leader.id).elite === "lead", "an elite leads them");
        assert.ok(leader.maxHp > rest[0].maxHp * ELITES.hp, "much the strongest");
        assert.ok(rest.every((one) => one.wild.creature === band.folk && one.wild.tier === treasure.tier));
    });

    it("dug up once they're all down: a share for each of its reader's party there, or who fought for it; none for another player there; and the hunt's done", () => {
        const { host, me } = hosted({ guest: true });
        const guest = host.battle.actor("guest");

        host.join({ id: "stranger", hero: { ...HERO, name: "Cora" } });
        Object.assign(host.battle.actor("stranger"), { hp: 1e6, maxHp: 1e6 });

        assert.equal(host.command(HOST_PLAYER, { type: "party", do: "invite", who: "guest" }).ok, true);
        assert.equal(host.command("guest", { type: "party", do: "accept" }).ok, true);
        run(host, 200);

        const { treasure } = read(host, HOST_PLAYER, "fine");

        // (Marked for the party too, and woken by the guest)
        assert.deepEqual(host.treasuresOf("guest"), [treasure]);
        assert.deepEqual(host.treasuresOf("stranger"), []);
        assert.deepEqual(huntersOf(treasure, ["guest", "stranger", HOST_PLAYER], (id) => host.fellows(id)), ["guest", HOST_PLAYER]);
        nearIt(guest, treasure);
        put(me, [...guest.square]);
        run(host, 1000);
        assert.ok(treasure.cache);

        const cache = host.caches.get(treasure.cache);

        for (const id of ["guest", HOST_PLAYER, "stranger"]) {
            put(host.battle.actor(id), [Math.floor(cache.at[0] + 4), Math.floor(cache.at[1]) + (id === "stranger" ? 2 : 0)]);
        }

        const events = putDown(host, treasure);
        const shares = events.filter((event) => event.type === "spoils" && event.treasure);

        assert.deepEqual(shares.map(({ id }) => id).sort(), ["guest", HOST_PLAYER].sort(), "the party's, not the stranger's");
        assert.ok(shares.every(({ treasure: grade, ground }) => grade === "fine" && host.ground.get(ground).bundle.items.some((item) => item.quality === "fine" && ITEMS[item.id].slot)));
        assert.ok(shares.every(({ ground }) => host.ground.get(ground).from === "chest"));
        assert.equal(host.treasures.size, 0, "the hunt's done");
        assert.ok(events.some((event) => event.type === "treasure" && event.change === "found" && event.shared.length === 2));

        put(me, [...host.ground.get(shares.find(({ id }) => id === HOST_PLAYER).ground).square]);
        assert.equal(host.command(HOST_PLAYER, { type: "pickUp", ground: shares.find(({ id }) => id === HOST_PLAYER).ground }).ok, true);
    });

    it("its keepers let go once every player's far, the treasure kept, to wake again; given up, they're let go; only its reader's to give up", () => {
        const { host, me } = hosted({ guest: true });
        const { treasure } = read(host, HOST_PLAYER);

        nearIt(me, treasure);
        run(host, 1000);

        const first = treasure.cache;

        assert.ok(first);
        put(me, [Math.floor(treasure.centre[0] + 600), Math.floor(treasure.centre[1])]);
        put(host.battle.actor("guest"), [Math.floor(treasure.centre[0] + 603), Math.floor(treasure.centre[1])]);
        run(host, 6000);
        assert.ok(!host.caches.has(first) && host.treasures.has(treasure.id), "let go, the treasure kept");

        nearIt(me, treasure);
        run(host, 1000);
        assert.ok(treasure.cache && treasure.cache !== first, "woken again");

        const ids = host.caches.get(treasure.cache).ids;

        assert.deepEqual(host.command("guest", { type: "treasure", do: "abandon", treasure: treasure.id }), { ok: false, reason: "treasure" });
        assert.deepEqual(host.command(HOST_PLAYER, { type: "treasure", do: "abandon", treasure: treasure.id }), { ok: true });
        run(host, 500);
        assert.equal(host.treasures.size, 0);
        assert.ok(ids.every((id) => !host.wild.has(id) || host.battle.actor(id)?.dead), "its keepers let go");
    });

    it("carries on exactly from a snapshot, a hunt and its keepers and all; a world kept before there were any brought forward with none", () => {
        const { host, me } = hosted();
        const { treasure } = read(host, HOST_PLAYER, "masterwork");

        nearIt(me, treasure);
        run(host, 1000);

        const copy = Host.restore(buildWorld({ seed: 2 }), decode(encode(host.snapshot())));

        assert.deepEqual([...copy.treasures.entries()], [...host.treasures.entries()]);
        assert.equal(copy.nextTreasure, host.nextTreasure);
        run(host, 3000);
        run(copy, 3000);
        assert.deepEqual(copy.snapshot().treasures, host.snapshot().treasures);
        assert.equal(copy.checksum(), host.checksum());

        // (Kept in snapshots from version 32 on)
        assert.ok(SNAPSHOT_VERSION >= 32);

        const forward = SNAPSHOT_STEPS[31]({ version: 31, players: [] });

        assert.deepEqual([forward.version, forward.treasures, forward.nextTreasure], [32, [], 1]);
    });
});
