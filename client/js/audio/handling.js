// What the player's things sound like in their hands (sound.js's recorded items' sounds): a piece
// put on or taken off by what it's made of, and something used by what it is. Pure data, no DOM.

import { GEAR } from "../core/gear.js";
import { ITEMS } from "../core/progress.js";

// What each piece that's worn is made of, by the sound of it going on or coming off (as its icon
// is drawn, app/icons.js, and its livery, characters/liveries.js)
const MADE_OF = Object.freeze({
    cloth: ["gambeson", "trousers", "travelCloak", "cloak", "wizardHat"],
    leather: ["cap", "jerkin", "bracers", "gloves", "belt", "girdle", "breeches", "leatherBoots", "boots", "quiver"],
    mail: ["mail", "hauberk"],
    plate: ["plate", "nasalHelm", "helm", "platedGloves", "warGloves", "vambraces", "greaves", "legguards", "sabatons", "warBoots"],
});

const WORN = Object.freeze(Object.fromEntries(Object.entries(MADE_OF).flatMap(([made, ids]) => ids.map((id) => [id, made]))));

// A people's own hauberk, as their livery has it (characters/liveries.js uniformLook): an orc's
// is a breastplate, a lizard's a gambeson under a surcoat; everyone else's mail
const HAUBERKS = Object.freeze({ orc: "plate", lizard: "cloth" });

const WEARING = Object.freeze({ cloth: "equipCloth", leather: "equipLeather", mail: "equipMail", plate: "equipPlate" });

/**
 * The sound of a piece of gear ({ id, people }) put on or taken off: cloth, leather, mail or
 * plate by what it's made of; a shield slung; a weapon taken in hand, as anything picked up; a
 * ring or an amulet, its chink as a coin's. Null for anything else.
 */
export function wearSound(item) {
    const piece = item && GEAR[item.id];

    if (!piece) {
        return null;
    }

    if (WORN[item.id]) {
        return WEARING[item.id === "hauberk" ? (HAUBERKS[item.people] ?? "mail") : WORN[item.id]];
    }

    return piece.slot === "offHand" ? "shieldSling" : piece.slot === "mainHand" ? "pickup" : piece.jewel ? "coinPickup" : null;
}

/**
 * The sound of something used (an ITEMS id): a tome opened, a scroll unrolled, food eaten, a
 * bandage wound on (cloth), a salve's pot uncorked; anything else drunk. Null for what can't be
 * used.
 */
export function useSound(id) {
    const def = ITEMS[id];

    if (!def?.use) {
        return null;
    }

    if (def.tome) {
        return "bookOpen";
    }

    if (def.scroll) {
        return "scroll";
    }

    return id === "meal" || def.food ? "eat" : id === "bandage" ? "equipCloth" : id === "burnSalve" ? "potionCork" : "potionDrink";
}
