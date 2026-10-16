// A hero's basics, as plain data with nothing drawn: the peoples a hero can be of, what a new one
// looks like before it's changed, and a name as it's kept. app/heroes.js has the rest (random
// heroes, names to suggest) and gives these out too; they're apart so that what reads characters
// without drawing them (a character file, a world server: app/character-file.js) needn't bring
// the 3D engine with it (characters/hair.js).

import { MACRO_DEFAULTS } from "../characters/macro.js";
import { PRESETS } from "../characters/presets.js";
import { EYE_DEFAULTS, SKIN_DEFAULTS } from "../characters/skin.js";

const clone = (value) => structuredClone(value);

/** The peoples a hero can be of (docs/WAR.md M11), as the character maker offers them. */
export const HERO_PEOPLES = Object.freeze([
    { id: "human", label: "Human" },
    { id: "elf", label: "Elf" },
    { id: "darkElf", label: "Dark elf" },
    { id: "cat", label: "Cat folk" },
    { id: "lizard", label: "Lizard folk" },
    { id: "orc", label: "Orc" },
]);

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

/** A name as it's kept: trimmed, single-spaced, letters, spaces, apostrophes and hyphens. */
export function cleanName(name) {
    return String(name ?? "").replace(/[^\p{L}\p{M}' -]/gu, "").replace(/\s+/g, " ").trim().slice(0, 20);
}
