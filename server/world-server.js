// The world server (generated/world_server_plan.md §2): its supervisor, on the main thread. It
// owns everything durable (the data folder, the worlds and who may come into them, the server's
// identity) and the network edge (the one port: the game's own files, /api/v1 and the play
// socket), and runs each world in a thread of its own (registry.js). It never steps a world.
//
// For now the port answers home addresses alone, over plain http and ws (guards.js); the internet
// gets TLS on the same port with S6.

import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isHome } from "./access/addresses.js";
import { ServerIdentity } from "./access/identity.js";
import { Access } from "./access/index.js";
import { API_PATH, apiHandler } from "./api.js";
import { answer, guard, hostsOf, LIMITS_HTTP, originsOf, Refusal, urlOf } from "./guards.js";
import { attachPlay } from "./play.js";
import { Registry } from "./registry.js";
import { createStaticHandler } from "./static.js";
import { DataFolder } from "./storage/folder.js";

const CLIENT_DIRECTORY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../client");

// What's journalled of each event the access hooks are told of (keys by their labels, never as they are)
const JOURNAL = Object.freeze({
    entered: ({ player, role, label, new: first }) => `${first ? "A new player" : "A player"} (${player}) came in, as ${role === "owner" ? "an owner" : `a ${role}`}, by the key "${label}".`,
    left: ({ player }) => `A player (${player}) left.`,
    keyIssued: ({ label, role, by }) => `A ${role}'s key, "${label}", was made${by ? ` by ${by}` : ""}.`,
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
     * its admin key (`adminKey`, shown then alone) and identity. `options` are for the tests:
     * `cost` (short codes' hashing), `clock`, `awake` (keeping the machine awake), `interfaces`
     * and `hostname` (the machine's), `clientDirectory`.
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

    constructor({ root, folder, access, identity, adminKey = null, awake, interfaces = null, hostname = os.hostname(), clientDirectory = CLIENT_DIRECTORY, names = [] }) {
        Object.assign(this, { root, folder, access, identity, adminKey, interfaces, hostname, names });
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
        this.api = apiHandler(this);
        this.access.policy.listeners.push((event, detail) => this.#journal(event, detail));

        /** The HTTP server and the play socket on it, once it's listening; the port it listens on. */
        this.http = null;
        this.play = null;
        this.port = null;
        this.hosts = new Set();
        this.origins = new Set();
    }

    async #add(stored) {
        this.worlds.set(stored.id, stored);
        await this.access.addWorld(stored.id, stored.folder);
    }

    /** The addresses-blocked-a-while list (the guards ask it). */
    get blocks() {
        return this.access.blocks;
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
        this.http = http.createServer({ requestTimeout: LIMITS_HTTP.request, headersTimeout: LIMITS_HTTP.headers, keepAliveTimeout: LIMITS_HTTP.keepAlive }, (request, response) => this.#request(request, response));
        await new Promise((resolve, reject) => {
            this.http.once("error", reject);
            this.http.listen(port, host, resolve);
        });
        this.port = this.http.address().port;
        this.hosts = hostsOf(this.port, { names: this.names, ...(this.interfaces ? { interfaces: this.interfaces } : {}), hostname: this.hostname });
        this.origins = originsOf(this.hosts);
        this.play = attachPlay(this.http, this);

        return this.port;
    }

    // A request: the API's, or one of the game's own files (both behind the guards)
    #request(request, response) {
        const pathname = urlOf(request.url)?.pathname;

        if (pathname === API_PATH || pathname?.startsWith(`${API_PATH}/`)) {
            this.api(request, response);

            return;
        }

        try {
            guard({ address: request.socket.remoteAddress, host: request.headers.host, origin: undefined }, this);

            if (pathname === undefined) {
                throw new Refusal(400, "bad-request", "That isn't an address on this server.");
            }
        } catch (error) {
            if (error instanceof Refusal) {
                answer(response, error.status, { error: error.error, message: error.message });

                return;
            }

            throw error;
        }

        this.static(request, response);
    }

    /** Stopped: everyone told, every world saved and set aside, the port closed. */
    async close() {
        this.play?.close("server-stopping");
        await this.registry.shutdown();

        if (this.http) {
            this.http.closeAllConnections?.();
            await new Promise((resolve) => this.http.close(() => resolve()));
        }
    }
}
