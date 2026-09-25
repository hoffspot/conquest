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
// An attack (weapons.js) lands its blow hitAt into it: melee attacks hit if the target is still
// within reach, ranged attacks let go of a projectile that flies to the target. Each hit rolls its
// damage and takes it off the target's hit points; at none, the target dies, and comes back to
// life at its starting point a while later (KINDS: respawn).
//
// Nothing here draws anything: every step returns events ("attack", "hit", "death"...) for the
// interface to show. Pure JavaScript with seeded random numbers, no DOM.

import { findPath, lineAhead } from "./pathfinding.js";
import { createRandom } from "./random.js";
import { rollHeal, SPELL_COOLDOWN, SPELLS } from "./spells.js";
import { chooseAttack, distanceBetween, longestReach, rollDamage, WEAPONS } from "./weapons.js";
import { nearestFree } from "./world.js";

/** The length of one step, in ms. */
export const STEP_MS = 50;

/** How far characters can see, in squares. */
export const SIGHT = 12;

/** Each kind of character: hit points, walking speed (m/s), chasing speed, and how long (ms) until it comes back after dying. */
export const KINDS = Object.freeze({
    player: { hp: 50, speed: 1.7, respawn: 5000 },
    orc: { hp: 50, speed: 1.1, chase: 1.8, respawn: 30000 },
});

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

// How often a chase finds a new path to a target that has moved (ms)
const REPATH_MS = 500;

// How long a character waits for someone in its way before finding a way round them (ms)
const BLOCKED_WAIT_MS = 400;

const same = (a, b) => a !== null && b !== null && a[0] === b[0] && a[1] === b[1];

export class Battle {
    /**
     * @param {object} world - From generateWorld (world.js): its blocked squares and spawns.
     * @param {object} [options]
     * @param {number} [options.seed] - Seeds the damage rolls.
     */
    constructor(world, { seed = 1 } = {}) {
        this.world = world;
        this.random = createRandom(seed);
        this.time = 0;
        this.actors = [];
        this.projectiles = [];
        this.events = [];
        this.lag = 0;
        this.nextProjectile = 1;
    }

    /**
     * Add a character: { id, kind (a KINDS key), name, weapon (a WEAPONS key), team, square
     * ([x, y]), ai ("patrol" for enemies), patrol ([[x, y], [x, y]]) }. It comes back to life
     * where it's added.
     */
    add({ id, kind, name = kind, weapon, team, square, ai = null, patrol = null }) {
        const type = KINDS[kind];
        const actor = {
            id,
            kind,
            name,
            weapon,
            team,
            ai,
            patrol,
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
            facing: 0,
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
            patrolIndex: 1,
            waitUntil: 0,
        };

        this.actors.push(actor);

        return actor;
    }

    actor(id) {
        return this.actors.find((actor) => actor.id === id) ?? null;
    }

    /**
     * Tell a character what to do: { type: "move", to: [x, y] } (walk there, or as near as
     * can be), { type: "ahead", facing } (straight ahead the way `facing` points, radians, as
     * far as the way is clear), { type: "engage", target: id } (go and fight it), or
     * { type: "stop" }. Moving and engaging, run: true runs there (while its stamina lasts).
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
                const goal = nearestFree(this.world.blocked, order.to);

                actor.order = { type: "move", to: goal, run: Boolean(order.run) };
                this.#pathTo(actor, goal);
                break;
            }
            case "ahead": {
                // From wherever it is (or is stepping to), square after square in a line
                const from = actor.to ? [actor.to[0] + 0.5, actor.to[1] + 0.5] : [actor.x, actor.y];
                const line = lineAhead(this.world.blocked, from, order.facing);

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
            default:
                actor.order = null;
                actor.path = [];
        }
    }

    /**
     * Have a character cast a spell (a SPELLS key), on an enemy (`target`, an id) if it's that
     * kind of spell. Returns { ok: true }, or { ok: false, reason } if it can't be cast now:
     * "cooldown", "busy" (staggered, stunned or already casting), "full" (healing at full
     * health), "dead", "target" (not an enemy), "range" or "sight" (CAST_FAILURES says them).
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
                return { ok: false, reason: "dead" };
            }

            if (target.team === actor.team) {
                return { ok: false, reason: "target" };
            }

            if (distanceBetween(actor.square, target.square) > spell.reach) {
                return { ok: false, reason: "range" };
            }

            if (!this.canSee(actor, target)) {
                return { ok: false, reason: "sight" };
            }

            actor.facing = Math.atan2(target.x - actor.x, target.y - actor.y);
        } else if (spell.heal && actor.hp >= actor.maxHp) {
            return { ok: false, reason: "full" };
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

    /** Can `a` see `b`: within SIGHT squares, with no blocked square between their middles? */
    canSee(a, b) {
        const [ax, ay] = a.square;
        const [bx, by] = b.square;
        const distance = distanceBetween(a.square, b.square);

        if (distance > SIGHT) {
            return false;
        }

        const steps = Math.ceil(distance * 4);

        for (let k = 1; k < steps; k++) {
            const x = Math.floor(ax + 0.5 + ((bx - ax) * k) / steps);
            const y = Math.floor(ay + 0.5 + ((by - ay) * k) / steps);

            if (this.world.blocked[y][x] && !(x === ax && y === ay) && !(x === bx && y === by)) {
                return false;
            }
        }

        return true;
    }

    #emit(type, details) {
        this.events.push({ type, time: this.time, ...details });
    }

    #step() {
        this.time += STEP_MS;

        for (const actor of this.actors) {
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

        if (actor.ai === "patrol") {
            this.#patrol(actor);
        } else {
            this.#obey(actor);
        }
    }

    // The player: follow orders, and attack whatever is within reach when standing still
    #obey(actor) {
        const order = actor.order;

        actor.walkPace = actor.speed;

        if (order?.type === "move") {
            if (actor.path.length || actor.to) {
                return;
            }

            actor.order = null;
        }

        if (order?.type === "engage") {
            const target = this.actor(order.target);

            if (!target || target.dead || target.team === actor.team) {
                actor.order = null;
            } else {
                this.#pursue(actor, target);

                return;
            }
        }

        if (!actor.to && !actor.path.length) {
            const target = this.#nearestEnemy(actor, (enemy) => this.#reachable(actor, enemy));

            if (target) {
                this.#attack(actor, target);
            }
        }
    }

    // An enemy: patrol, chase what it sees, attack what it catches
    #patrol(actor) {
        const seen = this.#nearestEnemy(actor, (enemy) => this.canSee(actor, enemy));

        if (seen) {
            actor.target = seen.id;
            actor.lastSeen = this.time;
        } else if (actor.target !== null && this.time - actor.lastSeen > GIVE_UP_MS) {
            actor.target = null;
            actor.path = [];
            actor.pathGoal = null;
        }

        const target = actor.target === null ? null : this.actor(actor.target);

        if (target && !target.dead) {
            actor.walkPace = actor.chaseSpeed;
            this.#pursue(actor, target);

            return;
        }

        actor.target = null;
        actor.walkPace = actor.speed;

        const goal = actor.patrol[actor.patrolIndex];

        if (same(actor.square, goal) && !actor.to) {
            if (!actor.waitUntil) {
                actor.waitUntil = this.time + PATROL_PAUSE_MS;
            } else if (this.time >= actor.waitUntil) {
                actor.waitUntil = 0;
                actor.patrolIndex = 1 - actor.patrolIndex;
            }
        } else if (!actor.path.length && !actor.to && !same(actor.pathGoal, goal)) {
            this.#pathTo(actor, goal);
        } else if (!actor.path.length && !actor.to) {
            // Couldn't get there last time (someone in the way): try again in a while
            actor.pathGoal = this.time - actor.lastPathAt > REPATH_MS ? null : actor.pathGoal;
        }
    }

    // Go after a target: attack it if it's within reach, otherwise walk towards it
    #pursue(actor, target) {
        if (this.#reachable(actor, target)) {
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

    /** Can `actor` attack `target` from where they stand (within reach, and seen for ranged)? */
    #reachable(actor, target) {
        const attack = chooseAttack(actor.weapon, actor.square, target.square);

        return attack !== null && (attack.kind === "melee" || this.canSee(actor, target));
    }

    #nearestEnemy(actor, test) {
        let best = null;
        let bestDistance = Infinity;

        for (const other of this.actors) {
            if (other.team !== actor.team && !other.dead && test(other)) {
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

    /** Is a square taken by a character other than `except` (standing on it or stepping into it)? */
    #taken([x, y], except) {
        return this.actors.some((other) => other !== except && !other.dead && ((other.square[0] === x && other.square[1] === y) || (other.to && other.to[0] === x && other.to[1] === y)));
    }

    // Find a path to `goal`, round other characters (except `through`, whose square it may end on)
    #pathTo(actor, goal, through = null) {
        const blocked = this.world.blocked;
        const marked = [];

        for (const other of this.actors) {
            if (other !== actor && other !== through && !other.dead) {
                for (const [x, y] of [other.square, other.to].filter(Boolean)) {
                    if (!blocked[y][x]) {
                        blocked[y][x] = 1;
                        marked.push([x, y]);
                    }
                }
            }
        }

        const start = actor.to ?? actor.square;
        const path = findPath(blocked, start, goal);

        for (const [x, y] of marked) {
            blocked[y][x] = 0;
        }

        // The path starts where the character is (or is stepping to)
        actor.path = path.slice(1);
        actor.pathGoal = [...goal];
        actor.lastPathAt = this.time;
        actor.blockedSince = null;
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

        if (actor.order?.type === "engage" || actor.target !== null) {
            left -= longestReach(actor.weapon);
        }

        return Math.max(0, left);
    }

    // Walk `budget` metres along the path, square by square. Returns how far it went
    #travel(actor, budget) {
        const start = budget;

        while (budget > 0) {
            if (!actor.to) {
                if (!actor.path.length || !this.#stepInto(actor)) {
                    return start - budget;
                }
            }

            const [tx, ty] = [actor.to[0] + 0.5, actor.to[1] + 0.5];
            const dx = tx - actor.x;
            const dy = ty - actor.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance <= budget) {
                actor.x = tx;
                actor.y = ty;
                actor.square = [...actor.to];
                actor.to = null;
                budget -= distance;

                // Stop as soon as the target is within reach
                if (this.#arrivedInReach(actor)) {
                    actor.path = [];

                    return start - budget;
                }
            } else {
                actor.x += (dx / distance) * budget;
                actor.y += (dy / distance) * budget;
                budget = 0;

                // Halfway across, it's on the new square
                if (Math.abs(actor.x - tx) < 0.5 && Math.abs(actor.y - ty) < 0.5) {
                    actor.square = [...actor.to];
                }
            }
        }

        return start;
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

        if (this.time < actor.readyAt) {
            return;
        }

        const attack = chooseAttack(actor.weapon, actor.square, target.square);

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

            target.hp = Math.min(target.maxHp, target.hp + rollHeal(spell, this.random));
            this.#emit("healed", { id: target.id, by: actor.id, spell: id, amount: target.hp - before, hp: target.hp, maxHp: target.maxHp });
        }

        if (spell.stun) {
            target.stunnedUntil = Math.max(target.stunnedUntil, this.time + spell.stun);
            target.casting = null;

            if (target.attack && !target.attack.struck) {
                target.attack = null;
            }

            if (target.ai === "patrol") {
                target.target = actor.id;
                target.lastSeen = this.time + spell.stun;
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

            if (!target || target.dead) {
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
        const damage = rollDamage(attack, this.random);

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
        if (attacker && target.ai === "patrol") {
            target.target = attacker.id;
            target.lastSeen = this.time;
        }

        if (target.hp === 0) {
            this.#die(target, attacker);
        }
    }

    #die(actor, killer) {
        actor.dead = true;
        actor.respawnAt = this.time + actor.respawnMs;
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
        const blocked = this.world.blocked.map((row) => Uint8Array.from(row));

        for (const other of this.actors) {
            if (other !== actor && !other.dead) {
                blocked[other.square[1]][other.square[0]] = 1;
            }
        }

        const square = nearestFree(blocked, actor.spawn);

        Object.assign(actor, {
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
            patrolIndex: 1,
            waitUntil: 0,
            pathGoal: null,
        });
        this.#emit("respawn", { id: actor.id, square });
    }
}

/** The weapons table, for the interface (so it needn't import weapons.js separately). */
export { WEAPONS };
