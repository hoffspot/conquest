// Each fire its own light (the terrain plan's M7e; the user: "Shouldn't the torches and the
// spells be their own independent light sources?"): the lights near the player (torches,
// lanterns, braziers, camp fires, the fire spells: lights.js, view.js lightNear), up to
// FIRE_LIGHTS of them, each lighting what's round it on its own in every lit material's shader,
// as the insides' candles do (roomlight.js): a point light's sums, no shadows, nothing lit behind
// the wall a torch hangs on; a list the shaders read, so no shader's made again however many there
// are, and by day, none lit, next to nothing done. Its own module, needing only three.js, so the
// materials can take it without importing the lights' drawing.

import * as THREE from "three";

/** How many lights light what's round them on their own at once (FIRE_LIGHT), the nearest. */
export const FIRE_LIGHTS = 16;

/**
 * The lights the world's materials light themselves by (fireLit): each where it is now (x, y,
 * z: world metres; w: its reach), how bright (its colour times its strength, linear), the way out
 * from the wall it hangs on (x, z; z how far it is from the wall, metres; w 1 if it's on one:
 * nothing behind the wall's lit), and how many of them are lit; set each frame by the view (view.js lightNear).
 */
export const FIRE_LIGHT = Object.freeze({
    at: { value: Array.from({ length: FIRE_LIGHTS }, () => new THREE.Vector4()) },
    colour: { value: Array.from({ length: FIRE_LIGHTS }, () => new THREE.Color(0, 0, 0)) },
    out: { value: Array.from({ length: FIRE_LIGHTS }, () => new THREE.Vector4()) },
    count: { value: 0 },
});

/**
 * A lit material's shader (as onBeforeCompile is given it) made to light itself by FIRE_LIGHT's
 * lights as well as three.js's own: each as three.js lights a point light (decaying with the
 * square of the distance, cut off smoothly at its reach), nothing behind the wall a torch hangs on.
 * Where it is in the world is worked out in its vertex shader (instanced or not).
 */
export function fireLit(shader) {
    if (shader.fragmentShader.includes("fireAt[") || !shader.fragmentShader.includes("#include <lights_fragment_end>")) {
        return;
    }

    shader.uniforms.fireAt = FIRE_LIGHT.at;
    shader.uniforms.fireColour = FIRE_LIGHT.colour;
    shader.uniforms.fireOut = FIRE_LIGHT.out;
    shader.uniforms.fireCount = FIRE_LIGHT.count;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vFireWorld;").replace(
        "#include <project_vertex>",
        `#include <project_vertex>
{
    vec4 fireWorld = vec4(transformed, 1.0);
    #ifdef USE_BATCHING
    fireWorld = batchingMatrix * fireWorld;
    #endif
    #ifdef USE_INSTANCING
    fireWorld = instanceMatrix * fireWorld;
    #endif
    vFireWorld = (modelMatrix * fireWorld).xyz;
}`,
    );
    shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>\nuniform vec4 fireAt[${FIRE_LIGHTS}];\nuniform vec3 fireColour[${FIRE_LIGHTS}];\nuniform vec4 fireOut[${FIRE_LIGHTS}];\nuniform int fireCount;\nvarying vec3 vFireWorld;`)
        .replace(
            "#include <lights_fragment_end>",
            `#include <lights_fragment_end>
if (fireCount > 0) {
    vec3 fireNormal = transformNormalByInverseViewMatrix(normal, viewMatrix);
    vec3 fireLight = vec3(0.0);

    for (int i = 0; i < ${FIRE_LIGHTS}; i++) {
        if (i >= fireCount) break;

        vec3 toLight = fireAt[i].xyz - vFireWorld;
        float apart = dot(toLight, toLight);
        float far = fireAt[i].w * fireAt[i].w;

        // (Out of its reach, or behind the wall it hangs on)
        if (apart >= far || (fireOut[i].w > 0.5 && dot(-toLight.xz, fireOut[i].xy) < -fireOut[i].z - 0.1)) continue;

        float edge = saturate(1.0 - (apart * apart) / (far * far));

        fireLight += saturate(dot(fireNormal, toLight) * inversesqrt(max(apart, 1e-6))) * edge * edge / max(apart, 0.09) * fireColour[i];
    }

    #if defined( STANDARD ) || defined( PHYSICAL )
    reflectedLight.directDiffuse += fireLight * BRDF_Lambert(material.diffuseContribution);
    #else
    reflectedLight.directDiffuse += fireLight * BRDF_Lambert(material.diffuseColor);
    #endif
}`,
        );
}

// Every lit material lights itself by FIRE_LIGHT's lights: three.js's own Material's
// onBeforeCompile, which every material that hasn't its own uses, made to (the folk's clothes, the
// beasts, what's dropped, the trees' bark); those with their own call fireLit themselves (the
// atlas's, the ground's, the leaves', skin, hair and folded cloth)
const plainCompile = THREE.Material.prototype.onBeforeCompile;

THREE.Material.prototype.onBeforeCompile = function fireLitCompile(shader, renderer) {
    plainCompile.call(this, shader, renderer);
    fireLit(shader);
};

