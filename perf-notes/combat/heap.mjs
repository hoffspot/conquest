// A .heapprofile's sampled allocations by function (self), as shares.
import { readFileSync } from "node:fs";

const [file, top = "30"] = process.argv.slice(2);
const profile = JSON.parse(readFileSync(file, "utf8"));
const by = new Map();
let total = 0;

(function walk(node, inAdvance) {
    const name = `${node.callFrame.functionName || "(anonymous)"} ${node.callFrame.url.split("/").slice(-2).join("/")}:${node.callFrame.lineNumber + 1}`;
    const inside = inAdvance || node.callFrame.functionName === "advance";

    if (inside) {
        by.set(name, (by.get(name) ?? 0) + node.selfSize);
        total += node.selfSize;
    }

    for (const child of node.children ?? []) {
        walk(child, inside);
    }
})(profile.head, false);

console.log(`sampled under advance: ${(total / 2 ** 20).toFixed(1)} MB (live at the end of the run only if the profile's of what's kept: with --heap-prof, of all sampled while it ran that were still alive when written... see below)`);

for (const [name, size] of [...by].sort((a, b) => b[1] - a[1]).slice(0, Number(top))) {
    console.log(`${((size / total) * 100).toFixed(1).padStart(5)}%  ${(size / 1024).toFixed(0).padStart(8)} KB  ${name}`);
}
