// The world server's HTTP API (generated/world_server_plan.md §12.1), at API_PATH: JSON in and
// out, errors as { error, message }, keys and sessions in headers or bodies (never in a query
// string), and answers to the game's own calls given across origins to the pages allowed
// (guards.js), so the game works from GitHub Pages as well as from the server.
//
//   GET    /status                          the server's card: its id, versions, addresses, listed worlds
//   GET    /health                          "ok", or "slow" if any world's steps are
//   POST   /enter {world, key?, ticket?}    into a world: { session, ticket?, role, world, card (as
//                                           /status lists it), player, heroes, life, position }
//   POST   /codes/redeem {code}             a short code traded for { world, key }, then as /enter
//   GET    /worlds                          listed worlds, and the caller's own (a session or the admin key)
//   POST   /worlds {name, seed?, race...}   a world made (a creator key or the admin key): { world, ownerKey, playerKey }
//   GET    /worlds/:id/keys                 its keys (owners)
//   POST   /worlds/:id/keys {label, role, expires?, uses?}            a key made: { key, record }
//   DELETE /worlds/:id/keys/:key            a key revoked (its players' sockets closed, "key-revoked")
//   POST   /worlds/:id/keys/:key/replace    a key replaced: { key, record }
//   POST   /worlds/:id/codes {key, minutes?, uses?}                   a short code made: { code, record }
//
// Who's asking comes from `Authorization: Bearer <session>` (a session /enter gave), or
// `Authorization: Key <key>` (the admin key, or a creator key), or a key in the body.

import { randomInt } from "node:crypto";
import { NET_VERSION } from "../client/js/core/netplay.js";
import { RACE } from "../client/js/core/worldplan/plan.js";
import { Rate } from "./access/limits.js";
import { REFUSED } from "./access/policy.js";
import { answer, bodyOf, guard, Refusal, urlOf } from "./guards.js";
import { PLAY_PATH, PLAY_PROTOCOL } from "./play.js";
import { SERVER_VERSION } from "./storage/versions.js";

/** Where on the server the API is. */
export const API_PATH = "/api/v1";

/** How many times a minute one address may ask for the server's card. */
export const STATUS_PER_MINUTE = 60;

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
 * WorldServer). Returns a function (request, response) that answers.
 */
export function apiHandler(server) {
    const { access, registry } = server;
    const { policy } = access;
    const status = new Rate(STATUS_PER_MINUTE);

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
            throw refuse("version", { message: "That world's played in another version of the game: open it from the server's own page." });
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

    // The owner's (or a trusted player's) principal for a world's management, from a session
    const managing = (request, world, action, target = {}) => {
        if (!server.metaOf(world)) {
            throw refuse("no-world");
        }

        const { session, key } = credentials(request);
        const { principal } = policy.identify({ world, session, key, address: request.address, from: request.from });
        const allowed = policy.allows(principal, action, { world, meta: server.metaOf(world), ...target });

        if (!allowed.yes) {
            policy.on("refused", { why: allowed.why, world, address: request.address });
            throw refuse(allowed.why);
        }

        return principal;
    };

    const routes = [
        ["GET", /^\/status$/, async (request) => {
            if (!status.allow(request.address)) {
                throw refuse("wait", { message: "Asked too often: wait a moment." });
            }

            const listed = [...server.worlds.keys()].filter((id) => server.metaOf(id).settings.listed);

            return {
                server: { id: server.identity.id, publicKey: server.identity.publicKey, version: SERVER_VERSION, net: NET_VERSION, play: { path: PLAY_PATH, protocol: PLAY_PROTOCOL } },
                addresses: server.addresses(),
                worlds: listed.map(cardOf),
                nearby: [],
                players: [],
            };
        }],
        ["GET", /^\/health$/, async () => {
            const slow = registry.going.some((entry) => (entry.thread?.state?.steps?.p99 ?? 0) > 50);

            return { health: slow ? "slow" : "ok" };
        }],
        ["POST", /^\/enter$/, async (request, body) => {
            const { world } = body;

            if (typeof world !== "string" || !server.metaOf(world)) {
                throw refuse("no-world");
            }

            const { key, ticket, session } = credentials(request, body);
            const { principal } = policy.identify({ world, key, ticket, session, address: request.address, from: request.from });

            return enter(principal, world, body);
        }],
        ["POST", /^\/codes\/redeem$/, async (request, body) => {
            const redeemed = await access.redeem(body.code, { address: request.address });

            if (!redeemed.ok) {
                throw redeemed.reason === "wait" ? refuse("wait", { wait: Math.ceil(redeemed.wait / 1000) }) : refuse("code", { message: "That code doesn't open anything here (or no longer does)." });
            }

            const { principal } = policy.identify({ world: redeemed.world, key: redeemed.key, ticket: typeof body.ticket === "string" ? body.ticket : null, address: request.address, from: request.from });

            return { key: redeemed.key, ...(await enter(principal, redeemed.world, body)) };
        }],
        ["GET", /^\/worlds$/, async (request) => {
            const { session, key } = credentials(request);
            const { principal } = policy.identify({ session, key, address: request.address, from: request.from });

            if (principal.kind === "refused" || principal.kind === "anyone") {
                throw refuse(principal.why ?? "key");
            }

            const own = principal.kind === "admin" ? [...server.worlds.keys()] : principal.world ? [principal.world] : [];
            const ids = new Set([...[...server.worlds.keys()].filter((id) => server.metaOf(id).settings.listed), ...own]);

            return { worlds: [...ids].map(cardOf) };
        }],
        ["POST", /^\/worlds$/, async (request, body) => {
            const { session, key } = credentials(request, body);
            const { principal } = policy.identify({ session, key, address: request.address, from: request.from });
            const allowed = policy.allows(principal, "world.create");

            if (!allowed.yes) {
                policy.on("refused", { why: allowed.why, address: request.address });
                throw refuse(allowed.why);
            }

            if (!RACE[body.race]) {
                throw new Refusal(400, "bad-request", `There's no people called ${JSON.stringify(body.race)}.`);
            }

            try {
                return await server.createWorld({ ...body, seed: Number.isSafeInteger(body.seed) ? body.seed : randomInt(2 ** 31) }, { creator: principal.kind === "creator" ? principal.creator.label : "the server's admin" });
            } catch (error) {
                throw new Refusal(400, "bad-request", error.message);
            }
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
    ];

    return async (request, response) => {
        const origin = request.headers.origin;
        let allowedOrigin = null;

        try {
            request.address = guard({ address: request.socket.remoteAddress, host: request.headers.host, origin }, server);
            request.from = "home";
            allowedOrigin = origin ?? null;

            const url = urlOf(request.url);

            if (!url) {
                throw new Refusal(400, "bad-request", "That isn't an address on this server.");
            }

            if (url.search) {
                throw new Refusal(400, "bad-request", "Nothing goes in an address's query here.");
            }

            const route = url.pathname.slice(API_PATH.length) || "/";

            if (request.method === "OPTIONS") {
                response.writeHead(204, {
                    ...(allowedOrigin ? { "Access-Control-Allow-Origin": allowedOrigin, Vary: "Origin" } : {}),
                    "Access-Control-Allow-Methods": "GET, POST, DELETE",
                    "Access-Control-Allow-Headers": "Content-Type, Authorization",
                    "Access-Control-Max-Age": "600",
                });
                response.end();

                return;
            }

            for (const [method, pattern, handle] of routes) {
                const matched = pattern.exec(route);

                if (matched && method === request.method) {
                    const body = method === "GET" || method === "DELETE" ? {} : await bodyOf(request);

                    answer(response, 200, await handle(request, body, matched), { origin: allowedOrigin });

                    return;
                }
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
