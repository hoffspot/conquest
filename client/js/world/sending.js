// What's built round the player given to the graphics card as it's built, not when the camera
// first turns to it. three.js sends a mesh's corners and pictures the first time it draws it, and
// draws only what the camera sees: standing in the start town a quarter of a minute, the
// undergrowth, hedges and ground behind and beside the camera were 14 MB still to send, all of it
// in the frame the camera first turned round. (And what the page lets go of once it's sent,
// release.js, it kept till then.)
//
// So what's newly built is drawn once wherever the camera looks: not culled for a frame (the
// graphics card throws away what's out of view, for the cost of its corners, once), then culled
// again as it was. No more than SEND_SOON.bytes are let through a frame, the rest waiting their
// turn (the land round the start, all built before the first frame, is sent over the first
// second or so of play); what the camera does see meanwhile is sent as it always was.

/**
 * How many bytes waiting to be sent are let through to the graphics card a frame: each mesh's
 * corners, or `least` if it has fewer (its pictures aren't counted: a chunk's ground's is a
 * quarter of a megabyte).
 */
export const SEND_SOON = Object.freeze({ bytes: 2 * 1024 * 1024, least: 256 * 1024 });

// What's waiting its turn, in the order it was built (held weakly: a chunk thrown away before its
// turn is simply gone); and for each one watched, what it was told once drawn before (its own
// onAfterRender, or none: three.js's)
const waiting = [];
const watched = new WeakMap();

// A mesh drawn (three.js calls onAfterRender once it has: its corners and pictures are sent by
// then): culled again, and told what it was told before, as it was
function drawn(...given) {
    const { after } = watched.get(this);

    watched.delete(this);
    this.frustumCulled = true;

    if (after) {
        this.onAfterRender = after;
        after.apply(this, given);
    } else {
        delete this.onAfterRender;
    }
}

// How many bytes of corners a mesh has to send (none it's let go of: those are sent already)
function bytesOf({ geometry }) {
    let bytes = geometry?.index?.array?.byteLength ?? 0;

    for (const attribute of Object.values(geometry?.attributes ?? {})) {
        bytes += attribute.array?.byteLength ?? 0;
    }

    return bytes;
}

/**
 * Everything drawn under an object (newly built: a chunk's meshes, a block of the town) to be
 * given to the graphics card in the next frames it's shown in, wherever the camera looks
 * (sendSome). What's never culled anyway, or seen by no ordinary camera (drawn only into the
 * shadows), is left as it is. Returns the object.
 */
export function sendSoon(object) {
    object.traverse((node) => {
        if ((node.isMesh || node.isPoints || node.isLine) && node.frustumCulled && node.layers.mask & 1 && !watched.has(node)) {
            watched.set(node, { after: Object.hasOwn(node, "onAfterRender") ? node.onAfterRender : null });
            node.onAfterRender = drawn;
            waiting.push(new WeakRef(node));
        }
    });

    return object;
}

/**
 * Each frame, before it's drawn: the next of those waiting (sendSoon) let through to the graphics
 * card, as many as have `bytes` to send between them (one at least): drawn this frame if they're
 * shown, or the first frame they are. One the camera saw meanwhile has been sent, and takes no
 * turn. Returns how many are still waiting.
 */
export function sendSome(bytes = SEND_SOON.bytes) {
    let through = 0;

    while (waiting.length && (through === 0 || through < bytes)) {
        const node = waiting.shift().deref();

        if (node && watched.has(node)) {
            node.frustumCulled = false;
            through += Math.max(SEND_SOON.least, bytesOf(node));
        }
    }

    return waiting.length;
}
