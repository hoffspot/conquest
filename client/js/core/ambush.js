// Ambushes (one of the wilds director's cards: core/director.js DIRECTOR): a band of the land lying
// in wait ahead of a player, hidden in cover at a place made for it (a bridge, a ford, a road
// through the trees), told by something off as they come near (a glint of steel, a twig snapping,
// the birds gone quiet, the earth turned, fresh webs, a cult's mark), and sprung as they walk into
// it or linger near it, each band its own way: catching them by surprise, never harder; struck
// first, before it springs, caught out (docs/WILDS.md, *Ambushes*). The rules of it, as data and
// pure functions: core/host.js lays them and springs them

import { CACHE_BANDS } from "./caches.js";
import { CREATURES } from "./creatures.js";
import { cos, sin } from "./exact.js";

/**
 * How ambushes are laid and sprung: `ahead` metres before the player they're laid for, within
 * `spread` of the way they're going; told to whoever first comes within `tell` metres of its heart
 * (its style's `tellAt`, nearer); sprung once one's within its style's `spring` of its heart (or of
 * one lying in wait, `shown`), or once one's stayed within `near` for `waits` ms after its tell.
 * Struck first: its band caught out, stunned `caught` ms, and its leader's stash theirs once it
 * falls (`stash`: gold, [least, most], and a prize as an elite's: caches.js elitePrize). Let go
 * once every player's `far` metres off, not fighting it. At night, laid for one with light about
 * them, and only half as often for none (`dark`); and a build-up after a long calm laid in silence
 * as an ambush `silent` of the time (core/director.js PACING).
 */
export const AMBUSH = Object.freeze({
    ahead: Object.freeze([45, 80]),
    spread: 0.6,
    tell: 24,
    near: 18,
    waits: 7000,
    caught: 1000,
    stash: Object.freeze([20, 45]),
    far: 220,
    dark: 0.5,
    silent: 0.35,
});

/**
 * Each band's way of lying in wait (STYLES):
 * - `bandits` (the land's outlaws, CACHE_BANDS bandits): a pincer, two to step out on the road
 *   ahead and the rest closing in behind, a bowman on a rise; told by a glint of steel.
 * - `goblins` (raiders under an ogre, or goblins under a troll): a snare laid at its heart, rooting
 *   the first to step in it `snare` ms, bombers lobbing from the brush; told by a twig snapping.
 * - `wolves` (the land's pack hunters): one shown ahead as bait, the rest coming in from the
 *   flanks; told by the birds gone quiet.
 * - `dead` (the restless dead): under the earth in a ring about its heart, rising `rise` ms as
 *   their hands break it; told by the turned earth.
 * - `spiders` (the dark elves' wilds): in a ring about its heart, overhead or underground; told by
 *   fresh webs strung across the way.
 * - `cultists`: one lying hurt by the way, a lure (`lure`), the rest in the brush about them, sprung
 *   on whoever comes up to the lure, or stays near it `linger` ms; told by the cult's mark on the
 *   lure's sleeve, nearer (`tellAt`).
 * Those glimpsed (`glimpsed`) once it's told are drawn faintly in their cover, and can be struck.
 */
export const STYLES = Object.freeze({
    bandits: Object.freeze({ tell: "glint", spring: 3, glimpsed: true }),
    goblins: Object.freeze({ tell: "twig", spring: 1.5, snare: 2000, glimpsed: true }),
    wolves: Object.freeze({ tell: "quiet", spring: 3, glimpsed: true }),
    dead: Object.freeze({ tell: "earth", spring: 3.5, rise: 1200, glimpsed: false }),
    spiders: Object.freeze({ tell: "webs", spring: 4, glimpsed: false }),
    cultists: Object.freeze({ tell: "mark", tellAt: 15, spring: 3, lure: true, linger: 8000, glimpsed: true }),
});

// Each of the land's bands (CACHE_BANDS) by the way it lies in wait
const BAND_STYLES = Object.freeze({ bandits: "bandits", raiders: "goblins", trolls: "goblins", dead: "dead", cultists: "cultists" });

/**
 * The land's pack hunters (creatures.js ids), the wolves' ambush's: the catfolk's hyenas, the
 * elves' hounds of Annwn, the dire wolves of the cold and the heights, and wolves where they roam;
 * none where there are none (and the dark elves' wilds have their spiders).
 */
export function huntersOf(biome, race) {
    if (race === "cat") {
        return "hyena";
    }

    if (race === "elf") {
        return "cwnAnnwn";
    }

    if (race === "darkElf") {
        return null;
    }

    if (["tundra", "snow", "mountain"].includes(biome)) {
        return "direWolf";
    }

    return CREATURES.wolf.biomes.includes(biome) ? "wolf" : null;
}

/** The ways the land's bands may lie in wait there (STYLES ids, each once; outlaws where there's none else): the night's dead the likelier (twice: `dark`). */
export function stylesFor(biome, race, { dark = false } = {}) {
    const styles = new Set(Object.keys(CACHE_BANDS).filter((band) => CACHE_BANDS[band].lands.includes(biome)).map((band) => BAND_STYLES[band]));

    if (huntersOf(biome, race)) {
        styles.add("wolves");
    }

    if (race === "darkElf") {
        styles.add("spiders");
    }

    if (!styles.size) {
        styles.add("bandits");
    }

    return [...styles].map((style) => ({ style, weight: dark && style === "dead" ? 2 : 1 }));
}

/** The way an ambush on land of a `biome` (of a `race`'s wilds) lies in wait, as `random` (random.js) has it. */
export function ambushStyle(biome, race, random, { dark = false } = {}) {
    return random.pickWeighted(stylesFor(biome, race, { dark }), ({ weight }) => weight).style;
}

/**
 * Those lying in wait in an ambush of a `style` on land of a `biome` (of a `race`'s wilds), `count`
 * of them (caches.js cacheCount; the bombers and the lure on top), as `random` has it: [{
 * creature, at: [u, v] (metres from its heart: `u` on along the way the player's coming, `v` to
 * their left), role ("lead": its leader; "front", ahead of its heart; "rear", behind it, going for
 * whoever's hindmost; "bait" or "lure", shown; "ring", about it), arms (a weapon of its own: the
 * bowman's bow) }].
 */
export function ambushBand(style, biome, race, count, random) {
    const band = (id) => CACHE_BANDS[id];
    const ring = (creature, radius, n) => Array.from({ length: n }, (_, k) => ({ creature: typeof creature === "function" ? creature(k) : creature, at: [cos((k * 2 * Math.PI) / n) * radius, sin((k * 2 * Math.PI) / n) * radius], role: k === 0 ? "lead" : "ring" }));

    if (style === "bandits") {
        const { leader, folk } = band("bandits");
        const slots = [
            { creature: leader, at: [9, 0], role: "lead" },
            { creature: folk, at: [-4, -6], role: "rear" },
            { creature: folk, at: [12, 8], role: "front", arms: "bow" },
            { creature: folk, at: [7, 5], role: "front" },
            { creature: folk, at: [-4, 6], role: "rear" },
        ];

        return slots.slice(0, Math.max(3, Math.min(slots.length, count)));
    }

    if (style === "goblins") {
        const { leader, folk } = band(CACHE_BANDS.trolls.lands.includes(biome) ? "trolls" : "raiders");
        const slots = [
            { creature: leader, at: [2, 8], role: "lead" },
            { creature: folk, at: [2, -8], role: "front" },
            { creature: "goblinBomber", at: [10, 6], role: "front" },
            { creature: folk, at: [-3, 7], role: "rear" },
            { creature: "goblinBomber", at: [10, -6], role: "front" },
        ];

        return slots.slice(0, Math.max(3, Math.min(slots.length, count)));
    }

    if (style === "wolves") {
        const hunter = huntersOf(biome, race) ?? "wolf";
        const slots = [
            { creature: hunter, at: [8, 0], role: "bait" },
            { creature: hunter, at: [1, 10], role: "front" },
            { creature: hunter, at: [-5, -9], role: "rear" },
            { creature: hunter, at: [1, -10], role: "front" },
            { creature: hunter, at: [-5, 9], role: "rear" },
        ];

        return slots.slice(0, Math.max(3, Math.min(slots.length, count)));
    }

    if (style === "dead") {
        return ring(band("dead").folk, 4.5, Math.max(4, Math.min(5, count)));
    }

    if (style === "spiders") {
        return ring((k) => (k % 3 === 2 ? "centipede" : "caveSpider"), 5, Math.max(3, Math.min(4, count)));
    }

    // (Cultists: the lure at its heart, the rest about them in the brush)
    const { folk } = band("cultists");
    const others = Math.max(2, Math.min(4, count - 1));

    return [
        { creature: folk, at: [0, 0], role: "lure" },
        ...Array.from({ length: others }, (_, k) => {
            const angle = Math.PI / 3 + (k * 2 * Math.PI) / others + random.next() * 0.3;

            return { creature: folk, at: [cos(angle) * 9, sin(angle) * 9], role: k === 0 ? "lead" : "ring" };
        }),
    ];
}

/** Where on the ground one lying in wait at `at` ([u, v]: ambushBand) is, its ambush's heart at `heart` ([x, y] metres), the way the player's coming `axis` ([x, y], a unit). */
export function placeOf([u, v], [hx, hy], [ax, ay]) {
    // (Their left: the way they're going turned a quarter to the left, x east and y south)
    return [hx + ax * u + ay * v, hy + ay * u - ax * v];
}
