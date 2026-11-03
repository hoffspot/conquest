// A place drawn from a fixed scene of its own (core/scenery.js: Bellhaven's castle, docs/WORLD.md),
// its own map apart from the world: walked as its walk has it (core/walk.js), gone into from a way
// in out in the world as a site's inside (core/insides.js), its navigation baked from its floors
// (core/navigation/walk.js), and walked over its bridge to the keep's doors, and out again.
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { squaresOf } from "../client/js/core/grid.js";
import { HOST_PLAYER, Host } from "../client/js/core/host.js";
import { FACING } from "../client/js/core/interiors.js";
import { SITE_INSIDES } from "../client/js/core/insides.js";
import { navigatorOf } from "../client/js/core/navigation.js";
import { walkInput } from "../client/js/core/navigation/walk.js";
import { SCENES } from "../client/js/core/navigation/settings.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { heightOn, SCENERY, SCENERY_ORIGINS, sceneryMap, sceneryOrigin, sceneryWays, squareIn, STEP, walkOf } from "../client/js/core/scenery.js";
import { floorAt } from "../client/js/core/walk.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });
const KEEP_DOORS = [-0.5, -140];

const put = (actor, [x, y]) => Object.assign(actor, { square: [x, y], x: x + 0.5, y: y + 0.5, path: [], order: null, target: null });

function run(host, ms, me) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        me.hp = me.maxHp;
        events.push(...host.advance(STEP_MS));
    }

    return events;
}

// Played on till `done` (or `most` ms have gone): whether it was
function until(host, me, done, most = 120000) {
    for (let t = 0; t < most; t += 250) {
        if (done(run(host, 250, me))) {
            return true;
        }
    }

    return false;
}

// Bellhaven's way in set down by hand by the world's start (its landmark puts it in the world
// later: docs/WORLD.md), a few squares east of where the player starts, its door facing them
function wayIn(world) {
    const squares = squaresOf(world.maps.town);
    const [sx, sy] = world.start.at.map(Math.floor);
    const open = (x, y) => !squares.blocked(x, y);
    const [x, y] = [...Array(30).keys()].map((k) => [sx + 3 + k, sy]).find(([ax, ay]) => open(ax, ay) && open(ax + 1, ay) && open(ax + 2, ay));
    const entrance = { inside: "scenery", scenery: "bellhaven", outside: [x, y], front: [[x + 1, y]], facing: FACING.w, door: { x: x + 2, z: y + 0.5, facing: FACING.w, width: 2, height: 3, floor: 0 } };

    return world.interiors.addSite({ site: { id: "bellhaven", kind: "bellhaven", name: "Bellhaven" }, entrance });
}

describe("a fixed scene's map (core/scenery.js): Bellhaven's", () => {
    const map = sceneryMap("bellhaven", "site:bellhaven/grounds");
    const walk = walkOf("bellhaven");
    const ways = sceneryWays("bellhaven");

    it("is its walk's grid: a square with a floor walked on, one without blocked and blocking sight, drawn at its own column beyond every other inside", () => {
        const squares = squaresOf(map);

        assert.deepEqual([map.width, map.height], walk.size);
        assert.deepEqual(map.origin, [SCENERY_ORIGINS.x + SCENERY.bellhaven.column * SCENERY_ORIGINS.step, 0]);
        assert.deepEqual(sceneryOrigin("bellhaven"), map.origin);
        assert.deepEqual(map.offset, [-walk.origin[0], -walk.origin[1]]);

        let floors = 0;

        for (let y = 0; y < map.height; y++) {
            for (let x = 0; x < map.width; x++) {
                const floor = floorAt(walk, 0, x, y);

                floors += floor === null ? 0 : 1;
                assert.equal(squares.blocked(x, y), floor === null);
                assert.equal(squares.opaque(x, y), floor === null);
            }
        }

        assert.equal(floors, walk.levels[0].squares);
        // (Off its edge, blocked)
        assert.equal(squares.blocked(-1, 10), true);
        assert.equal(squares.blocked(10, map.height), true);
    });

    it("is come into on its bridge's foot, facing the castle across the chasm, and gone out of by the foot's southern edge, all of it floor", () => {
        const [ax, ay] = ways.arrive;
        const at = (x, y) => [x + walk.origin[0], y + walk.origin[1]];

        assert.deepEqual(ways.arrive, squareIn("bellhaven", SCENERY.bellhaven.arrive));
        assert.notEqual(floorAt(walk, 0, ax, ay), null);
        assert.equal(ways.facing, FACING.n);
        assert.ok(ways.out.length >= 40, `${ways.out.length} squares out`);
        assert.ok(ways.out.every(([x, y]) => floorAt(walk, 0, x, y) !== null));
        assert.ok(ways.out.every(([x, y]) => Math.abs(at(x, y)[0]) <= 20 && at(x, y)[1] >= 75 && at(x, y)[1] < 77));
        assert.ok(!ways.out.some(([x, y]) => x === ax && y === ay));
        // (Ten metres and more from where one comes in, the castle the other way)
        assert.ok(ways.out.every(([, y]) => y - ay >= 10));
        assert.ok(squareIn("bellhaven", KEEP_DOORS)[1] < ay);
    });

    it("has a floor that eases from square to square, no jolt along the bridge, its own square's floor at each square's middle", () => {
        const [x] = squareIn("bellhaven", [0, 0]);
        let [biggest, last] = [0, null];

        for (let y = ways.arrive[1] + 0.5; y > squareIn("bellhaven", KEEP_DOORS)[1]; y -= 0.25) {
            const height = map.heightAt(x + 0.5, y);

            biggest = last === null ? 0 : Math.max(biggest, Math.abs(height - last));
            last = height;
        }

        assert.ok(biggest < 0.2, `${biggest.toFixed(2)} m in a quarter metre`);

        for (const [sx, sy] of [ways.arrive, ...ways.out.slice(0, 5)]) {
            assert.ok(Math.abs(map.heightAt(sx + 0.5, sy + 0.5) - floorAt(walk, 0, sx, sy)) < 1e-9);
        }

        // (Not eased across a ledge: a floor further than a step off isn't counted)
        const ledge = { size: [2, 1], origin: [0, 0], levels: [{ low: 0, box: [0, 0, 1, 0], heights: Int16Array.from([0, 300]) }] };

        assert.equal(heightOn(ledge, 0.9, 0.5), 0);
        assert.equal(heightOn(ledge, 1.1, 0.5), 3);
        assert.ok(STEP > 0.5 && STEP < 1);
    });

    it("is walked as Recast's mesh of its floors has it: every floor on it, each square at its height, ways found from where one comes in", () => {
        const input = walkInput(walk, 5, 9, SCENES);

        // (Each floor its two triangles at its own height)
        assert.equal(input.indices.length / 3, input.areas.length);
        assert.ok(input.positions.length / 12 === input.areas.length / 2 && input.areas.length > 0);
        assert.ok(input.bmin[1] < input.bmax[1]);

        const navigation = navigatorOf(map);
        const from = [ways.arrive[0] + 0.5, ways.arrive[1] + 0.5];
        const reaches = (to) => {
            const end = navigation.path(from, to).at(-1);

            return Boolean(end) && Math.hypot(end[0] - to[0], end[1] - to[1]) < 1.5;
        };
        const middle = (at) => squareIn("bellhaven", at).map((v) => v + 0.5);

        assert.ok(reaches(middle(KEEP_DOORS)), "over the bridge to the keep's doors");
        assert.ok(reaches(middle([-120, 60])), "down the stairs to the ground under the crag, west");
        assert.ok(reaches(middle([120, 60])), "and east");

        let [floors, on] = [0, 0];

        for (let y = 0; y < map.height; y += 3) {
            for (let x = 0; x < map.width; x += 3) {
                if (floorAt(walk, 0, x, y) !== null) {
                    floors++;
                    on += navigation.walkable(x + 0.5, y + 0.5) ? 1 : 0;
                }
            }
        }

        assert.equal(on, floors);
        // (A way's points at the floor's height)
        assert.ok(Math.abs(navigation.path(from, middle(KEEP_DOORS)).at(-1)[2] - map.heightAt(...middle(KEEP_DOORS))) < 0.5);
    });
});

describe("a fixed scene's map gone into (insides.js: Bellhaven's, its way in set down by hand)", () => {
    let world;
    let host;
    let me;
    let building;
    let grounds;

    before(() => {
        world = buildWorld({ seed: 1 });
        host = new Host(world, { populate: false });
        host.join({ id: HOST_PLAYER, hero: HERO });
        me = host.battle.actor(HOST_PLAYER);
        Object.assign(me, { hp: 1e6, maxHp: 1e6 });
        building = wayIn(world);
    });

    it("is a site's inside: its way in among the world's links, its map made the first time it's wanted, nobody in it", () => {
        assert.ok(SITE_INSIDES.includes("scenery"));
        assert.ok(building && world.links.includes(building.door) && !building.made);
        assert.equal(building.scenery, "bellhaven");
        assert.equal(building.door.ends[1].pending, true);
        // (No scene that isn't one: nothing set down)
        assert.equal(world.interiors.addSite({ site: { id: "nowhere", kind: "nowhere" }, entrance: { ...building.entrance, scenery: "nowhere" } }), null);

        world.interiors.make(building.key);
        grounds = world.maps[building.maps[0]];

        assert.deepEqual(building.maps, ["site:bellhaven/grounds"]);
        assert.equal(grounds.scenery, "bellhaven");
        assert.equal(grounds.name, "Bellhaven");
        assert.equal(world.interiors.of(grounds.id), building);
        assert.deepEqual(building.folk, []);
        const { arrive, facing, out } = sceneryWays("bellhaven");

        assert.deepEqual(building.door.ends[1], { map: grounds.id, squares: out, arrive, facing, pending: false });
        assert.ok(world.interiors.order.includes(building.key));
    });

    it("is gone into by its way in, walked over its bridge to the keep's doors, and gone out of by its bridge's foot, back to where its way in is", () => {
        const [outside, inside] = building.door.ends;

        put(me, outside.arrive);
        host.command(HOST_PLAYER, { type: "enter", link: building.door.id });
        assert.ok(until(host, me, (events) => events.some(({ type, id, to }) => type === "cross" && id === HOST_PLAYER && to === grounds.id)), "in");
        assert.equal(me.map, grounds.id);
        assert.ok(Math.hypot(me.square[0] - inside.arrive[0], me.square[1] - inside.arrive[1]) <= 2);

        // Over the bridge
        const doors = squareIn("bellhaven", KEEP_DOORS);

        host.command(HOST_PLAYER, { type: "move", to: doors, run: true });
        assert.ok(until(host, me, () => Math.hypot(me.x - doors[0] - 0.5, me.y - doors[1] - 0.5) < 2), `to the keep's doors (at ${me.x.toFixed(1)}, ${me.y.toFixed(1)})`);
        assert.equal(me.map, grounds.id);

        // And back, and out
        host.command(HOST_PLAYER, { type: "enter", link: building.door.id, run: true });
        assert.ok(until(host, me, (events) => events.some(({ type, id, to }) => type === "cross" && id === HOST_PLAYER && to === "town")), "out");
        assert.equal(me.map, "town");
        assert.ok(Math.hypot(me.square[0] - outside.arrive[0], me.square[1] - outside.arrive[1]) <= 2);
    });

    it("is kept in a snapshot, made again as it was on its way back, with whoever's in it", () => {
        const [, inside] = building.door.ends;

        Object.assign(me, { map: grounds.id });
        put(me, inside.arrive);

        const again = buildWorld({ seed: 1 });

        wayIn(again);

        const restored = Host.restore(again, host.snapshot());

        const made = again.interiors.buildings.get(building.key);
        const mine = restored.battle.actor(HOST_PLAYER);

        assert.ok(made.made);
        assert.equal(mine.map, grounds.id);
        assert.deepEqual(mine.square, inside.arrive);
        assert.equal(again.maps[grounds.id].scenery, "bellhaven");
        assert.deepEqual(made.door.ends[1].squares, inside.squares);
    });
});
