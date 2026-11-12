import sys
root = sys.argv[1]


def edit(path, swaps):
    p = root + '/' + path
    s = open(p).read()
    for a, b in swaps:
        assert s.count(a) == 1, (path, a)
        s = s.replace(a, b)
    open(p, 'w').write(s)


edit('client/js/world/water.js', [
    ('''    vec3 stillSky = vec3(0.0);
#if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
''', '''    vec3 stillSky = vec3(0.0);
#if defined( USE_ENVMAP ) && ( defined( ENVMAP_TYPE_CUBE_UV ) || defined( ENVMAP_TYPE_PMREM ) )
'''),
    (''' * square on).
 */
export const STILL_WATER = Object.freeze({''', ''' * square on). The sky's there to reflect where three.js says the light from all round is the
 * kind it is here: `ENVMAP_TYPE_CUBE_UV` as r186 has it, `ENVMAP_TYPE_PMREM` as r187 names it
 * (either: with neither defined the water would mirror nothing, and say nothing of it;
 * test/far.test.js fails if three.js has neither).
 */
export const STILL_WATER = Object.freeze({'''),
])

edit('client/js/world/art/engine/atlas.js', [
    ('''// (The sky, or the room, reflected, and that much less of their light taken in and given back
// from under the surface)
const SHINE_REFLECTED_GLSL = `
#if defined(USE_ENVMAP) && defined(ENVMAP_TYPE_CUBE_UV)
''', '''// (The sky, or the room, reflected, and that much less of their light taken in and given back
// from under the surface: where three.js says the light from all round is the kind it is here,
// ENVMAP_TYPE_CUBE_UV as r186 has it, ENVMAP_TYPE_PMREM as r187 names it. Either: with neither
// defined nothing would be reflected, and nothing said of it; test/buildings.test.js fails if
// three.js has neither)
const SHINE_REFLECTED_GLSL = `
#if defined(USE_ENVMAP) && (defined(ENVMAP_TYPE_CUBE_UV) || defined(ENVMAP_TYPE_PMREM))
'''),
])

edit('client/js/characters/surfaces.js', [
    ('''const DIFFUSE_LINE = "reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );";
const SPECULAR_LINE = "reflectedLight.directSpecular += irradiance * specularBRDF * material.multiScatteringCompensation;";

// three.js's lighting of a surface from each light, with one line of it changed
function lighting(line, instead) {
    const chunk = THREE.ShaderChunk.lights_physical_pars_fragment;

    if (!chunk.includes(line)) {
        throw new Error("three.js's lighting has changed: surfaces.js needs looking at");
    }

    return chunk.replace(line, instead);
}
''', '''// The line of three.js's lighting that gives a surface its diffuse light from each light: as r186
// has it, and as r187 does (which works its diffuse term out first, for its rough-diffuse option:
// the same thing for skin); and the one that gives it its highlight, the same in both
const DIFFUSE_LINES = ["reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );", "reflectedLight.directDiffuse += irradiance * diffuseBRDF * ( 1.0 - F );"];
const SPECULAR_LINES = ["reflectedLight.directSpecular += irradiance * specularBRDF * material.multiScatteringCompensation;"];

// three.js's lighting of a surface from each light, with one line of it changed: whichever of
// `lines` this three.js has, `instead(line)` in its place
function lighting(lines, instead) {
    const chunk = THREE.ShaderChunk.lights_physical_pars_fragment;
    const line = lines.find((each) => chunk.includes(each));

    if (!line) {
        throw new Error("three.js's lighting has changed: surfaces.js needs looking at");
    }

    return chunk.replace(line, instead(line));
}
'''),
    ('''            .replace("#include <lights_physical_pars_fragment>", lighting(DIFFUSE_LINE, `vec3 skinLit = saturate( ( dot( geometryNormal, directLight.direction ) + SKIN_WRAP ) / ( 1.0 + SKIN_WRAP ) );\\n\\treflectedLight.directDiffuse += skinLit * directLight.color * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );`))''',
     '''            // (three.js's own line, the light wrapped round in place of its `irradiance`)
            .replace("#include <lights_physical_pars_fragment>", lighting(DIFFUSE_LINES, (line) => `vec3 skinLit = saturate( ( dot( geometryNormal, directLight.direction ) + SKIN_WRAP ) / ( 1.0 + SKIN_WRAP ) );\\n\\t${line.replace("irradiance", "skinLit * directLight.color")}`))'''),
    ('''                lighting(
                    SPECULAR_LINE,
                    `vec3 hairHalfway = normalize( directLight.direction + geometryViewDir );''', '''                lighting(
                    SPECULAR_LINES,
                    () => `vec3 hairHalfway = normalize( directLight.direction + geometryViewDir );'''),
])
