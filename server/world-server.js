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
// (guards.js); without a certificate, TLS isn't answered at all, but for a certificate
// authority's TLS-ALPN-01 check while one's being got (certify.js).
//
// A tunnel (Tailscale Funnel: funnel.js) brings the internet another way, to the tunnel listener
// on this computer alone (127.0.0.1:8482, while the internet's answered and the `funnel` setting's
// on): its connections are the internet's, plain (the tunnel's TLS was Tailscale's), and need no
// certificate of the server's own.

import { randomBytes } from "node:crypto";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import os from "node:os";
import tls from "node:tls";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NET_VERSION } from "../client/js/core/netplay.js";
import { isHome } from "./access/addresses.js";
import { ADMIN_PAGE, listenAdmin } from "./admin.js";
import { ServerIdentity } from "./access/identity.js";
import { Access } from "./access/index.js";
import { API_PATH, apiHandler } from "./api.js";
import { Certifier, tokensFileOf } from "./certify.js";
import { Funnel } from "./funnel.js";
import { attachBroker, BROKER_PATH } from "./broker.js";
import { answer, connectionOf, guard, hostsOf, INTERNET_CLOSED, LIMITS_HTTP, originsOf, Refusal, urlOf } from "./guards.js";
import { Management } from "./manage.js";
import { Nearby } from "./nearby.js";
import { Updater } from "./update/updater.js";
import { ACME_TLS, reverseNameOf } from "./net/acme.js";
import { newKey, pem, pemOfKey, selfSigned } from "./net/x509.js";
import { computerName, tokenStore } from "./platform/index.js";
import { attachPlay } from "./play.js";
import { Registry } from "./registry.js";
import { Router } from "./router.js";
import { createStaticHandler } from "./static.js";
import { CertificateStore } from "./storage/certificates.js";
import { DataFolder } from "./storage/folder.js";
import { CHARACTER_RULES, RULE_MODES } from "./storage/worlds.js";
import { SERVER_VERSION } from "./storage/versions.js";

const CLIENT_DIRECTORY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../client");

/** How often the certificate's looked at again (ms): one put in its folder by hand taken up, one run out let go. */
export const CERTIFICATE_LOOK = 10 * 60 * 1000;

// A TLS handshake's first byte (a TLS record of type handshake: RFC 8446 §5.1)
const HANDSHAKE = 0x16;

// What the server's own hairpin check begins with (then its token): router.js check
const HAIRPIN = "PELLAGOS-HAIRPIN ";

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
     * internet with it), `acme` (the certificate authority, and how it and DNS hosts are reached:
     * certify.js), `tokens` (where tokens are kept: platform/ tokenStore), `router` and `funnel`
     * (router.js, funnel.js: false for none), `tunnelPort` (the tunnel listener's, 0 for any free
     * one), `clientDirectory`, `ice` (the STUN servers the broker tells games to try: broker.js).
     * `options.onRestart` is what stops it to be started again as a new version, once an update's
     * installed (server/serve.js); `options.update` where it looks for new versions and the key
     * they're checked with (update/updater.js).
     */
    static async open(root, options = {}) {
        const folder = await DataFolder.open(root);
        const { access, adminKey } = await Access.open(root, { ...(options.clock ? { clock: options.clock } : {}), ...(options.cost ? { cost: options.cost } : {}) });
        const { identity } = await ServerIdentity.open(root);
        const server = new WorldServer({ root, folder, access, identity, adminKey, ...options });

        for (const id of await folder.worlds.ids()) {
            await server.#add(await folder.worlds.open(id));
        }

        await server.certifier.open();

        return server;
    }

    constructor({ root, folder, access, identity, adminKey = null, awake, interfaces = null, hostname = os.hostname(), name = null, bonjour = null, home = isHome, acme = {}, tokens = null, router = {}, funnel = {}, tunnelPort = null, clientDirectory = CLIENT_DIRECTORY, names = [], onStop = null, onRestart = null, ice = null, update = {} }) {
        Object.assign(this, { root, folder, access, identity, adminKey, interfaces, hostname, names, onStop, onRestart, ice });

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
        this.access.isOpen = (id) => this.metaOf(id)?.settings?.open === true;

        /**
         * The one port, once it's listening: its listener (`tcp`), which hands each connection to
         * its plain half (`http`) or its TLS half (`https`); the play socket on both; the port.
         */
        this.tcp = null;
        this.http = null;
        this.https = null;
        this.play = null;
        this.port = null;

        /** The broker (broker.js): players' own worlds listed, and their games helped to connect. */
        this.broker = null;

        /** Every connection on the port, sorted or not (each closed with it: TLS's halves don't close the socket under them). */
        this.connections = new Set();

        /** Its certificate (storage/certificates.js): what it says of itself (x509.js describe), once it's taken up; null if there's none. */
        this.certificates = new CertificateStore(root);
        this.certificate = null;
        this.looking = null;

        /** Free certificates got and renewed (certify.js), and the TLS-ALPN-01 checks it's answering meanwhile (by the reverse name asked for). */
        this.certifier = new Certifier(this, { ...acme, tokens: tokens ?? tokenStore({ file: tokensFileOf(root) }) });

        /** The home's router, asked to let the internet in while it's answered (router.js; none if `router` is false, as most tests have it). */
        this.router = router === false ? null : new Router(this, router);

        /** Tailscale Funnel, asked for while the internet's answered and the `funnel` setting's on (funnel.js; none if `funnel` is false); the tunnel listener it brings the internet to, on this computer alone, and its port. */
        this.funnel = funnel === false ? null : new Funnel(this, funnel);
        this.tunnel = null;
        this.tunnelPort = null;
        this.tunnelPortGiven = tunnelPort;
        this.tunnelHosts = new Set();
        this.tunnelError = null;

        /** What games have said of reaching the server from elsewhere ("Test this server"), the latest first. */
        this.reports = [];

        /** Hairpin checks waiting for their own connection to come back (router.js check). */
        this.hairpins = new Map();
        this.challenges = new Map();

        /** The management page's listener on the computer itself (admin.js), once it's listening; its port. */
        this.admin = null;
        this.adminPort = null;
        this.hosts = new Set();
        this.origins = { has: () => false };

        /** The other servers on the Wi-Fi, and its own advertising (nearby.js): on with the `bonjour` setting, once it's listening. */
        this.nearby = new Nearby({ bonjour, card: () => this.bonjourCard() });

        /** Its updates (update/updater.js): new versions looked for once a day, once it's started; installed when its owner asks, or by itself overnight. */
        this.updater = new Updater(this, update);
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

    /** Why the internet isn't answered through the tunnel (a sentence), or null when it is: the `internet` and `funnel` settings on. */
    get tunnelClosed() {
        if (!this.settings.get("internet")) {
            return INTERNET_CLOSED;
        }

        return this.settings.get("funnel") ? null : "This server isn't reached through a tunnel.";
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

    /** Where the internet reaches it now: its secure addresses (with a certificate), and Funnel's (through the tunnel). */
    internetAddresses() {
        return [...(this.internetClosed ? [] : this.secureAddresses()), ...(!this.tunnelClosed && this.funnel?.url ? [this.funnel.url] : [])];
    }

    /**
     * The game's page as invite links give it (manage.js invite): at the server's internet address,
     * so that it works anywhere (`everywhere`); or, closed to the internet, at its address on the
     * Wi-Fi (an IPv4 one first: every phone finds those). Returns { page, everywhere }.
     */
    invitePage() {
        const internet = this.internetAddresses()[0];

        if (internet) {
            return { page: `${internet}/`, everywhere: true };
        }

        const home = this.addresses();

        return { page: `${home.find((address) => /\/\/\d+\.\d+\.\d+\.\d+:/.test(address)) ?? home[0]}/`, everywhere: false };
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
    async createWorld({ name, description = "", seed, race, heroes = "kept", firstHero = "new", characters = null, settings = {} }, { creator = null } = {}) {
        if (characters !== null && !CHARACTER_RULES.includes(characters)) {
            throw new Error(`A world's characters are ${CHARACTER_RULES.join(", ")}, not ${JSON.stringify(characters)}.`);
        }

        // (Its character rule, if it's given one, as the heroes mode and first-hero rule it stands for)
        const modes = characters ? RULE_MODES[characters] : { heroes, firstHero };

        return this.adopt(await this.store.create({ name, description, seed, race, creator, ...modes, settings }), { creator });
    }

    /**
     * A world kept in the store (made, or brought in: manage.js importWorld) taken on: its access
     * opened, and an owner's key and a player's key made. Returns { world, ownerKey, playerKey }.
     */
    async adopt(stored, { creator = null } = {}) {
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
        // (Its certificate's set on it when there's one: loadCertificate. A handshake gets as long as
        // headers do. A certificate authority's TLS-ALPN-01 check asks by the reverse name of the
        // address it's checking, for acme-tls/1 alone: it's answered with that check's own
        // certificate, and let go once the handshake's done)
        this.https = https.createServer(
            {
                ...limits,
                minVersion: "TLSv1.2",
                handshakeTimeout: LIMITS_HTTP.headers,
                SNICallback: (servername, done) => done(null, this.challenges.get(servername)),
                ALPNCallback: ({ servername, protocols }) => (protocols.includes(ACME_TLS) && this.challenges.has(servername) ? ACME_TLS : protocols.includes("http/1.1") ? "http/1.1" : undefined),
            },
            handle,
        );
        this.https.on("tlsClientError", (error, socket) => socket.destroy());
        this.https.on("secureConnection", (socket) => {
            if (socket.alpnProtocol === ACME_TLS) {
                socket.end();
            }
        });
        this.tcp = net.createServer((socket) => this.#sort(socket));
        await new Promise((resolve, reject) => {
            this.tcp.once("error", reject);
            this.tcp.listen(port, host, resolve);
        });
        this.port = this.tcp.address().port;
        this.host = host;

        // (The halves never listen themselves, the port does: told it's listening, each keeps its
        // request and header time limits, which an HTTP server starts checking only then)
        this.http.emit("listening");
        this.https.emit("listening");
        await this.loadCertificate();
        this.play = attachPlay([this.http, this.https], this, { others: [BROKER_PATH] });
        this.broker = attachBroker([this.http, this.https], this, this.ice ? { ice: this.ice } : {});
        this.looking = setInterval(() => this.loadCertificate(), CERTIFICATE_LOOK);
        this.looking.unref?.();
        this.certifier.start();
        this.certifier.renew().catch(() => {});
        this.followRouter();
        this.followFunnel();

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

            // (The server reaching itself by its public address: router.js check)
            if (!socket.tunnel && chunk.subarray(0, HAIRPIN.length).toString("latin1") === HAIRPIN) {
                this.hairpins.get(chunk.subarray(HAIRPIN.length).toString("latin1").trim())?.();
                drop();

                return;
            }

            // (A tunnel's are plain: its TLS was the tunnel's own)
            if (secure && (socket.tunnel || (!this.certificate && !this.challenges.size))) {
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

    /**
     * A certificate authority's TLS-ALPN-01 check answered for `address` (RFC 8737, RFC 8738): a
     * certificate of its own naming the address and carrying the key authorization's SHA-256,
     * given to a TLS connection that asks by the address's reverse name for acme-tls/1. Returns
     * what stops answering it.
     */
    answerChallenge(address, keyAuthorization) {
        const { privateKey } = newKey();
        const name = reverseNameOf(address);
        const context = tls.createSecureContext({ key: pemOfKey(privateKey), cert: pem("CERTIFICATE", selfSigned({ key: privateKey, names: [address], hours: 1, acme: keyAuthorization })) });

        this.challenges.set(name, context);

        return () => this.challenges.delete(name);
    }

    /** The router asked to let the internet in, or not: while the internet's answered and the `router` setting's on. */
    followRouter() {
        return this.router?.follow(this.settings.get("internet") && this.settings.get("router") && this.port !== null).catch(() => {});
    }

    /**
     * A second listener for the same connections, on any free port: where the router sends the
     * internet's 443 while the certificate's for the IP address (PCP and NAT-PMP forward one outside
     * port to each inside one, and the play port has its own). Returns its port.
     */
    async secondPort() {
        if (!this.second) {
            const second = net.createServer((socket) => this.#sort(socket));

            await new Promise((resolve, reject) => {
                second.once("error", reject);
                second.listen(0, this.host, resolve);
            });
            this.second = second;
        }

        return this.second.address().port;
    }

    /** Tailscale Funnel asked for, or let go, and the tunnel listener with it: while the internet's answered and the `funnel` setting's on. */
    async followFunnel() {
        const on = Boolean(this.settings.get("internet") && this.settings.get("funnel") && this.port !== null);

        this.tunnelError = null;

        if (on) {
            await this.listenTunnel().catch((error) => {
                this.tunnelError = error.code === "EADDRINUSE" ? `The tunnel's port on this computer (${this.tunnelPortGiven ?? this.settings.get("tunnelPort")}) is taken by something else: choose another in Settings.` : `The tunnel's listener couldn't open: ${error.message}`;
            });
        }

        await this.funnel?.follow(on && this.tunnel !== null).catch(() => {});

        if (!on) {
            await this.closeTunnel();
        }
    }

    /**
     * The tunnel listener, on this computer alone (127.0.0.1, its `tunnelPort` setting unless given;
     * 0 for any free one): where a tunnel brings the internet. Everything that comes there is the
     * internet's. Returns its port.
     */
    async listenTunnel(port = this.tunnelPortGiven ?? this.settings.get("tunnelPort")) {
        if (!this.tunnel) {
            const tunnel = net.createServer((socket) => {
                socket.tunnel = true;
                this.#sort(socket);
            });

            await new Promise((resolve, reject) => {
                tunnel.once("error", reject);
                tunnel.listen(port, "127.0.0.1", resolve);
            });
            this.tunnel = tunnel;
            this.tunnelPort = tunnel.address().port;
            this.#reach();
        }

        return this.tunnelPort;
    }

    /** The tunnel listener closed, and everyone in through it sent out. */
    async closeTunnel() {
        if (this.tunnel) {
            const tunnel = this.tunnel;

            this.tunnel = null;
            this.closePlaces((place) => place.tunnel, "internet-closed");
            this.broker?.closeWhere((socket) => socket.tunnel);
            await new Promise((resolve) => tunnel.close(() => resolve()));

            for (const socket of this.connections) {
                if (socket.tunnel) {
                    socket.destroy();
                }
            }
        }
    }

    /** What it answers to has changed (Funnel's name came or went): its names and pages worked out again. */
    reachChanged() {
        this.#reach();
    }

    /** Whether the server reaches itself at `address`:`port` (through the router, its public address) within `within` ms. */
    async hairpin(address, port, within = 3000) {
        const token = randomBytes(12).toString("base64url");
        const seen = new Promise((resolve) => this.hairpins.set(token, () => resolve(true)));
        const socket = net.connect({ host: address, port });
        let timer;

        socket.on("error", () => {});
        socket.write(`${HAIRPIN}${token}\n`);

        const reached = await Promise.race([seen, new Promise((resolve) => (timer = setTimeout(() => resolve(false), within)))]);

        clearTimeout(timer);
        this.hairpins.delete(token);
        socket.destroy();

        return reached;
    }

    /** If the internet isn't answered now (directly, or through the tunnel), everyone in from there that way sent out ("internet-closed"). Returns how many. */
    closeToInternet() {
        const direct = Boolean(this.internetClosed);
        const tunnel = Boolean(this.tunnelClosed);

        if (!direct && !tunnel) {
            return 0;
        }

        const closing = (one) => one.from === "internet" && (one.tunnel ? tunnel : direct);

        this.broker?.closeWhere(closing);

        return this.closePlaces(closing, "internet-closed");
    }

    // The names it answers to and the pages it answers (guards.js): its own, its certificate's, and
    // the game's; and the pages of the servers it's found near it on the Wi-Fi, each by its exact
    // address (the game from any of them plays here too)
    #reach() {
        if (this.port === null) {
            return;
        }

        this.hosts = hostsOf(this.port, { names: [...this.names, ...(this.certificate?.names ?? [])], ...(this.interfaces ? { interfaces: this.interfaces } : {}), hostname: this.hostname });

        // (Through the tunnel: Funnel's name, as browsers send it on 443, or the tunnel's own
        // address, should the tunnel not pass the name on)
        const funnel = this.funnel?.name ?? null;

        this.tunnelHosts = new Set([...(funnel ? [funnel, `${funnel}:443`] : []), ...(this.tunnelPort ? [`127.0.0.1:${this.tunnelPort}`, `localhost:${this.tunnelPort}`] : [])]);

        const own = originsOf(this.hosts, funnel ? [`https://${funnel}`] : []);

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
            const { from } = guard(connectionOf(request, { origin: undefined }), this);

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
        this.updater.close();
        this.nearby.stop();
        await this.certifier.close();
        await this.router?.close();
        await this.funnel?.close();
        await this.closeTunnel();
        this.second?.close();
        this.play?.close("server-stopping");
        this.broker?.close();
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
