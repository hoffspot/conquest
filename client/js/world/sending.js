// What's built round the player given to the graphics card as it's built, not when the camera
// first turns to it. three.js sends a mesh's corners and pictures the first time it draws it, and
// draws only what the camera sees: standing in the start town a quarter of a minute, the
// undergrowth, hedges and ground behind and beside the camera were 14 MB still to send, all of it
// in the frame the camera first turned round. (And what the page lets go of once it's sent,
// release.js, it kept till then.)
//
// So what's newly built waits here (sendSoon), and each frame the view has the next of it drawn
// once, wherever the camera looks, in a pass of its own after the frame's (sendSome): into no
// pixel at all, every one cut away, so the picture's as the frame left it. Not in the frame
// itself, culled by nothing: there it would count among what the frame draws, and be drawn into
// the sun's shadows too. And after the frame, not before it: the frame's drawn the shadow maps
// the lit shaders read, which a map just made has nothing in till then (three.js gives a shader
// that reads one a picture it can't read, and the graphics card refuses the drawing). No more
// than SEND_SOON.bytes go a frame, the rest waiting their turn (the land round the start, all
// built before the first frame, is sent over the first second or so of play); what the camera
// does see meanwhile is sent as it always was, and takes no turn.
import { PerspectiveCamera, Vector4 } from "three";

/**
 * How many bytes waiting to be sent go to the graphics card a frame: each mesh's corners, or
 * `least` if it has fewer (its pictures aren't counted: a chunk's ground's is a quarter of a
 * megabyte). And the layer they're drawn on for it, alone with the lights (2 is what's drawn only
 * into the shadows, shadows.js; 3 and 4 the paperdoll and a likeness, view.js; 31 the crowd's
 * offstage, crowd.js).
 */
export const SEND_SOON = Object.freeze({ bytes: 2 * 1024 * 1024, least: 256 * 1024, layer: 5 });

// What's waiting its turn, in the order it was built (held weakly: a chunk thrown away before its
// turn is simply gone); and for each one watched, what it was told once drawn before (its own
// onAfterRender, or none: three.js's)
const waiting = [];
const watched = new WeakMap();

// The camera they're drawn to: one that sees nothing but what's on their layer
const camera = new PerspectiveCamera();

camera.layers.set(SEND_SOON.layer);

const _viewport = new Vector4();
const _scissor = new Vector4();

// A mesh watched no more, as it was before it was: told once drawn what it was told before, if
// anything (which this gives)
function unwatched(node) {
    const { after = null } = watched.get(node) ?? {};

    watched.delete(node);

    if (after) {
        node.onAfterRender = after;
    } else {
        delete node.onAfterRender;
    }

    return after;
}

// A mesh drawn, by the frame or in its turn (three.js calls onAfterRender once it has: its
// corners and pictures are sent by then): watched no more, and told what it was told before
function drawn(...given) {
    unwatched(this)?.apply(this, given);
}

// How many bytes of corners a mesh has to send (none it's let go of: those are sent already)
function bytesOf({ geometry }) {
    let bytes = geometry?.index?.array?.byteLength ?? 0;

    for (const attribute of Object.values(geometry?.attributes ?? {})) {
        bytes += attribute.array?.byteLength ?? 0;
    }

    return bytes;
}

// The scene something's in, if it's in one, and whether it's shown there (itself, and all it's
// under)
function placed(node) {
    let shown = true;

    for (let at = node; at; at = at.parent) {
        shown &&= at.visible;

        if (at.isScene) {
            return { scene: at, shown };
        }
    }

    return { scene: null, shown: false };
}

// The next of those waiting that are shown in a scene, as many as have `bytes` to send between
// them (one at least), taken from those waiting. One the camera saw meanwhile takes no turn; one
// that's hidden, or in no scene yet, waits; one in another scene is left to be sent when it's
// first seen there
function next(scene, bytes) {
    const meshes = [];
    let through = 0;
    let kept = 0;

    for (const each of waiting) {
        const node = each.deref();

        if (!node || !watched.has(node)) {
            continue;
        }

        const full = through > 0 && through >= bytes;
        const { scene: where, shown } = full ? {} : placed(node);

        if (full || !where || (where === scene && !shown)) {
            waiting[kept++] = each;
        } else if (where === scene) {
            meshes.push(node);
            through += Math.max(SEND_SOON.least, bytesOf(node));
        } else {
            unwatched(node);
        }
    }

    waiting.length = kept;

    return meshes;
}

/**
 * Everything drawn under an object (newly built: a chunk's meshes, a block of the town) to be
 * given to the graphics card over the next frames, wherever the camera looks (sendSome). What's
 * never culled anyway, or seen by no ordinary camera (drawn only into the shadows), is left out.
 * Returns the object.
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
 * Each frame, once it's drawn: the next of those waiting (sendSoon) that are shown in `scene`, as
 * many as have `bytes` to send between them (one at least), drawn once with `renderer`, wherever
 * they are: alone with the scene's lights (all the frame's camera sees, so three.js draws each
 * with the shader it has for it: `lights` gives the scene's, asked only if there's anything to
 * draw), nothing culled, every pixel cut away (a scissor round none), the shadows not drawn again
 * and nothing cleared for it. The renderer, its count of what the frame drew (`info.render`) and
 * the scene are left as they were. How many were drawn (0: none, and nothing done).
 */
export function sendSome(renderer, scene, lights = () => [], bytes = SEND_SOON.bytes) {
    const meshes = next(scene, bytes);

    if (meshes.length === 0) {
        return 0;
    }

    const { layer } = SEND_SOON;
    const culled = meshes.map((mesh) => mesh.frustumCulled);
    const was = {
        viewport: renderer.getViewport(_viewport),
        scissor: renderer.getScissor(_scissor),
        scissored: renderer.getScissorTest(),
        cleared: renderer.autoClear,
        shadows: renderer.shadowMap.autoUpdate,
        shadowed: renderer.shadowMap.needsUpdate,
        background: scene.background,
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        points: renderer.info.render.points,
        lines: renderer.info.render.lines
    };

    for (const mesh of meshes) {
        mesh.layers.enable(layer);
        mesh.frustumCulled = false;
    }

    // (The lights the frame's camera sees, and no other: the same lights, the same shaders)
    for (const light of lights()) {
        if (light.layers.mask & 1) {
            light.layers.enable(layer);
        }
    }

    scene.background = null;
    renderer.autoClear = false;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = false;
    renderer.setScissorTest(true);
    renderer.setScissor(0, 0, 0, 0);
    renderer.setViewport(0, 0, 1, 1);

    try {
        renderer.render(scene, camera);
    } finally {
        renderer.setViewport(was.viewport);
        renderer.setScissor(was.scissor);
        renderer.setScissorTest(was.scissored);
        renderer.autoClear = was.cleared;
        renderer.shadowMap.autoUpdate = was.shadows;
        renderer.shadowMap.needsUpdate = was.shadowed;
        scene.background = was.background;
        // (But which frame three.js is on: it's sent a mesh's corners once a frame by that)
        Object.assign(renderer.info.render, { calls: was.calls, triangles: was.triangles, points: was.points, lines: was.lines });

        meshes.forEach((mesh, k) => {
            mesh.layers.disable(layer);
            mesh.frustumCulled = culled[k];

            // (One three.js didn't draw after all, its material hidden: sent when it's first
            // seen, as it would have been)
            if (watched.has(mesh)) {
                unwatched(mesh);
            }
        });
    }

    return meshes.length;
}

/** How many are waiting to be sent (sendSoon), those hidden or in no scene yet among them. */
export function sendingLeft() {
    return waiting.length;
}
