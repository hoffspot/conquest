// The three patched spots against three.js r187's own shader sources (unpacked beside the review)
const [root, r187] = process.argv.slice(2);
const THREE = await import(`${root}/node_modules/three/build/three.module.js`);
const { SkinMaterial, HairMaterial } = await import(`${root}/client/js/characters/surfaces.js`);
const { STILL_WATER } = await import(`${root}/client/js/world/water.js`);
const chunk = async (name) => (await import(`${r187}/src/renderers/shaders/ShaderChunk/${name}.glsl.js`)).default;
const lighting = await chunk("lights_physical_pars_fragment");
const maps = await chunk("lights_fragment_maps");
const env = await chunk("envmap_physical_pars_fragment");
const ours = THREE.ShaderChunk.lights_physical_pars_fragment;
THREE.ShaderChunk.lights_physical_pars_fragment = lighting;
const compiled = (material) => {
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
    material.onBeforeCompile(shader);
    return shader.fragmentShader;
};
const skin = compiled(new SkinMaterial());
const hair = compiled(new HairMaterial());
THREE.ShaderChunk.lights_physical_pars_fragment = ours;
console.log("r187 skin: wrapped", skin.includes("reflectedLight.directDiffuse += skinLit * directLight.color * diffuseBRDF * ( 1.0 - F );"), "three's own line gone", !skin.includes("+= irradiance * diffuseBRDF"));
console.log("r187 hair: banded", hair.includes("hairBand( hairStrand, geometryNormal, hairHalfway"), "three's own line gone", !hair.includes("reflectedLight.directSpecular += irradiance * specularBRDF"));
console.log("r187 names the light from all round:", ["ENVMAP_TYPE_CUBE_UV", "ENVMAP_TYPE_PMREM"].filter((name) => maps.includes(`defined( ${name} )`) && env.includes(`#ifdef ${name}`)));
console.log("the water asks for it:", STILL_WATER.reflected.includes("defined( ENVMAP_TYPE_PMREM )"), "getIBLRadiance as it's called:", /vec3 getIBLRadiance\( const in vec3 viewDir, const in vec3 normal, const in float roughness \)/.test(env));
