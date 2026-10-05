import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { describe, test } from "node:test";
import { manifestSource } from "../scripts/build-manifest.js";
import { MANIFEST } from "../client/js/app/manifest.js";
import { GAME_BODY } from "../client/js/characters/body.js";
import { readHumanFiles } from "../scripts/lib/human-data.js";

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

    test("has the engine, the navigation meshes' Recast, the code, the body, its skin, the fonts and the models, and nothing main.js has already loaded", () => {
        assert.deepEqual(MANIFEST.map(({ id }) => id), ["engine", "navigation", "code", "body", "skin", "fonts", "models"]);

        const paths = MANIFEST.flatMap(({ files }) => files.map(([path]) => path));
        // (The game's body and every mask it names: body.js GAME_BODY)
        const body = [`characters/${GAME_BODY}.json`, `characters/${GAME_BODY}.bin`, ...readHumanFiles().manifest.masks.map((file) => `characters/${file}`)];

        for (const needed of ["vendor/three-r186/three.module.min.js", "vendor/three-r186/three.core.min.js", "vendor/recast-navigation-0.43.1/recast-navigation.wasm.wasm", "js/app/game.js", "js/app/creator.js", ...body, "fonts/UnifrakturMaguntia.woff2", "models/jmi/chest.glb"]) {
            assert.ok(paths.includes(needed), needed);
        }

        for (const loaded of ["js/main.js", "js/app/loader.js", "js/app/manifest.js", "js/core/weapons.js"]) {
            assert.ok(!paths.includes(loaded), loaded);
        }
    });
});
