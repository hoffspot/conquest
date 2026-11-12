// A capital's sign pictures, standing in its middle and walking in from outside it: how many are
// painted at each size, and what they hold with their mipmaps
//   node signs.mjs <quality> [far|near]   (near: every chunk's as those near are, as before)
import { load } from "./harness.mjs";
const quality = process.argv[2] ?? "low";
const how = process.argv[3] ?? "far";
const { buildWorld, CHUNK } = await load("core/overworld.js");
const { Chunks } = await load("world/chunks3d.js");
const { QUALITY } = await load("world/view.js");
const { signDetail } = await load("world/art/kits/signs.js");
const q = QUALITY[quality];
signDetail(q.signs);
const world = buildWorld({ seed: 1 });
const chunks = new Chunks(world, { undergrowth: 0, cliffs: q.cliffs, rocks: q.rocks, farSigns: how === "far" });
chunks.setSpacing(q.ground);
const settle = async (x, z) => {
    chunks.update(x, z, { budget: 50 });
    let guard = 0;
    while (chunks.busy && guard++ < 200000) { chunks.update(x, z, { budget: 50 }); await new Promise((r) => setImmediate(r)); }
    // (And its signs painted again, one a frame)
    for (let k = 0; k < 200; k++) chunks.update(x, z, { budget: 0 });
};
const report = (label) => {
    const seen = new Map();
    for (const drawn of chunks.drawn.values()) for (const { texture } of drawn.signs ?? []) seen.set(texture, texture.userData.detail);
    let bytes = 0;
    const by = {};
    for (const [texture, detail] of seen) {
        const [w, h] = texture.userData.size;
        bytes += w * h * 4 * (4 / 3);
        by[detail] = (by[detail] ?? 0) + 1;
    }
    console.log(`${label}: ${seen.size} sign pictures, ${(bytes / 1048576).toFixed(1)} MB with mipmaps; painted at ${JSON.stringify(by)} of full size (quality ${quality}, ${how})`);
};
const [cx, cz] = [3696.5, 4976.5];
for (const [label, x, z] of [["120 m west of its middle", cx - 120, cz], ["60 m west", cx - 60, cz], ["in its middle", cx, cz], ["100 m east", cx + 100, cz]]) {
    await settle(x, z);
    report(label);
}
