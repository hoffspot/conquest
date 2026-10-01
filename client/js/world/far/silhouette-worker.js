// Works out what's built round the player as it's seen from afar off the page's thread
// (silhouettes.js): given the world plan (and the start town as it's laid out) once, then where
// the player is, how far to reach and
// where the sites already set down stand, sends back the shapes (gather.js). Only the newest ask
// is worked out; the settlements laid out are kept for the next. Laying them out takes a while
// (a capital a fifth of a second), so what's ready is sent each half second or so, and the rest
// after.

import { gatherSilhouettes } from "./gather.js";

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
    const { shapes, done } = gatherSilhouettes(plan, { ...ask, settled: new Map(ask.settled), layouts, budget: BUDGET, clock: () => performance.now(), start });
    const [positions, normals, colours] = [shapes.positions, shapes.normals, shapes.colours].map((values) => Float32Array.from(values));

    self.postMessage({ id: ask.id, positions, normals, colours, done }, [positions.buffer, normals.buffer, colours.buffer]);

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
