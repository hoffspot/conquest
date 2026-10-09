// The adventurers' caches (docs/WILDS.md): a chest some adventurer stowed out in the wilds and
// never came back for, found by a band of that land's brigands, who keep it. One turns up ahead
// of a player every so far they cross the wilds (about every half a kilometre: CACHES.every), well
// clear of the settlements, the roads, and the places worth finding; it's marked on their minimap
// once they've seen it, and gone once every player's left it far behind.
//
// Its band's as strong as the land it's in (creatures.js tierAt), or as the mightiest player near
// it (progress.js might), whichever's the more: three to five of them, their leader two tiers
// above the rest, keeping by the cache while the rest walk a round about it. Hard to beat alone.
// Locked till the last of them falls; then a share of what's in it for each player there: some
// gold, and a few pieces of gear, as well made as the band was strong (CACHE_MAKES).
//
// Pure data and arithmetic, no DOM; the world's host puts them out (host.js #caches).

import { clearOfSettlements, TIERS } from "./creatures.js";
import { cos, hypot, sin } from "./exact.js";
import { GEAR, rollGear } from "./gear.js";
import { CHEST_GOLD, placesOf } from "./places.js";
import { ITEMS, rollBoost } from "./progress.js";
import { landAt } from "./worldplan/plan.js";

/**
 * Where and how the caches are put out: one each `every` metres a player crosses the wilds (out
 * of the settlements: a move further than `jump` in one look, half a second, isn't crossing them
 * but being carried, by magic or a portal), `ahead` metres before them, within `spread` radians
 * of the way they're going (anywhere, if there's nowhere there). Clear of every road by `road`
 * metres, its guards' round and all (`round` further); of every settlement by `clear` metres, of
 * the places worth finding and the wild camps by `places`, and of any other cache by `apart`.
 * As strong as the mightiest player within `near` metres; let go once every player's further than
 * `far` (and not fighting there). On open ground: `open` of the squares as far out as its guards'
 * round and a step more free to walk on (not the steep or the wooded), and the ground at every stop
 * on the round. Its guards: `count` of them ([least, most]: the most only further out,
 * cacheCount), their leader `lead` tiers above the rest; each going for anyone who comes within
 * `guard` metres of them; all but the leader walking a round `round` metres about it, `stops`
 * stops on it, resting `rest` ms ([least, most]) at each.
 */
export const CACHES = Object.freeze({
    every: [350, 650],
    jump: 20,
    ahead: [70, 100],
    spread: 0.6,
    road: 25,
    clear: 80,
    places: 90,
    apart: 150,
    near: 120,
    far: 200,
    open: 0.85,
    count: [3, 5],
    lead: 2,
    guard: 8,
    round: 7,
    stops: 6,
    rest: [1500, 3500],
});

/**
 * The brigands of each land who keep a cache found there: their leader and the rest (creatures.js
 * ids, those with hands), and the lands (biomes) they're found in: outlaws under a bandit chief in
 * the farmed and wooded lowlands; goblins under an ogre in the badlands and the dry plains, or
 * under a troll in the mountains and the cold; the restless dead in the marshes and the barren
 * heath; cultists in the dark woods, the jungle and the burning lands. Where more than one band's
 * found, any of them (cacheBand); where none is, outlaws.
 */
export const CACHE_BANDS = Object.freeze({
    bandits: { name: "outlaws", leader: "banditChief", folk: "bandit", lands: ["farmland", "meadow", "woods", "heath", "elfwood", "beach"] },
    raiders: { name: "goblin raiders", leader: "ogre", folk: "goblin", lands: ["badlands", "savannah", "heath"] },
    trolls: { name: "goblins under a troll", leader: "troll", folk: "goblin", lands: ["mountain", "snow", "tundra"] },
    dead: { name: "the restless dead", leader: "skeleton", folk: "skeleton", lands: ["marsh", "tundra"] },
    cultists: { name: "cultists", leader: "cultist", folk: "cultist", lands: ["marsh", "darkwood", "jungle", "volcanic"] },
});

/**
 * What's in a cache, in each player's share of it: `gold` ([least, most], CHEST_GOLD more for each
 * tier above the first), `gear` pieces ([least, most]: any but a people's uniform, each as well
 * made as CACHE_MAKES has it for the band's tier), and a healing draught, `potion` of the time.
 */
export const CACHE_LOOT = Object.freeze({ gold: [20, 45], gear: [2, 3], potion: 0.6 });

/**
 * How well made a cache's gear is, by its band's tier: the first band of tiers it's at or above
 * (from the mightiest down), as likely as each make's share; a cache the strongest keep holds the
 * finest, a match for a player near the height of their power.
 */
export const CACHE_MAKES = Object.freeze([
    [9, { masterwork: 0.3, rare: 0.15, veryRare: 0.15, legendary: 0.4 }],
    [7, { fine: 0.2, masterwork: 0.45, rare: 0.1, veryRare: 0.05, legendary: 0.2 }],
    [5, { fine: 0.45, masterwork: 0.37, rare: 0.06, veryRare: 0.02, legendary: 0.1 }],
    [3, { common: 0.2, fine: 0.55, masterwork: 0.2, rare: 0.02, legendary: 0.03 }],
    [1, { common: 0.55, fine: 0.4, masterwork: 0.05 }],
]);

/** The pieces of gear a cache may hold (any but a people's uniform: GEAR). */
export const CACHE_GEAR = Object.freeze(Object.keys(GEAR).filter((id) => !GEAR[id].uniform));

/** The band that keeps a cache found on land of a kind (`biome`): one of those found there (CACHE_BANDS), as `random` has it; outlaws where none is. */
export function cacheBand(biome, random) {
    const found = Object.keys(CACHE_BANDS).filter((id) => CACHE_BANDS[id].lands.includes(biome));
    const id = found.length ? found[Math.floor(random.next() * found.length) % found.length] : "bandits";

    return { id, ...CACHE_BANDS[id] };
}

/** A cache's tier: its land's (`land`: creatures.js tierAt), or the mightiest player's near it (`might`, 0 to 8: a tier above it), whichever's the more, up to TIERS. */
export function cacheTier(land, might = 0) {
    return Math.min(TIERS, Math.max(land, 1 + might));
}

/** How many keep a cache of a tier, their leader too: CACHES.count's least, and one more possible every two tiers further out, up to its most. */
export function cacheCount(tier, random) {
    const [least, most] = CACHES.count;

    return least + random.int(0, Math.min(most - least, Math.floor((tier - 1) / 2)));
}

/** The round a cache's guards walk ([[x, y], ...] metres): CACHES.stops evenly about it (`at`), CACHES.round metres off. */
export function roundOf([x, y]) {
    return Array.from({ length: CACHES.stops }, (each, k) => {
        const angle = (k / CACHES.stops) * Math.PI * 2;

        return [x + cos(angle) * CACHES.round, y + sin(angle) * CACHES.round];
    });
}

/** Which stop on the round each of `guards` guards starts at: as evenly spread as they go. */
export const startsOf = (guards) => Array.from({ length: guards }, (each, k) => Math.floor((k * CACHES.stops) / guards));

/**
 * Is a place in the world ([x, y] metres) somewhere a cache may be put: on dry land, clear of every
 * settlement (CACHES.clear beyond its edge), of every road (`nearRoad(x, y, within)`: the
 * overworld's) by CACHES.road with its guards' round, of the places worth finding and the wild
 * camps (CACHES.places), and of every other cache (`others`: where they are) by CACHES.apart?
 */
export function cacheClear(plan, [x, y], { nearRoad = () => false, others = [] } = {}) {
    const land = landAt(plan, x, y);

    if (land.water || ["sea", "lake"].includes(land.biome) || !clearOfSettlements(plan, [x, y], CACHES.clear)) {
        return false;
    }

    if (placesOf(plan).some(({ at }) => hypot(at[0] - x, at[1] - y) < CACHES.places) || others.some(([ox, oy]) => hypot(ox - x, oy - y) < CACHES.apart)) {
        return false;
    }

    return !nearRoad(x, y, CACHES.road + CACHES.round);
}

/**
 * Is the ground about a place in the world ([x, y] metres) open enough for a cache, its guards
 * walking their round (`blocked(x, y)`: whether a square can't be walked on, grid.js squares)?
 * CACHES.open of the squares out to its round and a step more free, and its middle and every stop.
 */
export function openAround([x, y], blocked) {
    const reach = CACHES.round + 1;
    const [cx, cy] = [Math.floor(x), Math.floor(y)];
    let free = 0;
    let all = 0;

    for (let dy = -reach; dy <= reach; dy++) {
        for (let dx = -reach; dx <= reach; dx++) {
            if (dx * dx + dy * dy <= reach * reach) {
                all++;
                free += blocked(cx + dx, cy + dy) ? 0 : 1;
            }
        }
    }

    return free >= all * CACHES.open && [[x, y], ...roundOf([x, y])].every(([sx, sy]) => !blocked(Math.floor(sx), Math.floor(sy)));
}

/** A make for a cache's piece of gear at its band's tier (CACHE_MAKES), as `random` has it. */
export function cacheMake(tier, random) {
    const [, makes] = CACHE_MAKES.find(([from]) => tier >= from) ?? CACHE_MAKES.at(-1);
    let pick = random.next();

    return Object.keys(makes).find((quality) => (pick -= makes[quality]) < 0) ?? Object.keys(makes).at(-1);
}

/**
 * A player's share of a cache whose band was of a `tier` (random.js random; `people`: the maker of
 * any people's piece in it): { gold, items }, CACHE_LOOT's; its gear made as any's is (gear.js
 * rollGear: its bonuses rolled), a wand's or grimoire's boost to spells rolled as a shop's is.
 */
export function rollCache(tier, random, { people = "human" } = {}) {
    const gold = Math.round(random.int(...CACHE_LOOT.gold) * (1 + CHEST_GOLD * (Math.max(1, tier) - 1)));
    const pieces = random.int(...CACHE_LOOT.gear);
    const items = [];

    for (let k = 0; k < pieces; k++) {
        const id = CACHE_GEAR[Math.floor(random.next() * CACHE_GEAR.length) % CACHE_GEAR.length];
        const made = rollGear(id, cacheMake(tier, random), random, { people });

        items.push(ITEMS[id].magic ? { ...made, boost: rollBoost(random) } : made);
    }

    if (random.chance(CACHE_LOOT.potion)) {
        items.push({ id: "potion", quality: "common" });
    }

    return { gold, items };
}

