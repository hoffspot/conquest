// Bundles noble-ed25519's verifier, with noble-hashes' SHA-512 (which it needs) and SHA-256 (a server
// id's fingerprint), into client/vendor/noble-ed25519-<version>/, minified: the game checks a world
// server's identity with it before it sends a key there (core/identity.js; generated/
// world_server_plan.md §7.6). WebCrypto would do on https pages, but a game opened from a server on
// the Wi-Fi is a plain-http page, which has none, so the game always uses this. Run this after
// changing the "@noble/ed25519" or "@noble/hashes" versions in package.json:
//
//     npm install && npm run vendor:ed25519
//
// then update the path core/identity.js imports it from, run npm run build:manifest, and delete the
// old vendor folder.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const versionOf = async (name) => JSON.parse(await readFile(path.join(root, "node_modules", name, "package.json"), "utf8")).version;
const ed25519 = await versionOf("@noble/ed25519");
const hashes = await versionOf("@noble/hashes");
const target = path.join(root, `client/vendor/noble-ed25519-${ed25519}`);

// (Only what the game uses: verifying, and the two hashes)
const entry = `
import * as ed from "@noble/ed25519";
import { sha256, sha512 } from "@noble/hashes/sha2.js";

ed.hashes.sha512 = sha512;

export const verify = (signature, message, publicKey) => ed.verify(signature, message, publicKey);
export { sha256 };
`;

const { outputFiles } = await build({ stdin: { contents: entry, resolveDir: root, loader: "js" }, bundle: true, minify: true, format: "esm", write: false, legalComments: "none" });
const license = async (name) => readFile(path.join(root, "node_modules", name, "LICENSE"), "utf8");

await mkdir(target, { recursive: true });
await writeFile(path.join(target, "ed25519.min.js"), `// noble-ed25519 ${ed25519} and noble-hashes ${hashes} (SHA-256, SHA-512), by Paul Miller: MIT License (LICENSE)\n${outputFiles[0].text}`);
await writeFile(path.join(target, "LICENSE"), `noble-ed25519 ${ed25519}:\n\n${await license("@noble/ed25519")}\n\nnoble-hashes ${hashes}:\n\n${await license("@noble/hashes")}`);

console.log(`noble-ed25519 ${ed25519} (with noble-hashes ${hashes}) bundled into ${path.relative(root, target)}`);
