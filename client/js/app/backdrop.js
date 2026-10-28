// The paintings behind the screens before the game (docs/GAME.md *The pictures behind them*): the
// loading screen and the title, with its menus. The market town at dusk first, then each of the
// others in turn, faded one into the next every BACKDROP.every seconds; each the way the screen's
// held, tall upright and wide on its side (or a computer's), a scene with only one shown only so.
// As small as they'll go (AVIF, or WebP where a browser can't show that: scripts/
// build-backdrops.js). The first is in the page itself (index.html), fetched as it's read, before
// the code; the others only as each is due. Never behind making a character (its 3D view) or the
// game: let go of as either begins, so neither the page nor the graphics card holds them while
// it's played, and the first made again back at the title.

/** Where they are (from the page), each `<scene>-tall` and `<scene>-wide`, .avif and .webp. */
export const BACKDROP_FOLDER = "images/backdrops";

/** The scenes, the first shown first, and which ways each is painted (`tall`, `wide`). */
export const BACKDROPS = Object.freeze([
    Object.freeze({ scene: "town-dusk", tall: true, wide: true }),
    Object.freeze({ scene: "elf-grove", tall: true, wide: true }),
    Object.freeze({ scene: "cat-folk-city", tall: true, wide: true }),
    Object.freeze({ scene: "raid-night", tall: true, wide: false }),
    Object.freeze({ scene: "six-peoples", tall: false, wide: true }),
    Object.freeze({ scene: "lizard-lagoon", tall: false, wide: true }),
]);

/**
 * How long each is shown (s), how long one fades into the next (s: styles.css #backdrop), and the
 * longest side each's made at (px: scripts/build-backdrops.js; a master at 2K is made smaller).
 */
export const BACKDROP = Object.freeze({ every: 20, fade: 2, most: 2560 });

/**
 * How each drifts while it's shown, one after another: from and to [how big, how far across, how
 * far down] (a share of the screen, as it's grown): in towards the town at its foot, out again,
 * across one way and back the other. Never further than how big it is leaves room for, so it
 * always covers the page; eased in and out over its turn and the fades either side.
 */
export const DRIFTS = Object.freeze([
    Object.freeze({ from: [1, 0, 0], to: [1.1, 0, -0.04] }),
    Object.freeze({ from: [1.1, 0.03, -0.02], to: [1, 0, 0] }),
    Object.freeze({ from: [1.08, -0.03, 0], to: [1.08, 0.03, -0.01] }),
    Object.freeze({ from: [1.08, 0.03, -0.02], to: [1.08, -0.03, 0.01] }),
]);

// The screens they're behind (main.js show)
const BEHIND = new Set(["loading", "title"]);

// How a screen held upright is told (so a tall one's shown)
const UPRIGHT = "(orientation: portrait)";

/**
 * A scene's picture: its AVIF and WebP, tall and wide as it's painted (the browser picks: AVIF
 * where it shows it, the tall one on a screen held upright where there are both).
 */
export function backdropPicture({ scene, tall, wide }, document = globalThis.document) {
    const picture = document.createElement("picture");
    const ways = [tall && ["tall", wide ? UPRIGHT : null], wide && ["wide", null]].filter(Boolean);
    const [last] = ways.slice(-1);

    for (const [way, media] of ways) {
        for (const type of ["avif", "webp"]) {
            if (way === last[0] && type === "webp") {
                continue;
            }

            const source = Object.assign(document.createElement("source"), { type: `image/${type}`, srcset: `${BACKDROP_FOLDER}/${scene}-${way}.${type}` });

            if (media) {
                source.media = media;
            }

            picture.append(source);
        }
    }

    const img = Object.assign(document.createElement("img"), { src: `${BACKDROP_FOLDER}/${scene}-${last[0]}.webp`, alt: "", decoding: "async" });

    img.dataset.scene = scene;
    picture.append(img);

    return picture;
}

export class Backdrop {
    /**
     * @param {HTMLElement} element - What they're drawn in (index.html #backdrop), its first scene's picture in it from the start.
     * @param {object} [options]
     * @param {Window} [options.window] - Where it's shown: how the screen's held, whether it's to keep still, its timers.
     */
    constructor(element, { window: view = globalThis } = {}) {
        this.element = element;
        this.window = view;
        this.upright = view.matchMedia?.(UPRIGHT) ?? null;
        this.still = view.matchMedia?.("(prefers-reduced-motion: reduce)") ?? null;

        /** Whether it's shown (behind the loading screen or the title), which scene's shown, the next one's turn, and how many have drifted (DRIFTS). */
        this.on = true;
        this.at = 0;
        this.timer = null;
        this.drifted = 0;

        // (Turned the other way: a scene painted only the other way gives way to the next)
        this.upright?.addEventListener?.("change", () => {
            if (this.on && !this.#fits(BACKDROPS[this.at])) {
                this.next();
            }
        });

        // (The first, in the page from the start: shown once it's in)
        const first = element.querySelector("picture");

        if (first) {
            this.#show(first);
        }

        this.#later();
    }

    /** The screen shown now (main.js show): behind the loading screen and the title, and let go of anywhere else. */
    screen(id) {
        if (BEHIND.has(id)) {
            this.#start();
        } else {
            this.#stop();
        }
    }

    /** The next scene that fits the way the screen's held, faded in over this one. */
    next() {
        this.window.clearTimeout(this.timer);
        this.timer = null;

        if (!this.on) {
            return;
        }

        for (let k = 1; k <= BACKDROPS.length; k++) {
            const at = (this.at + k) % BACKDROPS.length;

            if (this.#fits(BACKDROPS[at])) {
                this.at = at;
                break;
            }
        }

        this.#show(backdropPicture(BACKDROPS[this.at], this.element.ownerDocument));
        this.#later();
    }

    // Whether a scene's painted the way the screen's held
    #fits({ tall, wide }) {
        return (this.upright?.matches ?? false) ? tall : wide;
    }

    // Shown again (from the first), back at the title
    #start() {
        if (this.on) {
            return;
        }

        this.on = true;
        this.at = BACKDROPS.findIndex((each) => this.#fits(each));
        this.#show(backdropPicture(BACKDROPS[this.at], this.element.ownerDocument));
        this.#later();
    }

    // Let go of: every picture out of the page (and so off the graphics card), none to come
    #stop() {
        this.on = false;
        this.window.clearTimeout(this.timer);
        this.timer = null;

        for (const picture of [...this.element.querySelectorAll("picture")]) {
            this.#forget(picture);
        }
    }

    // A picture put in over the one shown, and faded in once it's in (as WebP, if a browser that
    // says it shows AVIF can't show this one), the one under it let go of once it's faded out;
    // one that can't be shown at all let go of, the one under it kept
    #show(picture) {
        const img = picture.querySelector("img");
        const under = [...this.element.querySelectorAll("picture")].filter((each) => each !== picture);
        const shown = () => {
            if (!picture.isConnected) {
                return;
            }

            img.classList.add("shown");
            this.#drift(img);
            this.window.setTimeout(() => under.forEach((each) => this.#forget(each)), BACKDROP.fade * 1000);
        };

        img.addEventListener("error", () => {
            const avif = [...picture.querySelectorAll('source[type="image/avif"]')];

            if (avif.length) {
                avif.forEach((source) => source.remove());
            } else {
                this.#forget(picture);
            }
        });

        if (!picture.isConnected) {
            this.element.append(picture);
        }

        if (img.complete && img.naturalWidth) {
            shown();
        } else {
            img.addEventListener("load", () => img.decode().catch(() => {}).then(shown), { once: true });
        }
    }

    // A picture drifting slowly as it's shown (the next of DRIFTS), from as it fades in to as it's
    // faded out, on the graphics card (an animation of its transform, as the browser plays it: the
    // page's thread, busy loading, is left alone); not while it's to keep still
    #drift(img) {
        if (this.still?.matches || !img.animate) {
            return;
        }

        const { from, to } = DRIFTS[this.drifted++ % DRIFTS.length];
        const transform = ([scale, x, y]) => `scale(${scale}) translate(${x * 100}%, ${y * 100}%)`;

        img.animate([{ transform: transform(from) }, { transform: transform(to) }], { duration: (BACKDROP.every + BACKDROP.fade * 2) * 1000, easing: "ease-in-out", fill: "forwards" });
    }

    // A picture let go of: out of the page, its image with it
    #forget(picture) {
        for (const source of picture.querySelectorAll("source")) {
            source.removeAttribute("srcset");
        }

        picture.querySelector("img")?.removeAttribute("src");
        picture.remove();
    }

    // The next one's turn, BACKDROP.every seconds on; not while it's to keep still (the first
    // stays), and not while the page is hidden (its turn when it's shown again)
    #later() {
        if (!this.on || this.still?.matches) {
            return;
        }

        this.timer = this.window.setTimeout(() => (this.window.document?.hidden ? this.#later() : this.next()), BACKDROP.every * 1000);
    }
}
