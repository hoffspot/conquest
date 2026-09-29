// The battle: characters moving and fighting on the world's grid of 1-metre squares.
//
// It advances in fixed steps of STEP_MS, so it runs the same on every device (and one player's
// game can later be the authority for others'). Each character stands on one square and walks
// from square middle to square middle along paths found with A* (pathfinding.js), never into a
// square another character is on or about to step into.
//
// Fighting is automatic:
//  - The player goes where they're told (a "move" order) and, whenever they're standing still,
//    attacks any enemy within reach of their weapon. Told to "engage" an enemy, they walk until
//    it's within reach, then attack it.
//  - An enemy patrols between its two patrol points. When it sees the player (within SIGHT
//    squares, with nothing in the way) it chases them and attacks whenever they're within reach,
//    giving up and going back to its patrol if it loses sight of them for GIVE_UP_MS.
//
// Told to run (an order with run: true), a character sprints: SPRINT times as fast as it walks,
// speeding up and slowing down as runners do (ACCELERATION, BRAKING), and slowing to a walk in
// time to arrive. Running uses stamina, STAMINA_DRAIN points a second; anything else gets it
// back, STAMINA_RECOVERY a second. A character has as much stamina as it has hit points, and it
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
import { nearestFree, squareKey, squaresOf } from "./grid.js";
import { routeBetween } from "./interiors.js";
import { findPath, lineAhead } from "./pathfinding.js";
import { createRandom } from "./random.js";
import { BECKON, REST_EVERY, ROLES } from "./roles.js";
import { rollHeal, rollSpell, SPELL_COOLDOWN, SPELLS, WARD } from "./spells.js";
import { Variety } from "./variety.js";
import { armsOf, chooseAttack, distanceBetween, longestReach, MELEE_REACH, ringsApart, rollDamage, WEAPONS } from "./weapons.js";

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
});

/**
 * How a follower keeps with its leader (docs/WAR.md M9): how near (squares) it keeps, and how far
 * from its leader (squares) it goes after an enemy of theirs it can see.
 */
export const FOLLOW = Object.freeze({ near: 3, guard: 12 });

/**
 * Are two characters' teams enemies: on different teams, and neither one of the folk no one
 * fights? (A battle asks more: Battle's hostile.)
 */
export const hostile = (a, b) => a.team !== b.team && !a.neutral && !b.neutral;

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
const THROWN = Object.freeze({ bolt: "magic", wisp: "magic", curse: "magic", fireball: "fire", flame: "fire", lava: "fire", roots: "earth" });
const elementOf = (attack) => attack.element ?? THROWN[attack.projectile?.kind] ?? (attack.reaction === "fire" ? "fire" : attack.afflict?.look === "frost" ? "water" : null);

// Is a blow magic (a spell, or a wand's or grimoire's bolt, a curse, a wisp's)? (Not a blow of the body: Surge and Inertial Barrier have nothing to do with it)
const magicOf = (attack, spell) => Boolean(spell) || THROWN[attack.projectile?.kind] === "magic" || attack.projectile?.kind === "fireball";

/**
 * How many times as fast as it walks a character sprints: as people do, walking at about 1.4
 * metres a second (5 km/h) and sprinting at about 6.5 (23 km/h).
 */
export const SPRINT = 6.5 / 1.4;

/** Stamina used running, and got back doing anything else, in points a second. */
export const STAMINA_DRAIN = 3;
export const STAMINA_RECOVERY = 1;

// How quickly a runner speeds up and slows down (metres a second, each second): about a second
// from a walk to a sprint, and a few strides to slow from one
const ACCELERATION = 6;
const BRAKING = 7;

// An enemy that hasn't seen its target for this long goes back to its patrol (ms)
const GIVE_UP_MS = 3000;

// How long an enemy waits at each end of its patrol (ms)
const PATROL_PAUSE_MS = 1500;

// How long one of the wild's creatures rests between wanderings (ms), and how near (squares) one
// of a pack keeps to its leader
const WILD_REST = [4000, 12000];
const WILD_PACK = 3;

// How often a chase finds a new path to a target that has moved (ms)
const REPATH_MS = 500;

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

// Walking a path, a character heads straight for the furthest square of it that it can see (at
// most this many squares on), with this much room either side of it (metres: its body, so it
// doesn't graze a corner), rather than from square to square; and moves at most this far at a
// time (metres), so it notes every square it walks into
const STEER_AHEAD = 64;
const BODY = 0.3;
const STRIDE = 0.2;

// The eight squares round one, and how many squares at most are looked through for a place to
// talk to someone from
const AROUND = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const TALK_SEARCH = 800;

export class Battle {
    /**
     * @param {object} world - From generateWorld (world.js): its blocked squares and spawns.
     * @param {object} [options]
     * @param {number} [options.seed] - Seeds the damage rolls.
     * @param {Function} [options.relations] - Whether two characters on different teams are
     *     enemies (the host's: how their peoples stand in the war); else they always are.
     */
    constructor(world, { seed = 1, relations = null } = {}) {
        this.world = world;
        this.relations = relations;

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
    }

    /**
     * Add a character: { id, kind (a KINDS key), name, weapon (a WEAPONS key), boots (wearing
     * spiked boots, kicking too: weapons.js armsOf), team, square
     * ([x, y]), map (a map's id: "town" to start with), ai ("patrol" for enemies, "routine" for
     * the folk), patrol ([[x, y], [x, y]], on its map), neutral (one of the folk: no one fights
     * them, and they fight no one), routine (the folk's: see #routine), facing, armed (its
     * weapon drawn to start with; else it's put away), leash (a guard's: how far from its post,
     * its patrol's first point, it goes after an enemy, metres) }. It comes back to life where
     * it's added. The folk have a `role` (roles.js ROLES: how they rest). A patrol goes round its
     * points in turn (a guard's one point: its post, facing out the way it's added facing).
     */
    add({ id, kind, name = kind, weapon = null, boots = false, team, square, map = "town", ai = null, patrol = null, neutral = false, routine = null, role = null, facing = 0, armed = false, leash = null, leader = null, hp = null, speed = null, chase = null, power = null, armor = 0, wild = null }) {
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
            // (A follower's: whom it follows, by id)
            leader,
            post: facing,
            // Whom it holds a grudge against (by id), and until when (FOE_MS)
            foes: {},
            // How much stronger its blows (up close, from afar), heals and stuns are than their
            // own (a player's skills and gear: core/progress.js), the share of each blow its
            // armour takes off, and how much stronger its next blow is (a power strike: null
            // for none)
            power: { melee: 1, ranged: 1, heal: 1, stun: 1, ...power },
            armor,
            empowered: null,
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
            // Where it is (square middles are at + 0.5), the square it's on, and the square it's
            // stepping into (null when standing still)
            x: square[0] + 0.5,
            y: square[1] + 0.5,
            square: [...square],
            to: null,
            path: [],
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
            dead: false,
            respawnAt: 0,
            // What lingers on it after some blows (afflictions.js): poison, a web...
            afflictions: [],
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
            // (One of the wild's creatures: { creature, tier, temper, guard, roam, leash, leader }:
            // #wild)
            wild,
        };

        this.actors.push(actor);

        return actor;
    }

    actor(id) {
        return this.actors.find((actor) => actor.id === id) ?? null;
    }

    /**
     * Make a character's next blow of a kind ("melee" or "ranged") `factor` times as strong (a
     * power strike, an aimed shot: core/progress.js ABILITIES).
     */
    empower(id, blow, factor) {
        const actor = this.actor(id);

        if (actor && !actor.dead) {
            actor.empowered = { blow, factor };
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

        Object.assign(actor, { map, square: there, x: there[0] + 0.5, y: there[1] + 0.5, to: null, path: [], pathGoal: null, facing: facing ?? actor.facing, pace: actor.walkPace, attack: null, casting: null, order: null, target: null, crossed: null });

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
     * Are two characters enemies? Never one of the folk (no one fights them), or itself; always
     * if either's lately struck the other or one of its own (FOE_MS); never on the same team;
     * otherwise as their teams stand (`relations`: the peoples' war), or always, without that.
     */
    hostile(a, b) {
        if (a === b || a.neutral || b.neutral) {
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
            actors: this.actors.map(({ chance, restVariety, steering, ...actor }) => ({
                ...structuredClone(actor),
                chance: chance.state,
                restVariety: restVariety.toJSON(),
                // (Heading straight for a square of the path it's on: made again for any other)
                steering: steering?.path === actor.path ? structuredClone({ ...steering, path: null }) : null,
            })),
            projectiles: structuredClone(this.projectiles),
            hazards: structuredClone(this.hazards),
            nextHazard: this.nextHazard,
        };
    }

    /** A battle on `world` carrying on from a snapshot (snapshot()), its teams standing as `relations` has them. */
    static restore(world, snapshot, { relations = null } = {}) {
        const battle = new Battle(world, { seed: snapshot.seed, relations });

        Object.assign(battle, { time: snapshot.time, lag: snapshot.lag, nextProjectile: snapshot.nextProjectile, projectiles: structuredClone(snapshot.projectiles), hazards: structuredClone(snapshot.hazards ?? []), nextHazard: snapshot.nextHazard ?? 1 });
        battle.random.state = snapshot.random;
        battle.actors = snapshot.actors.map(({ chance: state, restVariety, steering, ...kept }) => {
            const actor = structuredClone(kept);
            const chance = createRandom(0);

            chance.state = state;

            return Object.assign(actor, { chance, restVariety: new Variety(() => chance.next(), restVariety), steering: steering ? { ...structuredClone(steering), path: actor.path } : null });
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
     * near as can be), { type: "ahead", facing } (straight ahead the way `facing` points,
     * radians, as far as the way is clear), { type: "engage", target: id } (go and fight it),
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

        // Walking away calls off an attack that hasn't landed yet
        if (actor.attack && !actor.attack.struck && order.type === "move") {
            actor.attack = null;
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
                // From wherever it is (or is stepping to), square after square in a line
                const from = actor.to ? [actor.to[0] + 0.5, actor.to[1] + 0.5] : [actor.x, actor.y];
                const line = lineAhead(this.#squares(actor.map), from, order.facing);

                if (!line.length) {
                    actor.order = null;
                    actor.path = [];
                    break;
                }

                actor.order = { type: "move", to: line.at(-1), run: Boolean(order.run) };
                actor.path = line;
                actor.pathGoal = [...line.at(-1)];
                actor.lastPathAt = this.time;
                actor.blockedSince = null;
                break;
            }
            case "engage":
                actor.order = { type: "engage", target: order.target, run: Boolean(order.run) };
                actor.pathGoal = null;
                break;
            case "approach":
                actor.order = { type: "approach", target: order.target, run: Boolean(order.run) };
                actor.pathGoal = null;
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
     * enemy), "range" or "sight" (CAST_FAILURES says them: none of them the host's own refusals,
     * host.js REFUSALS, but for the cooldown, which is the same).
     */
    cast(id, spellId, targetId = null, { level = 1, at = null } = {}) {
        const actor = this.actor(id);
        const spell = SPELLS[spellId];

        if (!actor || !spell || actor.dead) {
            return { ok: false, reason: "busy" };
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
            actor.facing = Math.atan2(target.x - actor.x, target.y - actor.y);
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

        if (!this.canSee(actor, target)) {
            return { reason: "sight" };
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

        if (!actor || actor.dead || !affliction) {
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
     * Can `a` see `b`: on the same map, within SIGHT squares, with nothing that blocks sight
     * between their middles (the map's opaque squares: houses and trees, not barrels or a well,
     * outdoors; walls, not tables, indoors)?
     */
    canSee(a, b) {
        return a.map === b.map && this.#sees(a.map, a.square, b.square);
    }

    // Can someone on a map at one square see another square: within SIGHT, nothing opaque between
    // (along the line between their middles)?
    #sees(mapId, from, to) {
        const distance = distanceBetween(from, to);

        if (distance > SIGHT) {
            return false;
        }

        return !this.#between(this.#squares(mapId).opaque, from, to, distance);
    }

    // Is any square `marked` (x, y) on the way between two squares (not counting them)? (Four
    // points a metre along the line: most squares get more than one, asked about once)
    #between(marked, [ax, ay], [bx, by], distance = distanceBetween([ax, ay], [bx, by])) {
        const steps = Math.ceil(distance * 4);
        let [lastX, lastY] = [ax, ay];

        for (let k = 1; k < steps; k++) {
            const x = Math.floor(ax + 0.5 + ((bx - ax) * k) / steps);
            const y = Math.floor(ay + 0.5 + ((by - ay) * k) / steps);

            if (x === lastX && y === lastY) {
                continue;
            }

            [lastX, lastY] = [x, y];

            if (marked(x, y) && !(x === bx && y === by)) {
                return true;
            }
        }

        return false;
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
        const start = actor.to ?? actor.square;
        const seen = new Set([start.join()]);
        const queue = [start];

        for (let k = 0; k < queue.length && k < TALK_SEARCH; k++) {
            const square = queue[k];

            if (this.#talksFrom(actor.map, square, target.square) && (same(square, start) || !this.#taken(square, actor))) {
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

    // The squares other characters on a map stand on (and, `stepping`, are stepping into), but
    // `actor` and `through`: a Set of grid.js squareKey
    #others(mapId, actor, { through = null, stepping = true } = {}) {
        const taken = new Set();

        for (const other of this.actors) {
            if (other !== actor && other !== through && !other.dead && other.map === mapId) {
                for (const square of stepping ? [other.square, other.to] : [other.square]) {
                    if (square) {
                        taken.add(squareKey(...square));
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

        for (const actor of this.actors) {
            this.#arm(actor);
            this.#think(actor);
        }

        for (const actor of this.actors) {
            this.#move(actor);
        }

        for (const actor of this.actors) {
            this.#fight(actor);
        }

        this.#fly();
        this.#ground();
        this.#ail();
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

        // (The cheap checks first: whether it's after it, or near enough to be seen, before how
        // their peoples stand, and only then whether anything's in the way)
        return this.actors.some((other) => {
            if (other.dead || other.map !== actor.map) {
                return false;
            }

            const after = other.target === actor.id || other.attack?.target === actor.id || (other.order?.type === "engage" && other.order.target === actor.id);

            return (after || this.#near(actor, other, SIGHT)) && this.hostile(other, actor) && (after || this.canSee(actor, other));
        });
    }

    // --- Deciding what to do ---

    #think(actor) {
        if (actor.dead) {
            if (this.time >= actor.respawnAt) {
                this.#respawn(actor);
            }

            return;
        }

        if (this.time < actor.staggeredUntil || this.time < actor.stunnedUntil || actor.attack || actor.casting) {
            return;
        }

        // Talking: facing whoever it's talking to (sitting, just the way it sits), nothing else
        // (once it's stopped where it was going)
        const partner = actor.talkingTo === null ? null : this.actor(actor.talkingTo);

        if (partner && !partner.dead && partner.map === actor.map && actor.kind === "soldier" && !this.#nearestSeen(actor)) {
            // (A soldier on its rounds stops to talk, while there's no enemy about)
            if (!actor.to) {
                actor.path = [];
                actor.facing = Math.atan2(partner.x - actor.x, partner.y - actor.y);
            }

            return;
        }

        if (partner && !partner.dead && partner.map === actor.map && actor.ai !== "patrol") {
            const face = () => (actor.facing = Math.atan2(partner.x - actor.x, partner.y - actor.y));

            // The folk stop going about their business; the player just turns to them, standing
            if (actor.ai === "routine") {
                if (!actor.to) {
                    actor.path = [];

                    if (!actor.routine.seated) {
                        face();
                    }
                }

                return;
            }

            if (!actor.to && !actor.path.length && !actor.order) {
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
     * [{ square, facing, act, group }], wait: [ms, ms], order: "cycle" or "alternate" }), each in
     * turn or (alternating) one of another group at random, waiting at each, facing its way, and
     * doing its act there (an "act" event: { id, act }).
     */
    #routine(actor) {
        const routine = actor.routine;
        const between = ([least, most]) => least + actor.chance.next() * (most - least);

        actor.walkPace = actor.speed;

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
        const idle = !actor.path.length && !actor.to;

        if (this.#beckon(actor, idle) || !idle) {
            return;
        }

        // There: on its square, or next to it with someone standing on it
        const there = same(actor.square, stop.square) || (distanceBetween(actor.square, stop.square) <= 1 && this.#taken(stop.square, actor));

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
                actor.facing = Math.atan2(player.x - actor.x, player.y - actor.y);
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

        if (order?.type === "enter") {
            const link = this.links.find(({ id }) => id === order.link);

            if (link && this.#goThrough(actor, link)) {
                return;
            }

            actor.order = null;
        }

        if (order?.type === "move") {
            if (actor.path.length || actor.to) {
                return;
            }

            actor.order = null;
        }

        if (order?.type === "approach") {
            const target = this.actor(order.target);

            if (!target || target.dead || target.map !== actor.map) {
                actor.order = null;
            } else if (this.canTalk(actor, target) && !actor.to) {
                // There: stop, facing them
                actor.order = null;
                actor.path = [];
                actor.facing = Math.atan2(target.x - actor.x, target.y - actor.y);
                this.#emit("arrived", { id: actor.id, target: target.id });

                return;
            } else {
                // To the nearest place to talk to them from (again when they've moved, or now and
                // then if stuck)
                const idle = !actor.path.length && !actor.to;

                if (!same(order.from ?? null, target.square) || (idle && this.time - actor.lastPathAt >= REPATH_MS)) {
                    const spot = this.#talkSpot(actor, target);

                    order.from = [...target.square];

                    if (!spot) {
                        actor.order = null;
                    } else if (!same(spot, actor.to ?? actor.square)) {
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
            } else {
                this.#pursue(actor, target);

                return;
            }
        }

        // (Unseen, they strike only on purpose: told to engage it)
        if (!actor.to && !actor.path.length && !this.buffOf(actor, "invisibility")) {
            // (Not a creature that's leaving everyone be: only on purpose, told to engage it)
            const target = this.#nearestEnemy(actor, (enemy) => this.#reachable(actor, enemy) && !(enemy.wild?.temper === "defensive" && enemy.target === null));

            if (target) {
                this.#attack(actor, target);
            }
        }
    }

    // An enemy: patrol, chase what it sees (through doors and up stairs, if they went through
    // just after it saw them), attack what it catches
    #patrol(actor) {
        const seen = this.#nearestSeen(actor, (enemy) => this.#leashed(actor, enemy));
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
            actor.target = seen.id;
            actor.lastSeen = this.time;
        } else if (actor.target !== null && (this.time - actor.lastSeen > GIVE_UP_MS || !this.#leashed(actor, this.actor(actor.target)))) {
            actor.target = null;
            actor.path = [];
            actor.pathGoal = null;
        }

        const target = actor.target === null ? null : this.actor(actor.target);

        if (target && !target.dead && target.map === actor.map) {
            actor.walkPace = actor.chaseSpeed;
            this.#pursue(actor, target);

            return;
        }

        if (target && !target.dead) {
            // Gone where it can't follow: wait a while in case they come back
            return;
        }

        actor.target = null;
        actor.walkPace = actor.speed;

        // Somewhere else than its patrol (it followed someone in): back the way it came
        if (actor.map !== actor.spawnMap) {
            const route = routeBetween(this.links, actor.map, actor.spawnMap);

            if (route?.length) {
                this.#goThrough(actor, route[0]);
            }

            return;
        }

        const goal = actor.patrol[actor.patrolIndex];

        if (same(actor.square, goal) && !actor.to) {
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
        } else if (!actor.path.length && !actor.to && !same(actor.pathGoal, goal)) {
            this.#pathTo(actor, goal);
        } else if (!actor.path.length && !actor.to) {
            // Couldn't get there last time (someone in the way): try again in a while
            actor.pathGoal = this.time - actor.lastPathAt > REPATH_MS ? null : actor.pathGoal;
        }
    }

    /**
     * One of the wild's creatures (core/creatures.js): wandering near where it was found (a pack
     * keeping with its leader), resting between; fighting as its temper has it (whoever it sees,
     * if it's aggressive; whoever comes within its guard, if it's territorial; only whoever's
     * struck it or its pack, if it's defensive); never going further than its leash from where it
     * was found after anyone, and making its way back there if it's further.
     */
    #wild(actor) {
        const wild = actor.wild;
        const home = actor.spawn;
        const provoked = (enemy) => (actor.foes[enemy.id] ?? -Infinity) > this.time;
        const leashed = (other) => distanceBetween(home, other.square) <= wild.leash;
        const rouses = (enemy) => provoked(enemy) || wild.temper === "aggressive" || (wild.temper === "territorial" && distanceBetween(actor.square, enemy.square) <= wild.guard);
        const seen = this.#nearestSeen(actor, (enemy) => leashed(enemy) && rouses(enemy));

        if (seen) {
            actor.target = seen.id;
            actor.lastSeen = this.time;
        } else if (actor.target !== null) {
            const chased = this.actor(actor.target);

            if (!chased || chased.dead || chased.map !== actor.map || this.time - actor.lastSeen > GIVE_UP_MS || !leashed(chased)) {
                actor.target = null;
                actor.path = [];
                actor.pathGoal = null;
                actor.waitUntil = 0;
            }
        }

        const target = actor.target === null ? null : this.actor(actor.target);

        if (target) {
            actor.walkPace = actor.chaseSpeed;
            this.#pursue(actor, target);

            return;
        }

        actor.walkPace = actor.speed;

        if (actor.to || actor.path.length || this.time < actor.waitUntil) {
            return;
        }

        // Keeping with its pack's leader, or wandering from place to place near home (back there,
        // first, if it's strayed), resting a while at each
        const leader = wild.leader === null ? null : this.actor(wild.leader);
        const away = distanceBetween(actor.square, home) > wild.leash;
        let goal = null;

        if (leader && !leader.dead && leader.map === actor.map && !away) {
            if (distanceBetween(actor.square, leader.square) > WILD_PACK) {
                goal = leader.square;
            }

            actor.waitUntil = this.time + REPATH_MS;
        } else {
            const angle = actor.chance.next() * Math.PI * 2;
            const reach = away ? 0 : actor.chance.next() * wild.roam;

            goal = [Math.floor(home[0] + Math.cos(angle) * reach), Math.floor(home[1] + Math.sin(angle) * reach)];
            actor.waitUntil = this.time + WILD_REST[0] + actor.chance.next() * (WILD_REST[1] - WILD_REST[0]);
        }

        if (goal) {
            try {
                this.#pathTo(actor, nearestFree(this.#squares(actor.map), goal, { within: 4 }), leader);
            } catch {
                // (Nowhere to stand there: another time)
            }
        }
    }

    // A follower (M9): after an enemy of its leader's it can see near them (or one that's after
    // it), else keeping within a few steps of them, at their pace
    #follow(actor) {
        const leader = this.actor(actor.leader);

        if (!leader || leader.dead || leader.map !== actor.map) {
            actor.target = null;

            return;
        }

        // (Anyone after it, too, wherever they are)
        const seen = this.#nearestSeen(actor, (enemy) => distanceBetween(leader.square, enemy.square) <= FOLLOW.guard || enemy.target === actor.id || enemy.attack?.target === actor.id);

        if (seen) {
            actor.target = seen.id;
            actor.lastSeen = this.time;
            actor.walkPace = actor.chaseSpeed;
            this.#pursue(actor, seen);

            return;
        }

        actor.target = null;
        actor.walkPace = Math.max(actor.speed, leader.walkPace ?? 0);

        if (distanceBetween(actor.square, leader.square) > FOLLOW.near) {
            if (!actor.to && (!actor.path.length || (!same(actor.pathGoal, leader.square) && this.time - actor.lastPathAt >= REPATH_MS))) {
                this.#pathTo(actor, leader.square, leader);
            }
        } else if (!actor.to) {
            actor.path = [];
        }
    }

    // Go after a target: attack it if it's within reach, otherwise walk towards it (a creature
    // with a ranged attack not ready yet closing in to strike up close, if it can)
    #pursue(actor, target) {
        const closing = actor.wild && this.time < actor.readyAt && ringsApart(actor.square, target.square) > MELEE_REACH && actor.arms.some((attack) => attack.kind === "melee");

        if (!closing && this.#reachable(actor, target)) {
            if (!actor.to) {
                actor.path = [];
                this.#attack(actor, target);
            }

            return;
        }

        // A new path when the target has moved, or when there's none (at most every REPATH_MS,
        // in case there's no way to it)
        const moved = !same(actor.pathGoal, target.square);
        const idle = !actor.path.length && !actor.to;
        const due = this.time - actor.lastPathAt >= REPATH_MS;

        if ((idle && moved) || ((idle || moved) && due)) {
            this.#pathTo(actor, target.square, target);
        }
    }

    /** Can `actor` attack `target` from where they stand (on the same map, within reach, and seen for ranged)? */
    #reachable(actor, target) {
        if (actor.map !== target.map) {
            return false;
        }

        const attack = chooseAttack(actor.arms, actor.square, target.square);

        return attack !== null && (attack.kind === "melee" || this.canSee(actor, target));
    }

    // Is someone within a guard's leash of its post (always, for those with none)?
    #leashed(actor, other) {
        return !actor.leash || !other || (other.map === actor.spawnMap && distanceBetween(actor.patrol[0], other.square) <= actor.leash);
    }

    // The nearest enemy on its map that it's noticed (not unseen: Invisibility), within `within`
    // squares each way, that passes `test`
    #nearestEnemy(actor, test, within = Infinity) {
        let best = null;
        let bestDistance = Infinity;

        // (The cheap checks first, and `test` for none no nearer than the nearest yet)
        for (const other of this.actors) {
            if (other.dead || other.map !== actor.map || !this.#near(actor, other, within) || !this.hostile(other, actor) || !this.#noticed(actor, other)) {
                continue;
            }

            const distance = distanceBetween(actor.square, other.square);

            if (distance < bestDistance && test(other)) {
                best = other;
                bestDistance = distance;
            }
        }

        return best;
    }

    // The nearest enemy it can see that passes `test` (none further than it can see)
    #nearestSeen(actor, test = () => true) {
        return this.#nearestEnemy(actor, (enemy) => this.canSee(actor, enemy) && test(enemy), SIGHT);
    }

    // Could two characters be within `reach` of each other: no more than that many squares apart
    // either way? (Cheap, before anything dearer: how their peoples stand, what's between them)
    #near(a, b, reach) {
        return Math.abs(a.square[0] - b.square[0]) <= reach && Math.abs(a.square[1] - b.square[1]) <= reach;
    }

    // --- Walking ---

    /** Is a square on `except`'s map taken by another character (standing on it or stepping into it)? */
    #taken([x, y], except) {
        return this.actors.some((other) => other !== except && !other.dead && other.map === except.map && ((other.square[0] === x && other.square[1] === y) || (other.to && other.to[0] === x && other.to[1] === y)));
    }

    // Find a path to `goal`, round other characters (except `through`, whose square it may end on)
    #pathTo(actor, goal, through = null) {
        const start = actor.to ?? actor.square;
        const path = findPath(this.#squares(actor.map), start, goal, { taken: this.#others(actor.map, actor, { through }) });

        // The path starts where the character is (or is stepping to)
        actor.path = path.slice(1);
        actor.pathGoal = [...goal];
        actor.lastPathAt = this.time;
        actor.blockedSince = null;
    }

    /**
     * Head for a link's end on the character's map and, standing on it (or next to it, when
     * someone's in the way), go through. Returns false if the link has no end on its map.
     */
    #goThrough(actor, link) {
        const here = link?.ends.find((end) => end.map === actor.map);

        if (!here) {
            return false;
        }

        const [x, y] = actor.square;
        const on = here.squares.some(([sx, sy]) => sx === x && sy === y);
        const near = here.squares.some((square) => distanceBetween(square, actor.square) <= LINK_REACH && this.#taken(square, actor));

        if (!actor.to && (on || (near && !actor.path.length))) {
            this.#cross(actor, link, here);

            return true;
        }

        // On the way: a path to it if it's heading anywhere else, or has none (at most every
        // REPATH_MS, in case there's no way there)
        const goal = here.squares.find((square) => !this.#taken(square, actor)) ?? here.squares[0];
        const heading = actor.pathGoal !== null && here.squares.some((square) => same(square, actor.pathGoal));
        const idle = !actor.path.length && !actor.to;

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
            to: null,
            path: [],
            pathGoal: null,
            facing: there.facing,
            pace: actor.walkPace,
            attack: null,
            crossed: { link: link.id, from, to: there.map, time: this.time },
        });

        if (actor.order?.type === "enter") {
            actor.order = null;
        }

        this.#emit("cross", { id: actor.id, link: link.id, kind: link.kind, from, to: there.map, square, facing: there.facing });
    }

    #move(actor) {
        if (actor.dead) {
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

        const held = this.time < actor.staggeredUntil || this.time < actor.stunnedUntil || ((actor.attack || actor.casting) && !actor.to);
        const travelled = held ? 0 : this.#travel(actor, actor.pace * seconds * shareOf(actor, "speed"));

        // Standing still, it starts again from a walk
        if (travelled === 0) {
            actor.pace = walk;
        }

        // Running uses stamina, anything else gets it back (in hundredths, so it adds up exactly)
        actor.running = run && travelled > 0;

        const drain = STAMINA_DRAIN * (this.buffOf(actor, "swole") ? SPELLS.swole.stamina : 1);
        const stamina = actor.stamina + (actor.running ? -drain : STAMINA_RECOVERY * shareOf(actor, "recovery")) * seconds;

        actor.stamina = Math.min(actor.maxStamina, Math.max(0, Math.round(stamina * 100) / 100));
    }

    // How far a character has to go along its path (to where the one it's after is within
    // reach), in metres
    #distanceLeft(actor) {
        let left = 0;
        let [x, y] = [actor.x, actor.y];

        for (const [sx, sy] of actor.to ? [actor.to, ...actor.path] : actor.path) {
            left += Math.hypot(sx + 0.5 - x, sy + 0.5 - y);
            [x, y] = [sx + 0.5, sy + 0.5];
        }

        if (actor.order?.type === "engage" || (actor.target !== null && actor.order?.type !== "enter")) {
            left -= longestReach(actor.arms);
        }

        return Math.max(0, left);
    }

    /**
     * Walk `budget` metres along the path. Returns how far it went. It heads straight for the
     * furthest square of the path it can see (#straighten), the squares on the way its path, so
     * it crosses open ground in a straight line rather than zig-zagging from square to square;
     * it's on each square as it walks into it, stepping into the next only if no one's there, and
     * ends in the middle of the last.
     */
    #travel(actor, budget) {
        const start = budget;

        while (budget > 1e-9) {
            if (!actor.to) {
                if (!actor.path.length) {
                    return start - budget;
                }

                if (actor.steering?.path !== actor.path) {
                    this.#straighten(actor);
                }

                if (!this.#stepInto(actor)) {
                    return start - budget;
                }
            }

            // Towards where it's heading (or, its path changed under it, the square it's stepping into)
            const steering = actor.steering?.path === actor.path ? actor.steering : null;
            const [tx, ty] = steering ? steering.point : [actor.to[0] + 0.5, actor.to[1] + 0.5];
            const dx = tx - actor.x;
            const dy = ty - actor.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const last = !actor.path.length;

            if (distance > 1e-9) {
                const step = Math.min(budget, distance, STRIDE);

                actor.x += (dx / distance) * step;
                actor.y += (dy / distance) * step;
                actor.facing = Math.atan2(dx, dy);
                budget -= step;

                if (step === distance) {
                    [actor.x, actor.y] = [tx, ty];
                }
            }

            // On the square it was stepping into: the last one only in its middle; a square it
            // walked past without setting foot on (a corner cut, as it heads straight) passed too
            const [sx, sy] = [Math.floor(actor.x), Math.floor(actor.y)];
            const onto = sx === actor.to[0] && sy === actor.to[1];
            const past = !last && sx === actor.path[0][0] && sy === actor.path[0][1];
            const there = Math.abs(actor.x - (actor.to[0] + 0.5)) < 1e-6 && Math.abs(actor.y - (actor.to[1] + 0.5)) < 1e-6;

            if ((last ? there : onto || past) || (distance <= 1e-9 && same([sx, sy], actor.to))) {
                actor.square = [...actor.to];

                // Within reach of the target from here: on to the middle of this square, slowing
                // as it comes, and stop there
                if (!last && !there && this.#arrivedInReach(actor)) {
                    actor.path = [];
                    actor.steering = { path: actor.path, point: [actor.to[0] + 0.5, actor.to[1] + 0.5] };

                    continue;
                }

                actor.to = null;

                // Stop as soon as the target is within reach
                if (this.#arrivedInReach(actor)) {
                    actor.path = [];

                    return start - budget;
                }

                // On the square it was heading for: it looks ahead again from here
                if (same(actor.square, actor.steering?.square ?? null)) {
                    actor.steering = null;
                }
            } else if (distance <= 1e-9) {
                // (Nowhere further to go this way: on to the square itself)
                actor.steering = null;
            }
        }

        return start;
    }

    /**
     * Head straight for the furthest square of the path (at most STEER_AHEAD on) that can be
     * walked to in a straight line from where the character is, with room for its body either
     * side, over no one: the squares on that line become the start of its path.
     */
    #straighten(actor) {
        const route = actor.path;
        const squares = this.#squares(actor.map);
        let best = null;

        for (let k = 0; k < Math.min(route.length, STEER_AHEAD); k++) {
            const line = this.#lineTo(actor, squares, route[k]);

            if (!line) {
                break;
            }

            best = { k, line };
        }

        const [goal, k] = best ? [route[best.k], best.k] : [route[0], 0];

        if (best) {
            actor.path = [...best.line, ...route.slice(k + 1)];
        }

        actor.steering = { path: actor.path, square: [...goal], point: [goal[0] + 0.5, goal[1] + 0.5] };
    }

    // The squares a character walks into going in a straight line from where it is to the middle
    // of `square` (ending on it), or null if the way isn't clear: a blocked square within BODY of
    // the line, a corner cut, or someone standing on it
    #lineTo(actor, squares, [gx, gy]) {
        const [x0, y0] = [actor.x, actor.y];
        const [x1, y1] = [gx + 0.5, gy + 0.5];
        const length = Math.hypot(x1 - x0, y1 - y0);
        const line = [];

        if (length < 1e-9) {
            return null;
        }

        const [nx, ny] = [-(y1 - y0) / length, (x1 - x0) / length];
        let [sx, sy] = [Math.floor(x0), Math.floor(y0)];

        for (let travelled = 0.1; ; travelled = Math.min(length, travelled + 0.1)) {
            const t = travelled / length;
            const [px, py] = [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];

            // Room for its body either side
            for (const side of [-BODY, BODY]) {
                if (squares.blocked(Math.floor(px + nx * side), Math.floor(py + ny * side))) {
                    return null;
                }
            }

            const [qx, qy] = [Math.floor(px), Math.floor(py)];

            if (qx !== sx || qy !== sy) {
                if (squares.blocked(qx, qy) || (qx !== sx && qy !== sy && (squares.blocked(qx, sy) || squares.blocked(sx, qy))) || this.#taken([qx, qy], actor)) {
                    return null;
                }

                line.push([qx, qy]);
                [sx, sy] = [qx, qy];
            }

            if (travelled >= length) {
                break;
            }
        }

        return line.length && same(line.at(-1), [gx, gy]) ? line : null;
    }

    #arrivedInReach(actor) {
        const id = actor.order?.type === "engage" ? actor.order.target : actor.target;
        const target = id === null || id === undefined ? null : this.actor(id);

        return Boolean(target && !target.dead && this.#reachable(actor, target));
    }

    // Start stepping into the next square of the path, if no one's in the way
    #stepInto(actor) {
        const next = actor.path[0];

        if (this.#taken(next, actor)) {
            actor.blockedSince ??= this.time;

            if (this.time - actor.blockedSince > BLOCKED_WAIT_MS) {
                const goal = actor.path.at(-1);
                const target = actor.target === null ? null : this.actor(actor.target);

                this.#pathTo(actor, goal, target);
            }

            return false;
        }

        actor.blockedSince = null;
        actor.path.shift();
        actor.to = next;
        actor.facing = Math.atan2(next[0] - actor.square[0], next[1] - actor.square[1]);

        return true;
    }

    // --- Fighting ---

    #attack(actor, target) {
        actor.facing = Math.atan2(target.x - actor.x, target.y - actor.y);

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
        const attack = chooseAttack(actor.arms, actor.square, target.square, this.random);

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

            if (target && !target.dead) {
                actor.facing = Math.atan2(target.x - actor.x, target.y - actor.y);
            }

            if (attack.kind === "ranged") {
                this.#launch(actor, target, attack);
            } else if (target && !target.dead && this.#reachable(actor, target)) {
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

        if (spell.damage) {
            landed += this.#smite(actor, target, id, spell);
        } else if (spell.stun) {
            this.#stun(actor, target, id, Math.round(spell.stun * (actor.power?.stun ?? 1)));
            landed += 1;
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
            landed += this.afflict(target.id, "poison", { by: actor.id, damage: spell.venom[Math.min(level, spell.venom.length) - 1] * (actor.power?.spell ?? 1) }) ? 1 : 0;
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
        const dealt = this.#hit(caster, target, { id, kind: "spell", reaction: "arcane", stagger: 200 }, null, { damage: Math.max(1, Math.round(this.random.int(least, most) * (caster.power?.spell ?? 1))), spell: id });

        if (dealt > 0 && !caster.dead) {
            const before = caster.hp;

            caster.hp = Math.min(caster.maxHp, caster.hp + Math.round(dealt * shareOf(caster, "healing")));
            this.#emit("healed", { id: caster.id, by: caster.id, spell: id, amount: caster.hp - before, hp: caster.hp, maxHp: caster.maxHp, cured: [], from: target.id });
        }

        return dealt > 0 ? 1 : 0;
    }

    // Something left on the ground a while (HAZARDS), round [x, y] on a map, by whom (their side
    // hurt by it, not their own), hurting so much each time; told as "hazard"
    #lay(by, map, x, y, { kind, ms, radius }, damage, spell = null) {
        const hazard = { id: this.nextHazard++, kind, map, x, y, radius, until: this.time + ms, next: this.time + HAZARDS[kind].every, damage: Math.max(1, Math.round(damage)), by: by?.id ?? null, team: by?.team ?? null, spell };

        this.hazards.push(hazard);
        this.#emit("hazard", { hazard: hazard.id, kind, map, x, y, radius, until: hazard.until, by: hazard.by, change: "on" });
    }

    // What lies on the ground hurting whoever of the other side stands in it (never one who's
    // levitating), till it's gone
    #ground() {
        for (const hazard of [...this.hazards]) {
            const { every, afflict, element, reaction } = HAZARDS[hazard.kind];
            const by = hazard.by === null ? null : this.actor(hazard.by);

            if (this.time >= hazard.next) {
                hazard.next += every;

                for (const actor of this.actors) {
                    const theirs = by ? this.hostile(by, actor) : actor.team !== hazard.team && !actor.neutral;

                    if (!actor.dead && actor.map === hazard.map && theirs && Math.hypot(actor.x - hazard.x, actor.y - hazard.y) <= hazard.radius && !this.buffOf(actor, "levitate")) {
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

    // An attack spell landing on its target: and on every enemy of the caster's round them (its
    // `area`), and leaping on to others near (its `chain`), each less; with whatever else it does.
    // How many it struck.
    #smite(caster, target, id, spell) {
        // (Each struck, and how many leaps it is from the target: 0 for those round it)
        const struck = [{ one: target, leap: 0 }];
        const near = (from, reach) => this.actors.filter((other) => !other.dead && other.map === from.map && !struck.some(({ one }) => one === other) && this.hostile(caster, other) && Math.hypot(other.x - from.x, other.y - from.y) <= reach);

        if (spell.area) {
            struck.push(...near(target, spell.area).map((one) => ({ one, leap: 0 })));
        }

        // (Leaping from the last struck to the nearest enemy not struck yet, within 3 m)
        let from = target;

        for (let leap = 1; leap <= (spell.chain ?? 0); leap++) {
            const next = near(from, 3).sort((a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y))[0];

            if (!next) {
                break;
            }

            struck.push({ one: next, leap });
            from = next;
        }

        for (const { one, leap } of struck) {
            const damage = Math.max(1, Math.round(rollSpell(spell, this.random) * (caster.power?.spell ?? 1) * (spell.falls ?? 0.7) ** leap));

            this.#hit(caster, one, { id, kind: "spell", reaction: spell.reaction ?? "arcane", stagger: spell.stagger ?? 200, knockdown: spell.knockdown ?? 0, afflict: spell.effect ?? null }, null, { damage, spell: id });

            if (!one.dead && spell.stun && this.random.chance(spell.stunChance ?? 1)) {
                this.#stun(caster, one, id, spell.stun);
            }
        }

        // (What it leaves on the ground round them: fire, acid, rot)
        if (spell.hazard) {
            this.#lay(caster, target.map, target.x, target.y, spell.hazard, ((spell.damage[0] + spell.damage[1]) / 2) * (caster.power?.spell ?? 1) * HAZARDS[spell.hazard.kind].share, id);
        }

        return struck.length;
    }

    // Stunned by a spell, for `ms`: whatever it was doing stops; a creature or a guard turns on
    // whoever did it
    #stun(caster, target, id, ms) {
        // (Warded against the spell's school, or magic: less long)
        if (this.#warded(target, { school: SPELLS[id]?.school ?? "magic" })) {
            ms = Math.round(ms * WARD);
        }

        target.stunnedUntil = Math.max(target.stunnedUntil, this.time + ms);
        target.casting = null;

        if (target.attack && !target.attack.struck) {
            target.attack = null;
        }

        if (target.ai === "patrol" || target.ai === "wild") {
            target.target = caster.id;
            target.lastSeen = this.time + ms;
        }

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
            const near = mighty && !other.dead && other.map === actor.map && this.hostile(other, actor) && Math.hypot(other.x - actor.x, other.y - actor.y) <= SEE_THROUGH.near && this.canSee(other, actor);

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

        if (actor.to || actor.path.length) {
            return;
        }

        const away = from && from.map === actor.map ? Math.atan2(actor.y - from.y, actor.x - from.x) : this.random.next() * Math.PI * 2;
        const angle = away + (this.random.next() - 0.5) * 1.6;
        const goal = [Math.floor(actor.x + Math.cos(angle) * 6), Math.floor(actor.y + Math.sin(angle) * 6)];

        try {
            this.#pathTo(actor, nearestFree(this.#squares(actor.map), goal, { within: 3 }));
        } catch {
            // (Nowhere to run that way: cowering, till another moment)
        }
    }

    #hit(attacker, target, attack, projectile = null, { damage: given = null, spell = null, ground = false } = {}) {
        const magic = magicOf(attack, spell);

        // Slipped (Dodge): nothing, but they know they were set on
        const dodge = !ground && attacker && attacker !== target && this.buffOf(target, "dodge");

        if (dodge && this.random.chance(SPELLS.dodge.dodge[Math.min(dodge.level, SPELLS.dodge.dodge.length) - 1])) {
            this.#emit("dodged", { id: target.id, by: attacker.id, attack: attack.id, spell, projectile });
            this.#provoke(attacker, target);

            return 0;
        }

        const blow = attack.kind === "ranged" ? "ranged" : "melee";
        const empowered = given === null && attacker?.empowered?.blow === blow ? attacker.empowered.factor : 1;
        const base = given ?? Math.max(1, Math.round(rollDamage(attack, this.random) * (attacker?.power?.[blow] ?? 1) * empowered * (1 - (target.armor ?? 0))));
        const school = spell ? (SPELLS[spell]?.school ?? "magic") : null;
        const warded = this.#warded(target, { school, element: spell ? null : elementOf(attack) });
        const factor = (!magic && this.buffOf(attacker, "surge") ? SPELLS.surge.might : 1) * (!magic && this.buffOf(target, "inertialBarrier") ? SPELLS.inertialBarrier.physical : 1) * (warded ? WARD : 1) * (this.buffOf(target, "surge") ? SPELLS.surge.exposed : 1);
        const damage = factor === 1 ? base : Math.max(1, Math.round(base * factor));

        if (empowered > 1) {
            attacker.empowered = null;
        }

        target.hp = Math.max(0, target.hp - damage);
        target.staggeredUntil = Math.max(target.staggeredUntil, this.time + attack.stagger);
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
        if (attack.knockdown && target.hp > 0) {
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
        if (attack.afflict && target.hp > 0 && this.random.chance(attack.afflict.chance)) {
            this.afflict(target.id, attack.afflict.kind, { by: attacker?.id ?? null, power: attacker?.power?.[spell ? "spell" : blow] ?? 1, look: attack.afflict.look ?? null });
        }

        if (attacker) {
            this.#provoke(attacker, target);
        }

        if (target.hp === 0) {
            this.#die(target, attacker);
        }

        // (Some of it turned back on whoever dealt it: Reflect. Never what's itself turned back)
        const reflect = !ground && !attack.reflected && attacker && attacker !== target && !attacker.dead && this.buffOf(target, "reflect");

        if (reflect) {
            this.#hit(target, attacker, { id: "reflect", kind: "spell", reaction: "arcane", stagger: 0, reflected: true }, null, { damage: Math.max(1, Math.round(damage * SPELLS.reflect.reflect)), spell: "reflect" });
        }

        return damage;
    }

    // Someone set on (struck, or a spell cast at them): they fight back (`turn`: a creature or a
    // guard turns on whoever did it), calm towards them no longer (Pacify), and hold it against
    // them a while, as do those of their own who saw
    #provoke(attacker, target, { turn = true } = {}) {
        if (turn && (target.ai === "patrol" || target.ai === "wild")) {
            target.target = attacker.id;
            target.lastSeen = this.time;
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

            for (const other of this.actors) {
                // (A creature: only its own pack)
                const own = other.team === target.team && (!target.wild || other.wild?.pack === target.wild.pack);

                if (other === target || (own && !other.neutral && !other.dead && other.map === target.map && (this.canSee(other, target) || this.canSee(other, attacker)))) {
                    other.foes[attacker.id] = until;
                }
            }
        }
    }

    #die(actor, killer) {
        actor.dead = true;
        actor.respawnAt = this.time + actor.respawnMs;
        actor.afflictions = [];
        actor.buffs = [];
        actor.drawing = null;
        actor.attack = null;
        actor.casting = null;
        actor.order = null;
        actor.path = [];
        actor.target = null;

        // Finish stepping into a square, so it lies where it fell
        if (actor.to) {
            actor.square = [...actor.to];
            actor.x = actor.to[0] + 0.5;
            actor.y = actor.to[1] + 0.5;
            actor.to = null;
        }

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
    }

    #respawn(actor) {
        const square = nearestFree(this.#squares(actor.spawnMap), actor.spawn, { taken: this.#others(actor.spawnMap, actor, { stepping: false }) });
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
            to: null,
            path: [],
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
        this.#emit("respawn", { id: actor.id, square, map: actor.map, from });
    }
}

/** The weapons table, for the interface (so it needn't import weapons.js separately). */
export { WEAPONS };
