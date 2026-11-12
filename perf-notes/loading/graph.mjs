// Module graph of the game: counts, bytes, gzip/brotli, BFS depth (request waterfall)
import { readFile } from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";

const client = "/home/user/conquest/client";
const STATIC = /(?:^|[;\s}])(?:import|export)\s*(?:[\w*{}\s,$]*?\s*from\s*)?["']([^"']+)["']/g;
const DYNAMIC = /import\s*\(\s*["']([^"']+)["']\s*\)/g;
const WORKER = /new\s+Worker\s*\(\s*new\s+URL\s*\(\s*["']([^"']+)["']/g;
const html = await readFile(path.join(client, "index.html"), "utf8");
const mapText = html.match(/(<script type="importmap">)([\s\S]*?)(<\/script>)/)[2];
const imports = JSON.parse(mapText).imports;
const named = Object.fromEntries(Object.entries(imports).filter(([n]) => !/^[./]/.test(n)).map(([n, t]) => [n, t.replace(/\?h=[0-9a-f]{10}$/, "")]));

function resolve(spec, from) {
    for (const [name, target] of Object.entries(named)) {
        if (name.endsWith("/") ? spec.startsWith(name) : spec === name) return path.posix.normalize(path.posix.join(target, spec.slice(name.length)));
    }
    if (spec.startsWith(".")) return path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
    return null;
}
const cache = new Map();
async function read(file) {
    if (!cache.has(file)) {
        const src = await readFile(path.join(client, file), "utf8");
        const st = [...src.matchAll(STATIC)].map((m) => resolve(m[1], file)).filter(Boolean);
        const dy = [...src.matchAll(DYNAMIC)].map((m) => resolve(m[1], file)).filter(Boolean);
        const wk = [...src.matchAll(WORKER)].map((m) => resolve(m[1], file)).filter(Boolean);
        cache.set(file, { src, st: [...new Set(st)], dy: [...new Set(dy)], wk: [...new Set(wk)] });
    }
    return cache.get(file);
}
// BFS over static imports from entries; returns Map file -> depth
async function bfs(entries, { dynamic = false, skip = new Set() } = {}) {
    const depth = new Map();
    let frontier = entries.filter((e) => !skip.has(e));
    let d = 0;
    for (const e of frontier) depth.set(e, 0);
    while (frontier.length) {
        const next = [];
        for (const file of frontier) {
            const m = await read(file);
            const out = dynamic ? [...m.st, ...m.dy, ...m.wk] : m.st;
            for (const o of out) {
                if (!depth.has(o) && !skip.has(o)) { depth.set(o, d + 1); next.push(o); }
            }
        }
        frontier = next; d++;
    }
    return depth;
}
function sizes(files) {
    let raw = 0, gz = 0, br = 0;
    for (const f of files) {
        const buf = Buffer.from(cache.get(f).src, "utf8");
        raw += buf.length;
        gz += zlib.gzipSync(buf, { level: 6 }).length; // Pages/Fastly gzip, roughly level 6
        br += zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9 } }).length;
    }
    return { raw, gz, br };
}
const fmt = (n) => (n / 1024 / 1024).toFixed(2) + " MB";
function report(title, depth) {
    const files = [...depth.keys()];
    const s = sizes(files);
    const max = Math.max(...depth.values());
    const perLevel = Array.from({ length: max + 1 }, (_, i) => files.filter((f) => depth.get(f) === i).length);
    console.log(`\n== ${title}`);
    console.log(`modules ${files.length}, raw ${fmt(s.raw)} (${s.raw}), gzip-6 ${fmt(s.gz)}, brotli-9 ${fmt(s.br)}`);
    console.log(`BFS depth (levels after entry): ${max}; modules per level: ${perLevel.join(", ")}`);
    return { files, s, max };
}
// 1. main.js static closure (what the browser fetches before the loader starts)
const mainD = await bfs(["js/main.js"]);
const main = report("main.js static closure (before the loader runs)", mainD);
const big = [...mainD.keys()].map((f) => [f, Buffer.byteLength(cache.get(f).src)]).sort((a, b) => b[1] - a[1]).slice(0, 12);
console.log("largest:", big.map(([f, b]) => `${f} ${(b / 1024).toFixed(0)}K`).join("; "));
// deepest chain example
const deepest = [...mainD.entries()].filter(([, d]) => d === main.max).map(([f]) => f);
console.log("deepest level files:", deepest.join(", "));

// 2. navigation.js closure, then session/creator/hud (imported after the loader)
const skip = new Set(mainD.keys());
const navD = await bfs(["js/core/navigation.js"], { skip });
report("core/navigation.js static closure (first import after loader)", navD);
const skip2 = new Set([...skip, ...navD.keys()]);
const gameD = await bfs(["js/app/session.js", "js/app/creator.js", "js/app/hud.js"], { skip: skip2 });
const game = report("session.js + creator.js + hud.js static closure (second import)", gameD);
const big2 = [...gameD.keys()].map((f) => [f, Buffer.byteLength(cache.get(f).src)]).sort((a, b) => b[1] - a[1]).slice(0, 15);
console.log("largest:", big2.map(([f, b]) => `${f} ${(b / 1024).toFixed(0)}K`).join("; "));

// 3. Everything static from all three stages = modules evaluated before the title
const allBoot = new Map([...mainD, ...navD, ...gameD]);
report("All modules evaluated before the title (static closures of the three stages)", allBoot);

// 4. Full closure incl dynamic + workers (the manifest's entries + main)
const ENTRIES = ["js/main.js", "js/app/session.js", "js/app/creator.js", "js/app/worldmap.js", "js/app/wheelsetup.js", "js/app/together.js", "js/app/character-file.js"];
const allD = await bfs(ENTRIES, { dynamic: true });
const all = report("Everything reachable (static + import() + workers) from main + manifest ENTRIES", allD);
const notBoot = all.files.filter((f) => !allBoot.has(f));
const nb = sizes(notBoot);
console.log(`Downloaded before the title but NOT evaluated then (dynamic/worker only): ${notBoot.length} modules, raw ${fmt(nb.raw)}, gzip ${fmt(nb.gz)}`);
const big3 = notBoot.map((f) => [f, Buffer.byteLength(cache.get(f).src)]).sort((a, b) => b[1] - a[1]).slice(0, 25);
console.log("largest of those:", big3.map(([f, b]) => `${f} ${(b / 1024).toFixed(0)}K`).join("; "));

// 5. index.html and the import map
const htmlBuf = Buffer.from(html);
const mapBuf = Buffer.from(mapText);
console.log(`\n== index.html ${htmlBuf.length} bytes (gzip ${zlib.gzipSync(htmlBuf).length}); import map ${mapBuf.length} bytes (gzip alone ${zlib.gzipSync(mapBuf).length}), ${Object.keys(imports).length} entries`);
const without = Buffer.from(html.replace(mapText, ""));
console.log(`index.html without the import map: ${without.length} bytes (gzip ${zlib.gzipSync(without).length})`);
console.log("modulepreload links:", (html.match(/modulepreload/g) || []).length, " rel=preload:", (html.match(/rel="preload"/g) || []).length);
// by dir
const byDir = {};
for (const f of all.files) { const d = f.split("/").slice(0, 3).join("/").replace(/\/[^/]+\.m?js$/, ""); byDir[d] = byDir[d] || [0, 0]; byDir[d][0]++; byDir[d][1] += Buffer.byteLength(cache.get(f).src); }
console.log(Object.entries(byDir).sort((a, b) => b[1][1] - a[1][1]).map(([d, [n, b]]) => `${d}: ${n} files ${(b / 1024).toFixed(0)}K`).join("\n"));
