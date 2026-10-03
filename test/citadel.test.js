// The humans' hill citadels (client/js/core/setpieces/citadel.js, core/sites.js, the terrain plan's
// M7i-4): three wards one above another up a hill, each walled round, its gate a quarter of the way
// round from the last; the keep in the inner close's corner, the hall and the chapel round it, a
// barbican before the outer gate; set down clear of the roads and the water, its wards' terraces
// levelled one above another and its hill eased out into the land; every square inside its outer
// wall, under its towers and in its barbican its own, its wards' courtyards; its parts drawn by
// the chunks they stand in, in its budget, the great keep over everything; and seen from afar
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

// (Textured materials paint a canvas: enough of one for them to in Node)
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => new Proxy({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) }, { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })) }) }) };

const { barbicanOf, CITADEL, citadelLevel, citadelParts, insideCitadel, insideWard, layoutCitadel, sideTurn, towersOf } = await import("../client/js/core/setpieces/citadel.js");
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

    it("is built of walls and towers round each ward, a stair up to each gate but the outer's, a barbican, ranges of buildings, the hall, the chapel and the keep", () => {
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
        assert.equal(count("barbican"), 1);
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

describe("a hill citadel set down (core/sites.js)", () => {
    let one;

    before(() => {
        one = citadelOf(1);
    });

    it("is the humans' castle, set down clear of the roads and the water wherever their castle is, near its plan's spot", () => {
        for (const seed of [1, 2, 3, 7]) {
            const { land, site, set } = seed === 1 ? one : citadelOf(seed);

            assert.ok(set?.citadel, `seed ${seed}: set down`);
            assert.ok(Math.hypot(set.x - site.at[0], set.y - site.at[1]) <= CITADEL.room.shift + 1e-9);

            for (const k of [...set.squares].filter((_, n) => n % 7 === 0)) {
                const [x, y] = [k % WORLD_SIZE, Math.floor(k / WORLD_SIZE)];
                const square = land.landAt(x, y);

                assert.ok(!square.water && square.road !== "trade" && square.road !== "road", `seed ${seed}: ${x}, ${y} clear`);
            }
        }
    });

    it("levels its wards' terraces one above another, its hill eased out into the land round it", () => {
        const { land, world, set } = one;
        const { citadel, x, y, facing } = set;
        const base = citadelLevel(world.plan, citadel, x, y, facing);
        const place = ([u, v]) => [x + u * Math.cos(facing) + v * Math.sin(facing), y - u * Math.sin(facing) + v * Math.cos(facing)];

        assert.equal(set.pads.length, 3);
        assert.deepEqual(
            set.pads.map(({ level }) => level),
            citadel.wards.map(({ rise }) => Math.round((base + rise) / HEIGHT_STEP) * HEIGHT_STEP),
        );

        for (const [k, ward] of citadel.wards.entries()) {
            // (Just inside its wall, and between it and the next ward in, between that ward's
            // towers: its own level)
            const next = citadel.wards[k + 1];
            const turn = sideTurn(next?.sides ?? ward.sides, 1);
            const at = (r) => place([Math.cos(turn) * r, Math.sin(turn) * r]);
            const inside = next ? (ward.apothem - ward.thick + next.apothem + CITADEL.terrace.ease) / 2 : 4;

            assert.ok(Math.abs(land.ground.heightAt(...at(inside)) - set.pads[k].level) < 0.05, `ward ${k}: ${land.ground.heightAt(...at(inside)).toFixed(2)} at ${set.pads[k].level.toFixed(2)}`);
        }

        // (Its hill: from its outer ward's level at its wall's foot to the land's, eased out over
        // CITADEL.hill.ease)
        const [outer] = citadel.wards;
        const turn = sideTurn(outer.sides, 2);
        const out = (r) => place([Math.cos(turn) * r, Math.sin(turn) * r]);

        assert.ok(Math.abs(land.ground.heightAt(...out(outer.apothem + 0.5)) - set.pads[0].level) < 0.2);
        assert.ok(Math.abs(land.ground.heightAt(...out(outer.apothem + CITADEL.hill.ease + 2)) - landHeight(world.plan, ...out(outer.apothem + CITADEL.hill.ease + 2))) < 1);
    });

    it("takes every square inside its outer wall, under its outer towers and in its barbican (blocked, unseen through), its wards courtyards; the ground outside open", () => {
        const { land, set } = one;
        const { citadel, x, y, facing } = set;
        const [outer] = citadel.wards;
        const local = (px, py) => [(px - x) * Math.cos(facing) - (py - y) * Math.sin(facing), (px - x) * Math.sin(facing) + (py - y) * Math.cos(facing)];
        let [checked, outside] = [0, 0];

        const [[u0, v0], , [u1, v1]] = barbicanOf(citadel);
        let barbican = 0;

        for (let j = Math.floor(y) - 120; j < y + 120; j += 3) {
            for (let i = Math.floor(x) - 120; i < x + 120; i += 3) {
                const at = local(i + 0.5, j + 0.5);
                const inBarbican = at[0] > u0 + 0.5 && at[0] < u1 - 0.5 && at[1] > v0 + 0.5 && at[1] < v1 - 0.5;

                if (insideWard(citadel, outer, at, -0.5) || inBarbican) {
                    checked++;
                    barbican += inBarbican ? 1 : 0;
                    assert.ok(land.squares.blocked(i, j) && land.squares.opaque(i, j), `${i}, ${j} blocked`);
                    assert.equal(land.squares.ground(i, j), GROUND.courtyard);
                } else if (!insideCitadel(citadel, at, 3) && !land.squares.blocked(i, j)) {
                    outside++;
                }
            }
        }

        assert.ok(checked > 2000 && barbican > 10 && outside > 200, `${checked} in (${barbican} in its barbican), ${outside} open outside`);
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

    it("is seen from afar as its wards' walls and towers, its barbican, its hall and chapel and the keep, in under 2,000 triangles", () => {
        const plan = planWorld(1);
        const shapes = new Shapes();
        const heightOf = (x, z) => landHeight(plan, x, z);

        citadelShapes(shapes, { plan, seed: 1, x: 4064, z: 4624, facing: 2.36, heightOf });

        const ys = shapes.positions.filter((_, k) => k % 3 === 1);

        assert.ok(shapes.triangles > 200 && shapes.triangles < 2000, `${shapes.triangles} triangles`);
        assert.ok(Math.max(...ys) > citadelLevel(plan, layoutCitadel({ seed: 1 }), 4064, 4624, 2.36) + 50, "its keep's spires");
    });
});
