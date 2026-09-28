// The peoples' soldiers (docs/WAR.md M2): a town's guards and patrols, as the war brings them to
// life near a player. What each carries is what it fights with in the battle (core/weapons.js).
//
// Humans (and, until they have looks of their own, docs/WAR.md M5, the other peoples but the
// orcs) are dressed as an adventurers' guild dresses its warriors and rangers (folk.js), with the
// weapon their people fights with; orcs look as the orc does. Pure data, no DOM.

import { WEAPONS } from "../core/weapons.js";
import { folkLook } from "./folk.js";
import { PRESETS } from "./presets.js";

/** What each people's soldiers fight with: guards the first, patrols each of them in turn. */
export const ARMS = Object.freeze({
    human: ["sword", "bow"],
    elf: ["bow", "sword"],
    darkElf: ["sword", "wand"],
    cat: ["gauntlets", "bow"],
    lizard: ["staff", "bow"],
    orc: ["cleaver", "cleaver"],
});

// Everything a warrior or ranger might carry in their hands, taken off for their people's weapon
const CARRIED = new Set(["sword", "bow", "quiver", "staff", "wand", "warHammer", "roundShield", "kiteShield", "spikedGauntlets", "spikedGauntletLeft", "cleaver", "grimoire"]);

/**
 * A soldier's look: { shape, look, equipment, walk, sheathed } (as folk.js folkLook's), for one
 * of a people (a RACES id), fighting with `weapon` (a WEAPONS key), a man or a woman (`sex`),
 * from a seed of their own.
 */
export function soldierLook({ people, weapon, sex = "m", seed = 1 }) {
    if (people === "orc") {
        const orc = PRESETS.orc;

        return { shape: orc.shape, look: orc.look, equipment: [...orc.equipment, ...WEAPONS[weapon].equipment], walk: orc.walk, sheathed: true };
    }

    const base = folkLook({ role: "soldier", look: weapon === "bow" ? "ranger" : "warrior", sex, seed });
    const shield = weapon === "sword" && base.equipment.find((id) => id.endsWith("Shield"));

    return { ...base, equipment: [...base.equipment.filter((id) => !CARRIED.has(id)), ...WEAPONS[weapon].equipment, ...(shield ? [shield] : [])], sheathed: true };
}
