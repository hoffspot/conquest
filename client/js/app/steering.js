// Steering the player with held input rather than by tapping where to go: W, A, S, D (or the arrow
// keys, or whichever the player's set: app/keys.js) on a keyboard, or a mouse button set to one, a
// thumb stick on a touch screen, and a game controller's left stick
// (app/padplay.js: `pad`). Both come out as the order the swipe up
// from the player already gives — straight ahead the way they're pointed (core/battle.js, "ahead") —
// given again as that way turns and stopped when the input's let go. So held input asks nothing new
// of the core: no held keys cross the wire, only the way they add up to.
//
// Held keys run, as in most games, and Shift (the walk key) held along with them walks (the stick runs pushed
// most of the way over). Out of breath, held input walks on the way it's held till enough of it is
// back, then runs again (RUN_AGAIN).
//
// Which way is forward is read off the camera, not the world, so turning the camera turns what
// forward means while a key is still down. A stick's angle goes through whole, which is why a stick
// suits this better than four buttons: the order takes any angle, so diagonals cost nothing.
//
// The stick stays in its corner rather than springing up under the thumb, so it's always in the
// same place and only its own circle takes touches — the rest of the view still taps and drags as
// it did. Or, asked for in Game options (`floating`), it springs up under the thumb wherever it
// lands in the bottom left of the screen, as Apple's guidelines and the camera study's
// recommendation 7 have it: fewer glances down to find it, less drift off it.
//
// A thumb on the stick is never waited on for its lift alone, as an Action Bar press isn't
// (app/press.js): a phone's Safari doesn't always say a finger's lifted, and a stick left held
// would run the player on with nothing touching it. A thumb down on it while another's held takes
// over from the one lost; it's let go of as the stick no longer keeps the pointer
// (`lostpointercapture`), as the page loses the player or is closed, and a moment after every
// finger's off the screen (BARE_MS), if it went down before then. Each one lost is told (`lost`),
// for the debug log.

import { BARE_MS } from "./press.js";
import { heldBy, keysOf } from "./keys.js";

// How far the way has to turn before the order's given again (radians, about 7 degrees), and how
// often it's given again anyway while the input's held (ms), in case they stopped short of where
// it reached
const TURNED = 0.12;
const AGAIN_MS = 500;

// How far ahead held input asks to be taken (metres), not the 400 m a swipe up looks along: given
// again every half second, it never gets there, and the way that near is all on navigation tiles
// already baked (game.js BAKE_AHEAD), where looking 400 m along a new way baked tiles on the spot,
// stalling the game a fifth of a second or more at each turn of the stick
export const HELD_REACH = 30;

// The thumb stick: how far the knob goes from where the thumb went down (px), how far counts as
// pointing anywhere at all, and how far over counts as asking to run (of its reach)
const REACH = 56;
const DEADZONE = 10;
export const RUN_AT = 0.7;

// Out of breath (the battle has a runner with no stamina left walk: battle.js #move, "exhausted"),
// held input walks on till this share of their stamina is back, and only then runs again. Asked to
// run again at once, they'd sprint a moment on the little got back since, run out again and
// stutter between the two, "Out of breath" said each time
export const RUN_AGAIN = 0.25;

// Which way each way's keys mean, against the camera: [forward, right]; and the keys as they come,
// for one not told the player's
const WAYS = new Map([
    ["forward", [1, 0]],
    ["back", [-1, 0]],
    ["left", [0, -1]],
    ["right", [0, 1]],
]);
const AS_THEY_COME = keysOf();

export class Steering {
    #keys = new Set();
    #shift = false;
    #winded = false;
    #stick = null;
    #pad = null;
    #sent = null;
    #frame = 0;
    #listeners = [];
    #baring = 0;
    #how;

    /**
     * @param {object} how
     * @param {HTMLElement} how.zone - The stick's circle, where a thumb going down works it.
     * @param {HTMLElement} how.knob - The knob inside it, moved as the thumb moves.
     * @param {HTMLElement} [how.ring] - The stick's circle, moved under the thumb when it floats.
     * @param {() => number | null} how.looking - Which way the camera looks over the ground
     *   (radians, as core/battle.js means "facing"), or null while there's nobody to steer.
     * @param {(facing: number, run: boolean) => void} how.go - Send them straight ahead that way.
     * @param {() => void} how.stop - Stop them.
     * @param {() => number} [how.breath] - How much of their stamina they have (0 to 1).
     * @param {(lost: { ms: number, how: string }) => void} [how.lost] - Told of a thumb let go
     *   of as lost (its lift never heard): how long it was held, and how it was found ("again":
     *   another thumb down on the stick; "bare": every finger off the screen).
     * @param {() => object} [how.keys] - The keys as the player's set them (app/keys.js keysOf):
     *   which go each way, and which walks; as they come if not told.
     */
    constructor(how) {
        this.#how = how;

        /** Whether the stick springs up under the thumb wherever it lands in its zone (Game options). */
        this.floating = false;

        this.#on(document, "keydown", (event) => this.#key(event, true));
        this.#on(document, "keyup", (event) => this.#key(event, false));

        // Keys aren't let go of while the page isn't listening, so they're dropped instead (and
        // the stick, as the page's closed or put away)
        this.#on(window, "blur", () => this.release());
        this.#on(window, "pagehide", () => this.release());

        this.#on(how.zone, "pointerdown", (event) => this.#thumbDown(event));
        this.#on(how.zone, "pointermove", (event) => this.#thumbMoved(event));

        // (The stick no longer keeping the pointer: after a lift or a cancel, as the browser lets go
        // of it, the thumb's already gone; otherwise, it's lost)
        for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
            this.#on(how.zone, type, (event) => this.#thumbUp(event));
        }

        for (const type of ["touchend", "touchcancel"]) {
            this.#on(document, type, (event) => this.#fingersOff(event), { capture: true, passive: true });
        }
    }

    /** Whether anything's being held now (the hint can go once it is). */
    get steering() {
        return this.#keys.size > 0 || this.#stick !== null || this.#pad !== null;
    }

    /**
     * A game controller's left stick, read each frame (app/padplay.js): how far it's pushed
     * forward (up the stick) and to the right, each -1 to 1, its dead zone already taken off, and
     * whether to walk rather than run (its walk button). Pushed most of the way over (RUN_AT) it
     * runs, as the thumb stick does. Let go (all nought), the player stops.
     */
    pad(forward, right, { walk = false } = {}) {
        const far = Math.hypot(forward, right);
        const was = this.#pad;

        this.#pad = far > 0 ? { forward, right, run: far > RUN_AT && !walk } : null;

        if (this.#pad || was) {
            this.#work();
        }
    }

    /**
     * They've run out of breath (the battle's "exhausted"): held input walks on the way it's held
     * till enough of it's back (RUN_AGAIN), then runs again.
     */
    outOfBreath() {
        this.#winded = true;

        if (this.steering) {
            this.#work();
        }
    }

    /**
     * A mouse button set to a way, or to walk (app/keys.js: "Mouse2" and so on), pressed or let go
     * of: as a key held is.
     */
    mouse(key, down) {
        this.#key({ code: key, target: null, preventDefault() {} }, down);
    }

    /** Let go of everything and stop, as a menu opening or the page losing its keys does. */
    release() {
        const was = this.steering;

        this.#keys.clear();
        this.#shift = false;
        this.#pad = null;
        this.#letGoOfStick();

        if (was) {
            this.#halt();
        }
    }

    /**
     * Take the listeners off again (the game paused or ending). Whatever the thumb was holding is
     * let go of first: a pause with the stick pushed over would otherwise leave it looking held,
     * its knob out of the middle, with nothing listening to put it back.
     */
    dispose() {
        this.#keys.clear();
        this.#shift = false;
        this.#winded = false;
        this.#pad = null;
        this.#letGoOfStick();

        for (const [target, type, listener, options] of this.#listeners) {
            target.removeEventListener(type, listener, options);
        }

        this.#listeners = [];
        cancelAnimationFrame(this.#frame);
        clearTimeout(this.#baring);
        this.#frame = 0;
        this.#sent = null;
    }

    #on(target, type, listener, options) {
        target.addEventListener(type, listener, options);
        this.#listeners.push([target, type, listener, options]);
    }

    #key(event, down) {
        // (Typing a name somewhere isn't walking; nor is a shortcut with a modifier held)
        const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;

        const held = heldBy(this.#how.keys?.() ?? AS_THEY_COME, event.code);

        // (A modifier held is a shortcut, not walking: unless it's the walk key itself)
        if (typing || event.metaKey || ((event.ctrlKey || event.altKey) && !held.length)) {
            if (down) {
                this.release();
            }

            return;
        }

        // Held keys run; the walk key (Shift, as it comes) held alongside a way walks instead,
        // without being a way of its own
        if (held.includes("walk")) {
            this.#shift = down;
        } else if (held.some((id) => WAYS.has(id))) {
            if (down) {
                this.#keys.add(event.code);
            } else {
                this.#keys.delete(event.code);
            }

            // (So the arrow keys don't scroll the page out from under the view)
            event.preventDefault();
        } else {
            return;
        }

        this.#work();
    }

    #thumbDown(event) {
        if (this.#how.looking() === null) {
            return;
        }

        // (Another thumb still held: its lift was lost, and this one takes over)
        if (this.#stick) {
            this.#lost("again");
        }

        // The stick stays put, so the way it's pushed is measured from its middle, wherever the
        // thumb went down inside it (down on the rim is already pointing that way); floating, it
        // comes to the thumb, its middle where it went down
        const rect = this.#how.zone.getBoundingClientRect();
        const ring = this.#how.ring;
        const [x, y] = this.floating ? [event.clientX, event.clientY] : [rect.x + rect.width / 2, rect.y + rect.height / 2];

        if (this.floating && ring) {
            Object.assign(ring.style, { left: `${x - rect.x - ring.offsetWidth / 2}px`, top: `${y - rect.y - ring.offsetHeight / 2}px`, bottom: "auto" });
        }

        this.#stick = { id: event.pointerId, kind: event.pointerType, at: performance.now(), x, y, right: 0, forward: 0, far: 0 };

        try {
            this.#how.zone.setPointerCapture?.(event.pointerId);
        } catch {
            // (A pointer already gone: let go of as the others are)
        }

        this.#how.zone.classList.add("held");

        event.preventDefault();
        this.#thumbMoved(event);
    }

    #thumbMoved(event) {
        if (this.#stick?.id !== event.pointerId) {
            return;
        }

        const [across, down] = [event.clientX - this.#stick.x, event.clientY - this.#stick.y];
        const far = Math.hypot(across, down);
        const held = Math.min(far, REACH);
        const share = held > 0 ? held / far : 0;

        // Up the screen is forward, and the knob stops at the stick's edge
        this.#stick.right = across;
        this.#stick.forward = -down;
        this.#stick.far = held / REACH;
        this.#knobAt(across * share, down * share);

        event.preventDefault();
        this.#work();
    }

    #thumbUp(event) {
        if (this.#stick?.id !== event.pointerId) {
            return;
        }

        this.#letGoOfStick();
        this.#halt();
        event.preventDefault();
    }

    // Every finger off the screen: a moment after (for the thumb's own lift to be heard first), a
    // thumb that went down before then was lost, and is let go of (a mouse's isn't a finger's)
    #fingersOff(event) {
        if (event.touches.length > 0) {
            return;
        }

        const at = performance.now();

        clearTimeout(this.#baring);
        this.#baring = setTimeout(() => {
            if (this.#stick && this.#stick.kind !== "mouse" && this.#stick.at <= at) {
                this.#lost("bare");
            }
        }, BARE_MS);
    }

    // A thumb whose lift was never heard let go of, the player stopped (unless another's taking
    // over), and told
    #lost(how) {
        const ms = performance.now() - this.#stick.at;

        this.#letGoOfStick();

        if (how === "bare") {
            this.#halt();
        }

        this.#how.lost?.({ ms, how });
    }

    #letGoOfStick() {
        if (!this.#stick) {
            return;
        }

        try {
            this.#how.zone.releasePointerCapture?.(this.#stick.id);
        } catch {
            // (A pointer the browser's already forgotten, as a lost one may be)
        }

        this.#how.zone.classList.remove("held");
        this.#stick = null;
        this.#knobAt(0, 0);

        // (Floating, back to where it waits)
        if (this.#how.ring) {
            Object.assign(this.#how.ring.style, { left: "", top: "", bottom: "" });
        }
    }

    #knobAt(across, down) {
        this.#how.knob.style.transform = `translate(calc(-50% + ${across}px), calc(-50% + ${down}px))`;
    }

    // What's held now, added up against the camera: the way to go and whether to run, or null for
    // nothing held (or nothing pointed at, a thumb resting in the stick's middle)
    #wanted() {
        const look = this.#how.looking();

        if (look === null) {
            return null;
        }

        let [forward, right, run] = [0, 0, false];

        if (this.#stick && this.#stick.far * REACH > DEADZONE) {
            forward = this.#stick.forward;
            right = this.#stick.right;
            run = this.#stick.far > RUN_AT;
        } else if (this.#pad) {
            ({ forward, right, run } = this.#pad);
        } else if (this.#keys.size > 0) {
            for (const code of this.#keys) {
                for (const id of heldBy(this.#how.keys?.() ?? AS_THEY_COME, code)) {
                    const [ahead, side] = WAYS.get(id) ?? [0, 0];

                    forward += ahead;
                    right += side;
                }
            }

            // Running, unless the walk key's held
            run = !this.#shift;
        } else {
            return null;
        }

        if (forward === 0 && right === 0) {
            return null;
        }

        // The camera looks along (sin look, cos look) over the ground, so its right hand is a
        // quarter turn back from that; the two together give the way asked for
        const [sin, cos] = [Math.sin(look), Math.cos(look)];
        const x = forward * sin - right * cos;
        const z = forward * cos + right * sin;

        // (Out of breath, walking on till enough's back)
        if (this.#winded && (this.#how.breath?.() ?? 1) >= RUN_AGAIN) {
            this.#winded = false;
        }

        return { facing: Math.atan2(x, z), run: run && !this.#winded };
    }

    // Keep up with what's held: the order's given again as the way turns, and while anything's held
    // (the camera may turn under it), and once more to stop when the last of it is let go
    #work() {
        cancelAnimationFrame(this.#frame);

        const wanted = this.#wanted();

        if (!wanted) {
            if (this.#sent) {
                this.#halt();
            }

            return;
        }

        const turn = this.#sent ? Math.abs(Math.atan2(Math.sin(wanted.facing - this.#sent.facing), Math.cos(wanted.facing - this.#sent.facing))) : Infinity;
        const stale = this.#sent ? performance.now() - this.#sent.at > AGAIN_MS : true;

        if (turn > TURNED || wanted.run !== this.#sent?.run || stale) {
            this.#sent = { facing: wanted.facing, run: wanted.run, at: performance.now() };
            this.#how.go(wanted.facing, wanted.run);
        }

        this.#frame = requestAnimationFrame(() => this.#work());
    }

    #halt() {
        cancelAnimationFrame(this.#frame);
        this.#frame = 0;

        if (this.#sent) {
            this.#sent = null;
            this.#how.stop();
        }
    }
}
