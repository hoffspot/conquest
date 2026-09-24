import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GRID_SIZE } from "../client/js/core/config.js";
import { Effects, MAX_PARTICLES } from "../client/js/app/effects.js";
import { heightOnScreen } from "../client/js/app/perspective.js";
import { makeGame } from "./helpers.js";

// A game with a heavy tank facing east at 20,10 and an enemy tank to shoot at, with the effects
// listening to its events as in the browser
function battle({ reducedMotion = false } = {}) {
    const game = makeGame({
        items: [
            { type: "vehicles", name: "heavy-tank", uid: 1, x: 20, y: 10, team: "blue", direction: 2 },
            { type: "vehicles", name: "heavy-tank", uid: 2, x: 24, y: 10, team: "green", direction: 6 },
            { type: "buildings", name: "starport", uid: 3, x: 20, y: 14, team: "green" },
        ],
    });
    const effects = new Effects({ game, reducedMotion });

    game.fog.isPointOverFog = () => false;
    game.on("fire", (item, bullet) => effects.fire(item, bullet));
    game.on("hit", (bullet, target) => effects.hit(bullet, target));
    game.on("destroyed", (item) => effects.destroyed(item));

    return { game, effects, tank: game.getItemByUid(1), enemy: game.getItemByUid(2), starport: game.getItemByUid(3) };
}

// Run the effects for a while, a frame at a time
function play(effects, milliseconds, items = []) {
    for (let t = 0; t < milliseconds; t += 16) {
        effects.update(16, items);
    }
}

describe("effects", () => {
    it("a shot makes a muzzle flash at the end of the gun barrel, with smoke and dust", () => {
        const { effects, tank, enemy } = battle();

        tank.fireAt(enemy, 2);

        const [flash] = effects.particles.filter((p) => p.kind === "flash");

        // The heavy tank's barrel ends 14 pixels in front of its centre, 6.4 pixels up
        assert.ok(flash, "a muzzle flash");
        assert.ok(Math.abs(flash.x - (20 * GRID_SIZE + 14)) < 1e-9 && Math.abs(flash.y - 10 * GRID_SIZE) < 1e-9);
        assert.ok(Math.abs(flash.z - heightOnScreen(6.4)) < 1e-9);

        const kinds = new Set(effects.particles.map((p) => p.kind));

        for (const kind of ["glow", "light", "spark", "smoke"]) {
            assert.ok(kinds.has(kind), `and ${kind}`);
        }

        assert.ok(effects.particles.some((p) => p.color === "dust"), "the blast kicks up dust");
    });

    it("a hit makes an explosion that burns out, leaving smoke and a scorch mark that fade too", () => {
        const { game, effects, tank, enemy } = battle();
        let hits = 0;

        game.on("hit", () => hits++);
        tank.fireAt(enemy, 2);
        play(effects, 1000);

        for (let tick = 0; tick < 100 && !hits; tick++) {
            game.update();
        }

        assert.equal(hits, 1);
        assert.ok(effects.particles.some((p) => p.kind === "fire"), "a fireball");
        assert.equal(effects.scorchCount, 1);

        play(effects, 400);
        assert.ok(effects.particles.some((p) => p.kind === "smoke" && p.color === "dark"), "smoke rises after the fireball");

        play(effects, 3000);
        assert.equal(effects.particles.filter((p) => p.kind === "fire").length, 0, "the fire has gone out");

        play(effects, 25000);
        assert.equal(effects.count, 0);
        assert.equal(effects.scorchCount, 0);
    });

    it("nothing moves while the game is paused", () => {
        const { effects, tank, enemy } = battle();

        tank.fireAt(enemy, 2);
        play(effects, 50);

        const before = JSON.stringify(effects.particles);

        effects.update(0);
        assert.equal(JSON.stringify(effects.particles), before);
    });

    it("destroyed units explode and keep burning for a while; buildings explode several times", () => {
        const { game, effects, enemy, starport } = battle();

        enemy.life = 0;
        game.update();
        assert.ok(effects.particles.some((p) => p.kind === "ring"), "a shock wave");
        assert.ok(effects.particles.some((p) => p.kind === "debris"), "flying debris");

        play(effects, 2500);
        assert.ok(effects.particles.some((p) => p.kind === "fire"), "the wreck is still burning");

        play(effects, 3000);
        assert.equal(effects.particles.filter((p) => p.kind === "fire").length, 0, "and burns out");

        starport.life = 0;
        game.update();

        const rings = () => effects.particles.filter((p) => p.kind === "ring").length;

        assert.equal(rings(), 1);
        play(effects, 700);
        assert.ok(effects.scorchCount >= 4, "more blasts follow across the building");
    });

    it("never keeps more than MAX_PARTICLES particles, however much explodes", () => {
        const { game, effects } = battle();
        let most = 0;

        for (let i = 0; i < 60; i++) {
            const tank = game.add({ type: "vehicles", name: "heavy-tank", x: 10 + (i % 10), y: 5 + Math.floor(i / 10), team: "green" });

            effects.destroyed(tank);
            most = Math.max(most, effects.count);
            play(effects, 16);
        }

        assert.equal(most, MAX_PARTICLES, "the pool fills up, and no further");
    });

    it("shows nothing that the fog of war hides", () => {
        const { game, effects, tank, enemy } = battle();

        game.fog.isPointOverFog = () => true;
        tank.fireAt(enemy, 2);
        enemy.life = 0;
        game.update();
        play(effects, 100);

        assert.equal(effects.count, 0);
        assert.deepEqual(effects.shakeOffset, { x: 0, y: 0 });
    });

    it("big explosions shake the view briefly, unless the player prefers reduced motion", () => {
        for (const reducedMotion of [false, true]) {
            const { effects, starport } = battle({ reducedMotion });
            let most = 0;

            effects.destroyed(starport);

            for (let t = 0; t < 300; t += 16) {
                effects.update(16);
                most = Math.max(most, Math.hypot(effects.shakeOffset.x, effects.shakeOffset.y));
            }

            if (reducedMotion) {
                assert.equal(most, 0);
            } else {
                assert.ok(most > 0.5 && most <= 4 * Math.SQRT2, `shakes (${most.toFixed(2)} pixels)`);
            }

            play(effects, 1000);
            assert.deepEqual(effects.shakeOffset, { x: 0, y: 0 }, "and settles");
        }
    });

    it("damaged units and buildings smoke", () => {
        const { effects, enemy, starport } = battle();

        enemy.lifeCode = "damaged";
        starport.lifeCode = "damaged";

        let flames = 0;

        for (let t = 0; t < 3000; t += 16) {
            effects.update(16, [enemy, starport]);
            flames += effects.particles.filter((p) => p.kind === "fire" && p.age === 0).length;
        }

        const smoke = effects.particles.filter((p) => p.kind === "smoke");

        assert.ok(smoke.some((p) => Math.abs(p.x - enemy.x * GRID_SIZE) < 10), "over the tank");
        assert.ok(smoke.some((p) => Math.abs(p.x - (starport.x * GRID_SIZE + starport.baseWidth / 2)) < 20), "over the starport");
        assert.ok(flames > 0, "and the building burns");
    });

    it("draws shots in flight instead of their sprites", () => {
        const { game, effects, tank, enemy } = battle();

        tank.fireAt(enemy, 2);

        const [bullet] = game.bullets;

        assert.equal(effects.drawBullet(bullet, 400, 200), true);

        bullet.action = "explode";
        assert.equal(effects.drawBullet(bullet, 400, 200), true, "an exploding shot is drawn as its explosion");
        assert.equal(effects.drawBullet({ name: "laser", type: "bullets" }, 0, 0), false, "unknown weapons keep their sprites");
    });
});
