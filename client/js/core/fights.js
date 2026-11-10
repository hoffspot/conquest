// The dungeons' bosses' own fights (docs/DUNGEONS.md *Boss fights*): each final boss's, in its
// arena (dungeons/build.js), and each hell's masters' and Bellhaven's keep's wardens', on their
// levels. Phases at health marks, blows shown on the ground before they land, things falling across
// the arena, things to be broken that hatch or shield it, adds called, an enrage. What each has is
// laid onto its creature's own ways of fighting (creatures.js traitsOf) as it's roused (host.js
// #rouse: `withFight`), and fought out by the battle (battle.js #boss, #moves, #lobs, #rallies).
//
// A fight ({ moves, bomb, rally, stance, hover, phases, enrage }):
//  - `moves`, its own moves on top of its kind's (creatures.js `moves`: battle.js #moves), each from
//    its `phase` on (0, its first); a blow in a wedge before it (`quake.arc`, degrees across), what
//    it leaves where it lands (`quake.pool`: battle.js HAZARDS), at whoever's furthest off (`far`);
//  - `bomb`, something lobbed (creatures.js `bomb`), from its `phase` on, at whoever's furthest
//    (`far`), leaving a `pool`;
//  - `rally`, `stance` and `hover`, in place of its kind's (creatures.js);
//  - `phases`, its first and then one at each mark (`below`, a share of its hit points), each with
//    what it says when it starts (`told`, after its name), what's set out to be broken (`objects`:
//    { kind, count, hatch }, at its arena's spots: host.js #fightPhase), how much quicker it is
//    (`faster`), what falls across its arena (`falls`), what shields it (`shield`: { kind, least,
//    share }), its hurts regrowing (`regrow`: { share a second, `stop` ms after it's burnt }), its
//    bloodlust (`drain`, the share of what it deals it's healed by); each holding on till a later
//    phase says otherwise (battle.js #stage);
//  - `enrage`, fought too long (`after` ms it's been after anyone): a blast across its arena every
//    `every` ms till it's down or they are.

import { DEMON_FLARE, DEMON_LEAP, RIDER_CHARGE } from "./creatures.js";

// A blow on the ground all round it or before it, shown first (battle.js #moves `quake`), as the
// fights below have them
const quake = (id, { damage, hitAt = 1200, duration = 2200, animation = id, first = 6000, every = 12000, least = 0, most = 4, phase = 0, stagger = 450, reaction = "crush", ...rest }, ground) => ({
    id,
    kind: "melee",
    reach: 0,
    damage,
    hitAt,
    duration,
    interval: duration + 200,
    stagger,
    reaction,
    animation,
    first,
    every,
    least,
    most,
    phase,
    quake: ground,
    telegraph: true,
    ...rest,
});

// A leap on whoever keeps off (DEMON_LEAP's, as the Orc King's: its `kind` of landing)
const leap = (kind, { damage = [12, 19], first = 5000, every = 11000, phase = 0 } = {}) => ({ ...DEMON_LEAP, quake: { ...DEMON_LEAP.quake, kind }, damage, first, every, phase });

// A charge at whoever's furthest off (RIDER_CHARGE's, on foot)
const charge = ({ damage = [15, 23], first = 2000, every = 10000, phase = 0 } = {}) => ({ ...RIDER_CHARGE, damage, first, every, phase, most: 16, far: true });

// What a fight's enrage brings down on its arena, and when (6 minutes; 8, the Lord of the Pit's)
const enrage = (kind, told, after = 360000) => ({ after, every: 4000, first: 3000, radius: 40, damage: [70, 100], toss: 0.4, kind, told });

/** The bosses' fights, by their ids in their themes (dungeons/themes.js `bosses`, a realm's `warden`: the champion's `regalia`). */
export const FIGHTS = Object.freeze({
    // --- The final bosses, in their arenas ---

    // The Ant Monster, in her brood chamber: her flock called (as her kind does), and acid sprayed
    // in a wedge before her, a pool of it left; below two thirds, the egg clutches in its walls
    // hatching broods, and while two or more stand she takes half of any harm; below a third, the
    // chamber's roof coming down across it and she quicker. Six minutes: she buries it
    antMonster: {
        moves: [quake("acid", { damage: [11, 17], hitAt: 1300, animation: "spit", first: 5000, every: 11000, most: 6, reaction: "arcane", stagger: 300 }, { ahead: 0, radius: 6.5, arc: 70, toss: 0, kind: "acidSpray", element: "earth", afflict: { kind: "poison", chance: 0.6, look: "acid" }, pool: { kind: "acid", ms: 8000, radius: 1.9, damage: [2, 3] } })],
        phases: [
            {},
            { below: 2 / 3, told: "shrieks: the egg clutches in the walls split and stir!", objects: { kind: "antClutch", count: 4, hatch: { kind: "ant", count: [1, 2], most: 4, every: 20000, first: 3000, down: 2 } }, shield: { kind: "antClutch", least: 2, share: 0.5 } },
            { below: 1 / 3, told: "thrashes in fury: the chamber's roof begins to give way!", faster: 1.3, falls: { every: 6000, first: 2000, under: 2, count: 3, reach: 13, radius: 2, delay: 1700, damage: [10, 16], kind: "caveIn", toss: 0.5 } },
        ],
        enrage: enrage("caveIn", "brings her chamber down: the roof falls on everyone in it!"),
    },
    // The Troll King, in his great cavern: his club, and a boulder hurled at whoever's furthest
    // off; below two thirds, the ground slammed all round him and the stalactites shaken down;
    // below a third, his hurts regrowing as fast as they're dealt (fire stops it a while), quicker
    trollKing: {
        bomb: { kind: "boulder", damage: [12, 19], every: 9000, beyond: 5, reach: 16, far: true },
        moves: [quake("slam", { damage: [13, 20], hitAt: 1100, animation: "hammer", first: 2000, every: 12000, most: 3.5, phase: 1 }, { ahead: 0, radius: 3.6, toss: 1, kind: "trollSlam" })],
        phases: [
            {},
            { below: 2 / 3, told: "slams the cavern floor: the stalactites shake loose!", falls: { every: 8000, first: 3000, under: 1, count: 3, reach: 13, radius: 1.8, delay: 1600, damage: [11, 17], kind: "stalactite", toss: 0.4 } },
            { below: 1 / 3, told: "roars, his wounds knitting as you watch: burn them!", faster: 1.25, regrow: { share: 0.008, stop: 6000 } },
        ],
        enrage: enrage("trollSlam", "brings the cavern down about him!"),
    },
    // The Broodmother, in her webbed cavern: bites, and webbing spat in a wedge before her, slowing
    // whoever it catches; below two thirds, the egg sacs about the cavern hatching spiderlings, and
    // while two stand she takes half of any harm; below a third, up to the roof now and then, out
    // of reach, poison dripping from her in pools below
    broodmother: {
        moves: [quake("web", { damage: [8, 13], hitAt: 1000, animation: "spit", first: 4000, every: 10000, most: 6, reaction: "arcane", stagger: 300 }, { ahead: 0, radius: 6, arc: 60, toss: 0, kind: "webSpit", element: null, afflict: { kind: "slow", chance: 1 } })],
        hover: { below: 1 / 3, ms: 9000, every: 20000, rise: 1500 },
        phases: [
            {},
            { below: 2 / 3, told: "skitters back: the egg sacs about the cavern twitch!", objects: { kind: "eggSac", count: 3, hatch: { kind: "caveSpider", count: [2, 3], most: 5, every: 18000, first: 3000, down: 2 } }, shield: { kind: "eggSac", least: 2, share: 0.5 } },
            { below: 1 / 3, told: "climbs to the roof, dripping poison!", falls: { every: 3500, first: 1500, under: 2, count: 2, reach: 13, radius: 1.6, delay: 1400, damage: [6, 10], kind: "venomDrip", element: null, afflict: { kind: "poison", chance: 0.8 }, pool: { kind: "venom", ms: 7000, radius: 1.5, damage: [1, 2] } } },
        ],
        enrage: enrage("caveIn", "tears the cavern's roof down in her fury!"),
    },
    // The Goblin King, on his throne: his bomb volleys (as his kind's), his war band about him;
    // below two thirds, raiders and bombers called; below a third, bombs raining across the cave,
    // and he quicker
    goblinKing: {
        rally: [
            { below: 2 / 3, animation: "beckon", call: { kind: "goblin", count: [2, 3], most: 5, down: 1, told: "bellows for his war band: raiders come running!" } },
            { below: 2 / 3, animation: "beckon", call: { kind: "goblinBomber", count: [1, 2], most: 3, down: 1, told: "screeches for his bombers!" } },
        ],
        phases: [{}, { below: 2 / 3 }, { below: 1 / 3, told: "lights every fuse he has: bombs rain across the cave!", faster: 1.25, falls: { every: 5000, first: 1500, under: 2, count: 3, reach: 12, radius: 2.5, delay: 1800, damage: [8, 14], kind: "bigBomb", toss: 0.8 } }],
        enrage: enrage("bigBomb", "lights the powder store: the whole cave goes up!"),
    },
    // The Frost Troll, in his frozen cavern: his club, and frost breathed in a wedge before him,
    // chilling whoever it catches; below two thirds, icicles falling across the cavern; below a
    // third, a nova of frost all round him now and then, and he quicker
    frostTroll: {
        moves: [
            quake("breath", { damage: [11, 17], hitAt: 1200, animation: "roar", first: 5000, every: 11000, most: 6, reaction: "arcane", stagger: 300 }, { ahead: 0, radius: 6.5, arc: 70, toss: 0.2, kind: "frostBreath", element: "water", afflict: { kind: "slow", chance: 0.9, look: "frost" } }),
            quake("nova", { damage: [13, 20], hitAt: 1400, animation: "hammer", first: 2000, every: 12000, most: 4.5, phase: 2, reaction: "arcane" }, { ahead: 0, radius: 4.6, toss: 0.6, kind: "frostFlare", element: "water", afflict: { kind: "slow", chance: 0.9, look: "frost" } }),
        ],
        phases: [
            {},
            { below: 2 / 3, told: "howls: icicles shear from the cavern's roof!", falls: { every: 7000, first: 2000, under: 2, count: 3, reach: 13, radius: 1.8, delay: 1600, damage: [10, 16], kind: "icicle", element: "water", afflict: { kind: "slow", chance: 0.6, look: "frost" }, toss: 0.3 } },
            { below: 1 / 3, told: "glows with a killing cold!", faster: 1.25 },
        ],
        enrage: enrage("frostFlare", "freezes his cavern solid!"),
    },
    // The Orc Warlord, in his war cave: his great axe, and a leap on whoever keeps off; below two
    // thirds, goblin raiders and bombers rallied; below a third, his axe whirled all round him now
    // and then, and he quicker
    orcWarlord: {
        moves: [leap("orcSlam"), quake("whirl", { damage: [13, 20], hitAt: 970, duration: 2500, animation: "spin", first: 2000, every: 11000, most: 3, phase: 2, reaction: "chop" }, { ahead: 0, radius: 3.4, toss: 0.9, kind: "orcSpin", element: null })],
        rally: [
            { below: 2 / 3, animation: "rally", call: { kind: "goblin", count: [2, 3], most: 5, down: 1, told: "roars for his war band: goblin raiders pour in!" } },
            { below: 2 / 3, animation: "rally", call: { kind: "goblinBomber", count: [1, 2], most: 3, down: 1, told: "bellows for his bombers!" } },
        ],
        phases: [{}, { below: 2 / 3 }, { below: 1 / 3, told: "whirls his great axe, bloodied and roaring!", faster: 1.3 }],
        enrage: enrage("orcSlam", "brings his war cave down on everyone in it!"),
    },
    // The Outlaw King, in his great hall: his blades, two archers called to it as it begins; below
    // two thirds, oil jars thrown, burning where they land; below a third, his lieutenants called,
    // and he quicker
    banditLord: {
        bomb: { kind: "sunJar", damage: [8, 13], every: 7000, beyond: 3, reach: 13, phase: 1, pool: { kind: "fire", ms: 8000, radius: 2.1, damage: [2, 4] } },
        rally: [
            { below: 1, animation: "beckon", call: { kind: "bandit", count: [2, 2], most: 2, down: 1, title: "Outlaw archer", arms: "bow", told: "whistles: archers take the hall's corners!" } },
            { below: 1 / 3, animation: "beckon", call: { kind: "banditChief", count: [2, 2], most: 2, down: 1, title: "Outlaw lieutenant", told: "calls his lieutenants to him!" } },
        ],
        phases: [{}, { below: 2 / 3, told: "kicks over the oil jars: the hall's floor will burn!" }, { below: 1 / 3, faster: 1.25 }],
        enrage: enrage("bigBomb", "fires the powder kegs under his hall!"),
    },
    // The Ogre Captain, in his crate-stacked cavern: his club smashed down before him; below two
    // thirds, charging whoever's furthest off; below a third, the ground pounded all round him and
    // a hired ogre called
    ogreBoss: {
        moves: [
            quake("smash", { damage: [14, 21], hitAt: 1100, animation: "hammer", first: 4000, every: 8000, most: 4 }, { ahead: 2, radius: 2.3, toss: 1, kind: "ogreSmash" }),
            charge({ phase: 1 }),
            quake("pound", { damage: [13, 20], hitAt: 1300, animation: "hammer", first: 2000, every: 11000, most: 4, phase: 2 }, { ahead: 0, radius: 4.2, toss: 1, kind: "orcSlam" }),
        ],
        rally: [{ below: 1 / 3, animation: "beckon", call: { kind: "ogre", count: [1, 1], most: 1, down: 1, title: "Hired ogre", told: "bellows for his hired muscle!" } }],
        phases: [{}, { below: 2 / 3, told: "lowers his head and paws the ground!" }, { below: 1 / 3, told: "pounds the ground in a rage!" }],
        enrage: enrage("orcSlam", "brings the cavern's roof down!"),
    },
    // The Orc Reaver, in his war cave: his great axe and a leap; below two thirds, his cutthroats
    // rallied; below a third, his bloodlust, healed by what he deals, and he quicker
    orcReaver: {
        moves: [leap("orcSlam")],
        rally: [{ below: 2 / 3, animation: "rally", call: { kind: "bandit", count: [2, 3], most: 4, down: 1, title: "Cutthroat", told: "howls for his cutthroats!" } }],
        phases: [{}, { below: 2 / 3 }, { below: 1 / 3, told: "laughs, drunk on blood: what he deals heals him!", faster: 1.3, drain: 0.35 }],
        enrage: enrage("orcSlam", "brings his war cave down on everyone in it!"),
    },
    // The Tomb Lord, in the sanctum: his blade, and the grave's chill breathed in a wedge before
    // him, withering whoever it catches; below two thirds, three soul jars set about the sanctum,
    // each raising the dead now and then, and while two stand he takes half of any harm; below a
    // third, dark pools welling under whoever's near, and he quicker
    tombLord: {
        moves: [quake("chill", { damage: [11, 17], hitAt: 1200, animation: "castStun", first: 5000, every: 11000, most: 6, reaction: "arcane", stagger: 300 }, { ahead: 0, radius: 6, arc: 70, toss: 0, kind: "graveChill", element: null, afflict: { kind: "wither", chance: 0.7 } })],
        phases: [
            {},
            { below: 2 / 3, told: "raises his blade: soul jars blaze about the sanctum, and the dead stir!", objects: { kind: "soulJar", count: 3, hatch: { kind: "skeleton", count: [1, 2], most: 4, every: 20000, first: 4000, down: 2 } }, shield: { kind: "soulJar", least: 2, share: 0.5 } },
            { below: 1 / 3, told: "calls the dark up out of the floor!", faster: 1.25, falls: { every: 6000, first: 2000, under: 2, count: 0, reach: 14, radius: 2, delay: 1500, damage: [7, 11], kind: "darkPool", element: null, afflict: { kind: "wither", chance: 0.6 }, pool: { kind: "rot", ms: 6000, radius: 1.8, damage: [2, 3] } } },
        ],
        enrage: enrage("darkPool", "draws the life out of everyone in his sanctum!"),
    },
    // The Dread Wraith, in its crypt hall: its touch, and a wail all round it now and then; below
    // two thirds, fading out of reach a while, wisps called about it; below a third, dark pools
    // welling under whoever's near, and it quicker
    dreadWraith: {
        moves: [quake("wail", { damage: [10, 15], hitAt: 1300, animation: "wail", first: 5000, every: 12000, most: 5, reaction: "arcane", stagger: 500 }, { ahead: 0, radius: 5, toss: 0.3, kind: "wail", element: null, afflict: { kind: "fear", chance: 0.5 } })],
        hover: { below: 2 / 3, ms: 7000, every: 22000, rise: 1200 },
        rally: [{ below: 2 / 3, animation: "wail", call: { kind: "wisp", count: [2, 3], most: 4, down: 1, told: "fades from sight: wisps gather about it!" } }],
        phases: [{}, { below: 2 / 3 }, { below: 1 / 3, told: "wails, and the crypt's floor runs dark!", faster: 1.3, falls: { every: 5500, first: 2000, under: 2, count: 1, reach: 14, radius: 2, delay: 1500, damage: [7, 11], kind: "darkPool", element: null, afflict: { kind: "wither", chance: 0.6 }, pool: { kind: "rot", ms: 6000, radius: 1.8, damage: [2, 3] } } }],
        enrage: enrage("darkPool", "screams, and the cold of the grave takes the crypt!"),
    },
    // The Lord of the Pit, in his throne hall: his blows, a leap and hellfire all round him; below
    // two thirds, the hall's sigils bursting, hellfire falling across it, his henchmen called;
    // below a third, his hellfire more often, and he quicker. Eight minutes: the Pit takes them
    demonLord: {
        moves: [leap("demonLeap"), { ...DEMON_FLARE, damage: [12, 19] }, { ...DEMON_FLARE, id: "flare2", damage: [12, 19], first: 3000, every: 8000, phase: 2 }],
        rally: [{ below: 2 / 3, animation: "rally", call: { kind: "henchman", count: [2, 2], most: 3, down: 1, told: "calls his henchmen up out of the Pit!" } }],
        phases: [
            {},
            { below: 2 / 3, told: "raises his arms: the sigils of the hall burst into hellfire!", falls: { every: 6000, first: 2000, under: 2, count: 4, reach: 14, radius: 2.2, delay: 1700, damage: [12, 18], kind: "hellfire", element: "fire", afflict: { kind: "burn", chance: 0.7 }, pool: { kind: "fire", ms: 6000, radius: 1.8, damage: [2, 4] } } },
            { below: 1 / 3, told: "burns brighter, the hall shaking under him!", faster: 1.3 },
        ],
        enrage: enrage("hellfire", "opens the Pit beneath his hall: it takes everyone in it!", 480000),
    },
    // Prior Osric Vane, in the belfry: the Bell's toll (as his kind's), the Black Choir called (as
    // his kind's); below two thirds, stone falling from the belfry as the Bell tolls; below a third,
    // the toll more often, and he quicker
    prior: {
        moves: [quake("toll2", { damage: [12, 19], hitAt: 1550, duration: 2400, animation: "toll", first: 3000, every: 8000, most: 4, phase: 2 }, { ahead: 0, radius: 4, toss: 0.9, kind: "bellToll", element: null })],
        phases: [
            {},
            { below: 2 / 3, told: "rings the Bell with all his strength: the belfry's stones shake loose!", falls: { every: 7000, first: 2000, under: 2, count: 3, reach: 13, radius: 1.9, delay: 1600, damage: [11, 17], kind: "stoneFall", toss: 0.5 } },
            { below: 1 / 3, told: "hears the Bell's voice in his head, and it is angry!", faster: 1.25 },
        ],
        enrage: enrage("bellToll", "tolls the Bell until the belfry comes down!"),
    },

    // --- A hell's masters, on their levels ---

    // The Demon of the Breach: below half, lava bursting up across its room
    breachDemon: {
        phases: [{}, { below: 1 / 2, told: "tears at the Breach: lava bursts up through the floor!", falls: { every: 6500, first: 2000, under: 1, count: 3, reach: 12, radius: 2, delay: 1700, damage: [11, 17], kind: "lavaBurst", element: "fire", afflict: { kind: "burn", chance: 0.6 }, pool: { kind: "lava", ms: 6000, radius: 1.6, damage: [2, 3] } } }],
    },
    // The Hound of the Halls: below half, its three heads biting at once, and its howl calling the
    // dead up to it
    hound: {
        moves: [{ id: "maul", kind: "melee", reach: 0, damage: [10, 15], hitAt: 400, duration: 1500, interval: 1800, stagger: 400, reaction: "crush", animation: "bite", first: 1000, every: 7000, least: 0, most: 3.5, phase: 1, blows: [{ at: 400, share: 0.5 }, { at: 750, share: 0.5 }, { at: 1100, share: 0.6 }] }],
        rally: [{ below: 1 / 2, animation: "rally", hitAt: 1500, duration: 3500, call: { kind: "skeleton", count: [2, 3], most: 4, down: 2, told: "throws back its three heads and howls: the dead claw up out of the halls!" } }],
        phases: [{}, { below: 1 / 2, told: "snarls with all three heads at once!" }],
    },
    // The Forge Demon: its hammer brought down before it; below half, molten pools welling under
    // whoever's near, and it quicker
    forgeDemon: {
        moves: [quake("forge", { damage: [13, 20], hitAt: 1100, animation: "hammer", first: 4000, every: 9000, most: 4 }, { ahead: 2, radius: 2.4, toss: 1, kind: "forgeSlam", element: "fire", afflict: { kind: "burn", chance: 0.5 } })],
        phases: [{}, { below: 1 / 2, told: "brings the forge's heat up through the floor!", faster: 1.25, falls: { every: 6000, first: 2000, under: 2, count: 1, reach: 12, radius: 1.8, delay: 1600, damage: [9, 14], kind: "lavaBurst", element: "fire", afflict: { kind: "burn", chance: 0.6 }, pool: { kind: "lava", ms: 6000, radius: 1.6, damage: [2, 3] } } }],
    },
    // The Gatekeeper: its club smashed down before it, and a charge at whoever's furthest off
    gatekeeper: {
        moves: [quake("smash", { damage: [14, 21], hitAt: 1100, animation: "hammer", first: 4000, every: 8000, most: 4 }, { ahead: 2, radius: 2.3, toss: 1, kind: "ogreSmash" }), charge({ first: 6000, every: 12000 })],
        phases: [{}],
    },

    // --- Bellhaven's keep's wardens, on their floors ---

    // The Castellan: on guard now and then (blows from in front caught); below half, the watch
    // rallied to him
    castellan: {
        stance: { first: 6000, every: 14000, ms: 3500, within: 5, chance: 1, share: 1, turn: 70, front: 60 },
        rally: [{ below: 1 / 2, animation: "rally", call: { kind: "bellSpearman", count: [2, 2], most: 3, down: 1, told: "shouts for the watch!" } }],
        phases: [{}],
    },
    // The Sub-Prior: on guard now and then; initiates called at each third
    subprior: {
        stance: { first: 6000, every: 15000, ms: 3500, within: 5, chance: 1, share: 1, turn: 70, front: 60 },
        rally: [
            { below: 2 / 3, animation: "rally", call: { kind: "bellInitiate", count: [2, 3], most: 4, down: 1, told: "calls the initiates to the Bell's defence!" } },
            { below: 1 / 3, animation: "rally", call: { kind: "bellInitiate", count: [2, 3], most: 5, down: 1, told: "calls the initiates again!" } },
        ],
        phases: [{}],
    },
    // The Lector of the Choir: on guard now and then; below half, a knight of the Choir rallied,
    // and he quicker
    lector: {
        stance: { first: 6000, every: 14000, ms: 3500, within: 5, chance: 1, share: 1, turn: 70, front: 60 },
        rally: [{ below: 1 / 2, animation: "rally", call: { kind: "choirKnight", count: [1, 1], most: 2, down: 1, told: "sings out: a knight of the Black Choir answers!" } }],
        phases: [{}, { below: 1 / 2, faster: 1.25 }],
    },
});

/**
 * What a dungeon's boss or a level's warden fights with (`traits`: creatures.js traitsOf), its
 * own fight (FIGHTS, by its `regalia`) laid on: its fight's moves after its kind's; its fight's
 * `bomb`, `rally`, `stance` and `hover` in place of its kind's; its phases and enrage
 * (`fight`). As it was, for one with no fight of its own.
 */
export function withFight(traits, regalia) {
    const fight = FIGHTS[regalia];

    if (!fight) {
        return traits;
    }

    const { moves = [], bomb = null, rally = null, stance = null, hover = null, phases = [{}], enrage = null } = fight;

    return {
        ...traits,
        moves: [...(traits.moves ?? []), ...structuredClone(moves)],
        ...(bomb ? { bomb: structuredClone(bomb) } : {}),
        ...(rally ? { rally: structuredClone(rally) } : {}),
        ...(stance ? { stance: { ...stance } } : {}),
        ...(hover ? { hover: { ...hover } } : {}),
        fight: { phases: structuredClone(phases), ...(enrage ? { enrage: structuredClone(enrage) } : {}) },
    };
}

/** What's set out in an arena to be broken (FIGHTS `objects`): those kinds (creatures.js, `object`). */
export const FIGHT_OBJECTS = Object.freeze([...new Set(Object.values(FIGHTS).flatMap(({ phases = [] }) => phases.flatMap(({ objects }) => (objects ? [objects.kind] : []))))]);
