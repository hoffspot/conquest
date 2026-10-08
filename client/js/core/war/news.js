// The war told in words (docs/WAR.md): what each of its events (war.js) says, as the news of it
// would go round. The war viewer lists them, and the taverns and folk will tell them (M8).

import { RACES } from "../worldplan/races.js";
import { describeLeader } from "./peoples.js";
import { STAGES } from "./war.js";
import { hypot } from "../exact.js";

const MISSIONS = Object.freeze({ truce: "a truce", alliance: "an alliance", break: "an end to their alliance" });

// What the wild camps' brigands who fall on a convoy are called (worldplan/races.js FACTIONS)
const FACTION_NAMES = Object.freeze({ bandits: "outlaws", raiders: "raiders", goblins: "goblins" });

/** What each kind of fortification is called (core/war/forts.js FORTS). */
export const FORT_NAMES = Object.freeze({ tower: "guard tower", garrison: "forward garrison" });

/** A people's name (the Humans...). */
export const peopleOf = (id) => RACES.find((race) => race.id === id)?.name ?? id;

/**
 * What an event (war.js) says, in words: "The Orcs have declared war on the Humans." `war` is the
 * war it happened in (for the names of its towns and realms).
 */
export function tell(event, war) {
    const people = (id) => `the ${peopleOf(id)}`;
    const People = (id) => `The ${peopleOf(id)}`;
    const own = (id) => (peopleOf(id).endsWith("s") ? `${peopleOf(id)}'` : `${peopleOf(id)}'s`);
    const town = (id) => war.town(id)?.name ?? (war.workAt?.(id) ? works(id) : null) ?? war.plan.places.find((place) => place.id === id)?.name ?? "a town";
    const target = (id) => war.town(id)?.name ?? (war.workAt?.(id) ? works(id) : null) ?? "their camp";
    // (A people's works: "the Oakstead lumber mill")
    const works = (id) => {
        const found = war.workAt?.(id);

        return found ? `the ${found.name} ${found.kind}` : "a works";
    };
    const Works = (id) => works(id).replace(/^t/, "T");
    // (Where a fortification stands: before a town, or by a works)
    const where = ({ about }) => (war.workAt?.(about) ? `by ${works(about)}` : war.town(about) ? `before ${war.town(about).name}` : "on the border");
    const cargo = (load) =>
        Object.entries(load ?? {})
            .map(([resource, amount]) => `${Math.round(amount)} ${resource}`)
            .join(" and ");
    const brigands = (faction) => FACTION_NAMES[faction] ?? "brigands";
    // (Whatever an army goes against: a town, a works, a fortification or a camp)
    const thing = (id) => {
        const fort = war.fort?.(id);
        const camp = war.camp?.(id);

        if (fort) {
            return `the ${own(fort.realm)} ${FORT_NAMES[fort.kind] ?? fort.kind} ${where(fort)}`;
        }

        return camp ? `the ${own(camp.realm)} camp${war.town(camp.toward) ? ` before ${war.town(camp.toward).name}` : ""}` : town(id);
    };

    switch (event.type) {
        case "stage":
            return `The war enters a new age: ${STAGES[event.stage].name.toLowerCase()}.`;
        case "met":
            return `${People(event.a)} and ${people(event.b)} have come upon each other.`;
        case "declared":
            return `${People(event.by)} have declared war on ${people(event.on)}.`;
        case "joined":
            return `${People(event.by)} take up arms against ${people(event.on)}, for their allies ${people(event.for)}.`;
        case "broke":
            return `${People(event.by)} have broken off their alliance with ${people(event.with)}.`;
        case "envoy":
            return event.about ? `${People(event.from)} send an envoy to ${people(event.to)}, asking ${MISSIONS[event.mission]} with ${people(event.about)}.` : `${People(event.from)} send an envoy to ${people(event.to)}, seeking ${MISSIONS[event.mission]}.`;
        case "treaty":
            if (event.mission === "break") {
                return event.accepted ? `${People(event.to)} have heeded ${people(event.from)}, and turned from their alliance with ${people(event.about)}.` : `${People(event.to)} sent the ${own(event.from)} envoy away.`;
            }

            return event.accepted ? `${People(event.from)} and ${people(event.to)} have made ${MISSIONS[event.mission]}.` : `${People(event.to)} would not hear of ${MISSIONS[event.mission]} with ${people(event.from)}.`;
        case "waylaid":
            return `The ${own(event.realm)} envoy to ${people(event.to)} was waylaid on the road${event.by ? ` by ${people(event.by)}` : ""}.`;
        case "raised":
            return `${People(event.realm)} have raised an army at their seat.`;
        case "disbanded":
            return `${People(event.realm)} have stood their army down, and sent its soldiers home.`;
        case "marched":
            return event.mission === "retake" ? `${People(event.realm)} march to win back ${works(event.target)} from the brigands holding it, ${event.size} strong.` : `The ${own(event.realm)} army marches on ${thing(event.target)}, ${event.size} strong.`;
        case "camped":
            return event.target ? `${People(event.realm)} have made camp within a march of ${thing(event.target)}.` : `${People(event.realm)} have made camp in the field.`;
        case "skirmish":
            return `Skirmishers out of the ${own(event.realm)} camp fell on ${thing(event.target)}${event.killed ? `, and brought ${event.killed === 1 ? "one" : event.killed} of ${people(event.against)} down` : ""}.`;
        case "assault":
            return event.won ? `The ${own(event.realm)} army put the last of ${town(event.town)}'s defenders to the sword.` : `The ${own(event.realm)} army fell on ${town(event.town)}'s defenders, ${event.killed} of them killed, ${event.lost} of its own lost.`;
        case "taken":
            return `${town(event.town)} has fallen to ${people(event.to)}, its garrison put to the sword. Its folk live under their rule now.`;
        case "fellBack":
            return `The ${own(event.realm)} army has fallen back from ${thing(event.from)}, to be made up again.`;
        case "destroyed":
            return `The ${own(event.realm)} army has been put to the sword to the last.`;
        case "intercepted":
            return `Soldiers on their way to join the ${own(event.realm)} army were cut down on the road by ${people(event.by)}.`;
        case "crushed":
            return `${People(event.realm)} rose in ${town(event.town)}, and ${people(event.from)} put the rising down.`;
        case "ordered":
            return `The ${own(event.realm)} army has its orders.`;
        case "struck":
            return `${People(event.realm)} have struck one of their camps.`;
        case "subjugated":
            return `The ${own(event.realm)} seat has fallen. They bend the knee to ${people(event.by)}.`;
        case "fallen":
            return `${People(event.realm)} hold no town any more.`;
        case "rebelled":
            return `${People(event.realm)} have risen against ${people(event.against ?? event.from)}!`;
        case "restless":
            return `${People(event.realm)} are restless under ${people(event.against)}. There's talk of rising.`;
        case "risen":
            return `${People(event.realm)} have risen in ${town(event.town)}, and thrown out ${people(event.from)}!`;
        case "battle":
            if (event.works) {
                return !event.against ? (event.won ? `${People(event.realm)} fell upon the brigands at ${works(event.works)} and put them to the sword.` : `${People(event.realm)} fell upon the brigands at ${works(event.works)}, and were beaten off.`) : event.won ? `${People(event.realm)} fell upon ${works(event.works)} and took it from ${people(event.against)}.` : `${People(event.realm)} fell upon ${works(event.works)}, and its guard beat them off.`;
            }

            if (event.camp) {
                return event.won ? `The ${own(event.realm)} army fell upon the ${own(event.against)} camp and put its guard to the sword.` : `The ${own(event.realm)} army fell upon the ${own(event.against)} camp, and were beaten off.`;
            }

            return `The ${own(event.realm)} army met the ${own(event.against)} ${event.kind === "reserve" ? "reserve" : "army"} in the field, ${event.killed} of them killed and ${event.lost} of its own lost, and ${event.won ? "drove them off" : "was driven off"}.`;
        case "withdrew":
            return `${People(event.realm)} have turned back from ${target(event.target)}.`;
        case "unpaid":
            return `${People(event.realm)} can't pay their soldiers, and some are leaving.`;
        case "victory":
            return `Every people bows to ${people(event.realm)}. The continent is theirs.`;
        case "built":
            return `${People(event.realm)} have raised a ${FORT_NAMES[event.kind] ?? event.kind} ${where(event)}.`;
        case "razed":
            if (event.camp) {
                return `${event.by ? People(event.by) : "Their enemies"} have razed the ${own(event.realm)} camp${war.town(event.toward) ? ` before ${war.town(event.toward).name}` : ""}.`;
            }

            return `${event.by ? People(event.by) : "Their enemies"} have razed the ${own(event.realm)} ${FORT_NAMES[event.kind] ?? event.kind} ${where(event)}.`;
        case "assailed":
            return `An assault team of ${people(event.by)} has fallen on the ${own(event.realm)} ${FORT_NAMES[event.kind] ?? event.kind} ${where(event)}.`;
        case "abandoned":
            return event.camp ? `The ${own(event.realm)} camp has been given up.` : `The ${own(event.realm)} ${FORT_NAMES[event.kind] ?? event.kind} ${where(event)} has been given up, unkept.`;
        case "counsel":
            if (event.build) {
                return `${People(event.realm)} are counselled where to build.`;
            }

            return event.march ? `${People(event.realm)} are counselled to march on ${town(event.march)}.` : event.peace ? `${People(event.realm)} are counselled to seek peace with ${people(event.peace)}.` : `${People(event.realm)} are counselled to war with ${people(event.war)}.`;
        case "undone":
            return `${People(event.realm)} no longer rule the whole continent.`;
        case "delivered":
            return `A convoy of ${cargo(event.cargo)} from ${works(event.works)} has reached the ${own(event.realm)} seat.`;
        case "plundered":
            return `The ${own(event.realm)} convoy from ${works(event.works)} came to its seat to find it in ${event.by ? `${people(event.by)}'` : "other"} hands, and lost its goods.`;
        case "ambushed":
            if (event.beaten) {
                return `The ${own(event.realm)} convoy from ${works(event.works)} beat off ${event.by ? people(event.by) : brigands(event.faction)} on the road.`;
            }

            return `The ${own(event.realm)} convoy from ${works(event.works)} was fallen on by ${event.by ? people(event.by) : brigands(event.faction)}, and its goods carried off.`;
        case "seized":
            return `${People(event.to)} have seized ${works(event.works)} from ${people(event.from)}.`;
        case "overrun":
            return `Brigands have overrun ${works(event.works)}. Nothing comes out of it for ${people(event.owner)} now.`;
        case "retaken":
            return `${People(event.realm)} have won ${works(event.works)} back from the brigands.`;
        case "cleared":
            return `${Works(event.works)} has been cleared of the brigands holding it${event.owner !== event.by ? `, and is ${own(event.owner)} again` : `, and ${people(event.by)} hold it now`}.`;
        default:
            return event.type;
    }
}

// What's heard of wherever it happened (the rest only near it): the war's turns, and what
// happens between rulers
const EVERYWHERE = new Set(["stage", "declared", "joined", "broke", "treaty", "subjugated", "fallen", "rebelled", "restless", "risen", "victory", "undone"]);

// What isn't talked of in the taverns
const UNTOLD = new Set(["met", "counsel", "unpaid", "envoy", "delivered", "assailed", "ordered", "struck", "skirmish", "intercepted"]);

/**
 * The war's news as it's heard at `at` ([x, y] metres: a town's), newest first (docs/WAR.md M8):
 * what's happened within `reach` metres of it, and what's heard everywhere, told in words, no
 * two the same; `count` of them at most.
 */
export function rumoursAt(war, at, { count = 3, reach = 5000 } = {}) {
    const heard = [];
    const near = (id, there) => {
        const place = war.town(id) ?? war.workAt?.(id) ?? war.fort?.(id) ?? war.camp?.(id) ?? (there ? { at: there } : null);

        return Boolean(place) && hypot(place.at[0] - at[0], place.at[1] - at[1]) <= reach;
    };

    for (let k = war.log.length - 1; k >= 0 && heard.length < count; k--) {
        const event = war.log[k];

        if (UNTOLD.has(event.type) || !(EVERYWHERE.has(event.type) || near(event.town ?? event.works ?? event.target ?? event.about ?? event.from, event.at))) {
            continue;
        }

        const words = tell(event, war);

        if (!heard.includes(words)) {
            heard.push(words);
        }
    }

    return heard;
}

/**
 * What's said of a ruler (a realm's leader: their marked traits), as it's said in a tavern: "They
 * say the Warchief Gorgash of the Orcs is spoiling for a fight." Null if there's nothing marked.
 */
export function rumourOfRuler(war, realmId) {
    const realm = war.realm(realmId);
    const [first] = realm ? describeLeader(realm.leader, realm.id) : [];

    return first ? `They say ${realm.leader.title} ${realm.leader.name} of the ${peopleOf(realm.id)} is ${first.saying}.` : null;
}

