// Makes the photographs a dungeon's rock, stone, earth and timber are drawn with (client/textures/
// dungeons, drawn by client/js/world/dungeons3d.js), all CC0
// (https://creativecommons.org/publicdomain/zero/1.0/), from ambientCG's and Poly Haven's scanned
// materials, each source's page saying so (checked 2026-10-08):
//
//   npm run build:textures
//
// Each material's colour, its ambient occlusion and its normal map (OpenGL's way up) are
// downloaded once (into .cache: ambientCG's 1K archive, Poly Haven's 1K pictures), the colour
// darkened by the occlusion (so its cracks stay dark under any light), both made half the size
// (512 pixels: a few metres of rock each, seen from a few metres off), and saved as JPEGs. Each
// picture's average colour (in linear light) is written with it into
// client/js/world/dungeonpictures.js, as the colour the theme's own is put in place of; and each
// material's files into client/models/assets.json's catalog, downloaded only once a dungeon's
// wanted (then: npm run build:manifest).

import { readFile, writeFile } from "node:fs/promises";
import jpeg from "jpeg-js";
import { fetchSource } from "./sounds/sources.js";

const OUT = new URL("../client/textures/dungeons/", import.meta.url);
const LIST = new URL("../client/js/world/dungeonpictures.js", import.meta.url);
const CATALOG = new URL("../client/models/assets.json", import.meta.url);

// The pictures' size (pixels) and the JPEGs' quality
const SIZE = 512;
const QUALITY = { colour: 82, normal: 88 };

// ambientCG's 1K archive of a material, and the files in it; Poly Haven's 1K pictures of one
const ambientCG = (id) => ({
    page: `https://ambientcg.com/a/${id}`,
    credit: `ambientCG ${id}`,
    file: (kind) => ({ url: `https://ambientcg.com/get?file=${id}_1K-JPG.zip`, member: `${id}_1K-JPG_${{ colour: "Color", ao: "AmbientOcclusion", normal: "NormalGL" }[kind]}.jpg` }),
});
const polyHaven = (id) => ({
    page: `https://polyhaven.com/a/${id}`,
    credit: `Poly Haven ${id}`,
    file: (kind) => ({ url: `https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/${id}/${id}_${{ colour: "diff", ao: "ao", normal: "nor_gl" }[kind]}_1k.jpg` }),
});

/**
 * The pictures, by name: where each is from, what it's of, and how many metres one repeat of it
 * covers in the game.
 */
export const PICTURES = {
    "rock-cave": { from: ambientCG("Rock028"), of: "a cave's rock", metres: 2.6 },
    "ground-cave": { from: ambientCG("Ground022"), of: "a cave's floor", metres: 2.2 },
    "rock-dug": { from: polyHaven("quarry_wall"), of: "an outlaws' hideout's rock, dug out", metres: 3 },
    "ground-dug": { from: ambientCG("Ground048"), of: "an outlaws' hideout's trodden earth", metres: 1.8 },
    timber: { from: polyHaven("rough_wood"), of: "rough timber, its posts and beams", metres: 1.6 },
    "stone-temple": { from: polyHaven("stone_brick_wall_001"), of: "an ancient temple's dressed stone", metres: 2.4 },
    "floor-temple": { from: polyHaven("large_grey_tiles"), of: "an ancient temple's flagstones", metres: 2.8 },
};

const linear = (value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
const encoded = (value) => (value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055);

// A picture's pixels made `size` across (from any size that's a whole multiple of it), each the
// average of those it stands for: in linear light for a colour, renormalised for a normal map
function shrink({ width, data }, size, kind) {
    const step = width / size;
    const out = Buffer.alloc(size * size * 4);

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const sum = [0, 0, 0];

            for (let j = 0; j < step; j++) {
                for (let i = 0; i < step; i++) {
                    const p = ((y * step + j) * width + x * step + i) * 4;

                    for (let c = 0; c < 3; c++) {
                        sum[c] += kind === "normal" ? data[p + c] / 127.5 - 1 : linear(data[p + c] / 255);
                    }
                }
            }

            const q = (y * size + x) * 4;

            if (kind === "normal") {
                const length = Math.hypot(...sum) || 1;

                for (let c = 0; c < 3; c++) {
                    out[q + c] = Math.round((sum[c] / length + 1) * 127.5);
                }
            } else {
                for (let c = 0; c < 3; c++) {
                    out[q + c] = Math.round(encoded(sum[c] / step / step) * 255);
                }
            }

            out[q + 3] = 255;
        }
    }

    return { width: size, height: size, data: out };
}

// A material's colour darkened by its occlusion, in place
function occluded(colour, ao) {
    for (let p = 0; p < colour.data.length; p += 4) {
        const shade = ao.data[p] / 255;

        for (let c = 0; c < 3; c++) {
            colour.data[p + c] = Math.round(encoded(linear(colour.data[p + c] / 255) * shade) * 255);
        }
    }

    return colour;
}

// A picture's average colour, in linear light (0 to 1 a channel, to four places)
function meanOf({ data }) {
    const sum = [0, 0, 0];

    for (let p = 0; p < data.length; p += 4) {
        for (let c = 0; c < 3; c++) {
            sum[c] += linear(data[p + c] / 255);
        }
    }

    return sum.map((value) => Math.round((value / (data.length / 4)) * 10000) / 10000);
}

async function make(name, { from }) {
    const decode = async (kind) => jpeg.decode(await fetchSource(from.file(kind)), { useTArray: true, maxMemoryUsageInMB: 1024 });
    const [colour, ao, normal] = await Promise.all([decode("colour"), decode("ao"), decode("normal")]);
    const small = shrink(occluded(colour, ao), SIZE, "colour");

    await writeFile(new URL(`${name}-colour.jpg`, OUT), jpeg.encode(small, QUALITY.colour).data);
    await writeFile(new URL(`${name}-normal.jpg`, OUT), jpeg.encode(shrink(normal, SIZE, "normal"), QUALITY.normal).data);

    return meanOf(small);
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
    const made = {};

    for (const [name, picture] of Object.entries(PICTURES)) {
        made[name] = { entry: `dungeon-${name}`, metres: picture.metres, mean: await make(name, picture) };
        console.log(name, made[name].mean.join(" "));
    }

    const lines = Object.entries(made).map(([name, { entry, metres, mean }]) => `    ${JSON.stringify(name)}: { entry: ${JSON.stringify(entry)}, metres: ${metres}, mean: [${mean.join(", ")}] },`);

    await writeFile(
        LIST,
        `// Made by scripts/build-textures.js (npm run build:textures), don't edit: the photographs a
// dungeon's rock, stone, earth and timber are drawn with (client/textures/dungeons, CC0: where
// each is from is in that script), by name: each its catalog entry (app/assets.js: its colour
// and its normal map), how many metres one repeat of it covers, and its average colour (linear
// light, 0 to 1), which the theme's own is put in place of (world/dungeons3d.js).

export const DUNGEON_PICTURES = Object.freeze({
${lines.join("\n")}
});
`,
    );

    const catalog = JSON.parse(await readFile(CATALOG, "utf8"));

    for (const [name, { from, of }] of Object.entries(PICTURES)) {
        catalog.models[`dungeon-${name}`] = {
            tier: "demand",
            label: `${of[0].toUpperCase()}${of.slice(1)} (${from.credit}, CC0)`,
            files: ["colour", "normal"].map((kind) => ({ path: `textures/dungeons/${name}-${kind}.jpg` })),
        };
    }

    await writeFile(CATALOG, `${JSON.stringify(catalog, null, 4)}\n`);
    console.log(`Wrote ${Object.keys(made).length} pictures; now npm run build:manifest`);
}
