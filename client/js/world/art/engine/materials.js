// Procedural textures and materials: stone, brick, plaster, thatch, slate, clay tiles, wood and
// the ground under towns and castles. Each texture is painted pixel by pixel from a seeded random
// generator, so the art comes out the same every time it is generated. Textures tile seamlessly
// and say how many world pixels one copy covers (see Solid: texture coordinates are world pixels).

import * as THREE from "three";
import { createRandom } from "../../../core/random.js";

// Canvas pixels per texture
const SIZE = 128;

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

// Paint a texture: paint(x, y) returns the colour at canvas pixel (x, y). Returns the canvas.
function paintTexture(paint) {
    const canvas = document.createElement("canvas");

    canvas.width = SIZE;
    canvas.height = SIZE;

    const context = canvas.getContext("2d");
    const image = context.createImageData(SIZE, SIZE);

    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            const [r, g, b, a = 255] = paint(x, y);
            const i = (y * SIZE + x) * 4;

            image.data[i] = r;
            image.data[i + 1] = g;
            image.data[i + 2] = b;
            image.data[i + 3] = a;
        }
    }

    context.putImageData(image, 0, 0);

    return canvas;
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

const PAINTERS = {
    // Castle stone: squared blocks in courses, with mortar joints and lit upper edges
    ashlar({ base, light, dark, mortar }, seed) {
        const grain = periodicNoise(seed + 1, 16);
        const joint = 2.2;

        return courses(seed, 8, [26, 32, 38, 44], (u, v, { shade }, row, length, height) => {
            if (u * length < joint || v * height < joint) {
                return mortar;
            }

            let colour = mix(dark, light, 0.25 + shade * 0.55);

            if (v * height < joint + 2) {
                colour = mix(colour, light, 0.35);
            } else if (v * height > height - 2.5) {
                colour = mix(colour, dark, 0.45);
            }

            return scale(mix(colour, base, 0.3), 0.93 + grain(u * 3 + row, v * 3) * 0.14);
        });
    },

    brick({ base, light, dark, mortar }, seed) {
        const grain = periodicNoise(seed + 1, 32);

        return courses(seed, 10, [24, 26, 28], (u, v, { shade }, row, length, height) => {
            if (u * length < 2 || v * height < 2) {
                return mortar;
            }

            const colour = mix(mix(dark, light, shade), base, 0.4);

            return scale(v * height < 4 ? mix(colour, light, 0.2) : colour, 0.94 + grain((u * length) / 4, row * 3) * 0.12);
        });
    },

    plaster({ base, light, dark }, seed) {
        const blotch = periodicNoise(seed, 4);
        const grain = periodicNoise(seed + 1, 64);

        return (x, y) => {
            const tone = blotch((x / SIZE) * 4, (y / SIZE) * 4) * 0.7 + grain((x / SIZE) * 64, (y / SIZE) * 64) * 0.3;

            return tone < 0.5 ? mix(dark, base, tone * 2) : mix(base, light, (tone - 0.5) * 2);
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
            const strand = strands[(x + Math.floor(y / course) * 17) % SIZE];
            let colour = mix(dark, light, strand * 0.8 + wobble((x / SIZE) * 8, (y / SIZE) * 8) * 0.2);

            colour = mix(colour, base, 0.35);

            return within > 0.72 ? mix(colour, dark, (within - 0.72) * 2.4) : colour;
        };
    },

    // Slates or wooden shingles: rows of small rectangles, each a little different
    slate({ base, light, dark, mortar }, seed) {
        const grain = periodicNoise(seed + 1, 32);

        return courses(seed, 12, [18, 20, 22, 24], (u, v, { shade }, row, length, height) => {
            if (u * length < 1.5 || v * height < 1.5) {
                return mortar;
            }

            const colour = mix(mix(dark, light, shade * 0.8), base, 0.45);

            return scale(mix(colour, dark, v * 0.35), 0.95 + grain((u * length) / 3, row * 2) * 0.1);
        });
    },

    // Rounded clay tiles: each tile lit across its curve
    clay({ base, light, dark, mortar }, seed) {
        return courses(seed, 10, [16], (u, v, { shade }, row, length, height) => {
            if (v * height < 1.5) {
                return mortar;
            }

            const curve = 1 - (u * 2 - 1) ** 2;
            const colour = mix(mix(dark, light, curve * 0.9), base, 0.3 + shade * 0.2);

            return mix(colour, dark, v * 0.3);
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
                return dark;
            }

            const streak = grain((x / SIZE) * 32, (y / SIZE) * 4);

            return mix(mix(dark, light, tones[plank] * 0.6 + streak * 0.4), base, 0.35);
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
                return mortar;
            }

            const round = Math.min(1, edge / 6);

            return mix(mix(dark, light, shade * 0.7), base, 0.3 + round * 0.2).map((channel) => channel * (0.8 + round * 0.25));
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
                    return light;
                }
            }

            const tone = blotch((x / SIZE) * 6, (y / SIZE) * 6) * 0.6 + grain((x / SIZE) * 64, (y / SIZE) * 64) * 0.4;

            return tone < 0.5 ? mix(dark, base, tone * 2) : mix(base, light, (tone - 0.5) * 1.2);
        };
    },

    // Ploughed soil: furrows running east to west
    soil({ base, light, dark }, seed) {
        const grain = periodicNoise(seed, 64);

        return (x, y) => {
            const furrow = (y % 16) / 16;
            const ridge = 1 - Math.abs(furrow * 2 - 1);
            const colour = mix(dark, light, ridge * 0.8 + grain((x / SIZE) * 64, (y / SIZE) * 64) * 0.2);

            return mix(colour, base, 0.3);
        };
    },
};

// Colours for each material, and how many world pixels one copy of its texture covers
const MATERIALS = {
    stone: { painter: "ashlar", world: 40, base: 0x8f8c86, light: 0xb4b0a6, dark: 0x6c6964, mortar: 0x57544f },
    "stone-warm": { painter: "ashlar", world: 40, base: 0xa89878, light: 0xc8b996, dark: 0x847359, mortar: 0x645846 },
    "stone-dark": { painter: "ashlar", world: 40, base: 0x6f6e70, light: 0x8e8c8c, dark: 0x535257, mortar: 0x403f43 },
    brick: { painter: "brick", world: 24, base: 0x9a4e38, light: 0xb4654a, dark: 0x733627, mortar: 0xb3a792 },
    "brick-brown": { painter: "brick", world: 24, base: 0x80533a, light: 0x9c6a4c, dark: 0x5f3b29, mortar: 0xa89d8a },
    plaster: { painter: "plaster", world: 48, base: 0xe4dac0, light: 0xf1eadb, dark: 0xcdbf9f },
    "plaster-white": { painter: "plaster", world: 48, base: 0xe8e6de, light: 0xf6f4ef, dark: 0xcfcbc0 },
    "plaster-ochre": { painter: "plaster", world: 48, base: 0xd9b77a, light: 0xe8cc96, dark: 0xbf9b5e },
    "plaster-rose": { painter: "plaster", world: 48, base: 0xd7ad98, light: 0xe6c4b3, dark: 0xbd9079 },
    thatch: { painter: "thatch", world: 24, base: 0xc2a15a, light: 0xdcc17a, dark: 0x8c6f37 },
    "thatch-grey": { painter: "thatch", world: 24, base: 0x9d8c66, light: 0xb8a883, dark: 0x6e6147 },
    slate: { painter: "slate", world: 24, base: 0x5a6078, light: 0x7a8199, dark: 0x40445a, mortar: 0x2c2e42 },
    "slate-grey": { painter: "slate", world: 24, base: 0x6c7077, light: 0x898d94, dark: 0x4d5057, mortar: 0x34363b },
    shingles: { painter: "slate", world: 24, base: 0x7a5a40, light: 0x94704f, dark: 0x5a412d, mortar: 0x3d2b1e },
    clay: { painter: "clay", world: 24, base: 0xb0553c, light: 0xcf7552, dark: 0x803726, mortar: 0x5e2a1d },
    "clay-orange": { painter: "clay", world: 24, base: 0xc0703f, light: 0xda8f58, dark: 0x8f4d2a, mortar: 0x6a3a20 },
    planks: { painter: "planks", world: 20, base: 0x7b5a3c, light: 0x9a7552, dark: 0x4a3322 },
    "planks-dark": { painter: "planks", world: 20, base: 0x5a3e28, light: 0x70503a, dark: 0x33231a },
    cobbles: { painter: "cobbles", world: 40, base: 0x928c80, light: 0xb3ab9c, dark: 0x6f6a60, mortar: 0x4f4b44 },
    road: { painter: "earth", world: 64, base: 0x9d7f5a, light: 0xb49770, dark: 0x7f6446 },
    courtyard: { painter: "earth", world: 64, base: 0xa99b80, light: 0xc3b69b, dark: 0x8b7e66 },
    soil: { painter: "soil", world: 32, base: 0x6e4d33, light: 0x8a6446, dark: 0x4a3222 },
};

// Plain colours (no texture): trims, doors, glass, metal
const COLOURS = {
    timber: 0x4a3223,
    "timber-light": 0x6b4a32,
    glass: 0x2b3444,
    "glass-lit": 0x6b6446,
    door: 0x5b3b25,
    iron: 0x3a3a3e,
    shadow: 0x1d1b1a,
    ridge: 0x3f3a36,
    banner: 0x9b2d2d,
    gold: 0xc9a13b,
};

const cache = new Map();

/** The canvas for a textured material (for drawing the ground, which is 2D). */
export function textureCanvas(name) {
    const spec = MATERIALS[name];
    const colours = Object.fromEntries(["base", "light", "dark", "mortar"].map((key) => [key, hex(spec[key] ?? spec.dark) ]));
    const seed = [...name].reduce((total, character) => total * 31 + character.charCodeAt(0), 7) >>> 0;

    return { canvas: paintTexture(PAINTERS[spec.painter](colours, seed)), world: spec.world };
}

/** The shared material with this name: a texture from MATERIALS or a plain colour from COLOURS. */
export function material(name) {
    if (cache.has(name)) {
        return cache.get(name);
    }

    let result;

    if (MATERIALS[name]) {
        const { canvas, world } = textureCanvas(name);
        const texture = new THREE.CanvasTexture(canvas);

        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1 / world, 1 / world);
        texture.anisotropy = 8;
        result = new THREE.MeshLambertMaterial({ map: texture });
    } else if (COLOURS[name] !== undefined) {
        result = new THREE.MeshLambertMaterial({ color: COLOURS[name] });
    } else {
        throw new Error(`No material called ${name}`);
    }

    result.name = name;
    // Every face casts shadows, whichever way it faces
    result.shadowSide = THREE.DoubleSide;
    cache.set(name, result);

    return result;
}
