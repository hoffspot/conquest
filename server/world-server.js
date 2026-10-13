// The world server (generated/world_server_plan.md §2): its supervisor, on the main thread. It
// owns everything durable (the data folder, the worlds and who may come into them, the server's
// identity) and the network edge (the one port: the game's own files, the management page at
// /admin, /api/v1 and the play socket; and the management page's own listener on the computer
// itself, admin.js), and runs each world in a thread of its own (registry.js). It never steps a
// world.
//
// The one port takes two kinds of connection (§9.1): it looks at each one's first byte, and a TLS
// handshake (0x16) goes to its https half, anything else to its plain http half; both answer the
// same. Home addresses may use either. The internet is answered only when the owner's turned on
// `internet` and the server has a certificate (storage/certificates.js), and over TLS alone
// (guards.js); without a certificate, TLS isn't answered at all.

import http from "node:http";
import https from "node:https";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NET_VERSION } from "../client/js/core/netplay.js";
import { isHome } from "./access/addresses.js";
import { ADMIN_PAGE, listenAdmin } from "./admin.js";
import { ServerIdentity } from "./access/identity.js";
import { Access } from "./access/index.js";
import { API_PATH, apiHandler } from "./api.js";
import { answer, guard, hostsOf, INTERNET_CLOSED, LIMITS_HTTP, originsOf, Refusal, urlOf } from "./guards.js";
import { Management } from "./manage.js";
import { Nearby } from "./nearby.js";
import { computerName } from "./platform/index.js";
import { attachPlay } from "./play.js";
import { Registry } from "./registry.js";
import { createStaticHandler } from "./static.js";
import { CertificateStore } from "./storage/certificates.js";
import { DataFolder } from "./storage/folder.js";
import { SERVER_VERSION } from "./storage/versions.js";

const CLIENT_DIRECTORY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../client");

/** How often the certificate's looked at again (ms): one put in its folder by hand taken up, one run out let go. */
export const CERTIFICATE_LOOK = 10 * 60 * 1000;

// A TLS handshake's first byte (a TLS record of type handshake: RFC 8446 §5.1)
const HANDSHAKE = 0x16;

// What's journalled of each event the access hooks are told of (keys by their labels, never as they are)
const JOURNAL = Object.freeze({
    entered: ({ player, role, label, new: first }) => `${first ? "A new player" : "A player"} (${player}) came in, as ${role === "owner" ? "an owner" : `a ${role}`}, by the key "${label}".`,
    left: ({ player }) => `A player (${player}) left.`,
    keyIssued: ({ label, role, by }) => `${role === "owner" ? "An" : "A"} ${role}'s key, "${label}", was made${by ? ` by ${by}` : ""}.`,
    keyRevoked: ({ label, by }) => `The key "${label}" was revoked${by ? ` by ${by}` : ""}.`,
    keyReplaced: ({ label, by }) => `The key "${label}" was replaced${by ? ` by ${by}` : ""}.`,
    codeMade: ({ by }) => `A short code was made${by ? ` by ${by}` : ""}.`,
    codeRedeemed: () => "A short code was used.",
    codesBurned: ({ count }) => `${count} short code${count === 1 ? " was" : "s were"} burned: too many wrong guesses at codes.`,
    banned: ({ player, by }) => `A player (${player}) was banned${by ? ` by ${by}` : ""}.`,
    unbanned: ({ player, by }) => `A player's (${player}) ban was lifted${by ? ` by ${by}` : ""}.`,
});

export class WorldServer {
    /**
     * The world server on its data folder (`root`), not yet listening: made the first time, with
     * its admin key (`adminKey`, shown then alone) and identity. `options.onStop` is what stops
     * it when the management page asks (server/world.js: every world saved, then the process
     * ended); `options.bonjour` the machine's Bonjour (platform/ bonjour(): server/world.js gives
     * it; without one it's never shown to others nor finds them). The rest are for the tests:
     * `cost` (short codes' hashing), `clock`, `awake` (keeping the machine awake), `interfaces`,
     * `hostname` and `name` (the machine's: its name is the computer's own, else its host name's),
     * `home` (which addresses are home: access/addresses.js isHome; the tests make loopback the
     * internet with it), `clientDirectory`.
     */
    static async open(root, options = {}) {
        const folder = await DataFolder.open(root);
        const { access, adminKey } = await Access.open(root, { ...(options.clock ? { clock: options.clock } : {}), ...(options.cost ? { cost: options.cost } : {}) });
        const { identity } = await ServerIdentity.open(root);
        const server = new WorldServer({ root, folder, access, identity, adminKey, ...options });

        for (const id of await folder.worlds.ids()) {
            await server.#add(await folder.worlds.open(id));
        }

        return server;
    }

    constructor({ root, folder, access, identity, adminKey = null, awake, interfaces = null, hostname = os.hostname(), name = null, bonjour = null, home = isHome, clientDirectory = CLIENT_DIRECTORY, names = [], onStop = null }) {
        Object.assign(this, { root, folder, access, identity, adminKey, interfaces, hostname, names, onStop });

        /** Whether an address is at home (the guards ask it). */
        this.isHome = home;

        /** Its name, as others see it (its status, Bonjour, the management page): the computer's own, once it's listening, unless given. */
        this.name = name ?? hostname.replace(/\.local$/, "");
        this.named = Boolean(name);
        this.settings = folder.settings;
        this.store = folder.worlds;

        /** The worlds kept (by id: storage/worlds.js StoredWorld). */
        this.worlds = new Map();

        this.registry = new Registry({
            store: { open: async (id) => this.worlds.get(id) ?? Promise.reject(new Error(`There's no world ${id}.`)) },
            settings: this.settings,
            ...(awake ? { awake } : {}),
            onSend: (world, peer, text) => this.play?.send(world, peer, text),
            onClose: (world, peer, reason) => this.play?.kicked(world, peer, reason),
            // (A world stored again with players still in it: its thread ended unasked. They're told)
            onChange: (world) => {
                if (this.registry?.lifeOf(world).life === "stored") {
                    this.play?.closeWhere((place) => place.world === world, "broken");
                }
            },
        });

        this.static = createStaticHandler(clientDirectory);

        /** What its owners and admin can do (manage.js), and the API (both listeners' own). */
        this.manage = new Management(this);
        this.api = apiHandler(this);
        this.access.policy.listeners.push((event, detail) => this.#journal(event, detail));

        /**
         * The one port, once it's listening: its listener (`tcp`), which hands each connection to
         * its plain half (`http`) or its TLS half (`https`); the play socket on both; the port.
         */
        this.tcp = null;
        this.http = null;
        this.https = null;
        this.play = null;
        this.port = null;

        /** Every connection on the port, sorted or not (each closed with it: TLS's halves don't close the socket under them). */
        this.connections = new Set();

        /** Its certificate (storage/certificates.js): what it says of itself (x509.js describe), once it's taken up; null if there's none. */
        this.certificates = new CertificateStore(root);
        this.certificate = null;
        this.looking = null;

        /** The management page's listener on the computer itself (admin.js), once it's listening; its port. */
        this.admin = null;
        this.adminPort = null;
        this.hosts = new Set();
        this.origins = { has: () => false };

        /** The other servers on the Wi-Fi, and its own advertising (nearby.js): on with the `bonjour` setting, once it's listening. */
        this.nearby = new Nearby({ bonjour, card: () => this.bonjourCard() });
    }

    /** What it advertises on the Wi-Fi (nearby.js): { id, name, version, net, port, worlds (how many it lists) }. */
    bonjourCard() {
        return { id: this.identity.id, name: this.name, version: SERVER_VERSION, net: NET_VERSION, port: this.port, worlds: [...this.worlds.values()].filter((stored) => stored.meta.settings.listed).length };
    }

    async #add(stored) {
        this.worlds.set(stored.id, stored);
        await this.access.addWorld(stored.id, stored.folder);
    }

    /** The addresses-blocked-a-while list (the guards ask it). */
    get blocks() {
        return this.access.blocks;
    }

    /** Why the internet isn't answered (a sentence), or null when it is: the `internet` setting on, and a certificate (the guards ask it). */
    get internetClosed() {
        if (!this.settings.get("internet")) {
            return INTERNET_CLOSED;
        }

        if (!this.certificate) {
            return "This server isn't open to the internet yet: it has no certificate, so it can't be reached securely.";
        }

        return null;
    }

    /** A world's world.json (as it was last written), or null. */
    metaOf(id) {
        return this.worlds.get(id)?.meta ?? null;
    }

    // An event the access hooks were told of, in its world's journal
    #journal(event, detail) {
        const line = JOURNAL[event]?.(detail);
        const world = detail.world ? this.worlds.get(detail.world) : null;

        if (line && world) {
            world.journal(line).catch(() => {});
        }
    }

    /** Where it can be reached securely: an https URL for each name its certificate carries (none without one). */
    secureAddresses() {
        return (this.certificate?.names ?? []).map((name) => `https://${name.includes(":") ? `[${name}]` : name}:${this.port}`);
    }

    /** Where it can be reached at home (each of its home addresses, and its .local name): http URLs. */
    addresses() {
        const found = Object.values(this.interfaces ?? os.networkInterfaces()).flat().filter((one) => one && !one.internal && isHome(one.address));
        const shown = (address) => (address.includes(":") ? `[${address.replace(/%.*$/, "")}]` : address);

        return [`http://${this.hostname.replace(/\.local$/, "")}.local:${this.port}`, ...found.filter((one) => one.family === "IPv4").map((one) => `http://${shown(one.address)}:${this.port}`)];
    }

    /**
     * A world made (as the server's admin or a creator asks: `creator` names them, for its
     * journal), with an owner's key and a player's key. Returns { world, ownerKey, playerKey }.
     */
    async createWorld({ name, description = "", seed, race, heroes = "kept", firstHero = "new", settings = {} }, { creator = null } = {}) {
        const stored = await this.store.create({ name, description, seed, race, creator, heroes, firstHero, settings });

        await this.#add(stored);

        const owner = await this.access.issueKey(stored.id, { label: "The owner's key", role: "owner" }, { by: creator });
        const player = await this.access.issueKey(stored.id, { label: "Players' key", role: "player" }, { by: creator });

        return { world: stored.id, name: stored.meta.name, ownerKey: owner.key, playerKey: player.key };
    }

    /** Everyone whose place in a world passes `test` sent out, saying why. Returns how many. */
    closePlaces(test, reason) {
        return this.play?.closeWhere(test, reason) ?? 0;
    }

    /** Listening on `port` (the server's setting, unless given; 0 for any free one), on every address. */
    async listen(port = this.settings.get("port"), host = undefined) {
        const limits = { requestTimeout: LIMITS_HTTP.request, headersTimeout: LIMITS_HTTP.headers, keepAliveTimeout: LIMITS_HTTP.keepAlive, connectionsCheckingInterval: 1000 };
        const handle = (request, response) => this.#request(request, response);

        this.http = http.createServer(limits, handle);
        // (Its certificate's set on it when there's one: loadCertificate. A handshake gets as long as headers do)
        this.https = https.createServer({ ...limits, minVersion: "TLSv1.2", handshakeTimeout: LIMITS_HTTP.headers }, handle);
        this.https.on("tlsClientError", (error, socket) => socket.destroy());
        this.tcp = net.createServer((socket) => this.#sort(socket));
        await new Promise((resolve, reject) => {
            this.tcp.once("error", reject);
            this.tcp.listen(port, host, resolve);
        });
        this.port = this.tcp.address().port;

        // (The halves never listen themselves, the port does: told it's listening, each keeps its
        // request and header time limits, which an HTTP server starts checking only then)
        this.http.emit("listening");
        this.https.emit("listening");
        await this.loadCertificate();
        this.play = attachPlay([this.http, this.https], this);
        this.looking = setInterval(() => this.loadCertificate(), CERTIFICATE_LOOK);
        this.looking.unref?.();

        if (!this.named) {
            this.name = (await computerName().catch(() => null)) ?? this.name;
        }

        this.nearby.follow(this.settings.get("bonjour"));

        return this.port;
    }

    // A connection on the one port, handed on by its first byte: a TLS handshake to the https half
    // (refused if there's no certificate), anything else to the plain half. Its byte's put back
    // first, so the half it goes to reads it whole.
    #sort(socket) {
        const drop = () => socket.destroy();

        this.connections.add(socket);
        socket.on("error", drop);
        socket.setTimeout(LIMITS_HTTP.headers, drop);
        socket.once("close", () => this.connections.delete(socket));
        socket.once("data", (chunk) => {
            const secure = chunk[0] === HANDSHAKE;

            socket.setTimeout(0);

            if (secure && !this.certificate) {
                drop();

                return;
            }

            socket.pause();
            socket.unshift(chunk);
            socket.off("error", drop);
            (secure ? this.https : this.http).emit("connection", socket);
            process.nextTick(() => socket.resume());
        });
    }

    /**
     * Its certificate taken up (storage/certificates.js: at listening, every CERTIFICATE_LOOK, and
     * when one's kept): TLS answers with it, and the names it carries are the server's too. One
     * that's gone (or run out) is let go: TLS is no longer answered, nor the internet, and anyone
     * in from there is sent out. Returns what it says of itself (x509.js describe), or null.
     */
    async loadCertificate() {
        const found = await this.certificates.current().catch(() => null);

        if (found && this.https) {
            this.https.setSecureContext({ key: found.key, cert: found.cert });
        }

        this.certificate = found?.info ?? null;
        this.#reach();
        this.closeToInternet();

        return this.certificate;
    }

    /** A certificate (PEM key and chain) kept and taken up; refused, saying why, if they can't be used together. Returns what it says of itself. */
    async useCertificate({ key, cert }) {
        await this.certificates.save({ key, cert });

        return this.loadCertificate();
    }

    /** Its certificate let go (TLS no longer answered, nor the internet). */
    async dropCertificate() {
        await this.certificates.remove();

        return this.loadCertificate();
    }

    /** If the internet isn't answered now, everyone in from there sent out ("internet-closed"). Returns how many. */
    closeToInternet() {
        return this.internetClosed ? this.closePlaces((place) => place.from === "internet", "internet-closed") : 0;
    }

    // The names it answers to and the pages it answers (guards.js): its own, its certificate's, and
    // the game's; and the pages of the servers it's found near it on the Wi-Fi, each by its exact
    // address (the game from any of them plays here too)
    #reach() {
        if (this.port === null) {
            return;
        }

        this.hosts = hostsOf(this.port, { names: [...this.names, ...(this.certificate?.names ?? [])], ...(this.interfaces ? { interfaces: this.interfaces } : {}), hostname: this.hostname });

        const own = originsOf(this.hosts);

        this.origins = { has: (origin) => own.has(origin) || this.nearby.allows(origin) };
    }

    /** The management page listening on the computer itself, on `port` (the server's adminPort setting, unless given; 0 for any free one). */
    async listenAdmin(port = this.settings.get("adminPort")) {
        this.admin = await listenAdmin(this, port);
        this.adminPort = this.admin.port;

        return this.adminPort;
    }

    // A request: the API's, the management page, or one of the game's own files (all behind the guards)
    #request(request, response) {
        const pathname = urlOf(request.url)?.pathname;

        if (pathname === API_PATH || pathname?.startsWith(`${API_PATH}/`)) {
            this.api(request, response);

            return;
        }

        try {
            const { from } = guard({ address: request.socket.remoteAddress, host: request.headers.host, origin: undefined, secure: Boolean(request.socket.encrypted) }, this);

            if (pathname === undefined) {
                throw new Refusal(400, "bad-request", "That isn't an address on this server.");
            }

            // (The management page, from the Wi-Fi: it asks for the admin key. Never from the internet)
            if (pathname === "/admin" || pathname === "/admin/") {
                if (from === "internet") {
                    throw new Refusal(403, "home", "The server's management page answers at home alone: on the server's computer, or its Wi-Fi.");
                }

                request.url = ADMIN_PAGE;
                response.setHeader("Cache-Control", "no-store");
            }
        } catch (error) {
            if (!(error instanceof Refusal)) {
                throw error;
            }

            // (A page asked for plainly from the internet: sent on to the same page over TLS. Its
            // Host is one of the server's own: the guards checked it before saying "secure")
            const target = urlOf(request.url);

            if (error.error === "secure" && target && (request.method === "GET" || request.method === "HEAD")) {
                response.writeHead(308, { Location: `https://${String(request.headers.host).toLowerCase()}${target.pathname}${target.search}`, "Content-Length": 0, "Cache-Control": "no-store" });
                response.end();

                return;
            }

            answer(response, error.status, { error: error.error, message: error.message });

            return;
        }

        this.static(request, response);
    }

    /** Stopped: everyone told, every world saved and set aside, the ports closed. */
    async close() {
        clearInterval(this.looking);
        this.nearby.stop();
        this.play?.close("server-stopping");
        await this.registry.shutdown();
        await this.admin?.close();

        if (this.tcp) {
            const closed = new Promise((resolve) => this.tcp.close(() => resolve()));

            for (const socket of this.connections) {
                socket.destroy();
            }

            // (Each half's time limits stopped checking)
            this.http.close(() => {});
            this.https.close(() => {});
            await closed;
        }
    }
}
