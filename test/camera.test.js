// How the camera follows the player (client/js/app/camera.js): still in the middle of the
// screen, then following from behind the way they're going
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CameraFollow, ZONE } from "../client/js/app/camera.js";

const FRAME = 1 / 60;
const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

// Walk a player for `seconds` at a velocity (m/s), from `from`, with the camera following. Where
// they are on the screen is taken as how far they are from where the camera looks, `across`
// metres to the screen's edge (a stand-in for the view's projection, turned with the camera)
function walk(camera, { from, vx, vz, seconds, across = 6 }) {
    const player = { ...from, vx, vz };

    for (let t = 0; t < seconds; t += FRAME) {
        player.x += vx * FRAME;
        player.z += vz * FRAME;

        const dx = player.x - camera.focus.x;
        const dz = player.z - camera.focus.z;

        // Across the screen: to the camera's right; up it: away from the camera
        const right = { x: -Math.cos(camera.yaw), z: Math.sin(camera.yaw) };
        const away = { x: -Math.sin(camera.yaw), z: -Math.cos(camera.yaw) };

        camera.update(FRAME, { player, screen: { x: (dx * right.x + dz * right.z) / across, y: (dx * away.x + dz * away.z) / across } });
    }

    return player;
}

describe("the camera following the player (camera.js)", () => {
    it("keeps still while the player moves about near where it looks, a couple of steps either way", () => {
        const camera = new CameraFollow({ x: 10, z: 10 });

        assert.equal(ZONE.radius, 1.4);

        for (const [x, z] of [[10.5, 10], [10, 11.2], [9.1, 9.1]]) {
            camera.update(FRAME, { player: { x, z, vx: 1.7, vz: 0 }, screen: { x: 0.2, y: -0.2 } });
        }

        assert.equal(camera.following, false);
        assert.deepEqual(camera.focus, { x: 10, z: 10 });
        assert.equal(camera.yaw, 0);
    });

    it("follows after a couple of steps out, however zoomed; zoomed right in, before they reach the screen's edge", () => {
        const out = new CameraFollow({ x: 10, z: 10 });

        out.update(FRAME, { player: { x: 11.5, z: 10, vx: 1.7, vz: 0 }, screen: { x: 0.1, y: 0 } });
        assert.equal(out.following, true, "1.5 m out");

        const edge = new CameraFollow({ x: 10, z: 10 });

        edge.update(FRAME, { player: { x: 10.8, z: 10, vx: 1.7, vz: 0 }, screen: { x: 0.7, y: 0 } });
        assert.equal(edge.following, true, "near the edge");
    });

    it("once they walk out of it, follows them, turning round behind them the way they're going", () => {
        const camera = new CameraFollow({ x: 10, z: 10 });

        // Walking east, from the south where the camera starts: it swings round to the west of them
        const player = walk(camera, { from: { x: 10, z: 10 }, vx: 1.7, vz: 0, seconds: 4 });

        assert.equal(camera.following, true);
        assert.ok(Math.abs(wrap(camera.yaw - -Math.PI / 2)) < 0.05, `yaw ${camera.yaw.toFixed(2)}`);
        assert.ok(Math.hypot(player.x - camera.focus.x, player.z - camera.focus.z) < 1.5, "close behind");
    });

    it("walked away from, doesn't turn; walked towards, turns all the way round", () => {
        const away = new CameraFollow({ x: 0, z: 0 });

        walk(away, { from: { x: 0, z: 0 }, vx: 0, vz: -1.7, seconds: 4 });
        assert.ok(Math.abs(away.yaw) < 0.01, "already behind them");

        const towards = new CameraFollow({ x: 0, z: 0 });

        walk(towards, { from: { x: 0, z: 0 }, vx: 0, vz: 1.7, seconds: 4 });
        assert.ok(Math.abs(wrap(towards.yaw - Math.PI)) < 0.1, `yaw ${towards.yaw.toFixed(2)}`);
    });

    it("turns smoothly, taking about a second to turn half round", () => {
        const camera = new CameraFollow({ x: 0, z: 0 });
        let last = camera.yaw;
        let most = 0;
        let turned = null;

        for (let t = 0; t < 3; t += FRAME) {
            walk(camera, { from: { x: camera.focus.x, z: camera.focus.z + 3 }, vx: 0, vz: 1.7, seconds: FRAME });
            most = Math.max(most, Math.abs(wrap(camera.yaw - last)));
            last = camera.yaw;

            if (turned === null && Math.abs(wrap(camera.yaw - Math.PI)) < Math.PI / 4) {
                turned = t;
            }
        }

        assert.ok(most < 0.1, `never more than ${most.toFixed(3)} radians a frame`);
        assert.ok(turned > 0.4 && turned < 1.6, `three-quarters of the way round after ${turned?.toFixed(2)} s`);
    });

    it("keeps steady through a path's corners, going on the way it's heading", () => {
        const camera = new CameraFollow({ x: 0, z: 0 });

        // North-east and north-west in turn, every fifth of a second: heading north on the whole
        let from = { x: 0, z: 3 };
        let most = 0;

        for (let k = 0; k < 20; k++) {
            const side = k % 2 ? 1 : -1;

            from = walk(camera, { from, vx: side * 1.2, vz: -1.2, seconds: 0.2 });
            most = Math.max(most, Math.abs(wrap(camera.yaw - 0)));
        }

        assert.ok(most < 0.35, `never more than ${most.toFixed(2)} radians from behind them`);
    });

    it("stops following once they stop and it's caught them up, and keeps still again", () => {
        const camera = new CameraFollow({ x: 0, z: 0 });
        const player = walk(camera, { from: { x: 0, z: 0 }, vx: 1.7, vz: 0, seconds: 3 });

        for (let t = 0; t < 2; t += FRAME) {
            camera.update(FRAME, { player: { ...player, vx: 0, vz: 0 }, screen: { x: 0, y: 0 } });
        }

        assert.equal(camera.following, false);

        const still = { ...camera.focus };
        const yaw = camera.yaw;

        camera.update(FRAME, { player: { x: player.x + 0.5, z: player.z, vx: 1, vz: 0 }, screen: { x: 0.1, y: 0 } });
        assert.deepEqual(camera.focus, still);
        assert.equal(camera.yaw, yaw);
    });

    it("catches them up without turning when they're put somewhere else, off the screen (coming back to life)", () => {
        const camera = new CameraFollow({ x: 0, z: 0, yaw: 1 });
        const player = { x: 30, z: 40, vx: 0, vz: 0 };

        for (let t = 0; t < 2; t += FRAME) {
            camera.update(FRAME, { player, screen: null });
        }

        assert.ok(Math.hypot(camera.focus.x - 30, camera.focus.z - 40) < 0.25);
        assert.equal(camera.yaw, 1);
        assert.equal(camera.following, false);
    });

    it("looks where it's asked while following (leaning towards a foe)", () => {
        const camera = new CameraFollow({ x: 0, z: 0 });

        for (let t = 0; t < 2; t += FRAME) {
            camera.update(FRAME, { player: { x: 5, z: 0, vx: 0, vz: 0 }, screen: null, aim: { x: 7, z: 1 } });
        }

        assert.ok(Math.hypot(camera.focus.x - 7, camera.focus.z - 1) < 0.25);
    });
});
