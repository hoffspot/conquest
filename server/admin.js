// The management page on the server's own computer (generated/world_server_plan.md §7.3, §10,
// §13): a listener of its own, on loopback alone (127.0.0.1, the adminPort setting: 8481), that
// nothing else reaches. Being at the computer is the proof: it needs no key. It's never the play
// port, since a tunnel (Tailscale Funnel) delivers the internet to the play port from localhost.
//
// Its guards, as the play port's (guards.js) and more:
// - from loopback alone;
// - its Host one of its own two names (localhost and 127.0.0.1, with its port), so a page whose
//   name points at 127.0.0.1 can't reach it (DNS rebinding);
// - its Origin, if a browser's, its own;
// - every API call carrying a header of its own (ADMIN_HEADER: a page on another site can't send
//   one without asking first, and is never answered) and the cookie the page was given as it
//   loaded (ADMIN_COOKIE: SameSite=Strict, so another site's page never sends it), so another
//   website open on the computer can't drive it.
//
// It serves the management page (client/admin.html) at /, the game's own files it needs, and
// /api/v1 (api.js) as the server's admin.

import { randomBytes } from "node:crypto";
import http from "node:http";
import { plainAddress } from "./access/addresses.js";
import { API_PATH, apiHandler } from "./api.js";
import { answer, LIMITS_HTTP, Refusal, urlOf } from "./guards.js";

/** The header every management call carries, and what it says. */
export const ADMIN_HEADER = "x-pellagos";
export const ADMIN_VALUE = "manage";

/** The cookie the management page is given as it loads, which every call on the computer's own listener carries. */
export const ADMIN_COOKIE = "pellagos-admin";

/** The management page, among the game's files. */
export const ADMIN_PAGE = "/admin.html";

/** The names the computer's own listener answers to on `port` (as a Host header carries them). */
export function adminHostsOf(port) {
    return new Set([`localhost:${port}`, `127.0.0.1:${port}`]);
}

/** A request's cookie by `name`, or null. */
export function cookieOf(request, name) {
    for (const part of String(request.headers.cookie ?? "").split(";")) {
        const [key, ...value] = part.trim().split("=");

        if (key === name) {
            return value.join("=");
        }
    }

    return null;
}

/**
 * The management page's listener on the computer itself, for the world server (`server`:
 * world-server.js WorldServer), listening on `port` (0: any free one) at 127.0.0.1. Returns
 * { http, port, close() } once it's listening.
 */
export async function listenAdmin(server, port) {
    const token = randomBytes(24).toString("base64url");
    const api = apiHandler(server, { mac: true });
    const listener = http.createServer({ requestTimeout: LIMITS_HTTP.request, headersTimeout: LIMITS_HTTP.headers, keepAliveTimeout: LIMITS_HTTP.keepAlive }, (request, response) => {
        try {
            const from = plainAddress(request.socket.remoteAddress);

            if (from !== "127.0.0.1" && from !== "::1") {
                throw new Refusal(403, "mac", "The management page answers this computer alone.");
            }

            if (!hosts.has(String(request.headers.host ?? "").toLowerCase())) {
                throw new Refusal(421, "host", "That isn't one of this page's names.");
            }

            const origin = request.headers.origin;

            if (origin !== undefined && !origins.has(origin)) {
                throw new Refusal(403, "origin", "Pages from there may not use the management page.");
            }

            const pathname = urlOf(request.url)?.pathname;

            if (pathname === undefined) {
                throw new Refusal(400, "bad-request", "That isn't an address here.");
            }

            if (pathname === API_PATH || pathname.startsWith(`${API_PATH}/`)) {
                if (request.headers[ADMIN_HEADER] !== ADMIN_VALUE || cookieOf(request, ADMIN_COOKIE) !== token) {
                    throw new Refusal(403, "csrf", "Management calls come from the management page itself: open it again.");
                }

                api(request, response);

                return;
            }

            // (The page itself, given what its calls must carry)
            if (pathname === "/" || pathname === ADMIN_PAGE) {
                request.url = ADMIN_PAGE;
                response.setHeader("Set-Cookie", `${ADMIN_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict`);
                response.setHeader("Cache-Control", "no-store");
            }

            server.static(request, response);
        } catch (error) {
            if (!(error instanceof Refusal)) {
                throw error;
            }

            answer(response, error.status, { error: error.error, message: error.message });
        }
    });

    await new Promise((resolve, reject) => {
        listener.once("error", reject);
        listener.listen(port, "127.0.0.1", resolve);
    });

    const bound = listener.address().port;
    const hosts = adminHostsOf(bound);
    const origins = new Set([...hosts].map((host) => `http://${host}`));

    return {
        http: listener,
        port: bound,
        async close() {
            listener.closeAllConnections?.();
            await new Promise((resolve) => listener.close(() => resolve()));
        },
    };
}
