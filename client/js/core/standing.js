// A player's standing in their people (docs/WAR.md M4): a ladder of ranks, earned by carrying out
// what their rulers ask of them, each rank opening more of what they can ask and do:
// - work from the town halls' reeves, from the first;
// - scouting, once they're trusted;
// - an audience at the keep, work from the ruler and their steward, and the pick of its armoury;
// - then a say in what the rulers decide: where the next expedition marches, and war and peace.
//
// And the requests: what's asked (a letter carried, a tithe for the treasury, the enemy's numbers
// thinned, the wild cleared off the roads, an enemy scouted, a town held), by whom and where, how
// it's done, and what it's worth. Offered by `offerRequest`, from the war as it stands; carried
// out in the world, watched by the host (core/host.js); kept with the character (app/save.js).
//
// Pure data and a little bookkeeping, no DOM.

import { ADJECTIVES } from "./war/peoples.js";

/** The ranks: each one's title, the standing it takes, and what it opens. */
export const STANDINGS = Object.freeze([
    { title: "Commoner", points: 0, opens: "Work from the reeves at the town halls." },
    { title: "Freeholder", points: 60, opens: "Scouting for the reeves." },
    { title: "Retainer", points: 180, opens: "An audience at the keep, work from the ruler, and the pick of its armoury." },
    { title: "Knight", points: 400, opens: "A say in where the next expedition marches, and, serving another, when to rise." },
    { title: "Lord", points: 800, opens: "A say in war and peace." },
    { title: "Councillor", points: 1500, opens: "A seat on the council: your word weighs the most." },
]);

/** The rank that opens each thing. */
export const OPENS = Object.freeze({ scout: 1, keep: 2, armoury: 2, defend: 2, rout: 2, march: 3, escort: 3, waylay: 3, rise: 3, peace: 4, war: 4 });

/** How much a player's counsel weighs with their rulers, by rank (0 below a Knight). */
export const COUNSEL = Object.freeze([0, 0, 0, 0.4, 0.7, 1]);

/** The most requests a player carries at once. */
export const MOST_REQUESTS = 3;

/** How many done and failed requests are kept (the journal's last few). */
const KEEP_DONE = 12;

/**
 * What's asked, and what it's worth: each kind's title, the rank it's first offered at, how long
 * there is to do it (war turns: a minute's play each; with `perKm`, more the further it is), and
 * its reward (standing and gold; `each` for each foe, `perKm` for each km to go).
 */
export const REQUESTS = Object.freeze({
    message: { title: "A letter to carry", rank: 0, turns: 12, perKm: 10, reward: { standing: 10, gold: 6, perKm: { standing: 5, gold: 3 } } },
    tithe: { title: "A tithe for the treasury", rank: 0, turns: 30, reward: { standing: 0, gold: 0 } },
    bounty: { title: "Thin their numbers", rank: 0, turns: 60, reward: { standing: 4, gold: 4, each: { standing: 6, gold: 3 } } },
    wild: { title: "Clear the roads", rank: 0, turns: 45, reward: { standing: 6, gold: 6, each: { standing: 8, gold: 4 } } },
    scout: { title: "Scouting", rank: OPENS.scout, turns: 40, reward: { standing: 25, gold: 15 } },
    defend: { title: "Hold the town", rank: OPENS.defend, turns: null, reward: { standing: 50, gold: 30 } },
    rout: { title: "Break the camp", rank: OPENS.rout, turns: 40, reward: { standing: 60, gold: 40 } },
    escort: { title: "See the envoy there", rank: OPENS.escort, turns: null, reward: { standing: 70, gold: 40 } },
    waylay: { title: "Stop their envoy", rank: OPENS.waylay, turns: null, reward: { standing: 70, gold: 50 } },
    // The adventurers' guild's contracts (M8): open to anyone, paid in gold
    beasts: { title: "Beasts on the roads", rank: 0, turns: 45, reward: { standing: 0, gold: 10, each: { standing: 0, gold: 7 } } },
    hunt: { title: "A bounty", rank: 0, turns: 60, reward: { standing: 0, gold: 8, each: { standing: 0, gold: 6 } } },
    camp: { title: "The camp outside the walls", rank: 0, turns: 40, reward: { standing: 0, gold: 70 } },
});

/** How near (m) a player goes to see what they're scouting, and to be there to hold a town (from its middle). */
export const REQUEST_REACH = Object.freeze({ scout: 220, defend: 180, rout: 150, escort: 60 });

/** What the keep's gift is worth more than a reeve's (its rewards, times this). */
export const KEEP_REWARD = 1.5;

/** What goes into the treasury (the war's gold) for each gold piece tithed. */
export const TITHE_RATE = 0.25;

/** A request that fails (let run out, or lost): standing lost. */
export const FAILED = 5;

/**
 * The armoury's gift for each rank from a Retainer up, once each: something for the weapon the
 * player carries (a hero's `weapon`, as items.js knows it: progress.js ITEMS).
 */
export function armouryGift(rank, weapon, withShield) {
    switch (rank) {
        case 2:
            return { id: "mail", quality: "fine" };
        case 3:
            return { id: weapon, quality: "masterwork" };
        case 4:
            return withShield ? { id: "kiteShield", quality: "masterwork" } : { id: "mail", quality: "masterwork" };
        case 5:
            return { id: weapon, quality: "legendary" };
        default:
            return null;
    }
}

const apart = ([ax, ay], [bx, by]) => Math.hypot(ax - bx, ay - by);

// The words for a people's soldiers ("orcish soldiers")
const soldiersOf = (realm) => `${ADJECTIVES[realm] ?? realm} soldiers`;

// Which towns have someone to take a letter to: a reeve at a town hall, or the steward at a keep
const HALLED = Object.freeze(["town", "city", "capital"]);

/**
 * What a player could be asked to do now: one request (or null: nothing wanted), chosen by
 * `random` (random.js) from what their people need, as the war (war/war.js) stands.
 *
 * @param {object} options
 * @param {object} options.war - The war.
 * @param {string} options.realm - The player's people (a realm's id).
 * @param {string} options.town - Where the one asking sits (a war town's id).
 * @param {string} options.post - "hall" (a town's reeve) or "keep" (the ruler, or their steward).
 * @param {string} options.giver - Who's asking: { id, name, title }.
 * @param {number} options.rank - The player's rank.
 * @param {object[]} [options.held] - The requests they carry (not asked twice).
 * @param {object} options.random - Random numbers (random.js).
 */
export function offerRequest({ war, realm, town: townId, post, giver, rank, held = [], random }) {
    const town = war.town(townId);
    const liege = war.liege(realm);

    if (!town || !war.realm(realm)?.alive || war.liege(town.owner) !== liege || held.length >= MOST_REQUESTS) {
        return null;
    }

    const kinds = [];
    const has = (kind, key) => held.some((request) => request.kind === kind && (key === undefined || request.key === key));
    const enemies = war.enemiesOf(liege);

    // A letter, to another town of their own
    const others = war.towns
        .filter((each) => each.id !== town.id && each.owner === realm && HALLED.includes(each.kind))
        .sort((a, b) => apart(a.at, town.at) - apart(b.at, town.at))
        .slice(0, 3)
        .filter((each) => !has("message", each.id));

    if (others.length) {
        kinds.push("message");
    }

    // A tithe, while the treasury's thin; or, while they serve another, for the rising (M10)
    const rising = war.oppressor?.(realm) && town.owner === realm ? war.oppressor(realm) : null;

    if ((war.realm(realm).treasury < 40 || rising) && !has("tithe")) {
        kinds.push("tithe");
    }

    // Their enemies' soldiers thinned; or the wild off the roads, in peace
    if (enemies.length && !has("bounty")) {
        kinds.push("bounty");
    }

    if (!has("wild")) {
        kinds.push("wild");
    }

    // An enemy camp or army near, or the nearest enemy town, scouted
    const scouting = rank >= OPENS.scout ? scoutable(war, liege, town).filter(({ key }) => !has("scout", key)) : [];

    if (scouting.length) {
        kinds.push("scout");
    }

    // One of their towns under threat, held (a reeve's own; any of them, from the keep)
    const threatened = rank >= OPENS.defend ? threatenedTowns(war, realm).filter(({ town: each }) => (post === "keep" || each.id === town.id) && !has("defend", each.id)) : [];

    if (threatened.length) {
        kinds.push("defend", "defend");
    }

    // An enemy camp before one of their towns broken up (the reeve's own; any of them, from the keep)
    const camps = rank >= OPENS.rout ? threatenedTowns(war, realm).filter(({ town: each, camp }) => (post === "keep" || each.id === town.id) && !has("rout", camp.id)) : [];

    if (camps.length) {
        kinds.push("rout");
    }

    // The keep's envoys seen safe on the road, and an enemy's stopped (from a Knight up)
    const envoys = post === "keep" ? war.forces.filter((force) => force.kind === "envoy") : [];
    const ours = rank >= OPENS.escort ? envoys.filter((envoy) => war.liege(envoy.realm) === liege && !has("escort", envoy.id)) : [];
    const theirs = rank >= OPENS.waylay ? envoys.filter((envoy) => war.hostile(liege, war.liege(envoy.realm)) && !has("waylay", envoy.id)) : [];

    if (ours.length) {
        kinds.push("escort");
    }

    if (theirs.length) {
        kinds.push("waylay");
    }

    if (!kinds.length) {
        return null;
    }

    // (The keep asks the weightier things when it can)
    const weighty = kinds.filter((kind) => ["scout", "defend", "rout", "escort", "waylay", "bounty"].includes(kind));
    const kind = random.pick(post === "keep" && weighty.length ? weighty : kinds);
    const times = post === "keep" ? KEEP_REWARD : 1;
    const worth = (standing, gold) => ({ standing: Math.round(standing * times), gold: Math.round(gold * times) });
    const { title, turns, reward } = REQUESTS[kind];
    const from = { id: giver.id, name: giver.name, title: giver.title, town: town.id, townName: town.name, post };
    const base = { kind, title, from, given: war.turn, state: "open", count: 0 };

    switch (kind) {
        case "message": {
            const to = random.pick(others);
            const km = apart(to.at, town.at) / 1000;
            const whom = to.kind === "capital" ? `the steward at the keep in ${to.name}` : `the reeve at ${to.name}'s town hall`;

            return {
                ...base,
                key: to.id,
                target: { town: to.id, name: to.name, at: [...to.at], post: to.kind === "capital" ? "keep" : "hall" },
                text: `Carry this letter to ${whom}. It's sealed: see it stays that way.`,
                until: war.turn + Math.ceil(turns + km * REQUESTS.message.perKm),
                reward: worth(reward.standing + reward.perKm.standing * km, reward.gold + reward.perKm.gold * km),
            };
        }
        case "tithe": {
            const amount = 20 + 10 * Math.min(4, rank + war.stage);

            const text = rising ? `Quietly, now. We're putting by arms against ${war.realm(rising).name}, for when the day comes. Bring ${amount} gold for them.` : `The treasury's thin. Bring ${amount} gold for it, and it won't be forgotten.`;

            return { ...base, key: "tithe", target: { gold: amount }, text, until: war.turn + turns, reward: worth(amount / 2, 0) };
        }
        case "bounty": {
            const foe = random.pick(enemies);
            const need = 2 + Math.min(4, rank) + random.int(0, 1);

            return {
                ...base,
                key: foe,
                target: { realm: foe, need },
                text: `We're at war with ${war.realm(foe).name}. Bring down ${need} of the ${soldiersOf(foe)}, wherever you find them.`,
                until: war.turn + turns,
                reward: worth(reward.standing + reward.each.standing * need, reward.gold + reward.each.gold * need),
            };
        }
        case "wild": {
            const need = 1 + Math.min(2, rank);

            return {
                ...base,
                key: "wild",
                target: { wild: true, need },
                text: `Beasts and worse have been at travellers on the roads round ${town.name}. Put an end to ${need === 1 ? "one of them" : `${need} of them`}.`,
                until: war.turn + turns,
                reward: worth(reward.standing + reward.each.standing * need, reward.gold + reward.each.gold * need),
            };
        }
        case "scout": {
            const { key, target, what } = random.pick(scouting);

            return { ...base, key, target, text: `Go and look at ${what}: how many, how armed, how dug in. Then come back and tell me.`, until: war.turn + turns, reward: worth(reward.standing, reward.gold) };
        }
        case "defend": {
            const { town: held, camp } = random.pick(threatened);

            return {
                ...base,
                key: held.id,
                target: { town: held.id, name: held.name, at: [...held.at], camp: camp.id, realm: camp.realm },
                text: `${war.realm(camp.realm).name} have camped within a march of ${held.name}. Get there, and help hold it until they're gone.`,
                until: null,
                reward: worth(reward.standing, reward.gold),
            };
        }
        case "rout": {
            const { town: held, camp } = random.pick(camps);

            return {
                ...base,
                key: camp.id,
                target: { force: camp.id, realm: camp.realm, at: [...camp.at], town: held.id, name: held.name },
                text: `${war.realm(camp.realm).name} have a camp outside ${held.name}. Take what help you can find, and break it up: bring its soldiers down until it's too few to hold.`,
                until: war.turn + turns,
                reward: worth(reward.standing, reward.gold),
            };
        }
        case "escort": {
            const envoy = random.pick(ours);
            const to = war.realm(envoy.target);

            return {
                ...base,
                key: envoy.id,
                target: { force: envoy.id, realm: envoy.target, at: [...envoy.at], name: `our envoy to ${to.name}` },
                text: `Our envoy is on the road to ${to.name}, and not everyone wants them to get there. Find them, and see them safe to ${war.town(to.seat)?.name ?? "their seat"}.`,
                until: null,
                reward: worth(reward.standing, reward.gold),
            };
        }
        case "waylay": {
            const envoy = random.pick(theirs);
            const from = war.realm(envoy.realm);

            return {
                ...base,
                key: envoy.id,
                target: { force: envoy.id, realm: envoy.realm, at: [...envoy.at], name: `the envoy of ${from.name}` },
                text: `${from.name} have an envoy on the road, and whatever they carry, it's no good to us. See they don't get where they're going.`,
                until: null,
                reward: worth(reward.standing, reward.gold),
            };
        }
        default:
            return null;
    }
}

/**
 * A contract from an adventurers' guild's board in a town (docs/WAR.md M8), for anyone of any
 * people (no standing needed, and none given: gold): beasts off the roads round it; a bounty on
 * the soldiers of a people at war with those who hold it; the camp outside it broken up. Null if
 * there's nothing on the board they haven't got already.
 * @param {object} options
 * @param {object} options.war - The war (war.js).
 * @param {string} options.town - The town the guild's in (an id).
 * @param {object} options.giver - Who's at the counter: { id, name, title }.
 * @param {object[]} [options.held] - The requests they carry.
 * @param {object} options.random - Random numbers (random.js).
 */
export function offerContract({ war, town: townId, giver, held = [], random }) {
    const town = war.town(townId);

    if (!town || held.length >= MOST_REQUESTS) {
        return null;
    }

    const has = (kind, key) => held.some((request) => request.kind === kind && request.key === key);
    const holders = war.liege(town.owner);
    const foes = war.enemiesOf(holders).filter((foe) => !has("hunt", foe));
    const camps = war.forces.filter((force) => force.kind === "camp" && force.target === town.id && war.hostile(force.realm, town.owner) && !has("camp", force.id));
    const kinds = [...(has("beasts", town.id) ? [] : ["beasts", "beasts"]), ...(foes.length ? ["hunt"] : []), ...(camps.length ? ["camp", "camp"] : [])];

    if (!kinds.length) {
        return null;
    }

    const kind = random.pick(kinds);
    const { title, turns, reward } = REQUESTS[kind];
    const from = { id: giver.id, name: giver.name, title: giver.title || "Guild receptionist", town: town.id, townName: town.name, post: "guild" };
    const base = { kind, title, from, given: war.turn, state: "open", count: 0 };
    const pay = (gold) => ({ standing: 0, gold: Math.round(gold) });

    switch (kind) {
        case "beasts": {
            const need = 2 + random.int(0, 2);

            return { ...base, key: town.id, target: { wild: true, need }, text: `Wanted: someone to see off the beasts on the roads round ${town.name}. ${need} of them, and the carters will breathe again.`, until: war.turn + turns, reward: pay(reward.gold + reward.each.gold * need) };
        }
        case "hunt": {
            const foe = random.pick(foes);
            const need = 2 + random.int(0, 2);

            return { ...base, key: foe, target: { realm: foe, need }, text: `Bounty, posted for ${war.realm(holders).name}: ${need} of the ${soldiersOf(foe)}, brought down wherever they're found.`, until: war.turn + turns, reward: pay(reward.gold + reward.each.gold * need) };
        }
        case "camp": {
            const camp = random.pick(camps);

            return { ...base, key: camp.id, target: { force: camp.id, realm: camp.realm, at: [...camp.at], town: town.id, name: town.name }, text: `${war.realm(camp.realm).name} have a camp outside ${town.name}, and the merchants want it gone. Break it up.`, until: war.turn + turns, reward: pay(reward.gold) };
        }
        default:
            return null;
    }
}

// What there is to scout near a town, for a people: enemy camps and armies within a few km, or
// failing those the nearest enemy town
function scoutable(war, liege, town) {
    const forces = war.forces
        .filter((force) => (force.kind === "camp" || force.kind === "expedition") && war.hostile(liege, war.liege(force.realm)) && apart(force.at, town.at) < 4000)
        .map((force) => ({ key: force.id, target: { force: force.id, realm: force.realm, at: [...force.at] }, what: `the ${force.kind === "camp" ? "camp" : "army on the march"} ${war.realm(force.realm).name} have ${force.kind === "camp" ? "set up" : "sent out"} near ${town.name}` }));

    if (forces.length) {
        return forces;
    }

    const enemy = war.towns.filter((each) => war.hostile(liege, war.liege(each.owner))).sort((a, b) => apart(a.at, town.at) - apart(b.at, town.at))[0];

    return enemy ? [{ key: enemy.id, target: { town: enemy.id, name: enemy.name, realm: enemy.owner, at: [...enemy.at] }, what: `${enemy.name}, held by ${war.realm(enemy.owner).name}` }] : [];
}

// A people's towns with an enemy camp near them
function threatenedTowns(war, realm) {
    const towns = [];

    for (const town of war.towns.filter(({ owner }) => owner === realm)) {
        const camp = war.forces.find((force) => force.kind === "camp" && war.hostile(force.realm, realm) && apart(force.at, town.at) <= 1000);

        if (camp) {
            towns.push({ town, camp });
        }
    }

    return towns;
}

/**
 * Where a request's taking the player (for the journal and the maps): [x, y] metres, or null;
 * and its name.
 */
export function whereTo(request, war) {
    const { target, from, state } = request;

    if (state === "done") {
        return request.kind === "message" ? { at: target.at, name: target.name } : { at: war?.town(from.town)?.at ?? null, name: from.townName };
    }

    if (target.force) {
        const force = war?.force(target.force);

        return { at: force ? force.at : target.at, name: target.name ?? "the enemy" };
    }

    if (target.at) {
        return { at: target.at, name: target.name };
    }

    return { at: null, name: null };
}

/**
 * How far a request's come, in words: "2 of 4 brought down", "Seen: go back and tell them".
 */
export function progressOf(request) {
    const { kind, target, state, count } = request;

    if (state === "done") {
        return kind === "message" ? `Take it to ${target.post === "keep" ? "the steward" : "the reeve"} in ${target.name}.` : `Done: go back to ${request.from.name} in ${request.from.townName}.`;
    }

    switch (kind) {
        case "message":
            return `Take it to ${target.post === "keep" ? "the steward" : "the reeve"} in ${target.name}.`;
        case "tithe":
            return `Bring ${target.gold} gold to ${request.from.name} in ${request.from.townName}.`;
        case "bounty":
        case "wild":
        case "beasts":
        case "hunt":
            return `${count} of ${target.need} brought down.`;
        case "scout":
            return "Go near enough to see them.";
        case "defend":
            return request.there ? "Hold on until they're gone." : `Get to ${target.name}.`;
        case "rout":
        case "camp":
            return request.there ? "Bring its soldiers down." : `Find the camp outside ${target.name}.`;
        case "escort":
            return request.there ? "Stay with them to the end of the road." : "Find them on the road.";
        case "waylay":
            return "Find them on the road, and stop them.";
        default:
            return "";
    }
}

/** A request as kept: one kept when the money was coppers has what it pays and asks read as gold. */
function inGold(request) {
    const kept = { ...request };

    for (const key of ["reward", "target"]) {
        if (request[key] && "coppers" in request[key]) {
            const { coppers, ...rest } = request[key];

            kept[key] = { ...rest, gold: coppers };
        }
    }

    return kept;
}

/** A player's standing: their points, their rank from them, the requests they carry, and those done. */
export class Standing {
    /**
     * @param {object} [kept] - As kept (toJSON): { points, claimed, requests, done, next }.
     */
    constructor({ points = 0, claimed = [], requests = [], done = [], next = 1 } = {}) {
        this.points = Math.max(0, Number.isFinite(points) ? points : 0);

        /** The ranks whose armoury gift has been had. */
        this.claimed = claimed.filter((rank) => Number.isInteger(rank));

        /** The requests carried (at most MOST_REQUESTS), and the last done or failed (newest first). */
        this.requests = requests.filter((request) => REQUESTS[request?.kind]).slice(0, MOST_REQUESTS).map(inGold);
        this.done = done.filter((request) => REQUESTS[request?.kind]).slice(0, KEEP_DONE).map(inGold);
        this.next = Number.isInteger(next) && next > 0 ? next : 1;
    }

    /** Their rank (an index into STANDINGS). */
    rank() {
        return STANDINGS.findLastIndex(({ points }) => this.points >= points);
    }

    title() {
        return STANDINGS[this.rank()].title;
    }

    /** How far to the next rank: { points, from, to } (to: null at the top). */
    toNext() {
        const rank = this.rank();

        return { points: this.points, from: STANDINGS[rank].points, to: STANDINGS[rank + 1]?.points ?? null };
    }

    /** Gain (or lose) standing. Returns the ranks newly reached: [{ rank, title }]. */
    gain(amount) {
        const before = this.rank();

        this.points = Math.max(0, Math.round(this.points + amount));

        const after = this.rank();
        const reached = [];

        for (let rank = before + 1; rank <= after; rank++) {
            reached.push({ rank, title: STANDINGS[rank].title });
        }

        return reached;
    }

    /** Take a request on (given an id). Returns it, or null (carrying too many). */
    take(request) {
        if (this.requests.length >= MOST_REQUESTS) {
            return null;
        }

        const taken = { ...request, id: `request-${this.next++}` };

        this.requests.push(taken);

        return taken;
    }

    find(id) {
        return this.requests.find((request) => request.id === id) ?? null;
    }

    /** Set a request down as done or failed (or given up), kept among the last few. */
    close(id, state) {
        const request = this.find(id);

        if (!request) {
            return null;
        }

        this.requests = this.requests.filter((each) => each !== request);
        request.state = state;
        this.done.unshift(request);
        this.done.length = Math.min(this.done.length, KEEP_DONE);

        return request;
    }

    toJSON() {
        return { points: this.points, claimed: [...this.claimed], requests: structuredClone(this.requests), done: structuredClone(this.done), next: this.next };
    }
}
