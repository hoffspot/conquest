// A dungeon's rooms furnished with scanned models (world/dungeons3d.js furnish, made by
// scripts/build-props.js: docs/DUNGEONS.md): each model in the catalog, downloaded only once a
// dungeon's wanted, and small; every theme's levels furnished where things can stand, each thing on
// what it's on; and the models placed as asked, their feet on the floor or on what's under them,
// sized and turned, drawn a tile of the level at a time
import assert from "node:assert/strict";
import { statSync } from "node:fs";
import { describe, it } from "node:test";
import * as THREE from "three";

// (Textured materials paint a canvas: enough of one for them to in Node)
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} }) }) };

const { ASSETS } = await import("../client/js/app/assets.js");
const { dungeonRooms } = await import("../client/js/core/insides.js");
const { readPlan } = await import("../client/js/core/interiors.js");
const { CAVERNS } = await import("../client/js/world/caverns.js");
const { DUNGEON_PROPS, furnish } = await import("../client/js/world/dungeons3d.js");
const { buildInterior } = await import("../client/js/world/interiors3d.js");
const { PROPS } = await import("../scripts/build-props.js");

// How big a model's file may be, and all of them together (bytes: within the dungeons' budget of
// about 25 MB with their photographs, each dungeon fetching only its own theme's)
const MOST = Object.freeze({ each: 650 * 1024, all: 22 * 1024 * 1024 });

// A dungeon's levels as the game makes them (core/insides.js), each built as it's drawn
function levelsOf(theme, seed) {
    return dungeonRooms({ seed, theme, tier: 3 }).map((floor, k) => {
        const map = readPlan(`test-${theme}-${seed}-${k}`, floor.name, floor.rows, { ground: floor.ground });

        Object.assign(map, {
            origin: [0, 0],
            style: floor.style,
            look: floor.look,
            people: "human",
            dungeon: { theme: floor.look, level: k, levels: 1, lights: floor.level.lights, rooms: floor.level.rooms },
        });

        return map;
    });
}

describe("the scanned models a dungeon's furnished with (scripts/build-props.js)", () => {
    it("are each in the catalog, downloaded only once a dungeon's wanted, a GLB on disk, and small", () => {
        let all = 0;

        // (A set's pieces each a prop of their own, all in their set's file)
        const names = Object.entries(PROPS).flatMap(([file, { pieces }]) => (pieces ? Object.keys(pieces) : [file]));

        assert.deepEqual(Object.keys(DUNGEON_PROPS).sort(), names.sort());

        for (const [file, { pieces }] of Object.entries(PROPS)) {
            const model = ASSETS.models[`dungeon-prop-${file}`];

            assert.ok(model, `${file} isn't in the catalog`);
            assert.equal(model.tier, "demand");
            assert.deepEqual(
                model.files.map(({ path }) => path),
                [`models/dungeons/${file}.glb`],
            );
            assert.deepEqual(model.pieces, pieces);

            for (const name of pieces ? Object.keys(pieces) : [file]) {
                assert.deepEqual(DUNGEON_PROPS[name], { asset: `dungeon-prop-${file}`, nodes: pieces?.[name] ?? null });
            }

            const { size } = statSync(new URL(`../client/${model.files[0].path}`, import.meta.url));

            assert.ok(size < MOST.each, `${file}: ${size} bytes`);
            all += size;
        }

        assert.ok(all < MOST.all, `${all} bytes in all`);
    });
});

describe("a dungeon's levels furnished (world/interiors3d.js dungeon)", () => {
    it("puts each theme's things where they can stand, on open ground, each on what it's on", () => {
        const wanted = { caves: ["fire-pit", "boulder", "pebble-a", "bark-b"], hideout: ["barrel", "crate", "table", "stool", "lantern", "shelf"], ancient: ["bust", "goblet-a", "vase-tall"] };

        for (const [theme, models] of Object.entries(wanted)) {
            const seen = new Set();

            for (const seed of [3, 8]) {
                for (const map of levelsOf(theme, seed)) {
                    const interior = buildInterior(map);
                    const { props } = interior;

                    props.forEach((prop, k) => {
                        const where = `${theme} ${map.id}: ${prop.model} at ${prop.x.toFixed(2)}, ${prop.z.toFixed(2)}`;

                        assert.ok(DUNGEON_PROPS[prop.model], where);
                        assert.ok(prop.x > 0 && prop.z > 0 && prop.x < map.width && prop.z < map.height, where);
                        assert.notEqual(map.plan[Math.floor(prop.z)][Math.floor(prop.x)], "#", `${where} is in the rock`);
                        assert.ok(!prop.on || props.indexOf(prop.on) < k, `${where} is on what isn't placed before it`);
                        assert.ok([prop.size, prop.scale, prop.fit].filter(Boolean).length === 1, `${where}: one size`);
                        seen.add(prop.model);
                    });

                    interior.dispose();
                }
            }

            for (const model of models) {
                assert.ok(seen.has(model), `${theme}: no ${model} (${[...seen].join(", ")})`);
            }
        }
    });
});

describe("the models placed (world/dungeons3d.js furnish)", () => {
    // A model 2 by 1 by 1 metres, off its own middle; and one that can't be read
    const geometry = new THREE.BoxGeometry(2, 1, 1).translate(0.5, 0.25, 0);

    geometry.computeBoundingBox();

    const read = (name) => (name === "block" ? { parts: [{ geometry, source: new THREE.MeshStandardMaterial() }], box: geometry.boundingBox } : null);
    const boxOf = (mesh, k) => geometry.boundingBox.clone().applyMatrix4(mesh.getMatrixAt(k, new THREE.Matrix4()));
    const near = (a, b, why) => assert.ok(Math.abs(a - b) < 1e-6, `${why}: ${a} not ${b}`);

    it("stands each where it's asked, its foot on the floor or on what it's on, sized, turned and laid down, each tile's drawn at once; and leaves out what can't be read and what's on it", async () => {
        const group = new THREE.Group();
        const below = { model: "block", x: 3, z: 4, size: 1 };
        const missing = { model: "missing", x: 1, z: 1 };
        const placements = [
            below,
            { model: "block", on: below, x: 3, z: 4, size: 1, turn: Math.PI / 2 },
            { model: "block", x: 5, z: 6, size: 2, roll: Math.PI / 2 },
            { model: "block", x: CAVERNS.tile + 4, z: 4, fit: [4, 1, 2] },
            missing,
            { model: "block", on: missing, x: 1, z: 1, size: 1 },
        ];

        await furnish(group, placements, { read });

        const [here, there] = group.children;

        assert.equal(group.children.length, 2);
        assert.ok(here.isInstancedMesh && here.castShadow);
        assert.equal(here.count, 3);
        assert.equal(there.count, 1);
        assert.equal(here.material, there.material);

        // (Its longest side a metre: a metre by half a metre by half, its middle over (3, 4))
        const [a, b, c] = [0, 1, 2].map((k) => boxOf(here, k));

        near(a.min.y, 0, "on the floor");
        near(a.max.y, 0.5, "as tall");
        near((a.min.x + a.max.x) / 2, 3, "over x");
        near((a.min.z + a.max.z) / 2, 4, "over z");
        near(a.max.x - a.min.x, 1, "as long");

        // (On it, turned a quarter: its length along z)
        near(b.min.y, 0.5, "on the one under it");
        near(b.max.z - b.min.z, 1, "turned");
        near(b.max.x - b.min.x, 0.5, "turned");

        // (Laid on its end: its length upright)
        near(c.min.y, 0, "on the floor");
        near(c.max.y, 2, "on its end");

        // (Made 4 by 1 by 2, in the next tile)
        const d = boxOf(there, 0);

        near(d.max.x - d.min.x, 4, "made as long");
        near(d.max.y - d.min.y, 1, "made as tall");
        near(d.max.z - d.min.z, 2, "made as wide");
        near((d.min.x + d.max.x) / 2, CAVERNS.tile + 4, "over x");
    });
});
