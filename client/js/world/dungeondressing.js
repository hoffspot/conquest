// What a dungeon's rooms are dressed with, beyond what's built for them (world/interiors3d.js
// dungeon): the scanned models (dungeons3d.js DUNGEON_PROPS) set down as each theme's room has
// them. Each piece of a level's plan its theme's builder put there (core/dungeons/themes.js, by
// plan character) is dressed by its kind: what's left against a wall ("clutter": a bucket, a
// ladder leant on the rock, a fallen log, a heap of skulls; chosen by the theme and the room's
// look), the remains of someone who died there, shelves and what's kept on them, a side table with
// a light on it, a stand of arms, an offering's vessels, a workbench and its tools, an anvil on its
// block. And round what interiors3d.js draws itself, the things that go with it: stools at a table
// and what's on it, a pot by the fire, a lantern by a bedroll. And along the walls, small things to
// walk over (stones, bark, a dropped bone). And the bones of the dead: heaped, scattered, a skull
// on its own, someone's remains where they lay.
//
// Everything's in metres, placements as dungeons3d.js furnish takes them ({ model, x, z, y | on,
// size | scale | fit, turn, roll, tint }), each chosen by the numbers of its own square (`rough`),
// so a level's always dressed the same way.

/** A number from 0 to 1 for a place and a draw: the same every time. */
export function hashOf(x, y, k = 0) {
    const s = Math.sin(x * 12.9898 + y * 78.233 + k * 37.719) * 43758.5453;

    return s - Math.floor(s);
}

// One of `list` ([name, weight] pairs, or names), by `r` (0 to 1)
function pick(list, r) {
    const weighted = list.map((each) => (Array.isArray(each) ? each : [each, 1]));
    const total = weighted.reduce((sum, [, weight]) => sum + weight, 0);
    let left = r * total;

    for (const [name, weight] of weighted) {
        left -= weight;

        if (left < 0) {
            return name;
        }
    }

    return weighted.at(-1)[0];
}

// A square of a level dressed: its middle (metres), the way to the rock beside it ([dx, dz], or
// null), the turn that faces a thing away from that rock (its front along +z), a number of its own
// (0 to 1) and more of them (draw k)
function spotOf(x, z, wall, rough) {
    return { x, z, wall, turn: wall ? Math.atan2(-wall[0], -wall[1]) : rough * Math.PI * 2, rough, r: (k) => hashOf(x, z, k + rough * 7) };
}

// A point `out` metres from a spot's middle towards its wall (negative: away from it), and `side`
// metres along the wall
function along(spot, out, side = 0) {
    const [dx, dz] = spot.wall ?? [0, 1];

    return [spot.x + dx * out - dz * side, spot.z + dz * out + dx * side];
}

// A long thing (its length up its own y: a spade, a broom) leant on the wall `tilt` radians from
// upright, edge on, its top at the wall and `side` metres along it
function leaning(spot, model, { length, tilt = 0.28, side = 0, tint = null }) {
    const [dx, dz] = spot.wall ?? [0, 1];
    const [x, z] = along(spot, 0.42 - (Math.sin(tilt) * length + 0.06) / 2, side);

    // (Rolled about its own z, its top swings to its own -x: turned so that's towards the wall)
    return { model, x, z, size: length, roll: tilt, turn: Math.atan2(dz, -dx), tint };
}

// A flat thing (a shield, its face along its own +z) leant back on the wall, facing out
function leaningBack(spot, model, { length, tilt = 0.2, side = 0, tint = null }) {
    const [x, z] = along(spot, 0.42 - (Math.sin(tilt) * length + 0.1) / 2, side);

    return { model, x, z, size: length, pitch: -tilt, turn: spot.turn, tint };
}

// The models whose length runs along their own z (the rest that are long run along x)
const LONG_Z = new Set(["branches-a", "branches-b", "branches-c", "root-single", "estoc", "saw", "bark-a", "bark-b", "bark-c", "bark-d", "sword"]);

// Laid down flat along the wall (a log, a branch), `out` metres from the middle towards it
const lying = (spot, model, { size, out = 0.15, side = 0, tint = null, turn = 0 }) => {
    const [x, z] = along(spot, out, side);

    return { model, x, z, size, turn: spot.turn + (LONG_Z.has(model) ? Math.PI / 2 : 0) + turn, tint };
};

// Set down by the wall, facing out from it
const standing = (spot, model, { size, fit, out = 0.12, side = 0, turn = 0, tint = null, y }) => {
    const [x, z] = along(spot, out, side);

    return { model, x, z, ...(fit ? { fit } : { size }), turn: spot.turn + turn, tint, ...(y === undefined ? {} : { y }) };
};

// --- What's left against a wall, by name: each a way of setting it down at a spot ---

const MOSSY = ["mossrock-a", "mossrock-b", "mossrock-c", "mossrock-d", "mossrock-e", "mossrock-f", "mossrock2-a", "mossrock2-b", "mossrock2-c", "mossrock2-d", "mossrock2-e", "mossrock2-f", "mossrock2-g"];
const BOULDERS = ["boulder", "boulder-02", "boulder-03", "boulder-04", "boulder-06"];
const ROCKS = ["rock-a", "rock-b", "rock-c", "rock-d", "rock-e", "rock-f", "rock-flat", "rock-shard", "stone"];
const STONES = ["pebble-a", "pebble-b", "pebble-c", "pebble-d", "pebble-e", "stone-a", "stone-b", "stone-c", "stone-d"];
const ROOTS = ["root-single"];
const BRANCHES = ["branches-a", "branches-b", "branches-c"];
const BARK = ["bark-a", "bark-b", "bark-c", "bark-d"];
const BONES = ["bone"];
const MUSHROOMS = ["mushrooms"];
const TABLEWARE = ["goblet-a", "goblet-b", "goblet-c", "bowl", "bowl-small", "plate", "plate", "board", "apple", "onion", "sweet-potato", "pomegranate", "candlestick", "spoon", "pot-clay"];
const VESSELS = ["vase-antique", "vase-tall", "vase-brass", "vase-small", "vase", "pot-clay", "pot-brass", "pot-flat", "goblet-a", "goblet-b", "urn-face", "urn-carved", "bronze-vessel"];
// (Those that stand on end: the estoc, its length along z, is laid down)
const WEAPONS = ["saber", "mace", "war-hammer", "axe-long", "axe-old", "axe"];
const TOOLS = ["saw", "hammer", "mallet", "hatchet", "dagger", "axe-old"];

// The skulls (CDmir's, and Paul_Wortmann's worn ones: upright, on its side)
const SKULLS = ["skull", "skull", "skull-worn", "skull-side"];

// An old skull where it fell (`r`: a spot's draws, from `k`), tipped now and then
const skullAt = (x, z, r, k = 0) => ({ model: pick(SKULLS, r(k)), x, z, scale: 0.9 + 0.2 * r(k + 1), turn: r(k + 2) * 6, roll: r(k + 3) < 0.3 ? (r(k + 4) - 0.5) * 1.4 : 0, shadow: false });

// Beasts' skulls, how big each is (metres at its longest): a wolf's, a cave bear's, a cow's, a
// stag's (its antlers), a ram's
const BEAST_SKULLS = Object.freeze({ "wolf-skull": 0.25, "bear-skull": 0.45, "cow-skull": 0.6, "stag-skull": 0.7, "sheep-skull": 0.3 });

// A long bone where it fell, an arm's or a leg's (from 0.2 to 0.45 metres)
const boneAt = (x, z, r, k = 0) => ({ model: "bone", x, z, scale: 1 + 1.1 * r(k), turn: r(k + 1) * 6, shadow: false });

// How big each of the small things is (metres: its longest side)
const SIZES = Object.freeze({
    "goblet-a": 0.2, "goblet-b": 0.22, "goblet-c": 0.18, bowl: 0.3, "bowl-small": 0.14, plate: 0.27, board: 0.42, apple: 0.08, onion: 0.08, "sweet-potato": 0.16,
    pomegranate: 0.1, candlestick: 0.24, spoon: 0.26, "vase-antique": 0.45, "vase-tall": 0.7, "vase-brass": 0.52, "vase-small": 0.2, vase: 0.18, "pot-clay": 0.3,
    "pot-brass": 0.32, "pot-flat": 0.36, saw: 0.62, hammer: 0.3, mallet: 0.3, hatchet: 0.38, dagger: 0.34, "axe-old": 0.6, lantern: 0.5, "basket-lidded": 0.3,
    "candleholder-a": 0.55, "candleholder-b": 0.45, "candleholder-c": 0.8, "urn-face": 0.45, "urn-carved": 0.5, "bronze-vessel": 0.32, mushrooms: 0.2, fungus: 0.35,
});

const small = (name) => SIZES[name] ?? 0.3;

export const CLUTTER_KINDS = {
    // A cave's
    mossy: (spot, tint) => [standing(spot, pick(MOSSY, spot.r(1)), { size: 0.9 + 0.7 * spot.r(2), out: 0.2, turn: spot.r(3) * 6, tint })],
    boulder: (spot, tint) => [standing(spot, pick(BOULDERS, spot.r(1)), { size: 1.1 + 0.6 * spot.r(2), out: 0.18, turn: spot.r(3) * 6, tint })],
    rocks: (spot, tint) => [0, 1, 2].map((k) => standing(spot, pick(ROCKS, spot.r(k + 1)), { size: 0.3 + 0.35 * spot.r(k + 4), out: 0.25 - 0.25 * k, side: (k - 1) * 0.35, turn: spot.r(k + 7) * 6, tint })),
    log: (spot, tint) => [lying(spot, spot.r(1) < 0.5 ? "log" : "log-big", { size: 2.2 + 0.8 * spot.r(2), out: 0.15, tint, turn: (spot.r(3) - 0.5) * 0.4 })],
    stump: (spot) => [standing(spot, spot.r(1) < 0.5 ? "stump" : "stump-2", { size: 1 + 0.3 * spot.r(2), out: 0.1, turn: spot.r(3) * 6 })],
    branches: (spot) => [lying(spot, pick(BRANCHES, spot.r(1)), { size: 1.2 + 0.4 * spot.r(2), out: 0.2 }), lying(spot, pick(BRANCHES, spot.r(3)), { size: 0.9 + 0.3 * spot.r(4), out: 0.05, side: 0.2, turn: 0.5 })],
    roots: (spot) => [lying(spot, pick(ROOTS, spot.r(1)), { size: 1.2 + 0.8 * spot.r(2), out: 0.25, turn: (spot.r(3) - 0.5) * 1.2 })],
    firewood: (spot) => {
        const below = lying(spot, pick(BRANCHES, spot.r(1)), { size: 1.1, out: 0.2 });

        return [below, { ...lying(spot, pick(BRANCHES, spot.r(2)), { size: 1, out: 0.2, turn: 0.15 }), on: below }];
    },
    // A camp's or a store's
    bucket: (spot) => [standing(spot, spot.r(1) < 0.6 ? "bucket" : "bucket-wide", { size: 0.42 + 0.15 * spot.r(2), out: 0.15, side: (spot.r(3) - 0.5) * 0.3, turn: spot.r(4) * 6 })],
    basket: (spot) => {
        const lidded = spot.r(1) < 0.4;
        const basket = standing(spot, lidded ? "basket-lidded" : "basket", { size: lidded ? 0.32 : 0.45, out: 0.15, turn: spot.r(2) * 6 });

        // (An open one heaped with what's to eat)
        return lidded ? [basket] : [basket, ...[0, 1, 2].map((k) => ({ model: pick(["apple", "onion", "sweet-potato"], spot.r(3)), on: basket, x: basket.x + (k - 1) * 0.08, z: basket.z + (k % 2) * 0.05, size: small("apple") * 1.1, turn: spot.r(k + 4) * 6, shadow: false }))];
    },
    pot: (spot) => [standing(spot, pick(["pot", "pot-clay", "pot-brass", "pot-flat"], spot.r(1)), { size: 0.4 + 0.2 * spot.r(2), out: 0.15, turn: spot.r(3) * 6 })],
    tools: (spot) => [leaning(spot, spot.r(1) < 0.5 ? "pickaxe" : "spade", { length: 1.1, side: -0.2 }), ...(spot.r(2) < 0.6 ? [leaning(spot, spot.r(3) < 0.5 ? "spade" : "axe-long", { length: spot.r(3) < 0.5 ? 1.1 : 0.75, side: 0.25, tilt: 0.22 })] : [])],
    // (A step ladder, standing by the wall)
    ladder: (spot) => [standing(spot, "ladder", { size: 1.7, out: 0.1, turn: Math.PI / 2 })],
    barrel: (spot) => [standing(spot, pick(["barrel", "barrel-old", "barrel-worn"], spot.r(1)), { size: 0.9 + 0.15 * spot.r(2), out: 0.1, turn: spot.r(3) * 6 }), ...(spot.r(4) < 0.3 ? [standing(spot, "staves", { size: 1, out: -0.3, turn: spot.r(5) * 6 })] : [])],
    staves: (spot) => [standing(spot, "staves", { size: 1.1, out: 0, turn: spot.r(1) * 6 })],
    crate: (spot) => {
        const below = standing(spot, pick(["crate", "crate-long", "crate-big"], spot.r(1)), { size: 0.95 + 0.2 * spot.r(2), out: 0.1, turn: (spot.r(3) - 0.5) * 0.4 });
        const name = pick(["lantern", "basket-lidded", "pot-clay", "candlestick", "bowl"], spot.r(5));

        return spot.r(4) < 0.45 ? [below, { model: name, on: below, x: below.x, z: below.z, size: small(name), turn: spot.r(6) * 6, shadow: false }] : [below];
    },
    // (Pots and jars of stores, one by another)
    jars: (spot) => [0, 1, 2].slice(0, 2 + Math.floor(spot.r(1) * 2)).map((k) => standing(spot, pick(["pot", "pot-clay", "pot-brass", "basket-lidded"], spot.r(k + 2)), { size: 0.32 + 0.1 * spot.r(k + 5), out: 0.3 - 0.15 * k, side: (k - 1) * 0.3, turn: spot.r(k + 8) * 6 })),
    lantern: (spot) => [standing(spot, "lantern", { size: 0.5, out: 0.25, turn: spot.r(2) * 6 })],
    stool: (spot) => [standing(spot, pick(["stool", "stool-low", "stool-folding"], spot.r(1)), { size: 0.5, out: 0.05, turn: spot.r(2) * 6 })],
    // (A settle against the wall, and now and then a cabinet)
    settle: (spot) => [standing(spot, spot.r(1) < 0.7 ? "bench" : "cabinet-gothic", { size: spot.r(1) < 0.7 ? 1.15 : 1.7, out: 0.18 })],
    // (The rats that live off what's left)
    rats: (spot) => [0, 1].slice(0, 1 + Math.floor(spot.r(1) * 2)).map((k) => standing(spot, "rat", { size: 0.22, out: 0.2 - 0.3 * k, side: (k - 0.5) * 0.4, turn: spot.r(k + 3) * 6 })),
    shield: (spot) => [leaningBack(spot, "shield-kite", { length: 1.05, tilt: 0.18, side: -0.1 }), ...(spot.r(1) < 0.6 ? [leaning(spot, pick(WEAPONS, spot.r(2)), { length: 1.1, side: 0.3, tilt: 0.2 })] : [])],
    candles: (spot) => {
        const name = pick(["candleholder-a", "candleholder-b", "candleholder-c", "candlestick"], spot.r(1));

        return [standing(spot, name, { size: small(name), out: 0.2, turn: spot.r(2) * 6 })];
    },
    // (Mushrooms come up by the wall, a branch grown over with bracket fungus fallen there)
    fungi: (spot) => [0, 1, 2].slice(0, 1 + Math.floor(spot.r(1) * 3)).map((k) => standing(spot, "mushrooms", { size: 0.14 + 0.12 * spot.r(k + 2), out: 0.25 - 0.2 * k, side: (spot.r(k + 5) - 0.5) * 0.7, turn: spot.r(k + 8) * 6 })).concat(spot.r(12) < 0.5 ? [lying(spot, "fungus", { size: 0.35, out: 0.1, side: 0.25, turn: Math.PI / 2 })] : []),
    cauldron: (spot) => [standing(spot, "cauldron", { size: 0.5 + 0.1 * spot.r(1), out: 0.15, turn: spot.r(2) * 6 })],
    chest: (spot) => [standing(spot, "chest-old", { size: 0.8 + 0.1 * spot.r(1), out: 0.12, turn: (spot.r(2) - 0.5) * 0.3 })],
    // (A painted coffin stood up against the wall)
    coffin: (spot) => [standing(spot, "sarcophagus-painted", { size: 1.9, out: 0.1 })],
    // (A beast's skull by the wall, now and then another by it)
    "beast-skulls": (spot) => [0, 1].slice(0, 1 + (spot.r(1) < 0.3 ? 1 : 0)).map((k) => {
        const name = pick(Object.keys(BEAST_SKULLS), spot.r(k + 2));

        return standing(spot, name, { size: BEAST_SKULLS[name] * (0.9 + 0.2 * spot.r(k + 4)), out: 0.22 - 0.3 * k, side: (k - 0.5) * 0.5 * k, turn: spot.r(k + 6) * 6 });
    }),
    // (Skulls heaped by the wall, or set in a row with one on them)
    skulls: (spot) => {
        if (spot.r(1) < 0.45) {
            return [standing(spot, "skull-pile", { size: 0.38 + 0.12 * spot.r(2), out: 0.2, turn: spot.r(3) * 6 })];
        }

        const row = [-1, 0, 1].map((k) => skullAt(...along(spot, 0.3 - 0.05 * Math.abs(k), k * 0.2), spot.r, 4 + k * 5));

        return spot.r(2) < 0.6 ? [...row, { ...skullAt(row[1].x, row[1].z, spot.r, 20), on: row[1], roll: 0 }] : row;
    },
    // (A heap of bones by the wall, a long bone or two fallen from it)
    bones: (spot) => [standing(spot, spot.r(1) < 0.6 ? "bone-heap" : "skull-crossbones", { size: 0.36 + 0.12 * spot.r(2), out: 0.2, turn: spot.r(3) * 6 }), ...[0, 1].slice(0, Math.floor(spot.r(4) * 3)).map((k) => boneAt(...along(spot, -0.05 - 0.15 * k, (k - 0.5) * 0.5), spot.r, 6 + k * 2))],
    vessels: (spot) => [0, 1, 2].slice(0, 1 + Math.floor(spot.r(1) * 3)).map((k) => {
        const name = pick(VESSELS, spot.r(k + 2));

        return standing(spot, name, { size: small(name) * (0.9 + 0.3 * spot.r(k + 5)), out: 0.25 - 0.15 * k, side: (k - 1) * 0.28, turn: spot.r(k + 8) * 6 });
    }),
};

/**
 * What's left against a wall, by theme and by the room's look (core/dungeons/themes.js): [name
 * (CLUTTER_KINDS), weight] for each. A look not listed has its theme's `any`.
 */
export const CLUTTER = {
    caves: {
        mouth: [["log", 3], ["stump", 1], ["branches", 3], ["mossy", 4], ["boulder", 1], ["roots", 1]],
        pillars: [["mossy", 2], ["boulder", 3], ["rocks", 3], ["roots", 2], ["fungi", 1]],
        camp: [["bucket", 2], ["basket", 2], ["pot", 2], ["tools", 3], ["ladder", 1], ["barrel", 1], ["staves", 1], ["firewood", 3], ["lantern", 1], ["crate", 1], ["rats", 1], ["cauldron", 1]],
        drip: [["mossy", 2], ["rocks", 3], ["roots", 2], ["fungi", 3]],
        bonepit: [["skulls", 3], ["bones", 4], ["rocks", 1], ["rats", 1], ["beast-skulls", 3]],
        nest: [["bones", 3], ["branches", 2], ["rocks", 1], ["beast-skulls", 3]],
        nook: [["rocks", 3], ["roots", 2], ["boulder", 1], ["rats", 1], ["fungi", 2]],
        throne: [["skulls", 3], ["bones", 2], ["boulder", 1], ["candles", 1], ["beast-skulls", 2]],
        any: [["rocks", 3], ["boulder", 2], ["roots", 1], ["fungi", 1], ["beast-skulls", 1]],
    },
    hideout: {
        gate: [["crate", 2], ["barrel", 2], ["bucket", 1], ["tools", 1], ["shield", 1], ["firewood", 1]],
        mess: [["barrel", 2], ["stool", 2], ["bucket", 1], ["basket", 2], ["firewood", 1], ["jars", 2], ["pot", 1], ["settle", 2], ["cauldron", 1]],
        loot: [["crate", 3], ["jars", 2], ["basket", 1], ["barrel", 1], ["shield", 1], ["chest", 3]],
        bunks: [["lantern", 2], ["bucket", 1], ["basket", 1], ["jars", 1], ["stool", 1], ["chest", 1]],
        store: [["barrel", 3], ["basket", 2], ["bucket", 2], ["crate", 2], ["pot", 2], ["ladder", 1], ["chest", 1]],
        kennel: [["bucket", 2], ["staves", 1], ["firewood", 1], ["rats", 2], ["bones", 3], ["beast-skulls", 2]],
        chief: [["candles", 2], ["jars", 1], ["shield", 1], ["crate", 1], ["settle", 2], ["chest", 2], ["beast-skulls", 1]],
        any: [["crate", 2], ["barrel", 2], ["bucket", 1], ["basket", 1]],
    },
    ancient: {
        cell: [["vessels", 1], ["rocks", 2], ["rats", 1], ["bones", 2]],
        ossuary: [["skulls", 4], ["bones", 3], ["candles", 1], ["vessels", 1], ["coffin", 1]],
        sanctum: [["skulls", 1], ["candles", 2], ["vessels", 2], ["coffin", 1]],
        any: [["vessels", 2], ["rocks", 2], ["candles", 1]],
    },
};

/** What's left against a wall at a square (metres: its middle; `wall`, `rough`), for a theme's room's look. */
export function clutterAt(x, z, { theme, look, wall, rough, tint = null }) {
    const kinds = CLUTTER[theme]?.[look] ?? CLUTTER[theme]?.any ?? CLUTTER.caves.any;
    const spot = spotOf(x, z, wall, rough);

    return CLUTTER_KINDS[pick(kinds, spot.r(0))](spot, tint);
}

/**
 * The things set out on a table (metres: its middle `x`, `z`; `along`: whether its length runs
 * along x; its `length`, `depth` and `top`, how high it is): a few of the tableware, and now and
 * then a candlestick or a jug, each its own way.
 */
export function onTable(x, z, { along: lengthwise, length, depth, top, rough }) {
    const count = 2 + Math.floor(hashOf(x, z, rough) * 3);
    const placed = [];

    for (let k = 0; k < count; k++) {
        const name = pick(TABLEWARE, hashOf(x + k, z, rough + 1));
        const [u, v] = [(hashOf(z, x + k, 2) - 0.5) * (length - 0.4), (hashOf(x, k, 3) - 0.5) * (depth - 0.3)];

        placed.push({ model: name, x: x + (lengthwise ? u : v), z: z + (lengthwise ? v : u), y: top, size: small(name), turn: hashOf(k, x, 4) * 6, shadow: false });
    }

    return placed;
}

/**
 * Stools and benches drawn up to a table (as onTable), on its long sides, part under it; [] now and
 * then (they're all sat on elsewhere).
 */
export function seatsAt(x, z, { along: lengthwise, length, depth, rough }) {
    const placed = [];

    for (const side of [-1, 1]) {
        const count = Math.floor(hashOf(x, side, rough) * 2.6);

        for (let k = 0; k < count; k++) {
            const u = count === 1 ? (hashOf(z, k, side) - 0.5) * (length - 0.6) : (k - 0.5) * length * 0.5;
            const v = side * (depth / 2 + 0.05);
            const name = pick([["stool", 3], ["stool-low", 1], ["stool-folding", 2]], hashOf(x + k, z + side, 5));

            placed.push({ model: name, x: x + (lengthwise ? u : v), z: z + (lengthwise ? v : u), size: 0.5, turn: hashOf(k, side, x) * 6 });
        }
    }

    return placed;
}

// --- Pieces of a level's plan dressed by these alone: each (metres: the piece's middle and size;
// its wall; a number of its own) to placements ---

/** Shelves along a wall (two squares) and what's kept on them: jars, bowls, baskets, a lantern. */
export function shelvesAt(x, z, { w, h, wall, rough }) {
    const spot = spotOf(x, z, wall, rough);
    const wide = Math.max(w, h);
    const tall = rough < 0.5;
    const model = tall ? "bookshelf" : "shelf";
    const [mw, mh] = tall ? [1.37, 2.06] : [1, 2.08];
    const count = Math.max(1, Math.floor(wide / (mw + 0.05)));
    const placed = [];
    // (How high its boards are, by its own height: the bookshelf's five, the shelf's four)
    const boards = tall ? [0.07, 0.4, 0.73, 1.06, 1.39] : [0.08, 0.6, 1.12, 1.62];

    for (let k = 0; k < count; k++) {
        const side = (k - (count - 1) / 2) * (mw + 0.05);
        const shelf = standing(spot, model, { fit: [mw, mh, tall ? 0.5 : 0.3], out: 0.5 - (tall ? 0.27 : 0.17), side });

        placed.push(shelf);

        for (const [b, board] of boards.entries()) {
            for (let n = 0; n < 3; n++) {
                if (spot.r(k * 20 + b * 3 + n) < 0.55) {
                    const name = pick(["pot-clay", "pot-brass", "pot", "bowl", "bowl-small", "basket-lidded", "plate", "goblet-a", "candlestick", "lantern", "apple", "onion"], spot.r(k * 20 + b * 3 + n + 9));
                    const [sx, sz] = along({ ...spot, x: shelf.x, z: shelf.z }, 0, (n - 1) * mw * 0.3);

                    placed.push({ model: name, x: sx, z: sz, y: board * (mh / (tall ? 2.06 : 2.08)), size: Math.min(small(name), 0.32), turn: spot.r(k + n) * 6, shadow: false });
                }
            }
        }
    }

    return placed;
}

/** A small table or a nightstand by a bed, a light or a jug on it. */
export function sideTableAt(x, z, { wall, rough }) {
    const spot = spotOf(x, z, wall, rough);
    const low = spot.r(1) < 0.5;
    const table = standing(spot, low ? "table-low" : "stool", { size: low ? 0.92 : 0.5, out: 0.15 });
    const name = pick(["candlestick", "lantern", "pot-clay", "goblet-a", "bowl"], spot.r(2));

    return [table, { model: name, on: table, x: table.x, z: table.z, size: small(name), turn: spot.r(3) * 6, shadow: false }];
}

/** A stand of arms against a wall: a shield leant on it, weapons beside, now and then a helm's stand. */
export function standAt(x, z, { wall, rough }) {
    const spot = spotOf(x, z, wall, rough);

    // (A rack of arms, a shield leant on it)
    if (spot.r(5) < 0.4) {
        return [standing(spot, "weapon-rack", { size: 1.3, out: 0.12 }), leaningBack(spot, "shield-kite", { length: 1, tilt: 0.2, side: 0.55 })];
    }

    return [leaningBack(spot, "shield-kite", { length: 1.1, tilt: 0.16, side: -0.15 }), leaning(spot, pick(WEAPONS, spot.r(1)), { length: 1.15, side: 0.25, tilt: 0.18 }), leaning(spot, pick(WEAPONS, spot.r(2)), { length: 1, side: 0.42, tilt: 0.24 })];
}

/** A workbench along a wall (two squares), its tools on it and a lantern. */
export function workbenchAt(x, z, { w, h, wall, rough }) {
    const spot = spotOf(x, z, wall, rough);
    const long = Math.max(w, h) - 0.2;
    const bench = standing(spot, "table-plank", { fit: [long, 0.85, 0.66], out: 0.15 });
    const placed = [bench];

    for (let k = 0; k < 4; k++) {
        const name = pick(TOOLS, spot.r(k + 2));
        const [tx, tz] = along({ ...spot, x: bench.x, z: bench.z }, (spot.r(k + 6) - 0.5) * 0.3, (k - 1.5) * long * 0.22);

        placed.push({ model: name, x: tx, z: tz, y: 0.85, size: small(name), roll: Math.PI / 2, turn: spot.turn + spot.r(k + 10) * 0.6, shadow: false });
    }

    if (spot.r(1) < 0.6) {
        const [lx, lz] = along({ ...spot, x: bench.x, z: bench.z }, 0.15, long * 0.42);

        placed.push({ model: "lantern", x: lx, z: lz, y: 0.85, size: 0.45, turn: spot.r(12) * 6, shadow: false });
    }

    return placed;
}

/** An offering's vessels by a temple's wall: urns, jars, vases, now and then a lamp among them. */
export function vesselsAt(x, z, { wall, rough }) {
    const spot = spotOf(x, z, wall, rough);
    const placed = CLUTTER_KINDS.vessels(spot);

    if (spot.r(20) < 0.3) {
        placed.push(standing(spot, pick(["candleholder-a", "candleholder-b"], spot.r(21)), { size: 0.5, out: -0.25 }));
    }

    return placed;
}

/**
 * Old bones on the floor (a heap of the level's plan, metres: its middle): a heap of them, a skull
 * on crossed bones, or a skull and the long bones scattered about it.
 */
export function bonesAt(x, z, { rough }) {
    const spot = spotOf(x, z, null, rough);
    const [kind, r] = [spot.r(0), spot.r];

    if (kind < 0.3) {
        return [{ model: "bone-heap", x, z, size: 0.36 + 0.12 * r(1), turn: r(2) * 6 }, skullAt(x + 0.3, z - 0.15, r, 3)];
    }

    if (kind < 0.5) {
        return [{ model: "skull-crossbones", x, z, size: 0.36 + 0.1 * r(1), turn: r(2) * 6 }];
    }

    if (kind < 0.62) {
        return [{ model: "ribcage", x, z, size: 0.36, turn: r(1) * 6, shadow: false }, skullAt(x + 0.32, z + 0.1, r, 3), boneAt(x - 0.3, z - 0.2, r, 9)];
    }

    const scattered = [0, 1, 2, 3].slice(0, 2 + Math.floor(r(1) * 3)).map((k) => {
        const angle = r(k + 10) * Math.PI * 2;

        return boneAt(x + Math.cos(angle) * (0.2 + 0.25 * r(k + 14)), z + Math.sin(angle) * (0.2 + 0.25 * r(k + 18)), r, 22 + k * 2);
    });

    return [skullAt(x, z, r, 3), ...scattered];
}

// A point's placement fields
const xz = ([x, z]) => ({ x, z });

/**
 * The remains of someone who died where they lay (metres: where), stretched out a body's length: a
 * skull at one end, the long bones down from it; and what they carried by them now and then, a
 * sword, a shield, a lantern gone out.
 */
export function remainsAt(x, z, { rough }) {
    const spot = spotOf(x, z, null, rough);
    const r = spot.r;
    // (Which way they lay, and the way across it)
    const [ux, uz] = [Math.cos(rough * 9), Math.sin(rough * 9)];
    const at = (down, across) => [x + ux * down - uz * across, z + uz * down + ux * across];
    const placed = [skullAt(...at(-0.65, 0), r, 1)];

    // (Its ribs and its hips, now and then, lying along it)
    if (r(50) < 0.75) {
        placed.push({ model: "ribcage", ...xz(at(-0.3, 0)), size: 0.36, turn: rough * 9 + Math.PI / 2 + (r(51) - 0.5) * 0.4, shadow: false });
    }

    if (r(52) < 0.6) {
        placed.push({ model: "pelvis", ...xz(at(0.12, 0)), size: 0.28, turn: rough * 9 + Math.PI / 2 + (r(53) - 0.5) * 0.5, roll: r(54) < 0.5 ? 0 : Math.PI / 2, shadow: false });
    }

    // (Arms by the sides, legs below: some of them gone)
    for (const [k, [down, across]] of [[-0.2, -0.22], [-0.15, 0.24], [0.3, -0.1], [0.35, 0.12], [0.75, -0.12], [0.8, 0.1]].entries()) {
        if (r(k + 6) < 0.75) {
            placed.push({ ...boneAt(...at(down, across), r, k * 2 + 12), turn: rough * 9 + (r(k + 30) - 0.5) * 0.8 });
        }
    }

    if (r(2) < 0.35) {
        placed.push({ model: "bone-heap", x: at(0.1, 0)[0], z: at(0.1, 0)[1], size: 0.32, turn: r(3) * 6, shadow: false });
    }

    if (rough > 0.35) {
        placed.push(r(40) < 0.5 ? { model: "estoc", ...xz(at(0.2, 0.45)), size: 1.2, turn: rough * 6, shadow: false } : { model: "sword", ...xz(at(0.2, 0.45)), size: 0.95, turn: rough * 6, roll: Math.PI / 2, shadow: false });
    }

    if (rough > 0.6) {
        placed.push({ model: "shield-kite", ...xz(at(-0.1, -0.55)), size: 0.95, turn: rough * 9, pitch: -1.45, shadow: false });
    }

    if (rough < 0.3) {
        placed.push({ model: "lantern", ...xz(at(-0.45, -0.45)), size: 0.45, roll: Math.PI / 2, turn: rough * 20, shadow: false });
    }

    return placed;
}

/** A chopping block, a stump with a hatchet in it, or one with the anvil's hammer laid on it. */
export function blockAt(x, z, { rough }) {
    const spot = spotOf(x, z, null, rough);
    const stump = { model: spot.r(1) < 0.5 ? "stump" : "stump-2", x, z, size: 0.75, turn: spot.r(2) * 6 };

    return [stump, { model: spot.r(3) < 0.5 ? "hatchet" : "axe-old", on: stump, x: x + 0.05, z, size: 0.5, roll: 0.5, turn: spot.r(4) * 6, shadow: false }];
}

/** Small things along a level's walls to walk over: stones, bark, a branch; by theme, at a square. */
export function strewnAt(x, z, { theme, wall, rough, tint = null }) {
    const spot = spotOf(x, z, wall, rough);
    const kinds = theme === "caves" ? [[STONES, 4], [BARK, 2], [BRANCHES, 1], [ROCKS, 2], [BONES, 1], [MUSHROOMS, 1]] : theme === "hideout" ? [[STONES, 2], [BARK, 2], [BRANCHES, 1]] : [[STONES, 3], [ROCKS, 1], [BONES, 1]];
    const list = pick(kinds, spot.r(1));
    const name = pick(list, spot.r(2));
    const size = list === BRANCHES ? 0.7 : list === ROCKS ? 0.18 + 0.12 * spot.r(3) : list === BONES ? 0.22 + 0.2 * spot.r(3) : list === MUSHROOMS ? 0.12 + 0.1 * spot.r(3) : 0.12 + 0.14 * spot.r(3);
    const [sx, sz] = along(spot, 0.3 * spot.r(4), (spot.r(5) - 0.5) * 0.6);

    return [{ model: name, x: sx, z: sz, size, turn: spot.r(6) * 6, tint: list === STONES || list === ROCKS ? tint : null, shadow: false }];
}
