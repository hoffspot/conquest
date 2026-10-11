// A WebAssembly module's memory: how much it starts with (pages of 64 KB), read from its memory
// section, and the module with a different start. Recast's (scripts/vendor-recast.js) is built to
// start with 64 MB it doesn't need: its static data and stack are under 100 KB, and it grows as
// the navigation meshes want more, so it's made to start with 16 MB instead, in the page and in
// the navigation worker both.

const PAGE = 65536;
const MEMORY_SECTION = 5;

// An unsigned LEB128 number at `at`: [value, where it ends]
function leb(bytes, at) {
    let value = 0;
    let shift = 0;
    let byte;

    do {
        byte = bytes[at++];
        value += (byte & 0x7f) * 2 ** shift;
        shift += 7;
    } while (byte & 0x80);

    return [value, at];
}

// Where the memory section's first memory's starting pages are: { at, end, pages, most }
function memoryOf(bytes) {
    if (bytes[0] !== 0 || bytes[1] !== 0x61 || bytes[2] !== 0x73 || bytes[3] !== 0x6d) {
        throw new Error("Not a WebAssembly module");
    }

    let at = 8;

    while (at < bytes.length) {
        const id = bytes[at];
        const [size, start] = leb(bytes, at + 1);

        if (id === MEMORY_SECTION) {
            const [, flagsAt] = leb(bytes, start);
            const flags = bytes[flagsAt];
            const [pages, end] = leb(bytes, flagsAt + 1);
            const most = flags & 1 ? leb(bytes, end)[0] : null;

            return { at: flagsAt + 1, end, pages, most };
        }

        at = start + size;
    }

    throw new Error("The module defines no memory of its own");
}

/** How many bytes a module's memory starts with. */
export function startingMemory(bytes) {
    return memoryOf(bytes).pages * PAGE;
}

/**
 * The module (bytes) made to start with `megabytes` of memory, its section's size unchanged: the
 * new start is written in as many bytes as the old (padded LEB128), so nothing else moves.
 */
export function withStartingMemory(bytes, megabytes) {
    const { at, end, most } = memoryOf(bytes);
    const pages = Math.round((megabytes * 1048576) / PAGE);
    const width = end - at;

    if (most !== null && pages > most) {
        throw new Error(`${pages} pages is more than the module's most, ${most}`);
    }

    if (pages >= 2 ** (7 * width)) {
        throw new Error(`${pages} pages doesn't fit in ${width} bytes`);
    }

    const patched = Uint8Array.from(bytes);

    for (let k = 0; k < width; k++) {
        patched[at + k] = (Math.floor(pages / 2 ** (7 * k)) & 0x7f) | (k < width - 1 ? 0x80 : 0);
    }

    return patched;
}
