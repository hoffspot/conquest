// Inside buildings (client/js/core/interiors.js): the tavern's floors, its door and stairs, and
// characters going in and out of it in the battle
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Battle, STEP_MS } from "../client/js/core/battle.js";
import { linkAt, MAP_ORIGINS, readPlan, routeBetween, tavernFloors } from "../client/js/core/interiors.js";
import { findPath } from "../client/js/core/pathfinding.js";
import { generateWorld } from "../client/js/core/world.js";

function run(battle, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...battle.advance(STEP_MS));
    }

    return events;
}

const reachable = (map, from, to) => findPath(map.blocked, from, to).length > 0;

describe("inside buildings (interiors.js)", () => {
    it("reads a plan: what blocks walking and sight, and each run of the same thing as one piece", () => {
        const map = readPlan("taproom", "Test", ["<SS.", "TT.b", "..DD"]);

        assert.equal(map.width, 4);
        assert.equal(map.height, 3);
        assert.deepEqual(map.blocked.map((row) => [...row]), [[0, 1, 1, 0], [1, 1, 0, 1], [0, 0, 0, 0]]);

        // Tables don't block sight; stairs do
        assert.deepEqual(map.opaque.map((row) => [...row]), [[0, 1, 1, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
        assert.deepEqual(map.pieces.map(({ kind, x, y, w, h }) => [kind, x, y, w, h]), [["stairs-foot", 0, 0, 1, 1], ["stairs", 1, 0, 2, 1], ["table", 0, 1, 2, 1], ["bench", 3, 1, 1, 1], ["door", 2, 2, 1, 1], ["door", 3, 2, 1, 1]]);
        assert.deepEqual(map.marks.D, [[2, 2], [3, 2]]);
        assert.deepEqual(map.origin, MAP_ORIGINS.taproom);
        assert.throws(() => readPlan("x", "Bad", ["..", "..."]), /Row 1/);
        assert.throws(() => readPlan("x", "Bad", ["?"]), /Unknown square/);
    });

    it("furnishes the taproom: tables with benches, the bar with barrels behind it, the hearth, stairs and the door, all reachable", () => {
        const { taproom } = tavernFloors();
        const kinds = (kind) => taproom.pieces.filter((piece) => piece.kind === kind);

        assert.equal(kinds("table").length, 4);
        assert.equal(kinds("bench").length, 16);
        assert.equal(kinds("bar").length, 1);
        assert.equal(kinds("barrels").length, 1);
        assert.equal(kinds("hearth").length, 1);
        assert.equal(kinds("stairs").length, 1);

        // From the door: the stairs, behind the bar, the hearth's side and every table's end
        const door = taproom.marks.D[0];

        for (const square of [taproom.marks["<"][0], [11, 4], [2, 4], [5, 3], [5, 7], [9, 5]]) {
            assert.ok(reachable(taproom, door, square), `${square} from the door`);
        }
    });

    it("furnishes upstairs: the madam's counter by the stairs and a hallway to four bedrooms, each with a bed you can walk up to", () => {
        const { upstairs } = tavernFloors();
        const beds = upstairs.pieces.filter((piece) => piece.kind === "bed");
        const top = upstairs.marks[">"][0];

        assert.equal(beds.length, 4);
        assert.equal(upstairs.pieces.filter((piece) => piece.kind === "counter").length, 1);
        assert.equal(upstairs.pieces.filter((piece) => piece.kind === "washstand").length, 4);

        for (const bed of beds) {
            // A free square beside the bed
            const beside = [[bed.x - 1, bed.y], [bed.x + bed.w, bed.y], [bed.x, bed.y + bed.h], [bed.x + 1, bed.y + bed.h], [bed.x, bed.y - 1]].find(([x, y]) => upstairs.blocked[y]?.[x] === 0);

            assert.ok(beside && reachable(upstairs, top, beside), `the bed at ${bed.x}, ${bed.y}`);
        }

        // Walls block sight between the rooms
        assert.equal(upstairs.opaque[4][7], 1);
    });

    it("finds the links at a square, and the way between maps", () => {
        const world = generateWorld({ seed: 1 });

        assert.equal(linkAt(world.links, "taproom", world.maps.taproom.marks.D[1]).link.id, "tavern-door");
        assert.equal(linkAt(world.links, "taproom", world.maps.taproom.marks["<"][0]).end.map, "taproom");
        assert.equal(linkAt(world.links, "taproom", [5, 5]), null);
        assert.deepEqual(routeBetween(world.links, "upstairs", "town").map(({ id }) => id), ["tavern-stairs", "tavern-door"]);
        assert.deepEqual(routeBetween(world.links, "town", "town"), []);
        assert.equal(routeBetween([], "town", "taproom"), null);
    });
});

describe("the tavern's door (world.js)", () => {
    it("faces the market square or a street in every town, with its door walked up to from the square", () => {
        for (let seed = 1; seed <= 40; seed++) {
            const world = generateWorld({ seed });
            const { tavern } = world;

            assert.ok(tavern, `seed ${seed}`);
            assert.ok(["s", "e", "n", "w"].includes(tavern.side));

            for (const [x, y] of [...tavern.front, tavern.outside]) {
                assert.equal(world.blocked[y][x], 0, `seed ${seed}: ${x}, ${y} is clear`);
            }

            assert.ok(reachable(world, world.spawns.player, tavern.front[0]), `seed ${seed}: the door from the square`);

            // The door is on the tavern's side, 1.8 metres in from its edge, between the two
            // squares in front of it
            const [a, b] = tavern.front;

            assert.ok(Math.abs(tavern.door.x - (a[0] + b[0] + 1) / 2) < 1 || Math.abs(tavern.door.z - (a[1] + b[1] + 1) / 2) < 1);
        }
    });
});

describe("going in and out (battle.js)", () => {
    function tavern(seed = 1) {
        const world = generateWorld({ seed });
        const battle = new Battle(world, { seed });

        battle.add({ id: "player", kind: "player", weapon: "sword", team: "town", square: world.tavern.outside });

        return { world, battle, player: battle.actor("player") };
    }

    it("walks to the door and comes out inside it, facing into the taproom; up the stairs and down; and out again", () => {
        const { world, battle, player } = tavern();

        battle.command("player", { type: "move", to: world.spawns.player });
        run(battle, 6000);
        battle.command("player", { type: "enter", link: "tavern-door" });

        const events = run(battle, 12000);
        const cross = events.find((event) => event.type === "cross");

        assert.deepEqual([cross.from, cross.to, cross.link], ["town", "taproom", "tavern-door"]);
        assert.equal(player.map, "taproom");
        assert.deepEqual(player.square, world.maps.taproom.marks.D[0]);
        assert.equal(player.facing, Math.PI);
        assert.equal(player.order, null);

        // Up and down the stairs
        battle.command("player", { type: "enter", link: "tavern-stairs", run: true });
        run(battle, 8000);
        assert.equal(player.map, "upstairs");
        assert.deepEqual(player.square, world.maps.upstairs.marks[">"][0]);

        battle.command("player", { type: "enter", link: "tavern-stairs" });
        run(battle, 2000);
        assert.equal(player.map, "taproom");

        // Out, onto the square outside the door, facing away from it
        battle.command("player", { type: "enter", link: "tavern-door" });
        run(battle, 10000);
        assert.equal(player.map, "town");
        assert.deepEqual(player.square, world.tavern.outside);
        assert.equal(player.facing, world.tavern.facing);
    });

    it("won't go through a link that isn't where they are, and moves on the map they're on", () => {
        const { battle, player, world } = tavern();

        battle.command("player", { type: "enter", link: "tavern-stairs" });
        assert.equal(player.order, null);

        battle.command("player", { type: "enter", link: "tavern-door" });
        run(battle, 3000);
        assert.equal(player.map, "taproom");

        // A move on the taproom's squares
        battle.command("player", { type: "move", to: [2, 9] });
        run(battle, 6000);
        assert.deepEqual(player.square, [2, 9]);
        assert.equal(world.maps.taproom.blocked[9][2], 0);
    });

    it("only sees and fights those on the same map", () => {
        const { battle, world } = tavern();

        battle.add({ id: "orc", kind: "orc", weapon: "cleaver", team: "orcs", square: [3, 9], map: "taproom", ai: "patrol", patrol: [world.spawns.orc, world.spawns.orc] });

        const player = battle.actor("player");
        const orc = battle.actor("orc");

        // Same squares on different maps: no fight
        Object.assign(orc, { square: [...player.square], x: player.x, y: player.y + 1 });
        orc.square = [player.square[0], player.square[1] + 1];
        assert.equal(battle.canSee(orc, player), false);

        const events = run(battle, 3000);

        assert.equal(events.filter((event) => event.type === "hit").length, 0);
    });

    it("has an orc chasing the player follow them in through the door, and up the stairs, then find its way back to its patrol", () => {
        const { world, battle, player } = tavern();
        const out = { s: [0, 1], n: [0, -1], e: [1, 0], w: [-1, 0] }[world.tavern.side];
        const [ox, oy] = [world.tavern.outside[0] + out[0] * 4, world.tavern.outside[1] + out[1] * 4];

        // The orc, a few steps behind the player, sees them go in
        battle.add({ id: "orc", kind: "orc", weapon: "cleaver", team: "orcs", square: [ox, oy], ai: "patrol", patrol: world.patrol });

        const orc = battle.actor("orc");

        orc.target = "player";
        orc.lastSeen = battle.time;
        battle.command("player", { type: "enter", link: "tavern-door", run: true });

        // In it comes after them; they run up the stairs the moment it does
        const crossings = [];

        for (let t = 0; t < 20000 && orc.map !== "taproom"; t += STEP_MS) {
            crossings.push(...battle.advance(STEP_MS).filter((event) => event.type === "cross"));
        }

        assert.equal(player.map, "taproom");
        assert.equal(orc.map, "taproom", "the orc came in after them");
        assert.deepEqual(crossings.map((event) => event.id), ["player", "orc"]);

        battle.command("player", { type: "enter", link: "tavern-stairs", run: true });

        for (let t = 0; t < 20000 && orc.map !== "upstairs" && !orc.dead && !player.dead; t += STEP_MS) {
            battle.advance(STEP_MS);
        }

        assert.equal(player.map, "upstairs");
        assert.equal(orc.map, "upstairs", "and up the stairs");

        // With the player gone for good, it goes back down, out and on with its patrol
        player.dead = true;
        player.respawnAt = Infinity;
        run(battle, 60000);
        assert.equal(orc.map, "town");
    });

    it("brings the dead back to life on the map they started on", () => {
        const { battle, player } = tavern();

        battle.command("player", { type: "enter", link: "tavern-door" });
        run(battle, 3000);
        assert.equal(player.map, "taproom");

        battle.add({ id: "orc", kind: "orc", weapon: "cleaver", team: "orcs", square: [6, 9], map: "taproom" });
        player.hp = 1;

        const events = run(battle, 12000);
        const respawn = events.find((event) => event.type === "respawn" && event.id === "player");

        assert.ok(respawn);
        assert.deepEqual([respawn.from, respawn.map], ["taproom", "town"]);
        assert.equal(player.map, "town");
    });

    it("has an arrow that's still flying when its target goes through a door miss", () => {
        const { battle, player, world } = tavern();
        const out = { s: [0, 1], n: [0, -1], e: [1, 0], w: [-1, 0] }[world.tavern.side];
        const [front] = world.tavern.front;

        Object.assign(player, { square: [...front], x: front[0] + 0.5, y: front[1] + 0.5 });
        battle.add({ id: "archer", kind: "orc", weapon: "bow", team: "orcs", square: [front[0] + out[0] * 7, front[1] + out[1] * 7] });
        battle.command("archer", { type: "engage", target: "player" });

        for (let k = 0; k < 100 && !battle.projectiles.length; k++) {
            run(battle, STEP_MS);
        }

        assert.equal(battle.projectiles.length, 1, "it let go of an arrow");
        battle.command("player", { type: "enter", link: "tavern-door" });

        const events = run(battle, 1500);

        assert.equal(player.map, "taproom");
        assert.ok(events.some((event) => event.type === "fizzle"));
        assert.ok(!events.some((event) => event.type === "hit" && event.id === "player"));
    });
});
