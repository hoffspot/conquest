// The Action Bar: in a fight (an enemy the player's set to fight, or anyone after them), four
// slots (or six: Game options) rise from the bottom of the screen side by side, lifting the
// player's name and the zoom buttons above them. Each holds what the player's put in it (Game
// options, Action Wheel and Bar, Action Bar; or held on: app/quicksetup.js): a spell, a blow or a thing to use, as a
// wheel's slice can (app/wheel.js QUICK). Tapped, it's used: an attack, a hex or a blow on the
// enemy the player's set to fight; anything else (healing, a ward, a draught) on themselves. While
// it can't be used (an attack with no enemy set on, not learnt, none left, the wrong weapon) it's
// greyed; while it's cooling down, greyed over as much of it as the cooldown has left, swept back
// round as it passes, as a wheel's slice is. The keys 1 to 4 (or 6) tap them too. Flicked up or
// down, a school's spell in one turns to the next of its school or the last, rolling in like a
// slot machine's reel (wheel.js flicked); at either end of its school, it bounces. While a
// Prismatic chain of the player's is live (core/prismatic.js), a slot holding one of its
// element's spells shows the chain's next, rolled in, ringed in the element's colour with a
// dashed border marching round it, pulsing (game.js #quickKeys).
//
// Six across, each slot's name is smaller where they're narrow, and where they're narrower still
// (a phone held upright) only their icons are shown (styles.css), a flicked spell's name said a
// moment over its slot.
//
// A slot's press never waits on its lift (app/press.js): a phone's Safari doesn't always say a
// finger's lifted, and a slot left waiting heard no touch again till the page was loaded again. A
// touch on a slot still pressed takes over from the press lost; a press is let go of as the bar's
// put away, the game stops listening, the page is hidden or loses the player, and once every
// finger's off the screen (a moment after: press.js BARE_MS).
//
// It only shows and hears: the game (game.js) says what's in each and what to do.

import { useDefs } from "./icons.js";
import { BARE_MS, Press } from "./press.js";
import { actionOf, iconOf, offensive, QUICK, QUICK_SHOWN } from "./wheel.js";

export { QUICK_HOLD_MS } from "./press.js";

/** How long the Action Bar stays up once the fight's over (seconds), so it doesn't flicker. */
export const QUICK_LINGER = 3;

/** Why an Action Bar action can't be used, said when it's tapped (beside core/host.js REFUSALS). */
export const QUICK_REFUSALS = Object.freeze({
    untargeted: "Tap a foe first: that's used on them",
    none: "You've none left",
    weapon: "Not with that weapon",
});

/**
 * A flicked slot's reel: how long the old spell takes to roll out and the new one in (ms), and
 * the bounce at either end of a school (ms, and how far it gives: pixels); how long a flicked
 * spell's name is said over its slot, where only icons are shown (ms).
 */
export const REEL = Object.freeze({ roll: 200, bounce: 260, give: 9, named: 1100 });

// (Without motion, if the player's asked for less of it)
const still = () => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

// How long after a finger's lifted from a slot the click a browser fires for it may come (ms)
const TAP_CLICK_MS = 700;

/**
 * Is a click the keyboard's (Enter or Space on a slot): no count of clicks, and from no pointer
 * (a finger's or a mouse's names its kind; the keyboard's none, or it isn't a pointer's at all).
 */
export const keyboard = (event) => event.detail === 0 && !event.pointerType;

const empty = '<circle r="15" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="4 4" opacity="0.6"/>';

/**
 * Fill an Action Bar slot (a button made by quickSlot) with what's in it (`key`: an ACTIONS
 * key, or "item:" and a thing to use; null for nothing), and how many of it there are (`count`, a
 * thing to use). (Also drawn by the Action Bar options: app/quicksetup.js.)
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

/** An Action Bar slot (the `index`th, from the left): a button, filled by fillSlot. */
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
        this.element.setAttribute("aria-label", "Action Bar");
        this.element.inert = true;

        /** Each slot's press (app/press.js), by index. */
        this.presses = [];
        this.slots = QUICK.map((_, index) => this.#listen(quickSlot(index), index));
        this.named = Object.assign(document.createElement("span"), { className: "quick-name" });
        this.named.setAttribute("aria-hidden", "true");
        this.element.append(...this.slots, this.named);
        root.append(this.element);

        /** Whether they're up (in a fight). */
        this.up = false;

        /** How many are shown: four, or six across (QUICK_SHOWN). */
        this.shown = QUICK_SHOWN.four;
        this.show(this.shown);

        /** Hears a slot tapped (its index), to use what's in it. */
        this.onUse = () => {};

        /** Hears a slot held (its index), to change what's in it. */
        this.onChoose = () => {};

        /** Hears a slot flicked (its index, and "up" or "down"), to turn its spell to another of its school. */
        this.onFlick = () => {};

        /** Hears a slot's press dropped as lost (its index, and Press onStale's: how long it was held, and how it was found), for the debug log. */
        this.onStale = () => {};

        this.left = QUICK.map(() => 0);

        // (Let go of as the page loses the player or is hidden; and dropped, if begun before, a
        // moment after every finger's off the screen: Safari can lose a finger's lift, not its
        // touch's end)
        this.away = () => this.release();
        this.hiding = () => document.hidden && this.release();
        this.bare = (event) => {
            if (event.touches.length > 0) {
                return;
            }

            const at = performance.now();

            clearTimeout(this.baring);
            this.baring = setTimeout(() => this.presses.forEach((press) => press.bare(at)), BARE_MS);
        };
        window.addEventListener("blur", this.away);
        window.addEventListener("pagehide", this.away);
        document.addEventListener("visibilitychange", this.hiding);

        for (const type of ["touchend", "touchcancel"]) {
            document.addEventListener(type, this.bare, { capture: true, passive: true });
        }

        // (The click a browser fires after a finger's lifted from a slot lands on whatever's under
        // it by then: the slot, after a tap; but the Action Bar options, after a hold (opened over the finger
        // still down) or an empty slot's tap, where "Back to the game" lies over the slot at the
        // foot of a phone's screen and would close it again at once. One that comes within
        // TAP_CLICK_MS of the lift, anywhere but the bar, is swallowed)
        this.holding = null;
        this.liftedAt = -Infinity;
        this.lifted = (event) => {
            if (event.pointerId !== this.holding && !this.element.contains(event.target)) {
                return;
            }

            this.holding = null;
            this.liftedAt = event.type === "pointerup" ? performance.now() : -Infinity;
        };
        this.swallow = (event) => {
            if (performance.now() - this.liftedAt > TAP_CLICK_MS) {
                return;
            }

            this.liftedAt = -Infinity;

            if (!this.element.contains(event.target)) {
                event.preventDefault();
                event.stopImmediatePropagation();
            }
        };

        for (const type of ["pointerup", "pointercancel"]) {
            window.addEventListener(type, this.lifted, true);
        }

        window.addEventListener("click", this.swallow, true);
    }

    /** Show four of them (with their names) or six across (`count`: QUICK_SHOWN). */
    show(count) {
        this.shown = count === QUICK_SHOWN.six ? QUICK_SHOWN.six : QUICK_SHOWN.four;
        this.element.classList.toggle("six", this.shown === QUICK_SHOWN.six);
        this.element.style.setProperty("--quick-count", String(this.shown));
        this.slots.forEach((slot, index) => (slot.hidden = index >= this.shown));
    }

    // A slot tapped (used), held (changed) or flicked up or down (its spell turned: app/press.js);
    // Enter or Space on it, as a tap. (A tap's used as the finger's lifted; the click a browser
    // fires after it is the tap's, not another: a phone's Chrome gives it no count, as the
    // keyboard's has none, but says it's a finger's)
    #listen(slot, index) {
        const press = new Press({ live: () => this.up });
        const heard = (event) => ({ pointer: event.pointerId, x: event.clientX, y: event.clientY, button: event.button, kind: event.pointerType });
        let lifted = -Infinity;

        press.onUse = () => this.onUse(index);
        press.onChoose = (pointer) => {
            this.holding = pointer;
            globalThis.navigator?.vibrate?.(12);
            this.onChoose(index);
        };
        press.onFlick = (way) => this.onFlick(index, way);
        press.onStale = (lost) => this.onStale(index, lost);
        this.presses[index] = press;

        slot.addEventListener("pointerdown", (event) => {
            if (!press.down(heard(event))) {
                return;
            }

            event.preventDefault();

            try {
                slot.setPointerCapture?.(event.pointerId);
            } catch {
                // (A pointer already gone: its press is let go of as the others are)
            }
        });
        slot.addEventListener("pointermove", (event) => press.move(heard(event)));
        slot.addEventListener("pointerup", (event) => {
            lifted = event.timeStamp;
            press.up(heard(event));
        });
        slot.addEventListener("pointercancel", (event) => {
            lifted = event.timeStamp;
            press.cancel(heard(event));
        });
        // (Kept to the slot no longer: after a lift or a cancel, as the browser lets go of it, nothing
        // to drop; otherwise, lost)
        slot.addEventListener("lostpointercapture", (event) => press.cancel(heard(event)));
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

        // (Put away with a finger still on a slot: no lift's heard by a slot put away)
        if (!up) {
            this.release();
        }
    }

    /** Let go of every slot's press, nothing used (the bar put away, the game not listening, the page hidden). */
    release() {
        clearTimeout(this.baring);
        this.presses.forEach((press) => press.release());
    }

    /**
     * Show what's in each slot (`keys`: an ACTIONS key or "item:" and a thing to use, or null),
     * how many of each thing to use there are (`counts`, by item id), which can't be used as
     * things are (`off`: their indices), and which hold a Prismatic chain's next spell (`chain`:
     * its element, by index), ringed and pulsing.
     */
    fill(keys, { counts = {}, off = [], chain = {} } = {}) {
        this.slots.forEach((slot, index) => {
            const key = keys[index] ?? null;
            const element = chain[index] ?? "";

            fillSlot(slot, key, counts[actionOf(key)?.item] ?? 0);
            slot.classList.toggle("off", off.includes(index));

            if ((slot.dataset.chain ?? "") !== element) {
                slot.dataset.chain = element;
                slot.classList.toggle("chain", Boolean(element));
            }
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

    /**
     * A slot's spell flicked `way` ("up" or "down") to another (`key`, with `count` of it, if it's a
     * thing to use): the old one rolled out that way and the new one in after it, like a slot
     * machine's reel, quickly; its name said a moment over it, where only icons are shown.
     */
    roll(index, way, key, count = 0) {
        const slot = this.slots[index];

        if (!slot) {
            return;
        }

        const parts = [slot.querySelector(".quick-icon"), slot.querySelector(".quick-label")];
        const ghost = document.createElement("span");

        ghost.className = "quick-ghost";
        ghost.setAttribute("aria-hidden", "true");
        ghost.append(...parts.map((part) => part.cloneNode(true)));
        slot.querySelector(".quick-ghost")?.remove();
        fillSlot(slot, key, count);
        this.#name(slot, actionOf(key)?.label ?? "");

        if (still() || typeof slot.animate !== "function") {
            return;
        }

        // (The reel's as tall as the slot: out of it one way, in from the other)
        const reel = (way === "up" ? -1 : 1) * slot.clientHeight;

        slot.prepend(ghost);
        ghost.animate([{ transform: "translateY(0)", opacity: 1 }, { transform: `translateY(${reel}px)`, opacity: 0.25, filter: "blur(1px)" }], { duration: REEL.roll * 0.8, easing: "cubic-bezier(0.5, 0, 0.9, 0.6)", fill: "forwards" }).finished.then(
            () => ghost.remove(),
            () => ghost.remove(),
        );

        for (const part of parts) {
            part.animate([{ transform: `translateY(${-reel}px)`, filter: "blur(1px)" }, { transform: "translateY(0)", filter: "blur(0)" }], { duration: REEL.roll, easing: "cubic-bezier(0.25, 1.35, 0.4, 1)" });
        }
    }

    /** A slot flicked `way` ("up" or "down") with nothing further that way: it gives a little, and springs back. */
    bounce(index, way) {
        const slot = this.slots[index];

        if (!slot || still() || typeof slot.animate !== "function") {
            return;
        }

        const give = (way === "up" ? -1 : 1) * REEL.give;

        for (const part of [slot.querySelector(".quick-icon"), slot.querySelector(".quick-label")]) {
            part.animate([{ transform: "translateY(0)" }, { transform: `translateY(${give}px)`, offset: 0.35 }, { transform: `translateY(${-give * 0.25}px)`, offset: 0.7 }, { transform: "translateY(0)" }], { duration: REEL.bounce, easing: "ease-out" });
        }
    }

    // Where only icons are shown (six across, narrow: styles.css), a slot's name said a moment over it
    #name(slot, label) {
        const shownLabel = slot.querySelector(".quick-label");

        if (!label || !globalThis.getComputedStyle || getComputedStyle(shownLabel).display !== "none") {
            return;
        }

        this.named.textContent = label;
        this.named.style.left = `${slot.offsetLeft + slot.offsetWidth / 2}px`;
        this.named.classList.remove("said");
        void this.named.offsetWidth;
        this.named.classList.add("said");
        clearTimeout(this.naming);
        this.naming = setTimeout(() => this.named.classList.remove("said"), REEL.named);
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
        clearTimeout(this.naming);
        this.raise(false);
        this.release();
        window.removeEventListener("blur", this.away);
        window.removeEventListener("pagehide", this.away);
        document.removeEventListener("visibilitychange", this.hiding);

        for (const type of ["touchend", "touchcancel"]) {
            document.removeEventListener(type, this.bare, { capture: true });
        }

        for (const type of ["pointerup", "pointercancel"]) {
            window.removeEventListener(type, this.lifted, true);
        }

        window.removeEventListener("click", this.swallow, true);
        this.element.remove();
    }
}
