// The import closure of each unit test file (static and dynamic string imports, new URL(..., import.meta.url),
// worker files named by string), and which tests a change to a set of files would select.
import { readFileSync, readdirSync, existsSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
const root = "/home/user/conquest";
const cache = new Map();
function depsOf(file) {
    if (cache.has(file)) return cache.get(file);
    const deps = new Set();
    cache.set(file, deps);
    let src;
    try { src = readFileSync(file, "utf8"); } catch { return deps; }
    const dir = path.dirname(file);
    const add = (spec) => {
        let target = null;
        if (spec.startsWith(".")) target = path.resolve(dir, spec);
        else if (spec.startsWith("/js/") || spec.startsWith("/vendor/")) target = path.join(root, "client", spec);
        else if (spec === "three") target = path.join(root, "node_modules/three/package.json");
        else if (spec.startsWith("three/")) target = path.join(root, "node_modules/three/package.json");
        else if (!spec.startsWith("node:")) { deps.add("pkg:" + spec.split("/").slice(0, spec.startsWith("@") ? 2 : 1).join("/")); return; }
        if (target && existsSync(target) && statSync(target).isFile()) deps.add(target);
    };
    for (const m of src.matchAll(/(?:import|export)\s[^"'`;]*?from\s*["']([^"']+)["']/g)) add(m[1]);
    for (const m of src.matchAll(/import\s*["']([^"']+)["']/g)) add(m[1]);
    for (const m of src.matchAll(/import\(\s*["'`]([^"'`$]+)["'`]\s*\)/g)) add(m[1]);
    for (const m of src.matchAll(/new URL\(\s*["'`]([^"'`$]+)["'`]\s*,\s*import\.meta\.url\s*\)/g)) add(m[1]);
    return deps;
}
function closure(file) {
    const seen = new Set([file]);
    const stack = [file];
    while (stack.length) {
        const f = stack.pop();
        if (f.startsWith("pkg:")) continue;
        if (!/\.(js|mjs|cjs)$/.test(f)) continue;
        for (const d of depsOf(f)) if (!seen.has(d)) { seen.add(d); stack.push(d); }
    }
    return seen;
}
const tests = readdirSync(path.join(root, "test")).filter((f) => f.endsWith(".test.js")).map((f) => path.join(root, "test", f));
const out = {};
for (const t of tests) {
    const src = readFileSync(t, "utf8");
    const c = closure(t);
    const fsRead = /readdirSync|readdir\(|globSync|\bglob\(/.test(src);
    const reads = /readFileSync|readFile\(|createReadStream|execFile|spawn\(|fork\(|new Worker\(/.test(src);
    out[path.relative(root, t)] = { files: [...c].filter((f) => !f.startsWith("pkg:")).map((f) => path.relative(root, f)), scans: fsRead, reads, pkgs: [...c].filter((f) => f.startsWith("pkg:")) };
}
writeFileSync("import-graph.json", JSON.stringify(out));
const sizes = Object.values(out).map((o) => o.files.length).sort((a, b) => a - b);
console.log("tests", tests.length, "closure sizes: min", sizes[0], "median", sizes[Math.floor(sizes.length / 2)], "p90", sizes[Math.floor(sizes.length * 0.9)], "max", sizes.at(-1));
console.log("tests that scan directories:", Object.values(out).filter((o) => o.scans).length, "; read files or start processes/workers:", Object.values(out).filter((o) => o.reads).length);
// how many tests import each core file
const counts = {};
for (const o of Object.values(out)) for (const f of o.files) counts[f] = (counts[f] ?? 0) + 1;
const top = Object.entries(counts).filter(([f]) => f.startsWith("client/") || f.startsWith("server/")).sort((a, b) => b[1] - a[1]);
console.log("most-imported files (tests reaching them):");
for (const [f, n] of top.slice(0, 25)) console.log(String(n).padStart(4), f);
for (const f of ["client/js/core/host.js", "client/js/core/battle.js", "client/js/core/overworld.js", "client/js/app/game.js", "client/js/main.js", "client/js/world/view.js", "client/js/core/war/war.js", "client/js/core/creatures.js", "client/js/core/exact.js", "client/js/core/random.js", "server/serve.js"]) console.log(String(counts[f] ?? 0).padStart(4), f);
