// The world server as the menu-bar app runs it (server/world.js --app; generated/world_server_plan.md
// §11, Phase 2): how it stands said on lines of its own ("@pellagos " then JSON) when it starts,
// and on SIGTERM (the app's Stop and Quit) stopping, then stopped once every world's saved; stopped
// the same way when the app's pipe to it closes (the app gone), and so with a world going and
// nobody left reading what it says (its saying failing, EPIPE); and without --app, none of those
// lines.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { ADMIN_HEADER, ADMIN_VALUE } from "../server/admin.js";
import { JOURNAL, NOW, STATE, WORLDS } from "../server/storage/worlds.js";

const WORLD = fileURLToPath(new URL("../server/world.js", import.meta.url));
const SAYING = "@pellagos ";
const made = [];

after(async () => {
    await Promise.all(made.map((folder) => rm(folder, { recursive: true, force: true })));
});

// The server run with these arguments: { folder (its data), said (every line), told (each "@pellagos" line's JSON), until(test), stop() → exit code }
async function run(...args) {
    const folder = await mkdtemp(path.join(os.tmpdir(), "pellagos-app-"));

    made.push(folder);

    const child = spawn(process.execPath, [WORLD, "--port", "0", "--admin", "0", "--data", folder, ...args], { stdio: ["pipe", "pipe", "pipe"] });
    const record = { folder, said: [], told: [], errors: "" };
    let rest = "";

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (text) => {
        const lines = (rest + text).split("\n");

        rest = lines.pop();

        for (const line of lines) {
            record.said.push(line);

            if (line.startsWith(SAYING)) {
                record.told.push(JSON.parse(line.slice(SAYING.length)));
            }
        }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (text) => (record.errors += text));

    const exited = new Promise((resolve) => child.on("exit", (code) => resolve(code)));

    record.until = async (test, what, ms = 20000) => {
        const end = Date.now() + ms;

        while (!test()) {
            assert.ok(Date.now() < end, `waited for ${what}: ${record.said.join("\n")}${record.errors}`);
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
    };
    // (Stopped by SIGTERM, or by its input closed; and "gone", with nobody left reading what it says)
    record.stop = async ({ how = "SIGTERM" } = {}) => {
        if (how === "SIGTERM") {
            child.kill("SIGTERM");
        } else {
            if (how === "gone") {
                child.stdout.destroy();
            }

            child.stdin.end();
        }

        const code = await exited;

        record.said.push(...(rest ? [rest] : []));

        return code;
    };

    return record;
}

describe("the world server for the menu-bar app (--app)", () => {
    it("says it's running, where its pages are and its version; then, on SIGTERM, stopping and stopped, and leaves", async () => {
        const server = await run("--app");

        await server.until(() => server.said.some((line) => line.startsWith("Worlds kept")), "it started");
        await server.until(() => server.told.length, "how it stands");

        const [first] = server.told;

        assert.equal(first.state, "running");
        assert.equal(first.players, 0);
        assert.equal(first.worlds, 0);
        assert.equal(first.awake, false);
        assert.match(first.page, /^http:\/\/localhost:\d+\/$/);
        assert.match(first.play, /^http:\/\/localhost:\d+\/$/);
        assert.notEqual(first.page, first.play);
        assert.match(first.version, /^\d+\.\d+\.\d+/);

        assert.equal(await server.stop(), 0);
        assert.deepEqual(
            server.told.map((one) => one.state),
            ["running", "stopping", "stopped"],
        );
        assert.ok(server.said.indexOf("Saving every world and stopping...") < server.said.findIndex((line) => line.includes('"stopped"')));
    });

    it("stops the same way when the app's pipe to it closes", async () => {
        const server = await run("--app");

        await server.until(() => server.told.length, "how it stands");
        assert.equal(await server.stop({ how: "closed" }), 0);
        assert.deepEqual(
            server.told.map((one) => one.state),
            ["running", "stopping", "stopped"],
        );
    });

    it("still saves every world and stops when nobody's left reading what it says (the app crashed)", async () => {
        const server = await run("--app");

        await server.until(() => server.told.length, "how it stands");

        // (A world made and started from its management page, as if someone were coming in)
        const page = server.told[0].page;
        const cookie = (await fetch(page)).headers.getSetCookie()[0].split(";")[0];
        const manage = (route, body) => fetch(new URL(`api/v1${route}`, page), { method: "POST", headers: { Cookie: cookie, [ADMIN_HEADER]: ADMIN_VALUE, "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const { world } = await (await manage("/worlds", { name: "Ashby", race: "human", seed: 3 })).json();

        assert.equal((await manage(`/worlds/${world}/start`, {})).status, 200);
        await server.until(() => server.told.at(-1).worlds === 1, "the world going");

        // (Once, the second thing it said with nobody reading ended it there and then, the world unsaved)
        assert.equal(await server.stop({ how: "gone" }), 0, server.errors);
        assert.match(await readFile(path.join(server.folder, WORLDS, world, JOURNAL), "utf8"), /Saved \(the server stopped\)\./);
        assert.ok((await stat(path.join(server.folder, WORLDS, world, STATE, NOW))).size > 0);
    });

    it("says none of that without --app", async () => {
        const server = await run();

        await server.until(() => server.said.some((line) => line.startsWith("Worlds kept")), "it started");
        assert.equal(await server.stop(), 0);
        assert.deepEqual(server.told, []);
    });
});
