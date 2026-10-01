// How often the world's drawn. The browser asks for a frame each time the screen refreshes: 60
// times a second on most, but 90, 120 or 144 on many phones and monitors. A quality level may draw
// no oftener than its own rate (QUALITY.frameRate, world/view.js): 60, the game's target, however
// fast the screen, rather than twice the work, twice the heat and a phone that slows
// itself down to cool. The frames drawn keep to the screen's beat: every other one at 120 for 60,
// every one at 90 (which has no even 60: never fewer frames than the rate asks for, rather than
// uneven ones), and every one whenever drawing takes longer than the rate allows.

// A frame's drawn if it's come within this share of the screen's refresh of when one's due
const WITHIN = 0.6;

// The screen's refresh is the shortest time between the browser's asking, over this many askings
// (so it follows a phone's screen changing its rate)
const HEARD = 30;

export class Pacing {
    #gaps = new Float64Array(HEARD).fill(Infinity);
    #index = 0;
    #asked = -Infinity;
    #drawn = -Infinity;

    /** How long the screen shows each frame for (ms), as far as it's been seen; Infinity till it has. */
    get refresh() {
        let least = Infinity;

        for (const gap of this.#gaps) {
            least = Math.min(least, gap);
        }

        return least;
    }

    /**
     * The browser asking for a frame at `now` (ms, its time for the frame): should the world be
     * drawn, at no more than `rate` frames a second (0 or none: every time it's asked)?
     */
    due(now, rate) {
        this.#gaps[this.#index] = now - this.#asked;
        this.#index = (this.#index + 1) % HEARD;
        this.#asked = now;

        if (rate > 0 && now - this.#drawn < 1000 / rate - WITHIN * this.refresh) {
            return false;
        }

        this.#drawn = now;

        return true;
    }
}
