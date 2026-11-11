/* global console, process */
// A scene's broad flat faces that look back (-z) or out to its sides (+-x), in a GLB the model
// pipeline built: where each is (the plane's z or x, to the metre), how big, and from where to
// where across and up: its plain back walls, to be dressed (dress.py, backwalls.py). Run from the
// repository's root:
//   node .claude/skills/set-scene-into-world/scripts/faces.mjs <glb> [how many] [--except M_Ground,M_Rock1]
import { createIO } from "../../../../utilities/blenderpipeline/lib/gltf.js";
import { trianglesOf } from "../../../../utilities/blenderpipeline/lib/walk.js";

const args = process.argv.slice(2);
const except = args.includes("--except") ? args[args.indexOf("--except") + 1].split(",") : ["M_Ground", "M_Rock1", "M_Rock2"];
const document = await (await createIO()).read(args[0]);
const tri = trianglesOf(document, { except });
const planes = new Map();

for (let t = 0; t < tri.length; t += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = tri.subarray(t, t + 9);
    const [ux, uy, uz, vx, vy, vz] = [bx - ax, by - ay, bz - az, cx - ax, cy - ay, cz - az];
    const cross = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    const area = Math.hypot(...cross) / 2;

    if (area < 1) {
        continue;
    }

    // (Its normal's parts along x and z: the walls looked for face one of those ways, none up)
    const [nx, nz] = [cross[0] / (2 * area), cross[2] / (2 * area)];

    for (const [axis, dir, n] of [["z", -1, nz], ["x", -1, nx], ["x", 1, nx]]) {
        if (n * dir < 0.95) {
            continue;
        }

        const at = axis === "z" ? Math.round((az + bz + cz) / 3) : Math.round((ax + bx + cx) / 3);
        const key = `${axis}${dir > 0 ? "+" : "-"} ${at}`;
        const plane = planes.get(key) ?? { area: 0, lo: [Infinity, Infinity], hi: [-Infinity, -Infinity] };
        const across = axis === "z" ? [ax, bx, cx] : [az, bz, cz];

        plane.area += area;
        plane.lo = [Math.min(plane.lo[0], ...across), Math.min(plane.lo[1], ay, by, cy)];
        plane.hi = [Math.max(plane.hi[0], ...across), Math.max(plane.hi[1], ay, by, cy)];
        planes.set(key, plane);
    }
}

for (const [key, { area, lo, hi }] of [...planes.entries()].sort((a, b) => b[1].area - a[1].area).slice(0, Number(args[1] ?? 18))) {
    console.log(key.padEnd(10), "area", area.toFixed(0).padStart(6), "m²  across", lo[0].toFixed(0), "to", hi[0].toFixed(0), " up", lo[1].toFixed(0), "to", hi[1].toFixed(0));
}
