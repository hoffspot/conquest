// The peoples' soldiers (docs/WAR.md M2, M5): a town's guards and patrols, as the war brings them
// to life near a player. What each carries is what it fights with in the battle (core/weapons.js).
//
// Each is of their own people, in their people's body, skin and parts (peoples.js), built as an
// adventurers' guild's warriors and rangers are (folk.js), and wears their people's uniform
// (liveries.js: helm, surcoat over mail, vambraces, gauntlets, belt, leg guards, war boots, a
// shield or a quiver; a captain, a cloak too), in their colours, with the weapon their people
// fights with; an envoy in their people's livery. Pure data, no DOM.

import { BANDS } from "../core/invasions.js";
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

// What an adventurer's calling has them carry, put by for a raider's own weapon (and a shield of
// their own with a sword or cleaver, a quiver with a bow)
const CARRIED = new Set(["sword", "roundShield", "kiteShield", "bow", "quiver", "staff", "wand", "wizardHat", "warHammer"]);

/**
 * A soldier's look: { shape, look, equipment, walk, sheathed } (as folk.js folkLook's), for one
 * of a people (a RACES id), fighting with `weapon` (a WEAPONS key), a man or a woman (`sex`),
 * from a seed of their own; a captain (`captain`) in a cloak; an envoy (`part`: "envoy") in their
 * people's livery, with a staff. One of a band of raiders (`people` a core/invasions.js BANDS
 * id) as its own are dressed (raiderLook).
 */
export function soldierLook({ people, weapon, sex = "m", seed = 1, part = null, captain = false }) {
    if (BANDS[people]) {
        return raiderLook({ band: people, weapon, sex, seed, captain });
    }

    const body = people === "orc" ? peopleLook({ people, sex, seed }) : folkLook({ role: "soldier", look: weapon === "bow" ? "ranger" : "warrior", sex, seed, people });
    const own = people === "orc" ? ["tusks"] : body.equipment.filter((id) => OWN.has(EQUIPMENT[id]?.slot));
    const kit = part === "envoy" ? [...liveryKit(people, "envoy", sex), ...(WEAPONS[weapon]?.equipment ?? [])] : soldierKit(people, weapon, { captain });

    return { shape: body.shape, look: body.look, equipment: [...new Set([...kit, ...own])], walk: body.walk, sheathed: true };
}

/**
 * One of a band of raiders' look (core/invasions.js BANDS): dressed as an adventurer of the
 * calling its band has for what they fight with (bandits: the cutthroats as rogues, the brutes
 * as warriors, the archers as rangers), their chief as its chiefs are; carrying their own
 * weapon, a round shield with a sword or cleaver and a quiver with a bow, and no livery.
 */
export function raiderLook({ band, weapon, sex = "m", seed = 1, captain = false }) {
    const { looks } = BANDS[band];
    const body = folkLook({ role: "adventurer", look: (captain ? looks.chief : looks[weapon]) ?? "rogue", sex, seed });
    const kit = [...(WEAPONS[weapon]?.equipment ?? []), ...(weapon === "sword" || weapon === "cleaver" ? ["roundShield"] : []), ...(weapon === "bow" ? ["quiver"] : []), ...(captain ? ["travelCloak"] : [])];

    return { shape: body.shape, look: body.look, equipment: [...new Set([...body.equipment.filter((id) => !CARRIED.has(id)), ...kit])], walk: body.walk, sheathed: true };
}
