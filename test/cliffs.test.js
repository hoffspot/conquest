// The cliffs (client/js/world/art/kits/cliffs.js, the terrain plan's M7h): a skin of rock standing
// out of the ground where it's too steep to climb, sinking back under it where it eases off, the
// same either side of a chunk's edge, never on a road, water or what's built, made a few rows at
// a time; drawn with the rock's picture laid on from three sides (engine/atlas.js cliffMaterial)
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

// (Textured materials paint a canvas: enough of one for them to in Node)
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} }) }) };

const THREE = await import("three");
const { buildWorld, CHUNK } = await import("../client/js/core/overworld.js");
const { GROUND } = await import("../client/js/core/setpieces/pieces.js");
const { SLOPE } = await import("../client/js/core/terrain/height.js");
const { cliffMaterial, ROCK } = await import("../client/js/world/art/engine/atlas.js");
const { CLIFF_STEEP, CLIFFS, cliffMesh, cliffOf, cliffsInto, standsOut } = await import("../client/js/world/art/kits/cliffs.js");
const { Mesher } = await import("../client/js/world/art/kits/wilds.js");

let overworld;

// (The steepest ground near the north edge of seed 1's world, and the chunk west of it: both all
// cliff along the edge between them)
const STEEP = [Math.floor(5776 / CHUNK), Math.floor(528 / CHUNK)];

// A chunk's cliffs made (`chunk` as the overworld has it, or changed): { mesher, triangles, steps }
function skinOf(chunk) {
    const mesher = new Mesher(4096);
    const making = cliffsInto(mesher, chunk, (cx, cy) => overworld.ground.chunk(cx, cy).heights, (x, y) => overworld.biomeAt(x, y));
    let steps = 0;
    let made;

    while (!(made = making.next()).done) {
        steps++;
    }

    return { mesher, triangles: made.value, steps };
}

// Every vertex of a mesher's, in the world (about the chunk's corner [x0, y0]): { at, normal, colour, key }
function verticesOf(mesher, [x0, y0]) {
    const { position, normal, color } = mesher.arrays;

    return Array.from({ length: mesher.count }, (_, i) => {
        const at = [position[i * 3] + x0, position[i * 3 + 1], position[i * 3 + 2] + y0];

        return { at, normal: [...normal.subarray(i * 3, i * 3 + 3)], colour: [...color.subarray(i * 3, i * 3 + 3)], key: at.map((v) => v.toFixed(3)).join() };
    });
}

describe("the cliffs (world/art/kits/cliffs.js)", () => {
    before(() => {
        overworld = buildWorld({ seed: 1 }).maps.town;
    });

    it("stand out where the ground's too steep to climb and sink under it where it isn't", () => {
        assert.equal(CLIFF_STEEP, SLOPE.cliff);
        assert.ok(CLIFFS.from < SLOPE.cliff && CLIFFS.full > SLOPE.cliff, "from a little under the climbable to a little over");
        assert.equal(cliffOf([0, 0]).cliff, 0);
        assert.equal(cliffOf([0.5, 0.2]).cliff, 0);
        assert.equal(cliffOf([1, 0]).cliff, 1);
        assert.ok(cliffOf([SLOPE.cliff, 0]).cliff > 0 && cliffOf([SLOPE.cliff, 0]).cliff < 1);

        // (Its normal's the ground's: out of it, upwards)
        const { normal } = cliffOf([1, 0]);

        assert.ok(Math.abs(Math.hypot(...normal) - 1) < 1e-9 && normal[0] < 0 && normal[1] > 0);

        // (Sunk under the ground where it's no cliff; out of it, mostly, where it is, by its ledges
        // and crags, now more now less)
        let [out, least, most] = [0, Infinity, -Infinity];

        for (let k = 0; k < 400; k++) {
            const [x, y, height] = [(k * 37.1) % 500, (k * 53.7) % 500, (k * 4.3) % 300];

            assert.equal(standsOut(x, y, height, 0).out, -CLIFFS.sunk);

            const stood = standsOut(x, y, height, 1);

            assert.ok(stood.up >= 0 && stood.up < 1);
            out += stood.out / 400;
            [least, most] = [Math.min(least, stood.out), Math.max(most, stood.out)];
        }

        assert.ok(out > 0.3, `${out.toFixed(2)} m out on average`);
        assert.ok(most - least > 1, "broken up");
    });

    it("are made a few rows at a time, within a chunk's share of triangles, and none where it's not steep", () => {
        const steep = skinOf(overworld.chunk(...STEEP));

        assert.ok(steep.triangles > 1000 && steep.triangles < 8000, `${steep.triangles} triangles`);
        assert.equal(steep.mesher.count, steep.triangles * 3);
        assert.ok(steep.steps >= CHUNK / CLIFFS.step / 4, `${steep.steps} steps`);

        // (Farmland: no cliffs, nothing made)
        const flat = skinOf(overworld.chunkAt(3376, 5456));

        assert.equal(flat.triangles, 0);
        assert.equal(flat.mesher.count, 0);
    });

    it("meet their neighbours' at a chunk's edge: the same points, facing the same way, the same colour", () => {
        const [cx, cy] = STEEP;
        const west = skinOf(overworld.chunk(cx - 1, cy));
        const east = skinOf(overworld.chunk(cx, cy));
        const edge = cx * CHUNK;
        const eastern = new Map(verticesOf(east.mesher, [edge, cy * CHUNK]).map((vertex) => [vertex.key, vertex]));
        // (The west chunk's lattice points on the edge moved east of it, and the east chunk's
        // moved west: past where any scree reaches)
        const over = verticesOf(west.mesher, [(cx - 1) * CHUNK, cy * CHUNK]).filter(({ at }) => at[0] > edge + 0.4);
        const western = new Set(verticesOf(west.mesher, [(cx - 1) * CHUNK, cy * CHUNK]).map(({ key }) => key));
        const back = [...eastern.values()].filter(({ at }) => at[0] < edge - 0.4);

        assert.ok(over.length > 10 && back.length > 0, `${over.length} and ${back.length} points over the edge`);

        for (const vertex of over) {
            const same = eastern.get(vertex.key);

            assert.ok(same, `${vertex.key} on both sides`);
            assert.deepEqual(same.normal, vertex.normal);
            assert.deepEqual(same.colour, vertex.colour);
        }

        for (const { key } of back) {
            assert.ok(western.has(key), `${key} on both sides`);
        }
    });

    it("are never on a road, a bridge, water or what's built", () => {
        const chunk = overworld.chunk(...STEEP);

        for (const changed of [{ ground: new Uint8Array(CHUNK * CHUNK).fill(GROUND.road) }, { water: new Uint8Array(CHUNK * CHUNK).fill(1) }, { bridge: new Uint8Array(CHUNK * CHUNK).fill(1) }, { solid: new Uint8Array(CHUNK * CHUNK).fill(1) }]) {
            const { triangles } = skinOf({ ...chunk, ...changed });

            assert.equal(triangles, 0, Object.keys(changed)[0]);
        }

        // (Half the chunk built on: none on that half)
        const solid = new Uint8Array(CHUNK * CHUNK).map((_, k) => (k % CHUNK < CHUNK / 2 ? 1 : 0));
        const { mesher } = skinOf({ ...chunk, solid });
        const { position } = mesher.arrays;

        for (let i = 0; i < mesher.count; i++) {
            assert.ok(position[i * 3] > CHUNK / 2 - CLIFFS.step, `${position[i * 3].toFixed(2)} m in`);
        }
    });

    it("are drawn with the rock's picture laid on from three sides, read from a place of each patch's own", () => {
        const [cx, cy] = STEEP;
        const { mesher } = skinOf(overworld.chunk(cx, cy));
        const mesh = cliffMesh(mesher, [cx * CHUNK, cy * CHUNK]);

        assert.equal(mesh.material, cliffMaterial());
        assert.ok(mesh.castShadow && mesh.receiveShadow);
        assert.deepEqual(mesh.position.toArray(), [cx * CHUNK, 0, cy * CHUNK]);

        // (Each vertex's first texture coordinate how many copies of the picture to a metre)
        const uv = mesh.geometry.getAttribute("uv");

        for (let i = 0; i < uv.count; i += 97) {
            assert.ok(uv.getX(i) > 0.02 && uv.getX(i) < 1, `${uv.getX(i)} copies a metre`);
        }

        const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };

        mesh.material.onBeforeCompile(shader);
        assert.ok(shader.vertexShader.includes("vRockScale = uv.x;"));
        assert.ok(shader.fragmentShader.includes("vec4 rockRead("));
        assert.ok(shader.fragmentShader.includes("textureGrad(atlasMap"));
        assert.ok(!shader.fragmentShader.includes("texture(atlasMap, vec3(vAtlasUv, vLayer))"), "not by texture coordinates");
        assert.ok(shader.fragmentShader.includes(`/ ${ROCK.shifts.toFixed(1)}`));
        assert.ok(shader.fragmentShader.includes("fireAt["), "lit by the fires too");
        assert.ok(shader.uniforms.atlasMap, "the atlas");
    });
});
