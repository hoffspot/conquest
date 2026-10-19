// The mouse pointer (app/pointer.js): a shake told from a mouse only moving, lit a while after it;
// the CSS values set for it; and its pictures (scripts/build-pointers.js), every look at every
// size, 1x and 2x, none bigger than browsers take
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { AIMS, pointerFile, pointerValue, POINTER_SIZES, SHAKE, ShakeDetector, TIP } from "../client/js/app/pointer.js";

// A path fed to a detector, a point every `step` ms from `start`: whether it was lit at its end
function fed(detector, points, { start = 0, step = 16 } = {}) {
    let lit = false;

    points.forEach(([x, y], k) => {
        lit = detector.feed(x, y, start + k * step);
    });

    return lit;
}

// Back and forth along a line `turns` times, `reach` pixels each way, `per` points each way
function zigzag(turns, reach, { per = 4, along = [1, 0], from = [500, 400] } = {}) {
    const points = [];

    for (let turn = 0; turn <= turns; turn++) {
        for (let k = 1; k <= per; k++) {
            const share = turn % 2 === 0 ? k / per : 1 - k / per;

            points.push([from[0] + along[0] * reach * share, from[1] + along[1] * reach * share]);
        }
    }

    return points;
}

describe("the mouse pointer shaken to find it (pointer.js ShakeDetector)", () => {
    it("lights at a quick shake back and forth, any way, and stays lit a while after it, then goes out", () => {
        for (const along of [[1, 0], [0, 1], [Math.SQRT1_2, Math.SQRT1_2]]) {
            const detector = new ShakeDetector();
            const shake = zigzag(6, 120, { along });

            assert.equal(fed(detector, shake), true, `${along}`);

            const end = (shake.length - 1) * 16;

            assert.equal(detector.lit(end + SHAKE.lit - 50), true, "still lit a moment after");
            assert.equal(detector.lit(end + SHAKE.lit + 50), false, "out a while after");
        }
    });

    it("doesn't light at a mouse only moving: a long sweep however fast, a circle, a little wiggle, or a slow back and forth", () => {
        const sweep = Array.from({ length: 30 }, (_, k) => [k * 80, 300]);
        const circle = Array.from({ length: 60 }, (_, k) => [500 + Math.cos(k / 4) * 150, 400 + Math.sin(k / 4) * 150]);

        assert.equal(fed(new ShakeDetector(), sweep), false, "a sweep");
        assert.equal(fed(new ShakeDetector(), circle), false, "a circle");
        assert.equal(fed(new ShakeDetector(), zigzag(8, 12)), false, "a wiggle of a few pixels");
        assert.equal(fed(new ShakeDetector(), zigzag(6, 120), { step: 120 }), false, "back and forth, slowly");
        assert.equal(fed(new ShakeDetector(), zigzag(2, 300)), false, "back and forth once");
    });

    it("forgets the moves before it's reset (off the page, or a button held: dragging)", () => {
        const detector = new ShakeDetector();
        const half = zigzag(6, 120).slice(0, 12);

        fed(detector, half);
        detector.reset();
        assert.equal(fed(detector, half, { start: 12 * 16 }), false);
    });
});

describe("the mouse pointer's pictures and values (pointer.js, scripts/build-pointers.js)", () => {
    // A PNG's width and height, from its header
    const sizeOf = (file) => {
        const bytes = readFileSync(new URL(`../client/${file}`, import.meta.url));

        assert.equal(bytes.toString("latin1", 1, 4), "PNG", file);

        return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
    };

    it("has every look at every size, 1x and 2x, each the size it's said to be and no bigger than 128 pixels", () => {
        for (const look of [...AIMS, "shaken"]) {
            for (const { still, shaken } of Object.values(POINTER_SIZES)) {
                const size = look === "shaken" ? shaken : still;

                for (const scale of [1, 2]) {
                    const [width, height] = sizeOf(pointerFile(look, size, scale));

                    assert.deepEqual([width, height], [size * scale, size * scale], pointerFile(look, size, scale));
                    assert.ok(width <= 128, pointerFile(look, size, scale));
                }
            }
        }

        // (Shaken, half again as big)
        for (const { still, shaken } of Object.values(POINTER_SIZES)) {
            assert.ok(shaken >= still * 1.45 && shaken <= still * 1.5, `${still} shaken ${shaken}`);
        }
    });

    it("points with the sword's tip, both scales offered where the browser takes them, the system's pointer last", () => {
        assert.equal(pointerValue("attack", 32, { base: "https://x/" }), 'image-set(url("https://x/images/pointer/attack-32.png") 1x, url("https://x/images/pointer/attack-32@2x.png") 2x) 2 2, auto');
        assert.equal(pointerValue("shaken", 64, { sets: false }), 'url("images/pointer/shaken-64.png") 4 4, auto');
        assert.equal(Math.round(44 * TIP), 3);
    });

    it("is styled everywhere but where one types, over the view as the game says, only with a mouse", () => {
        const css = readFileSync(new URL("../client/styles.css", import.meta.url), "utf8");
        const block = css.slice(css.indexOf("@media (hover: hover) and (pointer: fine) {\n    :root[data-pointer]"));

        assert.ok(block.length > 0);
        assert.match(block, /cursor: var\(--pointer\) !important/);
        assert.match(block, /#view \{\s+cursor: var\(--pointer-view, var\(--pointer\)\) !important/);
        assert.match(block, /textarea, \[contenteditable="true"\], input:not\(/);
    });
});
