// Paints skins off the page's thread (skins.js): sent the skin atlas's fields once (and any made
// later), then a skin's settings, it sends back its picture (skin.js paintSkin; at the size
// asked for: pictures.js), one at a time, in the order asked, leaving out any no longer wanted.
// Or sent the body's files and masks, it works the atlas out itself (a second or more on a
// phone, off the page's thread while the title's up) and sends back what it found for the
// page's own.

import { HumanData } from "./body.js";
import { sizedSkin } from "./pictures.js";
import { paintSkin, SkinAtlas } from "./skin.js";

let atlas = { fields: {}, furAndScales() {} };
const queue = [];
let busy = false;

// One skin painted, then (after any messages come meanwhile: one not wanted now) the next
function work() {
    busy = false;

    const job = queue.shift();

    if (!job) {
        return;
    }

    // (At the size asked for, and a smaller one with it if that's asked for: pictures.js)
    const skin = sizedSkin(paintSkin(atlas, job.settings), job.size, job.small);

    self.postMessage({ id: job.id, skin }, [skin.data.buffer, skin.bump.buffer, ...(skin.small ? [skin.small.data.buffer, skin.small.bump.buffer] : [])]);
    later();
}

function later() {
    if (!busy && queue.length) {
        busy = true;
        setTimeout(work, 0);
    }
}

self.onmessage = ({ data }) => {
    if (data.analyse) {
        const { manifest, body, masks, size } = data.analyse;

        atlas = new SkinAtlas(new HumanData(manifest, body), masks, size);
        self.postMessage({ analysed: atlas.parts });
    } else if (data.atlas) {
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
