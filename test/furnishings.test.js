// A dungeon's rooms furnished with scanned models (world/dungeons3d.js furnish, made by
// scripts/build-props.js: docs/DUNGEONS.md): each model in the catalog, downloaded only once a
// dungeon's wanted, and small; every theme's levels furnished where things can stand, each thing on
// what it's on; and the models placed as asked, their feet on the floor or on what's under them,
// sized and turned, drawn a tile of the level at a time
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { describe, it } from "node:test";
import * as THREE from "three";

// (Textured materials paint a canvas: enough of one for them to in Node)
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} }) }) };

const { ASSETS } = await import("../client/js/app/assets.js");
const { dungeonRooms } = await import("../client/js/core/insides.js");
const { readPlan } = await import("../client/js/core/interiors.js");
const { CAVERNS } = await import("../client/js/world/caverns.js");
const { DUNGEON_PROPS, furnish, loadProp } = await import("../client/js/world/dungeons3d.js");
const { KEEP_KIT } = await import("../client/js/world/keepkit.js");
const { PROP_KITS } = await import("../client/js/world/propkits.js");
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

        // (A set's pieces each a prop of their own, all in their set's file; and besides them only
        // licensed kits' pieces: Bellhaven's keep's castle's (world/keepkit.js, test/keepkit.test.js)
        // and the prop kits' (world/propkits.js, test/propkits.test.js))
        const names = Object.entries(PROPS).flatMap(([file, { pieces }]) => (pieces ? Object.keys(pieces) : [file]));
        const scanned = Object.keys(DUNGEON_PROPS).filter((name) => !ASSETS.models[DUNGEON_PROPS[name].asset].licensed);

        assert.deepEqual(scanned.sort(), names.sort());
        assert.deepEqual([...new Set(Object.keys(DUNGEON_PROPS).filter((name) => !scanned.includes(name)).map((name) => DUNGEON_PROPS[name].asset))].sort(), [KEEP_KIT.asset, ...Object.values(PROP_KITS).map(({ asset }) => asset)].sort());

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

    it("has its pictures each a KTX2, which the graphics card keeps compressed, and none that nothing's drawn with", () => {
        for (const file of Object.keys(PROPS)) {
            // (A GLB's JSON: its first chunk, after the file's header and the chunk's own)
            const bytes = readFileSync(new URL(`../client/models/dungeons/${file}.glb`, import.meta.url));
            const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString("utf8"));
            const images = gltf.images ?? [];
            const used = new Set((gltf.materials ?? []).flatMap(({ pbrMetallicRoughness: pbr = {}, normalTexture, emissiveTexture }) => [pbr.baseColorTexture, normalTexture, emissiveTexture].filter(Boolean).map(({ index }) => index)));

            assert.ok(
                images.every(({ mimeType }) => mimeType === "image/ktx2"),
                `${file}: ${images.map(({ mimeType }) => mimeType)}`,
            );
            assert.ok((gltf.textures ?? []).every(({ source, extensions }) => source === undefined && Number.isInteger(extensions?.KHR_texture_basisu?.source)), file);
            assert.equal(images.length > 0, (gltf.extensionsRequired ?? []).includes("KHR_texture_basisu"), file);
            assert.equal(used.size, (gltf.textures ?? []).length, `${file}: a picture nothing's drawn with`);
        }
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
                        // (A licensed kit's piece and the scanned model drawn in its place till it's
                        // read and without it, its `instead`: each where it can stand)
                        for (const each of [prop, prop.instead].filter(Boolean)) {
                            const where = `${theme} ${map.id}: ${each.model} at ${each.x.toFixed(2)}, ${each.z.toFixed(2)}`;

                            assert.ok(DUNGEON_PROPS[each.model], where);
                            assert.ok(each.x > 0 && each.z > 0 && each.x < map.width && each.z < map.height, where);
                            assert.notEqual(map.plan[Math.floor(each.z)][Math.floor(each.x)], "#", `${where} is in the rock`);
                            assert.ok(!each.on || props.findIndex((other) => other === each.on || other.instead === each.on) < k, `${where} is on what isn't placed before it`);
                            assert.ok([each.size, each.scale, each.fit].filter(Boolean).length === 1, `${where}: one size`);
                            seen.add(each.model);
                        }
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

        // (Drawn at once in wider squares where it's asked (`lot`): those two tiles' one)
        const wider = new THREE.Group();

        const lot = 4 * CAVERNS.tile;
        const foot = { model: "block", x: 3, z: 4, size: 1, lot };

        await furnish(wider, [foot, { model: "block", on: foot, x: 3, z: 4, size: 1, lot }, { model: "block", x: 5, z: 6, size: 2, lot }, { model: "block", x: CAVERNS.tile + 4, z: 4, size: 1, lot }], { read });
        assert.equal(wider.children.length, 1);
        assert.equal(wider.children[0].count, 4);
    });

    it("draws a kit's piece where it's read, and the scanned model it stands in for (its `instead`) where it isn't, read only then, what's on either set on whichever's drawn", async () => {
        const asked = [];
        const reading = (name) => (asked.push(name), name === "kit-piece" ? read("block") : read(name === "stand-in" ? "block" : name));
        const stood = { model: "stand-in", x: 3, z: 4, size: 1 };
        const piece = { model: "kit-piece", x: 3, z: 4, fit: [2, 2, 2], instead: stood };
        const on = { model: "block", on: stood, x: 3, z: 4, size: 1 };

        // (The kit's read: its piece drawn, 2 m tall, what's on its stand-in on it; the stand-in
        // never asked for)
        const kitted = new THREE.Group();

        await furnish(kitted, [piece, on], { read: reading });
        assert.deepEqual(asked, ["kit-piece", "block"]);
        assert.deepEqual(kitted.children.map(({ name }) => name), ["prop-kit-piece", "prop-block"]);
        near(boxOf(kitted.children[1], 0).min.y, 2, "on the kit's piece");

        // (It isn't: the stand-in read and drawn where it stood, as it was asked for, a metre
        // long and half a metre tall, and what's on it on it)
        const unread = new THREE.Group();

        asked.length = 0;
        await furnish(unread, [{ ...piece, model: "missing" }, on], { read: reading });
        assert.deepEqual(asked, ["missing", "block", "stand-in"]);
        assert.deepEqual(unread.children.map(({ name }) => name), ["prop-stand-in", "prop-block"]);
        near(boxOf(unread.children[0], 0).max.y, 0.5, "as the stand-in was asked for");
        near(boxOf(unread.children[1], 0).min.y, 0.5, "on the stand-in");
    });

    it("never leaves a model that can't be read an error no one's caught, asked for ahead of being wanted as a level's built (the licensed models left out)", async () => {
        const [page, fetching] = [globalThis.document.baseURI, globalThis.fetch];
        const uncaught = [];
        const note = (reason) => uncaught.push(reason);

        globalThis.document.baseURI = "http://localhost/";
        globalThis.fetch = () => Promise.reject(new TypeError("Failed to fetch"));
        process.on("unhandledRejection", note);

        try {
            // (Asked for, as a level being built asks, and only waited on later)
            const read = loadProp(KEEP_KIT.column);

            await new Promise((resolve) => setTimeout(resolve, 50));
            assert.deepEqual(uncaught, []);
            // (What waits on it still hears it couldn't be)
            await assert.rejects(read, /Failed to fetch/);
        } finally {
            process.off("unhandledRejection", note);
            globalThis.fetch = fetching;
            globalThis.document.baseURI = page;
        }
    });
});
