import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GRID_SIZE, TEAMS } from "../client/js/core/config.js";
import { levels } from "../client/js/core/data/levels.js";
import { maps } from "../client/js/core/data/maps.js";
import { getSpec } from "../client/js/core/entities/index.js";
import { createMission } from "../client/js/core/missions.js";

// A few generated maps for every level, as well as the book's map
const SEEDS = [1, 2, 3, 42, 1234567];

function missionsOf(level) {
    return [
        ["the book's map", createMission(level, { classic: true })],
        ...SEEDS.map((seed) => [`map ${seed}`, createMission(level, { seed })]),
    ];
}

// Checks that would have caught data mistakes such as the book's untyped trigger in "Under Siege"
function checkLevelData(mission) {
    const map = mission.map;

    assert.ok(map, "the level has a map");

    for (const [type, names] of Object.entries(mission.requirements)) {
        for (const name of names) {
            assert.ok(getSpec(type, name), `required ${type}/${name} exists`);
        }
    }

    const uids = new Set();

    for (const item of mission.items) {
        const spec = getSpec(item.type, item.name);

        assert.ok(spec, `item ${item.type}/${item.name} exists`);

        if (item.team !== undefined) {
            assert.ok(TEAMS.includes(item.team), `team ${item.team} is valid`);
        }

        if (item.uid !== undefined) {
            assert.ok(!uids.has(item.uid), `uid ${item.uid} is unique`);
            uids.add(item.uid);
        }

        // Buildings and oil fields are on the map (units may wait off the map to drive or fly in)
        if (item.type === "buildings" || item.type === "terrain") {
            const width = spec.baseWidth / GRID_SIZE;
            const height = Math.ceil(spec.baseHeight / GRID_SIZE);

            assert.ok(item.x >= 0 && item.y >= 0 && item.x + width <= map.mapGridWidth && item.y + height <= map.mapGridHeight, `${item.name} at ${item.x},${item.y} is on the map`);
        }
    }

    for (const trigger of mission.triggers) {
        assert.equal(typeof trigger.action, "function", "trigger has an action");

        if (trigger.type === "timed") {
            assert.ok(trigger.time > 0, "timed trigger has a time");
        } else {
            assert.equal(trigger.type, "conditional", "trigger type is timed or conditional");
            assert.equal(typeof trigger.condition, "function", "conditional trigger has a condition");
        }
    }
}

describe("level data", () => {
    for (const level of levels.singleplayer) {
        it(`campaign mission "${level.name}" is valid, on every map`, () => {
            for (const [name, mission] of missionsOf(level)) {
                try {
                    checkLevelData(mission);
                } catch (error) {
                    error.message = `${name}: ${error.message}`;
                    throw error;
                }

                assert.ok(mission.briefing.length > 0);
                assert.ok(Number.isInteger(mission.startX) && Number.isInteger(mission.startY));
            }
        });
    }

    it("the multiplayer map is valid and every spawn point fits on the map, on every map", () => {
        const [level] = levels.multiplayer;

        for (const [, mission] of missionsOf(level)) {
            const map = mission.map;

            checkLevelData(mission);
            assert.equal(mission.spawnLocations.length, 4);

            for (const spawn of mission.spawnLocations) {
                for (const item of mission.teamStartingItems) {
                    assert.ok(getSpec(item.type, item.name));

                    const x = item.x + spawn.x;
                    const y = item.y + spawn.y;

                    assert.ok(x >= 0 && x < map.mapGridWidth && y >= 0 && y < map.mapGridHeight, `${item.name} at ${x},${y} is on the map`);
                }
            }
        }
    });

    it("on the book's map, levels are exactly where the book put them", () => {
        const rescue = createMission(levels.singleplayer[0], { classic: true });
        const byUid = (uid) => rescue.items.find((item) => item.uid === uid);

        assert.equal(rescue.map, maps.plains);
        assert.deepEqual([byUid(-1).x, byUid(-1).y], [57, 12], "the hero's tank");
        assert.deepEqual([byUid(-3).x, byUid(-3).y], [-3, 2], "the convoy, off the map");
        assert.deepEqual(byUid(-2).orders, { type: "patrol", from: { x: 34, y: 20 }, to: { x: 42, y: 25 } });

        const [multiplayer] = levels.multiplayer;

        assert.deepEqual(createMission(multiplayer, { classic: true }).spawnLocations[0], { x: 48, y: 36, startX: 36, startY: 20 });
    });

    it("the map's obstructed tiles are all on the map", () => {
        for (const map of Object.values(maps)) {
            for (const [x, y] of map.mapObstructedTerrain) {
                assert.ok(x >= 0 && x < map.mapGridWidth && y >= 0 && y < map.mapGridHeight);
            }
        }
    });

    it("level definitions are frozen at the top level", () => {
        assert.ok(Object.isFrozen(levels));
        assert.ok(Object.isFrozen(maps));
    });
});
