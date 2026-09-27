// Folk made up as they're wanted: a look for anyone in a building (the barkeep, a serving wench, a
// drover on a bench, whoever keeps the rooms, a courtesan...) from their part, their sex and a
// seed of their own, so no two taverns' folk look alike. Their body (height, build, bust, belly,
// face), where their forebears came from and the skin, eyes and hair that go with it, how they
// wear their hair and beard, and what they wear for their part, each picked from the seed.
// Wenches and Ale's folk keep their own looks (presets.js FOLK). Pure data, no DOM.

import { createRandom } from "../core/random.js";
import { HAIR_COLOURS, SKIN_TONES } from "./skin.js";

// Where their forebears came from ([african, asian, caucasian]), with the skin, eyes and hair
// most of them have
const LINEAGES = [
    { mix: [0.1, 0.1, 0.8], tones: ["porcelain", "fair", "light"], irises: ["#5a6f7e", "#4f6b3a", "#3b5a7a", "#6b7f8e", "#5b4a36"], hair: ["brown", "darkBrown", "auburn", "red", "blond", "platinum", "black"] },
    { mix: [0.1, 0.3, 0.6], tones: ["light", "medium", "olive"], irises: ["#533626", "#5b4a36", "#2e1f16"], hair: ["black", "darkBrown", "brown"] },
    { mix: [0.2, 0.1, 0.7], tones: ["medium", "olive", "tan"], irises: ["#533626", "#3b2a1c", "#4f6b3a"], hair: ["black", "darkBrown", "brown", "auburn"] },
    { mix: [0.6, 0.1, 0.3], tones: ["tan", "brown", "dark"], irises: ["#3b2a1c", "#2e1f16"], hair: ["black", "darkBrown"] },
    { mix: [0.85, 0.05, 0.1], tones: ["brown", "dark", "deep"], irises: ["#2e1f16", "#3b2a1c"], hair: ["black"] },
    { mix: [0.05, 0.7, 0.25], tones: ["fair", "light", "medium"], irises: ["#2e1f16", "#3b2a1c", "#533626"], hair: ["black", "darkBrown"] },
];

// What each part wears, by sex (a list of choices for each slot: one picked from each; null for
// nothing there), how they wear their hair, and their build
const PARTS = {
    barkeep: {
        m: { wear: [["shirt"], ["trousers", "breeches"], ["boots"], ["belt"], ["apron"]], hair: ["bald", "buzz", "short", "swept"], beard: ["full", "short", "stubble", "goatee"], build: { weight: [0.6, 0.9], muscle: [0.45, 0.65], belly: [0.3, 0.9] } },
        f: { wear: [["chemise"], ["bodice"], ["kirtle", "skirt"], ["boots"], ["apron"]], hair: ["bob", "ponytail", "topknot"], build: { weight: [0.55, 0.8], muscle: [0.45, 0.6] } },
    },
    wench: { f: { wear: [["chemise"], ["bodice"], ["skirt", "greenSkirt", "kirtle"], ["boots"], ["tankard"]], hair: ["ponytail", "bob", "long", "topknot"], build: { weight: [0.38, 0.6], muscle: [0.38, 0.5], bust: [0.55, 0.9] } } },
    patron: {
        m: { wear: [["tunic", "greenTunic", "blueTunic", "shirt"], [null, null, "jerkin"], ["trousers", "breeches"], ["boots"], ["belt"], ["tankard"]], hair: ["short", "swept", "buzz", "bald", "short"], beard: ["short", "full", "stubble", "none", "goatee"], build: { weight: [0.4, 0.85], muscle: [0.4, 0.75], belly: [0, 0.7] } },
        f: { wear: [["chemise"], [null, "bodice"], ["kirtle", "skirt", "greenSkirt"], ["boots"], ["tankard"]], hair: ["long", "bob", "ponytail", "topknot"], build: { weight: [0.4, 0.75], muscle: [0.4, 0.55], bust: [0.45, 0.85] } },
    },
    innkeeper: {
        m: { wear: [["shirt"], ["jerkin"], ["trousers", "breeches"], ["boots"], ["belt"]], hair: ["short", "swept", "bald"], beard: ["short", "stubble", "goatee", "none"], build: { weight: [0.45, 0.8], muscle: [0.4, 0.6], belly: [0, 0.6] } },
        f: { wear: [["chemise"], ["bodice", "velvetBodice"], ["kirtle", "skirt"], ["boots"]], hair: ["topknot", "bob", "ponytail"], build: { weight: [0.45, 0.75], muscle: [0.4, 0.5], bust: [0.5, 0.85] } },
    },
    madam: { f: { wear: [["chemise"], ["velvetBodice"], ["gown"], ["boots"]], hair: ["topknot", "long"], build: { weight: [0.5, 0.7], muscle: [0.32, 0.42], bust: [0.7, 1] } } },
    courtesan: { f: { wear: "lingerie", hair: ["long", "long", "bob", "ponytail", "topknot"], build: { weight: [0.4, 0.55], muscle: [0.38, 0.46], bust: [0.6, 1] } } },
};

// A courtesan's lingerie: one colour, and what goes with it
const LINGERIE = ["Black", "Crimson", "Emerald", "Ivory"];

// Grey with age (the greybeard), or now and then
const GREY = ["grey", "white"];

/**
 * A look for one of the folk: { shape, look, equipment, walk } (as presets.js FOLK's), from
 * `one`: { role (roles.js: barkeep, barmaid, patron, innkeeper, madam, courtesan), local (their
 * part: wench, greybeard...), sex ("f" or "m"), seed }.
 */
export function folkLook({ role, local = role, sex = "m", seed = 1 }) {
    const random = createRandom(seed * 2654435761 + 97);
    const part = role === "barmaid" ? "wench" : role;
    const spec = PARTS[part]?.[sex] ?? PARTS.patron[sex] ?? PARTS.patron.m;
    const lineage = random.pick(LINEAGES);
    const [african, asian, caucasian] = lineage.mix.map((share) => Math.max(0, share + random.range(-0.08, 0.08)));
    const total = african + asian + caucasian;
    const between = ([least, most]) => random.range(least, most);
    const { build } = spec;
    const old = local === "greybeard" || random.chance(0.08);

    // The body: a man or a woman, as tall and heavy and strong as their part has them
    const macro = {
        gender: sex === "f" ? 0 : 1,
        muscle: between(build.muscle),
        weight: between(build.weight),
        height: random.range(0.4, 0.62),
        african: african / total,
        asian: asian / total,
        caucasian: caucasian / total,
    };
    const details = { jawWidth: random.range(-0.2, 0.5), cheekbones: random.range(-0.1, 0.5), lips: random.range(0, 0.5), noseWidth: random.range(-0.3, 0.3), eyeSize: random.range(-0.1, 0.25) };

    if (sex === "f") {
        macro.bust = between(build.bust);
    } else {
        details.belly = build.belly ? between(build.belly) : 0;
        details.shoulders = random.range(0, 0.4);
    }

    if (part === "courtesan") {
        Object.assign(details, { waist: random.range(-0.9, -0.6), hips: random.range(0.14, 0.28), buttocks: random.range(0.4, 0.55), thighs: random.range(0, 0.1) });
    }

    // Skin, eyes and hair as their forebears had them
    const colour = old ? random.pick(GREY) : random.pick(lineage.hair);
    const look = {
        skin: { tone: SKIN_TONES[random.pick(lineage.tones)], blush: random.range(0.3, 0.75), brows: random.range(0.5, 0.9), freckles: lineage.tones.includes("fair") && random.chance(0.3) ? random.range(0.2, 0.5) : 0 },
        eyes: { iris: random.pick(lineage.irises) },
        hair: { style: random.pick(spec.hair), beard: sex === "m" ? random.pick(spec.beard ?? ["none"]) : "none", colour: HAIR_COLOURS[colour] },
    };

    if (old) {
        look.skin.browColour = HAIR_COLOURS.grey;
    }

    // What they wear
    let equipment;

    if (spec.wear === "lingerie") {
        const shade = random.pick(LINGERIE);
        const legs = shade === "Black" && random.chance(0.4) ? "fishnets" : `stockings${shade}`;

        equipment = [`laceBra${shade}`, `laceBriefs${shade}`, random.chance(0.3) ? "corset" : `suspenders${shade}`, legs];

        if (random.chance(0.4)) {
            equipment.push("choker");
        }
    } else {
        equipment = spec.wear.map((choices) => random.pick(choices)).filter(Boolean);
    }

    return { label: local, shape: { macro, details }, look, equipment, walk: "natural" };
}
