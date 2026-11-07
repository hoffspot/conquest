// The specialists' and the masters' shops (shopfront.js SHOPFRONTS) built of the house kit
// (kithouse.js: Meshsmith Foundry's half-timbered building kit, the licensed model
// `scenery-meshsmith-houses`), each in a look of its own (SHOP_LOOKS), the same in every town of
// its people's, so a shop's known by its building wherever it stands: walls of a colour and an
// awning of stripes no house has (art/engine/painters.js TINTS, world/cloth.js SHOP_AWNINGS), its
// fill, its roof, how many storeys it rises and whether they're jettied, its timbers' figure, its
// chimney (a swordsmith's broad forge stack; an alchemist's smoking green), a finial; a master's
// shop the look of its trade's, grander. Each people's shops have looks of their own: the
// humans' are built of the kit; any other people's are its own kit's (art/peoples) till theirs are
// set out here and built.
//
// Its door is the kit's, in the middle of a 2 m module in the middle of its front, its leaf where
// the game has the shop's door (core/insides.js SHOP_DOORS: 1.8 m in from the lot's front, its
// middle). Its name is on a board on the first floor's wall over the door, in front of its frame,
// under the windows either side of it and over the band the ground floor's joists end in; its sign
// hangs from an iron bracket on the first floor's front corner post, out over the street, its board
// across the front so it's seen from up and down the street, clear of the awnings and banners under
// it, the windows beside it, the eaves and jetties over it, and of the lots either side. A striped
// awning over the shop window either side of the door; what it sells set out before them
// (shopfront.js dressShop); a master's banners beyond, and the Mystic Emporium's lanterns by its
// door.
//
// Pure: the same shop from the same piece wherever it's built. Metres, the lot's own frame (as
// kithouse.js): x east from its west edge, y up from its ground, z south from its back (its front
// at +z).

import { SHOP_DOORS } from "../../../core/insides.js";
import { createRandom } from "../../../core/random.js";
import { PLOT, SHOP_LANDMARKS } from "../../../core/setpieces/pieces.js";
import { HOUSE_KIT, KIT, kitHouse, runOf } from "./kithouse.js";

// World pixels in a metre (the art kits')
const P = 5;
const EPSILON = 1e-6;

// The swordsmith's look, and the armorer's: their masters' are theirs, grander
const SWORDSMITH = Object.freeze({
    style: "brick",
    walls: "brick-soot",
    stone: "stone",
    roof: "clay",
    kind: "gable",
    ridge: "x",
    storeys: 2,
    jetty: 0,
    figure: "square",
    braces: Object.freeze({ ends: "H", between: "TTPlus", one: "Plus", gable: "Box", door: "Door_03", ground: "2x3", upper: "2x3", doubled: false, sills: true }),
    glazing: "glass",
    frame: "timber",
    dormers: false,
    cross: false,
    chimney: "forge",
    finial: null,
    awning: "awning-forge",
});

const ARMORER = Object.freeze({
    style: "timber",
    walls: "plaster-steel",
    stone: "stone",
    roof: "slate",
    kind: "hip",
    ridge: "x",
    storeys: 2,
    jetty: 0,
    figure: "close",
    braces: Object.freeze({ ends: "W", between: "M", one: "V", gable: "TX", door: "Door_01", ground: "2x3", upper: "2x3", doubled: false, sills: true }),
    glazing: "glass",
    frame: "timber-grey",
    dormers: false,
    cross: false,
    chimney: "stack",
    finial: null,
    awning: "awning-steel",
});

/**
 * Each people's shops' looks, by people and by shop (pieces.js SHOP_LANDMARKS): what kithouse.js
 * builds each of. `style` its fill (the kit's brick or its stone under the plaster), `walls` its
 * plaster's colour (or brick's), `stone` its ground floor's stone (none: timbered as the rest),
 * `roof` (kithouse.js ROOFS), `kind` (gable, hip or half-hip) and `ridge` ("x": along the street,
 * its eaves to it; "z": its gable to the street), `storeys`, `jetty` (metres each storey stands
 * out over the one under it), `figure` and `braces` (its timbers' patterns: kithouse.js FIGURES'),
 * `glazing`, `frame` (the timber under its eaves), `dormers`, `cross` (a gable rising from its
 * front over the door), `chimney` ("stack", or a smithy's "forge") and its `smoke` (a colour, or
 * none: a hearth's), `finial` (the kit's ornament on its gables' peaks), `awning` (its stripes:
 * cloth.js SHOP_AWNINGS). Only the humans' yet: any other people's shops are their own kits'.
 */
export const SHOP_LOOKS = Object.freeze({
    human: Object.freeze({
        swordsmith: SWORDSMITH,
        armorer: ARMORER,
        scriptorium: Object.freeze({
            style: "timber",
            walls: "plaster-oxblood",
            stone: null,
            roof: "slate-grey",
            kind: "gable",
            ridge: "z",
            storeys: 3,
            jetty: 0.4,
            figure: "braced",
            braces: Object.freeze({ ends: "V", between: "A", one: "XT", gable: "TXX", door: "Door_05", ground: "2x4", upper: "1x3", doubled: true, sills: true }),
            glazing: "leaded",
            frame: "timber",
            dormers: false,
            cross: false,
            chimney: null,
            finial: "Roof_Peak_Ornament_07",
            awning: "awning-ink",
        }),
        alchemist: Object.freeze({
            style: "timber",
            walls: "plaster-sage",
            stone: null,
            roof: "clay-orange",
            kind: "half-hip",
            ridge: "x",
            storeys: 2,
            jetty: 0.2,
            figure: "braced",
            braces: Object.freeze({ ends: "DiagonalLeftRight", between: "X", one: "XT", gable: "DiagonalLeft", door: "Door_02", ground: "2x3", upper: "2x2", doubled: false, sills: false }),
            glazing: "glass",
            frame: "timber-light",
            dormers: true,
            cross: false,
            chimney: "stack",
            smoke: 0x7fd36a,
            finial: null,
            awning: "awning-herb",
        }),
        masterSwordsmith: Object.freeze({
            ...SWORDSMITH,
            storeys: 3,
            figure: "close",
            braces: Object.freeze({ ...SWORDSMITH.braces, ends: "WPlus2", between: "MPlus", one: "V", doubled: true }),
            finial: "Roof_Peak_Ornament_02",
        }),
        masterArmorer: Object.freeze({
            ...ARMORER,
            storeys: 3,
            braces: Object.freeze({ ...ARMORER.braces, doubled: true }),
            cross: true,
            finial: "Roof_Peak_Ornament_08",
        }),
        emporium: Object.freeze({
            style: "timber",
            walls: "plaster-violet",
            stone: null,
            roof: "slate",
            kind: "gable",
            ridge: "x",
            storeys: 3,
            jetty: 0.4,
            figure: "close",
            braces: Object.freeze({ ends: "M", between: "OSPlus", one: "XT", gable: "T", door: "Door_05", ground: "2x3", upper: "2x3", doubled: true, sills: true }),
            glazing: "leaded",
            frame: "timber",
            dormers: true,
            cross: true,
            chimney: null,
            finial: "Roof_Peak_Ornament_04",
            awning: "awning-violet",
        }),
    }),
});

/**
 * Where what's on a shop's front stands (metres): its lot's side margins (the walls at least this
 * far in from its edges), how far back from its lot's back its back wall stands at least, the
 * spans its roof's built across (the kit's: none of 5 m, whose front has no module in its middle
 * for the door), the deepest it's built, its name board (its foot over the first floor's sill,
 * the most it's tall, how far out its back stands from the wall's inner face (in front of its
 * plaster, its posts and braces, all 0.19 m out or less) and how deep it is (its face so in front
 * of the frame's, 0.33 m out), the widest it is for a long name and a short, and how far its frame
 * stays in from the corners' posts), its sign (how
 * far its bracket's top is over the first floor's foot, its board's size, its bracket's reach, its
 * stay's reach up the post), the goods' stand out from the frame (shopfront.js dressShop's 0.55 m)
 * and how far under an awning over them they stay, a master's banners' (either side of the way
 * in, from the door's middle, and out in front of the awnings: their poles' heads past any jetty
 * over them) and the Mystic Emporium's lanterns' (by the door), and the step at its door.
 */
export const SHOP_FRONT = Object.freeze({
    margin: 0.25,
    back: 0.35,
    spans: Object.freeze([4, 6, 8, 10]),
    deepest: 8,
    board: Object.freeze({ over: 0.35, tallest: 0.8, back: 0.2, depth: 0.2, wide: 5, narrow: 4, corner: 0.45 }),
    sign: Object.freeze({ top: 1.85, width: 0.9, height: 1.08, reach: 1.35, above: 0.4 }),
    goods: 0.55,
    under: 0.15,
    banners: Object.freeze({ aside: 1.45, out: 1.3 }),
    lanterns: Object.freeze({ aside: 0.75, out: 0.75 }),
    step: Object.freeze({ half: 0.7, from: 0.22, to: 0.7, height: 0.1 }),
});

/** A shop's look (SHOP_LOOKS), by its people (a human's has none of its own), or null if it has none. */
export function shopLookOf(piece) {
    return (SHOP_LANDMARKS.includes(piece?.name) && SHOP_LOOKS[piece.people ?? "human"]?.[piece.name]) || null;
}

/**
 * Whether a layout's piece is a shop built of the house kit: one of the specialists' or masters'
 * shops of a people whose shops are the kit's (HOUSE_KIT.peoples), in any of their settlements, a
 * village's master's as a city's.
 */
export function kitShopBuilt(piece) {
    return piece?.kind === "landmark" && HOUSE_KIT.peoples.includes(piece.people ?? "human") && Boolean(shopLookOf(piece));
}

// A run of a front `length` long laid out symmetrically about a 2 m module in its middle (its
// door, or its name board over it): each side's modules as kithouse.js runOf lays them, the
// fillers at the corners
export function centredRun(length) {
    const side = (length - 2) / 2;
    const half = runOf(side, { fillers: "end" });

    return [...half.map(({ at, width }) => ({ at: side - at - width, width })).reverse(), { at: side, width: 2 }, ...half.map(({ at, width }) => ({ at: side + 2 + at, width }))];
}

// How long a front can be (a side's length: whole metres, and a filler or two) in `room` metres
// about a door's 2 m module, a side no less than a metre
function frontFor(room) {
    const sides = [4, 3, 2, 1].flatMap((k) => [k + 0.4, k + 0.2, k]);
    const side = sides.find((one) => 2 + 2 * one <= room + EPSILON) ?? 1;

    return Math.round((2 + 2 * side) * 10) / 10;
}

// What's in each module of the front's storey `s` (kithouse.js's kinds): on the ground floor the
// door in the middle, the shop window nearest it either side (its awning over it) and windows
// beyond; on the first floor its name board's plain wall over the door, windows either side;
// windows all along above
function frontKinds(run, s) {
    const door = run.findIndex(({ width }, k) => width === 2 && k === (run.length - 1) / 2);
    const middle = door >= 0 ? door : -1;
    const nearest = (step) => {
        for (let k = middle + step; k >= 0 && k < run.length; k += step) {
            if (run[k].width === 2) {
                return k;
            }
        }

        return -1;
    };
    const shops = s === 0 ? [nearest(-1), nearest(1)] : [];

    return run.map(({ width }, k) => {
        if (width < 1) {
            return "wall";
        }

        if (k === middle && s < 2) {
            return s === 0 ? "door" : "board";
        }

        return shops.includes(k) ? "shop" : "window";
    });
}

// Windows round its sides and back (as kithouse.js kindsOf reads a plan's: each by its middle,
// along its storey's planned wall, in world pixels), a door at the back maybe
function sidesOf(levels, random) {
    const openings = { front: [], back: [], left: [], right: [] };

    for (const side of ["back", "left", "right"]) {
        for (const [s, { box }] of levels.entries()) {
            const [x0, x1, z0, z1] = box.map((v) => v / P);
            const length = side === "back" ? x1 - x0 : z1 - z0;
            const bays = Math.max(1, Math.round((length - 0.6) / 2.7));
            const list = [];

            for (let b = 0; b < bays; b++) {
                const middle = ((b + 0.5) * length) / bays;
                const kind = s === 0 && side === "back" && b === Math.floor(bays / 2) && random.chance(0.45) ? "door" : random.chance(side === "back" ? 0.5 : 0.4) ? "window" : null;

                if (kind) {
                    list.push({ kind, u0: (middle - 0.3) * P, u1: (middle + 0.3) * P, v0: 0, v1: 0 });
                }
            }

            openings[side][s] = list;
        }
    }

    return openings;
}

// The seed a shop's look's own choices come from: where it stands
const seedOf = (piece) => piece.seed ?? Math.round((piece.x ?? 0) * 31 + (piece.y ?? 0) * 17 + 7);

/**
 * A shop's plan for the kit (kithouse.js kitHouse's, as house.js planHouse's is, with its own
 * front: `front` { runs, kinds, cross } its front's modules and what's in each, storey by storey),
 * from its look (SHOP_LOOKS), sized to its lot: its front as long as there's room for about its
 * door, its roof across the deepest of the kit's spans there's room for behind it (no deeper than
 * SHOP_FRONT.deepest); or null if it isn't a kit's shop (kitShopBuilt).
 */
export function kitShopPlan(piece) {
    if (!kitShopBuilt(piece)) {
        return null;
    }

    const look = shopLookOf(piece);
    const door = SHOP_DOORS[piece.people ?? "human"];
    const random = createRandom((seedOf(piece) ^ 0x5409) >>> 0);
    const [width, depth] = [piece.w * PLOT, piece.h * PLOT];
    const n = Math.max(2, look.storeys);
    const jetty = n > 1 ? look.jetty : 0;
    const { out } = KIT;
    // (The ground floor's front's inner face, its door's leaf in it; the top storey's, stepped out
    // by its jetties; how much room there is across and behind)
    const entry = depth - door.depth;
    const front = entry + jetty * (n - 1);
    const roomX = width - 2 * SHOP_FRONT.margin - 2 * out;
    const roomZ = front - SHOP_FRONT.back - out;
    // (Its gable to the street where its lot's as deep as the gable's span, at least)
    const spanIn = (room) => SHOP_FRONT.spans.filter((span) => span <= Math.min(room, SHOP_FRONT.deepest) + EPSILON).at(-1) ?? SHOP_FRONT.spans[0];
    let ridge = look.ridge;

    if (ridge === "z" && Math.min(roomX, roomZ) < SHOP_FRONT.spans[0] - EPSILON) {
        ridge = "x";
    }

    let length;
    let span;
    let long;
    let cross = false;

    if (ridge === "z") {
        span = spanIn(Math.min(roomX, roomZ));
        length = span;
        long = Math.floor((Math.min(roomZ, span * 2) + EPSILON) / KIT.filler) * KIT.filler;
    } else {
        length = frontFor(roomX);
        span = Math.min(spanIn(roomZ), SHOP_FRONT.spans.filter((one) => one <= length + EPSILON).at(-1) ?? SHOP_FRONT.spans[0]);

        // (A cross gable over its door and the modules either side, no wider than the roof's span
        // so its ridge is no higher; a hipped roof's hips clear of it, so no deeper than twice as
        // far as it is from the ends)
        if (look.cross && n > 1) {
            const run = centredRun(length);
            const big = run.filter(({ width: w }) => w >= 1);
            const k = (big.length - 1) / 2;

            if (big.length >= 5 && big.length % 2) {
                const [a, b] = [big[k - 1], big[k + 1]];
                const across = b.at + b.width - a.at;
                const fits = SHOP_FRONT.spans.filter((one) => one >= across - EPSILON && one <= spanIn(roomZ) + EPSILON && (look.kind !== "hip" || one / 2 <= a.at + EPSILON));

                if (fits.length) {
                    span = fits.at(-1);
                    cross = true;
                }
            }
        }

        long = length;
    }

    // The storeys' planned boxes (world pixels, as planHouse's: the walls' outer faces), so the
    // kit's are as wide and deep as these, the top storey's front its jetties out past the ground's
    const [across, deep] = ridge === "x" ? [length, span] : [span, long];
    const bx0 = width / 2 - across / 2 - out;
    const bx1 = width / 2 + across / 2 + out;
    const bz1 = front + out;
    const bz0 = bz1 - deep - 2 * out;
    const levels = Array.from({ length: n }, (_, s) => ({ y: 0, height: 0, box: [bx0, bx1, bz0, bz1 - jetty * (n - 1 - s)].map((v) => v * P) }));
    // (Its front's modules, storey by storey: about its door; a gable front's top storey under its
    // gable's own, as the kit lays them)
    const runs = levels.map((_, s) => (ridge === "z" && s >= 2 ? runOf(across) : centredRun(across)));
    const kinds = runs.map((run, s) => frontKinds(run, s));

    return {
        style: look.style,
        seed: random.int(0, 2 ** 30),
        wealth: 0.8,
        levels,
        ridge,
        kind: look.kind,
        roof: look.roof,
        walls: look.walls,
        frame: look.frame,
        stoneGround: look.stone,
        jetty: jetty * P,
        openings: sidesOf(levels, random),
        attic: false,
        dormers: look.dormers,
        chimney: Boolean(look.chimney),
        glazing: look.glazing,
        figure: look.figure,
        braces: look.braces,
        finial: look.finial,
        awning: look.awning,
        tint: [1, 1, 1],
        back: false,
        wing: false,
        use: piece.name,
        facing: piece.facing,
        look: { stack: look.chimney === "forge" ? "brick-soot" : "stone" },
        front: { runs, kinds, cross },
        shop: { name: piece.name, look, entry, door, span, length },
    };
}

/**
 * A shop built of the kit (kitShopPlan's plan, kitHouse built), and where what's on its front
 * stands (metres, the lot's frame; null if it isn't a kit's shop):
 *
 * - `door`: its middle (x), its leaf's face (z), its width, height and sill;
 * - `board`: its name board on the first floor's wall over the door, x0..x1 along it, y0..y1 up
 *   it, its back `z` (in front of the plaster) and its `depth` (its face in front of the frame);
 * - `sign`: its sign's bracket on the corner post (`x` its middle, `z` the post's front face, `side`
 *   -1 west or 1 east), its bracket's `top`, its board's `width` and `height`, its `reach`, and
 *   how far up the post its stay's tied (`above`), with `box` what it takes up ([x0, x1, y0, y1,
 *   z0, z1]);
 * - `awnings` (as kithouse.js extras'), `goods` (where dressShop sets them: the door's middle, the
 *   frame's face, how far out either side, how high they may stand under an awning, and the
 *   banners' and lanterns', or null);
 * - `step`: the stone at its door, [x0, x1, y1, z0, z1].
 */
export function kitShop(piece) {
    const plan = kitShopPlan(piece);

    if (!plan) {
        return null;
    }

    const built = kitHouse(plan);
    const { look, entry, door } = plan.shop;
    const [gx0, gx1] = built.main;
    const middle = (gx0 + gx1) / 2;
    const n = built.storeys;
    const jetty = built.jetty;
    const faceOf = (s) => entry + jetty * s + KIT.out;
    const first = KIT.plinth + KIT.storey;
    const random = createRandom((plan.seed ^ 0x51a9) >>> 0);

    // Its name over the door, on the first floor's wall: as tall as its width has it (as
    // landmarks.js overDoor's), no taller than there's room for under the windows either side,
    // clear of the corners' posts
    const name = piece.name;
    const length = gx1 - gx0;
    const { board: B, sign: S } = SHOP_FRONT;
    const wide = Math.min(SHOPNAMES_LONG.includes(name) ? B.wide : B.narrow, length - 2 * B.corner - 0.24);
    const y0 = first + B.over;
    const board = { x0: middle - wide / 2, x1: middle + wide / 2, y0, y1: y0 + Math.min((wide * 9) / 56, B.tallest), z: faceOf(1) - KIT.out + B.back, depth: B.depth };

    // Its sign on the first floor's corner post, nearest the door (either: the door's in the
    // middle), out over the street
    const side = random.chance(0.5) ? 1 : -1;
    const post = side > 0 ? gx1 + KIT.out / 2 : gx0 - KIT.out / 2;
    const top = first + S.top;
    const near = S.reach * 0.22;
    const sign = {
        x: post,
        z: faceOf(1),
        side,
        top,
        width: S.width,
        height: S.height,
        reach: S.reach,
        above: S.above,
        box: [post - 0.05, post + 0.05, top - 0.06 - S.height, top + S.above, faceOf(1), faceOf(1) + Math.max(S.reach, near + S.width) + 0.05],
    };

    // What's set out before it: before the shop windows either side of the door (or the windows
    // beside it), under their awnings; a master's banners either side of the way in, out in front
    // of the awnings; the Mystic Emporium's lanterns by the door
    const run = plan.front.runs[0];
    const kinds = plan.front.kinds[0];
    const shops = run.filter((_, k) => kinds[k] === "shop").map(({ at, width }) => Math.abs(gx0 + at + width / 2 - middle));
    const aside = shops.length ? Math.min(...shops) : 1.5;
    const awnings = built.extras.awnings;
    const goodsAt = faceOf(0) + SHOP_FRONT.goods;
    // (How high an awning is over where the goods stand: kithouses3d.js hangs it from 0.36 m out
    // of the wall's inner face, falling AWNING.fall over AWNING.depth)
    const under = awnings.length ? Math.min(...awnings.map(({ y }) => y - (AWNING.fall * (goodsAt - (entry + AWNING.back))) / AWNING.depth)) - SHOP_FRONT.under : null;
    const banners = SHOPFRONT_MASTERS.includes(name) ? { aside: SHOP_FRONT.banners.aside, out: SHOP_FRONT.banners.out } : null;
    const lanterns = name === "emporium" ? { aside: SHOP_FRONT.lanterns.aside, out: SHOP_FRONT.lanterns.out } : null;
    const { step: T } = SHOP_FRONT;

    // A forge's chimney broad, at the end of its ridge, always smoking, thick
    if (built.extras.chimney && look.chimney === "forge") {
        const chimney = built.extras.chimney;
        const end = side > 0 ? gx0 + 0.9 : gx1 - 0.9;

        built.extras.chimney = { ...chimney, ...(built.ridge === "x" ? { x: end } : {}), w: 1.1, d: 0.9, height: chimney.height + 0.3, name: "brick-soot", smoke: 1.6 };
    } else if (built.extras.chimney && look.smoke) {
        built.extras.chimney = { ...built.extras.chimney, smoke: 1.2, tint: look.smoke };
    }

    return {
        plan,
        built,
        look,
        storeys: n,
        door: { x: middle, z: entry, width: door.width, height: door.height, floor: door.floor },
        board,
        sign,
        awnings,
        goods: { x0: middle, z: faceOf(0), aside, under, banners, lanterns },
        step: [middle - T.half, middle + T.half, T.height, faceOf(0) - KIT.out + T.from, faceOf(0) - KIT.out + T.to],
    };
}

/** A shop's awning as it's hung (kithouses3d.js): from this far out of the wall's inner face, this deep, falling this far, its valance this deep. */
export const AWNING = Object.freeze({ back: 0.36, depth: 0.9, fall: 0.35, skirt: 0.2 });

// The shops with long names (a wider board), and the masters' (banners)
const SHOPNAMES_LONG = Object.freeze(["scriptorium", "masterSwordsmith", "masterArmorer", "emporium"]);
const SHOPFRONT_MASTERS = Object.freeze(["masterSwordsmith", "masterArmorer", "emporium"]);
