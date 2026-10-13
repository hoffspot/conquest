// The world server, run from Terminal (generated/world_server_plan.md §11, Phase 1):
//
//   npm run world-server                         its data where this system keeps an app's (platform/)
//   node server/world.js --port 8480 --data <folder>
//
// It says where it can be reached at home, its id, and, the first time, its admin key (shown then
// alone: keep it). Until the management page comes (S4), worlds are made with the admin key by
// /api/v1/worlds. Ctrl-C saves every world and stops.

import path from "node:path";
import { parseArgs } from "node:util";
import { folders } from "./platform/index.js";
import { SERVER_VERSION } from "./storage/versions.js";
import { WorldServer } from "./world-server.js";

const { values } = parseArgs({ options: { port: { type: "string" }, data: { type: "string" } } });
const root = path.resolve(values.data ?? folders().data);
const server = await WorldServer.open(root);
const port = await server.listen(values.port === undefined ? undefined : Number(values.port));

console.log(`Pellagos Server ${SERVER_VERSION}, keeping its worlds in ${root}`);
console.log(`Its id: ${server.identity.id}`);

for (const address of server.addresses()) {
    console.log(`On the Wi-Fi: ${address}`);
}

console.log(`On this machine: http://localhost:${port}`);
console.log(`Worlds kept: ${server.worlds.size}`);

if (server.adminKey) {
    console.log(`\nIts admin key, shown this once (keep it safe; it manages the server):\n\n    ${server.adminKey}\n`);
    console.log(`Make a world with it: open the game from http://localhost:${port}, then Worlds on servers, add this server (localhost:${port}) and Make a world. Or:\n\n    curl -X POST http://localhost:${port}/api/v1/worlds -H "Authorization: Key ${server.adminKey}" -H "Content-Type: application/json" -d '{"name": "My world", "race": "human"}'\n`);
}

let stopping = false;

const stop = async () => {
    if (stopping) {
        return;
    }

    stopping = true;
    console.log("Saving every world and stopping...");
    await server.close();
    process.exit(0);
};

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
