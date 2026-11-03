// Multiplayer's choices, worked out apart from the page (main.js shows them): which servers a
// player's own world can be opened through, for others to find it by its code (Host on this
// Device; the game menu's Invite others), and which one a code's looked for on (Join a World on
// another Device); which of them is chosen unless the player says otherwise; and where a link from
// this page can be opened from (only this device, only its Wi-Fi, or anywhere).
//
// A world opened through a world server's broker is found there by its code, and its players
// linked to it directly where they can be, relayed through the server where they can't
// (app/peer.js); through the old relay (server/relay.js, `npm start`'s, at the page's own address
// or one given in its `?relay=`), everything's relayed. Host and joiner must look on the same one.

/** Where the server chosen last is remembered (its key: "page", "relay", "given", or a known server's). */
export const RELAY_KEY = "pellagos.relay";

/**
 * The servers to open a world through, or look for its code on, in the order they're offered:
 *
 * - `given`: the relay named in the page's own address (`?relay=`): { address }, or null;
 * - `page`: the page's own world server, if it is one and it connects players: { name, address
 *   (its broker's), at (its address) }, or null;
 * - `pageRelay`: the page's own relay (`npm start`'s): { name, address }, or null;
 * - `servers`: each known server, as Known Servers has it: { key, name, broker (its broker's
 *   address, if its card says it connects players), at, state ("checking", "up", "down",
 *   "version": another version of the game, "walled": not reachable from this page, "origin": it
 *   takes the game's calls from its own page alone), isDefault }.
 *
 * Returns { choices: [{ key, name, kind ("broker" or "relay"), address, at, own, usable, why }],
 * chosen (a choice's key) }. Chosen: `remembered` (the one chosen last) if it's offered and
 * usable; else the relay given in the page's address; else the page's own server; else the page's
 * own relay; else the first default server that's up (or still being asked); else the first other
 * known server that is; else the first offered at all, or null.
 */
export function relayChoices({ given = null, page = null, pageRelay = null, servers = [], remembered = null } = {}) {
    const choices = [];

    if (given) {
        choices.push({ key: "given", name: "The relay in this page's address", kind: "relay", address: given.address, at: null, own: true, usable: true, why: "" });
    }

    if (page) {
        choices.push({ key: "page", name: `${page.name} (this game's own server)`, kind: "broker", address: page.address, at: page.at, own: true, usable: true, why: "" });
    }

    if (pageRelay) {
        choices.push({ key: "relay", name: `${pageRelay.name} (this game's own relay)`, kind: "relay", address: pageRelay.address, at: null, own: true, usable: true, why: "" });
    }

    for (const server of servers) {
        const why = SERVER_STATES[server.state] ?? (server.broker ? "" : "doesn't connect players");
        const usable = !why || server.state === "checking";

        choices.push({ key: server.key, name: `${server.name}${server.isDefault ? " (the default server)" : ""}`, kind: "broker", address: server.broker ?? null, at: server.at ?? null, own: false, usable: usable && (server.state === "checking" || Boolean(server.broker)), why, isDefault: Boolean(server.isDefault) });
    }

    const usable = choices.filter((choice) => choice.usable);
    const known = (choice) => !choice.own;
    const chosen = usable.find((choice) => choice.key === remembered) ?? usable.find((choice) => choice.own) ?? usable.find((choice) => known(choice) && choice.isDefault) ?? usable.find(known) ?? choices[0] ?? null;

    return { choices, chosen: chosen?.key ?? null };
}

/** Why a known server can't be chosen, by how it stands (relayChoices). */
export const SERVER_STATES = Object.freeze({
    checking: "asking it how it is…",
    down: "can't be reached",
    version: "plays another version of the game",
    walled: "can't be reached from this page",
    origin: "takes the game from its own page alone",
});

// (Addresses that only this device answers, and those only a home's own network does)
const DEVICE = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|::1)$/i;
const HOME = /^(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|\[?f[cd][0-9a-f]{2}:.*|\[?fe80:.*|[^.]+|.+\.local|.+\.lan|.+\.home\.arpa)$/i;

/**
 * Where a link (`url`) can be opened from, by its address: "device" (this one alone: localhost),
 * "home" (only on its own network: a private address, a .local name, or a bare one), or
 * "anywhere".
 */
export function linkReach(url) {
    let host;

    try {
        host = new URL(url).hostname;
    } catch {
        return "anywhere";
    }

    return DEVICE.test(host) ? "device" : HOME.test(host) ? "home" : "anywhere";
}

/** What's said of a link where it can be opened from (linkReach). */
export const REACH_WORDS = Object.freeze({
    device: "This link opens only on this device: the game here was opened from this device's own server. To invite others, open the game from an address they can reach too.",
    home: "This link opens only on the same Wi-Fi as this device: the game here was opened from an address at home.",
    anywhere: "",
});
