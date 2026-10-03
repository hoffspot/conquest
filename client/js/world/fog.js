// The haze over the far land (world/far/far.js), the mist in the low ground, what's near fading out
// before the near camera stops (view.js), and the picture's grade: three.js's fog and tone mapping
// shader code changed, once, before anything's drawn (so for every material).
//
// - A fog reaching further than FAR_FOG metres is the far haze: it thickens the further off,
//   exponentially, from its near distance (none nearer), to all but gone (95 %) at its far one, as
//   air does. Nearer fogs (indoors, the labs) are as three.js has them: none to their near
//   distance, thickening evenly to their far one.
// - Under the far haze, mist lies in the low ground (MIST): thickest at and below its floor, thinning
//   by half every so many metres up, so valleys and marshes are hazy and the heights clear. How much
//   of it a line of sight goes through is worked out exactly for that (an exponential's integral
//   from the eye's height to the point's), so it's one sum per pixel.
// - Under the far haze, what's drawn near the player and stands up from the ground (buildings,
//   trees, rocks, folk) fades out, a few pixels at a time (dithered), from FADE.from to FADE.to
//   metres in front of the camera, before the near camera stops (at world/far/levels.js
//   FAR.nearFar) and would cut it through. The ground doesn't (NO_NEAR_FADE): it goes on into the
//   far land. What's seen from afar instead (FAR_FADE_IN: world/far/silhouettes.js) fades in
//   there, in just the pixels the near world leaves.
// - The grade (GRADE): with three.js's custom tone mapping, the picture's ACES as before, then tinted
//   and its colour turned up or down, as the land the player's in has it (world/look.js). Nothing
//   set, nothing changes.
//
// The mist's and the grade's values are shared by every material (put into three.js's own
// materials' uniforms, and its fog's, which the game's shaders take theirs from): set them once,
// and everything has them.

import * as THREE from "three";
import { FAR } from "./far/levels.js";

/** A fog reaching further than this (metres) is the far haze. */
export const FAR_FOG = 400;

/** Where what's near fades out (metres in front of the camera). */
export const FADE = Object.freeze({ from: FAR.nearFar - 32, to: FAR.nearFar - 6 });

/**
 * Which of the pixels go first as what's near fades out (GLSL, 0 to 1: interleaved gradient noise,
 * Jimenez, 2014): the same pixels that what's seen from afar fades in in.
 */
export const FADE_NOISE = "fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) )";

/**
 * The mist in the low ground: x, how thick (a metre, at its floor); y, its floor's height (metres);
 * z, how far up it thins by e (metres). None to start with.
 */
export const MIST = { value: { x: 0, y: 0, z: 20, w: 0 } };

/** The grade: x, y, z, a tint (each colour times 1 plus it); w, saturation (times 1 plus it). */
export const GRADE = { value: { x: 0, y: 0, z: 0, w: 0 } };

// How thick the far haze is at its far distance: 1 - e^-3, 95 %
const THICK = 3;

const FOG = `#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = fogFar > ${FAR_FOG.toFixed(1)}
			? 1.0 - exp( - ${THICK.toFixed(1)} * max( 0.0, vFogDepth - fogNear ) / ( fogFar - fogNear ) )
			: smoothstep( fogNear, fogFar, vFogDepth );
		if ( fogFar > ${FAR_FOG.toFixed(1)} && fogMist.x > 0.0 ) {
			// (The mist along the line of sight: its thickness, e^-(height - floor)/scale, averaged
			// from the eye's height to the point's)
			float mistEye = exp( - clamp( ( cameraPosition.y - fogMist.y ) / fogMist.z, - 1.0, 30.0 ) );
			float mistPoint = exp( - clamp( ( cameraPosition.y + vFogRise - fogMist.y ) / fogMist.z, - 1.0, 30.0 ) );
			float mistAlong = abs( vFogRise ) > 0.5 ? ( mistEye - mistPoint ) * fogMist.z / vFogRise : 0.5 * ( mistEye + mistPoint );
			fogFactor = 1.0 - ( 1.0 - fogFactor ) * exp( - fogMist.x * vFogDepth * mistAlong );
		}
		#if defined( FAR_FADE_IN )
		// (What's seen from afar fading in where the near world fades out: the very pixels it leaves)
		if ( fogFar > ${FAR_FOG.toFixed(1)} && vFogDepth < ${FADE.to.toFixed(1)} ) {
			if ( smoothstep( ${FADE.from.toFixed(1)}, ${FADE.to.toFixed(1)}, vFogDepth ) <= ${FADE_NOISE} ) discard;
		}
		#elif !defined( NO_NEAR_FADE )
		if ( fogFar > ${FAR_FOG.toFixed(1)} && vFogDepth > ${FADE.from.toFixed(1)} ) {
			if ( smoothstep( ${FADE.from.toFixed(1)}, ${FADE.to.toFixed(1)}, vFogDepth ) > ${FADE_NOISE} ) discard;
		}
		#endif
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`;

// (How far up or down from the eye each point is, for the mist: its offset from the camera in the
// world, its direction turned back from the view's)
const FOG_VERTEX = `#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
	vFogRise = ( transpose( mat3( viewMatrix ) ) * mvPosition.xyz ).y;
#endif`;

const FOG_PARS_VERTEX = `#ifdef USE_FOG
	varying float vFogDepth;
	varying float vFogRise;
#endif`;

const FOG_PARS_FRAGMENT = `#ifdef USE_FOG
	uniform vec3 fogColor;
	uniform vec4 fogMist;
	varying float vFogDepth;
	varying float vFogRise;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`;

const GRADED = `uniform vec4 toneGrade;
vec3 CustomToneMapping( vec3 color ) {
	vec3 mapped = ACESFilmicToneMapping( color );
	float luma = dot( mapped, vec3( 0.2126, 0.7152, 0.0722 ) );
	return clamp( mix( vec3( luma ), mapped, 1.0 + toneGrade.w ) * ( 1.0 + toneGrade.xyz ), 0.0, 1.0 );
}`;

const UNGRADED = "vec3 CustomToneMapping( vec3 color ) { return color; }";

/**
 * Change three.js's fog to the far haze's, with the mist, and its custom tone mapping to ACES
 * graded (above). Whether it's so (false if this three.js's code isn't as expected: the fog's
 * then as it was).
 */
export function farHaze() {
    if (THREE.ShaderChunk.fog_fragment === FOG) {
        return true;
    }

    const chunks = THREE.ShaderChunk;

    if (!chunks.fog_fragment.includes("float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );") || chunks.fog_vertex.trim() !== "#ifdef USE_FOG\n\tvFogDepth = - mvPosition.z;\n#endif" || !chunks.tonemapping_pars_fragment.includes(UNGRADED)) {
        return false;
    }

    Object.assign(chunks, { fog_fragment: FOG, fog_vertex: FOG_VERTEX, fog_pars_vertex: FOG_PARS_VERTEX, fog_pars_fragment: FOG_PARS_FRAGMENT });
    chunks.tonemapping_pars_fragment = chunks.tonemapping_pars_fragment.replace(UNGRADED, GRADED);

    // (Every material's the same values: three.js copies each material's uniforms from these, but
    // not a plain object's value, which stays the one object)
    THREE.UniformsLib.fog.fogMist = MIST;

    for (const shader of Object.values(THREE.ShaderLib)) {
        if (shader.uniforms.fogColor) {
            shader.uniforms.fogMist = MIST;
        }

        shader.uniforms.toneGrade = GRADE;
    }

    return true;
}

/**
 * How thick the haze is `depth` metres in front of the camera, as the shader has it (0 to 1);
 * with the mist (MIST's values: { x, y, z }), from an eye at `eye` metres up to a point `rise`
 * metres above it.
 */
export function hazeAt(depth, near, far, { mist = null, eye = 0, rise = 0 } = {}) {
    if (far <= FAR_FOG) {
        const t = Math.min(1, Math.max(0, (depth - near) / (far - near)));

        return t * t * (3 - 2 * t);
    }

    const haze = 1 - Math.exp((-THICK * Math.max(0, depth - near)) / (far - near));

    if (!mist?.x) {
        return haze;
    }

    const thickness = (height) => Math.exp(-Math.min(30, Math.max(-1, (height - mist.y) / mist.z)));
    const along = Math.abs(rise) > 0.5 ? ((thickness(eye) - thickness(eye + rise)) * mist.z) / rise : (thickness(eye) + thickness(eye + rise)) / 2;

    return 1 - (1 - haze) * Math.exp(-mist.x * depth * along);
}
