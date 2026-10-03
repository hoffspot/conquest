// The shadow maps drawn with only what they need (client/js/world/shadowpasses.js; the terrain
// plan's M7k): a merged mesh's buildings drawn into a lamp's shadows (and the sun's) only if they're
// in its view, and something small into the sun's only if its shadow may be seen
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import { buildHouse, planHouse } from "../client/js/world/art/kits/house.js";
import { castByRuns, runsOf, setShadowView, SHADOW_PASSES, watchShadows } from "../client/js/world/shadowpasses.js";
import { joined, partsOf, PIXEL, placed } from "../client/js/world/town3d.js";

// A shadow camera's view as three.js makes it, for a light watched or not
function frustumOf(camera) {
    camera.updateMatrixWorld();

    return new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
}

// A lamp (a point light) at a spot, looking one way (as one of its cube's six faces does)
function lampFacing(at, toward) {
    const light = new THREE.PointLight(0xffffff, 1, 12);

    light.position.set(...at);
    light.updateMatrixWorld();

    const camera = new THREE.PerspectiveCamera(90, 1, 0.1, 12);

    camera.position.set(...at);
    camera.lookAt(new THREE.Vector3(...toward));

    const frustum = light.shadow.getFrustum(0);

    frustum.copy(frustumOf(camera));

    return { light, frustum };
}

// Two houses some way apart, built and merged as a chunk's are
function twoHouses() {
    const root = new THREE.Group();

    root.scale.setScalar(PIXEL);

    for (const [x, seed] of [[0, 3], [200, 4]]) {
        root.add(placed(buildHouse(planHouse({ w: 3, h: 2, seed })).toObject(), { kind: "house", w: 3, h: 2, x, y: 0, facing: 0, seed }));
    }

    root.updateMatrixWorld(true);

    const merged = joined(partsOf(root, { atlas: true }));

    merged.updateMatrixWorld(true);

    return merged.children.find((mesh) => mesh.userData.runs);
}

describe("where each building lies in what's merged (runsOf, joined)", () => {
    it("a run for each building in a row, what's in none joined while it's close together, every corner in one", () => {
        const box = (x, size = 1) => new THREE.BoxGeometry(size, size, size).toNonIndexed().translate(x, 0, 0);
        const runs = runsOf([
            { geometry: box(0), key: 1 },
            { geometry: box(1), key: 1 },
            { geometry: box(30), key: 2 },
            { geometry: box(31), key: null },
            { geometry: box(32), key: null },
            { geometry: box(32 + SHADOW_PASSES.loose * 2), key: null },
        ]);

        assert.deepEqual(runs.map(({ start, count }) => [start, count]), [[0, 72], [72, 36], [108, 72], [180, 36]]);
        assert.ok(runs[0].sphere.containsPoint(new THREE.Vector3(1.49, 0.49, 0.49)) && runs[0].sphere.containsPoint(new THREE.Vector3(-0.49, -0.49, -0.49)));
        assert.equal(runsOf([{ geometry: box(0), key: 1 }]), null);
    });

    it("a chunk's merged buildings keep theirs, covering all of it", () => {
        const mesh = twoHouses();
        const { runs } = mesh.userData;
        const corners = mesh.geometry.attributes.position.count;

        assert.ok(runs.length >= 2);
        assert.equal(runs[0].start, 0);
        assert.equal(runs.at(-1).start + runs.at(-1).count, corners);
        runs.slice(1).forEach((run, k) => assert.equal(run.start, runs[k].start + runs[k].count));
    });
});

describe("only what's in a shadow map's view drawn into it (shadowpasses.js)", () => {
    it("a lamp by one building draws only its runs, as parts; the camera, and lights not watched, the whole", () => {
        const mesh = twoHouses();
        const material = mesh.material;
        const [first] = mesh.userData.runs;
        const near = first.sphere.center;
        const { light, frustum } = lampFacing([near.x, near.y + 1, near.z + 6], [near.x, near.y, near.z]);

        watchShadows({ lamps: [light] });

        assert.equal(mesh.intersectsFrustum(frustum), true);
        assert.ok(Array.isArray(mesh.material) && mesh.material[0] === material);

        const drawn = mesh.geometry.groups.reduce((count, group) => count + group.count, 0);

        assert.ok(drawn > 0 && drawn < mesh.geometry.attributes.position.count / 1.5, `${drawn} of ${mesh.geometry.attributes.position.count}`);
        assert.ok(mesh.geometry.groups.every(({ start, count }) => mesh.userData.runs.some((run) => start <= run.start && run.start < start + count)));

        // (As it was once its last part's drawn)
        mesh.onAfterShadow(null, null, null, null, mesh.geometry, null, mesh.geometry.groups.at(-1));
        assert.equal(mesh.material, material);
        assert.deepEqual(mesh.geometry.groups, []);

        // The camera's view (not a shadow map's): the whole, as three.js has it
        const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);

        camera.position.set(near.x, 30, near.z + 60);
        camera.lookAt(near);
        assert.equal(mesh.intersectsFrustum(frustumOf(camera)), true);
        assert.equal(mesh.material, material);

        // A lamp by neither: none
        const away = lampFacing([near.x - 80, 2, near.z], [near.x - 100, 2, near.z]);

        watchShadows({ lamps: [away.light] });
        assert.equal(mesh.intersectsFrustum(away.frustum), false);
        assert.equal(mesh.material, material);
    });

    it("something small into the sun's shadows only if its shadow may fall where the camera looks", () => {
        const sun = new THREE.DirectionalLight(0xffffff, 1);
        const box = new THREE.OrthographicCamera(-60, 60, 60, -60, 1, 200);
        // (The sun high in the south-west, its light coming down to the north-east)
        const down = new THREE.Vector3(1, -1.2, -1).normalize();

        box.position.copy(down).multiplyScalar(-100);
        box.lookAt(0, 0, 0);
        sun.shadow.getFrustum(0).copy(frustumOf(box));
        watchShadows({ sun });

        // The camera at the south, looking north at the middle
        const camera = new THREE.PerspectiveCamera(50, 2, 0.1, 300);

        camera.position.set(0, 6, 20);
        camera.lookAt(0, 0, 0);
        camera.updateMatrixWorld();
        setShadowView(camera, down);

        const someone = (x, z) => {
            const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.8).translate(0, 0.9, 0));

            mesh.position.set(x, 0, z);
            mesh.updateMatrixWorld();

            return mesh;
        };
        const frustum = sun.shadow.getFrustum(0);

        // In view: yes
        assert.equal(someone(0, 0).intersectsFrustum(frustum), true);
        // Behind the camera, its shadow falling further behind: no
        assert.equal(someone(0, 40).intersectsFrustum(frustum), false);
        // Out of view to the west, its shadow falling north-east into it: yes
        assert.equal(someone(-20, 2).intersectsFrustum(frustum), true);
        // Something big's always drawn
        const wall = new THREE.Mesh(new THREE.BoxGeometry(30, 10, 1));

        wall.position.set(0, 5, 45);
        wall.updateMatrixWorld();
        assert.equal(wall.intersectsFrustum(frustum), true);

        // Not knowing where the camera looks, everyone
        setShadowView(null);
        assert.equal(someone(0, 40).intersectsFrustum(frustum), true);
    });

    it("leaves a mesh drawn with several materials as it is", () => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(), [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial()]);

        assert.equal(castByRuns(mesh, [{ start: 0, count: 6, sphere: new THREE.Sphere() }]).userData.runs, undefined);
    });
});
