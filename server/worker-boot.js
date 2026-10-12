// What each of the server's workers runs first (workers.js ThreadWorker): the `self` a Web
// Worker's module expects (its onmessage told what's sent it, its postMessage sending back), then
// the module itself (`workerData.url`). Anything sent before the module's ready to hear it is
// kept till it is.

import { parentPort, workerData } from "node:worker_threads";

const early = [];
const worker = (globalThis.self = globalThis);

worker.postMessage = (data, transfer = []) => parentPort.postMessage(data, transfer);
parentPort.on("message", (data) => (worker.onmessage ? worker.onmessage({ data }) : early.push(data)));

await import(workerData.url);

for (const data of early.splice(0)) {
    worker.onmessage?.({ data });
}
