// The world server, run from Terminal (generated/world_server_plan.md §11, Phase 1):
//
//   npm run world-server                         its data where this system keeps an app's (platform/)
//   node server/world.js --port 8480 --data <folder>
//
// It says where it can be reached at home, its id, its management page (on this computer, needing
// no key; from the Wi-Fi at /admin, with the admin key), and, the first time, its admin key (shown
// then alone: keep it). It shows itself to others on the Wi-Fi with Bonjour (its `bonjour`
// setting), saying so, or why macOS refused. With a certificate and its `internet` setting on, it
// says where the internet reaches it (over TLS alone); getting free certificates (certify.js), how
// that stands, and each one got or refused; and what the router forwards, or why it won't.
// Ctrl-C, or Stop on the management page, saves every world and stops.

import path from "node:path";
import { parseArgs } from "node:util";
import { bonjour, folders } from "./platform/index.js";
import { SERVER_VERSION } from "./storage/versions.js";
import { WorldServer } from "./world-server.js";

const { values } = parseArgs({ options: { port: { type: "string" }, admin: { type: "string" }, data: { type: "string" } } });
const root = path.resolve(values.data ?? folders().data);
const server = await WorldServer.open(root, { onStop: () => stop(), bonjour: bonjour() });

const port = await server.listen(values.port === undefined ? undefined : Number(values.port));
const adminPort = await server.listenAdmin(values.admin === undefined ? undefined : Number(values.admin));

console.log(`Pellagos Server ${SERVER_VERSION}, keeping its worlds in ${root}`);
console.log(`Its id: ${server.identity.id}`);

for (const address of server.addresses()) {
    console.log(`On the Wi-Fi: ${address}`);
}

for (const address of server.internetClosed ? [] : server.secureAddresses()) {
    console.log(`From the internet (over TLS alone): ${address}`);
}

// (Free certificates: how getting them stands, and each one got or refused, as it happens)
const certificates = () => server.manage.internet().acme?.words;

if (certificates()) {
    console.log(certificates());
}

server.certifier.onChange = () => console.log(certificates() ?? "");

// (The router: what it forwards, or why it won't, said as it changes)
let routerSaid = null;

if (server.router) {
    server.router.onChange = () => {
        const saying = server.manage.internet().router?.words;

        if (saying && saying !== routerSaid) {
            console.log(saying);
        }

        routerSaid = saying ?? routerSaid;
    };
}

console.log(`On this machine: http://localhost:${port}`);
console.log(`Its management page, on this computer (no key needed): http://localhost:${adminPort}`);
console.log(`From the Wi-Fi, with the admin key: ${server.addresses()[0] ?? `http://localhost:${port}`}/admin`);
console.log(`Worlds kept: ${server.worlds.size}`);

if (server.adminKey) {
    console.log(`\nIts admin key, shown this once (keep it safe; it manages the server from the Wi-Fi, and makes worlds from the game):\n\n    ${server.adminKey}\n`);
    console.log(`Make a world on the management page (http://localhost:${adminPort}, New world), or in the game: open it from http://localhost:${port}, then Worlds on servers, add this server (localhost:${port}) and Make a world.\n`);
}

// (What Bonjour says, said here as it changes: shown on the Wi-Fi, or refused and why)
let said = null;

server.nearby.onChange = () => {
    const { as, refused } = server.nearby.state();
    const saying = refused ? refused.message : as ? `Shown to others on the Wi-Fi as "${as}".` : null;

    if (saying && saying !== said) {
        console.log(saying);
    }

    said = saying ?? said;
};
server.nearby.onChange();

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
