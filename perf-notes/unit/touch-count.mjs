// How many test files each rule for "reads files or starts processes" picks: node touch-count.mjs (from the checkout)
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const at = (file) => pathToFileURL(path.resolve(file)).href;
const { reach } = await import(at("scripts/test-affected.js"));
const { importsIn } = await import(at("scripts/lib/imports.js"));
const codes = new Map();
const read = (file) => {
    if (!codes.has(file)) {
        codes.set(file, existsSync(file) && statSync(file).isFile() ? (/\.m?js$/.test(file) ? readFileSync(file, "utf8") : "") : null);
    }

    return codes.get(file);
};
const tests = readdirSync("test").filter((name) => name.endsWith(".test.js")).sort().map((name) => `test/${name}`);
const start = performance.now();
const reaches = new Map(tests.map((test) => [test, reach(test, read)]));

console.log(tests.length, "tests' reach in", (performance.now() - start).toFixed(0), "ms;", codes.size, "files read; sizes", [...reaches.values()].map((set) => set.size).sort((a, b) => a - b).filter((_, k, all) => [0, Math.floor(all.length / 2), all.length - 1].includes(k)).join(" / "));

const NODE = ["node:fs", "node:fs/promises", "node:child_process", "node:worker_threads", "node:cluster"];
const reviewer = /readFileSync|readFile\(|createReadStream|execFile|spawn\(|fork\(|new Worker\(|readdirSync|readdir\(|globSync|\bglob\(/;
const rules = {
    "the reviewer's (own code, by what it calls)": (test) => reviewer.test(read(test)),
    "own code imports fs, child_process or worker_threads": (test) => importsIn(read(test)).some((from) => NODE.includes(from)),
    "own code or test/ helpers import them": (test) => [...reaches.get(test)].some((file) => file.startsWith("test/") && importsIn(read(file) ?? "").some((from) => NODE.includes(from))),
    "own code, test/, server/ or scripts/ import them": (test) => [...reaches.get(test)].some((file) => /^(test|server|scripts)\//.test(file) && importsIn(read(file) ?? "").some((from) => NODE.includes(from))),
    "anything reached imports them": (test) => [...reaches.get(test)].some((file) => importsIn(read(file) ?? "").some((from) => NODE.includes(from))),
};

for (const [name, rule] of Object.entries(rules)) {
    console.log(String(tests.filter(rule).length).padStart(4), name);
}

const a = tests.filter(rules["the reviewer's (own code, by what it calls)"]);
const b = tests.filter(rules["own code or test/ helpers import them"]);

console.log("the reviewer's but not by imports:", a.filter((test) => !b.includes(test)).join(" "));
console.log("by imports but not the reviewer's:", b.filter((test) => !a.includes(test)).join(" "));
console.log("client/js files that import them:", [...codes.keys()].filter((file) => file.startsWith("client/js/") && importsIn(codes.get(file) ?? "").some((from) => NODE.includes(from))).join(" "));
