// The land of a world plan painted as a picture, for the pages that look over it: the world map
// (world-map.html) and the war (war.html). And the colour each people is shown in.

import { COLOURS } from "../core/war/peoples.js";
import { BIOMES, CELLS, WATER } from "../core/worldplan/plan.js";

/** How many pixels of the land's picture a cell is. */
export const PIXELS = 4;

/** Each people's colour. */
export const PEOPLE_COLOURS = COLOURS;

/** A river's colour ([r, g, b]). */
export const RIVER = Object.freeze([70, 130, 185]);

/** A picture of the whole world, a cell PIXELS pixels, painted by `draw(context, canvas)`. */
export function picture(draw) {
    const result = document.createElement("canvas");

    result.width = result.height = CELLS * PIXELS;
    draw(result.getContext("2d"), result);

    return result;
}

/** A colour (#rrggbb) as [r, g, b]. */
export const hex = (colour) => [1, 3, 5].map((k) => parseInt(colour.slice(k, k + 2), 16));

// The land: each cell its biome's colour, shaded as if lit from the north-west, rivers in blue
export function paintLand(plan) {
    return picture((paint) => {
        const image = paint.createImageData(CELLS * PIXELS, CELLS * PIXELS);
        const colours = BIOMES.map(({ colour }) => hex(colour));
        const at = (x, y) => plan.height[Math.min(CELLS - 1, Math.max(0, y)) * CELLS + Math.min(CELLS - 1, Math.max(0, x))];

        for (let y = 0; y < CELLS; y++) {
            for (let x = 0; x < CELLS; x++) {
                const k = y * CELLS + x;
                const water = plan.water[k];
                const shade = water === WATER.sea || water === WATER.lake ? 1 : Math.min(1.35, Math.max(0.65, 1 + (at(x - 1, y) - at(x + 1, y) + at(x, y - 1) - at(x, y + 1)) * 3));
                const colour = water === WATER.river ? RIVER : colours[plan.biome[k]];

                for (let dy = 0; dy < PIXELS; dy++) {
                    for (let dx = 0; dx < PIXELS; dx++) {
                        const p = ((y * PIXELS + dy) * CELLS * PIXELS + x * PIXELS + dx) * 4;
                        const grain = water ? 1 : 0.96 + (((x * 7 + dx) * 13 + (y * 11 + dy) * 17) % 9) / 100;

                        image.data[p] = colour[0] * shade * grain;
                        image.data[p + 1] = colour[1] * shade * grain;
                        image.data[p + 2] = colour[2] * shade * grain;
                        image.data[p + 3] = 255;
                    }
                }
            }
        }

        paint.putImageData(image, 0, 0);
    });
}
