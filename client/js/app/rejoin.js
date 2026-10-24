// Back into a world after a crash or a reload (docs/GAME.md *Back into a world*). While the player's
// in another's world (one on a world server, or a friend's, joined by its code), where is kept on
// this device (`pellagos.inworld`), written again every ten seconds as they play (REJOIN.every),
// and let go of once they leave it as they mean to (or are sent out). The game started again
// within half an hour of the last time it was written (REJOIN.within), it goes straight back in:
// a dialog shows each stage of the way as it's come to (REJOIN_STAGES), and what's wrong if it
// can't get there, to try again; Cancel stops it.
//
// Pure: main.js keeps it, reads it and follows it (its storage handed in).

/** How long after it was last written a world's gone back into (`within`, ms), how often it's written while playing (`every`), and where (`key`). */
export const REJOIN = Object.freeze({ within: 30 * 60 * 1000, every: 10000, key: "pellagos.inworld" });

/**
 * The stages of the way back in, by the kind of world, as the dialog lists them: [id, what's being
 * done]. Once the world's come, the loading screen builds it as ever.
 */
export const REJOIN_STAGES = Object.freeze({
    server: Object.freeze([
        ["reach", "Reaching the server"],
        ["prove", "Showing who you are"],
        ["enter", "Finding your place in the world"],
        ["open", "Opening the way in"],
        ["ask", "Coming in, and the world sent"],
    ]),
    friend: Object.freeze([
        ["reach", "Reaching the server"],
        ["find", "Finding the world by its code"],
        ["ask", "Coming in, and the world sent"],
    ]),
});

const CODE = /^[A-Z]{4}$/;

// A kept record as it should be: { kind: "server", server, world, ... } or { kind: "friend", code,
// ... }, with when it was written (`at`), or null
function valid(record) {
    if (!record || typeof record !== "object" || !Number.isFinite(record.at)) {
        return null;
    }

    if (record.kind === "server") {
        return typeof record.server === "string" && typeof record.world === "string" ? record : null;
    }

    if (record.kind === "friend") {
        return typeof record.code === "string" && CODE.test(record.code) ? record : null;
    }

    return null;
}

/**
 * Keep where the player is (`record`), as of `now` (ms): on a world server { kind: "server", server
 * (its key, app/servers.js KnownServers), world (its id), worldName, serverName, hero (their hero's
 * slot, in a world that keeps them; else null), character (the id of the character on this device
 * they came as, or null), name (who they are there) }; in a friend's { kind: "friend", code,
 * broker (the address of the server's broker it was joined through, or null for the old relay),
 * character, name, host (whose world it is) }.
 */
export function keepInWorld(storage, record, now = Date.now()) {
    try {
        storage?.setItem(REJOIN.key, JSON.stringify({ ...record, at: now }));
    } catch {
        // (Storage full or refused: nothing to go back into, should it fall over)
    }
}

/** Where the player was, if they were in another's world within REJOIN.within of `now`; else null (and anything kept, forgotten). */
export function inWorldOf(storage, now = Date.now()) {
    let record = null;

    try {
        record = valid(JSON.parse(storage?.getItem(REJOIN.key) ?? "null"));
    } catch {
        record = null;
    }

    if (record && now - record.at >= 0 && now - record.at < REJOIN.within) {
        return record;
    }

    forgetInWorld(storage);

    return null;
}

/** Let go of where the player was: they've left it as they meant to. */
export function forgetInWorld(storage) {
    try {
        storage?.removeItem(REJOIN.key);
    } catch {
        // (Nothing to forget)
    }
}

/**
 * What the dialog's headed with, and says under it: { title: "Back into Thornwick", about: "On
 * Tom's Mac mini, as Ada." } on a world server; { title: "Back into Wren's world", about: "By its
 * code, ABCD, as Ada." } in a friend's.
 */
export function rejoinWords(record) {
    const as = record.name ? `, as ${record.name}` : "";

    if (record.kind === "server") {
        return { title: `Back into ${record.worldName ?? "your world"}`, about: `On ${record.serverName ?? "its server"}${as}.` };
    }

    return { title: `Back into ${record.host ? `${record.host}'s world` : "your friend's world"}`, about: `By its code, ${record.code}${as}.` };
}
