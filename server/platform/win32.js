// Windows: the data in the roaming application data (%APPDATA%), the logs and caches in the local
// one (%LOCALAPPDATA%), each in a folder named for the server; under the home folder where
// Windows keeps them if they aren't set.

import path from "node:path";
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
