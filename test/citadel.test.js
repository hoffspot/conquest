// The humans' hill citadels (client/js/core/setpieces/citadel.js, core/sites.js, the terrain plan's
// M7i-4): three wards one above another up a hill, each walled round, its gate a quarter of the way
// round from the last; the keep in the inner close's corner, the hall and the chapel round it; a
// round moat round the outer ward, a bridge and drawbridge over it to the outer gate, a gate tower
// at its far side; set down clear of the roads and the water, its wards' terraces levelled one above
// another, its moat dug into its hill and its hill eased out into the land; its walls, towers and
// buildings standing in the way, its wards' open ground courtyards, its moat's water; walked into
// over its bridge and up its stairs (the terrain plan's M7.5b-3e), its keep gone into; no fields or
// hedges on the ground it keeps clear; its parts drawn by the chunks they stand in, in its budget,
// the great keep over everything; and seen from afar
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import * as THREE from "three";

// (Textured materials paint a canvas: enough of one for them to in Node)
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => new Proxy({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) }, { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })) }) }) };

const { approachOf, CITADEL, citadelLevel, citadelParts, citadelWays, inMoat, insideCitadel, insideWard, layoutCitadel, moatReach, sideTurn, towersOf } = await import("../client/js/core/setpieces/citadel.js");
const { STEP_MS } = await import("../client/js/core/battle.js");
const { HOST_PLAYER, Host } = await import("../client/js/core/host.js");
const { solidAt } = await import("../client/js/core/setpieces/castles.js");
const { buildWorld, CHUNK } = await import("../client/js/core/overworld.js");
const { GROUND } = await import("../client/js/core/setpieces/pieces.js");
const { HEIGHT_STEP, landHeight } = await import("../client/js/core/terrain/height.js");
const { CITADEL_LOOK, citadelPart } = await import("../client/js/world/art/kits/citadel.js");
const { citadelShapes, Shapes } = await import("../client/js/world/far/shapes.js");
const { planWorld, WORLD_SIZE } = await import("../client/js/core/worldplan/plan.js");

// (A human castle's site set down in a world, and the world)
function citadelOf(seed) {
    const world = buildWorld({ seed });
    const land = world.maps.town;
    const site = world.plan.sites.find(({ race, kind }) => race === "human" && kind === "castle");

    land.sites.settle(Math.floor(site.at[0] / CHUNK), Math.floor(site.at[1] / CHUNK));

    return { world, land, site, set: land.sites.set.get(site.id) };
}

const triangles = (object) => {
    let count = 0;

    object.traverse((node) => {
        if (node.isMesh) {
            count += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3;
        }
    });

    return count;
};

describe("a hill citadel laid out (core/setpieces/citadel.js)", () => {
    it("is three wards one above another, each walled round, smaller and higher inwards, the inner a square round the keep; the same for the same seed", () => {
        for (const seed of [1, 2, 3, 99, 12345]) {
            const citadel = layoutCitadel({ seed });

            assert.deepEqual(layoutCitadel({ seed }), citadel);
            assert.equal(citadel.wards.length, CITADEL.wards.length);

            for (const [k, ward] of citadel.wards.entries()) {
                const spec = CITADEL.wards[k];

                assert.ok(ward.sides >= spec.sides[0] && ward.sides <= spec.sides[1] && ward.sides % 2 === 0);
                assert.ok(ward.apothem >= spec.apothem[0] && ward.apothem <= spec.apothem[1]);

                if (k) {
                    const below = citadel.wards[k - 1];

                    assert.ok(ward.apothem < below.apothem - below.thick - 10, `ward ${k} inside ward ${k - 1}, room between`);
                    assert.ok(ward.rise - below.rise >= CITADEL.terrace.rise[0] - 1e-9 && ward.rise - below.rise <= CITADEL.terrace.rise[1] + 1e-9);
                }

                // (Its corner towers, standing out past its walls, clear of the wall round it)
                if (k) {
                    const below = citadel.wards[k - 1];
                    const reach = Math.max(...towersOf(citadel, ward).map(([u, v]) => Math.hypot(u, v))) + ward.tower;

                    assert.ok(reach + 2.5 <= below.apothem - below.thick, `seed ${seed}: ward ${k}'s towers ${(below.apothem - below.thick - reach).toFixed(1)} m clear`);
                }

                // (Its towers 30 to 60 m apart, every stretch of wall well within bowshot of both
                // ends; the inner walls higher than the outer)
                const [a, b] = towersOf(citadel, ward);

                assert.ok(!k || ward.wall > citadel.wards[k - 1].wall);

                assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) > 30 && Math.hypot(a[0] - b[0], a[1] - b[1]) < 60, `seed ${seed} ward ${k}'s towers ${Math.hypot(a[0] - b[0], a[1] - b[1]).toFixed(1)} m apart`);
            }

            assert.equal(citadel.wards.at(-1).sides, 4);

            // (Its gates a quarter of the way round each from the last, the same way, the outer at the front)
            const ways = citadel.wards.map((ward) => sideTurn(ward.sides, ward.gate));

            assert.equal(citadel.wards[0].gate, 0);

            for (let k = 1; k < ways.length; k++) {
                const turn = (((ways[k] - ways[k - 1]) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;

                assert.ok(Math.abs(Math.abs(turn) - Math.PI / 2) < 0.4, `seed ${seed}: gate ${k} ${turn.toFixed(2)} round`);
            }

            // (The keep in the inner ward, away from its gate, its corners and their towers clear
            // of its walls; the hall and the chapel clear of it)
            const inner = citadel.wards.at(-1);
            const { keep } = citadel;
            const half = keep.size / 2 + Math.max(keep.needle, keep.bartizan);
            const gate = sideTurn(inner.sides, inner.gate);

            assert.ok(keep.at[0] * Math.cos(gate) + keep.at[1] * Math.sin(gate) < -4, `seed ${seed}: the keep at the back`);

            for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
                assert.ok(insideWard(citadel, inner, [keep.at[0] + su * half, keep.at[1] + sv * half], -inner.thick - 2));
            }

            const parts = citadelParts(citadel);

            for (const part of parts.filter((each) => each.part === "hall" || each.part === "chapel")) {
                const [nu, nv] = [Math.cos(part.turn), Math.sin(part.turn)];
                const [au, av] = [-nv, nu];

                for (let t = -0.5; t <= 0.5; t += 0.05) {
                    for (const d of [-0.5, 0.5]) {
                        const [u, v] = [part.at[0] + au * t * part.length + nu * d * part.deep, part.at[1] + av * t * part.length + nv * d * part.deep];

                        assert.ok(Math.max(Math.abs(u - keep.at[0]), Math.abs(v - keep.at[1])) > half + 1.5, `seed ${seed}: the ${part.part} clear of the keep`);
                        assert.ok(insideWard(citadel, inner, [u, v], -inner.thick + 0.01), `seed ${seed}: the ${part.part} inside the close`);
                    }
                }
            }

            // (Each stair, doubling back, short of the towers at the ends of its wall)
            for (const stair of parts.filter((each) => each.part === "stair")) {
                const ward = citadel.wards[stair.ward];
                const { rise, tread, wide } = CITADEL_LOOK.stair;
                const reach = 2.6 + (Math.round(stair.climb / 2 / rise) - 1) * tread + wide;
                const [nu, nv] = [Math.cos(stair.turn), Math.sin(stair.turn)];

                for (const [u, v] of towersOf(citadel, ward)) {
                    const [along, out] = [Math.abs((u - stair.at[0]) * -nv + (v - stair.at[1]) * nu), (u - stair.at[0]) * nu + (v - stair.at[1]) * nv];
                    const gap = Math.hypot(Math.max(0, along - reach), Math.max(0, out - wide * 2, -out));

                    assert.ok(gap > 0.5, `seed ${seed}: ward ${stair.ward}'s stair clear of its towers (${gap.toFixed(2)} m)`);
                }
            }
        }

        assert.notDeepEqual(layoutCitadel({ seed: 1 }), layoutCitadel({ seed: 2 }));
    });

    it("is built of walls and towers round each ward, a stair up to each gate but the outer's, its round moat's far side, the bridge and gate tower, ranges of buildings, the hall, the chapel and the keep", () => {
        const citadel = layoutCitadel({ seed: 1 });
        const parts = citadelParts(citadel);
        const count = (part, ward) => parts.filter((each) => each.part === part && (ward === undefined || each.ward === ward)).length;

        for (const [k, ward] of citadel.wards.entries()) {
            assert.equal(count("wall", k), ward.sides);
            assert.equal(count("tower", k), ward.sides);
            assert.equal(parts.filter((each) => each.part === "wall" && each.ward === k && each.gate).length, 1);
            assert.equal(count("stair", k), k ? 1 : 0);
        }

        assert.equal(count("keep"), 1);
        assert.equal(count("counterscarp"), CITADEL.moat.arcs);
        assert.equal(count("bridge"), 1);
        assert.equal(count("gatetower"), 1);

        // (The moat round, CITADEL.moat.wide at the least past the outer towers' faces; its far side
        // in stretches of the one circle, all round it but where the gate tower stands)
        const face = moatReach(citadel, "face");
        const arcs = parts.filter((each) => each.part === "counterscarp");
        const missing = (2 * Math.PI - arcs.reduce((sum, { span }) => sum + span, 0)) * face;
        const [outer] = citadel.wards;

        assert.ok(towersOf(citadel, outer).every((at) => face - Math.hypot(...at) - outer.tower >= CITADEL.moat.wide - 1e-9));
        assert.ok(arcs.every((arc) => arc.radius === face && Math.abs(Math.hypot(...arc.at) - face) < 1e-9));
        assert.ok(missing > 0 && missing < CITADEL.gatetower.wide - 1, `${missing.toFixed(1)} m of the far side in the gate tower`);

        // (The bridge from the outer wall's face to the gate tower; the gate tower standing out into
        // the water from the far side, and back over the glacis)
        const bridge = parts.find((each) => each.part === "bridge");
        const tower = parts.find((each) => each.part === "gatetower");

        assert.ok(Math.abs(bridge.at[1] + bridge.long - (tower.at[1] - tower.deep / 2)) < 1e-9);
        assert.ok(tower.at[1] - tower.deep / 2 < face && tower.at[1] + tower.deep / 2 > moatReach(citadel, "lip") && tower.at[1] + tower.deep / 2 <= moatReach(citadel, "glacis"));
        assert.equal(count("hall", citadel.wards.length - 1), 1);
        assert.equal(count("chapel", citadel.wards.length - 1), 1);
        assert.ok(count("range") >= 2, `${count("range")} ranges`);

        // (Each part stands on its ward's terrace and reaches down past it: a ward's wall down the
        // face of the terrace below)
        for (const part of parts) {
            const ward = citadel.wards[part.ward];

            assert.ok(part.drop > 0);

            if (part.part === "wall" && part.ward) {
                assert.ok(part.drop > ward.rise - citadel.wards[part.ward - 1].rise, "down its terrace's face");
            }
        }
    });
});

describe("a hill citadel walked (core/setpieces/citadel.js citadelWays)", () => {
    it("has decks that join: the way in from the glacis to inside the outer gate, level; each stair's flights from the terrace below up to its gate's landing and on through the wall, each at the height the last left off; its stair built to the measures the art builds it", () => {
        assert.deepEqual({ ...CITADEL.stair, platform: undefined }, { ...CITADEL_LOOK.stair, platform: undefined });

        for (const seed of [1, 7, 23]) {
            const citadel = layoutCitadel({ seed });
            const { decks, solid, door } = citadelWays(citadel);
            const [way, ...stairs] = decks;

            assert.deepEqual([way.from, way.to], [0, 0]);
            assert.ok(way.a[1] > moatReach(citadel, "face") && way.b[1] < citadel.wards[0].apothem - citadel.wards[0].thick, "from the glacis to inside the outer gate");
            assert.equal(stairs.length, 10);

            for (const [k, ward] of citadel.wards.slice(1).entries()) {
                const [lower, turn, upper, landing, passage] = stairs.slice(k * 5, k * 5 + 5);
                const below = citadel.wards[k].rise;

                assert.deepEqual([lower.from, lower.to, turn.from, upper.from, upper.to, landing.from, passage.to], [below, turn.to, turn.to, turn.to, ward.rise, ward.rise, ward.rise]);
                assert.ok(insideWard(citadel, ward, passage.b, -1), "the passage ends inside the ward");
                assert.ok(!solidAt({ solid }, passage.b), "on its open ground");
            }

            assert.ok(solidAt({ solid }, door.at), "the keep stands in the way");
        }
    });
});

describe("a hill citadel set down (core/sites.js)", () => {
    let one;

    before(() => {
        one = citadelOf(1);
    });

    it("is the humans' castle, set down clear of the roads and the water wherever their castle is, near its plan's spot (or, with no room near it, farther off)", () => {
        // (Seed 4242's has no room within CITADEL.room.shift: roads and water all round)
        for (const seed of [1, 2, 3, 7, 4242]) {
            const { land, site, set } = seed === 1 ? one : citadelOf(seed);

            assert.ok(set?.citadel, `seed ${seed}: set down`);
            assert.ok(Math.hypot(set.x - site.at[0], set.y - site.at[1]) <= (seed === 4242 ? CITADEL.room.farther : CITADEL.room.shift) + 1e-9, `seed ${seed}`);

            for (const k of [...set.squares].filter((_, n) => n % 7 === 0)) {
                const [x, y] = [k % WORLD_SIZE, Math.floor(k / WORLD_SIZE)];
                const square = land.landAt(x, y);

                assert.ok(!square.water && square.road !== "trade" && square.road !== "road", `seed ${seed}: ${x}, ${y} clear`);
            }
        }
    });

    it("levels its wards' terraces one above another, its round moat dug into its hill, the glacis up to its far side's coping all round, its hill eased out into the land round it", () => {
        const { land, world, set } = one;
        const { citadel, x, y, facing } = set;
        const base = citadelLevel(world.plan, citadel, x, y, facing);
        const place = ([u, v]) => [x + u * Math.cos(facing) + v * Math.sin(facing), y - u * Math.sin(facing) + v * Math.cos(facing)];
        const step = (height) => Math.round(height / HEIGHT_STEP) * HEIGHT_STEP;

        // (Its glacis, its moat's bed, then each ward)
        assert.equal(set.pads.length, 5);
        assert.deepEqual(
            set.pads.map(({ level }) => level),
            [step(base), step(base - CITADEL.moat.deep), ...citadel.wards.map(({ rise }) => step(base + rise))],
        );

        for (const [k, ward] of citadel.wards.entries()) {
            // (Just inside its wall, and between it and the next ward in, between that ward's
            // towers: its own level)
            const next = citadel.wards[k + 1];
            const turn = sideTurn(next?.sides ?? ward.sides, 1);
            const at = (r) => place([Math.cos(turn) * r, Math.sin(turn) * r]);
            const inside = next ? (ward.apothem - ward.thick + next.apothem + CITADEL.terrace.ease) / 2 : 4;

            assert.ok(Math.abs(land.ground.heightAt(...at(inside)) - set.pads[k + 2].level) < 0.05, `ward ${k}: ${land.ground.heightAt(...at(inside)).toFixed(2)} at ${set.pads[k + 2].level.toFixed(2)}`);
        }

        // (Its moat: its bed from its outer wall's foot out to its far side's face (the ground's
        // lattice rounding its edge), its water over it; the glacis past it at the outer ward's
        // level, up to the back of its far side's coping all round (so there's nothing to see under
        // the coping); the hill eased out from its edge over CITADEL.hill.ease into the land)
        const [outer] = citadel.wards;
        const turn = sideTurn(outer.sides, 2);
        const out = (r, way = turn) => place([Math.cos(way) * r, Math.sin(way) * r]);
        const [face, lip] = [moatReach(citadel, "face"), moatReach(citadel, "lip")];

        for (const r of [outer.apothem + 1, (outer.apothem + face) / 2, face - 1.5]) {
            assert.ok(Math.abs(land.ground.heightAt(...out(r)) - set.pads[1].level) < 0.05, `moat's bed ${r.toFixed(1)} m out`);
            assert.ok(Math.abs(land.surfaceAt(...out(r)) - set.water) < 1e-9);
        }

        for (let k = 0; k < 64; k++) {
            assert.ok(Math.abs(land.ground.heightAt(...out(lip, (k * Math.PI) / 32)) - set.pads[0].level) < 0.05, `the glacis at the coping's back, ${k}`);
        }

        assert.ok(Math.abs(land.ground.heightAt(...out(lip + 4)) - set.pads[0].level) < 0.05, "the glacis");
        assert.ok(Math.abs(land.ground.heightAt(...out(moatReach(citadel, "glacis") + CITADEL.hill.ease + 2)) - landHeight(world.plan, ...out(moatReach(citadel, "glacis") + CITADEL.hill.ease + 2))) < 1);

        // (Its squares the moat's on in under its far side's wall, nearly to its back: water,
        // blocked; and behind that, CITADEL.moat.kept past it, built ground, blocked but seen over:
        // no cliff drawn on the steep ground under the wall; but where the gate tower stands)
        for (let k = 0; k < 64; k++) {
            for (const r of [face + 0.3, face + 1.2, lip - 0.6, lip + 0.2, lip + 1]) {
                const [px, py] = out(r, (k * Math.PI) / 32);
                const [i, j] = [Math.floor(px), Math.floor(py)];
                const at = [(i + 0.5 - x) * Math.cos(facing) - (j + 0.5 - y) * Math.sin(facing), (i + 0.5 - x) * Math.sin(facing) + (j + 0.5 - y) * Math.cos(facing)];
                const [chunk, square] = [land.chunkAt(i, j), (j % CHUNK) * CHUNK + (i % CHUNK)];

                if (insideCitadel(citadel, at, 0.5)) {
                    continue;
                }

                if (Math.hypot(...at) < lip - 0.5) {
                    assert.ok(chunk.water[square] && land.squares.blocked(i, j), `${i}, ${j} under the far side's wall`);
                } else if (Math.hypot(...at) < lip + CITADEL.moat.kept) {
                    assert.ok(!chunk.water[square] && chunk.solid[square] && land.squares.blocked(i, j) && !land.squares.opaque(i, j), `${i}, ${j} behind the far side's wall`);
                }
            }
        }
    });

    it("takes the squares its walls, towers and buildings stand on (blocked, unseen through), its wards' open ground and the way over its bridge and through its gate tower courtyards; its moat water, too deep to wade; the ground outside open, kept clear of fields and hedges", () => {
        const { land, set } = one;
        const { citadel, x, y, facing } = set;
        const [outer] = citadel.wards;
        const local = (px, py) => [(px - x) * Math.cos(facing) - (py - y) * Math.sin(facing), (px - x) * Math.sin(facing) + (py - y) * Math.cos(facing)];
        let [checked, outside] = [0, 0];

        const { gatetower } = approachOf(citadel);
        const inTower = ([u, v]) => u > gatetower.u0 + 0.5 && u < gatetower.u1 - 0.5 && v > gatetower.v0 + 0.5 && v < gatetower.v1 - 0.5;
        const ways = citadelWays(citadel);
        const way = new Set(set.entrance.clear.map(String));
        let [tower, moat, fields, open] = [0, 0, 0, 0];

        for (let j = Math.floor(y) - 180; j < y + 180; j += 3) {
            for (let i = Math.floor(x) - 180; i < x + 180; i += 3) {
                const at = local(i + 0.5, j + 0.5);

                if (insideWard(citadel, outer, at, -0.5) || inTower(at)) {
                    checked++;
                    tower += inTower(at) ? 1 : 0;

                    // (What stands there blocked, and not seen through, but the ways over it (its
                    // stairs' flights and the passages through its gates) and the way to its keep's
                    // door; the rest open, but where it's too steep to stand, down a terrace's face
                    // under its wall)
                    if (land.sites.deckAt(i, j) || way.has(String([i, j]))) {
                        continue;
                    }

                    if (solidAt(ways, at)) {
                        assert.ok(land.squares.blocked(i, j) && land.squares.opaque(i, j), `${i}, ${j} blocked`);
                    } else if (!solidAt(ways, at, -0.8) && !land.squares.blocked(i, j)) {
                        open++;
                    }

                    assert.equal(land.squares.ground(i, j), GROUND.courtyard);
                } else if (inMoat(citadel, at) && !insideCitadel(citadel, at, 1) && Math.hypot(...at) < moatReach(citadel, "face") - 1.5) {
                    // (Water, too deep to wade, seen over)
                    moat++;
                    assert.ok(land.chunkAt(i, j).water[(j % CHUNK) * CHUNK + (i % CHUNK)] && land.squares.blocked(i, j) && !land.squares.opaque(i, j), `${i}, ${j} moat`);
                    assert.ok(Math.abs(land.surfaceAt(i + 0.5, j + 0.5) - set.water) < 1e-9 && land.ground.heightAt(i + 0.5, j + 0.5) < set.water - 2);
                } else if (!insideCitadel(citadel, at, 3) && !inMoat(citadel, at) && !land.squares.blocked(i, j)) {
                    outside++;
                }

                // (No fields nor hedges on the ground it keeps clear)
                if (Math.hypot(i + 0.5 - x, j + 0.5 - y) < set.clearing - 1) {
                    fields += land.landAt(i, j).crop || land.hedgeAt(i, j) ? 1 : 0;
                }
            }
        }

        assert.ok(checked > 2000 && tower > 4 && moat > 300 && outside > 200 && open > checked / 3, `${checked} in (${tower} in its gate tower, ${open} open), ${moat} of its moat, ${outside} open outside`);
        assert.equal(fields, 0);
    });

    it("is walked into (the terrain plan's M7.5b-3e): from its glacis through its gate tower, over its moat and through its outer gate, round its wards and up the stairs to their gates, its decks at its wards' heights; its keep gone into, its lord or lady on the throne", () => {
        const { world, land, site, set } = citadelOf(1);
        const host = new Host(world, { populate: false });

        host.join({ id: HOST_PLAYER, hero: { name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false } });
        host.populate();
        Object.assign(host.battle.actor("orc"), { dead: true, respawnAt: Infinity });

        const me = host.battle.actor(HOST_PLAYER);
        const keep = world.interiors.buildings.get(`site:${site.id}`);
        const far = moatReach(set.citadel, "face") + CITADEL.gatetower.deep + 4;
        const out = [Math.floor(set.x + far * Math.sin(set.facing)), Math.floor(set.y + far * Math.cos(set.facing))];
        const levels = set.citadel.wards.map(({ rise }) => Math.round((set.level + rise) / HEIGHT_STEP) * HEIGHT_STEP);
        const heights = new Set();

        assert.equal(keep.kind, "keep");
        assert.equal(keep.people, "human");
        assert.ok(set.decks.length >= 11, "the way in and two stairs");

        Object.assign(me, { hp: 1e6, maxHp: 1e6, square: out, x: out[0] + 0.5, y: out[1] + 0.5, path: [], order: null, target: null, spawn: out });
        assert.equal(host.command(HOST_PLAYER, { type: "enter", link: keep.door.id }).ok, true);

        for (let t = 0; t < 300000 && me.map === "town"; t += STEP_MS) {
            host.advance(STEP_MS);

            const h = land.heightAt(me.x, me.y);

            heights.add(levels.findIndex((level) => Math.abs(h - level) < 0.2));
        }

        assert.equal(me.map, keep.maps[0]);
        assert.ok([0, 1, 2].every((ward) => heights.has(ward)), `stood on every ward's terrace: ${[...heights]}`);
        assert.match(host.folk.get(`${keep.key}/ruler`).title, new RegExp(`^(Lord|Lady) of ${keep.name}$`));
    });

    it("has its parts drawn by the chunks they stand in, each once", () => {
        const { land, set } = one;
        const chunks = new Set(set.pieces.map(({ x, y }) => `${Math.floor(x / CHUNK)},${Math.floor(y / CHUNK)}`));
        const found = [...chunks].flatMap((key) => land.sites.piecesIn(...key.split(",").map(Number)).filter(({ site }) => site === set.site.id));

        assert.ok(chunks.size >= 4, `${chunks.size} chunks`);
        assert.equal(found.length, set.pieces.length);
        assert.equal(new Set(found).size, found.length);

        for (const piece of found) {
            assert.equal(piece.kind, "citadel");
            assert.ok(Number.isFinite(piece.base));
        }
    });
});

describe("a hill citadel drawn (world/art/kits/citadel.js, world/far/shapes.js)", () => {
    it("is built part by part within its budget (30 to 80 thousand triangles near), the keep's spires over everything", () => {
        const citadel = layoutCitadel({ seed: 1 });
        const parts = citadelParts(citadel);
        let total = 0;
        const tops = { keep: 0, tower: 0 };

        for (const part of parts) {
            const built = citadelPart({ ...part, kind: "citadel" });
            const count = triangles(built);

            assert.ok(count > 0, `${part.part} built`);
            total += count;

            built.updateMatrixWorld(true);

            const box = { max: -Infinity };

            built.traverse((node) => {
                if (node.isMesh) {
                    node.geometry.computeBoundingBox();
                    box.max = Math.max(box.max, node.geometry.boundingBox.max.y / 5 + part.rise);
                }
            });

            if (part.part in tops) {
                tops[part.part] = Math.max(tops[part.part], box.max);
            }
        }

        assert.ok(total > 15000 && total < 80000, `${total} triangles`);
        assert.ok(tops.keep > tops.tower + 10, `the keep to ${tops.keep.toFixed(1)} m, the towers to ${tops.tower.toFixed(1)} m`);
    });

    it("paves its gates' passages a little over their terrace's level, not level with the ground under them", () => {
        // (Level with it, the stones and the ground flickered by turns under every gate's arch)
        const citadel = layoutCitadel({ seed: 1 });
        const gates = citadelParts(citadel).filter((part) => part.gate?.wide || part.part === "gatetower");

        assert.ok(gates.length >= 3, `${gates.length} gates`);

        for (const part of gates) {
            const built = citadelPart({ ...part, kind: "citadel" });
            // (The heights of the faces looking up in the middle of its way through, metres)
            const ups = [];

            built.updateMatrixWorld(true);
            built.traverse((node) => {
                if (!node.isMesh) {
                    return;
                }

                const at = node.geometry.attributes.position;
                const index = node.geometry.index ? node.geometry.index.array : Array.from({ length: at.count }, (_, k) => k);

                for (let t = 0; t < index.length; t += 3) {
                    const [a, b, c] = [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(at, index[t + k]).applyMatrix4(node.matrixWorld));
                    const up = b.clone().sub(a).cross(c.clone().sub(a)).normalize().y;
                    const middle = a.clone().add(b).add(c).divideScalar(3);

                    if (up > 0.99 && Math.abs(middle.x) < 5 && Math.abs(middle.y) < 2.5) {
                        ups.push(middle.y / 5);
                    }
                }
            });

            assert.ok(ups.length > 0, `${part.part}: its way through paved`);
            assert.ok(ups.every((y) => Math.abs(y) > 0.02), `${part.part}: nothing level with its terrace (${ups.map((y) => y.toFixed(3)).join(", ")} m)`);
            assert.ok(ups.some((y) => Math.abs(y - 0.05) < 0.005), `${part.part}: paved 5 cm over it`);
        }
    });

    it("is seen from afar as its wards' walls and towers, its moat, bridge and gate tower, its hall and chapel and the keep, in under 2,000 triangles", () => {
        const plan = planWorld(1);
        const shapes = new Shapes();
        const heightOf = (x, z) => landHeight(plan, x, z);

        citadelShapes(shapes, { plan, seed: 1, x: 4064, z: 4624, facing: 2.36, heightOf });

        const ys = shapes.positions.filter((_, k) => k % 3 === 1);

        assert.ok(shapes.triangles > 200 && shapes.triangles < 2000, `${shapes.triangles} triangles`);
        assert.ok(Math.max(...ys) > citadelLevel(plan, layoutCitadel({ seed: 1 }), 4064, 4624, 2.36) + 50, "its keep's spires");
    });
});
