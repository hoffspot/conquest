// The action wheel: press and hold on the player or an enemy, and a see-through wheel of four
// slices (up, right, down and left, like a pizza cut in four) opens round them. Keep holding and
// flick towards a slice: its action is tried the moment the finger crosses into it. Letting go
// in the middle does nothing.
//
// Each wheel's slices (WHEELS) hold actions (ACTIONS), each with an icon (icons.js). While
// spells are cooling down, their slices are greyed out over as much of each slice as the
// cooldown has left, sweeping back as it passes.
//
// The wheel is SVG over the game; the game (game.js) follows the finger and says what to do.

import { DEFS, ICONS } from "./icons.js";

/** The directions, clockwise from the top, and where each slice's middle points (radians). */
export const DIRECTIONS = Object.freeze(["up", "right", "down", "left"]);

const ANGLES = { up: -Math.PI / 2, right: 0, down: Math.PI / 2, left: Math.PI };

/** What each action does: a spell (core/spells.js) and its label. */
export const ACTIONS = Object.freeze({
    heal: { label: "Heal", spell: "heal" },
    stun: { label: "Stun", spell: "stun" },
});

/** Each wheel's slices: the player's own ("self") and an enemy's. Empty slices are left out. */
export const WHEELS = Object.freeze({
    self: { up: "heal" },
    enemy: { up: "stun" },
});

// Sizes (pixels): the wheel's outer and inner radii, the gap between slices (radians), where
// the icons sit and how big they are
const OUTER = 96;
const INNER = 30;
const GAP = 0.05;
const ICON_AT = 60;
const ICON_SCALE = 0.92;

/**
 * Which slice a finger `dx`, `dy` pixels from where the wheel opened is in: "up", "right",
 * "down" or "left", or null while it's still within `dead` pixels of the middle.
 */
export function directionOf(dx, dy, dead = INNER) {
    if (Math.hypot(dx, dy) < dead) {
        return null;
    }

    const angle = Math.atan2(dy, dx);

    return DIRECTIONS.reduce((best, direction) => (Math.abs(wrap(angle - ANGLES[direction])) < Math.abs(wrap(angle - ANGLES[best])) ? direction : best));
}

const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

/** An SVG path for a ring's sector: from radius r0 to r1, angle a0 to a1 (radians, clockwise from east). */
export function sectorPath(r0, r1, a0, a1) {
    const point = (r, a) => `${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`;
    const large = a1 - a0 > Math.PI ? 1 : 0;

    return `M${point(r1, a0)}A${r1},${r1} 0 ${large} 1 ${point(r1, a1)}L${point(r0, a1)}A${r0},${r0} 0 ${large} 0 ${point(r0, a0)}Z`;
}

// Where a slice starts and ends (radians)
const edges = (direction) => [ANGLES[direction] - Math.PI / 4 + GAP / 2, ANGLES[direction] + Math.PI / 4 - GAP / 2];

export class ActionWheel {
    /** @param {HTMLElement} root - Where to put it (the HUD, over the game). */
    constructor(root) {
        this.element = document.createElement("div");
        this.element.className = "wheel";
        this.element.hidden = true;
        this.element.setAttribute("aria-hidden", "true");
        root.append(this.element);
        this.slots = null;
        this.target = null;
        this.open = false;
    }

    /**
     * Open it at a point on the screen (client pixels) for a target ("self" or an enemy's id),
     * with the slices of `wheel` (a WHEELS key).
     */
    show(x, y, wheel, target) {
        const slots = WHEELS[wheel];
        const svg = [`<svg viewBox="${-OUTER - 4} ${-OUTER - 4} ${2 * OUTER + 8} ${2 * OUTER + 8}" width="${2 * OUTER + 8}" height="${2 * OUTER + 8}"><defs>${DEFS}</defs>`];

        for (const direction of DIRECTIONS) {
            const action = ACTIONS[slots[direction]];
            const [a0, a1] = edges(direction);
            const [ix, iy] = [Math.cos(ANGLES[direction]) * ICON_AT, Math.sin(ANGLES[direction]) * ICON_AT];

            svg.push(`<g class="slice${action ? "" : " empty"}" data-direction="${direction}">`);
            svg.push(`<path class="face" d="${sectorPath(INNER, OUTER, a0, a1)}"/>`);

            if (action) {
                svg.push(`<g class="icon" transform="translate(${ix.toFixed(1)} ${(iy - 5).toFixed(1)}) scale(${ICON_SCALE})">${ICONS[slots[direction]]}</g>`);
                svg.push(`<text class="label" x="${ix.toFixed(1)}" y="${(iy + 22).toFixed(1)}">${action.label}</text>`);
                svg.push(`<path class="cooldown" d=""/>`);
            }

            svg.push("</g>");
        }

        svg.push(`<circle class="hub" r="${INNER - 4}"/></svg>`);

        // Kept on the screen, however near its edge the target is
        const half = OUTER + 4;
        const left = Math.min(innerWidth - half - 4, Math.max(half + 4, x));
        const top = Math.min(innerHeight - half - 4, Math.max(half + 4, y));

        this.element.innerHTML = svg.join("");
        this.element.style.left = `${left}px`;
        this.element.style.top = `${top}px`;
        this.element.hidden = false;
        this.element.classList.remove("shown");
        void this.element.offsetWidth;
        this.element.classList.add("shown");
        this.slots = slots;
        this.target = target;
        this.open = true;
    }

    /** The action in a direction's slice, or null for an empty one. */
    actionAt(direction) {
        return this.slots?.[direction] ?? null;
    }

    /**
     * Grey out the spells' slices over `share` of each (0 to 1: the cooldown left), swept from
     * each slice's leading edge.
     */
    setCooldown(share) {
        if (!this.open) {
            return;
        }

        for (const slice of this.element.querySelectorAll(".slice:not(.empty)")) {
            const [a0, a1] = edges(slice.dataset.direction);
            const shade = slice.querySelector(".cooldown");
            const spell = ACTIONS[this.slots[slice.dataset.direction]]?.spell;
            const left = spell ? share : 0;

            shade.setAttribute("d", left > 0.001 ? sectorPath(INNER, OUTER, a0, a0 + (a1 - a0) * left) : "");
            slice.classList.toggle("cooling", left > 0.001);
        }
    }

    /** Show a slice chosen (lit) or refused (flashed red), or neither (null). */
    mark(direction, how) {
        for (const slice of this.element.querySelectorAll(".slice")) {
            const here = slice.dataset.direction === direction;

            slice.classList.toggle("chosen", here && how === "chosen");
            slice.classList.toggle("refused", here && how === "refused");
        }
    }

    /** Close it, after a moment if a slice was just chosen (so it shows). */
    hide({ after = 0 } = {}) {
        this.open = false;
        this.slots = null;
        clearTimeout(this.closing);
        this.closing = setTimeout(() => {
            if (!this.open) {
                this.element.hidden = true;
            }
        }, after);
    }
}
