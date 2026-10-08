// Makes the scanned models a dungeon's rooms are furnished with (client/models/dungeons, placed by
// client/js/world/dungeons3d.js), all CC0 (https://creativecommons.org/publicdomain/zero/1.0/),
// from Poly Haven's models, each source's page saying so (checked 2026-10-08):
//
//   npm run build:props
//
// Each model's glTF, its mesh and its 1K pictures are downloaded once (into .cache); its colour
// darkened by its ambient occlusion (as the dungeons' photographs are: build-textures.js), its
// pictures made smaller (PROPS' `pixels`), its mesh made simpler where it has more triangles than
// it needs seen from a few metres off (PROPS' `triangles`, by meshoptimizer's simplifier, keeping
// its outline, its seams and where its pictures lie on it: SIMPLER), and the whole saved as one GLB, its colour picture and its normal
// map in it. Each is listed in client/models/assets.json's catalog, downloaded only once a
// dungeon's wanted (then: npm run build:manifest).

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { NodeIO } from "@gltf-transform/core";
import jpeg from "jpeg-js";
import { MeshoptSimplifier } from "meshoptimizer";
import { fetchSource } from "./sounds/sources.js";

const OUT = new URL("../client/models/dungeons/", import.meta.url);
const CATALOG = new URL("../client/models/assets.json", import.meta.url);

/**
 * The models, by name: which of Poly Haven's (`id`), what it is, how big its pictures are made
 * (`pixels` across) and how many triangles it's let keep at most.
 */
export const PROPS = {
    barrel: { id: "wine_barrel_01", of: "a barrel", pixels: 512, triangles: 6000 },
    crate: { id: "wooden_crate_02", of: "a crate", pixels: 512, triangles: 2500 },
    table: { id: "wooden_table_02", of: "a rough table", pixels: 512, triangles: 2000 },
    "fire-pit": { id: "stone_fire_pit", of: "a fire pit ringed with stones", pixels: 512, triangles: 2500 },
    boulder: { id: "moon_rock_02", of: "a fallen rock", pixels: 512, triangles: 1500 },
    bust: { id: "marble_bust_01", of: "a marble bust on its plinth", pixels: 512, triangles: 4000 },
    vase: { id: "brass_vase_04", of: "a brass vase, an altar's", pixels: 256, triangles: 1500 },
    axe: { id: "wooden_axe", of: "a woodsman's axe", pixels: 256, triangles: 1200 },
};

// Poly Haven's file listing for a model (its 1K glTF and what that includes)
async function listing(id) {
    return JSON.parse(Buffer.from(await fetchSource({ url: `https://api.polyhaven.com/files/${id}` })).toString("utf8")).gltf["1k"].gltf;
}

const linear = (value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
const encoded = (value) => (value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055);

// A picture made `size` across (from any size a whole multiple of it), each pixel the average of
// those it stands for (in linear light for a colour, renormalised for a normal map); a colour
// darkened by an occlusion picture's red channel (Poly Haven's ARM: occlusion, roughness, metal)
function shrunk({ width, data }, size, kind, arm = null) {
    const step = width / size;
    const out = Buffer.alloc(size * size * 4);

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const sum = [0, 0, 0];

            for (let j = 0; j < step; j++) {
                for (let i = 0; i < step; i++) {
                    const p = ((y * step + j) * width + x * step + i) * 4;
                    const shade = arm ? arm.data[p] / 255 : 1;

                    for (let c = 0; c < 3; c++) {
                        sum[c] += kind === "normal" ? data[p + c] / 127.5 - 1 : linear(data[p + c] / 255) * shade;
                    }
                }
            }

            const q = (y * size + x) * 4;
            const length = kind === "normal" ? Math.hypot(...sum) || 1 : step * step;

            for (let c = 0; c < 3; c++) {
                out[q + c] = kind === "normal" ? Math.round((sum[c] / length + 1) * 127.5) : Math.round(encoded(sum[c] / length) * 255);
            }

            out[q + 3] = 255;
        }
    }

    return { width: size, height: size, data: out };
}

// How the meshes are made simpler: no further from the model's shape than `error` (of its size), its
// pictures' places (`weights`: u, v) and which way it faces (x, y, z) kept as well as its shape, so
// that no triangle comes to stretch across the picture (a barrel's hoops, its staves)
const SIMPLER = Object.freeze({ error: 0.02, weights: [1, 1, 0.5, 0.5, 0.5] });

// A primitive's pictures' places and normals, five numbers to a point (for the simplifier)
function attributesOf(primitive) {
    const [uv, normal] = [primitive.getAttribute("TEXCOORD_0")?.getArray(), primitive.getAttribute("NORMAL")?.getArray()];
    const points = primitive.getAttribute("POSITION").getCount();
    const out = new Float32Array(points * 5);

    for (let p = 0; p < points; p++) {
        out.set([uv?.[p * 2] ?? 0, uv?.[p * 2 + 1] ?? 0, normal?.[p * 3] ?? 0, normal?.[p * 3 + 1] ?? 0, normal?.[p * 3 + 2] ?? 0], p * 5);
    }

    return out;
}

// A primitive keeping only the points its triangles (`kept`, indices into its points) still use,
// each of its attributes cut down to those
function compact(primitive, kept) {
    const remap = new Map();

    for (const p of kept) {
        if (!remap.has(p)) {
            remap.set(p, remap.size);
        }
    }

    for (const semantic of primitive.listSemantics()) {
        const attribute = primitive.getAttribute(semantic);
        const [size, from] = [attribute.getElementSize(), attribute.getArray()];
        const to = new from.constructor(remap.size * size);

        for (const [old, now] of remap) {
            to.set(from.subarray(old * size, old * size + size), now * size);
        }

        // (A copy of its own: another primitive may share the attribute)
        primitive.setAttribute(semantic, attribute.clone().setArray(to));
    }

    const indices = remap.size > 65535 ? new Uint32Array(kept.length) : new Uint16Array(kept.length);

    kept.forEach((p, k) => {
        indices[k] = remap.get(p);
    });
    primitive.setIndices(primitive.getIndices().clone().setArray(indices));
}

async function make(name, { id, pixels, triangles }) {
    const files = await listing(id);
    const json = JSON.parse(Buffer.from(await fetchSource({ url: files.url })).toString("utf8"));
    const resources = {};

    for (const [path, { url }] of Object.entries(files.include)) {
        resources[path] = new Uint8Array(await fetchSource({ url }));
    }

    await MeshoptSimplifier.ready;

    const io = new NodeIO();
    const document = await io.readJSON({ json, resources });
    const root = document.getRoot();
    let kept = 0;

    // Each mesh made simpler, all of them sharing the model's allowance by how many they have
    const primitives = root.listMeshes().flatMap((mesh) => mesh.listPrimitives());
    const total = primitives.reduce((sum, primitive) => sum + primitive.getIndices().getCount() / 3, 0);

    for (const primitive of primitives) {
        const indices = primitive.getIndices();
        const count = indices.getCount();
        const target = Math.floor(((count / 3) * Math.min(1, triangles / total))) * 3;

        if (target < count) {
            const positions = primitive.getAttribute("POSITION").getArray();
            const [simpler] = MeshoptSimplifier.simplifyWithAttributes(new Uint32Array(indices.getArray()), new Float32Array(positions), 3, attributesOf(primitive), 5, SIMPLER.weights, null, target, SIMPLER.error, ["LockBorder"]);

            compact(primitive, simpler);
        }

        kept += primitive.getIndices().getCount() / 3;
    }

    // Its pictures: the colour darkened by its occlusion, the normal map; the rest let go of
    for (const material of root.listMaterials()) {
        const [colour, normal, arm] = [material.getBaseColorTexture(), material.getNormalTexture(), material.getOcclusionTexture() ?? material.getMetallicRoughnessTexture()];
        const decode = (texture) => texture && jpeg.decode(texture.getImage(), { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 1024 });
        const [c, n, a] = [decode(colour), decode(normal), decode(arm)];

        if (colour) {
            colour.setImage(new Uint8Array(jpeg.encode(shrunk(c, pixels, "colour", a?.width === c.width ? a : null), 82).data)).setMimeType("image/jpeg").setURI(`${name}-colour.jpg`);
        }

        if (normal) {
            normal.setImage(new Uint8Array(jpeg.encode(shrunk(n, pixels, "normal"), 86).data)).setMimeType("image/jpeg").setURI(`${name}-normal.jpg`);
        }

        material.setOcclusionTexture(null).setMetallicRoughnessTexture(null).setMetallicFactor(0);
    }

    for (const texture of root.listTextures()) {
        if (!texture.listParents().some((parent) => parent !== root)) {
            texture.dispose();
        }
    }

    for (const accessor of root.listAccessors()) {
        if (!accessor.listParents().some((parent) => parent !== root)) {
            accessor.dispose();
        }
    }

    const glb = await io.writeBinary(document);

    await writeFile(new URL(`${name}.glb`, OUT), glb);

    return { kept, bytes: glb.length };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
    await mkdir(OUT, { recursive: true });

    for (const [name, prop] of Object.entries(PROPS)) {
        const { kept, bytes } = await make(name, prop);

        console.log(`${name}: ${Math.round(kept)} triangles, ${Math.round(bytes / 1024)} KB`);
    }

    const catalog = JSON.parse(await readFile(CATALOG, "utf8"));

    for (const [name, { id, of }] of Object.entries(PROPS)) {
        catalog.models[`dungeon-prop-${name}`] = {
            tier: "demand",
            label: `${of[0].toUpperCase()}${of.slice(1)} (Poly Haven ${id}, CC0)`,
            files: [{ path: `models/dungeons/${name}.glb` }],
        };
    }

    await writeFile(CATALOG, `${JSON.stringify(catalog, null, 4)}\n`);
    console.log("Now npm run build:manifest");
}
