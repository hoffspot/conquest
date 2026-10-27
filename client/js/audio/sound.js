// The game's sound, played with the Web Audio API in three buses, each with its own volume (the
// sliders in Game options), all turned on or off together (the Sound switch):
//
//  - Sound effects: blows, spells, footsteps, creatures' voices and cues (synth.js; footsteps,
//    the weapons', armour's and bodies' sounds, the spells' and the creatures' recorded, once
//    they're downloaded: recorded.js), each from where it happens: quieter the further it is
//    from the player, and to the left or right.
//  - The environment: the ambience (ambience.js, setAmbience), recorded: beds looped round and
//    round, each as loud as where the player is makes it (a land's wind, water near, the night's
//    crickets, a town's bustle; indoors, a taproom's crowd, a temple's hush, a cave's drips),
//    each copy crossfaded into the next; and calls now and then from round about (birds by the
//    time of day, a town's dogs, a farm's cattle); in an ants' nest, its colony's murmur, made, one
//    after another from round about (MURMUR). Downloaded as they're wanted where the player
//    is, and let go of a minute after they're last heard. Till they're in, the made wind blows
//    and a made bird sings; and leaves rustle in nearby trees. And in a hell, beds made in code
//    (synth.js BEDS: its drone, the Halls of Bone's heartbeat), each made in a worker once it's
//    wanted and looped as the wind is; any bed played lower and slower where a place says.
//  - Music: the land's score (setLand: the people's whose lands they are, LANDS: the town's,
//    score.js, in the humans' and to start with; elves.js and the others' in theirs, faded over
//    as the player crosses into them, nothing changing in the wild between), or, in the tavern,
//    its jig (tavern.js), played on recordings of real instruments (instruments.js) as it goes,
//    note by note, a little ahead of time, so it loops without a seam; with a hall's reverb.
//    Going into the tavern, the land's music fades into the tavern's, which starts from its
//    beginning; coming out, the land's comes back where it left off. Upstairs, the tavern's music
//    is quieter and muffled, heard through the floor. In a fight (setBattle), a fight's music
//    (battle.js) fades in over whatever's heard, from its start, wherever the player is but a
//    hell's realms, as loud and clear indoors as out; once it's done, it fades out slowly and
//    what was heard there back, where it left off. A score fading out plays on till it's silent.
//
// synth.js's sounds are made in a worker (worker.js), so nothing waits for them: those heard all
// the time as the game starts (MADE_AHEAD: the footsteps, the swings and the blows), each other
// one the first time it's wanted, played then, a moment late (MADE_LATE); the music's
// recordings (client/music) and the recorded sounds (client/sounds) are downloaded meanwhile, but
// for the spells' and the creatures', each downloaded only once it's wanted (want: the spells the
// player can cast, as they come to know them; a creature's as it's drawn; anyone else's the first
// time it's heard, what's made playing in its place till then). Of the music's, only the town's,
// the tavern's and a fight's (FIRST: about a megabyte and a half) are downloaded at the start;
// each other score's (about a megabyte and a half in all) the first time it's wanted, what's
// heard playing on till they're in, then fading over; and once a score's not been heard for
// MUSIC_KEPT, the recordings only it plays are let go of, their MP3s kept to decode again.
// Decoded, a recording's big (32-bit samples, 20 to 30 times its MP3: a bed's 3 to 5 MB, decoded
// at its own 32 kHz rather than the browser's 48: #decodeData, as the music's are), so no more
// than DECODED_BUDGET of the recorded sounds is kept decoded: past it, those
// played least lately are let go of (never one sounding), their MP3s kept, each decoded again the
// next time it's wanted, what's made playing in its place meanwhile, as before it was in.
// Browsers only let a page make sound once someone has tapped, clicked or pressed a key on it, so
// it starts on the first one (unlock()). The music plays from then on, on every screen, the pause menu included;
// everything is silent while the page is hidden.
//
// The browser's sound can stop on its own: suspended or interrupted (a call, an alarm, another
// app's sound, the screen locking), stuck (Safari on iPhones can say it's playing with its clock
// standing still), or closed. However it stops, it's started again: straight away where the
// browser allows it, on the next tap where it doesn't (restarting an interrupted or stuck one
// takes suspending it first), and if that doesn't help, it's made anew, the music carrying on
// where it was.

import { SURFACES } from "./footing.js";
import { baseFor, INSTRUMENTS, sampleFiles, scoreFiles } from "./instruments.js";
import { SPELLS } from "../core/spells.js";
import { ON_DEMAND, RECORDED, RECORDED_LEVEL } from "./recorded.js";
import { SCORES } from "./scores.js";
import { BEDS, LEVEL, PEAKS, render, SAMPLE_RATE, SOUNDS, wind } from "./synth.js";

/** The music: the town's, the tavern's, a fight's and each people's (scores.js). */
export { SCORES };

/**
 * Each people's music, heard out in their own lands (their territory as it was first claimed:
 * overworld.homeAt) and through the walls of their buildings: the humans' the town's.
 */
export const LANDS = Object.freeze({ human: "town", elf: "elves", darkElf: "darkElves", cat: "catFolk", lizard: "lizardFolk", orc: "orcs" });

/**
 * Where the player can be (the game's maps), and the music heard there: which score (`land`:
 * the land's, LANDS), how loud (a share of the music bus), how muffled (heard through a floor: a
 * low-pass filter's frequency, Hz, or null), and how much lower it's played (`shift`, semitones:
 * one of its score's `shifts`); and whether a fight's music is heard there (`fights`, unless
 * false).
 */
export const PLACES = Object.freeze({
    town: { score: "land", level: 1, muffle: null },
    taproom: { score: "tavern", level: 1, muffle: null },
    upstairs: { score: "tavern", level: 0.4, muffle: 650 },
    // (In a smithy, the land's music as if through its walls, under the forge's roar)
    smithy: { score: "land", level: 0.45, muffle: 900 },
    // (In a temple, the land's music hushed, far off through thick walls)
    temple: { score: "land", level: 0.2, muffle: 450 },
    // (In an adventurers' guild, the tavern's jig: it's as lively)
    guild: { score: "tavern", level: 0.7, muffle: null },
    // (In a town hall, the land's music through its windows; in a keep, far off through stone)
    hall: { score: "land", level: 0.35, muffle: 800 },
    // (In a shop, the specialists' and the masters', the land's music through its windows, a
    // little nearer than a hall's)
    shop: { score: "land", level: 0.4, muffle: 850 },
    keep: { score: "land", level: 0.25, muffle: 500 },
    // (In a castle keep's undercroft, under its great hall, further off yet)
    undercroft: { score: "land", level: 0.15, muffle: 350 },
    // (Down in a dungeon, its own: a cave's (bandits' hideouts too), a great lair's, an ants'
    // nest's, a crypt's (the ancient tombs too), a ruin's (a broken watchtower's too), a little
    // under the land's, the dungeon's own sounds round it)
    cave: { score: "caves", level: 0.8, muffle: null },
    lair: { score: "lair", level: 0.8, muffle: null },
    nest: { score: "nest", level: 0.8, muffle: null },
    crypt: { score: "crypts", level: 0.8, muffle: null },
    ruin: { score: "ruins", level: 0.8, muffle: null },
    tower: { score: "ruins", level: 0.8, muffle: null },
    // (In a hell's realms, a hell's, over its drone (ambience.js INDOORS), played as much lower
    // as the drone is in each (`shift`, semitones: hell.js), and never a fight's)
    hellBreach: { score: "hell", level: 0.8, muffle: null, fights: false, shift: 0 },
    hellBone: { score: "hell", level: 0.8, muffle: null, fights: false, shift: -2 },
    hellFire: { score: "hell", level: 0.8, muffle: null, fights: false, shift: -4 },
    hellPit: { score: "hell", level: 0.8, muffle: null, fights: false, shift: -7 },
});

/** What's heard in a fight, wherever it is (but where a place says `fights: false`: a hell's realms). */
export const FIGHTING = Object.freeze({ score: "battle", level: 1, muffle: null });

/** The buses, and how loud each is to start with (0 to 1, as the sliders show them). */
export const BUSES = Object.freeze(["effects", "environment", "music"]);
export const VOLUME_DEFAULTS = Object.freeze({ effects: 0.5, environment: 0.4, music: 0.35 });

/**
 * How loud a slider's setting (0 to 1) sounds: a curve, as ears hear loudness (halfway is a
 * quarter as loud as the top, 12 dB down).
 */
export const gainOf = (volume) => Math.max(0, Math.min(1, volume)) ** 2;

// Heard at full volume this close (metres), and not at all this far away
const NEAR = 4;
const FAR = 34;

// Panned all the way to one side this far to the side (metres), and at most this far
const SIDE = 14;
const MOST_PAN = 0.85;

// At most this many sound effects at once
const VOICES = 24;

// If the browser's clock stands still this long (seconds) while it says it's playing, it's
// started again; if it's stuck again that soon after, it's made anew
const STALL = 1.5;

// The scores whose recordings are downloaded at the start: the town's (where the game starts,
// and the humans' lands'), the tavern's and a fight's (heard any moment); the rest's the first
// time each is wanted. Those only a score plays are let go of once it's not been heard this long
// (seconds), its MP3s kept to decode again
export const FIRST = Object.freeze(["town", "tavern", "battle"]);
const MUSIC_KEPT = 60;

/**
 * The sounds recorded rather than made (recorded.js: client/sounds), each variant's id ("name
 * variant") and where it's downloaded from: those downloaded at the start (all but recorded.js's
 * ON_DEMAND), or those `names`.
 */
export const recordedFiles = (names = Object.keys(RECORDED).filter((name) => !LATER.has(name))) => names.flatMap((name) => RECORDED[name].map(({ file }, variant) => [`${name} ${variant}`, new URL(`../../sounds/${file}`, import.meta.url)]));
const LATER = new Set(ON_DEMAND);
const DOWNLOADS = 6;

// Sounds wanted later downloaded this many at a time (not to hold up what else is downloading)
const WANTED_DOWNLOADS = 3;

// How loud the made wind is; how long between leaves rustling (seconds, from and to), and how
// near a tree has to be to be heard (metres)
const WIND = 0.2;
const LEAVES = [2.5, 7];
const TREES_HEARD = 22;

// The ambience's beds (setAmbience): each copy of a bed's recording set going this far ahead of
// when it's to play (seconds); a bed fading to a new loudness over this long; one silent this long
// let go of (its decoded recording dropped, decoded again from its MP3 should it be wanted again)
const BED_AHEAD = 1.5;
const BED_FADE = 2;
const BED_KEPT = 60;

/**
 * How much of the recorded sounds is kept decoded at most (bytes): on a touch screen (a phone or a
 * tablet, with least to spare: Safari on an iPhone closes a page holding too much, and the sound's
 * counted against it), and anywhere else. All of them decoded are about 236 MB (276 if the beds
 * were decoded at an iPhone's 48 kHz, not their own 32: #decodeData), their MP3s about 10; the
 * ones downloaded at the start about 22 MB, and the beds heard at once in a busy place 14 to 20.
 * Past it, the sounds played least lately are let go of
 * (never one sounding, a bed heard or a sound not done), their MP3s kept to decode them again.
 * (Travelling through sixteen places in a few minutes, what was decoded climbed past 150 MB; kept
 * to these, about 90 recordings were decoded again on a phone's, under 30 on a computer's.)
 */
export const DECODED_BUDGET = Object.freeze({ touch: 48 * 1024 * 1024, other: 96 * 1024 * 1024 });

/**
 * The made sounds (synth.js SOUNDS) made as the game starts: those heard all the time, the
 * footsteps, the swings and the blows (about 5 MB, and the wind's 2). Every other one's made only
 * the first time it's wanted (#make), in the worker: all 98 of them, 247 variants at the browser's
 * 48 kHz, held 33 MB from the start, an explosion's or a war horn's as much as a footstep's, and an
 * iPhone's tab was let go holding 105 MB of sound (a player's crash report, 2026-10-27). A sound
 * made the first time it's wanted is played as soon as it's made, if that's within MADE_LATE
 * seconds of when it was wanted (a few hundredths, in the worker); later than that, not at all.
 */
export const MADE_AHEAD = /^(step|swing)|^(slash|hack|cleave|chop|strike|crush|pierce|punch|arcane|fire|arrow|bolt|fireball)$/;
const MADE_LATE = 0.25;

// What a sound's copy holds (bytes): an MP3's, or its samples' (32-bit, each channel's)
const bytesOf = (copy) => copy.byteLength ?? (copy.length ?? 0) * (copy.numberOfChannels ?? 1) * 4;

// MPEG audio's sample rates, by its version's (MPEG-1's; MPEG-2's are half them, MPEG-2.5's a
// quarter) and a frame's header's index
const MP3_RATES = [44100, 48000, 32000];

/**
 * The sample rate an MP3 (its bytes) was recorded at, from its first frame's header (after any
 * ID3 tag), or null if there's no telling: the music's and the ambience's beds' are 32 kHz, the
 * rest 48 kHz (#decode).
 */
export function mp3Rate(mp3) {
    const bytes = new Uint8Array(mp3);
    let at = 0;

    if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
        at = 10 + ((bytes[6] << 21) | (bytes[7] << 14) | (bytes[8] << 7) | bytes[9]) + (bytes[5] & 0x10 ? 10 : 0);
    }

    for (const end = Math.min(bytes.length - 3, at + 4096); at < end; at++) {
        if (bytes[at] === 0xff && (bytes[at + 1] & 0xe0) === 0xe0) {
            const version = (bytes[at + 1] >> 3) & 3;
            const layer = (bytes[at + 1] >> 1) & 3;
            const rate = (bytes[at + 2] >> 2) & 3;
            const bitrate = bytes[at + 2] >> 4;

            if (version !== 1 && layer === 1 && rate !== 3 && bitrate !== 0 && bitrate !== 15) {
                return MP3_RATES[rate] / (version === 3 ? 1 : version === 2 ? 2 : 4);
            }
        }
    }

    return null;
}

// One copy of a bed fading into the next: as one falls (cos), the other rises (sin), together as
// loud as either (their sound unrelated, as a bed's is from one moment to the next)
const RISE = Float32Array.from({ length: 33 }, (_, k) => Math.sin((Math.PI / 2) * (k / 32)));
const FALL = RISE.slice().reverse();

// The recorded winds, standing in for the made one once they're in
const WINDS = ["windOpen", "windHigh", "windForest"];

// How quickly it fades in and out (seconds)
const FADE = 0.08;

// How loud it all is at the speakers: the mix is turned down this much (about 10 dB, so the
// sliders' defaults are comfortable on a phone at middling volume, with room to turn them up),
// gently compressed, then limited just under full scale, so a busy fight turned up can't clip
const OUTPUT = 0.32;
const LIMIT = -1.5;

// The music: scheduled this far ahead (seconds), checked this often (ms); how loud it is
// against the rest (about 5 dB up, at the same slider setting), how much of it goes through the
// reverb, and how long the reverb rings (seconds)
const LOOKAHEAD = 1.2;
const MUSIC_LEVEL = 1.8;
const SCHEDULE_MS = 200;
const REVERB_SEND = 0.28;
const REVERB_TIME = 2.6;

// Going from one score to the other, the one fades out and the other in over this long
// (seconds); going upstairs or down, the music gets quieter and muffled, or louder and clear,
// over this long; and the low-pass filter's frequency when it isn't muffled (Hz)
const CROSSFADE = 1.5;
const THROUGH_FLOOR = 0.8;
const CLEAR = 20000;

// A fight's music fades in over this long (seconds); once it's done (the game says it's done a
// while after the fight is: fight.js FIGHT_LINGERS), it fades out and what was heard back over
// this long, back about eight seconds after the fight's last moment in all; and crossing into a
// people's lands, their music fades over this long
export const BATTLE_IN = 1.2;
export const BATTLE_OUT = 5.5;
export const LAND_FADE = 4;

// The scores played from their start each time they're heard (the rest carry on where they left off)
const FROM_THE_START = new Set(["tavern", "battle"]);

// The swing for each attack animation (actions.js; a catapult's arm slamming into its crossbar as it
// lets fly, a ballista's string), and the sound of each projectile's launch
const SWINGS = { sword: "swingSword", staff: "swingStaff", hammer: "swingHammer", punch: "swingPunch", kick: "swingKick", cleaver: "swingCleaver", wand: "swingWand", throw: "bombThrow", launch: "trapdoor", loose: "arrow" };
const LAUNCHES = { arrow: "arrow", bolt: "bolt", fireball: "fireball", venom: "bolt", wisp: "bolt", roots: "bolt", web: "bolt", curse: "bolt", wail: "bolt", drain: "bolt", lava: "fireball", flame: "dragonBreath", riftFire: "dragonBreath", ballistaBolt: "stoneShot" };

// The footsteps on each footing (audio/footing.js SURFACES: "grass" → "stepGrass"...)
const STEPS = Object.fromEntries(SURFACES.map((surface) => [surface, `step${surface[0].toUpperCase()}${surface.slice(1)}`]));

/**
 * How loud a footstep is (against its sound's own level: synth.js), everyone's alike for their
 * size: walking, `walk` and `pace` more for each metre a second; running (faster than `running`
 * m/s, a person's), `run`. Barely heard, and never in the way: well under the blows and the world
 * round them (a walk's about a fourteenth of a slash, a run's about a ninth), each a little louder
 * or softer than the last (by up to `jitter` of it), and heard only near (gone `far` metres off,
 * where a blow's heard to 34). The bigger (`size`: a person's 1), the louder (as the size to the
 * power `weight`) and lower; and a big stride's a walk at a pace a small one runs at (the pace
 * taken over the root of the size).
 */
export const FOOTSTEPS = Object.freeze({ walk: 0.13, pace: 0.03, run: 0.26, running: 3, weight: 0.75, sizes: Object.freeze([0.3, 4]), jitter: 0.15, far: 15 });

/**
 * How each kind of feet sounds (beasts/beast.js gait.feet; a person's own when none's said),
 * `volume` and `rate` times a person's: feet and paws step on the footing under them, paws softer
 * and lighter; a spider's legs skitter, a slime squelches, a serpent's scales slither and a
 * frog's webbed feet slap (`sound`), whatever's under them; and the Behemoth of the Rift's come
 * down as the Kaiju's do, at their own pace (the biggest's slowed undone), heard `far` metres off.
 */
export const GAITS = Object.freeze({
    feet: { volume: 1, rate: 1 },
    paws: { volume: 0.7, rate: 1.15 },
    legs: { sound: "skitter", volume: 1, rate: 1 },
    slime: { sound: "squelch", volume: 1, rate: 1 },
    scales: { sound: "slither", volume: 1, rate: 1 },
    webbed: { sound: "squelch", volume: 0.6, rate: 1.5 },
    colossal: { sound: "kaijuStep", volume: 1.6, rate: Math.SQRT2, far: 80 },
});

/**
 * The wild's creatures' voices (core/creatures.js), each its family's recordings
 * (scripts/sounds/creatures.js: `${family}Call`, `Attack`, `Hurt` and `Death`; a man's, `human`,
 * and a rougher man's, `humanRough`, with no call), played `rate` times as fast: a bigger one of
 * a family slower and lower, a smaller one higher (a dire wolf a wolf's at 0.85). Each falls dead
 * with a body's thud for its size (`fall`; null: none heard, a slime's, a ghost's, the bats', the
 * bones of a skeleton and the crash of a treant are in their deaths; none said: as a person
 * falls, game.js); a dragon's and a wyvern's wings are heard beating in the air (`wings`); a
 * dragon and a chimera breathe fire (`fire`); and what's heard under its call, attack and death (`with`): a
 * magma slime's sizzle, the bats' fluttering. A woman's voice isn't recorded yet: a woman among
 * the bandits and cultists is silent (game.js).
 */
export const CREATURE_VOICES = Object.freeze({
    rat: { family: "rat", fall: "deathThudSmall" },
    porcupine: { family: "rat", rate: 0.85, fall: "deathThudSmall" },
    slime: { family: "slime", fall: null },
    magmaSlime: { family: "slime", rate: 0.9, fall: null, with: "slimeSizzle" },
    bats: { family: "bats", fall: null, with: "smallWings" },
    rookFlock: { family: "bats", rate: 0.8, fall: null, with: "smallWings" },
    vultureFlock: { family: "bats", rate: 0.72, fall: null, with: "smallWings" },
    wolf: { family: "wolf", fall: "deathThudMid" },
    direWolf: { family: "wolf", rate: 0.85, fall: "deathThudMid" },
    werewolf: { family: "wolf", rate: 0.72, fall: "deathThudBig" },
    moonfang: { family: "wolf", rate: 0.71, fall: "deathThudBig" },
    blackShuck: { family: "wolf", rate: 0.75, fall: "deathThudMid" },
    hyena: { family: "wolf", rate: 1.1, fall: "deathThudMid" },
    jackal: { family: "wolf", rate: 1.2, fall: "deathThudSmall" },
    cwnAnnwn: { family: "wolf", rate: 0.9, fall: "deathThudMid" },
    ahuizotl: { family: "wolf", rate: 1.15, fall: "deathThudSmall" },
    boar: { family: "boar", fall: "deathThudMid" },
    rockTusker: { family: "boar", rate: 0.8, fall: "deathThudBig" },
    badger: { family: "boar", rate: 1.2, fall: "deathThudSmall" },
    snake: { family: "snake", fall: "deathThudSmall" },
    boa: { family: "snake", rate: 0.8, fall: "deathThudBig" },
    gilaMonster: { family: "snake", rate: 1.1, fall: "deathThudSmall" },
    deathWorm: { family: "snake", rate: 0.75, fall: "deathThudMid" },
    spittingCobra: { family: "snake", rate: 0.95, fall: "deathThudSmall" },
    basilisk: { family: "snake", rate: 0.9, fall: "deathThudSmall" },
    bear: { family: "bear", fall: "deathThudBig" },
    nandiBear: { family: "bear", rate: 0.9, fall: "deathThudBig" },
    hart: { family: "bear", rate: 1.2, fall: "deathThudMid" },
    puma: { family: "bigCat", fall: "deathThudMid" },
    shadowStalker: { family: "bigCat", rate: 0.85, fall: "deathThudMid" },
    jaguar: { family: "bigCat", rate: 0.95, fall: "deathThudMid" },
    chimera: { family: "bigCat", rate: 0.8, fall: "deathThudBig", fire: "dragonBreath" },
    caveSpider: { family: "spider", fall: "deathThudSmall" },
    centipede: { family: "spider", rate: 1.1, fall: "deathThudSmall" },
    ant: { family: "spider", rate: 1.05, fall: "deathThudSmall" },
    greatCentipede: { family: "spider", rate: 0.9, fall: "deathThudMid" },
    antMonster: { family: "spider", rate: 0.72, fall: "deathThudBig" },
    dungeonSpider: { family: "spider", rate: 0.95, fall: "deathThudSmall" },
    eliteDungeonSpider: { family: "spider", rate: 0.8, fall: "deathThudMid" },
    dungeonScorpion: { family: "spider", rate: 0.8, fall: "deathThudMid" },
    giantCockroach: { family: "spider", rate: 1.15, fall: "deathThudSmall" },
    blackWidow: { family: "spider", rate: 0.88, fall: "deathThudMid" },
    dungeonWasp: { family: "spider", rate: 1.22, fall: "deathThudSmall" },
    scorpion: { family: "spider", rate: 0.85, fall: "deathThudSmall" },
    locustSwarm: { family: "spider", rate: 1.2, fall: null },
    bloodflies: { family: "spider", rate: 1.24, fall: null },
    bogFrog: { family: "frog", fall: "deathThudSmall" },
    crocodile: { family: "croc", fall: "deathThudBig" },
    knucker: { family: "croc", rate: 0.85, fall: "deathThudBig" },
    olm: { family: "frog", rate: 0.8, fall: "deathThudSmall" },
    salamander: { family: "frog", rate: 1.1, fall: "deathThudSmall", with: "slimeSizzle" },
    giantLeech: { family: "slime", rate: 1.2, fall: null },
    wyvern: { family: "dragon", rate: 1.15, fall: "deathThudBig", wings: "wingbeat" },
    dragon: { family: "dragon", fall: "deathThudBig", wings: "wingbeat", fire: "dragonBreath" },
    dreadthorn: { family: "dragon", rate: 0.8, fall: "deathThudBig", wings: "wingbeat", fire: "dragonBreath" },
    // (The Behemoth of the Rift: the Kaiju's own voice, its roar, its strikes, its cries struck and
    // its death; its atomic breath charged and fired as it breathes: app/game.js)
    kaiju: { family: "kaiju", fall: "deathThudBig" },
    // (The rift's own small kind in the Tower of Sar Mordal: the Kaiju's voice, higher, as small as
    // they are; a riftling's highest)
    riftling: { family: "kaiju", rate: 1.24, fall: "deathThudMid" },
    riftStalker: { family: "kaiju", rate: 1.12, fall: "deathThudBig" },
    wildBull: { family: "dragon", rate: 1.2, fall: "deathThudBig" },
    capeBuffalo: { family: "dragon", rate: 1.1, fall: "deathThudBig" },
    kelpie: { family: "dragon", rate: 1.24, fall: "deathThudBig" },
    treant: { family: "treant", fall: null },
    hodmedod: { family: "treant", rate: 1.24, fall: "deathThudMid" },
    wisp: { family: "ghost", rate: 1.2, fall: null },
    mandrake: { family: "ghost", rate: 1.2, fall: "deathThudSmall" },
    pixies: { family: "ghost", rate: 1.24, fall: null },
    ghost: { family: "ghost", fall: null },
    wraith: { family: "ghost", rate: 0.85, fall: null },
    mare: { family: "ghost", rate: 0.92, fall: null },
    skeleton: { family: "skeleton", fall: null },
    wightLord: { family: "wight" },
    draugr: { family: "wight", rate: 1.1, fall: "deathThudMid" },
    goblin: { family: "goblin" },
    goblinBomber: { family: "goblin", rate: 1.08 },
    goblinKing: { family: "goblin", rate: 0.8 },
    boggart: { family: "goblin", rate: 0.9 },
    troll: { family: "troll" },
    ogre: { family: "troll", rate: 1.05 },
    frostTroll: { family: "troll", rate: 0.95 },
    demonLord: { family: "troll", rate: 0.72 },
    fiend: { family: "bigCat", rate: 0.74, fall: "deathThudBig" },
    bandit: { family: "human" },
    cultist: { family: "human", rate: 1.05 },
    cultLeader: { family: "human", rate: 0.9 },
    banditChief: { family: "humanRough" },
    // (A hell's flayed: flaylings shrieking as goblins do, lower; cinder husks rasping, ossuary
    // priests moaning and hierarchs groaning as wights do, higher and lower; pyre acolytes as men;
    // dirge wardens as trolls, higher)
    flayling: { family: "goblin", rate: 0.76, fall: "deathThudMid" },
    cinderHusk: { family: "wight", rate: 1.22, fall: "deathThudMid" },
    pyreAcolyte: { family: "human", rate: 0.94, fall: "deathThudMid" },
    ossuaryPriest: { family: "wight", rate: 1.05, fall: "deathThudMid" },
    dirgeWarden: { family: "troll", rate: 1.2, fall: "deathThudBig" },
    flayedHierarch: { family: "wight", rate: 0.8, fall: "deathThudBig" },
    // (A hell's gorgers, bellowing as trolls do from their maws: lower the bigger, a pit ravager
    // higher)
    slagGorger: { family: "troll", rate: 0.9, fall: "deathThudBig" },
    forgeBrute: { family: "troll", rate: 0.85, fall: "deathThudBig" },
    chainedGlutton: { family: "troll", rate: 0.78, fall: "deathThudBig" },
    bloatGorger: { family: "troll", rate: 0.92, fall: "deathThudBig" },
    pitRavager: { family: "troll", rate: 1.1, fall: "deathThudBig" },
    gorgerWarlord: { family: "troll", rate: 0.74, fall: "deathThudBig" },
});

// What a creature's voice is heard doing, and how loud (as synth.js's `volume`): calling (heard
// further off, to CALL_FAR metres), attacking, hurt and dying; and the families heard louder,
// their voices mostly low (a phone's speaker plays little under 200 Hz)
const UTTERANCES = { call: 0.7, attack: 0.65, hurt: 0.55, death: 0.7 };
const CALL_FAR = 50;
const DEEP = { dragon: 1.4, bear: 1.25, troll: 1.15 };

// A family's sound for what it's doing ("wolf", "call" → "wolfCall")
const uttered = (family, what) => `${family}${what[0].toUpperCase()}${what.slice(1)}`;

/** Every recorded sound a creature (CREATURE_VOICES) may make, to want them when it's drawn. */
export function creatureSounds(creature) {
    const voice = CREATURE_VOICES[creature];

    if (!voice) {
        return [];
    }

    return [...Object.keys(UTTERANCES).map((what) => uttered(voice.family, what)), voice.with, voice.fall, voice.wings, voice.fire].filter((name) => name && RECORDED[name]);
}

/**
 * The recorded sounds with nothing made in their place (recorded.js): how loud each is played (as
 * synth.js's `volume`), and the made sound played `instead` until its recordings are in (none:
 * nothing, till then).
 */
export const RECORDED_ONLY = Object.freeze({
    swingWand: { volume: 0.4, instead: "swingStaff" },
    bowDraw: { volume: 0.35 },
    arrowQuiver: { volume: 0.3 },
    clash: { volume: 0.75, instead: "block" },
    hitMail: { volume: 0.45 },
    hitPlate: { volume: 0.45 },
    hitLeather: { volume: 0.4 },
    shieldSling: { volume: 0.45, instead: "unsling" },
    grimoire: { volume: 0.4, instead: "unsling" },
    mailJingle: { volume: 0.3 },
    plateClank: { volume: 0.3 },
    clothRustle: { volume: 0.3 },
    fallArmoured: { volume: 0.85, instead: "fall" },
    dropWeapon: { volume: 0.5 },
    ...spellsRecorded(),
    ...creaturesRecorded(),
    ...ambienceRecorded(),
    ...itemsRecorded(),
});

/**
 * The items' recorded sounds, downloaded once the game starts (recorded.js ON_DEMAND; sound.js
 * want): coins picked up, things picked up, dropped and thrown away, put on and taken off, used,
 * read and opened; the pack, chests, a lock, a quill, a trade, eating.
 */
export const ITEM_SOUNDS = Object.freeze(["coinPickup", "pickup", "drop", "discard", "equipCloth", "equipLeather", "equipMail", "equipPlate", "potionCork", "potionDrink", "scroll", "bookOpen", "pageTurn", "mapUnfold", "packOpen", "packClose", "chestOpen", "chestClose", "lockpick", "quill", "tradeDone", "eat"]);

// The recordings of made sounds played softer than the made ones (their volume instead of
// SOUNDS'): the wheel's tick, a lock, no and a foe slain, gentler recorded
const RECORDED_VOLUMES = Object.freeze({ wheel: 0.18, lock: 0.25, denied: 0.3, slain: 0.35 });

// The spells' recorded sounds with nothing made (scripts/sounds/spells.js): each school's casts
// (swelling, as loud as a swing), landings (as loud as a blow) and missiles, Low, Mid and High;
// healing's as soft as its made ones; and the tome spells'
function spellsRecorded() {
    const each = {};
    const SCHOOL_STAND_INS = {
        Fire: { cast: "fireball", impact: "fire" },
        Earth: { cast: "bolt", impact: "crush" },
        Air: { cast: "bolt", impact: "arcane" },
        Water: { cast: "bolt", impact: "arcane" },
        Healing: { cast: "castHeal", impact: "healed" },
    };

    for (const [stem, { cast, impact }] of Object.entries(SCHOOL_STAND_INS)) {
        for (const band of ["Low", "Mid", "High"]) {
            each[`cast${stem}${band}`] = { volume: stem === "Healing" ? 0.45 : 0.5, instead: cast };
            each[`impact${stem}${band}`] = { volume: stem === "Healing" ? 0.5 : 0.8, instead: impact };
        }
    }

    return {
        ...each,
        stoneShot: { volume: 0.55, instead: "bolt" },
        shockbolt: { volume: 0.6, instead: "bolt" },
        waterbolt: { volume: 0.55, instead: "bolt" },
        buff: { volume: 0.45 },
        ward: { volume: 0.45 },
        cure: { volume: 0.45, instead: "healed" },
        hex: { volume: 0.55, instead: "arcane" },
        fear: { volume: 0.6 },
        teleportOut: { volume: 0.55 },
        teleportIn: { volume: 0.55 },
        summon: { volume: 0.65 },
        polymorph: { volume: 0.55 },
        lightSpell: { volume: 0.4 },
        fizzle: { volume: 0.45 },
        spellCircle: { volume: 0.5 },
    };
}

// The creatures' recorded sounds with nothing made (scripts/sounds/creatures.js): each family's
// call, attack, hurt and death (UTTERANCES); a magma slime's sizzle, a dragon's fire (the made
// fireball's in its place till it's in), wings, and bodies falling by their size (a person's fall
// till they're in)
function creaturesRecorded() {
    const each = {};

    for (const family of new Set(Object.values(CREATURE_VOICES).map(({ family }) => family))) {
        for (const [what, volume] of Object.entries(UTTERANCES)) {
            if (RECORDED[uttered(family, what)]) {
                each[uttered(family, what)] = { volume: volume * (DEEP[family] ?? 1) };
            }
        }
    }

    return {
        ...each,
        slimeSizzle: { volume: 0.4 },
        dragonBreath: { volume: 0.75, instead: "fireball" },
        // (The kaiju's: the Behemoth of the Rift's in the game (CREATURE_VOICES, GAITS), and in the
        // model viewer as its clips play; its voice deep, so louder)
        kaijuCall: { volume: 0.95 },
        kaijuAttack: { volume: 0.9 },
        kaijuHurt: { volume: 0.75 },
        kaijuDeath: { volume: 0.95 },
        kaijuGrowl: { volume: 0.55 },
        kaijuCharge: { volume: 0.7 },
        kaijuBreath: { volume: 0.9, instead: "fireball" },
        kaijuStep: { volume: 0.8 },
        wingbeat: { volume: 0.6 },
        smallWings: { volume: 0.4 },
        deathThudSmall: { volume: 0.6, instead: "fall" },
        deathThudMid: { volume: 0.75, instead: "fall" },
        deathThudBig: { volume: 0.9, instead: "fall" },
    };
}

// The ambience's recorded sounds with nothing made (scripts/sounds/ambience.js): on the
// environment's bus, its beds (each looped by setAmbience, as loud at 1 as the made wind: a bed's
// recording is made about 10 dB quieter than a one-shot's), the world's calls (birds by day and
// at dawn, a made bird's chirp in their place till they're in), a church's bell and thunder;
// among the sound effects, a heavy door, an iron gate, a trapdoor and stairs creaking
function ambienceRecorded() {
    const world = (volume, instead) => ({ volume, bus: "environment", ...(instead ? { instead } : {}) });
    const beds = Object.keys(RECORDED).filter((name) => RECORDED[name][0].loop);

    return {
        ...Object.fromEntries(beds.map((name) => [name, world(0.3)])),
        birdDay: world(0.4, "bird"),
        birdDawn: world(0.35, "bird"),
        gull: world(0.45),
        crow: world(0.4),
        owl: world(0.4),
        creakTree: world(0.35),
        dogBark: world(0.45),
        rooster: world(0.4),
        cowMoo: world(0.45),
        sheepBleat: world(0.4),
        horseWhinny: world(0.4),
        chickens: world(0.35),
        churchBell: world(0.6),
        distantHammer: world(0.35),
        thunder: world(0.7),
        doorHeavy: { volume: 0.6, instead: "door" },
        gate: { volume: 0.55, instead: "door" },
        trapdoor: { volume: 0.55, instead: "door" },
        stairs: { volume: 0.35 },
    };
}

// The items', the interface's and the cues' recorded sounds with nothing made (scripts/sounds/
// items.js), each as loud as a light hand on it ("audible, but barely, and not distracting"):
// the interface's softest, a tap; the cues' loudest, below any blow; until they're in, the made
// sound nearest to them in their place
function itemsRecorded() {
    const at = (volume, instead) => ({ volume, ...(instead ? { instead } : {}) });

    return {
        tap: at(0.15),
        wheelSelect: at(0.2, "wheel"),
        talk: at(0.2),
        quickAction: at(0.25),
        coinPickup: at(0.25, "coins"),
        pageTurn: at(0.25),
        pinSet: at(0.25),
        chatHeard: at(0.25),
        quill: at(0.25),
        pickup: at(0.3),
        buyDenied: at(0.3, "denied"),
        newsHeard: at(0.3, "wake"),
        packOpen: at(0.3),
        packClose: at(0.3),
        equipCloth: at(0.3),
        equipLeather: at(0.3),
        discard: at(0.3),
        scroll: at(0.3),
        bookOpen: at(0.3),
        mapUnfold: at(0.3),
        eat: at(0.3),
        drop: at(0.35),
        equipMail: at(0.35),
        equipPlate: at(0.35),
        potionCork: at(0.35),
        potionDrink: at(0.35),
        lockpick: at(0.35),
        tradeDone: at(0.35, "coins"),
        chestOpen: at(0.35),
        chestClose: at(0.35),
        levelUp: at(0.4, "wake"),
        questDone: at(0.4, "wake"),
    };
}

// A school's spells' sounds tier by tier (core/spells.js): Low for its first two tiers, Mid for
// the next three, High for its greatest two (healing's greatest, its fifth, High too)
const bandOf = (school, tier) => (tier <= 2 ? "Low" : tier >= (school === "healing" ? 5 : 6) ? "High" : "Mid");

// The spells that throw a missile (world/spellfx.js), and what it sounds like flying: the fire
// spells' a fireball's roar, a stone's whoosh, water's splash, poison's the arcane bolt (Hurt's
// gust and the ice blade are heard landing)
const MISSILES = { burn: "fireball", fireball: "fireball", burstflame: "fireball", stoneCrush: "stoneShot", blister: "waterbolt", waterbolt: "waterbolt", poison: "bolt" };

// What the spells with no school sound like landing: strength and speed given (buff), a ward
// raised (ward), something ended (cure), a curse (hex), terror, a creature come, a shape changed,
// a light lit, someone gone from sight; and Shockbolt its own, a spark's crack and a coil's buzz.
// The Prismatic sigil's element spells, as their element's greatest (the sigil's glass chord over
// them: Sound landed).
// (A stun's heard as it stuns; the spells that carry someone off, as they go and come: carried)
const LANDINGS = {
    shockbolt: "shockbolt",
    prismatic: "prismaticBlast",
    prismaticFire: "impactFireHigh",
    prismaticEarth: "impactEarthHigh",
    prismaticAir: "impactAirHigh",
    prismaticWater: "impactWaterHigh",
    embolden: "buff",
    swole: "buff",
    surge: "buff",
    dodge: "buff",
    levitate: "buff",
    resistFire: "ward",
    resistWater: "ward",
    resistAir: "ward",
    resistEarth: "ward",
    resistMagic: "ward",
    resistPoison: "ward",
    resistDisease: "ward",
    reflect: "ward",
    inertialBarrier: "ward",
    evaluate: "buff",
    curePoison: "cure",
    cureSickness: "cure",
    liftCurse: "cure",
    quench: "cure",
    staunch: "cure",
    unbind: "cure",
    pacify: "cure",
    poison: "hex",
    vampirism: "hex",
    fear: "fear",
    summon: "summon",
    attraction: "summon",
    zombify: "summon",
    polymorph: "polymorph",
    light: "lightSpell",
    invisibility: "teleportOut",
};

// How loud a landing is against its own sound, where softer (vanishing from sight: a hush)
const HUSHED = { invisibility: 0.5 };

// The spells with no school cast with their own sound: Explosion's heat drawn in (its blast's
// heard as the battle tells it: app/game.js "blast"), Prismatic Destruction's four elements, and
// each element's Prismatic spell as its greatest spells are cast
const CASTS = { explosion: "castExplosion", prismatic: "castPrismatic", prismaticFire: "castFireHigh", prismaticEarth: "castEarthHigh", prismaticAir: "castAirHigh", prismaticWater: "castWaterHigh" };

/**
 * A spell's sounds (core/spells.js): its cast, swelling to its release (`cast`); its missile's
 * flight, if it throws one (`missile`); and its landing (`land`). A school's spells each its
 * school's, by its tier; the rest cast with the arcane bolt (at an enemy) or a healing's swell
 * (at a friend or themselves), or their own (CASTS), and landing as LANDINGS. Any of them null:
 * none.
 */
export function spellSounds(id) {
    const spell = SPELLS[id];

    if (!spell) {
        return { cast: null, missile: null, land: null };
    }

    const stem = spell.school ? spell.school[0].toUpperCase() + spell.school.slice(1) : null;
    const band = stem ? bandOf(spell.school, spell.tier) : null;

    return {
        cast: CASTS[id] ?? (stem ? `cast${stem}${band}` : spell.target === "enemy" ? "bolt" : "castHealingLow"),
        missile: MISSILES[id] ?? null,
        land: LANDINGS[id] ?? (stem ? `impact${stem}${band}` : null),
    };
}

// A sound started part way in, to be loudest on time, faded in over this long (s); one cut
// short, faded out over this long
const JOIN = 0.006;
const CUT = 0.08;

// Carried off by magic: gone with a pop, and come with one this long after (s)
const ARRIVED = 0.35;

/**
 * What armour sounds like on the move and struck (a character's: game.js armourOf): what a step
 * jingles or clanks with (`step`, as loud against the footstep: `with`; leather and cloth only
 * running, a swish), and what's heard under a blow landing (`hit`).
 */
export const ARMOUR = Object.freeze({
    mail: { step: "mailJingle", with: 0.8, hit: "hitMail" },
    plate: { step: "plateClank", with: 0.8, hit: "hitPlate" },
    leather: { step: "clothRustle", with: 0.6, running: true, hit: "hitLeather" },
});

// The blows a body's armour is heard under (weapons.js reactions: not spells, not fire)
const STRUCK = new Set(["slash", "hack", "cleave", "chop", "strike", "crush", "pierce", "punch", "kick"]);

// A bow's shot: an arrow taken from the quiver as it starts, the string drawn back after (s)
const DRAWN = 0.12;

// How long between the hearth's crackles (seconds, from and to)
const CRACKLES = [0.2, 0.9];

/**
 * A place's murmur (setAmbience's `murmur`: a made sound heard over and over, each overlapping
 * the last): how long between (seconds, from and to), from how far off round the player (metres),
 * how far it's heard at all (metres), and muffled through the earth (a low-pass's frequency, Hz).
 */
export const MURMUR = Object.freeze({ every: [0.8, 1.5], away: [4, 13], heard: 22, muffle: 2600 });

export class Sound {
    /**
     * @param {object} [options]
     * @param {boolean} [options.enabled] - Whether it's on.
     * @param {object} [options.volumes] - { effects, environment, music }, 0 to 1.
     * @param {Function} [options.fetch] - How to download the music's recordings.
     * @param {number} [options.budget] - How much of the recorded sounds to keep decoded at most
     *     (bytes: DECODED_BUDGET's, for a touch screen or not).
     * @param {Function} [options.ahead] - Which made sounds to make as it starts (by name: those
     *     MADE_AHEAD names; the sound studio's, every one), the rest once each is first wanted.
     */
    constructor({ enabled = true, volumes = VOLUME_DEFAULTS, fetch = globalThis.fetch?.bind(globalThis), budget = DECODED_BUDGET[globalThis.matchMedia?.("(pointer: coarse)").matches ? "touch" : "other"], ahead = (name) => MADE_AHEAD.test(name) } = {}) {
        this.enabled = enabled;
        this.volumes = { ...VOLUME_DEFAULTS, ...volumes };
        this.paused = true;
        this.hidden = false;
        this.context = null;

        // (Whether there's been a tap yet, which the browser wants before its sound can start)
        this.tapped = false;
        this.master = null;
        this.buses = {};

        /** Sounds' samples as they're made (name → [variant]), and the music's recordings as they're downloaded ("instrument key" → MP3). */
        this.samples = new Map();
        this.recordings = new Map();
        this.fetch = fetch;

        /**
         * The music's recordings asked for ("instrument key"), those that couldn't be had
         * (offline, say: the music plays without them), and their MP3s, kept once they're decoded
         * (to decode again once they're let go of: MUSIC_KEPT); each score's recordings being
         * downloaded since it was first wanted (name → promise); and when each score was last
         * heard (name → ms: now()).
         */
        this.asked = new Set();
        this.lost = new Set();
        this.musicMp3s = new Map();
        this.scoresWanted = new Map();
        this.scoreHeard = new Map();

        /** The browser's copies: sounds' (name → [variant]) and instruments' ("instrument key"). */
        this.buffers = new Map();
        this.instruments = new Map();

        /**
         * Which made sounds are made as it starts (`ahead`: by name); those asked to be made so
         * far (names); what makes them (a worker, or null to make them on the page); and the last
         * of each wanted before it was made, to play once it is (name → { name, options, at: the
         * browser's time }: MADE_LATE).
         */
        this.ahead = ahead;
        this.making = new Set();
        this.maker = null;
        this.late = new Map();

        /**
         * Sounds' recordings (recorded.js) as the browser decodes them (name → [buffer], in
         * recorded.js's order once they're all in), played instead of the made ones once there
         * are two; and each one's as they come in (name → [buffer by variant]).
         */
        this.recorded = new Map();
        this.decoded = new Map();

        /**
         * Each recorded sound's MP3s, kept once they're decoded (name → [MP3 by variant]: small,
         * a twenty-fifth of them decoded or so), to decode again once they're let go of; how much
         * is kept decoded at most (bytes: DECODED_BUDGET); the recordings being decoded ("name
         * variant"); and the sounds decoded, the one played least lately first, each with when
         * it's done sounding (name → the browser's time): #trim.
         */
        this.mp3s = new Map();
        this.budget = budget;
        this.decoding = new Set();
        this.heard = new Map();

        /** What decodes recordings at their own sample rate, below the browser's sound's (rate → an OfflineAudioContext): #decodeData. */
        this.decoders = new Map();

        /**
         * The recorded sounds downloaded only once wanted (recorded.js ON_DEMAND) asked for so
         * far, each with its download (name → promise): want.
         */
        this.wanted = new Map();

        /** The variant of each sound played last (name → variant), not to play it twice running. */
        this.played = new Map();

        /** Where the player is (metres): sounds are heard from there. */
        this.listener = { x: 0, z: 0 };

        /** When each sound effect playing ends (the browser's time), to keep to VOICES. */
        this.sounding = [];

        /** The time now (ms), and the browser's clock when it last moved: { time, at } (for noticing it stuck). */
        this.now = () => performance.now();
        this.clock = null;
        this.stalled = false;
        this.restarted = -Infinity;
        this.ambient = false;
        this.wind = null;
        this.trees = [];
        this.nextLeaves = LEAVES[0];

        /**
         * The ambience (setAmbience): its beds (name → { gain, rate (how fast it's played), level
         * (its GainNode), next (when its next copy starts, the browser's time), copies ([source]),
         * quiet (since when it's been silent) }), and the made beds being made (synth.js BEDS,
         * by name); its calls (name → ambience.js's), and when each is next heard (name →
         * seconds from now); its murmur (a made sound's name, or null), and when it's next heard
         * (seconds from now).
         */
        this.beds = new Map();
        this.making = new Set();
        this.calls = {};
        this.due = new Map();
        this.murmur = null;
        this.nextMurmur = 0;
        this.hearth = null;
        this.nextCrackle = 0;
        this.music = null;
        this.ready = null;

        /**
         * Where the player is (a PLACES key), the land's score (LANDS), whether they're in a
         * fight, the music heard (`musicHeard`: PLACES', its score the land's, or FIGHTING), how
         * long the fade to what's wanted is to be once its recordings are in (`waiting`, seconds,
         * or null), and each score's playing: { name, score, start, index, loop, channels, output,
         * filter, fading (when it's faded out, played on till then; or null) }.
         */
        this.place = "town";
        this.land = "town";
        this.battle = false;
        this.musicHeard = { ...PLACES.town, score: "town" };
        this.waiting = null;
        this.tracks = {};
        this.timer = null;
    }

    /** Can sound be heard (started, on, and the page showing)? */
    get playing() {
        return Boolean(this.context && this.enabled && !this.hidden && this.context.state === "running");
    }

    /**
     * Start making the sounds (once), in a worker: those made ahead (MADE_AHEAD), the rest as each
     * is first wanted (#make); and downloading the music's recordings. Resolves when those made
     * ahead are made (`downloading` when the recordings are downloaded).
     */
    prepare() {
        const first = this.#musicFiles(FIRST);

        this.downloading ??= this.#download([...first, ...recordedFiles()]);
        this.#wantScore(this.#wanted().score);
        this.ready ??= new Promise((resolve) => {
            const ahead = Object.keys(SOUNDS).filter((name) => this.ahead(name));
            const here = async () => {
                this.maker?.terminate();
                this.maker = null;

                // (Those asked of the worker meanwhile, too)
                for (const name of [...new Set([...ahead, ...this.making])]) {
                    if (!this.#made(name)) {
                        await this.#makeHere(name);
                    }
                }

                this.#receive({ name: "wind", variant: 0, samples: wind() });
                resolve();
            };

            ahead.forEach((name) => this.making.add(name));

            try {
                this.maker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
                this.maker.addEventListener("message", ({ data }) => {
                    if (data.done) {
                        resolve();
                    } else if (data.made) {
                        this.#playLate(data.made);
                    } else {
                        this.#receive(data);
                    }
                });
                this.maker.addEventListener("error", (event) => {
                    event.preventDefault();
                    here();
                });
                this.maker.postMessage({ ahead });
            } catch {
                // (No module workers here: make them on the page, a little at a time)
                here();
            }
        });

        return this.ready;
    }

    // A made sound wanted that isn't made yet (MADE_AHEAD): made now, once, in the worker; or on
    // the page, a little at a time, where there's none
    #make(name) {
        if (this.making.has(name) || !SOUNDS[name]) {
            return;
        }

        this.making.add(name);

        if (this.maker) {
            this.maker.postMessage({ make: name });
        } else {
            this.#makeHere(name);
        }
    }

    // A made sound made on the page, a variant at a time; then played, if it was wanted just now
    async #makeHere(name) {
        for (let variant = 0; variant < SOUNDS[name].variants; variant++) {
            this.#receive({ name, variant, samples: render(name, variant) });
            await new Promise((next) => setTimeout(next, 0));
        }

        this.#playLate(name);
    }

    // Whether a made sound's made (its samples, or the browser's copies of them)
    #made(name) {
        return this.buffers.has(name) || this.samples.has(name);
    }

    // A made sound just made, all of it: played, if it was wanted no more than MADE_LATE ago
    #playLate(name) {
        const late = this.late.get(name);

        this.late.delete(name);

        if (late && this.context && this.context.currentTime - late.at <= MADE_LATE) {
            this.play(late.name, late.options);
        }
    }

    /**
     * Start the browser's sound, if it hasn't been (call on a tap, click or key press, when
     * browsers allow it), and the music with it; or start it again, if it's stopped. Safe to
     * call again and again.
     */
    unlock() {
        // (Turned off, the browser's sound isn't started at all, so that it isn't kept working
        // on silence: it's started when it's turned on, with that tap)
        this.tapped = true;

        if (this.context || (this.enabled && this.#start())) {
            this.#revive({ tap: true });
        }
    }

    /** Start the sound again if it's stopped, without a tap (the page shown again, say). */
    wake() {
        if (this.context) {
            this.#revive();
        }
    }

    /**
     * Check the browser's sound is going, and play the music's next notes. Call every
     * SCHEDULE_MS (the sound's own timer does, once started).
     */
    tick() {
        this.#watch();
        this.scheduleMusic();
        this.#tendBeds();
    }

    // Make the browser's sound: its context, the mix (buses, compressor, limiter), the music's
    // channels and every sample the browser doesn't yet have. Returns whether it could.
    #start() {
        const Context = globalThis.AudioContext ?? globalThis.webkitAudioContext;

        if (!Context) {
            return false;
        }

        const context = new Context({ latencyHint: "interactive" });
        const compressor = context.createDynamicsCompressor();
        const limiter = context.createDynamicsCompressor();

        this.context = context;
        this.master = context.createGain();
        this.master.gain.value = this.enabled ? OUTPUT : 0;

        // A little compression evens it out; the limiter keeps a busy fight from clipping
        compressor.threshold.value = -18;
        compressor.knee.value = 12;
        compressor.ratio.value = 3;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.25;
        limiter.threshold.value = LIMIT;
        limiter.knee.value = 0;
        limiter.ratio.value = 20;
        limiter.attack.value = 0.001;
        limiter.release.value = 0.1;
        this.master.connect(compressor).connect(limiter).connect(context.destination);

        for (const bus of BUSES) {
            this.buses[bus] = context.createGain();
            this.buses[bus].gain.value = gainOf(this.volumes[bus]);
            this.buses[bus].connect(this.master);
        }

        this.#buildMusic();

        for (const [name, variants] of this.samples) {
            variants.forEach((samples, variant) => this.#buffer(name, variant, samples));
        }

        for (const [id, recording] of this.recordings) {
            this.#decode(id, recording);
        }

        this.samples.clear();
        this.sounding = [];
        this.clock = null;

        // (Nothing sounding in the last one sounds in this one, its clock starting again from 0)
        for (const name of this.heard.keys()) {
            this.heard.set(name, 0);
        }

        this.#startWind();

        // Stopped by the browser rather than by us: started again
        context.addEventListener?.("statechange", () => context === this.context && context.state !== "running" && this.#revive());

        if (!this.timer) {
            this.timer = setInterval(() => this.tick(), SCHEDULE_MS);
            this.timer.unref?.();
        }

        return true;
    }

    // Start the browser's sound again if it's stopped (and it's meant to be playing): resumed if
    // suspended or interrupted; in a tap (or stuck), suspended first, as Safari on iPhones won't
    // resume an interrupted or stuck one otherwise (without a tap, an interrupted one is only
    // asked to resume, which it does when the interruption's over: suspended without a tap,
    // Safari might not let it); made anew if closed. Safari also wants something played in a
    // tap, so a moment of silence is.
    #revive({ tap = false } = {}) {
        const context = this.context;

        if (!context || !this.enabled || this.hidden || (context.state === "running" && !this.stalled)) {
            return;
        }

        if (context.state === "closed") {
            this.#rebuild();

            return;
        }

        try {
            const silence = context.createBufferSource();

            silence.buffer = context.createBuffer(1, 1, context.sampleRate);
            silence.connect(context.destination);
            silence.start();
        } catch {
            // (Only silence: nothing lost)
        }

        if (context.state !== "suspended" && (tap || this.stalled)) {
            context.suspend().catch(() => {});
        }

        context.resume().catch(() => {});
        this.stalled = false;
        this.clock = null;
    }

    // Notice the browser's clock standing still while it says it's playing: start it again, or,
    // if it was started again for that lately and is stuck again, make it anew
    #watch() {
        const context = this.context;
        const now = this.now();

        if (!context || context.state !== "running" || !this.enabled || this.hidden) {
            this.clock = null;

            return;
        }

        if (!this.clock || context.currentTime > this.clock.time) {
            this.clock = { time: context.currentTime, at: now };
            this.stalled = false;

            return;
        }

        if (now - this.clock.at < STALL * 1000) {
            return;
        }

        this.stalled = true;

        if (now - this.restarted < STALL * 4000) {
            this.#rebuild();
        } else {
            this.restarted = now;
            this.#revive();
        }
    }

    // Make the browser's sound anew (it's closed, or stuck however it's started again), keeping
    // every sample it had, and carrying the music on from where it was
    #rebuild() {
        const old = this.context;
        const music = this.music;
        const next = music?.score.notes[music.index];

        this.context = null;
        this.wind = null;

        for (const bed of this.beds.values()) {
            Object.assign(bed, { level: null, next: null, copies: [] });
        }

        try {
            old?.close?.()?.catch?.(() => {});
        } catch {
            // (Already closed)
        }

        if (!this.#start()) {
            return;
        }

        if (music && music.start !== null && next) {
            this.music.start = this.context.currentTime + 0.3 - this.music.loop * music.score.length - next.time;
        }

        this.stalled = false;
        this.restarted = -Infinity;
        this.#revive();
    }

    /** Turn it all on or off. */
    setEnabled(on) {
        this.enabled = on;

        // (Not started yet: turned on after a tap (the switch's), started now)
        if (!this.context) {
            if (on && this.tapped) {
                this.unlock();
            }

            return;
        }

        // (Turned on with a tap on the switch)
        if (on) {
            this.#revive({ tap: true });
        }

        this.#fade(on ? OUTPUT : 0);

        // Off, the browser needn't keep working on it
        if (!on) {
            setTimeout(() => !this.enabled && this.context.suspend().catch(() => {}), FADE * 3000);
        }
    }

    /** Set how loud a bus is ("effects", "environment" or "music"; 0 to 1). */
    setVolume(bus, volume) {
        this.volumes[bus] = Math.max(0, Math.min(1, volume));

        const gain = this.buses[bus]?.gain;

        if (gain) {
            const now = this.context.currentTime;

            gain.cancelScheduledValues(now);
            gain.setValueAtTime(gain.value, now);
            gain.linearRampToValueAtTime(gainOf(this.volumes[bus]), now + FADE);
        }
    }

    /** Silence everything while the page is hidden (another tab or app), and bring it back after. */
    setHidden(hidden) {
        this.hidden = hidden;

        if (!this.context) {
            return;
        }

        if (hidden) {
            this.context.suspend().catch(() => {});
        } else {
            this.#revive();
        }
    }

    /**
     * Say where the player is (a PLACES key: the town, or a floor of the tavern), for the music
     * heard there: from the town into the tavern, the town's music fades into the tavern's, from
     * its start; back out, the town's comes back where it left off; upstairs, the tavern's is
     * quieter and muffled.
     */
    setPlace(place) {
        if (!PLACES[place] || place === this.place) {
            return;
        }

        this.place = place;
        this.#follow(CROSSFADE);
    }

    /**
     * Say whose lands the player's in (a people's id: overworld.homeAt), for the music heard out
     * in them and through their buildings' walls: their own (LANDS), faded over (LAND_FADE) as
     * they cross into them, where it left off. In the wild between (null), and once they're
     * indoors, it stays as it was.
     */
    setLand(people) {
        const score = LANDS[people];

        if (!score || score === this.land) {
            return;
        }

        this.land = score;
        this.#follow(LAND_FADE);
    }

    /**
     * Say whether the player's in a fight (the game says it's done a while after the last blow):
     * a fight's music fades in over whatever's heard, from its start (BATTLE_IN), and once
     * it's done, what's heard where they are fades back where it left off (BATTLE_OUT).
     */
    setBattle(on) {
        if (Boolean(on) === this.battle) {
            return;
        }

        this.battle = Boolean(on);
        this.#follow(on ? BATTLE_IN : BATTLE_OUT);
    }

    // The music to be heard now: a fight's, in one (where a fight's music is heard), else where
    // the player is (the land's, where it's heard)
    #wanted() {
        const here = PLACES[this.place];

        if (this.battle && here.fights !== false) {
            return FIGHTING;
        }

        return here.score === "land" ? { ...here, score: this.land } : here;
    }

    // Fade to the music to be heard now from what was: from one score to another over `seconds`
    // (the new one from its start, or where it left off), or the same one to its level and how
    // muffled it is there (THROUGH_FLOOR). A score whose recordings aren't in yet is asked for,
    // what's heard playing on till they are (`waiting`: scheduleMusic fades over then)
    #follow(seconds) {
        const was = this.musicHeard;
        const now = this.#wanted();

        this.#wantScore(now.score);

        if (this.context && now.score !== was.score && this.tracks[was.score]?.start !== null && !this.#ready(now.score)) {
            const track = this.tracks[was.score];
            const time = this.context.currentTime;

            // (Meanwhile what's heard is as loud and as muffled as the new one will be here)
            for (const [param, to] of [[track.output.gain, now.level], [track.filter?.frequency, now.muffle ?? CLEAR]]) {
                if (param) {
                    param.cancelScheduledValues(time);
                    param.setValueAtTime(param.value, time);
                    param.linearRampToValueAtTime(to, time + THROUGH_FLOOR);
                }
            }

            this.waiting = seconds;

            return;
        }

        this.waiting = null;
        this.musicHeard = now;

        if (now.score !== was.score) {
            this.scoreHeard.set(was.score, this.now());
        }

        // (Not started yet: the music starts where the player is)
        if (!this.context) {
            this.music = this.tracks[now.score] ?? this.music;

            return;
        }

        const time = this.context.currentTime;
        const ramp = (param, to, over) => {
            param.cancelScheduledValues(time);
            param.setValueAtTime(param.value, time);
            param.linearRampToValueAtTime(to, time + over);
        };
        const track = this.tracks[now.score];

        // (As much lower as it's played here, from its next note)
        track.shift = now.shift ?? 0;

        if (was.score !== now.score) {
            const old = this.tracks[was.score];

            // (Played on till it's faded out)
            ramp(old.output.gain, 0, seconds);
            old.fading = time + seconds;

            if (track.fading > time && track.start !== null) {
                // Still fading out, so heard: on from where it's got to
            } else if (FROM_THE_START.has(now.score) || track.start === null) {
                // From the start (once every recording is ready)
                Object.assign(track, { start: null, index: 0, loop: 0 });
            } else {
                // Where it was, its next note in a moment
                const next = track.score.notes[track.index];

                track.start = time + 0.3 - track.loop * track.score.length - next.time;
            }

            track.fading = null;
            this.music = track;
        }

        ramp(track.output.gain, now.level, was.score !== now.score ? seconds : THROUGH_FLOOR);

        if (track.filter) {
            ramp(track.filter.frequency, now.muffle ?? CLEAR, THROUGH_FLOOR);
        }
    }

    /** While the game is paused, no birds sing or leaves rustle (the music and wind go on). */
    setPaused(paused) {
        this.paused = paused;
    }

    /** Where the player is (metres), for hearing everything from. */
    setListener(x, z) {
        this.listener.x = x;
        this.listener.z = z;
    }

    /** Where the trees are ([{ x, z }] metres), for hearing their leaves. */
    setTrees(trees) {
        this.trees = trees;
    }

    /** Where a fire is burning near the player ({ x, z } metres: the tavern's hearth), to hear it crackle; or null. */
    setHearth(at) {
        this.hearth = at;
    }

    /**
     * What the ambience is where the player is (ambience.js ambienceOf): { beds ({ name: how
     * loud }: each looped, fading to it; any not named fading out; recorded, or made, synth.js
     * BEDS), rates ({ name: how fast a bed's played, 1 as it is: lower and slower under 1; a
     * made bed's sliding to it, a recorded one's from its next copy }), calls ({ name:
     * ambience.js CALLS' with how loud, how often and where from }), wants (more to download:
     * the folk at work's sounds), murmur (a made sound heard over and over from round about,
     * MURMUR, or null) }. Each downloaded now if it isn't yet (a made bed made once it's heard).
     */
    setAmbience({ beds = {}, rates = {}, calls = {}, wants = [], murmur = null } = {}) {
        // (The beds first, on their own: not to wait behind the calls' many short recordings)
        this.want(Object.keys(beds));
        this.want([...Object.keys(calls), ...wants]);

        for (const [name, bed] of this.beds) {
            if (!(name in beds)) {
                bed.gain = 0;
            }
        }

        for (const [name, gain] of Object.entries(beds)) {
            const bed = this.beds.get(name) ?? { gain: 0, rate: 1, level: null, next: null, copies: [], quiet: null };

            bed.gain = gain;
            bed.rate = rates[name] ?? 1;
            this.beds.set(name, bed);
        }

        // (A call newly heard: first heard somewhere in its usual wait, not all at once)
        for (const [name, { every, often }] of Object.entries(calls)) {
            if (!this.due.has(name)) {
                this.due.set(name, (Math.random() * every[1]) / often);
            }
        }

        for (const name of this.due.keys()) {
            if (!calls[name]) {
                this.due.delete(name);
            }
        }

        this.calls = calls;
        this.murmur = murmur;
        this.#tendBeds();
    }

    /** Let the wind blow and leaves rustle (in the game, out of doors), or not. */
    setAmbient(on) {
        this.ambient = on;

        if (on) {
            this.#startWind();
        } else {
            this.wind?.source.stop();
            this.wind = null;
        }
    }

    /** The ambience's calls and the leaves, and the hearth's crackling, now and then. Call every frame. */
    update(dt) {
        if (this.paused || !this.playing) {
            return;
        }

        if (this.hearth) {
            this.nextCrackle -= dt;

            if (this.nextCrackle <= 0) {
                this.nextCrackle = CRACKLES[0] + Math.random() * (CRACKLES[1] - CRACKLES[0]);
                this.play("crackle", { at: this.hearth, volume: 0.6 + Math.random() * 0.4, rate: 0.85 + Math.random() * 0.3 });
            }
        }

        for (const [name, left] of this.due) {
            if (left > dt) {
                this.due.set(name, left - dt);
            } else {
                this.#call(name, this.calls[name]);
            }
        }

        // (The murmur, one after another from round about, each overlapping the last)
        if (this.murmur) {
            this.nextMurmur -= dt;

            if (this.nextMurmur <= 0) {
                const angle = Math.random() * 2 * Math.PI;
                const far = MURMUR.away[0] + Math.random() * (MURMUR.away[1] - MURMUR.away[0]);

                this.nextMurmur = MURMUR.every[0] + Math.random() * (MURMUR.every[1] - MURMUR.every[0]);
                this.play(this.murmur, { at: { x: this.listener.x + far * Math.cos(angle), z: this.listener.z + far * Math.sin(angle) }, volume: 0.7 + Math.random() * 0.3, rate: 0.9 + Math.random() * 0.15, far: MURMUR.heard, muffle: MURMUR.muffle });
            }
        }

        if (!this.ambient) {
            return;
        }

        this.nextLeaves -= dt;

        if (this.nextLeaves <= 0) {
            this.nextLeaves = LEAVES[0] + Math.random() * (LEAVES[1] - LEAVES[0]);

            const near = this.trees.filter(({ x, z }) => Math.hypot(x - this.listener.x, z - this.listener.z) < TREES_HEARD);

            if (near.length) {
                this.play("leaves", { at: near[Math.floor(Math.random() * near.length)], volume: 0.7 + Math.random() * 0.3, rate: 0.9 + Math.random() * 0.2 });
            }
        }
    }

    /**
     * Play a sound (a SOUNDS name) from a point in the world ({ x, z } metres; null for
     * everywhere), `volume` times its own, starting `delay` seconds from now, `rate` times as fast
     * (higher), heard no further off than `far` metres; its `variant` (by default any but the last
     * played), its `made` one rather than its recording (the sound studio's), and through a
     * low-pass filter at `muffle` Hz, if asked (heard from far off). Returns its
     * source node, or null if it isn't played (off, too far, too many).
     */
    play(name, { at = null, volume = 1, delay = 0, peakAt = null, rate = 1, far = FAR, variant = null, made = false, muffle = null } = {}) {
        const context = this.context;
        const recorded = made ? null : this.recorded.get(name);

        // (Wanted later, and not asked for yet: asked for now, for next time)
        if (!made && LATER.has(name)) {
            this.want(name);
        }

        // (Let go of past the budget: decoded again, for next time, what's made playing meanwhile)
        if (!made && !recorded && this.mp3s.has(name)) {
            this.#recall(name);
        }

        // (Recorded once two of its recordings are in, or its only one)
        const buffers = recorded?.length >= Math.min(2, RECORDED[name]?.length ?? 2) ? recorded : this.buffers.get(SOUNDS[name] ? name : RECORDED_ONLY[name]?.instead);

        // (Counting the sounds still playing by when they end, not by the browser saying they
        // have: a stuck browser never does)
        this.sounding = this.sounding.filter((end) => end > context?.currentTime);

        // (Its made sound not made yet, and nothing else to play: made now, and played as soon as
        // it is, if that's soon enough: MADE_LATE)
        const stand = SOUNDS[name] ? name : RECORDED_ONLY[name]?.instead;

        if (this.playing && !buffers?.length && SOUNDS[stand] && !this.#made(stand)) {
            this.late.set(stand, { name, options: { at, volume, delay, peakAt, rate, far, variant, made, muffle }, at: context.currentTime });
            this.#make(stand);

            return null;
        }

        if (!this.playing || !buffers?.length || this.sounding.length >= VOICES) {
            return null;
        }

        // (A recording's made quieter than a made sound, for its sharper start: played up to match;
        // some softer than the made ones, RECORDED_VOLUMES)
        const loud = (SOUNDS[name] ?? RECORDED_ONLY[name] ?? SOUNDS[RECORDED_ONLY[name]?.instead])?.volume;
        let gain = volume * (buffers === recorded ? (RECORDED_VOLUMES[name] ?? loud) * (LEVEL / RECORDED_LEVEL) : loud);
        let pan = 0;

        if (at) {
            const dx = at.x - this.listener.x;
            const distance = Math.hypot(dx, at.z - this.listener.z);

            gain *= Math.max(0, Math.min(1, 1 - (distance - NEAR) / (far - NEAR))) ** 2;
            pan = Math.max(-MOST_PAN, Math.min(MOST_PAN, dx / SIDE));
        }

        if (gain < 0.005) {
            return null;
        }

        const source = context.createBufferSource();
        const level = context.createGain();
        const bus = this.buses[(SOUNDS[name] ?? RECORDED_ONLY[name])?.bus ?? "effects"];

        // (Any variant but the one played last: the same footstep or blow twice running sounds
        // mechanical)
        const last = this.played.get(name) ?? -1;
        const pick = Math.floor(Math.random() * (buffers.length - (last >= 0 && buffers.length > 1 ? 1 : 0)));
        const chosen = buffers[variant] ? variant : last >= 0 && buffers.length > 1 && pick >= last ? pick + 1 : pick;

        this.played.set(name, chosen);
        source.buffer = buffers[chosen];
        source.playbackRate.value = rate * (0.96 + Math.random() * 0.08);
        level.gain.value = gain;
        source.connect(level);

        // (Muffled, if asked: heard through the air from far off, or through a wall)
        let out = level;

        if (muffle) {
            const filter = context.createBiquadFilter();

            filter.type = "lowpass";
            filter.frequency.value = muffle;
            out = level.connect(filter);
        }

        if (pan && context.createStereoPanner) {
            const panner = context.createStereoPanner();

            panner.pan.value = pan;
            out.connect(panner).connect(bus);
        } else {
            out.connect(bus);
        }

        // (Timed to be loudest `peakAt` seconds from now, if asked: a recording's when it's said
        // to be, a made one's as synth.js's PEAKS; too soon for it to swell to it, started that
        // far in, faded in, so it's loudest on time all the same: a cast quicker than its sound)
        const loudest = buffers === recorded ? (source.buffer.peak ?? 0) : (PEAKS[SOUNDS[name] ? name : RECORDED_ONLY[name]?.instead] ?? 0);
        const lead = peakAt === null ? delay : peakAt - loudest / source.playbackRate.value;
        const start = context.currentTime + Math.max(0, lead);
        const into = Math.min(Math.max(0, -lead) * source.playbackRate.value, source.buffer.duration);

        if (into > 0) {
            level.gain.setValueAtTime(0, start);
            level.gain.linearRampToValueAtTime(gain, start + JOIN);
        }

        const end = start + (source.buffer.duration - into) / source.playbackRate.value;

        this.sounding.push(end);

        // (A recording played: the last to be let go of, and not till it's done)
        if (buffers === recorded) {
            this.#hear(name, end);
        }

        source.addEventListener("ended", () => {
            source.disconnect();
            level.disconnect();
        });
        source.start(start, into);
        source.level = level;

        return source;
    }

    /**
     * Download recorded sounds wanted later (recorded.js ON_DEMAND: the spells'), those `names`
     * (a name, or a list), so they're in for when they're played (what's made playing in their
     * place till then, or nothing); any already asked for, or downloaded at the start, aren't
     * again. Resolves once they're all downloaded (each decoded once the browser's sound starts).
     */
    want(names) {
        const asked = [names].flat().filter((name) => LATER.has(name));
        const fresh = asked.filter((name) => !this.wanted.has(name));

        if (fresh.length) {
            const downloading = this.fetch ? this.#download(recordedFiles(fresh), WANTED_DOWNLOADS) : Promise.resolve();

            for (const name of fresh) {
                this.wanted.set(name, downloading);
            }
        }

        return Promise.all(asked.map((name) => this.wanted.get(name))).then(() => {});
    }

    /**
     * Cut a sound short (play's source: a cast broken off), fading it out quickly; nothing if
     * it's none.
     */
    cut(source) {
        const now = this.context?.currentTime;

        if (!source?.level || now === undefined) {
            return;
        }

        source.level.gain.cancelScheduledValues(now);
        source.level.gain.setValueAtTime(source.level.gain.value, now);
        source.level.gain.linearRampToValueAtTime(0, now + CUT);

        try {
            source.stop(now + CUT);
        } catch {
            // (Ended already)
        }
    }

    /**
     * An attack starting: its swing, timed to be loudest `hitAt` seconds from now, when it lands;
     * or a bow's, an arrow taken from the quiver and the string drawn back (the arrow loosed:
     * launch).
     */
    attack(animation, at, hitAt) {
        if (animation === "bow") {
            this.play("arrowQuiver", { at });

            return this.play("bowDraw", { at, delay: DRAWN });
        }

        const name = SWINGS[animation];

        return name ? this.play(name, { at, peakAt: hitAt }) : null;
    }

    /** A projectile let go ("arrow", "bolt" or "fireball"), higher or lower (`rate`) for its look. */
    launch(kind, at, { rate = 1 } = {}) {
        return LAUNCHES[kind] ? this.play(LAUNCHES[kind], { at, rate }) : null;
    }

    /**
     * A blow landing: the sound of its reaction (weapons.js: slash, strike, crush...), and under a
     * weapon's or a fist's, the `armour` it lands on (ARMOUR: mail, plate, leather; none, flesh).
     */
    hit(reaction, at, armour = null) {
        if (STRUCK.has(reaction) && ARMOUR[armour]) {
            this.play(ARMOUR[armour].hit, { at });
        }

        return SOUNDS[reaction] ? this.play(reaction, { at }) : null;
    }

    /**
     * A spell being cast (core/spells.js) from `at`, landing `castTime` seconds from now: its
     * cast swelling to then, loudest as it's let go, and its missile, if it throws one (spellSounds),
     * flying the last `travel` seconds of it, loudest halfway. Its landing's wanted now too (if
     * not in yet). Returns the cast's source, to cut short if the cast is broken off (cut).
     */
    cast(spell, at, castTime, { travel = null } = {}) {
        const { cast, missile, land } = spellSounds(spell);

        this.want([cast, missile, land].filter(Boolean));

        if (missile && travel !== null) {
            this.play(missile, { at, peakAt: Math.max(0, castTime - travel / 2) });
        }

        return cast ? this.play(cast, { at, peakAt: castTime }) : null;
    }

    /** A spell landing at `at` (its target): what it sounds like there (spellSounds), if anything. */
    landed(spell, at) {
        const { land } = spellSounds(spell);

        // (A piece of the Prismatic sigil spent on its element's spell: its glass chord rung over it)
        if (typeof SPELLS[spell]?.prismatic === "string") {
            this.play("prismaticChord", { at });
        }

        return land ? this.play(land, { at, volume: HUSHED[spell] ?? 1 }) : null;
    }

    /**
     * Someone carried off by magic (Teleport, Word of Recall, Wizard's Walk, a summons, a Scroll
     * of Safety): gone from `from` with a pop, come to `to` with one a moment later (null where
     * it isn't heard; the player's own, `mine`, heard wherever they go).
     */
    carried(from, to, { mine = false } = {}) {
        if (mine || from) {
            this.play("teleportOut", { at: mine ? null : from });
        }

        if (mine || to) {
            this.play("teleportIn", { at: mine ? null : to, delay: ARRIVED });
        }
    }

    /**
     * One of the wild's creatures (CREATURE_VOICES) heard from `at`: calling (`what` "call": it's
     * seen someone to go after, or it's about its business), attacking ("attack", loudest `hitAt`
     * seconds from now, as its blow lands), hurt ("hurt") or dying ("death"), `delay` seconds
     * from now, as its family sounds at its own pitch; with what's heard with it (a magma slime's
     * sizzle, the bats' fluttering: under all but its hurt); heard as far off as a call or a blow
     * is, or `far` metres. Returns its source, or null if it has no such voice.
     */
    voice(creature, what, at, { hitAt = null, delay = 0, far = null } = {}) {
        const voice = CREATURE_VOICES[creature];
        const name = voice ? uttered(voice.family, what) : null;

        if (!RECORDED_ONLY[name]) {
            return null;
        }

        if (voice.with && what !== "hurt") {
            this.play(voice.with, { at, delay });
        }

        return this.play(name, { at, rate: voice.rate ?? 1, delay, peakAt: hitAt, far: far ?? (what === "call" ? CALL_FAR : FAR) });
    }

    /**
     * A footstep on a footing (audio/footing.js SURFACES), `delay` seconds from now, `volume`
     * times as loud: at `speed` (m/s: walking, faster louder; or running, louder still and
     * brighter), by one `size` big (a person's 1: FOOTSTEPS) on its `feet` (GAITS; null, none: it
     * floats, and isn't heard), in its `armour` (ARMOUR: heard with the step); `variant` and
     * `made` as play's.
     */
    step(surface, at, { speed = 1.5, size = 1, feet = "feet", armour = null, delay = 0, volume = 1, variant = null, made = false } = {}) {
        const gait = GAITS[feet];

        if (!gait) {
            return null;
        }

        const [least, most] = FOOTSTEPS.sizes;
        const big = Math.max(least, Math.min(most, size));
        const pace = speed / Math.sqrt(big);
        const running = pace > FOOTSTEPS.running;
        const loud = (running ? FOOTSTEPS.run : FOOTSTEPS.walk + FOOTSTEPS.pace * pace) * big ** FOOTSTEPS.weight * gait.volume;
        const lilt = 1 + FOOTSTEPS.jitter * (2 * Math.random() - 1);

        const rate = ((running ? 1.08 : 1) * gait.rate) / big ** 0.25;
        const worn = ARMOUR[armour];

        // (What they wear heard with it: mail's jingle, plate's clank; leather's swish running)
        if (worn && (running || !worn.running)) {
            this.play(worn.step, { at, volume: volume * loud * lilt * worn.with, delay, far: FOOTSTEPS.far, rate, made });
        }

        return this.play(gait.sound ?? STEPS[surface] ?? "stepDirt", { at, volume: volume * loud * lilt, delay, far: gait.far ?? FOOTSTEPS.far, rate, variant, made });
    }

    /**
     * What the sounds hold (bytes): the browser's decoded copies (outside the page's heap, so the
     * browser's heap size never shows them) and the samples and recordings kept to make them (the
     * recorded sounds' MP3s among them, kept to decode them again) (the debug overlay and log:
     * app/telemetry.js).
     */
    memory() {
        const seen = new Set();
        let bytes = 0;

        for (const kept of [this.samples, this.recordings, this.mp3s, this.musicMp3s, this.buffers, this.instruments, this.decoded]) {
            for (const value of kept.values()) {
                for (const each of [value].flat()) {
                    if (each && !seen.has(each)) {
                        seen.add(each);
                        bytes += bytesOf(each);
                    }
                }
            }
        }

        return bytes;
    }

    // Keep a sound's samples, and give the browser a copy if it's started
    #receive({ name, variant, samples }) {
        if (this.context) {
            this.#buffer(name, variant, samples);
        } else {
            const variants = this.samples.get(name) ?? [];

            variants[variant] = samples;
            this.samples.set(name, variants);
        }

        if (name === "wind") {
            this.#startWind();
        }
    }

    #buffer(name, variant, samples) {
        const buffer = this.context.createBuffer(1, samples.length, SAMPLE_RATE);
        const variants = this.buffers.get(name) ?? [];

        buffer.getChannelData(0).set(samples);
        variants[variant] = buffer;
        this.buffers.set(name, variants);
    }

    // Download the music's recordings and the recorded sounds (or those `files`), `count` at a
    // time, and have the browser decode them once it's started
    async #download(files = [...sampleFiles(), ...recordedFiles()], count = DOWNLOADS) {
        let next = 0;

        const worker = async () => {
            while (next < files.length) {
                const [id, url] = files[next++];

                try {
                    const response = await this.fetch(url);

                    if (!response.ok) {
                        throw new Error(`${url}: ${response.status}`);
                    }

                    this.recordings.set(id, await response.arrayBuffer());

                    if (this.context) {
                        this.#decode(id, this.recordings.get(id));
                    }
                } catch {
                    // (Offline, say: the music just doesn't play, or plays without it; a recorded
                    // sound's made one plays instead)
                    if (!RECORDED[id.split(" ")[0]]) {
                        this.lost.add(id);
                    }
                }
            }
        };

        await Promise.all(Array.from({ length: count }, worker));
    }

    #decode(id, recording) {
        const [name] = id.split(" ");

        this.recordings.delete(id);

        if (RECORDED[name]) {
            const variant = Number(id.split(" ")[1]);
            const mp3s = this.mp3s.get(name) ?? [];

            // (Its MP3 kept, to decode again once it's let go of: the browser's given a copy to
            // decode, as it takes what it's given, leaving the page's empty)
            mp3s[variant] = recording;
            this.mp3s.set(name, mp3s);
            this.decoding.add(id);
            this.#decodeData(recording).then(
                (buffer) => {
                    const variants = this.decoded.get(name) ?? [];

                    // (A swing's loudest moment, to time it to the blow: play's peakAt)
                    buffer.peak = RECORDED[name][variant].peak ?? 0;
                    variants[variant] = buffer;
                    this.decoding.delete(id);
                    this.decoded.set(name, variants);
                    this.recorded.set(name, variants.filter(Boolean));
                    this.#hear(name);

                    // (Any of its others let go of meanwhile decoded again with it; and past the
                    // budget, what's played least lately let go of)
                    this.#recall(name);
                    this.#trim(name);
                },
                () => {
                    // (It can't be: its made one plays, as if it couldn't be downloaded)
                    this.decoding.delete(id);
                    mp3s[variant] = null;
                },
            );
        } else {
            // (Its MP3 kept, to decode again once it's let go of: #restMusic)
            this.musicMp3s.set(id, recording);
            this.decoding.add(id);
            this.#decodeData(recording).then(
                (buffer) => {
                    this.decoding.delete(id);
                    this.instruments.set(id, buffer);
                },
                () => {
                    this.decoding.delete(id);
                    this.lost.add(id);
                },
            );
        }
    }

    // A recording (its MP3, kept: the browser's given a copy to decode, as it takes what it's
    // given, leaving the page's empty) decoded at the rate it was recorded at, where that's below
    // the browser's sound's: the music's and the beds' are 32 kHz, and decoded at the browser's 48
    // (an iPhone's) they'd hold half as much again for nothing that's heard (each played at a rate
    // of its own anyway, a note's pitch or a sound's lilt, as the made sounds' 48 kHz are where
    // the browser's 44.1). Where it can't be (no OfflineAudioContext, or one that won't), at the
    // browser's sound's, as before
    #decodeData(recording) {
        const rate = mp3Rate(recording);
        const decode = () => this.context.decodeAudioData(recording.slice(0));

        if (!rate || rate >= this.context.sampleRate || !globalThis.OfflineAudioContext) {
            return decode();
        }

        if (!this.decoders.has(rate)) {
            try {
                this.decoders.set(rate, new globalThis.OfflineAudioContext(1, 1, rate));
            } catch {
                this.decoders.set(rate, null);
            }
        }

        const decoder = this.decoders.get(rate);

        return decoder ? decoder.decodeAudioData(recording.slice(0)).catch(decode) : decode();
    }

    // The music's recordings for the scores `names` not asked for yet (nor had already), asked
    // for now
    #musicFiles(names) {
        const had = (id) => this.asked.has(id) || this.recordings.has(id) || this.instruments.has(id) || this.musicMp3s.has(id);
        const files = [...new Map(names.flatMap((name) => scoreFiles(SCORES[name]))).entries()].filter(([id]) => !had(id));

        for (const [id] of files) {
            this.asked.add(id);
        }

        return files;
    }

    // A score wanted: its recordings downloaded, if they aren't yet (a few at a time, not to hold
    // up the rest), and any let go of decoded again from their MP3s
    #wantScore(name) {
        const files = this.#musicFiles([name]);

        if (files.length && this.fetch && !this.scoresWanted.has(name)) {
            this.scoresWanted.set(name, this.#download(files, WANTED_DOWNLOADS));
        }

        if (this.context && this.context.state !== "closed") {
            for (const [id] of scoreFiles(SCORES[name])) {
                const mp3 = this.musicMp3s.get(id);

                if (mp3 && !this.instruments.has(id) && !this.decoding.has(id)) {
                    this.recordings.set(id, mp3);
                    this.#decode(id, mp3);
                }
            }
        }
    }

    // Whether a score can start: each recording it plays in (decoded), or known it can't be had,
    // and one of them in at least
    #ready(name) {
        const ids = scoreFiles(SCORES[name]).map(([id]) => id);

        return ids.some((id) => this.instruments.has(id)) && ids.every((id) => this.instruments.has(id) || this.lost.has(id));
    }

    // Let go of the decoded recordings no score heard lately plays (not one of FIRST's, nor
    // what's heard or wanted, nor one heard in the last MUSIC_KEPT), their MP3s kept
    #restMusic() {
        const now = this.now();
        const kept = new Set([...FIRST, this.musicHeard.score, this.#wanted().score]);

        for (const [name, heard] of this.scoreHeard) {
            if (now - heard < MUSIC_KEPT * 1000) {
                kept.add(name);
            }
        }

        const playing = new Set([...kept].flatMap((name) => scoreFiles(SCORES[name]).map(([id]) => id)));

        for (const id of this.instruments.keys()) {
            if (!playing.has(id) && this.musicMp3s.has(id)) {
                this.instruments.delete(id);
            }
        }
    }

    // A recorded sound let go of, decoded again from its MP3s (those of them not decoded already,
    // nor being)
    #recall(name) {
        const decoded = this.decoded.get(name);

        if (!this.context || this.context.state === "closed") {
            return;
        }

        this.mp3s.get(name)?.forEach((mp3, variant) => {
            if (mp3 && !decoded?.[variant] && !this.decoding.has(`${name} ${variant}`)) {
                this.#decode(`${name} ${variant}`, mp3);
            }
        });
    }

    // A recorded sound played, or decoded: the last of them now to be let go of, and not before
    // it's done sounding (`until`, the browser's time)
    #hear(name, until = 0) {
        const was = this.heard.get(name) ?? 0;

        this.heard.delete(name);
        this.heard.set(name, Math.max(was, until));
    }

    // Past the budget, the recorded sounds played least lately let go of till it's kept to: never
    // one sounding (a bed heard, or still fading; a sound played and not done), one being decoded,
    // or `fresh`, just decoded (it's wanted now: never let go of before it's heard). (Should those
    // come to more than the budget, the rest are let go of once they're done, as the next sound's
    // decoded: what's decoded only grows as something is.)
    #trim(fresh) {
        const held = (name) => (this.decoded.get(name) ?? []).reduce((bytes, buffer) => bytes + bytesOf(buffer), 0);
        const now = this.context?.currentTime ?? 0;
        let bytes = 0;

        for (const name of this.decoded.keys()) {
            bytes += held(name);
        }

        for (const [name, until] of this.heard) {
            if (bytes <= this.budget) {
                return;
            }

            const bed = this.beds.get(name);
            const busy = name === fresh || until > now || bed?.level || bed?.gain > 0 || RECORDED[name].some((_, variant) => this.decoding.has(`${name} ${variant}`));

            if (!busy) {
                bytes -= held(name);
                this.#release(name);
            }
        }
    }

    // A recorded sound let go of: its decoded copies (big) dropped, its MP3s kept to decode again
    #release(name) {
        this.recorded.delete(name);
        this.decoded.delete(name);
        this.heard.delete(name);
    }

    // A call heard now (ambience.js CALLS): from a tree near, if it's a tree's, or from where it's
    // said to be, or from somewhere round the player; and when it's next heard
    #call(name, { every, often, volume, away, tree, at, heard, muffle = null, pitch = 1 }) {
        let from = at;

        if (tree) {
            const near = this.trees.filter(({ x, z }) => Math.hypot(x - this.listener.x, z - this.listener.z) < heard);

            from = near[Math.floor(Math.random() * near.length)];
        } else if (!from) {
            const angle = Math.random() * 2 * Math.PI;
            const far = away[0] + Math.random() * (away[1] - away[0]);

            from = { x: this.listener.x + far * Math.cos(angle), z: this.listener.z + far * Math.sin(angle) };
        }

        this.due.set(name, (every[0] + Math.random() * (every[1] - every[0])) / often);

        if (from) {
            this.play(name, { at: from, volume: volume * (0.75 + Math.random() * 0.25), rate: pitch * (0.94 + Math.random() * 0.12), far: heard, muffle });
        }
    }

    // The beds: each fading to its loudness; the next copy of each sounding one set going a little
    // ahead, to fade in as the last fades out (its recording's crossfade longer than its loop), at
    // its rate; a made one (synth.js BEDS) made once it's wanted, then looped whole, sliding to its
    // rate; those silent stopped, and let go of after a while; the made wind blowing until a
    // recorded one is. Called with every tick, and whenever the ambience changes.
    #tendBeds() {
        const context = this.context;

        if (!context) {
            return;
        }

        const now = context.currentTime;
        let blowing = false;

        for (const [name, bed] of this.beds) {
            const made = BEDS[name];
            const buffer = made ? this.buffers.get(name)?.[0] : this.recorded.get(name)?.[0];
            const loop = RECORDED[name]?.[0]?.loop;

            if (!bed.level && buffer && bed.gain > 0) {
                bed.level = context.createGain();
                bed.level.gain.value = 0;
                bed.level.connect(this.buses.environment);
                bed.target = 0;
            }

            if (!bed.level) {
                // (Heard again, let go of past the budget while it was silent: decoded again; a
                // made one, wanted: made)
                if (bed.gain > 0 && !buffer) {
                    if (made) {
                        this.#makeBed(name);
                    } else {
                        this.#recall(name);
                    }
                }

                // (Silent so long: forgotten)
                bed.quiet = bed.gain > 0 ? null : (bed.quiet ?? now);

                if (bed.quiet !== null && now - bed.quiet > BED_KEPT) {
                    this.#letGo(name);
                }

                continue;
            }

            const gain = bed.gain * (made ? made.volume : RECORDED_ONLY[name].volume * (LEVEL / RECORDED_LEVEL));

            if (bed.target !== gain) {
                bed.target = gain;
                bed.level.gain.cancelScheduledValues(now);
                bed.level.gain.setValueAtTime(bed.level.gain.value, now);
                bed.level.gain.linearRampToValueAtTime(gain, now + BED_FADE);
                bed.quiet = gain > 0 ? null : now + BED_FADE;
            }

            if (made) {
                this.#loopMade(bed, buffer, gain, now);
            } else if (gain > 0 && (bed.next === null || bed.next - now < BED_AHEAD)) {
                this.#copy(bed, buffer, loop, Math.max(bed.next ?? now, now + 0.02), bed.next === null);
                this.#hear(name);
            }

            blowing ||= WINDS.includes(name) && gain > 0;

            // (Faded out: stopped; and in a while, its recording let go of)
            if (gain === 0 && bed.quiet !== null && now > bed.quiet) {
                for (const source of bed.copies) {
                    try {
                        source.stop();
                    } catch {
                        // (Ended already)
                    }
                }

                bed.level.disconnect();
                Object.assign(bed, { level: null, next: null, copies: [] });
            }
        }

        // (The made wind until a recorded one's blowing)
        if (this.wind) {
            const to = blowing ? 0 : WIND;

            if (this.wind.target !== to) {
                this.wind.target = to;
                this.wind.level.gain.cancelScheduledValues(now);
                this.wind.level.gain.setValueAtTime(this.wind.level.gain.value, now);
                this.wind.level.gain.linearRampToValueAtTime(to, now + BED_FADE);
            }
        }
    }

    // A made bed (synth.js BEDS) looped whole once it's sounding, as the wind is (made to loop
    // without a seam): started as it's first heard, sliding to its rate as that changes
    #loopMade(bed, buffer, gain, now) {
        const [source] = bed.copies;

        if (!source && gain > 0) {
            const looped = this.context.createBufferSource();

            looped.buffer = buffer;
            looped.loop = true;
            looped.playbackRate.value = bed.rate;
            looped.connect(bed.level);
            looped.start(now + 0.02);
            looped.addEventListener("ended", () => looped.disconnect());
            bed.copies = [looped];
            bed.playing = bed.rate;
        } else if (source && bed.playing !== bed.rate) {
            source.playbackRate.cancelScheduledValues(now);
            source.playbackRate.setValueAtTime(source.playbackRate.value, now);
            source.playbackRate.linearRampToValueAtTime(bed.rate, now + BED_FADE);
            bed.playing = bed.rate;
        }
    }

    // A made bed wanted (synth.js BEDS): made once, away from the page in a worker (worker.js), or
    // on it, a moment later, where there's no worker; looped once it's in (#tendBeds)
    #makeBed(name) {
        if (this.making.has(name)) {
            return;
        }

        // (Unless it's been forgotten meanwhile)
        const done = (samples) => {
            this.making.delete(name);

            if (this.beds.has(name)) {
                this.#receive({ name, variant: 0, samples });
            }
        };
        const here = () => setTimeout(() => done(BEDS[name].make()), 0);

        this.making.add(name);

        try {
            const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });

            worker.addEventListener("message", ({ data }) => {
                worker.terminate();
                done(data.samples);
            });
            worker.addEventListener("error", (event) => {
                event.preventDefault();
                worker.terminate();
                here();
            });
            worker.postMessage({ bed: name });
        } catch {
            // (No module workers here)
            here();
        }
    }

    // A copy of a bed's recording, starting `at` (the browser's time): fading in over its loop's
    // crossfade (or at once, the first: the bed's own level fades it in), playing its loop's
    // length, fading out over the crossfade as the next copy fades in; each the longer the slower
    // it's played (its rate: under 1, slower and lower)
    #copy(bed, buffer, [length, crossfade], at, first) {
        const source = this.context.createBufferSource();
        const envelope = this.context.createGain();

        [length, crossfade] = [length / bed.rate, crossfade / bed.rate];
        source.buffer = buffer;
        source.playbackRate.value = bed.rate;

        if (!first) {
            envelope.gain.setValueCurveAtTime(RISE, at, crossfade);
        }

        envelope.gain.setValueCurveAtTime(FALL, at + length, crossfade);
        source.connect(envelope).connect(bed.level);
        source.start(at);
        source.stop(at + length + crossfade);
        source.addEventListener("ended", () => {
            source.disconnect();
            envelope.disconnect();
            bed.copies = bed.copies.filter((copy) => copy !== source);
        });
        bed.copies.push(source);
        bed.next = at + length;
    }

    // A bed not heard for a while forgotten: its recording let go of (big, decoded), to be
    // decoded again from its MP3 should it be wanted again
    #letGo(name) {
        this.beds.delete(name);

        // (A made one: made again, should it be wanted again)
        if (BEDS[name]) {
            this.buffers.delete(name);

            return;
        }

        this.#release(name);

        // (None of it in, as when it couldn't be downloaded: downloaded again, should it be
        // wanted again)
        if (!this.mp3s.get(name)?.some(Boolean)) {
            this.wanted.delete(name);
        }
    }

    #startWind() {
        const buffer = this.buffers.get("wind")?.[0];

        if (!this.ambient || this.wind || !buffer) {
            return;
        }

        const source = this.context.createBufferSource();
        const level = this.context.createGain();

        source.buffer = buffer;
        source.loop = true;
        level.gain.value = WIND;
        source.connect(level).connect(this.buses.environment);
        source.start();
        this.wind = { source, level, target: WIND };
        this.#tendBeds();
    }

    // The music's tracks, one for each score: a channel for each instrument it plays (its level
    // and place), into the score's own level (for fading it in and out) and filter (muffling it
    // upstairs), then dry and through a reverb
    #buildMusic() {
        const context = this.context;
        const reverb = context.createConvolver();
        const send = context.createGain();
        const here = this.#wanted();

        reverb.buffer = hall(context, REVERB_TIME);
        send.gain.value = REVERB_SEND;
        send.connect(reverb).connect(this.buses.music);

        for (const [name, score] of Object.entries(SCORES)) {
            const output = context.createGain();
            const filter = context.createBiquadFilter?.() ?? null;
            const channels = {};

            output.gain.value = here.score === name ? here.level : 0;

            if (filter) {
                filter.type = "lowpass";
                filter.frequency.value = here.score === name && here.muffle ? here.muffle : CLEAR;
                filter.Q.value = 0.5;
                output.connect(filter);
            }

            (filter ?? output).connect(this.buses.music);
            (filter ?? output).connect(send);

            for (const instrument of new Set(score.notes.map((note) => note.instrument))) {
                const level = context.createGain();

                level.gain.value = INSTRUMENTS[instrument].mix * MUSIC_LEVEL;

                if (context.createStereoPanner) {
                    const panner = context.createStereoPanner();

                    panner.pan.value = INSTRUMENTS[instrument].pan;
                    level.connect(panner).connect(output);
                } else {
                    level.connect(output);
                }

                channels[instrument] = level;
            }

            // (Where each score has got to is kept when the browser's sound is made anew)
            this.tracks[name] = { start: null, index: 0, loop: 0, ...this.tracks[name], name, score, channels, output, filter, fading: null };
        }

        this.musicHeard = here;
        this.music = this.tracks[here.score];
        this.music.shift = here.shift ?? 0;
    }

    /**
     * Play the notes of the score heard where the player is that start in the next LOOKAHEAD
     * seconds, round again from its start at its end (every SCHEDULE_MS, once started); and of
     * any score fading out, till it's silent.
     */
    scheduleMusic() {
        // (What's wanted, its recordings in now, faded over to; and now and then, those no score
        // heard lately plays let go of)
        if (this.waiting !== null && this.context && this.#ready(this.#wanted().score)) {
            this.#follow(this.waiting);
        }

        if (this.context && this.context.currentTime - (this.lettingGo ?? -Infinity) > MUSIC_KEPT / 4) {
            this.lettingGo = this.context.currentTime;
            this.#restMusic();
        }

        const music = this.music;

        if (!this.playing) {
            return;
        }

        const now = this.context.currentTime;

        // (Those fading out played on till they're silent)
        for (const track of Object.values(this.tracks)) {
            if (track !== music && track.fading > now && track.start !== null) {
                this.#play(track, now, Math.min(now + LOOKAHEAD, track.fading));
            }
        }

        // (Starting once every recording its score plays is ready, or known not to be, so none
        // is missing from the start)
        if (music.start === null && !this.#ready(music.name)) {
            return;
        }

        music.start ??= now + 0.3;
        this.#play(music, now, now + LOOKAHEAD);
    }

    // Play a track's notes that start from now till `until`
    #play(track, now, until) {
        const score = track.score;
        const notes = score.notes;

        for (;;) {
            const note = notes[track.index];
            const at = track.start + track.loop * score.length + note.time;

            if (at > until) {
                break;
            }

            // (Notes that were due while the page was busy are let go, not played late)
            if (at >= now - 0.05 && this.volumes.music > 0) {
                try {
                    this.#note(note, at, track);
                } catch {
                    // (One note going wrong mustn't stop the rest)
                }
            }

            track.index++;

            if (track.index >= notes.length) {
                track.index = 0;
                track.loop++;
            }
        }
    }

    #note(note, at, track) {
        const instrument = INSTRUMENTS[note.instrument];
        const pitch = instrument.kinds ? note.pitch : note.pitch + (track.shift ?? 0);
        const key = baseFor(note.instrument, pitch);
        const buffer = this.instruments.get(`${note.instrument} ${key}`);

        if (!buffer) {
            return;
        }

        const context = this.context;
        const source = context.createBufferSource();
        const level = context.createGain();
        const end = at + note.duration;

        source.buffer = buffer;
        source.playbackRate.value = instrument.kinds ? 1 : 2 ** ((pitch - key) / 12);
        level.gain.setValueAtTime(note.velocity, at);
        source.start(at);

        if (instrument.held) {
            level.gain.setValueAtTime(note.velocity, end);
            level.gain.linearRampToValueAtTime(0, end + instrument.release);
            source.stop(end + instrument.release + 0.02);
        } else {
            // Plucked and struck notes ring on a while
            const ring = instrument.ring ?? 1.2;

            level.gain.setValueAtTime(note.velocity, end + ring);
            level.gain.linearRampToValueAtTime(0, end + ring + 0.3);
            source.stop(end + ring + 0.32);
        }

        source.connect(level).connect(track.channels[note.instrument]);
        source.addEventListener("ended", () => {
            source.disconnect();
            level.disconnect();
        });
    }

    /** Stop everything for good (the music's timer and the browser's sound). */
    close() {
        clearInterval(this.timer);
        this.context?.close?.();
        this.context = null;
        this.decoders.clear();
    }

    #fade(to) {
        if (!this.master) {
            return;
        }

        const now = this.context.currentTime;
        const gain = this.master.gain;

        gain.cancelScheduledValues(now);
        gain.setValueAtTime(gain.value, now);
        gain.linearRampToValueAtTime(to, now + FADE);
    }
}

// A hall's reverb: stereo noise, fading away over `seconds`, a little darker as it fades
function hall(context, seconds) {
    const length = Math.round(seconds * context.sampleRate);
    const buffer = context.createBuffer(2, length, context.sampleRate);

    for (let channel = 0; channel < 2; channel++) {
        const data = buffer.getChannelData(channel);
        let smooth = 0;

        for (let n = 0; n < length; n++) {
            const t = n / length;
            const white = Math.random() * 2 - 1;

            // Lower frequencies last longer: a gentler low-pass as it goes
            smooth += (white - smooth) * (0.9 - 0.75 * t);
            data[n] = smooth * (1 - t) ** 3 * (n < 0.01 * context.sampleRate ? n / (0.01 * context.sampleRate) : 1);
        }
    }

    return buffer;
}
