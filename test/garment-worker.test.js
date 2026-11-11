// Garments' pictures painted off the page's thread (client/js/characters: skin-worker.js,
// skins.js, garment-pictures.js): what the worker paints with needs nothing a worker can't have,
// and its colours are three.js's to the last bit
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import * as THREE from "three";

const { GARMENTS, linearColour } = await import("../client/js/characters/garment-pictures.js");

const client = fileURLToPath(new URL("../client/", import.meta.url));

describe("garments' pictures painted in the skins' worker", () => {
    it("imports nothing a worker can't have: every module the worker's made of is by its own path, none by the page's import map (three.js)", () => {
        // (A worker has no import map: "three" there is an error that stops it, skins and all)
        const seen = new Set();
        const bare = [];
        const follow = (file) => {
            if (seen.has(file)) {
                return;
            }

            seen.add(file);

            for (const [, specifier] of readFileSync(file, "utf8").matchAll(/(?:^|[;\s}])(?:import|export)\s*(?:[\w*{}\s,$]*?\s*from\s*)?["']([^"']+)["']/g)) {
                if (/^\.{1,2}\//.test(specifier)) {
                    follow(path.resolve(path.dirname(file), specifier));
                } else {
                    bare.push(`${path.relative(client, file)}: ${specifier}`);
                }
            }
        };

        follow(path.join(client, "js/characters/skin-worker.js"));
        follow(path.join(client, "js/characters/garment-pictures.js"));
        assert.deepEqual(bare, []);
        assert.ok(!seen.has(path.join(client, "js/characters/garments.js")), "not what fits them to a body, which is three.js's meshes");
    });

    it("has every garment's colours in linear light as three.js has them, to the last bit", () => {
        const colours = new Set();

        for (const garment of Object.values(GARMENTS)) {
            for (const colour of [garment.colour, garment.trim, garment.accent, garment.emblem?.colour]) {
                if (colour !== undefined) {
                    colours.add(colour);
                }
            }
        }

        assert.ok(colours.size > 60, `${colours.size} colours`);

        for (const colour of [...colours, 0x000000, 0xffffff, 0x0a0b0c, "#fff", "#1a9", "#0A0b0C"]) {
            const { r, g, b } = new THREE.Color(colour);

            assert.deepEqual(linearColour(colour), { r, g, b }, String(colour));
        }

        assert.throws(() => linearColour("red"), /not red/);
    });
});
