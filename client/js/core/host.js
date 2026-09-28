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

import { Battle, FOE_MS, TALK_REACH } from "./battle.js";
import { Explored } from "./explored.js";
import { nearestFree, squareKey, squaresOf } from "./grid.js";
import { SETTLEMENT_KINDS } from "./setpieces/town.js";
import { bannersOf, PATROL_SIZE, POSTED, postsOf, roundsOf } from "./war/muster.js";
import { ADJECTIVES } from "./war/peoples.js";
import { HOLDINGS, War } from "./war/war.js";
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

/**
 * When a town's soldiers come to life (docs/WAR.md M2): once a player's this near its edge
 * (metres, out in the world); let go once every player's this far.
 */
export const MUSTER = Object.freeze({ near: 120, far: 250 });

/** How far from its post a guard goes after an enemy (metres). */
export const LEASH = 14;

/** How long the fallen soldiers lie before they're taken away (battle ms). */
const FALLEN_MS = 10000;

/** What each people's soldiers fight with: guards the first, patrols each in turn (characters/soldiers.js dresses them to match). */
export const SOLDIERS_ARMS = Object.freeze({
    human: ["sword", "bow"],
    elf: ["bow", "sword"],
    darkElf: ["sword", "wand"],
    cat: ["gauntlets", "bow"],
    lizard: ["staff", "bow"],
    orc: ["cleaver", "cleaver"],
});

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

        /** The war between the peoples (war/war.js), in a world laid out from a plan. */
        this.war = world.plan ? Host.#war(world.plan, war) : null;
        this.battle = new Battle(world, { seed, relations: (a, b) => this.#against(a, b) });

        /**
         * The towns whose soldiers are out, near a player (by the town's id): { people (who
         * holds it), ids (its soldiers'), share (how many of its garrison each stands for),
         * banners ([{ at, facing }]) }; and each soldier (by id): { town, people, weapon, sex,
         * seed } (how they look), and the fallen, to be taken away ([{ id, at }]).
         */
        this.mustered = new Map();
        this.soldiers = new Map();
        this.fallen = [];

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
        this.battle.add({ id, kind: "player", name: hero.name, weapon: hero.weapon, boots: Boolean(hero.boots), team: player.realm, square: at, map });
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

                if (!target || target === actor || (command.type === "engage" && !this.canFight(actor, target))) {
                    return refuse("target");
                }

                // (Picking a fight with someone who's no enemy: the player holds it against them)
                if (command.type === "engage" && !this.battle.hostile(actor, target)) {
                    actor.foes[target.id] = this.battle.time + FOE_MS;
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
     * Can one fight another? An enemy, or a soldier of a people not friendly to theirs (a guard of
     * a neutral town: picking a fight with one turns its fellows against them). Never one of the
     * folk, or anyone of their own people or its allies.
     */
    canFight(actor, target) {
        if (target.neutral || target === actor) {
            return false;
        }

        if (this.battle.hostile(actor, target)) {
            return true;
        }

        return target.kind === "soldier" && target.team !== actor.team && !this.war?.friendly(actor.team, target.team);
    }

    /**
     * Advance the world by `ms` (the battle's whole steps: battle.js advance; the war's turns).
     * Returns what happened: the battle's events, and the host's own ("join", "leave", "open",
     * "close", "explored", "talk", "effect"; "war", with each of the war's events, and "turn",
     * once each of its turns is over).
     */
    advance(ms) {
        const events = this.battle.advance(ms);

        // The fallen soldiers: their garrison the fewer; taken away a while after
        for (const event of events) {
            const soldier = event.type === "death" ? this.soldiers.get(event.id) : null;

            if (soldier) {
                this.war?.loss(soldier.town, this.mustered.get(soldier.town)?.share ?? 1);
                this.fallen.push({ id: event.id, at: this.battle.time + FALLEN_MS });
            }

            // A soldier struck by someone whose people aren't at war with theirs: a grudge
            // between the peoples (and the soldier's fellows fight back: battle.js foes)
            if (event.type === "hit" && event.by && this.soldiers.has(event.id)) {
                const [struck, by] = [this.battle.actor(event.id), this.battle.actor(event.by)];

                if (struck && by && this.war?.realm(by.team) && !this.war.hostile(struck.team, by.team)) {
                    this.war.remember(struck.team, by.team, -2);
                }
            }
        }

        while (this.fallen.length && this.fallen[0].at <= this.battle.time) {
            this.#gone(this.fallen.shift().id);
        }

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
            this.#muster();
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
            mustered: [...this.mustered.entries()],
            soldiers: [...this.soldiers.entries()],
            fallen: structuredClone(this.fallen),
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

        host.battle = Battle.restore(world, snapshot.battle, { relations: (a, b) => host.#against(a, b) });
        host.lookAt = snapshot.lookAt;
        host.mustered = new Map(structuredClone(snapshot.mustered ?? []));
        host.soldiers = new Map(structuredClone(snapshot.soldiers ?? []));
        host.fallen = structuredClone(snapshot.fallen ?? []);
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

    // --- Who fights whom ---

    // Two characters on different teams (battle.js hostile asks, the folk and foes aside): as their
    // peoples stand in the war; the wild (the orc, the camps' foes: no people's) set against the
    // players, and not the peoples' soldiers; anyone, without a war
    #against(a, b) {
        const war = this.war;
        const [ra, rb] = [war?.realm(a.team), war?.realm(b.team)];

        if (ra && rb) {
            return war.hostile(a.team, b.team);
        }

        if (ra || rb) {
            return a.kind === "player" || b.kind === "player";
        }

        return true;
    }

    // --- The war come to life ---

    // Where the players are out in the world (and those in buildings, at their doors)
    #whereabouts() {
        const interiors = this.world.interiors;
        const places = [];

        for (const player of this.players.values()) {
            const actor = this.battle.actor(player.id);

            if (actor?.map === "town") {
                places.push([actor.x, actor.y]);
            } else if (actor) {
                const door = interiors?.of(actor.map)?.entrance?.door ?? this.world.tavern?.door;

                if (door) {
                    places.push([door.x, door.z]);
                }
            }
        }

        return places;
    }

    // Each town the war's fought over, near a player: its soldiers out (again, if it's changed
    // hands); and those far from every player let go
    #muster() {
        const war = this.war;

        if (!war || !this.world.maps?.town?.chunk) {
            return;
        }

        const places = this.#whereabouts();

        for (const town of war.towns) {
            const place = this.#placeOf(town.id);
            const middle = this.#middleOf(place);
            const edge = SETTLEMENT_KINDS[place.kind].radius;
            const distances = places.map(([x, y]) => Math.hypot(x - middle[0], y - middle[1]) - edge);
            const mustered = this.mustered.get(town.id);

            if (mustered && (mustered.people !== town.owner || distances.every((distance) => distance > MUSTER.far))) {
                this.#dismiss(town.id);
            }

            if (!this.mustered.has(town.id) && distances.some((distance) => distance < MUSTER.near)) {
                this.#raise(town, place, middle);
            }
        }
    }

    #placeOf(id) {
        return this.world.plan.places.find((place) => place.id === id);
    }

    // Where a place's middle is: the town the player starts in is set in a little off its place
    #middleOf(place) {
        return place.id === this.world.start?.id && this.world.stamp?.middle ? this.world.stamp.middle : place.at;
    }

    // A town's soldiers out: its guards at their posts, as many as its garrison has (up to its
    // posts), and its patrols on their rounds (as many as it has, while its garrison's half full)
    #raise(town, place, middle) {
        const map = this.world.maps.town;
        const squares = squaresOf(map);
        const full = HOLDINGS[town.kind].garrison;
        const posts = postsOf(this.world.plan, place, { middle });
        const guards = Math.min(posts.length, Math.ceil((town.garrison / full) * POSTED[town.kind]));
        const rounds = roundsOf(this.world.plan, place, { middle }).slice(0, town.garrison * 2 >= full ? undefined : 0);
        const shown = guards + rounds.length * PATROL_SIZE;
        const [guardArms, patrolArms] = SOLDIERS_ARMS[town.owner] ?? SOLDIERS_ARMS.human;
        const taken = new Set(this.battle.actors.filter((actor) => actor.map === "town").map(({ square: [x, y] }) => squareKey(x, y)));
        const free = ([x, y]) => {
            const square = nearestFree(squares, [Math.floor(x), Math.floor(y)], { taken, within: 24 });

            taken.add(squareKey(...square));

            return square;
        };
        const ids = [];
        const enlist = (id, weapon, square, orders) => {
            const seed = [...id].reduce((hash, character) => (Math.imul(hash, 31) + character.charCodeAt(0)) | 0, this.world.seed ?? 1) >>> 0;
            const sex = seed % 4 === 0 ? "f" : "m";

            this.soldiers.set(id, { town: town.id, people: town.owner, weapon, sex, seed });
            this.battle.add({ id, kind: "soldier", name: `${ADJECTIVES[town.owner][0].toUpperCase()}${ADJECTIVES[town.owner].slice(1)} ${orders.patrol.length > 1 ? "patrol" : "guard"}`, weapon, team: town.owner, square, ai: "patrol", role: "guard", ...orders });
            ids.push(id);
        };

        if (!shown) {
            return;
        }

        try {
            for (const [k, post] of posts.slice(0, guards).entries()) {
                const square = free(post.at);

                enlist(`${town.id}/guard-${k}`, guardArms, square, { patrol: [square], leash: LEASH, facing: post.facing });
            }

            for (const [k, round] of rounds.entries()) {
                const points = round.map((point) => nearestFree(squares, [Math.floor(point[0]), Math.floor(point[1])], { within: 24 }));

                for (let m = 0; m < PATROL_SIZE; m++) {
                    enlist(`${town.id}/patrol-${k}-${m}`, m % 2 ? patrolArms : guardArms, free(points[0]), { patrol: points, leash: LEASH * 2 });
                }
            }
        } catch {
            // (No free ground there: those found are out, and no more)
        }

        const banners = bannersOf(this.world.plan, place, { middle }).slice(0, Math.ceil(guards / 2));

        this.mustered.set(town.id, { people: town.owner, ids, share: town.garrison / Math.max(1, ids.length), banners });
        this.#event("muster", { town: town.id, people: town.owner, ids, banners });
    }

    // A town's soldiers let go (its garrison's as the war has it)
    #dismiss(townId) {
        const { ids } = this.mustered.get(townId);

        this.mustered.delete(townId);

        for (const id of ids) {
            this.battle.remove(id);
            this.soldiers.delete(id);
        }

        this.fallen = this.fallen.filter(({ id }) => !ids.includes(id));
        this.#event("dismiss", { town: townId, ids });
    }

    // A fallen soldier taken away
    #gone(id) {
        const soldier = this.soldiers.get(id);

        this.battle.remove(id);
        this.soldiers.delete(id);

        const mustered = soldier && this.mustered.get(soldier.town);

        if (mustered) {
            mustered.ids = mustered.ids.filter((each) => each !== id);
        }

        this.#event("gone", { id });
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

        if (!npc || npc.dead || npc === actor || !(npc.neutral || (npc.kind === "soldier" && !this.battle.hostile(npc, actor)))) {
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
