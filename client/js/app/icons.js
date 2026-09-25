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

/** Each action's icon: SVG drawn round 0, 0, about 44 across. */
export const ICONS = Object.freeze({
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
