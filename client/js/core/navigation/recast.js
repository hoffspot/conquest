// Recast and Detour (recast-navigation-js, vendored in client/vendor): loaded once, in the page,
// a worker or the tests. The rules step without waiting, so navigation.js waits for it before
// anything that finds ways is used.

let loading = null;
let loaded = null;

/** Recast's core, its WebAssembly ready: the same module every time. */
export function loadRecast() {
    loading ??= (async () => {
        // (The vendored folder's one module, which names the core, the WebAssembly's glue and
        // where the WebAssembly is, beside it. Spelled out, so the loader's manifest finds it
        // (scripts/build-manifest.js), and here alone: npm run vendor:recast writes a new
        // version's folder into this line, and test/bake.test.js checks it's package.json's.)
        const { core: recast, factory, wasm } = await import("../../../vendor/recast-navigation-0.44.0/recast.mjs");

        // (The glue fetches the WebAssembly beside it in a page or a worker; under Node it's read
        // from the file and handed over)
        const node = Boolean(globalThis.process?.versions?.node) && typeof window === "undefined";
        const wasmBinary = node ? await (await import("node:fs/promises")).readFile(wasm) : undefined;

        await recast.init(() => factory(wasmBinary ? { wasmBinary } : {}));
        loaded = recast;

        return recast;
    })();

    return loading;
}

/**
 * How much memory Recast's WebAssembly holds (bytes: it grows as the navigation tiles are baked,
 * and never gives any back), or 0 before it's loaded. For the debug log (app/game.js memoryNow).
 */
export function wasmBytes() {
    return loaded?.Raw?.Module?.HEAPU8?.buffer?.byteLength ?? 0;
}
