// The licensed models' scrambling (client/js/app/scramble.js; docs/LICENSED_MODELS.md,
// *Scrambling*): a scrambled file comes back as it was, packs as small, is known by how it starts,
// and is read a MiB at a time; and every licensed model in the catalog is served scrambled. (Those
// that read a licensed model are left out where the licensed models aren't here, saying so:
// scripts/licensed-models.js.)

import assert from "node:assert/strict";
import { open, readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { gzipSync } from "node:zlib";

const { isScrambled, readable, scramble, unscramble } = await import("../client/js/app/scramble.js");
const { ASSETS } = await import("../client/js/app/assets.js");
const { LEFT_OUT, licensedModelsHere } = await import("../scripts/licensed-models.js");

const licensed = licensedModelsHere() || LEFT_OUT;

const MIB = 1 << 20;

// Bytes that look like a GLB: "glTF", then a pattern
function glbLike(length) {
    const bytes = new Uint8Array(length);

    for (let i = 0; i < length; i++) {
        bytes[i] = Math.imul(i + 1, 2654435761) >>> 24;
    }

    bytes.set([0x67, 0x6c, 0x54, 0x46].slice(0, length));

    return bytes;
}

const fileOf = (path) => new URL(`../client/${path}`, import.meta.url);

describe("the licensed models' scrambling (app/scramble.js)", () => {
    it("comes back as it was, whatever its length and wherever in its buffer it starts", () => {
        for (const length of [0, 1, 2, 3, 4, 5, 9, MIB + 3]) {
            for (const offset of [0, 1]) {
                const original = glbLike(length);
                const bytes = new Uint8Array(length + offset).subarray(offset);

                bytes.set(original);
                scramble(bytes);

                if (length > 4) {
                    assert.notDeepEqual(bytes, original, `${length} bytes from ${offset}: scrambled`);
                }

                assert.deepEqual(unscramble(bytes), original, `${length} bytes from ${offset}`);
            }
        }
    });

    it("swaps each byte for another, one for one", () => {
        const all = scramble(Uint8Array.from({ length: 256 }, (_, i) => i));

        assert.equal(new Set(all).size, 256);
        assert.ok(all.some((to, from) => to !== from));
    });

    it("is known by how it starts: a GLB's \"glTF\", scrambled", () => {
        const glb = glbLike(64);

        assert.equal(isScrambled(glb), false);
        assert.equal(isScrambled(scramble(glb.slice())), true);
        assert.equal(isScrambled(new Uint8Array(3)), false);
        assert.equal(isScrambled(scramble(glbLike(3))), false);
    });

    it("is read a MiB at a time, with a turn between; a file that isn't scrambled is read as it is", async () => {
        const original = glbLike(2 * MIB + 5);
        const scrambled = scramble(original.slice());
        const plain = original.slice().buffer;
        const turns = [];
        const setTimeout = globalThis.setTimeout;

        globalThis.setTimeout = (callback, ms) => {
            turns.push(ms);

            return setTimeout(callback, ms);
        };

        try {
            assert.equal(await readable(plain), plain);
            assert.deepEqual(new Uint8Array(plain), original, "left as it is");
            assert.deepEqual(turns, []);

            const read = await readable(scrambled.buffer);

            assert.equal(read, scrambled.buffer, "in place");
            assert.deepEqual(new Uint8Array(read), original);
            assert.deepEqual(turns, [0, 0], "three MiBs (the last a few bytes), a turn between each");
        } finally {
            globalThis.setTimeout = setTimeout;
        }
    });

    it("packs as small as the model it scrambles (the Dreadthorn's, gzipped as GitHub Pages sends it)", { skip: licensed !== true && licensed }, async () => {
        const file = await readFile(fileOf(ASSETS.models["beast-dreadthorn"].files[0].path));
        const scrambled = gzipSync(file).length;
        const model = gzipSync(unscramble(Uint8Array.from(file))).length;

        assert.ok(Math.abs(scrambled - model) < model * 0.001, `${scrambled} bytes gzipped, the model ${model}`);
    });

    // A file's first 12 bytes: a GLB's header, if it is one
    async function startOf(path) {
        const handle = await open(fileOf(path));
        const start = new Uint8Array(12);

        try {
            await handle.read(start, 0, 12, 0);
        } finally {
            await handle.close();
        }

        return start;
    }

    it("is how no model in the catalog but a licensed one is served", async () => {
        assert.deepEqual(
            Object.entries(ASSETS.models)
                .filter(([, { licensed: marked }]) => marked)
                .map(([name]) => name),
            ["beast-dreadthorn", "beast-werewolf", "beast-werewolf-skins", "beast-centipede", "beast-ant-monster", "beast-ant", "beast-dungeon-spider", "beast-elite-dungeon-spider", "beast-dungeon-scorpion", "beast-giant-cockroach", "beast-dungeon-wasp", "beast-black-widow", "beast-greater-demon", "beast-fiend", "beast-fiend-skins", "beast-flayling", "beast-cinder-husk", "beast-pyre-acolyte", "beast-ossuary-priest", "beast-dirge-warden", "beast-flayed-hierarch", "beast-slag-gorger", "beast-forge-brute", "beast-chained-glutton", "beast-bloat-gorger", "beast-pit-ravager", "beast-gorger-warlord"],
        );

        for (const [name, { licensed: marked, files }] of Object.entries(ASSETS.models)) {
            for (const { path } of marked ? [] : files) {
                assert.equal(isScrambled(await startOf(path)), false, `${name}: ${path}`);
            }
        }
    });

    it("is how every licensed model in the catalog is served, each a GLB once it's unscrambled", { skip: licensed !== true && licensed }, async () => {
        for (const [name, { licensed: marked, files }] of Object.entries(ASSETS.models)) {
            for (const { path, bytes } of marked ? files : []) {
                const start = await startOf(path);

                assert.equal(isScrambled(start), true, `${name}: ${path}`);
                assert.match(path, /\.bin$/, `${name}: not named as a GLB`);

                const glb = unscramble(start);

                assert.equal(new TextDecoder().decode(glb.subarray(0, 4)), "glTF", `${name}: ${path}`);
                assert.equal(new DataView(glb.buffer).getUint32(8, true), bytes, `${name}: ${path}, its length`);
            }
        }
    });
});
