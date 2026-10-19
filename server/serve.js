// The world server itself (generated/world_server_plan.md §11, Phase 1), as its launcher
// (server/world.js, launch.js) runs it: in a process of its own, as the version it came with or
// one an update installed (update/installed.js). Its arguments are server/world.js's:
//
//   npm run world-server                         its data where this system keeps an app's (platform/)
//   node server/world.js --port 8480 --data <folder>
//   node server/world.js --app                   as the menu-bar app runs it (plan §11, Phase 2)
//   node server/world.js --releases <url> --release-key <file>
//                                                another place to look for new versions, and the key
//                                                they're signed with (a release tried before it's
//                                                published; the tests)
//   node server/world.js --archive <file or folder>
//                                                the whole server (its data folder) as one archive
//                                                (storage/archive.js), then done: with it stopped, as
//                                                the Mac installer's --uninstall makes one
//   node server/world.js --restore <archive> [--replace]
//                                                an archive staged to be put in place when the server
//                                                next starts (what's there kept in backups), then
//                                                done; refused where there are worlds, but --replace
//
// It says where it can be reached at home, its id, its management page (on this computer, needing
// no key; from the Wi-Fi at /admin, with the admin key), and, the first time, its admin key (shown
// then alone: keep it). It shows itself to others on the Wi-Fi with Bonjour (its `bonjour`
// setting), saying so, or why macOS refused. With a certificate and its `internet` setting on, it
// says where the internet reaches it (over TLS alone); getting free certificates (certify.js), how
// that stands, and each one got or refused; what the router forwards, or why it won't; and where
// Tailscale Funnel brings the internet in, or why it won't.
// Ctrl-C (or SIGTERM: the menu-bar app's Stop and Quit), or Stop on the management page, saves
// every world and stops. Updated from the management page, it saves every world and stops with
// launch.js RESTART, for its launcher to start the new version; and a new version, being tried,
// brings every world forward before it listens, ending with an error if it can't (its launcher
// then goes back to the version before).
//
// With --app, it also says how it stands for the menu-bar app (mac/), on lines of their own, each
// time that changes: "@pellagos " then { state ("running", "stopping", "updating", "stopped"),
// players (in any world now), worlds (going), awake (the machine kept awake for them), page (its
// management page), play (where the game is), version }. And it stops (saving every world) when
// what it reads from ends: the app gives it a pipe, so if the app's gone (quit, or crashed), so
// is it, and the port's free for the app's next start. So it does if its launcher's gone.

import { readFileSync } from "node:fs";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { ignoreBrokenPipes, RESTART, WORLD_OPTIONS } from "./launch.js";
import { bonjour, folders } from "./platform/index.js";
import { archiveFolder, ArchiveError, readArchive, stageRestore, worldIds } from "./storage/archive.js";
import { FILE_MODE } from "./storage/files.js";
import { SETTINGS_FILE } from "./storage/folder.js";
import { SERVER_VERSION } from "./storage/versions.js";
import { WorldServer } from "./world-server.js";

// (Its worlds still saved once nobody's left reading what it says)
ignoreBrokenPipes();

const { values } = parseArgs({ options: WORLD_OPTIONS });
const root = path.resolve(values.data ?? folders().data);

// (An archive of the data folder made, or one staged to be restored, and done: --archive, --restore)
if (values.archive) {
    // (Named for the server: its `name` setting, else the computer)
    const named = await readFile(path.join(root, SETTINGS_FILE), "utf8")
        .then((text) => JSON.parse(text).name)
        .catch(() => null);
    const { name, body, worlds } = await archiveFolder(root, { name: (typeof named === "string" && named) || os.hostname().replace(/\.local$/, "") });
    const into = path.resolve(values.archive);
    const file = (await stat(into).catch(() => null))?.isDirectory() ? path.join(into, name) : into;

    await writeFile(file, body, { mode: FILE_MODE });
    console.log(`The server's archive (${worlds} world${worlds === 1 ? "" : "s"}, from ${root}): ${file}`);
    console.log("Keep it safe: it holds what the server proves itself with, and its keys' hashes.");
    process.exit(0);
}

if (values.restore) {
    try {
        const archive = readArchive(await readFile(path.resolve(values.restore)));
        const here = await readdir(path.join(root, "worlds")).catch(() => []);

        if (here.length && !values.replace) {
            console.error(`Error: ${root} has worlds of its own (${here.length}): restoring puts the archive in place of everything there. Add --replace to do it all the same (what's there is kept in its backups).`);
            process.exit(1);
        }

        await stageRestore(root, archive, { by: "the command line" });
        console.log(`The archive (${worldIds(archive).length} worlds, made by Pellagos server ${archive.archivedBy ?? "(unknown)"}) is put in place when the server next starts, in ${root}; what's there now is kept in its backups.`);
        process.exit(0);
    } catch (error) {
        console.error(`Error: ${error instanceof ArchiveError ? error.message : `the archive couldn't be read (${error.message})`}`);
        process.exit(1);
    }
}
const update = { ...(values.releases ? { releases: values.releases } : {}), ...(values["release-key"] ? { key: readFileSync(values["release-key"], "utf8") } : {}) };
const server = await WorldServer.open(root, { onStop: () => stop(), onRestart: () => stop(RESTART), bonjour: bonjour(), update });

// (A new version being tried: every world brought forward before anyone's let in. If one can't
// be, it ends with why, and its launcher goes back to the version before)
let forwarded = null;

if (process.env.PELLAGOS_TRYING === "1") {
    try {
        forwarded = await server.manage.bringForward();
    } catch (error) {
        console.error(`Error: version ${SERVER_VERSION} couldn't bring every world forward: ${error.message}`);
        await server.close().catch(() => {});
        process.exit(1);
    }

    console.log(`Version ${SERVER_VERSION} brought ${forwarded.filter((one) => one.forwarded !== null).length} of ${forwarded.length} worlds forward.`);
}

const port = await server.listen(values.port === undefined ? undefined : Number(values.port));
const adminPort = await server.listenAdmin(values.admin === undefined ? undefined : Number(values.admin));

// (Stopped by a signal from the moment it's listening, before it says so: a signal that came
// before the handlers would end it there and then, every world unsaved)
let stopping = false;
let restarting = false;

// (How it stands, for the menu-bar app: a line whenever that changes, looked at every second)
const SAYING = "@pellagos ";
let told = null;

const tell = (state = restarting ? "updating" : stopping ? "stopping" : "running") => {
    const players = [...server.registry.entries.values()].reduce((sum, entry) => sum + (entry.thread?.state?.present ?? 0), 0);
    const line = JSON.stringify({ state, players, worlds: server.registry.going.length, awake: Boolean(server.registry.holding), page: `http://localhost:${adminPort}/`, play: `http://localhost:${port}/`, version: SERVER_VERSION });

    if (values.app && line !== told) {
        told = line;
        console.log(`${SAYING}${line}`);
    }
};

const stop = async (code = 0) => {
    if (stopping) {
        return;
    }

    stopping = true;
    restarting = code === RESTART;
    tell();
    console.log(restarting ? "Saving every world and stopping, to start again as the new version..." : "Saving every world and stopping...");
    await server.close();
    tell(restarting ? "updating" : "stopped");
    process.exit(code);
};

process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());

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

// (Tailscale Funnel: where it brings the internet in, or why it won't, said as it changes)
let funnelSaid = null;

if (server.funnel) {
    server.funnel.onChange = () => {
        const saying = server.settings.get("funnel") ? server.manage.internet().funnel?.words : null;

        if (saying && saying !== funnelSaid) {
            console.log(saying);
        }

        funnelSaid = saying ?? funnelSaid;
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

if (values.app) {
    tell();
    setInterval(() => tell(), 1000).unref();
}

if (values.app) {
    process.stdin.on("end", () => stop());
    process.stdin.resume();
}

// (Run by its launcher: it's told it's running, which a version being tried waits for; and if the
// launcher's gone, so is it)
if (process.send) {
    process.on("disconnect", () => stop());
    process.send({ pellagos: "running", version: SERVER_VERSION, worlds: forwarded });
}

server.updater.start();
