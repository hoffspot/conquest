// The crest over the loading screen and the title (app/crest.js): its pictures there
// (scripts/build-crest.js), AVIF and WebP, see-through, as big as its master, within their budget;
// the page's crest as crest.js has it, and styles.css placing its name and eyes where crest.js says
// they are, and forging it as long; its embers rising, its sparks thrown off and slowing, each
// gone once it's lasted; and its eyes blinking only once in a while
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { describe, it } from "node:test";
import { CREST, CREST_FOLDER, Crest, emberAt, stepEmbers } from "../client/js/app/crest.js";

const client = new URL("../client/", import.meta.url);
const master = new URL("../scripts/crest/crest.jpg", import.meta.url);

// The most each may be (bytes)
const BUDGET = Object.freeze({ avif: 120 * 1024, webp: 200 * 1024 });

// How big a JPEG is (by its frame), and an AVIF (by its first `ispe` box) and an extended WebP
// (by its VP8X chunk); and whether each is see-through: an AVIF with a second picture its alpha
// (`auxC`, its kind's name), a WebP with VP8X's alpha flag
function jpegSize(bytes) {
    for (let at = 2; at < bytes.length; ) {
        const marker = bytes[at + 1];

        if (marker >= 0xc0 && marker <= 0xc3) {
            return [bytes.readUInt16BE(at + 7), bytes.readUInt16BE(at + 5)];
        }

        at += 2 + bytes.readUInt16BE(at + 2);
    }

    return null;
}

function avifOf(bytes) {
    const at = bytes.indexOf("ispe");

    return { size: [bytes.readUInt32BE(at + 8), bytes.readUInt32BE(at + 12)], alpha: bytes.includes("urn:mpeg:mpegB:cicp:systems:auxiliary:alpha") };
}

function webpOf(bytes) {
    assert.equal(bytes.toString("latin1", 12, 16), "VP8X", "an extended WebP (for its alpha)");

    return { size: [bytes.readUIntLE(24, 3) + 1, bytes.readUIntLE(27, 3) + 1], alpha: Boolean(bytes[20] & 0x10) };
}

const percent = (share) => `${Math.round(share * 1000) / 10}%`;

describe("the crest over the loading screen and the title (crest.js)", () => {
    it("has its pictures, AVIF and WebP, see-through and as big as its master, within the budget", () => {
        assert.deepEqual(jpegSize(readFileSync(master)), [...CREST.size]);

        for (const [type, read] of [
            ["avif", avifOf],
            ["webp", webpOf],
        ]) {
            const file = new URL(`${CREST_FOLDER}/crest.${type}`, client);
            const { size, alpha } = read(readFileSync(file));

            assert.deepEqual(size, [...CREST.size], `crest.${type}`);
            assert.ok(alpha, `crest.${type} is see-through`);
            assert.ok(statSync(file).size <= BUDGET[type], `crest.${type}: ${statSync(file).size} bytes`);
        }
    });

    it("is the page's own, its name and its eyes placed where crest.js has them, forged as long", () => {
        const page = readFileSync(new URL("index.html", client), "utf8");
        const styles = readFileSync(new URL("styles.css", client), "utf8");
        const rule = (selector) => styles.match(new RegExp(`(^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{([^}]*)\\}`))?.[2] ?? "";
        const { left, right, top, bottom } = CREST.ribbon;

        assert.match(page, new RegExp(`<source type="image/avif" srcset="${CREST_FOLDER}/crest\\.avif">`));
        assert.match(page, new RegExp(`<img class="crest-art" src="${CREST_FOLDER}/crest\\.webp" alt="" width="${CREST.size[0]}" height="${CREST.size[1]}"`));
        assert.match(page, /<h1 class="wordmark" id="titlename">Pellagos<\/h1>/);
        assert.match(page, /<section id="loading" class="screen" aria-labelledby="titlename">/);
        assert.match(page, /<section id="title" class="screen" hidden aria-labelledby="titlename">/);

        // (Its name on its ribbon, its eyes where they are, its shape the picture's)
        assert.match(rule(".crest-name"), new RegExp(`left: ${percent(left)};\\s+right: ${percent(1 - right)};\\s+top: ${percent(top)};\\s+bottom: ${percent(1 - bottom)};`));
        assert.match(rule(".crest-eye.left,\n.crest-lid.left"), new RegExp(`left: ${percent(CREST.eyes[0][0])};`));
        assert.match(rule(".crest-eye.right,\n.crest-lid.right"), new RegExp(`left: ${percent(CREST.eyes[1][0])};`));
        assert.match(rule(".crest-eye,\n.crest-lid"), new RegExp(`top: ${percent(CREST.eyes[0][1])};`));
        assert.equal(CREST.eyes[0][1], CREST.eyes[1][1]);
        assert.match(rule("#crest"), new RegExp(`aspect-ratio: ${CREST.size[0]} / ${CREST.size[1]};`));

        // (Each letter struck in turn, as long after the last as crest.js forges it for)
        const { delay, each, cool } = CREST.forge;

        assert.match(rule(".crest.forging .letter"), new RegExp(`animation-delay: calc\\(${delay}s \\+ var\\(--i\\) \\* ${each}s\\);`));
        assert.match(rule(".crest.forging .letter::after"), new RegExp(`animation: crest-heat ${cool}s ease-out both;`));
    });

    it("has its embers rise off its name, swaying a little, and its sparks thrown off every way and slowing; each gone once it's lasted", () => {
        let seed = 7;
        const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
        let embers = Array.from({ length: 30 }, () => emberAt(0.5, 0.45, random));

        assert.ok(embers.every(({ vy, life }) => vy < 0 && life >= CREST.embers.life[0] && life <= CREST.embers.life[1]));

        embers = stepEmbers(embers, 1);
        assert.ok(embers.every(({ y, x }) => y < 0.45 - CREST.embers.rise[0] * 0.99 && Math.abs(x - 0.5) < 0.1), "risen, not far aside");

        embers = stepEmbers(stepEmbers(embers, 1), 1);
        assert.equal(embers.length, 0, "gone once they've lasted");

        // (Sparks off a letter: every way, slowing, soon gone)
        const sparks = Array.from({ length: CREST.embers.sparks }, () => emberAt(0.3, 0.5, random, { spark: true }));
        const ways = new Set(sparks.map(({ vx, vy }) => `${Math.sign(vx)}${Math.sign(vy)}`));
        const before = Math.hypot(sparks[0].vx);

        assert.ok(ways.size >= 3, `${ways.size} ways`);
        assert.ok(sparks.every(({ life }) => life < 0.75));
        stepEmbers(sparks, 0.1);
        assert.ok(Math.hypot(sparks[0].vx) < before || before === 0, "slowing");
        assert.equal(stepEmbers(sparks, 1).length, 0);
    });

    it("blinks its eyes only once in a while: 15 to 40 seconds apart, now and then twice; not while the page is hidden", () => {
        // (A crest of its eyes and lids only, on a page whose timers are kept to be run here)
        const animated = [];
        const part = (kind) => ({ classList: { contains: (name) => name === kind }, animate: (frames, { iterations }) => animated.push({ kind, iterations }) });
        const parts = [part("crest-lid"), part("crest-lid"), part("crest-eye"), part("crest-eye")];
        const element = { dataset: {}, classList: { add() {}, remove() {} }, querySelector: () => null, querySelectorAll: () => parts };
        const timers = [];
        const page = { document: { hidden: false }, setTimeout: (run, ms) => timers.push({ run, ms }), clearTimeout() {} };
        let seed = 11;
        const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
        const crest = new Crest(element, { window: page, random });

        timers.length = 0;
        crest.screen("title");

        const gaps = [];

        for (let k = 0; k < 40; k++) {
            const { run, ms } = timers.shift();

            gaps.push(ms / 1000);
            run();
        }

        assert.ok(gaps.every((gap) => gap >= 15 && gap <= 40), gaps.join(", "));
        assert.ok(Math.max(...gaps) - Math.min(...gaps) > 10, "not like clockwork");
        assert.equal(animated.length, 40 * parts.length, "each lid and eye, each time");

        const twice = animated.filter(({ iterations }) => iterations === 2).length / parts.length;

        assert.ok(twice >= 1 && twice <= 16, `${twice} of 40 twice`);

        // (Hidden: none, the next put off till it's shown)
        page.document.hidden = true;
        timers.shift().run();
        assert.equal(animated.length, 40 * parts.length);
        assert.equal(timers.length, 1);
    });
});
