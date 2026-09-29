// Lays settlements out off the page's thread (layouts.js): given a place's id and what laying it
// out takes (core/settlements.js specOf), sends back its layout (core/setpieces/town.js).

import { layoutTown } from "../core/setpieces/town.js";

self.onmessage = ({ data: { id, spec } }) => {
    self.postMessage({ id, spec, town: layoutTown(spec) });
};
