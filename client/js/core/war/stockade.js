// An army's camp as it stands in the world (docs/WAR.md M22, *The stockade*): a square palisade of
// stakes round it, a gate in its front (towards what it's pitched against) and one in its back, a
// walkway along the inside of its wall to fight from, a lane inside that, and the camp within: its
// fire in the middle, its tents in rows either side of the street from gate to gate behind it, and
// its parade ground before it, where its army stands. Each of its walls is in sections, any of them
// broken open by an assault beaten off (war.js `breaches`, #pressed) and mended again in quiet
// (#mend); the order they break in is the camp's own, the same every time.
//
// Squares of the world (1 m, each [x, y] its corner), set square to the world's lie whichever way
// it faces: the world's squares under it (core/overworld.js setStockades) and what's drawn
// (world/stockades3d.js) are both worked out from here. Pure numbers, as the war is.

import { atan2, hypot } from "../exact.js";
import { landAt } from "../worldplan/plan.js";
import { WATER } from "../worldplan/terrain.js";

/**
 * Its size and parts, in squares: from its middle out to its wall (`half`: 45 squares across, its
 * wall's line 44 m from side to side); how far either side of the middle each gate's open
 * (`gate`: 3 squares wide); its walkway (`walk`, squares in from the wall) and the lane inside
 * it (`lane`, squares wide); how many squares each section of wall is (`section`); how far round
 * its wall the ground's cleared (`clear`, metres: no trees, no crops); how far out from the
 * fire towards the front gate its army stands (`parade`).
 */
export const STOCKADE = Object.freeze({ half: 22, gate: 1, walk: 1, lane: 3, section: 4, clear: 6, parade: 8 });

/**
 * The ground its people tread bare, in squares out from its middle: its street from gate to gate
 * (`street`, either side of the middle) and its parade ground before the fire (`parade`: from
 * and to, out towards the front gate, and either side).
 */
const TRODDEN = Object.freeze({ street: 2, parade: Object.freeze({ from: 2, to: 16, across: 13 }) });

/**
 * The four ways a stockade can face, square to the world: its front gate's side, as a step out
 * from the middle ([dx, dy]): north (+y), east (+x), south (-y), west (-x).
 */
export const SIDES = Object.freeze([Object.freeze([0, 1]), Object.freeze([1, 0]), Object.freeze([0, -1]), Object.freeze([-1, 0])]);

/** The way something faces (battle.js: radians from +y, turning towards +x), looking along (dx, dy). */
const facingAlong = (dx, dy) => atan2(dx, dy);

// A number from an id, the same every time
const hashOf = (id) => [...String(id)].reduce((hash, character) => (Math.imul(hash, 31) + character.charCodeAt(0)) | 0, 7) >>> 0;

/**
 * The side a camp at `at` faces (an index into SIDES): the one most towards `toward` ([x, y], what
 * it's pitched against), or, with nothing to face, its id's own.
 */
export function frontOf(id, at, toward = null) {
    if (!toward || hypot(toward[0] - at[0], toward[1] - at[1]) < 1) {
        return hashOf(id) % SIDES.length;
    }

    const [dx, dy] = [toward[0] - at[0], toward[1] - at[1]];

    return Math.abs(dy) >= Math.abs(dx) ? (dy >= 0 ? 0 : 2) : dx >= 0 ? 1 : 3;
}

/**
 * Whether a stockade round `at` would stand on dry land, off the roads (the plan's, at its middle,
 * corners and the middles of its sides), clear of the settlements (`places`: { at, radius }).
 */
export function standsAt(plan, at, places = plan.places) {
    const reach = STOCKADE.half + STOCKADE.clear;
    const points = [[0, 0], ...[-1, 0, 1].flatMap((dx) => [-1, 0, 1].map((dy) => [dx, dy])).filter(([dx, dy]) => dx || dy)].map(([dx, dy]) => [at[0] + dx * reach, at[1] + dy * reach]);

    if (points.some(([x, y]) => {
        const land = landAt(plan, x, y);

        return land.water !== WATER.none || land.road || land.biome === "sea";
    })) {
        return false;
    }

    return !places.some((place) => hypot(place.at[0] - at[0], place.at[1] - at[1]) < place.radius + reach * Math.SQRT2);
}

/**
 * A camp's stockade ({ id, at, front: an index into SIDES }), laid out: its middle square
 * (`middle`: [x, y], its corner) and the box of squares it stands over (`box`: [x0, y0, x1, y1],
 * inclusive); its two `gates` ({ side, squares, at, facing }: at, the middle of the gap in its
 * wall, facing out); its `sections` of wall, in the order they break open (each { side, wall,
 * walk: its squares of wall and of walkway behind them, at: its middle, along: the way its wall
 * runs }); the squares of its `corners` and of the walkway's (`corners`: { wall, walk }); and the
 * camp within, in metres: its `fire`, its `tents` ({ at, facing }: each facing the street), its
 * sentries' `posts` ({ at, facing }: by each gate first, facing out), and where its army stands
 * (`parade`: { at, facing }, facing the front gate); and the ground trodden bare (`trodden`:
 * boxes of squares, its street's and its parade ground's).
 */
export function stockadeOf({ id, at, front = 0 }) {
    const { half, gate, walk, section } = STOCKADE;
    const [cx, cy] = [Math.floor(at[0]), Math.floor(at[1])];
    const [fx, fy] = SIDES[front];
    // (Across it, to the right looking out of its front gate)
    const [rx, ry] = [fy, -fx];
    // A square, from steps out of the middle along its front and across it
    const square = (u, v) => [cx + u * fx + v * rx, cy + u * fy + v * ry];
    // A point in metres, likewise (from the middle of its middle square)
    const point = (u, v) => [cx + 0.5 + u * fx + v * rx, cy + 0.5 + u * fy + v * ry];
    // Its sides, each as the way out of it, in steps along its front and across it: front, right, back, left
    const sides = [[1, 0], [0, 1], [-1, 0], [0, -1]].map(([su, sv], k) => ({ k, su, sv, gated: k % 2 === 0 }));
    const sideOf = ({ su, sv }) => SIDES.findIndex(([dx, dy]) => dx === su * fx + sv * rx && dy === su * fy + sv * ry);
    // A side's square `t` along it (at `out` steps from the middle: its wall's, or its walkway's)
    const along = ({ su, sv }, t, out) => (su ? square(su * out, t) : square(t, sv * out));
    const sections = [];
    const gates = [];

    for (const side of sides) {
        const runs = side.gated ? [[-(half - 1), -(gate + 1)], [gate + 1, half - 1]] : [[-(half - 1), -(gate + 1)], [-gate, gate], [gate + 1, half - 1]];

        for (const [from, to] of runs) {
            // (Each run into sections of its length; one of 3, in the middle of a side with no gate)
            for (let t = from; t <= to; t += section) {
                const end = Math.min(to, t + section - 1);
                const ts = Array.from({ length: end - t + 1 }, (_, k) => t + k);
                const middle = (t + end) / 2;

                sections.push({
                    side: sideOf(side),
                    wall: ts.map((each) => along(side, each, half)),
                    // (Not the walkway's corners: its corners', below)
                    walk: ts.filter((each) => Math.abs(each) < half - walk).map((each) => along(side, each, half - walk)),
                    at: side.su ? point(side.su * half, middle) : point(middle, side.sv * half),
                    along: side.su ? facingAlong(rx, ry) : facingAlong(fx, fy),
                });
            }
        }

        if (side.gated) {
            const ts = Array.from({ length: gate * 2 + 1 }, (_, k) => k - gate);

            gates.push({ side: sideOf(side), squares: ts.map((t) => along(side, t, half)), at: point(side.su * half, 0), facing: facingAlong(side.su * fx, side.su * fy) });
        }
    }

    // (The order they break in: the camp's own, shuffled by its id)
    let seed = hashOf(id) || 1;

    for (let k = sections.length - 1; k > 0; k--) {
        seed ^= seed << 13;
        seed ^= seed >>> 17;
        seed ^= seed << 5;
        seed >>>= 0;

        const j = seed % (k + 1);

        [sections[k], sections[j]] = [sections[j], sections[k]];
    }

    const corners = { wall: [], walk: [] };
    // A box of squares, from two corners in steps along its front and across it
    const boxOf = (u0, v0, u1, v1) => {
        const [[ax, ay], [bx, by]] = [square(u0, v0), square(u1, v1)];

        return [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)];
    };
    const { parade } = TRODDEN;

    for (const u of [-1, 1]) {
        for (const v of [-1, 1]) {
            corners.wall.push(square(u * half, v * half));
            corners.walk.push(square(u * (half - walk), v * (half - walk)));
        }
    }

    // The camp within: its tents in two rows either side of the street behind the fire, each
    // facing the street; its sentries by its gates, facing out, and on the lane either side
    const tents = [5, 10, 15].flatMap((back) => [5, 10].flatMap((out) => [-1, 1].map((v) => ({ at: point(-back, v * out), facing: facingAlong(-v * rx, -v * ry) }))));
    const lane = half - walk - 2;
    const posts = [
        ...[-1, 1].map((v) => ({ at: point(lane, v * (gate + 2)), facing: facingAlong(fx, fy) })),
        ...[-1, 1].map((v) => ({ at: point(-lane, v * (gate + 2)), facing: facingAlong(-fx, -fy) })),
        ...[-1, 1].map((v) => ({ at: point(0, v * lane), facing: facingAlong(v * rx, v * ry) })),
    ];

    return {
        id,
        front,
        middle: [cx, cy],
        box: [cx - half, cy - half, cx + half, cy + half],
        gates,
        sections,
        corners,
        fire: point(0, 0),
        tents,
        posts,
        parade: { at: point(STOCKADE.parade, 0), facing: facingAlong(fx, fy) },
        trodden: [boxOf(-(half - 1), -TRODDEN.street, half - 1, TRODDEN.street), boxOf(parade.from, -parade.across, parade.to, parade.across)],
    };
}

/**
 * The squares a stockade stands over with so many of its sections broken open (`breaches`): its
 * `wall`'s (blocked, solid, and none can see through) and its `walk`way's (blocked and solid), as
 * [[x, y], ...]; the gates' and the breaches' left open.
 */
export function squaresOf(stockade, breaches = 0) {
    const standing = stockade.sections.slice(Math.max(0, breaches));

    return {
        wall: [...stockade.corners.wall, ...standing.flatMap(({ wall }) => wall)],
        walk: [...stockade.corners.walk, ...standing.flatMap(({ walk }) => walk)],
    };
}
