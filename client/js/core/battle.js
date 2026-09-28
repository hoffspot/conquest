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

import { nearestFree, squareKey, squaresOf } from "./grid.js";
import { routeBetween } from "./interiors.js";
import { findPath, lineAhead } from "./pathfinding.js";
import { createRandom } from "./random.js";
import { BECKON, REST_EVERY, ROLES } from "./roles.js";
import { rollHeal, SPELL_COOLDOWN, SPELLS } from "./spells.js";
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
            // when it can cast another
            stunnedUntil: 0,
            casting: null,
            spellReadyAt: 0,
            dead: false,
            respawnAt: 0,
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

    /** Mend a character's hurts (`hp`) and fill its stamina (`stamina`), as far as they go ("healed" if it's hurts). */
    mend(id, { hp = 0, stamina = 0 } = {}) {
        const actor = this.actor(id);

        if (!actor || actor.dead) {
            return;
        }

        if (hp > 0) {
            const before = actor.hp;

            actor.hp = Math.min(actor.maxHp, actor.hp + hp);
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

        if (a.team === b.team) {
            return false;
        }

        return this.relations ? this.relations(a, b) : true;
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
        };
    }

    /** A battle on `world` carrying on from a snapshot (snapshot()), its teams standing as `relations` has them. */
    static restore(world, snapshot, { relations = null } = {}) {
        const battle = new Battle(world, { seed: snapshot.seed, relations });

        Object.assign(battle, { time: snapshot.time, lag: snapshot.lag, nextProjectile: snapshot.nextProjectile, projectiles: structuredClone(snapshot.projectiles) });
        battle.random.state = snapshot.random;
        battle.actors = snapshot.actors.map(({ chance: state, restVariety, steering, ...kept }) => {
            const actor = structuredClone(kept);
            const chance = createRandom(0);

            chance.state = state;

            return Object.assign(actor, { chance, restVariety: new Variety(() => chance.next(), restVariety), steering: steering ? { ...structuredClone(steering), path: actor.path } : null });
        });

        return battle;
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
                const goal = nearestFree(this.#squares(actor.map), order.to);

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
     * Have a character cast a spell (a SPELLS key), on an enemy (`target`, an id) if it's that
     * kind of spell. Returns { ok: true }, or { ok: false, reason } if it can't be cast now:
     * "cooldown", "busy" (staggered, stunned or already casting), "healthy" (healing at full
     * health), "lifeless" (no one living there), "friendly" (not an enemy), "range" or "sight"
     * (CAST_FAILURES says them: none of them the host's own refusals, host.js REFUSALS, but for
     * the cooldown, which is the same).
     */
    cast(id, spellId, targetId = null) {
        const actor = this.actor(id);
        const spell = SPELLS[spellId];

        if (!actor || !spell || actor.dead) {
            return { ok: false, reason: "busy" };
        }

        if (this.time < actor.spellReadyAt) {
            return { ok: false, reason: "cooldown" };
        }

        if (this.time < actor.staggeredUntil || this.time < actor.stunnedUntil || actor.casting) {
            return { ok: false, reason: "busy" };
        }

        let target = actor;

        if (spell.target === "enemy") {
            target = this.actor(targetId);

            if (!target || target.dead) {
                return { ok: false, reason: "lifeless" };
            }

            if (!this.hostile(actor, target)) {
                return { ok: false, reason: "friendly" };
            }

            if (distanceBetween(actor.square, target.square) > spell.reach) {
                return { ok: false, reason: "range" };
            }

            if (!this.canSee(actor, target)) {
                return { ok: false, reason: "sight" };
            }

            actor.facing = Math.atan2(target.x - actor.x, target.y - actor.y);
        } else if (spell.heal && actor.hp >= actor.maxHp) {
            return { ok: false, reason: "healthy" };
        }

        // Casting calls off an attack
        actor.attack = null;
        actor.casting = { spell: spellId, target: target.id, start: this.time, landsAt: this.time + spell.castTime };
        actor.spellReadyAt = this.time + SPELL_COOLDOWN;
        this.#emit("cast", { id: actor.id, spell: spellId, target: target.id, castTime: spell.castTime });

        return { ok: true };
    }

    /** How long until a character can cast a spell again, as a share of the cooldown (0: ready). */
    cooldown(id) {
        const actor = this.actor(id);

        return actor ? Math.max(0, Math.min(1, (actor.spellReadyAt - this.time) / SPELL_COOLDOWN)) : 0;
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

    // Is any square `marked` (x, y) on the way between two squares (not counting them)?
    #between(marked, [ax, ay], [bx, by], distance = distanceBetween([ax, ay], [bx, by])) {
        const steps = Math.ceil(distance * 4);

        for (let k = 1; k < steps; k++) {
            const x = Math.floor(ax + 0.5 + ((bx - ax) * k) / steps);
            const y = Math.floor(ay + 0.5 + ((by - ay) * k) / steps);

            if (marked(x, y) && !(x === ax && y === ay) && !(x === bx && y === by)) {
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

        return this.actors.some((other) => this.hostile(other, actor) && !other.dead && other.map === actor.map && (other.target === actor.id || other.attack?.target === actor.id || (other.order?.type === "engage" && other.order.target === actor.id) || this.canSee(actor, other)));
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

        if (partner && !partner.dead && partner.map === actor.map && actor.kind === "soldier" && !this.#nearestEnemy(actor, (enemy) => this.canSee(actor, enemy))) {
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

        if (!actor.to && !actor.path.length) {
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
        const seen = this.#nearestEnemy(actor, (enemy) => this.canSee(actor, enemy) && this.#leashed(actor, enemy));
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
        const seen = this.#nearestEnemy(actor, (enemy) => leashed(enemy) && this.canSee(actor, enemy) && rouses(enemy));

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
        const seen = this.#nearestEnemy(actor, (enemy) => this.canSee(actor, enemy) && (distanceBetween(leader.square, enemy.square) <= FOLLOW.guard || enemy.target === actor.id || enemy.attack?.target === actor.id));

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

    #nearestEnemy(actor, test) {
        let best = null;
        let bestDistance = Infinity;

        for (const other of this.actors) {
            if (this.hostile(other, actor) && !other.dead && other.map === actor.map && test(other)) {
                const distance = distanceBetween(actor.square, other.square);

                if (distance < bestDistance) {
                    best = other;
                    bestDistance = distance;
                }
            }
        }

        return best;
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
        const travelled = held ? 0 : this.#travel(actor, actor.pace * seconds);

        // Standing still, it starts again from a walk
        if (travelled === 0) {
            actor.pace = walk;
        }

        // Running uses stamina, anything else gets it back (in hundredths, so it adds up exactly)
        actor.running = run && travelled > 0;

        const stamina = actor.stamina + (actor.running ? -STAMINA_DRAIN : STAMINA_RECOVERY) * seconds;

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

    // A spell lands: healing, or stunning its target (who then turns on the caster)
    #land(actor) {
        const { spell: id, target: targetId } = actor.casting;
        const spell = SPELLS[id];
        const target = this.actor(targetId);

        actor.casting = null;

        if (!target || target.dead) {
            return;
        }

        if (spell.heal) {
            const before = target.hp;

            target.hp = Math.min(target.maxHp, target.hp + Math.round(rollHeal(spell, this.random) * (actor.power?.heal ?? 1)));
            this.#emit("healed", { id: target.id, by: actor.id, spell: id, amount: target.hp - before, hp: target.hp, maxHp: target.maxHp });
        }

        if (spell.stun) {
            const stun = Math.round(spell.stun * (actor.power?.stun ?? 1));

            target.stunnedUntil = Math.max(target.stunnedUntil, this.time + stun);
            target.casting = null;

            if (target.attack && !target.attack.struck) {
                target.attack = null;
            }

            if (target.ai === "patrol" || target.ai === "wild") {
                target.target = actor.id;
                target.lastSeen = this.time + stun;
            }

            this.#emit("stunned", { id: target.id, by: actor.id, spell: id, until: target.stunnedUntil });
        }
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
            } else {
                projectile.x += (dx / distance) * travel;
                projectile.y += (dy / distance) * travel;
            }
        }
    }

    #hit(attacker, target, attack, projectile = null) {
        // A blow as strong as the attacker's power for its kind (and its next blow made stronger,
        // if it is), less what the target's armour takes off: never less than 1
        const blow = attack.kind === "ranged" ? "ranged" : "melee";
        const empowered = attacker?.empowered?.blow === blow ? attacker.empowered.factor : 1;
        const damage = Math.max(1, Math.round(rollDamage(attack, this.random) * (attacker?.power?.[blow] ?? 1) * empowered * (1 - (target.armor ?? 0))));

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
        });

        // Whoever is hit fights back
        if (attacker && (target.ai === "patrol" || target.ai === "wild")) {
            target.target = attacker.id;
            target.lastSeen = this.time;
        }

        // And holds it against whoever struck it for a while, as do those of its own who saw
        if (attacker && attacker.team !== target.team) {
            const until = this.time + FOE_MS;

            for (const other of this.actors) {
                // (A creature: only its own pack)
                const own = other.team === target.team && (!target.wild || other.wild?.pack === target.wild.pack);

                if (other === target || (own && !other.neutral && !other.dead && other.map === target.map && (this.canSee(other, target) || this.canSee(other, attacker)))) {
                    other.foes[attacker.id] = until;
                }
            }
        }

        if (target.hp === 0) {
            this.#die(target, attacker);
        }
    }

    #die(actor, killer) {
        actor.dead = true;
        actor.respawnAt = this.time + actor.respawnMs;
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
            casting: null,
            spellReadyAt: this.time,
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
