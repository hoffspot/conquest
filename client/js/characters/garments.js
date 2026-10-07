// Clothing and armour fitted to the body: shirts, trousers, boots, gloves, breastplates...
//
// A garment is a region of the body's own surface, grown outward into a shell. Its region is a
// function over the body ("inside" > 0), written with measurements that fit any body: how far
// down the arm (0 at the shoulder, 0.5 at the elbow, 1 at the wrist), down the leg, heights of
// the waist, hips and neck. The body's triangles are cut exactly along the region's edge (so hems
// are smooth, not jagged), pushed out along the body's normals by the garment's thickness (plus
// any looseness), smoothed (a breastplate is smoother than a shirt) and given a hem: a strip
// folding back to the skin, so the garment has visible thickness at its edges.
//
// Because every garment vertex comes from the body's surface, it inherits the body's skin
// weights and texture coordinates: it bends exactly like the skin, and it can be painted in the
// body's texture layout. The skin under an opaque garment is hidden (it can't show through, and
// it's not drawn), and so is any garment under another.

import * as THREE from "three";
import { faceFrame } from "./face.js";
import { LIVERIES } from "./liveries.js";
import { fbm, hash3, smoothstep } from "./noise.js";
import { allAtOnce } from "../core/steps.js";

const ARM = /^(Left|Right)(Arm|ForeArm)$/;
const HAND = /^(Left|Right)Hand/;
const LEG = /^(Left|Right)(UpLeg|Leg)$/;
const FOOT = /^(Left|Right)(Foot|ToeBase)$/;

/**
 * Measurements of the body at every vertex, for garments' regions: { region ("head", "torso",
 * "arm", "hand", "leg", "foot"), side (1 left, -1 right), arm and leg (fractions down the
 * limb), y, front (how far forward of the body's middle), face ([x, y, z] face coordinates) },
 * plus the landmarks' heights: { waist, hips, crotch, chest, armpit, neck }, and the neck's
 * radius (`neckRadius`).
 */
export function measureBody(character) {
    const { human, rig, positions } = character;
    const head = (name) => rig.heads[rig.index.get(name)];
    // (Half way up the neck, where MakeHuman's neck bone starts: up Vitruvian's, which starts at
    // the neck's foot)
    const neck = head("Neck").clone().lerp(head("Head"), human.landmarks?.neck ?? 0);
    const landmarks = {
        neck: neck.y,
        chest: head("Spine2").y,
        waist: head("Spine").y,
        hips: head("Hips").y,
        crotch: head("LeftUpLeg").y - 0.07 * (character.height / 1.7),
        armpit: head("LeftArm").y - 0.08 * (character.height / 1.7),
        neckZ: neck.z,
        ankle: head("LeftFoot").y,
        balls: [head("LeftToeBase"), head("RightToeBase")],
        height: character.height,
    };
    const face = faceFrame(human, positions);
    const chains = {};

    for (const side of ["Left", "Right"]) {
        chains[`arm${side}`] = [head(`${side}Arm`), head(`${side}ForeArm`), head(`${side}Hand`)];
        chains[`leg${side}`] = [head(`${side}UpLeg`), head(`${side}Leg`), head(`${side}Foot`)];
    }

    // How far along the foot, from the ankle (0) to the ball of the foot (1), level with the ground
    const feet = {};

    for (const side of ["Left", "Right"]) {
        const ankle = head(`${side}Foot`);
        const axis = head(`${side}ToeBase`).clone().sub(ankle).setY(0);
        const length = axis.length();

        axis.normalize();
        feet[side] = (point) => (point.x - ankle.x) * axis.x / length + (point.z - ankle.z) * axis.z / length;
    }

    const p = new THREE.Vector3();
    const along = (chain) => {
        // Fraction along a two-segment chain: 0 at its start, 0.5 at its joint, 1 at its end,
        // carrying on past either end
        const [a, b, c] = chain;
        const first = segment(p, a, b);
        const second = segment(p, b, c);

        return first.distance <= second.distance ? first.t * 0.5 : 0.5 + second.t * 0.5;
    };
    const vertices = [];

    for (let v = 0; v < human.vertexCount; v++) {
        p.fromArray(positions, v * 3);

        const name = human.bones[human.skinIndices[v * 4]].name;
        const side = p.x >= 0 ? "Left" : "Right";
        const region = name === "Head" ? "head" : HAND.test(name) ? "hand" : ARM.test(name) ? "arm" : LEG.test(name) ? "leg" : FOOT.test(name) ? "foot" : "torso";

        vertices.push({
            region,
            side: side === "Left" ? 1 : -1,
            arm: along(chains[`arm${side}`]),
            leg: along(chains[`leg${side}`]),
            foot: feet[side](p),
            x: p.x,
            y: p.y,
            z: p.z,
            face: face.toFace(p.x, p.y, p.z),
        });
    }

    // How far the neck's skin is from its middle, at the neck's height (the middle of its sides)
    const neckBone = human.bones.findIndex(({ name }) => name === "Neck");
    const round = vertices.flatMap(({ x, y, z }, v) => (human.partOf[v] === 0 && human.skinIndices[v * 4] === neckBone && Math.abs(y - neck.y) < 0.01 ? [Math.hypot(x, z - neck.z)] : [])).sort((a, b) => a - b);

    landmarks.neckRadius = round.length ? round[round.length >> 1] : 0.07 * (character.height / 1.7);

    return { vertices, landmarks };
}

/** Where a point is along a segment: t (0 at a, 1 at b, unclamped) and its distance from it. */
function segment(p, a, b) {
    const ab = b.clone().sub(a);
    const t = p.clone().sub(a).dot(ab) / ab.lengthSq();
    const closest = a.clone().addScaledVector(ab, Math.min(1, Math.max(0, t)));

    return { t, distance: p.distanceTo(closest) };
}

// --- Regions, for the garments below ---

const OUTSIDE = -1;

/**
 * Up to the neck: a round neckline, dipping at the front and rising over the shoulders, out past
 * the neck's sides (level, it cut across shoulders that rise to the neck, as Vitruvian's do, and
 * left their tops bare).
 */
const neckline = (v, l, depth = 0.03) => l.neck - depth - v.y - 0.035 * smoothstep(0, 0.12, v.z - l.neckZ) + 2 * Math.max(0, Math.abs(v.x) - l.neckRadius - depth / 2);

/** The torso from `bottom` up to the neckline, arms down to `sleeve` (0 none, 1 the wrist). */
function top(bottom, sleeve, neck = 0.03) {
    return (v, l) => {
        switch (v.region) {
            case "torso":
                return Math.min(v.y - bottom(l), neckline(v, l, neck));
            case "arm":
                return sleeve - v.arm;
            default:
                return OUTSIDE;
        }
    };
}

/** A band round the torso, from `bottom` up to `top`. */
function band(bottom, top) {
    return (v, l) => (v.region === "torso" ? Math.min(v.y - bottom(l), top(l) - v.y) : OUTSIDE);
}

/** From `waist` down the legs to `length` (0 the hip, 1 the ankle). */
function bottoms(waist, length) {
    return (v, l) => {
        switch (v.region) {
            case "torso":
                return waist(l) - v.y;
            case "leg":
                return length - v.leg;
            default:
                return OUTSIDE;
        }
    };
}

/**
 * Every garment: its slot, layer (under garments first), region, thickness and looseness (metres),
 * whether it lies over what's worn under it (`over`: a strap, grown out past it), smoothing, and
 * look (colour, roughness, metalness, a pattern painted in, a tiling detail); or, for lingerie,
 * the design it's cut from (DESIGNS), clear wherever that has no fabric.
 */
const MADE = {
    briefs: { label: "Briefs", slot: "underwear", layer: 0, thickness: 0.0015, smooth: 2, colour: "#d8d2c4", roughness: 0.8, pattern: "cloth", inside: bottoms((l) => l.hips + 0.02, 0.1) },
    // Round the bust, whatever its size: from a little under the fullest bust (which reaches two
    // thirds of the way down from the chest to the waist) to above the armpits, smoothed enough to
    // bridge between the breasts
    chestWrap: { label: "Chest wrap", slot: "undershirt", layer: 0, thickness: 0.0015, smooth: 6, colour: "#d8d2c4", roughness: 0.8, pattern: "cloth", inside: band((l) => l.chest - 0.75 * (l.chest - l.waist), (l) => l.armpit + 0.02) },
    shirt: { label: "Linen shirt", slot: "shirt", layer: 1, thickness: 0.004, loose: 0.006, smooth: 4, colour: "#cbbd9c", roughness: 0.85, pattern: "cloth", inside: top((l) => l.hips - 0.03, 0.97) },
    tunic: { label: "Tunic", slot: "shirt", layer: 1, thickness: 0.004, loose: 0.008, smooth: 4, colour: "#6f2f2a", roughness: 0.85, pattern: "trim", trim: "#c6a45a", inside: top((l) => l.hips - 0.06, 0.45) },
    trousers: { label: "Trousers", slot: "legs", layer: 1, thickness: 0.004, loose: 0.006, smooth: 4, colour: "#4a3f35", roughness: 0.9, pattern: "cloth", inside: bottoms((l) => l.waist - 0.02, 0.97) },
    breeches: { label: "Leather pants", slot: "legs", layer: 1, thickness: 0.005, loose: 0.004, smooth: 4, colour: "#5a3a24", roughness: 0.7, pattern: "leather", inside: bottoms((l) => l.waist - 0.02, 0.62) },
    jerkin: { label: "Leather jerkin", slot: "chest", layer: 2, thickness: 0.008, loose: 0.004, smooth: 6, colour: "#6b4428", roughness: 0.65, pattern: "leather", inside: top((l) => l.hips - 0.01, 0.12, 0.05) },
    gambeson: { label: "Gambeson", slot: "chest", layer: 2, thickness: 0.012, loose: 0.006, smooth: 6, colour: "#b3a47e", roughness: 0.9, pattern: "quilted", inside: top((l) => l.hips - 0.07, 0.9, 0.035) },
    mail: { label: "Mail shirt", slot: "chest", layer: 2, thickness: 0.007, loose: 0.004, smooth: 4, colour: "#9aa0a4", roughness: 0.45, metalness: 0.85, pattern: "mail", inside: top((l) => l.hips - 0.06, 0.4, 0.04) },
    breastplate: { label: "Breastplate", slot: "armour", layer: 3, thickness: 0.02, loose: 0.01, smooth: 14, colour: "#b8bec2", roughness: 0.28, metalness: 1, pattern: "plate", inside: top((l) => l.waist - 0.04, 0.02, 0.05) },
    bracers: { label: "Leather bracers", slot: "forearms", layer: 3, thickness: 0.009, smooth: 6, colour: "#5c3a22", roughness: 0.6, pattern: "leather", inside: (v) => (v.region === "arm" ? Math.min(v.arm - 0.64, 0.93 - v.arm) : OUTSIDE) },
    belt: { label: "Belt", slot: "waist", layer: 4, thickness: 0.012, smooth: 6, colour: "#3a2616", roughness: 0.55, pattern: "leather", inside: (v, l) => (v.region === "torso" ? Math.min(v.y - (l.waist - 0.07), l.waist - 0.025 - v.y) : OUTSIDE) },
    boots: { label: "Leather boots", slot: "feet", layer: 2, thickness: 0.007, smooth: 8, toeBox: true, colour: "#3b2a1c", roughness: 0.6, pattern: "leather", inside: (v) => (v.region === "foot" ? 1 : v.region === "leg" ? v.leg - 0.66 : OUTSIDE) },
    // (Spiked boots' leather: under the iron at their toes, heels and shins, equipment.js)
    spikedBootLeather: { label: "Spiked boots' leather", slot: "feet", layer: 2, thickness: 0.008, smooth: 8, toeBox: true, colour: "#3d291a", roughness: 0.68, pattern: "leather", hidden: true, inside: (v) => (v.region === "foot" ? 1 : v.region === "leg" ? v.leg - 0.6 : OUTSIDE) },
    sabatons: { label: "Plate boots", slot: "feet", layer: 2, thickness: 0.012, smooth: 10, toeBox: true, colour: "#a8aeb2", roughness: 0.3, metalness: 1, pattern: "plate", inside: (v) => (v.region === "foot" ? 1 : v.region === "leg" ? v.leg - 0.72 : OUTSIDE) },
    gloves: { label: "Gloves", slot: "hands", layer: 2, thickness: 0.002, smooth: 1, colour: "#4a3322", roughness: 0.6, pattern: "leather", inside: (v) => (v.region === "hand" ? 1 : v.region === "arm" ? v.arm - 0.9 : OUTSIDE) },
    gauntlets: { label: "Gauntlets", slot: "hands", layer: 2, thickness: 0.007, smooth: 2, colour: "#a8aeb2", roughness: 0.3, metalness: 1, pattern: "plate", inside: (v) => (v.region === "hand" ? 1 : v.region === "arm" ? v.arm - 0.8 : OUTSIDE) },
    greaves: { label: "Greaves", slot: "shins", layer: 3, thickness: 0.014, smooth: 8, colour: "#a8aeb2", roughness: 0.3, metalness: 1, pattern: "plate", inside: (v) => (v.region === "leg" ? Math.min(v.leg - 0.56, 0.86 - v.leg) : OUTSIDE) },
    // (A strap from the right shoulder across the chest and back to the left hip, for what's
    // carried on the back: equipment.js SHEATHS. Straps lie over what's worn under them)
    baldric: { label: "Baldric", slot: "straps", layer: 5, thickness: 0.01, over: true, smooth: 3, colour: "#3a2616", roughness: 0.6, pattern: "leather", hidden: true, inside: (v, l) => (v.region === "torso" ? Math.min(0.02 * (l.height / 1.7) - Math.abs(0.83 * (v.x - 0.015 * (l.height / 1.7)) + 0.56 * (v.y - (l.armpit + l.waist + 0.07 * (l.height / 1.7)) / 2)), v.y - (l.waist - 0.07)) : OUTSIDE) },
    straps: { label: "Pack straps", slot: "straps", layer: 5, thickness: 0.012, over: true, smooth: 3, colour: "#2e1d12", roughness: 0.6, pattern: "leather", hidden: true, inside: (v, l) => (v.region === "torso" ? Math.min(0.016 * (l.height / 1.7) - Math.abs(Math.abs(v.x) - 0.085 * (l.height / 1.7)), v.y - l.armpit + 0.04) : OUTSIDE) },
    loincloth: { label: "Loincloth", slot: "underwear", layer: 0, thickness: 0.003, smooth: 3, colour: "#5b4632", roughness: 0.9, pattern: "leather", inside: bottoms((l) => l.hips + 0.03, 0.2) },

    // The tavern's folk: a chemise with a low neck and short sleeves, and a bodice laced up the
    // front over it, from under the waist to over the bust; and tunics in other colours
    chemise: { label: "Chemise", slot: "shirt", layer: 1, thickness: 0.003, loose: 0.006, smooth: 4, colour: "#e6ddc8", roughness: 0.85, pattern: "cloth", inside: top((l) => l.hips - 0.03, 0.55, 0.075) },
    bodice: { label: "Laced bodice", slot: "chest", layer: 2, thickness: 0.006, loose: 0.002, smooth: 6, colour: "#8c2020", roughness: 0.7, pattern: "laced", trim: "#e2d3a8", inside: band((l) => l.waist - 0.07, (l) => l.chest + 0.02) },
    velvetBodice: { label: "Velvet bodice", slot: "chest", layer: 2, thickness: 0.006, loose: 0.002, smooth: 6, colour: "#1e1418", roughness: 0.5, pattern: "laced", trim: "#c9a24a", inside: band((l) => l.waist - 0.07, (l) => l.chest + 0.03) },
    greenTunic: { label: "Green tunic", slot: "shirt", layer: 1, thickness: 0.004, loose: 0.008, smooth: 4, colour: "#3d5733", roughness: 0.85, pattern: "trim", trim: "#b89a55", inside: top((l) => l.hips - 0.06, 0.45) },
    blueTunic: { label: "Blue tunic", slot: "shirt", layer: 1, thickness: 0.004, loose: 0.008, smooth: 4, colour: "#33456a", roughness: 0.85, pattern: "trim", trim: "#c8b27a", inside: top((l) => l.hips - 0.06, 0.45) },
    // The townsfolk's (core/townsfolk.js): homespun tunics, undyed and russet; a field hand's
    // linen smock, long and loose; a friar's brown habit (its skirt a drape: drapes.js)
    brownTunic: { label: "Brown tunic", slot: "shirt", layer: 1, thickness: 0.004, loose: 0.008, smooth: 4, colour: "#5b4430", roughness: 0.9, pattern: "trim", trim: "#8a7350", inside: top((l) => l.hips - 0.06, 0.45) },
    russetTunic: { label: "Russet tunic", slot: "shirt", layer: 1, thickness: 0.004, loose: 0.008, smooth: 4, colour: "#8a4a2c", roughness: 0.88, pattern: "trim", trim: "#c9a46a", inside: top((l) => l.hips - 0.06, 0.45) },
    smock: { label: "Linen smock", slot: "shirt", layer: 1, thickness: 0.004, loose: 0.012, smooth: 4, colour: "#d6cbb0", roughness: 0.9, pattern: "cloth", inside: top((l) => l.hips - 0.1, 0.97) },
    habit: { label: "Friar's habit", slot: "shirt", layer: 1, thickness: 0.005, loose: 0.012, smooth: 4, colour: "#5a4330", roughness: 0.95, pattern: "cloth", inside: top((l) => l.hips - 0.08, 0.97) },
    // A priest's vestments, white: an alb (a long-sleeved tunic, its skirt a drape: drapes.js) and
    // over it a chasuble, sleeveless and bordered in gold
    alb: { label: "Alb", slot: "shirt", layer: 1, thickness: 0.004, loose: 0.01, smooth: 4, colour: "#f1ede4", roughness: 0.9, pattern: "cloth", inside: top((l) => l.hips - 0.08, 0.97) },
    chasuble: { label: "Chasuble", slot: "chest", layer: 2, thickness: 0.005, loose: 0.012, smooth: 6, colour: "#f6f2ea", roughness: 0.8, pattern: "trim", trim: "#c9a24a", inside: top((l) => l.hips - 0.14, 0.06, 0.05) },
    // An adventurers' guild's uniform: a white blouse with long sleeves, and a navy vest laced up
    // the front, bordered in gold (its skirt a drape: drapes.js)
    guildBlouse: { label: "Guild blouse", slot: "shirt", layer: 1, thickness: 0.003, loose: 0.007, smooth: 4, colour: "#f4f1ea", roughness: 0.85, pattern: "cloth", inside: top((l) => l.hips - 0.03, 0.97, 0.04) },
    guildVest: { label: "Guild vest", slot: "chest", layer: 2, thickness: 0.006, loose: 0.002, smooth: 6, colour: "#23365e", roughness: 0.7, pattern: "laced", trim: "#d6b35a", inside: band((l) => l.waist - 0.07, (l) => l.chest + 0.03) },

    // Lingerie, for the ladies upstairs: modern lace with a nod to the period (a corset laced up
    // the front, ribbon bows, stockings with a seam up the back, a velvet choker). Each is cut
    // from its design (DESIGNS, below) rather than its region, which only needs to take it all in:
    // see-through lace, opaque only where it's lined (over the nipples and the groin) or a band
    // (straps, waistbands, ribbons, the corset)
    ...lingerie("Black", "#1c1519"),
    ...lingerie("Crimson", "#8a1426"),
    ...lingerie("Emerald", "#1f5e44"),
    ...lingerie("Ivory", "#eee4d2"),
    corset: { label: "Corset", slot: "chest", layer: 2, thickness: 0.006, smooth: 4, colour: "#7e1223", roughness: 0.45, design: "corset", inside: band((l) => l.hips - 0.04, (l) => l.chest + 0.02) },
    choker: { label: "Velvet choker", slot: "neck", layer: 1, thickness: 0.003, smooth: 2, colour: "#16101a", roughness: 0.7, design: "choker", inside: (v, l) => (v.region === "torso" || v.region === "head" ? 0.06 - Math.abs(v.y - l.neck) : OUTSIDE) },

    // Uniforms and livery (characters/liveries.js: each people's make of them, below): a surcoat,
    // sleeveless to the hips over the armour, trimmed at the neck and hem, the people's emblem
    // on the chest; plate vambraces; a tunic of livery with the emblem; a chain of office in gold,
    // over the shoulders and down the front
    surcoat: { label: "Surcoat", slot: "surcoat", layer: 4, thickness: 0.005, loose: 0.008, smooth: 6, colour: "#27407a", roughness: 0.82, pattern: "surcoat", trim: "#d9b44a", inside: top((l) => l.hips - 0.07, 0.02, 0.05) },
    vambraces: { label: "Vambraces", slot: "forearms", layer: 3, thickness: 0.011, smooth: 6, colour: "#a8aeb2", roughness: 0.3, metalness: 1, pattern: "plate", inside: (v) => (v.region === "arm" ? Math.min(v.arm - 0.62, 0.93 - v.arm) : OUTSIDE) },
    livery: { label: "Livery", slot: "shirt", layer: 1, thickness: 0.004, loose: 0.008, smooth: 4, colour: "#27407a", roughness: 0.85, pattern: "trim", trim: "#d9b44a", inside: top((l) => l.hips - 0.06, 0.95) },
    chain: {
        label: "Chain of office",
        slot: "neck",
        layer: 5,
        thickness: 0.018,
        smooth: 2,
        colour: "#d8b24a",
        roughness: 0.3,
        metalness: 1,
        pattern: "chain",
        inside: (v, l) => {
            if (v.region !== "torso") {
                return OUTSIDE;
            }

            // (A U down the front, from over each shoulder to the breastbone, its links a band
            // as wide however steep it runs; straight across the back)
            const s = l.height / 1.7;
            const reach = 0.11 * s;
            const drop = 0.2 * s;
            const x = Math.min(1, Math.abs(v.x) / reach);

            if (v.z <= 0) {
                return 0.011 * s - Math.abs(v.y - (l.neck - 0.035 * s));
            }

            const line = l.neck - 0.02 * s - drop * (1 - x * x);
            const slope = (2 * drop * x) / reach;

            return 0.011 * s - Math.abs(v.y - line) / Math.sqrt(1 + slope * slope);
        },
    },
};

/**
 * Each people's make of what their uniforms and livery are made of (characters/liveries.js),
 * `${id}.${people}`: in their colours and their metal; those that only differ in colour from the
 * garment they're made from (`base`) are drawn with its picture, tinted; a surcoat, a livery
 * tunic and the orcs' breastplate with the people's emblem painted on the chest (`emblem`).
 */
function liveried(made) {
    const garments = {};

    for (const [people, { main, trim, dark, metal, leather, emblem }] of Object.entries(LIVERIES)) {
        const tinted = (id, colour, change = {}) => {
            garments[`${id}.${people}`] = { ...made[id], colour, base: id, ...change };
        };
        const painted = (id, change) => {
            garments[`${id}.${people}`] = { ...made[id], ...change };
        };

        tinted("mail", metal);
        tinted("gambeson", people === "lizard" ? "#e6dcc2" : main);
        tinted("vambraces", metal);
        tinted("gauntlets", metal);
        tinted("greaves", metal);
        tinted("sabatons", metal);
        tinted("trousers", dark);
        // (A belt over the surcoat, the chain of office over the livery: further out than either)
        tinted("belt", leather, { layer: 5, thickness: 0.018 });
        painted("surcoat", { colour: main, trim, emblem: { mark: emblem, colour: trim } });
        painted("livery", { colour: main, trim, emblem: { mark: emblem, colour: trim, size: 0.055 } });

        // (The orcs' lacquered red, their claws on it in black)
        if (people === "orc") {
            painted("breastplate", { colour: main, metalness: 0.45, roughness: 0.4, emblem: { mark: emblem, colour: trim } });
        } else {
            tinted("breastplate", metal);
        }
    }

    return garments;
}

export const GARMENTS = Object.freeze({ ...MADE, ...liveried(MADE) });

/**
 * One colour of lingerie: a lace bra, briefs, a suspender belt and stockings, named for it
 * ("laceBraBlack"...); black also has fishnet stockings.
 */
function lingerie(name, colour) {
    const pieces = {
        [`laceBra${name}`]: { label: `${name} lace bra`, slot: "undershirt", layer: 0, thickness: 0.002, smooth: 2, design: "bra", inside: top((l) => l.waist + 0.02, 0.08, -0.03) },
        [`laceBriefs${name}`]: { label: `${name} lace briefs`, slot: "underwear", layer: 0, thickness: 0.002, smooth: 2, design: "briefs", inside: bottoms((l) => l.hips + 0.03, 0.22) },
        [`suspenders${name}`]: { label: `${name} suspender belt`, slot: "waist", layer: 1, thickness: 0.0025, smooth: 2, design: "suspenders", inside: bottoms((l) => l.waist, 0.5) },
        [`stockings${name}`]: { label: `${name} stockings`, slot: "legs", layer: 0, thickness: 0.0012, smooth: 1, design: "stockings", inside: (v) => (v.region === "foot" ? 1 : v.region === "leg" ? v.leg - 0.12 : OUTSIDE) },
    };

    if (name === "Black") {
        pieces.fishnets = { label: "Fishnet stockings", slot: "legs", layer: 0, thickness: 0.0012, smooth: 1, design: "fishnets", inside: (v) => (v.region === "foot" ? 1 : v.region === "leg" ? v.leg - 0.12 : OUTSIDE) };
    }

    for (const piece of Object.values(pieces)) {
        piece.colour = colour;
        piece.roughness = 0.55;
    }

    return pieces;
}

// Each garment's cut (cutOf), for the measures it was cut for: made once for each, as garments
// drawn all at once are all fitted to the same measures (Character `merge`); the most recently
// wanted kept, this many for each measures (a few hundred kilobytes each)
const cutsByMeasures = new WeakMap();
const CUTS_KEPT = 40;

/**
 * What a garment is on the body, whatever the body's own shape (its positions): the body's
 * triangles it takes in, cut along the edge of its region; which of its points are one; what's
 * beside what, its edge and where its hem goes; its texture coordinates and skin weights; and the
 * body triangles it hides. Or null, where it takes in none. The same for everyone measured the
 * same (`measures`: measureBody's), so kept for each measures, and not to be changed.
 */
function cutOf(human, id, measures) {
    if (!cutsByMeasures.has(measures)) {
        cutsByMeasures.set(measures, new Map());
    }

    const cuts = cutsByMeasures.get(measures);
    const cut = cuts.has(id) ? cuts.get(id) : cutGarment(human, GARMENTS[id], measures);

    // (The most recently wanted last, and the longest unwanted let go)
    cuts.delete(id);
    cuts.set(id, cut);

    if (cuts.size > CUTS_KEPT) {
        cuts.delete(cuts.keys().next().value);
    }

    return cut;
}

function cutGarment(human, garment, measures) {
    const { vertices } = measures;
    const inside = insideOf(human, garment, measures);
    const body = human.renderIndices("body");
    const source = human.renderSource;
    const covers = new Set();

    // A garment cut from a design covers only where its fabric is opaque
    const solid = garment.design ? designSolid(human, garment.design) : null;

    // (the toes under a toe box aren't drawn)
    if (garment.toeBox) {
        for (let t = 0; t < body.length; t += 3) {
            if ([body[t], body[t + 1], body[t + 2]].some((r) => vertices[source[r]].region === "foot" && vertices[source[r]].foot > TOE_CUT - 0.05)) {
                covers.add(t / 3);
            }
        }
    }

    // Cut the body's triangles along the region's edge. Vertices are either the body's (by render
    // vertex) or new ones on its edges (by the two render vertices and where along)
    const points = new Map(); // key -> index into the lists below
    const list = [];
    const triangles = [];
    const sources = []; // the body triangle each triangle comes from
    const point = (a, b = a, t = 0) => {
        const key = a === b ? `${a}` : a < b ? `${a}:${b}` : `${b}:${a}`;

        if (!points.has(key)) {
            points.set(key, list.length);
            list.push(a < b || a === b ? { a, b, t } : { a: b, b: a, t: 1 - t });
        }

        return points.get(key);
    };

    for (let t = 0; t < body.length; t += 3) {
        const corners = [body[t], body[t + 1], body[t + 2]];
        const values = corners.map((r) => inside[source[r]]);
        const kept = values.filter((value) => value > 0).length;

        if (kept === 0) {
            continue;
        }

        if (kept === 3) {
            if (!solid || corners.every((r) => solid[source[r]])) {
                covers.add(t / 3);
            }

            triangles.push(point(corners[0]), point(corners[1]), point(corners[2]));
            sources.push(t / 3);
            continue;
        }

        // Clip the triangle to the inside (Sutherland-Hodgman against one edge)
        const polygon = [];

        for (let k = 0; k < 3; k++) {
            const a = corners[k];
            const b = corners[(k + 1) % 3];
            const va = values[k];
            const vb = values[(k + 1) % 3];

            if (va > 0) {
                polygon.push(point(a));
            }

            if ((va > 0) !== (vb > 0)) {
                polygon.push(point(a, b, va / (va - vb)));
            }
        }

        for (let k = 1; k < polygon.length - 1; k++) {
            triangles.push(polygon[0], polygon[k], polygon[k + 1]);
            sources.push(t / 3);
        }
    }

    if (!triangles.length) {
        return null;
    }

    // Shared positions: vertices on the same body vertex (or the same point on the same edge)
    // are one point, whatever their texture coordinates, so smoothing and hems ignore UV seams
    const shared = new Map();
    const sharedOf = list.map(({ a, b, t }) => {
        const sa = source[a];
        const sb = source[b];
        const key = sa === sb || t === 0 ? `${sa}` : t === 1 ? `${sb}` : sa < sb ? `${sa}:${sb}:${t.toFixed(4)}` : `${sb}:${sa}:${(1 - t).toFixed(4)}`;

        if (!shared.has(key)) {
            shared.set(key, shared.size);
        }

        return shared.get(key);
    });
    const count = shared.size;
    const onEdge = new Uint8Array(count);

    list.forEach(({ t }, i) => {
        if (t > 0 && t < 1) {
            onEdge[sharedOf[i]] = 1;
        }
    });

    // Neighbours and the garment's edge (sides used by one triangle only)
    const neighbours = Array.from({ length: count }, () => new Set());
    const sides = new Map();

    for (let t = 0; t < triangles.length; t += 3) {
        for (let k = 0; k < 3; k++) {
            const a = sharedOf[triangles[t + k]];
            const b = sharedOf[triangles[t + ((k + 1) % 3)]];

            neighbours[a].add(b);
            neighbours[b].add(a);

            const key = a < b ? `${a}:${b}` : `${b}:${a}`;

            sides.set(key, (sides.get(key) ?? 0) + 1);
        }
    }

    for (const [key, uses] of sides) {
        if (uses === 1) {
            const [a, b] = key.split(":").map(Number);

            onEdge[a] = onEdge[b] = 1;
        }
    }

    // Points on the toe box cut (where the toe box joins on, with no hem)
    const onCut = new Uint8Array(count);

    if (garment.toeBox) {
        list.forEach(({ a, b, t }, i) => {
            const va = vertices[source[a]];
            const vb = vertices[source[b]];

            if (va.region === "foot" && vb.region === "foot" && Math.abs(va.foot * (1 - t) + vb.foot * t - TOE_CUT) < 1e-4) {
                onCut[sharedOf[i]] = 1;
            }
        });
    }

    // The hem's sides: each edge side (not on the toe box cut), as [i, j] (the triangle's
    // vertices, in its winding) and the triangle it's of
    const hem = [];

    for (let t = 0; t < triangles.length; t += 3) {
        for (let k = 0; k < 3; k++) {
            const i = triangles[t + k];
            const j = triangles[t + ((k + 1) % 3)];
            const a = sharedOf[i];
            const b = sharedOf[j];
            const key = a < b ? `${a}:${b}` : `${b}:${a}`;

            if (sides.get(key) === 1 && !(onCut[a] && onCut[b])) {
                hem.push(i, j, t / 3);
            }
        }
    }

    // Each vertex's texture coordinates and skin weights
    const size = list.length;
    const uvs = new Float64Array(size * 2);
    const skinIndices = new Uint8Array(size * 4);
    const skinWeights = new Uint8Array(size * 4);

    list.forEach(({ a, b, t }, i) => {
        const [indices, weights] = mixSkin(human, source[a], source[b], t);

        uvs[i * 2] = human.uvs[a * 2] * (1 - t) + human.uvs[b * 2] * t;
        uvs[i * 2 + 1] = human.uvs[a * 2 + 1] * (1 - t) + human.uvs[b * 2 + 1] * t;
        skinIndices.set(indices, i * 4);
        skinWeights.set(weights, i * 4);
    });

    // (Kept compact, in typed arrays: the neighbours a list for each point, in one list, from
    // where each starts; the edge's sides as pairs of points)
    const near = { start: new Int32Array(count + 1), list: new Int32Array(neighbours.reduce((sum, set) => sum + set.size, 0)) };

    neighbours.forEach((set, n) => {
        near.start[n + 1] = near.start[n] + set.size;
        near.list.set([...set], near.start[n]);
    });

    const edge = Int32Array.from([...sides].filter(([, uses]) => uses === 1).flatMap(([key]) => key.split(":").map(Number)));

    return {
        size,
        from: Int32Array.from(list, ({ a }) => a),
        to: Int32Array.from(list, ({ b }) => b),
        along: Float64Array.from(list, ({ t }) => t),
        triangles: Int32Array.from(triangles),
        sources: Int32Array.from(sources),
        covers: Int32Array.from(covers),
        sharedOf: Int32Array.from(sharedOf),
        count,
        onEdge,
        near,
        edge,
        onCut,
        hem: Int32Array.from(hem),
        uvs,
        skinIndices,
        skinWeights,
    };
}

/**
 * Build a garment on a character: { geometry, covers (the body triangles it hides, a Set of
 * body triangle numbers), sources (the body triangle each of its triangles
 * comes from), garment }. `measures` is measureBody(character). (Its cut is the same for everyone
 * measured the same: cutOf.) One that lies over what's worn under it (`over`) is grown out past
 * that too: `under`, how far it reaches at each of the body's vertices (underneath).
 */
export function buildGarment(character, id, measures, under = null) {
    return allAtOnce(fittingGarment(character, id, measures, under));
}

/**
 * How far out the garments worn under one that lies over them (`over`: a strap) reach at each
 * of the body's vertices (metres): the furthest of those on lower layers whose region it's in.
 * A step (a yield) for each of them, returning it. (A strap at its own thickness was under a
 * jerkin, which stands further out: only its middle showed, its edges bitten into)
 */
export function* underneath(human, id, worn, measures) {
    const { layer } = GARMENTS[id];
    const under = new Float32Array(human.vertexCount);

    for (const other of worn) {
        const garment = GARMENTS[other];

        if (!garment || garment.layer >= layer) {
            continue;
        }

        const reach = garment.thickness + (garment.loose ?? 0);
        const inside = insideOf(human, garment, measures);

        for (let v = 0; v < human.vertexCount; v++) {
            if (inside[v] > 0 && reach > under[v]) {
                under[v] = reach;
            }
        }

        yield;
    }

    return under;
}

/** The same (buildGarment), a step at a time (each a yield: its shell, each toe box, its mesh), returning it. */
export function* fittingGarment(character, id, measures, under = null) {
    const garment = GARMENTS[id];
    const { human, positions, normals } = character;
    const { vertices } = measures;
    const cut = cutOf(human, id, measures);

    if (!cut) {
        return null;
    }

    const { size, from, to, along, triangles, covers, sharedOf, count, onEdge, near, edge, onCut, hem } = cut;
    const source = human.renderSource;
    const sources = Array.from(cut.sources);
    const base = new Float32Array(count * 3);
    const normal = new Float32Array(count * 3);
    // (How far out it's grown at each point: its thickness, and for one over others, how far
    // they reach there)
    const thickness = garment.thickness + (garment.loose ?? 0);
    const grown = new Float32Array(count).fill(thickness);

    for (let i = 0; i < size; i++) {
        const s = sharedOf[i];
        const sa = source[from[i]] * 3;
        const sb = source[to[i]] * 3;
        const t = along[i];

        for (let k = 0; k < 3; k++) {
            base[s * 3 + k] = positions[sa + k] * (1 - t) + positions[sb + k] * t;
            normal[s * 3 + k] = normals[sa + k] * (1 - t) + normals[sb + k] * t;
        }

        if (garment.over && under) {
            grown[s] = thickness + under[sa / 3] * (1 - t) + under[sb / 3] * t;
        }
    }

    for (let s = 0; s < count; s++) {
        const length = Math.hypot(normal[s * 3], normal[s * 3 + 1], normal[s * 3 + 2]) || 1;

        normal[s * 3] /= length;
        normal[s * 3 + 1] /= length;
        normal[s * 3 + 2] /= length;
    }

    // Grow outward, then smooth, keeping at least most of the thickness everywhere
    const shell = new Float32Array(count * 3);

    for (let j = 0; j < count * 3; j++) {
        shell[j] = base[j] + normal[j] * grown[Math.floor(j / 3)];
    }

    const smoothPasses = (passes, keepOut, only = null) => {
        for (let pass = 0; pass < passes; pass++) {
            const next = shell.slice();

            for (let s = 0; s < count; s++) {
                const [first, end] = [near.start[s], near.start[s + 1]];

                if (onEdge[s] || first === end || (only && !only.has(s))) {
                    continue;
                }

                for (let k = 0; k < 3; k++) {
                    let sum = 0;

                    for (let m = first; m < end; m++) {
                        sum += shell[near.list[m] * 3 + k];
                    }

                    next[s * 3 + k] = shell[s * 3 + k] * 0.4 + (sum / (end - first)) * 0.6;
                }

                if (!keepOut) {
                    continue;
                }

                // Not closer to the skin than 70% of how far it's grown
                const now = (next[s * 3] - base[s * 3]) * normal[s * 3] + (next[s * 3 + 1] - base[s * 3 + 1]) * normal[s * 3 + 1] + (next[s * 3 + 2] - base[s * 3 + 2]) * normal[s * 3 + 2];

                if (now < grown[s] * 0.7) {
                    for (let k = 0; k < 3; k++) {
                        next[s * 3 + k] += normal[s * 3 + k] * (grown[s] * 0.7 - now);
                    }
                }
            }

            shell.set(next);
        }
    };

    // The cut round each foot is the boot's edge, so the smoothing below keeps it where it is:
    // it's put onto a smooth outline first, for the boot and its toe box to carry on from
    const cuts = {};

    if (garment.toeBox) {
        for (const side of [1, -1]) {
            const loop = cutLoop(edge, onCut, shell, side);

            if (loop) {
                cuts[side] = { loop, fractions: roundOffCut(loop, shell) };
            }
        }
    }

    smoothPasses(garment.smooth ?? 0, true);
    yield;

    // The mesh: the shell, then a hem folding back to the skin along the garment's edge
    const out = {
        positions: [],
        uvs: [],
        skinIndices: [],
        skinWeights: [],
        indices: [],
    };

    for (let i = 0; i < size; i++) {
        const s = sharedOf[i];

        out.positions.push(shell[s * 3], shell[s * 3 + 1], shell[s * 3 + 2]);
    }

    out.uvs.push(...cut.uvs);
    out.skinIndices.push(...cut.skinIndices);
    out.skinWeights.push(...cut.skinWeights);
    out.indices.push(...triangles);

    // Hem: for each edge side, a strip from the shell back down to near the skin
    const hemDepth = Math.max(0.0015, thickness * 0.85);

    for (let h = 0; h < hem.length; h += 3) {
        const [i, j, t] = [hem[h], hem[h + 1], hem[h + 2]];
        const first = out.positions.length / 3;

        for (const [index, s] of [[i, sharedOf[i]], [j, sharedOf[j]]]) {
            for (let k2 = 0; k2 < 3; k2++) {
                out.positions.push(shell[s * 3 + k2] - normal[s * 3 + k2] * hemDepth);
            }

            out.uvs.push(out.uvs[index * 2], out.uvs[index * 2 + 1]);
            out.skinIndices.push(...out.skinIndices.slice(index * 4, index * 4 + 4));
            out.skinWeights.push(...out.skinWeights.slice(index * 4, index * 4 + 4));
        }

        // The triangle runs i -> j, so its outside is to the right: keep the same winding
        out.indices.push(j, i, first, j, first, first + 1);
        sources.push(sources[t], sources[t]);
    }

    if (garment.toeBox) {
        const cap = { shell, sharedOf, onCut, out, sources, human, positions, normals, vertices, thickness, triangles };

        for (const side of [1, -1]) {
            if (cuts[side]) {
                yield;
                addToeCap(cap, cuts[side], side);
            }
        }

        yield;
    }

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute("position", new THREE.Float32BufferAttribute(out.positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(out.uvs, 2));
    geometry.setAttribute("skinIndex", new THREE.BufferAttribute(new Uint8Array(out.skinIndices), 4));
    geometry.setAttribute("skinWeight", new THREE.BufferAttribute(new Uint8Array(out.skinWeights), 4, true));
    geometry.setIndex(out.positions.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(out.indices, 1) : new THREE.Uint16BufferAttribute(out.indices, 1));
    geometry.computeVertexNormals();
    // Hem and toe cap vertices keep their own normals
    smoothNormalsAcrossSeams(geometry, [...sharedOf, ...new Array(out.positions.length / 3 - size).fill(-1)]);

    if (garment.toeBox) {
        joinToeCaps(geometry, out.capJoins ?? []);
    }

    return { geometry, covers: new Set(covers), sources: Int32Array.from(sources), garment };
}

// Footwear with a toe box is cut this far along the foot (1 is the ball of the foot)
const TOE_CUT = 0.85;

/**
 * How far inside a garment's region each of the body's vertices is (above 0 inside it; along
 * any edge between two, where it crosses 0 is where the garment's edge is). Footwear with a toe
 * box stops at the ball of the foot (the toe box is built separately), unless `toes`.
 */
export function insideOf(human, garment, { vertices, landmarks }, { toes = false } = {}) {
    const inside = new Float32Array(human.vertexCount);
    const cut = (v) => (garment.toeBox && !toes && vertices[v].region === "foot" ? Math.min(1, TOE_CUT - vertices[v].foot) : 1);

    for (let v = 0; v < human.vertexCount; v++) {
        inside[v] = human.partOf[v] === 0 ? Math.min(garment.inside(vertices[v], landmarks), cut(v)) : OUTSIDE;
    }

    return inside;
}

/**
 * A toe box for one foot (side 1 left, -1 right): a smooth cap lofted forward from where the
 * boot was cut near the ball of the foot (`loop`, in order round it), keeping the cut's outline
 * but as wide and tall as all the toes together, and rounded off in front of them like a dome.
 * The toes under it aren't drawn, so it needn't follow each one. It's skinned from the foot to
 * the toes, so it bends with them.
 */
function addToeCap(cap, { loop, fractions }, side) {
    const { shell, sharedOf, onCut, out, sources, human, positions, normals, vertices, thickness, triangles } = cap;
    const RINGS = 20;

    // Which of the boot's vertices each stretch of the cut uses at its ends. Where the cut
    // crosses a texture seam, the boot has two vertices at one point, one either side; the cap
    // has a column for each, so its texture carries on from both
    const n = loop.length;
    const edges = new Map();

    for (let t = 0; t < triangles.length; t += 3) {
        for (let k = 0; k < 3; k++) {
            const i = triangles[t + k];
            const j = triangles[t + ((k + 1) % 3)];

            if (onCut[sharedOf[i]] && onCut[sharedOf[j]]) {
                edges.set(`${sharedOf[i]}:${sharedOf[j]}`, [i, j]);
                edges.set(`${sharedOf[j]}:${sharedOf[i]}`, [j, i]);
            }
        }
    }

    const leaving = [];
    const arriving = [];

    for (let i = 0; i < n; i++) {
        const [from, to] = edges.get(`${loop[i]}:${loop[(i + 1) % n]}`);

        leaving[i] = from;
        arriving[(i + 1) % n] = to;
    }

    const columns = [];
    const columnOf = new Map();

    for (let i = 0; i < n; i++) {
        for (const from of new Set([arriving[i], leaving[i]])) {
            columnOf.set(from, columns.length);
            columns.push({ i, from });
        }
    }

    // The toes, grown by the boot's thickness (with the render vertex each is from, which knows
    // where it is in the texture)
    const toes = [];
    const seen = new Set();

    for (const r of human.renderIndices("body")) {
        const v = human.renderSource[r];
        const vertex = vertices[v];

        if (!seen.has(r) && vertex.region === "foot" && vertex.side === side && vertex.foot > TOE_CUT - 0.02) {
            seen.add(r);
            toes.push(Object.assign([0, 1, 2].map((k) => positions[v * 3 + k] + normals[v * 3 + k] * thickness), { r }));
        }
    }

    const at = (s) => [shell[s * 3], shell[s * 3 + 1], shell[s * 3 + 2]];
    const loopPoints = loop.map(at);
    const loopCentre = [0, 1, 2].map((k) => loopPoints.reduce((sum, p) => sum + p[k], 0) / loopPoints.length);
    const z0 = loopCentre[2];
    const tip = Math.max(...toes.map((p) => p[2])) + thickness * 0.3;

    // Rings run evenly to the start of the nose, then round it off like a dome: their spacing
    // follows a quarter circle, and they shrink with it to a point
    const NOSE_START = 0.55;
    const noseLength = Math.min(0.02, 0.25 * (tip - z0));
    const place = (j) => {
        const t = j / RINGS;

        if (t <= NOSE_START) {
            return { z: z0 + (t / NOSE_START) * (tip - noseLength - z0), nose: 1 };
        }

        const angle = ((t - NOSE_START) / (1 - NOSE_START)) * (Math.PI / 2);

        return { z: tip - noseLength + noseLength * Math.sin(angle), nose: Math.cos(angle) };
    };

    // Each ring wraps the toes near it tightly (their convex hull, as they're grown by the
    // boot's thickness already), smoothed, so the cap follows the toes as a whole, down to the
    // shortest, not each toe. Columns go round each ring as far as they are round the cut, both
    // measured from straight above their middles, so they stay in order however the rings differ
    const places = Array.from({ length: RINGS }, (_, j) => place(j + 1));
    const columnFractions = columns.map(({ i }) => fractions[i]);
    const flat = loopPoints.map(([x, y]) => [x, y]);
    const sections = [];

    for (const { z, nose } of places) {
        const near = nose < 1 ? [] : toes.filter((p) => Math.abs(p[2] - z) < (tip - z0) / RINGS);
        const hull = near.length >= 3 ? convexHull(near.map(([x, y]) => [x, y])) : [];

        if (nose < 1 || hull.length < 3) {
            sections.push(sections[sections.length - 1] ?? columns.map(({ i }) => flat[i]));
            continue;
        }

        const outline = outlineOf(hull, 6);

        sections.push(columnFractions.map((f) => outline(f)));
    }

    // Smoothed along the foot from the cut, so it tapers evenly; the nose shrinks the last ring
    // before it to its middle, like a dome
    const body = places.filter(({ nose }) => nose === 1).length;
    let smoothed = sections.slice(0, body);

    for (let pass = 0; pass < 3; pass++) {
        smoothed = smoothed.map((section, j) => section.map((point, c) => {
            const around = [smoothed[j - 1]?.[c] ?? flat[columns[c].i], point, smoothed[j + 1]?.[c]].filter(Boolean);

            return [0, 1].map((k) => around.reduce((sum, other) => sum + other[k], 0) / around.length);
        }));
    }

    const last = smoothed[body - 1];
    const xs = last.map(([x]) => x);
    const ys = last.map(([, y]) => y);
    const middle = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
    const rings = places.map(({ z, nose }, j) => ({
        z,
        blend: smoothstep(0, 0.35, (j + 1) / RINGS),
        points: j < body ? smoothed[j] : last.map((point) => [0, 1].map((k) => middle[k] + (point[k] - middle[k]) * nose)),
    }));

    // Texture: from the boot's at the cut, each column slides along the cap to the middle of the
    // toes' part of the texture (the garment's pattern is painted there too), so it fans in as
    // the cap narrows to its nose. The toes' part is in one piece that far in from the cut, so
    // it never reaches the empty texture between the toes
    const uvOf = (i) => [out.uvs[i * 2], out.uvs[i * 2 + 1]];
    const toesUV = [0, 1].map((k) => toes.reduce((sum, { r }) => sum + human.uvs[r * 2 + k], 0) / toes.length);

    // Vertices: the boot's own along the cut, then each ring, column by column
    const firstRing = out.positions.length / 3;
    const toeBone = human.boneIndex.get(side > 0 ? "LeftToeBase" : "RightToeBase");
    const addVertex = (position, uv, skinFrom, towardToes) => {
        out.positions.push(...position);
        out.uvs.push(...uv);

        // From the foot's weights at the cut to the toe bone at the front
        const weights = new Map();

        for (let k = 0; k < 4; k++) {
            const bone = out.skinIndices[skinFrom * 4 + k];
            const weight = out.skinWeights[skinFrom * 4 + k] / 255;

            if (weight) {
                weights.set(bone, (weights.get(bone) ?? 0) + weight * (1 - towardToes));
            }
        }

        weights.set(toeBone, (weights.get(toeBone) ?? 0) + towardToes);

        const strongest = [...weights].sort((x, y) => y[1] - x[1]).slice(0, 4);
        const bytes = strongest.map(([, w]) => Math.round(w * 255));

        bytes[0] += 255 - bytes.reduce((sum, w) => sum + w, 0);

        while (strongest.length < 4) {
            strongest.push([0, 0]);
            bytes.push(0);
        }

        out.skinIndices.push(...strongest.map(([bone]) => bone));
        out.skinWeights.push(...bytes);
    };

    // The boot's slope at each point of the cut (sideways and up, for each step forward), for the
    // cap to set off along so there's no crease where they join: from the boot 1 to 3 cm behind
    // it, the same way round the foot (from the point's own neighbours, a column set off 2 cm out
    // past the little toe where they lay more to its side than behind it)
    const around = (x, y) => Math.atan2(y - loopCentre[1], x - loopCentre[0]);
    const boot = [];

    for (let s = 0; s < shell.length / 3; s++) {
        const dz = z0 - shell[s * 3 + 2];

        if (!onCut[s] && Math.sign(shell[s * 3]) === side && dz > 0 && dz < 0.06) {
            boot.push(s);
        }
    }

    let slopes = loopPoints.map((p) => {
        const way = around(p[0], p[1]);
        let behind = -1;
        let nearest = Infinity;

        for (const s of boot) {
            const dz = p[2] - shell[s * 3 + 2];
            const turn = Math.abs(Math.atan2(Math.sin(around(shell[s * 3], shell[s * 3 + 1]) - way), Math.cos(around(shell[s * 3], shell[s * 3 + 1]) - way)));

            if (dz >= 0.01 && dz <= 0.03 && turn < nearest) {
                behind = s;
                nearest = turn;
            }
        }

        return behind >= 0 ? [0, 1, 2].map((k) => p[k] - shell[behind * 3 + k]) : [0, 0, 1];
    });

    for (let pass = 0; pass < 3; pass++) {
        slopes = slopes.map((slope, i) => [0, 1, 2].map((k) => slope[k] * 0.5 + (slopes[(i + 1) % n][k] + slopes[(i + n - 1) % n][k]) * 0.25));
    }

    slopes = slopes.map(([x, y, z]) => {
        const forward = Math.max(z, 0.3 * Math.hypot(x, y, z), 1e-6);

        return [Math.max(-1.5, Math.min(1.5, x / forward)), Math.max(-1.5, Math.min(1.5, y / forward))];
    });

    // Each column starts from its own point on the cut (the foot turns out a little, so the cut
    // isn't square to the rings) and heads the way the boot was going, easing into its ring
    rings.forEach((ring, j) => {
        const t = (j + 1) / RINGS;
        const along = (ring.z - z0) / (tip - z0);

        columns.forEach(({ i, from }, c) => {
            const p = loopPoints[i];
            const [x, y] = ring.points[c];
            const [u, v] = uvOf(from);
            const z = ring.z + (p[2] - z0) * (1 - ring.blend);
            const carried = [p[0] + slopes[i][0] * (z - p[2]), p[1] + slopes[i][1] * (z - p[2])];
            const position = [carried[0] + (x - carried[0]) * ring.blend, carried[1] + (y - carried[1]) * ring.blend, z];

            addVertex(position, [u + (toesUV[0] - u) * along, v + (toesUV[1] - v) * along], from, smoothstep(0.1, 0.6, t));
        });
    });

    // Triangles, facing out (checked on the first quad, flipped if needed). The last ring is
    // the point of the nose
    const count = columns.length;
    const vertex = (j, c) => (j < 0 ? columns[c].from : firstRing + j * count + c);
    const faces = [];

    for (let j = -1; j < RINGS - 1; j++) {
        for (let i = 0; i < n; i++) {
            const a = columnOf.get(leaving[i]);
            const b = columnOf.get(arriving[(i + 1) % n]);

            faces.push(vertex(j, a), vertex(j, b), vertex(j + 1, b), vertex(j, a), vertex(j + 1, b), vertex(j + 1, a));
        }
    }

    const position = (index) => out.positions.slice(index * 3, index * 3 + 3);
    const [a, b, c] = [position(faces[0]), position(faces[1]), position(faces[2])];
    const normal = [
        (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]),
        (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]),
        (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]),
    ];
    const outward = [a[0] - loopCentre[0], a[1] - loopCentre[1], 0];

    if (normal[0] * outward[0] + normal[1] * outward[1] + normal[2] * outward[2] < 0) {
        for (let k = 0; k < faces.length; k += 3) {
            [faces[k + 1], faces[k + 2]] = [faces[k + 2], faces[k + 1]];
        }
    }

    out.indices.push(...faces);

    for (let k = 0; k < faces.length / 3; k++) {
        sources.push(-1);
    }

    // Normals are shared later wherever the cap has more than one vertex at a point: the boot's
    // along the cut, the two columns at a texture seam, and the point of the nose
    out.capJoins ??= [];
    out.capJoins.push(...columns.map(({ from }) => from));

    for (let k = firstRing; k < out.positions.length / 3; k++) {
        out.capJoins.push(k);
    }
}

/** The toe box cut round one foot (side 1 left, -1 right): its shared points in order, or null. */
function cutLoop(edge, onCut, shell, side) {
    const next = new Map();

    for (let e = 0; e < edge.length; e += 2) {
        const [a, b] = [edge[e], edge[e + 1]];

        if (onCut[a] && onCut[b] && Math.sign(shell[a * 3]) === side) {
            next.set(a, [...(next.get(a) ?? []), b]);
            next.set(b, [...(next.get(b) ?? []), a]);
        }
    }

    if (next.size < 6) {
        return null;
    }

    const loop = [next.keys().next().value];

    while (loop.length < next.size) {
        const [a, b] = next.get(loop[loop.length - 1]);
        const following = a === loop[loop.length - 2] || loop.includes(a) ? b : a;

        if (following === undefined || loop.includes(following)) {
            break;
        }

        loop.push(following);
    }

    return loop;
}

/**
 * Put a toe box cut onto a smooth outline round the foot. Grown out from the skin along its
 * normals, the cut loops over itself where the skin curves in more tightly than the boot is
 * thick (between the toes); instead it goes round all of it (its convex hull, smoothed), its
 * points kept in order and spread evenly round it, and how far forward each is smoothed too.
 * Returns how far round the outline each point is (see outlineOf).
 */
function roundOffCut(loop, shell) {
    const n = loop.length;
    const points = loop.map((s) => [shell[s * 3], shell[s * 3 + 1], shell[s * 3 + 2]]);
    const ys = points.map((p) => p[1]);
    const top = ys.indexOf(Math.max(...ys));

    // How far round each point is, measured round the cut smoothed hard (which shrinks its loops
    // over itself away), so the points spread evenly round the outline
    let flat = points.map((p) => [p[0], p[1]]);

    for (let pass = 0; pass < 40; pass++) {
        flat = flat.map((p, i) => [0, 1].map((k) => p[k] * 0.5 + (flat[(i + 1) % n][k] + flat[(i + n - 1) % n][k]) * 0.25));
    }

    const around = new Float32Array(n);
    let perimeter = 0;

    for (let k = 1; k <= n; k++) {
        const i = (top + k) % n;
        const previous = flat[(top + k - 1) % n];

        perimeter += Math.hypot(flat[i][0] - previous[0], flat[i][1] - previous[1]);
        around[i] = k < n ? perimeter : 0;
    }

    const anticlockwise = points.reduce((sum, p, i) => sum + p[0] * points[(i + 1) % n][1] - points[(i + 1) % n][0] * p[1], 0) > 0;
    const outline = outlineOf(convexHull(points.map(([x, y]) => [x, y])), 8);

    // The outline is measured from straight above its middle; the cut from its top point, which
    // is where the outline comes nearest it
    const nearest = Array.from({ length: 256 }, (_, k) => k / 256).reduce((best, f) => {
        const [x, y] = outline(f);
        const d = Math.hypot(x - points[top][0], y - points[top][1]);

        return d < best.d ? { f, d } : best;
    }, { f: 0, d: Infinity }).f;
    const fractions = loop.map((_, i) => (((nearest + (anticlockwise ? 1 : -1) * (around[i] / perimeter)) % 1) + 1) % 1);
    let z = points.map((p) => p[2]);

    for (let pass = 0; pass < 10; pass++) {
        z = z.map((value, i) => value * 0.5 + (z[(i + 1) % n] + z[(i + n - 1) % n]) * 0.25);
    }

    loop.forEach((s, i) => {
        const [x, y] = outline(fractions[i]);

        shell[s * 3] = x;
        shell[s * 3 + 1] = y;
        shell[s * 3 + 2] = z[i];
    });

    return fractions;
}

/** The convex hull of 2D points, anticlockwise (Andrew's monotone chain). */
function convexHull(points) {
    const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const half = (list) => {
        const chain = [];

        for (const p of list) {
            while (chain.length >= 2 && cross(chain[chain.length - 2], chain[chain.length - 1], p) <= 0) {
                chain.pop();
            }

            chain.push(p);
        }

        chain.pop();

        return chain;
    };

    return [...half(sorted), ...half([...sorted].reverse())];
}

/**
 * A smooth closed outline round an anticlockwise convex polygon: a function from how far round
 * it (0 to 1, anticlockwise from straight above its middle) to a point, keeping the first few
 * harmonics of the polygon (so its size and shape, but no corners).
 */
function outlineOf(polygon, harmonics) {
    const SAMPLES = 128;
    const count = polygon.length;
    const xs = polygon.map(([x]) => x);
    const middle = (Math.min(...xs) + Math.max(...xs)) / 2;
    const lengths = [0];

    for (let k = 1; k <= count; k++) {
        const a = polygon[k - 1];
        const b = polygon[k % count];

        lengths.push(lengths[k - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }

    // Where a line straight up from the middle leaves it
    let start = 0;
    let highest = -Infinity;

    for (let k = 0; k < count; k++) {
        const a = polygon[k];
        const b = polygon[(k + 1) % count];

        if ((a[0] - middle) * (b[0] - middle) <= 0 && a[0] !== b[0]) {
            const w = (middle - a[0]) / (b[0] - a[0]);
            const y = a[1] + (b[1] - a[1]) * w;

            if (y > highest) {
                highest = y;
                start = lengths[k] + (lengths[k + 1] - lengths[k]) * w;
            }
        }
    }

    const at = (f) => {
        const target = (start + f * lengths[count]) % lengths[count];
        let k = 0;

        while (k < count - 1 && lengths[k + 1] < target) {
            k++;
        }

        const a = polygon[k];
        const b = polygon[(k + 1) % count];
        const w = Math.min(1, Math.max(0, (target - lengths[k]) / (lengths[k + 1] - lengths[k] || 1)));

        return [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w];
    };
    const samples = Array.from({ length: SAMPLES }, (_, k) => at(k / SAMPLES));
    const terms = [];

    for (let h = 0; h <= harmonics; h++) {
        terms.push([0, 1].map((axis) => {
            let cosine = 0;
            let sine = 0;

            samples.forEach((p, k) => {
                cosine += p[axis] * Math.cos((2 * Math.PI * h * k) / SAMPLES);
                sine += p[axis] * Math.sin((2 * Math.PI * h * k) / SAMPLES);
            });

            return [(cosine / SAMPLES) * (h ? 2 : 1), (sine / SAMPLES) * 2];
        }));
    }

    return (f) => [0, 1].map((axis) => terms.reduce((sum, term, h) => sum + term[axis][0] * Math.cos(2 * Math.PI * h * f) + term[axis][1] * Math.sin(2 * Math.PI * h * f), 0));
}

/** Share normals between toe cap and boot vertices at the same point. */
function joinToeCaps(geometry, joins) {
    if (!joins.length) {
        return;
    }

    // computeVertexNormals already averaged every triangle at each vertex, cap and boot alike;
    // only vertices at one point (split by texture seams, or where the nose closes) need sharing
    const normal = geometry.attributes.normal;
    const position = geometry.attributes.position;
    const byPlace = new Map();

    for (const i of joins) {
        const key = `${position.getX(i).toFixed(5)},${position.getY(i).toFixed(5)},${position.getZ(i).toFixed(5)}`;

        byPlace.set(key, [...(byPlace.get(key) ?? []), i]);
    }

    for (const group of byPlace.values()) {
        const sum = [0, 0, 0];

        for (const i of group) {
            sum[0] += normal.getX(i);
            sum[1] += normal.getY(i);
            sum[2] += normal.getZ(i);
        }

        const length = Math.hypot(...sum) || 1;

        for (const i of group) {
            normal.setXYZ(i, sum[0] / length, sum[1] / length, sum[2] / length);
        }
    }
}

/**
 * Average the normals of vertices at the same point (texture seams split them). Returns
 * { sums (point -> normal), sharedOf }.
 */
function smoothNormalsAcrossSeams(geometry, sharedOf) {
    const normal = geometry.attributes.normal;
    const sums = new Map();

    sharedOf.forEach((s, i) => {
        if (s < 0) {
            return;
        }

        const sum = sums.get(s) ?? [0, 0, 0];

        sum[0] += normal.getX(i);
        sum[1] += normal.getY(i);
        sum[2] += normal.getZ(i);
        sums.set(s, sum);
    });

    sharedOf.forEach((s, i) => {
        if (s >= 0) {
            const [x, y, z] = sums.get(s);
            const length = Math.hypot(x, y, z) || 1;

            normal.setXYZ(i, x / length, y / length, z / length);
        }
    });

    for (const [s, [x, y, z]] of sums) {
        const length = Math.hypot(x, y, z) || 1;

        sums.set(s, [x / length, y / length, z / length]);
    }

    return { sums, sharedOf };
}

/** Two body vertices' skin influences mixed (t of the way to b), as the four strongest. */
function mixSkin(human, a, b, t) {
    const total = new Map();

    for (const [v, share] of [[a, 1 - t], [b, t]]) {
        for (let k = 0; k < 4; k++) {
            const weight = human.skinWeights[v * 4 + k];

            if (weight) {
                const bone = human.skinIndices[v * 4 + k];

                total.set(bone, (total.get(bone) ?? 0) + weight * share);
            }
        }
    }

    const strongest = [...total].sort((x, y) => y[1] - x[1]).slice(0, 4);
    const sum = strongest.reduce((s, [, w]) => s + w, 0) || 1;
    const bytes = strongest.map(([, w]) => Math.round((w / sum) * 255));

    bytes[0] += 255 - bytes.reduce((s, w) => s + w, 0);

    while (strongest.length < 4) {
        strongest.push([0, 0]);
        bytes.push(0);
    }

    return [strongest.map(([bone]) => bone), bytes];
}

// --- Painting garments: colour and relief from where each texel is on the body ---

/**
 * Where every texel of a (smaller) body texture is on the base body, for painting garments:
 * { size, covered, positions (3 floats a texel), bones (each texel's main bone), names (the
 * bones' names), triangles (the body triangle each texel is in, by its place in the body's
 * triangles), weights (how near it is to that triangle's first two corners: 2 floats a texel),
 * corners (each body triangle's three vertices) }.
 */
export function texelMap(human, size = 512) {
    const count = size * size;
    const covered = new Uint8Array(count);
    const where = new Float32Array(count * 3);
    const bones = new Uint8Array(count);
    const triangles = new Int32Array(count).fill(-1);
    const weights = new Float32Array(count * 2);
    const positions = human.designPositions;
    const indices = human.renderIndices("body");
    const uvs = human.uvs;
    const source = human.renderSource;
    const corners = Int32Array.from(indices, (r) => source[r]);

    for (let t = 0; t < indices.length; t += 3) {
        const r = [indices[t], indices[t + 1], indices[t + 2]];
        const x = r.map((k) => uvs[k * 2] * size);
        const y = r.map((k) => (1 - uvs[k * 2 + 1]) * size);
        const v = r.map((k) => source[k]);
        const area = (x[1] - x[0]) * (y[2] - y[0]) - (x[2] - x[0]) * (y[1] - y[0]);

        if (Math.abs(area) < 1e-12) {
            continue;
        }

        for (let py = Math.max(0, Math.floor(Math.min(...y))); py <= Math.min(size - 1, Math.ceil(Math.max(...y))); py++) {
            for (let px = Math.max(0, Math.floor(Math.min(...x))); px <= Math.min(size - 1, Math.ceil(Math.max(...x))); px++) {
                const cx = px + 0.5;
                const cy = py + 0.5;
                const w0 = ((x[1] - cx) * (y[2] - cy) - (x[2] - cx) * (y[1] - cy)) / area;
                const w1 = ((x[2] - cx) * (y[0] - cy) - (x[0] - cx) * (y[2] - cy)) / area;
                const w2 = 1 - w0 - w1;
                const i = py * size + px;

                if (w0 < -0.05 || w1 < -0.05 || w2 < -0.05 || covered[i]) {
                    continue;
                }

                covered[i] = 1;
                bones[i] = human.skinIndices[v[0] * 4];
                triangles[i] = t / 3;
                weights[i * 2] = w0;
                weights[i * 2 + 1] = w1;

                for (let k = 0; k < 3; k++) {
                    where[i * 3 + k] = w0 * positions[v[0] * 3 + k] + w1 * positions[v[1] * 3 + k] + w2 * positions[v[2] * 3 + k];
                }
            }
        }
    }

    return { size, covered, positions: where, bones, names: human.bones.map((bone) => bone.name), triangles, weights, corners, spread: spreadOf(size, covered) };
}

/** The bumpScale a composite's heights are for (compositeGarments). */
export const COMPOSITE_BUMP = 1.5;

// sRGB to linear and back (0 to 1)
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSRGB = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

/**
 * One picture of all a character's garments together, to draw them all at once (each is painted
 * on the whole body, and they're all laid out on the body's texture): at each texel, the
 * outermost garment that's there. `layers`, under ones first: { data (its picture, RGBA), bump
 * (its heights, a byte a texel), tint (linear [r, g, b] its picture is multiplied by, or null),
 * bumpScale, roughness, metalness, inside (insideOf: which of the body it covers, and where its
 * edges are) }. Where none is (under a gap between them, or bare skin), the one nearest to being
 * there, so edges don't blend into anything else. Returns { size, data (RGBA, sRGB colours),
 * surface (RGBA: height, roughness, metalness, for a bump, roughness and metalness map; heights
 * scaled for a bumpScale of COMPOSITE_BUMP) }.
 */
export function compositeGarments(map, layers) {
    return allAtOnce(compositingGarments(map, layers));
}

// How many texels the garments' pictures are painted (or put together) a step
const TEXELS_A_STEP = 16384;

/** The same (compositeGarments), a step at a time (each a yield: a few rows of texels), returning it. */
export function* compositingGarments(map, layers) {
    const { size, covered, triangles, weights, corners } = map;
    const count = size * size;
    const data = new Uint8ClampedArray(count * 4);
    const surface = new Uint8ClampedArray(count * 4);
    const looks = layers.map(({ tint, bumpScale = COMPOSITE_BUMP, roughness = 0.8, metalness = 0 }) => ({
        // (Each channel's tint as a table, sRGB in and out)
        tables: tint && tint.map((c) => Uint8ClampedArray.from({ length: 256 }, (_, k) => Math.round(255 * toSRGB(Math.min(1, c * toLinear(k / 255)))))),
        height: bumpScale / COMPOSITE_BUMP,
        roughness: Math.round(roughness * 255),
        metalness: Math.round(metalness * 255),
    }));

    for (let i = 0; i < count; i++) {
        if (i % TEXELS_A_STEP === 0) {
            yield;
        }

        if (!covered[i]) {
            continue;
        }

        const t = triangles[i] * 3;
        const a = corners[t];
        const b = corners[t + 1];
        const c = corners[t + 2];
        const w0 = weights[i * 2];
        const w1 = weights[i * 2 + 1];
        const w2 = 1 - w0 - w1;
        let chosen = -1;
        let nearest = -Infinity;

        for (let g = layers.length - 1; g >= 0; g--) {
            const inside = layers[g].inside;
            const value = w0 * inside[a] + w1 * inside[b] + w2 * inside[c];

            if (value > 0) {
                chosen = g;
                break;
            }

            if (value > nearest) {
                nearest = value;
                chosen = g;
            }
        }

        const layer = layers[chosen];
        const look = looks[chosen];

        for (let k = 0; k < 3; k++) {
            const value = layer.data[i * 4 + k];

            data[i * 4 + k] = look.tables ? look.tables[k][value] : value;
        }

        data[i * 4 + 3] = 255;
        surface[i * 4] = 128 + (layer.bump[i] - 128) * look.height;
        surface[i * 4 + 1] = look.roughness;
        surface[i * 4 + 2] = look.metalness;
        surface[i * 4 + 3] = 255;
    }

    yield;
    dilate(map, data);
    yield;
    dilate(map, surface);

    return { size, data, surface };
}

/**
 * Paint a garment's texture: { data (RGBA), bump (one byte a texel), size }. A garment cut from a
 * design is painted white (its material's colour tints it), clear where there's no fabric.
 */
export function paintGarment(map, garment) {
    return allAtOnce(paintingGarment(map, garment));
}

/** The same (paintGarment), painted a step at a time (each a yield: a few rows of texels), returning it. */
export function* paintingGarment(map, garment) {
    if (garment.design) {
        return paintDesign(map, garment.design);
    }

    const { size, covered, positions } = map;
    const count = size * size;
    const data = new Uint8ClampedArray(count * 4);
    const bump = new Uint8ClampedArray(count);
    const colour = new THREE.Color(garment.colour);
    const trim = new THREE.Color(garment.trim ?? garment.colour);
    const pattern = garment.pattern ?? "cloth";
    const mark = garment.emblem ? { mark: garment.emblem.mark, colour: new THREE.Color(garment.emblem.colour), size: garment.emblem.size ?? 0.075 } : null;

    for (let i = 0; i < count; i++) {
        if (i % TEXELS_A_STEP === 0) {
            yield;
        }

        const x = positions[i * 3];
        const y = positions[i * 3 + 1];
        const z = positions[i * 3 + 2];
        let shade = 1;
        let height = 0.5;
        let c = colour;

        if (!covered[i]) {
            continue;
        }

        switch (pattern) {
            case "leather": {
                const grain = fbm(x * 90, y * 90, z * 90, 3);
                const wear = fbm(x * 12 + 3, y * 12, z * 12, 3);

                shade = 0.82 + 0.3 * wear + 0.08 * (grain - 0.5);
                height = 0.5 + 0.25 * (grain - 0.5);
                break;
            }
            case "quilted": {
                // Diamond quilting: two sets of diagonal stitch lines round the body
                const angle = Math.atan2(x, z) * 0.12;
                const a = (y + angle) * 32;
                const b = (y - angle) * 32;
                const seam = Math.min(Math.abs(a - Math.round(a)), Math.abs(b - Math.round(b)));

                shade = 0.9 + 0.12 * smoothstep(0, 0.2, seam) + 0.05 * (fbm(x * 60, y * 60, z * 60, 2) - 0.5);
                height = 0.25 + 0.6 * smoothstep(0, 0.35, seam);
                break;
            }
            case "mail": {
                const rings = Math.sin(y * 900) * Math.sin(Math.atan2(x, z) * 180 + y * 450);

                shade = 0.8 + 0.25 * rings * rings;
                height = 0.5 + 0.4 * rings;
                break;
            }
            case "plate": {
                // Horizontal lames, slightly darker at their overlaps
                const band = (y * 10) % 1;

                shade = 0.92 + 0.08 * smoothstep(0, 0.1, band) + 0.04 * (fbm(x * 30, y * 30, z * 30, 2) - 0.5);
                height = 0.5 + 0.3 * smoothstep(0, 0.08, band);
                break;
            }
            case "laced": {
                const weave = fbm(x * 160, y * 160, z * 160, 2);

                shade = 0.9 + 0.12 * (weave - 0.5) + 0.06 * (fbm(x * 10, y * 10, z * 10, 2) - 0.5);
                height = 0.5 + 0.2 * (weave - 0.5);

                // Down the front: the gap between its edges, criss-crossed by a cord
                if (z > 0 && Math.abs(x) < 0.022) {
                    const frac = (value) => value - Math.floor(value);
                    const cross = Math.min(Math.abs(frac((y + Math.abs(x)) * 55) - 0.5), Math.abs(frac((y - Math.abs(x)) * 55) - 0.5));

                    if (cross < 0.12) {
                        c = trim;
                        height += 0.25;
                    } else if (Math.abs(x) < 0.008) {
                        shade *= 0.45;
                        height -= 0.2;
                    }
                }

                break;
            }
            case "surcoat": {
                const weave = fbm(x * 160, y * 160, z * 160, 2);

                shade = 0.9 + 0.12 * (weave - 0.5) + 0.06 * (fbm(x * 10, y * 10, z * 10, 2) - 0.5);
                height = 0.5 + 0.2 * (weave - 0.5);

                // Trimmed at the neck and the hem
                if (Math.abs(y - 0.585) < 0.014 || Math.abs(y - 0.04) < 0.02) {
                    c = trim;
                    height += 0.2;
                }

                break;
            }
            case "chain": {
                // Links, each catching the light
                const link = Math.sin(Math.atan2(x, z) * 140 + y * 300);

                shade = 0.75 + 0.3 * link * link;
                height = 0.5 + 0.4 * link;
                break;
            }
            case "trim": {
                const weave = fbm(x * 160, y * 160, z * 160, 2);

                shade = 0.9 + 0.12 * (weave - 0.5) + 0.06 * (fbm(x * 10, y * 10, z * 10, 2) - 0.5);
                height = 0.5 + 0.2 * (weave - 0.5);

                // Bands of embroidered trim round the neck and the bottom
                const neck = Math.abs(y - 0.585);
                const hem = Math.abs(y - 0.045);

                if (neck < 0.012 || hem < 0.016) {
                    c = trim;
                    height += 0.2;
                }

                break;
            }
            default: {
                const weave = fbm(x * 160, y * 160, z * 160, 2);

                shade = 0.9 + 0.12 * (weave - 0.5) + 0.06 * (fbm(x * 10, y * 10, z * 10, 2) - 0.5);
                height = 0.5 + 0.2 * (weave - 0.5);
            }
        }

        // (The people's emblem on the chest, embroidered or painted)
        if (mark && z > 0.04 && emblemAt(mark.mark, x / mark.size, (y - EMBLEM_Y) / mark.size)) {
            c = mark.colour;
            height += 0.15;
        }

        data[i * 4] = Math.min(255, c.r * shade * 255);
        data[i * 4 + 1] = Math.min(255, c.g * shade * 255);
        data[i * 4 + 2] = Math.min(255, c.b * shade * 255);
        data[i * 4 + 3] = 255;
        bump[i] = height * 255;
    }

    yield;
    dilate(map, data, bump);

    return { size, data, bump };
}

// Where the emblem goes on the chest (the base body's height, metres), and its shape: whether a
// point (u to one side, v up: -1 to 1 across it) is in it
const EMBLEM_Y = 0.36;

// How far a point is from a segment (points [x, y])
function toSegment(u, v, [ax, ay], [bx, by]) {
    const [dx, dy] = [bx - ax, by - ay];
    const t = Math.max(0, Math.min(1, ((u - ax) * dx + (v - ay) * dy) / (dx * dx + dy * dy)));

    return Math.hypot(u - ax - t * dx, v - ay - t * dy);
}

// Whether a point is in a polygon (points [x, y])
function inPolygon(u, v, points) {
    let inside = false;

    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [xi, yi] = points[i];
        const [xj, yj] = points[j];

        if (yi > v !== yj > v && u < ((xj - xi) * (v - yi)) / (yj - yi) + xi) {
            inside = !inside;
        }
    }

    return inside;
}

const CROWN = [[-0.85, -0.55], [0.85, -0.55], [0.85, 0.35], [0.45, -0.05], [0, 0.6], [-0.45, -0.05], [-0.85, 0.35]];
const SPIDER_LEGS = [[[0.15, 0.35], [0.7, 0.75], [0.95, 0.3]], [[0.2, 0.2], [0.8, 0.3], [0.95, -0.1]], [[0.2, 0.05], [0.75, -0.2], [0.85, -0.6]], [[0.15, -0.05], [0.5, -0.55], [0.5, -0.95]]];

/** Whether a point (u, v: -1 to 1 across it) is in a people's emblem (characters/liveries.js). */
export function emblemAt(mark, u, v) {
    if (Math.abs(u) > 1.05 || Math.abs(v) > 1.05) {
        return false;
    }

    switch (mark) {
        case "crown":
            return inPolygon(u, v, CROWN);
        case "leaf":
            return Math.abs(v) < 1 && Math.abs(u) < 0.58 * Math.cos((v * Math.PI) / 2) && Math.abs(u) > 0.05;
        case "spider":
            return Math.hypot(u, v - 0.28) < 0.24 || Math.hypot(u / 0.3, (v + 0.22) / 0.4) < 1 || SPIDER_LEGS.some(([a, b, c]) => [a, b].some((p, k) => toSegment(Math.abs(u), v, p, [a, b, c][k + 1]) < 0.07));
        case "sun": {
            const r = Math.hypot(u, v);
            const step = (Math.PI * 2) / 12;
            const ray = 1 - Math.abs((((Math.atan2(u, v) / step) % 1) + 1) % 1 - 0.5) * 2;

            return r < 0.45 || r < 0.5 + 0.5 * ray ** 2;
        }
        case "serpent": {
            const curve = 0.45 * Math.sin(v * Math.PI * 0.95);

            return (Math.abs(v) < 0.9 && Math.abs(u - curve) < 0.14) || Math.hypot((u + 0.2) / 0.22, (v - 0.9) / 0.15) < 1;
        }
        case "claws":
            return [[[-0.6, 0.8], [-0.3, -0.8]], [[-0.1, 0.9], [0.2, -0.7]], [[0.4, 0.8], [0.65, -0.6]]].some(([a, b]) => toSegment(u, v, a, b) < 0.1);
        default:
            return false;
    }
}

// Where the painted texels are spread a few texels outward, so seams don't show: each texel just
// outside the body's pieces (three rings of them), with the one it takes its colour from (the
// first painted of its neighbours, left, right, above, below; the rings in turn, each from those
// painted before it), as pairs [texel, from, texel, from...]. The same for every picture painted
// over a texel map, so found once with it: the few thousand texels round the pieces' edges, not
// all of them looked at three times for every picture
function spreadOf(size, covered) {
    const pairs = [];
    let filled = covered.slice();

    for (let pass = 0; pass < 3; pass++) {
        const next = filled.slice();

        for (let i = 0; i < size * size; i++) {
            if (filled[i]) {
                continue;
            }

            // (Looked at in turn, not listed, as this is done for every texel)
            const x = i % size;
            let neighbour = -1;

            if (x > 0 && filled[i - 1]) {
                neighbour = i - 1;
            } else if (x < size - 1 && filled[i + 1]) {
                neighbour = i + 1;
            } else if (i - size >= 0 && filled[i - size]) {
                neighbour = i - size;
            } else if (i + size < size * size && filled[i + size]) {
                neighbour = i + size;
            }

            if (neighbour >= 0) {
                pairs.push(i, neighbour);
                next[i] = 1;
            }
        }

        filled = next;
    }

    return Int32Array.from(pairs);
}

/** Spread painted texels a few texels outward, so seams don't show (the map's `spread`). */
function dilate({ spread }, data, bump = null) {
    for (let p = 0; p < spread.length; p += 2) {
        const [i, from] = [spread[p], spread[p + 1]];

        data.copyWithin(i * 4, from * 4, from * 4 + 4);

        if (bump) {
            bump[i] = bump[from];
        }
    }
}

// --- Lingerie: designs painted on the base body ---
//
// A design says what fabric is at each point of the base body, where garments' textures are
// painted (so it fits every body, stretching with it): none (the garment is clear there, however
// far its region reaches), lace, lined lace, a band (straps, ribbons, waistbands, the corset's
// satin), sheer stocking or fishnet; and how far inside the fabric's edge the point is (metres),
// for lace's scalloped edges. Designs are symmetric, measured out from the body's middle.

const NONE = 0;
const LACE = 1;
const LINED = 2;
const BAND = 3;
const BOW = 4;
const SHEER = 5;
const REINFORCED = 6;
const SEAM = 7;
const NET = 8;
const SATIN = 9;

/** The opaque fabrics: the skin (and anything worn) under them is hidden. */
const SOLID = new Set([LINED, BAND, BOW, SATIN]);

// Landmarks of the base body (metres; y up, z forward): its nipples, round which cups are lined;
// its groin, which briefs line; the middle of its torso, front to back; and each leg's axis, from
// the hip joint to the knee and on to the ankle
const NIPPLE = [0.08, 0.381, 0.157];
const TORSO_Z = 0.05;
const LEG_AXIS = [[0.11, 0.049, 0.012], [0.158, -0.369, 0.032], [0.22, -0.745, -0.001]];

// A bra's cups: triangles round each nipple (across from it, out to the side, and up from it),
// their apex towards the strap
const CUP = [[-0.058, -0.042], [0.046, -0.041], [0.008, 0.072]];

/**
 * A point of the base body (`leg`: whether it's on a leg or foot), for designs: { ax (how far out
 * from the middle), y, z, leg, around (radians round the torso from the front, out to the side), legAround
 * and legRadius (round the leg's axis: 0 in front, positive outward, ±π behind), s and t (across
 * and up the surface, metres, for lace) }.
 */
function designPoint(x, y, z, leg) {
    const ax = Math.abs(x);
    const [a, b] = y > LEG_AXIS[1][1] ? [LEG_AXIS[0], LEG_AXIS[1]] : [LEG_AXIS[1], LEG_AXIS[2]];
    const f = (y - a[1]) / (b[1] - a[1]);
    const lx = ax - (a[0] + (b[0] - a[0]) * f);
    const lz = z - (a[2] + (b[2] - a[2]) * f);
    const around = Math.atan2(ax, z - TORSO_Z);
    const legAround = Math.atan2(lx, lz);

    return { ax, y, z, leg, around, legAround, legRadius: Math.hypot(lx, lz), s: leg ? legAround * 0.065 : around * 0.13, t: y };
}

/** How far inside a triangle (corners anticlockwise) a point is: metres, negative outside. */
function inTriangle(x, y, corners) {
    let inside = Infinity;

    for (let k = 0; k < 3; k++) {
        const [x0, y0] = corners[k];
        const [x1, y1] = corners[(k + 1) % 3];

        inside = Math.min(inside, ((x1 - x0) * (y - y0) - (y1 - y0) * (x - x0)) / Math.hypot(x1 - x0, y1 - y0));
    }

    return inside;
}

/** How far inside a strip `half` wide either side of a line down the body (x at each y) a point is. */
const strip = (ax, y, [x0, y0], [x1, y1], half) => Math.min(half - Math.abs(ax - (x0 + ((x1 - x0) * (y - y0)) / (y1 - y0))), y - Math.min(y0, y1), Math.max(y0, y1) - y);

/** A ribbon bow at [x, y] (x from the middle), `size` wide each way: how far inside it. */
function bow(ax, y, [x, y0], size) {
    const knot = size * 0.28 - Math.hypot(ax - x, y - y0);
    const loop = (side) => inTriangle(side * (ax - x), y - y0, [[0, 0], [size, -size * 0.55], [size, size * 0.55]]);
    const tail = (side) => strip(side * (ax - x), y, [size * 0.15, y0], [size * 0.55, y0 - size * 1.2], size * 0.16);

    return Math.max(knot, loop(1), loop(-1), tail(1), tail(-1));
}

/** The first fabric a point is inside, of [fabric, inside] pairs in order: [fabric, inside] or [NONE]. */
function first(...parts) {
    return parts.find(([, inside]) => inside > 0) ?? [NONE, 0];
}

/**
 * Every design: the heights of the base body it's between (nothing's painted outside them), and
 * its fabric at a point of the base body (designPoint): [fabric, how far inside its edge].
 */
export const DESIGNS = Object.freeze({
    // Triangle cups of lace, lined round the nipples, on satin straps over the shoulders to a
    // thin band under the bust; a bow between the cups
    bra: { heights: [0.3, 0.64], fabric: ({ ax, y, z }) => {
        const dx = ax - NIPPLE[0];
        const dy = y - NIPPLE[1];
        const cup = Math.min(inTriangle(dx, dy, CUP), z - 0.06);
        const lined = Math.min(cup, 0.046 - Math.hypot(dx - 0.002, dy + 0.004));
        const apex = [NIPPLE[0] + CUP[2][0], NIPPLE[1] + CUP[2][1]];
        const strap = z > 0.03 ? strip(ax, y, apex, [0.105, 0.62], 0.005) : strip(ax, y, [0.095, 0.33], [0.105, 0.62], 0.005);

        return first(
            [BOW, bow(ax, y, [0, 0.345], 0.013)],
            [LINED, lined],
            [LACE, cup],
            [BAND, Math.max(strap, Math.min(0.005 - Math.abs(y - 0.334), z > 0.06 ? 0.036 - ax : 1))],
        );
    } },

    // Low on the hips, cut high at the sides and cheeky behind; lined over the groin and between
    // the legs, on a satin waistband
    briefs: { heights: [-0.12, 0.08], fabric: ({ ax, y, z }) => {
        const waist = 0.064 - 0.01 * smoothstep(0.08, 0.17, ax);
        const front = z > 0.02;
        const leg = front ? -0.05 + 0.108 * smoothstep(0.03, 0.16, ax) : -0.065 + 0.115 * smoothstep(0.01, 0.075, ax);
        const inside = Math.min(waist - y, Math.max(y - leg, 0.035 - ax));
        const lined = Math.min(inside, (ax < 0.05 && y < 0.032 && z > 0.005) || (ax < 0.037 && y < -0.03) ? 1 : -1);

        return first(
            [BOW, bow(ax, y, [0, waist - 0.016], 0.011)],
            [BAND, Math.min(0.006 - Math.abs(y - waist), inside + 0.006)],
            [LINED, lined],
            [LACE, inside],
        );
    } },

    // A lace belt round the hips, scalloped along its lower edge, and satin suspenders down the
    // front and side of each thigh to clips at the stockings' tops
    suspenders: { heights: [-0.22, 0.17], fabric: ({ ax, y, legAround, legRadius }) => {
        const belt = Math.min(0.165 - y, y - 0.085);
        const suspender = (angle) => Math.min((0.0045 - Math.abs(legAround - angle) * legRadius), y + 0.21, 0.09 - y);
        const clip = (angle) => Math.min(0.008 - Math.abs(legAround - angle) * legRadius, 0.012 - Math.abs(y + 0.2));

        return first(
            [BOW, bow(ax, y, [0.052, 0.078], 0.01)],
            [BAND, Math.max(clip(0.2), clip(1.3), Math.min(belt, 0.006 - Math.abs(y - 0.159)))],
            [LACE, belt],
            [BAND, Math.max(suspender(0.2), suspender(1.3))],
        );
    } },

    // Sheer to mid-thigh, with a deep lace top, a seam up the back and darker heels and toes
    stockings: { heights: [-0.9, -0.18], fabric: (p) => stocking(p, SHEER) },
    fishnets: { heights: [-0.9, -0.18], fabric: (p) => stocking(p, NET) },

    // Satin, under the bust: up to a point between the breasts and under the arms, down to a
    // point below the waist in front; boned, piped, laced up the front over the skin, and
    // edged with lace along its top
    corset: { heights: [0.03, 0.42], fabric: ({ ax, y, z, around }) => {
        const side = Math.sin(around) ** 2;
        const behind = (1 - Math.cos(around)) / 2;
        const front = z > TORSO_Z;
        const top = 0.333 + 0.05 * side + 0.02 * behind + (front ? 0.024 * (1 - smoothstep(0, 0.045, ax)) : 0);
        const bottom = 0.078 - (front ? 0.032 * (1 - smoothstep(0, 0.07, ax)) : 0);
        const inside = Math.min(top - y, y - bottom);

        // The lacing: a cord criss-crossing the gap up the front
        if (front && ax < 0.011 && inside > 0) {
            const frac = (value) => value - Math.floor(value);
            const cross = Math.min(Math.abs(frac((y + ax) * 55) - 0.5), Math.abs(frac((y - ax) * 55) - 0.5));

            return cross < 0.1 ? [BAND, 1] : [NONE, 0];
        }

        return first([SATIN, Math.min(top - 0.009 - y, y - bottom)], [LACE, inside + 0.004]);
    } },

    // A velvet band round the neck, edged with lace
    choker: { heights: [0.59, 0.625], fabric: ({ ax, y, z }) => {
        const round = 0.075 - Math.hypot(ax, z - 0.015);

        return first([BAND, Math.min(round, 0.0065 - Math.abs(y - 0.607))], [LACE, Math.min(round, 0.0115 - Math.abs(y - 0.607))]);
    } },
});

/** A stocking (`fabric`: SHEER or NET) up to mid-thigh, its lace top, seam, heel and toe. */
function stocking({ y, z, leg, legAround, legRadius }, fabric) {
    const top = -0.185 - y;

    if (!leg || top <= 0) {
        return [NONE, 0];
    }

    if (top < 0.062) {
        return [LACE, top];
    }

    if (top < 0.07) {
        return [BAND, 1];
    }

    if (fabric === NET) {
        return [NET, top];
    }

    const seam = (Math.PI - Math.abs(legAround)) * legRadius;

    return y < -0.72 && (z < -0.01 || z > 0.09) ? [REINFORCED, top] : seam < 0.0016 ? [SEAM, top] : [SHEER, top];
}

/** Floral lace at a point (across and up the surface, metres): [alpha, shade, relief]. */
function laceAt(s, t) {
    // Flowers on a honeycomb, each turned its own way, on tulle crossed by curling stems; edges
    // soft over about a texel, so the texture filters smoothly
    const CELL = 0.04;
    const ROW = CELL * 0.866;
    const row = Math.round(t / ROW);
    let best = null;

    for (let r = row - 1; r <= row + 1; r++) {
        const offset = (r & 1) * CELL * 0.5;
        const column = Math.round((s - offset) / CELL);

        for (let c = column - 1; c <= column + 1; c++) {
            const dx = s - (c * CELL + offset);
            const dy = t - r * ROW;
            const distance = dx * dx + dy * dy;

            if (!best || distance < best.distance) {
                best = { dx, dy, distance, turn: hash3(r, c, 7) * Math.PI * 2 };
            }
        }
    }

    const r = Math.sqrt(best.distance);
    const angle = Math.atan2(best.dy, best.dx) + best.turn;
    const petal = CELL * 0.36 * (0.5 + 0.5 * Math.abs(Math.cos(2.5 * angle)));
    const heart = smoothstep(0.005, 0.0035, r);
    const eyelet = smoothstep(0.0055, 0.0075, r);
    const fill = 0.84 * smoothstep(petal + 0.0005, petal - 0.0025, r) * eyelet;
    const cord = Math.exp(-(((r - petal) / 0.0014) ** 2));
    const stem = smoothstep(0.045, 0.02, Math.abs(fbm(s * 30, t * 30, 0.5, 2) - 0.5)) * 0.92;
    const alpha = Math.max(0.24, fill, cord, heart, stem);
    const raised = Math.max(cord, heart, stem);

    return [alpha, 0.88 + 0.22 * raised, 0.4 + 0.5 * raised];
}

/** How a fabric looks at a point: [alpha, shade, relief] (CLEAR where there's none). */
function fabricLook(fabric, inside, p) {
    // Soft along every edge
    const edge = smoothstep(0, 0.0025, inside);

    switch (fabric) {
        case LACE: {
            // A scalloped edge, bound with a cord
            const scallop = inside - 0.005 * (1 - Math.abs(Math.sin((p.s + p.t) * 200)));
            const [alpha, shade, relief] = laceAt(p.s, p.t);
            const cord = smoothstep(0, 0.0015, scallop) * smoothstep(0.0045, 0.0025, scallop);

            return scallop <= 0 ? CLEAR : [Math.max(alpha, cord) * smoothstep(0, 0.0012, scallop), shade + 0.2 * cord, Math.max(relief, cord)];
        }
        case LINED: {
            const [alpha] = laceAt(p.s, p.t);

            return [1, 0.8 + 0.2 * alpha, 0.35 + 0.5 * alpha];
        }
        case BAND:
            return [edge, 1, 0.6];
        case BOW:
            return [edge, 1.15, 0.85];
        case SHEER:
            return [0.42, 0.85, 0.5];
        case REINFORCED:
            return [0.68, 0.8, 0.5];
        case SEAM:
            return [0.92, 0.7, 0.6];
        case NET: {
            // Diamonds a couple of centimetres across
            const frac = (value) => value - Math.floor(value);
            const u = frac((p.s + p.t) / 0.026);
            const v = frac((p.s - p.t) / 0.026);
            const thread = Math.min(Math.min(u, 1 - u), Math.min(v, 1 - v));

            return [smoothstep(0.1, 0.05, thread), 1, 0.8];
        }
        case SATIN: {
            // Piped along its edges, boned every few centimetres round, with lace laid over it
            const [alpha] = laceAt(p.s, p.t);
            const frac = (value) => value - Math.floor(value);
            const channel = smoothstep(0.42, 0.47, Math.abs(frac(p.s / 0.042) - 0.5));
            const piping = smoothstep(0.005, 0.003, inside);

            return [1, (0.78 + 0.26 * alpha) * (1 - 0.3 * channel) + 0.3 * piping, 0.45 + 0.35 * alpha - 0.2 * channel + 0.4 * piping];
        }
        default:
            return CLEAR;
    }
}

const CLEAR = [0, 1, 0.5];

/** Paint a design: white (the material's colour tints it), clear where there's no fabric. */
function paintDesign(map, name) {
    const { size, covered, positions, bones, names } = map;
    const count = size * size;
    const data = new Uint8ClampedArray(count * 4);
    const bump = new Uint8ClampedArray(count);
    const { heights: [low, high], fabric } = DESIGNS[name];
    const legs = names.map((bone) => LEG_BONE.test(bone));

    // (clear texels are white too, so they don't darken the fabric's edges as it's minified)
    data.fill(255);

    for (let i = 0; i < count; i++) {
        const y = positions[i * 3 + 1];

        data[i * 4 + 3] = 0;

        if (!covered[i] || y < low || y > high) {
            continue;
        }

        const p = designPoint(positions[i * 3], y, positions[i * 3 + 2], legs[bones[i]]);
        const [kind, inside] = fabric(p);
        const [alpha, shade, relief] = fabricLook(kind, inside, p);

        data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = Math.min(255, shade * 225);
        data[i * 4 + 3] = alpha * 255;
        bump[i] = relief * 255;
    }

    dilate(map, data, bump);

    return { size, data, bump };
}

const LEG_BONE = /Leg$|Foot|Toe/;

/**
 * Which of a body's vertices a design's fabric is opaque over (1), by where each is on the base
 * body: the skin there is hidden under it.
 */
export function designSolid(human, name) {
    const solid = new Uint8Array(human.vertexCount);
    const positions = human.designPositions;
    const { heights: [low, high], fabric } = DESIGNS[name];

    for (let v = 0; v < human.vertexCount; v++) {
        const y = positions[v * 3 + 1];

        if (y >= low && y <= high) {
            const p = designPoint(positions[v * 3], y, positions[v * 3 + 2], LEG_BONE.test(human.bones[human.skinIndices[v * 4]].name));

            solid[v] = SOLID.has(fabric(p)[0]) ? 1 : 0;
        }
    }

    return solid;
}
