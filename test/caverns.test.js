// A dungeon's rock drawn as one surface (world/caverns.js: docs/DUNGEONS.md): its walls never into
// the open ground anyone walks on, below head height; room to stand under its roof over every open
// square; its floor under all the open ground but where stairs go down through it; cut into tiles
// that, together, are the whole of it; and the photographs it's drawn with each listed in the
// catalog, downloaded only once a dungeon's wanted
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { before, describe, it } from "node:test";
import { ASSETS } from "../client/js/app/assets.js";
import { buildDungeon } from "../client/js/core/dungeons/build.js";
import { allAtOnce } from "../client/js/core/steps.js";
import { CAVERNS, cavern, cavernAt, cavernFloor, openness, SHELLS, tiles } from "../client/js/world/caverns.js";
import { DUNGEON_PICTURES } from "../client/js/world/dungeonpictures.js";

// A level of a cave's and of an outlaws' hideout's (each the shell its look has)
const LEVELS = [
    ["caves", "caves"],
    ["hideout", "dug"],
].map(([theme, shell]) => {
    const level = buildDungeon({ seed: 3, theme, tier: 2 }).levels[0];

    return { theme, shell: SHELLS[shell], level, rock: (x, y) => level.rows[y][x] === "#" };
});

describe("a dungeon's rock as one surface (world/caverns.js)", () => {
    const made = new Map();

    before(() => {
        for (const each of LEVELS) {
            made.set(each, allAtOnce(cavern(each.level.width, each.level.height, each.rock, each.shell, { seed: 7 })));
        }
    });

    it("finds how far into the open each point is: into it in the middle of an open square, into the rock in the middle of a rock square, off the level all rock", () => {
        for (const { level, rock } of LEVELS) {
            const open = openness(level.width, level.height, rock);

            for (let y = 0; y < level.height; y += 3) {
                for (let x = 0; x < level.width; x += 3) {
                    const d = open.at(x + 0.5, y + 0.5);

                    assert.ok(rock(x, y) ? d < 0.2 : d > -0.2, `${x}, ${y}: ${d}`);
                }
            }

            assert.ok(open.at(-1.5, level.height / 2) < 0);
        }
    });

    it("keeps its walls out of the open ground below head height, so nothing walks into them", () => {
        for (const each of LEVELS) {
            const open = openness(each.level.width, each.level.height, each.rock);
            const { positions } = made.get(each);
            let low = 0;

            for (let p = 0; p < positions.length; p += 3) {
                if (positions[p + 1] > 0.05 && positions[p + 1] < CAVERNS.lean - 0.3) {
                    low++;
                    assert.ok(open.at(positions[p], positions[p + 2]) < 0, `${each.theme}: a point of its wall ${positions[p + 1].toFixed(2)} m up is in the open`);
                }
            }

            assert.ok(low > 1000, `${each.theme}: ${low} points of its walls below head height`);
        }
    });

    it("leaves room to stand under its roof over every open square, the camera's room too (its least height)", () => {
        for (const each of LEVELS) {
            const field = cavernAt(openness(each.level.width, each.level.height, each.rock), each.shell, 7);

            for (let y = 0; y < each.level.height; y++) {
                for (let x = 0; x < each.level.width; x++) {
                    if (!each.rock(x, y)) {
                        field.column(x + 0.5, y + 0.5);

                        for (let up = 0; up <= each.shell.low - each.shell.roof; up += 0.25) {
                            assert.ok(field.at(up) > 0, `${each.theme}: ${x}, ${y} is shut in ${up} m up`);
                        }
                    }
                }
            }
        }
    });

    it("faces the open: each triangle's turned towards where the field rises", () => {
        for (const each of LEVELS) {
            const { positions, indices } = made.get(each);
            const field = cavernAt(openness(each.level.width, each.level.height, each.rock), each.shell, 7);
            let checked = 0;

            for (let t = 0; t < indices.length; t += 3 * 97) {
                const [a, b, c] = [indices[t] * 3, indices[t + 1] * 3, indices[t + 2] * 3];
                const middle = [0, 1, 2].map((k) => (positions[a + k] + positions[b + k] + positions[c + k]) / 3);
                const u = [0, 1, 2].map((k) => positions[b + k] - positions[a + k]);
                const v = [0, 1, 2].map((k) => positions[c + k] - positions[a + k]);
                const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
                const length = Math.hypot(...n);

                if (length < 1e-6) {
                    continue;
                }

                // (A little way out along it is more open than a little way in)
                const at = (s) => {
                    const [x, y, z] = middle.map((value, k) => value + (n[k] / length) * s);

                    field.column(x, z);

                    return field.at(y);
                };

                assert.ok(at(0.15) > at(-0.15), `${each.theme}: a triangle faces the rock`);
                checked++;
            }

            assert.ok(checked > 100);
        }
    });

    it("lays its floor under all the open ground, but not where stairs go down through it", () => {
        const { level, rock } = LEVELS[0];
        const open = openness(level.width, level.height, rock);
        const hole = { x: 10, y: 10, w: 2, h: 4 };
        const { positions, indices } = cavernFloor(level.width, level.height, open, { hole });
        const covered = new Set();

        for (let t = 0; t < indices.length; t += 3) {
            const x = (positions[indices[t] * 3] + positions[indices[t + 1] * 3] + positions[indices[t + 2] * 3]) / 3;
            const z = (positions[indices[t] * 3 + 2] + positions[indices[t + 1] * 3 + 2] + positions[indices[t + 2] * 3 + 2]) / 3;

            covered.add(`${Math.floor(x)},${Math.floor(z)}`);
        }

        for (let y = 0; y < level.height; y++) {
            for (let x = 0; x < level.width; x++) {
                const inHole = x >= hole.x && x < hole.x + hole.w && y >= hole.y && y < hole.y + hole.h;

                if (inHole) {
                    assert.ok(!covered.has(`${x},${y}`), `${x}, ${y}: floored over the stairs`);
                } else if (!rock(x, y)) {
                    assert.ok(covered.has(`${x},${y}`), `${x}, ${y}: no floor`);
                }
            }
        }
    });

    it("is cut into tiles that are the whole of it, each with only its own points, smooth where they meet", () => {
        for (const each of LEVELS) {
            const whole = made.get(each);
            const cut = tiles(whole);

            assert.ok(cut.length > 4);
            assert.equal(
                cut.reduce((sum, { indices }) => sum + indices.length, 0),
                whole.indices.length,
            );

            for (const tile of cut) {
                const points = tile.positions.length / 3;

                assert.ok(tile.indices.every((k) => k < points));
                assert.equal(tile.normals.length, tile.positions.length);
                assert.equal(tile.shade.length, points);

                for (let p = 0; p < tile.normals.length; p += 3) {
                    assert.ok(Math.abs(Math.hypot(tile.normals[p], tile.normals[p + 1], tile.normals[p + 2]) - 1) < 1e-3);
                }
            }
        }
    });
});

describe("the photographs a dungeon's drawn with (world/dungeonpictures.js, scripts/build-textures.js)", () => {
    it("are each in the catalog, downloaded only once a dungeon's wanted: a colour picture and a normal map, there on disk", () => {
        for (const [name, { entry, metres, mean }] of Object.entries(DUNGEON_PICTURES)) {
            const model = ASSETS.models[entry];

            assert.ok(model, `${name}: ${entry} isn't in the catalog`);
            assert.equal(model.tier, "demand");
            assert.deepEqual(
                model.files.map(({ path }) => path.match(/-(colour|normal)\.jpg$/)?.[1]),
                ["colour", "normal"],
            );

            for (const { path } of model.files) {
                assert.ok(existsSync(new URL(`../client/${path}`, import.meta.url)), path);
            }

            assert.ok(metres > 0.5 && metres < 6);
            assert.ok(mean.every((value) => value > 0 && value < 1));
        }
    });
});
