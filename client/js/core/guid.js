// A character's own id, the same wherever they go (docs/SERVER.md *Characters and worlds*): kept
// on their hero (`hero.guid`) from when they're first kept, carried with them in their files, to
// worlds on servers and to others' games, so two of the same name are never taken for each other.
// A copy of a character a world keeps as its own (a world that takes copies, or one brought there
// with its world) has an id of its own, and the one it was copied from as its `origin`.
//
// Random (RFC 4122, version 4), made with crypto.getRandomValues: a game opened from a server on
// the Wi-Fi is a plain-http page, which has no crypto.randomUUID.

// A version 4 id, as written: 8-4-4-4-12 hexadecimal digits
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Is this a character's id (as newGuid makes them)? */
export const isGuid = (text) => typeof text === "string" && GUID.test(text);

/** A new character's id, random: "3f2b1c9e-7a4d-4e0f-9b21-5c6d7e8f9a0b". */
export function newGuid() {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));

    // (Version 4, and the variant RFC 4122 gives it)
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * A hero (a character's look and name, as kept) with its id: the one it has if it's good, else a
 * new one. Its `origin` (whose copy it is), kept only if it's an id too.
 */
export function withGuid(hero) {
    const kept = { ...hero, guid: isGuid(hero?.guid) ? hero.guid : newGuid() };

    if (!isGuid(kept.origin)) {
        delete kept.origin;
    }

    return kept;
}

/** A new character made with a hero's look (and name): an id of its own, and no origin. */
export function freshOf(hero) {
    const fresh = { ...hero, guid: newGuid() };

    delete fresh.origin;

    return fresh;
}

/**
 * A copy of a hero, a world's own from now on: an id of its own, and the one it was copied from
 * as its `origin` (none if it had none).
 */
export function copyOf(hero) {
    const copy = { ...hero, guid: newGuid() };

    if (isGuid(hero?.guid)) {
        copy.origin = hero.guid;
    } else {
        delete copy.origin;
    }

    return copy;
}
