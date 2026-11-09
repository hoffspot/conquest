// Licensed prop kits: a bought pack's furniture and things, each piece standing in for one of the
// game's own kinds of furnishing (its `role`: a counter, a cupboard, a hanging lantern) in the
// places and among the peoples it suits. A kit's pieces are one licensed file, a node each
// (`dungeon-prop-<kit>` in client/models/assets.json, its `pieces`; world/dungeons3d.js
// DUNGEON_PROPS has each as a model of its own, `<kit>-<piece>`). What's set out where is the
// game's to say (interiors3d.js): it asks for a role in a place (kitPiece) and is given a piece,
// or none, and sets it out fitted to its furnishing's squares; meanwhile, and without the
// licensed models, it draws its own furnishing there (its stand-in), put away once the kit's read.
//
// A new kit is data, here: its catalog model, whose it is, the peoples and places it's for, and
// for each piece its role and the size it's set at (docs/LICENSED_MODELS.md, *Prop kits*;
// .claude/skills/import-prop-kit). Every piece of a role can stand where that role's asked for.
// A kit made for every people is toned to each's own (TONES): the humans' as it's made, the cat
// folk's sun-bleached, the orcs' charred dark, and so on.
//
// Pure: the same choices wherever it's drawn (each from the furnishing's place in its plan).

// The tips of the tavern kit's chandelier's eight candles and its candelabrum's nine (metres from
// the middle of its foot: kit.py's `candles`)
const CHANDELIER = Object.freeze([[-0.5976, 0.5967, 0.0005], [-0.4233, 0.4858, -0.4219], [-0.422, 0.6313, 0.4224], [-0.0011, 0.561, -0.5971], [0.0008, 0.5967, 0.5972], [0.422, 0.5978, -0.4234], [0.423, 0.5967, 0.4217], [0.5972, 0.6402, -0.0006]].map(Object.freeze));
const CANDELABRUM = Object.freeze([[-0.1338, 0.613, -0.0009], [-0.0642, 0.6707, -0.0644], [-0.0642, 0.6708, 0.0629], [-0.0005, 0.6129, -0.1344], [-0.0004, 0.7128, -0.0009], [-0.0003, 0.6135, 0.1323], [0.063, 0.6706, -0.0644], [0.0632, 0.6701, 0.0626], [0.1328, 0.6131, -0.0011]].map(Object.freeze));

/**
 * The kits, by name: each its catalog model (`asset`), whose it is (`by`), the peoples whose
 * buildings it furnishes (`peoples`) and the kinds of inside (`places`: interiors3d.js's builders'
 * styles), whether its pieces are drawn from both sides (`double`: some of a pack's faces turned
 * inwards, made for a two-sided material), and its pieces, by name: each its `role` and its size
 * as it's set out where it isn't fitted to its furnishing (`size`: across, up, deep, metres; the
 * pack's own are near twice life).
 */
export const PROP_KITS = Object.freeze({
    // Dragon Motion's "Medieval Props Kit" (Fab): its tavern furniture, lights and tableware for
    // every people's taprooms and the rooms upstairs. Its pieces are life size, each its length
    // along x; a wall piece's back to the wall (at -z), its front out (+z). `candles`: the tips of
    // a light's candles (metres from the middle of its foot, as `size` has it), where its flames
    // burn; `hang`: how high its foot's hung (metres: a chandelier's, its chain cut at the hub)
    "medieval-tavern": Object.freeze({
        asset: "dungeon-prop-medieval-tavern",
        by: "Dragon Motion",
        peoples: Object.freeze(["human", "elf", "darkElf", "cat", "lizard", "orc"]),
        places: Object.freeze(["taproom", "upstairs"]),
        pieces: Object.freeze({
            table: Object.freeze({ role: "table", size: [3, 0.9, 1] }),
            "table-small": Object.freeze({ role: "side-table", size: [1.2, 0.79, 0.9] }),
            bench: Object.freeze({ role: "bench", size: [2.57, 0.61, 0.49] }),
            settle: Object.freeze({ role: "settle", size: [1.95, 1.49, 0.71] }),
            cask: Object.freeze({ role: "cask", size: [3.62, 2.61, 2.33] }),
            bed: Object.freeze({ role: "bed", size: [2.62, 2.43, 1.94] }),
            "bed-plain": Object.freeze({ role: "bed-plain", size: [2.62, 1.42, 1.32] }),
            chest: Object.freeze({ role: "chest", size: [1, 0.77, 0.67] }),
            "chest-small": Object.freeze({ role: "chest", size: [1.02, 0.4, 0.56] }),
            cabinet: Object.freeze({ role: "counter", size: [1.92, 1.29, 0.9] }),
            chandelier: Object.freeze({ role: "chandelier", size: [1.32, 1.29, 1.32], candles: CHANDELIER }),
            sconce: Object.freeze({ role: "sconce", size: [0.3, 0.55, 0.15], candles: Object.freeze([[-0.1228, 0.5422, 0.0478], [0.1225, 0.5422, 0.0479]]) }),
            candlestick: Object.freeze({ role: "candlestick", size: [0.1, 0.34, 0.1], candles: Object.freeze([[0, 0.34, 0]]) }),
            candelabrum: Object.freeze({ role: "candelabrum", size: [0.3, 0.71, 0.3], candles: CANDELABRUM }),
            mug: Object.freeze({ role: "mug", size: [0.18, 0.2, 0.14] }),
            tankard: Object.freeze({ role: "mug", size: [0.2, 0.19, 0.14] }),
            plate: Object.freeze({ role: "plate", size: [0.32, 0.04, 0.32] }),
            jug: Object.freeze({ role: "jug", size: [0.22, 0.3, 0.28] }),
            bottle: Object.freeze({ role: "bottle", size: [0.2, 0.33, 0.2] }),
            cup: Object.freeze({ role: "cup", size: [0.12, 0.16, 0.12] }),
            picture: Object.freeze({ role: "picture", size: [1.6, 1.2, 0.02] }),
            "picture-wide": Object.freeze({ role: "picture", size: [2.06, 0.84, 0.03] }),
            "picture-tall": Object.freeze({ role: "picture", size: [2.34, 1.58, 0.05] }),
            antlers: Object.freeze({ role: "antlers", size: [1.5, 1.35, 0.53] }),
            skull: Object.freeze({ role: "trophy", size: [0.5, 0.59, 0.2] }),
            shield: Object.freeze({ role: "trophy", size: [0.62, 0.75, 0.11] }),
            "carpet-runner": Object.freeze({ role: "runner", size: [3.44, 0.01, 1.12] }),
            carpet: Object.freeze({ role: "carpet", size: [3.68, 0.02, 2.42] }),
            firewood: Object.freeze({ role: "firewood", size: [0.42, 0.23, 0.5] }),
        }),
    }),
    "wind-ways-shop": Object.freeze({
        asset: "dungeon-prop-wind-ways-shop",
        by: "Wind Ways",
        // (Its pieces made to be seen from both sides: some of their faces turned inwards)
        double: true,
        peoples: Object.freeze(["human"]),
        places: Object.freeze(["shop"]),
        pieces: Object.freeze({
            counter: Object.freeze({ role: "counter", size: [2.55, 1.07, 0.8] }),
            shelves: Object.freeze({ role: "display-shelves", size: [3.2, 1.33, 0.64] }),
            dresser: Object.freeze({ role: "dresser", size: [2, 2.3, 0.6] }),
            cabinet: Object.freeze({ role: "cabinet", size: [0.78, 0.95, 0.76] }),
            "cabinet-tall": Object.freeze({ role: "cabinet-tall", size: [0.72, 1.34, 0.72] }),
            "chest-wide": Object.freeze({ role: "chest-wide", size: [1.4, 1.23, 0.72] }),
            "chest-low": Object.freeze({ role: "chest", size: [0.9, 0.67, 0.48] }),
            table: Object.freeze({ role: "side-table", size: [0.8, 0.72, 0.8] }),
            chair: Object.freeze({ role: "chair", size: [0.48, 1.05, 0.42] }),
            lantern: Object.freeze({ role: "lantern", size: [0.27, 0.65, 0.27] }),
            basket: Object.freeze({ role: "basket", size: [0.4, 0.26, 0.29] }),
            goods: Object.freeze({ role: "goods", size: [0.42, 0.2, 0.9] }),
            tray: Object.freeze({ role: "tray", size: [0.32, 0.19, 0.9] }),
            crate: Object.freeze({ role: "crate", size: [0.42, 0.2, 0.95] }),
            curtain: Object.freeze({ role: "curtain", size: [1.3, 1.7, 0.16] }),
            window: Object.freeze({ role: "window", size: [1, 1.2, 0.04] }),
            rack: Object.freeze({ role: "rack", size: [0.94, 0.87, 0.11] }),
            bracket: Object.freeze({ role: "bracket", size: [0.67, 1.17, 0.07] }),
            newel: Object.freeze({ role: "newel", size: [0.22, 1.2, 0.22] }),
            "sign-post": Object.freeze({ role: "sign-post", size: [1.08, 2.9, 0.11] }),
            door: Object.freeze({ role: "door", size: [1.12, 2.24, 0.21] }),
        }),
    }),
});

/**
 * How each people's insides tone a kit made for them all (world/dungeons3d.js furnish's `tone`):
 * its colour, how far its pieces are drawn towards it (0 to 1: their own shading kept), and how
 * much lighter or darker (`lift`). The humans' as the pack made them; the cat folk's sun-bleached
 * and ochre, the orcs' charred and dark, the lizard folk's pale as bamboo, the elves' silvered
 * heartwood, the dark elves' violet-black.
 */
export const TONES = Object.freeze({
    human: null,
    cat: Object.freeze({ colour: 0xd8a868, amount: 0.45, lift: 1.12 }),
    orc: Object.freeze({ colour: 0x6e5444, amount: 0.5, lift: 0.78 }),
    lizard: Object.freeze({ colour: 0xc8d09a, amount: 0.45, lift: 1.12 }),
    elf: Object.freeze({ colour: 0xe2dccb, amount: 0.55, lift: 1.3 }),
    darkElf: Object.freeze({ colour: 0x5c4a72, amount: 0.55, lift: 0.72 }),
});

/** A kit piece's model's name (world/dungeons3d.js DUNGEON_PROPS'): `<kit>-<piece>`. */
export const pieceName = (kit, piece) => `${kit}-${piece}`;

/** The kits that furnish a people's inside of a kind (`place`: its builder's style), in order. */
export function kitsFor({ people, place }) {
    return Object.entries(PROP_KITS).filter(([, kit]) => kit.peoples.includes(people ?? "human") && kit.places.includes(place));
}

/**
 * The piece that stands for a furnishing of a role in a people's inside (`place`), or null: of
 * the first kit for them with any of that role, one of its pieces of it (as `seed` picks, the
 * same for the same seed): { model (its DUNGEON_PROPS name), kit, piece, role, size, double
 * (drawn from both sides, as its kit's are made to be), tone (its people's, TONES: or null),
 * candles (a light's: where its flames burn, or null) }.
 */
export function kitPiece(role, { people, place, seed = 0 }) {
    for (const [name, kit] of kitsFor({ people, place })) {
        const fitting = Object.entries(kit.pieces).filter(([, piece]) => piece.role === role);

        if (fitting.length) {
            const [piece, { size, candles = null }] = fitting[Math.abs(Math.floor(seed)) % fitting.length];
            const tone = kit.peoples.length > 1 ? (TONES[people ?? "human"] ?? null) : null;

            return { model: pieceName(name, piece), kit: name, piece, role, size, double: kit.double ?? false, tone, candles };
        }
    }

    return null;
}

/**
 * Where a placed kit piece's candles' flames burn (metres, as its placement: x, y, z), its
 * candles' tips (kitPiece's `candles`) sized as it's fitted (`fit`, or its own `size`) and turned
 * as it's turned, its foot `y` high.
 */
export function flamesOf(piece, { x, z, fit = piece.size, turn = 0 }, y) {
    const scale = fit.map((metres, k) => metres / piece.size[k]);
    const [c, s] = [Math.cos(turn), Math.sin(turn)];

    return (piece.candles ?? []).map(([tx, ty, tz]) => {
        const [ax, az] = [tx * scale[0], tz * scale[2]];

        return [x + ax * c + az * s, y + ty * scale[1], z - ax * s + az * c];
    });
}
