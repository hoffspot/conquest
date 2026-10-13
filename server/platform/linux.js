// Linux, and any other system this has no file of its own for: the XDG base directories (the
// data in $XDG_DATA_HOME, the logs in $XDG_STATE_HOME, the caches in $XDG_CACHE_HOME), each
// where the specification puts it under the home folder if it isn't set (or isn't absolute).

import path from "node:path";
import { APP_FOLDER } from "./names.js";

// An XDG folder: as set, if it's an absolute path; else its default under the home folder
const base = (env, name, home, fallback) => (path.posix.isAbsolute(env[name] ?? "") ? env[name] : path.posix.join(home, ...fallback));

/** Where the server keeps things: { data, logs, cache }. */
export function folders({ env, home }) {
    return {
        data: path.posix.join(base(env, "XDG_DATA_HOME", home, [".local", "share"]), APP_FOLDER),
        logs: path.posix.join(base(env, "XDG_STATE_HOME", home, [".local", "state"]), APP_FOLDER, "logs"),
        cache: path.posix.join(base(env, "XDG_CACHE_HOME", home, [".cache"]), APP_FOLDER),
    };
}
