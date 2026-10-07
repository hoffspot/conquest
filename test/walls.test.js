// No one in the walls (core/setpieces/standing.js buildingOutline; core/overworld.js roomy,
// standingNear; core/grid.js nearestFree; core/battle.js #clear): a building's squares are only
// those well inside its lot (setpieces/town.js INSET), and its walls are drawn a little in from
// its lot's edge, so the navigation mesh walks round its outline as it stands, a step aside keeps
// to the mesh, and no one's put to stand within ROOM of it. Every door's still walked up to.
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { BODY, STEP_MS } from "../client/js/core/battle.js";
import { nearestFree, squaresOf } from "../client/js/core/grid.js";
import { HOST_PLAYER, Host } from "../client/js/core/host.js";
import { ENTRANCES } from "../client/js/core/insides.js";
import { navigatorOf } from "../client/js/core/navigation.js";
import { loadRecast } from "../client/js/core/navigation/recast.js";
import { buildWorld, ROOM } from "../client/js/core/overworld.js";
import { PLOT } from "../client/js/core/setpieces/pieces.js";
import { buildingOutline, DOOR_CLEAR } from "../client/js/core/setpieces/standing.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

// How far a house's walls stand in from its lot's edge, at the least (metres: the art's kits/
// house.js, its plinth five centimetres proud of walls a quarter of a metre in)
const WALLS_IN = 0.2;

// How far a point is from a convex outline: negative inside it
function apart(corners, [px, py]) {
    let [nearest, ahead, behind] = [Infinity, true, true];

    for (let k = 0; k < corners.length; k++) {
        const [[ax, ay], [bx, by]] = [corners[k], corners[(k + 1) % corners.length]];
        const [dx, dy] = [bx - ax, by - ay];
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
        const cross = dx * (py - ay) - dy * (px - ax);

        nearest = Math.min(nearest, Math.hypot(px - ax - dx * t, py - ay - dy * t));
        ahead &&= cross >= 0;
        behind &&= cross <= 0;
    }

    return ahead || behind ? -nearest : nearest;
}

// The nearest any outline near a point comes to it
const nearestWall = (outlines, point) => Math.min(...outlines.filter(([[x, y]]) => Math.abs(x - point[0]) < 40 && Math.abs(y - point[1]) < 40).map((corners) => apart(corners, point)));

describe("no one in the walls", () => {
    before(async () => {
        await loadRecast();
    });

    it("walks round a house's whole lot, and a landmark's but for the way up to its door; nothing else", () => {
        const house = { kind: "house", x: 10, y: 20, w: 2, h: 3, facing: 0 };

        assert.deepEqual(
            buildingOutline(house).map(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000]),
            [
                [6, 14],
                [14, 14],
                [14, 26],
                [6, 26],
            ],
        );

        // (A landmark facing south, its door to the south: its outline stops short of it)
        const guild = { kind: "landmark", name: "guild", x: 0, y: 0, w: 4, h: 3, facing: 0 };
        const front = Math.max(...buildingOutline(guild).map(([, y]) => y));

        assert.ok(Math.abs(front - ((3 * PLOT) / 2 - ENTRANCES.guild.depth - DOOR_CLEAR)) < 1e-9);

        // (Turned, the same, turned)
        const turned = buildingOutline({ ...house, facing: Math.PI / 2 });

        assert.ok(turned.every(([x, y]) => Math.abs(Math.abs(x - 10) - 6) < 1e-9 && Math.abs(Math.abs(y - 20) - 4) < 1e-9), JSON.stringify(turned));

        for (const kind of ["prop", "tree", "wall", "tower", "gatehouse", "structure"]) {
            assert.equal(buildingOutline({ kind, x: 0, y: 0, w: 1, h: 1 }), null, kind);
        }
    });

    it("puts no one to stand within ROOM of a building's walls, and walks no one into them", () => {
        const world = buildWorld({ seed: 2 });
        const town = world.maps.town;
        const outlines = world.stamp.buildings.map((piece) => buildingOutline(piece));
        const squares = squaresOf(town);
        let [close, stood] = [0, 0];

        assert.ok(outlines.length > 30);

        // Round each house of the town: the squares with their middles near its walls, not blocked,
        // aren't stood on; the free square nearest each is ROOM off
        for (const corners of outlines) {
            for (const [x, y] of corners) {
                for (let j = Math.floor(y) - 2; j <= Math.floor(y) + 2; j++) {
                    for (let i = Math.floor(x) - 2; i <= Math.floor(x) + 2; i++) {
                        const wall = nearestWall(outlines, [i + 0.5, j + 0.5]);

                        if (!squares.blocked(i, j) && wall < ROOM) {
                            assert.equal(squares.roomy(i, j), false, `${i}, ${j}: ${wall} m from a wall`);
                            close++;
                        }

                        const [fx, fy] = nearestFree(town, [i, j], { within: 8 });

                        assert.ok(nearestWall(outlines, [fx + 0.5, fy + 0.5]) >= ROOM, `${fx}, ${fy}`);
                        stood++;
                    }
                }
            }
        }

        assert.ok(close > 50 && stood > 1000, `${close} squares against walls, ${stood} found to stand on`);

        // The navigation mesh walks nowhere within reach of them (a body's width from their walls)
        const navigation = navigatorOf(town);

        for (const corners of outlines) {
            const [[ax, ay], [bx, by]] = corners;

            for (let t = 0.1; t < 1; t += 0.2) {
                const [x, y] = [ax + (bx - ax) * t, ay + (by - ay) * t];

                assert.equal(navigation.walkable(x, y), false, `${x}, ${y}: on a wall's line`);
            }
        }
    });

    it("keeps every door walked up to: some of each door's squares on the mesh", () => {
        const world = buildWorld({ seed: 2 });
        const town = world.maps.town;
        const navigation = navigatorOf(town);
        // (The home town's, and those of a few other towns laid out)
        const places = world.plan.places.filter(({ id, kind }) => id !== world.start.id && ["village", "town", "city"].includes(kind)).slice(0, 4);

        for (const place of places) {
            town.settlements.of(place);
        }

        let doors = 0;

        for (const building of world.interiors.buildings.values()) {
            const end = building.door?.ends.find(({ map }) => map === "town");

            if (!end) {
                continue;
            }

            const reached = end.squares.some(([x, y]) => {
                const found = navigation.nearest([x + 0.5, y + 0.5]);

                return found && Math.floor(found[0]) === x && Math.floor(found[1]) === y;
            });

            assert.ok(reached, `${building.kind}'s door at ${JSON.stringify(end.squares)}`);
            doors++;
        }

        assert.ok(doors >= 4, `${doors} doors`);
    });

    it("keeps a town's guards out of the walls, and its patrols, stepping round each other as they walk, too", () => {
        for (const seed of [2, 5, 7]) {
            const world = buildWorld({ seed });
            const host = new Host(world, { populate: false });

            host.join({ id: HOST_PLAYER, hero: HERO });
            host.populate();

            const outlines = world.stamp.buildings.map((piece) => buildingOutline(piece));
            const soldiers = () => host.battle.actors.filter(({ kind, dead, map }) => kind === "soldier" && !dead && map === "town");
            let nearest = Infinity;

            host.advance(STEP_MS);
            assert.ok(soldiers().length >= 4, `seed ${seed}: the town's soldiers out`);

            // (Its guards, at their posts, ROOM off any wall)
            for (const guard of soldiers().filter(({ id }) => id.includes("/guard-"))) {
                assert.ok(nearestWall(outlines, [guard.x, guard.y]) >= ROOM, `seed ${seed}: ${guard.id}`);
            }

            // (Its patrols, on their rounds, a body's width from any wall: their lots' edges as far
            // out from them as their walls are in)
            for (let t = 0; t < 40000; t += STEP_MS) {
                host.advance(STEP_MS);

                if (t % 250 === 0) {
                    for (const soldier of soldiers()) {
                        nearest = Math.min(nearest, nearestWall(outlines, [soldier.x, soldier.y]));
                    }
                }
            }

            assert.ok(nearest >= BODY - WALLS_IN, `seed ${seed}: ${nearest} m from a house's lot`);
        }
    });
});
