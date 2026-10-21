// The peoples' soldiers (docs/WAR.md M2, M5): a town's guards and patrols, as the war brings them
// to life near a player. What each carries is what it fights with in the battle (core/weapons.js).
//
// Each is of their own people, in their people's body, skin and parts (peoples.js), built as an
// adventurers' guild's warriors and rangers are (folk.js), and wears their people's uniform
// (liveries.js: helm, surcoat over mail, vambraces, gauntlets, belt, leg guards, war boots, a
// shield or a quiver; a captain, a cloak too), in their colours, with the weapon their people
// fights with; an envoy in their people's livery. Pure data, no DOM.

import { BANDS } from "../core/invasions.js";
import { createRandom } from "../core/random.js";
import { weaponOf, WEAPONS } from "../core/weapons.js";
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
 * How each band of raiders is dressed (core/invasions.js BANDS), over the body of an adventurer
 * of a calling (characters/folk.js: `callings`, by what they fight with; `calling` otherwise):
 * bandits as adventurers are dressed; the rest in their own wear (`wear`: a man's and a woman's, a
 * list of choices for each slot, one picked from each by their seed, null for nothing there), their
 * chiefs in more of their own (`chief`: each in place of whatever was picked for its slot); the
 * shield of their own each carries with a sword or cleaver (`shields`: one picked); and the paint
 * on their faces (`paint`: a colour picked, on `painted` of them: characters/skin.js `warpaint`).
 *
 * - Northmen: hide vests over bare arms, fur mantles, hide trousers, iron bands, nasal
 *   or horned helms, bone necklaces; woad, soot or ochre war paint; their chieftains in black fur
 *   and horns.
 * - The Ashen Cult: dark red and crimson robes, hoods, faces smeared with ash; their high priests
 *   in a blood-red cape.
 * - Sellswords: mail or a gambeson, a breastplate, vambraces, gauntlets and greaves of every
 *   people's make, no two alike, under a helm of anyone's; kite and tower shields; their captains
 *   in a travelling cloak.
 * - Corsairs: linen shirts, wide trousers, bright sashes, tall boots, a coif or bare-headed; their
 *   captains in a plumed hat and a cloak.
 */
const RAIDERS = Object.freeze({
    bandits: { callings: { sword: "rogue", cleaver: "rogue", hammer: "warrior", axe: "warrior", bow: "ranger" }, calling: "warrior", chief: ["travelCloak", "nasalHelm"], shields: ["roundShield"] },
    northmen: {
        calling: "warrior",
        wear: {
            m: [["hideVestTan", "hideVestDark", "hideVestRed"], ["furMantleGrey", "furMantleBrown", "furMantleBlack", null], ["hidePantsTan", "hidePantsDark", "hideLeggings"], ["hideBoots"], ["belt"], ["ironBandsIron", "bracers"], ["nasalHelm", "orcHelm", "leatherCap", null, null], ["boneNecklaceBone", null]],
            f: [["hideVestTan", "hideVestDark", "hideVestRed"], ["furMantleGrey", "furMantleBrown", null], ["hidePantsTan", "hidePantsDark", "hideLeggings"], ["hideBoots"], ["belt"], ["bracers", "ironBandsIron"], ["nasalHelm", "leatherCap", null, null], ["boneNecklaceBone", null]],
        },
        chief: ["furMantleBlack", "orcHelm"],
        shields: ["roundShield"],
        paint: ["#2f4f9a", "#1f1f24", "#7a2a1a"],
        painted: 0.75,
    },
    cult: {
        calling: "mage",
        wear: {
            m: [["russetTunic", "shirt"], ["robe.orc", "robe.lizard"], ["darkHood", "hood", "darkHood"], ["boots"], ["belt"]],
            f: [["chemise", "russetTunic"], ["robe.orc", "robe.lizard"], ["darkHood", "hood"], ["boots"]],
        },
        chief: ["kingsCape", "darkHood", "robe.orc"],
        shields: ["roundShield"],
        paint: ["#a29f99"],
        painted: 1,
    },
    sellswords: {
        calling: "warrior",
        wear: {
            m: [["shirt", "tunic", "russetTunic"], ["mail", "mail.elf", "mail.cat", "gambeson", "gambeson.elf", "gambeson.darkElf"], ["breastplate", "breastplate.elf", "breastplate.cat", "breastplate.lizard", "breastplate.darkElf", null], ["vambraces", "vambraces.elf", "bracers"], ["gauntlets", "gauntlets.cat", "gloves"], ["greaves", "greaves.elf", "greaves.darkElf", null], ["trousers", "breeches"], ["sabatons", "sabatons.cat", "boots"], ["belt"], ["helm.human", "helm.elf", "helm.cat", "helm.lizard", "helm.darkElf", "nasalHelm"]],
            f: [["shirt", "chemise"], ["mail", "mail.elf", "gambeson", "gambeson.darkElf"], ["breastplate", "breastplate.elf", "breastplate.cat", null], ["vambraces", "vambraces.elf", "bracers"], ["gauntlets", "gloves"], ["greaves", "greaves.elf", null], ["breeches"], ["sabatons", "boots"], ["belt"], ["helm.human", "helm.elf", "helm.cat", "nasalHelm"]],
        },
        chief: ["travelCloak"],
        shields: ["kiteShield", "towerShield"],
    },
    corsairs: {
        calling: "rogue",
        wear: {
            m: [["shirt", "shirt", "russetTunic"], [null, "jerkin"], ["catTrousersIndigo", "catTrousersOchre", "catTrousersRed", "breeches"], ["elfSashSilver", "elfSashGreen", "catSashSaffron", "catSashIndigo"], ["darkBootsBlack", "boots"], ["coif", null, null]],
            f: [["chemise", "shirt"], [null, "bodice", "jerkin"], ["catTrousersIndigo", "catTrousersOchre", "catTrousersRed"], ["elfSashSilver", "catSashSaffron", "catSashIndigo"], ["darkBootsBlack", "boots"], ["coif", null]],
        },
        chief: ["crierHat", "travelCloak"],
        shields: ["roundShield"],
    },
});

/**
 * One of a band of raiders' look (core/invasions.js BANDS; RAIDERS): over the body of an
 * adventurer of their calling, in their band's wear (bandits, the calling's own), their chief's
 * too; carrying their own weapon (weapons.js, a creature's weapon's pieces too), a shield of their
 * band's with a sword or cleaver, a quiver with a bow; their faces painted, as their band's are.
 */
export function raiderLook({ band, weapon, sex = "m", seed = 1, captain = false }) {
    const raiders = RAIDERS[band] ?? RAIDERS.bandits;
    const random = createRandom(seed * 2246822519 + 13);
    const body = folkLook({ role: "adventurer", look: raiders.callings?.[weapon] ?? raiders.calling, sex, seed });
    const wear = raiders.wear?.[sex] ?? raiders.wear?.m;
    const worn = wear ? wear.map((choices) => random.pick(choices)).filter(Boolean) : body.equipment.filter((id) => !CARRIED.has(id));
    const chief = captain ? raiders.chief : [];
    const slots = new Set(chief.map((id) => EQUIPMENT[id]?.slot));
    const kit = [...(weaponOf(weapon)?.equipment ?? []), ...(weapon === "sword" || weapon === "cleaver" ? [random.pick(raiders.shields)] : []), ...(weapon === "bow" ? ["quiver"] : [])];
    const look = raiders.paint && random.chance(raiders.painted) ? { ...body.look, skin: { ...body.look.skin, warpaint: random.pick(raiders.paint) } } : body.look;

    return { shape: body.shape, look, equipment: [...new Set([...worn.filter((id) => !slots.has(EQUIPMENT[id]?.slot)), ...chief, ...kit])], walk: body.walk, sheathed: true };
}
