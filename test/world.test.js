import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { navigatorOf } from "../client/js/core/navigation.js";
import { GROUND } from "../client/js/core/setpieces/pieces.js";
import { SETTLEMENT_KINDS } from "../client/js/core/setpieces/town.js";
import { generateWorld, PLOT, SEE_OVER } from "../client/js/core/world.js";
import { reachable } from "./helpers.js";

describe("the world (world.js)", () => {
    const world = generateWorld({ seed: 7 });

    it("is a town in fields, on 1-metre squares", () => {
        const { radius, fields } = SETTLEMENT_KINDS.town;

        assert.equal(world.width, 2 * Math.round(radius + fields));
        assert.equal(world.height, world.width);
        assert.equal(world.blocked.length, world.height);
        assert.equal(world.blocked[0].length, world.width);
        assert.equal(world.origin, 0);

        // Houses are 4.5 to 12 metres across (the smallest behind the others): the right size for
        // people 1.7 metres tall
        for (const piece of world.town.pieces.filter(({ kind }) => kind === "house")) {
            assert.ok(piece.w * PLOT >= 4.5 && piece.w * PLOT <= 12, piece.key);
            assert.ok(piece.h * PLOT >= 4.5 && piece.h * PLOT <= 12, piece.key);
        }

        // Streets are wide enough for people to pass
        const roads = world.ground.flatMap((row) => [...row]).filter((kind) => kind === GROUND.road).length;

        assert.ok(roads > 500, `${roads} square metres of road`);
    });

    it("starts the player in the market place and the orc in the north-west corner", () => {
        const [x, y] = world.spawns.player;
        const [cx, cy] = world.town.centre;

        assert.ok(Math.hypot(x + 0.5 - cx, y + 0.5 - cy) < SETTLEMENT_KINDS.town.market[0], `player at ${x}, ${y}`);
        assert.equal(world.ground[y][x], GROUND.cobbles);
        assert.equal(world.blocked[y][x], 0);

        const [ox, oy] = world.spawns.orc;

        assert.ok(ox < 8 && oy < 8, `orc at ${ox}, ${oy}`);
        assert.equal(world.blocked[oy][ox], 0);
    });

    it("sends the orc on a patrol halfway down the map, on open ground", () => {
        const [[ax, ay], [bx, by]] = world.patrol;

        assert.ok(Math.abs(ax - bx) <= 2, "the patrol runs north to south");
        assert.ok(Math.abs(by - ay - world.height / 2) <= 4, `from ${ay} to ${by} on a map ${world.height} tall`);

        const path = navigatorOf(world.blocked).path([ax + 0.5, ay + 0.5], [bx + 0.5, by + 0.5]);
        const length = path.slice(1).reduce((sum, [x, y], i) => sum + Math.hypot(x - path[i][0], y - path[i][1]), 0);

        assert.deepEqual(path.at(-1).slice(0, 2).map(Math.floor), [bx, by]);
        assert.ok(length < (by - ay) * 1.2, "a straight walk, not round obstacles");
    });

    it("lets the player walk anywhere that matters: to the orc's patrol and out of every road", () => {
        assert.ok(reachable(world.blocked, world.spawns.player, world.spawns.orc));

        for (const [x, y] of [[world.width - 1, world.spawns.player[1]], [world.spawns.player[0], world.height - 1]]) {
            assert.ok(reachable(world.blocked, world.spawns.player, [x, y]), `out to ${x}, ${y}`);
        }
    });

    it("dots trees about the fields, never on roads, the patrol or in town", () => {
        assert.ok(world.trees.length > 30, `${world.trees.length} trees`);

        for (const { x, y } of world.trees) {
            assert.ok(!(x <= world.patrol[0][0] + 4 && y <= world.patrol[1][1] + 4), `a tree on the patrol at ${x}, ${y}`);
            assert.equal(world.ground[y][x], GROUND.grass, `a tree at ${x}, ${y} on grass`);
            assert.equal(world.blocked[y][x], 1);
        }
    });

    it("blocks only the middle of props' plots, and the four squares round a tree's trunk, so people can walk round them", () => {
        let checked = 0;

        for (const seed of [1, 2, 3]) {
            const world = generateWorld({ seed });

            for (const piece of world.town.pieces.filter(({ kind }) => kind === "prop")) {
                // The middle is blocked; a little way beyond the middle half of its plots is free
                // (or something else's)
                const reach = (piece.w * PLOT) / 4 + 1.5;

                assert.equal(world.blocked[Math.floor(piece.y)][Math.floor(piece.x)], 1, piece.key);
                assert.ok([[reach, 0], [-reach, 0], [0, reach], [0, -reach]].some(([dx, dy]) => !world.blocked[Math.floor(piece.y + dy)][Math.floor(piece.x + dx)]), piece.key);
                checked++;
            }

            for (const piece of world.town.pieces.filter(({ kind }) => kind === "tree")) {
                for (const [x, y] of [[piece.x - 1, piece.y - 1], [piece.x, piece.y - 1], [piece.x - 1, piece.y], [piece.x, piece.y]]) {
                    assert.equal(world.blocked[y][x], 1, piece.key);
                }

                checked++;
            }
        }

        assert.ok(checked > 10);
    });

    it("hides what's behind houses, landmarks and trees, but not behind a well, barrels or a cart", () => {
        const kinds = { see: 0, hide: 0 };

        for (const seed of [1, 2, 3]) {
            const world = generateWorld({ seed });

            // Only what's in the way can hide anything
            for (let y = 0; y < world.height; y++) {
                for (let x = 0; x < world.width; x++) {
                    assert.ok(!world.opaque[y][x] || world.blocked[y][x], `${x}, ${y}`);
                }
            }

            for (const piece of world.town.pieces) {
                // (A tree's trunk is where four squares meet: the one to its north-west)
                const [x, y] = piece.kind === "tree" ? [piece.x - 1, piece.y - 1] : [Math.floor(piece.x), Math.floor(piece.y)];
                const low = SEE_OVER.test(piece.key);

                if (world.blocked[y][x]) {
                    assert.equal(world.opaque[y][x], low ? 0 : 1, piece.key);
                    kinds[low ? "see" : "hide"]++;
                }
            }

            // Trees in the fields too, and the map says so
            for (const tree of world.trees) {
                assert.equal(world.opaque[tree.y][tree.x], 1);
            }

            assert.equal(world.maps.town.opaque, world.opaque);
        }

        assert.ok(kinds.see > 5 && kinds.hide > 50, JSON.stringify(kinds));
    });

    it("comes out the same for the same seed, and different for another", () => {
        const again = generateWorld({ seed: 7 });
        const other = generateWorld({ seed: 8 });

        assert.deepEqual(again.trees, world.trees);
        assert.deepEqual(again.town.pieces, world.town.pieces);
        assert.notDeepEqual(other.town.pieces, world.town.pieces);
    });
});
