// What's built round the player given to the graphics card as it's built, not when the camera
// first turns to it (client/js/world/sending.js): the next of it drawn once each frame in a pass
// of its own, wherever the camera looks, into no pixel, so much a frame, the renderer and the
// meshes left as they were
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import { SEND_SOON, sendingLeft, sendSome, sendSoon } from "../client/js/world/sending.js";

// A mesh with so many bytes of corners
const mesh = (bytes) => {
    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(bytes / 4), 3));

    return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
};

// A renderer as three.js's is to what's sent: it draws what's shown in a scene that the camera's
// layers see and that isn't culled away (nothing here is in any camera's view), and tells each
// it was drawn, counting what it drew and the frame it's on. Each drawing kept, as it was drawn
// (`passes`)
const renderer = () => {
    const [viewport, scissor] = [new THREE.Vector4(0, 0, 800, 600), new THREE.Vector4(0, 0, 800, 600)];
    let scissored = false;
    const set = (into) => (x, y, w, h) => (x.isVector4 ? into.copy(x) : into.set(x, y, w, h));

    return {
        autoClear: true,
        shadowMap: { autoUpdate: true, needsUpdate: true },
        info: { render: { frame: 7, calls: 229, triangles: 1283162, points: 40, lines: 2 } },
        passes: [],
        getViewport: (target) => target.copy(viewport),
        getScissor: (target) => target.copy(scissor),
        getScissorTest: () => scissored,
        setViewport: set(viewport),
        setScissor: set(scissor),
        setScissorTest: (on) => {
            scissored = on;
        },
        state() {
            return { viewport: viewport.toArray(), scissor: scissor.toArray(), scissored, cleared: this.autoClear, shadows: { ...this.shadowMap } };
        },
        render(scene, camera) {
            const [drawn, lights] = [[], []];

            scene.traverseVisible((node) => {
                if (node.layers.test(camera.layers)) {
                    if (node.isLight) {
                        lights.push(node);
                    } else if (node.isMesh && !node.frustumCulled) {
                        drawn.push(node);
                    }
                }
            });
            this.passes.push({ drawn, lights, background: scene.background, ...this.state() });
            this.info.render.frame++;
            this.info.render.calls += drawn.length;
            this.info.render.triangles += drawn.length * 1000;
            drawn.forEach((node) => node.onAfterRender(this, scene, camera, node.geometry, node.material, null));
        }
    };
};

// The frame itself drawn, by a camera that sees none of it: how many of the scene's meshes it drew
const frame = (gl, scene) => {
    gl.render(scene, new THREE.PerspectiveCamera());

    return gl.passes.pop().drawn.length;
};

// (Each test's own, none of another's left waiting: those were in scenes of their own, and are
// left to them)
const fresh = () => {
    sendSome(renderer(), new THREE.Scene(), undefined, Infinity);
    assert.equal(sendingLeft(), 0);
};

// A mesh as three.js made it: culled, on the layer every camera sees, told nothing of its own
const untouched = (each) => each.frustumCulled && each.layers.mask === 1 && !Object.hasOwn(each, "onAfterRender");

describe("what's built sent to the graphics card as it's built (sending.js)", () => {
    it("draws what's newly built once, SEND_SOON.bytes of it a frame in the order it was built, in a pass of its own: nothing culled, alone with the lights the frame has, into no pixel, the shadows and the picture left be; then all as it was, what the frame drew still counted alone", () => {
        fresh();

        const scene = new THREE.Scene();
        const group = new THREE.Group();
        const meshes = [1.5, 1.5, 1.5, 1.5].map((megabytes) => mesh(megabytes * 1024 * 1024));
        const lights = [new THREE.DirectionalLight(), new THREE.PointLight()];
        // (A light no frame's camera sees, so no part of what its shaders are made for)
        const apart = new THREE.PointLight();
        const other = mesh(1200);
        const gl = renderer();
        const before = gl.state();

        apart.layers.set(3);
        scene.background = new THREE.Color(0x336699);
        scene.add(group.add(...meshes), other, ...lights, apart);
        assert.equal(sendSoon(group), group);
        assert.equal(sendingLeft(), 4);
        assert.ok(meshes.every((each) => each.frustumCulled && each.layers.mask === 1), "none till its turn");
        assert.equal(frame(gl, scene), 0);
        assert.equal(SEND_SOON.bytes, 2 * 1024 * 1024);

        // (A megabyte and a half is under the frame's share, so the next goes with it)
        assert.equal(sendSome(gl, scene, () => [...lights, apart]), 2);

        const [pass] = gl.passes;

        assert.deepEqual(pass.drawn, meshes.slice(0, 2), "those, and nothing else of the scene");
        assert.deepEqual(pass.lights, lights, "lit by every light the frame is, and no other: the same shaders");
        // (Every pixel cut away: a scissor round none of them)
        assert.deepEqual([pass.viewport, pass.scissor, pass.scissored], [[0, 0, 1, 1], [0, 0, 0, 0], true]);
        assert.deepEqual([pass.cleared, pass.shadows, pass.background], [false, { autoUpdate: false, needsUpdate: false }, null]);

        // (And all as it was: the frame's drawn as ever, and draws none of them again; what it
        // drew counted as it was, three.js a frame on)
        assert.deepEqual(gl.state(), before);
        assert.equal(scene.background.getHex(), 0x336699);
        assert.deepEqual(gl.info.render, { frame: 9, calls: 229, triangles: 1283162, points: 40, lines: 2 });
        assert.equal(apart.layers.mask, 8);
        assert.ok(meshes.slice(0, 2).every(untouched), "culled again, as three.js made them");
        assert.ok(meshes.slice(2).every((each) => each.frustumCulled && each.layers.mask === 1 && Object.hasOwn(each, "onAfterRender")), "the rest still waiting");
        assert.equal(frame(gl, scene), 0);
        assert.equal(sendingLeft(), 2);

        assert.equal(sendSome(gl, scene, () => lights), 2);
        assert.deepEqual(gl.passes[1].drawn, meshes.slice(2));
        assert.ok(meshes.every(untouched));

        // (Nothing waiting: nothing drawn, nothing touched, the lights not so much as asked for)
        assert.equal(sendSome(gl, scene, () => assert.fail("asked for the lights")), 0);
        assert.equal(gl.passes.length, 2);

        // (Asked again while it waits: once all the same)
        sendSoon(group);
        sendSoon(group);
        assert.equal(sendingLeft(), 4);
        assert.equal(sendSome(gl, scene, () => lights, Infinity), 4);
        assert.equal(sendSome(gl, scene, () => lights, Infinity), 0);
    });

    it("counts a mesh with few corners, or none left on the page, as SEND_SOON.least: its pictures are sent too", () => {
        fresh();

        const scene = new THREE.Scene();
        const small = Array.from({ length: 20 }, () => mesh(1200));
        const gl = renderer();

        // (One whose corners the page has let go of: sent already, its picture perhaps not)
        small[3].geometry.attributes.position.array = null;
        scene.add(...small);
        sendSoon(scene);
        assert.equal(SEND_SOON.bytes / SEND_SOON.least, 8);
        assert.equal(sendSome(gl, scene), 8);
        assert.equal(sendSome(gl, scene), 8);
        assert.equal(sendSome(gl, scene), 4);
        assert.equal(sendSome(gl, scene), 0);
        assert.deepEqual(gl.passes.flatMap(({ drawn }) => drawn), small);
    });

    it("gives no turn to one the camera saw meanwhile, tells one what it was told before, and waits for one that's hidden", () => {
        fresh();

        const scene = new THREE.Scene();
        const [seen, told, hidden, last] = [mesh(1200), mesh(1200), mesh(1200), mesh(1200)];
        const calls = [];
        const gl = renderer();

        told.onAfterRender = function (...given) {
            calls.push([this, given.length]);
        };
        // (Shown itself, in something that's hidden: a tile of undergrowth not yet near)
        scene.add(seen, told, new THREE.Group().add(hidden), last);
        hidden.parent.visible = false;
        sendSoon(scene);

        // (In the camera's view, drawn as it always was: sent, and nothing more to do for it)
        seen.onAfterRender(null, null, null, seen.geometry, seen.material, null);
        assert.ok(untouched(seen));
        assert.equal(sendSome(gl, scene, undefined, SEND_SOON.least), 1);
        assert.deepEqual(gl.passes[0].drawn, [told], "the next took the turn");
        assert.deepEqual(calls, [[told, 6]]);
        assert.ok(Object.hasOwn(told, "onAfterRender") && told.frustumCulled && told.layers.mask === 1);
        told.onAfterRender();
        assert.equal(calls.length, 2, "its own again");

        // (What it's under hidden: it waits, the one after it sent)
        assert.equal(sendSome(gl, scene, undefined, Infinity), 1);
        assert.deepEqual(gl.passes[1].drawn, [last]);
        assert.equal(sendSome(gl, scene, undefined, Infinity), 0);
        assert.equal(sendingLeft(), 1);
        hidden.parent.visible = true;
        assert.equal(sendSome(gl, scene, undefined, Infinity), 1);
        assert.deepEqual(gl.passes[2].drawn, [hidden]);
        assert.equal(sendingLeft(), 0);
    });

    it("waits for what's in no scene yet, and leaves what's in another scene to be sent when it's first seen there", () => {
        fresh();

        const [scene, far] = [new THREE.Scene(), new THREE.Scene()];
        const [building, elsewhere] = [new THREE.Group().add(mesh(1200)), mesh(1200)];
        const gl = renderer();

        // (A chunk still being built, not yet put in the world)
        sendSoon(building);
        far.add(sendSoon(elsewhere));
        assert.equal(sendSome(gl, scene), 0);
        assert.equal(gl.passes.length, 0);
        assert.equal(sendingLeft(), 1);
        assert.ok(untouched(elsewhere), "as three.js made it: sent when the far scene's camera sees it");
        scene.add(building);
        assert.equal(sendSome(gl, scene), 1);
        assert.deepEqual(gl.passes[0].drawn, building.children);
    });

    it("leaves alone what's never culled, and what no ordinary camera sees; and one whose material's hidden as three.js made it", () => {
        fresh();

        const scene = new THREE.Scene();
        const [always, shadows, plain, unseen] = [mesh(1200), mesh(1200), new THREE.Group(), mesh(1200)];
        const gl = renderer();

        always.frustumCulled = false;
        // (Drawn only into the sun's shadows: world/shadows.js SHADOWS_ONLY)
        shadows.layers.set(2);
        scene.add(always, shadows, plain);
        sendSoon(scene);
        assert.equal(sendingLeft(), 0);
        assert.equal(sendSome(gl, scene), 0);
        assert.ok(!Object.hasOwn(always, "onAfterRender") && !Object.hasOwn(shadows, "onAfterRender"));
        assert.deepEqual([always.frustumCulled, shadows.frustumCulled, shadows.layers.mask], [false, true, 4]);

        // (One three.js draws nothing of, so never tells it was drawn: let go of all the same)
        scene.add(sendSoon(unseen));
        gl.render = () => {};
        assert.equal(sendSome(gl, scene), 1);
        assert.ok(untouched(unseen));
        assert.equal(sendingLeft(), 0);
    });

    it("leaves all as it was if the drawing throws", () => {
        fresh();

        const scene = new THREE.Scene();
        const one = mesh(1200);
        const gl = renderer();
        const before = [gl.state(), { ...gl.info.render }];

        scene.add(sendSoon(one));
        gl.render = () => {
            gl.info.render.calls++;

            throw new Error("lost");
        };
        assert.throws(() => sendSome(gl, scene), /lost/);
        assert.deepEqual([gl.state(), gl.info.render], before);
        assert.ok(untouched(one));
    });
});
