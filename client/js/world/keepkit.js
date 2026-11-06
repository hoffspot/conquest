// Bellhaven's keep drawn with its castle's own pieces (core/dungeons/themes.js keep; docs/DUNGEONS.md,
// *Bellhaven's keep*): a kit of DmitriyDryzhak's White Castle's parts, the licensed model
// `dungeon-prop-bellhaven-keep` (client/models/assets.json: a piece a node), set about each of its
// floors as its plan has them. Along every run of wall by open floor, a cornice under the vault and
// pilasters between, and in the longer walls tracery windows between the pilasters; the castle's
// Gothic column wherever a pillar stands; its bell hung over the bell chamber's altar. Its walls
// and floor drawn with its castle's wall and floor (the kit's `wall` and `floor` pieces' pictures:
// world/dungeons3d.js setKitPicture). Without the licensed models, none of it: the pale stone it's
// drawn in meanwhile (interiors3d.js DUNGEON_LOOKS.keep), its own pillars.
//
// Pure: the placements (dungeons3d.js furnish's) from the level's map alone, the same wherever
// it's drawn.

import { airy } from "../core/dungeons/air.js";

/** The kit's model in the catalog, and each of its pieces' names as dungeons3d.js DUNGEON_PROPS has them. */
export const KEEP_KIT = Object.freeze({
    asset: "dungeon-prop-bellhaven-keep",
    column: "bellhaven-keep-column",
    pilaster: "bellhaven-keep-pilaster",
    cornice: "bellhaven-keep-cornice",
    window: "bellhaven-keep-window",
    bell: "bellhaven-keep-bell",
    wall: "bellhaven-keep-wall",
    floor: "bellhaven-keep-floor",
});

/**
 * The castle's wall and floor as pictures the keep's rock is drawn with (world/dungeons3d.js
 * setKitPicture): each its name, how many metres one of it covers (as its planes in the pack do),
 * and its average colour (linear light, measured from the pack's own textures).
 */
export const KIT_PICTURES = Object.freeze({
    wall: Object.freeze({ name: "keep-wall", metres: 5, mean: [0.4591, 0.4422, 0.4262] }),
    floor: Object.freeze({ name: "keep-floor", metres: 5, mean: [0.055, 0.0515, 0.0486] }),
});

/**
 * How the kit's set out (metres): the cornice `cornice` high (under the vault), `deep` out from
 * the wall, a piece of it no longer than `stretch`; a pilaster every `every` along a wall at most,
 * none within `corner` of a run's end or `torch` of a torch's wall; a window in every other bay
 * between them in a run at least `windows` long, `window` wide and as high as `high` of the wall
 * under the cornice; a column the hall's height less `under`, `wide` across; the bell `bell` tall,
 * its foot `hang` under the vault. Its stone (all but the bell) drawn a little cooler than the pack
 * has it (`tint`), as white as the castle's outside under the torches' warm light. What lies flat
 * on the wall (its cornice, pilasters and windows, a hand or less proud of it) casts no shadow:
 * none to be seen from it, and a draw of its own into each of a torch's six shadows.
 */
export const KIT = Object.freeze({ cornice: 1.2, deep: 0.5, stretch: 4, every: 4, corner: 1, torch: 0.9, windows: 9, window: 1.2, high: 0.72, under: 0, wide: 0.9, bell: 2.8, hang: 3.4, tint: 0xc4cde0 });

// The four ways a wall can face into a room: the step from the open square to the rock beside it,
// and which way something set against it faces (radians, as furnish turns it: 0 is +z, south)
const SIDES = Object.freeze([
    { dx: 0, dy: -1, turn: 0 },
    { dx: 0, dy: 1, turn: Math.PI },
    { dx: -1, dy: 0, turn: Math.PI / 2 },
    { dx: 1, dy: 0, turn: -Math.PI / 2 },
]);

// Whether a square of a level's plan is its rock (or off its edge); and its floor, not its rock nor
// the open air round it nor a balcony's parapet (core/dungeons/air.js)
const rockAt = (map, x, y) => x < 0 || y < 0 || x >= map.width || y >= map.height || map.plan[y][x] === "#";
const floorAt = (map, x, y) => !rockAt(map, x, y) && !airy(map.plan[y][x]);

/**
 * Every straight run of a level's wall by its floor (its rock's face, a square's edge each; not its
 * outer faces, to the open air):
 * [{ side (SIDES'), from, to (along it: x for a north or south wall, y for an east or west one,
 * squares, `to` exclusive), at (across: the face's line, metres) }].
 */
export function wallRuns(map) {
    const runs = [];

    for (const side of SIDES) {
        const along = side.dx === 0;
        const [length, lines] = along ? [map.width, map.height] : [map.height, map.width];

        for (let line = 0; line < lines; line++) {
            let from = null;

            for (let k = 0; k <= length; k++) {
                const [x, y] = along ? [k, line] : [line, k];
                const face = k < length && floorAt(map, x, y) && rockAt(map, x + side.dx, y + side.dy);

                if (face && from === null) {
                    from = k;
                } else if (!face && from !== null) {
                    // (The face's line: the open square's edge towards the rock)
                    const at = along ? line + (side.dy < 0 ? 0 : 1) : line + (side.dx < 0 ? 0 : 1);

                    runs.push({ side, from, to: k, at });
                    from = null;
                }
            }
        }
    }

    return runs;
}

// Where along a run a thing `out` metres from its face stands: (x, z), metres
function onRun({ side, at }, along, out) {
    return side.dx === 0 ? [along, at - side.dy * out] : [at - side.dx * out, along];
}

/**
 * The kit's placements for a level of Bellhaven's keep (its map: plan, pieces, dungeon's lights
 * and rooms; `tall`, its halls' height, metres): what dungeons3d.js furnish sets out (each `fit`
 * in its piece's own metres, across, up and out from the wall, before it's turned), each cut away
 * with the rock while the camera's over the roof (`cut`; a column "solid" there, its insides drawn as
 * cut stone: dungeons3d.js propMaterial).
 */
export function kitPlacements(map, { tall }) {
    const placements = [];
    const torches = (map.dungeon?.lights ?? []).filter(({ kind }) => kind === "torch").map(({ at: [x, y] }) => [x + 0.5, y + 0.5]);
    const nearTorch = (x, z) => torches.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < KIT.torch + 0.5);
    const under = tall - KIT.cornice;

    for (const run of wallRuns(map)) {
        const length = run.to - run.from;
        const { turn } = run.side;

        // (Its cornice, in as few pieces as no piece is longer than `stretch`)
        const pieces = Math.ceil(length / KIT.stretch);

        for (let k = 0; k < pieces; k++) {
            const [x, z] = onRun(run, run.from + ((k + 0.5) * length) / pieces, KIT.deep / 2);

            placements.push({ model: KEEP_KIT.cornice, x, z, y: under, turn, fit: [length / pieces, KIT.cornice, KIT.deep], tint: KIT.tint, cut: true, shadow: false });
        }

        // (Its pilasters, evenly between its ends, and its windows in every other bay between them)
        const inner = length - 2 * KIT.corner;

        if (inner < 1) {
            continue;
        }

        const bays = Math.max(1, Math.round(inner / KIT.every));
        const marks = Array.from({ length: bays + 1 }, (_, k) => run.from + KIT.corner + (k * inner) / bays);

        for (const along of marks) {
            const [x, z] = onRun(run, along, 0.1);

            if (!nearTorch(x, z)) {
                placements.push({ model: KEEP_KIT.pilaster, x, z, turn, fit: [0.5, under, 0.2], tint: KIT.tint, cut: true, shadow: false });
            }
        }

        if (length >= KIT.windows) {
            for (let k = 0; k < bays; k += 2) {
                const middle = (marks[k] + marks[k + 1]) / 2;
                const [x, z] = onRun(run, middle, 0.07);
                const high = under * KIT.high;

                if (!nearTorch(x, z)) {
                    placements.push({ model: KEEP_KIT.window, x, z, y: (under - high) / 2, turn, fit: [KIT.window, high, 0.14], tint: KIT.tint, cut: true, shadow: false });
                }
            }
        }
    }

    // (The castle's Gothic column in each pillar's place)
    for (const piece of map.pieces.filter(({ kind }) => kind === "pillar")) {
        placements.push({ model: KEEP_KIT.column, x: piece.x + piece.w / 2, z: piece.y + piece.h / 2, turn: 0, fit: [KIT.wide, tall - KIT.under, KIT.wide], tint: KIT.tint, cut: "solid" });
    }

    // (The bell, over the bell chamber's altar: its realm's last room)
    const chamber = (map.dungeon?.rooms ?? []).find(({ look }) => look === "bellChamber");
    const altar = chamber && map.pieces.find(({ kind, x, y }) => kind === "altar" && x >= chamber.x && y >= chamber.y && x < chamber.x + chamber.w && y < chamber.y + chamber.h);

    if (altar) {
        placements.push({ model: KEEP_KIT.bell, x: altar.x + altar.w / 2, z: altar.y + altar.h / 2, y: tall - KIT.hang, size: KIT.bell, turn: 0, cut: true });
    }

    return placements;
}
