// The war told in words (docs/WAR.md): what each of its events (war.js) says, as the news of it
// would go round. The war viewer lists them, and the taverns and folk will tell them (M8).

import { RACES } from "../worldplan/races.js";
import { STAGES } from "./war.js";

const MISSIONS = Object.freeze({ truce: "a truce", alliance: "an alliance", break: "an end to their alliance" });

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
    const town = (id) => war.town(id)?.name ?? war.plan.places.find((place) => place.id === id)?.name ?? "a town";
    const target = (id) => war.town(id)?.name ?? "their camp";

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
            return `The ${own(event.realm)} envoy to ${people(event.to)} was waylaid on the road by ${people(event.by)}.`;
        case "marched":
            return `${People(event.realm)} march on ${town(event.target)}, ${event.size} strong.`;
        case "camped":
            return `${People(event.realm)} have made camp outside ${town(event.target)}.`;
        case "reinforced":
            return `More of ${people(event.realm)} join the camp outside ${town(event.target)}.`;
        case "raid":
            return `Raiders of ${people(event.realm)} struck at ${town(event.town)}'s fields${event.killed ? `, killing ${event.killed} of its guard` : ""}.`;
        case "assault":
            return event.won ? `${People(event.realm)} stormed ${town(event.town)}.` : `${People(event.realm)} stormed ${town(event.town)}, and were thrown back.`;
        case "taken":
            return `${town(event.town)} has fallen to ${people(event.to)}. Its folk live under their rule now.`;
        case "subjugated":
            return `The ${own(event.realm)} seat has fallen. They bend the knee to ${people(event.by)}.`;
        case "fallen":
            return `${People(event.realm)} hold no town any more.`;
        case "rebelled":
            return `${People(event.realm)} have risen against ${people(event.from)}!`;
        case "sally":
            return event.won ? `The guard of ${town(event.town)} sallied out and broke the ${own(event.against)} camp.` : `The guard of ${town(event.town)} sallied out against the ${own(event.against)} camp, and was driven back.`;
        case "relief":
            return `${People(event.realm)} send ${event.size} to relieve ${town(event.town)}.`;
        case "battle":
            return event.won ? `${People(event.realm)} fell upon the ${own(event.against)} camp and scattered it.` : `${People(event.realm)} fell upon the ${own(event.against)} camp, and were beaten off.`;
        case "broken":
            return `The ${own(event.realm)} camp outside ${town(event.target)} has broken up.`;
        case "withdrew":
            return `${People(event.realm)} have turned back from ${target(event.target)}.`;
        case "unpaid":
            return `${People(event.realm)} can't pay their soldiers, and some are leaving.`;
        case "victory":
            return `Every people bows to ${people(event.realm)}. The continent is theirs.`;
        case "undone":
            return `${People(event.realm)} no longer rule the whole continent.`;
        default:
            return event.type;
    }
}
