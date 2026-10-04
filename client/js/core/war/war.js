// The war for the continent, played out as numbers (docs/WAR.md): the six peoples' realms, the
// towns they hold and the garrisons in them, their treasuries, the forces they send out
// (expeditions that camp by an enemy's town and raid it, then take it; relief for a town under
// threat; envoys between the rulers), what they think of each other, and who's brought whom
// under them.
//
// It moves on a turn at a time (TURN_MS of play: advance), each realm's rulers deciding what to
// do by their traits (peoples.js). How far the war's got (its stage) goes up with the players'
// might and, slowly, with time, and says what can be taken: so no great army comes over the hill
// while the players are still learning their trade.
//
// Near a player the war comes to life (from docs/WAR.md M2): its garrisons, patrols and camps are
// real people in the battle, and what happens to them is told back here (loss, remember).
//
// Everything is plain data with seeded random numbers, kept and made again (snapshot, restore),
// the same in the browser and in Node. What happened each turn comes back as events, for the war
// viewer, the news (news.js) and, later, the world.

import { createRandom } from "../random.js";
import { RACES } from "../worldplan/races.js";
import { REALMS, rollLeader } from "./peoples.js";
import { Roads } from "./roads.js";
import { hypot } from "../exact.js";

/** A turn every so much play (ms). */
export const TURN_MS = 60000;

/**
 * What the places the war's fought over are worth (the plan's hamlets and farmsteads go with the
 * town nearest them): the garrison each holds when it's full, the taxes it pays a turn, how much
 * its walls help its defenders, and how many patrols go out from it (from M2).
 */
export const HOLDINGS = Object.freeze({
    capital: { garrison: 40, tax: 6, walls: 1.6, patrols: 3, worth: 4 },
    city: { garrison: 24, tax: 4, walls: 1.35, patrols: 2, worth: 3 },
    town: { garrison: 12, tax: 2, walls: 1.15, patrols: 1, worth: 2 },
    village: { garrison: 5, tax: 1, walls: 1, patrols: 1, worth: 1 },
});

/**
 * How far the war's got. Each stage says what can be taken (its camps only raid the rest), how
 * big an expedition can be, and how many each realm can have out at once. It comes with the
 * players' might (`might`: the strongest's), or after TURNS_PER_STAGE turns each whatever, and
 * never goes back.
 */
export const STAGES = Object.freeze([
    { id: "unease", name: "An uneasy peace", take: [], most: 8, fielded: 1, might: 0 },
    { id: "border", name: "Border wars", take: ["village"], most: 16, fielded: 2, might: 2 },
    { id: "war", name: "War", take: ["village", "town", "city"], most: 30, fielded: 3, might: 4 },
    { id: "conquest", name: "Conquest", take: ["village", "town", "city", "capital"], most: 60, fielded: 4, might: 6 },
]);
export const TURNS_PER_STAGE = 90;

/** What things cost (gold): a troop raised, a troop's keep a turn, an envoy; and what a realm starts with. */
export const COSTS = Object.freeze({ troop: 5, upkeep: 0.1, envoy: 10, start: 60 });

/** How far forces go in a turn (metres). */
export const SPEEDS = Object.freeze({ march: 250, envoy: 400 });

/** How many turns a camp sits before its town before it can storm it (raiding meanwhile). */
export const SIEGE = 3;

/** How likely a camp is to raid its town each turn it doesn't storm it. */
export const RAIDING = 0.4;

/**
 * How many turns a camp's sortie against a town a player's near (a raid or an assault, played out
 * in the world: M6) may go on before the rest of it is reckoned here.
 */
export const SORTIE_TURNS = 3;

/**
 * How near (metres): two peoples' towns or forces for them to meet; an expedition to its target
 * to camp; a relief force to the camp it's after, to fall on it; an enemy force to an envoy, to
 * waylay it; an enemy camp to a town, to threaten it.
 */
export const REACH = Object.freeze({ sight: 1500, camp: 350, fall: 120, waylay: 300, threat: 1000 });

/** A vassal's share of its taxes paid to its overlord. */
export const TRIBUTE = 0.5;

/** How many turns a vassal serves before it might rise against its overlord. */
export const SERVES = 60;

/**
 * A people's rising (docs/WAR.md M10). Serving another, or fallen, its unrest grows towards `ready`:
 * by `perTurn` while it serves (and by `grudge` more if it bears its overlord a grudge), and by
 * what its players do (stir). Ready, it rises; a player's counsel can call it sooner (as early
 * as `early` of the way for the weightiest). A fallen people rises in one of its old towns, held
 * by `garrison` of the soldiers a town of its kind keeps.
 */
export const RISING = Object.freeze({ ready: 100, perTurn: 0.25, grudge: 0.25, early: 0.5, garrison: 0.6 });

/** How many turns a player's counsel is heeded (if it's not been acted on sooner). */
export const COUNSEL_TURNS = 20;

/** Bumped whenever what a snapshot holds changes. */
export const WAR_VERSION = 1;

// How many things that happened are kept (the log)
const KEEP_LOG = 300;

// The kinds of place fought over
const FOUGHT_OVER = Object.keys(HOLDINGS);

const apart = ([ax, ay], [bx, by]) => hypot(ax - bx, ay - by);
const pair = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

export class War {
    /**
     * @param {object} plan - The world plan (worldplan/plan.js planWorld).
     * @param {object} [options]
     * @param {number} [options.seed] - Seeds the war's chances (the plan's seed to start with).
     */
    constructor(plan, { seed = plan.seed ?? 1 } = {}) {
        this.plan = plan;
        this.roads = new Roads(plan);
        this.random = createRandom((seed * 7919 + 104729) >>> 0);
        this.seed = seed;

        /** Turns played, the play since the last (ms), the stage, and the strongest player's might. */
        this.turn = 0;
        this.clock = 0;
        this.stage = 0;
        this.might = 0;

        /**
         * Each people's realm (in RACES order): { id, race, name, capital (its capital's id), seat
         * (where its rulers sit now), leader ({ name, title, woman, traits }), treasury,
         * overlord (a realm's id, or null), since (the turn it last changed hands), standing (what
         * it thinks of each other realm: grudges below 0, favours above), counsel (a player's,
         * heeded for a while: counsel()), unrest (towards rising, serving or fallen: RISING),
         * alive }.
         */
        this.realms = RACES.map((race) => {
            const capital = plan.places.find((place) => place.race === race.id && place.kind === "capital");

            return {
                id: race.id,
                race: race.id,
                name: `the ${REALMS[race.id].realm} of ${capital.name}`,
                capital: capital.id,
                seat: capital.id,
                leader: rollLeader(race.id, this.random),
                treasury: COSTS.start,
                overlord: null,
                since: 0,
                standing: {},
                counsel: null,
                unrest: 0,
                alive: true,
            };
        });

        /** The places fought over: { id, kind, name, at, race (whose it was), owner, garrison, raidedAt }. */
        this.towns = plan.places
            .filter(({ kind }) => FOUGHT_OVER.includes(kind))
            .map(({ id, kind, name, at, race }) => ({ id, kind, name, at: [...at], race, owner: race, garrison: HOLDINGS[kind].garrison, raidedAt: -Infinity }));

        /**
         * The forces out in the world: { id, realm, kind ("expedition", "camp", "relief",
         * "envoy"), size, at ([x, y] metres), path (the way it's going), leg (the point on it it's
         * gone past), target (a town's id; a camp's, for relief; a realm's, for an envoy), home
         * (the town it set out from), mission and about (an envoy's), since (the turn it set out) }.
         */
        this.forces = [];
        this.nextForce = 1;

        /** Between each two realms that have met (by pair key): { state: "neutral", "allied" or "hostile", since }. */
        this.relations = {};

        /** Which realms have met (pair keys). */
        this.known = [];

        /** Who's won (a realm whose every rival serves it), if anyone has. */
        this.victor = null;

        /** What's happened (the last KEEP_LOG events), and what's happened since advance last returned. */
        this.log = [];
        this.events = [];

        /**
         * The towns a player's near (their ids: watch()). What a camp does against one of them is
         * played out in the world (a sortie: settle()), not reckoned here.
         */
        this.watched = new Set();

        /**
         * The places worth finding whose occupiers were put to the sword (core/places.js): by the
         * place's id, { cleared: the turn it was, times: how often it's been }. Empty a while, then
         * held again (places.js holderOf).
         */
        this.places = {};

        this.#discover({ quietly: true });
    }

    // --- Looking things up ---

    realm(id) {
        return this.realms.find((realm) => realm.id === id) ?? null;
    }

    town(id) {
        return this.towns.find((town) => town.id === id) ?? null;
    }

    force(id) {
        return this.forces.find((force) => force.id === id) ?? null;
    }

    /** The realm at the top of whoever a realm serves (itself, if no one). */
    liege(id) {
        let realm = this.realm(id);

        while (realm?.overlord) {
            realm = this.realm(realm.overlord);
        }

        return realm?.id ?? id;
    }

    /** The realms that serve a realm (directly). */
    vassalsOf(id) {
        return this.realms.filter((realm) => realm.overlord === id);
    }

    /** Have two realms met? */
    knows(a, b) {
        return a === b || this.known.includes(pair(a, b));
    }

    /**
     * How realm `a` stands with `b`: "self", "overlord" (b rules a), "vassal" (a rules b),
     * "unknown" (they've never met), or as their lieges stand: "allied", "neutral" or "hostile"
     * (realms under the same liege are allied).
     */
    relation(a, b) {
        if (a === b) {
            return "self";
        }

        if (this.realm(a)?.overlord === b) {
            return "overlord";
        }

        if (this.realm(b)?.overlord === a) {
            return "vassal";
        }

        const [la, lb] = [this.liege(a), this.liege(b)];

        if (la === lb) {
            return "allied";
        }

        const between = this.relations[pair(la, lb)];

        if (!between && !this.knows(la, lb) && !this.knows(a, b)) {
            return "unknown";
        }

        return between?.state ?? "neutral";
    }

    /** Are two realms at war (by their lieges)? */
    hostile(a, b) {
        return this.relation(a, b) === "hostile";
    }

    /** Do two realms fight side by side (allies, or under the same liege)? */
    friendly(a, b) {
        return ["self", "allied", "vassal", "overlord"].includes(this.relation(a, b));
    }

    /** A realm's own forces: its garrisons and those it has out (envoys aside). */
    power(id) {
        return this.towns.filter(({ owner }) => owner === id).reduce((sum, { garrison }) => sum + garrison, 0) + this.forces.filter(({ realm, kind }) => realm === id && kind !== "envoy").reduce((sum, { size }) => sum + size, 0);
    }

    /** A liege's strength: its own and all its vassals' (and theirs). */
    strength(id) {
        return this.realms.filter((realm) => realm.alive && this.liege(realm.id) === id).reduce((sum, realm) => sum + this.power(realm.id), 0);
    }

    /** Whom a realm's at war with (lieges). */
    enemiesOf(id) {
        return this.realms.filter((realm) => realm.alive && !realm.overlord && this.hostile(id, realm.id)).map(({ id: enemy }) => enemy);
    }

    /** The town that holds a point, for the plan's hamlets and farmsteads (and any spot): the nearest. */
    holdingAt(at) {
        let best = null;

        for (const town of this.towns) {
            if (!best || apart(at, town.at) < apart(at, best.at)) {
                best = town;
            }
        }

        return best;
    }

    // --- Moving on ---

    /**
     * Play on for `ms` (a turn every TURN_MS). Returns what happened: events ({ type, turn, ...}:
     * news.js tells them).
     */
    advance(ms) {
        this.clock += ms;

        while (this.clock >= TURN_MS) {
            this.clock -= TURN_MS;
            this.step();
        }

        const events = this.events;

        this.events = [];

        return events;
    }

    /** Play one turn (advance does, every TURN_MS). */
    step() {
        this.turn++;
        this.#stageUp();
        this.#discover();
        this.#collect();
        this.#fade();

        for (const realm of this.realms) {
            if (realm.alive && !realm.overlord) {
                this.#decide(realm);
            }
        }

        this.#march();
        this.#camps();
        this.#waylay();
        this.#rebel();
        this.#reckon();
    }

    /** The strongest player's might (0 to 8, from their skills, gear and followers): the war comes on with it. */
    setMight(might) {
        this.might = Math.max(0, Number(might) || 0);
    }

    /**
     * Losses in a fight played out in the world (from M6): a town's garrison or a force (by id)
     * loses `count`. A garrison or camp with none left is taken or broken at the next turn.
     */
    loss(id, count) {
        const town = this.town(id);
        const force = town ? null : this.force(id);
        const lost = Math.max(0, Math.round(count));

        if (town) {
            town.garrison = Math.max(0, town.garrison - lost);
        } else if (force) {
            force.size = Math.max(0, force.size - lost);
        }
    }

    /**
     * The towns and envoys a player's near (ids): a camp's raids and assaults on those towns are
     * played out in the world, and those envoys go on it (move), as fast as they walk.
     */
    watch(ids) {
        this.watched = new Set(ids);
    }

    /** A place's occupiers put to the sword and their leader killed (core/places.js): cleared this turn. */
    clearPlace(id) {
        this.places[id] = { cleared: this.turn, times: (this.places[id]?.times ?? 0) + 1 };
    }

    /**
     * An envoy a player's near, where it's got to in the world: `at` ([x, y] metres), past the
     * point `leg` of its path. At the end of it, it's heard (and gone). Returns whether it's arrived.
     */
    move(id, at, leg) {
        const envoy = this.force(id);

        if (envoy?.kind !== "envoy") {
            return false;
        }

        envoy.at = [Math.round(at[0] * 10) / 10, Math.round(at[1] * 10) / 10];
        envoy.leg = Math.max(envoy.leg, Math.min(leg, envoy.path.length - 1));

        if (envoy.leg >= envoy.path.length - 1) {
            this.#hear(envoy);

            return true;
        }

        return false;
    }

    /**
     * An envoy struck down in the world by one of the people `by` (a realm's id): what it carried
     * comes to nothing, and its people bear them a grudge for it.
     */
    waylaid(id, by) {
        const envoy = this.force(id);

        if (envoy?.kind !== "envoy") {
            return;
        }

        this.forces.splice(this.forces.indexOf(envoy), 1);

        if (this.realm(by)) {
            this.remember(envoy.realm, by, -10);
        }

        this.#emit("waylaid", { realm: envoy.realm, by: this.realm(by) ? by : null, to: envoy.target, mission: envoy.mission, force: envoy.id, played: true });
    }

    /**
     * A camp's sortie (a raid or an assault on its town, played out in the world near a player)
     * over: its losses and the town's are in already (loss). A raid that `reached` the town's
     * fields stops its taxes; an assault that left no one in the town takes it. With `reckon`, what's
     * left of it is fought out here instead (the players gone). Returns how it ended: "raided",
     * "repulsed", "taken", "broken", or null if the camp had none out.
     */
    settle(id, { reached = false, reckon = false } = {}) {
        const camp = this.force(id);
        const sortie = camp?.sortie;

        if (!sortie) {
            return null;
        }

        camp.sortie = null;

        const town = this.town(camp.target);

        if (!town) {
            return null;
        }

        const killed = Math.max(0, sortie.garrison - town.garrison);
        const lost = Math.max(0, sortie.size - camp.size);

        if (reckon) {
            return sortie.kind === "assault" ? this.#assault(camp, town, { killed, lost }) : this.#raid(camp, town, { killed, lost });
        }

        let result = "repulsed";

        if (sortie.kind === "raid") {
            if (reached) {
                town.raidedAt = this.turn;
                this.remember(town.owner, camp.realm, -3);
                result = "raided";
            }

            this.#emit("raid", { realm: camp.realm, town: town.id, owner: town.owner, killed, lost, reached, played: true });
        } else {
            const won = town.garrison <= 0 && camp.size > 0;

            this.remember(town.owner, camp.realm, -5);
            this.#emit("assault", { realm: camp.realm, town: town.id, owner: town.owner, won, killed, lost, played: true });

            if (won) {
                this.#take(town, camp);

                return "taken";
            }
        }

        if (camp.size < 3) {
            this.forces.splice(this.forces.indexOf(camp), 1);
            this.#emit("broken", { realm: camp.realm, target: town.id });

            return "broken";
        }

        return result;
    }

    /** Gold given to a realm's treasury (a player's tithe). Returns whether it was taken. */
    give(id, amount) {
        const realm = this.realm(id);

        if (!realm?.alive || !(amount > 0)) {
            return false;
        }

        realm.treasury += amount;

        return true;
    }

    /**
     * A player's counsel to a realm's rulers (not a vassal's: its overlord's decide), weighing
     * `weight` (0 to 1, by their standing: core/standing.js COUNSEL):
     * - { march: a town's id }: the next expedition sent against it (one of an enemy's towns);
     * - { peace: a realm's id }: an envoy sent to it for a truce (a realm they're at war with);
     * - { war: a realm's id }: war declared on it (a realm they know, and are neutral with).
     * Heeded for COUNSEL_TURNS, or until it's acted on; a newer counsel takes the place of the
     * last. Returns whether it could be given.
     */
    counsel(id, advice, weight) {
        const realm = this.realm(id);
        const [kind, about] = Object.entries(advice ?? {}).find(([key]) => ["march", "peace", "war"].includes(key)) ?? [];

        if (!realm?.alive || realm.overlord || !kind || !(weight > 0)) {
            return false;
        }

        const fitting = {
            march: () => this.town(about) && this.hostile(id, this.liege(this.town(about).owner)),
            peace: () => this.realm(about)?.alive && this.hostile(id, about),
            war: () => this.realm(about)?.alive && !this.realm(about).overlord && this.relation(id, about) === "neutral",
        }[kind];

        if (!fitting()) {
            return false;
        }

        realm.counsel = { [kind]: about, weight: clamp(weight, 0, 1), until: this.turn + COUNSEL_TURNS };
        this.#emit("counsel", { realm: id, [kind]: about });

        return true;
    }

    /** A realm remembers something done to it by another: a grudge (below 0) or a favour (above). */
    remember(id, about, amount) {
        const realm = this.realm(id);

        if (realm && about !== id && this.realm(about)) {
            realm.standing[about] = clamp((realm.standing[about] ?? 0) + amount, -100, 100);
        }
    }

    /**
     * Whom a people would rise against (docs/WAR.md M10): the one at the top of those it serves;
     * for a fallen people, whoever holds the most of its old towns. Null if it's free.
     */
    oppressor(id) {
        const realm = this.realm(id);

        if (!realm) {
            return null;
        }

        if (realm.alive) {
            return realm.overlord ? this.liege(realm.overlord) : null;
        }

        const holders = {};

        for (const town of this.towns.filter(({ race }) => race === realm.race)) {
            const liege = this.liege(town.owner);

            holders[liege] = (holders[liege] ?? 0) + 1;
        }

        return Object.entries(holders).sort(([, a], [, b]) => b - a)[0]?.[0] ?? null;
    }

    /**
     * A people that serves another, or has fallen, stirred towards rising by `amount` (what its
     * players do). Returns its unrest (0 to RISING.ready), or null if it's free.
     */
    stir(id, amount) {
        const realm = this.realm(id);

        if (!this.oppressor(id) || !(amount > 0)) {
            return this.oppressor(id) ? (realm.unrest ?? 0) : null;
        }

        this.#unrest(realm, amount);

        return realm.unrest;
    }

    /**
     * A people rising now, at a player's counsel (weighing `weight`, 0 to 1, by their standing),
     * if it's restless enough: a vassal throws off its overlord; a fallen people takes back the one
     * of its old towns nearest `near` ([x, y] metres; else the least held). Returns whether it rose.
     */
    rise(id, { weight = 0, near = null } = {}) {
        const realm = this.realm(id);

        if (!this.oppressor(id) || (realm.unrest ?? 0) < RISING.ready * (1 - clamp(weight, 0, 1) * (1 - RISING.early))) {
            return false;
        }

        this.#rise(realm, { near, led: weight > 0 });

        return true;
    }

    // --- Keeping it ---

    /** Everything the war is, as plain data (core/wire.js carries it). The plan isn't in it: that's made again from its seed. */
    snapshot() {
        return structuredClone({
            version: WAR_VERSION,
            seed: this.seed,
            random: this.random.state,
            turn: this.turn,
            clock: this.clock,
            stage: this.stage,
            might: this.might,
            realms: this.realms,
            towns: this.towns,
            forces: this.forces,
            nextForce: this.nextForce,
            relations: this.relations,
            known: this.known,
            victor: this.victor,
            log: this.log,
            watched: [...this.watched],
            places: this.places,
        });
    }

    /** The war on `plan` (made again from the same seed) carrying on from a snapshot. */
    static restore(plan, snapshot) {
        if (snapshot.version !== WAR_VERSION) {
            throw new Error(`A war kept by another version of the game (${snapshot.version})`);
        }

        const war = new War(plan, { seed: snapshot.seed });
        const kept = structuredClone(snapshot);

        war.random.state = kept.random;

        for (const key of ["turn", "clock", "stage", "might", "realms", "towns", "forces", "nextForce", "relations", "known", "victor", "log"]) {
            war[key] = kept[key];
        }

        war.events = [];
        war.watched = new Set(kept.watched ?? []);
        // (A war kept before places were cleared has none)
        war.places = kept.places ?? {};

        return war;
    }

    // --- Each turn ---

    #emit(type, details) {
        const event = { type, turn: this.turn, ...details };

        this.events.push(event);
        this.log.push(event);
        this.log.splice(0, Math.max(0, this.log.length - KEEP_LOG));
    }

    // The stage the war's got to: with the players' might, or with time
    #stageUp() {
        const byMight = STAGES.findLastIndex(({ might }) => this.might >= might);
        const byTime = Math.floor(this.turn / TURNS_PER_STAGE);
        const stage = Math.min(STAGES.length - 1, Math.max(this.stage, byMight, byTime));

        if (stage > this.stage) {
            this.stage = stage;
            this.#emit("stage", { stage });
        }
    }

    // Peoples whose towns or forces come within sight of each other meet (neutral to start with)
    #discover({ quietly = false } = {}) {
        const spots = new Map(this.realms.map(({ id }) => [id, []]));

        for (const town of this.towns) {
            spots.get(town.owner)?.push(town.at);
        }

        for (const force of this.forces) {
            spots.get(force.realm)?.push(force.at);
        }

        for (const [k, a] of this.realms.entries()) {
            for (const b of this.realms.slice(k + 1)) {
                if (!a.alive || !b.alive || this.knows(a.id, b.id)) {
                    continue;
                }

                const met = spots.get(a.id).some((here) => spots.get(b.id).some((there) => apart(here, there) <= REACH.sight));

                if (met) {
                    this.known.push(pair(a.id, b.id));

                    if (!quietly) {
                        this.#emit("met", { a: a.id, b: b.id });
                    }
                }
            }
        }
    }

    // Taxes in (a vassal's tribute to its liege), keep paid out (unpaid, a garrison or two desert)
    #collect() {
        for (const town of this.towns) {
            const owner = this.realm(town.owner);

            // (Raided lately: nothing to pay)
            if (!owner || this.turn - town.raidedAt <= 1) {
                continue;
            }

            const tax = HOLDINGS[town.kind].tax;

            if (owner.overlord) {
                owner.treasury += tax * (1 - TRIBUTE);
                this.realm(this.liege(owner.id)).treasury += tax * TRIBUTE;
            } else {
                owner.treasury += tax;
            }
        }

        for (const realm of this.realms.filter(({ alive }) => alive)) {
            realm.treasury -= this.power(realm.id) * COSTS.upkeep;

            if (realm.treasury < 0) {
                realm.treasury = 0;

                for (const town of this.towns.filter(({ owner }) => owner === realm.id)) {
                    town.garrison = Math.floor(town.garrison * 0.95);
                }

                this.#emit("unpaid", { realm: realm.id });
            }

            realm.treasury = Math.round(realm.treasury * 10) / 10;
        }
    }

    // Grudges and favours fade (the more slowly, the more the realm holds a grudge)
    #fade() {
        for (const realm of this.realms) {
            const keep = 0.97 + realm.leader.traits.grudge * 0.025;

            for (const [other, value] of Object.entries(realm.standing)) {
                const faded = Math.round(value * keep * 100) / 100;

                if (Math.abs(faded) < 0.5) {
                    delete realm.standing[other];
                } else {
                    realm.standing[other] = faded;
                }
            }
        }
    }

    // A liege's rulers decide what to do this turn, for their realm and its vassals
    #decide(realm) {
        const { traits } = realm.leader;

        // (A player's counsel is heeded only so long)
        if (realm.counsel && this.turn > realm.counsel.until) {
            realm.counsel = null;
        }

        const own = [realm, ...this.realms.filter((other) => other.alive && other.overlord && this.liege(other.id) === realm.id)];

        for (const each of own) {
            this.#garrison(each);
        }

        this.#diplomacy(realm);
        this.#declare(realm);

        // Relief for its own and its allies' towns under threat first, then the war carried to
        // the enemy
        for (const each of own) {
            this.#relieve(each, realm);
        }

        if (this.enemiesOf(realm.id).length) {
            for (const each of own) {
                this.#expedition(each, realm, traits);
            }
        }
    }

    // Fill up the garrisons: the seat first, then those threatened, then the emptiest (keeping
    // some gold back for the war, more the more warlike)
    #garrison(realm) {
        const towns = this.towns.filter(({ owner }) => owner === realm.id);
        const upkeep = this.power(realm.id) * COSTS.upkeep * 3;
        const reserve = upkeep + (this.enemiesOf(this.liege(realm.id)).length ? 15 + realm.leader.traits.aggression * 40 : 10);
        const order = towns
            .map((town) => ({ town, want: HOLDINGS[town.kind].garrison - town.garrison, first: town.id === realm.seat ? 2 : this.#threatened(town) ? 1 : 0 }))
            .filter(({ want }) => want > 0)
            .sort((a, b) => b.first - a.first || b.want - a.want || (a.town.id < b.town.id ? -1 : 1));

        for (const { town, want } of order) {
            const afford = Math.floor((realm.treasury - reserve) / COSTS.troop);
            const raised = Math.min(want, afford, 5);

            if (raised <= 0) {
                break;
            }

            town.garrison += raised;
            realm.treasury -= raised * COSTS.troop;
        }
    }

    // Is there an enemy camp near a town?
    #threatened(town) {
        return this.forces.some((force) => force.kind === "camp" && this.hostile(force.realm, town.owner) && apart(force.at, town.at) <= REACH.threat);
    }

    // Envoys: sue for peace in a war going badly, win over a neutral against a shared enemy, or
    // part an enemy from its ally (one envoy out at a time)
    #diplomacy(realm) {
        const { traits } = realm.leader;

        if (this.forces.some(({ realm: id, kind }) => id === realm.id && kind === "envoy") || realm.treasury < COSTS.envoy) {
            return;
        }

        const enemies = this.enemiesOf(realm.id);
        const strength = this.strength(realm.id);
        const counsel = realm.counsel;

        // (Counselled to seek peace: the more, the weightier the counsel and the warier the ruler)
        if (counsel?.peace && enemies.includes(counsel.peace) && this.random.chance(counsel.weight * (0.4 + traits.caution * 0.6))) {
            realm.counsel = null;
            this.#envoy(realm, counsel.peace, "truce");

            return;
        }

        for (const enemy of enemies) {
            if (this.strength(enemy) > strength * (1 + (1 - traits.caution)) && this.random.chance(0.5)) {
                this.#envoy(realm, enemy, "truce");

                return;
            }
        }

        for (const enemy of enemies) {
            const allies = this.realms.filter((other) => other.alive && !other.overlord && other.id !== realm.id && this.relation(other.id, enemy) === "allied" && this.relation(realm.id, other.id) === "neutral");

            for (const ally of allies) {
                if ((realm.standing[ally.id] ?? 0) >= 0 && this.random.chance(0.3)) {
                    this.#envoy(realm, ally.id, "break", enemy);

                    return;
                }
            }
        }

        const neutrals = this.realms.filter((other) => other.alive && !other.overlord && other.id !== realm.id && this.relation(realm.id, other.id) === "neutral");

        for (const other of neutrals) {
            const shared = this.enemiesOf(other.id).some((enemy) => enemies.includes(enemy));

            if (shared && (realm.standing[other.id] ?? 0) > -10 && this.random.chance(traits.loyalty * 0.5)) {
                this.#envoy(realm, other.id, "alliance");

                return;
            }
        }
    }

    #envoy(realm, to, mission, about = null) {
        const route = this.roads.route(realm.seat, this.realm(to).seat);

        if (!route) {
            return;
        }

        realm.treasury -= COSTS.envoy;
        this.forces.push({ id: `force-${this.nextForce++}`, realm: realm.id, kind: "envoy", size: 0, at: [...route.points[0]], path: route.points, leg: 0, target: to, home: realm.seat, mission, about, since: this.turn });
        this.#emit("envoy", { from: realm.id, to, mission, about });
    }

    // War declared on a neutral the warlike think they can beat, or bear a grudge against (so many
    // wars at once, the more warlike the more); their allies may take up arms too. And an alliance
    // soured past bearing broken off
    #declare(realm) {
        const { traits } = realm.leader;
        const strength = this.strength(realm.id);

        for (const other of this.realms) {
            if (!other.alive || other.overlord || other.id === realm.id || this.relation(realm.id, other.id) !== "allied") {
                continue;
            }

            // (With no one else left to fight, the greedy and warlike tire of their friends)
            const soured = (realm.standing[other.id] ?? 0) < -30 && traits.loyalty < 0.45 && this.random.chance(0.3);
            const idle = !this.enemiesOf(realm.id).length && this.random.chance(((traits.aggression + traits.greed) / 2) * (1 - traits.loyalty) * 0.05);

            if (soured || idle) {
                this.#set(realm.id, other.id, "neutral");
                this.#emit("broke", { by: realm.id, with: other.id });
            }
        }

        // (Counselled to war: the weightier the counsel and the bolder the ruler, the likelier)
        const counsel = realm.counsel;

        if (counsel?.war && this.relation(realm.id, counsel.war) === "neutral" && this.random.chance(counsel.weight * (0.3 + traits.aggression * 0.7))) {
            realm.counsel = null;
            this.#war(realm.id, counsel.war);

            return;
        }

        if (this.enemiesOf(realm.id).length >= 1 + Math.round(traits.aggression * 2)) {
            return;
        }

        for (const other of this.realms) {
            if (!other.alive || other.overlord || other.id === realm.id || this.relation(realm.id, other.id) !== "neutral") {
                continue;
            }

            // (And the longer the war goes on, the more every people wants its share)
            const ratio = strength / Math.max(1, this.strength(other.id));
            const grudge = clamp(-(realm.standing[other.id] ?? 0) / 100, -1, 1) * traits.grudge;
            const restless = Math.min(0.25, this.turn / 1200);
            const score = traits.aggression * 0.8 + traits.greed * 0.3 - traits.caution * 0.3 + grudge + clamp(ratio - 1, -0.5, 0.5) * 0.3 + this.stage * 0.08 + restless;

            if (score > 0.65 && this.random.chance(0.25)) {
                this.#war(realm.id, other.id);

                return;
            }
        }
    }

    // A realm goes to war with another: the other's allies may join in against it
    #war(by, on) {
        this.#set(by, on, "hostile");
        this.remember(on, by, -15);
        this.#emit("declared", { by, on });

        for (const ally of this.realms) {
            if (ally.alive && !ally.overlord && ally.id !== by && ally.id !== on && this.relation(ally.id, on) === "allied" && this.relation(ally.id, by) !== "hostile" && this.random.chance(0.3 + ally.leader.traits.loyalty * 0.6)) {
                this.#set(ally.id, by, "hostile");
                this.#emit("joined", { by: ally.id, on: by, for: on });
            }
        }
    }

    #set(a, b, state) {
        this.relations[pair(a, b)] = { state, since: this.turn };
    }

    // Relief for a town of its own or an ally's with an enemy camp by it stronger than its
    // garrison: from the nearest town that can spare it
    #relieve(realm, liege) {
        const { traits } = liege.leader;

        if (this.#fielded(realm.id) >= STAGES[this.stage].fielded) {
            return;
        }

        for (const camp of this.forces.filter(({ kind }) => kind === "camp")) {
            const town = this.town(camp.target);

            if (!town || !this.hostile(camp.realm, realm.id) || camp.size <= town.garrison || this.forces.some(({ kind, target }) => kind === "relief" && target === camp.id)) {
                continue;
            }

            const mine = town.owner === realm.id;

            if (!mine && !(this.friendly(realm.id, town.owner) && this.random.chance(traits.loyalty * 0.6))) {
                continue;
            }

            const size = Math.min(STAGES[this.stage].most, Math.ceil(camp.size * 1.3), Math.floor(this.#spare(realm) / COSTS.troop));

            if (size < 4) {
                continue;
            }

            const from = this.#nearestOwn(realm.id, camp.at);
            const route = from && this.#routeTo(from.id, camp.at);

            if (!route) {
                continue;
            }

            realm.treasury -= size * COSTS.troop;
            this.forces.push({ id: `force-${this.nextForce++}`, realm: realm.id, kind: "relief", size, at: [...route[0]], path: route, leg: 0, target: camp.id, home: from.id, mission: null, about: null, since: this.turn });
            this.#emit("relief", { realm: realm.id, camp: camp.id, against: camp.realm, town: town.id, size });

            return;
        }
    }

    // The gold a realm can spend on the war (keeping enough back for a couple of turns' keep)
    #spare(realm) {
        return realm.treasury - this.power(realm.id) * COSTS.upkeep * 2;
    }

    // How many forces a realm has in the field (envoys aside)
    #fielded(id) {
        return this.forces.filter(({ realm, kind }) => realm === id && kind !== "envoy").length;
    }

    // The realm's own town nearest a point
    #nearestOwn(id, at) {
        let best = null;

        for (const town of this.towns) {
            if (town.owner === id && (!best || apart(town.at, at) < apart(best.at, at))) {
                best = town;
            }
        }

        return best;
    }

    // The way from a place to a point: to the place nearest it, then straight there
    #routeTo(fromId, at) {
        const near = this.roads.nearest(at);
        const route = near && this.roads.route(fromId, near.id);

        return route ? [...route.points, [Math.round(at[0]), Math.round(at[1])]] : null;
    }

    // An expedition against the enemy: at its weakest near town (one a camp of its already
    // threatens first, to reinforce it), as big as it takes, as the stage and the treasury allow
    #expedition(realm, liege, traits) {
        const stage = STAGES[this.stage];

        if (this.#fielded(realm.id) >= stage.fielded) {
            return;
        }

        const enemies = this.enemiesOf(liege.id);
        const targets = this.towns.filter((town) => enemies.includes(this.liege(town.owner)));

        if (!targets.length) {
            return;
        }

        const scored = targets
            .map((town) => {
                const from = this.#nearestOwn(realm.id, town.at);
                const distance = from ? apart(from.at, town.at) : Infinity;
                const camped = this.forces.some(({ realm: id, kind, target }) => id === realm.id && kind === "camp" && target === town.id);
                const takeable = stage.take.includes(town.kind);

                // (Their rulers' seat, to bring them under: when it can be taken, and it's strong enough to)
                const seat = takeable && town.id === this.realm(town.owner).seat && this.strength(liege.id) >= this.strength(this.liege(town.owner));

                // (And where a player's counselled them to march)
                const counselled = liege.counsel?.march === town.id ? 4 * liege.counsel.weight : 0;

                return { town, from, score: distance / 1000 + town.garrison / 15 - (camped ? 2 : 0) - (takeable ? HOLDINGS[town.kind].worth * traits.greed : 0) - (seat ? 3 * traits.aggression : 0) - counselled + this.random.range(0, 0.5) };
            })
            .filter(({ from }) => from)
            .sort((a, b) => a.score - b.score);

        const { town, from } = scored[0] ?? {};

        if (!town) {
            return;
        }

        const needed = Math.ceil(town.garrison * HOLDINGS[town.kind].walls * (1.5 - traits.aggression * 0.4));
        const size = Math.min(stage.most, Math.max(6, needed), Math.floor(this.#spare(realm) / COSTS.troop));

        if (size < 6) {
            return;
        }

        const route = this.roads.route(from.id, town.id);

        if (!route) {
            return;
        }

        // (Counsel acted on)
        if (liege.counsel?.march === town.id) {
            liege.counsel = null;
        }

        realm.treasury -= size * COSTS.troop;
        this.forces.push({ id: `force-${this.nextForce++}`, realm: realm.id, kind: "expedition", size, at: [...route.points[0]], path: route.points, leg: 0, target: town.id, home: from.id, mission: null, about: null, since: this.turn });
        this.#emit("marched", { realm: realm.id, from: from.id, target: town.id, size });
    }

    // Everyone on the move goes on: expeditions camp by their target, relief falls on the camp,
    // envoys are heard
    #march() {
        for (const force of [...this.forces]) {
            // (Camps stay put; an envoy a player's near goes as it's seen to go there: move)
            if (force.kind === "camp" || !this.forces.includes(force) || (force.kind === "envoy" && this.watched.has(force.id))) {
                continue;
            }

            this.#go(force, force.kind === "envoy" ? SPEEDS.envoy : SPEEDS.march);

            if (force.kind === "expedition") {
                this.#onExpedition(force);
            } else if (force.kind === "relief") {
                this.#onRelief(force);
            } else if (force.leg >= force.path.length - 1) {
                this.#hear(force);
            }
        }
    }

    // Along its path, so far
    #go(force, budget) {
        let left = budget;

        while (left > 0 && force.leg < force.path.length - 1) {
            const next = force.path[force.leg + 1];
            const distance = apart(force.at, next);

            if (distance <= left) {
                force.at = [...next];
                force.leg++;
                left -= distance;
            } else {
                force.at = [force.at[0] + ((next[0] - force.at[0]) / distance) * left, force.at[1] + ((next[1] - force.at[1]) / distance) * left];
                left = 0;
            }
        }

        force.at = [Math.round(force.at[0] * 10) / 10, Math.round(force.at[1] * 10) / 10];
    }

    #onExpedition(force) {
        const town = this.town(force.target);

        // (No longer an enemy's: home again)
        if (!town || !this.hostile(force.realm, town.owner)) {
            this.#disband(force, "withdrew");

            return;
        }

        if (apart(force.at, town.at) > REACH.camp && force.leg < force.path.length - 1) {
            return;
        }

        // By its target: it camps (or joins its people's camp there)
        const camp = this.forces.find(({ kind, realm, target }) => kind === "camp" && realm === force.realm && target === town.id);

        if (camp) {
            camp.size += force.size;
            this.forces.splice(this.forces.indexOf(force), 1);
            this.#emit("reinforced", { realm: force.realm, target: town.id, size: camp.size });
        } else {
            Object.assign(force, { kind: "camp", since: this.turn });
            this.#emit("camped", { realm: force.realm, target: town.id, size: force.size, force: force.id });
        }
    }

    #onRelief(force) {
        const camp = this.force(force.target);

        if (!camp || camp.kind !== "camp" || !this.hostile(force.realm, camp.realm)) {
            this.#disband(force, "withdrew");

            return;
        }

        // (The camp's where it was: straight at it)
        if (apart(force.at, camp.at) > REACH.fall) {
            if (force.leg >= force.path.length - 1) {
                force.path = [force.at, camp.at];
                force.leg = 0;
            }

            return;
        }

        const { attackers, defenders } = this.#fight(force.size, camp.size, 1);

        this.#emit("battle", { realm: force.realm, against: camp.realm, at: camp.at, won: defenders === 0, killed: camp.size - defenders, lost: force.size - attackers });
        this.remember(camp.realm, force.realm, -5);
        force.size = attackers;
        camp.size = defenders;

        if (!camp.size) {
            this.forces.splice(this.forces.indexOf(camp), 1);
        }

        this.#disband(force, null);
    }

    // A force goes home: what's left of it back in its home town's garrison, if it's still theirs
    #disband(force, why) {
        const home = this.town(force.home);

        if (home?.owner === force.realm) {
            home.garrison = Math.min(Math.round(HOLDINGS[home.kind].garrison * 1.5), home.garrison + force.size);
        }

        this.forces.splice(this.forces.indexOf(force), 1);

        if (why) {
            this.#emit(why, { realm: force.realm, target: force.target, kind: force.kind });
        }
    }

    // An envoy arrives: heard, and their offer taken or not, by how the ruler's disposed
    #hear(envoy) {
        this.forces.splice(this.forces.indexOf(envoy), 1);

        const from = this.realm(envoy.realm);
        const to = this.realm(envoy.target);

        if (!to?.alive || to.overlord || from.overlord) {
            this.#emit("treaty", { from: from.id, to: envoy.target, mission: envoy.mission, about: envoy.about, accepted: false, force: envoy.id });

            return;
        }

        const { traits } = to.leader;
        const standing = to.standing[from.id] ?? 0;
        const shared = this.enemiesOf(to.id).some((enemy) => this.enemiesOf(from.id).includes(enemy));
        const chance = {
            truce: 0.25 + traits.caution * 0.4 + clamp(this.strength(from.id) / Math.max(1, this.strength(to.id)) - 1, -0.3, 0.3) + standing / 200,
            alliance: 0.15 + traits.loyalty * 0.3 + (shared ? 0.3 : 0) + standing / 100,
            break: 0.2 + standing / 100 - traits.loyalty * 0.4 + ((to.standing[envoy.about] ?? 0) < 0 ? 0.3 : 0),
        }[envoy.mission];
        const fitting = {
            truce: this.hostile(from.id, to.id),
            alliance: this.relation(from.id, to.id) === "neutral",
            break: envoy.about && this.relation(to.id, envoy.about) === "allied",
        }[envoy.mission];
        const accepted = Boolean(fitting) && this.random.chance(clamp(chance, 0.02, 0.95));

        if (accepted) {
            if (envoy.mission === "truce") {
                this.#set(from.id, to.id, "neutral");
            } else if (envoy.mission === "alliance") {
                this.#set(from.id, to.id, "allied");
            } else {
                this.#set(to.id, envoy.about, "neutral");
            }

            this.remember(to.id, from.id, 5);
        }

        this.#emit("treaty", { from: from.id, to: to.id, mission: envoy.mission, about: envoy.about, accepted, force: envoy.id });
    }

    // The camps: an assault on their town if the stage allows it and they're strong enough; else
    // a raid on it. A garrison much stronger than the camp by it sallies out against it
    #camps() {
        const stage = STAGES[this.stage];

        for (const camp of this.forces.filter(({ kind }) => kind === "camp")) {
            if (!this.forces.includes(camp)) {
                continue;
            }

            const town = this.town(camp.target);

            if (!town || !this.hostile(camp.realm, town.owner)) {
                this.#disband(camp, "withdrew");
                continue;
            }

            // (Out against a town a player's near: played out there, until it's settled, or it's
            // gone on too long, and the rest of it is reckoned here)
            if (camp.sortie) {
                if (this.turn - camp.sortie.turn >= SORTIE_TURNS) {
                    this.settle(camp.id, { reckon: true });
                }

                continue;
            }

            if (camp.size < 3) {
                this.forces.splice(this.forces.indexOf(camp), 1);
                this.#emit("broken", { realm: camp.realm, target: town.id });
                continue;
            }

            const { traits } = this.realm(this.liege(camp.realm)).leader;
            const walls = HOLDINGS[town.kind].walls;
            const watched = this.watched.has(town.id);

            // A sally
            if (town.garrison > camp.size * 1.6 + 4) {
                const out = town.garrison - Math.ceil(HOLDINGS[town.kind].garrison / 4);
                const { attackers, defenders } = this.#fight(out, camp.size, 1);

                town.garrison += attackers - out;
                this.#emit("sally", { realm: town.owner, town: town.id, against: camp.realm, won: defenders === 0, killed: camp.size - defenders, lost: out - attackers });
                camp.size = defenders;

                if (!camp.size) {
                    this.forces.splice(this.forces.indexOf(camp), 1);
                }

                continue;
            }

            if (stage.take.includes(town.kind) && this.turn - camp.since >= SIEGE && camp.size >= town.garrison * walls * (1.25 - traits.aggression * 0.35)) {
                if (watched) {
                    this.#sortie(camp, town, "assault", camp.size);
                } else {
                    this.#assault(camp, town);
                }

                continue;
            }

            // A raid: a few of the camp out against the town's fields and roads
            if (this.random.chance(RAIDING)) {
                const party = Math.max(1, Math.ceil(camp.size * 0.3));

                if (watched) {
                    this.#sortie(camp, town, "raid", party);
                } else {
                    this.#raid(camp, town, { party });
                }
            }
        }
    }

    // A camp's sortie against a town a player's near: out, to be played out in the world (the
    // host's), and settled (settle)
    #sortie(camp, town, kind, party) {
        camp.sortie = { kind, turn: this.turn, party, size: camp.size, garrison: town.garrison };
        this.#emit("sortie", { kind, realm: camp.realm, force: camp.id, town: town.id, owner: town.owner, party });
    }

    // A camp storms its town, reckoned here, round by round (with what's been killed and lost
    // already, in a sortie played out before it: `before`)
    #assault(camp, town, before = { killed: 0, lost: 0 }) {
        const walls = HOLDINGS[town.kind].walls;
        const start = { camp: camp.size, town: town.garrison };
        const { attackers, defenders } = this.#fight(camp.size, town.garrison, walls);

        camp.size = attackers;
        town.garrison = defenders;
        this.#emit("assault", { realm: camp.realm, town: town.id, owner: town.owner, won: defenders === 0, killed: before.killed + start.town - defenders, lost: before.lost + start.camp - attackers });
        this.remember(town.owner, camp.realm, -5);

        if (!defenders && camp.size > 0) {
            this.#take(town, camp);

            return "taken";
        }

        if (camp.size < 3) {
            this.forces.splice(this.forces.indexOf(camp), 1);
            this.#emit("broken", { realm: camp.realm, target: town.id });

            return "broken";
        }

        return "repulsed";
    }

    // A camp's raid on its town's fields and roads, reckoned here: a few of its guard killed, a
    // few of the raiders lost, and its taxes stopped (with what's been killed and lost already)
    #raid(camp, town, { party = Math.max(1, Math.ceil(camp.size * 0.3)), killed: before = 0, lost: gone = 0 } = {}) {
        const killed = Math.min(town.garrison, Math.round(party * 0.3 * this.random.range(0.5, 1.5)));
        const lost = Math.min(party, camp.size, Math.round(town.garrison * 0.08 * this.random.range(0.5, 1.5)));

        town.garrison -= killed;
        camp.size -= lost;
        town.raidedAt = this.turn;
        this.remember(town.owner, camp.realm, -3);
        this.#emit("raid", { realm: camp.realm, town: town.id, owner: town.owner, killed: before + killed, lost: gone + lost });

        // (A camp too few to hold is broken at its next turn)
        return "raided";
    }

    // Two sides fight it out, round by round, until one's gone or the attack breaks. The
    // defenders' walls count for them
    #fight(attackers, defenders, walls) {
        let [a, d] = [attackers, defenders];

        for (let round = 0; round < 20 && a > 0 && d > 0; round++) {
            const killed = Math.min(d, Math.max(1, Math.round((a * 0.12 * this.random.range(0.6, 1.4)) / walls)));
            const lost = Math.min(a, Math.max(1, Math.round(d * 0.12 * this.random.range(0.6, 1.4) * walls)));

            d -= killed;
            a -= lost;

            if (a < attackers * 0.35 && a < d) {
                break;
            }
        }

        return { attackers: a, defenders: d };
    }

    // A town taken: the camp's people hold it now (its folk stay, under their new rulers). Its
    // rulers' seat taken, the realm is the taker's vassal, and rules from it again under them
    #take(town, camp) {
        const from = town.owner;

        town.owner = camp.realm;
        town.garrison = Math.min(Math.round(HOLDINGS[town.kind].garrison * 1.5), camp.size);
        this.forces.splice(this.forces.indexOf(camp), 1);
        this.remember(from, camp.realm, -20);
        this.#emit("taken", { town: town.id, from, to: camp.realm });

        const loser = this.realm(from);

        if (loser && town.id === loser.seat) {
            town.owner = loser.id;
            this.#subjugate(loser, this.liege(camp.realm));
        } else if (loser && !this.towns.some(({ owner }) => owner === loser.id)) {
            this.#fall(loser);
        }
    }

    // A realm whose rulers' seat has fallen serves the conqueror (with any realms that served
    // it), under a new ruler sitting in its greatest town (its seat, given back to it)
    #subjugate(realm, by) {
        const was = realm.overlord;

        for (const vassal of this.realms.filter(({ overlord }) => overlord === realm.id)) {
            vassal.overlord = by;
        }

        realm.overlord = by === realm.id ? null : by;
        realm.since = this.turn;
        realm.unrest = 0;
        realm.leader = rollLeader(realm.race, this.random);

        // Its own dealings are its liege's now; and whom it knew, its liege knows
        for (const key of Object.keys(this.relations)) {
            if (key.split("|").includes(realm.id)) {
                delete this.relations[key];
            }
        }

        for (const key of this.known.filter((each) => each.split("|").includes(realm.id))) {
            const other = key.split("|").find((id) => id !== realm.id);

            if (other !== by && !this.knows(by, other)) {
                this.known.push(pair(by, other));
            }
        }

        const left = this.towns.filter(({ owner }) => owner === realm.id).sort((a, b) => HOLDINGS[b.kind].worth - HOLDINGS[a.kind].worth || b.garrison - a.garrison);

        if (!left.length) {
            this.#fall(realm);

            return;
        }

        realm.seat = left[0].id;
        this.#emit("subjugated", { realm: realm.id, by, was });
    }

    // A realm with no towns left is no more (and any that served it are free)
    #fall(realm) {
        realm.alive = false;
        realm.overlord = null;

        for (const vassal of this.realms.filter(({ overlord }) => overlord === realm.id)) {
            vassal.overlord = null;
            vassal.since = this.turn;
        }

        for (const force of this.forces.filter(({ realm: id }) => id === realm.id)) {
            this.forces.splice(this.forces.indexOf(force), 1);
        }

        this.#emit("fallen", { realm: realm.id });
    }

    // Envoys passing an enemy's forces may be waylaid (the more warlike the enemy, the likelier)
    #waylay() {
        for (const envoy of this.forces.filter(({ kind, id }) => kind === "envoy" && !this.watched.has(id))) {
            const by = this.forces.find((force) => force.kind !== "envoy" && this.hostile(force.realm, envoy.realm) && apart(force.at, envoy.at) <= REACH.waylay);

            if (by && this.random.chance(this.realm(this.liege(by.realm)).leader.traits.aggression * 0.25)) {
                this.forces.splice(this.forces.indexOf(envoy), 1);
                this.remember(envoy.realm, by.realm, -10);
                this.#emit("waylaid", { realm: envoy.realm, by: by.realm, to: envoy.target, mission: envoy.mission, force: envoy.id });
            }
        }
    }

    // A people that serves another, or has fallen, restless enough, rises. And a vassal grows
    // more restless while it serves; once it's served a while it may rise anyway: the likelier the
    // stronger it is beside its overlord, the more it resents them, the harder pressed they are,
    // and the more restless it is
    #rebel() {
        for (const realm of this.realms) {
            if ((realm.unrest ?? 0) >= RISING.ready && this.oppressor(realm.id)) {
                this.#rise(realm);

                continue;
            }

            if (!realm.alive || !realm.overlord) {
                continue;
            }

            const overlord = realm.overlord;

            this.#unrest(realm, RISING.perTurn + ((realm.standing[overlord] ?? 0) < -30 ? RISING.grudge : 0));

            if (this.turn - realm.since < SERVES) {
                continue;
            }

            const ratio = this.power(realm.id) / Math.max(1, this.strength(this.liege(overlord)));
            const chance = 0.001 + Math.max(0, ratio - 0.5) * 0.04 + ((realm.standing[overlord] ?? 0) < -30 ? 0.004 : 0) + (this.enemiesOf(this.liege(overlord)).length ? 0.002 : 0) + ((realm.unrest ?? 0) / RISING.ready) * 0.01;

            if (this.random.chance(chance)) {
                this.#rise(realm);
            }
        }
    }

    // A people's unrest grown (told of once it's ready to rise)
    #unrest(realm, amount) {
        const was = realm.unrest ?? 0;

        realm.unrest = clamp(was + amount, 0, RISING.ready);

        if (was < RISING.ready && realm.unrest >= RISING.ready) {
            this.#emit("restless", { realm: realm.id, against: this.oppressor(realm.id) });
        }
    }

    // A people risen: a vassal free of its overlord, and at war with the one at the top of those it
    // served; a fallen people back in one of its old towns (the nearest `near`, or the least held),
    // at war with those who held it. A new ruler, either way
    #rise(realm, { near = null, led = false } = {}) {
        const against = this.oppressor(realm.id);

        realm.unrest = 0;
        realm.since = this.turn;
        realm.leader = rollLeader(realm.race, this.random);

        if (realm.alive) {
            const from = realm.overlord;

            realm.overlord = null;
            this.#set(realm.id, against, "hostile");
            this.remember(against, realm.id, -30);
            this.#emit("rebelled", { realm: realm.id, from, against, led });

            return;
        }

        const old = this.towns.filter(({ race }) => race === realm.race);
        const town = near ? old.reduce((best, each) => (apart(each.at, near) < apart(best.at, near) ? each : best)) : old.reduce((best, each) => (each.garrison < best.garrison ? each : best));
        const from = town.owner;

        Object.assign(town, { owner: realm.id, garrison: Math.ceil(HOLDINGS[town.kind].garrison * RISING.garrison) });
        Object.assign(realm, { alive: true, overlord: null, seat: town.id, treasury: Math.max(realm.treasury, COSTS.start / 2) });

        // (Any camp before it was the old holders' friends': now it's a camp against a rising)
        this.#set(realm.id, this.liege(from), "hostile");
        this.remember(this.liege(from), realm.id, -30);
        this.#emit("risen", { realm: realm.id, town: town.id, from, against, led });
    }

    // Has anyone brought every other people under them?
    #reckon() {
        const lieges = this.realms.filter(({ alive, overlord }) => alive && !overlord);
        const victor = lieges.length === 1 ? lieges[0].id : null;

        if (victor !== this.victor) {
            this.#emit(victor ? "victory" : "undone", { realm: victor ?? this.victor });
            this.victor = victor;
        }
    }
}
