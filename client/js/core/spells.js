// Spells: actions a character casts, rather than blows with its weapon. Any character can cast
// them (for now); the player chooses them on the action wheel (app/wheel.js).
//
// Casting takes `castTime` (the character stands still, hands raised), then the spell lands.
// Every spell shares one cooldown: after casting any of them, none can be cast again for
// SPELL_COOLDOWN.
//
// Pure data, no DOM: the battle (battle.js) casts them.

/** How long after casting a spell before any spell can be cast again (ms). */
export const SPELL_COOLDOWN = 3000;

/**
 * Every spell: its name, who it's cast on ("self" or "enemy"), how long it takes to cast (ms),
 * how far it reaches (squares, for enemies, who must be in sight too) and what it does: heal
 * restores [least, most] hit points (a whole number rolled evenly between them); stun stops the
 * target moving, attacking or doing anything else for so many ms.
 */
export const SPELLS = Object.freeze({
    heal: { label: "Heal", target: "self", castTime: 600, heal: [10, 20] },
    stun: { label: "Stun", target: "enemy", castTime: 400, reach: 9, stun: 3000 },
});

/** How much a heal restores: a whole number from its least to its most, each as likely. */
export function rollHeal(spell, random) {
    return random.int(spell.heal[0], spell.heal[1]);
}

/** Why a spell can't be cast, for people: the reasons battle.cast() gives. */
export const CAST_FAILURES = Object.freeze({
    cooldown: "Not ready yet",
    dead: "Nothing there to cast on",
    busy: "Can't cast right now",
    full: "Already at full health",
    range: "Out of reach",
    sight: "Can't see it",
    target: "Not something to cast that on",
});
