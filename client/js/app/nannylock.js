// Nanny Mode's lock code (generated/multiplayer_scaling_plan.md 6B-18): a player's own choice of
// Nanny Mode (Game options, Chat and players) can be locked with a code, a parent's say, and is
// then switched off only with it. The code itself is never kept: a salted SHA-256 of it is, with
// this device's settings. It keeps a child from switching it off in the menu; it isn't a secret
// kept from whoever can clear the browser's data, which forgets the lock with everything else.

/** How long a lock code may be (characters), at the least and the most. */
export const NANNY_CODE = Object.freeze({ least: 4, most: 12 });

/** Whether `code` can be a lock code: a string of NANNY_CODE.least to .most characters, none of them a space. */
export function codeFits(code) {
    return typeof code === "string" && code.length >= NANNY_CODE.least && code.length <= NANNY_CODE.most && !/\s/.test(code);
}

const hex = (bytes) => [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

async function digest(salt, code) {
    return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${code}`))));
}

/**
 * A lock made of a code, as it's kept: "salt:digest" (`salt` its own unless given); null for a
 * code that can't be one (codeFits).
 */
export async function lockOf(code, salt = hex(crypto.getRandomValues(new Uint8Array(8)))) {
    return codeFits(code) && /^[0-9a-f]{16}$/.test(salt) ? `${salt}:${await digest(salt, code)}` : null;
}

/** Whether a lock as kept is one (anything else is no lock: Nanny Mode switched off freely). */
export function isLock(lock) {
    return typeof lock === "string" && /^[0-9a-f]{16}:[0-9a-f]{64}$/.test(lock);
}

/** Whether `code` opens `lock`: always, where there's no lock. */
export async function unlocks(lock, code) {
    if (!isLock(lock)) {
        return true;
    }

    const [salt, kept] = lock.split(":");

    return codeFits(code) && (await digest(salt, code)) === kept;
}
