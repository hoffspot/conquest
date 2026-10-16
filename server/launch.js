// The world server's launcher (generated/world_server_plan.md §11, "Updating"): what server/world.js
// runs. It starts the server (server/serve.js) in a process of its own, as the version it came
// with or the newer one an update installed in the data folder (update/installed.js), whichever
// is newer, and stays while it runs: its signals passed on, what it prints left as it is (the
// menu-bar app reads its lines; its input is the server's).
//
// When the server stops to be updated (exit code RESTART), it's started again, as the version the
// update installed: tried, until it says it's running (it brings every world forward first). If
// it fails before then (it ends with an error, or says nothing for TRY_FOR), everything's put back
// as it was before the update (installed.js rollBack) and the version before is started again.
//
// What every version keeps, for a launcher older than it: server/serve.js, taking the same
// arguments; process.send({ pellagos: "running", version, worlds }) once it's serving; exit code
// RESTART to be started again; PELLAGOS_TRYING=1 in its environment while it's being tried.

import { spawn } from "node:child_process";
import path from "node:path";
import { chooseVersion, ENTRY, journalLine, rollBack, tidyVersions, writeCurrent, writeLast } from "./update/installed.js";

/** The arguments server/world.js (and so server/serve.js) takes. */
export const WORLD_OPTIONS = Object.freeze({
    port: { type: "string" },
    admin: { type: "string" },
    data: { type: "string" },
    app: { type: "boolean" },
    releases: { type: "string" },
    "release-key": { type: "string" },
    archive: { type: "string" },
    restore: { type: "string" },
    replace: { type: "boolean" },
});

/** The exit code the server ends with to be started again (an update installed). */
export const RESTART = 75;

/** How long a new version has to say it's running (ms) before it's taken to have failed. */
export const TRY_FOR = 180000;

/** What's kept of what the server says on stderr, to say why it failed (characters). */
const TAIL = 4000;

/**
 * The server run from the data folder at `root` with `args` (server/serve.js's), as the version
 * `own` ({ version, code: the folder holding server/ }) or a newer one installed there, started
 * again after each update. Resolves to the exit code to end with once it's stopped.
 */
export async function launch({ root, args = [], own, node = process.execPath, tryFor = TRY_FOR, log = (text) => console.error(text), env = process.env }) {
    let child = null;
    let stopping = false;

    for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
        process.on(signal, () => {
            stopping = true;
            child?.kill(signal);
        });
    }

    for (;;) {
        const chosen = await chooseVersion(root, own);

        // (Running its own: an update that's no newer than it, or gone, let go)
        if (chosen.code === own.code && chosen.current) {
            await writeCurrent(root, null);
            await tidyVersions(root, []);
        }

        let running = false;
        let timedOut = false;
        let said = "";
        let timer = null;

        child = spawn(node, [path.join(chosen.code, ENTRY), ...args], {
            stdio: ["inherit", "inherit", "pipe", "ipc"],
            env: { ...env, ...(chosen.trying ? { PELLAGOS_TRYING: "1" } : {}) },
        });

        child.stderr.on("data", (chunk) => {
            process.stderr.write(chunk);
            said = (said + chunk.toString("utf8")).slice(-TAIL);
        });

        child.on("message", async (message) => {
            if (message?.pellagos !== "running" || running) {
                return;
            }

            running = true;
            clearTimeout(timer);

            if (chosen.trying) {
                const when = new Date().toISOString();

                await writeCurrent(root, { ...chosen.current, state: "kept", kept: when });
                await writeLast(root, { from: chosen.current.previous, to: chosen.version, outcome: "updated", why: null, when, worlds: message.worlds ?? null });
                await tidyVersions(root, [chosen.version, chosen.current.previous]);

                const forwarded = (message.worlds ?? []).filter((one) => one.forwarded !== null).length;
                const updated = `Updated from ${chosen.current.previous} to ${chosen.version}: ${forwarded} of ${message.worlds?.length ?? 0} worlds brought forward to it. The version before stays until the next update.`;

                await journalLine(root, updated);
                log(updated);
            }
        });

        if (chosen.trying) {
            timer = setTimeout(() => {
                if (!running) {
                    timedOut = true;
                    child.kill("SIGTERM");
                    setTimeout(() => child.kill("SIGKILL"), 30000).unref();
                }
            }, tryFor);
        }

        const [code, signal] = await new Promise((resolve) => child.once("exit", (...ended) => resolve(ended)));

        clearTimeout(timer);

        if (code === RESTART && !stopping) {
            continue;
        }

        // (A version being tried that failed, not stopped as it was asked: everything put back, and the one before run again)
        if (chosen.trying && !running && !stopping && (timedOut || code !== 0)) {
            const why = timedOut ? `it didn't say it was running within ${Math.round(tryFor / 1000)} seconds` : reasonIn(said) ?? `it stopped (${signal ?? `exit code ${code}`})`;

            log(`Version ${chosen.version} didn't start (${why}): going back to ${chosen.current.previous}, and the backups made before the update.`);
            await rollBack(root, chosen.current, why, { own });
            continue;
        }

        return code ?? 1;
    }
}

/**
 * What this process says (stdout, stderr) let go nowhere once whoever read it is gone (the menu-bar
 * app quit or crashed; for the server, its launcher gone), so it carries on: the server saving every
 * world and stopping, the launcher seeing it through. Without this, the second line said after that
 * ended it there and then (EPIPE). Any other trouble saying things still ends it, as it did.
 */
export function ignoreBrokenPipes() {
    for (const output of [process.stdout, process.stderr]) {
        output.on("error", (error) => {
            if (error.code !== "EPIPE") {
                throw error;
            }
        });
    }
}

// Why a server failed, from what it said last on stderr: its last error's line
function reasonIn(said) {
    const lines = said.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const error = lines.findLast((line) => /^(\w*Error|Error)\b|^Uncaught|couldn't|can't/i.test(line));

    return error ?? lines.at(-1) ?? null;
}
