// How much CPU importing a module costs a process: node import-cost.mjs <module> (run from the checkout)
import path from "node:path";
import { pathToFileURL } from "node:url";

const before = process.cpuUsage();
const wall = performance.now();

if (process.argv[2]) {
    await import(pathToFileURL(path.resolve(process.argv[2])));
}

const used = process.cpuUsage(before);

console.log(process.argv[2] ?? "(nothing)", ((used.user + used.system) / 1000).toFixed(1), "ms CPU", (performance.now() - wall).toFixed(1), "ms wall; whole process", ((process.cpuUsage().user + process.cpuUsage().system) / 1000).toFixed(1), "ms CPU");
