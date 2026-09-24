import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getSpec } from "../client/js/core/entities/index.js";
import { buildSpriteIndex } from "../client/js/core/entities/sprites.js";
import { makeGame, runTicks } from "./helpers.js";

// The tiles x 20-28, y 4-11 of the plains map have no terrain obstructions, so tests place units there

describe("sprite index", () => {
    it("lays out animations with and without directions one after another", () => {
        const { spriteArray, spriteCount } = buildSpriteIndex([
            { name: "fly", count: 1, directions: 8 },
            { name: "explode", count: 7 },
        ]);

        assert.deepEqual(spriteArray["fly-0"], { name: "fly-0", count: 1, offset: 0 });
        assert.deepEqual(spriteArray["fly-7"], { name: "fly-7", count: 1, offset: 7 });
        assert.deepEqual(spriteArray.explode, { name: "explode", count: 7, offset: 8 });
        assert.equal(spriteCount, 15);
    });

    it("is precomputed for every entity spec", () => {
        assert.equal(getSpec("buildings", "starport").spriteArray.closing.offset, 9);
        assert.equal(getSpec("vehicles", "heavy-tank").spriteCount, 8);
    });
});

describe("directions", () => {
    const game = makeGame({ items: [{ type: "vehicles", name: "heavy-tank", uid: 1, x: 24, y: 8, team: "blue" }] });
    const tank = game.getItemByUid(1);

    it("finds the direction towards a point (0 is up, 2 is right, 4 is down, 6 is left)", () => {
        assert.equal(tank.findAngle({ x: 24, y: 2 }), 0);
        assert.equal(tank.findAngle({ x: 30, y: 8 }), 2);
        assert.equal(tank.findAngle({ x: 24, y: 12 }), 4);
        assert.equal(tank.findAngle({ x: 20, y: 8 }), 6);
        assert.equal(tank.findAngle({ x: 28, y: 4 }), 1);
    });

    it("turns the short way round, a little each tick", () => {
        tank.direction = 7;
        tank.turnTo(1);

        // heavy-tank turnSpeed 4 * 1/8 = 0.5 per tick, going clockwise through 0
        assert.equal(tank.direction, 7.5);
        assert.equal(tank.turning, true);

        tank.turnTo(1);
        tank.turnTo(1);
        tank.turnTo(1);
        tank.turnTo(1);

        assert.equal(tank.direction, 1);
        assert.equal(tank.turning, false);
    });
});

describe("vehicles", () => {
    it("drive to a destination and stop there", () => {
        const game = makeGame({ items: [{ type: "vehicles", name: "heavy-tank", uid: 1, x: 21, y: 5, team: "blue" }] });
        const tank = game.getItemByUid(1);

        game.processCommand([1], { type: "move", to: { x: 27, y: 10 } });

        const ticks = runTicks(game, 500, () => tank.orders.type === "stand");

        assert.ok(ticks < 500, "tank should arrive");
        assert.ok(Math.hypot(tank.x - 27, tank.y - 10) < 1, `tank stopped at ${tank.x}, ${tank.y}`);
    });

    it("find their way around obstacles", () => {
        // From one side of the rocks at x 3-13, y 9-11 to the other
        const game = makeGame({ items: [{ type: "vehicles", name: "scout-tank", uid: 1, x: 8, y: 7, team: "blue" }] });
        const tank = game.getItemByUid(1);

        game.processCommand([1], { type: "move", to: { x: 8.5, y: 14.5 } });

        const ticks = runTicks(game, 1000, () => tank.orders.type === "stand");

        assert.ok(ticks < 1000, "tank should arrive");
        assert.ok(Math.hypot(tank.x - 8.5, tank.y - 14.5) < 1.5, `tank stopped at ${tank.x}, ${tank.y}`);
    });

    it("attack enemies that come into sight and destroy them", () => {
        const game = makeGame({
            items: [
                { type: "vehicles", name: "heavy-tank", uid: 1, x: 21, y: 6, team: "blue" },
                { type: "vehicles", name: "scout-tank", uid: 2, x: 24, y: 6, team: "green", life: 20, orders: { type: "sentry" } },
            ],
        });
        const sounds = [];

        game.on("sound", (name) => sounds.push(name));

        const ticks = runTicks(game, 300, () => game.isItemDead(2));

        assert.ok(ticks < 300, "the scout tank should be destroyed");
        assert.ok(sounds.includes("cannon-ball"), "the heavy tank fires cannon balls");
        assert.ok(sounds.includes("bullet"), "the scout tank fires back");
        assert.equal(game.getItemByUid(2), undefined);
    });

    it("report shots, hits and destroyed units, for the visual effects", () => {
        const game = makeGame({
            items: [
                { type: "vehicles", name: "heavy-tank", uid: 1, x: 21, y: 6, team: "blue" },
                { type: "vehicles", name: "scout-tank", uid: 2, x: 24, y: 6, team: "green", life: 20, orders: { type: "sentry" } },
            ],
        });
        const events = [];

        game.on("fire", (item, bullet) => events.push(["fire", item.uid, bullet.name, bullet.target.uid]));
        game.on("hit", (bullet, target) => events.push(["hit", bullet.name, target?.uid]));
        game.on("destroyed", (item) => events.push(["destroyed", item.uid, item.lifeCode, game.getItemByUid(item.uid)]));

        runTicks(game, 300, () => game.isItemDead(2));

        assert.deepEqual(events.find(([type, uid]) => type === "fire" && uid === 1), ["fire", 1, "cannon-ball", 2]);
        assert.deepEqual(events.find(([type, uid]) => type === "fire" && uid === 2), ["fire", 2, "bullet", 1]);
        assert.ok(events.some(([type, name, target]) => type === "hit" && name === "cannon-ball" && target === 2));
        assert.deepEqual(events.at(-1), ["destroyed", 2, "dead", undefined], "reported once it is gone from the game");
        assert.equal(events.filter(([type]) => type === "destroyed").length, 1);
    });

    it("report a bullet that runs out of range as hitting the ground", () => {
        const game = makeGame({
            items: [
                { type: "vehicles", name: "scout-tank", uid: 1, x: 21, y: 6, team: "blue" },
                { type: "vehicles", name: "transport", uid: 2, x: 30, y: 6, team: "green" },
            ],
        });
        const hits = [];

        game.on("hit", (bullet, target) => hits.push(target));
        game.add({ type: "bullets", name: "bullet", x: 22, y: 6, direction: 2, target: game.getItemByUid(2) });
        runTicks(game, 30, () => hits.length > 0);

        assert.deepEqual(hits, [undefined]);
    });

    it("harvesters deploy on oil fields and start earning money", () => {
        const game = makeGame({
            items: [
                { type: "vehicles", name: "harvester", uid: 1, x: 21, y: 5, team: "blue" },
                { type: "terrain", name: "oilfield", uid: 2, x: 25, y: 8, action: "hint" },
            ],
        });

        game.processCommand([1], { type: "deploy", toUid: 2 });
        runTicks(game, 300, () => game.buildings.length > 0);

        const [building] = game.buildings;

        assert.equal(building?.name, "harvester");
        assert.deepEqual([building.x, building.y, building.team], [25, 8, "blue"]);
        assert.equal(game.getItemByUid(1), undefined, "the harvester vehicle is gone");
        assert.equal(game.getItemByUid(2), undefined, "the oil field is used up");

        runTicks(game, 60);
        assert.ok(game.cash.blue > 0, "the harvester earns cash");
    });

    it("only harvesters can deploy, and only onto oil fields", () => {
        const game = makeGame({
            items: [
                { type: "vehicles", name: "scout-tank", uid: 1, x: 21, y: 5, team: "blue" },
                { type: "buildings", name: "base", uid: 2, x: 25, y: 8, team: "green" },
            ],
        });

        game.processCommand([1], { type: "deploy", toUid: 2 });
        runTicks(game, 50);

        assert.ok(game.getItemByUid(2), "the base must not be replaced");
        assert.equal(game.buildings.filter((item) => item.name === "harvester").length, 0);
    });
});

describe("aircraft", () => {
    it("fly straight over terrain", () => {
        const game = makeGame({ items: [{ type: "aircraft", name: "wraith", uid: 1, x: 8, y: 6, team: "blue", direction: 4 }] });
        const wraith = game.getItemByUid(1);

        game.processCommand([1], { type: "move", to: { x: 8, y: 14 } });
        runTicks(game, 200, () => wraith.orders.type === "stand");

        assert.ok(Math.abs(wraith.x - 8) < 0.01, "no detour needed");
        assert.ok(Math.abs(wraith.y - 14) < 1);
    });

    it("wraiths attack aircraft but ignore ground units", () => {
        const game = makeGame({
            items: [
                { type: "aircraft", name: "wraith", uid: 1, x: 22, y: 8, team: "blue" },
                { type: "vehicles", name: "scout-tank", uid: 2, x: 24, y: 8, team: "green", orders: { type: "hunt" } },
            ],
        });

        runTicks(game, 50);
        assert.equal(game.getItemByUid(1).orders.type, "stand");

        game.add({ type: "aircraft", name: "chopper", uid: 3, x: 25, y: 7, team: "green" });
        runTicks(game, 5);
        assert.equal(game.getItemByUid(1).orders.type, "attack");
        assert.equal(game.getItemByUid(1).orders.to.uid, 3);
    });
});

describe("buildings", () => {
    it("ground turrets attack land units in range", () => {
        const game = makeGame({
            items: [
                { type: "buildings", name: "ground-turret", uid: 1, x: 24, y: 8, team: "green" },
                { type: "vehicles", name: "scout-tank", uid: 2, x: 24, y: 5, team: "blue", orders: { type: "sentry" }, life: 10 },
            ],
        });

        const ticks = runTicks(game, 300, () => game.isItemDead(2));

        assert.ok(ticks < 300, "the turret destroys the scout tank");
    });

    it("the base constructs buildings when there is enough cash and space", () => {
        const game = makeGame({
            cash: { blue: 2500, green: 0 },
            items: [{ type: "buildings", name: "base", uid: 1, x: 21, y: 5, team: "blue" }],
        });

        game.processCommand([1], { type: "construct-building", details: { type: "buildings", name: "starport", x: 25, y: 5 } });
        game.update();

        const starport = game.buildings.find((item) => item.name === "starport");

        assert.ok(starport);
        assert.deepEqual([starport.x, starport.y, starport.team, starport.action], [25, 5, "blue", "teleport"]);
        assert.equal(game.cash.blue, 500);
    });

    it("the base refuses to build without enough cash or on occupied ground", () => {
        const game = makeGame({
            cash: { blue: 1000, green: 0 },
            items: [{ type: "buildings", name: "base", uid: 1, x: 21, y: 5, team: "blue" }],
        });
        const messages = [];

        game.on("message", (from, message) => messages.push(message));

        game.processCommand([1], { type: "construct-building", details: { type: "buildings", name: "starport", x: 25, y: 5 } });
        game.update();
        assert.match(messages.at(-1), /Insufficient Funds/);

        game.cash.blue = 5000;
        game.processCommand([1], { type: "construct-building", details: { type: "buildings", name: "ground-turret", x: 22, y: 6 } });
        game.update();
        assert.match(messages.at(-1), /Cannot deploy building here/);

        assert.equal(game.buildings.length, 1);
        assert.equal(game.cash.blue, 5000);
    });

    it("the base only builds constructible buildings", () => {
        const game = makeGame({
            cash: { blue: 99999, green: 0 },
            items: [{ type: "buildings", name: "base", uid: 1, x: 21, y: 5, team: "blue" }],
        });

        game.processCommand([1], { type: "construct-building", details: { type: "buildings", name: "base", x: 25, y: 5 } });
        game.update();

        assert.equal(game.buildings.length, 1);
    });

    it("the starport teleports in units", () => {
        const game = makeGame({
            cash: { blue: 1000, green: 0 },
            items: [{ type: "buildings", name: "starport", uid: 1, x: 22, y: 5, team: "blue" }],
        });

        // The starport needs one tick to become healthy before it accepts orders
        game.update();
        game.processCommand([1], { type: "construct-unit", details: { type: "vehicles", name: "scout-tank", orders: { type: "hunt" } } });

        runTicks(game, 100, () => game.vehicles.length > 0);

        const [tank] = game.vehicles;

        assert.equal(tank?.name, "scout-tank");
        assert.equal(tank.team, "blue");
        assert.equal(tank.orders.type, "hunt");
        assert.equal(game.cash.blue, 500);
    });

    it("the starport waits for the landing bay to clear and warns the owner", () => {
        const game = makeGame({
            cash: { blue: 1000, green: 0 },
            items: [
                { type: "buildings", name: "starport", uid: 1, x: 22, y: 5, team: "blue" },
                { type: "vehicles", name: "transport", uid: 2, x: 23, y: 6.5, team: "blue" },
            ],
        });
        const messages = [];

        game.on("message", (from, message) => messages.push(message));
        game.update();
        game.processCommand([1], { type: "construct-unit", details: { type: "vehicles", name: "scout-tank" } });
        game.update();

        assert.match(messages.at(-1), /landing bay is occupied/);
        assert.equal(game.cash.blue, 1000);
    });
});

describe("bullets", () => {
    it("fizzle out when the target is out of range", () => {
        const game = makeGame({ items: [{ type: "vehicles", name: "transport", uid: 1, x: 28, y: 8, team: "green" }] });
        const target = game.getItemByUid(1);

        game.add({ type: "bullets", name: "bullet", uid: 2, x: 20, y: 8, direction: 2, target });
        runTicks(game, 30);

        assert.equal(game.bullets.length, 0);
        assert.equal(target.life, target.hitPoints);
    });
});
