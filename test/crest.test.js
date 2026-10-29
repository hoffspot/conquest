// The crest over the loading screen and the title (app/crest.js): its pictures there
// (scripts/build-crest.js), AVIF and WebP, see-through, as big as its master, within their budget;
// its lettering, Cinzel Decorative as it was made, its licence beside it; the page's crest as
// crest.js has it, and styles.css placing its name and eyes where crest.js says they are, its name
// in its lettering, forging it as long and shining it once; its name moved for its letters to be in
// its line's middle, by their outlines, and again as it's resized; forged once its lettering's here,
// or it's waited long enough; and its eyes blinking every 5 to 8 seconds
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { describe, it } from "node:test";
import { CREST, CREST_FOLDER, CREST_FONT, Crest, levelOf } from "../client/js/app/crest.js";

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

        // (Shone once, as long as crest.js has it; its name in its lettering, moved level)
        assert.match(rule(".crest.shining .crest-sheen"), new RegExp(`animation: crest-shine ${CREST.shine.length}s ease-in-out both;`));
        assert.match(rule("@font-face"), new RegExp(`font-family: "${CREST_FONT.family}";\\s+src: url\\("${CREST_FONT.file}"\\) format\\("truetype"\\);\\s+font-weight: ${CREST_FONT.weight};`));
        assert.match(rule(".crest .wordmark"), new RegExp(`font-family: "${CREST_FONT.family}", var\\(--font-display\\);\\s+font-weight: ${CREST_FONT.weight};`));
        assert.match(rule(".crest .wordmark"), /translate: 0 var\(--level, 0em\);/);
    });

    it("has its lettering, Cinzel Decorative as Natanael Gama made it, with its licence beside it", () => {
        const font = readFileSync(new URL(CREST_FONT.file, client));
        const licence = readFileSync(new URL(CREST_FONT.file.replace(/-Bold\.ttf$/, "-OFL.txt"), client), "utf8");
        const named = (name) => font.includes(name) || font.includes(Buffer.from([...name].flatMap((c) => [0, c.charCodeAt(0)])));

        assert.equal(font.readUInt32BE(0), 0x00010000, "a TrueType font");
        assert.ok(named(CREST_FONT.family), `named ${CREST_FONT.family}`);
        assert.match(licence, /SIL Open Font License, Version 1\.1/);
        assert.match(licence, /Copyright \(c\) 2012 Natanael Gama/);
    });

    it("moves its name for its letters' ink to be in its line's middle, whatever its lettering sets them at", () => {
        // (A line 100 pixels tall, its baseline 80 down: letters 70 above it and none below, too
        // high by 10, moved down a tenth of the 100 pixel size; in the middle already, not moved)
        assert.equal(levelOf({ baseline: 80, height: 100, ascent: 70, descent: 0, size: 100 }), 0.05);
        assert.equal(levelOf({ baseline: 85, height: 100, ascent: 70, descent: 0, size: 100 }), 0);
        assert.equal(levelOf({ baseline: 90, height: 100, ascent: 70, descent: 10, size: 100 }), -0.1);
        assert.equal(levelOf({ baseline: 80, height: 100, ascent: 70, descent: 0, size: 0 }), 0);
    });

    it("sets its name level by its letters' outlines, not the whole pixels measureText has their edges in at the size they're drawn at; and again as it's resized", () => {
        // (Letters 0.74 of their size above their baseline and 0.26 below, as a canvas measures
        // them, in whole pixels; drawn 10 pixels tall, on a line as tall, its baseline 8 down)
        const ink = { ascent: 0.74, descent: 0.26 };
        const drawn = { size: 10, height: 10, baseline: 8 };
        const levels = [];
        let font = "";
        let resized = null;
        const canvas = {
            getContext: () => ({
                set font(value) {
                    font = value;
                },
                measureText: () => {
                    const size = parseFloat(font.split(" ")[1]);

                    return { actualBoundingBoxAscent: Math.round(ink.ascent * size), actualBoundingBoxDescent: Math.round(ink.descent * size) };
                },
            }),
        };
        const page = { createElement: (tag) => (tag === "canvas" ? canvas : { style: { setProperty() {} }, dataset: {}, getBoundingClientRect: () => ({ top: drawn.baseline }), remove() {} }) };
        const name = { textContent: "Pellagos", setAttribute() {}, append() {}, getBoundingClientRect: () => ({ top: 0, height: drawn.height }) };
        const element = { ownerDocument: page, dataset: {}, classList: { add() {}, remove() {} }, style: { setProperty: (key, value) => levels.push(value) }, querySelector: () => name, querySelectorAll: () => [] };
        const view = {
            matchMedia: () => ({ matches: true }),
            getComputedStyle: () => ({ fontSize: `${drawn.size}px`, fontWeight: "700", fontFamily: `"${CREST_FONT.family}"` }),
            setTimeout() {},
            clearTimeout() {},
            ResizeObserver: class {
                constructor(run) {
                    resized = run;
                }

                observe(target) {
                    assert.equal(target, element);
                }
            },
        };
        const crest = new Crest(element, { window: view });

        // (Measured in whole pixels at 10, 7 and 3: moved 0.1 em up, 0.04 too far)
        crest.level();
        assert.equal(levels.at(-1), "-0.060em");

        // (Made twice as big, its baseline a pixel and a half lower in its line than that was)
        Object.assign(drawn, { size: 20, height: 20, baseline: 15.5 });
        resized();
        assert.equal(levels.at(-1), "-0.035em");
    });

    it("is forged once its lettering's here, or once it's waited long enough for it, and shone once a moment after", async () => {
        const forging = async (loads) => {
            const timers = [];
            const classes = new Set();
            const element = { dataset: {}, style: { setProperty() {} }, classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name) }, querySelector: () => null, querySelectorAll: () => [] };
            let loaded = () => {};
            const page = {
                document: { fonts: { load: () => (loads ? Promise.resolve([]) : new Promise((done) => (loaded = done))) } },
                setTimeout: (run, ms) => timers.push({ run, ms }),
                clearTimeout() {},
            };

            new Crest(element, { window: page });

            const waiting = classes.has("waiting");

            await new Promise((done) => setImmediate(done));

            return { waiting, classes, timers, loaded };
        };

        // (Its lettering here at once: forged, the waiting given up)
        const ready = await forging(true);

        assert.ok(ready.waiting);
        assert.deepEqual([...ready.classes], ["forging"]);

        // (Not here: waiting till it's waited long enough, then forged in what it has)
        const slow = await forging(false);

        assert.deepEqual([...slow.classes], ["waiting"]);
        assert.equal(slow.timers[0].ms, CREST.forge.wait * 1000);
        slow.timers[0].run();
        await new Promise((done) => setImmediate(done));
        assert.deepEqual([...slow.classes], ["forging"]);

        // (Forged for good once the last letter's cooled, and shone a moment after)
        const { delay, each, cool } = CREST.forge;
        const forged = ready.timers.find(({ ms }) => ms === (delay + 0 * each + cool) * 1000);

        forged.run();
        assert.deepEqual([...ready.classes], []);
        assert.equal(ready.timers.at(-1).ms, CREST.shine.after * 1000);
        ready.timers.at(-1).run();
        assert.deepEqual([...ready.classes], ["shining"]);
    });

    it("blinks its eyes every 5 to 8 seconds, now and then twice; not while the page is hidden", () => {
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

        assert.ok(gaps.every((gap) => gap >= 5 && gap <= 8), gaps.join(", "));
        assert.ok(Math.max(...gaps) - Math.min(...gaps) > 2, "not like clockwork");
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
