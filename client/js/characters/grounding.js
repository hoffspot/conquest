// Where a body touches the ground: the lowest point of its skin, wherever it's posed (falling,
// lying, kneeling or getting up), found from some of its vertices spread over it, each placed by
// its bones as the skin is; the body's (its trunk, head and legs) apart from each arm's. The falls
// (actions.js) keep a body's lowest point as high off the ground as the clip's body's was
// (scripts/bake-clips.js), so a body of any build lies on the ground, not in it or over it, and
// lift an arm that's still in it (fitted to another body, an arm the clip lays on the ground can
// go through it).

import * as THREE from "three";

/** How many of the body's vertices are looked at (and how many times as closely the feet's: their soles are small). */
export const GROUND_POINTS = 400;
const FEET_CLOSER = 4;

const _skinning = [];
const _point = new THREE.Vector3();
const _placed = new THREE.Vector3();
const _sum = new THREE.Vector3();

// Which part of the body a vertex is on, by its heaviest bone: 0 the body, 1 the left arm, 2 the
// right (and which are the feet)
const ARM = /^(Left|Right)(Arm|ForeArm|Hand)/;
const FOOT = /^(Left|Right)(Foot|ToeBase)$/;

/**
 * Some of a body's vertices (HumanData: the body's own, every so many, about GROUND_POINTS),
 * with the bones that move each and how much (weights out of 1), and which part each is on (0
 * the body, 1 the left arm, 2 the right): { vertices, bones, weights, parts }.
 */
export function groundPoints(human) {
    const all = [];
    const heaviest = (v) => [0, 1, 2, 3].reduce((best, j) => (human.skinWeights[v * 4 + j] > human.skinWeights[v * 4 + best] ? j : best), 0);

    for (let v = 0; v < human.vertexCount; v++) {
        if (human.partOf[v] === 0) {
            all.push(v);
        }
    }

    const every = Math.max(1, Math.floor(all.length / GROUND_POINTS));
    const feet = Math.max(1, Math.floor(every / FEET_CLOSER));
    const vertices = Int32Array.from(all.filter((v, k) => k % (FOOT.test(human.bones[human.skinIndices[v * 4 + heaviest(v)]].name) ? feet : every) === 0));
    const bones = new Uint8Array(vertices.length * 4);
    const weights = new Float32Array(vertices.length * 4);
    const parts = new Uint8Array(vertices.length);

    vertices.forEach((v, k) => {
        let heaviest = 0;

        for (let j = 0; j < 4; j++) {
            bones[k * 4 + j] = human.skinIndices[v * 4 + j];
            weights[k * 4 + j] = human.skinWeights[v * 4 + j] / 255;
            heaviest = weights[k * 4 + j] > weights[k * 4 + heaviest] ? j : heaviest;
        }

        const arm = human.bones[bones[k * 4 + heaviest]].name.match(ARM);

        parts[k] = arm ? (arm[1] === "Left" ? 1 : 2) : 0;
    });

    return { vertices, bones, weights, parts };
}

/**
 * How high the lowest of `points` (groundPoints) on the body (not the arms) is in the world, on a
 * body of `positions` (its shape's vertices) posed by `rig` (its bones' world matrices worked
 * out); and each arm's lowest point, into `arms` if given ([left, right] Vector3s).
 */
export function lowestPoint(rig, positions, { vertices, bones, weights, parts }, arms = null) {
    rig.bones.forEach((bone, i) => {
        _skinning[i] ??= new THREE.Matrix4();
        _skinning[i].multiplyMatrices(bone.matrixWorld, rig.skeleton.boneInverses[i]);
    });

    let lowest = Infinity;

    arms?.forEach((arm) => arm.set(0, Infinity, 0));

    for (let k = 0; k < vertices.length; k++) {
        const part = parts[k];

        if (part && !arms) {
            continue;
        }

        _point.fromArray(positions, vertices[k] * 3);
        _sum.set(0, 0, 0);

        for (let j = 0; j < 4; j++) {
            const weight = weights[k * 4 + j];

            if (weight > 0) {
                _sum.addScaledVector(_placed.copy(_point).applyMatrix4(_skinning[bones[k * 4 + j]]), weight);
            }
        }

        if (!part) {
            lowest = Math.min(lowest, _sum.y);
        } else if (_sum.y < arms[part - 1].y) {
            arms[part - 1].copy(_sum);
        }
    }

    return lowest;
}
