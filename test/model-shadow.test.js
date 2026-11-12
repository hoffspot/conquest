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
    const materials = Object.fromEntries(["M_Chainmail", "M_Cloth", "M_Head", "M_Eyes", "M_Weapon"].map((name) => [name, Object.assign(new THREE.MeshStandardMaterial(), { name })]));
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
        const head = partNode(`Head${suffix}`, lod, [partMesh(`Head${suffix}`, lod, materials.M_Head, [root, spine], { seed: 4 + lod }), partMesh(`Head${suffix}_1`, lod, materials.M_Eyes, [root, spine], { seed: 5 + lod })]);
        const knife = partNode(`Knife${suffix}`, lod, [partMesh(`Knife${suffix}`, lod, materials.M_Weapon, [root, spine], { seed: 6 + lod })]);

        scene.add(body, cloak, head, knife);
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

// Its skeletons, each once however many meshes it poses
const skeletonsOf = (plan) => new Set(meshesOf(plan).map(({ skeleton }) => skeleton));

describe("one drawn from a model of many parts (beasts/model.js modelBody)", () => {
    // Both posed alike: the model as read, each mesh its own skin, and one drawn from it
    const bend = (gltf, plan, turn) => {
        for (const root of [gltf.scene, plan.object]) {
            root.getObjectByName("spine_03").rotation.set(...turn);
            root.getObjectByName("pelvis").position.set(0.1, 0.05, -0.2);
            root.updateMatrixWorld(true);
        }
    };
    // How far any corner of one drawn from a model is from where the model's own mesh of that name
    // puts it (in the model's own space: what's drawn of it is sized and sunk), at most
    const apart = (gltf, plan) => {
        const back = plan.object.children[0].children[0].matrixWorld.clone().invert();
        let [worst, compared] = [0, 0];

        for (const mesh of meshesOf(plan)) {
            const own = gltf.scene.getObjectByName(mesh.name);

            if (own?.geometry !== mesh.geometry) {
                continue;
            }

            for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
                worst = Math.max(worst, cornerOf(mesh, i).applyMatrix4(back).distanceTo(cornerOf(own, i)));
                compared++;
            }
        }

        return { worst, compared };
    };

    it("is posed by one skeleton between all its meshes, not one each, every corner where its own skin put it; and what it doesn't wear isn't copied", () => {
        const gltf = orderModel();
        const whole = modelBody("choirKnight", gltf);
        const worn = modelBody("choirKnight", gltf, { parts: ["Body", "Cloak", "Head"] });

        // (The model as read: a skin to every mesh, the same two bones, other inverses)
        const read = [];

        gltf.scene.traverse((node) => node.isSkinnedMesh && read.push(node.skeleton));
        assert.equal(new Set(read).size, 18);

        for (const plan of [whole, worn]) {
            assert.equal(skeletonsOf(plan).size, 1, "one skeleton, its shadow's and its joined parts' too");
            assert.equal(plan.casters[0].skeleton, plan.levels[0][0].skeleton);

            for (const turn of [[0, 0, 0], [0.4, -0.7, 0.25], [-1.1, 0.3, 0.6]]) {
                bend(gltf, plan, turn);

                const { worst, compared } = apart(gltf, plan);

                // (Every mesh of it that's the model's own: those joined for it aren't, test below)
                assert.ok(compared >= (plan === whole ? 150 : 30) && worst < 1e-5, `${worst} apart over ${compared} corners`);
            }
        }

        // (Its cloak, packed its own way: bound with what undoes that, not as the first is)
        const [body, cloak] = ["Body", "Cloak"].map((name) => meshesOf(whole).find((mesh) => mesh.name === name));

        assert.equal(cloak.skeleton, body.skeleton);
        assert.ok(!cloak.bindMatrix.equals(body.bindMatrix));

        // (Its bones its own, not the model's, nor another's drawn from it)
        assert.notEqual(whole.object.getObjectByName("spine_03"), gltf.scene.getObjectByName("spine_03"));
        assert.notEqual(whole.object.getObjectByName("spine_03"), worn.object.getObjectByName("spine_03"));
        assert.ok([...skeletonsOf(whole)][0].bones.every((bone) => bone === whole.object.getObjectByName(bone.name)));

        // (What it doesn't wear: nowhere in it)
        assert.ok(whole.object.getObjectByName("Knife") && !worn.object.getObjectByName("Knife") && !worn.object.getObjectByName("Knifelod1"));
        assert.equal(meshesOf(worn).filter(({ name }) => name.startsWith("Knife")).length, 0);
    });

    it("leaves a mesh its own skeleton whose skin has the bones in another order, or puts it elsewhere bone by bone: drawn as it was all the same", () => {
        const gltf = orderModel();
        const [root, spine] = ["pelvis", "spine_03"].map((name) => gltf.scene.getObjectByName(name));
        const material = Object.assign(new THREE.MeshStandardMaterial(), { name: "M_Weapon" });
        // (Its bones the other way round, its corners weighted by their numbers in that order)
        const swapped = partMesh("Sword", 0, material, [spine, root], { seed: 7 });
        // (Its skin's inverses not the others' times one packing: one bone's its own)
        const skewed = partMesh("Shield", 0, material, [root, spine], { seed: 8 });

        skewed.skeleton.boneInverses[1].multiply(new THREE.Matrix4().makeTranslation(0.2, 0, 0));
        gltf.scene.add(swapped, skewed);

        const plan = modelBody("choirKnight", gltf);

        const skeletonOf = (name) => meshesOf(plan).find((mesh) => mesh.name === name).skeleton;

        assert.equal(skeletonsOf(plan).size, 3);
        assert.notEqual(skeletonOf("Sword"), skeletonOf("Body"));
        assert.notEqual(skeletonOf("Shield"), skeletonOf("Sword"));
        assert.equal(skeletonOf("Cloak"), skeletonOf("Body"));
        bend(gltf, plan, [0.5, 0.2, -0.4]);
        assert.ok(apart(gltf, plan).worst < 1e-5);
    });

    it("makes a clip its mixer's to play when it's first given any weight, its idle as it's made; its bones posed as with all of them made from the start", () => {
        const model = MODELS.choirKnight;
        const gltf = orderModel();
        const turn = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z)).toArray();
        const tracks = {
            [model.clips.idle]: [new THREE.QuaternionKeyframeTrack("spine_03.quaternion", [0, 1], [...turn(0, 0, 0.1), ...turn(0, 0.2, 0.3)])],
            [model.clips.walk]: [new THREE.QuaternionKeyframeTrack("spine_03.quaternion", [0, 1], [...turn(0.3, 0, 0), ...turn(-0.3, 0, 0)]), new THREE.VectorKeyframeTrack("pelvis.position", [0, 1], [0, 0.1, 0, 0, -0.1, 0.4])],
            [model.clips.run]: [new THREE.VectorKeyframeTrack("pelvis.position", [0, 1], [0, 0.3, 0, 0.2, 0, 0])],
            [model.clips.dead]: [new THREE.QuaternionKeyframeTrack("pelvis.quaternion", [0, 1], [...turn(0, 0, 0), ...turn(1.5, 0, 0)])],
        };

        gltf.animations = gltf.animations.map((clip) => new THREE.AnimationClip(clip.name, 1, tracks[clip.name] ?? []));
        assert.ok(gltf.animations.length > 8, `${gltf.animations.length} clips`);

        const plan = modelBody("choirKnight", gltf);
        // (The model itself posed by a mixer with every clip made from the start, as one drawn
        // from it had: by the clips the body says it posed)
        const mixer = new THREE.AnimationMixer(gltf.scene);
        const actions = new Map(gltf.animations.map((clip) => [clip.name, mixer.clipAction(clip)]));
        const bones = ["pelvis", "spine_03"];
        const same = (inputs) => {
            plan.pose(inputs);

            for (const action of actions.values()) {
                action.play();
                action.setEffectiveWeight(0);
            }

            for (const { clip, weight, time } of plan.posed) {
                actions.get(clip).setEffectiveWeight(weight);
                actions.get(clip).time = time;
            }

            mixer.update(0);

            for (const name of bones) {
                const [mine, theirs] = [plan.object.getObjectByName(name), gltf.scene.getObjectByName(name)];

                assert.ok(mine.position.distanceTo(theirs.position) < 1e-6 && mine.quaternion.angleTo(theirs.quaternion) < 1e-6, `${name} ${JSON.stringify(inputs)}`);
            }
        };

        assert.equal(plan.clipsBound, 1, "its idle");
        same({ dt: 0.1, speed: 0, t: 0.3 });
        assert.equal(plan.clipsBound, 1);

        // (Walking, then running: each made as it's first played; standing again, what only
        // they moved put back as it was read, though they're no longer played)
        same({ dt: 0.1, speed: model.pace, t: 0.7 });
        assert.ok(plan.posed.some(({ clip, weight }) => clip === model.clips.walk && weight > 0));

        const walking = plan.clipsBound;

        assert.ok(walking >= 2 && walking <= 3, `${walking} made walking`);
        same({ dt: 0.1, speed: model.runPace * 1.5, t: 1.1 });
        same({ dt: 0.1, speed: 0, t: 1.4 });
        assert.equal(plan.clipsBound, 3, "its idle, its walk and its run");
        assert.ok(plan.object.getObjectByName("pelvis").position.length() < 1e-6, "where it was read");
        same({ dt: 0.2, speed: 0, t: 2, dead: { t: 0.5 } });
        assert.equal(plan.clipsBound, 4);

        // (One of its clips held alone, as the model viewer watches each: made then)
        const rest = Object.values(model.rests)[0];

        plan.hold(rest, 0.5);
        assert.equal(plan.clipsBound, 5);
        assert.ok(plan.clipsBound < gltf.animations.length);
    });

    it("works out the sphere it's culled by once for everyone drawn from the model so, each with its own", () => {
        const gltf = orderModel();
        const worked = THREE.SkinnedMesh.prototype.computeBoundingSphere;
        let times = 0;

        THREE.SkinnedMesh.prototype.computeBoundingSphere = function () {
            times++;

            return worked.call(this);
        };

        try {
            const one = modelBody("choirKnight", gltf, { parts: ["Body", "Cloak", "Head"] });
            const first = times;
            const other = modelBody("choirKnight", gltf, { parts: ["Body", "Cloak", "Head"] });
            const [a, b] = [one, other].map((plan) => plan.levels[0][0].boundingSphere);

            assert.ok(first > 0 && times === first, `${first} then ${times - first}`);
            assert.ok(a.radius > 0.5 && a.equals(b) && a !== b);
            assert.ok([...one.levels.flat(), ...one.casters].every((mesh) => mesh.boundingSphere === a), "one for all its levels and its shadow");

            // (Wearing something else, or another kind with its own idle: its own sphere)
            modelBody("choirKnight", gltf, { parts: ["Body", "Head"] });
            assert.ok(times > first);
        } finally {
            THREE.SkinnedMesh.prototype.computeBoundingSphere = worked;
        }
    });
});

describe("a model's shadow (beasts/model.js)", () => {
    it("is cast from its least detailed level's body and cloak joined into one, each corner where its own skin put it, however the figure's posed", () => {
        // (All its parts worn, none chosen: none of them joined, its least detailed level's own)
        const plan = modelBody("choirKnight", orderModel());
        const [caster] = plan.casters;
        const least = plan.levels.at(-1);
        const shading = least.filter((mesh) => !mesh.name.startsWith("Head") && !mesh.name.startsWith("Knife"));

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
        const plan = modelBody("choirKnight", orderModel());
        const [caster] = plan.casters;
        const shownAt = () => plan.levels.map((meshes) => meshes.every(({ visible }) => visible));

        // (Each level every part it wears, a part of several materials (its body) among them: its
        // level read from the group round its meshes, where three.js puts its node's extras)
        assert.deepEqual(
            plan.levels.map((meshes) => meshes.map(({ name }) => name).sort()),
            // (Its eyes and knife left out of its least detailed level: MODELS `close`)
            ["", "lod1", "lod2"].map((suffix) => [`Body${suffix}`, `Body${suffix}_1`, `Cloak${suffix}`, `Head${suffix}`, ...(suffix === "lod2" ? [] : [`Head${suffix}_1`, `Knife${suffix}`])]),
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
        assert.equal(meshesOf(plan).filter(({ visible }) => visible).length, 6 + 1, "its first level's six meshes, and its shadow's");
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

        // (Nothing to make it with, as the model viewer gets ready: left whole)
        const unmade = modelBody("choirKnight", orderModel(), { parts: ["Body", "Cloak", "Head"] });
        const left = unmade.casters[0].geometry;

        await unmade.lowerShadow({});
        await unmade.lowerShadow(undefined);
        assert.equal(unmade.casters[0].geometry, left);
    });

    it("leaves what's too small to see out of its least detailed level (MODELS `close`, by part or material): an Order brother's knife, his eyes", () => {
        const plan = modelBody("bellBrother", orderModel(), { parts: ["Body", "Head", "Knife"] });
        const names = (level) => plan.levels[level].map(({ name }) => name).sort();

        assert.ok(MODELS.bellBrother.close.includes("Knife") && MODELS.bellBrother.close.includes("M_Eyes"));
        assert.deepEqual(names(0), ["Body", "Body_1", "Head", "Head_1", "Knife"]);
        assert.deepEqual(names(1), ["Bodylod1", "Bodylod1_1", "Headlod1", "Headlod1_1", "Knifelod1"]);
        assert.deepEqual(names(2), ["Bodylod2", "Bodylod2_1", "Headlod2"]);
        assert.ok(!plan.object.getObjectByName("Knifelod2") && !plan.object.getObjectByName("Headlod2_1"), "nor drawn");
    });

    it("of a model whose parts are kept apart, joins the parts it wears of one material at each level into one, drawn as they were, however the figure's posed", () => {
        const gltf = orderModel();
        const plan = modelBody("choirKnight", gltf, { parts: ["Body", "Cloak", "Head"] });
        const apart = modelBody("choirKnight", gltf);
        const names = (level) => plan.levels[level].map(({ name }) => name).sort();

        // (Its body's cloth and its cloak one mesh at each level, the rest as they were)
        assert.deepEqual(names(0), ["Body", "Head", "Head_1", "M_Cloth:Body+Cloak"]);
        assert.deepEqual(names(1), ["Bodylod1", "Headlod1", "Headlod1_1", "M_Cloth:Body+Cloak"]);
        assert.deepEqual(names(2), ["Bodylod2", "Headlod2", "M_Cloth:Body+Cloak"]);

        const [joined] = plan.levels[0].filter(({ name }) => name.startsWith("M_Cloth"));

        assert.ok(joined.isSkinnedMesh && !joined.castShadow && joined.receiveShadow && joined.material.name === "M_Cloth");
        assert.ok(["normal", "uv"].every((name) => joined.geometry.attributes[name]), "drawn as they were: which way they face, their picture's place");
        assert.equal(joined.geometry, modelBody("choirKnight", gltf, { parts: ["Body", "Cloak", "Head"] }).levels[0].find(({ name }) => name === joined.name).geometry, "once for everyone dressed alike");

        // (Both posed alike: the joined mesh's corners where each part's own skin puts its)
        for (const one of [plan, apart]) {
            one.object.getObjectByName("spine_03").rotation.set(-0.3, 0.8, 0.2);
            one.object.position.set(-1, 0.2, 4);
            one.object.rotation.y = -0.6;
            one.object.updateMatrixWorld(true);
        }

        const parts = ["Body_1", "Cloak"].map((name) => apart.levels[0].find((mesh) => mesh.name === name));
        let at = 0;

        for (const mesh of parts) {
            for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
                const own = cornerOf(mesh, i);
                const drawn = cornerOf(joined, at + i);

                assert.ok(own.distanceTo(drawn) < 1e-5, `${mesh.name} ${i}`);
                assert.ok(Math.abs(new THREE.Vector3().fromBufferAttribute(joined.geometry.attributes.normal, at + i).length() - 1) < 1e-5);
            }

            at += mesh.geometry.attributes.position.count;
        }

        // (Shown a level at a time, as its own were)
        plan.showLevel(2);
        assert.ok(plan.levels[2].every(({ visible }) => visible) && plan.levels[0].every(({ visible }) => !visible));
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
