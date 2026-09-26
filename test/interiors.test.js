// Inside buildings (client/js/core/interiors.js): the tavern's floors, its door and stairs, and
// characters going in and out of it in the battle
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import { Doors } from "../client/js/app/doors.js";
import { Battle, STEP_MS } from "../client/js/core/battle.js";
import { FACING, linkAt, MAP_ORIGINS, readPlan, routeBetween, tavernFloors, tavernFolk } from "../client/js/core/interiors.js";
import { findPath } from "../client/js/core/pathfinding.js";
import { REST_EVERY, ROLES } from "../client/js/core/roles.js";
import { generateWorld } from "../client/js/core/world.js";

function run(battle, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...battle.advance(STEP_MS));
    }

    return events;
}

const reachable = (map, from, to) => findPath(map.blocked, from, to).length > 0;
const same = (a, b) => a[0] === b[0] && a[1] === b[1];

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

    it("has the player, set to fight someone who goes through a door, go after them the same way", () => {
        const { battle, player, world } = tavern();
        const [front] = world.tavern.front;

        battle.add({ id: "thief", kind: "orc", weapon: "cleaver", team: "orcs", square: front });
        battle.command("player", { type: "engage", target: "thief" });
        battle.command("thief", { type: "enter", link: "tavern-door" });

        const events = run(battle, 4000);

        assert.deepEqual(events.filter((event) => event.type === "cross").map((event) => [event.id, event.to]), [["thief", "taproom"], ["player", "taproom"]]);
        assert.equal(player.order?.target, "thief", "still after it");

        // Somewhere it didn't go from here (it was carried off): they give up
        Object.assign(battle.actor("thief"), { map: "upstairs", crossed: null });
        run(battle, 2000);
        assert.equal(player.order, null);
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

describe("the tavern's folk (interiors.js, battle.js)", () => {
    // The tavern, its folk in it, and the player (and an orc) wherever wanted
    function busy(seed = 1) {
        const world = generateWorld({ seed });
        const battle = new Battle(world, { seed });

        for (const one of world.folk) {
            battle.add({ id: one.id, kind: "folk", name: one.name, team: "folk", square: one.square, map: one.map, ai: "routine", neutral: true, routine: one.routine, role: one.role, facing: one.facing });
        }

        return { world, battle };
    }

    it("puts a barkeep behind the bar, two wenches, patrons on benches facing the tables, and the madam upstairs", () => {
        const world = generateWorld({ seed: 1 });
        const folk = tavernFolk();
        const { taproom, upstairs } = world.maps;

        assert.deepEqual(world.folk.map((one) => ({ ...one, name: undefined })), folk.map((one) => ({ ...one, name: undefined })));
        assert.deepEqual(folk.map(({ id }) => id), ["barkeep", "wench", "wench2", "drinker", "alewife", "farmer", "greybeard", "madam"]);
        assert.deepEqual(folk.map(({ role }) => role), ["barkeep", "barmaid", "barmaid", "patron", "patron", "patron", "patron", "madam"]);
        assert.ok(folk.every(({ title, sex, role }) => title && ["f", "m"].includes(sex) && ROLES[role]));

        for (const one of folk) {
            const map = world.maps[one.map];

            if (one.routine.seated) {
                // On a bench, a table in front of them
                const [x, y] = one.square;
                const ahead = [x + Math.round(Math.sin(one.facing)), y + Math.round(Math.cos(one.facing))];

                assert.equal(map.plan[y][x], "b", `${one.id} sits on a bench`);
                assert.equal(map.plan[ahead[1]][ahead[0]], "T", `${one.id} faces a table`);
            } else {
                // Every stop on the floor, and reachable from where they start
                for (const { square } of one.routine.stops) {
                    assert.equal(map.blocked[square[1]][square[0]], 0, `${one.id}'s stop ${square}`);
                    assert.ok(same(one.square, square) || reachable(map, one.square, square), `${one.id} can get to ${square}`);
                }
            }
        }

        assert.equal(folk.find(({ id }) => id === "madam").map, "upstairs");
        assert.equal(upstairs.plan[4][3], "M", "her counter in front of her");
        assert.ok(folk.filter(({ id }) => id.startsWith("wench")).every(({ routine }) => routine.stops.some(({ group }) => group === "bar") && routine.stops.some(({ act }) => act === "serve")));
        assert.ok(taproom.plan[4].slice(10, 13).startsWith("C"), "the bar between the barkeep and the room");
    });

    it("has the patrons rest (a toast, a drink, a laugh...) while the player can see them, the wenches serve the tables in turn with the bar, and the barkeep draw ale", () => {
        const { battle } = busy();
        const acts = [];
        const rests = [];
        const places = new Map();

        // The player by the door, looking in
        battle.add({ id: "player", kind: "player", weapon: "sword", team: "town", square: [7, 10], map: "taproom" });

        for (let t = 0; t < 90000; t += STEP_MS) {
            for (const event of battle.advance(STEP_MS)) {
                const actor = battle.actor(event.id);

                if (event.type === "act") {
                    acts.push({ ...event, time: battle.time, square: [...actor.square] });
                } else if (event.type === "rest") {
                    rests.push({ ...event, time: battle.time, square: [...actor.square] });
                }
            }

            for (const actor of battle.actors) {
                places.set(actor.id, [...(places.get(actor.id) ?? []), actor.square.join()]);
            }
        }

        const of = (id, act) => acts.filter((event) => event.id === id && event.act === act);

        // Patrons: one of their five rests every several seconds, never the same twice running,
        // never moving from their benches
        for (const id of ["drinker", "alewife", "farmer", "greybeard"]) {
            const theirs = rests.filter((event) => event.id === id);

            assert.ok(theirs.length >= 6 && theirs.length <= 14, `${id} rested ${theirs.length} times`);
            assert.ok(theirs.every(({ role }) => role === "patron"));
            assert.ok(theirs.every((event, k) => k === 0 || event.rest !== theirs[k - 1].rest), `${id} never rests the same way twice running`);
            assert.ok(new Set(theirs.map(({ rest }) => rest)).size >= 4, `${id} rests in several ways`);
            assert.ok(theirs.every((event, k) => k === 0 || event.time - theirs[k - 1].time >= ROLES.patron.rests[theirs[k - 1].rest].duration * 1000 + REST_EVERY[0]), "one at a time, a while apart");
            assert.equal(new Set(places.get(id)).size, 1, `${id} stays sitting`);
        }

        // The wenches and the barkeep rest too, standing still until they're done
        for (const id of ["wench", "wench2", "barkeep"]) {
            const theirs = rests.filter((event) => event.id === id);
            const steps = places.get(id);

            assert.ok(theirs.length >= 1, `${id} rested`);

            for (const { time, rest, role, square } of theirs) {
                const until = Math.min(steps.length, (time + ROLES[role].rests[rest].duration * 1000) / STEP_MS - 1);

                assert.ok(steps.slice(time / STEP_MS, until).every((place) => place === square.join()), `${id} stays put resting`);
            }
        }

        // Wenches: serving at the tables, back to the bar between
        for (const id of ["wench", "wench2"]) {
            const serves = of(id, "serve");

            assert.ok(serves.length >= 4, `${id} served ${serves.length} times`);
            assert.ok(new Set(serves.map(({ square }) => square.join())).size >= 3, `${id} goes round the tables`);
            assert.ok(new Set(places.get(id)).has("9,3") || new Set(places.get(id)).has("9,5"), `${id} goes back to the bar`);
        }

        // The barkeep: drawing ale from the barrels, facing them
        const pours = of("barkeep", "pour");

        assert.ok(pours.length >= 4);
        assert.ok(pours.every(({ square }) => square[0] === 12));
        assert.ok(places.get("barkeep").every((square) => Number(square.split(",")[0]) >= 11), "he stays behind the bar");

        // The madam keeps to her counter upstairs, where no one can see her: she doesn't rest
        assert.ok(places.get("madam").every((square) => square.split(",")[1] === "3"));
        assert.ok(!rests.some(({ id }) => id === "madam"));
    });

    it("rests only while the player can see them: not with the player outside, nor behind a wall", () => {
        const outside = busy();

        outside.battle.add({ id: "player", kind: "player", weapon: "sword", team: "town", square: outside.world.spawns.player });
        assert.equal(run(outside.battle, 30000).filter(({ type }) => type === "rest").length, 0);

        // Upstairs, at the far end of the hallway, the walls between: then at her counter
        const upstairs = busy();
        const player = upstairs.battle.add({ id: "player", kind: "player", weapon: "sword", team: "town", square: [13, 5], map: "upstairs" });
        const madam = upstairs.battle.actor("madam");

        assert.equal(upstairs.battle.canSee(player, madam), false);
        assert.equal(run(upstairs.battle, 20000).filter(({ type, id }) => type === "rest" && id === "madam").length, 0);

        Object.assign(player, { square: [3, 6], x: 3.5, y: 6.5 });
        assert.equal(upstairs.battle.canSee(player, madam), true);

        const seen = run(upstairs.battle, 30000).filter(({ type, id }) => type === "rest" && id === "madam");

        assert.ok(seen.length >= 2, `the madam rested ${seen.length} times`);
        assert.ok(seen.every(({ role }) => role === "madam"));
    });

    it("has no one fight the folk: the orc ignores them, the player can't be set on them or cast at them, and they fight no one", () => {
        const { battle } = busy();

        battle.add({ id: "orc", kind: "orc", weapon: "cleaver", team: "orcs", square: [8, 5], map: "taproom", ai: "patrol", patrol: [[8, 5], [8, 5]] });
        battle.add({ id: "player", kind: "player", weapon: "sword", team: "town", square: [2, 9], map: "taproom" });

        const player = battle.actor("player");
        const events = run(battle, 8000);

        // The orc goes for the player, and they fight each other, no one else
        const attacks = events.filter(({ type }) => type === "attack");

        assert.ok(attacks.some(({ id, target }) => id === "orc" && target === "player"));
        assert.ok(attacks.every(({ id, target }) => !battle.actor(id).neutral && !battle.actor(target).neutral));
        assert.ok(!events.some(({ type, id }) => (type === "hit" || type === "miss") && battle.actor(id)?.neutral));

        // Told to fight one of the folk, the player won't; nor cast at one
        battle.command("player", { type: "engage", target: "drinker" });
        run(battle, 200);
        assert.notEqual(player.order?.type, "engage");
        assert.deepEqual(battle.cast("player", "stun", "wench"), { ok: false, reason: "target" });

        // Standing right by one, nobody strikes anybody
        const calm = busy();

        calm.battle.add({ id: "player", kind: "player", weapon: "sword", team: "town", square: [2, 2], map: "taproom" });
        assert.equal(run(calm.battle, 5000).filter(({ type }) => type === "attack").length, 0);
        assert.equal(FACING.s, 0);
    });
});

describe("the doors and stairs to tap (doors.js)", () => {
    const world = generateWorld({ seed: 1 });
    const doors = new Doors(world, new THREE.Group());

    // A ray from high up in front of a point, at it
    const rayAt = (x, y, z, from) => {
        const origin = new THREE.Vector3(x + from[0], 8, z + from[1]);

        return new THREE.Ray(origin, new THREE.Vector3(x, y, z).sub(origin).normalize());
    };

    it("has a target at each end of each door and stairs, on its map", () => {
        assert.deepEqual(doors.targets.map(({ link, map }) => `${link.id}:${map}`).sort(), ["tavern-door:taproom", "tavern-door:town", "tavern-stairs:taproom", "tavern-stairs:upstairs"]);
        assert.ok(doors.targets.every(({ glow }) => !glow.visible));
    });

    it("is hit by a tap on the tavern's door from outside, on the town's map only", () => {
        const { door } = world.tavern;
        const ray = rayAt(door.x, 1.2, door.z, [Math.sin(door.facing) * 8, Math.cos(door.facing) * 8]);

        assert.equal(doors.at(ray, "town")?.link.id, "tavern-door");
        assert.equal(doors.at(ray, "taproom"), null);

        // A tap on the wall well along from it isn't
        const along = [Math.cos(door.facing) * 4, -Math.sin(door.facing) * 4];

        assert.equal(doors.at(rayAt(door.x + along[0], 1.2, door.z + along[1], [Math.sin(door.facing) * 8, Math.cos(door.facing) * 8]), "town"), null);
    });

    it("is hit by a tap on the inside of the door and on the stairs, drawn where their maps are", () => {
        const { taproom, upstairs } = world.maps;
        const [tx, tz] = taproom.origin;
        const [ux, uz] = upstairs.origin;
        const [dx] = taproom.marks.D[0];

        assert.equal(doors.at(rayAt(tx + dx + 1, 0.8, tz + taproom.height - 0.3, [0, -6]), "taproom")?.link.id, "tavern-door");
        assert.equal(doors.at(rayAt(tx + 3, 1.5, tz + 1, [0, 6]), "taproom")?.link.id, "tavern-stairs");
        assert.equal(doors.at(rayAt(ux + 3, 0, uz + 0.5, [0, 6]), "upstairs")?.link.id, "tavern-stairs");
    });

    it("glows when tapped, and while the player makes for it, then fades", () => {
        const target = doors.targets.find(({ map }) => map === "town");

        doors.light(target, 10);
        doors.update(0.5, 10, { map: "town" });
        assert.ok(target.glow.visible && target.level === 1);

        // Not on another map
        doors.update(0.5, 10.5, { map: "taproom" });
        assert.equal(target.level, 0);

        // Kept lit while heading there, fading once through
        doors.update(0.5, 20, { map: "town", heading: "tavern-door" });
        assert.equal(target.level, 1);
        doors.update(0.1, 20.1, { map: "town" });
        assert.ok(target.level > 0 && target.level < 1);
        doors.update(1, 21, { map: "town" });
        assert.ok(!target.glow.visible);
    });
});
