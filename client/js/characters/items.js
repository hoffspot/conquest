// Rigid equipment: weapons, shields, helmets, packs, built from simple shapes.
//
// Each item is made in its own frame, in metres, with the origin where it attaches: for things
// held, the middle of the grip, with +y along the grip towards the business end (the blade, the
// staff's head) and +z the direction the edge or muzzle faces. Sockets (equipment.js) say where
// that frame goes on the body; `size` scales items that fit the body (helmets fit the head).

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

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
        }[name];

        materials.set(name, new THREE.MeshStandardMaterial(settings));
    }

    return materials.get(name);
}

/** Merge geometries by material into one group of meshes (one draw call per material). */
function assemble(parts, name) {
    const byMaterial = new Map();

    for (const [geometry, material] of parts) {
        const list = byMaterial.get(material) ?? [];

        // Every part without an index, so they merge
        list.push(geometry.index ? geometry.toNonIndexed() : geometry);
        byMaterial.set(material, list);
    }

    const group = new THREE.Group();

    group.name = name;

    for (const [material, list] of byMaterial) {
        for (const geometry of list) {
            geometry.deleteAttribute("uv");
        }

        const mesh = new THREE.Mesh(mergeGeometries(list), itemMaterial(material));

        mesh.castShadow = true;
        group.add(mesh);
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
    // A long ash haft (gripped a third of the way up), a square steel head with a spike behind
    // it, and a point on top; the striking face looks forward (+z)
    return assemble([
        [at(new THREE.CylinderGeometry(0.017, 0.019, 1.12, 10), 0, 0.2, 0), "wood"],
        [at(new THREE.CylinderGeometry(0.021, 0.021, 0.16, 10), 0, 0, 0), "leather"],
        [at(new THREE.CylinderGeometry(0.02, 0.02, 0.05, 10), 0, -0.37, 0), "iron"],
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

/** Build an item's model. `fit` says how big the body is: { headRadius, scale }. */
export function buildItem(model, fit = {}) {
    const headRadius = fit.headRadius ?? 0.1;

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
        case "knuckleSpikes":
            return knuckleSpikes(fit.scale ?? 1);
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
            return helmet(headRadius, "nasal");
        case "orcHelm":
            return helmet(headRadius, "orc");
        case "wizardHat":
            return wizardHat(headRadius);
        case "backpack":
            return backpack();
        case "quiver":
            return quiver();
        case "tusks":
            return tusks(fit.scale ?? 1);
        default:
            throw new Error(`No item model "${model}"`);
    }
}
