// Weapons and how they attack.
//
// A weapon has one or more attacks, and a character uses whichever of them can reach its target:
// a melee attack reaches the eight squares round the attacker (every square that touches its
// own: N, NE, E, SE, S, SW, W and NW), a ranged attack any square within its range that the
// attacker can see. A weapon can have both (a staff that strikes up close and casts from afar),
// listed in the order they're preferred.
//
// Spiked boots (the "boots" weapon) are worn, with a weapon or on their own, and add kicks to
// how a character fights (armsOf):
//  - With a melee weapon (or spiked gauntlets), a character kicks or uses the weapon, one or the
//    other at random for each blow up close. Both do the same damage: the range halfway between
//    the boots' and the weapon's.
//  - With a bow, wand or grimoire, it kicks whoever is next to it, doing the boots' own damage,
//    and shoots or casts at anyone further off as before.
//
// Each attack says:
//  - damage: [least, most] hit points, a whole number rolled evenly between them for every hit
//    (between the two halves of an averaged range, it's rounded: halfway on average)
//  - hitAt: how long into the attack the blow lands (or the arrow or spell is let go), in ms
//  - duration: how long the attack takes; interval: the shortest time from one to the next
//  - reaction: how whoever it hits reacts (a slash turns them, a hammer staggers them back, an
//    arrow jolts them...), which the characters' animations pick out (characters/actions.js)
//  - stagger: how long a hit stops its target moving or starting an attack, in ms
//  - projectile: for ranged attacks, what flies (an arrow, a bolt, a fireball) and how fast (m/s)
//
// Pure data and arithmetic, no DOM: the battle (battle.js) and the interface both use it.

/** How far melee attacks reach, in squares (the squares touching the attacker's). */
export const MELEE_REACH = 1;

const melee = (settings) => ({ kind: "melee", reach: MELEE_REACH, stagger: 150, ...settings });
const ranged = (settings) => ({ kind: "ranged", stagger: 150, ...settings });

/**
 * Every weapon: its name, its school (melee, ranged or magic), what it's made of (EQUIPMENT ids,
 * characters/equipment.js), a line about it, and its attacks. The starting weapons a player
 * chooses from are STARTING_WEAPONS; the rest belong to enemies.
 */
export const WEAPONS = Object.freeze({
    sword: {
        label: "Sword",
        school: "Melee",
        about: "A steel arming sword. Quick, sure slashes up close.",
        equipment: ["sword"],
        attacks: [melee({ id: "slash", damage: [4, 8], hitAt: 380, duration: 760, interval: 1100, reaction: "slash", animation: "sword" })],
    },
    staff: {
        label: "Staff",
        school: "Melee",
        about: "A long oak staff. Fast, reaching strikes up close.",
        equipment: ["staff"],
        attacks: [melee({ id: "strike", damage: [3, 7], hitAt: 330, duration: 700, interval: 1000, reaction: "strike", animation: "staff" })],
    },
    wand: {
        label: "Wand",
        school: "Magic",
        about: "A crystal-tipped wand. Quick bolts of arcane light, from 7 metres.",
        equipment: ["wand"],
        attacks: [ranged({ id: "bolt", reach: 7, damage: [2, 6], hitAt: 300, duration: 620, interval: 1000, reaction: "arcane", animation: "wand", projectile: { kind: "bolt", speed: 14 } })],
    },
    grimoire: {
        label: "Grimoire",
        school: "Magic",
        about: "A book of fire spells. Slow, heavy fireballs, from 7 metres.",
        equipment: ["grimoire"],
        attacks: [ranged({ id: "fireball", reach: 7, damage: [4, 9], hitAt: 720, duration: 1100, interval: 1800, stagger: 250, reaction: "fire", animation: "grimoire", projectile: { kind: "fireball", speed: 9 } })],
    },
    hammer: {
        label: "War hammer",
        school: "Melee",
        about: "A heavy two-handed hammer. Slow, crushing blows that knock back.",
        equipment: ["warHammer"],
        attacks: [melee({ id: "smash", damage: [6, 12], hitAt: 640, duration: 1100, interval: 1700, stagger: 450, reaction: "crush", animation: "hammer" })],
    },
    bow: {
        label: "Bow",
        school: "Ranged",
        about: "A yew longbow and a quiver of arrows. Shoots from 9 metres.",
        equipment: ["bow", "quiver"],
        attacks: [ranged({ id: "arrow", reach: 9, damage: [3, 7], hitAt: 660, duration: 1000, interval: 1400, reaction: "pierce", animation: "bow", projectile: { kind: "arrow", speed: 22 } })],
    },
    gauntlets: {
        label: "Spiked gauntlets",
        school: "Melee",
        about: "Iron gauntlets with spiked knuckles. A flurry of punches, left and right.",
        equipment: ["spikedGauntlets", "spikedGauntletLeft"],
        attacks: [melee({ id: "punch", damage: [2, 5], hitAt: 170, duration: 420, interval: 600, stagger: 80, reaction: "punch", animation: "punch" })],
    },
    boots: {
        label: "Spiked boots",
        school: "Melee",
        about: "Iron-shod boots, spiked at the toes and heels. Front, round and side kicks, a stamp and a spinning back kick. Wear them with any weapon, or on their own.",
        equipment: ["spikedBoots"],
        attacks: [melee({ id: "kick", damage: [3, 7], hitAt: 360, duration: 760, interval: 1050, stagger: 220, reaction: "kick", animation: "kick" })],
    },
    cleaver: {
        label: "Orc cleaver",
        school: "Melee",
        about: "A notched, heavy blade.",
        equipment: ["cleaver"],
        attacks: [melee({ id: "hack", damage: [3, 8], hitAt: 520, duration: 900, interval: 1400, stagger: 200, reaction: "hack", animation: "cleaver" })],
    },
});

/** The weapons a new character can start with, in the order to offer them. */
export const STARTING_WEAPONS = Object.freeze(["sword", "staff", "wand", "grimoire", "hammer", "bow", "gauntlets", "boots"]);

/** The damage range halfway between two attacks' (each end may come to a half). */
export const averageDamage = (a, b) => [(a.damage[0] + b.damage[0]) / 2, (a.damage[1] + b.damage[1]) / 2];

/**
 * What a character fights with: its weapon's attacks (a WEAPONS key, or none) and, wearing
 * spiked boots (`boots`, or the "boots" weapon itself), kicks. A list of attacks in the order
 * they're preferred; an entry with `either` is one of those attacks, chosen at random each time
 * (kicks and a melee weapon's blows, each with the damage halfway between theirs).
 */
export function armsOf(weapon, boots = false) {
    const kick = WEAPONS.boots.attacks[0];
    const attacks = weapon ? WEAPONS[weapon].attacks : [];

    if (!boots || weapon === "boots") {
        return attacks;
    }

    if (!attacks.some((attack) => attack.kind === "melee")) {
        // Kicking whoever's next to it (first: a ranged attack reaches them too)
        return [kick, ...attacks];
    }

    return attacks.map((attack) => {
        if (attack.kind !== "melee") {
            return attack;
        }

        const damage = averageDamage(attack, kick);

        return { kind: "melee", reach: Math.max(attack.reach, kick.reach), either: [{ ...attack, damage }, { ...kick, damage }] };
    });
}

/** How far apart two squares are for an attack: rings of squares round `from` ([x, y]). */
export const ringsApart = ([ax, ay], [bx, by]) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));

/** Straight-line distance between two squares' middles. */
export const distanceBetween = ([ax, ay], [bx, by]) => Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by));

/**
 * Can an attack from square `from` reach square `to`? Melee reaches the squares touching the
 * attacker's; ranged, squares whose middles are within its reach (sight is checked separately).
 */
export function inReach(attack, from, to) {
    const rings = ringsApart(from, to);

    if (rings === 0) {
        return false;
    }

    return attack.kind === "melee" ? rings <= attack.reach : distanceBetween(from, to) <= attack.reach;
}

// A weapon's attacks (a WEAPONS key) or a character's (armsOf)
const listOf = (arms) => (typeof arms === "string" ? WEAPONS[arms].attacks : (arms ?? []));

/**
 * The first attack that reaches from one square to another, of a weapon (a WEAPONS key) or a
 * character's (armsOf), or null. Where that's one of two (`either`), one at random (`random`:
 * createRandom's; without it, the first).
 */
export function chooseAttack(arms, from, to, random = null) {
    const attack = listOf(arms).find((each) => inReach(each, from, to)) ?? null;

    if (attack?.either) {
        return random ? random.pick(attack.either) : attack.either[0];
    }

    return attack;
}

/** The furthest any attack of a weapon (a WEAPONS key) or a character's (armsOf) reaches, in squares (0: none). */
export function longestReach(arms) {
    return Math.max(0, ...listOf(arms).map((attack) => attack.reach));
}

/**
 * Roll an attack's damage: a whole number from its least to its most, each equally likely. (An
 * averaged range with halves: a number between them, rounded.)
 */
export function rollDamage(attack, random) {
    const [least, most] = attack.damage;

    if (Number.isInteger(least) && Number.isInteger(most)) {
        return random.int(least, most);
    }

    return Math.round(random.range(least, most));
}
