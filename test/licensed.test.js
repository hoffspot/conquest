// The licensed models (scripts/licensed-models.js; docs/LICENSED_MODELS.md): listed as the
// catalog keeps them, kept out of the repository, put in place from a copy of the private
// repository only as the catalog keeps them, and how the tests that need one know they're here.

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

const { licensedFiles, licensedModelsHere, place } = await import("../scripts/licensed-models.js");
const { ASSETS } = await import("../client/js/app/assets.js");

const hashOf = (bytes) => createHash("sha256").update(bytes).digest("hex").slice(0, 10);

describe("the licensed models (scripts/licensed-models.js)", () => {
    it("are the catalog's entries marked licensed, each file with the hash and size it keeps", () => {
        const marked = Object.entries(ASSETS.models).filter(([, { licensed }]) => licensed);

        assert.deepEqual(
            licensedFiles(),
            marked.flatMap(([name, { files }]) => files.map((file) => ({ name, ...file }))),
        );

        for (const [name, { label }] of marked) {
            assert.match(label, /permission/, `${name}'s label says whose it is, and the permission`);
        }
    });

    it("are kept out of the repository: each is ignored by git, as is the copy of the private repository", () => {
        const ignored = readFileSync(new URL("../.gitignore", import.meta.url), "utf8").split("\n");

        assert.ok(ignored.includes(".models/"));

        for (const { path: file } of licensedFiles()) {
            assert.ok(ignored.includes(`client/${file}`), `client/${file}`);
        }
    });

    it("are here or not for the tests that need one: left out where one isn't, failing where they must be", () => {
        const missing = [{ name: "away", path: "models/nowhere.bin" }];

        assert.equal(licensedModelsHere({ files: [], env: {} }), true);
        assert.equal(licensedModelsHere({ files: missing, env: {} }), false);
        assert.throws(() => licensedModelsHere({ files: missing, env: { LICENSED_MODELS: "required" } }), /must be here, and these aren't: client\/models\/nowhere\.bin/);
    });

    it("are put in place from a copy of the private repository, each only as the catalog keeps it", () => {
        const from = mkdtempSync(path.join(tmpdir(), "models-from-"));
        const into = mkdtempSync(path.join(tmpdir(), "models-into-"));
        const bytes = Buffer.from("a scrambled model, as the private repository keeps it");
        const file = { name: "beast-test", path: "models/beasts/test.bin", hash: hashOf(bytes), bytes: bytes.length };

        try {
            mkdirSync(path.join(from, "models/beasts"), { recursive: true });
            writeFileSync(path.join(from, file.path), bytes);

            place(from, { files: [file], into });
            assert.deepEqual(readFileSync(path.join(into, file.path)), bytes);

            assert.throws(() => place(from, { files: [{ ...file, hash: "0123456789" }], into }), new RegExp(`beast-test: models/beasts/test\\.bin in .* is ${bytes.length} bytes, its hash ${file.hash}; the catalog keeps ${bytes.length} bytes, 0123456789`));
            assert.throws(() => place(from, { files: [{ ...file, path: "models/beasts/gone.bin" }], into }), /beast-test: models\/beasts\/gone\.bin isn't in/);
        } finally {
            rmSync(from, { recursive: true, force: true });
            rmSync(into, { recursive: true, force: true });
        }
    });
});
