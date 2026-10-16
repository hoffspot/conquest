// The Mac installer (scripts/install-mac.sh; docs/MAC_APP.md, "Installing it"), run here with
// stand-ins for the Mac's own tools (uname, sw_vers, curl, osascript, plutil, codesign, ditto, ...),
// each noting how it was asked: the newest server release found in GitHub's answer as the
// updater finds it, its zip checked against GitHub's SHA-256, the app checked (its id, its
// signature) before it's put in place of the one there, a running one stopped first and every
// world left as it was; a zip at hand taken off as downloaded; built from the source, with a Node
// fetched and checked if there's none here; and taken away again, everything it keeps with it
// (stopped first, every world saved to an archive if the answer's yes, or with nobody to ask;
// nothing taken away if the archive can't be made), or the app alone with --keep-data; from the
// app's Uninstall…, saying how it went in a dialog. On a Mac, the macOS workflow runs it for real.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import { access, chmod, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { EXECUTABLE, NODE, REPOSITORY, infoPlist, plistOf } from "../scripts/build-mac-app.js";
import { APP_ID, APP_NAME } from "../server/platform/names.js";
import { RELEASES, RELEASE_TAG, latestRelease } from "../server/update/releases.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(root, "scripts/install-mac.sh");
const APP = `${APP_NAME}.app`;
const made = [];

after(async () => {
    await Promise.all(made.map((folder) => rm(folder, { recursive: true, force: true })));
});

async function folder() {
    const work = await mkdtemp(path.join(os.tmpdir(), "pellagos-install-"));

    made.push(work);

    return work;
}

const exists = (file) => access(file).then(() => true, () => false);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

// The Mac's tools, as far as the installer asks them; each notes its arguments in calls.log
const TOOLS = {
    uname: `say(process.env.STUB_SYSTEM ?? "Darwin");`,
    sysctl: `args.join(" ") === "-n hw.optional.arm64" ? say(process.env.STUB_ARM64 ?? "1") : process.exit(1);`,
    sw_vers: `say(process.env.STUB_MACOS ?? "15.4");`,
    // (A URL's answer is the file the test gave for it; nothing else is reached)
    curl: `
        const url = args.find((one) => /^(https?|file):\\/\\//.test(one));
        const proto = args[args.indexOf("--proto") + 1];
        const scheme = url.split(":")[0];
        if (!proto.split(/[=,]/).includes(scheme)) { process.stderr.write("protocol " + scheme + " not allowed"); process.exit(1); }
        const answers = JSON.parse(fs.readFileSync(path.join(stub, "urls.json"), "utf8"));
        if (!(url in answers)) { process.stderr.write("curl: (22) 404 " + url); process.exit(22); }
        const out = args.includes("-o") ? args[args.indexOf("-o") + 1] : null;
        out ? fs.copyFileSync(answers[url], out) : process.stdout.write(fs.readFileSync(answers[url]));`,
    // (JavaScript run as osascript runs it: its run handler given the arguments, its answer said)
    osascript: `
        if (args[0] === "-l" && args[1] === "JavaScript" && args[2] === "-e") {
            const run = new Function(args[3] + "; return run;")();
            say(String(run(args.slice(4))));
        }`,
    plutil: `
        const [, key, , , , file] = args;
        const found = new RegExp("<key>" + key + "</key>\\\\s*<string>([^<]*)</string>").exec(fs.readFileSync(file, "utf8"));
        found ? say(found[1]) : process.exit(1);`,
    // (An app with Contents/TAMPERED in it has been changed since it was signed)
    codesign: `process.exit(fs.existsSync(path.join(args.at(-1), "Contents/TAMPERED")) ? 1 : 0);`,
    ditto: `
        const result = args[0] === "-x"
            ? child.spawnSync("unzip", ["-q", args[2], "-d", args[3]])
            : child.spawnSync("cp", ["-R", args[0], args[1]]);
        process.exit(result.status);`,
    xattr: ``,
    // (The app running while the file "running" is there, its server while "serving" is; each
    // stopped when it's told, unless it's stuck. The app stopped while its server's still going
    // leaves the server unheard, its worlds perhaps unsaved: "unsaved")
    pgrep: `process.exit(fs.existsSync(path.join(stub, args[0] === "-f" ? "serving" : "running")) ? 0 : 1);`,
    pkill: `
        if (process.env.STUB_STUCK) { process.exit(0); }
        if (args[1] === "-x" && fs.existsSync(path.join(stub, "serving"))) { fs.writeFileSync(path.join(stub, "unsaved"), ""); }
        fs.rmSync(path.join(stub, args[1] === "-f" ? "serving" : "running"), { force: true });`,
    launchctl: ``,
    open: ``,
    // (Its Keychain entries: as many as the file "keychain" says, each delete taking one, till none's left)
    security: `
        const file = path.join(stub, "keychain");
        const left = Number(fs.existsSync(file) ? fs.readFileSync(file, "utf8") : 0);
        if (args[0] !== "delete-generic-password" || left === 0) { process.exit(44); }
        fs.writeFileSync(file, String(left - 1));`,
    defaults: ``,
    // (Waits noted, not waited)
    sleep: ``,
    "xcode-select": `if (args[0] === "-p" && process.env.STUB_NO_TOOLS) { process.exit(2); }`,
    // (Swift's build: the menu-bar app's executable, where --show-bin-path says)
    swift: `
        const bin = path.join(stub, "swift-bin");
        if (args.includes("--show-bin-path")) { say(bin); } else { fs.mkdirSync(bin, { recursive: true }); fs.writeFileSync(path.join(bin, "PellagosServer"), "app"); }`,
};

// A stand-in Node for --build: its version (STUB_NODE_MAJOR), and the bundle's build, making the
// zip given to it (STUB_BUILT) where it's told to
const NODE_STUB = `
    if (args[0] === "-p") { say(process.env.STUB_NODE_MAJOR ?? "24"); process.exit(0); }
    const out = args[args.indexOf("--out") + 1];
    fs.mkdirSync(out, { recursive: true });
    fs.copyFileSync(process.env.STUB_BUILT, path.join(out, "Pellagos-Server-9.9.9-arm64.zip"));`;

// The app's own Node, making the archive as server/world.js --archive does (of the worlds in its
// data folder, as they are), unless STUB_ARCHIVE_FAILS; a file left half made, as one cut off is
const ARCHIVER = `
    const file = args[args.indexOf("--archive") + 1];
    if (process.env.STUB_ARCHIVE_FAILS) { fs.writeFileSync(file, "half"); process.exit(1); }
    fs.writeFileSync(file, "every world: " + fs.readdirSync(path.join(process.env.HOME, "Library/Application Support", ${JSON.stringify(APP_ID)}, "worlds")).join(", "));
    say("The server's archive: " + file);`;

const stubOf = (name, body) => `#!${process.execPath}
const fs = require("node:fs"), path = require("node:path"), child = require("node:child_process");
const args = process.argv.slice(2), stub = process.env.STUB_DIR;
const say = (text) => process.stdout.write(text + "\\n");
fs.appendFileSync(path.join(stub, "calls.log"), JSON.stringify([${JSON.stringify(name)}, ...args]) + "\\n");
${body}
`;

async function tools(into, list) {
    await mkdir(into, { recursive: true });

    for (const [name, body] of Object.entries(list)) {
        await writeFile(path.join(into, name), stubOf(name, body));
        await chmod(path.join(into, name), 0o755);
    }
}

// The app's zip, as build-mac-app.js makes it: Pellagos Server.app with its Info.plist (another
// id, or tampered with, if asked)
async function appZip(work, { version = "9.9.9", id = APP_ID, tampered = false, name = `app-${version}.zip` } = {}) {
    const into = path.join(work, `zip-${name}`);
    const contents = path.join(into, APP, "Contents");

    await mkdir(path.join(contents, "MacOS"), { recursive: true });
    await writeFile(path.join(contents, "Info.plist"), plistOf({ ...infoPlist({ version }), CFBundleIdentifier: id }));
    await writeFile(path.join(contents, "MacOS", EXECUTABLE), `the menu-bar app, ${version}`);

    if (tampered) {
        await writeFile(path.join(contents, "TAMPERED"), "changed");
    }

    const zip = path.join(work, name);

    execFileSync("zip", ["-q", "-r", "-y", zip, APP], { cwd: into });

    return zip;
}

const release = (version, { zip = null, digest = zip ? `sha256:${sha256(zip.bytes)}` : null, draft = false, prerelease = false, tag = `server-v${version}` } = {}) => ({
    tag_name: tag,
    draft,
    prerelease,
    body: `Version ${version}`,
    assets: [
        ...(zip ? [{ name: `Pellagos-Server-${version}-arm64.zip`, browser_download_url: zip.url, digest }] : []),
        { name: `pellagos-server-${version}.tar.gz`, browser_download_url: `https://example.invalid/${version}.tar.gz`, digest: null },
        { name: `pellagos-server-${version}.tar.gz.sig`, browser_download_url: `https://example.invalid/${version}.sig`, digest: null },
    ],
});

const downloadUrl = (version) => `https://github.com/${REPOSITORY}/releases/download/server-v${version}/Pellagos-Server-${version}-arm64.zip`;

// A Mac of stand-ins: { run(args, env) → { status, out, err, calls }, home, stub, answer(url, file) }
async function mac() {
    const work = await folder();
    const stub = path.join(work, "stub");
    const bin = path.join(work, "bin");
    const home = path.join(work, "home");

    await mkdir(stub, { recursive: true });
    await mkdir(home, { recursive: true });
    await tools(bin, TOOLS);
    await writeFile(path.join(stub, "urls.json"), "{}");

    const answers = {};

    return {
        work,
        home,
        stub,
        bin,
        async answer(url, file) {
            answers[url] = file;
            await writeFile(path.join(stub, "urls.json"), JSON.stringify(answers));
        },
        async releases(list) {
            const file = path.join(work, `releases-${Object.keys(answers).length}.json`);

            await writeFile(file, JSON.stringify(list));
            await this.answer(RELEASES, file);
        },
        // (A release's zip: its bytes and where GitHub has it, answered)
        async published(version, options) {
            const file = await appZip(work, { version, ...options });
            const url = downloadUrl(version);

            await this.answer(url, file);

            return { url, bytes: await readFile(file), file };
        },
        running: () => Promise.all([writeFile(path.join(stub, "running"), ""), writeFile(path.join(stub, "serving"), "")]),
        unsaved: () => exists(path.join(stub, "unsaved")),
        // (Run from its file, or piped into bash as curl gives it: `piped`, the script's text, all or some)
        run(args, env = {}, { extraBin = null, piped = null, cwd = undefined } = {}) {
            const result = spawnSync("bash", piped === null ? [SCRIPT, ...args] : ["-s", "--", ...args], {
                input: piped ?? undefined,
                cwd,
                encoding: "utf8",
                env: { PATH: [extraBin, bin, process.env.PATH].filter(Boolean).join(":"), HOME: home, TMPDIR: work, STUB_DIR: stub, PELLAGOS_TTY: path.join(work, "no-terminal"), ...env },
            });
            const log = path.join(stub, "calls.log");
            const calls = (readFileSync(log, { encoding: "utf8", flag: "a+" }).trim().split("\n").filter(Boolean)).map((line) => JSON.parse(line));

            rmSync(log, { force: true });

            return { status: result.status, out: result.stdout, err: result.stderr, calls };
        },
    };
}

// Everything Pellagos Server keeps on a Mac besides the app, in ~/Library (install-mac.sh KEPT)
const KEPT = [`Application Support/${APP_ID}`, `Logs/${APP_ID}`, `Caches/${APP_ID}`, `Saved Application State/${APP_ID}.savedState`, `HTTPStorages/${APP_ID}`, `Preferences/${APP_ID}.plist`];

// Pellagos Server as a Mac has it, running: the app in ~/Applications (unless `app` is false) with
// its own Node, and everything it keeps besides: its data folder (a world in it, unless `worlds`
// is false), logs, caches, preferences and `keychain` Keychain entries. Says where ~/Library is.
async function installed(m, { app = true, worlds = true, keychain = 0 } = {}) {
    const library = path.join(m.home, "Library");

    if (app) {
        await tools(path.join(m.home, "Applications", APP, "Contents/Helpers"), { node: ARCHIVER });
    }

    for (const place of KEPT) {
        const at = path.join(library, place);

        await mkdir(place.endsWith(".plist") ? path.dirname(at) : at, { recursive: true });
        await writeFile(place.endsWith(".plist") ? at : path.join(at, "kept"), "kept");
    }

    if (worlds) {
        await mkdir(path.join(library, KEPT[0], "worlds", "thornwick"), { recursive: true });
    }

    await writeFile(path.join(m.stub, "keychain"), String(keychain));
    await m.running();

    return { library };
}

// Which of the places it keeps are still in ~/Library
const left = async (library) => (await Promise.all(KEPT.map(async (place) => ((await exists(path.join(library, place))) ? place : null)))).filter(Boolean);

// A terminal answering `answer` to the question asked
async function answered(m, answer) {
    const file = path.join(m.work, `tty-${answer}`);

    await writeFile(file, `${answer}\n`);

    return file;
}

const called = (calls, name) => calls.filter((call) => call[0] === name).map((call) => call.slice(1));
const versionOf = async (app) => /<key>CFBundleShortVersionString<\/key>\s*<string>([^<]*)</.exec(await readFile(path.join(app, "Contents/Info.plist"), "utf8"))[1];

describe("the Mac installer", () => {
    it("installs the newest server release's app, its zip checked against GitHub's SHA-256, then opens it", async () => {
        const m = await mac();
        const newest = await m.published("9.9.9");
        const older = await m.published("9.9.8");
        const to = path.join(m.work, "Applications");

        // (Not in order; a pre-release, a draft and the game's own tags passed over)
        await m.releases([release("9.9.8", { zip: older }), release("9.9.10", { zip: newest, prerelease: true }), release("1.0.0", { tag: "v1.0.0", zip: newest }), release("9.9.9", { zip: newest }), release("9.9.11", { zip: newest, draft: true })]);

        const { status, out, err, calls } = m.run(["--to", to]);

        assert.equal(status, 0, err);
        assert.match(out, /Installed Pellagos Server 9\.9\.9 in /);
        assert.equal(await versionOf(path.join(to, APP)), "9.9.9");
        assert.deepEqual(called(calls, "open"), [[path.join(to, APP)]]);
        assert.ok(called(calls, "codesign").some((call) => call.includes("--verify") && call.includes("--deep") && call.includes("--strict")), "its signature checked");
        assert.ok(called(calls, "curl").every((call) => call[call.indexOf("--proto") + 1] === "=https"), "over HTTPS alone");
        assert.match(out, /Open the management page/);
    });

    it("picks the release the updater would (releases.js latestRelease), and a version asked for", async () => {
        const m = await mac();
        const zip = { url: "https://example.invalid/zip", bytes: Buffer.from("zip") };
        const list = [release("2.0.1", { zip }), release("2.10.0", { zip }), release("2.9.0", { zip }), release("3.0.0", { zip, prerelease: true })];
        const pick = await readFile(SCRIPT, "utf8").then((text) => /^PICK='([\s\S]*?)'$/m.exec(text)[1]);
        const run = new Function(`${pick}; return run;`)();

        assert.equal(run([JSON.stringify(list), ""]).split("\t")[0], latestRelease(list).version);
        assert.equal(run([JSON.stringify(list), "2.0.1"]).split("\t")[0], "2.0.1");
        assert.equal(run([JSON.stringify(list), "4.0.0"]), "");
        assert.equal(run(["[]", ""]), "");

        // (And the whole of it, asked for one)
        const older = await m.published("9.9.8");
        const newest = await m.published("9.9.9");

        await m.releases([release("9.9.9", { zip: newest }), release("9.9.8", { zip: older })]);

        const { status, err } = m.run(["--version", "9.9.8", "--to", path.join(m.work, "A"), "--no-open"]);

        assert.equal(status, 0, err);
        assert.equal(await versionOf(path.join(m.work, "A", APP)), "9.9.8");
    });

    it("refuses a download that isn't the zip GitHub has, or one GitHub gives no SHA-256 for: nothing installed", async () => {
        const m = await mac();
        const zip = await m.published("9.9.9");
        const to = path.join(m.work, "Applications");

        await m.releases([release("9.9.9", { zip, digest: `sha256:${"0".repeat(64)}` })]);

        let { status, err } = m.run(["--to", to]);

        assert.equal(status, 1);
        assert.match(err, /the download isn't the zip GitHub has/);
        assert.equal(await exists(path.join(to, APP)), false);

        await m.releases([release("9.9.9", { zip, digest: null })]);
        ({ status, err } = m.run(["--to", to]));
        assert.equal(status, 1);
        assert.match(err, /can't be checked: not installed/);
        assert.equal(await exists(path.join(to, APP)), false);
    });

    it("builds it here when there's no release with the Mac app yet; a version asked for that isn't there, refused", async () => {
        const m = await mac();

        await m.releases([release("9.9.9")]);

        // (On to building it: here without the Command Line Tools, so their installer's opened)
        const { status, out, calls } = m.run([], { STUB_NO_TOOLS: "1" });

        assert.equal(status, 1);
        assert.match(out, /There's no release of Pellagos Server with the Mac app yet: building it on this Mac instead/);
        assert.match(out, /needs Apple's Command Line Tools/);
        assert.deepEqual(called(calls, "xcode-select").at(-1), ["--install"]);

        const asked = m.run(["--version", "9.9.9"], { STUB_NO_TOOLS: "1" });

        assert.equal(asked.status, 1);
        assert.match(asked.err, /there's no release of Pellagos Server 9\.9\.9 with the Mac app/);
        assert.deepEqual(called(asked.calls, "xcode-select"), []);
    });

    it("refuses an app that isn't Pellagos Server, or has been changed since it was signed", async () => {
        const m = await mac();
        const to = path.join(m.work, "Applications");

        let { status, err } = m.run(["--zip", await appZip(m.work, { id: "com.example.other", name: "other.zip" }), "--to", to]);

        assert.equal(status, 1);
        assert.match(err, /isn't Pellagos Server \(it's com\.example\.other\)/);

        ({ status, err } = m.run(["--zip", await appZip(m.work, { tampered: true, name: "tampered.zip" }), "--to", to]));
        assert.equal(status, 1);
        assert.match(err, /signature doesn't check/);
        assert.equal(await exists(path.join(to, APP)), false);

        await writeFile(path.join(m.work, "not.zip"), "not a zip");
        ({ status, err } = m.run(["--zip", path.join(m.work, "not.zip"), "--to", to]));
        assert.equal(status, 1);
        assert.match(err, /isn't a zip that opens/);
    });

    it("installs a zip at hand, taken off as downloaded so macOS opens it without Open Anyway; into ~/Applications when /Applications can't be written to", async () => {
        const m = await mac();
        const zip = await appZip(m.work);
        const { status, err, calls } = m.run(["--zip", zip]);

        assert.equal(status, 0, err);
        assert.equal(await versionOf(path.join(m.home, "Applications", APP)), "9.9.9");
        assert.ok(called(calls, "xattr").some((call) => call[0] === "-dr" && call[1] === "com.apple.quarantine" && call[2].endsWith(APP)), "its download mark taken off");
    });

    it("stops a running Pellagos Server first as Quit does (its server, then the app, its login item let go of), and replaces the one there", async () => {
        const m = await mac();
        const to = path.join(m.work, "Applications");

        await mkdir(path.join(to, APP, "Contents"), { recursive: true });
        await writeFile(path.join(to, APP, "Contents", "OLD"), "the version before");
        await m.running();

        const { status, out, err, calls } = m.run(["--zip", await appZip(m.work), "--to", to]);

        assert.equal(status, 0, err);
        assert.match(out, /Stopping Pellagos Server \(every world is saved first\)/);
        // (And between the two, a moment for the app to log the last its server said)
        assert.deepEqual(
            calls.filter((call) => call[0] === "pkill" || call[0] === "launchctl" || call[0] === "sleep"),
            [
                ["pkill", "-TERM", "-f", `/${APP}/Contents/Helpers/node`],
                ["sleep", "2"],
                ["launchctl", "bootout", `gui/${process.getuid()}/${APP_ID}`],
                ["pkill", "-TERM", "-x", EXECUTABLE],
            ],
        );
        assert.equal(await m.unsaved(), false, "the server stopped before the app");
        assert.ok(calls.findIndex((call) => call[0] === "pkill") < calls.findIndex((call) => call[0] === "ditto" && call[1] !== "-x"), "stopped before it's replaced");
        assert.equal(await exists(path.join(to, APP, "Contents", "OLD")), false);
        assert.equal(await versionOf(path.join(to, APP)), "9.9.9");
    });

    it("leaves the one there as it was if Pellagos Server won't stop", async () => {
        const m = await mac();
        const to = path.join(m.work, "Applications");

        await mkdir(path.join(to, APP, "Contents"), { recursive: true });
        await writeFile(path.join(to, APP, "Contents", "OLD"), "the version before");
        await m.running();

        const { status, err } = m.run(["--zip", await appZip(m.work), "--to", to], { STUB_STUCK: "1", PELLAGOS_PATIENCE: "1" });

        assert.equal(status, 1);
        assert.match(err, /still running\. Quit it from its menu/);
        assert.equal(await exists(path.join(to, APP, "Contents", "OLD")), true);
    });

    it("refuses anything but a Mac with Apple silicon on macOS 13 or later", async () => {
        const m = await mac();

        assert.match(m.run([], { STUB_SYSTEM: "Linux" }).err, /this installs the Mac app/);
        assert.match(m.run([], { STUB_ARM64: "0" }).err, /needs a Mac with Apple silicon/);
        assert.match(m.run([], { STUB_MACOS: "12.7.6" }).err, /needs macOS 13 or later; this Mac has 12\.7\.6/);
        assert.match(m.run(["--wat"]).err, /unknown option: --wat/);
        assert.equal(m.run(["--help"]).status, 0);
    });

    it("takes everything it keeps off the Mac, stopped first, every world saved to an archive first if the answer's yes: the app, its worlds and settings, its logs, caches, preferences and Keychain entries", async () => {
        const m = await mac();
        const { library } = await installed(m, { keychain: 2 });
        const { status, out, err, calls } = m.run(["--uninstall"], { PELLAGOS_TTY: await answered(m, "y") });
        const archives = await readdir(path.join(m.home, "Documents"));
        const archive = path.join(m.home, "Documents", archives[0]);

        assert.equal(status, 0, err);
        assert.match(out, /Save every world to an archive in .*\/Documents before it's all taken away\? \[Y\/n\]/);
        assert.equal(archives.length, 1);
        assert.match(archives[0], /^Pellagos-Server-archive-\d{4}-\d\d-\d\d-\d{6}\.pellagos-archive$/);
        assert.equal(await readFile(archive, "utf8"), "every world: thornwick", "made by the app's own server, its worlds still there");
        assert.deepEqual(called(calls, "node"), [[path.join(m.home, "Applications", APP, "Contents/Resources/app/server/world.js"), "--archive", archive]]);
        assert.ok(calls.findIndex((call) => call[0] === "pkill") < calls.findIndex((call) => call[0] === "node"), "stopped, every world saved, before it's archived");
        assert.equal(await m.unsaved(), false);
        assert.equal(await exists(path.join(m.home, "Applications", APP)), false);
        assert.deepEqual(await left(library), []);
        assert.deepEqual(called(calls, "defaults"), [["delete", APP_ID]]);
        assert.deepEqual(called(calls, "security"), Array(3).fill(["delete-generic-password", "-s", APP_NAME]), "one at a time, till none's left");
        assert.match(out, /Took everything Pellagos Server kept off this Mac: its worlds and settings, its logs, caches and preferences, and its 2 Keychain entries\./);
        assert.ok(out.includes(`Every world is in the archive ${archive}: restore it on any Pellagos server's management page (Settings › Archive).`));
        assert.deepEqual(called(calls, "osascript"), [], "no dialogs, from Terminal");
    });

    it("asks nothing with --archive or --no-archive, nor where there are no worlds; a no takes every world away unsaved", async () => {
        const cases = [
            { args: [], answer: "n", archived: false, asked: true },
            { args: ["--no-archive"], answer: "y", archived: false, asked: false },
            { args: ["--archive", "--archive-to", "Kept"], answer: "n", archived: true, asked: false },
            { args: [], answer: "y", worlds: false, archived: false, asked: false },
        ];

        for (const { args, answer, worlds = true, archived, asked } of cases) {
            const m = await mac();
            const { library } = await installed(m, { worlds });
            const to = path.join(m.home, args.includes("--archive-to") ? "Kept" : "Documents");
            const { status, out, err, calls } = m.run(["--uninstall", ...args.map((arg) => (arg === "Kept" ? to : arg))], { PELLAGOS_TTY: await answered(m, answer) });
            const name = `${args.join(" ") || "asked"}, ${answer}${worlds ? "" : ", no worlds"}`;

            assert.equal(status, 0, `${name}: ${err}`);
            assert.equal(/\[Y\/n\]/.test(out), asked, `${name}: asked`);
            assert.equal((await readdir(to).catch(() => [])).length, archived ? 1 : 0, `${name}: archived`);
            assert.equal(called(calls, "node").length, archived ? 1 : 0, name);
            assert.equal(out.includes("Every world is in the archive"), archived, name);
            assert.deepEqual(await left(library), [], `${name}: everything taken away`);
        }
    });

    it("with nobody to ask, saves every world to an archive; if it can't be made, or there's no app left to make it, takes nothing away", async () => {
        const m = await mac();
        const quiet = await installed(m, { keychain: 1 });
        const { status, out, err } = m.run(["--uninstall"]);

        assert.equal(status, 0, err);
        assert.equal((await readdir(path.join(m.home, "Documents"))).length, 1);
        assert.deepEqual(await left(quiet.library), []);
        assert.match(out, /, and its Keychain entry\./);

        const failing = await mac();
        const broken = await installed(failing, { keychain: 1 });
        const refused = failing.run(["--uninstall", "--archive"], { STUB_ARCHIVE_FAILS: "1" });

        assert.equal(refused.status, 1);
        assert.match(refused.err, /the archive couldn't be made\. Nothing's been taken away\./);
        assert.deepEqual(await readdir(path.join(failing.home, "Documents")), [], "none of it left");
        assert.equal(await exists(path.join(failing.home, "Applications", APP)), true);
        assert.deepEqual(await left(broken.library), KEPT);
        assert.deepEqual(called(refused.calls, "security"), []);

        const gone = await mac();
        const appless = await installed(gone, { app: false });
        const nothing = gone.run(["--uninstall"]);

        assert.equal(nothing.status, 1);
        assert.match(nothing.err, /there's no Pellagos Server app left to make the archive with: install it again, then uninstall; or --no-archive .* Nothing's been taken away\./);
        assert.deepEqual(await left(appless.library), KEPT);
        assert.equal(gone.run(["--uninstall", "--no-archive"]).status, 0);
        assert.deepEqual(await left(appless.library), []);
    });

    it("with --keep-data takes the app alone away, stopped first, its worlds and settings kept", async () => {
        const m = await mac();
        const { library } = await installed(m, { keychain: 1 });
        const { status, out, err, calls } = m.run(["--uninstall", "--keep-data"], { PELLAGOS_TTY: await answered(m, "y") });

        assert.equal(status, 0, err);
        assert.match(out, /Took Pellagos Server out of .*Applications/);
        assert.match(out, /Its worlds and settings are kept/);
        assert.doesNotMatch(out, /\[Y\/n\]/);
        assert.equal(await exists(path.join(m.home, "Applications", APP)), false);
        assert.deepEqual(await left(library), KEPT);
        assert.deepEqual(called(calls, "pkill"), [["-TERM", "-f", `/${APP}/Contents/Helpers/node`], ["-TERM", "-x", EXECUTABLE]]);
        assert.deepEqual(called(calls, "security"), []);
        assert.equal(await m.unsaved(), false);
        assert.match(m.run(["--uninstall", "--keep-data"]).out, /isn't in \/Applications or ~\/Applications/);
    });

    it("run by the app's Uninstall…, says how it went in a dialog, the archive shown in the Finder; or why nothing was taken away", async () => {
        const m = await mac();
        const apps = path.join(m.home, "Applications");

        await installed(m);

        const { status, err, calls } = m.run(["--uninstall", "--to", apps, "--from-app", "--archive"]);
        const [archive] = await readdir(path.join(m.home, "Documents"));
        const dialogs = called(calls, "osascript").map((call) => call.slice(-2));

        assert.equal(status, 0, err);
        assert.equal(dialogs.length, 1);
        assert.match(dialogs[0][0], /^Pellagos Server is uninstalled\. Every world is in the archive .*\.pellagos-archive: restore it/);
        assert.equal(dialogs[0][1], "note");
        assert.deepEqual(called(calls, "open"), [["-R", path.join(m.home, "Documents", archive)]]);

        const failing = await mac();

        await installed(failing);

        const refused = failing.run(["--uninstall", "--to", path.join(failing.home, "Applications"), "--from-app", "--archive"], { STUB_ARCHIVE_FAILS: "1" });

        assert.equal(refused.status, 1);
        assert.deepEqual(called(refused.calls, "osascript").map((call) => call.slice(-2)), [["Pellagos Server wasn't uninstalled: the archive couldn't be made. Nothing's been taken away.", "stop"]]);
    });
});

describe("the Mac installer, building it here", () => {
    // A copy of the repository, as far as the build needs one: the Node it's built with given by
    // its build-mac-app.js
    async function source(work, { version, sha }) {
        const src = path.join(work, "src");

        await mkdir(path.join(src, "mac"), { recursive: true });
        await mkdir(path.join(src, "scripts"), { recursive: true });
        await writeFile(path.join(src, "mac/Package.swift"), "// the menu-bar app");
        await writeFile(path.join(src, "scripts/build-mac-app.js"), `export const NODE = Object.freeze({ version: "${version}", sha256: "${sha}" });\n`);

        return src;
    }

    it("builds it from a copy of the repository with the Node here, and installs it", async () => {
        const m = await mac();
        const extra = path.join(m.work, "node-bin");
        const src = await source(m.work, { version: "24.0.0", sha: "0".repeat(64) });

        await tools(extra, { node: NODE_STUB });

        const { status, out, err, calls } = m.run(["--build", "--source", src, "--to", path.join(m.work, "A"), "--no-open"], { STUB_BUILT: await appZip(m.work) }, { extraBin: extra });

        assert.equal(status, 0, err);
        assert.match(out, /Building the menu-bar app \(Swift\)/);
        assert.ok(called(calls, "swift").some((call) => call.join(" ") === `build -c release --arch arm64 --package-path ${src}/mac`));
        assert.ok(called(calls, "node").some((call) => call[0] === path.join(src, "scripts/build-mac-app.js") && call.includes(`${m.stub}/swift-bin/${EXECUTABLE}`)));
        assert.equal(await versionOf(path.join(m.work, "A", APP)), "9.9.9");
        assert.deepEqual(called(calls, "open"), []);
    });

    it("fetches the Node the app's built with when there's none new enough, checked against the SHA-256 kept, and leaves it where the build looks", async () => {
        const m = await mac();
        const old = path.join(m.work, "old-node");
        const archive = path.join(m.work, "node-v24.0.0-darwin-arm64");

        // (Node's archive: its own folder, bin/node in it, the build's stand-in)
        await tools(old, { node: NODE_STUB });
        await tools(path.join(archive, "bin"), { node: NODE_STUB });
        execFileSync("tar", ["-czf", `${archive}.tar.gz`, "-C", m.work, path.basename(archive)]);

        const bytes = await readFile(`${archive}.tar.gz`);
        const src = await source(m.work, { version: "24.0.0", sha: sha256(bytes) });

        await m.answer("https://nodejs.org/dist/v24.0.0/node-v24.0.0-darwin-arm64.tar.gz", `${archive}.tar.gz`);

        const env = { STUB_BUILT: await appZip(m.work), STUB_NODE_MAJOR: "18" };
        const { status, out, err } = m.run(["--build", "--source", src, "--to", path.join(m.work, "A"), "--no-open"], env, { extraBin: old });

        assert.equal(status, 0, err);
        assert.match(err, /Downloading Node 24\.0\.0 to build with/);
        assert.match(out, /Installed Pellagos Server 9\.9\.9/);
        assert.deepEqual(await readFile(path.join(src, ".cache/node/node-v24.0.0-darwin-arm64.tar.gz")), bytes);

        // (Not the one kept: not used, and not kept)
        const wrong = await source(path.join(m.work, "wrong"), { version: "24.0.0", sha: "1".repeat(64) });
        const refused = m.run(["--build", "--source", wrong, "--to", path.join(m.work, "B"), "--no-open"], env, { extraBin: old });

        assert.equal(refused.status, 1);
        assert.match(refused.err, /Node's download isn't the one kept in scripts\/build-mac-app\.js/);
        assert.equal(await exists(path.join(wrong, ".cache/node/node-v24.0.0-darwin-arm64.tar.gz")), false);
    });

    it("opens the Command Line Tools' installer when they're not here, and says to run it again", async () => {
        const m = await mac();
        const { status, out, calls } = m.run(["--build"], { STUB_NO_TOOLS: "1" });

        assert.equal(status, 1);
        assert.match(out, /needs Apple's Command Line Tools/);
        assert.deepEqual(called(calls, "xcode-select").at(-1), ["--install"]);
    });

    it("piped from curl, builds the project's source it downloads, not a copy it happens to be run in", async () => {
        const m = await mac();
        const extra = path.join(m.work, "node-bin");
        // (A copy of the repository, run in, with a file named "main": bash's name for a piped script)
        const copy = await source(path.join(m.work, "copy"), { version: "24.0.0", sha: "0".repeat(64) });
        const downloaded = await source(path.join(m.work, "codeload"), { version: "24.0.0", sha: "0".repeat(64) });

        await writeFile(path.join(copy, "scripts", "main"), "");
        await tools(extra, { node: NODE_STUB });
        await rm(path.join(m.work, "codeload", "conquest-v2"), { recursive: true, force: true });
        execFileSync("mv", [downloaded, path.join(m.work, "codeload", "conquest-v2")]);
        execFileSync("tar", ["-czf", path.join(m.work, "source.tar.gz"), "-C", path.join(m.work, "codeload"), "conquest-v2"]);
        await m.answer(`https://codeload.github.com/${REPOSITORY}/tar.gz/v2`, path.join(m.work, "source.tar.gz"));

        const { status, err, calls } = m.run(["--build", "--ref", "v2", "--to", path.join(m.work, "A"), "--no-open"], { STUB_BUILT: await appZip(m.work) }, { extraBin: extra, piped: await readFile(SCRIPT, "utf8"), cwd: path.join(copy, "scripts") });

        assert.equal(status, 0, err);
        assert.match(err, /Downloading the project's source \(v2\)/);
        const packages = called(calls, "swift").map((call) => call[call.indexOf("--package-path") + 1]);

        assert.ok(packages.length && packages.every((one) => one.startsWith(m.work) && !one.startsWith(copy) && one.endsWith("/mac")), packages.join(", "));
        assert.equal(await versionOf(path.join(m.work, "A", APP)), "9.9.9");
    });

    it("does nothing if only part of it arrives", async () => {
        const m = await mac();
        const script = await readFile(SCRIPT, "utf8");

        for (const share of [0.3, 0.6, 0.9]) {
            const { calls } = m.run(["--to", path.join(m.work, "A")], {}, { piped: script.slice(0, Math.floor(script.length * share)) });

            assert.deepEqual(calls, [], `${Math.round(share * 100)}% of it ran something`);
        }
    });

    it("finds which Node the app's built with in build-mac-app.js as it's written", async () => {
        const script = await readFile(SCRIPT, "utf8");
        const sed = /sed -n '(s\/[^']*)'/.exec(script)[1];
        const line = execFileSync("sed", ["-n", sed, path.join(root, "scripts/build-mac-app.js")], { encoding: "utf8" }).trim();

        assert.equal(line, `${NODE.version} ${NODE.sha256}`);
    });
});

describe("the Mac installer's names", () => {
    it("are the app's, its repository's and the updater's", async () => {
        const script = await readFile(SCRIPT, "utf8");
        const value = (name) => new RegExp(`^${name}="([^"]*)"$`, "m").exec(script)?.[1];

        assert.equal(value("REPOSITORY"), REPOSITORY);
        assert.equal(value("APP_ID"), APP_ID);
        assert.equal(value("APP_NAME"), APP_NAME);
        assert.equal(value("EXECUTABLE"), EXECUTABLE);
        assert.equal(value("RELEASES"), `\${PELLAGOS_RELEASES:-${RELEASES.replace("hoffspot/conquest", "$REPOSITORY")}}`);
        assert.ok(script.includes(`/${RELEASE_TAG.source}/`), "its release tag as the updater's");
        assert.ok(script.includes(`"${APP_NAME.replace(/ /g, "-")}-" + tag[1] + "-arm64.zip"`), "the zip named as build-mac-app.js names it");
        assert.ok(script.includes(`https://raw.githubusercontent.com/${REPOSITORY}/main/scripts/install-mac.sh`));
    });

    it("are the options the app's Uninstall… runs it with, from where build-mac-app.js puts it in the bundle", async () => {
        const script = await readFile(SCRIPT, "utf8");
        const swift = await readFile(path.join(root, "mac/Sources/PellagosServer/Uninstall.swift"), "utf8");
        const options = [...swift.matchAll(/"(--[a-z-]+)"/g)].map((found) => found[1]);

        assert.deepEqual(options.sort(), ["--archive", "--from-app", "--no-archive", "--to", "--uninstall"]);

        for (const option of options) {
            assert.ok(script.includes(`\n            ${option}) `), option);
        }

        assert.ok(swift.includes('appendingPathComponent("Contents/Resources/install-mac.sh")'));
    });

    it("are those the Mac app workflow publishes its releases by, from main: its tag, the zip and the server's archive", async () => {
        const workflow = await readFile(path.join(root, ".github/workflows/mac.yml"), "utf8");
        const release = workflow.slice(workflow.indexOf("\n  release:"));

        assert.match(workflow, /push:\n {4}branches: \[main\]/);
        assert.ok(RELEASE_TAG.test("server-v2.0.4123"));
        assert.ok(release.includes('tag="server-v$VERSION"'), "tagged as the updater and installer look for");
        assert.ok(release.includes(`dist/${APP_NAME.replace(/ /g, "-")}-$VERSION-arm64.zip`), "the zip, as the installer looks for it");
        assert.ok(release.includes("dist/pellagos-server-$VERSION.tar.gz"), "the server's archive, as releases.js archiveName names it");
        assert.match(release, /permissions:\n {6}contents: write/);
        assert.match(release, /if: github\.ref == 'refs\/heads\/main'/);
        assert.match(workflow, /node scripts\/stamp-version\.js client\/js\/app\/version\.js "\$GITHUB_SHA"/, "the bundle's game says which code it is");
    });
});
