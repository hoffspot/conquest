// Bakes navigation tiles off the page's thread (navbaker.js): sent a tile's triangles (core/
// navigation/tiles.js tileInput), it sends back Detour's data for it, the same bytes as baking it
// on the page would give.

import { bakeTile } from "../core/navigation/bake.js";
import { loadRecast } from "../core/navigation/recast.js";

const ready = loadRecast();

self.onmessage = async ({ data: { tx, ty, input } }) => {
    const data = bakeTile(await ready, input, tx, ty);

    self.postMessage({ tx, ty, data }, data ? [data.buffer] : []);
};
