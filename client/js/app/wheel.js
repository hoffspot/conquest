// The action wheel: press and hold on the player or an enemy, and a see-through wheel of eight
// slices opens round them, like a compass: N, NE, E, SE, S, SW, W and NW. Keep holding and flick
// towards a slice: its action is tried the moment the finger crosses into it. Letting go in the
// middle does nothing.
//
// Each wheel has two sides: flicking S turns it to its other side (wheel two, and back to wheel
// one), opened again under the finger to flick from there. The player sets what's on each side's
// other seven slices themselves (Game options, Action wheels: app/wheelsetup.js): for their own
// wheel ("self"), their healing, and things from their pack to use; for an enemy's, their stuns
// and blows. What's in each slice is an action (ACTIONS), or a thing to use ("item:potion").
//
// While a slice's action is cooling down, the slice is greyed out over as much of it as the
// cooldown has left, sweeping back as it passes. A thing to use shows how many there are.
//
// The wheel is SVG over the game; the game (game.js) follows the finger and says what to do.

import { ITEMS } from "../core/progress.js";
import { ICONS, ITEM_ICONS, useDefs } from "./icons.js";

/** The directions, clockwise from the top, and where each slice's middle points (radians). */
export const DIRECTIONS = Object.freeze(["n", "ne", "e", "se", "s", "sw", "w", "nw"]);

const ANGLES = { n: -Math.PI / 2, ne: -Math.PI / 4, e: 0, se: Math.PI / 4, s: Math.PI / 2, sw: (3 * Math.PI) / 4, w: Math.PI, nw: (-3 * Math.PI) / 4 };

/** The slice that turns a wheel to its other side. */
export const FLIP = "s";

/** The slices an action can be put in: all but the one that turns the wheel. */
export const PLACES = Object.freeze(DIRECTIONS.filter((direction) => direction !== FLIP));

/** How many sides each wheel has. */
export const SIDES = 2;

/**
 * What each action does: a spell (core/spells.js), an ability (core/progress.js ABILITIES:
 * learnt as the skills grow), or an order (core/host.js command); its label; and whose wheel it
 * goes on (`on`: the player's own, or an enemy's).
 */
export const ACTIONS = Object.freeze({
    heal: { label: "Heal", spell: "heal", on: "self" },
    greaterHeal: { label: "Greater heal", spell: "greaterHeal", learnt: "greaterHeal", on: "self" },
    stun: { label: "Stun", spell: "stun", on: "enemy" },
    hold: { label: "Hold", spell: "hold", learnt: "hold", on: "enemy" },
    powerStrike: { label: "Power strike", ability: "powerStrike", learnt: "powerStrike", on: "enemy" },
    aimedShot: { label: "Aimed shot", ability: "aimedShot", learnt: "aimedShot", on: "enemy" },
    fight: { label: "Fight", order: "engage", on: "provoke" },
});

/** The things to use a wheel shows by a shorter name than their own (core/progress.js ITEMS). */
const SHORT = { potion: "Draught", meal: "Meal", ale: "Ale" };

/**
 * What's in a slice (an ACTIONS key, or "item:" and a thing to use): { label, spell, ability,
 * order, item, on }, or null for nothing that can be.
 */
export function actionOf(key) {
    if (ACTIONS[key]) {
        return ACTIONS[key];
    }

    const item = typeof key === "string" && key.startsWith("item:") ? key.slice(5) : null;

    return item && ITEMS[item]?.use ? { label: SHORT[item] ?? ITEMS[item].label, item, on: "self" } : null;
}

/** A slice's icon (SVG), for what's in it. */
export const iconOf = (key) => ICONS[key] ?? ITEM_ICONS[actionOf(key)?.item] ?? "";

/**
 * What's on each wheel until the player changes it: each side's slices (a direction and what's
 * in it). Heal at the top of their own, Stun at the top of an enemy's; everything else empty. (A
 * soldier's of a people not friendly to theirs has one side: Fight, to pick a fight with them.)
 */
export const WHEELS = Object.freeze({
    self: Object.freeze([Object.freeze({ n: "heal" }), Object.freeze({})]),
    enemy: Object.freeze([Object.freeze({ n: "stun" }), Object.freeze({})]),
    provoke: Object.freeze([Object.freeze({ n: "fight" })]),
});

/** The wheels a player sets themselves. */
export const SETTABLE = Object.freeze(["self", "enemy"]);

/**
 * The player's wheels as kept (or nothing kept: the WHEELS they start with), made safe: each of
 * their own and an enemy's, two sides, each slice holding something that goes on that wheel.
 */
export function readWheels(kept) {
    const wheels = {};

    for (const wheel of SETTABLE) {
        const sides = Array.isArray(kept?.[wheel]) ? kept[wheel] : WHEELS[wheel];

        wheels[wheel] = Array.from({ length: SIDES }, (_, side) => {
            const slots = sides[side] && typeof sides[side] === "object" ? sides[side] : {};

            return Object.fromEntries(PLACES.filter((place) => actionOf(slots[place])?.on === wheel).map((place) => [place, slots[place]]));
        });
    }

    return wheels;
}

/**
 * What can be put on a wheel ("self" or "enemy"), for a player who's `learnt` some abilities
 * (core/progress.js Progress abilities) and `carries` some things (item ids): Heal and Stun from
 * the start, the greater spells and blows once learnt, and each thing to use they carry.
 */
export function assignable(wheel, { learnt = [], carries = [] } = {}) {
    const actions = Object.entries(ACTIONS)
        .filter(([, action]) => action.on === wheel && (!action.learnt || learnt.includes(action.learnt)))
        .map(([key]) => key);
    const items = wheel === "self" ? [...new Set(carries)].filter((id) => ITEMS[id]?.use).map((id) => `item:${id}`) : [];

    return [...actions, ...items];
}

// Sizes (pixels): the wheel's outer and inner radii, the gap between slices (radians), where
// the icons sit and how big they are
const OUTER = 128;
const INNER = 36;
const GAP = 0.04;
const ICON_AT = 84;
const ICON_SCALE = 0.74;

/**
 * Which slice a finger `dx`, `dy` pixels from where the wheel opened is in (a DIRECTIONS
 * direction), or null while it's still within `dead` pixels of the middle.
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
const HALF = Math.PI / DIRECTIONS.length;
const edges = (direction) => [ANGLES[direction] - HALF + GAP / 2, ANGLES[direction] + HALF - GAP / 2];

/**
 * A wheel's slices drawn as SVG (without its <svg>): each slice's face, icon, label and count,
 * and the hub, for `slots` ({ direction: what's in it }) on `side` (0 or 1) of it, turning to
 * its other side at S if `flip`. `counts` says how many there are of each thing to use in it.
 * (Also drawn by the Action wheels options: app/wheelsetup.js.)
 */
export function drawWheel({ slots, side = 0, flip = false, counts = {}, outer = OUTER, inner = INNER }) {
    const scale = outer / OUTER;
    const svg = [];

    for (const direction of DIRECTIONS) {
        const flips = flip && direction === FLIP;
        const key = flips ? null : slots[direction];
        const action = actionOf(key);
        const [a0, a1] = edges(direction);
        const at = ((outer + inner) / 2) * (ICON_AT / ((OUTER + INNER) / 2));
        const [ix, iy] = [Math.cos(ANGLES[direction]) * at, Math.sin(ANGLES[direction]) * at];
        const place = (dy) => `x="${ix.toFixed(1)}" y="${(iy + dy * scale).toFixed(1)}"`;

        svg.push(`<g class="slice${action ? "" : flips ? " flip" : " empty"}" data-direction="${direction}"${key ? ` data-action="${key}"` : ""}>`);
        svg.push(`<path class="face" d="${sectorPath(inner, outer, a0, a1)}"/>`);

        if (action || flips) {
            svg.push(`<g class="icon" transform="translate(${ix.toFixed(1)} ${(iy - 6 * scale).toFixed(1)}) scale(${(ICON_SCALE * scale).toFixed(3)})">${flips ? ICONS.flip : iconOf(key)}</g>`);
            svg.push(`<text class="label" ${place(21)}>${flips ? `Wheel ${side ? 1 : 2}` : action.label}</text>`);
        }

        if (action?.item) {
            svg.push(`<text class="count" x="${(ix + 15 * scale).toFixed(1)}" y="${(iy + 7 * scale).toFixed(1)}">${counts[action.item] ?? 0}</text>`);
        }

        if (action) {
            svg.push(`<path class="cooldown" d=""/>`);
        }

        svg.push("</g>");
    }

    svg.push(`<circle class="hub" r="${inner - 4}"/>`);

    if (flip) {
        svg.push(`<text class="side" y="5">${side + 1}</text>`);
    }

    return svg.join("");
}

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
        this.side = 0;
        this.open = false;
    }

    /**
     * Open it at a point on the screen (client pixels) for a target ("self" or an enemy's id),
     * showing `slots` ({ direction: what's in it }) on `side` of it (0 or 1), turning over at S
     * if `flip`. `counts` says how many of each thing to use there are, and `off` which slices
     * can't be used as things are (a blow for another kind of weapon, a thing all used up).
     */
    show(x, y, target, slots, { side = 0, flip = false, counts = {}, off = [] } = {}) {
        const size = 2 * OUTER + 8;
        const half = OUTER + 4;

        useDefs();
        this.element.innerHTML = `<svg viewBox="${-half} ${-half} ${size} ${size}" width="${size}" height="${size}">${drawWheel({ slots, side, flip, counts })}</svg>`;

        for (const slice of this.element.querySelectorAll(".slice")) {
            slice.classList.toggle("off", off.includes(slice.dataset.direction));
        }

        // Kept on the screen, however near its edge the target is
        const left = Math.min(innerWidth - half - 4, Math.max(half + 4, x));
        const top = Math.min(innerHeight - half - 4, Math.max(half + 4, y));

        this.element.style.left = `${left}px`;
        this.element.style.top = `${top}px`;
        this.element.hidden = false;
        this.element.classList.remove("shown");
        void this.element.offsetWidth;
        this.element.classList.add("shown");
        this.element.dataset.side = String(side + 1);
        this.slots = slots;
        this.target = target;
        this.side = side;
        this.flip = flip;
        this.off = off;
        this.open = true;
    }

    /** What's in a direction's slice (an ACTIONS key or a thing to use), or null for an empty one. */
    actionAt(direction) {
        return this.flip && direction === FLIP ? null : (this.slots?.[direction] ?? null);
    }

    /** Whether a direction's slice can't be used as things are (shown greyed). */
    offAt(direction) {
        return Boolean(this.off?.includes(direction));
    }

    /** Whether a direction's slice turns the wheel over. */
    flipsAt(direction) {
        return Boolean(this.flip) && direction === FLIP;
    }

    /**
     * Grey out slices over the share of each still cooling down (0 to 1: `shares`, by
     * direction), swept from each slice's leading edge.
     */
    setCooldown(shares) {
        if (!this.open) {
            return;
        }

        for (const slice of this.element.querySelectorAll(".slice[data-action]")) {
            const [a0, a1] = edges(slice.dataset.direction);
            const shade = slice.querySelector(".cooldown");
            const left = shares[slice.dataset.direction] ?? 0;

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
