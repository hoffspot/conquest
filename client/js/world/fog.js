// The haze over the far land (world/far/far.js), and what's near fading out before the near
// camera stops (view.js): three.js's fog shader code changed, once, before anything's drawn (so
// for every material with fog).
//
// - A fog reaching further than FAR_FOG metres is the far haze: it thickens the further off,
//   exponentially, from its near distance (none nearer), to all but gone (95 %) at its far one, as
//   air does. Nearer fogs (indoors, the labs) are as three.js has them: none to their near
//   distance, thickening evenly to their far one.
// - Under the far haze, what's drawn near the player and stands up from the ground (buildings,
//   trees, rocks, folk) fades out, a few pixels at a time (dithered), from FADE.from to FADE.to
//   metres in front of the camera, before the near camera stops (at world/far/levels.js
//   FAR.nearFar) and would cut it through. The ground doesn't (NO_NEAR_FADE): it goes on into the
//   far land.

import * as THREE from "three";
import { FAR } from "./far/levels.js";

/** A fog reaching further than this (metres) is the far haze. */
export const FAR_FOG = 400;

/** Where what's near fades out (metres in front of the camera). */
export const FADE = Object.freeze({ from: FAR.nearFar - 32, to: FAR.nearFar - 6 });

// How thick the far haze is at its far distance: 1 - e^-3, 95 %
const THICK = 3;

const FOG = `#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = fogFar > ${FAR_FOG.toFixed(1)}
			? 1.0 - exp( - ${THICK.toFixed(1)} * max( 0.0, vFogDepth - fogNear ) / ( fogFar - fogNear ) )
			: smoothstep( fogNear, fogFar, vFogDepth );
		#ifndef NO_NEAR_FADE
		if ( fogFar > ${FAR_FOG.toFixed(1)} && vFogDepth > ${FADE.from.toFixed(1)} ) {
			// (Interleaved gradient noise: Jimenez, 2014)
			float fadeNoise = fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) );
			if ( smoothstep( ${FADE.from.toFixed(1)}, ${FADE.to.toFixed(1)}, vFogDepth ) > fadeNoise ) discard;
		}
		#endif
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`;

/**
 * Change three.js's fog to the far haze's (above). Whether it's so (false if this three.js's
 * code isn't as expected: the fog's then as it was).
 */
export function farHaze() {
    const code = THREE.ShaderChunk.fog_fragment;

    if (code === FOG) {
        return true;
    }

    if (!code.includes("float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );")) {
        return false;
    }

    THREE.ShaderChunk.fog_fragment = FOG;

    return true;
}

/** How thick the haze is `depth` metres in front of the camera, as the shader has it (0 to 1). */
export function hazeAt(depth, near, far) {
    if (far > FAR_FOG) {
        return 1 - Math.exp((-THICK * Math.max(0, depth - near)) / (far - near));
    }

    const t = Math.min(1, Math.max(0, (depth - near) / (far - near)));

    return t * t * (3 - 2 * t);
}
