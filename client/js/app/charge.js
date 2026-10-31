// A legendary weapon's charge (core/legendary.js), over the player's card beside where the
// Prismatic sigil shows (app/sigil.js; styles.css): a ring of as many marks as the blows that fill
// it, each lit as a blow's struck, in the colour of the weapon's effect, its sign in the middle.
// Full, it glows and pulses, waiting for the next blow to land; let loose, it flares and empties.
// It shows only while it's filling: none struck yet, or thirty seconds without fighting
// (CHARGE.idle), and it's gone. Not a button: there's nothing to do with it but fight.
//
// It only shows: the game (game.js) says how full it is.

import { CHARGE, EFFECTS } from "../core/legendary.js";

/** Each effect's colour on the charge (and in the world: world/legendaries.js). */
export const EFFECT_COLOURS = Object.freeze({ frostbind: "#8fd8ff", cinderburst: "#ff7a2a", earthsunder: "#c8a060", stormlash: "#c8c0ff", ruinblast: "#ffd060", cleave: "#c8d4e0" });

// Each effect's sign in the middle of the ring (viewBox -32 to 32)
const SIGNS = Object.freeze({
    // (A snowflake)
    frostbind: "M0,-11 L0,11 M-9.5,-5.5 L9.5,5.5 M-9.5,5.5 L9.5,-5.5 M-3,-9 L0,-6 L3,-9 M-3,9 L0,6 L3,9",
    // (A flame)
    cinderburst: "M0,-12 C5,-6 8,-2 7,3 C6,9 2,11 0,11 C-2,11 -6,9 -7,3 C-8,-2 -3,-4 -2,-8 C0,-4 2,-6 0,-12 Z",
    // (Stone spears)
    earthsunder: "M-10,9 L-6,-4 L-3,9 Z M-3,9 L1,-11 L5,9 Z M4,9 L8,-2 L11,9 Z",
    // (A forked bolt)
    stormlash: "M3,-12 L-5,1 L0,1 L-3,12 L7,-3 L1,-3 Z",
    // (A burst)
    ruinblast: "M0,-12 L2.5,-4 L10,-6 L5,0 L10,6 L2.5,4 L0,12 L-2.5,4 L-10,6 L-5,0 L-10,-6 L-2.5,-4 Z",
});

/** What the charge says, for a screen reader (and its tooltip). */
export function chargeSaid({ effect, charge, of }) {
    const label = EFFECTS[effect]?.label ?? effect;

    return charge >= of ? `${label} charged: let loose with your next blow that lands` : `${label}: ${charge} of ${of} blows charged`;
}

export class Charge {
    /** @param {HTMLElement} root - Where to put it (the player's card, hud.js plate). */
    constructor(root) {
        this.element = document.createElement("div");
        this.element.className = "charge";
        this.element.hidden = true;
        this.element.setAttribute("role", "status");
        this.element.innerHTML = `<svg class="charge-ring" viewBox="-32 -32 64 64" aria-hidden="true">
            <circle class="charge-back" r="30"/>
            <g class="charge-marks"></g>
            <path class="charge-sign"/>
            <circle class="charge-burst" r="28"/>
        </svg>`;
        this.marks = this.element.querySelector(".charge-marks");
        this.sign = this.element.querySelector(".charge-sign");
        root.append(this.element);

        // (What's drawn: the effect and how many marks, and how many lit)
        this.drawn = null;
        this.lit = -1;
    }

    /**
     * Show a charge as it stands ({ effect, charge, of, foughtAt }: the battle's actor's, or null
     * for no legendary weapon in hand) at `time` (ms of battle time): hidden when it's empty, or
     * it's been CHARGE.idle since the wielder last fought.
     */
    show(state, time) {
        const live = state && state.charge > 0 && time - (state.foughtAt ?? -Infinity) <= CHARGE.idle;

        if (!live) {
            this.element.hidden = true;

            return;
        }

        this.element.hidden = false;

        const key = `${state.effect}:${state.of}`;

        if (this.drawn !== key) {
            this.#draw(state.effect, state.of);
            this.drawn = key;
            this.lit = -1;
        }

        if (this.lit !== state.charge) {
            [...this.marks.children].forEach((mark, k) => mark.classList.toggle("lit", k < state.charge));
            this.element.classList.toggle("full", state.charge >= state.of);
            this.element.setAttribute("aria-label", chargeSaid(state));
            this.element.title = chargeSaid(state);
            this.lit = state.charge;
        }
    }

    /** The effect let loose: a ring bursting out of it in its colour. */
    flare() {
        this.element.classList.remove("flare");
        void this.element.offsetWidth;
        this.element.classList.add("flare");
    }

    // The ring for an effect: `of` marks round it, its sign in the middle, in its colour
    #draw(effect, of) {
        const gap = 0.12;
        const arc = (Math.PI * 2) / of;

        this.element.style.setProperty("--effect", EFFECT_COLOURS[effect] ?? "#ffd060");
        this.element.dataset.effect = effect;
        this.sign.setAttribute("d", SIGNS[effect] ?? SIGNS.ruinblast);
        this.marks.innerHTML = Array.from({ length: of }, (each, k) => {
            const [from, to] = [k * arc + gap - Math.PI / 2, (k + 1) * arc - gap - Math.PI / 2];
            const point = (angle) => `${(26 * Math.cos(angle)).toFixed(2)},${(26 * Math.sin(angle)).toFixed(2)}`;

            return `<path class="charge-mark" d="M${point(from)} A26,26 0 0 1 ${point(to)}"/>`;
        }).join("");
    }

    /** Take it away. */
    dispose() {
        this.element.remove();
    }
}
