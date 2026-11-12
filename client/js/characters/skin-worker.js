// Paints skins off the page's thread (skins.js): sent the skin atlas's fields once (and any made
// later), then a skin's settings, it sends back its picture (skin.js paintSkin; at the size
// asked for: pictures.js), one at a time, in the order asked, leaving out any no longer wanted.
// Or sent the body's files and masks, it works the atlas out itself (a second or more on a
// phone, off the page's thread while the title's up) and sends back what it found for the
// page's own.
//
// Having the body then, it paints the wardrobe's pictures too (garment-painter.js): sent the
// measurements they're painted on once, then a garment's id or an outfit's garments', it sends
// back the garment's own picture or the outfit's two, in the same order with the skins: those
// a step at a time (a few rows painted in each), so that one no longer wanted is left off.

import { HumanData } from "./body.js";
import { GarmentPainter } from "./garment-painter.js";
import { sizedSkin } from "./pictures.js";
import { paintSkin, SkinAtlas } from "./skin.js";

let atlas = { fields: {}, furAndScales() {} };
let painter = null;
let sweeping = false;
const queue = [];
let busy = false;

// How long (ms) is worked at one thing before any messages come meanwhile are heard (one not
// wanted now), a step at least; how often (ms) the garments' pictures kept here are looked
// through for those long unused
const SLICE = 30;
const SWEEP = 5000;

// What's asked for made, a step at a time, returning { reply, transfer }: a skin; a garment's own
// picture (a copy: this one's kept here, for the outfits made from it); an outfit's two
function* making(job) {
    if (job.garment !== undefined) {
        const { data, bump, size } = yield* painter.painting(job.garment, job.size);
        const picture = { data: data.slice(), bump: bump.slice(), size };

        return { reply: { picture }, transfer: [picture.data.buffer, picture.bump.buffer] };
    }

    if (job.outfit) {
        const picture = yield* painter.outfitting(job.outfit, job);
        const { full, small } = picture;

        return { reply: { picture }, transfer: [full.data, full.surface, small.data, small.surface].filter(Boolean).map(({ buffer }) => buffer) };
    }

    // (At the size asked for, and a smaller one with it if that's asked for: pictures.js)
    const skin = sizedSkin(paintSkin(atlas, job.settings), job.size, job.small);

    return { reply: { skin }, transfer: [skin.data.buffer, skin.bump.buffer, ...(skin.small ? [skin.small.data.buffer, skin.small.bump.buffer] : [])] };
}

// The first thing asked for worked at a while (all of it, if it's a skin), then (after any
// messages come meanwhile: one not wanted now) more of it, or the next
function work() {
    busy = false;

    const job = queue[0];

    if (!job) {
        return;
    }

    const until = performance.now() + SLICE;
    let step;

    try {
        job.steps ??= making(job);

        do {
            step = job.steps.next();
        } while (!step.done && performance.now() < until);
    } catch (error) {
        // (A picture that can't be painted here: the page is told, and paints it itself. A
        // skin's failing is the worker's, as ever: the page paints them all from then)
        if (job.garment === undefined && !job.outfit) {
            throw error;
        }

        queue.shift();
        self.postMessage({ id: job.id, failed: String(error?.message ?? error) });
    }

    if (step?.done) {
        queue.shift();
        self.postMessage({ id: job.id, ...step.value.reply }, step.value.transfer);
    }

    later();
    tidy();
}

function later() {
    if (!busy && queue.length) {
        busy = true;
        setTimeout(work, 0);
    }
}

// The garments' pictures kept here looked through now and then, while there are any, for
// those not used for a while: let go of (garment-painter.js)
function tidy() {
    if (sweeping || !painter?.pictures.size) {
        return;
    }

    sweeping = true;

    // (Not what keeps a test's process going, where there's such a thing to say: Node's)
    setTimeout(() => {
        sweeping = false;

        // (But not in the middle of an outfit's being put together from them)
        if (!queue.length) {
            painter.sweep();
        }

        tidy();
    }, SWEEP).unref?.();
}

self.onmessage = ({ data }) => {
    if (data.analyse) {
        const { manifest, body, masks, size } = data.analyse;
        const human = new HumanData(manifest, body);

        atlas = new SkinAtlas(human, masks, size);
        painter = new GarmentPainter(human);
        self.postMessage({ analysed: atlas.parts });
    } else if (data.atlas) {
        const { fields, ...rest } = data.atlas;

        Object.assign(atlas, rest);
        Object.assign(atlas.fields, fields);
    } else if (data.measures) {
        painter?.measure(data.measures);
    } else if (data.letGo) {
        painter?.letGo();
    } else if (data.cancel !== undefined) {
        const at = queue.findIndex(({ id }) => id === data.cancel);

        if (at >= 0) {
            queue.splice(at, 1);
        }
    } else if ((data.garment !== undefined || data.outfit) && !painter) {
        self.postMessage({ id: data.id, failed: "There's no body here to paint garments on" });
    } else {
        queue.push(data);
        later();
    }
};
