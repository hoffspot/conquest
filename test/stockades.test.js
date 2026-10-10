// The armies' camps' stockades (client/js/core/war/stockade.js, with core/war/war.js,
// core/overworld.js and core/host.js; docs/WAR.md *The stockade*): laid out square to the world,
// its front gate towards what it's pitched against; its sections broken open in its own order;
// pitched only where it stands clear; the world's squares under it, its wall not seen through, its
// gates and breaches open, the ground within cleared and trodden; its walkway raised behind its
// wall, a stair up to it either side of each gate, fought from over its stakes; and the host
// telling the world
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { Battle, STEP_MS } from "../client/js/core/battle.js";
import { HOST_PLAYER, Host } from "../client/js/core/host.js";
import { navigatorOf } from "../client/js/core/navigation.js";
import { buildWorld, LOW, RAISED } from "../client/js/core/overworld.js";
import { GROUND } from "../client/js/core/setpieces/pieces.js";
import { SETTLEMENT_KINDS } from "../client/js/core/setpieces/town.js";
import { brokenOf, frontOf, nextBreak, SIDES, squaresOf, STOCKADE, stockadeOf, standsAt, walkwayOf } from "../client/js/core/war/stockade.js";
import { STAGES, TURN_MS, War, WAR_VERSION } from "../client/js/core/war/war.js";
import { landAt, planWorld } from "../client/js/core/worldplan/plan.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });
const key = ([x, y]) => `${x},${y}`;

let plan;

before(() => {
    plan = planWorld(3);
});

// A square's own, in the world's chunks: { blocked, solid, opaque, ground, bridge }
function squareOf(world, [x, y]) {
    const chunk = world.chunkAt(x, y);
    const k = (y - chunk.y0) * 64 + (x - chunk.x0);

    return { blocked: chunk.blocked[k], solid: chunk.solid[k], opaque: chunk.opaque[k], ground: chunk.ground[k], bridge: chunk.bridge[k] };
}

// A stockade set in the world of seed 2, clear of its start town (facing west, its front gate
// that way): the world, the stockade, and a square of it from steps out of its middle along its
// front and across it
function pitched() {
    const world = buildWorld({ seed: 2 });
    const town = world.maps.town;
    const at = [town.stamp.middle[0] + SETTLEMENT_KINDS[town.start.kind].radius + 120, town.stamp.middle[1] + 5];
    const stockade = stockadeOf({ id: "camp-900", at, front: 3 });
    const [fx, fy] = SIDES[3];

    town.setStockades([{ stockade, broken: [] }]);

    return { world, town, stockade, square: (u, v) => [stockade.middle[0] + u * fx + v * fy, stockade.middle[1] + u * fy - v * fx] };
}

function run(host, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...host.advance(STEP_MS));
    }

    return events;
}

describe("the armies' camps' stockades (stockade.js, war.js, overworld.js, host.js)", () => {
    it("lays a stockade out square to the world: a gate front and back, its walkway inside its wall and stairs up to it, the camp within", () => {
        for (const front of [0, 1, 2, 3]) {
            const stockade = stockadeOf({ id: "camp-7", at: [1000.4, 2000.7], front });
            const { half, gate, walk, lane } = STOCKADE;
            const [fx, fy] = SIDES[front];
            const local = ([x, y]) => [(x - 1000) * fx + (y - 2000) * fy, (x - 1000) * fy - (y - 2000) * fx];

            assert.deepEqual(stockade.middle, [1000, 2000]);
            assert.deepEqual(stockade.box, [1000 - half, 2000 - half, 1000 + half, 2000 + half]);

            // Its gates: in the middle of its front and back walls, each 3 squares wide, facing out
            assert.equal(stockade.gates.length, 2);

            const [ahead, behind] = stockade.gates;

            assert.deepEqual(ahead.at, [1000.5 + fx * half, 2000.5 + fy * half]);
            assert.deepEqual(behind.at, [1000.5 - fx * half, 2000.5 - fy * half]);
            assert.ok(Math.abs(Math.sin(ahead.facing) - fx) < 1e-9 && Math.abs(Math.cos(ahead.facing) - fy) < 1e-9);

            for (const { squares } of stockade.gates) {
                assert.equal(squares.length, gate * 2 + 1);
            }

            // Its wall: round it, in sections of 4 (one of 3 in the middle of each side with no gate),
            // each square once, and the gates' left open; its walkway one in from it
            const wall = squaresOf(stockade).wall;
            const gates = new Set(stockade.gates.flatMap(({ squares }) => squares.map(key)));

            assert.equal(new Set(wall.map(key)).size, wall.length);
            assert.equal(wall.length, half * 8 - gates.size);
            assert.ok(wall.every((square) => !gates.has(key(square))));
            assert.ok(wall.every((square) => Math.max(...local(square).map(Math.abs)) === half));
            assert.ok(squaresOf(stockade).walk.every((square) => Math.max(...local(square).map(Math.abs)) === half - walk));
            assert.deepEqual(stockade.sections.map(({ wall: squares }) => squares.length).sort(), [...Array(40).fill(4), 3, 3].sort());

            // Its stairs: either side of each gate, on the lane's row by the walkway, rising away
            // from the gate; coming up onto the walkway beside their upper half
            const walkway = new Set(squaresOf(stockade).walk.map(key));
            const sentries = new Set(stockade.posts.map(({ at }) => key([at[0] - 0.5, at[1] - 0.5])));

            assert.equal(stockade.stairs.length, 4);

            for (const { squares, foot, top, onto } of stockade.stairs) {
                const across = squares.map((square) => Math.abs(local(square)[1]));

                assert.ok(squares.every((square) => Math.abs(local(square)[0]) === half - walk - 1));
                assert.deepEqual(across, [gate + 2, gate + 3, gate + 4, gate + 5]);
                assert.ok(Math.abs(local([top[0] - 0.5, top[1] - 0.5])[1]) - Math.abs(local([foot[0] - 0.5, foot[1] - 0.5])[1]) === STOCKADE.stair, "(rising away from its gate)");
                assert.ok(onto.every((square) => walkway.has(key(square))) && onto.length === 2);
                assert.ok(squares.every((square) => !sentries.has(key(square))), "(clear of the sentries by the gate)");
            }

            // The camp within: its tents and its sentries inside its lane, its army facing its front gate
            for (const { at } of [...stockade.tents, ...stockade.posts]) {
                assert.ok(Math.max(...local([at[0] - 0.5, at[1] - 0.5]).map(Math.abs)) <= half - walk - lane + 1);
            }

            assert.equal(stockade.tents.length, 12);
            assert.deepEqual(stockade.fire, [1000.5, 2000.5]);
            assert.equal(stockade.parade.facing, ahead.facing);
            assert.ok(local([stockade.parade.at[0] - 0.5, stockade.parade.at[1] - 0.5])[0] === STOCKADE.parade);
        }
    });

    it("faces what it's pitched against, square to the world; with nothing to face, its own way", () => {
        assert.equal(frontOf("camp-1", [0, 0], [10, 100]), 0);
        assert.equal(frontOf("camp-1", [0, 0], [100, -10]), 1);
        assert.equal(frontOf("camp-1", [0, 0], [-10, -100]), 2);
        assert.equal(frontOf("camp-1", [0, 0], [-100, 10]), 3);

        const own = frontOf("camp-1", [0, 0], null);

        assert.ok([0, 1, 2, 3].includes(own));
        assert.equal(frontOf("camp-1", [0, 0], null), own);
    });

    it("breaks its sections open in its own order, the same every time, or the one nearest where it's pressed, the walkway behind each with it", () => {
        const stockade = stockadeOf({ id: "camp-7", at: [1000, 2000], front: 0 });
        const whole = squaresOf(stockade);
        const broken = [];

        for (let breaches = 1; breaches <= 4; breaches++) {
            broken.push(nextBreak(stockade, broken));

            const open = stockade.sections[breaches - 1];
            const left = squaresOf(stockade, broken);
            const wall = new Set(left.wall.map(key));

            assert.deepEqual(broken, Array.from({ length: breaches }, (_, k) => k), "(in its own order)");
            assert.equal(left.wall.length, whole.wall.length - stockade.sections.slice(0, breaches).reduce((sum, { wall: squares }) => sum + squares.length, 0));
            assert.ok(open.wall.every((square) => !wall.has(key(square))));
            assert.ok(open.walk.every((square) => !new Set(left.walk.map(key)).has(key(square))));
        }

        assert.deepEqual(stockadeOf({ id: "camp-7", at: [1000, 2000], front: 0 }).sections, stockade.sections);
        assert.notDeepEqual(stockadeOf({ id: "camp-8", at: [1000, 2000], front: 0 }).sections.slice(0, 4), stockade.sections.slice(0, 4));

        // Pressed in the world: the one nearest where it's pressed, then the nearest of the rest
        const near = stockade.sections[17].at;
        const after = nextBreak(stockade, [17], near);
        const apart = (k) => Math.hypot(stockade.sections[k].at[0] - near[0], stockade.sections[k].at[1] - near[1]);

        assert.equal(nextBreak(stockade, [], near), 17);
        assert.ok(stockade.sections.every((_, k) => k === 17 || apart(k) >= apart(after)));
        assert.equal(nextBreak(stockade, stockade.sections.map((_, k) => k)), null, "(none left standing)");

        // Its breaches as they're kept: its own list, or (kept before it had one) the first so many
        // in its order
        assert.deepEqual(brokenOf({ breaches: 2, broken: [17, 3] }), [17, 3]);
        assert.deepEqual(brokenOf({ breaches: 2 }), [0, 1]);
        assert.deepEqual(brokenOf({}), []);
    });

    it("stands only on dry land off the roads, clear of the settlements", () => {
        const town = plan.places.find(({ kind }) => kind === "town");

        assert.equal(standsAt(plan, town.at), false, "(not in a town)");

        // (Nor across a road, nor in water: anywhere, searching outwards from a town)
        let [road, water, clear] = [null, null, null];

        for (let r = 400; r < 3000 && !(road && water && clear); r += 37) {
            for (let a = 0; a < 24; a++) {
                const at = [town.at[0] + Math.cos(a) * r, town.at[1] + Math.sin(a) * r];
                const land = landAt(plan, ...at);

                road ??= land.road ? at : null;
                water ??= land.water ? at : null;
                clear ??= standsAt(plan, at) ? at : null;
            }
        }

        assert.ok(road && clear);
        assert.equal(standsAt(plan, road), false);
        assert.ok(!water || standsAt(plan, water) === false);
    });

    it("pitches a camp where its stockade stands, facing what it's against, and keeps which way it faces", () => {
        const war = new War(plan);

        war.stage = STAGES.length - 1;

        for (const realm of war.realms) {
            realm.leader.traits = { aggression: 0, greed: 0.5, loyalty: 0.5, grudge: 0.5, caution: 1 };
            realm.treasury = 1e5;
        }

        for (const camp of plan.camps) {
            war.scattered[camp.id] = Infinity;
        }

        war.relations["human|orc"] = { state: "hostile", since: 0 };
        war.known.push("human|orc");
        war.order("human", { raise: true });

        const army = war.armyOf("human");
        const seat = war.town(war.realm("human").seat);
        const town = war.towns.filter(({ owner }) => owner === "orc").sort((a, b) => Math.hypot(a.at[0] - seat.at[0], a.at[1] - seat.at[1]) - Math.hypot(b.at[0] - seat.at[0], b.at[1] - seat.at[1]))[0];

        army.size = war.fullOf("human");
        assert.equal(war.order("human", { attack: town.id }), true);

        let camp = null;

        for (let k = 0; k < 400 && !camp; k++) {
            war.reserveOf("orc").size = 0;
            war.realm("orc").treasury = 0;
            war.advance(TURN_MS);
            camp = war.camps.find(({ realm }) => realm === "human") ?? null;
        }

        assert.ok(camp, "(a camp pitched)");
        assert.equal(camp.front, frontOf(camp.id, camp.at, town.at));
        assert.ok(standsAt(plan, camp.at), "(on clear ground)");
        assert.deepEqual(war.stockade(camp.id), stockadeOf({ id: camp.id, at: camp.at, front: camp.front }));

        // (Kept with the war; and a war kept before the stockades had each camp face its town)
        const kept = war.snapshot();

        assert.equal(kept.version, WAR_VERSION);
        assert.equal(War.restore(plan, kept).camp(camp.id).front, camp.front);

        const older = structuredClone(kept);

        older.version = 7;
        delete older.camps.find(({ id }) => id === camp.id).front;
        assert.equal(War.restore(plan, older).camp(camp.id).front, camp.front);
    });

    it("stands over the world's squares: its wall blocked and not seen through but from its walkway, its walkway and stairs raised, its gates open, the ground within cleared and trodden", () => {
        const world = buildWorld({ seed: 2 }).maps.town;
        const at = [world.start ? 0 : 0, 0].map((_, k) => world.stamp.middle[k] + (k ? 5 : SETTLEMENT_KINDS[world.start.kind].radius + 120));
        const stockade = stockadeOf({ id: "camp-900", at, front: 3 });
        const [x0, y0, x1, y1] = stockade.box;

        // (Made once without it, its trees there)
        for (let y = y0; y <= y1; y += 32) {
            for (let x = x0; x <= x1; x += 32) {
                world.chunkAt(x, y);
            }
        }

        const changed = world.setStockades([{ stockade, broken: [] }]);

        assert.equal(changed.length, 1);
        assert.deepEqual(world.setStockades([{ stockade, broken: [] }]), [], "(nothing changed)");

        const { wall, walk } = squaresOf(stockade);

        for (const square of wall) {
            assert.deepEqual([squareOf(world, square).blocked, squareOf(world, square).solid, squareOf(world, square).opaque], [1, 1, LOW]);
            assert.ok(world.squares.opaque(...square) && world.squares.low(...square));
        }

        // (Its walkway's boards STOCKADE.high over the ground, walked on there; its stairs from
        // the ground up to them)
        for (const square of walk) {
            const [x, y] = [square[0] + 0.5, square[1] + 0.5];

            assert.deepEqual([squareOf(world, square).blocked, squareOf(world, square).solid, squareOf(world, square).bridge], [0, 0, RAISED]);
            assert.ok(Math.abs(world.heightAt(x, y) - world.ground.heightAt(x, y) - STOCKADE.high) < 1e-9);
        }

        for (const { squares, foot, top, onto } of stockade.stairs) {
            assert.ok(squares.every((square) => squareOf(world, square).bridge === RAISED && world.squares.raised(...square)));

            // (Just inside its ends: past them, the lane's ground; at its top, as high as the
            // walkway beside it)
            const along = [0.02, 0.25, 0.5, 0.75, 0.98].map((t) => [foot[0] + (top[0] - foot[0]) * t, foot[1] + (top[1] - foot[1]) * t]);
            const rise = along.map(([x, y]) => world.heightAt(x, y) - world.ground.heightAt(x, y));
            const [wx, wy] = onto.at(-1);

            assert.ok(Math.abs(rise[0]) < 0.05 && Math.abs(world.heightAt(...along[4]) - world.heightAt(wx + 0.5, wy + 0.5)) < 0.06, `(from the ground up to the walkway: ${rise})`);
            assert.ok(rise.every((each, k) => !k || each > rise[k - 1]));
        }

        for (const square of stockade.gates.flatMap(({ squares }) => squares)) {
            assert.equal(squareOf(world, square).solid, 0, "(its gates open)");
        }

        // (No tree within it, nor in its crops; its street trodden bare)
        for (let y = y0; y <= y1; y += 16) {
            for (let x = x0; x <= x1; x += 16) {
                const chunk = world.chunkAt(x, y);

                assert.ok(chunk.trees.every((tree) => tree.x < x0 - 1 || tree.x > x1 + 1 || tree.y < y0 - 1 || tree.y > y1 + 1));
            }
        }

        const [sx0, sy0] = stockade.trodden[0];

        assert.ok([GROUND.road, GROUND.grass].includes(squareOf(world, [sx0 + 2, sy0 + 10]).ground));

        // Breached: that section open, wall and walkway, the rest standing
        assert.equal(world.setStockades([{ stockade, broken: [3] }]).length, 1);

        for (const square of [...stockade.sections[3].wall, ...stockade.sections[3].walk]) {
            assert.deepEqual([squareOf(world, square).solid, squareOf(world, square).opaque, squareOf(world, square).bridge], [0, 0, 0]);
        }

        assert.equal(squareOf(world, stockade.sections[0].wall[0]).solid, 1);

        // Gone: its squares as they were
        assert.equal(world.setStockades([]).length, 1);
        assert.ok(wall.every((square) => !squareOf(world, square).solid || !squareOf(world, square).opaque));
    });

    it("has its walkway in runs, each from a gate or a breach round to the next, a stair up onto those by a gate", () => {
        const stockade = stockadeOf({ id: "camp-7", at: [1000, 2000], front: 0 });
        const whole = walkwayOf(stockade);
        const walk = squaresOf(stockade).walk;

        // Whole: either side of its gates, round its corners, a stair up onto each
        assert.equal(whole.length, 2);
        assert.ok(whole.every(({ reached }) => reached));
        assert.equal(whole.reduce((sum, { squares }) => sum + squares.length, 0), walk.length);

        // (Each square facing out over its wall, a corner's over its corner)
        for (const { square, at, facing } of whole.flatMap(({ squares }) => squares)) {
            const [dx, dy] = [square[0] - 1000, square[1] - 2000];

            assert.deepEqual(at, [square[0] + 0.5, square[1] + 0.5]);
            assert.ok(Math.sin(facing) * dx + Math.cos(facing) * dy > 0);
        }

        // Breached twice along a side with no gate: its middle a run of its own, no stair up onto
        // it; the rest of that side's run either side, each still with its stair
        const side = (k) => stockade.sections.filter((section) => section.side === k);
        const [left] = side(1).filter(({ walk: squares }) => squares.length && squares.every(([, y]) => y < 2000));
        const [right] = side(1).filter(({ walk: squares }) => squares.length && squares.every(([, y]) => y > 2000));
        const runs = walkwayOf(stockade, [stockade.sections.indexOf(left), stockade.sections.indexOf(right)]);

        assert.equal(runs.length, 4);
        assert.deepEqual(runs.map(({ reached }) => reached).sort(), [false, true, true, true]);
        assert.ok(runs.find(({ reached }) => !reached).squares.every(({ square: [x] }) => x === 1000 + STOCKADE.half - STOCKADE.walk));
    });

    it("is walked up its stairs onto its walkway, not climbed up from the lane beside it", () => {
        const { town, stockade, square } = pitched();
        const navigation = navigatorOf(town);
        const stairs = new Set(stockade.stairs.flatMap(({ squares }) => squares.map(key)));
        const on = (path) => path.slice(1).some(([x, y], k) => [0.25, 0.5, 0.75].some((t) => stairs.has(key([Math.floor(path[k][0] + (x - path[k][0]) * t), Math.floor(path[k][1] + (y - path[k][1]) * t)]))));

        // From its parade ground up onto its walkway (beside a stair's top, and half way along a
        // side): up a stair, ending on its boards
        for (const [u, v] of [[STOCKADE.half - STOCKADE.walk, -(STOCKADE.gate + 5)], [0, -(STOCKADE.half - STOCKADE.walk)]]) {
            const [x, y] = square(u, v);
            const path = navigation.path(stockade.parade.at, [x + 0.5, y + 0.5]);
            const [ex, ey] = path.at(-1);

            assert.ok(Math.hypot(ex - x - 0.5, ey - y - 0.5) < 0.3, `(gets there: ${path.at(-1)})`);
            assert.ok(on(path), "(up a stair)");
            assert.ok(Math.abs(town.heightAt(ex, ey) - town.ground.heightAt(ex, ey) - STOCKADE.high) < 1e-9);
        }

        // From the lane under it: round by a stair, not straight up
        const [lx, ly] = square(STOCKADE.half - STOCKADE.walk - 1, -12);
        const [wx, wy] = square(STOCKADE.half - STOCKADE.walk, -12);
        const path = navigation.path([lx + 0.5, ly + 0.5], [wx + 0.5, wy + 0.5]);

        assert.ok(on(path) && path.length > 2);
        assert.ok(navigation.walkable(wx + 0.5, wy + 0.5) && !navigation.walkable(wx + 0.05, wy + 0.5));
    });

    it("is fought from on its walkway: seen over its stakes from there, out of reach of blows from under it, the stakes taking shots and spells at whoever's on it as often as not", () => {
        const { world, town, square } = pitched();
        const battle = new Battle(world, { seed: 5 });
        const { half, walk } = STOCKADE;
        const add = (id, team, [u, v], weapon) => battle.add({ id, kind: "soldier", team, square: square(u, v), weapon, ai: "fort", armed: true, hp: 1e6 });
        const up = add("up", "orc", [half - walk, -10], "bow");
        const under = add("under", "orc", [half - walk - 2, -10], "bow");
        const out = add("out", "human", [half + 6, -10], "bow");

        assert.ok(town.squares.raised(...up.square) && !town.squares.raised(...under.square));

        // Seen over its stakes from its walkway, and up on it from outside; not from the ground
        // either side of them
        assert.ok(battle.canSee(out, up) && battle.canSee(up, out));
        assert.ok(!battle.canSee(out, under) && !battle.canSee(under, out));

        // Shots at whoever's on it, as often as not taken by its stakes; none at whoever's outside
        battle.remove("under");

        const events = [];

        for (let t = 0; t < 60000; t += STEP_MS) {
            events.push(...battle.advance(STEP_MS));
        }

        const at = (id, type) => events.filter((event) => event.type === type && event.id === id).length;

        assert.ok(at("up", "covered") > 5 && at("up", "hit") > 5, `(covered ${at("up", "covered")}, hit ${at("up", "hit")})`);
        assert.ok(at("up", "covered") / (at("up", "covered") + at("up", "hit")) > 0.3 && at("up", "covered") / (at("up", "covered") + at("up", "hit")) < 0.7);
        assert.equal(at("out", "covered"), 0);
        assert.ok(at("out", "hit") > 5);

        // Out of reach of a blow from the lane under it; not from beside it on it
        const blows = new Battle(world, { seed: 6 });
        const swords = (id, team, at) => blows.add({ id, kind: "soldier", team, square: square(...at), weapon: "sword", ai: "fort", armed: true, hp: 1e6 });

        swords("on", "orc", [half - walk, -10]);
        swords("below", "human", [half - walk - 1, -10]);

        const struck = [];

        for (let t = 0; t < 3000; t += STEP_MS) {
            struck.push(...blows.advance(STEP_MS).filter(({ type }) => type === "attack"));
        }

        assert.equal(struck.length, 0, "(none from under it)");

        swords("beside", "human", [half - walk, -11]);

        for (let t = 0; t < 3000; t += STEP_MS) {
            struck.push(...blows.advance(STEP_MS).filter(({ type }) => type === "attack"));
        }

        assert.ok(struck.some(({ id }) => id === "beside") && struck.some(({ id, target }) => id === "on" && target === "beside"));
        assert.ok(!struck.some(({ id }) => id === "below"));
    });

    it("covers one hacking at its stakes, hard against them, from shots down from its walkway as often as not; no one else there", () => {
        const { world, square } = pitched();
        const { half, walk } = STOCKADE;
        // (Shot at from its walkway for a minute: how many of the shots its stakes took)
        const shotAt = (seed, siege) => {
            const battle = new Battle(world, { seed });

            battle.add({ id: "up", kind: "soldier", team: "orc", square: square(half - walk, -10), weapon: "bow", ai: "fort", armed: true, hp: 1e6 });
            battle.add({ id: "below", kind: "soldier", team: "human", square: square(half + 1, -10), weapon: "sword", ai: "fort", armed: true, hp: 1e6 });
            battle.actor("below").siege = siege;

            const events = [];

            for (let t = 0; t < 60000; t += STEP_MS) {
                events.push(...battle.advance(STEP_MS).filter(({ id }) => id === "below"));
            }

            return { covered: events.filter(({ type }) => type === "covered").length, hit: events.filter(({ type }) => type === "hit").length };
        };
        const hacking = shotAt(7, "camp-x/stakes-0");
        const standing = shotAt(7, null);

        assert.ok(hacking.covered > 5 && hacking.hit > 5, `(covered ${hacking.covered}, hit ${hacking.hit})`);
        assert.ok(hacking.covered / (hacking.covered + hacking.hit) > 0.3 && hacking.covered / (hacking.covered + hacking.hit) < 0.7);
        assert.equal(standing.covered, 0);
        assert.ok(standing.hit > 5);
    });

    it("stands an army met at its camp on its parade ground, facing out of its front gate", () => {
        const host = new Host(buildWorld({ seed: 2 }), { populate: false });

        host.join({ id: HOST_PLAYER, hero: HERO });
        host.populate();

        const war = host.war;
        const [mx, my] = host.world.stamp.middle;
        const at = [mx + 230, my + 40];
        const camp = { id: "camp-900", realm: "orc", at, guard: 6, built: 0, done: 0, toward: null, used: 1e6, skirmished: 1e6, breaches: 0, troubled: null };
        const army = { id: "force-900", realm: "orc", kind: "army", size: 30, at: [...at], path: [[...at]], leg: 0, target: null, home: war.realm("orc").seat, mission: "camp", about: [...at], camp: camp.id, orders: null, went: 30, arrived: null, supply: { due: 1e6, missed: 0 }, since: 0 };
        const player = host.battle.actor(HOST_PLAYER);

        Object.assign(host.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        war.relations["human|orc"] = { state: "hostile", since: 0 };
        war.stage = STAGES.length - 1;
        war.camps.push(camp);
        war.forces.push(army);
        Object.assign(player, { square: [mx + 170, my], x: mx + 170.5, y: my + 0.5, path: [], order: null, target: null });

        // (As it's stood up: it advances on what enemy it sees after)
        for (let t = 0; t < 2000 && !host.armies.has(army.id); t += STEP_MS) {
            run(host, STEP_MS);
        }

        const met = host.armies.get(army.id);
        const { parade } = war.stockade(camp.id);
        const formation = host.battle.formations[met.formation];

        assert.ok(met, "(met)");
        assert.ok(Math.hypot(formation.anchor[0] - parade.at[0], formation.anchor[1] - parade.at[1]) < 1.5, "(on its parade ground)");
        assert.ok(Math.abs(Math.sin(formation.facing - parade.facing)) < 1e-6 && Math.cos(formation.facing - parade.facing) > 0, "(facing its front gate)");
    });

    it("tells the world of a camp's stockade once it's built, and again as it's breached or comes down", () => {
        const host = new Host(buildWorld({ seed: 2 }), { populate: false });
        const world = host.world.maps.town;

        host.join({ id: HOST_PLAYER, hero: HERO });

        const war = host.war;
        const home = war.town(host.world.start.id);
        const at = [host.world.stamp.middle[0] + SETTLEMENT_KINDS[host.world.start.kind].radius + 120, host.world.stamp.middle[1] + 5];
        const camp = { id: "camp-900", realm: "orc", at, guard: 6, built: null, done: 1e9, toward: home.id, used: 1e6, skirmished: 1e6, breaches: 0, troubled: null };

        war.relations["human|orc"] = { state: "hostile", since: 0 };
        war.camps.push(camp);

        // (Going up: none yet)
        run(host, TURN_MS);

        const stockade = war.stockade(camp.id);
        const square = stockade.sections[0].wall[0];

        assert.equal(squareOf(world, square).solid, 0);

        // Built
        camp.built = war.turn;

        const built = run(host, TURN_MS);

        assert.ok(built.some(({ type }) => type === "stockades"));
        assert.equal(squareOf(world, square).solid, 1);
        assert.equal(squareOf(world, square).opaque, LOW);

        // Breached
        Object.assign(camp, { breaches: 1, broken: [0] });

        const breached = run(host, TURN_MS);

        assert.ok(breached.some(({ type }) => type === "stockades"));
        assert.equal(squareOf(world, square).solid, 0);
        assert.equal(squareOf(world, stockade.sections[1].wall[0]).solid, 1);

        // Gone
        war.camps.splice(war.camps.indexOf(camp), 1);
        run(host, TURN_MS);
        assert.equal(squareOf(world, stockade.sections[1].wall[0]).solid, 0);
    });
});
