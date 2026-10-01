// Recast and Detour (recast-navigation-js, vendored in client/vendor): loaded once, in the page,
// a worker or the tests. The rules step without waiting, so whoever makes a Navigation loads this
// first and hands it the module.

const VENDOR = "../../../vendor/recast-navigation-0.43.1/";

let loading = null;

/** Recast's core, its WebAssembly ready: the same module every time. */
export function loadRecast() {
    loading ??= (async () => {
        const recast = await import(`${VENDOR}core.min.mjs`);
        const { default: factory } = await import(`${VENDOR}recast-navigation.wasm.js`);

        // (The glue fetches the WebAssembly beside it in a page or a worker; under Node it's read
        // from the file and handed over)
        const node = Boolean(globalThis.process?.versions?.node) && typeof window === "undefined";
        const wasmBinary = node ? await (await import("node:fs/promises")).readFile(new URL(`${VENDOR}recast-navigation.wasm.wasm`, import.meta.url)) : undefined;

        await recast.init(() => factory(wasmBinary ? { wasmBinary } : {}));

        return recast;
    })();

    return loading;
}
