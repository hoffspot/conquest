// The world server's HTTP API (generated/world_server_plan.md §12.1), at API_PATH: JSON in and
// out, errors as { error, message }, keys and sessions in headers or bodies (never in a query
// string), and answers to the game's own calls given across origins to the pages allowed
// (guards.js), so the game works from GitHub Pages as well as from the server.
//
//   GET    /status                          the server's card: its id, versions, addresses (home and
//                                           internet), where the caller seems to be (you), listed worlds
//   POST   /reachability {results}          what a game found reaching it from elsewhere ("Test this
//                                           server"): kept for the management page (manage.js report)
//   GET    /health                          "ok", or "slow" if any world's steps are
//   POST   /enter {world, key?, ticket?}    into a world: { session, ticket?, role, world, card (as
//                                           /status lists it), player, heroes, life, position }
//   POST   /codes/redeem {code}             a short code traded for { world, key }, then as /enter
//   GET    /worlds                          listed worlds, and the caller's own (a session or the admin key)
//   POST   /worlds {name, seed?, race...}   a world made (a creator key or the admin key): { world, ownerKey, playerKey }
//   POST   /worlds/import (a world's file)  a world brought in from an export (manage.js importWorld; a creator key or the admin key)
//   GET    /worlds/:id/keys                 its keys (owners)
//   POST   /worlds/:id/keys {label, role, expires?, uses?}            a key made: { key, record }
//   DELETE /worlds/:id/keys/:key            a key revoked (its players' sockets closed, "key-revoked")
//   POST   /worlds/:id/keys/:key/replace    a key replaced: { key, record }
//   POST   /worlds/:id/codes {key, minutes?, uses?}                   a short code made: { code, record }
//
// A world's owner's (or the admin's) management of it (manage.js), the management page's:
//
//   GET    /worlds/:id                      all its owner's shown of it, and how it is in words
//   PATCH  /worlds/:id {name?, description?, heroes?, firstHero?, settings?}   changed (its heroes mode only while it's set aside)
//   DELETE /worlds/:id {confirm}            deleted, its name typed (its backups kept)
//   POST   /worlds/:id/start, /aside, /save                          its life
//   POST   /worlds/:id/keys/:key/show       a key that works, shown again: { key }
//   DELETE /worlds/:id/codes/:code          a short code revoked
//   GET    /worlds/:id/players              its players; POST …/players/:p/kick, /ban, /unban, /role {role}, /ticket
//   GET    /worlds/:id/backups              its backups; POST makes one; POST …/backups/:b/restore; GET …/backups/:b/download
//   GET    /worlds/:id/export               the world as one file (manage.js EXPORT_FORMAT)
//   POST   /worlds/:id/afresh               one that can't be carried on started afresh from its seed, its war and heroes kept
//
// The server's, its admin's alone, from the computer itself or its Wi-Fi (never the internet),
// answered to the server's own pages alone, each call carrying the management header (admin.js):
//
//   POST   /server/session                  the admin key traded for a session (the page, from the Wi-Fi)
//   GET    /server                          its overview, settings (and what each is), the worlds' rules and peoples
//   PATCH  /server {settings}               settings changed
//   GET    /server/worlds                   every world, as GET /worlds/:id
//   GET    /server/journal, /server/health  what's happened; how it's keeping up
//   GET, POST {label}, DELETE /server/creators[/:id]                  creator keys
//   PUT    /server/certificate {key, cert}  a certificate of the owner's own (PEM) put in; DELETE takes it out
//   GET    /server/certificate/acme         what a free certificate needs: routes, DNS hosts, the CA's terms
//   POST   /server/certificate/acme {route, name?, host?, token?, address?, email?, agree}   a free one's
//          route set up (certify.js), one asked for at once; POST …/acme/renew asks now; DELETE forgets it
//   POST   /server/router                   the router asked again to let the internet in (router.js)
//   POST   /server/funnel                   Tailscale Funnel asked for again (funnel.js)
//   GET    /server/update                   how updating stands: the version, a newer one, the last update (update/updater.js)
//   POST   /server/update {check} | {version}   asked again whether there's a newer one; or updated to it
//   POST   /server/admin-key, /server/stop  a new admin key; stopped (every world saved): on the computer itself alone
//   GET    /server/archive                  the whole server as one file (storage/archive.js), every world going saved first
//   POST   /server/archive/read (an archive's file)   read, and kept a while: { id, worlds, restorable, why }
//   POST   /server/archive/:id/worlds {worlds}        its worlds brought in as new ones: { results }
//   POST   /server/archive/:id/restore      put in place of everything here (a server with no worlds), the server started again
//
// Who's asking comes from `Authorization: Bearer <session>` (a session /enter gave), or
// `Authorization: Key <key>` (the admin key, or a creator key), or a key in the body; on the
// computer's own listener (admin.js), it's the server's admin.

import { randomInt } from "node:crypto";
import { NET_VERSION } from "../client/js/core/netplay.js";
import { RACE } from "../client/js/core/worldplan/plan.js";
import { plainAddress } from "./access/addresses.js";
import { Rate } from "./access/limits.js";
import { REFUSED } from "./access/policy.js";
import { BROKER_PATH, BROKER_PROTOCOL } from "./broker.js";
import { answer, bodyOf, bytesOf, connectionOf, guard, Refusal, urlOf } from "./guards.js";
import { ARCHIVE_LIMIT, IMPORT_LIMIT, Refused } from "./manage.js";
import { PLAY_PATH, PLAY_PROTOCOL } from "./play.js";
import { SETTINGS } from "./storage/settings.js";
import { SERVER_VERSION } from "./storage/versions.js";
import { WORLD_SETTINGS } from "./storage/worlds.js";

/** Where on the server the API is. */
export const API_PATH = "/api/v1";

/** How many times a minute one address may ask for the server's card, and report how reaching it went. */
export const STATUS_PER_MINUTE = 60;
export const REPORTS_PER_MINUTE = 6;

/** The header every server-management call carries, and what it says (admin.js: a page on another site can't send it unasked). */
export const MANAGE_HEADER = "x-pellagos";
export const MANAGE_VALUE = "manage";

/** A file to download, as a route answers it (an export, a backup). */
export class Download {
    constructor(name, body, type = "application/gzip") {
        Object.assign(this, { name, body, type });
    }
}

// What each refusal is, as HTTP says it
const STATUS = Object.freeze({ "no-world": 404, key: 401, banned: 403, locked: 403, home: 403, role: 403, full: 409, version: 409, code: 401, wait: 429 });

const refuse = (why, extra = {}) => new Refusal(STATUS[why] ?? 403, why, REFUSED[why] ?? extra.message ?? "That can't be done.", extra);

// Who's asking, from the request's headers (and a key in its body, if there's one)
function credentials(request, body = {}) {
    const [scheme, value] = String(request.headers.authorization ?? "").split(" ");

    return {
        session: scheme === "Bearer" ? value : null,
        key: scheme === "Key" ? value : typeof body.key === "string" ? body.key : null,
        ticket: typeof body.ticket === "string" ? body.ticket : null,
    };
}

/**
 * The API's handler (for requests under API_PATH), over the world server (`server`: world-server.js
 * WorldServer). `mac`: on the computer's own listener (admin.js, which has guarded it), where
 * whoever asks is the server's admin, and only management is answered. Returns a function
 * (request, response) that answers.
 */
export function apiHandler(server, { mac = false } = {}) {
    const { access, registry } = server;
    const { policy } = access;
    const status = new Rate(STATUS_PER_MINUTE);
    const reports = new Rate(REPORTS_PER_MINUTE);

    // Who's asking (a principal: access/policy.js), from what they showed, or the admin on the computer itself
    const principalOf = (request, { world = null, body = {} } = {}) => {
        if (request.from === "mac") {
            return { kind: "admin", from: "mac", address: request.address };
        }

        const { session, key, ticket } = credentials(request, body);

        return policy.identify({ world, session, key, ticket, address: request.address, from: request.from }).principal;
    };

    // Who did it, as the journals say it
    const byOf = (principal) => (principal.kind === "admin" ? (principal.from === "mac" ? "the admin, on the server's computer" : "the admin") : principal.admin ? "the admin" : (principal.player?.id ?? "an owner"));

    // A world's card, as a listing shows it: its name, home people, heroes, players in it now and their heroes' names
    const cardOf = (id) => {
        const meta = server.metaOf(id);
        const { life, state } = registry.lifeOf(id);

        return {
            id,
            name: meta.name,
            description: meta.description,
            race: meta.race,
            heroes: meta.heroes,
            firstHero: meta.firstHero,
            most: meta.settings.mostPlayers,
            players: state?.players.filter((one) => one.id).length ?? 0,
            life,
        };
    };

    // Into a world, for a principal the policy's identified: refused, or { session, ticket, role, world, card, player, heroes, life, position }
    const enter = async (principal, world, body) => {
        const meta = server.metaOf(world);
        const allowed = policy.allows(principal, "world.enter", { world, meta });

        if (!allowed.yes) {
            policy.on("refused", { why: allowed.why, world, address: principal.address });
            throw refuse(allowed.why);
        }

        if (body.net !== undefined && body.net !== NET_VERSION) {
            // (With its version, for the game to say which is the newer: netplay.js versionWords)
            throw refuse("version", { message: "That server plays another version of the game than yours: open the game from the server itself.", net: NET_VERSION, version: SERVER_VERSION });
        }

        const { state } = registry.lifeOf(world);

        if ((state?.players.filter((one) => one.id).length ?? 0) >= meta.settings.mostPlayers) {
            throw refuse("full", { message: "That world's full." });
        }

        const entered = await access.enter(principal);
        const heroes = meta.heroes === "kept" ? (await server.worlds.get(world).heroes.list(entered.player)).map(({ slot, name, race }) => ({ slot, name, race })) : [];
        const { life, position } = registry.lifeOf(world);

        return { ...entered, world, card: cardOf(world), heroes, life, position, play: { path: PLAY_PATH, protocol: PLAY_PROTOCOL } };
    };

    // The owner's (or a trusted player's, or the admin's) principal for a world's management
    const managing = (request, world, action, target = {}) => {
        if (!server.metaOf(world)) {
            throw refuse("no-world");
        }

        const principal = principalOf(request, { world });
        const allowed = policy.allows(principal, action, { world, meta: server.metaOf(world), ...target });

        if (!allowed.yes) {
            policy.on("refused", { why: allowed.why, world, address: request.address });
            throw refuse(allowed.why);
        }

        return principal;
    };

    // The server's admin's principal, for the server's management (from the computer or its Wi-Fi alone)
    const admin = (request) => {
        const principal = principalOf(request);
        const allowed = policy.allows(principal, "server.manage");

        if (!allowed.yes) {
            const { why } = allowed;

            policy.on("refused", { why, address: request.address });
            throw new Refusal(STATUS[why] ?? 403, why, why === "home" ? REFUSED.home : why === "key" ? "That isn't this server's admin key (or no longer is)." : "Only the server's admin can do that.");
        }

        return principal;
    };

    // A world's management, as manage.js does it: its refusals as the API's
    const doing = async (work) => {
        try {
            return await work();
        } catch (error) {
            if (error instanceof Refused) {
                throw new Refusal(error.status, error.error, error.message);
            }

            throw error;
        }
    };

    const { manage } = server;
    const WORLD = "([a-z0-9]{10})";
    const PLAYER = "([0-9A-Z]{10})";

    const routes = [
        ["GET", /^\/status$/, { game: true }, async (request) => {
            if (!status.allow(request.address)) {
                throw refuse("wait", { message: "Asked too often: wait a moment." });
            }

            const listed = [...server.worlds.keys()].filter((id) => server.metaOf(id).settings.listed);

            // (Where the caller seems to be: at the server's home if it came from there, or from the
            // home's own public address the long way round; the game tries home addresses first then)
            const router = server.router?.state();
            const atHome = request.from === "home" || (!request.tunnel && Boolean(request.address) && [router?.external, router?.seen].includes(request.address));

            return {
                server: {
                    id: server.identity.id,
                    name: server.name,
                    publicKey: server.identity.publicKey,
                    version: SERVER_VERSION,
                    net: NET_VERSION,
                    play: { path: PLAY_PATH, protocol: PLAY_PROTOCOL },
                    broker: server.broker && server.settings.get("broker") !== false ? { path: BROKER_PATH, protocol: BROKER_PROTOCOL, relaying: server.settings.get("relaying") !== false } : null,
                },
                addresses: [...server.addresses(), ...server.internetAddresses()],
                you: { address: request.address, from: request.from, home: atHome },
                worlds: listed.map(cardOf),
                nearby: server.nearby.list(),
                // (Players' own worlds listed on its broker, as this caller would see them)
                players: server.broker && server.settings.get("broker") !== false ? server.broker.seen({ address: request.address, from: request.from }) : [],
            };
        }],
        ["POST", /^\/reachability$/, { game: true }, async (request, body) => {
            if (!reports.allow(request.address)) {
                throw refuse("wait", { message: "Reported too often: wait a moment." });
            }

            return doing(() => manage.report(body, { address: request.address, from: request.from, tunnel: request.tunnel }));
        }],
        ["GET", /^\/health$/, { game: true }, async () => {
            const slow = registry.going.some((entry) => (entry.thread?.state?.steps?.p99 ?? 0) > 50);

            return { health: slow ? "slow" : "ok" };
        }],
        ["POST", /^\/enter$/, { game: true }, async (request, body) => {
            const { world } = body;

            if (typeof world !== "string" || !server.metaOf(world)) {
                throw refuse("no-world");
            }

            const { key, ticket, session } = credentials(request, body);
            const { principal } = policy.identify({ world, key, ticket, session, address: request.address, from: request.from });

            return enter(principal, world, body);
        }],
        ["POST", /^\/codes\/redeem$/, { game: true }, async (request, body) => {
            const redeemed = await access.redeem(body.code, { address: request.address });

            if (!redeemed.ok) {
                throw redeemed.reason === "wait" ? refuse("wait", { wait: Math.ceil(redeemed.wait / 1000) }) : refuse("code", { message: "That code doesn't open anything here (or no longer does)." });
            }

            const { principal } = policy.identify({ world: redeemed.world, key: redeemed.key, ticket: typeof body.ticket === "string" ? body.ticket : null, address: request.address, from: request.from });

            return { key: redeemed.key, ...(await enter(principal, redeemed.world, body)) };
        }],
        ["GET", /^\/worlds$/, async (request) => {
            const principal = principalOf(request);

            if (principal.kind === "refused" || principal.kind === "anyone") {
                throw refuse(principal.why ?? "key");
            }

            const own = principal.kind === "admin" ? [...server.worlds.keys()] : principal.world ? [principal.world] : [];
            const ids = new Set([...[...server.worlds.keys()].filter((id) => server.metaOf(id).settings.listed), ...own]);

            return { worlds: [...ids].map(cardOf) };
        }],
        ["POST", /^\/worlds$/, async (request, body) => {
            const principal = principalOf(request, { body });
            const allowed = policy.allows(principal, "world.create");

            if (!allowed.yes) {
                policy.on("refused", { why: allowed.why, address: request.address });
                throw refuse(allowed.why);
            }

            if (!RACE[body.race]) {
                throw new Refusal(400, "bad-request", `There's no people called ${JSON.stringify(body.race)}.`);
            }

            try {
                return await server.createWorld({ ...body, seed: Number.isSafeInteger(body.seed) ? body.seed : randomInt(2 ** 31) }, { creator: principal.kind === "creator" ? principal.creator.label : byOf(principal) });
            } catch (error) {
                throw new Refusal(400, "bad-request", error.message);
            }
        }],
        // (The file as it's sent, not JSON: a world's export, up to IMPORT_LIMIT)
        ["POST", /^\/worlds\/import$/, { raw: IMPORT_LIMIT }, async (request, bytes) => {
            const principal = principalOf(request, { body: {} });
            const allowed = policy.allows(principal, "world.create");

            if (!allowed.yes) {
                policy.on("refused", { why: allowed.why, address: request.address });
                throw refuse(allowed.why);
            }

            return doing(() => manage.importWorld(bytes, { by: byOf(principal), creator: principal.kind === "creator" ? principal.creator.label : byOf(principal) }));
        }],
        ["GET", /^\/worlds\/([a-z0-9]{10})\/keys$/, async (request, body, [, world]) => {
            managing(request, world, "key.issue");

            return { keys: access.world(world).keys(), codes: access.world(world).codes() };
        }],
        ["POST", /^\/worlds\/([a-z0-9]{10})\/keys$/, async (request, body, [, world]) => {
            const role = body.role ?? "player";
            const principal = managing(request, world, "key.issue", { role });
            const made = await access.issueKey(world, { label: body.label ?? null, role, uses: body.uses ?? null, expires: body.expires ? new Date(body.expires) : null }, { by: principal.player?.id ?? "the admin" });

            if (made.reason) {
                throw new Refusal(400, "bad-request", made.reason);
            }

            return made;
        }],
        ["DELETE", /^\/worlds\/([a-z0-9]{10})\/keys\/([0-9A-Z]{4})$/, async (request, body, [, world, id]) => {
            const principal = managing(request, world, "key.revoke");
            const { revoked } = await access.revokeKey(world, id, { by: principal.player?.id ?? "the admin" });

            if (!revoked) {
                throw new Refusal(404, "no-key", "There's no such key working in that world.");
            }

            server.closePlaces((place) => place.world === world && place.via === id, "key-revoked");

            return { revoked };
        }],
        ["POST", /^\/worlds\/([a-z0-9]{10})\/keys\/([0-9A-Z]{4})\/replace$/, async (request, body, [, world, id]) => {
            const principal = managing(request, world, "key.revoke");
            const { key, record } = await access.replaceKey(world, id, { by: principal.player?.id ?? "the admin" });

            if (!record) {
                throw new Refusal(404, "no-key", "There's no such key working in that world.");
            }

            server.closePlaces((place) => place.world === world && place.via === id, "key-revoked");

            return { key, record };
        }],
        ["POST", /^\/worlds\/([a-z0-9]{10})\/codes$/, async (request, body, [, world]) => {
            const principal = managing(request, world, "key.issue", { role: access.world(world)?.key(body.key)?.role });
            const made = await access.makeCode(world, { key: body.key, minutes: body.minutes, uses: body.uses }, { by: principal.player?.id ?? "the admin" });

            if (made.reason) {
                throw new Refusal(400, "bad-request", made.reason);
            }

            return made;
        }],

        // ---- A world's management (manage.js)

        ["GET", new RegExp(`^/worlds/${WORLD}$`), async (request, body, [, world]) => {
            managing(request, world, "world.manage");

            return doing(() => manage.details(world));
        }],
        ["PATCH", new RegExp(`^/worlds/${WORLD}$`), async (request, body, [, world]) => {
            const principal = managing(request, world, "world.manage");

            return doing(() => manage.change(world, body, { by: byOf(principal) }));
        }],
        ["DELETE", new RegExp(`^/worlds/${WORLD}$`), async (request, body, [, world]) => {
            const principal = managing(request, world, "world.delete");

            return doing(() => manage.delete(world, body.confirm, { by: byOf(principal) }));
        }],
        ["POST", new RegExp(`^/worlds/${WORLD}/(start|aside|save)$`), async (request, body, [, world, what]) => {
            const principal = managing(request, world, "world.manage");

            return doing(() => (what === "start" ? manage.start(world) : what === "aside" ? manage.setAside(world, `set aside by ${byOf(principal)}`) : manage.save(world)));
        }],
        ["POST", new RegExp(`^/worlds/${WORLD}/afresh$`), async (request, body, [, world]) => {
            const principal = managing(request, world, "world.manage");

            return doing(() => manage.startAfresh(world, { by: byOf(principal) }));
        }],
        ["POST", new RegExp(`^/worlds/${WORLD}/keys/([0-9A-Z]{4})/show$`), async (request, body, [, world, id]) => {
            managing(request, world, "world.manage");

            const key = access.world(world).showKey(id, new Date(access.clock()));

            if (!key) {
                throw new Refusal(404, "no-key", "There's no such key working in that world.");
            }

            return { key };
        }],
        ["DELETE", new RegExp(`^/worlds/${WORLD}/codes/([0-9A-Z]{6})$`), async (request, body, [, world, id]) => {
            managing(request, world, "key.revoke");

            return { revoked: await access.revokeCodes(world, [id]) };
        }],
        ["GET", new RegExp(`^/worlds/${WORLD}/players$`), async (request, body, [, world]) => {
            managing(request, world, "world.manage");

            return { players: await doing(() => manage.players(world)) };
        }],
        // (A player's heroes kept in a world, as a character file: one of theirs taken home, by them;
        // all of a player's, exported by the world's owner)
        ["GET", new RegExp(`^/worlds/${WORLD}/heroes/([1-9])$`), async (request, body, [, world, slot]) => {
            if (!server.metaOf(world)) {
                throw refuse("no-world");
            }

            const principal = principalOf(request, { world });

            if (principal.kind !== "player" || principal.world !== world || !principal.player) {
                throw refuse(principal.why ?? "key");
            }

            return doing(() => manage.heroesFile(world, principal.player.id, { slot: Number(slot) }));
        }],
        ["GET", new RegExp(`^/worlds/${WORLD}/players/${PLAYER}/heroes$`), async (request, body, [, world, player]) => {
            managing(request, world, "world.manage");

            const { name, text } = await doing(() => manage.heroesFile(world, player));
            // (Its name as a header carries it: a hero's accents let go of, "Élodie" as "Elodie")
            const plain = name.normalize("NFKD").replace(/[^\x20-\x7e]/g, "");

            // (Sent as bytes, not JSON: a file to keep, not an answer to read)
            return new Download(plain.startsWith(".") ? `heroes${plain}` : plain, Buffer.from(text), "application/octet-stream");
        }],
        ["POST", new RegExp(`^/worlds/${WORLD}/players/${PLAYER}/(kick|ban|unban|role|ticket)$`), async (request, body, [, world, player, what]) => {
            const principal = managing(request, world, { kick: "player.kick", ban: "player.ban", unban: "player.ban" }[what] ?? "world.manage");
            const by = byOf(principal);

            return doing(() => (what === "role" ? manage.role(world, player, body.role, { by }) : manage[what](world, player, { by })));
        }],
        ["GET", new RegExp(`^/worlds/${WORLD}/backups$`), async (request, body, [, world]) => {
            managing(request, world, "world.manage");

            return { backups: await doing(() => manage.backups(world)) };
        }],
        ["POST", new RegExp(`^/worlds/${WORLD}/backups$`), async (request, body, [, world]) => {
            managing(request, world, "world.manage");

            return { backups: await doing(() => manage.backUp(world)) };
        }],
        ["POST", new RegExp(`^/worlds/${WORLD}/backups/([A-Za-z0-9-]{1,64})/restore$`), async (request, body, [, world, backup]) => {
            const principal = managing(request, world, "world.manage");

            return doing(() => manage.restore(world, backup, { by: byOf(principal) }));
        }],
        ["GET", new RegExp(`^/worlds/${WORLD}/backups/([A-Za-z0-9-]{1,64})/download$`), async (request, body, [, world, backup]) => {
            managing(request, world, "world.manage");

            const { name, body: file } = await doing(() => manage.export(world, backup));

            return new Download(name, file);
        }],
        ["GET", new RegExp(`^/worlds/${WORLD}/export$`), async (request, body, [, world]) => {
            managing(request, world, "world.manage");

            const { name, body: file } = await doing(() => manage.export(world));

            return new Download(name, file);
        }],

        // ---- The server's management (its admin's)

        ["POST", /^\/server\/session$/, { server: true }, async (request) => {
            const principal = admin(request);

            return { session: access.sessionFor(principal) };
        }],
        ["GET", /^\/server$/, { server: true }, async (request) => {
            admin(request);

            return {
                overview: { ...manage.overview(), adminKey: request.from === "mac" ? (server.adminKey ?? null) : null, mac: request.from === "mac" },
                settings: manage.settings(),
                schema: SETTINGS,
                worldSchema: WORLD_SETTINGS,
                peoples: Object.entries(RACE).map(([id, { name }]) => ({ id, name })),
            };
        }],
        ["PATCH", /^\/server$/, { server: true }, async (request, body) => {
            const principal = admin(request);

            return doing(() => manage.changeSettings(body.settings ?? {}, { by: byOf(principal) }));
        }],
        ["GET", /^\/server\/worlds$/, { server: true }, async (request) => {
            admin(request);

            return { worlds: await manage.worlds() };
        }],
        ["GET", /^\/server\/journal$/, { server: true }, async (request) => {
            admin(request);

            return { activity: await manage.activity() };
        }],
        ["GET", /^\/server\/health$/, { server: true }, async (request) => {
            admin(request);

            return manage.health();
        }],
        ["GET", /^\/server\/creators$/, { server: true }, async (request) => {
            admin(request);

            return { creators: manage.creators() };
        }],
        ["POST", /^\/server\/creators$/, { server: true }, async (request, body) => {
            const principal = admin(request);

            return manage.issueCreator(body.label ?? null, { by: byOf(principal) });
        }],
        ["DELETE", /^\/server\/creators\/([0-9A-Z]{4})$/, { server: true }, async (request, body, [, id]) => {
            const principal = admin(request);

            return doing(() => manage.revokeCreator(id, { by: byOf(principal) }));
        }],
        ["PUT", /^\/server\/certificate$/, { server: true }, async (request, body) => {
            const principal = admin(request);

            return doing(() => manage.useCertificate(body, { by: byOf(principal) }));
        }],
        ["DELETE", /^\/server\/certificate$/, { server: true }, async (request) => {
            const principal = admin(request);

            return doing(() => manage.dropCertificate({ by: byOf(principal) }));
        }],
        ["GET", /^\/server\/certificate\/acme$/, { server: true }, async (request) => {
            admin(request);

            return manage.acmeChoices();
        }],
        ["POST", /^\/server\/certificate\/acme$/, { server: true }, async (request, body) => {
            const principal = admin(request);

            return doing(() => manage.setUpAcme(body, { by: byOf(principal) }));
        }],
        ["POST", /^\/server\/certificate\/acme\/renew$/, { server: true }, async (request) => {
            const principal = admin(request);

            return doing(() => manage.renewAcme({ by: byOf(principal) }));
        }],
        ["DELETE", /^\/server\/certificate\/acme$/, { server: true }, async (request) => {
            const principal = admin(request);

            return doing(() => manage.forgetAcme({ by: byOf(principal) }));
        }],
        ["POST", /^\/server\/router$/, { server: true }, async (request) => {
            admin(request);

            return doing(() => manage.askRouter());
        }],
        ["POST", /^\/server\/funnel$/, { server: true }, async (request) => {
            admin(request);

            return doing(() => manage.askFunnel());
        }],
        ["GET", /^\/server\/update$/, { server: true }, async (request) => {
            admin(request);

            return server.updater.state();
        }],
        ["POST", /^\/server\/update$/, { server: true }, async (request, body) => {
            const principal = admin(request);

            if (body?.check) {
                return server.updater.check();
            }

            return doing(() => server.updater.update({ version: String(body?.version ?? ""), by: byOf(principal) }));
        }],
        ["GET", /^\/server\/archive$/, { server: true }, async (request) => {
            const principal = admin(request);
            const { name, body: file } = await doing(() => manage.archive({ by: byOf(principal) }));

            return new Download(name, file);
        }],
        // (The file as it's sent, not JSON: an archive, up to ARCHIVE_LIMIT)
        ["POST", /^\/server\/archive\/read$/, { server: true, raw: ARCHIVE_LIMIT }, async (request, bytes) => {
            admin(request);

            return doing(() => manage.readArchive(bytes));
        }],
        ["POST", /^\/server\/archive\/([A-Za-z0-9_-]{12})\/(worlds|restore)$/, { server: true }, async (request, body, [, id, what]) => {
            const principal = admin(request);

            return doing(() => (what === "worlds" ? manage.bringInFromArchive(id, body?.worlds, { by: byOf(principal), creator: byOf(principal) }) : manage.restoreArchive(id, { by: byOf(principal) })));
        }],
        ["POST", /^\/server\/(admin-key|stop)$/, { server: true, mac: true }, async (request, body, [, what]) => {
            admin(request);

            if (what === "admin-key") {
                return manage.newAdminKey();
            }

            setTimeout(() => server.onStop?.(), 100);

            return { stopping: true };
        }],
    ];

    // Whether a page's origin is the server's own (one of its names, over http or https): not the game's on GitHub Pages
    const own = (origin) => mac || [...server.hosts].some((host) => origin === `http://${host}` || origin === `https://${host}`);

    return async (request, response) => {
        const origin = request.headers.origin;
        let allowedOrigin = null;

        try {
            if (mac) {
                request.address = plainAddress(request.socket.remoteAddress);
                request.from = "mac";
            } else {
                ({ address: request.address, from: request.from, tunnel: request.tunnel } = guard(connectionOf(request, { origin }), server));
                allowedOrigin = origin ?? null;
            }

            const url = urlOf(request.url);

            if (!url) {
                throw new Refusal(400, "bad-request", "That isn't an address on this server.");
            }

            if (url.search) {
                throw new Refusal(400, "bad-request", "Nothing goes in an address's query here.");
            }

            const route = url.pathname.slice(API_PATH.length) || "/";

            // (The server's management answers pages from the server alone: never the game's on GitHub Pages)
            const managed = route.startsWith("/server");

            if (managed && origin !== undefined && !own(origin)) {
                allowedOrigin = null;
            }

            if (request.method === "OPTIONS") {
                response.writeHead(204, {
                    ...(allowedOrigin ? { "Access-Control-Allow-Origin": allowedOrigin, Vary: "Origin" } : {}),
                    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE",
                    // (Never the management header: the server's own pages needn't ask, and no other's may send it)
                    "Access-Control-Allow-Headers": "Content-Type, Authorization",
                    "Access-Control-Max-Age": "600",
                });
                response.end();

                return;
            }

            for (const [method, pattern, ...rest] of routes) {
                const handle = rest.at(-1);
                const flags = rest.length > 1 ? rest[0] : {};
                const matched = pattern.exec(route);

                if (!matched || method !== request.method) {
                    continue;
                }

                // (The game's own calls aren't the management page's; the computer's own are on its listener alone)
                if ((flags.game && mac) || (flags.mac && !mac)) {
                    break;
                }

                if (flags.server) {
                    if (origin !== undefined && !own(origin)) {
                        throw new Refusal(403, "origin", "The server's management answers its own pages alone.");
                    }

                    if (request.headers[MANAGE_HEADER] !== MANAGE_VALUE) {
                        throw new Refusal(403, "csrf", "Management calls come from the management page itself.");
                    }
                }

                const body = method === "GET" ? {} : flags.raw ? await bytesOf(request, flags.raw) : await bodyOf(request);
                const answered = await handle(request, body, matched);

                if (answered instanceof Download) {
                    response.writeHead(200, {
                        "Content-Type": answered.type,
                        "Content-Length": answered.body.length,
                        "Content-Disposition": `attachment; filename="${answered.name.replace(/"/g, "")}"`,
                        "Cache-Control": "no-store",
                        ...(allowedOrigin ? { "Access-Control-Allow-Origin": allowedOrigin, Vary: "Origin" } : {}),
                    });
                    response.end(answered.body);

                    return;
                }

                answer(response, 200, answered, { origin: allowedOrigin });

                return;
            }

            throw new Refusal(404, "not-found", "There's nothing here by that name.");
        } catch (error) {
            if (!(error instanceof Refusal)) {
                console.error(error);
                answer(response, 500, { error: "broken", message: "Something went wrong on the server." }, { origin: allowedOrigin });

                return;
            }

            if (error.status === 400 || error.status === 404) {
                policy.on("refused", { why: error.error, address: request.address ?? request.socket.remoteAddress });
            }

            answer(response, error.status, { error: error.error, message: error.message, ...error.extra }, { origin: allowedOrigin });
        }
    };
}
