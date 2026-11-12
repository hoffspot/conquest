// The sun's shadows (client/js/world/shadows.js): the map following the player without its
// texels crawling over the ground, and shadows fading out towards its edges
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
// (three.js's own shadow maps and lights, as its renderer has them: not part of what it gives out)
import { WebGLLights } from "three/src/renderers/webgl/WebGLLights.js";
import { WebGLShadowMap } from "three/src/renderers/webgl/WebGLShadowMap.js";
import { fadeShadowEdges, SHADOW_STEP, shadowMapOf, snapToTexels, stepShadows } from "../client/js/world/shadows.js";
import { DAY } from "../client/js/core/daytime.js";
import { skyAt } from "../client/js/world/daytime.js";
import { sceneLights } from "../client/js/world/view.js";

// Where a spot on the ground falls within a texel of the sun's shadow map (0 to 1, across and
// up), the map's middle at `middle`: its camera placed as three.js places a sun's
function inTexel(spot, middle, sun, texel) {
    const camera = new THREE.OrthographicCamera();

    camera.position.copy(middle).addScaledVector(sun, 60);
    camera.lookAt(middle);
    camera.updateMatrixWorld();

    const seen = spot.clone().applyMatrix4(camera.matrixWorldInverse);

    return [seen.x / texel, seen.y / texel].map((at) => at - Math.floor(at));
}

// Two places in a texel the same (either side of its edge being the same place)
const same = (a, b) => a.every((at, k) => Math.abs(((at - b[k] + 1.5) % 1) - 0.5) < 1e-6);

describe("the sun's shadows (shadows.js)", () => {
    const texel = 48 / 2048;
    const spot = new THREE.Vector3(13.37, 0, -7.21);

    it("move in whole texels across the sun's view, so the map's texels stay put on the ground as the player walks", () => {
        // (Outdoors, and the light from above indoors)
        for (const from of [[-0.55, 1, 0.65], [0.25, 1, 0.35]]) {
            const sun = new THREE.Vector3(...from).normalize();
            const places = [];

            for (let step = 0; step < 60; step++) {
                const wanted = new THREE.Vector3(100 + step * 0.173, 0, 50 - step * 0.311);
                const middle = snapToTexels(wanted.clone(), sun, texel);

                assert.ok(middle.distanceTo(wanted) <= texel, "within a texel of where it's wanted");
                places.push(inTexel(spot, middle, sun, texel));
            }

            assert.ok(places.every((place) => same(place, places[0])), `${from}: ${JSON.stringify(places.slice(0, 3))}`);
        }
    });

    it("turn to follow the sun round only in small steps as the day goes, so their edges stand still between them rather than shimmering", () => {
        const look = { zenith: [0.3, 0.5, 0.8], horizon: [0.7, 0.8, 0.9], sun: [1, 0.95, 0.85], strength: 3, mist: [0, 0, 20], grade: [0, 0, 0, 0] };
        const shadow = skyAt(DAY.day, 0.5, look).key.clone();
        let [moves, still, longest] = [0, 0, 0];
        let since = 0;

        // (A frame at a time, 60 a second, through the day's middle half hour)
        for (let time = DAY.day; time < DAY.day + 30 * 60000; time += 1000 / 60) {
            const sun = skyAt(time, 0.5, look).key;

            if (stepShadows(shadow, sun)) {
                moves++;
                longest = Math.max(longest, since);
                since = 0;
            } else {
                still++;
                since++;
            }

            assert.ok(shadow.angleTo(sun) < SHADOW_STEP, "never further behind the sun than a step");
        }

        assert.ok(moves > 100, `${moves} steps: it follows the sun`);
        assert.ok(still / (moves + still) > 0.98, `${moves} of ${moves + still} frames moved: hardly ever`);
        assert.ok(longest < 60 * 5, `${longest} frames between steps at most`);

        // (A jump, the moon taking over or going in or out: there at once)
        const moon = new THREE.Vector3(0.2, 0.9, -0.4).normalize();

        assert.equal(stepShadows(shadow, moon), true);
        assert.deepEqual(shadow.toArray(), moon.toArray());
    });

    it("(which whole texels along the world's own axes don't: the sun looks down at a slant)", () => {
        const sun = new THREE.Vector3(-0.55, 1, 0.65).normalize();
        const places = [];

        for (let step = 0; step < 60; step++) {
            const x = Math.round((100 + step * 0.173) / texel) * texel;
            const z = Math.round((50 - step * 0.311) / texel) * texel;

            places.push(inTexel(spot, new THREE.Vector3(x, 0, z), sun, texel));
        }

        assert.ok(!places.every((place) => same(place, places[0])));
    });

    it("fade out towards the edges of the map, in each kind of shadow map (not the lamps' round ones), changed once", () => {
        const before = THREE.ShaderChunk.shadowmap_pars_fragment;
        const maps = before.split("bool frustumTest").length - 1;

        assert.equal(fadeShadowEdges(), true);

        const after = THREE.ShaderChunk.shadowmap_pars_fragment;

        assert.ok(maps >= 3);
        assert.equal(after.split("shadowIntensity *= 1.0 - smoothstep").length - 1, maps);
        assert.equal(after.slice(after.indexOf("float getPointShadow")), before.slice(before.indexOf("float getPointShadow")));
        assert.equal(fadeShadowEdges(), true);
        assert.equal(THREE.ShaderChunk.shadowmap_pars_fragment, after);
    });
});

describe("the shadow maps made before three.js makes its own (shadows.js shadowMapOf)", () => {
    // The shadows of some lights drawn as three.js's renderer draws them (its WebGLShadowMap, the
    // soft kind, as the view asks for), by a renderer that draws nothing: a map made for each
    // shadow that has none
    const drawn = (lights) => {
        const state = { setBlending() {}, setScissorTest() {}, viewport() {}, buffers: { depth: { getReversed: () => false, setTest() {} }, color: { setClear() {} } } };
        const renderer = { state, getRenderTarget: () => null, getActiveCubeFace: () => 0, getActiveMipmapLevel: () => 0, setRenderTarget() {}, clear() {} };
        const shadows = new WebGLShadowMap(renderer, { update() {} }, { maxTextureSize: 16384 });

        shadows.enabled = true;
        assert.equal(shadows.type, THREE.PCFShadowMap);
        shadows.render(lights, new THREE.Scene(), new THREE.PerspectiveCamera());
    };
    // The sun, and a lamp, as the view sets theirs up
    const lightsOf = () => {
        const sun = new THREE.DirectionalLight(0xffffff, 1);
        const lamp = new THREE.PointLight(0xffffff, 1, 12, 2);

        sun.name = "sun";
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 120 });
        lamp.castShadow = true;
        lamp.shadow.mapSize.set(256, 256);
        lamp.shadow.camera.near = 0.1;

        return [sun, lamp];
    };
    // All that's said of something in plain values (numbers, words, yes or no), but which one it is
    const said = (thing) => Object.fromEntries(Object.entries(thing).filter(([key, value]) => key !== "uuid" && (value === null || typeof value !== "object") && typeof value !== "function"));
    const picture = (texture) => ({ ...said(texture), kind: ["isDepthTexture", "isCubeTexture", "isCubeDepthTexture", "isRenderTargetTexture"].filter((key) => texture[key]), image: [texture.image].flat().map(({ width, height, depth }) => [width, height, depth]) });
    // A render target as the graphics card's told of it: itself, its colour picture and its depth's
    const shape = (target) => ({ ...said(target), cube: target.isWebGLCubeRenderTarget === true, pictures: target.textures.length, colour: picture(target.texture), depth: picture(target.depthTexture) });

    it("are three.js's own in every way but the colour picture nothing reads: a byte a texel, not four", () => {
        const theirs = lightsOf();
        const ours = lightsOf();

        drawn(theirs);

        for (const [k, light] of ours.entries()) {
            const map = shadowMapOf(light);
            const [mine, own] = [shape(map), shape(theirs[k].shadow.map)];

            assert.equal(light.shadow.map, map);
            assert.equal(own.colour.format, THREE.RGBAFormat, "(three.js's: four bytes a texel)");
            assert.equal(mine.colour.format, THREE.RedFormat);
            assert.equal(mine.colour.type, THREE.UnsignedByteType);
            // (If this fails after a newer three.js is put in: its WebGLShadowMap sets its maps up
            // otherwise now, and shadowMapOf must follow it)
            assert.deepEqual({ ...mine, colour: { ...mine.colour, format: THREE.RGBAFormat } }, own);
        }

        // (Drawn into, each shadow's camera is as three.js has it for a map of its own)
        drawn(ours);

        for (const [k, light] of ours.entries()) {
            assert.deepEqual(light.shadow.camera.projectionMatrix.elements, theirs[k].shadow.camera.projectionMatrix.elements);
            assert.deepEqual(light.shadow.matrix.elements, theirs[k].shadow.matrix.elements);
        }

        // (The sun's 2048 map's colour: 4 MB, not 16)
        assert.deepEqual([ours[0].shadow.map.width, ours[0].shadow.map.height, ours[1].shadow.map.width], [2048, 2048, 256]);
        assert.ok(ours[1].shadow.map.isWebGLCubeRenderTarget && ours[1].shadow.map.depthTexture.isCubeDepthTexture, "a lamp's a cube");
    });

    it("are left be by three.js, which makes a map only for a shadow that has none; and it's the depth picture the lit shaders are given", () => {
        const lights = lightsOf();
        const maps = lights.map((light) => shadowMapOf(light));
        let gone = 0;

        for (const map of maps) {
            map.addEventListener("dispose", () => gone++);
            map.depthTexture.addEventListener("dispose", () => gone++);
        }

        drawn(lights);
        drawn(lights);
        assert.deepEqual(lights.map(({ shadow }) => shadow.map), maps);
        assert.equal(gone, 0);

        // (What three.js hands the lit shaders for each light's shadow: its WebGLLights)
        const given = new WebGLLights({ has: () => true });

        given.setup(lights);
        assert.equal(given.state.directionalShadowMap[0], maps[0].depthTexture);
        assert.equal(given.state.pointShadowMap[0], maps[1].depthTexture);
        assert.deepEqual([given.state.directionalShadowMap[0].compareFunction, given.state.directionalShadowMap[0].magFilter], [THREE.LessEqualCompare, THREE.LinearFilter], "compared and filtered by the graphics card");
    });
});

describe("the scene's lights, kept (view.js sceneLights)", () => {
    it("are found by walking the scene once, what's hidden too, and kept; walked for again only once the scene's been given or lost something of its own", () => {
        const scene = new THREE.Scene();
        const [sun, lamp, hidden] = [new THREE.DirectionalLight(), new THREE.PointLight(), new THREE.Group()];
        let walks = 0;
        const walk = scene.traverse;

        scene.traverse = function (...given) {
            walks++;

            return walk.apply(this, given);
        };
        // (A lamp in a floor put away till it's gone into; and a town's worth of other things)
        hidden.visible = false;
        hidden.add(new THREE.Group().add(lamp));
        scene.add(sun, sun.target, hidden, ...Array.from({ length: 50 }, () => new THREE.Mesh()));

        const kept = sceneLights(scene);

        assert.deepEqual(kept.lights, [sun, lamp]);
        assert.equal(walks, 1);

        // (A likeness asks twice, and the picture behind the pack once: none walks it again)
        assert.equal(sceneLights(scene, kept), kept);
        assert.equal(sceneLights(scene, sceneLights(scene, kept)), kept);
        assert.equal(walks, 1);

        // (Something put in the scene, a light with it; and taken out again)
        const flash = new THREE.PointLight();
        const more = sceneLights(scene.add(new THREE.Group().add(flash)), kept);

        assert.deepEqual(more.lights, [sun, lamp, flash]);
        assert.equal(walks, 2);
        assert.equal(sceneLights(scene, more), more);
        scene.remove(flash.parent);
        assert.deepEqual(sceneLights(scene, more).lights, [sun, lamp]);
        assert.equal(walks, 3);
    });
});
