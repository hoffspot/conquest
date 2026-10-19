// The player's own identity on this device (core/player.js: the same on every server; docs/GAME.md,
// "You"), in the browser's local storage, "pellagos.player": { version, secret (base64url), name,
// created }. Made the first time it's wanted; kept for this page alone if the browser won't keep
// it. Loaded only once it's wanted (a world on a server, or the You panel), with the signing it
// brings.

import { bytesOf, textOf } from "../core/identity.js";
import { cleanPlayerName, codeOf, newPlayerSecret, playerIdOf, proofOf, publicKeyOf, secretOfCode } from "../core/player.js";

const PLAYER_KEY = "pellagos.player";

let here = null;

function read() {
    try {
        return JSON.parse(globalThis.localStorage?.getItem(PLAYER_KEY) ?? "null");
    } catch {
        return null;
    }
}

function write(kept) {
    try {
        globalThis.localStorage?.setItem(PLAYER_KEY, JSON.stringify(kept));
    } catch {
        // (Kept for this page alone)
    }

    here = playerOf(kept);

    return here;
}

// An identity as kept, as loadPlayer gives it; or null if it's no good
function playerOf(kept) {
    const secret = bytesOf(kept?.secret);

    if (kept?.version !== 1 || secret?.length !== 32 || !cleanPlayerName(kept.name) || typeof kept.created !== "string") {
        return null;
    }

    const key = publicKeyOf(secret);

    return { id: playerIdOf(key), key, secret, name: kept.name, created: kept.created };
}

/**
 * The player's own identity on this device: { id, key, secret, name, created }. Made the first
 * time it's wanted, going by `name` (or "Player": they can change it).
 */
export function loadPlayer({ name = null } = {}) {
    return playerOf(read()) ?? here ?? write({ version: 1, secret: textOf(newPlayerSecret()), name: cleanPlayerName(name) ?? "Player", created: new Date().toISOString() });
}

/** The player's name changed (as core/player.js cleanPlayerName allows: else refused). Returns whether it is. */
export function namePlayer(name) {
    const named = cleanPlayerName(name);
    const player = loadPlayer();

    if (named) {
        write({ version: 1, secret: textOf(player.secret), name: named, created: player.created });
    }

    return Boolean(named);
}

/** The player's code: their secret key written out, to carry to another device (core/player.js codeOf). */
export const playerCode = () => codeOf(loadPlayer().secret);

/**
 * The identity on this device replaced by the one a code is (their code from another device: the
 * code is the key alone), going by `name` (the one they go by there, say: else the one they go by
 * here): { player }, as loadPlayer gives it, or { error: "code" } if it isn't a code (or a
 * character's mistyped).
 */
export function usePlayerCode(code, { name = null } = {}) {
    const secret = secretOfCode(code);

    if (!secret) {
        return { error: "code" };
    }

    return { player: write({ version: 1, secret: textOf(secret), name: cleanPlayerName(name) ?? loadPlayer().name, created: new Date().toISOString() }) };
}

/** The player's proof for a server, by its id, as they come into one of its worlds (core/player.js proofOf). */
export function proving(server) {
    const { secret, name } = loadPlayer();

    return proofOf(secret, { server, name });
}
