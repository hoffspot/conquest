// Steering the player with held input rather than by tapping where to go: W, A, S, D (or the arrow
// keys) on a keyboard, and a thumb stick on a touch screen. Both come out as the order the swipe up
// from the player already gives — straight ahead the way they're pointed (core/battle.js, "ahead") —
// given again as that way turns and stopped when the input's let go. So held input asks nothing new
// of the core: no held keys cross the wire, only the way they add up to.
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

// How far the way has to turn before the order's given again (radians, about 7 degrees), and how
// often it's given again anyway while the input's held (ms), in case they stopped short of the
// 400 m an "ahead" order reaches
const TURNED = 0.12;
const AGAIN_MS = 500;

// The thumb stick: how far the knob goes from where the thumb went down (px), how far counts as
// pointing anywhere at all, and how far over counts as asking to run (of its reach)
const REACH = 56;
const DEADZONE = 10;
const RUN_AT = 0.7;

// Which way each key means, against the camera: [forward, right]
const KEYS = new Map([
    ["KeyW", [1, 0]],
    ["KeyS", [-1, 0]],
    ["KeyA", [0, -1]],
    ["KeyD", [0, 1]],
    ["ArrowUp", [1, 0]],
    ["ArrowDown", [-1, 0]],
    ["ArrowLeft", [0, -1]],
    ["ArrowRight", [0, 1]],
]);

export class Steering {
    #keys = new Set();
    #shift = false;
    #stick = null;
    #sent = null;
    #frame = 0;
    #listeners = [];
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
     */
    constructor(how) {
        this.#how = how;

        /** Whether the stick springs up under the thumb wherever it lands in its zone (Game options). */
        this.floating = false;

        this.#on(document, "keydown", (event) => this.#key(event, true));
        this.#on(document, "keyup", (event) => this.#key(event, false));

        // Keys aren't let go of while the page isn't listening, so they're dropped instead
        this.#on(window, "blur", () => this.release());

        this.#on(how.zone, "pointerdown", (event) => this.#thumbDown(event));
        this.#on(how.zone, "pointermove", (event) => this.#thumbMoved(event));

        for (const type of ["pointerup", "pointercancel"]) {
            this.#on(how.zone, type, (event) => this.#thumbUp(event));
        }
    }

    /** Whether anything's being held now (the hint can go once it is). */
    get steering() {
        return this.#keys.size > 0 || this.#stick !== null;
    }

    /** Let go of everything and stop, as a menu opening or the page losing its keys does. */
    release() {
        const was = this.steering;

        this.#keys.clear();
        this.#shift = false;
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
        this.#letGoOfStick();

        for (const [target, type, listener] of this.#listeners) {
            target.removeEventListener(type, listener);
        }

        this.#listeners = [];
        cancelAnimationFrame(this.#frame);
        this.#frame = 0;
        this.#sent = null;
    }

    #on(target, type, listener) {
        target.addEventListener(type, listener);
        this.#listeners.push([target, type, listener]);
    }

    #key(event, down) {
        // (Typing a name somewhere isn't walking; nor is a shortcut with a modifier held)
        const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;

        if (typing || event.ctrlKey || event.metaKey || event.altKey) {
            if (down) {
                this.release();
            }

            return;
        }

        // Shift is how a click already asks to run, so it does the same here: held alongside a way,
        // it turns walking into running without being a way of its own
        if (event.key === "Shift") {
            this.#shift = down;
        } else if (KEYS.has(event.code)) {
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
        if (this.#stick || this.#how.looking() === null) {
            return;
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

        this.#stick = { id: event.pointerId, x, y, right: 0, forward: 0, far: 0 };
        this.#how.zone.setPointerCapture?.(event.pointerId);
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

    #letGoOfStick() {
        if (!this.#stick) {
            return;
        }

        this.#how.zone.releasePointerCapture?.(this.#stick.id);
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
        } else if (this.#keys.size > 0) {
            for (const code of this.#keys) {
                const [ahead, side] = KEYS.get(code);

                forward += ahead;
                right += side;
            }

            // Shift held is running, as it is for a click (game.js: tap)
            run = this.#shift;
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

        return { facing: Math.atan2(x, z), run };
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
