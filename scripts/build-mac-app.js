// The Mac app (generated/world_server_plan.md §11, Phase 2; docs/MAC_APP.md): "Pellagos
// Server.app", the menu-bar app (mac/, built with Swift on a Mac) with Node arm64 and the world
// server and the game inside, signed ad hoc (free: no Developer ID) and zipped; and for Homebrew,
// the server's source archive and a formula naming it (Phase 1's server, run from Terminal or as a
// brew service):
//
//     swift build -c release --arch arm64 --package-path mac
//     node scripts/build-mac-app.js --executable "$(swift build -c release --arch arm64 --package-path mac --show-bin-path)/PellagosServer"
//
// into dist/ (or --out): Pellagos-Server-<version>-arm64.zip, pellagos-server-<version>.tar.gz and
// pellagos-server.rb (naming the archive as a release's file). Node comes from nodejs.org, the version kept here (NODE), checked against
// the hash kept here and its release's SHASUMS256.txt, and keeps its own signature (the OpenJS
// Foundation's); kept in .cache/node/ once fetched. On macOS the bundle's signed (codesign
// --sign -) and checked, and zipped with ditto; elsewhere it's left unsigned (--no-executable
// makes the rest of the bundle alone, as the tests do).

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { APP_ID, APP_NAME } from "../server/platform/names.js";
import { SERVICE } from "../server/platform/bonjour.js";
import { SERVER_VERSION } from "../server/storage/versions.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The Node inside: its version (an LTS: 24 now, 26 from 28 October 2026) and its darwin-arm64 .tar.gz's SHA-256, from its SHASUMS256.txt. */
export const NODE = Object.freeze({ version: "24.21.0", sha256: "bed7eea5325e1108f32ce5228ddd6a5f0f08a499ee42aa7442aea583702f6057" });

/** The app's executable (mac/Package.swift's product). */
export const EXECUTABLE = "PellagosServer";

/** The launch agent's plist in the bundle (mac/Sources/PellagosServer/LoginItem.swift registers it by this name). */
export const AGENT_PLIST = `${APP_ID}.plist`;

/** Where the project's releases are (the formula's archive is one of a release's files). */
export const REPOSITORY = "hoffspot/conquest";

/** What the server's for, to the owner (the Local Network permission's prompt) */
const LOCAL_NETWORK = "Pellagos Server shows itself to players on your Wi-Fi, finds other Pellagos servers nearby, and asks your router to let players in from the internet. Playing needs none of this.";

const escapeXml = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A property list (Apple's XML form) of a value: objects as dicts, arrays, strings, whole numbers and booleans. */
export function plistOf(value) {
    const write = (one, indent) => {
        const pad = "\t".repeat(indent);

        if (typeof one === "boolean") {
            return `${pad}<${one}/>`;
        }

        if (typeof one === "number") {
            if (!Number.isInteger(one)) {
                throw new Error(`plistOf: ${one} isn't a whole number`);
            }

            return `${pad}<integer>${one}</integer>`;
        }

        if (typeof one === "string") {
            return `${pad}<string>${escapeXml(one)}</string>`;
        }

        if (Array.isArray(one)) {
            return [`${pad}<array>`, ...one.map((each) => write(each, indent + 1)), `${pad}</array>`].join("\n");
        }

        if (one && typeof one === "object") {
            return [`${pad}<dict>`, ...Object.entries(one).flatMap(([key, each]) => [`${pad}\t<key>${escapeXml(key)}</key>`, write(each, indent + 1)]), `${pad}</dict>`].join("\n");
        }

        throw new Error(`plistOf: can't write ${one}`);
    };

    return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n${write(value, 0)}\n</plist>\n`;
}

/** The app's Info.plist: a menu-bar app alone (no Dock icon), on macOS 13 or later, saying why it asks for the Local Network, and the Bonjour service it uses. */
export function infoPlist({ version = SERVER_VERSION } = {}) {
    return {
        CFBundleDevelopmentRegion: "en",
        CFBundleDisplayName: APP_NAME,
        CFBundleExecutable: EXECUTABLE,
        CFBundleIdentifier: APP_ID,
        CFBundleInfoDictionaryVersion: "6.0",
        CFBundleName: APP_NAME,
        CFBundlePackageType: "APPL",
        CFBundleShortVersionString: version,
        CFBundleVersion: version,
        LSApplicationCategoryType: "public.app-category.games",
        LSArchitecturePriority: ["arm64"],
        LSMinimumSystemVersion: "13.0",
        LSUIElement: true,
        NSBonjourServices: [SERVICE],
        NSHumanReadableCopyright: "Apache License 2.0",
        NSLocalNetworkUsageDescription: LOCAL_NETWORK,
    };
}

/**
 * The launch agent that runs the app at login (SMAppService.agent registers it from the bundle):
 * launchd not throttling it (ProcessType Interactive), and starting it again if it fails, though
 * not after Quit (KeepAlive, SuccessfulExit false: Quit leaves 0).
 */
export function agentPlist() {
    return {
        Label: APP_ID,
        BundleProgram: `Contents/MacOS/${EXECUTABLE}`,
        AssociatedBundleIdentifiers: [APP_ID],
        RunAtLoad: true,
        KeepAlive: { SuccessfulExit: false },
        ProcessType: "Interactive",
        LimitLoadToSessionType: "Aqua",
    };
}

/** The bundle's package.json: the server's version (server/storage/versions.js reads it), and its files ES modules. */
export function packageJson({ version = SERVER_VERSION } = {}) {
    return `${JSON.stringify({ name: "pellagos-server", version, private: true, type: "module", license: "Apache-2.0" }, null, 2)}\n`;
}

/** Node's archive for a Mac (Apple Silicon): its name, and where nodejs.org has it and its SHASUMS256.txt. */
export function nodeArchive({ version = NODE.version } = {}) {
    const name = `node-v${version}-darwin-arm64.tar.gz`;
    const base = `https://nodejs.org/dist/v${version}`;

    return { name, folder: name.replace(/\.tar\.gz$/, ""), url: `${base}/${name}`, shasums: `${base}/SHASUMS256.txt` };
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/**
 * Throws unless `bytes` (Node's archive, `name`) are what its release's SHASUMS256.txt (`shasums`,
 * its text) says, and what's kept here (`pinned`, a SHA-256; null for none: another version).
 */
export function checkArchive(bytes, { name, shasums, pinned = null }) {
    const found = sha256(bytes);
    const listed = shasums
        .split("\n")
        .map((line) => line.trim().split(/\s+/))
        .find(([, file]) => file === name)?.[0];

    if (!listed) {
        throw new Error(`${name} isn't in its release's SHASUMS256.txt`);
    }

    if (found !== listed) {
        throw new Error(`${name} doesn't match its release's SHASUMS256.txt (${found}, not ${listed})`);
    }

    if (pinned && found !== pinned) {
        throw new Error(`${name} doesn't match the hash kept in scripts/build-mac-app.js (${found}, not ${pinned})`);
    }

    return found;
}

/** Node's archive fetched (or found in `cache`) and checked: its path. */
export async function fetchNode({ version = NODE.version, cache = path.join(root, ".cache/node") } = {}) {
    const archive = nodeArchive({ version });
    const file = path.join(cache, archive.name);
    const pinned = version === NODE.version ? NODE.sha256 : null;
    const get = async (url) => {
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`${url}: ${response.status} ${response.statusText}`);
        }

        return Buffer.from(await response.arrayBuffer());
    };

    const shasums = (await get(archive.shasums)).toString("utf8");
    const kept = await readFile(file).catch(() => null);
    const bytes = kept ?? (await get(archive.url));

    checkArchive(bytes, { name: archive.name, shasums, pinned });

    if (!kept) {
        await mkdir(cache, { recursive: true });
        await writeFile(file, bytes);
    }

    return { file, shasums };
}

/** The server and the game, as they're served: copied into `into` (server/, client/, package.json, the licences). */
async function copyServer(into, { version }) {
    await mkdir(into, { recursive: true });
    await cp(path.join(root, "server"), path.join(into, "server"), { recursive: true });
    await cp(path.join(root, "client"), path.join(into, "client"), { recursive: true });
    await writeFile(path.join(into, "package.json"), packageJson({ version }));

    for (const licence of ["LICENSE", "LICENSE-BOOK-CODE.txt"]) {
        await cp(path.join(root, licence), path.join(into, licence));
    }
}

/**
 * The bundle, "<out>/Pellagos Server.app":
 *
 *     Contents/Info.plist, PkgInfo
 *     Contents/MacOS/PellagosServer                      the menu-bar app (`executable`; none if null)
 *     Contents/Helpers/node                              Node arm64, from `archive` (checked against `shasums`)
 *     Contents/Library/LaunchAgents/<id>.plist           run at login
 *     Contents/Resources/app/{server,client,package.json}
 *     Contents/Resources/install-mac.sh                  the installer, run by the app's Uninstall…
 *     Contents/Resources/node/LICENSE
 *
 * Signed ad hoc when `sign` (macOS alone). Returns its path.
 */
export async function buildApp({ out, executable = null, archive, shasums, pinned = NODE.sha256, version = SERVER_VERSION, sign = false }) {
    const app = path.join(out, `${APP_NAME}.app`);
    const contents = path.join(app, "Contents");
    const bytes = await readFile(archive);
    const name = path.basename(archive);
    const folder = name.replace(/\.tar\.gz$/, "");

    checkArchive(bytes, { name, shasums, pinned });
    await rm(app, { recursive: true, force: true });

    for (const inside of ["MacOS", "Helpers", "Library/LaunchAgents", "Resources/node"]) {
        await mkdir(path.join(contents, inside), { recursive: true });
    }

    await writeFile(path.join(contents, "Info.plist"), plistOf(infoPlist({ version })));
    await writeFile(path.join(contents, "PkgInfo"), "APPL????");
    await writeFile(path.join(contents, "Library/LaunchAgents", AGENT_PLIST), plistOf(agentPlist()));

    if (executable) {
        await cp(executable, path.join(contents, "MacOS", EXECUTABLE));
    }

    // (Node's own files, its signature kept: the binary, and its licence)
    const unpacked = path.join(out, ".node");

    await rm(unpacked, { recursive: true, force: true });
    await mkdir(unpacked, { recursive: true });
    execFileSync("tar", ["-xzf", archive, "-C", unpacked, `${folder}/bin/node`, `${folder}/LICENSE`]);
    await cp(path.join(unpacked, folder, "bin/node"), path.join(contents, "Helpers/node"));
    await cp(path.join(unpacked, folder, "LICENSE"), path.join(contents, "Resources/node/LICENSE"));
    await rm(unpacked, { recursive: true, force: true });

    await copyServer(path.join(contents, "Resources/app"), { version });
    // (The installer, for the app's Uninstall… to take everything away with: mac/.../Uninstall.swift)
    await cp(path.join(root, "scripts/install-mac.sh"), path.join(contents, "Resources/install-mac.sh"));
    await chmod(path.join(contents, "Resources/install-mac.sh"), 0o755);

    if (sign) {
        execFileSync("codesign", ["--force", "--sign", "-", "--timestamp=none", app], { stdio: "inherit" });
        execFileSync("codesign", ["--verify", "--deep", "--strict", "--verbose=2", app], { stdio: "inherit" });
    }

    return app;
}

/** The app zipped as a Mac would (ditto, keeping its signature), or with zip elsewhere. Returns the zip's path. */
export function zipApp(app, { system = process.platform, version = SERVER_VERSION } = {}) {
    const zip = path.join(path.dirname(app), `${APP_NAME.replace(/ /g, "-")}-${version}-arm64.zip`);

    if (system === "darwin") {
        execFileSync("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", app, zip]);
    } else {
        execFileSync("zip", ["-q", "-r", "-y", zip, path.basename(app)], { cwd: path.dirname(app) });
    }

    return zip;
}

/** The server's source archive for Homebrew, "<out>/pellagos-server-<version>.tar.gz": { file, sha256 }. */
export async function sourceArchive({ out, version = SERVER_VERSION }) {
    const folder = `pellagos-server-${version}`;
    const staging = path.join(out, ".source");
    const file = path.join(out, `${folder}.tar.gz`);

    await rm(staging, { recursive: true, force: true });
    await copyServer(path.join(staging, folder), { version });
    // (COPYFILE_DISABLE: no "._" files of a Mac's extended attributes)
    execFileSync("tar", ["-czf", file, "-C", staging, folder], { env: { ...process.env, COPYFILE_DISABLE: "1" } });
    await rm(staging, { recursive: true, force: true });

    return { file, sha256: sha256(await readFile(file)) };
}

/**
 * The Homebrew formula for the tap (docs/MAC_APP.md, "Homebrew"): the server from its source
 * archive (a release's file), on Homebrew's Node, as `pellagos-server` and a brew service
 * (Interactive, started again if it fails).
 */
export function formulaOf({ version = SERVER_VERSION, sha256: hash, url = `https://github.com/${REPOSITORY}/releases/download/server-v${version}/pellagos-server-${version}.tar.gz` }) {
    return `# Pellagos Server (generated by scripts/build-mac-app.js: make it again, don't edit it)
class PellagosServer < Formula
  desc "World server for Pellagos, the fantasy role-playing game in the browser"
  homepage "https://github.com/${REPOSITORY}"
  url "${url}"
  sha256 "${hash}"
  license "Apache-2.0"

  depends_on "node"

  def install
    libexec.install Dir["*"]
    (bin/"pellagos-server").write <<~EOS
      #!/bin/bash
      exec "#{Formula["node"].opt_bin}/node" "#{libexec}/server/world.js" "$@"
    EOS
    chmod 0755, bin/"pellagos-server"
  end

  service do
    run [opt_bin/"pellagos-server"]
    keep_alive successful_exit: false
    process_type :interactive
    log_path var/"log/pellagos-server.log"
    error_log_path var/"log/pellagos-server.log"
  end

  test do
    port = free_port
    # (What it says goes to a file: its admin key isn't for a build's log)
    pid = spawn bin/"pellagos-server", "--port", port.to_s, "--admin", free_port.to_s, "--data", testpath/"data", [:out, :err] => (testpath/"server.log").to_s
    sleep 10
    assert_match "ok", shell_output("curl -s http://127.0.0.1:#{port}/api/v1/health")
  ensure
    Process.kill("TERM", pid)
    Process.wait(pid)
  end
end
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const { values } = parseArgs({ options: { executable: { type: "string" }, "no-executable": { type: "boolean" }, out: { type: "string" }, node: { type: "string" } } });

    if (!values.executable && !values["no-executable"]) {
        throw new Error("Give the menu-bar app's executable (--executable), built on a Mac with swift build; or --no-executable for the rest of the bundle alone");
    }

    const out = path.resolve(values.out ?? path.join(root, "dist"));
    const version = values.node ?? NODE.version;
    const { file, shasums } = await fetchNode({ version });

    await mkdir(out, { recursive: true });

    const app = await buildApp({ out, executable: values.executable ?? null, archive: file, shasums, pinned: version === NODE.version ? NODE.sha256 : null, sign: process.platform === "darwin" && Boolean(values.executable) });
    const zip = zipApp(app);
    const source = await sourceArchive({ out });

    await writeFile(path.join(out, "pellagos-server.rb"), formulaOf({ sha256: source.sha256 }));
    console.log(`${path.relative(root, app)} (Node ${version}${process.platform === "darwin" && values.executable ? ", signed ad hoc" : ", unsigned"})`);
    console.log(path.relative(root, zip));
    console.log(`${path.relative(root, source.file)} (SHA-256 ${source.sha256})`);
    console.log(path.relative(root, path.join(out, "pellagos-server.rb")));
}
