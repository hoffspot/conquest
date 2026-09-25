import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { describe, test } from "node:test";
import { manifestSource } from "../scripts/build-manifest.js";
import { MANIFEST } from "../client/js/app/manifest.js";

describe("the loader's manifest (client/js/app/manifest.js)", () => {
    test("is up to date: run npm run build:manifest after changing what the game downloads", async () => {
        const saved = await readFile(new URL("../client/js/app/manifest.js", import.meta.url), "utf8");

        assert.equal(saved, await manifestSource());
    });

    test("lists every file once, with its size on disk", async () => {
        const paths = MANIFEST.flatMap(({ files }) => files.map(([path]) => path));

        assert.equal(new Set(paths).size, paths.length);

        for (const { files } of MANIFEST) {
            for (const [path, bytes] of files) {
                assert.equal((await stat(new URL(`../client/${path}`, import.meta.url))).size, bytes, path);
            }
        }
    });

    test("has the engine, the code, the body, its skin and the models, and nothing main.js has already loaded", () => {
        assert.deepEqual(MANIFEST.map(({ id }) => id), ["engine", "code", "body", "skin", "models"]);

        const paths = MANIFEST.flatMap(({ files }) => files.map(([path]) => path));

        for (const needed of ["vendor/three-r186/three.module.min.js", "vendor/three-r186/three.core.min.js", "js/app/game.js", "js/app/creator.js", "characters/human.bin", "characters/masks/lips.jpg", "models/kaykit/tree_single_A.bin"]) {
            assert.ok(paths.includes(needed), needed);
        }

        for (const loaded of ["js/main.js", "js/app/loader.js", "js/app/manifest.js", "js/core/weapons.js"]) {
            assert.ok(!paths.includes(loaded), loaded);
        }
    });
});
