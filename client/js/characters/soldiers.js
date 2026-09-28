// The peoples' soldiers (docs/WAR.md M2, M5): a town's guards and patrols, as the war brings them
// to life near a player. What each carries is what it fights with in the battle (core/weapons.js).
//
// Each is of their own people, in their people's body, skin and parts (peoples.js), dressed as an
// adventurers' guild dresses its warriors and rangers (folk.js), with the weapon their people
// fights with; orcs are dressed as the orc is (their women with a tunic on too). Pure data, no DOM.

import { WEAPONS } from "../core/weapons.js";
import { folkLook } from "./folk.js";
import { peopleLook } from "./peoples.js";
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
 * from a seed of their own; an envoy (`part`: "envoy") in a councillor's robes.
 */
export function soldierLook({ people, weapon, sex = "m", seed = 1, part = null }) {
    // (An envoy: in a councillor's robes, with a staff; orcs' in a tunic over the orc's own)
    if (part === "envoy") {
        const envoy = people === "orc" ? { ...soldierLook({ people, weapon, sex, seed }), equipment: [...PRESETS.orc.equipment, "tunic", ...WEAPONS[weapon].equipment] } : folkLook({ role: "councillor", sex, seed, people });

        return { ...envoy, equipment: [...envoy.equipment.filter((id) => !CARRIED.has(id)), ...WEAPONS[weapon].equipment].filter((id, k, all) => all.indexOf(id) === k), sheathed: true };
    }

    if (people === "orc") {
        const orc = peopleLook({ people, sex, seed });

        return { shape: orc.shape, look: orc.look, equipment: [...PRESETS.orc.equipment, ...(sex === "f" ? ["tunic"] : []), ...WEAPONS[weapon].equipment], walk: orc.walk, sheathed: true };
    }

    const base = folkLook({ role: "soldier", look: weapon === "bow" ? "ranger" : "warrior", sex, seed, people });
    const shield = weapon === "sword" && base.equipment.find((id) => id.endsWith("Shield"));

    return { ...base, equipment: [...base.equipment.filter((id) => !CARRIED.has(id)), ...WEAPONS[weapon].equipment, ...(shield ? [shield] : [])], sheathed: true };
}
