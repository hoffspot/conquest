// A game turned away by a world server for its version (generated/multiplayer_scaling_plan.md
// F-5): it starts the update it has at once only when the server's the newer, the update's all
// downloaded, and nobody's playing; otherwise the player's told, as before.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { startsUpdate } from "../client/js/app/updater.js";

describe("whether a version refusal starts the update (app/updater.js startsUpdate)", () => {
    it("starts it when the server's newer and the update's downloaded", () => {
        assert.equal(startsUpdate({ theirs: 225, ours: 224, ready: { release: "abc" } }), true);
    });

    it("tells the player instead when the server's older or the same, didn't say, or no update's downloaded", () => {
        assert.equal(startsUpdate({ theirs: 223, ours: 224, ready: { release: "abc" } }), false);
        assert.equal(startsUpdate({ theirs: 224, ours: 224, ready: { release: "abc" } }), false);
        assert.equal(startsUpdate({ theirs: undefined, ours: 224, ready: { release: "abc" } }), false);
        assert.equal(startsUpdate({ theirs: "225", ours: 224, ready: { release: "abc" } }), false);
        assert.equal(startsUpdate({ theirs: 225, ours: undefined, ready: { release: "abc" } }), false);
        assert.equal(startsUpdate({ theirs: 225, ours: 224, ready: null }), false);
        assert.equal(startsUpdate({ theirs: 225, ours: 224, ready: undefined }), false);
    });

    it("never while a game's being played, which loading the page again would end", () => {
        assert.equal(startsUpdate({ theirs: 225, ours: 224, ready: { release: "abc" }, playing: true }), false);
    });
});
