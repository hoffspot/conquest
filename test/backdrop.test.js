// The paintings behind the loading screen and the title (app/backdrop.js): every scene's pictures
// there (scripts/build-backdrops.js), AVIF and WebP, each the way it's painted and as big as its
// master (or no more than BACKDROP.most its longest side), within its budget; each drift keeping it
// covering the page; the page's own first picture the first scene's; and no master left without a
// scene
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, it } from "node:test";
import { BACKDROP, BACKDROP_FOLDER, BACKDROPS, DRIFTS } from "../client/js/app/backdrop.js";

const client = new URL("../client/", import.meta.url);
const masters = new URL("../scripts/backdrops/", import.meta.url);

// The most each may be (bytes): a phone downloads only the tall ones, a computer the wide
const BUDGET = Object.freeze({ avif: 100 * 1024, webp: 150 * 1024 });

// How big a picture is ([width, height]): an AVIF's by its `ispe` box, a WebP's by its first
// chunk (lossy, lossless or extended), a PNG's by its header, a JPEG's by its frame
function sizeOf(bytes, type) {
    if (type === "png") {
        return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
    }

    if (type === "avif") {
        const at = bytes.indexOf("ispe");

        return [bytes.readUInt32BE(at + 8), bytes.readUInt32BE(at + 12)];
    }

    if (type === "webp") {
        const chunk = bytes.toString("latin1", 12, 16);

        if (chunk === "VP8 ") {
            return [bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff];
        }

        if (chunk === "VP8L") {
            const bits = bytes.readUInt32LE(21);

            return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1];
        }

        return [bytes.readUIntLE(24, 3) + 1, bytes.readUIntLE(27, 3) + 1];
    }

    for (let at = 2; at < bytes.length; ) {
        const marker = bytes[at + 1];

        if (marker >= 0xc0 && marker <= 0xc3) {
            return [bytes.readUInt16BE(at + 7), bytes.readUInt16BE(at + 5)];
        }

        at += 2 + bytes.readUInt16BE(at + 2);
    }

    return null;
}

const ways = ({ tall, wide }) => [tall && "tall", wide && "wide"].filter(Boolean);

// A scene's master, painted one way: its file's name (a JPEG or a PNG)
const masterOf = (scene, way) => readdirSync(masters).find((name) => name === `${scene}-${way}.jpg` || name === `${scene}-${way}.png`);

// How big a master's made: as it is, or no more than BACKDROP.most its longest side (its shape
// kept, its sides even)
function madeAt([width, height]) {
    const share = Math.min(1, BACKDROP.most / Math.max(width, height));

    return share === 1 ? [width, height] : [width, height].map((side) => Math.floor((side * share) / 2) * 2);
}

describe("the paintings behind the loading screen and the title (backdrop.js)", () => {
    it("has every scene's pictures, AVIF and WebP, the way it's painted and as big as its master (or no more than BACKDROP.most its longest side), within the budget", () => {
        for (const backdrop of BACKDROPS) {
            assert.ok(ways(backdrop).length, `${backdrop.scene} is painted some way`);

            for (const way of ways(backdrop)) {
                const name = masterOf(backdrop.scene, way);

                assert.ok(name, `${backdrop.scene}-${way}'s master`);

                const master = madeAt(sizeOf(readFileSync(new URL(name, masters)), name.split(".").pop()));

                for (const type of ["avif", "webp"]) {
                    const file = new URL(`${BACKDROP_FOLDER}/${backdrop.scene}-${way}.${type}`, client);
                    const [width, height] = sizeOf(readFileSync(file), type);

                    assert.ok(Math.abs(width - master[0]) <= 2 && Math.abs(height - master[1]) <= 2, `${backdrop.scene}-${way}.${type}: ${width} by ${height}, its master made ${master.join(" by ")}`);
                    assert.equal(way === "tall" ? height > width : width > height, true, `${backdrop.scene}-${way}.${type} ${way}`);
                    assert.ok(statSync(file).size <= BUDGET[type], `${backdrop.scene}-${way}.${type}: ${statSync(file).size} bytes`);
                }
            }
        }
    });

    it("shows first a scene painted both ways, so there's one whichever way the screen's held; each fades in well within its turn, and drifts no further than it covers the page", () => {
        assert.deepEqual(ways(BACKDROPS[0]), ["tall", "wide"]);
        assert.ok(BACKDROPS.some(({ tall }) => tall) && BACKDROPS.some(({ wide }) => wide));
        assert.ok(BACKDROP.fade * 4 <= BACKDROP.every);

        // (Each drift never further than how big it is leaves room for: it covers the page all along)
        for (const { from, to } of DRIFTS) {
            for (const [scale, x, y] of [from, to]) {
                assert.ok(scale >= 1 && Math.abs(x) <= (scale - 1) / (2 * scale) && Math.abs(y) <= (scale - 1) / (2 * scale), `${[scale, x, y]}`);
            }
        }

        // (The fade's the page's own: styles.css)
        assert.match(readFileSync(new URL("styles.css", client), "utf8"), new RegExp(`#backdrop img \\{[^}]*transition: opacity ${BACKDROP.fade}s`));
    });

    it("has the first scene's picture in the page itself, as backdrop.js makes it: its tall ones upright, its wide one else, AVIF first", () => {
        const html = readFileSync(new URL("index.html", client), "utf8");
        const picture = html.match(/<div id="backdrop"[^>]*>\s*<picture>([\s\S]*?)<\/picture>/)?.[1];
        const { scene } = BACKDROPS[0];

        assert.ok(picture, "a picture in #backdrop");
        assert.deepEqual(
            [...picture.matchAll(/<source type="([^"]+)" srcset="([^"]+)"(?: media="([^"]+)")?>/g)].map(([, type, srcset, media]) => [type, srcset, media ?? null]),
            [
                ["image/avif", `${BACKDROP_FOLDER}/${scene}-tall.avif`, "(orientation: portrait)"],
                ["image/webp", `${BACKDROP_FOLDER}/${scene}-tall.webp`, "(orientation: portrait)"],
                ["image/avif", `${BACKDROP_FOLDER}/${scene}-wide.avif`, null],
            ],
        );
        assert.match(picture, new RegExp(`<img src="${BACKDROP_FOLDER}/${scene}-wide\\.webp" alt="" decoding="async" data-scene="${scene}">`));
    });

    it("has no master that isn't one of the scenes' (each `<scene>-tall` or `<scene>-wide`, a JPEG or a PNG)", () => {
        const wanted = BACKDROPS.flatMap((backdrop) => ways(backdrop).map((way) => `${backdrop.scene}-${way}`)).sort();

        assert.deepEqual(readdirSync(masters).map((name) => name.replace(/\.(jpg|png)$/, "")).sort(), wanted);
        assert.deepEqual(readdirSync(new URL(BACKDROP_FOLDER, client)).sort(), wanted.flatMap((name) => ["avif", "webp"].map((type) => `${name}.${type}`)).sort());
    });
});
