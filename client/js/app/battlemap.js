// The battle map on the war table in each keep (docs/WAR.md *The war table*; core/wartable.js):
// the war as a people's council sees it, laid out on the world map for a player to read (main.js
// openWorldMap's `war`), drawn again as it goes on.
// - Their own and their friends' (war.js friendly: their liege, vassals and allies) towns,
//   armies, reserves, reinforcements, supply wagons, convoys, envoys, camps, depots and
//   fortifications, always, as they are now;
// - everyone else's only where they see now (war.js sight: round their camps' scouts, armies,
//   reserves, depots and towns), and their towns where the player's uncovered the map too, how
//   strong they're held only if they're seen;
// - what they see, to be shown lit.
//
// Pure: worked out from the war, so it can be drawn again from the war as it goes on, and orders
// given from the same map.

import { HOLDINGS } from "../core/war/war.js";
import { FORTS } from "../core/war/forts.js";
import { DEPOT } from "../core/war/supply.js";
import { ADJECTIVES, COLOURS } from "../core/war/peoples.js";
import { FORT_NAMES, peopleOf } from "../core/war/news.js";

// A people's adjective, as a sentence's first word: "Orcish", "Dark elven"
const Adjective = (id) => {
    const adjective = ADJECTIVES[id] ?? id;

    return `${adjective[0].toUpperCase()}${adjective.slice(1)}`;
};

// What a town is, in words: "capital", "city", "town", "village"
const KINDS = Object.freeze({ capital: "capital", city: "city", town: "town", village: "village" });

// What something in the war is called, by its id: a town's name, "the Iron Hill mine", "the Orcish
// camp", "the Human army"; or null
function nameOf(war, id) {
    const town = war.town(id);

    if (town) {
        return town.name;
    }

    const works = war.workAt(id);

    if (works) {
        return `the ${works.name} ${works.kind}`;
    }

    const camp = war.camp(id);

    if (camp) {
        return `the ${Adjective(camp.realm)} camp`;
    }

    const depot = war.depot(id);

    if (depot) {
        return `the ${Adjective(depot.realm)} supply depot`;
    }

    const fort = war.fort(id);

    if (fort) {
        return `the ${Adjective(fort.realm)} ${FORT_NAMES[fort.kind]}`;
    }

    const force = war.force(id);

    return force ? `the ${Adjective(force.realm)} ${force.kind}` : null;
}

// What an army or a reserve is about, in words: "attacking Grimhold", "at Calbury"
function doing(war, force) {
    const target = nameOf(war, force.target) ?? "the enemy";
    const home = war.town(force.home)?.name ?? "home";
    const there = force.leg >= force.path.length - 1;

    if (force.kind === "reserve") {
        return { defend: `going out against ${target}`, back: `coming back to ${home}` }[force.mission] ?? `at ${home}`;
    }

    return (
        {
            muster: `mustering at ${home}`,
            camp: force.target ? `going to camp within a march of ${target}` : there ? "at its camp" : "on its way to its camp",
            attack: `attacking ${target}`,
            regroup: "falling back to its camp to be made up",
            home: there ? `at ${home}` : `going home to ${home}`,
        }[force.mission] ?? "in the field"
    );
}

// What one of the forces is, in words, as the battle map tells it when it's tapped
function forceText(war, force, own, full) {
    const whose = own ? "Our" : `The ${Adjective(force.realm)}`;
    const their = own ? "our" : "their";

    switch (force.kind) {
        case "army": {
            const missed = own ? (force.supply?.missed ?? 0) : 0;
            const supply = missed ? ` Its supplies haven't got through ${missed === 1 ? "once" : `${missed} times running`}.` : "";

            return `${whose} army, ${force.size} strong${own ? ` of ${full}` : ""}: ${doing(war, force)}.${supply}`;
        }

        case "reserve":
            return `${whose} reserve, ${force.size} strong${own ? ` of ${full}` : ""}: ${doing(war, force)}.`;
        case "reinforcement":
            return `${own ? "Reinforcements" : `${Adjective(force.realm)} reinforcements`}, ${force.size} strong, on their way to join ${their} ${war.force(force.target)?.kind ?? "army"}.`;
        case "supply":
            return `${own ? "Our" : `${/^[aeiou]/i.test(ADJECTIVES[force.realm] ?? "") ? "An" : "A"} ${Adjective(force.realm)}`} supply wagon, ${force.size} guarding it, taking a load to ${their} ${force.mission === "depot" ? "depot" : "army"}.`;
        case "convoy": {
            const carrying = Object.entries(force.cargo ?? {}).map(([resource, amount]) => `${Math.floor(amount)} ${resource}`);

            return `${whose} convoy, ${force.size} guarding it${force.back || !carrying.length ? ", going back for more" : `, carrying ${carrying.join(" and ")} to ${nameOf(war, force.target) ?? "their seat"}`}.`;
        }

        case "envoy":
            return `${whose} envoy, on their way to the ${peopleOf(force.target)}.`;
        default:
            return `${whose} ${force.size}, going to win back ${nameOf(war, force.target) ?? "their works"}.`;
    }
}

/**
 * What the battle map shows a player of `realmId`'s people (`explored`: where they've uncovered,
 * core/explored.js), or null for a people that isn't. Everything's at x, z (metres), with its
 * people's `realm` and `colour`, whether it's `own` (theirs) or `ours` (theirs or a friend's),
 * whether it's `seen` now, and what's `told` of it when it's tapped:
 * - `sight`: what they see ([{ kind ("scout", "army", "reserve", "depot", "town"), x, z, reach }]);
 * - `towns`: [{ id, name, kind, seat, garrison (null if it can't be seen) }];
 * - `forces`: [{ id, kind ("army", "reserve", "reinforcement", "supply", "convoy", "envoy",
 *   "expedition"), size, way (an army's, reserve's or reinforcements' of theirs: where they're
 *   going, [[x, z], ...]) }];
 * - `camps`, `depots`: [{ id, up (whether it's up), guard (null if it can't be seen) }];
 * - `forts`: [{ id, kind, hp, maxHp }];
 * - `army`, `reserve`: what's told of their own, or null (none raised); and `said`: both, to head
 *   the map.
 */
export function battleMapView(war, realmId, { explored = null } = {}) {
    if (!war.realm(realmId)) {
        return null;
    }

    const sight = war.sight(realmId);
    const ours = (id) => war.friendly(realmId, id);
    const seen = (at) => war.sees(realmId, at, 0, sight);
    const uncovered = ([x, y]) => Boolean(explored?.visitedAt(x, y));
    const full = war.fullOf(realmId);
    const base = (id, realm, [x, z]) => ({ id, realm, colour: COLOURS[realm] ?? "#d8d0c0", x, z, own: realm === realmId, ours: ours(realm), seen: ours(realm) || seen([x, z]) });

    const towns = war.towns
        .filter((town) => ours(town.owner) || seen(town.at) || uncovered(town.at))
        .map((town) => {
            const shown = base(town.id, town.owner, town.at);
            const seat = war.realm(town.owner)?.seat === town.id;
            const what = `${shown.own ? "our" : `the ${Adjective(town.owner)}`} ${seat ? "seat" : KINDS[town.kind]}`;
            const guard = shown.seen ? `: ${town.garrison} of ${HOLDINGS[town.kind].garrison} on guard.` : `. How strongly it's held, we can't see from here.`;

            return { ...shown, name: town.name, kind: town.kind, seat, garrison: shown.seen ? town.garrison : null, told: `${town.name}, ${what}${guard}` };
        });

    const forces = war.forces
        .filter((force) => force.size > 0 || force.kind === "envoy")
        .map((force) => ({ force, shown: base(force.id, force.realm, force.at) }))
        .filter(({ shown }) => shown.seen)
        .map(({ force, shown }) => ({
            ...shown,
            kind: force.kind,
            size: force.size,
            way: shown.own && ["army", "reserve", "reinforcement"].includes(force.kind) ? [force.at, ...force.path.slice(force.leg + 1)].map(([x, z]) => [x, z]) : null,
            told: forceText(war, force, shown.own, full),
        }));

    const held = (list, name) =>
        list
            .map((each) => ({ each, shown: base(each.id, each.realm, each.at) }))
            .filter(({ shown }) => shown.seen)
            .map(({ each, shown }) => {
                const up = each.built !== null;
                const whose = shown.own ? "Our" : `The ${Adjective(each.realm)}`;
                const loads = name === "supply depot" && shown.own ? `, ${each.level} of ${DEPOT.most} loads in it` : "";

                return { ...shown, up, guard: each.guard, told: `${whose} ${name}${up ? "" : ", going up"}: ${each.guard} holding it${loads}.` };
            });

    const forts = war.forts
        .map((fort) => ({ fort, shown: base(fort.id, fort.realm, fort.at) }))
        .filter(({ shown }) => shown.seen)
        .map(({ fort, shown }) => {
            const maxHp = FORTS[fort.kind].hp;
            const by = nameOf(war, fort.about);

            return { ...shown, kind: fort.kind, hp: fort.hp, maxHp, told: `${shown.own ? "Our" : `The ${Adjective(fort.realm)}`} ${FORT_NAMES[fort.kind]}${by ? ` by ${by}` : ""}: ${Math.round(fort.hp)} of ${maxHp} standing.` };
        });

    const army = war.armyOf(realmId);
    const reserve = war.reserveOf(realmId);
    const armyText = army ? forceText(war, army, true, full) : null;
    const reserveText = reserve ? (reserve.size > 0 ? forceText(war, reserve, true, full) : `Our reserve is being made up at ${war.town(reserve.home)?.name ?? "home"}.`) : null;

    return {
        realm: realmId,
        colour: COLOURS[realmId],
        sight: sight.map(({ kind, at: [x, z], reach }) => ({ kind, x, z, reach })),
        towns,
        forces,
        camps: held(war.camps, "camp"),
        depots: held(war.depots, "supply depot"),
        forts,
        army: armyText,
        reserve: reserveText,
        said: [armyText ?? "We have no army raised.", reserveText].filter(Boolean).join(" "),
    };
}
