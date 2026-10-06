// The quick actions: in a fight (an enemy the player's set to fight, or anyone after them), four
// slots rise from the bottom of the screen side by side, lifting the player's name and the zoom
// buttons above them. Each holds what the player's put in it (Game options, Quick actions; or
// held on: app/quicksetup.js): a spell, a blow or a thing to use, as a wheel's slice can
// (app/wheel.js QUICK). Tapped, it's used: an attack, a hex or a blow on the enemy the player's
// set to fight; anything else (healing, a ward, a draught) on themselves. While it can't be used
// (an attack with no enemy set on, not learnt, none left, the wrong weapon) it's greyed; while
// it's cooling down, greyed over as much of it as the cooldown has left, swept back round as it
// passes, as a wheel's slice is. The keys 1 to 4 tap them too.
//
// It only shows and hears: the game (game.js) says what's in each and what to do.

import { useDefs } from "./icons.js";
import { actionOf, iconOf, offensive, QUICK } from "./wheel.js";

/** How long a slot's held before it's to be changed (ms), not tapped. */
export const QUICK_HOLD_MS = 500;

/** How long the quick actions stay up once the fight's over (seconds), so they don't flicker. */
export const QUICK_LINGER = 3;

/** Why a quick action can't be used, said when it's tapped (beside core/host.js REFUSALS). */
export const QUICK_REFUSALS = Object.freeze({
    untargeted: "Tap a foe first: that's used on them",
    none: "You've none left",
    weapon: "Not with that weapon",
});

// How far a finger can stray from where it went down and still tap (pixels)
const STRAY = 24;

// How long after a finger's lifted from a slot the click a browser fires for it may come (ms)
const TAP_CLICK_MS = 700;

/**
 * Is a click the keyboard's (Enter or Space on a slot): no count of clicks, and from no pointer
 * (a finger's or a mouse's names its kind; the keyboard's none, or it isn't a pointer's at all).
 */
export const keyboard = (event) => event.detail === 0 && !event.pointerType;

const empty = '<circle r="15" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="4 4" opacity="0.6"/>';

/**
 * Fill a quick action's slot (a button made by quickSlot) with what's in it (`key`: an ACTIONS
 * key, or "item:" and a thing to use; null for nothing), and how many of it there are (`count`, a
 * thing to use). (Also drawn by the Quick actions options: app/quicksetup.js.)
 */
export function fillSlot(slot, key, count = 0) {
    const action = actionOf(key);
    const label = action?.label ?? "Empty";

    if (slot.dataset.action !== (key ?? "")) {
        useDefs();
        slot.dataset.action = key ?? "";
        slot.querySelector(".quick-icon").innerHTML = action ? iconOf(key) : empty;
        slot.querySelector(".quick-label").textContent = label;
        slot.classList.toggle("empty", !action);
        slot.classList.toggle("foe", Boolean(action) && offensive(key));
        slot.classList.toggle("own", Boolean(action) && !offensive(key));
    }

    const counted = action?.item ? String(count) : "";
    const shown = slot.querySelector(".quick-count");

    if (shown.textContent !== counted) {
        shown.textContent = counted;
    }

    const said = action ? `${label}, on ${offensive(key) ? "your foe" : "yourself"}${action.item ? `, ${count} left` : ""}` : "Empty";

    if (slot.getAttribute("aria-label") !== said) {
        slot.setAttribute("aria-label", said);
    }
}

/** A quick action's slot (the `index`th, from the left): a button, filled by fillSlot. */
export function quickSlot(index) {
    const slot = document.createElement("button");

    slot.type = "button";
    slot.className = "quick-slot";
    slot.dataset.slot = String(index);
    slot.innerHTML = `<svg class="quick-icon" viewBox="-24 -24 48 48" aria-hidden="true"></svg><span class="quick-label"></span><span class="quick-count"></span><span class="quick-key" aria-hidden="true">${index + 1}</span><span class="quick-cool" aria-hidden="true"></span>`;
    slot.dataset.action = "-";

    return slot;
}

export class QuickBar {
    /** @param {HTMLElement} root - Where to put it (the HUD, over the game). */
    constructor(root) {
        this.root = root;
        this.element = document.createElement("div");
        this.element.className = "quickbar";
        this.element.setAttribute("role", "toolbar");
        this.element.setAttribute("aria-label", "Quick actions");
        this.element.inert = true;
        this.slots = QUICK.map((_, index) => this.#listen(quickSlot(index), index));
        this.element.append(...this.slots);
        root.append(this.element);

        /** Whether they're up (in a fight). */
        this.up = false;

        /** Hears a slot tapped (its index), to use what's in it. */
        this.onUse = () => {};

        /** Hears a slot held (its index), to change what's in it. */
        this.onChoose = () => {};

        this.left = QUICK.map(() => 0);
    }

    // A slot tapped (used) or held (changed); Enter or Space on it, as a tap. (A tap's used as the
    // finger's lifted; the click a browser fires after it is the tap's, not another: a phone's
    // Chrome gives it no count, as the keyboard's has none, but says it's a finger's)
    #listen(slot, index) {
        let press = null;
        let lifted = -Infinity;

        const end = (use) => (event) => {
            if (press?.pointer !== event.pointerId) {
                return;
            }

            clearTimeout(press.hold);
            lifted = event.timeStamp;

            if (use && !press.held) {
                this.onUse(index);
            }

            press = null;
        };

        slot.addEventListener("pointerdown", (event) => {
            if (press || event.button > 0) {
                return;
            }

            event.preventDefault();
            slot.setPointerCapture?.(event.pointerId);
            press = { pointer: event.pointerId, x: event.clientX, y: event.clientY, held: false };
            press.hold = setTimeout(() => {
                press.held = true;
                globalThis.navigator?.vibrate?.(12);
                this.onChoose(index);
            }, QUICK_HOLD_MS);
        });
        slot.addEventListener("pointermove", (event) => {
            // (Slid off it: neither)
            if (press?.pointer === event.pointerId && !press.held && Math.hypot(event.clientX - press.x, event.clientY - press.y) > STRAY) {
                clearTimeout(press.hold);
                press.held = true;
            }
        });
        slot.addEventListener("pointerup", end(true));
        slot.addEventListener("pointercancel", end(false));
        slot.addEventListener("contextmenu", (event) => event.preventDefault());
        slot.addEventListener("click", (event) => {
            // (Only the keyboard's: a tap's heard as the finger's lifted, and its click isn't)
            if (keyboard(event) && event.timeStamp - lifted > TAP_CLICK_MS) {
                this.onUse(index);
            }
        });

        return slot;
    }

    /** Bring them up (in a fight) or put them away, lifting the player's name and the zoom buttons with them. */
    raise(up) {
        if (up === this.up) {
            return;
        }

        this.up = up;
        this.element.classList.toggle("up", up);
        this.element.inert = !up;
        this.root.classList.toggle("quick-up", up);
    }

    /**
     * Show what's in each slot (`keys`: an ACTIONS key or "item:" and a thing to use, or null),
     * how many of each thing to use there are (`counts`, by item id), and which can't be used as
     * things are (`off`: their indices).
     */
    fill(keys, { counts = {}, off = [] } = {}) {
        this.slots.forEach((slot, index) => {
            const key = keys[index] ?? null;

            fillSlot(slot, key, counts[actionOf(key)?.item] ?? 0);
            slot.classList.toggle("off", off.includes(index));
        });
    }

    /**
     * Grey each slot over the share of it still cooling down (0 to 1, by index), swept round from
     * its top and back as it passes.
     */
    setCooldown(shares) {
        this.slots.forEach((slot, index) => {
            const left = shares[index] > 0.001 ? Math.min(1, shares[index]) : 0;

            if (Math.abs(left - this.left[index]) > 0.002 || (left === 0) !== (this.left[index] === 0)) {
                this.left[index] = left;
                slot.style.setProperty("--left", left.toFixed(3));
                slot.classList.toggle("cooling", left > 0);
            }
        });
    }

    /** Show a slot used (lit) or refused (flashed red) a moment. */
    mark(index, how) {
        const slot = this.slots[index];

        if (!slot) {
            return;
        }

        slot.classList.remove("chosen", "refused");
        void slot.offsetWidth;
        slot.classList.add(how);
        clearTimeout(slot.marking);
        slot.marking = setTimeout(() => slot.classList.remove(how), 320);
    }

    dispose() {
        this.raise(false);
        this.element.remove();
    }
}
