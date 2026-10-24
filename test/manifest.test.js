import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { describe, test } from "node:test";
import { catalog, catalogSource, manifestGroups, manifestSource, pageSource, releaseOf, startFiles } from "../scripts/build-manifest.js";
import { ASSETS } from "../client/js/app/assets.js";
import { filesOf, mappedOf, releaseOf as releaseTold } from "../client/js/app/catalog.js";
import { MANIFEST } from "../client/js/app/manifest.js";
import { GAME_BODY } from "../client/js/characters/body.js";
import { readHumanFiles } from "../scripts/lib/human-data.js";

// The most the game may download before it starts. Raising it is a choice to make in review: a
// heavy model goes in the catalog (client/models/assets.json), downloaded as it's wanted
// (generated/asset_streaming_plan.md, section 2)
const BOOT_BUDGET = 15 * 1024 * 1024;

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

    test("gives every file the hash of its bytes: the code, the engine, the WebAssembly and the fonts as well as the data", async () => {
        for (const { files } of MANIFEST) {
            for (const [path, , hash] of files) {
                assert.equal(hash, await hashOf(path), path);
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

describe("the page's import map (client/index.html)", () => {
    const page = readFile(new URL("../client/index.html", import.meta.url), "utf8");
    const mapOf = async () => JSON.parse((await page).match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;

    test("is up to date: run npm run build:manifest after changing the game's code", async () => {
        assert.equal(await page, await pageSource(await page));
    });

    test("names every module (those main.js loads itself, and the rest) at its address with the hash of its bytes, \"three\" and the addons by name too; and main.js's script", async () => {
        const imports = await mapOf();
        const modules = [...(await startFiles()).map(([path]) => path), "js/app/manifest.js", "js/app/assets.js", ...MANIFEST.flatMap(({ files }) => files.map(([path]) => path)).filter((path) => /\.m?js$/.test(path))];

        for (const path of modules) {
            assert.equal(imports[`./${path}`], `./${path}?h=${await hashOf(path)}`, path);
        }

        assert.equal(imports.three, `./vendor/three-r186/three.module.min.js?h=${await hashOf("vendor/three-r186/three.module.min.js")}`);
        assert.equal(imports["three/addons/"], "./vendor/three-r186/addons/");
        assert.equal(imports["three/addons/loaders/GLTFLoader.js"], `./vendor/three-r186/addons/loaders/GLTFLoader.js?h=${await hashOf("vendor/three-r186/addons/loaders/GLTFLoader.js")}`);
        assert.match(await page, new RegExp(`<script type="module" src="js/main\\.js\\?h=${await hashOf("js/main.js")}"></script>`));
    });

    test("leaves version.js by name, as it's stamped with the commit after it's made (scripts/stamp-version.js)", async () => {
        assert.equal((await mapOf())["./js/app/version.js"], undefined);
        assert.ok((await startFiles()).every(([path]) => path !== "js/app/version.js"));
    });

    test("is read by the page for what it keeps: every address with a hash, in full, once each; none from one it can't read", async () => {
        const base = "https://example.github.io/conquest/";
        const mapped = mappedOf((await page).match(/<script type="importmap">([\s\S]*?)<\/script>/)[1], base);

        assert.ok(mapped.includes(`${base}js/app/game.js?h=${await hashOf("js/app/game.js")}`));
        assert.ok(mapped.every((url) => url.startsWith(base) && /\?h=[0-9a-f]{10}$/.test(url)));
        assert.equal(new Set(mapped).size, mapped.length);
        assert.ok(!mapped.some((url) => url.endsWith("/addons/")));
        assert.deepEqual(mappedOf("not json", base), []);
        assert.deepEqual(mappedOf(undefined, base), []);
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

        // (A licensed model's file may not be here: its hash and size are what assets.json keeps,
        // which the catalog checks against the file where it is, below)
        for (const { licensed, files } of Object.values(ASSETS.models)) {
            for (const { path, hash, bytes } of files.filter(({ path }) => !licensed || existsSync(new URL(`../client/${path}`, import.meta.url)))) {
                assert.equal(hash, await hashOf(path), path);
                assert.equal(bytes, (await stat(new URL(`../client/${path}`, import.meta.url))).size, path);
            }
        }
    });

    test("keeps a licensed model's hash and size, so it's the same with its file or without it (docs/LICENSED_MODELS.md); a file that isn't the one kept, or none kept, is wrong", async () => {
        const chest = { path: "models/jmi/chest.glb", hash: await hashOf("models/jmi/chest.glb"), bytes: (await stat(new URL("../client/models/jmi/chest.glb", import.meta.url))).size };
        const here = { tier: "demand", licensed: true, files: [chest] };
        const away = { tier: "demand", licensed: true, files: [{ path: "models/nowhere.bin", hash: "0123456789", bytes: 12 }] };

        assert.deepEqual((await catalog({ models: { here } })).models.here, here);
        assert.deepEqual((await catalog({ models: { away } })).models.away, away);
        await assert.rejects(catalog({ models: { here: { ...here, files: [{ ...chest, hash: "0123456789" }] } } }), /here: client\/models\/jmi\/chest\.glb isn't the file client\/models\/assets\.json keeps/);
        await assert.rejects(catalog({ models: { here: { ...here, files: [{ ...chest, bytes: 1 }] } } }), /isn't the file client\/models\/assets\.json keeps/);
        await assert.rejects(catalog({ models: { away: { ...away, files: [{ path: "models/nowhere.bin" }] } } }), /away: a licensed model keeps each file's hash and size/);
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

        const started = await startFiles();
        const restarted = structuredClone(started);

        restarted[0][1] = "0123456789";

        assert.equal(releaseOf(groups, await catalog(), started), ASSETS.release);
        assert.equal(releaseOf(groups, models), releaseOf(structuredClone(groups), structuredClone(models)));
        assert.notEqual(releaseOf(groups, models), ASSETS.release);
        assert.notEqual(releaseOf(groups, changed), releaseOf(groups, models));
        // (Code main.js loads itself, changed: another release too)
        assert.notEqual(releaseOf(groups, models, restarted), releaseOf(groups, models, started));
    });

    test("is what a page tells the service worker it keeps: the manifest's files, the page's own modules and the catalog's files, by hash", async () => {
        const models = await catalog({ models: { barrel: { tier: "demand", files: [{ path: "models/kaykit/barrel.gltf" }] } } });
        const main = `https://example.github.io/conquest/js/main.js?h=${await hashOf("js/main.js")}`;
        const game = `https://example.github.io/conquest/js/app/game.js?h=${await hashOf("js/app/game.js")}`;
        const told = releaseTold(MANIFEST, { release: "0123456789", ...models }, "https://example.github.io/conquest/", [main, game]);

        assert.equal(told.kind, "release");
        assert.equal(told.release, "0123456789");
        assert.ok(told.boot.includes(`https://example.github.io/conquest/characters/${GAME_BODY}.bin?h=${await hashOf(`characters/${GAME_BODY}.bin`)}`));
        assert.ok(told.boot.includes(main));
        // (game.js is in the manifest as well: once)
        assert.equal(told.boot.length, MANIFEST.flatMap(({ files }) => files).length + 1);
        assert.deepEqual(told.assets, [`https://example.github.io/conquest/models/kaykit/barrel.gltf?h=${await hashOf("models/kaykit/barrel.gltf")}`]);
    });

    test("names an entry's files, each at its address with its hash: the Basis Universal transcoder's, which KTX2 textures are read with", async () => {
        const page = "https://example.github.io/conquest/";
        const folder = "vendor/three-r186/addons/libs/basis";
        const files = filesOf(ASSETS, "basis-transcoder", page);

        assert.deepEqual(Object.keys(files), ["basis_transcoder.js", "basis_transcoder.wasm"]);

        for (const [name, url] of Object.entries(files)) {
            assert.equal(url, `${page}${folder}/${name}?h=${await hashOf(`${folder}/${name}`)}`);
        }

        assert.deepEqual(filesOf(ASSETS, "nothing", page), {});
    });
});
