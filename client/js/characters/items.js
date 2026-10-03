// Rigid equipment: weapons, shields, helmets, packs, built from simple shapes.
//
// Each item is made in its own frame, in metres, with the origin where it attaches: for things
// held, the middle of the grip, with +y along the grip towards the business end (the blade, the
// staff's head) and +z the direction the edge or muzzle faces. Sockets (equipment.js) say where
// that frame goes on the body; `size` scales items that fit the body (helmets fit the head).

import * as THREE from "three";
import { fireLit } from "../world/firelight.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { LIVERIES } from "./liveries.js";

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

function shinPlate(scale) {
    // A curved plate down the front of the shin (the origin on it), three spikes along it
    const radius = 0.046 * scale;
    const parts = [[at(arcPlate(radius, 0.004 * scale, 0.17 * scale, -Math.PI * 0.36, Math.PI * 0.36), 0, 0, -radius), "darkSteel"]];

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

/** Build an item's model. `fit` says how big the body is: { headRadius, scale, ears (a cat's: a helm opens round them), skull (under head-wear) }. */
export function buildItem(model, fit = {}) {
    const headRadius = fit.headRadius ?? 0.1;

    // (Each people's helm and shield: "helm.orc", "shield.elf")
    const [kind, people] = model.split(".");

    if (people && kind === "helm") {
        const open = Boolean(fit.ears) || people === "cat";

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
            return shinPlate(fit.scale ?? 1);
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
        case "nasalHelm":
        case "orcHelm": {
            const style = model === "orcHelm" ? "orc" : "nasal";

            return fit.ears ? fitted(peopleHelm(style === "orc" ? "orc" : "human", headRadius, true), fit.skull, { across: headRadius * 1.08 * 0.86, band: [-headRadius * 0.16, headRadius * 0.12], back: headRadius * 1.08 * 1.03 }) : fitted(helmet(headRadius, style), fit.skull, helmShell(headRadius));
        }
        case "leatherCap":
            return fitted(leatherCap(headRadius, Boolean(fit.ears)), fit.skull, fit.ears ? { band: [-headRadius * 0.1, headRadius * 0.9], back: headRadius * 1.05 * 1.04 } : { across: headRadius * 1.05 * 0.88, up: headRadius * 1.05 * 0.95, back: headRadius * 1.05 * 1.03, rim: headRadius * 0.12 });
        case "wizardHat":
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
        case "smithHammer":
            return smithHammer();
        case "tongs":
            return tongs();
        default:
            throw new Error(`No item model "${model}"`);
    }
}
