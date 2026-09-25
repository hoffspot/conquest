import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findPath } from "../client/js/core/pathfinding.js";
import { GROUND } from "../client/js/core/setpieces/pieces.js";
import { BORDER_PLOTS, generateWorld, PLOT, TOWN_PLOTS } from "../client/js/core/world.js";

describe("the world (world.js)", () => {
    const world = generateWorld({ seed: 7 });

    it("is a town in fields, on 1-metre squares", () => {
        assert.equal(world.width, (TOWN_PLOTS[0] + 2 * BORDER_PLOTS) * PLOT);
        assert.equal(world.height, (TOWN_PLOTS[1] + 2 * BORDER_PLOTS) * PLOT);
        assert.equal(world.blocked.length, world.height);
        assert.equal(world.blocked[0].length, world.width);

        // Houses are 8 to 16 metres across: the right size for people 1.7 metres tall
        for (const piece of world.town.pieces.filter(({ key }) => key.startsWith("house"))) {
            assert.ok(piece.w * PLOT >= 8 && piece.w * PLOT <= 16, piece.key);
            assert.ok(piece.h * PLOT >= 8 && piece.h * PLOT <= 16, piece.key);
        }

        // Streets are wide enough for people to pass
        const roads = world.ground.flatMap((row) => [...row]).filter((kind) => kind === GROUND.road).length;

        assert.ok(roads > 500, `${roads} square metres of road`);
    });

    it("starts the player in the market square and the orc in the north-west corner", () => {
        const { square } = world.town;
        const [x, y] = world.spawns.player;
        const toPlots = (value) => (value - world.origin) / PLOT;

        assert.ok(toPlots(x) >= square.x - 1 && toPlots(x) <= square.x + square.w + 1, `player at x ${x}`);
        assert.ok(toPlots(y) >= square.y - 1 && toPlots(y) <= square.y + square.h + 1, `player at y ${y}`);
        assert.equal(world.blocked[y][x], 0);

        const [ox, oy] = world.spawns.orc;

        assert.ok(ox < 8 && oy < 8, `orc at ${ox}, ${oy}`);
        assert.equal(world.blocked[oy][ox], 0);
    });

    it("sends the orc on a patrol halfway down the map, on open ground", () => {
        const [[ax, ay], [bx, by]] = world.patrol;

        assert.ok(Math.abs(ax - bx) <= 2, "the patrol runs north to south");
        assert.ok(Math.abs(by - ay - world.height / 2) <= 4, `from ${ay} to ${by} on a map ${world.height} tall`);

        const path = findPath(world.blocked, [ax, ay], [bx, by]);

        assert.deepEqual(path.at(-1), [bx, by]);
        assert.ok(path.length < (by - ay) * 1.2, "a straight walk, not round obstacles");
    });

    it("lets the player walk anywhere that matters: to the orc's patrol and out of every road", () => {
        const path = findPath(world.blocked, world.spawns.player, world.spawns.orc);

        assert.deepEqual(path.at(-1), world.spawns.orc);

        for (const [x, y] of [[world.width - 1, world.spawns.player[1]], [world.spawns.player[0], world.height - 1]]) {
            const out = findPath(world.blocked, world.spawns.player, [x, y]);

            assert.ok(out.length > 0);
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

    it("blocks only the middle of props' and trees' plots, where they stand, so people can walk round them", () => {
        let checked = 0;

        for (const seed of [1, 2, 3]) {
            const world = generateWorld({ seed });

            for (const piece of world.town.pieces.filter(({ key }) => /^(prop|tree)-/.test(key))) {
                const [x0, y0] = [world.origin + piece.x * PLOT, world.origin + piece.y * PLOT];
                const [w, h] = [piece.w * PLOT, piece.h * PLOT];

                // The middle is blocked; the squares along the plot's edge are free
                assert.equal(world.blocked[y0 + h / 2][x0 + w / 2], 1, piece.key);
                assert.equal(world.blocked[y0][x0], 0, piece.key);
                assert.equal(world.blocked[y0 + h - 1][x0 + w - 1], 0, piece.key);
                checked++;
            }
        }

        assert.ok(checked > 10);
    });

    it("comes out the same for the same seed, and different for another", () => {
        const again = generateWorld({ seed: 7 });
        const other = generateWorld({ seed: 8 });

        assert.deepEqual(again.trees, world.trees);
        assert.deepEqual(again.town.pieces, world.town.pieces);
        assert.notDeepEqual(other.town.pieces, world.town.pieces);
    });
});
