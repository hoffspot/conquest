// What's built round the player given to the graphics card as it's built, not when the camera
// first turns to it (client/js/world/sending.js): each mesh drawn once wherever the camera looks,
// so much let through a frame, then culled again as it was
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import { SEND_SOON, sendSome, sendSoon } from "../client/js/world/sending.js";

// A mesh with so many bytes of corners
const mesh = (bytes) => {
    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(bytes / 4), 3));

    return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
};

// A frame drawn with nothing in the camera's view, as three.js draws one: what's shown and not
// culled away drawn (its corners and pictures sent), and told so. How many were
const draw = (root) => {
    let drawn = 0;

    root.traverseVisible((node) => {
        if (node.isMesh && !node.frustumCulled) {
            node.onAfterRender(null, null, null, node.geometry, node.material, null);
            drawn++;
        }
    });

    return drawn;
};

// (Each test's own, none of another's left waiting)
const fresh = () => {
    while (sendSome(Infinity)) {
        // (All through)
    }
};

describe("what's built sent to the graphics card as it's built (sending.js)", () => {
    it("lets what's newly built through SEND_SOON.bytes a frame, in the order it was built, each drawn once wherever the camera looks and culled again as it was", () => {
        fresh();

        const group = new THREE.Group();
        const meshes = [1.5, 1.5, 1.5, 1.5].map((megabytes) => mesh(megabytes * 1024 * 1024));

        group.add(...meshes);
        assert.equal(sendSoon(group), group);
        assert.ok(meshes.every(({ frustumCulled }) => frustumCulled), "none till its turn");
        assert.equal(draw(group), 0);
        assert.equal(SEND_SOON.bytes, 2 * 1024 * 1024);

        // (A megabyte and a half is under the frame's share, so the next goes with it)
        assert.equal(sendSome(), 2);
        assert.deepEqual(meshes.map(({ frustumCulled }) => frustumCulled), [false, false, true, true]);
        assert.equal(draw(group), 2);
        assert.ok(meshes.every(({ frustumCulled }) => frustumCulled) && meshes.slice(0, 2).every((each) => !Object.hasOwn(each, "onAfterRender")), "culled again, as three.js made them");
        assert.equal(draw(group), 0, "once");
        assert.equal(sendSome(), 0);
        assert.equal(draw(group), 2);
        assert.equal(sendSome(), 0);
        assert.equal(draw(group), 0);
        assert.ok(meshes.every((each) => each.frustumCulled && !Object.hasOwn(each, "onAfterRender")));

        // (Asked again while it waits: once all the same)
        sendSoon(group);
        sendSoon(group);
        assert.equal(sendSome(Infinity), 0);
        assert.equal(draw(group), 4);
    });

    it("counts a mesh with few corners, or none left on the page, as SEND_SOON.least: its pictures are sent too", () => {
        fresh();

        const group = new THREE.Group();
        const small = Array.from({ length: 20 }, () => mesh(1200));

        // (One whose corners the page has let go of: sent already, its picture perhaps not)
        small[3].geometry.attributes.position.array = null;
        group.add(...small);
        sendSoon(group);
        assert.equal(SEND_SOON.bytes / SEND_SOON.least, 8);
        assert.equal(sendSome(), 12);
        assert.equal(draw(group), 8);
        assert.equal(sendSome(), 4);
        assert.equal(sendSome(), 0);
        assert.equal(draw(group), 12);
    });

    it("gives no turn to one the camera saw meanwhile, tells one what it was told before, and waits for one that's hidden", () => {
        fresh();

        const group = new THREE.Group();
        const [seen, told, hidden, last] = [mesh(1200), mesh(1200), mesh(1200), mesh(1200)];
        const calls = [];

        told.onAfterRender = function (...given) {
            calls.push([this, given.length]);
        };
        hidden.visible = false;
        group.add(seen, told, hidden, last);
        sendSoon(group);

        // (In the camera's view, drawn as it always was: sent, and nothing more to do for it)
        seen.onAfterRender(null, null, null, seen.geometry, seen.material, null);
        assert.ok(seen.frustumCulled && !Object.hasOwn(seen, "onAfterRender"));
        assert.equal(sendSome(SEND_SOON.least), 2);
        assert.deepEqual([seen, told, hidden, last].map(({ frustumCulled }) => frustumCulled), [true, false, true, true], "the next took the turn");
        assert.equal(draw(group), 1);
        assert.deepEqual(calls, [[told, 6]]);
        assert.ok(Object.hasOwn(told, "onAfterRender") && told.frustumCulled);
        told.onAfterRender();
        assert.equal(calls.length, 2, "its own again");

        // (Let through while it's hidden: drawn, and culled again, the first frame it's shown)
        assert.equal(sendSome(Infinity), 0);
        assert.equal(draw(group), 1);
        assert.deepEqual([hidden.frustumCulled, last.frustumCulled], [false, true]);
        hidden.visible = true;
        assert.equal(draw(group), 1);
        assert.equal(hidden.frustumCulled, true);
    });

    it("leaves alone what's never culled, and what no ordinary camera sees", () => {
        fresh();

        const group = new THREE.Group();
        const [always, shadows, plain] = [mesh(1200), mesh(1200), new THREE.Group()];

        always.frustumCulled = false;
        // (Drawn only into the sun's shadows: world/shadows.js SHADOWS_ONLY)
        shadows.layers.set(2);
        group.add(always, shadows, plain);
        sendSoon(group);
        assert.equal(sendSome(), 0);
        assert.ok(!Object.hasOwn(always, "onAfterRender") && !Object.hasOwn(shadows, "onAfterRender"));
        assert.deepEqual([always.frustumCulled, shadows.frustumCulled], [false, true]);
    });
});
