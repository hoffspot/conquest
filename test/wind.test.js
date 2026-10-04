// The wind across the land (client/js/world/wind.js): one way it blows for everything in it, and
// gusts travelling downwind, taken by the tall grass, the trees' leaves and the undergrowth
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import { buildWorld } from "../client/js/core/overworld.js";
import { wildsMaterial } from "../client/js/world/art/engine/atlas.js";
import { TREE_WIND, treeMaterials } from "../client/js/world/art/kits/trees.js";
import { BREEZE } from "../client/js/world/cloth.js";
import { FIRE_WIND } from "../client/js/world/fire.js";
import { TallGrass } from "../client/js/world/grass.js";
import { SMOKE } from "../client/js/world/smoke.js";
import { QUALITY } from "../client/js/world/view.js";
import { GUSTS, WIND_GLSL, WIND_WAY, windGust } from "../client/js/world/wind.js";

// What a material's shaders are once it's made them its own (as three.js does before compiling)
function shadersOf(material, kind = "lambert") {
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib[kind].vertexShader, fragmentShader: THREE.ShaderLib[kind].fragmentShader };

    material.onBeforeCompile(shader, null);

    return shader;
}

describe("the wind (wind.js)", () => {
    it("blows one way for everything in it: the smoke leans, the flags fly and the fires lean that way", () => {
        assert.ok(Math.abs(Math.hypot(...WIND_WAY) - 1) < 1e-12);
        assert.ok(WIND_WAY[0] > 0 && WIND_WAY[1] > 0, "east and south");
        assert.deepEqual(BREEZE, WIND_WAY);
        assert.ok(Math.abs(SMOKE.wind[0] * WIND_WAY[1] - SMOKE.wind[1] * WIND_WAY[0]) < 1e-12 && SMOKE.wind[0] * WIND_WAY[0] > 0);
        assert.ok(Math.abs(FIRE_WIND.value.x - WIND_WAY[0]) < 1e-6 && Math.abs(FIRE_WIND.value.y - WIND_WAY[1]) < 1e-6);
    });

    it("gusts here and there: calm over most of the land, a gust on a fifth of it or so, however long the game's run", () => {
        for (const time of [0, 90, 1000, 36000]) {
            let [some, half, full, count] = [0, 0, 0, 0];

            for (let x = 0; x < 2000; x += 5) {
                for (let z = 0; z < 2000; z += 5) {
                    const gust = windGust(x, z, time);

                    assert.ok(gust >= 0 && gust <= 1);
                    some += gust > 0;
                    half += gust > 0.5;
                    full += gust > 0.95;
                    count++;
                }
            }

            assert.ok(some / count > 0.3 && some / count < 0.6, `${time}: ${some / count} stirred`);
            assert.ok(half / count > 0.1 && half / count < 0.3, `${time}: ${half / count} gusting`);
            assert.ok(full / count > 0.02, `${time}: ${full / count} in a full gust`);
        }
    });

    it("carries its gusts downwind at their speed, changing shape only slowly as they go", () => {
        let [carried, stayed, count] = [0, 0, 0];
        const later = 1;

        for (let x = 1000; x < 1600; x += 7) {
            for (let z = 3000; z < 3600; z += 7) {
                const now = windGust(x, z, 50);

                carried += Math.abs(windGust(x + WIND_WAY[0] * GUSTS.speed * later, z + WIND_WAY[1] * GUSTS.speed * later, 50 + later) - now);
                stayed += Math.abs(windGust(x, z, 50 + later) - now);
                count++;
            }
        }

        // (Where it's been carried to, it's as it was, near enough; where it was, it's changed)
        assert.ok(carried / count < 0.05, `${carried / count} carried`);
        assert.ok(stayed / count > 4 * (carried / count), `${stayed / count} where it was`);

        // A gust's longer across the wind than along it
        let [alongSum, acrossSum] = [0, 0];

        for (let k = 0; k < 400; k++) {
            const [x, z] = [(k % 20) * 97, Math.floor(k / 20) * 89];
            const at = windGust(x, z, 0);

            alongSum += Math.abs(windGust(x + WIND_WAY[0] * 10, z + WIND_WAY[1] * 10, 0) - at);
            acrossSum += Math.abs(windGust(x - WIND_WAY[1] * 10, z + WIND_WAY[0] * 10, 0) - at);
        }

        assert.ok(acrossSum < alongSum, `${acrossSum} across, ${alongSum} along`);
    });

    it("is taken by the tall grass, the trees' leaves and the undergrowth, worked out in their vertex shaders from the breeze's time", () => {
        assert.match(WIND_GLSL, /float windGust\(vec2 p, float time\)/);
        assert.match(WIND_GLSL, new RegExp(`${GUSTS.speed}\\.0|${GUSTS.speed}\\b`));

        const overworld = buildWorld({ seed: 1 }).maps.town;
        const grass = new TallGrass(overworld);

        grass.setQuality(QUALITY.medium.grass);

        for (const band of grass.object.children) {
            const shader = shadersOf(band.material);

            assert.match(shader.vertexShader, /float gust = windGust\(centre, grassTime\);/);
            assert.equal(shader.uniforms.grassTime, TREE_WIND.time);
        }

        grass.dispose();

        const leaves = shadersOf(treeMaterials().leaves);

        assert.match(leaves.vertexShader, /windGust\(windAt\.xz, windTime\)/);
        // (Leaning the way the wind blows in the world, whichever way the tree's turned)
        assert.match(leaves.vertexShader, /viewMatrix \* \(modelMatrix \* mvPosition \+ vec4\(windLean, 0\.0\)\)/);
        assert.equal(leaves.uniforms.windTime, TREE_WIND.time);

        const wilds = shadersOf(wildsMaterial(TREE_WIND.time));

        assert.match(wilds.vertexShader, /windGust\(wildAt\.xz, wildsTime\)/);
    });
});
