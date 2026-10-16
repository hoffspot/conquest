// Beasts in a crowd (client/js/beasts/herd.js): which of the wild's creatures can be; a kind's
// figure merged from one of it, bound to its skeleton so that posed as its moves are recorded,
// every corner is where its own body's would be; its moves recorded (its walk and run a stride
// each, every move played over and over going round without a jump); and a stand-in for one drawn
// in full, told what it's told
import assert from "node:assert/strict";
import { describe, it } from "node:test";

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
const { BeastAvatar } = await import("../client/js/beasts/beast.js");
const { HERD, herds, makingHerdTemplate } = await import("../client/js/beasts/herd.js");
const { LOOKS } = await import("../client/js/beasts/looks.js");
const { allAtOnce } = await import("../client/js/core/steps.js");
const { Crowd, CROWD, CrowdAvatar, figureOf, recordPose } = await import("../client/js/world/crowd.js");

// A beast as its kind's figure is made from: built at its kind's size, standing where it's put
function beastOf(id) {
    const beast = new BeastAvatar(id, { seed: 0 });

    beast.scale = 1;
    beast.plan.object.scale.setScalar(1);
    beast.place(0, 0, 0);
    beast.update(0, 0, 0, 0);

    return beast;
}

// What figureOf's told a beast is
function asCharacter(beast) {
    let skeleton = null;

    beast.plan.object.traverse((node) => {
        skeleton ??= node.isSkinnedMesh ? node.skeleton : null;
    });

    return { object: beast.plan.object, rig: { skeleton, bone: (name) => beast.character.rig.bone(name) }, materials: { body: beast.plan.materials.body }, garments: [], height: beast.plan.height };
}

// Where every corner of everything drawn of it is now, in its body's space (xyz in turn)
function cornersOf(object) {
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
            if (v < geometry.attributes.position.count) {
                if (mesh.isSkinnedMesh) {
                    mesh.getVertexPosition(v, at);
                } else {
                    at.fromBufferAttribute(geometry.attributes.position, v);
                }

                at.applyMatrix4(mesh.matrixWorld).applyMatrix4(toObject);
                points.push(at.x, at.y, at.z);
            }
        }
    });

    return points;
}

// The figure's corners posed by a row of recorded moves (xyz in turn)
function posedBy(geometry, row) {
    const { position, crowdBones, crowdWeights } = geometry.attributes;
    const skin = (bone) => {
        const e = row.subarray(bone * 12, bone * 12 + 12);

        return new THREE.Matrix4().set(e[0], e[1], e[2], e[3], e[4], e[5], e[6], e[7], e[8], e[9], e[10], e[11], 0, 0, 0, 1);
    };
    const points = [];
    const at = new THREE.Vector3();
    const sum = new THREE.Vector3();

    for (let v = 0; v < position.count; v++) {
        sum.set(0, 0, 0);

        for (let k = 0; k < 4; k++) {
            const weight = crowdWeights.getComponent(v, k);

            if (weight > 0) {
                sum.addScaledVector(at.fromBufferAttribute(position, v).applyMatrix4(skin(crowdBones.getComponent(v, k))), weight);
            }
        }

        points.push(sum.x, sum.y, sum.z);
    }

    return points;
}

// How far each of `points` is from the nearest of `among` (both xyz in turn), at most
function furthestFrom(points, among) {
    const cell = 0.02;
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

// One row of a template's recorded moves (a moment)
const rowOf = (template, at) => template.moves.image.data.subarray(at * template.moves.image.width * 4, (at + 1) * template.moves.image.width * 4);

// How far apart two rows are (the most any number in them differs)
const apart = (a, b) => a.reduce((most, value, k) => Math.max(most, Math.abs(value - b[k])), 0);

describe("beasts in a crowd (herd.js)", () => {
    it("draws in a crowd those that move by their bones alone, and none seen through, winged, caped, swarming, squashed whole or drawn from a model", () => {
        for (const id of ["wolf", "boar", "bear", "rat", "crocodile", "caveSpider", "scorpion", "snake", "bogFrog", "skeleton", "treant"]) {
            assert.ok(herds(id), `${id} is drawn in a crowd`);
        }

        for (const id of ["slime", "magmaSlime", "bats", "wisp", "ghost", "wraith", "blackShuck", "shadowStalker", "wyvern", "dragon", "wightLord", "bandit", "troll", "werewolf", "nothing"]) {
            assert.ok(!herds(id), `${id} isn't`);
        }
    });

    it("merges a wolf into one figure bound to its skeleton: posed as its bones are, mid-stride and mid-bite, every corner is where its own body's is", () => {
        const beast = beastOf("wolf");
        const character = asCharacter(beast);
        const { geometry, height } = figureOf(character, HERD.picture);
        const row = new Float32Array(character.rig.skeleton.bones.length * 12);

        assert.ok(geometry.attributes.position.count > 500, `${geometry.attributes.position.count} corners`);
        assert.equal(height, beast.plan.height);

        // (Coloured by its corners: neither white nor black all over)
        const colours = geometry.attributes.color.array;
        const mean = colours.reduce((sum, value) => sum + value, 0) / colours.length;

        assert.ok(mean > 0.05 && mean < 0.95, `its colours average ${mean.toFixed(2)}`);

        for (const [what, go] of [
            ["walking", () => beast.update(0.6, 0, 0.9, 0)],
            ["biting", () => beast.actions.startAttack("bite", { hitAt: 0.4, duration: 0.8 }) ?? beast.update(0.3, 0, 0.9, 0)],
        ]) {
            go();
            recordPose(character, row, 0);

            const worst = furthestFrom(posedBy(geometry, row), cornersOf(beast.plan.object));

            assert.ok(worst < 0.005, `${what}: a corner ${(worst * 100).toFixed(2)} cm from its body's`);
        }

        beast.dispose();
    });

    it("records each kind's moves: standing, walking and running a stride each, a blow, a flinch, a fall and lying; every one played over and over going round without a jump", () => {
        const ids = Object.keys(LOOKS).filter(herds);

        assert.ok(ids.length >= 15, `${ids.length} kinds`);

        for (const id of ids) {
            const template = allAtOnce(makingHerdTemplate({}, `herd:${id}:0`, { id, seed: 0 }));
            const { table } = template;

            for (const name of ["guard", "walk", "run", "attack", "hit", "die"]) {
                assert.ok(table[name]?.frames > 2, `${id} ${name}: ${table[name]?.frames} frames`);
            }

            assert.ok(table.walk.stride > 0.1 && table.run.stride > 0.1, `${id}: strides ${table.walk.stride.toFixed(2)}, ${table.run.stride.toFixed(2)} m`);
            assert.ok(table.walk.length < 4 && table.run.length < 4, `${id}: a stride's ${table.walk.length.toFixed(2)}, ${table.run.length.toFixed(2)} s`);
            assert.equal(table.attack.hitAt, HERD.hitAt);
            assert.ok(table.die.lands > 0.5 && table.die.lands < table.die.length, `${id} falls in ${table.die.lands.toFixed(2)} s`);
            assert.equal(template.height, new BeastAvatar(id, { seed: 0 }).plan.height);

            for (const name of ["guard", "walk", "run"]) {
                const move = table[name];
                let step = 0;

                for (let k = 1; k < move.frames; k++) {
                    step = Math.max(step, apart(rowOf(template, move.start + k - 1), rowOf(template, move.start + k)));
                }

                const round = apart(rowOf(template, move.start + move.frames - 1), rowOf(template, move.start));

                assert.ok(round <= step * 1.5 + 1e-4, `${id} ${name}: going round ${round.toFixed(4)}, a step ${step.toFixed(4)}`);
            }

            template.geometry.dispose();
            template.moves.dispose();
        }
    });

    it("stands in for a beast drawn in full: told its bites, flinches and falls; it has no dodge, so none's told; and as it was after", () => {
        const crowd = new Crowd(new THREE.Scene(), {});
        const beast = beastOf("wolf");
        const standIn = new CrowdAvatar(crowd, "herd:wolf:0", { size: 1.3, standIn: true });
        const own = { ...beast.actions };
        const unecho = standIn.echo(beast);

        assert.equal(beast.actions.dodge, undefined);
        beast.actions.startAttack("bite", { duration: 0.8 });
        assert.ok(beast.doing.attack && standIn.doing?.name === "attack");
        beast.actions.react();
        assert.ok(beast.doing.react && standIn.doing?.name === "hit");
        beast.actions.die({ from: 0 });
        assert.ok(beast.doing.dead && standIn.fallen !== null);

        unecho();

        for (const name of ["startAttack", "react", "knockdown", "die", "revive"]) {
            assert.equal(beast.actions[name], own[name], `its own ${name} again`);
        }

        assert.equal(beast.actions.dodge, undefined);
        beast.dispose();
    });

    it("strides as far as it's big: one twice its kind's size goes through a stride in twice the ground", () => {
        const crowd = new Crowd(new THREE.Scene(), {});
        const table = { guard: { start: 0, frames: 2, length: 1, loop: true }, walk: { start: 2, frames: 10, length: 1, loop: true, stride: 1.3 }, run: { start: 12, frames: 10, length: 1, loop: true, stride: 2.3 } };

        crowd.kinds.set("herd:boar:0", { template: { table, height: 1 } });

        for (const size of [1, 2]) {
            const one = new CrowdAvatar(crowd, "herd:boar:0", { size });

            one.place(0, 0, 0);
            one.stride = 0;

            // (Walking at 1.3 m/s a while: how far through its strides it's gone)
            let gone = 0;
            let last = 0;

            for (let k = 0; k < 200; k++) {
                one.update(1 / 50, 0, (k + 1) * (1.3 / 50), 0);
                gone += (one.stride - last + 1) % 1;
                last = one.stride;
            }

            const walked = one.object.position.z;

            assert.ok(Math.abs(gone - walked / (1.3 * size)) < 0.05, `size ${size}: ${gone.toFixed(2)} strides over ${walked.toFixed(2)} m`);
        }

        assert.equal(CROWD.pace > CROWD.walk, true);
    });
});
