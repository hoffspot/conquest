// The host: the one authority over a running world (docs/WAR.md).
//
// Whatever changes the world happens here, and nowhere else: the battle (battle.js) and who's in
// it; the players, however many there are, each by an id of their own; which buildings' insides
// are made and peopled, for whoever's near them; and the war between the realms (war/war.js),
// moving on as they play.
// A player's game (app/game.js) only shows the world and sends what its player does as a command
// (`command(playerId, command)`), checked here before anything's done: so a player on another
// machine can later do just the same, their commands coming over the wire (core/wire.js).
//
// Everything here is plain data and seeded random numbers, and it can all be kept and made again
// (`snapshot`, `Host.restore`) to carry on exactly as it would have: a saved world, or the world
// sent to a player joining.
//
// Pure JavaScript, no DOM: it runs in the browser of the player who's hosting, or in Node.

import { Battle, hostile, TALK_REACH } from "./battle.js";
import { Explored } from "./explored.js";
import { nearestFree, squareKey, squaresOf } from "./grid.js";
import { War } from "./war/war.js";
import { distanceBetween } from "./weapons.js";

/** The id of the player whose game the world runs in (the only one, playing alone). */
export const HOST_PLAYER = "player";

/**
 * How often (battle ms) the buildings near the players are looked over: those within `near`
 * metres of a player out in the world (or a player's heading into) got ready to go into, their
 * folk about their business inside; those `far` from every player let go.
 */
export const RELEVANCE = Object.freeze({ every: 500, near: 22, far: 90 });

/** The orc's weapon (the town's one enemy, for now). */
export const ORC_WEAPON = "cleaver";

/** What's kept of the things done by talking (the last so many). */
const KEEP_DONE = 50;

/** Bumped whenever what a snapshot holds changes, so an old one isn't read wrong. */
export const SNAPSHOT_VERSION = 1;

/** Why a command wasn't carried out (a command's { ok: false, reason }). */
export const REFUSALS = Object.freeze({
    player: "No such player.",
    dead: "The dead can't do that.",
    command: "Nothing that can be done.",
    target: "No one there to do that to.",
    link: "No way through there.",
    far: "Too far away.",
    talking: "Not talking to them.",
});

// A whole number, and a square [x, y] of whole numbers
const whole = (value) => Number.isFinite(value) && Math.floor(value) === value;
const isSquare = (value) => Array.isArray(value) && value.length === 2 && value.every(whole);
const refuse = (reason) => ({ ok: false, reason });
const OK = Object.freeze({ ok: true });

export class Host {
    /**
     * @param {object} world - From buildWorld (overworld.js) or generateWorld (world.js).
     * @param {object} [options]
     * @param {number} [options.seed] - Seeds the battle (the world's own seed to start with).
     * @param {boolean} [options.populate] - Whether the world's own people (the orc, the
     *     tavern's folk) are put in now; else by `populate()`, after whoever joins first.
     * @param {object} [options.war] - The war as it was kept (War snapshot), to carry on from;
     *     else it starts afresh (in a world with a plan: buildWorld's).
     */
    constructor(world, { seed = world.seed ?? 1, populate = true, war = null } = {}) {
        this.world = world;
        this.battle = new Battle(world, { seed });

        /** The war between the peoples (war/war.js), in a world laid out from a plan. */
        this.war = world.plan ? Host.#war(world.plan, war) : null;

        /**
         * The players, by id: { id, hero (their character: { name, shape, look, weapon, boots,
         * race }), realm (the people they're of), talks (what the folk remember of them, what
         * they've learnt: { memory, knowledge }), explored (core/explored.js) }.
         */
        this.players = new Map();

        /** The folk in the battle, by id: how each looks and talks (world.folk's, a building's). */
        this.folk = new Map();

        /** The buildings got ready to go into (by key): the ids of their folk. */
        this.open = new Map();

        /** When (battle ms) the buildings near the players are next looked over. */
        this.lookAt = 0;

        /** What's been done in the world by talking (buying, renting...): the last few. */
        this.done = [];

        // What's happened besides the battle's own (given out with them by advance)
        this.events = [];

        if (populate) {
            this.populate();
        }
    }

    // The war, carried on from how it was kept if it can be (a save from another version, or
    // another world, starts afresh)
    static #war(plan, kept) {
        try {
            return kept?.seed === (plan.seed ?? 1) ? War.restore(plan, kept) : new War(plan);
        } catch {
            return new War(plan);
        }
    }

    /** Can the world be paused? Only with no one else in it. */
    get pausable() {
        return this.players.size <= 1;
    }

    /** The world's own people: the orc on its patrol, and the tavern's folk. */
    populate() {
        const { spawns, patrol } = this.world;

        if (spawns?.orc && !this.battle.actor("orc")) {
            this.battle.add({ id: "orc", kind: "orc", name: "Orc", weapon: ORC_WEAPON, team: "orcs", square: spawns.orc, ai: "patrol", patrol });
        }

        for (const one of this.world.folk ?? []) {
            this.#addFolk(one);
        }
    }

    /**
     * A player comes into the world: { id, hero, talks, explored } (their character, as kept:
     * app/save.js), at `square` on `map` (the world's start, to begin with; the nearest free
     * square to it). Returns their record (players).
     */
    join({ id = HOST_PLAYER, hero, talks = {}, explored = {}, square = this.world.spawns?.player, map = "town" }) {
        if (this.players.has(id)) {
            return this.players.get(id);
        }

        const player = {
            id,
            hero: { ...hero },
            realm: hero.race ?? "human",
            talks: { memory: talks.memory ?? {}, knowledge: new Set(talks.knowledge ?? []) },
            explored: explored instanceof Explored ? explored : new Explored(explored),
        };
        const taken = new Set(this.battle.actors.filter((actor) => actor.map === map).map(({ square: [x, y] }) => squareKey(x, y)));
        const at = taken.size ? nearestFree(squaresOf(this.world.maps?.[map] ?? this.world), square, { taken }) : square;

        this.players.set(id, player);
        this.battle.add({ id, kind: "player", name: hero.name, weapon: hero.weapon, boots: Boolean(hero.boots), team: "town", square: at, map });
        this.#event("join", { id });

        return player;
    }

    /**
     * A player leaves: out of the battle, and their character as it's to be kept (as join takes
     * it), or null if they weren't here.
     */
    leave(id) {
        const player = this.players.get(id);

        if (!player) {
            return null;
        }

        this.battle.remove(id);
        this.players.delete(id);
        this.#event("leave", { id });

        return this.characterOf(player);
    }

    /** A player's character, as it's kept (as join takes it). */
    characterOf({ hero, talks, explored }) {
        return { hero: { ...hero }, talks: { memory: structuredClone(talks.memory), knowledge: [...talks.knowledge] }, explored: explored.toJSON() };
    }

    /**
     * Do what a player asks, if it can be done. A command is one of:
     *  - { type: "move", to: [x, y] }, { type: "ahead", facing }, { type: "engage", target },
     *    { type: "approach", target }, { type: "enter", link }, { type: "stop" }: orders for
     *    their character in the battle (battle.js command), with run: true to run;
     *  - { type: "cast", spell, target }: cast a spell (target: an id, or none for themselves);
     *  - { type: "talk", with }: start talking to one of the folk (an id), or stop (null);
     *  - { type: "effect", effect }: something done by talking (buying, paying, renting...), to
     *    whoever they're talking to.
     * Returns { ok: true } or { ok: false, reason } (a REFUSALS key; a spell's own reasons:
     * spells.js CAST_FAILURES).
     */
    command(playerId, command) {
        const player = this.players.get(playerId);
        const actor = this.battle.actor(playerId);

        if (!player || !actor) {
            return refuse("player");
        }

        if (!command || typeof command.type !== "string") {
            return refuse("command");
        }

        const run = Boolean(command.run);

        switch (command.type) {
            case "move":
                if (!isSquare(command.to)) {
                    return refuse("command");
                }

                return this.#order(actor, { type: "move", to: [...command.to], run });
            case "ahead":
                if (!Number.isFinite(command.facing)) {
                    return refuse("command");
                }

                return this.#order(actor, { type: "ahead", facing: command.facing, run });
            case "engage":
            case "approach": {
                const target = this.battle.actor(command.target);

                if (!target || target === actor || (command.type === "engage" && !hostile(actor, target))) {
                    return refuse("target");
                }

                return this.#order(actor, { type: command.type, target: target.id, run });
            }
            case "enter": {
                const link = this.battle.links.find(({ id }) => id === command.link);

                if (!link?.ends.some((end) => end.map === actor.map)) {
                    return refuse("link");
                }

                // (Heading into a building: it's got ready now)
                if (link.building) {
                    this.#openBuilding(link.building);
                }

                return this.#order(actor, { type: "enter", link: link.id, run });
            }
            case "stop":
                return this.#order(actor, { type: "stop" });
            case "cast":
                return this.battle.cast(actor.id, command.spell, command.target ?? null);
            case "talk":
                return this.#talk(actor, command.with ?? null);
            case "effect":
                return this.#effect(actor, command.effect);
            default:
                return refuse("command");
        }
    }

    /**
     * Advance the world by `ms` (the battle's whole steps: battle.js advance; the war's turns).
     * Returns what happened: the battle's events, and the host's own ("join", "leave", "open",
     * "close", "explored", "talk", "effect"; "war", with each of the war's events, and "turn",
     * once each of its turns is over).
     */
    advance(ms) {
        const events = this.battle.advance(ms);

        if (this.war) {
            const turn = this.war.turn;

            for (const event of this.war.advance(ms)) {
                this.#event("war", { event });
            }

            if (this.war.turn !== turn) {
                this.#event("turn", { turn: this.war.turn });
            }
        }

        for (const event of events) {
            // A player into a building: it's ready (if it wasn't), and the first time in, it's
            // marked on their maps
            if (event.type === "cross" && this.players.has(event.id)) {
                const building = this.world.interiors?.of(event.to);

                if (building?.entrance) {
                    this.#openBuilding(building.key);
                }

                if (building && this.players.get(event.id).explored.enter(building.key)) {
                    this.#event("explored", { id: event.id, building: building.key });
                }
            }
        }

        // Out in the world, the chunk each player's in is visited: the fog lifts off it
        for (const player of this.players.values()) {
            const actor = this.battle.actor(player.id);

            if (actor?.map === "town" && player.explored.visit(actor.x, actor.y)) {
                this.#event("explored", { id: player.id });
            }
        }

        if (this.battle.time >= this.lookAt) {
            this.lookAt = this.battle.time + RELEVANCE.every;
            this.#lookAround();
        }

        const own = this.events;

        this.events = [];

        return own.length ? [...events, ...own] : events;
    }

    /**
     * Everything the world is just now, as plain data (core/wire.js carries it): to keep, or send
     * to a player joining, and carry on from (Host.restore). The world itself isn't in it: that's
     * made again from its seed.
     */
    snapshot() {
        return {
            version: SNAPSHOT_VERSION,
            seed: this.world.seed ?? null,
            made: [...(this.world.interiors?.order ?? [])],
            open: [...this.open.keys()],
            lookAt: this.lookAt,
            battle: this.battle.snapshot(),
            war: this.war?.snapshot() ?? null,
            players: [...this.players.values()].map((player) => ({ id: player.id, realm: player.realm, ...this.characterOf(player) })),
            done: structuredClone(this.done),
        };
    }

    /**
     * The world `world` (made again from the snapshot's seed) carrying on from a snapshot: its
     * buildings' insides made again in the same order, and everyone where they were.
     */
    static restore(world, snapshot) {
        if (snapshot.version !== SNAPSHOT_VERSION) {
            throw new Error(`A world kept by another version of the game (${snapshot.version})`);
        }

        const host = new Host(world, { seed: snapshot.battle.seed, populate: false, war: snapshot.war });

        for (const key of snapshot.made) {
            if (host.#building(key)) {
                world.interiors.make(key);
            }
        }

        host.battle = Battle.restore(world, snapshot.battle);
        host.lookAt = snapshot.lookAt;
        host.done = structuredClone(snapshot.done);

        for (const one of world.folk ?? []) {
            host.folk.set(one.id, one);
        }

        for (const key of snapshot.open) {
            const building = world.interiors.buildings.get(key);

            host.open.set(key, building.folk.map(({ id }) => id));

            for (const one of building.folk) {
                host.folk.set(one.id, one);
            }
        }

        for (const { id, realm, hero, talks, explored } of snapshot.players) {
            host.players.set(id, { id, realm, hero, talks: { memory: talks.memory, knowledge: new Set(talks.knowledge) }, explored: new Explored(explored) });
        }

        return host;
    }

    // --- Commands ---

    #order(actor, order) {
        if (actor.dead) {
            return refuse("dead");
        }

        this.battle.command(actor.id, order);

        return OK;
    }

    // Start talking to one of the folk (near enough, on the same map, alive), or stop: each faces
    // the other until it's over
    #talk(actor, withId) {
        const was = actor.talkingTo;

        if (withId === null) {
            this.battle.talk(actor.id, null);

            // (They go back to what they were doing, unless they're talking to someone else now)
            if (was !== null && this.battle.actor(was)?.talkingTo === actor.id) {
                this.battle.talk(was, null);
            }

            if (was !== null) {
                this.#event("talk", { id: actor.id, with: null, was });
            }

            return OK;
        }

        const npc = this.battle.actor(withId);

        if (!npc || npc.dead || !npc.neutral || npc === actor) {
            return refuse("target");
        }

        if (actor.dead) {
            return refuse("dead");
        }

        if (npc.map !== actor.map || distanceBetween(actor.square, npc.square) > TALK_REACH.across + 1) {
            return refuse("far");
        }

        this.battle.talk(npc.id, actor.id);
        this.battle.talk(actor.id, npc.id);
        this.#event("talk", { id: actor.id, with: npc.id });

        return OK;
    }

    // Something done by talking, to whoever the player's talking to: kept (the last few), and
    // told of (an "effect" event), for the world to act on
    #effect(actor, effect) {
        if (!effect || typeof effect !== "object" || Array.isArray(effect)) {
            return refuse("command");
        }

        if (actor.talkingTo === null) {
            return refuse("talking");
        }

        const done = { ...structuredClone(effect), by: actor.talkingTo, player: actor.id, at: this.battle.time };

        this.done.push(done);
        this.done.splice(0, Math.max(0, this.done.length - KEEP_DONE));
        this.#event("effect", { id: actor.id, effect: done });

        return OK;
    }

    // --- The buildings near the players ---

    // The buildings near a player out in the world (or one a player's heading into) got ready to
    // go into; those far from every player let go (their plans are kept)
    #lookAround() {
        const interiors = this.world.interiors;

        if (!interiors) {
            return;
        }

        // Where each player is in the world: out in it, or in a building (as if at its door); and
        // the buildings they're in, or heading into (kept ready whatever)
        const places = [];
        const wanted = new Set();

        for (const player of this.players.values()) {
            const actor = this.battle.actor(player.id);

            if (!actor) {
                continue;
            }

            if (actor.map === "town") {
                places.push({ x: actor.x, y: actor.y, out: true });
            } else {
                const building = interiors.of(actor.map);
                const door = building?.entrance?.door ?? this.world.tavern?.door;

                places.push(door ? { x: door.x, y: door.z, out: false } : null);
                wanted.add(building?.key);
            }

            if (actor.order?.type === "enter") {
                wanted.add(this.battle.links.find(({ id }) => id === actor.order.link)?.building);
            }
        }

        for (const building of interiors.buildings.values()) {
            if (!building.entrance) {
                continue;
            }

            const { x, z } = building.entrance.door;
            const near = wanted.has(building.key) || places.some((place) => place?.out && Math.hypot(x - place.x, z - place.y) < RELEVANCE.near);
            const far = !wanted.has(building.key) && places.every((place) => place && Math.hypot(x - place.x, z - place.y) > RELEVANCE.far);

            if (!this.open.has(building.key) && near) {
                this.#openBuilding(building.key);
            } else if (this.open.has(building.key) && far) {
                this.#closeBuilding(building.key);
            }
        }
    }

    // A building (by key), added to the world's if it's in a settlement not laid out yet
    #building(key) {
        const interiors = this.world.interiors;

        if (!interiors) {
            return null;
        }

        if (!interiors.buildings.has(key)) {
            const place = this.world.plan?.places.find(({ id }) => id === key.slice(0, key.indexOf(":")));

            if (place) {
                this.world.maps?.town?.settlements?.of(place);
            }
        }

        return interiors.buildings.get(key) ?? null;
    }

    // Get a building ready to go into: its floors and folk made (once), and its folk about their
    // business inside
    #openBuilding(key) {
        const building = this.#building(key);

        if (!building?.entrance || this.open.has(key)) {
            return;
        }

        this.world.interiors.make(key);

        const folk = building.folk.filter((one) => this.#addFolk(one)).map(({ id }) => id);

        this.open.set(key, folk);
        this.#event("open", { key, folk });
    }

    // Let a building go: its folk out of the battle (its plans are kept, and anyone can still go
    // in: its folk come back when it's got ready again)
    #closeBuilding(key) {
        const folk = this.open.get(key);

        this.open.delete(key);

        for (const id of folk) {
            this.battle.remove(id);
            this.folk.delete(id);
        }

        this.#event("close", { key, folk });
    }

    // One of the folk, going about their business in the battle (no one fights them)
    #addFolk(one) {
        if (this.battle.actor(one.id)) {
            return false;
        }

        this.folk.set(one.id, one);
        this.battle.add({ id: one.id, kind: "folk", name: one.name, team: "folk", square: one.square, map: one.map, ai: "routine", neutral: true, routine: one.routine, role: one.role, facing: one.facing });

        return true;
    }

    #event(type, details) {
        this.events.push({ type, time: this.battle.time, ...details });
    }
}
