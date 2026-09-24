// Draws a castle or town layout (client/js/core/setpieces) with its pieces' art, as the game would
// show it: the grass of the game's map, the layout's ground (roads, cobbles, courtyards, gardens)
// blended in with soft edges, every piece's ground shadow merged into one, and the pieces drawn
// back to front, with any units in among them.

import { TILESET } from "../../client/js/core/data/tileset.js";
import { GROUND } from "../../client/js/core/setpieces/pieces.js";
import { textureCanvas } from "./engine/materials.js";

const CELL = 20;

// How dark ground shadows are
const SHADOW_STRENGTH = 0.42;

// Room around the layout for tall pieces and long shadows, in world pixels
const PAD = { top: 90, side: 40, bottom: 60 };

const GROUND_TEXTURES = [
    [GROUND.courtyard, "courtyard"],
    [GROUND.road, "road"],
    [GROUND.soil, "soil"],
    [GROUND.cobbles, "cobbles"],
];

const loadImage = (url) => new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load ${url}`));
    image.src = url;
});

let grassTile;

// The map's plain grass tile
async function grass() {
    if (!grassTile) {
        const image = await loadImage("/client/images/maps/plains.png");
        const { x, y } = TILESET.tiles[TILESET.grass];
        const canvas = document.createElement("canvas");

        canvas.width = CELL;
        canvas.height = CELL;
        canvas.getContext("2d").drawImage(image, x * CELL, y * CELL, CELL, CELL, 0, 0, CELL, CELL);
        grassTile = canvas;
    }

    return grassTile;
}

function canvasOf(width, height) {
    const canvas = document.createElement("canvas");

    canvas.width = Math.round(width);
    canvas.height = Math.round(height);

    return canvas;
}

// A repeating pattern of an image, scaled so that one copy covers `world` world pixels
function pattern(context, image, world, scale) {
    const tile = canvasOf(world * scale, world * scale);
    const tileContext = tile.getContext("2d");

    tileContext.imageSmoothingQuality = "high";
    tileContext.drawImage(image, 0, 0, tile.width, tile.height);

    return context.createPattern(tile, "repeat");
}

// Smooth noise for ragged edges between kinds of ground
function hash(x, y) {
    let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);

    h = Math.imul(h ^ (h >>> 13), 1274126177);

    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function edgeNoise(x, y) {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const top = hash(x0, y0) * (1 - fx) + hash(x0 + 1, y0) * fx;
    const bottom = hash(x0, y0 + 1) * (1 - fx) + hash(x0 + 1, y0 + 1) * fx;

    return top * (1 - fy) + bottom * fy;
}

/**
 * Draw a layout. `art(key)` gives a piece's { sprite, x, y, shadow, shadowX, shadowY, shadowScale }:
 * its images (at `scale` pixels per world pixel, the shadow at `shadowScale` times that) and where
 * their top-left corners go, in world pixels from the north-west corner of the piece's first square.
 * `units` are extra things to draw among the pieces: [{ x, y (world pixels), art }].
 */
export async function compose(layout, art, { scale, units = [] } = {}) {
    const width = layout.width * CELL;
    const height = layout.height * CELL;
    const canvas = canvasOf((width + PAD.side * 2) * scale, (height + PAD.top + PAD.bottom) * scale);
    const context = canvas.getContext("2d");
    const origin = [PAD.side * scale, PAD.top * scale];

    // Grass everywhere
    context.fillStyle = pattern(context, await grass(), CELL, scale);
    context.fillRect(0, 0, canvas.width, canvas.height);

    // Each kind of ground, blended in through a soft-edged mask
    for (const [kind, name] of GROUND_TEXTURES) {
        const cells = canvasOf(layout.width + 2, layout.height + 2);
        const cellsContext = cells.getContext("2d");
        const cellImage = cellsContext.createImageData(cells.width, cells.height);
        let any = false;

        for (let y = 0; y < layout.height; y++) {
            for (let x = 0; x < layout.width; x++) {
                if (layout.ground[y][x] === kind) {
                    cellImage.data[((y + 1) * cells.width + x + 1) * 4 + 3] = 255;
                    any = true;
                }
            }
        }

        if (!any) {
            continue;
        }

        cellsContext.putImageData(cellImage, 0, 0);

        // Scale the square-by-square mask up smoothly, then roughen its edges
        const mask = canvasOf(width * scale, height * scale);
        const maskContext = mask.getContext("2d");

        maskContext.imageSmoothingQuality = "high";
        maskContext.drawImage(cells, 1, 1, layout.width, layout.height, 0, 0, mask.width, mask.height);

        const maskImage = maskContext.getImageData(0, 0, mask.width, mask.height);

        for (let y = 0; y < mask.height; y++) {
            for (let x = 0; x < mask.width; x++) {
                const i = (y * mask.width + x) * 4 + 3;
                const noise = edgeNoise(x / (scale * 5), y / (scale * 5)) - 0.5;
                const value = maskImage.data[i] / 255 + noise * 0.45;
                const t = Math.max(0, Math.min(1, (value - 0.38) / 0.24));

                maskImage.data[i] = Math.round(t * t * (3 - 2 * t) * 255);
            }
        }

        maskContext.putImageData(maskImage, 0, 0);

        const { canvas: texture, world } = textureCanvas(name);

        maskContext.globalCompositeOperation = "source-in";
        maskContext.fillStyle = pattern(maskContext, texture, world, scale);
        maskContext.fillRect(0, 0, mask.width, mask.height);
        context.drawImage(mask, ...origin);
    }

    // Everything drawn, back to front: pieces by their southern edge, units by where they stand
    const drawn = [
        ...layout.pieces.map((piece) => ({ piece, art: art(piece.key), sort: (piece.y + piece.h) * CELL, x: piece.x * CELL, y: piece.y * CELL })),
        ...units.map((unit) => ({ art: unit.art, sort: unit.y, x: unit.x, y: unit.y })),
    ].sort((a, b) => a.sort - b.sort || a.x - b.x);

    // Shadows, merged so that overlapping shadows are no darker than one
    const shade = new Float32Array(canvas.width * canvas.height);

    for (const { art: { shadow: stored, shadowScale = 1, shadowX, shadowY }, x: at, y: top } of drawn) {
        const left = Math.round(origin[0] + (at + shadowX) * scale);
        const upper = Math.round(origin[1] + (top + shadowY) * scale);
        // Shadows may be stored at a lower resolution than the sprites
        const shadow = canvasOf(stored.width / shadowScale, stored.height / shadowScale);
        const shadowContext = shadow.getContext("2d", { willReadFrequently: true });

        shadowContext.drawImage(stored, 0, 0, shadow.width, shadow.height);

        const data = shadowContext.getImageData(0, 0, shadow.width, shadow.height).data;

        for (let j = 0; j < shadow.height; j++) {
            for (let i = 0; i < shadow.width; i++) {
                const cx = left + i;
                const cy = upper + j;

                if (cx >= 0 && cy >= 0 && cx < canvas.width && cy < canvas.height) {
                    const k = cy * canvas.width + cx;

                    shade[k] = Math.max(shade[k], data[(j * shadow.width + i) * 4 + 3] / 255);
                }
            }
        }
    }

    const image = context.getImageData(0, 0, canvas.width, canvas.height);

    for (let k = 0; k < shade.length; k++) {
        const factor = 1 - shade[k] * SHADOW_STRENGTH;

        image.data[k * 4] *= factor;
        image.data[k * 4 + 1] *= factor;
        image.data[k * 4 + 2] *= factor;
    }

    context.putImageData(image, 0, 0);

    for (const { art: { sprite, x, y }, x: at, y: top } of drawn) {
        context.drawImage(sprite, Math.round(origin[0] + (at + x) * scale), Math.round(origin[1] + (top + y) * scale));
    }

    return canvas;
}
