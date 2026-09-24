// The pixel-art style: every pixel either solid or clear, its colour taken from the LPC palette,
// with a dark outline around each piece (as in LPC's hand-drawn art). Applied to a smooth
// rendering of the piece at the pixel art's size.

import { LPC_PALETTE } from "./palette.js";

// Colours are matched in Oklab, where distances follow how different colours look
function toLinear(channel) {
    const c = channel / 255;

    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function oklab([r, g, b]) {
    const [lr, lg, lb] = [r, g, b].map(toLinear);
    const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
    const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
    const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);

    return [
        0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ];
}

const PALETTE = LPC_PALETTE.map((hex) => {
    const value = parseInt(hex.slice(1), 16);
    const rgb = [(value >> 16) & 255, (value >> 8) & 255, value & 255];

    return { rgb, lab: oklab(rgb) };
});

const nearestCache = new Map();

/** The palette colour closest to an [r, g, b] colour. */
export function nearestColour(rgb) {
    const key = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];

    if (!nearestCache.has(key)) {
        const [l, a, b] = oklab(rgb);
        let best = PALETTE[0];
        let bestDistance = Infinity;

        for (const entry of PALETTE) {
            // Lightness counts a little less than hue, so that shading keeps its colour
            const distance = 0.7 * (entry.lab[0] - l) ** 2 + (entry.lab[1] - a) ** 2 + (entry.lab[2] - b) ** 2;

            if (distance < bestDistance) {
                best = entry;
                bestDistance = distance;
            }
        }

        nearestCache.set(key, best.rgb);
    }

    return nearestCache.get(key);
}

// Pixels at least this opaque become solid; the rest become clear
const SOLID = 110;

/** A copy of a sprite in the pixel-art style. */
export function pixelate(sprite) {
    const { width, height } = sprite;
    const canvas = document.createElement("canvas");

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");

    context.drawImage(sprite, 0, 0);

    const image = context.getImageData(0, 0, width, height);
    const data = image.data;
    const solid = new Uint8Array(width * height);

    for (let i = 0; i < width * height; i++) {
        const alpha = data[i * 4 + 3];

        if (alpha < SOLID) {
            data[i * 4 + 3] = 0;
            continue;
        }

        // Undo the blending with the clear background at the edges
        const unblend = (channel) => Math.min(255, Math.round((channel * 255) / alpha));
        const colour = nearestColour([unblend(data[i * 4]), unblend(data[i * 4 + 1]), unblend(data[i * 4 + 2])]);

        data.set([...colour, 255], i * 4);
        solid[i] = 1;
    }

    // Outline: clear pixels next to the piece take a dark version of their neighbour's colour
    const outline = [];

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = y * width + x;

            if (solid[i]) {
                continue;
            }

            const neighbour = [[x, y + 1], [x - 1, y], [x + 1, y], [x, y - 1]].find(([nx, ny]) => nx >= 0 && ny >= 0 && nx < width && ny < height && solid[ny * width + nx]);

            if (neighbour) {
                const j = (neighbour[1] * width + neighbour[0]) * 4;

                outline.push([i, nearestColour([data[j], data[j + 1], data[j + 2]].map((channel) => Math.round(channel * 0.3)))]);
            }
        }
    }

    for (const [i, colour] of outline) {
        data.set([...colour, 255], i * 4);
    }

    context.putImageData(image, 0, 0);

    return canvas;
}

/** A copy of a ground shadow with hard edges: fully shadowed or not at all. */
export function pixelateShadow(shadow) {
    const canvas = document.createElement("canvas");

    canvas.width = shadow.width;
    canvas.height = shadow.height;

    const context = canvas.getContext("2d");

    context.drawImage(shadow, 0, 0);

    const image = context.getImageData(0, 0, canvas.width, canvas.height);

    for (let i = 3; i < image.data.length; i += 4) {
        image.data[i] = image.data[i] >= 100 ? 255 : 0;
    }

    context.putImageData(image, 0, 0);

    return canvas;
}
