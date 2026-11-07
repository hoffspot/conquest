// The humans' town houses built of the bought house kit (world/art/kits/kithouse.js lays each out
// of its pieces, world/kithouses3d.js draws it; docs/LICENSED_MODELS.md, *The house kit*): its
// modules on the kit's grid, every piece the catalog's, inside its lot, its roof's slopes on the
// line its gables rise along, the same house wherever it's built.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

// (The art's materials paint a canvas: enough of one for them to in Node)
const noop = () => {};
const context = () =>
    new Proxy(
        {
            createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
            createLinearGradient: () => ({ addColorStop: noop }),
            createRadialGradient: () => ({ addColorStop: noop }),
            measureText: (text) => ({ width: String(text).length * 10 }),
        },
        { get: (target, key) => (key in target ? target[key] : noop) },
    );

globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: context }) };

const { planHouse, STYLES } = await import("../client/js/world/art/kits/house.js");
const { HOUSE_KIT, KIT, kitBuilt, kitHouse, ROOFS, runOf, SPANS, spanFor } = await import("../client/js/world/art/kits/kithouse.js");

const CATALOG = JSON.parse(readFileSync(new URL("../client/models/assets.json", import.meta.url))).models;
const EPSILON = 1e-6;

// Houses of every kind the kit builds: its styles, the lots' sizes, one to three storeys, shops,
// a street's and one out behind, each kind of roof
function* houses(count = 40) {
    for (let seed = 0; seed < count; seed++) {
        for (const [w, h] of [[2, 2], [2, 3], [3, 2], [2.5, 2], [3, 3], [1.4, 1.6]]) {
            const style = HOUSE_KIT.styles[seed % HOUSE_KIT.styles.length];
            const back = seed % 7 === 3;
            const plan = planHouse({ w, h, style, storeys: back ? 1 : 1 + (seed % 3), use: seed % 5 === 0 ? "baker" : null, back, seed: seed * 31 + 7, x: seed, y: 0 });

            yield { plan, w, h };
        }
    }
}

describe("The house kit (world/art/kits/kithouse.js)", () => {
    it("is a licensed model in the catalog, fetched only where it's wanted, credited to its seller, each of its pieces a square of its own in it", () => {
        const entry = CATALOG[HOUSE_KIT.asset];

        assert.equal(entry.licensed, true);
        assert.equal(entry.tier, "demand");
        assert.match(entry.label, /Meshsmith Foundry/);
        assert.ok(entry.files[0].path.endsWith(".bin") && entry.files[0].hash && entry.files[0].bytes > 1e6);

        const squares = new Set();

        for (const [name, nodes] of Object.entries(entry.pieces)) {
            const cells = new Set(nodes.map((node) => node.split("@")[1]));

            assert.equal(cells.size, 1, name);
            assert.ok(!squares.has([...cells][0]), `${name} shares its square`);
            squares.add([...cells][0]);

            for (const node of nodes) {
                assert.match(node, /^(walls|fills|glass|RoofTiles_(Red|Slate))@\d+,\d+$/, name);
            }
        }

        assert.deepEqual(entry.pieces.RoofTiles_Red.length, 1);
        assert.deepEqual(entry.pieces.RoofTiles_Slate.length, 1);
    });

    it("lays a run of wall in the kit's modules: 2 m ones, a 1 m one in the middle if it's left, 0.2 m fillers at its ends, end to end and as long as the run", () => {
        for (let length = 4; length <= 16 + EPSILON; length += KIT.filler) {
            for (const fillers of ["both", "end"]) {
                const run = runOf(length, { fillers });
                let at = 0;

                for (const module of run) {
                    assert.ok(Math.abs(module.at - at) < EPSILON, `${length} ${fillers}`);
                    assert.ok([2, 1, KIT.filler].some((width) => Math.abs(module.width - width) < EPSILON), `${length}: ${module.width}`);
                    at += module.width;
                }

                assert.ok(Math.abs(at - length) < 1e-4, `${length} ${fillers}: ${at}`);
                assert.ok(run.filter(({ width }) => width === 1).length <= 1);

                if (fillers === "end") {
                    assert.ok(run.findIndex(({ width }) => width < 1) < 0 || run.slice(run.findIndex(({ width }) => width < 1)).every(({ width }) => width < 1), `${length}: its fillers at its end`);
                }
            }
        }
    });

    it("spans its gables across what its gables are built for", () => {
        assert.deepEqual(SPANS, [4, 5, 6, 8, 10]);
        assert.equal(spanFor(5.9), 5);
        assert.equal(spanFor(6), 6);
        assert.equal(spanFor(9.5), 8);
        assert.equal(spanFor(3), 4);
    });

    it("builds the humans' timber, brick and cottage houses of a town, a city or a capital, on their streets and out behind; not a village's, nor another people's, nor stone", () => {
        for (const settlement of ["town", "city", "capital"]) {
            for (const style of ["timber", "brick", "cottage"]) {
                assert.equal(kitBuilt({ kind: "house", style }, settlement), true, `${settlement} ${style}`);
                assert.equal(kitBuilt({ kind: "house", style, back: true }, settlement), true);
            }

            assert.equal(kitBuilt({ kind: "house", style: "stone" }, settlement), false);
            assert.equal(kitBuilt({ kind: "house", style: "timber", people: "elf" }, settlement), false);
            assert.equal(kitBuilt({ kind: "landmark", style: "timber" }, settlement), false);
        }

        for (const settlement of ["village", "hamlet", "farmstead", undefined]) {
            assert.equal(kitBuilt({ kind: "house", style: "timber" }, settlement), false);
        }
    });

    it("lays every roof the plans give its houses with one of its tiles", () => {
        for (const style of HOUSE_KIT.styles) {
            for (const roof of STYLES[style].roofs) {
                assert.ok(ROOFS[roof], `${style}'s ${roof}`);
                assert.ok(["Red", "Slate"].includes(ROOFS[roof].tiles));
            }
        }
    });

    it("builds each house of the catalog's pieces, turned on the kit's quarters, inside its lot, its roof over it; the same house wherever it's built", () => {
        const pieces = CATALOG[HOUSE_KIT.asset].pieces;
        let count = 0;

        for (const { plan, w, h } of houses()) {
            const built = kitHouse(plan);
            const [lotW, lotD] = [w * 4, h * 4];

            count++;
            assert.ok(built.pieces.length > 20, `${count}: ${built.pieces.length} pieces`);
            assert.ok(built.slopes.length > 0 && built.trims.length > 0 && built.shell.length >= 6);

            for (const { piece, at, turn } of built.pieces) {
                assert.ok(pieces[piece], `${piece} isn't in the kit`);
                assert.ok(Number.isInteger(turn) && turn >= 0 && turn < 4);
                assert.ok(at.every(Number.isFinite));
                // (Its pivot inside the lot, as far as its walls go: the kit's box is the plan's,
                // the walls' frames standing out to it)
                assert.ok(at[0] > -0.4 && at[0] < lotW + 0.4 && at[2] > -0.4 && at[2] < lotD + 0.4, `${piece} at ${at}`);
                assert.ok(at[1] >= -EPSILON && at[1] <= built.height + EPSILON, `${piece} at ${at[1]}`);
            }

            // (The roof's eaves and verges reach no further past its walls than the kit's do)
            for (const { points } of [...built.slopes, ...built.trims]) {
                for (const [x, y, z] of points) {
                    assert.ok(x > built.box[0] - KIT.verge - KIT.kick.reach - EPSILON && x < built.box[1] + KIT.verge + KIT.kick.reach + EPSILON, `${x}`);
                    assert.ok(z > built.box[2] - KIT.verge - KIT.kick.reach - EPSILON && z < built.box[3] + KIT.verge + KIT.kick.reach + EPSILON, `${z}`);
                    assert.ok(y > KIT.plinth && y <= built.height + 0.2, `${y}`);
                }
            }

            assert.deepEqual(kitHouse(plan), built);
        }

        assert.ok(count > 100);
    });

    it("lays every main slope on the line its gables rise along, 1.2 m a metre: the house's from its eaves' walls, a cross gable's and a dormer's from their own walls (a dormer's on its knee, 1.5 m up), a wing's from its own", () => {
        let checked = 0;

        for (const { plan } of houses(30)) {
            const built = kitHouse(plan);
            const top = KIT.plinth + built.storeys * KIT.storey;
            const tiles = top + KIT.line + KIT.tiles;
            const [x0, x1, z0, z1] = built.main;
            // (Where each slope rises from: a line, the way it rises, and the tiles' height there)
            const lines = [
                ...(built.ridge === "x" ? [[[0, z0], [0, 1], tiles], [[0, z1], [0, -1], tiles]] : [[[x0, 0], [1, 0], tiles], [[x1, 0], [-1, 0], tiles]]),
                ...[...(built.cross ? [{ ...built.cross, lift: 0 }] : []), ...built.dormers.map((dormer) => ({ ...dormer, lift: KIT.knee.height }))].flatMap(({ from, to, lift }) =>
                    built.ridge === "x" ? [[[from, 0], [1, 0], tiles + lift], [[to, 0], [-1, 0], tiles + lift]] : [[[0, from], [0, 1], tiles + lift], [[0, to], [0, -1], tiles + lift]],
                ),
                ...(built.wing ? [[[built.wing.box[0], 0], [1, 0], tiles], [[built.wing.box[1], 0], [-1, 0], tiles]] : []),
            ];

            for (const { points, rise } of built.slopes.filter(({ under, rise }) => under && rise)) {
                // (A face's slope from its corners, its normal Newell's way: its rise over its run)
                const n = [0, 0, 0];

                for (const [k, a] of points.entries()) {
                    const b = points[(k + 1) % points.length];

                    n[0] += (a[1] - b[1]) * (a[2] + b[2]);
                    n[1] += (a[2] - b[2]) * (a[0] + b[0]);
                    n[2] += (a[0] - b[0]) * (a[1] + b[1]);
                }

                assert.ok(Math.abs(Math.hypot(n[0], n[2]) / Math.abs(n[1]) - KIT.pitch) < 1e-6, `${built.kind}: its pitch`);

                // (Rising from one of the lines it should, at the tiles' height there, every corner on it)
                const [at, way, base] = lines.find(([[lx, lz], [wx, wz], height]) => Math.abs(wx - rise.way[0]) < EPSILON && Math.abs(wz - rise.way[1]) < EPSILON && Math.abs(height - rise.base) < 1e-6 && (wx ? Math.abs(lx - rise.at[0]) < 1e-6 : Math.abs(lz - rise.at[1]) < 1e-6)) ?? [];

                assert.ok(at, `${built.kind} ${built.ridge}: a slope rising from ${rise.at} ${rise.way} at ${rise.base}, none of its walls'`);

                for (const [x, y, z] of points) {
                    const s = (x - at[0]) * way[0] + (z - at[1]) * way[1];

                    assert.ok(Math.abs(y - (base + KIT.pitch * s)) < 1e-6, `${y} at ${s}`);
                }

                checked++;
            }
        }

        assert.ok(checked > 500, `${checked}`);
    });

    it("builds dormers on a gabled or half-hipped roof's seen sides, each over a 2 m module of its wall, clear of the wall's ends and of each other, its knee and gable of the kit's pieces, its valleys well under the ridge", () => {
        let count = 0;

        for (const { plan } of houses(60)) {
            const built = kitHouse(plan);
            const top = KIT.plinth + built.storeys * KIT.storey;
            const [x0, x1, z0, z1] = built.main;
            const [a0, a1] = built.ridge === "x" ? [x0, x1] : [z0, z1];

            if (!built.dormers.length) {
                continue;
            }

            assert.ok(plan.dormers && ["gable", "half-hip"].includes(built.kind) && built.span >= 5);
            assert.ok(KIT.knee.height / KIT.pitch + 1 <= built.span / 2 - 0.25 + EPSILON, "its valleys under the ridge");

            for (const [k, { side, from, to }] of built.dormers.entries()) {
                count++;
                assert.ok(Math.abs(to - from - 2) < EPSILON);
                assert.ok(from - a0 >= 2 - EPSILON && a1 - to >= 2 - EPSILON, `${from}..${to} in ${a0}..${a1}`);
                assert.ok(built.ridge === "z" || side === 1, "a house across the street's at its front");
                assert.ok(!(built.cross && side === built.cross.side));

                for (const other of built.dormers.slice(k + 1).filter((one) => one.side === side)) {
                    assert.ok(other.from - to >= 1.4 - EPSILON || from - other.to >= 1.4 - EPSILON, "apart");
                }

                // (Its knee's two frames and its gable, on its wall's line)
                const wall = built.ridge === "x" ? z1 : side ? x1 : x0;
                const onIt = ({ at: [x, , z] }) => Math.abs((built.ridge === "x" ? z : x) - wall) < EPSILON && (built.ridge === "x" ? x : z) > from && (built.ridge === "x" ? x : z) < to;
                const mine = built.pieces.filter(onIt);

                assert.equal(mine.filter(({ piece, at }) => piece === "WallFrame_1m_RoofMiddle_Lower" && Math.abs(at[1] - top) < EPSILON).length, 2);
                assert.equal(mine.filter(({ piece }) => /^WallFill_(Stone|Brick)_1m_Half_Window_/.test(piece)).length, 2);
                assert.equal(mine.filter(({ piece, at }) => piece === "WallFrame_2m_RoofPeak_Lower" && Math.abs(at[1] - top - KIT.knee.height) < EPSILON).length, 1);
            }
        }

        assert.ok(count > 40, `${count} dormers`);
    });

    it("builds a wing behind some street houses: across a house's ridge, its roof meeting the back slope in valleys; behind a gable-fronted one, a range a metre in either side against its back gable; the kit's inner corners where they meet, every storey", () => {
        const kinds = {};

        for (const { plan, h } of houses(80)) {
            const built = kitHouse(plan);

            if (!built.wing) {
                continue;
            }

            const { join, span, box: [wx0, wx1, wz0, wz1] } = built.wing;
            const [x0, x1, z0] = built.main;
            const top = KIT.plinth + built.storeys * KIT.storey;

            kinds[`${built.ridge} ${join}`] = (kinds[`${built.ridge} ${join}`] ?? 0) + 1;
            assert.ok(!plan.back);
            assert.ok(Math.abs(wz1 - z0) < EPSILON, "behind the house's back wall");
            assert.ok(wz1 - wz0 >= 2.2 - EPSILON && wz0 - KIT.out >= -EPSILON && wz0 - KIT.out <= h * 4, "deep enough, inside its lot");
            assert.ok(Math.abs(wx1 - wx0 - span) < EPSILON && [4, 5, 6].includes(span) && span <= built.span);

            if (join === "valley") {
                assert.equal(built.ridge, "x");
                assert.ok(wx0 - x0 >= 1.2 - EPSILON && x1 - wx1 >= 1.2 - EPSILON, "set in from the house's ends");
            } else {
                assert.equal(built.ridge, "z");
                assert.equal(built.kind, "gable");
                assert.ok(Math.abs(wx0 - x0 - 1) < EPSILON && Math.abs(x1 - wx1 - 1) < EPSILON, "a metre in either side");
                assert.equal(span, built.span - 2);
            }

            // (Its inner corners: the kit's corner piece, its beam and its foundation, every storey)
            for (const [x, turn] of [[wx0, 2], [wx1, 1]]) {
                const at = ({ at: [px, , pz], turn: t }) => Math.abs(px - x) < EPSILON && Math.abs(pz - z0) < EPSILON && t === turn;

                assert.equal(built.pieces.filter((piece) => piece.piece === "WallFrame_CornerInner" && at(piece)).length, built.storeys);
                assert.equal(built.pieces.filter((piece) => piece.piece === "WallFrame_Beams_01_CornerInner" && at(piece)).length, built.storeys);
                assert.equal(built.pieces.filter((piece) => piece.piece === "Foundation_Smooth_CornerInner" && at(piece)).length, 1);
            }

            // (No wall of the house's storeys left between the wing's: it's open into the wing)
            assert.ok(!built.pieces.some(({ piece, at: [px, py, pz] }) => /^WallFrame_(2m|1m|02m)/.test(piece) && py < top - EPSILON && Math.abs(pz - z0) < EPSILON && px > wx0 + EPSILON && px < wx1 - EPSILON));
        }

        assert.ok(kinds["x valley"] > 5 && kinds["z wall"] > 5, JSON.stringify(kinds));
    });

    it("raises a gable from the fronts of some of its gabled houses of two storeys or more, its middle modules', no wider than its main gables", () => {
        let crossed = 0;

        for (const { plan } of houses(40)) {
            const built = kitHouse(plan);

            if (built.cross) {
                crossed++;
                assert.equal(built.kind, "gable");
                assert.equal(built.ridge, "x");
                assert.ok(built.storeys > 1);

                const width = built.cross.to - built.cross.from;

                assert.ok([4, 5, 6].includes(Math.round(width * 10) / 10), `${width}`);
                assert.ok(width <= built.span + EPSILON);
                // (In the middle of its front, the walls' own either side)
                assert.ok(Math.abs((built.cross.from + built.cross.to) / 2 - (built.box[0] + built.box[1]) / 2) < 1.01);
                assert.ok(built.cross.from > built.box[0] + 1.5 && built.cross.to < built.box[1] - 1.5);
            }
        }

        assert.ok(crossed > 5, `${crossed} crossed`);
    });

    it("gives each house a dark inside facing in, and the roof's underside, so nothing's seen through it", () => {
        const { plan } = houses(1).next().value;
        const built = kitHouse(plan);

        for (const { points, out } of built.shell) {
            assert.ok(points.length >= 3 && out.length === 3);
        }

        assert.ok(built.shell.filter(({ out }) => out[1] === -1).length > built.storeys);
    });
});
