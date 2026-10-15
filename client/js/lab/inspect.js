// What the model viewer (model-viewer.html) says of what it shows, and how it lets it be looked
// at: how much there is to draw of it (detailsOf), its wireframe (wireframe), and the last few
// seconds of how it moved, kept to step back and forth through (Rewind).

/**
 * How much there is to draw of something as it's shown (`object`): { meshes, triangles,
 * vertices, materials, textures ([{ width, height, compressed }], each once, the largest first),
 * bones }. What's hidden (a model's other levels of detail) or drawn unseen (only into the
 * shadows) is left out; its bones are counted all the same.
 */
export function detailsOf(object) {
    const materials = new Set();
    const textures = new Set();
    const bones = new Set();
    let meshes = 0;
    let triangles = 0;
    let vertices = 0;

    object.traverse((node) => {
        if (node.isBone) {
            bones.add(node);
        }

        for (const bone of node.skeleton?.bones ?? []) {
            bones.add(bone);
        }
    });

    object.traverseVisible((node) => {
        const drawn = [node.material].flat().filter((material) => material && material.visible !== false && material.colorWrite !== false);

        if (!node.isMesh || !node.geometry || drawn.length === 0) {
            return;
        }

        const { index, attributes, drawRange } = node.geometry;
        const count = Math.min(drawRange.count, index ? index.count : (attributes.position?.count ?? 0));
        const copies = node.isInstancedMesh ? node.count : 1;

        meshes++;
        triangles += Math.floor(count / 3) * copies;
        vertices += (attributes.position?.count ?? 0) * copies;

        for (const material of drawn) {
            materials.add(material);

            for (const texture of texturesOf(material)) {
                textures.add(texture);
            }
        }
    });

    return {
        meshes,
        triangles,
        vertices,
        materials: materials.size,
        textures: [...textures].map(sizeOf).sort((a, b) => b.width * b.height - a.width * a.height),
        bones: bones.size,
    };
}

// The pictures a material draws with: its maps, and a shader's uniforms that are pictures
function texturesOf(material) {
    const found = Object.values(material).filter((value) => value?.isTexture);

    for (const uniform of Object.values(material.uniforms ?? {})) {
        if (uniform?.value?.isTexture) {
            found.push(uniform.value);
        }
    }

    return found;
}

// A picture's size (pixels), and whether it's sent to the graphics card compressed (a KTX2's)
function sizeOf(texture) {
    const image = texture.image ?? texture.source?.data ?? null;
    const first = texture.mipmaps?.[0];

    return { width: image?.width ?? first?.width ?? 0, height: image?.height ?? first?.height ?? 0, compressed: Boolean(texture.isCompressedTexture) };
}

/** Draw something's every material as its wireframe (`on`), or as itself again. */
export function wireframe(object, on) {
    object.traverse((node) => {
        for (const material of [node.material].flat()) {
            if (material && "wireframe" in material) {
                material.wireframe = on;
            }
        }
    });
}

/**
 * The last moments of how something moved (`most` of them), kept as it's drawn (keep), to step
 * back and forth through (back, forward) and show again just as they were (each part's place,
 * turn and size, whether it's shown, and its morphs: a face's), then back to how it is now
 * (latest) to carry on from. Only how it looks is kept: what it's doing carries on from now.
 */
export class Rewind {
    constructor(most = 600) {
        this.most = most;
        this.kept = [];

        /** Which of those kept is shown (the latest: as it is now). */
        this.at = -1;
    }

    /** Forget them all (something else shown, or it's begun something new). */
    clear() {
        this.kept = [];
        this.at = -1;
    }

    /** Whether one of those kept from before now is shown. */
    get past() {
        return this.at < this.kept.length - 1;
    }

    /** Keep how something (`object`) is now, `time` (seconds) into what it's doing. */
    keep(object, time) {
        const nodes = [];

        object.traverse((node) => nodes.push(node));

        const places = new Float32Array(nodes.length * 10);
        const shown = new Uint8Array(nodes.length);
        const morphs = [];

        nodes.forEach((node, i) => {
            node.position.toArray(places, i * 10);
            node.quaternion.toArray(places, i * 10 + 3);
            node.scale.toArray(places, i * 10 + 7);
            shown[i] = node.visible ? 1 : 0;

            if (node.morphTargetInfluences) {
                morphs.push([node, [...node.morphTargetInfluences]]);
            }
        });

        // (What's been stepped back to, and from, is let go of: now's after it)
        this.kept.length = this.at + 1;
        this.kept.push({ nodes, places, shown, morphs, time });
        this.kept.splice(0, Math.max(0, this.kept.length - this.most));
        this.at = this.kept.length - 1;
    }

    /** Show the one kept before the one shown, if there is one: its time, or null. */
    stepBack() {
        return this.at > 0 ? this.#show(this.at - 1) : null;
    }

    /** Show the one kept after the one shown, if there is one: its time, or null (it's now). */
    stepForward() {
        return this.past ? this.#show(this.at + 1) : null;
    }

    /** Show the latest kept (as it is now) again, to carry on from: its time, or null. */
    latest() {
        return this.kept.length ? this.#show(this.kept.length - 1) : null;
    }

    #show(at) {
        const { nodes, places, shown, morphs, time } = this.kept[at];

        nodes.forEach((node, i) => {
            node.position.fromArray(places, i * 10);
            node.quaternion.fromArray(places, i * 10 + 3);
            node.scale.fromArray(places, i * 10 + 7);
            node.visible = shown[i] === 1;
        });

        for (const [node, influences] of morphs) {
            influences.forEach((value, k) => {
                node.morphTargetInfluences[k] = value;
            });
        }

        this.at = at;

        return time;
    }
}
