// Icons for the action wheel's actions, and for everything that can be carried, drawn as SVG on a
// 48 by 48 grid centred on 0, 0, in colours that say what each does: healing green, stunning
// yellow stars round a violet daze; steel, wood, leather and cloth for gear; a red draught.
// `DEFS` holds the gradients, glows and patterns they share: put in the page once (`useDefs`),
// where every icon drawn anywhere in it finds them.

import { LIVERIES } from "../characters/liveries.js";
import { GEAR } from "../core/gear.js";
import { ELEMENT_TOMES, SPELLS, TOMES, tomeOf } from "../core/spells.js";
import { PARTS } from "../core/spoils.js";
import { SPELL_DEFS, SPELL_ICONS } from "./spellicons.js";

/** The gear's and things' gradients and patterns. */
const ITEM_DEFS = `
<linearGradient id="icon-steel" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#f2f5f8"/>
    <stop offset="0.5" stop-color="#aeb8c2"/>
    <stop offset="1" stop-color="#5f6973"/>
</linearGradient>
<linearGradient id="icon-wood" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#c79159"/>
    <stop offset="1" stop-color="#7a4a22"/>
</linearGradient>
<linearGradient id="icon-leather" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#9a6536"/>
    <stop offset="1" stop-color="#4a2c14"/>
</linearGradient>
<linearGradient id="icon-cloth" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#f1e0b8"/>
    <stop offset="1" stop-color="#bf9d6a"/>
</linearGradient>
<linearGradient id="icon-mail" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#c9d1d8"/>
    <stop offset="1" stop-color="#626c76"/>
</linearGradient>
<pattern id="icon-rings" width="3.6" height="3.2" patternUnits="userSpaceOnUse">
    <circle cx="1.8" cy="1.6" r="1.25" fill="none" stroke="#3d454d" stroke-width="0.55"/>
</pattern>
<radialGradient id="icon-potion" cx="0.38" cy="0.35" r="0.7">
    <stop offset="0" stop-color="#ff9a8f"/>
    <stop offset="0.55" stop-color="#d9262e"/>
    <stop offset="1" stop-color="#6e0a10"/>
</radialGradient>
<radialGradient id="icon-cure-poison" cx="0.38" cy="0.35" r="0.7">
    <stop offset="0" stop-color="#e4ffb0"/>
    <stop offset="0.55" stop-color="#5cbf2a"/>
    <stop offset="1" stop-color="#1c4a0c"/>
</radialGradient>
<radialGradient id="icon-cure-disease" cx="0.38" cy="0.35" r="0.7">
    <stop offset="0" stop-color="#fff0b8"/>
    <stop offset="0.55" stop-color="#e0a020"/>
    <stop offset="1" stop-color="#6a3a06"/>
</radialGradient>
<radialGradient id="icon-cure-wither" cx="0.38" cy="0.35" r="0.7">
    <stop offset="0" stop-color="#fff8d8"/>
    <stop offset="0.5" stop-color="#f0c850"/>
    <stop offset="1" stop-color="#8a5a10"/>
</radialGradient>
<radialGradient id="icon-cure-slow" cx="0.38" cy="0.35" r="0.7">
    <stop offset="0" stop-color="#e0f6ff"/>
    <stop offset="0.55" stop-color="#3aa8e8"/>
    <stop offset="1" stop-color="#0c3a6a"/>
</radialGradient>
<radialGradient id="icon-stamina" cx="0.38" cy="0.35" r="0.7">
    <stop offset="0" stop-color="#fff0b0"/>
    <stop offset="0.55" stop-color="#ff9a1a"/>
    <stop offset="1" stop-color="#8a3a04"/>
</radialGradient>
<radialGradient id="icon-glass" cx="0.35" cy="0.3" r="0.8">
    <stop offset="0" stop-color="#ffffff" stop-opacity="0.55"/>
    <stop offset="1" stop-color="#bfe3f2" stop-opacity="0.18"/>
</radialGradient>
<radialGradient id="icon-crystal-glow">
    <stop offset="0" stop-color="#d4f6ff" stop-opacity="0.95"/>
    <stop offset="0.5" stop-color="#5cc8ff" stop-opacity="0.4"/>
    <stop offset="1" stop-color="#1c7fd0" stop-opacity="0"/>
</radialGradient>
<linearGradient id="icon-grimoire" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#7a3276"/>
    <stop offset="1" stop-color="#2e0f2c"/>
</linearGradient>
<linearGradient id="icon-kite" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#4a7fd0"/>
    <stop offset="1" stop-color="#1b3b78"/>
</linearGradient>`;

/**
 * Put the icons' gradients in the page, once, somewhere that's never hidden (a gradient in an
 * SVG that isn't shown isn't found by the others).
 */
export function useDefs(document = globalThis.document) {
    if (!document || document.getElementById("icon-defs")) {
        return;
    }

    const holder = document.createElement("div");

    holder.innerHTML = `<svg id="icon-defs" width="0" height="0" aria-hidden="true" focusable="false" style="position:absolute;width:0;height:0;overflow:hidden"><defs>${DEFS}</defs></svg>`;
    document.body.append(holder.firstElementChild);
}

/** The action icons' own gradients and glows. */
const ACTION_DEFS = `
<radialGradient id="icon-heal-glow">
    <stop offset="0" stop-color="#8dffae" stop-opacity="0.9"/>
    <stop offset="0.55" stop-color="#2fd46a" stop-opacity="0.35"/>
    <stop offset="1" stop-color="#1a9e48" stop-opacity="0"/>
</radialGradient>
<linearGradient id="icon-heal-cross" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#c9ffd6"/>
    <stop offset="0.45" stop-color="#43e37c"/>
    <stop offset="1" stop-color="#128a3d"/>
</linearGradient>
<radialGradient id="icon-stun-head">
    <stop offset="0" stop-color="#b58cff"/>
    <stop offset="1" stop-color="#5a2fb0"/>
</radialGradient>
<linearGradient id="icon-stun-star" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fff6b0"/>
    <stop offset="1" stop-color="#ffc21a"/>
</linearGradient>
<radialGradient id="icon-bless-glow">
    <stop offset="0" stop-color="#fff6c8" stop-opacity="0.95"/>
    <stop offset="0.5" stop-color="#ffd24a" stop-opacity="0.4"/>
    <stop offset="1" stop-color="#e0a020" stop-opacity="0"/>
</radialGradient>
<linearGradient id="icon-parchment" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#d8bd84"/>
    <stop offset="0.45" stop-color="#f6e9c6"/>
    <stop offset="1" stop-color="#cfae6e"/>
</linearGradient>
<radialGradient id="icon-safety-glow">
    <stop offset="0" stop-color="#eaf6ff" stop-opacity="0.95"/>
    <stop offset="0.55" stop-color="#4aa8ff" stop-opacity="0.45"/>
    <stop offset="1" stop-color="#3a8ae8" stop-opacity="0"/>
</radialGradient>
<filter id="icon-glow" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur stdDeviation="1.6" result="blur"/>
    <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
</filter>`;

/** Gradients, glows and patterns the icons use. */
export const DEFS = ACTION_DEFS + SPELL_DEFS + ITEM_DEFS;

// A star with `points` points, `outer` and `inner` radii, at x, y
function star(x, y, outer, inner, points = 5, turn = -Math.PI / 2) {
    const corners = [];

    for (let k = 0; k < points * 2; k++) {
        const radius = k % 2 ? inner : outer;
        const angle = turn + (k * Math.PI) / points;

        corners.push(`${(x + Math.cos(angle) * radius).toFixed(2)},${(y + Math.sin(angle) * radius).toFixed(2)}`);
    }

    return `M${corners.join("L")}Z`;
}

// A sword drawn upright round 0, 0 (to be turned): its blade, guard, grip and pommel
const SWORD = `
        <path d="M-2.4,-20 L0,-23.5 L2.4,-20 L2.4,6 L-2.4,6 Z" fill="#e3e9ee" stroke="#39434c" stroke-width="1"/>
        <path d="M0,-21 L0,5" stroke="#9aa6b1" stroke-width="0.8"/>
        <rect x="-8" y="6" width="16" height="3" rx="1.2" fill="#c8962e" stroke="#5a3b0c" stroke-width="0.9"/>
        <rect x="-1.8" y="9" width="3.6" height="9" fill="#6b3f1d" stroke="#2f1a09" stroke-width="0.8"/>
        <circle cy="19.5" r="2.6" fill="#c8962e" stroke="#5a3b0c" stroke-width="0.9"/>`;

// A Stamina Boost potion: a draught of the stamina bar's orange, a gold stopper, a bolt of
// lightning on the glass (in the pack, and on the plate while it lasts)
const STAMINA_BOOST = `
        <circle cy="6" r="13.5" fill="url(#icon-glass)" stroke="#3a2f45" stroke-width="1.3"/>
        <path d="M-12.6,3 A13,13 0 1 0 12.6,3 Z" transform="translate(0 0.5) scale(0.97)" fill="url(#icon-stamina)"/>
        <path d="M-4,-14 L4,-14 L4,-6 L-4,-6 Z" fill="url(#icon-glass)" stroke="#3a2f45" stroke-width="1.2"/>
        <rect x="-5.5" y="-20" width="11" height="7" rx="1.8" fill="#e0b040" stroke="#6a4a0a" stroke-width="1"/>
        <path d="M2,-2 L-5,8 L0,8 L-3,17 L6,5 L1,5 L4,-2 Z" fill="#fffbe0" stroke="#8a4a04" stroke-width="1" stroke-linejoin="round"/>
        <ellipse cx="-7" cy="1" rx="2.2" ry="4" fill="#ffffff" opacity="0.5" transform="rotate(25 -7 1)"/>`;

// A Scroll of Safety: a sheet of parchment between its two rolls, a blue circle of runes on
// it, glowing, and a red seal hanging from it
const SCROLL_OF_SAFETY = `
        <rect x="-12" y="-15" width="24" height="30" fill="url(#icon-parchment)" stroke="#6a4a1a" stroke-width="1.1"/>
        <rect x="-15" y="-20" width="30" height="7" rx="3.5" fill="url(#icon-parchment)" stroke="#6a4a1a" stroke-width="1.2"/>
        <rect x="-15" y="13" width="30" height="7" rx="3.5" fill="url(#icon-parchment)" stroke="#6a4a1a" stroke-width="1.2"/>
        <circle r="10" fill="url(#icon-safety-glow)"/>
        <circle r="7.5" fill="none" stroke="#2a78d8" stroke-width="1.5"/>
        <circle r="4.6" fill="none" stroke="#2a78d8" stroke-width="0.9" stroke-dasharray="1.6 1.2"/>
        <path d="${star(0, 0, 4.4, 1.6, 5, 0)}" fill="#3a8ae8"/>
        <path d="M6,14 L4,22 L7,20.5 L9,23 L9,14 Z" fill="#b8202a" stroke="#5a0a10" stroke-width="0.8"/>
        <circle cx="7.5" cy="16" r="3" fill="#c8303a" stroke="#5a0a10" stroke-width="0.9"/>`;

// The emotes' pictures (core/emotes.js), in skin and cloth over a warm glow: an open hand (palm
// out, fingers up, thumb to its left), a head (its eyes), and a figure in strokes
const EMOTE_GLOW = `<circle r="20" fill="#b07a2a" opacity="0.32"/>`;
const OPEN_HAND = `
    <g fill="#f0c9a0" stroke="#6a3f22" stroke-width="1.1">
        <rect x="-7.4" y="-14" width="3.4" height="13" rx="1.7"/>
        <rect x="-3.6" y="-17" width="3.4" height="16" rx="1.7"/>
        <rect x="0.2" y="-16" width="3.4" height="15" rx="1.7"/>
        <rect x="4" y="-12.5" width="3.2" height="11.5" rx="1.6"/>
        <rect x="-13" y="-4" width="3.6" height="11" rx="1.8" transform="rotate(-38 -11.2 1.5)"/>
        <rect x="-7.6" y="-4.5" width="15" height="15" rx="4.5"/>
    </g>`;
const HEAD = (x, y, r = 11) => `
    <circle cx="${x}" cy="${y}" r="${r}" fill="#f0c9a0" stroke="#6a3f22" stroke-width="1.4"/>
    <circle cx="${x - r * 0.36}" cy="${y - r * 0.1}" r="${r * 0.11}" fill="#3a2414"/>
    <circle cx="${x + r * 0.36}" cy="${y - r * 0.1}" r="${r * 0.11}" fill="#3a2414"/>`;
const FIGURE = (strokes) => `<g fill="none" stroke="#f2e6cf" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">${strokes}</g>`;
const ARROW = (d, head) => `<path d="${d}" fill="none" stroke="#f2e6cf" stroke-width="2.6" stroke-linecap="round"/><path d="${head}" fill="#f2e6cf"/>`;

const EMOTE_ICONS = {
    // A hand raised, waving to and fro
    wave: `${EMOTE_GLOW}
        <g transform="translate(1 3) rotate(12)">${OPEN_HAND}</g>
        <path d="M-15,-14 a16,16 0 0 0 -2,14 M-19,-17 a21,21 0 0 0 -3,20 M15,-17 a16,16 0 0 1 4,13 M19,-20 a21,21 0 0 1 5,19" fill="none" stroke="#f2e6cf" stroke-width="1.8" stroke-linecap="round"/>`,

    // Someone bowing from the hips, head low
    bow: `${EMOTE_GLOW}
        ${FIGURE("<path d='M-5,20 L-4,5 M0,20 L-1,5'/><path d='M-3,5 L10,-6'/><path d='M9,-5 L11,7'/>")}
        <circle cx="15" cy="-8" r="5" fill="#f2e6cf"/>`,

    // A head nodding, up and down
    nod: `${EMOTE_GLOW}${HEAD(-5, 3)}
        <path d="M-10,8 q5,3.5 10,0" fill="none" stroke="#3a2414" stroke-width="1.4" stroke-linecap="round"/>
        ${ARROW("M14,-11 L14,11", "M9.5,-10 L14,-17 L18.5,-10 Z M9.5,10 L14,17 L18.5,10 Z")}`,

    // A head shaking, side to side
    no: `${EMOTE_GLOW}${HEAD(0, 6)}
        <path d="M-4.5,11 h9" stroke="#3a2414" stroke-width="1.4" stroke-linecap="round"/>
        ${ARROW("M-12,-15 L12,-15", "M-11,-19.5 L-18,-15 L-11,-10.5 Z M11,-19.5 L18,-15 L11,-10.5 Z")}`,

    // Someone with both arms flung up, and sparkles
    cheer: `${EMOTE_GLOW}
        ${FIGURE("<path d='M-5,20 L-1,6 M5,20 L1,6'/><path d='M0,6 L0,-5'/><path d='M0,-4 L-11,-17 M0,-4 L11,-17'/>")}
        <circle cy="-11" r="5" fill="#f2e6cf"/>
        <path d="${star(-15, 3, 4.4, 1.3, 4, 0)}" fill="#ffd27a"/>
        <path d="${star(15, 1, 3.6, 1.1, 4, 0)}" fill="#ffd27a"/>`,

    // A fist punched up into the air
    fistPump: `${EMOTE_GLOW}
        <rect x="-5" y="-4" width="10" height="24" rx="3" fill="url(#icon-cloth)" stroke="#6a4a2a" stroke-width="1.2"/>
        <g stroke="#6a3f22" stroke-width="1.2">
            <rect x="-8.5" y="-18" width="17" height="15" rx="4.5" fill="#f0c9a0"/>
            <path d="M-4.2,-18 v6 M0,-18 v6 M4.2,-18 v6" fill="none"/>
            <rect x="-8.5" y="-10" width="12" height="4.6" rx="2.3" fill="#e8bb8e"/>
        </g>
        <path d="M-14,-12 L-19,-15 M-14,-6 L-20,-6 M14,-12 L19,-15 M14,-6 L20,-6" stroke="#f2e6cf" stroke-width="1.8" stroke-linecap="round"/>`,

    // A head, a question over it
    puzzled: `${EMOTE_GLOW}${HEAD(-4, 6)}
        <path d="M-8,12 q3,-2 7,0.5" fill="none" stroke="#3a2414" stroke-width="1.4" stroke-linecap="round"/>
        <path d="M8,-13 a6,6 0 1 1 8.5,5.5 c-2.2,1 -3,2.2 -3,4.8" fill="none" stroke="#ffd27a" stroke-width="3" stroke-linecap="round"/>
        <circle cx="13.5" cy="3.5" r="1.9" fill="#ffd27a"/>`,

    // A hand calling someone over, the way to come
    beckon: `${EMOTE_GLOW}
        <g transform="translate(6 4) rotate(-18) scale(0.88)">${OPEN_HAND}</g>
        ${ARROW("M-19,-12 C-14,-2 -12,4 -7,9", "M-11.5,10.5 L-4,12 L-5.5,4.5 Z")}`,
};

/** Each action's icon: SVG drawn round 0, 0, about 44 across (the spells' own: spellicons.js). */
export const ICONS = Object.freeze({
    ...SPELL_ICONS,
    ...Object.fromEntries(Object.entries(EMOTE_ICONS).map(([name, icon]) => [`emote:${name}`, icon])),

    // A great green cross in a ring of light, with more sparkles: the greater heal
    greaterHeal: `
        <circle r="22" fill="url(#icon-heal-glow)"/>
        <circle r="17" fill="none" stroke="#c9ffd8" stroke-width="1.6" stroke-dasharray="3 2.5" opacity="0.85"/>
        <path d="M-5,-15 h10 a2,2 0 0 1 2,2 v8 h8 a2,2 0 0 1 2,2 v10 a2,2 0 0 1 -2,2 h-8 v8 a2,2 0 0 1 -2,2 h-10 a2,2 0 0 1 -2,-2 v-8 h-8 a2,2 0 0 1 -2,-2 v-10 a2,2 0 0 1 2,-2 h8 v-8 a2,2 0 0 1 2,-2 z"
            fill="url(#icon-heal-cross)" stroke="#0b5a26" stroke-width="1.4" filter="url(#icon-glow)" transform="translate(0 -1) scale(0.82)"/>
        <path d="${star(15, -15, 4.6, 1.2, 4, 0)}" fill="#e9fff0"/>
        <path d="${star(-16, -12, 3.6, 1, 4, 0)}" fill="#b8ffcc"/>
        <path d="${star(-15, 14, 3.2, 0.9, 4, 0)}" fill="#e9fff0"/>
        <path d="${star(16, 13, 3.6, 1, 4, 0)}" fill="#b8ffcc"/>`,

    // The dazed head bound round with chains: the hold
    hold: `
        <circle cy="4" r="12" fill="url(#icon-stun-head)" stroke="#2c1363" stroke-width="1.4"/>
        <path d="M-4.5,2 l3,3 m0,-3 l-3,3 M1.5,2 l3,3 m0,-3 l-3,3" stroke="#f4e9ff" stroke-width="1.5" stroke-linecap="round"/>
        <g fill="none" stroke="#c8c2d8" stroke-width="2.2">
            <ellipse cx="-13" cy="-4" rx="4" ry="2.6" transform="rotate(-30 -13 -4)"/>
            <ellipse cx="-6" cy="-9" rx="4" ry="2.6" transform="rotate(-10 -6 -9)"/>
            <ellipse cx="2" cy="-10" rx="4" ry="2.6"/>
            <ellipse cx="10" cy="-7" rx="4" ry="2.6" transform="rotate(20 10 -7)"/>
            <ellipse cx="15" cy="0" rx="4" ry="2.6" transform="rotate(50 15 0)"/>
        </g>
        <path d="${star(-16, 13, 4.6, 2)}" fill="url(#icon-stun-star)" stroke="#a86b00" stroke-width="0.9"/>`,

    // A sword striking down through a burst of light: a power strike
    powerStrike: `
        <path d="${star(0, 4, 20, 7, 10)}" fill="#ffcc4d" opacity="0.55"/>
        <g transform="rotate(35)">${SWORD}</g>`,

    // A round shield slammed forward, a burst behind it and stars: a shield bash
    shieldBash: `
        <path d="${star(4, 0, 21, 8, 9)}" fill="#ffcc4d" opacity="0.5"/>
        <g transform="translate(-3 2) scale(0.78)">
            <circle r="20" fill="url(#icon-wood)" stroke="#2b1a0d" stroke-width="1.6"/>
            <circle r="18.5" fill="none" stroke="#8d949b" stroke-width="2.8"/>
            <circle r="6" fill="url(#icon-steel)" stroke="#2f363d" stroke-width="1.2"/>
        </g>
        <path d="M-21,-12 L-14,-9 M-22,0 L-15,0 M-21,12 L-14,9" stroke="#f2e6cf" stroke-width="2" stroke-linecap="round"/>
        <path d="${star(15, -14, 4.6, 2)}" fill="url(#icon-stun-star)" stroke="#a86b00" stroke-width="0.9"/>`,

    // An arrow in the middle of a target: an aimed shot
    aimedShot: `
        <circle r="18" fill="#f2e6cf" stroke="#6b1f1f" stroke-width="1.4"/>
        <circle r="12" fill="#c83a2a"/>
        <circle r="6.5" fill="#f2e6cf"/>
        <circle r="2.6" fill="#c83a2a"/>
        <path d="M0,0 L17,-17" stroke="#6b4a22" stroke-width="2.2" stroke-linecap="round"/>
        <path d="M13,-21 L21,-21 L17,-17 Z M17,-13 L21,-21 L17,-17 Z" fill="#e8e1d2" stroke="#8a7d68" stroke-width="0.8"/>`,

    // Two swords crossed, over a red glow: picking a fight
    // A tent by a little fire under a crescent moon: making camp, to sleep till sunrise or sunset
    camp: `
        <circle r="20" fill="#1c2340" opacity="0.6"/>
        <path d="M9,-14 a7,7 0 1 0 6,10 a5.5,5.5 0 1 1 -6,-10 z" fill="#e8e2c4"/>
        <path d="M-17,13 L-6,-6 L5,13 z" fill="#c9b48a" stroke="#5a4426" stroke-width="1.4" stroke-linejoin="round"/>
        <path d="M-6,13 L-6,2 L-2,13 z" fill="#3a2a18"/>
        <path d="M9,13 h11 M10,15 l9,-4 M10,11 l9,4" stroke="#6b4a2a" stroke-width="1.8" stroke-linecap="round"/>
        <path d="M14.5,10 c-4,-4 -1,-8 0,-12 c1,4 5,6 0,12 z" fill="#ff9a2e"/>
        <path d="M14.5,10 c-2,-2 -0.5,-5 0,-7 c0.5,2 2.5,4 0,7 z" fill="#ffe28a"/>`,
    fight: `
        <circle r="20" fill="#7a1a14" opacity="0.45"/>
        <g transform="rotate(40)">${SWORD}</g>
        <g transform="rotate(-40)">${SWORD}</g>`,

    // A glowing green cross, with sparkles
    heal: `
        <circle r="21" fill="url(#icon-heal-glow)"/>
        <path d="M-5,-15 h10 a2,2 0 0 1 2,2 v8 h8 a2,2 0 0 1 2,2 v10 a2,2 0 0 1 -2,2 h-8 v8 a2,2 0 0 1 -2,2 h-10 a2,2 0 0 1 -2,-2 v-8 h-8 a2,2 0 0 1 -2,-2 v-10 a2,2 0 0 1 2,-2 h8 v-8 a2,2 0 0 1 2,-2 z"
            fill="url(#icon-heal-cross)" stroke="#0b5a26" stroke-width="1.4" filter="url(#icon-glow)" transform="translate(0 -1)"/>
        <path d="M-3.5,-13 h5 v9" fill="none" stroke="#f2fff5" stroke-width="1.6" stroke-linecap="round" opacity="0.75"/>
        <path d="${star(14, -13, 4.2, 1.1, 4, 0)}" fill="#e9fff0"/>
        <path d="${star(-15, 11, 3.2, 0.9, 4, 0)}" fill="#b8ffcc"/>
        <path d="${star(15, 12, 2.4, 0.7, 4, 0)}" fill="#e9fff0"/>`,

    // Stars circling a dazed, violet head
    stun: `
        <ellipse cy="-8" rx="19" ry="7" fill="none" stroke="#b98cff" stroke-width="2" stroke-dasharray="5 3" opacity="0.9"/>
        <circle cy="7" r="11" fill="url(#icon-stun-head)" stroke="#2c1363" stroke-width="1.4"/>
        <path d="M-4.5,5 l3,3 m0,-3 l-3,3 M1.5,5 l3,3 m0,-3 l-3,3" stroke="#f4e9ff" stroke-width="1.5" stroke-linecap="round"/>
        <path d="M-3,12.5 q3,-2 6,0" fill="none" stroke="#f4e9ff" stroke-width="1.4" stroke-linecap="round"/>
        <path d="${star(-17, -9, 5.4, 2.3)}" fill="url(#icon-stun-star)" stroke="#a86b00" stroke-width="0.9" filter="url(#icon-glow)"/>
        <path d="${star(2, -16, 6.2, 2.6)}" fill="url(#icon-stun-star)" stroke="#a86b00" stroke-width="0.9" filter="url(#icon-glow)"/>
        <path d="${star(17, -6, 4.6, 2)}" fill="url(#icon-stun-star)" stroke="#a86b00" stroke-width="0.9" filter="url(#icon-glow)"/>`,

    // Two stacks, one taken off the other: a stack split
    split: `
        <rect x="-20" y="-6" width="13" height="18" rx="2" fill="url(#icon-wood)" stroke="#3f2410" stroke-width="1.2"/>
        <rect x="-20" y="-12" width="13" height="6" rx="1.5" fill="#c79159" stroke="#3f2410" stroke-width="1.2"/>
        <rect x="7" y="2" width="13" height="10" rx="2" fill="url(#icon-wood)" stroke="#3f2410" stroke-width="1.2"/>
        <path d="M-3,-12 L-3,16" stroke="#f2e6cf" stroke-width="1.4" stroke-dasharray="3 2.5"/>
        <path d="M-1,-4 L6,-4 M3,-7 L6,-4 L3,-1" fill="none" stroke="#f2e6cf" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`,

    // A stack of gold coins, and one on its edge: sold
    sell: `
        <ellipse cx="-4" cy="12" rx="13" ry="4.5" fill="#c99a2e" stroke="#6b4a0c" stroke-width="1.1"/>
        <ellipse cx="-4" cy="7" rx="13" ry="4.5" fill="#e0b440" stroke="#6b4a0c" stroke-width="1.1"/>
        <ellipse cx="-4" cy="2" rx="13" ry="4.5" fill="#f2cf5c" stroke="#6b4a0c" stroke-width="1.1"/>
        <circle cx="11" cy="-9" r="9" fill="#f2cf5c" stroke="#6b4a0c" stroke-width="1.3"/>
        <circle cx="11" cy="-9" r="5.5" fill="none" stroke="#b8862e" stroke-width="1.1"/>`,

    // What lingers after some blows (core/afflictions.js), each as it shows on the player's plate:
    // a drop of venom with a little skull in it
    poisoned: `
        <path d="M0,-19 C6,-9 13,-2 13,6 A13,13 0 0 1 -13,6 C-13,-2 -6,-9 0,-19 Z" fill="#6cc03a" stroke="#1f4a10" stroke-width="1.4"/>
        <circle cx="-4" cy="3" r="2.6" fill="#1f3a10"/>
        <circle cx="4" cy="3" r="2.6" fill="#1f3a10"/>
        <path d="M-4,10 L4,10 M-2,10 L-2,13 M0,10 L0,13 M2,10 L2,13" stroke="#1f3a10" stroke-width="1.2"/>
        <ellipse cx="-6" cy="-4" rx="1.8" ry="3.6" fill="#e4ffb0" opacity="0.6" transform="rotate(25 -6 -4)"/>`,

    // A sickly pocked ball, flies about it
    diseased: `
        <circle cy="2" r="14.5" fill="#b8b04a" stroke="#4a4210" stroke-width="1.4"/>
        <circle cx="-6" cy="-3" r="3.2" fill="#7a5a1a"/>
        <circle cx="5" cy="-5" r="2.2" fill="#7a5a1a"/>
        <circle cx="7" cy="7" r="3.4" fill="#7a5a1a"/>
        <circle cx="-4" cy="9" r="2.4" fill="#7a5a1a"/>
        <circle cx="1" cy="2" r="1.6" fill="#7a5a1a"/>
        <g fill="#2a2418">
            <ellipse cx="14" cy="-16" rx="2" ry="1.3"/>
            <ellipse cx="-16" cy="-12" rx="1.8" ry="1.2"/>
            <ellipse cx="18" cy="-4" rx="1.6" ry="1.1"/>
        </g>
        <g fill="#e8eef2" opacity="0.7">
            <ellipse cx="13" cy="-18" rx="1.6" ry="0.9"/>
            <ellipse cx="-17" cy="-14" rx="1.4" ry="0.8"/>
            <ellipse cx="17" cy="-6" rx="1.3" ry="0.7"/>
        </g>`,

    // A grey heart, cracked, dark motes falling from it
    withered: `
        <circle r="18" fill="#3a2a4a" opacity="0.55"/>
        <path d="M0,14 C-13,5 -17,-3 -13,-9 C-9,-15 -3,-13 0,-7 C3,-13 9,-15 13,-9 C17,-3 13,5 0,14 Z" fill="#8a7a96" stroke="#2a1a3a" stroke-width="1.4"/>
        <path d="M0,-7 L-3,-1 L2,3 L-2,9" fill="none" stroke="#2a1a3a" stroke-width="1.8" stroke-linejoin="round"/>
        <circle cx="-11" cy="15" r="1.7" fill="#c8a8e8"/>
        <circle cx="9" cy="18" r="1.3" fill="#c8a8e8"/>
        <circle cx="15" cy="10" r="1" fill="#c8a8e8"/>`,

    // A flame
    burning: `
        <path d="M0,19 C-11,19 -15,10 -12,2 C-10,-4 -5,-6 -6,-14 C0,-10 3,-5 2,1 C5,-2 6,-7 5,-12 C12,-5 15,4 12,11 C10,16 6,19 0,19 Z" fill="#ff6a14" stroke="#7a2a00" stroke-width="1.3"/>
        <path d="M0,17 C-6,17 -8,12 -6,8 C-4,4 -1,3 -1,-2 C3,2 5,6 4,10 C6,9 7,7 7,4 C9,9 8,17 0,17 Z" fill="#ffd060"/>`,

    // A drop of blood, and another falling
    bleeding: `
        <path d="M-3,-17 C3,-7 10,-1 10,7 A13,13 0 0 1 -16,7 C-16,-1 -9,-7 -3,-17 Z" fill="#b0140c" stroke="#4a0503" stroke-width="1.4"/>
        <path d="M13,5 C15,9 17,11 17,14 A4,4 0 0 1 9,14 C9,11 11,9 13,5 Z" fill="#b0140c" stroke="#4a0503" stroke-width="1"/>
        <ellipse cx="-9" cy="3" rx="2.2" ry="4.2" fill="#ff8a7a" opacity="0.55" transform="rotate(20 -9 3)"/>`,

    // Slowed: a snail
    slowed: `
        <path d="M-19,13 L13,13 C17,13 19,10 17,7 L11,7" fill="#c8b08a" stroke="#4a3a20" stroke-width="1.3"/>
        <circle cx="-3" cy="1" r="11" fill="#a8743f" stroke="#4a2c14" stroke-width="1.4"/>
        <path d="M-3,1 m0,-7 a7,7 0 1 1 -7,7 a4.6,4.6 0 1 1 4.6,-4.6 a2.3,2.3 0 1 1 -2.3,2.3" fill="none" stroke="#4a2c14" stroke-width="1.3"/>
        <path d="M14,7 L16,-2 M16,8 L20,0" stroke="#4a3a20" stroke-width="1.4" stroke-linecap="round"/>`,

    // ...caught in a web
    webbed: `
        <g stroke="#f2f2e8" stroke-width="1.3" fill="none" stroke-linejoin="round">
            <path d="M0,-18 L0,18 M-18,0 L18,0 M-13,-13 L13,13 M13,-13 L-13,13"/>
            <path d="M0,-6 L4.2,-4.2 L6,0 L4.2,4.2 L0,6 L-4.2,4.2 L-6,0 L-4.2,-4.2 Z"/>
            <path d="M0,-11.5 Q6,-9.5 8.1,-8.1 Q9.5,-6 11.5,0 Q9.5,6 8.1,8.1 Q6,9.5 0,11.5 Q-6,9.5 -8.1,8.1 Q-9.5,6 -11.5,0 Q-9.5,-6 -8.1,-8.1 Q-6,-9.5 0,-11.5 Z"/>
            <path d="M0,-17 Q8,-14 12,-12 Q14,-8 17,0 Q14,8 12,12 Q8,14 0,17 Q-8,14 -12,12 Q-14,8 -17,0 Q-14,-8 -12,-12 Q-8,-14 0,-17 Z"/>
        </g>
        <circle cx="5" cy="-8" r="2.4" fill="#2a2018"/>`,

    // ...held by roots
    rooted: `
        <path d="M-19,17 L19,17" stroke="#3a2a14" stroke-width="2.6" stroke-linecap="round"/>
        <path d="M-14,17 C-9,8 -14,-2 -6,-12 M-6,-12 C-4,-15 -2,-15 -1,-17 M1,17 C3,6 -3,-1 3,-15 M3,-15 L6,-18 M14,17 C8,9 13,-1 9,-10 M9,-10 L12,-13" fill="none" stroke="#6a5030" stroke-width="3.2" stroke-linecap="round"/>
        <path d="M-10,4 C-6,2 -2,4 2,2 C6,0 9,3 12,1" fill="none" stroke="#8a6a40" stroke-width="2" stroke-linecap="round"/>`,

    // ...chilled to the bone
    chilled: `
        <g stroke="#bfe8ff" stroke-width="2.4" stroke-linecap="round" fill="none">
            <path d="M0,-18 L0,18 M-15.6,-9 L15.6,9 M-15.6,9 L15.6,-9"/>
            <path d="M-4,-14 L0,-10 L4,-14 M-4,14 L0,10 L4,14 M-14,-3 L-9,-6 L-10,-11 M14,3 L9,6 L10,11 M-14,3 L-9,6 L-10,11 M14,-3 L9,-6 L10,-11"/>
        </g>`,

    // Two arrows passing each other, the one going gold: offered in trade
    offer: `
        <path d="M-16,-6 L9,-6" stroke="#f2cf5c" stroke-width="3.4" stroke-linecap="round"/>
        <path d="M6,-13 L17,-6 L6,1 Z" fill="#f2cf5c" stroke="#6b4a0c" stroke-width="0.8"/>
        <path d="M16,8 L-9,8" stroke="#f2e6cf" stroke-width="3.4" stroke-linecap="round"/>
        <path d="M-6,1 L-17,8 L-6,15 Z" fill="#f2e6cf"/>`,

    // Something let fall to the ground
    drop: `
        <path d="M0,-19 L0,1" stroke="#f2e6cf" stroke-width="3.4" stroke-linecap="round"/>
        <path d="M-8,-3 L0,7 L8,-3 Z" fill="#f2e6cf"/>
        <path d="M-18,14 L18,14" stroke="#b09062" stroke-width="3.2" stroke-linecap="round"/>
        <path d="M-12,19 L-6,19 M2,19 L10,19" stroke="#8a7050" stroke-width="2" stroke-linecap="round"/>`,

    // Crossed out, in red: thrown away
    discard: `
        <circle r="16" fill="#6e1812" stroke="#e05a4a" stroke-width="2.2"/>
        <path d="M-7,-7 L7,7 M7,-7 L-7,7" stroke="#ffe4de" stroke-width="3.4" stroke-linecap="round"/>`,

    // A little action wheel, a slice lit: put on one
    onWheel: `
        <circle r="18" fill="#2a2016" stroke="#ecc882" stroke-width="1.6"/>
        <path d="M0,0 L-6.9,-16.6 A18,18 0 0 1 6.9,-16.6 Z" fill="#ecc882" opacity="0.7"/>
        <path d="M0,-18 L0,18 M-18,0 L18,0 M-12.7,-12.7 L12.7,12.7 M12.7,-12.7 L-12.7,12.7" stroke="#ecc882" stroke-width="0.9" opacity="0.6"/>
        <circle r="5.5" fill="#2a2016" stroke="#ecc882" stroke-width="1.4"/>`,

    // An arrow curving up and away: taken off
    takeOff: `
        <path d="M-12,14 C-12,-2 -4,-10 8,-10" fill="none" stroke="#f2e6cf" stroke-width="3.4" stroke-linecap="round"/>
        <path d="M5,-17 L15,-10 L5,-3 Z" fill="#f2e6cf"/>`,

    // Two arrows chasing each other round: the wheel turned to its other side
    flip: `
        <circle r="19" fill="#f2e6cf" opacity="0.12"/>
        <path d="M-13,-3 A13.5,13.5 0 0 1 9,-10" fill="none" stroke="#f2e6cf" stroke-width="3" stroke-linecap="round"/>
        <path d="M5,-16 L14,-7 L3,-5 Z" fill="#f2e6cf"/>
        <path d="M13,3 A13.5,13.5 0 0 1 -9,10" fill="none" stroke="#f2e6cf" stroke-width="3" stroke-linecap="round"/>
        <path d="M-5,16 L-14,7 L-3,5 Z" fill="#f2e6cf"/>`,

    // The boons bought by talking (core/host.js BOUGHT), shown on the plate while they last: the
    // temple's blessing, a six-pointed star (for its six deities) under a halo in a golden light;
    // a smith's sharpening, a sword on a whetstone, the edge glinting and sparks flying
    blessing: `
        <circle r="22" fill="url(#icon-bless-glow)"/>
        ${[0, 1, 2, 3, 4, 5].map((k) => `<path d="M-1.6,0 L0,-20 L1.6,0 Z" fill="#fff0a0" opacity="0.8" transform="translate(0 4) rotate(${k * 60 + 30})"/>`).join("")}
        <ellipse cy="-14" rx="10" ry="3.2" fill="none" stroke="#fff4b8" stroke-width="2.2" filter="url(#icon-glow)"/>
        <path d="${star(0, 4, 12, 6, 6)}" fill="url(#icon-stun-star)" stroke="#8a5a10" stroke-width="1.1" stroke-linejoin="round"/>
        <circle cy="4" r="3" fill="#fffbe6"/>`,
    staminaBoost: STAMINA_BOOST,
    scrollOfSafety: SCROLL_OF_SAFETY,
    sharpening: `
        <rect x="-9" y="-3.3" width="18" height="6.6" rx="2" transform="translate(8 5) rotate(28)" fill="#80888f" stroke="#2f363b" stroke-width="1.1"/>
        <path d="M-7,-1 L7,-1" transform="translate(8 5) rotate(28)" stroke="#a8b0b6" stroke-width="1"/>
        <g transform="translate(-2 -1) rotate(45)">${SWORD}</g>
        <path d="M9,-4 L15,-8 M10,-1 L17,-1 M9,2 L14,5" stroke="#ffb030" stroke-width="1.5" stroke-linecap="round"/>
        <path d="${star(10, -16, 6, 1.6, 4, 0)}" fill="#ffffff" filter="url(#icon-glow)"/>`,
});

// A tunic's outline (a gambeson's, a mail shirt's): shoulders, sleeves and a round neck
const TUNIC = "M-8,-18 L-18,-13 L-22,1 L-16,3 L-13,-4 L-13,20 L13,20 L13,-4 L16,3 L22,1 L18,-13 L8,-18 C5,-13 -5,-13 -8,-18 Z";

// A colour a share lighter (+) or darker (-), as #rrggbb
function tone(hex, by) {
    const value = parseInt(hex.slice(1), 16);
    const channel = (shift) => {
        const c = (value >> shift) & 255;

        return Math.round(by >= 0 ? c + (255 - c) * by : c * (1 + by));
    };

    return `#${[16, 8, 0].map((shift) => channel(shift).toString(16).padStart(2, "0")).join("")}`;
}

// The creatures' parts' pictures (core/spoils.js PARTS: each part's `icon`), in its colour
const PART_PICTURES = {
    pelt: (c) => `
        <path d="M-17,-12 C-12,-19 -4,-15 0,-18 C4,-15 12,-19 17,-12 C14,-4 19,4 15,12 C10,19 3,15 0,19 C-3,15 -10,19 -15,12 C-19,4 -14,-4 -17,-12 Z" fill="${c}" stroke="${tone(c, -0.55)}" stroke-width="1.3"/>
        <path d="M-9,-6 C-6,-2 -8,4 -5,8 M0,-10 C2,-3 -1,4 1,11 M9,-6 C6,-1 8,5 5,9" fill="none" stroke="${tone(c, -0.3)}" stroke-width="1.2" stroke-linecap="round"/>
        <path d="M-12,-10 C-6,-13 6,-13 12,-10" fill="none" stroke="${tone(c, 0.35)}" stroke-width="1.4" stroke-linecap="round" opacity="0.7"/>`,
    hide: (c) => `
        <path d="M-18,-9 L-9,-15 L0,-12 L9,-16 L18,-9 L14,0 L19,9 L9,15 L0,12 L-9,16 L-18,9 L-14,0 Z" fill="${c}" stroke="${tone(c, -0.55)}" stroke-width="1.3"/>
        <path d="M-10,-5 L10,-5 M-11,1 L11,1 M-10,7 L10,7" stroke="${tone(c, -0.25)}" stroke-width="1" stroke-dasharray="2 2"/>`,
    skin: (c) => `
        <path d="M-16,14 C-20,4 -8,2 -10,-6 C-12,-14 2,-19 8,-14 C14,-9 6,-3 10,4 C14,11 4,19 -4,17 Z" fill="${c}" stroke="${tone(c, -0.55)}" stroke-width="1.3"/>
        <path d="M-10,8 L-4,4 M-6,-4 L0,-8 M2,6 L7,2" stroke="${tone(c, -0.35)}" stroke-width="1.6" stroke-linecap="round"/>`,
    fang: (c) => `
        <path d="M-6,-17 C-2,-19 6,-18 8,-15 C10,-6 4,6 -2,18 C-3,8 -9,-6 -6,-17 Z" fill="${c}" stroke="${tone(c, -0.5)}" stroke-width="1.3"/>
        <path d="M-3,-14 C-3,-6 -2,2 -1,8" fill="none" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" opacity="0.6"/>`,
    tusk: (c) => `
        <path d="M-17,14 C-18,-2 -6,-16 14,-17 C6,-12 -4,-2 -9,16 Z" fill="${c}" stroke="${tone(c, -0.5)}" stroke-width="1.3"/>
        <path d="M-13,10 L-8,12 M-11,4 L-6,7" stroke="${tone(c, -0.35)}" stroke-width="1.2"/>`,
    claw: (c) => `
        <path d="M-14,16 C-16,0 -6,-14 12,-17 C4,-10 -2,-2 -3,16 Z" fill="${c}" stroke="${tone(c, 0.35)}" stroke-width="1.3"/>
        <path d="M-10,12 C-10,2 -4,-6 4,-11" fill="none" stroke="${tone(c, 0.5)}" stroke-width="1.2" stroke-linecap="round" opacity="0.7"/>`,
    sting: (c) => `
        <path d="M-12,-16 C0,-18 14,-10 14,4 C14,10 8,14 2,18 C4,10 2,4 -4,0 C-10,-4 -14,-8 -12,-16 Z" fill="${c}" stroke="${tone(c, -0.5)}" stroke-width="1.3"/>
        <circle cx="2" cy="18" r="1.8" fill="${tone(c, -0.6)}"/>`,
    quill: (c) => `
        <path d="M-15,15 L15,-15" stroke="${tone(c, -0.45)}" stroke-width="4" stroke-linecap="round"/>
        <path d="M-15,15 L15,-15" stroke="${c}" stroke-width="2.4" stroke-linecap="round"/>
        <path d="M-15,15 L-8,8" stroke="#2a221a" stroke-width="3" stroke-linecap="round"/>
        <path d="M-8,18 L12,-12 M-18,8 L6,-16" stroke="${c}" stroke-width="1.6" stroke-linecap="round" opacity="0.7"/>`,
    tail: (c) => `
        <path d="M-16,-12 C-4,-16 6,-6 4,4 C2,12 10,16 16,14" fill="none" stroke="${tone(c, -0.4)}" stroke-width="5.4" stroke-linecap="round"/>
        <path d="M-16,-12 C-4,-16 6,-6 4,4 C2,12 10,16 16,14" fill="none" stroke="${c}" stroke-width="3.4" stroke-linecap="round"/>`,
    gel: (c) => `
        <path d="M-16,10 C-18,-4 -8,-16 0,-16 C8,-16 18,-4 16,10 C12,18 -12,18 -16,10 Z" fill="${c}" fill-opacity="0.85" stroke="${tone(c, -0.5)}" stroke-width="1.3"/>
        <ellipse cx="-6" cy="-6" rx="4" ry="5" fill="#ffffff" opacity="0.45"/>
        <circle cx="5" cy="4" r="2.4" fill="${tone(c, -0.35)}"/>`,
    wing: (c) => `
        <path d="M-18,-6 L0,-14 L18,-6 L12,4 L8,0 L4,10 L0,4 L-4,10 L-8,0 L-12,4 Z" fill="${c}" stroke="${tone(c, -0.6)}" stroke-width="1.2" stroke-linejoin="round"/>
        <path d="M0,-14 L-12,4 M0,-14 L-4,10 M0,-14 L4,10 M0,-14 L12,4" stroke="${tone(c, 0.3)}" stroke-width="1"/>`,
    meat: (c) => `
        <path d="M-15,4 C-19,-8 -6,-17 6,-14 C17,-11 18,4 9,10 C3,14 -11,14 -15,4 Z" fill="${c}" stroke="${tone(c, -0.5)}" stroke-width="1.3"/>
        <path d="M-9,-2 C-4,-8 4,-9 10,-4" fill="none" stroke="#f3d6c4" stroke-width="2" stroke-linecap="round"/>
        <path d="M8,9 L16,17" stroke="#efe6d0" stroke-width="4" stroke-linecap="round"/>
        <circle cx="17" cy="18" r="2.8" fill="#efe6d0"/>`,
    gland: (c) => `
        <path d="M0,-17 C4,-12 14,-6 13,5 C12,14 -12,14 -13,5 C-14,-6 -4,-12 0,-17 Z" fill="${c}" stroke="${tone(c, -0.55)}" stroke-width="1.3"/>
        <ellipse cx="-4" cy="0" rx="3" ry="5" fill="#ffffff" opacity="0.4"/>
        <path d="M-6,8 C-2,6 2,10 6,7" fill="none" stroke="${tone(c, -0.35)}" stroke-width="1.2"/>`,
    ear: (c) => `
        <path d="M-10,16 C-16,4 -12,-14 12,-18 C8,-8 10,6 2,16 Z" fill="${c}" stroke="${tone(c, -0.5)}" stroke-width="1.3"/>
        <path d="M-5,11 C-8,2 -4,-8 7,-12" fill="none" stroke="${tone(c, -0.3)}" stroke-width="2.2" stroke-linecap="round"/>`,
    dust: (c) => `
        <path d="M-14,-6 C-14,-14 14,-14 14,-6 L12,14 C12,18 -12,18 -12,14 Z" fill="#8a6a44" stroke="#3f2a14" stroke-width="1.3"/>
        <ellipse cy="-6" rx="14" ry="4" fill="${c}" stroke="#3f2a14" stroke-width="1"/>
        <path d="M-9,-14 C-6,-17 -2,-16 0,-18 C3,-15 7,-17 9,-14" fill="none" stroke="#5a3f22" stroke-width="1.6"/>`,
    skull: (c) => `
        <path d="M-13,2 C-17,-18 17,-18 13,2 L10,6 L10,14 L-10,14 L-10,6 Z" fill="${c}" stroke="${tone(c, -0.55)}" stroke-width="1.3"/>
        <ellipse cx="-5.5" cy="-2" rx="4" ry="4.5" fill="#1a1510"/>
        <ellipse cx="5.5" cy="-2" rx="4" ry="4.5" fill="#1a1510"/>
        <path d="M0,4 L-2,8 L2,8 Z" fill="#1a1510"/>
        <path d="M-6,11 L-6,14 M-2,11 L-2,14 M2,11 L2,14 M6,11 L6,14" stroke="${tone(c, -0.5)}" stroke-width="1"/>`,
    sigil: (c) => `
        <circle r="16" fill="${tone(c, -0.35)}" stroke="#c8a840" stroke-width="2"/>
        <path d="M0,-11 L6.5,9 L-10.5,-3.4 L10.5,-3.4 L-6.5,9 Z" fill="none" stroke="#e8c870" stroke-width="1.6"/>
        <circle r="3" fill="${c}"/>`,
    vial: (c) => `
        <path d="M-5,-12 L5,-12 L5,-4 C12,0 12,14 0,16 C-12,14 -12,0 -5,-4 Z" fill="url(#icon-glass)" stroke="#3a2f45" stroke-width="1.3"/>
        <path d="M-9,4 C-9,12 9,12 9,4 C5,6 -5,6 -9,4 Z" fill="${c}"/>
        <rect x="-6" y="-18" width="12" height="6" rx="1.5" fill="#a8743f" stroke="#4a2c14" stroke-width="1"/>`,
    scale: (c) => `
        <path d="M0,-17 C12,-12 16,0 12,10 C8,17 -8,17 -12,10 C-16,0 -12,-12 0,-17 Z" fill="${c}" stroke="${tone(c, -0.55)}" stroke-width="1.3"/>
        <path d="M0,-14 L0,12 M-8,-4 C-4,0 4,0 8,-4" fill="none" stroke="${tone(c, 0.3)}" stroke-width="1.2"/>
        <ellipse cx="-5" cy="-7" rx="2.6" ry="4" fill="#ffffff" opacity="0.35"/>`,
    plate: (c) => `
        <path d="M-17,-6 C-10,-14 10,-14 17,-6 L14,10 C8,15 -8,15 -14,10 Z" fill="${c}" stroke="${tone(c, -0.55)}" stroke-width="1.3"/>
        <path d="M-15,0 C-8,-6 8,-6 15,0 M-13,6 C-7,1 7,1 13,6" fill="none" stroke="${tone(c, -0.3)}" stroke-width="1.2"/>`,
    charm: (c) => `
        <path d="M-10,-18 C-4,-12 4,-12 10,-18" fill="none" stroke="#5a3f22" stroke-width="1.6"/>
        <path d="M0,-12 L0,-6" stroke="#5a3f22" stroke-width="1.6"/>
        <path d="M-9,-6 L9,-6 L6,12 L0,17 L-6,12 Z" fill="${c}" stroke="${tone(c, -0.55)}" stroke-width="1.3"/>
        <circle cy="3" r="3.2" fill="#e8c870" stroke="${tone(c, -0.55)}" stroke-width="0.8"/>`,
    essence: (c) => `
        <circle r="16" fill="${c}" opacity="0.25"/>
        <circle r="10" fill="${c}" opacity="0.55"/>
        <circle r="5.5" fill="#ffffff" opacity="0.95"/>
        <path d="M0,-18 L0,-12 M0,12 L0,18 M-18,0 L-12,0 M12,0 L18,0" stroke="${c}" stroke-width="1.6" stroke-linecap="round"/>`,
    wood: (c) => `
        <path d="M-16,-8 L10,-14 L16,6 L-10,14 Z" fill="${c}" stroke="${tone(c, -0.55)}" stroke-width="1.3"/>
        <ellipse cx="13" cy="-4" rx="4" ry="10" transform="rotate(-18 13 -4)" fill="${tone(c, 0.35)}" stroke="${tone(c, -0.55)}" stroke-width="1"/>
        <path d="M-12,-3 L8,-8 M-10,4 L10,-1 M-8,10 L12,5" stroke="${tone(c, -0.3)}" stroke-width="1"/>`,
    fungus: (c) => `
        <path d="M-4,4 L-3,17 L4,17 L4,4 Z" fill="#e8dcc8" stroke="#6a5a48" stroke-width="1.1"/>
        <path d="M-17,4 C-17,-12 17,-12 17,4 Z" fill="${c}" stroke="${tone(c, -0.55)}" stroke-width="1.3"/>
        <circle cx="-7" cy="-4" r="2.2" fill="${tone(c, 0.5)}"/>
        <circle cx="5" cy="-6" r="2.6" fill="${tone(c, 0.5)}"/>
        <circle cx="10" cy="0" r="1.6" fill="${tone(c, 0.5)}"/>`,
    silk: (c) => `
        <ellipse rx="15" ry="11" fill="${c}" stroke="${tone(c, -0.35)}" stroke-width="1.3"/>
        <path d="M-15,-3 C-5,6 5,-8 15,2 M-12,-8 C-2,2 8,-12 14,-4 M-13,6 C-3,12 7,2 13,8" fill="none" stroke="${tone(c, -0.2)}" stroke-width="1"/>
        <path d="M14,4 C18,10 16,16 20,19" fill="none" stroke="${c}" stroke-width="1.2"/>`,
    jaw: (c) => `
        <path d="M-17,-8 L-13,6 C-8,15 8,15 13,6 L17,-8 L12,-8 L9,3 C5,8 -5,8 -9,3 L-12,-8 Z" fill="${c}" stroke="${tone(c, -0.55)}" stroke-width="1.3"/>
        <path d="M-9,1 L-8,-4 M-5,4 L-5,-1 M5,4 L5,-1 M9,1 L8,-4" stroke="#fffaf0" stroke-width="1.8" stroke-linecap="round"/>`,
    core: (c) => `
        <path d="M0,-16 L13,-7 L13,8 L0,17 L-13,8 L-13,-7 Z" fill="${tone(c, -0.6)}" stroke="#1a1510" stroke-width="1.3"/>
        <path d="M0,-9 L7,-4 L7,5 L0,10 L-7,5 L-7,-4 Z" fill="${c}"/>
        <circle r="3.5" fill="#ffffff" opacity="0.8"/>`,
    shard: (c) => `
        <path d="M-4,-18 L8,-6 L4,17 L-9,4 Z" fill="${c}" stroke="${tone(c, -0.5)}" stroke-width="1.3" stroke-linejoin="round"/>
        <path d="M-4,-18 L-1,2 L4,17 M-1,2 L8,-6" fill="none" stroke="${tone(c, 0.45)}" stroke-width="1"/>`,
    heart: (c) => `
        <path d="M0,16 C-18,4 -18,-14 -8,-14 C-3,-14 0,-10 0,-7 C0,-10 3,-14 8,-14 C18,-14 18,4 0,16 Z" fill="${c}" stroke="${tone(c, -0.55)}" stroke-width="1.3"/>
        <ellipse cx="-7" cy="-6" rx="3" ry="4" fill="#ffffff" opacity="0.4"/>`,
    ingot: (c) => `
        <path d="M-16,6 L-10,-6 L16,-6 L10,6 Z" fill="${tone(c, 0.3)}" stroke="#1a1c20" stroke-width="1.2"/>
        <path d="M-16,6 L10,6 L10,13 L-16,13 Z" fill="${c}" stroke="#1a1c20" stroke-width="1.2"/>
        <path d="M10,6 L16,-6 L16,1 L10,13 Z" fill="${tone(c, -0.35)}" stroke="#1a1c20" stroke-width="1.2"/>`,
};

/** A creature's part's picture (spoils.js PARTS: `icon`, `tint`). */
export const partIcon = ({ icon, tint }) => (PART_PICTURES[icon] ?? PART_PICTURES.gel)(tint);

// A few gold coins, stacked and scattered (what's found on a creature besides its parts)
const COINS = `
    <ellipse cx="-6" cy="10" rx="10" ry="4" fill="#b8892a" stroke="#5a3f10" stroke-width="1.2"/>
    <ellipse cx="-6" cy="6" rx="10" ry="4" fill="#d9a83a" stroke="#5a3f10" stroke-width="1.2"/>
    <ellipse cx="-6" cy="2" rx="10" ry="4" fill="#f0c858" stroke="#5a3f10" stroke-width="1.2"/>
    <ellipse cx="8" cy="-6" rx="9" ry="9" fill="#f0c858" stroke="#5a3f10" stroke-width="1.2"/>
    <ellipse cx="8" cy="-6" rx="5.5" ry="5.5" fill="none" stroke="#b8892a" stroke-width="1"/>`;

/** Each thing that can be carried's icon (core/progress.js ITEMS): SVG drawn round 0, 0, about 44 across. */
// A draught of a cure, its liquid the colour of what it cures (a gradient in DEFS: icon-cure-...)
function draught(cures) {
    return `
        <circle cy="6" r="13.5" fill="url(#icon-glass)" stroke="#3a2f45" stroke-width="1.3"/>
        <path d="M-12.6,3 A13,13 0 1 0 12.6,3 Z" transform="translate(0 0.5) scale(0.97)" fill="url(#icon-cure-${cures})"/>
        <path d="M-4,-14 L4,-14 L4,-6 L-4,-6 Z" fill="url(#icon-glass)" stroke="#3a2f45" stroke-width="1.2"/>
        <rect x="-5.5" y="-20" width="11" height="7" rx="1.8" fill="#6a6a70" stroke="#2a2a30" stroke-width="1"/>
        <ellipse cx="-5.5" cy="1" rx="2.6" ry="4.4" fill="#ffffff" opacity="0.55" transform="rotate(25 -5.5 1)"/>`;
}

// A spell's tome: a bound book, the spell's own icon on its cover, its corners as rare as it is
// (silver, green, violet and gold)
const CORNERS = { common: "#c8ccd4", uncommon: "#5ad06a", rare: "#c070ff" };

function tomeIcon(spell) {
    const corner = CORNERS[SPELLS[spell].tome] ?? CORNERS.common;

    return `
        <path d="M-15,-19 L13,-19 L16,-16 L16,19 L-12,19 L-15,16 Z" fill="#efe4c8" stroke="#6a5a3a" stroke-width="1"/>
        <path d="M-13,17 L14,17 M-13,15 L14,15" stroke="#c8b890" stroke-width="0.7"/>
        <rect x="-17" y="-21" width="30" height="37" rx="2.5" fill="url(#icon-grimoire)" stroke="#1a0818" stroke-width="1.3"/>
        <path d="M-13,-21 L-13,16" stroke="#1a0818" stroke-width="1.2" opacity="0.6"/>
        <rect x="-10" y="-17" width="20" height="29" rx="1.5" fill="none" stroke="#d8b860" stroke-width="0.9"/>
        <g transform="translate(0 -2.5) scale(0.42)">${ICONS[spell] ?? ""}</g>
        <g fill="${corner}" stroke="#2a1a28" stroke-width="0.6">
            <path d="M-17,-21 L-11,-21 L-17,-15 Z"/><path d="M13,-21 L7,-21 L13,-15 Z"/><path d="M-17,16 L-11,16 L-17,10 Z"/><path d="M13,16 L7,16 L13,10 Z"/>
        </g>`;
}


// --- Gear (core/gear.js): each people's uniform in its colours (characters/liveries.js) ---

/** Each people's emblem, drawn round 0, 0 about 32 across in a colour (and what it's on, `ground`). */
export const EMBLEMS = Object.freeze({
    crown: (c) => `<path d="M-14,9 L-14,-6 L-7,2 L0,-11 L7,2 L14,-6 L14,9 Z" fill="${c}"/><circle cx="0" cy="-12" r="2.4" fill="${c}"/>`,
    leaf: (c, ground) => `<path d="M0,-16 C13,-6 13,6 0,16 C-13,6 -13,-6 0,-16 Z" fill="${c}"/><path d="M0,-12 L0,13 M0,-3 L6,-8 M0,4 L-6,-1" stroke="${ground}" stroke-width="1.6" fill="none"/>`,
    spider: (c) => `<g fill="${c}" stroke="${c}" stroke-width="2.2" stroke-linecap="round"><circle cy="-6" r="4.5"/><ellipse cy="5" rx="5.5" ry="7.5"/><path d="M-4,-3 L-12,-10 L-15,-3 M4,-3 L12,-10 L15,-3 M-4,1 L-13,0 L-16,7 M4,1 L13,0 L16,7 M-4,5 L-11,9 L-13,16 M4,5 L11,9 L13,16 M-3,9 L-7,14 L-7,19 M3,9 L7,14 L7,19" fill="none"/></g>`,
    sun: (c) => `<path d="${star(0, 0, 16, 9, 12)}" fill="${c}"/><circle r="7.5" fill="${c}"/>`,
    serpent: (c) => `<path d="M-9,-13 C9,-15 10,-2 0,0 C-10,2 -9,15 10,13" fill="none" stroke="${c}" stroke-width="5" stroke-linecap="round"/><circle cx="-10" cy="-13" r="4" fill="${c}"/>`,
    claws: (c) => `<path d="M-11,-14 L-5,14 M-1,-16 L5,12 M8,-14 L13,10" stroke="${c}" stroke-width="4.5" stroke-linecap="round" fill="none"/>`,
});

const emblemOf = (livery, colour = livery.trim, ground = livery.main) => EMBLEMS[livery.emblem](colour, ground);

// A boot's outline (without spikes)
const BOOT = "M-9,-20 L4,-20 L4,-1 C11,0 17,4 18,10 L18,14 L-10,14 Z";

// A glove's outline, the fingers up
const GLOVE = "M-10,20 L-10,4 C-14,0 -16,-6 -14,-10 L-12,-10 L-9,-3 L-9,-16 C-9,-19 -5,-19 -5,-16 L-5,-6 L-4,-19 C-4,-22 0,-22 0,-19 L0,-6 L1,-18 C1,-21 5,-21 5,-18 L5,-5 L6,-14 C6,-17 10,-17 10,-14 L10,6 C10,12 8,16 8,20 Z";

// A pair of legs' outline (trousers)
const LEGS = "M-12,-18 L12,-18 L14,20 L4,20 L0,-4 L-4,20 L-14,20 Z";

// A cape's outline
const CAPE = "M-8,-20 L8,-20 C12,-10 18,8 20,20 L-20,20 C-18,8 -12,-10 -8,-20 Z";

// A heater shield's outline
const HEATER = "M-15,-19 L15,-19 C15,-1 9,12 0,21 C-9,12 -15,-1 -15,-19 Z";

// Two bracers, crossed
const bracersIcon = (fill, stroke, band) => [-1, 1].map((side) => `<g transform="rotate(${side * 18})"><rect x="${side < 0 ? -16 : 2}" y="-10" width="14" height="24" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="1.2"/><path d="M${side < 0 ? -15 : 3},-3 h12 M${side < 0 ? -15 : 3},5 h12" stroke="${band}" stroke-width="1.3"/></g>`).join("");

/** Each people's make of each uniform piece's icon (core/gear.js UNIFORM), in their colours. */
export function uniformIcon(id, people = "human") {
    const livery = LIVERIES[people] ?? LIVERIES.human;
    const { main, trim, dark, metal } = livery;
    const edge = "#1a1614";

    switch (id) {
        case "helm":
            return `
                <path d="M-2,-12 C4,-25 15,-23 19,-14 C11,-18 5,-15 3,-10 Z" fill="${main}" stroke="${edge}" stroke-width="1"/>
                <path d="M-16,5 C-16,-15 16,-15 16,5 L16,15 L8,15 L6,6 L-6,6 L-8,15 L-16,15 Z" fill="${metal}" stroke="${edge}" stroke-width="1.3"/>
                <rect x="-16" y="1.5" width="32" height="4" fill="${trim}" stroke="${edge}" stroke-width="0.8"/>
                <path d="M-9,-8 C-5,-11 1,-11 5,-9" fill="none" stroke="#ffffff" stroke-width="1" opacity="0.5"/>`;
        case "hauberk":
            return `
                <path d="${TUNIC}" fill="${people === "orc" ? metal : "url(#icon-mail)"}" stroke="${edge}" stroke-width="1.3"/>
                <path d="M-11,-15 L11,-15 L12,20 L-12,20 Z" fill="${main}" stroke="${trim}" stroke-width="1.6"/>
                <g transform="translate(0 2) scale(0.5)">${emblemOf(livery)}</g>`;
        case "vambraces":
            return bracersIcon(metal, edge, trim);
        case "warGloves":
            return `<path d="${GLOVE}" fill="${metal}" stroke="${edge}" stroke-width="1.2"/><rect x="-11" y="12" width="20" height="5" fill="${trim}" stroke="${edge}" stroke-width="0.8"/>`;
        case "girdle":
            return `
                <path d="M-21,-4 C-7,-8 7,-8 21,-4 L21,4 C7,0 -7,0 -21,4 Z" fill="${main}" stroke="${edge}" stroke-width="1.2"/>
                <path d="M-21,-2 C-7,-6 7,-6 21,-2" fill="none" stroke="${trim}" stroke-width="1"/>
                <rect x="-6" y="-8" width="12" height="11" rx="1.5" fill="none" stroke="${metal}" stroke-width="2.6"/>`;
        case "legguards":
            return `<path d="${LEGS}" fill="${dark}" stroke="${edge}" stroke-width="1.3"/><path d="M-13,3 L-5,3 L-4.5,19 L-13.5,19 Z M5,3 L13,3 L13.5,19 L4.5,19 Z" fill="${metal}" stroke="${edge}" stroke-width="1"/><path d="M-12,-14 L12,-14" stroke="${trim}" stroke-width="1.6"/>`;
        case "warBoots":
            return `<path d="${BOOT}" fill="${metal}" stroke="${edge}" stroke-width="1.3"/><path d="M-10,-21 L5,-21 L5,-16 L-10,-16 Z" fill="${trim}" stroke="${edge}" stroke-width="1"/><path d="M-11,14 L19,14 L19,17.5 L-11,17.5 Z" fill="${edge}"/><path d="M4,3 C9,4 13,7 15,11" fill="none" stroke="${edge}" stroke-width="0.9"/>`;
        case "cloak":
            return `
                <path d="${CAPE}" fill="${main}" stroke="${edge}" stroke-width="1.3"/>
                <path d="${CAPE}" fill="none" stroke="${trim}" stroke-width="1.4" transform="scale(0.9) translate(0 1)"/>
                <g transform="translate(0 5) scale(0.42)">${emblemOf(livery)}</g>
                <circle cy="-17" r="2.6" fill="${metal}" stroke="${edge}" stroke-width="0.8"/>`;
        case "shield":
            return `
                <path d="${HEATER}" fill="${main}" stroke="${edge}" stroke-width="1.4"/>
                <path d="${HEATER}" fill="none" stroke="${metal}" stroke-width="1.8" transform="scale(0.88) translate(0 -1)"/>
                <g transform="translate(0 -1) scale(0.55)">${emblemOf(livery)}</g>`;
        default:
            return "";
    }
}

// The rest of the gear's icons
const GEAR_ICONS = {
    // A quiver of red-fletched arrows
    quiver: `
        <g transform="rotate(20)">
            <path d="M-4,-12 L-6,-22 M0,-12 L0,-23 M4,-12 L6,-22" stroke="#6b4a22" stroke-width="1.4"/>
            <path d="M-8.5,-24 L-6,-19 L-3.5,-24 Z M-2.5,-25 L0,-20 L2.5,-25 Z M3.5,-24 L6,-19 L8.5,-24 Z" fill="#c83a2a"/>
            <rect x="-7" y="-13" width="14" height="33" rx="3" fill="url(#icon-leather)" stroke="#2b1a0d" stroke-width="1.2"/>
            <path d="M-7,-5 h14 M-7,11 h14" stroke="#efdfb4" stroke-width="1"/>
        </g>`,
    // A leather cap, stitched down the middle
    cap: `
        <path d="M-17,6 C-17,-13 17,-13 17,6 Z" fill="url(#icon-leather)" stroke="#2b1a0d" stroke-width="1.3"/>
        <path d="M-19,5 L19,5 L19,10 L-19,10 Z" fill="#8a5a30" stroke="#2b1a0d" stroke-width="1.1"/>
        <path d="M0,-8 L0,5" stroke="#efdfb4" stroke-width="1" stroke-dasharray="2 1.4"/>`,
    // A steel helm, banded in brass, its nasal down the front
    nasalHelm: `
        <path d="M-16,4 C-16,-16 16,-16 16,4 Z" fill="url(#icon-steel)" stroke="#2f363d" stroke-width="1.3"/>
        <rect x="-17" y="2" width="34" height="5" rx="1" fill="#c49a46" stroke="#5a4010" stroke-width="1"/>
        <path d="M-2,7 L2,7 L1.5,19 L-1.5,19 Z" fill="url(#icon-steel)" stroke="#2f363d" stroke-width="1"/>
        <path d="M-8,-9 C-4,-12 2,-12 6,-10" fill="none" stroke="#ffffff" stroke-width="1" opacity="0.6"/>`,
    // A wizard's pointed hat, a star on it
    wizardHat: `
        <path d="M-4,-21 C2,-14 8,-2 12,8 L-12,8 C-9,-2 -6,-12 -4,-21 Z" fill="#2e3f78" stroke="#141c3a" stroke-width="1.3"/>
        <ellipse cy="9" rx="21" ry="5" fill="#2e3f78" stroke="#141c3a" stroke-width="1.3"/>
        <path d="M-11,4 L11,4 L12,8 L-12,8 Z" fill="#c49a46"/>
        <path d="${star(1, -5, 4, 1.6)}" fill="#e6c35c"/>`,
    // A leather jerkin, laced up the front
    jerkin: `
        <path d="${TUNIC}" fill="url(#icon-leather)" stroke="#2b1a0d" stroke-width="1.3"/>
        <path d="M0,-14 L0,20 M-3,-8 L3,-6 M-3,-2 L3,0 M-3,4 L3,6" stroke="#efdfb4" stroke-width="1"/>`,
    // Plate armour: a steel breastplate over mail, its skirt of lames
    plate: `
        <path d="${TUNIC}" fill="url(#icon-mail)" stroke="#2f363d" stroke-width="1.3"/>
        <path d="${TUNIC}" fill="url(#icon-rings)" opacity="0.8"/>
        <path d="M-13,-13 C-6,-16 6,-16 13,-13 L13,9 C6,13 -6,13 -13,9 Z" fill="url(#icon-steel)" stroke="#2f363d" stroke-width="1.2"/>
        <path d="M0,-14 L0,11" stroke="#ffffff" stroke-width="0.9" opacity="0.6"/>
        <path d="M-13,14 L13,14 M-13,18 L13,18" stroke="#8d949b" stroke-width="2.4"/>`,
    bracers: bracersIcon("url(#icon-leather)", "#2b1a0d", "#efdfb4"),
    gloves: `<path d="${GLOVE}" fill="url(#icon-leather)" stroke="#2b1a0d" stroke-width="1.2"/><path d="M-10,14 L8,14" stroke="#efdfb4" stroke-width="1"/>`,
    platedGloves: `<path d="${GLOVE}" fill="url(#icon-steel)" stroke="#2f363d" stroke-width="1.2"/><path d="M-10,14 L8,14 M-9,-3 L10,-3" stroke="#5f6973" stroke-width="1"/>`,
    // A leather belt, its brass buckle
    belt: `
        <path d="M-21,-4 C-7,-8 7,-8 21,-4 L21,4 C7,0 -7,0 -21,4 Z" fill="url(#icon-leather)" stroke="#2b1a0d" stroke-width="1.2"/>
        <rect x="-6" y="-8" width="12" height="11" rx="1.5" fill="none" stroke="#c49a46" stroke-width="2.4"/>
        <path d="M0,-6 L0,1" stroke="#c49a46" stroke-width="1.6"/>`,
    trousers: `<path d="${LEGS}" fill="#4a3f35" stroke="#1f1a14" stroke-width="1.3"/><path d="M-12,-14 L12,-14" stroke="#1f1a14" stroke-width="1.2"/>`,
    breeches: `<path d="${LEGS}" fill="url(#icon-leather)" stroke="#2b1a0d" stroke-width="1.3"/><path d="M-12,-14 L12,-14" stroke="#2b1a0d" stroke-width="1.2"/>`,
    greaves: `<path d="${LEGS}" fill="url(#icon-leather)" stroke="#2b1a0d" stroke-width="1.3"/><path d="M-13,3 L-5,3 L-4.5,19 L-13.5,19 Z M5,3 L13,3 L13.5,19 L4.5,19 Z" fill="url(#icon-steel)" stroke="#2f363d" stroke-width="1"/>`,
    leatherBoots: `<path d="${BOOT}" fill="url(#icon-leather)" stroke="#2b1a0d" stroke-width="1.3"/><path d="M-10,-21 L5,-21 L5,-16 L-10,-16 Z" fill="#b07a42" stroke="#2b1a0d" stroke-width="1"/><path d="M-11,14 L19,14 L19,17.5 L-11,17.5 Z" fill="#2b1a0d"/>`,
    sabatons: `<path d="${BOOT}" fill="url(#icon-steel)" stroke="#2f363d" stroke-width="1.3"/><path d="M-9,-12 L4,-12 M-9,-5 L4,-5 M4,3 C9,4 13,7 15,11" fill="none" stroke="#5f6973" stroke-width="1"/><path d="M-11,14 L19,14 L19,17.5 L-11,17.5 Z" fill="#2f363d"/>`,
    travelCloak: `
        <path d="${CAPE}" fill="#6a5a44" stroke="#2a2018" stroke-width="1.3"/>
        <path d="M-6,-10 C-8,2 -10,12 -12,20 M6,-10 C8,2 10,12 12,20" stroke="#4a3e2e" stroke-width="1"/>
        <path d="M-8,-20 C-4,-16 4,-16 8,-20" fill="none" stroke="#2a2018" stroke-width="1.2"/>
        <circle cy="-17" r="2.5" fill="#c49a46"/>`,
    // A gold amulet, a blue stone in it, on its chain
    amulet: `
        <path d="M-12,-20 C-14,-6 -6,1 0,3 C6,1 14,-6 12,-20" fill="none" stroke="#e0b44a" stroke-width="1.6"/>
        <circle cy="10" r="8.5" fill="#e0b44a" stroke="#7a5a10" stroke-width="1.2"/>
        <circle cy="10" r="4.8" fill="#3fb8e0" stroke="#1a5a7a" stroke-width="1"/>
        <circle cx="-1.5" cy="8.5" r="1.3" fill="#ffffff" opacity="0.8"/>`,
    // A gold ring, a red stone set in it
    ring: `
        <ellipse cy="5" rx="13" ry="13" fill="none" stroke="#7a5a10" stroke-width="5.6"/>
        <ellipse cy="5" rx="13" ry="13" fill="none" stroke="#e0b44a" stroke-width="3.6"/>
        <path d="M-7,-9 L7,-9 L4,-17 L-4,-17 Z" fill="#c83a5a" stroke="#5a1020" stroke-width="1"/>
        <path d="M-2,-15 L1,-11" stroke="#ffffff" stroke-width="1" opacity="0.7"/>`,
};

export const ITEM_ICONS = Object.freeze({
    // (Gear: each piece of a people's uniform in the humans' colours, unless it says whose)
    ...GEAR_ICONS,
    ...Object.fromEntries(Object.keys(GEAR).filter((id) => GEAR[id].uniform).map((id) => [id, uniformIcon(id)])),
    // (The creatures' parts, each in its colour; gold; the spells' tomes)
    ...Object.fromEntries(Object.entries(PARTS).map(([id, part]) => [id, partIcon(part)])),
    ...Object.fromEntries([...TOMES, ...ELEMENT_TOMES].map((spell) => [tomeOf(spell), tomeIcon(spell)])),
    gold: COINS,

    sword: `<g transform="rotate(45)">${SWORD}</g>`,

    // A gnarled staff, a crystal glowing in its crook
    staff: `
        <path d="M-15,19 L9,-11" stroke="#5e3a1c" stroke-width="3.6" stroke-linecap="round"/>
        <path d="M-14,17 L8,-10" stroke="#a26e3c" stroke-width="1.1" stroke-linecap="round"/>
        <path d="M9,-11 C12,-13 12,-17 16,-18 M9,-11 C8,-15 4,-16 5,-20" fill="none" stroke="#5e3a1c" stroke-width="2.4" stroke-linecap="round"/>
        <circle cx="11" cy="-15" r="9" fill="url(#icon-crystal-glow)"/>
        <path d="M11,-22 L15,-15 L11,-9 L7,-15 Z" fill="#9be6ff" stroke="#1f5f8a" stroke-width="1"/>
        <path d="M11,-20 L13,-15 L11,-12" fill="none" stroke="#eafaff" stroke-width="0.9"/>`,

    // A dark wand with a gold grip, a star at its tip
    wand: `
        <path d="M-15,16 L8,-7" stroke="#2a1a10" stroke-width="3" stroke-linecap="round"/>
        <path d="M-15,16 L-9,10" stroke="#c8962e" stroke-width="3.6" stroke-linecap="round"/>
        <circle cx="10" cy="-9" r="9" fill="url(#icon-crystal-glow)"/>
        <path d="${star(10, -9, 7, 2.8)}" fill="url(#icon-stun-star)" stroke="#a86b00" stroke-width="0.8"/>
        <path d="${star(18, 1, 2.8, 0.8, 4, 0)}" fill="#fff6b0"/>
        <path d="${star(1, -17, 2.4, 0.7, 4, 0)}" fill="#fff6b0"/>`,

    // A book bound in violet, a gold star on its cover and a clasp
    grimoire: `
        <path d="M-12,-15 L14,-15 L14,18 L-12,18 Z" fill="#efe3c2" stroke="#6b5a3a" stroke-width="1"/>
        <path d="M-12,-11 L14,-11 M-12,-7 L14,-7" stroke="#c9b98f" stroke-width="0.6"/>
        <rect x="-16" y="-19" width="27" height="35" rx="2" fill="url(#icon-grimoire)" stroke="#220a20" stroke-width="1.3"/>
        <rect x="-16" y="-19" width="5" height="35" rx="1.5" fill="#3a1238"/>
        <circle cx="0" cy="-1.5" r="7.5" fill="none" stroke="#e6c35c" stroke-width="1.3"/>
        <path d="${star(0, -1.5, 6.4, 2.6)}" fill="#e6c35c"/>
        <rect x="9" y="-4" width="6" height="5" rx="1" fill="#e6c35c" stroke="#7a5a10" stroke-width="0.8"/>`,

    // A war hammer: a long haft, a steel head with a spike behind
    hammer: `
        <path d="M-14,19 L7,-6" stroke="#5e3a1c" stroke-width="3.4" stroke-linecap="round"/>
        <path d="M-14,19 L-9,13" stroke="#2b1a0d" stroke-width="4.2" stroke-linecap="round"/>
        <g transform="translate(9 -8.5) rotate(40)">
            <rect x="-12" y="-5.5" width="18" height="11" rx="1.5" fill="url(#icon-steel)" stroke="#2f363d" stroke-width="1.2"/>
            <path d="M6,-4 L15,0 L6,4 Z" fill="#aeb8c2" stroke="#2f363d" stroke-width="1"/>
            <path d="M-12,-2 h18" stroke="#ffffff" stroke-width="0.8" opacity="0.6"/>
        </g>`,

    // A bow, strung, an arrow nocked
    bow: `
        <path d="M-8,-21 C12,-14 12,14 -8,21" fill="none" stroke="#6b4423" stroke-width="3.6" stroke-linecap="round"/>
        <path d="M-7,-20 C11,-13 11,13 -7,20" fill="none" stroke="#b07a42" stroke-width="1.1" stroke-linecap="round"/>
        <path d="M-8,-21 L-13,0 L-8,21" fill="none" stroke="#e8e1d2" stroke-width="0.9"/>
        <rect x="4.5" y="-4" width="4" height="8" rx="1" fill="#2b1a0d"/>
        <path d="M-13,0 L17,0" stroke="#6b4a22" stroke-width="1.6"/>
        <path d="M16,-3 L22,0 L16,3 Z" fill="#c9d1d8" stroke="#4a525a" stroke-width="0.7"/>
        <path d="M-13,0 L-17,-3.5 M-13,0 L-17,3.5 M-10,0 L-14,-3.5 M-10,0 L-14,3.5" stroke="#c83a2a" stroke-width="1.4" stroke-linecap="round"/>`,

    // A steel gauntlet made into a fist, spikes on its knuckles
    gauntlets: `
        <path d="M-11,7 L5,7 L6,21 L-12,21 Z" fill="url(#icon-steel)" stroke="#2f363d" stroke-width="1.2"/>
        <path d="M-11,12 L6,12 M-11,16 L6,16" stroke="#5f6973" stroke-width="0.9"/>
        <path d="M-15,-9 C-15,-14 -11,-17 -6,-17 L5,-17 C10,-17 13,-14 13,-9 L13,1 C13,5 10,8 6,8 L-8,8 C-12,8 -15,5 -15,1 Z" fill="url(#icon-steel)" stroke="#2f363d" stroke-width="1.2"/>
        <path d="M-8,-17 L-8,-9 M-2,-17 L-2,-9 M4,-17 L4,-9" stroke="#5f6973" stroke-width="1"/>
        <path d="M-12,-17 L-10,-24 L-8,-17 Z M-6,-17 L-4,-24 L-2,-17 Z M0,-17 L2,-24 L4,-17 Z M6,-17 L8,-24 L10,-16 Z" fill="#e9eef2" stroke="#2f363d" stroke-width="0.9"/>
        <path d="M13,-5 C19,-5 20,1 16,4 L12,6" fill="url(#icon-steel)" stroke="#2f363d" stroke-width="1.2"/>`,

    // A laced leather boot, spiked at the toe, the heel and under the sole
    boots: `
        <path d="M-9,-20 L4,-20 L4,-1 C11,0 17,4 18,10 L18,14 L-10,14 Z" fill="url(#icon-leather)" stroke="#2b1a0d" stroke-width="1.3"/>
        <path d="M-10,-21 L5,-21 L5,-16 L-10,-16 Z" fill="#b07a42" stroke="#2b1a0d" stroke-width="1"/>
        <path d="M-2,-12 L3,-10 M-2,-7 L3,-5 M-2,-2 L3,0" stroke="#efdfb4" stroke-width="1.1" stroke-linecap="round"/>
        <path d="M-11,14 L19,14 L19,17.5 L-11,17.5 Z" fill="#2b1a0d"/>
        <path d="M18,9 L24,11 L18,13.5 Z M-10,4 L-16,6.5 L-10,9 Z" fill="#e9eef2" stroke="#2f363d" stroke-width="0.9"/>
        <path d="M-6,17.5 L-4.5,22 L-3,17.5 Z M2,17.5 L3.5,22 L5,17.5 Z M10,17.5 L11.5,22 L13,17.5 Z" fill="#e9eef2" stroke="#2f363d" stroke-width="0.8"/>`,

    // A padded, quilted jacket
    gambeson: `
        <path d="${TUNIC}" fill="url(#icon-cloth)" stroke="#5a4526" stroke-width="1.3"/>
        <path d="M-13,2 L13,2 M-13,9 L13,9 M-13,15 L13,15 M-5,-14 L-5,20 M5,-14 L5,20 M-20,-5 L-15,-8 M20,-5 L15,-8" fill="none" stroke="#9c7c50" stroke-width="0.9" stroke-dasharray="2 1.4"/>
        <path d="M-5,-14 C-3,-11 3,-11 5,-14" fill="none" stroke="#5a4526" stroke-width="1"/>`,

    // A shirt of mail: rings over steel
    mail: `
        <path d="${TUNIC}" fill="url(#icon-mail)" stroke="#2f363d" stroke-width="1.3"/>
        <path d="${TUNIC}" fill="url(#icon-rings)" opacity="0.9"/>
        <path d="M-13,18 L13,18" stroke="#2f363d" stroke-width="1.6"/>
        <path d="M-8,-18 C-5,-13 5,-13 8,-18" fill="none" stroke="#e9eef2" stroke-width="1" opacity="0.7"/>`,

    // A round shield of planks, rimmed and bossed in iron
    roundShield: `
        <circle r="20" fill="url(#icon-wood)" stroke="#2b1a0d" stroke-width="1.4"/>
        <path d="M-7,-18.5 L-7,18.5 M0,-19.5 L0,19.5 M7,-18.5 L7,18.5" stroke="#5e3a1c" stroke-width="0.9"/>
        <circle r="18.5" fill="none" stroke="#8d949b" stroke-width="2.6"/>
        <circle r="6" fill="url(#icon-steel)" stroke="#2f363d" stroke-width="1.2"/>
        <circle cx="-2" cy="-2" r="1.6" fill="#ffffff" opacity="0.7"/>
        <g fill="#cfd5da"><circle cx="0" cy="-14" r="1.1"/><circle cx="14" cy="0" r="1.1"/><circle cx="0" cy="14" r="1.1"/><circle cx="-14" cy="0" r="1.1"/></g>`,

    // A tower shield: tall boards bent round, banded and bossed in iron
    towerShield: `
        <rect x="-14" y="-21" width="28" height="42" rx="4" fill="url(#icon-wood)" stroke="#2b1a0d" stroke-width="1.4"/>
        <path d="M-7,-20 L-7,20 M0,-21 L0,21 M7,-20 L7,20" stroke="#5e3a1c" stroke-width="0.9"/>
        <rect x="-14" y="-21" width="28" height="42" rx="4" fill="none" stroke="#8d949b" stroke-width="2.2"/>
        <path d="M-14,-12 L14,-12 M-14,12 L14,12" stroke="#6d6a66" stroke-width="3"/>
        <circle r="5.5" fill="url(#icon-steel)" stroke="#2f363d" stroke-width="1.2"/>
        <circle cx="-1.8" cy="-1.8" r="1.4" fill="#ffffff" opacity="0.7"/>`,

    // A spellward: a mage's dark buckler, brass-rimmed, a ring of runes round a glowing crystal
    spellward: `
        <circle r="17" fill="#4b3020" stroke="#2b1a0d" stroke-width="1.3"/>
        <circle r="15.5" fill="none" stroke="#c49a46" stroke-width="2.4"/>
        <circle r="10.5" fill="none" stroke="#b9c2c9" stroke-width="0.9"/>
        <g stroke="#dfe6ec" stroke-width="1.2" stroke-linecap="round">
            <path d="M0,-12.5 L0,-8.5 M8.8,-8.8 L6,-6 M12.5,0 L8.5,0 M8.8,8.8 L6,6 M0,12.5 L0,8.5 M-8.8,8.8 L-6,6 M-12.5,0 L-8.5,0 M-8.8,-8.8 L-6,-6"/>
        </g>
        <circle r="7" fill="url(#icon-crystal-glow)" opacity="0.9"/>
        <path d="M0,-6 L3.6,0 L0,6 L-3.6,0 Z" fill="#7fd8ff" stroke="#2a6fbf" stroke-width="0.8"/>`,

    // A kite shield, blue with a gold chevron
    kiteShield: `
        <path d="M-15,-19 L15,-19 C15,-1 9,12 0,21 C-9,12 -15,-1 -15,-19 Z" fill="url(#icon-kite)" stroke="#0f2248" stroke-width="1.4"/>
        <path d="M-14,-7 L0,4 L14,-7 L14,-1 L0,10 L-14,-1 Z" fill="#e6c35c" stroke="#7a5a10" stroke-width="0.8"/>
        <path d="M-15,-19 L15,-19 C15,-1 9,12 0,21 C-9,12 -15,-1 -15,-19 Z" fill="none" stroke="#c9d1d8" stroke-width="1.6" transform="scale(0.9) translate(0 -1)"/>`,

    // A flask of red draught, stoppered
    potion: `
        <circle cy="6" r="13.5" fill="url(#icon-glass)" stroke="#3a2f45" stroke-width="1.3"/>
        <path d="M-12.6,3 A13,13 0 1 0 12.6,3 Z" transform="translate(0 0.5) scale(0.97)" fill="url(#icon-potion)"/>
        <path d="M-4,-14 L4,-14 L4,-6 L-4,-6 Z" fill="url(#icon-glass)" stroke="#3a2f45" stroke-width="1.2"/>
        <rect x="-5.5" y="-20" width="11" height="7" rx="1.8" fill="#a8743f" stroke="#4a2c14" stroke-width="1"/>
        <ellipse cx="-5.5" cy="1" rx="2.6" ry="4.4" fill="#ffffff" opacity="0.55" transform="rotate(25 -5.5 1)"/>`,

    // The cures (core/afflictions.js CURES): draughts of their colours, a salve, a bandage
    staminaBoost: STAMINA_BOOST,
    scrollOfSafety: SCROLL_OF_SAFETY,
    antidote: draught("poison"),
    cureDisease: draught("disease"),
    invigorate: draught("wither"),
    quickening: draught("slow"),
    burnSalve: `
        <path d="M-15,-2 L15,-2 L13,15 C13,17 11,18 9,18 L-9,18 C-11,18 -13,17 -13,15 Z" fill="#b8703a" stroke="#4a2410" stroke-width="1.3"/>
        <ellipse cy="-2" rx="15" ry="4" fill="#f4ecd0" stroke="#4a2410" stroke-width="1.2"/>
        <path d="M-6,-4 C-2,-14 6,-16 12,-20 C10,-12 4,-8 -2,-4" fill="#6ab04a" stroke="#2a5a1a" stroke-width="1.1"/>
        <path d="M-12,6 L12,6" stroke="#8a4a20" stroke-width="1.4"/>`,
    bandage: `
        <ellipse cx="-4" cy="2" rx="12" ry="14" fill="#f2ead8" stroke="#6a5a40" stroke-width="1.3"/>
        <ellipse cx="-4" cy="2" rx="5" ry="6" fill="#d8ccb0" stroke="#6a5a40" stroke-width="1.1"/>
        <path d="M6,-9 L19,-5 L17,6 L7,10" fill="#f2ead8" stroke="#6a5a40" stroke-width="1.2"/>
        <path d="M-14,-4 C-12,-8 -8,-11 -4,-12 M-15,6 C-13,10 -9,13 -4,16" fill="none" stroke="#b8a888" stroke-width="1"/>
        <path d="M13,-2 L15,4" stroke="#c83a2a" stroke-width="1.6" stroke-linecap="round"/>`,

    // A bowl of stew, steaming, a spoon in it
    meal: `
        <path d="M-7,-6 C-10,-10 -4,-12 -7,-17 M1,-6 C-2,-10 4,-12 1,-17 M9,-6 C6,-10 12,-12 9,-17" fill="none" stroke="#eef2f5" stroke-width="1.8" stroke-linecap="round" opacity="0.85"/>
        <path d="M11,-1 L19,-14" stroke="#c9ced3" stroke-width="2.2" stroke-linecap="round"/>
        <path d="M-19,0 L19,0 C19,10 10,17 0,17 C-10,17 -19,10 -19,0 Z" fill="url(#icon-wood)" stroke="#3f2410" stroke-width="1.3"/>
        <ellipse rx="19" ry="4.5" fill="#a9592a" stroke="#3f2410" stroke-width="1.2"/>
        <circle cx="-7" cy="-0.5" r="2.3" fill="#e8b04a"/>
        <circle cx="3" cy="0.8" r="1.9" fill="#6aa04a"/>
        <circle cx="-1" cy="-1.5" r="1.6" fill="#d9774a"/>`,

    // A wooden tankard, iron-banded, frothing over
    ale: `
        <path d="M7,-3 L12,-3 C15,-3 17,-1 17,2 L17,10 C17,13 15,15 12,15 L7,15" fill="none" stroke="#3f2410" stroke-width="3.6"/>
        <path d="M7,-3 L12,-3 C15,-3 17,-1 17,2 L17,10 C17,13 15,15 12,15 L7,15" fill="none" stroke="#a26e3c" stroke-width="1.4"/>
        <rect x="-14" y="-9" width="22" height="28" rx="2.5" fill="url(#icon-wood)" stroke="#3f2410" stroke-width="1.3"/>
        <path d="M-7,-9 L-7,19 M0,-9 L0,19" stroke="#6b4423" stroke-width="0.9"/>
        <path d="M-14,-2 L8,-2 M-14,13 L8,13" stroke="#8d949b" stroke-width="2.2"/>
        <path d="M-16,-8 C-18,-14 -12,-18 -8,-15 C-6,-21 3,-21 5,-15 C9,-17 13,-13 10,-8 Z" fill="#fff8e6" stroke="#b8a680" stroke-width="1"/>
        <path d="M-13,-8 C-14,-4 -12,-2 -11,-1" fill="none" stroke="#fff8e6" stroke-width="2" stroke-linecap="round"/>`,
});

/** A thing's icon (a uniform's piece in its people's colours). */
export const iconOf = ({ id, people = null }) => (people && GEAR[id]?.uniform ? uniformIcon(id, people) : (ITEM_ICONS[id] ?? ""));

/**
 * A thing's icon as an SVG document of its own (its gradients in it), on a dark round ground: to
 * paint into a picture (the icon floating over something dropped in the world: app/game.js).
 */
export const itemPicture = (id, size = 128) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-24 -24 48 48" width="${size}" height="${size}"><defs>${DEFS}</defs><circle r="23" fill="#1a1510" fill-opacity="0.72" stroke="#ecc882" stroke-width="1.2"/><g transform="scale(0.86)">${ITEM_ICONS[id] ?? ""}</g></svg>`;
