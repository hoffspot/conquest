// The mouse pointer: a little sword, so it's easy to find on a big screen full of grass, and
// showing what a click there would do (an enemy, someone to talk to, a door, something to pick up:
// game.js #aimAt). Shaken (back and forth, quickly), its blade glows and it grows half again for a
// moment, as an operating system's shake to find does. Only with a mouse (CSS: hover and a fine
// pointer), everywhere on the page but where you type, and turned off in Game options for the
// system's own pointer (Controls: Sword pointer, and Large pointer).
//
// The pointers are drawn by scripts/build-pointers.js (npm run build:pointers) into
// images/pointer/, each at 1x and 2x for sharp screens. They're the system's pointer, set by CSS,
// never drawn by the game, so they never trail the mouse. The game says what it's over (`aim`);
// the CSS (styles.css, "The sword pointer") takes the values set here.

// What the pointer shows over the view: the sword over the ground, its blade red-lit over an
// enemy, a speech bubble over someone to talk to (or a player to trade with), an arch over a door,
// the stairs or a portal, and a hand over something to pick up or search (or the war table)
export const AIMS = Object.freeze(["sword", "attack", "talk", "enter", "hand"]);

// Its sizes (CSS pixels): normal or large (Game options), still and shaken. Each is drawn twice as
// big too, for a sharp screen, and no bigger than browsers take (128 pixels)
export const POINTER_SIZES = Object.freeze({ normal: Object.freeze({ still: 32, shaken: 48 }), large: Object.freeze({ still: 44, shaken: 64 }) });

// Where it points, its hotspot: the sword's tip, this share of the way in from the top left
export const TIP = 2 / 32;

// A shake: at least `turns` reversals of the way it's going within `window` ms, each after at least
// `least` pixels of going one way, and `travel` pixels gone in all in that time; once shaken it
// stays lit `lit` ms after the last of it (a glance is enough to find it, the operating systems'
// shake to find does the same)
export const SHAKE = Object.freeze({ window: 700, turns: 4, least: 30, travel: 500, lit: 1500 });

/** The file of a pointer: its look (AIMS, or "shaken"), its size (pixels) and scale (1 or 2). */
export const pointerFile = (look, size, scale = 1) => `images/pointer/${look}-${size}${scale === 2 ? "@2x" : ""}.png`;

/**
 * The CSS cursor value for a pointer: its look, size and the images' base address; with an
 * image-set of both scales where the browser takes one (`sets`), or the 1x alone, falling back to
 * the system's own.
 */
export function pointerValue(look, size, { base = "", sets = true } = {}) {
    const at = Math.round(size * TIP);
    const url = (scale) => `url("${base}${pointerFile(look, size, scale)}")`;
    const image = sets ? `image-set(${url(1)} 1x, ${url(2)} 2x)` : url(1);

    return `${image} ${at} ${at}, auto`;
}

/**
 * Tells a shaken mouse from one only moving: fed each move (`feed`), it says whether the pointer
 * should be lit now. Reversals are counted along the way it's going, so a shake any way counts,
 * and a long sweep, however fast, doesn't.
 */
export class ShakeDetector {
    #last = null;
    #way = null;
    #run = 0;
    #turns = [];
    #moves = [];
    #litUntil = -Infinity;

    /** A move to (x, y), `ms` its time; whether the pointer's lit (shaken lately). */
    feed(x, y, ms) {
        if (this.#last) {
            const [dx, dy] = [x - this.#last.x, y - this.#last.y];
            const far = Math.hypot(dx, dy);

            if (far > 0) {
                const way = [dx / far, dy / far];

                // (Turned back: more than a right angle from the way it was going)
                if (this.#way && way[0] * this.#way[0] + way[1] * this.#way[1] < 0) {
                    if (this.#run >= SHAKE.least) {
                        this.#turns.push(ms);
                    }

                    this.#run = 0;
                }

                this.#way = way;
                this.#run += far;
                this.#moves.push([ms, far]);
            }
        }

        this.#last = { x, y };

        while (this.#turns.length && this.#turns[0] < ms - SHAKE.window) {
            this.#turns.shift();
        }

        while (this.#moves.length && this.#moves[0][0] < ms - SHAKE.window) {
            this.#moves.shift();
        }

        const travel = this.#moves.reduce((sum, [, far]) => sum + far, 0);

        if (this.#turns.length >= SHAKE.turns && travel >= SHAKE.travel) {
            this.#litUntil = ms + SHAKE.lit;
        }

        return this.lit(ms);
    }

    /** Whether it's lit at `ms`. */
    lit(ms) {
        return ms < this.#litUntil;
    }

    /** When it goes out (ms; -Infinity, never lit). */
    get until() {
        return this.#litUntil;
    }

    /** Forget the moves so far (the mouse gone off the page, or a button held: dragging). */
    reset() {
        this.#last = null;
        this.#way = null;
        this.#run = 0;
        this.#turns = [];
        this.#moves = [];
    }
}

/**
 * The pointer on the page: the root's `data-pointer` turns the CSS on, and `--pointer` (the page)
 * and `--pointer-view` (the game's view, what it's over) say which. Shaken, both are the lit sword.
 */
export class Pointer {
    #root;
    #detector = new ShakeDetector();
    #aim = "sword";
    #shaken = false;
    #timer = 0;
    #listeners = [];
    #sets = true;
    #base = "";
    #shown = null;

    /**
     * @param {object} [how]
     * @param {HTMLElement} [how.root] - Where it's set (the page's root element).
     */
    constructor({ root = document.documentElement } = {}) {
        this.#root = root;
        this.#base = new URL(".", document.baseURI).href;
        // (Browsers that take an image-set for a pointer get both scales; others, the 1x)
        this.#sets = globalThis.CSS?.supports?.("cursor", pointerValue("sword", 32, { base: this.#base })) ?? false;

        /** Whether it's the sword at all (Game options: Sword pointer), and large (Large pointer). */
        this.on = true;
        this.large = false;
    }

    /** Start listening to the mouse. */
    start() {
        const moved = (event) => this.#moved(event);
        const gone = () => this.#detector.reset();

        for (const [target, type, listener] of [[window, "pointermove", moved], [document, "pointerleave", gone], [window, "blur", gone]]) {
            target.addEventListener(type, listener);
            this.#listeners.push([target, type, listener]);
        }

        this.show();

        return this;
    }

    /** Stop listening, and give the page back the system's pointer. */
    dispose() {
        for (const [target, type, listener] of this.#listeners) {
            target.removeEventListener(type, listener);
        }

        this.#listeners = [];
        clearTimeout(this.#timer);
        delete this.#root.dataset.pointer;
        this.#shown = null;
    }

    /** What a click on the game's view would do where the mouse is (AIMS; null: the sword). */
    aim(look) {
        const aim = AIMS.includes(look) ? look : "sword";

        if (aim !== this.#aim) {
            this.#aim = aim;
            this.show();
        }
    }

    /** Whether it's lit now (shaken lately). */
    get shaken() {
        return this.#shaken;
    }

    /** Put on the page what it should show now (and again once a setting changes). */
    show() {
        const sizes = POINTER_SIZES[this.large ? "large" : "normal"];
        const shown = this.on ? `${sizes.still} ${this.#shaken} ${this.#aim}` : null;

        if (shown === this.#shown) {
            return;
        }

        this.#shown = shown;

        if (!this.on) {
            delete this.#root.dataset.pointer;

            return;
        }

        const value = (look) => (this.#shaken ? pointerValue("shaken", sizes.shaken, { base: this.#base, sets: this.#sets }) : pointerValue(look, sizes.still, { base: this.#base, sets: this.#sets }));

        this.#root.style.setProperty("--pointer", value("sword"));
        this.#root.style.setProperty("--pointer-view", value(this.#aim));
        this.#root.dataset.pointer = this.#shaken ? "shaken" : this.#aim;
    }

    #moved(event) {
        if (event.pointerType !== "mouse" || !this.on) {
            return;
        }

        // (A button held is dragging, the camera or a window, not shaking it to find it)
        if (event.buttons) {
            this.#detector.reset();

            return;
        }

        const before = this.#detector.until;

        // (Every point the mouse went through, not only the last of each frame's: the browser
        // gathers a frame's moves into one, and a slow frame would hide the turns of a shake)
        const moves = event.getCoalescedEvents?.() ?? [];

        for (const move of moves.length ? moves : [event]) {
            this.#detector.feed(move.clientX, move.clientY, move.timeStamp);
        }

        // Shaken (again): lit, and put out a while after the last of the shaking, not of the
        // moving on after it
        if (this.#detector.until > before) {
            if (!this.#shaken) {
                this.#shaken = true;
                this.show();
            }

            clearTimeout(this.#timer);
            this.#timer = setTimeout(() => {
                this.#shaken = false;
                this.show();
            }, this.#detector.until - event.timeStamp);
        }
    }
}
