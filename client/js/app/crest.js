// The crest over the loading screen and the title (docs/GAME.md *The crest*): the owner's painting
// (scripts/crest/, cut out of its magenta by scripts/build-crest.js) with PELLAGOS on its ribbon in
// Cinzel Decorative (client/fonts), at the top of the screen, each's card under it. As the page
// opens, once its lettering's to hand, the name's forged on it a letter at a time, each struck
// white-hot and cooling to gold; a moment after, a shine runs across it once, left to right;
// torchlight flickers on the leather behind it; and the eyes in the dark furrows under the town
// blink every 5 to 8 seconds, now and then twice. Its letters, not their line, in the ribbon's
// middle, whatever they're drawn in. Nothing moves with reduced motion asked for. The same crest
// over both, where it was (styles.css #crest), not forged again; never seen, nor anything of it
// moving, anywhere else (main.js show).

/** Where it is (from the page): crest.avif and crest.webp. */
export const CREST_FOLDER = "images/crest";

/**
 * Its lettering (SIL Open Font License, its licence beside it: styles.css @font-face, the same):
 * the family, the weight it's drawn at, and its file (from the page), as it was made, unchanged.
 */
export const CREST_FONT = Object.freeze({ family: "Cinzel Decorative", weight: 700, file: "fonts/CinzelDecorative-Bold.ttf" });

/**
 * - `size`: the picture's (pixels; scripts/build-crest.js makes it at its master's).
 * - `ribbon`: its leather band, the gold along its edges too, the name set across it (a share of
 *   its width or height: styles.css .crest-name, the same); `leather`, the band between its gold
 *   edges (shares of its height), the name's letters within it, a little of it above and below.
 * - `eyes`: where its eyes are, in the dark under the town ([across, down], shares: styles.css
 *   .crest-eye and .crest-lid).
 * - `forge`: as it's first shown, how long it waits for its lettering at most (s: forged in what
 *   it has, if that's slow), how long till its first letter's struck (s), how long after each the
 *   next is (s), and how long each takes to cool (s: styles.css crest-heat).
 * - `shine`: how long after it's forged a shine runs across the name, and how long it takes (s:
 *   styles.css crest-shine).
 * - `blink`: how long between its eyes' blinks (s, from and to), how often it's twice, and how
 *   long one takes (s).
 */
export const CREST = Object.freeze({
    size: Object.freeze([1376, 768]),
    ribbon: Object.freeze({ left: 0.127, right: 0.872, top: 0.414, bottom: 0.579 }),
    leather: Object.freeze({ top: 0.426, bottom: 0.569 }),
    eyes: Object.freeze([Object.freeze([0.469, 0.638]), Object.freeze([0.531, 0.638])]),
    forge: Object.freeze({ wait: 2, delay: 0.4, each: 0.12, cool: 1.4 }),
    shine: Object.freeze({ after: 1, length: 1.6 }),
    blink: Object.freeze({ from: 5, to: 8, twice: 0.2, length: 0.24 }),
});

// The screens it's over (main.js show)
const OVER = new Set(["loading", "title"]);

// (A number between two, by `random`: 0 to 1)
const between = ([from, to], random) => from + (to - from) * random();

/**
 * How far down to move a name for its letters' ink to be in the middle of its box (em; up, if
 * less than 0): from where its baseline is (`baseline`, px down from the box's top), the box's
 * height (px), how far its ink goes above and below the baseline (`ascent`, `descent`, px: as
 * measureText has them) and its size (px). Fonts set their letters higher or lower in their line,
 * Palatino on an iPhone well above its middle.
 */
export function levelOf({ baseline, height, ascent, descent, size }) {
    return size > 0 ? (height / 2 - (baseline + (descent - ascent) / 2)) / size : 0;
}

export class Crest {
    /**
     * @param {HTMLElement} element - The crest (index.html #crest): its picture, the name (`.wordmark`), the eyes' glow and lids.
     * @param {object} [options]
     * @param {Window} [options.window] - Where it's shown: whether it's to keep still, its timers, its fonts.
     * @param {() => number} [options.random] - When its eyes blink (0 to 1).
     */
    constructor(element, { window: view = globalThis, random = Math.random } = {}) {
        this.element = element;
        this.window = view;
        this.random = random;
        this.still = view.matchMedia?.("(prefers-reduced-motion: reduce)") ?? null;
        this.letters = [];

        /** Whether it's shown, and its eyes' next blink. */
        this.on = false;
        this.blinking = null;

        this.#lettered();

        // (Its lettering asked for, its name set level once it's here; forged as the page opens,
        // once it is or it's been waited for long enough: its letters never seen before they're
        // struck)
        const lettering = view.document?.fonts?.load?.(`${CREST_FONT.weight} 1em "${CREST_FONT.family}"`)?.catch(() => null) ?? Promise.resolve();
        const waited = new Promise((done) => view.setTimeout?.(done, CREST.forge.wait * 1000));

        lettering.then(() => this.level());

        if (this.still?.matches) {
            this.element.dataset.forged = "true";
        } else {
            this.element.classList.add("waiting");
            Promise.race([lettering, waited]).then(() => this.#forge());
        }
    }

    /** The screen shown now (main.js show): over the loading screen and the title, moving; nothing of it moving anywhere else (where it's not seen: styles.css). */
    screen(id) {
        if (OVER.has(id)) {
            this.#start();
        } else {
            this.#stop();
        }
    }

    /** Its eyes blink (once, or `twice`), as they do every so often. */
    blink({ twice = false } = {}) {
        const lids = [...this.element.querySelectorAll(".crest-lid, .crest-eye")];
        const ms = CREST.blink.length * 1000;

        for (const lid of lids) {
            const shut = lid.classList.contains("crest-lid") ? [{ transform: "scaleY(0)" }, { transform: "scaleY(1)", offset: 0.35 }, { transform: "scaleY(1)", offset: 0.6 }, { transform: "scaleY(0)" }] : [{ opacity: 1 }, { opacity: 0, offset: 0.3 }, { opacity: 0, offset: 0.65 }, { opacity: 1 }];

            lid.animate?.(shut, { duration: ms, iterations: twice ? 2 : 1, easing: "ease-in-out" });
        }
    }

    /**
     * Its name moved for its letters' ink to be in the middle of its line, so of the ribbon
     * (styles.css --level, in em: whatever size it's drawn at), as drawn in the lettering it's in
     * now (levelOf). Not while it isn't laid out (in a screen not shown).
     */
    level() {
        const name = this.element.querySelector?.(".wordmark:not([aria-hidden])");
        const page = this.element.ownerDocument;
        const context = page?.createElement("canvas").getContext?.("2d");

        if (!name || !context) {
            return;
        }

        const style = this.window.getComputedStyle(name);
        const size = parseFloat(style.fontSize);
        const box = name.getBoundingClientRect();

        if (!(size > 0) || !(box.height > 0)) {
            return;
        }

        // (Where its baseline is: a mark with no height, sat on it)
        const mark = page.createElement("span");

        mark.style.cssText = "display: inline-block; width: 0; height: 0";
        name.append(mark);

        const baseline = mark.getBoundingClientRect().top - box.top;

        mark.remove();
        context.font = `${style.fontWeight} ${size}px ${style.fontFamily}`;

        const ink = context.measureText(name.textContent.toUpperCase());
        const level = levelOf({ baseline, height: box.height, ascent: ink.actualBoundingBoxAscent, descent: ink.actualBoundingBoxDescent, size });

        this.element.style.setProperty("--level", `${level.toFixed(3)}em`);
    }

    // The name a letter at a time (each its own, to be struck and cooled: styles.css .letter), read
    // as the name it is
    #lettered() {
        const name = this.element.querySelector(".wordmark:not([aria-hidden])");

        if (!name) {
            return;
        }

        const text = name.textContent.trim();

        name.setAttribute("aria-label", text);
        name.textContent = "";

        [...text].forEach((letter, i) => {
            const span = this.element.ownerDocument.createElement("span");

            span.className = "letter";
            span.dataset.letter = letter;
            span.style.setProperty("--i", i);
            span.textContent = letter;
            name.append(span);
            this.letters.push(span);
        });
    }

    // Shown: set level, as it's laid out now, and its eyes blinking from now (but with reduced
    // motion)
    #start() {
        if (this.on) {
            return;
        }

        this.on = true;
        this.level();

        if (!this.still?.matches) {
            this.#later();
        }
    }

    // Not shown: nothing of it moving
    #stop() {
        this.on = false;
        this.window.clearTimeout(this.blinking);
        this.blinking = null;
    }

    // Forged: each letter struck in turn (styles.css .forging); forged for good once the last has
    // cooled, and a moment after, the shine run across it (.shining)
    #forge() {
        const { delay, each, cool } = CREST.forge;

        this.element.classList.remove("waiting");
        this.element.classList.add("forging");
        this.window.setTimeout(() => {
            this.element.classList.remove("forging");
            this.element.dataset.forged = "true";
            this.window.setTimeout(() => this.element.classList.add("shining"), CREST.shine.after * 1000);
        }, (delay + this.letters.length * each + cool) * 1000);
    }

    // Its eyes' next blink, a while on; not while the page is hidden (put off till it's shown)
    #later() {
        const { from, to, twice } = CREST.blink;

        this.blinking = this.window.setTimeout(() => {
            if (!this.window.document?.hidden) {
                this.blink({ twice: this.random() < twice });
            }

            this.#later();
        }, between([from, to], this.random) * 1000);
    }
}
