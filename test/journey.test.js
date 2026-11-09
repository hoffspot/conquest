// Ways across the world (core/journey.js; the terrain plan's M7g, §9 Pins on the world map): found
// over the world plan's cells, never through the sea, a lake, or a river but at a ford, a stream or
// on a road's bridge, nor up a cliff; pulled straight where it can be; and run a leg at a time
// (app/journey.js), found again when the player stops getting nearer, given up on in the end
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import { Journey, LEGS } from "../client/js/app/journey.js";
import { CROSSING, crossingsOf, JOURNEY, lengthOf, nearestAlong, pointAlong, wayAcross, wayFrom } from "../client/js/core/journey.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { CELL, CELLS, WATER } from "../client/js/core/worldplan/plan.js";
import { FAR } from "../client/js/world/far/levels.js";
import { floatingOver, PING_COLUMN, PingBeacons, PIN_COLUMN, PinMarks, WAY_LINE, WAY_WISPS } from "../client/js/world/pin3d.js";

const world = buildWorld({ seed: 1 });
const plan = world.plan;
const home = world.stamp.middle;
const cellOf = ([x, y]) => Math.floor(y / CELL) * CELLS + Math.floor(x / CELL);

// Every cell a way's line goes through, a quarter cell at a time
function cellsAlong(way) {
    const cells = new Set();

    for (let k = 1; k < way.length; k++) {
        const [a, b] = [way[k - 1], way[k]];
        const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (CELL / 4));

        for (let s = 0; s <= steps; s++) {
            cells.add(cellOf([a[0] + ((b[0] - a[0]) * s) / steps, a[1] + ((b[1] - a[1]) * s) / steps]));
        }
    }

    return cells;
}

describe("ways across the world (core/journey.js)", () => {
    it("knows each cell's ground: the sea and lakes not crossed, rivers only at fords and mountain streams, the roads", () => {
        const { kind, height } = crossingsOf(plan);
        const count = (want) => kind.filter((k) => k === want).length;

        assert.equal(kind.length, CELLS * CELLS);
        assert.equal(height.length, CELLS * CELLS);

        for (let k = 0; k < CELLS * CELLS; k++) {
            if (plan.water[k] === WATER.sea || plan.water[k] === WATER.lake) {
                assert.equal(kind[k], CROSSING.none);
            }

            if (plan.road[k] && plan.water[k] === WATER.none) {
                assert.equal(kind[k], CROSSING.road);
            }
        }

        assert.ok(count(CROSSING.ford) > 50 && count(CROSSING.road) > 1000 && count(CROSSING.open) > count(CROSSING.none));
        assert.equal(crossingsOf(plan), crossingsOf(plan), "worked out once");
    });

    it("finds a way from the start town to every people's capital, by land, kept to what can be crossed", () => {
        const { kind } = crossingsOf(plan);

        for (const place of plan.places.filter(({ kind: placeKind }) => placeKind === "capital")) {
            const way = wayAcross(plan, home, place.at);

            assert.ok(way, place.name);
            assert.deepEqual(way[0], home);
            assert.deepEqual(way.at(-1), place.at);
            assert.ok(lengthOf(way) >= Math.hypot(place.at[0] - home[0], place.at[1] - home[1]) - 1);

            // (Never through the sea or a lake, nor a river but where it's crossed)
            for (const k of cellsAlong(way)) {
                assert.ok(kind[k] !== CROSSING.none || plan.water[k] === WATER.river, `${place.name}: through ${k % CELLS}, ${Math.floor(k / CELLS)}`);
            }

            assert.deepEqual(wayAcross(plan, home, place.at), way, "the same every time");
        }
    });

    it("finds none out to sea", () => {
        const sea = [((0 + 0.5) * CELL), ((0 + 0.5) * CELL)];

        assert.equal(plan.water[0], WATER.sea);
        assert.equal(wayAcross(plan, home, sea), null);
    });

    it("keeps off ground too steep to climb", () => {
        assert.ok(JOURNEY.steepest > 0.5 && JOURNEY.steepest < 1);

        const { height } = crossingsOf(plan);
        const way = wayAcross(plan, home, plan.places.at(-1).at);
        const cells = [...cellsAlong(way)];

        // (No step between the cells it goes through, one beside the other, climbs past the steepest)
        for (let k = 1; k < cells.length; k++) {
            const [a, b] = [cells[k - 1], cells[k]];
            const apart = Math.hypot((a % CELLS) - (b % CELLS), Math.floor(a / CELLS) - Math.floor(b / CELLS));

            if (apart > 0 && apart < 1.5) {
                assert.ok(Math.abs(height[a] - height[b]) / (apart * CELL) <= JOURNEY.steepest + 1e-6 || k === 1 || k === cells.length - 1);
            }
        }
    });

    it("measures along a way: its length, the nearest point on it, a point some way along, the rest of it", () => {
        const way = [[0, 0], [30, 0], [30, 40]];

        assert.equal(lengthOf(way), 70);
        assert.deepEqual(nearestAlong(way, [10, 5]), { along: 10, off: 5, segment: 0 });
        assert.deepEqual(nearestAlong(way, [35, 20]), { along: 50, off: 5, segment: 1 });
        assert.deepEqual(pointAlong(way, 45), [30, 15]);
        assert.deepEqual(pointAlong(way, 500), [30, 40]);
        assert.deepEqual(wayFrom(way, 20), [[20, 0], [30, 0], [30, 40]]);
        assert.deepEqual(wayFrom(way, 999), [[30, 40]]);
    });

    it("finds where along a way that comes back close to itself someone is, near where they were last, not further on where it passes them again", () => {
        // (Up a slope's zigzag: out 30 m east, 2 m north, back 30 m west)
        const way = [[0, 0], [30, 0], [30, 2], [0, 2]];

        assert.equal(nearestAlong(way, [10, 1.2]).along, 52, "anywhere: the way back, nearer");
        assert.deepEqual(nearestAlong(way, [10, 1.2], { from: 5, to: 20 }), { along: 10, off: 1.2, segment: 0 });
        // (Only within it, its ends where it's cut)
        assert.deepEqual(nearestAlong(way, [40, 0], { to: 25 }), { along: 25, off: 15, segment: 0 });
        assert.deepEqual(nearestAlong(way, [0, 0], { from: 40, to: 45 }), { along: 45, off: Math.hypot(17, 2), segment: 2 });
    });
});

describe("running somewhere far (app/journey.js)", () => {
    const player = (x, y, extra = {}) => ({ x, y, map: "town", dead: false, order: null, ...extra });

    it("runs a leg at a time along the way, the next as they near the end of one, till they're there", () => {
        const way = [[0, 0], [300, 0]];
        const journey = new Journey(plan, way);
        const first = journey.step(player(0, 0), 0);

        assert.deepEqual(first, { type: "move", to: [LEGS.reach, 0], run: true });

        // (On their way: nothing more)
        assert.equal(journey.step(player(20, 0, { order: { type: "move" } }), 1), null);

        // (Nearly at the end of the leg: the next)
        assert.deepEqual(journey.step(player(LEGS.reach - 5, 0, { order: { type: "move" } }), 6), { type: "move", to: [2 * LEGS.reach - 5, 0], run: true });

        // (There)
        assert.equal(journey.step(player(299, 0), 60), null);
        assert.equal(journey.ended, "arrived");
    });

    it("doesn't send an order again every frame if it isn't taken", () => {
        const journey = new Journey(plan, [[0, 0], [300, 0]]);

        assert.ok(journey.step(player(0, 0), 0));
        assert.equal(journey.step(player(0, 0), 0.1), null);
        assert.ok(journey.step(player(0, 0), LEGS.again + 0.01));
    });

    it("finds the way again when they stop getting nearer, and gives up in the end", () => {
        const way = wayAcross(plan, home, plan.places[0].at);
        const journey = new Journey(plan, way);
        const stuck = player(...home);

        journey.step(stuck, 0);

        for (let t = 1; t < LEGS.stuck * (LEGS.tries + 2) && !journey.ended; t += 0.5) {
            journey.step(stuck, t);
        }

        assert.equal(journey.ended, "blocked");
        assert.equal(journey.tries, LEGS.tries + 1);
    });

    it("is over if they go indoors or fall", () => {
        const journey = new Journey(plan, [[0, 0], [300, 0]]);

        assert.equal(journey.step(player(0, 0, { map: "taproom" }), 0), null);
        assert.equal(journey.ended, "left");
        assert.equal(new Journey(plan, [[0, 0], [300, 0]]).step(player(0, 0, { dead: true }), 0), null);
    });
});

describe("the pin in the world (world/pin3d.js)", () => {
    it("stands a column of light where it's dropped, drawn in both passes, each its own part of it", () => {
        const [near, far] = [new THREE.Scene(), new THREE.Scene()];
        const marks = new PinMarks(near, far);

        assert.ok(near.children.includes(marks.near) && far.children.includes(marks.far));
        assert.equal(marks.near.visible, false);

        marks.setPin({ x: 10, y: 4, z: 20 });
        assert.ok(marks.near.visible && marks.far.visible && marks.ring.visible);
        assert.deepEqual(marks.foot.value.toArray(), [10, 4, 20]);
        assert.equal(marks.near.material.uniforms.nearPass.value, 1);
        assert.equal(marks.far.material.uniforms.nearPass.value, 0);
        assert.match(marks.near.material.fragmentShader, new RegExp(`vDepth < ${(FAR.nearFar * 0.97).toFixed(1)}`));
        assert.deepEqual([marks.near.material.uniforms.height.value, marks.near.material.uniforms.coreHalf.value, marks.near.material.uniforms.edge.value.toArray()], [PIN_COLUMN.height, PIN_COLUMN.half, PIN_COLUMN.edge]);
        assert.ok(marks.near.material.blending === THREE.AdditiveBlending && !marks.near.material.depthWrite && !marks.near.castShadow);

        // (Out past the far land: brought in as far as it reaches)
        marks.update(3, 3000);
        assert.equal(marks.reach.value, 2700);

        marks.setPin(null);
        assert.equal(marks.near.visible || marks.far.visible || marks.ring.visible || marks.line.visible, false);
        marks.dispose();
        assert.equal(near.children.length + far.children.length, 0);
    });

    it("lays the way to it floating over the ground, two corners at each point of its middle, turned to the camera in its shader, as long as it goes", () => {
        const marks = new PinMarks(new THREE.Scene(), new THREE.Scene());
        const points = Array.from({ length: 11 }, (_, k) => [k, 2 + k * 0.1, 0]);

        marks.setLine(points);

        const { position, ahead, along, across } = marks.line.geometry.attributes;
        const buffer = position.array;

        assert.equal(marks.line.visible, true);
        assert.equal(marks.wisps.points.visible, true);
        assert.equal(marks.lineLength.value, 10);
        assert.deepEqual([along.array[0], along.array[21]], [0, 10]);
        assert.deepEqual([across.array[0], across.array[1]], [-1, 1]);
        // (Both corners at its middle, WAY_LINE.over over the ground: a slope as it is, smoothed)
        assert.deepEqual([...position.array.slice(0, 3)], [...position.array.slice(3, 6)]);
        assert.ok(Math.abs(position.array[1] - (2 + WAY_LINE.over)) < 1e-6, "over the ground");
        assert.ok(Math.abs(position.array[5 * 6 + 1] - (2.5 + WAY_LINE.over)) < 1e-6, "over the ground along it");
        // (Which way it runs: along the slope)
        assert.ok(Math.abs(ahead.array[0] - 1 / Math.hypot(1, 0.1)) < 1e-6 && Math.abs(ahead.array[1] - 0.1 / Math.hypot(1, 0.1)) < 1e-6 && ahead.array[2] === 0);
        assert.match(marks.line.material.vertexShader, new RegExp(`max\\(${WAY_LINE.half.toFixed(3)}, far \\* ${WAY_LINE.least.toFixed(5)}\\)`), "its width, turned to the camera");
        assert.match(marks.line.material.vertexShader, new RegExp(`distance - ${WAY_LINE.through.toFixed(2)}`), "drawn nearer the camera than it is");
        assert.ok(marks.line.material.depthTest && !marks.line.material.depthWrite, "hidden by what's in front of it");
        assert.deepEqual(marks.line.geometry.drawRange, { start: 0, count: 10 * 6 });

        // (Laid again: the same room, nothing made anew; no longer than it has room for)
        marks.setLine(Array.from({ length: 1000 }, (_, k) => [k, 0, 0]));
        assert.equal(marks.line.geometry.attributes.position.array, buffer);
        assert.equal(marks.line.geometry.drawRange.count, (Math.floor(WAY_LINE.reach / WAY_LINE.step) + 1) * 6);

        marks.setLine([[0, 0, 0]]);
        assert.equal(marks.line.visible || marks.wisps.points.visible, false);
        marks.dispose();
    });

    it("floats the way over the ground, gliding over a bump and across a dip, never lower over it than WAY_LINE.over", () => {
        const flat = Array.from({ length: 11 }, (_, k) => [k, 0, 0]);
        const bump = flat.map(([x, , z], k) => [x, k === 5 ? 1 : 0, z]);
        const dip = flat.map(([x, , z], k) => [x, k === 5 ? -1 : 0, z]);
        const over = (points) => floatingOver(points).map(([, y], k) => y - points[k][1]);

        assert.ok(over(flat).every((y) => Math.abs(y - WAY_LINE.over) < 1e-9), "flat: just over it");
        assert.ok(over(bump).every((y) => y >= WAY_LINE.over - 1e-9), "never lower");
        assert.ok(Math.abs(over(bump)[5] - WAY_LINE.over) < 1e-9, "over the bump's top as over the rest");
        assert.ok(over(bump)[4] > WAY_LINE.over && over(bump)[4] < WAY_LINE.over + 0.5, "risen to it a little before it");
        assert.ok(over(dip)[5] > WAY_LINE.over + 0.5, "across the dip, not down into it");
        assert.ok(over(dip).every((y) => y >= WAY_LINE.over - 1e-9));
    });

    it("sends a pulse along the way from the player as time goes on, follows where they've come to along it, and lets wisps rise off it near them", () => {
        const marks = new PinMarks(new THREE.Scene(), new THREE.Scene());

        marks.update(10, 3000, [0, 0]);
        marks.update(10.2, 3000, [0, 0]);
        assert.ok(Math.abs(marks.pulse.value - 0.2 * WAY_LINE.pulse.speed) < 1e-9, "on as far as it runs in the time");
        assert.match(marks.line.material.fragmentShader, new RegExp(`float spacing = ${(WAY_LINE.pulse.every * WAY_LINE.pulse.speed).toFixed(2)}`), "one every WAY_LINE.pulse.every seconds");

        marks.setLine(Array.from({ length: 81 }, (_, k) => [k, 0, 0]));
        marks.update(11, 3000, [6.2, 0.4]);
        assert.ok(Math.abs(marks.from.value - 6.2) < 1e-9, "where they've come to along it");

        const lit = () => {
            const colours = marks.wisps.points.geometry.attributes.color.array;
            const positions = marks.wisps.points.geometry.attributes.position.array;

            return Array.from({ length: WAY_WISPS.count }, (_, k) => ({ lit: colours[k * 3 + 2], at: [positions[k * 3], positions[k * 3 + 1], positions[k * 3 + 2]] })).filter(({ lit }) => lit > 0.01);
        };

        for (let t = 11.1; t < 14; t += 0.1) {
            marks.update(t, 3000, [6.2, 0.4]);
        }

        const risen = lit();

        assert.ok(risen.length > WAY_WISPS.count / 3, `as many rising at a time (${risen.length})`);
        assert.ok(
            risen.every(({ at: [x, y] }) => x >= 6.2 + WAY_WISPS.from - 1 && x <= 6.2 + WAY_WISPS.to + 1 && y >= WAY_LINE.over - 0.01 && y <= WAY_LINE.over + WAY_WISPS.rise + 0.01),
            "off it near them, rising",
        );

        marks.setLine(null);
        marks.update(14.1, 3000, [6.2, 0.4]);
        assert.equal(lit().length, 0, "none once it's gone");
        marks.dispose();
    });

    it("stands a column of the party's green light at each ping, lower than the pin's and fading as it gets older; let go of once it's gone", () => {
        const [near, far] = [new THREE.Scene(), new THREE.Scene()];
        const beacons = new PingBeacons(near, far);

        beacons.set([
            { id: 1, x: 10, y: 4, z: 20, fade: 1 },
            { id: 2, x: -5, y: 0, z: 3, fade: 0.5 },
        ]);

        const [one, two] = [beacons.shown.get(1), beacons.shown.get(2)];

        assert.equal(near.children.length, 4, "(a column's near part and a glow round its foot, each)");
        assert.equal(far.children.length, 2);
        assert.deepEqual(one.foot.value.toArray(), [10, 4, 20]);
        assert.deepEqual([one.near.material.uniforms.height.value, one.near.material.uniforms.edge.value.toArray()], [PING_COLUMN.height, PING_COLUMN.edge]);
        assert.ok(PING_COLUMN.height < PIN_COLUMN.height);
        assert.equal(one.near.material.uniforms.strength.value, PING_COLUMN.strength);
        assert.equal(two.far.material.uniforms.strength.value, PING_COLUMN.strength * 0.5);
        assert.equal(one.near.material.vertexShader, new PinMarks(new THREE.Scene(), new THREE.Scene()).near.material.vertexShader, "(the pin's own column)");

        // (One gone: let go of; the other as it was, fainter)
        beacons.set([{ id: 2, x: -5, y: 0, z: 3, fade: 0.25 }]);
        assert.deepEqual([...beacons.shown.keys()], [2]);
        assert.equal(beacons.shown.get(2), two);
        assert.equal(two.near.material.uniforms.strength.value, PING_COLUMN.strength * 0.25);
        assert.equal(near.children.length + far.children.length, 3);
        beacons.update(3, 3000);
        assert.equal(two.far.material.uniforms.reach.value, 2700);
        beacons.dispose();
        assert.equal(near.children.length + far.children.length, 0);
    });
});
