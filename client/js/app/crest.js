// The crest over the loading screen and the title (docs/GAME.md *The crest*): the owner's painting
// (scripts/crest/, cut out of its magenta by scripts/build-crest.js) with PELLAGOS on its ribbon,
// at the top of the screen, each's card under it. As the page opens the name's forged on it, a
// letter at a time, each struck white-hot with a burst of sparks and cooling to gold; then
// torchlight glints along it now and then, and flickers on the leather behind it; embers rise off
// it; and once in a while the eyes in the dark furrows under the town blink, now and then twice.
// Nothing moves with reduced motion asked for. The same crest over both, where it was (styles.css
// #crest), not forged again; never seen, nor anything of it moving, anywhere else (main.js show).

/** Where it is (from the page): crest.avif and crest.webp. */
export const CREST_FOLDER = "images/crest";

/**
 * - `size`: the picture's (pixels; scripts/build-crest.js makes it at its master's).
 * - `ribbon`: its blank leather band, the name set across it (a share of its width or height:
 *   styles.css .crest-name, the same).
 * - `eyes`: where its eyes are, in the dark under the town ([across, down], shares: styles.css
 *   .crest-eye and .crest-lid).
 * - `forge`: as it's first shown, how long till its first letter's struck (s), how long after
 *   each the next is (s), and how long each takes to cool (s: styles.css crest-heat).
 * - `blink`: how long between its eyes' blinks (s, from and to), how often it's twice, and how
 *   long one takes (s).
 * - `embers`: how many rise each second off the name, how many are about at most, how long each
 *   lasts (s, from and to), how fast it rises (a share of the crest's height a second, from and
 *   to); how many sparks each letter's strike throws off, and how fast (shares a second).
 */
export const CREST = Object.freeze({
    size: Object.freeze([1376, 768]),
    ribbon: Object.freeze({ left: 0.127, right: 0.872, top: 0.414, bottom: 0.579 }),
    eyes: Object.freeze([Object.freeze([0.469, 0.638]), Object.freeze([0.531, 0.638])]),
    forge: Object.freeze({ delay: 0.4, each: 0.12, cool: 1.4 }),
    blink: Object.freeze({ from: 15, to: 40, twice: 0.2, length: 0.24 }),
    embers: Object.freeze({ each: 3, most: 11, life: Object.freeze([1.4, 2.8]), rise: Object.freeze([0.18, 0.4]), sparks: 14, burst: 0.9 }),
});

// The screens it's over (main.js show)
const OVER = new Set(["loading", "title"]);

// (A number between two, by `random`: 0 to 1)
const between = ([from, to], random) => from + (to - from) * random();

/**
 * An ember risen off the name, or a spark thrown off a letter as it's struck (`spark`): where
 * (`x`, `y`: shares of the crest's width and height, down from its top), going how fast (shares
 * a second), how long it lasts (s), how big (a share of its width).
 */
export function emberAt(x, y, random = Math.random, { spark = false } = {}) {
    const angle = spark ? random() * Math.PI * 2 : 0;
    const speed = spark ? CREST.embers.burst * (0.4 + random() * 0.6) : 0;

    return {
        x,
        y,
        vx: spark ? Math.cos(angle) * speed * 0.6 : (random() - 0.5) * 0.04,
        vy: spark ? Math.sin(angle) * speed - 0.2 : -between(CREST.embers.rise, random),
        age: 0,
        life: spark ? 0.35 + random() * 0.35 : between(CREST.embers.life, random),
        size: spark ? 0.004 + random() * 0.003 : 0.004 + random() * 0.004,
        sway: random() * Math.PI * 2,
    };
}

/**
 * The embers and sparks `dt` seconds on: each going as it goes (a spark slowed, an ember
 * swaying as it rises), older; those that have lasted their time gone. Returns those left.
 */
export function stepEmbers(embers, dt) {
    const left = [];

    for (const ember of embers) {
        const drag = Math.exp(-3 * dt);

        ember.age += dt;
        ember.vx *= ember.life < 1 ? drag : 1;
        ember.x += (ember.vx + Math.sin(ember.sway + ember.age * 3) * 0.012) * dt;
        ember.y += ember.vy * dt;

        if (ember.age < ember.life) {
            left.push(ember);
        }
    }

    return left;
}

export class Crest {
    /**
     * @param {HTMLElement} element - The crest (index.html #crest): its picture, the name (`.wordmark`), the eyes' glow and lids, and its embers' canvas in it.
     * @param {object} [options]
     * @param {Window} [options.window] - Where it's shown: whether it's to keep still, its timers and frames.
     * @param {() => number} [options.random] - Where its embers rise from, when its eyes blink (0 to 1).
     */
    constructor(element, { window: view = globalThis, random = Math.random } = {}) {
        this.element = element;
        this.window = view;
        this.random = random;
        this.still = view.matchMedia?.("(prefers-reduced-motion: reduce)") ?? null;
        this.canvas = element.querySelector(".crest-embers");
        this.letters = [];

        /** Whether it's shown, its embers, its frame and when it was drawn, and its next blink. */
        this.on = false;
        this.embers = [];
        this.frame = null;
        this.drawn = null;
        this.owed = 0;
        this.blinking = null;

        this.#lettered();

        // (Forged as the page opens: its letters never seen before they're struck)
        if (this.still?.matches) {
            this.element.dataset.forged = "true";
        } else {
            this.#forge();
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

    /** Its eyes blink (once, or `twice`), as they do now and then. */
    blink({ twice = false } = {}) {
        const lids = [...this.element.querySelectorAll(".crest-lid, .crest-eye")];
        const ms = CREST.blink.length * 1000;

        for (const lid of lids) {
            const shut = lid.classList.contains("crest-lid") ? [{ transform: "scaleY(0)" }, { transform: "scaleY(1)", offset: 0.35 }, { transform: "scaleY(1)", offset: 0.6 }, { transform: "scaleY(0)" }] : [{ opacity: 1 }, { opacity: 0, offset: 0.3 }, { opacity: 0, offset: 0.65 }, { opacity: 1 }];

            lid.animate?.(shut, { duration: ms, iterations: twice ? 2 : 1, easing: "ease-in-out" });
        }
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

    // Shown: its embers rising and its eyes blinking from now (but with reduced motion)
    #start() {
        if (this.on) {
            return;
        }

        this.on = true;

        if (!this.still?.matches) {
            this.#later();
            this.drawn = null;
            this.frame = this.window.requestAnimationFrame?.((now) => this.#draw(now)) ?? null;
        }
    }

    // Not shown: nothing of it moving, its embers gone
    #stop() {
        this.on = false;
        this.window.clearTimeout(this.blinking);
        this.blinking = null;
        this.window.cancelAnimationFrame?.(this.frame);
        this.frame = null;
        this.embers = [];
        this.canvas?.getContext("2d")?.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    // Forged: each letter struck in turn (styles.css .forging), a burst of sparks off it as it is;
    // forged for good once the last has cooled
    #forge() {
        const { delay, each, cool } = CREST.forge;

        this.element.classList.add("forging");
        this.letters.forEach((letter, i) => {
            this.window.setTimeout(() => this.#burst(letter), (delay + i * each) * 1000);
        });
        this.window.setTimeout(() => {
            this.element.classList.remove("forging");
            this.element.dataset.forged = "true";
        }, (delay + this.letters.length * each + cool) * 1000);
    }

    // Sparks thrown off a letter as it's struck (drawn once it's shown)
    #burst(letter) {
        if (!this.canvas) {
            return;
        }

        const box = this.element.getBoundingClientRect();
        const at = letter.getBoundingClientRect();
        const [x, y] = [(at.left + at.width / 2 - box.left) / box.width, (at.top + at.height / 2 - box.top) / box.height];

        for (let k = 0; k < CREST.embers.sparks; k++) {
            this.embers.push(emberAt(x, y, this.random, { spark: true }));
        }
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

    // A frame of its embers: more risen off the name, each where it's got to, drawn glowing and
    // fading as it ages (on a canvas the crest's width and somewhat above it)
    #draw(now) {
        if (!this.on) {
            return;
        }

        this.frame = this.window.requestAnimationFrame((next) => this.#draw(next));

        const canvas = this.canvas;
        const dt = this.drawn === null ? 0 : Math.min(0.1, (now - this.drawn) / 1000);

        this.drawn = now;

        if (!canvas || this.window.document?.hidden) {
            return;
        }

        // (As many as rise in the time since, off the ribbon's top and the name, no more than the most)
        this.owed += dt * CREST.embers.each;

        const { left, right, top, bottom } = CREST.ribbon;

        while (this.owed >= 1) {
            this.owed -= 1;

            if (this.embers.length < CREST.embers.most) {
                this.embers.push(emberAt(left + 0.12 + (right - left - 0.24) * this.random(), top + (bottom - top) * this.random() * 0.6, this.random));
            }
        }

        this.embers = stepEmbers(this.embers, dt);

        // (Drawn at the screen's pixels, twice at most; the canvas a little above the crest too:
        // styles.css .crest-embers)
        const ratio = Math.min(2, this.window.devicePixelRatio ?? 1);
        const [width, height] = [Math.round(canvas.clientWidth * ratio), Math.round(canvas.clientHeight * ratio)];

        if (canvas.width !== width || canvas.height !== height) {
            [canvas.width, canvas.height] = [width, height];
        }

        const context = canvas.getContext("2d");
        const box = this.element.getBoundingClientRect();
        const offset = canvas.getBoundingClientRect().top - box.top;
        const scale = box.width * ratio;

        context.clearRect(0, 0, width, height);
        context.globalCompositeOperation = "lighter";

        for (const { x, y, age, life, size } of this.embers) {
            const fade = Math.max(0, 1 - age / life);
            const [px, py, r] = [x * scale, (y * box.height - offset) * ratio, size * scale];
            const heat = Math.min(1, age / life + 0.15);

            context.fillStyle = `rgba(255, ${Math.round(210 - heat * 120)}, ${Math.round(110 - heat * 90)}, ${0.18 * fade})`;
            context.beginPath();
            context.arc(px, py, r * 3, 0, Math.PI * 2);
            context.fill();
            context.fillStyle = `rgba(255, ${Math.round(235 - heat * 100)}, ${Math.round(170 - heat * 120)}, ${0.9 * fade})`;
            context.beginPath();
            context.arc(px, py, r, 0, Math.PI * 2);
            context.fill();
        }
    }
}
