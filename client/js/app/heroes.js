// Player characters: what a new one looks like before it's changed, random ones (the character
// maker's Random button) and names to suggest.
//
// A hero is plain data, saved as it is (save.js): { name, shape: { macro, details }, look: { skin,
// eyes, hair }, weapon, race (their people: humans, or one of the others, docs/WAR.md M11), parts
// (their people's own: ears, tails, tusks) }.

import { DETAILS } from "../characters/details.js";
import { BEARDS, HAIRSTYLES } from "../characters/hair.js";
import { MACRO_DEFAULTS } from "../characters/macro.js";
import { LOOKS, peopleLook } from "../characters/peoples.js";
import { EYE_DEFAULTS, HAIR_COLOURS, SKIN_DEFAULTS, SKIN_TONES } from "../characters/skin.js";
import { createRandom } from "../core/random.js";
import { cleanName, defaultHero, HERO_PEOPLES } from "./hero-basics.js";

// (A hero's basics, apart so that what reads characters without drawing them needn't bring the engine)
export { cleanName, defaultHero, HERO_PEOPLES };

/** Human skin tones, light to dark (the others are for orcs and the undead). */
export const HUMAN_TONES = Object.freeze(Object.fromEntries(Object.entries(SKIN_TONES).filter(([name]) => !["orc", "darkOrc", "ash", "pale"].includes(name))));

/** Eye colours to choose from. */
export const IRIS_COLOURS = Object.freeze({ brown: "#6a4a2c", hazel: "#7a6a3a", green: "#4f6b3a", blue: "#5a6f7e", grey: "#77807f", amber: "#a8791c" });

const NAMES = {
    female: ["Aelis", "Brenna", "Cerys", "Delia", "Elowen", "Fenna", "Gwen", "Hild", "Isolde", "Jessa", "Kaia", "Liora", "Maren", "Nessa", "Orla", "Petra", "Rowan", "Sabine", "Tamsin", "Wren", "Ysolde"],
    male: ["Aldric", "Bram", "Cedric", "Dorian", "Edmund", "Faolan", "Garrick", "Hale", "Ivo", "Jory", "Kellan", "Leof", "Madoc", "Nils", "Osric", "Perrin", "Rurik", "Stellan", "Tobin", "Wulfric", "Yorick"],
};

const clone = (value) => structuredClone(value);

// Orcs' skins, as the orcs' own are (peoples.js)
const ORC_TONES = ["#4c5c2e", "#56663a", "#44532a", "#5a5a30", "#4a5a3a", "#606b34"];

/** The skin tones a hero of a people can have, to choose from: { name: colour }. */
export function tonesOf(race = "human") {
    const spec = LOOKS[race];
    const tones = race === "orc" ? ORC_TONES : (spec?.tones ?? spec?.furs?.map(({ tone }) => tone));

    return tones ? Object.fromEntries(tones.map((tone, k) => [`shade ${k + 1}`, tone])) : HUMAN_TONES;
}

/**
 * A hero become one of a people (keeping their name, weapon and whether they're a man or a
 * woman), looking as one of them does, from a random seed: a human as randomHero makes them.
 */
export function heroOfPeople(hero, race, random = Math.random) {
    if (!race || race === "human" || !HERO_PEOPLES.some(({ id }) => id === race)) {
        return randomHero({ ...hero, race: "human", parts: [] }, random);
    }

    const sex = (hero.shape?.macro?.gender ?? 1) < 0.5 ? "f" : "m";
    const look = peopleLook({ people: race, sex, seed: 1 + Math.floor(random() * 1e9) });

    return {
        ...hero,
        race,
        parts: [...look.parts],
        shape: { macro: { ...MACRO_DEFAULTS, ...clone(look.shape.macro) }, details: clone(look.shape.details) },
        look: { skin: { ...SKIN_DEFAULTS, ...clone(look.look.skin) }, eyes: { ...EYE_DEFAULTS, ...clone(look.look.eyes) }, hair: clone(look.look.hair) },
    };
}

/** Is a body female (0), male (1) or in between, going by the gender slider? */
export function bodyKind(hero) {
    const gender = hero.shape.macro.gender;

    return gender < 0.35 ? "female" : gender > 0.65 ? "male" : "either";
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
    // (One of another people: as one of them)
    if (hero.race && hero.race !== "human") {
        return heroOfPeople(hero, hero.race, random);
    }

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

// How many bodies of a seed the quick start can be asked for (`&hero=`: quickStartHero)
const QUICK_HEROES = 1000;

/**
 * The hero the quick start plays (`?play`, main.js: the tests' and developers' way straight into
 * a game, not a player's): a random one, named, made from the world's `seed` with the game's own
 * seeded numbers, so the same every time for a seed, in every browser. What's true of one body
 * isn't of every other (how high a tall one's hips ride in the saddle), so a test's hero mustn't
 * change from run to run. `which` (`&hero=`: 0, 1, 2...) is another body of the same seed;
 * `people` (`&people=`), one of that people.
 */
export function quickStartHero(seed, { which = 0, people = null } = {}) {
    // (Each body's numbers from a seed of its own, drawn in turn from the world's)
    const seeds = createRandom(seed);
    let own = seeds.seed();

    for (let k = Math.min(QUICK_HEROES, Math.max(0, Math.floor(Number(which)) || 0)); k > 0; k--) {
        own = seeds.seed();
    }

    const random = createRandom(own).next;
    const human = randomHero(defaultHero(), random);
    const hero = people ? heroOfPeople(human, people, random) : human;

    hero.name = suggestName(hero, "", random);

    return hero;
}
