// The Action wheels options (Game options, Action Wheel and Bar, Action wheels): what's on the
// player's action wheels (app/wheel.js), their own, a foe's and their followers', each with its
// two sides, drawn as the wheel is. A slice tapped (or chosen with the keyboard) lists what can go
// in it (app/choices.js, by what kind they are): the healing, stuns and blows they've learnt, the
// things to use they carry, and on their followers' what to tell them (their own ability among
// it). The one chosen goes in (or it's emptied). Tapping S shows the wheel's other side, as flicking it does in play.
//
// It only shows and asks: the game keeps what's chosen (game.js setWheels).

import { ChoiceList } from "./choices.js";
import { useDefs } from "./icons.js";
import { actionOf, drawWheel, FLIP, SETTABLE, SIDES } from "./wheel.js";

/** Each wheel's name, and each side's. */
const WHOSE = { self: "Yourself", enemy: "A foe", unit: "Your followers" };
const SIDE_NAMES = ["Wheel one", "Wheel two"];

/** Each direction's name, as a compass has it. */
const COMPASS = { n: "N", ne: "NE", e: "E", se: "SE", s: "S", sw: "SW", w: "W", nw: "NW" };

// How big the wheel's drawn here (pixels)
const OUTER = 112;
const INNER = 30;

const element = (tag, className, text = "") => Object.assign(document.createElement(tag), { className, textContent: text });

function button(className, text, onClick) {
    const each = element("button", className, text);

    each.type = "button";
    each.addEventListener("click", onClick);

    return each;
}

export class WheelSetup {
    /** @param {HTMLElement} root - Where to draw it (the menu's Action wheels page). */
    constructor(root) {
        this.root = root;
        this.wheel = "self";
        this.side = 0;
        this.place = "n";
        this.wheels = null;
        this.choices = { self: [], enemy: [], unit: [] };
        this.counts = {};
        this.unready = [];

        /** Hears the wheels whenever something's put on (or taken off) one. */
        this.onChange = () => {};

        this.whose = element("div", "wheels-whose");
        this.whose.setAttribute("role", "tablist");
        this.whose.setAttribute("aria-label", "Whose wheel");
        this.sides = element("div", "wheels-sides");
        this.sides.setAttribute("role", "tablist");
        this.sides.setAttribute("aria-label", "Which side");

        for (const wheel of SETTABLE) {
            const tab = button("wheels-tab", WHOSE[wheel], () => this.#pick({ wheel }));

            tab.dataset.wheel = wheel;
            tab.setAttribute("role", "tab");
            this.whose.append(tab);
        }

        for (let side = 0; side < SIDES; side++) {
            const tab = button("wheels-tab", SIDE_NAMES[side], () => this.#pick({ side }));

            tab.dataset.side = String(side);
            tab.setAttribute("role", "tab");
            this.sides.append(tab);
        }

        this.compass = element("div", "wheels-compass");
        this.heading = element("h3", "wheels-heading");
        this.list = new ChoiceList();
        this.root.replaceChildren(this.whose, this.sides, this.compass, this.heading, this.list.element);
    }

    /**
     * Show (or show again) the wheels, what can be put on each, how many of each thing to use
     * there are, and which can't be used as things are: { wheels: { self, enemy, unit: [side,
     * side] }, choices: { self, enemy, unit: [key] }, counts: { item: count }, unready: [key] }
     * (game.js wheelSetup).
     */
    show({ wheels, choices, counts = {}, unready = [] }) {
        this.wheels = structuredClone(wheels);
        this.choices = choices;
        this.counts = counts;
        this.unready = unready;
        this.#draw();
    }

    // Another wheel, side or slice
    #pick({ wheel = this.wheel, side = this.side, place = this.place }) {
        this.wheel = wheel;
        this.side = side;
        this.place = place;
        this.#draw();
    }

    // Put something in the chosen slice (null: empty it), and say so
    #put(key) {
        const slots = this.wheels[this.wheel][this.side];

        if (key) {
            slots[this.place] = key;
        } else {
            delete slots[this.place];
        }

        this.onChange(structuredClone(this.wheels));
        this.#draw();
    }

    #draw() {
        const slots = this.wheels[this.wheel][this.side];
        const size = 2 * OUTER + 8;

        useDefs();

        for (const tab of this.whose.children) {
            tab.setAttribute("aria-selected", String(tab.dataset.wheel === this.wheel));
        }

        for (const tab of this.sides.children) {
            tab.setAttribute("aria-selected", String(Number(tab.dataset.side) === this.side));
        }

        // The wheel, as it opens in play: each slice a button
        this.compass.innerHTML = `<svg viewBox="${-OUTER - 4} ${-OUTER - 4} ${size} ${size}" width="${size}" height="${size}">${drawWheel({ slots, side: this.side, flip: true, counts: this.counts, outer: OUTER, inner: INNER })}</svg>`;

        for (const slice of this.compass.querySelectorAll(".slice")) {
            const direction = slice.dataset.direction;
            const flips = direction === FLIP;
            const choose = () => (flips ? this.#pick({ side: (this.side + 1) % SIDES }) : this.#pick({ place: direction }));

            slice.setAttribute("role", "button");
            slice.setAttribute("tabindex", "0");
            slice.setAttribute("aria-label", flips ? `S: turns to ${SIDE_NAMES[(this.side + 1) % SIDES].toLowerCase()}` : `${COMPASS[direction]}: ${actionOf(slots[direction])?.label ?? "empty"}`);
            slice.classList.toggle("picked", !flips && direction === this.place);
            slice.addEventListener("click", choose);
            slice.addEventListener("keydown", (event) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    choose();
                }
            });
        }

        // What can go in the chosen slice
        this.heading.textContent = `${WHOSE[this.wheel]}, ${SIDE_NAMES[this.side].toLowerCase()}, ${COMPASS[this.place]}`;
        this.list.show({ keys: this.choices[this.wheel], now: slots[this.place] ?? null, unready: this.unready, label: (key) => actionOf(key).listed ?? actionOf(key).label, onPick: (key) => this.#put(key) });
    }
}
