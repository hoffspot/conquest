// The shapes the wild's creatures are built of (beasts/*.js): ellipsoids, tapered limbs, cones and
// spikes, each a little mesh placed in its creature's body; and the materials they're coloured
// with (fur, hide, chitin, scales, slime, bone, and the glowing and see-through stuff of spirits).
//
// Everything's plain geometry made in code, so a creature costs nothing to download, and the
// same few geometries are shared by every creature that uses them (by their sizes).

import * as THREE from "three";

const geometries = new Map();

// A geometry made once for each set of sizes, shared after
function shared(key, make) {
    if (!geometries.has(key)) {
        geometries.set(key, make());
    }

    return geometries.get(key);
}

/** An ellipsoid of radii x, y, z (metres), round its middle. */
export function ellipsoid(x, y, z, detail = 14) {
    return shared(`e${x},${y},${z},${detail}`, () => {
        const geometry = new THREE.SphereGeometry(1, detail, Math.max(6, Math.round(detail * 0.7)));

        geometry.scale(x, y, z);

        return geometry;
    });
}

/**
 * A limb: a tapered, rounded cylinder from its root (at 0, 0, 0) `length` metres down -y, `r0` wide
 * at the root and `r1` at the end (for legs, necks, tails: turned to point where they go).
 */
export function limb(length, r0, r1, detail = 8) {
    return shared(`l${length},${r0},${r1},${detail}`, () => {
        const geometry = new THREE.CapsuleGeometry(1, 1, 3, detail);
        const position = geometry.attributes.position;

        // A unit capsule (-1 to 1 through its middle) squeezed to the taper, and hung from its root
        for (let k = 0; k < position.count; k++) {
            const y = position.getY(k);
            const along = Math.min(1, Math.max(0, (1 - y) / 2));
            const radius = r0 + (r1 - r0) * along;

            position.setX(k, position.getX(k) * radius);
            position.setZ(k, position.getZ(k) * radius);
            position.setY(k, -along * length);
        }

        geometry.computeVertexNormals();

        return geometry;
    });
}

/** A cone `length` long and `radius` wide at its base, pointing +y from its base at 0, 0, 0. */
export function cone(length, radius, sides = 7) {
    return shared(`c${length},${radius},${sides}`, () => {
        const geometry = new THREE.ConeGeometry(radius, length, sides);

        geometry.translate(0, length / 2, 0);

        return geometry;
    });
}

/**
 * A curved bar (a rib, a crown's band): `arc` radians of a ring `radius` round and `tube` thick,
 * in the x-y plane from +x towards +y.
 */
export function ring(radius, tube, arc = Math.PI * 2, sides = 14) {
    return shared(`r${radius},${tube},${arc},${sides}`, () => new THREE.TorusGeometry(radius, tube, 5, sides, arc));
}

/** A faceted lump (a clump of leaves, a stone): an icosahedron `radius` round. */
export function lump(radius, detail = 0) {
    return shared(`g${radius},${detail}`, () => new THREE.IcosahedronGeometry(radius, detail));
}

/** A box w by h by d, round its middle. */
export function box(w, h, d) {
    return shared(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
}

/** A flat membrane (a wing, a fin): a fan of points in the x-z plane (metres), each [x, z]. */
export function membrane(points) {
    return shared(`m${points.join(";")}`, () => {
        const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, z)));
        const geometry = new THREE.ShapeGeometry(shape);

        geometry.rotateX(Math.PI / 2);

        return geometry;
    });
}

/**
 * A material for a creature's skin: its colour, how rough, and what else (`glow`: an emissive
 * colour and how bright; `clear`: how see-through, 0 to 1; `flat`: faceted, for chitin and stone).
 */
export function skin(colour, { roughness = 0.85, metalness = 0, glow = null, glowing = 1, clear = 0, flat = false, side = THREE.FrontSide } = {}) {
    return new THREE.MeshStandardMaterial({
        color: new THREE.Color(colour),
        roughness,
        metalness,
        emissive: glow ? new THREE.Color(glow) : new THREE.Color(0x000000),
        emissiveIntensity: glow ? glowing : 1,
        transparent: clear > 0,
        opacity: 1 - clear,
        depthWrite: clear < 0.35,
        flatShading: flat,
        side,
    });
}

/** A mesh of a geometry and material, placed (position [x, y, z], rotation [x, y, z]) in a parent. */
export function part(parent, geometry, material, { at = [0, 0, 0], turn = [0, 0, 0], scale = null, shadow = true } = {}) {
    const mesh = new THREE.Mesh(geometry, material);

    mesh.position.set(...at);
    mesh.rotation.set(...turn);

    if (scale) {
        mesh.scale.set(...scale);
    }

    mesh.castShadow = shadow;
    parent.add(mesh);

    return mesh;
}

/**
 * A joint: a bone that parts hang from, turned to animate them (named, for finding), which a
 * sculpted body's skin is bound to (sculpt.js).
 */
export function joint(parent, name, at = [0, 0, 0]) {
    const pivot = new THREE.Bone();

    pivot.name = name;
    pivot.position.set(...at);
    parent.add(pivot);

    return pivot;
}

/** A colour a share lighter (towards white, by `by`) or darker (towards black, by -`by`). */
export function shade(colour, by) {
    const base = new THREE.Color(colour);

    return by >= 0 ? base.lerp(new THREE.Color(0xffffff), by) : base.lerp(new THREE.Color(0x000000), -by);
}

/** A small seeded random (0 to 1) from a whole number: the same creature, the same each time. */
export function seeded(seed) {
    let state = (seed >>> 0) || 1;

    return () => {
        state = (state + 0x6d2b79f5) >>> 0;

        let t = state;

        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
