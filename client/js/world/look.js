// How the world looks where the player is (the terrain plan's §9: a palette per region): the sky
// overhead and at the horizon (the haze's colour too), the sun's colour and strength, the mist in
// the low ground, and the picture's grade, for each land (the world plan's biomes): green and
// gold over farmland and meadow; blue fog in the marshes and the elves' woods; violet in the
// darkwood; gold over the savannah; red over the badlands and the volcano's ash; white-blue in the
// snow and on the mountains. Blended over the lands round the player (the nearer the more, none
// from `reach` metres off) and eased as they walk (`ease` seconds), so crossing from one land to
// another the sky turns slowly. Only for the eye (view.js setLook): nothing in the world hangs on
// it.

import { heightAt } from "../core/terrain/height.js";
import { CELL, CELLS } from "../core/worldplan/plan.js";
import { BIOMES } from "../core/worldplan/races.js";

/**
 * Each land's look: `zenith` and `horizon` (the sky's, sRGB; the haze's is the horizon's), `sun`
 * ([colour, strength]), `mist` ([how thick at its floor (a metre), its floor (metres over the
 * ground round about: the lands' the look's taken from, on average), how far up it thins by e
 * (metres)]: fog.js MIST), `grade` ([tint red, green, blue, saturation]: each
 * times 1 plus it: fog.js GRADE). A land not listed looks as the meadow does.
 */
export const LOOKS = Object.freeze({
    meadow: { zenith: 0x4f86c2, horizon: 0xa9c8de, sun: [0xfff0d8, 3.5], mist: [0.0012, 4, 18], grade: [0, 0, 0, 0] },
    farmland: { zenith: 0x4f86c2, horizon: 0xaccad8, sun: [0xfff0d4, 3.5], mist: [0.0012, 4, 18], grade: [0.015, 0.01, -0.01, 0.03] },
    woods: { zenith: 0x4c84c0, horizon: 0xa4c2d2, sun: [0xfff0d8, 3.4], mist: [0.002, 8, 20], grade: [-0.01, 0.01, -0.01, 0] },
    heath: { zenith: 0x5584b8, horizon: 0xb4c2c8, sun: [0xf8eedc, 3.4], mist: [0.0015, 6, 18], grade: [0.01, 0, -0.02, -0.08] },
    marsh: { zenith: 0x5a85a8, horizon: 0x9fb4b8, sun: [0xf6f0e0, 3.2], mist: [0.006, 3, 14], grade: [-0.02, 0, 0.01, -0.1] },
    lake: { zenith: 0x4f86c2, horizon: 0xa8c8e0, sun: [0xfff0d8, 3.5], mist: [0.0015, 2, 15], grade: [-0.01, 0, 0.01, 0] },
    sea: { zenith: 0x4f86c2, horizon: 0xa8c8e0, sun: [0xfff0d8, 3.5], mist: [0.0015, 2, 15], grade: [-0.01, 0, 0.01, 0] },
    beach: { zenith: 0x4f86c2, horizon: 0xb0cce0, sun: [0xfff2dc, 3.6], mist: [0.001, 2, 15], grade: [0.01, 0.01, 0, 0.02] },
    elfwood: { zenith: 0x4a7cc4, horizon: 0xa8c4dc, sun: [0xf2f4ff, 3.4], mist: [0.004, 12, 22], grade: [-0.03, 0, 0.04, 0.06] },
    darkwood: { zenith: 0x46508a, horizon: 0x9a92b8, sun: [0xe8dcff, 2.9], mist: [0.004, 10, 20], grade: [0.02, -0.04, 0.06, -0.12] },
    savannah: { zenith: 0x5a8cc8, horizon: 0xd6c8a4, sun: [0xfff0c8, 3.8], mist: [0.0008, 4, 16], grade: [0.05, 0.02, -0.06, 0.06] },
    jungle: { zenith: 0x5088b8, horizon: 0xa8c4b4, sun: [0xfff8e0, 3.4], mist: [0.005, 6, 20], grade: [-0.02, 0.03, -0.01, 0.08] },
    badlands: { zenith: 0x6a8cbc, horizon: 0xd2b4a0, sun: [0xffe8c8, 3.7], mist: [0.0006, 4, 16], grade: [0.06, 0, -0.06, 0.02] },
    volcanic: { zenith: 0x5a6080, horizon: 0xb89a8c, sun: [0xffd8b0, 3.2], mist: [0.002, 10, 30], grade: [0.06, -0.02, -0.05, -0.1] },
    tundra: { zenith: 0x5a8ccc, horizon: 0xc4d6e6, sun: [0xf4f6ff, 3.5], mist: [0.001, 4, 16], grade: [-0.03, 0, 0.04, -0.1] },
    snow: { zenith: 0x5a8ccc, horizon: 0xc8dae8, sun: [0xf4f6ff, 3.6], mist: [0.001, 4, 16], grade: [-0.04, 0, 0.05, -0.12] },
    mountain: { zenith: 0x4a82c8, horizon: 0xb8cce0, sun: [0xfaf6f0, 3.6], mist: [0, 0, 20], grade: [-0.02, 0, 0.03, -0.05] },
});

/** How far round the player the lands' looks are taken from (metres, each way), and how long it eases (s). */
export const LOOKING = Object.freeze({ reach: 80, ease: 1.5 });

// A hex colour's sRGB components (0 to 1)
const components = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((byte) => byte / 255);

// A look as numbers to blend: zenith, horizon and sun colours (sRGB), the sun's strength, the mist,
// the grade
function numbersOf({ zenith, horizon, sun, mist, grade }) {
    return [...components(zenith), ...components(horizon), ...components(sun[0]), sun[1], ...mist, ...grade];
}

/**
 * A look's numbers (as numbersOf makes them) as a look: { zenith, horizon, sun, strength, mist,
 * grade } (the colours, mist and grade views of the numbers, not copies).
 */
function lookOf(numbers) {
    return { zenith: numbers.subarray(0, 3), horizon: numbers.subarray(3, 6), sun: numbers.subarray(6, 9), strength: numbers[9], mist: numbers.subarray(10, 13), grade: numbers.subarray(13, 17) };
}

const NUMBERS = BIOMES.map(({ id }) => Float64Array.from(numbersOf(LOOKS[id] ?? LOOKS.meadow)));
const COUNT = NUMBERS[0].length;
const MIST_FLOOR = 11;

/** A land's look (a BIOMES id) as Look's are: { zenith, horizon, sun, strength, mist, grade }. */
export function lookOfLand(id) {
    return lookOf(Float64Array.from(numbersOf(LOOKS[id] ?? LOOKS.meadow)));
}

export class Look {
    /** @param {object} plan - The world plan (its lands: plan.biome). */
    constructor(plan) {
        this.plan = plan;
        // (The ground's height in the middle of each of the plan's cells, as they're needed)
        this.grounds = new Float32Array(CELLS * CELLS).fill(NaN);
        this.numbers = new Float64Array(COUNT);
        this.target = new Float64Array(COUNT);
        this.eased = false;

        /** The look as it is now: { zenith, horizon, sun (sRGB 0 to 1), strength, mist, grade }. */
        this.current = lookOf(this.numbers);
    }

    /**
     * The look the lands round (x, z) (metres) make, as it would be once eased to (into `into`, or
     * a new array): each cell's weighed by how near its middle is (a tent each way, none from
     * LOOKING.reach metres off), so it changes smoothly as the player walks; the mist's floor over
     * their ground, weighed the same.
     */
    targetAt(x, z, into = new Float64Array(COUNT)) {
        const reach = LOOKING.reach / CELL;
        const [gx, gz] = [x / CELL - 0.5, z / CELL - 0.5];
        let total = 0;
        let ground = 0;

        into.fill(0);

        for (let j = Math.ceil(gz - reach); j <= Math.floor(gz + reach); j++) {
            for (let i = Math.ceil(gx - reach); i <= Math.floor(gx + reach); i++) {
                const weight = (1 - Math.abs(i - gx) / reach) * (1 - Math.abs(j - gz) / reach);

                if (weight <= 0) {
                    continue;
                }

                const cell = Math.min(CELLS - 1, Math.max(0, j)) * CELLS + Math.min(CELLS - 1, Math.max(0, i));
                const numbers = NUMBERS[this.plan.biome[cell]] ?? NUMBERS[0];

                for (let k = 0; k < COUNT; k++) {
                    into[k] += numbers[k] * weight;
                }

                ground += this.#ground(cell) * weight;
                total += weight;
            }
        }

        for (let k = 0; k < COUNT; k++) {
            into[k] /= total;
        }

        into[MIST_FLOOR] += ground / total;

        return into;
    }

    // The ground's height in the middle of a cell of the plan's (metres; the land's, not the sea's)
    #ground(cell) {
        if (Number.isNaN(this.grounds[cell])) {
            this.grounds[cell] = Math.max(0, heightAt(this.plan, ((cell % CELLS) + 0.5) * CELL, (Math.floor(cell / CELLS) + 0.5) * CELL));
        }

        return this.grounds[cell];
    }

    /**
     * The player's at (x, z), `dt` seconds on: the look eased towards the lands' round them (at
     * once, the first time). Returns the look as it now is (`current`: the same object each time,
     * its numbers changed).
     */
    update(x, z, dt) {
        const target = this.targetAt(x, z, this.target);
        const share = this.eased ? 1 - Math.exp(-dt / LOOKING.ease) : 1;

        for (let k = 0; k < COUNT; k++) {
            this.numbers[k] += (target[k] - this.numbers[k]) * share;
        }

        this.eased = true;
        this.current.strength = this.numbers[9];

        return this.current;
    }
}
