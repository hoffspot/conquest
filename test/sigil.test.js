// The Prismatic sigil (client/js/app/sigil.js) shows a chain's whole course itself, with no message:
// a piece earned or the sigil made whole, it flares in the piece's colour; let lapse, broken or
// faded, it's shown going for its time (SIGIL_ENDS), saying so, then gone; spent, gone at once.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { ELEMENTS } from "../client/js/core/prismatic.js";
import { Sigil, SIGIL_COLOURS, SIGIL_ENDS } from "../client/js/app/sigil.js";

// (As much of an element as the sigil touches: its classes, style, attributes and parts)
class Element {
    constructor(dataset = {}) {
        this.hidden = false;
        this.dataset = dataset;
        this.classes = new Set();
        this.props = new Map();
        this.attributes = new Map();
        this.offsetWidth = 64;
        this.classList = {
            add: (...names) => names.forEach((name) => this.classes.add(name)),
            remove: (...names) => names.forEach((name) => this.classes.delete(name)),
            toggle: (name, on) => (on ? this.classes.add(name) : this.classes.delete(name)),
            contains: (name) => this.classes.has(name),
        };
        this.style = { setProperty: (name, value) => this.props.set(name, value), getPropertyValue: (name) => this.props.get(name) ?? "" };
        this.petals = null;
        this.parts = new Map();
    }

    querySelectorAll(selector) {
        this.petals ??= ELEMENTS.map((element) => new Element({ element }));

        return selector === ".sigil-petal" ? this.petals : [];
    }

    querySelector(selector) {
        if (!this.parts.has(selector)) {
            this.parts.set(selector, new Element());
        }

        return this.parts.get(selector);
    }

    setAttribute(name, value) {
        this.attributes.set(name, value);
    }

    addEventListener() {}

    append() {}

    remove() {}
}

globalThis.document ??= { createElement: () => new Element() };

const climbing = { element: "fire", step: 3, at: 0, pieces: [], piece: null, readyAt: null };
const whole = { element: null, step: 0, at: 0, pieces: [...ELEMENTS], piece: null, readyAt: 0 };

describe("the Prismatic sigil (sigil.js)", () => {
    it("shows a chain broken going for its time, red, saying so, though the frame that hid it came first; then gone", () => {
        const sigil = new Sigil(new Element());
        const { element } = sigil;

        sigil.show(climbing, 1000);
        assert.equal(element.hidden, false);

        // (Gone from the battle a frame before the game hears it broke)
        sigil.show(null, 12000);
        assert.equal(element.hidden, true);
        sigil.end("broken", 12000);
        assert.equal(element.hidden, false);
        assert.ok(element.classes.has("ending") && element.classes.has("broken"));
        assert.equal(element.attributes.get("aria-label"), "The Prismatic chain is broken: its strength is lost.");
        assert.equal(element.title, SIGIL_ENDS.broken.said);

        sigil.show(null, 12000 + SIGIL_ENDS.broken.ms - 1);
        assert.equal(element.hidden, false, "still going");
        sigil.show(null, 12000 + SIGIL_ENDS.broken.ms);
        assert.equal(element.hidden, true);
        assert.ok(!element.classes.has("ending") && !element.classes.has("broken"));
    });

    it("shows the whole sigil fading, no longer whole, for longer; a new chain begun meanwhile drawn at once", () => {
        const sigil = new Sigil(new Element());
        const { element } = sigil;

        sigil.show(whole, 0);
        assert.ok(element.classes.has("whole"));
        sigil.end("faded", 15000);
        sigil.show(null, 15000);
        assert.equal(element.hidden, false);
        assert.ok(element.classes.has("faded") && !element.classes.has("whole"));
        assert.equal(element.attributes.get("aria-label"), "The Prismatic sigil fades, its power unspent.");
        assert.ok(SIGIL_ENDS.faded.ms > SIGIL_ENDS.broken.ms);

        sigil.show(climbing, 15500);
        assert.equal(element.hidden, false);
        assert.ok(!element.classes.has("faded") && !element.classes.has("ending"));
        assert.match(element.attributes.get("aria-label"), /fire chain at spell 3/);
    });

    it("is gone at once when spent, and shows nothing going with no chain drawn", () => {
        const sigil = new Sigil(new Element());
        const { element } = sigil;

        sigil.end("broken", 0);
        assert.equal(element.hidden, true, "never drawn");

        sigil.show(climbing, 0);
        sigil.show(null, 500);
        assert.equal(element.hidden, true);
        assert.ok(!element.classes.has("ending"));
    });

    it("flares in the piece's colour, or white made whole, begun again each time", () => {
        const sigil = new Sigil(new Element());
        const { element } = sigil;

        sigil.show(climbing, 0);
        sigil.flare("water");
        assert.ok(element.classes.has("flare"));
        assert.equal(element.style.getPropertyValue("--flare"), SIGIL_COLOURS.water);
        sigil.flare("whole");
        assert.equal(element.style.getPropertyValue("--flare"), "#ffffff");

        // (Going, a flare's put out)
        sigil.end("broken", 0);
        assert.ok(!element.classes.has("flare"));
    });

    it("takes as long to go as styles.css's breaking and fading take", () => {
        const css = readFileSync(new URL("../client/styles.css", import.meta.url), "utf8");

        for (const how of Object.keys(SIGIL_ENDS)) {
            const seconds = Number(css.match(new RegExp(`\\.sigil\\.${how} \\.sigil-emblem \\{\\s*animation: sigil-${how} ([\\d.]+)s`))?.[1]);

            assert.equal(seconds * 1000, SIGIL_ENDS[how].ms, how);
        }
    });
});
