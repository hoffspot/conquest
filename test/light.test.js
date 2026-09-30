// The sun's shadows (client/js/world/shadows.js): the map following the player without its
// texels crawling over the ground, and shadows fading out towards its edges
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import { fadeShadowEdges, snapToTexels } from "../client/js/world/shadows.js";

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
