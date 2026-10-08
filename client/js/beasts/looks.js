// How each of the wild's creatures looks (core/creatures.js has what they are: how strong, where
// they live, what they drop): which body it's built on (beasts/*.js), its sizes (metres) and
// colours, and what makes it itself. Every one of a kind is a little different: a little bigger
// or smaller (`scale`), its markings placed its own way (from its seed).
//
// The people-shaped ones (bandits, goblins, boggarts, trolls, ogres) are built on the character
// engine, as everyone in the towns is (characters/character.js): HUMANOIDS.

import { folkLook } from "../characters/folk.js";
import { HAIR_COLOURS } from "../characters/skin.js";
import { createRandom } from "../core/random.js";

/** Each creature's look: `body` (the builder: beast.js BUILDERS) and what that builder takes. */
export const LOOKS = Object.freeze({
    // --- Everywhere near home ---
    rat: {
        body: "quadruped",
        scale: [0.9, 1.15],
        length: 0.62, height: 0.3, girth: 0.11, width: 0.1, chest: 1, haunch: 1.1, neck: 0.1, neckUp: 0.2,
        head: [0.08, 0.07, 0.1], snout: { length: 0.12, radius: 0.04, taper: 0.45 }, ears: "round", legs: 0.035,
        tail: { length: 0.62, radius: 0.022, lift: -0.3, curl: 0.06 },
        colours: { fur: 0x5a4c40, belly: 0x8a7a68, dark: 0x2a201a, eyes: 0x1a0606, tail: 0xb88a80 },
        attacks: ["bite", "snap", "pounce"], rests: ["sniff", "groom", "lie", "shake"],
    },
    porcupine: {
        body: "quadruped",
        scale: [0.9, 1.1],
        length: 0.56, height: 0.3, girth: 0.2, width: 0.19, chest: 1, haunch: 1.1, neck: 0.08, neckUp: 0.1,
        head: [0.09, 0.08, 0.09], snout: { length: 0.08, radius: 0.045, taper: 0.7 }, ears: "small", legs: 0.045,
        tail: { length: 0.14, radius: 0.05, lift: -0.4 }, quills: 90,
        colours: { fur: 0x4a3a2c, belly: 0x6a5846, dark: 0x1e1812, ivory: 0xe8e0cc, eyes: 0x0a0806 },
        attacks: ["bristle", "bite", "swipe"], rests: ["sniff", "lie", "groom", "root"],
    },
    slime: {
        body: "blob",
        scale: [0.85, 1.2],
        size: 0.42, clear: 0.3,
        colours: { body: 0x58c040, core: 0x2a6a1a, eyes: 0x0a1a08 },
        attacks: ["slam", "engulf"], rests: ["puddle", "bounce", "bubble"],
    },
    bats: {
        body: "swarm",
        scale: [0.9, 1.1],
        size: 0.24, count: 7,
        colours: { fur: 0x3a2e2a, wings: 0x2a2020, eyes: 0xff4020 },
        attacks: ["dive", "swirl"], rests: ["settle", "scatter"],
    },
    wolf: {
        body: "quadruped",
        scale: [0.9, 1.1],
        length: 1, height: 0.78, girth: 0.17, width: 0.15, chest: 1.15, haunch: 0.9, neck: 0.3, neckUp: 0.55,
        head: [0.11, 0.1, 0.12], snout: { length: 0.2, radius: 0.05, taper: 0.6 }, ears: "pointed", legs: 0.055,
        tail: { length: 0.46, radius: 0.056, bushy: true, lift: -0.95, curl: 0.13 }, tipColour: 0x1e1c1a,
        colours: { fur: 0x57534c, belly: 0xb8b0a0, dark: 0x22201e, saddle: 0x2a2724, mask: 0x9a9284, eyes: 0xc89a30 },
        attacks: ["bite", "snap", "pounce", "shake"], rests: ["sit", "lie", "sniff", "scratch", "howl", "shake"],
    },
    boar: {
        body: "quadruped",
        scale: [0.9, 1.12],
        length: 1.05, height: 0.72, girth: 0.24, width: 0.2, chest: 1.18, haunch: 0.92, neck: 0.12, neckUp: 0.1,
        head: [0.12, 0.13, 0.19], snout: { length: 0.25, radius: 0.058, taper: 0.85 }, ears: "pointed", legs: 0.065, hooves: true,
        tail: { length: 0.2, radius: 0.02, lift: -0.4, curl: 0.4 }, mane: true, crest: true, tusks: 0.12,
        colours: { fur: 0x5e4834, belly: 0x6e5a46, dark: 0x1e1612, mane: 0x2e2218, saddle: 0x3e2e20, ivory: 0xe6dcc4 },
        attacks: ["gore", "toss", "bite", "stamp"], rests: ["root", "lie", "sniff", "shake"],
    },
    snake: {
        body: "serpent",
        scale: [0.85, 1.2],
        length: 1.6, thickness: 0.05, segments: 18, zigzag: true,
        colours: { scales: 0x6a6a38, bands: 0x2a2a16, belly: 0xc0b080, eyes: 0xd8a020 },
        attacks: ["strike", "double"], rests: ["coil", "taste", "bask"], specials: ["spit"],
    },
    // (Not of the wild: an ox in the shafts of a works' wagon, drawing it in a convoy, art/kits/wagon.js.
    // Deep and heavy, its head carried low, its horns out to the sides and curving up; it only
    // stands with its head down a while, or shakes off the flies)
    ox: {
        body: "quadruped",
        scale: [0.95, 1.05],
        length: 2.2, height: 1.5, girth: 0.42, width: 0.33, chest: 1.2, haunch: 1.05, neck: 0.32, neckUp: 0.1,
        head: [0.13, 0.16, 0.24], snout: { length: 0.24, radius: 0.095, taper: 0.95, flat: 1.1 }, ears: "round", legs: 0.11, hooves: true,
        horns: 0.44, hornSweep: "out", tail: { length: 0.85, radius: 0.028, lift: -1.4, curl: 0.05, taper: 0.5 }, tipColour: 0x1e1610,
        colours: { fur: 0x86573a, belly: 0x9c7254, dark: 0x1e1610, mask: 0x6a4630, ivory: 0xd8ccb0, eyes: 0x140c08 },
        attacks: ["gore", "stamp"], rests: ["sniff", "shake"],
    },
    bandit: { body: "humanoid", scale: [0.95, 1.05] },
    banditChief: { body: "humanoid", scale: [1.08, 1.14] },
    bear: {
        body: "quadruped",
        scale: [0.9, 1.12],
        length: 1.55, height: 1.05, girth: 0.4, width: 0.36, chest: 1.1, haunch: 1, neck: 0.26, neckUp: 0.12, slope: 0.93,
        head: [0.2, 0.19, 0.19], snout: { length: 0.15, radius: 0.085, taper: 0.8, flat: 1.12 }, ears: "round", legs: 0.13,
        tail: { length: 0.1, radius: 0.06, lift: -0.5 }, hump: true, plantigrade: true, claws: 1.1,
        colours: { fur: 0x4e3624, belly: 0x5a4030, dark: 0x140e0a, mask: 0x7a5a3e, saddle: 0x3a2818 },
        attacks: ["maul", "swipe", "bite", "shake"], rests: ["sit", "lie", "sniff", "scratch", "yawn"],
    },
    puma: {
        body: "quadruped",
        scale: [0.9, 1.1],
        length: 1.35, height: 0.68, girth: 0.16, width: 0.14, chest: 1.05, haunch: 1.1, neck: 0.2, neckUp: 0.3,
        head: [0.1, 0.094, 0.1], face: "cat", snout: { length: 0.06, radius: 0.052 }, ears: "cat", legs: 0.056, claws: 1.2, muzzleMarks: true,
        tail: { length: 0.8, radius: 0.045, lift: -1.05, curl: 0.2, taper: 0.3 }, tipColour: 0x2a1e14,
        colours: { fur: 0xa87848, belly: 0xe0d0b8, mask: 0xe8dcc8, dark: 0x2a1e14, saddle: 0x8a5e36, eyes: 0xb89a40 },
        attacks: ["pounce", "swipe", "bite", "shake"], rests: ["lie", "stretch", "groom", "sit", "yawn", "sniff"],
    },
    direWolf: {
        body: "quadruped",
        scale: [0.95, 1.1],
        length: 1.5, height: 1.05, girth: 0.23, width: 0.2, chest: 1.2, haunch: 0.9, neck: 0.38, neckUp: 0.45,
        head: [0.16, 0.15, 0.18], snout: { length: 0.26, radius: 0.075, taper: 0.6 }, ears: "pointed", legs: 0.08,
        tail: { length: 0.62, radius: 0.074, bushy: true, lift: -0.95, curl: 0.13 }, mane: true,
        colours: { fur: 0x2e2c2e, saddle: 0x161416, belly: 0x4a4648, dark: 0x121012, mane: 0x1e1c1e, eyes: 0xd03020, glow: 0xd03020 },
        attacks: ["bite", "snap", "pounce", "shake"], rests: ["sit", "lie", "sniff", "scratch", "howl", "shake"],
    },
    goblin: { body: "humanoid", scale: [0.72, 0.82] },
    skeleton: {
        body: "biped",
        scale: [0.95, 1.05],
        kind: "skeleton", height: 1.8, weapon: "sword",
        colours: { bone: 0xd8cfb4, eyes: 0xff6020, metal: 0x6e6458 },
        attacks: ["slash", "thrust", "chop"], rests: ["slump", "rattle", "look"],
    },
    cultist: { body: "humanoid", scale: [0.95, 1.05] },
    troll: { body: "humanoid", scale: [1.4, 1.5] },
    ogre: { body: "humanoid", scale: [1.3, 1.4] },
    wyvern: {
        body: "quadruped",
        scale: [0.95, 1.1],
        length: 1.8, height: 1.1, girth: 0.24, width: 0.21, chest: 1.15, haunch: 0.95, neck: 0.7, neckUp: 0.8,
        head: [0.14, 0.12, 0.2], snout: { length: 0.3, radius: 0.07, taper: 0.6 }, ears: "none", horns: 0.22, legs: 0.08,
        teeth: 7, slit: true, brows: true, claws: 1.4, talons: true, frill: 3,
        tail: { length: 1.8, radius: 0.1, lift: -0.2, curl: 0.08, sting: 0.25 }, plates: 8, flat: true, roughness: 0.55,
        wings: { span: 2.3, bone: 0.028 }, spines: true,
        colours: { fur: 0x3e5a4a, belly: 0xa8a070, dark: 0x1e2a22, wings: 0x5a4a3a, ivory: 0xd8ccaa, eyes: 0xe0c020, glow: 0xe0c020 },
        attacks: ["bite", "swipe", "tailSlap"], rests: ["stretch", "yawn", "sniff", "lie"], specials: ["sting"],
    },

    // --- Only in the wilds of each people's own lands ---
    // (Humans: the black shuck, a great black spectral hound; the boggart, a small hairy spite)
    blackShuck: {
        body: "quadruped",
        scale: [1, 1.1],
        length: 1.4, height: 1, girth: 0.22, width: 0.19, chest: 1.2, haunch: 0.9, neck: 0.34, neckUp: 0.45,
        head: [0.15, 0.14, 0.17], snout: { length: 0.24, radius: 0.07, taper: 0.6 }, ears: "pointed", legs: 0.07,
        tail: { length: 0.62, radius: 0.05, bushy: true, lift: -0.9, curl: 0.15 }, mane: true, spectral: true,
        colours: { fur: 0x141418, belly: 0x1e1e24, dark: 0x08080a, mane: 0x0a0a0e, aura: 0x1a1a20, eyes: 0xff3a1a, glow: 0xff3a1a },
        attacks: ["bite", "pounce", "snap", "shake"], rests: ["sit", "lie", "sniff", "howl"],
    },
    boggart: { body: "humanoid", scale: [0.66, 0.74] },
    // (Elves: the will-o'-wisp, a light that leads astray; the blighted treant, a tree gone bad)
    wisp: {
        body: "wisp",
        scale: [0.9, 1.1],
        size: 0.3,
        colours: { light: 0x9ae8ff, haze: 0x60c0ff },
        attacks: ["flare"], rests: ["dim", "drift"], specials: ["bolt"],
    },
    treant: {
        body: "biped",
        scale: [0.95, 1.08],
        kind: "treant", height: 2.8, blight: true,
        colours: { bark: 0x4a4038, leaves: 0x5a5e3a, eyes: 0xb8e040, fungus: 0x8a4a9a, moss: 0x3a4a2a },
        attacks: ["slam", "sweep"], rests: ["root", "sway", "creak"], specials: ["roots"],
    },
    // (Dark elves: a cave spider as big as a dog; the shadow stalker, a great cat of shadow)
    caveSpider: {
        body: "arachnid",
        scale: [0.9, 1.15],
        size: 0.55,
        colours: { shell: 0x2a2228, dark: 0x141014, marks: 0x8a2020, eyes: 0xd02020 },
        attacks: ["bite", "leap"], rests: ["groom", "crouch", "twitch"], specials: ["web"],
    },
    shadowStalker: {
        body: "quadruped",
        scale: [0.95, 1.08],
        length: 1.35, height: 0.7, girth: 0.16, width: 0.14, chest: 1.05, haunch: 1.08, neck: 0.2, neckUp: 0.3,
        head: [0.105, 0.098, 0.1], face: "cat", snout: { length: 0.06, radius: 0.052 }, ears: "cat", legs: 0.056, claws: 1.2,
        tail: { length: 0.85, radius: 0.042, lift: -1.05, curl: 0.2, taper: 0.3 }, stripes: 10, spectral: true, slit: true,
        colours: { fur: 0x221a2e, aura: 0x2a1e3a, belly: 0x362c48, dark: 0x120c1c, eyes: 0xa060ff, glow: 0xa060ff },
        attacks: ["pounce", "swipe", "bite"], rests: ["lie", "stretch", "sniff", "sit", "yawn"],
    },
    // (Cat folk: the hyena, in packs; the sand scorpion)
    hyena: {
        body: "quadruped",
        scale: [0.92, 1.08],
        length: 1.1, height: 0.8, girth: 0.19, width: 0.16, chest: 1.25, haunch: 0.8, neck: 0.3, neckUp: 0.4,
        head: [0.125, 0.115, 0.13], snout: { length: 0.14, radius: 0.058, taper: 0.85 }, ears: "big", legs: 0.055, slope: 0.8,
        tail: { length: 0.34, radius: 0.04, bushy: true, lift: -0.9, curl: 0.08 }, spots: 26, crest: true, tipColour: 0x1e1812,
        colours: { fur: 0xa08a5a, belly: 0xb8a478, dark: 0x3a2e1e, mane: 0x2e241a, mask: 0x4a3a28, eyes: 0x2a1a0a },
        attacks: ["bite", "snap", "shake"], rests: ["sit", "lie", "sniff", "howl", "scratch"],
    },
    scorpion: {
        body: "arachnid",
        scale: [0.9, 1.15],
        size: 0.5, scorpion: true,
        colours: { shell: 0xb89458, dark: 0x6a5030, marks: 0xd8b878, eyes: 0x202020 },
        attacks: ["pinch", "grab"], rests: ["crouch", "twitch", "raise"], specials: ["sting"],
    },
    // (Lizard folk: the bog frog, big as a hound; the marsh crocodile)
    bogFrog: {
        body: "frog",
        scale: [0.9, 1.15],
        size: 0.45,
        colours: { skin: 0x5a7a2a, belly: 0xc8c080, spots: 0x2a3a14, eyes: 0xe0c040 },
        attacks: ["tongue", "leap"], rests: ["croak", "hunker", "look"], specials: ["spit"],
    },
    crocodile: {
        body: "quadruped",
        scale: [0.9, 1.15],
        length: 2.3, height: 0.42, girth: 0.15, width: 0.28, chest: 1, haunch: 1, neck: 0.18, neckUp: 0, lowSlung: true, clearance: 1.6,
        head: [0.15, 0.08, 0.2], face: "croc", snout: { length: 0.55, radius: 0.085, taper: 0.55, flat: 1.45, nose: 0.7 }, teeth: 16, slit: true, ears: "none", legs: 0.075,
        tail: { length: 1.9, radius: 0.14, lift: -0.1, curl: 0.02, taper: 0.9, flatten: [0.55, 1, 1.25], ridge: true }, plates: 14, plateRows: 2, flat: true, roughness: 0.6,
        colours: { fur: 0x3e4a2c, belly: 0xb8b088, dark: 0x1e2616, eyes: 0xc8b030, ivory: 0xe8e0c0 },
        attacks: ["bite", "shake", "tailSlap"], rests: ["bask", "lie", "yawn"],
    },
    // (Orcs: the magma slime, glowing from inside; the rock tusker, a boar of stone)
    magmaSlime: {
        body: "blob",
        scale: [0.9, 1.2],
        size: 0.52, clear: 0, crust: true,
        colours: { body: 0x1c1614, core: 0xff8020, glow: 0xff5010, eyes: 0xffe080 },
        attacks: ["slam", "engulf"], rests: ["puddle", "bubble", "bounce"], specials: ["spit"],
    },
    rockTusker: {
        body: "quadruped",
        scale: [0.95, 1.1],
        length: 1.6, height: 1.05, girth: 0.34, width: 0.3, chest: 1.2, haunch: 0.95, neck: 0.18, neckUp: 0.1,
        head: [0.22, 0.2, 0.24], snout: { length: 0.24, radius: 0.11, taper: 0.9 }, ears: "small", legs: 0.12, hooves: true,
        tail: { length: 0.25, radius: 0.04, lift: -0.4, curl: 0.3 }, tusks: 0.38, plates: 8, plateRows: 2, flat: true, grain: "stone", roughness: 1,
        colours: { fur: 0x6a6258, belly: 0x7a7266, dark: 0x3a342e, ivory: 0xd8c8a0, eyes: 0xff7020, glow: 0xff7020 },
        attacks: ["gore", "toss", "stamp"], rests: ["root", "lie", "shake", "sniff"],
    },

    // --- In the perilous places, for the mightiest ---
    dragon: {
        body: "quadruped",
        scale: [1, 1],
        length: 4.4, height: 2.4, girth: 0.6, width: 0.46, chest: 1.08, haunch: 1.1, neck: 2, neckUp: 0.75,
        head: [0.36, 0.28, 0.55], snout: { length: 0.9, radius: 0.18, taper: 0.55, flat: 1.15 }, teeth: 12, brows: true, slit: true, eyeSize: 0.7, crouch: 1.5,
        ears: "none", horns: 1, horned: true, frill: 5, legs: 0.3, claws: 1.6, talons: true,
        tail: { length: 5, radius: 0.32, lift: -0.25, curl: 0.06, spade: 0.9 }, plates: 16, flat: true, roughness: 0.62, bellyBands: true,
        wings: { span: 4.8, bone: 0.085 }, spines: true,
        colours: { fur: 0x561410, saddle: 0x2e0806, mask: 0x4a100c, belly: 0x8a5e34, dark: 0x160604, wings: 0x3a0e0c, wingBones: 0x2a0a08, claws: 0xc8b89a, ivory: 0xd8ccb0, eyes: 0xffc020, glow: 0xffa010 },
        attacks: ["bite", "swipe", "tailSlap", "stamp"], rests: ["lie", "yawn", "stretch", "sniff"], specials: ["breath"],
    },
    // (The restless dead of the ruins: a ghost, the pale shade of one who lived there long ago; a
    // wraith, a black-robed horror with nothing under its cowl but two cold lights)
    ghost: {
        body: "spectre",
        scale: [0.92, 1.05],
        kind: "ghost", height: 1.75,
        colours: { shroud: 0xb4cad8, glow: 0x7ab8e0, bone: 0xd8e4ea, eyes: 0xc8f4ff },
        attacks: ["reach", "claw"], rests: ["drift", "mourn", "fade"], specials: ["wail"],
    },
    wraith: {
        body: "spectre",
        scale: [1, 1.1],
        kind: "wraith", height: 2.05,
        colours: { shroud: 0x17151c, glow: 0x2a6a50, bone: 0x8a8274, eyes: 0x8affc0 },
        attacks: ["rake", "claw"], rests: ["hover", "loom", "turn"], specials: ["drain"],
    },
    wightLord: {
        body: "biped",
        scale: [1, 1],
        kind: "skeleton", height: 2.3, weapon: "greatsword", armour: true, crown: true, cloak: true,
        colours: { bone: 0xb8b4a8, eyes: 0x60c8ff, metal: 0x2c2f36, crown: 0x9a8440, cloak: 0x1a1a2a },
        attacks: ["slash", "thrust", "chop"], rests: ["rattle", "look"], specials: ["curse"],
    },
    frostTroll: { body: "humanoid", scale: [1.5, 1.6] },
});

// A value between two, from the random numbers
const between = (random, [least, most]) => random.range(least, most);

// The people-shaped creatures' bodies (the character engine's sliders: macro.js, details.js),
// skins, eyes, hair and what they wear, each a little different from its seed
const BRUTES = {
    goblin: {
        macro: { gender: 1, muscle: [0.35, 0.5], weight: [0.15, 0.3], height: [0, 0.08], african: 0.3, asian: 0.3, caucasian: 0.4 },
        details: { earSize: [0.8, 1], earPoint: [0.9, 1], earFlare: [0.7, 1], noseLength: [0.6, 1], noseTip: [-0.8, -0.4], noseHump: [0.3, 0.8], eyeSize: [0.3, 0.6], chin: [-0.6, -0.2], jawWidth: [-0.4, 0], headSize: [0.4, 0.7], mouthWidth: [0.4, 0.8], browAngle: [-0.8, -0.4], armLength: [0.4, 0.7], handSize: [0.4, 0.7], footSize: [0.3, 0.6] },
        skin: { tones: ["#6a8a3a", "#7a8a3e", "#5e7a36", "#8a8a48"], warts: [0.4, 0.8], veins: [0.1, 0.3], blush: [0, 0.1], brows: [0.2, 0.4] },
        irises: ["#e0c020", "#d88a20", "#c8d040"],
        hair: { styles: ["bald", "mohawk", "topknot"], colour: HAIR_COLOURS.black },
        wear: [["loincloth"], ["belt"], ["bracers", null], ["breeches", null]],
        walk: "orc",
    },
    boggart: {
        macro: { gender: 1, muscle: [0.4, 0.55], weight: [0.5, 0.7], height: [0, 0.05], african: 0.2, asian: 0.3, caucasian: 0.5 },
        details: { earSize: [0.6, 1], earPoint: [0.6, 1], earFlare: [0.5, 0.9], noseLength: [0.5, 1], noseWidth: [0.5, 1], noseTip: [0.2, 0.6], eyeSize: [0.4, 0.8], browRidge: [0.5, 1], headSize: [0.5, 0.8], belly: [0.4, 0.8], armLength: [0.5, 0.8], handSize: [0.6, 1], footSize: [0.6, 1] },
        skin: { tones: ["#6b5238", "#5a4630", "#7a5e40"], fur: [0.85, 1], blush: [0, 0.1], brows: [0.8, 1] },
        irises: ["#e8c020", "#d86a20"],
        slit: true,
        hair: { styles: ["long", "long", "swept"], beards: ["full"], colour: "#3a2a1a" },
        wear: [["loincloth"], ["belt", null]],
        walk: "orc",
    },
    troll: {
        macro: { gender: 1, muscle: [0.9, 1], weight: [0.75, 0.95], height: [0.9, 1], african: 0.4, asian: 0.2, caucasian: 0.4 },
        details: { noseLength: [0.8, 1], noseWidth: [0.8, 1], noseHump: [0.5, 1], earPoint: [0.6, 1], earSize: [0.6, 1], browRidge: [0.9, 1], underbite: [0.8, 1], jawWidth: [0.8, 1], headSquare: [0.4, 0.8], eyeSize: [-0.8, -0.5], armLength: [0.8, 1], handSize: [0.8, 1], footSize: [0.8, 1], neck: [0.8, 1], shoulders: [0.8, 1], belly: [0.2, 0.5] },
        skin: { tones: ["#6b7a6a", "#5e6e5a", "#72806a"], warts: [0.7, 1], veins: [0.3, 0.6], blush: [0, 0.1], brows: [0.8, 1] },
        irises: ["#d8b020", "#c07020"],
        hair: { styles: ["long", "mohawk"], colour: "#3a4a2a" },
        wear: [["loincloth"], ["belt"], ["tusks"]],
        walk: "orc",
    },
    frostTroll: {
        macro: { gender: 1, muscle: [0.95, 1], weight: [0.8, 0.95], height: [0.95, 1], african: 0.2, asian: 0.2, caucasian: 0.6 },
        details: { noseLength: [0.8, 1], noseWidth: [0.7, 1], noseHump: [0.5, 1], earPoint: [0.7, 1], earSize: [0.5, 0.9], browRidge: [0.9, 1], underbite: [0.8, 1], jawWidth: [0.8, 1], headSquare: [0.5, 0.9], eyeSize: [-0.8, -0.5], armLength: [0.8, 1], handSize: [0.8, 1], footSize: [0.8, 1], neck: [0.8, 1], shoulders: [0.9, 1], belly: [0.1, 0.4] },
        skin: { tones: ["#b8c8d8", "#a8bccc", "#c8d4e0"], warts: [0.5, 0.8], veins: [0.4, 0.7], blush: [0, 0.05], brows: [0.8, 1], browColour: "#f0f4f8" },
        irises: ["#60c8ff", "#a0e0ff"],
        hair: { styles: ["long", "swept"], beards: ["full"], colour: HAIR_COLOURS.white },
        wear: [["loincloth"], ["belt"], ["bracers"], ["tusks"]],
        walk: "orc",
    },
    ogre: {
        macro: { gender: 1, muscle: [0.7, 0.85], weight: [0.95, 1], height: [0.85, 0.95], african: 0.4, asian: 0.3, caucasian: 0.3 },
        details: { belly: [0.9, 1], underbite: [0.4, 0.8], jawWidth: [0.9, 1], chin: [0.3, 0.7], noseWidth: [0.7, 1], noseTip: [0.4, 0.8], headSquare: [0.6, 1], headSize: [-0.3, 0], eyeSize: [-0.6, -0.3], neck: [0.9, 1], shoulders: [0.6, 0.9], armLength: [0.5, 0.8], handSize: [0.7, 1], earSize: [0.2, 0.6] },
        skin: { tones: ["#a08060", "#9a7a58", "#8a7050", "#a88a68"], warts: [0.3, 0.6], veins: [0.2, 0.4], blush: [0.2, 0.4], brows: [0.8, 1], warpaint: "#5a1a14" },
        irises: ["#5a3a1a", "#c89020"],
        hair: { styles: ["bald", "topknot", "bald"], beards: ["stubble", "none"], colour: HAIR_COLOURS.black },
        wear: [["loincloth"], ["belt"], ["bracers"], ["breeches", null]],
        walk: "orc",
    },
};

/**
 * One of the people-shaped creatures (a HUMANOIDS id), from a seed: { shape, look, equipment,
 * walk } (as presets.js's), not yet armed (the game adds its weapon's). Bandits are human
 * cutthroats, dressed as rogues, and cultists wear mages' robes; the others are their kind's.
 */
export function humanoidLook(id, seed = 1) {
    // (Bandits: cutthroats, dressed as rogues, their chief in a warrior's harness; cultists in
    // mages' robes, hatless)
    if (id === "bandit" || id === "banditChief" || id === "cultist") {
        const sex = seed % 4 === 0 ? "f" : "m";
        const folk = folkLook({ role: "adventurer", look: { bandit: "rogue", banditChief: "warrior", cultist: "mage" }[id], sex, seed });
        const carried = new Set(["sword", "staff", "wand", "wizardHat"]);

        return { shape: folk.shape, look: folk.look, equipment: folk.equipment.filter((each) => !carried.has(each)), walk: "natural" };
    }

    const spec = BRUTES[id];
    const random = createRandom(seed * 2654435761 + 71);
    const macro = Object.fromEntries(Object.entries(spec.macro).map(([key, value]) => [key, Array.isArray(value) ? between(random, value) : value]));
    const details = Object.fromEntries(Object.entries(spec.details).map(([key, range]) => [key, between(random, range)]));
    const skin = { tone: random.pick(spec.skin.tones) };

    for (const [key, value] of Object.entries(spec.skin)) {
        if (key !== "tones") {
            skin[key] = Array.isArray(value) ? between(random, value) : value;
        }
    }

    return {
        shape: { macro, details },
        look: {
            skin,
            eyes: { iris: random.pick(spec.irises), ...(spec.slit ? { slit: true } : {}) },
            hair: { style: random.pick(spec.hair.styles), beard: random.pick(spec.hair.beards ?? ["none"]), colour: spec.hair.colour },
        },
        equipment: spec.wear.map((choices) => random.pick(choices)).filter(Boolean),
        walk: spec.walk,
    };
}

/** The people-shaped creatures (built on the character engine). */
export const HUMANOIDS = Object.freeze(Object.keys(LOOKS).filter((id) => LOOKS[id].body === "humanoid"));
