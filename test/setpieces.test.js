import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { layoutCastle } from "../client/js/core/setpieces/castle.js";
import { atan2, cos, exp, hypot, log, pow, sin, sqrt } from "../client/js/core/exact.js";
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

                    // (The same every time: once for each people, the biggest they lay out)
                    if (kind === KINDS.at(-1) && seed === 3) {
                        assert.deepEqual(town, layoutTown({ kind, seed, people }), where);
                    }

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

    it("keeps a yard behind its houses, fenced where nothing stands and once where two meet, its bed and washing line clear", () => {
        const towns = [...layouts.values(), ...["cat", "orc", "lizard", "elf", "darkElf"].flatMap((people) => ["village", "town", "city"].map((kind) => layoutTown({ kind, seed: 3, people })))];
        const counts = { yards: 0, sides: 0, fenced: 0, beds: 0, lines: 0 };

        for (const town of towns) {
            const where = `${town.people} ${town.kind} ${town.seed}`;
            const built = town.pieces.filter(({ kind }) => kind === "house" || kind === "landmark");
            const trunks = town.pieces.filter(({ kind }) => kind === "tree");
            const props = town.pieces.filter(({ kind }) => kind === "prop");
            const fences = [];

            for (const [n, yard] of town.yards.entries()) {
                const [w, d] = [yard.w * PLOT, yard.h * PLOT];
                const [ax, az] = [[cos(yard.facing), -sin(yard.facing)], [sin(yard.facing), cos(yard.facing)]];
                // (A point of the yard, metres across it from its left side and in from its back)
                const at = (u, v) => [yard.x + (u - w / 2) * ax[0] + (v - d / 2) * az[0], yard.y + (u - w / 2) * ax[1] + (v - d / 2) * az[1]];
                const local = ([px, py]) => [(px - yard.x) * ax[0] + (py - yard.y) * ax[1] + w / 2, (px - yard.x) * az[0] + (py - yard.y) * az[1] + d / 2];

                counts.yards++;

                // Behind a house as wide as it, facing the way it does: its front against the house's back
                const front = at(w / 2, d);

                assert.ok(
                    built.some((house) => Math.abs(house.facing - yard.facing) < 1e-9 && Math.abs(house.w * PLOT - w) < 1e-9 && hypot(house.x - house.h * PLOT * az[0] / 2 - front[0], house.y - house.h * PLOT * az[1] / 2 - front[1]) < 0.2),
                    `${where}: yard ${n} behind a house`,
                );

                // Never over the lizard folk's water
                for (const [u, v] of [[0, 0], [w, 0], [0, d], [w, d]]) {
                    const [px, py] = at(u, v).map(Math.floor);

                    assert.ok(!town.water?.[py]?.[px], `${where}: yard ${n} over water`);
                }

                // Fenced along its sides and back (each run in order, along it), where nothing stands
                yard.fence.forEach((runs, side) => {
                    const long = side === 1 ? w : d;
                    const steps = Math.max(1, Math.round(long / 0.5));

                    counts.sides += long;

                    for (const [k, [from, to]] of runs.entries()) {
                        assert.ok(from >= 0 && to <= long + 1e-9 && to > from && (k === 0 || from > runs[k - 1][1]), `${where}: yard ${n}'s runs of fence`);
                        counts.fenced += to - from;
                        fences.push({ n, a: at(...[[0, from], [from, 0], [w, from]][side]), b: at(...[[0, to], [to, 0], [w, to]][side]) });
                    }

                    for (let k = 0; k < steps; k++) {
                        const t = ((k + 0.5) * long) / steps;

                        if (runs.some(([from, to]) => t > from && t < to)) {
                            const [px, py] = at(...[[0.2, t], [t, 0.2], [w - 0.2, t]][side]).map(Math.floor);

                            assert.equal(town.blocked[py]?.[px] ?? 0, 0, `${where}: yard ${n}'s fence through something at ${px}, ${py}`);
                        }
                    }
                });

                // Its bed, in it, nothing stood in it
                if (yard.bed) {
                    const [u0, v0, u1, v1] = yard.bed;

                    counts.beds++;
                    assert.ok(u0 >= 0 && v0 >= 0 && u1 <= w + 1e-9 && v1 <= d + 1e-9 && u1 - u0 > 1 && v1 - v0 >= 0.9 - 1e-9, `${where}: yard ${n}'s bed`);

                    for (const piece of [...trunks, ...props]) {
                        const [u, v] = local([piece.x, piece.y]);

                        assert.ok(!(u > u0 && u < u1 && v > v0 && v < v1), `${where}: a ${piece.kind} in yard ${n}'s bed`);
                    }
                }

                // A washing line strung across its back only where no tree stands
                if (yard.line) {
                    counts.lines++;

                    for (const trunk of trunks) {
                        const [u, v] = local([trunk.x, trunk.y]);

                        assert.ok(!(u > 0 && u < w && Math.abs(v - 0.55) < 0.5), `${where}: a tree in yard ${n}'s washing line`);
                    }
                }
            }

            // Where two yards meet, one fence between them, not two
            for (const [k, one] of fences.entries()) {
                for (const other of fences.slice(k + 1).filter(({ n }) => n !== one.n)) {
                    const long = hypot(one.b[0] - one.a[0], one.b[1] - one.a[1]);
                    const along = [(one.b[0] - one.a[0]) / long, (one.b[1] - one.a[1]) / long];
                    const project = ([px, py]) => [(px - one.a[0]) * along[0] + (py - one.a[1]) * along[1], (px - one.a[0]) * -along[1] + (py - one.a[1]) * along[0]];
                    const [[sa, da], [sb, db]] = [project(other.a), project(other.b)];
                    const overlap = Math.min(long, Math.max(sa, sb)) - Math.max(0, Math.min(sa, sb));

                    assert.ok(!(Math.abs(da) < 0.4 && Math.abs(db) < 0.4 && overlap > 0.6), `${where}: yards ${one.n} and ${other.n} fenced twice`);
                }
            }
        }

        // (Most of what could be fenced is; some yards have a bed, some room for a washing line)
        assert.ok(counts.yards > 150, `${counts.yards} yards`);
        assert.ok(counts.fenced / counts.sides > 0.45, `${counts.fenced / counts.sides} fenced`);
        assert.ok(counts.beds > counts.yards * 0.2 && counts.lines > counts.yards * 0.3, JSON.stringify(counts));
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

    it("works out lengths as V8's Math.hypot does, to the last digit, either way round", () => {
        let seed = 7;
        const next = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 10 ** ((seed % 7) - 1);

        for (let k = 0; k < 20000; k++) {
            const [x, y] = [next(), next()];

            assert.ok(Object.is(hypot(x, y), Math.hypot(x, y)) && hypot(x, y) === hypot(y, x), `${x}, ${y}`);
        }

        for (let x = -40; x <= 40; x++) {
            for (let y = -40; y <= 40; y++) {
                assert.ok(Object.is(hypot(x, y), Math.hypot(x, y)), `${x}, ${y}`);
            }
        }

        assert.deepEqual([hypot(3, 4), hypot(0, -0), hypot(Infinity, NaN), hypot(NaN, 1)], [5, 0, Infinity, NaN]);
    });

    it("works out logarithms, powers of e and powers as Math does, near enough", () => {
        for (let value = 1e-6; value < 1e9; value *= 1.37) {
            assert.ok(Math.abs(log(value) - Math.log(value)) <= 1e-15 * Math.max(1, Math.abs(Math.log(value))), `${value}`);
        }

        for (let power = -40; power < 40; power += 0.173) {
            assert.ok(Math.abs(exp(power) - Math.exp(power)) <= 1e-14 * Math.exp(power), `${power}`);
        }

        for (let value = 0.001; value < 2e5; value *= 1.29) {
            for (const power of [1.6, -1.6, 0.37, 5, 1 / 1.2]) {
                assert.ok(Math.abs(pow(value, power) - Math.pow(value, power)) <= 1e-13 * Math.pow(value, power), `${value} ** ${power}`);
            }
        }

        assert.deepEqual([log(1), exp(0), pow(0, 2), pow(0, 0), pow(5, 0), log(0)], [0, 1, 0, 1, 1, -Infinity]);
    });
});

describe("the rules", () => {
    // (What works out what happens, and the world laid out from a seed: every game playing one
    // world together must work it out alike, whatever browser it's in. variety.js is only for
    // looks: how animations vary)
    it("only use arithmetic that every browser does the same way (exact.js for the rest)", () => {
        const core = new URL("../client/js/core/", import.meta.url);
        const files = readdirSync(core, { recursive: true }).filter((file) => file.endsWith(".js"));

        assert.ok(files.length > 40);

        for (const file of files) {
            const source = readFileSync(new URL(file, core), "utf8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

            assert.doesNotMatch(source, /Math\.(sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|asinh|acosh|atanh|exp|expm1|log|log1p|log2|log10|pow|hypot|cbrt)\b/, file);
            assert.doesNotMatch(source.replace(/\b2 \*\* \d+\b/g, ""), /\*\*/, `${file}: ** (but for whole powers of two)`);

            if (!file.endsWith("variety.js")) {
                assert.doesNotMatch(source, /Math\.random\b/, file);
            }
        }
    });
});

describe("set piece art", () => {
    it("only uses arithmetic that every browser does the same way (so layouts can be made in multiplayer games)", () => {
        for (const file of ["setpieces/castle.js", "setpieces/town.js", "setpieces/plan.js", "setpieces/pieces.js", "setpieces/neutral.js"]) {
            const source = readFileSync(new URL(`../client/js/core/${file}`, import.meta.url), "utf8").replace(/\/\/.*$/gm, "");

            assert.doesNotMatch(source, /Math\.(random|sin|cos|tan|exp|log|pow|atan|hypot|cbrt|sqrt)\b/, file);
        }
    });
});
