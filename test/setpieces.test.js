import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { layoutCastle } from "../client/js/core/setpieces/castle.js";
import { GROUND, pieceCatalog } from "../client/js/core/setpieces/pieces.js";
import { Plan } from "../client/js/core/setpieces/plan.js";
import { layoutTown } from "../client/js/core/setpieces/town.js";

const SEEDS = Array.from({ length: 30 }, (_, index) => index * 7919 + 3);
const KEYS = new Set(pieceCatalog().map((piece) => piece.key));

// Checks every layout must pass: known pieces, on the grid, not overlapping, and blocking the
// squares they stand on (except passages)
function checkPieces(layout, where) {
    const covered = Array.from({ length: layout.height }, () => new Array(layout.width).fill(0));

    assert.equal(layout.obstructed.length, layout.height, where);
    assert.equal(layout.ground.length, layout.height, where);

    for (const piece of layout.pieces) {
        const catalogued = pieceCatalog().find((entry) => entry.key === piece.key);

        assert.ok(KEYS.has(piece.key), `${where}: ${piece.key} has art`);
        assert.deepEqual([piece.w, piece.h], [catalogued.w, catalogued.h], `${where}: ${piece.key} is its catalogued size`);
        assert.ok(piece.x >= 0 && piece.y >= 0 && piece.x + piece.w <= layout.width && piece.y + piece.h <= layout.height, `${where}: ${piece.key} is on the grid`);

        for (let y = piece.y; y < piece.y + piece.h; y++) {
            for (let x = piece.x; x < piece.x + piece.w; x++) {
                assert.equal(covered[y][x], 0, `${where}: ${piece.key} at ${x},${y} overlaps another piece`);
                covered[y][x] = 1;

                if (!piece.key.startsWith("gatehouse")) {
                    assert.equal(layout.obstructed[y][x], 1, `${where}: ${piece.key} blocks ${x},${y}`);
                }
            }
        }
    }
}

// The squares units can reach from the given squares
function reach(layout, starts) {
    const plan = new Plan(layout.width, layout.height);

    plan.obstructed = layout.obstructed;

    return plan.reachable(starts);
}

describe("castle layouts", () => {
    for (const gate of ["n", "e", "s", "w"]) {
        it(`builds castles facing ${gate}: walls all round, a way in to the keep, and room to move inside`, () => {
            for (const seed of SEEDS) {
                const [width, height] = gate === "n" || gate === "s" ? [16 + (seed % 9), 14 + (seed % 7)] : [14 + (seed % 7), 16 + (seed % 9)];
                const castle = layoutCastle({ width, height, gate, seed });
                const where = `gate ${gate}, seed ${seed}, ${width} x ${height}`;

                assert.equal(castle.width, width, where);
                assert.equal(castle.height, height, where);
                checkPieces(castle, where);

                const count = (prefix) => castle.pieces.filter((piece) => piece.key.startsWith(prefix)).length;

                assert.equal(count("gatehouse"), 1, where);
                assert.equal(castle.pieces.find((piece) => piece.key.startsWith("gatehouse")).key, `gatehouse-${gate}`, where);
                assert.equal(count("keep"), 1, where);
                assert.ok(count("tower") >= 4, `${where}: towers at the corners`);
                assert.ok(count("wall") >= 4, `${where}: walls between them`);

                // The road in starts at the edge the gate faces, and reaches every open square inside
                const edge = { n: ([, y]) => y === 0, s: ([, y]) => y === height - 1, w: ([x]) => x === 0, e: ([x]) => x === width - 1 }[gate];

                assert.ok(castle.entrance.every(edge), `${where}: the road leaves by the ${gate} side`);

                const inside = reach(castle, castle.entrance);
                const keep = castle.pieces.find((piece) => piece.key.startsWith("keep"));
                const besideKeep = [];

                for (let y = keep.y - 1; y <= keep.y + keep.h; y++) {
                    for (let x = keep.x - 1; x <= keep.x + keep.w; x++) {
                        besideKeep.push(inside[y]?.[x] === 1);
                    }
                }

                assert.ok(besideKeep.some(Boolean), `${where}: the keep can be reached`);

                for (let y = 0; y < height; y++) {
                    for (let x = 0; x < width; x++) {
                        if (castle.ground[y][x] === GROUND.courtyard && !castle.obstructed[y][x]) {
                            assert.equal(inside[y][x], 1, `${where}: courtyard square ${x},${y} can be reached`);
                        }
                    }
                }
            }
        });
    }

    it("gives the same castle for the same seed, and different castles for different seeds", () => {
        const options = { width: 22, height: 18, gate: "s" };

        assert.deepEqual(layoutCastle({ ...options, seed: 5 }), layoutCastle({ ...options, seed: 5 }));
        assert.notDeepEqual(layoutCastle({ ...options, seed: 5 }).pieces, layoutCastle({ ...options, seed: 6 }).pieces);
    });

    it("refuses a site too small for a castle", () => {
        assert.throws(() => layoutCastle({ width: 12, height: 12, seed: 1 }), /at least/);
    });
});

describe("town layouts", () => {
    const APPROACHES = [["w", "e"], ["n", "s"], ["w", "e", "s"], ["n", "e", "s", "w"], ["s"], ["e", "n"]];

    for (const approaches of APPROACHES) {
        it(`builds towns entered from ${approaches.join(", ")}: every way in joined, every house on a street`, () => {
            for (const seed of SEEDS) {
                const width = 18 + (seed % 11);
                const height = 16 + (seed % 7);
                const town = layoutTown({ width, height, approaches, seed });
                const where = `${approaches.join("")}, seed ${seed}, ${width} x ${height}`;

                checkPieces(town, where);
                assert.equal(town.entrances.length, approaches.length, where);

                const joined = reach(town, town.entrances[0]);

                for (const cells of town.entrances) {
                    for (const [x, y] of cells) {
                        assert.equal(joined[y][x], 1, `${where}: way in at ${x},${y} is joined to the others`);
                    }
                }

                const street = (x, y) => town.ground[y]?.[x] === GROUND.road || town.ground[y]?.[x] === GROUND.cobbles;

                for (const piece of town.pieces.filter(({ key }) => key.startsWith("house"))) {
                    let front = false;

                    for (let x = piece.x; x < piece.x + piece.w; x++) {
                        front ||= street(x, piece.y - 1) || street(x, piece.y + piece.h);
                    }

                    for (let y = piece.y; y < piece.y + piece.h; y++) {
                        front ||= street(piece.x - 1, y) || street(piece.x + piece.w, y);
                    }

                    assert.ok(front, `${where}: ${piece.key} at ${piece.x},${piece.y} faces a street`);
                }

                // Streets are two squares wide, for tanks
                for (let y = 0; y < height; y++) {
                    for (let x = 0; x < width; x++) {
                        if (town.ground[y][x] === GROUND.road) {
                            // Some 2 x 2 block of street squares includes this one
                            const wide = [[0, 0], [-1, 0], [0, -1], [-1, -1]].some(([dx, dy]) => street(x + dx, y + dy) && street(x + dx + 1, y + dy) && street(x + dx, y + dy + 1) && street(x + dx + 1, y + dy + 1));

                            assert.ok(wide, `${where}: road at ${x},${y} is part of a street two squares wide`);
                        }
                    }
                }
            }
        });
    }

    it("gives the same town for the same seed", () => {
        const options = { width: 24, height: 18, approaches: ["w", "e"] };

        assert.deepEqual(layoutTown({ ...options, seed: 9 }), layoutTown({ ...options, seed: 9 }));
        assert.notDeepEqual(layoutTown({ ...options, seed: 9 }).pieces, layoutTown({ ...options, seed: 10 }).pieces);
    });

    it("refuses a town with no way in", () => {
        assert.throws(() => layoutTown({ width: 20, height: 20, approaches: [] }), /way in/);
    });
});

describe("set piece art", () => {
    it("only uses arithmetic that every browser does the same way (so layouts can be made in multiplayer games)", () => {
        for (const file of ["castle.js", "town.js", "plan.js", "pieces.js"]) {
            const source = readFileSync(new URL(`../client/js/core/setpieces/${file}`, import.meta.url), "utf8").replace(/\/\/.*$/gm, "");

            assert.doesNotMatch(source, /Math\.(random|sin|cos|tan|exp|log|pow|atan|hypot|cbrt|sqrt)\b/, file);
        }
    });

    for (const style of ["smooth", "pixel"]) {
        it(`has ${style} art for every piece (npm run build:art)`, () => {
            const file = new URL(`../client/images/art/setpieces-${style}.json`, import.meta.url);

            assert.ok(existsSync(file), `client/images/art/setpieces-${style}.json exists`);

            const manifest = JSON.parse(readFileSync(file, "utf8"));

            for (const piece of pieceCatalog()) {
                const art = manifest.pieces[piece.key];

                assert.ok(art, `${piece.key} has ${style} art`);
                assert.deepEqual([art.w, art.h], [piece.w, piece.h], piece.key);
                assert.equal(art.sprite.length, 4, piece.key);
                assert.equal(art.shadow.length, 4, piece.key);
                assert.equal(art.at.length, 2, piece.key);
                assert.equal(art.shadowAt.length, 2, piece.key);
            }
        });
    }
});
