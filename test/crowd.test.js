// Soldiers in their crowds (client/js/world/crowd.js): a kind's figure merged from one of them,
// bound to its skeleton so that posed as the moves recorded have it, every corner of it is where
// the character's own would be; its moves recorded; and one drawn in a crowd posed as it's doing:
// on guard, walking or running with its stride, striking, flinching, falling and lying
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readHumanFiles } from "../scripts/lib/human-data.js";

// (Pictures put on a canvas: enough of one for that in Node)
globalThis.ImageData ??= class {
    constructor(data, width, height) {
        Object.assign(this, { data, width, height });
    }
};

globalThis.document ??= {
    createElement: () => {
        const canvas = { width: 0, height: 0, style: {}, _data: null };
        const context = {
            putImageData: (image) => (canvas._data = image.data),
            getImageData: (x, y, w, h) => ({ data: canvas._data ?? new Uint8ClampedArray(w * h * 4), width: w, height: h }),
            createImageData: (w, h) => new globalThis.ImageData(new Uint8ClampedArray(w * h * 4), w, h),
            createLinearGradient: () => ({ addColorStop() {} }),
            createRadialGradient: () => ({ addColorStop() {} }),
            measureText: () => ({ width: 10 }),
        };

        canvas.getContext = () => new Proxy(context, { get: (target, key) => (key in target ? target[key] : () => {}) });

        return canvas;
    },
};

const THREE = await import("three");
const { HumanData } = await import("../client/js/characters/body.js");
const { Character } = await import("../client/js/characters/character.js");
const { SkinAtlas } = await import("../client/js/characters/skin.js");
const { soldierLook } = await import("../client/js/characters/soldiers.js");
const { allAtOnce } = await import("../client/js/core/steps.js");
const { WEAPONS } = await import("../client/js/core/weapons.js");
const { Avatar } = await import("../client/js/world/avatar.js");
const { CROWD, CROWD_CASTS, CrowdAvatar, figureOf, recordingMoves } = await import("../client/js/world/crowd.js");

const humanFiles = readHumanFiles();
const human = new HumanData(humanFiles.manifest, humanFiles.data);
const kit = { human, atlas: new SkinAtlas(human, {}, 128) };

// A human soldier with a sword and shield (and helm), drawn, standing on guard
function soldier() {
    const look = soldierLook({ people: "human", weapon: "sword", seed: 3 });
    const character = new Character(kit, { shape: look.shape, look: look.look, equipment: look.equipment, hairDetail: 0.2, merge: true });

    character.sheathe(false);

    const avatar = new Avatar(character, { walk: look.walk, guard: "sword" });

    avatar.place(0, 0, 0);
    avatar.actions.setGuard(true);

    for (let k = 0; k < 10; k++) {
        avatar.update(1 / 20, 0, 0, 0, true);
    }

    return { character, look };
}

// Where every corner of everything drawn of a character is now, in its body's space: { points (xyz
// in turn), count }
function cornersOf(character) {
    const object = character.object;
    const toObject = new THREE.Matrix4().copy(object.matrixWorld).invert();
    const points = [];
    const at = new THREE.Vector3();

    object.updateMatrixWorld(true);
    object.traverse((mesh) => {
        let shown = mesh.isMesh;

        for (let up = mesh; shown && up && up !== object; up = up.parent) {
            shown = up.visible;
        }

        if (!shown) {
            return;
        }

        const geometry = mesh.geometry;
        const used = new Set(geometry.index ? geometry.index.array : geometry.attributes.position.array.keys());

        for (const v of used) {
            if (v >= geometry.attributes.position.count) {
                continue;
            }

            if (mesh.isSkinnedMesh) {
                mesh.getVertexPosition(v, at);
            } else {
                at.fromBufferAttribute(geometry.attributes.position, v);
            }

            at.applyMatrix4(mesh.matrixWorld).applyMatrix4(toObject);
            points.push(at.x, at.y, at.z);
        }
    });

    return points;
}

// The figure's corners posed as the character's skeleton is now (each bone's skinning, in the
// body's space, as the moves are recorded): xyz in turn
function posedFigure(character, geometry) {
    const object = character.object;
    const skeleton = character.rig.skeleton;
    const toObject = new THREE.Matrix4().copy(object.matrixWorld).invert();

    object.updateMatrixWorld(true);

    const skins = skeleton.bones.map((bone, i) => new THREE.Matrix4().multiplyMatrices(toObject, bone.matrixWorld).multiply(skeleton.boneInverses[i]));
    const { position, crowdBones, crowdWeights } = geometry.attributes;
    const points = [];
    const at = new THREE.Vector3();
    const sum = new THREE.Vector3();

    for (let v = 0; v < position.count; v++) {
        sum.set(0, 0, 0);

        for (let k = 0; k < 4; k++) {
            const weight = crowdWeights.getComponent(v, k);

            if (weight > 0) {
                sum.addScaledVector(at.fromBufferAttribute(position, v).applyMatrix4(skins[crowdBones.getComponent(v, k)]), weight);
            }
        }

        points.push(sum.x, sum.y, sum.z);
    }

    return points;
}

// How far each of `points` is from the nearest of `among` (both xyz in turn), at most
function furthestFrom(points, among) {
    const cell = 0.01;
    const grid = new Map();
    const key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;

    for (let k = 0; k < among.length; k += 3) {
        const at = key(among[k], among[k + 1], among[k + 2]);

        grid.set(at, [...(grid.get(at) ?? []), k]);
    }

    let worst = 0;

    for (let k = 0; k < points.length; k += 3) {
        const [x, y, z] = [points[k], points[k + 1], points[k + 2]];
        let best = Infinity;

        for (let dz = -1; dz <= 1; dz++) {
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    for (const j of grid.get(key(x + dx * cell, y + dy * cell, z + dz * cell)) ?? []) {
                        best = Math.min(best, Math.hypot(among[j] - x, among[j + 1] - y, among[j + 2] - z));
                    }
                }
            }
        }

        worst = Math.max(worst, best);
    }

    return worst;
}

describe("a kind's figure (crowd.js figureOf)", () => {
    it("merges everything drawn of a soldier, its sword, shield and helm too, into one mesh bound to its skeleton", () => {
        const { character } = soldier();
        const { geometry, picture, height } = figureOf(character, 64);
        const { position, normal, uv, color, crowdBones, crowdWeights } = geometry.attributes;
        const bones = character.rig.skeleton.bones.length;

        assert.ok(position.count > 1000, `${position.count} corners`);

        for (const attribute of [normal, uv, color, crowdBones, crowdWeights]) {
            assert.equal(attribute.count, position.count);
        }

        for (let v = 0; v < position.count; v++) {
            const weights = [0, 1, 2, 3].map((k) => crowdWeights.getComponent(v, k));

            assert.ok(Math.abs(weights.reduce((a, b) => a + b, 0) - 1) < 0.02, `corner ${v}'s weights add up to 1`);
            assert.ok([0, 1, 2, 3].every((k) => crowdBones.getComponent(v, k) < bones), `corner ${v}'s bones are the skeleton's`);
            assert.ok(uv.getX(v) >= 0 && uv.getX(v) <= 1 && uv.getY(v) >= 0 && uv.getY(v) <= 1);
        }

        // (Its picture: its skin's and its clothes' side by side, its hair's below)
        assert.equal(picture.image.width, 128);
        assert.ok(picture.image.height > 64);
        assert.ok(height > 1.5 && height < 2.2, `${height} m tall`);
    });

    it("is where the soldier is, corner for corner, posed as it was merged and posed anew, its weapon in its hand", () => {
        const { character, look } = soldier();
        const { geometry } = figureOf(character, 64);

        assert.ok(furthestFrom(posedFigure(character, geometry), cornersOf(character)) < 0.002, "as merged");

        // (Mid-swing: every corner, the sword's and shield's too, still the character's)
        const avatar = new Avatar(character, { walk: look.walk, guard: "sword" });

        avatar.place(0, 0, 0);
        avatar.actions.setGuard(true);
        avatar.actions.startAttack("sword", { hitAt: 0.38, duration: 0.76 });

        for (let k = 0; k < 7; k++) {
            avatar.update(1 / 20, 0, 0, 0, true);
        }

        assert.ok(furthestFrom(posedFigure(character, geometry), cornersOf(character)) < 0.002, "mid-swing");
    });
});

describe("a kind's moves (crowd.js recordingMoves)", () => {
    it("records its guard, walk, run, a blow, a cast (for one that casts), a flinch and its fall, each so many times a second", () => {
        const { character, look } = soldier();
        const recorded = allAtOnce(recordingMoves(character, { walk: look.walk, guard: "sword", attack: WEAPONS.sword.attacks[0], reaction: "slash", cast: CROWD_CASTS.grimoire }));
        const { moves, width, rows, data } = recorded;

        assert.equal(width, character.rig.skeleton.bones.length * 3);
        assert.equal(data.length, width * 4 * rows);
        assert.deepEqual(Object.keys(moves).sort(), ["attack", "cast", "die", "guard", "hit", "run", "walk"]);

        let next = 0;

        for (const name of ["guard", "walk", "run", "attack", "cast", "hit", "die"]) {
            const move = moves[name];

            assert.equal(move.start, next, `${name} follows the last`);
            assert.ok(move.frames > 3, `${name}: ${move.frames} frames`);
            assert.ok(Math.abs(move.length - move.frames / CROWD.fps) < 1e-9);
            next += move.frames;
        }

        assert.equal(next, rows);
        assert.ok(moves.guard.loop && moves.walk.loop && moves.run.loop && !moves.attack.loop && !moves.die.loop);

        // (A stride's as long as a walk or run goes in it; the blow lasts as the sword's does)
        assert.ok(Math.abs(moves.walk.stride - CROWD.walk * moves.walk.length) < 1e-9);
        assert.ok(moves.run.stride > moves.walk.stride);
        assert.ok(moves.walk.length > 0.7 && moves.walk.length < 1.6, `a stride walking: ${moves.walk.length} s`);
        assert.ok(moves.attack.length >= WEAPONS.sword.attacks[0].duration / 1000);
        assert.ok(!moves.cast.loop && moves.cast.length >= 1 && moves.cast.hitAt > 0 && moves.cast.hitAt < moves.cast.length);
        assert.deepEqual(CROWD_CASTS, { grimoire: "castStun", wand: "castStun", staff: "castHeal" });

        // (Fallen, its hips are far lower than on guard)
        const hips = character.rig.skeleton.bones.findIndex(({ name }) => name === "Hips");
        const rest = new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().copy(character.rig.skeleton.boneInverses[hips]).invert());
        const heightAt = (row) => {
            const k = row * width * 4 + hips * 12 + 4;

            return data[k] * rest.x + data[k + 1] * rest.y + data[k + 2] * rest.z + data[k + 3];
        };

        assert.ok(heightAt(moves.die.start + moves.die.frames - 1) < heightAt(moves.guard.start) - 0.4, "lying");
    });
});

describe("one drawn in a crowd (crowd.js CrowdAvatar)", () => {
    // A crowd with one kind, its moves as recorded at 20 a second
    const table = {
        guard: { start: 0, frames: 40, length: 2, loop: true },
        walk: { start: 40, frames: 22, length: 1.1, loop: true, stride: 1.43 },
        run: { start: 62, frames: 14, length: 0.7, loop: true, stride: 1.61 },
        attack: { start: 76, frames: 16, length: 0.8, loop: false, hitAt: 0.38 },
        hit: { start: 92, frames: 10, length: 0.5, loop: false },
        die: { start: 102, frames: 30, length: 1.5, loop: false, lands: 0.9 },
    };
    const casting = { ...table, cast: { start: 132, frames: 20, length: 1, loop: false, hitAt: 0.6 } };
    const crowdOf = () => ({ kinds: new Map([["human:m:sword", { template: { table, height: 1.8 } }], ["human:m:grimoire", { template: { table: casting, height: 1.8 } }]]), members: new Set(), join(one) { this.members.add(one); }, leave(one) { this.members.delete(one); } });
    const moveOf = (frame) => Object.entries(casting).find(([, { start, frames }]) => frame[0] >= start && frame[0] < start + frames)[0];

    it("stands on guard, its guard played over and over", () => {
        const crowd = crowdOf();
        const one = new CrowdAvatar(crowd, "human:m:sword");

        assert.ok(crowd.members.has(one));
        one.place(10, 20, 0);

        for (let k = 0; k < 50; k++) {
            one.update(0.05, 10, 20, 0);

            const frame = one.frameIn(table);

            assert.equal(moveOf(frame), "guard");
            assert.ok(frame[1] < 40 && frame[2] >= 0 && frame[2] < 1);
        }

        assert.equal(one.character.height, 1.8);
        one.character.dispose();
        assert.ok(!crowd.members.has(one));
    });

    it("walks, or runs, its stride as far through as it's gone", () => {
        const one = new CrowdAvatar(crowdOf(), "human:m:sword");

        one.place(0, 0, 0);

        for (const [speed, gait] of [
            [1.3, "walk"],
            [2.3, "run"],
        ]) {
            let z = 0;
            let stride = null;

            for (let k = 0; k < 60; k++) {
                z += speed * 0.05;
                one.update(0.05, 0, z, 0);
            }

            assert.equal(moveOf(one.frameIn(table)), gait);

            // (Another stride's worth on, it's where it was in it)
            stride = one.stride;

            for (let gone = 0; gone < table[gait].stride; gone += speed * 0.05) {
                z += speed * 0.05;
                one.update(0.05, 0, z, 0);
            }

            assert.ok(Math.min(Math.abs(one.stride - stride), 1 - Math.abs(one.stride - stride)) < 0.1, `${gait}: ${stride} then ${one.stride}`);

            // (Facing the way it's going)
            assert.ok(Math.abs(one.facing) < 0.01);
        }
    });

    it("casts a spell as its kind casts, as long as the cast lasts; one whose kind doesn't, with its weapon", () => {
        const crowd = crowdOf();

        for (const [key, played] of [
            ["human:m:grimoire", "cast"],
            ["human:m:sword", "attack"],
        ]) {
            const one = new CrowdAvatar(crowd, key);
            const moves = crowd.kinds.get(key).template.table;

            one.place(0, 0, 0);
            one.actions.startAttack("castStun", { hitAt: 0.6, duration: 1.2 });

            for (let t = 0; t < 1.15; t += 0.05) {
                one.update(0.05, 0, 0, 0);
                assert.equal(moveOf(one.frameIn(moves)), played, `${key} at ${t}`);
            }

            // (And its weapon's blow as any other)
            one.update(0.2, 0, 0, 0);
            one.actions.startAttack("grimoire", { hitAt: 0.4, duration: 0.8 });
            one.update(0.05, 0, 0, 0);
            assert.equal(moveOf(one.frameIn(moves)), "attack");
        }
    });

    it("strikes as long as the blow lasts, flinches, falls and lies still, and gets up again", () => {
        const one = new CrowdAvatar(crowdOf(), "human:m:sword");

        one.place(0, 0, 0);
        one.actions.startAttack("sword", { hitAt: 0.76, duration: 1.6 });
        assert.ok(one.actions.quick);

        for (let t = 0; t < 1.55; t += 0.05) {
            one.update(0.05, 0, 0, 0);
            assert.equal(moveOf(one.frameIn(table)), "attack", `at ${t}`);
        }

        // (Played at half the speed it was recorded, for a blow twice as long)
        one.update(0.1, 0, 0, 0);
        assert.equal(moveOf(one.frameIn(table)), "guard");

        one.actions.react("slash", { from: 0 });
        one.update(0.1, 0, 0, 0);
        assert.equal(moveOf(one.frameIn(table)), "hit");

        assert.equal(one.actions.die({ from: 0 }), table.die.lands);

        for (let k = 0; k < 60; k++) {
            one.update(0.05, 0, 0, 0);
        }

        const lying = one.frameIn(table);

        assert.deepEqual(lying.slice(0, 2), [table.die.start + table.die.frames - 1, table.die.start + table.die.frames - 1]);

        one.actions.revive();
        one.update(0.05, 0, 0, 0);
        assert.equal(moveOf(one.frameIn(table)), "guard");
    });

    it("is placed where it is, turned the way it faces, and what lands on it stays on it", () => {
        const one = new CrowdAvatar(crowdOf(), "human:m:sword");

        one.place(3, 4, Math.PI / 2);
        one.object.position.y = 1.5;

        const placed = one.placed();
        const at = new THREE.Vector3(0, 0, 1).applyMatrix4(placed);

        assert.ok(at.distanceTo(new THREE.Vector3(4, 1.5, 4)) < 1e-6, "a metre ahead of it is to the east");

        const chest = one.character.rig.bone("Spine2");

        assert.equal(chest.parent, one.object);
        assert.ok(Math.abs(chest.position.y - 1.8 * 0.72) < 1e-9);
        assert.equal(one.character.rig.bone("Spine2"), chest);
        assert.ok(one.point(0.5).distanceTo(new THREE.Vector3(3, 1.5 + 0.9, 4)) < 1e-9);
    });
});
