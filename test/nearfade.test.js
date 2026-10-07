// The player seen too close dithered away (client/js/world/nearfade.js): each of their materials'
// shaders made to throw away what's nearer the camera than NEAR_FADE.to metres, all of it nearer
// than `from`, once each, after whatever they do already.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import { fadeNear, NEAR_FADE } from "../client/js/world/nearfade.js";

describe("fading the player when the camera's too close (nearfade.js)", () => {
    // (What a material's shader becomes, compiled: a fragment shader with three.js's clipping
    // chunk in it, as every lit material's has)
    const compiled = (material) => {
        const shader = { uniforms: {}, vertexShader: "", fragmentShader: "void main() {\n#include <clipping_planes_fragment>\n}" };

        material.onBeforeCompile(shader, null);

        return shader.fragmentShader;
    };

    it("makes each material under the character throw away what's too near the camera, once, after what it did already", () => {
        const skin = new THREE.MeshStandardMaterial();
        const cloth = new THREE.MeshStandardMaterial();
        let before = 0;

        // (A material that changes its shader already: still does)
        cloth.onBeforeCompile = (shader) => {
            before++;
            shader.fragmentShader = shader.fragmentShader.replace("void main() {", "uniform float sheen;\nvoid main() {");
        };

        const character = new THREE.Group();
        const arm = new THREE.Mesh(new THREE.BoxGeometry(), [skin, cloth]);

        character.add(new THREE.Mesh(new THREE.BoxGeometry(), skin), arm);
        fadeNear(character);
        fadeNear(character);

        for (const material of [skin, cloth]) {
            const fragment = compiled(material);

            assert.equal(fragment.match(/gl_FragCoord\.w/g)?.length, 1, "once");
            assert.ok(fragment.includes(`smoothstep(${NEAR_FADE.from.toFixed(2)}, ${NEAR_FADE.to.toFixed(2)}, nearness)`) && fragment.includes("discard"));
            assert.ok(material.customProgramCacheKey().startsWith("fadeNear|"));
        }

        assert.ok(compiled(cloth).includes("uniform float sheen;") && before === 2, "what it did already, still done");
        assert.ok(NEAR_FADE.from < NEAR_FADE.to && NEAR_FADE.to < 2.6, "nearer than the camera comes out of doors");
    });
});
