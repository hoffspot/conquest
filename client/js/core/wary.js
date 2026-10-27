// Wary beasts: the wild's natural beasts, meeting a player, are minded one way or another on
// first sight (a reaction roll, as the old tabletop games had it: 2d6, the lower the worse),
// warn before they charge, lose their nerve when badly hurt, and take food thrown them; the
// curious, fed enough, follow whoever fed them (docs/WILDS.md, *Wary beasts*, *Bait*, *Tamed
// beasts*). The rules of it, as data and pure functions: core/battle.js plays them out, the host
// (core/host.js) works out what sways each beast (nerveOf)

import { fightLook } from "./might.js";

/**
 * The wild's natural beasts that are minded on first sight (by creatures.js id): what they eat
 * (`eats`: "meat", what a predator takes, the meat bait or any meat carved from a beast; "feed",
 * a grazer's, the feed bag), how they warn (`display`: app/game.js WARNINGS draws it), whether
 * they hunt (`predator`: stalking when unsure, bolder for a hurt player or one carrying meat),
 * whether fire makes them wary (`fireShy`: a player with the Light about them, or in a lit place),
 * and whether a curious one can be tamed (`tames`). The rest of the wild (the night's own, the
 * fae, the dead, monsters, swarms of vermin, dungeon things) fights as it always has.
 */
export const WARY = Object.freeze({
    rat: { eats: ["meat", "feed"], display: "snap" },
    porcupine: { eats: ["feed"], display: "bristle", tames: true },
    wolf: { eats: ["meat"], display: "snarl", predator: true, fireShy: true, tames: true },
    direWolf: { eats: ["meat"], display: "snarl", predator: true, fireShy: true, tames: true },
    boar: { eats: ["meat", "feed"], display: "scrape", tames: true },
    snake: { eats: ["meat"], display: "coil" },
    bear: { eats: ["meat", "feed"], display: "rear", predator: true, fireShy: true, tames: true },
    puma: { eats: ["meat"], display: "hiss", predator: true, fireShy: true, tames: true },
    badger: { eats: ["meat", "feed"], display: "snarl", tames: true },
    wildBull: { eats: ["feed"], display: "paw", tames: true },
    rookFlock: { eats: ["feed"], display: "mob" },
    hart: { eats: ["feed"], display: "antlers", tames: true },
    hyena: { eats: ["meat"], display: "snarl", predator: true, fireShy: true, tames: true },
    jackal: { eats: ["meat"], display: "snarl", predator: true, fireShy: true, tames: true },
    capeBuffalo: { eats: ["feed"], display: "paw", tames: true },
    jaguar: { eats: ["meat"], display: "hiss", predator: true, fireShy: true, tames: true },
    crocodile: { eats: ["meat"], display: "snap" },
    boa: { eats: ["meat"], display: "coil" },
    spittingCobra: { eats: ["meat"], display: "coil" },
    gilaMonster: { eats: ["meat"], display: "hiss" },
    rockTusker: { eats: ["feed"], display: "paw", tames: true },
});

/** Is a creature (creatures.js id) one of the wary beasts? */
export const wary = (creature) => Object.hasOwn(WARY, creature);

/**
 * What the reaction roll comes to (2d6 and what sways it, NERVE): at or under `attack`, it comes
 * for them; under `warn`, it warns them off; `watch`, it watches (a predator stalks them); `avoid`,
 * it keeps away; over that, it's curious (one that can't be tamed watches instead).
 */
export const REACTION = Object.freeze({ attack: 2, warn: 5, watch: 8, avoid: 11 });

/**
 * What sways a beast's reaction roll, added to it (lower, the worse for the player): its temper
 * (`tempers`); how a fight with it would go for them (`looks`: core/might.js fightLook, their
 * might against its power: an easy kill shies, a far stronger beast presses in); a pack of
 * `packOf` or more (`pack`); a night hunter after dark (`night`); near its den (`den`, within
 * `denNear` metres); a player with light about them, to one shy of fire (`lit`); a player under
 * half their health, to a predator (`hurt`); one carrying meat, to a predator (`meat`).
 */
export const NERVE = Object.freeze({
    tempers: Object.freeze({ aggressive: -3, territorial: -1, defensive: 2 }),
    looks: Object.freeze({ easy: 3, fair: 0, hard: -1, deadly: -2 }),
    pack: -1,
    packOf: 3,
    night: -1,
    den: -2,
    denNear: 40,
    lit: 2,
    hurt: -2,
    hurtBelow: 0.5,
    meat: -1,
});

/**
 * What sways a beast (`creature`, of `temper`) meeting a player, as NERVE has it: `gap` (their
 * might less its power: core/might.js), how many of its pack there are (`pack`), whether it's a
 * night hunter after dark (`night`), near its den (`den`), and whether the player has light about
 * them (`lit`), is hurt (`hurt`) or carries meat (`meat`).
 */
export function nerveOf(creature, { temper = "aggressive", gap = 0, pack = 1, night = false, den = false, lit = false, hurt = false, meat = false } = {}) {
    const beast = WARY[creature] ?? {};

    return (
        (NERVE.tempers[temper] ?? 0) +
        NERVE.looks[fightLook(gap)] +
        (pack >= NERVE.packOf ? NERVE.pack : 0) +
        (night ? NERVE.night : 0) +
        (den ? NERVE.den : 0) +
        (lit && beast.fireShy ? NERVE.lit : 0) +
        (hurt && beast.predator ? NERVE.hurt : 0) +
        (meat && beast.predator ? NERVE.meat : 0)
    );
}

/** Two six-sided dice, thrown with `chance` (createRandom's: next() from 0 to 1). */
export const twoDice = (chance) => 2 + Math.floor(chance.next() * 6) + Math.floor(chance.next() * 6);

/** How a beast (`creature`) is minded by a reaction roll of `roll` (twoDice, and its nerve added). */
export function moodFor(creature, roll) {
    return roll <= REACTION.attack ? "attack" : roll <= REACTION.warn ? "warn" : roll <= REACTION.watch ? "watch" : roll <= REACTION.avoid ? "avoid" : WARY[creature]?.tames ? "curious" : "watch";
}

/**
 * How each mood's played out (metres and ms):
 * - `warn`: its display (WARNINGS) every `every` ms while a player's within `within`; it charges one
 *   who comes within `near` (or its guard, the further) or stays within `within` past `linger`; it
 *   settles once they're past `settle`.
 * - `watch`: a grazer keeps `keep` off, watching; a predator stalks them, between `stalk` metres
 *   off, as far as `follow` past its leash, and strikes one under `strikeBelow` of their health,
 *   making camp within `camp`, or fighting something else.
 * - `avoid`: it goes off to `away`, and again if they come within `again`.
 * - `curious`: it comes up to `near`, keeping within `follow`, for `lasts`.
 * - `fed`: it leaves them be for `lasts`, unless struck.
 * - `spared`: a beast left unfought `spared` metres behind, warned, watching, keeping away, curious
 *   or fed: the player knows it the better for it (core/bestiary.js).
 */
export const MOODS = Object.freeze({
    warn: Object.freeze({ near: 5, within: 12, linger: 6000, settle: 16, every: 2600 }),
    watch: Object.freeze({ keep: 12, stalk: Object.freeze([16, 22]), follow: 60, strikeBelow: 0.5, camp: 40 }),
    avoid: Object.freeze({ away: 20, again: 12 }),
    curious: Object.freeze({ near: 6, follow: 8, lasts: 60000 }),
    fed: Object.freeze({ lasts: 180000 }),
    spared: 30,
});

/**
 * A wary beast's nerve failing (morale): at or under `below` of its health it limps off at `pace`
 * of its walking pace (slower than a player: one who goes after it catches it), as do the rest of
 * its pack once its leader falls or `half` of it's down; cornered
 * (nowhere to go and someone within `cornered` metres), it fights. Out of everyone's sight and
 * `gone` metres from every player, it's let go (no spoils).
 */
export const MORALE = Object.freeze({ below: 0.25, pace: 0.9, half: 0.5, cornered: 2, gone: 40 });

/**
 * Food thrown to beasts: a wary beast that eats it (`eats`) within `smell` metres goes to it and
 * eats for `eat` ms, and is fed after (MOODS.fed); one already after a player is only drawn off it
 * `distract` ms. One bait feeds a pack. Thrown up to `reach` metres; lying `lasts` ms if nothing
 * takes it. A curious beast fed `tame` times follows whoever fed it.
 */
export const BAIT = Object.freeze({ smell: 10, eat: 8000, distract: 4000, reach: 12, lasts: 60000, tame: 3, ahead: 5 });

/** Does a beast (`creature`) eat bait of a `kind` ("meat" or "feed")? */
export const eats = (creature, kind) => Boolean(WARY[creature]?.eats.includes(kind));
