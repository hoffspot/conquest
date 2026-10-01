// Works out what's seen from afar round the player off the page's thread (silhouettes.js): given
// the world plan (and the start town as it's laid out) once, then where the player is, how far to
// reach and where the sites already set down stand, sends back what's built (gather.js), the trees
// as cards (trees.js) and the rivers (rivers.js). Only the newest ask is worked out; the settlements laid
// out are kept for the next. Laying them out takes a while (a capital a fifth of a second), so
// what's ready is sent each half second or so, and the rest after; the trees and the rivers with
// the first.

import { gatherSilhouettes } from "./gather.js";
import { gatherRivers } from "./rivers.js";
import { gatherTrees, treeCards } from "./trees.js";

// How long to lay settlements out before sending what's ready (ms)
const BUDGET = 500;

let plan = null;
let start = null;
let asked = null;
let working = false;
const layouts = new Map();

function work() {
    working = false;

    if (!asked) {
        return;
    }

    const ask = asked;
    const first = !ask.sent;
    const { shapes, done } = gatherSilhouettes(plan, { ...ask, settled: new Map(ask.settled), layouts, budget: BUDGET, clock: () => performance.now(), start });
    const [positions, normals, colours] = [shapes.positions, shapes.normals, shapes.colours].map((values) => Float32Array.from(values));
    const message = { id: ask.id, positions, normals, colours, done };
    const buffers = [positions.buffer, normals.buffer, colours.buffer];

    if (first) {
        message.trees = treeCards(ask.trees > 0 ? gatherTrees(plan, { x: ask.x, z: ask.z, reach: ask.trees, from: ask.from, town: ask.town }) : new Float32Array(0));
        message.rivers = gatherRivers(plan, { x: ask.x, z: ask.z, reach: ask.reach, from: ask.from });
        buffers.push(message.trees.vertices.buffer, message.trees.index.buffer, message.rivers.buffer);
        ask.sent = true;
    }

    self.postMessage(message, buffers);

    if (done && asked === ask) {
        asked = null;
    }

    later();
}

function later() {
    if (!working && asked) {
        working = true;
        setTimeout(work, 0);
    }
}

self.onmessage = ({ data }) => {
    if (data.plan) {
        ({ plan, start } = data);

        return;
    }

    asked = data;
    later();
};
