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
// An attack (weapons.js) lands its blow hitAt into it: melee attacks hit if the target is still
// within reach, ranged attacks let go of a projectile that flies to the target. Each hit rolls its
// damage and takes it off the target's hit points; at none, the target dies, and comes back to
// life at its starting point a while later (KINDS: respawn).
//
// Nothing here draws anything: every step returns events ("attack", "hit", "death"...) for the
// interface to show. Pure JavaScript with seeded random numbers, no DOM.

import { findPath } from "./pathfinding.js";
import { createRandom } from "./random.js";
import { chooseAttack, distanceBetween, rollDamage, WEAPONS } from "./weapons.js";
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
            pace: type.speed,
            // Which way it faces: radians from south (+y), turning towards east (+x)
            facing: 0,
            order: null,
            attack: null,
            readyAt: 0,
            staggeredUntil: 0,
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
     * can be), { type: "engage", target: id } (go and fight it), or { type: "stop" }.
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

                actor.order = { type: "move", to: goal };
                this.#pathTo(actor, goal);
                break;
            }
            case "engage":
                actor.order = { type: "engage", target: order.target };
                actor.pathGoal = null;
                break;
            default:
                actor.order = null;
                actor.path = [];
        }
    }

    /** Advance by `ms` (whole steps; the rest carries over). Returns the events that happened. */
    advance(ms) {
        this.lag += ms;
        this.events = [];

        while (this.lag >= STEP_MS) {
            this.lag -= STEP_MS;
            this.#step();
        }

        return this.events;
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

        if (this.time < actor.staggeredUntil || actor.attack) {
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

        actor.pace = actor.speed;

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
            actor.pace = actor.chaseSpeed;
            this.#pursue(actor, target);

            return;
        }

        actor.target = null;
        actor.pace = actor.speed;

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
        if (actor.dead || this.time < actor.staggeredUntil || (actor.attack && !actor.to)) {
            return;
        }

        let budget = (actor.pace * STEP_MS) / 1000;

        while (budget > 0) {
            if (!actor.to) {
                if (!actor.path.length || !this.#stepInto(actor)) {
                    return;
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

                    return;
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
            square,
            x: square[0] + 0.5,
            y: square[1] + 0.5,
            to: null,
            path: [],
            facing: 0,
            attack: null,
            readyAt: this.time,
            staggeredUntil: 0,
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
