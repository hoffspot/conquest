// The mouth's inside: Vitruvian's teeth, gums and tongue (build-vitruvian.js), drawn with their
// own picture (the kit's, loaded with it: loadPictures) and darkening into the throat. Nothing
// lights the inside of a mouth but what comes in between the lips, and three.js's light reaches
// it all alike: the back of an open mouth was lit as its front. How far back is measured from the
// front of each character's own (fitMouth: as its body's shaped): a small face's mouth sits a
// centimetre behind the base body's, an orc's two and a half in front.

import * as THREE from "three";

// How dark the mouth is inside (of all the light on it); where the dark starts and how far in it's
// at its darkest, both of how deep the mouth goes from its front (the front teeth are lit: only
// the front shows between the lips); and how it comes on (the power of how far in: soon)
const SHADE = Object.freeze({ dark: 0.08, start: 0.15, reach: 0.35, power: 0.7 });

const textures = new WeakMap();
const vertices = new WeakMap();

/**
 * A kit's pictures (the manifest's `pictures`: { name: path }), fetched and decoded, upside down
 * as three.js reads a picture's rows (its first the bottom's). An empty object where there are
 * none (MakeHuman's body).
 */
export async function loadPictures(base, fetch = globalThis.fetch.bind(globalThis), paths = {}) {
    const pictures = {};

    await Promise.all(Object.entries(paths).map(async ([name, file]) => {
        const blob = await (await fetch(new URL(file, base).href)).blob();

        pictures[name] = await createImageBitmap(blob, { imageOrientation: "flipY" });
    }));

    return pictures;
}

/**
 * The mouth's inside's material for a character on a kit's body: its picture, if loaded, darkening
 * going in (from the base body's mouth till fitted to its own: fitMouth).
 */
export function mouthMaterial(human) {
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, map: mouthTexture(human) });
    // (Where the dark starts, and how far back it comes on: uniforms, refitted as it's shaped)
    const shade = { front: { value: 0 }, depth: { value: 1 } };

    material.userData.shade = shade;
    fitMouth(material, human, human.basePositions);
    material.onBeforeCompile = (shader) => {
        shader.uniforms.mouthFront = shade.front;
        shader.uniforms.mouthDepth = shade.depth;
        shader.vertexShader = shader.vertexShader
            .replace("#include <common>", "#include <common>\nuniform float mouthFront;\nuniform float mouthDepth;\nvarying float mouthIn;")
            .replace("#include <begin_vertex>", "#include <begin_vertex>\nmouthIn = clamp( ( mouthFront - transformed.z ) / mouthDepth, 0.0, 1.0 );");
        shader.fragmentShader = shader.fragmentShader
            .replace("#include <common>", "#include <common>\nvarying float mouthIn;")
            .replace("#include <opaque_fragment>", `outgoingLight *= mix( 1.0, ${SHADE.dark.toFixed(3)}, pow( mouthIn, ${SHADE.power.toFixed(3)} ) );\n#include <opaque_fragment>`);
    };
    material.customProgramCacheKey = () => "mouth";
    material.userData.mouth = true;

    return material;
}

/** Whether a material is the mouth's (its picture is the kit's, shared: not let go of with it). */
export function isMouth(material) {
    return material.userData.mouth === true;
}

/**
 * Darken a mouth's inside from where it is on a character's body as shaped (`positions`, as
 * HumanData.shape's): how far forward its front is (the lips' inside), and how deep it goes back.
 */
export function fitMouth(material, human, positions) {
    let front = -Infinity;
    let back = Infinity;

    for (const v of mouthVertices(human)) {
        front = Math.max(front, positions[v * 3 + 2]);
        back = Math.min(back, positions[v * 3 + 2]);
    }

    const [at, depth] = front > back ? [front, front - back] : [0, 1];

    material.userData.shade.front.value = at - depth * SHADE.start;
    material.userData.shade.depth.value = depth * (SHADE.reach - SHADE.start);
}

// The kit's mouth picture as a texture (made once), or null without one
function mouthTexture(human) {
    const picture = human.pictures?.mouth;

    if (!picture) {
        return null;
    }

    if (!textures.has(human)) {
        const texture = new THREE.Texture(picture);

        texture.colorSpace = THREE.SRGBColorSpace;
        texture.flipY = false;
        texture.anisotropy = 4;
        texture.needsUpdate = true;
        textures.set(human, texture);
    }

    return textures.get(human);
}

// The mouth's inside's vertices (of the body's: made once)
function mouthVertices(human) {
    if (!vertices.has(human)) {
        vertices.set(human, Int32Array.from(new Set(Array.from(human.renderIndices("mouth"), (r) => human.renderSource[r]))));
    }

    return vertices.get(human);
}
