// recast-navigation 0.44.0 as the game loads it (written by scripts/vendor-recast.js): its core,
// its WebAssembly's glue, and where the WebAssembly itself is.
export * as core from "./core.min.mjs";
export { default as factory } from "./recast-navigation.wasm.js";
export const VERSION = "0.44.0";
export const wasm = new URL("./recast-navigation.wasm.wasm", import.meta.url);
