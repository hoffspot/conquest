import { readFileSync } from "node:fs";
import path from "node:path";
const start = path.resolve(process.argv[2]);
const seen = new Set([start]);
const stack = [start];
const odd = [];
let bytes = 0;
while (stack.length) {
    const f = stack.pop();
    const src = readFileSync(f, "utf8");
    bytes += src.length;
    const specs = new Set();
    for (const m of src.matchAll(/(?:import|export)\s[^"'`;]*?from\s*["']([^"']+)["']/g)) specs.add(m[1]);
    for (const m of src.matchAll(/import\s*["']([^"']+)["']/g)) specs.add(m[1]);
    for (const m of src.matchAll(/import\(\s*([^)]*)\)/g)) { odd.push(f + ": import(" + m[1] + ")"); }
    for (const s of specs) {
        if (!s.startsWith(".")) { odd.push(f + ": " + s); continue; }
        const t = path.resolve(path.dirname(f), s);
        if (!seen.has(t)) { seen.add(t); stack.push(t); }
    }
}
console.log([...seen].map((f) => path.relative(process.cwd(), f)).sort().join("\n"));
console.log(seen.size, "files", bytes, "bytes"); console.log("odd:", odd);
