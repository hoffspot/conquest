// The project's release key (generated/world_server_plan.md §11, "Updating"): an Ed25519 key pair.
// Its public half ships with the server (server/update/release-key.pem), which checks every new
// version's archive against it before installing it; its private half signs each release, and is
// kept by the project's owner alone, never in the repository (a copy as the repository's Actions
// secret PELLAGOS_RELEASE_KEY lets the Mac app workflow sign what it builds).
//
//     npm run release-key -- --new ~/pellagos-release-key.pem    the pair made: the private half
//                                                                 written there, the public half
//                                                                 into server/update/release-key.pem
//     npm run release-key -- --sign dist/pellagos-server-2.4.0.tar.gz [--key <private key file>]
//                                                                 <archive>.sig made (the key from
//                                                                 --key, or PELLAGOS_RELEASE_KEY)
//     npm run release-key -- --verify dist/pellagos-server-2.4.0.tar.gz
//                                                                 checked against the public half

import { createPrivateKey, generateKeyPairSync, sign } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { readReleaseKey, verifySignature } from "../server/update/releases.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = path.join(ROOT, "server/update/release-key.pem");

/** A new Ed25519 key pair, as PEM: { privateKey (PKCS #8), publicKey (SPKI) }. */
export function makeKeyPair() {
    return generateKeyPairSync("ed25519", { privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
}

/** An archive's signature (base64), with the private key (PEM). */
export function signArchive(bytes, privateKey) {
    return sign(null, bytes, createPrivateKey(privateKey)).toString("base64");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const { values } = parseArgs({ options: { new: { type: "string" }, sign: { type: "string" }, verify: { type: "string" }, key: { type: "string" }, public: { type: "string" } } });

    if (values.new) {
        const where = path.resolve(values.new);

        if (!path.relative(ROOT, where).startsWith("..")) {
            console.error(`The private key isn't kept in the repository: give a file outside ${ROOT}.`);
            process.exit(1);
        }

        const { privateKey, publicKey } = makeKeyPair();

        await writeFile(where, privateKey, { mode: 0o600, flag: "wx" });
        await writeFile(PUBLIC, publicKey);
        console.log(`The private half is in ${where}: keep it safe, and somewhere besides (it can't be made again).`);
        console.log(`The public half is in ${path.relative(ROOT, PUBLIC)}: commit it, so servers can check releases with it.`);
        console.log("To have the Mac app workflow sign what it builds, put the private half's text in the repository's Actions secret PELLAGOS_RELEASE_KEY.");
    } else if (values.sign) {
        const privateKey = values.key ? await readFile(values.key, "utf8") : process.env.PELLAGOS_RELEASE_KEY;

        if (!privateKey) {
            console.error("No private key: give --key <file>, or PELLAGOS_RELEASE_KEY.");
            process.exit(1);
        }

        const signature = signArchive(await readFile(values.sign), privateKey);

        await writeFile(`${values.sign}.sig`, `${signature}\n`);
        console.log(`Signed: ${values.sign}.sig`);
    } else if (values.verify) {
        const key = values.public ? await readFile(values.public, "utf8") : readReleaseKey(PUBLIC);

        if (!key) {
            console.error(`There's no public key (${path.relative(ROOT, PUBLIC)}): make the pair with --new.`);
            process.exit(1);
        }

        const good = verifySignature(await readFile(values.verify), await readFile(`${values.verify}.sig`, "utf8"), key);

        console.log(good ? "The signature is the project's." : "The signature isn't the project's.");
        process.exit(good ? 0 : 1);
    } else {
        console.error("Say what to do: --new <private key file>, --sign <archive>, or --verify <archive>.");
        process.exit(1);
    }
}
