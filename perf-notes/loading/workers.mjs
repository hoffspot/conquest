import { readFile } from "node:fs/promises";
import path from "node:path";
const client = "/home/user/conquest/client";
const STATIC = /(?:^|[;\s}])(?:import|export)\s*(?:[\w*{}\s,$]*?\s*from\s*)?["']([^"']+)["']/g;
const named = { three: "./vendor/three-r186/three.module.min.js", "three/addons/": "./vendor/three-r186/addons/" };
function resolve(spec, from) { for (const [name, target] of Object.entries(named)) if (name.endsWith("/") ? spec.startsWith(name) : spec === name) return path.posix.normalize(path.posix.join(target, spec.slice(name.length))); if (spec.startsWith(".")) return path.posix.normalize(path.posix.join(path.posix.dirname(from), spec)); return null; }
for (const w of ["js/audio/worker.js", "js/characters/lod-worker.js", "js/characters/skin-worker.js", "js/world/art/engine/paint-worker.js", "js/world/navworker.js", "js/world/far/far-worker.js", "js/world/far/silhouette-worker.js", "js/world/layout-worker.js", "js/world/terrain-worker.js"]) {
    const seen = new Map(); const q = [w];
    while (q.length) { const f = q.shift(); if (seen.has(f)) continue; const src = await readFile(path.join(client, f), "utf8"); seen.set(f, src.length); for (const m of src.matchAll(STATIC)) { const n = resolve(m[1], f); if (n && !seen.has(n)) q.push(n); } }
    const total = [...seen.values()].reduce((s, n) => s + n, 0); const top = [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([f, n]) => `${f.split("/").slice(-2).join("/")} ${(n / 1024).toFixed(0)}K`).join(", ");
    console.log(`${w.padEnd(40)} ${String(seen.size).padStart(3)} modules ${(total / 1024).toFixed(0).padStart(5)} KB of source   ${top}`);
}
