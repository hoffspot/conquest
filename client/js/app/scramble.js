// The licensed models are served scrambled (docs/LICENSED_MODELS.md, *Scrambling*): each byte
// swapped for another through a table made from SEED. A scrambled file isn't a GLB to anything
// that finds it: no 3D tool opens it, and nothing looking for models by their file type knows it
// for one. Yet it downloads as small: the same byte always becomes the same byte, so what repeats
// still repeats, and gzip, which GitHub Pages sends files with, packs it as well (to within a few
// hundred bytes in 3 MB).
//
// It isn't a secret, and isn't meant to be: the game has to undo it, so anyone with the game's
// code can. It keeps a model from being saved, opened or found as one, no more.
//
// No Three.js here: the build's scripts and the tests use it too.

// What the table's made from (changing it changes every scrambled file, and their hashes)
const SEED = 0x5eed1e55;

// How many bytes are swapped back between turns, at most (a phone does a MiB in about 10 ms)
const CHUNK = 1 << 20;

// The table, its inverse, and what a scrambled GLB starts with (made once, when first wanted);
// and the inverse two bytes at a time (made once a scrambled file's read: 128 KB, a few ms)
let tables = null;
let pairs = null;

function tablesOf() {
    if (!tables) {
        const forward = Uint8Array.from({ length: 256 }, (_, i) => i);
        let s = SEED | 0;

        // (A shuffle of 0-255, xorshift32 for its choices)
        for (let i = 255; i > 0; i--) {
            s ^= s << 13;
            s ^= s >>> 17;
            s ^= s << 5;

            const j = (s >>> 0) % (i + 1);

            [forward[i], forward[j]] = [forward[j], forward[i]];
        }

        const back = new Uint8Array(256);

        forward.forEach((to, from) => {
            back[to] = from;
        });

        // (What a scrambled GLB starts with: its "glTF", scrambled)
        const mark = Uint8Array.from([0x67, 0x6c, 0x54, 0x46], (byte) => forward[byte]);

        tables = { forward, back, mark };
    }

    return tables;
}

function pairsOf() {
    if (!pairs) {
        const { back } = tablesOf();

        pairs = new Uint16Array(65536);

        for (let v = 0; v < 65536; v++) {
            pairs[v] = back[v & 255] | (back[v >>> 8] << 8);
        }
    }

    return pairs;
}

/** Scrambles `bytes` (a Uint8Array), in place: they're returned. */
export function scramble(bytes) {
    const { forward } = tablesOf();

    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = forward[bytes[i]];
    }

    return bytes;
}

/** Whether `bytes` (a Uint8Array) are a scrambled GLB. */
export function isScrambled(bytes) {
    const { mark } = tablesOf();

    return bytes.length >= 4 && mark.every((byte, i) => bytes[i] === byte);
}

// Bytes swapped back, from `start` to `end` (even, from an even offset: two at a time)
function swapBack(bytes, start, end) {
    const { back } = tablesOf();
    const even = (end - start) & ~1;

    if ((bytes.byteOffset + start) % 2 === 0) {
        const halves = new Uint16Array(bytes.buffer, bytes.byteOffset + start, even / 2);
        const two = pairsOf();

        for (let i = 0; i < halves.length; i++) {
            halves[i] = two[halves[i]];
        }
    } else {
        for (let i = start; i < start + even; i++) {
            bytes[i] = back[bytes[i]];
        }
    }

    for (let i = start + even; i < end; i++) {
        bytes[i] = back[bytes[i]];
    }
}

/** Unscrambles `bytes` (a Uint8Array), in place, all at once: they're returned. */
export function unscramble(bytes) {
    swapBack(bytes, 0, bytes.length);

    return bytes;
}

/**
 * A file's bytes (an ArrayBuffer) as they're read: unscrambled, in place, if they're a scrambled
 * GLB, a MiB at a time with a turn between (so nothing else waits long); as they are otherwise.
 */
export async function readable(buffer) {
    const bytes = new Uint8Array(buffer);

    if (!isScrambled(bytes)) {
        return buffer;
    }

    for (let start = 0; start < bytes.length; start += CHUNK) {
        if (start) {
            await new Promise((resolve) => setTimeout(resolve, 0));
        }

        swapBack(bytes, start, Math.min(bytes.length, start + CHUNK));
    }

    return buffer;
}
