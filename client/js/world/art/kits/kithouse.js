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

/** The spans (metres across, between the eaves' walls) its gables are built for. */
export const SPANS = Object.freeze([4, 5, 6, 8, 10]);

// Each fill's openings (Stone's and Brick's alike): [x0, x1, y0, y1] in the piece's own metres
const HOLES = Object.freeze({
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
    "2m_DoorCenter": [[-0.525, 0.525, 0, 1.864]],
    "2m_DoorLeft": [[-0.9, 0.121, 0, 1.868]],
    "2m_DoorRight": [[-0.121, 0.9, 0, 1.868]],
    "2m_DoorLeft_Window_1x3": [[-0.9, 0.121, 0, 1.868], [0.442, 0.757, 1.115, 1.72]],
    "2m_DoorRight_Window_1x3": [[-0.121, 0.9, 0, 1.868], [-0.757, -0.442, 1.115, 1.72]],
});

// The windows' own extents: [x0, x1, y0, y1]
const WINDOWS = Object.freeze({
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
    const ends = random.pick(figures.ends);
    const between = random.pick(figures.between);
    const one = random.pick(figures.one);
    const gableFigure = random.pick(GABLES);
    const door = random.pick(DOORS);
    const ground = random.pick(["2x3", "2x4", "2x3"]);
    const upper = random.pick(["2x3", "2x2", "1x3", "2x3"]);
    const doubled = plan.wealth > 0.6 && random.chance(0.7);
    const sills = random.chance(0.6);
    const finial = plan.wealth > 0.45 ? random.pick(FINIALS) : null;
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
    const span = spanFor(ridge === "x" ? roomZ : roomX);
    const long = Math.max(span, onGrid(ridge === "x" ? roomX : roomZ));
    const [width, depth] = ridge === "x" ? [long, span] : [span, long];
    const gx0 = (bx0 + bx1) / 2 - width / 2;
    const gz1 = bz1 - KIT.out;
    const gz0 = gz1 - depth;
    const jetty = plan.jetty > 0 && n > 1 ? Math.min(0.6, Math.max(KIT.filler, Math.round(plan.jetty / P / KIT.filler) * KIT.filler)) : 0;
    const boxes = Array.from({ length: n }, (_, s) => [gx0, gx0 + width, gz0, gz1 - jetty * (n - 1 - s)]);
    const top = KIT.plinth + n * KIT.storey;
    const kind = plan.kind === "half-hip" && span < 6 ? "gable" : plan.kind;
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
            const where = random.pick(["Center", "Center", "Left", "Right"]);
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
                extras.awnings.push({ at: centre, out: wall.out, across: wall.across, width: 2, y: lift + HOLES[name][0][3] + 0.1 });
            }

            return;
        }

        put(`WallFill_${fill}_2m`, centre, lift, t, "fill");

        if (!plain) {
            put(`WallPattern_2m_${first || last ? ends : between}`, centre, lift, t, "pattern");
        }
    }

    // The storeys' walls, posts at their corners, and the plinth under the ground floor's
    for (const [s, box] of boxes.entries()) {
        const y = KIT.plinth + s * KIT.storey;
        const plain = s === 0 && Boolean(plan.stoneGround);

        fillLook = plain ? "stone" : "fill";

        for (const side of ["front", "back", "left", "right"]) {
            const wall = sideOf(box, side);
            const stepped = jetty > 0 && (side === "left" || side === "right") && s < n - 1;
            const run = runOf(wall.length, { fillers: stepped ? "end" : "both" });

            // (The right-hand wall runs from the front: its fillers, where a jetty's made it, at its start)
            const laid = stepped && side === "right" ? runOf(wall.length, { fillers: "end" }).map((m) => ({ ...m, at: wall.length - m.at - m.width })).reverse() : run;
            const kinds = kindsOf(wall, laid, side, s);
            const big = laid.filter(({ width }) => width >= 1);

            laid.forEach((m, k) => module(wall, m, y, kinds[k], { storey: s, first: m === big[0], last: m === big.at(-1), plain }));
        }

        const [x0, x1, z0, z1] = box;

        for (const [x, z, turn] of [[x1, z1, 0], [x1, z0, 1], [x0, z0, 2], [x0, z1, 3]]) {
            put("WallFrame_CornerOuter_01", [x, z], y, turn, "frame");
        }

        // A jettied storey's joists under its overhang, and the overhang's underside
        if (s > 0 && jetty > 0) {
            const under = boxes[s - 1][3];

            for (let x = x0 + 0.25; x < x1 - 0.1; x += 0.5) {
                put("WoodBeam_Simple_1m", [x, under + (jetty + KIT.out) / 2], y - 0.1, 1, "frame", { scale: [jetty + KIT.out, 1, 1] });
            }

            trims.push({ points: [[x0 - KIT.out, y, under], [x1 + KIT.out, y, under], [x1 + KIT.out, y, z1 + KIT.out], [x0 - KIT.out, y, z1 + KIT.out]], look: "soffit" });
        }
    }

    const [x0, x1, z0, z1] = boxes[0];

    for (const side of ["front", "back", "left", "right"]) {
        const wall = sideOf(boxes[0], side);
        let at = 0;

        while (at < wall.length - EPSILON) {
            const piece = wall.length - at >= 2 - EPSILON ? 2 : 1;
            const width = Math.min(piece, wall.length - at);

            put(`Foundation_Smooth_Edge_${piece}m`, along(wall, at + width / 2), 0, wall.turn, "foundation", width < piece - EPSILON ? { scale: [width / piece, 1, 1] } : {});
            at += width;
        }
    }

    for (const [x, z, turn] of [[x1, z1, 0], [x1, z0, 1], [x0, z0, 2], [x0, z1, 3]]) {
        put("Foundation_Smooth_CornerOuter", [x, z], 0, turn, "foundation");
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

    // (Its front's middle modules, two or three 2 m ones, or two about its 1 m one, its walls'
    // own going on either side of it, no wider than the main gables: so its ridge is no higher)
    let cross = null;

    if (kind === "gable" && ridge === "x" && n > 1 && !plan.back && random.chance(plan.wealth > 0.5 ? 0.6 : 0.3)) {
        const front = sideOf(boxes.at(-1), "front");
        const run = runOf(front.length);
        const big = run.filter(({ width: w }) => w >= 1);
        const count = big.length % 2 ? 3 : 2;

        if (big.length >= count + 2) {
            const chosen = big.slice((big.length - count) / 2, (big.length + count) / 2);
            const width = chosen.reduce((sum, { width: w }) => sum + w, 0);

            if (width <= span + EPSILON) {
                const from = chosen[0].at;

                cross = { side: 1, from: front.origin[0] + from, to: front.origin[0] + from + width };
                gable({ ...front, origin: along(front, from), length: width }, width, true);
            }
        }
    }

    roofOver({ boxes, ridge, span, kind, top, slopes, trims, cross });

    // Its inside, dark: each storey's walls, floor and ceiling facing in, and its roof's underside
    // (the kit's plaster is open round its windows, and the house is hollow: through one, seen
    // from the side, the ground under it showed, or the sky through a gable's)
    const shell = [];

    for (const [s, [x0, x1, z0, z1]] of boxes.entries()) {
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

    // (The roof's underside only over the walls: its slopes' corners brought in to the top storey's
    // walls, on its slope, so it's never seen under the verges' and eaves' soffits)
    const [wx0, wx1, wz0, wz1] = boxes.at(-1);

    for (const { points, under } of slopes) {
        if (under) {
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

    if (plan.chimney) {
        const [rx, rz] = ridge === "x" ? [gx0 + width * random.range(0.2, 0.8), gz0 + depth / 2 + random.range(-0.6, 0.6)] : [gx0 + width / 2 + random.range(-0.6, 0.6), gz0 + depth * random.range(0.2, 0.8)];
        // (Clear of a cross gable's roof)
        const [cx] = cross && rx > cross.from - 0.8 && rx < cross.to + 0.8 ? [rx < (cross.from + cross.to) / 2 ? cross.from - 0.8 : cross.to + 0.8] : [rx];

        extras.chimney = { x: cx, z: rz, base: top, height: top + KIT.line + KIT.tiles + KIT.pitch * span / 2 + 0.9 };
    }

    return {
        pieces,
        slopes,
        trims,
        shell,
        extras,
        box: [gx0 - KIT.out, gx0 + width + KIT.out, gz0 - KIT.out, gz1 + KIT.out],
        height: top + KIT.line + KIT.tiles + KIT.pitch * span / 2,
        look: { fill, roof: ROOFS[plan.roof] ? plan.roof : "clay", tiles: roof.tiles, roofTint: roof.tint, plaster: plan.walls, frame: plan.frame, stone: plan.stoneGround, glazing: plan.glazing, tint: plan.tint },
        ridge,
        span,
        kind,
        cross,
        storeys: n,
        jetty,
    };
}

// The roof: its slopes laid with tiles on the gables' line (their undersides on it), the eaves'
// course kicked out past the walls, the soffits and edges under and round them, and its ridge
// tiles. Faces are given as their corners alone: the drawer turns each to face up (a slope), down (a
// soffit) or away from the house (an edge).
function roofOver({ boxes, ridge, span, kind, top, slopes, trims, cross = null }) {
    // The roof's own frame: `a` along the ridge (the gables' walls at a0 and a1), `c` across it
    // (the eaves' walls at c0 and c1); `s` how far in from an eave
    const [x0, x1, z0, z1] = boxes.at(-1);
    const [a0, a1, c0, c1] = ridge === "x" ? [x0, x1, z0, z1] : [z0, z1, x0, x1];
    const point = (a, c, y) => (ridge === "x" ? [a, y, c] : [c, y, a]);
    const half = span / 2;
    const { verge, lip, kick, tiles, line, pitch } = KIT;
    const underAt = (s) => top + line + pitch * s;
    const tileAt = (s) => underAt(s) + tiles;
    const kickTop = (s) => top + kick.top + kick.pitch * s;
    const kickUnder = (s) => top + kick.under + kick.underPitch * s;
    const reach = -kick.reach;
    const vOf = (s) => ((s - KIT.phase) * SLOPE) / KIT.repeat[1];
    const uOf = (u) => u / KIT.repeat[0];

    // Points on a long side's slope (`side` 0 rises from c0, 1 from c1), given (a, s)
    const cOf = (side, s) => (side ? c1 - s : c0 + s);
    // (A corner the same as the one before it left out: a cross gable as wide as the house's own
    // makes the main slope over it a triangle)
    const distinct = (corners) => corners.filter(([a, s], k) => k === 0 || Math.abs(a - corners[k - 1][0]) > EPSILON || Math.abs(s - corners[k - 1][1]) > EPSILON);
    const tiled = (side, corners, height = tileAt) => slopes.push({ points: distinct(corners).map(([a, s]) => point(a, cOf(side, s), height(s))), uvs: distinct(corners).map(([a, s]) => [uOf(side ? -a : a), vOf(s)]), under: height === tileAt });
    // ...and on an end's (`end` 0 rises from a0, 1 from a1), given (c, s), from `rise` at its wall
    const aOf = (end, s) => (end ? a1 - s : a0 + s);
    const tiledEnd = (end, corners, rise) => slopes.push({ points: corners.map(([c, s]) => point(aOf(end, s), c, rise + pitch * s)), uvs: corners.map(([c, s]) => [uOf(end ? c : -c), vOf(s + (rise - tileAt(0)) / pitch)]), under: true });
    const trim = (look, points) => trims.push({ look, points });

    // An eave's course along a long side from a = from to a = to (out past its corners by `mitre`)
    const eaves = (side, from, to, mitre = 0) => {
        const out = [[from - mitre, reach], [to + mitre, reach], [to, 0], [from, 0]];

        tiled(side, out, (s) => kickTop(s));
        trim("soffit", out.map(([a, s]) => point(a, cOf(side, s), kickUnder(s))));
        trim("edge", [point(from - mitre, cOf(side, reach), kickUnder(reach)), point(to + mitre, cOf(side, reach), kickUnder(reach)), point(to + mitre, cOf(side, reach), kickTop(reach)), point(from - mitre, cOf(side, reach), kickTop(reach))]);
        // (the main tiles' lip standing over it)
        slopes.push({ points: [point(from - (mitre ? lip : 0), cOf(side, -lip), kickTop(-lip)), point(to + (mitre ? lip : 0), cOf(side, -lip), kickTop(-lip)), point(to + (mitre ? lip : 0), cOf(side, -lip), tileAt(-lip)), point(from - (mitre ? lip : 0), cOf(side, -lip), tileAt(-lip))], uvs: [[0, 0], [uOf(to - from), 0], [uOf(to - from), 0.12], [0, 0.12]] });
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
        trim("edge", [point(aOf(end, reach), from - kick.reach, underOf(reach)), point(aOf(end, reach), to + kick.reach, underOf(reach)), point(aOf(end, reach), to + kick.reach, kickOf(reach)), point(aOf(end, reach), from - kick.reach, kickOf(reach))]);
        slopes.push({ points: [point(aOf(end, -lip), from - lip, kickOf(-lip)), point(aOf(end, -lip), to + lip, kickOf(-lip)), point(aOf(end, -lip), to + lip, tileOf(-lip)), point(aOf(end, -lip), from - lip, tileOf(-lip))], uvs: [[0, 0], [uOf(to - from), 0], [uOf(to - from), 0.12], [0, 0.12]] });
    };

    // A verge out past a gable (`end` 0 at a0, 1 at a1), up to s = `upTo` on each side: the
    // rafters' underside out to it and the verge's edge
    const verges = (end, upTo) => {
        const at = end ? a1 : a0;
        const outer = end ? a1 + verge : a0 - verge;

        for (const side of [0, 1]) {
            trim("soffit", [point(at, cOf(side, -lip), underAt(-lip)), point(at, cOf(side, upTo), underAt(upTo)), point(outer, cOf(side, upTo), underAt(upTo)), point(outer, cOf(side, -lip), underAt(-lip))]);
            trim("edge", [point(outer, cOf(side, -lip), underAt(-lip)), point(outer, cOf(side, upTo), underAt(upTo)), point(outer, cOf(side, upTo), tileAt(upTo)), point(outer, cOf(side, -lip), tileAt(-lip))]);
        }
    };

    // A ridge's cap along a level line (from [x, z] to [x, z]) where two slopes' tiles meet at
    // `apex` high: its sides from a little up off each slope to over their meeting, laid with the
    // tiles' rows along it (the kit's own ridge pieces are hundreds of triangles a metre), and its
    // ends closed
    const capAlong = ([x0, z0], [x1, z1], apex) => {
        const { width, lift, rise, across } = RIDGE;
        const length = Math.hypot(x1 - x0, z1 - z0);
        const [dx, dz] = [(x1 - x0) / length, (z1 - z0) / length];
        const foot = apex - pitch * width + lift;
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
    };
    const flat = (a, c) => {
        const [x, , z] = point(a, c, 0);

        return [x, z];
    };
    const ridgeTiles = (from, to) => capAlong(flat(from, (c0 + c1) / 2), flat(to, (c0 + c1) / 2), tileAt(half));

    if (kind === "hip") {
        // Four slopes from the eaves all round, the long ones to the ridge, the ends to its ends
        // (or all four to a point); the eaves' course round all four, mitred at the corners
        const rise = half;
        const ridgeFrom = a0 + rise;
        const ridgeTo = a1 - rise;

        for (const side of [0, 1]) {
            tiled(side, [[a0 - lip, -lip], [a1 + lip, -lip], [ridgeTo, rise], [ridgeFrom, rise]]);
            eaves(side, a0, a1, kick.reach);
        }

        for (const end of [0, 1]) {
            tiledEnd(end, [[c0 - lip, -lip], [c1 + lip, -lip], [(c0 + c1) / 2, rise]], tileAt(0));
            endEaves(end, top, c0, c1);
        }

        if (ridgeTo > ridgeFrom + EPSILON) {
            ridgeTiles(ridgeFrom, ridgeTo);
        }

        return;
    }

    if (kind === "half-hip") {
        // Gabled up to the top of the gables' first row, cut back above it: an end slope from
        // that row's top plate (2.7 m over the walls' top), its underside as high over the plate as
        // the long slopes' are over the walls, so they meet where they're that high (s = 2.7 / 1.2
        // = 2.25 in from the eaves), along hip lines from the verges' corners; the end slope out as
        // far as the verges, and a board across the gable's face from the plate up to the roof
        const wall = top + KIT.storey;
        const cut = KIT.storey / pitch;
        const from = a0 + (half - cut);
        const to = a1 - (half - cut);
        const endUnder = (s) => wall + line + pitch * s;

        for (const side of [0, 1]) {
            tiled(side, [[a0 - verge, -lip], [a1 + verge, -lip], [a1 + verge, cut - verge], [to, half], [from, half], [a0 - verge, cut - verge]]);
            eaves(side, a0 - verge, a1 + verge);
        }

        for (const end of [0, 1]) {
            const reachOut = -verge;
            const [e0, e1] = [c0 + cut - verge, c1 - cut + verge];
            const plate = (KIT.storey - line) / pitch;
            const face = aOf(end, -0.22);

            tiledEnd(end, [[e0, reachOut], [e1, reachOut], [(c0 + c1) / 2, half - cut]], wall + line + tiles);
            verges(end, cut - verge);
            trim("soffit", [point(face, cOf(0, cut - 0.22), endUnder(-0.22)), point(face, cOf(1, cut - 0.22), endUnder(-0.22)), point(aOf(end, reachOut), e1, endUnder(reachOut)), point(aOf(end, reachOut), e0, endUnder(reachOut))]);
            trim("edge", [point(aOf(end, reachOut), e0, endUnder(reachOut)), point(aOf(end, reachOut), e1, endUnder(reachOut)), point(aOf(end, reachOut), e1, endUnder(reachOut) + tiles), point(aOf(end, reachOut), e0, endUnder(reachOut) + tiles)]);
            // (The board: from the plate, where the long slopes' rafters leave it, up to the roofs'
            // undersides over the gable's face)
            trim("edge", [point(face, cOf(0, plate), wall), point(face, cOf(1, plate), wall), point(face, cOf(1, cut - 0.22), endUnder(-0.22)), point(face, cOf(0, cut - 0.22), endUnder(-0.22))]);
        }

        ridgeTiles(from, to);

        return;
    }

    // A gable roof: two slopes from the eaves to the ridge, out over the verges
    for (const side of [0, 1]) {
        if (cross?.side === side) {
            continue;
        }

        tiled(side, [[a0 - verge, -lip], [a1 + verge, -lip], [a1 + verge, half], [a0 - verge, half]]);
        eaves(side, a0 - verge, a1 + verge);
    }

    verges(0, half);
    verges(1, half);
    ridgeTiles(a0 - verge, a1 + verge);

    if (cross) {
        crossRoof(cross);
    }

    // A gable rising from the eaves' wall (`side`), from a = from to a = to (kitHouse's `cross`):
    // the main slope either side of it, and over it from the valleys where its own roof meets it;
    // its roof's two slopes from its walls' line out over its verge, back to the valleys, where
    // they're as high as the main slope (as far in from its eaves as that is from its own); the
    // main eaves' course stopped either side of it, its ends closed; its verge's soffits and edge,
    // and its ridge's cap
    function crossRoof({ side, from, to }) {
        const middle = (from + to) / 2;
        const rise = (to - from) / 2;
        const out = (s) => cOf(side, s);

        tiled(side, [[a0 - verge, -lip], [from, -lip], [from, half], [a0 - verge, half]]);
        tiled(side, [[to, -lip], [a1 + verge, -lip], [a1 + verge, half], [to, half]]);
        tiled(side, [[from, 0], [middle, rise], [middle, half], [from, half]]);
        tiled(side, [[middle, rise], [to, 0], [to, half], [middle, half]]);
        eaves(side, a0 - verge, from);
        eaves(side, to, a1 + verge);

        // (The eaves' course's ends, against its walls)
        for (const [a, way] of [[from, 1], [to, -1]]) {
            trims.push({ look: "edge", points: [point(a, out(0), kickUnder(0)), point(a, out(reach), kickUnder(reach)), point(a, out(reach), kickTop(reach)), point(a, out(0), kickTop(0))], out: point(way, 0, 0) });
        }

        // Its slopes, each rising from its own eaves' line (`edge`, `way` in): t how far in
        const front = out(-verge);
        const valley = (t) => out(t);

        for (const [edge, way] of [[from, 1], [to, -1]]) {
            const at = (t) => edge + way * t;
            const corners = [[at(-lip), front, -lip], [middle, front, rise], [middle, valley(rise), rise], [edge, valley(0), 0], [at(-lip), out(-lip), -lip]];

            slopes.push({ points: corners.map(([a, c, t]) => point(a, c, tileAt(t))), uvs: corners.map(([, c, t]) => [uOf(c), vOf(t)]), under: true });
            // (Its verge: the rafters' underside out to it, and its edge)
            trims.push({ look: "soffit", points: [point(at(-lip), out(0), underAt(-lip)), point(middle, out(0), underAt(rise)), point(middle, front, underAt(rise)), point(at(-lip), front, underAt(-lip))] });
            trims.push({ look: "edge", points: [point(at(-lip), front, underAt(-lip)), point(middle, front, underAt(rise)), point(middle, front, tileAt(rise)), point(at(-lip), front, tileAt(-lip))] });
        }

        capAlong(flat(middle, front), flat(middle, valley(rise)), tileAt(rise));
    }
}

/**
 * Whether a house of the layout is built of the kit: a human town's, city's or capital's timber,
 * brick or cottage house, on its street or out behind (a workshop, a shed: most of a city's).
 */
export function kitBuilt(piece, settlement) {
    return piece.kind === "house" && HOUSE_KIT.styles.includes(piece.style ?? "timber") && HOUSE_KIT.settlements.includes(settlement) && (piece.people ?? "human") === "human";
}
