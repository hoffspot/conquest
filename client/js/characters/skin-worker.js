// Paints skins off the page's thread (skins.js): sent the skin atlas's fields once (and any made
// later), then a skin's settings, it sends back its picture (skin.js paintSkin), one at a time, in
// the order asked, leaving out any no longer wanted.

import { paintSkin } from "./skin.js";

const atlas = { fields: {}, furAndScales() {} };
const queue = [];
let busy = false;

// One skin painted, then (after any messages come meanwhile: one not wanted now) the next
function work() {
    busy = false;

    const job = queue.shift();

    if (!job) {
        return;
    }

    const skin = paintSkin(atlas, job.settings);

    self.postMessage({ id: job.id, skin }, [skin.data.buffer, skin.bump.buffer]);
    later();
}

function later() {
    if (!busy && queue.length) {
        busy = true;
        setTimeout(work, 0);
    }
}

self.onmessage = ({ data }) => {
    if (data.atlas) {
        const { fields, ...rest } = data.atlas;

        Object.assign(atlas, rest);
        Object.assign(atlas.fields, fields);
    } else if (data.cancel !== undefined) {
        const at = queue.findIndex(({ id }) => id === data.cancel);

        if (at >= 0) {
            queue.splice(at, 1);
        }
    } else {
        queue.push(data);
        later();
    }
};
