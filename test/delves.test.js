// Dungeons in play (docs/DUNGEONS.md): their ways in seeded across the wilds (core/worldplan
// settle.js), each its theme by the land it's in, laid out as its theme has it
// (setpieces/neutral.js); made as a player comes near (core/insides.js), each level its own map
// joined by stairs; each level's foes woken while a player's on it or the one over it, the slain
// staying slain; the boss's hoard locked till it falls, then a share for each player in the
// dungeon at their own power (core/dungeons/play.js), small chests a share for whoever's by them;
// and once it's cleared and everyone's gone, made again, the next generation (core/host.js)
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { ICON_KINDS } from "../client/js/app/mapicons.js";
import { STEP_MS } from "../client/js/core/battle.js";
import { TIERS } from "../client/js/core/creatures.js";
import { buildDungeon } from "../client/js/core/dungeons/build.js";
import { CHAMPIONS, COFFER, DELVES, foeKey, HOARD, hoardTier, rollCoffer, rollHoard } from "../client/js/core/dungeons/play.js";
import { THEMES, themeFor } from "../client/js/core/dungeons/themes.js";
import { hypot } from "../client/js/core/exact.js";
import { HOST_PLAYER, Host } from "../client/js/core/host.js";
import { DUNGEON_ORIGINS, dungeonLevel } from "../client/js/core/insides.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { CHEST_GOLD } from "../client/js/core/places.js";
import { createRandom } from "../client/js/core/random.js";
import { layoutNeutral } from "../client/js/core/setpieces/neutral.js";
import { decode, encode } from "../client/js/core/wire.js";
import { DUNGEON_SITES } from "../client/js/core/worldplan/settle.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

function run(host, ms, me = null) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        if (me) {
            me.hp = me.maxHp;
        }

        events.push(...host.advance(STEP_MS));
    }

    return events;
}

const put = (actor, [x, y]) => Object.assign(actor, { square: [x, y], x: x + 0.5, y: y + 0.5, path: [], order: null, target: null });

// Through a door or down (or up) a flight: stood where one comes off it on this side, told to go
// through, and played on till they've crossed (or a minute's gone): whether they did
function cross(host, me, link) {
    const end = link.ends.find(({ map }) => map === me.map);

    put(me, end.arrive);
    host.command(HOST_PLAYER, { type: "enter", link: link.id });

    for (let t = 0; t < 60000; t += 250) {
        if (run(host, 250, me).some(({ type, id }) => type === "cross" && id === HOST_PLAYER)) {
            return true;
        }
    }

    return false;
}

describe("dungeons in the wilds (worldplan settle.js)", () => {
    let world;

    before(() => {
        world = buildWorld({ seed: 1 });
    });

    it("seeds about one way in to each square kilometre of dry land, apart from each other, the roads and the other places, each named and themed", () => {
        const { plan } = world;
        const dungeons = plan.sites.filter(({ kind }) => kind === "dungeon");
        const others = plan.sites.filter(({ kind }) => kind !== "dungeon");

        assert.ok(dungeons.length >= 30 && dungeons.length <= 120, `${dungeons.length} dungeons`);
        assert.equal(new Set(dungeons.map(({ name }) => name)).size, dungeons.length, "each its own name");
        assert.deepEqual(new Set(dungeons.map(({ id }) => id)).size, dungeons.length);

        for (const one of dungeons) {
            assert.ok(THEMES[one.theme], one.theme);
            assert.equal(one.race, null);
            assert.equal(plan.water[one.cell[1] * plan.cells + one.cell[0]], 0, `${one.id} on dry land`);

            for (const other of dungeons) {
                assert.ok(other === one || hypot(other.cell[0] - one.cell[0], other.cell[1] - one.cell[1]) >= DUNGEON_SITES.apart, `${one.id} and ${other.id} apart`);
            }

            for (const other of others) {
                assert.ok(hypot(other.cell[0] - one.cell[0], other.cell[1] - one.cell[1]) >= DUNGEON_SITES.sites, `${one.id} clear of ${other.id}`);
            }
        }

        // (All three themes found in one world)
        assert.deepEqual(new Set(dungeons.map(({ theme }) => theme)), new Set(Object.keys(THEMES)));
    });

    it("chooses a theme by the land: caves likeliest in the mountains, a hideout in the woods, a temple in the jungle", () => {
        const likeliest = (land) => {
            const counts = {};

            for (let seed = 1; seed <= 400; seed++) {
                const theme = themeFor(seed, land);

                counts[theme] = (counts[theme] ?? 0) + 1;
            }

            return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
        };

        assert.equal(likeliest("mountain"), "caves");
        assert.equal(likeliest("woods"), "hideout");
        assert.equal(likeliest("jungle"), "ancient");
        assert.equal(themeFor(7, "heath"), themeFor(7, "heath"));
    });

    it("lays out its way in as its theme has it: a mouth in the rock, dressed with what's about a theme's", () => {
        const kinds = (theme) => new Set(layoutNeutral({ kind: "dungeon", seed: 5, theme }).parts.map(({ part }) => part));

        for (const theme of Object.keys(THEMES)) {
            const laid = layoutNeutral({ kind: "dungeon", seed: 5, theme });

            assert.equal(laid.entry.inside, "dungeon");
        }

        assert.ok(kinds("hideout").has("stores") && kinds("hideout").has("timbers"));
        assert.ok(kinds("ancient").has("column"));
        assert.ok(kinds("caves").has("bones"));
    });

    it("has an icon for the maps", () => {
        assert.ok(ICON_KINDS.includes("dungeon"));
    });
});

describe("what's in a dungeon's chests (dungeons/play.js)", () => {
    it("puts a little gold in a small chest, more each tier, now and then a piece of gear or a draught", () => {
        const random = createRandom(3);
        let gear = 0;

        for (let k = 0; k < 200; k++) {
            const tier = 1 + (k % TIERS);
            const { gold, items } = rollCoffer(tier, random);
            const scale = 1 + CHEST_GOLD * (tier - 1);

            assert.ok(gold >= Math.round(COFFER.gold[0] * scale) && gold <= Math.round(COFFER.gold[1] * scale), `${gold} at tier ${tier}`);
            assert.ok(items.length <= 2);
            gear += items.filter(({ id }) => id !== "potion").length;
        }

        assert.ok(gear > 40 && gear < 120, `${gear} pieces of gear in 200`);
    });

    it("fills the hoard with gold, gear made better than a cache's and draughts, at the tier a player's share is at", () => {
        const random = createRandom(4);

        for (let tier = 1; tier <= TIERS; tier++) {
            const { gold, items } = rollHoard(tier, random);
            const potions = items.filter(({ id }) => id === "potion").length;

            assert.ok(gold >= Math.round(HOARD.gold[0] * (1 + CHEST_GOLD * (tier - 1))), `${gold} gold at tier ${tier}`);
            assert.ok(items.length - potions >= HOARD.gear[0] && items.length - potions <= HOARD.gear[1]);
            assert.ok(potions >= HOARD.potions[0] && potions <= HOARD.potions[1]);
        }

        // (A share at the player's own power, or the dungeon's, whichever's higher)
        assert.equal(hoardTier(2, 0), 2);
        assert.equal(hoardTier(2, 4), 5);
        assert.equal(hoardTier(3, 20), TIERS);
        assert.equal(foeKey(1, 2, 3), "1/2/3");
    });
});

describe("a dungeon in play (host.js #dungeons)", () => {
    let world;
    let host;
    let me;
    let site;
    let building;
    let delve;
    let outside;

    before(() => {
        world = buildWorld({ seed: 1 });
        host = new Host(world, { populate: false });
        host.join({ id: HOST_PLAYER, hero: HERO });
        host.populate();
        Object.assign(host.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        me = host.battle.actor(HOST_PLAYER);
        Object.assign(me, { hp: 1e6, maxHp: 1e6 });

        // (The nearest of two levels or more to where the player starts)
        const [sx, sy] = world.start.at;

        site = world.plan.sites
            .filter(({ kind }) => kind === "dungeon")
            .sort((a, b) => hypot(a.at[0] - sx, a.at[1] - sy) - hypot(b.at[0] - sx, b.at[1] - sy))
            .find((one) => buildDungeon({ seed: one.seed, theme: one.theme, tier: 1 }).levels.length >= 2);
        world.maps.town.sites.heartOf(site);
        outside = world.maps.town.sites.set.get(site.id).entrance.outside;
    });

    it("is made as a player comes near its way in, its first level woken and its small chests set out", () => {
        assert.equal(host.dungeons.has(site.id), false);
        put(me, outside);

        const events = run(host, 1500, me);

        delve = host.dungeons.get(site.id);
        building = world.interiors.buildings.get(`site:${site.id}`);

        assert.ok(building.made);
        assert.equal(building.dungeon.theme, site.theme);
        assert.deepEqual(
            building.maps,
            building.dungeon.levels.map((_, k) => dungeonLevel(building.key, 0, k)),
        );
        assert.equal(building.flights.length, building.maps.length - 1);
        assert.ok(delve.awake[0].length > 0, "its first level's foes out");
        assert.ok(delve.awake.slice(1).every((ids) => !ids), "the rest still asleep");
        assert.ok(events.some(({ type }) => type === "roused"));

        // (Its levels well away from every other inside, one under another)
        for (const id of building.maps) {
            assert.ok(world.maps[id].origin[0] >= DUNGEON_ORIGINS.x);
            assert.ok(world.maps[id].dungeon);
        }

        const level = building.dungeon.levels[0];
        const chests = [...host.ground.values()].filter(({ dungeon, map }) => dungeon === site.id && map === building.maps[0]);

        assert.equal(chests.length, level.chests.length);
        assert.ok(chests.every(({ chest, locked }) => chest && !locked));

        // (Its boss and its mini-bosses stand out from their kind)
        const champions = [...host.wild.values()].filter(({ dungeon, champion }) => dungeon === site.id && champion);

        assert.ok(champions.length === 0 || champions.every(({ champion }) => CHAMPIONS[champion]));
    });

    it("is gone into by its way in, and down its stairs, each level woken as a player comes onto it or the one over it, the one above that let go", () => {
        assert.ok(cross(host, me, building.door));
        assert.equal(me.map, building.maps[0]);

        building.flights.forEach((flight, k) => {
            assert.ok(cross(host, me, flight), `down to level ${k + 2}`);
            run(host, 1000, me);
            assert.equal(me.map, building.maps[k + 1]);
            assert.ok(delve.awake[k + 1]?.length > 0, `level ${k + 2} woken`);
            assert.ok(delve.awake[k]?.length > 0, `level ${k + 1} awake over the player`);

            if (k > 0) {
                assert.equal(delve.awake[k - 1], null, `level ${k} let go`);
            }
        });

        // (Its boss on the bottom level, a mighty one of its kind)
        const [id, boss] = [...host.wild].find(([, one]) => one.dungeon === site.id && one.champion === "boss");

        assert.equal(host.battle.actor(id).map, building.maps.at(-1));
        assert.equal(host.battle.actor(id).name, boss.title ?? host.battle.actor(id).name);
    });

    it("keeps its boss's hoard locked till the boss falls", () => {
        const hoard = [...host.ground.values()].find(({ dungeon, hoard: kept }) => dungeon === site.id && kept);
        const [id] = [...host.wild].find(([, one]) => one.dungeon === site.id && one.champion === "boss");

        assert.equal(hoard.locked, true);
        put(me, [hoard.square[0], hoard.square[1] + 1]);
        assert.equal(host.command(HOST_PLAYER, { type: "pickUp", ground: hoard.id }).ok, false);

        host.battle.afflict(id, "poison", { by: HOST_PLAYER, damage: 1e7 });

        const events = run(host, 2000, me);

        assert.ok(host.battle.actor(id)?.dead ?? true);
        assert.equal(hoard.locked, false);
        assert.ok(events.some(({ type, site: where, change, boss }) => type === "dungeon" && where === site.id && change === "boss" && boss));
        assert.ok(delve.dead.some((key) => key.startsWith(`${building.maps.length - 1}/`)));
    });

    it("gives a share of a small chest to whoever's by it when it's opened", () => {
        const chest = [...host.ground.values()].find(({ dungeon, coffer, hoard, map }) => dungeon === site.id && coffer && !hoard && map === me.map);

        if (!chest) {
            return;
        }

        put(me, [chest.square[0], chest.square[1] + 1]);
        assert.ok(host.command(HOST_PLAYER, { type: "pickUp", ground: chest.id }).ok);

        const events = run(host, 250, me);
        const share = events.find(({ type, from }) => type === "spoils" && from === chest.id);

        assert.equal(share.dungeon, site.id);
        assert.ok(host.ground.get(share.ground).bundle.gold > 0);
        assert.ok(delve.opened.includes(chest.coffer));
    });

    it("gives a share of the hoard to each player in the dungeon at their own power, and is cleared", () => {
        const hoard = [...host.ground.values()].find(({ dungeon, hoard: kept }) => dungeon === site.id && kept);

        put(me, [hoard.square[0], hoard.square[1] + 1]);
        assert.ok(host.command(HOST_PLAYER, { type: "pickUp", ground: hoard.id }).ok);

        const events = run(host, 250, me);
        const share = events.find(({ type, from }) => type === "spoils" && from === hoard.id);
        const { bundle } = host.ground.get(share.ground);

        assert.equal(share.hoard, true);
        assert.ok(bundle.gold >= HOARD.gold[0]);
        assert.ok(bundle.items.length >= HOARD.gear[0] + HOARD.potions[0]);
        assert.equal(delve.cleared, true);
        assert.ok(events.some(({ type, change }) => type === "dungeon" && change === "cleared"));
    });

    it("is kept in a snapshot, and taken up again as it was, the player still in it", () => {
        const again = Host.restore(buildWorld({ seed: 1 }), decode(encode(host.snapshot())));
        const theirs = again.dungeons.get(site.id);

        assert.deepEqual(theirs, delve);
        assert.ok(again.world.maps[me.map], "the level the player's on made again");
        assert.equal(again.battle.actor(HOST_PLAYER).map, me.map);
        assert.deepEqual(again.world.maps[me.map].plan, world.maps[me.map].plan);
    });

    it("is made again once it's cleared and everyone's gone from it: the next generation, its slain and its chests forgotten", () => {
        const first = world.maps[building.maps[0]].plan.join("\n");

        for (const flight of [...building.flights].reverse()) {
            assert.ok(cross(host, me, flight));
        }

        assert.ok(cross(host, me, building.door));
        assert.equal(me.map, "town");

        put(me, [outside[0] + DELVES.far + 30, outside[1]]);

        const events = run(host, 2000, me);

        assert.ok(events.some(({ type, site: where, change }) => type === "dungeon" && where === site.id && change === "remade"));
        assert.equal(delve.generation, 1);
        assert.deepEqual({ awake: delve.awake, dead: delve.dead, opened: delve.opened, cleared: delve.cleared }, { awake: [], dead: [], opened: [], cleared: false });
        assert.equal(building.door.ends[1].map, dungeonLevel(building.key, 1, 0));
        assert.ok(!Object.keys(world.maps).some((id) => id.startsWith(`${building.key}/level-`)), "the old levels gone");
        assert.ok(![...host.wild.values()].some(({ dungeon }) => dungeon === site.id));
        assert.ok(![...host.ground.values()].some(({ dungeon }) => dungeon === site.id));

        // (And coming back, a new one: other rooms, other foes)
        put(me, outside);
        run(host, 1500, me);
        assert.ok(building.made);
        assert.equal(building.maps[0], dungeonLevel(building.key, 1, 0));
        assert.notEqual(world.maps[building.maps[0]].plan.join("\n"), first);
        assert.ok(delve.awake[0]?.length > 0);
    });
});
