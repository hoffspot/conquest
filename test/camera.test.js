// How the camera follows the player (client/js/app/camera.js): from behind them from their first
// step, easing round as they turn; turned and tilted by a drag, and swinging back round behind
// them once they walk again
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CameraFollow, PITCH } from "../client/js/app/camera.js";

const FRAME = 1 / 60;
const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

// Walk a player for `seconds` at a velocity (m/s), from `from`, with the camera following
function walk(camera, { from, vx, vz, seconds, lowest }) {
    const player = { ...from, vx, vz };

    for (let t = 0; t < seconds; t += FRAME) {
        player.x += vx * FRAME;
        player.z += vz * FRAME;
        camera.update(FRAME, { player, lowest });
    }

    return player;
}

// Stand still for `seconds`
function stand(camera, at, seconds) {
    for (let t = 0; t < seconds; t += FRAME) {
        camera.update(FRAME, { player: { ...at, vx: 0, vz: 0 } });
    }
}

describe("the camera following the player (camera.js)", () => {
    it("follows from the first step: catching up and starting to swing round behind them straight away", () => {
        const camera = new CameraFollow({ x: 10, z: 10 });

        // A step east, from the south where the camera starts
        const player = walk(camera, { from: { x: 10, z: 10 }, vx: 1.7, vz: 0, seconds: 0.5 });

        assert.ok(camera.focus.x > 10.3, `caught up to ${camera.focus.x.toFixed(2)} (player at ${player.x.toFixed(2)})`);
        assert.ok(camera.yaw < -0.15, `already turning, yaw ${camera.yaw.toFixed(2)}`);
    });

    it("ends up behind them the way they're going, close behind", () => {
        const camera = new CameraFollow({ x: 10, z: 10 });
        const player = walk(camera, { from: { x: 10, z: 10 }, vx: 1.7, vz: 0, seconds: 3 });

        assert.ok(Math.abs(wrap(camera.yaw - -Math.PI / 2)) < 0.05, `yaw ${camera.yaw.toFixed(2)}`);
        assert.ok(Math.hypot(player.x - camera.focus.x, player.z - camera.focus.z) < 0.5, "close behind");
    });

    it("walked away from, doesn't turn; walked towards, turns all the way round", () => {
        const away = new CameraFollow({ x: 0, z: 0 });

        walk(away, { from: { x: 0, z: 0 }, vx: 0, vz: -1.7, seconds: 3 });
        assert.ok(Math.abs(away.yaw) < 0.01, "already behind them");

        const towards = new CameraFollow({ x: 0, z: 0 });

        walk(towards, { from: { x: 0, z: 0 }, vx: 0, vz: 1.7, seconds: 3 });
        assert.ok(Math.abs(wrap(towards.yaw - Math.PI)) < 0.05, `yaw ${towards.yaw.toFixed(2)}`);
    });

    it("eases round, taking about a second to turn half round and never snapping", () => {
        const camera = new CameraFollow({ x: 0, z: 0 });
        let from = { x: 0, z: 0 };
        let last = camera.yaw;
        let most = 0;
        let threeQuarters = null;
        let settled = null;

        for (let t = 0; t < 3; t += FRAME) {
            from = walk(camera, { from, vx: 0, vz: 1.7, seconds: FRAME });
            most = Math.max(most, Math.abs(wrap(camera.yaw - last)));
            last = camera.yaw;

            const off = Math.abs(wrap(camera.yaw - Math.PI));

            threeQuarters ??= off < Math.PI / 4 ? t : null;
            settled ??= off < 0.05 ? t : null;
        }

        assert.ok(most < 0.075, `never more than ${most.toFixed(3)} radians a frame`);
        assert.ok(threeQuarters > 0.5 && threeQuarters < 1.2, `three-quarters of the way round after ${threeQuarters?.toFixed(2)} s`);
        assert.ok(settled < 1.8, `round after ${settled?.toFixed(2)} s`);
    });

    it("keeps steady through a path's corners, going on the way it's heading", () => {
        const camera = new CameraFollow({ x: 0, z: 0 });

        // North-east and north-west in turn, every fifth of a second: heading north on the whole
        let from = { x: 0, z: 0 };
        let most = 0;

        for (let k = 0; k < 20; k++) {
            const side = k % 2 ? 1 : -1;

            from = walk(camera, { from, vx: side * 1.2, vz: -1.2, seconds: 0.2 });
            most = Math.max(most, Math.abs(wrap(camera.yaw - 0)));
        }

        assert.ok(most < 0.35, `never more than ${most.toFixed(2)} radians from behind them`);
    });

    it("stood still, stays where it's turned", () => {
        const camera = new CameraFollow({ x: 0, z: 0 });
        const player = walk(camera, { from: { x: 0, z: 0 }, vx: 1.7, vz: 0, seconds: 0.6 });
        const yaw = camera.yaw;

        stand(camera, player, 0.5);
        const settled = camera.yaw;

        stand(camera, player, 2);
        assert.ok(Math.abs(wrap(settled - yaw)) < 0.3, "slows to a stop");
        assert.ok(Math.abs(wrap(camera.yaw - settled)) < 0.01, "and keeps still");
        assert.ok(Math.hypot(camera.focus.x - player.x, camera.focus.z - player.z) < 0.05, "on them");
    });

    it("dragged, turns round the player and tilts, and holds there while they stand", () => {
        const camera = new CameraFollow({ x: 0, z: 0 });

        camera.grab();
        camera.turn(-1, 10);
        assert.equal(camera.yaw, -1);
        assert.equal(camera.pitch, PITCH.start + 10);

        camera.release();
        stand(camera, { x: 0, z: 0 }, 2);
        assert.equal(camera.yaw, -1);
        assert.equal(camera.pitch, PITCH.start + 10);
    });

    it("tilts no lower than the view allows, nor higher than looking nearly straight down", () => {
        const camera = new CameraFollow({ x: 0, z: 0 });

        camera.turn(0, -90, 31);
        assert.equal(camera.pitch, 31);
        camera.turn(0, -90);
        assert.equal(camera.pitch, PITCH.least);
        camera.turn(0, 180);
        assert.equal(camera.pitch, PITCH.most);

        // A taller screen (upright) keeps it higher: the lowest comes with each update
        camera.turn(0, -180);
        camera.update(FRAME, { player: { x: 0, z: 0, vx: 0, vz: 0 }, lowest: 31 });
        assert.equal(camera.pitch, 31);
    });

    it("held by a drag, doesn't turn itself even while the player walks; let go, swings back round behind them", () => {
        const camera = new CameraFollow({ x: 0, z: 0 });

        camera.grab();
        camera.turn(2);

        const player = walk(camera, { from: { x: 0, z: 0 }, vx: 0, vz: -1.7, seconds: 1 });

        assert.equal(camera.yaw, 2, "held");
        assert.ok(camera.focus.z < -1, "still keeping up with them");

        camera.release();
        walk(camera, { from: player, vx: 0, vz: -1.7, seconds: 2 });
        assert.ok(Math.abs(wrap(camera.yaw)) < 0.05, `behind them again: yaw ${camera.yaw.toFixed(2)}`);
    });

    it("turned while they stand, swings back behind them once they walk again, facing the way they go", () => {
        const camera = new CameraFollow({ x: 0, z: 0 });

        camera.grab();
        camera.turn(Math.PI / 2);
        camera.release();
        stand(camera, { x: 0, z: 0 }, 1);
        assert.equal(camera.yaw, Math.PI / 2);

        // Walking west: behind them is the east
        walk(camera, { from: { x: 0, z: 0 }, vx: -1.7, vz: 0, seconds: 2 });
        assert.ok(Math.abs(wrap(camera.yaw - Math.PI / 2)) < 0.05, `yaw ${camera.yaw.toFixed(2)}`);

        // Then north, round behind them to the south
        walk(camera, { from: { x: -3.4, z: 0 }, vx: 0, vz: -1.7, seconds: 2 });
        assert.ok(Math.abs(wrap(camera.yaw)) < 0.05, `yaw ${camera.yaw.toFixed(2)}`);
    });

    it("catches them up without turning when they're put somewhere else (coming back to life)", () => {
        const camera = new CameraFollow({ x: 0, z: 0, yaw: 1 });

        stand(camera, { x: 30, z: 40 }, 2);
        assert.ok(Math.hypot(camera.focus.x - 30, camera.focus.z - 40) < 0.25);
        assert.equal(camera.yaw, 1);
    });

    it("looks where it's asked (leaning towards a foe)", () => {
        const camera = new CameraFollow({ x: 0, z: 0 });

        for (let t = 0; t < 2; t += FRAME) {
            camera.update(FRAME, { player: { x: 5, z: 0, vx: 0, vz: 0 }, aim: { x: 7, z: 1 } });
        }

        assert.ok(Math.hypot(camera.focus.x - 7, camera.focus.z - 1) < 0.25);
    });
});
