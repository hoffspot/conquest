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

    // Natural rock: broad blotches and a fine grain, dark cracks wandering across it, and pale
    // flecks (crystals, lichen) here and there
    rock({ base, light, dark }, seed) {
        const blotch = periodicNoise(seed, 4);
        const grain = periodicNoise(seed + 1, 48);
        const veins = periodicNoise(seed + 2, 6);
        const flecks = periodicNoise(seed + 3, 96);

        return (x, y) => {
            const [u, v] = [x / SIZE, y / SIZE];
            const tone = blotch(u * 4, v * 4) * 0.55 + grain(u * 48, v * 48) * 0.45;
            const crack = Math.abs(veins(u * 6, v * 6) - 0.5);
            let colour = tone < 0.5 ? mix(dark, base, tone * 2) : mix(base, light, (tone - 0.5) * 2);
            let lift = 0.45 + grain(u * 48, v * 48) * 0.3 + blotch(u * 4, v * 4) * 0.15;

            if (crack < 0.018) {
                colour = scale(dark, 0.62);
                lift = 0.1;
            } else if (flecks(u * 96, v * 96) > 0.83) {
                colour = mix(colour, light, 0.6);
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
};

// Colours for each material, and how many world pixels one copy of its texture covers (five to a
// metre: stone courses are 35 centimetres, bricks 10, slates 15, thatch 33). The ground's own
// (`ground`) are drawn on the ground, not built with, so the atlas leaves them out.
export const MATERIALS = {
    stone: { painter: "ashlar", world: 14, base: 0x8f8c86, light: 0xb4b0a6, dark: 0x6c6964, mortar: 0x57544f },
    "stone-warm": { painter: "ashlar", world: 14, base: 0xa89878, light: 0xc8b996, dark: 0x847359, mortar: 0x645846 },
    "stone-dark": { painter: "ashlar", world: 14, base: 0x6f6e70, light: 0x8e8c8c, dark: 0x535257, mortar: 0x403f43 },
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
    squash: 0xd9822b,
    bread: 0xc89a5a,
    rope: 0x9c8a62,
    "canvas-sack": 0xb9a67e,
};

// Colours that glow (the forge's coals)
export const GLOWING = {
    embers: { color: 0xff8a3a, emissive: 0xff4a0a, emissiveIntensity: 1.6 },
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
