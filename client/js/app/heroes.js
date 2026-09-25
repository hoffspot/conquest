// Player characters: what a new one looks like before it's changed, random ones (the character
// maker's Random button) and names to suggest.
//
// A hero is plain data, saved as it is (save.js): { name, shape: { macro, details }, look: { skin,
// eyes, hair }, weapon }.

import { DETAILS } from "../characters/details.js";
import { BEARDS, HAIRSTYLES } from "../characters/hair.js";
import { MACRO_DEFAULTS } from "../characters/macro.js";
import { PRESETS } from "../characters/presets.js";
import { EYE_DEFAULTS, HAIR_COLOURS, SKIN_DEFAULTS, SKIN_TONES } from "../characters/skin.js";

/** Human skin tones, light to dark (the others are for orcs and the undead). */
export const HUMAN_TONES = Object.freeze(Object.fromEntries(Object.entries(SKIN_TONES).filter(([name]) => !["orc", "darkOrc", "ash", "pale"].includes(name))));

/** Eye colours to choose from. */
export const IRIS_COLOURS = Object.freeze({ brown: "#6a4a2c", hazel: "#7a6a3a", green: "#4f6b3a", blue: "#5a6f7e", grey: "#77807f", amber: "#a8791c" });

const NAMES = {
    female: ["Aelis", "Brenna", "Cerys", "Delia", "Elowen", "Fenna", "Gwen", "Hild", "Isolde", "Jessa", "Kaia", "Liora", "Maren", "Nessa", "Orla", "Petra", "Rowan", "Sabine", "Tamsin", "Wren", "Ysolde"],
    male: ["Aldric", "Bram", "Cedric", "Dorian", "Edmund", "Faolan", "Garrick", "Hale", "Ivo", "Jory", "Kellan", "Leof", "Madoc", "Nils", "Osric", "Perrin", "Rurik", "Stellan", "Tobin", "Wulfric", "Yorick"],
};

const clone = (value) => structuredClone(value);

/** A new hero, as the character maker starts: the human preset, not yet named or armed. */
export function defaultHero() {
    const preset = PRESETS.hero;

    return {
        name: "",
        shape: { macro: { ...MACRO_DEFAULTS, ...clone(preset.shape.macro) }, details: clone(preset.shape.details ?? {}) },
        look: { skin: { ...SKIN_DEFAULTS, ...clone(preset.look.skin) }, eyes: { ...EYE_DEFAULTS, ...clone(preset.look.eyes) }, hair: clone(preset.look.hair) },
        weapon: "sword",
    };
}

/** Is a body female (0), male (1) or in between, going by the gender slider? */
export function bodyKind(hero) {
    const gender = hero.shape.macro.gender;

    return gender < 0.35 ? "female" : gender > 0.65 ? "male" : "either";
}

/** A name as it's kept: trimmed, single-spaced, letters, spaces, apostrophes and hyphens. */
export function cleanName(name) {
    return String(name ?? "").replace(/[^\p{L}\p{M}' -]/gu, "").replace(/\s+/g, " ").trim().slice(0, 20);
}

/** A name to suggest for a hero (going by its body), not `except`. */
export function suggestName(hero, except = "", random = Math.random) {
    const kind = bodyKind(hero);
    const names = (kind === "either" ? [...NAMES.female, ...NAMES.male] : NAMES[kind]).filter((name) => name !== except);

    return names[Math.floor(random() * names.length)];
}

/**
 * A random hero (keeping its name and weapon): a body, a face, skin, eyes and hair, mostly
 * clearly a man or a woman, with hair and beards to suit.
 */
export function randomHero(hero = defaultHero(), random = Math.random) {
    const between = (low, high) => low + random() * (high - low);
    const pick = (list) => list[Math.floor(random() * list.length)];
    const roll = random();
    const gender = roll < 0.45 ? between(0, 0.15) : roll < 0.9 ? between(0.85, 1) : between(0.35, 0.65);
    const shares = [random(), random(), random()].map((share) => share ** 2 + 0.05);
    const total = shares.reduce((sum, share) => sum + share, 0);
    const details = {};

    for (const { id, decr } of DETAILS) {
        const value = (random() - 0.5) * 0.9;

        details[id] = Number((decr.length ? value : Math.max(0, value)).toFixed(2));
    }

    // Faces are a little varied; bodies less so (most are fit adventurers)
    for (const id of ["belly", "armLength", "legLength", "handSize", "footSize", "earPoint"]) {
        details[id] = Number((details[id] * 0.4).toFixed(2));
    }

    const female = gender < 0.5;
    const styles = female ? ["long", "bob", "ponytail", "swept", "short", "topknot"] : ["short", "swept", "buzz", "bald", "long", "ponytail", "mohawk", "topknot"];
    const beards = female || gender < 0.65 ? ["none"] : ["none", "stubble", "stubble", "short", "full", "goatee"];
    const tones = Object.values(HUMAN_TONES);
    const hairColours = Object.values(HAIR_COLOURS).filter((colour) => colour !== HAIR_COLOURS.white);

    return {
        ...hero,
        shape: {
            macro: {
                ...MACRO_DEFAULTS,
                gender: Number(gender.toFixed(2)),
                muscle: Number(between(0.35, 0.85).toFixed(2)),
                weight: Number(between(0.3, 0.62).toFixed(2)),
                height: Number(between(0.3, 0.75).toFixed(2)),
                bust: Number(between(0.25, 0.75).toFixed(2)),
                african: shares[0] / total,
                asian: shares[1] / total,
                caucasian: shares[2] / total,
            },
            details,
        },
        look: {
            skin: { ...SKIN_DEFAULTS, tone: pick(tones), blush: Number(between(0.3, 0.6).toFixed(2)), freckles: random() < 0.25 ? Number(between(0.1, 0.5).toFixed(2)) : 0, brows: Number(between(0.4, 0.8).toFixed(2)) },
            eyes: { ...EYE_DEFAULTS, iris: pick(Object.values(IRIS_COLOURS)) },
            hair: { style: pick(styles.filter((style) => HAIRSTYLES[style])), beard: pick(beards.filter((beard) => BEARDS[beard])), colour: pick(hairColours) },
        },
    };
}
