import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { Vector3, REVISION } from "three";
import { aimCamera, createCamera, groundToScene, heightOnScreen, interpolatedHeading, isDrawnIn3D } from "../client/js/app/units3d.js";

// Where a point in the 3D scene appears on a canvas showing `width` x `height` world pixels
function toCanvas(camera, point, width, height) {
    const ndc = new Vector3(point.x, point.y, point.z).project(camera);

    return { x: ((ndc.x + 1) / 2) * width, y: ((1 - ndc.y) / 2) * height, depth: ndc.z };
}

describe("3D units", () => {
    const width = 200;
    const height = 120;
    const camera = createCamera();

    aimCamera(camera, width, height);
    camera.updateMatrixWorld();

    test("ground positions line up exactly with the 2D map", () => {
        for (const [x, y] of [[0, 0], [50, 30], [199, 119], [123.5, 7.25]]) {
            const point = toCanvas(camera, groundToScene(x, y), width, height);

            assert.ok(Math.abs(point.x - x) < 1e-6, `x for ${x},${y}`);
            assert.ok(Math.abs(point.y - y) < 1e-6, `y for ${x},${y}`);
        }
    });

    test("height moves a point up the screen and towards the viewer", () => {
        const ground = groundToScene(100, 60);
        const onGround = toCanvas(camera, ground, width, height);
        const raised = toCanvas(camera, { ...ground, y: 20 }, width, height);

        assert.ok(Math.abs(raised.x - onGround.x) < 1e-6);
        assert.ok(Math.abs(onGround.y - raised.y - heightOnScreen(20)) < 1e-6);
        assert.ok(raised.depth < onGround.depth, "higher points are nearer the camera");

        // Further south on the map is nearer the camera too
        assert.ok(toCanvas(camera, groundToScene(100, 90), width, height).depth < onGround.depth);
    });

    test("units turn smoothly between ticks, the short way round", () => {
        const eighth = Math.PI / 4;

        // Directions run clockwise from north: 2 of 8 is east
        assert.equal(interpolatedHeading(2, 2, 8, 0), 2 * eighth);
        assert.equal(interpolatedHeading(1, 3, 8, -1), eighth);
        assert.equal(interpolatedHeading(1, 3, 8, 0), 3 * eighth);
        assert.equal(interpolatedHeading(1, 3, 8, -0.5), 2 * eighth);

        // From 7 to 1 turns through north, not all the way back round
        assert.equal(interpolatedHeading(7, 1, 8, -0.5), 8 * eighth);
        assert.equal(interpolatedHeading(1, 7, 8, -0.5), 0);
    });

    test("only the first mission's hero tank is drawn in 3D for now", () => {
        assert.equal(isDrawnIn3D({ type: "vehicles", name: "heavy-tank", uid: -1 }), true);

        // uid -1 is a building in mission 2 and a transport in mission 3
        assert.equal(isDrawnIn3D({ type: "buildings", name: "base", uid: -1 }), false);
        assert.equal(isDrawnIn3D({ type: "vehicles", name: "transport", uid: -1 }), false);
        assert.equal(isDrawnIn3D({ type: "vehicles", name: "heavy-tank", uid: 7 }), false);
    });

    test("the vendored copy of Three.js matches the version in package.json", () => {
        const folder = new URL(`../client/vendor/three-r${REVISION}/`, import.meta.url);

        for (const file of ["three.core.min.js", "three.module.min.js", "LICENSE"]) {
            assert.ok(existsSync(new URL(file, folder)), `client/vendor/three-r${REVISION}/${file} exists (run npm run vendor:three)`);
        }

        assert.match(readFileSync(new URL("three.core.min.js", folder), "utf8"), new RegExp(`="${REVISION}"`));

        // The page's import map loads that copy
        const page = readFileSync(new URL("../client/index.html", import.meta.url), "utf8");

        assert.ok(page.includes(`"three": "./vendor/three-r${REVISION}/three.module.min.js"`));
    });
});
