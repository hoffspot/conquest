// The dungeon builder (client/js/core/dungeons: docs/DUNGEONS.md): a dungeon cooked up from a seed
// and a theme (caves, an outlaws' hideout, an ancient temple), one to three levels deep, each a
// plan the game's interiors read; stairs joining the levels, the boss before its hoard at the far
// end of the bottom level, mini-bosses along the way, packs, chests, props and torches; every
// square that can be walked on reachable, no one waiting by where anyone comes in; the same every
// time for the same seed, and new themes and layouts added without touching the rest.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CREATURES, TIERS } from "../client/js/core/creatures.js";
import { ATTEMPTS, buildDungeon, checkLevel, DUNGEON_VERSION, dungeonName, LEVEL_SIZES, MINIS } from "../client/js/core/dungeons/build.js";
import { gabriel, loopsFor, roomsOf, spanningTree } from "../client/js/core/dungeons/graph.js";
import { Grid } from "../client/js/core/dungeons/grid.js";
import { LAYOUTS, registerLayout, WAY_IN } from "../client/js/core/dungeons/layouts.js";
import { ARRIVE_CLEAR, BLOCKING } from "../client/js/core/dungeons/place.js";
import { mix, pickStable, streamOf } from "../client/js/core/dungeons/seeds.js";
import { registerTheme, THEMES } from "../client/js/core/dungeons/themes.js";
import { WAY_IN_CLEAR } from "../client/js/core/insides.js";
import { PLAN_KEY, readPlan } from "../client/js/core/interiors.js";

const THEME_IDS = ["caves", "hideout", "ancient"];

// Every dungeon looked at: each theme, a few seeds, each depth
const MADE = THEME_IDS.flatMap((theme) => [1, 2, 3].flatMap((levels) => [11, 12, 13].map((seed) => ({ theme, levels, seed, dungeon: buildDungeon({ seed, theme, tier: 1 + (seed % 7), levels }) }))));

// Steps from some squares to every square of a plan that can be walked on (readPlan's `blocked`)
function walk(map, from) {
    const far = map.blocked.map((row) => row.map(() => -1));
    const queue = [];

    for (const [x, y] of from) {
        far[y][x] = 0;
        queue.push([x, y]);
    }

    for (let head = 0; head < queue.length; head++) {
        const [x, y] = queue[head];

        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const [nx, ny] = [x + dx, y + dy];

            if (nx >= 0 && ny >= 0 && nx < map.width && ny < map.height && !map.blocked[ny][nx] && far[ny][nx] < 0) {
                far[ny][nx] = far[y][x] + 1;
                queue.push([nx, ny]);
            }
        }
    }

    return far;
}

const rings = ([x, y], [u, v]) => Math.max(Math.abs(x - u), Math.abs(y - v));

describe("seeds", () => {
    it("mixes the same parts the same way, different parts differently", () => {
        assert.equal(mix(1, "layout", 2), mix(1, "layout", 2));
        assert.notEqual(mix(1, "layout", 2), mix(1, "layout", 3));
        assert.notEqual(mix(1, "layout", 2), mix(1, "place", 2));
        assert.equal(streamOf(5, "plan").next(), streamOf(5, "plan").next());
    });

    it("chooses stably: a new entry changes only the slots it wins", () => {
        const list = ["a", "b", "c", "d"].map((id) => ({ id, weight: 1 }));
        const more = [...list, { id: "e", weight: 1 }];
        let changed = 0;

        for (let slot = 0; slot < 400; slot++) {
            const [before, after] = [pickStable(9, slot, list), pickStable(9, slot, more)];

            if (before !== after) {
                assert.equal(after.id, "e", "only the new entry takes a slot");
                changed++;
            }
        }

        // (About a fifth of the slots go to the new one)
        assert.ok(changed > 40 && changed < 130, `${changed} slots changed`);
    });

    it("chooses by weight", () => {
        const list = [{ id: "rare", weight: 1 }, { id: "common", weight: 9 }];
        const common = Array.from({ length: 500 }, (each, slot) => pickStable(3, slot, list).id).filter((id) => id === "common").length;

        assert.ok(common > 400 && common < 490, `${common} of 500`);
    });
});

describe("graph", () => {
    it("joins points along a Gabriel graph's shortest tree, and adds loops that save a long way round", () => {
        // (Points round a U, its ends 60 apart across the top but 180 round it: the tree goes
        // round, and the first loop joins the ends)
        const points = [[10, 10], [10, 40], [10, 70], [40, 75], [70, 70], [70, 40], [70, 10]];
        const edges = gabriel(points);
        const tree = spanningTree(points, edges);

        assert.equal(tree.length, points.length - 1);
        assert.ok(!tree.some(([a, b]) => a === 0 && b === 6));

        const loops = loopsFor(points, tree, edges, { count: 3, detour: 25 });

        assert.deepEqual(loops[0], [0, 6]);
        assert.deepEqual(loopsFor(points, tree, edges, { count: 3, detour: 500 }), [], "none if none saves enough");
        assert.deepEqual(loopsFor(points, tree, edges, { count: 3, detour: 25, skip: 0 }).flat().includes(0), false, "none touching one left out");
    });

    it("reads rooms back from a grid", () => {
        const grid = new Grid(20, 20);

        grid.digRect(2, 2, 4, 3, 0);
        grid.digRect(10, 10, 5, 5, 1);

        const rooms = roomsOf(grid, 2);

        assert.deepEqual(rooms.map(({ id, area, w, h }) => [id, area, w, h]), [[0, 12, 4, 3], [1, 25, 5, 5]]);
        assert.deepEqual(rooms[1].centre, [12, 12]);
    });
});

describe("buildDungeon", () => {
    it("makes the same dungeon from the same seed, theme, tier and generation", () => {
        for (const theme of THEME_IDS) {
            const one = buildDungeon({ seed: 77, theme, tier: 3 });
            const two = buildDungeon({ seed: 77, theme, tier: 3 });

            assert.equal(JSON.stringify(one), JSON.stringify(two));
            assert.equal(one.version, DUNGEON_VERSION);

            // (Made again once cleared: the next generation, another dungeon)
            const next = buildDungeon({ seed: 77, theme, tier: 3, generation: 1 });

            assert.notEqual(JSON.stringify(next.levels.map(({ rows }) => rows)), JSON.stringify(one.levels.map(({ rows }) => rows)));
            assert.equal(next.name, one.name, "keeps its name");
        }
    });

    it("is one to three levels deep, about as likely each, by seed", () => {
        const depths = Array.from({ length: 60 }, (each, seed) => buildDungeon({ seed, theme: "caves" }).levels.length);

        for (const n of [1, 2, 3]) {
            assert.ok(depths.filter((d) => d === n).length >= 10, `${n} levels deep`);
        }
    });

    it("names each from its theme", () => {
        for (const theme of THEME_IDS) {
            const name = dungeonName(THEMES[theme], 5);

            assert.match(name, /^[A-Z'a-z -]+$/);
            assert.equal(name, buildDungeon({ seed: 5, theme, levels: 1 }).name);
        }
    });

    it("refuses a theme there isn't", () => {
        assert.throws(() => buildDungeon({ seed: 1, theme: "moon" }), /No dungeon theme/);
    });

    for (const { theme, levels, seed, dungeon } of MADE) {
        it(`${theme}, ${levels} level${levels > 1 ? "s" : ""}, seed ${seed}: every level whole, joined, and filled`, () => {
            assert.equal(dungeon.levels.length, levels);

            const size = LEVEL_SIZES[levels];
            let minis = 0;

            for (const level of dungeon.levels) {
                const bottom = level.index === levels - 1;
                const map = readPlan(`d${level.index}`, dungeon.name, level.rows);

                // (Its size, and its rooms)
                assert.ok(Math.abs(level.width - size.side) <= size.vary && Math.abs(level.height - size.side) <= size.vary);
                assert.ok(level.rooms.length >= Math.ceil(size.rooms[0] * 0.8), `${level.rooms.length} rooms`);
                assert.ok(level.attempt < ATTEMPTS);
                const check = checkLevel(level, { wanted: size.rooms[0], bottom, levels });

                assert.ok(check.ok, JSON.stringify(check.checks));

                // (Its way in: the front door on the first, the foot of the stairs up below it,
                // both at the middle of the south edge)
                const [ex] = level.entry.squares[0];

                if (level.index === 0) {
                    assert.deepEqual(map.marks.D, [[ex, level.height - 1], [ex + 1, level.height - 1]]);
                    assert.equal(map.marks["<"], undefined);
                } else {
                    assert.deepEqual(map.marks["<"], level.entry.squares);
                    assert.equal(map.marks["^"].length, 6);
                    assert.equal(map.marks.D, undefined);
                }

                assert.ok(Math.abs(ex + 1 - level.width / 2) <= 1);

                // (Its stairs down, but the bottom's: six squares and their landing, in the room
                // furthest in)
                if (bottom) {
                    assert.equal(level.down, null);
                    assert.equal(map.marks.V, undefined);
                } else {
                    assert.equal(map.marks.V.length, 6);
                    assert.deepEqual(map.marks[">"], level.down.squares);
                }

                // (Every square that can be walked on can be walked to from the way in, and the
                // ends of the stairs from either)
                const from = level.index === 0 ? map.marks.D : map.marks["<"];
                const far = walk(map, from);

                for (let y = 0; y < map.height; y++) {
                    for (let x = 0; x < map.width; x++) {
                        assert.ok(map.blocked[y][x] || far[y][x] >= 0, `(${x}, ${y}) can't be walked to`);
                    }
                }

                for (const way of [level.entry, level.down].filter(Boolean)) {
                    assert.ok(!map.blocked[way.arrive[1]][way.arrive[0]], "arrives on open ground");
                }

                // (Who's in it: each on open ground of its own, none by where anyone comes in, of
                // the theme's creatures, at the level's tier, an elite a tier up)
                const taken = new Set();

                for (const pack of level.packs) {
                    for (const foe of pack.foes) {
                        const [x, y] = foe.at;

                        assert.ok(CREATURES[foe.creature], foe.creature);
                        assert.ok(!map.blocked[y][x] && far[y][x] >= 0, `${foe.creature} stands on open ground`);
                        assert.ok(!taken.has(`${x},${y}`), "each on a square of their own");
                        taken.add(`${x},${y}`);

                        for (const way of [level.entry, level.down].filter(Boolean)) {
                            assert.ok(rings(foe.at, way.arrive) >= ARRIVE_CLEAR, `${foe.creature} waits ${rings(foe.at, way.arrive)} from a way in`);
                        }

                        const want = foe.boss ? Math.min(TIERS, level.tier + 2) : foe.mini ? Math.min(TIERS, level.tier + 1) : level.tier;

                        assert.ok(foe.tier === want || (!foe.boss && !foe.mini && foe.tier === Math.min(TIERS, want + 1)), `${foe.creature} tier ${foe.tier}, the level's ${level.tier}`);
                    }

                    assert.ok(pack.foes.length >= 1 && pack.foes.length <= 6);
                }

                minis += level.packs.filter(({ role }) => role === "mini").length;

                // (The boss and its hoard at the far end of the bottom level)
                const bosses = level.packs.filter(({ role }) => role === "boss");
                const hoards = level.chests.filter(({ kind }) => kind === "hoard");

                assert.equal(bosses.length, bottom ? 1 : 0);
                assert.equal(hoards.length, bottom ? 1 : 0);

                if (bottom) {
                    const [boss] = bosses;
                    const [hoard] = hoards;
                    const arena = level.rooms.find(({ role }) => role === "arena");

                    assert.equal(boss.room, arena.id);
                    assert.equal(hoard.room, arena.id);
                    assert.ok(boss.foes[0].boss && boss.foes[0].title.startsWith("the "));
                    assert.equal(level.path.at(-1), arena.id, "the arena's the end of the way through");
                    assert.deepEqual(map.marks.h, [hoard.at]);
                    assert.ok(rings(boss.foes[0].at, hoard.at) <= 8, "the boss stands before the hoard");
                }

                // (Small chests here and there, none in the way in's room, each marked)
                const small = level.chests.filter(({ kind }) => kind === "small");

                assert.ok(small.length >= 1 && small.length <= 4, `${small.length} small chests`);
                assert.equal((map.marks.$ ?? []).length, small.length);

                for (const chest of small) {
                    assert.notEqual(chest.room, level.path[0]);
                }

                // (Torches on walls, fires on the floor)
                assert.ok(level.lights.some(({ kind }) => kind === "torch"));

                for (const light of level.lights.filter(({ kind }) => kind === "torch")) {
                    const [x, y] = light.at;

                    assert.equal(map.blocked[y + light.wall[1]][x + light.wall[0]], 1, "a torch hangs on a wall");
                }
            }

            assert.ok(minis >= MINIS[levels][0] - 1 && minis <= MINIS[levels][1], `${minis} mini-bosses`);
        });
    }

    it("plans only with characters the interiors know", () => {
        const used = new Set(MADE.flatMap(({ dungeon }) => dungeon.levels.flatMap(({ rows }) => [...rows.join("")])));

        for (const char of used) {
            assert.ok(PLAN_KEY[char], `"${char}"`);
        }

        for (const char of BLOCKING) {
            assert.ok(PLAN_KEY[char]?.blocks, `"${char}" blocks`);
        }
    });

    it("keeps no one nearer where anyone comes in than the places gone into do", () => {
        assert.equal(ARRIVE_CLEAR, WAY_IN_CLEAR);
        assert.ok(WAY_IN > 5);
    });
});

describe("themes", () => {
    it("has caves, an outlaws' hideout and an ancient temple, each with its own layout", () => {
        assert.deepEqual(Object.keys(THEMES).slice(0, 3), THEME_IDS);

        for (const theme of THEME_IDS.map((id) => THEMES[id])) {
            assert.ok(LAYOUTS[theme.layout], theme.layout);
            assert.ok(theme.packs.length >= 4 && theme.minis.length >= 2 && theme.bosses.length >= 2);

            for (const entry of [...theme.packs.flatMap(({ creatures }) => creatures), ...theme.minis.map(({ creature }) => creature), ...theme.bosses.map(({ creature }) => creature)]) {
                assert.ok(CREATURES[entry], `${theme.id}: ${entry}`);
            }

            for (const looks of Object.values(theme.rooms)) {
                for (const { props = [] } of looks) {
                    for (const { char } of props) {
                        assert.ok(PLAN_KEY[char], `${theme.id}: "${char}"`);
                    }
                }
            }
        }
    });

    it("has a pack for every tier in every theme", () => {
        for (const theme of THEME_IDS.map((id) => THEMES[id])) {
            for (let tier = 1; tier <= TIERS; tier++) {
                const suited = theme.packs.filter(({ creatures }) => creatures.some((creature) => tier >= CREATURES[creature].tiers[0] - 1 && tier <= CREATURES[creature].tiers[1] + 1));

                assert.ok(suited.length, `${theme.id} at tier ${tier}`);
            }
        }
    });

    it("takes new themes and layouts", () => {
        registerLayout("burrow", (options) => LAYOUTS.caves({ ...options, rooms: Math.min(options.rooms, 8) }));
        registerTheme({ ...THEMES.caves, id: "burrow", name: "a burrow", layout: "burrow", rooms: { any: [{ id: "bare", props: [], torches: [1, 1] }] } });

        const dungeon = buildDungeon({ seed: 3, theme: "burrow", levels: 2 });

        assert.equal(dungeon.theme, "burrow");
        assert.equal(dungeon.levels.length, 2);
        assert.ok(dungeon.levels.every(({ rooms }) => rooms.length <= 8));
        delete THEMES.burrow;
        delete LAYOUTS.burrow;
    });
});
