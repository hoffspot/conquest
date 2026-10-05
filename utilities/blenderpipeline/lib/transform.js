// Changing a whole glTF document's size, heading and place, baked into its data rather than put
// on a node over it, so its units are metres and its origin where it stands. Skinned meshes stay
// right: a uniform scale about the origin scales every translation (nodes', their animations',
// the inverse bind matrices') and every vertex alike; a turn or a move is put on the scene's top
// nodes (and their animations), and so on every bone and mesh under them.

import { Quaternion, Vector3 } from "three";

/** Scales everything in the document by `factor` about the origin. */
export function scaleDocument(document, factor) {
    if (factor === 1) {
        return;
    }

    const root = document.getRoot();
    const done = new Set();
    const scale = (accessor, every = () => true) => {
        if (!accessor || done.has(accessor)) {
            return;
        }

        done.add(accessor);

        const values = Float32Array.from(accessor.getArray());

        for (let i = 0; i < values.length; i++) {
            if (every(i)) {
                values[i] *= factor;
            }
        }

        accessor.setArray(values);
    };

    for (const node of root.listNodes()) {
        node.setTranslation(node.getTranslation().map((v) => v * factor));
    }

    for (const mesh of root.listMeshes()) {
        for (const primitive of mesh.listPrimitives()) {
            scale(primitive.getAttribute("POSITION"));

            for (const target of primitive.listTargets()) {
                scale(target.getAttribute("POSITION"));
            }
        }
    }

    for (const animation of root.listAnimations()) {
        for (const channel of animation.listChannels()) {
            if (channel.getTargetPath() === "translation") {
                scale(channel.getSampler()?.getOutput());
            }
        }
    }

    for (const skin of root.listSkins()) {
        // (Each matrix's translation: elements 12, 13 and 14 of the 16, column by column)
        scale(skin.getInverseBindMatrices(), (i) => i % 16 >= 12 && i % 16 <= 14);
    }
}

/**
 * Turns everything in the document `turn` radians about the vertical (counterclockwise from
 * above), then moves it by `offset` ([x, y, z]): the scene's top nodes, and their animations.
 */
export function moveDocument(document, { turn = 0, offset = [0, 0, 0] } = {}) {
    const root = document.getRoot();
    const spin = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), turn);
    const shift = new Vector3().fromArray(offset);
    // (Not skinned meshes: their own transforms don't move them, their bones do)
    const tops = new Set(root.listScenes().flatMap((scene) => scene.listChildren()).filter((node) => !node.getSkin()));
    const done = new Set();
    const vector = new Vector3();
    const quaternion = new Quaternion();

    for (const node of tops) {
        node.setTranslation(vector.fromArray(node.getTranslation()).applyQuaternion(spin).add(shift).toArray());
        node.setRotation(quaternion.fromArray(node.getRotation()).premultiply(spin).normalize().toArray());
    }

    for (const animation of root.listAnimations()) {
        for (const channel of animation.listChannels()) {
            const path = channel.getTargetPath();
            const sampler = channel.getSampler();
            const output = sampler?.getOutput();

            if (!tops.has(channel.getTargetNode()) || !output || done.has(output) || (path !== "translation" && path !== "rotation")) {
                continue;
            }

            done.add(output);

            const values = Float32Array.from(output.getArray());
            const cubic = sampler.getInterpolation() === "CUBICSPLINE";

            if (path === "translation") {
                for (let i = 0; i < values.length / 3; i++) {
                    vector.fromArray(values, i * 3).applyQuaternion(spin);

                    // (A cubic spline's tangents are turned, not moved)
                    if (!cubic || i % 3 === 1) {
                        vector.add(shift);
                    }

                    vector.toArray(values, i * 3);
                }
            } else {
                for (let i = 0; i < values.length / 4; i++) {
                    quaternion.fromArray(values, i * 4).premultiply(spin);

                    if (!cubic || i % 3 === 1) {
                        quaternion.normalize();
                    }

                    quaternion.toArray(values, i * 4);
                }
            }

            output.setArray(values);
        }
    }
}
