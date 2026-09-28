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
//  - knockdown (some): a hit knocks its target off its feet for this long, in ms: it can't move,
//    fight, cast or use anything till it's up again (a rock tusker's charge)
//  - projectile: for ranged attacks, what flies (an arrow, a bolt, a fireball) and how fast (m/s)
//  - afflict (some of the wild's creatures'): what a hit leaves lingering (afflictions.js: a kind),
//    how likely it is to (`chance`), and how it shows (`look`: a web, roots, frost)
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

// A creature's melee attack that's one of two, at random each time (a scorpion's pincers or its sting)
const eitherOf = (a, b) => ({ kind: "melee", reach: MELEE_REACH, either: [a, b] });

/**
 * The wild's creatures' own weapons (core/creatures.js), by creature: their teeth, tusks, claws
 * and stings up close (animation "melee": a creature strikes each of its own ways in turn), and
 * what some of them do from further off (venom spat, a web, roots called up, a curse, a bolt of
 * light, lava, fire breathed: named as the creature does it). Their damage is at the first tier's:
 * a creature further out is stronger (its power: creatures.js).
 */
export const NATURAL = Object.freeze({
    rat: { label: "Teeth", attacks: [melee({ id: "bite", damage: [2, 4], hitAt: 300, duration: 650, interval: 1000, reaction: "hack", animation: "melee", afflict: { kind: "disease", chance: 0.1 } })] },
    porcupine: { label: "Quills", attacks: [melee({ id: "quills", damage: [3, 5], hitAt: 450, duration: 900, interval: 1300, reaction: "pierce", animation: "melee", afflict: { kind: "bleed", chance: 0.2 } })] },
    slime: { label: "Slime", attacks: [melee({ id: "slam", damage: [2, 5], hitAt: 500, duration: 900, interval: 1200, stagger: 200, reaction: "crush", animation: "melee" })] },
    bats: { label: "Teeth", attacks: [melee({ id: "bite", damage: [2, 4], hitAt: 250, duration: 600, interval: 900, stagger: 80, reaction: "hack", animation: "melee", afflict: { kind: "disease", chance: 0.1 } })] },
    wolf: { label: "Fangs", attacks: [melee({ id: "bite", damage: [2, 4], hitAt: 350, duration: 700, interval: 1100, reaction: "hack", animation: "melee", afflict: { kind: "bleed", chance: 0.15 } })] },
    boar: { label: "Tusks", attacks: [melee({ id: "gore", damage: [4, 7], hitAt: 450, duration: 900, interval: 1500, stagger: 300, reaction: "pierce", animation: "melee", afflict: { kind: "bleed", chance: 0.25 } })] },
    snake: {
        label: "Fangs",
        attacks: [
            melee({ id: "bite", damage: [3, 6], hitAt: 300, duration: 700, interval: 1200, reaction: "pierce", animation: "melee", afflict: { kind: "poison", chance: 0.5 } }),
            ranged({ id: "spit", reach: 5, damage: [2, 4], hitAt: 450, duration: 900, interval: 1800, reaction: "arcane", animation: "spit", projectile: { kind: "venom", speed: 10 }, afflict: { kind: "poison", chance: 0.6 } }),
        ],
    },
    bear: { label: "Claws", attacks: [melee({ id: "maul", damage: [5, 10], hitAt: 600, duration: 1100, interval: 1600, stagger: 400, reaction: "crush", animation: "melee", afflict: { kind: "bleed", chance: 0.3 } })] },
    direWolf: { label: "Fangs", attacks: [melee({ id: "bite", damage: [3, 6], hitAt: 350, duration: 700, interval: 1100, reaction: "hack", animation: "melee", afflict: { kind: "bleed", chance: 0.25 } })] },
    skeleton: { label: "Rusty sword", attacks: [melee({ id: "slash", damage: [4, 8], hitAt: 380, duration: 760, interval: 1100, reaction: "slash", animation: "melee", afflict: { kind: "disease", chance: 0.15 } })] },
    wyvern: {
        label: "Fangs and sting",
        attacks: [
            eitherOf(
                melee({ id: "bite", damage: [5, 9], hitAt: 400, duration: 800, interval: 1300, reaction: "hack", animation: "melee" }),
                melee({ id: "sting", damage: [4, 8], hitAt: 500, duration: 950, interval: 1500, reaction: "pierce", animation: "sting", afflict: { kind: "poison", chance: 0.7 } }),
            ),
        ],
    },
    blackShuck: { label: "Fangs", attacks: [melee({ id: "bite", damage: [4, 8], hitAt: 350, duration: 750, interval: 1200, reaction: "hack", animation: "melee", afflict: { kind: "wither", chance: 0.3 } })] },
    boggart: { label: "Claws", attacks: [melee({ id: "claw", damage: [3, 6], hitAt: 170, duration: 420, interval: 900, stagger: 80, reaction: "slash", animation: "punch", afflict: { kind: "disease", chance: 0.15 } })] },
    wisp: {
        label: "Light",
        attacks: [
            melee({ id: "flare", damage: [2, 4], hitAt: 400, duration: 800, interval: 1200, reaction: "arcane", animation: "melee" }),
            ranged({ id: "bolt", reach: 7, damage: [3, 6], hitAt: 500, duration: 1000, interval: 1600, reaction: "arcane", animation: "bolt", projectile: { kind: "wisp", speed: 9 } }),
        ],
    },
    treant: {
        label: "Limbs",
        attacks: [
            melee({ id: "slam", damage: [6, 12], hitAt: 700, duration: 1200, interval: 1800, stagger: 450, reaction: "crush", animation: "melee" }),
            ranged({ id: "roots", reach: 6, damage: [2, 5], hitAt: 600, duration: 1100, interval: 2600, stagger: 600, reaction: "crush", animation: "roots", projectile: { kind: "roots", speed: 7 }, afflict: { kind: "slow", chance: 1, look: "roots" } }),
        ],
    },
    caveSpider: {
        label: "Fangs",
        attacks: [
            melee({ id: "bite", damage: [3, 5], hitAt: 300, duration: 700, interval: 1100, reaction: "pierce", animation: "melee", afflict: { kind: "poison", chance: 0.35 } }),
            ranged({ id: "web", reach: 6, damage: [1, 2], hitAt: 450, duration: 900, interval: 2400, stagger: 500, reaction: "punch", animation: "web", projectile: { kind: "web", speed: 11 }, afflict: { kind: "slow", chance: 1, look: "web" } }),
        ],
    },
    puma: { label: "Claws", attacks: [melee({ id: "rake", damage: [3, 7], hitAt: 350, duration: 750, interval: 1150, reaction: "slash", animation: "melee", afflict: { kind: "bleed", chance: 0.25 } })] },
    shadowStalker: { label: "Claws", attacks: [melee({ id: "rake", damage: [5, 9], hitAt: 350, duration: 750, interval: 1100, reaction: "slash", animation: "melee", afflict: { kind: "bleed", chance: 0.3 } })] },
    hyena: { label: "Jaws", attacks: [melee({ id: "bite", damage: [2, 5], hitAt: 300, duration: 700, interval: 1000, reaction: "hack", animation: "melee", afflict: { kind: "disease", chance: 0.2 } })] },
    scorpion: {
        label: "Pincers and sting",
        attacks: [
            eitherOf(
                melee({ id: "pinch", damage: [3, 5], hitAt: 350, duration: 750, interval: 1200, reaction: "slash", animation: "melee" }),
                melee({ id: "sting", damage: [3, 6], hitAt: 450, duration: 900, interval: 1400, reaction: "pierce", animation: "sting", afflict: { kind: "poison", chance: 0.6 } }),
            ),
        ],
    },
    bogFrog: {
        label: "Tongue",
        attacks: [
            // (Its tongue shot out at whoever's up to two squares off)
            melee({ id: "tongue", reach: 2, damage: [2, 5], hitAt: 350, duration: 750, interval: 1100, reaction: "punch", animation: "melee" }),
            ranged({ id: "spit", reach: 5, damage: [2, 4], hitAt: 450, duration: 900, interval: 2000, reaction: "arcane", animation: "spit", projectile: { kind: "venom", speed: 10 }, afflict: { kind: "poison", chance: 0.5 } }),
        ],
    },
    crocodile: { label: "Jaws", attacks: [melee({ id: "bite", damage: [5, 9], hitAt: 500, duration: 1000, interval: 1600, stagger: 350, reaction: "hack", animation: "melee", afflict: { kind: "bleed", chance: 0.35 } })] },
    magmaSlime: {
        label: "Molten rock",
        attacks: [
            melee({ id: "slam", damage: [4, 8], hitAt: 500, duration: 900, interval: 1400, stagger: 250, reaction: "fire", animation: "melee", afflict: { kind: "burn", chance: 0.4 } }),
            ranged({ id: "lava", reach: 5, damage: [3, 6], hitAt: 500, duration: 1000, interval: 2200, reaction: "fire", animation: "spit", projectile: { kind: "lava", speed: 8 }, afflict: { kind: "burn", chance: 0.8 } }),
        ],
    },
    // (Its charge knocks whoever it catches off their feet)
    rockTusker: { label: "Tusks", attacks: [melee({ id: "gore", damage: [6, 11], hitAt: 500, duration: 1000, interval: 1600, stagger: 450, knockdown: 1500, reaction: "pierce", animation: "melee" })] },
    dragon: {
        label: "Fangs and fire",
        attacks: [
            melee({ id: "bite", damage: [8, 14], hitAt: 500, duration: 1000, interval: 1600, stagger: 400, reaction: "hack", animation: "melee", afflict: { kind: "bleed", chance: 0.4 } }),
            ranged({ id: "breath", reach: 6, damage: [6, 12], hitAt: 700, duration: 1400, interval: 3000, stagger: 300, reaction: "fire", animation: "breath", projectile: { kind: "flame", speed: 14 }, afflict: { kind: "burn", chance: 1 } }),
        ],
    },
    wightLord: {
        label: "Greatsword and curse",
        attacks: [
            melee({ id: "cleave", damage: [6, 11], hitAt: 600, duration: 1100, interval: 1500, stagger: 350, reaction: "slash", animation: "melee" }),
            ranged({ id: "curse", reach: 7, damage: [4, 8], hitAt: 700, duration: 1300, interval: 3200, reaction: "arcane", animation: "curse", projectile: { kind: "curse", speed: 8 }, afflict: { kind: "wither", chance: 1 } }),
        ],
    },
    frostTroll: { label: "Frozen club", attacks: [melee({ id: "smash", damage: [6, 12], hitAt: 640, duration: 1100, interval: 1700, stagger: 450, reaction: "crush", animation: "hammer", afflict: { kind: "slow", chance: 0.4, look: "frost" } })] },
});

/** A weapon (a WEAPONS key) or a creature's own (a NATURAL key), or null. */
export const weaponOf = (id) => (id ? (WEAPONS[id] ?? NATURAL[id] ?? null) : null);

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
    const attacks = weaponOf(weapon)?.attacks ?? [];

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

// A weapon's attacks (a WEAPONS or NATURAL key) or a character's (armsOf)
const listOf = (arms) => (typeof arms === "string" ? weaponOf(arms).attacks : (arms ?? []));

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
