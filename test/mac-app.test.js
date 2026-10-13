// The Mac app's bundle (scripts/build-mac-app.js; generated/world_server_plan.md §11, Phase 2;
// docs/MAC_APP.md): its Info.plist and launch agent saying what macOS needs (a menu-bar app alone,
// the Local Network's reason and the Bonjour service; ProcessType Interactive, KeepAlive but not
// after Quit), agreeing with the Swift app's names; Node's archive checked against its release's
// SHASUMS256.txt and the hash kept; the bundle laid out, its server running from inside it as the
// app runs it; and the Homebrew formula. The app itself is built, signed and opened on a Mac, by
// the macOS workflow.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { AGENT_PLIST, EXECUTABLE, NODE, agentPlist, buildApp, checkArchive, formulaOf, infoPlist, nodeArchive, plistOf } from "../scripts/build-mac-app.js";
import { SERVICE } from "../server/platform/bonjour.js";
import { APP_ID } from "../server/platform/names.js";
import { SERVER_VERSION } from "../server/storage/versions.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const made = [];

after(async () => {
    await Promise.all(made.map((folder) => rm(folder, { recursive: true, force: true })));
});

async function folder() {
    const work = await mkdtemp(path.join(os.tmpdir(), "pellagos-mac-"));

    made.push(work);

    return work;
}

// (Apple's XML property lists read back, as far as the bundle writes them)
function parsePlist(xml) {
    const tokens = [...xml.replace(/<\?xml[^>]*>|<!DOCTYPE[^>]*>/g, "").matchAll(/<(\/?)(\w+)[^>]*?(\/?)>|([^<]+)/g)].filter((token) => token[4] === undefined || token[4].trim());
    let at = 0;
    const unescape = (text) => text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
    const text = () => (tokens[at][4] !== undefined ? unescape(tokens[at++][4]) : "");
    const close = (tag) => assert.equal(tokens[at++][2], tag);
    const value = () => {
        const [, closing, tag, empty] = tokens[at++];

        assert.ok(!closing, `a value, not </${tag}>`);

        if (empty) {
            return tag === "true";
        }

        if (tag === "string" || tag === "integer") {
            const read = text();

            close(tag);

            return tag === "integer" ? Number(read) : read;
        }

        if (tag === "array") {
            const list = [];

            while (tokens[at][1] !== "/") {
                list.push(value());
            }

            close("array");

            return list;
        }

        assert.equal(tag, "dict");

        const dict = {};

        while (tokens[at][1] !== "/") {
            assert.equal(tokens[at++][2], "key");

            const key = text();

            close("key");
            dict[key] = value();
        }

        close("dict");

        return dict;
    };

    assert.equal(tokens[at++][2], "plist");

    const read = value();

    close("plist");

    return read;
}

describe("the Mac app's property lists", () => {
    it("write Apple's XML, escaped, and read back as they were", () => {
        const value = { name: "Ada & <Bryn>", on: true, off: false, count: 3, list: ["a", { deep: [] }] };

        assert.deepEqual(parsePlist(plistOf(value)), value);
        assert.match(plistOf({}), /^<\?xml version="1.0" encoding="UTF-8"\?>\n<!DOCTYPE plist PUBLIC "-\/\/Apple\/\/DTD PLIST 1.0\/\/EN"/);
        assert.throws(() => plistOf({ half: 0.5 }), /whole number/);
    });

    it("make a menu-bar app alone, on macOS 13 or later, saying why it asks for the Local Network and which Bonjour service it uses", () => {
        const info = parsePlist(plistOf(infoPlist()));

        assert.equal(info.CFBundleIdentifier, APP_ID);
        assert.equal(info.CFBundleExecutable, EXECUTABLE);
        assert.equal(info.CFBundleName, "Pellagos Server");
        assert.equal(info.CFBundleShortVersionString, SERVER_VERSION);
        assert.equal(info.CFBundlePackageType, "APPL");
        assert.equal(info.LSUIElement, true);
        assert.equal(info.LSMinimumSystemVersion, "13.0");
        assert.deepEqual(info.LSArchitecturePriority, ["arm64"]);
        assert.deepEqual(info.NSBonjourServices, [SERVICE]);
        assert.match(info.NSLocalNetworkUsageDescription, /Wi-Fi/);
    });

    it("run the app at login with launchd not throttling it, started again if it fails but not after Quit", () => {
        const agent = parsePlist(plistOf(agentPlist()));

        assert.equal(agent.Label, APP_ID);
        assert.equal(agent.BundleProgram, `Contents/MacOS/${EXECUTABLE}`);
        assert.equal(agent.ProcessType, "Interactive");
        assert.deepEqual(agent.KeepAlive, { SuccessfulExit: false });
        assert.deepEqual(agent.AssociatedBundleIdentifiers, [APP_ID]);
        assert.equal(AGENT_PLIST, `${APP_ID}.plist`);
    });

    it("agree with the Swift app: its product, the agent it registers, the lines it reads and where the server is", async () => {
        const swift = (file) => readFile(path.join(root, "mac", file), "utf8");
        const app = await swift("Sources/PellagosServer/ServerProcess.swift");

        assert.match(await swift("Package.swift"), new RegExp(`executableTarget\\(name: "${EXECUTABLE}"`));
        assert.match(await swift("Sources/PellagosServer/LoginItem.swift"), new RegExp(`static let plist = "${AGENT_PLIST.replace(/\./g, "\\.")}"`));
        assert.match(app, /static let saying = "@pellagos "/);
        assert.match(app, /"Helpers\/node"/);
        assert.match(app, /"server\/world\.js"\)\.path, "--app"\]/);
    });
});

describe("Node's archive for the bundle", () => {
    const bytes = Buffer.from("node, as nodejs.org has it");
    const hash = createHash("sha256").update(bytes).digest("hex");
    const name = "node-v24.0.0-darwin-arm64.tar.gz";
    const shasums = `0000  node-v24.0.0-linux-x64.tar.gz\n${hash}  ${name}\n`;

    it("is taken when its release's SHASUMS256.txt and the hash kept agree with it", () => {
        assert.equal(checkArchive(bytes, { name, shasums, pinned: hash }), hash);
        assert.equal(checkArchive(bytes, { name, shasums }), hash);
        assert.deepEqual(nodeArchive({ version: NODE.version }), {
            name: `node-v${NODE.version}-darwin-arm64.tar.gz`,
            folder: `node-v${NODE.version}-darwin-arm64`,
            url: `https://nodejs.org/dist/v${NODE.version}/node-v${NODE.version}-darwin-arm64.tar.gz`,
            shasums: `https://nodejs.org/dist/v${NODE.version}/SHASUMS256.txt`,
        });
        assert.match(NODE.sha256, /^[0-9a-f]{64}$/);
    });

    it("is refused when it isn't listed, or either disagrees", () => {
        assert.throws(() => checkArchive(bytes, { name: "node-v24.0.0-darwin-x64.tar.gz", shasums }), /isn't in its release's SHASUMS256/);
        assert.throws(() => checkArchive(Buffer.from("something else"), { name, shasums }), /doesn't match its release's SHASUMS256/);
        assert.throws(() => checkArchive(bytes, { name, shasums, pinned: "0".repeat(64) }), /doesn't match the hash kept/);
    });
});

describe("the bundle", () => {
    it("holds the app, Node, the launch agent, and the server and game, which run from inside it as the app runs them", async () => {
        const work = await folder();
        const version = "24.0.0";
        const { name, folder: inside } = nodeArchive({ version });

        // (A stand-in for Node's archive: its binary and licence where Node's are)
        await mkdir(path.join(work, inside, "bin"), { recursive: true });
        await writeFile(path.join(work, inside, "bin/node"), "#!/bin/sh\n");
        await writeFile(path.join(work, inside, "LICENSE"), "Node's licence\n");
        execFileSync("tar", ["-czf", path.join(work, name), "-C", work, inside]);

        const archive = path.join(work, name);
        const shasums = `${createHash("sha256")
            .update(await readFile(archive))
            .digest("hex")}  ${name}\n`;
        const executable = path.join(work, "PellagosServer");

        await writeFile(executable, "the menu-bar app\n");

        const out = path.join(work, "out");
        const app = await buildApp({ out, executable, archive, shasums, pinned: null });
        const contents = path.join(app, "Contents");

        assert.equal(path.basename(app), "Pellagos Server.app");
        assert.equal(parsePlist(await readFile(path.join(contents, "Info.plist"), "utf8")).CFBundleExecutable, EXECUTABLE);
        assert.equal(parsePlist(await readFile(path.join(contents, "Library/LaunchAgents", AGENT_PLIST), "utf8")).ProcessType, "Interactive");
        assert.equal(await readFile(path.join(contents, "PkgInfo"), "utf8"), "APPL????");
        assert.equal(await readFile(path.join(contents, "MacOS", EXECUTABLE), "utf8"), "the menu-bar app\n");
        assert.equal(await readFile(path.join(contents, "Helpers/node"), "utf8"), "#!/bin/sh\n");
        assert.equal(await readFile(path.join(contents, "Resources/node/LICENSE"), "utf8"), "Node's licence\n");

        const served = path.join(contents, "Resources/app");

        assert.deepEqual(JSON.parse(await readFile(path.join(served, "package.json"), "utf8")), { name: "pellagos-server", version: SERVER_VERSION, private: true, type: "module", license: "Apache-2.0" });

        for (const file of ["server/world.js", "client/index.html", "client/admin.html", "LICENSE"]) {
            await access(path.join(served, file));
        }

        assert.ok((await stat(path.join(served, "client/js"))).isDirectory());

        // (The server from inside the bundle, as the app runs it: how it stands said, and stopped when the app's pipe closes)
        const child = spawn(process.execPath, [path.join(served, "server/world.js"), "--app", "--port", "0", "--admin", "0", "--data", path.join(work, "data")], { cwd: served, stdio: ["pipe", "pipe", "pipe"] });
        let said = "";

        child.stdout.on("data", (text) => (said += text));
        child.stderr.on("data", (text) => (said += text));

        const exited = new Promise((resolve) => child.on("exit", resolve));
        const end = Date.now() + 20000;

        while (!said.includes('"state":"running"')) {
            assert.ok(Date.now() < end, `waited for it to run: ${said}`);
            await new Promise((resolve) => setTimeout(resolve, 20));
        }

        child.stdin.end();
        assert.equal(await exited, 0);
        assert.match(said, /"state":"stopped"/);

        // (Made again over the last: the same bundle, and a tampered archive refused)
        await buildApp({ out, executable, archive, shasums, pinned: null });
        await writeFile(archive, "tampered");
        await assert.rejects(buildApp({ out, executable, archive, shasums, pinned: null }), /doesn't match its release's SHASUMS256/);
    });
});

describe("the Homebrew formula", () => {
    it("installs the server from a release's archive on Homebrew's Node, as a command and a brew service", () => {
        const formula = formulaOf({ version: "2.4.0", sha256: "ab".repeat(32) });

        assert.match(formula, /^class PellagosServer < Formula$/m);
        assert.match(formula, /url "https:\/\/github\.com\/hoffspot\/conquest\/releases\/download\/server-v2\.4\.0\/pellagos-server-2\.4\.0\.tar\.gz"/);
        assert.match(formula, new RegExp(`sha256 "${"ab".repeat(32)}"`));
        assert.match(formula, /depends_on "node"/);
        assert.match(formula, /"#\{libexec\}\/server\/world\.js" "\$@"/);
        assert.match(formula, /service do\n {4}run \[opt_bin\/"pellagos-server"\]\n {4}keep_alive successful_exit: false\n {4}process_type :interactive/);
        assert.match(formulaOf({ sha256: "cd".repeat(32), url: "file:///tmp/x.tar.gz" }), /url "file:\/\/\/tmp\/x\.tar\.gz"/);
    });
});
