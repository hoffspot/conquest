// The humans' town houses built of a bought kit: Meshsmith Foundry's half-timbered building kit
// (bought on Fab: the licensed model `scenery-meshsmith-houses`, each piece a node of it;
// docs/LICENSED_MODELS.md, *The house kit*). A house planned as ever (house.js planHouse: its
// storeys, jetties, openings, roof, colours) is built of the kit's own pieces set on its own grid,
// as its maker meant them to fit: frames, the plaster between, the braces, windows and doors, the
// corner posts, the plinth, the gables in their rows, a finial and ridge tiles; its roof's slopes
// laid with its tiles (a repeat of them baked flat from its roof pieces, so a slope of any size has
// no seams), each on the line its gables' rafters rise along.
//
// Every fit is measured from the kit's pieces (.claude/skills/import-scene-model/scripts:
// housekit.py lays them out for the pipeline; the pieces' sizes, their openings, and their
// gables' and roofs' lines measured beside it), not guessed:
//
// - a wall piece's pivot is the wall's inner face at its foot: its frame stands 0.33 m out from it
//   (its sill and top plate; its posts and the braces 0.18), the plaster 0.14 behind that;
// - a storey's frame is 2.7 m, sill and top plate 0.2 m each: the plaster and braces stand 0.2 m up
//   it, so they meet the sill; its posts stop 2.3 m up, the band to its plate a beam's (the joists'
//   ends: the kit's beams, 0.2 m, laid in it);
// - a gable rises at 1.2 m a metre (50 degrees), its rafter's top on the line 0.518 m over the
//   walls' top at the eaves' wall, in rows: the first 2.7 m, each after 2.4 m, closing at a peak
//   piece or where two halves meet (and there a filler of 0.2 m);
// - the roof's tiles lie on that line, their undersides on it, 0.313 m thick; the eaves' course
//   kicks out flatter (0.989 a metre) 0.62 m past the wall; the verges reach 0.55 m past the gables;
// - its tiles' rows are 0.2232 m up the slope, seven to every metre of the slope's run, staggered,
//   eight tiles to every 2 m: a repeat is 2 m by ten rows.
//
// Pure: the same house from the same plan wherever it's built. Metres, the lot's own frame: x
// east from its west edge, y up from its ground, z south from its back (its front at +z).

import { createRandom } from "../../../core/random.js";

/** The kit's model in the catalog, whose it is, and where its houses stand. */
export const HOUSE_KIT = Object.freeze({
    asset: "scenery-meshsmith-houses",
    by: "Meshsmith Foundry",
    peoples: Object.freeze(["human"]),
    settlements: Object.freeze(["town", "city", "capital"]),
    // (A cottage of a town's a small timber house of it, tiled: a town's roofs are tiles, not
    // thatch, as a fire's not to run from roof to roof; the stone houses are the game's own)
    styles: Object.freeze(["timber", "brick", "cottage"]),
    // (How big a square each piece has to itself in the kit's file, metres: housekit.py's `--cells`)
    cell: 3,
});

/** The kit's measures (metres). */
export const KIT = Object.freeze({
    storey: 2.7,
    upper: 2.4,
    sill: 0.2,
    out: 0.33,
    plinth: 0.2,
    pitch: 1.2,
    line: 0.518,
    tiles: 0.313,
    lip: 0.14,
    kick: Object.freeze({ pitch: 0.989, top: 0.569, under: 0.07, underPitch: 0.374, reach: 0.62 }),
    verge: 0.55,
    repeat: Object.freeze([2, 2.2315]),
    phase: 0.2,
    filler: 0.2,
    band: 2.3,
    // (A dormer's knee: the kit's 1 m frames of a gable's lowest row, 1.5 m, their face 0.19 m out)
    knee: Object.freeze({ height: 1.5, depth: 0.19 }),
});

// The wall's slope's length for a metre of its run
const SLOPE = Math.hypot(1, KIT.pitch);

// How far in from the walls' inner faces, and down from the roof's underside, a house's dark inside
// is (metres: kitHouse's `shell`)
const SHELL = 0.03;

// The ridge's cap (metres): how far down each slope it reaches (in from the ridge), how far up off
// the tiles its sides stand there, how far over the tiles' meeting it rises, and how much of a
// tile's width (of the tiles' repeat) it shows across each side
const RIDGE = Object.freeze({ width: 0.16, lift: 0.015, rise: 0.1, across: 0.06 });

// A dormer's cheeks: how far out from its knee's ends they're hung, and how far down into the
// main roof they reach (metres)
const CHEEK = 0.01;
const CHEEK_SUNK = 0.02;

// A wing behind the house: its spans, how deep it is inside (at least its side walls' inner
// corner and a module more; at most), how far in from the house's ends its walls stand at least,
// and where a range's eaves stop against the main gable's face (metres)
const WING = Object.freeze({ spans: Object.freeze([4, 5, 6]), depth: 2.2, deepest: 6, margin: 1.2, face: 0.22 });

// How often a street house is built with a wing behind, room allowing
const WINGED = 0.6;

/** The spans (metres across, between the eaves' walls) its gables are built for. */
export const SPANS = Object.freeze([4, 5, 6, 8, 10]);

// Each fill's openings (Stone's and Brick's alike): [x0, x1, y0, y1] in the piece's own metres
export const HOLES = Object.freeze({
    "2m_RoofL_Window_1x2": [[0.442, 0.757, 1.175, 1.62]],
    "2m_RoofR_Window_1x2": [[-0.757, -0.442, 1.175, 1.62]],
    "2m_RoofPeak_Window_1x2": [[-0.157, 0.157, 0.375, 0.82]],
    "2m_Window_1x3": [[-0.157, 0.157, 1.115, 1.72]],
    "2m_Window_2x2": [[-0.25, 0.25, 1.275, 1.72]],
    "2m_Window_2x3": [[-0.25, 0.25, 1.115, 1.72]],
    "2m_Window_2x4": [[-0.25, 0.25, 1.115, 1.88]],
    "2m_Window_1x3_Double": [[-0.657, -0.343, 1.115, 1.72], [0.343, 0.657, 1.115, 1.72]],
    "2m_Window_2x3_Double": [[-0.75, -0.25, 1.115, 1.72], [0.25, 0.75, 1.115, 1.72]],
    "2m_Window_2x4_Double": [[-0.75, -0.25, 1.115, 1.88], [0.25, 0.75, 1.115, 1.88]],
    "2m_Window_2x3_Triple": [[-0.85, -0.35, 1.115, 1.72], [-0.25, 0.25, 1.115, 1.72], [0.35, 0.85, 1.115, 1.72]],
    "1m_Window_1x3": [[-0.157, 0.157, 1.115, 1.72]],
    "1m_Window_2x3": [[-0.25, 0.25, 1.115, 1.72]],
    "1m_Window_2x4": [[-0.25, 0.25, 1.115, 1.88]],
    "1m_RoofPeak_Window_1x1": [[-0.157, 0.157, 0.025, 0.31]],
    "1m_Half_Window_1x2": [[-0.157, 0.157, 0.475, 0.92]],
    "1m_Half_Window_2x2": [[-0.25, 0.25, 0.475, 0.92]],
    "2m_DoorCenter": [[-0.525, 0.525, 0, 1.864]],
    "2m_DoorLeft": [[-0.9, 0.121, 0, 1.868]],
    "2m_DoorRight": [[-0.121, 0.9, 0, 1.868]],
    "2m_DoorLeft_Window_1x3": [[-0.9, 0.121, 0, 1.868], [0.442, 0.757, 1.115, 1.72]],
    "2m_DoorRight_Window_1x3": [[-0.121, 0.9, 0, 1.868], [-0.757, -0.442, 1.115, 1.72]],
});

// The windows' own extents: [x0, x1, y0, y1]
export const WINDOWS = Object.freeze({
    "1x1": [-0.197, 0.197, 0, 0.33],
    "1x2": [-0.197, 0.197, 0.05, 0.54],
    "1x3": [-0.197, 0.197, -0.01, 0.64],
    "2x2": [-0.29, 0.29, 0.05, 0.54],
    "2x3": [-0.29, 0.29, -0.01, 0.64],
    "2x4": [-0.29, 0.29, -0.01, 0.8],
});

// A door hangs on its left: [x0, x1]; its frame round it
const DOOR = Object.freeze({ x0: -0.01, x1: 0.97 });
const DOORS = Object.freeze(["Door_01", "Door_02", "Door_03", "Door_05"]);

// The braces' figures (house.js plan.figure's), a pattern for the ends of a run of wall, one for
// between, and the 1 m modules'; the gables' figures; finials
const FIGURES = Object.freeze({
    braced: { ends: ["A", "V", "DiagonalLeftRight"], between: ["X", "Plus", "A"], one: ["XT", "Plus"] },
    square: { ends: ["Plus", "H"], between: ["H", "TTPlus", "Plus"], one: ["Plus", "T"] },
    close: { ends: ["W", "WPlus2", "M"], between: ["MPlus", "M", "OSPlus"], one: ["XT", "V"] },
});
const GABLES = Object.freeze(["TX", "TXX", "DiagonalLeft", "T", "SLeft", "Box"]);
const FINIALS = Object.freeze(["Roof_Peak_Ornament_01", "Roof_Peak_Ornament_03", "Roof_Peak_Ornament_05", "Roof_Peak_Ornament_06"]);

/** What each of the plan's roofs is laid with: the kit's tiles and a tint. */
export const ROOFS = Object.freeze({
    clay: { tiles: "Red", tint: [1, 1, 1] },
    "clay-orange": { tiles: "Red", tint: [1.12, 1.02, 0.86] },
    slate: { tiles: "Slate", tint: [1, 1, 1] },
    "slate-grey": { tiles: "Slate", tint: [1.18, 1.18, 1.2] },
    shingles: { tiles: "Slate", tint: [1.25, 1.08, 0.9] },
    thatch: { tiles: "Red", tint: [1.08, 0.96, 0.84] },
    "thatch-grey": { tiles: "Slate", tint: [1.1, 1.06, 1] },
});

const EPSILON = 1e-6;
const P = 5;

// The largest span its gables can be built across in `room` metres
export const spanFor = (room) => SPANS.filter((span) => span <= room + EPSILON).at(-1) ?? SPANS[0];

// A length on the kit's finest grid (0.2 m) no more than `room`
const onGrid = (room) => Math.floor((room + EPSILON) / KIT.filler) * KIT.filler;

/**
 * A run of wall `length` metres long laid out in the kit's modules: 2 m ones, a 1 m one in the
 * middle if it's left, and 0.2 m fillers at its ends (`fillers`: "both" ends, or "end" alone, where
 * a jetty's made it longer): [{ at, width }], `at` from its start.
 */
export function runOf(length, { fillers = "both" } = {}) {
    const twos = Math.floor((length + EPSILON) / 2);
    let rest = length - twos * 2;
    const one = rest >= 1 - EPSILON;

    rest -= one ? 1 : 0;

    const small = Math.round(rest / KIT.filler);
    const widths = Array(twos).fill(2);

    if (one) {
        widths.splice(Math.floor(twos / 2), 0, 1);
    }

    const before = fillers === "end" ? 0 : Math.floor(small / 2);
    const all = [...Array(before).fill(KIT.filler), ...widths, ...Array(small - before).fill(KIT.filler)];
    let at = 0;

    return all.map((width) => {
        const module = { at, width };

        at += width;

        return module;
    });
}

// A wall of a storey: its start's corner, the way it runs, the way it faces out, and the kit's turn
// (quarter turns about y: a piece faces +z unturned)
function sideOf(box, side) {
    const [x0, x1, z0, z1] = box;

    return {
        front: { origin: [x0, z1], across: [1, 0], out: [0, 1], turn: 0, length: x1 - x0 },
        back: { origin: [x1, z0], across: [-1, 0], out: [0, -1], turn: 2, length: x1 - x0 },
        left: { origin: [x0, z0], across: [0, 1], out: [-1, 0], turn: 3, length: z1 - z0 },
        right: { origin: [x1, z1], across: [0, -1], out: [1, 0], turn: 1, length: z1 - z0 },
    }[side];
}

const along = (wall, u) => [wall.origin[0] + wall.across[0] * u, wall.origin[1] + wall.across[1] * u];

/**
 * A planned house (house.js planHouse's) built of the kit: { pieces: [{ piece, at: [x, y, z],
 * turn, scale?, look }], slopes: [{ points, uvs, out?, under? }] (the roof's tiled faces, facing up
 * or `out`; `under` a main slope, whose underside's in `shell`), trims: [{ points, look }] (its
 * soffits and edges, drawn in the game's own timber), shell: [{ points, out }] (its inside, dark,
 * each face facing `out`), extras ({ chimney, awnings }),
 * box (the walls' outer faces at the top storey), height, look ({ fill, frame, plaster, roof,
 * tint, glazing }) }.
 */
export function kitHouse(plan) {
    const random = createRandom((plan.seed ^ 0x5eed) >>> 0);
    const pieces = [];
    const slopes = [];
    const trims = [];
    const extras = { awnings: [], chimney: null };
    let fillLook = "fill";
    const put = (name, [x, z], y, turn, look, more = {}) => pieces.push({ piece: name, at: [x, y, z], turn: ((turn % 4) + 4) % 4, look: look === "fill" ? fillLook : look, ...more });

    const fill = plan.style === "brick" ? "Brick" : "Stone";
    const figures = FIGURES[plan.figure] ?? FIGURES.braced;
    // (A shop's own, the same in every town: kitshop.js; a house's as its seed falls)
    const own = plan.braces ?? {};
    const ends = own.ends ?? random.pick(figures.ends);
    const between = own.between ?? random.pick(figures.between);
    const one = own.one ?? random.pick(figures.one);
    const gableFigure = own.gable ?? random.pick(GABLES);
    const door = own.door ?? random.pick(DOORS);
    const ground = own.ground ?? random.pick(["2x3", "2x4", "2x3"]);
    const upper = own.upper ?? random.pick(["2x3", "2x2", "1x3", "2x3"]);
    const doubled = own.doubled ?? (plan.wealth > 0.6 && random.chance(0.7));
    const sills = own.sills ?? random.chance(0.6);
    const finial = "finial" in plan ? plan.finial : plan.wealth > 0.45 ? random.pick(FINIALS) : null;
    const roof = ROOFS[plan.roof] ?? ROOFS.clay;

    // Its storeys: the planned top storey's box, its walls' outer faces kept inside it, on the
    // kit's grid; the ridge along its longer way, its gables (or hips) across the shorter, a span
    // the gables are built for; the lower storeys' fronts stepped back by the jetty
    const levels = plan.levels.map(({ box }) => box.map((v) => v / P));
    const [bx0, bx1, bz0, bz1] = levels.at(-1);
    const n = levels.length;
    const ridge = plan.ridge;
    const roomX = bx1 - bx0 - 2 * KIT.out;
    const roomZ = bz1 - bz0 - 2 * KIT.out;
    // (Its shape drawn from its own stream, so the rest of it's the same: a wing, where, dormers)
    const shape = createRandom((plan.seed ^ 0x7a11) >>> 0);
    const winged = !plan.back && plan.wing !== false && shape.chance(WINGED);
    let span = spanFor(ridge === "x" ? roomZ : roomX);
    let long = Math.max(span, onGrid(ridge === "x" ? roomX : roomZ));
    let wing = null;

    // A wing behind a house across the street, its ridge across the house's and no higher, its
    // roof meeting the house's back slope in valleys: the house no deeper than 6 m, the wing in
    // the room left behind it, set in from the house's ends (in its middle, or nearer one end)
    if (winged && ridge === "x") {
        const main = [6, 5].find((one) => one <= span && roomZ - one >= WING.depth - EPSILON);
        const spans = WING.spans.filter((one) => one <= (main ?? 0) && one <= long - 2 * WING.margin + EPSILON);

        if (main && spans.length) {
            const wide = shape.pick(spans);
            const room = long - wide;
            const at = plan.kind === "hip" ? room / 2 : shape.pick([room / 2, WING.margin, room - WING.margin]);

            wing = { join: "valley", span: wide, depth: Math.min(WING.deepest, onGrid(roomZ - main)), at: Math.max(WING.margin, Math.min(room - WING.margin, onGrid(at + EPSILON))) };
            span = main;
        }
    }

    const kind = plan.kind === "half-hip" && span < 6 ? "gable" : plan.kind;

    // ...and behind a gable-fronted house, a range a metre in from its eaves' walls either side,
    // its own gable behind, its roof stopped against the house's back gable
    if (winged && ridge === "z" && kind === "gable" && SPANS.includes(span - 2) && span - 2 >= 4) {
        const front = onGrid(Math.max(span, 5, long * shape.range(0.55, 0.7)));
        const deep = Math.min(WING.deepest, onGrid(long - front));

        if (deep >= WING.depth - EPSILON) {
            wing = { join: "wall", span: span - 2, depth: deep, at: 1 };
            long = front;
        }
    }

    const [width, depth] = ridge === "x" ? [long, span] : [span, long];
    const gx0 = (bx0 + bx1) / 2 - width / 2;
    const gz1 = bz1 - KIT.out;
    const gz0 = gz1 - depth;
    const jetty = plan.jetty > 0 && n > 1 ? Math.min(0.6, Math.max(KIT.filler, Math.round(plan.jetty / P / KIT.filler) * KIT.filler)) : 0;
    const boxes = Array.from({ length: n }, (_, s) => [gx0, gx0 + width, gz0, gz1 - jetty * (n - 1 - s)]);
    const top = KIT.plinth + n * KIT.storey;
    // (The wing's walls' inner faces, behind the house's back wall, every storey the same)
    const wingBox = wing ? [gx0 + wing.at, gx0 + wing.at + wing.span, gz0 - wing.depth, gz0] : null;
    const gableSides = kind === "hip" ? [] : ridge === "x" ? ["left", "right"] : ["front", "back"];

    // The plan's openings in the lot's frame, each by where its middle is
    const openingsOf = (side, s) => {
        const face = sideOf(levels[s], side);

        return (plan.openings[side]?.[s] ?? []).map((opening) => ({ ...opening, middle: along(face, (opening.u0 + opening.u1) / 2 / P) }));
    };

    // Which opening, if any, falls in each module of a wall: a door first, then a shop, then a window
    function kindsOf(wall, run, side, s) {
        const openings = openingsOf(side, s);
        // (How far along the kit's wall a point is: the plan's wall and the kit's stand apart)
        const alongOf = ([x, z]) => (x - wall.origin[0]) * wall.across[0] + (z - wall.origin[1]) * wall.across[1];
        const inside = (module, point) => {
            const u = alongOf(point);

            return u >= module.at - EPSILON && u <= module.at + module.width + EPSILON;
        };
        const kinds = run.map(() => "wall");
        const nearestTwo = (k) => run.map((module, j) => ({ module, j })).filter(({ module }) => module.width === 2).sort((a, b) => Math.abs(a.j - k) - Math.abs(b.j - k))[0]?.j;

        for (const rank of ["door", "shop", "window"]) {
            for (const opening of openings.filter(({ kind }) => kind === rank || (rank === "window" && kind === "hatch"))) {
                let k = run.findIndex((module) => inside(module, opening.middle));

                if (k < 0) {
                    continue;
                }

                if (rank !== "window" && run[k].width !== 2) {
                    k = nearestTwo(k) ?? -1;
                }

                if (k >= 0 && kinds[k] === "wall" && run[k].width >= 1) {
                    kinds[k] = rank;
                }
            }
        }

        return kinds;
    }

    // One module of wall: its frame, plaster and braces, and what's set in it
    function module(wall, { at, width }, y, kind, { storey, first, last, plain }) {
        const centre = along(wall, at + width / 2);
        const sideways = (dx) => along(wall, at + width / 2 + dx);
        const t = wall.turn;
        const lift = y + KIT.sill;
        const windows = (fillName, size, holes) => {
            for (const [hx0, hx1, hy0, hy1] of holes) {
                const [wx0, wx1, wy0, wy1] = WINDOWS[size];

                put(`Window_Opaque_${size}`, sideways((hx0 + hx1) / 2 - (wx0 + wx1) / 2), lift + (hy0 + hy1) / 2 - (wy0 + wy1) / 2, t, "window");
            }
        };

        // (The beams' course: every frame's posts stop 2.3 m up and its plate starts at 2.5, the
        // band between left for the joists' ends, a beam the length of its module)
        put(width < 1 ? "WallFrame_Beams_01_Single" : `WallFrame_Beams_01_${width}m`, centre, y + KIT.band, t, "frame");

        if (width < 1) {
            put("WallFrame_02m", centre, y, t, "frame");
            put(`WallFill_${fill}_20cm`, centre, lift, t, "fill");

            return;
        }

        if (width === 1) {
            put("WallFrame_1m", centre, y, t, "frame");

            if (kind === "window") {
                const size = storey === 0 ? ground : upper === "2x2" ? "2x3" : upper;
                const name = `1m_Window_${size}`;

                put(`WallFill_${fill}_${name}`, centre, lift, t, "fill");
                windows(name, size, HOLES[name]);
            } else {
                put(`WallFill_${fill}_1m`, centre, lift, t, "fill");

                if (!plain) {
                    put(`WallPattern_1m_${first ? "DiagonalLeft" : last ? "DiagonalRight" : one}`, centre, lift, t, "pattern");
                }
            }

            return;
        }

        if (kind === "door") {
            // (A shop's in the middle of its module, the middle of its front: on its entrance)
            const where = plan.front ? "Center" : random.pick(["Center", "Center", "Left", "Right"]);
            const lit = where !== "Center" && random.chance(0.5);
            const name = `2m_Door${where}${lit ? "_Window_1x3" : ""}`;
            const [hx0, hx1] = HOLES[name][0];
            const middle = (hx0 + hx1) / 2;

            put(`WallFrame_2m_Door${where}`, centre, y, t, "frame");
            put(`WallFill_${fill}_${name}`, centre, lift, t, "fill");

            if (!plain) {
                put(`WallPattern_2m_Door${where}`, centre, lift, t, "pattern");
            }

            put(door, sideways(middle - (DOOR.x0 + DOOR.x1) / 2), y, t, "door");
            put("DoorFrame", sideways(middle), y, t, "door");

            if (lit) {
                windows(name, "1x3", HOLES[name].slice(1));
            }

            return;
        }

        put("WallFrame_2m", centre, y, t, "frame");

        if (kind === "window" || kind === "shop") {
            const size = kind === "shop" ? "2x3" : storey === 0 ? ground : upper;
            const name = kind === "shop" ? "2m_Window_2x3_Triple" : `2m_Window_${size}${doubled && (size === "2x3" || size === "2x4" || size === "1x3") ? "_Double" : ""}`;

            put(`WallFill_${fill}_${name}`, centre, lift, t, "fill");
            windows(name, size, HOLES[name]);

            if (sills || kind === "shop") {
                put("WallPattern_2m_WindowHorizontal", centre, lift, t, "pattern");
            }

            if (kind === "shop") {
                extras.awnings.push({ at: centre, out: wall.out, across: wall.across, width: 2, y: lift + HOLES[name][0][3] + 0.1, ...(plan.awning ? { look: plan.awning } : {}) });
            }

            return;
        }

        put(`WallFill_${fill}_2m`, centre, lift, t, "fill");

        // (Behind a shop's name board, plain: kitshop.js)
        if (!plain && kind !== "board") {
            put(`WallPattern_2m_${first || last ? ends : between}`, centre, lift, t, "pattern");
        }
    }

    // The runs of wall round a storey: the house's four sides, and with a wing, its back either side
    // of the wing and the wing's own three; where a run meets the other at an inner corner, its
    // last metre's the kit's corner piece's (a metre of wall either way from the corner, its post
    // at the corner)
    const runsOf = (box) => {
        const runs = ["front", "back", "left", "right"].map((side) => ({ wall: sideOf(box, side), side, main: true }));

        if (!wingBox) {
            return runs;
        }

        const [x0, x1, z0] = box;
        const [wx0, wx1] = wingBox;
        const back = runs[1].wall;

        runs.splice(1, 1, { wall: { ...back, length: x1 - wx1 }, side: "back", last: true }, { wall: { ...back, origin: [wx0, z0], length: wx0 - x0 }, side: "back", first: true });
        runs.push({ wall: sideOf(wingBox, "back"), side: "back" }, { wall: sideOf(wingBox, "left"), side: "left", last: true }, { wall: sideOf(wingBox, "right"), side: "right", first: true });

        return runs;
    };
    // (The corners: the house's own and the wing's outer ones, each its post with its turn; the
    // inner ones where the wing meets the house)
    const cornersOf = (box) => {
        const [x0, x1, z0, z1] = box;
        const outer = [[x1, z1, 0], [x1, z0, 1], [x0, z0, 2], [x0, z1, 3]];

        if (!wingBox) {
            return { outer, inner: [] };
        }

        const [wx0, wx1, wz0] = wingBox;

        return { outer: [...outer, [wx1, wz0, 1], [wx0, wz0, 2]], inner: [[wx1, z0, 1], [wx0, z0, 2]] };
    };
    const legs = ({ first, last }) => [first ? 1 : 0, last ? 1 : 0];

    // The storeys' walls, posts at their corners, and the plinth under the ground floor's
    for (const [s, box] of boxes.entries()) {
        const y = KIT.plinth + s * KIT.storey;
        const plain = s === 0 && Boolean(plan.stoneGround);

        fillLook = plain ? "stone" : "fill";

        for (const run of runsOf(box)) {
            const { wall, side } = run;
            const [start, end] = legs(run);
            const length = wall.length - start - end;
            const stepped = jetty > 0 && run.main && (side === "left" || side === "right") && s < n - 1;

            // (The right-hand wall runs from the front: its fillers, where a jetty's made it, at its start)
            // (A shop's front as kitshop.js lays it, its door in the middle)
            const shopFront = Boolean(plan.front) && run.main && side === "front";
            const laid = shopFront ? plan.front.runs[s] : (stepped && side === "right" ? runOf(length, { fillers: "end" }).map((m) => ({ ...m, at: length - m.at - m.width })).reverse() : runOf(length, { fillers: stepped ? "end" : "both" })).map((m) => ({ ...m, at: m.at + start }));
            const kinds = shopFront ? plan.front.kinds[s] : kindsOf(wall, laid, side, s);
            const big = laid.filter(({ width }) => width >= 1);

            laid.forEach((m, k) => module(wall, m, y, kinds[k], { storey: s, first: m === big[0], last: m === big.at(-1), plain }));

            // (An inner corner's metre of this wall: its plaster, the corner piece its timbers)
            for (const u of [...(start ? [0.5] : []), ...(end ? [wall.length - 0.5] : [])]) {
                put(`WallFill_${fill}_1m`, along(wall, u), y + KIT.sill, wall.turn, "fill");
            }
        }

        const { outer, inner } = cornersOf(box);

        for (const [x, z, turn] of outer) {
            put("WallFrame_CornerOuter_01", [x, z], y, turn, "frame");
        }

        for (const [x, z, turn] of inner) {
            put("WallFrame_CornerInner", [x, z], y, turn, "frame");
            put("WallFrame_Beams_01_CornerInner", [x, z], y + KIT.band, turn, "frame");
        }

        // A jettied storey's joists under its overhang, and the overhang's underside
        if (s > 0 && jetty > 0) {
            const [x0, x1, , z1] = box;
            const under = boxes[s - 1][3];

            for (let x = x0 + 0.25; x < x1 - 0.1; x += 0.5) {
                put("WoodBeam_Simple_1m", [x, under + (jetty + KIT.out) / 2], y - 0.1, 1, "frame", { scale: [jetty + KIT.out, 1, 1] });
            }

            trims.push({ points: [[x0 - KIT.out, y, under], [x1 + KIT.out, y, under], [x1 + KIT.out, y, z1 + KIT.out], [x0 - KIT.out, y, z1 + KIT.out]], look: "soffit" });
        }
    }

    for (const run of runsOf(boxes[0])) {
        const { wall } = run;
        const [start, end] = legs(run);
        let at = start;

        while (at < wall.length - end - EPSILON) {
            const piece = wall.length - end - at >= 2 - EPSILON ? 2 : 1;
            const width = Math.min(piece, wall.length - end - at);

            put(`Foundation_Smooth_Edge_${piece}m`, along(wall, at + width / 2), 0, wall.turn, "foundation", width < piece - EPSILON ? { scale: [width / piece, 1, 1] } : {});
            at += width;
        }
    }

    const { outer, inner } = cornersOf(boxes[0]);

    for (const [x, z, turn] of outer) {
        put("Foundation_Smooth_CornerOuter", [x, z], 0, turn, "foundation");
    }

    for (const [x, z, turn] of inner) {
        put("Foundation_Smooth_CornerInner", [x, z], 0, turn, "foundation");
    }

    fillLook = "fill";

    // The gables, row on row up to the ridge, on the top storey's gable ends; and on a gabled
    // house's front, maybe a gable of its own rising from the wall through the roof (as German
    // towns' houses have: a Zwerchhaus), its own roof across the main one's
    const windowed = plan.attic || random.chance(0.55);
    const gable = (wall, width, crossing = false) => {
        const run = runOf(width).filter(({ width: w }) => w >= 1);
        const t = wall.turn;
        let base = top;
        const rows = kind === "half-hip" && !crossing ? 1 : Infinity;

        for (let row = 0; row < rows; row++) {
            const modules = run.slice(row, run.length - row);
            const lower = row === 0;
            const fillLift = lower ? KIT.sill : -0.1;

            if (!modules.length) {
                put("WallFrame_Roof_PeakFil", along(wall, width / 2), base, t, "frame");
                break;
            }

            if (modules.length === 1) {
                const [m] = modules;
                const centre = along(wall, m.at + m.width / 2);

                if (m.width === 2) {
                    const lit = windowed && !lower;
                    put(lower ? "WallFrame_2m_RoofPeak_Lower" : "WallFrame_2m_RoofPeak_Upper", centre, base, t, "frame");
                    put(`WallFill_${fill}_2m_RoofPeak${lit ? "_Window_1x2" : ""}`, centre, base + fillLift, t, "fill");

                    if (lit) {
                        const [hx0, hx1, hy0, hy1] = HOLES["2m_RoofPeak_Window_1x2"][0];
                        const [wx0, wx1, wy0, wy1] = WINDOWS["1x2"];

                        put("Window_Opaque_1x2", along(wall, m.at + m.width / 2 + (hx0 + hx1) / 2 - (wx0 + wx1) / 2), base + fillLift + (hy0 + hy1) / 2 - (wy0 + wy1) / 2, t, "window");
                    }
                } else {
                    put(lower ? "WallFrame_1m_RoofPeak_Lower_Var1" : "WallFrame_1m_RoofPeak_Upper_Var1", centre, base, t, "frame");
                    put(`WallFill_${fill}_1m_RoofPeak`, centre, base + fillLift, t, "fill");
                }

                break;
            }

            for (const [k, m] of modules.entries()) {
                const centre = along(wall, m.at + m.width / 2);
                const end = k === 0 ? "L" : k === modules.length - 1 ? "R" : null;

                if (end) {
                    const lit = windowed && lower && width >= 8;
                    const name = `2m_Roof${end}${lit ? "_Window_1x2" : ""}`;

                    put(`WallFrame_2m_Roof${end}_${lower ? "Lower" : "Upper"}`, centre, base, t, "frame");
                    put(`WallFill_${fill}_${name}`, centre, base + fillLift, t, "fill");

                    if (lower) {
                        put(`WallPattern_2m_Roof${end}_${gableFigure}`, centre, base + fillLift, t, "pattern");
                    }

                    if (lit) {
                        const [hx0, hx1, hy0, hy1] = HOLES[name][0];
                        const [wx0, wx1, wy0, wy1] = WINDOWS["1x2"];

                        put("Window_Opaque_1x2", along(wall, m.at + m.width / 2 + (hx0 + hx1) / 2 - (wx0 + wx1) / 2), base + fillLift + (hy0 + hy1) / 2 - (wy0 + wy1) / 2, t, "window");
                    }
                } else if (lower) {
                    module(wall, m, base, windowed && modules.length % 2 === 1 && k === (modules.length - 1) / 2 ? "window" : "wall", { storey: n, first: false, last: false, plain: false });
                } else {
                    put(m.width === 2 ? "WallFrame_2m_RoofMiddle_Upper" : "WallFrame_1m", centre, base, t, "frame");
                    put(`WallFill_${fill}_${m.width === 2 ? "2m" : "1m"}`, centre, base + fillLift, t, "fill");
                }
            }

            base += lower ? KIT.storey : KIT.upper;
        }

        // (A finial over its peak, out on its verge)
        if (finial && (kind === "gable" || crossing)) {
            const [fx, fz] = along(wall, width / 2);
            const ridgeTop = top + KIT.line + KIT.tiles + KIT.pitch * width / 2;

            put(finial, [fx + wall.out[0] * (KIT.verge - 0.05), fz + wall.out[1] * (KIT.verge - 0.05)], ridgeTop - 0.02, t + 1, "finial");
        }
    };

    for (const side of gableSides) {
        gable(sideOf(boxes.at(-1), side), span);
    }

    // The wing's own gable, at its back
    if (wing) {
        gable(sideOf(wingBox, "back"), wing.span, true);
    }

    // (Its front's middle modules, two or three 2 m ones, or two about its 1 m one, its walls'
    // own going on either side of it, no wider than the main gables: so its ridge is no higher)
    let cross = null;

    // (A shop's if its look has one, over the modules about its door, clear of a hipped roof's
    // hips: kitshop.js)
    const crossing = plan.front ? plan.front.cross && ridge === "x" && n > 1 && kind !== "half-hip" : kind === "gable" && ridge === "x" && n > 1 && !plan.back && random.chance(plan.wealth > 0.5 ? 0.6 : 0.3);

    if (crossing) {
        const front = sideOf(boxes.at(-1), "front");
        const run = plan.front ? plan.front.runs.at(-1) : runOf(front.length);
        const big = run.filter(({ width: w }) => w >= 1);
        const count = big.length % 2 ? 3 : 2;

        if (big.length >= count + 2) {
            const chosen = big.slice((big.length - count) / 2, (big.length + count) / 2);
            const width = chosen.reduce((sum, { width: w }) => sum + w, 0);

            // (A hipped roof's hips reach the ridge half its span in from its ends: the gable's
            // valleys no nearer its ends than that)
            const hipped = kind === "hip" && (chosen[0].at < span / 2 - EPSILON || front.length - chosen.at(-1).at - chosen.at(-1).width < span / 2 - EPSILON);

            if (width <= span + EPSILON && !hipped) {
                const from = chosen[0].at;

                cross = { side: 1, from: front.origin[0] + from, to: front.origin[0] + from + width };
                gable({ ...front, origin: along(front, from), length: width }, width, true);
            }
        }
    }

    // Dormers lighting the roof's rooms, on the sides of a gabled or half-hipped roof that are seen
    // (a house across the street's front, if it has no cross gable; a gable-fronted house's either
    // side): each rising from its eaves' wall over one of its 2 m modules, not at its ends, on a knee
    // of the kit's 1 m frames of a gable's lowest row (1.5 m) with a window in each, under its own
    // gable (the kit's for a 2 m span; no finial, too big for it), its roof meeting the main slope
    // in valleys well under the ridge (so the span's 5 m or more); two on a side only with a module or more between them
    const dormers = [];

    if (plan.dormers && (kind === "gable" || kind === "half-hip") && span >= 5) {
        const size = shape.pick(["2x2", "1x2"]);
        const paired = shape.chance(0.5);
        const name = `1m_Half_Window_${size}`;
        const [hx0, hx1, hy0, hy1] = HOLES[name][0];
        const [ox0, ox1, oy0, oy1] = WINDOWS[size];

        for (const side of ridge === "x" ? (cross && !plan.front ? [] : ["front"]) : ["left", "right"]) {
            const wall = sideOf(boxes.at(-1), side);
            // (On a shop's front, its own modules, clear of its cross gable: kitshop.js)
            const clearOfCross = ({ at }) => !cross || wall.origin[0] + at + 2 <= cross.from - 1 + EPSILON || wall.origin[0] + at >= cross.to + 1 - EPSILON;
            const twos = (plan.front && side === "front" ? plan.front.runs.at(-1) : runOf(wall.length)).filter(({ width: w, at }) => w === 2 && at >= 2 - EPSILON && wall.length - at - 2 >= 2 - EPSILON).filter(clearOfCross);
            const apart = (p, q) => q.at - p.at - 2 >= 1.4 - EPSILON;
            const ends = twos.length >= 2 && apart(twos[0], twos.at(-1)) ? [twos[0], twos.at(-1)] : null;
            // (The same on either side of a gable-fronted house: both ends, or the middle one; of
            // two side by side, the one nearer the street, or the left one)
            const middleOf = ({ at }) => along(wall, at + 1)[ridge === "x" ? 0 : 1];
            const nearer = [...twos].sort((p, q) => (ridge === "x" ? middleOf(p) - middleOf(q) : middleOf(q) - middleOf(p)))[0];
            const chosen = !twos.length ? [] : twos.length % 2 ? (ends && paired ? ends : [twos[(twos.length - 1) / 2]]) : (ends ?? [nearer]);

            for (const { at } of chosen) {
                const t = wall.turn;
                const [p, q] = [along(wall, at), along(wall, at + 2)];
                const [from, to] = ridge === "x" ? [Math.min(p[0], q[0]), Math.max(p[0], q[0])] : [Math.min(p[1], q[1]), Math.max(p[1], q[1])];

                for (const u of [at + 0.5, at + 1.5]) {
                    put("WallFrame_1m_RoofMiddle_Lower", along(wall, u), top, t, "frame");
                    put(`WallFill_${fill}_${name}`, along(wall, u), top + KIT.sill, t, "fill");
                    put(`Window_Opaque_${size}`, along(wall, u + (hx0 + hx1) / 2 - (ox0 + ox1) / 2), top + KIT.sill + (hy0 + hy1) / 2 - (oy0 + oy1) / 2, t, "window");
                }

                put("WallFrame_2m_RoofPeak_Lower", along(wall, at + 1), top + KIT.knee.height, t, "frame");
                put(`WallFill_${fill}_2m_RoofPeak`, along(wall, at + 1), top + KIT.knee.height + KIT.sill, t, "fill");

                dormers.push({ side: side === "front" || side === "right" ? 1 : 0, from, to });
            }
        }
    }

    // The roof, stopped either side of what rises from or joins its long sides, its valleys; the
    // wing's own
    const cuts = [
        ...(cross ? [{ type: "cross", ...cross }] : []),
        ...dormers.map((dormer) => ({ type: "dormer", ...dormer, lift: KIT.knee.height })),
        ...(wing?.join === "valley" ? [{ type: "wing", side: 0, from: wingBox[0], to: wingBox[1] }] : []),
    ];
    const inside = [];

    roofOver({ boxes, ridge, span, kind, top, slopes, trims, cuts, inside });

    if (wing) {
        const [wx0, wx1, wz0, wz1] = wingBox;

        wingRoof({ box: wingBox, top, span: wing.span, join: wing.join, slopes, trims, over: wing.join === "valley" ? [wx0, wx1, wz0, wz1 + wing.span / 2] : wingBox });
    }

    // Its inside, dark: each storey's walls, floor and ceiling facing in (the wing's too), and its
    // roof's underside (the kit's plaster is open round its windows, and the house is hollow:
    // through one, seen from the side, the ground under it showed, or the sky through a gable's)
    const shell = [...inside];

    for (const [s, box] of [...boxes.entries(), ...(wingBox ? boxes.map((_, s) => [s, wingBox]) : [])]) {
        const [x0, x1, z0, z1] = box;
        const [a, b, c, d] = [x0 + SHELL, x1 - SHELL, z0 + SHELL, z1 - SHELL];
        const y0 = KIT.plinth + s * KIT.storey;
        const y1 = y0 + KIT.storey;

        shell.push(
            { points: [[a, y0, c], [b, y0, c], [b, y1, c], [a, y1, c]], out: [0, 0, 1] },
            { points: [[a, y0, d], [b, y0, d], [b, y1, d], [a, y1, d]], out: [0, 0, -1] },
            { points: [[a, y0, c], [a, y0, d], [a, y1, d], [a, y1, c]], out: [1, 0, 0] },
            { points: [[b, y0, c], [b, y0, d], [b, y1, d], [b, y1, c]], out: [-1, 0, 0] },
            { points: [[a, y0, c], [b, y0, c], [b, y0, d], [a, y0, d]], out: [0, 1, 0] },
            { points: [[a, y1, c], [b, y1, c], [b, y1, d], [a, y1, d]], out: [0, -1, 0] },
        );
    }

    // (The roof's underside only over the walls: its slopes' corners brought in to the walls under
    // each, on its slope, so it's never seen under the verges' and eaves' soffits)
    for (const { points, under, over = boxes.at(-1) } of slopes) {
        if (under) {
            const [wx0, wx1, wz0, wz1] = over;
            // (Its plane, its normal from all its corners, Newell's way)
            const n = [0, 0, 0];

            for (const [k, a] of points.entries()) {
                const b = points[(k + 1) % points.length];

                n[0] += (a[1] - b[1]) * (a[2] + b[2]);
                n[1] += (a[2] - b[2]) * (a[0] + b[0]);
                n[2] += (a[0] - b[0]) * (a[1] + b[1]);
            }

            const [p] = points;
            const heightAt = (x, z) => p[1] - (n[0] * (x - p[0]) + n[2] * (z - p[2])) / n[1];
            const inside = points.map(([x, , z]) => [Math.min(wx1, Math.max(wx0, x)), Math.min(wz1, Math.max(wz0, z))]);

            shell.push({ points: inside.map(([x, z]) => [x, heightAt(x, z) - KIT.tiles - SHELL, z]), out: [0, -1, 0] });
        }
    }

    // A chimney on the ridge, clear of what rises through or joins the roof
    if (plan.chimney) {
        const [rx, rz] = ridge === "x" ? [gx0 + width * random.range(0.2, 0.8), gz0 + depth / 2 + random.range(-0.6, 0.6)] : [gx0 + width / 2 + random.range(-0.6, 0.6), gz0 + depth * random.range(0.2, 0.8)];
        const a = ridge === "x" ? rx : rz;
        const [a0, a1] = ridge === "x" ? [gx0, gx0 + width] : [gz0, gz1];
        const clear = (v) => v > a0 + 0.4 && v < a1 - 0.4 && cuts.every(({ from, to }) => v <= from - 0.8 || v >= to + 0.8);
        const at = clear(a) ? a : cuts.flatMap(({ from, to }) => [from - 0.8, to + 0.8]).filter(clear).sort((p, q) => Math.abs(p - a) - Math.abs(q - a))[0];

        if (at !== undefined) {
            extras.chimney = { x: ridge === "x" ? at : rx, z: ridge === "x" ? rz : at, base: top, height: top + KIT.line + KIT.tiles + KIT.pitch * span / 2 + 0.9 };
        }
    }

    const [ux0, ux1, uz0, uz1] = wingBox ? [Math.min(gx0, wingBox[0]), Math.max(gx0 + width, wingBox[1]), wingBox[2], gz1] : [gx0, gx0 + width, gz0, gz1];

    return {
        pieces,
        slopes,
        trims,
        shell,
        extras,
        box: [ux0 - KIT.out, ux1 + KIT.out, uz0 - KIT.out, uz1 + KIT.out],
        height: top + KIT.line + KIT.tiles + KIT.pitch * span / 2,
        look: { fill, roof: ROOFS[plan.roof] ? plan.roof : "clay", tiles: roof.tiles, roofTint: roof.tint, plaster: plan.walls, frame: plan.frame, stone: plan.stoneGround, glazing: plan.glazing, tint: plan.tint },
        ridge,
        span,
        long,
        kind,
        cross,
        dormers,
        wing: wing && { join: wing.join, span: wing.span, box: wingBox },
        main: [gx0, gx0 + width, gz0, gz1],
        storeys: n,
        jetty,
    };
}

// A roof's own frame and what lays its faces: `a` along its ridge (its ends at a0 and a1), `c`
// across it (its eaves' walls' inner faces at c0 and c1), its walls' top `top`. Faces are given
// as their corners alone: the drawer turns each to face up (a slope), down (a soffit), or `out`.
// Its main slopes' dark undersides are kept over `over` (kitHouse's shell).
function roofFrame({ ridge, box, top, slopes, trims, over = box }) {
    const [x0, x1, z0, z1] = box;
    const [a0, a1, c0, c1] = ridge === "x" ? [x0, x1, z0, z1] : [z0, z1, x0, x1];
    const point = (a, c, y) => (ridge === "x" ? [a, y, c] : [c, y, a]);
    const { verge, lip, kick, tiles, line, pitch } = KIT;
    const underAt = (s) => top + line + pitch * s;
    const tileAt = (s) => underAt(s) + tiles;
    const kickTop = (s) => top + kick.top + kick.pitch * s;
    const kickUnder = (s) => top + kick.under + kick.underPitch * s;
    const reach = -kick.reach;
    const vOf = (s) => ((s - KIT.phase) * SLOPE) / KIT.repeat[1];
    const uOf = (u) => u / KIT.repeat[0];

    // Points on a long side's slope (`side` 0 rises from c0, 1 from c1), given (a, s): s how far in
    // from its eaves' wall; and the way out of the house from that side, and from an end
    const cOf = (side, s) => (side ? c1 - s : c0 + s);
    const aOf = (end, s) => (end ? a1 - s : a0 + s);
    const outOf = (side) => point(0, side ? 1 : -1, 0);
    const endOut = (end) => point(end ? 1 : -1, 0, 0);
    // (Where a slope rises from and which way: its eaves' line, at its tiles' height there)
    const riseOf = (side, base) => ({ at: point(a0, cOf(side, 0), 0).filter((_, k) => k !== 1), way: point(0, side ? -1 : 1, 0).filter((_, k) => k !== 1), base });
    // (A corner the same as the one before it left out: a cross gable as wide as the house's own
    // makes the main slope over it a triangle)
    const distinct = (corners) => corners.filter((corner, k) => k === 0 || corner.some((v, i) => Math.abs(v - corners[k - 1][i]) > EPSILON)).filter((corner, k, all) => k < all.length - 1 || all.length < 2 || corner.some((v, i) => Math.abs(v - all[0][i]) > EPSILON));
    const tiled = (side, corners, height = tileAt) => {
        const kept = distinct(corners);
        const main = height === tileAt;

        slopes.push({ points: kept.map(([a, s]) => point(a, cOf(side, s), height(s))), uvs: kept.map(([a, s]) => [uOf(side ? -a : a), vOf(s)]), under: main, ...(main ? { over, rise: riseOf(side, tileAt(0)) } : {}) });
    };
    // ...and on an end's (`end` 0 rises from a0, 1 from a1), given (c, s), from `rise` at its wall
    const tiledEnd = (end, corners, rise) => slopes.push({ points: corners.map(([c, s]) => point(aOf(end, s), c, rise + pitch * s)), uvs: corners.map(([c, s]) => [uOf(end ? c : -c), vOf(s + (rise - tileAt(0)) / pitch)]), under: true, over });
    const trim = (look, points, out = null) => trims.push({ look, points, ...(out ? { out } : {}) });

    // An eave's course along a long side from a = from to a = to: mitred at an end out past the
    // corner (a hip's, `mitre` kick.reach) or in to a valley (a wing's, -kick.reach)
    const eaves = (side, from, to, mitreFrom = 0, mitreTo = 0) => {
        const out = [[from - mitreFrom, reach], [to + mitreTo, reach], [to, 0], [from, 0]];
        const [lipFrom, lipTo] = [Math.sign(mitreFrom) * lip, Math.sign(mitreTo) * lip];

        tiled(side, out, (s) => kickTop(s));
        trim("soffit", out.map(([a, s]) => point(a, cOf(side, s), kickUnder(s))));
        trim("edge", [point(from - mitreFrom, cOf(side, reach), kickUnder(reach)), point(to + mitreTo, cOf(side, reach), kickUnder(reach)), point(to + mitreTo, cOf(side, reach), kickTop(reach)), point(from - mitreFrom, cOf(side, reach), kickTop(reach))], outOf(side));
        // (the main tiles' lip standing over it)
        slopes.push({ points: [point(from - lipFrom, cOf(side, -lip), kickTop(-lip)), point(to + lipTo, cOf(side, -lip), kickTop(-lip)), point(to + lipTo, cOf(side, -lip), tileAt(-lip)), point(from - lipFrom, cOf(side, -lip), tileAt(-lip))], uvs: [[0, 0], [uOf(to - from), 0], [uOf(to - from), 0.12], [0, 0.12]], out: outOf(side) });
    };

    // ...and an end's (a hip's, or a half-hip's over its gable's first row), its wall's top at
    // `wall`, from c = from to c = to, mitred out at its corners
    const endEaves = (end, wall, from, to) => {
        const out = [[from - kick.reach, reach], [to + kick.reach, reach], [to, 0], [from, 0]];
        const kickOf = (s) => wall + kick.top + kick.pitch * s;
        const underOf = (s) => wall + kick.under + kick.underPitch * s;
        const tileOf = (s) => wall + line + tiles + pitch * s;

        slopes.push({ points: out.map(([c, s]) => point(aOf(end, s), c, kickOf(s))), uvs: out.map(([c, s]) => [uOf(c), vOf(s)]) });
        trim("soffit", out.map(([c, s]) => point(aOf(end, s), c, underOf(s))));
        trim("edge", [point(aOf(end, reach), from - kick.reach, underOf(reach)), point(aOf(end, reach), to + kick.reach, underOf(reach)), point(aOf(end, reach), to + kick.reach, kickOf(reach)), point(aOf(end, reach), from - kick.reach, kickOf(reach))], endOut(end));
        slopes.push({ points: [point(aOf(end, -lip), from - lip, kickOf(-lip)), point(aOf(end, -lip), to + lip, kickOf(-lip)), point(aOf(end, -lip), to + lip, tileOf(-lip)), point(aOf(end, -lip), from - lip, tileOf(-lip))], uvs: [[0, 0], [uOf(to - from), 0], [uOf(to - from), 0.12], [0, 0.12]], out: endOut(end) });
    };

    // A verge out past a gable (`end` 0 at a0, 1 at a1), up to s = `upTo` on each side: the
    // rafters' underside out to it and the verge's edge
    const verges = (end, upTo) => {
        const at = end ? a1 : a0;
        const outer = end ? a1 + verge : a0 - verge;

        for (const side of [0, 1]) {
            trim("soffit", [point(at, cOf(side, -lip), underAt(-lip)), point(at, cOf(side, upTo), underAt(upTo)), point(outer, cOf(side, upTo), underAt(upTo)), point(outer, cOf(side, -lip), underAt(-lip))]);
            trim("edge", [point(outer, cOf(side, -lip), underAt(-lip)), point(outer, cOf(side, upTo), underAt(upTo)), point(outer, cOf(side, upTo), tileAt(upTo)), point(outer, cOf(side, -lip), tileAt(-lip))], endOut(end));
        }
    };

    const flat = (a, c) => {
        const [x, , z] = point(a, c, 0);

        return [x, z];
    };

    return { slopes, trims, over, a0, a1, c0, c1, point, underAt, tileAt, kickTop, kickUnder, reach, vOf, uOf, cOf, aOf, outOf, endOut, distinct, tiled, tiledEnd, trim, eaves, endEaves, verges, flat };
}

// A ridge's cap along a level line (from [x, z] to [x, z]) where two slopes' tiles meet at `apex`
// high: its sides from a little up off each slope to over their meeting, laid with the tiles' rows
// along it (the kit's own ridge pieces are hundreds of triangles a metre), and its ends closed
function capAlong(slopes, [x0, z0], [x1, z1], apex) {
    const { width, lift, rise, across } = RIDGE;
    const length = Math.hypot(x1 - x0, z1 - z0);
    const [dx, dz] = [(x1 - x0) / length, (z1 - z0) / length];
    const foot = apex - KIT.pitch * width + lift;
    const high = apex + rise;
    const v = length / KIT.repeat[1];

    for (const way of [1, -1]) {
        const [px, pz] = [-dz * width * way, dx * width * way];

        slopes.push({ points: [[x0 + px, foot, z0 + pz], [x1 + px, foot, z1 + pz], [x1, high, z1], [x0, high, z0]], uvs: [[0, 0], [0, v], [across, v], [across, 0]] });
    }

    for (const [[ex, ez], way] of [[[x0, z0], -1], [[x1, z1], 1]]) {
        const [px, pz] = [-dz * width, dx * width];

        slopes.push({ points: [[ex + px, foot, ez + pz], [ex - px, foot, ez - pz], [ex, high, ez]], uvs: [[0, 0], [2 * across, 0], [across, 0.04]], out: [dx * way, 0, dz * way] });
    }
}

// The roof: its slopes laid with tiles on the gables' line (their undersides on it), the eaves'
// course kicked out past the walls, the soffits and edges under and round them, and its ridge
// tiles; and where something rises from or joins a long side (`cuts`: a cross gable, a dormer, a
// wing), that side's slope and eaves stopped either side of it, the slope going on over it above
// the valleys where the two roofs meet.
function roofOver({ boxes, ridge, span, kind, top, slopes, trims, cuts = [], inside = [] }) {
    const frame = roofFrame({ ridge, box: boxes.at(-1), top, slopes, trims });
    const { a0, a1, c0, c1, tileAt, tiled, tiledEnd, eaves, endEaves, verges, trim, point, cOf, aOf, flat, kickUnder, kickTop, reach } = frame;
    const half = span / 2;
    const { verge, lip, kick, line, pitch } = KIT;
    const ridgeTiles = (from, to) => capAlong(slopes, flat(from, (c0 + c1) / 2), flat(to, (c0 + c1) / 2), tileAt(half));

    // Each long side's slope, from its left end's line (at a0) to its right end's (at a1), each
    // from its eaves (s = -lip) up to the ridge; its eaves from end to end, mitred as its ends are
    const ends = {
        gable: { left: [[a0 - verge, -lip], [a0 - verge, half]], right: [[a1 + verge, -lip], [a1 + verge, half]], eaves: [a0 - verge, a1 + verge, 0] },
        hip: { left: [[a0 - lip, -lip], [a0 + half, half]], right: [[a1 + lip, -lip], [a1 - half, half]], eaves: [a0, a1, kick.reach] },
    };

    if (kind === "half-hip") {
        const cut = KIT.storey / pitch;

        ends["half-hip"] = { left: [[a0 - verge, -lip], [a0 - verge, cut - verge], [a0 + (half - cut), half]], right: [[a1 + verge, -lip], [a1 + verge, cut - verge], [a1 - (half - cut), half]], eaves: [a0 - verge, a1 + verge, 0] };
    }

    const { left, right, eaves: [eaveFrom, eaveTo, mitre] } = ends[kind];

    for (const side of [0, 1]) {
        const here = cuts.filter((cut) => cut.side === side).sort((p, q) => p.from - q.from);
        // (The line a slope's part ends on beside a cut, from its eaves up: straight up past a
        // gable or dormer rising from the wall; along the valley where a wing's roof meets it)
        const before = (cut) => (cut.type === "wing" ? [[cut.from - lip, -lip], [(cut.from + cut.to) / 2, (cut.to - cut.from) / 2], [(cut.from + cut.to) / 2, half]] : [[cut.from, -lip], [cut.from, half]]);
        const after = (cut) => (cut.type === "wing" ? [[cut.to + lip, -lip], [(cut.from + cut.to) / 2, (cut.to - cut.from) / 2], [(cut.from + cut.to) / 2, half]] : [[cut.to, -lip], [cut.to, half]]);
        const lines = [left, ...here.flatMap((cut) => [before(cut), after(cut)]), right];

        for (let k = 0; k < lines.length; k += 2) {
            tiled(side, [...lines[k + 1], ...[...lines[k]].reverse()]);
        }

        // Over a gable or dormer, the slope above the valleys (`lift` how much higher its eaves are)
        for (const cut of here.filter(({ type }) => type !== "wing")) {
            const middle = (cut.from + cut.to) / 2;
            const rise = (cut.to - cut.from) / 2;
            const up = (cut.lift ?? 0) / pitch;

            tiled(side, [[cut.from, up], [middle, up + rise], [middle, half], [cut.from, half]]);
            tiled(side, [[middle, up + rise], [cut.to, up], [cut.to, half], [middle, half]]);
        }

        // The eaves' course: stopped against a gable or dormer, its ends closed; mitred into a
        // wing's valleys
        const stops = [{ at: eaveFrom, mitre }, ...here.flatMap((cut) => [{ at: cut.from, mitre: cut.type === "wing" ? -kick.reach : 0, cap: cut.type !== "wing" ? 1 : 0 }, { at: cut.to, mitre: cut.type === "wing" ? -kick.reach : 0, cap: cut.type !== "wing" ? -1 : 0 }]), { at: eaveTo, mitre }];

        for (let k = 0; k < stops.length; k += 2) {
            const [from, to] = [stops[k], stops[k + 1]];

            eaves(side, from.at, to.at, from.mitre, to.mitre);

            for (const { at, cap } of [from, to].filter(({ cap }) => cap)) {
                trims.push({ look: "edge", points: [point(at, cOf(side, 0), kickUnder(0)), point(at, cOf(side, reach), kickUnder(reach)), point(at, cOf(side, reach), kickTop(reach)), point(at, cOf(side, 0), kickTop(0))], out: point(cap, 0, 0) });
            }
        }
    }

    if (kind === "hip") {
        // The ends' slopes to the ridge's ends (or all four to a point); their eaves mitred at the corners
        for (const end of [0, 1]) {
            tiledEnd(end, [[c0 - lip, -lip], [c1 + lip, -lip], [(c0 + c1) / 2, half]], tileAt(0));
            endEaves(end, top, c0, c1);
        }

        if (a1 - half > a0 + half + EPSILON) {
            ridgeTiles(a0 + half, a1 - half);
        }
    } else if (kind === "half-hip") {
        // Gabled up to the top of the gables' first row, cut back above it: an end slope from
        // that row's top plate (2.7 m over the walls' top), its underside as high over the plate as
        // the long slopes' are over the walls, so they meet where they're that high (s = 2.7 / 1.2
        // = 2.25 in from the eaves), along hip lines from the verges' corners; the end slope out as
        // far as the verges, and a board across the gable's face from the plate up to the roof
        const wall = top + KIT.storey;
        const cut = KIT.storey / pitch;
        const endUnder = (s) => wall + line + pitch * s;

        for (const end of [0, 1]) {
            const reachOut = -verge;
            const [e0, e1] = [c0 + cut - verge, c1 - cut + verge];
            const plate = (KIT.storey - line) / pitch;
            const face = aOf(end, -0.22);

            tiledEnd(end, [[e0, reachOut], [e1, reachOut], [(c0 + c1) / 2, half - cut]], wall + line + KIT.tiles);
            verges(end, cut - verge);
            trim("soffit", [point(face, cOf(0, cut - 0.22), endUnder(-0.22)), point(face, cOf(1, cut - 0.22), endUnder(-0.22)), point(aOf(end, reachOut), e1, endUnder(reachOut)), point(aOf(end, reachOut), e0, endUnder(reachOut))]);
            trim("edge", [point(aOf(end, reachOut), e0, endUnder(reachOut)), point(aOf(end, reachOut), e1, endUnder(reachOut)), point(aOf(end, reachOut), e1, endUnder(reachOut) + KIT.tiles), point(aOf(end, reachOut), e0, endUnder(reachOut) + KIT.tiles)], frame.endOut(end));
            // (The board: from the plate, where the long slopes' rafters leave it, up to the roofs'
            // undersides over the gable's face)
            trim("edge", [point(face, cOf(0, plate), wall), point(face, cOf(1, plate), wall), point(face, cOf(1, cut - 0.22), endUnder(-0.22)), point(face, cOf(0, cut - 0.22), endUnder(-0.22))], frame.endOut(end));
        }

        ridgeTiles(a0 + (half - cut), a1 - (half - cut));
    } else {
        verges(0, half);
        verges(1, half);
        ridgeTiles(a0 - verge, a1 + verge);
    }

    for (const cut of cuts.filter(({ type }) => type !== "wing")) {
        gableRoof(frame, cut, inside);
    }
}

// The roof of a gable rising from a long side's wall (kitHouse's cross gable, or a dormer `lift`
// metres over the walls' top on its knee), from a = from to a = to: its two slopes from its walls'
// line out over its verge, back to the valleys where they meet the main slope, as high as it is
// there; its verge's soffits and edge, and its ridge's cap. A dormer's own eaves along its sides,
// and its cheeks hung with tiles from its knee's face back to the main slope.
function gableRoof(frame, { side, from, to, lift = 0 }, inside) {
    const { point, cOf, tileAt, underAt, kickTop, kickUnder, reach, vOf, uOf, flat, slopes, trims } = frame;
    const { verge, lip, pitch, tiles, line } = KIT;
    const middle = (from + to) / 2;
    const rise = (to - from) / 2;
    const up = lift / pitch;
    const out = (s) => cOf(side, s);
    const front = out(-verge);
    const [tile, under] = [(t) => tileAt(t) + lift, (t) => underAt(t) + lift];

    for (const [edge, way] of [[from, 1], [to, -1]]) {
        const at = (t) => edge + way * t;
        // (Its corners: [a, c, t], t how far in from its own eaves' line)
        const corners = [[at(-lip), front, -lip], [middle, front, rise], [middle, out(rise + up), rise], [edge, out(up), 0], [at(-lip), out(up - lip), -lip]];

        slopes.push({ points: corners.map(([a, c, t]) => point(a, c, tile(t))), uvs: corners.map(([, c, t]) => [uOf(c), vOf(t)]), under: true, over: frame.over, rise: { at: flat(edge, out(0)), way: flat(way, 0).map((v, k) => v - flat(0, 0)[k]), base: tile(0) } });
        // (Its verge: the rafters' underside out to it, and its edge)
        trims.push({ look: "soffit", points: [point(at(-lip), out(0), under(-lip)), point(middle, out(0), under(rise)), point(middle, front, under(rise)), point(at(-lip), front, under(-lip))] });
        trims.push({ look: "edge", points: [point(at(-lip), front, under(-lip)), point(middle, front, under(rise)), point(middle, front, tile(rise)), point(at(-lip), front, tile(-lip))], out: frame.outOf(side) });

        if (!lift) {
            continue;
        }

        // A dormer's eaves' course along its side, out from its knee to `reach`, from its verge
        // back to where each of its faces meets the main slope (s where the main tiles are as high)
        const meets = (height) => (height - tileAt(0)) / pitch;
        const kickOf = (t) => kickTop(t) + lift;
        const underOf = (t) => kickUnder(t) + lift;
        const course = [[at(reach), front, kickOf(reach)], [at(0), front, kickOf(0)], [at(0), out(meets(kickOf(0))), kickOf(0)], [at(reach), out(meets(kickOf(reach))), kickOf(reach)]];

        slopes.push({ points: course.map(([a, c, y]) => point(a, c, y)), uvs: course.map(([a, c]) => [uOf(c), vOf(way * (a - edge))]) });
        trims.push({ look: "soffit", points: [point(at(reach), front, underOf(reach)), point(at(0), front, underOf(0)), point(at(0), out(meets(underOf(0))), underOf(0)), point(at(reach), out(meets(underOf(reach))), underOf(reach))] });
        trims.push({ look: "edge", points: [point(at(reach), front, underOf(reach)), point(at(reach), front, kickOf(reach)), point(at(reach), out(meets(kickOf(reach))), kickOf(reach)), point(at(reach), out(meets(underOf(reach))), underOf(reach))], out: point(-way, 0, 0) });
        // (its own tiles' lip standing over it)
        slopes.push({ points: [point(at(-lip), front, kickOf(-lip)), point(at(-lip), front, tile(-lip)), point(at(-lip), out(up - lip), tile(-lip)), point(at(-lip), out(meets(kickOf(-lip))), kickOf(-lip))], uvs: [[0, 0], [0, 0.12], [uOf(up + verge), 0.12], [uOf(up + verge), 0]], out: point(-way, 0, 0) });

        // Its cheek, hung with tiles: from the knee's face back to the main slope, from a little
        // into the main roof (its eaves' course before the main tiles' lip, then the tiles) up to
        // under its own eaves
        const cheek = at(-CHEEK);
        const topOf = underOf(-CHEEK);
        const sunk = (y) => y - CHEEK_SUNK;
        const hung = (points) => slopes.push({ points: points.map(([c, y]) => point(cheek, c, y)), uvs: points.map(([c, y]) => [uOf(c), y / KIT.repeat[1]]), out: point(-way, 0, 0) });
        const face = -KIT.knee.depth;

        hung([[out(face), sunk(kickTop(face))], [out(-lip), sunk(kickTop(-lip))], [out(-lip), topOf], [out(face), topOf]]);
        hung([[out(-lip), sunk(tileAt(-lip))], [out(meets(topOf + CHEEK_SUNK)), topOf], [out(-lip), topOf]]);
    }

    capAlong(slopes, flat(middle, front), flat(middle, out(rise + up)), tile(rise));

    // (A dormer's inside, dark behind its knee: its windows' openings show nothing through them)
    if (lift) {
        inside.push({ points: [point(from + SHELL, out(SHELL), tileAt(0) - tiles - line), point(to - SHELL, out(SHELL), tileAt(0) - tiles - line), point(to - SHELL, out(SHELL), tileAt(0) - tiles - line + lift + KIT.line), point(from + SHELL, out(SHELL), tileAt(0) - tiles - line + lift + KIT.line)], out: frame.outOf(side) });
    }
}

// A wing's roof, its ridge across the main one's, from its gable at a0 to where it joins the main
// roof at a1: `join` "valley", its slopes run on into the main slope's, meeting it in valleys
// (the main roof's `cuts` leave room for them); "wall", they stop against the main gable's face.
function wingRoof({ box, top, span, join, slopes, trims, over }) {
    const frame = roofFrame({ ridge: "z", box, top, slopes, trims, over });
    const { a0, a1, c0, c1, tiled, eaves, verges, flat, tileAt } = frame;
    const { verge, lip, kick } = KIT;
    const half = span / 2;
    const face = a1 - WING.face;

    for (const side of [0, 1]) {
        if (join === "valley") {
            tiled(side, [[a0 - verge, -lip], [a1 - lip, -lip], [a1 + half, half], [a0 - verge, half]]);
            eaves(side, a0 - verge, a1, 0, -kick.reach);
        } else {
            tiled(side, [[a0 - verge, -lip], [a1, -lip], [a1, half], [a0 - verge, half]]);
            eaves(side, a0 - verge, face);
        }
    }

    verges(0, half);
    capAlong(slopes, flat(a0 - verge, (c0 + c1) / 2), flat(join === "valley" ? a1 + half : a1 - RIDGE.width, (c0 + c1) / 2), tileAt(half));
}

/**
 * How likely a house the kit could build is the game's own instead (kits/house.js), by where it
 * stands (setpieces/town.js: a house's `street`, or out `back`): none round the market, few on the
 * main streets, more down the lanes and behind, so the kit sets a street's look and the game's
 * own houses mix in with it the further back one goes; about a quarter of them in all, in a town,
 * a city or a capital alike (test/kithouse.test.js).
 */
export const KIT_MIX = Object.freeze({ market: 0, main: 0.08, lane: 0.3, back: 0.3 });

/** Whether a house the kit could build is the game's own instead (KIT_MIX): its own draw, from its seed, the same every time. */
export function ownHouse(piece) {
    const share = KIT_MIX[piece.back ? "back" : (piece.street ?? "main")] ?? 0;
    const seed = piece.seed ?? Math.round((piece.x ?? 0) * 31 + (piece.y ?? 0) * 17 + 7);

    return share > 0 && createRandom((seed ^ 0x6f3d) >>> 0).range(0, 1) < share;
}

/**
 * Whether a house of the layout is built of the kit: a human town's, city's or capital's timber,
 * brick or cottage house, on its street or out behind (a workshop, a shed: most of a city's), but
 * for those that are the game's own (ownHouse).
 */
export function kitBuilt(piece, settlement) {
    return piece.kind === "house" && HOUSE_KIT.styles.includes(piece.style ?? "timber") && HOUSE_KIT.settlements.includes(settlement) && (piece.people ?? "human") === "human" && !ownHouse(piece);
}
