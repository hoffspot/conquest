// Suggesting the game be added to the Home Screen on an iPhone or iPad (app/homescreen.js): only
// there, only in a browser tab, and not while it's put off
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HOME_SCREEN, putOff, suggestHomeScreen } from "../client/js/app/homescreen.js";
import { SETTINGS_DEFAULTS } from "../client/js/app/save.js";

const NOW = Date.UTC(2026, 10, 3, 18);
const PHONE = { ios: true, touch: true, installed: false, now: NOW };

describe("the Home Screen suggestion (app/homescreen.js)", () => {
    it("is made on an iPhone or iPad in a browser tab, at once to start with", () => {
        assert.equal(SETTINGS_DEFAULTS.homeScreenAfter, 0);
        assert.equal(suggestHomeScreen({ ...PHONE, after: SETTINGS_DEFAULTS.homeScreenAfter }), true);
    });

    it("isn't made played from the Home Screen, on a computer, or on a Mac with no touch screen", () => {
        assert.equal(suggestHomeScreen({ ...PHONE, installed: true }), false);
        assert.equal(suggestHomeScreen({ ...PHONE, ios: false }), false);
        assert.equal(suggestHomeScreen({ ...PHONE, touch: false }), false);
    });

    it("is put off three days by Not now, and for good by Don't show again", () => {
        const later = putOff("later", NOW);

        assert.equal(later - NOW, HOME_SCREEN.later);
        assert.equal(HOME_SCREEN.later, 3 * 24 * 60 * 60 * 1000);
        assert.equal(suggestHomeScreen({ ...PHONE, after: later, now: NOW + HOME_SCREEN.later - 1 }), false);
        assert.equal(suggestHomeScreen({ ...PHONE, after: later, now: later }), true);

        const never = putOff("never", NOW);

        assert.equal(never, Number.MAX_SAFE_INTEGER);
        assert.equal(suggestHomeScreen({ ...PHONE, after: never, now: NOW + 100 * 365 * HOME_SCREEN.later }), false);
        assert.equal(JSON.parse(JSON.stringify({ never })).never, never, "(kept as it is in the settings)");
    });
});
