// Rigid equipment: weapons, shields, helmets, packs, built from simple shapes.
//
// Each item is made in its own frame, in metres, with the origin where it attaches: for things
// held, the middle of the grip, with +y along the grip towards the business end (the blade, the
// staff's head) and +z the direction the edge or muzzle faces. Sockets (equipment.js) say where
// that frame goes on the body; `size` scales items that fit the body (helmets fit the head).

import * as THREE from "three";
import { fireLit } from "../world/firelight.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { HeadMap, headPlate, rimLine } from "./headwear.js";
import { LIVERIES } from "./liveries.js";
import { smoothstep } from "./noise.js";

const materials = new Map();

/** Shared materials for items, by name. */
export function itemMaterial(name) {
    if (!materials.has(name)) {
        const settings = {
            steel: { color: 0xc3c8cc, metalness: 1, roughness: 0.28 },
            darkSteel: { color: 0x5d6368, metalness: 1, roughness: 0.4 },
            iron: { color: 0x6d6a66, metalness: 0.9, roughness: 0.55 },
            brass: { color: 0xc49a46, metalness: 1, roughness: 0.35 },
            leather: { color: 0x4a2f1d, roughness: 0.7 },
            darkLeather: { color: 0x2e1d12, roughness: 0.75 },
            wood: { color: 0x7a5132, roughness: 0.75 },
            darkWood: { color: 0x4b3020, roughness: 0.8 },
            canvas: { color: 0x8c7a57, roughness: 0.95 },
            cloth: { color: 0x3b4f7a, roughness: 0.9 },
            string: { color: 0xe0d6bf, roughness: 0.8 },
            feather: { color: 0xd9d2c3, roughness: 0.9, side: THREE.DoubleSide },
            bone: { color: 0xe8dcc0, roughness: 0.55 },
            parchment: { color: 0xe6d8b0, roughness: 0.9 },
            crystal: { color: 0x7fd8ff, emissive: 0x2a8cff, emissiveIntensity: 1.2, roughness: 0.1, metalness: 0, transparent: true, opacity: 0.9 },
            pewter: { color: 0x9a9ea0, metalness: 0.85, roughness: 0.42 },
            foam: { color: 0xf3ead2, roughness: 0.95 },
            hotIron: { color: 0xff7a2a, emissive: 0xff4a0a, emissiveIntensity: 1.4, roughness: 0.6 },
            gold: { color: 0xe0b44a, metalness: 1, roughness: 0.25 },
            // (Stands for the character's own skin or fur: a character gives what's made of it its
            // own colour, character.js)
            skin: { color: 0xc8a080, roughness: 0.8 },
            earInner: { color: 0xd9a3a0, roughness: 0.75 },
            ruby: { color: 0xb3142a, emissive: 0x3a0008, emissiveIntensity: 0.6, roughness: 0.15 },
            // (What the townsfolk carry and wear: wicker, sacking, straw, linen, wool, earthenware,
            // and what's in a basket)
            wicker: { color: 0xa47a45, roughness: 0.92 },
            sacking: { color: 0x9b8660, roughness: 1 },
            straw: { color: 0xd8bd74, roughness: 0.95 },
            linen: { color: 0xece4d2, roughness: 0.9, side: THREE.DoubleSide },
            wool: { color: 0x6a5238, roughness: 0.95, side: THREE.DoubleSide },
            earthenware: { color: 0xa65a35, roughness: 0.8 },
            bread: { color: 0xc58a46, roughness: 0.85 },
            apple: { color: 0xb3332a, roughness: 0.55 },
            greens: { color: 0x5f8a3a, roughness: 0.8 },
            bark: { color: 0x5a4532, roughness: 0.95 },
            // (Each people's baskets, their weaves and what's in them: dress.js)
            paleWicker: { color: 0xc9c6b4, roughness: 0.85 },
            paleWood: { color: 0xd8d0bc, roughness: 0.7 },
            silver: { color: 0xdde3ea, metalness: 1, roughness: 0.25 },
            whiteBloom: { color: 0xf4f1ea, roughness: 0.7 },
            violetBloom: { color: 0x9b7fd0, roughness: 0.7 },
            blackReed: { color: 0x1d1a22, roughness: 0.75 },
            amethyst: { color: 0x7a3fc4, emissive: 0x3a1080, emissiveIntensity: 0.6, roughness: 0.15 },
            emerald: { color: 0x2f9a5a, emissive: 0x0a3a1a, emissiveIntensity: 0.5, roughness: 0.15 },
            paleStalk: { color: 0xd9d4e6, roughness: 0.8 },
            glowCap: { color: 0xb8a6ff, emissive: 0x6a4cff, emissiveIntensity: 0.9, roughness: 0.6 },
            saffronWeave: { color: 0xe0a02a, roughness: 0.85 },
            indigoWeave: { color: 0x2f3f95, roughness: 0.85 },
            redWeave: { color: 0xb33224, roughness: 0.85 },
            mango: { color: 0xe8952a, roughness: 0.55 },
            lemon: { color: 0xe6d14a, roughness: 0.55 },
            reed: { color: 0xb59a5c, roughness: 0.9 },
            turquoiseWeave: { color: 0x2fb3a0, roughness: 0.85 },
            crimsonWeave: { color: 0xa8322a, roughness: 0.85 },
            maize: { color: 0xe8c040, roughness: 0.7 },
            cacao: { color: 0x8a3a1e, roughness: 0.6 },
            hide: { color: 0x8a6a48, roughness: 0.85 },
            meat: { color: 0x8c2f24, roughness: 0.6 },
            root: { color: 0x9a7a52, roughness: 0.9 },
        }[name] ?? dyed(name);

        // (Named, so that a character can find what's made of its skin)
        materials.set(name, Object.assign(new THREE.MeshStandardMaterial(settings), { name }));
    }

    return materials.get(name);
}

// A material of a colour of a people's (characters/liveries.js): "metal:#c3c8cc", "cloth:#27407a",
// "paint:#7a1a14" (a painted face, a little glossy)
function dyed(name) {
    const [kind, colour] = name.split(":");
    const color = new THREE.Color(colour ?? "#ff00ff");

    switch (kind) {
        case "metal":
            return { color, metalness: 1, roughness: 0.32 };
        case "cloth":
            return { color, roughness: 0.88, side: THREE.DoubleSide };
        case "paint":
            return { color, roughness: 0.55 };
        default:
            return { color: 0xff00ff };
    }
}

// The most materials one item's parts are folded together from
const FOLDS = 8;

/**
 * An item's parts of several materials in one mesh (one draw call where there'd be one for each
 * material): each vertex says which of them it's of (`fold`: 0 to FOLDS - 1), and takes that one's
 * colour, metalness and roughness. One shader for every item; each item's materials its own.
 */
class FoldedMaterial extends THREE.MeshStandardMaterial {
    /** @param {string[]} [names] - Each fold's material (itemMaterial's names). */
    constructor(names = []) {
        super({ metalness: 1, roughness: 1 });
        this.name = names.join("+");
        this.colours = new Float32Array(FOLDS * 3);
        this.surfaces = new Float32Array(FOLDS * 2);

        names.forEach((name, fold) => {
            const { color, metalness, roughness } = itemMaterial(name);

            color.toArray(this.colours, fold * 3);
            this.surfaces[fold * 2] = metalness;
            this.surfaces[fold * 2 + 1] = roughness;
        });
    }

    onBeforeCompile(shader) {
        shader.uniforms.foldColours = { value: this.colours };
        shader.uniforms.foldSurfaces = { value: this.surfaces };
        shader.vertexShader = shader.vertexShader
            .replace("#include <common>", `#include <common>\nattribute float fold;\nuniform vec3 foldColours[${FOLDS}];\nuniform vec2 foldSurfaces[${FOLDS}];\nvarying vec3 vFoldColour;\nvarying vec2 vFoldSurface;`)
            .replace("#include <begin_vertex>", "#include <begin_vertex>\nvFoldColour = foldColours[int(fold)];\nvFoldSurface = foldSurfaces[int(fold)];");
        shader.fragmentShader = shader.fragmentShader
            .replace("#include <common>", "#include <common>\nvarying vec3 vFoldColour;\nvarying vec2 vFoldSurface;")
            .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb *= vFoldColour;")
            .replace("#include <metalnessmap_fragment>", "#include <metalnessmap_fragment>\nmetalnessFactor *= vFoldSurface.x;\nroughnessFactor *= vFoldSurface.y;");
        fireLit(shader);
    }

    customProgramCacheKey() {
        return "item-folded";
    }

    // (Copied with its folds: someone unseen has their materials copied, game.js)
    copy(source) {
        super.copy(source);
        this.colours = source.colours.slice();
        this.surfaces = source.surfaces.slice();

        return this;
    }
}

const folded = new Map();

// The folded material of these materials, shared by every item of them
function foldedMaterial(names) {
    const key = names.join("+");

    if (!folded.has(key)) {
        folded.set(key, new FoldedMaterial(names));
    }

    return folded.get(key);
}

// Whether a material's parts can be folded in with others': opaque, not glowing, and not what a
// character colours as their own (character.js: "skin")
const foldable = (material) => material.name !== "skin" && !material.transparent && material.emissive.getHex() === 0;

// A thin part's other side (a plume, a pennant, fletching), as faces of its own lit from that side,
// as a two-sided material draws it, so it can be in a one-sided mesh
function bothSides(geometry) {
    const position = geometry.attributes.position.array;
    const normal = geometry.attributes.normal.array;
    const [positions, normals] = [new Float32Array(position.length * 2), new Float32Array(normal.length * 2)];

    positions.set(position);
    normals.set(normal);

    // (Each face turned over: its corners the other way round, facing the other way)
    for (let face = 0; face < position.length; face += 9) {
        for (const [to, from] of [[0, 0], [1, 2], [2, 1]]) {
            for (let axis = 0; axis < 3; axis++) {
                positions[position.length + face + to * 3 + axis] = position[face + from * 3 + axis];
                normals[position.length + face + to * 3 + axis] = -normal[face + from * 3 + axis];
            }
        }
    }

    const both = new THREE.BufferGeometry();

    both.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    both.setAttribute("normal", new THREE.BufferAttribute(normals, 3));

    return both;
}

/**
 * Merge geometries into one group of meshes: the parts of all the materials that can be (opaque,
 * not glowing, not skin) in one mesh, and the rest one mesh for each material.
 */
function assemble(parts, name) {
    const byMaterial = new Map();

    for (const [geometry, material] of parts) {
        const list = byMaterial.get(material) ?? [];

        // Every part without an index, so they merge
        list.push(geometry.index ? geometry.toNonIndexed() : geometry);
        byMaterial.set(material, list);
    }

    const group = new THREE.Group();
    const add = (geometry, material) => {
        const mesh = new THREE.Mesh(geometry, material);

        mesh.castShadow = true;
        group.add(mesh);
    };

    group.name = name;

    for (const list of byMaterial.values()) {
        for (const geometry of list) {
            geometry.deleteAttribute("uv");
        }
    }

    const folds = [...byMaterial.keys()].filter((material) => foldable(itemMaterial(material))).slice(0, FOLDS);

    // (Folded only where that saves a draw call)
    if (folds.length > 1) {
        const merged = folds.flatMap((material, fold) =>
            byMaterial.get(material).map((geometry) => {
                const { position, normal } = (itemMaterial(material).side === THREE.DoubleSide ? bothSides(geometry) : geometry).attributes;
                const part = new THREE.BufferGeometry();

                part.setAttribute("position", position);
                part.setAttribute("normal", normal);
                part.setAttribute("fold", new THREE.BufferAttribute(new Uint8Array(position.count).fill(fold), 1));

                return part;
            }),
        );

        add(mergeGeometries(merged), foldedMaterial(folds));

        for (const material of folds) {
            byMaterial.delete(material);
        }
    }

    for (const [material, list] of byMaterial) {
        add(mergeGeometries(list), itemMaterial(material));
    }

    return group;
}

const at = (geometry, x, y, z, rx = 0, ry = 0, rz = 0) => {
    geometry.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)).setPosition(x, y, z));

    return geometry;
};

/**
 * A blade: a diamond cross-section (width across z, thickness across x) tapering from `width`
 * at the base to a point, `length` long, starting at y = `base`.
 */
function blade(length, width, thickness, base, taper = 0.25) {
    const rows = 12;
    const positions = [];
    const indices = [];

    for (let r = 0; r <= rows; r++) {
        const t = r / rows;
        const y = base + t * length;

        // Straight for most of the way, then a point
        const w = (width / 2) * (t < 1 - taper ? 1 - 0.15 * t : (1 - 0.15 * (1 - taper)) * ((1 - t) / taper));
        const h = (thickness / 2) * Math.max(0.2, w / (width / 2));

        positions.push(0, y, w, h, y, 0, 0, y, -w, -h, y, 0);
    }

    for (let r = 0; r < rows; r++) {
        for (let k = 0; k < 4; k++) {
            const a = r * 4 + k;
            const b = r * 4 + ((k + 1) % 4);

            indices.push(a, b, a + 4, b, b + 4, a + 4);
        }
    }

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    return geometry.toNonIndexed();
}

function sword() {
    return assemble([
        [blade(0.74, 0.046, 0.009, 0.075), "steel"],
        [at(new THREE.BoxGeometry(0.03, 0.022, 0.19), 0, 0.064, 0), "brass"],
        [at(new THREE.CylinderGeometry(0.0145, 0.0135, 0.11, 10), 0, 0, 0), "darkLeather"],
        [at(new THREE.SphereGeometry(0.023, 12, 8), 0, -0.068, 0), "brass"],
    ], "sword");
}

function staff() {
    const knots = [];

    for (let k = 0; k < 4; k++) {
        const angle = (k / 4) * Math.PI * 2;

        knots.push([at(new THREE.TorusGeometry(0.035, 0.008, 6, 12, Math.PI), Math.cos(angle) * 0.01, 0.78, Math.sin(angle) * 0.01, 0, angle, 0), "darkWood"]);
    }

    return assemble([
        [at(new THREE.CylinderGeometry(0.015, 0.018, 1.62, 10), 0, -0.05, 0), "wood"],
        [at(new THREE.CylinderGeometry(0.022, 0.02, 0.1, 10), 0, 0.72, 0), "brass"],
        ...knots,
        [at(new THREE.OctahedronGeometry(0.035, 0).scale(1, 1.5, 1), 0, 0.84, 0), "crystal"],
        [at(new THREE.CylinderGeometry(0.019, 0.019, 0.12, 10), 0, 0, 0), "leather"],
    ], "staff");
}

function bow() {
    // The limbs curve back towards the archer (-z); the string joins the tips
    const half = 0.72;
    const curve = new THREE.CatmullRomCurve3([-1, -0.6, -0.25, 0, 0.25, 0.6, 1].map((t) => new THREE.Vector3(0, t * half, -0.09 * t * t - 0.02 * Math.abs(t) ** 4 + (Math.abs(t) > 0.9 ? 0.03 * (Math.abs(t) - 0.9) * 10 : 0))));
    const tip = curve.getPoint(0);
    const end = curve.getPoint(1);
    const string = new THREE.CylinderGeometry(0.0016, 0.0016, end.y - tip.y, 4);

    return assemble([
        [new THREE.TubeGeometry(curve, 40, 0.011, 6), "wood"],
        [at(new THREE.CylinderGeometry(0.016, 0.016, 0.1, 8), 0, 0, 0), "leather"],
        [at(string, 0, 0, tip.z), "string"],
    ], "bow");
}

function wand() {
    // A tapering wand of dark wood, bound at the grip, with a crystal at the tip
    return assemble([
        [at(new THREE.CylinderGeometry(0.0045, 0.0085, 0.3, 8), 0, 0.12, 0), "darkWood"],
        [at(new THREE.CylinderGeometry(0.011, 0.011, 0.09, 8), 0, -0.005, 0), "leather"],
        [at(new THREE.SphereGeometry(0.012, 8, 6), 0, -0.055, 0), "brass"],
        [at(new THREE.CylinderGeometry(0.008, 0.006, 0.012, 8), 0, 0.272, 0), "brass"],
        [at(new THREE.OctahedronGeometry(0.014, 0).scale(1, 1.6, 1), 0, 0.292, 0), "crystal"],
    ], "wand");
}

// A torch carried at night (a guard's): an ash shaft gripped near its foot, iron bands, and a
// head of pitch-soaked rags at its top, where its flame burns (HAND_TORCH_FLAME, above the grip)
function handTorch() {
    return assemble([
        [at(new THREE.CylinderGeometry(0.016, 0.014, 0.56, 8), 0, 0.2, 0), "wood"],
        [at(new THREE.CylinderGeometry(HAND_TORCH_GRIP, HAND_TORCH_GRIP, 0.09, 8), 0, 0, 0), "leather"],
        [at(new THREE.CylinderGeometry(0.034, 0.026, 0.12, 9), 0, 0.46, 0), "darkWood"],
        [at(new THREE.CylinderGeometry(0.036, 0.036, 0.015, 9), 0, 0.41, 0), "iron"],
        [at(new THREE.CylinderGeometry(0.036, 0.036, 0.015, 9), 0, 0.5, 0), "iron"],
    ], "torch");
}

/** Where a carried torch's flame burns, in its model's frame (metres up its shaft from the grip). */
export const HAND_TORCH_FLAME = [0, 0.53, 0];
/** How thick a carried torch's grip is (metres: its leather's radius), as a hand closes round it. */
export const HAND_TORCH_GRIP = 0.019;

function warHammer() {
    // A long ash haft (gripped a quarter of the way up, the other hand at its end), a square
    // steel head with a spike behind it, and a point on top; the striking face looks forward (+z)
    return assemble([
        [at(new THREE.CylinderGeometry(0.017, 0.019, 1.02, 10), 0, 0.25, 0), "wood"],
        [at(new THREE.CylinderGeometry(0.021, 0.021, 0.16, 10), 0, 0, 0), "leather"],
        [at(new THREE.CylinderGeometry(0.02, 0.02, 0.05, 10), 0, -0.27, 0), "iron"],
        [at(new THREE.BoxGeometry(0.075, 0.075, 0.13), 0, 0.72, 0.035), "darkSteel"],
        [at(new THREE.BoxGeometry(0.09, 0.09, 0.03), 0, 0.72, 0.11), "steel"],
        [at(new THREE.ConeGeometry(0.03, 0.13, 4), 0, 0.72, -0.09, -Math.PI / 2, 0, 0), "darkSteel"],
        [at(new THREE.ConeGeometry(0.018, 0.08, 4), 0, 0.8, 0.035), "darkSteel"],
        [at(new THREE.CylinderGeometry(0.024, 0.02, 0.05, 10), 0, 0.64, 0), "iron"],
    ], "hammer");
}

function greatsword() {
    // A long, broad blade over a wide cross; a grip a third of a metre long, as a two-handed
    // sword's is (the right hand by the cross, the left by the pommel, as far apart as a war
    // hammer's: equipment.js `haft`), bound in leather, a heavy pommel
    return assemble([
        [blade(1.0, 0.058, 0.011, 0.1, 0.18), "steel"],
        [at(new THREE.BoxGeometry(0.034, 0.026, 0.26), 0, 0.083, 0), "darkSteel"],
        [at(new THREE.BoxGeometry(0.022, 0.05, 0.07), 0, 0.12, 0), "darkSteel"],
        [at(new THREE.CylinderGeometry(0.016, 0.015, 0.32, 10), 0, -0.08, 0), "darkLeather"],
        [at(new THREE.CylinderGeometry(0.024, 0.02, 0.05, 8), 0, -0.265, 0), "darkSteel"],
    ], "greatsword");
}

function battleAxe() {
    // A long ash haft (gripped a quarter of the way up, the other hand by its foot) and a broad,
    // bearded steel blade (a disc's sector, thin across x, its edge forward, +z) on an iron socket,
    // a short lug behind
    return assemble([
        [at(new THREE.CylinderGeometry(0.017, 0.019, 1.1, 10), 0, 0.28, 0), "wood"],
        [at(new THREE.CylinderGeometry(0.021, 0.021, 0.16, 10), 0, 0, 0), "leather"],
        [at(new THREE.CylinderGeometry(0.02, 0.02, 0.05, 10), 0, -0.29, 0), "iron"],
        [at(new THREE.CylinderGeometry(0.13, 0.13, 0.012, 16, 1, false, -0.95, 1.9), 0, 0.72, -0.035, 0, 0, Math.PI / 2), "steel"],
        [at(new THREE.BoxGeometry(0.03, 0.12, 0.08), 0, 0.73, 0.02), "darkSteel"],
        [at(new THREE.BoxGeometry(0.044, 0.1, 0.05), 0, 0.73, -0.02), "iron"],
        [at(new THREE.BoxGeometry(0.03, 0.04, 0.05), 0, 0.73, -0.065), "darkSteel"],
    ], "battleAxe");
}

function grimoire() {
    // An open book lying on the palm: its spine along the fingers (+z), a cover and a block of
    // pages either side (across the hand, y), the pages facing away from the palm (-x)
    const half = (side) => [
        [at(new THREE.BoxGeometry(0.008, 0.13, 0.21), 0.004, side * 0.068, 0.05, side * 0.14, 0, 0), "darkLeather"],
        [at(new THREE.BoxGeometry(0.014, 0.12, 0.2), -0.007, side * 0.066, 0.05, side * 0.14, 0, 0), "parchment"],
    ];

    return assemble([
        ...half(1),
        ...half(-1),
        [at(new THREE.CylinderGeometry(0.009, 0.009, 0.21, 8), 0.004, 0, 0.05, Math.PI / 2, 0, 0), "darkLeather"],
        [at(new THREE.BoxGeometry(0.003, 0.02, 0.022), -0.016, 0.1, 0.13, 0.14, 0, 0), "brass"],
        [at(new THREE.BoxGeometry(0.003, 0.02, 0.022), -0.016, -0.1, 0.13, -0.14, 0, 0), "brass"],
    ], "grimoire");
}

// A closed grimoire, as it hangs at the hip: in the open one's frame (its spine along +z, its
// pages across y), both halves folded onto one side, a clasp holding them shut
function grimoireClosed() {
    return assemble([
        [at(new THREE.BoxGeometry(0.036, 0.13, 0.21), -0.004, 0.068, 0.05), "darkLeather"],
        [at(new THREE.BoxGeometry(0.03, 0.122, 0.2), -0.004, 0.07, 0.05), "parchment"],
        [at(new THREE.CylinderGeometry(0.018, 0.018, 0.21, 8, 1, false, Math.PI, Math.PI), -0.004, 0.003, 0.05, Math.PI / 2, 0, 0), "darkLeather"],
        [at(new THREE.BoxGeometry(0.04, 0.024, 0.02), -0.004, 0.13, 0.05), "brass"],
    ], "grimoireClosed");
}

// A sword's scabbard, in the sheathed sword's frame (the blade along +y from the hilt): leather
// over the blade, brass at its mouth and its tip, and a loop up to the belt
function scabbard() {
    return assemble([
        [at(new THREE.CylinderGeometry(0.02, 0.014, 0.72, 8).scale(1, 1, 1.6), 0, 0.44, 0), "darkLeather"],
        [at(new THREE.CylinderGeometry(0.023, 0.023, 0.04, 8).scale(1, 1, 1.6), 0, 0.09, 0), "brass"],
        [at(new THREE.ConeGeometry(0.016, 0.05, 8).scale(1, 1, 1.6), 0, 0.815, 0, Math.PI, 0, 0), "brass"],
        [at(new THREE.BoxGeometry(0.008, 0.07, 0.02), -0.022, 0.1, 0.03, 0, 0, 0.3), "darkLeather"],
    ], "scabbard");
}

function knuckleSpikes(scale) {
    // A steel plate over the knuckles (which are forward of the fist's grip, +z, across it along
    // y) with four spikes on it
    const parts = [[at(new THREE.BoxGeometry(0.03 * scale, 0.085 * scale, 0.014 * scale), 0, 0.004 * scale, 0.036 * scale), "darkSteel"]];

    for (let k = 0; k < 4; k++) {
        const y = (0.031 - k * 0.02) * scale;

        parts.push([at(new THREE.ConeGeometry(0.0075 * scale, 0.028 * scale, 6), 0, y, 0.055 * scale, Math.PI / 2, 0, 0), "steel"]);
    }

    return assemble(parts, "spikes");
}

// A curved plate: part of a ring round the y axis (`radius` to its outside, `thickness` thick),
// `height` tall, round from `from` to `to` (radians about y, from +z towards +x); its middle at the origin
function arcPlate(radius, thickness, height, from, to) {
    const shape = new THREE.Shape();
    const steps = 10;
    const point = (r, angle) => [r * Math.sin(angle), -r * Math.cos(angle)];

    shape.moveTo(...point(radius, from));

    for (let k = 1; k <= steps; k++) {
        shape.lineTo(...point(radius, from + ((to - from) * k) / steps));
    }

    for (let k = steps; k >= 0; k--) {
        shape.lineTo(...point(radius - thickness, from + ((to - from) * k) / steps));
    }

    const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });

    // (Drawn across x and z, standing up along y)
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, -height / 2, 0);

    return geometry;
}

// Spiked boots' iron (equipment.js: on the toes, heels and shins, facing forward, +z; one
// material, so each piece is one draw)
function toeSpike(scale) {
    // A domed cap over the toes (the origin a little back from their tips, on top), a spike
    // straight out of its front and two studs on top
    const cap = new THREE.SphereGeometry(0.044 * scale, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.5, 0.95);

    return assemble([
        [at(cap, 0, -0.012 * scale, -0.008 * scale), "darkSteel"],
        [at(new THREE.ConeGeometry(0.008 * scale, 0.042 * scale, 6), 0, 0, 0.052 * scale, Math.PI / 2, 0, 0), "darkSteel"],
        [at(new THREE.ConeGeometry(0.005 * scale, 0.014 * scale, 5), 0.018 * scale, 0.012 * scale, -0.004 * scale, 0.5, 0, -0.4), "darkSteel"],
        [at(new THREE.ConeGeometry(0.005 * scale, 0.014 * scale, 5), -0.018 * scale, 0.012 * scale, -0.004 * scale, 0.5, 0, 0.4), "darkSteel"],
    ], "toeSpike");
}

function heelSpur(scale) {
    // A band round the back of the heel (the origin on it) and a spur pointing back from it
    const radius = 0.037 * scale;
    const band = arcPlate(radius, 0.004 * scale, 0.03 * scale, Math.PI * 0.62, Math.PI * 1.38);

    return assemble([
        [at(band, 0, 0, radius), "darkSteel"],
        [at(new THREE.ConeGeometry(0.009 * scale, 0.038 * scale, 6), 0, 0, -0.021 * scale, -Math.PI / 2, 0, 0), "darkSteel"],
    ], "heelSpur");
}

function shinPlate(scale, shin = null) {
    // A curved plate down the front of the shin (the origin on it), three spikes along it; curved
    // round as the shin it's fitted to (`shin`, its radius: equipment.js) or an average one, as
    // wide either way
    const radius = shin ?? 0.046 * scale;
    const round = (0.046 * scale * Math.PI * 0.36) / radius;
    const parts = [[at(arcPlate(radius, 0.004 * scale, 0.17 * scale, -round, round), 0, 0, -radius), "darkSteel"]];

    for (const y of [-0.055, 0, 0.055]) {
        parts.push([at(new THREE.ConeGeometry(0.0075 * scale, 0.032 * scale, 6), 0, y * scale, 0.014 * scale, Math.PI / 2, 0, 0), "darkSteel"]);
    }

    return assemble(parts, "shinPlate");
}

function cleaver() {
    // A broad, heavy, notched blade on a short wooden grip, its edge forward (+z)
    const outline = new THREE.Shape();

    outline.moveTo(-0.015, 0.07);
    outline.lineTo(0.075, 0.075);
    outline.lineTo(0.082, 0.2);
    outline.lineTo(0.074, 0.212);
    outline.lineTo(0.084, 0.23);
    outline.lineTo(0.088, 0.4);
    outline.quadraticCurveTo(0.09, 0.52, 0.035, 0.55);
    outline.lineTo(-0.03, 0.53);
    outline.lineTo(-0.03, 0.3);
    outline.lineTo(-0.022, 0.12);
    outline.lineTo(-0.015, 0.07);

    const blade = new THREE.ExtrudeGeometry(outline, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1, curveSegments: 6 });

    // The outline is drawn in x (edge) and y; the edge should face +z, the flat of the blade x
    blade.translate(0, 0, -0.003);
    blade.rotateY(-Math.PI / 2);

    return assemble([
        [blade, "iron"],
        [at(new THREE.BoxGeometry(0.03, 0.02, 0.13), 0, 0.064, 0.02), "darkSteel"],
        [at(new THREE.CylinderGeometry(0.016, 0.014, 0.13, 8), 0, 0, 0), "darkWood"],
        [at(new THREE.CylinderGeometry(0.019, 0.019, 0.02, 8), 0, -0.07, 0), "iron"],
    ], "cleaver");
}

function pistol() {
    return assemble([
        [at(new THREE.CylinderGeometry(0.011, 0.012, 0.26, 10), 0, 0.03, 0.13, Math.PI / 2, 0, 0), "darkSteel"],
        [at(new THREE.BoxGeometry(0.024, 0.032, 0.2), 0, 0.028, 0.06), "darkWood"],
        [at(new THREE.BoxGeometry(0.022, 0.12, 0.034), 0, -0.035, -0.035, -0.35, 0, 0), "darkWood"],
        [at(new THREE.SphereGeometry(0.02, 10, 8), 0, -0.1, -0.058), "brass"],
        [at(new THREE.BoxGeometry(0.026, 0.02, 0.04), 0.004, 0.04, -0.005), "iron"],
        [at(new THREE.TorusGeometry(0.018, 0.0025, 4, 12, Math.PI), 0, 0.005, 0.01, 0, Math.PI / 2, Math.PI), "brass"],
    ], "pistol");
}

function musket() {
    return assemble([
        [at(new THREE.CylinderGeometry(0.011, 0.013, 0.95, 10), 0, 0.38, 0), "darkSteel"],
        [at(new THREE.BoxGeometry(0.03, 0.8, 0.04), 0, 0.2, -0.018), "wood"],
        [at(new THREE.BoxGeometry(0.036, 0.34, 0.09), 0, -0.34, -0.04, 0.12, 0, 0), "wood"],
        [at(new THREE.BoxGeometry(0.03, 0.05, 0.03), 0.01, -0.12, 0.0), "iron"],
        [at(new THREE.TorusGeometry(0.02, 0.003, 4, 10), 0, 0.5, -0.02, 0, Math.PI / 2, 0), "brass"],
    ], "musket");
}

function roundShield() {
    // Faces +x (away from the forearm it's strapped to): a shallow dome of boards, about 60 cm
    // across, with a back, an iron rim and a steel boss
    const face = new THREE.SphereGeometry(0.62, 32, 6, 0, Math.PI * 2, 0, 0.5);

    face.scale(1, 0.35, 1);
    at(face, 0, -0.62 * 0.35 + 0.027, 0);

    return assemble([
        [at(face, 0, 0, 0, 0, 0, -Math.PI / 2), "wood"],
        [at(new THREE.CylinderGeometry(0.297, 0.297, 0.012, 32), -0.006, 0, 0, 0, 0, Math.PI / 2), "darkWood"],
        [at(new THREE.TorusGeometry(0.297, 0.012, 6, 40), 0, 0, 0, 0, Math.PI / 2, 0), "iron"],
        [at(new THREE.SphereGeometry(0.07, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0.022, 0, 0, 0, 0, -Math.PI / 2), "steel"],
    ], "shield");
}

function kiteShield() {
    const shape = new THREE.Shape();

    shape.moveTo(0, 0.36);
    shape.quadraticCurveTo(0.27, 0.34, 0.26, 0.12);
    shape.quadraticCurveTo(0.22, -0.25, 0, -0.52);
    shape.quadraticCurveTo(-0.22, -0.25, -0.26, 0.12);
    shape.quadraticCurveTo(-0.27, 0.34, 0, 0.36);

    const body = new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.012, bevelSegments: 2, curveSegments: 16 });

    // Curve it round the arm a little, then face it outward (+x)
    const position = body.attributes.position;

    for (let i = 0; i < position.count; i++) {
        const x = position.getX(i);

        position.setZ(i, position.getZ(i) - x * x * 0.6);
    }

    body.computeVertexNormals();
    at(body, 0, 0, 0, 0, Math.PI / 2, 0);

    return assemble([
        [body, "cloth"],
        [at(new THREE.SphereGeometry(0.05, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0.035, 0.05, 0, 0, 0, -Math.PI / 2), "brass"],
    ], "shield");
}

function towerShield() {
    // A tall, rounded-cornered shield of boards bent round the body (as a legionary's), about a
    // metre high and 60 cm across, rimmed in iron, a boss over the grip and two iron bands
    const shape = new THREE.Shape();
    const [w, top, bottom, r] = [0.29, 0.42, -0.62, 0.06];

    shape.moveTo(-w + r, bottom);
    shape.lineTo(w - r, bottom);
    shape.quadraticCurveTo(w, bottom, w, bottom + r);
    shape.lineTo(w, top - r);
    shape.quadraticCurveTo(w, top, w - r, top);
    shape.lineTo(-w + r, top);
    shape.quadraticCurveTo(-w, top, -w, top - r);
    shape.lineTo(-w, bottom + r);
    shape.quadraticCurveTo(-w, bottom, -w + r, bottom);

    const body = new THREE.ExtrudeGeometry(shape, { depth: 0.025, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.01, bevelSegments: 1, curveSegments: 6 });
    const bend = (geometry) => {
        const position = geometry.attributes.position;

        for (let i = 0; i < position.count; i++) {
            const x = position.getX(i);

            position.setZ(i, position.getZ(i) - x * x * 0.9);
        }

        geometry.computeVertexNormals();

        return geometry;
    };
    const band = (y) => bend(new THREE.BoxGeometry(w * 2 + 0.01, 0.035, 0.05, 12, 1, 1).translate(0, y, 0.02));

    // (Bent round the arm, then faced outward, +x, as the others)
    return assemble([
        [at(bend(body), 0, 0, 0, 0, Math.PI / 2, 0), "wood"],
        [at(band(top - 0.1), 0, 0, 0, 0, Math.PI / 2, 0), "iron"],
        [at(band(bottom + 0.1), 0, 0, 0, 0, Math.PI / 2, 0), "iron"],
        [at(new THREE.SphereGeometry(0.075, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0.045, -0.05, 0, 0, 0, -Math.PI / 2), "steel"],
    ], "shield");
}

function spellward() {
    // A mage's shield: a small buckler of dark wood, about 36 cm across, rimmed in brass, with a
    // ring of runes in silver round a crystal set in its middle, that glows
    const face = new THREE.SphereGeometry(0.4, 24, 5, 0, Math.PI * 2, 0, 0.47);

    face.scale(1, 0.3, 1);
    at(face, 0, -0.4 * 0.3 + 0.012, 0);

    const runes = Array.from({ length: 8 }, (_, k) => {
        const angle = (k / 8) * Math.PI * 2;

        return [at(new THREE.BoxGeometry(0.006, 0.03, 0.012), 0.016, Math.cos(angle) * 0.12, Math.sin(angle) * 0.12, angle, 0, 0), "pewter"];
    });

    return assemble([
        [at(face, 0, 0, 0, 0, 0, -Math.PI / 2), "darkWood"],
        [at(new THREE.CylinderGeometry(0.178, 0.178, 0.01, 28), -0.005, 0, 0, 0, 0, Math.PI / 2), "darkWood"],
        [at(new THREE.TorusGeometry(0.178, 0.009, 6, 36), 0, 0, 0, 0, Math.PI / 2, 0), "brass"],
        [at(new THREE.TorusGeometry(0.12, 0.004, 4, 32), 0.012, 0, 0, 0, Math.PI / 2, 0), "pewter"],
        ...runes,
        [at(new THREE.OctahedronGeometry(0.04, 0).scale(0.6, 1.2, 1), 0.03, 0, 0), "crystal"],
    ], "shield");
}

/** A helmet that fits a head of `radius` (metres), its origin at the head's middle. */
function helmet(radius, style) {
    const r = radius * 1.08;
    const parts = [];
    const dome = new THREE.SphereGeometry(r, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.55);

    dome.scale(0.86, 0.98, 1.02);
    parts.push([dome, style === "orc" ? "iron" : "steel"]);

    const band = new THREE.CylinderGeometry(r * 1.0, r * 1.0, r * 0.18, 32, 1, true);

    band.scale(0.87, 1, 1.03);
    parts.push([at(band, 0, r * 0.08 - r * 0.1, 0), style === "orc" ? "darkSteel" : "brass"]);

    if (style === "nasal") {
        parts.push([at(new THREE.BoxGeometry(r * 0.12, r * 0.55, r * 0.05), 0, -r * 0.2, r * 1.08, -0.12, 0, 0), "steel"]);
    }

    if (style === "orc") {
        for (const side of [-1, 1]) {
            const horn = new THREE.ConeGeometry(r * 0.22, r * 1.5, 12, 8);
            const position = horn.attributes.position;

            // Curve the horn outwards and up
            for (let i = 0; i < position.count; i++) {
                const y = position.getY(i) + r * 0.75;

                position.setX(i, position.getX(i) + side * (y * y) * 1.2);
            }

            horn.computeVertexNormals();
            parts.push([at(horn, side * r * 0.95, r * 0.55, 0, 0, 0, -side * 1.15), "bone"]);
        }

        parts.push([at(new THREE.BoxGeometry(r * 0.08, r * 0.5, r * 0.08), 0, r * 0.95, -r * 0.2, -0.6, 0, 0), "darkSteel"]);
    }

    return assemble(parts, "helmet");
}

function wizardHat(radius) {
    const r = radius * 1.08;
    const cone = new THREE.ConeGeometry(r * 0.95, r * 3, 24, 8, true);
    const position = cone.attributes.position;

    // Bend the tip back
    for (let i = 0; i < position.count; i++) {
        const y = Math.max(0, position.getY(i) + r * 1.5);

        position.setZ(i, position.getZ(i) - (y / (r * 3)) ** 2.5 * r * 1.2);
    }

    cone.computeVertexNormals();

    return assemble([
        [at(cone, 0, r * 1.75, 0), "cloth"],
        [at(new THREE.CylinderGeometry(r * 1.9, r * 1.9, r * 0.03, 32), 0, r * 0.3 - 0.02, 0), "cloth"],
        [at(new THREE.CylinderGeometry(r * 0.97, r * 0.97, r * 0.16, 24, 1, true), 0, r * 0.36, 0), "brass"],
    ], "hat");
}

// A ruler's crown: a band of gold round the brow, five points rising from it, a ruby in the front
function crown(radius) {
    const r = radius * 1.04;
    const parts = [[at(new THREE.CylinderGeometry(r * 0.92, r * 0.9, r * 0.22, 32, 1, true), 0, r * 0.36, 0), "gold"]];

    for (let k = 0; k < 5; k++) {
        const angle = (k / 5) * Math.PI * 2;
        const [x, z] = [Math.sin(angle) * r * 0.9, Math.cos(angle) * r * 0.9];

        parts.push([at(new THREE.ConeGeometry(r * 0.1, r * 0.3, 8), x, r * 0.6, z), "gold"]);
        parts.push([at(new THREE.SphereGeometry(r * 0.045, 8, 6), x * 1.02, r * 0.76, z * 1.02), "gold"]);
    }

    parts.push([at(new THREE.SphereGeometry(r * 0.07, 10, 8), 0, r * 0.36, r * 0.93), "ruby"]);

    return assemble(parts, "crown");
}

// A tube along a curve through `points` ([x, y, z]), `from` thick at its start tapering to `to`
// (radii), closed at its tip with a round end
function taperedTube(points, from, to, { segments = 18, sides = 10 } = {}) {
    const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
    const { normals, binormals } = curve.computeFrenetFrames(segments, false);
    const positions = [];
    const indices = [];

    for (let k = 0; k <= segments; k++) {
        const t = k / segments;
        const centre = curve.getPointAt(t);
        const radius = from + (to - from) * t;

        for (let j = 0; j <= sides; j++) {
            const angle = (j / sides) * Math.PI * 2;
            const out = normals[k].clone().multiplyScalar(Math.cos(angle)).add(binormals[k].clone().multiplyScalar(Math.sin(angle)));

            positions.push(centre.x + out.x * radius, centre.y + out.y * radius, centre.z + out.z * radius);
        }
    }

    for (let k = 0; k < segments; k++) {
        for (let j = 0; j < sides; j++) {
            const [a, b] = [k * (sides + 1) + j, (k + 1) * (sides + 1) + j];

            indices.push(a, b, a + 1, b, b + 1, a + 1);
        }
    }

    const tube = new THREE.BufferGeometry();

    tube.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    tube.setIndex(indices);
    tube.computeVertexNormals();

    const tip = curve.getPointAt(1);
    const end = new THREE.SphereGeometry(to, sides, 6).translate(tip.x, tip.y, tip.z);

    return [tube, end];
}

// A cat's ear, on top of the head (`side`: 1 the character's left): a flattened, pointed cone
// in the fur's colour, leaning out, its inside pink and facing forward
function catEar(scale, side) {
    const s = scale;
    const outer = new THREE.ConeGeometry(0.036 * s, 0.085 * s, 6, 1).scale(1, 1, 0.42).translate(0, 0.035 * s, 0);
    const inner = new THREE.ConeGeometry(0.024 * s, 0.062 * s, 6, 1).scale(1, 1, 0.2).translate(0, 0.03 * s, 0.009 * s);
    const lean = [-0.12, 0, -side * 0.38];

    return assemble([
        [at(outer, 0, 0, 0, ...lean), "skin"],
        [at(inner, 0, 0, 0, ...lean), "earInner"],
    ], "ear");
}

// A cat's tail, from the base of the spine: down behind the legs, curling up at its end
function catTail(scale) {
    const s = scale;
    // (Out behind in a loose S, clear of the heels as they swing up behind in a run)
    const points = [[0, 0, 0], [0, -0.04, -0.12], [0, -0.14, -0.27], [0, -0.26, -0.41], [0.02, -0.33, -0.55], [0.04, -0.3, -0.69], [0.05, -0.2, -0.79]].map(([x, y, z]) => [x * s, y * s, z * s]);

    return assemble(taperedTube(points, 0.034 * s, 0.022 * s).map((geometry) => [geometry, "skin"]), "tail");
}

// A lizard's tail: thick at its root, held out behind and down to a point near the ground (clear
// of the heels as they swing up behind in a run)
function lizardTail(scale) {
    const s = scale;
    const points = [[0, 0, 0], [0, -0.04, -0.16], [0, -0.2, -0.38], [0, -0.4, -0.63], [0, -0.56, -0.9], [0, -0.64, -1.17]].map(([x, y, z]) => [x * s, y * s, z * s]);

    return assemble(taperedTube(points, 0.085 * s, 0.012 * s, { segments: 22 }).map((geometry) => [geometry, "skin"]), "tail");
}

function backpack() {
    return assemble([
        [at(new THREE.BoxGeometry(0.26, 0.36, 0.14), 0, 0, -0.07), "canvas"],
        [at(new THREE.BoxGeometry(0.265, 0.12, 0.15), 0, 0.14, -0.07), "leather"],
        [at(new THREE.BoxGeometry(0.2, 0.14, 0.05), 0, -0.06, -0.16), "canvas"],
        [at(new THREE.CylinderGeometry(0.06, 0.06, 0.34, 12), 0, 0.24, -0.07, 0, 0, Math.PI / 2), "cloth"],
        [at(new THREE.BoxGeometry(0.03, 0.4, 0.004), -0.07, 0.02, -0.001), "darkLeather"],
        [at(new THREE.BoxGeometry(0.03, 0.4, 0.004), 0.07, 0.02, -0.001), "darkLeather"],
    ], "backpack");
}

function quiver() {
    const parts = [[at(new THREE.CylinderGeometry(0.045, 0.04, 0.5, 12, 1, true), 0, 0, 0), "leather"], [at(new THREE.CylinderGeometry(0.04, 0.04, 0.01, 12), 0, -0.25, 0), "darkLeather"]];

    for (let k = 0; k < 7; k++) {
        const angle = (k / 7) * Math.PI * 2;
        const x = Math.cos(angle) * 0.022;
        const z = Math.sin(angle) * 0.022;

        parts.push([at(new THREE.CylinderGeometry(0.003, 0.003, 0.64, 4), x, 0.08, z), "wood"]);
        parts.push([at(new THREE.PlaneGeometry(0.02, 0.07), x, 0.36, z, 0, angle, 0), "feather"]);
    }

    return assemble(parts, "quiver");
}

// A smith's hammer, held by its short ash handle: a square iron head across the top of it, its
// flat face forward (+z) and its peen, wedge-shaped, behind
function smithHammer() {
    return assemble([
        [at(new THREE.CylinderGeometry(0.013, 0.015, 0.34, 8), 0, 0.08, 0), "wood"],
        [at(new THREE.BoxGeometry(0.042, 0.042, 0.075), 0, 0.26, 0.03), "iron"],
        [at(new THREE.CylinderGeometry(0.026, 0.026, 0.02, 10), 0, 0.26, 0.075, Math.PI / 2, 0, 0), "darkSteel"],
        [at(new THREE.BoxGeometry(0.036, 0.02, 0.05), 0, 0.26, -0.03), "iron"],
    ], "smithHammer");
}

// A smith's tongs, held by their handles: two long iron reins meeting at a rivet, their jaws
// forward (+y) holding a bar of iron glowing from the forge
function tongs() {
    const parts = [];

    for (const side of [-1, 1]) {
        parts.push([at(new THREE.BoxGeometry(0.008, 0.36, 0.008), side * 0.009, 0.1, 0, 0, 0, side * 0.025), "darkSteel"]);
        parts.push([at(new THREE.BoxGeometry(0.012, 0.09, 0.01), side * 0.008, 0.32, 0, 0, 0, -side * 0.12), "darkSteel"]);
    }

    parts.push([at(new THREE.CylinderGeometry(0.009, 0.009, 0.03, 8), 0, 0.27, 0, 0, 0, Math.PI / 2), "iron"]);
    parts.push([at(new THREE.BoxGeometry(0.018, 0.2, 0.012), 0, 0.43, 0), "hotIron"]);

    return assemble(parts, "tongs");
}

// A tankard, held by its handle: the handle along the grip, the pewter body on the palm's side of
// it, a head of foam on top
function tankard() {
    const body = 0.065;
    const parts = [
        [at(new THREE.CylinderGeometry(0.041, 0.045, 0.13, 14), body, 0.01, 0), "pewter"],
        [at(new THREE.CylinderGeometry(0.046, 0.046, 0.01, 14), body, -0.052, 0), "pewter"],
        [at(new THREE.CylinderGeometry(0.038, 0.038, 0.012, 14), body, 0.078, 0), "foam"],
        [at(new THREE.SphereGeometry(0.026, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), body - 0.01, 0.082, 0.008), "foam"],
        [at(new THREE.TorusGeometry(0.034, 0.007, 6, 12, Math.PI), 0.024, 0.01, 0, 0, 0, Math.PI / 2), "pewter"],
    ];

    return assemble(parts, "tankard");
}

function tusks(scale) {
    const parts = [];

    for (const side of [-1, 1]) {
        const tusk = new THREE.ConeGeometry(0.0085 * scale, 0.042 * scale, 10, 5);
        const position = tusk.attributes.position;

        // Curving back towards the face as they rise
        for (let i = 0; i < position.count; i++) {
            const y = position.getY(i) + 0.021 * scale;

            position.setZ(i, position.getZ(i) - y * y * 9);
        }

        tusk.computeVertexNormals();
        parts.push([at(tusk, side * 0.021 * scale, 0.018 * scale, 0, 0.35, 0, side * 0.22), "bone"]);
    }

    return assemble(parts, "tusks");
}


// --- Each people's own helm and shield, in their colours (characters/liveries.js) ---

const metalOf = (livery) => `metal:${livery.metal}`;
const clothOf = (colour) => `cloth:${colour}`;
const paintOf = (colour) => `paint:${colour}`;

// A flat shape from points ([x, y] each), for a polygon
function polygon(points) {
    const shape = new THREE.Shape();

    shape.moveTo(...points[0]);
    points.slice(1).forEach((point) => shape.lineTo(...point));

    return shape;
}

// A thin slab of a shape (`depth` thick, across z from 0), for an emblem on a face
const slab = (shape, depth = 0.004) => new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 10 });

// A thin bar from one point to another (in x and y), `width` wide, `depth` thick
function bar([x0, y0], [x1, y1], width, depth = 0.004) {
    const length = Math.hypot(x1 - x0, y1 - y0);

    return at(new THREE.BoxGeometry(width, length, depth), (x0 + x1) / 2, (y0 + y1) / 2, depth / 2, 0, 0, -Math.atan2(x1 - x0, y1 - y0));
}

/**
 * A people's emblem as flat geometry, `size` across (metres), in x and y about the origin, a
 * little thickness along z from 0: the crown, the leaf, the spider, the sun, the serpent, the claws.
 */
function emblemGeometry(emblem, size) {
    const s = size / 2;
    const w = s * 0.14;
    const parts = [];

    switch (emblem) {
        case "crown":
            parts.push(slab(polygon([[-0.85, -0.55], [0.85, -0.55], [0.85, 0.35], [0.45, -0.05], [0, 0.6], [-0.45, -0.05], [-0.85, 0.35]].map(([x, y]) => [x * s, y * s]))));
            break;
        case "leaf": {
            const leaf = new THREE.Shape();

            leaf.moveTo(0, -s);
            leaf.bezierCurveTo(0.75 * s, -0.4 * s, 0.75 * s, 0.4 * s, 0, s);
            leaf.bezierCurveTo(-0.75 * s, 0.4 * s, -0.75 * s, -0.4 * s, 0, -s);
            parts.push(slab(leaf));
            break;
        }
        case "spider": {
            const body = new THREE.Shape();
            const abdomen = new THREE.Shape();

            body.absarc(0, 0.28 * s, 0.24 * s, 0, Math.PI * 2);
            abdomen.absellipse(0, -0.22 * s, 0.3 * s, 0.4 * s, 0, Math.PI * 2);
            parts.push(slab(body), slab(abdomen));

            for (const side of [-1, 1]) {
                for (const [from, knee, foot] of [[[0.15, 0.35], [0.7, 0.75], [0.95, 0.3]], [[0.2, 0.2], [0.8, 0.3], [0.95, -0.1]], [[0.2, 0.05], [0.75, -0.2], [0.85, -0.6]], [[0.15, -0.05], [0.5, -0.55], [0.5, -0.95]]]) {
                    const [a, b, c] = [from, knee, foot].map(([x, y]) => [side * x * s, y * s]);

                    parts.push(bar(a, b, w), bar(b, c, w));
                }
            }

            break;
        }
        case "sun": {
            const points = [];

            for (let k = 0; k < 24; k++) {
                const angle = (k / 24) * Math.PI * 2;
                const r = (k % 2 ? 0.55 : 1) * s;

                points.push([Math.sin(angle) * r, Math.cos(angle) * r]);
            }

            parts.push(slab(polygon(points)));
            break;
        }
        case "serpent": {
            const curve = new THREE.CatmullRomCurve3([[-0.2, 0.85], [0.45, 0.55], [0, 0], [-0.45, -0.5], [0.2, -0.9]].map(([x, y]) => new THREE.Vector3(x * s, y * s, 0)));
            const tube = new THREE.TubeGeometry(curve, 24, w * 0.9, 6, false).scale(1, 1, 0.25).translate(0, 0, w * 0.25);
            const head = new THREE.Shape();

            head.absellipse(-0.25 * s, 0.9 * s, 0.2 * s, 0.14 * s, 0, Math.PI * 2);
            parts.push(tube, slab(head));
            break;
        }
        case "claws":
            parts.push(bar([-0.6 * s, 0.8 * s], [-0.3 * s, -0.8 * s], w * 1.4), bar([-0.1 * s, 0.9 * s], [0.2 * s, -0.7 * s], w * 1.4), bar([0.4 * s, 0.8 * s], [0.65 * s, -0.6 * s], w * 1.4));
            break;
        default:
            break;
    }

    return mergeGeometries(parts.map((geometry) => (geometry.index ? geometry.toNonIndexed() : geometry)).map((geometry) => {
        geometry.deleteAttribute("uv");

        return geometry;
    }));
}

/**
 * A people's helm (characters/liveries.js), fitting a head of `radius`, its origin at the head's
 * middle. `open`: on a cat's head, its ears through it (a brow band and a crest over the top from
 * front to back, not a dome).
 */
// How tall each people's helm's dome is (the elves' tallest, the lizard folk's lowest)
const HELM_TALL = Object.freeze({ elf: 1.18, darkElf: 1.12, lizard: 0.9 });

function peopleHelm(people, radius, open = false) {
    const livery = LIVERIES[people] ?? LIVERIES.human;
    const r = radius * 1.08;
    const metal = metalOf(livery);
    const parts = [];
    const opened = open || people === "cat";

    if (opened) {
        // A brow band, a ridge from the brow to the nape, cheek guards and a nasal
        const band = new THREE.CylinderGeometry(r * 0.98, r * 1.0, r * 0.26, 28, 1, true);

        band.scale(0.88, 1, 1.03);
        parts.push([at(band, 0, -r * 0.02, 0), metal]);
        parts.push([at(new THREE.TorusGeometry(r * 0.96, r * 0.07, 6, 24, Math.PI), 0, r * 0.08, 0, 0, Math.PI / 2, 0), metal]);
        parts.push([at(new THREE.BoxGeometry(r * 0.12, r * 0.55, r * 0.05), 0, -r * 0.25, r * 1.06, -0.12, 0, 0), metal]);

        for (const side of [-1, 1]) {
            parts.push([at(arcPlate(r * 0.95, r * 0.05, r * 0.5, side * 0.9, side * 1.9), 0, -r * 0.35, 0), metal]);
        }

        // (A crest of horsehair along the ridge, in their trim)
        const [tube, end] = taperedTube([[0, r * 1.05, r * 0.45], [0, r * 1.18, 0], [0, r * 1.05, -r * 0.5], [0, r * 0.75, -r * 0.95]], r * 0.1, r * 0.05, { segments: 14, sides: 6 });

        parts.push([tube.scale(0.45, 1, 1), clothOf(people === "cat" ? livery.trim : livery.main)], [end, clothOf(people === "cat" ? livery.trim : livery.main)]);

        return assemble(parts, "helmet");
    }

    // A dome, banded in their colour
    const tall = HELM_TALL[people] ?? 1;
    const dome = new THREE.SphereGeometry(r, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.55);

    dome.scale(0.86, 0.98 * tall, 1.02);
    parts.push([dome, metal]);

    const band = new THREE.CylinderGeometry(r, r, r * 0.18, 32, 1, true);

    band.scale(0.87, 1, 1.03);
    parts.push([at(band, 0, -r * 0.02, 0), people === "human" ? metalOf({ metal: livery.trim }) : clothOf(livery.main)]);

    switch (people) {
        case "human": {
            // A nasal, and a plume sweeping back
            parts.push([at(new THREE.BoxGeometry(r * 0.12, r * 0.55, r * 0.05), 0, -r * 0.2, r * 1.08, -0.12, 0, 0), metal]);

            const [tube, end] = taperedTube([[0, r * 0.9, 0.05 * r], [0, r * 1.3, -r * 0.15], [0, r * 1.35, -r * 0.6], [0, r * 1.05, -r * 1.05]], r * 0.14, r * 0.05, { segments: 14, sides: 8 });

            parts.push([tube, clothOf(livery.main)], [end, clothOf(livery.main)]);
            break;
        }
        case "elf": {
            // A leaf of silver standing along the crown, and cheek guards
            const leaf = new THREE.Shape();

            leaf.moveTo(0, 0);
            leaf.bezierCurveTo(r * 0.5, r * 0.2, r * 0.9, r * 0.55, r * 1.25, r * 0.75);
            leaf.bezierCurveTo(r * 0.8, r * 0.3, r * 0.4, r * 0.05, 0, 0);

            const crest = new THREE.ExtrudeGeometry(leaf, { depth: r * 0.04, bevelEnabled: false, curveSegments: 10 });

            parts.push([at(crest, -r * 0.02, r * 0.95, r * 0.55, 0, -Math.PI / 2, 0), metal]);

            for (const side of [-1, 1]) {
                parts.push([at(arcPlate(r * 0.94, r * 0.04, r * 0.55, side * 0.95, side * 1.8), 0, -r * 0.35, 0), metal]);
            }

            break;
        }
        case "darkElf": {
            // A crest of spikes along the top, two more swept back from the sides, and cheek guards
            for (let k = 0; k < 5; k++) {
                const angle = -0.9 + k * 0.45;

                parts.push([at(new THREE.ConeGeometry(r * 0.07, r * (0.45 - Math.abs(k - 2) * 0.08), 6), 0, Math.cos(angle) * r * 1.02 * tall, Math.sin(angle) * r * 1.02, angle, 0, 0), metal]);
            }

            for (const side of [-1, 1]) {
                parts.push([at(new THREE.ConeGeometry(r * 0.08, r * 0.7, 6), side * r * 0.82, r * 0.2, -r * 0.35, -1.1, 0, -side * 0.6), metal]);
                parts.push([at(arcPlate(r * 0.94, r * 0.04, r * 0.6, side * 0.9, side * 1.8), 0, -r * 0.38, 0), metal]);
            }

            break;
        }
        case "lizard": {
            // A fan of feathers from the back of the crown, crimson and turquoise
            for (let k = 0; k < 7; k++) {
                const angle = -0.9 + (k * 1.8) / 6;

                parts.push([at(new THREE.BoxGeometry(r * 0.12, r * 0.95, r * 0.01), Math.sin(angle) * r * 0.45, r * 1.15, -r * 0.55, -0.5, 0, -angle * 0.7), clothOf(k % 2 ? livery.trim : livery.main)]);
            }

            parts.push([at(new THREE.SphereGeometry(r * 0.13, 12, 8), 0, r * 0.35, r * 0.98), paintOf(livery.trim)]);
            break;
        }
        case "orc": {
            // Horns of bone, curving out and up, and a spike on top
            for (const side of [-1, 1]) {
                const horn = new THREE.ConeGeometry(r * 0.22, r * 1.5, 12, 8);
                const position = horn.attributes.position;

                for (let i = 0; i < position.count; i++) {
                    const y = position.getY(i) + r * 0.75;

                    position.setX(i, position.getX(i) + side * (y * y) * 1.2);
                }

                horn.computeVertexNormals();
                parts.push([at(horn, side * r * 0.95, r * 0.55, 0, 0, 0, -side * 1.15), "bone"]);
            }

            parts.push([at(new THREE.ConeGeometry(r * 0.1, r * 0.55, 6), 0, r * 1.15, -r * 0.1, -0.2, 0, 0), metal]);
            break;
        }
        default:
            break;
    }

    return assemble(parts, "helmet");
}

/**
 * A people's shield, strapped to the forearm, facing +x (as the others): its face in their colour,
 * rimmed, their emblem on it.
 */
function peopleShield(people) {
    const livery = LIVERIES[people] ?? LIVERIES.human;
    const metal = metalOf(livery);
    const face = paintOf(livery.main);
    let outline;
    let emblemAt = [0, 0.02];
    let emblemSize = 0.3;
    let bend = 0.6;
    const parts = [];

    switch (people) {
        case "elf": {
            // Long, leaf-shaped
            outline = new THREE.Shape();
            outline.moveTo(0, 0.44);
            outline.bezierCurveTo(0.3, 0.2, 0.3, -0.25, 0, -0.5);
            outline.bezierCurveTo(-0.3, -0.25, -0.3, 0.2, 0, 0.44);
            emblemSize = 0.26;
            break;
        }
        case "cat": {
            // A tall oval of hide, a stick down its middle behind
            outline = new THREE.Shape();
            outline.absellipse(0, -0.02, 0.23, 0.44, 0, Math.PI * 2);
            parts.push([at(new THREE.CylinderGeometry(0.012, 0.012, 1.02, 6), 0, -0.02, -0.01), "wood"]);
            emblemSize = 0.3;
            break;
        }
        case "lizard":
        case "orc": {
            // Round
            outline = new THREE.Shape();
            outline.absarc(0, 0, people === "orc" ? 0.32 : 0.3, 0, Math.PI * 2);
            emblemSize = 0.32;
            bend = 0.35;
            break;
        }
        default: {
            // A kite, the humans'; the dark elves' longer, sharper
            const long = people === "darkElf" ? 1.15 : 1;

            outline = new THREE.Shape();
            outline.moveTo(0, 0.36);
            outline.quadraticCurveTo(0.27, 0.34, 0.26, 0.12);
            outline.quadraticCurveTo(0.22, -0.25 * long, 0, -0.52 * long);
            outline.quadraticCurveTo(-0.22, -0.25 * long, -0.26, 0.12);
            outline.quadraticCurveTo(-0.27, 0.34, 0, 0.36);
            emblemAt = [0, 0.05];
        }
    }

    const depth = 0.02;
    const body = new THREE.ExtrudeGeometry(outline, { depth, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.01, bevelSegments: 1, curveSegments: 20 });
    const rim = new THREE.ExtrudeGeometry(outline, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.022, bevelSegments: 1, curveSegments: 20 }).translate(0, 0, -0.006);
    const emblem = emblemGeometry(livery.emblem, emblemSize).translate(emblemAt[0], emblemAt[1], depth + 0.007);

    parts.push([body, face], [rim, people === "cat" ? "darkLeather" : metal], [emblem, people === "orc" ? paintOf(livery.trim) : metalOf({ metal: livery.trim })]);

    // (A boss and spikes: the orcs'; spikes round the dark elves')
    if (people === "orc") {
        parts.push([at(new THREE.ConeGeometry(0.05, 0.12, 8), 0, 0, depth + 0.06, Math.PI / 2, 0, 0), metal]);
    }

    if (people === "darkElf") {
        for (const [x, y] of [[0.27, 0.2], [-0.27, 0.2], [0.2, -0.2], [-0.2, -0.2]]) {
            parts.push([at(new THREE.ConeGeometry(0.018, 0.09, 6), x * 1.08, y, 0.01, 0, 0, -Math.atan2(x, y) + Math.PI), metal]);
        }
    }

    // (A fringe of feathers under the lizard folk's)
    if (people === "lizard") {
        for (let k = 0; k < 9; k++) {
            const angle = Math.PI + (k - 4) * 0.16;

            parts.push([at(new THREE.BoxGeometry(0.035, 0.14, 0.004), Math.sin(angle) * 0.33, Math.cos(angle) * 0.33 - 0.05, 0.005, 0, 0, -angle + Math.PI), clothOf(k % 2 ? livery.trim : livery.main)]);
        }
    }

    // Curved round the arm a little, then turned to face out (+x)
    for (const [geometry] of parts) {
        const position = geometry.attributes.position;

        for (let i = 0; i < position.count; i++) {
            const x = position.getX(i);

            position.setZ(i, position.getZ(i) - x * x * bend);
        }

        geometry.computeVertexNormals();
        geometry.rotateY(Math.PI / 2);
    }

    // (Its grip, behind it, where the forearm's strapped: the kite's boss is on its face)
    return assemble(parts, "shield");
}

// A leather cap, close round the top of the head, a rim round its edge (on a cat's head, `open`:
// the rim, and a strap over the top between the ears)
function leatherCap(radius, open = false) {
    const r = radius * 1.05;
    const top = open ? new THREE.TorusGeometry(r * 0.93, r * 0.07, 6, 20, Math.PI).rotateY(Math.PI / 2).scale(1, 1.02, 1) : new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(0.88, 0.95, 1.03);

    return assemble([
        [top, "leather"],
        [at(new THREE.CylinderGeometry(r * 0.99, r * 1.0, r * 0.14, 24, 1, true).scale(0.89, 1, 1.04), 0, -r * 0.02, 0), "darkLeather"],
    ], "helmet");
}

// --- What the townsfolk carry (core/townsfolk.js), and what they wear on their heads ---

// A wicker basket worn on the back (a pannier: on the back's socket, as a pack is, its straps over
// the shoulders), heaped with what's been bought: loaves, apples and greens
function pannier() {
    const parts = [
        [at(new THREE.CylinderGeometry(0.15, 0.12, 0.34, 14, 1, true), 0, 0.02, -0.17), "wicker"],
        [at(new THREE.CylinderGeometry(0.12, 0.12, 0.012, 14), 0, -0.15, -0.17), "wicker"],
        [at(new THREE.TorusGeometry(0.15, 0.012, 6, 16), 0, 0.19, -0.17, Math.PI / 2, 0, 0), "darkWood"],
        [at(new THREE.TorusGeometry(0.135, 0.01, 6, 16), 0, -0.06, -0.17, Math.PI / 2, 0, 0), "darkWood"],
        [at(new THREE.CapsuleGeometry(0.035, 0.09, 4, 8), -0.05, 0.2, -0.18, 0, 0, Math.PI / 2.4), "bread"],
        [at(new THREE.CapsuleGeometry(0.03, 0.07, 4, 8), 0.06, 0.2, -0.14, 0.3, 0, -Math.PI / 2.2), "bread"],
        [at(new THREE.SphereGeometry(0.032, 10, 8), 0.05, 0.205, -0.22), "apple"],
        [at(new THREE.SphereGeometry(0.03, 10, 8), -0.02, 0.2, -0.25), "apple"],
        [at(new THREE.SphereGeometry(0.05, 10, 6).scale(1, 0.6, 1), -0.07, 0.2, -0.24), "greens"],
        [at(new THREE.BoxGeometry(0.03, 0.34, 0.004), -0.07, 0, -0.006), "darkLeather"],
        [at(new THREE.BoxGeometry(0.03, 0.34, 0.004), 0.07, 0, -0.006), "darkLeather"],
    ];

    return assemble(parts, "pannier");
}

// A sack of grain or flour over the back, its mouth tied, hung from the shoulders by a cord
function sack() {
    const body = new THREE.SphereGeometry(0.15, 14, 10).scale(1.1, 1.45, 0.8);

    return assemble([
        [at(body, 0, 0, -0.135), "sacking"],
        [at(new THREE.CylinderGeometry(0.03, 0.06, 0.08, 10), 0, 0.23, -0.135), "sacking"],
        [at(new THREE.TorusGeometry(0.032, 0.008, 6, 12), 0, 0.22, -0.135, Math.PI / 2, 0, 0), "string"],
        [at(new THREE.BoxGeometry(0.025, 0.34, 0.004), -0.07, 0, -0.006), "string"],
        [at(new THREE.BoxGeometry(0.025, 0.34, 0.004), 0.07, 0, -0.006), "string"],
    ], "sack");
}

// A bundle of firewood on the back: a dozen sticks bound with two cords, lying across the back
function firewood() {
    const parts = [];

    for (let k = 0; k < 11; k++) {
        const [row, along] = [k % 4, Math.floor(k / 4)];

        parts.push([at(new THREE.CylinderGeometry(0.022 - (k % 3) * 0.003, 0.025, 0.62 - (k % 2) * 0.08, 6), (along - 1) * 0.012, row * 0.045 - 0.05, -0.06 - along * 0.045, 0, 0, Math.PI / 2 + (k % 3 - 1) * 0.05), "bark"]);
    }

    for (const x of [-0.17, 0.17]) {
        parts.push([at(new THREE.TorusGeometry(0.1, 0.008, 6, 12).scale(0.5, 1.2, 1), x, 0.02, -0.105, 0, Math.PI / 2, 0), "string"]);
    }

    parts.push([at(new THREE.BoxGeometry(0.025, 0.34, 0.004), -0.07, 0, -0.006), "string"]);
    parts.push([at(new THREE.BoxGeometry(0.025, 0.34, 0.004), 0.07, 0, -0.006), "string"]);

    return assemble(parts, "firewood");
}

// An earthenware jug of water or milk, held by its handle as a tankard is: the handle along the
// grip, the jug on the palm's side of it, its neck up
function jug() {
    const body = 0.07;

    return assemble([
        [at(new THREE.SphereGeometry(0.055, 14, 10).scale(1, 1.15, 1), body, -0.01, 0), "earthenware"],
        [at(new THREE.CylinderGeometry(0.028, 0.04, 0.07, 14, 1, true), body, 0.07, 0), "earthenware"],
        [at(new THREE.TorusGeometry(0.031, 0.006, 6, 14), body, 0.105, 0, Math.PI / 2, 0, 0), "earthenware"],
        [at(new THREE.TorusGeometry(0.04, 0.008, 6, 12, Math.PI), 0.03, 0.03, 0, 0, 0, Math.PI / 2), "earthenware"],
    ], "jug");
}

// A long-handled tool, held upright in one hand as a staff is (the grip at its middle): a hay
// fork's three iron tines at its top, or a broom's birch twigs bound at its foot
function pitchfork() {
    const parts = [[at(new THREE.CylinderGeometry(0.014, 0.016, 1.5, 8), 0, 0.02, 0), "wood"], [at(new THREE.BoxGeometry(0.16, 0.018, 0.018), 0, 0.78, 0), "iron"]];

    for (const x of [-0.07, 0, 0.07]) {
        parts.push([at(new THREE.ConeGeometry(0.008, 0.26, 6), x, 0.92, 0), "iron"]);
    }

    return assemble(parts, "pitchfork");
}

// A hoe, carried over the shoulder: its ash handle up from the fist and back over the shoulder,
// the iron blade at its far end, turned down behind
function hoe() {
    return assemble([
        [at(new THREE.CylinderGeometry(0.014, 0.016, 1.25, 8), 0, 0.46, 0), "wood"],
        [at(new THREE.CylinderGeometry(0.022, 0.018, 0.06, 8), 0, 1.07, 0), "iron"],
        [at(new THREE.BoxGeometry(0.15, 0.012, 0.13), 0, 1.09, -0.07), "iron"],
    ], "hoe");
}

// A basket carried by its handle at the side, each people's own (characters/dress.js): in its
// frame the fist's round the top of the handle, the basket hanging below it (+z, down as it's
// carried), front to back along y, a little out from the leg (-x). Upright things (a body, a
// band) are made along y and stood down into it (`hung`: their top up, centred `z` below the fist)
const hung = (geometry, z, x = BASKET_OUT) => at(geometry, x, 0, z, -Math.PI / 2, 0, 0);

// How far out from the leg a basket hangs (metres, -x: away from the body)
const BASKET_OUT = -0.04;

// An arched handle over a basket: from its rim at the front, up to the fist and down to its rim at
// the back (`reach`: half its span, as high), `thick` thick
const archOver = (reach, thick, segments = 14) => at(new THREE.TorusGeometry(reach, thick, 6, segments, Math.PI), BASKET_OUT, 0, reach, 0, -Math.PI / 2, Math.PI / 2);

// What's heaped in a basket: [geometry, material, x, y, z] laid on its top, `top` below the fist
const heaped = (top, things) => things.map(([geometry, material, x, y, z = 0]) => [at(geometry, BASKET_OUT + x, y, top + z), material]);

// The humans': a round wicker market basket, its arched handle of bent ash, loaves and apples in it
function basket() {
    const top = 0.13;

    return assemble([
        [hung(new THREE.CylinderGeometry(0.13, 0.105, 0.15, 16, 1, true), top + 0.075), "wicker"],
        [hung(new THREE.CylinderGeometry(0.105, 0.105, 0.012, 16), top + 0.145), "wicker"],
        [hung(new THREE.TorusGeometry(0.13, 0.009, 6, 18).rotateX(Math.PI / 2), top), "darkWood"],
        [archOver(top, 0.009), "wood"],
        ...heaped(top, [
            [new THREE.CapsuleGeometry(0.034, 0.09, 4, 8).rotateZ(Math.PI / 2), "bread", 0.02, -0.04, 0.005],
            [new THREE.CapsuleGeometry(0.03, 0.07, 4, 8).rotateZ(Math.PI / 2.4), "bread", -0.03, 0.05, 0.01],
            [new THREE.SphereGeometry(0.032, 10, 8), "apple", 0.05, 0.04],
            [new THREE.SphereGeometry(0.03, 10, 8), "apple", -0.05, -0.05, 0.005],
        ]),
    ], "basket");
}

// The elves': shallow and long as a leaf, woven of pale peeled willow gone silver, its handle tall
// and slender, a silver leaf where it's held; white and violet flowers in it on their leaves
function elfBasket() {
    const top = 0.17;
    const body = new THREE.CylinderGeometry(0.11, 0.085, 0.07, 18, 1, true).scale(0.62, 1, 1.45);

    return assemble([
        [hung(body, top + 0.035), "paleWicker"],
        [hung(new THREE.CylinderGeometry(0.085, 0.085, 0.01, 18).scale(0.62, 1, 1.45), top + 0.07), "paleWicker"],
        [hung(new THREE.TorusGeometry(0.11, 0.007, 6, 24).rotateX(Math.PI / 2).scale(0.62, 1, 1.45), top), "silver"],
        [archOver(top, 0.006, 18), "paleWood"],
        [at(new THREE.SphereGeometry(0.02, 10, 6).scale(0.35, 1.6, 0.9), BASKET_OUT, 0.03, 0.01), "silver"],
        ...heaped(top, [
            [new THREE.SphereGeometry(0.06, 10, 6).scale(0.8, 1.6, 0.35), "greens", 0, 0, 0.01],
            ...[[0.02, -0.06], [-0.02, -0.02], [0.015, 0.03], [-0.015, 0.07], [0.025, 0.1]].map(([x, y], k) => [new THREE.SphereGeometry(0.018, 8, 6), k % 2 ? "violetBloom" : "whiteBloom", x, y, -0.008]),
        ]),
    ], "elfBasket");
}

// The dark elves': six-sided, close-woven of black reed, its rim and its pointed handle silver (an
// arch as their spires are), a violet stone at its point; pale mushrooms in it, glowing faintly
function darkElfBasket() {
    const top = 0.15;
    const rim = 0.115;
    // (The handle: two bars up from the rim, front and back, meeting over it in a point)
    const [bar, lean] = [Math.hypot(rim, top), Math.atan2(top, rim)];

    return assemble([
        [hung(new THREE.CylinderGeometry(0.12, 0.095, 0.13, 6, 1, true), top + 0.065), "blackReed"],
        [hung(new THREE.CylinderGeometry(0.095, 0.095, 0.012, 6), top + 0.13), "blackReed"],
        [hung(new THREE.TorusGeometry(rim, 0.007, 4, 6).rotateX(Math.PI / 2), top), "silver"],
        [at(new THREE.CylinderGeometry(0.006, 0.006, bar, 6), BASKET_OUT, rim / 2, top / 2, lean, 0, 0), "silver"],
        [at(new THREE.CylinderGeometry(0.006, 0.006, bar, 6), BASKET_OUT, -rim / 2, top / 2, -lean, 0, 0), "silver"],
        [at(new THREE.OctahedronGeometry(0.016), BASKET_OUT, 0, -0.012), "amethyst"],
        ...heaped(top, [
            ...[[0.03, -0.04], [-0.03, 0.01], [0.02, 0.05], [-0.02, -0.06]].flatMap(([x, y]) => [
                [new THREE.CylinderGeometry(0.008, 0.01, 0.04, 6).rotateX(Math.PI / 2), "paleStalk", x, y, -0.005],
                [new THREE.SphereGeometry(0.026, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-Math.PI / 2), "glowCap", x, y, -0.024],
            ]),
        ]),
    ], "darkElfBasket");
}

// The cat folk's: wide and flaring as a bowl, woven in bands of saffron, indigo, red and the
// grass's own colour, its handle bound in leather; ripe fruit heaped in it
function catBasket() {
    const top = 0.12;
    // (As wide at its rim as the humans' at the most, to keep off the thigh as the weight shifts)
    const bands = [["saffronWeave", 0.13, 0.118], ["indigoWeave", 0.118, 0.106], ["redWeave", 0.106, 0.094], ["straw", 0.094, 0.08]];
    const parts = bands.map(([material, from, to], k) => [hung(new THREE.CylinderGeometry(from, to, 0.03, 18, 1, true), top + 0.015 + k * 0.03), material]);

    return assemble([
        ...parts,
        [hung(new THREE.CylinderGeometry(0.08, 0.08, 0.01, 18), top + 0.12), "straw"],
        [hung(new THREE.TorusGeometry(0.13, 0.01, 6, 20).rotateX(Math.PI / 2), top), "indigoWeave"],
        [archOver(top, 0.011), "darkLeather"],
        ...heaped(top, [
            [new THREE.SphereGeometry(0.04, 10, 8).scale(1, 1.25, 1), "mango", 0.03, 0.05],
            [new THREE.SphereGeometry(0.038, 10, 8).scale(1, 1.25, 1), "mango", -0.04, -0.03],
            [new THREE.SphereGeometry(0.034, 10, 8), "apple", 0.04, -0.06, 0.005],
            [new THREE.SphereGeometry(0.03, 10, 8), "lemon", -0.03, 0.07, 0.005],
        ]),
    ], "catBasket");
}

// The lizard folk's: tall and round, of reed, with stepped bands of turquoise and crimson round it,
// carried by a loop of rope; ears of maize and cacao pods standing up in it
function lizardBasket() {
    const top = 0.14;
    const parts = [
        [hung(new THREE.CylinderGeometry(0.1, 0.09, 0.22, 14, 1, true), top + 0.11), "reed"],
        [hung(new THREE.CylinderGeometry(0.09, 0.09, 0.012, 14), top + 0.22), "reed"],
    ];

    // (Its bands: turquoise, crimson, turquoise, stepped as their stone's frets are)
    for (const [k, material] of ["turquoiseWeave", "crimsonWeave", "turquoiseWeave"].entries()) {
        parts.push([hung(new THREE.CylinderGeometry(0.1 - k * 0.003 + 0.003, 0.1 - k * 0.003 + 0.002, 0.022, 14, 1, true), top + 0.035 + k * 0.05), material]);
    }

    return assemble([
        ...parts,
        [archOver(top, 0.007, 10), "string"],
        ...heaped(top, [
            ...[[0.03, -0.03], [-0.03, 0.02], [0.0, 0.05]].map(([x, y]) => [new THREE.CapsuleGeometry(0.018, 0.09, 4, 8).rotateX(Math.PI / 2), "maize", x, y, -0.03]),
            [new THREE.SphereGeometry(0.03, 10, 8).scale(1, 1, 1.7), "cacao", -0.02, -0.05, -0.02],
            [new THREE.SphereGeometry(0.06, 8, 6).scale(1, 1, 0.5), "greens", 0, 0, 0.02],
        ]),
    ], "lizardBasket");
}

// The orcs': squat and rough, of sticks lashed with hide, an iron band round its rim, its handle a
// great bone; a haunch and roots in it
function orcBasket() {
    const top = 0.13;
    const parts = [
        [hung(new THREE.CylinderGeometry(0.135, 0.12, 0.13, 9, 1, true), top + 0.065), "bark"],
        [hung(new THREE.CylinderGeometry(0.12, 0.12, 0.014, 9), top + 0.13), "bark"],
        [hung(new THREE.TorusGeometry(0.137, 0.01, 5, 9).rotateX(Math.PI / 2), top + 0.005), "iron"],
        [hung(new THREE.TorusGeometry(0.128, 0.006, 4, 9).rotateX(Math.PI / 2), top + 0.09), "hide"],
        [archOver(top, 0.013, 8), "bone"],
        [at(new THREE.SphereGeometry(0.022, 8, 6), BASKET_OUT, 0.128, top), "bone"],
        [at(new THREE.SphereGeometry(0.022, 8, 6), BASKET_OUT, -0.128, top), "bone"],
    ];

    return assemble([
        ...parts,
        ...heaped(top, [
            [new THREE.SphereGeometry(0.06, 10, 8).scale(1, 1.3, 0.8), "meat", 0.02, 0.01],
            [new THREE.CylinderGeometry(0.01, 0.012, 0.08, 6).rotateX(Math.PI / 2.6), "bone", 0.02, -0.08, -0.02],
            [new THREE.CapsuleGeometry(0.018, 0.05, 4, 6).rotateZ(1.2), "root", -0.05, 0.04, 0.005],
            [new THREE.CapsuleGeometry(0.016, 0.04, 4, 6).rotateZ(-0.5), "root", -0.04, -0.04, 0.008],
        ]),
    ], "orcBasket");
}

function walkingStaff() {
    return assemble([
        [at(new THREE.CylinderGeometry(0.016, 0.019, 1.62, 8), 0, -0.05, 0), "wood"],
        [at(new THREE.SphereGeometry(0.03, 10, 8), 0, 0.77, 0), "darkWood"],
    ], "walkingStaff");
}

function broom() {
    return assemble([
        [at(new THREE.CylinderGeometry(0.014, 0.015, 1.3, 8), 0, -0.05, 0), "wood"],
        [at(new THREE.ConeGeometry(0.09, 0.42, 12, 1, true), 0, -0.82, 0), "straw"],
        [at(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 10), 0, -0.6, 0), "string"],
    ], "broom");
}

// A ledger, open on the palm as a grimoire is (its frame: the spine along the fingers, the pages
// facing away from the palm), plain calf and parchment
function ledger() {
    const half = (side) => [
        [at(new THREE.BoxGeometry(0.007, 0.11, 0.18), 0.004, side * 0.058, 0.05, side * 0.12, 0, 0), "leather"],
        [at(new THREE.BoxGeometry(0.012, 0.1, 0.17), -0.006, side * 0.056, 0.05, side * 0.12, 0, 0), "parchment"],
    ];

    return assemble([...half(1), ...half(-1), [at(new THREE.CylinderGeometry(0.008, 0.008, 0.18, 8), 0.004, 0, 0.05, Math.PI / 2, 0, 0), "leather"]], "ledger");
}

// A broad-brimmed straw hat, against the sun in the fields: its crown tapering up well clear of
// the top of the head, a band round its foot
function strawHat(radius) {
    const r = radius * 1.08;

    return assemble([
        [at(new THREE.CylinderGeometry(r * 0.8, r * 1.0, r * 1.3, 24, 1), 0, r * 0.95, 0), "straw"],
        [at(new THREE.CylinderGeometry(r * 2.15, r * 2.2, r * 0.035, 32), 0, r * 0.3 - 0.01, 0), "straw"],
        [at(new THREE.CylinderGeometry(r * 1.01, r * 1.01, r * 0.13, 24, 1, true), 0, r * 0.4, 0), "darkLeather"],
    ], "hat");
}

// A linen coif: a close cap over the hair, its band round the brow
function coif(radius) {
    const r = radius * 1.04;

    return assemble([
        [new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(0.9, 0.95, 1.04), "linen"],
        [at(new THREE.CylinderGeometry(r * 0.98, r * 0.99, r * 0.12, 24, 1, true).scale(0.9, 1, 1.04), 0, -r * 0.1, 0), "linen"],
    ], "helmet");
}

// A wool hood: over the head and a little down the back of it, open at the face (the front, +z);
// the dark elves' of black
function hood(radius, material = "wool") {
    const r = radius * 1.1;
    // (Round the head but for the face: from a quarter round each side of the front)
    const cowl = new THREE.SphereGeometry(r, 24, 14, Math.PI * 0.75, Math.PI * 1.5, 0, Math.PI * 0.58).scale(0.9, 0.97, 1.05);

    return assemble([[cowl, material]], "helmet");
}

// A circlet round the brow: the elves' of silver, a leaf at its front with a green stone; the dark
// elves' of black steel, a violet stone at its front between two spikes
function circlet(radius, people) {
    const r = radius * 1.04;
    const metal = people === "elf" ? "silver" : "metal:#3c3844";
    const parts = [[at(new THREE.CylinderGeometry(r * 0.92, r * 0.92, r * 0.06, 32, 1, true), 0, r * 0.36, 0), metal]];

    if (people === "elf") {
        parts.push([at(new THREE.SphereGeometry(r * 0.12, 10, 6).scale(0.45, 1.2, 0.25), 0, r * 0.44, r * 0.92, 0, 0, 0), "silver"]);
        parts.push([at(new THREE.SphereGeometry(r * 0.035, 8, 6), 0, r * 0.36, r * 0.95), "emerald"]);
    } else {
        parts.push([at(new THREE.OctahedronGeometry(r * 0.06), 0, r * 0.37, r * 0.94), "amethyst"]);

        for (const side of [-1, 1]) {
            parts.push([at(new THREE.ConeGeometry(r * 0.025, r * 0.16, 6), side * r * 0.14, r * 0.45, r * 0.9, -0.15, 0, -side * 0.25), metal]);
        }
    }

    return assemble(parts, "circlet");
}

// How high round the head (a share of its radius above its middle) the lizard folk's band goes
const BAND_UP = 0.46;

// The lizard folk's band of turquoise cloth round the brow, a disc of jade at its front, a fan of
// feathers up from the back of the head, crimson, turquoise and green
function featherBand(radius) {
    const r = radius * 1.04;
    // (High round the head, above the brow ridge, clear of a short snout's)
    const band = r * BAND_UP;
    const parts = [
        [at(new THREE.CylinderGeometry(r * 0.93, r * 0.93, r * 0.1, 32, 1, true), 0, band, 0), clothOf("#2fb3a0")],
        [at(new THREE.CylinderGeometry(r * 0.09, r * 0.09, r * 0.02, 12), 0, band + r * 0.01, r * 0.94, Math.PI / 2, 0, 0), paintOf("#3f8f5f")],
    ];

    // (Each rooted in the band at the back of the head, rising up and back from it, clear of the
    // skull, fanned out)
    for (let k = 0; k < 5; k++) {
        const angle = -0.6 + (k * 1.2) / 4;
        const [rise, length] = [0.75, r * 0.8];
        const [x, y, z] = [Math.sin(angle) * r * 0.3, band + r * 0.02 + Math.cos(rise) * length * 0.5, -r * 0.95 - Math.sin(rise) * length * 0.5];

        parts.push([at(new THREE.BoxGeometry(r * 0.1, length, r * 0.01), x, y, z, -rise, 0, -angle * 0.6), clothOf(["#a8322a", "#2fb3a0", "#3f8f5f"][k % 3])]);
    }

    return assemble(parts, "featherBand");
}

// How much room head-wear leaves over the skull (metres): its lining, and the hair pressed under it
const LINING = 0.006;

/**
 * Head-wear fitted to the skull under it (`skull`: equipment.js skullOf): its back half drawn out
 * behind, its crown raised and, a band's, its front half drawn forward, as far as the skull needs
 * with a lining's room to spare; a dome's front, where the face shows, as it was made. `shell` is
 * the shape of its own: the half-axes of its dome (`across`, `up`, `back`: metres, from the head's
 * middle) and how far below the middle its rim comes (`rim`), or a band round the head (`band`:
 * [from, to] heights, and `back`: how far it reaches behind and before the middle).
 */
function fitted(group, skull, { across = null, up = null, back, rim = 0, band = null }) {
    // (The shell as it's fitted, kept with it: what's within it, the horns' and crests' roots, is out of sight)
    group.userData.shell = up ? { across, up, back, front: back, rim } : band && across ? { across, band, back, front: back } : null;

    if (!skull) {
        return group;
    }

    // How far its back must be drawn out for a crown raised so far (a band's back, and front, the
    // same all round): the most any height it covers needs, but where the dome's so near its
    // crown that the skull there is better cleared by raising it
    const drawn = (top, side) => {
        let most = 1;

        for (const [y, ...reach] of skull.at) {
            const inside = band ? y >= band[0] && y <= band[1] : y >= -rim && y <= top;
            const own = band || y <= 0 ? back : back * Math.sqrt(Math.max(0, 1 - (y / top) ** 2));

            if (inside && reach[side] > 0) {
                most = own > 0 ? Math.max(most, (reach[side] + LINING) / own) : Infinity;
            }
        }

        return most;
    };
    let [raise, draw] = [1, drawn(Infinity, 0)];

    if (up) {
        const least = Math.max(1, (skull.top + LINING) / up);

        [raise, draw] = [0, 0.05, 0.1, 0.15, 0.2, 0.3]
            .map((more) => [least * (1 + more), drawn(up * least * (1 + more), 0)])
            .reduce((best, each) => (each[0] + each[1] < best[0] + best[1] ? each : best));
    }

    const ahead = band ? drawn(Infinity, 1) : 1;

    if (group.userData.shell) {
        Object.assign(group.userData.shell, up ? { up: up * raise, back: back * draw } : { back: back * draw, front: back * ahead });
    }

    if (draw === 1 && raise === 1 && ahead === 1) {
        return group;
    }

    group.traverse((mesh) => {
        if (!mesh.isMesh) {
            return;
        }

        const { position, normal } = mesh.geometry.attributes;

        for (let i = 0; i < position.count; i++) {
            const [sy, sz] = [position.getY(i) > 0 ? raise : 1, position.getZ(i) < 0 ? draw : ahead];

            position.setXYZ(i, position.getX(i), position.getY(i) * sy, position.getZ(i) * sz);

            if (normal) {
                const [nx, ny, nz] = [normal.getX(i), normal.getY(i) / sy, normal.getZ(i) / sz];
                const length = Math.hypot(nx, ny, nz) || 1;

                normal.setXYZ(i, nx / length, ny / length, nz / length);
            }
        }

        position.needsUpdate = true;
        mesh.geometry.computeBoundingSphere();
    });

    return group;
}

// A helm's dome over a head of `radius` (helmet, peopleHelm: a dome 1.08 times its radius, scaled
// 0.98 up and 1.02 back, a band round it 1.03 back, the dome's rim a little below the middle), `tall`
// as a people's is
const helmShell = (radius, tall = 1) => ({ across: radius * 1.08 * 0.86, up: radius * 1.08 * 0.98 * tall, back: radius * 1.08 * 1.02, rim: radius * 0.17 });

// --- Head-wear fitted to the head it's on (headwear.js: the head measured all round, the lines
// rims follow round it, plates grown over it) ---

// How thick a helm's plates are (metres)
const PLATE = 0.0025;

// A shape built up +y from its foot (a spike, a feather), stood on `base`, pointing along `direction`
function standing(geometry, base, direction) {
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize()));

    return geometry.translate(base.x, base.y, base.z);
}

// A surface through rings of points (each round the head, the same number, the first lowest),
// facing out (`inward`: in)
function loft(rings, inward = false) {
    const count = rings[0].length;
    const indices = [];

    for (let j = 0; j < rings.length - 1; j++) {
        for (let i = 0; i < count; i++) {
            const [a, b, c, d] = [j * count + i, j * count + ((i + 1) % count), (j + 1) * count + ((i + 1) % count), (j + 1) * count + i];

            indices.push(...(inward ? [a, c, b, a, d, c] : [a, b, c, a, c, d]));
        }
    }

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute("position", new THREE.Float32BufferAttribute(rings.flatMap((ring) => ring.flatMap((p) => [p.x, p.y, p.z])), 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    return geometry;
}

// A nasal: a bar down from the brow (`top`) over the nose, leaning out as far as the nose needs
// to clear it (by half a lining: nothing's under it but the skin)
function nasal(head, top, length = 0.05) {
    let lean = 0;

    for (let k = 1; k <= 10; k++) {
        const y = top.y - (length * k) / 10;
        const face = head.point(0, head.upAt(0, y), LINING * 0.5);

        lean = Math.max(lean, Math.atan2(face.z - top.z, top.y - y));
    }

    return new THREE.BoxGeometry(0.011, length, 0.004).translate(0, -length / 2, 0.002).rotateX(-lean).translate(top.x, top.y, top.z);
}

// A line of points over the top of the head from front to back, down to `from` and `to` (radians
// up, at the front and the back), `out` metres off it
function overTheTop(head, from, to, out, count = 12) {
    return Array.from({ length: count + 1 }, (_, k) => {
        const along = from + ((Math.PI - to - from) * k) / count;

        return (along <= Math.PI / 2 ? head.point(0, along, out(0, along)) : head.point(Math.PI, Math.PI - along, out(Math.PI, Math.PI - along))).toArray();
    });
}

// An orc's horn of bone, from its root at the origin, curving out and up (`side`: 1 the left)
function orcHorn(r, side) {
    const horn = new THREE.ConeGeometry(r * 0.22, r * 1.5, 12, 8).translate(0, r * 0.75, 0);
    const position = horn.attributes.position;

    for (let i = 0; i < position.count; i++) {
        position.setX(i, position.getX(i) + side * position.getY(i) ** 2 * 1.2);
    }

    horn.computeVertexNormals();

    return horn.rotateZ(-side * 1.15);
}

/**
 * A helm fitted to the head (`fit.head`: headwear.js measureHead): a people's (`people`) or a
 * plain one (`style`: "nasal", "orc"). Its dome is grown over the head a lining's room off it, down
 * to a helm's rim (just above the brows, arched over the ears, down past the back of the skull)
 * and banded; its people's nasal, plume, leaf, spikes, feathers or horns stood on it; cheek guards
 * hung over the elves', dark elves' and cat folk's cheeks, clear of their eyes, and a dark elf's
 * flared over the nape. `open`: round a cat's ears, a band and a ridge from front to back, not a
 * dome.
 */
function fittedHelm(fit, { people = "human", style = null, open = false }) {
    const head = new HeadMap(fit.head);
    const livery = LIVERIES[people] ?? LIVERIES.human;
    const metal = style === "nasal" ? "steel" : style === "orc" ? "iron" : metalOf(livery);
    const line = rimLine(head, "helm");
    const rim = (around) => head.upAt(around, line(around));
    const above = (rise) => (around) => head.upAt(around, line(around) + rise);
    // (A lining's room off the head, more towards a tall crown: the elves'; half of it on the bare
    // forehead above the brows, where there's no hair under it)
    const tall = style ? 0 : Math.max(0, (HELM_TALL[people] ?? 1) - 1) * head.radius(0, Math.PI / 2);
    const brow = (around, up) => smoothstep(0.9, 0.3, Math.abs(around)) * (1 - smoothstep(rim(around), rim(around) + 0.35, up));
    const dome = (around, up) => LINING * (1 - 0.5 * brow(around, up)) + tall * Math.max(0, Math.sin(up)) ** 6;
    const on = (around, up, more = 0) => head.point(around, up, dome(around, up) + PLATE + more);
    const parts = [];

    if (!open) {
        parts.push([headPlate(head, { bottom: rim, top: () => Math.PI / 2, out: dome, steps: [48, 14] }), metal]);
    }

    // Its band round the rim (a cat's taller, the helm's metal)
    const banding = open ? metal : style === "nasal" ? "brass" : style === "orc" ? "darkSteel" : people === "human" ? metalOf({ metal: livery.trim }) : clothOf(livery.main);

    parts.push([headPlate(head, { bottom: above(-0.002), top: above(open ? 0.026 : 0.011), out: (around, up) => dome(around, up) + PLATE, thickness: 0.003, steps: [48, 2] }), banding]);

    if (open) {
        // A ridge over the top from the band in front to the band behind, a crest of horsehair along it
        const ridge = overTheTop(head, rim(0) + 0.25, rim(Math.PI) + 0.25, () => LINING + 0.004);
        const [tube] = taperedTube(ridge, 0.007, 0.007, { segments: 24, sides: 6 });
        const [crest, end] = taperedTube(overTheTop(head, rim(0) + 0.35, rim(Math.PI) + 0.45, () => LINING + 0.013), 0.011, 0.005, { segments: 16, sides: 6 });

        parts.push([tube, metal], [crest.scale(0.45, 1, 1), clothOf(people === "cat" ? livery.trim : livery.main)], [end, clothOf(people === "cat" ? livery.trim : livery.main)]);
    }

    if (people === "human" || style === "nasal" || open) {
        parts.push([nasal(head, head.point(0, rim(0), dome(0, rim(0)) + PLATE), open ? 0.016 : 0.05), metal]);
    }

    // Cheek guards: from in front of the ears to behind the eyes, longest at the front
    if (people === "elf" || people === "darkElf" || open) {
        const [front, back] = [0.82, Math.min(1.3, (head.ears?.from ?? 1.45) - 0.1)];

        for (const side of [-1, 1]) {
            const drop = (around) => {
                const t = (Math.abs(around) - front) / (back - front);

                return people === "darkElf" ? 0.06 - 0.032 * t : 0.05 - 0.02 * t * t;
            };

            parts.push([headPlate(head, { from: side > 0 ? front : -back, to: side > 0 ? back : -front, bottom: (around) => head.upAt(around, line(around) - drop(around)), top: above(0.008), out: () => LINING + PLATE * 0.5, steps: [6, 10] }), metal]);
        }
    }

    switch (style ? (style === "orc" ? "orc" : null) : people) {
        case "human": {
            // A plume sweeping back over the crown
            const [tube, end] = taperedTube([on(0, 1.15, 0.004), on(0, Math.PI / 2, 0.03).add(new THREE.Vector3(0, 0, -0.015)), on(Math.PI, 1.0, 0.035), on(Math.PI, 0.5, 0.012)].map((p) => p.toArray()), 0.015, 0.005, { segments: 14, sides: 8 });

            parts.push([tube, clothOf(livery.main)], [end, clothOf(livery.main)]);
            break;
        }
        case "elf": {
            // A leaf of silver standing along the crown, its root at the front
            const leaf = new THREE.Shape();

            leaf.moveTo(0, 0);
            leaf.bezierCurveTo(0.03, 0.02, 0.06, 0.045, 0.1, 0.06);
            leaf.bezierCurveTo(0.065, 0.02, 0.03, 0.004, 0, 0);

            const root = on(0, 1.15, -0.002);

            parts.push([new THREE.ExtrudeGeometry(leaf, { depth: 0.004, bevelEnabled: false, curveSegments: 10 }).translate(0, 0, -0.002).rotateY(Math.PI / 2).translate(root.x, root.y, root.z), metal]);
            break;
        }
        case "darkElf": {
            // A crest of spikes from the brow over the crown, two more swept back from behind, a
            // point down between the brows, and a guard flared over the nape
            for (let k = 0; k < 5; k++) {
                const along = 0.95 + k * 0.42;
                const base = along <= Math.PI / 2 ? on(0, along, -0.001) : on(Math.PI, Math.PI - along, -0.001);
                const length = 0.042 - Math.abs(k - 2) * 0.008;

                parts.push([standing(new THREE.ConeGeometry(0.0065, length, 6).translate(0, length / 2, 0), base, base.clone().normalize()), metal]);
            }

            for (const side of [-1, 1]) {
                const base = on(side * 2.2, 0.45, -0.001);

                parts.push([standing(new THREE.ConeGeometry(0.008, 0.06, 6).translate(0, 0.03, 0), base, base.clone().normalize().add(new THREE.Vector3(0, 0.35, -0.9))), metal]);
            }

            parts.push([headPlate(head, { from: -0.16, to: 0.16, bottom: (around) => head.upAt(around, line(around) - 0.016 * (1 - Math.abs(around) / 0.16)), top: above(0.006), out: (around, up) => dome(around, up) + PLATE, steps: [8, 4] }), metal]);

            const nape = (around) => [head.upAt(around, line(around) - 0.036), head.upAt(around, line(around) + 0.004)];

            parts.push([
                headPlate(head, {
                    from: 2.0,
                    to: 2 * Math.PI - 2.0,
                    bottom: (around) => nape(around)[0],
                    top: (around) => nape(around)[1],
                    out: (around, up) => {
                        const [low, high] = nape(around);

                        return LINING + PLATE + 0.016 * ((high - up) / (high - low)) ** 1.5;
                    },
                    steps: [16, 6],
                }),
                metal,
            ]);
            break;
        }
        case "lizard": {
            // A fan of feathers from the back of the crown, crimson and turquoise; a stone in front
            for (let k = 0; k < 7; k++) {
                const angle = -0.9 + (k * 1.8) / 6;

                parts.push([standing(new THREE.BoxGeometry(0.013, 0.1, 0.001).translate(0, 0.05, 0), on(Math.PI + angle * 0.3, 0.95, -0.002), new THREE.Vector3(Math.sin(angle) * 0.6, 1, -0.8)), clothOf(k % 2 ? livery.trim : livery.main)]);
            }

            const stone = on(0, rim(0) + 0.25, 0.004);

            parts.push([new THREE.SphereGeometry(0.013, 12, 8).translate(stone.x, stone.y, stone.z), paintOf(livery.trim)]);
            break;
        }
        case "orc": {
            // Horns of bone from its sides, curving out and up, and a spike behind the crown
            const r = (fit.headRadius ?? 0.1) * 1.08;

            // (Their roots sunk in the dome, as far out from the head's middle as they always were)
            for (const side of [-1, 1]) {
                const root = new THREE.Vector3(side * r * 0.95, r * 0.55, 0).sub(new THREE.Vector3(side * Math.sin(1.15), Math.cos(1.15), 0).multiplyScalar(r * 0.75));

                parts.push([orcHorn(r, side).translate(root.x, root.y, root.z), "bone"]);
            }

            parts.push([standing(new THREE.BoxGeometry(r * 0.08, r * 0.5, r * 0.08).translate(0, r * 0.25, 0), on(Math.PI, 1.2, -0.002), new THREE.Vector3(0, 1, -0.7)), style === "orc" ? "darkSteel" : metal]);
            break;
        }
    }

    const group = assemble(parts, "helmet");

    // (What's within its dome, kept with it: the roots of its crests and horns are out of sight)
    group.userData.shell = open ? null : { head: fit.head, rim: "helm", out: LINING + PLATE, tall };

    return group;
}

// A leather cap fitted to the head: over the crown, down to a cap's rim (above the ears, the nape
// bare), its edge rolled; `open`, round a cat's ears, a band and a strap over the top
function fittedCap(fit, open = false) {
    const head = new HeadMap(fit.head);
    const line = rimLine(head, "cap");
    const rim = (around) => head.upAt(around, line(around));
    const parts = [[headPlate(head, { bottom: (around) => head.upAt(around, line(around) - 0.002), top: (around) => head.upAt(around, line(around) + 0.012), out: () => LINING + 0.003, thickness: 0.003, steps: [40, 2] }), "darkLeather"]];

    if (open) {
        parts.push([taperedTube(overTheTop(head, rim(0) + 0.2, rim(Math.PI) + 0.2, () => LINING + 0.003), 0.008, 0.008, { segments: 20, sides: 6 })[0], "leather"]);
    } else {
        parts.push([headPlate(head, { bottom: rim, top: () => Math.PI / 2, out: () => LINING, thickness: 0.003, steps: [40, 10] }), "leather"]);
    }

    const group = assemble(parts, "helmet");

    group.userData.shell = open ? null : { head: fit.head, rim: "cap", out: LINING + 0.003, tall: 0 };

    return group;
}

// A coif or hood fitted to the head: cloth over the crown and the ears (ears too long to go under
// it through it, as a helm's), down to the jaw beside the face and the nape behind (a hood's down
// the neck, looser, peaked a little behind the crown), its edge hemmed
function fittedCoif(fit, { hood = false, material = "linen" } = {}) {
    const measured = new HeadMap(fit.head);
    const overEars = !measured.ears || measured.ears.top < measured.local(0.045);
    const head = new HeadMap(fit.head, { overEars });
    const kind = hood ? "hood" : "coif";
    const line = rimLine(head, kind, { overEars });
    const rim = (around) => head.upAt(around, line(around));
    const loose = hood ? 0.012 : 0.002;
    const out = (around, up) => LINING + loose + (hood ? 0.012 * Math.max(0, -Math.cos(around)) * Math.max(0, Math.sin(up)) ** 2 : 0);
    const parts = [
        [headPlate(head, { bottom: rim, top: () => Math.PI / 2, out, thickness: 0.002, steps: [48, 16] }), material],
        [headPlate(head, { bottom: (around) => head.upAt(around, line(around) - 0.001), top: (around) => head.upAt(around, line(around) + 0.008), out: (around, up) => out(around, up) + 0.002, thickness: 0.002, steps: [48, 2] }), material],
    ];
    const group = assemble(parts, "helmet");

    group.userData.shell = { head: fit.head, rim: kind, out: LINING + loose, tall: 0, overEars };

    return group;
}

// A hat sat on the head where it's widest (a hat's rim, tipped back a little): its band round the
// head there, its crown rising from the band (`kind`: a straw hat's, straight-sided and flat
// topped; a wizard's, a tall cone bent back) and its brim out from the band's foot
function fittedHat(fit, kind) {
    const head = new HeadMap(fit.head);
    const line = rimLine(head, "hat");
    const STEPS = 40;
    const ring = (rise, out) => Array.from({ length: STEPS }, (_, i) => {
        const around = (i / STEPS) * 2 * Math.PI;

        return head.point(around, head.upAt(around, line(around) + rise), out);
    });
    const BAND = 0.014;
    const base = ring(BAND, LINING + 0.002);
    const middle = base.reduce((sum, p) => sum.add(p), new THREE.Vector3()).divideScalar(STEPS);
    const top = Math.max(...base.map((p) => p.y));
    // (The ring `scale` of the way out from the middle, `rise` above the band's highest point, bent back `back`)
    const around = (scale, rise, back = 0) => base.map((p) => new THREE.Vector3(middle.x + (p.x - middle.x) * scale, top + rise, middle.z + (p.z - middle.z) * scale - back));
    const straw = kind === "strawHat";
    const crown = straw
        ? [base, around(0.97, 0.03), around(0.9, 0.1), around(0.86, 0.12), around(0.4, 0.125), around(0.02, 0.126)]
        : [base, ...[0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1].map((t) => around(Math.max(0.02, 1 - t), 0.3 * t, (t ** 2.5) * 0.13))];
    // Its brim out from the foot of the crown, drooping towards its edge (a wizard's, more), as
    // thick as its stuff
    const foot = ring(-0.001, LINING + 0.004);
    const [brim, droop, thick] = straw ? [2.15, 0.016, 0.004] : [1.9, 0.014, 0.003];
    const brimRing = (t) => foot.map((p) => new THREE.Vector3(middle.x + (p.x - middle.x) * (1 + (brim - 1) * t), p.y - droop * t ** 2, middle.z + (p.z - middle.z) * (1 + (brim - 1) * t)));
    const brimRings = [0, 0.35, 0.7, 1].map(brimRing);
    const below = (points) => points.map((p) => p.clone().add(new THREE.Vector3(0, -thick, 0)));
    const edge = brimRings.at(-1);
    const stuff = straw ? "straw" : "cloth";
    const parts = [
        [headPlate(head, { bottom: (a) => head.upAt(a, line(a)), top: (a) => head.upAt(a, line(a) + BAND), out: () => LINING + 0.001, thickness: 0.002, steps: [STEPS, 2] }), straw ? "darkLeather" : "brass"],
        [loft(crown), stuff],
        [loft(crown, true), stuff],
        [loft(brimRings), stuff],
        [loft(brimRings.map(below), true), stuff],
        [loft([below(edge), edge]), stuff],
    ];

    return assemble(parts, "hat");
}

/** Build an item's model. `fit` says how big the body is: { headRadius, scale, ears (a cat's: a helm opens round them), skull (under head-wear) }. */
export function buildItem(model, fit = {}) {
    const headRadius = fit.headRadius ?? 0.1;

    // (Each people's helm and shield: "helm.orc", "shield.elf")
    const [kind, people] = model.split(".");

    if (people && kind === "helm") {
        const open = Boolean(fit.ears) || people === "cat";

        if (fit.head) {
            return fittedHelm(fit, { people, open });
        }

        return fitted(peopleHelm(people, headRadius, Boolean(fit.ears)), fit.skull, open ? { across: headRadius * 1.08 * 0.86, band: [-headRadius * 0.16, headRadius * 0.12], back: headRadius * 1.08 * 1.03 } : helmShell(headRadius, HELM_TALL[people] ?? 1));
    }

    if (people && kind === "shield") {
        return peopleShield(people);
    }

    switch (model) {
        case "sword":
            return sword();
        case "staff":
            return staff();
        case "wand":
            return wand();
        case "warHammer":
            return warHammer();
        case "greatsword":
            return greatsword();
        case "battleAxe":
            return battleAxe();
        case "handTorch":
            return handTorch();
        case "grimoire":
            return grimoire();
        case "grimoireClosed":
            return grimoireClosed();
        case "scabbard":
            return scabbard();
        case "knuckleSpikes":
            return knuckleSpikes(fit.scale ?? 1);
        case "toeSpike":
            return toeSpike(fit.scale ?? 1);
        case "heelSpur":
            return heelSpur(fit.scale ?? 1);
        case "shinPlate":
            return shinPlate(fit.scale ?? 1, fit.shin);
        case "cleaver":
            return cleaver();
        case "bow":
            return bow();
        case "pistol":
            return pistol();
        case "musket":
            return musket();
        case "roundShield":
            return roundShield();
        case "kiteShield":
            return kiteShield();
        case "towerShield":
            return towerShield();
        case "spellward":
            return spellward();
        case "nasalHelm":
        case "orcHelm": {
            const style = model === "orcHelm" ? "orc" : "nasal";

            if (fit.head) {
                return fittedHelm(fit, { people: style === "orc" ? "orc" : "human", style, open: Boolean(fit.ears) });
            }

            return fit.ears ? fitted(peopleHelm(style === "orc" ? "orc" : "human", headRadius, true), fit.skull, { across: headRadius * 1.08 * 0.86, band: [-headRadius * 0.16, headRadius * 0.12], back: headRadius * 1.08 * 1.03 }) : fitted(helmet(headRadius, style), fit.skull, helmShell(headRadius));
        }
        case "leatherCap":
            if (fit.head) {
                return fittedCap(fit, Boolean(fit.ears));
            }

            return fitted(leatherCap(headRadius, Boolean(fit.ears)), fit.skull, fit.ears ? { band: [-headRadius * 0.1, headRadius * 0.9], back: headRadius * 1.05 * 1.04 } : { across: headRadius * 1.05 * 0.88, up: headRadius * 1.05 * 0.95, back: headRadius * 1.05 * 1.03, rim: headRadius * 0.12 });
        case "wizardHat":
            if (fit.head) {
                return fittedHat(fit, model);
            }

            // (Its band, from the brim up: the brim's middle within the head)
            return fitted(wizardHat(headRadius), fit.skull, { across: headRadius * 1.08 * 0.97, band: [headRadius * 1.08 * 0.28 - 0.02, headRadius * 0.5], back: headRadius * 1.08 * 0.97 });
        case "crown":
            return fitted(crown(headRadius), fit.skull, { across: headRadius * 1.04 * 0.92, band: [headRadius * 0.25, headRadius * 0.5], back: headRadius * 1.04 * 0.92 });
        case "catEar":
            return catEar(fit.scale ?? 1, fit.side ?? 1);
        case "catTail":
            return catTail(fit.scale ?? 1);
        case "lizardTail":
            return lizardTail(fit.scale ?? 1);
        case "backpack":
            return backpack();
        case "quiver":
            return quiver();
        case "tusks":
            return tusks(fit.scale ?? 1);
        case "tankard":
            return tankard();
        case "pannier":
            return pannier();
        case "sack":
            return sack();
        case "firewood":
            return firewood();
        case "jug":
            return jug();
        case "pitchfork":
            return pitchfork();
        case "broom":
            return broom();
        case "walkingStaff":
            return walkingStaff();
        case "hoe":
            return hoe();
        case "basket":
            return basket();
        case "elfBasket":
            return elfBasket();
        case "darkElfBasket":
            return darkElfBasket();
        case "catBasket":
            return catBasket();
        case "lizardBasket":
            return lizardBasket();
        case "orcBasket":
            return orcBasket();
        case "ledger":
            return ledger();
        case "strawHat":
            if (fit.head) {
                return fittedHat(fit, model);
            }

            return fitted(strawHat(headRadius), fit.skull, { across: headRadius * 1.08 * 0.97, band: [headRadius * 1.08 * 0.27 - 0.01, headRadius * 1.08 * 1.6], back: headRadius * 1.08 * 0.97 });
        case "coif":
            if (fit.head) {
                return fittedCoif(fit);
            }

            return fitted(coif(headRadius), fit.skull, { across: headRadius * 1.04 * 0.9, up: headRadius * 1.04 * 0.95, back: headRadius * 1.04 * 1.04, rim: headRadius * 0.16 });
        case "hood":
        case "darkHood":
            if (fit.head) {
                return fittedCoif(fit, { hood: true, material: model === "darkHood" ? "cloth:#1d1724" : "wool" });
            }

            return fitted(hood(headRadius, model === "darkHood" ? "cloth:#1d1724" : "wool"), fit.skull, { across: headRadius * 1.1 * 0.9, up: headRadius * 1.1 * 0.97, back: headRadius * 1.1 * 1.05, rim: headRadius * 0.27 });
        case "circletElf":
        case "circletDark":
            // (Fitted over its ornament's height too: the leaf, the spikes)
            return fitted(circlet(headRadius, model === "circletElf" ? "elf" : "darkElf"), fit.skull, { across: headRadius * 1.04 * 0.92, band: [headRadius * 1.04 * 0.3, headRadius * 1.04 * 0.58], back: headRadius * 1.04 * 0.92 });
        case "featherBand":
            return fitted(featherBand(headRadius), fit.skull, { across: headRadius * 1.04 * 0.93, band: [headRadius * 1.04 * (BAND_UP - 0.07), headRadius * 1.04 * (BAND_UP + 0.07)], back: headRadius * 1.04 * 0.93 });
        case "smithHammer":
            return smithHammer();
        case "tongs":
            return tongs();
        default:
            throw new Error(`No item model "${model}"`);
    }
}
