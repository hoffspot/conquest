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

// A texture's picture, painted the first time it's wanted (to be drawn, most likely). The
// buildings out in the world are drawn with the atlas instead (atlas.js toAtlas: it needs only a
// material's name), so most of the textured materials the art asks for are never drawn at all
class PaintedWhenWanted extends THREE.TextureSource {
    constructor(painter) {
        super(null);
        this.painter = painter;
    }

    get data() {
        this.paint();

        return this.picture;
    }

    set data(picture) {
        this.picture = picture;
    }

    // Paint it, if it's not painted yet: whether it was
    paint() {
        if (!this.painter) {
            return false;
        }

        this.picture = this.painter();
        this.painter = null;

        return true;
    }
}

/**
 * Paint a material's picture now, if it's one painted when it's first wanted and it isn't yet
 * (else it's painted in the frame it's first drawn in): whether it was.
 */
export function paintPicture(material) {
    const source = material?.map?.source;

    return source instanceof PaintedWhenWanted && source.paint();
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
        // (A tinted material painted as the one it's tinted from, in its tint; its picture painted
        // when it's first drawn)
        const from = TINTS[name]?.from ?? name;
        const world = MATERIALS[from].world;
        const texture = new THREE.Texture();

        texture.source = new PaintedWhenWanted(() => paintTexture(painterOf(from)));
        texture.needsUpdate = true;
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
