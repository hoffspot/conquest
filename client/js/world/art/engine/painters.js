// The painters of the art's textures, and what each material is painted with: the patterns,
// colours and scale of stone, brick, plaster, thatch, slate, tiles, timber and the ground (see
// materials.js). Nothing here needs a canvas or Three.js, so layers can be painted in a worker
// (paint-worker.js) or in Node.
//
// Each painter is given a pixel of a canvas SIZE square (or a point between pixels, to paint the
// same pattern finer) and returns its colour, and how high it stands (0 to 1).

import { createRandom } from "../../../core/random.js";

/** Pixels a side of the canvas painters draw on. */
export const SIZE = 128;

const hex = (value) => [(value >> 16) & 255, (value >> 8) & 255, value & 255];
const mix = (a, b, t) => a.map((channel, i) => channel + (b[i] - channel) * t);
const scale = (colour, factor) => colour.map((channel) => channel * factor);

// Smooth noise from 0 to 1 that repeats every `period` lattice cells (so textures tile)
function periodicNoise(seed, period) {
    const random = createRandom(seed);
    const lattice = Array.from({ length: period * period }, () => random.next());
    const at = (x, y) => lattice[(((y % period) + period) % period) * period + (((x % period) + period) % period)];
    const smooth = (t) => t * t * (3 - 2 * t);

    return (x, y) => {
        const x0 = Math.floor(x);
        const y0 = Math.floor(y);
        const fx = smooth(x - x0);
        const fy = smooth(y - y0);
        const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * fx;
        const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * fx;

        return top + (bottom - top) * fy;
    };
}

// Plates (a broken stone's faces): a jittered grid of `period` points a side, wrapping (so the
// picture tiles), each the middle of a plate. For a point (in cells: 0 to `period` across the
// picture), how far it is inside its plate's edge (the next plate's distance less its own: 0 on
// the crack between them), its plate and the next (their indices, period * period of them).
function periodicPlates(seed, period) {
    const random = createRandom(seed);
    const middles = Array.from({ length: period * period }, () => [0.15 + random.next() * 0.7, 0.15 + random.next() * 0.7]);
    const wrap = (value) => ((value % period) + period) % period;

    return (x, y) => {
        const [cx, cy] = [Math.floor(x), Math.floor(y)];
        let [near, next, plate, beside] = [Infinity, Infinity, 0, 0];

        for (let j = -1; j <= 1; j++) {
            for (let i = -1; i <= 1; i++) {
                const k = wrap(cy + j) * period + wrap(cx + i);
                const [mx, my] = middles[k];
                const distance = Math.hypot(cx + i + mx - x, cy + j + my - y);

                if (distance < near) {
                    [next, beside] = [near, plate];
                    [near, plate] = [distance, k];
                } else if (distance < next) {
                    [next, beside] = [distance, k];
                }
            }
        }

        return { edge: next - near, plate, beside };
    };
}

// A number from 0 to 1 for a whole number (or two, either way round): the same each time
const hashed = (a, b = 0) => {
    const value = Math.sin(Math.min(a, b) * 127.1 + Math.max(a, b) * 311.7 + 74.7) * 43758.5453;

    return value - Math.floor(value);
};

// Rows of blocks (stone courses, bricks, roof tiles): `rows` rows, each split into blocks of the
// given lengths (in canvas pixels, adding up to SIZE), each row shifted by a random amount. Calls
// block(u, v, row, index) with the pixel's position inside its block (0 to 1 across and down).
function courses(seed, rows, lengths, block) {
    const random = createRandom(seed);
    const rowHeight = SIZE / rows;
    const layout = [];

    for (let row = 0; row < rows; row++) {
        const blocks = [];
        const offset = Math.floor(random.next() * SIZE);
        let start = 0;

        while (start < SIZE) {
            let length = random.pick(lengths);

            if (SIZE - start - length < Math.min(...lengths)) {
                length = SIZE - start;
            }

            blocks.push({ start, length, shade: random.next(), index: blocks.length });
            start += length;
        }

        layout.push({ offset, blocks });
    }

    return (x, y) => {
        const row = Math.floor(y / rowHeight);
        const { offset, blocks } = layout[row];
        const along = (x + offset) % SIZE;
        const found = blocks.find(({ start, length }) => along >= start && along < start + length);

        return block((along - found.start) / found.length, (y - row * rowHeight) / rowHeight, found, row, found.length, rowHeight);
    };
}

/**
 * Old stone (the ruins', kits/neutral.js and kits/castle.js RUINED: MATERIALS' `old`), laid in
 * random courses (the research report behind M7b: "Random courses and dark mortar fix most of the
 * castle"): how many metres one copy covers (MATERIALS' `world` is five times it); each course
 * one of `courses` high (metres); each block one to three times as long as its course is high;
 * the joints `joint` metres wide.
 */
export const OLD_STONE = Object.freeze({ metres: 4.2, courses: [0.2, 0.28, 0.35, 0.45, 0.6], long: [1, 3], joint: 0.03 });

export const PAINTERS = {
    // Castle stone: squared blocks in courses, with mortar joints and lit upper edges
    ashlar({ base, light, dark, mortar }, seed) {
        const grain = periodicNoise(seed + 1, 16);
        const joint = 2.2;

        return courses(seed, 8, [26, 32, 38, 44], (u, v, { shade }, row, length, height) => {
            if (u * length < joint || v * height < joint) {
                return [...mortar, 0.1];
            }

            let colour = mix(dark, light, 0.25 + shade * 0.55);

            if (v * height < joint + 2) {
                colour = mix(colour, light, 0.35);
            } else if (v * height > height - 2.5) {
                colour = mix(colour, dark, 0.45);
            }

            // (Its face rounding off towards its edges)
            const edge = Math.min(u * length - joint, (1 - u) * length, v * height - joint, (1 - v) * height);
            const lift = 0.55 + Math.min(1, edge / 3) * 0.3 + grain(u * 3 + row, v * 3) * 0.15;

            return [...scale(mix(colour, base, 0.3), 0.93 + grain(u * 3 + row, v * 3) * 0.14), lift];
        });
    },

    // Old stone: random courses (OLD_STONE) of blocks each its own shade and hue, greener or
    // browner, darker towards its foot, its upper edge catching the light, flecked with lichen,
    // its corners chipped; the dark mortar between them wandering and sunk deep
    coursed({ base, light, dark, mortar }, seed) {
        const random = createRandom(seed);
        const grain = periodicNoise(seed + 1, 16);
        const fleck = periodicNoise(seed + 2, 64);
        const px = SIZE / OLD_STONE.metres;
        const joint = Math.max(1, OLD_STONE.joint * px);
        const rows = [];

        for (let top = 0; top < SIZE; ) {
            let height = random.pick(OLD_STONE.courses) * px;

            if (SIZE - top - height < OLD_STONE.courses[0] * px) {
                height = SIZE - top;
            }

            const blocks = [];
            const offset = random.next() * SIZE;

            for (let start = 0; start < SIZE; ) {
                let length = height * random.range(...OLD_STONE.long);

                if (SIZE - start - length < height) {
                    length = SIZE - start;
                }

                blocks.push({ start, length, shade: random.next(), hue: random.range(-1, 1), chip: random.next() });
                start += length;
            }

            rows.push({ top, height, offset, blocks });
            top += height;
        }

        const warm = mix(base, [0x6a, 0x63, 0x52], 0.6);
        const green = mix(base, [0x52, 0x60, 0x48], 0.6);
        const lichen = [0xa8, 0xa8, 0x86];

        return (x, y) => {
            const row = rows.find(({ top, height }) => y >= top && y < top + height) ?? rows.at(-1);
            const along = (((x + row.offset) % SIZE) + SIZE) % SIZE;
            const block = row.blocks.find(({ start, length }) => along >= start && along < start + length) ?? row.blocks.at(-1);
            const [u, v, w, h] = [along - block.start, y - row.top, block.length, row.height];

            // (The joints along its left and upper edges, wandering a little so they aren't ruled
            // lines, and its corners chipped)
            const across = joint * (0.75 + grain(x / 4, y / 4) * 0.5);
            const chip = block.chip * joint * 1.3;
            const off = (a, b) => Math.max(0, chip - Math.hypot(a, b));

            if (u < across || v < across || Math.max(off(u, v), off(w - u, v), off(u, h - v), off(w - u, h - v)) > 0.5) {
                return [...scale(mortar, 0.8 + grain(x / 3, y / 3) * 0.35), 0.03 + grain(x / 4, y / 4) * 0.05];
            }

            const edge = Math.min(u - across, w - u, v - across, h - v);
            const n = grain((x / SIZE) * 16, (y / SIZE) * 16);
            const mottle = fleck((x / SIZE) * 16 + block.start, (y / SIZE) * 16 + row.top);
            let colour = mix(dark, light, Math.min(1, Math.max(0, 0.1 + block.shade * 0.6 + (n - 0.5) * 0.35 + (mottle - 0.5) * 0.25)));

            colour = mix(colour, block.hue > 0 ? green : warm, Math.abs(block.hue) * 0.4);

            if (v / h > 0.75) {
                colour = scale(colour, 1 - (v / h - 0.75) * 0.8);
            } else if (v < across + 1.2) {
                colour = mix(colour, light, 0.2);
            }

            const flecked = fleck((x / SIZE) * 64, (y / SIZE) * 64);

            if (flecked > 0.84) {
                colour = mix(colour, lichen, Math.min(1, (flecked - 0.84) * 3.5));
            }

            return [...colour, 0.45 + Math.min(1, edge / 2) * 0.35 + n * 0.12 + (mottle - 0.5) * 0.1];
        };
    },

    brick({ base, light, dark, mortar }, seed) {
        const grain = periodicNoise(seed + 1, 32);

        return courses(seed, 10, [24, 26, 28], (u, v, { shade }, row, length, height) => {
            if (u * length < 2 || v * height < 2) {
                return [...mortar, 0.2];
            }

            const colour = mix(mix(dark, light, shade), base, 0.4);
            const edge = Math.min(u * length - 2, (1 - u) * length, v * height - 2, (1 - v) * height);

            return [...scale(v * height < 4 ? mix(colour, light, 0.2) : colour, 0.94 + grain((u * length) / 4, row * 3) * 0.12), 0.6 + Math.min(1, edge / 1.5) * 0.25 + grain((u * length) / 4, row * 3) * 0.1];
        });
    },

    plaster({ base, light, dark }, seed) {
        const blotch = periodicNoise(seed, 4);
        const grain = periodicNoise(seed + 1, 64);

        return (x, y) => {
            const tone = blotch((x / SIZE) * 4, (y / SIZE) * 4) * 0.7 + grain((x / SIZE) * 64, (y / SIZE) * 64) * 0.3;

            return [...(tone < 0.5 ? mix(dark, base, tone * 2) : mix(base, light, (tone - 0.5) * 2)), 0.45 + grain((x / SIZE) * 64, (y / SIZE) * 64) * 0.2 + blotch((x / SIZE) * 4, (y / SIZE) * 4) * 0.1];
        };
    },

    // Straw in courses, each course shaded along its lower edge
    thatch({ base, light, dark }, seed) {
        const random = createRandom(seed);
        const strands = Array.from({ length: SIZE }, () => random.next());
        const wobble = periodicNoise(seed + 1, 8);

        return (x, y) => {
            const course = SIZE / 6;
            const within = (y % course) / course;
            const strand = strands[(Math.floor(x) + Math.floor(y / course) * 17) % SIZE];
            let colour = mix(dark, light, strand * 0.8 + wobble((x / SIZE) * 8, (y / SIZE) * 8) * 0.2);

            colour = mix(colour, base, 0.35);

            const lift = 0.35 + strand * 0.35 + (1 - within) * 0.25;

            return within > 0.72 ? [...mix(colour, dark, (within - 0.72) * 2.4), lift * 0.7] : [...colour, lift];
        };
    },

    // Slates or wooden shingles: rows of small rectangles, each a little different
    slate({ base, light, dark, mortar }, seed) {
        const grain = periodicNoise(seed + 1, 32);

        return courses(seed, 12, [18, 20, 22, 24], (u, v, { shade }, row, length, height) => {
            if (u * length < 1.5 || v * height < 1.5) {
                return [...mortar, 0.1];
            }

            const colour = mix(mix(dark, light, shade * 0.8), base, 0.45);

            // (Each slate thicker towards its lower edge, lying over the next)
            return [...scale(mix(colour, dark, v * 0.35), 0.95 + grain((u * length) / 3, row * 2) * 0.1), 0.35 + v * 0.45 + shade * 0.1];
        });
    },

    // Rounded clay tiles: each tile lit across its curve
    clay({ base, light, dark, mortar }, seed) {
        return courses(seed, 10, [16], (u, v, { shade }, row, length, height) => {
            if (v * height < 1.5) {
                return [...mortar, 0.1];
            }

            const curve = 1 - (u * 2 - 1) ** 2;
            const colour = mix(mix(dark, light, curve * 0.9), base, 0.3 + shade * 0.2);

            return [...mix(colour, dark, v * 0.3), 0.2 + curve * 0.6 + v * 0.15];
        });
    },

    // Upright planks with grain
    planks({ base, light, dark }, seed) {
        const random = createRandom(seed);
        const tones = Array.from({ length: 16 }, () => random.next());
        const grain = periodicNoise(seed + 1, 32);

        return (x, y) => {
            const plank = Math.floor(x / 16);

            if (x % 16 < 1.5) {
                return [...dark, 0.1];
            }

            const streak = grain((x / SIZE) * 32, (y / SIZE) * 4);

            return [...mix(mix(dark, light, tones[plank] * 0.6 + streak * 0.4), base, 0.35), 0.6 + streak * 0.2];
        };
    },

    // Rounded cobbles with dark gaps
    cobbles({ base, light, dark, mortar }, seed) {
        const random = createRandom(seed);
        const cells = 10;
        const size = SIZE / cells;
        const points = Array.from({ length: cells * cells }, () => ({ x: random.next(), y: random.next(), shade: random.next() }));

        return (x, y) => {
            const cx = Math.floor(x / size);
            const cy = Math.floor(y / size);
            let nearest = Infinity;
            let second = Infinity;
            let shade = 0;

            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const gx = cx + dx;
                    const gy = cy + dy;
                    const point = points[((gy + cells) % cells) * cells + ((gx + cells) % cells)];
                    const px = (gx + 0.2 + point.x * 0.6) * size;
                    const py = (gy + 0.2 + point.y * 0.6) * size;
                    const distance = Math.hypot(x - px, y - py);

                    if (distance < nearest) {
                        second = nearest;
                        nearest = distance;
                        shade = point.shade;
                    } else if (distance < second) {
                        second = distance;
                    }
                }
            }

            const edge = second - nearest;

            if (edge < 1.6) {
                return [...mortar, 0.1];
            }

            const round = Math.min(1, edge / 6);

            return [...mix(mix(dark, light, shade * 0.7), base, 0.3 + round * 0.2).map((channel) => channel * (0.8 + round * 0.25)), 0.3 + round * 0.6];
        };
    },

    // Squared timber: grain running along it (across the texture), in streaks and knots, with
    // checks (splits) here and there
    grain({ base, light, dark }, seed) {
        const streaks = periodicNoise(seed, 32);
        const wave = periodicNoise(seed + 1, 8);
        const random = createRandom(seed + 2);
        const checks = Array.from({ length: 10 }, () => ({ y: random.next() * SIZE, x: random.next() * SIZE, length: 20 + random.next() * 40 }));

        return (x, y) => {
            const bend = wave((x / SIZE) * 8, (y / SIZE) * 8) * 6;
            const line = streaks((x / SIZE) * 2, ((y + bend) / SIZE) * 32);
            let colour = mix(dark, light, line * 0.7);
            let lift = 0.55 + line * 0.25;

            for (const check of checks) {
                const along = (((x - check.x) % SIZE) + SIZE) % SIZE;

                if (along < check.length && Math.abs(y - check.y) < 0.8) {
                    colour = scale(dark, 0.7);
                    lift = 0.15;
                }
            }

            return [...mix(colour, base, 0.4), lift];
        };
    },

    // Leaded glass: small diamond panes in lead cames, each pane a little different
    leaded({ base, light, dark }, seed) {
        const random = createRandom(seed);
        const panes = Array.from({ length: 64 }, () => random.next());
        const across = 8;

        return (x, y) => {
            // Diamonds: the pane's place in a lattice turned 45 degrees
            const [p, q] = [((x + y) / SIZE) * across, ((x - y + SIZE) / SIZE) * across];
            const [fp, fq] = [p - Math.floor(p), q - Math.floor(q)];
            const came = Math.min(fp, 1 - fp, fq, 1 - fq);

            if (came < 0.07) {
                return [...dark, 0.8];
            }

            const pane = panes[(Math.floor(p) * 7 + Math.floor(q) * 13) % panes.length];
            const glint = Math.max(0, 1 - Math.hypot(fp - 0.3, fq - 0.3) * 2.5);

            return [...mix(mix(base, light, pane * 0.4), light, glint * 0.5), 0.3];
        };
    },

    // Bare earth: soft blotches and pebbles
    earth({ base, light, dark }, seed) {
        const blotch = periodicNoise(seed, 6);
        const grain = periodicNoise(seed + 1, 64);
        const random = createRandom(seed + 2);
        const pebbles = Array.from({ length: 40 }, () => ({ x: random.next() * SIZE, y: random.next() * SIZE, r: 1 + random.next() * 1.8 }));

        return (x, y) => {
            for (const pebble of pebbles) {
                const dx = Math.abs(x - pebble.x);
                const dy = Math.abs(y - pebble.y);

                if (Math.hypot(Math.min(dx, SIZE - dx), Math.min(dy, SIZE - dy)) < pebble.r) {
                    return [...light, 0.8];
                }
            }

            const tone = blotch((x / SIZE) * 6, (y / SIZE) * 6) * 0.6 + grain((x / SIZE) * 64, (y / SIZE) * 64) * 0.4;

            return tone < 0.5 ? mix(dark, base, tone * 2) : mix(base, light, (tone - 0.5) * 1.2);
        };
    },

    // Grass: soft patches of lighter and darker green, speckled with blades
    grass({ base, light, dark }, seed) {
        const patches = periodicNoise(seed, 4);
        const tufts = periodicNoise(seed + 1, 24);
        const blades = periodicNoise(seed + 2, 128);

        return (x, y) => {
            const tone = patches((x / SIZE) * 4, (y / SIZE) * 4) * 0.5 + tufts((x / SIZE) * 24, (y / SIZE) * 24) * 0.3 + blades((x / SIZE) * 128, (y / SIZE) * 128) * 0.2;

            return tone < 0.5 ? mix(dark, base, tone * 2) : mix(base, light, (tone - 0.5) * 2);
        };
    },

    // Each people's homeland underfoot (the ground's own: drawn by the ground's shader, not the
    // atlas). The cat folk's: pale gold grass in dry tussocks, red laterite showing between them
    savannah({ base, light, dark, mortar }, seed) {
        const patches = periodicNoise(seed, 4);
        const tussocks = periodicNoise(seed + 1, 16);
        const blades = periodicNoise(seed + 2, 128);

        return (x, y) => {
            const [u, v] = [x / SIZE, y / SIZE];
            const bare = patches(u * 4, v * 4) * 0.6 + tussocks(u * 16, v * 16) * 0.4;
            const tone = blades(u * 128, v * 128) * 0.6 + tussocks(u * 16, v * 16) * 0.4;
            const grass = tone < 0.5 ? mix(dark, base, tone * 2) : mix(base, light, (tone - 0.5) * 2);

            return bare > 0.55 ? mix(grass, scale(mortar, 0.9 + blades(u * 128, v * 128) * 0.2), Math.min(1, (bare - 0.55) * 5)) : grass;
        };
    },

    // The orcs': red clay baked hard and cracked into plates, black grit and ash between them
    cracked({ base, light, dark, mortar }, seed) {
        const blotch = periodicNoise(seed, 4);
        const plates = periodicNoise(seed + 1, 10);
        const grit = periodicNoise(seed + 2, 96);

        return (x, y) => {
            const [u, v] = [x / SIZE, y / SIZE];
            const edge = Math.abs(plates(u * 10, v * 10) - 0.5);
            const tone = blotch(u * 4, v * 4) * 0.6 + grit(u * 96, v * 96) * 0.4;
            let colour = tone < 0.5 ? mix(dark, base, tone * 2) : mix(base, light, (tone - 0.5) * 2);

            if (edge < 0.018) {
                colour = scale(mortar, 0.8);
            } else if (edge < 0.04) {
                colour = scale(colour, 0.75);
            } else if (grit(u * 96, v * 96) > 0.82) {
                colour = mix(colour, mortar, 0.7);
            }

            return colour;
        };
    },

    // The lizard folk's: black mud, wet and shining in its hollows, moss spreading over it
    mire({ base, light, dark, mortar }, seed) {
        const moss = periodicNoise(seed, 5);
        const lumps = periodicNoise(seed + 1, 20);
        const fine = periodicNoise(seed + 2, 96);

        return (x, y) => {
            const [u, v] = [x / SIZE, y / SIZE];
            const green = moss(u * 5, v * 5) * 0.7 + lumps(u * 20, v * 20) * 0.3;
            const mud = mix(dark, mortar, lumps(u * 20, v * 20) * 0.5 + fine(u * 96, v * 96) * 0.3);
            const growth = mix(base, light, fine(u * 96, v * 96));
            const wet = lumps(u * 20, v * 20) < 0.28 ? 0.35 : 0;

            return mix(mix(mud, growth, Math.max(0, Math.min(1, (green - 0.42) * 4))), light, wet * 0.3);
        };
    },

    // The elves': deep moss and clover, fallen gold leaves and white blossom in it
    moss({ base, light, dark, mortar }, seed) {
        const patches = periodicNoise(seed, 4);
        const clumps = periodicNoise(seed + 1, 24);
        const fine = periodicNoise(seed + 2, 128);
        const fall = periodicNoise(seed + 3, 48);

        return (x, y) => {
            const [u, v] = [x / SIZE, y / SIZE];
            const tone = patches(u * 4, v * 4) * 0.45 + clumps(u * 24, v * 24) * 0.35 + fine(u * 128, v * 128) * 0.2;
            let colour = tone < 0.5 ? mix(dark, base, tone * 2) : mix(base, light, (tone - 0.5) * 2);
            const leaf = fall(u * 48, v * 48);

            if (leaf > 0.8) {
                colour = mix(colour, mortar, Math.min(1, (leaf - 0.8) * 8));
            } else if (fine(u * 128, v * 128) > 0.86) {
                colour = mix(colour, [240, 240, 232], 0.7);
            }

            return colour;
        };
    },

    // The dark elves': black loam under dead leaves gone grey and violet, and ash
    litter({ base, light, dark, mortar }, seed) {
        const patches = periodicNoise(seed, 4);
        const leaves = periodicNoise(seed + 1, 32);
        const fine = periodicNoise(seed + 2, 128);

        return (x, y) => {
            const [u, v] = [x / SIZE, y / SIZE];
            const tone = patches(u * 4, v * 4) * 0.5 + leaves(u * 32, v * 32) * 0.3 + fine(u * 128, v * 128) * 0.2;
            let colour = tone < 0.5 ? mix(dark, base, tone * 2) : mix(base, light, (tone - 0.5) * 2);

            if (leaves(u * 32, v * 32) > 0.78) {
                colour = mix(colour, mortar, 0.4);
            }

            return colour;
        };
    },

    // Natural rock: broad faces, each a shade of its own, their edges wavering; bedding layers
    // running across it (along the picture: up a cliff, the way it's laid), broad blotches and a
    // fine grain; long cracks along some of the faces' edges (broken off here and there, some
    // deep, some barely there), and pale flecks (crystals, lichen)
    rock({ base, light, dark }, seed) {
        const blotch = periodicNoise(seed, 4);
        const grain = periodicNoise(seed + 1, 48);
        const warp = periodicNoise(seed + 2, 6);
        const flecks = periodicNoise(seed + 3, 96);
        const faces = periodicPlates(seed + 4, 3);
        const chips = periodicPlates(seed + 5, 7);

        return (x, y) => {
            const [u, v] = [x / SIZE, y / SIZE];
            const [wu, wv] = [warp(u * 6, v * 6) - 0.5, warp(u * 6 + 3, v * 6 + 3) - 0.5];
            const face = faces(u * 3 + wu * 0.25, v * 3 + wv * 0.25);
            const chip = chips(u * 7 + wv * 0.35, v * 7 + wu * 0.35);
            const bedding = Math.sin((v * 9 + wu * 1.2) * Math.PI * 2) * 0.5 + Math.sin((v * 23 + wv * 2) * Math.PI * 2) * 0.25;
            const fine = grain(u * 48, v * 48);
            const tone = blotch(u * 4, v * 4) * 0.5 + fine * 0.3 + (hashed(face.plate) - 0.5) * 0.28 + bedding * 0.14 + 0.1;
            let colour = tone < 0.5 ? mix(dark, base, Math.max(0, tone) * 2) : mix(base, light, Math.min(1, (tone - 0.5) * 2));
            let lift = 0.45 + fine * 0.25 + blotch(u * 4, v * 4) * 0.15 + bedding * 0.05;

            // (Only some of the faces' edges cracked, each its own depth and broken off along its
            // length; finer cracks fainter still)
            const strength = hashed(face.plate, face.beside);
            const along = warp(u * 18, v * 18);
            const deep = strength > 0.45 && along > 0.32 ? Math.max(0, 1 - face.edge / (0.03 + 0.05 * strength)) * (strength - 0.3) * 1.3 : 0;
            const fineStrength = hashed(chip.plate, chip.beside);
            const split = fineStrength > 0.6 && along < 0.62 ? Math.max(0, 1 - chip.edge / 0.04) * 0.35 : 0;

            colour = mix(colour, scale(dark, 0.6), Math.min(1, deep + split));
            lift -= deep * 0.35 + split * 0.15;

            if (deep + split < 0.05 && flecks(u * 96, v * 96) > 0.85) {
                colour = mix(colour, light, 0.5);
                lift += 0.08;
            }

            return [...colour, lift];
        };
    },

    // Bark: deep fissures running up it, ridges between them broken into plates
    bark({ base, light, dark }, seed) {
        const ridges = periodicNoise(seed, 12);
        const plates = periodicNoise(seed + 1, 8);
        const grain = periodicNoise(seed + 2, 64);

        return (x, y) => {
            const [u, v] = [x / SIZE, y / SIZE];
            const ridge = ridges(u * 12 + plates(u * 8, v * 8) * 1.5, v * 3);
            const fissure = ridge < 0.35 ? 1 - ridge / 0.35 : 0;
            const colour = mix(mix(base, light, grain(u * 64, v * 16) * 0.6), dark, fissure * 0.85);

            return [...colour, 0.75 - fissure * 0.6 + grain(u * 64, v * 16) * 0.1];
        };
    },

    // Ploughed soil: furrows running east to west
    soil({ base, light, dark }, seed) {
        const grain = periodicNoise(seed, 64);

        return (x, y) => {
            const furrow = (y % 16) / 16;
            const ridge = 1 - Math.abs(furrow * 2 - 1);
            const colour = mix(dark, light, ridge * 0.8 + grain((x / SIZE) * 64, (y / SIZE) * 64) * 0.2);

            return [...mix(colour, base, 0.3), 0.3 + ridge * 0.5];
        };
    },

    // Mud plaster (banco), hand-smoothed: soft blotches, the sweep of the plasterers' palms,
    // streaks where the rain has run down it, and fine cracks
    banco({ base, light, dark }, seed) {
        const blotch = periodicNoise(seed, 4);
        const grain = periodicNoise(seed + 1, 64);
        const palms = periodicNoise(seed + 2, 16);
        const streaks = periodicNoise(seed + 3, 24);
        const cracks = periodicNoise(seed + 4, 8);

        return (x, y) => {
            const [u, v] = [x / SIZE, y / SIZE];
            // (Soft patches where each handful was smoothed on)
            const palm = palms(u * 16, v * 16);
            const rain = Math.max(0, streaks(u * 24, v * 1.5) - 0.64) * 1.3;
            const tone = blotch(u * 4, v * 4) * 0.5 + palm * 0.3 + grain(u * 64, v * 64) * 0.2;
            let colour = tone < 0.5 ? mix(dark, base, 0.35 + tone * 1.3) : mix(base, light, Math.min(1, (tone - 0.5) * 1.6));
            let lift = 0.5 + grain(u * 64, v * 64) * 0.12 + palm * 0.18;

            colour = mix(colour, dark, rain);

            // (A hairline crack here and there)
            if (Math.abs(cracks(u * 8, v * 8) - 0.5) < 0.006 && blotch(u * 4 + 2, v * 4 + 1) > 0.7) {
                colour = mix(colour, dark, 0.6);
                lift = 0.3;
            }

            return [...colour, lift];
        };
    },

    // Woven grass or palm mats: strands over and under in a basket weave, each shaded across
    // its width
    matting({ base, light, dark }, seed) {
        const random = createRandom(seed);
        const tones = Array.from({ length: 64 }, () => random.next());
        const cell = SIZE / 16;

        return (x, y) => {
            const [i, j] = [Math.floor(x / cell), Math.floor(y / cell)];
            const across = (Math.floor(i / 2) + Math.floor(j / 2)) % 2 === 0;
            const t = across ? (y % cell) / cell : (x % cell) / cell;
            const strand = tones[((across ? j : i) * 7 + Math.floor((across ? i : j) / 2) * 3) % tones.length];
            const round = 1 - (t * 2 - 1) ** 2;
            const colour = mix(mix(dark, light, strand * 0.7 + round * 0.3), base, 0.3);

            return [...scale(colour, 0.75 + round * 0.3), 0.25 + round * 0.6];
        };
    },

    // Dry stone and rough-cut blocks: irregular stones laid in rough courses (wider than they
    // are tall), deep joints, each stone its own shade, lit on its upper edge
    rubble({ base, light, dark, mortar }, seed) {
        const random = createRandom(seed);
        const [across, down] = [7, 11];
        const [cw, ch] = [SIZE / across, SIZE / down];
        const points = Array.from({ length: across * down }, () => ({ x: random.next(), y: random.next(), shade: random.next() }));
        const grain = periodicNoise(seed + 1, 32);

        return (x, y) => {
            const [cx, cy] = [Math.floor(x / cw), Math.floor(y / ch)];
            let [nearest, second, shade, above] = [Infinity, Infinity, 0, 0];

            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const [gx, gy] = [cx + dx, cy + dy];
                    const point = points[((gy + down) % down) * across + ((gx + across) % across)];
                    const [px, py] = [(gx + 0.15 + point.x * 0.7) * cw, (gy + 0.25 + point.y * 0.5) * ch];
                    // (Squarer than round: the stones are split, not rolled)
                    const distance = Math.max(Math.abs(x - px) / cw, Math.abs(y - py) / ch) * 0.7 + Math.hypot((x - px) / cw, (y - py) / ch) * 0.3;

                    if (distance < nearest) {
                        [second, nearest, shade, above] = [nearest, distance, point.shade, y - py];
                    } else if (distance < second) {
                        second = distance;
                    }
                }
            }

            const edge = second - nearest;

            if (edge < 0.07) {
                return [...mortar, 0.08];
            }

            const round = Math.min(1, edge / 0.25);
            const lit = above < 0 ? 0.15 * round : 0;
            const colour = mix(mix(dark, light, shade * 0.75 + lit), base, 0.25);

            return [...scale(colour, 0.78 + round * 0.22 + grain((x / SIZE) * 32, (y / SIZE) * 32) * 0.1), 0.35 + round * 0.55];
        };
    },

    // Hides stitched together: big panels, mottled and creased, joined by darker seams with
    // the stitches across them
    hide({ base, light, dark, mortar }, seed) {
        const random = createRandom(seed);
        const mottle = periodicNoise(seed, 6);
        const creases = periodicNoise(seed + 1, 16);
        const rows = [0, ...Array.from({ length: 2 }, (_, k) => Math.round(((k + 1) * SIZE) / 3 + random.range(-6, 6)))];
        const offsets = rows.map(() => random.next() * SIZE);

        return (x, y) => {
            const row = rows.findLastIndex((top) => y >= top);
            const [top, bottom] = [rows[row], rows[row + 1] ?? SIZE];
            const along = (x + offsets[row]) % (SIZE / 2);
            const seamH = Math.min(y - top, bottom - y);
            const seamV = Math.min(along, SIZE / 2 - along);
            const seam = Math.min(seamH, seamV);
            const tone = mottle((x / SIZE) * 6, (y / SIZE) * 6) * 0.7 + creases((x / SIZE) * 16, (y / SIZE) * 16) * 0.3;
            const colour = tone < 0.5 ? mix(dark, base, tone * 2) : mix(base, light, (tone - 0.5) * 2);

            if (seam < 1.4) {
                return [...mortar, 0.15];
            }

            // (Stitches every few pixels across each seam)
            if (seam < 3.2 && ((seamH < seamV ? x : y) % 5) < 1.6) {
                return [...mix(mortar, light, 0.35), 0.7];
            }

            return [...colour, 0.45 + Math.min(1, seam / 10) * 0.3 + creases((x / SIZE) * 16, (y / SIZE) * 16) * 0.15];
        };
    },

    // Iron plates riveted together, rust running down from the rivets
    plates({ base, light, dark, mortar }, seed) {
        const blotch = periodicNoise(seed + 1, 8);
        const streaks = periodicNoise(seed + 2, 32);

        return courses(seed, 4, [48, 64, 80], (u, v, { shade }, row, length, height) => {
            const [px, py] = [u * length, v * height];

            if (px < 1.5 || py < 1.5) {
                return [...scale(dark, 0.7), 0.1];
            }

            // (Rivets along the plate's edges)
            const nearEdge = Math.min(px, length - px, py, height - py);
            const step = 8;
            const [rx, ry] = [px < 5 || length - px < 5 ? (px < 5 ? 4 : length - 4) : Math.round(px / step) * step, py < 5 || height - py < 5 ? (py < 5 ? 4 : height - 4) : Math.round(py / step) * step];

            if (nearEdge < 6 && Math.hypot(px - rx, py - ry) < 1.8) {
                return [...light, 0.95];
            }

            const rust = Math.max(0, streaks(((u * length) / SIZE) * 32 + row * 5, v * 3) - 0.55) * 2 + Math.max(0, blotch(u * 2 + row, v * 2) - 0.6) * 1.5;
            const colour = mix(mix(mix(dark, light, 0.25 + shade * 0.3), base, 0.3), mortar, Math.min(0.8, rust));

            return [...colour, 0.55 - rust * 0.15];
        });
    },

    // Palm-frond thatch: rows of fronds laid over each other, their leaflets slanting down from
    // the midrib, each row's lower edge in shadow
    palm({ base, light, dark }, seed) {
        const random = createRandom(seed);
        const tones = Array.from({ length: 64 }, () => random.next());
        const wobble = periodicNoise(seed + 1, 8);

        return (x, y) => {
            const course = SIZE / 8;
            const row = Math.floor(y / course);
            const within = (y % course) / course;
            const frond = SIZE / 8;
            const shift = (row % 2) * (frond / 2);
            const across = ((x + shift) % frond) / frond;
            // (Leaflets slanting away from the midrib either side)
            const slant = (across < 0.5 ? across : 1 - across) * 1.6 + within;
            const leaflet = (slant * 9 + wobble((x / SIZE) * 8, (y / SIZE) * 8)) % 1;
            const tone = tones[(Math.floor((x + shift) / frond) + row * 5) % tones.length];
            let colour = mix(mix(dark, light, tone * 0.6 + leaflet * 0.4), base, 0.3);

            if (Math.abs(across - 0.5) < 0.04) {
                colour = mix(colour, dark, 0.5);
            }

            const lift = 0.35 + leaflet * 0.3 + (1 - within) * 0.25;

            return within > 0.8 ? [...mix(colour, dark, (within - 0.8) * 3), lift * 0.6] : [...colour, lift];
        };
    },

    // Reeds standing side by side, bound in bundles by darker lashings
    reeds({ base, light, dark, mortar }, seed) {
        const random = createRandom(seed);
        const stalks = [];

        for (let x = 0; x < SIZE;) {
            const width = 2 + Math.floor(random.next() * 3);

            stalks.push({ from: x, width, shade: random.next() });
            x += width;
        }

        const grain = periodicNoise(seed + 1, 64);

        return (x, y) => {
            const stalk = stalks.find(({ from, width }) => x >= from && x < from + width) ?? stalks.at(-1);
            const t = (x - stalk.from) / stalk.width;
            const round = 1 - (t * 2 - 1) ** 2;

            // (A lashing across every third of the way)
            if ((y % (SIZE / 3)) < 3.5) {
                return [...mix(mortar, dark, round * 0.3), 0.8];
            }

            const colour = mix(mix(dark, light, stalk.shade * 0.6 + round * 0.4), base, 0.3);

            return [...scale(colour, 0.9 + grain((x / SIZE) * 4, (y / SIZE) * 64) * 0.15), 0.3 + round * 0.55];
        };
    },

    // Bamboo culms side by side, rounded across, ringed at their nodes
    bamboo({ base, light, dark }, seed) {
        const random = createRandom(seed);
        const culms = Array.from({ length: 8 }, () => ({ node: random.next() * SIZE, shade: random.next() }));
        const width = SIZE / culms.length;

        return (x, y) => {
            const culm = culms[Math.floor(x / width)];
            const t = (x % width) / width;
            const round = 1 - (t * 2 - 1) ** 2;
            const spacing = SIZE / 2;
            const fromNode = Math.abs((((y - culm.node) % spacing) + spacing) % spacing - spacing / 2);

            if (t < 0.06 || t > 0.94) {
                return [...scale(dark, 0.6), 0.1];
            }

            let colour = mix(mix(dark, light, culm.shade * 0.4 + round * 0.6), base, 0.3);

            if (fromNode > spacing / 2 - 2.5) {
                colour = mix(colour, dark, 0.45);

                return [...colour, 0.85];
            }

            return [...colour, 0.3 + round * 0.55];
        };
    },

    // Carved stone: squared blocks, each carved with a glyph (a stepped fret, a spiral, rings,
    // a face of dots) cut into its face
    glyphs({ base, light, dark, mortar }, seed) {
        const grain = periodicNoise(seed + 1, 32);

        return courses(seed, 4, [32], (u, v, { shade, index }, row, length, height) => {
            const [px, py] = [u * length, v * height];

            if (px < 1.8 || py < 1.8) {
                return [...mortar, 0.1];
            }

            const [cu, cv] = [u * 2 - 1, v * 2 - 1];
            const kind = (index + row * 3) % 4;
            const r = Math.hypot(cu, cv);
            let cut = false;

            if (Math.max(Math.abs(cu), Math.abs(cv)) > 0.78 && Math.max(Math.abs(cu), Math.abs(cv)) < 0.88) {
                cut = true;
            } else if (kind === 0) {
                // A stepped fret: a hooked spiral in squares
                const [qx, qy] = [Math.floor((cu + 1) * 3), Math.floor((cv + 1) * 3)];

                cut = (qx === 1 && qy >= 1 && qy <= 4) || (qy === 4 && qx >= 1 && qx <= 4) || (qx === 4 && qy >= 2 && qy <= 4) || (qy === 2 && qx >= 3 && qx <= 4);
            } else if (kind === 1) {
                cut = Math.abs(r - 0.55) < 0.08 || Math.abs(r - 0.25) < 0.08;
            } else if (kind === 2) {
                // A stepped mountain (a temple), a sun over it
                const step = Math.floor((cv + 1) * 4);

                cut = (cv > -0.1 && Math.abs(cu) < 0.6 - (3 - Math.min(3, step)) * 0.15 && Math.abs(cu) > 0.5 - (3 - Math.min(3, step)) * 0.15 - 0.1) || (step >= 3 && cv > 0.55 && Math.abs(cu) < 0.6) || Math.hypot(cu, cv + 0.5) < 0.16;
            } else {
                const angle = Math.atan2(cv, cu);

                cut = Math.abs(((r * 4 - angle / Math.PI + 4) % 1) - 0.5) < 0.12 && r < 0.7;
            }

            const colour = mix(mix(dark, light, 0.35 + shade * 0.4), base, 0.35);

            return cut ? [...scale(colour, 0.62), 0.15] : [...scale(colour, 0.94 + grain(u * 3 + index, v * 3) * 0.12), 0.7];
        });
    },

    // Pale stone smoothed to a sheen: soft clouding and thin veins wandering across it
    marble({ base, light, dark, mortar }, seed) {
        const cloud = periodicNoise(seed, 4);
        const vein = periodicNoise(seed + 1, 6);
        const fine = periodicNoise(seed + 2, 16);

        return (x, y) => {
            const [u, v] = [x / SIZE, y / SIZE];
            const tone = cloud(u * 4, v * 4) * 0.7 + fine(u * 16, v * 16) * 0.3;
            const line = Math.abs(vein(u * 6 + fine(u * 16, v * 16) * 0.6, v * 6) - 0.5);
            let colour = tone < 0.5 ? mix(dark, base, 0.4 + tone * 1.2) : mix(base, light, (tone - 0.5) * 2);

            if (line < 0.012 && cloud(u * 4 + 1, v * 4 + 3) > 0.45) {
                colour = mix(colour, mortar, (1 - line / 0.012) * 0.7);
            }

            return [...colour, 0.55 + tone * 0.1];
        };
    },

    // Leaf shingles: rows of pointed leaves laid over each other like scales, a vein down each
    leafscale({ base, light, dark }, seed) {
        const random = createRandom(seed);
        const tones = Array.from({ length: 64 }, () => random.next());
        const rows = 8;
        const [w, h] = [SIZE / 8, SIZE / rows];

        return (x, y) => {
            const row = Math.floor(y / h);
            const shift = (row % 2) * (w / 2);
            const col = Math.floor((x + shift) / w);
            const [u, v] = [((x + shift) % w) / w, (y % h) / h];
            // (Each leaf hangs from the row above: widest a third of the way down, pointed at
            // its foot, the next row's leaves over its top)
            const half = 0.5 * Math.sin(Math.PI * Math.min(1, v * 1.05)) ** 0.7;
            const inside = Math.abs(u - 0.5) < half;
            const tone = tones[(col * 7 + row * 13) % tones.length];

            if (!inside) {
                return [...scale(dark, 0.7), 0.2];
            }

            let colour = mix(mix(dark, light, tone * 0.5 + (1 - v) * 0.3), base, 0.35);

            if (Math.abs(u - 0.5) < 0.03) {
                colour = mix(colour, light, 0.35);
            }

            const edge = half - Math.abs(u - 0.5);

            return [...colour, 0.35 + v * 0.35 + Math.min(1, edge * 6) * 0.2];
        };
    },

    // Obsidian: glassy black, bands of sheen across it and the ripples of its breaks
    obsidian({ base, light, dark }, seed) {
        const bands = periodicNoise(seed, 3);
        const ripple = periodicNoise(seed + 1, 8);

        return (x, y) => {
            const [u, v] = [x / SIZE, y / SIZE];
            const band = Math.max(0, Math.sin((u * 2 + v * 3 + bands(u * 3, v * 3) * 1.5) * Math.PI * 2)) ** 6;
            const rings = Math.abs(Math.sin(ripple(u * 8, v * 8) * 18)) ** 8;
            const colour = mix(mix(dark, base, 0.5 + bands(u * 3, v * 3) * 0.5), light, band * 0.55 + rings * 0.12);

            return [...colour, 0.5 + rings * 0.2];
        };
    },
};

// Colours for each material, and how many world pixels one copy of its texture covers (five to a
// metre: stone courses are 35 centimetres, bricks 10, slates 15, thatch 33). The ground's own
// (`ground`) are drawn on the ground, not built with, so the atlas leaves them out.
export const MATERIALS = {
    stone: { painter: "ashlar", world: 14, base: 0x8f8c86, light: 0xb4b0a6, dark: 0x6c6964, mortar: 0x57544f },
    "stone-warm": { painter: "ashlar", world: 14, base: 0xa89878, light: 0xc8b996, dark: 0x847359, mortar: 0x645846 },
    "stone-dark": { painter: "ashlar", world: 14, base: 0x6f6e70, light: 0x8e8c8c, dark: 0x535257, mortar: 0x403f43 },
    // (Old stone, the ruins': each people's own gone dark and green, and the rubble core broken
    // walls show where they're broken; atlas.js AGED: moss and streaks over them)
    "stone-old": { painter: "coursed", world: OLD_STONE.metres * 5, base: 0x5e625a, light: 0x7c8073, dark: 0x43463f, mortar: 0x24271f, old: true },
    "stone-moon-old": { painter: "coursed", world: OLD_STONE.metres * 5, base: 0xa9aa9c, light: 0xc4c5b6, dark: 0x85877a, mortar: 0x3c3e36, old: true },
    "stone-black-old": { painter: "coursed", world: OLD_STONE.metres * 5, base: 0x34343a, light: 0x4a4a50, dark: 0x25252b, mortar: 0x121314, old: true },
    "stone-lime-old": { painter: "coursed", world: OLD_STONE.metres * 5, base: 0xa6a184, light: 0xc0bb9c, dark: 0x837f66, mortar: 0x3f3e30, old: true },
    "rubble-old": { painter: "rubble", world: 20, base: 0x55584f, light: 0x6f7266, dark: 0x3c3e37, mortar: 0x1f211b, old: true },
    brick: { painter: "brick", world: 5, base: 0x9a4e38, light: 0xb4654a, dark: 0x733627, mortar: 0xb3a792 },
    "brick-brown": { painter: "brick", world: 5, base: 0x80533a, light: 0x9c6a4c, dark: 0x5f3b29, mortar: 0xa89d8a },
    plaster: { painter: "plaster", world: 30, base: 0xe4dac0, light: 0xf1eadb, dark: 0xcdbf9f },
    "plaster-white": { painter: "plaster", world: 30, base: 0xe8e6de, light: 0xf6f4ef, dark: 0xcfcbc0 },
    "plaster-ochre": { painter: "plaster", world: 30, base: 0xd9b77a, light: 0xe8cc96, dark: 0xbf9b5e },
    "plaster-rose": { painter: "plaster", world: 30, base: 0xd7ad98, light: 0xe6c4b3, dark: 0xbd9079 },
    thatch: { painter: "thatch", world: 10, base: 0xc2a15a, light: 0xdcc17a, dark: 0x8c6f37 },
    "thatch-grey": { painter: "thatch", world: 10, base: 0x9d8c66, light: 0xb8a883, dark: 0x6e6147 },
    slate: { painter: "slate", world: 9, base: 0x5a6078, light: 0x7a8199, dark: 0x40445a, mortar: 0x2c2e42 },
    "slate-grey": { painter: "slate", world: 9, base: 0x6c7077, light: 0x898d94, dark: 0x4d5057, mortar: 0x34363b },
    shingles: { painter: "slate", world: 9, base: 0x7a5a40, light: 0x94704f, dark: 0x5a412d, mortar: 0x3d2b1e },
    clay: { painter: "clay", world: 10, base: 0xb0553c, light: 0xcf7552, dark: 0x803726, mortar: 0x5e2a1d },
    "clay-orange": { painter: "clay", world: 10, base: 0xc0703f, light: 0xda8f58, dark: 0x8f4d2a, mortar: 0x6a3a20 },
    planks: { painter: "planks", world: 14, base: 0x7b5a3c, light: 0x9a7552, dark: 0x4a3322 },
    timber: { painter: "grain", world: 16, base: 0x4a3223, light: 0x6a4a33, dark: 0x2e1f16 },
    "timber-light": { painter: "grain", world: 16, base: 0x6b4a32, light: 0x8c6a4c, dark: 0x4a3223 },
    "timber-grey": { painter: "grain", world: 16, base: 0x6e6860, light: 0x8e877c, dark: 0x4c4741 },
    leaded: { painter: "leaded", world: 5, base: 0x3a4a52, light: 0x8fa3a8, dark: 0x2a2a2c },
    "planks-dark": { painter: "planks", world: 14, base: 0x5a3e28, light: 0x70503a, dark: 0x33231a },
    cobbles: { painter: "cobbles", world: 40, base: 0x928c80, light: 0xb3ab9c, dark: 0x6f6a60, mortar: 0x4f4b44 },
    road: { painter: "earth", world: 64, base: 0x9d7f5a, light: 0xb49770, dark: 0x7f6446, ground: true },
    courtyard: { painter: "earth", world: 64, base: 0xa99b80, light: 0xc3b69b, dark: 0x8b7e66, ground: true },
    soil: { painter: "soil", world: 32, base: 0x6e4d33, light: 0x8a6446, dark: 0x4a3222 },
    // The land's own: rocks (grey granite, red sandstone, black basalt, pale limestone), bark, and
    // wood long dead, weathered silver
    rock: { painter: "rock", world: 12, base: 0x86827b, light: 0xaba69c, dark: 0x5b5752 },
    "rock-red": { painter: "rock", world: 12, base: 0x9c6448, light: 0xbd8563, dark: 0x6e412d },
    "rock-dark": { painter: "rock", world: 12, base: 0x3f3d3c, light: 0x5c5957, dark: 0x262424 },
    "rock-pale": { painter: "rock", world: 12, base: 0xb3ad9c, light: 0xd2ccbc, dark: 0x8a8475 },
    bark: { painter: "bark", world: 8, base: 0x5a4636, light: 0x7a6450, dark: 0x2f241b },
    deadwood: { painter: "grain", world: 16, base: 0x756e63, light: 0x958c7c, dark: 0x4a453e },
    grass: { painter: "grass", world: 48, base: 0x62803c, light: 0x86a352, dark: 0x3f5a28, ground: true },
    // Each people's homeland underfoot, over its lands' own ground (world/ground.js)
    "home-cat": { painter: "savannah", world: 40, base: 0xb89a58, light: 0xdcc684, dark: 0x8a6c3a, mortar: 0xa65c3a, ground: true },
    "home-orc": { painter: "cracked", world: 30, base: 0x8e5c3c, light: 0xae7852, dark: 0x5c3a26, mortar: 0x221c1c, ground: true },
    "home-lizard": { painter: "mire", world: 36, base: 0x4e6a30, light: 0x74904a, dark: 0x22241a, mortar: 0x3a3424, ground: true },
    "home-elf": { painter: "moss", world: 36, base: 0x4f8a3e, light: 0x86c060, dark: 0x2c5a26, mortar: 0xd8a83c, ground: true },
    "home-darkElf": { painter: "litter", world: 36, base: 0x3c3642, light: 0x57505e, dark: 0x1a181e, mortar: 0x6a4a8a, ground: true },
    // The other peoples': the cat folk's mud plaster, mats and dry stone; the orcs' hides,
    // basalt and riveted iron; the lizard folk's palm thatch, reeds, bamboo, limestone and its
    // carved friezes, and planks bleached by the sun; the elves' marble and moonstone, leaf
    // shingles, silver bark and honey-coloured heartwood; the dark elves' black stone and
    // obsidian
    mud: { painter: "banco", world: 40, base: 0xb88a5a, light: 0xcfa676, dark: 0x93683f },
    matting: { painter: "matting", world: 12, base: 0xc2a870, light: 0xdcc48c, dark: 0x8e7646 },
    granite: { painter: "rubble", world: 30, base: 0x9a948a, light: 0xbab4a8, dark: 0x6e6962, mortar: 0x4a4640 },
    hide: { painter: "hide", world: 60, base: 0xa87a4e, light: 0xc09264, dark: 0x7a5332, mortar: 0x3e2a1a },
    basalt: { painter: "rubble", world: 30, base: 0x3e3b3e, light: 0x57534f, dark: 0x282629, mortar: 0x1a191b },
    plates: { painter: "plates", world: 30, base: 0x4a4d52, light: 0x6a6e74, dark: 0x2e3034, mortar: 0x8b3a1e },
    palm: { painter: "palm", world: 12, base: 0xb49a5a, light: 0xccb477, dark: 0x7a6638 },
    reeds: { painter: "reeds", world: 16, base: 0xd2bc7a, light: 0xe6d39a, dark: 0xa08c52, mortar: 0x6e5e3e },
    bamboo: { painter: "bamboo", world: 10, base: 0x9c8a50, light: 0xbba968, dark: 0x6e6036 },
    "stone-lime": { painter: "ashlar", world: 14, base: 0xdcd4bc, light: 0xeee8d6, dark: 0xb8af96, mortar: 0x9a927c },
    glyphs: { painter: "glyphs", world: 20, base: 0xd8cfb6, light: 0xece4ce, dark: 0xa89e86, mortar: 0x8a826c },
    "planks-pale": { painter: "planks", world: 14, base: 0x9c8a6e, light: 0xb5a286, dark: 0x6e604c },
    marble: { painter: "marble", world: 80, base: 0xe4e2d8, light: 0xf2f1ea, dark: 0xc4c2b6, mortar: 0xa9a99e },
    "stone-moon": { painter: "ashlar", world: 18, base: 0xdad8cc, light: 0xecebe2, dark: 0xb9b7aa, mortar: 0xa3a195 },
    leafscale: { painter: "leafscale", world: 9, base: 0x86a95e, light: 0x9fbf78, dark: 0x6a8a4a },
    "bark-silver": { painter: "bark", world: 8, base: 0xc4c3b8, light: 0xe2e1d8, dark: 0x5e5d56 },
    heartwood: { painter: "grain", world: 16, base: 0xb08a5a, light: 0xcca878, dark: 0x7e5e3a },
    "stone-black": { painter: "ashlar", world: 14, base: 0x2a2830, light: 0x3c3944, dark: 0x1c1b21, mortar: 0x121116 },
    obsidian: { painter: "obsidian", world: 30, base: 0x121018, light: 0x6e6680, dark: 0x07060a },
};

/**
 * Materials painted as another is, in its colours times a tint ([r, g, b], more than 1 to
 * lighten): drawn from that one's layer of the atlas, so they cost no more painting.
 */
export const TINTS = {
    "mud-pale": { from: "mud", tint: [1.1, 1.1, 1.12] },
    "mud-red": { from: "mud", tint: [0.95, 0.56, 0.5] },
    "mud-dark": { from: "mud", tint: [0.7, 0.62, 0.55] },
    "hide-dark": { from: "hide", tint: [0.56, 0.48, 0.43] },
    "plaster-red": { from: "plaster-white", tint: [0.68, 0.25, 0.18] },
    "plaster-blue": { from: "plaster-white", tint: [0.45, 0.62, 0.7] },
    "plaster-jade": { from: "plaster-white", tint: [0.4, 0.62, 0.5] },
    "leafscale-sage": { from: "leafscale", tint: [1.1, 1.02, 1.3] },
    "leafscale-silver": { from: "leafscale", tint: [1.15, 0.98, 1.6] },
    "leafscale-gold": { from: "leafscale", tint: [1.5, 1.05, 0.6] },
    "timber-char": { from: "timber-grey", tint: [0.26, 0.24, 0.28] },
    "slate-violet": { from: "slate-grey", tint: [0.42, 0.36, 0.46] },
    "planks-char": { from: "planks-dark", tint: [0.24, 0.22, 0.27] },
    "thatch-palm": { from: "thatch", tint: [0.92, 0.9, 0.78] },
    // (Hazel rods woven between stakes: the yards' hurdles)
    wattle: { from: "matting", tint: [0.6, 0.6, 0.68] },
    // (A smithy's floor: beaten earth, black with soot)
    "earth-sooty": { from: "mud", tint: [0.103, 0.095, 0.091] },
};

// Plain colours (no texture): trims, doors, glass, metal
export const COLOURS = {
    glass: 0x2b3444,
    "paint-green": 0x3d5a40,
    "paint-red": 0x7a3a2c,
    "paint-blue": 0x3c5470,
    "paint-ochre": 0x9c7536,
    "paint-cream": 0xd6c9a4,
    flowers: 0xb8465a,
    "flowers-gold": 0xd6a83a,
    leaves: 0x4f7a34,
    "glass-lit": 0x6b6446,
    door: 0x5b3b25,
    iron: 0x3a3a3e,
    shadow: 0x1d1b1a,
    ridge: 0x3f3a36,
    banner: 0x9b2d2d,
    gold: 0xc9a13b,
    water: 0x3e5763,
    sail: 0xd8ccb0,
    awning: 0xa8342a,
    apples: 0xb8322a,
    cabbages: 0x6c9a3a,
    // (The yards' beds: a cabbage's pale blue-green leaves, and a bean's or a squash's)
    cabbage: 0x7f9f74,
    greens: 0x5a8240,
    squash: 0xd9822b,
    bread: 0xc89a5a,
    rope: 0x9c8a62,
    "canvas-sack": 0xb9a67e,
    quinces: 0xe0a526,
    // (Gold and silver shine as metal (atlas.js SHINES): painted, dyed and woven in their colours,
    // these don't)
    "paint-gold": 0xc9a13b,
    "cloth-gold": 0xc9a13b,
    "cloth-saffron": 0xe0a526,
    "cloth-silver": 0xc3c9cb,
    // Insides (interiors3d.js): cloth, wax and candles, pewter and brass, books and parchment
    velvet: 0x7a1826,
    "velvet-purple": 0x4a1f45,
    linen: 0xe9e2cf,
    pewter: 0x8d9194,
    brass: 0xb58f3e,
    candle: 0xf1e7c8,
    soot: 0x151211,
    ale: 0x6b4214,
    rug: 0x8e2a22,
    "rug-border": 0x2e3d5c,
    ledger: 0x3d2a1a,
    wine: 0x5a0f1c,
    "wool-green": 0x46603c,
    "wool-blue": 0x3a4b6e,
    "wool-ochre": 0x9a7434,
    leather: 0x4f3220,
    parchment: 0xe6d6ac,
    "wax-red": 0x9a1c1c,
    "guild-blue": 0x23365e,
    "guild-gold": 0xd6b35a,
    // The other peoples' trims, paints and cloths
    bone: 0xe8dcc0,
    silver: 0xc3c9cb,
    verdigris: 0x5e8c7a,
    "vert-wagon": 0x3a4742,
    jade: 0x3e8b6a,
    "jade-dark": 0x2f6b52,
    "maya-blue": 0x4fa3b3,
    silk: 0xd9d4e6,
    "iron-black": 0x232228,
    rust: 0x8b3a1e,
    "war-red": 0x8e1b1b,
    black: 0x151515,
    indigo: 0x2e3a6b,
    ochre: 0xd9a441,
    kaolin: 0xede4d0,
    laterite: 0xa4462b,
    "sun-gold": 0xe0a526,
    "cloth-violet": 0x4a2d6b,
    "cloth-green": 0x4f7a55,
    "glass-green": 0x2f4a40,
    "glass-violet": 0x241c30,
    egg: 0xe8e0c8,
    "water-green": 0x3f6a5a,
    calabash: 0xc89b4e,
    fur: 0x6b5236,
    "fur-grey": 0x8a8278,
};

// Colours that glow (the forge's coals)
export const GLOWING = {
    embers: { color: 0xff8a3a, emissive: 0xff4a0a, emissiveIntensity: 1.6 },
};

/**
 * Light that isn't lit (lamps, faerie fire, moonwell water, lava, a hearth's glow, windows lit
 * from within): drawn in its own colour whatever the light, all of them with one material
 * (atlas.js glowMaterial), each face's colour its own.
 */
export const GLOWS = {
    "glow-violet": 0xb98fff,
    "glow-deep": 0x7b4dff,
    "glow-blue": 0x5a8cff,
    "glow-green": 0x6dff9e,
    "glow-moon": 0x9fe6e4,
    "glow-lamp": 0xffe2a0,
    "glow-fire": 0xff8a3c,
    "glow-lava": 0xff6a1a,
    "glow-hearth": 0xff9a4a,
    "glow-gold": 0xffd36a,
};

// A textured material's painter, with its colours and seed
export function painterOf(name) {
    const spec = MATERIALS[name];
    const colours = Object.fromEntries(["base", "light", "dark", "mortar"].map((key) => [key, hex(spec[key] ?? spec.dark)]));
    const seed = [...name].reduce((total, character) => total * 31 + character.charCodeAt(0), 7) >>> 0;

    return PAINTERS[spec.painter](colours, seed);
}

/**
 * A textured material painted `size` pixels square for the atlas (atlas.js), the painter's
 * pattern sampled between its own pixels: RGBA bytes, row by row from the top, the colour in
 * RGB and how high each pixel stands in A.
 */
export function paintLayer(name, size) {
    const paint = painterOf(name);
    const data = new Uint8Array(size * size * 4);
    const step = SIZE / size;

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const [r, g, b, h = 0.5] = paint((x + 0.5) * step, (y + 0.5) * step);
            const i = (y * size + x) * 4;

            data[i] = r;
            data[i + 1] = g;
            data[i + 2] = b;
            data[i + 3] = Math.max(0, Math.min(255, Math.round(h * 255)));
        }
    }

    return data;
}
