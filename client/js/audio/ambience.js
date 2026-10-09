// The ambience (sound.js setAmbience): what's heard round the player besides what anyone's doing.
//
//  - Beds, each a recording looped round and round (recorded.js loop), as loud as where the player
//    is makes it. Indoors, each place's (INDOORS): a taproom's crowd and its hearth, a temple's
//    hush, a crypt's still air, a cave's drips. Out in the world, its land's wind (on open land,
//    in the woods, up high), water near (a stream, a river, a waterfall, the sea's surf, a lake
//    lapping), the crickets after dark and the marsh's frogs, a town's bustle and its market's by
//    day, a camp fire's or a brazier's crackle close by.
//  - Calls now and then (CALLS), each from somewhere round the player: birds by the time of day,
//    crows, gulls, an owl at night, a tree creaking in the woods, a town's dogs, hens and horses,
//    a farm's cattle and sheep, the smith's hammer near a smithy.
//  - A church's bell at the hours of prayer (TOLLS), heard in a town.
//
// What's round the player is the game's to say (app/surroundings.js): this only says what's heard.

import { DAY, daylight, HOUR } from "../core/daytime.js";

// The lands of each kind: wooded (the wind in the trees, an owl, a tree creaking); open (crows
// over them); farmed (cattle and sheep in the fields); bare, where no cricket sings
const WOODED = new Set(["woods", "darkwood", "elfwood", "jungle"]);
const OPEN = new Set(["farmland", "meadow", "heath", "savannah", "badlands", "bandits"]);
const FARMED = new Set(["farmland", "meadow"]);
const BARE = new Set(["sea", "snow", "tundra", "mountain", "volcanic"]);

// Lands where few birds sing (a share of the usual)
const FEW_BIRDS = { savannah: 0.5, badlands: 0.35, volcanic: 0.15, beach: 0.5, heath: 0.7, marsh: 0.7 };

// How far off each bed's heard (metres: loudest at hand, nothing beyond)
const REACH = { stream: 35, river: 60, falls: 90, sea: 120, lake: 45, frogs: 60, market: 45, fire: 16, brazier: 10, hearth: 14, smithy: 70, gulls: 150 };

// The dawn chorus: from first light until this long after the sun's up
const CHORUS = DAY.rises + 2 * HOUR;

/**
 * Each place indoors (sound.js PLACES), and what's heard there: its beds, each at how loud
 * (1: as recorded, about as loud as the wind out of doors), and the sounds of the folk at work
 * there, downloaded as the player comes in (`wants`).
 */
export const INDOORS = Object.freeze({
    taproom: { beds: { tavernLoop: 0.9 }, hearth: 0.6, wants: ["clink", "pour", "crackle", "stairs"] },
    upstairs: { beds: { tavernLoop: 0.3 }, wants: ["stairs"] },
    smithy: { beds: { brazierLoop: 0.8 }, wants: ["anvil", "hiss", "bellows", "grind"] },
    temple: { beds: { templeLoop: 1 } },
    guild: { beds: { tavernLoop: 0.35 }, wants: ["rustle"] },
    hall: { beds: { templeLoop: 0.4 }, wants: ["rustle"] },
    shop: { beds: { templeLoop: 0.25 }, wants: ["rustle"] },
    keep: { beds: { cryptLoop: 0.5 } },
    undercroft: { beds: { cryptLoop: 0.8, brazierLoop: 0.35 } },
    cave: { beds: { caveDrips: 1 } },
    lair: { beds: { lairLoop: 1 } },
    crypt: { beds: { cryptLoop: 0.9, caveDrips: 0.4 } },
    ruin: { beds: { windHigh: 0.6, caveDrips: 0.3 } },
    tower: { beds: { windHigh: 0.7 } },
});

/**
 * The calls: how often each is heard (`every` [from, to] seconds, at its usual), from how far off
 * round the player (`away` [from, to] metres; or from a tree near, `tree`), and how far off it can
 * be heard at all (`heard`, metres: sound.js play's `far`); some through the air as from far off
 * (`muffle`: a low-pass filter's frequency, Hz).
 */
export const CALLS = Object.freeze({
    birdDay: { every: [4, 14], away: [8, 30], heard: 40 },
    birdDawn: { every: [2.5, 7], away: [10, 35], heard: 45 },
    crow: { every: [20, 50], away: [25, 60], heard: 80 },
    gull: { every: [8, 22], away: [15, 50], heard: 70 },
    owl: { every: [25, 60], away: [20, 50], heard: 70 },
    creakTree: { every: [25, 70], tree: true, heard: 30 },
    dogBark: { every: [18, 55], away: [20, 60], heard: 80 },
    chickens: { every: [25, 70], away: [10, 35], heard: 45 },
    rooster: { every: [12, 35], away: [25, 70], heard: 100 },
    horseWhinny: { every: [45, 120], away: [15, 45], heard: 60 },
    cowMoo: { every: [25, 70], away: [30, 80], heard: 110 },
    sheepBleat: { every: [20, 60], away: [20, 60], heard: 80 },
    distantHammer: { every: [5, 12], heard: 80, muffle: 1800 },
});

/**
 * The hours of prayer a church's bell is rung at (of the day's 24: prime, terce, sext, none and
 * vespers): how many strokes, how far apart (seconds), from how far off (metres), heard how far.
 */
export const TOLLS = Object.freeze({ hours: Object.freeze([6, 9, 12, 15, 18]), strokes: 3, apart: 2.4, away: [60, 120], heard: 260 });

// How loud something `far` metres off is, heard no further than `reach`: as loud as can be at
// hand, fading to nothing
const near = (far, reach) => Math.max(0, 1 - far / reach) ** 2;

/**
 * What's heard where the player is: { beds ({ name: how loud }), calls ({ name: CALLS' with how
 * loud (`volume`), how much oftener than usual (`often`), and where from (`at`, if anywhere in
 * particular) }), wants (more to download now: the folk at work's sounds, the doors') }. `facts` (app/surroundings.js):
 * { place (sound.js PLACES: "town" out of doors), time (of day, ms from midnight: daytime.js
 * timeOfDay); indoors, how far the hearth is (`hearth`, metres); out of doors, the land (`land`,
 * a BIOMES id), whether it's high (`high`), how far each of the waters is (`water`: { stream,
 * river, falls, sea, lake }, metres), how much of round about's a settlement's (`settled`, 0 to
 * 1), how far a market (`market`) is, a camp fire (`fire`), a lit brazier (`brazier`) (metres);
 * and a smithy, where (`smithy`: { x, z, far }) }.
 */
export function ambienceOf(facts) {
    return facts.place === "town" || !INDOORS[facts.place] ? outdoors(facts) : indoors(facts);
}

function indoors({ place, hearth = Infinity }) {
    const { beds, wants = [], hearth: fire = 0 } = INDOORS[place];
    const heard = { ...beds };

    if (fire && near(hearth, REACH.hearth) > 0.01) {
        heard.hearthLoop = round(fire * near(hearth, REACH.hearth));
    }

    return { beds: heard, calls: {}, wants: [...wants, doorOf(place)].filter(Boolean) };
}

function outdoors({ land = "meadow", high = false, water = {}, settled = 0, market = Infinity, fire = Infinity, brazier = Infinity, smithy = null, time = DAY.day }) {
    const light = daylight(time);
    const dark = 1 - light;
    const town = Math.max(0, Math.min(1, settled));
    const wooded = WOODED.has(land);
    const far = (what) => water[what] ?? Infinity;
    const beds = {};
    const calls = {};
    const bed = (name, gain) => gain > 0.01 && (beds[name] = round(Math.max(beds[name] ?? 0, gain)));
    const call = (name, volume, { often = 1, at = null } = {}) => volume > 0.01 && often > 0 && (calls[name] = { ...CALLS[name], volume: round(volume), often: round(often), ...(at ? { at } : {}) });

    // The wind: up high, in the trees or over open land; less of it between a town's walls
    bed(high ? "windHigh" : wooded ? "windForest" : "windOpen", (high ? 1 : 0.8) * (1 - 0.5 * town));

    // Water near
    bed("streamLoop", 0.9 * near(far("stream"), REACH.stream));
    bed("riverLoop", near(far("river"), REACH.river));
    bed("waterfallLoop", 1.1 * near(far("falls"), REACH.falls));
    bed("surfLoop", near(far("sea"), REACH.sea));
    bed("lakeLapping", 0.9 * near(far("lake"), REACH.lake));

    // After dark: crickets (none up high, on the snow or at sea; fewer in a town), and frogs in
    // the marsh and round a lake
    bed("nightLoop", BARE.has(land) || high ? 0 : 0.8 * dark * (1 - 0.6 * town));
    bed("frogsLoop", 0.8 * dark * Math.max(land === "marsh" ? 1 : 0, near(far("lake"), REACH.frogs)));

    // A town's bustle (quieter at night), its market's by day; a fire's crackle close by
    bed("townLoop", 0.8 * town * (0.35 + 0.65 * light));
    bed("marketLoop", 0.9 * light * near(market, REACH.market));
    bed("campfireLoop", 0.8 * near(fire, REACH.fire));
    bed("brazierLoop", 0.6 * near(brazier, REACH.brazier));

    // Birds: by day, the dawn's chorus at first light, crows over open land, gulls by the sea, an
    // owl in the night; few up high or on bare land, fewer in a town, more in the woods
    const birds = BARE.has(land) || high ? 0 : (FEW_BIRDS[land] ?? 1) * (wooded ? 1.5 : 1) * (1 - 0.5 * town);

    call("birdDay", light > 0.25 ? light : 0, { often: birds });
    call("birdDawn", time >= DAY.dawn && time < CHORUS ? 1 : 0, { often: birds });
    call("crow", light > 0.25 ? 1 : 0, { often: high ? 0.3 : OPEN.has(land) ? 1 : 0 });
    call("gull", light > 0.25 ? 1 : 0, { often: far("sea") < REACH.gulls ? 1 : 0 });
    call("owl", dark > 0.7 && (wooded || OPEN.has(land)) ? 1 : 0, { often: wooded ? 1 : 0.5 });
    call("creakTree", wooded ? 1 : 0);

    // A town's dogs (at night too, if less), hens and horses; the cock crowing at dawn round a
    // town or a farm; a farm's cattle and sheep in its fields
    call("dogBark", town > 0.15 ? 1 : 0, { often: town * (0.5 + 0.5 * light) });
    call("chickens", town > 0.1 && light > 0.25 ? 1 : 0, { often: town });
    call("rooster", (town > 0.1 || FARMED.has(land)) && time >= DAY.dawn && time < CHORUS ? 1 : 0);
    call("horseWhinny", town > 0.3 && light > 0.25 ? 1 : 0);
    call("cowMoo", FARMED.has(land) && light > 0.25 ? 1 : 0, { often: 1 - 0.8 * town });
    call("sheepBleat", FARMED.has(land) && light > 0.25 ? 1 : 0, { often: 1 - 0.8 * town });

    // The smith's hammer from the smithy, by day
    call("distantHammer", smithy && light > 0.25 ? near(smithy.far, REACH.smithy) ** 0.5 : 0, { at: smithy });

    // (And downloaded now: the leaves in the trees; in a town, its doors and its church's bell)
    return { beds, calls, wants: ["leaves", ...(town > 0 ? ["door", "churchBell"] : [])] };
}

/**
 * Whether a church's bell rings between two times of day (ms from midnight, `before` then `now`):
 * one of TOLLS' hours passed.
 */
export function tolled(before, now) {
    return TOLLS.hours.some((hour) => {
        const at = hour * HOUR;

        return before <= now ? before < at && at <= now : before < at || at <= now;
    });
}

/**
 * The door heard going in or out of a place (sound.js PLACES): a heavy one into a keep, a temple,
 * a hall or a tower; an iron gate into a ruin; none into a cave or the lair (an open mouth); a
 * house's door anywhere else.
 */
export function doorOf(place) {
    return DOORS[place] === undefined ? "door" : DOORS[place];
}

const DOORS = { keep: "doorHeavy", temple: "doorHeavy", hall: "doorHeavy", undercroft: "doorHeavy", tower: "doorHeavy", ruin: "gate", crypt: "trapdoor", cave: null, lair: null };

// (Rounded, for steady numbers to compare)
const round = (value) => Math.round(value * 1000) / 1000;
