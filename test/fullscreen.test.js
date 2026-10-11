// Full screen while playing (client/js/app/fullscreen.js): asked for as play starts or carries on
// from a tap, left back at the title or turned off, and the player leaving it pausing the game
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FullScreen } from "../client/js/app/fullscreen.js";

// A page that grants full screen as a browser does (or Safari's prefixed way, or not at all), and
// says so when it changes; and whether a tap's just been made
function page({ enabled = true, prefixed = false, refuses = false } = {}) {
    const listeners = {};
    const doc = {
        asked: 0,
        options: null,
        documentElement: {},
        addEventListener: (type, listener) => (listeners[type] ??= []).push(listener),
        change(element) {
            doc[prefixed ? "webkitFullscreenElement" : "fullscreenElement"] = element;

            for (const listener of listeners[prefixed ? "webkitfullscreenchange" : "fullscreenchange"] ?? []) {
                listener();
            }
        },
    };
    const request = (options) => {
        doc.asked++;
        doc.options = options;

        if (refuses) {
            return Promise.reject(new Error("Permissions check failed"));
        }

        doc.change(doc.documentElement);

        return prefixed ? undefined : Promise.resolve();
    };
    const exit = () => {
        doc.change(null);

        return prefixed ? undefined : Promise.resolve();
    };

    if (prefixed) {
        Object.assign(doc, { webkitFullscreenEnabled: enabled, webkitFullscreenElement: null, webkitExitFullscreen: exit });
        doc.documentElement.webkitRequestFullscreen = request;
    } else {
        Object.assign(doc, { fullscreenEnabled: enabled, fullscreenElement: null, exitFullscreen: exit });
        doc.documentElement.requestFullscreen = request;
    }

    return { doc, nav: { userActivation: { isActive: true } } };
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("full screen while playing (fullscreen.js)", () => {
    it("is asked for as play starts and carries on, the navigation bar hidden; left back at the title", async () => {
        const { doc, nav } = page();
        let entered = 0;
        let left = 0;
        const fullScreen = new FullScreen({ doc, nav, onEntered: () => entered++, onLeft: () => left++ });

        assert.equal(fullScreen.available, true);
        fullScreen.play();
        await settled();
        assert.equal(fullScreen.on, true);
        assert.deepEqual(doc.options, { navigationUI: "hide" });
        assert.equal(entered, 1, "told it's granted (a phone locked to landscape)");

        // (Asked again only if it's been left)
        fullScreen.play();
        fullScreen.tapped();
        assert.equal(doc.asked, 1);

        fullScreen.stop();
        assert.equal(fullScreen.on, false);
        assert.equal(left, 0, "left by the game itself: nothing paused");

        // (At the title, a tap asks nothing)
        fullScreen.tapped();
        assert.equal(doc.asked, 1);
    });

    it("pauses the game when the player leaves it playing, and asks again as play carries on", async () => {
        const { doc, nav } = page();
        let left = 0;
        const fullScreen = new FullScreen({ doc, nav, onLeft: () => left++ });

        fullScreen.play();
        await settled();
        doc.change(null);
        assert.equal(left, 1, "Escape, the browser's button, Android's back: paused");

        // (Resume, or a tap on the game after Resume by Escape)
        fullScreen.play();
        assert.equal(fullScreen.on, true);
        await settled();
        doc.change(null);
        fullScreen.tapped();
        assert.equal(fullScreen.on, true);
        assert.equal(doc.asked, 3);
    });

    it("pauses only on full screen going from on to off, told more than once or not; and asks once while it's being granted", async () => {
        const { doc, nav } = page();
        let left = 0;
        const fullScreen = new FullScreen({ doc, nav, onLeft: () => left++ });

        fullScreen.play();
        doc.change(doc.documentElement);
        fullScreen.wanted = false;
        fullScreen.wanted = true;
        doc.change(null);
        assert.equal(left, 0, "left by the game, the change told twice: nothing paused");

        // (Asked from Resume's click and again from its tap: asked once, till it's answered)
        const slow = page();
        let grant;

        slow.doc.documentElement.requestFullscreen = () => {
            slow.doc.asked++;

            return new Promise((resolve) => (grant = resolve));
        };

        const asking = new FullScreen({ doc: slow.doc, nav: slow.nav });

        asking.play();
        asking.tapped();
        assert.equal(slow.doc.asked, 1);
        slow.doc.change(slow.doc.documentElement);
        grant();
        await settled();
        slow.doc.change(null);
        asking.tapped();
        assert.equal(slow.doc.asked, 2, "answered, asked again once it's left");
    });

    it("turned off, is left at once and not asked for; turned on, asked for on the next tap playing", async () => {
        const { doc, nav } = page();
        let left = 0;
        const fullScreen = new FullScreen({ doc, nav, onLeft: () => left++ });

        fullScreen.play();
        await settled();
        fullScreen.wanted = false;
        assert.equal(fullScreen.on, false);
        assert.equal(left, 0, "left by the setting: nothing paused");
        fullScreen.play();
        fullScreen.tapped();
        assert.equal(doc.asked, 1);

        fullScreen.wanted = true;
        assert.equal(fullScreen.on, false, "not asked for from the menu");
        fullScreen.tapped();
        assert.equal(fullScreen.on, true);

        // (Off from the start)
        const other = page();
        const off = new FullScreen({ doc: other.doc, nav: other.nav, wanted: false });

        off.play();
        assert.equal(other.doc.asked, 0);
    });

    it("asks only straight after a tap, click or key, and takes no for an answer", async () => {
        const { doc, nav } = page({ refuses: true });
        let entered = 0;
        const fullScreen = new FullScreen({ doc, nav, onEntered: () => entered++ });

        nav.userActivation.isActive = false;
        fullScreen.play();
        assert.equal(doc.asked, 0, "play started with no tap (?play, a world joined): not asked, so not refused in the console");

        nav.userActivation.isActive = true;
        fullScreen.tapped();
        await settled();
        assert.equal(doc.asked, 1);
        assert.equal(fullScreen.on, false);
        assert.equal(entered, 0);

        // (A browser that can't tell whether a tap's just been made: asked)
        const bare = page();
        const asked = new FullScreen({ doc: bare.doc, nav: {} });

        asked.play();
        assert.equal(asked.on, true);
    });

    it("goes full screen Safari's prefixed way, and not at all where the page may not", async () => {
        const safari = page({ prefixed: true });
        let left = 0;
        let entered = 0;
        const fullScreen = new FullScreen({ doc: safari.doc, nav: safari.nav, onLeft: () => left++, onEntered: () => entered++ });

        assert.equal(fullScreen.available, true);
        fullScreen.play();
        assert.equal(fullScreen.on, true);
        assert.equal(entered, 1, "told it's granted as it changes, there being no answer to wait on");
        await settled();
        safari.doc.change(null);
        assert.equal(left, 1);
        fullScreen.play();
        await settled();
        fullScreen.stop();
        assert.equal(fullScreen.on, false);
        assert.equal(left, 1);

        // (An iPhone, or a page framed without leave: no switch, nothing asked)
        const iphone = page({ enabled: false });
        const none = new FullScreen({ doc: iphone.doc, nav: iphone.nav });

        assert.equal(none.available, false);
        none.play();
        assert.equal(iphone.doc.asked, 0);
        assert.equal(new FullScreen({ doc: undefined }).available, false, "no page at all (Node)");
    });
});
