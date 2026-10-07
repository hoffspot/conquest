// Clothes that hang from the body rather than wrapping it: skirts, gowns and aprons.
//
// A garment (garments.js) is the body's own surface grown outward, so it can't hang between the
// legs the way a skirt does. A drape is built instead: rings of cloth round the body, from its
// waist (fitted: each ring measured round the body at its height) down over the hips (where the
// body is widest), then falling to its hem, flaring out and rounding off as it goes, in pleats.
// An apron is a drape that only goes part of the way round, at the front.
//
// It's skinned to the skeleton like the body: its waist to the lower back and pelvis, then more
// and more to the thighs down to the knees, and below them to the shins; so the hem swings as the
// legs walk, and sitting, it lies over the lap and falls down the shins. Each side goes with its
// own leg, but its front with whichever leg is further forward and its back with whichever is
// further back (two bones of the drape's own for each, swung as those legs are: drapeSkeleton),
// so a leg striding out takes the cloth before it along, never coming through it.

import * as THREE from "three";
import { LIVERIES } from "./liveries.js";

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
    leatherApron: { label: "Leather apron", slot: "apron", length: 0.78, flare: 0.06, pleats: 3, arc: 0.45, over: 0.04, colour: "#4f3220", roughness: 0.7 },
    albSkirt: { label: "Alb (its skirt)", slot: "legs", length: 1.06, flare: 0.5, pleats: 18, colour: "#f1ede4", roughness: 0.9 },
    // The townsfolk's (core/townsfolk.js): a blue kirtle, a homespun brown skirt, a friar's habit
    blueKirtle: { label: "Blue kirtle", slot: "legs", length: 1, flare: 0.55, pleats: 16, colour: "#3a4f7a", roughness: 0.88 },
    brownSkirt: { label: "Brown skirt", slot: "legs", length: 0.95, flare: 0.45, pleats: 14, colour: "#6b5236", roughness: 0.92 },
    habitSkirt: { label: "Habit (its skirt)", slot: "legs", length: 1.06, flare: 0.5, pleats: 18, colour: "#5a4330", roughness: 0.95 },
    guildSkirt: { label: "Guild skirt", slot: "legs", length: 0.55, flare: 0.55, pleats: 16, colour: "#23365e", roughness: 0.8 },
    mageRobe: { label: "Mage's robe", slot: "legs", length: 1.05, flare: 0.55, pleats: 16, colour: "#2e3f78", roughness: 0.85 },
    // A cloak (`cape`), from the shoulders down the back to below the knees, behind the arms,
    // edged at its hem and sides in its trim (`trim`)
    travelCloak: { label: "Travelling cloak", slot: "cloak", cape: true, length: 0.55, flare: 0.3, pleats: 7, colour: "#5e4e3a", trim: "#3e3226", roughness: 0.92 },
    // Each people's: their cloak in their colours, and an official's long robe (liveries.js)
    ...Object.fromEntries(Object.entries(LIVERIES).flatMap(([people, { main, trim, dark }]) => [
        [`cloak.${people}`, { label: "Cloak", slot: "cloak", cape: true, length: 0.55, flare: 0.3, pleats: 7, colour: main, trim, roughness: 0.85 }],
        [`robe.${people}`, { label: "Robe", slot: "legs", length: 1.05, flare: 0.5, pleats: 16, colour: people === "orc" ? dark : main, roughness: 0.85 }],
    ])),
});

// Round the body in this many steps; down it in this many rings below the hips
const AROUND = 48;
const DOWN = 12;

// How loose it is at the waist and over the hips (metres)
const EASE = { waist: 0.012, hips: 0.03 };

// How deep its pleats are, as a share of its radius, at the hem
const PLEAT_DEPTH = 0.045;

// A cloak's share of its weight on the thighs at the knees (the rest on the pelvis), and on the
// shins at its hem (the rest on the thighs)
const ON_THIGHS = 0.9;
const ON_SHINS = 0.75;

// How far down from the hips to the knees a skirt is all on the thighs (from all on the pelvis at
// the hips: so a thigh swinging forward takes the cloth over it along), and from the knees to the
// hem all on the shins (from all on the thighs at the knees: so a shin bending back takes the
// cloth down its calf with it)
const THIGH_REACH = 0.5;
const SHIN_REACH = 0.3;

/**
 * A drape's own bones, after the body's in its skeleton (drapeSkeleton): for its front, a thigh
 * swung forward about the middle of the hips as far as the knee furthest forward has swung, and
 * from where that puts the knees a shin swung as far as the shin furthest forward; for its back,
 * the same, back.
 */
export const DRAPE_BONES = Object.freeze(["frontThigh", "frontShin", "backThigh", "backShin"]);

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

    if (drape.cape) {
        return buildCape(character, id, measures);
    }

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
        ...Object.fromEntries(DRAPE_BONES.map((name, k) => [name, rig.bones.length + k])),
    };
    const kneeY = rig.heads[bones.leftShin].y;
    const positions = [];
    const colours = [];
    const skinIndex = [];
    const skinWeight = [];

    // (Round it, how much goes with the front or back's bones, and how much with its side's leg)
    const legsAt = (angle) => {
        const [ahead, aside] = [Math.cos(angle), Math.sin(angle)];

        return [
            [ahead >= 0 ? bones.frontThigh : bones.backThigh, ahead >= 0 ? bones.frontShin : bones.backShin, ahead * ahead],
            [aside >= 0 ? bones.left : bones.right, aside >= 0 ? bones.leftShin : bones.rightShin, aside * aside],
        ];
    };

    // (How much of the cloth at height `y` below the hips goes with the legs: taken up quickly
    // below the hips, where a thigh driving forward first meets it, all of it from halfway down
    // to the knees)
    const onLegs = (y) => (y >= kneeY ? 1 - (1 - Math.min(1, Math.max(0, (hipsY - y) / ((hipsY - kneeY) * THIGH_REACH)))) ** 2 : 1);

    // (How far each leg is out to its side at height `y` as the body is built, from where it is
    // standing straight down from its hip, as the rig rests it: the legs are built apart, and the
    // cloth that goes with one comes in with it as it stands)
    const splay = (side, y) => {
        const [hip, knee, ankle] = (side > 0 ? [bones.left, bones.leftShin, rig.index.get("LeftFoot")] : [bones.right, bones.rightShin, rig.index.get("RightFoot")]).map((i) => rig.heads[i]);
        const [from, to] = y >= knee.y ? [hip, knee] : [knee, ankle];
        const share = Math.min(1, Math.max(0, (from.y - y) / Math.max(1e-6, from.y - to.y)));

        return side * (from.x + (to.x - from.x) * share - hip.x);
    };

    rings.forEach(([y, t, radius], r) => {
        for (let c = 0; c < columns; c++) {
            const angle = angleOf(c);
            const pleat = 1 + PLEAT_DEPTH * t * Math.sin(angle * drape.pleats);
            const out = (reachAt(radius, angle) + over) * pleat;
            const z = hips.middle.z + Math.cos(angle) * out;
            const side = Math.sin(angle) >= 0 ? 1 : -1;
            const x = hips.middle.x + Math.sin(angle) * out + side * Math.sin(angle) ** 2 * (r === 0 ? 0 : onLegs(y)) * Math.max(0, splay(side, y));
            const shade = 0.86 + 0.14 * (0.5 + 0.5 * Math.sin(angle * drape.pleats)) * Math.min(1, t * 3) + (t === 0 ? 0.14 : 0) * (1 - Math.min(1, r / 2));

            positions.push(x, y, z);
            colours.push(shade, shade, shade);

            // The waist bends with the lower back; below the hips, more and more with the legs
            // down to the knees (its sides with their own, its front and back with the legs
            // furthest that way), then the shins
            const [[alongThigh, alongShin, along], [asideThigh, asideShin, aside]] = legsAt(angle);

            if (r === 0) {
                skinIndex.push(bones.spine, bones.hips, 0, 0);
                skinWeight.push(0.4, 0.6, 0, 0);
            } else if (y >= kneeY) {
                const legs = onLegs(y);

                skinIndex.push(bones.hips, alongThigh, asideThigh, 0);
                skinWeight.push(1 - legs, legs * along, legs * aside, 0);
            } else {
                const onShins = smoothstep(kneeY, kneeY - (kneeY - hemY) * SHIN_REACH, y);

                skinIndex.push(alongThigh, alongShin, asideThigh, asideShin);
                skinWeight.push(along * (1 - onShins), along * onShins, aside * (1 - onShins), aside * onShins);
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

    // (How far it reaches forward, back and to the sides ring by ring below the hips, as it
    // rests: how far a leg in it can go before it comes out: drapeSkeleton)
    const profile = [];

    rings.forEach(([y, t], r) => {
        if (t > 0) {
            const ring = { y, middle: hips.middle.z, front: 0, back: 0, wide: 0 };

            for (let c = 0; c < columns; c++) {
                const [x, , z] = positions.slice((r * columns + c) * 3, (r * columns + c) * 3 + 3);

                ring.front = Math.max(ring.front, z - hips.middle.z);
                ring.back = Math.max(ring.back, hips.middle.z - z);
                ring.wide = Math.max(ring.wide, Math.abs(x - hips.middle.x));
            }

            profile.push(ring);
        }
    });

    return { geometry, drape, rings: rings.length, columns, profile };
}


// A cloak's rings, from the shoulders to the hem: each ring's height, and how far round the back
// it goes either side (radians from straight behind: over the shoulders at the top, behind the
// arms at the armpits, widening as it falls)
const CAPE_ROUND = { top: 1.75, armpit: 1.2, hips: 1.35, hem: 1.6 };

// How far out from the back it hangs (metres): close at the shoulders, falling free below them
const CAPE_EASE = { top: 0.012, back: 0.03 };

/**
 * Build a cloak on a character: from the base of the neck over the shoulders and down the back,
 * behind the arms, falling straight from the shoulder blades (never in to the small of the back)
 * then flaring to its hem; skinned to the upper back at the top, the lower back, the pelvis, and
 * below the hips the thighs and shins as a skirt is, so it swings as they walk. Its colours are in
 * its vertices: the cloth, and the trim at its sides and hem.
 */
function buildCape(character, id, measures) {
    const drape = DRAPES[id];
    const { landmarks: l } = measures;
    const { rig } = character;
    const scale = character.height / 1.7;
    const hipsY = Math.min(l.hips, l.crotch + 0.06 * scale);
    const topY = l.neck - 0.035 * scale;
    const hemY = hipsY + (l.ankle - 0.03 * scale - hipsY) * drape.length;
    const hips = outline(character, measures, l.crotch - 0.02 * scale, l.hips + 0.03 * scale);
    const middle = hips.middle;
    const bands = [topY, (topY + l.armpit) / 2, l.armpit, l.chest - 0.02 * scale, l.waist, hipsY];
    const across = bands.map((y) => outline(character, measures, y - 0.025 * scale, y + 0.025 * scale, middle).reach);
    const rings = [];

    for (let r = 0; r < bands.length; r++) {
        rings.push({ y: bands[r], t: 0, reach: across[r] });
    }

    for (let r = 1; r <= DOWN; r++) {
        rings.push({ y: hipsY + (hemY - hipsY) * (r / DOWN), t: r / DOWN, reach: hips.reach });
    }

    const columns = 25;
    const bones = {
        upper: rig.index.get("Spine2"),
        middle: rig.index.get("Spine1"),
        spine: rig.index.get("Spine"),
        hips: rig.index.get("Hips"),
        left: rig.index.get("LeftUpLeg"),
        right: rig.index.get("RightUpLeg"),
        leftShin: rig.index.get("LeftLeg"),
        rightShin: rig.index.get("RightLeg"),
    };
    const kneeY = rig.heads[bones.leftShin].y;
    const cloth = new THREE.Color(drape.colour);
    const trim = new THREE.Color(drape.trim ?? drape.colour);
    const positions = [];
    const colours = [];
    const skinIndex = [];
    const skinWeight = [];

    // How far round it goes at a height, either side of straight behind
    const roundAt = (y) => {
        if (y >= l.armpit) {
            return CAPE_ROUND.armpit + (CAPE_ROUND.top - CAPE_ROUND.armpit) * smoothstep(l.armpit, topY, y);
        }

        if (y >= hipsY) {
            return CAPE_ROUND.armpit + (CAPE_ROUND.hips - CAPE_ROUND.armpit) * smoothstep(l.armpit, hipsY, y);
        }

        return CAPE_ROUND.hips + (CAPE_ROUND.hem - CAPE_ROUND.hips) * smoothstep(hipsY, hemY, y);
    };

    // (Hanging straight down from the furthest the back reaches above: behind straight down from
    // the shoulder blades, never in towards the waist)
    const hanging = new Float32Array(AROUND);

    rings.forEach(({ y, t, reach }, r) => {
        const round = roundAt(y);
        const ease = r === 0 ? CAPE_EASE.top : CAPE_EASE.back;

        for (let k = 0; k < AROUND; k++) {
            hanging[k] = r === 0 ? reach[k] : Math.max(hanging[k], reach[k]);
        }

        for (let c = 0; c < columns; c++) {
            const share = c / (columns - 1);
            const angle = Math.PI + (share - 0.5) * 2 * round;
            const at = (((angle / (2 * Math.PI)) * AROUND) % AROUND + AROUND) % AROUND;
            const k = Math.floor(at);
            const reachHere = hanging[k] * (1 - (at - k)) + hanging[(k + 1) % AROUND] * (at - k);
            const pleat = 1 + PLEAT_DEPTH * t * Math.sin(share * Math.PI * 2 * drape.pleats);
            const out = (reachHere + ease) * (1 + drape.flare * t * t) * pleat;
            const x = middle.x + Math.sin(angle) * out;
            const z = middle.z + Math.cos(angle) * out;
            const shade = 0.84 + 0.16 * (0.5 + 0.5 * Math.sin(share * Math.PI * 2 * drape.pleats)) * Math.min(1, t * 3 + 0.3);
            const edged = c === 0 || c === columns - 1 || r === rings.length - 1;
            const colour = edged ? trim : cloth;

            positions.push(x, y, z);
            colours.push(colour.r * shade, colour.g * shade, colour.b * shade);

            // Over the shoulders and down the back with the spine; below the hips, as a skirt
            const left = smoothstep(-0.35, 0.35, Math.sin(angle));

            if (y >= l.chest) {
                skinIndex.push(bones.upper, 0, 0, 0);
                skinWeight.push(1, 0, 0, 0);
            } else if (y >= l.waist) {
                const down = smoothstep(l.chest, l.waist, y);

                skinIndex.push(bones.upper, bones.middle, bones.spine, 0);
                skinWeight.push(1 - down, down * 0.6, down * 0.4, 0);
            } else if (y >= hipsY) {
                const down = smoothstep(l.waist, hipsY, y);

                skinIndex.push(bones.spine, bones.hips, 0, 0);
                skinWeight.push(1 - down, down, 0, 0);
            } else if (y >= kneeY) {
                const legs = ON_THIGHS * 0.8 * smoothstep(hipsY, kneeY, y);

                skinIndex.push(bones.hips, bones.left, bones.right, 0);
                skinWeight.push(1 - legs, legs * left, legs * (1 - left), 0);
            } else {
                const onShins = ON_SHINS * 0.6 * smoothstep(kneeY, hemY, y);
                const [thighs, shins] = [ON_THIGHS * 0.8 * (1 - onShins), ON_THIGHS * 0.8 * onShins];

                skinIndex.push(bones.hips, left >= 0.5 ? bones.left : bones.right, left >= 0.5 ? bones.leftShin : bones.rightShin, left >= 0.5 ? bones.right : bones.left);
                skinWeight.push(1 - ON_THIGHS * 0.8, thighs * Math.max(left, 1 - left), shins * Math.max(left, 1 - left), (thighs + shins) * Math.min(left, 1 - left));
            }
        }
    });

    const index = [];

    for (let r = 0; r < rings.length - 1; r++) {
        for (let c = 0; c < columns - 1; c++) {
            const a = r * columns + c;
            const b = a + 1;

            index.push(a, b, a + columns, b, b + columns, a + columns);
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

const _hips = new THREE.Vector3();
const _knees = new THREE.Vector3();
const _from = new THREE.Vector3();
const _to = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _pelvis = new THREE.Quaternion();
const _back = new THREE.Quaternion();
const _turn = new THREE.Quaternion();
const _axis = new THREE.Vector3(1, 0, 0);
const _at = Array.from({ length: 8 }, () => new THREE.Vector3());
const _feet = Array.from({ length: 6 }, () => new THREE.Vector3());
const LEG_BONES = ["LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg", "LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase"];

// What of each leg keeps a drape's cloth off it, and how far (metres: its flesh and a boot's
// leather round where it's measured): the knee, halfway down the shin, the ankle, the back of the
// heel, and the tips of the toes
const CLEAR = { knee: 0.07, shin: 0.075, ankle: 0.06, heel: 0.035, toes: 0.035 };

// The furthest a drape's front or back swings to keep the legs in (radians from where it hangs;
// a thigh swings it as far as it goes)
const SWING = 1;

// How far forward a line from one point to another leans (radians, from straight down; in the
// pelvis's frame, `back` its turn undone), and how long it is in that plane (into `out`)
const lean = (from, to, back = null, out = null) => {
    _to.subVectors(to, from);

    if (back) {
        _to.applyQuaternion(back);
    }

    if (out) {
        out.length = Math.hypot(_to.y, _to.z);
    }

    return Math.atan2(_to.z, -_to.y);
};

/**
 * The skeleton a drape hangs from: the body's bones, and after them its own (DRAPE_BONES), swung
 * each time it's drawn (as three.js updates a skeleton before drawing what it moves) as the legs
 * are then. Its front's thigh is swung forward about the middle of the hips as far as the thigh
 * swung furthest forward from where it rests (in the pelvis's frame); its shin, from where that
 * puts the middle of the knees, hangs straight down unless a leg below the knee (halfway down its
 * shin, its ankle, heel or toes: CLEAR) would come out through the cloth's front (`profile`, from
 * buildDrape: where it is at the legs ring by ring, as it rests), when it's swung forward just as
 * far as keeps it in. Its back's the same, back. `swing()` does it without drawing.
 */
export function drapeSkeleton(rig, profile = []) {
    const own = DRAPE_BONES.map((name) => Object.assign(new THREE.Bone(), { name: `drape ${name}` }));
    const inverses = own.map(() => new THREE.Matrix4());
    const skeleton = new THREE.Skeleton([...rig.bones, ...own], [...rig.skeleton.boneInverses, ...inverses]);
    const legs = LEG_BONES.map((name) => rig.index.get(name));
    const hips = rig.index.get("Hips");
    const rest = legs.map((i) => rig.heads[i]);
    const middle = { hips: new THREE.Vector3().addVectors(rest[0], rest[1]).multiplyScalar(0.5), knees: new THREE.Vector3().addVectors(rest[2], rest[3]).multiplyScalar(0.5) };
    const scale = (rest[0].y - rest[4].y) / 0.85;

    // (Where the heels and toes' tips are, as they rest, from their bones)
    const heels = [0, 1].map((side) => new THREE.Vector3(rest[4 + side].x, rest[4 + side].y * 0.35, rest[4 + side].z - 0.07 * scale));
    const tips = [0, 1].map((side) => rig.tails[legs[6 + side]]);

    // The cloth's front (`way` 1) or back (-1) as it rests, `aside` metres to the side of the
    // middle: at what lean from `centre` (the middle of the hips or of the knees, as they rest) it
    // is `far` from it, below it (each ring's round as if it were an ellipse; null if it doesn't
    // reach that far round, or has no front or back there: an apron's)
    const clothAt = (way, aside, far, centre) => {
        let last = null;

        for (const ring of profile) {
            if (ring.y >= centre.y) {
                continue;
            }

            const reach = way > 0 ? ring.front : ring.back;
            const round = 1 - (aside / ring.wide) ** 2;

            if (reach < 0.02 || round <= 0) {
                return last?.angle ?? null;
            }

            const out = {};
            const angle = lean(centre, _to.set(0, ring.y, ring.middle + way * reach * Math.sqrt(round)), null, out);

            if (out.length >= far) {
                return last ? last.angle + ((angle - last.angle) * (far - last.far)) / (out.length - last.far) : angle;
            }

            last = { far: out.length, angle };
        }

        return last?.angle ?? null;
    };

    const update = skeleton.update.bind(skeleton);
    const measured = {};
    const keeping = [0, 1].flatMap((side) => [
        [_feet[side * 3], CLEAR.shin],
        [_at[4 + side], CLEAR.ankle],
        [_feet[side * 3 + 1], CLEAR.heel],
        [_feet[side * 3 + 2], CLEAR.toes],
    ]);

    // How far the cloth's front (`way` 1) or back must swing about `pivot` (where `centre` is as it
    // rests) to keep in each of the legs below it, the knees too (`knees`), each that far inside
    // it (CLEAR): the furthest (`pick`; forward or back, from where it hangs), or null if none's
    // in its reach
    const keep = (pivot, centre, pick, way, knees) => {
        let swung = null;

        for (const [point, clear] of knees ? [...keeping, [_at[2], CLEAR.knee], [_at[3], CLEAR.knee]] : keeping) {
            const angle = lean(pivot, point, _back, measured);
            const at = clothAt(way, Math.abs(_to.x) / _scale.x, measured.length / _scale.x, centre);

            // (Not what's above where it swings from, a heel kicked up behind: it hangs below)
            if (at !== null && measured.length > 1e-3 && Math.abs(angle) < Math.PI / 2) {
                swung = pick(swung ?? -way * Infinity, angle - at + (way * clear) / measured.length);
            }
        }

        return swung === null ? null : Math.max(-SWING, Math.min(SWING, swung));
    };

    skeleton.swing = () => {
        _hips.copy(middle.hips);
        _knees.copy(middle.knees);
        inverses[0].makeTranslation(-_hips.x, -_hips.y, -_hips.z);
        inverses[2].copy(inverses[0]);
        inverses[1].makeTranslation(-_knees.x, -_knees.y, -_knees.z);
        inverses[3].copy(inverses[1]);
        _knees.sub(_hips);

        // (Where they are, and which way the pelvis faces)
        legs.forEach((i, k) => _at[k].setFromMatrixPosition(rig.bones[i].matrixWorld));
        rig.bones[hips].matrixWorld.decompose(_from, _pelvis, _scale);
        _back.copy(_pelvis).invert();

        // What of the legs below the knees keeps the cloth off: halfway down each shin, its
        // ankle, heel and toes' tips
        for (const side of [0, 1]) {
            const foot = rig.bones[legs[4 + side]].matrixWorld;

            _feet[side * 3].lerpVectors(_at[2 + side], _at[4 + side], 0.5);
            _feet[side * 3 + 1].subVectors(heels[side], rest[4 + side]).applyMatrix4(foot);
            _feet[side * 3 + 2].subVectors(tips[side], rest[6 + side]).applyMatrix4(rig.bones[legs[6 + side]].matrixWorld);
        }

        // How far each thigh has swung forward from where it rests
        const thighs = [0, 1].map((side) => lean(_at[side], _at[2 + side], _back) - lean(rest[side], rest[2 + side]));

        _hips.addVectors(_at[0], _at[1]).multiplyScalar(0.5);

        for (const [thigh, shin, pick, way] of [[own[0], own[1], Math.max, 1], [own[2], own[3], Math.min, -1]]) {
            // (About the hips, as far as the thigh swung furthest that way, or further if the
            // legs need it to keep them in; then from where that puts the knees, straight down or
            // further if the legs below them need it)
            const swung = pick(...thighs, keep(_hips, middle.hips, pick, way, true) ?? -way * Infinity);

            _turn.setFromAxisAngle(_axis, -swung).premultiply(_pelvis);
            thigh.matrixWorld.compose(_hips, _turn, _scale);
            _from.copy(_knees).multiply(_scale).applyQuaternion(_turn).add(_hips);
            _turn.setFromAxisAngle(_axis, -pick(0, keep(_from, middle.knees, pick, way, false) ?? 0)).premultiply(_pelvis);
            shin.matrixWorld.compose(_from, _turn, _scale);
        }
    };

    skeleton.update = () => {
        skeleton.swing();
        update();
    };

    return skeleton;
}

/** A drape's material: its colour, shaded in its pleats, both sides of the cloth drawn. */
export function drapeMaterial(drape) {
    // (A cloak's colours are in its vertices)
    if (drape.cape) {
        return new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: drape.roughness, vertexColors: true, side: THREE.DoubleSide });
    }

    const material = drape.sheen
        ? new THREE.MeshPhysicalMaterial({ color: drape.colour, roughness: drape.roughness, sheen: 0.6, sheenColor: new THREE.Color(drape.colour).offsetHSL(0, -0.2, 0.12), sheenRoughness: 0.5 })
        : new THREE.MeshStandardMaterial({ color: drape.colour, roughness: drape.roughness });

    material.vertexColors = true;
    material.side = THREE.DoubleSide;

    return material;
}
