import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TEAMS } from "../client/js/core/config.js";
import { levels } from "../client/js/core/data/levels.js";
import { maps } from "../client/js/core/data/maps.js";
import { getSpec } from "../client/js/core/entities/index.js";

// Checks that would have caught data mistakes such as the book's untyped trigger in "Under Siege"
function checkLevelData(level) {
    const map = maps[level.mapName];

    assert.ok(map, `map ${level.mapName} exists`);

    for (const [type, names] of Object.entries(level.requirements)) {
        for (const name of names) {
            assert.ok(getSpec(type, name), `required ${type}/${name} exists`);
        }
    }

    const uids = new Set();

    for (const item of level.items) {
        assert.ok(getSpec(item.type, item.name), `item ${item.type}/${item.name} exists`);

        if (item.team !== undefined) {
            assert.ok(TEAMS.includes(item.team), `team ${item.team} is valid`);
        }

        if (item.uid !== undefined) {
            assert.ok(!uids.has(item.uid), `uid ${item.uid} is unique`);
            uids.add(item.uid);
        }
    }

    for (const trigger of level.triggers) {
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
        it(`campaign mission "${level.name}" is valid`, () => {
            checkLevelData(level);
            assert.ok(level.briefing.length > 0);
            assert.ok(Number.isInteger(level.startX) && Number.isInteger(level.startY));
        });
    }

    it("the multiplayer map is valid and every spawn point fits on the map", () => {
        const [level] = levels.multiplayer;
        const map = maps[level.mapName];

        checkLevelData(level);

        for (const spawn of level.spawnLocations) {
            for (const item of level.teamStartingItems) {
                assert.ok(getSpec(item.type, item.name));

                const x = item.x + spawn.x;
                const y = item.y + spawn.y;

                assert.ok(x >= 0 && x < map.mapGridWidth && y >= 0 && y < map.mapGridHeight, `${item.name} at ${x},${y} is on the map`);
            }
        }
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
