// Crash reports sent to a world server (docs/GAME.md *Crash reports*), unless the player's turned
// them off (Game options, Debug log: Send crash reports, on to start with). When the game falls
// over while the player's in a world on a world server (app/telemetry.js recover: a crash; app/
// rejoin.js: the world they were in, written moments before), the debug log as it then stood (the
// crash, and what was kept before it) waits on this device for that world (CRASH_REPORTS.key), and
// is sent to its server the next time they come into it, straight back in or later, for the
// server's admin to see (docs/SERVER.md *Crash reports*). Taken, or refused for good, it's let go
// of; if the server can't be reached, it waits for the next time. A friend's world, or the
// player's own, sends nothing: there's no server of theirs to send it to.
//
// Pure: main.js keeps them and sends them (its storage handed in).

/**
 * - `key`: where they wait.
 * - `kept`: how many wait at most (the newest).
 * - `within`: how long one waits to be sent (ms) before it's let go of.
 * - `near`: how near the crash's time the rejoin record must have been written (ms) for the
 *   crash to have been in its world (it's written every REJOIN.every while in it).
 * - `bytes`: the most one may be, as it's sent (server/storage/crashes.js CRASHES.bytes, less room
 *   for what's round it): past it, the oldest of its other events are left out.
 */
export const CRASH_REPORTS = Object.freeze({ key: "pellagos.crashreports", kept: 5, within: 7 * 24 * 3600000, near: 30000, bytes: 240 * 1024 });

/** Why a server refused one for good (it'd refuse it again): it's let go of, not sent again. */
export const REFUSED_FOR_GOOD = Object.freeze(["bad-request", "too-big", "no-world"]);

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

// How many bytes `value` is as JSON (as it's sent: UTF-8)
const bytesOf = (value) => new TextEncoder().encode(JSON.stringify(value)).length;

function read(storage) {
    try {
        const kept = JSON.parse(storage?.getItem(CRASH_REPORTS.key) ?? "[]");

        return Array.isArray(kept) ? kept.filter((one) => isObject(one) && typeof one.server === "string" && typeof one.world === "string" && Number.isFinite(one.at) && isObject(one.report)) : [];
    } catch {
        return [];
    }
}

function write(storage, waiting) {
    try {
        if (waiting.length) {
            storage?.setItem(CRASH_REPORTS.key, JSON.stringify(waiting));
        } else {
            storage?.removeItem(CRASH_REPORTS.key);
        }
    } catch {
        // (Storage full or refused: nothing waits)
    }
}

/**
 * The world on a world server a crash (`crash`: the event app/telemetry.js recover kept) was in,
 * from where the player was (`record`: app/rejoin.js lastInWorld): { server, world, worldName,
 * serverName } if they were in one then (the record written within CRASH_REPORTS.near of it);
 * else null (a friend's world, their own, none, or one they'd left).
 */
export function crashedIn(record, crash) {
    const at = Date.parse(crash?.at ?? "");

    if (record?.kind !== "server" || !Number.isFinite(at) || !Number.isFinite(record.at) || Math.abs(record.at - at) > CRASH_REPORTS.near) {
        return null;
    }

    return { server: record.server, world: record.world, worldName: record.worldName ?? null, serverName: record.serverName ?? null };
}

/**
 * The debug log as it's sent (`log`: app/telemetry.js, { build, code, built, events }): whole if
 * it's no more than CRASH_REPORTS.bytes as JSON, else the oldest of its events besides the crash
 * left out till it is; null if even the crash alone is more.
 */
export function reportOf(log) {
    const events = Array.isArray(log?.events) ? [...log.events] : [];
    const crash = events.find((event) => event?.kind === "crash");
    const sized = () => ({ build: log.build ?? null, code: log.code ?? null, built: log.built ?? null, events });

    if (!crash) {
        return null;
    }

    while (bytesOf(sized()) > CRASH_REPORTS.bytes) {
        const oldest = events.findLastIndex((event) => event !== crash);

        if (oldest < 0) {
            return null;
        }

        events.splice(oldest, 1);
    }

    return sized();
}

/**
 * A crash's report kept to send to its world (`where`: crashedIn's; `log`: the debug log as it
 * stood, the crash among it), as of `now` (ms); the oldest past CRASH_REPORTS.kept, and any
 * waiting longer than CRASH_REPORTS.within, let go. Returns it as it waits, or null if it can't.
 */
export function keepCrash(storage, where, log, now = Date.now()) {
    const report = where ? reportOf(log) : null;

    if (!report) {
        return null;
    }

    const waiting = { id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`, server: where.server, world: where.world, worldName: where.worldName, serverName: where.serverName, at: now, report };

    write(storage, [waiting, ...read(storage).filter((one) => now - one.at < CRASH_REPORTS.within)].slice(0, CRASH_REPORTS.kept));

    return waiting;
}

/** Those waiting to be sent to a world (`server`: its server's key, app/servers.js KnownServers; `world`: its id), the oldest first. */
export function crashesFor(storage, server, world, now = Date.now()) {
    return read(storage)
        .filter((one) => one.server === server && one.world === world && now - one.at < CRASH_REPORTS.within)
        .sort((a, b) => a.at - b.at);
}

/** One let go of (by its id): sent, or refused for good. */
export function letGoCrash(storage, id) {
    write(storage, read(storage).filter((one) => one.id !== id));
}

/** Every one waiting let go of (sending them turned off). */
export function forgetCrashes(storage) {
    write(storage, []);
}
