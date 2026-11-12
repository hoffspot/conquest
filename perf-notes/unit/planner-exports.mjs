// What the planner's modules export that could be changed as they run: node planner-exports.mjs (from the checkout)
import path from "node:path";
import { pathToFileURL } from "node:url";

const { PLANNER, sourcesOf } = await import(pathToFileURL(path.resolve("test/plan-cache.js")).href);

for (const file of sourcesOf(PLANNER)) {
    const module = await import(pathToFileURL(file).href);

    for (const [name, value] of Object.entries(module)) {
        if (value && typeof value === "object") {
            const kind = ArrayBuffer.isView(value) ? "typed array" : value instanceof Map ? "Map" : value instanceof Set ? "Set" : Array.isArray(value) ? "array" : Object.getPrototypeOf(value) === Object.prototype ? "object" : value.constructor?.name;
            const deep = (each, seen = new Set()) => !each || typeof each !== "object" || ArrayBuffer.isView(each) || seen.has(each) || (seen.add(each), Object.isFrozen(each) && Object.values(each).every((inner) => deep(inner, seen)));

            console.log(`${path.relative(process.cwd(), file)}: ${name} (${kind}) ${Object.isFrozen(value) ? "frozen" : "NOT FROZEN"}${Object.isFrozen(value) && !deep(value) ? ", but not all the way down" : ""}`);
        }
    }
}
