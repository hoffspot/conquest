/* global console, process, Buffer */
// A scene's walk as a picture: a pixel a square (or `scale`), its floor's height as shade (low blue,
// high yellow), a grey line every 20 m and a red mark at each scene point given: to see that the
// walk bake joined what it should (the bridge to the gate, the gate to the court before the keep)
// and left out what it should (the chasm's floor, the towers' tops). Run from the repository's root:
//   node .claude/skills/import-scene-model/scripts/walkpic.mjs <walk.json | walk.js> <out.png> [scale] [level] [x,z ...]
// The walk: the pipeline's `<name>.walk.json` (private/out-<name>/phone/) or the module the game
// imports (client/js/core/scenery/<name>.walk.js). Points in the scene's metres, as built (glTF: x,
// and z toward its front).
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { deflateSync } from "node:zlib";

const [file, out, scaleArg = "2", levelArg = "0", ...marks] = process.argv.slice(2);

if (!file || !out) {
    console.error("walkpic.mjs <walk.json | walk.js> <out.png> [scale] [level] [x,z ...]");
    process.exit(1);
}

const walk = file.endsWith(".js") ? (await import(pathToFileURL(resolve(file)).href)).default : JSON.parse(readFileSync(file, "utf8"));
const [w, h] = walk.size;
const [ox, oz] = walk.origin;
const level = walk.levels[Number(levelArg)];
const heights = new Int16Array(Uint8Array.from(Buffer.from(level.heights, "base64")).buffer);
const [bx0, by0, bx1, by1] = level.box;
const bw = bx1 - bx0 + 1;
const s = Number(scaleArg);
const [W, H] = [w * s, h * s];
const px = new Uint8Array(W * H * 3).fill(20);
let [lo, hi] = [Infinity, -Infinity];

for (const v of heights) {
    if (v !== -32768) {
        [lo, hi] = [Math.min(lo, v), Math.max(hi, v)];
    }
}

const paint = (x, y, c) => {
    if (x >= 0 && y >= 0 && x < W && y < H) {
        px.set(c, (y * W + x) * 3);
    }
};

for (let y = by0; y <= by1; y++) {
    for (let x = bx0; x <= bx1; x++) {
        const v = heights[(y - by0) * bw + (x - bx0)];

        if (v !== -32768) {
            const t = (v - lo) / Math.max(1, hi - lo);

            for (let dy = 0; dy < s; dy++) {
                for (let dx = 0; dx < s; dx++) {
                    paint(x * s + dx, y * s + dy, [40 + 200 * t, 90 + 120 * t, 160 - 100 * t]);
                }
            }
        }
    }
}

// (A line every 20 m of the scene's own metres)
for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
        if ((x + ox) % 20 === 0 || (y + oz) % 20 === 0) {
            paint(x * s, y * s, [90, 90, 90]);
        }
    }
}

for (const mark of marks) {
    const [mx, mz] = mark.split(",").map(Number);
    const [x, y] = [Math.floor(mx - ox) * s, Math.floor(mz - oz) * s];

    for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
            paint(x + dx, y + dy, [255, 30, 30]);
        }
    }
}

// (A PNG of its own, so it needs nothing installed)
const table = Array.from({ length: 256 }, (_, n) => {
    let c = n;

    for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }

    return c >>> 0;
});
const crc = (bytes) => {
    let c = 0xffffffff;

    for (const b of bytes) {
        c = table[(c ^ b) & 0xff] ^ (c >>> 8);
    }

    return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    const typed = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4);

    length.writeUInt32BE(data.length);
    sum.writeUInt32BE(crc(typed));

    return Buffer.concat([length, typed, sum]);
};
const raw = Buffer.alloc((W * 3 + 1) * H);

for (let y = 0; y < H; y++) {
    Buffer.from(px.buffer, y * W * 3, W * 3).copy(raw, y * (W * 3 + 1) + 1);
}

const header = Buffer.alloc(13);

header.writeUInt32BE(W, 0);
header.writeUInt32BE(H, 4);
header[8] = 8;
header[9] = 2;
writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
console.log({ squares: [w, h], origin: [ox, oz], levels: walk.levels.length, level: Number(levelArg), floors: heights.filter((v) => v !== -32768).length, low: lo / 100, high: hi / 100, box: level.box });
