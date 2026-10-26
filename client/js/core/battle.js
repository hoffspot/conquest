// The battle: characters moving and fighting in the world.
//
// It advances in fixed steps of STEP_MS, so it runs the same on every device (and one player's
// game can later be the authority for others'). Each character is a circle BODY across the middle
// on the ground, anywhere (x, y: metres), and walks straight from corner to corner of a way found
// over its map's navigation mesh (navigation.js navigatorOf): round walls and furniture, over
// bridges, keeping out of deep water and off cliffs. It never walks into another character: it
// steps aside round them where there's room, and waits where there isn't. The world's 1-metre
// squares are still what it stands on for everything else (the square under its middle: what it
// can see, reach and talk to; where it's put; where it's going).
//
// The ways found are the battle's one dealing with the navigation meshes, and they're kept to the
// centimetre: a host's battle tells whoever's listening each one it finds (onPath), and a battle
// replaying a host's game (core/netplay.js) takes the host's (replay) rather than finding its
// own, so the two never differ, whatever of the meshes each has made.
//
// Fighting is automatic:
//  - The player goes where they're told (a "move" order) and, whenever they're standing still,
//    attacks any enemy within reach of their weapon. Told to "engage" an enemy, they walk until
//    it's within reach, then attack it. Locked on one (engaged with lock: true), it stays their
//    target wherever they go, struck before any other in reach, till it falls or is LOCK_REACH
//    off (#keepLock).
//  - An enemy patrols between its patrol points (or keeps its post). When it sees an enemy of
//    its (within SIGHT squares, with nothing in the way, and within its leash of its post or its
//    round), or one of its own it can see is fighting one, it chases them and attacks whenever
//    they're within reach, giving up and going back to its patrol if it loses sight of them for
//    GIVE_UP_MS. Struck, it (and a creature's whole pack) goes after whoever did it, beyond its
//    leash and unseen, till DEFEND_MS after the last blow (#provoke).
//
// Told to run (an order with run: true), a character sprints: SPRINT times as fast as it walks,
// speeding up and slowing down as runners do (ACCELERATION, BRAKING), and slowing to a walk in
// time to arrive. Running uses stamina, STAMINA_DRAIN points a second; anything else gets it
// back, STAMINA_RECOVERY a second (faster for a player after a courtesan's company: its
// `recovery`, host.js COMPANY). A character has as much stamina as it has hit points, and it
// never goes below none or above that. With none left, a runner walks the rest of the way.
//
// A character can cast spells (spells.js) too: healing itself, or stunning an enemy it can see
// within reach, which then can't move, attack or do anything else for a while. Casting takes a
// moment, standing still; every spell then shares one cooldown.
//
// The world can have several maps (the town, and the floors of buildings: world.js, interiors.js)
// joined by links (doors, stairs). Each character is on one map, and only sees, meets and fights
// those on the same one. Told to "enter" a link, a character walks to its end and comes out at
// its other end, on the other map. An enemy chasing someone who goes through a link just after
// it saw them follows them through; one that gives up the chase on another map finds its way
// back to its patrol.
//
// An attack (weapons.js) lands its blow hitAt into it: melee attacks hit if the target is still
// within reach, ranged attacks let go of a projectile that flies to the target. Each hit rolls its
// damage and takes it off the target's hit points; at none, the target dies, and comes back to
// life at its starting point a while later (KINDS: respawn).
//
// Told to "approach" someone, the player walks up to them (next to them, or across a bar, a table
// or a counter: TALK_REACH) and stops there, facing them ("arrived"): to talk. Someone talking (talk()) stops what they're doing and faces
// whoever they're talking to until it's over.
//
// Weapons are put away (sheathed, slung on the back...) out of a fight, and drawn for one: when an
// enemy comes into sight, or anyone's after them, or the player is told to fight someone. Drawing
// takes a moment (DRAW_MS) before the weapon can be used; once no enemy has been in sight or
// after them for SHEATHE_AFTER_MS, they put it away again, which takes a while too (SHEATHE_MS).
// (A "draw" event: { id, on }.)
//
// The folk (roles.js) rest now and then while the player can see them: every several seconds
// (REST_EVERY) one of their role's five rests, never the same twice running, staying put until
// it's done (a "rest" event: { id, role, rest }). A courtesan, when the player comes into her
// sight, turns to them and beckons them into her room first (an "act" event, act "beckon").
//
// Nothing here draws anything: every step returns events ("attack", "hit", "death"...) for the
// interface to show. Pure JavaScript with seeded random numbers, no DOM.

import { AFFLICTIONS, shareOf } from "./afflictions.js";
import { RESEARCH } from "./bestiary.js";
import { FALL_BACK, GUARD_REACH } from "./followers.js";
import { placeAt, placesOf } from "./formation.js";
import { bonusOf, chainAfter, isWhole, lapsed, mighty, PRISMATIC, sigilSpell } from "./prismatic.js";
import { crosses, nearestFree, squareKey, squaresOf } from "./grid.js";
import { routeBetween } from "./interiors.js";
import { playerSight, sightAt } from "./light.js";
import { navigatorOf } from "./navigation.js";
import { createRandom } from "./random.js";
import { BECKON, REST_EVERY, ROLES } from "./roles.js";
import { rollHeal, rollSpell, SCHOOLS, SPELL_COOLDOWN, SPELLS, WARD } from "./spells.js";
import { Variety } from "./variety.js";
import { armsOf, chooseAttack, distanceBetween, longestReach, MELEE_REACH, ringsApart, rollDamage, WEAPONS } from "./weapons.js";
import { atan2, cos, hypot, pow, sin } from "./exact.js";

/**
 * How near (squares) two people have to be to talk, seeing each other: next to each other, or
 * with something between them (a bar, a table: in the way, not hiding them), across it.
 */
export const TALK_REACH = Object.freeze({ near: 1.5, across: 3.2 });

/** The length of one step, in ms. */
export const STEP_MS = 50;

/**
 * Drawing a weapon: how long until it can be used (ms). Putting it away: how long it takes, and
 * how long after a fight it's done (ms: no enemy in sight or after them for this long).
 */
export const DRAW_MS = 700;
export const SHEATHE_MS = 1000;
export const SHEATHE_AFTER_MS = 10000;

/** How far characters can see, in squares. */
export const SIGHT = 12;

/**
 * How long (ms) a creature holding a place gone into (`wild.wary`) waits, turned to them, before it
 * does anything on first seeing someone come in, unless they strike it first: so no one's set on
 * as they step through the door. Again once it's let them go.
 */
export const WARY_MS = 2000;

/**
 * Each kind of character: hit points, walking speed (m/s), chasing speed, and how long (ms) until
 * it comes back after dying (a soldier never does: its town's garrison is one the fewer).
 */
export const KINDS = Object.freeze({
    player: { hp: 50, speed: 1.7, respawn: 5000 },
    orc: { hp: 50, speed: 1.1, chase: 1.8, respawn: 30000 },
    folk: { hp: 50, speed: 1.2, respawn: 5000 },
    soldier: { hp: 40, speed: 1.3, chase: 2.3, respawn: Infinity },
    // (A player's follower: a hired sword, keeping up with them; one who falls is gone: M9)
    follower: { hp: 50, speed: 1.7, chase: 2.3, respawn: Infinity },
    // (One of the wild's creatures: core/creatures.js has how strong and fast each is)
    beast: { hp: 30, speed: 1.2, chase: 2.4, respawn: Infinity },
    // (A convoy's wagon and the ox drawing it: no one's foe, going where it's driven; host.js
    // CONVOY_NEAR)
    wagon: { hp: 200, speed: 1.1, respawn: Infinity },
    // (A guard tower or a forward garrison (core/war/forts.js): standing over its `footprint`, never
    // moving, shooting at whatever comes within reach of its loops; razed, it's gone)
    fort: { hp: 1200, speed: 0, chase: 0, respawn: Infinity },
    // (A section of a camp's palisade under assault (host.js #storms): standing over its
    // `footprint` of wall, doing nothing; no one's set on it but those sent to hack it down (a
    // `siege`, or a player told to), and felled it's broken open)
    stakes: { hp: 300, speed: 0, chase: 0, respawn: Infinity },
});

/**
 * How a follower (or a companion by magic) keeps with its leader (docs/WAR.md M9): how near
 * (squares) it keeps while they stand (`near`), and while they're on the move (`close`); how far
 * from its leader (squares) it goes after an enemy of theirs it can see (`guard`). It goes at its
 * leader's pace (theirs as they go, a sprint as they sprint; or its own, if that's faster), never
 * tiring, and the further behind it is, the faster than them: a little (`keeping` times their pace)
 * as far out as `keep` metres, and from there up to `catching` times by `lost` metres. Further
 * behind than that (stuck, or left on another floor), and not in a fight its leader's in too, it's
 * brought to them, a few squares behind them (host.js #keepUp).
 */
export const FOLLOW = Object.freeze({ near: 3, close: 2, guard: 12, keep: 10, lost: 20, keeping: 1.1, catching: 1.5 });

/**
 * How much faster than its leader's pace a follower goes, `metres` behind them (FOLLOW): none
 * as near as it keeps, a little more out to `keep`, and up to `catching` times by `lost`.
 */
export function keepingUp(metres) {
    const { near, keep, lost, keeping, catching } = FOLLOW;

    if (metres <= near) {
        return 1;
    }

    if (metres <= keep) {
        return 1 + ((keeping - 1) * (metres - near)) / (keep - near);
    }

    return Math.min(catching, keeping + ((catching - keeping) * (metres - keep)) / (lost - keep));
}

/**
 * Are two characters' teams enemies: on different teams, and neither one of the folk no one
 * fights? (A battle asks more: Battle's hostile.)
 */
export const hostile = (a, b) => a.team !== b.team && !a.neutral && !b.neutral;

/**
 * Whether one of the folk who sits (at a table, a pew) is sitting just now: not up and away in a
 * fright (#afraid), nor on its way back to its seat after.
 */
export const sitting = (actor) => Boolean(actor.routine?.seated) && (actor.afraid ?? null) === null && !actor.reseat;

/** How long (ms) someone struck, and those of its own who saw, hold it against the striker. */
export const FOE_MS = 60000;

/** How long someone who passed for one of a people's is known for what they are, seen through (ms). */
export const UNMASKED_MS = 120000;

/**
 * What lies on the ground a while, hurting whoever of the other side stands in it (not one who's
 * levitating): fire (Flamefill, Hellfire), acid (Acidify), rot (Putrify), a magma slime's lava and
 * a spitter's venom. How often it hurts (ms), how much (`share` of the spell's hurt that left it;
 * or `damage`, times the creature's power), what may take hold, and its element (for wards).
 */
export const HAZARDS = Object.freeze({
    fire: { every: 700, share: 0.12, afflict: { kind: "burn", chance: 0.3 }, element: "fire", reaction: "fire" },
    acid: { every: 800, share: 0.1, afflict: { kind: "poison", chance: 0.3, look: "acid" }, element: "earth", reaction: "arcane" },
    rot: { every: 1000, share: 0.1, afflict: { kind: "disease", chance: 0.25 }, element: "water", reaction: "arcane" },
    lava: { every: 700, damage: 2, afflict: { kind: "burn", chance: 0.4 }, element: "fire", reaction: "fire" },
    venom: { every: 800, damage: 1, afflict: { kind: "poison", chance: 0.35 }, element: null, reaction: "arcane" },
});

/**
 * Bombs (docs/WILDS.md *Goblins*): lobbed at a spot on the ground (where whoever they're thrown
 * at stands then), landing after a flight as long as it's far (`speed` m/s, `soonest` ms at the
 * least), then fizzing there `fuse` ms before bursting: a blast (#blast) `radius` metres round,
 * hurting the thrower's enemies in it (its thrower's attack's `damage` at its heart, half that at
 * its edge, times a creature's blows from afar: its tier; a player's Goblin Bomb's, the item's:
 * progress.js ITEMS) and throwing them (`toss`, times TOSS.far). A goblin bomber's, and the
 * Goblin King's bigger one (creatures.js `bomb`); each people's own, its bomb throwers' (weapons.js
 * NATURAL bombardier and its kin: the humans' black-powder grenado, thrown furthest; the elves'
 * starfire seed pod, bursting widest; the dark elves' shadowfire orb in spider silk, withering
 * whoever it catches; the cat folk's clay sun jar of desert naphtha, setting them alight; the
 * lizard folk's swamp-gas bladder, poisoning them; the orcs', goblin bombs); a town's catapult's
 * pot of burning pitch, flung far, bursting the moment it lands and setting what it catches
 * alight (weapons.js NATURAL catapult); and what a hell's
 * creatures leave where they fall dead (creatures.js `burst`), swelling a moment before it bursts,
 * drawn as it is, not as a bomb (`look`): a cinder husk's embers, and a bloat gorger's bile,
 * poisoning whoever it catches (its blast's `element`, fire's but for it, and what it leaves on
 * them, `afflict`).
 */
export const BOMBS = Object.freeze({
    goblinBomb: { radius: 2.5, toss: 1, fuse: 1500, speed: 9, soonest: 500 },
    bigBomb: { radius: 3.5, toss: 1.4, fuse: 1800, speed: 8, soonest: 600 },
    grenado: { radius: 2.5, toss: 1.3, fuse: 1400, speed: 9, soonest: 500 },
    starfirePod: { radius: 3, toss: 0.7, fuse: 1200, speed: 9, soonest: 500 },
    shadowfireOrb: { radius: 2.5, toss: 0.8, fuse: 1500, speed: 9, soonest: 500, afflict: { kind: "wither", chance: 0.5 } },
    sunJar: { radius: 2.3, toss: 0.7, fuse: 1100, speed: 9, soonest: 500, afflict: { kind: "burn", chance: 0.7 } },
    gasBladder: { radius: 2.8, toss: 0.4, fuse: 1300, speed: 8, soonest: 500, element: "earth", afflict: { kind: "poison", chance: 0.7 } },
    cinders: { radius: 2.2, toss: 0.6, fuse: 1200, speed: 9, soonest: 0, look: "embers" },
    bile: { radius: 2.4, toss: 0.4, fuse: 1000, speed: 9, soonest: 0, look: "bile", element: "earth", afflict: { kind: "poison", chance: 0.8 } },
    firePot: { radius: 3.5, toss: 1.1, fuse: 100, speed: 16, soonest: 900, afflict: { kind: "burn", chance: 0.8 } },
});

/**
 * How far up one that's taken to the air is (battle.js #hover: its `aloft`, { from, down,
 * landed }) at `time` (ms): 0 on the ground, 1 all the way up; eased going up and coming down.
 */
export function aloftShare(aloft, time) {
    if (!aloft) {
        return 0;
    }

    const rise = aloft.landed - aloft.down;
    const eased = (u) => {
        const v = Math.min(1, Math.max(0, u));

        return v * v * (3 - 2 * v);
    };

    return time < aloft.down ? eased((time - aloft.from) / rise) : 1 - eased((time - aloft.down) / rise);
}

/**
 * Thrown by a blast (docs/CHARACTERS.md *Thrown*): flung away from its heart, `far` metres from
 * the heart of it (times the blast's `toss`), half that from its edge, as far as there's clear
 * ground that way (the nearest free square, else where they stood); in the air `flight` ms and
 * `per` ms more a metre, `up` metres high and `upPer` more a metre; down, and getting up, `down`
 * ms in all (they can't move, fight, cast or use anything till then); and not thrown again for
 * `spared` ms after. Never one too heavy to throw or not solid enough to (creatures.js `steady`),
 * the perilous places' own, an elite, a dungeon's boss, a fortification, a palisade or a wagon.
 */
export const TOSS = Object.freeze({ far: 3, flight: 550, per: 90, up: 1.1, upPer: 0.25, down: 2600, spared: 4000 });

/**
 * One that keeps its distance (a goblin bomber: creatures.js `keep`): come nearer than its `keep`
 * metres, it backs off that far again (KEEP.off metres more), at most once every KEEP.every ms;
 * between, cornered, it fights where it stands.
 */
export const KEEP = Object.freeze({ off: 2, every: 4000 });

/**
 * One calling its flock to it (creatures.js `call`: the Ant Monster, #calls): a motion of its own
 * that strikes no one, its call heard as it would land (`hitAt`), taking it `duration` ms, nothing
 * else started meanwhile.
 */
export const CALL = Object.freeze({ id: "call", kind: "call", reach: 0, damage: [0, 0], hitAt: 1500, duration: 2500, interval: 2500, reaction: "punch", animation: "call" });

/**
 * How much likelier one of the wild's mightier creatures is to shrug off a spell that would bend
 * its will (Fear, Pacify, Polymorph) for each tier past the middle ones (from none at tier 4 to
 * RESIST.most); the unique (the perilous places' own) and players never bend.
 */
export const RESIST = Object.freeze({ from: 4, perTier: 0.15, most: 0.9 });

/** How long after first being frightened a creature's fear wears thin (Fear: half as long, then not at all), ms. */
export const FEAR_MEMORY = 60000;

/**
 * Seeing through Invisibility: only the mightiest (a creature of this tier or more, or one of the
 * unique) near (within `near` m, and in sight) of someone invisible, a chance each second that
 * grows the longer they're near (`perSecond`, times the seconds so far) of seeing them.
 */
export const SEE_THROUGH = Object.freeze({ tier: 7, near: 8, perSecond: 0.02 });

// The element of a blow that isn't a spell (for wards: spells.js `ward`), by what it throws
const THROWN = Object.freeze({ bolt: "magic", wisp: "magic", curse: "magic", fireball: "fire", flame: "fire", riftFire: "fire", lava: "fire", roots: "earth" });
// How much of a blow or a spell's harm gets through the charms someone carries against its school
// or element (actor.wards: host.js, core/goods.js CHARMS), every spell's too (`magic`): never less
// than half of it
const charmed = (target, school, element) => {
    const wards = target.wards;

    if (!wards || (!school && !element)) {
        return 1;
    }

    return 1 - Math.min(0.5, (wards[school ?? element] ?? 0) + (school && school !== "magic" ? (wards.magic ?? 0) : 0));
};

const elementOf = (attack) => attack.element ?? THROWN[attack.projectile?.kind] ?? (attack.reaction === "fire" ? "fire" : attack.afflict?.look === "frost" ? "water" : null);

// A chain as its "prism" events tell it (core/prismatic.js): the element being cast up through,
// its tier reached, the pieces of the sigil held, and when it came whole
const chainOf = (prism) => ({ element: prism?.element ?? null, step: prism?.step ?? 0, pieces: [...(prism?.pieces ?? [])], readyAt: prism?.readyAt ?? null });

// Is a blow magic (a spell, or a wand's or grimoire's bolt, a curse, a wisp's)? (Not a blow of the body: Surge and Inertial Barrier have nothing to do with it)
const magicOf = (attack, spell) => Boolean(spell) || THROWN[attack.projectile?.kind] === "magic" || attack.projectile?.kind === "fireball";

/**
 * How many times as fast as it walks a character sprints: as people do, walking at about 1.4
 * metres a second (5 km/h) and sprinting at about 6.5 (23 km/h).
 */
export const SPRINT = 6.5 / 1.4;

/** Stamina used running, and got back doing anything else, in points a second. */
export const STAMINA_DRAIN = 1.5;
export const STAMINA_RECOVERY = 1;

// How quickly a runner speeds up and slows down (metres a second, each second): about a second
// from a walk to a sprint, and a few strides to slow from one
export const ACCELERATION = 6;
const BRAKING = 7;

// An enemy that hasn't seen its target for this long goes back to its patrol (ms)
const GIVE_UP_MS = 3000;

// One in a formation looks again for whom to fight only this often (ms), meanwhile set on whoever
// it's set on: a field battle's hundreds each looking every step was most of what it cost
const RETHINK_MS = 250;

// How often the colossal (#colossus) looks again for whom it'd fight (ms), how many of their
// fellows within how far (metres) of one make them worth its breath, and how near it comes to
// where it means to stand (metres) before it stands there, turning to them
const COLOSSAL_THINK_MS = 1000;
const COLOSSAL_FELLOWS = 6;
const COLOSSAL_NEAR = 4;

// Enemies near a player go for them before anyone else: those within `reach` squares, at most
// `melee` of them up close and `ranged` shooting or casting at once (the rest fight whoever else
// is near)
export const AGGRO = Object.freeze({ reach: 15, melee: 6, ranged: 4 });

// One struck (or cast at) goes after whoever did it, however far that is beyond the leash that
// keeps it near its post or its round otherwise, until this long after they last did (ms): a guard
// shot at from beyond its leash defends itself, rather than standing there to be shot down
const DEFEND_MS = 10000;

/**
 * The folk in danger (#afraid): afraid of whoever they can see within `sight` squares that's
 * fighting (set on someone still standing), a creature of the wild that's a menace to all, or an
 * enemy of the people whose town they're in (their `side`). They run from the nearest, at `pace`
 * m/s, `hop` squares at a time, looking about them every `look` ms; once they've seen no one to
 * fear for `calm` ms, they go back about their business. Those whose part is to fight (roles.js
 * `fights`: a keep's sentries, the guild's adventurers) stand their ground instead, facing it.
 */
export const FLEE = Object.freeze({ sight: SIGHT, pace: 3.2, hop: 8, look: 400, calm: 6000 });

// A healer heals whoever of its own in reach is the most hurt, under `below` of their health;
// under `mend`, with the strongest of its spells that's ready
export const HEALING = Object.freeze({ below: 0.8, mend: 0.5 });

// A formation stops marching while any of it's fighting, and for this long after (ms)
const HOLD_MS = 1500;

// How near (squares) an enemy has to come to one hacking at a palisade for it to turn on them
const SIEGE_GUARD = 2.5;

// A formation closes its ranks over its fallen (and opens them for any joining it) this often (ms);
// one of it further than this from its place in it runs back to it (squares)
const CLOSE_MS = 1000;
const RANKS_RUN = 3;

// A formation that advances closes with the nearest enemy within `sight` metres of any of it, its
// front stopping `to` metres from them
export const ADVANCE = Object.freeze({ sight: 60, to: 2 });

// How long an enemy waits at each end of its patrol (ms)
const PATROL_PAUSE_MS = 1500;

// How long one of the wild's creatures rests between wanderings (ms), and how near (squares) one
// of a pack keeps to its leader
const WILD_REST = [4000, 12000];
const WILD_PACK = 3;

// How long one walking a round (an adventurers' cache's guards: core/caches.js) stands at each
// stop on it before going on to the next (ms)
const ROUND_REST = [1500, 3500];

// How often a chase finds a new path to a target that has moved (ms)
const REPATH_MS = 500;

/**
 * How near a player someone and where they're going must both be for their way to be found at
 * once, any navigation tiles it wants made there and then (metres): a fight beside a player
 * never waits. Further off, the way waits for its tiles (#pathTo). So near, they're the tiles
 * the game bakes ahead round a player (app/game.js BAKE_AHEAD) and mostly in already, but for
 * one just come there.
 */
export const WAIT_BEYOND = 48;

// A move order's goal: the nearest free square this many squares or less from where it's asked
// for; or, none there (open water), the first free one back towards the walker, no further back
// than this (so a tap far out to sea makes no more of the world than that)
const MOVE_NEAR = 24;
const MOVE_BACK = 96;

// How long a character waits for someone in its way before finding a way round them (ms)
const BLOCKED_WAIT_MS = 400;

// Whoever is in the way at a link's end, a character this near it goes through anyway (squares)
const LINK_REACH = 1;

// One of the folk that can't get to where it's going for this long (ms) goes somewhere else
const ROUTINE_GIVE_UP_MS = 8000;

// The folk don't rest until this long (ms) after doing something at a stop (pouring, serving),
// nor straight away when the player first sees them (a while between these, ms)
const REST_AFTER_ACT_MS = 3500;
const REST_WHEN_SEEN_MS = [800, 3000];

const same = (a, b) => a !== null && b !== null && a[0] === b[0] && a[1] === b[1];

// An angle (radians) turned the shortest way round: between -π and π
const wrapAngle = (angle) => angle - Math.PI * 2 * Math.floor((angle + Math.PI) / (Math.PI * 2));

// How far a square is from a patrol's round (metres): from the nearest point of the way between
// its points, each to the next and the last back to the first (a post's: from the post)
function offRound(patrol, [x, y]) {
    let nearest = distanceBetween(patrol[0], [x, y]);

    for (let k = 0; patrol.length > 1 && k < patrol.length; k++) {
        const [ax, ay] = patrol[k];
        const [bx, by] = patrol[(k + 1) % patrol.length];
        const [dx, dy] = [bx - ax, by - ay];
        const length = dx * dx + dy * dy;
        const along = length ? Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / length)) : 0;

        nearest = Math.min(nearest, distanceBetween([ax + dx * along, ay + dy * along], [x, y]));
    }

    return nearest;
}

// How far before and past a town's gatehouse (metres) a wagon goes along the middle of its way
// through. A wagon behind its ox (art/kits/wagon.js) is 1.7 m across, its tail 4 m behind the
// ox's middle, and a gate's way is narrower than the street through it (a cat folk's arch 3 m
// across, a lizard folk's 2.6), so it goes through in line, the ox turning off once it's through
const GATE_RUN = 5;

/**
 * A wagon's way from one point to another over a map's mesh: anyone's way, but through a town's
 * gate (a gatehouse whose middle the way crosses: the map's gatesNear) along the middle of its way
 * through, from GATE_RUN metres before the gatehouse to as far past it, rather than wherever
 * there's room for someone on foot. As anyone's where there's no straight way along it, and
 * (`wait`) waiting as anyone's does for the tiles it wants (#pathTo).
 */
function wagonWay(map, from, to, { wait = true } = {}) {
    const navigation = navigatorOf(map);
    const way = navigation.path(from, to, { wait });
    const corners = [from, ...way];
    const [xs, ys] = [corners.map(([x]) => x), corners.map(([, y]) => y)];

    for (const gate of map.gatesNear?.(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)) ?? []) {
        const [ax, ay] = gate.along;
        // (How far a point is along the gate's way from its middle, and how far to its side)
        const along = ([x, y]) => (x - gate.x) * ax + (y - gate.y) * ay;
        const aside = ([x, y]) => (x - gate.x) * ay - (y - gate.y) * ax;
        const through = corners.some((b, k) => {
            const a = corners[k - 1];
            const [va, vb] = k ? [along(a), along(b)] : [0, 0];
            const t = va / (va - vb);

            return k > 0 && va > 0 !== vb > 0 && Math.abs(aside([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])) <= gate.half;
        });
        const reach = gate.deep + GATE_RUN;
        const [starting, ending] = [from, to].map((point) => Math.abs(along(point)) < reach && Math.abs(aside(point)) <= gate.half);

        if (!through && !starting && !ending) {
            continue;
        }

        // (Out to past it, and on from there; or, going no further, as far along it as where it's
        // going: beside it, in line. In from before it; or, in it already, straight on from where
        // it is, or from beside it)
        const on = (v) => [gate.x + ax * v, gate.y + ay * v];
        const exit = on(ending ? along(to) : (along(to) > 0 ? 1 : -1) * reach);
        const before = on(Math.sign(along(from)) * reach);
        const entry = (starting ? [from, on(along(from)), before] : [before]).find((point) => navigation.walkable(...point) && navigation.raycast(point, exit)?.hit === false);

        if (!entry || !navigation.walkable(...exit)) {
            continue;
        }

        return [...(entry === from ? [] : roomy(navigation, from, navigation.path(from, entry))), ...(ending ? [exit] : roomy(navigation, exit, navigation.path(exit, to)))];
    }

    return roomy(navigation, from, way);
}

// How much further than someone on foot a wagon keeps from what its way bends round (metres): its
// wheels' half-width (art/kits/wagon.js: 0.83 m) past the room the mesh keeps (AGENT.radius, 0.25)
const WAGON_ROOM = 0.6;

// A way found from `from` with each corner it bends round between its ends moved out from the
// turn by WAGON_ROOM (or half that), where that's on the mesh and the way to and from it is clear
function roomy(navigation, from, way) {
    const corners = [from, ...way];

    for (let k = 1; k < corners.length - 1; k++) {
        const [a, b, c] = [corners[k - 1], corners[k], corners[k + 1]];
        const [into, out] = [hypot(b[0] - a[0], b[1] - a[1]), hypot(c[0] - b[0], c[1] - b[1])];

        if (into < 1e-6 || out < 1e-6) {
            continue;
        }

        const [nx, ny] = [(b[0] - a[0]) / into - (c[0] - b[0]) / out, (b[1] - a[1]) / into - (c[1] - b[1]) / out];
        const n = hypot(nx, ny);

        for (const push of n > 1e-6 ? [WAGON_ROOM, WAGON_ROOM / 2] : []) {
            const moved = [b[0] + (nx / n) * push, b[1] + (ny / n) * push];

            if (navigation.walkable(...moved) && navigation.raycast(a, moved)?.hit === false && navigation.raycast(moved, c)?.hit === false) {
                corners[k] = moved;
                break;
            }
        }
    }

    return corners.slice(1);
}

// Walking a path, a character heads straight for the furthest square of it that it can see (at
// most this many squares on), with this much room either side of it (metres: its body, so it
// doesn't graze a corner), rather than from square to square; and moves at most this far at a
// time (metres), so it notes every square it walks into
/** A character's radius (metres): two are never nearer than twice it. */
export const BODY = 0.3;

// How far a character walks at a time, at most (metres), checking it's clear
const STRIDE = 0.2;

// How near (metres, middle to middle) a character closes on whoever it's after with a blow up
// close before it stops to strike
const MELEE_SPACING = 1.2;

// How far one character can stand above another (metres) and still strike them up close, or step
// aside to where they'd stand: a step up (navigation/settings.js AGENT's climb), not from an army's
// camp's walkway to the lane under it (overworld.js RAISED)
const REACH_RISE = 0.75;

// What isn't seen through from a deck raised over the ground, or up at one (overworld.js RAISED),
// by a map's squares: what isn't from the ground, but what's low (LOW: a camp's stakes)
const OVER_LOW = new WeakMap();

// How often a shot or a spell from below at someone on a raised deck, over what's low (an army's
// camp's walkway, over its stakes), strikes the stakes instead: they're breast high to whoever's
// on it
const COVER = 0.5;

// How sharply it turns aside round someone in its way (radians: 30°, 60°, 90° and 120°, the last
// two to slip past someone it's run up against face to face), first away from them, then the
// other way; and how long it waits, blocked, before finding its way again
const ASIDE = [Math.PI / 6, Math.PI / 3, Math.PI / 2, (2 * Math.PI) / 3].map((angle) => [cos(angle), sin(angle)]);
const BLOCKED_REPATH_MS = 2000;

// How near a corner of its way a character that's stepped aside needs to come to it (metres)
const CORNER_SLACK = 0.6;

// Where everyone stands, kept by cell (INDEX_CELL metres a side), so that the nearest enemy, who's
// in the way and who's on a square are looked for among those near, not everyone: a field battle's
// hundreds (#indexed). Made again at the start of each step, and as soon as anyone's put somewhere
// new or has gone further than INDEX_SLACK metres from where it was made (a step's walk is far less)
const INDEX_CELL = 8;
const INDEX_SLACK = 1;

// Getting no nearer where it's going (by PROGRESS metres) for STUCK_MS, jostling with others in
// a narrow way, a character squeezes past them for SQUEEZE_MS, through anyone (not walls)
const PROGRESS = 0.3;
const STUCK_MS = 1500;
const SQUEEZE_MS = 2000;

// How near where it's going (metres, from their middle) someone standing still is among those
// gathered there, whom a character squeezing past (#bumps) doesn't go through: as near as a
// character blocked by them stops (#blocked)
const THRONG = 2 * BODY + 1;

// How long the straight way ahead (an "ahead" order) is looked along (metres; or as far as the
// order's `reach`, if that's shorter), and how near where it was told to go a character's way can
// end before it's found again from there (a way too long to find at once), at most how many times
const AHEAD = 400;
const MOVE_ON = 1.5;
const MOVE_LEGS = 8;

// How far off (metres) an enemy a player's locked on (their `lock`) gets before it's let go
export const LOCK_REACH = 40;

/**
 * Sliding past what's in the way of an "ahead" order (a lamppost, a tree, a wall gone along at a
 * slant): when the straight way's clear for less than `clear` metres, the ways `turns` (radians)
 * to either side of it are looked along too, each for no more than `leg` metres, and the one that
 * gets the furthest on the way it was sent is gone along, if that's `least` metres on or more (so
 * that sent straight into a wall, it doesn't go along it).
 */
export const SLIDE = Object.freeze({ clear: 1.5, turns: Object.freeze([0.35, 0.7, 1.05]), leg: 3, least: 0.5 });

// To the centimetre (the ways found, as a host sends them)
const cm = (value) => Math.round(value * 100) / 100;

// A cell of the index of where everyone stands (INDEX_CELL), as a number
const cellOf = (cx, cy) => (cx + 32768) * 65536 + (cy + 32768);

// The eight squares round one, and how many squares at most are looked through for a place to
// talk to someone from
const AROUND = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const TALK_SEARCH = 800;

export class Battle {
    /**
     * Whether the nearest enemy, who's in the way and who's on a square are looked for among those
     * near (#indexed), as they always are, or among everyone: only for the tests that check it
     * makes no difference.
     */
    static indexing = true;

    // Everyone by id (actor), and where everyone stands (#indexed): made again whenever they might
    // be out of date (`version`, bumped as anyone's added, taken out or put somewhere new)
    #ids = null;
    #roster = 0;
    #index = null;
    #version = 0;

    // The players in the battle, and how many of their enemies are set on each (melee, ranged),
    // as they are this step (#drawnTo); and who's after whom as the step began (#inFight: id ->
    // the ids of those set on, attacking or told to fight them)
    #players = [];
    #onPlayers = new Map();
    #chasers = new Map();

    /**
     * @param {object} world - From generateWorld (world.js): its blocked squares and spawns.
     * @param {object} [options]
     * @param {number} [options.seed] - Seeds the damage rolls.
     * @param {Function} [options.relations] - Whether two characters on different teams are
     *     enemies (the host's: how their peoples stand in the war); else they always are.
     * @param {Function} [options.allied] - Whether two characters are never enemies, whatever
     *     their peoples or what's passed between them (the host's: in one party).
     * @param {Function} [options.haven] - Whether someone's in a sanctuary (the host's: a shrine's,
     *     core/shrines.js), the wild's creatures never going after them there.
     */
    constructor(world, { seed = 1, relations = null, allied = null, haven = null } = {}) {
        this.world = world;
        this.relations = relations;
        this.allied = allied;
        this.haven = haven;

        // The maps (the world itself if it has only the one) and the links between them
        this.maps = world.maps ?? { town: world };
        this.links = world.links ?? [];
        this.random = createRandom(seed);

        // (The folk's comings and goings are each their own: actor.chance)
        this.seed = seed;
        this.time = 0;
        this.actors = [];
        this.projectiles = [];
        this.events = [];
        this.lag = 0;
        this.nextProjectile = 1;

        // What lies on the ground hurting those who stand in it (HAZARDS): { id, kind, map, x, y,
        // radius, until, next, damage, by, team, spell }
        this.hazards = [];
        this.nextHazard = 1;

        // The bombs lobbed and not burst yet (BOMBS): { id, kind, map, x, y, lands, bursts,
        // damage, power, by, team, caster }
        this.bombs = [];
        this.nextBomb = 1;

        // The colossal's breaths being raked over the ground (#colossal, #rake): { by, map, x, y
        // (where it stood), way ([x, y]: the way it faced), start, end (ms), next (its next blast,
        // ms), damage, power, struck (the ids it's caught) }
        this.breaths = [];

        // The formations in it, by id (formation): { anchor: [x, y] (the middle of its front rank),
        // facing, to: where it's marching ([x, y], or null standing), speed (m/s), advance (whether,
        // standing, it closes with the nearest enemy), charge (whether it's charging), engagedAt
        // (when any of it last fought), one
        // of it (`member`: its id, the last to keep its place), and the enemy it's closing with
        // (`sighted`: an id, or null) and when it looks again (`lookAt`); how many of it there were
        // when it last closed its ranks (`strength`), and when it next does (`closeAt`) }
        this.formations = {};

        // The light to see by out in the world (light.js lighting: the host's, worked out each
        // step; none, as by day), and the map it's for
        this.light = null;
        this.lightMap = "town";

        // Told each way found, (id, way), if anyone's listening (a host's netplay); and, replaying
        // a host's game, the ways it found to take instead ([time, id, way], in order), or null
        this.onPath = null;
        this.replay = null;

        // (A forecast's battle, fork: its ways found over the navigation tiles made already, none
        // made for them)
        this.bakedOnly = false;
    }

    /**
     * Add a character: { id, kind (a KINDS key), name, weapon (a WEAPONS key), boots (wearing
     * spiked boots, kicking too: weapons.js armsOf), team, square
     * ([x, y]), map (a map's id: "town" to start with), ai ("patrol" for enemies, "routine" for
     * the folk), patrol ([[x, y], [x, y]], on its map), neutral (one of the folk: no one fights
     * them, and they fight no one), routine (the folk's: see #routine), facing, armed (its
     * weapon drawn to start with; else it's put away), leash (a guard's: how far from its post,
     * its patrol's first point, it goes after an enemy, metres) }. It comes back to life where
     * it's added. The folk have a `role` (roles.js ROLES: how they rest), and a `side` (the people
     * whose town they're in, whose enemies they run from: #afraid). A patrol goes round its
     * points in turn (a guard's one point: its post, facing out the way it's added facing). One
     * carrying a shield has `shield` (#hit: { chance, share, spells }). One that's `lone` picks its
     * own fights: its own don't take up its grudges, nor do those it leaves be take up grudges
     * against it for others of their own it strikes (#provoke: an invasion's raiders). One with a
     * `sight` (squares) looks for enemies as far as that, not SIGHT (#nearestSeen: an invasion's
     * close fighters once its lines have charged). A follower fights its calling's way
     * (core/followers.js wayOf): `casts`, `heals`, `tactic` and `keep` (#follow).
     */
    add({ id, kind, name = kind, weapon = null, boots = false, team, square, map = "town", ai = null, patrol = null, neutral = false, routine = null, role = null, side = null, facing = 0, armed = false, leash = null, leader = null, hp = null, speed = null, chase = null, power = null, armor = 0, wards = null, shield = null, wild = null, footprint = null, formation = null, casts = null, heals = null, tactic = null, keep = null, lone = false, engine = null, sight = null }) {
        const kindOf = KINDS[kind];
        const type = { ...kindOf, hp: hp ?? kindOf.hp, speed: speed ?? kindOf.speed, chase: chase ?? speed ?? kindOf.chase };
        const chance = createRandom(this.seed + 7919 + [...id].reduce((hash, character) => (Math.imul(hash, 31) + character.charCodeAt(0)) | 0, 0));
        const actor = {
            id,
            kind,
            name,
            weapon,
            boots: boots || weapon === "boots",
            // Its attacks (its weapon's, and kicks); whether its weapon is drawn, and drawing
            // it or putting it away ({ on, until }); when it was last in a fight
            arms: armsOf(weapon, boots),
            armed,
            drawing: null,
            foughtAt: -Infinity,
            team,
            ai,
            patrol,
            leash,
            // (A follower's: whom it follows, by id; and whom it was told to fight, the one its
            // leader was set on, till they're down: host.js #orderUnit "assist")
            leader,
            assist: null,
            post: facing,
            // Whom it holds a grudge against (by id), and until when (FOE_MS); and who's struck it,
            // until when it goes after them beyond its leash (DEFEND_MS)
            foes: {},
            struckBy: {},
            // How much stronger its blows (up close, from afar), heals and stuns are than their
            // own (a player's skills and gear: core/progress.js), the share of each blow its
            // armour takes off, and how much stronger its next blow is (a power strike: null
            // for none)
            power: { melee: 1, ranged: 1, heal: 1, stun: 1, ...power },
            armor,
            // (How little some kinds of harm hurt it: a player's charms, set by the host; a
            // creature's own, creatures.js `wards`. `charmed`)
            ...(wards ? { wards: { ...wards } } : {}),
            empowered: null,
            // The shield it carries, if any: how often it catches a blow or a shot from in front
            // on it (`chance`), how much of it the shield takes (`share`), and whether it turns
            // spells too (`spells`: a spellward)
            shield,
            // The map it's on, where it comes back to life, and the last link it went through
            // ({ link, from, to, time })
            map,
            spawnMap: map,
            crossed: null,
            hp: type.hp,
            maxHp: type.hp,
            stamina: type.hp,
            maxStamina: type.hp,
            speed: type.speed,
            chaseSpeed: type.chase ?? type.speed,
            respawnMs: type.respawn,
            spawn: [...square],
            // Where it is (square middles are at + 0.5), the square it's on (under its middle), the
            // corners of the way it's walking ([[x, y], ...], metres; none standing still), and
            // whether it's stepped aside off that way (round someone)
            x: square[0] + 0.5,
            y: square[1] + 0.5,
            square: [...square],
            path: [],
            offPath: false,
            // Stepping aside round someone in its way, which way ({ id: theirs, side }: null on its
            // way)
            aside: null,
            // How near it's got to where it's going, and when ({ left, at }: null standing
            // still), and until when it's squeezing past others
            progress: null,
            squeezeUntil: 0,
            // How fast it's going (m/s), how fast it goes walking just now (an enemy chasing
            // walks faster), and whether it's running
            pace: type.speed,
            walkPace: type.speed,
            running: false,
            // Which way it faces: radians from south (+y), turning towards east (+x)
            facing,
            neutral,
            routine,
            role,
            // The folk's: whose town they're in; whom they're afraid of (an id, or null), until
            // when (they're calm again then), and when they next look about them (FLEE); and
            // whether one that sits has to go back to its seat
            side,
            afraid: null,
            calmAt: 0,
            lookAt: 0,
            reseat: false,
            // The folk's routine: the stop it's making for, whether it's there, and since when
            stop: 0,
            arrived: false,
            stopSince: 0,
            // Resting (the folk): when it may next, until when it's at it, and which it did last
            restAt: 0,
            restingUntil: 0,
            restVariety: new Variety(() => chance.next()),
            // Its own chances for its comings and goings (apart from the fighting's, and from
            // everyone else's, so folk elsewhere, made or let go, change nothing here)
            chance,
            // Beckoning (a role that beckons): whether it's beckoned the player since they came
            // into sight, when it last saw them, and until when it's beckoning
            beckoned: false,
            sawPlayerAt: -Infinity,
            beckoningUntil: 0,
            // Who it's talking to (an id), if anyone
            talkingTo: null,
            order: null,
            // The enemy a player's locked on (an id: kept their target as they go, #keepLock), or
            // null
            lock: null,
            // An Action Bar blow to be struck at someone, as soon as they're in reach and it can
            // be, wherever the striker's going ({ target, until (waited on till: ms, or null), tag
            // (what it is: an ability's id) }: strike, #obey), or null
            striking: null,
            attack: null,
            readyAt: 0,
            staggeredUntil: 0,
            // Stunned until (ms), the spell it's casting ({ spell, target, start, landsAt }), and
            // when it can cast another; knocked down until (ms: stunned till then too)
            stunnedUntil: 0,
            downUntil: 0,
            casting: null,
            spellReadyAt: 0,
            // When each spell it's cast is ready again (by spell: ms)
            spellsReadyAt: {},
            // A player's chain of the elements' spells (core/prismatic.js), or null
            prism: null,
            dead: false,
            respawnAt: 0,
            // What lingers on it after some blows (afflictions.js): poison, a web...
            afflictions: [],
            // The squares it stands over, if more than its own (a fortification): [x0, y0, x1, y1],
            // what's after it aimed at the nearest of them (#aimAt)
            footprint: footprint ? [...footprint] : null,
            // A siege engine's kind, if it's one (a town's catapult or ballista, its soldier: core/
            // invasions.js ENGINES): never staggered, knocked down or thrown, and only fire takes to
            // its timbers (#hit, #throwable, afflict)
            engine,
            // The spells that last on it (Resist Fire, Reflect, Invisibility...): { kind (the
            // spell), until, by, level }
            buffs: [],
            // Who it's been calmed towards (Pacify: by id), how often lately it's been frightened
            // ({ count, since }), and who it's seen through the Invisibility of (by id: seconds
            // near them so far, or true once it has)
            spared: {},
            feared: null,
            seeing: {},
            target: null,
            lastSeen: -Infinity,
            lastPathAt: -Infinity,
            pathGoal: null,
            blockedSince: null,
            patrolIndex: patrol && patrol.length > 1 ? 1 : 0,
            waitUntil: 0,
            // (One of the wild's creatures: { creature, tier, temper, guard, roam, leash, leader,
            // wary, round (the stops of a round it walks, [[x, y], ...], and `stop`: the one it's
            // at) }: #wild; and, wary, till when it waits on first seeing someone)
            wild,
            waryUntil: 0,
            // (One that takes to the air, badly hurt: off the ground, { from, down, landed } (ms:
            // going up from `from`, coming down from `down`, down again at `landed`), or null; and
            // when it may go up again: #hover)
            aloft: null,
            hoverAt: 0,
            // (One that lurks, a black widow (its wild's `lurk`): hanging unseen under the roof, no
            // one's enemy nor anyone its, till it drops on whoever comes beneath it, when it
            // dropped (ms): #lurk)
            lurking: Boolean(wild?.lurk),
            droppedAt: null,
            // (In a formation: its place in it, { id, slot: [right, back], role }: core/formation.js;
            // and when it next looks for whom to fight, RETHINK_MS)
            formation: formation ? { id: formation.id, slot: [...formation.slot], role: formation.role ?? null } : null,
            rethinkAt: 0,
            // (The spells it casts on its enemies, the first ready of them; and those it heals its
            // own with, weakest first: SPELLS ids)
            casts: casts ? [...casts] : null,
            heals: heals ? [...heals] : null,
            // (A follower's way of fighting, by its calling (core/followers.js wayOf): whom it goes
            // for first, and how near it lets a foe come before backing off, metres)
            ...(tactic ? { tactic } : {}),
            ...(keep ? { keep } : {}),
            ...(lone ? { lone: true } : {}),
            ...(sight ? { sight } : {}),
        };

        this.actors.push(actor);
        this.#roster++;
        this.#version++;

        return actor;
    }

    /**
     * A formation (core/formation.js) set up, or changed: { anchor: [x, y], facing (radians from
     * south, towards east), to: where it marches ([x, y]; null, it stands), speed (m/s), advance
     * (whether, standing, it closes with the nearest enemy any of it sees), broken (whether it's
     * broken and running: none of it takes on anyone, each runs for its place, and it marches
     * whoever's fighting), charge (whether it's charging: it runs on to where it's going whoever
     * of it's fighting, each of it running with it, and stops charging once it's there), layout
     * (how its ranks are laid out as they close: core/formation.js placesOf's, or null as a
     * line's) }, each left as it is if not given. Those in it (add's `formation`) keep
     * to their places in it as it goes (or the `post`s they're given: [x, y] metres, facing its
     * `facing`, if they have one), and go after enemies as far from them as their role's leash;
     * it stops marching while any of them are fighting, and closes its ranks as they fall
     * (CLOSE_MS). Null takes it away: they stand where they are.
     */
    formation(id, settings) {
        if (settings === null) {
            delete this.formations[id];

            return null;
        }

        const formation = (this.formations[id] ??= { anchor: [0, 0], facing: 0, to: null, speed: 1, advance: false, broken: false, charge: false, layout: null, engagedAt: -Infinity, member: null, sighted: null, lookAt: 0, strength: null, closeAt: 0 });

        for (const key of ["anchor", "facing", "to", "speed", "advance", "broken", "charge", "layout"]) {
            if (settings[key] !== undefined) {
                formation[key] = Array.isArray(settings[key]) ? [...settings[key]] : settings[key] && typeof settings[key] === "object" ? { ...settings[key] } : settings[key];
            }
        }

        return formation;
    }

    actor(id) {
        const ids = this.#ids;

        if (!ids || ids.actors !== this.actors || ids.length !== this.actors.length || ids.roster !== this.#roster) {
            this.#ids = { actors: this.actors, length: this.actors.length, roster: this.#roster, of: new Map(this.actors.map((actor) => [actor.id, actor])) };
        }

        return this.#ids.of.get(id) ?? null;
    }

    /**
     * Make a character's next blow of a kind ("melee" or "ranged") `factor` times as strong (a
     * power strike, an aimed shot: core/progress.js ABILITIES), and stun whoever it lands on for
     * `stun` ms if it's given (a shield bash: longer for a stronger stunner, `power.stun`).
     */
    /** Whether one character can strike another from where they stand (in reach, and seen for a shot). */
    reachable(id, targetId) {
        const [actor, target] = [this.actor(id), this.actor(targetId)];

        return Boolean(actor && target && !actor.dead && !target.dead && this.#reachable(actor, target));
    }

    /**
     * A blow at someone (an Action Bar blow, host.js #ability): struck as soon as they're in reach and
     * it can be, wherever the striker's going kept, the swing holding them a moment; out of reach,
     * waited on till `until` (ms, the battle's time; null: not at all); never struck, an
     * "unstruck" event, with `tag` (#obey).
     */
    strike(id, targetId, { until = null, tag = null } = {}) {
        const actor = this.actor(id);

        if (actor && !actor.dead) {
            actor.striking = { target: targetId, until, tag };
        }
    }

    empower(id, blow, factor, { stun = 0 } = {}) {
        const actor = this.actor(id);

        if (actor && !actor.dead) {
            actor.empowered = { blow, factor, ...(stun ? { stun } : {}) };
        }
    }

    /** Arm a character with another weapon (a WEAPONS key; spiked boots or not): put away to start with. */
    rearm(id, weapon, boots = false) {
        const actor = this.actor(id);

        if (!actor) {
            return;
        }

        Object.assign(actor, { weapon, boots: boots || weapon === "boots", arms: armsOf(weapon, boots), attack: null, drawing: null, armed: false, empowered: null });
    }

    /**
     * Someone carried off by magic (Teleport, Word of Recall, Wizard's Walk, a summons: host.js):
     * to a square on a map (the nearest free to it), facing a way, whatever they were doing left
     * off. Told as a "cross" (of the kind "magic", through no link: no one follows them). Where
     * they came to, or null if there's no room there.
     */
    place(id, map, square, { facing = null } = {}) {
        const actor = this.actor(id);

        if (!actor || !this.maps[map]) {
            return null;
        }

        let there;

        try {
            there = nearestFree(this.#squares(map), square, { taken: this.#others(map, actor), within: 12 });
        } catch {
            return null;
        }

        const from = actor.map;

        Object.assign(actor, { map, square: there, x: there[0] + 0.5, y: there[1] + 0.5, path: [], offPath: false, pathGoal: null, facing: facing ?? actor.facing, pace: actor.walkPace, attack: null, casting: null, order: null, target: null, crossed: null });
        this.#version++;

        // (No one's after them where they were)
        for (const other of this.actors) {
            if (other.target === id) {
                Object.assign(other, { target: null, path: [], pathGoal: null });
            }

            if (other.order?.target === id) {
                other.order = null;
            }
        }

        this.#emit("cross", { id, link: null, kind: "magic", from, to: map, square: there, facing: actor.facing });

        return there;
    }

    /**
     * A creature made into another (Polymorph: host.js), as hurt as it was for its size: its name,
     * weapon, hit points, pace, armour and what it is (`wild`).
     */
    reshape(id, { name, weapon, hp, speed, chase, armor = 0, wild }) {
        const actor = this.actor(id);

        if (!actor) {
            return;
        }

        const share = actor.hp / actor.maxHp;

        this.rearm(id, weapon);
        Object.assign(actor, { name, maxHp: hp, hp: Math.max(1, Math.round(hp * share)), maxStamina: hp, stamina: hp, speed, chaseSpeed: chase ?? speed, walkPace: speed, pace: speed, armor, wild: { ...actor.wild, ...wild }, target: null, path: [], pathGoal: null });
        this.#emit("reshaped", { id, name, weapon, hp: actor.hp, maxHp: actor.maxHp });
    }

    /** Mend a character's hurts (`hp`) and fill its stamina (`stamina`), as far as they go ("healed" if it's hurts). */
    mend(id, { hp = 0, stamina = 0 } = {}) {
        const actor = this.actor(id);

        if (!actor || actor.dead) {
            return;
        }

        if (hp > 0) {
            const before = actor.hp;

            // (Withered, it takes less well)
            actor.hp = Math.min(actor.maxHp, actor.hp + Math.round(hp * shareOf(actor, "healing")));
            this.#emit("healed", { id: actor.id, by: null, spell: null, amount: actor.hp - before, hp: actor.hp, maxHp: actor.maxHp });
        }

        actor.stamina = Math.min(actor.maxStamina, actor.stamina + stamina);
    }

    /**
     * Are two characters enemies? Never one of the folk (no one fights them), or itself, or one in
     * the same party (`allied`); always
     * if either's lately struck the other or one of its own (FOE_MS); never on the same team;
     * otherwise as their teams stand (`relations`: the peoples' war), or always, without that.
     */
    hostile(a, b) {
        // (Nor one lurking unseen overhead, till it drops: #lurk)
        return !a.lurking && !b.lurking && this.#hostile(a, b);
    }

    #hostile(a, b) {
        if (a === b || a.neutral || b.neutral) {
            return false;
        }

        // (In one party, the host says: never, whatever their peoples)
        if (this.allied?.(a, b)) {
            return false;
        }

        if ((a.foes?.[b.id] ?? -Infinity) > this.time || (b.foes?.[a.id] ?? -Infinity) > this.time) {
            return true;
        }

        // (Calmed towards them: Pacify, till they strike it)
        if (a.team === b.team || a.spared?.[b.id] || b.spared?.[a.id]) {
            return false;
        }

        // (Passing for one of them in their uniform: core/gear.js, till seen through)
        if (this.passes(a, b) || this.passes(b, a)) {
            return false;
        }

        return this.relations ? this.relations(a, b) : true;
    }

    /**
     * Whether one passes for one of another's people (`guise`: wearing their uniform, the host
     * says), not seen through (`unmasked`: till when they're known for what they are).
     */
    passes(one, other) {
        return Boolean(one.guise) && one.guise === other.team && !((one.unmasked ?? -Infinity) > this.time);
    }

    /** Someone known for what they are by the people they passed for, for a while (`ms`). */
    unmask(actor, ms = UNMASKED_MS) {
        actor.unmasked = Math.max(actor.unmasked ?? -Infinity, this.time + ms);
    }

    /**
     * Everything the battle is just now, as plain data (numbers, strings, arrays and plain
     * objects: ±Infinity among them, which core/wire.js carries): to keep, or to send to a player
     * joining (docs/WAR.md), and carry on from with Battle.restore exactly as this one would. The
     * world it's on isn't in it: that's made again from its seed (and its buildings' insides
     * made again in the same order: core/host.js).
     */
    snapshot() {
        return {
            seed: this.seed,
            time: this.time,
            lag: this.lag,
            random: this.random.state,
            nextProjectile: this.nextProjectile,
            actors: this.actors.map(({ chance, restVariety, ...actor }) => ({
                ...structuredClone(actor),
                chance: chance.state,
                restVariety: restVariety.toJSON(),
            })),
            projectiles: structuredClone(this.projectiles),
            hazards: structuredClone(this.hazards),
            nextHazard: this.nextHazard,
            bombs: structuredClone(this.bombs),
            nextBomb: this.nextBomb,
            breaths: structuredClone(this.breaths),
            formations: structuredClone(this.formations),
        };
    }

    /**
     * A battle of some of this one's characters only (`ids`), as they are now, on the same world,
     * its teams standing as they stand here: to look ahead at what they'd do, nothing of it
     * touching this one (a joined game's forecast of its own hero: app/forecast.js). Its ways are
     * found over the navigation tiles made already only (bakedOnly).
     */
    fork(ids) {
        const wanted = new Set(ids);
        const part = {
            seed: this.seed,
            time: this.time,
            lag: 0,
            random: this.random.state,
            nextProjectile: this.nextProjectile,
            actors: this.actors.filter(({ id }) => wanted.has(id)).map(({ chance, restVariety, ...actor }) => ({ ...actor, chance: chance.state, restVariety: restVariety.toJSON() })),
            // (Nothing in the air, on the ground or lined up of its own)
            projectiles: [],
            hazards: [],
            bombs: [],
            breaths: [],
            formations: {},
        };
        const forked = Battle.restore(this.world, part, { relations: this.relations, allied: this.allied, haven: this.haven });

        forked.bakedOnly = true;

        return forked;
    }

    /** A battle on `world` carrying on from a snapshot (snapshot()), its teams standing as `relations` has them. */
    static restore(world, snapshot, { relations = null, allied = null, haven = null } = {}) {
        const battle = new Battle(world, { seed: snapshot.seed, relations, allied, haven });

        Object.assign(battle, { time: snapshot.time, lag: snapshot.lag, nextProjectile: snapshot.nextProjectile, projectiles: structuredClone(snapshot.projectiles), hazards: structuredClone(snapshot.hazards ?? []), nextHazard: snapshot.nextHazard ?? 1, bombs: structuredClone(snapshot.bombs ?? []), nextBomb: snapshot.nextBomb ?? 1, breaths: structuredClone(snapshot.breaths ?? []), formations: structuredClone(snapshot.formations ?? {}) });
        battle.random.state = snapshot.random;
        battle.actors = snapshot.actors.map(({ chance: state, restVariety, to, steering, ...kept }) => {
            const actor = structuredClone(kept);
            const chance = createRandom(0);

            chance.state = state;

            // (Kept before characters walked the navigation meshes, a way of squares: stood still,
            // they find their way again)
            if (to !== undefined || steering !== undefined) {
                Object.assign(actor, { path: [], pathGoal: null, offPath: false, progress: null, squeezeUntil: 0 });
            }

            return Object.assign(actor, { chance, restVariety: new Variety(() => chance.next(), restVariety) });
        });

        return battle;
    }

    // Where to walk to be as near a square as can be (for a move order): the nearest free square
    // within MOVE_NEAR of it; or, out on open water, the first free one on the way back from it
    // towards the walker (looked for no further than MOVE_BACK); or null
    #goalNear(actor, [x, y]) {
        const squares = this.#squares(actor.map);

        try {
            return nearestFree(squares, [x, y], { within: MOVE_NEAR });
        } catch {
            const [dx, dy] = [actor.x - x, actor.y - y];
            const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)));

            for (let k = 1; k <= Math.min(steps, MOVE_BACK); k++) {
                const [sx, sy] = [Math.floor(x + (dx * k) / steps), Math.floor(y + (dy * k) / steps)];

                if (!squares.blocked(sx, sy)) {
                    return [sx, sy];
                }
            }

            return null;
        }
    }

    /**
     * One of the folk sent about other business (`routine`, as add's: the townsfolk running for a
     * door, and back about their own after: core/host.js #sheltering), from where they stand, its
     * first stop next. Whether they're there to send.
     */
    reroute(id, routine) {
        const actor = this.actor(id);

        if (!actor?.routine || !routine) {
            return false;
        }

        Object.assign(actor, { routine, stop: 0, arrived: false, path: [], pathGoal: null, stopSince: this.time, waitUntil: 0, restingUntil: 0 });

        return true;
    }

    /**
     * Take a character out (one of the folk, gone with their building when the player's far
     * away): no one's after them, talking to them or shooting at them any more. Whether they were
     * there.
     */
    remove(id) {
        const actor = this.actor(id);

        if (!actor) {
            return false;
        }

        this.actors.splice(this.actors.indexOf(actor), 1);
        this.#roster++;
        this.#version++;
        this.projectiles = this.projectiles.filter(({ from, target }) => from !== id && target !== id);

        for (const other of this.actors) {
            if (other.target === id) {
                other.target = null;
            }

            if (other.attack?.target === id) {
                other.attack = null;
            }

            if (other.order?.target === id) {
                other.order = null;
            }

            if (other.talkingTo === id) {
                other.talkingTo = null;
            }

            // (And no one holds a grudge against it, or remembers seeing or sparing it)
            for (const kept of [other.foes, other.seeing, other.spared]) {
                if (kept && id in kept) {
                    delete kept[id];
                }
            }
        }

        return true;
    }

    /**
     * Tell a character what to do: { type: "move", to: [x, y] } (walk there, on its map, or as
     * near as can be), { type: "ahead", facing } (turned the way `facing` points, radians, and
     * straight ahead that way as far as the way is clear; with reach: metres, at most that far),
     * { type: "engage", target: id } (go and
     * fight it; with stand: true, set on it where they stand, striking only while it's in reach),
     * { type: "enter", link: id } (walk to the link's end on its map and go through),
     * { type: "approach", target: id } (walk up to someone, to talk: "arrived" when there), or
     * { type: "stop" }. Moving, engaging, entering and approaching, run: true runs there (while
     * its stamina lasts).
     */
    command(id, order) {
        const actor = this.actor(id);

        if (!actor || actor.dead) {
            return;
        }

        switch (order.type) {
            case "move": {
                const goal = this.#goalNear(actor, order.to);

                // (Nowhere to walk to near there at all: stays where it is)
                if (!goal) {
                    break;
                }

                actor.order = { type: "move", to: goal, run: Boolean(order.run) };
                this.#pathTo(actor, goal);
                break;
            }
            case "ahead": {
                // Turned that way, and from wherever it is, straight on as far as the mesh goes
                // (or as far as it was asked to go: held input, given again as it's held, asks
                // only for the way near by, whose tiles are baked already); something just ahead,
                // round it a little to one side or the other, if that gets it on (SLIDE)
                actor.facing = order.facing;

                const reach = order.reach > 0 ? Math.min(order.reach, AHEAD) : AHEAD;
                const way = this.#route(actor, () => {
                    const [x, y] = [actor.x, actor.y];
                    const navigator = navigatorOf(this.maps[actor.map]);

                    // (A forecast's, the tiles round it not made yet: straight on that way, as far
                    // as it was asked, for now)
                    if (this.bakedOnly && !navigator.made(x - reach - 1, y - reach - 1, x + reach + 1, y + reach + 1)) {
                        return [[x + sin(order.facing) * reach, y + cos(order.facing) * reach]];
                    }

                    const along = (turn, far) => {
                        const look = () => navigator.raycast([x, y], [x + sin(order.facing + turn) * far, y + cos(order.facing + turn) * far]);
                        const ray = this.bakedOnly ? navigator.madeOnly(look) : look();

                        return ray ? { point: ray.point, on: hypot(ray.point[0] - x, ray.point[1] - y) * cos(turn) } : null;
                    };
                    const straight = along(0, reach);

                    if (straight && straight.on >= SLIDE.clear) {
                        return [straight.point];
                    }

                    let best = straight;

                    for (const turn of SLIDE.turns) {
                        for (const side of [turn, -turn]) {
                            const each = along(side, Math.min(reach, SLIDE.leg));

                            if (each && each.on >= SLIDE.least && each.on > (best?.on ?? 0) + 0.01) {
                                best = each;
                            }
                        }
                    }

                    return best ? [best.point] : [];
                });
                const end = way.at(-1);

                if (!end || hypot(end[0] - actor.x, end[1] - actor.y) < STRIDE) {
                    actor.order = null;
                    actor.path = [];
                    break;
                }

                const goal = [Math.floor(end[0]), Math.floor(end[1])];

                // (Held input's: the player's steering, `held`, which an Action Bar blow out of
                // reach doesn't take over: host.js #ability)
                actor.order = { type: "move", to: goal, run: Boolean(order.run), held: true };
                Object.assign(actor, { path: way, pathGoal: goal, lastPathAt: this.time, blockedSince: null, offPath: false });
                break;
            }
            case "engage": {
                // (Not at someone who isn't an enemy: refused at once)
                const target = this.actor(order.target);

                if (!target || target.dead || !this.hostile(actor, target)) {
                    actor.order = null;
                    break;
                }

                actor.order = { type: "engage", target: order.target, run: Boolean(order.run), ...(order.stand ? { stand: true } : {}) };
                actor.pathGoal = null;

                // (Locked on it, or on it already: kept; set on another without, the lock let go)
                actor.lock = order.lock || actor.lock === order.target ? order.target : null;

                // (Set on it where they stand: wherever they were going, they stop)
                if (order.stand) {
                    actor.path = [];
                }

                break;
            }
            case "approach":
                actor.order = { type: "approach", target: order.target, run: Boolean(order.run) };
                actor.pathGoal = null;
                break;
            case "unlock":
                // (Let go of whoever they were locked on, and set on no one till they choose
                // again; anywhere else they were going, still going)
                if (actor.order?.type === "engage") {
                    actor.order = null;
                    actor.path = [];
                }

                actor.lock = null;
                break;
            case "enter": {
                const link = this.links.find(({ id: linkId }) => linkId === order.link);

                if (!link?.ends.some((end) => end.map === actor.map)) {
                    actor.order = null;
                    actor.path = [];
                    break;
                }

                actor.order = { type: "enter", link: link.id, run: Boolean(order.run) };
                actor.pathGoal = null;
                this.#goThrough(actor, link);
                break;
            }
            default:
                actor.order = null;
                actor.path = [];
        }
    }

    /**
     * Two characters talk (`id` to `withId`; null: they stop): it stops what it's doing and
     * faces them until they stop.
     */
    talk(id, withId) {
        const actor = this.actor(id);

        if (actor) {
            actor.talkingTo = withId;

            if (withId !== null) {
                actor.restingUntil = 0;
            }
        }
    }

    /**
     * Have a character cast a spell (a SPELLS key) on whoever its `target` kind has it
     * (spells.js): an enemy (`targetId`); anyone, or a friend (themselves if there's no
     * `targetId`); themselves; one fallen (a corpse's id: Zombify); or another player anywhere
     * (Summon, or themselves: a creature). `level`: how far a spell that grows with use has
     * (spells.js `grows`); `at`: where it takes them ([x, y] m: Wizard's Walk). Returns
     * { ok: true }, or { ok: false, reason } if it can't be cast now: "cooldown", "busy"
     * (staggered, stunned or already casting), "wand" or "grimoire" (it needs one in hand),
     * "healthy" (healing at full health), "uncursed" (a cure with nothing to cure), "lifeless" (no
     * one living there), "corpse" (no one fallen there), "friendly" (not an enemy), "hostile" (an
     * enemy), "range", "sight" or "dark" (whyUnseen; CAST_FAILURES says them: none of them the host's own refusals,
     * host.js REFUSALS, but for the cooldown, which is the same).
     */
    cast(id, spellId, targetId = null, { level = 1, at = null } = {}) {
        const actor = this.actor(id);
        const spell = SPELLS[spellId];

        if (!actor || !spell || actor.dead) {
            return { ok: false, reason: "busy" };
        }

        // (Prismatic Destruction: only with the sigil whole, its four elements' chains cast through;
        // an element's Prismatic spell, only with its piece just earned: core/prismatic.js sigilSpell)
        if (spell.prismatic && sigilSpell(actor.prism) !== spellId) {
            return { ok: false, reason: "sigil" };
        }

        if (this.time < actor.spellReadyAt || this.time < (actor.spellsReadyAt?.[spellId] ?? 0)) {
            return { ok: false, reason: "cooldown" };
        }

        if (this.time < actor.staggeredUntil || this.time < actor.stunnedUntil || actor.casting) {
            return { ok: false, reason: "busy" };
        }

        // (A wand's or a grimoire's spell: only with one in hand)
        if (spell.needs && actor.weapon !== spell.needs) {
            return { ok: false, reason: spell.needs };
        }

        const target = this.#castOn(actor, spell, targetId);

        if (target.reason) {
            return { ok: false, reason: target.reason };
        }

        if (target !== actor) {
            actor.facing = atan2(target.x - actor.x, target.y - actor.y);
        }

        // (Healing someone at full health, with nothing for it to cure: nothing to do; a cure with
        // nothing to cure, the same)
        if ((spell.heal || spell.full) && target.hp >= target.maxHp && !this.#cures(spell, target).length) {
            return { ok: false, reason: "healthy" };
        }

        if (spell.cures && !spell.heal && !spell.full && !this.#cures(spell, target).length) {
            return { ok: false, reason: "uncursed" };
        }

        // Casting calls off an attack
        actor.attack = null;
        actor.casting = { spell: spellId, target: target.id, start: this.time, landsAt: this.time + spell.castTime, level, at: at ? [...at] : null };
        actor.spellReadyAt = this.time + SPELL_COOLDOWN;
        actor.spellsReadyAt = { ...actor.spellsReadyAt, [spellId]: this.time + (spell.cooldown ?? SPELL_COOLDOWN) };
        this.#emit("cast", { id: actor.id, spell: spellId, target: target.id, castTime: spell.castTime });

        // (Casting anything else, they're seen)
        if (spellId !== "invisibility") {
            this.unbuff(actor.id, "invisibility");
        }

        return { ok: true };
    }

    /**
     * Throw a bomb (a player's Goblin Bomb: BOMBS `kind`) at an enemy (`targetId`) within `reach`
     * metres that they can see, doing `damage` ([least, most] at its heart): an attack, let go as
     * its blow would land. { ok } or why not ({ ok: false, reason }: "midst", in the middle of
     * a blow or a spell, staggered or stunned; "target", "range", "sight", "dark": whyUnseen).
     */
    lob(id, targetId, { kind, damage, reach }) {
        const actor = this.actor(id);
        const target = targetId === null ? null : this.actor(targetId);

        if (!actor || actor.dead || this.time < actor.staggeredUntil || this.time < actor.stunnedUntil || actor.casting || (actor.attack && !actor.attack.struck)) {
            return { ok: false, reason: "midst" };
        }

        if (!target || target.dead || target.map !== actor.map || !this.hostile(actor, target)) {
            return { ok: false, reason: "target" };
        }

        if (hypot(target.x - actor.x, target.y - actor.y) > reach) {
            return { ok: false, reason: "range" };
        }

        const unseen = this.whyUnseen(actor, target, Math.max(SIGHT, reach));

        if (unseen) {
            return { ok: false, reason: unseen };
        }

        actor.path = [];
        this.#throwAt(actor, target, { id: kind, kind: "ranged", reach, damage, given: damage, hitAt: 450, duration: 900, interval: 900, stagger: 300, reaction: "crush", animation: "throw", bomb: kind });

        return { ok: true };
    }

    // Whom a spell's cast on, by its kind of target (the caster, if that's who), or why it can't be: { reason }
    #castOn(actor, spell, targetId) {
        const kind = spell.target;

        // (On themselves, or somewhere, or on no one: the caster)
        if (kind === "self" || kind === "place" || ((kind === "any" || kind === "friend" || kind === "summon") && targetId === null)) {
            return actor;
        }

        const target = this.actor(targetId);

        if (kind === "corpse") {
            return !target || !target.dead || target.map !== actor.map || distanceBetween(actor.square, target.square) > spell.reach ? { reason: "corpse" } : target;
        }

        if (!target || target.dead) {
            return { reason: "lifeless" };
        }

        if (target === actor) {
            return kind === "enemy" ? { reason: "friendly" } : actor;
        }

        // (Harm only to enemies; wards only to friends; healing to anyone, friend, neutral or foe)
        if (kind === "enemy" && !this.hostile(actor, target)) {
            return { reason: "friendly" };
        }

        if ((kind === "friend" || kind === "summon") && this.hostile(actor, target)) {
            return { reason: "hostile" };
        }

        // (Another player called, wherever they are)
        if (kind === "summon") {
            return target.kind === "player" ? target : { reason: "lifeless" };
        }

        if (target.map !== actor.map || distanceBetween(actor.square, target.square) > spell.reach) {
            return { reason: "range" };
        }

        const unseen = this.whyUnseen(actor, target, Math.max(SIGHT, spell.reach));

        if (unseen) {
            return { reason: unseen };
        }

        return target;
    }

    #cures(spell, target) {
        const on = (target.afflictions ?? []).map(({ kind }) => kind);

        return spell.cures === "all" ? on : on.filter((kind) => spell.cures?.includes(kind));
    }

    /**
     * Something lingering on someone (afflictions.js: a kind), from now: by whom (an id), as
     * strong as their power has it (the hurt each time; or `damage`, as given), for as long as it
     * lasts (or `ms`), and how it shows (`look`). Warded against it (spells.js `ward`), 30% less
     * each time and for less long. Again while it's on them, it lasts from now, as strong as the
     * stronger. Whether it took.
     */
    afflict(id, kind, { by = null, power = 1, look = null, ms = null, damage: given = null } = {}) {
        const actor = this.actor(id);
        const affliction = AFFLICTIONS[kind];

        // (Nothing holds the colossal back or frightens it: only what hurts takes hold; and nothing
        // but fire takes to a siege engine's timbers)
        if (!actor || actor.dead || !affliction || (actor.wild?.colossus && (affliction.flee || affliction.speed)) || (actor.engine && kind !== "burn")) {
            return false;
        }

        const warded = this.#warded(actor, { affliction: kind, look });
        const hurts = given ?? (affliction.damage ? affliction.damage * power : 0);
        const damage = hurts ? Math.max(1, Math.round(hurts * (warded ? WARD : 1))) : 0;
        const until = this.time + Math.round((ms ?? affliction.ms) * (warded ? WARD : 1));
        const had = actor.afflictions.find((each) => each.kind === kind);

        if (had) {
            Object.assign(had, { until: Math.max(had.until, until), damage: Math.max(had.damage, damage), by: by ?? had.by, look: look ?? had.look });
        } else {
            actor.afflictions.push({ kind, until, next: affliction.every ? this.time + affliction.every : Infinity, damage, by, look });
        }

        this.#emit("afflicted", { id, kind, change: "on", until: Math.max(had?.until ?? 0, until), by, look: look ?? had?.look ?? null });

        return true;
    }

    /** What's lingering on someone ended at once (a cure): whether it was on them. */
    cure(id, kind) {
        const actor = this.actor(id);
        const had = actor?.afflictions.find((each) => each.kind === kind);

        if (!had) {
            return false;
        }

        actor.afflictions.splice(actor.afflictions.indexOf(had), 1);
        this.#emit("afflicted", { id, kind, change: "cured", look: had.look });

        return true;
    }

    /**
     * A spell that lasts put on someone (spells.js `lasts`: a ward, Reflect, Invisibility...),
     * from now for `ms`: by whom, and how far it's grown (`level`: Dodge's). Again while it's on
     * them, it lasts from now. Whether it took.
     */
    buff(id, kind, { ms, by = null, level = 1 } = {}) {
        const actor = this.actor(id);

        if (!actor || actor.dead || !SPELLS[kind]) {
            return false;
        }

        const until = this.time + ms;
        const had = actor.buffs.find((each) => each.kind === kind);

        if (had) {
            Object.assign(had, { until, by, level: Math.max(had.level, level) });
        } else {
            actor.buffs.push({ kind, until, by, level });
        }

        // (Unseen: whoever was after them loses them, but those who've seen through it before)
        if (kind === "invisibility") {
            for (const other of this.actors) {
                if (other.target === id && other.seeing?.[id] !== true) {
                    Object.assign(other, { target: null, path: [], pathGoal: null });
                }

                if (other.attack?.target === id && !other.attack.struck && other.seeing?.[id] !== true) {
                    other.attack = null;
                }
            }
        }

        this.#emit("buffed", { id, kind, until, by, level: had?.level ?? level });

        return true;
    }

    /** A spell that lasts ended on someone (Invisibility, when they do something: host.js): whether it was on them. */
    unbuff(id, kind) {
        const actor = this.actor(id);
        const had = actor?.buffs?.find((each) => each.kind === kind);

        if (!had) {
            return false;
        }

        actor.buffs.splice(actor.buffs.indexOf(had), 1);
        this.#emit("unbuffed", { id, kind });

        return true;
    }

    /** A spell lasting on someone just now ({ kind, until, by, level }), or null. */
    buffOf(actor, kind) {
        return actor?.buffs?.find((each) => each.kind === kind && each.until > this.time) ?? null;
    }

    // Is someone warded against something (a school's spell, an element's blow, an affliction or
    // how it shows): a ward lasting on them that's against it?
    #warded(actor, { school = null, element = null, affliction = null, look = null }) {
        return (actor?.buffs ?? []).some(({ kind, until }) => {
            const ward = until > this.time && SPELLS[kind]?.ward;

            return ward && ((school && ward.schools.includes(school)) || (element && ward.elements.includes(element)) || (affliction && ward.afflictions.includes(affliction)) || (look && ward.looks.includes(look)));
        });
    }

    /**
     * How long until a character can cast a spell again (any spell: the shared cooldown; or one,
     * by its id: the longer of that and its own), as a share of the cooldown (0: ready).
     */
    cooldown(id, spellId = null) {
        const actor = this.actor(id);

        if (!actor) {
            return 0;
        }

        const shared = Math.max(0, Math.min(1, (actor.spellReadyAt - this.time) / SPELL_COOLDOWN));
        const own = spellId && SPELLS[spellId] ? Math.max(0, Math.min(1, ((actor.spellsReadyAt?.[spellId] ?? 0) - this.time) / (SPELLS[spellId].cooldown ?? SPELL_COOLDOWN))) : 0;

        return Math.max(shared, own);
    }

    /**
     * Advance by `ms` (whole steps; the rest carries over). Returns the events that happened
     * (and any from casting since last time).
     */
    advance(ms) {
        this.lag += ms;

        while (this.lag >= STEP_MS) {
            this.lag -= STEP_MS;
            this.#step();
        }

        const events = this.events;

        this.events = [];

        return events;
    }

    /**
     * Can `a` see `b`: on the same map, within SIGHT squares (out in the world at night, only as
     * far as the light where `b` is lets them: light.js sightAt, `this.light`, a player further,
     * light.js playerSight; as far as ever for
     * a creature that sees in the dark, creatures.js `darkSight`, or one given to, `darkSight`
     * (Lunara's gift: core/shrines.js), or of the colossal, towering and aglow), with nothing that blocks sight between their middles (the map's opaque squares:
     * houses and trees, not barrels or a well, outdoors; walls, not tables, indoors)? (`range`: as
     * far as they look, if further than SIGHT: a spell's caster, as far as it reaches. To the
     * colossal: to the nearest of the squares its body stands over, #aimAt)
     */
    canSee(a, b, range = SIGHT) {
        const colossal = Boolean(b.wild?.colossus && b.footprint);
        const to = colossal ? this.#aimAt(b, a.square) : b.square;

        return a.map === b.map && this.#sees(a.map, a.square, to, a.map === this.lightMap && !a.wild?.darkSight && !a.darkSight && !colossal ? range * this.#lightFor(a, to) : range);
    }

    // How far, a share of how far they'd see by day, `a` sees someone at a square by the light
    // there (light.js sightAt): a player further than the rest at night (light.js playerSight)
    #lightFor(a, square) {
        const share = sightAt(this.light, square);

        return a.kind === "player" ? playerSight(share) : share;
    }

    /**
     * Why `a` can't see `b` within `range` (as canSee looks), or null if they can: "range" (on
     * another map, or further off than that by day), "sight" (something that blocks sight between
     * them: a wall, a house, a rock, a tree), or "dark" (within it, nothing between, but further
     * than the light lets them see: light.js sightAt). What a player's told, casting, shooting or
     * throwing at someone (spells.js CAST_FAILURES), rather than "can't see it" for all three.
     */
    whyUnseen(a, b, range = SIGHT) {
        if (this.canSee(a, b, range)) {
            return null;
        }

        const colossal = Boolean(b.wild?.colossus && b.footprint);
        const to = colossal ? this.#aimAt(b, a.square) : b.square;

        if (a.map !== b.map || distanceBetween(a.square, to) > range) {
            return "range";
        }

        return this.#sees(a.map, a.square, to, range) ? "dark" : "sight";
    }

    // Can someone on a map at one square see another square: within `range` (SIGHT), nothing opaque
    // between (along the line between their middles; over what's low, from a raised deck or up at
    // one: an army's camp's walkway over its stakes, overworld.js RAISED)?
    #sees(mapId, from, to, range = SIGHT) {
        const distance = distanceBetween(from, to);

        if (distance > range) {
            return false;
        }

        const squares = this.#squares(mapId);

        if (squares.raised && (squares.raised(from[0], from[1]) || squares.raised(to[0], to[1]))) {
            if (!OVER_LOW.has(squares)) {
                OVER_LOW.set(squares, (x, y) => squares.opaque(x, y) && !squares.low(x, y));
            }

            return !this.#between(OVER_LOW.get(squares), from, to, distance);
        }

        return !this.#between(squares.opaque, from, to, distance);
    }

    // Whether `target` is behind what's low from `attacker`: up on a raised deck (overworld.js
    // RAISED: an army's camp's walkway), `attacker` not, something low (LOW: its stakes) between;
    // or the other way about, `target` one hacking at the stakes (its `siege`) hard against them
    // (one of the squares round it low), to be shot at from up there only leaning out over them
    #covered(attacker, target) {
        const squares = this.#squares(target.map);

        if (!squares.raised) {
            return false;
        }

        const up = squares.raised(...target.square);

        if (up === squares.raised(...attacker.square) || !this.#between(squares.low, attacker.square, target.square)) {
            return false;
        }

        const [x, y] = target.square;

        return up || (Boolean(target.siege) && [-1, 0, 1].some((dx) => [-1, 0, 1].some((dy) => squares.low(x + dx, y + dy))));
    }

    // Whether two points on a map (metres) are too far one over the other for a blow up close
    // between them, or a step (REACH_RISE): only where either's on a raised deck (overworld.js
    // RAISED: an army's camp's walkway, or a stair up to it)
    #apart(mapId, [ax, ay], [bx, by]) {
        const squares = this.#squares(mapId);

        if (!squares.raised || !(squares.raised(Math.floor(ax), Math.floor(ay)) || squares.raised(Math.floor(bx), Math.floor(by)))) {
            return false;
        }

        const map = this.maps[mapId];

        return Math.abs(map.heightAt(ax, ay) - map.heightAt(bx, by)) > REACH_RISE;
    }

    // Is any square `marked` (x, y) on the way between two squares (not counting them)? (Four
    // points a metre along the line: most squares get more than one, asked about once: grid.js
    // crosses)
    #between(marked, from, to, distance = distanceBetween(from, to)) {
        return crosses(marked, from, to, distance);
    }

    /**
     * Can `a` and `b` talk: seeing each other, next to each other or across something in the way
     * (TALK_REACH)?
     */
    canTalk(a, b) {
        return a.map === b.map && this.#talksFrom(a.map, a.square, b.square);
    }

    // Could someone at one square on a map talk to someone at another?
    #talksFrom(mapId, from, to) {
        const distance = distanceBetween(from, to);

        if (distance > TALK_REACH.across || !this.#sees(mapId, from, to)) {
            return false;
        }

        // Next to them, or across something (a blocked square on the way between)
        return distance <= TALK_REACH.near || this.#between(this.#squares(mapId).blocked, from, to, distance);
    }

    // The nearest square (walking) that `actor` could talk to `target` from, free and not taken,
    // or null (none it can get to)
    #talkSpot(actor, target) {
        const squares = this.#squares(actor.map);
        const start = actor.square;
        const seen = new Set([start.join()]);
        const queue = [start];

        for (let k = 0; k < queue.length && k < TALK_SEARCH; k++) {
            const square = queue[k];

            if (this.#talksFrom(actor.map, square, target.square) && (same(square, start) || !this.#occupied(actor.map, square, actor))) {
                return square;
            }

            for (const [dx, dy] of AROUND) {
                const next = [square[0] + dx, square[1] + dy];

                if (!squares.blocked(next[0], next[1]) && !seen.has(next.join())) {
                    seen.add(next.join());
                    queue.push(next);
                }
            }
        }

        return null;
    }

    // A map's squares (grid.js): which can be walked on and seen through
    #squares(mapId) {
        return squaresOf(this.maps[mapId]);
    }

    // The squares other characters on a map stand on (but `actor`'s): any their bodies are over
    // the middle of, or are on. A Set of grid.js squareKey
    #others(mapId, actor) {
        const taken = new Set();

        for (const other of this.actors) {
            if (other !== actor && !other.dead && other.map === mapId) {
                taken.add(squareKey(...other.square));

                for (let sy = Math.floor(other.y - BODY); sy <= Math.floor(other.y + BODY); sy++) {
                    for (let sx = Math.floor(other.x - BODY); sx <= Math.floor(other.x + BODY); sx++) {
                        if (hypot(sx + 0.5 - other.x, sy + 0.5 - other.y) < 2 * BODY) {
                            taken.add(squareKey(sx, sy));
                        }
                    }
                }
            }
        }

        return taken;
    }

    #emit(type, details) {
        this.events.push({ type, time: this.time, ...details });
    }

    #step() {
        this.time += STEP_MS;
        this.#version++;
        this.#march();
        this.#mustered();

        for (const actor of this.actors) {
            this.#arm(actor);
            this.#hover(actor);
            this.#think(actor);
        }

        for (const actor of this.actors) {
            this.#move(actor);
        }

        for (const actor of this.actors) {
            this.#fight(actor);
        }

        this.#fly();
        this.#burst();
        this.#rake();
        this.#ground();
        this.#ail();
        this.#lapse();
    }

    // --- Drawing weapons and putting them away ---

    /**
     * Draw its weapon for a fight (an enemy in sight or after it, or told to fight one), or put it
     * away a while after one (SHEATHE_AFTER_MS), not in the middle of an attack.
     */
    #arm(actor) {
        if (!actor.arms.length || actor.dead) {
            return;
        }

        if (actor.drawing && this.time >= actor.drawing.until) {
            actor.armed = actor.drawing.on;
            actor.drawing = null;
        }

        if (this.#inFight(actor)) {
            actor.foughtAt = this.time;

            if (!actor.armed && !actor.drawing?.on) {
                this.#draw(actor, true);
            }
        } else if (actor.armed && !actor.drawing && !actor.attack && this.time - actor.foughtAt >= SHEATHE_AFTER_MS) {
            this.#draw(actor, false);
        }
    }

    // Start drawing its weapon (`on`), or putting it away (it can't be used meanwhile)
    #draw(actor, on) {
        actor.armed = false;
        actor.drawing = { on, until: this.time + (on ? DRAW_MS : SHEATHE_MS) };
        this.#emit("draw", { id: actor.id, on });
    }

    /**
     * Is a character in a fight: attacking or told to fight, or an enemy on its map that it can
     * see, or that's after it (chasing it, attacking it, or told to fight it)?
     */
    #inFight(actor) {
        if (actor.attack || actor.order?.type === "engage") {
            return true;
        }

        // (After the colossal, its body in sight as far as it reaches: however far off where it
        // stands. A siege engine the same, whoever it's after: its crew watch for them)
        const sought = actor.target === null ? null : this.actor(actor.target);

        if (sought && (sought.wild?.colossus || actor.engine) && !sought.dead && this.hostile(sought, actor) && this.canSee(actor, sought, Math.max(SIGHT, longestReach(actor.arms)))) {
            return true;
        }

        const after = (other) => other.target === actor.id || other.attack?.target === actor.id || (other.order?.type === "engage" && other.order.target === actor.id);

        // (The cheap checks first: whether it's after it, or near enough to be seen, before how
        // their peoples stand, and only then whether anything's in the way. Those near first; then
        // anyone further off who was after it as the step began, and is still: #chasers)
        return (
            this.#nearSquare(actor, SIGHT).some((k) => {
                const other = this.actors[k];

                if (other.dead || other.map !== actor.map) {
                    return false;
                }

                const chasing = after(other);

                return (chasing || this.#near(actor, other, SIGHT)) && this.hostile(other, actor) && (chasing || this.canSee(actor, other));
            }) ||
            (this.#chasers.get(actor.id) ?? []).some((id) => {
                const other = this.actor(id);

                return other && !other.dead && other.map === actor.map && after(other) && this.hostile(other, actor);
            })
        );
    }

    // --- Deciding what to do ---

    #think(actor) {
        // (Only standing there, a mind of its own none: one in a forecast's battle, fork)
        if (actor.still) {
            return;
        }

        if (actor.lock) {
            this.#keepLock(actor);
        }

        if (actor.dead) {
            if (this.time >= actor.respawnAt) {
                this.#respawn(actor);
            }

            return;
        }

        // (Lurking overhead: only watching for whoever comes beneath it)
        if (actor.lurking) {
            this.#lurk(actor);

            return;
        }

        // (The colossal: never staggered or stunned, too vast)
        if ((!actor.wild?.colossus && (this.time < actor.staggeredUntil || this.time < actor.stunnedUntil)) || actor.attack || actor.casting) {
            return;
        }

        // (The colossal: its own way: #colossus)
        if (actor.ai === "colossus") {
            this.#colossus(actor);

            return;
        }

        // (A section of a palisade: it only stands)
        if (actor.kind === "stakes") {
            return;
        }

        // (A fortification: it only shoots)
        if (actor.ai === "fort") {
            this.#hold(actor);

            return;
        }

        // Talking: facing whoever it's talking to (sitting, just the way it sits), nothing else
        // (once it's stopped where it was going)
        const partner = actor.talkingTo === null ? null : this.actor(actor.talkingTo);

        if (partner && !partner.dead && partner.map === actor.map && (actor.kind === "soldier" || (actor.neutral && actor.ai === "wild")) && !this.#nearestSeen(actor)) {
            // (A soldier on its rounds stops to talk, while there's no enemy about; and one of the
            // wild's that's no one's enemy yet: hungry bandits, core/director.js STRANGERS)
            actor.path = [];
            actor.facing = atan2(partner.x - actor.x, partner.y - actor.y);

            return;
        }

        if (partner && !partner.dead && partner.map === actor.map && actor.ai !== "patrol") {
            const face = () => (actor.facing = atan2(partner.x - actor.x, partner.y - actor.y));

            // The folk stop going about their business; the player just turns to them, standing
            if (actor.ai === "routine") {
                actor.path = [];

                if (!actor.routine.seated) {
                    face();
                }

                return;
            }

            if (!actor.path.length && !actor.order) {
                face();
            }
        }

        // (Whoever it was after gone unseen: lost)
        const chased = actor.target === null ? null : this.actor(actor.target);

        if (chased && !this.#noticed(actor, chased)) {
            Object.assign(actor, { target: null, path: [], pathGoal: null });
        }

        // (Frightened: running, and nothing else)
        const fear = actor.kind !== "player" ? actor.afflictions.find(({ kind }) => AFFLICTIONS[kind]?.flee) : null;

        if (fear) {
            this.#flee(actor, fear);

            return;
        }

        if (actor.ai === "patrol") {
            if (actor.formation) {
                this.#keepRank(actor);
            }

            this.#patrol(actor);
        } else if (actor.ai === "wild") {
            this.#wild(actor);
        } else if (actor.ai === "follow") {
            this.#follow(actor);
        } else if (actor.ai === "routine") {
            this.#routine(actor);
        } else {
            this.#obey(actor);
        }
    }

    /**
     * The folk going about their business (actor.routine): seated ({ seated: true, act, every:
     * [ms, ms] }), doing its act (a toast) every so often; or going from stop to stop ({ stops:
     * [{ square, facing, act, group }], wait: [ms, ms], order: "cycle" or "alternate", pace }),
     * each in turn or (alternating) one of another group at random, waiting at each, facing its
     * way, and doing its act there (an "act" event: { id, act }); at their own speed, or `pace`
     * (m/s: running for a door, core/townsfolk.js SHELTER).
     */
    #routine(actor) {
        const routine = actor.routine;
        const between = ([least, most]) => least + actor.chance.next() * (most - least);

        // (Danger near: running from it, or standing their ground)
        if (this.#afraid(actor)) {
            return;
        }

        actor.walkPace = routine.pace ?? actor.speed;

        // (One that sits, up and away from its seat: back to it, as near as there's a way (its seat
        // in a booth, or at a table), and sitting down in it the way it sat)
        if (routine.seated && actor.reseat) {
            if (!actor.path.length && ringsApart(actor.square, actor.spawn) <= 1) {
                Object.assign(actor, { reseat: false, facing: actor.post, x: actor.spawn[0] + 0.5, y: actor.spawn[1] + 0.5, square: [...actor.spawn], pathGoal: null });
                this.#moved(actor);
            } else if (!actor.path.length && this.time - (actor.lastPathAt ?? -Infinity) >= REPATH_MS) {
                this.#pathTo(actor, actor.spawn);
            }

            return;
        }

        if (routine.seated) {
            if (routine.act && this.time >= actor.waitUntil) {
                // (Not straight away: a while after sitting down)
                if (actor.waitUntil > 0) {
                    this.#emit("act", { id: actor.id, act: routine.act });
                }

                actor.waitUntil = this.time + between(routine.every);
            }

            this.#rest(actor);

            return;
        }

        const stop = routine.stops[actor.stop];
        const idle = !actor.path.length;

        if (this.#beckon(actor, idle) || !idle) {
            return;
        }

        // There: on its square, or next to it with someone standing on it
        const there = this.#at(actor, stop.square) || (distanceBetween(actor.square, stop.square) <= 1 && this.#occupied(actor.map, stop.square, actor));

        if (there && !actor.arrived) {
            actor.arrived = true;
            actor.facing = stop.facing;
            actor.waitUntil = this.time + between(stop.wait ?? routine.wait);

            if (stop.act) {
                this.#emit("act", { id: actor.id, act: stop.act });
                actor.restAt = Math.max(actor.restAt, this.time + REST_AFTER_ACT_MS);
            }

            return;
        }

        // Waiting here, resting now and then while seen (and not going on until it's done)
        if (there && (this.#rest(actor) || this.time < actor.restingUntil)) {
            return;
        }

        // Done here (or can't get there for a long while): on to the next
        if ((there && this.time >= actor.waitUntil) || (!actor.arrived && this.time - actor.stopSince > ROUTINE_GIVE_UP_MS)) {
            actor.stop = this.#nextStop(actor);
            actor.arrived = false;
            actor.stopSince = this.time;
            this.#pathTo(actor, routine.stops[actor.stop].square);

            return;
        }

        if (!there && (!same(actor.pathGoal, stop.square) || this.time - actor.lastPathAt >= REPATH_MS)) {
            this.#pathTo(actor, stop.square);
        }
    }

    /**
     * One of the folk in danger (FLEE): the nearest they can see who frightens them (#frightens),
     * looked for every so often. They run from them (`hop` squares at a time, away from them, or
     * as near that way as there's room), or, those whose part is to fight (roles.js `fights`),
     * stand their ground, facing them; until they've seen no one to fear for a while, and then go
     * back to what they were doing (one that sits, back to its seat). Whether they're afraid.
     */
    #afraid(actor) {
        if (this.time >= (actor.lookAt ?? 0)) {
            actor.lookAt = this.time + FLEE.look;

            const danger = this.#nearestEnemy(actor, (other) => this.canSee(actor, other), FLEE.sight, (other) => this.#frightens(other, actor));

            if (danger) {
                Object.assign(actor, { afraid: danger.id, calmAt: this.time + FLEE.calm });
            }
        }

        if (actor.afraid === null || actor.afraid === undefined) {
            return false;
        }

        // Calm again: back to what they were doing, where they were going (or sat)
        if (this.time >= (actor.calmAt ?? 0)) {
            Object.assign(actor, { afraid: null, path: [], pathGoal: null, arrived: false, stopSince: this.time, waitUntil: 0, reseat: Boolean(actor.routine.seated) });

            return false;
        }

        const from = this.actor(actor.afraid);
        const there = from && !from.dead && from.map === actor.map;

        Object.assign(actor, { restingUntil: 0, beckoningUntil: 0 });

        // (One whose part is to fight: where it is, facing it)
        if (ROLES[actor.role]?.fights) {
            actor.path = [];

            if (there) {
                actor.facing = atan2(from.x - actor.x, from.y - actor.y);
            }

            return true;
        }

        actor.walkPace = FLEE.pace;
        actor.reseat = Boolean(actor.routine.seated);

        if (actor.path.length) {
            return true;
        }

        // (Away from them, or as near that way as there's room to run: else cowering where they are)
        const away = there ? atan2(actor.y - from.y, actor.x - from.x) : actor.chance.next() * Math.PI * 2;
        const jitter = (actor.chance.next() - 0.5) * 0.8;

        for (const turn of [0, 0.9, -0.9, 1.8, -1.8]) {
            const angle = away + turn + jitter;
            const goal = [Math.floor(actor.x + cos(angle) * FLEE.hop), Math.floor(actor.y + sin(angle) * FLEE.hop)];

            try {
                this.#pathTo(actor, nearestFree(this.#squares(actor.map), goal, { within: 3 }));
            } catch {
                continue;
            }

            if (actor.path.length) {
                break;
            }
        }

        return true;
    }

    // Whether one of the folk is afraid of someone (FLEE): anyone fighting (set on someone still
    // standing); a creature of the wild that's out for blood (aggressive, or a menace to all), not
    // one following anyone; or whoever the folk's people (`side`) would fight, as the war has it:
    // a soldier of an enemy's, a player at war with them (unless they pass for one of them). Not
    // one of the folk, a wagon or a fortification standing there
    #frightens(other, folk) {
        if (other === folk || other.neutral || other.dead) {
            return false;
        }

        const set = other.target === null || other.target === undefined ? null : this.actor(other.target);

        if (set && !set.dead) {
            return true;
        }

        if (other.kind === "fort") {
            return false;
        }

        if (other.wild) {
            return !other.leader && Boolean(other.wild.menace || other.wild.temper === "aggressive");
        }

        if (!folk.side || other.team === folk.side) {
            return false;
        }

        // (As one of their own people's soldiers would see them)
        const as = { id: folk.id, kind: "soldier", team: folk.side, map: folk.map, foes: {}, spared: {} };

        return !this.passes(other, as) && (this.relations ? this.relations(as, other) : true);
    }

    /**
     * One of the folk whose role beckons (a courtesan) turns to the player and beckons them over
     * (an "act" event: { id, act: "beckon", target }) when they come into its sight, once it's
     * standing still (`idle`), and hasn't since they were last out of it for a while
     * (BECKON.again): returns whether it's beckoning.
     */
    #beckon(actor, idle) {
        if (!ROLES[actor.role]?.beckons) {
            return false;
        }

        const player = this.actors.find((other) => other.kind === "player" && !other.dead && this.canSee(actor, other));

        if (player) {
            // Back in sight after a while out of it
            if (this.time - actor.sawPlayerAt > BECKON.again) {
                actor.beckoned = false;
            }

            actor.sawPlayerAt = this.time;

            if (idle && !actor.beckoned && this.time >= actor.restingUntil) {
                actor.beckoned = true;
                actor.facing = atan2(player.x - actor.x, player.y - actor.y);
                actor.restingUntil = actor.beckoningUntil = this.time + BECKON.duration * 1000;
                actor.restAt = actor.restingUntil + REST_EVERY[0] + actor.chance.next() * (REST_EVERY[1] - REST_EVERY[0]);
                this.#emit("act", { id: actor.id, act: "beckon", target: player.id });
            }
        }

        return this.time < actor.beckoningUntil;
    }

    /**
     * One of the folk rests (one of its role's rests, never the same twice running) if it's time
     * to and the player can see it: returns whether it started one. Unseen, it waits a moment
     * after it's first seen again.
     */
    #rest(actor) {
        const rests = ROLES[actor.role]?.rests;

        if (!rests || this.time < actor.restAt) {
            return false;
        }

        if (!this.actors.some((other) => other.kind === "player" && !other.dead && this.canSee(other, actor))) {
            actor.restAt = this.time + REST_WHEN_SEEN_MS[0] + actor.chance.next() * (REST_WHEN_SEEN_MS[1] - REST_WHEN_SEEN_MS[0]);

            return false;
        }

        const rest = actor.restVariety.next("rest", rests.length);

        actor.restingUntil = this.time + rests[rest].duration * 1000;
        actor.restAt = actor.restingUntil + REST_EVERY[0] + actor.chance.next() * (REST_EVERY[1] - REST_EVERY[0]);
        this.#emit("rest", { id: actor.id, role: actor.role, rest });

        return true;
    }

    // The stop after this one: the next in turn, or one of another group at random
    #nextStop(actor) {
        const { stops, order = "cycle" } = actor.routine;

        if (order === "alternate") {
            const others = stops.map((stop, k) => k).filter((k) => stops[k].group !== stops[actor.stop].group);

            return others[Math.floor(actor.chance.next() * others.length)] ?? actor.stop;
        }

        return (actor.stop + 1) % stops.length;
    }

    // The player: follow orders, and attack whatever is within reach when standing still
    #obey(actor) {
        const order = actor.order;

        actor.walkPace = actor.speed;

        // (An Action Bar blow: struck as soon as its target's in reach and it can be, its weapon
        // drawn and ready, wherever they're going kept, the swing holding them a moment; out of
        // reach, waited on till `until`, if it's to be; given up once that's past, or they're out
        // of reach of one not waited on, or it's fallen or no enemy of theirs, and told (unstruck):
        // strike)
        if (actor.striking) {
            const { target: id, until, tag } = actor.striking;
            const target = this.actor(id);
            const gone = !target || target.dead || !this.hostile(actor, target);

            if (!gone && this.#reachable(actor, target)) {
                this.#attack(actor, target);

                if (actor.attack) {
                    actor.striking = null;

                    return;
                }
            } else if (gone || until === null || this.time >= until) {
                actor.striking = null;
                this.#emit("unstruck", { id: actor.id, target: id, tag });
            }
        }

        if (order?.type === "enter") {
            const link = this.links.find(({ id }) => id === order.link);

            if (link && this.#goThrough(actor, link)) {
                return;
            }

            actor.order = null;
        }

        if (order?.type === "move") {
            if (actor.path.length) {
                return;
            }

            // (A way found only part of the way, as far as could be looked at once: on from where
            // it got to, a few times, as long as there's further to go from there)
            const left = hypot(order.to[0] + 0.5 - actor.x, order.to[1] + 0.5 - actor.y);

            if (left > MOVE_ON && (order.legs ?? 0) < MOVE_LEGS) {
                order.legs = (order.legs ?? 0) + 1;
                this.#pathTo(actor, order.to);

                if (actor.path.length) {
                    return;
                }
            }

            actor.order = null;
        }

        if (order?.type === "approach") {
            const target = this.actor(order.target);

            if (!target || target.dead || target.map !== actor.map) {
                actor.order = null;
            } else if (this.canTalk(actor, target)) {
                // There: stop, facing them
                actor.order = null;
                actor.path = [];
                actor.facing = atan2(target.x - actor.x, target.y - actor.y);
                this.#emit("arrived", { id: actor.id, target: target.id });

                return;
            } else {
                // To the nearest place to talk to them from (again when they've moved, or now and
                // then if stuck)
                const idle = !actor.path.length;

                if (!same(order.from ?? null, target.square) || (idle && this.time - actor.lastPathAt >= REPATH_MS)) {
                    const spot = this.#talkSpot(actor, target);

                    order.from = [...target.square];

                    if (!spot) {
                        actor.order = null;
                    } else if (!same(spot, actor.square)) {
                        this.#pathTo(actor, spot);
                    }
                }

                return;
            }
        }

        if (order?.type === "engage") {
            const target = this.actor(order.target);

            if (!target || target.dead || !this.hostile(actor, target)) {
                actor.order = null;
            } else if (target.map !== actor.map) {
                // Gone through a door or up the stairs from here: after them, the same way
                const trail = target.crossed;
                const link = trail?.from === actor.map ? this.links.find(({ id }) => id === trail.link) : null;

                if (link && this.#goThrough(actor, link)) {
                    return;
                }

                actor.order = null;
            } else if (order.stand) {
                // (Set on it where they stand: struck at while it's in reach, not gone after; out
                // of reach, whoever is in reach struck at, as standing)
                actor.path = [];

                if (this.#reachable(actor, target)) {
                    this.#attack(actor, target);

                    return;
                }
            } else {
                this.#pursue(actor, target);

                return;
            }
        }

        // (Unseen, they strike only on purpose: told to engage it)
        if (!actor.path.length && !this.buffOf(actor, "invisibility")) {
            // (Locked on one in reach: it, not whoever's nearest. Not a creature that's leaving
            // everyone be: only on purpose, told to engage it or locked on it)
            const locked = actor.lock ? this.actor(actor.lock) : null;
            const target = locked && locked.map === actor.map && this.#reachable(actor, locked) ? locked : this.#nearestEnemy(actor, (enemy) => this.#reachable(actor, enemy) && !(enemy.wild?.temper === "defensive" && enemy.target === null));

            if (target) {
                this.#attack(actor, target);
            }
        }
    }

    // A player locked on an enemy (their `lock`), let go of it once it's fallen, or no enemy of
    // theirs now, or LOCK_REACH off; or somewhere else (through a door, up the stairs), unless
    // they're going after it; or once they've fallen themselves
    #keepLock(actor) {
        const target = this.actor(actor.lock);
        const after = actor.order?.type === "engage" && actor.order.target === actor.lock;

        if (actor.dead || !target || target.dead || !this.hostile(actor, target) || (target.map === actor.map ? hypot(target.x - actor.x, target.y - actor.y) >= LOCK_REACH : !after)) {
            actor.lock = null;
        }
    }

    // An enemy: patrol, chase what it sees, or what one of its own it can see is fighting (the
    // alarm raised: #alarmed), through doors and up stairs if they went through just after it saw
    // them; attack what it catches
    #patrol(actor) {
        // (A healer: whoever of its own's the most hurt in reach healed first; a follower waiting
        // where it was told, its leader before anyone)
        if (actor.heals && this.#mend(actor, actor.leader ? this.actor(actor.leader) : null)) {
            return;
        }

        // (One of a broken line: running for its place, set on no one)
        const broken = Boolean(actor.formation && this.formations[actor.formation.id]?.broken);

        if (broken && actor.target !== null) {
            Object.assign(actor, { target: null, path: [], pathGoal: null });
        }

        // (One in a formation: set on whoever it's set on, or no one, a while before looking again,
        // unless whoever it's set on is gone; anyone: a player near before anyone else, as many as
        // can be on them)
        const thinking = !actor.formation || this.time >= actor.rethinkAt;
        let seen = null;

        // (Sent to hack down a section of a palisade, its `siege`: at it, unless an enemy's on it up
        // close (SIEGE_GUARD) where it can be struck: not one up on the walkway over it, shooting
        // down at it, out of its reach)
        const siege = broken || !actor.siege ? null : this.actor(actor.siege);

        if (siege && !siege.dead && siege.map === actor.map) {
            seen = this.#nearestSeen(actor, (enemy) => distanceBetween(actor.square, enemy.square) <= SIEGE_GUARD && !this.#apart(actor.map, [actor.x, actor.y], [enemy.x, enemy.y]) && this.#roomOn(actor, enemy)) ?? siege;
        }

        if (!broken && !seen && !thinking && actor.target !== null) {
            const kept = this.actor(actor.target);

            seen = kept && !kept.dead && kept.map === actor.map ? kept : null;
        }

        // (A follower waiting, holding fire: only those after it: core/host.js #orderUnit "hold")
        if (!broken && !seen && actor.holdFire) {
            seen = this.#nearestSeen(actor, (enemy) => enemy.target === actor.id || enemy.attack?.target === actor.id);
        } else if (!broken && !seen && (thinking || actor.target !== null)) {
            seen = this.#drawnTo(actor) ?? this.#nearestSeen(actor, (enemy) => this.#leashed(actor, enemy) && this.#roomOn(actor, enemy)) ?? this.#alarmed(actor);

            if (actor.formation) {
                actor.rethinkAt = this.time + RETHINK_MS;
            }
        }

        const chased = actor.target === null ? null : this.actor(actor.target);
        const trail = chased?.crossed;
        const following = chased && !chased.dead && chased.map !== actor.map && trail && trail.from === actor.map && trail.time - actor.lastSeen <= GIVE_UP_MS;

        if (following) {
            const link = this.links.find(({ id }) => id === trail.link);

            // After them, keeping the chase alive until it's through
            actor.lastSeen = this.time;
            actor.walkPace = actor.chaseSpeed;

            if (this.#goThrough(actor, link)) {
                return;
            }
        }

        if (seen) {
            // (Newly set on a player: one more of their enemies on them)
            if (seen.kind === "player" && actor.target !== seen.id) {
                this.#onPlayer(seen)[this.#shoots(actor) ? "ranged" : "melee"]++;
            }

            actor.target = seen.id;
            actor.lastSeen = this.time;
        } else if (actor.target !== null && (this.time - actor.lastSeen > GIVE_UP_MS || !this.#leashed(actor, this.actor(actor.target)))) {
            actor.target = null;
            actor.path = [];
            actor.pathGoal = null;
        }

        const target = actor.target === null ? null : this.actor(actor.target);

        if (target && !target.dead && target.map === actor.map) {
            // (A caster: a spell at them, if one's ready and they're in its reach)
            if (actor.casts && this.#castAt(actor, target)) {
                return;
            }

            actor.walkPace = actor.chaseSpeed;
            this.#pursue(actor, target);

            return;
        }

        if (target && !target.dead) {
            // Gone where it can't follow: wait a while in case they come back
            return;
        }

        actor.target = null;

        // (One in a formation, well away from its place in it, its line broken or charging:
        // hurrying back to it, or running with it)
        const charging = Boolean(actor.formation && this.formations[actor.formation.id]?.charge);

        actor.walkPace = broken || charging || (actor.formation && actor.map === actor.spawnMap && distanceBetween(actor.square, actor.patrol[0]) > RANKS_RUN) ? actor.chaseSpeed : actor.speed;

        // Somewhere else than its patrol (it followed someone in): back the way it came
        if (actor.map !== actor.spawnMap) {
            const route = routeBetween(this.links, actor.map, actor.spawnMap);

            if (route?.length) {
                this.#goThrough(actor, route[0]);
            }

            return;
        }

        const goal = actor.patrol[actor.patrolIndex];

        if (this.#at(actor, goal) && !actor.path.length) {
            // (A guard at its post: facing out, as it was posted)
            if (actor.patrol.length === 1) {
                actor.facing = actor.post;

                return;
            }

            if (!actor.waitUntil) {
                actor.waitUntil = this.time + PATROL_PAUSE_MS;
            } else if (this.time >= actor.waitUntil) {
                actor.waitUntil = 0;
                actor.patrolIndex = (actor.patrolIndex + 1) % actor.patrol.length;
            }
        } else if (!actor.path.length && !same(actor.pathGoal, goal)) {
            this.#pathTo(actor, goal);
        } else if (!actor.path.length) {
            // Couldn't get there last time (someone in the way): try again in a while
            actor.pathGoal = this.time - actor.lastPathAt > REPATH_MS ? null : actor.pathGoal;
        }
    }

    /**
     * One of the wild's creatures (core/creatures.js): wandering near where it was found (a pack
     * keeping with its leader; a guard walking its round, `round`), resting between; fighting as its temper has it (whoever it sees,
     * if it's aggressive; whoever comes within its guard, if it's territorial; only whoever's
     * struck it or its pack, if it's defensive); never going further than its leash from where it
     * was found after anyone, and making its way back there if it's further.
     */
    #wild(actor) {
        const wild = actor.wild;
        const home = actor.spawn;
        const provoked = (enemy) => (actor.foes[enemy.id] ?? -Infinity) > this.time;
        // (Struck by them lately, it or its pack: after them however far, unseen or not, till
        // DEFEND_MS after the last blow. Else not beyond its leash of home, nor into a sanctuary:
        // those chasing give up at its edge, `haven`)
        const struck = (other) => (actor.struckBy?.[other.id] ?? -Infinity) > this.time;
        const leashed = (other) => struck(other) || (distanceBetween(home, other.square) <= wild.leash && !this.haven?.(other));
        const rouses = (enemy) => provoked(enemy) || wild.temper === "aggressive" || (wild.temper === "territorial" && distanceBetween(actor.square, enemy.square) <= wild.guard);
        const seen = this.#nearestSeen(actor, (enemy) => leashed(enemy) && rouses(enemy));

        if (seen) {
            // (Holding a place gone into, set on no one: a moment's pause on first seeing them,
            // unless they've struck it)
            if (wild.wary && actor.target === null && !provoked(seen)) {
                actor.waryUntil = this.time + WARY_MS;
            }

            actor.target = seen.id;
            actor.lastSeen = this.time;
        } else if (actor.target !== null) {
            const chased = this.actor(actor.target);

            if (!chased || chased.dead || chased.map !== actor.map || (this.time - actor.lastSeen > GIVE_UP_MS && !struck(chased)) || !leashed(chased)) {
                actor.target = null;
                actor.path = [];
                actor.pathGoal = null;
                actor.waitUntil = 0;
                actor.waryUntil = 0;
            }
        }

        const target = actor.target === null ? null : this.actor(actor.target);

        // (Waiting: turned to them, standing where it is, nothing done)
        if (target && this.time < actor.waryUntil) {
            actor.path = [];
            actor.pathGoal = null;
            actor.facing = atan2(target.x - actor.x, target.y - actor.y);

            return;
        }

        if (target) {
            actor.walkPace = actor.chaseSpeed;
            this.#pursue(actor, target);

            return;
        }

        actor.walkPace = actor.speed;

        if (actor.path.length || this.time < actor.waitUntil) {
            return;
        }

        // Keeping with its pack's leader, walking its round (on to the next stop on it, standing
        // a moment once there), or wandering from place to place near home (back there, first,
        // if it's strayed), resting a while at each
        const leader = wild.leader === null ? null : this.actor(wild.leader);
        const away = distanceBetween(actor.square, home) > wild.leash;
        let goal = null;

        if (leader && !leader.dead && leader.map === actor.map && !away) {
            if (distanceBetween(actor.square, leader.square) > WILD_PACK) {
                goal = leader.square;
            }

            actor.waitUntil = this.time + REPATH_MS;
        } else if (wild.round && !away) {
            wild.stop = (wild.stop + 1) % wild.round.length;

            const [x, y] = wild.round[wild.stop];

            goal = [Math.floor(x), Math.floor(y)];
            actor.waitUntil = this.time + (distanceBetween(actor.square, goal) / actor.speed) * 1000 + ROUND_REST[0] + actor.chance.next() * (ROUND_REST[1] - ROUND_REST[0]);
        } else {
            const angle = actor.chance.next() * Math.PI * 2;
            const reach = away ? 0 : actor.chance.next() * wild.roam;

            goal = [Math.floor(home[0] + cos(angle) * reach), Math.floor(home[1] + sin(angle) * reach)];
            actor.waitUntil = this.time + WILD_REST[0] + actor.chance.next() * (WILD_REST[1] - WILD_REST[0]);
        }

        if (goal) {
            try {
                this.#pathTo(actor, nearestFree(this.#squares(actor.map), goal, { within: 4 }));
            } catch {
                // (Nowhere to stand there: another time)
            }
        }
    }

    // --- The colossal (creatures.js COLOSSUS: the Behemoth of the Rift) ---

    // The colossal's own way of fighting. Whom it'd fight looked for again now and then
    // (#colossalTarget); then, ready, the first of its moves that would catch anyone (#colossalMove);
    // else going to stand where its breath would land on them, turning as it goes (#stride), or
    // standing there turned to them. With no one to fight, going where it's sent, if anywhere
    // (its wild's `goal`: an invasion's, host.js); leaving (`leaving`: going back the way it
    // came, beaten off), going there and fighting no one
    #colossus(actor) {
        const { goal = null, leaving = false } = actor.wild;
        const target = leaving ? null : this.#colossalTarget(actor);

        if (!target) {
            actor.target = null;
            actor.facingTo = null;
            actor.walkPace = leaving ? actor.chaseSpeed : actor.speed;

            if (!goal || hypot(goal[0] - actor.x, goal[1] - actor.y) <= COLOSSAL_NEAR) {
                actor.path = [];
                actor.pathGoal = null;
            } else {
                this.#colossalGo(actor, [Math.floor(goal[0]), Math.floor(goal[1])]);
            }

            return;
        }

        actor.target = target.id;
        actor.lastSeen = this.time;
        actor.armed = true;
        actor.walkPace = actor.chaseSpeed;

        if (this.time >= actor.readyAt && this.#colossalMove(actor, target)) {
            return;
        }

        // Coming on till they're under its jaws, breathing on any it passes where its breath
        // lands; then standing its ground, turned to them, fighting whoever's about with its
        // jaws, its roar and its tread (it never backs off)
        const { slam } = actor.wild.colossus;
        const far = hypot(target.x - actor.x, target.y - actor.y);
        const [ux, uy] = far > 1e-6 ? [(target.x - actor.x) / far, (target.y - actor.y) / far] : [sin(actor.facing), cos(actor.facing)];

        actor.facingTo = atan2(target.x - actor.x, target.y - actor.y);

        if (far <= slam.ahead + COLOSSAL_NEAR) {
            actor.path = [];
            actor.pathGoal = null;

            return;
        }

        this.#colossalGo(actor, [Math.floor(target.x - ux * slam.ahead), Math.floor(target.y - uy * slam.ahead)]);
    }

    // The colossal on its way to a square (or the nearest free one to it): its way found again
    // when it's going somewhere else, at most every REPATH_MS; nowhere to stand there, it stands
    #colossalGo(actor, goal) {
        if ((!actor.path.length || !same(actor.pathGoal, goal)) && this.time - actor.lastPathAt >= REPATH_MS) {
            try {
                this.#pathTo(actor, nearestFree(this.#squares(actor.map), goal, { within: 6 }));
            } catch {
                actor.path = [];
                actor.pathGoal = null;
            }
        }
    }

    // Whom the colossal would fight, looked for again every COLOSSAL_THINK_MS (else whom it's
    // after, while they're about): of the enemies it can see as far as its `sight` (none within
    // `within` of `middle` of its wild's `keepOut`: a town it's come against), standing, those
    // within reach of its jaws (as far from its body's middle as they'd land on) before any others
    // (on its way, it walks over them); of them, the one with most of their fellows near them
    // (within COLOSSAL_FELLOWS metres), those its breath would land on where it stands counting
    // more; the nearest of as many. Null if it sees none
    #colossalTarget(actor) {
        const { colossus } = actor.wild;
        const was = actor.target === null ? null : this.actor(actor.target);
        const still = was && !was.dead && was.map === actor.map && this.hostile(actor, was);

        if (still && this.time < (actor.rethinkAt ?? 0)) {
            return was;
        }

        actor.rethinkAt = this.time + COLOSSAL_THINK_MS;

        const { breath, slam, body } = colossus;
        const lands = breath.mouth + (breath.reach[0] + breath.reach[1]) / 2;
        const [bx, by] = this.#before(actor, body.ahead);
        const jaws = slam.ahead + slam.radius - body.ahead;
        const standing = !actor.path.length;
        let best = null;
        let bestNear = false;
        let bestScore = -Infinity;

        // (Not one in where it's kept out of: a town it's come against, host.js `keepOut`)
        const { keepOut = null } = actor.wild;
        const kept = (other) => Boolean(keepOut) && hypot(other.x - keepOut.middle[0], other.y - keepOut.middle[1]) < keepOut.within;

        for (const k of this.#within(actor.map, actor.x, actor.y, colossus.sight)) {
            const other = this.actors[k];

            if (other === actor || other.dead || other.map !== actor.map || kept(other) || !this.hostile(actor, other) || !this.canSee(actor, other, colossus.sight)) {
                continue;
            }

            const far = hypot(other.x - actor.x, other.y - actor.y);
            const fellows = this.#within(actor.map, other.x, other.y, COLOSSAL_FELLOWS).filter((j) => {
                const fellow = this.actors[j];

                return !fellow.dead && fellow.map === actor.map && this.hostile(actor, fellow) && hypot(fellow.x - other.x, fellow.y - other.y) <= COLOSSAL_FELLOWS;
            }).length;
            const near = standing && hypot(other.x - bx, other.y - by) <= jaws;
            const score = fellows + (Math.abs(far - lands) <= COLOSSAL_NEAR * 2 ? 3 : 0) - far / colossus.sight;

            if ((near && !bestNear) || (near === bestNear && score > bestScore)) {
                best = other;
                bestNear = near;
                bestScore = score;
            }
        }

        return best;
    }

    // The enemies of the colossal within `radius` metres of (x, y) on its map, but those in `spare`
    #caughtBy(actor, x, y, radius, spare = null) {
        return this.#within(actor.map, x, y, radius)
            .map((k) => this.actors[k])
            .filter((other) => other !== actor && !other.dead && other.map === actor.map && !spare?.has(other.id) && hypot(other.x - x, other.y - y) <= radius && this.hostile(actor, other));
    }

    // Where on the ground (x, y) the colossal's body's middle is, or a point `ahead` metres before
    // where it stands, the way it faces
    #before(actor, ahead) {
        return [actor.x + sin(actor.facing) * ahead, actor.y + cos(actor.facing) * ahead];
    }

    // The first of the colossal's moves (its weapon's attacks: COLOSSUS) it's ready to make that
    // would catch anyone: its breath, raked over where enough of them stand (`crowd`, or all of
    // them about, with fewer left); its jaws slammed down on any just before it (`ahead`, or
    // `near`: wherever catches more); its roar, with enough of them round it. Made, it's started
    // as a blow is (#attack: told as "attack"), turned the way it faces, standing still: whether
    // it's made one
    #colossalMove(actor, target) {
        const { breath, slam, roar, body, sight } = actor.wild.colossus;
        const ready = (move) => this.time >= (actor.moveAt?.[move] ?? 0);
        const [mx, my] = this.#before(actor, breath.mouth + (breath.reach[0] + breath.reach[1]) / 2);
        const along = (breath.reach[1] - breath.reach[0]) / 2 + breath.radius;
        const [bx, by] = this.#before(actor, body.ahead);
        let about = null;
        const enough = (caught, crowd) => caught > 0 && (caught >= crowd || caught >= (about ??= this.#caughtBy(actor, actor.x, actor.y, sight).length));
        let move = null;
        let ahead = null;

        if (ready("breath") && enough(this.#caughtBy(actor, mx, my, along).length, breath.crowd)) {
            move = "breath";
        } else if (ready("slam")) {
            const caught = (at) => this.#caughtBy(actor, ...this.#before(actor, at), slam.radius).length;
            const [far, near] = [caught(slam.ahead), caught(slam.near)];

            if (far || near) {
                move = "slam";
                ahead = near > far ? slam.near : slam.ahead;
            }
        }

        if (!move && ready("roar") && this.#caughtBy(actor, bx, by, roar.radius).length >= roar.crowd) {
            move = "roar";
        }

        if (!move) {
            return false;
        }

        const attack = actor.arms.find(({ id }) => id === (move === "breath" ? "atomicBreath" : move));

        actor.moveAt = { ...actor.moveAt, [move]: this.time + actor.wild.colossus[move].every };
        actor.path = [];
        actor.pathGoal = null;
        actor.attack = { attack, target: target.id, start: this.time, struck: false, ...(ahead === null ? {} : { ahead }) };
        actor.readyAt = this.time + attack.interval;
        this.#emit("attack", { id: actor.id, target: target.id, weapon: actor.weapon, attack: attack.id, animation: attack.animation, duration: attack.duration, hitAt: attack.hitAt });

        return true;
    }

    // One of the colossal's moves come to its moment (#fight): its jaws slammed down `ahead` metres
    // before it, a blast where they land; its roar, a blast all round it from its body's middle; or
    // its breath begun, raked over the ground ahead of it from there on (#rake). Whoever any of
    // them catches is thrown from it (#blast, its heart where it stands)
    #colossal(actor, attack, ahead = actor.wild.colossus.slam.ahead) {
        const { colossus } = actor.wild;
        const power = actor.power?.melee ?? 1;
        const heart = [actor.x, actor.y];

        if (attack.id === "atomicBreath") {
            const { reach, mouth } = colossus.breath;

            this.breaths.push({ by: actor.id, map: actor.map, x: actor.x, y: actor.y, way: [sin(actor.facing), cos(actor.facing)], start: this.time, end: this.time + attack.lasts, next: this.time, damage: [...attack.damage], power, struck: [] });
            this.#emit("breath", { id: actor.id, map: actor.map, from: [cm(actor.x), cm(actor.y)], facing: actor.facing, reach: [mouth + reach[0], mouth + reach[1]], until: this.time + attack.lasts });

            return;
        }

        const [x, y] = this.#before(actor, attack.id === "slam" ? ahead : colossus.body.ahead);
        const { radius, toss } = colossus[attack.id];

        this.#blast(actor, actor, actor.map, x, y, { radius, damage: attack.damage, power, toss, kind: attack.id === "slam" ? "colossalSlam" : "colossalRoar", heart, element: attack.id === "slam" ? null : "air", reaction: attack.reaction, stagger: attack.stagger });
    }

    // The colossal's breaths raked on over the ground (this.breaths: #colossal), from where each
    // first lands (`reach[0]` metres before its mouth) to where it stops (`reach[1]`), as long as
    // it lasts: a blast every `tick` ms where it lands then, whoever it catches hurt and thrown
    // (once a breath: `struck`), burning. Its breather fallen, it's over
    #rake() {
        for (const breath of [...this.breaths]) {
            const by = this.actor(breath.by);

            if (!by || by.dead) {
                this.breaths.splice(this.breaths.indexOf(breath), 1);

                continue;
            }

            const { mouth, reach, radius, tick, toss } = by.wild.colossus.breath;
            const attack = by.arms.find(({ id }) => id === "atomicBreath");

            while (breath.next <= this.time && breath.next <= breath.end) {
                const u = (breath.next - breath.start) / Math.max(1, breath.end - breath.start);
                const ahead = mouth + reach[0] + u * (reach[1] - reach[0]);
                const [x, y] = [breath.x + breath.way[0] * ahead, breath.y + breath.way[1] * ahead];
                const spare = new Set(breath.struck);

                breath.struck.push(...this.#caughtBy(by, x, y, radius, spare).map(({ id }) => id));
                this.#blast(by, by, breath.map, x, y, { radius, damage: breath.damage, power: breath.power, toss, kind: "atomicBreath", away: [breath.x, breath.y], spare, reaction: attack?.reaction, stagger: attack?.stagger, afflict: attack?.afflict });
                breath.next += tick;
            }

            if (breath.next > breath.end) {
                this.breaths.splice(this.breaths.indexOf(breath), 1);
            }
        }
    }

    // The colossal's own walk (in place of #move: it goes through whoever's in its way, trampling
    // them, #tread): along its way as it goes, its body turned no faster than it turns (`turn`)
    // toward the next corner of it, or to whom it's after standing (`facingTo`), slower the further
    // it's turned from where it's going, as far as the ground's clear (else finding its way again).
    // The squares its body stands over kept with it (`footprint`: those after it close to the
    // nearest of them)
    #stride(actor) {
        const { colossus } = actor.wild;
        const seconds = STEP_MS / 1000;
        const corner = actor.path[0] ?? null;
        let moved = 0;

        if (!actor.attack) {
            const was = actor.facing;
            const heading = corner ? atan2(corner[0] - actor.x, corner[1] - actor.y) : (actor.facingTo ?? actor.facing);
            const most = colossus.turn * seconds;

            // (Along its way as anyone walks it (#travel: through whoever's in the way, #bumps),
            // slower the further it's turned from where it's going; its body turned after it)
            moved = corner ? this.#travel(actor, actor.walkPace * seconds * Math.max(0.25, cos(wrapAngle(heading - was)))) : 0;
            actor.facing = wrapAngle(was + Math.max(-most, Math.min(most, wrapAngle(heading - was))));
        }

        actor.pace = moved / seconds;
        actor.running = false;

        const [bx, by] = this.#before(actor, colossus.body.ahead);
        const half = colossus.body.half;

        actor.footprint = [Math.floor(bx - half), Math.floor(by - half), Math.floor(bx + half), Math.floor(by + half)];

        // (Treading on whoever's in its way as it goes; standing, its feet shifted now and then
        // (`still` ms), on whoever's under it or hard against it)
        const { every, still, reach, round, damage, toss } = colossus.tread;
        const under = moved === 0 && !actor.attack && this.#caughtBy(actor, bx, by, round).length > 0;

        if ((moved > 0 || under) && this.time >= (actor.treadAt ?? 0)) {
            actor.treadAt = this.time + (moved > 0 ? every : still);
            this.#blast(actor, actor, actor.map, bx, by, { radius: moved > 0 ? reach : round, damage, power: actor.power?.melee ?? 1, toss, kind: "colossalTread", heart: [bx, by], element: null, reaction: "crush", stagger: 300 });
        }
    }

    // A follower (M9): after an enemy of its leader's it can see near them (or one that's after
    // it), else keeping within a few steps of them, at their pace. Each its calling's way
    // (core/followers.js wayOf): a healer heals its leader first, then the most hurt of its own; a
    // caster casts at whom it's after; one that protects goes for those after its leader first,
    // one that flanks for whom its leader's fighting. As it's told (core/host.js #orderUnit):
    // falling back (`fallBackUntil`), it runs back to its leader, after no one; guarding them
    // (`guarding`), it takes on only those after it, or after them near them (GUARD_REACH);
    // holding fire (`holdFire`), only those after it
    #follow(actor) {
        const leader = this.actor(actor.leader);

        // (A siege engine's crew, their engine wrecked: on as the soldiers they are, from where
        // they stand, going after an enemy as far as it would have)
        if (leader?.engine && leader.dead) {
            Object.assign(actor, { ai: "patrol", leader: null, leash: leader.leash, patrol: [actor.square], patrolIndex: 0 });

            return;
        }

        if (!leader || leader.dead || leader.map !== actor.map) {
            actor.target = null;

            return;
        }

        // (Falling back: after no one, running back to its leader till it's by them)
        if (actor.fallBackUntil > this.time) {
            if (distanceBetween(actor.square, leader.square) > FOLLOW.near) {
                Object.assign(actor, { target: null, assist: null });
                actor.walkPace = Math.max(actor.chaseSpeed, leader.pace) * FALL_BACK.pace;

                if (!actor.path.length || (!same(actor.pathGoal, leader.square) && this.time - actor.lastPathAt >= REPATH_MS)) {
                    this.#pathTo(actor, leader.square, [leader.x, leader.y]);
                }

                return;
            }

            actor.fallBackUntil = 0;
        }

        // (A healer: its leader first, if they're hurt; else whoever of its own's the most hurt)
        if (actor.heals && this.#mend(actor, leader)) {
            return;
        }

        // (Told to fight whoever its leader was set on: after them till they're down or gone)
        const assisted = actor.assist ? this.actor(actor.assist) : null;

        if (assisted && !assisted.dead && assisted.map === actor.map && this.hostile(actor, assisted)) {
            this.#fightFor(actor, assisted);

            return;
        }

        actor.assist = null;

        // (Anyone after it, too, wherever they are; guarding, those after its leader near them;
        // holding fire, only those after it)
        const after = (enemy, one) => enemy.target === one.id || enemy.attack?.target === one.id;
        const test = actor.holdFire
            ? (enemy) => after(enemy, actor)
            : actor.guarding
              ? (enemy) => after(enemy, actor) || (after(enemy, leader) && distanceBetween(leader.square, enemy.square) <= GUARD_REACH)
              : (enemy) => distanceBetween(leader.square, enemy.square) <= FOLLOW.guard || after(enemy, actor);
        const seen = (actor.holdFire || actor.guarding ? null : this.#firstFor(actor, leader, test)) ?? this.#nearestSeen(actor, test);

        if (seen) {
            this.#fightFor(actor, seen);

            return;
        }

        actor.target = null;

        // (At its leader's pace as they go, a sprint as they sprint, or its own if that's faster;
        // the faster the further behind: FOLLOW. Closer while they're on the move, not to stop
        // and start again behind them)
        const moving = leader.path.length > 0;

        actor.walkPace = Math.max(actor.speed, moving ? leader.pace : 0) * keepingUp(hypot(actor.x - leader.x, actor.y - leader.y));

        if (distanceBetween(actor.square, leader.square) > (moving ? FOLLOW.close : FOLLOW.near)) {
            if (!actor.path.length || (!same(actor.pathGoal, leader.square) && this.time - actor.lastPathAt >= REPATH_MS)) {
                this.#pathTo(actor, leader.square, [leader.x, leader.y]);
            }
        } else {
            actor.path = [];
        }
    }

    // Whom a follower goes for first, by its way of fighting (`tactic`), of those it would
    // (`test`): one that protects, the nearest after its leader; one that flanks, whom its leader's
    // fighting, if it can see them. Null for none
    #firstFor(actor, leader, test) {
        if (actor.tactic === "protect") {
            return this.#nearestSeen(actor, (enemy) => test(enemy) && (enemy.target === leader.id || enemy.attack?.target === leader.id));
        }

        if (actor.tactic === "flank") {
            const engaged = leader.order?.type === "engage" ? leader.order.target : leader.target;
            const foe = engaged === null || engaged === undefined ? null : this.actor(engaged);

            return foe && !foe.dead && foe.map === actor.map && this.hostile(actor, foe) && test(foe) && this.canSee(actor, foe) ? foe : null;
        }

        return null;
    }

    // A follower after someone: a spell at them, if it casts and one's ready and they're in its
    // reach; else after them
    #fightFor(actor, target) {
        actor.target = target.id;
        actor.lastSeen = this.time;
        actor.walkPace = actor.chaseSpeed;

        if (actor.casts && this.#castAt(actor, target)) {
            return;
        }

        this.#pursue(actor, target);
    }

    // Go after a target: attack it if it's within reach, otherwise walk towards it (a creature
    // with a ranged attack not ready yet closing in to strike up close, if it can)
    #pursue(actor, target) {
        // (One that keeps its distance, backing off from one come too near: a goblin bomber, a
        // ranger following a player; one with bombs besides, lobbing one now and then at whoever keeps off: the Goblin King; one
        // that calls its flock to it now and then: the Ant Monster)
        if (((actor.wild?.keep ?? actor.keep) && this.#backOff(actor, target)) || (actor.wild?.bomb && this.#lobs(actor, target)) || (actor.wild?.call && this.#calls(actor, target))) {
            return;
        }

        const closing = actor.wild && !actor.wild.keep && this.time < actor.readyAt && ringsApart(actor.square, this.#aimAt(target, actor.square)) > MELEE_REACH && this.#armsAgainst(actor, target).some((attack) => attack.kind === "melee");

        if (!closing && this.#reachable(actor, target) && (!actor.path.length || this.#stopsHere(actor, target))) {
            actor.path = [];
            this.#attack(actor, target);

            return;
        }

        // A new path when the target has moved, or when there's none (at most every REPATH_MS,
        // in case there's no way to it)
        const goal = this.#goalOf(target, actor.square);
        const moved = !same(actor.pathGoal, goal);
        const idle = !actor.path.length;
        const due = this.time - actor.lastPathAt >= REPATH_MS;

        if ((idle && moved) || ((idle || moved) && due)) {
            this.#pathTo(actor, goal, target.footprint ? [goal[0] + 0.5, goal[1] + 0.5] : [target.x, target.y]);
        }
    }

    // Come nearer than it keeps (`wild.keep` metres, or a follower's `keep`: a ranger's), backing
    // off that far again, away from them (KEEP), if it hasn't lately and there's somewhere to go:
    // whether it is. Backing off, it keeps on till it's there
    #backOff(actor, target) {
        const keep = actor.wild?.keep ?? actor.keep;

        if (actor.backing && actor.path.length) {
            return true;
        }

        actor.backing = false;

        if (hypot(target.x - actor.x, target.y - actor.y) >= keep || this.time < (actor.backOffAt ?? 0)) {
            return false;
        }

        actor.backOffAt = this.time + KEEP.every;

        const away = atan2(actor.y - target.y, actor.x - target.x);
        const goal = [Math.floor(actor.x + cos(away) * (keep + KEEP.off)), Math.floor(actor.y + sin(away) * (keep + KEEP.off))];

        try {
            this.#pathTo(actor, nearestFree(this.#squares(actor.map), goal, { within: 2 }));
        } catch {
            // (Nowhere to go that way: cornered)
        }

        actor.backing = actor.path.length > 0;

        return actor.backing;
    }

    // A bomb lobbed (`wild.bomb`: { kind, damage, every, beyond, reach, volley, spread }) at
    // whoever it's after, now and then (every `every` ms), while they keep `beyond` metres off and
    // within its `reach`, in sight (and `volley` at a time, the others about them, `spread` metres
    // off at most: the caves' Goblin King): whether it's thrown
    #lobs(actor, target) {
        const { kind, damage, every, beyond, reach, volley = 1, spread = 0 } = actor.wild.bomb;
        const far = hypot(target.x - actor.x, target.y - actor.y);

        if (this.time < (actor.bombAt ?? 0) || this.time < actor.readyAt || !actor.armed || target.map !== actor.map || far < beyond || far > reach || !this.canSee(actor, target, Math.max(SIGHT, reach))) {
            return false;
        }

        actor.bombAt = this.time + every;
        actor.path = [];
        this.#throwAt(actor, target, { id: kind, kind: "ranged", reach, damage, hitAt: 700, duration: 1300, interval: 1300, stagger: 300, reaction: "crush", animation: "throw", bomb: kind, volley, spread });

        return true;
    }

    // Its flock called to it (`wild.call`: creatures.js `call`) now and then while it's after
    // someone: the first time `first` ms after it first sets on anyone, then every `every` ms,
    // between blows and on the ground. Calling is a motion of its own that strikes no one (CALL),
    // told as "call" as it would land (#fight), for the host to bring them (host.js #flock):
    // whether it calls
    #calls(actor, target) {
        const { every, first } = actor.wild.call;

        actor.callAt ??= this.time + first;

        if (this.time < actor.callAt || this.time < actor.readyAt || !actor.armed || actor.aloft || target.map !== actor.map) {
            return false;
        }

        actor.callAt = this.time + every;
        actor.path = [];
        this.#throwAt(actor, target, { ...CALL, call: actor.wild.call });

        return true;
    }

    // Start throwing a bomb at someone (an attack whose `bomb` says which: BOMBS), or calling
    // (`call`: #calls), facing them; let go, or called, as the attack's blow would land (#fight)
    #throwAt(actor, target, attack) {
        actor.facing = atan2(target.x - actor.x, target.y - actor.y);
        actor.attack = { attack, target: target.id, start: this.time, struck: false };
        actor.readyAt = Math.max(actor.readyAt, this.time + attack.interval);
        this.unbuff(actor.id, "invisibility");
        this.#emit("attack", { id: actor.id, target: target.id, weapon: actor.weapon, attack: attack.id, animation: attack.animation, duration: attack.duration, hitAt: attack.hitAt });
    }

    /**
     * Can `actor` attack `target` from where they stand (on the same map, within reach, and seen
     * for ranged: looked for as far as the shot reaches, a bow's past where anyone looks round; up
     * close, not one on an army's camp's walkway from the lane under it, nor down: #apart; nor
     * either of them up in the air: #armsAgainst)?
     */
    #reachable(actor, target) {
        if (actor.map !== target.map) {
            return false;
        }

        const attack = chooseAttack(this.#armsAgainst(actor, target), actor.square, this.#aimAt(target, actor.square));

        if (attack?.kind === "melee") {
            return !this.#apart(actor.map, [actor.x, actor.y], [target.x, target.y]);
        }

        return attack !== null && this.canSee(actor, target, Math.max(SIGHT, attack.reach));
    }

    // What `actor` can strike `target` with: any of its attacks, but none up close with either of
    // them up in the air (#hover)
    #armsAgainst(actor, target) {
        return actor.aloft || target.aloft ? actor.arms.filter(({ kind }) => kind !== "melee") : actor.arms;
    }

    /**
     * One of the wild's creatures that lurks (its `wild.lurk`: creatures.js `lurk`, a black
     * widow), hanging unseen under the roof over where it is: no one's enemy, nor anyone its
     * (hostile), till an enemy it can see (and has noticed: not Invisible) comes within `within`
     * squares of beneath it. Then it drops on its thread, landing `drop` ms later where it is,
     * stunned till then, and sets on them. Told as "drop": { id, target, until (ms) }.
     */
    #lurk(actor) {
        const { within, drop } = actor.wild.lurk;
        const prey = this.#nearestEnemy(actor, (other) => this.canSee(actor, other), within, (other) => this.#hostile(other, actor));

        if (!prey) {
            return;
        }

        actor.lurking = false;
        actor.droppedAt = this.time;
        actor.stunnedUntil = Math.max(actor.stunnedUntil, this.time + drop);
        actor.target = prey.id;
        actor.path = [];
        this.#emit("drop", { id: actor.id, target: prey.id, until: this.time + drop });
    }

    /**
     * One of the wild's creatures that takes to the air once it's badly hurt (its `wild.hover`:
     * creatures.js `hover`): at `below` its hit points or fewer, fighting someone, between blows
     * and free to, it goes up (`rise` ms), stays up there (`ms`), and comes down again (`rise`),
     * not to go up again for `every` ms. While it's off the ground (`aloft`), no blow up close
     * reaches it nor any of its own reaches down (#armsAgainst), it starts nothing it wouldn't be
     * done with before it comes down (#attack), and going up or down it stays where it is
     * (#rising). Told as "aloft": { id, from, down, landed } (ms), going up; dead, it falls (#die).
     */
    #hover(actor) {
        const hover = actor.wild?.hover;

        if (!hover || actor.dead) {
            return;
        }

        if (actor.aloft) {
            if (this.time >= actor.aloft.landed) {
                actor.aloft = null;
                actor.hoverAt = this.time + hover.every;
            }

            return;
        }

        const ready = this.time >= (actor.hoverAt ?? 0) && this.time >= actor.staggeredUntil && this.time >= actor.stunnedUntil && !actor.attack && !actor.casting;

        if (!ready || actor.target === null || actor.hp > actor.maxHp * hover.below) {
            return;
        }

        actor.aloft = { from: this.time, down: this.time + hover.rise + hover.ms, landed: this.time + hover.rise * 2 + hover.ms };
        actor.path = [];
        actor.readyAt = Math.max(actor.readyAt, this.time + hover.rise);
        this.#emit("aloft", { id: actor.id, ...actor.aloft });
    }

    // Going up into the air, or coming down out of it (#hover): staying where it is meanwhile
    #rising(actor) {
        const aloft = actor.aloft;

        return Boolean(aloft) && (this.time < aloft.from + (aloft.landed - aloft.down) || this.time >= aloft.down);
    }

    // Where `actor` aims at `target` from `from` (squares): its own square; or, standing over more
    // (a fortification's `footprint`), the one of them nearest; or, under it (the colossal's body
    // over them), the one of them next to theirs
    #aimAt(target, from) {
        const box = target.footprint;

        if (!box) {
            return target.square;
        }

        const at = [Math.min(box[2], Math.max(box[0], from[0])), Math.min(box[3], Math.max(box[1], from[1]))];

        return same(at, from) ? [from[0] + (from[0] < box[2] ? 1 : -1), from[1]] : at;
    }

    // Where `actor` goes to get at `target` from `from`: its square; or, standing over more, the
    // square just outside them nearest
    #goalOf(target, from) {
        const box = target.footprint;

        return box ? [Math.min(box[2] + 1, Math.max(box[0] - 1, from[0])), Math.min(box[3] + 1, Math.max(box[1] - 1, from[1]))] : target.square;
    }

    // A fortification (KINDS fort): the nearest enemy within reach of its loops shot at, whatever
    // else; never moving
    #hold(actor) {
        const target = this.#nearestEnemy(actor, (enemy) => this.#reachable(actor, enemy));

        actor.target = target?.id ?? null;

        if (target) {
            this.#attack(actor, target);
        }
    }

    /**
     * Why `actorId` couldn't shoot `targetId` from where they stand, with what they hold ("range":
     * further than it reaches, or elsewhere; "sight": something in the way; "dark": too far to see
     * in the light there is: whyUnseen), or null if they could: for a
     * shot made stronger (an aimed shot), refused before it's ready again.
     */
    shotAt(actorId, targetId) {
        const [actor, target] = [this.actor(actorId), this.actor(targetId)];
        const reach = Math.max(0, ...actor.arms.filter(({ kind }) => kind === "ranged").map(({ reach }) => reach));

        if (!target || target.map !== actor.map || distanceBetween(actor.square, this.#aimAt(target, actor.square)) > reach) {
            return "range";
        }

        return this.whyUnseen(actor, target, Math.max(SIGHT, reach));
    }

    // Is someone within a guard's leash of its post, or of the round it walks (always, for those
    // with none), or within what it holds (`holds`: a box of squares, [x0, y0, x1, y1]: a camp's
    // stockade, host.js #holdStockade), or one who's struck it lately (DEFEND_MS: it defends
    // itself), however far?
    #leashed(actor, other) {
        const [x, y] = other?.square ?? [];
        const held = actor.holds && x >= actor.holds[0] && y >= actor.holds[1] && x <= actor.holds[2] && y <= actor.holds[3];

        return !actor.leash || !other || (other.map === actor.spawnMap && (held || offRound(actor.patrol, other.square) <= actor.leash || (actor.struckBy?.[other.id] ?? -Infinity) > this.time));
    }

    // The nearest enemy on its map that it's noticed (not unseen: Invisibility), within `within`
    // squares each way, that passes `test` (an enemy: one `enemy` of it, as hostile has it)
    #nearestEnemy(actor, test, within = Infinity, enemy = (other) => this.hostile(other, actor)) {
        let best = null;
        let bestDistance = Infinity;
        let bestK = Infinity;

        // (The cheap checks first, and `test` for none no nearer than the nearest yet; only those
        // near enough to be within `within`, if it's not everyone, the nearest cells first, and
        // none in cells too far off to beat the nearest yet. Of two as near, the first)
        for (const ring of within === Infinity ? [this.actors.keys()] : this.#ringsNear(actor, within)) {
            if (ring.least > bestDistance) {
                break;
            }

            for (const k of ring) {
                const other = this.actors[k];

                // (Nor a section of a palisade: none set on one of their own accord)
                if (other.dead || other.map !== actor.map || other.kind === "stakes" || !this.#near(actor, other, within)) {
                    continue;
                }

                // (Further either way than the nearest yet is: no nearer, and not worth working out)
                if (Math.abs(actor.square[0] - other.square[0]) > bestDistance || Math.abs(actor.square[1] - other.square[1]) > bestDistance) {
                    continue;
                }

                const distance = distanceBetween(actor.square, other.square);

                if ((distance < bestDistance || (distance === bestDistance && k < bestK)) && enemy(other) && this.#noticed(actor, other) && test(other)) {
                    best = other;
                    bestDistance = distance;
                    bestK = k;
                }
            }
        }

        return best;
    }

    // The nearest enemy it can see that passes `test` (none further than it can see: SIGHT, or
    // further for one of the wild's that sees further, its `sight`: an elite, creatures.js ELITES;
    // or for one that looks further, its own `sight`: an invasion's close fighters, charging)
    #nearestSeen(actor, test = () => true) {
        // (A siege engine as far as it reaches: its crew watch for it)
        const sight = actor.wild?.sight ?? actor.sight ?? (actor.engine ? Math.max(SIGHT, longestReach(actor.arms)) : SIGHT);

        return this.#nearestEnemy(actor, (enemy) => this.canSee(actor, enemy, sight) && test(enemy), sight);
    }

    // The enemy the nearest of its own it can see (on its rounds or at its post, too) is fighting,
    // if it's an enemy of its as well, noticed, and within its leash: the alarm raised, it comes to
    // their help though the enemy's further off than it can see (or hidden from it)
    #alarmed(actor) {
        let best = null;
        let bestDistance = Infinity;
        let bestK = Infinity;

        // (The cheap checks first, and sight last. Of two as near, the first)
        for (const k of this.#nearSquare(actor, SIGHT)) {
            const other = this.actors[k];

            if (other === actor || other.dead || other.target === null || other.ai !== "patrol" || other.team !== actor.team || other.map !== actor.map || !this.#near(actor, other, SIGHT)) {
                continue;
            }

            const foe = this.actor(other.target);
            const distance = distanceBetween(actor.square, other.square);

            // (Not those hacking at a palisade: no help wanted there but their own: core/host.js #hack)
            if ((distance < bestDistance || (distance === bestDistance && k < bestK)) && foe && !foe.dead && foe.kind !== "stakes" && foe.map === actor.map && this.hostile(foe, actor) && this.#noticed(actor, foe) && this.#leashed(actor, foe) && this.#roomOn(actor, foe) && this.canSee(actor, other)) {
                best = foe;
                bestDistance = distance;
                bestK = k;
            }
        }

        return best;
    }

    // Could two characters be within `reach` of each other: no more than that many squares apart
    // either way? (Cheap, before anything dearer: how their peoples stand, what's between them)
    #near(a, b, reach) {
        return Math.abs(a.square[0] - b.square[0]) <= reach && Math.abs(a.square[1] - b.square[1]) <= reach;
    }

    // --- Formations, casters and healers, and the player first ---

    // Each formation on the march: walked on towards where it's going at its speed, facing that
    // way, and there, standing; or, standing, one that advances (ADVANCE) towards the enemy
    // nearest it, till its front's on them. Not while any of it's fighting (HOLD_MS), unless it's
    // charging: then on till it's there, where it stops charging
    #march() {
        for (const [id, formation] of Object.entries(this.formations)) {
            if (this.time >= formation.closeAt) {
                formation.closeAt = this.time + CLOSE_MS;
                this.#closeRanks(id, formation);
            }

            if (this.time - formation.engagedAt < HOLD_MS && !formation.broken && !formation.charge) {
                continue;
            }

            const sighted = !formation.to && formation.advance ? this.#closingWith(formation) : null;
            const goal = formation.to ?? (sighted ? [sighted.x, sighted.y] : null);

            if (!goal) {
                continue;
            }

            const [dx, dy] = [goal[0] - formation.anchor[0], goal[1] - formation.anchor[1]];
            const distance = hypot(dx, dy);
            const step = (formation.speed * STEP_MS) / 1000;

            if (!formation.to && distance <= ADVANCE.to) {
                continue;
            }

            if (distance <= step) {
                formation.anchor = [...formation.to];
                formation.to = null;
                formation.charge = false;
            } else {
                formation.anchor = [formation.anchor[0] + (dx / distance) * step, formation.anchor[1] + (dy / distance) * step];
                formation.facing = atan2(dx, dy);
            }
        }
    }

    // A formation's ranks closed over its fallen (or opened for any who've joined it), as a line's
    // are: its line laid out again for those of it there are now (core/formation.js placesOf),
    // and each place, the front ranks first and the middle of a rank before its ends, taken by
    // whoever of its role was nearest it (of two as near, the first), so the ranks behind step up
    // into the gaps in front and the line narrows as it thins; with none of its shield line left,
    // its two-handers its front
    #closeRanks(id, formation) {
        const members = this.actors.filter((actor) => !actor.dead && actor.formation?.id === id);

        if (members.length === formation.strength) {
            return;
        }

        formation.strength = members.length;

        const roles = members.map((member) => member.formation.role ?? "front");
        const places = placesOf(roles, formation.layout ?? undefined);
        const byRole = new Map();

        roles.forEach((role, k) => {
            const each = byRole.get(role) ?? byRole.set(role, { places: [], members: [] }).get(role);

            each.places.push(places[k]);
            each.members.push(members[k]);
        });

        for (const each of byRole.values()) {
            const left = [...each.members];

            each.places.sort(([ra, ba], [rb, bb]) => ba - bb || Math.abs(ra) - Math.abs(rb) || ra - rb);

            for (const [right, back] of each.places) {
                let best = 0;
                let bestDistance = Infinity;

                left.forEach(({ formation: { slot } }, k) => {
                    const [dx, dy] = [slot[0] - right, slot[1] - back];

                    if (dx * dx + dy * dy < bestDistance) {
                        [best, bestDistance] = [k, dx * dx + dy * dy];
                    }
                });

                left.splice(best, 1)[0].formation.slot = [right, back];
            }
        }
    }

    // The enemy a formation that advances is closing with: the nearest to one of it within
    // ADVANCE.sight (looked for again every RETHINK_MS, meanwhile the same while it lives), or none
    #closingWith(formation) {
        if (this.time >= formation.lookAt) {
            const member = formation.member === null ? null : this.actor(formation.member);

            formation.lookAt = this.time + RETHINK_MS;
            formation.sighted = member && !member.dead ? (this.#nearestEnemy(member, () => true, ADVANCE.sight)?.id ?? null) : null;
        }

        const sighted = formation.sighted === null ? null : this.actor(formation.sighted);

        return sighted && !sighted.dead ? sighted : null;
    }

    // One in a formation: its post where its place in it is now (and facing the way it faces); its
    // formation told it's fighting, if it is
    #keepRank(actor) {
        const formation = this.formations[actor.formation.id];

        if (!formation) {
            return;
        }

        const [x, y] = actor.formation.post ?? placeAt(formation, actor.formation.slot);
        const post = [Math.floor(x), Math.floor(y)];

        if (actor.patrol?.length !== 1 || !same(actor.patrol[0], post)) {
            actor.patrol = [post];
            actor.patrolIndex = 0;
        }

        actor.post = actor.formation.facing ?? formation.facing;
        formation.member = actor.id;

        if (actor.target !== null) {
            formation.engagedAt = this.time;
        }
    }

    // Who's after whom as the step begins (#inFight); the players in the battle, and how many of
    // their enemies are set on each, up close and from afar (#drawnTo)
    #mustered() {
        const chasers = this.#chasers;
        const chasing = (id, by) => id !== null && id !== undefined && (chasers.get(id) ?? chasers.set(id, []).get(id)).push(by);

        chasers.clear();
        this.#players = this.actors.filter((actor) => actor.kind === "player" && !actor.dead);
        this.#onPlayers.clear();

        const players = new Set(this.#players.map(({ id }) => id));

        for (const actor of this.actors) {
            if (actor.dead) {
                continue;
            }

            // (Set on, attacking or told to fight: each once)
            const [target, attacking, told] = [actor.target, actor.attack?.target ?? null, actor.order?.type === "engage" ? actor.order.target : null];

            chasing(target, actor.id);
            attacking !== target && chasing(attacking, actor.id);
            told !== target && told !== attacking && chasing(told, actor.id);

            if (actor.target !== null && players.has(actor.target)) {
                this.#onPlayer(this.actor(actor.target))[this.#shoots(actor) ? "ranged" : "melee"]++;
            }
        }
    }

    // Whether one fights from afar (a bow, a wand or grimoire, spells it casts)
    #shoots(actor) {
        return Boolean(actor.casts) || longestReach(actor.arms) > MELEE_REACH;
    }

    // How many of a player's enemies are on them this step, up close and from afar
    #onPlayer(player) {
        return this.#onPlayers.get(player.id) ?? this.#onPlayers.set(player.id, { melee: 0, ranged: 0 }).get(player.id);
    }

    // Whether there's room for one more on someone: anyone but a player; a player it's on already;
    // or one fewer than so many are on, up close or from afar as it fights (AGGRO)
    #roomOn(actor, other) {
        return other.kind !== "player" || actor.target === other.id || this.#onPlayer(other)[this.#shoots(actor) ? "ranged" : "melee"] < AGGRO[this.#shoots(actor) ? "ranged" : "melee"];
    }

    // A player near (AGGRO), its enemy, seen and within its leash, it goes for before anyone else,
    // if there's room on them (#roomOn); or none
    #drawnTo(actor) {
        for (const player of this.#players) {
            if (player.dead || player.map !== actor.map || !this.#near(actor, player, AGGRO.reach) || distanceBetween(actor.square, player.square) > AGGRO.reach || !this.hostile(player, actor) || !this.#noticed(actor, player) || !this.#leashed(actor, player)) {
                continue;
            }

            if (this.#roomOn(actor, player) && this.canSee(actor, player)) {
                return player;
            }
        }

        return null;
    }

    // A caster's spell at whom it's set on: the first of its spells that's ready, if they're in its
    // reach and seen. Whether it's casting
    #castAt(actor, target) {
        if (this.time < actor.spellReadyAt) {
            return false;
        }

        for (const id of actor.casts) {
            const spell = SPELLS[id];

            if (spell && this.time >= (actor.spellsReadyAt?.[id] ?? 0) && distanceBetween(actor.square, target.square) <= spell.reach && this.canSee(actor, target, spell.reach) && this.cast(actor.id, id, target.id).ok) {
                return true;
            }
        }

        return false;
    }

    // A healer's spell on whoever of its own in its reach (one of the folk aside), seen, is the most
    // hurt, under HEALING.below of their health (of two as hurt, the first): its weakest that's
    // ready, or, under HEALING.mend, its strongest. One it heals first (`first`: a follower's
    // leader), if they're that hurt, before anyone. Whether it's casting
    #mend(actor, first = null) {
        if (this.time < actor.spellReadyAt) {
            return false;
        }

        const reach = SPELLS[actor.heals[0]]?.reach ?? 0;
        const seen = (other) => distanceBetween(actor.square, other.square) <= reach && (other === actor || this.canSee(actor, other, reach));
        const firstShare = first && !first.dead && first.map === actor.map && first.maxHp > 0 ? first.hp / first.maxHp : 1;
        let best = firstShare < HEALING.below && seen(first) ? first : null;
        let worst = best ? firstShare : HEALING.below;
        let bestK = Infinity;

        for (const k of best ? [] : this.#nearSquare(actor, reach)) {
            const other = this.actors[k];

            if (other.dead || other.neutral || other.map !== actor.map || other.maxHp <= 0 || (other !== actor && this.hostile(other, actor))) {
                continue;
            }

            const share = other.hp / other.maxHp;

            if ((share < worst || (share === worst && k < bestK)) && seen(other)) {
                [best, worst, bestK] = [other, share, k];
            }
        }

        if (!best) {
            return false;
        }

        for (const id of worst < HEALING.mend ? [...actor.heals].reverse() : actor.heals) {
            if (this.time >= (actor.spellsReadyAt?.[id] ?? 0) && this.cast(actor.id, id, best.id).ok) {
                return true;
            }
        }

        return false;
    }

    // Where everyone stands, kept by cell (INDEX_CELL): made again if it might be out of date. {
    // cells: map id -> cell -> indices into `actors` (in their order), at: where each was (x, y),
    // order: each one's index }
    #indexed() {
        const index = this.#index;

        if (index && index.actors === this.actors && index.length === this.actors.length && index.version === this.#version) {
            return index;
        }

        const cells = new Map();
        const at = new Float64Array(this.actors.length * 2);
        const order = new Map();

        this.actors.forEach((actor, k) => {
            const mine = cells.get(actor.map) ?? cells.set(actor.map, new Map()).get(actor.map);
            const cell = cellOf(Math.floor(actor.x / INDEX_CELL), Math.floor(actor.y / INDEX_CELL));
            const list = mine.get(cell);

            if (list) {
                list.push(k);
            } else {
                mine.set(cell, [k]);
            }

            at[2 * k] = actor.x;
            at[2 * k + 1] = actor.y;
            order.set(actor, k);
        });

        return (this.#index = { actors: this.actors, length: this.actors.length, version: this.#version, cells, at, order });
    }

    // Everyone on a map who might be within `reach` metres either way of a point (x, y): their
    // places in `actors`, in no order (whoever asks breaks ties between them by it, as though
    // they'd gone through `actors` in order); none further, though some may be (cells are coarse)
    #within(mapId, x, y, reach) {
        if (!Battle.indexing) {
            return [...this.actors.keys()];
        }

        const index = this.#indexed();
        const cells = index.cells.get(mapId);
        const out = reach + INDEX_SLACK;
        const found = [];

        if (!cells) {
            return found;
        }

        for (let cy = Math.floor((y - out) / INDEX_CELL); cy <= Math.floor((y + out) / INDEX_CELL); cy++) {
            for (let cx = Math.floor((x - out) / INDEX_CELL); cx <= Math.floor((x + out) / INDEX_CELL); cx++) {
                for (const k of cells.get(cellOf(cx, cy)) ?? []) {
                    found.push(k);
                }
            }
        }

        return found;
    }

    // The same as #nearSquare, in rings of cells round the character's, nearest first: each its
    // places in `actors`, and `least`, how near any of them could be (squares, distanceBetween)
    #ringsNear(actor, reach) {
        if (!Battle.indexing) {
            return [Object.assign([...this.actors.keys()], { least: -Infinity })];
        }

        const index = this.#indexed();
        const cells = index.cells.get(actor.map);
        const [x, y] = [actor.square[0] + 0.5, actor.square[1] + 0.5];
        const out = reach + 1 + INDEX_SLACK;
        const [cx, cy] = [Math.floor(x / INDEX_CELL), Math.floor(y / INDEX_CELL)];
        const [left, right, top, bottom] = [Math.floor((x - out) / INDEX_CELL), Math.floor((x + out) / INDEX_CELL), Math.floor((y - out) / INDEX_CELL), Math.floor((y + out) / INDEX_CELL)];
        const rings = [];

        if (!cells) {
            return rings;
        }

        for (let r = 0; r <= Math.max(cx - left, right - cx, cy - top, bottom - cy); r++) {
            // (Anyone in a cell r out is at least r - 1 cells' width off, less how far they may
            // have gone since the index was made, and a square's rounding)
            const ring = Object.assign([], { least: (r - 1) * INDEX_CELL - INDEX_SLACK - 2 });

            for (let ny = Math.max(top, cy - r); ny <= Math.min(bottom, cy + r); ny++) {
                for (let nx = Math.max(left, cx - r); nx <= Math.min(right, cx + r); nx++) {
                    if (Math.max(Math.abs(nx - cx), Math.abs(ny - cy)) === r) {
                        for (const k of cells.get(cellOf(nx, ny)) ?? []) {
                            ring.push(k);
                        }
                    }
                }
            }

            rings.push(ring);
        }

        return rings;
    }

    // Everyone who might be within `reach` squares either way of a character's square (#near)
    #nearSquare(actor, reach) {
        return this.#within(actor.map, actor.square[0] + 0.5, actor.square[1] + 0.5, reach + 1);
    }

    // A character's walked on: the index made again before it's next asked, if it's gone further
    // than INDEX_SLACK from where the index has it
    #moved(actor) {
        const index = this.#index;

        if (index?.version === this.#version) {
            const k = index.order.get(actor);

            if (k === undefined || Math.abs(actor.x - index.at[2 * k]) > INDEX_SLACK || Math.abs(actor.y - index.at[2 * k + 1]) > INDEX_SLACK) {
                this.#version++;
            }
        }
    }

    // --- Walking ---

    /**
     * Is a character at a square it's been walking to: on it, or (there being no more of its way)
     * next to it, as near as the mesh goes (a square by a wall can have its middle in the mesh's
     * margin, and the way then ends at its edge)?
     */
    #at(actor, square) {
        return same(actor.square, square) || (!actor.path.length && same(actor.pathGoal, square) && ringsApart(actor.square, square) <= 1);
    }

    /**
     * Is a square on a map taken by someone else than `except`: someone standing on it, or with
     * their body over its middle?
     */
    #occupied(mapId, [x, y], except) {
        return this.#within(mapId, x + 0.5, y + 0.5, 2 * BODY + 1).some((k) => {
            const other = this.actors[k];

            return other !== except && !other.dead && other.map === mapId && ((other.square[0] === x && other.square[1] === y) || hypot(other.x - (x + 0.5), other.y - (y + 0.5)) < 2 * BODY);
        });
    }

    /**
     * A way for a character, found by `find` (from where it is: [[x, y], ...], the corners to
     * walk to), to the centimetre; or, replaying a host's game, the way the host found for it
     * just now (#replayed). Whoever's listening is told it (onPath: a host's netplay, recording).
     */
    #route(actor, find) {
        let way = this.replay ? this.#replayed(actor) : null;

        if (!way) {
            way = find().map(([x, y]) => [cm(x), cm(y)]);

            // (The first corner is where it is, or as near to it as the mesh comes)
            if (way.length && hypot(way[0][0] - actor.x, way[0][1] - actor.y) < 0.05) {
                way.shift();
            }
        }

        // (A copy: the way's walked off as it's walked)
        this.onPath?.(actor.id, way.map(([x, y]) => [x, y]));

        return way;
    }

    // The way the host found for a character just now (replay: [time, id, way], in the order it
    // found them), if it's the next: else null (and this battle has strayed from the host's, which
    // its checks will find)
    #replayed(actor) {
        while (this.replay.length && this.replay[0][0] < this.time) {
            this.replay.shift();
        }

        const [time, id, way] = this.replay[0] ?? [];

        if (time === this.time && id === actor.id) {
            this.replay.shift();

            return structuredClone(way);
        }

        return null;
    }

    // A forecast's way (fork): over the navigation tiles made already only, or, they not all being
    // made, straight there, for now
    #madeWay(actor, point) {
        const way = navigatorOf(this.maps[actor.map]).wayIn([actor.x, actor.y], point);

        return way.length ? way : [point];
    }

    // Find the way to a square (to `point` on it: its middle, unless said), over the map's
    // navigation mesh; a wagon's through a town's gate along its middle (wagonWay). Anyone but a
    // player, or someone with a player near them and where they're going (WAIT_BEYOND), waits for
    // the mesh's tiles not in yet, where the game has them made off the page's thread
    // (navigation.js later), rather than hold the step up making them
    #pathTo(actor, goal, point = [goal[0] + 0.5, goal[1] + 0.5]) {
        // (Somewhere else: how near it's got starts again)
        if (!same(actor.pathGoal, goal)) {
            actor.progress = null;
        }

        const near = ([x, y]) => this.#players.some((player) => player.map === actor.map && hypot(player.x - x, player.y - y) <= WAIT_BEYOND);
        const wait = actor.kind !== "player" && !(near([actor.x, actor.y]) && near(point));

        actor.path = this.#route(actor, () => (actor.kind === "wagon" ? wagonWay(this.maps[actor.map], [actor.x, actor.y], point, { wait }) : this.bakedOnly ? this.#madeWay(actor, point) : navigatorOf(this.maps[actor.map]).path([actor.x, actor.y], point, { wait })));
        actor.pathGoal = [...goal];
        actor.lastPathAt = this.time;
        actor.blockedSince = null;
        actor.offPath = false;
    }

    /**
     * Head for a link's end on the character's map and, standing on it (or next to it, when
     * someone's in the way), go through. Returns false if the link has no end on its map.
     */
    #goThrough(actor, link) {
        const here = link?.ends.find((end) => end.map === actor.map);

        // (None at this end to go in by: a way only out, a hell's portal out)
        if (!here?.squares.length) {
            return false;
        }

        const on = here.squares.some((square) => this.#at(actor, square));
        const near = here.squares.some((square) => distanceBetween(square, actor.square) <= LINK_REACH && this.#occupied(actor.map, square, actor));

        if (on || (near && !actor.path.length)) {
            this.#cross(actor, link, here);

            return true;
        }

        // On the way: a path to it if it's heading anywhere else, or has none (at most every
        // REPATH_MS, in case there's no way there)
        const goal = here.squares.find((square) => !this.#occupied(actor.map, square, actor)) ?? here.squares[0];
        const heading = actor.pathGoal !== null && here.squares.some((square) => same(square, actor.pathGoal));
        const idle = !actor.path.length;

        if (!heading || (idle && this.time - actor.lastPathAt >= REPATH_MS)) {
            this.#pathTo(actor, goal);
        }

        return true;
    }

    // Come out at a link's other end: on its map, on the square it arrives at (or the nearest
    // free one), facing into the room
    #cross(actor, link, here) {
        const there = link.ends.find((end) => end !== here);

        // (A building's floors are made the first time anyone goes in: world.interiors)
        if (there.pending && !this.world.interiors?.ensure(there.map)) {
            return;
        }

        const square = nearestFree(this.#squares(there.map), there.arrive, { taken: this.#others(there.map, actor) });
        const from = actor.map;

        Object.assign(actor, {
            map: there.map,
            square,
            x: square[0] + 0.5,
            y: square[1] + 0.5,
            path: [],
            offPath: false,
            pathGoal: null,
            facing: there.facing,
            pace: actor.walkPace,
            attack: null,
            crossed: { link: link.id, from, to: there.map, time: this.time },
        });
        this.#version++;

        if (actor.order?.type === "enter") {
            actor.order = null;
        }

        this.#emit("cross", { id: actor.id, link: link.id, kind: link.kind, from, to: there.map, square, facing: there.facing });
    }

    #move(actor) {
        if (actor.dead) {
            return;
        }

        // (The colossal, its own way: #stride)
        if (actor.ai === "colossus") {
            this.#stride(actor);

            return;
        }

        const seconds = STEP_MS / 1000;

        // A runner with no stamina left walks
        if (actor.order?.run && actor.stamina <= 0) {
            actor.order.run = false;
            this.#emit("exhausted", { id: actor.id });
        }

        // How fast to go: walking pace, or up to a sprint (speeding up, and slowing down in time
        // to arrive walking)
        const run = Boolean(actor.order?.run);
        const walk = actor.walkPace;
        const want = run ? Math.min(actor.speed * SPRINT, Math.sqrt(walk * walk + 2 * BRAKING * this.#distanceLeft(actor))) : walk;

        actor.pace = want > actor.pace ? Math.min(want, actor.pace + ACCELERATION * seconds) : Math.max(want, actor.pace - BRAKING * seconds);

        const held = this.time < actor.staggeredUntil || this.time < actor.stunnedUntil || actor.attack || actor.casting || this.#rising(actor) || actor.lurking;
        const travelled = held ? 0 : this.#travel(actor, actor.pace * seconds * shareOf(actor, "speed"));

        // Getting nowhere, jostling: squeezing past (#bumps)
        if (!actor.path.length || held) {
            actor.progress = null;
        } else {
            const left = this.#distanceLeft(actor, { reach: false });

            if (!actor.progress || left < actor.progress.left - PROGRESS) {
                actor.progress = { left, at: this.time };
            } else if (this.time - actor.progress.at > STUCK_MS) {
                actor.squeezeUntil = this.time + SQUEEZE_MS;
                actor.progress = { left, at: this.time };
            }
        }

        // Standing still, it starts again from a walk
        if (travelled === 0) {
            actor.pace = walk;
        }

        // Running uses stamina, anything else gets it back (in thousandths, so it adds up exactly),
        // the faster for what does them good (`recovery`) and the slower for what ails them
        actor.running = run && travelled > 0;

        const drain = STAMINA_DRAIN * (this.buffOf(actor, "swole") ? SPELLS.swole.stamina : 1) * (1 - Math.min(0.5, actor.endurance ?? 0));
        const stamina = actor.stamina + (actor.running ? -drain : STAMINA_RECOVERY * (actor.recovery ?? 1) * shareOf(actor, "recovery")) * seconds;

        actor.stamina = Math.min(actor.maxStamina, Math.max(0, Math.round(stamina * 1000) / 1000));
    }

    // How far a character has to go along its path (to where the one it's after is within
    // reach, unless `reach` is false), in metres
    #distanceLeft(actor, { reach = true } = {}) {
        let left = 0;
        let [x, y] = [actor.x, actor.y];

        for (const [px, py] of actor.path) {
            left += hypot(px - x, py - y);
            [x, y] = [px, py];
        }

        if (reach && (actor.order?.type === "engage" || (actor.target !== null && actor.order?.type !== "enter"))) {
            left -= longestReach(actor.arms);
        }

        return Math.max(0, left);
    }

    /**
     * Walk `budget` metres along the path, STRIDE at most at a time: straight for its next corner,
     * stepping aside round anyone in the way (#aside) and waiting where it can't. Returns how far
     * it went. It stops as soon as whoever it's after is within reach from where it's got to (up
     * close, near enough to strike: #stopsHere).
     */
    #travel(actor, budget) {
        const start = budget;
        // (Backing off from whoever it's after, a goblin bomber's: on till it's there; the
        // colossal's, on till it's there, #colossus saying when to stop)
        const target = actor.backing || actor.wild?.colossus ? null : this.#aim(actor);

        while (budget > 1e-9 && actor.path.length) {
            const [tx, ty] = actor.path[0];
            const [dx, dy] = [tx - actor.x, ty - actor.y];
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance <= 1e-9) {
                actor.path.shift();
                actor.offPath = false;
                continue;
            }

            // (Stepped aside near a corner of its way, someone else likely making for the same
            // corner: on for the next, from here)
            if (actor.offPath && actor.path.length > 1 && distance < CORNER_SLACK) {
                actor.path.shift();
                continue;
            }

            const step = Math.min(budget, distance, STRIDE);
            const [ux, uy] = [dx / distance, dy / distance];
            let next = step === distance ? [tx, ty] : [actor.x + ux * step, actor.y + uy * step];
            let heading = [ux, uy];
            let along = true;
            const blocker = this.#bumps(actor, next);

            // Someone standing where it's going: it's there, as near as it gets (not round them,
            // or squeezing past, onto where they stand). Not one after someone: it stops once
            // they're within reach, from another square than theirs (an orc and a guard closing
            // on each other both stopped, on one square, and neither could strike)
            if (blocker && !target && this.#standsAt(blocker, actor.path.at(-1))) {
                actor.path = [];

                return start - budget;
            }

            // Someone in the way (or, off its way, a wall): round them, if there's room (a wagon
            // keeps to its way, the wagon behind its ox in line: waiting, then squeezing past);
            // off its way round someone, a wall in the way, its way found again (#blocked) or, just
            // found, on round them (else, in a corner with the player in its way out, it turned
            // back and forth between them and the wall)
            if (blocker || (actor.offPath && !this.#clear(actor.map, next, actor, { walking: true }))) {
                const round = blocker ?? (actor.aside && this.time - actor.lastPathAt < REPATH_MS ? this.actor(actor.aside.id) : null);
                const aside = round && actor.kind !== "wagon" ? this.#aside(actor, [ux, uy], step, round) : null;

                if (!aside) {
                    this.#blocked(actor, blocker);

                    return start - budget;
                }

                [next, heading, along] = [aside, [(aside[0] - actor.x) / step, (aside[1] - actor.y) / step], false];
            }

            [actor.x, actor.y] = next;
            this.#moved(actor);
            actor.facing = atan2(heading[0], heading[1]);
            actor.blockedSince = null;
            budget -= step;

            if (!along) {
                actor.offPath = true;
            } else {
                actor.aside = null;

                if (step === distance) {
                    actor.path.shift();
                    actor.offPath = false;
                }
            }

            const [sx, sy] = [Math.floor(actor.x), Math.floor(actor.y)];

            if (sx !== actor.square[0] || sy !== actor.square[1]) {
                actor.square = [sx, sy];
            }

            // Within reach of whoever it's after: stop
            if (target && this.#stopsHere(actor, target)) {
                actor.path = [];

                return start - budget;
            }
        }

        return start - budget;
    }

    // Whoever a character is walking to fight (told to engage, or after): null if no one
    #aim(actor) {
        const id = actor.order?.type === "engage" ? actor.order.target : actor.target;
        const target = id === null || id === undefined ? null : this.actor(id);

        return target && !target.dead ? target : null;
    }

    // Is whoever it's after within reach from where it is, and (with a blow up close) is it as
    // near them as it closes before striking? (Up in the air out of reach of all it has: as near
    // as it'd strike from, waiting under them, not walking in under them: #hover)
    #stopsHere(actor, target) {
        const arms = this.#armsAgainst(actor, target);

        if (!arms.length) {
            return Boolean(target.aloft) && hypot(target.x - actor.x, target.y - actor.y) <= MELEE_SPACING;
        }

        // (Cheap first: no further than its longest reach, before what it can see)
        if (distanceBetween(actor.square, this.#aimAt(target, actor.square)) > longestReach(arms) + 1.5 || !this.#reachable(actor, target)) {
            return false;
        }

        const attack = chooseAttack(arms, actor.square, this.#aimAt(target, actor.square));

        // (Up against a fortification's walls: as near as it gets)
        return attack.kind !== "melee" || Boolean(target.footprint) || hypot(target.x - actor.x, target.y - actor.y) <= MELEE_SPACING;
    }

    // Who's in the way of a character stepping to a point: anyone else on its map whose body
    // that would overlap, coming nearer them (the nearest; null if no one). Squeezing past (#move),
    // it goes through anyone but a player (unless it's one itself) and, unless it's after someone,
    // whoever's standing still where it's going, or by it (THRONG): it squeezed in among the folk
    // at a stall, or onto where the player stood, and stood there inside them
    #bumps(actor, [x, y]) {
        // (The colossal: through anyone, treading on them, #stride)
        if (actor.wild?.colossus) {
            return null;
        }

        const squeezing = this.time < actor.squeezeUntil;
        const end = squeezing && !this.#aim(actor) ? actor.path.at(-1) : null;
        let nearest = null;
        let best = Infinity;

        let nearestK = Infinity;

        // (Of two as near, the first)
        for (const k of this.#within(actor.map, x, y, 2 * BODY)) {
            const other = this.actors[k];

            // (Nor one lurking overhead: #lurk)
            if (other === actor || other.dead || other.lurking || other.map !== actor.map || Math.abs(other.x - x) >= 2 * BODY || Math.abs(other.y - y) >= 2 * BODY) {
                continue;
            }

            if (squeezing && (other.kind !== "player" || actor.kind === "player") && !this.#standsAt(other, end, THRONG)) {
                continue;
            }

            const after = hypot(other.x - x, other.y - y);

            if (after < 2 * BODY && after < hypot(other.x - actor.x, other.y - actor.y) && (after < best || (after === best && k < nearestK))) {
                nearest = other;
                best = after;
                nearestK = k;
            }
        }

        return nearest;
    }

    // Whether someone is standing still (going nowhere, or held up) with their body over a point
    // (or with their middle within `near` metres of it)
    #standsAt(other, point, near = 2 * BODY) {
        return Boolean(point) && (!other.path.length || other.blockedSince !== null) && hypot(other.x - point[0], other.y - point[1]) < near;
    }

    // Whether a character's body would be clear of every blocked square at a point (or, `walking`
    // there from where `from` stands, no nearer them than it is: the ways over the mesh run nearer
    // a wall than its body's breadth, and from there no step aside was clear, so it squeezed through
    // whoever was in its way); and, for one standing on its map's navigation mesh (`from`), still on
    // it there: the mesh keeps walkers off what's drawn, a building's walls, a prop, a fence, where
    // its squares don't reach, so a step aside, or back towards its way, never takes them into
    // them; nor up onto an army's camp's walkway from the lane beside it, or down off it (#apart:
    // the mesh is under them both)
    #clear(mapId, [x, y], from = null, { walking = false } = {}) {
        if (this.#room(mapId, [x, y]) < (walking ? Math.min(BODY, this.#room(mapId, [from.x, from.y])) : BODY)) {
            return false;
        }

        if (from) {
            const navigation = navigatorOf(this.maps[mapId]);

            return !this.#apart(mapId, [from.x, from.y], [x, y]) && (!navigation.walkable(from.x, from.y) || navigation.walkable(x, y));
        }

        return true;
    }

    // How far a point is from the nearest blocked square, up to BODY (metres)
    #room(mapId, [x, y]) {
        const squares = this.#squares(mapId);
        let room = BODY;

        for (let sy = Math.floor(y - BODY); sy <= Math.floor(y + BODY); sy++) {
            for (let sx = Math.floor(x - BODY); sx <= Math.floor(x + BODY); sx++) {
                if (squares.blocked(sx, sy)) {
                    const [nx, ny] = [Math.min(Math.max(x, sx), sx + 1), Math.min(Math.max(y, sy), sy + 1)];

                    room = Math.min(room, hypot(nx - x, ny - y));
                }
            }
        }

        return room;
    }

    // Where a character steps, turned aside (ASIDE) round someone in its way: away from them
    // first, then the other way; somewhere no one else is and its body's clear of walls, still
    // going on its way. Null if there's nowhere. Round the one it stepped round last, the way it
    // went then: with them all but straight ahead, it turned one way and then back the other,
    // rocking where it stood (a patrol behind a guard posted by a wall, till it squeezed through)
    #aside(actor, [ux, uy], step, blocker) {
        const away = actor.aside?.id === blocker.id ? actor.aside.side : ux * (blocker.y - actor.y) - uy * (blocker.x - actor.x) > 0 ? -1 : 1;

        for (const side of [away, -away]) {
            for (const [c, s] of ASIDE) {
                const [vx, vy] = [ux * c - uy * s * side, uy * c + ux * s * side];
                const next = [actor.x + vx * step, actor.y + vy * step];

                if (!this.#bumps(actor, next) && this.#clear(actor.map, next, actor, { walking: true })) {
                    actor.aside = { id: blocker.id, side };

                    return next;
                }
            }
        }

        return null;
    }

    // Blocked: waiting a moment; then, if whoever it's after is within reach, stopping to fight,
    // and if it's all but there (someone standing where it was going), stopping there; else
    // finding its way again (now and then), in case there's another
    #blocked(actor, blocker) {
        actor.blockedSince ??= this.time;

        const waited = this.time - actor.blockedSince;
        const target = this.#aim(actor);

        if (target && this.#reachable(actor, target)) {
            actor.path = [];

            return;
        }

        const end = actor.path.at(-1);

        if (waited > BLOCKED_WAIT_MS && blocker && this.#standsAt(blocker, end, THRONG)) {
            actor.path = [];
        } else if ((waited > BLOCKED_WAIT_MS || !blocker) && actor.pathGoal && this.time - actor.lastPathAt >= (blocker ? BLOCKED_REPATH_MS : REPATH_MS)) {
            const since = actor.blockedSince;

            this.#pathTo(actor, actor.pathGoal, end);
            actor.blockedSince = since;
        }
    }

    // --- Fighting ---

    #attack(actor, target) {
        actor.facing = atan2(target.x - actor.x, target.y - actor.y);

        // (Its weapon drawn first)
        if (!actor.armed) {
            if (!actor.drawing?.on) {
                this.#draw(actor, true);
            }

            return;
        }

        if (this.time < actor.readyAt) {
            return;
        }

        // (Kicking or using the weapon, at random, wearing spiked boots)
        const attack = chooseAttack(this.#armsAgainst(actor, target), actor.square, this.#aimAt(target, actor.square), this.random);

        // (Nothing that reaches them; up in the air, nothing it wouldn't be done with before it
        // starts coming down)
        if (!attack || (actor.aloft && this.time + attack.duration > actor.aloft.down)) {
            return;
        }

        actor.attack = { attack, target: target.id, start: this.time, struck: false };
        actor.readyAt = this.time + attack.interval;

        // (Striking, they're seen)
        this.unbuff(actor.id, "invisibility");
        this.#emit("attack", { id: actor.id, target: target.id, weapon: actor.weapon, attack: attack.id, animation: attack.animation, duration: attack.duration, hitAt: attack.hitAt });
    }

    #fight(actor) {
        if (actor.casting && !actor.dead && this.time >= actor.casting.landsAt) {
            this.#land(actor);
        }

        const current = actor.attack;

        if (!current || actor.dead) {
            return;
        }

        const { attack } = current;
        const target = this.actor(current.target);
        const elapsed = this.time - current.start;

        if (!current.struck && elapsed >= attack.hitAt) {
            current.struck = true;

            // (Turned to them as it strikes: but the colossal, turning slowly, strikes the way it faces)
            if (target && !target.dead && !actor.wild?.colossus) {
                actor.facing = atan2(target.x - actor.x, target.y - actor.y);
            }

            if (attack.kind === "colossal") {
                this.#colossal(actor, attack, current.ahead);
            } else if (attack.call) {
                const { kind, count, most } = attack.call;

                this.#emit("call", { id: actor.id, target: current.target, kind, count: [...count], most, map: actor.map, x: actor.x, y: actor.y });
            } else if (attack.bomb) {
                this.#lob(actor, target, attack);
            } else if (attack.kind === "ranged") {
                this.#launch(actor, target, attack);
            } else if (target && !target.dead && this.#reachable(actor, target) && !(attack.kind === "melee" && (actor.aloft || target.aloft))) {
                this.#hit(actor, target, attack);
            } else {
                this.#emit("miss", { id: actor.id, target: current.target, attack: attack.id });
            }
        }

        if (elapsed >= attack.duration) {
            actor.attack = null;
        }
    }

    // A spell lands: healing (and curing), harming (its target, and those round them or it leaps
    // to), stunning its target (who then turns on the caster), lasting on whoever it's cast on (a
    // ward, Reflect...), curing, frightening, calming, drawing life, poisoning. What the host does
    // (Zombify, Summon, Teleport...: host.js) it does when it's told of it. Told as "spell": how
    // many it landed on (for the caster's school, or the spell, to grow by it: host.js), and
    // anything the host needs (`level`, `at`)
    #land(actor) {
        const { spell: id, target: targetId, level = 1, at = null } = actor.casting;
        const spell = SPELLS[id];
        const target = this.actor(targetId);

        actor.casting = null;

        if (!target || (target.dead && spell.target !== "corpse")) {
            return;
        }

        // (A player's spell of an element's: what it makes of their chain, first, so the spell's
        // own share of it goes with it)
        if (actor.kind === "player" && !spell.prismatic) {
            this.#chain(actor, id, spell);
        }

        let landed = 0;

        if (spell.heal || spell.full) {
            const before = target.hp;
            const cured = this.#cures(spell, target);

            for (const kind of cured) {
                this.cure(target.id, kind);
            }

            target.hp = spell.full ? target.maxHp : Math.min(target.maxHp, target.hp + Math.round(rollHeal(spell, this.random) * (actor.power?.heal ?? 1) * shareOf(target, "healing")));
            this.#emit("healed", { id: target.id, by: actor.id, spell: id, amount: target.hp - before, hp: target.hp, maxHp: target.maxHp, cured });
            landed += target.hp > before || cured.length ? 1 : 0;
        } else if (spell.cures) {
            // (A cure: what it's for ended, told as healing that restores nothing)
            const cured = this.#cures(spell, target);

            for (const kind of cured) {
                this.cure(target.id, kind);
            }

            this.#emit("healed", { id: target.id, by: actor.id, spell: id, amount: 0, hp: target.hp, maxHp: target.maxHp, cured });
            landed += cured.length ? 1 : 0;
        }

        if (spell.prismatic === true) {
            landed += this.#prismatic(actor, target, id, spell);
        } else if (spell.prismatic) {
            landed += this.#prismaticElement(actor, target, id, spell);
        } else if (spell.damage) {
            landed += this.#smite(actor, target, id, spell);
        } else if (spell.stun) {
            this.#stun(actor, target, id, Math.round(spell.stun * (actor.power?.stun ?? 1)));
            landed += 1;
        } else if (id === "light" && this.buffOf(target, "light")) {
            // (Light, cast again while it shines: put out)
            landed += this.unbuff(target.id, "light") ? 1 : 0;
        } else if (spell.lasts && (spell.target === "self" || spell.target === "friend")) {
            landed += this.buff(target.id, id, { ms: spell.lasts, by: actor.id, level }) ? 1 : 0;
        } else if (spell.flee) {
            landed += this.#frighten(actor, target, id, spell);
        } else if (id === "pacify") {
            landed += this.#pacify(actor, target, id);
        } else if (id === "polymorph") {
            // (The host changes it, if it doesn't shrug it off: only one of the wild's creatures)
            landed += this.#resisted(actor, target, id, { always: !target.wild }) ? 0 : 1;
        } else if (spell.drain) {
            landed += this.#drain(actor, target, id, spell, level);
        } else if (spell.venom) {
            this.#provoke(actor, target);
            landed += this.afflict(target.id, "poison", { by: actor.id, damage: spell.venom[Math.min(level, spell.venom.length) - 1] * this.#spellPower(actor) }) ? 1 : 0;
        } else if (!spell.cures && !spell.heal && !spell.full) {
            // (A wonder the host works: Zombify, Summon, Teleport, Word of Recall, Wizard's Walk, Attraction)
            landed += 1;
        }

        this.#emit("spell", { id: actor.id, spell: id, target: target.id, landed, level, at });
    }

    // Would one of the wild's mightier creatures shrug off a spell bending its will (RESIST)? A
    // player, or one of the unique, always (or anyone, `always`). Told as "resisted"
    #resisted(caster, target, id, { always: anyway = false } = {}) {
        const tier = target.wild?.tier ?? 0;
        const always = anyway || target.kind === "player" || Boolean(target.wild?.unique);
        const resists = always || this.random.chance(Math.min(RESIST.most, Math.max(0, (tier - RESIST.from) * RESIST.perTier)));

        if (resists) {
            this.#emit("resisted", { id: target.id, by: caster.id, spell: id, always });
            this.#provoke(caster, target);
        }

        return resists;
    }

    // Fear: the target runs blindly away from the caster (its `flee` ms: half that if it's been
    // frightened in the last FEAR_MEMORY, and not at all the time after). Whether it took
    #frighten(caster, target, id, spell) {
        if (this.#resisted(caster, target, id)) {
            return 0;
        }

        const lately = target.feared && this.time - target.feared.since < FEAR_MEMORY ? target.feared : { count: 0, since: this.time };
        const ms = lately.count === 0 ? spell.flee : lately.count === 1 ? spell.flee / 2 : 0;

        target.feared = { count: lately.count + 1, since: lately.since };

        if (!ms) {
            this.#emit("resisted", { id: target.id, by: caster.id, spell: id, always: false, used: true });

            return 0;
        }

        Object.assign(target, { attack: target.attack?.struck ? target.attack : null, casting: null, target: null, path: [], pathGoal: null });
        this.afflict(target.id, "fear", { by: caster.id, ms });
        this.#provoke(caster, target, { turn: false });

        return 1;
    }

    // Pacify: the target's no longer hostile to the caster (till the caster strikes it). Whether it took
    #pacify(caster, target, id) {
        if (this.#resisted(caster, target, id)) {
            return 0;
        }

        target.spared = { ...target.spared, [caster.id]: true };
        delete target.foes[caster.id];
        delete caster.foes?.[target.id];

        if (target.target === caster.id) {
            Object.assign(target, { target: null, path: [], pathGoal: null });
        }

        if (target.attack?.target === caster.id && !target.attack.struck) {
            target.attack = null;
        }

        this.#emit("pacified", { id: target.id, by: caster.id });

        return 1;
    }

    // Vampirism: life drawn out of the target into the caster (as much as it grows to: `level`). Whether it drew any
    #drain(caster, target, id, spell, level) {
        const [least, most] = spell.drain[Math.min(level, spell.drain.length) - 1];
        const dealt = this.#hit(caster, target, { id, kind: "spell", reaction: "arcane", stagger: 200 }, null, { damage: Math.max(1, Math.round(this.random.int(least, most) * this.#spellPower(caster))), spell: id });

        if (dealt > 0 && !caster.dead) {
            const before = caster.hp;

            caster.hp = Math.min(caster.maxHp, caster.hp + Math.round(dealt * shareOf(caster, "healing")));
            this.#emit("healed", { id: caster.id, by: caster.id, spell: id, amount: caster.hp - before, hp: caster.hp, maxHp: caster.maxHp, cured: [], from: target.id });
        }

        return dealt > 0 ? 1 : 0;
    }

    // Something left on the ground a while (HAZARDS), round [x, y] on a map, by whom (their side
    // hurt by it, not their own: what they are kept too, for once they're gone), hurting so much
    // each time; told as "hazard"
    #lay(by, map, x, y, { kind, ms, radius }, damage, spell = null) {
        const hazard = { id: this.nextHazard++, kind, map, x, y, radius, until: this.time + ms, next: this.time + HAZARDS[kind].every, damage: Math.max(1, Math.round(damage)), by: by?.id ?? null, team: by?.team ?? null, caster: by?.kind ?? null, spell };

        this.hazards.push(hazard);
        this.#emit("hazard", { hazard: hazard.id, kind, map, x, y, radius, until: hazard.until, by: hazard.by, change: "on" });
    }

    // What lies on the ground hurting whoever of the other side stands in it (never one who's
    // levitating), till it's gone
    #ground() {
        for (const hazard of [...this.hazards]) {
            const { every, afflict, element, reaction } = HAZARDS[hazard.kind];
            const by = hazard.by === null ? null : this.actor(hazard.by);
            // (Whose enemies it hurts: its caster's, or, gone (a player who's left), the enemies of
            // the side they were on, so never their friends or allies)
            const side = by ?? (hazard.by === null ? null : { id: hazard.by, team: hazard.team, kind: hazard.caster });

            if (this.time >= hazard.next) {
                hazard.next += every;

                for (const actor of this.actors) {
                    const theirs = side ? this.hostile(side, actor) : actor.team !== hazard.team && !actor.neutral;

                    if (!actor.dead && actor.map === hazard.map && theirs && hypot(actor.x - hazard.x, actor.y - hazard.y) <= hazard.radius && !this.buffOf(actor, "levitate")) {
                        this.#hit(by, actor, { id: hazard.kind, kind: "hazard", reaction, stagger: 0, afflict, element }, null, { damage: hazard.damage, spell: hazard.spell, ground: true });
                    }
                }
            }

            if (this.time >= hazard.until) {
                this.hazards.splice(this.hazards.indexOf(hazard), 1);
                this.#emit("hazard", { hazard: hazard.id, kind: hazard.kind, map: hazard.map, change: "over" });
            }
        }
    }

    // How strong a caster's attack spells are: their spell power (the Magic skill's, a wand's or
    // grimoire's, their gear's), and more for a chain of the elements' spells they're casting
    // (core/prismatic.js bonusOf: CHAIN.step a spell past its first, CHAIN.piece a sigil piece)
    #spellPower(caster) {
        return (caster.power?.spell ?? 1) * (1 + bonusOf(caster.prism));
    }

    // A player's spell landing: what it makes of their chain of the elements' spells (core/
    // prismatic.js chainAfter), told when it changes it
    #chain(actor, id, spell) {
        const { prism, change } = chainAfter(actor.prism, spell, this.time);

        actor.prism = prism;

        if (change) {
            this.#emit("prism", { id: actor.id, change, spell: id, ...chainOf(prism) });
        }
    }

    // Chains let lapse (core/prismatic.js lapsed): the next spell not landed in time ("broken"), or
    // the whole sigil not cast in time ("faded"). Every stack and piece of the sigil lost. (Not
    // while the sigil's being spent: a spell of it begun in time lands with it)
    #lapse() {
        for (const actor of this.actors) {
            if (actor.prism && lapsed(actor.prism, this.time) && !SPELLS[actor.casting?.spell]?.prismatic) {
                const change = isWhole(actor.prism) ? "faded" : "broken";

                actor.prism = null;
                this.#emit("prism", { id: actor.id, change, spell: null, ...chainOf(null) });
            }
        }
    }

    // Prismatic Destruction landing (core/prismatic.js): on its target and every enemy of the
    // caster's within its `area` round them, past wards, charms, shields and dodging: killing
    // them, but for the mightiest, who lose PRISMATIC.mighty of their whole health. The sigil spent,
    // every stack and piece with it. How many it struck
    #prismatic(caster, target, id, spell) {
        const struck = [target, ...this.actors.filter((other) => other !== target && !other.dead && other.map === target.map && this.hostile(caster, other) && hypot(other.x - target.x, other.y - target.y) <= spell.area)];

        for (const one of struck) {
            const damage = mighty(one) ? Math.max(1, Math.ceil(PRISMATIC.mighty * one.maxHp)) : Math.max(1, one.hp);

            this.#hit(caster, one, { id, kind: "spell", reaction: spell.reaction, stagger: 600, knockdown: spell.knockdown }, null, { damage, spell: id, sure: true });
        }

        caster.prism = null;
        this.#emit("prism", { id: caster.id, change: "spent", spell: id, ...chainOf(null) });

        return struck.length;
    }

    // An element's Prismatic spell landing (core/prismatic.js; spells.js prismaticFire and the
    // rest): on its target and every enemy of the caster's within its `area` round them (Prismatic
    // Air leaping on from them, each leap less), past wards, charms, shields and dodging, each
    // losing PRISMATIC.share of their whole health (the mightiest, that share of what Prismatic
    // Destruction takes from them), or as much as the element's last spell would deal them with the
    // chain's strength, whichever's more; thrown down, with whatever else it does as its element's
    // (set burning, frozen, stunned; fire left on the ground). The sigil spent, every stack and
    // piece with it. How many it struck
    #prismaticElement(caster, target, id, spell) {
        const last = SPELLS[SCHOOLS[spell.prismatic].tiers.at(-1)];
        const power = this.#spellPower(caster);
        const struck = this.#spellStruck(caster, target, spell, { beyond: true });

        for (const { one, leap } of struck) {
            const falls = pow(spell.falls ?? 0.7, leap);
            const share = PRISMATIC.share * (mighty(one) ? PRISMATIC.mighty : 1);
            const damage = Math.max(1, Math.ceil(share * one.maxHp * falls), Math.round(rollSpell(last, this.random) * power * falls));

            this.#hit(caster, one, { id, kind: "spell", reaction: spell.reaction, stagger: spell.stagger ?? 600, knockdown: spell.knockdown, afflict: spell.effect ?? null }, null, { damage, spell: id, sure: true });

            if (!one.dead && spell.stun) {
                this.#stun(caster, one, id, spell.stun);
            }
        }

        if (spell.hazard) {
            this.#lay(caster, target.map, target.x, target.y, spell.hazard, ((last.damage[0] + last.damage[1]) / 2) * power * HAZARDS[spell.hazard.kind].share, id);
        }

        caster.prism = null;
        this.#emit("prism", { id: caster.id, change: "spent", spell: id, ...chainOf(null) });

        return struck.length;
    }

    // An attack spell landing on its target: and on every enemy of the caster's round them (its
    // `area`), and leaping on to others near (its `chain`), each less; with whatever else it does.
    // How many it struck.
    #smite(caster, target, id, spell) {
        // (A blast: Explosion, round its target, throwing them all, the target away from the caster)
        if (spell.blast) {
            return this.#blast(caster, caster, target.map, target.x, target.y, { radius: spell.area, damage: spell.damage, power: this.#spellPower(caster), toss: spell.blast.toss, kind: id, spell: id, heart: [caster.x, caster.y] });
        }

        const struck = this.#spellStruck(caster, target, spell);

        for (const { one, leap } of struck) {
            const damage = Math.max(1, Math.round(rollSpell(spell, this.random) * this.#spellPower(caster) * pow(spell.falls ?? 0.7, leap)));

            this.#hit(caster, one, { id, kind: "spell", reaction: spell.reaction ?? "arcane", stagger: spell.stagger ?? 200, knockdown: spell.knockdown ?? 0, afflict: spell.effect ?? null }, null, { damage, spell: id });

            if (!one.dead && spell.stun && this.random.chance(spell.stunChance ?? 1)) {
                this.#stun(caster, one, id, spell.stun);
            }
        }

        // (What it leaves on the ground round them: fire, acid, rot)
        if (spell.hazard) {
            this.#lay(caster, target.map, target.x, target.y, spell.hazard, ((spell.damage[0] + spell.damage[1]) / 2) * this.#spellPower(caster) * HAZARDS[spell.hazard.kind].share, id);
        }

        return struck.length;
    }

    // Whom an attack spell strikes: its target, every enemy of the caster's round them (its
    // `area`), and others it leaps on to (its `chain`: from the last struck to the nearest enemy
    // not struck yet, within 3 m; the first leap, `beyond` its area, from whichever of those round
    // the target is nearest one). Each, and how many leaps it is from the target (0 for those
    // round it)
    #spellStruck(caster, target, spell, { beyond = false } = {}) {
        const struck = [{ one: target, leap: 0 }];
        const near = (from, reach) => this.actors.filter((other) => !other.dead && other.map === from.map && !struck.some(({ one }) => one === other) && this.hostile(caster, other) && hypot(other.x - from.x, other.y - from.y) <= reach);

        if (spell.area) {
            struck.push(...near(target, spell.area).map((one) => ({ one, leap: 0 })));
        }

        let from = target;

        for (let leap = 1; leap <= (spell.chain ?? 0); leap++) {
            let next = null;
            let nearest = Infinity;

            for (const start of beyond && leap === 1 ? struck.map(({ one }) => one) : [from]) {
                for (const other of near(start, 3)) {
                    const apart = hypot(other.x - start.x, other.y - start.y);

                    if (apart < nearest) {
                        next = other;
                        nearest = apart;
                    }
                }
            }

            if (!next) {
                break;
            }

            struck.push({ one: next, leap });
            from = next;
        }

        return struck;
    }

    // Does a blow (a shot, a spell: `magic`) catch on its target's shield? One carried, from in
    // front of them (within a right angle of the way they face), a spell only on a spellward;
    // not on the ground's (a pool, a fire), nor while they're stunned or down; as often as their
    // knack with it has it
    #blocks(target, attacker, { magic, ground }) {
        const shield = target.shield;

        if (!shield || ground || !attacker || attacker === target || (magic && !shield.spells) || target.stunnedUntil > this.time || (target.downUntil ?? 0) > this.time) {
            return false;
        }

        const facing = target.facing ?? 0;

        return sin(facing) * (attacker.x - target.x) + cos(facing) * (attacker.y - target.y) >= 0 && this.random.chance(shield.chance);
    }

    // Stunned by a shield bash, for `ms`: whatever it was doing stops; a creature or a guard turns
    // on whoever did it
    #bashed(attacker, target, ms) {
        // (Nothing stuns the colossal)
        if (target.wild?.colossus) {
            return;
        }

        target.stunnedUntil = Math.max(target.stunnedUntil, this.time + ms);
        target.casting = null;

        if (target.attack && !target.attack.struck) {
            target.attack = null;
        }

        this.#turnOn(target, attacker, this.time + ms);
        this.#emit("stunned", { id: target.id, by: attacker.id, ability: "shieldBash", until: target.stunnedUntil });
    }

    // Stunned by a spell, for `ms`: whatever it was doing stops; a creature or a guard turns on
    // whoever did it
    #stun(caster, target, id, ms) {
        // (Nothing stuns the colossal)
        if (target.wild?.colossus) {
            this.#emit("resisted", { id: target.id, by: caster.id, spell: id, always: true });

            return;
        }

        // (Warded against the spell's school, or magic: less long)
        if (this.#warded(target, { school: SPELLS[id]?.school ?? "magic" })) {
            ms = Math.round(ms * WARD);
        }

        target.stunnedUntil = Math.max(target.stunnedUntil, this.time + ms);
        target.casting = null;

        if (target.attack && !target.attack.struck) {
            target.attack = null;
        }

        this.#turnOn(target, caster, this.time + ms);
        this.#emit("stunned", { id: target.id, by: caster.id, spell: id, until: target.stunnedUntil });
    }

    #launch(actor, target, attack) {
        if (!target || target.dead) {
            this.#emit("miss", { id: actor.id, target: target?.id ?? null, attack: attack.id });

            return;
        }

        const projectile = {
            id: this.nextProjectile++,
            kind: attack.projectile.kind,
            speed: attack.projectile.speed,
            from: actor.id,
            target: target.id,
            attack,
            map: actor.map,
            x: actor.x,
            y: actor.y,
        };

        this.projectiles.push(projectile);
        this.#emit("projectile", { projectile: projectile.id, kind: projectile.kind, id: actor.id, target: target.id, x: projectile.x, y: projectile.y, speed: projectile.speed });
    }

    // Projectiles fly straight at their target, following it; they hit when they get there
    #fly() {
        for (const projectile of [...this.projectiles]) {
            const target = this.actor(projectile.target);
            const attacker = this.actor(projectile.from);

            // (Gone, or through a door: it misses)
            if (!target || target.dead || target.map !== projectile.map) {
                this.projectiles.splice(this.projectiles.indexOf(projectile), 1);
                this.#emit("fizzle", { projectile: projectile.id });
                continue;
            }

            const dx = target.x - projectile.x;
            const dy = target.y - projectile.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const travel = (projectile.speed * STEP_MS) / 1000;

            if (distance <= travel) {
                this.projectiles.splice(this.projectiles.indexOf(projectile), 1);
                this.#hit(attacker, target, projectile.attack, projectile.id);

                // (Some spat leaves a pool where it lands: lava, venom)
                if (projectile.attack.pool) {
                    this.#lay(attacker, target.map, target.x, target.y, projectile.attack.pool, HAZARDS[projectile.attack.pool.kind].damage * (attacker?.power?.ranged ?? 1));
                }
            } else {
                projectile.x += (dx / distance) * travel;
                projectile.y += (dy / distance) * travel;
            }
        }
    }

    // A bomb let go (an attack's `bomb`) at where whoever it's thrown at stands: missing if they're
    // gone. A player's Goblin Bomb does the item's damage (`given`, lob); a creature's, its own
    // times its blows from afar
    #lob(actor, target, attack) {
        if (!target || target.dead || target.map !== actor.map) {
            this.#emit("miss", { id: actor.id, target: target?.id ?? null, attack: attack.id });

            return;
        }

        const damage = attack.given ?? attack.damage;
        const power = attack.given ? 1 : (actor.power?.ranged ?? 1);

        this.#throwBomb(actor, [target.x, target.y], attack.bomb, damage, power);

        // (A volley: the others about them, half to all of `spread` metres off, each where there's
        // ground clear enough to stand on)
        for (let k = 1; k < (attack.volley ?? 1); k++) {
            const angle = this.random.next() * Math.PI * 2;
            const off = attack.spread * (0.5 + 0.5 * this.random.next());
            const at = [target.x + cos(angle) * off, target.y + sin(angle) * off];

            if (this.#clear(target.map, at)) {
                this.#throwBomb(actor, at, attack.bomb, damage, power);
            }
        }
    }

    // A bomb in the air (BOMBS), from where `by` stands to (x, y): landing a moment later, and
    // bursting once its fuse burns down. Told as "bomb": where it's from and to, when it lands and
    // when it bursts, and how far its blast reaches
    #throwBomb(by, [x, y], kind, damage, power) {
        const spec = BOMBS[kind];
        const flight = Math.max(spec.soonest, Math.round((hypot(x - by.x, y - by.y) / spec.speed) * 1000));
        const bomb = { id: this.nextBomb++, kind, map: by.map, x, y, lands: this.time + flight, bursts: this.time + flight + spec.fuse, damage: [...damage], power, by: by.id, team: by.team, caster: by.kind };

        this.bombs.push(bomb);
        this.#emit("bomb", { bomb: bomb.id, kind, id: by.id, map: by.map, from: [by.x, by.y], x, y, lands: bomb.lands, bursts: bomb.bursts, radius: spec.radius });
    }

    // Bombs whose fuses have burnt down, bursting (#blast): whoever threw them, or, gone (a player
    // who's left), the side they were on, whose enemies they hurt
    #burst() {
        for (const bomb of [...this.bombs]) {
            if (this.time < bomb.bursts) {
                continue;
            }

            this.bombs.splice(this.bombs.indexOf(bomb), 1);

            const by = this.actor(bomb.by);
            const side = by ?? { id: bomb.by, team: bomb.team, kind: bomb.caster };
            const { radius, toss } = BOMBS[bomb.kind];

            this.#blast(by && !by.dead ? by : null, side, bomb.map, bomb.x, bomb.y, { radius, damage: bomb.damage, power: bomb.power, toss, kind: bomb.kind, bomb: bomb.id });
        }
    }

    /**
     * A blast at (x, y) on a map (a bomb bursting, the Explosion spell, the colossal's moves): every
     * enemy of `side`'s within `radius` metres (but those in `spare`) hurt (`damage` rolled, times
     * `power`, at its heart; half that at its edge), whatever's in their way (a shield, cover), and
     * thrown (#toss: `toss` times as far as TOSS has it; away from `heart` at the very heart of it,
     * or away from `away` wherever they are: the colossal's breath, away from it).
     * Its element a bomb's own (BOMBS), else fire's but as given (`element`: null, none), and how
     * they react to it (`reaction`, `stagger`) and what it leaves on them (`afflict`) a bomb's, but
     * as given. Told as "blast", before what it does: where, how far it reached, and who's thrown
     * where ({ id, from, to, flight, up, until }). How many it caught.
     */
    #blast(by, side, map, x, y, { radius, damage, power = 1, toss, kind, spell = null, heart = null, away = null, bomb = null, spare = null, element: given, reaction = "crush", stagger = 300, afflict: leaves = null }) {
        const caught = this.actors.filter((actor) => !actor.dead && actor.map === map && !spare?.has(actor.id) && hypot(actor.x - x, actor.y - y) <= radius && this.hostile(side, actor));
        // (How near the heart each was, before any's thrown)
        const near = caught.map((actor) => hypot(actor.x - x, actor.y - y));
        const throws = caught.map((actor, k) => this.#toss(actor, [x, y], near[k] / radius, toss, heart, away)).filter(Boolean);

        this.#emit("blast", { kind, map, x, y, radius, by: side.id, spell, bomb, throws });

        // (A bomb's own element and what it leaves on whoever it catches, BOMBS; fire's otherwise,
        // but as given)
        const { element = given === undefined ? "fire" : given, afflict = leaves } = BOMBS[kind] ?? {};

        caught.forEach((actor, k) => {
            const share = 1 - 0.5 * Math.min(1, near[k] / radius);
            const hurt = Math.max(1, Math.round(rollDamage({ damage }, this.random) * power * share));

            if (!actor.dead) {
                this.#hit(by, actor, { id: kind, kind: "blast", reaction, stagger, element, ...(afflict ? { afflict } : {}) }, null, { damage: hurt, spell, ground: true });
            }
        });

        return caught.length;
    }

    // Can someone be thrown by a blast (TOSS)? Not too heavy or not solid (`steady`), one of the
    // perilous places' own, an elite or a dungeon's boss (or a hell's level's own), what stands over
    // more than its square, a wagon or a siege engine; nor one thrown lately
    #throwable(actor) {
        return !actor.footprint && actor.kind !== "fort" && actor.kind !== "stakes" && actor.kind !== "wagon" && !actor.engine && !actor.wild?.steady && !actor.wild?.unique && !actor.wild?.elite && actor.wild?.champion !== "boss" && actor.wild?.champion !== "floor" && this.time >= (actor.thrownAt ?? -Infinity) + TOSS.spared;
    }

    // Thrown by a blast at `at` (TOSS), `out` of the way from its heart to its edge (0 to 1): away
    // from it (at its very heart, away from `heart`, whoever set it off, or any way; or away from
    // `away`, wherever they are), as far as the ground's clear that way, onto the nearest free
    // square there; down till it's up again, whatever it was doing stopped. What's told of it, or
    // null if it isn't thrown
    #toss(actor, [x, y], out, toss, heart, away = null) {
        if (!this.#throwable(actor)) {
            return null;
        }

        let [dx, dy] = away ? [actor.x - away[0], actor.y - away[1]] : [actor.x - x, actor.y - y];
        const off = hypot(dx, dy);

        if (off < 0.2) {
            const away = heart && hypot(actor.x - heart[0], actor.y - heart[1]) > 0.2 ? atan2(actor.y - heart[1], actor.x - heart[0]) : this.random.next() * Math.PI * 2;

            [dx, dy] = [cos(away), sin(away)];
        } else {
            [dx, dy] = [dx / off, dy / off];
        }

        // (As far as the ground's clear that way, a quarter of a metre at a time)
        const far = TOSS.far * toss * (1 - 0.5 * Math.min(1, out));
        let [tx, ty] = [actor.x, actor.y];

        for (let step = 0.25; step <= far + 1e-9; step += 0.25) {
            const at = [actor.x + dx * step, actor.y + dy * step];

            if (!this.#clear(actor.map, at, actor)) {
                break;
            }

            [tx, ty] = at;
        }

        let square = [Math.floor(tx), Math.floor(ty)];

        // (Someone there already: the nearest free square; none, where they stood)
        if (this.#occupied(actor.map, square, actor)) {
            try {
                square = nearestFree(this.#squares(actor.map), square, { taken: this.#others(actor.map, actor), within: 3 });
                [tx, ty] = [square[0] + 0.5, square[1] + 0.5];
            } catch {
                [tx, ty] = [actor.x, actor.y];
                square = [...actor.square];
            }
        }

        const from = [actor.x, actor.y];
        const flown = hypot(tx - from[0], ty - from[1]);
        const down = this.time + TOSS.down;

        Object.assign(actor, { x: tx, y: ty, square, path: [], offPath: false, pathGoal: null, progress: null, pace: actor.walkPace, casting: null, backing: false, thrownAt: this.time, facing: atan2(x - tx, y - ty) });
        actor.stunnedUntil = Math.max(actor.stunnedUntil, down);
        actor.downUntil = Math.max(actor.downUntil ?? 0, down);

        if (actor.attack && !actor.attack.struck) {
            actor.attack = null;
        }

        this.#version++;

        return { id: actor.id, from, to: [tx, ty], flight: TOSS.flight + Math.round(TOSS.per * flown), up: TOSS.up + TOSS.upPer * flown, until: actor.downUntil };
    }

    // What lingers on those afflicted: hurting them now and then (and bringing down any it's the
    // last of), till it wears off; and the spells lasting on anyone, till they do
    #ail() {
        for (const actor of this.actors) {
            for (const buff of actor.buffs?.length ? [...actor.buffs] : []) {
                if (this.time >= buff.until) {
                    actor.buffs.splice(actor.buffs.indexOf(buff), 1);
                    this.#emit("unbuffed", { id: actor.id, kind: buff.kind, over: true });
                }
            }

            if (this.buffOf(actor, "invisibility")) {
                this.#seeThrough(actor);
            }
        }

        for (const actor of this.actors) {
            if (actor.dead || !actor.afflictions.length) {
                continue;
            }

            for (const ailing of [...actor.afflictions]) {
                if (this.time >= ailing.next) {
                    ailing.next += AFFLICTIONS[ailing.kind].every;
                    actor.hp = Math.max(0, actor.hp - ailing.damage);
                    this.#emit("ail", { id: actor.id, kind: ailing.kind, damage: ailing.damage, hp: actor.hp, maxHp: actor.maxHp, by: ailing.by });

                    if (actor.hp === 0) {
                        this.#die(actor, this.actor(ailing.by));
                        break;
                    }
                }

                if (this.time >= ailing.until) {
                    actor.afflictions.splice(actor.afflictions.indexOf(ailing), 1);
                    this.#emit("afflicted", { id: actor.id, kind: ailing.kind, change: "over", look: ailing.look });
                }
            }
        }
    }

    /**
     * A blow, a spell or the ground striking someone: as strong as the attacker's power for its
     * kind (and its next blow made stronger, if it is), less what the target's armour takes off
     * (never less than 1); a spell's hurt as it's given (armour's no help against it). Then what's
     * lasting on either: slipped (Dodge), stronger (Surge, the attacker's, for blows of the body),
     * less (Inertial Barrier, against blows of the body; a ward against its school or element),
     * more (Surge, the target's), and some of it turned back (Reflect). How much it hurt.
     */
    // The mightiest near someone invisible (SEE_THROUGH), in sight of them, a little likelier each
    // moment the longer they're near to see through it (told as "seen"); the rest never do
    #seeThrough(actor) {
        const seconds = STEP_MS / 1000;

        for (const other of this.actors) {
            const mighty = (other.wild?.tier ?? 0) >= SEE_THROUGH.tier || Boolean(other.wild?.unique);
            const near = mighty && !other.dead && other.map === actor.map && this.hostile(other, actor) && hypot(other.x - actor.x, other.y - actor.y) <= SEE_THROUGH.near && this.canSee(other, actor);

            const seeing = near ? (other.seeing ??= {}) : null;

            if (!near || seeing[actor.id] === true) {
                continue;
            }

            const so = (seeing[actor.id] ?? 0) + seconds;

            seeing[actor.id] = this.random.chance(SEE_THROUGH.perSecond * so * seconds) ? true : so;

            if (seeing[actor.id] === true) {
                this.#emit("seen", { id: other.id, target: actor.id });
            }
        }
    }

    // Can `looker` make out `actor`: not if it's invisible, unless the looker's seen through it
    #noticed(looker, actor) {
        return !this.buffOf(actor, "invisibility") || looker.seeing?.[actor.id] === true;
    }

    // Running blindly away from whoever frightened it (Fear), somewhere off that way, then
    // further; fighting no one meanwhile
    #flee(actor, fear) {
        const from = this.actor(fear.by);

        actor.target = null;
        actor.walkPace = actor.chaseSpeed ?? actor.speed;

        if (actor.path.length) {
            return;
        }

        const away = from && from.map === actor.map ? atan2(actor.y - from.y, actor.x - from.x) : this.random.next() * Math.PI * 2;
        const angle = away + (this.random.next() - 0.5) * 1.6;
        const goal = [Math.floor(actor.x + cos(angle) * 6), Math.floor(actor.y + sin(angle) * 6)];

        try {
            this.#pathTo(actor, nearestFree(this.#squares(actor.map), goal, { within: 3 }));
        } catch {
            // (Nowhere to run that way: cowering, till another moment)
        }
    }

    #hit(attacker, target, attack, projectile = null, { damage: given = null, spell = null, ground = false, sure = false } = {}) {
        const magic = magicOf(attack, spell);

        // Behind the stakes: a shot or a spell from below at someone up on an army's camp's
        // walkway, over its stakes, as often as not taken by them (COVER: not fire left burning
        // on the ground); they know they were set on
        if (!ground && !sure && attacker && (attack.kind === "ranged" || spell) && this.#covered(attacker, target) && this.random.chance(COVER)) {
            this.#emit("covered", { id: target.id, by: attacker.id, attack: attack.id, spell, projectile });
            this.#provoke(attacker, target);

            return 0;
        }

        // Slipped: by a player's own knack for it (Evasion: blows and shots, not magic) and the
        // Dodge spell's (anything) on top of it, added; nothing, but they know they were set on
        const spelled = this.buffOf(target, "dodge");
        const dodge = (magic ? 0 : (target.dodge ?? 0)) + (spelled ? SPELLS.dodge.dodge[Math.min(spelled.level, SPELLS.dodge.dodge.length) - 1] : 0);

        if (!ground && !sure && attacker && attacker !== target && dodge > 0 && this.random.chance(dodge)) {
            this.#emit("dodged", { id: target.id, by: attacker.id, attack: attack.id, spell, projectile });
            this.#provoke(attacker, target);

            return 0;
        }

        const blow = attack.kind === "ranged" ? "ranged" : "melee";
        const boosted = given === null && attacker?.empowered?.blow === blow ? attacker.empowered : null;
        const empowered = boosted?.factor ?? 1;
        const base = given ?? Math.max(1, Math.round(rollDamage(attack, this.random) * (attacker?.power?.[blow] ?? 1) * empowered * (1 - (target.armor ?? 0))));
        const school = spell ? (SPELLS[spell]?.school ?? "magic") : null;
        const element = spell ? null : elementOf(attack);
        const warded = this.#warded(target, { school, element });
        // (A kind of creature Mastered in a player's bestiary, `mastered`: struck the harder, they
        // know where to: core/bestiary.js RESEARCH `edge`)
        const known = target.wild && attacker?.mastered?.includes(target.wild.creature) ? RESEARCH.edge : 1;
        const factor = (!magic && this.buffOf(attacker, "surge") ? SPELLS.surge.might : 1) * (!magic && this.buffOf(target, "inertialBarrier") ? SPELLS.inertialBarrier.physical : 1) * (warded ? WARD : 1) * (this.buffOf(target, "surge") ? SPELLS.surge.exposed : 1) * charmed(target, school, element) * known;
        // (What can't be warded, charmed or shielded against: Prismatic Destruction's, `sure`)
        const whole = sure || factor === 1 ? base : Math.max(1, Math.round(base * factor));

        if (boosted) {
            attacker.empowered = null;
        }

        // Caught on a shield (one carried: `shield`): a blow or a shot from in front of them, and
        // a spell on a spellward, as often as their knack with it has it, the shield taking its
        // share of it; all of it, nothing gets through. Neither what lingers after it nor a
        // knockdown, and a shorter stagger
        const blocked = !sure && this.#blocks(target, attacker, { magic, ground }) ? target.shield.share : 0;
        const damage = blocked ? Math.round(whole * (1 - blocked)) : whole;

        if (blocked) {
            this.#emit("blocked", { id: target.id, by: attacker.id, attack: attack.id, share: blocked, damage, of: whole, projectile, spell });

            if (!damage) {
                if (!target.engine) {
                    target.staggeredUntil = Math.max(target.staggeredUntil, this.time + Math.round(attack.stagger / 2));
                }

                this.#provoke(attacker, target);

                return 0;
            }
        }

        target.hp = Math.max(0, target.hp - damage);

        // (A siege engine isn't staggered: what's struck is its timbers)
        if (!target.engine) {
            target.staggeredUntil = Math.max(target.staggeredUntil, this.time + (blocked ? Math.round(attack.stagger / 2) : attack.stagger));
        }

        this.#emit("hit", {
            id: target.id,
            by: attacker?.id ?? null,
            weapon: attacker?.weapon ?? null,
            attack: attack.id,
            reaction: attack.reaction,
            damage,
            hp: target.hp,
            maxHp: target.maxHp,
            projectile,
            spell,
            ...(ground ? { ground: true } : {}),
            ...(attack.reflected ? { reflected: true } : {}),
        });

        // A blow that knocks its target off its feet: it can't move, fight or cast till it's up
        // (warded against its school, less long)
        if (attack.knockdown && !blocked && target.hp > 0 && !target.wild?.colossus && !target.engine) {
            const down = Math.round(attack.knockdown * (warded ? WARD : 1));

            target.stunnedUntil = Math.max(target.stunnedUntil, this.time + down);
            target.downUntil = Math.max(target.downUntil ?? 0, this.time + down);
            target.casting = null;

            if (target.attack && !target.attack.struck) {
                target.attack = null;
            }

            this.#emit("knockdown", { id: target.id, by: attacker?.id ?? null, until: target.downUntil });
        }

        // A blow that leaves something lingering (venom, a web, fire...), sometimes
        if (attack.afflict && !blocked && target.hp > 0 && this.random.chance(attack.afflict.chance)) {
            this.afflict(target.id, attack.afflict.kind, { by: attacker?.id ?? null, power: attacker?.power?.[spell ? "spell" : blow] ?? 1, look: attack.afflict.look ?? null });
        }

        // (A blow or a shot from a weapon with an oil on it, a player's: core/goods.js BREWS. What
        // it leaves on them, sometimes)
        const oil = !spell && !ground ? attacker?.oil : null;

        if (oil && !blocked && target.hp > 0 && this.random.chance(oil.chance)) {
            this.afflict(target.id, oil.kind, { by: attacker.id, power: attacker.power?.[blow] ?? 1, look: oil.look ?? null });
        }

        // A shield bash: stunned as well (a stronger stunner's, longer)
        if (boosted?.stun && target.hp > 0) {
            this.#bashed(attacker, target, Math.round(boosted.stun * (attacker.power?.stun ?? 1)));
        }

        // A blow that feeds whoever dealt it (`drain`: a share of the harm it did, healing them)
        if (attack.drain && attacker && attacker !== target && !attacker.dead && attacker.hp < attacker.maxHp) {
            const before = attacker.hp;

            attacker.hp = Math.min(attacker.maxHp, attacker.hp + Math.max(1, Math.round(damage * attack.drain)));
            this.#emit("healed", { id: attacker.id, by: attacker.id, spell: null, attack: attack.id, amount: attacker.hp - before, hp: attacker.hp, maxHp: attacker.maxHp, cured: [], from: target.id });
        }

        if (attacker) {
            this.#provoke(attacker, target);
        }

        if (target.hp === 0) {
            this.#die(target, attacker);
        }

        // (Some of it turned back on whoever dealt it: Reflect. Never what's itself turned back)
        const reflect = !ground && !sure && !attack.reflected && attacker && attacker !== target && !attacker.dead && this.buffOf(target, "reflect");

        if (reflect) {
            this.#hit(target, attacker, { id: "reflect", kind: "spell", reaction: "arcane", stagger: 0, reflected: true }, null, { damage: Math.max(1, Math.round(damage * SPELLS.reflect.reflect)), spell: "reflect" });
        }

        return damage;
    }

    // A creature or a guard turned on whoever set on it (`lastSeen`: as if seen till then): set on,
    // it defends itself, however many are on a player already (AGGRO keeps back only those who
    // haven't been: the user, "make sure any unit that is attacked attempts to defend itself")
    #turnOn(actor, attacker, lastSeen) {
        if (actor.ai !== "patrol" && actor.ai !== "wild") {
            return;
        }

        // (One hacking at a palisade, its `siege`, keeps at it, struck from up on the walkway over
        // it, out of its reach)
        if (actor.siege && this.#apart(actor.map, [actor.x, actor.y], [attacker.x, attacker.y])) {
            return;
        }

        if (attacker.kind === "player" && actor.target !== attacker.id) {
            this.#onPlayer(attacker)[this.#shoots(actor) ? "ranged" : "melee"]++;
        }

        actor.target = attacker.id;
        actor.lastSeen = lastSeen;
    }

    // Someone set on (struck, or a spell cast at them): they fight back (`turn`: a creature or a
    // guard turns on whoever did it), calm towards them no longer (Pacify), and hold it against
    // them a while, as do those of their own who saw (not one that's `lone`'s: it's its own)
    #provoke(attacker, target, { turn = true } = {}) {
        // (Struck while it waited, holding a place: it fights back at once)
        target.waryUntil = 0;

        // (After whoever did it, beyond its leash if need be, a while)
        if (attacker !== target) {
            this.#struckBy(target, attacker);
        }

        if (turn) {
            this.#turnOn(target, attacker, this.time);
        }

        // (One of a pack of the wild's: the rest of its pack after whoever did it too, wherever
        // they are and whether they saw or not, as if it howled; those fighting someone already
        // fighting on)
        const pack = target.wild?.pack;

        if (pack && attacker !== target && attacker.team !== target.team) {
            for (const other of this.actors) {
                if (other !== target && other.wild?.pack === pack && !other.dead && other.map === target.map) {
                    this.#struckBy(other, attacker);
                    other.foes[attacker.id] = this.time + FOE_MS;

                    if (turn && other.target === null) {
                        this.#turnOn(other, attacker, this.time);
                    }
                }
            }
        }

        if (target.spared?.[attacker.id]) {
            delete target.spared[attacker.id];
        }

        // (Striking one of those they pass for: seen through by them all, a while)
        if (attacker.guise && attacker.guise === target.team) {
            this.unmask(attacker);
        }

        if (attacker.team !== target.team) {
            const until = this.time + FOE_MS;
            // (One that picks its own fights, `lone` (an invasion's raider), makes no enemy of one
            // it leaves be by striking another of their own: a player in their first invasion, and
            // theirs, watching it strike the town's soldiers)
            const spares = (other) => attacker.lone && this.relations && !this.relations(attacker, other);

            for (const other of this.actors) {
                // (A creature: only its own pack)
                const own = other.team === target.team && (!target.wild || other.wild?.pack === target.wild.pack);

                if (other === target || (own && !target.lone && !other.neutral && !other.dead && other.map === target.map && !spares(other) && (this.canSee(other, target) || this.canSee(other, attacker)))) {
                    other.foes[attacker.id] = until;
                }
            }
        }
    }

    // Struck by `attacker` (or one of its pack was): after them, beyond its leash if need be, till
    // DEFEND_MS after (the rest it was struck by forgotten, once that's past)
    #struckBy(actor, attacker) {
        actor.struckBy ??= {};

        for (const id in actor.struckBy) {
            if (actor.struckBy[id] <= this.time) {
                delete actor.struckBy[id];
            }
        }

        actor.struckBy[attacker.id] = this.time + DEFEND_MS;
    }

    #die(actor, killer) {
        actor.dead = true;
        actor.respawnAt = this.time + actor.respawnMs;
        // (Up in the air: falling)
        actor.aloft = null;
        actor.afflictions = [];
        actor.buffs = [];
        actor.drawing = null;
        actor.attack = null;
        actor.casting = null;
        actor.order = null;
        actor.path = [];
        actor.target = null;

        for (const other of this.actors) {
            if (other.target === actor.id) {
                other.target = null;
            }

            if (other.order?.target === actor.id) {
                other.order = null;
            }

            if (other.attack?.target === actor.id && !other.attack.struck) {
                other.attack = null;
            }
        }

        this.#emit("death", { id: actor.id, by: killer?.id ?? null, respawnAt: actor.respawnAt });

        // (One that bursts as it dies: what it leaves where it fell, BOMBS, as strong as its blows)
        if (actor.wild?.burst) {
            this.#throwBomb(actor, [actor.x, actor.y], actor.wild.burst.kind, actor.wild.burst.damage, actor.power?.melee ?? 1);
        }
    }

    #respawn(actor) {
        const square = nearestFree(this.#squares(actor.spawnMap), actor.spawn, { taken: this.#others(actor.spawnMap, actor) });
        const from = actor.map;

        Object.assign(actor, {
            map: actor.spawnMap,
            crossed: null,
            dead: false,
            hp: actor.maxHp,
            stamina: actor.maxStamina,
            pace: actor.speed,
            walkPace: actor.speed,
            running: false,
            square,
            x: square[0] + 0.5,
            y: square[1] + 0.5,
            path: [],
            offPath: false,
            facing: 0,
            attack: null,
            readyAt: this.time,
            staggeredUntil: 0,
            stunnedUntil: 0,
            downUntil: 0,
            afflictions: [],
            buffs: [],
            feared: null,
            casting: null,
            spellReadyAt: this.time,
            spellsReadyAt: {},
            target: null,
            patrolIndex: actor.patrol?.length > 1 ? 1 : 0,
            waitUntil: 0,
            pathGoal: null,
            armed: false,
            drawing: null,
            foughtAt: -Infinity,
        });
        this.#version++;
        this.#emit("respawn", { id: actor.id, square, map: actor.map, from });
    }
}

/** The weapons table, for the interface (so it needn't import weapons.js separately). */
export { WEAPONS };
