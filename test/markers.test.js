// The player's markers on the world map (client/js/core/markers.js; docs/GAME.md *The world map*):
// up to ten, each an icon and a few words of their own, kept with the character; and one shared
// with their party (core/host.js, the "party" command's "mark": docs/WAR.md *Parties*), each of the
// rest told of it to keep, nothing kept of it by the host
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { HOST_PLAYER, Host } from "../client/js/core/host.js";
import { MARKER_ICONS, MARKER_NAMES, markerOf, MARKERS, markersOf, markerWords, withMarker } from "../client/js/core/markers.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { WORLD_SIZE } from "../client/js/core/worldplan/plan.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

function run(host, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...host.advance(STEP_MS));
    }

    return events;
}

describe("markers (core/markers.js)", () => {
    it("comes in eight kinds, each named", () => {
        assert.deepEqual(MARKER_ICONS, ["flag", "star", "danger", "loot", "camp", "sight", "herbs", "mystery"]);
        assert.deepEqual(Object.keys(MARKER_NAMES), MARKER_ICONS);
    });

    it("keeps a few words of the player's own, tidied: control characters and runs of spaces one space, trimmed, 24 letters at most, an emoji never halved", () => {
        assert.equal(markerWords("  Wolves'\n\t den  "), "Wolves' den");
        assert.equal(markerWords("a\u0000b"), "a b");
        assert.equal(markerWords("x".repeat(40)).length, MARKERS.words);
        assert.equal(markerWords(`${"y".repeat(23)}🐺🐺`), `${"y".repeat(23)}🐺`);
        assert.equal(markerWords(42), "");
        assert.equal(markerWords(undefined), "");
    });

    it("puts one down with an id none of the rest has, up to ten; none of a kind there isn't, nor off the map", () => {
        let markers = [];

        for (let k = 0; k < MARKERS.most; k++) {
            markers = withMarker(markers, { at: [100 + k, 200], icon: MARKER_ICONS[k % MARKER_ICONS.length], words: `Spot ${k}` });
        }

        assert.equal(markers.length, MARKERS.most);
        assert.equal(new Set(markers.map(({ id }) => id)).size, MARKERS.most);
        assert.deepEqual(markers[0], { id: "marker-1", x: 100, z: 200, icon: "flag", words: "Spot 0", from: null });
        assert.equal(withMarker(markers, { at: [1, 2], icon: "flag" }), null, "(ten already)");

        // (One taken away: the next its own id still)
        const fewer = markers.filter(({ id }) => id !== "marker-3");
        const again = withMarker(fewer, { at: [5, 6], icon: "loot", from: "Bram" });

        assert.equal(new Set(again.map(({ id }) => id)).size, MARKERS.most);
        assert.deepEqual(again.at(-1), { id: "marker-11", x: 5, z: 6, icon: "loot", words: "", from: "Bram" });
        assert.equal(withMarker([], { at: [1, 2], icon: "dragon" }), null);
        assert.equal(withMarker([], { at: [1, Number.NaN], icon: "flag" }), null);
    });

    it("takes back what was kept only as markers: ten at most, each id once", () => {
        const kept = [
            { id: "a", x: 1, z: 2, icon: "star", words: "  Here ", from: "Bram" },
            { id: "a", x: 3, z: 4, icon: "star" },
            { id: "b", x: "1", z: 2, icon: "star" },
            { id: "c", x: 1, z: 2, icon: "unicorn" },
            null,
            ...Array.from({ length: 12 }, (_, k) => ({ id: `n${k}`, x: k, z: k, icon: "flag" })),
        ];
        const markers = markersOf(kept);

        assert.equal(markers.length, MARKERS.most);
        assert.deepEqual(markers[0], { id: "a", x: 1, z: 2, icon: "star", words: "Here", from: "Bram" });
        assert.deepEqual(markersOf("nonsense"), []);
        assert.equal(markerOf({ id: "d", x: 1, z: 2, icon: "flag", from: 7 }).from, null);
    });
});

describe("markers shared with the party (host.js, the party command's mark)", () => {
    const party = (host, id, what, rest = {}) => host.command(id, { type: "party", do: what, ...rest });
    const marks = (events) => events.filter(({ type, change }) => type === "party" && change === "mark");

    // A world (seed 2) with Ada and Bea in a party, and Cy in none
    function together() {
        const host = new Host(buildWorld({ seed: 2 }), { populate: false });

        host.join({ id: HOST_PLAYER, hero: HERO });
        host.join({ id: "bea", hero: { ...HERO, name: "Bea" } });
        host.join({ id: "cy", hero: { ...HERO, name: "Cy" } });
        party(host, HOST_PLAYER, "invite", { who: "bea" });
        party(host, "bea", "accept");

        return host;
    }

    it("tells the whole party of it, its words tidied, the one who shared it too, and no one else; nothing of it kept", () => {
        const host = together();
        const at = [2400.5, 3100.25];

        assert.deepEqual(party(host, HOST_PLAYER, "mark", { at, icon: "danger", words: "  Wolves'   den " }), { ok: true });

        const told = marks(run(host, 100));

        assert.deepEqual(
            told.map(({ id, who, name, at, icon, words }) => ({ id, who, name, at, icon, words })),
            [HOST_PLAYER, "bea"].map((id) => ({ id, who: HOST_PLAYER, name: "Ada", at, icon: "danger", words: "Wolves' den" })),
        );
        assert.equal(JSON.stringify(host.snapshot()).includes("Wolves"), false);
    });

    it("is refused out of a party, off the world's map, and for a kind of marker there isn't", () => {
        const host = together();

        assert.equal(party(host, "cy", "mark", { at: [10, 10], icon: "flag" }).reason, "unpartied");
        assert.equal(party(host, HOST_PLAYER, "mark", { at: [10, WORLD_SIZE + 1], icon: "flag" }).reason, "command");
        assert.equal(party(host, HOST_PLAYER, "mark", { at: [10, 10], icon: "dragon" }).reason, "command");
        assert.equal(party(host, HOST_PLAYER, "mark", { at: [10, 10] }).reason, "command");
        assert.equal(marks(run(host, 100)).length, 0);
    });
});
