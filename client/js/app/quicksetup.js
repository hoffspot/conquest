// The Action Bar options (Game options, Action Wheel and Bar, Action Bar; or one of its actions
// held on in a fight): the Action Bar (app/quickbar.js), four or six as they're shown, drawn as they rise in a
// fight; Action Bar 1 or Action Bar 2, chosen above them (each its own slots). A slot tapped (or
// chosen with the keyboard) lists what can go in it: the spells, blows and things to use that can
// go on either action wheel, each saying who it's used on. The one chosen goes in (or it's
// emptied).
//
// It only shows and asks: the game keeps what's chosen (game.js setQuick).

import { useDefs } from "./icons.js";
import { fillSlot, quickSlot } from "./quickbar.js";
import { actionOf, iconOf, offensive, QUICK, QUICK_SHOWN, QUICK_TWO } from "./wheel.js";

const element = (tag, className, text = "") => Object.assign(document.createElement(tag), { className, textContent: text });

export class QuickSetup {
    /** @param {HTMLElement} root - Where to draw it (the menu's Action Bar page). */
    constructor(root) {
        this.root = root;
        this.slot = 0;

        /** Which bar's slots are shown: 0, Action Bar 1, or 1, Action Bar 2. */
        this.bar = 0;
        this.bars = [[...QUICK], [...QUICK_TWO]];
        this.choices = [];
        this.counts = {};

        /**
         * Hears the Action Bar whenever something's put in (or taken out of) one of its slots: that
         * bar's slots, and which bar (0 or 1).
         */
        this.onChange = () => {};

        // Which bar: Action Bar 1 or Action Bar 2 (tabs, as the action wheels' sides are)
        this.picker = element("div", "wheels-sides quick-bars");
        this.picker.setAttribute("role", "tablist");
        this.picker.setAttribute("aria-label", "Which bar");
        this.barButtons = [0, 1].map((bar) => {
            const button = element("button", "wheels-tab", `Action Bar ${bar + 1}`);

            button.type = "button";
            button.dataset.bar = String(bar + 1);
            button.setAttribute("role", "tab");
            button.addEventListener("click", () => this.#pickBar(bar));

            return button;
        });
        this.picker.append(...this.barButtons);

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
        this.root.replaceChildren(this.picker, this.row, this.heading, this.list);
    }

    /** The slots of the bar shown. */
    get quick() {
        return this.bars[this.bar];
    }

    /**
     * Show (or show again) the Action Bar, both its bars, what can be put in their slots, and how
     * many of each thing to use there are: { quick: [key], quickTwo: [key], choices: [key],
     * counts: { item: count } } (game.js quickSetup), with the `bar`th bar shown (0 or 1) and its
     * `slot`th slot chosen.
     */
    show({ quick, quickTwo = QUICK_TWO, choices, counts = {} }, slot = this.slot, bar = this.bar) {
        this.bars = [[...quick], [...quickTwo]];
        this.choices = choices;
        this.counts = counts;
        this.bar = bar ? 1 : 0;
        this.#pick(slot);
    }

    // The other bar's slots shown, the same slot chosen in it
    #pickBar(bar) {
        this.bar = bar;
        this.#pick(this.slot);
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
        this.onChange([...this.quick], this.bar);
        this.#draw();
    }

    #draw() {
        useDefs();

        this.barButtons.forEach((button, bar) => button.setAttribute("aria-selected", String(bar === this.bar)));
        this.row.dataset.bar = String(this.bar + 1);

        this.slots.forEach((slot, index) => {
            const key = this.quick[index] ?? null;

            fillSlot(slot, key, this.counts[actionOf(key)?.item] ?? 0);
            slot.setAttribute("aria-selected", String(index === this.slot));
            slot.classList.toggle("picked", index === this.slot);
        });

        // What can go in the chosen slot, each saying who it's used on
        const now = this.quick[this.slot] ?? null;
        const keys = [null, ...this.choices];

        this.heading.textContent = `Action Bar ${this.bar + 1}, slot ${this.slot + 1}`;
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
