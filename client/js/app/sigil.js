// The Prismatic sigil (docs/MAGIC.md, "Prismatic Destruction"): while a chain of the player's
// is live (core/prismatic.js), a four-petalled emblem over the player's card (beside it, on a
// phone on its side; styles.css), a petal for each element (fire, earth, air and water, from the top round). The element being
// cast up through glows, filling as it climbs; each element whose piece is held is lit whole; and
// a ring round it all runs down the time left (the ten seconds for the chain's next spell, or the
// fifteen to cast the whole sigil), how much stronger every attack spell is said under it. A
// piece just earned, it pulses in that element's colour, the piece's petal the brightest, its
// heart a star of that colour: tapped (or clicked), the element's Prismatic spell's cast, spending
// it, till another element's first spell lands. Whole, the four petals lit, it pulses, its heart a
// white star: tapped, Prismatic Destruction's cast. Each on the enemy the player's set to fight.
// A piece earned, or the sigil made whole, it flares, a ring bursting out from it in the piece's
// colour (white, whole). Gone with the chain: spent, at once; let lapse, it says so itself, with no
// message (SIGIL_ENDS): the chain broken, a sharp red flash, its petals cracking off, its strength
// struck through; the sigil left whole to fade, a soft white flash, fading out.
//
// It only shows and hears: the game (game.js) says what the chain is and what to do.

import { bonusOf, CHAIN, ELEMENTS, isWhole, sigilSpell } from "../core/prismatic.js";
import { SCHOOLS, SPELLS } from "../core/spells.js";
import { PETAL } from "./spellicons.js";

/** Each element's colour in the sigil (as its icon has it: spellicons.js prismatic). */
export const SIGIL_COLOURS = Object.freeze({ fire: "#ff7a2e", earth: "#c49a4a", air: "#bfe6ff", water: "#3c9cff" });

/**
 * How a chain let lapse ends on the sigil (battle.js "prism" events: "broken", the next spell not
 * landed in time; "faded", the whole sigil not cast in time): for how long it's shown going (`ms`
 * of battle time, as long as styles.css's sigil-broken and sigil-faded), and what it says meanwhile.
 */
export const SIGIL_ENDS = Object.freeze({
    broken: Object.freeze({ ms: 900, said: "The Prismatic chain is broken: its strength is lost." }),
    faded: Object.freeze({ ms: 1600, said: "The Prismatic sigil fades, its power unspent." }),
});

/**
 * The share of a chain's time left by `time` (ms of battle time), 0 to 1: of the window for its
 * next spell (CHAIN.window), or, the sigil whole, of the time to cast it (CHAIN.ready).
 */
export function timeLeft(prism, time) {
    if (!prism) {
        return 0;
    }

    const whole = isWhole(prism);
    const since = time - (whole ? prism.readyAt : prism.at);

    return Math.min(1, Math.max(0, 1 - since / (whole ? CHAIN.ready : CHAIN.window)));
}

/** What the sigil says of a chain, for a screen reader (and its tooltip). */
export function sigilSaid(prism) {
    const bonus = `every attack spell ${Math.round(bonusOf(prism) * 100)}% stronger`;

    if (isWhole(prism)) {
        return `The Prismatic sigil, whole: cast Prismatic Destruction on your foe (${bonus})`;
    }

    const held = prism.pieces.length ? `${prism.pieces.length} of 4 pieces` : "no pieces yet";
    const climbing = prism.element ? `, ${prism.element} chain at spell ${prism.step} of ${SCHOOLS[prism.element].tiers.length}` : "";
    const offered = sigilSpell(prism);

    if (offered) {
        return `The Prismatic sigil, ${prism.piece}'s piece just earned: cast ${SPELLS[offered].label} on your foe, spending it (${held}, ${bonus})`;
    }

    return `The Prismatic sigil: ${held}${climbing} (${bonus})`;
}

export class Sigil {
    /** @param {HTMLElement} root - Where to put it (the player's card, hud.js plate). */
    constructor(root) {
        this.element = document.createElement("button");
        this.element.type = "button";
        this.element.className = "sigil";
        this.element.hidden = true;
        this.element.innerHTML = `<svg class="sigil-emblem" viewBox="-32 -32 64 64" aria-hidden="true">
            <circle class="sigil-back" r="31"/>
            <circle class="sigil-time" r="29" pathLength="1" transform="rotate(-90)"/>
            ${ELEMENTS.map((element, k) => `<g class="sigil-petal" data-element="${element}" style="--element: ${SIGIL_COLOURS[element]}" transform="rotate(${k * 90})"><path class="sigil-shape" d="${PETAL}"/><path class="sigil-fill" d="${PETAL}"/></g>`).join("")}
            <path class="sigil-heart" d="M0,-7 L2.4,-2.4 L7,0 L2.4,2.4 L0,7 L-2.4,2.4 L-7,0 L-2.4,-2.4 Z"/>
            <circle class="sigil-burst" r="30"/>
        </svg><span class="sigil-bonus"></span>`;
        this.petals = new Map([...this.element.querySelectorAll(".sigil-petal")].map((petal) => [petal.dataset.element, petal]));
        this.time = this.element.querySelector(".sigil-time");
        this.bonus = this.element.querySelector(".sigil-bonus");
        this.element.addEventListener("click", () => this.onCast());
        // (Its own, not the card's: held, the card shows all that's on the player)
        this.element.addEventListener("pointerdown", (event) => event.stopPropagation());
        root.append(this.element);

        /** Hears the sigil tapped, to cast what it may be spent on (game.js says if nothing). */
        this.onCast = () => {};

        this.drawn = null;
        this.left = -1;

        /** A chain let lapse, being shown going: { how (SIGIL_ENDS'), until (ms of battle time) }, or null. */
        this.ending = null;

        // (Whether a chain's drawn on it still, hidden or not, to be shown going: its end may be
        // heard after the frame that hid it)
        this.held = false;
    }

    /** Show a chain as it stands (core/prismatic.js; null for none: hidden), at `time` (ms of battle time). */
    show(prism, time) {
        if (this.ending && (prism || time >= this.ending.until)) {
            this.#ended();
        }

        if (!prism) {
            if (!this.element.hidden && !this.ending) {
                this.element.hidden = true;
                this.drawn = null;
            }

            return;
        }

        const whole = isWhole(prism);
        // (A piece just earned, to be spent on its element's Prismatic spell: its element)
        const offered = !whole && sigilSpell(prism) ? prism.piece : null;
        const drawn = `${prism.pieces.join()}|${prism.element}|${prism.step}|${whole}|${offered}`;

        if (drawn !== this.drawn) {
            this.drawn = drawn;
            this.held = true;
            this.element.hidden = false;
            this.element.classList.toggle("whole", whole);
            this.element.classList.toggle("offered", Boolean(offered));
            this.element.style.setProperty("--offer", offered ? SIGIL_COLOURS[offered] : "transparent");

            for (const [element, petal] of this.petals) {
                const climbing = prism.element === element;

                petal.classList.toggle("held", prism.pieces.includes(element));
                petal.classList.toggle("offered", element === offered);
                petal.classList.toggle("climbing", climbing);
                petal.style.setProperty("--filled", climbing ? (prism.step / SCHOOLS[element].tiers.length).toFixed(3) : "0");
            }

            this.bonus.textContent = `+${Math.round(bonusOf(prism) * 100)}%`;
            this.element.setAttribute("aria-label", sigilSaid(prism));
            this.element.title = sigilSaid(prism);
        }

        const left = timeLeft(prism, time);

        if (Math.abs(left - this.left) > 0.004) {
            this.left = left;
            this.time.style.strokeDashoffset = (1 - left).toFixed(4);
            this.element.classList.toggle("late", left < 0.3);
        }
    }

    /**
     * A chain let lapse (`how`: "broken" or "faded", SIGIL_ENDS), at `time` (ms of battle time):
     * the sigil, as it last stood, shown going till its time's up, saying so to a screen reader.
     */
    end(how, time) {
        const ending = SIGIL_ENDS[how];

        if (!ending || !this.held) {
            return;
        }

        this.ending = { how, until: time + ending.ms };
        this.element.hidden = false;
        this.element.classList.remove("whole", "offered", "late", "flare");
        this.element.classList.add("ending", how);
        this.element.setAttribute("aria-label", ending.said);
        this.element.title = ending.said;
    }

    /**
     * A piece of the sigil earned (`kind`: its element), or the sigil made whole ("whole"): a ring
     * bursting out from it, in the piece's colour (white, whole).
     */
    flare(kind) {
        this.element.style.setProperty("--flare", SIGIL_COLOURS[kind] ?? "#ffffff");
        // (Begun again, should one still be going)
        this.element.classList.remove("flare");
        void this.element.offsetWidth;
        this.element.classList.add("flare");
    }

    // A chain let lapse shown gone: hidden (or, a new one begun, drawn afresh)
    #ended() {
        this.element.classList.remove("ending", this.ending.how);
        this.element.hidden = true;
        this.ending = null;
        this.held = false;
        this.drawn = null;
        this.left = -1;
    }

    dispose() {
        this.element.remove();
    }
}
