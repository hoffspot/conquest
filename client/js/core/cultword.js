// What's said of the hells' cults (worldplan/settle.js HELLS: their camps out in the wilds, each a
// hell's way in, its rite kept there by night: creatures.js RITES) where the player's talking: of
// the nearest one to the town, which way it is from the town always true, the more said of it the
// nearer it is (docs/DUNGEONS.md *Word of the cults*). Near, which way, how far on foot, what stands
// by it and that it's only after dark; farther, which way and that it's a long way; far off, which
// way only, as hearsay. Never what it is: lights, chanting, robed folk, a ring burnt in the grass.
// Pure, and the same on every machine: the plan's sites only.

import { hypot } from "./exact.js";
import { compass } from "./ways.js";

/**
 * How near (metres, from the town to the camp) a hell's cult is spoken of as near (`near`: which
 * way, how far, what stands by it, after dark; and always in the `closest` settlements to it, however
 * far they are) and as farther off (`middle`: which way, a long way); past that, far off (which way
 * only); and how near the camp something must stand to be named as what it's by (`landmark`), and
 * how near the town for it to be an hour's walk or less (`walk`).
 */
export const CULT_WORD = Object.freeze({ near: 2500, closest: 2, middle: 5000, landmark: 700, walk: 1200 });

// What's named of a site that stands by a camp, by its kind ("by the old ruins"), or by its name
// (a dungeon's way in, a works': "by the Hollow Deeps")
const LANDMARKS = Object.freeze({
    ruins: "by the old ruins",
    cave: "out by the caves",
    shrine: "near the old shrine",
    "standing stones": "past the standing stones",
    watchtower: "by the broken watchtower",
    "ruined castle": "under the ruined castle",
    graveyard: "past the old graveyard",
    "lumber mill": "past the lumber mill",
    mine: "out past the mine",
    quarry: "beyond the quarry",
});

// What's said, by how near: {dir} which way from the town, {town} the town, {dist} how far on foot,
// {landmark} what stands by it (with a comma before it, or nothing)
const WORDS = Object.freeze({
    near: [
        "Robed folk out {dir} of {town}, {dist}{landmark}. Chanting, every night. Don't go after dark.",
        "There's a red light some nights out {dir}, {dist}{landmark}. Folk who go to look don't come back.",
        "Found a goat out {dir} of {town}, {dist}{landmark}, bled out in a ring burnt in the grass. Only ever happens at night.",
        "Three gone this month, all last seen {dir} of {town}{landmark}. At night, every one.",
    ],
    middle: [
        "They say there's chanting out {dir}, a long way off. Robed folk, by night.",
        "A carter swore he saw lights out {dir} of {town}, red as a forge. {dist}, he said.",
        "Something's wrong out {dir}. Folk who travel that way by night don't arrive.",
    ],
    far: [
        "Folk go missing out in the wilds, {dir}. Nobody says why.",
        "There's talk of robed folk out {dir}. Cultists, some say. A long way off, thank the gods.",
        "A traveller told of fires out {dir}, past where anyone lives. Red ones.",
    ],
});

// How far it is on foot, said: within an hour's walk; an hour or two; half a day out; farther than
// anyone goes
const distanceOf = (metres, band) => (band === "far" ? "farther than anyone goes" : band === "middle" ? "Half a day out" : metres <= CULT_WORD.walk ? "not an hour's walk" : "an hour or two on foot");

/**
 * Of the hells' camps in a world's plan, the nearest to `at` ([x, y] metres: the town where it's
 * said): { site, far (metres), band ("near", "middle" or "far"), dir (the compass's word for which
 * way it is from there), landmark (what stands by it, said, or null; only near) }; or null with no
 * hell in the world.
 */
export function cultNear(plan, at) {
    const hells = plan.sites.filter((site) => site.theme === "hell");

    if (!hells.length) {
        return null;
    }

    const far = (site) => hypot(site.at[0] - at[0], site.at[1] - at[1]);
    const site = hells.reduce((best, one) => (far(one) < far(best) ? one : best));
    const metres = far(site);
    // (Near as far out as its `closest` settlements, if they're farther)
    const settled = (plan.places ?? []).map((place) => hypot(place.at[0] - site.at[0], place.at[1] - site.at[1])).sort((a, b) => a - b);
    const reach = Math.max(CULT_WORD.near, settled[Math.min(CULT_WORD.closest, settled.length) - 1] ?? 0);
    const band = metres <= reach ? "near" : metres <= Math.max(CULT_WORD.middle, reach) ? "middle" : "far";
    // (What stands nearest it, within reach of it, that has a name or a kind worth saying)
    const by = plan.sites
        .filter((one) => one !== site && one.theme !== "hell" && (LANDMARKS[one.kind] || one.kind === "dungeon") && hypot(one.at[0] - site.at[0], one.at[1] - site.at[1]) <= CULT_WORD.landmark)
        .sort((a, b) => hypot(a.at[0] - site.at[0], a.at[1] - site.at[1]) - hypot(b.at[0] - site.at[0], b.at[1] - site.at[1]) || (a.id < b.id ? -1 : 1))[0];
    const landmark = band === "near" && by ? (LANDMARKS[by.kind] ?? (by.name ? `by ${by.name}` : null)) : null;

    return { site, far: metres, band, dir: compass(at, site.at), landmark };
}

/**
 * What's said of the nearest hell's cult (cultNear's) in a town (`town`: its name), one of the
 * band's ways of saying it (`which`: any whole number, kept within them).
 */
export function cultWord(near, town, which = 0) {
    const lines = WORDS[near.band];

    return lines[((which % lines.length) + lines.length) % lines.length]
        .replaceAll("{dir}", near.dir)
        .replaceAll("{town}", town)
        .replaceAll("{dist}", distanceOf(near.far, near.band))
        .replaceAll("{landmark}", near.landmark ? `, ${near.landmark}` : "");
}

/** How many ways there are of saying it in a band (cultWord's `which`). */
export const cultWays = (band) => WORDS[band].length;
