// Works out the far land's levels off the page's thread (far.js): given the world plan once,
// then a level and its middle, sends back its ground (levels.js sampleLevel). The newest ask for
// a level is the only one worked out: the player's moved on past any older.

import { sampleLevel } from "./levels.js";

let plan = null;
const asked = new Map();
let working = false;

function work() {
    working = false;

    const [level, middle] = asked.entries().next().value ?? [];

    if (level === undefined) {
        return;
    }

    asked.delete(level);

    const ground = sampleLevel(plan, level, middle);

    self.postMessage(ground, [ground.heights.buffer, ground.water.buffer, ground.depth.buffer, ground.normals.buffer, ground.indices.buffer]);
    later();
}

// (Each level's asks heard before the next's worked out: an older ask for one replaced)
function later() {
    if (!working && asked.size) {
        working = true;
        setTimeout(work, 0);
    }
}

self.onmessage = ({ data }) => {
    if (data.plan) {
        plan = data.plan;

        return;
    }

    asked.set(data.level, data.middle);
    later();
};
