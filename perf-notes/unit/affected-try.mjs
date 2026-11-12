// What the affected-tests order would be for some made-up changes: node affected-try.mjs (from the checkout)
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const { importedBy, order, reach, touches } = await import(pathToFileURL(path.resolve("scripts/test-affected.js")).href);
const start = performance.now();
const files = new Map();
const read = (file) => {
    if (!files.has(file)) {
        const code = /\.m?js$/.test(file) && existsSync(file) && statSync(file).isFile() ? readFileSync(file, "utf8") : null;

        files.set(file, { imports: code === null ? [] : importedBy(file, code), touches: code !== null && touches(code) });
    }

    return files.get(file);
};
const tests = readdirSync("test").filter((name) => name.endsWith(".test.js")).sort().map((name) => `test/${name}`);
const reaches = new Map(tests.map((test) => [test, reach(test, (file) => read(file).imports)]));
const graph = { reachOf: (test) => reaches.get(test), touching: (test) => [...reaches.get(test)].some((file) => !file.startsWith("client/") && read(file).touches) };

console.log(`${tests.length} tests, ${files.size} files, in ${(performance.now() - start).toFixed(0)} ms`);

for (const changed of [["client/js/core/spells.js"], ["client/js/core/worldplan/settle.js"], ["client/js/app/camera.js"], ["server/broker.js"], ["test/helpers.js"], ["docs/WORLD.md"], ["client/models/assets.json"], ["server/world-worker.js"], ["client/js/core/scenery/bellhaven.walk.js"], ["test/goods.test.js", "test/ground.test.js"], ["package.json"], []]) {
    const { first, then, rest } = order(tests, changed, graph);

    console.log(`${changed.join(", ") || "(nothing)"}: first ${first.length}, then ${then.length}, rest ${rest.length}${first.length <= 6 ? ` (${first.join(" ")})` : ""}`);
}
