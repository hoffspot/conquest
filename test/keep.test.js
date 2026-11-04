// Bellhaven's keep (docs/DUNGEONS.md *Bellhaven's keep*): a dungeon of its own behind the keep's
// doors off its castle's court (core/scenery.js SCENERY.bellhaven `keep`), four floors going up
// (themes.js keep: each its own, its way on a stair up, the next come into at the head of a stair
// down), a warden on each floor below the belfry barring its stair up till it falls, the last of
// the Order's masters before his hoard at the top, and beyond him a stair down out to the keep's
// doors; never dealt to a wild dungeon's way in
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { buildDungeon } from "../client/js/core/dungeons/build.js";
import { foeKey } from "../client/js/core/dungeons/play.js";
import { realmOf, themeFor, THEMES } from "../client/js/core/dungeons/themes.js";
import { HOST_PLAYER, Host, REFUSALS } from "../client/js/core/host.js";
import { KEEP_ORIGINS } from "../client/js/core/insides.js";
import { routeBetween } from "../client/js/core/interiors.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { keepSiteOf, SCENERY, sceneryKeep, squareIn } from "../client/js/core/scenery.js";
import { BIOMES } from "../client/js/core/worldplan/plan.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });
const KEEP = THEMES.keep;
const SEEDS = [3, 7, 11, 19, 23];

function run(host, ms, me) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        me.hp = me.maxHp;
        events.push(...host.advance(STEP_MS));
    }

    return events;
}

const put = (actor, [x, y]) => Object.assign(actor, { square: [x, y], x: x + 0.5, y: y + 0.5, path: [], order: null, target: null });

// Through a way: stood where one comes off it on this side, told to go through, and played on
// till they've crossed (or a minute's gone): whether they did, and whether the host would have it
function cross(host, me, link) {
    const end = link.ends.find(({ map }) => map === me.map);

    put(me, end.arrive);

    const told = host.command(HOST_PLAYER, { type: "enter", link: link.id });

    if (!told.ok) {
        return told;
    }

    for (let t = 0; t < 60000; t += 250) {
        if (run(host, 250, me).some(({ type, id }) => type === "cross" && id === HOST_PLAYER)) {
            return { ok: true };
        }
    }

    return { ok: false, reason: "never crossed" };
}

const at = (rows, char) => rows.flatMap((row, y) => [...row].flatMap((each, x) => (each === char ? [[x, y]] : [])));

describe("Bellhaven's keep, a dungeon (core/dungeons/themes.js keep)", () => {
    it("is four floors going up, each its own: its way in a stair down from the floor below, its way on a stair up, a warden barring each but the belfry's, and the boss at the top, beyond him a stair down out", () => {
        assert.equal(KEEP.wild, false);
        assert.equal(KEEP.levels, 4);
        assert.equal(KEEP.rises, true);

        for (const seed of SEEDS) {
            const dungeon = buildDungeon({ seed, theme: "keep", tier: 5 });

            assert.equal(dungeon.levels.length, 4);
            assert.equal(dungeon.name, "the Keep of Bellhaven");
            dungeon.levels.forEach((level, k) => {
                const { rows } = level;
                const last = k === 3;

                assert.equal(level.realm, KEEP.realms[k].id);
                // (Come into: the front doors on the first floor; on the rest, the head of a stair
                // down from the floor below, at the middle of its south edge)
                if (k === 0) {
                    assert.equal(at(rows, "D").length, 2, `${seed}/${k}`);
                } else {
                    const head = level.entry.squares;

                    assert.equal(head.length, 2);
                    assert.ok(head.every(([x, y]) => rows[y][x] === ">" && rows[y + 1][x] === "V"), `${seed}/${k}: come up by a stair down`);
                }

                // (Its way on, up; none of the stairs going down but where it's come into, and,
                // at the top, the way out beyond its master)
                assert.equal(at(rows, "^").length, last ? 0 : 6, `${seed}/${k}`);
                assert.equal(at(rows, "<").length, last ? 0 : 2, `${seed}/${k}`);
                assert.equal(at(rows, "V").length, (k ? 6 : 0) + (last ? 6 : 0), `${seed}/${k}`);

                if (!last) {
                    assert.ok(level.down.squares.every(([x, y]) => rows[y][x] === "<"));
                    assert.ok(level.packs.some(({ role, foes }) => role === "warden" && foes[0].creature === KEEP.realms[k].warden.creature), `${seed}/${k}: its warden`);
                } else {
                    assert.equal(level.down, null);
                    assert.ok(level.exit.squares.every(([x, y]) => rows[y][x] === ">"));
                    assert.ok(level.packs.some(({ role }) => role === "boss"));
                    assert.ok(level.chests.some(({ kind }) => kind === "hoard"));
                    assert.ok(!level.packs.some(({ role }) => role === "warden"), "the belfry has its master, no warden");
                }
            });

            // (The same for the same seed)
            assert.deepEqual(buildDungeon({ seed, theme: "keep", tier: 5 }).levels.map(({ rows }) => rows), dungeon.levels.map(({ rows }) => rows));
        }
    });

    it("has packs for every tier on every floor, and is never a wild dungeon's", () => {
        for (let k = 0; k < 4; k++) {
            const { packs } = realmOf(KEEP, k);

            for (let tier = 1; tier <= 10; tier++) {
                assert.ok(buildDungeon({ seed: 5, theme: "keep", tier }).levels[k].packs.length > 0, `floor ${k + 1}, tier ${tier}`);
            }

            assert.ok(packs.length >= 4);
        }

        for (const land of Object.keys(BIOMES)) {
            for (let seed = 1; seed <= 40; seed++) {
                assert.notEqual(themeFor(seed, land), "keep");
            }
        }
    });
});

describe("Bellhaven's keep gone into by its doors off its court (core/insides.js, host.js)", () => {
    let world;
    let host;
    let me;
    let castle;
    let keep;
    let site;

    before(() => {
        world = buildWorld({ seed: 1 });
        host = new Host(world, { populate: false });
        host.join({ id: HOST_PLAYER, hero: HERO });
        me = host.battle.actor(HOST_PLAYER);
        Object.assign(me, { hp: 1e6, maxHp: 1e6 });

        const scene = world.plan.sites.find(({ scenery }) => scenery === "bellhaven");

        castle = world.interiors.buildings.get(`site:${scene.id}`);
        site = keepSiteOf(scene);
        keep = world.interiors.buildings.get(`site:${site.id}`);
        world.interiors.make(castle.key);
    });

    it("is a dungeon of its own beside its castle, its doors on the castle's map before the keep, its floors made the first time they're wanted", () => {
        const [outside, inside] = keep.door.ends;
        const ways = sceneryKeep("bellhaven");

        assert.ok(SCENERY.bellhaven.keep);
        assert.equal(keep.kind, "dungeon");
        assert.equal(keep.theme, "keep");
        assert.equal(keep.name, "The Keep of Bellhaven");
        assert.equal(keep.scene, castle.key);
        assert.ok(world.links.includes(keep.door));
        assert.equal(outside.map, castle.maps[0]);
        assert.deepEqual(outside.squares, ways.squares);
        assert.deepEqual(outside.door, ways.door);
        // (Its doorway two squares wide where the walk ends at the doors, up the steps from the court)
        assert.equal(new Set(outside.squares.map(([x]) => x)).size, 2);
        assert.ok(outside.squares.some(([x, y]) => Math.abs(x - squareIn("bellhaven", [-0.5, -141])[0]) <= 1 && Math.abs(y - squareIn("bellhaven", [-0.5, -141])[1]) <= 1));
        assert.ok(Math.abs(ways.door.floor - 81.4) < 0.3, `${ways.door.floor}`);
        assert.equal(inside.pending, true);
        assert.equal(keep.made, false);
        // (Its site the castle's own, kept by the host as a dungeon's: never one the plan lays out)
        assert.equal(site.parent, "bellhaven-1");
        assert.ok(!world.plan.sites.some(({ id }) => id === site.id));
    });

    it("is made as anyone comes to its doors, its floors in a block of their own, each named for its own, its stairs up each barred by its warden, and from beyond its master a stair down out to its doors", () => {
        const [outside] = keep.door.ends;

        Object.assign(me, { map: castle.maps[0] });
        put(me, outside.arrive);
        run(host, 1500, me);

        assert.ok(keep.made, "made by its doors");
        assert.equal(keep.maps.length, 4);
        keep.maps.forEach((id, k) => {
            const map = world.maps[id];

            assert.deepEqual(map.origin, [KEEP_ORIGINS.x, k * KEEP_ORIGINS.step]);
            assert.equal(map.look, "keep");
            assert.ok(!map.dungeon.portals);
            assert.ok(map.name.endsWith(KEEP.realms[k].name), map.name);
        });

        const ups = keep.flights.filter(({ id }) => id.endsWith("/stairs"));
        const [out] = keep.flights.filter(({ id }) => id.endsWith("/exit"));

        assert.equal(ups.length, 3);
        ups.forEach((flight, k) => assert.deepEqual(flight.seal, { map: keep.maps[k], level: k, pack: `${k}-warden`, refusal: "barred" }));
        assert.ok(REFUSALS.barred);
        assert.equal(out.seal.refusal, "throne");
        assert.equal(out.ends[0].map, castle.maps[0]);
        assert.deepEqual(out.ends[0].squares, []);
        assert.deepEqual(out.ends[0].arrive, outside.arrive);
        assert.ok(!(routeBetween(world.links, castle.maps[0], keep.maps[3]) ?? []).includes(out));
        // (Its first floor's foes woken by its doors)
        assert.ok([...host.wild.values()].some((one) => one.dungeon === site.id));
    });

    it("is gone into by its doors, up each stair once its warden falls, and out again by its doors", () => {
        assert.ok(cross(host, me, keep.door).ok, "in");
        assert.equal(me.map, keep.maps[0]);

        for (let k = 0; k < 3; k++) {
            const flight = keep.flights[k];

            assert.equal(cross(host, me, flight).reason, "barred", `floor ${k + 1}'s stair up barred before its warden fell`);

            const [id, warden] = [...host.wild].find(([each, one]) => one.dungeon === site.id && one.champion === "floor" && host.battle.actor(each)?.map === keep.maps[k]);

            assert.equal(warden.foe, foeKey(k, `${k}-warden`, 0));
            host.battle.afflict(id, "poison", { by: HOST_PLAYER, damage: 1e7 });
            assert.ok(run(host, 2000, me).some(({ type, change, site: where }) => type === "dungeon" && change === "floor" && where === site.id));
            assert.ok(cross(host, me, flight).ok, `up to floor ${k + 2}`);
            run(host, 1000, me);
            assert.equal(me.map, keep.maps[k + 1]);
        }

        // (And back down, whenever, and out by its doors)
        for (let k = 2; k >= 0; k--) {
            assert.ok(cross(host, me, keep.flights[k]).ok, `down to floor ${k + 1}`);
            assert.equal(me.map, keep.maps[k]);
        }

        assert.ok(cross(host, me, keep.door).ok, "out");
        assert.equal(me.map, castle.maps[0]);
        assert.ok(Math.hypot(me.square[0] - keep.door.ends[0].arrive[0], me.square[1] - keep.door.ends[0].arrive[1]) <= 2);
    });

    it("is kept in a snapshot: made again as it was, with whoever's in it, its castle with it", () => {
        Object.assign(me, { map: keep.maps[1] });
        put(me, keep.flights[0].ends[0].arrive);

        const again = buildWorld({ seed: 1 });
        const restored = Host.restore(again, host.snapshot());
        const made = again.interiors.buildings.get(keep.key);
        const mine = restored.battle.actor(HOST_PLAYER);

        assert.ok(made?.made);
        assert.deepEqual(made.maps, keep.maps);
        assert.equal(mine.map, keep.maps[1]);
        assert.deepEqual(again.maps[keep.maps[1]].rows ?? again.maps[keep.maps[1]].plan, world.maps[keep.maps[1]].rows ?? world.maps[keep.maps[1]].plan);
    });
});
