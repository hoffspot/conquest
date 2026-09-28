// Icons for the spells of the schools of magic (core/spells.js SCHOOLS): drawn as the action
// icons are (icons.js), on a 48 by 48 grid round 0, 0. Each school has its look: Healing green
// and gold, Fire red and orange, Earth stone and soil, Air pale blue and lightning, Water blue.
// Each tier's grander than the last, and the seventh of an element is set in a dark ring.

// A number, briefly
const n = (value) => +value.toFixed(2);

// A star with `points` points, `outer` and `inner` radii, at x, y
function star(x, y, outer, inner, points = 5, turn = -Math.PI / 2) {
    const corners = [];

    for (let k = 0; k < points * 2; k++) {
        const radius = k % 2 ? inner : outer;
        const angle = turn + (k * Math.PI) / points;

        corners.push(`${n(x + Math.cos(angle) * radius)},${n(y + Math.sin(angle) * radius)}`);
    }

    return `M${corners.join("L")}Z`;
}

// A tongue of flame standing on x, base: `w` wide, `h` high, its tip leaning so far
function flame(x, base, w, h, lean = 0) {
    return `M${n(x)},${n(base)} C${n(x - w * 0.9)},${n(base)} ${n(x - w * 0.75)},${n(base - h * 0.55)} ${n(x + lean)},${n(base - h)} C${n(x + w * 0.75)},${n(base - h * 0.55)} ${n(x + w * 0.9)},${n(base)} ${n(x)},${n(base)} Z`;
}

// A flame drawn: red and orange outside, a yellow heart
function fire(x, base, w, h, lean = 0) {
    return `<g>
        <path d="${flame(x, base, w, h, lean)}" fill="url(#spell-flame)" stroke="#7a1a00" stroke-width="0.9"/>
        <path d="${flame(x, base - h * 0.02, w * 0.62, h * 0.66, lean * 0.6)}" fill="#ffb030"/>
        <path d="${flame(x, base - h * 0.04, w * 0.3, h * 0.36, lean * 0.3)}" fill="#fff2a0"/></g>`;
}

// A drop of water, its round part r across about x, y, its tip up
function drop(x, y, r) {
    return `M${n(x)},${n(y - 1.95 * r)} C${n(x + 0.46 * r)},${n(y - 1.15 * r)} ${n(x + r)},${n(y - 0.62 * r)} ${n(x + r)},${n(y)} A${n(r)},${n(r)} 0 0 1 ${n(x - r)},${n(y)} C${n(x - r)},${n(y - 0.62 * r)} ${n(x - 0.46 * r)},${n(y - 1.15 * r)} ${n(x)},${n(y - 1.95 * r)} Z`;
}

// A crackle of lightning through the points: a pale glow round a white-hot core
function crackle(points, width = 2) {
    const d = `M${points.map(([x, y]) => `${x},${y}`).join("L")}`;

    return `<path d="${d}" fill="none" stroke="#6ac8ff" stroke-width="${n(width * 3)}" stroke-linejoin="round" stroke-linecap="round" opacity="0.45"/>
        <path d="${d}" fill="none" stroke="#ffffff" stroke-width="${n(width)}" stroke-linejoin="round" stroke-linecap="round"/>`;
}

// A healer's cross, `size` its scale
const cross = (size = 1, x = 0, y = 0) => `<path d="M-5,-15 h10 a2,2 0 0 1 2,2 v8 h8 a2,2 0 0 1 2,2 v10 a2,2 0 0 1 -2,2 h-8 v8 a2,2 0 0 1 -2,2 h-10 a2,2 0 0 1 -2,-2 v-8 h-8 a2,2 0 0 1 -2,-2 v-10 a2,2 0 0 1 2,-2 h8 v-8 a2,2 0 0 1 2,-2 z"
            fill="url(#icon-heal-cross)" stroke="#0b5a26" stroke-width="${n(1.4 / size)}" transform="translate(${x} ${y}) scale(${size})"/>`;

// A figure standing, dark against what's done to it
const FIGURE = `<circle cy="-9" r="4.6" fill="#1c1410"/><path d="M-6,13 L-5,-1 C-5,-4 -3,-5 0,-5 C3,-5 5,-4 5,-1 L6,13 Z" fill="#1c1410"/>`;

// A dark ring round a seventh tier's icon: the height of a school
const PINNACLE = (colour) => `<circle r="22.5" fill="none" stroke="${colour}" stroke-width="1.6"/><circle r="20.5" fill="none" stroke="${colour}" stroke-width="0.6" stroke-dasharray="1.5 2" opacity="0.8"/>`;

// A ward's shield, something shown on it: what it wards against
const shield = (rim, emblem) => `
        <circle r="21" fill="url(#spell-ward-glow)"/>
        <path d="M0,-19 L16,-13.5 L16,0 C16,9.5 8.5,15.5 0,20 C-8.5,15.5 -16,9.5 -16,0 L-16,-13.5 Z" fill="url(#spell-ward)" stroke="${rim}" stroke-width="2.2"/>
        <path d="M0,-15.5 L12.5,-11 L12.5,-0.5 C12.5,7 6.5,12 0,15.8 C-6.5,12 -12.5,7 -12.5,-0.5 L-12.5,-11 Z" fill="#1c2436" opacity="0.55"/>
        ${emblem}`;

// A cure's light: a ring of green and gold round what it ends, swept through with sparkles
const cleansing = (inside) => `
        <circle r="21" fill="url(#icon-heal-glow)"/>
        <circle r="18" fill="none" stroke="#f2e08a" stroke-width="1.4" stroke-dasharray="4 2.5"/>
        ${inside}
        <path d="M-17,14 C-6,6 6,-6 17,-14" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" opacity="0.85"/>
        <path d="${star(-9, 8, 3.6, 1, 4, 0)}" fill="#fffbe0"/><path d="${star(9, -8, 3.2, 0.9, 4, 0)}" fill="#fffbe0"/><path d="${star(15, -15, 2.6, 0.8, 4, 0)}" fill="#e9fff0"/>`;

/** The spell icons' gradients and glows (put in the page with the rest: icons.js DEFS). */
export const SPELL_DEFS = `
<linearGradient id="spell-flame" x1="0" y1="1" x2="0" y2="0">
    <stop offset="0" stop-color="#ff8a1a"/>
    <stop offset="1" stop-color="#d42a06"/>
</linearGradient>
<radialGradient id="spell-fire-glow">
    <stop offset="0" stop-color="#ffc040" stop-opacity="0.85"/>
    <stop offset="0.55" stop-color="#ff4a00" stop-opacity="0.3"/>
    <stop offset="1" stop-color="#ff2a00" stop-opacity="0"/>
</radialGradient>
<radialGradient id="spell-fireball" cx="0.4" cy="0.4" r="0.65">
    <stop offset="0" stop-color="#fffbd0"/>
    <stop offset="0.35" stop-color="#ffc030"/>
    <stop offset="0.8" stop-color="#f04a08"/>
    <stop offset="1" stop-color="#8a1a02"/>
</radialGradient>
<radialGradient id="spell-hell" cx="0.5" cy="0.75" r="0.8">
    <stop offset="0" stop-color="#ff4a10"/>
    <stop offset="0.45" stop-color="#8a0a0a"/>
    <stop offset="1" stop-color="#1a0204"/>
</radialGradient>
<linearGradient id="spell-stone" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#c8baa4"/>
    <stop offset="0.55" stop-color="#8a7a66"/>
    <stop offset="1" stop-color="#4a3e32"/>
</linearGradient>
<linearGradient id="spell-soil" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#9a7a4a"/>
    <stop offset="1" stop-color="#4a3218"/>
</linearGradient>
<radialGradient id="spell-earth-glow">
    <stop offset="0" stop-color="#e8c880" stop-opacity="0.7"/>
    <stop offset="1" stop-color="#8a6a30" stop-opacity="0"/>
</radialGradient>
<radialGradient id="spell-acid" cx="0.5" cy="0.4" r="0.6">
    <stop offset="0" stop-color="#eaff80"/>
    <stop offset="0.5" stop-color="#7ac818"/>
    <stop offset="1" stop-color="#2a5a06"/>
</radialGradient>
<radialGradient id="spell-void" cx="0.5" cy="0.5" r="0.55">
    <stop offset="0" stop-color="#5a2a6a"/>
    <stop offset="1" stop-color="#140818"/>
</radialGradient>
<radialGradient id="spell-air-glow">
    <stop offset="0" stop-color="#f0fbff" stop-opacity="0.8"/>
    <stop offset="0.55" stop-color="#7ac8ff" stop-opacity="0.28"/>
    <stop offset="1" stop-color="#3a8ae0" stop-opacity="0"/>
</radialGradient>
<linearGradient id="spell-cloud" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#8a96aa"/>
    <stop offset="1" stop-color="#2e3648"/>
</linearGradient>
<linearGradient id="spell-bolt" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ffffff"/>
    <stop offset="1" stop-color="#ffe040"/>
</linearGradient>
<radialGradient id="spell-storm" cx="0.5" cy="0.5" r="0.55">
    <stop offset="0" stop-color="#3a4a9a"/>
    <stop offset="1" stop-color="#0a0e2a"/>
</radialGradient>
<radialGradient id="spell-water" cx="0.36" cy="0.4" r="0.7">
    <stop offset="0" stop-color="#e8f8ff"/>
    <stop offset="0.45" stop-color="#4aa8f0"/>
    <stop offset="1" stop-color="#0c3a7a"/>
</radialGradient>
<radialGradient id="spell-scald" cx="0.36" cy="0.4" r="0.7">
    <stop offset="0" stop-color="#fff0e8"/>
    <stop offset="0.45" stop-color="#f08a6a"/>
    <stop offset="1" stop-color="#8a2a1a"/>
</radialGradient>
<radialGradient id="spell-blood" cx="0.36" cy="0.4" r="0.7">
    <stop offset="0" stop-color="#ff9a8a"/>
    <stop offset="0.5" stop-color="#c0180e"/>
    <stop offset="1" stop-color="#4a0503"/>
</radialGradient>
<radialGradient id="spell-rot" cx="0.36" cy="0.4" r="0.7">
    <stop offset="0" stop-color="#e0e890"/>
    <stop offset="0.5" stop-color="#7a8a24"/>
    <stop offset="1" stop-color="#2a300a"/>
</radialGradient>
<linearGradient id="spell-ice" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#ffffff"/>
    <stop offset="0.5" stop-color="#a8e4ff"/>
    <stop offset="1" stop-color="#3a8ad0"/>
</linearGradient>
<radialGradient id="spell-frost" cx="0.5" cy="0.5" r="0.55">
    <stop offset="0" stop-color="#ffffff"/>
    <stop offset="0.5" stop-color="#9adcff"/>
    <stop offset="1" stop-color="#1a4a8a"/>
</radialGradient>
<linearGradient id="spell-ward" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#dfe8f4"/>
    <stop offset="0.5" stop-color="#8a9ab8"/>
    <stop offset="1" stop-color="#3a4660"/>
</linearGradient>
<radialGradient id="spell-ward-glow">
    <stop offset="0" stop-color="#ffffff" stop-opacity="0.5"/>
    <stop offset="1" stop-color="#9ab8e8" stop-opacity="0"/>
</radialGradient>
<radialGradient id="spell-portal" cx="0.5" cy="0.5" r="0.55">
    <stop offset="0" stop-color="#ffffff"/>
    <stop offset="0.3" stop-color="#d8a8ff"/>
    <stop offset="0.75" stop-color="#6a2ab8"/>
    <stop offset="1" stop-color="#1a0838" stop-opacity="0"/>
</radialGradient>
<radialGradient id="spell-bubble" cx="0.38" cy="0.32" r="0.7">
    <stop offset="0" stop-color="#ffffff" stop-opacity="0.7"/>
    <stop offset="0.6" stop-color="#8ad0ff" stop-opacity="0.25"/>
    <stop offset="1" stop-color="#3a8ae0" stop-opacity="0.55"/>
</radialGradient>
<radialGradient id="spell-necro" cx="0.5" cy="0.6" r="0.6">
    <stop offset="0" stop-color="#9aff7a" stop-opacity="0.8"/>
    <stop offset="0.6" stop-color="#2a8a3a" stop-opacity="0.3"/>
    <stop offset="1" stop-color="#0a2a10" stop-opacity="0"/>
</radialGradient>
<radialGradient id="spell-gold" cx="0.4" cy="0.35" r="0.7">
    <stop offset="0" stop-color="#fffbe0"/>
    <stop offset="0.5" stop-color="#f2c040"/>
    <stop offset="1" stop-color="#8a5a08"/>
</radialGradient>
<radialGradient id="spell-astral" cx="0.5" cy="0.5" r="0.55">
    <stop offset="0" stop-color="#fffbe0"/>
    <stop offset="0.3" stop-color="#ffd860" stop-opacity="0.8"/>
    <stop offset="1" stop-color="#1a2260" stop-opacity="0"/>
</radialGradient>`;

/** Each school spell's icon: SVG drawn round 0, 0, about 44 across. */
export const SPELL_ICONS = Object.freeze({
    // --- Healing ---

    // A green heart, a heartbeat across it
    vigor: `
        <circle r="20" fill="url(#icon-heal-glow)"/>
        <path d="M0,15 C-14,6 -18,-3 -14,-9 C-10,-15 -3,-13 0,-7 C3,-13 10,-15 14,-9 C18,-3 14,6 0,15 Z" fill="url(#icon-heal-cross)" stroke="#0b5a26" stroke-width="1.4"/>
        <path d="M-16,0 L-7,0 L-4,-6 L0,6 L3,-2 L5,0 L16,0" fill="none" stroke="#f2fff5" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>
        <path d="${star(15, -15, 3.6, 1, 4, 0)}" fill="#e9fff0"/>`,

    // A green cross, bound with a stitched bandage
    mendWounds: `
        <circle r="21" fill="url(#icon-heal-glow)"/>
        ${cross(0.95)}
        <g transform="rotate(-35)">
            <rect x="-18" y="-4.5" width="36" height="9" rx="2" fill="#f4ecd8" stroke="#8a7a5a" stroke-width="1"/>
            <path d="M-13,-2 l3,4 m0,-4 l-3,4 M-5,-2 l3,4 m0,-4 l-3,4 M3,-2 l3,4 m0,-4 l-3,4 M11,-2 l3,4 m0,-4 l-3,4" stroke="#c83a2a" stroke-width="1.1" stroke-linecap="round"/>
        </g>
        <path d="${star(15, -14, 3.4, 1, 4, 0)}" fill="#e9fff0"/>`,

    // A lotus opening, a glowing cross in its heart: body and mind soothed
    detraumatize: `
        <circle r="21" fill="url(#icon-heal-glow)"/>
        <circle cy="-3" r="17" fill="none" stroke="#c9ffd8" stroke-width="1" opacity="0.6"/>
        <g fill="#d8ffe4" stroke="#1a7a3a" stroke-width="1">
            <ellipse cx="0" cy="3" rx="4.5" ry="12" transform="rotate(-64 0 15)"/>
            <ellipse cx="0" cy="3" rx="4.5" ry="12" transform="rotate(64 0 15)"/>
            <ellipse cx="0" cy="3" rx="4.8" ry="12" transform="rotate(-32 0 15)"/>
            <ellipse cx="0" cy="3" rx="4.8" ry="12" transform="rotate(32 0 15)"/>
        </g>
        <ellipse cx="0" cy="2" rx="5.5" ry="13" fill="#f2fff6" stroke="#1a7a3a" stroke-width="1"/>
        ${cross(0.42, 0, -1)}
        <path d="M-14,17 Q0,21 14,17" fill="none" stroke="#2fd46a" stroke-width="1.6" stroke-linecap="round"/>`,

    // Two green arrows chasing round a sprouting shoot
    renewal: `
        <circle r="21" fill="url(#icon-heal-glow)"/>
        <g fill="none" stroke="url(#icon-heal-cross)" stroke-width="3.2" stroke-linecap="round">
            <path d="M-16,-3 A16,16 0 0 1 9,-13"/>
            <path d="M16,3 A16,16 0 0 1 -9,13"/>
        </g>
        <path d="M5,-19 L14,-11 L3,-8 Z" fill="#43e37c" stroke="#0b5a26" stroke-width="0.8"/>
        <path d="M-5,19 L-14,11 L-3,8 Z" fill="#43e37c" stroke="#0b5a26" stroke-width="0.8"/>
        <path d="M0,10 C0,4 -1,0 0,-6" fill="none" stroke="#2a7a1a" stroke-width="2" stroke-linecap="round"/>
        <path d="M0,-2 C-3,-8 -9,-8 -10,-5 C-7,-2 -3,-1 0,-2 Z" fill="#7ae860" stroke="#1a5a10" stroke-width="0.9"/>
        <path d="M0,-5 C3,-11 9,-11 10,-8 C7,-5 3,-4 0,-5 Z" fill="#9aff7a" stroke="#1a5a10" stroke-width="0.9"/>
        <path d="${star(0, -11, 3, 0.9, 4, 0)}" fill="#f2fff5"/>`,

    // A golden cross in a burst of starlight, the night's stars joined round it
    astralHeal: `
        <circle r="22" fill="#141a48"/>
        <circle r="22" fill="url(#spell-astral)"/>
        <path d="${star(0, 0, 21, 5, 12)}" fill="#fff4c0" opacity="0.45"/>
        <g stroke="#bcd0ff" stroke-width="0.6" opacity="0.8" fill="none">
            <path d="M-17,-8 L-12,-15 L-4,-18 M11,-17 L17,-9 L16,1 M-15,10 L-9,17 M9,17 L16,11"/>
        </g>
        <g fill="#ffffff">
            <circle cx="-17" cy="-8" r="1.1"/><circle cx="-12" cy="-15" r="1.3"/><circle cx="-4" cy="-18" r="0.9"/>
            <circle cx="11" cy="-17" r="1.1"/><circle cx="17" cy="-9" r="1.3"/><circle cx="16" cy="1" r="0.9"/>
            <circle cx="-15" cy="10" r="1"/><circle cx="-9" cy="17" r="1.2"/><circle cx="9" cy="17" r="1"/><circle cx="16" cy="11" r="1.2"/>
        </g>
        <path d="M-5,-15 h10 a2,2 0 0 1 2,2 v8 h8 a2,2 0 0 1 2,2 v10 a2,2 0 0 1 -2,2 h-8 v8 a2,2 0 0 1 -2,2 h-10 a2,2 0 0 1 -2,-2 v-8 h-8 a2,2 0 0 1 -2,-2 v-10 a2,2 0 0 1 2,-2 h8 v-8 a2,2 0 0 1 2,-2 z"
            fill="#fff4b0" stroke="#b8860b" stroke-width="1.8" filter="url(#icon-glow)" transform="translate(0 -0.5) scale(0.72)"/>
        ${PINNACLE("#f2d060")}`,

    // --- Fire ---

    // A lick of flame
    burn: `
        <circle cy="6" r="16" fill="url(#spell-fire-glow)"/>
        ${fire(0, 17, 12, 32, 2)}`,

    // A ball of fire, its trail behind it
    fireball: `
        <circle cx="5" cy="-5" r="18" fill="url(#spell-fire-glow)"/>
        <path d="M-2,-12 C-8,-6 -14,4 -20,17 C-10,10 -2,6 12,2 Z" fill="#ff6a14" opacity="0.8"/>
        <path d="M0,-8 C-6,-2 -10,6 -15,13 C-8,8 -1,5 9,1 Z" fill="#ffc040" opacity="0.85"/>
        <circle cx="5" cy="-5" r="11" fill="url(#spell-fireball)" stroke="#7a1a00" stroke-width="1"/>
        <circle cx="2" cy="-8" r="3.4" fill="#fffbe0" opacity="0.8"/>`,

    // Flames bursting out on every side
    burstflame: `
        <circle r="21" fill="url(#spell-fire-glow)"/>
        ${[0, 45, 90, 135, 180, 225, 270, 315].map((turn, k) => `<g transform="rotate(${turn})">${fire(0, -3, k % 2 ? 5.5 : 7, k % 2 ? 16 : 20)}</g>`).join("")}
        <circle r="7.5" fill="url(#spell-fireball)" stroke="#7a1a00" stroke-width="0.8"/>`,

    // Someone wreathed in fire
    immolate: `
        <circle r="21" fill="url(#spell-fire-glow)"/>
        ${fire(-9, 19, 10, 30, -4)}
        ${fire(9, 19, 10, 30, 4)}
        <g transform="translate(0 3)">${FIGURE}</g>
        ${fire(-4, 19, 8, 20, -2)}
        ${fire(5, 19, 8, 22, 2)}
        ${fire(0, 19, 7, 14)}`,

    // The ground round them flooded with fire, flames standing up from it
    flamefill: `
        <circle cy="4" r="21" fill="url(#spell-fire-glow)"/>
        <ellipse cy="13" rx="20" ry="7" fill="#5a1004" stroke="#ff6a14" stroke-width="1.4"/>
        <ellipse cy="13" rx="15" ry="4.6" fill="#ff6a14" opacity="0.8"/>
        <ellipse cy="13" rx="8" ry="2.4" fill="#ffe080"/>
        ${fire(-14, 14, 6, 16, -2)}
        ${fire(14, 14, 6, 17, 2)}
        ${fire(-7, 17, 8, 26, -1)}
        ${fire(7, 17, 8, 27, 1)}
        ${fire(0, 18, 9, 34)}`,

    // A roaring inferno, sparks thrown up
    inferno: `
        <circle r="23" fill="#ff4a00" opacity="0.25"/>
        <circle cy="2" r="22" fill="url(#spell-fire-glow)"/>
        ${fire(-12, 20, 10, 28, -5)}
        ${fire(12, 20, 10, 29, 5)}
        ${fire(-6, 20, 11, 36, -2)}
        ${fire(6, 20, 11, 37, 2)}
        ${fire(0, 21, 12, 42)}
        <g fill="#ffe080">
            <circle cx="-16" cy="-12" r="1.3"/><circle cx="15" cy="-15" r="1.1"/><circle cx="-10" cy="-19" r="0.9"/>
            <circle cx="11" cy="-20" r="1.2"/><circle cx="18" cy="-5" r="0.8"/><circle cx="-19" cy="-3" r="0.9"/>
        </g>`,

    // Fire falling out of a black sky on them and all round them, the ground aflame
    hellfire: `
        <circle r="22" fill="url(#spell-hell)"/>
        <g fill="#ff9a30" opacity="0.85">
            <path d="M-17,-19 L-9,-6 L-12,-5 Z"/><path d="M4,-22 L9,-9 L6,-8 Z"/><path d="M15,-18 L17,-6 L14,-6 Z"/>
        </g>
        <circle cx="-9" cy="-5" r="3" fill="url(#spell-fireball)"/>
        <circle cx="8" cy="-8" r="2.6" fill="url(#spell-fireball)"/>
        <circle cx="16" cy="-5" r="2" fill="url(#spell-fireball)"/>
        ${fire(-12, 19, 8, 20, -3)}
        ${fire(12, 19, 8, 21, 3)}
        ${fire(-5, 19, 9, 27, -1)}
        ${fire(5, 19, 9, 28, 1)}
        ${fire(0, 20, 9, 31)}
        ${PINNACLE("#ff5a1a")}`,

    // --- Earth ---

    // The ground shuddering, cracked, stones jumping from it
    rumble: `
        <circle cy="6" r="18" fill="url(#spell-earth-glow)"/>
        <path d="M-20,8 L20,8 L20,18 L-20,18 Z" fill="url(#spell-soil)" stroke="#2e1e0c" stroke-width="1.1"/>
        <path d="M-6,8 L-3,12 L-6,15 L-2,18 M5,8 L3,12 L7,15" fill="none" stroke="#2e1e0c" stroke-width="1.3" stroke-linejoin="round"/>
        <path d="M-9,1 l3,-3 l3,1 l-1,3 z M5,-2 l2,-3 l3,1 l0,3 z M-2,-8 l2,-2 l2,1 l-1,2 z" fill="url(#spell-stone)" stroke="#3a2e22" stroke-width="0.8"/>
        <path d="M-17,3 Q-15,0 -17,-3 M-13,-1 Q-11,-4 -13,-7 M17,3 Q15,0 17,-3 M13,-1 Q11,-4 13,-7" fill="none" stroke="#f2e6cf" stroke-width="1.3" stroke-linecap="round" opacity="0.85"/>`,

    // A stone slamming down, the ground cracking under it
    stoneCrush: `
        <circle r="20" fill="url(#spell-earth-glow)"/>
        <path d="M-10,-18 L-10,-8 M-4,-21 L-4,-10 M4,-21 L4,-10 M10,-18 L10,-8" stroke="#f2e6cf" stroke-width="1.4" stroke-linecap="round" opacity="0.7"/>
        <path d="M-13,-4 L-6,-12 L6,-13 L14,-5 L13,6 L4,11 L-8,10 L-14,3 Z" fill="url(#spell-stone)" stroke="#3a2e22" stroke-width="1.3"/>
        <path d="M-6,-12 L-3,-3 L6,-13 M-3,-3 L-14,3 M-3,-3 L4,11 M-3,-3 L13,6" fill="none" stroke="#5a4a3a" stroke-width="0.8" opacity="0.8"/>
        <path d="M-20,15 L-8,13 L-3,17 L4,13 L9,16 L20,14" fill="none" stroke="#3a2e22" stroke-width="2" stroke-linejoin="round"/>
        <path d="${star(-15, 12, 4.5, 1.6, 6)}" fill="#f2e6cf" opacity="0.8"/><path d="${star(15, 11, 4, 1.4, 6)}" fill="#f2e6cf" opacity="0.8"/>`,

    // A stone bursting into shards on every side
    shatterstone: `
        <circle r="21" fill="url(#spell-earth-glow)"/>
        <path d="${star(0, 0, 9, 4, 8)}" fill="#ffe8b0" opacity="0.8"/>
        <g fill="url(#spell-stone)" stroke="#3a2e22" stroke-width="0.9">
            <path d="M-3,-6 L3,-7 L5,-2 L0,2 L-5,-1 Z"/>
            <path d="M-18,-12 L-11,-14 L-9,-8 Z"/><path d="M10,-17 L17,-11 L11,-9 Z"/>
            <path d="M16,3 L21,8 L14,10 Z"/><path d="M-19,6 L-13,4 L-14,11 Z"/>
            <path d="M-6,14 L0,12 L-1,19 Z"/><path d="M6,13 L11,16 L5,19 Z"/><path d="M-1,-19 L4,-21 L3,-15 Z"/>
        </g>
        <path d="M-8,-6 L-15,-10 M8,-6 L13,-12 M9,3 L15,6 M-8,3 L-14,6 M-2,8 L-3,12 M3,8 L6,12" stroke="#f2e6cf" stroke-width="1" stroke-linecap="round" opacity="0.8"/>`,

    // The earth rising round someone and closing over them
    engulf: `
        <circle r="21" fill="url(#spell-earth-glow)"/>
        <g transform="translate(0 2)">${FIGURE}</g>
        <path d="M-20,19 L-17,3 L-13,-4 L-10,6 L-7,-2 L-5,19 Z" fill="url(#spell-soil)" stroke="#2e1e0c" stroke-width="1.1"/>
        <path d="M20,19 L17,1 L13,-6 L10,5 L7,-3 L5,19 Z" fill="url(#spell-soil)" stroke="#2e1e0c" stroke-width="1.1"/>
        <path d="M-8,19 C-6,12 -2,9 0,8 C2,9 6,12 8,19 Z" fill="url(#spell-soil)" stroke="#2e1e0c" stroke-width="1.1"/>
        <path d="M-15,8 L-12,12 M14,6 L11,11 M-3,14 L-1,17" stroke="#c8a870" stroke-width="1" stroke-linecap="round"/>
        <path d="M-16,-9 C-12,-15 -7,-18 -2,-19 M16,-11 C12,-16 7,-18 2,-19" fill="none" stroke="#8a6a3a" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="3 2"/>`,

    // The ground heaving open, slabs tipped up either side of a chasm
    earthquake: `
        <circle r="22" fill="url(#spell-earth-glow)"/>
        <path d="M-21,4 L-6,-2 L-2,4 L-4,10 L0,15 L-3,21 L-21,21 Z" fill="url(#spell-soil)" stroke="#2e1e0c" stroke-width="1.2"/>
        <path d="M21,-2 L6,-6 L3,0 L6,6 L2,12 L5,21 L21,21 Z" fill="url(#spell-soil)" stroke="#2e1e0c" stroke-width="1.2"/>
        <path d="M-21,4 L-6,-2 L-5,1 L-21,8 Z M21,-2 L6,-6 L5,-3 L21,2 Z" fill="#7aa03a"/>
        <path d="M-4,-2 L0,4 L-2,10 L2,15 L0,21 L3,21 L5,15 L2,10 L6,4 L3,-4 Z" fill="#1a0e04"/>
        <path d="M-12,-8 l2,-4 l3,1 l-1,4 z M9,-14 l3,-3 l3,2 l-2,3 z M-2,-15 l2,-2 l2,1 l-1,3 z" fill="url(#spell-stone)" stroke="#3a2e22" stroke-width="0.8"/>
        <path d="M-17,-6 Q-19,-10 -17,-14 M17,-10 Q19,-14 17,-18" fill="none" stroke="#f2e6cf" stroke-width="1.3" stroke-linecap="round" opacity="0.8"/>`,

    // Acid welling up and eating a stone away, bubbles and fumes off it
    acidify: `
        <circle r="22" fill="#7ac818" opacity="0.18"/>
        <ellipse cy="12" rx="20" ry="7.5" fill="url(#spell-acid)" stroke="#1a3a04" stroke-width="1.2"/>
        <path d="M-9,11 L-8,1 L-3,-5 L5,-4 L9,3 L8,11 C4,13 -4,13 -9,11 Z" fill="url(#spell-stone)" stroke="#3a2e22" stroke-width="1.1"/>
        <path d="M-9,8 C-6,6 -4,9 -1,7 C2,5 5,9 8,7 L8,11 C4,13 -4,13 -9,11 Z" fill="#a8e030" opacity="0.9"/>
        <path d="M-3,-5 C-4,-1 -2,1 -3,4 M5,-4 C4,0 6,2 5,5" fill="none" stroke="#a8e030" stroke-width="1.6" stroke-linecap="round"/>
        <g fill="#eaff90" stroke="#3a6a0a" stroke-width="0.7">
            <circle cx="-14" cy="9" r="2.2"/><circle cx="13" cy="10" r="2.6"/><circle cx="15" cy="4" r="1.4"/><circle cx="-16" cy="3" r="1.2"/>
        </g>
        <path d="M-7,-9 C-9,-13 -5,-15 -7,-19 M2,-10 C0,-14 4,-16 2,-21 M10,-7 C8,-11 12,-13 10,-17" fill="none" stroke="#c8f060" stroke-width="1.4" stroke-linecap="round" opacity="0.7"/>`,

    // A beam grinding someone to dust, the dust blown away
    disintegrate: `
        <circle r="22" fill="url(#spell-void)"/>
        <path d="M-22,-10 L-4,-2 L-4,4 L-22,-4 Z" fill="#e8c8ff" opacity="0.35"/>
        <path d="M-22,-8 L-4,0 L-4,2 L-22,-6 Z" fill="#ffffff"/>
        <path d="M-4,-9 C-2,-11 2,-11 3,-7 L4,13 L-6,13 Z" fill="#8a6a4a" opacity="0.95"/>
        <circle cx="-1" cy="-13" r="4" fill="#8a6a4a" opacity="0.9"/>
        <g fill="#c8a878">
            <rect x="5" y="-14" width="2.4" height="2.4"/><rect x="10" y="-11" width="2" height="2"/><rect x="15" y="-15" width="1.6" height="1.6"/>
            <rect x="6" y="-5" width="2.6" height="2.6"/><rect x="12" y="-3" width="2" height="2"/><rect x="17" y="-6" width="1.5" height="1.5"/>
            <rect x="7" y="4" width="2.2" height="2.2"/><rect x="13" y="6" width="1.8" height="1.8"/><rect x="18" y="3" width="1.3" height="1.3"/>
            <rect x="6" y="11" width="2" height="2"/><rect x="12" y="13" width="1.5" height="1.5"/>
        </g>
        <circle cx="-4" cy="1" r="3.2" fill="#ffffff" filter="url(#icon-glow)"/>
        ${PINNACLE("#c8a0ff")}`,

    // --- Air ---

    // A cutting gust
    hurt: `
        <circle r="19" fill="url(#spell-air-glow)"/>
        <g fill="none" stroke="#e8f6ff" stroke-width="2.6" stroke-linecap="round">
            <path d="M-18,-8 C-6,-10 6,-12 12,-8 C16,-5 13,0 9,-2"/>
            <path d="M-19,2 C-4,1 10,0 16,4 C20,7 16,12 12,9"/>
            <path d="M-15,11 C-6,11 2,12 6,15"/>
        </g>`,

    // A gust full of grit
    dustgust: `
        <circle r="20" fill="#d8b878" opacity="0.3"/>
        <g fill="none" stroke="#f2e6cf" stroke-width="2.6" stroke-linecap="round">
            <path d="M-19,-10 C-6,-12 6,-14 13,-9 C17,-6 14,-1 10,-3"/>
            <path d="M-20,1 C-4,0 10,-1 17,3 C21,6 17,11 13,8"/>
            <path d="M-16,11 C-6,11 2,12 6,16"/>
        </g>
        <g fill="#b8945a">
            <circle cx="-8" cy="-5" r="1.4"/><circle cx="3" cy="-4" r="1.1"/><circle cx="12" cy="-15" r="1.2"/><circle cx="-12" cy="6" r="1.3"/>
            <circle cx="4" cy="7" r="1.5"/><circle cx="18" cy="-3" r="1"/><circle cx="-2" cy="15" r="1.1"/><circle cx="10" cy="14" r="0.9"/>
        </g>`,

    // A crackling bolt, sparks off it
    shockbolt: `
        <circle r="20" fill="url(#spell-air-glow)"/>
        ${crackle([[-17, -12], [-6, -5], [-9, 1], [4, 4], [1, 9], [16, 14]], 2.2)}
        <path d="${star(16, 14, 6, 2, 6)}" fill="#e8f8ff"/>
        <g stroke="#bfe8ff" stroke-width="1.2" stroke-linecap="round">
            <path d="M-4,-12 L-2,-16 M8,-3 L12,-6 M-14,3 L-17,6 M7,12 L5,17"/>
        </g>`,

    // Lightning striking one and leaping on to two more
    lightning: `
        <circle r="21" fill="url(#spell-air-glow)"/>
        ${crackle([[-2, -22], [-5, -12], [1, -9], [-3, 0], [0, 4]], 2.4)}
        ${crackle([[0, 4], [-6, 7], [-10, 5], [-15, 12]], 1.5)}
        ${crackle([[0, 4], [6, 8], [10, 5], [15, 13]], 1.5)}
        <circle cy="5" r="3.4" fill="#fffbe0"/>
        <circle cx="-15" cy="13" r="2.6" fill="#fffbe0"/>
        <circle cx="15" cy="14" r="2.6" fill="#fffbe0"/>`,

    // A storm cloud, a great thunderbolt out of it
    thunderbolt: `
        <circle cy="4" r="21" fill="url(#spell-air-glow)"/>
        <path d="M-2,-6 L-10,8 L-2,8 L-7,21 L9,2 L1,2 L6,-6 Z" fill="url(#spell-bolt)" stroke="#a87a00" stroke-width="1.1" stroke-linejoin="round" filter="url(#icon-glow)"/>
        <path d="M-15,-4 C-21,-4 -21,-12 -15,-12 C-15,-19 -6,-21 -3,-16 C0,-22 11,-21 11,-13 C18,-14 19,-4 13,-4 Z" fill="url(#spell-cloud)" stroke="#1a2030" stroke-width="1.2"/>
        <path d="M-12,-10 C-10,-13 -7,-14 -5,-13 M2,-16 C5,-17 8,-16 9,-13" fill="none" stroke="#c8d0e0" stroke-width="1.1" stroke-linecap="round" opacity="0.7"/>`,

    // A whirlwind, debris thrown round it
    tornado: `
        <circle r="22" fill="url(#spell-air-glow)"/>
        <g fill="none" stroke="#dceeff" stroke-linecap="round">
            <ellipse cx="0" cy="-15" rx="17" ry="4" stroke-width="2.6"/>
            <ellipse cx="1" cy="-8" rx="13" ry="3.4" stroke-width="2.4"/>
            <ellipse cx="2" cy="-2" rx="9.5" ry="2.8" stroke-width="2.2"/>
            <ellipse cx="1" cy="4" rx="6.5" ry="2.2" stroke-width="2"/>
            <ellipse cx="-1" cy="9" rx="4" ry="1.7" stroke-width="1.8"/>
            <ellipse cx="-2" cy="14" rx="2.2" ry="1.2" stroke-width="1.6"/>
        </g>
        <path d="M-17,-15 C-12,-4 -8,6 -2,17 M17,-15 C10,-4 6,6 -2,17" fill="none" stroke="#9ac8f0" stroke-width="1" opacity="0.7"/>
        <g fill="#8a6a4a" stroke="#3a2a1a" stroke-width="0.6">
            <path d="M-19,-3 l3,-1 l1,3 l-3,1 z"/><path d="M15,2 l3,-2 l1,3 l-3,1 z"/><path d="M-13,10 l2,-1 l1,2 l-2,1 z"/><path d="M11,-19 l2,-1 l1,2 l-2,1 z"/>
        </g>`,

    // The air round them all lightning: a crackling orb, bolts leaping from it every way
    ionize: `
        <circle r="22" fill="url(#spell-storm)"/>
        ${crackle([[0, 0], [-6, -6], [-5, -11], [-11, -16]], 1.3)}
        ${crackle([[0, 0], [7, -5], [10, -12], [15, -14]], 1.3)}
        ${crackle([[0, 0], [8, 3], [12, 1], [18, 6]], 1.3)}
        ${crackle([[0, 0], [3, 8], [0, 13], [4, 18]], 1.3)}
        ${crackle([[0, 0], [-7, 5], [-11, 3], [-17, 9]], 1.3)}
        ${crackle([[0, 0], [-8, -1], [-14, -3], [-19, -1]], 1.1)}
        <circle r="7" fill="#9ae0ff" opacity="0.6"/>
        <circle r="4.6" fill="#ffffff" filter="url(#icon-glow)"/>
        <g fill="#e8f8ff"><circle cx="-11" cy="-16" r="1.4"/><circle cx="15" cy="-14" r="1.4"/><circle cx="18" cy="6" r="1.4"/><circle cx="4" cy="18" r="1.4"/><circle cx="-17" cy="9" r="1.4"/></g>
        ${PINNACLE("#8ad8ff")}`,

    // --- Water ---

    // A scalding drop, steam rising off it
    blister: `
        <circle cy="4" r="18" fill="#f08a6a" opacity="0.22"/>
        <path d="${drop(0, 8, 11)}" fill="url(#spell-scald)" stroke="#6a1a0a" stroke-width="1.3"/>
        <ellipse cx="-5" cy="3" rx="2" ry="4" fill="#fff0e8" opacity="0.6" transform="rotate(20 -5 3)"/>
        <g fill="#fff0e8" stroke="#8a2a1a" stroke-width="0.6"><circle cx="3" cy="10" r="1.8"/><circle cx="-2" cy="13" r="1.2"/></g>
        <path d="M-12,-8 C-15,-12 -10,-15 -13,-20 M13,-6 C10,-10 15,-13 12,-19" fill="none" stroke="#f2f2f2" stroke-width="1.6" stroke-linecap="round" opacity="0.85"/>`,

    // A bolt of water flying, spray behind it
    waterbolt: `
        <circle r="20" fill="#4aa8f0" opacity="0.2"/>
        <path d="M-20,-4 C-12,-8 -2,-9 4,-8 M-19,6 C-12,8 -2,9 4,8 M-17,1 L-2,1" fill="none" stroke="#9adcff" stroke-width="1.6" stroke-linecap="round"/>
        <path d="M-6,0 C-6,-8 4,-11 12,-8 C18,-5 20,-2 20,0 C20,2 18,5 12,8 C4,11 -6,8 -6,0 Z" fill="url(#spell-water)" stroke="#0c3a7a" stroke-width="1.3"/>
        <ellipse cx="6" cy="-4" rx="5" ry="1.8" fill="#ffffff" opacity="0.6"/>
        <g fill="#9adcff"><circle cx="-12" cy="-12" r="1.4"/><circle cx="-16" cy="12" r="1.2"/><circle cx="-20" cy="-9" r="0.9"/></g>`,

    // Steam blasting out, drops thrown with it
    steamblast: `
        <circle r="21" fill="#9adcff" opacity="0.25"/>
        <g fill="#f4f8fa" stroke="#8aa8b8" stroke-width="1">
            <circle cx="-9" cy="-6" r="8"/><circle cx="6" cy="-9" r="9"/><circle cx="11" cy="4" r="7.5"/>
            <circle cx="-10" cy="7" r="7"/><circle cx="1" cy="9" r="7"/>
        </g>
        <circle r="8" fill="#ffffff"/>
        <g fill="url(#spell-water)" stroke="#0c3a7a" stroke-width="0.6">
            <path d="${drop(-19, -15, 2.2)}" transform="rotate(-45 -19 -15)"/><path d="${drop(19, -14, 2.2)}" transform="rotate(45 19 -14)"/>
            <path d="${drop(19, 15, 2)}" transform="rotate(135 19 15)"/><path d="${drop(-18, 16, 2)}" transform="rotate(-135 -18 16)"/>
        </g>`,

    // A drop of blood boiling, bubbles bursting off it
    bloodboil: `
        <circle cy="4" r="19" fill="#c0180e" opacity="0.25"/>
        <path d="${drop(0, 8, 12)}" fill="url(#spell-blood)" stroke="#3a0402" stroke-width="1.3"/>
        <g fill="#ff9a8a" stroke="#6a0a06" stroke-width="0.7">
            <circle cx="-4" cy="6" r="2.6"/><circle cx="4" cy="11" r="2"/><circle cx="3" cy="2" r="1.4"/>
            <circle cx="-9" cy="-12" r="2.2"/><circle cx="8" cy="-15" r="1.8"/><circle cx="12" cy="-6" r="1.3"/>
        </g>
        <path d="M-15,18 C-13,15 -17,13 -15,10 M15,18 C17,15 13,13 15,10" fill="none" stroke="#ff6a4a" stroke-width="1.4" stroke-linecap="round" opacity="0.8"/>`,

    // A blade of ice, frost glittering off it
    iceblade: `
        <circle r="21" fill="#9adcff" opacity="0.25"/>
        <g transform="rotate(40)">
            <path d="M0,-23 L4.5,-15 L4,6 L-4,6 L-4.5,-15 Z" fill="url(#spell-ice)" stroke="#1a5a9a" stroke-width="1.1"/>
            <path d="M0,-21 L0,5" stroke="#ffffff" stroke-width="1" opacity="0.8"/>
            <path d="M-9,6 L-5,9 L5,9 L9,6 L4,4 L-4,4 Z" fill="#dff4ff" stroke="#1a5a9a" stroke-width="1"/>
            <rect x="-1.8" y="9" width="3.6" height="8" fill="#6a9ac0" stroke="#1a3a5a" stroke-width="0.8"/>
            <path d="M0,17 L3,20 L0,23 L-3,20 Z" fill="#dff4ff" stroke="#1a5a9a" stroke-width="0.8"/>
        </g>
        <path d="${star(-13, -9, 4, 1, 4, 0)}" fill="#ffffff"/><path d="${star(13, 11, 3.2, 0.9, 4, 0)}" fill="#ffffff"/><path d="${star(-8, 14, 2.4, 0.7, 4, 0)}" fill="#dff4ff"/>`,

    // A drop of foul water, rot bubbling in it, flies about it
    putrify: `
        <circle cy="4" r="20" fill="#7a8a24" opacity="0.28"/>
        <path d="${drop(0, 8, 12)}" fill="url(#spell-rot)" stroke="#1a1e04" stroke-width="1.3"/>
        <circle cx="-4" cy="7" r="2.6" fill="#2a300a"/>
        <circle cx="4" cy="7" r="2.6" fill="#2a300a"/>
        <path d="M-3,13 L3,13 M-1.5,13 L-1.5,15.5 M1.5,13 L1.5,15.5" stroke="#2a300a" stroke-width="1.1"/>
        <g fill="#c8d060" stroke="#3a4010" stroke-width="0.6"><circle cx="5" cy="-2" r="1.6"/><circle cx="-6" cy="0" r="1.1"/></g>
        <g fill="#2a2418"><ellipse cx="-14" cy="-13" rx="1.8" ry="1.2"/><ellipse cx="14" cy="-9" rx="1.6" ry="1.1"/><ellipse cx="10" cy="-19" rx="1.5" ry="1"/></g>
        <g fill="#e8eef2" opacity="0.7"><ellipse cx="-15" cy="-15" rx="1.5" ry="0.8"/><ellipse cx="13" cy="-11" rx="1.3" ry="0.7"/><ellipse cx="9" cy="-21" rx="1.2" ry="0.6"/></g>`,

    // A great snowflake in a ring of ice: cold beyond cold
    absoluteZero: `
        <circle r="22" fill="url(#spell-frost)"/>
        <g stroke="#ffffff" stroke-linecap="round" fill="none">
            <path d="M0,-19 L0,19 M-16.45,-9.5 L16.45,9.5 M-16.45,9.5 L16.45,-9.5" stroke-width="2.6"/>
            <path d="M-5,-15 L0,-10 L5,-15 M-5,15 L0,10 L5,15 M-15.5,-3.2 L-8.7,-5 L-10.5,-11.8 M15.5,3.2 L8.7,5 L10.5,11.8 M-15.5,3.2 L-8.7,5 L-10.5,11.8 M15.5,-3.2 L8.7,-5 L10.5,-11.8" stroke-width="1.8"/>
            <path d="M-3,-6 L0,-3 L3,-6 M-3,6 L0,3 L3,6 M-6.7,-0.4 L-2.6,-1.5 L-3.7,-5.6 M6.7,0.4 L2.6,1.5 L3.7,5.6 M-6.7,0.4 L-2.6,1.5 L-3.7,5.6 M6.7,-0.4 L2.6,-1.5 L3.7,-5.6" stroke-width="1.2"/>
        </g>
        <circle r="2.6" fill="#ffffff" filter="url(#icon-glow)"/>
        ${PINNACLE("#e8f8ff")}`,

    // --- Learnt from tomes ---

    // Wards: a shield, what it's against on it
    resistFire: shield("#ff8a3a", `${fire(0, 10, 7.5, 19)}`),
    resistWater: shield("#6ac0ff", `<path d="${drop(0, 4, 7)}" fill="url(#spell-water)" stroke="#0c3a7a" stroke-width="1"/><ellipse cx="-2.5" cy="1" rx="1.4" ry="2.6" fill="#ffffff" opacity="0.6" transform="rotate(20 -2.5 1)"/>`),
    resistAir: shield("#dceeff", `<g fill="none" stroke="#e8f6ff" stroke-width="2" stroke-linecap="round"><path d="M-9,-6 C-2,-8 5,-8 8,-5 C10,-3 8,0 6,-1"/><path d="M-10,1 C-2,0 6,0 9,3 C11,5 9,8 7,6"/><path d="M-8,8 C-3,8 1,9 3,11"/></g>`),
    resistEarth: shield("#c8a870", `<path d="M-8,4 L-5,-4 L2,-7 L8,-2 L8,5 L2,9 L-5,8 Z" fill="url(#spell-stone)" stroke="#2e2418" stroke-width="1"/><path d="M-5,-4 L0,1 L2,-7 M0,1 L8,5 M0,1 L-5,8" fill="none" stroke="#4a3e32" stroke-width="0.7"/>`),
    resistMagic: shield("#c898ff", `<path d="${star(0, 0, 10, 4, 8)}" fill="#e8d0ff" stroke="#6a2ab8" stroke-width="0.9"/><circle r="3.4" fill="#ffffff"/>`),
    resistPoison: shield("#8ae04a", `<path d="${drop(0, 4, 7)}" fill="#6cc03a" stroke="#1f4a10" stroke-width="1"/><circle cx="-2.3" cy="3" r="1.5" fill="#1f3a10"/><circle cx="2.3" cy="3" r="1.5" fill="#1f3a10"/><path d="M-2.4,7.4 L2.4,7.4" stroke="#1f3a10" stroke-width="1"/>`),
    resistDisease: shield("#e0c050", `<circle cy="1" r="8" fill="#b8b04a" stroke="#4a4210" stroke-width="1"/><circle cx="-3" cy="-1" r="1.8" fill="#7a5a1a"/><circle cx="3" cy="-2" r="1.3" fill="#7a5a1a"/><circle cx="3.5" cy="4" r="1.9" fill="#7a5a1a"/><circle cx="-2" cy="5" r="1.3" fill="#7a5a1a"/>`),

    // Cures: what's ended, in a cleansing ring
    curePoison: cleansing(`<path d="${drop(0, 3, 9)}" fill="#6cc03a" stroke="#1f4a10" stroke-width="1.2"/><circle cx="-3" cy="2" r="2" fill="#1f3a10"/><circle cx="3" cy="2" r="2" fill="#1f3a10"/><path d="M-3,7.5 L3,7.5" stroke="#1f3a10" stroke-width="1.1"/>`),
    cureSickness: cleansing(`<circle r="10" fill="#b8b04a" stroke="#4a4210" stroke-width="1.2"/><circle cx="-4" cy="-2" r="2.2" fill="#7a5a1a"/><circle cx="4" cy="-3" r="1.6" fill="#7a5a1a"/><circle cx="4.5" cy="4.5" r="2.4" fill="#7a5a1a"/><circle cx="-3" cy="6" r="1.6" fill="#7a5a1a"/>`),
    liftCurse: cleansing(`<path d="M0,10 C-10,4 -12,-2 -9,-6.5 C-6.5,-10.5 -2,-9 0,-5 C2,-9 6.5,-10.5 9,-6.5 C12,-2 10,4 0,10 Z" fill="url(#spell-gold)" stroke="#6a4a08" stroke-width="1.1"/><path d="M0,-5 L-2,-1 L1.5,2 L-1,6" fill="none" stroke="#6a4a08" stroke-width="1.2" opacity="0.6"/><g fill="#8a7a96"><circle cx="-12" cy="10" r="1.4"/><circle cx="12" cy="9" r="1.1"/></g>`),
    quench: cleansing(`${fire(0, 11, 8, 20)}<path d="${drop(6, -4, 3.6)}" fill="url(#spell-water)" stroke="#0c3a7a" stroke-width="0.8"/><path d="M-6,-6 C-8,-9 -5,-11 -7,-14" fill="none" stroke="#f2f2f2" stroke-width="1.2" stroke-linecap="round"/>`),
    staunch: cleansing(`<path d="${drop(0, 3, 9)}" fill="url(#spell-blood)" stroke="#3a0402" stroke-width="1.2"/><rect x="-11" y="-1.8" width="22" height="5" rx="1.2" fill="#f4ecd8" stroke="#8a7a5a" stroke-width="0.8" transform="rotate(-20)"/><path d="M-6,-0.5 l2,2.6 m0,-2.6 l-2,2.6 M3,-0.5 l2,2.6 m0,-2.6 l-2,2.6" stroke="#c83a2a" stroke-width="0.9" transform="rotate(-20)"/>`),
    unbind: cleansing(`<g fill="none" stroke="#f2f2e8" stroke-width="1.1" opacity="0.9"><path d="M0,-11 L0,-3 M0,3 L0,11 M-11,0 L-3,0 M3,0 L11,0 M-8,-8 L-3,-3 M3,3 L8,8 M8,-8 L3,-3 M-3,3 L-8,8"/><path d="M0,-7 Q4,-6 5,-5 M5,5 Q4,6 0,7 M-5,5 Q-6,4 -7,0 M-7,0 Q-6,-4 -5,-5"/></g><path d="M-2.5,-2.5 L2.5,2.5" stroke="#ffe080" stroke-width="2" stroke-linecap="round"/>`),

    // A golden heart, a flame of courage rising from it
    embolden: `
        <circle r="21" fill="#f2c040" opacity="0.22"/>
        <path d="M-12,-6 L0,-21 L12,-6" fill="none" stroke="#fff4c0" stroke-width="2" stroke-linejoin="round" opacity="0.8"/>
        <path d="M-8,-10 L0,-18 L8,-10" fill="none" stroke="#fff4c0" stroke-width="1.6" stroke-linejoin="round" opacity="0.6"/>
        <path d="M0,18 C-13,9 -16,1 -12,-4 C-9,-9 -3,-8 0,-3 C3,-8 9,-9 12,-4 C16,1 13,9 0,18 Z" fill="url(#spell-gold)" stroke="#6a4a08" stroke-width="1.4"/>
        ${fire(0, 11, 5, 13)}`,

    // A rotting hand clawing up out of the grave, a green glow round it
    zombify: `
        <circle cy="4" r="21" fill="url(#spell-necro)"/>
        <path d="M-20,15 C-12,10 12,10 20,15 L20,21 L-20,21 Z" fill="url(#spell-soil)" stroke="#1a1208" stroke-width="1.1"/>
        <path d="M-5,14 L-5,2 L-9,-6 C-10,-8 -8,-9 -7,-7 L-4,-2 L-4,-14 C-4,-16 -1,-16 -1,-14 L-1,-4 L0,-16 C0,-18 3,-18 3,-16 L3,-4 L5,-13 C5,-15 8,-15 8,-13 L6,-2 L9,-9 C10,-11 12,-10 11,-8 L7,4 L6,14 Z" fill="#8aa870" stroke="#1a2a10" stroke-width="1.1" stroke-linejoin="round"/>
        <path d="M-3,6 L1,4 M1,9 L4,7" stroke="#3a4a28" stroke-width="0.9"/>
        <g fill="#b8ff9a"><circle cx="-13" cy="-9" r="1.3"/><circle cx="14" cy="-14" r="1.1"/><circle cx="15" cy="2" r="0.9"/><circle cx="-15" cy="4" r="1"/></g>`,

    // A swirling violet rift
    teleport: `
        <circle r="22" fill="url(#spell-portal)"/>
        <g fill="none" stroke="#f0d8ff" stroke-linecap="round">
            <path d="M0,-17 A17,17 0 0 1 17,0" stroke-width="2.4"/><path d="M0,17 A17,17 0 0 1 -17,0" stroke-width="2.4"/>
            <path d="M11,-6 A12,12 0 0 1 -1,12" stroke-width="1.8"/><path d="M-11,6 A12,12 0 0 1 1,-12" stroke-width="1.8"/>
            <path d="M5,5 A7,7 0 0 1 -6,2" stroke-width="1.4"/><path d="M-5,-5 A7,7 0 0 1 6,-2" stroke-width="1.4"/>
        </g>
        <path d="${star(16, -15, 3.6, 1, 4, 0)}" fill="#ffffff"/><path d="${star(-16, 15, 3, 0.9, 4, 0)}" fill="#ffffff"/>`,

    // An arm flexed, bulging, a glow of strength round it
    swole: `
        <circle r="21" fill="#ff8a3a" opacity="0.25"/>
        <path d="M-17,14 L-9,14 C-7,8 -4,5 1,5 C5,9 12,9 15,4 C18,-1 16,-9 11,-11 L12,-15 C12,-19 6,-19 6,-15 L5,-10 C1,-12 -4,-11 -6,-7 C-10,-1 -14,6 -17,8 Z" fill="#e8b088" stroke="#6a3a1a" stroke-width="1.4" stroke-linejoin="round"/>
        <path d="M-2,-4 C2,-8 9,-7 11,-2" fill="none" stroke="#b87a50" stroke-width="1.3" stroke-linecap="round"/>
        <path d="M-15,-6 L-18,-9 M-12,-12 L-13,-17 M18,8 L21,10" stroke="#ffd060" stroke-width="1.8" stroke-linecap="round"/>`,

    // A mirrored barrier, a bolt turned back off it
    reflect: `
        <circle r="21" fill="url(#spell-ward-glow)"/>
        <path d="M6,-19 L14,-12 L14,12 L6,19 L2,19 L10,12 L10,-12 L2,-19 Z" fill="url(#spell-ward)" stroke="#e8f0ff" stroke-width="1.2"/>
        <path d="M11,-14 L11,14" stroke="#ffffff" stroke-width="1" opacity="0.8"/>
        <path d="M-19,-12 L6,0" stroke="#ff8a4a" stroke-width="2.4" stroke-linecap="round"/>
        <path d="M6,0 L-17,12" stroke="#ffe080" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="4 2"/>
        <path d="M-14,7 L-19,13 L-11,14" fill="none" stroke="#ffe080" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="6" r="3" fill="#ffffff" filter="url(#icon-glow)"/>`,

    // An eye, closed out, and a figure fading away beside it
    invisibility: `
        <circle r="21" fill="#9ab8e8" opacity="0.15"/>
        <g fill="none" stroke="#dceeff" stroke-width="1.6" stroke-dasharray="3 2.4" opacity="0.8">
            <circle cy="-9" r="5"/><path d="M-7,15 L-6,-1 C-6,-4 -3,-5 0,-5 C3,-5 6,-4 6,-1 L7,15 Z"/>
        </g>
        <path d="M-19,4 C-12,-4 -4,-6 0,-6 C4,-6 12,-4 19,4 C12,12 4,14 0,14 C-4,14 -12,12 -19,4 Z" fill="#1c2436" opacity="0.6" transform="translate(0 2) scale(0.9)"/>
        <path d="M-15,6 C-9,0 -3,-1 0,-1 C3,-1 9,0 15,6 C9,12 3,13 0,13 C-3,13 -9,12 -15,6 Z" fill="none" stroke="#f2f6ff" stroke-width="1.8"/>
        <circle cy="6" r="3.6" fill="#8ab8e8"/>
        <path d="M-15,17 L15,-5" stroke="#ff6a5a" stroke-width="2.4" stroke-linecap="round"/>`,

    // A temple, the six gods' sun over it, and a way back to it
    wordOfRecall: `
        <circle r="21" fill="#f2d060" opacity="0.2"/>
        <path d="${star(0, -12, 7.5, 3.5, 6)}" fill="#ffe8a0" stroke="#8a6a1a" stroke-width="0.8"/>
        <path d="M-13,-2 L0,-8 L13,-2 Z" fill="#c8b8a0" stroke="#4a3e32" stroke-width="1.1"/>
        <path d="M-11,-2 L11,-2 L11,13 L-11,13 Z" fill="#e8dcc4" stroke="#4a3e32" stroke-width="1.1"/>
        <path d="M-8,1 L-8,13 M-3,1 L-3,13 M3,1 L3,13 M8,1 L8,13" stroke="#8a7a66" stroke-width="1.4"/>
        <path d="M-2,13 L-2,6 A2,2 0 0 1 2,6 L2,13 Z" fill="#4a3018"/>
        <path d="M-14,15 L14,15" stroke="#4a3e32" stroke-width="1.6"/>
        <path d="M-19,8 C-21,-4 -15,-15 -5,-19" fill="none" stroke="#ffe080" stroke-width="2" stroke-linecap="round"/>
        <path d="M-9,-21 L-3,-19 L-7,-14" fill="none" stroke="#ffe080" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,

    // A map, footsteps across it to a star
    wizardsWalk: `
        <circle r="21" fill="#9a7ae8" opacity="0.2"/>
        <path d="M-17,-13 L-6,-16 L6,-12 L17,-15 L17,13 L6,16 L-6,12 L-17,15 Z" fill="#e8d8b0" stroke="#6a4a22" stroke-width="1.2" stroke-linejoin="round"/>
        <path d="M-6,-16 L-6,12 M6,-12 L6,16" stroke="#b89a6a" stroke-width="0.9"/>
        <path d="M-15,-4 C-10,-6 -9,0 -4,1" fill="none" stroke="#7a9a4a" stroke-width="1.2" opacity="0.7"/>
        <g fill="#5a3a8a">
            <ellipse cx="-12" cy="9" rx="1.4" ry="2.2" transform="rotate(-30 -12 9)"/><ellipse cx="-8" cy="5" rx="1.4" ry="2.2" transform="rotate(-30 -8 5)"/>
            <ellipse cx="-4" cy="4" rx="1.4" ry="2.2" transform="rotate(-50 -4 4)"/><ellipse cx="1" cy="0" rx="1.4" ry="2.2" transform="rotate(-50 1 0)"/>
            <ellipse cx="4" cy="-3" rx="1.4" ry="2.2" transform="rotate(-40 4 -3)"/>
        </g>
        <path d="${star(11, -6, 5.4, 2.2)}" fill="#ffe080" stroke="#8a6a1a" stroke-width="0.8" filter="url(#icon-glow)"/>`,

    // A circle of runes, light rising from it, and a shape in the light
    summon: `
        <circle r="21" fill="#6a2ab8" opacity="0.18"/>
        <ellipse cy="12" rx="19" ry="6.5" fill="none" stroke="#d8a8ff" stroke-width="1.8"/>
        <ellipse cy="12" rx="14" ry="4.6" fill="none" stroke="#d8a8ff" stroke-width="1" stroke-dasharray="2 2"/>
        <path d="M-12,12 L-8,-18 L8,-18 L12,12 Z" fill="#e8d0ff" opacity="0.3"/>
        <path d="M-6,10 C-8,2 -7,-6 -4,-9 C-6,-12 -5,-16 0,-16 C5,-16 6,-12 4,-9 C7,-6 8,2 6,10 Z" fill="#2a1a3a" opacity="0.85"/>
        <circle cx="-2" cy="-12" r="1.1" fill="#ffe080"/><circle cx="2" cy="-12" r="1.1" fill="#ffe080"/>
        <g fill="#f0d8ff"><circle cx="-17" cy="10" r="1.2"/><circle cx="17" cy="10" r="1.2"/><circle cx="-9" cy="17" r="1.2"/><circle cx="9" cy="17" r="1.2"/><circle cy="18.5" r="1.2"/></g>`,

    // Feet raised off the ground, light between, the air stirred under them
    levitate: `
        <circle r="21" fill="url(#spell-air-glow)"/>
        <path d="M-19,17 L19,17" stroke="#8a7050" stroke-width="2.6" stroke-linecap="round"/>
        <ellipse cy="15" rx="12" ry="2.6" fill="#1c1410" opacity="0.35"/>
        <path d="M-9,-2 L-9,-12 C-9,-14 -4,-14 -4,-12 L-4,-2 L0,1 C1,3 -1,4 -3,4 L-10,4 C-11,4 -11,2 -9,-2 Z" fill="#6a4a2a" stroke="#2a1a0a" stroke-width="1"/>
        <path d="M4,-2 L4,-12 C4,-14 9,-14 9,-12 L9,-2 L13,1 C14,3 12,4 10,4 L3,4 C2,4 2,2 4,-2 Z" fill="#6a4a2a" stroke="#2a1a0a" stroke-width="1"/>
        <g fill="none" stroke="#e8f6ff" stroke-width="1.5" stroke-linecap="round">
            <path d="M-14,10 C-9,8 -5,12 0,10 C5,8 9,12 14,10"/><path d="M-10,13.5 C-5,12 5,15 10,13.5"/>
        </g>
        <path d="M-15,-6 L-15,-16 M-18,-13 L-15,-16 L-12,-13 M15,-6 L15,-16 M12,-13 L15,-16 L18,-13" fill="none" stroke="#bfe8ff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`,

    // A pale face, wide-eyed and screaming
    fear: `
        <circle r="21" fill="#4a1a6a" opacity="0.45"/>
        <path d="M0,-17 C10,-17 14,-9 14,-1 C14,8 10,11 8,17 C5,14 3,19 0,16 C-3,19 -5,14 -8,17 C-10,11 -14,8 -14,-1 C-14,-9 -10,-17 0,-17 Z" fill="#e8e0f2" stroke="#2a1a3a" stroke-width="1.3"/>
        <ellipse cx="-5" cy="-5" rx="3.4" ry="4.6" fill="#1a0e24"/><ellipse cx="5" cy="-5" rx="3.4" ry="4.6" fill="#1a0e24"/>
        <circle cx="-5" cy="-5" r="1" fill="#ffffff"/><circle cx="5" cy="-5" r="1" fill="#ffffff"/>
        <ellipse cy="7" rx="3.4" ry="5" fill="#1a0e24"/>
        <path d="M-19,-12 L-15,-10 M-20,-4 L-16,-4 M19,-12 L15,-10 M20,-4 L16,-4" stroke="#c8a8e8" stroke-width="1.6" stroke-linecap="round"/>`,

    // Arrows chasing round a creature turned into a sheep
    polymorph: `
        <circle r="21" fill="#e89aff" opacity="0.2"/>
        <g fill="none" stroke="#f0c8ff" stroke-width="2.2" stroke-linecap="round">
            <path d="M-17,-5 A18,18 0 0 1 8,-17"/><path d="M17,5 A18,18 0 0 1 -8,17"/>
        </g>
        <path d="M4,-21 L13,-15 L3,-12 Z" fill="#f0c8ff"/><path d="M-4,21 L-13,15 L-3,12 Z" fill="#f0c8ff"/>
        <path d="M-5,9 L-5,13 M-1,9 L-1,13 M4,9 L4,13 M8,9 L8,13" stroke="#2a2018" stroke-width="1.8" stroke-linecap="round"/>
        <g fill="#f6f2e8" stroke="#8a7a66" stroke-width="0.9">
            <circle cx="-6" cy="3" r="4.6"/><circle cx="0" cy="0" r="5"/><circle cx="6" cy="2" r="4.6"/><circle cx="-2" cy="6" r="4.4"/><circle cx="5" cy="7" r="4"/>
        </g>
        <ellipse cx="-11" cy="0" rx="3.4" ry="4.2" fill="#2a2018" transform="rotate(-20 -11 0)"/>
        <circle cx="-12" cy="-1" r="0.8" fill="#ffffff"/>`,

    // A puff of smoke, eyes in it
    attraction: `
        <circle r="21" fill="#8a7a9a" opacity="0.22"/>
        <g fill="#a8a0b0" stroke="#4a4050" stroke-width="1">
            <circle cx="-9" cy="4" r="8"/><circle cx="8" cy="3" r="8.5"/><circle cx="0" cy="-6" r="9"/><circle cx="-2" cy="9" r="7"/><circle cx="7" cy="11" r="6"/>
        </g>
        <g fill="#cfc8d8"><circle cx="-3" cy="-9" r="4"/><circle cx="7" cy="-1" r="3.4"/></g>
        <ellipse cx="-4" cy="3" rx="2.6" ry="1.6" fill="#ffd040" stroke="#6a4a08" stroke-width="0.6"/>
        <ellipse cx="5" cy="3" rx="2.6" ry="1.6" fill="#ffd040" stroke="#6a4a08" stroke-width="0.6"/>
        <path d="M-4,2 L-4,4 M5,2 L5,4" stroke="#1a1208" stroke-width="1"/>
        <g fill="none" stroke="#cfc8d8" stroke-width="1.4" stroke-linecap="round"><path d="M-17,-10 C-19,-13 -16,-16 -18,-19"/><path d="M16,-12 C18,-15 15,-17 17,-20"/></g>`,

    // A bubble round someone, a sword glancing off it
    inertialBarrier: `
        <circle r="20" fill="url(#spell-bubble)" stroke="#bfe8ff" stroke-width="1.6"/>
        <g transform="translate(0 3) scale(0.85)">${FIGURE}</g>
        <path d="M-10,-15 A17,17 0 0 1 8,-17" fill="none" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" opacity="0.8"/>
        <g transform="translate(15 -13) rotate(-135) scale(0.5)">
            <path d="M-2.4,-20 L0,-23.5 L2.4,-20 L2.4,6 L-2.4,6 Z" fill="#e3e9ee" stroke="#39434c" stroke-width="1.4"/>
            <rect x="-8" y="6" width="16" height="3" rx="1.2" fill="#c8962e" stroke="#5a3b0c" stroke-width="1.2"/>
            <rect x="-1.8" y="9" width="3.6" height="9" fill="#6b3f1d"/>
        </g>
        <path d="${star(12, -10, 5, 1.6, 6)}" fill="#fff4c0"/>`,

    // A blade raised in a red-gold fury, rising
    surge: `
        <circle r="21" fill="#ff3a1a" opacity="0.25"/>
        <path d="${star(0, 2, 20, 9, 12)}" fill="#ff8a3a" opacity="0.5"/>
        <g transform="rotate(20)">
            <path d="M-2.4,-20 L0,-23.5 L2.4,-20 L2.4,6 L-2.4,6 Z" fill="#fff0d8" stroke="#6a1a08" stroke-width="1"/>
            <rect x="-8" y="6" width="16" height="3" rx="1.2" fill="#c8962e" stroke="#5a3b0c" stroke-width="0.9"/>
            <rect x="-1.8" y="9" width="3.6" height="9" fill="#6b3f1d" stroke="#2f1a09" stroke-width="0.8"/>
            <circle cy="19.5" r="2.6" fill="#c8962e" stroke="#5a3b0c" stroke-width="0.9"/>
        </g>
        <path d="M-17,10 L-17,-2 M-20,1 L-17,-2 L-14,1 M16,16 L16,4 M13,7 L16,4 L19,7" fill="none" stroke="#ffe080" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`,

    // A white dove, an olive branch in its beak
    pacify: `
        <circle r="21" fill="#bfe8ff" opacity="0.22"/>
        <path d="M-15,4 C-12,-2 -6,-4 -1,-3 C1,-10 6,-16 14,-18 C11,-12 10,-7 8,-3 C12,-2 15,1 17,4 C12,3 9,4 7,6 C3,11 -4,13 -10,11 C-12,10 -16,12 -19,14 C-17,10 -16,7 -15,4 Z" fill="#ffffff" stroke="#6a7a8a" stroke-width="1.1" stroke-linejoin="round"/>
        <path d="M-1,-3 C2,-7 6,-11 11,-14" fill="none" stroke="#c8d0d8" stroke-width="1"/>
        <circle cx="-10" cy="1" r="1" fill="#1c2436"/>
        <path d="M-16,3 L-20,2 L-16,5 Z" fill="#e8a040"/>
        <path d="M-19,4 C-19,9 -15,13 -11,16" fill="none" stroke="#5a7a2a" stroke-width="1.3"/>
        <g fill="#7aa03a"><ellipse cx="-17" cy="9" rx="1.2" ry="2.6" transform="rotate(-40 -17 9)"/><ellipse cx="-13" cy="13" rx="1.2" ry="2.6" transform="rotate(-60 -13 13)"/><ellipse cx="-19" cy="12" rx="1.1" ry="2.2" transform="rotate(30 -19 12)"/></g>`,

    // Fangs, blood drawn from them in a stream to a heart
    vampirism: `
        <circle r="21" fill="#6a0a14" opacity="0.4"/>
        <path d="M-16,-14 C-10,-18 -2,-18 2,-14 L2,-10 C-2,-12 -10,-12 -16,-10 Z" fill="#3a0a14" stroke="#1a0206" stroke-width="1"/>
        <path d="M-12,-11 L-10,-2 L-8,-11 Z M-3,-11 L-1,-3 L1,-11 Z" fill="#f4ecd8" stroke="#6a5a4a" stroke-width="0.8"/>
        <path d="M-10,-1 C-9,4 -4,6 0,6 C6,6 6,1 10,1" fill="none" stroke="#d0141c" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="3 2"/>
        <path d="M11,16 C3,11 1,6 3,3 C5,0 9,1 11,4 C13,1 17,0 19,3 C21,6 19,11 11,16 Z" fill="url(#spell-blood)" stroke="#3a0402" stroke-width="1.1"/>
        <path d="${drop(-10, 3, 1.8)}" fill="#d0141c"/>`,

    // Someone slipping aside, a blow passing through where they were
    dodge: `
        <circle r="21" fill="#9adcff" opacity="0.18"/>
        <g fill="none" stroke="#dceeff" stroke-width="1.4" stroke-dasharray="2.6 2" opacity="0.7">
            <circle cx="-5" cy="-9" r="4.6"/><path d="M-11,15 L-10,-1 C-10,-4 -8,-5 -5,-5 C-2,-5 0,-4 0,-1 L1,15 Z"/>
        </g>
        <g transform="translate(9 1) rotate(18)">${FIGURE}</g>
        <path d="M-2,-4 L-8,-4 M-1,2 L-9,2 M0,8 L-7,8" stroke="#ffffff" stroke-width="1.4" stroke-linecap="round" opacity="0.8"/>
        <path d="M-20,-15 L2,-15" stroke="#8a6a4a" stroke-width="1.8" stroke-linecap="round"/>
        <path d="M2,-18 L8,-15 L2,-12 Z" fill="#c8ccd4"/>`,

    // A green cloud of venom with a skull in it, dripping
    poison: `
        <circle r="21" fill="#4a8a1a" opacity="0.25"/>
        <g fill="#7ac040" stroke="#1f4a10" stroke-width="1">
            <circle cx="-8" cy="-2" r="8"/><circle cx="7" cy="-3" r="8.5"/><circle cx="0" cy="-10" r="8"/><circle cx="0" cy="4" r="8"/>
        </g>
        <circle cx="-4" cy="-4" r="2.6" fill="#1f3a10"/><circle cx="4" cy="-4" r="2.6" fill="#1f3a10"/>
        <path d="M0,0 L-1.5,3 L1.5,3 Z" fill="#1f3a10"/>
        <path d="M-4,6 L4,6 M-2,6 L-2,8.5 M0,6 L0,8.5 M2,6 L2,8.5" stroke="#1f3a10" stroke-width="1.1"/>
        <g fill="#8ae04a" stroke="#1f4a10" stroke-width="0.7"><path d="${drop(-7, 17, 2)}"/><path d="${drop(6, 18, 1.7)}"/></g>`,
});
