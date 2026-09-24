import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Camera } from "../client/js/app/camera.js";

// A camera looking at the 1200x800 plains map through a 600x300 CSS pixel view
function makeCamera() {
    const camera = new Camera();

    camera.setViewSize(600, 300);
    camera.setMapSize(1200, 800);

    return camera;
}

describe("Camera", () => {
    it("converts between screen and world coordinates", () => {
        const camera = makeCamera();

        camera.setView(2, 100, 50);

        assert.deepEqual(camera.screenToWorld(0, 0), { x: 100, y: 50 });
        assert.deepEqual(camera.screenToWorld(200, 100), { x: 200, y: 100 });
        assert.deepEqual(camera.worldToScreen(200, 100), { x: 200, y: 100 });
        assert.equal(camera.width, 300);
        assert.equal(camera.height, 150);
    });

    it("never zooms out further than the map can fill the view", () => {
        const camera = makeCamera();

        camera.setView(0.1, 0, 0);

        // 600/1200 = 0.5 and 300/800 = 0.375: the width is the limit
        assert.equal(camera.zoom, 0.5);
        assert.equal(camera.width, 1200);
    });

    it("never zooms in beyond the maximum", () => {
        const camera = makeCamera();

        camera.zoomTo(100);

        assert.equal(camera.zoom, camera.maxZoom);
    });

    it("keeps the view inside the map", () => {
        const camera = makeCamera();

        camera.setView(1, -50, -50);
        assert.deepEqual([camera.offsetX, camera.offsetY], [0, 0]);

        camera.setView(1, 5000, 5000);
        assert.deepEqual([camera.offsetX, camera.offsetY], [600, 500]);
    });

    it("zooms around a focus point, keeping it in place", () => {
        const camera = makeCamera();

        camera.setView(1, 300, 200);

        const before = camera.screenToWorld(150, 100);

        camera.zoomTo(2, 150, 100);

        const after = camera.screenToWorld(150, 100);

        assert.equal(camera.zoom, 2);
        assert.ok(Math.abs(before.x - after.x) < 1e-9 && Math.abs(before.y - after.y) < 1e-9);
    });

    it("pans and centres, reporting whether the view moved", () => {
        const camera = makeCamera();

        assert.equal(camera.panBy(10, 20), true);
        assert.deepEqual([camera.offsetX, camera.offsetY], [10, 20]);

        // Already at the top left corner
        camera.setView(1, 0, 0);
        assert.equal(camera.panBy(-10, -10), false);

        camera.centerOn(600, 400);
        assert.deepEqual([camera.offsetX, camera.offsetY], [300, 250]);
    });

    it("keeps the centre of the view when the screen is resized", () => {
        const camera = makeCamera();

        camera.centerOn(600, 400);
        camera.setViewSize(400, 200);

        assert.equal(camera.offsetX + camera.width / 2, 600);
        assert.equal(camera.offsetY + camera.height / 2, 400);
    });
});
