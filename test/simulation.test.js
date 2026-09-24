// Whole-game simulations: play levels headlessly with scripted commands
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TICK_MS } from "../client/js/core/config.js";
import { levels } from "../client/js/core/data/levels.js";
import { Game } from "../client/js/core/game.js";
import { createMission } from "../client/js/core/missions.js";
import { runTicks, snapshot } from "./helpers.js";

const MINUTE = 60000 / TICK_MS;

// Start a campaign mission on the book's map, or on a generated map ({ seed })
function startCampaignLevel(index, map = { classic: true }) {
    const game = new Game();
    const events = { messages: [], result: undefined };

    game.on("message", (from, message) => events.messages.push({ from, message, time: game.time }));
    game.on("levelend", (success) => {
        events.result = success;
        game.end();
    });

    game.loadLevel(createMission(levels.singleplayer[index], map), { team: "blue" });

    return { game, events };
}

describe("campaign", () => {
    for (const [index, level] of levels.singleplayer.entries()) {
        it(`mission ${index + 1} "${level.name}" runs for 12 minutes of game time without errors`, () => {
            const { game, events } = startCampaignLevel(index);

            runTicks(game, 12 * MINUTE, () => events.result !== undefined);

            assert.ok(events.messages.length > 0, "the mission's story messages are shown");
        });
    }

    it("mission 1 can be won by clearing the patrols and escorting the convoy home", () => {
        const { game, events } = startCampaignLevel(0);
        let phase = "hunt";

        // The hero tank (-1) hunts down both rebel scouts, then drives to the convoy
        game.sendCommand([-1], { type: "hunt" });

        runTicks(game, 10 * MINUTE, () => {
            if (phase === "hunt" && game.isItemDead(-2) && game.isItemDead(-5)) {
                game.sendCommand([-1], { type: "move", to: { x: 5, y: 5 } });
                phase = "rescue";
            } else if (phase === "rescue" && game.getItemByUid(-3)?.orders.type === "guard") {
                // The convoy follows the hero back to base
                game.sendCommand([-1], { type: "move", to: { x: 56, y: 14 } });
                phase = "escort";
            }

            return events.result !== undefined;
        });

        assert.equal(events.result, true);
        assert.deepEqual(events.messages.map(({ from }) => from), ["op", "op", "op", "driver", "driver"]);
    });

    for (const seed of [1, 2, 3]) {
        it(`mission 1 can be won on generated map ${seed}, wherever the convoy is`, () => {
            const { game, events } = startCampaignLevel(0, { seed });
            const { convoy, base } = game.currentLevel.sites;
            let phase = "hunt";

            // As above, but driving to wherever this map put the convoy and the base
            game.sendCommand([-1], { type: "hunt" });

            runTicks(game, 12 * MINUTE, () => {
                if (phase === "hunt" && game.isItemDead(-2) && game.isItemDead(-5)) {
                    game.sendCommand([-1], { type: "move", to: { x: convoy.cx, y: convoy.cy } });
                    phase = "rescue";
                } else if (phase === "rescue" && game.getItemByUid(-3)?.orders.type === "guard") {
                    game.sendCommand([-1], { type: "move", to: { x: base.cx, y: base.cy } });
                    phase = "escort";
                }

                return events.result !== undefined;
            });

            assert.equal(events.result, true, `ended in phase ${phase}`);
            assert.deepEqual(events.messages.map(({ from }) => from), ["op", "op", "op", "driver", "driver"]);
        });
    }

    for (const [index, level] of levels.singleplayer.entries()) {
        it(`mission ${index + 1} "${level.name}" runs on generated maps without errors`, () => {
            for (const seed of [11, 12]) {
                const { game, events } = startCampaignLevel(index, { seed });

                runTicks(game, 6 * MINUTE, () => events.result !== undefined);
                assert.ok(events.messages.length > 0, "the mission's story messages are shown");
            }
        });
    }

    it("mission 1 is lost if the hero tank is destroyed", () => {
        const { game, events } = startCampaignLevel(0);

        game.getItemByUid(-1).life = 0;
        runTicks(game, 20);

        assert.equal(events.result, false);
    });

    it("mission 3 is lost if a transport is destroyed (a trigger the book never ran)", () => {
        const { game, events } = startCampaignLevel(2);

        game.getItemByUid(-2).life = 0;
        runTicks(game, 20);

        assert.equal(events.result, false);
    });
});

describe("multiplayer lockstep", () => {
    // Set up a multiplayer game the same way the client does when the server says "initialize-level"
    function startMultiplayerGame(team, spawnLocations = { blue: 0, green: 3 }, map = { classic: true }) {
        const game = new Game();
        const level = createMission(levels.multiplayer[0], map);

        game.loadLevel(level, { team });

        for (const [spawnTeam, spawnIndex] of Object.entries(spawnLocations)) {
            const spawn = level.spawnLocations[spawnIndex];

            for (const item of level.teamStartingItems) {
                game.add({ ...item, x: item.x + spawn.x, y: item.y + spawn.y, team: spawnTeam });
            }
        }

        return game;
    }

    it("two clients given the same commands stay identical", () => {
        const blueClient = startMultiplayerGame("blue");
        const greenClient = startMultiplayerGame("green");
        let shotsFired = 0;

        blueClient.on("sound", () => shotsFired++);

        const unitsOf = (game, team) => game.items.filter((item) => item.team === team && item.canAttack).map((item) => item.uid);
        const harvesterOf = (game, team) => game.items.find((item) => item.team === team && item.name === "harvester").uid;
        const oilfields = blueClient.terrain.map((item) => item.uid);

        // Commands as the server would broadcast them, keyed by tick
        const schedule = new Map([
            [5, [{ uids: unitsOf(blueClient, "blue"), details: { type: "move", to: { x: 30, y: 20 } }, team: "blue" }]],
            [8, [{ uids: [harvesterOf(blueClient, "green")], details: { type: "deploy", toUid: oilfields[0] }, team: "green" }]],
            [40, [{ uids: unitsOf(blueClient, "green"), details: { type: "hunt" }, team: "green" }]],
            [60, [{ uids: [harvesterOf(blueClient, "blue")], details: { type: "deploy", toUid: oilfields[2] }, team: "blue" }]],
        ]);

        for (let tick = 0; tick < 3 * MINUTE; tick++) {
            for (const game of [blueClient, greenClient]) {
                for (const { uids, details, team } of schedule.get(tick) ?? []) {
                    game.processCommand(uids, details, team);
                }

                game.update();
            }

            assert.equal(snapshot(blueClient), snapshot(greenClient), `clients diverged at tick ${tick}`);
        }

        // Make sure the game actually did something interesting
        assert.ok(blueClient.buildings.some((item) => item.name === "harvester"), "a harvester was deployed");
        assert.ok(shotsFired > 0, "the hunting units found a fight");
    });

    it("two clients generate the same map from the server's seed, and stay identical on it", () => {
        const map = { seed: 99 };
        const blueClient = startMultiplayerGame("blue", { blue: 1, green: 2 }, map);
        const greenClient = startMultiplayerGame("green", { blue: 1, green: 2 }, map);

        assert.deepEqual(greenClient.currentMap, blueClient.currentMap);

        const unitsOf = (game, team) => game.items.filter((item) => item.team === team && item.canAttack).map((item) => item.uid);

        for (let tick = 0; tick < 2 * MINUTE; tick++) {
            for (const game of [blueClient, greenClient]) {
                if (tick === 5) {
                    game.processCommand(unitsOf(blueClient, "blue"), { type: "hunt" }, "blue");
                    game.processCommand(unitsOf(blueClient, "green"), { type: "hunt" }, "green");
                }

                game.update();
            }

            assert.equal(snapshot(blueClient), snapshot(greenClient), `clients diverged at tick ${tick}`);
        }
    });

    it("the defeat trigger fires when a player has nothing left", () => {
        const game = startMultiplayerGame("green");
        const results = [];

        game.on("levelend", (success) => results.push(success));

        for (const item of game.items.filter((item) => item.team === "green")) {
            game.remove(item);
        }

        runTicks(game, 20);

        assert.deepEqual(results, [false]);
    });
});
