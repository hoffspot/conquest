import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { describe, test } from "node:test";
import { catalog, catalogSource, manifestGroups, manifestSource, releaseOf } from "../scripts/build-manifest.js";
import { ASSETS } from "../client/js/app/assets.js";
import { releaseOf as releaseTold } from "../client/js/app/catalog.js";
import { MANIFEST } from "../client/js/app/manifest.js";
import { GAME_BODY } from "../client/js/characters/body.js";
import { readHumanFiles } from "../scripts/lib/human-data.js";

// The most the game may download before it starts. Raising it is a choice to make in review: a
// heavy model goes in the catalog (client/models/assets.json), downloaded as it's wanted
// (generated/asset_streaming_plan.md, section 2)
const BOOT_BUDGET = 12 * 1024 * 1024;

const hashOf = async (path) => createHash("sha256").update(await readFile(new URL(`../client/${path}`, import.meta.url))).digest("hex").slice(0, 10);

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

    test("has the engine, the navigation meshes' Recast, the code, the body, its skin and the fonts, and nothing main.js has already loaded", () => {
        assert.deepEqual(MANIFEST.map(({ id }) => id), ["engine", "navigation", "code", "body", "skin", "fonts"]);

        const paths = MANIFEST.flatMap(({ files }) => files.map(([path]) => path));
        // (The game's body and every mask, picture and skin picture it names: body.js GAME_BODY)
        const { masks, pictures = {}, skin = {} } = readHumanFiles().manifest;
        const body = [`characters/${GAME_BODY}.json`, `characters/${GAME_BODY}.bin`, ...[...masks, ...Object.values(pictures), ...Object.values(skin)].map((file) => `characters/${file}`)];

        for (const needed of ["vendor/three-r186/three.module.min.js", "vendor/three-r186/three.core.min.js", "vendor/recast-navigation-0.43.1/recast-navigation.wasm.wasm", "js/app/game.js", "js/app/creator.js", ...body, "fonts/UnifrakturMaguntia.woff2"]) {
            assert.ok(paths.includes(needed), needed);
        }

        for (const loaded of ["js/main.js", "js/app/loader.js", "js/app/manifest.js", "js/app/assets.js", "js/app/catalog.js", "js/core/weapons.js"]) {
            assert.ok(!paths.includes(loaded), loaded);
        }
    });

    test("gives the data (the body and its skin) the hash of its bytes, and the code and fonts, asked for by name, none", async () => {
        for (const { id, files } of MANIFEST) {
            for (const [path, , hash] of files) {
                if (["body", "skin"].includes(id)) {
                    assert.equal(hash, await hashOf(path), path);
                } else {
                    assert.equal(hash, undefined, path);
                }
            }
        }
    });

    test(`keeps what's downloaded before the game starts within its budget (${BOOT_BUDGET / 1024 / 1024} MB), and none of the catalog's models in it`, () => {
        const files = MANIFEST.flatMap(({ files }) => files);
        const total = files.reduce((sum, [, bytes]) => sum + bytes, 0);
        const paths = new Set(files.map(([path]) => path));

        assert.ok(total <= BOOT_BUDGET, `${(total / 1024 / 1024).toFixed(2)} MB: move a heavy model to the catalog, or raise the budget in review`);

        for (const { files: listed } of Object.values(ASSETS.models)) {
            for (const { path } of listed) {
                assert.ok(!paths.has(path), path);
            }
        }
    });
});

describe("the catalog of models downloaded as they're wanted (client/js/app/assets.js)", () => {
    test("is up to date with client/models/assets.json and the files: run npm run build:manifest", async () => {
        const saved = await readFile(new URL("../client/js/app/assets.js", import.meta.url), "utf8");

        assert.equal(saved, await catalogSource());
    });

    test("gives each file its size and the hash of its bytes, keeping what assets.json says of it", async () => {
        const listed = await catalog({
            models: {
                barrel: { tier: "near", stand: "beast:barrel", when: { sites: ["a cellar"], within: 1500 }, files: [{ lod: 1, path: "models/kaykit/barrel.bin" }, { lod: 0, path: "models/kaykit/barrel.gltf" }] },
            },
        });

        assert.deepEqual(listed.models.barrel, {
            tier: "near",
            stand: "beast:barrel",
            when: { sites: ["a cellar"], within: 1500 },
            files: [
                { lod: 1, path: "models/kaykit/barrel.bin", hash: await hashOf("models/kaykit/barrel.bin"), bytes: (await stat(new URL("../client/models/kaykit/barrel.bin", import.meta.url))).size },
                { lod: 0, path: "models/kaykit/barrel.gltf", hash: await hashOf("models/kaykit/barrel.gltf"), bytes: (await stat(new URL("../client/models/kaykit/barrel.gltf", import.meta.url))).size },
            ],
        });

        for (const { files } of Object.values(ASSETS.models)) {
            for (const { path, hash, bytes } of files) {
                assert.equal(hash, await hashOf(path), path);
                assert.equal(bytes, (await stat(new URL(`../client/${path}`, import.meta.url))).size, path);
            }
        }
    });

    test("says what's wrong with a model listed wrongly", async () => {
        await assert.rejects(catalog({ models: { dragon: { tier: "near", files: [{ path: "models/nowhere.glb" }] } } }), /dragon: client\/models\/nowhere\.glb isn't there/);
        await assert.rejects(catalog({ models: { dragon: { tier: "soon", files: [{ path: "models/jmi/chest.glb" }] } } }), /dragon: its tier is "near" or "demand"/);
        await assert.rejects(catalog({ models: { dragon: { tier: "demand", files: [] } } }), /dragon: lists no files/);
    });

    test("names the release by its kept files: the same files, the same name; any one changed, another", async () => {
        const groups = await manifestGroups();
        const models = await catalog({ models: { barrel: { tier: "demand", files: [{ path: "models/kaykit/barrel.gltf" }] } } });
        const changed = structuredClone(models);

        changed.models.barrel.files[0].hash = "0123456789";

        assert.equal(releaseOf(groups, await catalog()), ASSETS.release);
        assert.equal(releaseOf(groups, models), releaseOf(structuredClone(groups), structuredClone(models)));
        assert.notEqual(releaseOf(groups, models), ASSETS.release);
        assert.notEqual(releaseOf(groups, changed), releaseOf(groups, models));
    });

    test("is what a page tells the service worker it keeps: the manifest's data and the catalog's files, by hash", async () => {
        const models = await catalog({ models: { barrel: { tier: "demand", files: [{ path: "models/kaykit/barrel.gltf" }] } } });
        const told = releaseTold(MANIFEST, { release: "0123456789", ...models }, "https://example.github.io/conquest/");

        assert.equal(told.kind, "release");
        assert.equal(told.release, "0123456789");
        assert.ok(told.boot.includes(`https://example.github.io/conquest/characters/${GAME_BODY}.bin?h=${await hashOf(`characters/${GAME_BODY}.bin`)}`));
        assert.equal(told.boot.length, MANIFEST.flatMap(({ files }) => files).filter(([, , hash]) => hash).length);
        assert.deepEqual(told.assets, [`https://example.github.io/conquest/models/kaykit/barrel.gltf?h=${await hashOf("models/kaykit/barrel.gltf")}`]);
    });
});
