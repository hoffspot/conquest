import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { layoutCastle } from "../client/js/core/setpieces/castle.js";
import { atan2, cos, sin, sqrt } from "../client/js/core/setpieces/exact.js";
import { GROUND, pieceCatalog, PLOT } from "../client/js/core/setpieces/pieces.js";
import { Plan } from "../client/js/core/setpieces/plan.js";
import { footprint, layoutTown, PEOPLE_TOWNS, SETTLEMENT_KINDS } from "../client/js/core/setpieces/town.js";

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

describe("town layouts (town.js)", () => {
    const KINDS = Object.keys(SETTLEMENT_KINDS);
    const TOWNS = KINDS.flatMap((kind) => Array.from({ length: kind === "capital" ? 3 : kind === "city" ? 6 : 16 }, (_, k) => ({ kind, seed: k * 7919 + 11 })));
    const layouts = new Map(TOWNS.map(({ kind, seed }) => [`${kind} ${seed}`, layoutTown({ kind, seed })]));

    // A street: road or cobbles, or the middle (a market, a hamlet's green, a farmstead's yard)
    const inPolygon = (corners, px, py) => {
        let inside = false;

        for (let k = 0, last = corners.length - 1; k < corners.length; last = k++) {
            const [[ax, ay], [bx, by]] = [corners[k], corners[last]];

            if (ay > py !== by > py && px < ((bx - ax) * (py - ay)) / (by - ay) + ax) {
                inside = !inside;
            }
        }

        return inside;
    };
    const street = (town, x, y) => town.ground[y]?.[x] === GROUND.road || town.ground[y]?.[x] === GROUND.cobbles || inPolygon(town.market.corners, x + 0.5, y + 0.5);

    // The squares that can be walked to from a square, round corners only where both sides are open
    function walk(town, [x0, y0]) {
        const seen = new Uint8Array(town.width * town.height);
        const queue = [[x0, y0]];

        seen[y0 * town.width + x0] = 1;

        for (let k = 0; k < queue.length; k++) {
            const [x, y] = queue[k];

            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const [nx, ny] = [x + dx, y + dy];

                if (nx >= 0 && ny >= 0 && nx < town.width && ny < town.height && !town.blocked[ny][nx] && !seen[ny * town.width + nx]) {
                    seen[ny * town.width + nx] = 1;
                    queue.push([nx, ny]);
                }
            }
        }

        return (x, y) => seen[y * town.width + x] === 1;
    }

    // Where people gather: the free square nearest the market's middle
    const market = (town) => {
        const [cx, cy] = town.centre.map(Math.floor);

        for (let r = 0; r < 20; r++) {
            for (let y = cy - r; y <= cy + r; y++) {
                for (let x = cx - r; x <= cx + r; x++) {
                    if (!town.blocked[y][x]) {
                        return [x, y];
                    }
                }
            }
        }

        return null;
    };

    it("lays out villages, towns and cities, the same for the same seed and different for another", () => {
        for (const kind of KINDS) {
            assert.deepEqual(layoutTown({ kind, seed: 9 }), layoutTown({ kind, seed: 9 }));
            assert.notDeepEqual(layoutTown({ kind, seed: 9 }).pieces, layoutTown({ kind, seed: 10 }).pieces);
        }

        assert.throws(() => layoutTown({ kind: "metropolis" }), /No such kind/);
    });

    it("builds more the bigger the place, with its landmarks round the market", () => {
        const least = { farmstead: 3, hamlet: 3, village: 5, town: 20, city: 45, capital: 90 };
        const landmarks = new Map();

        for (const { kind, seed } of TOWNS) {
            const town = layouts.get(`${kind} ${seed}`);
            const houses = town.pieces.filter((piece) => piece.kind === "house").length;
            const names = town.pieces.filter((piece) => piece.kind === "landmark").map(({ name }) => name);

            assert.ok(houses >= least[kind], `${kind} ${seed}: ${houses} houses`);

            // A tavern in every place but a farmstead; and a church, a smithy and a guild in
            // every village and bigger
            assert.equal(names.includes("tavern"), kind !== "farmstead", `${kind} ${seed}: a tavern`);

            for (const name of ["church", "blacksmith", "guild"]) {
                assert.equal(names.includes(name), kind !== "farmstead" && kind !== "hamlet", `${kind} ${seed}: a ${name}`);
            }

            // (A farmstead is its farmhouse and its barns)
            if (kind === "farmstead") {
                assert.equal(town.pieces.filter((piece) => piece.kind === "house" && !piece.back).length, 1);
            }

            // Each tavern named, and every landmark that can be gone into with an id of its own
            const ids = town.pieces.filter(({ id }) => id).map(({ id }) => id);

            assert.equal(new Set(ids).size, ids.length);

            for (const piece of town.pieces.filter(({ name }) => name === "tavern")) {
                assert.match(piece.tavern.name, /^The [A-Z]/);
                assert.ok(piece.tavern.storeys >= 1 && piece.tavern.storeys <= 2);
            }
            assert.equal(town.width, 2 * Math.round(SETTLEMENT_KINDS[kind].radius + SETTLEMENT_KINDS[kind].fields));

            for (const name of names) {
                landmarks.set(`${kind} ${name}`, (landmarks.get(`${kind} ${name}`) ?? 0) + 1);
            }
        }

        // (Most towns and cities have a church and a smithy too, and a windmill at the edge)
        assert.ok(landmarks.get("town church") >= 12 && landmarks.get("town blacksmith") >= 12, JSON.stringify([...landmarks]));
        assert.ok(landmarks.get("city market") >= 3, JSON.stringify([...landmarks]));
    });

    it("joins every street to the market, and every way out to every other", () => {
        for (const { kind, seed } of TOWNS) {
            const town = layouts.get(`${kind} ${seed}`);
            const where = `${kind} ${seed}`;
            const reached = walk(town, market(town));

            for (const [x, y] of town.exits) {
                assert.ok(reached(Math.floor(x), Math.floor(y)), `${where}: the way out at ${x}, ${y}`);
            }

            // (But for the well and stalls on the market, nothing stands on a street)
            const props = new Set();

            for (const piece of town.pieces.filter(({ kind: k }) => k === "prop")) {
                const corners = footprint(piece, -(piece.w * PLOT) / 4);

                for (let y = Math.floor(piece.y - 4); y <= piece.y + 4; y++) {
                    for (let x = Math.floor(piece.x - 4); x <= piece.x + 4; x++) {
                        if (inside(corners, x + 0.5, y + 0.5)) {
                            props.add(y * town.width + x);
                        }
                    }
                }
            }

            for (let y = 0; y < town.height; y++) {
                for (let x = 0; x < town.width; x++) {
                    if (street(town, x, y) && !props.has(y * town.width + x)) {
                        assert.equal(town.blocked[y][x], 0, `${where}: nothing stands on the street at ${x}, ${y}`);
                        assert.ok(reached(x, y), `${where}: the street at ${x}, ${y} is joined to the market`);
                    }
                }
            }
        }
    });

    it("turns each house to face its street, at every angle, with its front door walked up to from the market", () => {
        const facings = new Set();

        for (const { kind, seed } of TOWNS) {
            const town = layouts.get(`${kind} ${seed}`);
            const where = `${kind} ${seed}`;
            const reached = walk(town, market(town));

            for (const piece of town.pieces.filter(({ kind: k, back, name }) => (k === "house" || k === "landmark") && !back && name !== "windmill")) {
                // Just in front of its front (3.5 metres at most: set back where the street bends),
                // a street (or the market) the market can be walked to
                const [s, c] = [Math.sin(piece.facing), Math.cos(piece.facing)];
                const near = [0.8, 1.6, 2.4, 3.2, 4].some((ahead) => {
                    const out = (piece.h * PLOT) / 2 + ahead;
                    const [x, y] = [Math.floor(piece.x + s * out), Math.floor(piece.y + c * out)];

                    return street(town, x, y) && reached(x, y);
                });

                assert.ok(near, `${where}: ${piece.key} at ${piece.x.toFixed(1)}, ${piece.y.toFixed(1)} faces a street`);
                facings.add(Math.round((((piece.facing % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) * 10));
            }
        }

        // (Not only north, south, east and west)
        assert.ok(facings.size > 40, `${facings.size} ways faced`);
    });

    it("never stands one building on another, or on a street, and blocks the squares under each", () => {
        for (const { kind, seed } of TOWNS) {
            const town = layouts.get(`${kind} ${seed}`);
            const where = `${kind} ${seed}`;
            const owner = new Int32Array(town.width * town.height).fill(-1);

            town.pieces.forEach((piece, k) => {
                if (piece.kind === "tree") {
                    return;
                }

                const corners = footprint(piece, piece.kind === "prop" ? -(piece.w * PLOT) / 4 : -0.3);
                const xs = corners.map(([x]) => x);
                const ys = corners.map(([, y]) => y);

                for (const [x, y] of corners) {
                    assert.ok(x >= 0 && y >= 0 && x <= town.width && y <= town.height, `${where}: ${piece.key} on the layout`);
                }

                for (let y = Math.floor(Math.min(...ys)); y < Math.ceil(Math.max(...ys)); y++) {
                    for (let x = Math.floor(Math.min(...xs)); x < Math.ceil(Math.max(...xs)); x++) {
                        if (inside(corners, x + 0.5, y + 0.5)) {
                            assert.equal(owner[y * town.width + x], -1, `${where}: ${piece.key} and ${town.pieces[owner[y * town.width + x]]?.key} both on ${x}, ${y}`);
                            assert.ok(!street(town, x, y) || piece.kind === "prop", `${where}: ${piece.key} on a street at ${x}, ${y}`);
                            owner[y * town.width + x] = k;

                            // (But for the way to the tavern's door, cleared by world.js)
                            assert.equal(town.blocked[y][x], 1, `${where}: ${piece.key} blocks ${x}, ${y}`);
                            assert.equal(town.opaque[y][x], piece.kind === "prop" ? 0 : 1, `${where}: ${piece.key} hides what's behind it at ${x}, ${y}, or not`);
                        }
                    }
                }
            });
        }
    });

    it("sends its main streets the ways it's asked, as near as it can", () => {
        for (const seed of [1, 2, 3, 4, 5]) {
            const exits = [0.3, 2.2, 4.1].map((angle) => angle + seed * 0.1);
            const town = layoutTown({ kind: "town", seed, exits });

            assert.equal(town.exits.length, 3);

            exits.forEach((angle, k) => {
                const [x, y] = town.exits[k];
                const off = Math.abs(((Math.atan2(y - town.centre[1], x - town.centre[0]) - angle + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);

                assert.ok(off < 0.6, `seed ${seed}: way ${k} ${off.toFixed(2)} off`);
            });
        }

        // Ways close together are one
        assert.equal(layoutTown({ kind: "town", seed: 1, exits: [0, 0.3, Math.PI] }).exits.length, 2);
    });

    it("lays out each people's settlements its own way: its houses, its wall, the lizard folk's lagoon", () => {
        const TYPES = { cat: ["hut", "twin", "block", "townhouse", "compound"], orc: ["roundhut", "block", "longhouse"], lizard: ["marsh", "deck", "saddle", "reed"], elf: ["ground", "pagoda", "trunk", "canopy"], darkElf: ["pod", "thorn", "spire"] };

        for (const people of Object.keys(PEOPLE_TOWNS).filter((name) => name !== "human")) {
            for (const kind of KINDS) {
                for (const seed of [3, 11]) {
                    const where = `${people} ${kind} ${seed}`;
                    const town = layoutTown({ kind, seed, people });
                    const names = town.pieces.filter((piece) => piece.kind === "landmark").map(({ name }) => name);
                    const reached = walk(town, market(town));

                    assert.deepEqual(town, layoutTown({ kind, seed, people }), where);
                    assert.equal(town.people, people);

                    // Its landmarks, as any people's
                    assert.equal(names.includes("tavern"), kind !== "farmstead", `${where}: a tavern`);

                    for (const name of ["church", "blacksmith", "guild"]) {
                        assert.equal(names.includes(name), kind !== "farmstead" && kind !== "hamlet", `${where}: a ${name}`);
                    }

                    // Everything built its people's, each house one of its kinds
                    for (const piece of town.pieces.filter(({ kind: k }) => k !== "tree")) {
                        assert.equal(piece.people, people, `${where}: ${piece.key} is ${people}`);
                    }

                    for (const piece of town.pieces.filter(({ kind: k, back }) => k === "house" && !back)) {
                        assert.ok(TYPES[people].includes(piece.type), `${where}: a ${piece.type} house`);
                    }

                    // Walled from its size up, a gate on each main street, every way out still reached
                    const walled = SETTLEMENT_KINDS[kind].radius >= PEOPLE_TOWNS[people].wall;

                    assert.equal(town.pieces.some((piece) => piece.kind === "wall"), walled, `${where}: walled`);
                    assert.equal(town.pieces.filter((piece) => piece.kind === "gatehouse").length > 0, walled, `${where}: gated`);

                    for (const [x, y] of town.exits) {
                        assert.ok(reached(Math.floor(x), Math.floor(y)), `${where}: the way out at ${x}, ${y}`);
                    }

                    // (The lizard folk's houses over water, which no one walks on but by the plank walks)
                    if (people === "lizard") {
                        assert.ok(town.water.some((row) => row.includes(1)), `${where}: water`);
                        assert.ok(town.walks.length > 0, `${where}: plank walks`);

                        for (let y = 0; y < town.height; y++) {
                            for (let x = 0; x < town.width; x++) {
                                if (town.water[y][x] && town.ground[y][x] !== GROUND.planks) {
                                    assert.equal(town.blocked[y][x], 1, `${where}: water at ${x}, ${y}`);
                                }
                            }
                        }

                        if (kind !== "farmstead" && kind !== "hamlet") {
                            assert.ok(town.pieces.some((piece) => piece.water), `${where}: a house over the water`);
                        }
                    } else {
                        assert.equal(town.water, null);
                        assert.deepEqual(town.walks, []);
                    }
                }
            }
        }
    });
});

// Is a point inside a polygon?
function inside(corners, px, py) {
    let within = false;

    for (let k = 0, last = corners.length - 1; k < corners.length; last = k++) {
        const [[ax, ay], [bx, by]] = [corners[k], corners[last]];

        if (ay > py !== by > py && px < ((bx - ax) * (py - ay)) / (by - ay) + ax) {
            within = !within;
        }
    }

    return within;
}

describe("exact arithmetic (exact.js)", () => {
    it("works out sines, cosines, arctangents and square roots as Math does, near enough", () => {
        for (let angle = -12; angle < 12; angle += 0.0931) {
            assert.ok(Math.abs(sin(angle) - Math.sin(angle)) < 1e-10 && Math.abs(cos(angle) - Math.cos(angle)) < 1e-10, `${angle}`);
            assert.ok(Math.abs(atan2(Math.sin(angle) * 3, Math.cos(angle) * 3) - Math.atan2(Math.sin(angle), Math.cos(angle))) < 1e-12, `${angle}`);
        }

        for (let value = 1e-4; value < 1e7; value *= 1.7) {
            assert.ok(Math.abs(sqrt(value) - Math.sqrt(value)) <= Math.sqrt(value) * 1e-15, `${value}`);
        }

        assert.deepEqual([sqrt(0), sqrt(-1), atan2(0, 0)], [0, 0, 0]);
    });
});

describe("set piece art", () => {
    it("only uses arithmetic that every browser does the same way (so layouts can be made in multiplayer games)", () => {
        for (const file of ["castle.js", "town.js", "plan.js", "pieces.js", "exact.js"]) {
            const source = readFileSync(new URL(`../client/js/core/setpieces/${file}`, import.meta.url), "utf8").replace(/\/\/.*$/gm, "");

            assert.doesNotMatch(source, /Math\.(random|sin|cos|tan|exp|log|pow|atan|hypot|cbrt|sqrt)\b/, file);
        }
    });
});
