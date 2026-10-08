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

import { candidatesAt, CREATURES, tierAt } from "./creatures.js";
import { bandOf, holderOf, placesOf } from "./places.js";
import { PARTS, SPOILS } from "./spoils.js";
import { rollTome, SPELLS } from "./spells.js";
import { ADJECTIVES } from "./war/peoples.js";
import { hypot } from "./exact.js";
import { landAt } from "./worldplan/plan.js";

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
export const OPENS = Object.freeze({ scout: 1, keep: 2, armoury: 2, defend: 2, rout: 2, convoy: 2, retake: 2, march: 3, escort: 3, waylay: 3, plunder: 3, seize: 3, rise: 3, peace: 4, war: 4 });

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
    // (The works and their convoys: docs/WAR.md *Convoys*)
    convoy: { title: "See the convoy in", rank: OPENS.convoy, turns: null, reward: { standing: 45, gold: 30 } },
    plunder: { title: "Fall on their convoy", rank: OPENS.plunder, turns: null, reward: { standing: 55, gold: 40 } },
    retake: { title: "Win back the works", rank: OPENS.retake, turns: 40, reward: { standing: 50, gold: 35 } },
    seize: { title: "Take their works", rank: OPENS.seize, turns: 40, reward: { standing: 70, gold: 45 } },
    // The adventurers' guild's contracts (M8): open to any registered adventurer, of any people,
    // paid in gold and the guild's merit, never their people's standing; `rank` here is the guild
    // rank each is first offered at (GUILD_RANKS)
    beasts: { title: "Beasts on the roads", rank: 0, turns: 45, reward: { standing: 0, gold: 10, each: { standing: 0, gold: 7 }, merit: 3 } },
    hunt: { title: "A bounty", rank: 1, turns: 60, reward: { standing: 0, gold: 8, each: { standing: 0, gold: 6 }, merit: 4 } },
    camp: { title: "The camp outside the walls", rank: 2, turns: 40, reward: { standing: 0, gold: 70, merit: 6 } },
    parts: { title: "Wanted at the guild", rank: 0, turns: 60, reward: { standing: 0, gold: 4, share: 1.6, merit: 2 } },
    // (A sealed package to another town's guild, on the way to strangers: offerCourier)
    courier: { title: "A sealed package", rank: 0, turns: 12, perKm: 10, reward: { standing: 0, gold: 8, perKm: { standing: 0, gold: 6 }, merit: 3 } },
    // (A place held by outlaws or the dead put to the sword: more for a bigger place, and more for
    // each tier of its land's danger; its merit by its size)
    clear: { title: "Put them to the sword", rank: 0, turns: 90, reward: { standing: 0, gold: 30, size: { small: 0, medium: 25, large: 60 }, tier: 9, merit: { small: 4, medium: 7, large: 12 } } },
});

/**
 * The adventurers' guilds' ranks (docs/WAR.md M8): one card, good at every branch, earned by the
 * merit of the guilds' contracts done (and only by them: a people's requests give standing, the
 * guilds' merit). Each rank's title, the merit it takes, and what the guilds give at it: the work
 * it opens (REQUESTS' `rank`, and the biggest place to clear, GUILD_SIZES), how many more foes or
 * parts each contract asks for than a Copper's (`more`), the least level of beasts asked for
 * (`level`: as near as the land has them), what it pays, times the Copper's (`pay`), and what a
 * step through the guild's portals costs them, times the Copper's (`fare`: core/portals.js).
 */
export const GUILD_RANKS = Object.freeze([
    { title: "Copper", merit: 0, more: 0, level: 1, pay: 1, fare: 1, opens: "Beasts on the roads, parts wanted at the guild, sealed packages, and the small places to clear." },
    { title: "Iron", merit: 10, more: 1, level: 1, pay: 1.1, fare: 0.8, opens: "Bounties on the soldiers of a people at war, more of everything asked, and a fifth off the portals." },
    { title: "Bronze", merit: 30, more: 1, level: 2, pay: 1.25, fare: 0.6, opens: "The camps outside the walls, the middling places to clear, beasts of level 2 or more, and two fifths off the portals." },
    { title: "Silver", merit: 70, more: 2, level: 3, pay: 1.4, fare: 0.4, opens: "Beasts of level 3 or more, more of everything asked, and three fifths off the portals." },
    { title: "Gold", merit: 140, more: 3, level: 4, pay: 1.6, fare: 0.2, opens: "The great places to clear, beasts of level 4 or more, more of everything asked, and four fifths off the portals." },
    { title: "Mithril", merit: 250, more: 4, level: 5, pay: 1.8, fare: 0, opens: "The hardest work the guilds have, beasts of level 5 or more, the best pay, and the portals free." },
]);

/** The guild rank at which each size of place held is first given to clear (and from it, the biggest near). */
export const GUILD_SIZES = Object.freeze({ small: 0, medium: 2, large: 4 });

/** The guild rank from which the guilds want the dearer half of the parts they want (dearest). */
export const GUILD_DEARER = 2;

/** A guild's contract failed (let run out) or given up: merit lost (never a rank earned). */
export const GUILD_FAILED = 2;

/**
 * How far from its town (m) everything a guild's contract asks for is: the beasts and soldiers
 * brought down (counted only there), the creatures whose parts it wants (those living within it),
 * the camp broken up, and the place held by outlaws or the dead put to the sword.
 */
export const GUILD_REACH = 1500;

/**
 * How far from its middle a people's soldiers stand and walk (m): a town's guards and patrols (a
 * capital's edge, and its patrols' round past it: war/muster.js), and a camp's sentries. A
 * people's town or camp is within a guild's reach if its middle is this much nearer than that.
 */
export const SOLDIERS_OUT = Object.freeze({ town: 150, camp: 40 });

// The creatures whose parts the guilds want: those found anywhere, not too far out (the first
// three tiers)
const WANTED_FROM = Object.freeze(Object.keys(SPOILS).filter((id) => !CREATURES[id].people && !CREATURES[id].perilous && CREATURES[id].tiers[0] <= 3));

// A creature's parts (spoils.js), by their ids
const partsOf = (id) => SPOILS[id].items.map(({ id: item }) => item).filter((item) => PARTS[item]);

/**
 * What the guilds want brought in (docs/WILDS.md): the parts of the creatures found anywhere, not
 * too far out (the first three tiers), by their ids. Each guild wants those of the creatures that
 * live within its reach.
 */
export const WANTED_PARTS = Object.freeze([...new Set(WANTED_FROM.flatMap(partsOf))]);

// How far apart (m) the land within a guild's reach is looked at
const LAND_STEP = 100;

// A thing's name for more than one ("wolf fangs", "slime jelly", "frog legs")
const many = (label) => (/(s|y|dust|silk|meat|jelly|blood|skin)$/i.test(label) ? label : `${label}s`).toLowerCase();

/**
 * How near (m) a player goes to see what they're scouting, to be there to hold a town (from its
 * middle), to be with an envoy or a convoy, and at a works to win it.
 */
export const REQUEST_REACH = Object.freeze({ scout: 220, defend: 180, rout: 150, escort: 60, convoy: 60, works: 120 });

/** What the keep's gift is worth more than a reeve's (its rewards, times this). */
export const KEEP_REWARD = 1.5;

/** What goes into the treasury (the war's gold) for each gold piece tithed. */
export const TITHE_RATE = 0.25;

/** A request that fails (let run out, or lost): standing lost. */
export const FAILED = 5;

/**
 * The armoury's gift for each rank from a Retainer up, once each: a piece of their people's
 * uniform (`people`), or something for the weapon the player carries (a hero's `weapon`, as
 * progress.js ITEMS knows it): a shield for one that leaves a hand free (`withShield`), else a
 * helm. (Its bonuses are rolled as it's given: core/gear.js rollGear)
 */
export function armouryGift(rank, weapon, withShield, people = "human") {
    switch (rank) {
        case 2:
            return { id: "hauberk", quality: "fine", people };
        case 3:
            return { id: weapon, quality: "masterwork" };
        case 4:
            return withShield ? { id: "shield", quality: "masterwork", people } : { id: "helm", quality: "masterwork", people };
        case 5:
            return { id: weapon, quality: "legendary" };
        default:
            return null;
    }
}

const apart = ([ax, ay], [bx, by]) => hypot(ax - bx, ay - by);

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

    // The keep's convoys seen in with their goods, and an enemy's fallen on; the people's works
    // others hold won back, and an enemy's taken (the works and their goods are what the war's
    // towers and garrisons are built of)
    const convoys = post === "keep" ? war.forces.filter((force) => force.kind === "convoy" && force.cargo && !force.back) : [];
    const ourConvoys = rank >= OPENS.convoy ? convoys.filter((convoy) => war.liege(convoy.realm) === liege && !has("convoy", convoy.id)) : [];
    const theirConvoys = rank >= OPENS.plunder ? convoys.filter((convoy) => war.hostile(liege, war.liege(convoy.realm)) && !has("plunder", convoy.id)) : [];
    const works = post === "keep" ? (war.works ?? []) : [];
    const lost = rank >= OPENS.retake ? works.filter((each) => war.liege(each.race) === liege && (each.held || war.liege(each.owner) !== liege) && !has("retake", each.id)) : [];
    const theirWorks = rank >= OPENS.seize ? works.filter((each) => !each.held && war.hostile(liege, war.liege(each.owner)) && war.liege(each.race) !== liege && !has("seize", each.id)) : [];

    for (const [kind, found] of [["convoy", ourConvoys], ["plunder", theirConvoys], ["retake", lost], ["seize", theirWorks]]) {
        if (found.length) {
            kinds.push(kind);
        }
    }

    if (!kinds.length) {
        return null;
    }

    // (The keep asks the weightier things when it can)
    const weighty = kinds.filter((kind) => ["scout", "defend", "rout", "escort", "waylay", "convoy", "plunder", "retake", "seize", "bounty"].includes(kind));
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
        case "convoy": {
            const convoy = nearestTo(ourConvoys, town.at);
            const [load, amount] = Object.entries(convoy.cargo)[0];
            const to = war.town(convoy.target);

            return {
                ...base,
                key: convoy.id,
                target: { force: convoy.id, realm: convoy.realm, at: [...convoy.at], name: `our convoy of ${load}`, works: convoy.home },
                text: `A convoy of ${Math.round(amount)} ${load} is on the road from ${worksName(war, convoy.home)} to ${to?.name ?? "the seat"}, and there are those who'd have it. Find it, and see it in.`,
                until: null,
                reward: worth(reward.standing, reward.gold),
            };
        }
        case "plunder": {
            const convoy = nearestTo(theirConvoys, town.at);
            const [load] = Object.keys(convoy.cargo);
            const from = war.realm(convoy.realm);

            return {
                ...base,
                key: convoy.id,
                target: { force: convoy.id, realm: convoy.realm, at: [...convoy.at], name: `the convoy of ${from.name}`, works: convoy.home },
                text: `${from.name} have a convoy of ${load} on the road from ${worksName(war, convoy.home)}: their towers and garrisons are built of it. Fall on it, bring its guard down, and its goods are ours.`,
                until: null,
                reward: worth(reward.standing, reward.gold),
            };
        }
        case "retake": {
            const works = nearestTo(lost, town.at);
            const name = worksName(war, works.id);

            return {
                ...base,
                key: works.id,
                target: { works: works.id, at: [...works.at], name: name.replace(/^the /, ""), realm: works.held ? null : works.owner },
                text: works.held
                    ? `Brigands hold ${name}, and nothing comes from it. Put them to the sword, and it's ours again.`
                    : `${war.realm(works.owner).name} hold ${name}, and its goods go to them. Bring its guard down, and win it back for us.`,
                until: war.turn + turns,
                reward: worth(reward.standing, reward.gold),
            };
        }
        case "seize": {
            const works = nearestTo(theirWorks, town.at);
            const name = worksName(war, works.id);

            return {
                ...base,
                key: works.id,
                target: { works: works.id, at: [...works.at], name: name.replace(/^the /, ""), realm: works.owner },
                text: `${name[0].toUpperCase()}${name.slice(1)} keeps ${war.realm(works.owner).name} in ${YIELDED[works.kind] ?? "goods"}. Bring its guard down and it's ours, and its goods with it.`,
                until: war.turn + turns,
                reward: worth(reward.standing, reward.gold),
            };
        }
        default:
            return null;
    }
}

// What each kind of works yields, in words
const YIELDED = Object.freeze({ "lumber mill": "timber", mine: "iron", quarry: "stone" });

// A works, by name: "the Calbury lumber mill"
const worksName = (war, id) => {
    const works = war.workAt?.(id);

    return works ? `the ${works.name} ${works.kind}` : "their works";
};

// The one of `things` (each with its `at`) nearest a point
const nearestTo = (things, at) => things.reduce((best, each) => (apart(each.at, at) < apart(best.at, at) ? each : best));

/**
 * How likely a guild's contract of each kind is to pay a spell's tome besides its gold (from the
 * guild's library: spells.js TOMES, as rare as each is): breaking a camp always, a bounty now and
 * then.
 */
export const GUILD_TOMES = Object.freeze({ camp: 1, hunt: 0.35, clear: 0.5 });

// A tome offered with a contract, in words
const fromTheLibrary = (tome) => `The guild will add the Tome of ${SPELLS[tome].label} from its library.`;

/**
 * A contract from an adventurers' guild's board in a town (docs/WAR.md M8), for anyone of any
 * people (no standing needed, and none given: gold), everything it asks for within GUILD_REACH of
 * the town: beasts off the roads round it; a bounty on the soldiers of a people at war with those
 * who hold it, who have a town or a camp near; creatures' parts, of those found near (as strong as
 * they are there for whoever's asking: as far from their `home`); the camp outside it broken up; a place near held by outlaws or the dead put to the sword, its leader with
 * them (core/places.js). Null if there's nothing on the board they haven't got already.
 * @param {object} options
 * @param {object} options.war - The war (war.js).
 * @param {string} options.town - The town the guild's in (an id).
 * @param {object} options.giver - Who's at the counter: { id, name, title }.
 * @param {number[]} [options.home] - Where whoever's asking starts ([x, y] metres: their people's
 *   start town's middle, the wild tamest near it: creatures.js tierAt); the town's own if not given.
 * @param {object[]} [options.held] - The requests they carry.
 * @param {object[]} [options.also] - What's on the board already (none of it offered twice).
 * @param {number} [options.guildRank] - Their rank in the guilds (GUILD_RANKS): the work it opens,
 *   and how hard it is.
 * @param {object} options.random - Random numbers (random.js).
 */
export function offerContract({ war, town: townId, giver, home = null, held = [], also = [], guildRank = 0, random }) {
    const town = war.town(townId);

    if (!town || held.length >= MOST_REQUESTS) {
        return null;
    }

    const grade = gradeOf(guildRank);
    const opened = (kind) => REQUESTS[kind].rank <= grade.rank;
    const has = (kind, key) => [...held, ...also].some((request) => request.kind === kind && request.key === key);
    const holders = war.liege(town.owner);
    const soldiers = opened("hunt") ? soldiersNear(war, town) : new Map();
    const foes = war.enemiesOf(holders).filter((foe) => soldiers.has(foe) && !has("hunt", foe));
    const camps = opened("camp") ? war.forces.filter((force) => force.kind === "camp" && force.target === town.id && war.hostile(force.realm, town.owner) && apart(force.at, town.at) + SOLDIERS_OUT.camp <= GUILD_REACH && !has("camp", force.id)) : [];
    const wanted = dearest(wantedNear(war, town, home ?? town.at), grade.rank >= GUILD_DEARER).filter((part) => !has("parts", part));
    const occupied = biggest(heldNear(war, town).filter(({ place }) => GUILD_SIZES[place.size] <= grade.rank)).filter(({ place }) => !has("clear", place.id));
    const kinds = [...(has("beasts", town.id) ? [] : ["beasts", "beasts"]), ...(foes.length ? ["hunt"] : []), ...(camps.length ? ["camp", "camp"] : []), ...(wanted.length ? ["parts", "parts"] : []), ...(occupied.length ? ["clear", "clear"] : [])];

    if (!kinds.length) {
        return null;
    }

    const kind = random.pick(kinds);
    const { title, turns, reward } = REQUESTS[kind];
    const base = { kind, title, from: guildOf(town, giver), given: war.turn, state: "open", count: 0 };
    // (Paid as the rank has it, and the contract's merit to the guild)
    const pay = (gold, merit = reward.merit) => ({ standing: 0, gold: Math.round(gold * grade.pay), merit });
    // (How many of the foes or parts asked for: a few, and more for a higher rank)
    const asked = (least) => least + grade.more + random.int(0, 2);
    // (Where the foes brought down count: within the guild's reach of its town)
    const near = { town: town.id, name: town.name, at: [...town.at], reach: GUILD_REACH };
    const within = `within ${GUILD_REACH / 1000} km of ${town.name}`;

    switch (kind) {
        case "beasts": {
            // (Of the level the rank asks for, as near as the land within reach has it)
            const level = grade.level > 1 ? Math.min(grade.level, levelNear(war.plan, town.at, home ?? town.at)) : 1;
            const need = asked(2);
            const strong = level > 1 ? `, level ${level} or more` : "";

            return { ...base, key: town.id, target: { wild: true, need, level, near }, text: `Wanted: someone to see off the beasts on the roads round ${town.name}. ${need} of them${strong}, ${within}, and the carters will breathe again.`, until: war.turn + turns, reward: pay(reward.gold + reward.each.gold * need) };
        }
        case "hunt": {
            const foe = random.pick(foes);
            const need = asked(2);
            const tome = random.chance(GUILD_TOMES.hunt) ? rollTome(random) : null;
            const [nearest] = soldiers.get(foe);
            const where = nearest.camp ? `They have a camp ${wayOf(town, nearest.at)}.` : `They hold ${nearest.name}, ${wayOf(town, nearest.at)}.`;

            return {
                ...base,
                key: foe,
                target: { realm: foe, need, near },
                text: `Bounty, posted for ${war.realm(holders).name}: ${need} of the ${soldiersOf(foe)}, brought down ${within}. ${where}${tome ? ` ${fromTheLibrary(tome)}` : ""}`,
                until: war.turn + turns,
                reward: { ...pay(reward.gold + reward.each.gold * need), ...(tome ? { tome } : {}) },
            };
        }
        case "parts": {
            // (Creatures' parts brought in: a few of the cheapest, fewer of the dearer; paid more
            // than the guild would give for them over the counter)
            const part = random.pick(wanted);
            const { label, worth } = PARTS[part];
            const need = asked(worth <= 4 ? 3 : 2);
            const paid = pay(reward.gold + worth * need * reward.share);

            return { ...base, key: part, target: { part, name: label, need }, text: `Wanted at the guild in ${town.name}: ${need} ${many(label)}, for the makers who use them. What they come off lives round here. ${paid.gold} gold for the lot, brought in.`, until: war.turn + turns, reward: paid };
        }
        case "camp": {
            const camp = random.pick(camps);
            const tome = random.chance(GUILD_TOMES.camp) ? rollTome(random) : null;

            return { ...base, key: camp.id, target: { force: camp.id, realm: camp.realm, at: [...camp.at], town: town.id, name: town.name }, text: `${war.realm(camp.realm).name} have a camp outside ${town.name}, ${wayOf(town, camp.at)}, and the merchants want it gone. Break it up.${tome ? ` ${fromTheLibrary(tome)}` : ""}`, until: war.turn + turns, reward: { ...pay(reward.gold), ...(tome ? { tome } : {}) } };
        }
        case "clear": {
            const { place, holder, tier } = random.pick(occupied);
            const name = place.name ?? `the ${place.kind}`;
            const way = wayOf(town, place.at);
            const tome = random.chance(GUILD_TOMES.clear) ? rollTome(random) : null;
            const text =
                holder === "dead"
                    ? `The dead walk at ${name}, ${way}, and no one will go near it. Lay them to rest, the ${CREATURES[bandOf(place, holder).leader].name.toLowerCase()} that leads them with them.`
                    : `Outlaws hold ${name}, ${way}, and rob all who pass. Put them to the sword, their chief with them.`;

            return {
                ...base,
                key: place.id,
                target: { place: place.id, holder, at: [...place.at], name, kind: place.kind },
                text: `${text}${tome ? ` ${fromTheLibrary(tome)}` : ""}`,
                until: war.turn + turns,
                reward: { ...pay(reward.gold + reward.size[place.size] + reward.tier * tier, reward.merit[place.size]), ...(tome ? { tome } : {}) },
            };
        }
        default:
            return null;
    }
}

/**
 * A guild's courier work (docs/WAR.md M8), offered on its board beside its contract: a sealed
 * package to the guild in another town, on the way to a people the player's aren't friends with
 * (neutral, at war, or not met: war.js relation), so the player sees where they are. The nearest
 * town of such a people is found (a town, city or capital), then the town of the player's own
 * people or their friends (war.js friendly) nearest it, and nearer it than the guild's town is:
 * the package goes there, never into the strangers' own town. Failing one for the nearest, the next
 * nearest such town is tried. Null if there's none, or they carry a package already.
 * @param {object} options
 * @param {object} options.war - The war (war.js).
 * @param {string} options.realm - The player's people (a realm's id).
 * @param {string} options.town - The town the guild's in (an id).
 * @param {object} options.giver - Who's at the counter: { id, name, title }.
 * @param {object[]} [options.held] - The requests they carry.
 * @param {number} [options.guildRank] - Their rank in the guilds (GUILD_RANKS): what it pays.
 */
export function offerCourier({ war, realm, town: townId, giver, held = [], guildRank = 0 }) {
    const town = war.town(townId);
    const to = town && war.realm(realm) && held.length < MOST_REQUESTS && !held.some(({ kind }) => kind === "courier") ? courierTo(war, realm, town) : null;

    if (!to) {
        return null;
    }

    const { title, turns, perKm, reward } = REQUESTS.courier;
    const km = apart(to.town.at, town.at) / 1000;

    return {
        kind: "courier",
        title,
        from: guildOf(town, giver),
        given: war.turn,
        state: "open",
        count: 0,
        key: to.town.id,
        target: { town: to.town.id, name: to.town.name, at: [...to.town.at], post: "guild", towards: to.towards.id },
        text: `The guild in ${to.town.name} wants this package, sealed, by someone who'll get it there: ${wayOf(town, to.town.at)}, on the way to ${war.realm(to.towards.owner).name} at ${to.towards.name}.`,
        until: war.turn + Math.ceil(turns + km * perKm),
        reward: { standing: 0, gold: Math.round((reward.gold + reward.perKm.gold * km) * gradeOf(guildRank).pay), merit: reward.merit },
    };
}

/** How many notices a guild's board has up at once: its contracts, and its courier work. */
export const BOARD_SIZE = 4;

/**
 * What's on a guild's board (docs/WAR.md M8): its contracts (offerContract), and its courier work
 * last (offerCourier), BOARD_SIZE at most, no two asking the same thing (objectiveOf), nor what
 * the player carries already. Empty if there's nothing.
 * @param {object} options - As offerContract's and offerCourier's.
 */
export function offerBoard({ war, realm, town, giver, home = null, held = [], guildRank = 0, random }) {
    const courier = offerCourier({ war, realm, town, giver, held, guildRank });
    const board = [];

    while (board.length < BOARD_SIZE - (courier ? 1 : 0)) {
        const contract = offerContract({ war, town, giver, home, held, also: board, guildRank, random });

        if (!contract) {
            break;
        }

        board.push(contract);
    }

    return courier ? [...board, courier] : board;
}

/** What a request asks, as one string (its kind, and what it's for): no two on a board the same. */
export const objectiveOf = ({ kind, key }) => `${kind}:${key}`;

/**
 * A request in a few words, for the notices on a guild's board: "Beasts round Oakford", "A bounty
 * on orcish soldiers", "3 wolf fangs wanted", "A package for Ashby".
 */
export function briefOf(request) {
    const { kind, target } = request;

    switch (kind) {
        case "beasts":
            return `${target.level > 1 ? `Beasts of level ${target.level}+` : "Beasts"} round ${target.near?.name ?? request.from.townName}`;
        case "hunt":
            return `A bounty on ${soldiersOf(target.realm)}`;
        case "parts":
            return `${target.need} ${many(target.name)} wanted`;
        case "camp":
            return `The camp outside ${target.name}`;
        case "clear":
            return `${target.holder === "dead" ? "The dead" : "Outlaws"} at ${target.name}`;
        case "courier":
            return `A package for ${target.name}`;
        default:
            return request.title;
    }
}

// Where a guild's courier work goes (offerCourier): { town (the player's people's or their
// friends'), towards (the strangers' town it's the way to) }, or null
function courierTo(war, realm, town) {
    const halled = war.towns.filter((each) => HALLED.includes(each.kind));
    const strangers = halled.filter((each) => each.id !== town.id && !war.friendly(realm, each.owner)).sort((a, b) => apart(a.at, town.at) - apart(b.at, town.at));

    for (const towards of strangers) {
        const short = apart(towards.at, town.at);
        const [nearest] = halled
            .filter((each) => each.id !== town.id && war.friendly(realm, each.owner) && apart(each.at, towards.at) < short)
            .sort((a, b) => apart(a.at, towards.at) - apart(b.at, towards.at));

        if (nearest) {
            return { town: nearest, towards };
        }
    }

    return null;
}

// Who a guild's work is from: its receptionist, at its counter in a town
const guildOf = (town, giver) => ({ id: giver.id, name: giver.name, title: giver.title || "Guild receptionist", town: town.id, townName: town.name, post: "guild" });

// A guild rank's row (GUILD_RANKS), and its index (`rank`): Copper's for none or no such rank
const gradeOf = (rank) => {
    const at = Number.isInteger(rank) ? Math.max(0, Math.min(GUILD_RANKS.length - 1, rank)) : 0;

    return { ...GUILD_RANKS[at], rank: at };
};

// The parts a guild wants: from GUILD_DEARER up (`dearer`), only the dearer half of them (those of
// the fiercer creatures, mostly), the dearest first; else all of them
function dearest(parts, dearer) {
    if (!dearer || parts.length < 2) {
        return parts;
    }

    return [...parts].sort((a, b) => PARTS[b].worth - PARTS[a].worth).slice(0, Math.ceil(parts.length / 2));
}

// The places held near a town that a guild gives to clear: the biggest of them (by GUILD_SIZES)
function biggest(occupied) {
    const most = Math.max(...occupied.map(({ place }) => GUILD_SIZES[place.size]));

    return occupied.filter(({ place }) => GUILD_SIZES[place.size] === most);
}

// The level of beasts a guild can ask for near its town (GUILD_RANKS' `level`), for whoever's
// asking: the highest that a quarter of the land within its reach has, or more (creatures.js
// tierAt: as far as it is from their `home`), so there are beasts of it about to be found
function levelNear(plan, [x, y], home) {
    if (!plan) {
        return 1;
    }

    const tiers = [];
    const steps = Math.floor(GUILD_REACH / LAND_STEP);

    for (let j = -steps; j <= steps; j++) {
        for (let i = -steps; i <= steps; i++) {
            if (i * i + j * j <= steps * steps) {
                const at = [x + i * LAND_STEP, y + j * LAND_STEP];

                tiers.push(tierAt(at, [home], landAt(plan, ...at).biome));
            }
        }
    }

    return tiers.sort((a, b) => b - a)[Math.floor(tiers.length / 4)];
}

// Which way a place is from a town, in words: "0.8 km north-east of Oakford"
const wayOf = (town, at) => `${Math.round(apart(at, town.at) / 100) / 10} km ${compass(town.at, at)} of ${town.name}`;

// Where each people's soldiers are within a guild's reach of its town (SOLDIERS_OUT): their towns
// and camps there, by the people they fight for (a liege's id), the nearest first: [{ at, name,
// camp (a camp: true) }]
function soldiersNear(war, town) {
    const found = new Map();
    const add = (realm, at, name, out, camp) => {
        if (apart(at, town.at) + out <= GUILD_REACH) {
            const liege = war.liege(realm);

            found.set(liege, [...(found.get(liege) ?? []), { at, name, camp }].sort((a, b) => apart(a.at, town.at) - apart(b.at, town.at)));
        }
    };

    for (const each of war.towns) {
        if (each.id !== town.id) {
            add(each.owner, each.at, each.name, SOLDIERS_OUT.town, false);
        }
    }

    for (const force of war.forces) {
        if (force.kind === "camp") {
            add(force.realm, force.at, null, SOLDIERS_OUT.camp, true);
        }
    }

    return found;
}

// The parts a guild wants (WANTED_PARTS) of the creatures found within its reach of its town, as
// the wild has them there for whoever's asking (candidatesAt, at the tier the land has that far
// from their `home`: tierAt), by day or by night: none that only the ruins' dead or a perilous
// place's masters are, none that need lands or tiers there aren't near
function wantedNear(war, town, home) {
    if (!war.plan) {
        return [];
    }

    const found = new Set(landsNear(war.plan, town.at, home).flatMap((land) => candidatesAt(land, land.tier, true).map(({ id }) => id)));

    return [...new Set(WANTED_FROM.filter((id) => found.has(id)).flatMap(partsOf))];
}

// The lands within a guild's reach of its town, looked at every LAND_STEP metres: [{ biome, race,
// tier (as far as it is from `home`) }], each once
function landsNear(plan, [x, y], home) {
    const lands = new Map();
    const steps = Math.floor(GUILD_REACH / LAND_STEP);

    for (let j = -steps; j <= steps; j++) {
        for (let i = -steps; i <= steps; i++) {
            if (i * i + j * j <= steps * steps) {
                const at = [x + i * LAND_STEP, y + j * LAND_STEP];
                const { biome, race } = landAt(plan, ...at);
                const tier = tierAt(at, [home], biome);

                lands.set(`${biome}|${race}|${tier}`, { biome, race, tier });
            }
        }
    }

    return [...lands.values()];
}

// The places near a town held by outlaws or the dead (core/places.js), not cleared: { place,
// holder, tier (its land's danger, as from the town: creatures.js tierAt) }
function heldNear(war, town) {
    if (!war.plan?.sites) {
        return [];
    }

    return placesOf(war.plan)
        .filter((place) => apart(place.at, town.at) <= GUILD_REACH)
        .map((place) => ({ place, holder: holderOf(war.plan, place, war.places?.[place.id], war.turn) }))
        .filter(({ place, holder }) => bandOf(place, holder))
        .map(({ place, holder }) => ({ place, holder, tier: tierAt(place.at, [town.at], landAt(war.plan, ...place.at).biome) }));
}

// Which way one place is from another, by the compass (north up the map, as y falls)
function compass([fx, fy], [tx, ty]) {
    const [dx, dy] = [tx - fx, ty - fy];
    const ns = dy < 0 ? "north" : "south";
    const ew = dx > 0 ? "east" : "west";

    if (Math.abs(dx) > 2.414 * Math.abs(dy)) {
        return ew;
    }

    return Math.abs(dy) > 2.414 * Math.abs(dx) ? ns : `${ns}-${ew}`;
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
        return request.kind === "message" || request.kind === "courier" ? { at: target.at, name: target.name } : { at: war?.town(from.town)?.at ?? null, name: from.townName };
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
        return kind === "message" || kind === "courier" ? deliver(target) : `Done: go back to ${request.from.name} in ${request.from.townName}.`;
    }

    switch (kind) {
        case "message":
        case "courier":
            return deliver(target);
        case "tithe":
            return `Bring ${target.gold} gold to ${request.from.name} in ${request.from.townName}.`;
        case "bounty":
        case "wild":
        case "beasts":
        case "hunt":
            return `${count} of ${target.need} brought down${target.near ? ` within ${target.near.reach / 1000} km of ${target.near.name}` : ""}.`;
        case "parts":
            return `Bring ${target.need} ${many(target.name)} to ${request.from.name} in ${request.from.townName}.`;
        case "scout":
            return "Go near enough to see them.";
        case "defend":
            return request.there ? "Hold on until they're gone." : `Get to ${target.name}.`;
        case "rout":
        case "camp":
            return request.there ? "Bring its soldiers down." : `Find the camp outside ${target.name}.`;
        case "clear":
            return target.holder === "dead" ? `Lay the dead of ${target.name} to rest, and the one that leads them.` : `Put the outlaws at ${target.name} to the sword, and their chief.`;
        case "escort":
            return request.there ? "Stay with them to the end of the road." : "Find them on the road.";
        case "waylay":
            return "Find them on the road, and stop them.";
        case "convoy":
            return request.there ? "Stay with it to the end of the road." : "Find it on the road.";
        case "plunder":
            return "Find it on the road, and bring its guard down.";
        case "retake":
        case "seize":
            return request.there ? "Bring down whoever holds it." : `Get to the ${target.name}.`;
        default:
            return "";
    }
}

// Where a letter or a package is to be taken, in words
const deliver = ({ post, name }) => `Take it to ${post === "keep" ? "the steward" : post === "guild" ? "the guild" : "the reeve"} in ${name}.`;

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

/**
 * The guilds' merit a request earns done: a guild's contract's (its reward's `merit`; one given
 * before they had any, its kind's, the smallest place's for a place cleared), none for a people's.
 */
export function meritIn(request) {
    if (request?.from?.post !== "guild") {
        return 0;
    }

    if (Number.isFinite(request.reward?.merit)) {
        return request.reward.merit;
    }

    const merit = REQUESTS[request.kind]?.reward.merit;

    return Number.isFinite(merit) ? merit : (merit?.small ?? 0);
}

/**
 * The merit of the guilds' contracts among those done (`done`: requests as kept), for a card the
 * guilds gave before they kept merit (Standing's `guild`: host.js join).
 */
export function meritOf(done) {
    return done.filter(({ state }) => state === "done").reduce((sum, request) => sum + meritIn(request), 0);
}

/**
 * A player's standing: their points, their rank from them, the requests they carry, and those
 * done; and their card from the adventurers' guilds, its merit and rank (one card, good at every
 * branch: GUILD_RANKS).
 */
export class Standing {
    /**
     * @param {object} [kept] - As kept (toJSON): { points, claimed, requests, done, next, guild
     *   (null till they register at a guild: { merit }) }.
     */
    constructor({ points = 0, claimed = [], requests = [], done = [], next = 1, guild = null } = {}) {
        this.points = Math.max(0, Number.isFinite(points) ? points : 0);

        /** Their guild card: null till they register; { merit } after. */
        this.guild = guild && typeof guild === "object" ? { merit: Math.max(0, Number.isFinite(guild.merit) ? Math.round(guild.merit) : 0) } : null;

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

    /** Sign up at a guild (once: the card's good at every branch). Returns whether it's new. */
    register() {
        if (this.guild) {
            return false;
        }

        this.guild = { merit: 0 };

        return true;
    }

    /** Their rank in the guilds (an index into GUILD_RANKS), or null if they've not registered. */
    guildRank() {
        return this.guild ? GUILD_RANKS.findLastIndex(({ merit }) => this.guild.merit >= merit) : null;
    }

    /** Their guild rank's title ("Copper"...), or null if they've not registered. */
    guildTitle() {
        const rank = this.guildRank();

        return rank === null ? null : GUILD_RANKS[rank].title;
    }

    /** How far to the next guild rank: { merit, from, to } (to: null at the top); null if they've not registered. */
    guildNext() {
        const rank = this.guildRank();

        return rank === null ? null : { merit: this.guild.merit, from: GUILD_RANKS[rank].merit, to: GUILD_RANKS[rank + 1]?.merit ?? null };
    }

    /**
     * Gain (or lose) the guilds' merit: lost, never below the rank they have (a rank earned is
     * kept). Returns the guild ranks newly reached: [{ rank, title }] (none if they've not
     * registered).
     */
    earn(amount) {
        const before = this.guildRank();

        if (before === null || !Number.isFinite(amount)) {
            return [];
        }

        this.guild.merit = Math.max(GUILD_RANKS[before].merit, Math.round(this.guild.merit + amount));

        const reached = [];

        for (let rank = before + 1; rank <= this.guildRank(); rank++) {
            reached.push({ rank, title: GUILD_RANKS[rank].title });
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
        return { points: this.points, claimed: [...this.claimed], requests: structuredClone(this.requests), done: structuredClone(this.done), next: this.next, guild: this.guild ? { ...this.guild } : null };
    }
}
