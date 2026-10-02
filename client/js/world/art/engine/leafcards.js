// Cards of leaves cut out of their pictures (the hedges' sprigs, the ruins' ivy): one material
// set up the one way for all of them, so they're all one shader program (no compile stall for a
// new one on Safari), each with its own picture.

import * as THREE from "three";

/** A canvas made a texture for leaves: in sRGB, sharp at a slant, tiling (`repeat`) or not. */
export function leafTexture(canvas, repeat) {
    const texture = new THREE.CanvasTexture(canvas);

    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    texture.wrapS = texture.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;

    return texture;
}

/**
 * Cards of leaves cut out of their picture (`picture`: a canvas, or null in Node, where nothing's
 * painted and they're `colour`; `repeat` if it tiles): soft-edged where they're drawn
 * multisampled, as the trees' leaves are; both sides lit as the front is, as a mass of leaves is;
 * coloured by their corners' colours too.
 */
export function leafCards(name, picture, colour, { repeat = false } = {}) {
    const material = new THREE.MeshLambertMaterial({
        name,
        color: picture ? 0xffffff : colour,
        map: picture ? leafTexture(picture, repeat) : null,
        vertexColors: true,
        alphaTest: 0.45,
        alphaToCoverage: true,
        side: THREE.DoubleSide,
    });

    // (Seen from behind, a card's lit as from in front)
    material.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace("#include <normal_fragment_begin>", THREE.ShaderChunk.normal_fragment_begin.replace("normal *= faceDirection;", ""));
    };
    material.customProgramCacheKey = () => "leaf cards";

    return material;
}
