// Things lying on the ground, tapped to pick them up (client/js/world/drops3d.js `at`): found by a
// tap anywhere from where they lie up to their top, their icon over them (a chest stands up off
// the ground, its lid well over where it lies seen close, as indoors).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import { Drops } from "../client/js/world/drops3d.js";

describe("tapping something lying on the ground (drops3d.js)", () => {
    // (A camera 4 m back from a chest, 2.4 m up, as indoors under the ceiling, on a screen 1280 by
    // 720; the chest 0.7 m high where it stands, and a tap on its lid)
    const camera = new THREE.PerspectiveCamera(36, 1280 / 720, 0.3, 100);

    camera.position.set(0, 2.4, 4);
    camera.lookAt(0, 0.8, 0);
    camera.updateMatrixWorld();

    const toScreen = (point) => {
        const projected = point.clone().project(camera);

        return projected.z > 1 ? null : { x: ((projected.x + 1) / 2) * 1280, y: ((1 - projected.y) / 2) * 720 };
    };
    const chest = new THREE.Group();

    chest.add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 0.46).translate(0, 0.35, 0)));
    chest.updateMatrixWorld();

    const drawn = { drawn: new Map([["chest-1", { object: chest, icon: null }]]) };
    const lid = toScreen(new THREE.Vector3(0, 0.6, 0));
    const foot = toScreen(new THREE.Vector3(0, 0, 0));

    it("finds a chest seen close by a tap on its lid, well over where it lies; not by one off to the side", () => {
        // (Its lid's further from its foot on the screen than a tap's reach from either)
        assert.ok(Math.hypot(lid.x - foot.x, lid.y - foot.y) > 40 * 2, `${Math.round(Math.hypot(lid.x - foot.x, lid.y - foot.y))} px`);
        assert.equal(Drops.prototype.at.call(drawn, lid.x, lid.y, toScreen), "chest-1");
        assert.equal(Drops.prototype.at.call(drawn, foot.x, foot.y, toScreen), "chest-1");
        assert.equal(Drops.prototype.at.call(drawn, lid.x + 200, lid.y, toScreen), null);
    });
});
