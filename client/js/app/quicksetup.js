// The Action Bar options (Game options, Action Wheel and Bar, Action Bar; or one of its actions
// held on in a fight): the Action Bar (app/quickbar.js), four or six as they're shown, drawn as they rise in a
// fight. A slot tapped (or
// chosen with the keyboard) lists what can go in it: the spells, blows and things to use that can
// go on either action wheel, each saying who it's used on. The one chosen goes in (or it's
// emptied).
//
// It only shows and asks: the game keeps what's chosen (game.js setQuick).

import { useDefs } from "./icons.js";
import { fillSlot, quickSlot } from "./quickbar.js";
import { actionOf, iconOf, offensive, QUICK, QUICK_SHOWN } from "./wheel.js";

const element = (tag, className, text = "") => Object.assign(document.createElement(tag), { className, textContent: text });

export class QuickSetup {
    /** @param {HTMLElement} root - Where to draw it (the menu's Action Bar page). */
    constructor(root) {
        this.root = root;
        this.slot = 0;
        this.quick = [...QUICK];
        this.choices = [];
        this.counts = {};

        /** Hears the Action Bar whenever something's put in (or taken out of) one of its slots. */
        this.onChange = () => {};

        this.row = element("div", "quick-row");
        this.row.setAttribute("role", "tablist");
        this.row.setAttribute("aria-label", "Which slot of the Action Bar");
        this.slots = QUICK.map((_, index) => {
            const slot = quickSlot(index);

            slot.setAttribute("role", "tab");
            slot.addEventListener("click", () => this.#pick(index));

            return slot;
        });
        this.row.append(...this.slots);
        this.shown = QUICK_SHOWN.four;
        this.heading = element("h3", "wheels-heading");
        this.list = element("div", "wheels-choices");
        this.list.setAttribute("role", "listbox");
        this.root.replaceChildren(this.row, this.heading, this.list);
    }

    /**
     * Show (or show again) the Action Bar, what can be put in its slots, and how many of each thing
     * to use there are: { quick: [key], choices: [key], counts: { item: count } } (game.js
     * quickSetup), with the `slot`th chosen.
     */
    show({ quick, choices, counts = {} }, slot = this.slot) {
        this.quick = [...quick];
        this.choices = choices;
        this.counts = counts;
        this.#pick(slot);
    }

    /** Show four of them or six (`count`: QUICK_SHOWN), as the Action Bar is. */
    showCount(count) {
        this.shown = count === QUICK_SHOWN.six ? QUICK_SHOWN.six : QUICK_SHOWN.four;
        this.row.classList.toggle("six", this.shown === QUICK_SHOWN.six);
        this.row.style.setProperty("--quick-count", String(this.shown));
        this.slots.forEach((slot, index) => (slot.hidden = index >= this.shown));
        this.#pick(this.slot);
    }

    // Another slot (one of those shown)
    #pick(slot) {
        this.slot = Math.max(0, Math.min(this.shown - 1, slot));
        this.#draw();
    }

    // Put something in the chosen slot (null: empty it), and say so
    #put(key) {
        this.quick[this.slot] = key;
        this.onChange([...this.quick]);
        this.#draw();
    }

    #draw() {
        useDefs();

        this.slots.forEach((slot, index) => {
            const key = this.quick[index] ?? null;

            fillSlot(slot, key, this.counts[actionOf(key)?.item] ?? 0);
            slot.setAttribute("aria-selected", String(index === this.slot));
            slot.classList.toggle("picked", index === this.slot);
        });

        // What can go in the chosen slot, each saying who it's used on
        const now = this.quick[this.slot] ?? null;
        const keys = [null, ...this.choices];

        this.heading.textContent = `Action Bar slot ${this.slot + 1}`;
        this.list.replaceChildren(
            ...keys.map((key) => {
                const choice = element("button", "wheels-choice");

                choice.type = "button";
                choice.setAttribute("role", "option");
                choice.setAttribute("aria-selected", String(key === now));
                choice.dataset.action = key ?? "";
                choice.innerHTML = `<svg viewBox="-24 -24 48 48" width="30" height="30" aria-hidden="true">${key ? iconOf(key) : '<circle r="15" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="4 4" opacity="0.6"/>'}</svg><span><span class="choice-name"></span><small></small></span>`;
                choice.querySelector(".choice-name").textContent = key ? actionOf(key).label : "Nothing";
                choice.querySelector("small").textContent = key ? (offensive(key) ? "On your foe" : "On yourself") : "";
                choice.addEventListener("click", () => this.#put(key));

                return choice;
            }),
        );
    }
}
