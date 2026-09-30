// How skin and hair take the light, beyond what three.js's standard material does.
//
// Skin: how rough it is changes over the body, read from its picture's alpha (skin.js
// SKIN_ROUGHNESS: glossier down the forehead and nose and on the lips, matte in the creases), and
// light reaches a little way round past where it turns from the sun, red furthest, as light
// scattered under the skin does (the cheap stand-in for it: "wrapped" diffuse light), so the
// shadow's edge on a face is soft and warm rather than a waxy grey line.
//
// Hair: its highlights are bands across the strands, as a head of hair's are, not round spots:
// two of them (Kajiya and Kay's model, with Scheuermann's shifted lobes), a white one from light
// off the strands' surface, and a wider one a little further along, tinted by the hair's own
// colour (light that's been through a strand and back). Which way the strands run is worked out
// where they're drawn, from how the texture runs along each card (strands run down it), so no
// more is stored.

import * as THREE from "three";
import { SKIN_ROUGHNESS } from "./skin.js";

/**
 * How far round skin is lit past where it turns from a light, for red, green and blue: a share
 * of the way round a quarter turn (red goes furthest into the skin).
 */
export const SKIN_WRAP = Object.freeze([0.3, 0.13, 0.08]);

/**
 * Hair's highlights: how far each is shifted along the strands (towards the tips, or the
 * roots), how tight it is (a higher `sharp` is a narrower band), and how bright; and how far
 * a strand's are shifted from its neighbours' (`jitter`, by how light it is in the texture).
 */
export const HAIR_SHINE = Object.freeze({ shift: 0.08, sharp: 260, strength: 0.07, tintShift: -0.1, tintSharp: 60, tintStrength: 0.12, jitter: 1.5 });

const DIFFUSE_LINE = "reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );";
const SPECULAR_LINE = "reflectedLight.directSpecular += irradiance * specularBRDF * material.multiScatteringCompensation;";

// three.js's lighting of a surface from each light, with one line of it changed
function lighting(line, instead) {
    const chunk = THREE.ShaderChunk.lights_physical_pars_fragment;

    if (!chunk.includes(line)) {
        throw new Error("three.js's lighting has changed: surfaces.js needs looking at");
    }

    return chunk.replace(line, instead);
}

const vec3 = (values) => `vec3( ${values.map((value) => value.toFixed(3)).join(", ")} )`;

/**
 * Skin's material: three.js's standard one, its roughness read from its map's alpha and the
 * light wrapped a little way round (see above). Copied, as someone unseen's are (game.js), it's
 * still skin. Its `roughness` scales the picture's.
 */
export class SkinMaterial extends THREE.MeshStandardMaterial {
    constructor(parameters = {}) {
        super({ roughness: 1, ...parameters });
    }

    onBeforeCompile(shader) {
        shader.fragmentShader = shader.fragmentShader
            // (Its roughness from the picture's alpha, which isn't how see-through it is)
            .replace("#include <map_fragment>", `#include <map_fragment>\n#ifdef USE_MAP\n\tfloat skinRoughness = sampledDiffuseColor.a;\n\tdiffuseColor.a = opacity;\n#else\n\tfloat skinRoughness = ${SKIN_ROUGHNESS.skin.toFixed(2)};\n#endif`)
            .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\n\troughnessFactor *= skinRoughness;")
            .replace("#include <lights_physical_pars_fragment>", lighting(DIFFUSE_LINE, `vec3 skinLit = saturate( ( dot( geometryNormal, directLight.direction ) + SKIN_WRAP ) / ( 1.0 + SKIN_WRAP ) );\n\treflectedLight.directDiffuse += skinLit * directLight.color * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );`))
            .replace("#include <common>", `#include <common>\nconst vec3 SKIN_WRAP = ${vec3(SKIN_WRAP)};`);
    }

    customProgramCacheKey() {
        return "skin";
    }
}

/**
 * Hair's material: three.js's standard one, lit by the sun and lamps in bands across its strands
 * (see above). Its colour tints the second band.
 */
export class HairMaterial extends THREE.MeshStandardMaterial {
    onBeforeCompile(shader) {
        const { shift, sharp, strength, tintShift, tintSharp, tintStrength, jitter } = HAIR_SHINE;

        shader.fragmentShader = shader.fragmentShader
            .replace(
                "#include <common>",
                `#include <common>

const float HAIR_JITTER = ${jitter.toFixed(3)};
vec3 hairStrand;
float hairShift;

// A band of light along strands running \`strand\` (Kajiya-Kay), its strands' direction shifted
// towards the surface's normal (so the band moves along them)
float hairBand( const in vec3 strand, const in vec3 normal, const in vec3 halfway, const in float shift, const in float sharp ) {
	vec3 shifted = normalize( strand + shift * normal );
	float along = dot( shifted, halfway );

	return smoothstep( - 1.0, 0.0, along ) * pow( sqrt( max( 0.0, 1.0 - along * along ) ), sharp );
}`,
            )
            // (Each strand's bands a little along from its neighbours', by how light its strand is in
            // the texture, so they break into streaks rather than lighting a card at a time)
            .replace("#include <map_fragment>", "#include <map_fragment>\n#ifdef USE_MAP\n\thairShift = ( sampledDiffuseColor.g - 0.85 ) * HAIR_JITTER;\n#else\n\thairShift = 0.0;\n#endif")
            // (Which way the strands run here: the way the texture's v runs, from how it and the
            // surface change across the pixel, as three.js finds a normal map's frame)
            .replace(
                "#include <lights_fragment_begin>",
                `#ifdef USE_MAP
	vec3 hairAcrossX = dFdx( - vViewPosition );
	vec3 hairAcrossY = dFdy( - vViewPosition );
	vec2 hairUvX = dFdx( vMapUv );
	vec2 hairUvY = dFdy( vMapUv );
	vec3 hairAlong = cross( hairAcrossY, normal ) * hairUvX.y + cross( normal, hairAcrossX ) * hairUvY.y;
	float hairAlongLength = length( hairAlong );
	hairStrand = hairAlongLength > 1e-8 ? hairAlong / hairAlongLength : vec3( 0.0, 1.0, 0.0 );
#else
	hairStrand = vec3( 0.0, 1.0, 0.0 );
#endif
#include <lights_fragment_begin>`,
            )
            .replace(
                "#include <lights_physical_pars_fragment>",
                lighting(
                    SPECULAR_LINE,
                    `vec3 hairHalfway = normalize( directLight.direction + geometryViewDir );
	float hairFacing = saturate( dot( geometryNormal, directLight.direction ) * 0.5 + 0.5 );
	reflectedLight.directSpecular += directLight.color * hairFacing * ( ${strength.toFixed(3)} * hairBand( hairStrand, geometryNormal, hairHalfway, ${shift.toFixed(3)} + hairShift, ${sharp.toFixed(1)} ) + ${tintStrength.toFixed(3)} * material.diffuseColor * hairBand( hairStrand, geometryNormal, hairHalfway, ${tintShift.toFixed(3)} + hairShift, ${tintSharp.toFixed(1)} ) );`,
                ),
            );
    }

    customProgramCacheKey() {
        return "hair";
    }
}
