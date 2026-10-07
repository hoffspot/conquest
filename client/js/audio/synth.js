// The game's sounds, made in code rather than recorded: a few kinds of noise and tones, shaped
// by filters and envelopes. Nothing to download, and every sound has a few variants (different
// random noise) so repeated blows and footsteps don't sound mechanical.
//
//  - Swings: noise through a band-pass filter whose pitch rises and falls, swelling to a peak
//    (PEAKS: when, so the game can time it to land with the blow). Heavier weapons are lower and
//    slower.
//  - Hits: a thump (a sine dropping in pitch) and a burst of filtered noise, with a ring of
//    inharmonic partials for blades, a knock for wood, a zap for magic, a roar for fire.
//  - The bow: a plucked string (Karplus-Strong); spells: rising chimes and a whoosh.
//  - Spells: a rising shimmer casting a heal, a warm swell as it lands; a dizzy warble for a stun.
//  - Footsteps on stone, dirt, grass, wooden boards, sand, snow, scree, mud, leaf litter and
//    through water (leather-soled: no heel's click), and creatures' (a spider's legs, a slime, a
//    serpent); a body falling; a door opening and banging shut behind someone; in the tavern,
//    tankards clinking and ale being drawn; in the smithy, the anvil ringing, the bellows, steam
//    hissing off the trough, the grindstone; in the guild, paper rustling.
//  - Cues: a target chosen, an enemy slain, falling, waking again, out of breath; the action
//    wheel opening, and a slice that can't be used.
//  - Around the town (the environment): a bird's chirp, leaves rustling, the wind (a loop); and
//    in the tavern, the hearth's fire crackling.
//
// Each sound belongs to a bus, which has its own volume: "effects" (the default) or
// "environment" (the music is music.js's). Built from dsp.js; no Web Audio (sound.js plays
// them), so they're tested in Node.

import { createRandom } from "../core/random.js";
import { add, count, filter, finish, hit, noise, pluck, shape, swell, tone } from "./dsp.js";

export { loudness, SAMPLE_RATE } from "./dsp.js";

const TAU = 2 * Math.PI;

// --- The sounds ---

// A whoosh: band-passed noise, pitched from `from` up to `top` (at `peak` of the way) and down to
// `to`, swelling with it; `body` adds the low air of something big
function whoosh(random, { length, from, top, to, peak = 0.55, q = 1.3, body = 0 }) {
    const pitch = (t) => {
        const u = t / length;

        return u < peak ? from * (top / from) ** (u / peak) : top * (to / top) ** ((u - peak) / (1 - peak));
    };
    let out = filter(noise(random, length), "bandpass", pitch, q);

    if (body) {
        out = add(out, filter(noise(random, length), "lowpass", (t) => pitch(t) * 0.35), body);
    }

    return shape(out, swell(length, peak));
}

// A thump: a sine falling from `from` to `to` Hz over `length` seconds
const thump = (from, to, length, decay = length / 4) => shape(tone(length, (t) => to + (from - to) * Math.exp(-t / (length / 3))), hit(0.002, decay));

// A thud: a thump with its second and third harmonics, so that a phone's speaker (which plays
// little under 200 to 400 Hz) still gives its weight (the ear hears the missing low note in them)
const thud = (from, to, length, decay = length / 4) => shape(tone(length, (t) => to + (from - to) * Math.exp(-t / (length / 3)), { harmonics: [[1, 1], [2, 0.5], [3, 0.3]] }), hit(0.002, decay));

// A burst of noise through a filter, shaped as a hit
const burst = (random, length, type, frequency, q, attack, decay) => shape(filter(noise(random, length), type, frequency, q), hit(attack, decay));

// Metal ringing: inharmonic partials, each fading at its own rate
function ring(partials, length) {
    let out = new Float32Array(count(length));

    for (const [frequency, level, decay] of partials) {
        out = add(out, shape(tone(length, frequency), hit(0.001, decay)), level);
    }

    return out;
}

/** When each swing is at its loudest (seconds from its start), to time it to the blow. */
export const PEAKS = {};

const swing = (settings) => {
    PEAKS[settings.name] = settings.length * (settings.peak ?? 0.55);

    return (random) => whoosh(random, settings);
};

// Softened: the loudest moments eased down (a gentle saturation, `drive` times into it), so that
// a sound of sharp clicks (a step's crunch, a spider's legs) can be made as loud as the rest
// without its peaks clipping
function softened(samples, drive = 2) {
    const loudest = samples.reduce((most, value) => Math.max(most, Math.abs(value)), 0) || 1;
    const top = Math.tanh(drive);

    return samples.map((value) => Math.tanh((drive * value) / loudest) / top);
}

// Grains: `n` tiny clicks of noise strewn over `length` seconds (bunched towards its start the
// more `bunch` is over 1), each band-passed somewhere between `low` and `high` Hz and gone in
// `decay` seconds: the crunch of snow, the rattle of scree, dry leaves crackling
function grains(random, length, n, low, high, { decay = 0.003, bunch = 1.4, q = 2 } = {}) {
    let out = new Float32Array(count(length));

    for (let k = 0; k < n; k++) {
        const grain = burst(random, decay * 5, "bandpass", low + (high - low) * random.next(), q, 0.0003, decay);

        out = add(out, grain, 0.4 + random.next() * 0.6, length * random.next() ** bunch);
    }

    return out;
}

// Bubbles: `n` short rising tones (a bubble's pitch climbs as it forms and pops) from `low` to
// `high` Hz, strewn over `length` seconds
function bubbles(random, length, n, low, high) {
    let out = new Float32Array(count(length));

    for (let k = 0; k < n; k++) {
        const from = low + (high - low) * random.next();
        const life = 0.015 + random.next() * 0.03;

        out = add(out, shape(tone(life, (t) => from * (1 + (0.5 * t) / life)), hit(0.001, life / 3)), 0.3 + random.next() * 0.5, length * random.next());
    }

    return out;
}

// A footstep: `kind` "stone", "dirt", "grass", "wood", or out in the wild "sand", "snow",
// "gravel" (scree, ash), "mud", "leaves" (leaf litter) or "water" (wading); each a heel and the
// rest of the foot rolling onto it
function step(random, kind) {
    if (kind === "snow") {
        // Snow packing down: a squeaky crunch of many small breaks, the heel's then the toe's,
        // over a soft, muffled body
        const heel = add(grains(random, 0.14, 34, 1400, 4800), burst(random, 0.12, "lowpass", 900, 0.7, 0.008, 0.04), 0.5);

        return add(add(heel, grains(random, 0.1, 20, 1600, 4200), 0.6, 0.09), thud(95, 60, 0.07, 0.02), 0.25);
    }

    if (kind === "sand") {
        // Sand giving: a dull, soft hiss with a little grit, hardly any knock
        const give = burst(random, 0.16, "lowpass", 1700, 0.7, 0.012, 0.05);

        return add(add(give, grains(random, 0.12, 10, 2200, 4200, { decay: 0.002 }), 0.25, 0.02), thud(85, 55, 0.07, 0.02), 0.25);
    }

    if (kind === "gravel") {
        // Scree and loose stones: a sharp rattle of stones knocking, a heavier knock under it
        const rattle = add(grains(random, 0.12, 26, 2400, 7000, { decay: 0.002, bunch: 1.8 }), burst(random, 0.05, "bandpass", 1400, 1.2, 0.0008, 0.014), 0.5);

        return add(add(rattle, grains(random, 0.08, 12, 2400, 6000, { decay: 0.002 }), 0.5, 0.07), thud(130, 80, 0.08, 0.018), 0.4);
    }

    if (kind === "mud") {
        // Mud: a wet slap as the foot sinks, and a suck as it pulls free
        const sink = (from, to, length) => shape(filter(noise(random, length), "bandpass", (t) => from * (to / from) ** (t / length), 2.2), swell(length, 0.2));
        const slap = add(sink(900, 260, 0.14), thud(80, 50, 0.08, 0.025), 0.5);

        return add(add(slap, sink(300, 950, 0.1), 0.45, 0.13), bubbles(random, 0.2, 3, 250, 600), 0.25, 0.05);
    }

    if (kind === "leaves") {
        // Leaf litter: dry leaves crackling and rustling under the foot, the soft ground under them
        const crackle = add(grains(random, 0.18, 30, 3000, 8000, { bunch: 1.2 }), burst(random, 0.16, "bandpass", 3600, 0.6, 0.01, 0.05), 0.4);

        return add(crackle, thud(90, 60, 0.07, 0.02), 0.2);
    }

    if (kind === "water") {
        // Wading: a splash as the foot goes in, bubbles, and the water sloshing round the leg
        const splash = burst(random, 0.2, "bandpass", 1200 + random.next() * 800, 0.6, 0.004, 0.06);
        const slosh = shape(filter(noise(random, 0.3), "lowpass", 600), swell(0.3, 0.35));

        return add(add(splash, bubbles(random, 0.28, 6, 350, 1100), 0.6, 0.02), slosh, 0.5, 0.05);
    }

    if (kind === "stone") {
        // A leather sole on stone (flat, no heel: a heel's click is centuries off): a dull pat, the
        // stone's short knock, grit scraping as the foot rolls off; now and then a cobble rocking
        const pat = add(burst(random, 0.04, "bandpass", 1700, 0.9, 0.0015, 0.01), ring([[600 + random.next() * 200, 0.5, 0.012], [1300 + random.next() * 300, 0.3, 0.008]], 0.06), 0.4);
        const scrape = shape(filter(noise(random, 0.09), "bandpass", 2400, 0.8), swell(0.09, 0.3));
        const foot = add(add(pat, thud(170, 110, 0.08, 0.02), 0.5), scrape, 0.12, 0.07);

        return random.next() < 0.3 ? add(foot, ring([[900 + random.next() * 400, 0.4, 0.008]], 0.03), 0.3, 0.01 + random.next() * 0.02) : foot;
    }

    if (kind === "wood") {
        // A hollow knock on a board, and the board's low ring under it
        const knock = add(burst(random, 0.06, "bandpass", 1100, 1.3, 0.0008, 0.016), thud(150, 100, 0.1, 0.024), 0.7);

        return add(knock, shape(tone(0.14, 190 + random.next() * 30, { harmonics: [[1, 1], [2.3, 0.35]] }), hit(0.001, 0.035)), 0.45);
    }

    if (kind === "dirt") {
        const scuff = burst(random, 0.12, "bandpass", 700, 0.8, 0.003, 0.03);
        const grit = shape(filter(noise(random, 0.1).map((value) => (random.next() < 0.01 ? value * 2 : 0)), "highpass", 2500), hit(0.002, 0.03));

        return add(add(scuff, grit, 0.4), thud(110, 70, 0.08, 0.02), 0.35);
    }

    const rustle = burst(random, 0.16, "bandpass", 2800, 0.6, 0.008, 0.04);

    return add(add(rustle, burst(random, 0.12, "bandpass", 4200, 0.7, 0.006, 0.03), 0.5, 0.04), thud(90, 60, 0.07, 0.02), 0.2);
}

// Notes one after another (a cue): [[frequency, start (s)]...], each ringing for `decay` seconds
function notes(list, { decay = 0.35, harmonics = [[1, 1], [2, 0.25], [3, 0.08]], length = 1 } = {}) {
    let out = new Float32Array(count(length));

    for (const [frequency, start] of list) {
        out = add(out, shape(tone(length - start, frequency, { harmonics }), hit(0.006, decay)), 1, start);
    }

    return out;
}

/**
 * Every sound: how many variants, how loud it plays (0 to 1) and how to make one from a random
 * number generator. Swings are named for the weapons' attack animations, hits for the attacks'
 * reactions (weapons.js), launches for the projectiles.
 */
export const SOUNDS = {
    // Swings
    swingSword: { variants: 3, volume: 0.55, make: swing({ name: "swingSword", length: 0.3, from: 700, top: 2800, to: 1100 }) },
    swingStaff: { variants: 3, volume: 0.55, make: swing({ name: "swingStaff", length: 0.36, from: 380, top: 1500, to: 600, body: 0.4 }) },
    swingHammer: { variants: 3, volume: 0.6, make: swing({ name: "swingHammer", length: 0.5, from: 220, top: 850, to: 300, q: 1, body: 0.7 }) },
    swingPunch: { variants: 3, volume: 0.4, make: swing({ name: "swingPunch", length: 0.15, from: 900, top: 2300, to: 1200, peak: 0.6 }) },
    swingCleaver: { variants: 3, volume: 0.6, make: swing({ name: "swingCleaver", length: 0.34, from: 450, top: 1900, to: 700, body: 0.35 }) },
    swingKick: { variants: 3, volume: 0.5, make: swing({ name: "swingKick", length: 0.24, from: 520, top: 1700, to: 800, body: 0.3, peak: 0.6 }) },

    // Drawing weapons and putting them away: a blade's ring as it leaves its scabbard, the
    // click of its hilt going home; something slung off the back, or back on it; fists
    // clenched, the knuckles cracking
    unsheathe: {
        variants: 2,
        volume: 0.5,
        make: (random) => add(burst(random, 0.32, "bandpass", (t) => 2600 + 9000 * t, 4, 0.02, 0.2), ring([[3150, 0.25, 0.35], [4730, 0.16, 0.28], [6920, 0.08, 0.2]], 0.6), 0.5, 0.18),
    },
    sheathe: {
        variants: 2,
        volume: 0.55,
        make: (random) => add(burst(random, 0.22, "bandpass", (t) => 6000 - 12000 * t, 4, 0.01, 0.16), add(thump(260, 150, 0.08, 0.018), burst(random, 0.02, "highpass", 2500, 0.8, 0.0005, 0.006), 0.6), 1, 0.2),
    },
    unsling: {
        variants: 2,
        volume: 0.45,
        make: (random) => add(whoosh(random, { length: 0.3, from: 320, top: 1300, to: 520, peak: 0.45, body: 0.6 }), burst(random, 0.07, "lowpass", 900, 0.8, 0.002, 0.025), 0.6, 0.02),
    },
    knuckles: {
        variants: 2,
        volume: 0.45,
        make: (random) => add(add(burst(random, 0.03, "highpass", 3000, 1, 0.0005, 0.008), burst(random, 0.03, "highpass", 2400, 1, 0.0005, 0.008), 0.9, 0.06), add(thump(160, 100, 0.12, 0.04), burst(random, 0.12, "bandpass", 700, 1.5, 0.005, 0.05), 0.8), 0.9, 0.1),
    },

    // Hits
    slash: {
        variants: 3,
        volume: 0.75,
        make: (random) => add(add(burst(random, 0.2, "highpass", 2500, 0.8, 0.001, 0.035), thump(180, 100, 0.12, 0.03), 0.8), ring([[2150, 0.12, 0.12], [3370, 0.09, 0.09], [4810, 0.06, 0.07], [6030, 0.04, 0.05]], 0.35)),
    },
    hack: {
        variants: 3,
        volume: 0.8,
        make: (random) => add(add(burst(random, 0.2, "bandpass", 1500, 0.7, 0.001, 0.04), thump(140, 70, 0.18, 0.05), 1), ring([[1720, 0.1, 0.1], [2640, 0.07, 0.08]], 0.3)),
    },
    strike: {
        variants: 3,
        volume: 0.75,
        make: (random) => add(add(shape(tone(0.12, 230, { harmonics: [[1, 1], [2.43, 0.6], [3.9, 0.3]] }), hit(0.0005, 0.025)), burst(random, 0.03, "lowpass", 2500, 0.7, 0.0005, 0.006), 0.8), thump(110, 70, 0.14, 0.04), 0.9),
    },
    crush: {
        variants: 3,
        volume: 0.9,
        make: (random) => add(add(thump(75, 38, 0.5, 0.14), burst(random, 0.35, "lowpass", 650, 0.8, 0.002, 0.08), 0.8), burst(random, 0.03, "highpass", 3000, 0.7, 0.0005, 0.006), 0.5),
    },
    // A blow caught on a shield: the boards' thud, and the boss and rim ringing
    block: {
        variants: 3,
        volume: 0.85,
        make: (random) => add(add(thump(115, 60, 0.26, 0.07), burst(random, 0.16, "lowpass", 900, 0.8, 0.001, 0.035), 0.8), ring([[880, 0.16, 0.16], [1390, 0.11, 0.12], [2210, 0.07, 0.08]], 0.4)),
    },
    pierce: {
        variants: 3,
        volume: 0.7,
        make: (random) => add(burst(random, 0.08, "bandpass", 950, 1.2, 0.0008, 0.018), thump(200, 120, 0.12, 0.03), 0.9),
    },
    punch: {
        variants: 3,
        volume: 0.7,
        make: (random) => add(add(burst(random, 0.12, "lowpass", 1200, 0.8, 0.001, 0.03), thump(130, 80, 0.1, 0.03), 1), burst(random, 0.02, "highpass", 3500, 0.7, 0.0005, 0.004), 0.5),
    },
    // A spiked boot: a heavy thud into the body, a crack of leather and the spikes biting
    kick: {
        variants: 3,
        volume: 0.8,
        make: (random) => add(add(thump(95, 50, 0.2, 0.05), burst(random, 0.14, "lowpass", 900, 0.8, 0.001, 0.04), 0.9), burst(random, 0.03, "highpass", 2800, 0.7, 0.0005, 0.007), 0.6),
    },
    arcane: {
        variants: 3,
        volume: 0.6,
        make: (random) => add(shape(tone(0.4, (t) => 250 + 950 * Math.exp(-t / 0.08), { fm: [1.51, 2.2], harmonics: [[1, 1], [2, 0.3]] }), hit(0.003, 0.09)), burst(random, 0.3, "highpass", 5000, 0.7, 0.002, 0.06), 0.3),
    },
    fire: {
        variants: 3,
        volume: 0.9,
        make: (random) => {
            const roar = burst(random, 0.8, "lowpass", (t) => 3200 * Math.exp(-t / 0.18) + 250, 0.8, 0.01, 0.2);
            const crackle = shape(filter(noise(random, 0.7).map((value) => (random.next() < 0.004 ? value * 2.5 : 0)), "highpass", 1800), hit(0.01, 0.2));

            return add(add(roar, crackle, 0.4), thump(80, 45, 0.4, 0.1), 0.7);
        },
    },

    // Launches
    arrow: {
        variants: 3,
        volume: 0.6,
        make: (random) => add(add(shape(pluck(random, 118 + random.next() * 12, 0.45, 0.994), hit(0.001, 0.09)), burst(random, 0.02, "bandpass", 1800, 1, 0.0005, 0.005), 0.8), whoosh(random, { length: 0.14, from: 2000, top: 4200, to: 3000, peak: 0.3 }), 0.25, 0.02),
    },
    bolt: {
        variants: 3,
        volume: 0.5,
        make: (random) => add(shape(tone(0.28, (t) => 520 * 2 ** (t / 0.1), { harmonics: [[1, 1], [1.5, 0.4], [2, 0.3]] }), swell(0.28, 0.4)), burst(random, 0.25, "highpass", 6000, 0.7, 0.02, 0.06), 0.25),
    },
    fireball: {
        variants: 3,
        volume: 0.6,
        make: (random) => add(whoosh(random, { length: 0.45, from: 250, top: 2200, to: 400, peak: 0.35, q: 0.8, body: 0.8 }), thump(90, 55, 0.35, 0.12), 0.4),
    },

    // Footsteps
    stepStone: { variants: 4, volume: 0.3, make: (random) => softened(step(random, "stone")) },
    stepDirt: { variants: 4, volume: 0.32, make: (random) => softened(step(random, "dirt")) },
    stepGrass: { variants: 4, volume: 0.28, make: (random) => softened(step(random, "grass")) },
    stepWood: { variants: 4, volume: 0.32, make: (random) => softened(step(random, "wood")) },
    stepSand: { variants: 4, volume: 0.26, make: (random) => softened(step(random, "sand")) },
    stepSnow: { variants: 4, volume: 0.3, make: (random) => softened(step(random, "snow")) },
    stepGravel: { variants: 4, volume: 0.3, make: (random) => softened(step(random, "gravel")) },
    stepMud: { variants: 4, volume: 0.32, make: (random) => softened(step(random, "mud")) },
    stepLeaves: { variants: 4, volume: 0.28, make: (random) => softened(step(random, "leaves")) },
    stepWater: { variants: 4, volume: 0.34, make: (random) => softened(step(random, "water")) },

    // Creatures' footfalls: a spider's many legs ticking down one after another; a slime's wet
    // belly flopping along; a serpent's scales sliding over the ground
    skitter: {
        variants: 3,
        volume: 0.26,
        make: (random) => {
            let out = new Float32Array(count(0.1));

            for (let leg = 0; leg < 4; leg++) {
                out = add(out, burst(random, 0.02, "bandpass", 2500 + random.next() * 1800, 1.6, 0.0004, 0.004), 0.6 + random.next() * 0.4, leg * (0.015 + random.next() * 0.012));
            }

            return softened(out, 4);
        },
    },
    squelch: {
        variants: 3,
        volume: 0.32,
        make: (random) => add(shape(filter(noise(random, 0.28), "bandpass", (t) => 700 * (200 / 700) ** (t / 0.28), 2), swell(0.28, 0.25)), bubbles(random, 0.3, 5, 180, 520), 0.5, 0.04),
    },
    slither: {
        variants: 3,
        volume: 0.24,
        make: (random) => add(shape(filter(noise(random, 0.4), "bandpass", 2600, 0.9), swell(0.4, 0.5)), shape(filter(noise(random, 0.4), "lowpass", 300), swell(0.4, 0.5)), 0.5),
    },

    // A door: the latch lifting, its hinges creaking as it swings, and it banging shut
    door: {
        variants: 2,
        volume: 0.55,
        make: (random) => {
            const latch = add(burst(random, 0.03, "highpass", 3500, 0.8, 0.0005, 0.006), burst(random, 0.03, "bandpass", 1800, 2, 0.0005, 0.01), 0.8, 0.05);
            const creak = shape(filter(tone(0.45, (t) => 300 + 170 * t + 35 * Math.sin(TAU * 9 * t), { fm: [1.51, 0.8], harmonics: [[1, 1], [2, 0.5], [3, 0.3]] }), "bandpass", 900, 1.2), swell(0.45, 0.35));
            const shut = add(thump(95, 50, 0.35, 0.08), burst(random, 0.12, "lowpass", 700, 0.8, 0.001, 0.03), 0.7);

            return add(add(latch, creak, 0.3, 0.08), shut, 0.9, 0.62);
        },
    },

    // A body hitting the ground, and its gear after it
    fall: {
        variants: 2,
        volume: 0.8,
        make: (random) => add(add(thump(80, 42, 0.4, 0.1), burst(random, 0.3, "lowpass", 500, 0.8, 0.003, 0.07), 0.9), add(thump(95, 60, 0.25, 0.05), burst(random, 0.2, "lowpass", 800, 0.8, 0.002, 0.04), 0.7), 0.5, 0.18),
    },

    // Spells: a rising shimmer as a heal is cast, a warm swell as it lands; a dizzy warble for a stun
    castHeal: {
        variants: 2,
        volume: 0.45,
        make: (random) => {
            let out = shape(filter(noise(random, 0.7), "highpass", 5000), swell(0.7, 0.7));

            [880, 1109, 1319, 1760].forEach((frequency, k) => {
                out = add(out, shape(tone(0.6, frequency, { harmonics: [[1, 1], [2.76, 0.15]] }), hit(0.01, 0.25)), 0.5, k * 0.1);
            });

            return out;
        },
    },
    healed: {
        variants: 1,
        volume: 0.5,
        make: () => {
            let out = new Float32Array(count(1.3));

            for (const frequency of [587, 740, 880, 1175]) {
                out = add(out, shape(tone(1.3, frequency, { harmonics: [[1, 1], [2, 0.2]] }), swell(1.3, 0.25)), 0.5);
            }

            return out;
        },
    },
    stun: {
        variants: 2,
        volume: 0.6,
        make: (random) => {
            const zap = shape(tone(0.25, (t) => 300 + 1200 * Math.exp(-t / 0.05), { fm: [2.01, 1.5] }), hit(0.002, 0.07));
            const warble = shape(tone(0.9, (t) => 520 + 90 * Math.sin(TAU * 7 * t) - 120 * t, { harmonics: [[1, 1], [3, 0.2]] }), swell(0.9, 0.2));

            return add(add(zap, warble, 0.6, 0.08), burst(random, 0.2, "highpass", 4500, 0.7, 0.001, 0.05), 0.4);
        },
    },

    // The action wheel: opening, and a slice that can't be used
    wheel: { variants: 1, volume: 0.3, make: (random) => add(whoosh(random, { length: 0.16, from: 1500, top: 4200, to: 2500, peak: 0.6 }), notes([[1320, 0.06]], { decay: 0.04, length: 0.16 }), 0.4) },
    denied: { variants: 1, volume: 0.35, make: () => notes([[233, 0], [196, 0.09]], { decay: 0.06, harmonics: [[1, 1], [3, 0.3], [5, 0.12]], length: 0.3 }) },

    // Cues
    lock: { variants: 1, volume: 0.35, make: () => notes([[740, 0], [1110, 0.07]], { decay: 0.06, length: 0.3 }) },
    slain: { variants: 1, volume: 0.4, make: () => notes([[523, 0], [659, 0.09], [784, 0.18], [1047, 0.27]], { decay: 0.35, length: 1.2 }) },
    fallen: { variants: 1, volume: 0.4, make: () => notes([[392, 0], [311, 0.24], [262, 0.48]], { decay: 0.6, harmonics: [[1, 1], [2, 0.12]], length: 1.8 }) },
    // A few coins chinking together (something found on a creature)
    coins: {
        variants: 2,
        volume: 0.3,
        make: (random) => notes([0, 0.05, 0.11, 0.16].map((at) => [2400 + random.next() * 1600, at + random.next() * 0.02]), { decay: 0.08, harmonics: [[1, 1], [2.4, 0.4], [3.9, 0.2]], length: 0.5 }),
    },
    wake: { variants: 1, volume: 0.35, make: () => notes([[880, 0], [1320, 0.12]], { decay: 0.7, harmonics: [[1, 1], [2.76, 0.2], [5.4, 0.06]], length: 1.6 }) },
    breath: {
        variants: 2,
        volume: 0.35,
        make: (random) => {
            const out = (offset) => shape(add(filter(noise(random, 0.4), "bandpass", 1100, 1.4), filter(noise(random, 0.4), "bandpass", 2400, 2), 0.5), swell(0.4, 0.25 + offset));

            return add(out(0), out(0.05), 0.7, 0.45);
        },
    },

    // Around the town (the environment's bus): birds, and leaves rustling in a tree
    bird: {
        variants: 4,
        volume: 0.4,
        bus: "environment",
        make: (random) => {
            const pitch = 3400 + random.next() * 1800;
            const chirps = 2 + Math.floor(random.next() * 3);
            let out = new Float32Array(1);

            for (let k = 0; k < chirps; k++) {
                const length = 0.05 + random.next() * 0.04;
                const start = pitch * (0.9 + random.next() * 0.2);

                out = add(out, shape(tone(length, (t) => start * (1 - 0.4 * (t / length)), { fm: [0.25, 0.6] }), swell(length, 0.2)), 1, k * (0.09 + random.next() * 0.05));
            }

            return out;
        },
    },
    // Pewter tankards knocked together in a toast (or one set down): a dull ring and a knock
    clink: {
        variants: 3,
        volume: 0.35,
        make: (random) => {
            const pitch = 0.92 + random.next() * 0.16;

            return add(ring([[1480 * pitch, 0.5, 0.05], [2310 * pitch, 0.35, 0.035], [3690 * pitch, 0.18, 0.02]], 0.3), burst(random, 0.04, "bandpass", 900, 1, 0.0005, 0.01), 0.6);
        },
    },

    // Ale drawn from a barrel's tap into a tankard: a gurgling splash, rising as it fills
    pour: {
        variants: 2,
        volume: 0.3,
        make: (random) => {
            const length = 1.3;
            const flow = filter(noise(random, length), "bandpass", (t) => 700 + 500 * (t / length), 1.4);
            const gurgle = filter(noise(random, length), "lowpass", 9);
            let most = 0;

            for (const value of gurgle) {
                most = Math.max(most, Math.abs(value));
            }

            return shape(flow.map((value, n) => value * (0.55 + (0.45 * Math.abs(gurgle[n])) / most)), swell(length, 0.15));
        },
    },

    // The smithy: a hammer on hot iron on the anvil (a bright ring over a dull knock); the work
    // quenched in the trough (a hiss of steam, dying away); the bellows' breath; the grindstone
    // cranked round (a rasp, rising and falling as it turns)
    anvil: {
        variants: 3,
        volume: 0.45,
        make: (random) => {
            const pitch = 0.94 + random.next() * 0.12;

            return add(ring([[1120 * pitch, 0.55, 0.16], [2750 * pitch, 0.4, 0.09], [4230 * pitch, 0.22, 0.05], [6100 * pitch, 0.1, 0.03]], 0.7), burst(random, 0.06, "lowpass", 700, 0.8, 0.0005, 0.02), 0.8);
        },
    },
    hiss: {
        variants: 2,
        volume: 0.35,
        make: (random) => {
            const length = 1.4;

            return shape(filter(noise(random, length), "highpass", (t) => 2600 + 1800 * (t / length), 0.7), hit(0.02, 0.45));
        },
    },
    bellows: { variants: 2, volume: 0.3, make: (random) => whoosh(random, { length: 0.7, from: 180, top: 520, to: 220, peak: 0.35, q: 0.8, body: 0.6 }) },
    grind: {
        variants: 2,
        volume: 0.28,
        make: (random) => {
            const length = 1.4;
            const rasp = filter(noise(random, length), "bandpass", (t) => 3200 + 900 * Math.sin((t / length) * Math.PI * 3), 2.5);
            const rate = rasp.length / length;

            return shape(rasp.map((value, n) => value * (0.6 + 0.4 * Math.sin((n / rate) * TAU * 3))), swell(length, 0.5));
        },
    },
    // Paper: a notice taken down or filed, a page turned (a few dry crinkles)
    rustle: {
        variants: 3,
        volume: 0.35,
        make: (random) => {
            const length = 0.5;
            const grains = Array.from({ length: 5 }, () => random.next() * length * 0.85);

            return shape(filter(noise(random, length), "bandpass", (t) => 3600 + 1800 * (t / length), 1.1), (t) => grains.reduce((most, at) => Math.max(most, Math.exp(-Math.abs(t - at) * 55)), 0.12) * swell(length, 0.25)(t));
        },
    },

    // The hearth's fire: a few pops and snaps over the soft rush of the flames
    crackle: {
        variants: 4,
        volume: 0.3,
        bus: "environment",
        make: (random) => {
            const length = 0.5 + random.next() * 0.3;
            let out = shape(filter(noise(random, length), "lowpass", 900), swell(length, 0.4));

            for (let k = 0, pops = 2 + Math.floor(random.next() * 4); k < pops; k++) {
                out = add(out, burst(random, 0.03, "highpass", 1800 + random.next() * 2500, 0.8, 0.0004, 0.004 + random.next() * 0.006), 0.3 + random.next() * 0.35, random.next() * (length - 0.05));
            }

            // (Its peaks rounded off a little, so it's as loud as the others without clipping)
            const most = out.reduce((top, value) => Math.max(top, Math.abs(value)), 0);

            return out.map((value) => Math.tanh((2.5 * value) / most));
        },
    },
    leaves: {
        variants: 3,
        volume: 0.4,
        bus: "environment",
        make: (random) => {
            const length = 1.6 + random.next() * 0.8;
            const hiss = filter(filter(noise(random, length), "highpass", 1600), "lowpass", 7000);
            const flutter = filter(noise(random, length), "lowpass", 14);
            let most = 0;

            for (const value of flutter) {
                most = Math.max(most, Math.abs(value));
            }

            const whole = swell(length, 0.4);

            return shape(hiss.map((value, n) => value * (0.25 + (0.75 * Math.abs(flutter[n])) / most)), whole);
        },
    },
};

/** The wind: ten seconds of gusting, low noise, which loops without a seam. */
export function wind(seed = 1) {
    const random = createRandom(seed);
    const loop = 10;
    const overlap = 1;
    const raw = add(filter(noise(random, loop + overlap), "lowpass", 380), filter(noise(random, loop + overlap), "bandpass", 700, 0.5), 0.35);
    const gusts = (t) => 0.55 + 0.25 * Math.sin((TAU * t) / 10) + 0.15 * Math.sin((TAU * 2 * t) / 10 + 1.3) + 0.08 * Math.sin((TAU * 3 * t) / 10 + 2.1);
    const out = new Float32Array(count(loop));
    const fade = count(overlap);

    shape(raw, gusts);

    for (let n = 0; n < out.length; n++) {
        out[n] = raw[n];
    }

    // Blend the extra second over the start, so the end runs into it
    for (let n = 0; n < fade; n++) {
        const share = n / fade;

        out[n] = raw[n] * share + raw[out.length + n] * (1 - share);
    }

    let loudest = 0;

    for (const value of out) {
        loudest = Math.max(loudest, Math.abs(value));
    }

    return out.map((value) => (value / loudest) * 0.8);
}

/** Make variant `variant` of a sound. */
export function render(name, variant = 0) {
    const sound = SOUNDS[name];
    let seed = 7;

    for (const letter of name) {
        seed = Math.imul(seed, 31) + letter.charCodeAt(0);
    }

    return finish(sound.make(createRandom((seed ^ Math.imul(variant + 1, 2654435761)) >>> 0)));
}
