// Windows: the data in the roaming application data (%APPDATA%), the logs and caches in the local
// one (%LOCALAPPDATA%), each in a folder named for the server; under the home folder where
// Windows keeps them if they aren't set. Keeping it awake needs SetThreadExecutionState, which
// Node can't call without native code: not yet. Nor Bonjour, which Windows has only as Apple's
// own installer, nor the router's address (the router's protocols then go unasked).

import path from "node:path";
import { refusedHandle } from "./bonjour.js";
import { APP_NAME } from "./names.js";

/** Where the server keeps things: { data, logs, cache }. */
export function folders({ env, home }) {
    const roaming = env.APPDATA || path.win32.join(home, "AppData", "Roaming");
    const local = env.LOCALAPPDATA || path.win32.join(home, "AppData", "Local");

    return {
        data: path.win32.join(roaming, APP_NAME),
        logs: path.win32.join(local, APP_NAME, "Logs"),
        cache: path.win32.join(local, APP_NAME, "Cache"),
    };
}

/** The machine kept from sleeping while players are in: not yet on Windows. Returns { command, stop() }. */
export function keepAwake() {
    return { command: null, stop: () => {} };
}

/** The computer's own name apart from its host name: not on Windows. */
export function computerName() {
    return Promise.resolve(null);
}

/** Bonjour on Windows: not yet (each handle refused, saying so). */
export function bonjour() {
    return {
        advertise: () => refusedHandle("unsupported"),
        browse: () => refusedHandle("unsupported"),
        resolve: () => Promise.reject({ code: "unsupported", message: "Bonjour isn't supported on Windows yet." }),
    };
}

/** The default gateways: not yet on Windows. */
export function gateways() {
    return Promise.resolve({ v4: null, v6: null });
}
