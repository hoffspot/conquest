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
//
// Pure: the same choices wherever it's drawn (each from the furnishing's place in its plan).

/**
 * The kits, by name: each its catalog model (`asset`), whose it is (`by`), the peoples whose
 * buildings it furnishes (`peoples`) and the kinds of inside (`places`: interiors3d.js's builders'
 * styles), whether its pieces are drawn from both sides (`double`: some of a pack's faces turned
 * inwards, made for a two-sided material), and its pieces, by name: each its `role` and its size
 * as it's set out where it isn't fitted to its furnishing (`size`: across, up, deep, metres; the
 * pack's own are near twice life).
 */
export const PROP_KITS = Object.freeze({
    "wind-ways-shop": Object.freeze({
        asset: "dungeon-prop-wind-ways-shop",
        by: "Wind Ways",
        // (Its pieces made to be seen from both sides: some of their faces turned inwards)
        double: true,
        peoples: Object.freeze(["human"]),
        places: Object.freeze(["shop", "upstairs"]),
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
 * (drawn from both sides, as its kit's are made to be) }.
 */
export function kitPiece(role, { people, place, seed = 0 }) {
    for (const [name, kit] of kitsFor({ people, place })) {
        const fitting = Object.entries(kit.pieces).filter(([, piece]) => piece.role === role);

        if (fitting.length) {
            const [piece, { size }] = fitting[Math.abs(Math.floor(seed)) % fitting.length];

            return { model: pieceName(name, piece), kit: name, piece, role, size, double: kit.double ?? false };
        }
    }

    return null;
}
