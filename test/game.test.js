import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { levels } from "../client/js/core/data/levels.js";
import { Game } from "../client/js/core/game.js";
import { createMission } from "../client/js/core/missions.js";
import { makeGame, runTicks } from "./helpers.js";

describe("Game items", () => {
    it("gives every item a unique id and keeps explicit ids", () => {
        const game = makeGame({ items: [{ type: "vehicles", name: "transport", uid: -1, x: 21, y: 5, team: "blue" }] });
        const a = game.add({ type: "vehicles", name: "transport", x: 22, y: 5, team: "blue" });
        const b = game.add({ type: "vehicles", name: "transport", x: 23, y: 5, team: "blue" });

        assert.equal(game.getItemByUid(-1).name, "transport");
        assert.notEqual(a.uid, b.uid);
        assert.ok(a.uid > 0 && b.uid > 0);
    });

    it("never reuses an id, even after an explicitly numbered item is removed", () => {
        const game = makeGame({ items: [{ type: "vehicles", name: "transport", uid: 5, x: 21, y: 5, team: "blue" }] });

        game.remove(game.getItemByUid(5));

        assert.ok(game.add({ type: "vehicles", name: "transport", x: 22, y: 5, team: "blue" }).uid > 5);
    });

    it("does not modify the details it is given", () => {
        const game = makeGame();
        const details = { type: "vehicles", name: "transport", x: 22, y: 5, team: "blue" };

        game.add(details);

        assert.equal(details.uid, undefined);
    });

    it("tracks items by category and removes them from every list", () => {
        const game = makeGame({ items: [{ type: "vehicles", name: "scout-tank", uid: 1, x: 21, y: 5, team: "blue" }] });
        const tank = game.getItemByUid(1);

        game.selectItem(tank);
        assert.deepEqual(game.vehicles, [tank]);
        assert.deepEqual(game.selectedItems, [tank]);

        game.remove(tank);

        assert.deepEqual(game.items, []);
        assert.deepEqual(game.vehicles, []);
        assert.deepEqual(game.selectedItems, []);
        assert.equal(game.getItemByUid(1), undefined);
        assert.equal(game.isItemDead(1), true);
    });

    it("supports shift-click deselection", () => {
        const game = makeGame({ items: [{ type: "vehicles", name: "scout-tank", uid: 1, x: 21, y: 5, team: "blue" }] });
        const tank = game.getItemByUid(1);

        game.selectItem(tank, false);
        game.selectItem(tank, true);

        assert.equal(tank.selected, false);
        assert.deepEqual(game.selectedItems, []);
    });

    it("does not let unselectable items be selected", () => {
        const game = makeGame({ items: [{ type: "vehicles", name: "transport", uid: 1, x: 21, y: 5, team: "blue", selectable: false }] });

        game.selectItem(game.getItemByUid(1));

        assert.deepEqual(game.selectedItems, []);
    });
});

describe("Game levels", () => {
    it("loading a level does not change the level definition", () => {
        const level = createMission(levels.singleplayer[0], { classic: true });
        const before = JSON.stringify(level.items);
        const game = new Game();

        game.loadLevel(level, { team: "blue" });
        runTicks(game, 200);

        assert.equal(JSON.stringify(level.items), before);
    });

    it("restarting a level gives the same ids as the first time", () => {
        const game = new Game();
        const uidsOf = () => game.items.map((item) => item.uid);

        const level = createMission(levels.singleplayer[1], { seed: 5 });

        game.loadLevel(level, { team: "blue" });
        const first = uidsOf();

        runTicks(game, 50);
        game.loadLevel(level, { team: "blue" });

        assert.deepEqual(uidsOf(), first);
        assert.equal(new Set(first).size, first.length);
    });

    it("sorts items from back to front for drawing", () => {
        const game = makeGame({
            items: [
                { type: "vehicles", name: "transport", uid: 1, x: 21, y: 9, team: "blue" },
                { type: "vehicles", name: "transport", uid: 2, x: 25, y: 5, team: "blue" },
            ],
        });

        game.update();

        assert.deepEqual(game.sortedItems.map((item) => item.uid), [2, 1]);
    });
});

describe("Game commands", () => {
    const makeTanks = () => makeGame({
        items: [
            { type: "vehicles", name: "scout-tank", uid: 1, x: 21, y: 5, team: "blue" },
            { type: "vehicles", name: "scout-tank", uid: 2, x: 27, y: 10, team: "green" },
        ],
    });

    it("gives orders to units and resolves target ids", () => {
        const game = makeTanks();

        game.processCommand([1], { type: "attack", toUid: 2 });

        assert.equal(game.getItemByUid(1).orders.type, "attack");
        assert.equal(game.getItemByUid(1).orders.to, game.getItemByUid(2));
    });

    it("gives each unit its own copy of the orders", () => {
        const game = makeGame({
            items: [
                { type: "vehicles", name: "scout-tank", uid: 1, x: 21, y: 5, team: "blue" },
                { type: "vehicles", name: "scout-tank", uid: 3, x: 22, y: 5, team: "blue" },
            ],
        });

        game.processCommand([1, 3], { type: "move", to: { x: 25, y: 8 } });

        assert.notEqual(game.getItemByUid(1).orders, game.getItemByUid(3).orders);
    });

    it("ignores commands with missing or invalid details", () => {
        const game = makeTanks();

        game.processCommand([1], { type: "move" });
        game.processCommand([1], { type: "move", to: { x: "a", y: 1 } });
        game.processCommand([1], { type: "attack", toUid: 999 });
        game.processCommand([1], { type: "patrol", to: { x: 1, y: 1 } });
        game.processCommand([1], { type: "construct-unit" });
        game.processCommand("1", { type: "hunt" });
        game.processCommand([1], null);

        assert.equal(game.getItemByUid(1).orders.type, "stand");
        runTicks(game, 5);
    });

    it("survives forged commands from a multiplayer opponent", () => {
        const game = makeGame({
            items: [
                { type: "vehicles", name: "scout-tank", uid: 1, x: 21, y: 5, team: "blue" },
                { type: "vehicles", name: "harvester", uid: 3, x: 22, y: 7, team: "blue" },
                { type: "buildings", name: "starport", uid: 4, x: 25, y: 4, team: "blue" },
                { type: "vehicles", name: "transport", uid: 2, x: 23, y: 5, team: "green", life: 1 },
            ],
            cash: { blue: 5000, green: 0 },
        });

        // A made-up oil field object instead of a real one
        game.processCommand([3], { type: "deploy", to: { x: 25, y: 8, name: "oilfield", type: "terrain" } });
        // A patrol with no destination hidden in previousOrder, restored once the target dies
        game.processCommand([1], { type: "attack", toUid: 2, previousOrder: { type: "patrol" } });
        game.update();
        // A new unit that would start on a patrol with no destination
        game.processCommand([4], { type: "construct-unit", details: { type: "vehicles", name: "scout-tank", orders: { type: "patrol" } } });

        runTicks(game, 200);

        assert.equal(game.getItemByUid(3).orders.type, "stand");
        assert.equal(game.buildings.filter((item) => item.name === "harvester").length, 0);
        assert.equal(game.getItemByUid(1).orders.type, "stand");
        assert.ok(game.vehicles.some((item) => item.name === "scout-tank" && item.uid !== 1 && item.orders.type !== "patrol"));
    });

    it("only lets a team command its own units when a team is given", () => {
        const game = makeTanks();

        game.processCommand([1, 2], { type: "hunt" }, "green");

        assert.equal(game.getItemByUid(1).orders.type, "stand");
        assert.equal(game.getItemByUid(2).orders.type, "hunt");
    });

    it("sends commands through the command handler when one is set", () => {
        const game = makeTanks();
        const sent = [];

        game.commandHandler = (uids, details) => sent.push([uids, details]);
        game.sendCommand([1], { type: "hunt" });

        assert.deepEqual(sent, [[[1], { type: "hunt" }]]);
        assert.equal(game.getItemByUid(1).orders.type, "stand");
    });
});

describe("Game map grids", () => {
    it("marks terrain from the map as impassable", () => {
        const game = makeGame();

        assert.equal(game.getPassableGrid()[0][0], 1);
        assert.equal(game.getPassableGrid()[5][24], 0);
    });

    it("marks buildings as impassable and updates when they are added or removed", () => {
        const game = makeGame();

        assert.equal(game.getPassableGrid()[6][23], 0);

        const starport = game.add({ type: "buildings", name: "starport", x: 22, y: 5, team: "blue" });

        // Only the top row of the starport blocks units; the landing bay below is passable
        assert.equal(game.getPassableGrid()[5][23], 1);
        assert.equal(game.getPassableGrid()[6][23], 0);

        game.remove(starport);
        assert.equal(game.getPassableGrid()[5][23], 0);
    });

    it("checks building placement against terrain, buildings, vehicles, the map edge and hidden tiles", () => {
        const game = makeGame({
            items: [
                { type: "buildings", name: "base", x: 22, y: 5, team: "blue" },
                { type: "vehicles", name: "transport", x: 26.5, y: 9.5, team: "blue" },
            ],
        });
        const canPlace = (name, x, y, isHidden) => game.checkBuildingPlacement(name, x, y, isHidden).canDeployBuilding;

        assert.equal(canPlace("ground-turret", 25, 5), true);
        assert.equal(canPlace("ground-turret", 23, 6), false, "on top of the base");
        assert.equal(canPlace("ground-turret", 26, 9), false, "on top of a vehicle");
        assert.equal(canPlace("ground-turret", 0, 0), false, "on rocks");
        assert.equal(canPlace("starport", 59, 5), false, "partly off the map");
        assert.equal(canPlace("ground-turret", 25, 5, () => true), false, "under fog");

        // A base at 23,4 would overlap the existing base (22-23, 5-6) only at tile 23,5
        const { placementGrid } = game.checkBuildingPlacement("base", 23, 4);

        assert.deepEqual(placementGrid, [[1, 1], [2, 1]]);
    });
});

describe("Fog of war", () => {
    it("reveals the area around the player's own units only", () => {
        const game = makeGame({
            items: [
                { type: "vehicles", name: "scout-tank", x: 22, y: 6, team: "blue" },
                { type: "vehicles", name: "scout-tank", x: 40, y: 30, team: "green" },
            ],
        });

        game.update();

        assert.equal(game.fog.isTileFogged(22, 6), false);
        assert.equal(game.fog.isTileFogged(24, 6), false);
        assert.equal(game.fog.isTileFogged(40, 30), true);
        assert.equal(game.fog.isPointOverFog(22 * 20, 6 * 20), false);
        assert.equal(game.fog.isPointOverFog(-5, 10), true);
        assert.equal(game.fog.isTileFogged(60, 5), true);
    });
});
