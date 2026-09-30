// The land of a world plan painted as a picture, for the pages that look over it: the world map
// (world-map.html) and the war (war.html). And the colour each people is shown in.

import { COLOURS } from "../core/war/peoples.js";
import { heightAt } from "../core/terrain/height.js";
import { BIOMES, CELL, CELLS, WATER } from "../core/worldplan/plan.js";

/** How many pixels of the land's picture a cell is. */
export const PIXELS = 4;

/** Each people's colour. */
export const PEOPLE_COLOURS = COLOURS;

/** A river's colour ([r, g, b]). */
export const RIVER = Object.freeze([70, 130, 185]);

// Rock too steep to walk (with `relief`)
const ROCK = [128, 118, 108];

/** A picture of the whole world, a cell PIXELS pixels, painted by `draw(context, canvas)`. */
export function picture(draw) {
    const result = document.createElement("canvas");

    result.width = result.height = CELLS * PIXELS;
    draw(result.getContext("2d"), result);

    return result;
}

/** A colour (#rrggbb) as [r, g, b]. */
export const hex = (colour) => [1, 3, 5].map((k) => parseInt(colour.slice(k, k + 2), 16));

// The ground's heights (terrain/height.js) at every pixel's corner of the land's picture (metres)
function reliefOf(plan) {
    const size = CELLS * PIXELS + 1;
    const step = CELL / PIXELS;
    const heights = new Float32Array(size * size);

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            heights[y * size + x] = heightAt(plan, x * step, y * step);
        }
    }

    return { heights, size, step };
}

/**
 * The land: each cell its biome's colour, shaded as if lit from the north-west, rivers in blue.
 * With `relief`, shaded by the ground's own heights, pixel by pixel (terrain/height.js: a second
 * or two more), steep rock grey; else by the plan's heights, cell by cell.
 */
export function paintLand(plan, { relief = false } = {}) {
    const ground = relief ? reliefOf(plan) : null;

    return picture((paint) => {
        const image = paint.createImageData(CELLS * PIXELS, CELLS * PIXELS);
        const colours = BIOMES.map(({ colour }) => hex(colour));
        const at = (x, y) => plan.height[Math.min(CELLS - 1, Math.max(0, y)) * CELLS + Math.min(CELLS - 1, Math.max(0, x))];
        const lit = (px, py) => {
            const { heights, size, step } = ground;
            const k = py * size + px;
            const [gx, gy] = [(heights[k + 1] - heights[k] + heights[k + size + 1] - heights[k + size]) / (2 * step), (heights[k + size] - heights[k] + heights[k + size + 1] - heights[k + 1]) / (2 * step)];
            // (Lit from the north-west and a little above, with light from the sky all round)
            const light = (0.7 - 0.5 * gx - 0.5 * gy) / Math.sqrt(1 + gx * gx + gy * gy) / 0.995;

            return { shade: 0.55 + 0.6 * Math.max(0, light), rock: gx * gx + gy * gy > 0.6 };
        };

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
                        const here = ground && !water ? lit(x * PIXELS + dx, y * PIXELS + dy) : { shade, rock: false };
                        const [r, g, b] = here.rock ? ROCK : colour;

                        image.data[p] = r * here.shade * grain;
                        image.data[p + 1] = g * here.shade * grain;
                        image.data[p + 2] = b * here.shade * grain;
                        image.data[p + 3] = 255;
                    }
                }
            }
        }

        paint.putImageData(image, 0, 0);
    });
}
