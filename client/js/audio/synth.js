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
//  - War: great horns blown, an invasion's raiders' (low and long) and a town's (a bright call).
//
// Each sound belongs to a bus, which has its own volume: "effects" (the default) or
// "environment" (the music is music.js's). Built from dsp.js; no Web Audio (sound.js plays
// them), so they're tested in Node.

import { createRandom } from "../core/random.js";
import { add, count, filter, finish, hit, noise, pluck, SAMPLE_RATE, shape, swell, tone } from "./dsp.js";

export { LEVEL, loudness, SAMPLE_RATE } from "./dsp.js";

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

// A patter of tiny hard things: `rate` clicks a second at random (as many as `density(t)`, 0 to 1,
// says), each as loud as it happens to be, rung through a band-pass at `frequency`
function patter(random, length, rate, frequency, q, density = () => 1) {
    const out = new Float32Array(count(length));

    for (let n = 0; n < out.length; n++) {
        if (random.next() < (rate * density(n / SAMPLE_RATE)) / SAMPLE_RATE) {
            out[n] = (random.next() < 0.5 ? -1 : 1) * (0.25 + 0.75 * random.next() ** 2);
        }
    }

    return filter(out, "bandpass", frequency, q);
}

// Its peaks rounded off (the harder the more `drive`), so a sound of sharp clicks is as loud as
// the others without clipping
function rounded(samples, drive) {
    const most = samples.reduce((top, value) => Math.max(top, Math.abs(value)), 0);

    return samples.map((value) => Math.tanh((drive * value) / most));
}

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

// A blast (a bomb bursting, the Explosion spell: docs/MAGIC.md), `size` times a goblin bomb's, in
// layers as sound designers build one, each doing one thing: a crack at its front (the shock, a
// few milliseconds); a thud falling from 110 to 38 Hz for its weight (with its harmonics, so a
// phone's speaker gives it too); a boom of noise low-passed from bright down to dull, the bulk of
// it; a roar in the middle, which a phone plays; earth and stones pattering down after it; for a
// big one, its echoes coming back off the land round it, duller; all of it softened, so it's as
// loud as can be without clipping
function blast(random, size) {
    const length = 1.05 * size;
    const crack = burst(random, 0.08, "highpass", 1800, 0.7, 0.0005, 0.012);
    const body = thud(110, 38, 0.5 * size, 0.16 * size);
    const boom = shape(filter(noise(random, length), "lowpass", (t) => 120 + 2600 * Math.exp(-t / (0.13 * size)), 0.9), hit(0.004, 0.42 * size));
    const roar = shape(filter(noise(random, length), "bandpass", (t) => 250 + 900 * Math.exp(-t / 0.3), 0.8), hit(0.01, 0.25 * size));
    const debris = grains(random, length * 0.85, Math.round(24 * size), 1500, 6000, { decay: 0.004, bunch: 1.8 });
    let out = add(add(add(crack, body), boom, 0.9), roar, 0.5);

    out = add(out, debris, 0.25, 0.06 + random.next() * 0.04);

    if (size > 1.2) {
        const echo = filter(out, "lowpass", 1300);

        for (let k = 0; k < 3; k++) {
            out = add(out, echo, 0.3 * 0.55 ** k, 0.06 + k * 0.05 + random.next() * 0.03);
        }
    }

    return softened(out, 2.6);
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

// A glass bell's partials (a struck bell's are out of tune with each other: 2.76 and 5.4 times)
const GLASS = [
    [1, 1],
    [2.76, 0.25],
    [5.4, 0.08],
];

// A horn's buzz: a stack of harmonics, as a brass instrument's (a phone's speaker, which plays
// little under 200 Hz, gives a low note's weight in them: the ear hears the missing low note)
const BRASS = [
    [1, 1],
    [2, 0.8],
    [3, 0.6],
    [4, 0.45],
    [5, 0.32],
    [6, 0.22],
    [7, 0.15],
    [8, 0.1],
    [9, 0.06],
];

// Blasts on a great horn, one after another, `gap` seconds apart: [[frequency, seconds, fall (how
// far down it falls as it dies away: 0 not at all)]...]. Each a horn's buzz, the lips bending up
// into the note, wavering a little, its brassy top opening as it swells and closing as it dies,
// breath hissing through it
function horn(random, blasts, { gap = 0.18 } = {}) {
    let out = new Float32Array(1);
    let at = 0;

    for (const [frequency, length, fall = 0] of blasts) {
        const [attack, release] = [0.16, Math.min(0.5, length / 3)];
        const level = (t) => (t < attack ? (t / attack) ** 1.5 : Math.min(1, Math.max(0, (length - t) / release)));
        const dying = (t) => Math.max(0, (t - (length - release * 1.6)) / (release * 1.6)) ** 2;
        const pitch = (t) => frequency * (1 - 0.06 * Math.exp(-t / 0.07)) * (1 + 0.006 * Math.sin(TAU * 4.5 * t)) * (1 - fall * dying(t));
        const buzz = filter(tone(length, pitch, { harmonics: BRASS }), "lowpass", (t) => frequency * (2.5 + 6 * level(t)), 0.9);
        const breath = filter(noise(random, length), "bandpass", frequency * 12, 0.8);

        out = add(out, shape(add(buzz, breath, 0.05), level), 1, at);
        at += length + gap;
    }

    return out;
}

// Drums far off: a big drum's beats ([[start (s), loudness]...], over `length` seconds), each a
// skin's boom (a sine falling from 95 to 52 Hz) with a slap of low noise as the stick lands
function drums(random, beats, length) {
    let out = new Float32Array(count(length));

    for (const [start, loud] of beats) {
        const boom = shape(tone(0.8, (t) => 52 + 43 * Math.exp(-t / 0.05)), hit(0.004, 0.3));
        const slap = shape(filter(noise(random, 0.12), "lowpass", 380, 0.8), hit(0.002, 0.05));

        out = add(out, add(boom, slap, 0.35), loud, start);
    }

    return out;
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
    // (A greatsword's cut: a longer, lower slash; a battle axe's chop: deeper than a hack, more thud)
    cleave: {
        variants: 3,
        volume: 0.8,
        make: (random) => add(add(burst(random, 0.25, "highpass", 1800, 0.8, 0.001, 0.05), thump(150, 85, 0.16, 0.04), 0.9), ring([[1850, 0.14, 0.12], [2900, 0.1, 0.09], [4200, 0.06, 0.07]], 0.35)),
    },
    chop: {
        variants: 3,
        volume: 0.85,
        make: (random) => add(add(burst(random, 0.22, "bandpass", 1100, 0.7, 0.001, 0.05), thump(110, 55, 0.22, 0.06), 1.1), ring([[1400, 0.09, 0.1], [2200, 0.06, 0.08]], 0.25)),
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
    // (A bomb lobbed, underarm or over: a short low whoosh, loudest as it's let go)
    bombThrow: { variants: 3, volume: 0.5, make: swing({ name: "bombThrow", length: 0.38, from: 260, top: 1100, to: 420, peak: 0.4, q: 0.9, body: 0.6 }) },

    // Blasts (blast): a goblin bomb's, and the Explosion spell's (and the Goblin King's bigger
    // bomb's), its echoes coming back; and a bomb's wick, lit: struck, then fizzing and
    // sputtering (hiss band-passed high, fluttering, and crackling), cut short as it bursts
    explosionSmall: { variants: 4, volume: 0.9, make: (random) => blast(random, 0.9 + random.next() * 0.2) },
    explosionLarge: { variants: 4, volume: 1, make: (random) => blast(random, 1.4 + random.next() * 0.2) },
    fuse: {
        variants: 3,
        volume: 0.3,
        make: (random) => {
            const length = 1.8;
            const flutter = 8 + random.next() * 6;
            const strike = burst(random, 0.06, "highpass", 3000, 0.7, 0.001, 0.015);
            const hissing = shape(filter(noise(random, length), "bandpass", 3800, 1.6), (t) => Math.min(1, t / 0.05) * (0.7 + 0.3 * Math.sin(TAU * flutter * t)));
            const sputter = grains(random, length, 63, 2500, 7000, { decay: 0.002, bunch: 1 });

            return add(add(hissing, sputter, 0.5), strike, 0.8);
        },
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
    // Casting Explosion: heat drawn in, rising (noise band-passed from 250 Hz up to 3.2 kHz,
    // a tone climbing two octaves under it), crackling thicker and thicker, and a breath held a
    // moment before it's let go: loudest at its release (PEAKS)
    castExplosion: {
        variants: 3,
        volume: 0.6,
        make: (random) => {
            const length = 1.4;
            const release = length * 0.94;
            const rising = shape(filter(noise(random, length), "bandpass", (t) => 250 * (3200 / 250) ** (t / length), 1.1), swell(length, 0.94));
            const climbing = shape(tone(length, (t) => 70 * 4 ** (t / length), { fm: [1.5, 1.2], harmonics: [[1, 1], [2, 0.4]] }), swell(length, 0.94));
            const crackling = grains(random, length, 50, 1500, 5000, { decay: 0.003, bunch: 0.5 });

            return shape(add(add(rising, climbing, 0.5), crackling, 0.3), (t) => (t > release - 0.06 && t < release - 0.01 ? 0.4 : 1));
        },
    },
    // Casting Prismatic Destruction: the four elements drawn in, a tone for each climbing an
    // octave together, a shimmer over them and a low drone under them, the sky going dark, swelling
    // to its release (PEAKS); at the last, all of it drawn in, a rush of air sucked to a point
    castPrismatic: {
        variants: 2,
        volume: 0.55,
        make: (random) => {
            const length = 1.5;
            const release = length * 0.94;
            const drawn = (t) => Math.min(1, Math.max(0, (t - 1.05) / (release - 1.05)) ** 2);
            let out = shape(filter(noise(random, length), "bandpass", (t) => 400 * (6000 / 400) ** (t / length), 1.2), swell(length, 0.94));

            for (const from of [131, 196, 262, 392]) {
                out = add(out, shape(tone(length, (t) => from * 2 ** (t / length), { harmonics: GLASS }), swell(length, 0.94)), 0.3);
            }

            out = add(out, shape(tone(length, (t) => 55 * 1.5 ** (t / length), { harmonics: [[1, 1], [2, 0.5], [3, 0.25]] }), swell(length, 0.94)), 0.35);
            out = add(out, shape(filter(noise(random, length), "lowpass", (t) => 300 + 7000 * drawn(t), 0.9), (t) => drawn(t) * (t > release ? Math.max(0, 1 - (t - release) / 0.08) : 1)), 0.5);

            return out;
        },
    },
    // (A piece of the sigil spent on its element's Prismatic spell: a glass chord rolled up over
    // the element's greatest landing, played with it: sound.js landed)
    prismaticChord: { variants: 1, volume: 0.5, make: () => notes([[523, 0], [784, 0.035], [1047, 0.07], [1319, 0.105], [1568, 0.14]], { decay: 0.95, harmonics: GLASS, length: 1.9 }) },
    // Prismatic Destruction landing: the beam striking out of the sky (a crack, and a bright glass
    // tone falling), the greatest blast there is as the sky whitens, echoing; each element after
    // it in its quarter, one after another (fire's roar, earth's thud, air's crack, water's ice
    // ringing); and a glass chord from C ringing over it all
    prismaticBlast: {
        variants: 2,
        volume: 1,
        make: (random) => {
            const beam = add(burst(random, 0.1, "highpass", 2500, 0.7, 0.0005, 0.02), shape(tone(0.35, (t) => 2400 * 0.15 ** (t / 0.35), { harmonics: GLASS }), hit(0.002, 0.12)), 0.4);
            let out = add(beam, blast(random, 1.55), 1.25, 0.12);

            out = add(out, shape(filter(noise(random, 0.45), "bandpass", (t) => 300 + 900 * (t / 0.45), 0.9), swell(0.45, 0.3)), 0.35, 0.2);
            out = add(out, thud(85, 32, 0.4, 0.1), 0.5, 0.32);
            out = add(out, burst(random, 0.12, "highpass", 3000, 0.7, 0.0005, 0.015), 0.4, 0.44);
            out = add(out, notes([[2093, 0], [2637, 0.03], [3136, 0.06]], { decay: 0.4, harmonics: GLASS, length: 0.8 }), 0.12, 0.56);

            return add(out, notes([[262, 0.02], [523, 0.05], [784, 0.08], [1047, 0.11], [1568, 0.14]], { decay: 0.95, harmonics: GLASS, length: 1.7 }), 0.35, 0.14);
        },
    },
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
    // The Prismatic sigil (docs/MAGIC.md): a glass bell struck for each spell of a chain (played
    // higher as it climbs: app/game.js), a run of them for a piece of the sigil, a run up two
    // octaves and a shimmer for the sigil whole, and the bells falling for it all lost
    chainStep: { variants: 1, volume: 0.32, make: () => notes([[1319, 0], [1976, 0.045]], { decay: 0.45, harmonics: GLASS, length: 0.9 }) },
    sigilPiece: { variants: 1, volume: 0.4, make: () => notes([[784, 0], [988, 0.07], [1175, 0.14], [1568, 0.21]], { decay: 0.8, harmonics: GLASS, length: 1.8 }) },
    sigilWhole: {
        variants: 1,
        volume: 0.45,
        make: (random) =>
            add(
                notes([523, 659, 784, 1047, 1319, 1568, 2093].map((frequency, k) => [frequency, k * 0.06]), { decay: 0.8, harmonics: GLASS, length: 1.9 }),
                shape(filter(noise(random, 1.9), "highpass", 5000), swell(1.9, 0.3)),
                0.25,
            ),
    },
    chainBroken: { variants: 1, volume: 0.35, make: (random) => add(notes([[1175, 0], [880, 0.08], [622, 0.16]], { decay: 0.3, harmonics: GLASS, length: 0.9 }), burst(random, 0.15, "highpass", 3000, 0.7, 0.002, 0.05), 0.3) },
    wake: { variants: 1, volume: 0.35, make: () => notes([[880, 0], [1320, 0.12]], { decay: 0.7, harmonics: [[1, 1], [2.76, 0.2], [5.4, 0.06]], length: 1.6 }) },
    breath: {
        variants: 2,
        volume: 0.35,
        make: (random) => {
            const out = (offset) => shape(add(filter(noise(random, 0.4), "bandpass", 1100, 1.4), filter(noise(random, 0.4), "bandpass", 2400, 2), 0.5), swell(0.4, 0.25 + offset));

            return add(out(0), out(0.05), 0.7, 0.45);
        },
    },

    // War: an invasion's raiders' war horn, a long, low blast (the G under the bass clef: blown
    // twice as they come, app/game.js HORNS), and as they break and run, a short one and a long one
    // falling away; a town's horn, answering them as its soldiers march out, a bright call up a
    // fourth and a fifth (and for one its lord thanks)
    warHorn: { variants: 2, volume: 0.7, make: (random) => horn(random, [[98, 1.85, 0.03]]) },
    // (And the wild's folk drumming as they come for a player after a long calm: core/director.js
    // PACING; a rolling beat, the last three quicker)
    warDrums: { variants: 2, volume: 0.7, make: (random) => drums(random, [[0, 1], [0.55, 0.65], [1.1, 1], [1.65, 0.65], [2.2, 1], [2.47, 0.8], [2.74, 1]], 3.6) },
    retreatHorn: { variants: 1, volume: 0.6, make: (random) => horn(random, [[110, 0.45], [98, 1.35, 0.3]], { gap: 0.1 }) },
    townHorn: { variants: 1, volume: 0.6, make: (random) => horn(random, [[196, 0.3], [262, 0.3], [392, 1.15, 0.02]], { gap: 0.07 }) },

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
    // An ants' nest's: soil trickling from its roof to the floor (world/trickles.js), a dry patter of
    // grains thickening and thinning over a soft sandy hiss, a clod or two landing among them; and
    // its colony heard at work in the earth round about, thousands of feet scrabbling, slowed and
    // deepened as a giant's would be, swelling and dying away (one after another, overlapping:
    // sound.js setAmbience's `murmur`)
    soilTrickle: {
        variants: 2,
        volume: 0.32,
        bus: "environment",
        make: (random) => {
            const length = 1.5 + random.next() * 0.35;
            const phase = random.next() * TAU;
            const flow = (t) => Math.min(1, t / 0.12) * Math.min(1, (length - t) / 0.6) * (0.75 + 0.25 * Math.sin(t * 9 + phase));
            const grains = patter(random, length, 320, 3600, 1.3, flow);
            const fine = patter(random, length, 1400, 6800, 0.9, flow);
            const hiss = shape(filter(filter(noise(random, length), "highpass", 2400), "lowpass", 8000), flow);
            let out = add(add(grains, fine, 0.4), hiss, 0.04);

            for (let k = 0, clods = 1 + Math.floor(random.next() * 3); k < clods; k++) {
                out = add(out, burst(random, 0.06, "bandpass", 450 + random.next() * 450, 1.2, 0.0008, 0.012), 0.35 + random.next() * 0.3, 0.15 + random.next() * (length - 0.8));
            }

            return rounded(out, 4);
        },
    },
    colonyRustle: {
        variants: 3,
        volume: 0.2,
        bus: "environment",
        make: (random) => {
            const length = 1.6 + random.next() * 0.3;
            const [a, b] = [random.next() * TAU, random.next() * TAU];
            const swells = (t) => Math.sin((Math.PI * t) / length) ** 1.5 * (0.65 + 0.2 * Math.sin(t * 3.1 + a) + 0.15 * Math.sin(t * 7.3 + b));
            const feet = patter(random, length, 900, 1300, 1.1, swells);
            const nearer = patter(random, length, 70, 2400, 1.5, swells);
            const mass = shape(filter(filter(noise(random, length), "lowpass", 520), "highpass", 120), swells);

            return rounded(add(add(feet, nearer, 0.7), mass, 0.04), 4);
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

// (Casting Explosion loudest as it's let go: its swell's peak)
PEAKS.castExplosion = 1.4 * 0.94;
PEAKS.castPrismatic = 1.5 * 0.94;

/** The wind: ten seconds of gusting, low noise, which loops without a seam. */
export function wind(seed = 1) {
    const random = createRandom(seed);
    const loop = 10;
    const overlap = 1;
    const raw = add(filter(noise(random, loop + overlap), "lowpass", 380), filter(noise(random, loop + overlap), "bandpass", 700, 0.5), 0.35);
    const gusts = (t) => 0.55 + 0.25 * Math.sin((TAU * t) / 10) + 0.15 * Math.sin((TAU * 2 * t) / 10 + 1.3) + 0.08 * Math.sin((TAU * 3 * t) / 10 + 2.1);

    shape(raw, gusts);

    return loudestAt(seamless(raw, loop), 0.8);
}

// A loop `loop` seconds long from `raw` (that and a little more): the extra blended over its start,
// so its end runs into it
function seamless(raw, loop) {
    const out = raw.slice(0, count(loop));
    const fade = raw.length - out.length;

    for (let n = 0; n < fade; n++) {
        const share = n / fade;

        out[n] = raw[n] * share + raw[out.length + n] * (1 - share);
    }

    return out;
}

// Scaled so its loudest sample is `peak`
function loudestAt(samples, peak) {
    let loudest = 0;

    for (const value of samples) {
        loudest = Math.max(loudest, Math.abs(value));
    }

    return samples.map((value) => (value / loudest) * peak);
}

// Scaled so it's `level` loud through and through (its root mean square), to mix layers by
const evenly = (samples, level) => {
    const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);

    return samples.map((value) => (value * level) / rms);
};

/**
 * The made beds (sound.js setAmbience's `beds`, beside the recorded ones): each a loop made in code
 * that loops without a seam, its loudest sample at 0.8 (as the wind's), made only once it's
 * wanted (sound.js, in a worker: worker.js) and looped as the wind is, faster and lower or slower
 * and higher where a place says (setAmbience's `rates`); how loud each is played (as the made
 * wind is, sound.js WIND), and how it's made (`make`, from a seed).
 *
 *  - hellDrone: a hell's drone (drone), heard all through its realms, lower the deeper the realm.
 *  - heartbeat: the heart the Halls of Bone beat to (heartbeat), louder nearer it.
 */
export const BEDS = Object.freeze({
    hellDrone: Object.freeze({ volume: 0.24, make: drone }),
    heartbeat: Object.freeze({ volume: 0.32, make: heartbeat }),
});

/**
 * A hell's drone (BEDS): eight seconds that loop without a seam (every tone a whole number of
 * cycles in it, everything that rises and falls doing so a whole number of times in it, its noise's
 * extra second blended over its start). A root on A an octave and a half under the bass clef,
 * buzzing with its overtones (a phone's speaker, which plays little under 200 Hz, gives its weight
 * in them: the ear hears the missing low note), and a second voice a quarter of a hertz off it,
 * the two throbbing twice a loop; the tritone over them (the devil's interval), swelling and dying
 * away once a loop; the deep's rumble under it all; and over it a moan, a narrow band of noise
 * rising and falling. Kept dark: little over a kilohertz.
 */
export function drone(seed = 1) {
    const random = createRandom(seed);
    const [loop, overlap] = [8, 1];
    const length = loop + overlap;
    const turns = (times, t, phase = 0) => Math.sin((TAU * times * t) / loop + phase);
    const buzz = [[1, 1], [2, 0.75], [3, 0.55], [4, 0.4], [5, 0.28], [6, 0.18], [7, 0.12], [8, 0.08]];
    const root = add(tone(length, 55, { harmonics: buzz }), tone(length, 55.25, { harmonics: buzz, phase: 1.1 }), 0.8);
    const tritone = shape(tone(length, 77.75, { harmonics: [[1, 1], [2, 0.5], [3, 0.3]] }), (t) => 0.5 + 0.5 * turns(1, t, -Math.PI / 2));
    const rumble = filter(filter(noise(random, length), "lowpass", 90), "lowpass", 160);
    const moan = shape(filter(noise(random, length), "bandpass", (t) => 380 + 140 * turns(1, t) + 60 * turns(3, t, 1.7), 7), (t) => 0.55 + 0.45 * turns(2, t, 0.6));
    const mixed = add(add(add(evenly(root, 1), evenly(tritone, 1), 0.3), evenly(rumble, 1), 0.7), evenly(moan, 1), 0.35);

    return loudestAt(seamless(filter(mixed, "lowpass", 1100), loop), 0.8);
}

/**
 * The Halls of Bone's heart (BEDS): four beats a loop, one every 1.2 seconds (as the heart's drawn
 * beating: world/flesh.js), each a deep "lub" and, a moment after, a softer, higher "dub": thuds
 * falling in pitch, with their overtones (for a phone's speaker), each with a soft, wet thump of
 * low noise, heard as if through flesh (little over 700 Hz); each beat a little stronger or weaker
 * and a little sooner or later than the last, the last dying away before the loop's end, so it
 * loops without a seam.
 */
export function heartbeat(seed = 1) {
    const random = createRandom(seed);
    const [beats, apart, dub] = [4, 1.2, 0.29];
    const length = beats * apart;
    let out = new Float32Array(count(length));

    for (let k = 0; k < beats; k++) {
        const at = k * apart + 0.02 + random.next() * 0.015;
        const strong = 0.88 + random.next() * 0.12;

        out = add(out, thud(70, 42, 0.3, 0.07), strong, at);
        out = add(out, burst(random, 0.12, "lowpass", 260, 0.9, 0.004, 0.03), 0.5 * strong, at);
        out = add(out, thud(86, 54, 0.24, 0.05), 0.6 * strong, at + dub);
        out = add(out, burst(random, 0.1, "lowpass", 320, 0.9, 0.004, 0.025), 0.3 * strong, at + dub);
    }

    return loudestAt(filter(out.slice(0, count(length)), "lowpass", 700), 0.8);
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
