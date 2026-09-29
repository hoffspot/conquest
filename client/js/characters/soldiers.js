// The peoples' soldiers (docs/WAR.md M2, M5): a town's guards and patrols, as the war brings them
// to life near a player. What each carries is what it fights with in the battle (core/weapons.js).
//
// Each is of their own people, in their people's body, skin and parts (peoples.js), built as an
// adventurers' guild's warriors and rangers are (folk.js), and wears their people's uniform
// (liveries.js: helm, surcoat over mail, vambraces, gauntlets, belt, leg guards, war boots, a
// shield or a quiver; a captain, a cloak too), in their colours, with the weapon their people
// fights with; an envoy in their people's livery. Pure data, no DOM.

import { WEAPONS } from "../core/weapons.js";
import { EQUIPMENT } from "./equipment.js";
import { folkLook } from "./folk.js";
import { liveryKit, soldierKit } from "./liveries.js";
import { peopleLook } from "./peoples.js";

/** What each people's soldiers fight with: guards the first, patrols each of them in turn. */
export const ARMS = Object.freeze({
    human: ["sword", "bow"],
    elf: ["bow", "sword"],
    darkElf: ["sword", "wand"],
    cat: ["gauntlets", "bow"],
    lizard: ["staff", "bow"],
    orc: ["cleaver", "cleaver"],
});

// The parts of their own a people's body has (cat folk's ears and tail, lizard folk's tail, orcs' tusks)
const OWN = new Set(["ears", "tail", "face"]);

/**
 * A soldier's look: { shape, look, equipment, walk, sheathed } (as folk.js folkLook's), for one
 * of a people (a RACES id), fighting with `weapon` (a WEAPONS key), a man or a woman (`sex`),
 * from a seed of their own; a captain (`captain`) in a cloak; an envoy (`part`: "envoy") in their
 * people's livery, with a staff.
 */
export function soldierLook({ people, weapon, sex = "m", seed = 1, part = null, captain = false }) {
    const body = people === "orc" ? peopleLook({ people, sex, seed }) : folkLook({ role: "soldier", look: weapon === "bow" ? "ranger" : "warrior", sex, seed, people });
    const own = people === "orc" ? ["tusks"] : body.equipment.filter((id) => OWN.has(EQUIPMENT[id]?.slot));
    const kit = part === "envoy" ? [...liveryKit(people, "envoy", sex), ...(WEAPONS[weapon]?.equipment ?? [])] : soldierKit(people, weapon, { captain });

    return { shape: body.shape, look: body.look, equipment: [...new Set([...kit, ...own])], walk: body.walk, sheathed: true };
}
