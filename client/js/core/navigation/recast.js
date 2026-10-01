// Recast and Detour (recast-navigation-js, vendored in client/vendor): loaded once, in the page,
// a worker or the tests. The rules step without waiting, so navigation.js waits for it before
// anything that finds ways is used.

let loading = null;

/** Recast's core, its WebAssembly ready: the same module every time. */
export function loadRecast() {
    loading ??= (async () => {
        // (Spelled out, so the loader's manifest finds them: scripts/build-manifest.js)
        const recast = await import("../../../vendor/recast-navigation-0.43.1/core.min.mjs");
        const { default: factory } = await import("../../../vendor/recast-navigation-0.43.1/recast-navigation.wasm.js");

        // (The glue fetches the WebAssembly beside it in a page or a worker; under Node it's read
        // from the file and handed over)
        const node = Boolean(globalThis.process?.versions?.node) && typeof window === "undefined";
        const wasmBinary = node ? await (await import("node:fs/promises")).readFile(new URL("../../../vendor/recast-navigation-0.43.1/recast-navigation.wasm.wasm", import.meta.url)) : undefined;

        await recast.init(() => factory(wasmBinary ? { wasmBinary } : {}));

        return recast;
    })();

    return loading;
}
