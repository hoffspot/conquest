// The peoples' buildings kept, not let go (the terrain plan's M7j-3): damp up the foot of their
// walls and a little green low on those facing north (peoples/kit.js wallWeather), ivy climbing a
// bare wall of some of the humans' cottages (kits/ivy.js ivyClimb), and the light their lit
// windows throw on the ground at night (windowpools.js, from the windows atlas.js finds)
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import { PANES, toAtlas, WINDOW_LIGHT, WINDOW_ON_GLSL, WINDOW_STEP } from "../client/js/world/art/engine/atlas.js";
import { material } from "../client/js/world/art/engine/materials.js";
import { buildHouse, planHouse } from "../client/js/world/art/kits/house.js";
import { CLIMBING, IVY } from "../client/js/world/art/kits/ivy.js";
import { wallWeather, weathering, WEATHERING, WEATHERING_BANDS } from "../client/js/world/art/peoples/kit.js";
import { partsOf, PIXEL, placed } from "../client/js/world/town3d.js";
import { poolsMesh, WINDOW_POOLS } from "../client/js/world/windowpools.js";

const M = 5;
const luminance = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

describe("the peoples' walls weathered (kit.js wallWeather)", () => {
    it("darker with damp up the foot of a wall, dry above it", () => {
        const at = (y) => luminance(wallWeather(10, y * M, 10, [1, 0, 0], 1, 0, 7));

        assert.ok(at(0.1) < 0.85 && at(0.1) > 0.6, `${at(0.1)} at the foot`);
        assert.ok(at(0.5) < 1 && at(0.5) > at(0.1));
        assert.equal(at(WEATHERING.dry + 0.1), 1);
        assert.deepEqual(WEATHERING_BANDS, [WEATHERING.damp, WEATHERING.dry, WEATHERING.greenTo, WEATHERING.greenGone].map((metres) => metres * M));
    });

    it("green low on a wall facing north as the building stands, nowhere else, and in patches", () => {
        // (Above the damp: north is -z; a wall built facing -z faces north unturned, and south
        // turned half round)
        const green = (normal, facing) =>
            Array.from({ length: 60 }, (_, k) => {
                const [r, g, b] = wallWeather(k * 3, 1.1 * M, 0, normal, Math.cos(facing), Math.sin(facing), 3);

                return g - (r + b) / 2;
            });
        const north = green([0, 0, -1], 0);

        assert.ok(north.some((tint) => tint > 0.1), "greener than it is red and blue somewhere");
        assert.ok(north.some((tint) => tint < 0.01), "and not everywhere");
        assert.ok(green([0, 0, -1], Math.PI).every((tint) => tint < 1e-9), "none facing south");
        assert.ok(green([0, 0, 1], 0).every((tint) => tint < 1e-9), "none facing south");
        // (Turned a quarter round, a wall built facing +x faces north: x' = x cos + z sin, z' = z cos - x sin)
        assert.ok(green([1, 0, 0], Math.PI / 2).some((tint) => tint > 0.1));

        // None up high
        const [r, g, b] = wallWeather(0, (WEATHERING.greenGone + 0.2) * M, 0, [0, 0, -1], 1, 0, 3);

        assert.ok(Math.abs(g - (r + b) / 2) < 1e-9);
    });

    it("isn't laid on a tent (a camp's: damp false), whose walls aren't cut at its heights", () => {
        const kept = weathering({ seed: 1 });
        const tent = weathering({ seed: 1, damp: false });
        const wall = material("plaster");

        assert.ok(WEATHERING_BANDS.every((band) => kept.bands.includes(band)));
        assert.ok(WEATHERING_BANDS.every((band) => !tent.bands.includes(band)));
        assert.ok(luminance(tent([4, 0.2 * M, 0], [0, 0, -1], wall)) > luminance(kept([4, 0.2 * M, 0], [0, 0, -1], wall)));
    });
});

describe("ivy climbing a cottage's bare wall now and then (house.js, ivy.js ivyClimb)", () => {
    const ivyOf = (plan) => {
        const object = buildHouse(plan).toObject();
        let ivy = null;

        object.traverse((node) => {
            if (node.isMesh && (Array.isArray(node.material) ? node.material : [node.material]).some(({ name }) => name === "ivy")) {
                ivy = node;
            }
        });

        return ivy;
    };

    it("on about CLIMBING.chance of the houses, low on a side or the back, clear of their openings, the same every time", () => {
        let ivied = 0;
        const count = 80;

        for (let k = 0; k < count; k++) {
            const plan = planHouse({ w: 3 + (k % 2), h: 2 + (k % 3 ? 0 : 1), seed: 500 + k });
            const ivy = ivyOf(plan);

            if (!ivy) {
                continue;
            }

            ivied++;

            const position = ivy.geometry.attributes.position;
            const [x0, x1, z0, z1] = plan.levels[0].box;
            const top = plan.levels[0].y + plan.levels[0].height;

            for (let i = 0; i < position.count; i++) {
                const [x, y, z] = [position.getX(i), position.getY(i), position.getZ(i)];

                // (Low on the wall, and not on the front, the street's side, z1)
                assert.ok(y >= 0 && y <= top, `${y} up`);
                assert.ok(z < z1 - M * 0.01 || x < x0 || x > x1, "not on its front");
                assert.ok(x >= x0 - M && x <= x1 + M && z >= z0 - M && z <= z1, "on its walls");
            }

            assert.equal(ivyOf(plan).geometry.attributes.position.count, position.count);
        }

        assert.ok(ivied > count * CLIMBING.chance * 0.5 && ivied < count * CLIMBING.chance * 1.7, `${ivied} of ${count}`);
        assert.ok(IVY.clear > 0);
    });
});

describe("the light lit windows throw on the ground (atlas.js panes, windowpools.js)", () => {
    // A house, built and placed as a town's are, its parts made ready for the atlas
    const panesOf = (piece) => {
        const object = placed(buildHouse(planHouse({ ...piece, w: piece.w, h: piece.h })).toObject(), piece);
        const group = new THREE.Group();

        group.scale.setScalar(PIXEL);
        group.add(object);
        group.updateMatrixWorld(true);

        const middle = new THREE.Vector3().setFromMatrixPosition(object.matrixWorld);

        return { parts: partsOf(group, { atlas: true }), middle };
    };

    it("finds a house's upright windows, each facing out from its middle, its seed its glass's", () => {
        let found = 0;

        for (let k = 0; k < 8; k++) {
            const piece = { kind: "house", w: 3, h: 2, x: 100 + k * 40, y: 200, facing: k * 0.8, seed: 77 + k, wealth: 0.9 };
            const { parts, middle } = panesOf(piece);

            for (const { panes, geometry } of parts) {
                const seeds = new Set(Array.from(geometry.attributes.layer?.array ?? [], (layer) => Math.floor(layer / WINDOW_STEP)));

                for (const pane of panes) {
                    found++;
                    assert.ok(Math.abs(Math.hypot(...pane.out) - 1) < 1e-9);
                    assert.ok((pane.at[0] - middle.x) * pane.out[0] + (pane.at[2] - middle.z) * pane.out[1] >= PANES.out, "facing out");
                    assert.ok(pane.high - pane.low >= PANES.low && pane.width >= PANES.narrow && pane.width <= PANES.wide);
                    assert.ok(seeds.has(pane.seed), `seed ${pane.seed} its glass's`);
                }
            }
        }

        assert.ok(found > 40, `${found} windows`);
    });

    it("leaves out glass that isn't an upright window (a lantern's box)", () => {
        const box = new THREE.BoxGeometry(0.2, 0.3, 0.2).toNonIndexed();

        box.translate(5, 2, 5);

        assert.deepEqual(toAtlas(box, material("glass"), { centre: [0, 0] }).userData.panes, []);

        const pane = new THREE.PlaneGeometry(0.8, 1).toNonIndexed();

        pane.translate(5, 2, 3);

        const [one] = toAtlas(pane, material("glass"), { centre: [5, 0] }).userData.panes;

        assert.deepEqual(one.out.map((v) => Math.round(v) + 0), [0, 1]);
        assert.ok(Math.abs(one.width - 0.8) < 1e-6);
    });

    it("lies on the ground in front of each window, coming on with it, none by day", () => {
        const panes = [
            { at: [10, 1.5, 10], out: [0, 1], low: 1, high: 2, width: 0.8, seed: 5 },
            { at: [20, 4.5, 10], out: [1, 0], low: 4, high: 5, width: 0.8, seed: 9 },
            { at: [30, 9, 10], out: [1, 0], low: 8.5, high: 9.5, width: 0.8, seed: 3 },
        ];
        const groundAt = (x, z) => 0.5 + 0.01 * x + 0.02 * z;
        const mesh = poolsMesh(panes, groundAt);
        const position = mesh.geometry.attributes.position;
        const pool = mesh.geometry.attributes.pool;
        const seeds = new Set();

        assert.equal(poolsMesh([], groundAt), null);

        for (let i = 0; i < position.count; i++) {
            const [x, y, z] = [position.getX(i), position.getY(i), position.getZ(i)];

            assert.ok(Math.abs(y - groundAt(x, z) - WINDOW_POOLS.lift) < 1e-5, "on the ground");
            seeds.add(pool.getW(i));
        }

        // (Not from a window too high up; out in front of the others, the higher one throwing its
        // light further but fainter)
        assert.deepEqual([...seeds].sort(), [5, 9]);

        const far = (seed, axis) => Math.max(...Array.from({ length: position.count }, (_, i) => (pool.getW(i) === seed ? (axis ? position.getX(i) - 20 : position.getZ(i) - 10) : -Infinity)));
        const strength = (seed) => Math.max(...Array.from({ length: pool.count }, (_, i) => (pool.getW(i) === seed ? pool.getZ(i) : 0)));

        assert.ok(far(5, 0) > WINDOW_POOLS.reach[0] * 0.9 && far(9, 1) > far(5, 0));
        assert.ok(strength(9) < strength(5));

        // (Its shader's lit as the windows are, by the same function)
        assert.equal(mesh.material.uniforms.windowLight, WINDOW_LIGHT);
        assert.ok(mesh.material.vertexShader.includes(WINDOW_ON_GLSL));
        assert.equal(mesh.material.blending, THREE.AdditiveBlending);

        const before = WINDOW_LIGHT.value.x;

        WINDOW_LIGHT.value.x = 0;
        assert.equal(mesh.visible, false, "none drawn by day");
        WINDOW_LIGHT.value.x = 1;
        assert.equal(mesh.visible, true);
        WINDOW_LIGHT.value.x = before;

        // (Facing up, so seen from above)
        const index = mesh.geometry.index.array;
        const [a, b, c] = [index[0], index[1], index[2]].map((i) => new THREE.Vector3(position.getX(i), position.getY(i), position.getZ(i)));

        assert.ok(new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)).y > 0);
    });
});
