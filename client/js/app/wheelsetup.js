// The Action wheels options (Game options, Action wheels): what's on the player's action wheels
// (app/wheel.js), their own and a foe's, each with its two sides, drawn as the wheel is. A slice
// tapped (or chosen with the keyboard) lists what can go in it: the healing, stuns and blows
// they've learnt, and the things to use they carry. The one chosen goes in (or it's emptied).
// Tapping S shows the wheel's other side, as flicking it does in play.
//
// It only shows and asks: the game keeps what's chosen (game.js setWheels).

import { useDefs } from "./icons.js";
import { actionOf, drawWheel, FLIP, iconOf, SETTABLE, SIDES } from "./wheel.js";

/** Each wheel's name, and each side's. */
const WHOSE = { self: "Yourself", enemy: "A foe" };
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
        this.choices = { self: [], enemy: [] };
        this.counts = {};

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
        this.list = element("div", "wheels-choices");
        this.list.setAttribute("role", "listbox");
        this.root.replaceChildren(this.whose, this.sides, this.compass, this.heading, this.list);
    }

    /**
     * Show (or show again) the wheels, what can be put on each, and how many of each thing to use
     * there are: { wheels: { self, enemy: [side, side] }, choices: { self: [key], enemy: [key] },
     * counts: { item: count } } (game.js wheelSetup).
     */
    show({ wheels, choices, counts = {} }) {
        this.wheels = structuredClone(wheels);
        this.choices = choices;
        this.counts = counts;
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
        const now = slots[this.place] ?? null;
        const keys = [null, ...this.choices[this.wheel]];

        this.heading.textContent = `${WHOSE[this.wheel]}, ${SIDE_NAMES[this.side].toLowerCase()}, ${COMPASS[this.place]}`;
        this.list.replaceChildren(
            ...keys.map((key) => {
                const label = key ? actionOf(key).label : "Nothing";
                const choice = button("wheels-choice", "", () => this.#put(key));

                choice.setAttribute("role", "option");
                choice.setAttribute("aria-selected", String(key === now));
                choice.dataset.action = key ?? "";
                choice.innerHTML = `<svg viewBox="-24 -24 48 48" width="30" height="30" aria-hidden="true">${key ? iconOf(key) : '<circle r="15" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="4 4" opacity="0.6"/>'}</svg><span></span>`;
                choice.querySelector("span").textContent = label;

                return choice;
            }),
        );
    }
}
