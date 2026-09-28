// Icons for the action wheel's actions, and for everything that can be carried, drawn as SVG on a
// 48 by 48 grid centred on 0, 0, in colours that say what each does: healing green, stunning
// yellow stars round a violet daze; steel, wood, leather and cloth for gear; a red draught.
// `DEFS` holds the gradients, glows and patterns they share: put in the page once (`useDefs`),
// where every icon drawn anywhere in it finds them.

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
<filter id="icon-glow" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur stdDeviation="1.6" result="blur"/>
    <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
</filter>`;

/** Gradients, glows and patterns the icons use. */
export const DEFS = ACTION_DEFS + ITEM_DEFS;

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

/** Each action's icon: SVG drawn round 0, 0, about 44 across. */
export const ICONS = Object.freeze({
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

    // An arrow in the middle of a target: an aimed shot
    aimedShot: `
        <circle r="18" fill="#f2e6cf" stroke="#6b1f1f" stroke-width="1.4"/>
        <circle r="12" fill="#c83a2a"/>
        <circle r="6.5" fill="#f2e6cf"/>
        <circle r="2.6" fill="#c83a2a"/>
        <path d="M0,0 L17,-17" stroke="#6b4a22" stroke-width="2.2" stroke-linecap="round"/>
        <path d="M13,-21 L21,-21 L17,-17 Z M17,-13 L21,-21 L17,-17 Z" fill="#e8e1d2" stroke="#8a7d68" stroke-width="0.8"/>`,

    // Two swords crossed, over a red glow: picking a fight
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

    // Two arrows chasing each other round: the wheel turned to its other side
    flip: `
        <circle r="19" fill="#f2e6cf" opacity="0.12"/>
        <path d="M-13,-3 A13.5,13.5 0 0 1 9,-10" fill="none" stroke="#f2e6cf" stroke-width="3" stroke-linecap="round"/>
        <path d="M5,-16 L14,-7 L3,-5 Z" fill="#f2e6cf"/>
        <path d="M13,3 A13.5,13.5 0 0 1 -9,10" fill="none" stroke="#f2e6cf" stroke-width="3" stroke-linecap="round"/>
        <path d="M-5,16 L-14,7 L-3,5 Z" fill="#f2e6cf"/>`,
});

// A tunic's outline (a gambeson's, a mail shirt's): shoulders, sleeves and a round neck
const TUNIC = "M-8,-18 L-18,-13 L-22,1 L-16,3 L-13,-4 L-13,20 L13,20 L13,-4 L16,3 L22,1 L18,-13 L8,-18 C5,-13 -5,-13 -8,-18 Z";

/** Each thing that can be carried's icon (core/progress.js ITEMS): SVG drawn round 0, 0, about 44 across. */
export const ITEM_ICONS = Object.freeze({
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
