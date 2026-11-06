// A model's shadow (client/js/beasts/model.js modelBody): cast from its least detailed level, of
// the parts its `shade` names, those meshes joined into one (shadowShape) where there's more than
// one, a draw for it and no more; each mesh's corners where its own skin put them, whatever packing
// its skin undid (the pipeline's: each mesh's positions packed small, its skin's inverses making
// them full size again); none cast, nor drawn unseen, while it's too small for its shadow to show
// (castShadows). Made here from a small model of the Order's in code: no licensed model needed.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";

const { MODELS, SHADOW_DETAIL, modelBody } = await import("../client/js/beasts/model.js");
const { lowerDetail } = await import("../client/js/characters/lod.js");

// A skinned mesh of a part (`name`), at a level of detail (`lod`), in a material (`material`): a
// ball of it (`segments` round), weighted between the two bones by how high it is, its positions
// packed by `pack` (a matrix: its skin's inverses made to undo it, as the pipeline's are), or not
function partMesh(name, lod, material, bones, { pack = new THREE.Matrix4(), segments = 4, seed = 1 } = {}) {
    const unpack = pack.clone().invert();
    const geometry = new THREE.SphereGeometry(0.3 + 0.05 * seed, segments, Math.max(2, segments / 2));
    const position = geometry.attributes.position;
    const joints = [];
    const weights = [];
    const v = new THREE.Vector3();

    geometry.deleteAttribute("uv");

    for (let i = 0; i < position.count; i++) {
        v.fromBufferAttribute(position, i);
        v.set(v.x + 0.1 * Math.sin(seed), v.y + 1 + 0.1 * seed, v.z);

        const up = Math.min(1, Math.max(0, (v.y - 0.6) / 1));

        joints.push(0, 1, 0, 0);
        weights.push(1 - up, up, 0, 0);
        v.applyMatrix4(unpack);
        position.setXYZ(i, v.x, v.y, v.z);
    }

    geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(joints, 4));
    geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(weights, 4));

    const mesh = new THREE.SkinnedMesh(geometry, material);
    const inverses = bones.map((bone) => bone.matrixWorld.clone().invert().multiply(pack));

    mesh.name = name;
    mesh.bind(new THREE.Skeleton(bones, inverses), new THREE.Matrix4());

    return mesh;
}

// A part's node as three.js's glTF loader makes it: its level of detail on the node (the pipeline's
// extras.lod), a part of one material the mesh itself, of several a group round a mesh of each
function partNode(name, lod, meshes) {
    const node = meshes.length > 1 ? new THREE.Group() : meshes[0];

    node.name = name;

    if (lod) {
        node.userData.lod = lod;
    }

    if (meshes.length > 1) {
        node.add(...meshes);
    }

    return node;
}

// A small model of the Order's: two bones, its body a part of two materials, its cloak packed its
// own way, its head; each at its first level and its least detailed, as the pipeline packs them
function orderModel({ segments = 4 } = {}) {
    const scene = new THREE.Group();
    const root = new THREE.Bone();
    const spine = new THREE.Bone();
    const materials = Object.fromEntries(["M_Chainmail", "M_Cloth", "M_Head"].map((name) => [name, Object.assign(new THREE.MeshStandardMaterial(), { name })]));
    const cloakPack = new THREE.Matrix4().compose(new THREE.Vector3(0.1, 0.9, -0.05), new THREE.Quaternion(), new THREE.Vector3(0.6, 1.1, 0.5));

    root.name = "pelvis";
    spine.name = "spine_03";
    spine.position.set(0, 1, 0);
    root.add(spine);
    scene.add(root);
    scene.updateMatrixWorld(true);

    for (const [lod, suffix] of [[0, ""], [1, "lod1"], [2, "lod2"]]) {
        const body = partNode(`Body${suffix}`, lod, [partMesh(`Body${suffix}`, lod, materials.M_Chainmail, [root, spine], { seed: 1 + lod, segments }), partMesh(`Body${suffix}_1`, lod, materials.M_Cloth, [root, spine], { seed: 2 + lod, segments })]);
        const cloak = partNode(`Cloak${suffix}`, lod, [partMesh(`Cloak${suffix}`, lod, materials.M_Cloth, [root, spine], { pack: cloakPack, seed: 3 + lod, segments })]);
        const head = partNode(`Head${suffix}`, lod, [partMesh(`Head${suffix}`, lod, materials.M_Head, [root, spine], { seed: 4 + lod })]);

        scene.add(body, cloak, head);
    }

    const model = MODELS.choirKnight;
    const names = new Set([...Object.values(model.clips), ...Object.values(model.specials), ...Object.values(model.rests)]);
    const animations = [...names].map((name) => new THREE.AnimationClip(name, 1, []));

    return { scene, animations };
}

// Where a skinned mesh puts its corner `i`, in the world
const cornerOf = (mesh, i) => mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);

// Its meshes, of a level, by what's drawn of them
const meshesOf = (plan) => {
    const meshes = [];

    plan.object.traverse((node) => node.isSkinnedMesh && meshes.push(node));

    return meshes;
};

describe("a model's shadow (beasts/model.js)", () => {
    it("is cast from its least detailed level's body and cloak joined into one, each corner where its own skin put it, however the figure's posed", () => {
        const plan = modelBody("choirKnight", orderModel(), { parts: ["Body", "Cloak", "Head"] });
        const [caster] = plan.casters;
        const least = plan.levels.at(-1);
        const shading = least.filter((mesh) => !mesh.name.startsWith("Head"));

        assert.equal(plan.casters.length, 1);
        assert.ok(caster.isSkinnedMesh && caster.castShadow && caster.visible && !caster.receiveShadow);
        assert.equal(caster.material.colorWrite, false);
        assert.ok(plan.levels.flat().every((mesh) => !mesh.castShadow), "none of its own meshes casts it");
        assert.equal(shading.length, 3);
        assert.equal(caster.geometry.attributes.position.count, shading.reduce((sum, { geometry }) => sum + geometry.attributes.position.count, 0));
        assert.ok(!caster.geometry.attributes.uv && !caster.geometry.attributes.normal, "where its corners are and how they're weighted, no more");

        // (Posed: its spine bent, the figure turned and moved; the shadow's corners where the
        // meshes' own skins put theirs)
        const spine = plan.object.getObjectByName("spine_03");

        spine.rotation.set(0.4, -0.7, 0.25);
        plan.object.position.set(3, 0.5, -2);
        plan.object.rotation.y = 1.1;
        plan.object.updateMatrixWorld(true);

        let at = 0;

        for (const mesh of shading) {
            for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
                const own = cornerOf(mesh, i);
                const cast = cornerOf(caster, at + i);

                assert.ok(own.distanceTo(cast) < 1e-5, `${mesh.name} ${i}: ${own.toArray()} ${cast.toArray()}`);
            }

            at += mesh.geometry.attributes.position.count;
        }
    });

    it("is drawn unseen at every level while it's cast, and not at all while it isn't; its levels shown one at a time all the same", () => {
        const plan = modelBody("choirKnight", orderModel(), { parts: ["Body", "Cloak", "Head"] });
        const [caster] = plan.casters;
        const shownAt = () => plan.levels.map((meshes) => meshes.every(({ visible }) => visible));

        // (Each level every part it wears, a part of several materials (its body) among them: its
        // level read from the group round its meshes, where three.js puts its node's extras)
        assert.deepEqual(
            plan.levels.map((meshes) => meshes.map(({ name }) => name).sort()),
            ["", "lod1", "lod2"].map((suffix) => [`Body${suffix}`, `Body${suffix}_1`, `Cloak${suffix}`, `Head${suffix}`]),
        );
        assert.deepEqual(shownAt(), [true, false, false]);

        plan.showLevel(2);
        assert.ok(caster.visible && caster.castShadow);
        assert.equal(plan.levels.at(-1).every(({ visible, material }) => visible && material.colorWrite !== false), true);

        plan.castShadows(false);
        assert.ok(!caster.visible && !caster.castShadow);
        plan.showLevel(0);
        assert.ok(!caster.visible);
        plan.castShadows(true);
        assert.ok(caster.visible && caster.castShadow);
        assert.equal(meshesOf(plan).filter(({ visible }) => visible).length, 4 + 1, "its first level's four meshes, and its shadow's");
    });

    it("is drawn with fewer triangles once they're made (about SHADOW_DETAIL's share), over the same corners, made once for everyone drawn from the model", async () => {
        const gltf = orderModel({ segments: 24 });
        const one = modelBody("choirKnight", gltf, { parts: ["Body", "Cloak", "Head"] });
        const other = modelBody("choirKnight", gltf, { parts: ["Body", "Cloak", "Head"] });
        const whole = one.casters[0].geometry;
        let asked = 0;
        // (The kit's maker of fewer triangles, here and now: lod.js Lods.of)
        const lods = { of: (key, mesh) => (asked++, Promise.resolve(mesh()).then(({ indices, positions, uvs, share, error, flags }) => lowerDetail(indices, positions, uvs, share, error, flags))) };

        one.object.updateMatrixWorld(true);
        other.object.updateMatrixWorld(true);
        await Promise.all([one.lowerShadow(lods), other.lowerShadow(lods)]);

        const lower = one.casters[0].geometry;

        assert.notEqual(lower, whole);
        assert.equal(other.casters[0].geometry, lower, "one for everyone");
        assert.equal(asked, 1);
        assert.equal(lower.attributes.position, whole.attributes.position, "the same corners");
        assert.ok(lower.index.count < whole.index.count * (SHADOW_DETAIL.share + 0.25), `${lower.index.count} of ${whole.index.count}`);
        assert.ok(lower.index.count > 0);

        // (A model of one mesh: nothing to make)
        const single = modelBody("bellBrother", orderModel(), { parts: ["Cloak", "Head"] });

        await single.lowerShadow(lods);
        assert.equal(asked, 1);
    });

    it("joins one shape for everyone drawn from the model", () => {
        const gltf = orderModel();
        const one = modelBody("choirKnight", gltf, { parts: ["Body", "Cloak", "Head"] });
        const other = modelBody("choirKnight", gltf, { parts: ["Body", "Cloak", "Head"] });

        assert.equal(one.casters[0].geometry, other.casters[0].geometry);
        assert.notEqual(one.casters[0], other.casters[0]);
    });

    it("of a single mesh, is cast from that mesh itself: unseen while another level's shown, drawn as it is at its own; hidden with its level while none's cast, and cast again after", () => {
        // (Its cloak alone of the parts the Order's shadows are cast from: its body, cloak and horse)
        const plan = modelBody("bellBrother", orderModel(), { parts: ["Cloak", "Head"] });
        const [caster] = plan.casters;

        assert.equal(plan.casters.length, 1);
        assert.ok(plan.levels.at(-1).includes(caster) && caster.name === "Cloaklod2");
        assert.ok(caster.visible && caster.castShadow && caster.material.colorWrite === false);

        plan.showLevel(2);

        const drawn = caster.material;

        assert.ok(caster.visible && drawn.colorWrite !== false && drawn.name === "M_Cloth");
        plan.showLevel(0);
        plan.castShadows(false);
        assert.ok(!caster.visible && !caster.castShadow);
        plan.showLevel(2);
        assert.ok(caster.visible && caster.material === drawn);
        plan.showLevel(0);
        plan.castShadows(true);
        assert.ok(caster.visible && caster.castShadow && caster.material.colorWrite === false);
    });
});
