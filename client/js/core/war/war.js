// The war for the continent, played out as numbers (docs/WAR.md): the six peoples' realms, the
// towns they hold and the garrisons in them, their treasuries, their standing armies and
// defensive reserves (armies.js: made up from their towns, staged from forward camps, taking a
// town only by putting its garrison to the sword), the envoys between their rulers and the
// convoys from their works, what they think of each other, and who's brought whom under them.
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
import { RACES, WORKS } from "../worldplan/races.js";
import { ARMY, CAMP, campSite, CLOSE, EDGES, fullOf, HELD, LEADERS, REINFORCE, SIGHT, WATCH_TURNS } from "./armies.js";
import { affords, COUNCIL, FORTS, mayBuild, plansFor } from "./forts.js";
import { REALMS, rollLeader } from "./peoples.js";
import { ACROSS_COUNTRY, Roads } from "./roads.js";
import { DEPOT, HUNGER, SUPPLY } from "./supply.js";
import { atan2, cos, hypot, sin } from "../exact.js";
import { landAt } from "../worldplan/plan.js";
import { WATER } from "../worldplan/terrain.js";

/** A turn every so much play (ms). */
export const TURN_MS = 60000;

/**
 * What the places the war's fought over are worth (the plan's hamlets and farmsteads go with the
 * town nearest them): the garrison each holds when it's full, the taxes it pays a turn, how much
 * its walls help its defenders, how many patrols go out from it (from M2), and how many soldiers
 * it can raise a turn (`produce`: for its garrison, or its people's army and reserve: armies.js).
 */
export const HOLDINGS = Object.freeze({
    capital: { garrison: 40, tax: 9, walls: 1.6, patrols: 3, worth: 4, produce: 4 },
    city: { garrison: 24, tax: 6, walls: 1.35, patrols: 2, worth: 3, produce: 3 },
    town: { garrison: 12, tax: 3, walls: 1.15, patrols: 1, worth: 2, produce: 2 },
    village: { garrison: 5, tax: 1.5, walls: 1, patrols: 1, worth: 1, produce: 1 },
});

/**
 * How far the war's got. Each stage says what can be taken, and how strong each people's army and
 * reserve can be (`army`: a share of the most, armies.js ARMY); no army marches before the border
 * wars. It comes with the players' might (`might`: the strongest's), or after TURNS_PER_STAGE
 * turns each whatever, and never goes back.
 */
export const STAGES = Object.freeze([
    { id: "unease", name: "An uneasy peace", take: [], army: 0.25, might: 0 },
    { id: "border", name: "Border wars", take: ["village"], army: 0.5, might: 2 },
    { id: "war", name: "War", take: ["village", "town", "city"], army: 0.75, might: 4 },
    { id: "conquest", name: "Conquest", take: ["village", "town", "city", "capital"], army: 1, might: 6 },
]);
export const TURNS_PER_STAGE = 180;

/** What things cost (gold): a troop raised, a troop's keep a turn, an envoy; and what a realm starts with. */
export const COSTS = Object.freeze({ troop: 5, upkeep: 0.06, envoy: 10, start: 60 });

/**
 * Going to war (#declare): how much the odds weigh (each people's strength over its foe's, less
 * one, between -0.5 and 0.5), and each age of the war; how warlike a people's ruler must be to start a second war while
 * it's fighting one, and how many times stronger than the enemy it's fighting it must be (no one
 * starts a third); how many turns a peace holds (a truce, or an
 * alliance broken off) before either goes to war with the other again, or joins a war against it;
 * and how much stronger than a people all its enemies together may be before it seeks a truce
 * (`bear` of its ruler's want of caution, over even).
 */
export const DECLARE = Object.freeze({ odds: 0.8, age: 0.12, twoFronts: 0.7, second: 1.5, truce: 60, bear: 0.5 });

/**
 * A people's reserve going out against an enemy's army in its lands (#defend): how strong it must
 * be beside it (a share of the army's strength); else it waits for it at home.
 */
export const DEFEND = Object.freeze({ odds: 0.4 });

/**
 * An army's rulers choosing what to send it against (#campaign): how many times as strong as a
 * town's garrison behind its walls it should be (`odds`), and how much further away (km) a town
 * seems for each time short of that (`hopeless`).
 */
export const CAMPAIGN = Object.freeze({ odds: 1.5, hopeless: 2 });

/**
 * A town taken is sacked by its takers (#hold): gold of so many `turns` of its taxes, half that
 * again and more the greedier their ruler (by their greed over nothing).
 */
export const SACK = Object.freeze({ turns: 20 });

/**
 * Mustering (#muster): how much readier a warlike people's folk are to take up arms (each town
 * raising so many more a turn, or fewer, by its ruler's aggression over a half).
 */
export const MUSTER = Object.freeze({ warlike: 0.6 });

/** How far forces go in a turn (metres): a band winning back a works, an envoy. */
export const SPEEDS = Object.freeze({ march: 250, envoy: 400 });

/**
 * How near (metres): two peoples' towns or forces for them to meet; a band to the works it's
 * winning back, to fall on it; an enemy force to an envoy, to waylay it (or to a convoy, to fall
 * on it); an enemy army or camp to a town, to threaten it; a wild camp of brigands to a convoy's
 * way, to fall on it.
 */
export const REACH = Object.freeze({ sight: 1500, fall: 120, waylay: 300, threat: 1000, ambush: 250 });

/** A vassal's share of its taxes paid to its overlord. */
export const TRIBUTE = 0.5;

/** How many turns a vassal serves before it might rise against its overlord. */
export const SERVES = 60;

/**
 * A people's rising (docs/WAR.md M10). Serving another, or fallen, its unrest grows towards `ready`:
 * by `perTurn` while it serves (and by `grudge` more if it bears its overlord a grudge), and by
 * what its players do (stir). Ready, it rises; a player's counsel can call it sooner (as early
 * as `early` of the way for the weightiest). A fallen people rises in one of its old towns: as
 * many rebels as `garrison` of the soldiers a town of its kind keeps, `rebels` times over, who must
 * put its garrison to the sword to take it (docs/WAR.md *Standing armies*), and hold it with those
 * of them left.
 */
export const RISING = Object.freeze({ ready: 100, perTurn: 0.25, grudge: 0.25, early: 0.5, garrison: 0.6, rebels: 2.5 });

/** How many turns a player's counsel is heeded (if it's not been acted on sooner). */
export const COUNSEL_TURNS = 20;

/** What each people builds with (docs/WAR.md *The works*): its realm's stores of each. */
export const RESOURCES = Object.freeze(["wood", "stone", "metal"]);

/**
 * Each people's works (worldplan/races.js WORKS: two lumber mills, two mines and two quarries in
 * their lands): what each yields a turn, of what it yields (`yields`: a mill's wood, a mine's
 * metal, a quarry's stone), while it's held and guarded, into its yard, which holds `yard` at
 * most; its guard when full (`guard`), raised and paid for as a garrison is; what it's worth to
 * take (`worth`, as a town's: HOLDINGS); and from which stage of the war it can be taken (`from`).
 */
export const WORKED = Object.freeze({ yields: { wood: 3, stone: 2, metal: 1.5 }, yard: 120, guard: 6, worth: 1.5, from: 1 });

/**
 * A works' convoy (docs/WAR.md *Convoys*): `wagons` wagons of `load` each, guarded by `guards`
 * and their captain, going `speed` metres a turn from its works to its people's seat and back.
 * It sets out once there's a wagon's load in its yard and at least `fewest` of its guards are
 * home; each is raised and paid for as a garrison's are.
 */
export const CONVOY = Object.freeze({ wagons: 3, load: 20, guards: 6, fewest: 4, speed: 200 });

/**
 * How a works is overrun by the wild's bands (docs/WAR.md *The works*): each turn it's held, by a
 * chance of `base`, and `weak` more the emptier its guard is (by the square of how empty); a band
 * `band` strong holds it then, its guard put to the sword and its yard looted. A works cleared of
 * them, or seized, is held by `held` of its new holders at first.
 */
export const OVERRUN = Object.freeze({ base: 0.001, weak: 0.025, band: 6, held: 2 });

/**
 * A fortification under siege (docs/WAR.md *Fortifications*): an enemy camp or army within `reach`
 * metres of it falls on it each turn, taking `hp` of its strength for each of them; its defenders
 * bring down `tower` of them a turn (a garrison `garrison`). Kept up, it's mended `mend` of its
 * strength a turn, once it's not been fallen on for `rest` turns; not kept up (its people's
 * stores short of its upkeep), it falls `decay` into ruin a turn, and is given up at nothing.
 */
export const FORT_SIEGE = Object.freeze({ reach: 250, hp: 10, tower: 1, garrison: 2, mend: 0.02, decay: 0.02, rest: 3 });

/**
 * How near its holders' fortification covers a town (docs/WAR.md *Battle lines*, M15: metres from
 * the town's edge): while one stands so near, the town can't be stormed, and an army sent against it
 * falls on the fortification first.
 */
export const FORT_COVER = 250;

/**
 * A forward garrison's squads (docs/WAR.md *Battle lines*, M15): its `patrols` patrols of `patrol`
 * each, walking their rounds within `round` metres of it, and its assault team, `assault` strong,
 * out against the enemy's fortifications within `reach` of it once it's `ready` strong (each of
 * them taking `hp` of the fortification's strength a turn). One of them made up every `every`
 * turns as they fall, the emptiest squad first, for `cost` gold from its people's treasury.
 */
export const SQUADS = Object.freeze({ patrols: 2, patrol: 4, assault: 6, round: 300, reach: 900, ready: 4, hp: 15, every: 2, cost: 5 });

/** The names of a forward garrison's squads, its patrols' and its assault team's (`squads` keys and indexes). */
export const SQUAD_NAMES = Object.freeze([...Array.from({ length: SQUADS.patrols }, (_, k) => `patrol-${k}`), "assault"]);

/**
 * A town taken in the world (docs/WAR.md *Standing armies*): its whole garrison put down by a
 * player's people. How big its new holders' garrison is, a share of a full one's (rounded up).
 */
export const TAKEN = 0.25;

/** Bumped whenever what a snapshot holds changes (a war kept by version 1, before the works, carries on: restore). */
export const WAR_VERSION = 6;

// How many things that happened are kept (the log)
const KEEP_LOG = 300;

// The kinds of place fought over
const FOUGHT_OVER = Object.keys(HOLDINGS);

// The kinds of works, and what each yields
const YIELDS = Object.fromEntries(WORKS.map(({ kind, yields }) => [kind, yields]));

// A realm's stores, empty
const noStores = () => Object.fromEntries(RESOURCES.map((resource) => [resource, 0]));

// A forward garrison's squads, whole (SQUADS): { squads (as SQUAD_NAMES), mustered (the turn it
// was last made up) }
const fullSquads = (turn) => ({ squads: SQUAD_NAMES.map((name) => (name === "assault" ? SQUADS.assault : SQUADS.patrol)), mustered: turn });

// The forces that fall on an envoy or a convoy passing (an army, a reserve, a band winning back a works)
const FIGHTING = Object.freeze(["army", "reserve", "expedition"]);

// The wild camps whose brigands fall on a convoy passing (worldplan/races.js FACTIONS), and how
// likely they are to each turn it's near one
const BRIGANDS = Object.freeze(["bandits", "raiders", "goblins"]);
const AMBUSH = 0.12;

// The works of a plan (WORKED), each held by its own people, its guard and its convoy's full
function worksOf(plan) {
    return plan.sites
        .filter(({ kind }) => YIELDS[kind])
        .map(({ id, kind, name, at, race }) => ({ id, kind, name, at: [...at], race, owner: race, guard: WORKED.guard, escort: CONVOY.guards + 1, yard: 0, held: false, band: 0 }));
}

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
         * alive, stores (what it has to build with: RESOURCES, from its works' convoys), build (a
         * player's counsel on what to build: { key (forts.js plansFor's), weight, until }), depotAt
         * (the turn its rulers last built a supply depot, or null: supply.js DEPOT.again) }.
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
                stores: noStores(),
                build: null,
                depotAt: null,
            };
        });

        /** The places fought over: { id, kind, name, at, race (whose it was), owner, garrison, raidedAt }. */
        this.towns = plan.places
            .filter(({ kind }) => FOUGHT_OVER.includes(kind))
            .map(({ id, kind, name, at, race }) => ({ id, kind, name, at: [...at], race, owner: race, garrison: HOLDINGS[kind].garrison, raidedAt: -Infinity }));

        /**
         * Each people's works (WORKED): { id (its plan site's), kind ("lumber mill", "mine",
         * "quarry"), name, at, race (whose it was), owner (whose it is), guard, escort (its
         * convoy's guards, home), yard (what's waiting there to be carted), held (overrun by the
         * wild: OVERRUN), band (how strong those holding it are) }.
         */
        this.works = worksOf(plan);

        /**
         * The forces out in the world: { id, realm, kind ("army", "reserve", "reinforcement",
         * "supply", "expedition", "envoy", "convoy"), size, at ([x, y] metres), path (the way it's going),
         * leg (the point on it it's gone past), target, home (the town it set out from, an army's
         * or reserve's its people's seat; a convoy's works), mission, about, since (the turn it
         * set out) }.
         * - An army (armies.js): `mission` "muster" (at home, being made up), "camp" (going to
         *   build a camp, or to its camp), "attack" (on what it's attacking: `target`, a town's,
         *   a works', a fortification's or a camp's id), "regroup" (beaten back to its camp, being
         *   made up), "home"; `camp` (the camp it's staged from), `orders` (a player's: { kind,
         *   about, by }, until they're carried out), `went` (its strength when it went in),
         *   `supply` ({ due: the turn its next wagon's to be sent, missed: how many in a row haven't
         *   got through }: supply.js).
         * - A reserve: `mission` "home" (at its people's seat), "defend" (`target`: the enemy
         *   army it's going to fall on), "back".
         * - Reinforcements: `target` (the army's or reserve's id they're joining).
         * - A supply wagon (supply.js): `mission` "army" (`target`: the army it's taking a load to)
         *   or "depot" (`target`: the depot it's taking a load to); `home` (the seat's or depot's
         *   id it came from). Its `size` is its guards'.
         * - An expedition, now only to win back its people's works from the wild ("retake").
         * - An envoy's `mission` and `about`; a convoy's `cargo` ({ [resource]: amount }, while it's
         *   carrying) and `back` (going home empty).
         */
        this.forces = [];
        this.nextForce = 1;

        /**
         * The forward camps the armies are staged from (armies.js CAMP): { id, realm, at, guard
         * (those holding it), built (the turn it was finished: null while it's going up), done
         * (when it will be), toward (the town or works it was built before), used (the turn an
         * army was last near it), skirmished (the turn its skirmishers last went out) }.
         */
        this.camps = [];
        this.nextCamp = 1;

        /**
         * The supply depots built (supply.js DEPOT): { id, realm, at, guard (those holding it),
         * built (the turn it was finished: null while it's going up), done (when it will be),
         * level (the loads it holds), toward (the town or works the camp it was built for was
         * before), used (the turn it last sent a wagon), by (a player's people whose orders it
         * was, or null) }.
         */
        this.depots = [];
        this.nextDepot = 1;

        /**
         * The fortifications built (forts.js FORTS, docs/WAR.md *Fortifications*): { id, kind
         * ("tower", "garrison"), realm (whose it is), at ([x, y] metres), hp, about (the town's or
         * works' id it guards), toward (the town it faces), built (the turn it was), by (a player's
         * people who counselled it, or null) }.
         */
        this.forts = [];
        this.nextFort = 1;

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
         * What a player's near (ids: watch()): what's done to it is played out in the world for a
         * while (WATCH_TURNS), not reckoned here.
         */
        this.watched = new Set();

        /**
         * The places worth finding whose occupiers were put to the sword (core/places.js): by the
         * place's id, { cleared: the turn it was, times: how often it's been }. Empty a while, then
         * held again (places.js holderOf).
         */
        this.places = {};

        // (Each people's reserve, at its seat, made up as its towns can: armies.js)
        for (const realm of this.realms) {
            this.#reserveFor(realm);
        }

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

    /** A camp (by its id), or null. */
    camp(id) {
        return this.camps.find((camp) => camp.id === id) ?? null;
    }

    /** A supply depot (supply.js), by its id, or null. */
    depot(id) {
        return this.depots.find((depot) => depot.id === id) ?? null;
    }

    /** A people's army (armies.js), or null if it has none raised. */
    armyOf(id) {
        return this.forces.find((force) => force.kind === "army" && force.realm === id) ?? null;
    }

    /** A people's reserve, or null. */
    reserveOf(id) {
        return this.forces.find((force) => force.kind === "reserve" && force.realm === id) ?? null;
    }

    /**
     * How strong a people's army (or reserve) can be now (armies.js fullOf): the stage's share of
     * the most, half that for a vassal.
     */
    fullOf(id) {
        return fullOf(STAGES[this.stage].army, { vassal: Boolean(this.realm(id)?.overlord) });
    }

    /** A works (by its plan site's id), or null. */
    workAt(id) {
        return this.works.find((each) => each.id === id) ?? null;
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

    /** A realm's own forces: its garrisons, its works' guards and convoys' at home, those it has out (envoys and supply wagons aside), and its camps' and depots'. */
    power(id) {
        return (
            this.towns.filter(({ owner }) => owner === id).reduce((sum, { garrison }) => sum + garrison, 0) +
            this.works.filter(({ owner, held }) => owner === id && !held).reduce((sum, { guard, escort }) => sum + guard + escort, 0) +
            this.forces.filter(({ realm, kind }) => realm === id && kind !== "envoy" && kind !== "supply").reduce((sum, { size }) => sum + size, 0) +
            [...this.camps, ...this.depots].filter(({ realm }) => realm === id).reduce((sum, { guard }) => sum + guard, 0)
        );
    }

    /** A liege's strength: its own and all its vassals' (and theirs). */
    strength(id) {
        return this.realms.filter((realm) => realm.alive && this.liege(realm.id) === id).reduce((sum, realm) => sum + this.power(realm.id), 0);
    }

    /**
     * What a people and its friends (its liege, its vassals, its allies) see now, for the war table
     * (docs/WAR.md *The war table*; armies.js SIGHT): round each of their camps that's up, its
     * scout, as far as SIGHT.scout; round each of their armies and reserves out, SIGHT.army; round
     * each of their depots that's up and each of their towns (from its edge), SIGHT.holding.
     * [{ id, realm, kind ("scout", "army", "reserve", "depot", "town"), at, reach (metres) }]
     */
    sight(id) {
        const friends = new Set(this.realms.filter((realm) => realm.alive && this.friendly(id, realm.id)).map((realm) => realm.id));
        const sources = [];

        for (const camp of this.camps) {
            if (friends.has(camp.realm) && camp.built !== null) {
                sources.push({ id: camp.id, realm: camp.realm, kind: "scout", at: camp.at, reach: SIGHT.scout });
            }
        }

        for (const force of this.forces) {
            if (friends.has(force.realm) && (force.kind === "army" || force.kind === "reserve") && force.size > 0) {
                sources.push({ id: force.id, realm: force.realm, kind: force.kind, at: force.at, reach: SIGHT.army });
            }
        }

        for (const depot of this.depots) {
            if (friends.has(depot.realm) && depot.built !== null) {
                sources.push({ id: depot.id, realm: depot.realm, kind: "depot", at: depot.at, reach: SIGHT.holding });
            }
        }

        for (const town of this.towns) {
            if (friends.has(town.owner)) {
                sources.push({ id: town.id, realm: town.owner, kind: "town", at: town.at, reach: SIGHT.holding + this.#radius(town.id) });
            }
        }

        return sources;
    }

    /**
     * Whether a people and its friends see a point now (`at`), or anything of it within `edge`
     * metres of it; `sight` as sight(id) gave it, if it's been worked out.
     */
    sees(id, at, edge = 0, sight = this.sight(id)) {
        return sight.some((source) => apart(source.at, at) <= source.reach + edge);
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
        this.#keepUp();
        this.#work();
        this.#fade();

        for (const realm of this.realms) {
            if (realm.alive && !realm.overlord) {
                this.#decide(realm);
            }
        }

        this.#march();
        this.#encamp();
        this.#provision();
        this.#engage();
        this.#replenish();
        this.#assaults();
        this.#waylay();
        this.#ambush();
        this.#overrun();
        this.#rebel();
        this.#reckon();
    }

    /** The strongest player's might (0 to 8, from their skills, gear and followers): the war comes on with it. */
    setMight(might) {
        this.might = Math.max(0, Number(might) || 0);
    }

    /**
     * Losses in a fight played out in the world (from M6): a town's garrison, a works' guard, a
     * camp's or a depot's guard or a force (by id) loses `count`, brought down by the people `by`
     * (a realm's id, or null). A town's garrison put down to the last by a people at war with its
     * holders is theirs (docs/WAR.md *Standing armies*: no other way to take one), held by a few of
     * them (TAKEN), if the age lets towns of its kind be taken; but a seat only once its ruler and
     * the captain of its guard are put down too (LEADERS: `leadersFell`). A camp's or a depot's,
     * it's razed; an army put down to the last is gone. Returns how it went: "taken", "leaders" (a
     * seat's garrison down, its leaders left to fight), "razed", or null.
     */
    loss(id, count, { by = null } = {}) {
        const town = this.town(id);
        const works = town ? null : this.workAt(id);
        const camp = town || works ? null : (this.camp(id) ?? this.depot(id));
        const force = town || works || camp ? null : this.force(id);
        const lost = Math.max(0, Math.round(count));

        if (town) {
            town.garrison = Math.max(0, town.garrison - lost);

            if (town.garrison <= 0 && this.#takeable(town, by)) {
                if (this.realm(town.owner)?.seat === town.id) {
                    return "leaders";
                }

                this.#hold(town, by, Math.ceil(HOLDINGS[town.kind].garrison * TAKEN), { how: "played" });

                return "taken";
            }
        } else if (works) {
            // (Its band, if the wild hold it; else its guard)
            works[works.held ? "band" : "guard"] = Math.max(0, works[works.held ? "band" : "guard"] - lost);
        } else if (camp) {
            camp.guard = Math.max(0, camp.guard - lost);

            if (this.depots.includes(camp)) {
                if (camp.guard <= 0) {
                    this.#razeDepot(camp, by, { played: true });

                    return "razed";
                }
            } else if (camp.guard <= 0 && !this.forces.some((force) => force.kind === "army" && force.camp === camp.id && apart(force.at, camp.at) <= CLOSE.fight)) {
                this.#razeCamp(camp, by, { played: true });

                return "razed";
            }
        } else if (force) {
            force.size = Math.max(0, force.size - lost);

            // (An army put to the sword to the last in the world: gone; reinforcements too)
            if (force.kind === "army" && force.size <= 0) {
                this.#destroyed(force);
            } else if (force.kind === "reinforcement" && force.size <= 0) {
                this.forces.splice(this.forces.indexOf(force), 1);

                if (by) {
                    this.#emit("intercepted", { realm: force.realm, by, killed: lost, lost: 0, at: [...force.at] });
                }
            }
        }

        return null;
    }

    /**
     * A seat's ruler and the captain of its guard put down in the world (docs/WAR.md *The armies
     * near a player*), its garrison down before them, by the people `by` (a realm's id): it's
     * theirs, as a town put to the sword to the last is (`loss`), if they may take it. Returns
     * "taken", or null.
     */
    leadersFell(id, by) {
        const town = this.town(id);

        if (!town || town.garrison > 0 || this.realm(town.owner)?.seat !== town.id || !this.#takeable(town, by)) {
            return null;
        }

        this.#hold(town, by, Math.ceil(HOLDINGS[town.kind].garrison * TAKEN), { how: "played" });

        return "taken";
    }

    // Whether a people (`by`) may take a town, its garrison down: they're at war with its holders,
    // and the age lets towns of its kind be taken
    #takeable(town, by) {
        return Boolean(by) && Boolean(this.realm(by)?.alive) && this.hostile(by, town.owner) && STAGES[this.stage].take.includes(town.kind);
    }

    /**
     * A works won in the world (docs/WAR.md *The works*): its guard, or the band holding it, put
     * to the sword by a player of a people (`by`, a realm's id). Held by the wild, it's cleared:
     * its own people's again, or `by`'s if they're at war with them. Held by a people at war with
     * `by`, it's seized. Either way it's held by a few of its new holders (OVERRUN.held). Returns
     * how it went: "cleared", "seized", or null if it wasn't to be won (anyone left, or a friend's).
     */
    win(id, by) {
        const works = this.workAt(id);
        const realm = this.realm(by);

        if (!works || !realm?.alive) {
            return null;
        }

        if (works.held) {
            if (works.band > 0) {
                return null;
            }

            const from = works.owner;
            const owner = this.realm(from)?.alive && !this.hostile(by, from) ? from : by;

            Object.assign(works, { held: false, band: 0, owner, guard: OVERRUN.held, yard: 0 });
            this.#emit("cleared", { works: works.id, by, owner, played: true });

            if (owner !== by && this.realm(owner)) {
                this.remember(owner, by, 8);
            }

            return "cleared";
        }

        if (works.guard > 0 || !this.hostile(by, works.owner)) {
            return null;
        }

        this.#seize(works, by, { played: true });

        return "seized";
    }

    /**
     * The towns, works, fortifications, camps and envoys a player's near (ids): an army waits
     * before those it's attacking a while (WATCH_TURNS) rather than its fight being reckoned here,
     * and those envoys go on as they're seen to (move), as fast as they walk; those works aren't
     * fallen on here, nor overrun, while a player's there.
     */
    watch(ids) {
        this.watched = new Set(ids);
    }

    /** A place's occupiers put to the sword and their leader killed (core/places.js): cleared this turn. */
    clearPlace(id) {
        this.places[id] = { cleared: this.turn, times: (this.places[id]?.times ?? 0) + 1 };
    }

    /**
     * An envoy, a convoy, a supply wagon, reinforcements, an army or a reserve a player's near,
     * where it's got to in the world: `at` ([x, y] metres), past the point `leg` of its path. At
     * the end of it, an envoy's heard (and gone); a convoy's goods go into its people's stores (and
     * it turns for home), or it's home; a supply wagon's load is its army's or depot's (or, they
     * gone, it's gone); reinforcements join theirs (or, it gone, go into the nearest of their
     * people's towns), taking in another column for it near them on its own way; an army or
     * reserve does what it does there at its next turn (#march). Returns whether an envoy, a
     * convoy, a supply wagon or reinforcements are at the end of their way.
     */
    move(id, at, leg) {
        const force = this.force(id);

        if (force?.kind === "reinforcement") {
            force.at = [Math.round(at[0] * 10) / 10, Math.round(at[1] * 10) / 10];

            return this.#reinforced(force);
        }

        if (force?.kind === "supply") {
            force.at = [Math.round(at[0] * 10) / 10, Math.round(at[1] * 10) / 10];

            const to = force.mission === "depot" ? this.depot(force.target) : this.force(force.target);

            // (Its army or depot gone: it's gone too, as it would be on its own way)
            if (!to) {
                this.forces.splice(this.forces.indexOf(force), 1);

                return true;
            }

            if (apart(force.at, to.at) <= SUPPLY.reach) {
                this.#deliver(force, to);

                return true;
            }

            return false;
        }

        if (force?.kind === "army" || force?.kind === "reserve") {
            force.at = [Math.round(at[0] * 10) / 10, Math.round(at[1] * 10) / 10];
            force.leg = Math.max(force.leg, Math.min(leg, force.path.length - 1));

            return false;
        }

        if (force?.kind !== "envoy" && force?.kind !== "convoy") {
            return false;
        }

        force.at = [Math.round(at[0] * 10) / 10, Math.round(at[1] * 10) / 10];
        force.leg = Math.max(force.leg, Math.min(leg, force.path.length - 1));

        if (force.leg < force.path.length - 1) {
            return false;
        }

        // (A convoy at its seat, its goods in, and back on the road for more; or home, its guards
        // home too: either way, at the end of the way it was going)
        if (force.kind === "convoy") {
            this.#onConvoy(force);
        } else {
            this.#hear(force);
        }

        return true;
    }

    /**
     * A convoy beaten in the world (docs/WAR.md *Convoys*): every one of its guards brought down by
     * one of the people `by` (a realm's id, or null for anyone else). What it carried is lost to
     * its people, half of it `by`'s, and they bear them a grudge for it. Returns what it carried
     * ({ [resource]: amount }), or null if it wasn't a convoy.
     */
    plundered(id, by) {
        const convoy = this.force(id);

        if (convoy?.kind !== "convoy") {
            return null;
        }

        const cargo = convoy.cargo ?? {};
        const plunderer = this.realm(by);

        this.forces.splice(this.forces.indexOf(convoy), 1);

        if (plunderer) {
            for (const [resource, amount] of Object.entries(cargo)) {
                plunderer.stores[resource] = Math.round((plunderer.stores[resource] + amount / 2) * 10) / 10;
            }

            this.remember(convoy.realm, by, -8);
        }

        this.#emit("ambushed", { realm: convoy.realm, by: plunderer ? by : null, faction: null, works: convoy.home, cargo, beaten: false, force: convoy.id, played: true });

        return cargo;
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
     * - { march: a town's id }: its army sent against it next (one of an enemy's towns);
     * - { peace: a realm's id }: an envoy sent to it for a truce (a realm they're at war with);
     * - { war: a realm's id }: war declared on it (a realm they know, and are neutral with).
     * Heeded for COUNSEL_TURNS, or until it's acted on; a newer counsel takes the place of the
     * last. Returns whether it could be given.
     */
    counsel(id, advice, weight) {
        const realm = this.realm(id);
        const [kind, about] = Object.entries(advice ?? {}).find(([key]) => ["march", "peace", "war", "build"].includes(key)) ?? [];

        if (!realm?.alive || realm.overlord || !kind || !(weight > 0)) {
            return false;
        }

        const fitting = {
            march: () => this.town(about) && this.hostile(id, this.liege(this.town(about).owner)),
            peace: () => this.realm(about)?.alive && this.hostile(id, about),
            war: () => this.realm(about)?.alive && !this.realm(about).overlord && this.relation(id, about) === "neutral",
            build: () => plansFor(this, id).some(({ key }) => key === about),
        }[kind];

        if (!fitting()) {
            return false;
        }

        // (What to build is counsel of its own, heeded alongside the rest)
        if (kind === "build") {
            realm.build = { key: about, weight: clamp(weight, 0, 1), until: this.turn + COUNSEL_TURNS };
            this.#emit("counsel", { realm: id, build: about });

            return true;
        }

        realm.counsel = { [kind]: about, weight: clamp(weight, 0, 1), until: this.turn + COUNSEL_TURNS };
        this.#emit("counsel", { realm: id, [kind]: about });

        return true;
    }

    /**
     * A player's orders to their people's army (docs/WAR.md *Standing armies*: a Lord's or a
     * Councillor's, from the war table at their seat; core/standing.js OPENS), carried out before
     * anything its rulers would have it do, until they are (or can't be):
     * - { raise: true }: an army raised at its seat, made up from its towns as they can;
     * - { disband: true }: its army sent home, each of it back into the garrison of one of their
     *   towns, the nearest first;
     * - { camp: [x, y] }: to build a camp there (or to go to theirs there), and hold;
     * - { attack: an id }: to attack an enemy's town, works, fortification, camp or depot, till
     *   it's taken or razed, falling back to be made up as it must: from the camp of theirs in
     *   reach of it (CAMP.reach), or one built before it first, as its rulers would (#campBefore);
     * - { home: true }: back to its seat;
     * - { supply: true, or a depot's id }: supplies asked for (docs/WAR.md *Supply*): a wagon sent
     *   to it now, from that depot if it can supply it, else from the depot nearest it that can or
     *   its seat, if none's on its way already;
     * - { depot: [x, y] }: a supply depot built there, if it's in another people's lands and they
     *   can pay for it (supply.js DEPOT).
     * An army still mustering at its seat goes to camp or attack once it's made up (ARMY.ready).
     * `by`: the player's people (whose orders they were, for the news). Returns whether they could
     * be given.
     */
    order(id, orders, { by = null } = {}) {
        const realm = this.realm(id);
        const [kind, about] = Object.entries(orders ?? {}).find(([key]) => ["raise", "disband", "camp", "attack", "home", "supply", "depot"].includes(key)) ?? [];
        const army = this.armyOf(id);
        const point = (value) => (Array.isArray(value) && value.length === 2 && value.every(Number.isFinite) ? [Math.round(value[0]), Math.round(value[1])] : null);

        if (!realm?.alive || !kind) {
            return false;
        }

        if (kind === "raise") {
            if (army) {
                return false;
            }

            this.#raise(realm, { by });

            return true;
        }

        if (kind === "depot") {
            const depot = point(about) && this.#buildDepot(realm, point(about), { by, ordered: true });

            if (depot) {
                this.#emit("ordered", { realm: id, depot: depot.id, by });
            }

            return Boolean(depot);
        }

        if (!army) {
            return false;
        }

        if (kind === "disband") {
            this.#disbandArmy(army, { by });

            return true;
        }

        if (kind === "supply") {
            const from = typeof about === "string" ? this.depot(about) : null;

            if (typeof about === "string" && !this.#supplies(from, army)) {
                return false;
            }

            const sent = army.mission !== "muster" && this.#feed(army, { now: true, from });

            if (sent) {
                this.#emit("ordered", { realm: id, army: army.id, supply: true, ...(from ? { from: from.id } : {}), by });
            }

            return sent;
        }

        // (Still mustering, not made up yet: to it once it is: #command)
        const waits = army.mission === "muster" && army.size < Math.max(1, this.fullOf(id) * ARMY.ready);

        if (kind === "camp") {
            const at = point(about);

            if (!at) {
                return false;
            }

            army.orders = { kind, about: at, by };

            if (!waits) {
                this.#toCamp(army, at);
            }
        } else if (kind === "attack") {
            const target = this.#targetOf(about);

            if (!target || !this.hostile(id, target.realm)) {
                return false;
            }

            army.orders = { kind, about, by };

            if (!waits && !this.#toAttack(army, about)) {
                this.#campBefore(army, about);
            }
        } else {
            army.orders = { kind, about: null, by };
            this.#goHome(army);
        }

        this.#emit("ordered", { realm: id, army: army.id, [kind]: about ?? true, by });

        return true;
    }

    /**
     * A supply wagon taken in the world (docs/WAR.md *Supply*): its guards all brought down by one
     * of the people `by` (a realm's id, or null for anyone else). Its load's lost: for its army, a
     * load that didn't get through. Returns whether it was a supply wagon.
     */
    wagonTaken(id, by = null) {
        const wagon = this.force(id);

        if (wagon?.kind !== "supply") {
            return false;
        }

        this.#wagonLost(wagon, by);

        return true;
    }

    /** A fortification, by its id (forts), or null. */
    fort(id) {
        return this.forts.find((fort) => fort.id === id) ?? null;
    }

    /**
     * Build a fortification for a realm (forts.js): one of its council's plans (plansFor's: { kind,
     * at, about, toward }), or anywhere else it may build (mayBuild), if its stores hold what it
     * costs and it has fewer than the most of the kind it keeps. `by`: a player's people whose counsel
     * it was, if any. Returns the fortification built, or null.
     */
    build(id, { kind, at, about = null, toward = null }, { by = null } = {}) {
        const realm = this.realm(id);
        const spec = FORTS[kind];

        if (!realm?.alive || !spec || !mayBuild(this, id, at) || !affords(realm.stores, spec.cost)) {
            return null;
        }

        if (this.forts.filter((fort) => fort.realm === id && fort.kind === kind).length >= spec.most) {
            return null;
        }

        for (const [good, amount] of Object.entries(spec.cost)) {
            realm.stores[good] = Math.round((realm.stores[good] - amount) * 10) / 10;
        }

        const fort = { id: `fort-${this.nextFort++}`, kind, realm: id, at: [...at], hp: spec.hp, about, toward, built: this.turn, by, struck: null, ...(kind === "garrison" ? fullSquads(this.turn) : {}) };

        this.forts.push(fort);
        this.#emit("built", { fort: fort.id, kind, realm: id, at: [...at], about, by });

        return fort;
    }

    /**
     * A fortification struck in the world (from the host): `amount` of its strength lost to the
     * people `by` (a realm's id, or null for the wild). Brought to nothing, it's razed. Returns
     * whether it's still standing.
     */
    strike(id, amount, by = null) {
        const fort = this.fort(id);

        if (!fort) {
            return false;
        }

        fort.hp = Math.max(0, Math.round((fort.hp - amount) * 10) / 10);
        fort.struck = this.turn;

        if (fort.hp <= 0) {
            this.#raze(fort, by, { played: true });

            return false;
        }

        return true;
    }

    /**
     * One of a forward garrison's squads (SQUAD_NAMES: "patrol-0", "patrol-1", "assault") lost
     * `count` of its soldiers in the world (from the host). Returns how many it has left.
     */
    squadLost(id, squad, count = 1) {
        const fort = this.fort(id);
        const k = SQUAD_NAMES.indexOf(squad);

        if (!fort?.squads || k < 0) {
            return 0;
        }

        fort.squads[k] = Math.max(0, fort.squads[k] - count);

        return fort.squads[k];
    }

    /**
     * The fortification that covers a town (FORT_COVER): its holders' (or their liege's, or one
     * serving the same) nearest within FORT_COVER of its edge, or null.
     */
    coverOf(town) {
        const edge = this.#radius(town.id);
        const liege = this.liege(town.owner);
        let best = null;

        for (const fort of this.forts) {
            const distance = apart(fort.at, town.at) - edge;

            if (distance <= FORT_COVER && this.liege(fort.realm) === liege && (!best || distance < best.distance)) {
                best = { fort, distance };
            }
        }

        return best?.fort ?? null;
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
            works: this.works,
            forces: this.forces,
            nextForce: this.nextForce,
            forts: this.forts,
            nextFort: this.nextFort,
            camps: this.camps,
            nextCamp: this.nextCamp,
            depots: this.depots,
            nextDepot: this.nextDepot,
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
        if (snapshot.version !== WAR_VERSION && ![1, 2, 3, 4, 5].includes(snapshot.version)) {
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

        // (A war kept before the works (version 1) has every works as it would start, and every
        // realm's stores empty)
        war.works = kept.works ?? worksOf(plan);

        for (const realm of war.realms) {
            realm.stores ??= noStores();
            realm.build ??= null;
            realm.depotAt ??= null;
        }

        // (A war kept before the fortifications (version 2 or before) has none; before their squads
        // (version 3), each forward garrison's are whole)
        war.forts = (kept.forts ?? []).map((fort) => ({ ...fort, struck: fort.struck ?? null, ...(fort.kind === "garrison" && !fort.squads ? fullSquads(kept.turn) : {}) }));
        war.nextFort = kept.nextFort ?? 1;
        war.camps = kept.camps ?? [];
        war.nextCamp = kept.nextCamp ?? 1;
        war.depots = kept.depots ?? [];
        war.nextDepot = kept.nextDepot ?? 1;

        // (A war kept before the standing armies (version 4 or before): its expeditions against
        // towns and works, its camps and its relief all home in their garrisons, and each people's
        // reserve at its seat, to be made up)
        if (kept.version < 5) {
            for (const force of war.forces.filter(({ kind, mission }) => kind === "camp" || kind === "relief" || (kind === "expedition" && mission !== "retake"))) {
                const home = war.town(force.home);

                if (home?.owner === force.realm) {
                    home.garrison = Math.min(Math.round(HOLDINGS[home.kind].garrison * 1.5), home.garrison + force.size);
                }
            }

            war.forces = war.forces.filter(({ kind, mission }) => !(kind === "camp" || kind === "relief" || (kind === "expedition" && mission !== "retake")));

            for (const realm of war.realms.filter(({ alive }) => alive)) {
                war.#reserveFor(realm);
            }
        }

        // (A war kept before the armies' supply (version 5 or before): each army's next wagon due
        // a while from now, none missed)
        for (const army of war.forces.filter(({ kind }) => kind === "army")) {
            army.supply ??= { due: war.turn + SUPPLY.every, missed: 0 };
        }

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

        for (const each of [...this.forces, ...this.camps]) {
            spots.get(each.realm)?.push(each.at);
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

            // (Fallen on by skirmishers lately: nothing to pay)
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

                // (And some of its army and reserve desert)
                for (const force of this.forces.filter(({ realm: id, kind }) => id === realm.id && (kind === "army" || kind === "reserve"))) {
                    force.size = Math.floor(force.size * 0.95);
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
        // (A player's counsel is heeded only so long)
        if (realm.counsel && this.turn > realm.counsel.until) {
            realm.counsel = null;
        }

        const own = [realm, ...this.realms.filter((other) => other.alive && other.overlord && this.liege(other.id) === realm.id)];

        for (const each of own) {
            this.#muster(each);
            this.#fortify(each);
        }

        this.#diplomacy(realm);
        this.#declare(realm);

        // Each people's reserve out against an enemy army in its lands (or home), its works won
        // back from the wild, and its army sent where the war needs it
        for (const each of own) {
            this.#defend(each);
            this.#retake(each);
            this.#command(each, realm);
            this.#depotFor(each);
        }
    }

    // A people's towns raise what soldiers they can this turn (HOLDINGS produce each, a troop's
    // cost each, keeping some gold back for the war, the more the more warlike), in this order
    // (docs/WAR.md *Standing armies*): their garrisons to half (the seat first, then those
    // threatened, then the emptiest); its reserve made up, then its army, from the towns nearest
    // them, sent as reinforcements; then its garrisons to the full (not their seat's in its last
    // stand). Then its works' guards, and their convoys'
    #muster(realm) {
        const towns = this.towns.filter(({ owner }) => owner === realm.id);
        const upkeep = this.power(realm.id) * COSTS.upkeep * 3;
        const keep = upkeep + (this.enemiesOf(this.liege(realm.id)).length ? 35 : 10);
        // (The more warlike, the readier its folk to take up arms: MUSTER)
        const readier = 1 + (realm.leader.traits.aggression - 0.5) * MUSTER.warlike;
        const left = new Map(
            towns.map((town) => {
                const each = HOLDINGS[town.kind].produce * readier;

                return [town.id, Math.floor(each) + (this.random.chance(each - Math.floor(each)) ? 1 : 0)];
            }),
        );
        let afford = Math.max(0, Math.floor((realm.treasury - keep) / COSTS.troop));
        const raise = (town, count) => {
            left.set(town.id, left.get(town.id) - count);
            realm.treasury -= count * COSTS.troop;
            afford -= count;
        };
        const first = (town) => (town.id === realm.seat ? 2 : this.#threatened(town) ? 1 : 0);
        // (Not their seat's while its garrison's down with a player near: its ruler and the captain
        // of its guard making their last stand there)
        const standing = (town) => town.id === realm.seat && town.garrison <= 0 && this.watched.has(town.id);
        const garrisons = (to) => {
            const order = towns
                .map((town) => ({ town, want: Math.ceil(HOLDINGS[town.kind].garrison * to) - town.garrison }))
                .filter(({ town, want }) => want > 0 && !standing(town))
                .sort((a, b) => first(b.town) - first(a.town) || b.want - a.want || (a.town.id < b.town.id ? -1 : 1));

            for (const { town, want } of order) {
                const raised = Math.min(want, left.get(town.id), afford);

                if (raised > 0) {
                    town.garrison += raised;
                    raise(town, raised);
                }
            }
        };

        garrisons(0.5);

        for (const force of [this.reserveOf(realm.id), this.armyOf(realm.id)]) {
            let short = force ? this.fullOf(realm.id) - force.size - this.#coming(force) : 0;

            for (const town of short > 0 ? [...towns].sort((a, b) => apart(a.at, force.at) - apart(b.at, force.at) || (a.id < b.id ? -1 : 1)) : []) {
                const sent = Math.min(short, left.get(town.id), afford);

                if (sent > 0) {
                    this.#reinforce(town, force, sent);
                    raise(town, sent);
                    short -= sent;
                }
            }
        }

        garrisons(1);

        // Then its works' guards, and their convoys' (the emptiest first): a few a turn each
        const works = this.works
            .filter(({ owner, held }) => owner === realm.id && !held)
            .map((each) => ({ each, want: WORKED.guard - each.guard + (this.#convoyOf(each) ? 0 : CONVOY.guards + 1 - each.escort) }))
            .filter(({ want }) => want > 0)
            .sort((a, b) => b.want - a.want || (a.each.id < b.each.id ? -1 : 1));

        for (const { each } of works) {
            const guard = Math.min(WORKED.guard - each.guard, afford, 3);
            const escort = this.#convoyOf(each) ? 0 : Math.min(CONVOY.guards + 1 - each.escort, afford - Math.max(0, guard), 3);

            if (guard <= 0 && escort <= 0) {
                break;
            }

            each.guard += Math.max(0, guard);
            each.escort += Math.max(0, escort);
            realm.treasury -= (Math.max(0, guard) + Math.max(0, escort)) * COSTS.troop;
            afford -= Math.max(0, guard) + Math.max(0, escort);
        }
    }

    // --- Fortifications (docs/WAR.md *Fortifications*) ---

    // Each fortification kept up from its people's stores (FORTS upkeep): mended a little while it
    // is, falling into ruin while it isn't, and given up at nothing; a fallen people's given up
    #keepUp() {
        for (const fort of [...this.forts]) {
            const realm = this.realm(fort.realm);
            const spec = FORTS[fort.kind];

            if (!realm?.alive) {
                this.#raze(fort, null, { abandoned: true });
                continue;
            }

            if (affords(realm.stores, spec.upkeep)) {
                for (const [good, amount] of Object.entries(spec.upkeep)) {
                    realm.stores[good] = Math.round((realm.stores[good] - amount) * 100) / 100;
                }

                // (Mended, once it's not been fallen on a while)
                if ((fort.struck ?? null) === null || this.turn - fort.struck > FORT_SIEGE.rest) {
                    fort.hp = Math.min(spec.hp, Math.round(fort.hp + spec.hp * FORT_SIEGE.mend));
                }
            } else {
                fort.hp = Math.max(0, Math.round(fort.hp - spec.hp * FORT_SIEGE.decay));

                if (fort.hp <= 0) {
                    this.#raze(fort, null, { abandoned: true });
                }
            }
        }
    }

    // A realm's council sits (forts.js plansFor): the best of its plans it can afford, keeping back
    // enough of its stores to keep up what it has (COUNCIL.reserve turns of it), is built; a
    // player's counsel weighs for the one they counselled. One a turn at most
    #fortify(realm) {
        if (realm.build && this.turn > realm.build.until) {
            realm.build = null;
        }

        // (Nothing to build with yet: the council needn't sit)
        if (!Object.values(FORTS).some(({ cost }) => affords(realm.stores, cost))) {
            return;
        }

        const plans = plansFor(this, realm.id);

        if (!plans.length) {
            return;
        }

        const upkeep = {};

        for (const fort of this.forts.filter((each) => each.realm === realm.id)) {
            for (const [good, amount] of Object.entries(FORTS[fort.kind].upkeep)) {
                upkeep[good] = (upkeep[good] ?? 0) + amount * COUNCIL.reserve;
            }
        }

        const weighed = plans
            .map((plan) => ({ plan, score: plan.score * (realm.build?.key === plan.key ? 1 + COUNCIL.counsel * realm.build.weight : 1) }))
            .sort((a, b) => b.score - a.score || (a.plan.key < b.plan.key ? -1 : 1));

        for (const { plan } of weighed) {
            const needs = Object.fromEntries(Object.entries(plan.cost).map(([good, amount]) => [good, amount + (upkeep[good] ?? 0)]));

            if (affords(realm.stores, needs)) {
                const counselled = realm.build?.key === plan.key;
                const fort = this.build(realm.id, plan, { by: counselled ? realm.id : null });

                if (fort && counselled) {
                    realm.build = null;
                }

                return;
            }

            // (The best it can't afford yet it saves for, rather than building lesser ones)
            if (plan === weighed[0].plan) {
                return;
            }
        }
    }

    // Each forward garrison's squads made up as they've fallen (SQUADS): one of them every so many
    // turns, the emptiest squad first, while its people can pay
    #replenish() {
        for (const fort of this.forts.filter(({ squads }) => squads)) {
            const realm = this.realm(fort.realm);

            if (!realm?.alive || this.turn - (fort.mustered ?? 0) < SQUADS.every || realm.treasury < SQUADS.cost) {
                continue;
            }

            const full = SQUAD_NAMES.map((name) => (name === "assault" ? SQUADS.assault : SQUADS.patrol));
            const short = fort.squads
                .map((count, k) => ({ k, want: (full[k] - count) / full[k] }))
                .filter(({ want }) => want > 0)
                .sort((a, b) => b.want - a.want || a.k - b.k)[0];

            if (short) {
                fort.squads[short.k] += 1;
                realm.treasury -= SQUADS.cost;
                fort.mustered = this.turn;
            }
        }
    }

    // Each forward garrison's assault team out against the nearest of the enemy's fortifications
    // within its reach (SQUADS), once it's strong enough: taking from its strength, and losing some
    // to its defenders; razed at nothing. Not where a player's near either: that's played out in
    // the world
    #assaults() {
        const assault = SQUAD_NAMES.indexOf("assault");

        for (const fort of this.forts.filter(({ squads }) => squads)) {
            const team = fort.squads[assault];

            if (team < SQUADS.ready || this.watched.has(fort.id) || !this.forts.includes(fort)) {
                continue;
            }

            const target = this.forts
                .filter((other) => other !== fort && !this.watched.has(other.id) && this.hostile(fort.realm, other.realm) && apart(other.at, fort.at) <= SQUADS.reach)
                .sort((a, b) => apart(a.at, fort.at) - apart(b.at, fort.at) || (a.id < b.id ? -1 : 1))[0];

            if (!target) {
                continue;
            }

            const toll = Math.min(team, target.kind === "garrison" ? FORT_SIEGE.garrison : FORT_SIEGE.tower);

            target.hp = Math.max(0, target.hp - team * SQUADS.hp);
            target.struck = this.turn;
            fort.squads[assault] = team - toll;
            this.#emit("assailed", { fort: target.id, kind: target.kind, realm: target.realm, by: fort.realm, from: fort.id, about: target.about });

            if (target.hp <= 0) {
                this.#raze(target, fort.realm);
            }
        }
    }

    // How far a place's ground reaches from its middle (metres: settle.js's radius for its kind)
    #radius(id) {
        this.radii ??= new Map(this.plan.places.map((place) => [place.id, place.radius ?? 0]));

        return this.radii.get(id) ?? 0;
    }

    // A fortification gone: razed by a people (`by`), or given up by its own
    #raze(fort, by, { abandoned = false, played = false } = {}) {
        if (!this.forts.includes(fort)) {
            return;
        }

        this.forts.splice(this.forts.indexOf(fort), 1);
        this.#emit(abandoned ? "abandoned" : "razed", { fort: fort.id, kind: fort.kind, realm: fort.realm, at: [...fort.at], about: fort.about, by: by ?? null, ...(played ? { played } : {}) });

        if (by && this.realm(by)) {
            this.remember(fort.realm, by, -6);
        }
    }

    // Is there an enemy army or camp near a town?
    #threatened(town) {
        return [...this.forces.filter(({ kind }) => kind === "army"), ...this.camps].some((each) => this.hostile(each.realm, town.owner) && apart(each.at, town.at) <= REACH.threat);
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

        // (Fighting more than they can bear, all their enemies together: a truce sought with the
        // strongest of them, the warier the sooner)
        const against = enemies.reduce((sum, enemy) => sum + this.strength(enemy), 0);

        if (enemies.length && against > strength * (1 + (1 - traits.caution) * DECLARE.bear) && this.random.chance(0.5)) {
            const strongest = enemies.reduce((best, enemy) => (this.strength(enemy) > this.strength(best) ? enemy : best));

            this.#envoy(realm, strongest, "truce");

            return;
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

        // (One war at a time; the most warlike open a second front, but only while they're winning)
        const fighting = this.enemiesOf(realm.id);
        const winning = traits.aggression >= DECLARE.twoFronts && strength > DECLARE.second * fighting.reduce((sum, enemy) => sum + this.strength(enemy), 0);

        if (fighting.length >= (winning ? 2 : 1)) {
            return;
        }

        // (Against whichever of them it thinks best to: the weaker, and those it bears a grudge
        // against; and the longer the war goes on, the more every people wants its share)
        const restless = Math.min(0.25, this.turn / 1200);
        const [best] = this.realms
            .filter((other) => other.alive && !other.overlord && other.id !== realm.id && this.relation(realm.id, other.id) === "neutral" && !this.#truce(realm.id, other.id))
            .map((other) => {
                const ratio = strength / Math.max(1, this.strength(other.id));
                const grudge = clamp(-(realm.standing[other.id] ?? 0) / 100, -1, 1) * traits.grudge;

                return { other, score: traits.aggression * 0.8 + traits.greed * 0.3 - traits.caution * 0.3 + grudge + clamp(ratio - 1, -0.5, 0.5) * DECLARE.odds + this.stage * DECLARE.age + restless };
            })
            .sort((a, b) => b.score - a.score || (a.other.id < b.other.id ? -1 : 1));

        if (best && best.score > 0.65 && this.random.chance(0.25)) {
            this.#war(realm.id, best.other.id);
        }
    }

    // A realm goes to war with another: the other's allies may join in against it
    #war(by, on) {
        this.#set(by, on, "hostile");
        this.remember(on, by, -15);
        this.#emit("declared", { by, on });

        for (const ally of this.realms) {
            if (ally.alive && !ally.overlord && ally.id !== by && ally.id !== on && this.relation(ally.id, on) === "allied" && this.relation(ally.id, by) !== "hostile" && !this.#truce(ally.id, by) && this.random.chance(0.3 + ally.leader.traits.loyalty * 0.6)) {
                this.#set(ally.id, by, "hostile");
                this.#emit("joined", { by: ally.id, on: by, for: on });
            }
        }
    }

    #set(a, b, state) {
        this.relations[pair(a, b)] = { state, since: this.turn };
    }

    // Whether two peoples made their peace (or broke off their alliance) too lately for their rulers
    // to go to war with each other again (DECLARE.truce)
    #truce(a, b) {
        const between = this.relations[pair(a, b)];

        return between?.state === "neutral" && this.turn - between.since < DECLARE.truce;
    }

    // The gold a realm can spend on the war (keeping enough back for a couple of turns' keep)
    #spare(realm) {
        return realm.treasury - this.power(realm.id) * COSTS.upkeep * 2;
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

    // Everyone on the move goes on: armies and reserves where they're going, reinforcements to
    // theirs, a band winning back its works to them, envoys to be heard, convoys to their seat
    #march() {
        for (const force of [...this.forces]) {
            // (An envoy, a convoy, a supply wagon or reinforcements a player's near go as they're
            // seen to go there: move)
            if (!this.forces.includes(force) || (["envoy", "convoy", "supply", "reinforcement"].includes(force.kind) && this.watched.has(force.id))) {
                continue;
            }

            // (An army or reserve a player's near goes as it marches there: move)
            if (force.kind === "army") {
                this.#onArmy(force, { still: this.watched.has(force.id) });
            } else if (force.kind === "reserve") {
                this.#onReserve(force, { still: this.watched.has(force.id) });
            } else if (force.kind === "reinforcement") {
                this.#onReinforcement(force);
            } else if (force.kind === "supply") {
                this.#onWagon(force);
            } else if (force.kind === "expedition") {
                this.#go(force, SPEEDS.march);
                this.#onExpedition(force);
            } else if (force.kind === "convoy") {
                this.#go(force, CONVOY.speed);
                this.#onConvoy(force);
            } else {
                this.#go(force, SPEEDS.envoy);

                if (force.leg >= force.path.length - 1) {
                    this.#hear(force);
                }
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

    // A band winning back its people's works from the wild, on its way
    #onExpedition(force) {
        const works = this.workAt(force.target);

        if (works) {
            this.#onWorks(force, works);
        } else {
            this.#disband(force, "withdrew");
        }
    }

    // A band before the works it's winning back from the wild: it falls on those holding it; not
    // while a player's near it, for a while (WATCH_TURNS). What's left of it goes home after
    #onWorks(force, works) {
        const retake = force.mission === "retake";

        if (retake ? works.owner !== force.realm || !works.held : works.held || !this.hostile(force.realm, works.owner)) {
            this.#disband(force, "withdrew");

            return;
        }

        if (apart(force.at, works.at) > REACH.fall && force.leg < force.path.length - 1) {
            return;
        }

        // (There: waiting, while a player's near it)
        force.arrived ??= this.turn;

        if (this.watched.has(works.id) && this.turn - force.arrived < WATCH_TURNS) {
            return;
        }

        const [sent, holding] = [force.size, retake ? works.band : works.guard];
        const { attackers, defenders } = this.#fight(sent, holding, 1, { by: force.realm, against: retake ? null : works.owner });
        const won = defenders === 0 && attackers > 0;

        force.size = attackers;
        works[retake ? "band" : "guard"] = defenders;
        this.#emit("battle", { realm: force.realm, against: retake ? null : works.owner, works: works.id, at: works.at, won, killed: holding - defenders, lost: sent - attackers });

        if (won && retake) {
            const guard = Math.min(WORKED.guard, attackers);

            Object.assign(works, { held: false, band: 0, guard, yard: 0 });
            force.size -= guard;
            this.#emit("retaken", { works: works.id, realm: force.realm });
        } else if (won) {
            const guard = Math.min(WORKED.guard, attackers);

            force.size -= guard;
            this.#seize(works, force.realm, { guard });
        } else if (!retake) {
            this.remember(works.owner, force.realm, -5);
        }

        this.#disband(force, null);
    }

    // A works seized by a realm (`by`): held by `guard` of theirs, its convoy's guards that were
    // home gone, what's in its yard theirs now; its old holders bear them a grudge
    #seize(works, by, { guard = OVERRUN.held, played = false } = {}) {
        const from = works.owner;

        Object.assign(works, { owner: by, guard, escort: 0, held: false, band: 0 });
        this.remember(from, by, -10);
        this.#emit("seized", { works: works.id, from, to: by, ...(played ? { played } : {}) });
    }

    // A works' convoy out, if it has one (its holders')
    #convoyOf(works) {
        return this.forces.find((force) => force.kind === "convoy" && force.home === works.id && force.realm === works.owner) ?? null;
    }

    // The way from a works to a town (its id): to the place nearest the works, and on by road
    #routeFrom(at, toId) {
        const way = this.#routeTo(toId, at);

        return way ? [...way].reverse() : null;
    }

    // A convoy at the end of its way: at its people's seat, its cargo into their stores (a
    // vassal's tribute in it to its liege), and back for more; home at its works, its guards home
    // there too (or, the works no longer theirs, into the nearest of their towns)
    #onConvoy(convoy) {
        if (convoy.leg < convoy.path.length - 1) {
            return;
        }

        if (!convoy.back) {
            const seat = this.town(convoy.target);
            const realm = this.realm(convoy.realm);

            if (seat?.owner === convoy.realm && realm?.alive) {
                const liege = realm.overlord ? this.realm(this.liege(realm.id)) : null;

                for (const [resource, amount] of Object.entries(convoy.cargo)) {
                    realm.stores[resource] = Math.round((realm.stores[resource] + amount * (liege ? 1 - TRIBUTE : 1)) * 10) / 10;

                    if (liege) {
                        liege.stores[resource] = Math.round((liege.stores[resource] + amount * TRIBUTE) * 10) / 10;
                    }
                }

                this.#emit("delivered", { realm: convoy.realm, works: convoy.home, cargo: convoy.cargo, force: convoy.id });
            } else {
                this.#emit("plundered", { realm: convoy.realm, by: seat?.owner ?? null, works: convoy.home, cargo: convoy.cargo, force: convoy.id });
            }

            Object.assign(convoy, { cargo: null, back: true, path: [...convoy.path].reverse(), leg: 0 });

            return;
        }

        const works = this.workAt(convoy.home);

        if (works?.owner === convoy.realm && !works.held) {
            works.escort += convoy.size;
            this.forces.splice(this.forces.indexOf(convoy), 1);
        } else {
            const home = this.#nearestOwn(convoy.realm, convoy.at);

            if (home) {
                home.garrison = Math.min(Math.round(HOLDINGS[home.kind].garrison * 1.5), home.garrison + convoy.size);
            }

            this.forces.splice(this.forces.indexOf(convoy), 1);
        }
    }

    // A realm sends a force to win back each of its own works the wild hold, none on its way there
    // already: out of the garrison of its town nearest it, if it can spare them (keeping half of
    // it), or else raised, if it can spare the gold
    #retake(realm) {
        for (const works of this.works.filter(({ owner, held }) => owner === realm.id && held)) {
            if (this.forces.some(({ realm: id, target }) => id === realm.id && target === works.id)) {
                continue;
            }

            const size = Math.max(6, Math.ceil(works.band * 1.6));
            const from = this.#nearestOwn(realm.id, works.at);
            const spared = from && from.garrison - Math.ceil(HOLDINGS[from.kind].garrison / 2) >= size;

            if (!from || (!spared && size > Math.floor(this.#spare(realm) / COSTS.troop))) {
                continue;
            }

            const route = this.#routeTo(from.id, works.at);

            if (!route) {
                continue;
            }

            if (spared) {
                from.garrison -= size;
            } else {
                realm.treasury -= size * COSTS.troop;
            }

            this.forces.push({ id: `force-${this.nextForce++}`, realm: realm.id, kind: "expedition", size, at: [...route[0]], path: route, leg: 0, target: works.id, home: from.id, mission: "retake", about: null, since: this.turn });
            this.#emit("marched", { realm: realm.id, from: from.id, target: works.id, size, mission: "retake" });
        }
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

    // --- The standing armies and reserves (armies.js; docs/WAR.md *Standing armies*) ---

    // A people's reserve at its seat, if it has none (made up as its towns can: #muster)
    #reserveFor(realm) {
        const seat = this.town(realm.seat);

        if (!realm.alive || !seat || this.reserveOf(realm.id)) {
            return;
        }

        this.forces.push({ id: `force-${this.nextForce++}`, realm: realm.id, kind: "reserve", size: 0, at: [...seat.at], path: [[...seat.at]], leg: 0, target: null, home: seat.id, mission: "home", about: null, since: this.turn });
    }

    // A people's army raised at its seat (by a player's orders, `by`, or its rulers'), made up
    // from its towns as they can (#muster: mustered over time, none of it at first)
    #raise(realm, { by = null } = {}) {
        const seat = this.town(realm.seat);

        if (!seat || this.armyOf(realm.id)) {
            return null;
        }

        const army = { id: `force-${this.nextForce++}`, realm: realm.id, kind: "army", size: 0, at: [...seat.at], path: [[...seat.at]], leg: 0, target: null, home: seat.id, mission: "muster", about: null, camp: null, orders: null, went: 0, arrived: null, supply: { due: this.turn + SUPPLY.every, missed: 0 }, since: this.turn };

        this.forces.push(army);
        this.#emit("raised", { realm: realm.id, army: army.id, by });

        return army;
    }

    // An army disbanded (by a player's orders, `by`): each of it back into the garrison of one of
    // its people's towns, the nearest first, as many as each holds (half again its full), and its
    // reinforcements on their way too
    #disbandArmy(army, { by = null } = {}) {
        let left = army.size + this.#coming(army);

        for (const column of this.forces.filter(({ kind, target }) => kind === "reinforcement" && target === army.id)) {
            this.forces.splice(this.forces.indexOf(column), 1);
        }

        for (const town of this.towns.filter(({ owner }) => owner === army.realm).sort((a, b) => apart(a.at, army.at) - apart(b.at, army.at) || (a.id < b.id ? -1 : 1))) {
            const back = Math.min(left, Math.max(0, Math.round(HOLDINGS[town.kind].garrison * 1.5) - town.garrison));

            town.garrison += back;
            left -= back;
        }

        this.forces.splice(this.forces.indexOf(army), 1);
        this.#emit("disbanded", { realm: army.realm, army: army.id, by });
    }

    // A vassal's army and reserve cut to what a vassal keeps (fullOf): the rest of each back into
    // its towns' garrisons, the nearest first (as an army disbanded)
    #trim(realm) {
        for (const force of [this.armyOf(realm.id), this.reserveOf(realm.id)]) {
            let left = force ? force.size - this.fullOf(realm.id) : 0;

            if (left <= 0) {
                continue;
            }

            force.size -= left;

            for (const town of this.towns.filter(({ owner }) => owner === realm.id).sort((a, b) => apart(a.at, force.at) - apart(b.at, force.at) || (a.id < b.id ? -1 : 1))) {
                const back = Math.min(left, Math.max(0, Math.round(HOLDINGS[town.kind].garrison * 1.5) - town.garrison));

                town.garrison += back;
                left -= back;
            }
        }
    }

    // How many are on their way to join an army or reserve
    #coming(force) {
        return this.forces.filter(({ kind, target }) => kind === "reinforcement" && target === force.id).reduce((sum, { size }) => sum + size, 0);
    }

    // Soldiers raised in a town for its people's army or reserve (`force`): into it at once if it's
    // there, else out on their way to it, with any column for it leaving the town already
    #reinforce(town, force, count) {
        if (apart(town.at, force.at) <= REINFORCE.join) {
            force.size += count;

            return;
        }

        const column = this.forces.find((each) => each.kind === "reinforcement" && each.target === force.id && apart(each.at, town.at) <= REINFORCE.band);

        if (column) {
            column.size += count;

            return;
        }

        this.forces.push({ id: `force-${this.nextForce++}`, realm: force.realm, kind: "reinforcement", size: count, at: [...town.at], path: [[...town.at], [...force.at]], leg: 0, target: force.id, home: town.id, mission: null, about: null, since: this.turn });
    }

    // Reinforcements on their way: straight for their army or reserve, where it is now, banding
    // with another column for it once they're near, and joining it once there. Theirs gone, into
    // the nearest of their people's towns
    #onReinforcement(column) {
        const force = this.force(column.target);

        if (force) {
            Object.assign(column, { path: [[...column.at], [...force.at]], leg: 0 });
            this.#go(column, REINFORCE.speed);
        }

        this.#reinforced(column);
    }

    // Reinforcements where they've got to: theirs gone, into the nearest of their people's towns;
    // there, joining it; else banding with another column for it near them, the one nearer it
    // taking the other in (not one a player's near taken in: it goes on as it's seen to go).
    // Returns whether they're done (gone, or joined, or taken in)
    #reinforced(column) {
        const band = (each) => !this.watched.has(each.id);
        const force = this.force(column.target);

        if (!force) {
            const home = this.#nearestOwn(column.realm, column.at);

            if (home) {
                home.garrison = Math.min(Math.round(HOLDINGS[home.kind].garrison * 1.5), home.garrison + column.size);
            }

            this.forces.splice(this.forces.indexOf(column), 1);

            return true;
        }

        if (apart(column.at, force.at) <= REINFORCE.join) {
            force.size += column.size;
            this.forces.splice(this.forces.indexOf(column), 1);

            return true;
        }

        const other = this.forces.find((each) => each !== column && each.kind === "reinforcement" && each.target === column.target && apart(each.at, column.at) <= REINFORCE.band && band(each));

        if (other) {
            const [keep, merged] = apart(other.at, force.at) <= apart(column.at, force.at) && band(column) ? [other, column] : [column, other];

            keep.size += merged.size;
            this.forces.splice(this.forces.indexOf(merged), 1);

            return merged === column;
        }

        return false;
    }

    // The way from a point to another for an army or reserve: by the roads, from the place nearest
    // it to the place nearest there, if that's no longer than going straight across country is
    // reckoned to be (roads.js ACROSS_COUNTRY); else straight there
    #wayTo(from, to) {
        const [a, b] = [this.roads.nearest(from), this.roads.nearest(to)];
        const route = a && b && a.id !== b.id ? this.roads.route(a.id, b.id) : null;
        const byRoad = route ? apart(from, a.at) + route.length + apart(b.at, to) : Infinity;

        return byRoad <= apart(from, to) * ACROSS_COUNTRY ? [[...from], ...route.points, [...to]] : [[...from], [...to]];
    }

    // Something of an enemy's an army can attack, by its id: { kind ("town", "works", "fort",
    // "camp", "depot"), realm (whose it is), at, edge (how far its ground reaches from there),
    // thing }, or null
    #targetOf(id) {
        const town = this.town(id);

        if (town) {
            return { kind: "town", realm: town.owner, at: town.at, edge: this.#radius(town.id), thing: town };
        }

        const works = this.workAt(id);

        if (works) {
            return works.held ? null : { kind: "works", realm: works.owner, at: works.at, edge: 0, thing: works };
        }

        const fort = this.fort(id);

        if (fort) {
            return { kind: "fort", realm: fort.realm, at: fort.at, edge: 0, thing: fort };
        }

        const camp = this.camp(id);

        if (camp) {
            return { kind: "camp", realm: camp.realm, at: camp.at, edge: 0, thing: camp };
        }

        const depot = this.depot(id);

        return depot ? { kind: "depot", realm: depot.realm, at: depot.at, edge: 0, thing: depot } : null;
    }

    // A people's camp (built, or going up) with something within its reach (CAMP.reach, of the
    // thing's edge: `edge` metres from `at`), the nearest; or null
    #campFor(realm, at, edge = 0) {
        let best = null;

        for (const camp of this.camps) {
            const distance = apart(camp.at, at) - edge;

            if (camp.realm === realm && distance <= CAMP.reach && (!best || distance < best.distance)) {
                best = { camp, distance };
            }
        }

        return best?.camp ?? null;
    }

    // Whether a people's camps reach a point (with an edge)
    #reaches(realm, at, edge = 0) {
        return Boolean(this.#campFor(realm, at, edge));
    }

    /**
     * Whether a people's camps reach something of the war's (its id: a town, works, fortification,
     * camp or depot), for its army to attack it from one of them (CAMP.reach, of a town's edge).
     */
    inReach(realm, id) {
        const target = this.#targetOf(id);

        return Boolean(target) && this.#reaches(realm, target.at, target.edge);
    }

    // An army sent to build a camp before something of the enemy's (its id) beyond its camps'
    // reach, and to attack it from there once it's up, as its rulers would send it (#campaign).
    // Whether it could be (it's there to attack)
    #campBefore(army, id) {
        const target = this.#targetOf(id);

        if (!target) {
            return false;
        }

        this.#toCamp(army, this.#siteFor(army.at, target.at, target.edge + CAMP.reach * 0.6), id);

        return true;
    }

    // Where a camp before something may go: `out` metres from it on the way from `from`, or turned
    // a little either way, on dry land off the roads; or there anyway, failing that
    #siteFor(from, to, out) {
        const [dx, dy] = [from[0] - to[0], from[1] - to[1]];
        const heading = atan2(dx, dy);

        for (const turn of [0, 0.3, -0.3, 0.6, -0.6, 0.9, -0.9]) {
            const at = campSite([to[0] + sin(heading + turn) * (out + 1), to[1] + cos(heading + turn) * (out + 1)], to, out);
            const land = landAt(this.plan, at[0], at[1]);

            if (land.water === WATER.none && !land.road && land.biome !== "sea") {
                return at;
            }
        }

        return campSite(from, to, out);
    }

    // An army sent to build a camp at a point (or to its people's camp there), and to attack from it
    // what it's to (`objective`: an id) once it's up
    #toCamp(army, at, objective = null) {
        const camp = this.camps.find((each) => each.realm === army.realm && apart(each.at, at) <= CLOSE.fight);
        const there = camp?.at ?? at;

        Object.assign(army, { mission: "camp", camp: camp?.id ?? null, about: [...there], target: objective, arrived: null, path: this.#wayTo(army.at, there), leg: 0 });
    }

    // An army sent against something of the enemy's (its id), from the camp of its people's in
    // reach of it. Whether it could be
    #toAttack(army, id) {
        const target = this.#targetOf(id);
        const camp = target && this.#campFor(army.realm, target.at, target.edge);

        if (!camp) {
            return false;
        }

        Object.assign(army, { mission: "attack", camp: camp.id, target: id, about: null, went: army.size, arrived: null, path: this.#wayTo(army.at, target.at), leg: 0 });

        return true;
    }

    // An army back to its camp to be made up (or home, with none)
    #regroup(army) {
        const camp = this.camp(army.camp);

        if (!camp) {
            this.#goHome(army);

            return;
        }

        Object.assign(army, { mission: "regroup", about: [...camp.at], arrived: null, path: this.#wayTo(army.at, camp.at), leg: 0 });
    }

    // An army home to its people's seat
    #goHome(army) {
        const seat = this.town(this.realm(army.realm)?.seat);

        if (seat) {
            Object.assign(army, { mission: "home", target: null, about: null, home: seat.id, arrived: null, path: this.#wayTo(army.at, seat.at), leg: 0 });
        }
    }

    // What an army's done with: orders carried out (cleared), and back to its camp to wait for what
    // its rulers will have it do next (or home, with none). Ordered against something else (a town
    // whose cover it had to raze first), at that now
    #done(army) {
        if (army.orders?.kind === "attack" && army.orders.about !== army.target && this.#targetOf(army.orders.about) && this.#toAttack(army, army.orders.about)) {
            return;
        }

        if (army.orders && army.orders.kind !== "camp") {
            army.orders = null;
        }

        army.target = null;

        const camp = this.camp(army.camp);

        if (camp) {
            Object.assign(army, { mission: "camp", about: [...camp.at], arrived: null, path: this.#wayTo(army.at, camp.at), leg: 0 });
        } else {
            this.#goHome(army);
        }
    }

    // A people's army this turn, as a player's orders have it (until they're carried out), or as its
    // rulers would: raised once its people are at war (and the age is past its uneasy peace);
    // marching once it's made up enough (ARMY.ready); made up again at its camp when it's been
    // beaten back, and back at what it was attacking; home once there's peace
    #command(realm, liege) {
        const army = this.armyOf(realm.id);
        const atWar = this.enemiesOf(liege.id).length > 0;

        if (!army) {
            if (atWar && this.stage >= 1) {
                this.#raise(realm);
            }

            return;
        }

        const ready = army.size >= Math.max(1, this.fullOf(realm.id) * ARMY.ready);

        if (army.orders) {
            // (Beaten back, or home, and made up again: at what it was ordered to again)
            const { kind, about } = army.orders;

            if ((army.mission === "regroup" || army.mission === "muster") && army.leg >= army.path.length - 1 && ready) {
                if (kind === "camp") {
                    this.#toCamp(army, about);
                } else if (kind === "attack" && !this.#toAttack(army, about) && !this.#campBefore(army, about)) {
                    this.#done(army);
                }
            }

            return;
        }

        if (!atWar) {
            if (army.mission !== "home" && army.mission !== "muster") {
                this.#goHome(army);
            }

            return;
        }

        if (this.stage < 1 || !ready) {
            return;
        }

        const there = army.leg >= army.path.length - 1;

        if (army.mission === "muster" || (army.mission === "camp" && there && !army.target && this.camp(army.camp)?.built !== null)) {
            this.#campaign(army, liege);
        } else if (army.mission === "regroup" && there && !(army.target && this.#targetOf(army.target) && this.#toAttack(army, army.target))) {
            this.#campaign(army, liege);
        }
    }

    // An army ready to march given what to attack by its rulers: the enemy's weakest near town of a
    // kind the age lets be taken (or a works, once the war's far enough on), as their traits weigh
    // it and a player's counsel would have it; the fortification covering a town first. From one of
    // its people's camps in reach of it, or a camp built before it. Whether it was sent
    #campaign(army, liege) {
        const { traits } = liege.leader;
        const stage = STAGES[this.stage];
        const enemies = this.enemiesOf(liege.id);
        const targets = [
            ...this.towns.filter((town) => enemies.includes(this.liege(town.owner)) && stage.take.includes(town.kind)),
            ...(this.stage >= WORKED.from ? this.works.filter((works) => !works.held && this.realm(works.owner)?.alive && enemies.includes(this.liege(works.owner))) : []),
        ];

        if (!targets.length) {
            return false;
        }

        const realm = this.realm(army.realm);
        const scored = targets
            .map((target) => {
                const distance = apart(army.at, target.at) / 1000;
                const near = this.#reaches(army.realm, target.at, this.town(target.id) ? this.#radius(target.id) : 0) ? 1 : 0;

                // (A works: worth its taking, the more so for what the realm's short of)
                if (YIELDS[target.kind]) {
                    const short = realm.stores[YIELDS[target.kind]] < WORKED.yard ? 0.5 : 0;

                    return { target, score: distance + target.guard / 15 - WORKED.worth * traits.greed - short - near + this.random.range(0, 0.5) };
                }

                // (Their rulers' seat, to bring them under, when it's strong enough to; and where a
                // player's counselled them to march. Not what's held too strongly for it to take,
                // however rich or proud: CAMPAIGN)
                const seat = target.id === this.realm(target.owner).seat && this.strength(liege.id) >= this.strength(this.liege(target.owner));
                const counselled = liege.counsel?.march === target.id ? 4 * liege.counsel.weight : 0;
                const odds = army.size / Math.max(1, target.garrison * HOLDINGS[target.kind].walls + (seat ? LEADERS : 0));
                const hopeless = Math.max(0, CAMPAIGN.odds - odds) * CAMPAIGN.hopeless;

                return { target, score: distance + target.garrison / 15 - HOLDINGS[target.kind].worth * traits.greed - (seat ? 3 * traits.aggression : 0) + hopeless - counselled - near + this.random.range(0, 0.5) };
            })
            .sort((a, b) => a.score - b.score || (a.target.id < b.target.id ? -1 : 1));
        const { target } = scored[0];

        if (liege.counsel?.march === target.id) {
            liege.counsel = null;
        }

        // (A town covered by its holders' fortification: that first)
        const aim = (this.town(target.id) && this.coverOf(target)) || target;
        const { at, edge } = this.#targetOf(aim.id);

        if (!this.#toAttack(army, aim.id)) {
            this.#toCamp(army, this.#siteFor(army.at, at, edge + CAMP.reach * 0.6), aim.id);
        }

        this.#emit("marched", { realm: army.realm, army: army.id, target: aim.id, size: army.size });

        return true;
    }

    // An army on the move, or there: at a camp's site, it builds the camp (or joins its people's
    // there), and once it's up goes against what it was to (a player's orders to camp there carried
    // out); home, it's made up there
    #onArmy(army, { still = false } = {}) {
        // (Going against something that moves, a camp's: straight for it)
        if (!still) {
            this.#go(army, ARMY.speed.army);
        }

        if (army.leg < army.path.length - 1) {
            return;
        }

        if (army.mission === "home") {
            const seat = this.town(this.realm(army.realm)?.seat);

            army.mission = "muster";
            army.home = seat?.id ?? army.home;

            if (army.orders?.kind === "home") {
                army.orders = null;
            }

            return;
        }

        if (army.mission !== "camp") {
            return;
        }

        const camp = this.camp(army.camp) ?? this.#buildCamp(army);

        if (!camp || camp.built === null) {
            return;
        }

        if (army.orders?.kind === "camp") {
            army.orders = null;
        }

        if (army.target && !this.#toAttack(army, army.target)) {
            army.target = null;
        }
    }

    // A camp built where an army's come to build it (CAMP: its cost paid, if its people can; a few
    // of the army left to hold it), going up for a while; the oldest of its people's struck, if it
    // has as many as it keeps. Null if it can't be paid for yet
    #buildCamp(army) {
        const realm = this.realm(army.realm);

        if (!realm || realm.treasury < CAMP.cost) {
            return null;
        }

        const mine = this.camps.filter((each) => each.realm === army.realm).sort((a, b) => a.used - b.used || (a.id < b.id ? -1 : 1));

        if (mine.length >= CAMP.most) {
            this.#strikeCamp(mine[0]);
        }

        const guard = Math.min(CAMP.guard, Math.max(0, army.size - 1));
        const camp = { id: `camp-${this.nextCamp++}`, realm: army.realm, at: [...(army.about ?? army.at)], guard, built: null, done: this.turn + CAMP.build, toward: army.target, used: this.turn, skirmished: this.turn };

        realm.treasury -= CAMP.cost;
        army.size -= guard;
        army.camp = camp.id;
        this.camps.push(camp);

        return camp;
    }

    // A camp struck by its own people (no army's needed it a while, or it's one too many): those
    // holding it back into the nearest of their towns
    #strikeCamp(camp) {
        const home = this.#nearestOwn(camp.realm, camp.at);

        if (home) {
            home.garrison = Math.min(Math.round(HOLDINGS[home.kind].garrison * 1.5), home.garrison + camp.guard);
        }

        this.#dropCamp(camp);
        this.#emit("struck", { realm: camp.realm, camp: camp.id, at: [...camp.at] });
    }

    // Whether a camp's own army is about it, within its reach (CAMP.reach: fighting from it, or by
    // it), not left behind
    #campHeld(camp) {
        return this.forces.some((force) => force.kind === "army" && force.realm === camp.realm && force.size > 0 && apart(force.at, camp.at) <= CAMP.reach);
    }

    // A camp razed by an enemy (`by`, a realm's id, or null), or given up by a fallen people
    #razeCamp(camp, by, { abandoned = false, played = false } = {}) {
        this.#dropCamp(camp);
        this.#emit(abandoned ? "abandoned" : "razed", { camp: camp.id, kind: "camp", realm: camp.realm, at: [...camp.at], toward: camp.toward, about: camp.toward, by: by ?? null, ...(played ? { played } : {}) });

        if (by && this.realm(by)) {
            this.remember(camp.realm, by, -4);
        }
    }

    // A camp gone: the armies staged from it from none
    #dropCamp(camp) {
        if (!this.camps.includes(camp)) {
            return;
        }

        this.camps.splice(this.camps.indexOf(camp), 1);

        for (const army of this.forces.filter((force) => force.kind === "army" && force.camp === camp.id)) {
            army.camp = null;
        }
    }

    // The camps this turn: going up (finished once they've stood long enough: CAMP.build); held
    // (made up from their army while it's there); their skirmishers out against the enemy near
    // (not where a player's near: that's played out in the world); struck once no army's needed
    // them a while (CAMP.idle)
    #encamp() {
        for (const camp of [...this.camps]) {
            if (!this.camps.includes(camp)) {
                continue;
            }

            if (!this.realm(camp.realm)?.alive) {
                this.#razeCamp(camp, null, { abandoned: true });
                continue;
            }

            const army = this.forces.find((force) => force.kind === "army" && force.realm === camp.realm && apart(force.at, camp.at) <= CLOSE.fight);

            if (army) {
                const made = Math.min(CAMP.guard - camp.guard, army.size - 1);

                camp.used = this.turn;

                if (made > 0) {
                    camp.guard += made;
                    army.size -= made;
                }
            }

            if (camp.built === null) {
                if (this.turn >= camp.done) {
                    camp.built = this.turn;
                    this.#emit("camped", { realm: camp.realm, camp: camp.id, target: camp.toward, at: [...camp.at] });
                }

                continue;
            }

            if (this.turn - camp.used > CAMP.idle) {
                this.#strikeCamp(camp);
                continue;
            }

            if (this.turn - camp.skirmished >= CAMP.every && camp.guard >= CAMP.pair) {
                camp.skirmished = this.turn;
                this.#skirmish(camp);
            }
        }
    }

    // A pair of a camp's skirmishers out against the nearest of the enemy's within reach
    // (CAMP.skirmish): a town's garrison (its taxes lost for a turn; never its last), a works'
    // guard, an army, a reserve, reinforcements, a supply wagon (taken, its guards down), a convoy,
    // a camp, a supply depot (a load carried off, or one of its guard). The camp, or what they're
    // after, a player's near: they go out in the world, to fight it out there ("skirmishers").
    // Else each of them may bring one down, or be lost (#fallOn)
    #skirmish(camp) {
        const [target] = this.#skirmishable(camp);

        if (!target) {
            return;
        }

        this.remember(target.realm, camp.realm, -1);

        if (this.watched.has(camp.id) || this.watched.has(target.id)) {
            this.#emit("skirmishers", { realm: camp.realm, camp: camp.id, against: target.realm, target: target.id, kind: target.kind, at: [...target.at] });

            return;
        }

        this.#fallOn(camp, target, CAMP.pair);
    }

    /**
     * A camp's skirmishers sent out in the world (a "skirmishers" event) who've gone off beyond
     * every player before falling on what they were after (`target`'s id): `count` of them, still
     * standing, fall on it as they would have (#fallOn), if it's still there and within their reach.
     * Returns whether they did.
     */
    skirmish(campId, targetId, count) {
        const camp = this.camp(campId);
        const target = camp && this.#skirmishable(camp).find(({ id }) => id === targetId);

        if (!target || count <= 0) {
            return false;
        }

        this.#fallOn(camp, target, count);

        return true;
    }

    // What a camp's skirmishers may fall on (#skirmish), the nearest first
    #skirmishable(camp) {
        const enemy = (realm) => this.hostile(camp.realm, realm);
        const targets = [
            ...this.towns.filter((town) => enemy(town.owner) && town.garrison > 1).map((town) => ({ id: town.id, kind: "town", realm: town.owner, at: town.at, hit: () => ((town.garrison -= 1), (town.raidedAt = this.turn)) })),
            ...this.works.filter((works) => !works.held && enemy(works.owner) && works.guard > 0).map((works) => ({ id: works.id, kind: "works", realm: works.owner, at: works.at, hit: () => (works.guard -= 1) })),
            ...this.forces.filter((force) => ["army", "reserve", "reinforcement", "convoy", "supply"].includes(force.kind) && enemy(force.realm) && force.size > 0).map((force) => ({ id: force.id, kind: force.kind, realm: force.realm, at: force.at, hit: () => (force.size -= 1) })),
            ...this.camps.filter((other) => other !== camp && enemy(other.realm) && other.guard > 1).map((other) => ({ id: other.id, kind: "camp", realm: other.realm, at: other.at, hit: () => (other.guard -= 1) })),
            ...this.depots.filter((depot) => enemy(depot.realm) && (depot.level > 0 || depot.guard > 1)).map((depot) => ({ id: depot.id, kind: "depot", realm: depot.realm, at: depot.at, hit: () => (depot.level > 0 ? (depot.level -= 1) : (depot.guard -= 1)) })),
        ].filter(({ at }) => apart(at, camp.at) <= CAMP.skirmish);

        return targets.sort((a, b) => apart(a.at, camp.at) - apart(b.at, camp.at) || (a.id < b.id ? -1 : 1));
    }

    // A camp's skirmishers (`count` of them) falling on what they're after, unseen by any player:
    // each may bring one of it down, or be lost
    #fallOn(camp, target, count) {
        let [killed, lost] = [0, 0];

        for (let k = 0; k < count; k++) {
            if (this.random.chance(CAMP.hits)) {
                target.hit();
                killed++;
            }

            if (this.random.chance(CAMP.lost)) {
                lost++;
            }
        }

        camp.guard -= lost;
        this.#emit("skirmish", { realm: camp.realm, camp: camp.id, against: target.realm, target: target.id, kind: target.kind, killed, lost });

        // (A supply wagon's guards put down: it's taken)
        const wagon = this.force(target.id);

        if (wagon?.kind === "supply" && wagon.size <= 0) {
            this.#wagonLost(wagon, camp.realm);
        }
    }

    // A people's reserve this turn: out against the enemy army nearest it in its people's own lands
    // (within CLOSE.threat of one of their towns: never beyond), one attacking one of them first, if
    // it's not much the weaker; with none, against an enemy's supply depot there; home to its seat
    // again once there's neither
    #defend(realm) {
        const reserve = this.reserveOf(realm.id);

        if (!reserve) {
            this.#reserveFor(realm);

            return;
        }

        const towns = this.towns.filter(({ owner }) => owner === realm.id);
        // (Not an army beaten back, falling back to its camp to be made up: a reserve drives an
        // army off, it doesn't hunt it down; it'll meet it again when it comes back to the attack)
        const threat = this.forces
            .filter((force) => force.kind === "army" && force.size > 0 && force.mission !== "muster" && force.mission !== "regroup" && this.hostile(force.realm, realm.id) && towns.some((town) => apart(town.at, force.at) <= CLOSE.threat))
            .map((force) => ({ force, attacking: force.mission === "attack" && this.#targetOf(force.target)?.realm === realm.id ? 1 : 0 }))
            .sort((a, b) => b.attacking - a.attacking || apart(a.force.at, reserve.at) - apart(b.force.at, reserve.at) || (a.force.id < b.force.id ? -1 : 1))[0]?.force;

        if (threat && reserve.size >= threat.size * DEFEND.odds) {
            Object.assign(reserve, { mission: "defend", target: threat.id, path: [[...reserve.at], [...threat.at]], leg: 0 });

            return;
        }

        // (No army: an enemy's supply depot or camp in its lands, the nearest, if it's stronger than
        // its guard; not a camp its army's fighting from)
        const held = [...this.depots, ...this.camps.filter((camp) => !this.#campHeld(camp))]
            .filter((each) => this.hostile(each.realm, realm.id) && towns.some((town) => apart(town.at, each.at) <= CLOSE.threat) && reserve.size > each.guard * 1.5)
            .sort((a, b) => apart(a.at, reserve.at) - apart(b.at, reserve.at) || (a.id < b.id ? -1 : 1))[0];

        if (!threat && held) {
            Object.assign(reserve, { mission: "defend", target: held.id, path: [[...reserve.at], [...held.at]], leg: 0 });

            return;
        }

        const seat = this.town(realm.seat);

        if (seat && (reserve.mission === "defend" || reserve.home !== seat.id)) {
            Object.assign(reserve, { mission: "back", target: null, home: seat.id, path: this.#wayTo(reserve.at, seat.at), leg: 0 });
        }
    }

    // A reserve on the move (not one a player's near: it goes as it marches there): home at its seat
    #onReserve(reserve, { still = false } = {}) {
        if (!still) {
            this.#go(reserve, ARMY.speed.reserve);
        }

        if (reserve.mission === "back" && reserve.leg >= reserve.path.length - 1) {
            reserve.mission = "home";
        }
    }

    // --- The armies' supply (supply.js; docs/WAR.md *Supply*) ---

    // The supply this turn: each depot going up finished once it's stood long enough (its first
    // loads in it); each one short of loads sent one from the nearest seat of its people's or a
    // friend's, if they can pay for it; each army in the field sent its wagon when it's due (#feed).
    // An army mustering at its seat is fed there. A depot of a fallen people is abandoned; one no
    // army's drawn on a while (DEPOT.idle), struck
    #provision() {
        for (const depot of [...this.depots]) {
            const realm = this.realm(depot.realm);

            if (!realm?.alive) {
                this.#razeDepot(depot, null, { abandoned: true });
                continue;
            }

            if (depot.built === null) {
                if (this.turn >= depot.done) {
                    Object.assign(depot, { built: this.turn, level: DEPOT.start, used: this.turn });
                    this.#emit("depot", { realm: depot.realm, depot: depot.id, at: [...depot.at], toward: depot.toward, by: depot.by });
                }

                continue;
            }

            if (this.turn - depot.used > DEPOT.idle) {
                this.#strikeDepot(depot);
                continue;
            }

            if (depot.level >= DEPOT.most || this.#wagonFor(depot.id) || realm.treasury < SUPPLY.cost) {
                continue;
            }

            const seat = this.realms
                .filter((other) => other.alive && this.friendly(depot.realm, other.id) && this.town(other.seat)?.owner === other.id)
                .map((other) => this.town(other.seat))
                .sort((a, b) => apart(a.at, depot.at) - apart(b.at, depot.at) || (a.id < b.id ? -1 : 1))[0];

            if (seat) {
                realm.treasury -= SUPPLY.cost;
                this.#wagon(depot.realm, seat, depot, "depot");
            }
        }

        for (const army of this.forces.filter(({ kind }) => kind === "army")) {
            army.supply ??= { due: this.turn + SUPPLY.every, missed: 0 };

            if (army.mission === "muster") {
                army.supply = { due: this.turn + SUPPLY.every, missed: 0 };
            } else {
                this.#feed(army);
            }
        }
    }

    // An army's wagon, if it's due (or asked for `now`) and none's on its way: from the depot asked
    // for (`from`), or else the nearest that can supply it (one of its loads), or its seat
    // (SUPPLY.cost of its people's gold). None
    // sent when it's due (no gold, or neither to send it from) is a load that didn't get through
    // (#hunger). Whether one was sent
    #feed(army, { now = false, from = null } = {}) {
        if (this.#wagonFor(army.id) || (!now && this.turn < army.supply.due)) {
            return false;
        }

        const realm = this.realm(army.realm);
        const source = from ? { depot: from } : this.#sourceFor(army);
        const paid = source?.depot || (source?.seat && realm.treasury >= SUPPLY.cost);

        if (!paid) {
            if (!now) {
                army.supply.due = this.turn + SUPPLY.every;
                this.#hunger(army, { why: source ? "unpaid" : "cut off" });
            }

            return false;
        }

        if (source.depot) {
            source.depot.level -= 1;
            source.depot.used = this.turn;
        } else {
            realm.treasury -= SUPPLY.cost;
        }

        army.supply.due = this.turn + SUPPLY.every;
        this.#wagon(army.realm, source.depot ?? source.seat, army, "army");

        return true;
    }

    // Where an army's next wagon is to come from: the nearest depot within reach of it that can
    // supply it (its people's, its liege's or a fellow vassal's: up, with a load in it, nearer it
    // than its seat), else its people's seat while it's theirs: { depot } or { seat }, or null
    #sourceFor(army) {
        const seat = this.town(this.realm(army.realm)?.seat);
        const home = seat?.owner === army.realm ? seat : null;
        const fromSeat = home ? apart(home.at, army.at) : Infinity;
        const depot = this.depots
            .filter((each) => this.#supplies(each, army) && apart(each.at, army.at) <= fromSeat)
            .sort((a, b) => apart(a.at, army.at) - apart(b.at, army.at) || (a.id < b.id ? -1 : 1))[0];

        return depot ? { depot } : home ? { seat: home } : null;
    }

    // Whether a depot can send an army a wagon now: up, a load in it, its people's or a friend's
    // under the same liege, within reach of it (DEPOT.reach)
    #supplies(depot, army) {
        return Boolean(depot) && depot.built !== null && depot.level >= 1 && this.liege(depot.realm) === this.liege(army.realm) && apart(depot.at, army.at) <= DEPOT.reach;
    }

    // The supply wagon on its way to an army or a depot (by its id), if there is one
    #wagonFor(id) {
        return this.forces.find((force) => force.kind === "supply" && force.target === id) ?? null;
    }

    // A supply wagon sent from a seat or a depot (`from`) to an army or a depot (`to`, "army" or
    // "depot"), its guards beside it
    #wagon(realm, from, to, mission) {
        this.forces.push({ id: `force-${this.nextForce++}`, realm, kind: "supply", size: SUPPLY.guards, at: [...from.at], path: [[...from.at], [...to.at]], leg: 0, target: to.id, home: from.id, mission, about: null, since: this.turn });
    }

    // A supply wagon on its way: straight for its army (or depot) where it is now; there, its load's
    // theirs (an army's hunger over, a depot's loads one more). Its army or depot gone, it's gone too
    #onWagon(wagon) {
        const to = wagon.mission === "depot" ? this.depot(wagon.target) : this.force(wagon.target);

        if (!to) {
            this.forces.splice(this.forces.indexOf(wagon), 1);

            return;
        }

        Object.assign(wagon, { path: [[...wagon.at], [...to.at]], leg: 0 });
        this.#go(wagon, SUPPLY.speed);

        if (apart(wagon.at, to.at) <= SUPPLY.reach) {
            this.#deliver(wagon, to);
        }
    }

    // A supply wagon at its army or depot: its load theirs (an army's hunger over, a depot's loads
    // one more), and it's done
    #deliver(wagon, to) {
        this.forces.splice(this.forces.indexOf(wagon), 1);

        if (wagon.mission === "depot") {
            to.level = Math.min(DEPOT.most, to.level + 1);
            this.#emit("provisioned", { realm: wagon.realm, depot: to.id });
        } else {
            to.supply.missed = 0;
            this.#emit("supplied", { realm: wagon.realm, army: to.id, from: wagon.home });
        }
    }

    // A supply wagon fallen on (by an enemy people, `by`, or the wild's brigands, `faction`): taken,
    // and for its army, a load that didn't get through (#hunger)
    #wagonLost(wagon, by, { faction = null } = {}) {
        this.forces.splice(this.forces.indexOf(wagon), 1);
        this.#emit("wagonLost", { realm: wagon.realm, by, faction, [wagon.mission]: wagon.target, at: [...wagon.at] });

        if (by) {
            this.remember(wagon.realm, by, -2);
        }

        const army = wagon.mission === "army" ? this.force(wagon.target) : null;

        if (army) {
            this.#hunger(army, { why: "lost", by });
        }
    }

    // An army whose load hasn't got through (lost on the way, or none sent): one more in a row. At
    // the first, its people are alerted; then a share of it deserts (HUNGER); at the last, the rest
    // go too, and the army's broken up
    #hunger(army, { why, by = null }) {
        const missed = ++army.supply.missed;

        if (missed >= HUNGER.length) {
            this.forces.splice(this.forces.indexOf(army), 1);
            this.#emit("starved", { realm: army.realm, army: army.id, deserted: army.size, at: [...army.at] });

            return;
        }

        const deserted = Math.round(army.size * HUNGER[missed - 1]);

        army.size -= deserted;
        this.#emit("unsupplied", { realm: army.realm, army: army.id, missed, deserted, why, by });
    }

    // A people's rulers' supply depot for their army, at war and in the field: built once its camp's
    // up further than DEPOT.far from their seat with none of theirs (or a friend's under the same
    // liege) in reach of it, DEPOT.back behind it towards home, if that's in another people's lands
    // and they can pay for it and its guard, keeping something back; not again for a while
    // (DEPOT.again: `depotAt`, the turn they last did)
    #depotFor(realm) {
        const army = this.armyOf(realm.id);
        const camp = army && !["muster", "home"].includes(army.mission) && this.enemiesOf(this.liege(realm.id)).length > 0 && this.camp(army.camp);
        const seat = this.town(realm.seat);

        if (!camp || camp.built === null || seat?.owner !== realm.id || apart(camp.at, seat.at) <= DEPOT.far || this.turn - (realm.depotAt ?? -Infinity) < DEPOT.again) {
            return;
        }

        if (this.depots.some((each) => this.liege(each.realm) === this.liege(realm.id) && apart(each.at, camp.at) <= DEPOT.reach)) {
            return;
        }

        if (realm.treasury < DEPOT.cost + DEPOT.guard * COSTS.troop + COSTS.troop * 4) {
            return;
        }

        if (this.#buildDepot(realm, this.#siteFor(seat.at, camp.at, DEPOT.back), { toward: camp.toward })) {
            realm.depotAt = this.turn;
        }
    }

    // A supply depot built at a point by a people (by their rulers, or a player's orders: `ordered`,
    // by `by`'s people), if it's in another people's lands (the nearest town to it isn't theirs, nor
    // a friend's), they have fewer than they may keep (DEPOT.per; for their rulers, the oldest
    // struck otherwise), and they can pay for it and its guard. The depot, going up; or null
    #buildDepot(realm, at, { by = null, toward = null, ordered = false } = {}) {
        const nearest = this.towns.reduce((best, town) => (!best || apart(town.at, at) < apart(best.at, at) ? town : best), null);
        const cost = DEPOT.cost + DEPOT.guard * COSTS.troop;
        const mine = this.depots.filter((each) => each.realm === realm.id).sort((a, b) => a.used - b.used || (a.id < b.id ? -1 : 1));

        if (!nearest || this.friendly(realm.id, nearest.owner) || realm.treasury < cost || (ordered && mine.length >= DEPOT.per)) {
            return null;
        }

        if (mine.length >= DEPOT.per) {
            this.#strikeDepot(mine[0]);
        }

        const depot = { id: `depot-${this.nextDepot++}`, realm: realm.id, at: [...at], guard: DEPOT.guard, built: null, done: this.turn + DEPOT.build, level: 0, toward, used: this.turn, by };

        realm.treasury -= cost;
        this.depots.push(depot);

        return depot;
    }

    // A depot struck by its own people (one too many): its guard back into the nearest of their towns
    #strikeDepot(depot) {
        const home = this.#nearestOwn(depot.realm, depot.at);

        if (home) {
            home.garrison = Math.min(Math.round(HOLDINGS[home.kind].garrison * 1.5), home.garrison + depot.guard);
        }

        this.depots.splice(this.depots.indexOf(depot), 1);
        this.#emit("struck", { realm: depot.realm, depot: depot.id, at: [...depot.at] });
    }

    // A depot razed by an enemy (`by`, a realm's id, or null), or given up by a fallen people: what's
    // in it lost
    #razeDepot(depot, by, { abandoned = false, played = false } = {}) {
        if (!this.depots.includes(depot)) {
            return;
        }

        this.depots.splice(this.depots.indexOf(depot), 1);
        this.#emit(abandoned ? "abandoned" : "razed", { depot: depot.id, kind: "depot", realm: depot.realm, at: [...depot.at], about: depot.toward, by: by ?? null, ...(played ? { played } : {}) });

        if (by && this.realm(by)) {
            this.remember(depot.realm, by, -4);
        }
    }

    // The fighting this turn: each army and reserve upon an enemy's (within CLOSE.fight) fights it,
    // and the beaten falls back (not those a player's near: that's fought out in the world); supply wagons caught by an enemy army or reserve are taken, and
    // depots it's upon fallen on; reinforcements caught by an enemy army are fallen on; then each
    // army attacking what it's after once it's there (not one a player's near, a while:
    // WATCH_TURNS). An army mustering at its seat is within its walls, not in the field: it fights
    // only beside its garrison, if the seat's stormed (#attack)
    #engage() {
        const fighters = () => this.forces.filter(({ kind, size, mission }) => (kind === "army" || kind === "reserve") && size > 0 && mission !== "muster");

        for (const a of fighters()) {
            for (const b of fighters()) {
                if (a.id < b.id && this.forces.includes(a) && this.forces.includes(b) && a.size > 0 && b.size > 0 && (a.kind === "army" || b.kind === "army") && !this.#fleeing(a) && !this.#fleeing(b) && !this.watched.has(a.id) && !this.watched.has(b.id) && this.hostile(a.realm, b.realm) && apart(a.at, b.at) <= CLOSE.fight) {
                    this.#battle(a.kind === "reserve" ? b : a, a.kind === "reserve" ? a : b);
                }
            }
        }

        // (A supply wagon caught by an enemy army or reserve: taken)
        for (const wagon of this.forces.filter(({ kind, id }) => kind === "supply" && !this.watched.has(id))) {
            const by = fighters().find((force) => !this.#fleeing(force) && this.hostile(force.realm, wagon.realm) && apart(force.at, wagon.at) <= CLOSE.fight);

            if (by) {
                this.#wagonLost(wagon, by.realm);
            }
        }

        // (A supply depot an enemy army or reserve is upon: its guard fought; put down, it's razed)
        for (const depot of [...this.depots]) {
            const by = !this.watched.has(depot.id) && fighters().find((force) => !this.#fleeing(force) && this.hostile(force.realm, depot.realm) && apart(force.at, depot.at) <= CLOSE.fight);

            if (by && this.depots.includes(depot)) {
                const { attackers, defenders } = this.#fight(by.size, depot.guard, 1, { by: by.realm, against: depot.realm });

                this.#emit("battle", { realm: by.realm, against: depot.realm, depot: depot.id, at: [...depot.at], won: defenders === 0, killed: depot.guard - defenders, lost: by.size - attackers, [by.kind]: by.id });
                by.size = attackers;
                depot.guard = defenders;

                if (!defenders) {
                    this.#razeDepot(depot, by.realm);
                }
            }
        }

        // (A camp an enemy's army or reserve is upon, left behind by its own army: its guard put
        // down, it's razed. Not one a player's near: that's fought out in the world)
        for (const camp of [...this.camps]) {
            const by = !this.watched.has(camp.id) && !this.#campHeld(camp) && fighters().find((force) => !this.#fleeing(force) && this.hostile(force.realm, camp.realm) && apart(force.at, camp.at) <= CLOSE.fight);

            if (by && this.camps.includes(camp)) {
                const { attackers, defenders } = this.#fight(by.size, camp.guard, 1, { by: by.realm, against: camp.realm });

                this.#emit("battle", { realm: by.realm, against: camp.realm, camp: camp.id, at: [...camp.at], won: defenders === 0, killed: camp.guard - defenders, lost: by.size - attackers, [by.kind]: by.id });
                by.size = attackers;
                camp.guard = defenders;

                if (!defenders) {
                    this.#razeCamp(camp, by.realm);
                }
            }
        }

        // (Reinforcements caught by an enemy army: cut down. Not those a player's near, nor by an
        // army a player's near: that's fought out in the world)
        for (const column of this.forces.filter(({ kind, id }) => kind === "reinforcement" && !this.watched.has(id))) {
            const by = fighters().find((force) => force.kind === "army" && !this.watched.has(force.id) && this.hostile(force.realm, column.realm) && apart(force.at, column.at) <= CLOSE.fight);

            if (by && this.forces.includes(column)) {
                const { attackers, defenders } = this.#fight(by.size, column.size, 1, { by: by.realm, against: column.realm });

                this.#emit("intercepted", { realm: column.realm, by: by.realm, killed: column.size - defenders, lost: by.size - attackers, at: [...column.at] });
                by.size = attackers;
                column.size = defenders;

                if (!column.size) {
                    this.forces.splice(this.forces.indexOf(column), 1);
                }
            }
        }

        for (const army of this.forces.filter(({ kind, mission }) => kind === "army" && mission === "attack")) {
            if (!this.forces.includes(army) || army.mission !== "attack") {
                continue;
            }

            const target = this.#targetOf(army.target);

            if (!target || !this.hostile(army.realm, target.realm)) {
                this.#done(army);
                continue;
            }

            if (apart(army.at, target.at) > CLOSE.attack + target.edge) {
                continue;
            }

            // (Before what a player's near: a while, for it to be played out there)
            army.arrived ??= this.turn;

            if (this.watched.has(target.thing.id) && this.turn - army.arrived < WATCH_TURNS) {
                continue;
            }

            this.#attack(army, target);
        }
    }

    // Two peoples' forces fight it out in the field (`army` upon `other`, an army or a reserve): the
    // beaten falls back (not to be fallen on again while it gets away: ARMY.flee), an army to its
    // camp to be made up (gone, with none of it left), a reserve home
    #battle(army, other) {
        const before = [army.size, other.size];
        const { attackers, defenders } = this.#fight(army.size, other.size, 1, { by: army.realm, against: other.realm });

        army.size = attackers;
        other.size = defenders;
        this.remember(other.realm, army.realm, -4);
        this.#emit("battle", { realm: army.realm, against: other.realm, at: [...other.at], won: defenders < attackers, killed: before[1] - defenders, lost: before[0] - attackers, army: army.id, other: other.id, kind: other.kind });

        for (const [force, won] of [
            [army, attackers >= defenders],
            [other, defenders > attackers],
        ]) {
            if (won) {
                continue;
            }

            force.beaten = this.turn;

            if (force.kind === "army" && force.size <= 0) {
                this.#destroyed(force);
            } else if (force.kind === "army") {
                this.#regroup(force);
            } else {
                const seat = this.town(this.realm(force.realm)?.seat);

                if (seat) {
                    Object.assign(force, { mission: "back", target: null, path: this.#wayTo(force.at, seat.at), leg: 0 });
                }
            }
        }
    }

    // Whether a force beaten in the field is still getting away (not to be fallen on again for
    // ARMY.flee turns)
    #fleeing(force) {
        return this.turn - (force.beaten ?? -Infinity) < ARMY.flee;
    }

    // An army put to the sword to the last: gone (its people can raise another)
    #destroyed(army) {
        this.forces.splice(this.forces.indexOf(army), 1);
        this.#emit("destroyed", { realm: army.realm, army: army.id, at: [...army.at] });
    }

    // An army's attack this turn on what it's after (docs/WAR.md *Standing armies*):
    // - a town: its garrison fought behind its walls, its people's reserve beside it if it's there
    //   (and their army, if it's mustering there), and a seat's ruler and captain of its guard
    //   (LEADERS) last; put to the sword to the last,
    //   the town is theirs, a few of the army left to hold it (HELD). No other way to take one;
    // - a works: its guard; put down, it's seized;
    // - a fortification: battered (FORT_SIEGE), its defenders bringing some of the army down;
    //   razed at nothing;
    // - a camp or a supply depot: its guard; put down, it's razed.
    // Beaten back below what it went in with by too much (ARMY.regroup), the army falls back to its
    // camp to be made up, and comes back to it after (#command)
    #attack(army, { kind, thing }) {
        const went = army.size;

        if (kind === "town") {
            // (Covered by its holders' fortification: that first, from a camp built within reach of
            // it if none of theirs is; what it was sent against, after)
            const cover = this.coverOf(thing);

            if (cover) {
                if (!this.#toAttack(army, cover.id)) {
                    this.#toCamp(army, this.#siteFor(army.at, cover.at, CAMP.reach * 0.6), cover.id);
                }

                return;
            }

            // (Beside its garrison: its people's reserve, if it's there, and their army, if it's
            // mustering there)
            const seat = this.realm(thing.owner)?.seat === thing.id;
            const helping = [this.reserveOf(thing.owner), this.armyOf(thing.owner)].filter((force) => force && force.size > 0 && (force.kind === "reserve" || force.mission === "muster") && apart(force.at, thing.at) <= CLOSE.fight + this.#radius(thing.id));
            const defenders = thing.garrison + helping.reduce((sum, { size }) => sum + size, 0) + (seat ? LEADERS : 0);
            const { attackers, defenders: left } = this.#fight(army.size, defenders, HOLDINGS[thing.kind].walls, { by: army.realm, against: thing.owner });
            // (The reserve's fallen first, then the army's, then the garrison's; the leaders last)
            const killed = defenders - left;
            let toll = killed;

            for (const force of helping) {
                const fell = Math.min(force.size, toll);

                force.size -= fell;
                toll -= fell;
            }

            thing.garrison -= Math.min(thing.garrison, toll);
            army.size = attackers;
            this.remember(thing.owner, army.realm, -5);
            this.#emit("assault", { realm: army.realm, town: thing.id, owner: thing.owner, won: left <= 0 && attackers > 0, killed, lost: went - attackers, army: army.id });

            if (left <= 0 && attackers > 0) {
                const garrison = Math.min(army.size, Math.ceil(HOLDINGS[thing.kind].garrison * HELD));

                army.size -= garrison;
                this.#hold(thing, army.realm, Math.max(1, garrison), { how: "army" });

                if (army.size <= 0) {
                    this.#destroyed(army);
                } else {
                    this.#done(army);
                }

                return;
            }
        } else if (kind === "works") {
            const { attackers, defenders } = this.#fight(army.size, thing.guard, 1, { by: army.realm, against: thing.owner });
            const won = defenders === 0 && attackers > 0;

            this.#emit("battle", { realm: army.realm, against: thing.owner, works: thing.id, at: [...thing.at], won, killed: thing.guard - defenders, lost: went - attackers, army: army.id });
            army.size = attackers;
            thing.guard = defenders;

            if (won) {
                const guard = Math.min(WORKED.guard, Math.max(1, Math.floor(army.size / 4)));

                army.size -= guard;
                this.#seize(thing, army.realm, { guard });
                this.#done(army);

                return;
            }

            this.remember(thing.owner, army.realm, -5);
        } else if (kind === "fort") {
            const toll = Math.min(army.size, thing.kind === "garrison" ? FORT_SIEGE.garrison : FORT_SIEGE.tower);

            thing.hp = Math.max(0, thing.hp - army.size * FORT_SIEGE.hp);
            thing.struck = this.turn;
            army.size -= toll;

            if (thing.hp <= 0) {
                this.#raze(thing, army.realm);
                this.#done(army);

                return;
            }
        } else {
            const { attackers, defenders } = this.#fight(army.size, thing.guard, 1, { by: army.realm, against: thing.realm });

            this.#emit("battle", { realm: army.realm, against: thing.realm, [kind]: thing.id, at: [...thing.at], won: defenders === 0, killed: thing.guard - defenders, lost: went - attackers, army: army.id });
            army.size = attackers;
            thing.guard = defenders;

            if (!defenders) {
                if (kind === "depot") {
                    this.#razeDepot(thing, army.realm);
                } else {
                    this.#razeCamp(thing, army.realm);
                }

                this.#done(army);

                return;
            }
        }

        if (army.size <= 0) {
            this.#destroyed(army);
        } else if (army.size < army.went * ARMY.regroup) {
            this.#emit("fellBack", { realm: army.realm, army: army.id, from: thing.id });
            this.#regroup(army);
        }
    }

    // Two sides fight it out, round by round, until one's gone or the attack breaks. The
    // defenders' walls count for them; and each side's people's lean (armies.js EDGES: `by`, the
    // attackers' people, and `against`, the defenders', or null for anyone else's)
    #fight(attackers, defenders, walls, { by = null, against = null } = {}) {
        let [a, d] = [attackers, defenders];
        const [strike, back] = [EDGES[by]?.attack ?? 1, EDGES[against]?.defend ?? 1];

        for (let round = 0; round < 20 && a > 0 && d > 0; round++) {
            const killed = Math.min(d, Math.max(1, Math.round((a * 0.12 * this.random.range(0.6, 1.4) * strike) / walls)));
            const lost = Math.min(a, Math.max(1, Math.round(d * 0.12 * this.random.range(0.6, 1.4) * walls * back)));

            d -= killed;
            a -= lost;

            if (a < attackers * 0.35 && a < d) {
                break;
            }
        }

        return { attackers: a, defenders: d };
    }

    // A town taken (its garrison put to the sword: by an army, `how` "army", or played out in the
    // world, "played"): `realm`'s people hold it now, with `garrison` of theirs (its folk stay,
    // under their new rulers). Its rulers' seat taken, the realm is the taker's vassal, and rules
    // from it again under them
    #hold(town, realm, garrison, { how = null } = {}) {
        const from = town.owner;
        const taker = this.realm(realm);
        // (Sacked by its takers: so many turns of its taxes, the more the greedier their ruler)
        const sacked = taker ? Math.round(HOLDINGS[town.kind].tax * SACK.turns * (0.5 + taker.leader.traits.greed)) : 0;

        town.owner = realm;
        town.garrison = garrison;

        if (taker) {
            taker.treasury += sacked;
        }

        this.remember(from, realm, -20);
        this.#emit("taken", { town: town.id, from, to: realm, sacked, ...(how ? { how } : {}) });

        const loser = this.realm(from);

        if (loser && town.id === loser.seat) {
            town.owner = loser.id;
            this.#subjugate(loser, this.liege(realm));
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

        // (Its army and reserve cut to what a vassal keeps, and its army's orders and aims done with)
        this.#trim(realm);

        const army = this.armyOf(realm.id);

        if (army) {
            army.orders = null;
            this.#goHome(army);
        }

        this.#emit("subjugated", { realm: realm.id, by, was });
    }

    // A realm with no towns left is no more (and any that served it are free)
    #fall(realm) {
        realm.alive = false;
        realm.overlord = null;

        // (Its works whoever holds most of its old towns', or left to the wild)
        const heir = this.oppressor(realm.id);

        for (const works of this.works.filter(({ owner }) => owner === realm.id)) {
            Object.assign(works, heir ? { owner: heir, guard: Math.min(works.guard, OVERRUN.held), escort: 0 } : { held: true, band: OVERRUN.band, guard: 0, escort: 0, yard: 0 });
        }

        for (const vassal of this.realms.filter(({ overlord }) => overlord === realm.id)) {
            vassal.overlord = null;
            vassal.since = this.turn;
        }

        for (const force of this.forces.filter(({ realm: id }) => id === realm.id)) {
            this.forces.splice(this.forces.indexOf(force), 1);
        }

        for (const camp of this.camps.filter(({ realm: id }) => id === realm.id)) {
            this.#dropCamp(camp);
        }

        this.#emit("fallen", { realm: realm.id });
    }

    // Envoys passing an enemy's army, reserve or band may be waylaid (the more warlike the enemy,
    // the likelier)
    #waylay() {
        for (const envoy of this.forces.filter(({ kind, id }) => kind === "envoy" && !this.watched.has(id))) {
            const by = this.forces.find((force) => FIGHTING.includes(force.kind) && force.size > 0 && this.hostile(force.realm, envoy.realm) && apart(force.at, envoy.at) <= REACH.waylay);

            if (by && this.random.chance(this.realm(this.liege(by.realm)).leader.traits.aggression * 0.25)) {
                this.forces.splice(this.forces.indexOf(envoy), 1);
                this.remember(envoy.realm, by.realm, -10);
                this.#emit("waylaid", { realm: envoy.realm, by: by.realm, to: envoy.target, mission: envoy.mission, force: envoy.id });
            }
        }
    }

    // The works: each held and guarded fills its yard; a convoy sets out from it once there's a
    // wagon's load waiting and enough of its guards home, for its people's seat
    #work() {
        for (const works of this.works) {
            const owner = this.realm(works.owner);

            if (!owner?.alive || works.held) {
                continue;
            }

            const resource = YIELDS[works.kind];

            if (works.guard > 0) {
                works.yard = Math.min(WORKED.yard, Math.round((works.yard + WORKED.yields[resource]) * 10) / 10);
            }

            if (works.yard < CONVOY.load || works.escort < CONVOY.fewest || this.#convoyOf(works)) {
                continue;
            }

            const seat = this.town(owner.seat);
            const path = seat && this.#routeFrom(works.at, seat.id);

            if (!path) {
                continue;
            }

            const amount = Math.min(works.yard, CONVOY.wagons * CONVOY.load);

            works.yard = Math.round((works.yard - amount) * 10) / 10;
            this.forces.push({ id: `force-${this.nextForce++}`, realm: owner.id, kind: "convoy", size: works.escort, at: [...path[0]], path, leg: 0, target: seat.id, home: works.id, mission: null, about: null, cargo: { [resource]: amount }, back: false, since: this.turn });
            works.escort = 0;
        }
    }

    // Convoys on the roads may be fallen on (not those a player's near): by an enemy's forces
    // passing (the more warlike, the likelier), who carry off half of what it carried; or by the
    // brigands of a wild camp near its way, who carry off the lot. So may supply wagons: taken
    #ambush() {
        for (const wagon of this.forces.filter(({ kind, id }) => kind === "supply" && !this.watched.has(id))) {
            const by = this.forces.find((force) => FIGHTING.includes(force.kind) && force.size > 0 && this.hostile(force.realm, wagon.realm) && apart(force.at, wagon.at) <= REACH.waylay);
            const camp = by ? null : this.plan.camps.find((each) => BRIGANDS.includes(each.faction) && apart(each.at, wagon.at) <= REACH.ambush);
            const chance = by ? this.realm(this.liege(by.realm)).leader.traits.aggression * 0.5 : camp ? AMBUSH : 0;

            if (chance && this.random.chance(chance)) {
                this.#wagonLost(wagon, by?.realm ?? null, { faction: camp?.faction ?? null });
            }
        }

        for (const convoy of this.forces.filter(({ kind, id }) => kind === "convoy" && !this.watched.has(id))) {
            if (!convoy.cargo) {
                continue;
            }

            const by = this.forces.find((force) => FIGHTING.includes(force.kind) && force.size > 0 && this.hostile(force.realm, convoy.realm) && apart(force.at, convoy.at) <= REACH.waylay);
            const camp = by ? null : this.plan.camps.find((each) => BRIGANDS.includes(each.faction) && apart(each.at, convoy.at) <= REACH.ambush);
            const chance = by ? this.realm(this.liege(by.realm)).leader.traits.aggression * 0.5 : camp ? AMBUSH : 0;

            if (!chance || !this.random.chance(chance)) {
                continue;
            }

            const { attackers, defenders } = this.#fight(by ? by.size : OVERRUN.band, convoy.size, 1, { by: by?.realm ?? null, against: convoy.realm });

            if (by) {
                by.size = attackers;
                this.remember(convoy.realm, by.realm, -8);
            }

            convoy.size = defenders;

            if (defenders > 0) {
                this.#emit("ambushed", { realm: convoy.realm, by: by?.realm ?? null, faction: camp?.faction ?? null, works: convoy.home, beaten: true, force: convoy.id });
                continue;
            }

            // (Lost: what it carried, half of it the enemy's)
            const plunderer = by && this.realm(by.realm);

            for (const [resource, amount] of Object.entries(plunderer ? convoy.cargo : {})) {
                plunderer.stores[resource] = Math.round((plunderer.stores[resource] + amount / 2) * 10) / 10;
            }

            this.forces.splice(this.forces.indexOf(convoy), 1);
            this.#emit("ambushed", { realm: convoy.realm, by: by?.realm ?? null, faction: camp?.faction ?? null, works: convoy.home, cargo: convoy.cargo, beaten: false, force: convoy.id });
        }
    }

    // The wild's bands overrun a works now and then (not one a player's near): the likelier the
    // emptier its guard (OVERRUN), its guard and its convoy's put to the sword and its yard looted
    #overrun() {
        for (const works of this.works) {
            if (works.held || !this.realm(works.owner)?.alive || this.watched.has(works.id)) {
                continue;
            }

            const empty = 1 - Math.min(1, works.guard / WORKED.guard);

            if (this.random.chance(OVERRUN.base + OVERRUN.weak * empty * empty)) {
                Object.assign(works, { held: true, band: OVERRUN.band, guard: 0, escort: 0, yard: 0 });
                this.#emit("overrun", { works: works.id, owner: works.owner });
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

        // (Its folk risen within the walls: they take it only by putting its garrison to the sword
        // to the last, as an army would; else the rising's crushed, and they wait to rise again)
        const rebels = Math.ceil(HOLDINGS[town.kind].garrison * RISING.garrison * RISING.rebels);
        const { attackers, defenders } = this.#fight(rebels, town.garrison, 1, { by: realm.id, against: town.owner });

        town.garrison = defenders;
        this.remember(this.liege(from), realm.id, -30);

        if (defenders > 0 || attackers <= 0) {
            this.#emit("crushed", { realm: realm.id, town: town.id, from, against, led, killed: rebels - attackers });

            return;
        }

        Object.assign(town, { owner: realm.id, garrison: Math.min(attackers, HOLDINGS[town.kind].garrison) });
        Object.assign(realm, { alive: true, overlord: null, seat: town.id, treasury: Math.max(realm.treasury, COSTS.start / 2) });
        this.#reserveFor(realm);

        // (Any army before it was the old holders' friends': now it's against a rising)
        this.#set(realm.id, this.liege(from), "hostile");
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
