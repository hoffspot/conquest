// Each people's everyday dress: what the townsfolk wear (core/townsfolk.js, folk.js), and the folk
// of their taverns and churches about their own business, by the culture of their people rather
// than the humans' homespun. Each calling (folk.js PARTS) is dressed as a human of it would be;
// each people then has its own for each piece of that (EVERYDAY: a choice of theirs, picked by
// the folk's own seed: one piece, several, or none), so a porter's a porter and a friar a priest
// of theirs, whoever's people they are:
//
//  - humans: as they are, in homespun (folk.js);
//  - elves (their old forests, moonwells and tree halls): tunics over slim leggings and long,
//    flowing gowns of fine cloth in moss, silver and dusk blue, a vine in leaf worked round the
//    neck and hem; silk sashes; soft boots; silver circlets; a leaf-shaped basket of silvered willow;
//  - dark elves (their spider shrines and obsidian spires): close-fitted, high at the neck, in
//    black, violet and plum, a silver web across the breast; narrow skirts to the floor; tall
//    boots; black hoods and circlets; a six-sided basket of black reed, silver-handled;
//  - cat folk (their savannah and sun temples): light wraps for the heat, bare at the arms, in
//    bold zigzagged bands of saffron, indigo and red; the men's wide trousers to the calf under a
//    banded sash, the women's sarongs and shukas; collars of beads and bronze bangles; bare feet;
//    nothing on the head over their ears; a wide banded basket;
//  - lizard folk (their jungle ziggurats and serpent pools): white cotton with stepped frets in
//    turquoise and crimson; huipils, short jackets, the women's wrap skirts, the men's
//    loincloths or breeches to the knee, capes knotted at the shoulder; jade bangles; feathered
//    bands; bare feet; a tall reed basket;
//  - orcs (their badlands, war totems and fighting pits): patched, stitched hide, bare at the
//    arms; the men's hide trousers, the women's skirts of hide strips; fur mantles; strings of
//    bone; iron bands; a basket of lashed sticks with a bone for its handle.
//
// No man wears a skirt, of any people: a robe that would be one is his people's trousers.
//
// Pure data, no DOM.

import { createRandom } from "../core/random.js";
import { EQUIPMENT } from "./equipment.js";

// What a human of each calling's in that those of a people wear something else for: tops, what's
// over them, what's on the legs, the feet, the waist, the hands and the head, what's carried
const TOPS = ["shirt", "tunic", "brownTunic", "russetTunic", "greenTunic", "blueTunic", "smock"];
const SKIRTS = ["kirtle", "blueKirtle", "brownSkirt", "skirt", "greenSkirt", "gown"];
const HATS = ["hood", "coif", "leatherCap"];

// Each choice for every one of `ids`
const each = (ids, choices) => Object.fromEntries(ids.map((id) => [id, choices]));

/**
 * Each people's everyday dress: for each piece a human of a calling would wear, what one of them
 * wears instead (a choice of: an id, several, or null for nothing). What's not here they wear as
 * a human would (a belt, a pannier, a broom).
 */
export const EVERYDAY = Object.freeze({
    elf: Object.freeze({
        ...each(TOPS, ["elfTunicMoss", "elfTunicSilver", "elfTunicDusk"]),
        habit: ["elfTunicSilver"],
        chemise: ["elfBlouseIvory", "elfBlouseSage"],
        ...each(["bodice", "velvetBodice"], ["elfBodiceMoss", "elfBodiceDusk", null]),
        jerkin: ["elfVestMoss", "elfVestDusk"],
        ...each(["trousers", "breeches"], ["elfLeggingsGrey", "elfLeggingsGreen"]),
        ...each(SKIRTS, ["elfGownSage", "elfGownDusk", "elfGownIvory"]),
        ...each(["habitSkirt", "mageRobe"], ["elfGownIvory", "elfGownDusk"]),
        apron: [null],
        boots: ["elfBoots"],
        belt: ["elfSashSilver", "elfSashGreen"],
        gloves: [null],
        ...each(HATS, ["circletElf", null]),
        strawHat: [null, "circletElf"],
        basket: ["elfBasket"],
    }),
    darkElf: Object.freeze({
        ...each([...TOPS, "chemise"], ["darkTunicBlack", "darkTunicViolet", "darkTunicPlum"]),
        habit: ["darkTunicBlack"],
        ...each(["bodice", "velvetBodice"], ["darkBodiceBlack", "darkBodiceViolet"]),
        jerkin: ["darkVestBlack"],
        ...each(["trousers", "breeches"], ["darkLeggings"]),
        ...each([...SKIRTS, "habitSkirt", "mageRobe"], ["darkSkirtBlack", "darkSkirtViolet"]),
        apron: [null],
        boots: ["darkBootsBlack"],
        belt: ["darkBelt"],
        gloves: ["darkGloves"],
        ...each([...HATS, "strawHat"], ["darkHood", "circletDark", null]),
        basket: ["darkElfBasket"],
    }),
    cat: Object.freeze({
        // (A man in a wrap, or bare-chested in a collar of beads)
        ...each(TOPS, ["catWrapSaffron", "catWrapIndigo", "catWrapRed", "beadedCollarBright", "beadedCollarGold"]),
        habit: [["catWrapSaffron", "beadedCollarGold"]],
        chemise: ["catBandeauSaffron", "catBandeauIndigo", "catWrapRed"],
        ...each(["bodice", "velvetBodice", "jerkin"], ["beadedCollarBright", "beadedCollarGold", null]),
        // (A man in wide trousers with a banded sash; a woman in a shuka or a sarong)
        ...each(["trousers", "breeches"], ["catTrousersIndigo", "catTrousersOchre", "catTrousersRed"]),
        ...each(SKIRTS, ["catShukaRed", "catShukaIndigo", "catSarongSaffron", "catSarongOchre"]),
        ...each(["habitSkirt", "mageRobe"], ["catShukaIndigo"]),
        apron: [null],
        boots: [null],
        belt: [["catSashSaffron", "banglesBronze"], ["catSashIndigo"], ["banglesBronze"]],
        gloves: ["banglesBronze"],
        ...each([...HATS, "strawHat"], [null]),
        basket: ["catBasket"],
    }),
    lizard: Object.freeze({
        // (A man bare-chested, or in a short jacket or a huipil)
        ...each(TOPS, [null, "xicolliCrimson", "xicolliWhite", "huipilWhite"]),
        habit: [["xicolliCrimson", "tilmatli"]],
        chemise: ["huipilWhite", "huipilOchre", "huipilTurquoise"],
        ...each(["bodice", "velvetBodice"], [null]),
        jerkin: ["xicolliCrimson", "xicolliWhite", "tilmatli"],
        // (A man in a loincloth with its flap, or in breeches to the knee)
        ...each(["trousers", "breeches"], [["maxtlatlWhite", "loinFlapCrimson"], ["maxtlatlWhite", "loinFlapWhite"], "lizardBreechesWhite", "lizardBreechesOchre"]),
        ...each(SKIRTS, ["cueitlWhite", "cueitlTurquoise"]),
        ...each(["habitSkirt", "mageRobe"], ["cueitlWhite"]),
        apron: [null],
        boots: [null],
        belt: ["jadeBanglesGreen", null],
        gloves: ["jadeBanglesGreen"],
        ...each([...HATS, "strawHat"], ["featherBand", null]),
        basket: ["lizardBasket"],
    }),
    orc: Object.freeze({
        // (A man in a vest of hide, under a mantle of fur, or bare-chested)
        ...each(TOPS, ["hideVestTan", "hideVestDark", "hideVestRed", "furMantleGrey", ["hideVestDark", "furMantleBrown"], null]),
        habit: [["furMantleBlack", "boneNecklaceBone"]],
        chemise: ["hideWrapTan", "hideWrapDark"],
        ...each(["bodice", "velvetBodice"], ["boneNecklaceBone", null]),
        jerkin: ["furMantleGrey", "furMantleBrown"],
        ...each(["trousers", "breeches"], ["hidePantsTan", "hidePantsDark", "hideLeggings"]),
        ...each(SKIRTS, ["hideSkirtTan", "hideSkirtDark"]),
        ...each(["habitSkirt", "mageRobe"], ["hideSkirtDark"]),
        apron: ["leatherApron", null],
        boots: ["hideBoots"],
        gloves: ["ironBandsIron"],
        ...each([...HATS, "strawHat"], [null]),
        basket: ["orcBasket"],
    }),
});

// A skirt: a drape all the way round from the waist (not a cloak, not an apron at the front)
const skirt = (id) => EQUIPMENT[id]?.kind === "drape" && !EQUIPMENT[id].cape && (EQUIPMENT[id].arc ?? 1) >= 1;

/**
 * What one of a people wears for what a human of their calling would (`equipment`: ids), picked by
 * their `seed`: each piece their people has their own for swapped for one of theirs (or none),
 * the rest kept; one piece to a slot (the first). A man (`sex` "m") never in a skirt: in his
 * people's trousers instead (a priest's robe, a scribe's: theirs for trousers).
 */
export function everydayDress(equipment, people, seed, sex = "f") {
    const own = EVERYDAY[people];

    if (!own) {
        return equipment;
    }

    const random = createRandom(seed * 40503 + 211);
    const slots = new Set();
    const dressed = [];

    for (const id of equipment) {
        let picked = own[id] ? random.pick(own[id]) : id;

        if (sex === "m" && [picked].flat().some(skirt)) {
            picked = [[picked].flat().filter((piece) => !skirt(piece)), random.pick(own.trousers ?? [null])].flat(2);
        }

        for (const piece of [picked].flat()) {
            const slot = piece && EQUIPMENT[piece]?.slot;

            if (piece && !slots.has(slot)) {
                slots.add(slot);
                dressed.push(piece);
            }
        }
    }

    return dressed;
}

/**
 * One of a people's own for a human's `id` (their basket for a basket, their head-wear for a hood):
 * the first of their choices that's something, null if theirs is nothing, or `id` as it is.
 */
export function theirs(people, id) {
    const own = EVERYDAY[people]?.[id];

    return own ? (own.flat().find(Boolean) ?? null) : id;
}
