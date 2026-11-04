// The handhelds' presets (client/js/app/handhelds.js): what each sets (the back buttons' actions'
// keys, kept if they have one; the Legion Go's FPS mode, the mouse's buttons), each step to set
// the back buttons with the keys said in it, and which handheld it is, guessed from the controller's
// maker and product or the screen, a touch screen and a controller.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BACK_ACTIONS, backsSaid, guessHandheld, HANDHELD_TEXT, HANDHELDS, handheldOf, madeBy, presetOf, stepsOf } from "../client/js/app/handhelds.js";
import { keysOf, keyWords } from "../client/js/app/keys.js";

const words = (keys) => (action) => keyWords(keys[action][0]);

describe("a handheld's preset", () => {
    it("names a back button for each of its actions, four or two, and a dead zone, and its steps say how", () => {
        for (const one of HANDHELDS) {
            assert.ok(one.backs.length === 4 || one.backs.length === 2, one.id);
            assert.ok(one.deadZone >= 0.05 && one.deadZone <= 0.3, one.id);
            assert.ok(one.steps.some((step) => step.includes("{keys}")), one.id);
            assert.equal(handheldOf(one.id), one);
        }

        assert.equal(handheldOf("nonsense"), null);
        assert.deepEqual(BACK_ACTIONS, ["selfWheel", "theirWheel", "map", "journal"]);
    });

    it("keeps the back buttons' actions' keys as the player has them, giving one only to an action left without", () => {
        const keys = keysOf({ map: [null, null] });

        assert.deepEqual(presetOf("steamDeck", keys), { keys: [{ id: "map", slot: 0, key: "KeyM" }], deadZone: 0.15, textSize: HANDHELD_TEXT });
        assert.deepEqual(presetOf("rogAlly", keysOf()).keys, []);
        assert.equal(presetOf("msiClaw", keys).deadZone, 0.08);
        assert.equal(presetOf("nonsense", keys), null);
    });

    it("in the Legion Go's FPS mode, sets the mouse's buttons beside the keys", () => {
        assert.deepEqual(presetOf("legionFps", keysOf()).keys, [
            { id: "do", slot: 1, key: "Mouse2" },
            { id: "recentre", slot: 1, key: "Mouse1" },
            { id: "selfWheel", slot: 1, key: "Mouse3" },
            { id: "theirWheel", slot: 1, key: "Mouse4" },
        ]);
    });

    it("says each back button and the key it's to send, as the player has them", () => {
        const keys = keysOf({ map: ["KeyK", null] });

        assert.equal(backsSaid("steamDeck", words(keys)), "L4 to G, R4 to T, L5 to K and R5 to J");
        assert.equal(backsSaid("msiClaw", words(keys)), "M2 (left) to G and M1 (right) to T");
        assert.equal(backsSaid("steamDeck", words(keysOf({ journal: [null, null] }))), "L4 to G, R4 to T, L5 to M and R5 to nothing yet");
        assert.ok(stepsOf("steamDeck", words(keys)).some((step) => step.includes("L4 to G, R4 to T, L5 to K and R5 to J")));
        assert.ok(stepsOf("rogAlly", words(keys)).every((step) => !step.includes("{keys}")));
        assert.equal(backsSaid("nonsense", words(keys)), "");
    });
});

describe("which handheld it is", () => {
    it("is known by its controller's maker and product, as Chrome and Firefox name them on Linux", () => {
        assert.deepEqual(madeBy("Valve Software Steam Deck Controller (STANDARD GAMEPAD Vendor: 28de Product: 1205)"), { vendor: "28de", product: "1205" });
        assert.deepEqual(madeBy("17ef-6182-Lenovo Legion Controller for Windows"), { vendor: "17ef", product: "6182" });
        assert.equal(madeBy("xinput"), null);
        assert.equal(guessHandheld({ padId: "28de-1205-Steam Deck" }), "steamDeck");
        assert.equal(guessHandheld({ padId: "Lenovo Legion Controller (STANDARD GAMEPAD Vendor: 17ef Product: 61eb)" }), "legionGo2");
        assert.equal(guessHandheld({ padId: "0db0-1901-Micro Star International Xbox360 Controller for Windows" }), "msiClaw");
    });

    it("is guessed from a touch screen and a controller and the screen's pixels: one handheld's, or several's", () => {
        const pad = "Xbox 360 Controller (XInput STANDARD GAMEPAD)";

        assert.equal(guessHandheld({ padId: pad, width: 1280, height: 800, touch: true }), "steamDeck");
        assert.equal(guessHandheld({ padId: pad, width: 1280, height: 800, ratio: 2, touch: true }), "legionGo");
        assert.equal(guessHandheld({ padId: pad, width: 1080, height: 1920, touch: true }), "handheld");
        assert.equal(guessHandheld({ padId: pad, width: 1280, height: 800, touch: false }), null);
        assert.equal(guessHandheld({ padId: "", width: 1280, height: 800, touch: true }), null);
        assert.equal(guessHandheld({ padId: pad, width: 1440, height: 900, touch: true }), null);
        assert.equal(guessHandheld(), null);
    });

    it("under Steam, every controller's Steam's own, so it's the screen that tells", () => {
        assert.equal(guessHandheld({ padId: "Microsoft X-Box 360 pad 0 (STANDARD GAMEPAD Vendor: 28de Product: 11ff)", width: 1280, height: 800, touch: true }), "steamDeck");
    });
});
