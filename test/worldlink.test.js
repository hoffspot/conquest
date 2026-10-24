// How the world's linked, as the HUD shows it (client/js/app/worldlink.js; docs/GAME.md *The
// world's link*): at home a lantern; away an orb, its glow how well the link holds by the round
// trip, flickering once it's dropped; in a friend's world, on a world server, or with friends in
// the player's own, each said in words
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LINK_QUALITY, linkQuality, worldLinkOf } from "../client/js/app/worldlink.js";

describe("the world's link (app/worldlink.js)", () => {
    it("calls a link good, fair or poor by how long a word takes there and back; fair before it's timed; lost once it's dropped", () => {
        assert.deepEqual(LINK_QUALITY, { good: 150, fair: 400 });
        assert.equal(linkQuality(40), "good");
        assert.equal(linkQuality(149), "good");
        assert.equal(linkQuality(150), "fair");
        assert.equal(linkQuality(399), "fair");
        assert.equal(linkQuality(400), "poor");
        assert.equal(linkQuality(null), "fair");
        assert.equal(linkQuality(40, { lost: true }), "lost");
    });

    it("shows the lantern at home; away, the orb, said for a friend's world, a world server's, and the player's own with friends in it", () => {
        assert.deepEqual(worldLinkOf(), { away: false, quality: null, words: "Your own world, here on this device." });

        assert.deepEqual(worldLinkOf({ joined: { rtt: 84, host: "Wren" }, about: { kind: "friend", how: "direct" } }), {
            away: true,
            quality: "good",
            words: "In Wren's world, linked directly. A word there and back: 80 ms. The link's strong.",
        });
        assert.equal(worldLinkOf({ joined: { rtt: 230, host: "Wren" }, about: { kind: "friend", how: "relayed" } }).words, "In Wren's world, linked through the server. A word there and back: 230 ms. The link's fair.");
        assert.deepEqual(worldLinkOf({ joined: { rtt: 520 }, about: { kind: "server", world: "Thornwick", server: "Tom's Mac mini" } }), {
            away: true,
            quality: "poor",
            words: "In Thornwick on Tom's Mac mini. A word there and back: 520 ms. The link's weak: expect delays.",
        });
        assert.equal(worldLinkOf({ joined: { rtt: null, host: null }, about: {} }).words, "In a friend's world. Timing the link…");
        assert.deepEqual(worldLinkOf({ joined: { rtt: 84, host: "Wren" }, lost: true, about: { kind: "friend" } }), { away: true, quality: "lost", words: "In Wren's world. A word there and back: 80 ms. The link's dropped: reconnecting…" });

        assert.deepEqual(worldLinkOf({ hosting: { guests: 2, slowest: 141 } }), {
            away: true,
            quality: "good",
            words: "Your world, open to friends: 2 friends in it. The slowest link: a word there and back in 140 ms. The link's strong.",
        });
        assert.equal(worldLinkOf({ hosting: { guests: 1, slowest: null } }).words, "Your world, open to friends: 1 friend in it. Timing the link…");
    });
});
