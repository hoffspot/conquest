// Clothes that hang from the body rather than wrapping it: skirts, gowns and aprons.
//
// A garment (garments.js) is the body's own surface grown outward, so it can't hang between the
// legs the way a skirt does. A drape is built instead: rings of cloth round the body, from its
// waist (fitted: each ring measured round the body at its height) down over the hips (where the
// body is widest), then falling to its hem, flaring out and rounding off as it goes, in pleats.
// An apron is a drape that only goes part of the way round, at the front.
//
// It's skinned to the skeleton like the body: its waist to the lower back and pelvis, then more
// and more to the thighs down to the knees, and below them to the shins, each side to its own; so
// the hem swings as the legs walk, and sitting, it lies over the lap and falls down the shins.

import * as THREE from "three";

/**
 * Every drape: its slot, how far down it hangs (`length`: 0 at the hips, 1 at the ankle), how
 * much it flares out by the hem (a share of the hips' width), how many pleats go round it, how
 * far round it goes (`arc`: 1 all the way, less for an apron at the front) and how far out from
 * what's under it (`over`, metres), and its look.
 */
export const DRAPES = Object.freeze({
    skirt: { label: "Wool skirt", slot: "legs", length: 0.95, flare: 0.45, pleats: 14, colour: "#5d4a34", roughness: 0.92 },
    greenSkirt: { label: "Green skirt", slot: "legs", length: 0.9, flare: 0.5, pleats: 16, colour: "#3e5a36", roughness: 0.92 },
    kirtle: { label: "Red kirtle", slot: "legs", length: 1, flare: 0.55, pleats: 16, colour: "#7a2a22", roughness: 0.88 },
    gown: { label: "Velvet gown", slot: "legs", length: 1.04, flare: 0.75, pleats: 20, colour: "#3b1437", roughness: 0.6, sheen: true },
    apron: { label: "Apron", slot: "apron", length: 0.62, flare: 0.08, pleats: 5, arc: 0.4, over: 0.035, colour: "#d9d0bc", roughness: 0.95 },
});

// Round the body in this many steps; down it in this many rings below the hips
const AROUND = 48;
const DOWN = 12;

// How loose it is at the waist and over the hips (metres)
const EASE = { waist: 0.012, hips: 0.03 };

// How deep its pleats are, as a share of its radius, at the hem
const PLEAT_DEPTH = 0.045;

// At the knees, this share of its weight is on the thighs (the rest on the pelvis); at the hem,
// this share on the shins (the rest on the thighs)
const ON_THIGHS = 0.9;
const ON_SHINS = 0.75;

const smoothstep = (edge0, edge1, x) => {
    const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));

    return t * t * (3 - 2 * t);
};

/**
 * The body's outline round a height band: for each of AROUND directions round its middle (0
 * straight ahead, towards its left as it grows), how far out it reaches (metres), the gaps
 * filled in and smoothed; and its middle ({ x, z }).
 */
function outline(character, measures, bottom, top, centre = null) {
    const { positions } = character;
    const { vertices } = measures;
    const points = [];

    for (let v = 0; v < vertices.length; v++) {
        const y = positions[v * 3 + 1];
        const { region } = vertices[v];

        if (y >= bottom && y <= top && (region === "torso" || region === "leg")) {
            points.push([positions[v * 3], positions[v * 3 + 2]]);
        }
    }

    const middle = centre ?? {
        x: 0,
        z: points.reduce((sum, [, z]) => sum + z, 0) / Math.max(1, points.length),
    };
    const reach = new Float32Array(AROUND);

    for (const [x, z] of points) {
        const angle = Math.atan2(x - middle.x, z - middle.z);
        const k = ((Math.round((angle / (2 * Math.PI)) * AROUND) % AROUND) + AROUND) % AROUND;

        reach[k] = Math.max(reach[k], Math.hypot(x - middle.x, z - middle.z));
    }

    // Fill any direction no vertex fell in from its neighbours, then smooth round
    for (let k = 0; k < AROUND; k++) {
        if (!reach[k]) {
            let [before, after] = [1, 1];

            while (!reach[(k - before + AROUND) % AROUND] && before < AROUND) {
                before++;
            }

            while (!reach[(k + after) % AROUND] && after < AROUND) {
                after++;
            }

            reach[k] = (reach[(k - before + AROUND) % AROUND] * after + reach[(k + after) % AROUND] * before) / (before + after);
        }
    }

    for (let pass = 0; pass < 3; pass++) {
        const copy = reach.slice();

        for (let k = 0; k < AROUND; k++) {
            reach[k] = Math.max(copy[k], (copy[(k + AROUND - 1) % AROUND] + 2 * copy[k] + copy[(k + 1) % AROUND]) / 4);
        }
    }

    return { reach, middle };
}

/**
 * Build a drape on a character: its geometry (positions, normals, colours for the pleats'
 * shading, skin indices and weights on the character's skeleton), in the body's rest pose.
 * `measures` is garments.js's measureBody(character).
 */
export function buildDrape(character, id, measures) {
    const drape = DRAPES[id];
    const { landmarks: l } = measures;
    const { rig } = character;
    const scale = character.height / 1.7;
    const arc = drape.arc ?? 1;
    const over = drape.over ?? 0;

    // Heights: the waist, the widest of the hips, and the hem
    const waistY = l.waist - 0.01 * scale;
    const hipsY = Math.min(l.hips, l.crotch + 0.06 * scale);
    const hemY = hipsY + (l.ankle - 0.03 * scale - hipsY) * drape.length;
    const hips = outline(character, measures, l.crotch - 0.02 * scale, l.hips + 0.03 * scale);
    const waist = outline(character, measures, waistY - 0.02 * scale, waistY + 0.02 * scale, hips.middle);
    const average = hips.reach.reduce((sum, r) => sum + r, 0) / AROUND;

    // Rings from the waist down: [y, share of the way from the hips to the hem (0 above), radius at k]
    const rings = [];

    for (let r = 0; r <= 2; r++) {
        const t = r / 2;

        rings.push([waistY + (hipsY - waistY) * t, 0, (k) => waist.reach[k] + EASE.waist + (hips.reach[k] + EASE.hips - waist.reach[k] - EASE.waist) * t]);
    }

    for (let r = 1; r <= DOWN; r++) {
        const t = r / DOWN;

        rings.push([hipsY + (hemY - hipsY) * t, t, (k) => {
            const round = hips.reach[k] + (average - hips.reach[k]) * smoothstep(0, 0.6, t);

            return (round + EASE.hips) * (1 + drape.flare * t);
        }]);
    }

    // Round it: all the way, or (an apron) just the front
    const columns = arc >= 1 ? AROUND : Math.round(AROUND * arc) + 1;
    const angleOf = (c) => (arc >= 1 ? (c / AROUND) * 2 * Math.PI : (c / (columns - 1) - 0.5) * arc * 2 * Math.PI);
    const reachAt = (reach, angle) => {
        const at = (((angle / (2 * Math.PI)) * AROUND) % AROUND + AROUND) % AROUND;
        const k = Math.floor(at);
        const share = at - k;

        return reach(k) * (1 - share) + reach((k + 1) % AROUND) * share;
    };

    const bones = {
        spine: rig.index.get("Spine"),
        hips: rig.index.get("Hips"),
        left: rig.index.get("LeftUpLeg"),
        right: rig.index.get("RightUpLeg"),
        leftShin: rig.index.get("LeftLeg"),
        rightShin: rig.index.get("RightLeg"),
    };
    const kneeY = rig.heads[bones.leftShin].y;
    const positions = [];
    const colours = [];
    const skinIndex = [];
    const skinWeight = [];

    rings.forEach(([y, t, radius], r) => {
        for (let c = 0; c < columns; c++) {
            const angle = angleOf(c);
            const pleat = 1 + PLEAT_DEPTH * t * Math.sin(angle * drape.pleats);
            const out = (reachAt(radius, angle) + over) * pleat;
            const x = hips.middle.x + Math.sin(angle) * out;
            const z = hips.middle.z + Math.cos(angle) * out;
            const shade = 0.86 + 0.14 * (0.5 + 0.5 * Math.sin(angle * drape.pleats)) * Math.min(1, t * 3) + (t === 0 ? 0.14 : 0) * (1 - Math.min(1, r / 2));

            positions.push(x, y, z);
            colours.push(shade, shade, shade);

            // The waist bends with the lower back; below the hips, more and more with the thighs
            // down to the knees, then the shins, each side with its own
            const left = smoothstep(-0.35, 0.35, Math.sin(angle));

            if (r === 0) {
                skinIndex.push(bones.spine, bones.hips, 0, 0);
                skinWeight.push(0.4, 0.6, 0, 0);
            } else if (y >= kneeY) {
                const legs = ON_THIGHS * smoothstep(hipsY, kneeY, y);

                skinIndex.push(bones.hips, bones.left, bones.right, 0);
                skinWeight.push(1 - legs, legs * left, legs * (1 - left), 0);
            } else {
                const onShins = ON_SHINS * smoothstep(kneeY, hemY, y);
                const [thighs, shins] = [ON_THIGHS * (1 - onShins), ON_THIGHS * onShins];

                // (The other side's share goes to its thigh: four bones at most)

                skinIndex.push(bones.hips, left >= 0.5 ? bones.left : bones.right, left >= 0.5 ? bones.leftShin : bones.rightShin, left >= 0.5 ? bones.right : bones.left);
                skinWeight.push(1 - ON_THIGHS, thighs * Math.max(left, 1 - left), shins * Math.max(left, 1 - left), (thighs + shins) * Math.min(left, 1 - left));
            }
        }
    });

    const index = [];
    const across = arc >= 1 ? columns : columns - 1;

    for (let r = 0; r < rings.length - 1; r++) {
        for (let c = 0; c < across; c++) {
            const a = r * columns + c;
            const b = r * columns + ((c + 1) % columns);

            index.push(a, a + columns, b, b, a + columns, b + columns);
        }
    }

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
    geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIndex, 4));
    geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWeight, 4));
    geometry.setIndex(index);
    geometry.computeVertexNormals();

    return { geometry, drape, rings: rings.length, columns };
}

/** A drape's material: its colour, shaded in its pleats, both sides of the cloth drawn. */
export function drapeMaterial(drape) {
    const material = drape.sheen
        ? new THREE.MeshPhysicalMaterial({ color: drape.colour, roughness: drape.roughness, sheen: 0.6, sheenColor: new THREE.Color(drape.colour).offsetHSL(0, -0.2, 0.12), sheenRoughness: 0.5 })
        : new THREE.MeshStandardMaterial({ color: drape.colour, roughness: drape.roughness });

    material.vertexColors = true;
    material.side = THREE.DoubleSide;

    return material;
}
