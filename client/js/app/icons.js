// Icons for the action wheel's actions, drawn as SVG on a 48 by 48 grid centred on 0, 0, in
// colours that say what each does: healing green, stunning yellow stars round a violet daze.
// `DEFS` holds the gradients and glows they share (the wheel puts them in its <defs> once).

/** Gradients and glows the icons use. */
export const DEFS = `
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
});
