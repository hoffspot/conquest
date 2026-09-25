// Weapons and how they attack.
//
// A weapon has one or more attacks, and a character uses whichever of them can reach its target:
// a melee attack reaches the eight squares round the attacker (every square that touches its
// own: N, NE, E, SE, S, SW, W and NW), a ranged attack any square within its range that the
// attacker can see. A weapon can have both (a staff that strikes up close and casts from afar),
// listed in the order they're preferred.
//
// Each attack says:
//  - damage: [least, most] hit points, a whole number rolled evenly between them for every hit
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
    cleaver: {
        label: "Orc cleaver",
        school: "Melee",
        about: "A notched, heavy blade.",
        equipment: ["cleaver"],
        attacks: [melee({ id: "hack", damage: [3, 8], hitAt: 520, duration: 900, interval: 1400, stagger: 200, reaction: "hack", animation: "cleaver" })],
    },
});

/** The weapons a new character can start with, in the order to offer them. */
export const STARTING_WEAPONS = Object.freeze(["sword", "staff", "wand", "grimoire", "hammer", "bow", "gauntlets"]);

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

/** The first of a weapon's attacks that reaches from one square to another, or null. */
export function chooseAttack(weapon, from, to) {
    return WEAPONS[weapon].attacks.find((attack) => inReach(attack, from, to)) ?? null;
}

/** The furthest any of a weapon's attacks reaches, in squares. */
export function longestReach(weapon) {
    return Math.max(...WEAPONS[weapon].attacks.map((attack) => attack.reach));
}

/** Roll an attack's damage: a whole number from its least to its most, each equally likely. */
export function rollDamage(attack, random) {
    const [least, most] = attack.damage;

    return random.int(least, most);
}
