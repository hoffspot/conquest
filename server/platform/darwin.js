// macOS (generated/world_server_plan.md §5, §11): the data in Application Support and the logs
// in Logs, each in a folder named by the server's id; what can be made again in Caches.

import path from "node:path";
import { APP_ID } from "./names.js";

/** Where the server keeps things: { data, logs, cache }. */
export function folders({ home }) {
    const library = path.posix.join(home, "Library");

    return {
        data: path.posix.join(library, "Application Support", APP_ID),
        logs: path.posix.join(library, "Logs", APP_ID),
        cache: path.posix.join(library, "Caches", APP_ID),
    };
}
