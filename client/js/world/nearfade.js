// The player seen too close: the camera pushed right up to them by a wall indoors, or a building
// out of doors, its near plane would cut through them (one of the "50 Game Camera Mistakes"); so
// whatever of them is nearer the camera than NEAR_FADE.to metres, along the way it looks, is
// dithered away, the more the nearer, and all of it nearer than `from` (the camera study,
// recommendation 4; as Elden Ring fades what's near its camera). In each of their materials'
// shaders (patched once each, after whatever they do already): no transparency, so nothing's
// drawn out of order, and their shadows stay whole.

// (How near, metres)
export const NEAR_FADE = Object.freeze({ from: 0.7, to: 1.5 });

/** Fade what's too near the camera of everything drawn under `object` (the player's character). */
export function fadeNear(object) {
    object.traverse((node) => {
        if (!node.isMesh) {
            return;
        }

        for (const material of [node.material].flat()) {
            if (material && !material.userData.fadeNear) {
                patch(material);
            }
        }
    });
}

function patch(material) {
    const before = material.onBeforeCompile.bind(material);
    const keyOf = material.customProgramCacheKey.bind(material);

    material.userData.fadeNear = true;
    material.onBeforeCompile = (shader, renderer) => {
        before(shader, renderer);

        // (How far along the way the camera looks: from the fragment's w, any shader's own)
        shader.fragmentShader = shader.fragmentShader.replace(
            "#include <clipping_planes_fragment>",
            `#include <clipping_planes_fragment>
{
    float nearness = 1.0 / gl_FragCoord.w;

    if (nearness < ${NEAR_FADE.to.toFixed(2)}) {
        float dither = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));

        if (dither > smoothstep(${NEAR_FADE.from.toFixed(2)}, ${NEAR_FADE.to.toFixed(2)}, nearness)) discard;
    }
}`,
        );
    };
    material.customProgramCacheKey = () => `fadeNear|${keyOf()}`;
    material.needsUpdate = true;
}
