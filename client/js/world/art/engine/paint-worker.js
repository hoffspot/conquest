// Paints layers of the art's atlas off the page's thread (atlas.js prepareAtlas): given the
// materials' names and a size, sends back each painted (painters.js paintLayer).

import { paintLayer } from "./painters.js";

self.onmessage = ({ data: { names, size } }) => {
    const layers = names.map((name) => paintLayer(name, size));

    self.postMessage({ names, layers }, layers.map(({ buffer }) => buffer));
};
