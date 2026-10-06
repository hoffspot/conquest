// Places worth finding (the terrain plan's M7.5, §8 "Places worth finding"): every site the world
// plan puts out between the settlements (sites.js: each people's castle and its own special places,
// the watchtowers, and the ruins, caves, shrines, circles of stones, ruined castles and the
// dragon's lair no people keeps) and the wild camps, as places: what each is, how big, the icon it
// has on the maps, and who holds it.
//
// Who holds a place is mixed by the war, a world at a time (the user's choice): each people's own
// castle is theirs; their other places theirs or taken by bandits; a watchtower out in the wild,
// and a cave, a band of outlaws'; the ruins the restless dead's (the bones, ghosts and wraiths of
// whoever lived there long ago, led by a wight guarding an old relic), and the old graveyard
// outside each people's start town theirs too (a few bones and ghosts, led by a skeleton: the
// first of the dead a new adventurer meets); the dragon's lair the
// dragon's; the shrines and the circles of stones no one's. Once a place's occupiers are put to
// the sword and their leader killed it's empty for a while (`PLACE_TIMES.retake`: a few days of
// the world's clock), and then a new band moves in, or the dead rise again (the war keeps when
// each was cleared: war.js clearPlace).
//
// Pure data, no DOM; the same for the same plan.

import { createRandom } from "./random.js";

/** Who can hold a place: its people (friendly to those not at war with them), outlaws, the restless dead, a great beast, or no one. */
export const HOLDERS = Object.freeze(["friendly", "bandits", "dead", "beast"]);

/**
 * Each kind of place: how big it is (`size`: small, medium or large, as many occupy it), its icon on
 * the maps (app/mapicons.js), and who may hold it (`holds`: [] no one; a people's places their
 * people's, or bandits' a share of worlds, `taken`).
 */
export const PLACE_KINDS = Object.freeze({
    // Each people's castle and the humans' own places
    castle: { size: "large", icon: "castle", holds: ["friendly"] },
    manor: { size: "medium", icon: "manor", holds: ["friendly", "bandits"] },
    abbey: { size: "medium", icon: "abbey", holds: ["friendly", "bandits"] },
    windmill: { size: "small", icon: "windmill", holds: ["friendly", "bandits"] },
    watchtower: { size: "small", icon: "watchtower", holds: ["friendly", "bandits"] },
    // The other peoples' own places: their halls and temples as the humans' manors and abbeys;
    // their holy pools and rocks theirs alone
    "tree hall": { size: "medium", icon: "greatHall", holds: ["friendly", "bandits"] },
    starwatch: { size: "small", icon: "watchtower", holds: ["friendly", "bandits"] },
    moonwell: { size: "small", icon: "spring", holds: ["friendly"] },
    "spider shrine": { size: "small", icon: "abbey", holds: ["friendly", "bandits"] },
    "obsidian spire": { size: "medium", icon: "watchtower", holds: ["friendly", "bandits"] },
    "shadow gate": { size: "small", icon: "greatHall", holds: ["friendly", "bandits"] },
    "sun temple": { size: "medium", icon: "abbey", holds: ["friendly", "bandits"] },
    "pride rock": { size: "small", icon: "rock", holds: ["friendly"] },
    "watering hole": { size: "small", icon: "spring", holds: ["friendly"] },
    ziggurat: { size: "large", icon: "abbey", holds: ["friendly", "bandits"] },
    hatchery: { size: "medium", icon: "greatHall", holds: ["friendly", "bandits"] },
    "serpent pool": { size: "small", icon: "spring", holds: ["friendly"] },
    "war totem": { size: "small", icon: "totem", holds: ["friendly"] },
    "skull pit": { size: "small", icon: "totem", holds: ["friendly", "bandits"] },
    "fighting pit": { size: "medium", icon: "greatHall", holds: ["friendly", "bandits"] },
    // The places no people keeps
    ruins: { size: "medium", icon: "ruins", holds: ["dead"] },
    "ruined castle": { size: "large", icon: "ruinedCastle", holds: ["dead"] },
    cave: { size: "medium", icon: "cave", holds: ["bandits"] },
    "dragon's lair": { size: "large", icon: "lair", holds: ["beast"] },
    shrine: { size: "small", icon: "shrine", holds: [] },
    "standing stones": { size: "small", icon: "stones", holds: [] },
    // (The old graveyard outside each people's start town: its dead their own band, PLACE_BANDS)
    graveyard: { size: "small", icon: "graveyard", holds: ["dead"], band: "graveyard" },
    // The wild camps (the world plan's): their faction's
    camp: { size: "medium", icon: "camp", holds: [] },
});

/**
 * Who holds a place held by outlaws or the dead, and how many (host.js #places): the band (`folk`:
 * one kind, or several taken in turn, member by member: bandFolk) and its leader (`leader`, `lead`
 * tiers above the band, in the middle by the chest: the dead's, a wight lord, the greater one
 * guarding their old relic, `relic`, in it: progress.js rollRelic); `count` of
 * the band by the place's size, one more for every `per` tiers of its land's danger (creatures.js
 * tierAt); the band round the middle `ring` metres off, by its size, each going for anyone who
 * comes within `guard` metres of them; put out once a player's within `near` metres, let go once
 * every one's further than `far`. The ruined castles and the dragon's lair keep their own masters
 * (creatures.js LAIRS). A kind of place with a band of its own (PLACE_KINDS' `band`: the
 * graveyards') has it in place of its holder's: bandOf.
 */
export const PLACE_BANDS = Object.freeze({
    bandits: { folk: "bandit", leader: "banditChief" },
    // (The restless dead of whoever lived there long ago: their bones, their ghosts, and a wraith)
    dead: { folk: ["skeleton", "ghost", "skeleton", "wraith", "ghost"], leader: "wightLord", relic: true },
    // (A graveyard's dead, risen from its graves: bones and a ghost, a skeleton leading them, and
    // no relic to guard)
    graveyard: { folk: ["skeleton", "ghost", "skeleton"], leader: "skeleton" },
    count: { small: 3, medium: 5, large: 7 },
    per: 3,
    lead: 2,
    ring: { small: 4, medium: 6, large: 9 },
    guard: 10,
    near: 90,
    far: 180,
});

/**
 * The band holding a place for whoever holds it (`holder`: holderOf's): its kind's own, if it has
 * one (PLACE_KINDS' `band`), or its holder's (PLACE_BANDS); null if no band holds it.
 */
export function bandOf(place, holder) {
    const band = PLACE_BANDS[holder];

    return band?.leader ? (PLACE_BANDS[PLACE_KINDS[place.kind]?.band] ?? band) : null;
}

/** Which kind of creature a band's `k`th member is (PLACE_BANDS: its one kind, or its kinds in turn). */
export function bandFolk(band, k) {
    const kinds = [band.folk].flat();

    return kinds[k % kinds.length];
}

/** How much more gold a chest holds for each tier of its land's danger above the first. */
export const CHEST_GOLD = 0.35;

/**
 * How long a cleared place stays empty before it's held again (the war's turns: a day is 60) and
 * what share of a people's places that may be taken are held by bandits at the start.
 */
export const PLACE_TIMES = Object.freeze({ retake: 120, taken: 0.35 });

/** A site's place: { id, kind, race, name, at ([x, y] metres), size, icon, holds }, or null if the kind isn't one. */
export function placeOf(site) {
    const kind = PLACE_KINDS[site.kind];

    if (!kind) {
        return null;
    }

    // (A watchtower out in the wild is no one's but outlaws')
    const holds = site.kind === "watchtower" && !site.race ? ["bandits"] : kind.holds;

    return { id: site.id, kind: site.kind, race: site.race ?? null, name: site.name ?? null, at: site.at, size: kind.size, icon: kind.icon, holds };
}

// (Each plan's places, worked out once)
const PLACES = new WeakMap();

/** Every place in a world (its plan's sites, then its wild camps), the same every time. */
export function placesOf(plan) {
    if (!PLACES.has(plan)) {
        const sites = plan.sites.map(placeOf).filter(Boolean);
        const camps = (plan.camps ?? []).map((camp) => ({ id: camp.id, kind: "camp", race: null, name: null, at: camp.at, size: "medium", icon: "camp", holds: [], faction: camp.faction }));

        PLACES.set(plan, [...sites, ...camps]);
    }

    return PLACES.get(plan);
}

/**
 * Who holds a place when the world begins: its first of `holds`, or, for a people's place that may
 * be taken, bandits in about PLACE_TIMES.taken of worlds (by the plan's seed and the site's); or
 * null for no one.
 */
export function heldAtStart(plan, place) {
    if (!place.holds.length) {
        return null;
    }

    if (place.holds.length === 1) {
        return place.holds[0];
    }

    const random = createRandom((Math.imul(plan.seed ?? 0, 0x9e3779b1) ^ hashId(place.id)) >>> 0);

    return random.next() < PLACE_TIMES.taken ? "bandits" : place.holds[0];
}

/**
 * Who holds a place now: as at the start (heldAtStart), unless its occupiers were put to the sword
 * (`kept`: the war's record of it, { cleared: the turn, times }) less than PLACE_TIMES.retake turns
 * ago (`turn`, the war's), when it's empty ("cleared"). A people's own hold isn't cleared.
 */
export function holderOf(plan, place, kept, turn) {
    const start = heldAtStart(plan, place);

    if (start && start !== "friendly" && kept && turn - kept.cleared < PLACE_TIMES.retake) {
        return "cleared";
    }

    return start;
}

// (A whole number for an id: the same every time)
function hashId(id) {
    let hash = 2166136261;

    for (let k = 0; k < id.length; k++) {
        hash = Math.imul(hash ^ id.charCodeAt(k), 16777619) >>> 0;
    }

    return hash;
}
