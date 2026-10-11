// Full screen while playing (Game options, on to start with): asked for whenever play starts or
// carries on from a tap, click or key (Continue, a character chosen or made, joining a world,
// Resume, or a tap on the game while it isn't), and left when the game goes back to the title or
// the setting's turned off. Left any other way while playing (Escape, the browser's own button,
// Android's back, another app), the game pauses, as the menu button does, and Resume asks again.
//
// Browsers grant it only from a tap, click or key (not Escape), so it's only asked then; and only
// where the page may have it: not on an iPhone, where Safari keeps full screen for videos (a game
// added to the Home Screen runs without Safari's bars anyway), nor in a page framed without leave.

export class FullScreen {
    /**
     * @param {object} [options]
     * @param {Document} [options.doc] - The page (a stand-in, in the tests)
     * @param {Navigator} [options.nav] - Its navigator, for whether a tap's just been made
     * @param {boolean} [options.wanted] - The setting
     * @param {function} [options.onLeft] - Full screen left while playing, not by the game: pause
     * @param {function} [options.onEntered] - Full screen granted (on a phone, landscape locked)
     */
    constructor({ doc = globalThis.document, nav = globalThis.navigator, wanted = true, onLeft = () => {}, onEntered = () => {} } = {}) {
        this.doc = doc;
        this.nav = nav;
        this.onLeft = onLeft;
        this.onEntered = onEntered;
        // Whether a game's under way (from its start to going back to the title)
        this.playing = false;
        this.#wanted = wanted;

        for (const type of ["fullscreenchange", "webkitfullscreenchange"]) {
            doc?.addEventListener?.(type, () => this.#changed());
        }
    }

    #wanted;
    // Left by the game itself (back to the title, the setting off): not the player leaving it
    #leaving = false;
    // Asked for and not yet answered (not asked again meanwhile); and whether it was on when last
    // told of a change (only on to off is leaving it: a browser can tell of a change more than once)
    #asking = false;
    #was = false;

    /** Whether this browser lets the page go full screen. */
    get available() {
        const root = this.doc?.documentElement;

        return Boolean((this.doc?.fullscreenEnabled || this.doc?.webkitFullscreenEnabled) && (root?.requestFullscreen || root?.webkitRequestFullscreen));
    }

    /** Whether the page is full screen. */
    get on() {
        return Boolean(this.doc?.fullscreenElement ?? this.doc?.webkitFullscreenElement);
    }

    get wanted() {
        return this.#wanted;
    }

    /** The setting: turned off, full screen's left at once; turned on, it's asked for on the next tap playing. */
    set wanted(on) {
        this.#wanted = on;

        if (!on) {
            this.#leave();
        }
    }

    /** Play starting or carrying on, from a tap, click or key: full screen asked for. */
    play() {
        this.playing = true;
        this.#ask();
    }

    /** A tap, click or key on the game while it's playing (not paused): asked for, if it's been left. */
    tapped() {
        if (this.playing) {
            this.#ask();
        }
    }

    /** Back to the title: full screen left. */
    stop() {
        this.playing = false;
        this.#leave();
    }

    #ask() {
        // (Only straight after a tap, click or key: asked otherwise, the browser says no, and says
        // so in the console)
        if (!this.#wanted || !this.available || this.on || this.#asking || this.nav?.userActivation?.isActive === false) {
            return;
        }

        const root = this.doc.documentElement;

        this.#asking = true;

        try {
            const asked = root.requestFullscreen ? root.requestFullscreen({ navigationUI: "hide" }) : root.webkitRequestFullscreen();

            // (Not allowed here: the game plays as it is. Granted, it's told as the change comes,
            // Safari's prefixed way having no answer to wait on)
            Promise.resolve(asked)
                .catch(() => {})
                .finally(() => (this.#asking = false));
        } catch {
            // (An older Safari throwing, not refusing)
            this.#asking = false;
        }
    }

    #leave() {
        if (!this.on) {
            return;
        }

        this.#leaving = true;

        try {
            const left = this.doc.exitFullscreen ? this.doc.exitFullscreen() : this.doc.webkitExitFullscreen();

            Promise.resolve(left).catch(() => (this.#leaving = false));
        } catch {
            this.#leaving = false;
        }
    }

    #changed() {
        const was = this.#was;

        this.#was = this.on;

        if (this.on) {
            if (!was) {
                this.onEntered();
            }

            return;
        }

        if (!was) {
            return;
        }

        const ours = this.#leaving;

        this.#leaving = false;

        if (!ours && this.playing && this.#wanted) {
            this.onLeft();
        }
    }
}
