// War missions (docs/WAR.md *War missions*): the war brought to a player who's near it. When
// something's happening within MISSION_REACH of them (an enemy camp, a convoy or supply wagons on
// the road, reinforcements marching, works to take or win back, their own works or town under
// threat, their people's reserve or army out against an enemy, an enemy's tower), a messenger
// comes from whoever would want it done (their people's ruler, the lord of their nearest town, or
// the general of the army there) and offers it. Taken, it's theirs till it's done, failed or
// comes to nothing, and it's paid on the spot: gold, standing with their people, and their pick
// of three pieces from their people's armoury, all of it more the higher their rank.
//
// No page and no host here: what's near (missionsNear), what a mission is (missionOf), what it
// pays (rewardOf, gearChoices), and how it stands (checkMission), from the war (war/war.js) as it
// is, so it's tested without a world (test/missions.test.js). core/host.js sends the messengers,
// keeps each player's missions (core/standing.js Standing `missions`), briefs them at an army and
// pays them; app/game.js shows it all.

import { hypot } from "./exact.js";
import { rollGear } from "./gear.js";
import { dueAt, hadChance, ON_THE_ROAD, onTheRoad, untilOf } from "./hurry.js";
import { namePeople } from "./names.js";
import { ITEMS } from "./progress.js";
import { createRandom } from "./random.js";
import { REINFORCE } from "./war/armies.js";
import { ADJECTIVES } from "./war/peoples.js";
import { SUPPLY } from "./war/supply.js";

/** How near something must be (metres) for a messenger to come about it. */
export const MISSION_REACH = 2000;

/** How long between messengers to a player or their party (war turns: a minute's play each). */
export const MESSENGER_EVERY = 10;

/** The most war missions a player carries at once. */
export const MOST_MISSIONS = 2;

/** How many done, failed and come-to-nothing missions are kept (the journal's last few). */
export const KEEP_MISSIONS = 8;

/** What a mission accepted and then failed or given up costs (standing with their people). */
export const MISSION_FAILED = 5;

/** How much more each rank above Commoner pays (of what a Commoner's paid). */
export const RANK_PAY = 0.3;

/** The armoury's make for each rank (core/progress.js QUALITIES); a harder mission's one better. */
export const RANK_QUALITY = Object.freeze(["fine", "fine", "masterwork", "rare", "veryRare", "legendary"]);
const QUALITY_LADDER = Object.freeze(["common", "fine", "masterwork", "rare", "veryRare", "legendary"]);

/** How near (metres) a player must come to each kind of thing for a mission's to count them there. */
export const THERE = Object.freeze({ camp: 150, force: 150, works: 150, town: 120, fort: 150 });

/**
 * Reinforcements fewer than this many war turns' march from their army (core/war/armies.js
 * REINFORCE: its speed, a turn's), where they join it, aren't offered to cut off: they'd be with
 * it before a messenger had found the player (a turn or so) and they'd got there (another).
 */
export const INTERCEPT_TURNS = 2;

/** How near (metres) a player comes to a friendly army or reserve before its commander briefs them. */
export const BRIEFING_REACH = 80;

/** The commander's own objective, done besides: this much more gold and standing. */
export const BONUS = 0.4;

/**
 * The missions: each kind's title, who sends it (`from`: "ruler", "lord" or "general"), what it
 * pays a Commoner (gold and standing), how hard it is (`hard`: its gear a make better from 2), how
 * long there is (war turns, from when it's taken on, the way there besides: chanceOf; null: as
 * long as what it's about lasts), whether that's only to get there in (`stay`: once there, it
 * lasts as long as what it's about, the player standing with their own till it's over), and
 * whether its commander briefs the player when they come (`briefing`).
 */
export const MISSIONS = Object.freeze({
    rout: { title: "Break the camp", from: "ruler", gold: 120, standing: 60, hard: 1, turns: 40 },
    plunder: { title: "Fall on their convoy", from: "ruler", gold: 110, standing: 55, hard: 1, turns: null },
    wagons: { title: "Raid their supply wagons", from: "ruler", gold: 80, standing: 40, hard: 0, turns: null },
    intercept: { title: "Cut off their reinforcements", from: "ruler", gold: 110, standing: 55, hard: 1, turns: null },
    seize: { title: "Take their works", from: "ruler", gold: 150, standing: 75, hard: 2, turns: 40 },
    tower: { title: "Bring down their tower", from: "ruler", gold: 140, standing: 70, hard: 2, turns: 40 },
    retake: { title: "Win back the works", from: "lord", gold: 130, standing: 65, hard: 1, turns: 40 },
    guard: { title: "Guard our works", from: "lord", gold: 110, standing: 55, hard: 1, turns: 30, stay: true },
    convoy: { title: "See our convoy in", from: "lord", gold: 90, standing: 45, hard: 0, turns: null },
    defend: { title: "Hold the town", from: "lord", gold: 120, standing: 60, hard: 1, turns: null },
    reserve: { title: "Stand with the reserve", from: "general", gold: 140, standing: 70, hard: 1, turns: 30, stay: true, briefing: true },
    attack: { title: "March with the army", from: "general", gold: 160, standing: 80, hard: 2, turns: 40, stay: true, briefing: true },
});

// How far short of its road's end each kind of thing on it is done (metres): where reinforcements
// join their army, and supply wagons are at theirs
const SHORT = Object.freeze({ reinforcement: REINFORCE.join, supply: SUPPLY.reach });

const apart = ([ax, ay], [bx, by]) => hypot(ax - bx, ay - by);
const peopleOf = (realm) => ADJECTIVES[realm] ?? realm;

// A number from a string, for names and gear that are the same each time they're asked for
const hashOf = (text, seed = 1) => [...text].reduce((hash, character) => (Math.imul(hash, 31) + character.charCodeAt(0)) | 0, seed) >>> 0;

// What an army's after (its `target`: a town, a works, a camp, a depot or a fort), and what kind
// of thing it is; or null
function objectiveOf(war, id) {
    if (!id) {
        return null;
    }

    const town = war.town(id);

    if (town) {
        return { kind: "town", thing: town, name: town.name, realm: town.owner };
    }

    const works = war.workAt?.(id);

    if (works) {
        return { kind: "works", thing: works, name: `the ${works.name} ${works.kind}`, realm: works.owner };
    }

    const camp = war.camp(id);

    if (camp) {
        return { kind: "camp", thing: camp, name: `the ${peopleOf(camp.realm)} camp`, realm: camp.realm };
    }

    const fort = war.fort?.(id);

    if (fort) {
        return { kind: "fort", thing: fort, name: fortName(fort), realm: fort.realm };
    }

    const depot = (war.depots ?? []).find((each) => each.id === id);

    return depot ? { kind: "depot", thing: depot, name: `the ${peopleOf(depot.realm)} supply depot`, realm: depot.realm } : null;
}

// A fort, in words: "the orcish guard tower"
const fortName = (fort) => `the ${peopleOf(fort.realm)} ${fort.kind === "tower" ? "guard tower" : fort.kind === "garrison" ? "forward garrison" : (fort.kind ?? "fort")}`;

// A works, in words: "the Calbury lumber mill"
const worksName = (works) => `the ${works.name} ${works.kind}`;

/**
 * What a player might be sent to do near `at` ([x, y] metres): each thing of the war within
 * `within` (MISSION_REACH) a mission could be about, for the player's people (`realm`, through
 * whoever they serve: war.liege), the nearest first, those they carry already (`held`, by kind
 * and key) left out. Each { kind, key, at, target }: `target` as the mission keeps it.
 */
export function missionsNear({ war, realm, at, within = MISSION_REACH, held = [] }) {
    if (!war || !at || !war.realm(realm)?.alive) {
        return [];
    }

    const liege = war.liege(realm);
    const hostile = (other) => Boolean(other) && war.hostile(liege, war.liege(other));
    const ours = (other) => Boolean(other) && war.liege(other) === liege;
    const near = (point) => Boolean(point) && apart(point, at) <= within;
    const found = [];
    const add = (kind, key, point, target) => {
        if (near(point) && !held.some((mission) => mission.kind === kind && mission.key === key)) {
            found.push({ kind, key, at: [...point], target });
        }
    };
    const forces = war.forces ?? [];
    // (What's on the road, only if they could meet it before it's at its end: core/hurry.js)
    const meets = (force) => onTheRoad(at, force, war.turn, { short: SHORT[force.kind] ?? 0 }).met;
    // (How far reinforcements have still to march before they join their army: none, theirs gone)
    const marchLeft = (column) => {
        const army = war.force(column.target);

        return army ? apart(column.at, army.at) - REINFORCE.join : 0;
    };

    // An enemy's camp; and, one before a town of theirs, the town held
    for (const camp of war.camps ?? []) {
        if (hostile(camp.realm)) {
            add("rout", camp.id, camp.at, { force: camp.id, realm: camp.realm, at: [...camp.at], town: camp.toward ?? null, name: `the ${peopleOf(camp.realm)} camp` });

            const town = camp.toward ? war.town(camp.toward) : null;

            if (town && ours(town.owner)) {
                add("defend", town.id, town.at, { town: town.id, name: town.name, at: [...town.at], camp: camp.id, realm: camp.realm });
            }
        }
    }

    for (const force of forces) {
        if (!(force.size > 0) && force.kind !== "envoy") {
            continue;
        }

        if (ON_THE_ROAD[force.kind] && !meets(force)) {
            continue;
        }

        if (force.kind === "convoy" && force.cargo && !force.back) {
            const [load] = Object.keys(force.cargo);

            if (hostile(force.realm)) {
                add("plunder", force.id, force.at, { force: force.id, realm: force.realm, at: [...force.at], name: `the ${peopleOf(force.realm)} convoy of ${load}`, works: force.home });
            } else if (ours(force.realm) && forces.some((other) => other.kind === "army" && hostile(other.realm) && apart(other.at, force.at) <= within)) {
                add("convoy", force.id, force.at, { force: force.id, realm: force.realm, at: [...force.at], name: `our convoy of ${load}`, works: force.home });
            }
        } else if (force.kind === "supply" && hostile(force.realm)) {
            add("wagons", force.id, force.at, { force: force.id, realm: force.realm, at: [...force.at], name: `the ${peopleOf(force.realm)} supply wagons`, army: force.target });
        } else if (force.kind === "reinforcement" && hostile(force.realm) && marchLeft(force) > INTERCEPT_TURNS * REINFORCE.speed) {
            add("intercept", force.id, force.at, { force: force.id, realm: force.realm, at: [...force.at], name: `the ${peopleOf(force.realm)} reinforcements`, to: force.target, size: force.size });
        } else if (force.kind === "reserve" && ours(force.realm) && force.mission === "defend") {
            const against = war.force(force.target);

            if (against?.kind === "army" && hostile(against.realm)) {
                add("reserve", force.id, force.at, { force: force.id, realm: force.realm, at: [...force.at], against: against.id, enemy: against.realm, name: "our reserve" });
            }
        } else if (force.kind === "army" && ours(force.realm) && (force.mission === "attack" || (force.mission === "camp" && force.target))) {
            const objective = objectiveOf(war, force.target);

            if (objective && hostile(objective.realm)) {
                add("attack", force.id, near(force.at) ? force.at : objective.thing.at, { force: force.id, realm: force.realm, at: [...force.at], objective: force.target, objectiveKind: objective.kind, objectiveName: objective.name, enemy: objective.realm, name: "our army" });
            }
        }
    }

    // Works: an enemy's taken; their own won back; their own, an enemy army after it, guarded
    for (const works of war.works ?? []) {
        if (!works.held && hostile(works.owner) && !ours(works.race)) {
            add("seize", works.id, works.at, { works: works.id, realm: works.owner, at: [...works.at], name: worksName(works) });
        } else if (ours(works.race) && (works.held || hostile(works.owner))) {
            add("retake", works.id, works.at, { works: works.id, realm: works.owner, at: [...works.at], name: worksName(works) });
        } else if (ours(works.owner) && !works.held) {
            const threat = forces.find((force) => force.kind === "army" && force.size > 0 && hostile(force.realm) && (force.target === works.id || apart(force.at, works.at) <= THERE.works * 4));

            if (threat) {
                add("guard", works.id, works.at, { works: works.id, realm: works.owner, at: [...works.at], name: worksName(works), threat: threat.id, enemy: threat.realm });
            }
        }
    }

    // An enemy's guard tower or forward garrison
    for (const fort of war.forts ?? []) {
        if (hostile(fort.realm)) {
            add("tower", fort.id, fort.at, { fort: fort.id, realm: fort.realm, at: [...fort.at], name: fortName(fort), fortKind: fort.kind });
        }
    }

    return found.sort((a, b) => apart(a.at, at) - apart(b.at, at) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/**
 * Who sends a mission (`kind`, about `target`): their people's ruler; the lord of their people's
 * town nearest it; or the general (or, of a reserve, the captain) of the force it's with. Each
 * { kind, name, title, of, at }: named the same each time they're asked for.
 */
export function senderOf(war, realm, kind, target) {
    const liege = war.liege(realm);
    const ruler = war.realm(liege);
    const from = MISSIONS[kind]?.from ?? "ruler";
    const race = liege;
    const named = (key, sex = "m") => namePeople([{ sex }], hashOf(key) % 0x7fffffff || 1, race)[0].name;

    if (from === "general" && target.force) {
        const force = war.force(target.force);
        const reserve = kind === "reserve";

        return { kind: "general", name: named(`general:${target.force}`), title: reserve ? "Captain" : "General", of: reserve ? `the reserve of ${ruler?.name ?? "our people"}` : `the army of ${ruler?.name ?? "our people"}`, at: force ? [...force.at] : [...target.at] };
    }

    if (from === "lord") {
        const town = (war.towns ?? []).filter((each) => war.liege(each.owner) === liege).sort((a, b) => apart(a.at, target.at) - apart(b.at, target.at))[0];

        if (town) {
            return { kind: "lord", name: named(`lord:${town.id}`), title: "Lord", of: town.name, at: [...town.at] };
        }
    }

    const seat = ruler ? war.town(ruler.seat) : null;

    return { kind: "ruler", name: ruler?.leader?.name ?? "our ruler", title: ruler?.leader?.title ?? "", of: ruler?.name ?? "", at: seat ? [...seat.at] : [...target.at] };
}

/** A sender as they're named: "King Aldric of the Westmarch", "General Bryn", "Lord Edric of Calbury". */
export function senderName(from) {
    const name = [from.title, from.name].filter(Boolean).join(" ");

    return from.kind === "general" ? `${name} of ${from.of}` : from.of ? `${name} of ${from.of}` : name;
}

/**
 * What a mission pays a player of `rank` (core/standing.js STANDINGS: 0, a Commoner, up), done:
 * { gold, standing, quality }: a Commoner's a good deal already (gold, standing and a fine piece
 * of gear at the least), and each rank above that RANK_PAY more of it, and a better make
 * (RANK_QUALITY, a hard mission's a make better). With the commander's own objective done
 * besides (`bonus`), BONUS more gold and standing.
 */
export function rewardOf(kind, rank = 0, { bonus = false } = {}) {
    const def = MISSIONS[kind];

    if (!def) {
        return null;
    }

    const at = Math.max(0, Math.min(RANK_QUALITY.length - 1, Math.floor(rank) || 0));
    const times = (1 + RANK_PAY * at) * (bonus ? 1 + BONUS : 1);
    const make = RANK_QUALITY[at];
    const better = def.hard >= 2 ? 1 : 0;
    const quality = QUALITY_LADDER[Math.min(QUALITY_LADDER.length - 1, QUALITY_LADDER.indexOf(make) + better)];

    return { gold: Math.round(def.gold * times), standing: Math.round(def.standing * times), quality };
}

/**
 * A mission (`kind`, about `target`, at `key`), as it's offered to a player of `rank` on the war's
 * turn: its title, what's asked in the sender's words, who sends it (`from`: senderOf), how long
 * there is (`until`: a war turn, or null), what it pays (rewardOf), and the word that the higher
 * their rank, the more it pays.
 */
export function missionOf({ war, realm, kind, key, target, rank = 0 }) {
    const def = MISSIONS[kind];

    if (!def) {
        return null;
    }

    const from = senderOf(war, realm, kind, target);
    const reward = rewardOf(kind, rank);
    const enemy = target.enemy ?? target.realm;
    const them = enemy && war.realm(enemy) ? war.realm(enemy).name : "the enemy";

    return {
        kind,
        key,
        title: def.title,
        text: missionText(war, kind, target, them).replace(/^./, (first) => first.toUpperCase()),
        from,
        target: structuredClone(target),
        given: war.turn,
        until: def.turns === null ? null : war.turn + def.turns,
        rank,
        reward,
        ...(def.briefing ? { briefing: null } : {}),
        there: false,
        state: "offered",
    };
}

// What's asked, in the sender's words
/**
 * A mission (as missionOf made it) as it's taken on by a player at `at` ([x, y] metres) now (docs/
 * WAR.md *A fair chance*): its time from now, with time to finish what they were at when the
 * messenger found them and the way there besides (`until`: core/hurry.js untilOf; null: as long
 * as what it's about lasts); and the turn they'd have had their chance by (`due`: the way there,
 * to a town to hold, a camp to break or works to guard; to something on the road, the turn they'd
 * meet it, or, as they'd never meet it, it's at its end; none, of what's theirs to do once they're
 * there). `met`: whether they could meet what's on the road before its end (or there's none).
 */
export function chanceOf(war, mission, at) {
    const def = MISSIONS[mission.kind];
    const { target } = mission;
    const force = target.force ? war.force(target.force) : null;
    const until = !def || def.turns === null ? null : untilOf(war.turn, def.turns, at, target.at);

    if (force && ON_THE_ROAD[force.kind]) {
        return { until, ...onTheRoad(at, force, war.turn, { short: SHORT[force.kind] ?? 0 }) };
    }

    const kept = mission.kind === "defend" || mission.kind === "rout" || mission.kind === "guard";

    return { until, ...(kept ? { due: dueAt(at, target.at, war.turn) } : {}), met: true };
}

function missionText(war, kind, target, them) {
    switch (kind) {
        case "rout":
            return `${them} have a camp near${target.town && war.town(target.town) ? ` ${war.town(target.town).name}` : " here"}. Break it: bring its soldiers down until it's too few to hold.`;
        case "plunder":
            return `${target.name.replace(/^the /, "A ")} is on the road near you: their towers and garrisons are built of it. Fall on it, bring its guard down, and its goods are ours.`;
        case "wagons":
            return `${them}'s army is fed by wagons on the road near you. Fall on them before they get there, and their soldiers go hungry.`;
        case "intercept":
            return `${them} are sending ${target.size ? `${target.size} fresh soldiers` : "fresh soldiers"} to their army, and they're on the road near you. Cut them off before they join it.`;
        case "seize":
            return `${target.name.charAt(0).toUpperCase()}${target.name.slice(1)} is ${them}'s, and it's near you. Take it: bring down its guard, and its yield is ours.`;
        case "tower":
            return `${target.name.charAt(0).toUpperCase()}${target.name.slice(1)} shields their lands from us. Bring it down, and nothing stands between us and them.`;
        case "retake":
            return `${target.name.charAt(0).toUpperCase()}${target.name.slice(1)} is ours, and it's been taken from us. Win it back.`;
        case "guard":
            return `${them}'s army is after ${target.name}. Get there, stand with its guards, and see it's still ours when they've gone.`;
        case "convoy":
            return `${target.name.charAt(0).toUpperCase()}${target.name.slice(1)} is on the road near you, and ${them} would have it. Find it, and see it in.`;
        case "defend":
            return `${them} have camped within a march of ${target.name}. Get there, and help hold it until they're gone.`;
        case "reserve":
            return `Our reserve is out against ${them}'s army, near you. Join it: I'll tell you what's wanted when you get there.`;
        case "attack":
            return `Our army is marching on ${target.objectiveName}. Join us: I'll tell you what's wanted when you get there.`;
        default:
            return "";
    }
}

/** A mission's reward in words: "120 gold, 60 standing and your pick from the armoury (fine)". */
export function rewardWords(reward) {
    const make = reward.quality === "veryRare" ? "very rare" : reward.quality;

    return `${reward.gold} gold, ${reward.standing} standing and your pick of three pieces from the armoury (${make})`;
}

/** Said with every offer: the higher the player's rank, the more it pays. */
export const MORE_BY_RANK = "The higher your rank with us, the more we give.";

/**
 * Three pieces of gear for a mission's reward, for the player to pick one of: something for the
 * weapon they carry (`weapon`, as core/progress.js ITEMS knows it), a piece of armour (for a slot
 * of their own, of the kind they wear there: `worn`, { slot: piece }), and a ring or an amulet;
 * of `quality`, for their `level` (core/gear.js rollGear), in their people's make (`people`), the
 * same each time for the same `seed`.
 */
export function gearChoices({ weapon, worn = {}, quality = "fine", level = 1, people = null, seed = 1 }) {
    const random = createRandom(seed >>> 0 || 1);
    const armed = ITEMS[weapon]?.slot === "mainHand" ? weapon : "sword";
    const slot = random.pick(ARMOUR_SLOTS);
    const wearing = worn?.[slot]?.id;
    const armour = wearing && ITEMS[wearing]?.slot === slot ? wearing : ARMOUR_BY_SLOT[slot];
    const trinket = random.pick(["ring", "amulet"]);

    return [armed, armour, trinket].map((id) => rollGear(id, quality, random, { people, level }));
}

// The armour a mission's reward might be (a slot, and its piece if the player wears none there)
const ARMOUR_SLOTS = Object.freeze(["chest", "head", "legs", "boots", "gloves", "bracers"]);
const ARMOUR_BY_SLOT = Object.freeze({ chest: "mail", head: "helm", legs: "greaves", boots: "boots", gloves: "gloves", bracers: "bracers" });

/**
 * How a mission stands now: "ready" (done: to be paid), "failed", "void" (come to nothing: what
 * it was about gone some other way, with the player not there), or null (as it was). On the way,
 * whether the player's been there (`there`, set on the mission, and its `target.at` kept up with
 * what it's about as that moves). `near(point, reach)`: whether the player's within `reach`
 * metres of a point; `townAt(town)`: a town's middle and its radius.
 */
export function checkMission(mission, { war, realm, near, townAt = (town) => ({ middle: town.at, radius: 0 }) }) {
    const liege = war.liege(realm);
    const { target } = mission;
    const been = (point, reach) => {
        if (!mission.there && near(point, reach)) {
            mission.there = true;
        }
    };
    const after = (event) => event.turn === undefined || event.turn >= mission.given;
    const log = war.log ?? [];
    const near400 = (point) => Boolean(point && target.at) && apart(point, target.at) <= 400;
    // (Lost or got away before they could have got there: come to nothing; once they could have,
    // failed: core/hurry.js hadChance. And against a people no longer at war with theirs, or gone:
    // come to nothing)
    const lost = () => (hadChance(mission, war.turn) ? "failed" : "void");
    const atWar = (other) => Boolean(war.realm(other)?.alive) && war.hostile(liege, other);

    // (Its time run out; one to stand with their own in, only while they're not there yet)
    if (mission.until !== null && mission.until !== undefined && war.turn > mission.until && !(MISSIONS[mission.kind]?.stay && mission.there)) {
        return "failed";
    }

    switch (mission.kind) {
        case "rout": {
            const camp = war.camp(target.force);

            if (camp) {
                been(camp.at, THERE.camp);

                return atWar(target.realm) ? null : "void";
            }

            return target.town && war.town(target.town)?.owner === target.realm ? lost() : mission.there ? "ready" : "void";
        }
        case "defend": {
            const town = war.town(target.town);

            if (!town || war.liege(town.owner) !== liege) {
                return lost();
            }

            const { middle, radius } = townAt(town);

            been(middle, radius + THERE.town);

            return war.camp(target.camp) && atWar(target.realm) ? null : mission.there ? "ready" : "void";
        }
        case "plunder":
        case "convoy": {
            const convoy = war.force(target.force);

            if (convoy && !convoy.back) {
                target.at = [...convoy.at];
                been(convoy.at, THERE.force);

                return mission.kind === "plunder" && !atWar(target.realm) ? "void" : null;
            }

            // (Come to a seat its people had lost, its goods taken there, as no one on the road
            // could have stopped: come to nothing)
            const end = log.findLast(({ force, type, beaten }) => force === target.force && (type === "delivered" || type === "plundered" || (type === "ambushed" && !beaten)));

            if (mission.kind === "convoy") {
                return end?.type === "delivered" ? (mission.there ? "ready" : "void") : end?.type === "ambushed" ? lost() : "void";
            }

            return end?.type === "ambushed" && end.played && end.by && war.liege(end.by) === liege ? (mission.there ? "ready" : "void") : end?.type === "delivered" ? lost() : "void";
        }
        case "wagons": {
            const wagons = war.force(target.force);

            if (wagons) {
                target.at = [...wagons.at];
                been(wagons.at, THERE.force);

                return atWar(target.realm) ? null : "void";
            }

            const taken = log.findLast((event) => event.type === "wagonLost" && event.realm === target.realm && after(event) && near400(event.at));

            if (taken) {
                return taken.by && war.liege(taken.by) === liege && mission.there ? "ready" : "void";
            }

            // (At their army or depot, its load theirs: got through. Else theirs gone, the wagons
            // with it: come to nothing)
            const through = log.findLast((event) => after(event) && ((event.type === "supplied" && event.army === target.army) || (event.type === "provisioned" && event.depot === target.army)));

            return through ? lost() : "void";
        }
        case "intercept": {
            // (Taken into another column for the same army on the way, before or since it was
            // taken on: followed into that one, the soldiers marching on in it: core/war/war.js
            // "banded")
            for (let hops = 0; hops < 8 && !war.force(target.force); hops++) {
                const banded = log.findLast((event) => event.type === "banded" && event.from === target.force);

                if (!banded) {
                    break;
                }

                target.force = banded.into;
            }

            const column = war.force(target.force);

            if (column) {
                target.at = [...column.at];
                been(column.at, THERE.force);

                return atWar(target.realm) ? null : "void";
            }

            const cut = log.findLast((event) => event.type === "intercepted" && event.realm === target.realm && after(event) && near400(event.at));

            if (cut) {
                return cut.by && war.liege(cut.by) === liege && mission.there ? "ready" : "void";
            }

            // (Gone, and not cut off: its army gone too, beaten or disbanded, it went home, come to
            // nothing; else it got through to it)
            return target.to && !war.force(target.to) ? "void" : lost();
        }
        case "seize":
        case "retake": {
            const works = war.workAt(target.works);

            if (!works) {
                return "void";
            }

            been(works.at, THERE.works);

            const won = log.findLast((event) => event.works === works.id && event.played && after(event) && (event.type === "seized" || event.type === "cleared"));

            if (won && war.liege(won.type === "seized" ? won.to : won.by) === liege) {
                return mission.there ? "ready" : "void";
            }

            if (!works.held && (war.liege(works.owner) === liege || !atWar(works.owner))) {
                return "void";
            }

            return mission.kind === "seize" && (works.held || works.owner !== target.realm) ? "void" : null;
        }
        case "guard": {
            const works = war.workAt(target.works);

            if (!works || works.held || war.liege(works.owner) !== liege) {
                return works ? lost() : "void";
            }

            been(works.at, THERE.works);

            const threat = war.force(target.threat);
            const still = threat && threat.size > 0 && atWar(threat.realm) && (threat.target === works.id || apart(threat.at, works.at) <= THERE.works * 4);

            return still ? null : mission.there ? "ready" : "void";
        }
        case "tower": {
            const fort = war.fort?.(target.fort);

            if (fort) {
                been(fort.at, THERE.fort);

                return atWar(fort.realm) ? null : "void";
            }

            const end = log.findLast((event) => event.fort === target.fort && (event.type === "razed" || event.type === "abandoned"));

            return end?.type === "razed" && end.by && war.liege(end.by) === liege && mission.there ? "ready" : "void";
        }
        case "reserve": {
            const reserve = war.force(target.force);
            const enemy = war.force(target.against);

            if (reserve) {
                target.at = [...reserve.at];
                been(reserve.at, THERE.force);
            }

            if (enemy && enemy.size > 0) {
                // (Theirs from a people no longer at war with ours: come to nothing)
                if (!atWar(enemy.realm)) {
                    return "void";
                }

                // (Ours beaten, or gone off after something else)
                if (!reserve || !(reserve.size > 0)) {
                    return mission.there ? "failed" : "void";
                }

                return reserve.mission === "defend" && reserve.target === enemy.id ? null : "void";
            }

            // (Their army gone: beaten, or turned back)
            return mission.there && reserve && reserve.size > 0 ? "ready" : mission.there ? "failed" : "void";
        }
        case "attack": {
            const army = war.force(target.force);
            const objective = objectiveOf(war, target.objective);
            const won = !objective || (objective.kind !== "camp" && objective.kind !== "fort" && objective.kind !== "depot" && war.liege(objective.realm) === liege);

            if (army) {
                target.at = [...army.at];
                been(army.at, THERE.force);
            }

            if (won) {
                return mission.there ? "ready" : "void";
            }

            // (What it was after held by a people no longer at war with ours: come to nothing)
            if (!atWar(objective.realm)) {
                return "void";
            }

            // (Ours beaten, with them there: failed. Turned back from it, beaten, the same; sent
            // off after something else by its rulers, it's come to nothing)
            if (!army || !(army.size > 0)) {
                return mission.there ? "failed" : "void";
            }

            if (army.target !== target.objective) {
                const fell = log.some((event) => event.type === "fellBack" && event.army === army.id && after(event));

                return fell && mission.there ? "failed" : "void";
            }

            return null;
        }
        default:
            return null;
    }
}

/**
 * What a commander tells a player who's come to join them (a mission with a `briefing`): what
 * they face (`enemy`: { realm, size, commander, engines }), and the player's part: a flank or the
 * centre to hold, their standard-bearer to bring down, or their archers to keep the enemy off,
 * chosen by `seed`; with the commander's own objective, worth BONUS more besides. { lines, part,
 * bonus }: what's said, line by line, and what's asked, in the journal's words.
 */
export function briefingOf({ mission, enemy = {}, ours = {}, seed = 1 }) {
    const random = createRandom(seed >>> 0 || 1);
    const them = enemy.realm ? peopleOf(enemy.realm) : "enemy";
    const count = (n) => (Number.isFinite(n) && n > 0 ? `${Math.round(n)}` : "a good many");
    const part = random.pick(["left", "right", "centre", "archers"]);
    const bonus = random.pick(["standard", "commander"]);
    const asked = part === "archers" ? "Stand with our archers and keep their soldiers off them" : `Hold our ${part === "centre" ? "centre" : `${part} flank`}`;
    const extra = bonus === "standard" ? "bring down their standard-bearer" : `bring down their commander${enemy.commander ? `, ${enemy.commander}` : ""}`;
    const what = mission.kind === "reserve" ? `${count(enemy.size)} ${them} soldiers are coming at us${enemy.commander ? `, under ${enemy.commander}` : ""}.` : `${mission.target.objectiveName ? `${mission.target.objectiveName.charAt(0).toUpperCase()}${mission.target.objectiveName.slice(1)} is held by` : "We face"} ${count(enemy.size)} ${them} soldiers${enemy.commander ? ` under ${enemy.commander}` : ""}.`;
    const lines = [
        `Good, you came. ${what}`,
        `We're ${count(ours.size)} strong${enemy.engines ? `, and they've ${enemy.engines} siege engine${enemy.engines === 1 ? "" : "s"}: keep clear of their stones` : ""}.`,
        `Your part: ${asked.charAt(0).toLowerCase()}${asked.slice(1)}. Stay with it till it's over.`,
        `And if you can, ${extra}: there's more in it for you if you do.`,
    ];

    return { lines, part, bonus, asked, extra };
}
