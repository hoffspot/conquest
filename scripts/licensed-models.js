// The licensed models (docs/LICENSED_MODELS.md): kept in the private repository
// hoffspot/conquest-models, laid out there as under client/, and put in place here.
//
//   npm run models:fetch
//       Fetches them into .models (a clone of the private repository, with your own access to
//       it: only those the owner's given access can), and puts them in place.
//   node scripts/licensed-models.js place <copy of the private repository>
//       Puts them in place from a copy already fetched (CI's, with the deploy key:
//       .github/actions/licensed-models).
//
// Each file's checked against the hash and size its catalog entry keeps (client/models/assets.json,
// marked "licensed"). Node's built-ins only: CI runs it before npm ci.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPOSITORY = "https://github.com/hoffspot/conquest-models.git";

/** Why a test that needs a licensed model is left out where they aren't here. */
export const LEFT_OUT = "the licensed models aren't here (npm run models:fetch; docs/LICENSED_MODELS.md)";

/** The licensed models' files, as the catalog keeps them: [{ name, path, hash, bytes }]. */
export function licensedFiles() {
    const { models } = JSON.parse(readFileSync(path.join(root, "client/models/assets.json"), "utf8"));

    return Object.entries(models)
        .filter(([, { licensed }]) => licensed)
        .flatMap(([name, { files }]) => files.map((file) => ({ name, ...file })));
}

/**
 * Whether the licensed models are here, for the tests that need one: false where any isn't (a
 * copy without access to the private repository, whose tests leave them out, saying so). Where
 * they must be here (CI, once it's fetched them: LICENSED_MODELS=required), one missing throws.
 * (`files` and `env` are given in the tests.)
 */
export function licensedModelsHere({ files = licensedFiles(), env = process.env } = {}) {
    const missing = files.filter(({ path: file }) => !existsSync(path.join(root, "client", file)));

    if (missing.length && env.LICENSED_MODELS === "required") {
        throw new Error(`The licensed models must be here, and these aren't: ${missing.map(({ path: file }) => `client/${file}`).join(", ")}`);
    }

    return missing.length === 0;
}

const hashOf = (bytes) => createHash("sha256").update(bytes).digest("hex").slice(0, 10);

/**
 * Puts the licensed models in place from `from` (a copy of the private repository), into `into`
 * (client/). (`files` and `into` are given in the tests.)
 */
export function place(from, { files = licensedFiles(), into = path.join(root, "client") } = {}) {
    for (const { name, path: file, hash, bytes } of files) {
        const source = path.join(from, file);

        if (!existsSync(source)) {
            throw new Error(`${name}: ${file} isn't in ${from}`);
        }

        const data = readFileSync(source);

        if (data.length !== bytes || hashOf(data) !== hash) {
            throw new Error(`${name}: ${file} in ${from} is ${data.length} bytes, its hash ${hashOf(data)}; the catalog keeps ${bytes} bytes, ${hash}`);
        }

        mkdirSync(path.dirname(path.join(into, file)), { recursive: true });
        copyFileSync(source, path.join(into, file));
        console.log(`${path.relative(root, path.join(into, file))}: ${name}, ${bytes} bytes`);
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const [command, from] = process.argv.slice(2);

    if (command === "place" && from) {
        place(path.resolve(from));
    } else if (command === "fetch") {
        const copy = path.join(root, ".models");

        try {
            if (existsSync(path.join(copy, ".git"))) {
                execFileSync("git", ["-C", copy, "pull", "--ff-only", "--quiet"], { stdio: "inherit" });
            } else {
                execFileSync("git", ["clone", "--quiet", "--depth", "1", REPOSITORY, copy], { stdio: "inherit" });
            }
        } catch {
            console.error(
                `Couldn't fetch ${REPOSITORY}. It's private: only those the owner's given access can fetch it. Without the licensed models, the game draws the creatures' stand-ins, and the tests that need one are left out (docs/LICENSED_MODELS.md).`,
            );
            process.exit(1);
        }

        place(copy);
    } else {
        console.error("npm run models:fetch, or node scripts/licensed-models.js place <copy of hoffspot/conquest-models>");
        process.exit(1);
    }
}
