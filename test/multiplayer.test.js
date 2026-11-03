// Multiplayer's choices (client/js/app/multiplayer.js): the servers a player's own world is opened
// through, and its code looked for on, in the order they're offered, which can be chosen and why
// not, and which is chosen unless the player says otherwise; and where a link from the page opens.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { linkReach, REACH_WORDS, relayChoices } from "../client/js/app/multiplayer.js";

const PELLAGOS = { key: "pellagos.duckdns.org:8480", name: "Pellagos", broker: "wss://pellagos.duckdns.org:8480/broker", at: "https://pellagos.duckdns.org:8480", state: "up", isDefault: true };
const STUDIO = { key: "studio-mac.local:8480", name: "Studio", broker: "ws://studio-mac.local:8480/broker", at: "http://studio-mac.local:8480", state: "up", isDefault: false };

describe("the servers to host and join through (app/multiplayer.js relayChoices)", () => {
    it("offers the page's own first, then the known servers; chooses the page's own server, else its relay, else the default server", () => {
        const page = { name: "Home", address: "ws://home.local:8480/broker", at: "http://home.local:8480" };
        const pageRelay = { name: "localhost:8080", address: "ws://localhost:8080/relay" };

        const fromServer = relayChoices({ page, servers: [STUDIO, PELLAGOS] });

        assert.deepEqual(
            fromServer.choices.map(({ key, kind, usable }) => [key, kind, usable]),
            [
                ["page", "broker", true],
                [STUDIO.key, "broker", true],
                [PELLAGOS.key, "broker", true],
            ],
        );
        assert.equal(fromServer.chosen, "page");
        assert.equal(fromServer.choices[2].name, "Pellagos (the default server)");
        assert.equal(relayChoices({ pageRelay, servers: [STUDIO, PELLAGOS] }).chosen, "relay", "npm start's relay, before any server");
        assert.equal(relayChoices({ servers: [STUDIO, PELLAGOS] }).chosen, PELLAGOS.key, "from GitHub Pages: the default server before others");
        assert.equal(relayChoices({ servers: [STUDIO, { ...PELLAGOS, state: "down" }] }).chosen, STUDIO.key, "unless it's down");
        assert.equal(relayChoices({ given: { address: "wss://elsewhere/relay" }, page, servers: [PELLAGOS] }).chosen, "given", "a relay in the page's address first of all");
        assert.equal(relayChoices().chosen, null, "none at all");
    });

    it("keeps the one chosen last while it can be chosen; says why each that can't be can't", () => {
        const servers = [{ ...STUDIO, state: "down" }, { ...PELLAGOS, state: "checking", broker: null }, { key: "old.local:8480", name: "Old", broker: null, state: "up" }, { key: "newer.local:8480", name: "Newer", broker: "ws://x/broker", state: "version" }];
        const { choices, chosen } = relayChoices({ pageRelay: { name: "localhost:8080", address: "ws://localhost:8080/relay" }, servers, remembered: STUDIO.key });

        assert.equal(chosen, "relay", "the one chosen last is down: the page's relay");
        assert.deepEqual(
            choices.map(({ key, usable, why }) => [key, usable, why]),
            [
                ["relay", true, ""],
                [STUDIO.key, false, "can't be reached"],
                [PELLAGOS.key, true, "asking it how it is…"],
                ["old.local:8480", false, "doesn't connect players"],
                ["newer.local:8480", false, "plays another version of the game"],
            ],
        );
        assert.equal(relayChoices({ pageRelay: { name: "l", address: "ws://l/relay" }, servers: [STUDIO], remembered: STUDIO.key }).chosen, STUDIO.key, "up: kept");
    });
});

describe("where a link from the page opens (app/multiplayer.js linkReach)", () => {
    it("knows this device's own addresses, a home's, and the internet's", () => {
        for (const url of ["http://localhost:8080/?join=ABCD", "http://127.0.0.1:8095/", "http://[::1]:8080/"]) {
            assert.equal(linkReach(url), "device", url);
        }

        for (const url of ["http://192.168.1.20:8480/", "http://10.0.0.4/", "http://172.20.1.1/", "http://studio-mac.local:8480/", "http://studio/"]) {
            assert.equal(linkReach(url), "home", url);
        }

        for (const url of ["https://hoffspot.github.io/conquest/?join=ABCD", "https://pellagos.duckdns.org:8480/", "https://172.40.1.1/", "not a link"]) {
            assert.equal(linkReach(url), "anywhere", url);
        }

        assert.equal(REACH_WORDS.anywhere, "");
        assert.match(REACH_WORDS.device, /only on this device/);
        assert.match(REACH_WORDS.home, /same Wi-Fi/);
    });
});
