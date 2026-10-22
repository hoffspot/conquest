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
//  - pool (some spat): what it leaves on the ground where it lands a while (battle.js HAZARDS: its
//    `kind`, `ms`, `radius` in metres), hurting whoever stands in it
//  - bomb (a goblin bomber's): instead of a projectile, a bomb lobbed where the target stands,
//    bursting there a moment later (battle.js BOMBS: which), its damage at the blast's heart
//  - drain (some): a share of the harm a hit does drawn back into whoever dealt it, healing it
//    (battle.js #hit: a hell's Flayed Hierarch's curse)
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
 *
 * Those held in both hands (core/gear.js `hands`) do about half as much again as a sword in a
 * fight (their blows over time), for the shield they can't carry: the war hammer twice a sword's
 * blow, slower; the battle axe heavier still, slower again; the greatsword two thirds as much
 * again as a sword's, between them; the staff a little more than a sword's, quicker; the
 * gauntlets' punches, quicker still; the bow's arrows half as much again. The greatsword and the
 * battle axe are swung two-handed as the war hammer is (its `animation`: characters/actions.js). The wand and the grimoire are for spells (a
 * grimoire's a quarter stronger, for the spellward a wand leaves a hand for: progress.js).
 */
export const WEAPONS = Object.freeze({
    sword: {
        label: "Sword",
        school: "Melee",
        about: "A steel arming sword in one hand, and a round shield in the other to block with. Quick, sure slashes up close.",
        equipment: ["sword"],
        attacks: [melee({ id: "slash", damage: [4, 8], hitAt: 380, duration: 760, interval: 1100, reaction: "slash", animation: "sword" })],
    },
    staff: {
        label: "Staff",
        school: "Melee",
        about: "A long oak staff, held in both hands. Quick, reaching strikes up close, one after another.",
        equipment: ["staff"],
        attacks: [melee({ id: "strike", damage: [5, 9], hitAt: 330, duration: 700, interval: 850, reaction: "strike", animation: "staff" })],
    },
    wand: {
        label: "Wand",
        school: "Magic",
        about: "A crystal-tipped wand in one hand, and a spellward, a mage's shield, in the other to block blows and spells with. The wand makes spells stronger; its own bolts of light, from 7 metres, are weak.",
        equipment: ["wand"],
        attacks: [ranged({ id: "bolt", reach: 7, damage: [1, 3], hitAt: 300, duration: 620, interval: 1000, reaction: "arcane", animation: "wand", projectile: { kind: "bolt", speed: 14 } })],
    },
    grimoire: {
        label: "Grimoire",
        school: "Magic",
        about: "A book of spells, held open in both hands. Spells cast from it are a quarter stronger than from an equally good wand, but there's no hand free for a spellward. Its own little fireballs reach 7 metres and are weak.",
        equipment: ["grimoire"],
        attacks: [ranged({ id: "fireball", reach: 7, damage: [2, 4], hitAt: 720, duration: 1100, interval: 1800, stagger: 250, reaction: "fire", animation: "grimoire", projectile: { kind: "fireball", speed: 9 } })],
    },
    hammer: {
        label: "War hammer",
        school: "Melee",
        about: "A heavy two-handed hammer. Slow, crushing blows, twice a sword's, that knock back.",
        equipment: ["warHammer"],
        attacks: [melee({ id: "smash", damage: [8, 16], hitAt: 640, duration: 1100, interval: 1500, stagger: 450, reaction: "crush", animation: "hammer" })],
    },
    greatsword: {
        label: "Greatsword",
        school: "Melee",
        about: "A long two-handed sword, its grip long enough for both hands. Sweeping cuts, two thirds as much again as a sword's, that check whoever they land on.",
        equipment: ["greatsword"],
        attacks: [melee({ id: "cleave", damage: [7, 13], hitAt: 520, duration: 950, interval: 1250, stagger: 300, reaction: "cleave", animation: "hammer" })],
    },
    axe: {
        label: "Battle axe",
        school: "Melee",
        about: "A broad-bladed axe on a long haft, in both hands. Slow, heavy chops, more than twice a sword's, that stagger.",
        equipment: ["battleAxe"],
        attacks: [melee({ id: "chop", damage: [9, 17], hitAt: 700, duration: 1200, interval: 1600, stagger: 400, reaction: "chop", animation: "hammer" })],
    },
    bow: {
        label: "Bow",
        school: "Ranged",
        about: "A yew longbow and a quiver of arrows. Shoots from 13.5 metres.",
        equipment: ["bow", "quiver"],
        attacks: [ranged({ id: "arrow", reach: 13.5, damage: [5, 10], hitAt: 660, duration: 1000, interval: 1400, reaction: "pierce", animation: "bow", projectile: { kind: "arrow", speed: 22 } })],
    },
    gauntlets: {
        label: "Spiked gauntlets",
        school: "Melee",
        about: "Iron gauntlets with spiked knuckles. A flurry of punches, left and right.",
        equipment: ["spikedGauntlets", "spikedGauntletLeft"],
        attacks: [melee({ id: "punch", damage: [3, 7], hitAt: 170, duration: 420, interval: 600, stagger: 80, reaction: "punch", animation: "punch" })],
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
    // (The fortifications' archers, shooting from a guard tower's loops, or a forward garrison's
    // walls: core/war/forts.js; farther than a bow in hand, from up high)
    tower: { label: "Arrow loops", attacks: [ranged({ id: "loose", reach: 20, damage: [5, 9], hitAt: 300, duration: 700, interval: 1600, reaction: "pierce", animation: "bow", projectile: { kind: "arrow", speed: 24 } })] },
    garrison: { label: "Archers on the walls", attacks: [ranged({ id: "volley", reach: 20, damage: [4, 8], hitAt: 300, duration: 700, interval: 1100, reaction: "pierce", animation: "bow", projectile: { kind: "arrow", speed: 24 } })] },
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
            ranged({ id: "spit", reach: 5, damage: [2, 4], hitAt: 450, duration: 900, interval: 1800, reaction: "arcane", animation: "spit", projectile: { kind: "venom", speed: 10 }, afflict: { kind: "poison", chance: 0.6 }, pool: { kind: "venom", ms: 4000, radius: 0.8 } }),
        ],
    },
    bear: { label: "Claws", attacks: [melee({ id: "maul", damage: [5, 10], hitAt: 600, duration: 1100, interval: 1600, stagger: 400, reaction: "crush", animation: "melee", afflict: { kind: "bleed", chance: 0.3 } })] },
    direWolf: { label: "Fangs", attacks: [melee({ id: "bite", damage: [3, 6], hitAt: 350, duration: 700, interval: 1100, reaction: "hack", animation: "melee", afflict: { kind: "bleed", chance: 0.25 } })] },
    // (A werewolf's: its claws raking, laying a wound open; or a spring on whoever it's after, a
    // heavier blow that staggers, its whole weight behind it)
    werewolf: {
        label: "Claws and fangs",
        attacks: [
            eitherOf(
                melee({ id: "claw", damage: [6, 11], hitAt: 450, duration: 900, interval: 1200, reaction: "slash", animation: "melee", afflict: { kind: "bleed", chance: 0.35 } }),
                melee({ id: "pounce", damage: [9, 16], hitAt: 650, duration: 1300, interval: 2200, stagger: 400, reaction: "hack", animation: "pounce", afflict: { kind: "bleed", chance: 0.4 } }),
            ),
        ],
    },
    skeleton: { label: "Rusty sword", attacks: [melee({ id: "slash", damage: [4, 8], hitAt: 380, duration: 760, interval: 1100, reaction: "slash", animation: "melee", afflict: { kind: "disease", chance: 0.15 } })] },
    // (A hodmedod reaps with its sickle; a draugr hacks with its barrow blade, and lays a curse as
    // the wight lord does, weaker; a mare's weight on whoever it's on staggers and slows them, and
    // it sends them nightmares that wither)
    hodmedod: { label: "Sickle", attacks: [melee({ id: "reap", damage: [4, 8], hitAt: 420, duration: 850, interval: 1250, reaction: "slash", animation: "melee", afflict: { kind: "bleed", chance: 0.3 } })] },
    draugr: {
        label: "Barrow blade and grave-curse",
        attacks: [
            melee({ id: "slash", damage: [6, 11], hitAt: 420, duration: 850, interval: 1300, stagger: 300, reaction: "slash", animation: "melee", afflict: { kind: "disease", chance: 0.25 } }),
            ranged({ id: "curse", reach: 6, damage: [3, 6], hitAt: 700, duration: 1300, interval: 3600, reaction: "arcane", animation: "curse", projectile: { kind: "curse", speed: 8 }, afflict: { kind: "wither", chance: 0.6 } }),
        ],
    },
    mare: {
        label: "Weight and nightmares",
        attacks: [
            melee({ id: "press", damage: [3, 6], hitAt: 450, duration: 900, interval: 1300, stagger: 350, reaction: "arcane", animation: "melee", afflict: { kind: "slow", chance: 0.45 } }),
            ranged({ id: "nightmare", reach: 6, damage: [2, 5], hitAt: 650, duration: 1300, interval: 3400, reaction: "arcane", animation: "drain", projectile: { kind: "curse", speed: 8 }, afflict: { kind: "wither", chance: 0.6 } }),
        ],
    },
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
    // (A goblin bomber's: lit bombs lobbed at whoever's further off than its claws reach, bursting
    // round where they stood: battle.js BOMBS)
    goblinBomber: {
        label: "Claws and bombs",
        attacks: [
            melee({ id: "claw", damage: [2, 4], hitAt: 170, duration: 420, interval: 900, stagger: 80, reaction: "slash", animation: "punch" }),
            ranged({ id: "bomb", reach: 10, damage: [5, 10], hitAt: 650, duration: 1200, interval: 3800, stagger: 300, reaction: "crush", animation: "throw", bomb: "goblinBomb" }),
        ],
    },
    // (A town's bomb throwers, among those who march out against an invasion: core/invasions.js
    // BOMBER. A sword up close, its shield hand free to lob goblin bombs at whoever's further off)
    bombardier: {
        label: "Sword and bombs",
        equipment: ["sword"],
        attacks: [
            melee({ id: "slash", damage: [4, 8], hitAt: 380, duration: 760, interval: 1100, reaction: "slash", animation: "sword" }),
            ranged({ id: "bomb", reach: 11, damage: [6, 12], hitAt: 650, duration: 1200, interval: 4000, stagger: 300, reaction: "crush", animation: "throw", bomb: "goblinBomb" }),
        ],
    },
    // (An invasion's northmen's axe-throwers: core/invasions.js BANDS. A hand axe up close, and
    // one thrown, end over end, at whoever's further off; and the Ashen Cult's high priests, as
    // the cult's leader in its ruins: a staff, and hellfire hurled)
    throwingAxes: {
        label: "Throwing axes",
        equipment: ["cleaver"],
        attacks: [
            melee({ id: "hack", damage: [3, 8], hitAt: 520, duration: 900, interval: 1400, stagger: 200, reaction: "hack", animation: "cleaver" }),
            ranged({ id: "axe", reach: 9, damage: [5, 10], hitAt: 600, duration: 1000, interval: 1800, stagger: 250, reaction: "hack", animation: "throw", projectile: { kind: "axe", speed: 15 } }),
        ],
    },
    ashenPriest: {
        label: "Staff and hellfire",
        equipment: ["staff"],
        attacks: [
            melee({ id: "strike", damage: [6, 11], hitAt: 330, duration: 700, interval: 1100, reaction: "strike", animation: "staff" }),
            ranged({ id: "hellfire", reach: 9, damage: [6, 10], hitAt: 600, duration: 1100, interval: 2600, stagger: 200, reaction: "fire", animation: "wand", projectile: { kind: "fireball", speed: 12 }, afflict: { kind: "burn", chance: 0.6 } }),
        ],
    },
    boggart: { label: "Claws", attacks: [melee({ id: "claw", damage: [3, 6], hitAt: 170, duration: 420, interval: 900, stagger: 80, reaction: "slash", animation: "punch", afflict: { kind: "disease", chance: 0.15 } })] },
    badger: { label: "Teeth and claws", attacks: [melee({ id: "bite", damage: [3, 5], hitAt: 350, duration: 750, interval: 1150, reaction: "hack", animation: "melee", afflict: { kind: "bleed", chance: 0.2 } })] },
    wildBull: { label: "Horns", attacks: [melee({ id: "gore", damage: [5, 9], hitAt: 500, duration: 1000, interval: 1600, stagger: 400, reaction: "pierce", animation: "melee", afflict: { kind: "bleed", chance: 0.2 } })] },
    // (A hart's antlers gore; a kelpie bites and drags whoever it has towards the water, slowing
    // them, or rears and strikes down with its hooves, knocking them off their feet)
    hart: { label: "Antlers", attacks: [melee({ id: "gore", damage: [4, 8], hitAt: 450, duration: 900, interval: 1400, stagger: 350, reaction: "pierce", animation: "melee", afflict: { kind: "bleed", chance: 0.2 } })] },
    kelpie: {
        label: "Teeth and hooves",
        attacks: [
            eitherOf(
                melee({ id: "bite", damage: [5, 9], hitAt: 400, duration: 850, interval: 1400, reaction: "hack", animation: "melee", afflict: { kind: "slow", chance: 0.4 } }),
                melee({ id: "stamp", damage: [6, 10], hitAt: 550, duration: 1100, interval: 1700, stagger: 400, knockdown: 1000, reaction: "crush", animation: "melee" }),
            ),
        ],
    },
    rookFlock: { label: "Beaks", attacks: [melee({ id: "peck", damage: [2, 4], hitAt: 250, duration: 600, interval: 900, stagger: 80, reaction: "pierce", animation: "melee", afflict: { kind: "bleed", chance: 0.1 } })] },
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
    // (A mandrake scratches, and shrieks now and then at whoever's near, staggering them, its arms
    // flung up as a treant's are calling up roots)
    mandrake: {
        label: "Twigs and shriek",
        attacks: [
            melee({ id: "scratch", damage: [2, 4], hitAt: 400, duration: 800, interval: 1200, reaction: "slash", animation: "melee" }),
            ranged({ id: "shriek", reach: 4, damage: [1, 3], hitAt: 600, duration: 1200, interval: 3600, stagger: 450, reaction: "arcane", animation: "roots", projectile: { kind: "wail", speed: 9 } }),
        ],
    },
    cwnAnnwn: { label: "Fangs", attacks: [melee({ id: "bite", damage: [3, 6], hitAt: 350, duration: 700, interval: 1100, reaction: "hack", animation: "melee", afflict: { kind: "bleed", chance: 0.2 } })] },
    // (Pixies prick, and now and then dazzle whoever's near with their light, staggering and
    // slowing them: led astray)
    pixies: {
        label: "Pricks and dazzle",
        attacks: [
            melee({ id: "prick", damage: [1, 3], hitAt: 250, duration: 600, interval: 900, reaction: "pierce", animation: "melee" }),
            ranged({ id: "dazzle", reach: 5, damage: [1, 2], hitAt: 500, duration: 1000, interval: 3200, stagger: 400, reaction: "arcane", animation: "swirl", projectile: { kind: "wisp", speed: 9 }, afflict: { kind: "slow", chance: 0.6 } }),
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
    olm: { label: "Jaws", attacks: [melee({ id: "bite", damage: [2, 5], hitAt: 400, duration: 800, interval: 1200, reaction: "hack", animation: "melee", afflict: { kind: "disease", chance: 0.1 } })] },
    // (A giant centipede's fangs are venomous)
    centipede: { label: "Venomous fangs", attacks: [melee({ id: "bite", damage: [3, 5], hitAt: 300, duration: 650, interval: 1100, reaction: "pierce", animation: "melee", afflict: { kind: "poison", chance: 0.4 } })] },
    // (The ants' nests' own: a giant ant's mandibles, their bite burning with its acid; a great
    // centipede's fangs, or it rears and strikes down the harder, staggering whoever it strikes;
    // the Ant Monster's mandibles, or rearing to slam its weight down, and its acid spat at whoever
    // keeps off, a pool of it left burning where it lands)
    ant: { label: "Mandibles", attacks: [melee({ id: "bite", damage: [3, 6], hitAt: 900, duration: 1500, interval: 1700, reaction: "pierce", animation: "melee", afflict: { kind: "poison", chance: 0.25 } })] },
    greatCentipede: {
        label: "Venomous fangs",
        attacks: [
            eitherOf(
                melee({ id: "bite", damage: [6, 11], hitAt: 500, duration: 1000, interval: 1300, reaction: "pierce", animation: "melee", afflict: { kind: "poison", chance: 0.45 } }),
                melee({ id: "rear", reach: 1.6, damage: [9, 15], hitAt: 900, duration: 1500, interval: 2200, stagger: 400, reaction: "hack", animation: "rear", afflict: { kind: "poison", chance: 0.5 } }),
            ),
        ],
    },
    // (The nests' spiders: a dungeon spider's venomous fangs, or a spring on whoever it's after,
    // and its web spat to slow them; an elite dungeon spider's fangs the heavier, or its sting
    // brought over, staggering, and its web sprayed from its spinnerets)
    dungeonSpider: {
        label: "Fangs and web",
        attacks: [
            eitherOf(
                melee({ id: "bite", damage: [4, 8], hitAt: 650, duration: 1400, interval: 1500, reaction: "pierce", animation: "melee", afflict: { kind: "poison", chance: 0.35 } }),
                melee({ id: "leap", reach: 2, damage: [6, 11], hitAt: 900, duration: 1600, interval: 2400, stagger: 300, reaction: "hack", animation: "leap", afflict: { kind: "poison", chance: 0.4 } }),
            ),
            ranged({ id: "web", reach: 6, damage: [1, 3], hitAt: 600, duration: 1300, interval: 3000, stagger: 400, reaction: "punch", animation: "web", projectile: { kind: "web", speed: 11 }, afflict: { kind: "slow", chance: 1, look: "web" } }),
        ],
    },
    eliteDungeonSpider: {
        label: "Fangs, sting and web",
        attacks: [
            eitherOf(
                melee({ id: "bite", reach: 1.6, damage: [8, 14], hitAt: 700, duration: 1300, interval: 1600, reaction: "pierce", animation: "melee", afflict: { kind: "poison", chance: 0.4 } }),
                melee({ id: "sting", reach: 1.8, damage: [12, 20], hitAt: 900, duration: 1600, interval: 2400, stagger: 400, reaction: "pierce", animation: "sting", afflict: { kind: "poison", chance: 0.8 } }),
            ),
            ranged({ id: "web", reach: 7, damage: [3, 6], hitAt: 1000, duration: 2000, interval: 3600, stagger: 500, reaction: "punch", animation: "web", projectile: { kind: "web", speed: 11 }, afflict: { kind: "slow", chance: 1, look: "web" } }),
        ],
    },
    // (A dungeon scorpion's pincers, or its sting brought over its back, staggering, venomous; a
    // giant cockroach's bite, carrying sickness, or rearing up to strike down; a dungeon wasp's
    // sting, or diving in to drive it home)
    dungeonScorpion: {
        label: "Pincers and sting",
        attacks: [
            eitherOf(
                melee({ id: "pinch", reach: 1.6, damage: [7, 12], hitAt: 800, duration: 1500, interval: 1700, reaction: "slash", animation: "melee" }),
                melee({ id: "sting", reach: 1.9, damage: [10, 16], hitAt: 1000, duration: 1800, interval: 2400, stagger: 400, reaction: "pierce", animation: "sting", afflict: { kind: "poison", chance: 0.8 } }),
            ),
        ],
    },
    giantCockroach: {
        label: "Mandibles",
        attacks: [
            eitherOf(
                melee({ id: "bite", damage: [3, 6], hitAt: 550, duration: 1100, interval: 1300, reaction: "pierce", animation: "melee", afflict: { kind: "disease", chance: 0.2 } }),
                melee({ id: "rear", damage: [5, 9], hitAt: 900, duration: 1500, interval: 2000, stagger: 300, reaction: "punch", animation: "rear" }),
            ),
        ],
    },
    dungeonWasp: {
        label: "Sting",
        attacks: [
            eitherOf(
                melee({ id: "sting", damage: [4, 8], hitAt: 700, duration: 1300, interval: 1400, reaction: "pierce", animation: "melee", afflict: { kind: "poison", chance: 0.5 } }),
                melee({ id: "dive", reach: 2.2, damage: [7, 12], hitAt: 1000, duration: 1700, interval: 2400, stagger: 300, reaction: "pierce", animation: "dive", afflict: { kind: "poison", chance: 0.7 } }),
            ),
        ],
    },
    // (A black widow's fangs, rearing up to bite, or pouncing on whoever it's after (its Attack 3,
    // a leap of two metres and back), each with its venom, a venom of its own)
    blackWidow: {
        label: "Fangs and venom",
        attacks: [
            eitherOf(
                melee({ id: "bite", reach: 1.5, damage: [7, 12], hitAt: 450, duration: 1500, interval: 1500, reaction: "pierce", animation: "melee", afflict: { kind: "venom", chance: 0.6 } }),
                melee({ id: "pounce", reach: 2.4, damage: [10, 17], hitAt: 600, duration: 2000, interval: 2600, stagger: 400, reaction: "hack", animation: "leap", afflict: { kind: "venom", chance: 0.9 } }),
            ),
        ],
    },
    antMonster: {
        label: "Mandibles and acid",
        attacks: [
            eitherOf(
                melee({ id: "bite", reach: 1.8, damage: [10, 18], hitAt: 700, duration: 1300, interval: 1700, stagger: 300, reaction: "hack", animation: "melee", afflict: { kind: "bleed", chance: 0.35 } }),
                melee({ id: "slam", reach: 2.2, damage: [14, 24], hitAt: 1000, duration: 1800, interval: 2600, stagger: 500, reaction: "crush", animation: "slam" }),
            ),
            ranged({ id: "spit", reach: 7, damage: [6, 11], hitAt: 1100, duration: 2000, interval: 3600, reaction: "arcane", animation: "spit", projectile: { kind: "venom", speed: 10 }, afflict: { kind: "poison", chance: 0.7 }, pool: { kind: "venom", ms: 5000, radius: 1.2 } }),
        ],
    },
    // (A basilisk bites; and its glare, the stare said to turn to stone, staggers whoever meets
    // it and slows them)
    basilisk: {
        label: "Fangs and glare",
        attacks: [
            melee({ id: "bite", damage: [4, 7], hitAt: 350, duration: 750, interval: 1300, reaction: "pierce", animation: "melee", afflict: { kind: "poison", chance: 0.5 } }),
            ranged({ id: "glare", reach: 6, damage: [2, 4], hitAt: 600, duration: 1200, interval: 3400, stagger: 500, reaction: "arcane", animation: "spit", projectile: { kind: "curse", speed: 9 }, afflict: { kind: "slow", chance: 0.8 } }),
        ],
    },
    hyena: { label: "Jaws", attacks: [melee({ id: "bite", damage: [2, 5], hitAt: 300, duration: 700, interval: 1000, reaction: "hack", animation: "melee", afflict: { kind: "disease", chance: 0.2 } })] },
    jackal: { label: "Teeth", attacks: [melee({ id: "bite", damage: [2, 4], hitAt: 300, duration: 650, interval: 950, reaction: "hack", animation: "melee", afflict: { kind: "disease", chance: 0.1 } })] },
    locustSwarm: { label: "Mandibles", attacks: [melee({ id: "bite", damage: [1, 3], hitAt: 200, duration: 500, interval: 700, reaction: "slash", animation: "melee" })] },
    // (A spitting cobra spits its venom at the eyes, staggering whoever it catches; no pool of it
    // left lying, as an adder's is)
    spittingCobra: {
        label: "Fangs and venom",
        attacks: [
            melee({ id: "bite", damage: [3, 6], hitAt: 300, duration: 700, interval: 1200, reaction: "pierce", animation: "melee", afflict: { kind: "poison", chance: 0.5 } }),
            ranged({ id: "spit", reach: 6, damage: [1, 3], hitAt: 450, duration: 900, interval: 2200, stagger: 300, reaction: "arcane", animation: "spit", projectile: { kind: "venom", speed: 11 }, afflict: { kind: "poison", chance: 0.5 } }),
        ],
    },
    // (A buffalo's charge, as a rock tusker's, knocks whoever it catches off their feet)
    capeBuffalo: { label: "Horns", attacks: [melee({ id: "gore", damage: [6, 11], hitAt: 500, duration: 1000, interval: 1600, stagger: 450, knockdown: 1200, reaction: "pierce", animation: "melee" })] },
    nandiBear: { label: "Claws", attacks: [melee({ id: "maul", damage: [6, 11], hitAt: 600, duration: 1100, interval: 1600, stagger: 400, reaction: "crush", animation: "melee", afflict: { kind: "bleed", chance: 0.35 } })] },
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
            ranged({ id: "spit", reach: 5, damage: [2, 4], hitAt: 450, duration: 900, interval: 2000, reaction: "arcane", animation: "spit", projectile: { kind: "venom", speed: 10 }, afflict: { kind: "poison", chance: 0.5 }, pool: { kind: "venom", ms: 4000, radius: 0.8 } }),
        ],
    },
    crocodile: { label: "Jaws", attacks: [melee({ id: "bite", damage: [5, 9], hitAt: 500, duration: 1000, interval: 1600, stagger: 350, reaction: "hack", animation: "melee", afflict: { kind: "bleed", chance: 0.35 } })] },
    giantLeech: { label: "Sucker", attacks: [melee({ id: "bite", damage: [2, 4], hitAt: 400, duration: 800, interval: 1100, reaction: "pierce", animation: "melee", afflict: { kind: "bleed", chance: 0.35 } })] },
    bloodflies: { label: "Stingers", attacks: [melee({ id: "bite", damage: [1, 3], hitAt: 200, duration: 500, interval: 750, reaction: "pierce", animation: "melee", afflict: { kind: "disease", chance: 0.25 } })] },
    jaguar: { label: "Fangs and claws", attacks: [melee({ id: "bite", damage: [4, 8], hitAt: 350, duration: 750, interval: 1200, stagger: 200, reaction: "hack", animation: "melee", afflict: { kind: "bleed", chance: 0.3 } })] },
    // (A boa bites, or throws its coils round whoever it's after, crushing and holding them)
    boa: {
        label: "Jaws and coils",
        attacks: [
            eitherOf(
                melee({ id: "bite", damage: [4, 8], hitAt: 350, duration: 750, interval: 1300, reaction: "pierce", animation: "melee" }),
                melee({ id: "crush", damage: [5, 9], hitAt: 600, duration: 1200, interval: 1800, stagger: 500, reaction: "crush", animation: "melee", afflict: { kind: "slow", chance: 0.6 } }),
            ),
        ],
    },
    // (An ahuizotl bites, or takes hold with the hand at its tail's tip and drags whoever it has
    // under, slowing them)
    ahuizotl: {
        label: "Jaws and tail-hand",
        attacks: [
            eitherOf(
                melee({ id: "bite", damage: [4, 7], hitAt: 350, duration: 750, interval: 1200, reaction: "hack", animation: "melee", afflict: { kind: "bleed", chance: 0.3 } }),
                melee({ id: "grab", damage: [3, 6], hitAt: 450, duration: 950, interval: 1500, stagger: 300, reaction: "punch", animation: "melee", afflict: { kind: "slow", chance: 0.6 } }),
            ),
        ],
    },
    // (A knucker, the water dragon of the Sussex pools, bites or throws its coils round whoever
    // it's after, as a boa does, and spits venom that lies a while)
    knucker: {
        label: "Jaws, coils and venom",
        attacks: [
            eitherOf(
                melee({ id: "bite", damage: [5, 9], hitAt: 450, duration: 900, interval: 1400, stagger: 300, reaction: "hack", animation: "melee", afflict: { kind: "bleed", chance: 0.3 } }),
                melee({ id: "crush", damage: [6, 10], hitAt: 600, duration: 1200, interval: 1800, stagger: 500, reaction: "crush", animation: "melee", afflict: { kind: "slow", chance: 0.6 } }),
            ),
            ranged({ id: "spit", reach: 5, damage: [3, 6], hitAt: 500, duration: 1000, interval: 2600, reaction: "arcane", animation: "spit", projectile: { kind: "venom", speed: 10 }, afflict: { kind: "poison", chance: 0.6 }, pool: { kind: "venom", ms: 4000, radius: 1 } }),
        ],
    },
    magmaSlime: {
        label: "Molten rock",
        attacks: [
            melee({ id: "slam", damage: [4, 8], hitAt: 500, duration: 900, interval: 1400, stagger: 250, reaction: "fire", animation: "melee", afflict: { kind: "burn", chance: 0.4 } }),
            ranged({ id: "lava", reach: 5, damage: [3, 6], hitAt: 500, duration: 1000, interval: 2200, reaction: "fire", animation: "spit", projectile: { kind: "lava", speed: 8 }, afflict: { kind: "burn", chance: 0.8 }, pool: { kind: "lava", ms: 4000, radius: 0.9 } }),
        ],
    },
    // (Its charge knocks whoever it catches off their feet)
    rockTusker: { label: "Tusks", attacks: [melee({ id: "gore", damage: [6, 11], hitAt: 500, duration: 1000, interval: 1600, stagger: 450, knockdown: 1500, reaction: "pierce", animation: "melee" })] },
    gilaMonster: { label: "Venomous bite", attacks: [melee({ id: "bite", damage: [3, 5], hitAt: 400, duration: 850, interval: 1300, reaction: "hack", animation: "melee", afflict: { kind: "poison", chance: 0.5 } })] },
    vultureFlock: { label: "Beaks and talons", attacks: [melee({ id: "rip", damage: [3, 5], hitAt: 350, duration: 800, interval: 1100, stagger: 100, reaction: "slash", animation: "melee", afflict: { kind: "bleed", chance: 0.25 } })] },
    // (A chimera mauls with a lion's claws, or its serpent tail strikes, venomous; and it breathes
    // fire, as a dragon does)
    chimera: {
        label: "Claws, serpent and fire",
        attacks: [
            eitherOf(
                melee({ id: "maul", damage: [7, 12], hitAt: 550, duration: 1050, interval: 1600, stagger: 400, reaction: "slash", animation: "melee", afflict: { kind: "bleed", chance: 0.35 } }),
                melee({ id: "bite", damage: [5, 9], hitAt: 400, duration: 800, interval: 1400, reaction: "pierce", animation: "melee", afflict: { kind: "poison", chance: 0.5 } }),
            ),
            ranged({ id: "breath", reach: 5, damage: [5, 10], hitAt: 650, duration: 1300, interval: 3400, stagger: 200, reaction: "fire", animation: "breath", projectile: { kind: "flame", speed: 13 }, afflict: { kind: "burn", chance: 0.8 } }),
        ],
    },
    // (A salamander's bite burns, and it spits fire that lies burning a while, as a magma slime's
    // lava does)
    salamander: {
        label: "Jaws and fire",
        attacks: [
            melee({ id: "bite", damage: [3, 6], hitAt: 350, duration: 750, interval: 1200, reaction: "fire", animation: "melee", afflict: { kind: "burn", chance: 0.3 } }),
            ranged({ id: "flame", reach: 5, damage: [2, 5], hitAt: 500, duration: 1000, interval: 2400, reaction: "fire", animation: "spit", projectile: { kind: "lava", speed: 8 }, afflict: { kind: "burn", chance: 0.6 }, pool: { kind: "lava", ms: 3000, radius: 0.7 } }),
        ],
    },
    deathWorm: {
        label: "Maw and acid",
        attacks: [
            melee({ id: "bite", damage: [4, 7], hitAt: 400, duration: 800, interval: 1300, reaction: "pierce", animation: "melee", afflict: { kind: "poison", chance: 0.4 } }),
            ranged({ id: "spit", reach: 5, damage: [3, 5], hitAt: 450, duration: 900, interval: 2200, reaction: "arcane", animation: "spit", projectile: { kind: "venom", speed: 10 }, afflict: { kind: "poison", chance: 0.6 }, pool: { kind: "venom", ms: 4000, radius: 0.9 } }),
        ],
    },
    dragon: {
        label: "Fangs and fire",
        attacks: [
            melee({ id: "bite", damage: [8, 14], hitAt: 500, duration: 1000, interval: 1600, stagger: 400, reaction: "hack", animation: "melee", afflict: { kind: "bleed", chance: 0.4 } }),
            ranged({ id: "breath", reach: 6, damage: [6, 12], hitAt: 700, duration: 1400, interval: 3000, stagger: 300, reaction: "fire", animation: "breath", projectile: { kind: "flame", speed: 14 }, afflict: { kind: "burn", chance: 1 } }),
        ],
    },
    // (The Moonfang's: a werewolf's, the heavier, its spring reaching further and knocking down)
    moonfang: {
        label: "Great claws and fangs",
        attacks: [
            eitherOf(
                melee({ id: "claw", reach: 1.6, damage: [10, 17], hitAt: 450, duration: 900, interval: 1200, stagger: 200, reaction: "slash", animation: "melee", afflict: { kind: "bleed", chance: 0.45 } }),
                melee({ id: "pounce", reach: 2.2, damage: [14, 24], hitAt: 650, duration: 1300, interval: 2400, stagger: 500, reaction: "hack", animation: "pounce", afflict: { kind: "bleed", chance: 0.5 } }),
            ),
        ],
    },
    // (The Dreadthorn's: greater than a drake's, its bite reaching further and laying a wound open,
    // its fire a long breath that sets whatever it reaches burning)
    dreadthorn: {
        label: "Jaws and dragonfire",
        attacks: [
            melee({ id: "bite", reach: 2, damage: [12, 20], hitAt: 720, duration: 1600, interval: 2000, stagger: 500, reaction: "hack", animation: "melee", afflict: { kind: "bleed", chance: 0.5 } }),
            ranged({ id: "breath", reach: 9, damage: [10, 18], hitAt: 1100, duration: 3400, interval: 6000, stagger: 400, reaction: "fire", animation: "breath", projectile: { kind: "flame", speed: 14 }, afflict: { kind: "burn", chance: 1 } }),
        ],
    },
    // (A ghost's touch is the grave's cold, slowing; its wail staggers whoever hears it. A wraith
    // rakes with its claws, and draws the life out of whoever it holds its hand out to)
    ghost: {
        label: "Grave-cold touch and wail",
        attacks: [
            melee({ id: "touch", damage: [3, 6], hitAt: 450, duration: 900, interval: 1300, reaction: "arcane", animation: "melee", afflict: { kind: "slow", chance: 0.35, look: "frost" } }),
            ranged({ id: "wail", reach: 5, damage: [2, 4], hitAt: 600, duration: 1200, interval: 3600, stagger: 450, reaction: "arcane", animation: "wail", projectile: { kind: "wail", speed: 9 } }),
        ],
    },
    wraith: {
        label: "Claws and draining",
        attacks: [
            melee({ id: "rake", damage: [5, 9], hitAt: 400, duration: 850, interval: 1250, reaction: "slash", animation: "melee", afflict: { kind: "wither", chance: 0.3 } }),
            ranged({ id: "drain", reach: 6, damage: [4, 7], hitAt: 650, duration: 1300, interval: 3000, reaction: "arcane", animation: "drain", projectile: { kind: "drain", speed: 8 }, afflict: { kind: "wither", chance: 0.6 } }),
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
    // (A cult's high priest's: its staff swung, and hellfire called down out of the dark)
    cultLeader: {
        label: "Staff and hellfire",
        attacks: [
            melee({ id: "strike", damage: [6, 11], hitAt: 330, duration: 700, interval: 1100, reaction: "strike", animation: "staff" }),
            ranged({ id: "hellfire", reach: 9, damage: [6, 10], hitAt: 600, duration: 1100, interval: 2600, stagger: 200, reaction: "fire", animation: "wand", projectile: { kind: "fireball", speed: 12 }, afflict: { kind: "burn", chance: 0.6 } }),
        ],
    },
    // (A fiend's: its claws raked, or a spring on whoever it's after, its wings spread, that
    // staggers them and sears)
    fiend: {
        label: "Claws and spring",
        attacks: [
            eitherOf(
                melee({ id: "claw", damage: [7, 12], hitAt: 450, duration: 950, interval: 1300, reaction: "slash", animation: "melee", afflict: { kind: "bleed", chance: 0.3 } }),
                melee({ id: "pounce", damage: [10, 17], hitAt: 900, duration: 1700, interval: 2600, stagger: 450, reaction: "hack", animation: "pounce", afflict: { kind: "burn", chance: 0.35 } }),
            ),
        ],
    },
    // (The Behemoth of the Rift's (creatures.js COLOSSUS, battle.js #colossus): its jaws slammed
    // down on whoever's just before it; its roar, throwing all round it off their feet; and its
    // atomic breath raked over the ground far ahead of it, blasting whoever it lands on back,
    // burning. Each timed to its clip (beasts/model.js MODELS kaiju), its breath fired from 1.3
    // seconds in for `lasts` ms; none of them a blow at one alone, but at the ground)
    kaiju: {
        label: "Atomic breath, jaws and roar",
        attacks: [
            { id: "slam", kind: "colossal", reach: 0, damage: [18, 30], hitAt: 1100, duration: 1600, interval: 1600, stagger: 400, reaction: "crush", animation: "slam" },
            { id: "roar", kind: "colossal", reach: 0, damage: [4, 8], hitAt: 3600, duration: 7600, interval: 7600, stagger: 400, reaction: "crush", animation: "roar" },
            { id: "atomicBreath", kind: "colossal", reach: 0, damage: [22, 34], hitAt: 1300, duration: 6000, interval: 6000, lasts: 3300, stagger: 500, reaction: "fire", animation: "breath", afflict: { kind: "burn", chance: 0.5 } },
        ],
    },
    // (A demon lord's: its burning fists, and hellfire hurled from its hand)
    // (A hell's flayed: creatures.js)
    flayling: {
        label: "Raw claws",
        attacks: [eitherOf(
            melee({ id: "rake", damage: [3, 6], hitAt: 400, duration: 850, interval: 1150, reaction: "slash", animation: "melee", afflict: { kind: "bleed", chance: 0.35 } }),
            melee({ id: "lunge", reach: 2, damage: [5, 9], hitAt: 700, duration: 1200, interval: 2400, stagger: 300, reaction: "pierce", animation: "lunge", afflict: { kind: "bleed", chance: 0.6 } }))],
    },
    cinderHusk: {
        label: "Smouldering grasp",
        attacks: [melee({ id: "grasp", damage: [5, 9], hitAt: 550, duration: 1050, interval: 1600, stagger: 250, reaction: "fire", animation: "melee", afflict: { kind: "burn", chance: 0.5 } })],
    },
    pyreAcolyte: {
        label: "Staff and pyre",
        attacks: [
            melee({ id: "sweep", damage: [3, 6], hitAt: 700, duration: 1300, interval: 1600, reaction: "crush", animation: "melee" }),
            ranged({ id: "pyre", reach: 8, damage: [4, 8], hitAt: 800, duration: 1600, interval: 2600, reaction: "fire", animation: "cast", projectile: { kind: "fireball", speed: 9 }, afflict: { kind: "burn", chance: 0.5 }, pool: { kind: "lava", ms: 3000, radius: 0.8 } }),
        ],
    },
    ossuaryPriest: {
        label: "Staff and grave-rot",
        attacks: [
            melee({ id: "sweep", damage: [4, 7], hitAt: 700, duration: 1300, interval: 1700, reaction: "crush", animation: "melee", afflict: { kind: "disease", chance: 0.25 } }),
            ranged({ id: "rot", reach: 7, damage: [3, 6], hitAt: 800, duration: 1600, interval: 2800, reaction: "arcane", animation: "curse", projectile: { kind: "curse", speed: 7 }, afflict: { kind: "disease", chance: 0.6 } }),
        ],
    },
    dirgeWarden: {
        label: "Halberd and dirge",
        attacks: [
            eitherOf(
                melee({ id: "sweep", reach: 2, damage: [8, 13], hitAt: 900, duration: 1700, interval: 2300, stagger: 400, knockdown: 900, reaction: "cleave", animation: "melee" }),
                melee({ id: "thrust", reach: 2, damage: [7, 11], hitAt: 700, duration: 1200, interval: 1900, reaction: "pierce", animation: "lunge", afflict: { kind: "bleed", chance: 0.3 } })),
            ranged({ id: "dirge", reach: 6, damage: [2, 4], hitAt: 900, duration: 1600, interval: 5000, reaction: "arcane", animation: "wail", projectile: { kind: "wail", speed: 7 }, afflict: { kind: "slow", chance: 1, look: "frost" } }),
        ],
    },
    flayedHierarch: {
        label: "Gilded staff and flaying curse",
        attacks: [
            melee({ id: "sweep", damage: [8, 13], hitAt: 800, duration: 1500, interval: 2000, stagger: 300, reaction: "crush", animation: "melee", afflict: { kind: "bleed", chance: 0.35 } }),
            ranged({ id: "flay", reach: 7, damage: [5, 9], hitAt: 850, duration: 1600, interval: 3200, reaction: "arcane", animation: "drain", projectile: { kind: "drain", speed: 8 }, afflict: { kind: "wither", chance: 0.6 }, drain: 0.6 }),
        ],
    },
    // (A hell's gorgers: creatures.js. Their maws bite ("bite"), spew ("spew") and roar)
    slagGorger: {
        label: "Maw and slag",
        attacks: [
            melee({ id: "bite", damage: [6, 10], hitAt: 550, duration: 1300, interval: 1600, reaction: "pierce", animation: "bite", afflict: { kind: "burn", chance: 0.35 } }),
            ranged({ id: "slag", reach: 6, damage: [4, 8], hitAt: 750, duration: 1800, interval: 3200, reaction: "fire", animation: "spew", projectile: { kind: "lava", speed: 7 }, afflict: { kind: "burn", chance: 0.7 }, pool: { kind: "lava", ms: 4000, radius: 1 } }),
        ],
    },
    forgeBrute: {
        label: "Club and maw",
        attacks: [eitherOf(
            melee({ id: "smash", reach: 1.6, damage: [9, 15], hitAt: 1100, duration: 2500, interval: 2600, stagger: 450, knockdown: 1200, reaction: "crush", animation: "melee", afflict: { kind: "burn", chance: 0.4 } }),
            melee({ id: "bite", damage: [6, 10], hitAt: 550, duration: 1300, interval: 1600, reaction: "pierce", animation: "bite" }))],
    },
    chainedGlutton: {
        label: "Spiked club and devouring maw",
        attacks: [eitherOf(
            melee({ id: "smash", reach: 1.6, damage: [10, 16], hitAt: 1100, duration: 2500, interval: 2600, stagger: 450, reaction: "crush", animation: "melee", afflict: { kind: "bleed", chance: 0.4 } }),
            melee({ id: "devour", damage: [8, 13], hitAt: 550, duration: 1300, interval: 1900, stagger: 300, reaction: "pierce", animation: "bite", afflict: { kind: "bleed", chance: 0.5 }, drain: 0.5 }))],
    },
    bloatGorger: {
        label: "Maw and bile",
        attacks: [
            melee({ id: "bite", damage: [5, 9], hitAt: 550, duration: 1300, interval: 1700, reaction: "pierce", animation: "bite", afflict: { kind: "disease", chance: 0.35 } }),
            ranged({ id: "bile", reach: 6, damage: [3, 6], hitAt: 750, duration: 1800, interval: 3000, reaction: "arcane", animation: "spew", projectile: { kind: "venom", speed: 7 }, afflict: { kind: "poison", chance: 0.8 }, pool: { kind: "venom", ms: 4000, radius: 1 } }),
        ],
    },
    pitRavager: {
        label: "Club and teeth",
        attacks: [eitherOf(
            melee({ id: "rend", reach: 1.6, damage: [8, 13], hitAt: 1100, duration: 2500, interval: 2500, stagger: 300, reaction: "hack", animation: "melee", afflict: { kind: "bleed", chance: 0.5 } }),
            melee({ id: "bite", damage: [6, 10], hitAt: 550, duration: 1300, interval: 1400, reaction: "pierce", animation: "bite", afflict: { kind: "bleed", chance: 0.4 } }))],
    },
    gorgerWarlord: {
        label: "Spiked club and maw",
        attacks: [eitherOf(
            melee({ id: "smash", reach: 1.8, damage: [12, 19], hitAt: 1100, duration: 2500, interval: 2600, stagger: 500, knockdown: 1400, reaction: "crush", animation: "melee" }),
            melee({ id: "bite", damage: [9, 14], hitAt: 550, duration: 1300, interval: 1700, reaction: "pierce", animation: "bite", afflict: { kind: "bleed", chance: 0.4 } }))],
    },
    demonLord: {
        label: "Burning fists and hellfire",
        attacks: [
            melee({ id: "smash", damage: [9, 15], hitAt: 640, duration: 1100, interval: 1600, stagger: 450, reaction: "crush", animation: "hammer", afflict: { kind: "burn", chance: 0.5 } }),
            ranged({ id: "hellfire", reach: 8, damage: [7, 12], hitAt: 700, duration: 1300, interval: 3200, stagger: 250, reaction: "fire", animation: "wand", projectile: { kind: "fireball", speed: 12 }, afflict: { kind: "burn", chance: 0.8 } }),
        ],
    },
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
