// Works out the land's heights for chunks off the page's thread (terrains.js): given the world plan
// once, then chunks (cx, cy), sends back each chunk's heights at its corners (core/terrain/
// height.js heightsOf), the same as they'd be worked out on the page.

import { CORNERS, CHUNK } from "../core/terrain/ground.js";
import { heightsOf } from "../core/terrain/height.js";

let plan = null;

self.onmessage = ({ data }) => {
    if (data.plan) {
        plan = data.plan;
        return;
    }

    const { cx, cy } = data;
    const heights = heightsOf(plan, cx * CHUNK, cy * CHUNK, CORNERS, 1);

    self.postMessage({ cx, cy, heights }, [heights.buffer]);
};
