// Works out the land's heights for chunks off the page's thread (terrains.js): given the world plan
// once, then chunks (cx, cy), sends back each chunk's heights at its corners (core/terrain/
// height.js heightsOf), the same as they'd be worked out on the page. Given trails (core/trails.js:
// with what they keep out of, given once with the plan), finds their ways, the same as they'd be
// found on the page, and sends them back.

import { CORNERS, CHUNK } from "../core/terrain/ground.js";
import { heightsOf } from "../core/terrain/height.js";
import { routeTrail } from "../core/trails.js";

let plan = null;
let keepOut = [];

self.onmessage = ({ data }) => {
    if (data.plan) {
        plan = data.plan;
        keepOut = data.keepOut ?? [];
        return;
    }

    if (data.trail) {
        self.postMessage({ trail: data.trail.id, points: routeTrail(plan, data.trail, keepOut) });
        return;
    }

    const { cx, cy } = data;
    const heights = heightsOf(plan, cx * CHUNK, cy * CHUNK, CORNERS, 1);

    self.postMessage({ cx, cy, heights }, [heights.buffer]);
};
