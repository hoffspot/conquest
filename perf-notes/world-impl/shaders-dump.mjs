// The shaders the three patched spots give three.js to compile, written out to compare before
// and after: skin and hair (characters/surfaces.js), the atlas (world/art/engine/atlas.js) and
// still water's reflection (world/water.js)
//   node shaders-dump.mjs <worktree> <out folder>
import { writeFileSync, mkdirSync } from "node:fs";
const [root, out] = process.argv.slice(2);
const THREE = await import(`${root}/node_modules/three/build/three.module.js`);
const { SkinMaterial, HairMaterial } = await import(`${root}/client/js/characters/surfaces.js`);
const { atlasMaterial } = await import(`${root}/client/js/world/art/engine/atlas.js`);
const { STILL_WATER } = await import(`${root}/client/js/world/water.js`);
mkdirSync(out, { recursive: true });
const compiled = (material, lib) => {
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib[lib].vertexShader, fragmentShader: THREE.ShaderLib[lib].fragmentShader };
    material.onBeforeCompile(shader);
    return `${shader.vertexShader}\n// ---- fragment ----\n${shader.fragmentShader}`;
};
writeFileSync(`${out}/skin.glsl`, compiled(new SkinMaterial(), "standard"));
writeFileSync(`${out}/hair.glsl`, compiled(new HairMaterial(), "standard"));
writeFileSync(`${out}/atlas.glsl`, compiled(atlasMaterial(), "lambert"));
writeFileSync(`${out}/water.glsl`, `${STILL_WATER.pars}\n${STILL_WATER.up}\n${STILL_WATER.reflected}`);
console.log("written to", out);
