// What a body drawn in full costs the page a frame, in Node (CPU time, not wall): node frame-cost.mjs
import { REPO, THREE, Character, makeKit, census } from "./harness.mjs";
const { soldierLook } = await import(`${REPO}/client/js/characters/soldiers.js`);
const { folkLook } = await import(`${REPO}/client/js/characters/folk.js`);
const { Avatar } = await import(`${REPO}/client/js/world/avatar.js`);
const kit = makeKit(64);
kit.atlas = null;
const cpu = (f, n) => { const t = process.cpuUsage(); for (let k = 0; k < n; k++) f(k); const d = process.cpuUsage(t); return (d.user + d.system) / n; };
const make = (look, guard) => {
    const character = new Character(kit, { shape: look.shape, look: look.look, equipment: look.equipment, merge: true, far: true, hairDetail: 0.2 });
    const avatar = new Avatar(character, { walk: look.walk, guard });
    avatar.place(0, 0, 0);
    return { character, avatar };
};
const soldier = make(soldierLook({ people: "human", weapon: "sword", seed: 3 }), "sword");
const woman = make(folkLook({ role: "townsfolk", look: "servant", sex: "f", seed: 103 }), null);
for (const [name, { character, avatar }] of [["soldier (sword, shield, helm)", soldier], ["townswoman (skirt, apron)", woman]]) {
    let nodes = 0; character.object.traverse(() => nodes++);
    const c = census(character.object);
    const skeletons = [...c.skeletons];
    console.log(`${name}: ${nodes} nodes, ${c.meshes} meshes (${c.skinned} skinned), skeletons ${skeletons.map((s) => s.bones.length)} bones`);
    for (let run = 0; run < 3; run++) {
        let z = 0;
        const walking = cpu(() => { z += 1.3 / 60; avatar.update(1 / 60, 0, z, 0, true); }, 3000);
        avatar.actions.setGuard(true);
        const guard = cpu(() => avatar.update(1 / 60, 0, z, 0, true), 3000);
        avatar.actions.setGuard(false);
        const standing = cpu(() => avatar.update(1 / 60, 0, z, 0, true), 3000);
        avatar.every = 4;
        const everyFour = cpu(() => { z += 1.3 / 60; avatar.update(1 / 60, 0, z, 0, true); }, 3000);
        avatar.every = 1;
        const matrices = cpu(() => { character.object.position.x += 1e-6; character.object.updateMatrixWorld(); }, 3000);
        const bones = cpu(() => { for (const s of skeletons) s.update(); }, 3000);
        console.log(`   run ${run + 1}: pose walking ${walking.toFixed(0)} us, on guard ${guard.toFixed(0)} us, standing ${standing.toFixed(0)} us; update() when posed every 4th frame ${everyFour.toFixed(0)} us a frame; world matrices ${matrices.toFixed(0)} us; skeleton.update ${bones.toFixed(0)} us`);
    }
}
// A big rig's skeletons, as a bought model's copy has them: one Skeleton a skinned mesh (SkeletonUtils.clone)
for (const [bones, meshes, label] of [[58, 2, "flayling: 58 bones, shown mesh + shadow"], [149, 9, "Order foot knight: 149 bones, about 8 materials + shadow"], [443, 16, "Order rider: 443 bones, about 15 materials + shadow"]]) {
    const root = new THREE.Bone(); const list = [root];
    for (let k = 1; k < bones; k++) { const b = new THREE.Bone(); b.position.set(0, 0.01, 0); list[Math.floor(Math.random() * list.length)].add(b); list.push(b); }
    root.updateMatrixWorld(true);
    const skeletons = Array.from({ length: meshes }, () => new THREE.Skeleton(list));
    const size = Math.max(4, Math.ceil(Math.sqrt(bones * 4) / 4) * 4);
    for (let run = 0; run < 3; run++) {
        const t = cpu(() => { for (const s of skeletons) s.update(); }, 2000);
        const one = cpu(() => skeletons[0].update(), 2000);
        console.log(`${label}: skeleton.update x${meshes} ${t.toFixed(0)} us a frame (one shared: ${one.toFixed(0)} us); bone texture ${size}x${size} RGBA32F = ${(size * size * 16 / 1024).toFixed(1)} KB each, ${(meshes * size * size * 16 / 1024).toFixed(0)} KB uploaded a frame`);
    }
}
process.exit(0);
