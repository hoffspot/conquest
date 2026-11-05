// A dungeon's floors high in a tower, Bellhaven's keep's (core/dungeons/air.js, docs/DUNGEONS.md
// *Bellhaven's keep*): open air round their walls, the walls three squares thick, and a balcony or
// two dug out of a big room's wall to the air, a parapet along its edge, its torches taken down;
// every room as reached as it was, none in any other theme, the same wherever it's made
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AIR, inTheAir } from "../client/js/core/dungeons/air.js";
import { buildDungeon } from "../client/js/core/dungeons/build.js";
import { streamOf } from "../client/js/core/dungeons/seeds.js";
import { readPlan } from "../client/js/core/interiors.js";

const SEEDS = [1, 3, 7, 11, 19, 23];
const ROUND = [-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => [dx, dy])).filter(([dx, dy]) => dx || dy);

// Steps (four ways) from a level's entry over what can be stood on (readPlan's), to each square
function reached(level, map) {
    const [x, y] = level.entry.arrive.map(Math.floor);
    const seen = new Set([`${x},${y}`]);
    const queue = [[x, y]];

    while (queue.length) {
        const [ax, ay] = queue.pop();

        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const [nx, ny] = [ax + dx, ay + dy];

            if (nx >= 0 && ny >= 0 && nx < level.width && ny < level.height && !map.blocked[ny][nx] && !seen.has(`${nx},${ny}`)) {
                seen.add(`${nx},${ny}`);
                queue.push([nx, ny]);
            }
        }
    }

    return seen;
}

describe("a dungeon's floors high in a tower (core/dungeons/air.js)", () => {
    it("stands Bellhaven's keep's floors in the open air, their walls as thick as AIR's all round, the air never stood on but seen across", () => {
        for (const seed of SEEDS) {
            for (const level of buildDungeon({ seed, theme: "keep", tier: 5 }).levels) {
                const map = readPlan(`keep/${seed}/${level.index}`, "a floor", level.rows);
                const char = (x, y) => level.rows[y]?.[x] ?? "_";
                let air = 0;

                for (let y = 0; y < level.height; y++) {
                    for (let x = 0; x < level.width; x++) {
                        if (char(x, y) === "_") {
                            air++;
                            assert.equal(map.blocked[y][x], 1);
                            assert.equal(map.opaque[y][x], 0);
                            // (Nothing stood on beside the air: rock or a parapet between)
                            assert.ok(ROUND.every(([dx, dy]) => ["_", "#", "="].includes(char(x + dx, y + dy))), `${seed}/${level.index}: ${x}, ${y}`);
                        } else if (char(x, y) === "#") {
                            // (Rock is wall: within AIR.wall of something that isn't rock or air)
                            let near = false;

                            for (let dy = -AIR.wall; dy <= AIR.wall && !near; dy++) {
                                for (let dx = -AIR.wall; dx <= AIR.wall && !near; dx++) {
                                    near = !["#", "_", "="].includes(char(x + dx, y + dy)) || (char(x + dx, y + dy) === "=" && Math.max(Math.abs(dx), Math.abs(dy)) <= AIR.wall);
                                }
                            }

                            assert.ok(near, `${seed}/${level.index}: rock at ${x}, ${y} far from the floor`);
                        }
                    }
                }

                assert.ok(air > level.width * 2, `${seed}/${level.index}: ${air} squares of air`);
            }
        }
    });

    it("digs a balcony or two out of a big room's wall to the air, never facing the cliff behind, its parapet along its edge, walked out onto from the room, its torches taken down", () => {
        let all = 0;

        for (const seed of SEEDS) {
            for (const level of buildDungeon({ seed, theme: "keep", tier: 5 }).levels) {
                const map = readPlan(`keep/${seed}/${level.index}`, "a floor", level.rows);
                const walked = reached(level, map);

                assert.ok(level.balconies.length <= AIR.balconies);
                all += level.balconies.length;

                for (const { x, y, w, h, out } of level.balconies) {
                    const deep = out[0] ? w : h;
                    const long = out[0] ? h : w;

                    assert.equal(deep, AIR.wall);
                    // (Never facing north, the cliff the keep's back is built into)
                    assert.notDeepEqual(out, [0, -1], `${seed}/${level.index}: a balcony facing north`);
                    assert.ok(long >= AIR.span[0] && long <= AIR.span[1], `${long} long`);

                    for (let j = y; j < y + h; j++) {
                        for (let i = x; i < x + w; i++) {
                            // (Its outer edge the parapet, the rest floor reached from the room; the air beyond)
                            const edge = out[0] > 0 ? i === x + w - 1 : out[0] < 0 ? i === x : out[1] > 0 ? j === y + h - 1 : j === y;

                            assert.equal(level.rows[j][i], edge ? "=" : ".", `${seed}/${level.index}: ${i}, ${j}`);
                            assert.ok(edge || walked.has(`${i},${j}`), `${seed}/${level.index}: ${i}, ${j} not reached`);

                            if (edge) {
                                assert.equal(level.rows[j + out[1]]?.[i + out[0]] ?? "_", "_");
                            }
                        }
                    }
                }

                // (No torch left on a wall that's gone)
                for (const { at: [lx, ly], wall } of level.lights) {
                    if (wall) {
                        assert.equal(level.rows[ly + wall[1]][lx + wall[0]], "#", `${seed}/${level.index}: a torch at ${lx}, ${ly}`);
                    }
                }
            }
        }

        assert.ok(all >= SEEDS.length * 4, `${all} balconies in all`);
    });

    it("leaves every room reached as it was, and every other theme's floors in their rock", () => {
        for (const seed of SEEDS) {
            for (const level of buildDungeon({ seed, theme: "keep", tier: 5 }).levels) {
                const walked = reached(level, readPlan(`keep/${seed}/${level.index}`, "a floor", level.rows));

                for (const room of level.rooms) {
                    assert.ok(walked.has(room.centre.join(",")) || level.rows[room.centre[1]][room.centre[0]] !== ".", `${seed}/${level.index}: room ${room.id}`);
                }
            }

            for (const theme of ["caves", "hideout", "ancient", "nest"]) {
                for (const level of buildDungeon({ seed, theme, tier: 3 }).levels) {
                    assert.ok(level.rows.every((row) => !row.includes("_") && !row.includes("=")), `${theme} ${seed}`);
                    assert.equal(level.balconies, undefined);
                }
            }
        }
    });

    it("is the same wherever it's made", () => {
        const level = buildDungeon({ seed: 7, theme: "keep", tier: 5, levels: 1 }).levels[0];
        const bare = { ...level, rows: level.rows.map((row) => row.replace(/[_=]/g, "#")) };

        assert.deepEqual(inTheAir(bare, { balconies: 2 }, streamOf(1, "air")), inTheAir(bare, { balconies: 2 }, streamOf(1, "air")));
        assert.deepEqual(buildDungeon({ seed: 11, theme: "keep", tier: 5 }), buildDungeon({ seed: 11, theme: "keep", tier: 5 }));
    });
});
