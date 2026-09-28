// Each people's look (docs/WAR.md M5): bodies adapted from the one there is (body.js: MakeHuman's),
// by their shape sliders (macro.js, details.js), their skin (skin.js: fur and scales painted on
// it), and parts of their own (equipment.js: cat folk's ears, and cat folk's and lizard folk's
// tails):
// - humans as they are (folk.js's lineages);
// - elves tall and slender, with long, pointed ears swept back, fine faces, fair skin and pale or
//   bright hair;
// - dark elves the same, in grey and violet, their hair white or silver, their eyes red or gold;
// - cat folk lithe, furred (striped, some of them), with a cat's ears on top of their heads, a
//   long tail, slit eyes, and a short, broad nose;
// - lizard folk broad and strong, scaled, with a snout and a heavy tail, no hair, slit eyes;
// - orcs as the orc is (presets.js), some taller or leaner, greener or browner, than he is, and
//   their women a little less heavy in the brow and jaw.
// Every one of a people is a little different, from a seed of their own. Pure data, no DOM.

import { createRandom } from "../core/random.js";
import { PRESETS } from "./presets.js";
import { HAIR_COLOURS } from "./skin.js";

/** The peoples whose looks are their own (humans are folk.js's). */
export const PEOPLES = Object.freeze(["elf", "darkElf", "cat", "lizard", "orc"]);

// A value between two, from the random numbers
const between = (random, [least, most]) => random.range(least, most);

/**
 * Each people's bodies: their build (macro sliders' ranges, by sex), their features (detail
 * sliders' ranges), their skin (tones and what's painted on it), eyes, hair, the parts of their
 * own they wear, and how they walk.
 */
export const LOOKS = Object.freeze({
    elf: {
        build: { m: { height: [0.64, 0.8], weight: [0.2, 0.34], muscle: [0.38, 0.55] }, f: { height: [0.6, 0.74], weight: [0.18, 0.32], muscle: [0.3, 0.45], bust: [0.3, 0.6] } },
        details: { earLength: [0.8, 1], earPoint: [0.85, 1], earTip: [0.6, 1], earBack: [0.5, 0.9], earHeight: [0.2, 0.5], cheekbones: [0.5, 0.9], jawWidth: [-0.7, -0.35], chin: [0, 0.3], noseWidth: [-0.6, -0.3], noseLength: [0, 0.3], eyeSize: [0.1, 0.35], browAngle: [0.2, 0.5], neckLength: [0.3, 0.7], shoulders: [-0.4, -0.1], waist: [-0.4, -0.1], legLength: [0.3, 0.6], armLength: [0.1, 0.3] },
        mix: [0.05, 0.15, 0.8],
        tones: ["#f3dcc8", "#ecd0b6", "#e0bf9e", "#d6ae88"],
        skin: { blush: [0.2, 0.45], brows: [0.35, 0.6], variation: [0.5, 0.8] },
        irises: ["#3fa6e8", "#56c48a", "#8fb8d8", "#7ccfb8", "#b58f3e"],
        hair: ["platinum", "blond", "auburn", "brown", "black"],
        styles: { m: ["long", "swept", "ponytail", "long"], f: ["long", "long", "ponytail", "topknot", "bob"] },
        beards: ["none"],
        parts: [],
    },
    darkElf: {
        build: { m: { height: [0.62, 0.78], weight: [0.2, 0.36], muscle: [0.42, 0.6] }, f: { height: [0.58, 0.72], weight: [0.18, 0.32], muscle: [0.32, 0.48], bust: [0.35, 0.65] } },
        details: { earLength: [0.8, 1], earPoint: [0.85, 1], earTip: [0.7, 1], earBack: [0.6, 1], earHeight: [0.2, 0.5], cheekbones: [0.6, 1], jawWidth: [-0.6, -0.3], chin: [0.1, 0.4], noseWidth: [-0.6, -0.3], noseHump: [0, 0.3], eyeSize: [0, 0.25], browAngle: [0.4, 0.8], neckLength: [0.3, 0.7], shoulders: [-0.3, 0], waist: [-0.45, -0.15], legLength: [0.3, 0.6], armLength: [0.1, 0.3] },
        mix: [0.2, 0.2, 0.6],
        tones: ["#8a7f99", "#7a7090", "#6c6282", "#9a90a8", "#5e566f"],
        skin: { blush: [0, 0.15], brows: [0.5, 0.8], variation: [0.4, 0.7], lips: ["#4a3d5a", "#3e3350", "#5a4868"], browColour: "#e8e4ee" },
        irises: ["#d23a3a", "#e0a03a", "#b98fff", "#e8d24a"],
        hair: ["white", "platinum", "grey", "white"],
        styles: { m: ["long", "swept", "ponytail", "mohawk"], f: ["long", "long", "ponytail", "topknot", "twintails"] },
        beards: ["none"],
        parts: [],
    },
    cat: {
        build: { m: { height: [0.45, 0.62], weight: [0.28, 0.44], muscle: [0.5, 0.7] }, f: { height: [0.42, 0.56], weight: [0.26, 0.4], muscle: [0.42, 0.55], bust: [0.35, 0.65] } },
        details: { earSize: [-1, -1], noseLength: [-0.6, -0.3], noseWidth: [0.2, 0.6], noseTip: [0.3, 0.7], mouthWidth: [-0.3, 0], lips: [-0.6, -0.3], eyeSize: [0.2, 0.5], browAngle: [0.1, 0.4], cheekbones: [0.4, 0.8], jawWidth: [-0.3, 0.1], waist: [-0.3, 0], legLength: [0.1, 0.3] },
        mix: [0.3, 0.2, 0.5],
        // Their fur's colour, what it's striped with (if it's striped), and their hair's
        furs: [
            { tone: "#b88a52", stripes: "#6b4a2a", hair: "#8a5e30" },
            { tone: "#c47a3a", stripes: "#7a3e16", hair: "#a3561f" },
            { tone: "#9a938c", stripes: "#4e4843", hair: "#6e6760" },
            { tone: "#3d3531", stripes: null, hair: "#241e1b" },
            { tone: "#dcc49a", stripes: "#a88652", hair: "#c8a870" },
            { tone: "#e8ddd0", stripes: "#9a8a78", hair: "#d6c8b8" },
        ],
        skin: { blush: [0, 0.1], brows: [0.2, 0.4], variation: [0.6, 1], fur: [0.8, 1], stripes: [0.5, 0.9] },
        irises: ["#d4a21c", "#8fcf3a", "#e0a03a", "#56c48a", "#3fa6e8"],
        slit: true,
        styles: { m: ["short", "swept", "mohawk", "long"], f: ["long", "bob", "ponytail", "twintails"] },
        beards: ["none"],
        parts: ["catEars", "catTail"],
    },
    lizard: {
        build: { m: { height: [0.52, 0.68], weight: [0.42, 0.6], muscle: [0.6, 0.85] }, f: { height: [0.48, 0.62], weight: [0.38, 0.52], muscle: [0.5, 0.7], bust: [0.1, 0.3] } },
        details: { snout: [0.8, 1], earSize: [-1, -1], noseWidth: [-0.7, -0.4], noseLength: [-0.4, 0], lips: [-1, -0.7], eyeSize: [-0.2, 0.1], browRidge: [0.6, 1], headSquare: [-0.4, 0], chin: [-0.6, -0.3], neck: [0.4, 0.8], neckLength: [0.1, 0.4], shoulders: [0.2, 0.6] },
        mix: [0.3, 0.3, 0.4],
        tones: ["#5f7d4a", "#4f6e5a", "#6b8a5a", "#7a8a4a", "#3f6b6b", "#6e7f3a"],
        skin: { blush: [0, 0], brows: [0, 0], variation: [0.8, 1.2], scales: [0.85, 1], lips: ["#3f4a33", "#35402e"] },
        irises: ["#e0a03a", "#e8d24a", "#d25a2a", "#b8c83a"],
        slit: true,
        hair: ["black"],
        styles: { m: ["bald"], f: ["bald"] },
        beards: ["none"],
        parts: ["lizardTail"],
    },
});

/**
 * A look for one of a people (a PEOPLES id): { shape: { macro, details }, look: { skin, eyes,
 * hair }, parts (the parts of their own they wear: equipment ids), walk }, a man or a woman
 * (`sex`), from a seed of their own. Orcs are each a little different from the orc (presets.js).
 */
export function peopleLook({ people, sex = "m", seed = 1 }) {
    if (people === "orc") {
        return orcLook({ sex, seed });
    }

    const spec = LOOKS[people];

    if (!spec) {
        return null;
    }

    const random = createRandom(seed * 2246822519 + 131);
    const build = spec.build[sex] ?? spec.build.m;
    const [african, asian, caucasian] = spec.mix.map((share) => Math.max(0, share + random.range(-0.06, 0.06)));
    const total = african + asian + caucasian;
    const macro = {
        gender: sex === "f" ? 0 : 1,
        muscle: between(random, build.muscle),
        weight: between(random, build.weight),
        height: between(random, build.height),
        african: african / total,
        asian: asian / total,
        caucasian: caucasian / total,
    };

    if (sex === "f") {
        macro.bust = between(random, build.bust);
    }

    const details = Object.fromEntries(Object.entries(spec.details).map(([id, range]) => [id, between(random, range)]));
    const fur = spec.furs ? random.pick(spec.furs) : null;
    const skin = {
        tone: fur?.tone ?? random.pick(spec.tones),
        blush: between(random, spec.skin.blush),
        brows: between(random, spec.skin.brows),
        variation: between(random, spec.skin.variation),
    };

    if (spec.skin.lips) {
        skin.lips = random.pick(spec.skin.lips);
    }

    if (spec.skin.browColour) {
        skin.browColour = spec.skin.browColour;
    }

    if (spec.skin.fur) {
        skin.fur = between(random, spec.skin.fur);
    }

    if (fur?.stripes && spec.skin.stripes) {
        skin.stripes = between(random, spec.skin.stripes);
        skin.stripeColour = fur.stripes;
    }

    if (spec.skin.scales) {
        skin.scales = between(random, spec.skin.scales);
    }

    const colour = fur?.hair ?? HAIR_COLOURS[random.pick(spec.hair)];

    return {
        shape: { macro, details },
        look: {
            skin,
            eyes: { iris: random.pick(spec.irises), ...(spec.slit ? { slit: true } : {}) },
            hair: { style: random.pick(spec.styles[sex] ?? spec.styles.m), beard: sex === "m" ? random.pick(spec.beards) : "none", colour },
        },
        parts: [...spec.parts],
        walk: "natural",
    };
}

// Orcs' skins: the orc's green, and near it
const ORC_TONES = ["#4c5c2e", "#56663a", "#44532a", "#5a5a30", "#4a5a3a", "#606b34"];

// One of the orcs, from the orc (presets.js): a little taller or shorter, leaner or heavier, their
// skin greener or browner, their hair worn their own way; their women less heavy in the brow and
// jaw, and not all of them painted
function orcLook({ sex, seed }) {
    const orc = PRESETS.orc;
    const random = createRandom(seed * 2246822519 + 131);
    const shape = structuredClone(orc.shape);
    const look = structuredClone(orc.look);

    Object.assign(shape.macro, { height: orc.shape.macro.height + random.range(-0.1, 0.06), weight: orc.shape.macro.weight + random.range(-0.15, 0.08), muscle: 1 - random.range(0, 0.2) });

    if (sex === "f") {
        Object.assign(shape.macro, { gender: 0, bust: random.range(0.35, 0.6), height: shape.macro.height - 0.06 });
        Object.assign(shape.details, { underbite: 0.6, jawWidth: 0.45, browRidge: 0.55, headSquare: 0.35, neck: 0.55, shoulders: 0.45, vShape: 0.3, eyeSize: -0.2 });
    }

    look.skin.tone = random.pick(ORC_TONES);

    if (random.chance(0.35)) {
        look.skin.warpaint = null;
    }

    look.hair.style = random.pick(sex === "f" ? ["topknot", "ponytail", "long", "mohawk"] : ["topknot", "mohawk", "bald", "topknot", "long"]);

    return { shape, look, parts: ["tusks"], walk: orc.walk };
}
