// Bakes navigation tiles off the page's thread (navbaker.js): sent a tile's triangles (core/
// navigation/tiles.js tileInput; or a small map's, a building's floor's or a scene's, with its
// kind of mesh's `measures`, core/navigation/settings.js, and which of them it's for, `mesh`), it
// sends back Detour's data for it, the same bytes as baking it on the page would give.

import { bakeTile } from "../core/navigation/bake.js";
import { loadRecast } from "../core/navigation/recast.js";

const ready = loadRecast();

self.onmessage = async ({ data: { mesh, tx, ty, input, measures } }) => {
    const data = bakeTile(await ready, input, tx, ty, measures);

    self.postMessage({ mesh, tx, ty, data }, data ? [data.buffer] : []);
};
