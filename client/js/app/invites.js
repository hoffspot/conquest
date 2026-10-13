// A world server's address as a player types it, and invite links to its worlds (generated/
// world_server_plan.md §8.1, §9.5): on their own, needing nothing else of the game's, so the
// server's management page (js/admin/page.js) makes the same links the game reads (app/servers.js).

/** A world server's port, unless an address says otherwise (server/storage/settings.js port). */
export const DEFAULT_PORT = 8480;

// (A host name, or an IPv4 address; or an IPv6 one, bracketed)
const HOST = /^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.?$/;
const V6 = /^\[[0-9A-Fa-f:.]+\]$/;

/**
 * A server's address from what a player typed: `host`, `host:port`, `[v6]:port`, a bare IPv6
 * address, or an http(s)/ws(s) address. Returns { host (IPv6 bracketed), port, secure, key (its
 * "host:port", how the game knows it) }, or null if it isn't one.
 */
export function addressOf(text) {
    let given = String(text ?? "").trim();
    let secure = false;
    let schemed = false;

    if (!given) {
        return null;
    }

    const scheme = /^(https?|wss?):\/\//i.exec(given);

    if (scheme) {
        schemed = true;
        secure = /^(https|wss)$/i.test(scheme[1]);
        given = given.slice(scheme[0].length).replace(/[/?#].*$/, "");
    }

    let host;
    let port;

    if (given.startsWith("[")) {
        const end = given.indexOf("]");

        host = given.slice(0, end + 1);
        port = given.slice(end + 1).replace(/^:/, "");
    } else if ((given.match(/:/g) ?? []).length > 1) {
        host = `[${given}]`;
        port = "";
    } else {
        [host, port = ""] = given.split(":");
    }

    if (!(HOST.test(host) || V6.test(host)) || (port && !/^\d{1,5}$/.test(port))) {
        return null;
    }

    const number = port ? Number(port) : schemed ? (secure ? 443 : 80) : DEFAULT_PORT;

    if (number < 1 || number > 65535) {
        return null;
    }

    host = host.toLowerCase().replace(/\.$/, "");

    return { host, port: number, secure, key: `${host}:${number}` };
}

/**
 * An invite to a world on a server: the game's page (`page`, where it's played from: the server's
 * own, or GitHub Pages) with what's needed in its fragment (never sent anywhere): the server's
 * address and id (pinned on following it), the world, and a key or short code (or, for a player
 * who's lost theirs, the new return ticket its owner gave them).
 */
export function inviteLink(page, { address, id, world, key = null, code = null, ticket = null }) {
    const fragment = new URLSearchParams({ server: address.key, ...(address.secure ? { secure: "1" } : {}), ...(id ? { id } : {}), ...(world ? { world } : {}), ...(key ? { key } : {}), ...(code ? { code } : {}), ...(ticket ? { ticket } : {}) });

    return `${String(page).replace(/#.*$/, "")}#${fragment}`;
}

/** An invite from a link (or just its fragment): { address, id, world, key, code, ticket }, or null if it isn't one. */
export function inviteOf(link) {
    const at = String(link ?? "").indexOf("#");
    const fragment = new URLSearchParams(at < 0 ? String(link ?? "") : String(link).slice(at + 1));
    const server = fragment.get("server");
    const address = server ? addressOf(`${fragment.get("secure") === "1" ? "https" : "http"}://${server}`) : null;

    if (!address) {
        return null;
    }

    return { address, id: fragment.get("id"), world: fragment.get("world"), key: fragment.get("key"), code: fragment.get("code"), ticket: fragment.get("ticket") };
}
