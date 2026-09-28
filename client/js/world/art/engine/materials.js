// Procedural textures and materials: stone, brick, plaster, thatch, slate, clay tiles, wood and
// the ground under towns and castles. Each texture is painted pixel by pixel from a seeded random
// generator, so the art comes out the same every time it is generated. Textures tile seamlessly
// and say how many world pixels one copy covers (see Solid: texture coordinates are world pixels).
//
// Each painter also says how high each pixel stands (0 to 1: mortar low, a stone's face high, a
// slate's lower edge over the next), which the art's one material (atlas.js) lights as relief.
// Painters are drawn on a canvas SIZE pixels square; a layer of the atlas can be painted finer,
// the same pattern sampled between the pixels.

import * as THREE from "three";
import { COLOURS, GLOWING, GLOWS, MATERIALS, painterOf, SIZE, TINTS } from "./painters.js";

export { COLOURS, GLOWING, GLOWS, MATERIALS, paintLayer, TINTS } from "./painters.js";

// Paint a texture: paint(x, y) returns the colour at canvas pixel (x, y) (and how high it stands,
// which a canvas leaves out). Returns the canvas.
function paintTexture(paint) {
    const canvas = document.createElement("canvas");

    canvas.width = SIZE;
    canvas.height = SIZE;

    const context = canvas.getContext("2d");
    const image = context.createImageData(SIZE, SIZE);

    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            const [r, g, b] = paint(x, y);
            const i = (y * SIZE + x) * 4;

            image.data[i] = r;
            image.data[i + 1] = g;
            image.data[i + 2] = b;
            image.data[i + 3] = 255;
        }
    }

    context.putImageData(image, 0, 0);

    return canvas;
}

const cache = new Map();

/** The canvas for a textured material (for drawing the ground, which is 2D). */
export function textureCanvas(name) {
    return { canvas: paintTexture(painterOf(name)), world: MATERIALS[name].world };
}

/**
 * The shared material with this name: a texture from MATERIALS (or one of them tinted: TINTS), a
 * plain colour from COLOURS, or a light from GLOWS.
 */
export function material(name) {
    if (cache.has(name)) {
        return cache.get(name);
    }

    let result;

    if (MATERIALS[name] || TINTS[name]) {
        // (A tinted material painted as the one it's tinted from, in its tint)
        const { canvas, world } = textureCanvas(TINTS[name]?.from ?? name);
        const texture = new THREE.CanvasTexture(canvas);

        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1 / world, 1 / world);
        texture.anisotropy = 8;
        result = new THREE.MeshLambertMaterial({ map: texture });

        if (TINTS[name]) {
            result.color.setRGB(...TINTS[name].tint);
        }
    } else if (GLOWS[name] !== undefined) {
        // (Light: its own colour whatever the light round it)
        result = new THREE.MeshBasicMaterial({ color: GLOWS[name] });
        result.userData.glow = GLOWS[name];
    } else if (COLOURS[name] !== undefined) {
        result = new THREE.MeshLambertMaterial({ color: COLOURS[name] });
    } else if (GLOWING[name]) {
        result = new THREE.MeshLambertMaterial(GLOWING[name]);
    } else {
        throw new Error(`No material called ${name}`);
    }

    result.name = name;
    // Every face casts shadows, whichever way it faces
    result.shadowSide = THREE.DoubleSide;
    cache.set(name, result);

    return result;
}
