// The sun's shadows: drawn into a map of a square round the player (view.js), which follows
// them about.
//
// It's moved only in whole texels of the map, across the sun's own view, so that its texels
// stay put on the ground and shadows' edges stand still as the player walks, rather than
// crawling. It's turned to follow the sun round as the day goes only in small steps, so that its
// texels stay put between them too, rather than all its shadows' edges shimmering. And its shadows fade out towards the map's edges, rather than stopping along a
// straight line, which shows when the camera's drawn back or looks out towards the horizon.

import * as THREE from "three";

// Shadows fade from this far out from the map's middle (0) to its edge (1)
const FADE_FROM = 0.8;

// Where three.js's shadow code has worked out whether a point is in the map at all (each kind of
// shadow map's, the sun's the soft one)
const IN_MAP = "bool frustumTest = inFrustum && shadowCoord.z <= 1.0;";

const UP = new THREE.Vector3(0, 1, 0);
const _across = new THREE.Vector3();
const _upward = new THREE.Vector3();

/**
 * Move a point (the middle of the sun's shadow map, in place) to the nearest whole `texel`
 * across the sun's view (looking back along `sunDirection`, upright, as the shadow's camera
 * does). Whole texels along the world's own axes aren't whole texels to the sun, which looks down
 * at a slant. Returns the point.
 */
export function snapToTexels(point, sunDirection, texel) {
    _across.crossVectors(UP, sunDirection).normalize();
    _upward.crossVectors(sunDirection, _across);

    const across = point.dot(_across);
    const upward = point.dot(_upward);

    return point.addScaledVector(_across, Math.round(across / texel) * texel - across).addScaledVector(_upward, Math.round(upward / texel) * texel - upward);
}

/**
 * How far round the sun goes before its shadows are cast from where it's got to (radians: about
 * every second and a half as the day goes, core/daytime.js, a shadow's tip a few centimetres on).
 */
export const SHADOW_STEP = 0.002;

/**
 * The way the sun's shadows are cast from (`shadow`, in place) moved on to the sun's (`sun`) only
 * once it's gone `step` round from it (or jumped there: the moon taking over, going in or out):
 * a shadow map turned a little every frame draws each shadow's edge a little differently every
 * frame, so that all of them shimmer. Whether it's moved.
 */
export function stepShadows(shadow, sun, step = SHADOW_STEP) {
    if (shadow.angleTo(sun) < step) {
        return false;
    }

    shadow.copy(sun);

    return true;
}

/**
 * Make shadows fade out towards the edges of their maps: three.js's shadow shader code changed,
 * once, before anything's drawn (so for every lit material). Whether it's so (false if this
 * three.js's code isn't as expected, shadows then stopping at the edge as before).
 */
export function fadeShadowEdges() {
    const code = THREE.ShaderChunk.shadowmap_pars_fragment;

    if (code.includes("shadowEdge")) {
        return true;
    }

    if (!code.includes(IN_MAP)) {
        return false;
    }

    THREE.ShaderChunk.shadowmap_pars_fragment = code.replaceAll(IN_MAP, `${IN_MAP}
			vec2 shadowEdge = abs( shadowCoord.xy - 0.5 ) * 2.0;
			shadowIntensity *= 1.0 - smoothstep( ${FADE_FROM.toFixed(2)}, 1.0, max( shadowEdge.x, shadowEdge.y ) );`);

    return true;
}
