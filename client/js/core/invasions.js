// Invasions (docs/WAR.md *Invasions*): a big band of raiders come down one of a town's roads to
// attack it, and a big force of the town's own people march out to meet them at its edge, the
// town's crier crying the way they come and calling every able hand to its defence.
//
// The first comes to a character five minutes after they land in a town (their time in towns, as
// they've spent it: `clockOf`), wherever they are; and others every half hour to an hour of their
// time in towns after (never in their first few minutes in one). Only towns and cities are
// invaded, and only those whose people aren't the character's enemies. In a character's first,
// the raiders leave them be till they strike one: that one's theirs to fight for the rest of it,
// its fellows not; in every one after, the raiders fight them as they'd fight anyone.
//
// The town's people have the better of it: more of them, a whole line of battle (core/
// formation.js), and two squads of bomb throwers whose bombs (each people's own: BOMBERS) toss
// the raiders off their feet. Once only a share of the raiders are left standing, or none of
// those who fight up close (their archers, casters and healers can't hold the field alone), they
// break and run (`rout`, `close`). Whoever
// felled raiders has a bounty for each, the guilds' merit and the town's thanks; and one who
// brought down a good share of them (`big`), its lord's own purse and a rare piece from its
// armoury besides.
//
// Pure data and arithmetic: the host (core/host.js #invasions) brings them to life.

/**
 * How invasions come and go (ms of a character's time in towns, and metres):
 *  - `first`: the time before a character's first; `every`: between one and the next after (from
 *    and to); `settle`: how long they're to have been in the town before one after the first (and
 *    `settleFirst`, before the first) comes;
 *  - `kinds`: the kinds of settlement invaded (setpieces/town.js SETTLEMENT_KINDS); `within`: how
 *    far beyond its edge someone's still in it;
 *  - `tick`: how often each player's time in a town is counted;
 *  - `size`: how many of both sides together, with no device told (SIZE: as many as the
 *    players' devices in it can draw), `defenders` the share of them the town's;
 *    `bombers`: its bomb throwers, in `squads` of a share of its force each (`share`), at least
 *    `least`;
 *  - `out`: how far beyond the edge the raiders come out into the world, along the road;
 *    `inside`: how far inside it the town's soldiers form their line; `meet`: where the two lines
 *    meet, beyond it; `march`: how fast the town's line marches (m/s; the raiders', their band's);
 *  - `rout`: the share of the raiders left standing when they break and run, as they do once
 *    none of those in the roles that fight up close (`close`: core/formation.js ROLES) or their
 *    chiefs are; `run`: how fast they run, back the way they came, `away` metres beyond where
 *    they came out;
 *  - `linger`: how long those left stand once it's over before they go, as soon as they're not
 *    fighting; `lasts`: when it's gone on this long, everyone left in it goes (ms of the battle's
 *    time).
 */
export const INVASION = Object.freeze({
    first: 300000,
    every: Object.freeze([1800000, 3600000]),
    settle: 180000,
    settleFirst: 30000,
    kinds: Object.freeze(["town", "city", "capital"]),
    within: 12,
    tick: 1000,
    size: 120,
    defenders: 0.58,
    bombers: Object.freeze({ squads: 2, share: 0.025, least: 2 }),
    out: 70,
    inside: 6,
    meet: 14,
    march: 1.1,
    rout: 0.25,
    close: Object.freeze(["front", "heavy"]),
    run: 2.6,
    away: 40,
    linger: 20000,
    lasts: 600000,
});

/**
 * How big an invasion a device can draw and keep moving, both sides together (`sizeFor`): no more
 * than its kind of device's (`most`: a computer's, a phone's or a smaller phone's, as the game
 * tells them apart, world/view.js detectQuality), nor fewer than `least`; and as many as each
 * frame has room for, below `frame` ms (30 frames a second, a sixth to spare), each of them
 * costing it so much of a frame (`each`: ms) over what it's drawing already. Measured: a step of
 * a battle of 400 takes 7.5 ms on a computer (docs/WAR.md *Lines of battle*), a phone's about five
 * times as slow; and crowds of 200 add about 4 ms to a frame's update (docs/GAME.md *Crowds*).
 */
export const SIZE = Object.freeze({
    most: Object.freeze({ low: 120, medium: 160, high: 360 }),
    each: Object.freeze({ low: 0.1, medium: 0.09, high: 0.04 }),
    least: 60,
    frame: (1000 / 30) * (5 / 6),
});

/**
 * How big an invasion a device of a kind (`device`: "low", "medium" or "high") can draw, its
 * frames taking `work` ms now (to update and draw, before it comes): SIZE.
 */
export function sizeFor(work, device = "high") {
    const most = SIZE.most[device] ?? SIZE.most.low;
    const fits = Math.floor((SIZE.frame - (Number.isFinite(work) ? work : SIZE.frame)) / (SIZE.each[device] ?? SIZE.each.low));

    return Math.max(SIZE.least, Math.min(most, fits));
}

/** Whether a size someone's game tells the host is one it could be (SIZE). */
export const isSize = (size) => Number.isInteger(size) && size >= SIZE.least && size <= Math.max(...Object.values(SIZE.most));

/**
 * The bands that invade, each: its name (`label`), what one of it is called (`adjective`: "Bandit
 * cutthroat") and many of it (`many`); its mix of roles in a line (core/formation.js MIX's) and
 * what each role fights with (the first of several the most; WEAPONS keys, or weapons.js NATURAL's
 * own); each role's name (or a weapon's, where it has one of its own), and its chiefs' (one leading
 * every `chiefs` of it, the first among them, with `chief` in hand; each `chiefHp` times as hard
 * to bring down); how hard the rest are to bring down (`hp`: of a soldier's) and the share of each
 * blow their armour takes off (`armor`); how fast its line marches (`march`, m/s); how far each
 * role goes after an enemy (`leash`, metres: core/formation.js ROLES' where not given); whether its
 * line closes with the enemy it sees (`advance`), or stands `stand` metres short of where the
 * lines meet and lets them come; the share of it left standing when it breaks and runs (`rout`);
 * whether it comes only to a town by the sea (`coastal`); what the crier cries of it coming
 * (`cry`: its road `{way}`) and once it's beaten (`beaten`: criesOf, thanksOf); and what's found
 * on its fallen (core/progress.js LOOT). How each is dressed is characters/soldiers.js
 * raiderLook's.
 *
 * - **Bandits**: cutthroats with swords and cleavers behind round shields, brutes with hammers and
 *   axes, archers, and their chiefs; no casters or healers. Rough men, less hardy than a
 *   soldier, eager to close. Every character's first invasion is theirs.
 * - **Northmen**: raiders out of the north in furs and war paint, the shock of their berserkers
 *   (battle axes, greatswords, hammers: two in five of them, going far after whoever they see),
 *   axe-throwers and archers behind a thin shield line, their chieftains with greatswords. Quick
 *   to come on, and the last to break but the sellswords.
 * - **The Ashen Cult**: robed fanatics of the fire, faces smeared with ash. Their fire-callers
 *   (three in ten of them, with grimoires and wands, casting fire) and ash-priests healing them
 *   stand off short of the town's line and burn it as it comes, their zealots (staves and
 *   hammers) going out to meet it; their high priests hurl hellfire. Frail up close.
 * - **Sellswords**: a company of hired soldiers in mismatched plate, a deep shield line, greatswords
 *   and archers, a surgeon or two, their captains with greatswords: their armour taking off a tenth
 *   of each blow, and they hold the longest before they break.
 * - **Corsairs**: sea raiders, by the sea only: cutthroats with cleavers and swords, half of them
 *   archers, fast to come on and quick to break.
 */
export const BANDS = Object.freeze({
    bandits: Object.freeze({
        label: "Bandits",
        adjective: "Bandit",
        many: "bandits",
        mix: Object.freeze({ front: 0.5, heavy: 0.2, archer: 0.3, caster: 0, healer: 0 }),
        arms: Object.freeze({ front: Object.freeze(["cleaver", "sword"]), heavy: Object.freeze(["hammer", "axe"]), archer: Object.freeze(["bow"]) }),
        names: Object.freeze({ front: "cutthroat", heavy: "brute", archer: "archer", chief: "chief" }),
        chiefs: 25,
        chief: "sword",
        chiefHp: 2.5,
        hp: 0.85,
        march: 1.3,
        rout: 0.25,
        cry: "Bandits on the {way} road!",
        beaten: "The bandits are beaten!",
        loot: "raider",
    }),
    northmen: Object.freeze({
        label: "Northmen",
        adjective: "Northern",
        many: "northmen",
        mix: Object.freeze({ front: 0.3, heavy: 0.4, archer: 0.3, caster: 0, healer: 0 }),
        arms: Object.freeze({ front: Object.freeze(["sword", "cleaver"]), heavy: Object.freeze(["axe", "greatsword", "hammer"]), archer: Object.freeze(["throwingAxes", "bow"]) }),
        names: Object.freeze({ front: "raider", heavy: "berserker", archer: "archer", throwingAxes: "axe-thrower", chief: "chieftain" }),
        chiefs: 30,
        chief: "greatsword",
        chiefHp: 3,
        hp: 1,
        march: 1.5,
        leash: Object.freeze({ heavy: 18 }),
        rout: 0.2,
        cry: "Northmen on the {way} road, axes high!",
        beaten: "The northmen are put to flight!",
        loot: "raider",
    }),
    cult: Object.freeze({
        label: "The Ashen Cult",
        adjective: "Ashen",
        many: "cultists",
        mix: Object.freeze({ front: 0.45, heavy: 0.15, archer: 0, caster: 0.3, healer: 0.1 }),
        arms: Object.freeze({ front: Object.freeze(["staff"]), heavy: Object.freeze(["hammer"]), caster: Object.freeze(["grimoire", "wand"]), healer: Object.freeze(["staff"]) }),
        names: Object.freeze({ front: "zealot", heavy: "zealot", caster: "fire-caller", healer: "ash-priest", chief: "high priest" }),
        chiefs: 40,
        chief: "ashenPriest",
        chiefHp: 3,
        hp: 0.7,
        march: 1.1,
        advance: false,
        stand: 10,
        rout: 0.25,
        cry: "The Ashen Cult on the {way} road, with fire!",
        beaten: "The cult's fires are put out!",
        loot: "raider",
    }),
    sellswords: Object.freeze({
        label: "Sellswords",
        adjective: "Sellsword",
        many: "sellswords",
        mix: Object.freeze({ front: 0.45, heavy: 0.2, archer: 0.3, caster: 0, healer: 0.05 }),
        arms: Object.freeze({ front: Object.freeze(["sword"]), heavy: Object.freeze(["greatsword", "greatsword", "hammer"]), archer: Object.freeze(["bow"]), healer: Object.freeze(["staff"]) }),
        names: Object.freeze({ front: "swordsman", heavy: "two-hander", archer: "archer", healer: "surgeon", chief: "captain" }),
        chiefs: 30,
        chief: "greatsword",
        chiefHp: 2.5,
        hp: 0.9,
        armor: 0.1,
        march: 1.1,
        rout: 0.15,
        cry: "A sellsword company on the {way} road!",
        beaten: "The sellswords' company breaks!",
        loot: "raider",
    }),
    corsairs: Object.freeze({
        label: "Corsairs",
        adjective: "Corsair",
        many: "corsairs",
        mix: Object.freeze({ front: 0.4, heavy: 0.1, archer: 0.5, caster: 0, healer: 0 }),
        arms: Object.freeze({ front: Object.freeze(["cleaver", "sword"]), heavy: Object.freeze(["axe"]), archer: Object.freeze(["bow"]) }),
        names: Object.freeze({ front: "cutthroat", heavy: "brute", archer: "archer", chief: "captain" }),
        chiefs: 25,
        chief: "sword",
        chiefHp: 2.5,
        hp: 0.8,
        march: 1.6,
        rout: 0.4,
        coastal: true,
        cry: "Corsairs up from the shore, on the {way} road!",
        beaten: "The corsairs flee for their ships!",
        loot: "raider",
    }),
});

/**
 * The Behemoth of the Rift's invasion (creatures.js kaiju): one of the great beasts out of the rift
 * by the Tower of Sar Mordal, come down a town's road by night, its whole strength marching out to
 * meet it. In place of a band (`id`, as an invasion's band), the one creature (`creature`):
 *  - **When**: by night only (the torches lit: core/light.js torchesLit), one time in `share` of
 *    the invasions due then; never a character's first;
 *  - **Where it comes**: out `out` metres beyond the town's edge on the road, walking on its own
 *    way (battle.js #colossus) to `stops` metres beyond its edge, where the town's line meets it;
 *  - **The town's side**: as big as the devices there can draw (SIZE) but the room the Behemoth
 *    takes itself (`costs`: as many soldiers' worth), all of it the town's: its siege engines
 *    rolled out behind the line (ENGINES), the rest its soldiers, their bomb throwers `bombers` of
 *    them (in two squads on its flanks, at least `least` each); each of them going after it as far
 *    as `leash` metres from their place in the line, so all of them do;
 *  - **How strong**: its hit points `hp` for each of the town's soldiers who meets it (a siege
 *    engine as many as it's worth: ENGINES `worth`), and `grows` more for each for every one of
 *    them (the more of them, the better they fight it:
 *    their arrows can't miss so big a beast): a close fight the town wins about two times in
 *    three, at any size (docs/WAR.md *The Behemoth of the Rift*);
 *  - **How it ends**: the Behemoth slain, the town held; the town's soldiers fallen but `last` of
 *    them (a share), it goes back the way it came (`away` metres further, and gone); gone on
 *    `lasts` ms, it goes back;
 *  - **What it says**: its name (`label`), what it's called after (`many`), the crier's cries of it
 *    coming (`cry`: its road `{way}`) and once it's slain (`beaten`).
 */
export const BEHEMOTH = Object.freeze({
    id: "behemoth",
    creature: "kaiju",
    share: 1 / 3,
    out: 150,
    stops: 10,
    leash: 90,
    costs: 20,
    bombers: 0.06,
    least: 3,
    hp: 130,
    grows: 0.25,
    away: 60,
    last: 0.05,
    lasts: 900000,
    label: "The Behemoth of the Rift",
    many: "the Behemoth",
    cry: "A great beast out of the rift, on the {way} road!",
    beaten: "The Behemoth of the Rift is slain!",
});

/**
 * A town's siege engines, rolled out against the Behemoth of the Rift (BEHEMOTH): a catapult and a
 * ballista for every `per` of the town's side (at least one of each), behind its line. Each a
 * soldier of its own (`kinds`: its `weapon`, weapons.js NATURAL catapult and ballista, and what
 * it's called, `name`): as strong as `hp`, its timbers turning `armor` of every blow, rolled no
 * faster than `speed` m/s; taking as much room as `costs` soldiers on the devices that draw it, and
 * as many soldiers' worth against the Behemoth as `worth` (its hit points grow as much:
 * behemothSides); and `crew` of the town's soldiers keeping by it (as a follower keeps by its
 * leader: battle.js #follow), fighting for it up close.
 */
export const ENGINES = Object.freeze({
    per: 50,
    costs: 2,
    worth: 9,
    crew: 2,
    kinds: Object.freeze({
        catapult: Object.freeze({ weapon: "catapult", name: "catapult", hp: 160, armor: 0.35, speed: 0.9 }),
        ballista: Object.freeze({ weapon: "ballista", name: "ballista", hp: 140, armor: 0.3, speed: 1 }),
    }),
});

/** What an invasion's band says of itself (BANDS'; the Behemoth's, BEHEMOTH): its label, many, cry and beaten. */
export const bandOf = (band) => (band === BEHEMOTH.id ? BEHEMOTH : BANDS[band]);

/**
 * Whether an invasion due at a town is the Behemoth's (BEHEMOTH): by night (`dark`), never in
 * anyone's first (`first`), one time in BEHEMOTH.share (`roll`: 0 to 1).
 */
export const isBehemoth = ({ dark, first, roll }) => dark && !first && roll < BEHEMOTH.share;

/**
 * How the town meets the Behemoth with `size` in all it can draw: { defenders (its soldiers,
 * its bomb throwers and its engines' crews among them), bombers (in each of its squads: `squads`
 * of them), engines (how many of each kind: ENGINES, each taking as much room as `costs` of its
 * soldiers), hp (the Behemoth's hit points: BEHEMOTH.hp for each of its soldiers, an engine as
 * many as it's `worth`, and `grows` more for each for every one of them) }.
 */
export function behemothSides(size = INVASION.size) {
    const side = Math.max(SIZE.least - BEHEMOTH.costs, size - BEHEMOTH.costs);
    const each = Math.max(1, Math.round(side / ENGINES.per));
    const engines = Object.fromEntries(Object.keys(ENGINES.kinds).map((kind) => [kind, each]));
    const rolled = each * Object.keys(ENGINES.kinds).length;
    const defenders = side - rolled * ENGINES.costs;
    const strength = defenders + rolled * ENGINES.worth;
    const { squads } = INVASION.bombers;

    return { defenders, bombers: Math.max(BEHEMOTH.least, Math.round(defenders * BEHEMOTH.bombers)), squads, engines, hp: Math.round(strength * (BEHEMOTH.hp + BEHEMOTH.grows * strength)) };
}

/** How near the sea a town is to be for a band that comes only by the sea (`coastal`): cells of the world plan's (CELL metres). */
export const COAST = 12;

/** The name of one of a band who fights with `weapon` in a role (BANDS `names`: the weapon's own, else the role's). */
export const raiderName = (band, role, weapon) => BANDS[band].names[weapon] ?? BANDS[band].names[role] ?? BANDS[band].names.front;

/**
 * Which band invades a town (BANDS): bandits in anyone's first (`first`); else any of them, as
 * `random` has it, one that comes only by the sea only to a town by it (`coastal`).
 */
export function bandFor({ first, coastal, random }) {
    if (first) {
        return "bandits";
    }

    return random.pick(Object.keys(BANDS).filter((band) => coastal || !BANDS[band].coastal));
}

/**
 * Each people's town's bomb throwers (core/weapons.js NATURAL bombardier and its kin): a sword up
 * close and their people's own bombs further off (battle.js BOMBS), what they throw (`weapon`)
 * and what they're called (`name`): the humans' grenadiers with black-powder grenadoes, the
 * elves' starfire sowers with seed pods of starfire, the dark elves' shadowfire slingers with orbs
 * of it wrapped in spider silk, the cat folk's naphtha throwers with clay sun jars of desert
 * naphtha, the lizard folk's bladder throwers with bladders of swamp gas, and the orcs' bomb
 * throwers with goblin bombs.
 */
export const BOMBERS = Object.freeze({
    human: Object.freeze({ weapon: "grenadier", name: "grenadier" }),
    elf: Object.freeze({ weapon: "starfireSower", name: "starfire sower" }),
    darkElf: Object.freeze({ weapon: "shadowfireSlinger", name: "shadowfire slinger" }),
    cat: Object.freeze({ weapon: "naphthaThrower", name: "naphtha thrower" }),
    lizard: Object.freeze({ weapon: "bladderThrower", name: "bladder thrower" }),
    orc: Object.freeze({ weapon: "bombardier", name: "bomb thrower" }),
});

/** A people's town's bomb throwers (BOMBERS): any other people's, goblin bombs. */
export const bombersOf = (people) => BOMBERS[people] ?? BOMBERS.orc;

/**
 * A character's time in towns, as kept (Progress `invasion`), made safe: { seen (how many
 * invasions they've been in), clock (their time in towns since the last, or since they began:
 * ms), due (the time in towns the next comes at), place (the town they're in now, or null), here
 * (how long they've been in it) }.
 */
export function clockOf(kept = null) {
    const whole = (value, least = 0) => (Number.isFinite(value) ? Math.max(least, Math.floor(value)) : least);
    const seen = whole(kept?.seen);

    return {
        seen,
        clock: whole(kept?.clock),
        due: Number.isFinite(kept?.due) && kept.due > 0 ? Math.floor(kept.due) : seen ? INVASION.every[0] : INVASION.first,
        place: typeof kept?.place === "string" ? kept.place : null,
        here: whole(kept?.here),
    };
}

/** When the next invasion comes to someone who's been in `seen` of them (time in towns, ms): `random` (core/random.js) for when, after the first. */
export function dueAfter(seen, random) {
    const [from, to] = INVASION.every;

    return seen ? Math.floor(from + random.next() * (to - from)) : INVASION.first;
}

/** Whether an invasion comes now to someone whose time in towns is `clock` (clockOf). */
export const isDue = (clock) => clock.place !== null && clock.clock >= clock.due && clock.here >= (clock.seen ? INVASION.settle : INVASION.settleFirst);

/**
 * How many of each side an invasion of `size` in all has: { invaders, defenders (the town's, its
 * bomb throwers among them), bombers (in each of its squads: `squads` of them) }.
 */
export function sidesOf(size = INVASION.size) {
    const defenders = Math.round(size * INVASION.defenders);
    const { squads, share, least } = INVASION.bombers;

    return { invaders: size - defenders, defenders, bombers: Math.max(least, Math.round(defenders * share)), squads };
}

/** What one of a band in a role fights with (the `k`th of its role, for which of its role's weapons). */
export function raiderArms(band, role, k = 0) {
    const arms = BANDS[band].arms[role] ?? BANDS[band].arms.front;

    return arms[k % arms.length];
}

/**
 * What an invasion's raiders felled are worth to whoever felled them: `bounty` gold each; the
 * guilds' merit and the town's thanks, each so much for taking part, one more for every so many
 * felled, at most so much ([for any, per so many, most]); and once they've felled `big` of all
 * the raiders, the town held, its lord's `purse`, `bigMerit` and `bigThanks` more, and a piece of
 * `quality` from its armoury. Their thanks a favour (`favour`) of the town's people's to the
 * player's, where theirs is another's.
 */
export const REWARD = Object.freeze({ bounty: 3, merit: Object.freeze([2, 4, 8]), thanks: Object.freeze([3, 3, 12]), big: 0.15, purse: 150, bigMerit: 4, bigThanks: 8, favour: 3, quality: "rare" });

/**
 * How someone is thanked for an invasion, for the raiders they felled (`felled`, of `of`), the
 * town held or not (`held`): { gold (a bounty for each, and the lord's purse), merit (the guilds'),
 * thanks (standing with the town's people, their own; else as a favour between peoples), big
 * (whether they brought down a share of them: the lord's own reward, a rare piece from the
 * armoury too) }. Nothing, for none felled.
 */
export function rewardOf({ felled, of, held = true }) {
    if (!(felled > 0)) {
        return { gold: 0, merit: 0, thanks: 0, big: false };
    }

    const big = held && of > 0 && felled / of >= REWARD.big;
    const [merit, meritPer, meritMost] = REWARD.merit;
    const [thanks, thanksPer, thanksMost] = REWARD.thanks;

    return {
        gold: felled * REWARD.bounty + (big ? REWARD.purse : 0),
        merit: Math.min(meritMost, merit + Math.floor(felled / meritPer)) + (big ? REWARD.bigMerit : 0),
        thanks: Math.min(thanksMost, thanks + Math.floor(felled / thanksPer)) + (big ? REWARD.bigThanks : 0),
        big,
    };
}

/**
 * What wounding the Behemoth is worth to someone (BEHEMOTH): for the share of its hit points they
 * dealt it (`share`, 0 to 1), the town held or not (`held`): a bounty of `bounty` gold for all of
 * it, a share each; the guilds' merit and the town's thanks, each so much for taking part, so much
 * more for all of it; and once they've dealt it `big` of its hit points, the town held, its lord's
 * purse and a piece from its armoury besides (REWARD). Nothing, for none dealt.
 */
export const BEHEMOTH_REWARD = Object.freeze({ bounty: 900, merit: Object.freeze([3, 24]), thanks: Object.freeze([4, 30]), big: 0.08 });

export function behemothReward({ share, held = true }) {
    if (!(share > 0)) {
        return { gold: 0, merit: 0, thanks: 0, big: false };
    }

    const { bounty, merit, thanks, big } = BEHEMOTH_REWARD;
    const lord = held && share >= big;
    const whole = Math.min(1, share);

    return {
        gold: Math.max(1, Math.round(bounty * whole * (held ? 1 : 0.5))) + (lord ? REWARD.purse : 0),
        merit: merit[0] + Math.round(merit[1] * whole) + (lord ? REWARD.bigMerit : 0),
        thanks: thanks[0] + Math.round(thanks[1] * whole) + (lord ? REWARD.bigThanks : 0),
        big: lord,
    };
}

/** How the crier opens his calls while an invasion's on (core/crying.js OPENINGS, his others). */
export const ALARM = "To arms! To arms!";

/**
 * The crier's cries as an invasion comes (each at most 90 characters, as every cry: core/
 * crying.js), the way it's coming from (`way`: "north", "south-east"...): the raiders and their
 * road, then his plea to every able hand, the adventurers first, to defend the town.
 */
export function criesOf(band, way) {
    const them = band === BEHEMOTH.id ? "it" : "them";

    return [`${bandOf(band).cry.replace("{way}", way)} Every able hand, defend the town!`, `Adventurers! Able hands! To the ${way} road, and drive ${them} off!`];
}

/** The crier's thanks once they're beaten off (at most 90 characters): the band's own `beaten`, and the town's thanks. */
export const thanksOf = (band) => `${bandOf(band).beaten} The town thanks every brave soul who stood for it!`;
