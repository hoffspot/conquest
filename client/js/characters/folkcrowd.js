// The townsfolk drawn in crowds (world/crowd.js; app/game.js #folkRoom), past the bodies' budget
// and far from the camera: all of a people and a sex drawn as one figure, made once from a plain
// look of their own (folkFigureLook: their people's everyday clothes, plain and light, carrying
// nothing), each in their own colours (folkTint: their skin's, their clothes' and their hair's,
// as theirs are to the figure's) and as tall and broad as they are (folkBuild). Pure data, no DOM.

import { everydayDress } from "./dress.js";
import { EQUIPMENT } from "./equipment.js";
import { folkLook } from "./folk.js";
import { LOOKS, peopleLook } from "./peoples.js";
import { HAIR_COLOURS, SKIN_TONES } from "./skin.js";

/**
 * The seeds a people's and a sex's figure may be made from (its body: `most` tried, the fairest
 * of them; a human's always the first, made fair).
 */
export const FOLK_FIGURE_SEEDS = Object.freeze({ first: 1, most: 48 });

// What the figure wears: plain cloth, light (each in a crowd is coloured as their own clothes are
// from it, mostly darker), above its hips and below (a woman's a skirt), its boots; nothing on its
// head, nothing in its hands; of another people, the lightest of what they wear for each. A
// human's skin fair and hair fair too, for the same
const PLAIN = Object.freeze({ m: Object.freeze(["shirt", "trousers", "boots", "belt"]), f: Object.freeze(["chemise", "skirt", "boots"]) });
const FAIR = Object.freeze({ tone: SKIN_TONES.fair, hair: HAIR_COLOURS.blond });

// How its hair's worn, where their people wear it so (one in a crowd wears it as the figure does)
const STYLES = Object.freeze({ m: "short", f: "bob" });

/**
 * How one in a crowd's build is made from the figure's (folkBuild): as much taller as their
 * height's slider is over the figure's (`up`, times its height), broader as their weight's and
 * their muscle's are (`weight`, `muscle`), never more than `most` either way.
 */
export const FOLK_BUILD = Object.freeze({ up: 0.3, weight: 0.25, muscle: 0.1, most: 0.08 });

/** The kind of crowd the townsfolk of a people and a sex are drawn in (world/crowd.js Crowd's). */
export function folkKind({ people = "human", sex = "m" }) {
    return `folk:${people}:${sex}`;
}

// Each people's and sex's figure's look, made once (folkFigureLook)
const figures = new Map();

/**
 * The look the figure of a people's and a sex's townsfolk is made from ({ shape, look,
 * equipment, walk, sheathed }, as folk.js folkLook's): one of them (FOLK_FIGURE_SEEDS), in PLAIN
 * (their people's everyday dress of it, the lightest), their people's own parts with it (a cat's
 * ears and tail, a lizard's tail, an orc's tusks); a human fair-skinned and fair-haired; a cat's
 * fur unstriped. Its hair worn short or in a bob (as their people wear it), no beard.
 */
export function folkFigureLook({ people = "human", sex = "m" }) {
    const kind = folkKind({ people, sex });

    if (!figures.has(kind)) {
        const human = people === "human";
        const seed = human ? FOLK_FIGURE_SEEDS.first : fairest(people, sex);
        const one = folkLook({ role: "townsfolk", local: "townsfolk", look: "worshipper", sex, seed, people });
        const own = human ? null : peopleLook({ people, sex, seed });
        const styles = LOOKS[people]?.styles?.[sex];
        const look = structuredClone(one.look);

        if (human) {
            look.skin.tone = FAIR.tone;
            look.hair.colour = FAIR.hair;
        }

        // (A cat's fur unstriped: each in a crowd is coloured as their own fur is, all told)
        delete look.skin.stripes;
        delete look.skin.stripeColour;

        if (!styles || styles.includes(STYLES[sex])) {
            look.hair.style = STYLES[sex];
        }

        look.hair.beard = "none";

        const lightest = (choices) => [...choices].sort((a, b) => lightness(b) - lightness(a))[0];
        const plain = human ? [...PLAIN[sex]] : everydayDress([...PLAIN[sex]], people, seed, sex, { pick: lightest });

        figures.set(kind, Object.freeze({ ...one, look, equipment: [...plain, ...(own?.parts ?? [])], sheathed: false }));
    }

    return figures.get(kind);
}

// The fairest of a people (FOLK_FIGURE_SEEDS): the seed it's made from
function fairest(people, sex) {
    let best = FOLK_FIGURE_SEEDS.first;
    let most = -Infinity;

    for (let seed = FOLK_FIGURE_SEEDS.first; seed < FOLK_FIGURE_SEEDS.first + FOLK_FIGURE_SEEDS.most; seed++) {
        const look = peopleLook({ people, sex, seed })?.look;
        const fair = look ? luminance(linear(look.skin.tone)) + luminance(linear(look.hair.colour)) / 2 : -Infinity;

        if (fair > most) {
            [best, most] = [seed, fair];
        }
    }

    return best;
}

// How light a choice of what's worn is (a piece, several, or none: their colours' luminance, all told)
function lightness(choice) {
    const pieces = [choice].flat().filter(Boolean);
    const colours = pieces.map((id) => linear(EQUIPMENT[id]?.colour)).filter(Boolean);

    return colours.length ? colours.reduce((sum, colour) => sum + luminance(colour), 0) / colours.length : -1;
}

// A colour's luminance (linear)
const luminance = (colour) => (colour ? 0.2126 * colour[0] + 0.7152 * colour[1] + 0.0722 * colour[2] : 0);

// A colour ("#rrggbb", sRGB) as three.js's are (linear), or null if it isn't one
function linear(hex) {
    if (typeof hex !== "string" || !/^#[0-9a-f]{6}$/i.test(hex)) {
        return null;
    }

    const value = parseInt(hex.slice(1), 16);

    return [value >> 16, (value >> 8) & 255, value & 255].map((byte) => {
        const c = byte / 255;

        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
}

// What's worn above the hips, as it's seen (linear): the outermost, and what's under it, half and
// half; and below them to the knees (trousers, a skirt; else a loincloth's flap, or what's under
// it): each null if nothing's worn there
function clothesOf(equipment) {
    const worn = equipment.map((id) => EQUIPMENT[id]).filter((piece) => piece && piece.kind !== "item" && linear(piece.colour));
    const over = worn.filter(({ slot }) => ["surcoat", "chest", "shirt"].includes(slot)).sort((a, b) => (b.layer ?? 0) - (a.layer ?? 0));
    const legs = ["legs", "apron", "underwear"].map((at) => worn.find(({ slot }) => slot === at)).find(Boolean);
    const upper = over.length ? linear(over[0].colour).map((c, k) => (c + linear((over[1] ?? over[0]).colour)[k]) / 2) : null;

    return { upper, lower: legs ? linear(legs.colour) : null };
}

/**
 * The colours one of the townsfolk (`look`: theirs, folk.js folkLook's) is dyed in their crowd,
 * the figure's (`figure`: folkFigureLook's) light and shade kept (CrowdAvatar `tint`, world/
 * crowd.js CROWD_PARTS): their skin; their clothes above their hips, and below them (as above if
 * they wear nothing there; as their skin, bare above); their hair (as their skin if they're bald).
 * Four apiece: each colour (linear) over how light the figure's is there, and 1; or, where either
 * isn't known, the figure's own (1, 1, 1, 0).
 */
export function folkTint(look, figure) {
    const dye = (to, from) => (to && from ? [...to.map((c) => c / Math.max(luminance(from), 0.005)), 1] : [1, 1, 1, 0]);
    const skin = linear(look.look.skin.tone);
    const theirs = clothesOf(look.equipment);
    const its = clothesOf(figure.equipment);
    const upper = theirs.upper ?? skin;

    return Float32Array.from([
        ...dye(skin, linear(figure.look.skin.tone)),
        ...dye(upper, its.upper),
        ...dye(theirs.lower ?? upper, its.lower ?? its.upper),
        ...dye(look.look.hair.style === "bald" ? skin : linear(look.look.hair.colour), linear(figure.look.hair.colour)),
    ]);
}

/**
 * How much broader and taller one of the townsfolk (`look`) is drawn than the figure (`figure`):
 * [across, up] (CrowdAvatar `build`), from their bodies' sliders (FOLK_BUILD).
 */
export function folkBuild(look, figure) {
    const theirs = look.shape.macro;
    const its = figure.shape.macro;
    const most = (value) => Math.min(1 + FOLK_BUILD.most, Math.max(1 - FOLK_BUILD.most, value));

    return [most(1 + (theirs.weight - its.weight) * FOLK_BUILD.weight + (theirs.muscle - its.muscle) * FOLK_BUILD.muscle), most(1 + (theirs.height - its.height) * FOLK_BUILD.up)];
}
