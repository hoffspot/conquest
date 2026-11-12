// What each garment is, and its picture: the garments there are (GARMENTS: each a region of the
// body's surface, its layer, its colours and the pattern it's painted with), how far inside a
// garment's region a point of the body is, and the pictures painted from that, a garment's own
// and an outfit's (all of one's garments in one picture, to draw them all at once).
//
// Nothing here needs three.js or the page: the skins' worker paints with it too (skin-worker.js),
// and a worker can't have three.js as the page's code does (by the page's import map). What
// fits a garment to a body, as a mesh, is garments.js, which hands on everything here.

import { LIVERIES } from "./liveries.js";
import { fbm, hash3, smoothstep } from "./noise.js";
import { reducing } from "./pictures.js";
import { allAtOnce } from "../core/steps.js";

// --- Regions, for the garments below ---

const OUTSIDE = -1;

/**
 * Up to the neck: a round neckline, dipping at the front and rising over the shoulders, out past
 * the neck's sides (level, it cut across shoulders that rise to the neck, as Vitruvian's do, and
 * left their tops bare).
 */
const neckline = (v, l, depth = 0.03) => l.neck - depth - v.y - 0.035 * smoothstep(0, 0.12, v.z - l.neckZ) + 2 * Math.max(0, Math.abs(v.x) - l.neckRadius - depth / 2);

// How far onto an arm or a leg (above 0) or off it a point is, by how much of its skin moves
// with the limb's bones: roughly metres. An edge round a limb follows where that's half, smooth
// across the skin (by the strongest bone, ragged: docs/CHARACTERS.md)
const SHARE_REACH = 0.25;
const onArm = (v) => SHARE_REACH * (v.armShare - 0.5);
const onLeg = (v) => SHARE_REACH * (v.legShare - 0.5);

/**
 * The torso from `bottom` up to the neckline, arms down to `sleeve` (0 none, 1 the wrist): below
 * the hips, round the tops of the thighs too. Measured alike either side of where the skin goes
 * from one bone to the next, so its edges are smooth.
 */
function top(bottom, sleeve, neck = 0.03) {
    return (v, l) => (v.region === "foot" ? OUTSIDE : Math.min(Math.max(v.y - bottom(l), onArm(v)), neckline(v, l, neck), Math.max(sleeve - v.arm, -onArm(v))));
}

/** A band round the body, from `bottom` up to `top`, not the arms. */
function band(bottom, top) {
    return (v, l) => (v.region === "foot" ? OUTSIDE : Math.min(v.y - bottom(l), top(l) - v.y, -onArm(v)));
}

/** From `waist` down the legs to `length` (0 the hip, 1 the ankle; past it, the foot). */
function bottoms(waist, length) {
    return (v, l) => Math.min(waist(l) - v.y, Math.max(length - v.leg, -onLeg(v)), -onArm(v));
}

/** Round the arms, from `from` down to `to` (0 the shoulder, 1 the wrist; past it, the hand). */
function sleeves(from, to) {
    return (v) => Math.min(v.arm - from, to - v.arm, onArm(v));
}

/** The feet, and the legs up to `from` (1 the ankle, 0 the hip). */
function legs(from) {
    return (v) => (v.region === "foot" ? 1 : Math.min(v.leg - from, onLeg(v)));
}

/**
 * Every garment: its slot, layer (under garments first: 0 underwear, 1 clothing, 2 a mid layer,
 * 3 armour, 4 what's over the armour, a surcoat or a mantle, 5 belts and sashes, 6 straps, chains
 * and collars), region, thickness and looseness (metres), whether it lies over what's worn under
 * it by its own thickness (`over`: a strap), smoothing, and look (colour, roughness, metalness, a
 * pattern painted in, a tiling detail); or, for lingerie, the design it's cut from (DESIGNS), clear
 * wherever that has no fabric.
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
    bracers: { label: "Leather bracers", slot: "forearms", layer: 3, thickness: 0.009, smooth: 6, colour: "#5c3a22", roughness: 0.6, pattern: "leather", inside: sleeves(0.64, 0.93) },
    belt: { label: "Belt", slot: "waist", layer: 5, thickness: 0.008, over: true, smooth: 6, colour: "#3a2616", roughness: 0.55, pattern: "leather", inside: band((l) => l.waist - 0.07, (l) => l.waist - 0.025) },
    boots: { label: "Leather boots", slot: "feet", layer: 2, thickness: 0.007, smooth: 8, toeBox: true, colour: "#3b2a1c", roughness: 0.6, pattern: "leather", inside: legs(0.66) },
    // (Spiked boots' leather: under the iron at their toes, heels and shins, equipment.js)
    spikedBootLeather: { label: "Spiked boots' leather", slot: "feet", layer: 2, thickness: 0.008, smooth: 8, toeBox: true, colour: "#3d291a", roughness: 0.68, pattern: "leather", hidden: true, inside: legs(0.6) },
    sabatons: { label: "Plate boots", slot: "feet", layer: 2, thickness: 0.012, smooth: 10, toeBox: true, colour: "#a8aeb2", roughness: 0.3, metalness: 1, pattern: "plate", inside: legs(0.72) },
    gloves: { label: "Gloves", slot: "hands", layer: 2, thickness: 0.002, smooth: 1, colour: "#4a3322", roughness: 0.6, pattern: "leather", inside: (v) => Math.min(v.arm - 0.9, onArm(v)) },
    gauntlets: { label: "Gauntlets", slot: "hands", layer: 2, thickness: 0.007, smooth: 2, colour: "#a8aeb2", roughness: 0.3, metalness: 1, pattern: "plate", inside: (v) => Math.min(v.arm - 0.8, onArm(v)) },
    greaves: { label: "Greaves", slot: "shins", layer: 3, thickness: 0.014, smooth: 8, colour: "#a8aeb2", roughness: 0.3, metalness: 1, pattern: "plate", inside: (v) => Math.min(v.leg - 0.56, 0.86 - v.leg, onLeg(v)) },
    // (A strap from the right shoulder across the chest and back to the left hip, for what's
    // carried on the back: equipment.js SHEATHS. Straps lie over what's worn under them)
    baldric: { label: "Baldric", slot: "straps", layer: 6, thickness: 0.01, over: true, smooth: 3, colour: "#3a2616", roughness: 0.6, pattern: "leather", hidden: true, inside: (v, l) => (v.region === "foot" ? OUTSIDE : Math.min(0.02 * (l.height / 1.7) - Math.abs(0.83 * (v.x - 0.015 * (l.height / 1.7)) + 0.56 * (v.y - (l.armpit + l.waist + 0.07 * (l.height / 1.7)) / 2)), v.y - (l.waist - 0.07), -onArm(v), l.neck - v.y)) },
    straps: { label: "Pack straps", slot: "straps", layer: 6, thickness: 0.012, over: true, smooth: 3, colour: "#2e1d12", roughness: 0.6, pattern: "leather", hidden: true, inside: (v, l) => (v.region === "foot" ? OUTSIDE : Math.min(0.016 * (l.height / 1.7) - Math.abs(Math.abs(v.x) - 0.085 * (l.height / 1.7)), v.y - l.armpit + 0.04, -onArm(v), l.neck - v.y)) },
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
    vambraces: { label: "Vambraces", slot: "forearms", layer: 3, thickness: 0.011, smooth: 6, colour: "#a8aeb2", roughness: 0.3, metalness: 1, pattern: "plate", inside: sleeves(0.62, 0.93) },
    livery: { label: "Livery", slot: "shirt", layer: 1, thickness: 0.004, loose: 0.008, smooth: 4, colour: "#27407a", roughness: 0.85, pattern: "trim", trim: "#d9b44a", inside: top((l) => l.hips - 0.06, 0.95) },
    chain: {
        label: "Chain of office",
        slot: "neck",
        layer: 6,
        thickness: 0.008,
        over: true,
        smooth: 2,
        colour: "#d8b24a",
        roughness: 0.3,
        metalness: 1,
        pattern: "chain",
        inside: (v, l) => {
            if (v.region === "foot") {
                return OUTSIDE;
            }

            // (A U down the front to the breastbone, as wide however steep it runs; over each
            // shoulder beside the neck; across the back: each running out smoothly into the next)
            const s = l.height / 1.7;
            const [width, reach, drop, top] = [0.011 * s, 0.11 * s, 0.2 * s, l.neck - 0.02 * s];
            const x = Math.min(1, Math.abs(v.x) / reach);
            const slope = (2 * drop * x) / reach;
            const across = reach - Math.abs(v.x);
            const front = Math.min(width - Math.abs(v.y - (top - drop * (1 - x * x))) / Math.sqrt(1 + slope * slope), across, v.z);
            const over = Math.min(width - Math.abs(Math.abs(v.x) - reach), v.y - (top - 0.045 * s));
            const back = Math.min(width - Math.abs(v.y - (l.neck - 0.035 * s)), across, -v.z);

            return Math.min(Math.max(front, over, back), -onArm(v), l.neck - v.y);
        },
    },
};

// Round the neck down onto the shoulders, as a collar of beads lies (`deep`: metres down from the neck)
const collar = (deep) => band((l) => l.neck - deep * (l.height / 1.7), (l) => l.neck + 0.01);

// The bust's band, as a chest wrap's
const bustBand = band((l) => l.chest - 0.75 * (l.chest - l.waist), (l) => l.armpit + 0.02);

/**
 * Each people's everyday dress (dress.js): each piece's cut and work, and its colours: [colour,
 * trim, accent] by name. Those only another colour of what's already made (`base`) are drawn
 * with its picture, tinted.
 */
const EVERYDAY = {
    // The elves': fine cloth, long and flowing, a vine in leaf worked round the neck and hem; a
    // silk sash; soft boots
    // (A tunic to the hips, over the leggings)
    elfTunic: [{ label: "Elven tunic", slot: "shirt", layer: 1, thickness: 0.003, loose: 0.01, smooth: 4, roughness: 0.55, pattern: "vine", inside: top((l) => l.hips - 0.06, 0.97, 0.045) }, { Moss: ["#4f6f4a", "#dde3ea"], Silver: ["#b9c0c4", "#3a8a55"], Dusk: ["#3d4f7a", "#dde3ea"] }],
    elfBlouse: [{ label: "Elven blouse", slot: "shirt", layer: 1, thickness: 0.003, loose: 0.008, smooth: 4, roughness: 0.55, pattern: "vine", inside: top((l) => l.hips - 0.03, 0.97, 0.07) }, { Ivory: ["#e8e2d0", "#3a8a55"], Sage: ["#a9b9a2", "#f2f2ec"] }],
    elfVest: [{ label: "Elven vest", slot: "chest", layer: 2, thickness: 0.005, loose: 0.003, smooth: 6, roughness: 0.55, pattern: "vine", inside: top((l) => l.hips - 0.02, 0.03, 0.06) }, { Moss: ["#3e5a44", "#dde3ea"], Dusk: ["#2e3c60", "#dde3ea"] }],
    elfBodice: [{ label: "Elven bodice", slot: "chest", layer: 2, thickness: 0.006, loose: 0.002, smooth: 6, roughness: 0.5, pattern: "laced", inside: band((l) => l.waist - 0.07, (l) => l.chest + 0.03) }, { Moss: ["#3e5a44", "#dde3ea"], Dusk: ["#2e3c60", "#dde3ea"] }],
    elfSash: [{ label: "Silk sash", slot: "waist", layer: 5, thickness: 0.006, over: true, smooth: 6, roughness: 0.45, pattern: "cloth", inside: band((l) => l.waist - 0.1, (l) => l.waist - 0.01) }, { Silver: ["#c9ced6"], Green: ["#3a8a55"] }],
    // The dark elves': close-fitted and high at the neck, black and violet, a silver web across
    // the breast; tall boots to the knee
    darkTunic: [{ label: "Dark elven tunic", slot: "shirt", layer: 1, thickness: 0.003, loose: 0.006, smooth: 4, roughness: 0.5, pattern: "web", inside: top((l) => l.hips - 0.1, 0.97, 0.008) }, { Black: ["#1d1724", "#d6cfe6"], Violet: ["#3e2266", "#d6cfe6"], Plum: ["#4a2340", "#b8a6ff"] }],
    darkVest: [{ label: "Dark elven vest", slot: "chest", layer: 2, thickness: 0.005, loose: 0.003, smooth: 6, roughness: 0.45, pattern: "web", inside: top((l) => l.hips - 0.02, 0.03, 0.01) }, { Black: ["#16121b", "#8a5cc4"] }],
    darkBodice: [{ label: "Dark elven bodice", slot: "chest", layer: 2, thickness: 0.006, loose: 0.002, smooth: 6, roughness: 0.45, pattern: "laced", inside: band((l) => l.waist - 0.07, (l) => l.chest + 0.03) }, { Black: ["#1d1724", "#8a5cc4"], Violet: ["#3e2266", "#d6cfe6"] }],
    darkBoots: [{ label: "Tall boots", slot: "feet", layer: 2, thickness: 0.007, smooth: 8, toeBox: true, roughness: 0.45, pattern: "leather", inside: legs(0.48) }, { Black: ["#121016"] }],
    // The cat folk's: light wraps for the sun, bare at the arms, woven in bold zigzagged bands of
    // saffron, indigo and red; collars of beads; bronze bangles; bare feet
    catWrap: [{ label: "Wrap", slot: "shirt", layer: 1, thickness: 0.003, loose: 0.01, smooth: 4, roughness: 0.85, pattern: "bands", inside: top((l) => l.hips - 0.04, 0.05, 0.075) }, { Saffron: ["#e0a02a", "#2f3f95", "#b33224"], Indigo: ["#2f3f95", "#e0a02a", "#efe2c4"], Red: ["#b33224", "#1e1a18", "#e0a02a"] }],
    catBandeau: [{ label: "Breast wrap", slot: "shirt", layer: 1, thickness: 0.003, smooth: 6, roughness: 0.85, pattern: "bands", inside: bustBand }, { Saffron: ["#e0a02a", "#2f3f95", "#b33224"], Indigo: ["#2f3f95", "#e0a02a", "#efe2c4"] }],
    beadedCollar: [{ label: "Beaded collar", slot: "neck", layer: 6, thickness: 0.006, smooth: 3, roughness: 0.4, pattern: "beads", inside: collar(0.1) }, { Bright: ["#b33224", "#efe2c4", "#2f6fb5"], Gold: ["#e0a02a", "#1e1a18", "#b33224"] }],
    // (A man's: wide trousers to the calf, loose and light, and a banded sash)
    catTrousers: [{ label: "Wide trousers", slot: "legs", layer: 1, thickness: 0.003, loose: 0.016, smooth: 4, roughness: 0.85, pattern: "cloth", inside: bottoms((l) => l.waist - 0.02, 0.78) }, { Indigo: ["#2f3f95"], Ochre: ["#c47a2c"], Red: ["#8e2a20"] }],
    catSash: [{ label: "Banded sash", slot: "waist", layer: 5, thickness: 0.006, over: true, smooth: 6, roughness: 0.8, pattern: "bands", inside: band((l) => l.waist - 0.11, (l) => l.waist) }, { Saffron: ["#e0a02a", "#2f3f95", "#b33224"], Indigo: ["#2f3f95", "#e0a02a", "#efe2c4"] }],
    bangles: [{ label: "Bangles", slot: "forearms", layer: 3, thickness: 0.006, smooth: 2, roughness: 0.35, metalness: 1, pattern: "bangles", inside: sleeves(0.84, 0.93) }, { Bronze: ["#b8863a"] }],
    // The lizard folk's: white cotton with stepped frets round the neck and hem in turquoise and
    // crimson, a row of diamonds over the breast; a short jacket; a loincloth; bangles of jade
    huipil: [{ label: "Huipil", slot: "shirt", layer: 1, thickness: 0.003, loose: 0.012, smooth: 4, roughness: 0.88, pattern: "fret", inside: top((l) => l.hips - 0.1, 0.22, 0.06) }, { White: ["#ece6d6", "#2fb3a0", "#a8322a"], Ochre: ["#c9962e", "#a8322a", "#2fb3a0"], Turquoise: ["#2fb3a0", "#ece6d6", "#a8322a"] }],
    xicolli: [{ label: "Xicolli", slot: "chest", layer: 2, thickness: 0.004, loose: 0.006, smooth: 4, roughness: 0.85, pattern: "fret", inside: top((l) => l.hips - 0.03, 0.03, 0.06) }, { Crimson: ["#a8322a", "#2fb3a0", "#ece6d6"], White: ["#ece6d6", "#a8322a", "#2fb3a0"] }],
    // (A man's: breeches of cotton to the knee)
    lizardBreeches: [{ label: "Cotton breeches", slot: "legs", layer: 1, thickness: 0.003, loose: 0.01, smooth: 4, roughness: 0.88, pattern: "cloth", inside: bottoms((l) => l.waist - 0.02, 0.5) }, { White: ["#ece6d6"], Ochre: ["#c9962e"] }],
    maxtlatl: [{ label: "Maxtlatl", slot: "underwear", layer: 0, thickness: 0.003, smooth: 3, roughness: 0.9, pattern: "cloth", inside: bottoms((l) => l.hips + 0.03, 0.2) }, { White: ["#ece6d6"] }],
    jadeBangles: [{ label: "Jade bangles", slot: "forearms", layer: 3, thickness: 0.006, smooth: 2, roughness: 0.3, pattern: "bangles", inside: sleeves(0.84, 0.93) }, { Green: ["#3f8f5f"] }],
    // The orcs': hide, in patches stitched together, bare at the arms; a mantle of fur over the
    // shoulders; a string of bones and teeth; bands of iron round the forearms
    hideVest: [{ label: "Hide vest", slot: "chest", layer: 2, thickness: 0.008, loose: 0.004, smooth: 6, roughness: 0.8, pattern: "hide", inside: top((l) => l.hips - 0.02, 0.03, 0.08) }, { Tan: ["#8a6a48", "#2a1a10"], Dark: ["#4e3826", "#7a6042"], Red: ["#7a2a1c", "#1b1614"] }],
    // (A man's: trousers of patched hide)
    hidePants: [{ label: "Hide trousers", slot: "legs", layer: 1, thickness: 0.006, loose: 0.006, smooth: 4, roughness: 0.82, pattern: "hide", inside: bottoms((l) => l.waist - 0.02, 0.95) }, { Tan: ["#8a6a48", "#2a1a10"], Dark: ["#4e3826", "#7a6042"] }],
    hideWrap: [{ label: "Hide wrap", slot: "shirt", layer: 1, thickness: 0.006, smooth: 6, roughness: 0.8, pattern: "hide", inside: bustBand }, { Tan: ["#8a6a48", "#2a1a10"], Dark: ["#4e3826", "#7a6042"] }],
    furMantle: [{ label: "Fur mantle", slot: "surcoat", layer: 4, thickness: 0.018, loose: 0.006, smooth: 6, roughness: 0.95, pattern: "fur", inside: top((l) => l.armpit - 0.03, 0.2, 0) }, { Grey: ["#6e6a64"], Brown: ["#5a4632"], Black: ["#2a2622"] }],
    boneNecklace: [{ label: "Bone necklace", slot: "neck", layer: 6, thickness: 0.007, smooth: 3, roughness: 0.5, pattern: "beads", inside: collar(0.05) }, { Bone: ["#e8dcc0", "#8a2a1a", "#2a1a10"] }],
    ironBands: [{ label: "Iron bands", slot: "forearms", layer: 3, thickness: 0.009, smooth: 6, roughness: 0.5, metalness: 0.8, pattern: "bangles", inside: sleeves(0.64, 0.93) }, { Iron: ["#4a4642"] }],
};

// The peoples' everyday dress (EVERYDAY), each piece in each of its colours; and what's only a
// tint of what's made: leggings, boots and gloves in their colours
function everyday() {
    const garments = {};

    for (const [id, [cut, colours]] of Object.entries(EVERYDAY)) {
        for (const [name, [colour, trim, accent]] of Object.entries(colours)) {
            garments[`${id}${name}`] = { ...cut, colour, ...(trim ? { trim } : {}), ...(accent ? { accent } : {}) };
        }
    }

    return garments;
}

// (Tinted, as liveried's are, after MADE: those made from it)
const TINTED = {
    elfLeggingsGrey: ["trousers", "#6f7a6e"],
    elfLeggingsGreen: ["trousers", "#3e5a44"],
    elfBoots: ["boots", "#8f8470"],
    darkLeggings: ["trousers", "#17131c"],
    darkGloves: ["gloves", "#141118"],
    darkBelt: ["belt", "#2a2430"],
    hideLeggings: ["breeches", "#4e3826"],
    hideBoots: ["boots", "#2e2216"],
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
        tinted("belt", leather);
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

// Each people's everyday dress (characters/dress.js: who wears what), in their own cut, with their
// own work on it (everydayAt's patterns: their vines, webs, bands, frets, patched hide and fur,
// beads), each in a few of their colours (EVERYDAY: `${id}${colour}`), and what's only a tint
export const GARMENTS = Object.freeze({ ...MADE, ...liveried(MADE), ...everyday(), ...Object.fromEntries(Object.entries(TINTED).map(([id, [base, colour]]) => [id, { ...MADE[base], colour, base }])) });

/**
 * One colour of lingerie: a lace bra, briefs, a suspender belt and stockings, named for it
 * ("laceBraBlack"...); black also has fishnet stockings.
 */
function lingerie(name, colour) {
    const pieces = {
        [`laceBra${name}`]: { label: `${name} lace bra`, slot: "undershirt", layer: 0, thickness: 0.002, smooth: 2, design: "bra", inside: top((l) => l.waist + 0.02, 0.08, -0.03) },
        [`laceBriefs${name}`]: { label: `${name} lace briefs`, slot: "underwear", layer: 0, thickness: 0.002, smooth: 2, design: "briefs", inside: bottoms((l) => l.hips + 0.03, 0.22) },
        [`suspenders${name}`]: { label: `${name} suspender belt`, slot: "waist", layer: 1, thickness: 0.0025, smooth: 2, design: "suspenders", inside: bottoms((l) => l.waist, 0.5) },
        [`stockings${name}`]: { label: `${name} stockings`, slot: "legs", layer: 0, thickness: 0.0012, smooth: 1, design: "stockings", inside: legs(0.12) },
    };

    if (name === "Black") {
        pieces.fishnets = { label: "Fishnet stockings", slot: "legs", layer: 0, thickness: 0.0012, smooth: 1, design: "fishnets", inside: legs(0.12) };
    }

    for (const piece of Object.values(pieces)) {
        piece.colour = colour;
        piece.roughness = 0.55;
    }

    return pieces;
}

// Footwear with a toe box is cut this far along the foot (1 is the ball of the foot)
export const TOE_CUT = 0.85;

/** The regions of the body a vertex of it can be in (measureBody: by the bone that moves it most). */
export const REGIONS = Object.freeze(["head", "torso", "arm", "hand", "leg", "foot"]);

// What's measured at each vertex that's a number, in a row of this many: how much of it moves
// with the arm's bones and with the leg's, how far down the arm and the leg it is and how far
// along the foot, and where it is
const MEASURED = 8;
const [ARM_SHARE, LEG_SHARE, ARM, LEG, FOOT, X, Y, Z] = [0, 1, 2, 3, 4, 5, 6, 7];

/**
 * A body's vertices' measurements (measureBody's `vertices`), for `count` of them, none measured
 * yet: { length, regions (each one's region: its place in REGIONS), sides (1 left, -1 right),
 * fields (the rest, eight numbers a vertex) }. Held in columns, not an object a vertex: a third
 * of the room (a kit's own body's were 3 MB of objects), and what the skins' worker can be sent
 * as it is.
 */
export function measuredVertices(count) {
    return { length: count, regions: new Uint8Array(count), sides: new Int8Array(count), fields: new Float64Array(count * MEASURED) };
}

/** One vertex's measurements set (`measured`: vertexAt's). */
export function measureVertex(vertices, v, { region, side, armShare, legShare, arm, leg, foot, x, y, z }) {
    vertices.regions[v] = REGIONS.indexOf(region);
    vertices.sides[v] = side;
    vertices.fields.set([armShare, legShare, arm, leg, foot, x, y, z], v * MEASURED);
}

/**
 * One vertex's measurements, as a garment's region is asked of them (GARMENTS' `inside`), in
 * `out` (or a new object): { region, side, armShare, legShare, arm, leg, foot, x, y, z }.
 */
export function vertexAt(vertices, v, out = {}) {
    const { fields } = vertices;
    const at = v * MEASURED;

    out.region = REGIONS[vertices.regions[v]];
    out.side = vertices.sides[v];
    out.armShare = fields[at + ARM_SHARE];
    out.legShare = fields[at + LEG_SHARE];
    out.arm = fields[at + ARM];
    out.leg = fields[at + LEG];
    out.foot = fields[at + FOOT];
    out.x = fields[at + X];
    out.y = fields[at + Y];
    out.z = fields[at + Z];

    return out;
}

/** Every vertex's (vertexAt), an object each: for what looks through them all (tests, tools). */
export function everyVertex(vertices) {
    return Array.from({ length: vertices.length }, (_, v) => vertexAt(vertices, v));
}

/** The region one vertex is in (REGIONS'). */
export function regionAt(vertices, v) {
    return REGIONS[vertices.regions[v]];
}

/** Which side one vertex is on (1 left, -1 right). */
export function sideAt(vertices, v) {
    return vertices.sides[v];
}

/** How far along the foot one vertex is, from the ankle (0) to the ball of the foot (1). */
export function footAt(vertices, v) {
    return vertices.fields[v * MEASURED + FOOT];
}

// How far inside a garment's region each of the body's vertices is, its toes too (a footwear's
// toe box and all): the pictures', which are painted over all of it
function insidesOf(garment, { vertices, landmarks }) {
    const inside = new Float32Array(vertices.length);
    const point = {};

    for (let v = 0; v < vertices.length; v++) {
        inside[v] = insideAt(garment, landmarks, vertexAt(vertices, v, point), true);
    }

    return inside;
}

/**
 * How far inside a garment's region each of the body's vertices is (above 0 inside it; between
 * two, its edge: insideBetween). Footwear with a toe box stops at the ball of the foot, unless `toes`.
 */
export function insideOf(human, garment, { vertices, landmarks }, { toes = false } = {}) {
    const inside = new Float32Array(human.vertexCount);
    const point = {};

    for (let v = 0; v < human.vertexCount; v++) {
        inside[v] = human.partOf[v] === 0 ? insideAt(garment, landmarks, vertexAt(vertices, v, point), toes) : OUTSIDE;
    }

    return inside;
}

/** How far inside a garment's region a point of the body (measureBody, pointBetween) is. */
function insideAt(garment, landmarks, point, toes) {
    const value = garment.inside(point, landmarks);

    return Math.min(value, garment.toeBox && !toes && point.region === "foot" ? Math.min(1, TOE_CUT - point.foot) : 1);
}

/**
 * What's measured of the body (measureBody) between three of its vertices, by weights, as `out`:
 * what runs smoothly from vertex to vertex between them, its region the nearest's. (Field by
 * field: it's measured at every texel of every garment's picture)
 */
function pointBetween(vertices, a, b, c, wa, wb, wc, out) {
    const { fields } = vertices;
    const pa = a * MEASURED;
    const pb = b * MEASURED;
    const pc = c * MEASURED;
    const nearest = wa >= wb && wa >= wc ? a : wb >= wc ? b : c;

    out.region = REGIONS[vertices.regions[nearest]];
    out.side = vertices.sides[nearest];
    out.armShare = wa * fields[pa + ARM_SHARE] + wb * fields[pb + ARM_SHARE] + wc * fields[pc + ARM_SHARE];
    out.legShare = wa * fields[pa + LEG_SHARE] + wb * fields[pb + LEG_SHARE] + wc * fields[pc + LEG_SHARE];
    out.arm = wa * fields[pa + ARM] + wb * fields[pb + ARM] + wc * fields[pc + ARM];
    out.leg = wa * fields[pa + LEG] + wb * fields[pb + LEG] + wc * fields[pc + LEG];
    out.foot = wa * fields[pa + FOOT] + wb * fields[pb + FOOT] + wc * fields[pc + FOOT];
    out.x = wa * fields[pa + X] + wb * fields[pb + X] + wc * fields[pc + X];
    out.y = wa * fields[pa + Y] + wb * fields[pb + Y] + wc * fields[pc + Y];
    out.z = wa * fields[pa + Z] + wb * fields[pb + Z] + wc * fields[pc + Z];

    return out;
}

/**
 * How far along (0 to 1) from one of the body's vertices to another (`a` to `b`, `va` and `vb`
 * inside the garment's region and not) its edge crosses: measured along the way, not where a
 * line between `va` and `vb` crosses 0, well off where its region has a ridge (a strap's middle).
 */
export function insideBetween(garment, { vertices, landmarks }, a, b, va, vb, toes = false) {
    if (a > b) {
        return 1 - insideBetween(garment, { vertices, landmarks }, b, a, vb, va, toes);
    }

    const point = {};
    let [t0, f0, t1, f1] = [0, va, 1, vb];
    let t = va / (va - vb);
    let kept = 0;

    // (By false position, halving the side kept twice running)
    for (let step = 0; step < 30; step++) {
        const f = insideAt(garment, landmarks, pointBetween(vertices, a, b, b, 1 - t, t, 0, point), toes);

        if (Math.abs(f) < 1e-7) {
            break;
        }

        if ((f > 0) === (f0 > 0)) {
            [t0, f0] = [t, f];
            f1 = kept === -1 ? f1 / 2 : f1;
            kept = -1;
        } else {
            [t1, f1] = [t, f];
            f0 = kept === 1 ? f0 / 2 : f0;
            kept = 1;
        }

        t = t0 - (f0 * (t1 - t0)) / (f1 - f0);
    }

    return t;
}

// --- Painting garments: colour and relief from where each texel is on the body ---

/**
 * Where every texel of a (smaller) body texture is on the base body, for painting garments:
 * { size, covered, positions (3 floats a texel), bones (each texel's main bone), names (the
 * bones' names), triangles (the body triangle each texel is in, by its place in the body's
 * triangles), weights (how near it is to that triangle's first two corners: 2 floats a texel),
 * corners (each body triangle's three vertices), slopes (how those change, a texel across and
 * one down, in each body triangle: 4 floats a triangle) }.
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
    const slopes = new Float32Array((indices.length / 3) * 4);

    for (let t = 0; t < indices.length; t += 3) {
        const r = [indices[t], indices[t + 1], indices[t + 2]];
        const x = r.map((k) => uvs[k * 2] * size);
        const y = r.map((k) => (1 - uvs[k * 2 + 1]) * size);
        const v = r.map((k) => source[k]);
        const area = (x[1] - x[0]) * (y[2] - y[0]) - (x[2] - x[0]) * (y[1] - y[0]);

        if (Math.abs(area) < 1e-12) {
            continue;
        }

        slopes.set([(y[1] - y[2]) / area, (x[2] - x[1]) / area, (y[2] - y[0]) / area, (x[0] - x[2]) / area], (t / 3) * 4);

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

    return { size, covered, positions: where, bones, names: human.bones.map((bone) => bone.name), triangles, weights, corners, slopes, spread: spreadOf(size, covered) };
}

/** The bumpScale a composite's heights are for (compositeGarments). */
export const COMPOSITE_BUMP = 1.5;

// sRGB to linear and back (0 to 1)
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSRGB = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

/**
 * One picture of all a character's garments together, to draw them all at once (each is painted
 * on the whole body, and they're all laid out on the body's texture): at each texel, the
 * outermost garment that's there, on the body they're fitted to (`measures`), mixed across
 * their edges. `layers`, under ones first: { data (RGBA), bump (a byte a texel), tint (linear
 * [r, g, b], or null), bumpScale, roughness, metalness, garment (GARMENTS') }. Where none is,
 * the one nearest to being there. Returns { size, data (RGBA, sRGB), surface (RGBA: height,
 * roughness, metalness; heights for a bumpScale of COMPOSITE_BUMP) }.
 */
export function compositeGarments(map, layers, measures) {
    return allAtOnce(compositingGarments(map, layers, measures));
}

/**
 * How a garment's own picture is drawn: { bumpScale (its heights'), roughness, metalness }.
 */
export function surfaceOf(garment) {
    return { bumpScale: garment.metalness ? 0.6 : 1.5, roughness: garment.roughness ?? 0.8, metalness: garment.metalness ?? 0 };
}

/**
 * What a people's make of a garment (`base`: liveries.js) is tinted by, drawn with the picture of
 * the one it's made from: linear [r, g, b], which that picture's colour times is its own. Null
 * for a garment with a picture of its own.
 */
export function tintOf(garment) {
    if (!garment.base) {
        return null;
    }

    const [from, to] = [linearColour(GARMENTS[garment.base].colour), linearColour(garment.colour)];

    return [to.r / Math.max(0.03, from.r), to.g / Math.max(0.03, from.g), to.b / Math.max(0.03, from.b)];
}

/**
 * An outfit's two pictures put together from its garments' own (`ids`, outermost last), a step
 * at a time, wherever they're put together (the page, wardrobe.js; the skins' worker,
 * garment-painter.js: the same pictures either way). `pictureOf(id)`: steps (a generator's)
 * that return a garment's picture as it's drawn, { data, bump } (a people's make of one: the
 * picture of the one it's tinted from), painted first if need be. Returns them as they're
 * painted (`full`: { data, surface }, bytes, `map.size` a side) and at the least size they're
 * held at (`small`: { data, surface }, `least` a side; its `data` null unless `colour`: only its
 * heights are wanted of an outfit made whole again, wardrobe.js `again`).
 */
export function* picturingOutfit(map, measures, ids, pictureOf, { least = map.size, colour = true } = {}) {
    const layers = [];

    // (Each garment's own picture painted, in steps the first time: then them all)
    for (const id of ids) {
        const garment = GARMENTS[id];
        const { data, bump } = yield* pictureOf(id);

        layers.push({ data, bump, tint: tintOf(garment), ...surfaceOf(GARMENTS[garment.base] ?? garment), garment });
        yield;
    }

    const { size, data, surface } = yield* compositingGarments(map, layers, measures);
    const full = { data: bytes(data), surface: bytes(surface) };

    yield;

    return { full, small: { data: colour ? yield* reducing(full.data, size, least, true) : null, surface: yield* reducing(full.surface, size, least, false) } };
}

// A picture's bytes, as a texture takes them
function bytes(data) {
    return new Uint8Array(data.buffer, data.byteOffset, data.length);
}

/**
 * A colour as garments have theirs (0xrrggbb, "#rrggbb" or "#rgb") in linear light: { r, g, b },
 * 0 to 1, as three.js's Color has it, to the last bit (its numbers: a picture painted here or in
 * the skins' worker, which has no three.js, is the same picture).
 */
export function linearColour(value) {
    const linear = (c) => (c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4));

    if (typeof value === "string" && /^#[A-Fa-f\d]{3}$/.test(value)) {
        return { r: linear(parseInt(value.charAt(1), 16) / 15), g: linear(parseInt(value.charAt(2), 16) / 15), b: linear(parseInt(value.charAt(3), 16) / 15) };
    }

    if (typeof value === "string" && !/^#[A-Fa-f\d]{6}$/.test(value)) {
        throw new Error(`A garment's colour is a number or "#rrggbb", not ${value}`);
    }

    const hex = Math.floor(typeof value === "string" ? parseInt(value.slice(1), 16) : value);

    return { r: linear(((hex >> 16) & 255) / 255), g: linear(((hex >> 8) & 255) / 255), b: linear((hex & 255) / 255) };
}

// One colour mixed towards another (`t` of the way) into `out` (which may be the first), as
// three.js's Color.lerp mixes them
function mix(out, a, b, t) {
    out.r = a.r + (b.r - a.r) * t;
    out.g = a.g + (b.g - a.g) * t;
    out.b = a.b + (b.b - a.b) * t;

    return out;
}

// How many texels the garments' pictures are painted (or put together) a step
const TEXELS_A_STEP = 16384;

// How many texels past its edge each garment's picture is drawn wholly over what's under it, then
// mixed with it as much as it covers of each texel (all one's or the other's, edges were serrated)
const EDGE_TEXELS = 0.5;

// How near its edge (about metres) a texel must be for a garment to be mixed into it at all
const EDGE_REACH = 0.02;

/** The same (compositeGarments), a step at a time (each a yield: a few rows of texels), returning it. */
export function* compositingGarments(map, layers, measures) {
    const { size, covered, triangles, weights, corners, slopes } = map;
    const { vertices, landmarks } = measures;
    const point = {};
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

    // How far inside each garment's region each of the body's vertices is (how fast that changes
    // across a texel, between its triangle's corners)
    const insides = layers.map(({ garment }) => insidesOf(garment, measures));
    const colour = [0, 0, 0, 0, 0, 0];

    for (let i = 0; i < count; i++) {
        if (i % TEXELS_A_STEP === 0) {
            yield;
        }

        if (!covered[i]) {
            continue;
        }

        const t = triangles[i];
        const a = corners[t * 3];
        const b = corners[t * 3 + 1];
        const c = corners[t * 3 + 2];
        const w0 = weights[i * 2];
        const w1 = weights[i * 2 + 1];
        const w2 = 1 - w0 - w1;
        let measured = false;

        // Each garment there over those under it, as much of the texel as it covers (the innermost
        // wholly); where none is, the one nearest to being there. (Measured there near its edge;
        // between its triangle's corners where they're all inside it or all well outside, as the
        // triangle's all kept or all cut away: cutGarment)
        let shown = false;
        let nearest = -1;
        let nearness = -Infinity;

        for (let g = 0; g < layers.length; g++) {
            const inside = insides[g];
            const ia = inside[a];
            const ib = inside[b];
            const ic = inside[c];
            let value = w0 * ia + w1 * ib + w2 * ic;
            let share = 0;

            if (Math.min(ia, ib, ic) > 0) {
                share = 1;
            } else if (Math.max(ia, ib, ic) > -EDGE_REACH) {
                if (!measured) {
                    pointBetween(vertices, a, b, c, w0, w1, w2, point);
                    measured = true;
                }

                value = insideAt(layers[g].garment, landmarks, point, true);

                const change = Math.hypot((ia - ic) * slopes[t * 4] + (ib - ic) * slopes[t * 4 + 2], (ia - ic) * slopes[t * 4 + 1] + (ib - ic) * slopes[t * 4 + 3]);

                share = value > 0 ? 1 : value > -EDGE_REACH && change > 1e-9 ? Math.min(1, Math.max(0, value / change + 0.5 + EDGE_TEXELS)) : 0;
            }

            if (share > 0) {
                blend(colour, layers[g], looks[g], i, shown ? share : 1);
                shown = true;
            }

            if (value > nearness) {
                nearest = g;
                nearness = value;
            }
        }

        if (!shown) {
            blend(colour, layers[nearest], looks[nearest], i, 1);
        }

        for (let k = 0; k < 3; k++) {
            data[i * 4 + k] = colour[k];
            surface[i * 4 + k] = colour[k + 3];
        }

        data[i * 4 + 3] = 255;
        surface[i * 4 + 3] = 255;
    }

    yield;
    dilate(map, data);
    yield;
    dilate(map, surface);

    return { size, data, surface };
}

/** A garment's picture at texel `i` mixed into `colour` ([r, g, b, height, roughness, metalness]) by `share`. */
function blend(colour, layer, look, i, share) {
    const { data, bump } = layer;
    const { tables } = look;

    for (let k = 0; k < 3; k++) {
        const own = tables ? tables[k][data[i * 4 + k]] : data[i * 4 + k];

        colour[k] += (own - colour[k]) * share;
    }

    colour[3] += (128 + (bump[i] - 128) * look.height - colour[3]) * share;
    colour[4] += (look.roughness - colour[4]) * share;
    colour[5] += (look.metalness - colour[5]) * share;
}

/**
 * Paint a garment's texture: { data (RGBA), bump (one byte a texel), size }, on the body it's
 * fitted to (`measures`: character.js referenceMeasures): its trims along its edges, measured at
 * each texel as they're cut; its emblem, bands and lacing by the body's landmarks. One cut from a
 * design is painted white (its material's colour tints it), clear where there's no fabric.
 */
export function paintGarment(map, garment, measures = null) {
    return allAtOnce(paintingGarment(map, garment, measures));
}

// How wide (metres) the edges of what's painted on a garment are softened, so a trim's or an
// emblem's edge is clean at a few millimetres a texel (two or three texels), not stepped
const SOFT = 0.004;

// How much of a border `width` wide along a garment's edge a point `edge` inside it is in (0 to 1),
// softened at its inner side
const border = (edge, width) => smoothstep(width + SOFT, width - SOFT, edge);

// The patterns painted by how far inside the garment's edge they are; how far inside it (metres)
// the deepest of them but beads reaches (the vine's leaves), and how far outside it one is drawn
// (a texel or two). Beyond those, by its triangle's corners: a triangle wholly inside or outside
// them is all kept or all cut away (cutGarment), and measuring every texel's twice as slow
const EDGED = new Set(["surcoat", "trim", "vine", "web", "fret", "beads"]);
const EDGE_PAINTED = Object.freeze({ inside: 0.1, outside: 0.02 });

// How far below the chest (metres, on a body 1.7 m tall) the middle of an emblem is, and how much
// bigger than its `size` it's painted
const EMBLEM = Object.freeze({ below: 0.045, scale: 1.3 });

// Where each texel is on the body garments' pictures are painted for: { measures, points (x, y,
// z, how much it moves with the limbs: 4 floats a texel) } by texel map, kept for the next
const texelPoints = new WeakMap();

function pointsOf(map, measures) {
    if (texelPoints.get(map)?.measures !== measures) {
        const { size, covered, triangles, weights, corners } = map;
        const points = new Float32Array(size * size * 4);
        const point = {};

        for (let i = 0; i < size * size; i++) {
            if (covered[i]) {
                const t = triangles[i] * 3;
                const w0 = weights[i * 2];
                const w1 = weights[i * 2 + 1];
                const { x, y, z, armShare, legShare } = pointBetween(measures.vertices, corners[t], corners[t + 1], corners[t + 2], w0, w1, 1 - w0 - w1, point);

                points[i * 4] = x;
                points[i * 4 + 1] = y;
                points[i * 4 + 2] = z;
                points[i * 4 + 3] = armShare + legShare;
            }
        }

        texelPoints.set(map, { measures, points });
    }

    return texelPoints.get(map).points;
}

/**
 * Where each texel is on the body garments are painted for (pointsOf's, kept for the next
 * garment painted on a texel map: 4 MB at 512) let go of: worked out again for the next.
 */
export function forgetPoints(map) {
    texelPoints.delete(map);
}

/** How many bytes of it are kept for a texel map now. */
export function pointsHeld(map) {
    return texelPoints.get(map)?.points.byteLength ?? 0;
}

// Where in a texel (and round it) an emblem is looked for, across and up: four by four
const EMBLEM_SAMPLES = Object.freeze([-0.75, -0.25, 0.25, 0.75]);

/**
 * The same (paintGarment), painted a step at a time (each a yield: a few rows of texels), returning
 * it. `measures` is wanted for all but one cut from a design.
 */
export function* paintingGarment(map, garment, measures = null) {
    if (garment.design) {
        return paintDesign(map, garment.design);
    }

    const { size, covered, triangles, weights, corners } = map;
    const { vertices, landmarks } = measures;
    const point = {};
    const s = landmarks.height / 1.7;
    const count = size * size;
    const data = new Uint8ClampedArray(count * 4);
    const bump = new Uint8ClampedArray(count);
    const colour = linearColour(garment.colour);
    const trim = linearColour(garment.trim ?? garment.colour);
    const pattern = garment.pattern ?? "cloth";
    const mark = garment.emblem ? { mark: garment.emblem.mark, colour: linearColour(garment.emblem.colour), size: (garment.emblem.size ?? 0.075) * EMBLEM.scale * s } : null;
    const emblemY = landmarks.chest - EMBLEM.below * s;
    // (A third colour, for the peoples' everyday dress: its bands' and beads' and frets')
    const accent = linearColour(garment.accent ?? garment.trim ?? garment.colour);
    const mixed = { r: 0, g: 0, b: 0 };
    // (How far inside its edge each of the body's vertices is, if it's painted by that, and how
    // far inside that's measured at each texel: beads all over)
    const inside = EDGED.has(pattern) ? insidesOf(garment, measures) : null;
    const inward = pattern === "beads" ? Infinity : EDGE_PAINTED.inside;
    const points = pointsOf(map, measures);

    for (let i = 0; i < count; i++) {
        if (i % TEXELS_A_STEP === 0) {
            yield;
        }

        if (!covered[i]) {
            continue;
        }

        // (Where it is on the body, and how far inside the garment's edge: measured there near
        // it, between its triangle's corners further off)
        const t = triangles[i] * 3;
        const a = corners[t];
        const b = corners[t + 1];
        const k = corners[t + 2];
        const w0 = weights[i * 2];
        const w1 = weights[i * 2 + 1];
        const w2 = 1 - w0 - w1;
        const x = points[i * 4];
        const y = points[i * 4 + 1];
        const z = points[i * 4 + 2];
        const limb = points[i * 4 + 3] > 0.5;
        let edge = 0;

        if (inside) {
            const least = Math.min(inside[a], inside[b], inside[k]);
            const most = Math.max(inside[a], inside[b], inside[k]);

            edge = least > inward || most < -EDGE_PAINTED.outside ? w0 * inside[a] + w1 * inside[b] + w2 * inside[k] : insideAt(garment, landmarks, pointBetween(vertices, a, b, k, w0, w1, w2, point), true);
        }

        // (How light and how raised it is there: each pattern's own, plain cloth's for any other)
        let shade;
        let height;
        let c = colour;

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
                if (z > 0 && Math.abs(x) < 0.028 * s) {
                    const frac = (value) => value - Math.floor(value);
                    const cross = Math.min(Math.abs(frac(((y + Math.abs(x)) * 43) / s) - 0.5), Math.abs(frac(((y - Math.abs(x)) * 43) / s) - 0.5));

                    if (cross < 0.12) {
                        c = trim;
                        height += 0.25;
                    } else if (Math.abs(x) < 0.01 * s) {
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

                // Trimmed all round its edges: the neck, the arms and the hem
                const band = border(edge, 0.022);

                c = mix(mixed, colour, trim, band);
                height += 0.2 * band;
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

                // A band of embroidered trim all round its edges: the neck, the sleeves and the hem
                const band = border(edge, 0.016);

                c = mix(mixed, colour, trim, band);
                height += 0.2 * band;
                break;
            }
            case "vine":
            case "web":
            case "bands":
            case "fret":
            case "hide":
            case "fur":
            case "beads":
            case "bangles": {
                [c, shade, height] = everydayAt(pattern, x, y, z, { colour, trim, accent, edge, limb, landmarks });
                break;
            }
            default: {
                const weave = fbm(x * 160, y * 160, z * 160, 2);

                shade = 0.9 + 0.12 * (weave - 0.5) + 0.06 * (fbm(x * 10, y * 10, z * 10, 2) - 0.5);
                height = 0.5 + 0.2 * (weave - 0.5);
            }
        }

        // (The people's emblem on the chest, embroidered or painted: its edge softened, from how
        // much of the texel and round it it takes, sixteen points of it)
        if (mark && z > 0.03 * s && Math.abs(x) < mark.size * 1.2 && Math.abs(y - emblemY) < mark.size * 1.2) {
            const [u, v] = [x / mark.size, (y - emblemY) / mark.size];
            const d = SOFT / mark.size / 2;
            let taken = 0;

            for (const du of EMBLEM_SAMPLES) {
                for (const dv of EMBLEM_SAMPLES) {
                    taken += emblemAt(mark.mark, u + du * d, v + dv * d) ? 1 / 16 : 0;
                }
            }

            if (taken > 0) {
                c = mix(mixed, c, mark.colour, taken);
                height += 0.15 * taken;
            }
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

/**
 * The peoples' everyday dress (dress.js): each one's own work on its cloth, at a point of the body
 * it's painted from (x across, y up, z forward: metres; paintGarment), `edge` metres inside its
 * edge (on a `limb`, an arm's or a leg's), in its colours (`colour`, `trim`, `accent`), by the body's
 * `landmarks`: [colour, shade, height]. Sized to show at the textures' few millimetres a texel.
 *
 *  - vine (the elves'): a band along its edges, and a trailing vine in leaf inside it, a leaf off
 *    its winding stem to either side by turns (round the neck and the hem: on the sleeves, the band);
 *  - web (the dark elves'): a spider's web in silver thread across the chest from its middle, a
 *    band along its edges;
 *  - bands (the cat folk's): bold bands round the body, their edges zigzagged, in three colours;
 *  - fret (the lizard folk's): stepped frets in a band along its edges, edged with the third
 *    colour, a row of diamonds across the chest;
 *  - hide (the orcs'): patches of hide each its own shade, stitched together;
 *  - fur: long hair, streaked, its tips lighter;
 *  - beads: rows of beads along its edges, by turns in the three colours;
 *  - bangles: rings of metal round the wrists.
 */
function everydayAt(pattern, x, y, z, { colour, trim, accent, edge, limb, landmarks }) {
    const weave = fbm(x * 160, y * 160, z * 160, 2);
    const cloth = 0.9 + 0.12 * (weave - 0.5) + 0.06 * (fbm(x * 10, y * 10, z * 10, 2) - 0.5);
    const round = Math.atan2(x, z);
    const frac = (value) => value - Math.floor(value);
    // (Across and up the chest, from the middle of its breast: as wide as MakeHuman's base body
    // is, which the patterns were drawn at)
    const s = (landmarks.height / 1.7) * 1.29;
    const [across, up] = [x / s, (y - landmarks.chest) / s];

    switch (pattern) {
        case "vine": {
            // (A band along its edges, and a vine in leaf inside it, a leaf off its winding stem
            // to either side by turns: on a sleeve, the band)
            const leafy = (inward) => {
                const stem = 0.009 * Math.sin(round * 7);
                const turn = (round * 7) / (2 * Math.PI) + 0.25;
                const side = Math.floor(turn) % 2 ? 1 : -1;
                const [du, dv] = [(frac(turn) - 0.5) / 0.26, (inward - stem - side * 0.013) / 0.008];

                return Math.abs(inward - stem) < 0.0035 || du * du + dv * dv < 1;
            };

            if (Math.abs(edge - 0.011) < 0.007 || (!limb && leafy(edge - 0.042))) {
                return [trim, 1, 0.65];
            }

            return [colour, cloth, 0.5 + 0.2 * (weave - 0.5)];
        }
        case "web": {
            const [u, v] = [across, up + 0.011];
            const reach = Math.hypot(u, v);
            const spoke = Math.abs(Math.sin(Math.atan2(v, u) * 4)) * reach;
            const ring = Math.abs(frac(reach / 0.04) - 0.5) * 0.04;

            if (edge < 0.016 || (!limb && z > 0.03 && reach < 0.17 && (spoke < 0.0022 || ring < 0.0016))) {
                return [trim, 1, 0.62];
            }

            return [colour, cloth * 0.95, 0.5 + 0.2 * (weave - 0.5)];
        }
        case "bands": {
            // (Bands 3 cm deep, by turns the main colour, the trim, the main and the third, their
            // edges zigzagging round the body)
            const zig = 0.007 * Math.abs(frac(round * 6 / Math.PI) - 0.5) * 2;
            const band = Math.floor((up + zig) / 0.03);
            const of = ((band % 4) + 4) % 4;

            return [[colour, trim, colour, accent][of], cloth, 0.5 + 0.2 * (weave - 0.5) + (of % 2 ? 0.08 : 0)];
        }
        case "fret": {
            // (A band 4 cm deep along its edges, a centimetre in, edged in the third colour, its
            // frets stepping round: each step 1 cm, up and along by turns)
            const v = (edge - 0.03) / 0.02;

            if (Math.abs(v) < 1) {
                if (Math.abs(v) > 0.78) {
                    return [accent, 1, 0.62];
                }

                const step = Math.floor((round * 0.15) / 0.01);
                const rise = Math.floor((v + 0.78) / 0.39);

                return [(step + rise) % 4 < 2 ? trim : colour, cloth, 0.58];
            }

            // (A row of diamonds across the chest)
            const [du, dv] = [Math.abs(frac(across / 0.035) - 0.5), Math.abs(up - 0.011) / 0.015];

            if (!limb && z > 0.03 && du + dv * 0.5 < 0.5 && dv < 1) {
                return [accent, 1, 0.6];
            }

            return [colour, cloth, 0.5 + 0.2 * (weave - 0.5)];
        }
        case "hide": {
            // (Patches round seeds 8 cm apart: the nearest two's, and how near the edge between them)
            const cell = 0.08;
            const [ci, cj, ck] = [Math.floor(x / cell), Math.floor(y / cell), Math.floor(z / cell)];
            let [first, second, which] = [Infinity, Infinity, 0];

            for (let i = ci - 1; i <= ci + 1; i++) {
                for (let j = cj - 1; j <= cj + 1; j++) {
                    for (let k = ck - 1; k <= ck + 1; k++) {
                        const seed = [hash3(i, j, k), hash3(j, k, i), hash3(k, i, j)];
                        const d = Math.hypot(x - (i + seed[0]) * cell, y - (j + seed[1]) * cell, z - (k + seed[2]) * cell);

                        if (d < first) {
                            [second, first, which] = [first, d, seed[0]];
                        } else if (d < second) {
                            second = d;
                        }
                    }
                }
            }

            const grain = fbm(x * 90, y * 90, z * 90, 3);

            // (Stitched along the seams: a dash every centimetre)
            if (second - first < 0.004) {
                return frac((x + y + z) / 0.012) < 0.55 ? [trim, 1, 0.7] : [colour, 0.6, 0.3];
            }

            return [colour, 0.78 + 0.28 * which + 0.08 * (grain - 0.5), 0.5 + 0.25 * (grain - 0.5)];
        }
        case "fur": {
            const streak = fbm(x * 260, y * 36, z * 260, 3);

            return [colour, 0.62 + 0.62 * streak, 0.25 + 0.7 * streak];
        }
        case "beads": {
            // (Rows a centimetre apart in from its edges, each a string of beads by turns in the
            // three colours, dark between them)
            const row = edge / 0.011;
            const across = frac((round * 0.16) / 0.011);
            const [du, dv] = [across - 0.5, frac(row) - 0.5];

            if (du * du + dv * dv > 0.16) {
                return [colour, 0.35, 0.2];
            }

            return [[colour, trim, accent][((Math.floor(row) % 3) + 3) % 3], 1.05, 0.8];
        }
        case "bangles": {
            const ring = Math.abs(Math.sin(y * 520));

            return [colour, 0.75 + 0.35 * ring, 0.3 + 0.6 * ring];
        }
        default:
            return [colour, cloth, 0.5];
    }
}

// An emblem's shape: whether a point (u to one side, v up: -1 to 1 across it) is in it

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
