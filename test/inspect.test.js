// What the model viewer (client/model-viewer.html) says of what it shows and how it lets it be
// looked at (client/js/lab/inspect.js): how much there is to draw of it, its wireframe, and the
// last moments of how it moved, stepped back and forth through. (The viewer in a browser:
// e2e/model-viewer.spec.js.)

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import { detailsOf, Rewind, wireframe } from "../client/js/lab/inspect.js";

// A small skinned thing: a box of 12 triangles on two bones, with a picture, and a second level
// of detail (a sphere) hidden, and a mesh drawn only into the shadows
function thing() {
    const root = new THREE.Group();
    const hip = new THREE.Bone();
    const knee = new THREE.Bone();
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const count = geometry.attributes.position.count;

    geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(new Uint16Array(count * 4), 4));
    geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(new Float32Array(count * 4).fill(0.25), 4));

    const picture = new THREE.DataTexture(new Uint8Array(64 * 32 * 4), 64, 32);
    const body = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial({ map: picture, normalMap: picture }));
    const far = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshStandardMaterial());
    const shadow = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));

    hip.add(knee);
    root.add(hip, body, far, shadow);
    body.bind(new THREE.Skeleton([hip, knee]));
    far.visible = false;

    return { root, hip, knee, body, far };
}

describe("the model viewer's look at what it shows (lab/inspect.js)", () => {
    it("counts what's drawn of it as it's shown (not a hidden level of detail, nor what's drawn only into the shadows), and its bones and pictures, each once", () => {
        const { root, far } = thing();

        assert.deepEqual(detailsOf(root), { meshes: 1, triangles: 12, vertices: 24, materials: 1, textures: [{ width: 64, height: 32, compressed: false }], bones: 2 });

        // (Its other level shown: its triangles too)
        far.visible = true;

        const both = detailsOf(root);

        assert.equal(both.meshes, 2);
        assert.equal(both.triangles, 12 + new THREE.SphereGeometry(1, 8, 6).index.count / 3);
        assert.equal(both.materials, 2);
    });

    it("counts each copy of what's drawn many times over (an instanced mesh), and the largest pictures first", () => {
        const root = new THREE.Group();
        const small = new THREE.DataTexture(new Uint8Array(16 * 16 * 4), 16, 16);
        const large = new THREE.DataTexture(new Uint8Array(128 * 64 * 4), 128, 64);

        root.add(new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ map: small, alphaMap: large }), 5));

        const details = detailsOf(root);

        assert.equal(details.triangles, 60);
        assert.deepEqual(details.textures.map(({ width }) => width), [128, 16]);
        assert.equal(details.bones, 0);
    });

    it("draws every material as its wireframe, and as itself again", () => {
        const { root, body, far } = thing();

        wireframe(root, true);
        assert.equal(body.material.wireframe, true);
        assert.equal(far.material.wireframe, true);
        wireframe(root, false);
        assert.equal(body.material.wireframe, false);
    });

    it("keeps how it stood a moment at a time, steps back and on through them just as they were, and back to now to carry on from", () => {
        const { root, hip, knee } = thing();
        const rewind = new Rewind(3);
        const turn = (t) => {
            hip.rotation.set(t, 0, 0);
            knee.position.set(0, t, 0);
            root.position.set(t * 2, 0, 0);
        };

        for (const t of [0, 0.1, 0.2, 0.3]) {
            turn(t);
            rewind.keep(root, t);
        }

        // (Only the last three kept)
        assert.equal(rewind.kept.length, 3);
        assert.equal(rewind.past, false);

        assert.equal(rewind.stepBack(), 0.2);
        assert.ok(Math.abs(hip.rotation.x - 0.2) < 1e-6);
        assert.ok(Math.abs(root.position.x - 0.4) < 1e-6);
        assert.equal(rewind.stepBack(), 0.1);
        assert.ok(Math.abs(knee.position.y - 0.1) < 1e-6);
        assert.equal(rewind.past, true);

        // (No further back than what's kept)
        assert.equal(rewind.stepBack(), null);
        assert.equal(rewind.stepForward(), 0.2);
        assert.equal(rewind.latest(), 0.3);
        assert.ok(Math.abs(hip.rotation.x - 0.3) < 1e-6);
        assert.equal(rewind.stepForward(), null);

        // (Stepped back, and played on from there: what came after's let go of)
        rewind.stepBack();
        turn(0.25);
        rewind.keep(root, 0.25);
        assert.deepEqual(rewind.kept.map(({ time }) => Number(time.toFixed(2))), [0.1, 0.2, 0.25]);
        assert.equal(rewind.past, false);
    });
});
