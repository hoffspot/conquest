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

import { AFFLICTIONS, curedWith } from "./afflictions.js";
import { Battle, FOE_MS, FOLLOW, KINDS, TALK_REACH } from "./battle.js";
import { cacheBand, cacheClear, cacheCount, CACHES, cacheTier, elitePrize, openAround, rollCache, roundOf, startsOf } from "./caches.js";
import { DAY, dayOf, elapsedOf, HOUR, SUNDOWN, untilTime, untilWaking } from "./daytime.js";
import { CHAMPIONS, DELVES, foeKey, hoardTier, rollCoffer, rollHoard } from "./dungeons/play.js";
import { isEmote } from "./emotes.js";
import { Explored } from "./explored.js";
import { nearestFree, squareKey, squaresOf } from "./grid.js";
import { offHandFits, SHIELD_ARMS } from "./gear.js";
import { carriesTorch, lighting, skyLight, torchesLit } from "./light.js";
import { ABILITIES, alike, ARMOR_CAP, buys, ITEMS, priceOf, Progress, QUALITIES, rollLoot, SHOPS, wares, weaponOf } from "./progress.js";
import { dailyStock, madeOf, shopPrice, stockKey, wareKey } from "./stock.js";
import { SCHOOLS, SPELL_XP, SPELLS, tomeOf } from "./spells.js";
import { DOCTRINES, placeAt, placesOf as linePlaces, ROLES, rolesOf } from "./formation.js";
import { createRandom } from "./random.js";
import { SETTLEMENT_KINDS } from "./setpieces/town.js";
import { CAMP_FOLK, campFolk, clearOfSettlements, CREATURES, eliteName, eliteOf, eliteRound, ELITES, encounterAt, LAIRS, memberOf, menaces, outByDay, packOf, tierAt, TIERS, tierPower, traitsOf, WILD } from "./creatures.js";
import { barracksPosts, clearOfWaysIn, heldWithin, townOf } from "./insides.js";
import { bandFolk, bandOf, CHEST_GOLD, holderOf, PLACE_BANDS, placesOf } from "./places.js";
import { atPortal, branchesFound, branchOf, fareOf, outOf, portalOn } from "./portals.js";
import { atWarTable, mayRead, warTableOn } from "./wartable.js";
import { rollSpoils } from "./spoils.js";
import { campTier, CHUNK, guilds, landAt, RACE, startFor, WORLD_SIZE } from "./worldplan/plan.js";
import { armouryGift, COUNSEL, FAILED, GUILD_FAILED, meritIn, meritOf, MOST_REQUESTS, objectiveOf, offerBoard, offerRequest, OPENS, REQUEST_REACH, Standing, TITHE_RATE } from "./standing.js";
import { bannersOf, braziersOf, campOf, CAMP, PATROL_SIZE, POSTED, postsOf, QUARTERED, roundsOf } from "./war/muster.js";
import { brokenOf, SIDES, STOCKADE, walkwayOf } from "./war/stockade.js";
import { ARMY, CAMP as ARMY_CAMP } from "./war/armies.js";
import { ADJECTIVES } from "./war/peoples.js";
import { CONVOY, HOLDINGS, RISING, SQUAD_NAMES, SQUADS, STAGES, War, WORKED } from "./war/war.js";
import { countOut, errandsOf, TOWNSFOLK_REACH, townsfolkOf, wardErrandsOf } from "./townsfolk.js";
import { distanceBetween, longestReach, WEAPONS } from "./weapons.js";
import { dropTiles } from "./navigation.js";
import { FORTS, footprintOf } from "./war/forts.js";
import { atan2, cos, hypot, sin } from "./exact.js";

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
 * How long the orc keeps away (battle ms) once the town's soldiers have felled it, rather than a
 * player or anyone at their side (it's back sooner for them: battle.js KINDS).
 */
export const ORC_ROUTED_MS = 600000;

/**
 * When a town's soldiers come to life (docs/WAR.md M2): once a player's this near its edge
 * (metres, out in the world); let go once every player's this far.
 */
export const MUSTER = Object.freeze({ near: 120, far: 250 });

/** How far from its post (or a patrol from its round) a guard goes after an enemy (metres). */
export const LEASH = 14;

/**
 * How long after one of a town's soldiers is taken away another of its garrison takes their
 * place (battle ms), if it still has them: out where no player sees them come.
 */
export const RELIEF_MS = 60000;

/**
 * A people's works near a player (docs/WAR.md *The works*): its guards come out once a player's
 * this near it (metres), and are let go once every player's this far; as many as its guard has,
 * the first `posted` at its posts, the rest walking its round (setpieces/works.js); or, held by
 * brigands, as many of them as hold it, `most` at most, their leader `lead` tiers above them.
 */
export const WORKS_OUT = Object.freeze({ near: 120, far: 250, posted: 4, most: 8, lead: 2 });

/**
 * When a camp comes to life (docs/WAR.md M6): once a player's this near it (metres, out in the
 * world); struck once every player's this far. Its scout walks a round `scout` metres out from its
 * fire, by `rounds` points (docs/WAR.md *The armies near a player*).
 */
export const CAMP_NEAR = Object.freeze({ near: 150, far: 300, scout: 40, rounds: 8 });

/**
 * A pair of a camp's skirmishers out in the world near a player (docs/WAR.md *The armies near a
 * player*), after what the war's sent them against: out of their camp's if it's pitched, else
 * setting off `from` metres from what they're after, on their camp's side; making for it at a run
 * (`pace` metres a second), `ahead` metres at a time; fighting it once they're `close` to any of
 * it, for `fight` ms; back to their camp then, or once it's gone, or after `most` ms; let go once
 * they're back (within `home` metres of its fire) or every player's `far` from them.
 */
export const SKIRMISH_NEAR = Object.freeze({ from: 120, pace: 2.3, ahead: 16, close: 25, fight: 30000, most: 240000, home: 6, far: 300 });

/**
 * A seat's ruler and the captain of its guard in the world (docs/WAR.md *The armies near a
 * player*; war.js LEADERS): out at its keep's door once its garrison's put down there, each `hp`
 * strong (a soldier's are 40), `apart` metres either side of it; let go back in once every
 * player's `far` from them, or its garrison's made up again (the war doesn't, while they're out:
 * war.js #muster).
 */
export const LEADERS_NEAR = Object.freeze({ hp: 120, apart: 1.5, far: 300 });

// How far either side of a supply depot's fire its stores are stacked (metres)
const DEPOT_STORES = 2.6;

/**
 * An envoy on the road near a player (docs/WAR.md M7): met once a player's this near (metres),
 * let go once every player's this far; how many ride with them as their escort; how far ahead
 * along their road they make for at a time, and how near a point on it counts as passing it.
 */
export const ENVOY = Object.freeze({ near: 150, far: 300, escort: 2, ahead: 24, past: 6 });

/**
 * A works' convoy on the road near a player (docs/WAR.md *Convoys*): met once a player's this
 * near (metres), let go once every player's this far. Its captain goes ahead, its wagons in a
 * column behind them `apart` metres apart, its guards beside the wagons, `beside` metres off the
 * road; all at the wagons' pace (`pace`, metres a second); making for a mark `ahead` metres on along
 * its road at a time, a point on it passed once they're `past` metres from it. Beaten (every guard
 * down), its goods carried off, a share of what they're worth in gold for each player there (`worth`
 * of each of its goods); its wagons stand where they were left.
 */
export const CONVOY_NEAR = Object.freeze({ near: 150, far: 300, apart: 5, beside: 2.5, pace: 1.1, ahead: 24, past: 6, worth: 0.3 });

/**
 * An army's supply wagon on its way near a player (docs/WAR.md *Supply*): met once a player's this
 * near (metres), let go once every player's this far (or it's there). Its ox and wagon go at a
 * convoy's pace (CONVOY_NEAR.pace), making for its army (or depot) where it is now, `ahead` metres
 * at a time, its guards beside it; taken once they're all down, `worth` gold for each player there.
 */
export const WAGON_NEAR = Object.freeze({ near: 150, far: 300, ahead: 16, worth: 8 });

/**
 * A people's army or reserve out in the field near a player (docs/WAR.md *The armies near a
 * player*, M20; not one mustering at its seat, nor a reserve at home: they're within its walls):
 * met once a player's this near (metres), or once it's within `fight` of an enemy's that's met, and
 * let go once every player's this far. Up to `most` of it stood up, one for each of it, in its line
 * of battle (core/formation.js), marching where the war has it going at `pace` metres a second, a
 * point on its way passed once it's `past` metres from it; turned on an enemy's met within `fight`,
 * marching on it till their fronts are `close`, then closing with it as a line does.
 */
export const ARMY_NEAR = Object.freeze({ near: 300, far: 450, fight: 140, close: 20, most: 80, pace: 1.4, past: 8 });

/**
 * A storm near a player (docs/WAR.md *A storm near a player*): an army's camp held and stormed in
 * the world. Its army, met at it, mans its stockade once an enemy's force met is within
 * ARMY_NEAR.fight of it, or a player at odds with it within `near` metres, and stands down `calm`
 * ms after the last of them; an enemy's force met within `near` metres of it storms it.
 * - Those holding it stand at its gates and breaches, each opening's share of them the more the
 *   nearer it is to their foes (as 1 / (`spread` + metres)³): its shield line and two-handers in
 *   ranks across it, the first just within its wall and the rest `depth` metres behind, going no
 *   further than `hold` metres after anyone outside it (any within it, as far as it takes); its
 *   archers and casters up on its walkway (stockade.js walkwayOf: what of it a stair comes up
 *   onto), on its squares nearest their foes, `loose` squares apart each way, facing out over its
 *   wall and going after no one outside it further than they reach (any more than there's room
 *   for `back` metres within its openings, across them); its healers where they stood.
 * - Those storming it make for `muster` metres out from the opening nearest them, their archers
 *   and casters standing there; the rest make for its parade ground, after anyone within `reach`
 *   metres of it on the way. A share of their shield line and two-handers (`party`, `least` to
 *   `most` of them) hack down the section of its wall nearest them that's no nearer an opening
 *   than `clear` metres (its stakes, KINDS.stakes), as many again of the rest sent at it should
 *   they all fall; another `again` ms after one falls.
 * - Either side's beaten, and the storm's over, once it's down to ARMY.rout of those it went in
 *   with and outnumbered, in the war's numbers (and a force met in the field, likewise); or those
 *   storming it beaten off once it's come to nothing, none on either side falling and no stakes
 *   hacked at for `stall` ms. Beaten, a line runs (`run` metres a second) while it's getting away
 *   (war.js fleeing).
 */
export const STORM = Object.freeze({ near: 60, calm: 20000, spread: 10, depth: 1.6, hold: 3, back: 7, loose: 2, muster: 14, reach: 40, party: 0.2, least: 2, most: 6, clear: 8, again: 45000, run: 3, stall: 60000 });

// The forces that fight out in the field (and storm camps): the armies and reserves
const FIELDED = Object.freeze(["army", "reserve"]);

// The nearest of some things with an `at` ([x, y] metres) to a point (of two as near, the first)
const nearestOf = (things, [x, y]) => things.reduce((best, each) => (hypot(each.at[0] - x, each.at[1] - y) < hypot(best.at[0] - x, best.at[1] - y) ? each : best));

// `count` shared out as near as whole ones go to `weights` (the largest remainders rounded up; of
// two as large, the first)
function shares(count, weights) {
    const total = weights.reduce((sum, weight) => sum + weight, 0) || 1;
    const exact = weights.map((weight) => (count * weight) / total);
    const whole = exact.map(Math.floor);
    let left = count - whole.reduce((sum, each) => sum + each, 0);

    for (const k of exact.map((each, k) => [each - whole[k], k]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).map(([, k]) => k)) {
        if (left-- <= 0) {
            break;
        }

        whole[k]++;
    }

    return whole;
}

/**
 * A fortification near a player (docs/WAR.md *Fortifications*): stood up in the battle once a
 * player's this near (metres), shooting from its loops at what comes within reach of them, and let
 * go once every player's this far; how much of a blow its stone takes off (`armor`, by kind).
 */
export const FORT_NEAR = Object.freeze({ near: 200, far: 350, armor: { tower: 0.25, garrison: 0.2 } });

/**
 * A forward garrison's squads out with it near a player (docs/WAR.md *Battle lines*, M15; war.js
 * SQUADS): its patrols walking their rounds, `rounds` metres out from it (each a ring of `stops`,
 * the second turned half a stop on from the first), and its assault team at its gate, `gate`
 * metres out from its middle, or out against an enemy's fortification stood up within reach.
 */
export const SQUADS_NEAR = Object.freeze({ rounds: [80, 200], stops: 8, gate: 9 });

/**
 * A town's barracks near a player (docs/WAR.md M16): its guardsmen (war/muster.js QUARTERED) and
 * its captain stood up in it once it's got ready (a player at its door), of whoever holds the
 * town; its captain the stronger (`captain`: their health and blows, as many times a guardsman's);
 * how far from their posts they go after an enemy (`leash`, metres: the room); and how long after
 * it's cleared, or its town's changed hands, or any of them fell, the garrison's made up in it,
 * once no player's in it (`relief`, ms).
 */
export const BARRACKS_NEAR = Object.freeze({ captain: { hp: 2.5, power: 1.3 }, leash: 12, relief: 20000 });

/**
 * An adventurer hired to follow a player (docs/WAR.md M9), by their calling: what they fight
 * with (a warrior, a shield too: NPC_SHIELDS), and what it costs to hire them (gold). How many a
 * player can lead: one, and more as their Command grows (progress.js TREES).
 */
export const HIRES = Object.freeze({
    warrior: { weapon: "sword", price: 40, shield: true },
    ranger: { weapon: "bow", price: 40 },
    rogue: { weapon: "sword", price: 30 },
    mage: { weapon: "staff", price: 60 },
    cleric: { weapon: "hammer", price: 60 },
});

/**
 * The shields others carry (core/battle.js `shield`): a people's soldiers with a one-handed blade
 * (core/gear.js SHIELD_ARMS: their uniform's shield), their captains' better, and a hired
 * warrior's: how often each catches a blow from in front on it, and how much of it the shield
 * takes.
 */
export const NPC_SHIELDS = Object.freeze({
    soldier: { chance: 0.15, share: 0.3, spells: false },
    captain: { chance: 0.25, share: 0.45, spells: false },
    follower: { chance: 0.2, share: 0.3, spells: false },
});

// A soldier's shield, if what they fight with leaves a hand for one (NPC_SHIELDS)
const shieldOf = (weapon, rank) => (SHIELD_ARMS.includes(weapon) ? NPC_SHIELDS[rank] : null);

/** How near (metres) a people's soldiers must be to see a player bring down their enemy, and owe them for it (M7). */
export const FAVOUR_SIGHT = 25;

/**
 * How a player stirs their people towards rising (docs/WAR.md M10), while they serve another or
 * have fallen: each request done for their own people's rulers (a tithe the more), each contract
 * from a guild's board, and each of their oppressors' soldiers they bring down.
 */
export const STIR = Object.freeze({ request: 10, tithe: 15, contract: 4, soldier: 3 });

/** The standing a player's given when their people bring every other under them (M10). */
export const HONOURS = 200;

/** How long the fallen soldiers lie before they're taken away (battle ms). */
const FALLEN_MS = 10000;

/** How long one of the wild's creatures lies where it fell (ms): long enough to be raised (Zombify). */
const CORPSE_MS = 30000;

/**
 * Those at a player's side (their followers, and the creatures there by magic: Zombify's risen
 * dead, Summon's), brought to them when they've fallen too far behind (battle.js FOLLOW.lost):
 * how far behind them they're put (m: `behind`, the way they face; a free square near it).
 */
export const COMPANION = Object.freeze({ behind: 2 });

/** How long a player being summoned by another has to come (ms): no answer, and they've resisted. */
export const SUMMONING_MS = 30000;

/**
 * Parties of players (docs/GAME.md *Playing in a party*): at most `most` players in one (their
 * followers and companions besides); how near a foe's fall a member is (`reach`, metres) to
 * share in it (what's on it, their requests, and as much skill as the foe had hit points: the
 * Diablo IV way, each their own); how long an invite waits for an answer (`askMs`).
 */
export const PARTY = Object.freeze({ most: 4, reach: 40, askMs: 30000 });

// What a player does that has to do with the world round them (and so ends their Invisibility:
// casting and striking do too, battle.js); moving about, or seeing to their pack, doesn't
const SEEN = new Set(["enter", "buy", "sell", "use", "drop", "pickUp", "talk", "effect", "trade", "offer", "agree", "travel"]);

// The kinds of settlement with a temple (setpieces/town.js), for Word of Recall
const TEMPLED = new Set(Object.keys(SETTLEMENT_KINDS).filter((kind) => SETTLEMENT_KINDS[kind].landmarks.includes("church")));

/**
 * The wild's creatures about the players (docs/WILDS.md): how many are kept about each player out
 * in the world (within `about` metres; `night` more after dark), put out `from` to `to` metres
 * away (out of sight), clear of the settlements by `clear` metres and of the roads by `road`
 * metres (they may wander onto them after); let go once every player's `far` away (not while
 * fighting), and the night's own at daybreak once every player's `from` away. Ground cleared of
 * them stays clear a while: each one killed keeps its `about` metres round where it fell empty
 * for `cleared` ms, for everyone, one fewer kept about anyone near it, so they come back one at a
 * time as each one's time runs out. A wild camp's folk come out once a player's `camp` metres
 * from it (a few more than its patrols roam), and are let go `campFar` away.
 */
export const WILDS = Object.freeze({ count: 4, night: 1, about: 60, from: 30, to: 44, clear: 60, road: 10, cleared: 120000, far: 90, camp: 60, campFar: 140 });

/**
 * Passing the time (the terrain plan's M7e, §9 Night in play): sleeping in a room at an inn, or
 * camping out in the world (no camp within a settlement, nor with anything hostile within `clear`
 * metres), to the next sunrise or sunset at least `least` ms of play off; the camp's fire burning
 * on `burns` ms of the battle's time after, lighting what's round it as a war camp's does. Only
 * the world's host passes the time (everyone's woken with them); anyone else just rests.
 */
export const REST = Object.freeze({ clear: 40, least: 5 * 60000, burns: 3 * 60000 });

/**
 * How long a camp's slept by, as the player chooses (host.js `#camp`'s `until`): so many of the
 * world's hours (`least` to `most`), or till sundown (when the night's creatures come out:
 * daytime.js SUNDOWN), or till the morning (sunrise, the night over); a camp made with none chosen
 * is slept by to the next sunrise or sunset, as an inn's room is.
 */
export const CAMP_HOURS = Object.freeze({ least: 1, most: 24 });

/** How long (ms of play) a camp's slept by when the world's been going `elapsed` ms, as `until` has it (CAMP_HOURS); or null if `until`'s no such thing. */
export function campFor(elapsed, until) {
    if (until === "sundown") {
        return untilTime(elapsed, SUNDOWN);
    }

    if (until === "morning") {
        return untilTime(elapsed, DAY.rises);
    }

    if (Number.isInteger(until?.hours) && until.hours >= CAMP_HOURS.least && until.hours <= CAMP_HOURS.most) {
        return until.hours * HOUR;
    }

    return null;
}

/**
 * How near (m) a player has to be to a creature when it falls to find their own bundle on it (its
 * spoils: spoils.js).
 */
export const SPOILS_REACH = 30;

/** How long something dropped lies on the ground before it's gone (ms), and how near (m) it's picked up from. */
export const GROUND_MS = 5 * 60 * 1000;
export const PICK_REACH = 1.6;

/**
 * Trading face to face (docs/WILDS.md): how near (m) two players must be to begin, and how far
 * apart they can get before it's off; how long (ms) asking to trade waits for an answer.
 */
export const TRADE = Object.freeze({ reach: 4, apart: 7, asking: 30000 });

/**
 * How closely a people's soldiers look at someone passing for one of them: those this near
 * (squares) who can see them, each second a chance to see through it (twice that right beside them).
 */
export const SCRUTINY = Object.freeze({ reach: 3, chance: 0.02 });

/** How long something thrown away can be taken back (ms). */
export const UNDO_MS = 8000;

/**
 * A field battle (Host #fieldBattle: the debug overlay's, to see how many a device draws and plays
 * smoothly): `most` a side at most, each an army in a line of battle (core/formation.js: its mix
 * of roles, its places), the rear of the player's people's `near` metres ahead of them and the
 * two fronts `apart` metres apart, facing each other, marching to meet halfway at `march` metres
 * a second.
 */
export const FIELD_BATTLE = Object.freeze({ most: 200, near: 8, apart: 48, march: 1.1 });

/**
 * What each people's soldiers fight with in a line of battle, by their role (core/formation.js
 * ROLES; the first of several the most): the shield line a sword or cleaver, the two-handers
 * what's their own, the archers the bow, the casters a grimoire or wand, the healers a staff.
 */
export const ROLE_ARMS = Object.freeze({
    human: Object.freeze({ front: ["sword"], heavy: ["greatsword", "hammer"], archer: ["bow"], caster: ["grimoire"], healer: ["staff"] }),
    elf: Object.freeze({ front: ["sword"], heavy: ["greatsword"], archer: ["bow"], caster: ["wand"], healer: ["staff"] }),
    darkElf: Object.freeze({ front: ["sword"], heavy: ["greatsword", "axe"], archer: ["bow"], caster: ["wand"], healer: ["staff"] }),
    cat: Object.freeze({ front: ["sword"], heavy: ["gauntlets", "greatsword"], archer: ["bow"], caster: ["grimoire"], healer: ["staff"] }),
    lizard: Object.freeze({ front: ["sword"], heavy: ["staff", "axe"], archer: ["bow"], caster: ["grimoire"], healer: ["staff"] }),
    orc: Object.freeze({ front: ["cleaver"], heavy: ["axe", "hammer"], archer: ["bow"], caster: ["grimoire"], healer: ["staff"] }),
});

/** Each people's casters' school of magic (spells.js SCHOOLS): its first two spells theirs, the stronger first. */
export const PEOPLE_SCHOOL = Object.freeze({ human: "fire", elf: "air", darkElf: "water", cat: "fire", lizard: "earth", orc: "earth" });

/** A healer's spells, the weakest first (battle.js #mend). */
export const HEALER_SPELLS = Object.freeze(["vigor", "mendWounds"]);

/**
 * What a soldier of a people in a role carries and casts (the `k`th of its role, for which of
 * its role's weapons): { weapon, casts, heals }.
 */
export function soldierOf(people, role, k = 0) {
    const arms = (ROLE_ARMS[people] ?? ROLE_ARMS.human)[role] ?? ROLE_ARMS.human.front;
    const school = SCHOOLS[PEOPLE_SCHOOL[people] ?? "fire"];

    return {
        weapon: arms[k % arms.length],
        casts: role === "caster" ? [school.tiers[1], school.tiers[0]] : null,
        heals: role === "healer" ? [...HEALER_SPELLS] : null,
    };
}

/** What each people's soldiers fight with: guards the first, patrols each in turn (characters/soldiers.js dresses them to match). */
export const SOLDIERS_ARMS = Object.freeze({
    human: ["sword", "bow"],
    elf: ["bow", "sword"],
    darkElf: ["sword", "wand"],
    cat: ["gauntlets", "bow"],
    lizard: ["staff", "bow"],
    orc: ["cleaver", "cleaver"],
});

/**
 * Who sits where in their people's rule (by role: docs/WAR.md M4), and what each does: gives work
 * (`work`), takes word of it done (`report`), hands out the armoury's gifts (`armoury`), hears
 * counsel (`counsel`). A town hall's reeve and clerk; a keep's ruler, steward and councillors.
 */
export const OFFICIALS = Object.freeze({
    reeve: { post: "hall", work: true, report: true },
    clerk: { post: "hall", report: true },
    ruler: { post: "keep", work: true, report: true, counsel: true },
    steward: { post: "keep", work: true, report: true, armoury: true },
    councillor: { post: "keep" },
    // (An adventurers' guild's: its board's contracts, for anyone: docs/WAR.md M8)
    receptionist: { post: "guild", work: true, report: true },
});

/** What's kept of the things done by talking (the last so many). */
const KEEP_DONE = 50;

/** Bumped whenever what a snapshot holds changes, so an old one isn't read wrong. */
export const SNAPSHOT_VERSION = 25;

/**
 * Which shop each of the folk keeps (by their role): what they sell (core/progress.js SHOPS);
 * unless they keep one of their own (their `shop`: a watchtower's quartermaster, the watch's).
 */
export const SHOPKEEPERS = Object.freeze({ smith: "smith", apprentice: "smith", barkeep: "tavern", barmaid: "tavern", innkeeper: "tavern", priest: "temple", acolyte: "temple", receptionist: "guild", quartermaster: "armoury", arcanist: "arcane", herbalist: "abbey" });

/**
 * How near a shopkeeper a player trades with them (squares): a talk's reach across a counter,
 * and a few steps more, as they go about behind it.
 */
export const SHOP_REACH = TALK_REACH.across + 3;

/**
 * What the things bought by talking do (their `buy` or `rent`): mend hurts, fill stamina, or a
 * boon for a while (the share more a player's blows, heals and armour are: ms). A boon can be
 * drunk too (progress.js ITEMS `use.boon`: a Stamina Boost, `staminaTimes` the stamina).
 */
export const BOUGHT = Object.freeze({
    ale: { stamina: 1000 },
    stew: { hp: 15 },
    room: { hp: 1000, stamina: 1000 },
    sharpening: { boon: { id: "sharpening", label: "A keen edge", melee: 0.1, ms: 600000 } },
    blessing: { boon: { id: "blessing", label: "Blessed", melee: 0.05, ranged: 0.05, heal: 0.1, armor: 0.03, ms: 600000 } },
});

/** Every boon there is, bought or drunk, by its id: what one kept between visits is taken as (Host restoreVitals). */
const BOONS = Object.freeze(Object.fromEntries([...Object.values(BOUGHT), ...Object.values(ITEMS).map(({ use }) => use)].filter((each) => each?.boon).map(({ boon }) => [boon.id, boon])));

/**
 * A courtesan's company, paid for by talking (dialogue.js courtesan, `{ company: true, price }`):
 * three times in four (`chance`) an hour's afterglow, a boon that brings the breath back faster
 * by a whole share rolled between half again and twice as fast (`faster`, per cent); else the pox
 * caught (afflictions.js), for the hour too. Either for `ms`.
 */
export const COMPANY = Object.freeze({ chance: 0.75, faster: [50, 100], ms: 60 * 60000 });

// A courtesan's afterglow (COMPANY), the breath back `faster` per cent faster: a boon of its own
// for each roll, kept between visits with it (Host vitalsOf), as rolls go
const afterglow = (faster) => ({ id: "afterglow", label: `Afterglow: stamina back ${faster}% faster`, recoveryTimes: 1 + faster / 100, faster, ms: COMPANY.ms });

/**
 * A Scroll of Safety (progress.js ITEMS scrollOfSafety): read for `ms`, and the reader carried
 * to the market square of the town they started in (the world's `spawns.player`), their company
 * left behind as by any magic that carries them; fallen before then, and it's lost.
 */
export const SAFETY = Object.freeze({ ms: 3000 });

/** The skills' experience for each thing done, besides the damage done or taken, or healed. */
const XP = Object.freeze({ stun: 15, exhausted: 5, talk: 3, effect: 5, trade: 0.5, command: 0.5, evasion: 0.3, dodged: 20, blocked: 20 });

// The skills of the body: as each grows, Evasion grows by a share of it (XP.evasion)
const BODILY = new Set(["blade", "marksman", "endurance"]);

/** Why a command wasn't carried out (a command's { ok: false, reason }). */
export const REFUSALS = Object.freeze({
    player: "No such player.",
    dead: "The dead can't do that.",
    command: "Nothing that can be done.",
    target: "No one there to do that to.",
    link: "No way through there.",
    far: "Too far away.",
    talking: "Not talking to them.",
    gold: "Not enough gold.",
    hire: "They're not for hire.",
    company: "You can't lead any more than you have.",
    follower: "They don't follow you.",
    untargeted: "Set on an enemy first, for them to fight.",
    shop: "They've nothing like that to sell.",
    soldOut: "They've sold all they had of that today: there'll be more tomorrow.",
    full: "Your pack is full.",
    locked: "It's locked fast, and its guardians still hold the place.",
    guarded: "It's locked fast, and those keeping it are still about.",
    kept: "It's locked fast, and the one who keeps it still stands.",
    unknown: "You haven't learnt that.",
    item: "You can't do that with it.",
    shield: "Not with that weapon.",
    unshielded: "You need a shield in your other hand.",
    cooldown: "Not ready yet.",
    official: "They're not the one to ask.",
    stranger: "They've nothing for a stranger.",
    rank: "They won't hear that from you. Not yet.",
    unregistered: "Register at the guild's counter first.",
    work: "They've nothing for you just now.",
    requests: "You've enough to be getting on with.",
    due: "You've nothing to tell them.",
    claimed: "The armoury's given you all it will, for now.",
    counsel: "That counsel can't be taken.",
    unready: "Not yet: your people aren't ready to rise.",
    request: "No such request.",
    count: "There aren't so many as that.",
    gone: "It isn't there any more.",
    undo: "Too late to take that back.",
    down: "You're down: get up first.",
    wanted: "They don't buy that: the adventurers' guild buys everything.",
    trade: "You're not trading with anyone.",
    trading: "You're trading with someone already.",
    elsewhere: "They're trading with someone else.",
    changed: "Something offered isn't there any more: look again.",
    theirs: "They haven't room for all that.",
    unafflicted: "There's nothing for that to cure.",
    boosted: "One's still working: only one at a time.",
    reading: "You're reading one already.",
    known: "You know that spell already.",
    unexplored: "You haven't been there.",
    // (At the war table: core/wartable.js, #atTable)
    table: "Stand at the war table to give its orders.",
    orderRank: "Only a Lord or a Councillor gives the army its orders.",
    serving: "Your people serve another: their orders come from their masters now.",
    notOurs: "That army isn't ours to order.",
    raised: "We've an army raised already.",
    noArmy: "We have no army raised.",
    peace: "We aren't at war with them.",
    water: "Not there: that's water.",
    mustering: "Our army's mustering at home: it's fed there.",
    wagon: "A supply wagon's on its way to it already.",
    supplies: "No supplies can be sent to it from there.",
    depot: "A depot can be built only in another people's lands, if we can pay for it, two at most.",
    orders: "Those orders can't be carried out.",
    unsummoned: "No one's calling you.",
    partied: "They're in a party already.",
    partyFull: "The party's full: four at most.",
    asked: "They've been asked already.",
    uninvited: "No one's asked you to a party.",
    unpartied: "You're not in a party.",
    chatty: "Not so fast: give it a moment before saying more.",
    leader: "Only the party's leader can do that.",
    member: "They're not in your party.",
    invitee: "Not someone to ask.",
    outdoors: "There's nowhere to camp in here.",
    settlement: "No camping in town: find an inn.",
    howLong: "Camp for an hour to a day, or till sundown or the morning.",
    hostiles: "Not with enemies about.",
    midst: "Not in the middle of a blow or a spell.",
    fighting: "Not in the middle of a fight.",
    portal: "Stand at a guild's portal to step through it.",
    here: "You're there already.",
});

// What can't be done while knocked off one's feet (battle.js: a knockdown)
const DOWN_HELD = new Set(["move", "ahead", "engage", "approach", "enter", "cast", "ability", "use", "talk", "trade", "camp", "emote", "travel"]);

// A whole number, and a square [x, y] of whole numbers
const whole = (value) => Number.isFinite(value) && Math.floor(value) === value;
const isSquare = (value) => Array.isArray(value) && value.length === 2 && value.every(whole);
const refuse = (reason) => ({ ok: false, reason });
const OK = Object.freeze({ ok: true });

// The charms that count in someone's pack (progress.js charms), as a key to tell a change by
const charmsOf = (progress) =>
    Object.entries(progress.charms())
        .map(([id, quality]) => `${id}:${quality}`)
        .sort()
        .join();

// A player's standing as kept, with their guild card: one registered at a guild before the guilds
// kept a card (the player knew `guildMember`, from the receptionist's talk) given theirs now, its
// merit from the guild work they've done
function cardOf(standing, { knowledge = [] } = {}) {
    if (standing?.guild || ![...knowledge].includes("guildMember")) {
        return standing;
    }

    return { ...standing, guild: { merit: meritOf(Array.isArray(standing?.done) ? standing.done : []) } };
}

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

        /**
         * Told of everything done to the world, as it's done (docs/WAR.md M11: a world opened to
         * others records it, for those who've joined to do again: core/netplay.js), or null:
         * ["a", ms] moved on, ["c", playerId, command], ["j", options] a player come, ["l", id]
         * gone, ["p"] its own people put in; and, just after each of those, ["v", time, id, way]
         * for each way the battle found doing it (battle.js #route: those who've joined take the
         * host's ways rather than finding their own).
         */
        this.recorder = null;

        /**
         * In a copy of a world someone else hosts (core/netplay.js Joining), the ways the host's
         * battle found, waiting for this one's to take ([time, id, way]); else null.
         */
        this.replay = null;
        this.#reset({ seed, war });

        if (populate) {
            this.populate();
        }
    }

    // Everything that changes in the world, as it is before anything's happened in it
    #reset({ seed, war }) {
        const world = this.world;

        /** The war between the peoples (war/war.js), in a world laid out from a plan. */
        this.war = world.plan ? Host.#war(world.plan, war) : null;
        this.stockaded = null;
        this.#fortsChanged();
        this.#stockadesChanged({ tell: false });
        this.battle = new Battle(world, { seed, relations: (a, b) => this.#against(a, b), allied: (a, b) => this.#allied(a, b) });
        this.#wire();

        /**
         * The towns whose soldiers are out, near a player (by the town's id): { people (who
         * holds it), ids (its soldiers'), share (how many of its garrison each stands for),
         * banners ([{ at, facing }]), braziers ([{ at }]: one by each pair of guards) }; and each soldier (by id): { town, people, weapon, sex,
         * seed } (how they look), and the fallen, to be taken away ([{ id, at }]).
         */
        this.mustered = new Map();
        this.soldiers = new Map();
        this.fallen = [];

        // How many have been mustered for field battles (#fieldBattle: each by its number)
        this.fielded = 0;

        /**
         * The works whose guards are out near a player, or the brigands holding them (by the
         * works' id): { people (who holds it; null, the wild's), held, ids (its guards' or the
         * brigands'), share (how much of its guard or its band each stands for), relief (when its
         * fallen guards are relieved) }. Its soldiers are each { works, people, ... } in `soldiers`.
         */
        this.worksOut = new Map();

        /**
         * The settlements and castles whose townsfolk are out, near a player (core/townsfolk.js),
         * by the place's id: their ids (each one's look and errands among the folk: `folk`).
         */
        this.townsfolk = new Map();

        /**
         * The war's camps near a player, pitched (by the camp's id: war.js camps): { people, ids
         * (its sentries'), share (how many of its guard each stands for), fire, tents }.
         */
        this.camps = new Map();

        /**
         * The supply wagons met on their way near a player (by the wagon's id in the war:
         * WAGON_NEAR): { people, mission ("army" or "depot"), to (its army's or depot's id), wagon
         * (its ox and wagon's id in the battle: in `wagons` too), ids (its guards'), at (where it was
         * last), over (null; or "taken", once its guards are all down) }.
         */
        this.supplies = new Map();

        /**
         * The camps' skirmishers out in the world near a player (by the camp's id and the turn they
         * went out: SKIRMISH_NEAR): { camp, people, target, kind (what it is: war.js #skirmishable),
         * ids, since (when they went out: battle time), fought (when they first came to it, or
         * null), back (on their way back) }.
         */
        this.skirmishers = new Map();

        /**
         * The seats' rulers and the captains of their guard out at their keeps' doors near a
         * player, their garrison put down (by the seat's id: LEADERS_NEAR): { people, ids (the
         * ruler's, then the captain's), at (the door) }.
         */
        this.leaders = new Map();

        /**
         * The armies and reserves met in the field near a player (by the force's id: ARMY_NEAR):
         * { people, kind ("army" or "reserve"), formation (its line's, in the battle), ids (its
         * soldiers'), at (where its line was last) }. Its soldiers are each { force, role, ... } in
         * `soldiers`.
         */
        this.armies = new Map();

        /**
         * The camps' stockades held near a player (STORM), by the camp's id: { army (its army met
         * there, or null), alarm (when an enemy was last near it: battle ms), attackers (the forces
         * met storming it now: ids), by (all that have stormed it), went ({ by, of }: how many
         * were storming it and holding it, in the war, as it began; null till it has), breaches
         * (hacked open in it), section ({ id, index }: the stakes being hacked down, or null),
         * next (when the next may be: battle ms), posted (how its holders were last posted) }.
         */
        this.storms = new Map();

        /**
         * The envoys met on the road near a player (by the envoy's id): { people, to (whose seat
         * they're bound for), mission, ids (the envoy's, then their escort's), leg (the point on
         * their road they've passed), mark (the square they're making for), at (where the envoy
         * was last), over (null; or "arrived" or "waylaid", once they're gone from the war) }.
         */
        this.envoys = new Map();

        /**
         * The convoys met on the road near a player (by the convoy's id): { people, works (its
         * works'), to (the town it takes its goods to), cargo (what it carries: { [resource]:
         * amount }, or null going home), ids (its
         * captain's, then its guards'), wagons (its wagons'), leg, mark, at (as an envoy's), over
         * (null; or "arrived", "home" or "plundered", once it's done with the war) }. And each
         * wagon (by id): { convoy, people, load (what it's laden with: a resource, or null), seed }.
         */
        this.convoys = new Map();

        /** The fortifications stood up near a player (by the fortification's id): { realm, kind }. */
        this.fortsOut = new Map();

        /**
         * The forward garrisons' squads out (SQUADS_NEAR), by the garrison's id: { people, gate,
         * rounds, ids and next (by squad: SQUAD_NAMES), target (the enemy fortification its assault
         * team's out against, or null), broken (its garrison razed: let go as they're out of sight) }.
         */
        this.squadsOut = new Map();

        /**
         * Each town's barracks with its garrison stood up in it (BARRACKS_NEAR), by the town's id:
         * { key (the building's), map (its room's), people (whose they are), ids (its captain's
         * first), cleared (all of them put down), relief (when they're to be made up, or null) }.
         */
        this.quartered = new Map();
        this.wagons = new Map();

        /**
         * The adventurers following the players (by id): { leader (a player's id), name, calling,
         * sex, seed, people, from (the one of the folk they were, by id), waiting (standing where
         * they were told to) }. A player's go with their character (characterOf).
         */
        this.followers = new Map();
        this.nextFollower = 1;

        /** The folk hired (their ids): never among the folk again, wherever they were. */
        this.hired = new Set();

        /**
         * The wild's creatures out near the players (by id): { creature, tier, pack (its pack's
         * id), camp (the wild camp it's of), lair (the perilous site it's of) }; the wild camps
         * whose folk are out, and the perilous sites whose master and guards are there (by id:
         * { ids }); when each site's master, slain, is back (battle ms, by site id).
         */
        this.wild = new Map();
        this.nextWild = 1;
        this.wildCamps = new Map();
        this.lairs = new Map();
        this.slain = {};

        /** Where the wild's creatures have been cleared lately: [{ at: [x, y], until }] (battle ms; WILDS.cleared). */
        this.cleared = [];
        /** Until when (battle ms, by player id) no elite's put out near a player, one put out near them lately (ELITES.rest). */
        this.eliteRest = new Map();
        // The places worth finding held by outlaws or the dead whose band is out (core/places.js):
        // by the place's id, { ids (the band, its leader first), leader, at, tier, holder, chest
        // (its square), race (the place's people, or null), cleared }
        this.held = new Map();

        /**
         * The adventurers' caches out in the wilds (core/caches.js), by id: { id, at ([x, y]: its
         * heart, where its guards walk round), chest (its square), band (CACHE_BANDS' id), tier
         * (its band's, their leader's CACHES.lead more), ids (its guards, their leader first),
         * opened }; and how far each player's crossed the wilds since the last was put out
         * before them (by id: { at, walked, next (how far it's to be: CACHES.every, rolled once
         * they're as far as the least it could be; null till then), heading (the way they were
         * last going: [x, y], one long; or null) }).
         */
        this.caches = new Map();
        this.nextCache = 1;
        this.travel = new Map();

        /**
         * The dungeons a player's come to (core/dungeons: docs/DUNGEONS.md), by site id: {
         * generation (how many times it's been cleared and made again), awake (by level: the ids
         * of its foes out now, or null), dead (its foes slain: foeKey's, staying slain till it's
         * made again), opened (its chests opened: their ids), cleared (its hoard opened: it's made
         * again once everyone's left) }.
         */
        this.dungeons = new Map();


        /**
         * What's been dropped on the ground (by id): { id, item ({ id, quality, count }), map,
         * square, until (when it's gone), by (the player who dropped it) }.
         */
        this.ground = new Map();
        this.nextGround = 1;

        /**
         * The players' camps out in the world, burning a while after they've slept by them (one
         * a player): { id, player (whose), people (their tent's), fire ([x, y]), tent ({ at,
         * facing }), until (the battle's time it's out) }.
         */
        this.campfires = [];

        /**
         * The players' trades, face to face (by id): { id, from (the player who asked), to (who
         * they asked), open (once the other's said yes; till then, `until`: when the asking's
         * forgotten), offers (by player: { gold, items: [{ id, quality, count }] }), agreed (by
         * player: whether they'll take the other's offer for theirs) }.
         */
        this.trades = new Map();
        this.nextTrade = 1;

        /**
         * What's been sold today from the shops with a daily stock (core/stock.js), by the shop
         * (stockKey): { day (daytime.js dayOf), sold (how many of each: by wareKey), special
         * (whether its daily special's gone) }; a day before today's, nothing's been sold yet.
         */
        this.stocks = new Map();

        /**
         * The creatures at the players' sides by magic (by id): { leader (a player's id), creature,
         * tier, until (when they're gone: five minutes on), risen (Zombify's; else Summon's) }. Lost
         * if the player's carried off by magic (Teleport...).
         */
        this.companions = new Map();
        this.nextCompanion = 1;

        /** Players being summoned by another (by id): { by (who), until (when it's taken they've resisted) }. */
        this.summonings = new Map();

        /**
         * The players' parties, by id: { id, leader (a player's id), members (their ids, the
         * longest in it first) }; which each player's in (`partyIds`: player id to party id); and
         * those asked to join one (`invites`, by who's asked: { from (who asked), until (when it
         * lapses unanswered) }).
         */
        this.parties = new Map();
        this.partyIds = new Map();
        this.invites = new Map();
        this.nextParty = 1;

        /**
         * The players, by id: { id, hero (their character: { name, shape, look, weapon, boots,
         * race }), realm (the people they're of), talks (what the folk remember of them, what
         * they've learnt: { memory, knowledge }), explored (core/explored.js), progress
         * (core/progress.js), standing (core/standing.js), boons, readyAt, offers (the work
         * each official last offered them: { turn, request }) }.
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

        // The host's own chances (what's found on the fallen)
        this.random = createRandom(((world.seed ?? 1) * 2654435761) >>> 0);

        // What's happened besides the battle's own (given out with them by advance)
        this.events = [];
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
        this.recorder?.(["p"]);

        const { spawns, patrol } = this.world;

        if (spawns?.orc && !this.battle.actor("orc")) {
            this.battle.add({ id: "orc", kind: "orc", name: "Orc", weapon: ORC_WEAPON, team: "orcs", square: spawns.orc, ai: "patrol", patrol });
        }

        for (const one of this.world.folk ?? []) {
            this.#addFolk(one, this.#sideOf(this.world.start?.id, "human"));
        }
    }

    /**
     * A player comes into the world: { id, hero, talks, explored } (their character, as kept:
     * app/save.js), at `square` on `map` (the world's start, to begin with; the nearest free
     * square to it). Returns their record (players).
     */
    join({ id = HOST_PLAYER, hero, talks = {}, explored = {}, progress = {}, standing = {}, followers = [], square = this.world.spawns?.player, map = "town" }) {
        const plain = (value) => (typeof value?.toJSON === "function" ? value.toJSON() : structuredClone(value));

        this.recorder?.(["j", { id, hero: structuredClone(hero), talks: { memory: structuredClone(talks.memory ?? {}), knowledge: [...(talks.knowledge ?? [])] }, explored: plain(explored), progress: plain(progress), standing: plain(standing), followers: structuredClone(followers), square: square && [...square], map }]);

        if (this.players.has(id)) {
            return this.players.get(id);
        }

        const player = {
            id,
            hero: { ...hero },
            realm: hero.race ?? "human",
            talks: { memory: talks.memory ?? {}, knowledge: new Set(talks.knowledge ?? []) },
            explored: explored instanceof Explored ? explored : new Explored(explored),
            progress: progress instanceof Progress ? progress : new Progress(progress, hero),
            standing: standing instanceof Standing ? standing : new Standing(cardOf(standing, talks)),
            // Boons for a while ([{ id, label, until, melee...}]), and when each ability's ready again
            boons: [],
            readyAt: {},
            discarded: null,
            offers: {},
            // A Scroll of Safety being read ({ until }: SAFETY), or none
            safety: null,
        };
        const taken = new Set(this.battle.actors.filter((actor) => actor.map === map).map(({ square: [x, y] }) => squareKey(x, y)));
        const at = taken.size ? nearestFree(squaresOf(this.world.maps?.[map] ?? this.world), square, { taken }) : square;

        // (Kept from before there were portals: every branch of the guild in country they'd
        // uncovered, or whose hall they'd been in, open to them as if they'd been in each; from
        // now on, only those they go into: core/portals.js)
        if (player.explored.portals === null) {
            player.explored.portals = new Set(this.world.plan ? branchesFound(this.world.plan, player.explored, this.world.start) : []);
        }

        this.players.set(id, player);
        player.hero.weapon = weaponOf(player.progress);
        player.hero.boots = player.progress.kicks();
        this.battle.add({ id, kind: "player", name: hero.name, weapon: player.hero.weapon, boots: player.hero.boots, team: player.realm, square: at, map });
        this.#outfit(player);

        // (Their followers, with them; and what their people's scouts see on their maps)
        for (const one of followers) {
            this.#follow(player, one);
        }

        this.#scoutsSee([player]);
        this.#event("join", { id, name: hero.name, realm: player.realm });

        return player;
    }

    /**
     * How a player is just now, as it's kept between visits (app/save.js saveVitals): their hit
     * points and stamina (hp null, fallen: they get up whole), and what's on them for a while,
     * each by what's left of it (ms of the battle's time, which stands still while the game's
     * stopped, so it's what's left when they come back): what lingers after blows, the spells
     * lasting on them, their boons, and how long till each ability and spell can be used again.
     * Null for no such player.
     */
    vitalsOf(id) {
        const player = this.players.get(id);
        const actor = this.battle.actor(id);

        if (!player || !actor) {
            return null;
        }

        const now = this.battle.time;
        const left = (until) => Math.max(0, Math.round(until - now));
        const waiting = (readyAt) => Object.fromEntries(Object.entries(readyAt ?? {}).filter(([, at]) => at > now).map(([key, at]) => [key, left(at)]));

        return {
            hp: actor.dead ? null : actor.hp,
            stamina: actor.dead ? null : actor.stamina,
            afflictions: actor.afflictions.filter(({ until }) => until > now).map(({ kind, until, damage, look }) => ({ kind, left: left(until), damage, look: look ?? null })),
            buffs: actor.buffs.filter(({ until }) => until > now).map(({ kind, until, by, level }) => ({ kind, left: left(until), level, own: by === id })),
            boons: player.boons.filter(({ until }) => until > now).map(({ id: boon, until, faster }) => ({ id: boon, left: left(until), ...(faster ? { faster } : {}) })),
            abilities: waiting(player.readyAt),
            spell: left(actor.spellReadyAt),
            spells: waiting(actor.spellsReadyAt),
        };
    }

    /**
     * A player as they were kept (vitalsOf), just joined: their boons back first (what they make
     * of their stamina), then their hit points and stamina (no more than they can have now; none
     * kept, or fallen, whole), what lingers on them and lasts, and their abilities' and spells'
     * waits, each with what was left of it. Anything the game no longer knows is let go.
     */
    restoreVitals(id, vitals) {
        const player = this.players.get(id);
        const actor = this.battle.actor(id);

        if (!player || !actor || actor.dead || !vitals || typeof vitals !== "object") {
            return;
        }

        const now = this.battle.time;
        const ms = (value) => (Number.isFinite(value) && value > 0 ? Math.round(value) : 0);
        const list = (value) => (Array.isArray(value) ? value.filter((each) => each && typeof each === "object") : []);
        const waits = (value) => Object.entries(value && typeof value === "object" ? value : {}).filter(([, wait]) => ms(wait));

        // (Each as the game has it, not as kept; an afterglow with its roll, as rolls go)
        const [least, most] = COMPANY.faster;
        const boonOf = ({ id: boon, faster }) => (boon === "afterglow" ? afterglow(Math.min(most, Math.max(least, Math.round(Number(faster)) || least))) : Object.hasOwn(BOONS, boon) ? BOONS[boon] : null);

        player.boons = list(vitals.boons).map((kept) => [boonOf(kept), ms(kept.left)]).filter(([boon, left]) => boon && left).map(([boon, left]) => ({ ...boon, until: now + Math.min(left, boon.ms) }));
        this.#outfit(player);

        if (Number.isFinite(vitals.hp)) {
            actor.hp = Math.max(1, Math.min(actor.maxHp, Math.round(vitals.hp)));
        }

        if (Number.isFinite(vitals.stamina)) {
            actor.stamina = Math.max(0, Math.min(actor.maxStamina, Math.round(vitals.stamina)));
        }

        for (const { kind, left, damage, look } of list(vitals.afflictions)) {
            if (AFFLICTIONS[kind] && ms(left)) {
                this.battle.afflict(id, kind, { ms: ms(left), damage: Number.isFinite(damage) && damage > 0 ? damage : null, look: typeof look === "string" ? look : null });
            }
        }

        for (const { kind, left, level, own } of list(vitals.buffs)) {
            if (SPELLS[kind]?.lasts && ms(left)) {
                this.battle.buff(id, kind, { ms: Math.min(ms(left), SPELLS[kind].lasts), by: own ? id : null, level: Number.isInteger(level) && level > 0 ? level : 1 });
            }
        }

        player.readyAt = Object.fromEntries(waits(vitals.abilities).filter(([ability]) => ABILITIES[ability]).map(([ability, wait]) => [ability, now + Math.min(ms(wait), ABILITIES[ability].cooldown)]));
        actor.spellReadyAt = now + ms(vitals.spell);
        actor.spellsReadyAt = Object.fromEntries(waits(vitals.spells).filter(([spell]) => SPELLS[spell]).map(([spell, wait]) => [spell, now + ms(wait)]));
    }

    /**
     * A player leaves: out of the battle, and their character as it's to be kept (as join takes
     * it), or null if they weren't here.
     */
    leave(id) {
        this.recorder?.(["l", id]);

        const player = this.players.get(id);

        if (!player) {
            return null;
        }

        const character = this.characterOf(player);

        for (const trade of [...this.trades.values()]) {
            if (trade.from === id || trade.to === id) {
                this.#endTrade(trade, "left");
            }
        }

        for (const follower of this.#company(id)) {
            this.battle.remove(follower);
            this.followers.delete(follower);
        }

        // (Out of their party, and their asking, or being asked, forgotten)
        this.#quit(id, "left");

        for (const [asked, invite] of [...this.invites]) {
            if (asked === id || invite.from === id) {
                this.invites.delete(asked);
            }
        }

        this.battle.remove(id);
        this.players.delete(id);
        this.#event("leave", { id, name: player.hero.name });

        return character;
    }

    /** A player's character, as it's kept (as join takes it). */
    characterOf({ id, hero, talks, explored, progress, standing }) {
        const followers = this.#company(id).map((each) => {
            const { name, calling, sex, seed, people } = this.followers.get(each);

            return { name, calling, sex, seed, people };
        });

        return { hero: { ...hero }, talks: { memory: structuredClone(talks.memory), knowledge: [...talks.knowledge] }, explored: explored.toJSON(), progress: progress.toJSON(), standing: standing.toJSON(), followers };
    }

    /** How many followers a player can lead: one, and more as their Command grows. */
    mostFollowers(playerId) {
        const player = this.players.get(playerId);

        return player ? 1 + player.progress.bonuses().followers : 0;
    }

    /**
     * Do what a player asks, if it can be done. A command is one of:
     *  - { type: "move", to: [x, y] }, { type: "ahead", facing }, { type: "engage", target }
     *    (stand: true, set on them where they stand), { type: "approach", target },
     *    { type: "enter", link }, { type: "stop" }: orders for their character in the battle
     *    (battle.js command), with run: true to run;
     *  - { type: "cast", spell, target }: cast a spell (target: an id, or none for themselves);
     *  - { type: "talk", with }: start talking to one of the folk (an id), or stop (null);
     *  - { type: "emote", emote }: show an emote (core/emotes.js EMOTES: a wave, a bow), standing;
     *  - { type: "effect", effect }: something done by talking (buying, paying, renting...), to
     *    whoever they're talking to (paid for in gold, if it has a price);
     *  - { type: "buy", item, from }: buy something ({ id, quality }) from a shopkeeper near them
     *    (an id); { type: "sell", index, to, count }: sell things (one, with no count) from the
     *    stack at `index` in their pack to one;
     *  - { type: "equip", index, to }, { type: "unequip", slot, to }: put on (or take up) gear from
     *    their pack (in a slot, `to`: a ring's hand), or take it off (into a slot of the pack,
     *    `to`); { type: "sort" }: put the pack in order; { type: "use", index }: use something in their pack (or
     *    { type: "use", item }: the first of a kind of thing in it, by its id);
     *  - { type: "arrange", from, to }: move what's in one slot of their pack to another (put
     *    together with things alike, or swapped); { type: "split", index, count, to }: split
     *    some off a stack (into slot `to`, or the first empty one);
     *  - { type: "discard", index }: throw away a stack, for good once a moment's passed;
     *    { type: "undiscard" }: take back what was just thrown away;
     *  - { type: "drop", index, count }: drop things from a stack (all of it, with no count) on
     *    the ground where they stand; { type: "pickUp", ground }: pick up something dropped
     *    (by its id), from near it;
     *  - { type: "ability", ability, target }: use an ability they've learnt (core/progress.js
     *    ABILITIES), on a target for a stronger blow (fighting it);
     *  - { type: "abandon", request }: give up a request they carry (by its id), for a little
     *    standing lost;
     *  - { type: "trade", with }: ask another player near them to trade (by id), or say yes to
     *    their asking; { type: "offer", gold, items: [{ id, quality, count }] }: what they'll
     *    give (all of it, each time); { type: "agree" }: take the other's offer for theirs (once
     *    both have, it's done); { type: "cancel", with }: call off the trade (or say no to a
     *    player's asking, or stop asking).
     * Returns { ok: true } (with what came of it, for some: an offer of work, what was handed
     * in) or { ok: false, reason } (a REFUSALS key; a spell's own reasons: spells.js
     * CAST_FAILURES). (A command that fails to be carried out is refused, told in the console,
     * rather than throwing: whoever sent it, the host or a joiner replaying it, carries on.)
     */
    command(playerId, command) {
        this.recorder?.(["c", playerId, structuredClone(command)]);

        try {
            const result = this.#command(playerId, command);

            // (A charm bought, sold, traded, dropped or picked up: what's carried counted again)
            for (const player of this.players.values()) {
                this.#charmed(player);
            }

            return result;
        } catch (error) {
            console.warn(`Refused ${command?.type} from ${playerId}: it failed.`, error);

            return refuse("command");
        }
    }

    #command(playerId, command) {
        const player = this.players.get(playerId);
        const actor = this.battle.actor(playerId);

        if (!player || !actor) {
            return refuse("player");
        }

        if (!command || typeof command.type !== "string") {
            return refuse("command");
        }

        // (Knocked off their feet: nothing but getting up, till they're up)
        if (DOWN_HELD.has(command.type) && this.battle.time < (actor.downUntil ?? 0)) {
            return refuse("down");
        }

        // (Doing anything with the world round them: seen again)
        if (SEEN.has(command.type)) {
            this.battle.unbuff(actor.id, "invisibility");
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

                return this.#order(actor, { type: command.type, target: target.id, run, ...(command.type === "engage" && command.stand ? { stand: true } : {}) });
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
            case "cast": {
                // (Only the spells they know: their schools' up to their tiers, and those learnt)
                if (!player.progress.knows(command.spell)) {
                    return refuse("unknown");
                }

                const spell = SPELLS[command.spell];
                let target = command.target ?? null;
                let at = null;

                // (Zombify: one of the wild's creatures fallen near them lately, the nearest if
                // they've named none)
                if (spell.target === "corpse") {
                    target = this.#corpseNear(actor, spell.reach, target)?.id ?? null;

                    if (target === null) {
                        return { ok: false, reason: "corpse" };
                    }
                }

                // (Wizard's Walk: somewhere on the map they've uncovered)
                if (spell.target === "place") {
                    if (!Array.isArray(command.at) || command.at.length !== 2 || !command.at.every(Number.isFinite)) {
                        return refuse("command");
                    }

                    if (!player.explored.isVisited(Math.floor(command.at[0] / CHUNK), Math.floor(command.at[1] / CHUNK))) {
                        return refuse("unexplored");
                    }

                    at = [command.at[0], command.at[1]];
                }

                return this.battle.cast(actor.id, command.spell, target, { level: player.progress.levelOf(command.spell), at });
            }
            case "summoned":
                return this.#answer(player, Boolean(command.come));
            case "party":
                return this.#partyCommand(player, command);
            case "buy":
                return this.#buy(player, actor, command);
            case "sell":
                return this.#sell(player, actor, command);
            case "equip":
                return this.#gear(player, player.progress.equip(command.index, command.to ?? null));
            case "unequip":
                return this.#gear(player, player.progress.unequip(command.slot, Number.isInteger(command.to) ? command.to : null));
            case "use":
                return this.#use(player, actor, Number.isInteger(command.index) ? command.index : player.progress.slotOf(command.item), typeof command.target === "string" ? command.target : null);
            case "arrange":
                return this.#packed(player.progress.move(command.from, command.to));
            case "sort":
                return this.#packed(player.progress.sort());
            case "split":
                return this.#packed(player.progress.split(command.index, command.count, Number.isInteger(command.to) ? command.to : undefined));
            case "discard":
                return this.#discard(player, command.index);
            case "undiscard":
                return this.#undiscard(player);
            case "drop":
                return this.#drop(player, actor, command.index, command.count);
            case "pickUp":
                return this.#pickUp(player, actor, command.ground);
            case "ability":
                return this.#ability(player, actor, command.ability, command.target ?? null);
            case "abandon":
                return this.#abandon(player, command.request);
            case "talk":
                return this.#talk(actor, command.with ?? null);
            case "order":
                return this.#orderUnit(player, command.unit, command.order);
            case "effect":
                return this.#effect(player, actor, command.effect);
            case "camp":
                return this.#camp(player, actor, command.until ?? null);
            case "emote":
                return this.#emote(actor, command.emote);
            case "trade":
                return this.#trade(player, actor, command.with);
            case "offer":
                return this.#offer(player, command);
            case "agree":
                return this.#agree(player);
            case "cancel":
                return this.#cancel(player, command.with ?? null);
            case "travel":
                return this.#travel(player, actor, command.to);
            case "table":
                return this.#atTable(player, actor, command);
            case "fieldBattle":
                return playerId === HOST_PLAYER ? this.#fieldBattle(player, actor, command.size, command.facing ?? actor.facing) : refuse("command");
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

    // The light to see by out in the world now (light.js lighting: the sky's by the war's clock,
    // and round the settlements, the war camps' fires, fires on the ground and the soldiers
    // carrying torches near the players), worked out from what every copy of the world has alike
    #light() {
        const elapsed = elapsedOf(this.war);

        if (skyLight(elapsed) >= 1) {
            return null;
        }

        const out = (actor) => actor && actor.map === "town" && !actor.dead;
        const players = [...this.players.values()].map(({ id }) => this.battle.actor(id)).filter(out).map(({ x, y }) => [x, y]);
        const dark = torchesLit(elapsed);

        return lighting({
            elapsed,
            plan: this.world.plan,
            players,
            camps: [...[...this.camps.values()].map(({ fire }) => fire), ...this.campfires.map(({ fire }) => fire)],
            fires: this.battle.hazards.filter((hazard) => hazard.kind === "fire" && hazard.map === "town"),
            torches: dark ? this.battle.actors.filter((actor) => out(actor) && carriesTorch(actor, dark)).map(({ x, y }) => [x, y]) : [],
            globes: this.battle.actors.filter((actor) => out(actor) && this.battle.buffOf(actor, "light")).map(({ x, y }) => [x, y]),
        });
    }

    /**
     * Advance the world by `ms` (the battle's whole steps: battle.js advance; the war's turns).
     * Returns what happened: the battle's events, and the host's own ("join", "leave", "open",
     * "close", "explored", "talk", "effect", "roused" (the wild's creatures put out), "trade"; "war", with each of the war's events, and "turn",
     * once each of its turns is over).
     */
    advance(ms) {
        this.recorder?.(["a", ms]);
        this.battle.light = this.#light();

        const events = this.battle.advance(ms);

        // What the players did: their skills grow by it, and they find what's on the fallen; and
        // the wonders their spells work (Zombify, Summon, Teleport...)
        for (const event of events) {
            this.#learn(event);

            if (event.type === "spell" && event.landed > 0) {
                this.#wonder(event);
            }
        }

        this.#keepUp();

        // (Asked to a party, and no answer in time: lapsed, the one who asked told)
        for (const [id, asked] of [...this.invites]) {
            if (asked.until <= this.battle.time) {
                this.invites.delete(id);
                this.#event("party", { id: asked.from, change: "unanswered", who: id, name: this.players.get(id)?.hero.name ?? "" });
                this.#event("party", { id, change: "lapsed", from: asked.from });
            }
        }

        // (Summoned, and no answer in time: resisted)
        for (const [id, asked] of [...this.summonings]) {
            if (asked.until <= this.battle.time) {
                this.summonings.delete(id);
                this.#event("summons", { id: asked.by, target: id, change: "resisted" });
                this.#event("summons", { id, by: asked.by, change: "resisted" });
            }
        }

        // Things left lying on the ground: gone after a while (a place's chest, not: #places)
        for (const [id, dropped] of this.ground) {
            if (dropped.until !== null && dropped.until <= this.battle.time) {
                this.ground.delete(id);
            }
        }

        // Trades off once the two are apart (or either's fallen), and asking forgotten after a while
        for (const trade of [...this.trades.values()]) {
            const [a, b] = [this.battle.actor(trade.from), this.battle.actor(trade.to)];

            if (!a || !b || a.dead || b.dead || !Host.#near(a, b, TRADE.apart)) {
                this.#endTrade(trade, "apart");
            } else if (!trade.open && trade.until <= this.battle.time) {
                this.#endTrade(trade, "unanswered");
            }
        }

        this.#scrutiny(ms);

        // Boons worn off (and said); and a charm come into the pack or gone from it (found on
        // the fallen), counted
        for (const player of this.players.values()) {
            this.#charmed(player);

            const ended = player.boons.filter(({ until }) => until <= this.battle.time);

            if (ended.length) {
                player.boons = player.boons.filter(({ until }) => until > this.battle.time);
                this.#outfit(player);

                for (const { id, label } of ended) {
                    this.#event("boon", { id: player.id, boon: id, label, change: "off" });
                }
            }
        }

        // Scrolls of Safety read through, and their readers carried home (fallen first: lost)
        for (const player of this.players.values()) {
            if (player.safety) {
                this.#safety(player, events);
            }
        }

        // The fallen soldiers: their garrison the fewer; taken away a while after (and the wild's
        // creatures, a perilous site's master gone a long while; the orc, felled by no one of the
        // players', a good while; a place's band, the place cleared once the last falls, after all
        // that fell with them; and a cache's guards, it opened once the last does)
        const bands = new Set();
        const kept = new Set();

        for (const event of events) {
            const beast = event.type === "death" ? this.wild.get(event.id) : null;

            if (event.type === "death" && event.id === "orc" && !this.players.has(event.by) && !this.followers.has(event.by) && !this.companions.has(event.by)) {
                const orc = this.battle.actor("orc");

                orc.respawnAt = Math.max(orc.respawnAt, this.battle.time + ORC_ROUTED_MS);
            }

            if (beast) {
                const fell = this.battle.actor(event.id);

                // (One of those roaming about the players, felled out in the world: its ground
                // cleared a while, WILDS.cleared)
                if (fell?.map === "town" && !beast.camp && !beast.lair && !beast.place && !beast.cache && !beast.dungeon && !beast.works && !this.companions.has(event.id)) {
                    this.cleared.push({ at: [fell.x, fell.y], until: this.battle.time + WILDS.cleared });
                }

                this.#fall(event.id, CORPSE_MS);
                this.#spoils(event.id, beast);

                if (beast.lair && beast.master) {
                    const heart = this.world.maps.town?.sites?.heartOf(this.#siteOf(beast.lair)) ?? this.#siteOf(beast.lair).at;
                    const lair = this.lairs.get(beast.lair);

                    this.slain[beast.lair] = this.battle.time + LAIRS[this.#siteOf(beast.lair).kind].back;
                    // (The place cleared, a while: core/places.js; its hoard, if it has one in
                    // it, opened)
                    this.war?.clearPlace(beast.lair);
                    this.#clearedBy(beast.lair, heart, lair?.maps);

                    if (lair?.hoard && this.ground.has(`chest-${beast.lair}`)) {
                        this.#opened(beast.lair, "hoard", { at: heart, maps: lair.maps, map: lair.hoard.map, square: lair.hoard.square, people: "human", tier: 1, relic: this.#siteOf(beast.lair).kind === "ruined castle" });
                    }
                }

                if (beast.place) {
                    bands.add(beast.place);
                }

                // (One of the brigands holding a works: the fewer of them, and the works won once
                // the last falls)
                if (beast.works) {
                    this.war?.loss(beast.works, this.worksOut.get(beast.works)?.share ?? 1);
                    this.#worksFell(beast.works, event.by);
                }

                if (beast.cache) {
                    kept.add(beast.cache);
                }

                if (beast.dungeon) {
                    this.#delveFell(beast, event.id);
                }
            }

            const soldier = event.type === "death" ? this.soldiers.get(event.id) : null;

            if (soldier) {
                if (soldier.leader) {
                    this.#leaderFell(soldier.leader, event.by);
                } else if (soldier.envoy) {
                    if (soldier.part === "envoy") {
                        this.#envoyFell(soldier.envoy, event.by);
                    }
                } else if (soldier.convoy) {
                    this.war?.loss(soldier.convoy, 1);
                    this.#convoyFell(soldier.convoy, event.by);
                } else if (soldier.force) {
                    // (One of an army or reserve met in the field: one of it fewer in the war)
                    this.war?.loss(soldier.force, 1, { by: this.#realmOf(event.by) });
                } else if (soldier.supply) {
                    this.#wagonFell(soldier.supply, event.by);
                } else if (soldier.works) {
                    this.war?.loss(soldier.works, this.worksOut.get(soldier.works)?.share ?? 1);
                    this.#worksFell(soldier.works, event.by);
                } else if (soldier.fort) {
                    this.war?.squadLost(soldier.fort, soldier.squad, 1);
                } else {
                    // (A town's garrison put down to the last: whose people did it hold it now)
                    const by = this.#realmOf(event.by);
                    const result = this.war?.loss(soldier.camp ?? soldier.town, soldier.share ?? this.mustered.get(soldier.town)?.share ?? 1, { by });

                    if (result === "taken") {
                        this.#event("taken", { town: soldier.town, by, people: soldier.people });
                    } else if (result === "leaders") {
                        this.#leadersOut(soldier.town, by);
                    }
                }

                this.#fall(event.id, FALLEN_MS);

                if (soldier.barracks) {
                    this.#barracksFell(soldier.town, event.by);
                }
            }

            // (A people's enemy brought down by a player, before their soldiers' eyes)
            if (event.type === "death") {
                this.#owed(event);
            }

            // (A follower fallen: gone from their company, and taken away a while after)
            if (event.type === "death" && this.followers.has(event.id)) {
                const { leader, name } = this.followers.get(event.id);

                this.followers.delete(event.id);
                this.#fall(event.id, FALLEN_MS);
                this.#event("follower", { id: leader, follower: event.id, name, change: "fallen" });
            }

            // (A companion by magic fallen: gone from their side, and taken away a while after)
            if (event.type === "death" && this.companions.has(event.id)) {
                const { leader, creature } = this.companions.get(event.id);

                this.companions.delete(event.id);
                this.#fall(event.id, FALLEN_MS);
                this.#event("companion", { id: leader, companion: event.id, creature, change: "fallen" });
            }

            // (A player through a door or up the stairs: their followers with them, unless told to wait)
            if (event.type === "cross" && this.players.has(event.id)) {
                this.#bring(event.id);
            }

            // A section of a camp's palisade hacked down: broken open (#hacked)
            if (event.type === "death" && this.battle.actor(event.id)?.kind === "stakes") {
                this.#hacked(event.id, event.by);
            }

            // A fortification struck: the less of it stands in the war (war.strike), razed at nothing
            if ((event.type === "hit" || event.type === "death") && this.fortsOut.has(event.id)) {
                const [struck, fort] = [this.battle.actor(event.id), this.war?.fort(event.id)];

                // (By a player's people, a soldier's, or any of a people's in the battle)
                const team = this.battle.actor(event.by)?.team;
                const by = this.#realmOf(event.by) ?? (this.war?.realm(team) ? team : null);

                // (Felled: all it had left, whatever the battle has of it now. Razed, let go at once,
                // as razed by them, before anything else finds it gone)
                const lost = fort && event.type === "death" ? fort.hp : struck && fort ? fort.hp - struck.hp : 0;

                if (lost > 0 && !this.war.strike(event.id, lost, by)) {
                    this.#letFortGo(event.id, { razed: true, by });
                }
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

        for (const place of bands) {
            this.#placeFell(place);
        }

        for (const cache of kept) {
            this.#cacheFell(cache);
        }

        while (this.fallen.length && this.fallen[0].at <= this.battle.time) {
            this.#gone(this.fallen.shift().id);
        }

        this.#warOn(ms);

        // (The players' camps' fires burnt out)
        if (this.campfires.length && this.campfires.some(({ until }) => until <= this.battle.time)) {
            this.campfires = this.campfires.filter(({ until }) => until > this.battle.time);
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

                // (A branch of the guild: its portal open to them from any other, from now on)
                const branch = branchOf(building, this.world.start);

                if (branch && this.players.get(event.id).explored.openPortal(branch)) {
                    this.#event("explored", { id: event.id, portal: branch });
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
            this.#townsfolk();
            this.#wilds();
            this.#watchRequests();
        }

        const own = this.events;

        this.events = [];

        return own.length ? [...events, ...own] : events;
    }

    // The war moved on `ms` (with the battle, or all at once while the host sleeps): a fallen
    // people restless enough rising where a player of theirs is, what it did told and acted on
    #warOn(ms) {
        if (!this.war) {
            return;
        }

        const turn = this.war.turn;

        for (const player of this.players.values()) {
            const realm = this.war.realm(player.realm);

            if (realm && !realm.alive && (realm.unrest ?? 0) >= RISING.ready) {
                this.war.rise(realm.id, { near: this.#whereIs(player) });
            }
        }

        const events = this.war.advance(ms);

        for (const event of events) {
            this.#event("war", { event });
            this.#fate(event);

            // (A fortification gone up or come down: the world told, and one stood up let go)
            if (event.type === "built" || event.type === "razed" || event.type === "abandoned") {
                this.#fortsChanged();

                if (event.type !== "built" && this.fortsOut.has(event.fort)) {
                    this.#letFortGo(event.fort, event.type === "razed" ? { razed: true, by: event.by } : {});
                }
            }

            // (A camp's skirmishers sent out where a player's near: out in the world)
            if (event.type === "skirmishers") {
                this.#sendSkirmishers(event);
            }

        }

        // (A camp's stockade gone up or come down, breached or mended: the world told)
        if (events.length || this.war.turn !== turn) {
            this.#stockadesChanged();
        }

        if (this.war.turn !== turn) {
            this.#scoutsSee();
            this.#event("turn", { turn: this.war.turn });
        }
    }

    // What the camps' scouts of each player's people and their friends see (war.js sight: as far
    // as SIGHT.scout round each camp that's up) uncovered on the player's maps, every chunk whose
    // middle they see, as where the player's been (docs/WAR.md *The war table*): at each turn of
    // the war, and as a player comes in
    #scoutsSee(players = this.players.values()) {
        for (const player of players) {
            if (!this.war?.realm(player.realm)) {
                continue;
            }

            let uncovered = false;

            for (const { at: [x, y], reach } of this.war.sight(player.realm).filter(({ kind }) => kind === "scout")) {
                for (let cy = Math.floor((y - reach) / CHUNK); cy <= Math.floor((y + reach) / CHUNK); cy++) {
                    for (let cx = Math.floor((x - reach) / CHUNK); cx <= Math.floor((x + reach) / CHUNK); cx++) {
                        const [mx, my] = [(cx + 0.5) * CHUNK, (cy + 0.5) * CHUNK];

                        if (hypot(mx - x, my - y) <= reach && player.explored.visit(mx, my)) {
                            uncovered = true;
                        }
                    }
                }
            }

            if (uncovered) {
                this.#event("explored", { id: player.id, scouted: true });
            }
        }
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
            random: this.random.state,
            mustered: [...this.mustered.entries()],
            worksOut: [...this.worksOut.entries()],
            townsfolk: [...this.townsfolk.entries()].map(([place, ids]) => [place, ids.map((id) => structuredClone(this.folk.get(id))).filter(Boolean)]),
            camps: [...this.camps.entries()],
            armies: [...this.armies.entries()],
            storms: [...this.storms.entries()],
            supplies: [...this.supplies.entries()],
            skirmishers: [...this.skirmishers.entries()],
            leaders: [...this.leaders.entries()],
            envoys: [...this.envoys.entries()],
            convoys: [...this.convoys.entries()],
            fortsOut: [...this.fortsOut.entries()],
            squadsOut: [...this.squadsOut.entries()],
            quartered: [...this.quartered.entries()],
            wagons: [...this.wagons.entries()],
            followers: [...this.followers.entries()],
            nextFollower: this.nextFollower,
            parties: structuredClone([...this.parties.values()]),
            invites: structuredClone([...this.invites.entries()]),
            nextParty: this.nextParty,
            hired: [...this.hired],
            wild: [...this.wild.entries()],
            cleared: structuredClone(this.cleared),
            eliteRest: [...this.eliteRest.entries()],
            nextWild: this.nextWild,
            wildCamps: [...this.wildCamps.entries()],
            lairs: [...this.lairs.entries()],
            slain: { ...this.slain },
            held: [...this.held.entries()],
            caches: structuredClone([...this.caches.entries()]),
            dungeons: structuredClone([...this.dungeons.entries()]),
            nextCache: this.nextCache,
            travel: structuredClone([...this.travel.entries()]),
            ground: structuredClone([...this.ground.values()]),
            campfires: structuredClone(this.campfires),
            nextGround: this.nextGround,
            trades: structuredClone([...this.trades.values()]),
            stocks: structuredClone([...this.stocks.entries()]),
            nextTrade: this.nextTrade,
            companions: structuredClone([...this.companions.entries()]),
            nextCompanion: this.nextCompanion,
            summonings: structuredClone([...this.summonings.entries()]),
            soldiers: [...this.soldiers.entries()],
            fielded: this.fielded,
            fallen: structuredClone(this.fallen),
            players: [...this.players.values()].map((player) => ({ id: player.id, realm: player.realm, boons: structuredClone(player.boons), readyAt: { ...player.readyAt }, discarded: structuredClone(player.discarded ?? null), safety: structuredClone(player.safety ?? null), ...this.characterOf(player), followers: undefined })),
            done: structuredClone(this.done),
        };
    }

    /**
     * The world `world` (made again from the snapshot's seed) carrying on from a snapshot: its
     * buildings' insides made again in the same order, and everyone where they were.
     */
    static restore(world, snapshot) {
        Host.#readable(snapshot);

        const host = new Host(world, { seed: snapshot.battle.seed, populate: false, war: snapshot.war });

        host.#load(snapshot);

        return host;
    }

    /**
     * This world carried on from a snapshot of it instead, in place (docs/WAR.md M11: a copy
     * that's gone astray from its host's, set right). What it's told of is told of still.
     */
    adopt(snapshot) {
        Host.#readable(snapshot);

        // (The host's ways waiting were found before it: in it already)
        this.replay?.splice(0);
        this.#reset({ seed: snapshot.battle.seed, war: snapshot.war });
        this.#load(snapshot);
    }

    /**
     * A copy of a world someone else hosts: its battle takes the ways the host's found (`replay`,
     * as they come: core/netplay.js) rather than finding its own.
     */
    replaying() {
        this.replay ??= [];
        this.#wire();
    }

    // The battle telling the recorder each way it finds, and taking the host's, replaying
    #wire() {
        this.battle.onPath = (id, way) => this.recorder?.(["v", this.battle.time, id, way]);
        this.battle.replay = this.replay;
    }

    static #readable(snapshot) {
        if (snapshot?.version !== SNAPSHOT_VERSION) {
            throw new Error(`A world kept by another version of the game (${snapshot?.version})`);
        }
    }

    // Everything as a snapshot has it (the world made again from its seed, or this one)
    #load(snapshot) {
        const host = this;
        const world = this.world;

        // (The dungeons as many times made as they were, before any's made again)
        for (const [id, { generation }] of snapshot.dungeons ?? []) {
            world.interiors?.setGeneration(`site:${id}`, generation);
        }

        for (const key of snapshot.made) {
            if (host.#building(key)) {
                world.interiors.make(key);
            }
        }

        host.battle = Battle.restore(world, snapshot.battle, { relations: (a, b) => host.#against(a, b), allied: (a, b) => host.#allied(a, b) });
        host.#wire();
        host.lookAt = snapshot.lookAt;
        host.mustered = new Map(structuredClone(snapshot.mustered ?? []));
        host.worksOut = new Map(structuredClone(snapshot.worksOut ?? []));
        host.townsfolk = new Map(
            (snapshot.townsfolk ?? []).map(([place, folk]) => {
                for (const one of folk) {
                    host.folk.set(one.id, structuredClone(one));
                }

                return [place, folk.map(({ id }) => id)];
            }),
        );
        host.camps = new Map(structuredClone(snapshot.camps ?? []));
        host.armies = new Map(structuredClone(snapshot.armies ?? []));
        host.storms = new Map(structuredClone(snapshot.storms ?? []));
        host.supplies = new Map(structuredClone(snapshot.supplies ?? []));
        host.skirmishers = new Map(structuredClone(snapshot.skirmishers ?? []));
        host.leaders = new Map(structuredClone(snapshot.leaders ?? []));
        host.envoys = new Map(structuredClone(snapshot.envoys ?? []));
        host.convoys = new Map(structuredClone(snapshot.convoys ?? []));
        host.fortsOut = new Map(structuredClone(snapshot.fortsOut ?? []));
        host.squadsOut = new Map(structuredClone(snapshot.squadsOut ?? []));
        host.quartered = new Map(structuredClone(snapshot.quartered ?? []));
        host.wagons = new Map(structuredClone(snapshot.wagons ?? []));
        host.followers = new Map(structuredClone(snapshot.followers ?? []));
        host.nextFollower = snapshot.nextFollower ?? 1;
        host.parties = new Map((snapshot.parties ?? []).map((party) => [party.id, structuredClone(party)]));
        host.partyIds = new Map([...host.parties.values()].flatMap(({ id, members }) => members.map((member) => [member, id])));
        host.invites = new Map(structuredClone(snapshot.invites ?? []));
        host.nextParty = snapshot.nextParty ?? 1;
        host.hired = new Set(snapshot.hired ?? []);
        host.wild = new Map(structuredClone(snapshot.wild ?? []));
        host.cleared = structuredClone(snapshot.cleared ?? []);
        host.eliteRest = new Map(snapshot.eliteRest ?? []);
        host.nextWild = snapshot.nextWild ?? 1;
        host.wildCamps = new Map(structuredClone(snapshot.wildCamps ?? []));
        host.lairs = new Map(structuredClone(snapshot.lairs ?? []));
        host.slain = { ...(snapshot.slain ?? {}) };
        host.held = new Map(structuredClone(snapshot.held ?? []));
        host.caches = new Map(structuredClone(snapshot.caches ?? []));
        host.dungeons = new Map(structuredClone(snapshot.dungeons ?? []));
        host.nextCache = snapshot.nextCache ?? 1;
        host.travel = new Map(structuredClone(snapshot.travel ?? []));
        host.ground = new Map((snapshot.ground ?? []).map((dropped) => [dropped.id, structuredClone(dropped)]));
        host.nextGround = snapshot.nextGround ?? 1;
        host.campfires = structuredClone(snapshot.campfires ?? []);
        host.trades = new Map((snapshot.trades ?? []).map((trade) => [trade.id, structuredClone(trade)]));
        host.nextTrade = snapshot.nextTrade ?? 1;
        host.stocks = new Map(structuredClone(snapshot.stocks ?? []));
        host.companions = new Map(structuredClone(snapshot.companions ?? []));
        host.nextCompanion = snapshot.nextCompanion ?? 1;
        host.summonings = new Map(structuredClone(snapshot.summonings ?? []));
        host.soldiers = new Map(structuredClone(snapshot.soldiers ?? []));
        host.fielded = snapshot.fielded ?? 0;
        host.fallen = structuredClone(snapshot.fallen ?? []);
        host.done = structuredClone(snapshot.done);

        for (const one of world.folk ?? []) {
            host.folk.set(one.id, one);
        }

        for (const key of snapshot.open) {
            const building = world.interiors.buildings.get(key);

            host.#enthrone(building);
            host.open.set(key, building.folk.filter(({ id }) => !host.hired.has(id)).map(({ id }) => id));

            for (const one of building.folk.filter(({ id }) => !host.hired.has(id))) {
                host.folk.set(one.id, one);
            }
        }

        for (const { id, realm, hero, talks, explored, progress, standing, boons, readyAt, discarded, safety } of snapshot.players) {
            const kept = new Progress(progress, hero);

            // (Outfitted as they were: their actor's carried on as it was, charms and all)
            host.players.set(id, { id, realm, hero, talks: { memory: talks.memory, knowledge: new Set(talks.knowledge) }, explored: new Explored(explored), progress: kept, standing: new Standing(standing), boons: structuredClone(boons ?? []), readyAt: { ...readyAt }, discarded: structuredClone(discarded ?? null), safety: structuredClone(safety ?? null), offers: {}, charms: charmsOf(kept) });
        }

        host.random.state = snapshot.random ?? host.random.state;
    }

    /**
     * A number that tells two copies of a world apart (docs/WAR.md M11: whether one that's
     * joined has gone astray from its host's): the battle's time, and everyone in it, where they
     * are and how they are; the war's turn and clock; what's on the ground, and in each pack.
     */
    checksum() {
        let sum = 2166136261;

        const mix = (value) => {
            sum = Math.imul(sum ^ (value | 0), 16777619) >>> 0;
        };

        mix(this.battle.time);
        mix(this.battle.actors.length);

        for (const actor of this.battle.actors) {
            for (let k = 0; k < actor.id.length; k++) {
                mix(actor.id.charCodeAt(k));
            }

            mix(Math.round(actor.x * 1000));
            mix(Math.round(actor.y * 1000));
            mix(Math.round(actor.hp * 100));
            mix(actor.dead ? 1 : 0);
        }

        mix(this.war?.turn ?? 0);
        mix(Math.round(this.war?.clock ?? 0));
        mix(this.players.size);
        mix(this.ground.size);

        mix(this.trades.size);

        for (const { day, sold, special } of this.stocks.values()) {
            mix(day);
            mix(Object.values(sold).reduce((sum, count) => sum + count, special ? 1 : 0));
        }

        for (const player of this.players.values()) {
            mix(player.progress.gold);

            for (const stack of player.progress.pack) {
                mix(stack?.count ?? 0);
            }
        }

        return sum;
    }

    // --- Growing stronger (core/progress.js) ---

    // A player's skill grows: each rank it comes to told of ("rank"), and what it brings put on
    #gain(player, tree, amount) {
        if (!player || !(amount > 0)) {
            return;
        }

        const ups = player.progress.gain(tree, amount);

        for (const up of ups) {
            this.#event("rank", { id: player.id, ...up });
        }

        if (ups.length) {
            this.#outfit(player);
        }

        // (Using the body: quicker on the feet too)
        if (BODILY.has(tree)) {
            this.#gain(player, "evasion", amount * XP.evasion);
        }
    }

    // A school of magic grows (by `amount`): each tier it comes to, its spell told of ("tier")
    #school(player, school, amount) {
        for (const spell of player.progress.growSchool(school, amount)) {
            this.#event("tier", { id: player.id, school, spell, tier: SPELLS[spell].tier });
        }
    }

    // What happened in the battle, for the players' skills: blows landed (up close, from afar)
    // and taken, heals, stuns, running out of breath; and what's on those they fell
    #learn(event) {
        // (What a player's followers do, their leader's: their Command grows by it, and what they
        // bring down counts for them)
        const leads = this.followers.get(event.by);

        if (leads && (event.type === "hit" || event.type === "death")) {
            const leader = this.players.get(leads.leader);

            if (event.type === "hit") {
                this.#gain(leader, "command", event.damage * XP.command);
            }

            if (event.type === "death") {
                const fallen = this.battle.actor(event.id);

                if (leader && fallen && !this.players.has(fallen.id) && fallen.kind !== "follower") {
                    this.#credit(leader, fallen);
                }
            }

            return;
        }

        // (What a creature called to a player's side, or raised from the dead, brings down counts
        // for the player too: what's on it theirs, and their requests)
        const called = this.companions.get(event.by);

        if (called) {
            const leader = this.players.get(called.leader);
            const fallen = event.type === "death" ? this.battle.actor(event.id) : null;

            if (leader && fallen && !this.players.has(fallen.id) && fallen.kind !== "follower" && !this.companions.has(fallen.id)) {
                this.#credit(leader, fallen);
            }

            return;
        }

        const by = this.players.get(event.by);
        const own = this.players.get(event.id);

        switch (event.type) {
            case "hit":
                // (A spell's: its school grows by it landing, below)
                if (!event.spell) {
                    this.#gain(by, event.projectile === null ? "blade" : "marksman", event.damage);
                }

                this.#gain(own, "endurance", event.damage);
                break;
            case "spell": {
                // A spell of a school landing (healing someone, or striking): the school grows,
                // the more for a spell of a higher tier
                const spell = SPELLS[event.spell];
                const caster = this.players.get(event.id);

                if (caster && spell?.school && event.landed > 0) {
                    this.#school(caster, spell.school, SPELL_XP * spell.tier);
                }

                // (A spell that grows as it's used: Vampirism, Dodge, Poison)
                const grown = caster && event.landed > 0 ? caster.progress.growSpell(event.spell, SPELL_XP) : null;

                if (grown) {
                    this.#event("grown", { id: caster.id, spell: event.spell, level: grown });
                }

                break;
            }
            case "stunned":
                // (Stunning with a hex: not a spell of the air's that stuns as it strikes; a shield
                // bash grows the knack with a shield)
                if (event.ability === "shieldBash") {
                    this.#gain(by, "shield", XP.stun);
                } else if (!SPELLS[event.spell]?.school) {
                    this.#gain(by, "hexes", XP.stun);
                }

                break;
            case "exhausted":
                this.#gain(own, "endurance", XP.exhausted);
                break;
            case "dodged":
                // (Slipping a blow, by the knack or a spell: the knack grows)
                this.#gain(own, "evasion", XP.dodged);
                break;
            case "blocked":
                // (Catching a blow on a shield: the knack grows)
                this.#gain(own, "shield", XP.blocked);
                break;
            case "death": {
                const fallen = this.battle.actor(event.id);

                if (by && fallen && !this.players.has(fallen.id)) {
                    this.#credit(by, fallen);
                }

                break;
            }
            default:
                break;
        }
    }

    // A foe a player (or one of theirs) has felled: what's on it theirs, and it counts for their
    // requests; and the same for each of their party near it (PARTY.reach, on its map, standing),
    // each finding their own on it, and each as much the stronger for it as it had hit points (in
    // their own weapon's skill: a bow's marksman, anything else's blade)
    #credit(player, fallen) {
        this.#loot(player, fallen);
        this.#felled(player, fallen);

        for (const id of this.fellows(player.id)) {
            const fellow = this.players.get(id);
            const actor = this.battle.actor(id);

            if (!fellow || !actor || actor.dead || actor.map !== fallen.map || hypot(actor.x - fallen.x, actor.y - fallen.y) > PARTY.reach) {
                continue;
            }

            this.#loot(fellow, fallen);
            this.#felled(fellow, fallen);
            this.#gain(fellow, WEAPONS[actor.weapon]?.attacks.some(({ kind }) => kind === "ranged") ? "marksman" : "blade", fallen.maxHp ?? 0);
        }
    }

    // What a player finds on a foe they've felled: gold, and things (into their pack, while there's room)
    #loot(player, fallen) {
        const { gold, items } = rollLoot(fallen.kind, this.random, fallen.kind === "soldier" ? { people: fallen.team } : {});
        const kept = items.filter((item) => player.progress.stow(item));

        if (!gold && !kept.length) {
            return;
        }

        const found = this.#fortune(player, gold);

        player.progress.gold += found;
        this.#event("loot", { id: player.id, from: fallen.id, gold: found, items: kept });
    }

    // A player's character in the battle as their skills, gear and boons have them: the weapon
    // they wield, how strong their blows, heals and stuns are, their armour, their hit points and
    // stamina; and the war as mighty as the mightiest player
    // Outfitted again if the charms that count in their pack (progress.js charms) aren't those
    // they were last outfitted with
    #charmed(player) {
        if (player.charms !== charmsOf(player.progress)) {
            this.#outfit(player);
        }
    }

    #outfit(player) {
        const actor = this.battle.actor(player.id);

        if (!actor) {
            return;
        }

        const bonus = player.progress.bonuses();

        for (const boon of player.boons) {
            for (const key of ["melee", "ranged", "heal", "stun", "spell", "armor"]) {
                bonus[key] += boon[key] ?? 0;
            }
        }

        const weapon = weaponOf(player.progress);
        const kicks = player.progress.kicks();

        if (actor.weapon !== weapon || actor.boots !== (kicks || weapon === "boots")) {
            this.battle.rearm(actor.id, weapon, kicks && weapon !== "boots");
            player.hero.weapon = weapon;
            player.hero.boots = kicks;
        }

        // (In a people's uniform, passing for one of their soldiers: not their own)
        const guise = player.progress.disguise();
        const passing = guise && guise !== player.realm ? guise : null;

        if ((actor.guise ?? null) !== passing) {
            actor.guise = passing;
            this.#event("disguise", { id: player.id, people: passing, change: passing ? "on" : "off" });
        }

        actor.power = { melee: 1 + bonus.melee, ranged: 1 + bonus.ranged, heal: 1 + bonus.heal, stun: 1 + bonus.stun, spell: 1 + bonus.spell, bash: 1 + bonus.bash };
        actor.armor = Math.min(ARMOR_CAP, bonus.armor);
        // (An oil on their weapon, what it leaves on what it strikes; the charms they carry: how
        // much less each element's harm, and running's toll: core/goods.js)
        actor.oil = player.boons.find(({ oil }) => oil)?.oil ?? null;
        actor.wards = { fire: bonus.wardFire, water: bonus.wardWater, air: bonus.wardAir, earth: bonus.wardEarth, magic: bonus.wardMagic };
        actor.endurance = bonus.endurance;
        player.charms = charmsOf(player.progress);
        actor.dodge = bonus.dodge;
        actor.shield = player.progress.guard(bonus);

        // (And a boon that multiplies the breath, a Stamina Boost: twice as much, while it lasts;
        // or how fast it comes back, an afterglow)
        const breath = player.boons.reduce((times, { staminaTimes = 1 }) => times * staminaTimes, 1);

        actor.recovery = player.boons.reduce((times, { recoveryTimes = 1 }) => times * recoveryTimes, 1);
        const [hp, stamina] = [KINDS.player.hp + bonus.hp, Math.round((KINDS.player.hp + bonus.stamina) * breath)];

        if (actor.maxHp !== hp) {
            actor.hp = actor.dead ? 0 : Math.max(1, Math.round((actor.hp * hp) / actor.maxHp));
            actor.maxHp = hp;
        }

        if (actor.maxStamina !== stamina) {
            actor.stamina = Math.round((actor.stamina * stamina) / actor.maxStamina);
            actor.maxStamina = stamina;
        }

        this.war?.setMight(Math.max(0, ...[...this.players.values()].map((each) => each.progress.might())));
    }

    // The shopkeeper a player's trading with (an id): one of the folk who keeps a shop, near them
    #shopkeeper(actor, id) {
        const keeper = this.battle.actor(id);
        const shop = keeper && (this.folk.get(keeper.id)?.shop ?? SHOPKEEPERS[keeper.role]);

        if (!shop || keeper.dead || keeper.map !== actor.map || distanceBetween(actor.square, keeper.square) > SHOP_REACH) {
            return null;
        }

        return { keeper, shop, people: this.folk.get(keeper.id)?.people ?? "human" };
    }

    // Players passing for one of a people's soldiers, looked at by those near them: now and then
    // one sees through it (the nearer, the likelier), and they're all told
    #scrutiny(ms) {
        for (const player of this.players.values()) {
            const actor = this.battle.actor(player.id);

            // (Seen through by striking one of them: told once)
            if (actor?.guise && (actor.unmasked ?? -Infinity) > this.battle.time && player.seenThrough !== actor.unmasked) {
                player.seenThrough = actor.unmasked;
                this.#event("disguise", { id: player.id, people: actor.guise, change: "known" });
            }

            if (!actor?.guise || actor.dead || !this.battle.passes(actor, { team: actor.guise })) {
                continue;
            }

            const watcher = this.battle.actors.find((other) => other.kind === "soldier" && other.team === actor.guise && !other.dead && other.map === actor.map && distanceBetween(other.square, actor.square) <= SCRUTINY.reach && this.battle.canSee(other, actor));

            if (watcher && this.random.chance(SCRUTINY.chance * (ms / 1000) * (distanceBetween(watcher.square, actor.square) <= 1.5 ? 2 : 1))) {
                this.battle.unmask(actor);
                player.seenThrough = actor.unmasked;
                this.#event("disguise", { id: player.id, people: actor.guise, change: "seen", by: watcher.id });
            }
        }
    }

    // A piece of gear as it's made for a player (bought, given): with what's rolled on it (core/
    // gear.js), and a wand's or grimoire's boost
    #made(ware) {
        return madeOf(ware, this.random);
    }

    /**
     * What a shop with a daily stock (progress.js SHOPS `daily`) kept by one of the folk (`keeper`:
     * their id) has in today, as it is now: { key (its stockKey), day, wares: [{ id, quality,
     * count, left, people? }], special (the thing it is, made), specialLeft (whether it's still
     * to be had) }; or null, for anyone else.
     */
    stockOf(keeper) {
        const folk = this.folk.get(keeper);
        const shop = folk?.shop ?? SHOPKEEPERS[folk?.role ?? this.battle.actor(keeper)?.role];

        if (!SHOPS[shop]?.daily) {
            return null;
        }

        const key = stockKey(keeper);
        const day = dayOf(elapsedOf(this.war));
        const { wares: shelves, special } = dailyStock(shop, { seed: this.world.seed ?? 1, key, day, people: folk?.people ?? "human" });
        const kept = this.stocks.get(key);
        const today = kept?.day === day ? kept : { sold: {}, special: false };

        return { key, day, shop, wares: shelves.map((ware) => ({ ...ware, left: ware.count - (today.sold[wareKey(ware)] ?? 0) })), special, specialLeft: Boolean(special) && !today.special };
    }

    // Something sold from a shop's daily stock (or its special), kept as sold for the rest of the day
    #sold({ key, day }, ware) {
        const kept = this.stocks.get(key);
        const today = kept?.day === day ? kept : { day, sold: {}, special: false };

        if (ware) {
            today.sold[wareKey(ware)] = (today.sold[wareKey(ware)] ?? 0) + 1;
        } else {
            today.special = true;
        }

        this.stocks.set(key, today);
    }

    // Something bought from a shop: what it has (a blacksmith's as well made as the buyer is
    // mighty), or in today (a shop with a daily stock: while there's any left, for everyone who
    // plays together), or its daily special (`special`: the one thing, once), for what it asks
    #buy(player, actor, { item, from, special = false }) {
        const trading = this.#shopkeeper(actor, from);

        if (!trading) {
            return refuse("far");
        }

        const stock = this.stockOf(trading.keeper.id);
        const same = (ware) => ware.id === item?.id && ware.quality === (item?.quality ?? "common");
        const ware = special ? stock?.special : stock ? stock.wares.find(same) : wares(trading.shop, trading.people, { might: player.progress.might() }).find(same);

        if (!ware) {
            return refuse("shop");
        }

        if (special ? !stock.specialLeft : stock && ware.left < 1) {
            return refuse("soldOut");
        }

        const price = shopPrice(special ? ware : { id: ware.id, quality: ware.quality }, trading.shop, { haggle: player.progress.bonuses().haggle, special });

        if (price > player.progress.gold) {
            return refuse("gold");
        }

        // (The special as it is, its rolls on it already; anything else's rolled as it's bought: a
        // wand's or grimoire's boost, rarely high; better made gear's bonuses)
        const bought = special ? structuredClone(ware) : this.#made(ware);

        if (!player.progress.stow(bought)) {
            return refuse("full");
        }

        if (stock) {
            this.#sold(stock, special ? null : ware);
        }

        player.progress.gold -= price;
        this.#gain(player, "trade", price * XP.trade);
        this.#event("bought", { id: player.id, item: bought, price, from: trading.keeper.id, ...(special ? { special: true } : {}) });

        return OK;
    }

    #sell(player, actor, { index, to, count = 1 }) {
        const trading = this.#shopkeeper(actor, to);
        const stack = player.progress.pack[index];

        if (!trading) {
            return refuse("far");
        }

        if (!stack) {
            return refuse("item");
        }

        // (The creatures' parts, and tomes: only the adventurers' guild buys those)
        if (!buys(trading.shop, stack.id)) {
            return refuse("wanted");
        }

        const price = priceOf(stack, { haggle: player.progress.bonuses().haggle, selling: true }) * count;
        const item = player.progress.take(index, count);

        if (!item) {
            return refuse("count");
        }

        player.progress.gold += price;
        this.#gain(player, "trade", price * XP.trade);
        this.#event("sold", { id: player.id, item: { id: item.id, quality: item.quality }, count, price, to: trading.keeper.id });

        return OK;
    }

    // Things in the pack moved or split (the reason they couldn't be: progress.js move, split)
    #packed(why) {
        return why ? refuse(why) : OK;
    }

    // A stack thrown away: gone, but kept a moment to take back
    #discard(player, index) {
        const item = player.progress.take(index);

        if (!item) {
            return refuse("item");
        }

        player.discarded = { item, index, until: this.battle.time + UNDO_MS };
        this.#event("discarded", { id: player.id, item });

        return { ok: true, item };
    }

    // What was just thrown away, taken back: where it was, if that's free (or has things alike),
    // or wherever there's room
    #undiscard(player) {
        const kept = player.discarded;
        const pack = player.progress.pack;

        if (!kept || kept.until < this.battle.time) {
            return refuse("undo");
        }

        if (!pack[kept.index] || alike(pack[kept.index], kept.item)) {
            pack[kept.index] = { ...kept.item, count: kept.item.count + (pack[kept.index]?.count ?? 0) };
        } else if (!player.progress.stow(kept.item, kept.item.count)) {
            return refuse("full");
        }

        player.discarded = null;

        return OK;
    }

    // Things dropped on the ground where the player stands, for anyone to pick up a while
    #drop(player, actor, index, count) {
        const stack = player.progress.pack[index];

        if (actor.dead) {
            return refuse("dead");
        }

        if (!stack) {
            return refuse("item");
        }

        const item = player.progress.take(index, count ?? stack.count);

        if (!item) {
            return refuse("count");
        }

        const id = `ground-${this.nextGround++}`;

        this.ground.set(id, { id, item, map: actor.map, square: [...actor.square], until: this.battle.time + GROUND_MS, by: player.id });
        this.#event("dropped", { id: player.id, ground: id, item });

        return { ok: true, ground: id };
    }

    // Something on the ground picked up, from near it, into the pack (if there's room)
    #pickUp(player, actor, id) {
        const dropped = this.ground.get(id);

        // (Someone else's spoils: not there, for them)
        if (!dropped || (dropped.for && dropped.for !== player.id)) {
            return refuse("gone");
        }

        if (actor.dead) {
            return refuse("dead");
        }

        if (dropped.map !== actor.map || hypot(actor.x - dropped.square[0] - 0.5, actor.y - dropped.square[1] - 0.5) > PICK_REACH) {
            return refuse("far");
        }

        // (A place's chest, or a cache, its guardians still about; a dungeon's hoard, its boss)
        if (dropped.locked) {
            return refuse(dropped.cache ? "guarded" : dropped.hoard ? "kept" : "locked");
        }

        // (A dungeon's chest: opened, a share in it for each player there)
        if (dropped.chest && dropped.dungeon) {
            return this.#openDungeonChest(dropped);
        }

        // (A bundle of a creature's spoils: its gold, and each thing there's room for; what
        // there isn't stays in it)
        if (dropped.bundle) {
            const { gold, items } = dropped.bundle;
            const got = items.filter((item) => player.progress.stow(item, item.count));
            const left = items.filter((item) => !got.includes(item));

            if (!gold && !got.length) {
                return refuse("full");
            }

            player.progress.gold += this.#fortune(player, gold);
            dropped.bundle = { gold: 0, items: left };

            if (!left.length) {
                this.ground.delete(id);
            }

            this.#event("picked", { id: player.id, ground: id, bundle: { gold, items: got }, left: left.length, from: dropped.from ?? null });

            return left.length ? { ok: true, left: left.length } : OK;
        }

        if (!player.progress.stow(dropped.item, dropped.item.count)) {
            return refuse("full");
        }

        this.ground.delete(id);
        this.#event("picked", { id: player.id, ground: id, item: dropped.item });

        return OK;
    }

    // --- Trading face to face ---

    // Two in the battle within `reach` of each other, on the same map
    static #near(a, b, reach) {
        return a.map === b.map && hypot(a.x - b.x, a.y - b.y) <= reach;
    }

    // The trade a player's in (said yes to by both), if any
    #tradeOf(playerId) {
        return [...this.trades.values()].find((trade) => trade.open && (trade.from === playerId || trade.to === playerId)) ?? null;
    }

    // Tell both players in a trade how it's going (a "trade" event each: its `change`)
    #tellTrade(trade, change, details = {}) {
        for (const [one, other] of [[trade.from, trade.to], [trade.to, trade.from]]) {
            this.#event("trade", { id: one, with: other, name: this.players.get(other)?.hero.name ?? null, trade: trade.id, from: trade.from, change, ...details });
        }
    }

    // Ask another player to trade: or, if they've asked already, it's begun
    #trade(player, actor, withId) {
        const other = this.players.get(withId);
        const them = other && this.battle.actor(other.id);

        if (!them || other === player) {
            return refuse("target");
        }

        if (actor.dead || them.dead) {
            return refuse("dead");
        }

        if (!Host.#near(actor, them, TRADE.reach)) {
            return refuse("far");
        }

        if (this.#tradeOf(player.id)) {
            return refuse("trading");
        }

        if (this.#tradeOf(other.id)) {
            return refuse("elsewhere");
        }

        const asked = [...this.trades.values()].find((trade) => trade.from === other.id && trade.to === player.id);

        // (They'd asked: it's begun, with nothing offered yet, and neither's asking anyone else)
        if (asked) {
            for (const trade of [...this.trades.values()]) {
                if (trade !== asked && (trade.from === player.id || trade.from === other.id)) {
                    this.trades.delete(trade.id);
                }
            }

            Object.assign(asked, { open: true, until: null, offers: { [other.id]: { gold: 0, items: [] }, [player.id]: { gold: 0, items: [] } }, agreed: { [other.id]: false, [player.id]: false } });
            this.#tellTrade(asked, "open");

            return { ok: true, trade: asked.id, open: true };
        }

        // (Asking: whoever they'd asked before is asked no longer)
        for (const trade of [...this.trades.values()]) {
            if (trade.from === player.id) {
                this.trades.delete(trade.id);
            }
        }

        const trade = { id: `trade-${this.nextTrade++}`, from: player.id, to: other.id, open: false, until: this.battle.time + TRADE.asking, offers: {}, agreed: {} };

        this.trades.set(trade.id, trade);
        this.#tellTrade(trade, "asked");

        return { ok: true, trade: trade.id, open: false };
    }

    // What a player will give, in place of what they offered before: gold, and things from their
    // pack (as many as they have of each, of each make). Neither's agreed to it yet.
    #offer(player, { gold = 0, items = [] }) {
        const trade = this.#tradeOf(player.id);

        if (!trade) {
            return refuse("trade");
        }

        if (!whole(gold) || gold < 0 || !Array.isArray(items)) {
            return refuse("command");
        }

        if (gold > player.progress.gold) {
            return refuse("gold");
        }

        const offered = [];

        for (const each of items) {
            const { id, quality = "common", count, boost = null } = each ?? {};

            if (!ITEMS[id] || !QUALITIES[quality] || !whole(count) || count < 1 || (boost !== null && !Number.isFinite(boost))) {
                return refuse("item");
            }

            // (A wand or a grimoire: that very one, by its boost)
            const same = offered.find((item) => item.id === id && item.quality === quality && (item.boost ?? null) === boost);

            if (same) {
                same.count += count;
            } else {
                offered.push({ id, quality, count, ...(boost === null ? {} : { boost }) });
            }
        }

        if (offered.some(({ id, quality, count, boost = null }) => player.progress.held(id, quality, boost) < count)) {
            return refuse("count");
        }

        trade.offers[player.id] = { gold, items: offered };
        trade.agreed = { [trade.from]: false, [trade.to]: false };
        this.#tellTrade(trade, "offer", { by: player.id });

        return OK;
    }

    // A player takes the other's offer for theirs: once both have, what's offered changes hands
    #agree(player) {
        const trade = this.#tradeOf(player.id);

        if (!trade) {
            return refuse("trade");
        }

        const other = trade.from === player.id ? trade.to : trade.from;

        trade.agreed[player.id] = true;

        if (!trade.agreed[other]) {
            this.#tellTrade(trade, "agreed", { by: player.id });

            return OK;
        }

        const swapped = this.#swap(trade);

        // (It couldn't be done: neither's agreed now, and why's said)
        if (!swapped.given) {
            trade.agreed = { [trade.from]: false, [trade.to]: false };
            this.#tellTrade(trade, "failed", { reason: swapped.reason, short: swapped.short });

            return refuse(swapped.reason === "full" && swapped.short !== player.id ? "theirs" : swapped.reason);
        }

        this.trades.delete(trade.id);

        for (const [one, from] of [[trade.from, trade.to], [trade.to, trade.from]]) {
            this.#event("trade", { id: one, with: from, name: this.players.get(from)?.hero.name ?? null, trade: trade.id, from: trade.from, change: "done", got: swapped.given[from], gave: swapped.given[one] });
        }

        return OK;
    }

    // What each offered, changing hands at once: or, if either hasn't it all now or hasn't room
    // for what they're given, nothing at all. Returns { given (by player: { gold, items }) }, or
    // { reason, short (whose pack it was) }.
    #swap(trade) {
        const both = [this.players.get(trade.from), this.players.get(trade.to)];
        const before = both.map(({ progress }) => ({ gold: progress.gold, pack: progress.pack.map((stack) => stack && { ...stack }) }));
        const undo = (reason, short) => {
            both.forEach(({ progress }, index) => Object.assign(progress, before[index]));

            return { reason, short };
        };
        const given = {};

        for (const { id, progress } of both) {
            const { gold, items } = trade.offers[id] ?? { gold: 0, items: [] };

            if (progress.gold < gold || !items.every((item) => progress.remove(item.id, item.count, item.quality, item.boost ?? null))) {
                return undo("changed", id);
            }

            progress.gold -= gold;
            given[id] = { gold, items: items.map((item) => ({ ...item })) };
        }

        for (const [{ id, progress }, { id: from }] of [both, [...both].reverse()]) {
            progress.gold += given[from].gold;

            if (!given[from].items.every((item) => progress.stow(item, item.count))) {
                return undo("full", id);
            }
        }

        return { given };
    }

    // A player calls off their trade, or stops asking, or says no to another's asking (`with`)
    #cancel(player, withId) {
        const theirs = (trade) => trade.from === player.id || trade.to === player.id;
        const trade = [...this.trades.values()].find((each) => theirs(each) && (withId === null ? each.open || each.from === player.id : each.from === withId || each.to === withId));

        if (!trade) {
            return refuse("trade");
        }

        this.#endTrade(trade, "cancelled", player.id);

        return OK;
    }

    // A trade (or the asking) at an end, nothing changing hands: why ("cancelled", `by` whom;
    // "apart", "unanswered", "left")
    #endTrade(trade, why, by = null) {
        this.trades.delete(trade.id);
        this.#tellTrade(trade, "off", { why, by, open: trade.open });
    }

    // What each player near a creature when it fell finds on it (spoils.js): their own bundle,
    // rolled for them alone and seen by them alone (the ground's `for`), there to pick up a while;
    // on an elite, more, and its prize (spoils.js ELITE_SPOILS, caches.js elitePrize)
    #spoils(id, beast) {
        const fallen = this.battle.actor(id);

        if (!fallen) {
            return;
        }

        const least = CREATURES[beast.creature]?.tiers[0] ?? beast.tier;
        const elite = beast.elite === "lead";

        for (const player of this.players.values()) {
            const actor = this.battle.actor(player.id);

            if (!actor || actor.dead || actor.map !== fallen.map || hypot(actor.x - fallen.x, actor.y - fallen.y) > SPOILS_REACH) {
                continue;
            }

            const bundle = rollSpoils(beast.creature, beast.tier, this.random, least, { elite });

            if (elite) {
                bundle.items.push(elitePrize(beast.tier, this.random, { people: (fallen.map === "town" && landAt(this.world.plan, fallen.x, fallen.y).race) || "human" }));
            }

            if (!bundle.gold && !bundle.items.length) {
                continue;
            }

            const ground = `ground-${this.nextGround++}`;

            this.ground.set(ground, { id: ground, bundle, for: player.id, from: beast.creature, map: fallen.map, square: [...fallen.square], until: this.battle.time + GROUND_MS });
            this.#event("spoils", { id: player.id, ground, from: id, creature: beast.creature });
        }
    }

    // Gear put on or taken off (the reason it couldn't be: progress.js equip, unequip)
    #gear(player, why) {
        if (why) {
            return refuse(why);
        }

        this.#outfit(player);
        this.#event("gear", { id: player.id, weapon: player.hero.weapon, worn: player.progress.worn() });

        return OK;
    }

    // Something from the pack used (drunk, eaten; a tome or a scroll read, on `target` if it's
    // a spell's): one off its stack
    #use(player, actor, index, target = null) {
        const stack = player.progress.pack[index];
        const use = stack && ITEMS[stack.id].use;

        if (!use) {
            return refuse("item");
        }

        if (actor.dead) {
            return refuse("dead");
        }

        // (A tome: its spell learnt at once, and the tome gone; unless it's known already)
        if (use.learn) {
            if (player.progress.knows(use.learn)) {
                return refuse("known");
            }

            const item = player.progress.take(index, 1);

            player.progress.learn(use.learn);
            this.#event("used", { id: player.id, item });
            this.#event("learnt", { id: player.id, spell: use.learn });

            return OK;
        }

        // (A cure: only for what's on them, and all its draught cures)
        const cures = use.cure ? curedWith(use.cure) : [];

        if (use.cure && !actor.afflictions.some(({ kind }) => cures.includes(kind))) {
            return refuse("unafflicted");
        }

        // (A boon in a bottle, a Stamina Boost: one at a time, and one oil on a weapon at a time;
        // and a Scroll of Safety)
        if (use.boon && player.boons.some(({ id, oil }) => id === use.boon.id || (oil && use.boon.oil))) {
            return refuse("boosted");
        }

        // (A spell's scroll: the spell cast as its reader would (refused, the scroll's kept), on
        // the foe they've named or are set on, or the nearest they can see in its reach)
        if (use.cast) {
            const spell = SPELLS[use.cast];
            const foe = spell.target === "enemy" ? (target ?? actor.order?.target ?? actor.target ?? this.#foeNear(actor, spell.reach)?.id ?? null) : target;
            const cast = this.battle.cast(actor.id, use.cast, foe, { level: 1 });

            if (!cast.ok) {
                return cast;
            }

            const item = player.progress.take(index, 1);

            this.#event("used", { id: player.id, item });

            return cast;
        }

        // (A bomb: thrown at the foe they've named or are set on, or the nearest they can see in
        // its reach (refused, it's kept: none, too far, or they can't throw just now))
        if (use.bomb) {
            const foe = target ?? actor.order?.target ?? actor.target ?? this.#foeNear(actor, use.reach)?.id ?? null;
            const thrown = this.battle.lob(actor.id, foe, { kind: use.bomb, damage: use.damage, reach: use.reach });

            if (!thrown.ok) {
                return thrown;
            }

            const item = player.progress.take(index, 1);

            this.#event("used", { id: player.id, item });

            return thrown;
        }

        if (use.safety && player.safety) {
            return refuse("reading");
        }

        const item = player.progress.take(index, 1);

        for (const kind of cures) {
            this.battle.cure(actor.id, kind);
        }

        // (A warding elixir: its ward's spell on them a while; a phial of shadows or a glowcap
        // draught, Invisibility's or Light's)
        if (use.ward || use.buff) {
            this.battle.buff(actor.id, use.ward ?? use.buff, { ms: use.ms, by: actor.id });
        }

        if (use.boon) {
            player.boons = [...player.boons, { ...use.boon, until: this.battle.time + use.boon.ms }];
            this.#outfit(player);
            this.#event("boon", { id: player.id, boon: use.boon.id, label: use.boon.label, change: "on" });
        }

        if (use.safety) {
            player.safety = { until: this.battle.time + SAFETY.ms };
            this.#event("safety", { id: player.id, change: "reading", ms: SAFETY.ms });
        }

        this.battle.mend(actor.id, { hp: use.heal ?? 0, stamina: use.stamina ?? 0 });
        this.#event("used", { id: player.id, item });

        return OK;
    }

    // An ability learnt: a greater spell cast, or the next blow made stronger (and a target
    // fought, if one's given); each blow's ability ready again only after a while
    #ability(player, actor, id, target) {
        const ability = ABILITIES[id];

        if (!ability || !player.progress.abilities().includes(id)) {
            return refuse("unknown");
        }

        if (ability.spell) {
            return this.battle.cast(actor.id, ability.spell, target);
        }

        if (actor.dead) {
            return refuse("dead");
        }

        if ((player.readyAt[id] ?? 0) > this.battle.time) {
            return refuse("cooldown");
        }

        // (A blow up close with a weapon for it; a shot from afar with one for that; a shield
        // bash, with a shield in the other hand)
        if (!WEAPONS[actor.weapon]?.attacks.some(({ kind }) => (kind === "ranged" ? "ranged" : "melee") === ability.blow)) {
            return refuse("item");
        }

        if (ability.shield && !actor.shield) {
            return refuse("unshielded");
        }

        const foe = target === null ? null : this.battle.actor(target);

        if (foe && !this.canFight(actor, foe)) {
            return refuse("target");
        }

        // (A shot from afar at someone too far off, or not seen: refused, and still ready, as a
        // spell out of reach is)
        const unshot = foe && ability.blow === "ranged" ? this.battle.shotAt(actor.id, foe.id) : null;

        if (unshot) {
            return refuse(unshot);
        }

        // (A shield bash: harder and longer, by as much, for a shield made for it)
        const bash = ability.stun ? (actor.power?.bash ?? 1) : 1;

        this.battle.empower(actor.id, ability.blow, ability.factor * bash, { stun: Math.round((ability.stun ?? 0) * bash) });
        player.readyAt[id] = this.battle.time + ability.cooldown;
        this.#event("ability", { id: actor.id, ability: id });

        if (foe) {
            return this.command(actor.id, { type: "engage", target: foe.id });
        }

        return OK;
    }

    // --- Who fights whom ---

    // Two characters on different teams (battle.js hostile asks, the folk and foes aside): as their
    // peoples stand in the war; anyone of no people's (the orc) against everyone, the peoples'
    // soldiers too; anyone, without a war. The wild's creatures (creatures.js) are every player's
    // enemies, and the soldiers' and followers' when they're a menace or fighting; no one else's
    // (the orc's)
    #against(a, b) {
        // (A field battle's other army, everyone's enemy; and everyone theirs: #fieldBattle)
        if (this.soldiers.get(a.id)?.field === "foe" || this.soldiers.get(b.id)?.field === "foe") {
            return this.soldiers.get(a.id)?.field !== this.soldiers.get(b.id)?.field;
        }

        if (a.team === WILD || b.team === WILD) {
            const [beast, other] = a.team === WILD ? [a, b] : [b, a];

            if (other.kind === "player") {
                return true;
            }

            return (other.kind === "soldier" || other.kind === "follower" || Boolean(other.leader)) && Boolean(beast.wild?.menace || beast.target !== null);
        }

        const war = this.war;
        const [ra, rb] = [war?.realm(a.team), war?.realm(b.team)];

        return ra && rb ? war.hostile(a.team, b.team) : true;
    }

    // --- The war come to life ---

    // Where the players are out in the world (and those in buildings, at their doors)
    #whereabouts() {
        return [...this.players.values()].map((player) => this.#whereIs(player)).filter(Boolean);
    }

    // Where a player is in the world ([x, y] metres): out in it, or in a building (at its door)
    #whereIs(player) {
        const actor = this.battle.actor(player.id);

        if (actor?.map === "town") {
            return [actor.x, actor.y];
        }

        const door = actor ? (this.world.interiors?.of(actor.map)?.entrance?.door ?? this.world.tavern?.door) : null;

        return door ? [door.x, door.z] : null;
    }

    // --- The townsfolk (core/townsfolk.js) ---

    // Each settlement's townsfolk out about their business once a player comes near its edge, and
    // a castle's folk in its wards; home again once every player's far off (TOWNSFOLK_REACH). As
    // many as are out by day, fewer once the torches are lit
    #townsfolk() {
        const town = this.world.maps?.town;

        if (!town?.chunk || !this.world.plan) {
            return;
        }

        const places = this.#whereabouts();
        const near = (middle, edge, within) => places.some(([x, y]) => hypot(x - middle[0], y - middle[1]) - edge < within);

        // (Those out, far from every player now: home)
        for (const [id, out] of [...this.townsfolk]) {
            const where = this.#peopledAt(id);

            if (!where || !near(where.middle, where.edge, TOWNSFOLK_REACH.far)) {
                this.#homeward(id, out);
            }
        }

        // (Those a player's come near: out)
        for (const where of this.#peopledNear(places)) {
            if (!this.townsfolk.has(where.id) && near(where.middle, where.edge, TOWNSFOLK_REACH.near)) {
                this.#outward(where);
            }
        }
    }

    // The settlements and the castles set down within reach of any of `places` (players'
    // whereabouts): [{ id, kind, people, name, middle, edge }]
    #peopledNear(places) {
        const reach = TOWNSFOLK_REACH.near + 120;
        const found = [];

        this.settlementPlaces ??= this.world.plan.places.filter(({ kind }) => SETTLEMENT_KINDS[kind]);

        for (const place of this.settlementPlaces) {
            if (places.some(([x, y]) => hypot(x - place.at[0], y - place.at[1]) < SETTLEMENT_KINDS[place.kind].radius + reach)) {
                found.push(this.#peopledAt(place.id));
            }
        }

        // (Not those that couldn't be set down: sites.js keeps them, as null)
        for (const set of this.world.maps.town.sites?.set?.values() ?? []) {
            if (set && (set.site.kind === "castle" || set.citadel) && places.some(([x, y]) => hypot(x - set.x, y - set.y) < set.radius + reach)) {
                found.push(this.#peopledAt(set.site.id));
            }
        }

        return found.filter(Boolean);
    }

    // A settlement or a castle set down, by its id: { id, kind, people, name, middle, edge }, or null
    #peopledAt(id) {
        const place = this.#placeOf(id);

        if (place && SETTLEMENT_KINDS[place.kind]) {
            return { id, kind: place.kind, people: place.race ?? "human", name: place.name ?? "", middle: this.#middleOf(place), edge: SETTLEMENT_KINDS[place.kind].radius };
        }

        const set = this.world.maps.town.sites?.set?.get(id);

        return set ? { id, kind: "castle", people: set.site.race ?? "human", name: set.site.name ?? "the castle", middle: [set.x, set.y], edge: set.radius, set } : null;
    }

    // A place's townsfolk out: where they go (its layout's errands, or its wards'), who they are,
    // each starting where no player sees them come out (if they can), on a square of their own
    #outward({ id, kind, people, name, set }) {
        const town = this.world.maps.town;
        const squares = squaresOf(town);
        const free = ([x, y]) => {
            try {
                return nearestFree(squares, [Math.floor(x), Math.floor(y)], { within: 3 });
            } catch {
                return null;
            }
        };
        const home = id === this.world.start?.id;
        const settlement = !set && !home ? town.settlements.of(this.#placeOf(id)) : null;
        const outside = set?.entrance?.outside;
        const errands = set
            ? wardErrandsOf({ courts: [...set.courts].map((k) => [k % WORLD_SIZE, Math.floor(k / WORLD_SIZE)]), heart: set.heart, keep: outside ? [outside[0] + 0.5, outside[1] + 0.5] : null }, free)
            : home
              ? errandsOf(this.world.town, this.world.origin, free)
              : errandsOf(settlement.town, settlement.at, free);
        const players = [...this.players.keys()].map((each) => this.battle.actor(each)).filter((actor) => actor && !actor.dead);
        const unseen = (square) => !players.some((actor) => this.battle.canSee(actor, { map: "town", square }));
        const folk = townsfolkOf({ place: id, kind, people, name, errands, count: countOut(kind, torchesLit(elapsedOf(this.war))), seed: this.world.seed ?? 1, start: unseen });
        const spot = this.#spots();
        const ids = [];

        for (const one of folk) {
            try {
                one.square = spot([one.square[0] + 0.5, one.square[1] + 0.5]);
            } catch {
                continue;
            }

            if (this.#addFolk(one, this.#sideOf(id, people))) {
                ids.push(one.id);
            }
        }

        this.townsfolk.set(id, ids);
        this.#event("townsfolk", { place: id, ids, change: "out" });
    }

    // A place's townsfolk home again (none of them anywhere a player is)
    #homeward(id, ids) {
        for (const one of ids) {
            this.battle.remove(one);
            this.folk.delete(one);
        }

        this.townsfolk.delete(id);
        this.#event("townsfolk", { place: id, ids, change: "home" });
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
            const distances = places.map(([x, y]) => hypot(x - middle[0], y - middle[1]) - edge);
            const mustered = this.mustered.get(town.id);

            if (mustered && (mustered.people !== town.owner || distances.every((distance) => distance > MUSTER.far))) {
                this.#dismiss(town.id);
            }

            if (!this.mustered.has(town.id) && distances.some((distance) => distance < MUSTER.near)) {
                this.#raise(town, place, middle);
            } else if (this.mustered.has(town.id)) {
                this.#relieve(town, place, middle);
            }
        }

        // The works near a player: their guards out, or the brigands holding them; let go once
        // every player's far, or it's changed hands
        for (const works of war.works) {
            const out = this.worksOut.get(works.id);
            const distances = places.map(([x, y]) => hypot(x - works.at[0], y - works.at[1]));

            if (out && (out.held !== works.held || (!works.held && out.people !== works.owner) || distances.every((distance) => distance > WORKS_OUT.far))) {
                this.#standDown(works.id);
            }

            if (!this.worksOut.has(works.id) && distances.some((distance) => distance < WORKS_OUT.near)) {
                this.#manWorks(works);
            } else if (this.worksOut.has(works.id) && !works.held) {
                this.#relieveWorks(works);
            }
        }

        // The camps' stockades as they stand (changed between the war's turns too: a camp razed in
        // the world), then the armies' camps and supply depots near a player pitched, and those
        // far from every player (or gone) struck
        this.#stockadesChanged();

        const near = (camp, within) => places.some(([x, y]) => hypot(x - camp.at[0], y - camp.at[1]) < within);

        for (const id of [...this.camps.keys()]) {
            const camp = war.camp(id) ?? war.depot(id);

            if (!camp || !near(camp, CAMP_NEAR.far)) {
                this.#strike(id);
            }
        }

        for (const camp of [...war.camps, ...war.depots]) {
            if (!this.camps.has(camp.id) && camp.guard > 0 && near(camp, CAMP_NEAR.near)) {
                this.#pitch(camp);
            }
        }

        // The armies, reserves and reinforcements near a player met in the field, in their lines of
        // battle, and an enemy's near enough to one met to fight it; let go once every player's
        // far, or they're gone (or home within their walls)
        for (const [id, met] of [...this.armies]) {
            const force = war.force(id);

            if (!force || force.size <= 0 || !this.#afield(force) || !near({ at: met.at }, ARMY_NEAR.far)) {
                this.#letArmyGo(id);
            }
        }

        const afield = war.forces.filter((force) => ["army", "reserve", "reinforcement"].includes(force.kind) && force.size > 0 && this.#afield(force));

        for (const force of afield) {
            if (!this.armies.has(force.id) && near(force, ARMY_NEAR.near)) {
                this.#meetArmy(force);
            }
        }

        for (const force of afield) {
            const foe = () => [...this.armies.keys()].some((id) => war.hostile(war.force(id)?.realm, force.realm) && hypot(war.force(id).at[0] - force.at[0], war.force(id).at[1] - force.at[1]) <= ARMY_NEAR.fight);

            if (!this.armies.has(force.id) && foe()) {
                this.#meetArmy(force);
            }
        }

        this.#watchArmies();
        this.#storms();

        // The envoys near a player met on the road, and let go once they're far (or gone, and far)
        for (const [id, met] of [...this.envoys]) {
            if (!near({ at: met.at }, ENVOY.far) || (!met.over && war.force(id)?.kind !== "envoy")) {
                this.#farewell(id);
            }
        }

        for (const envoy of war.forces) {
            if (envoy.kind === "envoy" && !this.envoys.has(envoy.id) && near(envoy, ENVOY.near)) {
                this.#meet(envoy);
            }
        }

        this.#watchEnvoys();

        // The convoys near a player met on the road, and let go once they're far (or gone, and far)
        for (const [id, met] of [...this.convoys]) {
            if (!near({ at: met.at }, CONVOY_NEAR.far) || (!met.over && war.force(id)?.kind !== "convoy")) {
                this.#partWith(id);
            }
        }

        for (const convoy of war.forces) {
            if (convoy.kind === "convoy" && !this.convoys.has(convoy.id) && near(convoy, CONVOY_NEAR.near)) {
                this.#meetConvoy(convoy);
            }
        }

        this.#watchConvoys();

        // The supply wagons near a player met on their way, and let go once they're far (or gone)
        for (const [id, met] of [...this.supplies]) {
            if (!near({ at: met.at }, WAGON_NEAR.far) || (!met.over && war.force(id)?.kind !== "supply")) {
                this.#letWagonGo(id);
            }
        }

        for (const wagon of war.forces) {
            if (wagon.kind === "supply" && !this.supplies.has(wagon.id) && near(wagon, WAGON_NEAR.near)) {
                this.#meetWagon(wagon);
            }
        }

        this.#watchWagons();
        this.#watchSkirmishers();
        this.#watchLeaders();

        // The fortifications near a player stood up, and let go once they're far, or gone
        for (const [id] of [...this.fortsOut]) {
            const fort = war.fort(id);

            if (!fort || !near(fort, FORT_NEAR.far)) {
                this.#letFortGo(id);
            }
        }

        for (const fort of war.forts) {
            if (!this.fortsOut.has(fort.id) && near(fort, FORT_NEAR.near)) {
                this.#raiseFort(fort);
            }
        }

        this.#tendSquads();
        this.#tendBarracks();

        // (What a camp does against a town with its soldiers out is played out here, as is a fight
        // at a camp or a supply depot pitched, and a camp's skirmishers; and the envoys, convoys,
        // supply wagons and reinforcements met go at their own pace)
        war.watch([...this.mustered.keys(), ...this.worksOut.keys(), ...this.fortsOut.keys(), ...this.camps.keys(), ...this.armies.keys(), ...[...this.envoys, ...this.convoys, ...this.supplies].filter(([, met]) => !met.over).map(([id]) => id)]);
    }

    #placeOf(id) {
        return this.world.plan.places.find((place) => place.id === id);
    }

    // Where a place's middle is: the town the player starts in is set in a little off its place
    #middleOf(place) {
        return place.id === this.world.start?.id && this.world.stamp?.middle ? this.world.stamp.middle : place.at;
    }

    // A town's soldiers out: its guards at their posts, and its patrols on their rounds (#stations)
    #raise(town, place, middle) {
        const { guards, stations } = this.#stations(town, place, middle);
        const free = this.#spots();
        const ids = [];

        if (!stations.length) {
            return;
        }

        try {
            for (const station of stations) {
                this.#station(town, station, free(station.at));
                ids.push(station.id);
            }
        } catch {
            // (No free ground there: those found are out, and no more)
        }

        const banners = bannersOf(this.world.plan, place, { middle }).slice(0, Math.ceil(guards / 2));
        // (A brazier burning by each pair of guards: drawn, lit, nothing to the rules)
        const braziers = braziersOf(this.world.plan, place, { middle }).slice(0, Math.ceil(guards / 2));

        this.mustered.set(town.id, { people: town.owner, ids, share: town.garrison / Math.max(1, ids.length), banners, braziers, relief: null });
        this.#event("muster", { town: town.id, people: town.owner, ids, banners, braziers });
    }

    // Where a town's soldiers stand and walk, as many as its garrison has: its guards at its posts
    // (up to its posts), and its patrols on their rounds (as many as it has, while its garrison's
    // half full). { guards (how many posted), stations: [{ id, weapon, at (where they come out:
    // [x, y] metres), orders ({ round (a patrol's), leash, facing (a guard's) }) }] }
    #stations(town, place, middle) {
        const squares = squaresOf(this.world.maps.town);
        const full = HOLDINGS[town.kind].garrison;
        const posts = postsOf(this.world.plan, place, { middle });
        const guards = Math.min(posts.length, Math.ceil((town.garrison / full) * POSTED[town.kind]));
        const rounds = roundsOf(this.world.plan, place, { middle }).slice(0, town.garrison * 2 >= full ? undefined : 0);
        const [guardArms, patrolArms] = SOLDIERS_ARMS[town.owner] ?? SOLDIERS_ARMS.human;
        const stations = posts.slice(0, guards).map((post, k) => ({ id: `${town.id}/guard-${k}`, weapon: guardArms, at: post.at, orders: { leash: LEASH, facing: post.facing } }));

        try {
            for (const [k, round] of rounds.entries()) {
                const points = round.map((point) => nearestFree(squares, [Math.floor(point[0]), Math.floor(point[1])], { within: 24 }));
                // (Each of a patrol walks its own round, a step beside the one before's, so that
                // none of them waits at a point for another to move off it)
                const beside = new Set();

                for (let m = 0; m < PATROL_SIZE; m++) {
                    const own = points.map((point) => nearestFree(squares, point, { within: 24, taken: beside }));

                    own.forEach(([x, y]) => beside.add(squareKey(x, y)));
                    stations.push({ id: `${town.id}/patrol-${k}-${m}`, weapon: m % 2 ? patrolArms : guardArms, at: own[0], orders: { round: own, leash: LEASH * 2 } });
                }
            }
        } catch {
            // (No free ground on a round: the patrols found walk, and no more)
        }

        return { guards, stations };
    }

    // One of a town's soldiers out at their station, on `square` (free, near where they come out)
    #station(town, { id, weapon, orders: { round, leash, facing } }, square) {
        const orders = round ? { patrol: round, leash } : { patrol: [square], leash, facing };

        this.#enlist(id, { people: town.owner, weapon, square, name: round ? "patrol" : "guard", record: { town: town.id }, ...orders });
    }

    // A town's fallen soldiers relieved (RELIEF_MS after the last was taken away): others of its
    // garrison out at the stations they've left, as many as it has now (with none to spare, asked
    // again a while after), each once no player can see where they'd come out
    #relieve(town, place, middle) {
        const mustered = this.mustered.get(town.id);

        if ((mustered.relief ?? null) === null || this.battle.time < mustered.relief) {
            return;
        }

        const players = [...this.players.keys()].map((id) => this.battle.actor(id)).filter((actor) => actor && !actor.dead);
        const { stations } = this.#stations(town, place, middle);
        const free = this.#spots();
        const ids = [];
        let [waiting, later] = [false, false];

        try {
            for (const station of stations) {
                if (mustered.ids.includes(station.id) || this.battle.actor(station.id)) {
                    continue;
                }

                // (No more out than it has: those still standing count)
                if (mustered.ids.length + ids.length >= stations.length) {
                    later = true;
                    break;
                }

                const square = free(station.at);

                if (players.some((actor) => this.battle.canSee(actor, { map: "town", square }))) {
                    waiting = true;
                    continue;
                }

                this.#station(town, station, square);
                ids.push(station.id);
            }
        } catch {
            // (No free ground there: another time)
            waiting = true;
        }

        mustered.ids.push(...ids);
        mustered.relief = later ? this.battle.time + RELIEF_MS : waiting ? mustered.relief : null;

        if (ids.length) {
            this.#event("relieved", { town: town.id, people: town.owner, ids });
        }
    }

    // One of a people's soldiers, out in the world: how they look (from their id, the same every
    // time), and what they're doing (their orders: patrol, leash, facing), named for their people
    // and their part ("Orcish sentry"); `record` says whose they are ({ town }, or { camp, share })
    #enlist(id, { people, weapon, square, name, record, ...orders }) {
        const seed = [...id].reduce((hash, character) => (Math.imul(hash, 31) + character.charCodeAt(0)) | 0, this.world.seed ?? 1) >>> 0;
        const sex = seed % 4 === 0 ? "f" : "m";
        const adjective = ADJECTIVES[people] ?? people;

        // (The first of each post, patrol, camp's sentries, and an envoy's escort: its captain)
        const captain = /-0$|escort-1$/.test(id);

        this.soldiers.set(id, { ...record, people, weapon, sex, seed, captain });
        this.battle.add({ id, kind: "soldier", name: `${adjective[0].toUpperCase()}${adjective.slice(1)} ${name}`, weapon, team: people, square, ai: "patrol", role: "guard", shield: shieldOf(weapon, captain ? "captain" : "soldier"), ...orders });
    }

    // A field battle, to see how many a device draws and plays smoothly (the debug overlay's: its
    // Field battle): two armies of `size` each (FIELD_BATTLE.most at most) mustered out in the
    // world before a player, each in a line of battle (core/formation.js) across the way they look
    // (`facing`: radians from south, towards east): theirs ahead of them, its rear `near` metres
    // off, another people's (the orcs', or the humans' for the orcs) beyond, the fronts `apart`,
    // facing each other, marching to meet halfway (and on, closing with the other). Each army's
    // mixed as its people's are (DOCTRINES), each soldier carrying what its people's do in its role
    // (ROLE_ARMS), casters their people's spells and healers theirs. Their people's fight beside
    // the player; the others are everyone's enemies
    #fieldBattle(player, actor, size, facing) {
        if (actor.map !== "town" || !Number.isInteger(size) || size < 1 || size > FIELD_BATTLE.most || !Number.isFinite(facing)) {
            return refuse("command");
        }

        const free = this.#spots();
        const ahead = [sin(facing), cos(facing)];
        const at = (forward) => [actor.x + ahead[0] * forward, actor.y + ahead[1] * forward];
        const foe = player.realm === "orc" ? "human" : "orc";
        const lines = [player.realm, foe].map((people) => {
            const roles = rolesOf(size, DOCTRINES[people]);

            return { roles, places: linePlaces(roles) };
        });
        const front = FIELD_BATTLE.near + Math.max(0, ...lines[0].places.map(([, back]) => back));
        const meet = at(front + FIELD_BATTLE.apart / 2);
        const ids = [];

        for (const [side, people, from, faces, { roles, places }] of [
            ["friend", player.realm, front, facing, lines[0]],
            ["foe", foe, front + FIELD_BATTLE.apart, facing + Math.PI, lines[1]],
        ]) {
            const formation = `field-${side}-${this.fielded}`;
            const anchor = at(from);
            const counts = {};

            this.battle.formation(formation, { anchor, facing: faces, to: [meet[0] - sin(faces) * 1.5, meet[1] - cos(faces) * 1.5], speed: FIELD_BATTLE.march, advance: true });

            roles.forEach((role, k) => {
                let square;

                try {
                    square = free(placeAt({ anchor, facing: faces }, places[k]));
                } catch {
                    return;
                }

                const id = `field-${this.fielded++}`;
                const kit = soldierOf(people, role, (counts[role] = (counts[role] ?? -1) + 1));

                this.#enlist(id, { people, ...kit, square, name: "soldier", record: { field: side, role }, patrol: [square], facing: faces, leash: ROLES[role].leash, armed: true, formation: { id: formation, slot: places[k], role } });
                ids.push(id);
            });
        }

        this.#event("fieldBattle", { ids, size });

        return { ok: true };
    }

    // Free squares near spots in the world (or on a map of a building's), one each (none taken
    // twice, nor anyone's)
    #spots(map = "town") {
        const squares = squaresOf(this.world.maps[map]);
        const taken = new Set(this.battle.actors.filter((actor) => actor.map === map).map(({ square: [x, y] }) => squareKey(x, y)));

        return ([x, y]) => {
            const square = nearestFree(squares, [Math.floor(x), Math.floor(y)], { taken, within: 24 });

            taken.add(squareKey(...square));

            return square;
        };
    }

    // --- The armies near a player (docs/WAR.md *The armies near a player*) ---

    // Whether a people's army or reserve is out in the field: not an army mustering at its seat,
    // nor a reserve at home (both within its walls)
    #afield(force) {
        return force.kind === "army" ? force.mission !== "muster" : force.mission !== "home";
    }

    // An army or reserve met in the field near a player: one of it stood up for each of it
    // (ARMY_NEAR.most at most) in its line of battle, mixed as its people's are (DOCTRINES), each
    // carrying what its people's do in its role, the line where the war has it, facing the way it's
    // going and marching for the next point on its way
    #meetArmy(force) {
        const drawn = Math.min(force.size, ARMY_NEAR.most);
        const roles = rolesOf(drawn, DOCTRINES[force.realm]);
        const places = linePlaces(roles);
        // (At its camp, on its parade ground facing out of its front gate)
        const parade = this.#paradeOf(force, force.at);
        const anchor = parade?.at ?? force.at;
        const to = this.#standFor(force, force.path[Math.min(force.leg + 1, force.path.length - 1)] ?? force.at);
        const facing = hypot(to[0] - anchor[0], to[1] - anchor[1]) > 1 ? atan2(to[0] - anchor[0], to[1] - anchor[1]) : (parade?.facing ?? 0);
        const formation = `army-${force.id}`;
        const free = this.#spots();
        const counts = {};
        const ids = [];

        this.battle.formation(formation, { anchor, facing, to: [...to], speed: ARMY_NEAR.pace, advance: !parade });

        roles.forEach((role, k) => {
            let square;

            try {
                square = free(placeAt({ anchor, facing }, places[k]));
            } catch {
                return;
            }

            const id = `${force.id}/soldier-${this.fielded++}`;
            const kit = soldierOf(force.realm, role, (counts[role] = (counts[role] ?? -1) + 1));

            this.#enlist(id, { people: force.realm, ...kit, square, name: "soldier", record: { force: force.id, role }, patrol: [square], facing, leash: ROLES[role].leash, armed: true, formation: { id: formation, slot: places[k], role } });
            ids.push(id);
        });

        this.armies.set(force.id, { people: force.realm, kind: force.kind, formation, ids, at: [...anchor] });
        this.#event("army", { force: force.id, people: force.realm, kind: force.kind, ids, met: true });
    }

    // The armies, reserves and reinforcements met, each on its way: its line marching for the next
    // point on it as the war has it (reinforcements, for theirs where it is now: #joining), the war
    // told where it's got to (war.move); reinforcements there, joining it (#joined); turned on an
    // enemy's met within ARMY_NEAR.fight (marching on it, and once their fronts are
    // ARMY_NEAR.close, closing with it as a line does: battle.js ADVANCE; on one holding its camp,
    // for the opening of its stockade nearest: STORM), and on its way again once there's none; an
    // army at its camp holding it, not going out to anyone; one storming a camp where its storm
    // has it (#storms); beaten, running while it gets away, none turning on it; as many of it
    // stood up as the war has of it (those it's lost elsewhere, or deserted, let go from the back;
    // those joined it stood up at the back). One beaten in the field there, down to ARMY.rout of
    // what it went in with and outnumbered, the war's told (war.routed)
    #watchArmies() {
        const war = this.war;
        const storming = new Set([...this.storms.values()].flatMap(({ attackers }) => attackers));
        const holding = new Set([...this.storms.values()].map(({ army }) => army).filter(Boolean));

        for (const [id, met] of [...this.armies]) {
            const force = war.force(id);
            const formation = this.battle.formations[met.formation];

            if (!force || !formation || !this.armies.has(id)) {
                continue;
            }

            met.at = [...formation.anchor];

            let leg = force.leg;

            while (leg < force.path.length - 1 && hypot(force.path[leg + 1][0] - met.at[0], force.path[leg + 1][1] - met.at[1]) <= ARMY_NEAR.past) {
                leg++;
            }

            if (war.move(id, met.at, leg)) {
                this.#joined(id, force);
                continue;
            }

            // (Beaten and getting away: running, its line broken, for as long as it is)
            const fleeing = war.fleeing(id);

            if (formation.broken !== fleeing) {
                this.battle.formation(met.formation, { broken: fleeing, speed: fleeing ? STORM.run : ARMY_NEAR.pace });
            }

            // (Storming a camp: where its storm has it)
            if (storming.has(id) && !fleeing) {
                this.#keepUpArmy(force, met);
                continue;
            }

            // (An enemy's met within reach, not beaten and getting away: on it; within sight of
            // it, closing with it; one holding its camp, making for its stockade's nearest opening)
            const foe = [...this.armies]
                .filter(([other]) => other !== id && war.hostile(war.force(other)?.realm, force.realm) && !war.fleeing(other))
                .map(([other, theirs]) => ({ id: other, at: this.battle.formations[theirs.formation]?.anchor }))
                .filter(({ at }) => at)
                .map((each) => ({ ...each, distance: hypot(each.at[0] - met.at[0], each.at[1] - met.at[1]) }))
                .filter(({ distance }) => distance <= ARMY_NEAR.fight)
                .sort((a, b) => a.distance - b.distance)[0];
            const way = force.kind === "reinforcement" ? this.#joining(force) : force.leg < force.path.length - 1 ? this.#standFor(force, force.path[force.leg + 1]) : null;
            const home = force.kind === "army" && this.#paradeOf(force, met.at) !== null;
            const camp = foe && !fleeing && !home ? this.#heldBy(foe.id) : null;
            const to = fleeing || home || !foe ? way : camp ? this.#musterFor(camp, met.at) : foe.distance <= ARMY_NEAR.close ? null : foe.at;

            if (formation.advance === home) {
                this.battle.formation(met.formation, { advance: !home });
            }

            // (Beaten in the field: told to the war)
            if (!fleeing && !holding.has(id) && FIELDED.includes(force.kind)) {
                this.#routed(id, force, met, foe);
            }

            if (String(to) !== String(formation.to)) {
                this.battle.formation(met.formation, { to: to ? [...to] : null });

                // (Nothing to march for: closing with whoever's in sight, and no further)
                if (!to) {
                    formation.to = null;
                }
            }

            this.#keepUpArmy(force, met);
        }
    }

    // An army's own camp's parade ground ({ at, facing }: stockade.js), if `point` is its camp's
    // (within a few metres of its middle or its parade ground) and its stockade's up; else null
    #paradeOf(force, point) {
        const camp = force.kind === "army" && force.camp ? this.war.camp(force.camp) : null;

        if (!camp || camp.built === null || !point || hypot(point[0] - camp.at[0], point[1] - camp.at[1]) > STOCKADE.parade + ARMY_NEAR.past) {
            return null;
        }

        return this.war.stockade(camp.id).parade;
    }

    // Where an army's line makes for, for a point on its way: its camp's parade ground for its
    // camp's middle (#paradeOf), not its fire among the tents; else the point
    #standFor(force, point) {
        return this.#paradeOf(force, point)?.at ?? point;
    }

    // The army holding its camp in the world that a force met is (by id), if it is: its camp
    // (war.js's), at whose stockade it's met; else null
    #heldBy(id) {
        const force = this.war.force(id);
        const met = this.armies.get(id);

        return force?.kind === "army" && met && this.#paradeOf(force, met.at) ? this.war.camp(force.camp) : null;
    }

    // A camp's stockade's openings, its gates and its breaches: { at (the middle of the gap, on the
    // line of its wall), out (the way out, [dx, dy]), along (across it, [dx, dy]), width (squares),
    // key } in metres
    #openings(camp) {
        const stockade = this.war.stockade(camp.id);
        const opening = (at, side, width, key) => {
            const out = SIDES[side];

            return { at: [...at], out, along: [out[1], -out[0]], width, key };
        };

        return [
            ...stockade.gates.map((gate, k) => opening(gate.at, gate.side, gate.squares.length, `gate-${k}`)),
            ...brokenOf(camp).map((k) => opening(stockade.sections[k].at, stockade.sections[k].side, stockade.sections[k].wall.length, `section-${k}`)),
        ];
    }

    // Where those storming a camp from `from` ([x, y] metres) gather: STORM.muster metres out from
    // the opening of its stockade nearest them
    #musterFor(camp, from) {
        const { at, out } = nearestOf(this.#openings(camp), from);

        return [at[0] + out[0] * STORM.muster, at[1] + out[1] * STORM.muster];
    }

    // An army or reserve met fighting in the field (not at a camp), beaten once it's down to
    // ARMY.rout of what it went in with and outnumbered by the enemy's met near it, in the war's
    // numbers: the war told (war.routed), by whoever beat it
    #routed(id, force, met, foe) {
        const war = this.war;
        const now = this.battle.time;

        if (foe) {
            met.went ??= force.size;
            met.fought = now;
        } else if (met.went !== undefined && met.went !== null && now - (met.fought ?? 0) > STORM.calm) {
            met.went = null;
        }

        if (!foe || !met.went) {
            return;
        }

        const theirs = [...this.armies.keys()]
            .filter((other) => war.hostile(war.force(other)?.realm, force.realm) && !war.fleeing(other) && hypot(this.armies.get(other).at[0] - met.at[0], this.armies.get(other).at[1] - met.at[1]) <= ARMY_NEAR.fight)
            .reduce((sum, other) => sum + war.force(other).size, 0);

        if (force.size <= ARMY.rout * met.went && force.size < theirs) {
            const victor = war.force(foe.id);
            const theirsMet = this.armies.get(foe.id);

            war.routed(id, { by: victor.realm, killed: met.went - force.size, lost: Math.max(0, (theirsMet?.went ?? victor.size) - victor.size) });
            met.went = null;
        }
    }

    // The camps' stockades near a player held and stormed (STORM): manned once an enemy's near,
    // stood down once none has been a while; those storming it set at it; its stakes hacked down;
    // and the storm over once either side's beaten (#stormEnded), or those storming it gone or
    // let go (stood down, nothing told)
    #storms() {
        const war = this.war;
        const now = this.battle.time;

        for (const id of [...this.storms.keys()]) {
            if (!war.camp(id)) {
                this.#stormOver(id);
            }
        }

        for (const camp of war.camps) {
            if (camp.built === null) {
                continue;
            }

            const stockade = war.stockade(camp.id);
            const middle = [stockade.middle[0] + 0.5, stockade.middle[1] + 0.5];
            const within = (at, reach) => hypot(at[0] - middle[0], at[1] - middle[1]) <= reach;
            const army = [...this.armies.keys()].find((each) => war.force(each)?.camp === camp.id && this.#heldBy(each) === camp) ?? null;
            let storm = this.storms.get(camp.id);
            // (Its army in a storm under way put down: the storm's to end, carried, below)
            const fallen = Boolean(storm?.went && storm.army && !(war.force(storm.army)?.size > 0));

            // (None of it in the world)
            if (!army && !this.camps.has(camp.id) && !fallen) {
                if (storm) {
                    this.#stormOver(camp.id);
                }

                continue;
            }

            const foes = [...this.armies.keys()].filter((each) => {
                const force = war.force(each);

                return FIELDED.includes(force?.kind) && force.size > 0 && war.hostile(force.realm, camp.realm) && !war.fleeing(each) && within(this.armies.get(each).at, ARMY_NEAR.fight);
            });
            const players = [...this.players.values()].filter(({ id: each, realm }) => {
                const actor = this.battle.actor(each);

                return actor && !actor.dead && actor.map === "town" && realm && war.hostile(realm, camp.realm) && within([actor.x, actor.y], STORM.near);
            });

            if (!storm && !foes.length && !players.length) {
                continue;
            }

            storm ??= this.storms.set(camp.id, { army, alarm: now, attackers: [], by: [], went: null, breaches: 0, section: null, next: 0, posted: "", stood: null }).get(camp.id);
            storm.army = army ?? storm.army;

            if (foes.length || players.length) {
                storm.alarm = now;
            }

            // Those storming it: the enemy's met that come within STORM.near of it
            for (const each of foes) {
                if (!storm.attackers.includes(each) && within(this.armies.get(each).at, STORM.near)) {
                    storm.attackers.push(each);
                    storm.by.push(...(storm.by.includes(each) ? [] : [each]));

                    if (storm.went) {
                        storm.went.by += war.force(each).size;
                    }
                }
            }

            storm.attackers = storm.attackers.filter((each) => this.armies.has(each) && (war.force(each)?.size ?? 0) > 0 && !war.fleeing(each));

            const holders = () => (storm.army ? (war.force(storm.army)?.size ?? 0) : 0) + (war.camp(camp.id)?.guard ?? 0);
            const stormers = () => storm.by.reduce((sum, each) => sum + (war.force(each)?.size ?? 0), 0);

            if (storm.attackers.length && !storm.went) {
                storm.went = { by: stormers(), of: holders() };
            }

            // Over: those storming it gone (put down to the last: held), or beaten; or those
            // holding it beaten
            if (storm.went) {
                const [by, of] = [stormers(), holders()];
                const fell = { killed: Math.max(0, storm.went.of - of), lost: Math.max(0, storm.went.by - by) };

                if (by <= 0 || (storm.attackers.length && by <= ARMY.rout * storm.went.by && by < of)) {
                    this.#stormEnded(camp.id, true, fell);
                    continue;
                }

                if (of <= 0 || (storm.attackers.length && of <= ARMY.rout * storm.went.of && of < by)) {
                    this.#stormEnded(camp.id, false, fell);
                    continue;
                }

                // (Come to nothing a while, none falling and no stakes hacked at: beaten off)
                const stakes = storm.section ? (this.battle.actor(storm.section.id)?.hp ?? 0) : null;
                const state = `${by}|${of}|${stakes}`;

                if (storm.stood?.state !== state) {
                    storm.stood = { state, since: now };
                } else if (storm.attackers.length && now - storm.stood.since > STORM.stall) {
                    this.#stormEnded(camp.id, true, fell);
                    continue;
                }

                // (Those storming it gone off, or let go: no more of it, nothing told)
                if (!storm.attackers.length) {
                    this.#stormOver(camp.id);
                    continue;
                }
            }

            // (Quiet a while: stood down)
            if (!storm.attackers.length && now - storm.alarm > STORM.calm) {
                this.#stormOver(camp.id);
                continue;
            }

            const toward = [...storm.attackers, ...foes].map((each) => this.armies.get(each).at)[0] ?? (players[0] && [this.battle.actor(players[0].id).x, this.battle.actor(players[0].id).y]) ?? null;

            if (toward) {
                this.#holdStockade(camp, storm, toward);
            }

            for (const each of storm.attackers) {
                this.#storming(camp, storm, each);
            }

            this.#hack(camp, storm);
        }
    }

    // A camp's army met there manning its stockade against an enemy near `toward` ([x, y] metres):
    // its shield line and two-handers in ranks across its openings, each opening's share as near as
    // it is, its archers and casters up on its walkway nearest the enemy (any more behind its
    // openings: STORM); posted again only as its openings, the one nearest the enemy or its numbers
    // change
    #holdStockade(camp, storm, toward) {
        const met = storm.army && this.armies.get(storm.army);

        if (!met) {
            return;
        }

        const openings = this.#openings(camp);
        const soldiers = met.ids.map((each) => this.battle.actor(each)).filter((actor) => actor && !actor.dead && actor.formation);
        const weights = openings.map(({ at }) => {
            const away = STORM.spread + hypot(at[0] - toward[0], at[1] - toward[1]);

            return 1 / (away * away * away);
        });
        const order = openings.map((_, k) => k).sort((a, b) => weights[b] - weights[a] || a - b);
        const melee = soldiers.filter((actor) => ["front", "heavy"].includes(actor.formation.role));
        const posted = `${openings.map(({ key }) => key)}|${shares(melee.length, weights)}|${soldiers.length}`;

        if (posted === storm.posted) {
            return;
        }

        storm.posted = posted;

        // (Any within its stockade theirs to go after, as far as it takes)
        const { box } = this.war.stockade(camp.id);
        const holds = [box[0] + 1, box[1] + 1, box[2] - 1, box[3] - 1];

        for (const actor of soldiers) {
            actor.holds = holds;
        }

        const post = (actor, opening, depth, across, leash) => {
            const { at, out, along } = opening;

            actor.formation.post = [at[0] - out[0] * depth + along[0] * across, at[1] - out[1] * depth + along[1] * across];
            actor.formation.facing = atan2(out[0], out[1]);
            actor.leash = leash;
        };

        // (Its archers and casters on its walkway: its squares nearest the enemy, of what a stair
        // comes up onto, STORM.loose apart; to each the nearest of them still to be posted)
        const shooters = soldiers.filter((actor) => ["archer", "caster"].includes(actor.formation.role));
        const spots = [];

        for (const spot of walkwayOf(this.war.stockade(camp.id), brokenOf(camp))
            .filter(({ reached }) => reached)
            .flatMap(({ squares }) => squares)
            .sort((a, b) => hypot(a.at[0] - toward[0], a.at[1] - toward[1]) - hypot(b.at[0] - toward[0], b.at[1] - toward[1]))) {
            if (spots.length >= shooters.length) {
                break;
            }

            if (spots.every(({ square }) => Math.max(Math.abs(square[0] - spot.square[0]), Math.abs(square[1] - spot.square[1])) >= STORM.loose)) {
                spots.push(spot);
            }
        }

        for (const spot of spots) {
            const distance = (actor) => hypot(actor.x - spot.at[0], actor.y - spot.at[1]);
            const nearest = shooters.reduce((best, actor) => (distance(actor) < distance(best) || (distance(actor) === distance(best) && actor.id < best.id) ? actor : best));

            shooters.splice(shooters.indexOf(nearest), 1);
            Object.assign(nearest.formation, { post: [...spot.at], facing: spot.facing });
            nearest.leash = longestReach(nearest.arms);
        }

        for (const [roles, place] of [
            [["front", "heavy"], (actor, opening, k) => post(actor, opening, 1.2 + Math.floor(k / opening.width) * STORM.depth, (k % opening.width) - (opening.width - 1) / 2, STORM.hold)],
            [["archer", "caster"], (actor, opening, k, count) => post(actor, opening, STORM.back, (k - (count - 1) / 2) * 1.5, ROLES[actor.formation.role].leash)],
        ]) {
            const left = roles.includes("archer") ? shooters : soldiers.filter((actor) => roles.includes(actor.formation.role));
            const counts = shares(left.length, weights);

            for (const k of order) {
                const opening = openings[k];
                const taken = left.sort((a, b) => hypot(a.x - opening.at[0], a.y - opening.at[1]) - hypot(b.x - opening.at[0], b.y - opening.at[1]) || (a.id < b.id ? -1 : 1)).splice(0, counts[k]);

                taken.forEach((actor, j) => place(actor, opening, j, taken.length));
            }
        }
    }

    // A force met storming a camp, set at it: its line gathering before the opening of its
    // stockade nearest it, its archers and casters there, the rest making for its parade ground
    // (those hacking at its wall at that: #hack); set again only as that opening or its numbers
    // change
    #storming(camp, storm, id) {
        const met = this.armies.get(id);
        const formation = this.battle.formations[met.formation];
        const opening = nearestOf(this.#openings(camp), formation.anchor);
        const soldiers = met.ids.map((each) => this.battle.actor(each)).filter((actor) => actor && !actor.dead && actor.formation);
        const posted = `${opening.key}|${soldiers.length}|${storm.section?.id ?? ""}`;

        if (met.storming === posted) {
            return;
        }

        met.storming = posted;

        const { at, out, along } = opening;
        const muster = [at[0] + out[0] * STORM.muster, at[1] + out[1] * STORM.muster];
        const inward = atan2(-out[0], -out[1]);
        const parade = this.war.stockade(camp.id).parade.at;
        const shooters = soldiers.filter((actor) => ["archer", "caster"].includes(actor.formation.role));
        const rest = soldiers.filter((actor) => !shooters.includes(actor) && actor.siege !== storm.section?.id);

        this.battle.formation(met.formation, { to: muster, advance: false });

        shooters.forEach((actor, k) => {
            const across = (k - (shooters.length - 1) / 2) * 1.5;

            Object.assign(actor.formation, { post: [muster[0] + along[0] * across, muster[1] + along[1] * across], facing: inward });
            actor.leash = ROLES[actor.formation.role].leash;
        });

        rest.forEach((actor, k) => {
            const [across, back] = [(k % 7) - 3, Math.floor(k / 7)];

            Object.assign(actor.formation, { post: [parade[0] + along[0] * across * 1.5 - out[0] * back, parade[1] + along[1] * across * 1.5 - out[1] * back], facing: inward });
            actor.siege = null;
            actor.leash = STORM.reach;
        });
    }

    // A camp's wall hacked at by those storming it: the section of it nearest them that's clear of
    // its openings stood up in the battle (its stakes: KINDS.stakes, over its squares of wall), and
    // a share of their shield line and two-handers (STORM.party) sent at it, from outside it; and
    // more sent at it as those hacking at it fall (from its walkway, as like as not)
    #hack(camp, storm) {
        const section = storm.section && this.battle.actor(storm.section.id);

        if (!storm.attackers.length || this.battle.time < storm.next) {
            return;
        }

        const stockade = this.war.stockade(camp.id);
        const met = this.armies.get(storm.attackers[0]);
        // (Of those outside it: from within, its wall's out of reach behind its walkway)
        const [x0, y0, x1, y1] = stockade.box;
        const melee = met.ids
            .map((each) => this.battle.actor(each))
            .filter((actor) => actor && !actor.dead && ["front", "heavy"].includes(actor.formation?.role) && (actor.siege || actor.square[0] < x0 || actor.square[1] < y0 || actor.square[0] > x1 || actor.square[1] > y1));

        if (section && !section.dead) {
            // (Those hacking at it all fallen: as many again of the rest outside it, unannounced)
            if (!melee.some((actor) => actor.siege === section.id)) {
                this.#hackers(met, melee, stockade.sections[storm.section.index], section.id, storm);
            }

            return;
        }

        const openings = this.#openings(camp);
        const from = this.battle.formations[met.formation]?.anchor ?? met.at;
        const broken = brokenOf(camp);
        const index = stockade.sections
            .map((each, k) => ({ k, at: each.at }))
            .filter(({ k, at }) => !broken.includes(k) && openings.every((opening) => hypot(opening.at[0] - at[0], opening.at[1] - at[1]) >= STORM.clear))
            .sort((a, b) => hypot(a.at[0] - from[0], a.at[1] - from[1]) - hypot(b.at[0] - from[0], b.at[1] - from[1]) || a.k - b.k)[0]?.k;

        if (index === undefined) {
            return;
        }

        const { wall, at } = stockade.sections[index];
        const id = `${camp.id}/stakes-${index}`;
        const xs = wall.map(([x]) => x);
        const ys = wall.map(([, y]) => y);

        // (With none of their shield line and two-handers left to hack at it, none hacked at, for a
        // while)
        if (!melee.length) {
            storm.next = this.battle.time + STORM.again;

            return;
        }

        this.battle.add({ id, kind: "stakes", name: `${ADJECTIVES[camp.realm] ?? camp.realm} palisade`, team: camp.realm, square: [...wall[Math.floor(wall.length / 2)]], footprint: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], armed: false });
        storm.section = { id, index };

        const hackers = this.#hackers(met, melee, stockade.sections[index], id, storm);

        this.#event("hacking", { camp: camp.id, people: camp.realm, section: index, stakes: id, at: [...at], by: this.war.force(storm.attackers[0])?.realm ?? null, force: storm.attackers[0], ids: hackers.map(({ id: each }) => each) });
    }

    // Those of a force's shield line and two-handers (`melee`) set at a section of a camp's wall
    // (its stakes, `id`): its share of them (STORM.party), those nearest it, 1.5 m outside it,
    // facing it; the rest of its line posted again. Returns them; with none to send, none hacked
    // at for a while (STORM.again)
    #hackers(met, melee, { at, side }, id, storm) {
        const count = Math.min(melee.length, STORM.most, Math.max(STORM.least, Math.round(melee.length * STORM.party)));
        const hackers = melee.sort((a, b) => hypot(a.x - at[0], a.y - at[1]) - hypot(b.x - at[0], b.y - at[1]) || (a.id < b.id ? -1 : 1)).slice(0, count);
        const out = SIDES[side];

        if (!hackers.length) {
            storm.next = this.battle.time + STORM.again;
        }

        hackers.forEach((actor, k) => {
            const across = (k - (hackers.length - 1) / 2) * 1.2;

            Object.assign(actor.formation, { post: [at[0] + out[0] * 1.5 + out[1] * across, at[1] + out[1] * 1.5 - out[0] * across], facing: atan2(-out[0], -out[1]) });
            actor.siege = id;
            actor.leash = STORM.reach;
        });

        met.storming = null;

        return hackers;
    }

    // A section of a camp's palisade hacked down (its stakes felled, by `by`): broken open in the
    // war (war.breach) and so in the world; those who hacked it storming through it with the rest,
    // and another to be hacked at a while after (STORM.again)
    #hacked(id, by) {
        for (const [campId, storm] of this.storms) {
            if (storm.section?.id !== id) {
                continue;
            }

            const team = this.battle.actor(by)?.team;
            const realm = this.#realmOf(by) ?? (this.war.realm(team) ? team : null);
            const { index } = storm.section;

            this.battle.remove(id);
            this.#event("parted", { stakes: campId, ids: [id] });
            storm.section = null;
            storm.next = this.battle.time + STORM.again;

            for (const each of storm.attackers) {
                const met = this.armies.get(each);

                for (const actor of (met?.ids ?? []).map((one) => this.battle.actor(one)).filter(Boolean)) {
                    if (actor.siege === id) {
                        actor.siege = null;
                    }
                }

                if (met) {
                    met.storming = null;
                }
            }

            if (this.war.breach(campId, index, realm)) {
                storm.breaches++;
                storm.posted = "";
                this.#stockadesChanged();
                this.#event("breach", { camp: campId, people: this.war.camp(campId).realm, section: index, at: [...this.war.stockade(campId).sections[index].at], by: realm });
            }
        }
    }

    // A storm over, either side beaten (`held` by those within, or carried), as the war has it
    // (war.stormEnded): the beaten running (#watchArmies), the rest stood down
    #stormEnded(id, held, { killed, lost }) {
        const storm = this.storms.get(id);
        const camp = this.war.camp(id);
        const by = storm.by.map((each) => this.war.force(each)?.realm).find(Boolean) ?? null;

        this.#event("stormed", { camp: id, people: camp.realm, at: [...camp.at], held, army: storm.army, by, forces: [...storm.by], killed, lost, breaches: storm.breaches });
        this.war.stormEnded(id, { by: storm.by, held, killed, lost, breaches: storm.breaches });
        this.#stormOver(id);
    }

    // A camp's stockade no longer held or stormed: its stakes being hacked let go, and those who
    // held it and stormed it back in their lines
    #stormOver(id) {
        const storm = this.storms.get(id);

        this.storms.delete(id);

        if (storm.section) {
            this.battle.remove(storm.section.id);
            this.#event("parted", { stakes: id, ids: [storm.section.id] });
        }

        for (const each of [storm.army, ...storm.by]) {
            const met = each && this.armies.get(each);

            if (!met) {
                continue;
            }

            met.storming = null;

            for (const actor of met.ids.map((one) => this.battle.actor(one)).filter((actor) => actor?.formation)) {
                delete actor.formation.post;
                delete actor.formation.facing;
                actor.siege = null;
                actor.holds = null;
                actor.leash = ROLES[actor.formation.role]?.leash ?? actor.leash;
            }
        }
    }

    // As many of an army or reserve met stood up as the war has of it now: some let go if it's
    // lost some elsewhere (of whichever of its roles it has most more of than its people's mix
    // would, the rearmost of them: not all its archers and healers, at the back of its line),
    // more stood up behind its line (in its people's mix) if some have joined it, up to
    // ARMY_NEAR.most
    #keepUpArmy(force, met) {
        const alive = met.ids.filter((each) => this.battle.actor(each) && !this.battle.actor(each).dead);
        const want = Math.min(force.size, ARMY_NEAR.most);

        if (alive.length > want) {
            const left = alive.map((each) => this.battle.actor(each)).sort((a, b) => b.formation.slot[1] - a.formation.slot[1] || (a.id < b.id ? -1 : 1));
            const mix = {};
            const gone = [];

            for (const role of rolesOf(want, DOCTRINES[force.realm])) {
                mix[role] = (mix[role] ?? 0) + 1;
            }

            while (left.length > want) {
                const have = {};

                for (const actor of left) {
                    have[actor.formation.role] = (have[actor.formation.role] ?? 0) + 1;
                }

                // (Of the roles most over the mix, the rearmost one: `left` is rearmost first)
                const over = Math.max(...Object.keys(have).map((role) => have[role] - (mix[role] ?? 0)));
                const actor = left.find(({ formation }) => have[formation.role] - (mix[formation.role] ?? 0) === over);

                left.splice(left.indexOf(actor), 1);
                gone.push(actor);
            }

            for (const actor of gone) {
                this.battle.remove(actor.id);
                this.soldiers.delete(actor.id);
                met.ids.splice(met.ids.indexOf(actor.id), 1);
            }

            this.#event("parted", { army: force.id, ids: gone.map(({ id }) => id) });
        } else if (alive.length < want) {
            const have = {};
            const formation = this.battle.formations[met.formation];
            const behind = Math.max(0, ...alive.map((each) => this.battle.actor(each).formation.slot[1])) + 2;
            const free = this.#spots();
            const ids = [];

            for (const each of alive) {
                const role = this.battle.actor(each).formation.role;

                have[role] = (have[role] ?? 0) + 1;
            }

            // (The roles its people's mix wants that it's short of, as many as have joined it)
            const roles = rolesOf(want, DOCTRINES[force.realm])
                .filter((role) => !((have[role] ?? 0) > 0 && have[role]--))
                .concat(Array(want).fill("front"))
                .slice(0, want - alive.length);

            for (const role of roles) {
                let square;

                try {
                    square = free(placeAt(formation, [0, behind]));
                } catch {
                    break;
                }

                const id = `${force.id}/soldier-${this.fielded++}`;
                const kit = soldierOf(force.realm, role, ids.length);

                this.#enlist(id, { people: force.realm, ...kit, square, name: "soldier", record: { force: force.id, role }, patrol: [square], facing: formation.facing, leash: ROLES[role].leash, armed: true, formation: { id: met.formation, slot: [0, behind], role } });
                ids.push(id);
            }

            met.ids.push(...ids);

            if (ids.length) {
                this.#event("army", { force: force.id, people: force.realm, kind: force.kind, ids });
            }
        }
    }

    // Where reinforcements met make for: their army's or reserve's line, if it's met; else where it
    // is in the war
    #joining(column) {
        const theirs = this.armies.get(column.target);

        return (theirs && this.battle.formations[theirs.formation]?.anchor) ?? this.war.force(column.target)?.at ?? null;
    }

    // Reinforcements met at the end of their way (war.move): with theirs met, each of them still
    // standing takes a place at the back of its line, one of it now, as in the war; else (or, theirs
    // gone, gone home) they're let go
    #joined(id, column) {
        const met = this.armies.get(id);
        const theirs = this.war.force(column.target) ? this.armies.get(column.target) : null;

        if (theirs && this.battle.formations[theirs.formation]) {
            const standing = (ids) => ids.map((each) => this.battle.actor(each)).filter((actor) => actor && !actor.dead);
            const behind = Math.max(0, ...standing(theirs.ids).map((actor) => actor.formation?.slot[1] ?? 0)) + 2;
            const joining = standing(met.ids);

            for (const actor of joining) {
                actor.formation = { id: theirs.formation, slot: [0, behind], role: actor.formation?.role ?? "front" };
                this.soldiers.get(actor.id).force = column.target;
                theirs.ids.push(actor.id);
            }

            met.ids = met.ids.filter((each) => !joining.some((actor) => actor.id === each));
        }

        this.#letArmyGo(id);
    }

    // An army or reserve met let go: its soldiers gone from the world (with it, in the war), its line
    // with them
    #letArmyGo(id) {
        const { ids, formation } = this.armies.get(id);

        this.armies.delete(id);
        this.battle.formation(formation, null);

        for (const each of ids) {
            this.battle.remove(each);
            this.soldiers.delete(each);
        }

        this.fallen = this.fallen.filter(({ id: each }) => !ids.includes(each));
        this.#event("parted", { army: id, ids });
    }

    // --- Supply wagons near a player (docs/WAR.md *Supply*) ---

    // A supply wagon on its way near a player met: its ox and wagon where the war has it, laden
    // with its supplies, and its guards either side of it
    #meetWagon(force) {
        const [guardArms, patrolArms] = SOLDIERS_ARMS[force.realm] ?? SOLDIERS_ARMS.human;
        const free = this.#spots();
        const id = `${force.id}/wagon`;
        const met = { people: force.realm, mission: force.mission, to: force.target, wagon: id, ids: [], at: [...force.at], over: null };

        try {
            const square = free(force.at);

            this.wagons.set(id, { supply: force.id, people: force.realm, load: "supplies", seed: [...id].reduce((hash, character) => (Math.imul(hash, 31) + character.charCodeAt(0)) | 0, this.world.seed ?? 1) >>> 0 });
            this.battle.add({ id, kind: "wagon", name: "Supply wagon", team: force.realm, square, ai: "patrol", neutral: true, patrol: [square], speed: CONVOY_NEAR.pace });

            for (let k = 0; k < force.size; k++) {
                const guard = `${force.id}/guard-${k}`;
                const at = free([force.at[0] + (k % 2 ? 1 : -1) * CONVOY_NEAR.beside, force.at[1] + Math.floor(k / 2)]);

                this.#enlist(guard, { people: force.realm, weapon: k % 2 ? patrolArms : guardArms, square: at, name: "wagon guard", record: { supply: force.id }, patrol: [at], speed: CONVOY_NEAR.pace });
                met.ids.push(guard);
            }
        } catch {
            // (No free ground there: those found are out, and no more)
        }

        this.supplies.set(force.id, met);
        this.#event("supply", { wagon: force.id, people: force.realm, over: "met", ids: met.ids, wagons: this.battle.actor(id) ? [id] : [] });
    }

    // The supply wagons met, on their way: the war told where they've got to (war.move), and at
    // their army or depot, their load theirs and they're gone; else making for it where it is now
    // (an army met, where its line is), a little way on at a time, their guards beside them
    #watchWagons() {
        for (const [id, met] of [...this.supplies]) {
            const force = this.war.force(id);
            const wagon = this.battle.actor(met.wagon);

            if (met.over || force?.kind !== "supply" || !wagon) {
                continue;
            }

            met.at = [wagon.x, wagon.y];

            if (this.war.move(id, met.at, 0)) {
                this.#letWagonGo(id);
                continue;
            }

            const to = met.mission === "depot" ? this.war.depot(met.to) : this.war.force(met.to);
            const line = this.armies.has(met.to) ? this.battle.formations[this.armies.get(met.to).formation]?.anchor : null;
            const goal = line ?? to?.at;
            const [mark] = wagon.patrol ?? [];

            if (!goal || (mark && wagon.path.length && hypot(mark[0] + 0.5 - wagon.x, mark[1] + 0.5 - wagon.y) > 3)) {
                continue;
            }

            const [dx, dy] = [goal[0] - wagon.x, goal[1] - wagon.y];
            const distance = Math.max(hypot(dx, dy), 1e-6);
            const ahead = Math.min(distance, WAGON_NEAR.ahead);
            const [ux, uy] = [dx / distance, dy / distance];

            try {
                const free = this.#spots();

                Object.assign(wagon, { patrol: [free([wagon.x + ux * ahead, wagon.y + uy * ahead])], patrolIndex: 0 });

                for (const [k, each] of met.ids.entries()) {
                    const actor = this.battle.actor(each);
                    const side = k % 2 ? 1 : -1;

                    // (Not one fighting: back beside it once they're done)
                    if (actor && !actor.dead && actor.target === null) {
                        Object.assign(actor, { patrol: [free([wagon.x + ux * ahead - uy * side * CONVOY_NEAR.beside, wagon.y + uy * ahead + ux * side * CONVOY_NEAR.beside])], patrolIndex: 0 });
                    }
                }
            } catch {
                // (Nowhere free ahead just now: tried again next time)
            }
        }
    }

    // One of a supply wagon's guards fallen: once every one of them is, it's taken (war.wagonTaken:
    // for its army, a load that didn't get through), a little gold for each player there; its ox and
    // wagon left standing where they are
    #wagonFell(id, byId) {
        const met = this.supplies.get(id);

        if (!met || met.over || met.ids.some((each) => this.battle.actor(each) && !this.battle.actor(each).dead)) {
            return;
        }

        const realm = this.#realmOf(byId);
        const wagon = this.battle.actor(met.wagon);

        this.war?.wagonTaken(id, realm);
        met.over = "taken";
        Object.assign(wagon ?? {}, { ai: null, patrol: null, path: [], to: null });

        for (const player of this.players.values()) {
            const actor = this.battle.actor(player.id);

            if (!wagon || !actor || actor.dead || actor.map !== "town" || hypot(actor.x - wagon.x, actor.y - wagon.y) > WAGON_NEAR.near) {
                continue;
            }

            const ground = `ground-${this.nextGround++}`;

            this.ground.set(ground, { id: ground, bundle: { gold: WAGON_NEAR.worth, items: [] }, for: player.id, from: "supply", map: "town", square: this.#freeNear([Math.floor(wagon.x) + 1, Math.floor(wagon.y)]), until: this.battle.time + GROUND_MS });
            this.#event("spoils", { id: player.id, ground, from: id, creature: "supply" });
        }

        this.#event("supply", { wagon: id, people: met.people, over: "taken", by: realm });
    }

    // A supply wagon let go: its ox, wagon and guards gone from the world (with it, in the war; or
    // there, its load its army's or depot's)
    #letWagonGo(id) {
        const { ids, wagon } = this.supplies.get(id);

        this.supplies.delete(id);

        for (const each of [...ids, wagon]) {
            this.battle.remove(each);
            this.soldiers.delete(each);
            this.wagons.delete(each);
        }

        this.fallen = this.fallen.filter(({ id: each }) => !ids.includes(each));
        this.#event("parted", { supply: id, ids: [...ids, wagon] });
    }

    // --- A camp's skirmishers near a player (docs/WAR.md *The armies near a player*) ---

    // A pair of a camp's skirmishers sent out where a player's near (the war's "skirmishers"): out
    // of their camp, if it's pitched; else setting off on its side of what they're after, a little
    // way off it (SKIRMISH_NEAR.from). Two of its guard; each brought down, one of it fewer in the
    // war
    #sendSkirmishers({ camp: campId, realm, against, target, kind, at }) {
        const camp = this.war.camp(campId);

        if (!camp) {
            return;
        }

        const key = `${campId}/skirmish-${this.war.turn}`;
        const pitched = this.camps.get(campId);
        const [dx, dy] = [camp.at[0] - at[0], camp.at[1] - at[1]];
        const off = Math.max(hypot(dx, dy), 1e-6);
        const from = pitched ? pitched.fire : [at[0] + (dx / off) * Math.min(off, SKIRMISH_NEAR.from), at[1] + (dy / off) * Math.min(off, SKIRMISH_NEAR.from)];
        const [guardArms, patrolArms] = SOLDIERS_ARMS[realm] ?? SOLDIERS_ARMS.human;
        const free = this.#spots();
        const ids = [];

        try {
            for (let k = 0; k < ARMY_CAMP.pair; k++) {
                const id = `${key}-${k}`;
                const square = free([from[0] + (k ? 1.5 : -1.5), from[1]]);

                this.#enlist(id, { people: realm, weapon: k % 2 ? guardArms : patrolArms, square, name: "skirmisher", record: { camp: campId, share: 1, skirmish: key }, patrol: [square], leash: LEASH, speed: SKIRMISH_NEAR.pace });
                ids.push(id);
            }
        } catch {
            // (No free ground there: those found are out, and no more)
        }

        this.skirmishers.set(key, { camp: campId, people: realm, target, kind, ids, since: this.battle.time, fought: null, back: false });
        this.#event("skirmishers", { skirmish: key, camp: campId, people: realm, against, kind, ids });
    }

    // The skirmishers out, each pair: making for what they're after (the nearest of it stood up in
    // the world, else where it is in the war), a little way on at a time; fighting it once they're
    // up to it, a while; then back to their camp, as they are once it's gone, or they've been out
    // too long. Let go once they're back, or every player's far from them: if they never came up to
    // what they were after, the war reckons their falling on it there (war.skirmish)
    #watchSkirmishers() {
        const players = [...this.players.values()].map(({ id }) => this.battle.actor(id)).filter((actor) => actor && !actor.dead && actor.map === "town");

        for (const [key, out] of [...this.skirmishers]) {
            const standing = out.ids.map((each) => this.battle.actor(each)).filter((actor) => actor && !actor.dead);

            if (!standing.length || standing.every((actor) => players.every((player) => hypot(player.x - actor.x, player.y - actor.y) > SKIRMISH_NEAR.far))) {
                if (standing.length && out.fought === null && !out.back) {
                    this.war.skirmish(out.camp, out.target, standing.length);
                }

                this.#letSkirmishersGo(key);
                continue;
            }

            const [lead] = standing;
            const camp = this.war.camp(out.camp);
            const home = this.camps.get(out.camp)?.fire ?? camp?.at ?? null;
            const theirs = this.#standingOf(out.kind, out.target)
                .map((actor) => ({ actor, distance: hypot(actor.x - lead.x, actor.y - lead.y) }))
                .sort((a, b) => a.distance - b.distance);

            if (theirs.length && theirs[0].distance <= SKIRMISH_NEAR.close) {
                out.fought ??= this.battle.time;
            }

            const where = this.#thingAt(out.kind, out.target);
            const done = out.fought !== null ? this.battle.time - out.fought > SKIRMISH_NEAR.fight || !theirs.length : !where || this.battle.time - out.since > SKIRMISH_NEAR.most;

            // (Come up to where it was, and none of it there to fight: the war reckons it there)
            if (!out.back && out.fought === null && where && !theirs.length && hypot(where[0] - lead.x, where[1] - lead.y) <= SKIRMISH_NEAR.close) {
                this.war.skirmish(out.camp, out.target, standing.length);
                out.back = true;
            }

            if (done && !out.back) {
                out.back = true;

                for (const actor of standing) {
                    Object.assign(actor, { target: null, path: [] });
                }
            }

            if (out.back && (!home || hypot(home[0] - lead.x, home[1] - lead.y) <= SKIRMISH_NEAR.home)) {
                this.#letSkirmishersGo(key);
                continue;
            }

            const goal = out.back ? home : theirs.length ? [theirs[0].actor.x, theirs[0].actor.y] : where;

            // (Fighting: let be till they're done)
            if (!goal || (!out.back && standing.some((actor) => actor.target !== null))) {
                continue;
            }

            const [dx, dy] = [goal[0] - lead.x, goal[1] - lead.y];
            const distance = Math.max(hypot(dx, dy), 1e-6);
            const ahead = Math.min(distance, SKIRMISH_NEAR.ahead);

            try {
                const free = this.#spots();

                for (const [k, actor] of standing.entries()) {
                    const side = k ? 1.5 : -1.5;

                    Object.assign(actor, { patrol: [free([lead.x + (dx / distance) * ahead - (dy / distance) * side, lead.y + (dy / distance) * ahead + (dx / distance) * side])], patrolIndex: 0 });
                }
            } catch {
                // (Nowhere free ahead just now: tried again next time)
            }
        }
    }

    // Who of a thing of the war (of a kind: war.js #skirmishable) is stood up in the world near a
    // player, still standing: an army's, a reserve's or reinforcements' soldiers, a supply wagon's
    // guards, a convoy's, a camp's or a depot's sentries, a town's soldiers mustered, a works' guard
    #standingOf(kind, id) {
        const met = { army: this.armies, reserve: this.armies, reinforcement: this.armies, supply: this.supplies, convoy: this.convoys, camp: this.camps, depot: this.camps, town: this.mustered, works: this.worksOut }[kind]?.get(id);

        return (met?.ids ?? []).map((each) => this.battle.actor(each)).filter((actor) => actor && !actor.dead);
    }

    // Where a thing of the war is (of a kind: war.js #skirmishable), or null once it's gone
    #thingAt(kind, id) {
        const war = this.war;
        const thing = { town: () => war.town(id), works: () => war.workAt(id), camp: () => war.camp(id), depot: () => war.depot(id) }[kind]?.() ?? war.force(id);

        return thing?.at ?? null;
    }

    // A camp's skirmishers let go: gone from the world (back in their camp, or with it in the war)
    #letSkirmishersGo(key) {
        const { ids } = this.skirmishers.get(key);

        this.skirmishers.delete(key);

        for (const each of ids) {
            this.battle.remove(each);
            this.soldiers.delete(each);
        }

        this.fallen = this.fallen.filter(({ id: each }) => !ids.includes(each));
        this.#event("parted", { skirmish: key, ids });
    }

    // --- A seat's ruler and the captain of its guard (docs/WAR.md *The armies near a player*) ---

    // A seat's garrison put down near a player by a people who may take it (war.loss "leaders"):
    // its ruler and the captain of its guard out at its keep's door (or in the middle of the town,
    // with none found), its last stand. The player's told
    #leadersOut(id, by) {
        const town = this.war.town(id);
        const realm = town && this.war.realm(town.owner);

        if (!realm || this.leaders.has(id)) {
            return;
        }

        const keep = [...(this.world.interiors?.buildings.values() ?? [])].find(({ kind, place }) => kind === "keep" && (place === id || (place === "home" && this.world.start?.id === id)));
        const [x, y] = keep?.door.ends[0].arrive ?? town.at.map(Math.floor);
        const [guardArms] = SOLDIERS_ARMS[town.owner] ?? SOLDIERS_ARMS.human;
        const free = this.#spots();
        const ids = [];

        try {
            for (const [k, role] of ["ruler", "captain"].entries()) {
                const square = free([x + (k ? LEADERS_NEAR.apart : -LEADERS_NEAR.apart), y]);
                const one = `${id}/${role}-0`;

                this.#enlist(one, { people: town.owner, weapon: guardArms, square, name: "captain of the guard", record: { leader: id, role }, patrol: [square], leash: LEASH, hp: LEADERS_NEAR.hp });
                ids.push(one);
            }
        } catch {
            // (No free ground there: those found are out, and no more)
        }

        // (The ruler, by name: as the war has them)
        Object.assign(this.battle.actor(ids[0]) ?? {}, { name: `${realm.leader.title} ${realm.leader.name}` });
        this.leaders.set(id, { people: town.owner, ids, at: [x + 0.5, y + 0.5] });
        this.#event("leaders", { town: id, people: town.owner, by, ruler: realm.leader.name, title: realm.leader.title, ids });
    }

    // One of a seat's leaders fallen: once both are, by a people who may take it, it's theirs
    // (war.leadersFell), and told as a town taken is
    #leaderFell(id, byId) {
        const out = this.leaders.get(id);

        if (!out || out.ids.some((each) => this.battle.actor(each) && !this.battle.actor(each).dead)) {
            return;
        }

        const by = this.#realmOf(byId);

        this.leaders.delete(id);

        if (this.war.leadersFell(id, by) === "taken") {
            this.#event("taken", { town: id, by, people: out.people });
        }
    }

    // The seats' leaders out: back in their keep (let go) once every player's far from them, or
    // their garrison's been made up again, or the town's another's
    #watchLeaders() {
        const players = [...this.players.values()].map(({ id }) => this.battle.actor(id)).filter((actor) => actor && !actor.dead && actor.map === "town");

        for (const [id, out] of [...this.leaders]) {
            const town = this.war.town(id);

            if (!town || town.owner !== out.people || town.garrison > 0 || players.every((player) => hypot(player.x - out.at[0], player.y - out.at[1]) > LEADERS_NEAR.far)) {
                this.#letLeadersGo(id);
            }
        }
    }

    // A seat's leaders let go: back in their keep, gone from the world
    #letLeadersGo(id) {
        const { ids } = this.leaders.get(id);

        this.leaders.delete(id);

        for (const each of ids) {
            this.battle.remove(each);
            this.soldiers.delete(each);
        }

        this.fallen = this.fallen.filter(({ id: each }) => !ids.includes(each));
        this.#event("parted", { leaders: id, ids });
    }

    // --- Convoys (docs/WAR.md *Convoys*) ---

    // A convoy on the road near a player met: its captain ahead, its wagons in a column behind,
    // its guards beside them, each where they'd be along its road (CONVOY_NEAR), making for its mark
    #meetConvoy(convoy) {
        const [guardArms, patrolArms] = SOLDIERS_ARMS[convoy.realm] ?? SOLDIERS_ARMS.human;
        const free = this.#spots();
        const load = convoy.cargo ? Object.keys(convoy.cargo)[0] : null;
        const met = { people: convoy.realm, works: convoy.home, to: convoy.target, cargo: convoy.cargo ? { ...convoy.cargo } : null, ids: [], wagons: [], leg: convoy.leg, mark: null, at: [...convoy.at], over: null };

        try {
            met.mark = this.#ahead(convoy, convoy.at, convoy.leg, CONVOY_NEAR.ahead);

            // (Its first wagon where the war has it, its captain a wagon's length ahead)
            const spots = this.#column(convoy, this.#ahead(convoy, convoy.at, convoy.leg, CONVOY_NEAR.apart));

            for (let k = 0; k < CONVOY.wagons; k++) {
                const id = `${convoy.id}/wagon-${k}`;
                const square = free(spots.wagons[k]);

                this.wagons.set(id, { convoy: convoy.id, people: convoy.realm, load, seed: [...id].reduce((hash, character) => (Math.imul(hash, 31) + character.charCodeAt(0)) | 0, this.world.seed ?? 1) >>> 0 });
                this.battle.add({ id, kind: "wagon", name: load ? `Wagon of ${load}` : "Empty wagon", team: convoy.realm, square, ai: "patrol", neutral: true, patrol: [square], speed: CONVOY_NEAR.pace });
                met.wagons.push(id);
            }

            for (let k = 0; k < Math.min(convoy.size, spots.guards.length); k++) {
                const id = `${convoy.id}/guard-${k}`;

                this.#enlist(id, { people: convoy.realm, weapon: k % 2 ? patrolArms : guardArms, square: free(spots.guards[k]), name: k ? "convoy guard" : "convoy captain", record: { convoy: convoy.id }, patrol: [free(spots.guards[k])], speed: CONVOY_NEAR.pace });
                met.ids.push(id);
            }
        } catch {
            // (No free ground there: those found are out, and no more)
        }

        this.convoys.set(convoy.id, met);
        this.#event("convoy", { convoy: convoy.id, people: convoy.realm, ids: met.ids, wagons: met.wagons, load });
    }

    // Where a convoy's captain, wagons and guards are to be, its captain at `mark` on its road
    // and the rest strung out behind them along it: { guards: [[x, y]...] (its captain's first),
    // wagons: [[x, y]...] }
    #column(convoy, mark) {
        const way = convoy.path.slice(0, convoy.leg + 1).concat([convoy.at]).reverse();
        const back = (metres) => {
            let [x, y] = [mark[0] + 0.5, mark[1] + 0.5];
            let left = metres;

            for (const [px, py] of way) {
                const d = hypot(px - x, py - y);

                if (d >= left) {
                    return [x + ((px - x) / Math.max(d, 1e-6)) * left, y + ((py - y) / Math.max(d, 1e-6)) * left, (px - x) / Math.max(d, 1e-6), (py - y) / Math.max(d, 1e-6)];
                }

                [x, y, left] = [px, py, left - d];
            }

            return [x, y, 0, 1];
        };
        const wagons = Array.from({ length: CONVOY.wagons }, (_, k) => back(CONVOY_NEAR.apart * (k + 1)));
        const beside = ([x, y, dx, dy], side) => [x - dy * side * CONVOY_NEAR.beside, y + dx * side * CONVOY_NEAR.beside];
        const guards = [[mark[0], mark[1]], ...wagons.flatMap((at) => [beside(at, 1), beside(at, -1)])];

        return { guards, wagons: wagons.map(([x, y]) => [x, y]) };
    }

    // The convoys met, on along their road: where the first wagon's got to told to the war
    // (war.move); there or nearly at their mark, on to the next, strung out behind it; at the end
    // of their way, their goods in (and back for more), or home
    #watchConvoys() {
        for (const [id, met] of this.convoys) {
            const convoy = this.war.force(id);
            const leader = this.battle.actor(met.wagons[0]);

            if (met.over || convoy?.kind !== "convoy" || !leader) {
                continue;
            }

            met.at = [leader.x, leader.y];

            let leg = met.leg;

            while (leg < convoy.path.length - 1 && hypot(convoy.path[leg + 1][0] - leader.x, convoy.path[leg + 1][1] - leader.y) <= CONVOY_NEAR.past) {
                leg++;
            }

            const back = convoy.back;

            if (this.war.move(id, met.at, leg)) {
                // (Its goods in, and it turns for home, empty; or it's home, and done)
                if (!back && this.war.force(id)) {
                    const cargo = met.cargo;

                    met.cargo = null;
                    met.leg = 0;

                    for (const wagon of met.wagons) {
                        Object.assign(this.wagons.get(wagon) ?? {}, { load: null });
                    }

                    this.#event("convoyed", { convoy: id, people: met.people, over: "arrived", wagons: met.wagons, cargo });
                } else {
                    met.over = back ? "home" : "arrived";
                    this.#event("convoyed", { convoy: id, people: met.people, over: met.over });
                }

                continue;
            }

            met.leg = leg;

            if (distanceBetween(leader.square, met.mark) <= 3 + CONVOY_NEAR.apart || (!leader.path.length && !leader.to)) {
                try {
                    const free = this.#spots();
                    const [wx, wy] = met.mark;

                    met.mark = this.#ahead(convoy, met.at, leg, CONVOY_NEAR.ahead + CONVOY_NEAR.apart);

                    // (Nowhere further along its road to be got to, something standing on it (a
                    // building, a keep at its end): on past its next point, and at the last, there)
                    if (met.mark[0] === wx && met.mark[1] === wy) {
                        met.leg = Math.min(convoy.path.length - 1, leg + 1);
                    }

                    const spots = this.#column(convoy, met.mark);

                    for (const [k, each] of met.wagons.entries()) {
                        Object.assign(this.battle.actor(each) ?? {}, { patrol: [free(spots.wagons[k])], patrolIndex: 0 });
                    }

                    for (const [k, each] of met.ids.entries()) {
                        const actor = this.battle.actor(each);

                        // (Not one fighting: back on the road once they're done)
                        if (actor && !actor.dead && actor.target === null) {
                            Object.assign(actor, { patrol: [free(spots.guards[k] ?? spots.guards.at(-1))], patrolIndex: 0 });
                        }
                    }
                } catch {
                    // (Nowhere free ahead just now: tried again next time)
                }
            }
        }
    }

    // One of a convoy's guards fallen: once every one of them is, it's beaten, and its goods are
    // carried off (war.plundered): half of them the people's of whoever felled the last, and a share
    // of what they're worth in gold for each player there; its wagons left standing where they are
    #convoyFell(id, byId) {
        const met = this.convoys.get(id);

        if (!met || met.over || met.ids.some((each) => this.battle.actor(each) && !this.battle.actor(each).dead)) {
            return;
        }

        const realm = this.#realmOf(byId);
        const cargo = this.war?.plundered(id, realm) ?? met.cargo ?? {};
        const worth = Math.round(Object.values(cargo).reduce((sum, amount) => sum + amount, 0) * CONVOY_NEAR.worth);
        const wagon = this.battle.actor(met.wagons[0]);

        met.over = "plundered";

        for (const each of met.wagons) {
            Object.assign(this.battle.actor(each) ?? {}, { ai: null, patrol: null, path: [], to: null });
        }

        if (worth > 0 && wagon) {
            for (const player of this.players.values()) {
                const actor = this.battle.actor(player.id);

                if (!actor || actor.dead || actor.map !== "town" || hypot(actor.x - wagon.x, actor.y - wagon.y) > CONVOY_NEAR.near) {
                    continue;
                }

                const ground = `ground-${this.nextGround++}`;

                this.ground.set(ground, { id: ground, bundle: { gold: worth, items: [] }, for: player.id, from: "convoy", map: "town", square: this.#freeNear([Math.floor(wagon.x) + 1, Math.floor(wagon.y)]), until: this.battle.time + GROUND_MS });
                this.#event("spoils", { id: player.id, ground, from: id, creature: "convoy" });
            }
        }

        this.#event("convoyed", { convoy: id, people: met.people, over: "plundered", by: realm });
    }

    // A convoy let go: its captain, guards and wagons gone from the world (with it, in the war)
    #partWith(id) {
        const { ids, wagons } = this.convoys.get(id);

        this.convoys.delete(id);

        for (const each of [...ids, ...wagons]) {
            this.battle.remove(each);
            this.soldiers.delete(each);
            this.wagons.delete(each);
        }

        this.fallen = this.fallen.filter(({ id: each }) => !ids.includes(each));
        this.#event("parted", { convoy: id, ids: [...ids, ...wagons] });
    }

    // --- Fortifications (docs/WAR.md *Fortifications*) ---

    // The fortifications standing told to the world (overworld.js setForts): the squares under any
    // gone up or come down made again, and the navigation mesh's tiles there with them
    #fortsChanged() {
        const town = this.world.maps?.town;

        for (const box of town?.setForts?.(this.war?.forts ?? []) ?? []) {
            dropTiles(town, box);
        }
    }

    // The armies' camps' stockades standing told to the world (overworld.js setStockades; docs/
    // WAR.md M22, *The stockade*): each camp's once it's built, with its breaches. The squares
    // under any gone up, come down, breached or mended made again, the navigation mesh's tiles
    // there with them, and what's drawn there told ("stockades": the boxes of squares; not as the
    // world's made, or carried on, when it's all drawn new)
    #stockadesChanged({ tell = true } = {}) {
        const town = this.world.maps?.town;
        const built = (this.war?.camps ?? []).filter((camp) => camp.built !== null);
        const key = built.map((camp) => `${camp.id}:${brokenOf(camp)}`).join(" ");

        if (!town?.setStockades || key === this.stockaded) {
            return;
        }

        this.stockaded = key;

        const boxes = town.setStockades(built.map((camp) => ({ stockade: this.war.stockade(camp.id), broken: brokenOf(camp) })));

        for (const box of boxes) {
            dropTiles(town, box);
        }

        if (tell && boxes.length) {
            this.#event("stockades", { boxes });
        }
    }

    // A fortification near a player stood up in the battle: over its squares, shooting at its
    // people's enemies from its loops, as strong as it stands in the war
    #raiseFort(fort) {
        const spec = FORTS[fort.kind];

        this.battle.add({
            id: fort.id,
            kind: "fort",
            name: `${ADJECTIVES[fort.realm] ?? fort.realm} ${fort.kind === "garrison" ? "forward garrison" : "guard tower"}`,
            team: fort.realm,
            square: [Math.floor(fort.at[0]), Math.floor(fort.at[1])],
            ai: "fort",
            weapon: fort.kind,
            armed: true,
            hp: spec.hp,
            armor: FORT_NEAR.armor[fort.kind] ?? 0,
            footprint: footprintOf(fort),
        });
        Object.assign(this.battle.actor(fort.id), { hp: fort.hp });
        this.fortsOut.set(fort.id, { realm: fort.realm, kind: fort.kind });
        this.#event("fortOut", { fort: fort.id, kind: fort.kind, people: fort.realm });
        this.#musterSquads(fort);
    }

    // A fortification let go: gone from the battle (it stands on in the war, unless it's razed: by
    // the people `by`, if anyone's)
    #letFortGo(id, { razed = false, by = null } = {}) {
        const { realm, kind } = this.fortsOut.get(id) ?? {};

        this.battle.remove(id);
        this.fortsOut.delete(id);
        this.#event("fortDown", { fort: id, kind, people: realm, ...(razed ? { razed, by } : {}) });

        // (Its squads with it, as they're out of sight: razed, those still standing fight on)
        const squads = this.squadsOut.get(id);

        if (squads) {
            squads.broken = true;
        }
    }

    // A forward garrison stood up near a player: its squads out with it (SQUADS_NEAR), as many as
    // the war has in each: its patrols on their rounds, its assault team at its gate
    #musterSquads(fort) {
        if (!fort.squads) {
            return;
        }

        // (Some of them still about from when it was let go: theirs again, and made up)
        const kept = this.squadsOut.get(fort.id);

        if (kept) {
            kept.broken = false;
            kept.target = null;
            this.#fillSquads(fort);

            return;
        }

        const squares = squaresOf(this.world.maps.town);
        const toward = this.war.town(fort.toward)?.at;
        // (Its gate at its back, away from the enemy it faces: world/forts3d.js)
        const facing = toward ? atan2(fort.at[0] - toward[0], fort.at[1] - toward[1]) : 0;
        const near = ([x, y], within) => {
            try {
                return nearestFree(squares, [Math.round(x), Math.round(y)], { within });
            } catch {
                return null;
            }
        };
        const gate = near([fort.at[0] + sin(facing) * SQUADS_NEAR.gate, fort.at[1] + cos(facing) * SQUADS_NEAR.gate], 12);
        const rounds = SQUADS_NEAR.rounds.map((radius, k) =>
            Array.from({ length: SQUADS_NEAR.stops }, (_, j) => {
                const angle = facing + ((j + k / 2) * 2 * Math.PI) / SQUADS_NEAR.stops;

                return near([fort.at[0] + sin(angle) * radius, fort.at[1] + cos(angle) * radius], 16);
            }).filter(Boolean),
        );

        if (!gate) {
            return;
        }

        this.squadsOut.set(fort.id, { people: fort.realm, gate, rounds, ids: Object.fromEntries(SQUAD_NAMES.map((name) => [name, []])), next: Object.fromEntries(SQUAD_NAMES.map((name) => [name, 0])), target: null, broken: false });
        this.#fillSquads(fort, { first: true });
    }

    // A forward garrison's squads made up to what the war has in each: the first out where they'd
    // be (`first`), on their rounds and at its gate; those made up since, out of its gate
    #fillSquads(fort, { first = false } = {}) {
        const out = this.squadsOut.get(fort.id);
        const [guardArms, patrolArms] = SOLDIERS_ARMS[fort.realm] ?? SOLDIERS_ARMS.human;
        const free = this.#spots();

        // (Those still standing: the fallen are taken away a while after: #gone)
        const standing = (name) => out.ids[name].filter((each) => this.battle.actor(each) && !this.battle.actor(each).dead).length;
        const enlisted = [];

        try {
            SQUAD_NAMES.forEach((name, k) => {
                const round = name === "assault" ? null : out.rounds[k];

                for (let more = (fort.squads[k] ?? 0) - standing(name); more > 0; more--) {
                    const id = `${fort.id}/${name}-${out.next[name]++}`;
                    const square = free(first && round?.length ? round[0] : out.gate);
                    const orders = round?.length ? { patrol: round, leash: LEASH * 2 } : { patrol: [out.gate], leash: LEASH, facing: 0 };

                    this.#enlist(id, { people: fort.realm, weapon: round ? patrolArms : guardArms, square, name: round ? "patrol" : "vanguard", record: { fort: fort.id, squad: name }, ...orders });
                    out.ids[name].push(id);
                    enlisted.push(id);
                }
            });
        } catch {
            // (No free ground there: those found are out, and no more)
        }

        if (enlisted.length) {
            this.#event("squadsOut", { fort: fort.id, people: fort.realm, ids: enlisted });
        }

        this.#aimAssault(fort.id);
    }

    // A forward garrison's assault team sent against the nearest of the enemy's fortifications stood
    // up within SQUADS.reach of it, to the foot of its walls; back to its gate with none
    #aimAssault(id) {
        const out = this.squadsOut.get(id);
        const fort = this.war?.fort(id);

        if (!out || !fort) {
            return;
        }

        const target = [...this.fortsOut.keys()]
            .map((other) => this.war.fort(other))
            .filter((other) => other && other.id !== id && this.war.hostile(fort.realm, other.realm) && hypot(other.at[0] - fort.at[0], other.at[1] - fort.at[1]) <= SQUADS.reach)
            .sort((a, b) => hypot(a.at[0] - fort.at[0], a.at[1] - fort.at[1]) - hypot(b.at[0] - fort.at[0], b.at[1] - fort.at[1]))[0];

        if ((target?.id ?? null) === out.target) {
            return;
        }

        out.target = target?.id ?? null;

        const free = this.#spots();

        for (const each of out.ids.assault) {
            const actor = this.battle.actor(each);

            if (!actor || actor.dead) {
                continue;
            }

            try {
                // (Before its walls, on the side facing the garrison)
                const [x0, y0, x1, y1] = target ? footprintOf(target) : [0, 0, 0, 0];
                const goal = target ? free([Math.min(x1 + 2, Math.max(x0 - 2, fort.at[0])), Math.min(y1 + 2, Math.max(y0 - 2, fort.at[1]))]) : free(out.gate);

                Object.assign(actor, { patrol: [goal], patrolIndex: 0, leash: target ? LEASH * 3 : LEASH });
            } catch {
                // (Nowhere to stand there)
            }
        }
    }

    // The squads of forward garrisons out tended (the muster's): made up as the war makes them up,
    // the assault team sent where it's wanted; those of a garrison let go (no player near, or
    // razed) let go themselves as they're out of every player's sight
    #tendSquads() {
        const players = [...this.players.keys()].map((id) => this.battle.actor(id)).filter((actor) => actor && !actor.dead);

        for (const [id, out] of [...this.squadsOut]) {
            const fort = this.war.fort(id);

            if (!out.broken && fort && this.fortsOut.has(id)) {
                this.#fillSquads(fort);
                continue;
            }

            for (const name of SQUAD_NAMES) {
                out.ids[name] = out.ids[name].filter((each) => {
                    const actor = this.battle.actor(each);

                    if (actor && !actor.dead && players.some((player) => this.battle.canSee(player, actor))) {
                        return true;
                    }

                    if (actor && !actor.dead) {
                        this.battle.remove(each);
                        this.soldiers.delete(each);
                    }

                    return false;
                });
            }

            if (SQUAD_NAMES.every((name) => !out.ids[name].length)) {
                this.squadsOut.delete(id);
            }
        }
    }

    // --- Barracks (docs/WAR.md M16) ---

    // The war's town a barracks is in (its id: the one the player starts in, "home"), or null
    #barracksTown(building) {
        const id = building.place === "home" ? this.world.start?.id : building.place;

        return this.war?.town(id) ? id : null;
    }

    // A town's barracks' garrison stood up in it (BARRACKS_NEAR), of whoever holds the town: its
    // captain behind their desk, and its guardsmen at their posts, the furthest from the door
    // first, as many as its garrison has (QUARTERED); each one of it (`share` 1). Their ids are
    // stamped with when they came (the fallen of those before lie a while, under theirs)
    #quarter(building) {
        const id = this.#barracksTown(building);
        const town = id && this.war.town(id);
        const map = this.world.maps[building.maps[0]];

        if (!town || !map || this.quartered.has(id)) {
            return;
        }

        const most = QUARTERED[town.kind] ?? 0;
        const count = Math.min(most, Math.ceil((town.garrison / HOLDINGS[town.kind].garrison) * most));
        const { captain, posts } = barracksPosts(map);
        const [guardArms, patrolArms] = SOLDIERS_ARMS[town.owner] ?? SOLDIERS_ARMS.human;
        const free = this.#spots(map.id);
        const stamp = this.battle.time;
        const strong = { hp: Math.round(KINDS.soldier.hp * BARRACKS_NEAR.captain.hp), power: { melee: BARRACKS_NEAR.captain.power, ranged: BARRACKS_NEAR.captain.power } };
        const ids = [];

        try {
            for (const [k, post] of [captain, ...posts.slice(0, count)].entries()) {
                const each = `${id}/barracks-${stamp}-${k}`;
                const square = free(post.square);

                this.#enlist(each, { people: town.owner, weapon: k % 2 ? patrolArms : guardArms, square, name: k ? "guardsman" : "captain", record: { town: id, barracks: true, share: 1 }, map: map.id, patrol: [square], leash: BARRACKS_NEAR.leash, facing: post.facing, ...(k ? {} : strong) });
                ids.push(each);
            }
        } catch {
            // (No free floor: those found are in it, and no more)
        }

        this.quartered.set(id, { key: building.key, map: map.id, people: town.owner, ids, cleared: false, relief: null });
        this.#event("quartered", { town: id, people: town.owner, ids });
    }

    // A town's barracks' garrison let go (its building let go, or about to be made up): those
    // standing gone from the battle (the fallen taken away as ever)
    #unquarter(id) {
        const out = this.quartered.get(id);

        this.quartered.delete(id);

        for (const each of out?.ids ?? []) {
            const actor = this.battle.actor(each);

            if (actor && !actor.dead) {
                this.battle.remove(each);
                this.soldiers.delete(each);
            }
        }

        this.#event("unquartered", { town: id, ids: out?.ids ?? [] });
    }

    // One of a town's barracks' garrison fallen: made up a while after (RELIEF_MS); and once the
    // last of them's down, captain and guardsmen, the barracks is cleared, and made up sooner
    // (BARRACKS_NEAR.relief). It's part of the town's garrison (docs/WAR.md *Standing armies*):
    // the town's taken only once the whole of that's put down (war.loss). Said how it stands:
    // "taken" (it was, the last of them the last of it), "garrison" (some of it's left yet),
    // "peace" (the people of whoever brought the last down aren't at war with its holders), "age"
    // (the age doesn't let towns of its kind be taken)
    #barracksFell(id, by) {
        const out = this.quartered.get(id);

        if (!out || out.cleared) {
            return;
        }

        if (out.ids.some((each) => this.battle.actor(each) && !this.battle.actor(each).dead)) {
            out.relief = this.battle.time + RELIEF_MS;

            return;
        }

        const realm = this.#realmOf(by);
        const town = this.war.town(id);
        const how = !realm || !town ? null : town.owner === realm ? "taken" : !this.war.hostile(realm, town.owner) ? "peace" : !STAGES[this.war.stage].take.includes(town.kind) ? "age" : this.leaders.has(id) ? "leaders" : "garrison";

        Object.assign(out, { cleared: true, relief: this.battle.time + BARRACKS_NEAR.relief });
        this.#event("barracks", { town: id, by: realm, how, people: out.people });
    }

    // Each barracks' garrison made up, once no player's in it: its town changed hands (taken, or
    // stormed while a player was near), or it's due (cleared, or some of it fallen, a while ago).
    // Those still standing let go, and the town's garrison stood up in it afresh, of its holders
    #tendBarracks() {
        const players = [...this.players.keys()].map((id) => this.battle.actor(id)).filter(Boolean);

        for (const [id, out] of [...this.quartered]) {
            const changed = this.war.town(id)?.owner !== out.people;
            const due = out.relief !== null && this.battle.time >= out.relief;

            if ((!changed && !due) || players.some((actor) => actor.map === out.map)) {
                continue;
            }

            const building = this.world.interiors?.buildings.get(out.key);

            this.#unquarter(id);

            if (building && this.open.has(out.key)) {
                this.#quarter(building);
            }
        }
    }

    // --- The works (docs/WAR.md *The works*) ---

    // Where a works is set down in the world (sites.js: its heart, yard, posts and round), or null
    #worksSet(works) {
        const sites = this.world.maps.town?.sites;
        const site = this.#siteOf(works.id);

        if (!sites || !site) {
            return null;
        }

        sites.heartOf(site);

        return sites.set.get(site.id) ?? null;
    }

    // A works near a player: its guards out at its posts and on its round (#worksStations), as
    // many as it has; or, the wild's, the brigands holding it (#holdWorks)
    #manWorks(works) {
        const set = this.#worksSet(works);

        if (!set) {
            return;
        }

        if (works.held) {
            this.#holdWorks(works, set);

            return;
        }

        const free = this.#spots();
        const ids = [];

        try {
            for (const station of this.#worksStations(works, set)) {
                this.#worksGuard(works, station, free(station.at));
                ids.push(station.id);
            }
        } catch {
            // (No free ground there: those found are out, and no more)
        }

        this.worksOut.set(works.id, { people: works.owner, held: false, ids, share: works.guard / Math.max(1, ids.length), relief: null });
        this.#event("worksOut", { works: works.id, people: works.owner, ids });
    }

    // Where a works' guards stand and walk, as many as its guard has: the first at its posts,
    // facing out from its heart, and the rest on its round, each from a stop of their own:
    // [{ id, weapon, at, orders }] (as a town's #stations)
    #worksStations(works, set) {
        const squares = squaresOf(this.world.maps.town);
        const [guardArms, patrolArms] = SOLDIERS_ARMS[works.owner] ?? SOLDIERS_ARMS.human;
        const count = Math.min(WORKED.guard, Math.max(0, Math.round(works.guard)));
        const posted = set.posts.slice(0, Math.min(WORKS_OUT.posted, count));
        const stations = posted.map((at, k) => ({ id: `${works.id}/guard-${k}`, weapon: guardArms, at, orders: { leash: LEASH, facing: atan2(at[0] - set.heart[0], at[1] - set.heart[1]) } }));
        const round = set.round.map(([x, y]) => nearestFree(squares, [Math.floor(x), Math.floor(y)], { within: 12 }));

        for (let m = 0; posted.length + m < count; m++) {
            const from = (m * 3) % round.length;

            stations.push({ id: `${works.id}/round-${m}`, weapon: m % 2 ? guardArms : patrolArms, at: round[from], orders: { round: [...round.slice(from), ...round.slice(0, from)], leash: LEASH * 2 } });
        }

        return stations;
    }

    // One of a works' guards out at their station, on `square`
    #worksGuard(works, { id, weapon, orders: { round, leash, facing } }, square) {
        const orders = round ? { patrol: round, leash } : { patrol: [square], leash, facing };

        this.#enlist(id, { people: works.owner, weapon, square, name: round ? "patrol" : "guard", record: { works: works.id }, ...orders });
    }

    // A works' fallen guards relieved (RELIEF_MS after the last was taken away), as many as its
    // guard has now, each once no player can see where they'd come out (as a town's are: #relieve)
    #relieveWorks(works) {
        const out = this.worksOut.get(works.id);

        if ((out.relief ?? null) === null || this.battle.time < out.relief) {
            return;
        }

        const set = this.#worksSet(works);
        const players = [...this.players.keys()].map((id) => this.battle.actor(id)).filter((actor) => actor && !actor.dead);
        const stations = set ? this.#worksStations(works, set) : [];
        const free = this.#spots();
        const ids = [];
        let waiting = false;

        try {
            for (const station of stations) {
                if (out.ids.includes(station.id) || this.battle.actor(station.id)) {
                    continue;
                }

                const square = free(station.at);

                if (players.some((actor) => this.battle.canSee(actor, { map: "town", square }))) {
                    waiting = true;
                    continue;
                }

                this.#worksGuard(works, station, square);
                ids.push(station.id);
            }
        } catch {
            waiting = true;
        }

        out.ids.push(...ids);
        out.share = works.guard / Math.max(1, out.ids.length);
        out.relief = waiting ? out.relief : null;

        if (ids.length) {
            this.#event("relieved", { works: works.id, people: works.owner, ids });
        }
    }

    // A works held by the wild's brigands, near a player: their leader at its heart, the rest on
    // its round, as many as hold it (WORKS_OUT.most at most), of the band of the land it's in
    // (caches.js CACHE_BANDS: the same band at the same works), as strong as its land is dangerous
    #holdWorks(works, set) {
        const plan = this.world.plan;
        const biome = landAt(plan, ...set.heart).biome;
        const band = cacheBand(biome, createRandom([...works.id].reduce((hash, character) => (Math.imul(hash, 31) + character.charCodeAt(0)) | 0, plan.seed ?? 1) >>> 0));
        const homes = [...this.players.values()].map((player) => this.#homeOf(player)).filter(Boolean);
        const tier = homes.length ? tierAt(set.heart, homes, biome) : 1;
        const count = Math.min(WORKS_OUT.most, Math.max(1, Math.round(works.band)));
        const keeps = { works: works.id, temper: "territorial", guard: PLACE_BANDS.guard };
        const ids = this.#pack({ creature: band.leader, tier: Math.min(TIERS, tier + WORKS_OUT.lead), count: 1 }, set.heart, { ...keeps, master: true, roam: 2 });

        for (let k = 1; k < count; k++) {
            ids.push(...this.#pack({ creature: band.folk, tier, count: 1 }, set.round[k % set.round.length], { ...keeps, roam: 4 }));
        }

        this.worksOut.set(works.id, { people: null, held: true, band: band.id, ids, share: works.band / Math.max(1, ids.length), relief: null });
        this.#event("worksOut", { works: works.id, people: null, band: band.id, ids });
    }

    // A works' guards, or the brigands holding it, let go (still with it, in the war)
    #standDown(id) {
        const { ids, held } = this.worksOut.get(id);

        this.worksOut.delete(id);

        for (const each of ids) {
            if (held) {
                if (!this.battle.actor(each)?.dead) {
                    this.#release(each);
                }
            } else {
                this.battle.remove(each);
                this.soldiers.delete(each);
            }
        }

        this.fallen = this.fallen.filter(({ id: each }) => !ids.includes(each));
        this.#event("worksDown", { works: id, ids });
    }

    // One of a works' guards, or of the brigands holding it, fallen: once every one out is (the
    // rest of its guard or band with them), it's won by the people of whoever felled the last
    // (core/war.js win): seized from an enemy, or cleared of the wild
    #worksFell(id, by) {
        const out = this.worksOut.get(id);
        const works = this.war?.workAt(id);

        if (!out || !works || out.ids.some((each) => this.battle.actor(each) && !this.battle.actor(each).dead)) {
            return;
        }

        this.war.loss(id, works.held ? works.band : works.guard);

        const realm = this.#realmOf(by);
        const how = realm ? this.war.win(id, realm) : null;

        if (how) {
            this.#event("works", { works: id, how, by: realm, owner: works.owner });
        }
    }

    // Whose people someone fights for (a realm's id): a player's, their followers' and the
    // creatures they've called up, a people's soldiers'; or null
    #realmOf(id) {
        const leader = this.followers.get(id)?.leader ?? this.companions.get(id)?.leader ?? id;

        return this.players.get(leader)?.realm ?? this.soldiers.get(id)?.people ?? this.fortsOut.get(id)?.realm ?? null;
    }

    // An army's camp near a player pitched (docs/WAR.md *Standing armies*): its tents round its
    // fire, and its guard round them as sentries, facing out (up to CAMP.sentries of them, each
    // standing for a share of it)
    #pitch(camp) {
        const depot = Boolean(this.war.depot(camp.id));
        // (A camp's scout, one of its guard if it can spare one, out on its round: CAMP_NEAR)
        const scout = !depot && camp.guard >= 2 ? 1 : 0;
        const count = Math.min(CAMP.sentries, Math.max(1, camp.guard - scout));
        // (An army's camp laid out within its stockade, a depot round its fire)
        const stockade = depot ? null : this.war.stockade(camp.id);
        const { fire, tents, posts } = stockade ? { fire: stockade.fire, tents: stockade.tents, posts: stockade.posts.slice(0, count) } : campOf(camp, { sentries: count });
        // (A supply depot's stores, stacked either side of its fire)
        const stores = depot ? [-1, 1].map((side) => ({ at: [fire[0] + side * DEPOT_STORES, fire[1] + 0.5], facing: side > 0 ? Math.PI / 2 : -Math.PI / 2 })) : [];
        const [guardArms, patrolArms] = SOLDIERS_ARMS[camp.realm] ?? SOLDIERS_ARMS.human;
        const free = this.#spots();
        const ids = [];
        const share = camp.guard / (count + scout);

        try {
            for (const [k, post] of posts.entries()) {
                const id = `${camp.id}/sentry-${k}`;
                const square = free(post.at);

                this.#enlist(id, { people: camp.realm, weapon: k % 2 ? patrolArms : guardArms, square, name: "sentry", record: { camp: camp.id, share }, patrol: [square], leash: LEASH + 4, facing: post.facing });
                ids.push(id);
            }

            if (scout) {
                const round = Array.from({ length: CAMP_NEAR.rounds }, (_, k) => free([fire[0] + CAMP_NEAR.scout * sin((2 * Math.PI * k) / CAMP_NEAR.rounds), fire[1] + CAMP_NEAR.scout * cos((2 * Math.PI * k) / CAMP_NEAR.rounds)]));

                this.#enlist(`${camp.id}/scout`, { people: camp.realm, weapon: patrolArms, square: round[0], name: "scout", record: { camp: camp.id, share }, patrol: round, leash: LEASH + 4 });
                ids.push(`${camp.id}/scout`);
            }
        } catch {
            // (No free ground there: those found are out, and no more)
        }

        this.camps.set(camp.id, { people: camp.realm, ids, share, fire, tents, stores });
        this.#event("camp", { camp: camp.id, people: camp.realm, town: this.war.town(camp.toward) ? camp.toward : null, ids, fire, tents, stores });
    }

    // A camp struck: its sentries gone from the world (still with it, in the war), its tents down
    #strike(id) {
        const { ids } = this.camps.get(id);

        this.camps.delete(id);

        for (const each of ids) {
            this.battle.remove(each);
            this.soldiers.delete(each);
        }

        this.fallen = this.fallen.filter(({ id: each }) => !ids.includes(each));
        this.#event("strike", { camp: id, ids });
    }

    // --- The wild (docs/WILDS.md) ---

    // The wild's creatures about the players: those far from every player let go (and at
    // daybreak the night's own, out of sight); the wild camps and perilous sites near a player
    // come to life (and those far, let go); and each player out in the world with fewer than
    // WILDS.count about them (more after dark), one more pack put out, out of sight
    #wilds() {
        const plan = this.world.plan;

        if (!plan || !this.world.maps?.town?.chunk) {
            return;
        }

        const places = this.#whereabouts();
        const distanceTo = (actor) => Math.min(...places.map(([x, y]) => hypot(actor.x - x, actor.y - y)));
        const homes = [...this.players.values()].map((player) => ({ at: this.#whereIs(player), home: this.#homeOf(player) })).filter(({ at }) => at);
        const dark = this.#dark();

        // (The ground cleared long enough ago filled again; the players rested from elites long
        // enough, ready for another)
        this.cleared = this.cleared.filter(({ until }) => until > this.battle.time);

        for (const [id, until] of [...this.eliteRest]) {
            if (until <= this.battle.time) {
                this.eliteRest.delete(id);
            }
        }

        for (const [id, one] of [...this.wild]) {
            const actor = this.battle.actor(id);
            const roaming = actor && !actor.dead && !one.camp && !one.lair && !one.place && !one.cache && !one.dungeon && !one.works && actor.target === null;

            if (!actor) {
                this.#unwild(id);
            } else if (roaming && (distanceTo(actor) > (one.elite ? ELITES.far : WILDS.far) || (!dark && !outByDay(one.creature) && distanceTo(actor) > WILDS.from))) {
                this.#release(id);
            }
        }

        this.#wildCamps(homes);
        this.#lairs(places);
        this.#places(places, homes);
        this.#caches(homes);
        this.#dungeons(places);

        for (const player of this.players.values()) {
            const actor = this.battle.actor(player.id);

            if (!actor || actor.dead || actor.map !== "town") {
                continue;
            }

            const about = [...this.wild].filter(([id, one]) => {
                const beast = !one.camp && !one.lair && !one.place && !one.cache && !one.dungeon ? this.battle.actor(id) : null;

                return beast && !beast.dead && hypot(beast.x - actor.x, beast.y - actor.y) < WILDS.about;
            }).length;

            // (One fewer for each felled near them lately: the ground they cleared stays clear)
            const cleared = this.cleared.filter(({ at: [x, y] }) => hypot(x - actor.x, y - actor.y) < WILDS.about).length;
            const room = WILDS.count + (dark ? WILDS.night : 0) - about - cleared;

            // (Now and then, where the land's wild enough, an elite and its kind instead, further
            // off: ELITES)
            if (room > 0 && !(this.#eliteDue(player, actor) && this.random.next() < ELITES.chance && this.#putOutElite(player, [actor.x, actor.y], dark))) {
                this.#putOut([actor.x, actor.y], this.#homeOf(player), room, dark);
            }
        }
    }

    // Could an elite be put out near a player (ELITES): out in land of tier `least` or more (from
    // their home), none put out near them lately, and none about already
    #eliteDue(player, actor) {
        if (this.eliteRest.has(player.id) || tierAt([actor.x, actor.y], [this.#homeOf(player)]) < ELITES.least) {
            return false;
        }

        return !this.#elites().some((elite) => hypot(elite.x - actor.x, elite.y - actor.y) < ELITES.apart);
    }

    // The elites out in the world (their actors)
    #elites() {
        return [...this.wild].filter(([, one]) => one.elite === "lead").map(([id]) => this.battle.actor(id)).filter((actor) => actor && !actor.dead);
    }

    // An elite and its kind put out near a player (ELITES): further off than the wild's others,
    // clear of the settlements, the roads and the ground cleared lately, the round it walks on dry
    // land, far from any other elite; a kind that lives there (none of the perilous), led by one a
    // tier up on the land's, as many as a pack of theirs there. That player has no other for a
    // while. Whether one was put out
    #putOutElite(player, [x, y], dark = false) {
        const plan = this.world.plan;
        const home = this.#homeOf(player);
        const elites = this.#elites();

        for (let tries = 0; tries < 6; tries++) {
            const angle = this.random.next() * Math.PI * 2;
            const reach = ELITES.from + this.random.next() * (ELITES.to - ELITES.from);
            const at = [x + cos(angle) * reach, y + sin(angle) * reach];

            if (!clearOfSettlements(plan, at, WILDS.clear) || [at, ...eliteRound(at)].some((each) => landAt(plan, ...each).water) || this.world.maps.town.nearRoad?.(...at, WILDS.road) || this.cleared.some(({ at: [cx, cy] }) => hypot(cx - at[0], cy - at[1]) < WILDS.about) || elites.some((elite) => hypot(elite.x - at[0], elite.y - at[1]) < ELITES.apart)) {
                continue;
            }

            const encounter = encounterAt(plan, at, [home], this.random, dark);

            if (encounter && !CREATURES[encounter.creature].perilous && this.#pack(encounter, at, { elite: true }).length) {
                this.eliteRest.set(player.id, this.battle.time + ELITES.rest);

                return true;
            }
        }

        return false;
    }

    // Is it dark out (core/light.js torchesLit: from half through the dusk to half through the
    // dawn), the night's creatures about?
    #dark() {
        return torchesLit(elapsedOf(this.war));
    }

    // Where a player's home is: the town their people's players start in (the wild's tamest near
    // it: creatures.js tierAt)
    #homeOf(player) {
        const plan = this.world.plan;

        return RACE[player.realm] ? startFor(plan, player.realm).at : (this.world.start?.at ?? [0, 0]);
    }

    // A pack of what lives there put out near a place (out of sight of it, as strong as its
    // distance from `home` has it, what's about at that hour), clear of the settlements, the roads,
    // the water and the ground cleared lately, no bigger than `room`
    #putOut([x, y], home, room, dark = false) {
        const plan = this.world.plan;

        for (let tries = 0; tries < 6; tries++) {
            const angle = this.random.next() * Math.PI * 2;
            const reach = WILDS.from + this.random.next() * (WILDS.to - WILDS.from);
            const at = [x + cos(angle) * reach, y + sin(angle) * reach];

            if (!clearOfSettlements(plan, at, WILDS.clear) || landAt(plan, ...at).water || this.world.maps.town.nearRoad?.(...at, WILDS.road) || this.cleared.some(({ at: [cx, cy] }) => hypot(cx - at[0], cy - at[1]) < WILDS.about)) {
                continue;
            }

            const encounter = encounterAt(plan, at, [home], this.random, dark);

            if (encounter) {
                this.#pack({ ...encounter, count: Math.max(1, Math.min(room, encounter.count)) }, at);

                return;
            }
        }
    }

    // A pack of creatures put out at a place (`count` of `creature` at `tier`; out in the world, or
    // on a building's `map`), the first its leader (an `elite` pack's, an elite: ELITES); what
    // they're of (`camp`, `lair`, `place`, `cache`) and how they keep (`roam`, `temper`, `guard`,
    // the `round` they walk; one `pack` with others, if it's given): their ids
    #pack({ creature, tier, count }, [x, y], { master = false, map = "town", elite = false, ...more } = {}) {
        const free = this.#spots(map);
        const pack = `pack-${this.nextWild}`;
        const ids = [];

        try {
            for (let k = 0; k < count; k++) {
                const id = `wild-${this.nextWild++}`;

                // (One alone at its post: right there; a pack round it, three abreast)
                const at = count === 1 ? [x, y] : [x + (k % 3) - 1, y + Math.floor(k / 3)];
                // (An elite pack led by its kind's own elite, if it has one: the Goblin King; and
                // now and then one of its pack one of those it goes about with: a goblin bomber)
                const kind = elite && k === 0 ? eliteOf(creature) : CREATURES[creature].band && k > 0 ? memberOf(creature, k, this.random.next()) : creature;

                this.#rouse(id, kind, tier, free(at), { pack, leader: ids[0] ?? null, master: master && k === 0, map, ...more, ...(elite ? { elite: k === 0 ? "lead" : "escort" } : {}) });
                ids.push(id);
            }
        } catch {
            // (No free ground there: those found are out, and no more)
        }

        if (ids.length) {
            this.#event("roused", { ids, creature });
        }

        return ids;
    }

    // One of the wild's creatures into the world: as strong as its tier has it (creatures.js); an
    // elite (`elite` "lead") a tier up, stronger still, walking its round about where it's put
    // out, its kind with it (`elite` "escort"), and neither going far from there (ELITES)
    #rouse(id, creature, tier, square, { pack, leader, master = false, map = "town", camp = null, lair = null, place = null, cache = null, works = null, roam = null, temper = null, guard = null, round = null, dungeon = null, foe = null, champion = null, title = null, regalia = null, elite = null }) {
        const spec = CREATURES[creature];
        const lead = elite === "lead";
        // (A dungeon's boss or mini-boss: more of it and harder, CHAMPIONS, by its title; an elite,
        // ELITES)
        const stands = lead ? ELITES : (CHAMPIONS[champion] ?? { hp: 1, power: 1 });
        const at = lead ? Math.min(TIERS, tier + ELITES.up) : tier;
        const power = tierPower(at) * stands.power;
        const walks = lead ? { stops: eliteRound(square), at: 0 } : round;

        this.wild.set(id, { creature, tier: at, pack, camp, lair, master, ...(place ? { place } : {}), ...(cache ? { cache } : {}), ...(works ? { works } : {}), ...(dungeon ? { dungeon, foe, champion } : {}), ...(elite ? { elite } : {}) });
        this.battle.add({
            id,
            kind: "beast",
            name: title ?? (lead ? eliteName(creature) : spec.name),
            weapon: spec.weapon,
            team: WILD,
            square,
            map,
            ai: "wild",
            hp: Math.round(spec.hp * tierPower(at) * stands.hp),
            speed: spec.speed,
            chase: spec.chase,
            power: { melee: power, ranged: power },
            armor: spec.armor ?? 0,
            // (One holding a place gone into, `wary`: a moment's pause on first seeing someone come
            // in, battle.js WARY_MS; a dungeon's boss or mini-boss, its rank and its id in its theme,
            // `champion` and `regalia`: how it's drawn, beasts/champions.js; an elite, `elite`, seeing
            // further, `sight`, and drawn as a champion "elite")
            wild: { creature, tier: at, temper: temper ?? spec.temper, guard: guard ?? spec.guard ?? 0, roam: roam ?? spec.roam, leash: elite ? ELITES.loop + ELITES.leash : spec.leash + (roam ?? 0), pack, leader, menace: menaces(creature), unique: Boolean(spec.perilous), darkSight: Boolean(spec.darkSight), wary: map !== "town", ...traitsOf(creature), ...(walks ? { round: walks.stops, stop: walks.at } : {}), ...(champion ? { champion, regalia } : {}), ...(lead ? { elite: true, sight: ELITES.sight, champion: "elite", regalia: null } : {}) },
        });
    }

    // A creature let go (wandered off, far from every player)
    #release(id) {
        this.battle.remove(id);
        this.#unwild(id);
        this.#event("gone", { id });
    }

    // A creature no longer about: out of its camp's or site's too
    #unwild(id) {
        const one = this.wild.get(id);

        if (!one) {
            return;
        }

        this.wild.delete(id);

        for (const held of [one.camp && this.wildCamps.get(one.camp), one.lair && this.lairs.get(one.lair), one.place && this.held.get(one.place), one.cache && this.caches.get(one.cache), one.works && this.worksOut.get(one.works)]) {
            if (held) {
                held.ids = held.ids.filter((each) => each !== id);
            }
        }

        const delve = one.dungeon ? this.dungeons.get(one.dungeon) : null;

        if (delve) {
            delve.awake = delve.awake.map((ids) => ids?.filter((each) => each !== id) ?? null);
        }
    }

    // The wild camps (the world plan's) near a player: their folk out, round the camp and on its
    // patrols, as strong as its tier (from the home of the player nearest it: few, near home);
    // let go once every player's far
    #wildCamps(homes) {
        const near = (at, within) => homes.some(({ at: [x, y] }) => hypot(x - at[0], y - at[1]) < within);

        for (const [id, held] of [...this.wildCamps]) {
            const camp = this.world.plan.camps.find((each) => each.id === id);

            if (!near(camp.at, camp.roam + WILDS.campFar)) {
                for (const each of [...held.ids]) {
                    if (!this.battle.actor(each)?.dead) {
                        this.#release(each);
                    }
                }

                this.wildCamps.delete(id);
            }
        }

        for (const camp of this.world.plan.camps) {
            if (this.wildCamps.has(camp.id) || !near(camp.at, camp.roam + WILDS.camp) || !CAMP_FOLK[camp.faction]) {
                continue;
            }

            const nearest = homes.reduce((best, each) => (hypot(each.at[0] - camp.at[0], each.at[1] - camp.at[1]) < hypot(best.at[0] - camp.at[0], best.at[1] - camp.at[1]) ? each : best));
            const tier = campTier(camp, nearest.home);
            const creature = campFolk(camp.faction, tier);
            const patrols = Math.min(camp.patrols, 1 + Math.floor(tier / 3));
            // (Round where it's pitched, on the flattest ground near its cell's middle: overworld.js)
            const at = this.world.maps?.town?.campAt?.(camp) ?? camp.at;
            const ids = this.#pack({ creature, tier, count: Math.min(5, 1 + Math.floor(tier / 2)) }, at, { camp: camp.id, roam: 4, temper: "territorial" });

            // (Its patrols, roaming out from it: as many as it has, fewer near home)
            for (let k = 0; k < patrols; k++) {
                const angle = ((k + 0.5) / patrols) * Math.PI * 2;
                const out = camp.roam * 0.5;

                ids.push(...this.#pack({ creature, tier, count: Math.max(1, packOf(creature, tier) - (tier <= 2 ? 1 : 0)) }, [at[0] + cos(angle) * out, at[1] + sin(angle) * out], { camp: camp.id, roam: camp.roam * 0.4 }));
            }

            this.wildCamps.set(camp.id, { ids });
        }
    }

    // The perilous sites (a dragon's lair, the ruined castles) near a player: their master (unless
    // slain lately) and its guards there; let go once every player's far
    #lairs(places) {
        const near = (at, within) => places.some(([x, y]) => hypot(x - at[0], y - at[1]) < within);

        for (const [id, held] of [...this.lairs]) {
            const site = this.#siteOf(id);

            if (!near(site.at, LAIRS[site.kind].near * 2)) {
                for (const each of [...held.ids]) {
                    if (!this.battle.actor(each)?.dead) {
                        this.#release(each);
                    }
                }

                this.ground.delete(`chest-${id}`);
                this.lairs.delete(id);
            }
        }

        for (const site of this.world.plan.sites) {
            const lair = LAIRS[site.kind];

            if (!lair || this.lairs.has(site.id) || !near(site.at, lair.near)) {
                continue;
            }

            const ids = [];
            const [master, tier] = lair.master;
            // (Where it's held: the open ground in its middle, a ruined castle's courtyard or the
            // dragon's hollow, as it's built: sites.js)
            const at = this.world.maps.town?.sites?.heartOf(site) ?? site.at;

            const place = placesOf(this.world.plan).find((each) => each.id === site.id);
            const cleared = this.war && place && holderOf(this.world.plan, place, this.war.places[site.id], this.war.turn) === "cleared";

            // (And, a lair that can be gone into, its hoard at the back of it: a chest, locked while
            // its master lives)
            const inside = this.#inside(site);
            const hoard = inside?.chest ?? null;

            // (A master that keeps within, by its hoard: a ruined castle's wight lord in its keep)
            const keeps = lair.within ? inside?.leader : null;

            if ((this.slain[site.id] ?? -Infinity) <= this.battle.time && !cleared) {
                ids.push(...this.#pack({ creature: master, tier, count: 1 }, keeps?.square ?? at, { lair: site.id, master: true, roam: 3, map: keeps?.map ?? "town" }));

                if (hoard) {
                    this.ground.set(`chest-${site.id}`, { id: `chest-${site.id}`, chest: true, locked: true, for: null, map: hoard.map, square: hoard.square, place: site.id, until: null });
                }
            }

            // (Its guards round its heart; half of each kind within with it, if it keeps within,
            // each at a post of their own)
            let post = 0;

            lair.guards.forEach(([creature, count, guardTier], k) => {
                const angle = (k / lair.guards.length) * Math.PI * 2;
                const posts = keeps ? (inside.guards ?? []).slice(post, post + Math.ceil(count / 2)) : [];

                post += posts.length;

                for (const { map, square } of posts) {
                    ids.push(...this.#pack({ creature, tier: guardTier, count: 1 }, square, { lair: site.id, roam: 3, map }));
                }

                if (count > posts.length) {
                    ids.push(...this.#pack({ creature, tier: guardTier, count: count - posts.length }, [at[0] + cos(angle) * 6, at[1] + sin(angle) * 6], { lair: site.id, roam: 6 }));
                }
            });

            this.lairs.set(site.id, { ids, maps: inside?.maps ?? [], hoard });
        }
    }

    #siteOf(id) {
        return this.world.plan.sites.find((site) => site.id === id);
    }

    // A place worth finding that can be gone into (a cave, the dragon's lair, a broken watchtower,
    // the humans' abbeys and manors: sites.js `entrance`), its floors made: { maps (their ids),
    // leader, chest (where its plan has them: insides.js "l" and "h", { map, square }), guards
    // (where they stand: "g", a list) }, or, for an abbey's temple and a manor's keep, by their
    // altar and thrones and up from their door (insides.js heldWithin); all of them clear of where
    // anyone comes in (insides.js clearOfWaysIn); or null for a site that can't be gone into
    #inside(site) {
        const set = this.world.maps.town?.sites?.set.get(site.id);
        const building = set?.entrance ? this.#building(`site:${site.id}`) : null;

        if (!building) {
            return null;
        }

        this.world.interiors.make(building.key);

        const marks = (char) => building.maps.flatMap((id) => (this.world.maps[id].marks[char] ?? []).map((square) => ({ map: id, square: [...square] })));
        const [first] = building.maps;
        const held = marks("l").length ? null : heldWithin(building.kind, this.world.maps[first]);
        const on = (square) => (square ? { map: first, square } : null);
        const leader = marks("l")[0] ?? on(held?.leader);
        const guards = held ? held.guards.map(on).filter(Boolean) : marks("g");

        // (All of them, its leader too, kept clear of where anyone comes in, its door and its
        // stairs, each floor's: on its far side, so no one's set on as they step in)
        const ways = [building.door?.ends[1], ...(building.stairs?.ends ?? [])].filter((end) => end?.arrive);
        const posts = [leader, ...guards].filter(Boolean);

        for (const id of building.maps) {
            const here = posts.filter((post) => post.map === id);
            const clear = clearOfWaysIn(this.world.maps[id], ways.filter((end) => end.map === id).map((end) => end.arrive), here.map((post) => post.square));

            here.forEach((post, k) => (post.square = clear[k] ?? post.square));
        }

        return { maps: [...building.maps], leader, chest: marks("h")[0] ?? on(held?.chest), guards };
    }

    // The free square in the world nearest a square (or that square, if none's free near)
    #freeNear(square) {
        try {
            return this.#spots()(square);
        } catch {
            return square;
        }
    }

    // The places worth finding held by outlaws or the dead (core/places.js), near a player: their
    // band out round the place's heart, as many and as strong as the place is big and its land
    // dangerous, their leader in its middle by a chest, locked; let go once every player's far
    // (and back as many as ever when one comes near again, unless it's been cleared). The ruined
    // castles and the dragon's lair keep their own masters (#lairs).
    #places(places, homes) {
        const plan = this.world.plan;
        const near = (at, within) => places.some(([x, y]) => hypot(x - at[0], y - at[1]) < within);

        if (!this.war) {
            return;
        }

        for (const [id, held] of [...this.held]) {
            if (!near(held.at, PLACE_BANDS.far)) {
                for (const each of [...held.ids]) {
                    if (!this.battle.actor(each)?.dead) {
                        this.#release(each);
                    }
                }

                this.ground.delete(`chest-${id}`);
                this.held.delete(id);
            }
        }

        for (const place of placesOf(plan)) {
            if (this.held.has(place.id) || LAIRS[place.kind] || !near(place.at, PLACE_BANDS.near)) {
                continue;
            }

            const holder = holderOf(plan, place, this.war.places[place.id], this.war.turn);
            const band = bandOf(place, holder);
            const site = band ? this.#siteOf(place.id) : null;

            if (!site || !homes.length) {
                continue;
            }

            // (Where it's held: the open ground in its middle, as it's built: sites.js; or, a
            // place that can be gone into, within: its leader and their chest at its back (a
            // cave's) or its top (a tower's), as many of the band as it has room for guarding the
            // way, the rest outside)
            const at = this.world.maps.town?.sites?.heartOf(site) ?? site.at;
            const inside = this.#inside(site);
            const tier = tierAt(at, homes.map(({ home }) => home), landAt(plan, ...at).biome);
            const count = PLACE_BANDS.count[place.size] + Math.floor(tier / PLACE_BANDS.per);
            const ring = PLACE_BANDS.ring[place.size];
            const keeps = { place: place.id, temper: "territorial", guard: PLACE_BANDS.guard };
            const leader = inside?.leader ?? { map: "town", square: at };
            const ids = this.#pack({ creature: band.leader, tier: tier + PLACE_BANDS.lead, count: 1 }, leader.square, { ...keeps, master: true, roam: 2, map: leader.map });
            const within = (inside?.guards ?? []).slice(0, Math.ceil(count / 2));
            let member = 0;

            // (Each of the band its kind: the dead's bones, ghosts and wraiths in turn)
            for (const { map, square } of within) {
                ids.push(...this.#pack({ creature: bandFolk(band, member++), tier, count: 1 }, square, { ...keeps, roam: 3, map }));
            }

            // (The rest round its heart; or, a place gone into, before its way in, out on the open
            // ground there: not crowding the way itself, a deep one's, as the tree hall's)
            const way = inside ? this.world.maps.town.sites.set.get(site.id).entrance : null;
            const middle = way ? [way.outside[0] + 0.5 + sin(way.facing) * ring, way.outside[1] + 0.5 + cos(way.facing) * ring] : at;

            for (let k = 0; k < count - within.length; k++) {
                const angle = ((k + 0.5) / (count - within.length)) * Math.PI * 2;

                ids.push(...this.#pack({ creature: bandFolk(band, member++), tier, count: 1 }, [middle[0] + cos(angle) * ring, middle[1] + sin(angle) * ring], { ...keeps, roam: 4 }));
            }

            // (The chest on open ground by the leader: not in a wall)
            const { map, square: chest } = inside?.chest ?? { map: "town", square: this.#freeNear([Math.floor(at[0] + 1.5), Math.floor(at[1])]) };

            this.held.set(place.id, { ids, leader: ids[0] ?? null, at, tier, holder, relic: Boolean(band.relic), chest, map, maps: inside?.maps ?? [], race: place.race, cleared: false });
            this.ground.set(`chest-${place.id}`, { id: `chest-${place.id}`, chest: true, locked: true, for: null, map, square: chest, place: place.id, until: null });
        }
    }

    // One of a place's band fallen: once every one of them is (their leader with them), the place
    // is cleared (the war keeps it: core/places.js holderOf, empty a while), and its chest opened,
    // a share of what's in it for each player near
    #placeFell(id) {
        const held = this.held.get(id);

        if (!held || held.cleared || held.ids.some((each) => this.battle.actor(each) && !this.battle.actor(each).dead)) {
            return;
        }

        held.cleared = true;
        this.war?.clearPlace(id);
        this.#clearedBy(id, held.at, held.maps);
        this.#opened(id, "chest", { at: held.at, maps: held.maps, map: held.map ?? "town", square: held.chest, people: held.race ?? "human", tier: held.tier, relic: held.relic });
        this.#event("cleared", { place: id, holder: held.holder });
    }

    // A place's chest (`kind`: "chest", or a dragon's "hoard"; or an adventurers' "cache") opened:
    // in its stead, a share of what's in it for each player at the place (core/progress.js LOOT:
    // the gear in it of the place's `people`, a human's at the ruins and the caves; more gold the
    // more dangerous its land, CHEST_GOLD; and what the dead guarded, one of their old relics
    // each, `relic`; a cache's, core/caches.js rollCache, as rich as its band was strong), theirs
    // alone to take, where it stood (`map`, `square`)
    #opened(id, kind, { at, maps, map, square, people, tier, relic = false }) {
        this.ground.delete(`chest-${id}`);

        for (const player of this.players.values()) {
            const actor = this.battle.actor(player.id);

            if (!actor || actor.dead || !this.#atPlace(actor, at, maps)) {
                continue;
            }

            const bundle = kind === "cache" ? rollCache(tier, this.random, { people }) : rollLoot(kind, this.random, { people, relic });

            if (kind !== "cache") {
                bundle.gold = Math.round(bundle.gold * (1 + CHEST_GOLD * (tier - 1)));
            }

            const ground = `ground-${this.nextGround++}`;

            this.ground.set(ground, { id: ground, bundle, for: player.id, from: "chest", map, square: [...square], until: this.battle.time + GROUND_MS });
            // (Told of the relic in it by name, if there's one: the last thing in it)
            this.#event("spoils", { id: player.id, ground, from: id, creature: "chest", ...(kind === "cache" ? { cache: true } : {}), ...(relic ? { relic: bundle.items.at(-1).name } : {}) });
        }
    }

    // Whether someone's at a place: out in the world, near enough its heart (`at`), or within it
    // (on one of its `maps`)
    #atPlace(actor, at, maps = []) {
        return actor.map === "town" ? hypot(actor.x - at[0], actor.y - at[1]) <= PLACE_BANDS.ring.large + SPOILS_REACH : maps.includes(actor.map);
    }

    // A place cleared (`id`, its heart `at`, the `maps` within it): the guild's contract to clear
    // it done for each player who was there for it (core/standing.js "clear")
    #clearedBy(id, at, maps = []) {
        for (const player of this.players.values()) {
            const actor = this.battle.actor(player.id);

            if (!actor || !this.#atPlace(actor, at, maps)) {
                continue;
            }

            for (const request of player.standing.requests) {
                if (request.kind === "clear" && request.state === "open" && request.target.place === id) {
                    this.#settle(player, request, "ready");
                }
            }
        }
    }

    // The adventurers' caches (core/caches.js): those every player's left far behind let go (their
    // guards, and the cache); and, for each player crossing the wilds (out of the settlements),
    // one put out ahead of them once they've crossed as far as the last one's CACHES.every had it
    #caches(homes) {
        for (const [id, cache] of [...this.caches]) {
            const fighting = cache.ids.some((each) => (this.battle.actor(each)?.target ?? null) !== null);

            if (!fighting && !homes.some(({ at: [x, y] }) => hypot(x - cache.at[0], y - cache.at[1]) < CACHES.far)) {
                for (const each of [...cache.ids]) {
                    if (!this.battle.actor(each)?.dead) {
                        this.#release(each);
                    }
                }

                this.ground.delete(`chest-${id}`);
                this.caches.delete(id);
                this.#event("cache", { cache: id, change: "gone" });
            }
        }

        for (const player of this.players.values()) {
            const actor = this.battle.actor(player.id);

            if (!actor || actor.dead || actor.map !== "town") {
                continue;
            }

            const at = [actor.x, actor.y];
            const was = this.travel.get(player.id);

            if (!was) {
                this.travel.set(player.id, { at, walked: 0, next: null, heading: null });

                continue;
            }

            // (Crossing the wilds: not a step carried by magic, nor one in a settlement)
            const [dx, dy] = [at[0] - was.at[0], at[1] - was.at[1]];
            const step = hypot(dx, dy);

            if (step > 0.2 && step <= CACHES.jump) {
                was.heading = [dx / step, dy / step];

                if (clearOfSettlements(this.world.plan, at, WILDS.clear)) {
                    was.walked += step;
                }
            }

            was.at = at;

            // (How far the next is, rolled once they're as far as the least it could be)
            if (was.next === null && was.walked >= CACHES.every[0]) {
                was.next = this.random.int(...CACHES.every);
            }

            if (was.next !== null && was.walked >= was.next && this.#putCache(actor, was.heading, homes)) {
                was.walked = 0;
                was.next = null;
            }
        }
    }

    // A cache put out ahead of a player (`actor`, going the way of `heading`, or any way), as
    // CACHES has it, where it may be (cacheClear: off the roads, away from everywhere; openAround:
    // on open ground): its band of the land there, as strong as the land or the mightiest player
    // near it, their leader by it and the rest on their round about it; whether it could be
    #putCache(actor, heading, homes) {
        const plan = this.world.plan;
        const overworld = this.world.maps.town;
        const squares = squaresOf(overworld);
        const others = [...this.caches.values()].map(({ at }) => at);
        const [hx, hy] = heading ?? [0, 1];

        for (let tries = 0; tries < 12; tries++) {
            const turn = (this.random.next() * 2 - 1) * (heading && tries < 8 ? CACHES.spread : Math.PI);
            const reach = CACHES.ahead[0] + this.random.next() * (CACHES.ahead[1] - CACHES.ahead[0]);
            const [c, s] = [cos(turn), sin(turn)];
            const at = [actor.x + (hx * c - hy * s) * reach, actor.y + (hx * s + hy * c) * reach];

            const chest = [Math.floor(at[0]), Math.floor(at[1])];
            const heart = [chest[0] + 0.5, chest[1] + 0.5];

            if (!cacheClear(plan, heart, { nearRoad: (x, y, within) => overworld.nearRoad?.(x, y, within) ?? false, others }) || !openAround(heart, (x, y) => squares.blocked(x, y))) {
                continue;
            }

            const might = Math.max(0, ...[...this.players.values()].filter((player) => {
                const each = this.battle.actor(player.id);

                return each && each.map === "town" && hypot(each.x - heart[0], each.y - heart[1]) <= CACHES.near;
            }).map((player) => player.progress.might()));
            const tier = cacheTier(tierAt(heart, homes.map(({ home }) => home), landAt(plan, ...heart).biome), might);
            const band = cacheBand(landAt(plan, ...heart).biome, this.random);
            const count = cacheCount(tier, this.random);
            const id = `cache-${this.nextCache++}`;
            const keeps = { cache: id, pack: id, temper: "territorial", guard: CACHES.guard };
            const ids = this.#pack({ creature: band.leader, tier: Math.min(TIERS, tier + CACHES.lead), count: 1 }, [heart[0] + 1.5, heart[1]], { ...keeps, master: true, roam: 2 });
            const round = roundOf(heart);

            startsOf(count - 1).forEach((stop) => {
                ids.push(...this.#pack({ creature: band.folk, tier, count: 1 }, round[stop], { ...keeps, roam: CACHES.round * 2, round: { stops: round, at: stop } }));
            });

            this.caches.set(id, { id, at: heart, chest, band: band.id, tier, ids, opened: false });
            this.ground.set(`chest-${id}`, { id: `chest-${id}`, chest: true, locked: true, cache: id, for: null, map: "town", square: [...chest], until: null });
            this.#event("cache", { cache: id, change: "put", band: band.id, at: heart, ids });

            return true;
        }

        return false;
    }

    // One of a cache's guards fallen: once every one of them is, it's opened, a share of what's in
    // it for each player near
    #cacheFell(id) {
        const cache = this.caches.get(id);

        if (!cache || cache.opened || cache.ids.some((each) => this.battle.actor(each) && !this.battle.actor(each).dead)) {
            return;
        }

        cache.opened = true;
        this.#opened(id, "cache", { at: cache.at, maps: [], map: "town", square: cache.chest, people: "human", tier: cache.tier });
        this.#event("cache", { cache: id, change: "opened" });
    }

    // --- The dungeons (core/dungeons: docs/DUNGEONS.md) ---

    // The dungeons near the players, or with players in them: each made the first time a player
    // comes within DELVES.near of its way in (its levels, as many times made again as it's been
    // cleared); each level's foes woken while a player's on it or on the level above (the first
    // while one's near its way in), and let go again once no one is, those slain staying slain;
    // its chests set out with its level's foes, the boss's hoard locked while the boss stands; and
    // once its hoard's been opened and every player's left it (none in it, none within DELVES.far),
    // made again, anew
    #dungeons(places) {
        const interiors = this.world.interiors;

        if (!interiors) {
            return;
        }

        // (Which levels of which dungeons have players on them)
        const on = new Map();

        for (const player of this.players.values()) {
            const actor = this.battle.actor(player.id);
            const building = actor && !actor.dead ? interiors.of(actor.map) : null;

            if (building?.kind === "dungeon") {
                on.set(building.site, (on.get(building.site) ?? new Set()).add(building.maps.indexOf(actor.map)));
            }
        }

        for (const site of this.world.plan.sites) {
            if (site.kind !== "dungeon") {
                continue;
            }

            const within = (reach) => places.some(([x, y]) => hypot(x - site.at[0], y - site.at[1]) < reach);
            const near = within(DELVES.near);
            const levels = on.get(site.id) ?? new Set();
            let delve = this.dungeons.get(site.id);

            if (!delve && !near && !levels.size) {
                continue;
            }

            const key = `site:${site.id}`;
            const building = this.#building(key);

            if (!building) {
                continue;
            }

            if (!delve) {
                delve = { generation: building.generation ?? 0, awake: [], dead: [], opened: [], cleared: false };
                this.dungeons.set(site.id, delve);
            }

            // (Cleared, and everyone gone: made again)
            if (delve.cleared && !levels.size && !within(DELVES.far)) {
                this.#remakeDungeon(site, building, delve);
                continue;
            }

            if (!building.made && (near || levels.size)) {
                interiors.make(key);
            }

            building.maps.forEach((map, k) => {
                const wanted = levels.has(k) || levels.has(k - 1) || (k === 0 && near);

                if (wanted && !delve.awake[k]) {
                    this.#wakeLevel(site, building, delve, k);
                } else if (!wanted && delve.awake[k]) {
                    this.#sleepLevel(building, delve, k);
                }
            });
        }
    }

    // A dungeon's level's foes woken (those not slain), each pack of them a pack, its boss and
    // mini-bosses their titles, all keeping to their rooms; and its chests set out (those not
    // opened), the hoard locked while the boss stands
    #wakeLevel(site, building, delve, k) {
        const level = building.dungeon.levels[k];
        const map = building.maps[k];
        const ids = [];

        for (const pack of level.packs) {
            const group = `pack-${this.nextWild}`;
            const out = [];

            pack.foes.forEach((foe, j) => {
                const key = foeKey(k, pack.id, j);

                if (delve.dead.includes(key)) {
                    return;
                }

                const id = `wild-${this.nextWild++}`;
                const champion = foe.boss ? "boss" : foe.mini ? "mini" : null;

                this.#rouse(id, foe.creature, foe.tier, [...foe.at], { pack: group, leader: out[0] ?? null, master: Boolean(champion), map, dungeon: site.id, foe: key, champion, title: foe.title ?? null, regalia: foe.regalia ?? null, roam: champion ? 3 : 4, temper: "territorial", guard: champion ? 9 : 7 });
                out.push(id);
            });

            if (out.length) {
                this.#event("roused", { ids: out, creature: pack.foes[0].creature });
                ids.push(...out);
            }
        }

        delve.awake[k] = ids;

        const boss = level.packs.find(({ role }) => role === "boss");
        const bossDown = !boss || delve.dead.includes(foeKey(k, boss.id, 0));

        for (const chest of level.chests) {
            const id = `chest-${site.id}/${chest.id}`;

            if (!delve.opened.includes(chest.id) && !this.ground.has(id)) {
                this.ground.set(id, { id, chest: true, locked: chest.kind === "hoard" && !bossDown, dungeon: site.id, coffer: chest.id, hoard: chest.kind === "hoard", for: null, map, square: [...chest.at], until: null });
            }
        }
    }

    // A dungeon's level's foes let go (those still on it and not fighting: the rest kept out till
    // they are), the slain staying slain
    #sleepLevel(building, delve, k) {
        for (const id of [...(delve.awake[k] ?? [])]) {
            const actor = this.battle.actor(id);

            if (actor && !actor.dead && (actor.map !== building.maps[k] || actor.target !== null)) {
                continue;
            }

            if (actor && !actor.dead) {
                this.#release(id);
            }

            delve.awake[k] = delve.awake[k]?.filter((each) => each !== id) ?? null;
        }

        if (!delve.awake[k]?.length) {
            delve.awake[k] = null;
        }
    }

    // One of a dungeon's foes slain (`id`, its wild's record `beast`): slain for good (till it's
    // made again); the boss: its hoard unlocked
    #delveFell(beast, id) {
        const delve = this.dungeons.get(beast.dungeon);

        if (!delve || delve.dead.includes(beast.foe)) {
            return;
        }

        delve.dead.push(beast.foe);

        if (beast.champion === "boss") {
            for (const dropped of this.ground.values()) {
                if (dropped.dungeon === beast.dungeon && dropped.hoard) {
                    dropped.locked = false;
                }
            }

            this.#event("dungeon", { site: beast.dungeon, change: "boss", name: this.#siteOf(beast.dungeon)?.name ?? null, boss: this.battle.actor(id)?.name ?? null });
        }
    }

    // A dungeon's chest opened (`dropped`, its ground's): in its stead a share of what's in it for
    // each player there (a small chest's for those near it, rollCoffer at its level's tier; the
    // hoard's for everyone in the dungeon, rollHoard at each one's own power), theirs alone to
    // take, where it stood; the hoard opened, the dungeon cleared, to be made again once
    // everyone's left
    #openDungeonChest(dropped) {
        const delve = this.dungeons.get(dropped.dungeon);
        const building = this.world.interiors?.buildings.get(`site:${dropped.dungeon}`);
        const k = building?.maps.indexOf(dropped.map) ?? -1;
        const level = k >= 0 ? building.dungeon?.levels[k] : null;

        if (!delve || !level) {
            return refuse("gone");
        }

        this.ground.delete(dropped.id);
        delve.opened.push(dropped.coffer);

        for (const player of this.players.values()) {
            const actor = this.battle.actor(player.id);
            const there = actor && !actor.dead && (dropped.hoard ? building.maps.includes(actor.map) : actor.map === dropped.map && hypot(actor.x - dropped.square[0] - 0.5, actor.y - dropped.square[1] - 0.5) <= SPOILS_REACH);

            if (!there) {
                continue;
            }

            const bundle = dropped.hoard ? rollHoard(hoardTier(level.tier, player.progress.might()), this.random) : rollCoffer(level.tier, this.random);
            const ground = `ground-${this.nextGround++}`;

            this.ground.set(ground, { id: ground, bundle, for: player.id, from: "chest", map: dropped.map, square: [...dropped.square], until: this.battle.time + GROUND_MS });
            this.#event("spoils", { id: player.id, ground, from: dropped.id, creature: "chest", dungeon: dropped.dungeon, ...(dropped.hoard ? { hoard: true } : {}) });
        }

        if (dropped.hoard) {
            delve.cleared = true;
            this.#event("dungeon", { site: dropped.dungeon, change: "cleared", name: building.name });
        }

        return OK;
    }

    // A dungeon cleared and everyone gone from it, made again: its foes let go (wherever they
    // are), what's left in it gone (the fallen, what's on the ground), its levels made anew the
    // next time a player comes (Interiors.remake: the next generation)
    #remakeDungeon(site, building, delve) {
        for (const [id, one] of [...this.wild]) {
            if (one.dungeon === site.id) {
                if (this.battle.actor(id)) {
                    this.battle.remove(id);
                }

                this.#unwild(id);
            }
        }

        for (const actor of [...this.battle.actors]) {
            if (building.maps.includes(actor.map) && !this.players.has(actor.id)) {
                this.battle.remove(actor.id);
            }
        }

        for (const [id, dropped] of [...this.ground]) {
            if (building.maps.includes(dropped.map)) {
                this.ground.delete(id);
            }
        }

        this.world.interiors.remake(building.key);
        Object.assign(delve, { generation: building.generation, awake: [], dead: [], opened: [], cleared: false });
        this.#event("dungeon", { site: site.id, change: "remade", name: building.name });
    }

    // An envoy on the road near a player met (docs/WAR.md M7): them, and their escort, where the
    // war has them, making for a point a little further along their road
    #meet(envoy) {
        const [guardArms, patrolArms] = SOLDIERS_ARMS[envoy.realm] ?? SOLDIERS_ARMS.human;
        const free = this.#spots();
        const ids = [];
        const met = { people: envoy.realm, to: envoy.target, mission: envoy.mission, ids, leg: envoy.leg, mark: null, at: [...envoy.at], over: null };

        try {
            met.mark = this.#ahead(envoy, envoy.at, envoy.leg);

            for (let k = 0; k <= ENVOY.escort; k++) {
                const id = k ? `${envoy.id}/escort-${k}` : `${envoy.id}/envoy`;

                this.#enlist(id, { people: envoy.realm, weapon: k ? (k % 2 ? patrolArms : guardArms) : "staff", square: free(envoy.at), name: k ? "escort" : "envoy", record: { envoy: envoy.id, share: 0, part: k ? "escort" : "envoy" }, patrol: [free(met.mark)] });
                ids.push(id);
            }
        } catch {
            // (No free ground there: those found are out, and no more)
        }

        this.envoys.set(envoy.id, met);
        this.#event("envoy", { envoy: envoy.id, people: envoy.realm, to: envoy.target, mission: envoy.mission, ids });
    }

    // The square `ENVOY.ahead` metres further along an envoy's road from `at` (past its point `leg`)
    #ahead(envoy, at, leg, reach = ENVOY.ahead) {
        let [x, y] = at;
        let left = reach;

        for (let k = leg + 1; k < envoy.path.length && left > 0; k++) {
            const [nx, ny] = envoy.path[k];
            const distance = hypot(nx - x, ny - y);

            if (distance <= left) {
                [x, y, left] = [nx, ny, left - distance];
            } else {
                [x, y, left] = [x + ((nx - x) / distance) * left, y + ((ny - y) / distance) * left, 0];
            }
        }

        return nearestFree(squaresOf(this.world.maps.town), [Math.floor(x), Math.floor(y)], { within: 24 });
    }

    // Each envoy met, on their way: where they've got to told to the war (which hears them, at
    // their road's end), and, once they're at the point they were making for, the next
    #watchEnvoys() {
        for (const [id, met] of this.envoys) {
            const envoy = this.war.force(id);
            const leader = this.battle.actor(met.ids[0]);

            if (met.over || envoy?.kind !== "envoy" || !leader || leader.dead) {
                continue;
            }

            met.at = [leader.x, leader.y];

            let leg = met.leg;

            while (leg < envoy.path.length - 1 && hypot(envoy.path[leg + 1][0] - leader.x, envoy.path[leg + 1][1] - leader.y) <= ENVOY.past) {
                leg++;
            }

            if (this.war.move(id, met.at, leg)) {
                met.over = "arrived";
                this.#event("envoyed", { envoy: id, people: met.people, to: met.to, over: "arrived" });
                continue;
            }

            met.leg = leg;

            // (There, or nearly: on to the next point along)
            if (distanceBetween(leader.square, met.mark) <= 2 || (!leader.path.length && !leader.to && !leader.target)) {
                try {
                    const free = this.#spots();

                    met.mark = this.#ahead(envoy, met.at, leg);

                    for (const [k, each] of met.ids.entries()) {
                        const actor = this.battle.actor(each);

                        if (actor && !actor.dead) {
                            Object.assign(actor, { patrol: [k ? free(met.mark) : met.mark], patrolIndex: 0 });
                        }
                    }
                } catch {
                    // (Nowhere free ahead just now: tried again next time)
                }
            }
        }
    }

    // An envoy struck down: waylaid, by whoever did it (their people, or no one's)
    #envoyFell(id, byId) {
        const met = this.envoys.get(id);
        const by = byId ? this.battle.actor(byId) : null;
        const realm = by ? (this.players.get(by.id)?.realm ?? by.team) : null;

        this.war?.waylaid(id, realm);

        if (met && !met.over) {
            met.over = "waylaid";
            this.#event("envoyed", { envoy: id, people: met.people, to: met.to, over: "waylaid", by: realm });
        }
    }

    // An envoy's party let go: out of the world
    #farewell(id) {
        const { ids } = this.envoys.get(id);

        this.envoys.delete(id);

        for (const each of ids) {
            this.battle.remove(each);
            this.soldiers.delete(each);
        }

        this.fallen = this.fallen.filter(({ id: each }) => !ids.includes(each));
        this.#event("farewell", { envoy: id, ids });
    }

    // A people's enemy brought down by a player, before their soldiers' eyes: they owe the
    // player's people a favour for it (docs/WAR.md M7). Their own people owe them nothing more
    #owed({ id, by }) {
        const player = by && this.players.get(by);
        const fallen = this.battle.actor(id);

        if (!player || !fallen || !this.war?.realm(fallen.team)) {
            return;
        }

        const seen = new Set();

        for (const other of this.battle.actors) {
            const people = other.team;

            if (other.kind !== "soldier" || other.dead || other.map !== fallen.map || people === player.realm || seen.has(people) || !this.war.realm(people)) {
                continue;
            }

            if (this.war.hostile(people, fallen.team) && distanceBetween(other.square, fallen.square) <= FAVOUR_SIGHT) {
                seen.add(people);
                this.war.remember(people, player.realm, 2);
            }
        }
    }

    // --- Followers (docs/WAR.md M9) ---

    // A player's followers (their ids)
    #company(playerId) {
        return [...this.followers].filter(([, one]) => one.leader === playerId).map(([id]) => id);
    }

    // One of the adventurers at a guild (or drinking at its tables) hired: out of the folk, and
    // following the player, for their price
    #hire(player, actor) {
        const one = this.folk.get(actor.talkingTo);
        const calling = one?.look;

        if (!one || !(one.role === "adventurer" || one.talk === "adventurer") || !HIRES[calling]) {
            return refuse("hire");
        }

        if (this.#company(player.id).length >= this.mostFollowers(player.id)) {
            return refuse("company");
        }

        const { price } = HIRES[calling];

        if (player.progress.gold < price) {
            return refuse("gold");
        }

        player.progress.gold -= price;

        // (Gone from where they sat or read the board, for good)
        const npc = this.battle.actor(one.id);
        const at = { square: [...npc.square], map: npc.map };

        this.battle.remove(one.id);
        this.folk.delete(one.id);
        this.hired.add(one.id);

        const id = this.#follow(player, { name: one.name, calling, sex: one.sex, seed: one.seed, people: one.people ?? "human", from: one.id }, at);

        actor.talkingTo = null;
        this.#event("gone", { id: one.id });

        return { ok: true, follower: id, price };
    }

    // A follower of a player's, into the world by them (or where `at` says): { name, calling,
    // sex, seed, people }. Returns their id
    #follow(player, one, at = null) {
        const leader = this.battle.actor(player.id);
        const map = at?.map ?? leader.map;
        const taken = new Set(this.battle.actors.filter((each) => each.map === map).map(({ square: [x, y] }) => squareKey(x, y)));
        const square = nearestFree(squaresOf(this.world.maps?.[map] ?? this.world), at?.square ?? leader.square, { taken });
        const id = `follower-${this.nextFollower++}`;
        const { weapon } = HIRES[one.calling] ?? HIRES.warrior;

        this.followers.set(id, { leader: player.id, name: one.name, calling: one.calling, sex: one.sex ?? "m", seed: one.seed ?? 1, people: one.people ?? "human", from: one.from ?? null, waiting: false });
        this.battle.add({ id, kind: "follower", name: one.name, weapon, team: player.realm, square, map, ai: "follow", leader: player.id, role: "guard", shield: (HIRES[one.calling] ?? HIRES.warrior).shield ? NPC_SHIELDS.follower : null });
        this.#event("follower", { id: player.id, follower: id, name: one.name, change: "joined" });

        return id;
    }

    // A player's followers brought along with them (through a door, up the stairs): by them where
    // they've come out, unless they were told to wait
    #bring(playerId) {
        const leader = this.battle.actor(playerId);
        const squares = squaresOf(this.world.maps?.[leader.map] ?? this.world);
        const taken = new Set(this.battle.actors.filter((each) => each.map === leader.map).map(({ square: [x, y] }) => squareKey(x, y)));

        for (const id of [...this.#company(playerId), ...[...this.companions].filter(([, one]) => one.leader === playerId).map(([each]) => each)]) {
            const follower = this.battle.actor(id);

            if (!follower || follower.dead || follower.map === leader.map || this.waiting(id)) {
                continue;
            }

            try {
                const square = nearestFree(squares, leader.square, { taken, within: 12 });

                taken.add(squareKey(...square));
                Object.assign(follower, { map: leader.map, spawnMap: leader.map, square, x: square[0] + 0.5, y: square[1] + 0.5, path: [], offPath: false, target: null });
            } catch {
                // (No room by them: they'll catch up another time)
            }
        }
    }

    // A follower told what to do in talk, by the player they follow (#orderUnit)
    #tell(player, actor, order) {
        const result = this.#orderUnit(player, actor.talkingTo, order);

        if (result.ok && order === "dismiss") {
            actor.talkingTo = null;
        }

        return result;
    }

    /**
     * The player's party (the docs/GAME.md party): those with them, each as { id, kind } in
     * order: their hired adventurers ("adventurer"), then the creatures they've called to their
     * side ("summon"), then the dead they've raised ("risen").
     */
    partyOf(playerId) {
        const companions = [...this.companions].filter(([, one]) => one.leader === playerId);

        return [
            ...this.#company(playerId).map((id) => ({ id, kind: "adventurer" })),
            ...companions.filter(([, one]) => !one.risen).map(([id]) => ({ id, kind: "summon" })),
            ...companions.filter(([, one]) => one.risen).map(([id]) => ({ id, kind: "risen" })),
        ];
    }

    /** Whether one with a player (a follower, or a companion) was told to wait where they stood. */
    waiting(id) {
        return Boolean((this.followers.get(id) ?? this.companions.get(id))?.waiting);
    }

    // --- Parties of players (PARTY) ---

    /** The party a player's in ({ id, leader, members }: the longest in it first), or null. */
    partyFor(playerId) {
        return this.parties.get(this.partyIds.get(playerId)) ?? null;
    }

    /** The other players in a player's party, the longest in it first (none, in none). */
    fellows(playerId) {
        return (this.partyFor(playerId)?.members ?? []).filter((id) => id !== playerId);
    }

    /** Who's asked a player to their party, and till when ({ from, until }), or null. */
    invitation(playerId) {
        return this.invites.get(playerId) ?? null;
    }

    // Two characters who are never enemies (battle.js hostile asks): two players in one party, or
    // one's and another's (their followers, their creatures), whatever their peoples
    #allied(a, b) {
        if (!this.parties.size) {
            return false;
        }

        const [oa, ob] = [this.#ownerOf(a), this.#ownerOf(b)];

        return Boolean(oa && ob && oa !== ob && this.partyIds.get(oa) !== undefined && this.partyIds.get(oa) === this.partyIds.get(ob));
    }

    // The player someone is, or follows (a follower, a creature called or raised), or null
    #ownerOf(actor) {
        return actor.kind === "player" ? actor.id : (actor.leader ?? null);
    }

    // What a player does about parties (a "party" command, `do`): ask another to theirs (`who`:
    // a player not in one, nor asked already; theirs not full), say yes to being asked (joining
    // the asker's, or making one with them), say no (the asker told), leave theirs; or, its
    // leader, put someone out of it or make them its leader
    #partyCommand(player, { do: what, who = null }) {
        const party = this.partyFor(player.id);

        switch (what) {
            case "invite": {
                const other = this.players.get(who);

                if (!other || who === player.id) {
                    return refuse("invitee");
                }

                if (this.partyIds.has(who)) {
                    return refuse(party && this.partyIds.get(who) === party.id ? "member" : "partied");
                }

                if (party && party.members.length >= PARTY.most) {
                    return refuse("partyFull");
                }

                if (this.invites.has(who)) {
                    return refuse("asked");
                }

                const until = this.battle.time + PARTY.askMs;

                this.invites.set(who, { from: player.id, until });
                this.#event("party", { id: who, change: "invited", from: player.id, name: player.hero.name, until });
                this.#event("party", { id: player.id, change: "sent", who, name: other.hero.name });

                return OK;
            }
            case "accept": {
                const asked = this.invites.get(player.id);
                const asker = asked && this.players.get(asked.from);

                if (!asker) {
                    return refuse("uninvited");
                }

                if (party) {
                    return refuse("partied");
                }

                const theirs = this.partyFor(asker.id);

                if (theirs && theirs.members.length >= PARTY.most) {
                    return refuse("partyFull");
                }

                this.invites.delete(player.id);

                // (Into the asker's party; or, in none, a new one, theirs to lead)
                const joined = theirs ?? { id: `party-${this.nextParty++}`, leader: asker.id, members: [asker.id] };

                if (!theirs) {
                    this.parties.set(joined.id, joined);
                    this.partyIds.set(asker.id, joined.id);
                }

                joined.members.push(player.id);
                this.partyIds.set(player.id, joined.id);
                this.#tellParty(joined, { change: "joined", who: player.id, name: player.hero.name });

                return OK;
            }
            case "decline": {
                const asked = this.invites.get(player.id);

                if (!asked) {
                    return refuse("uninvited");
                }

                this.invites.delete(player.id);
                this.#event("party", { id: asked.from, change: "declined", who: player.id, name: player.hero.name });

                return OK;
            }
            case "leave":
                if (!party) {
                    return refuse("unpartied");
                }

                this.#quit(player.id, "left");

                return OK;
            case "remove":
            case "promote": {
                if (!party) {
                    return refuse("unpartied");
                }

                if (party.leader !== player.id) {
                    return refuse("leader");
                }

                if (!party.members.includes(who) || who === player.id) {
                    return refuse("member");
                }

                if (what === "remove") {
                    this.#quit(who, "removed");
                } else {
                    party.leader = who;
                    this.#tellParty(party, { change: "leader", who, name: this.players.get(who)?.hero.name ?? "" });
                }

                return OK;
            }
            default:
                return refuse("command");
        }
    }

    // A player out of their party (`why`: "left", or "removed" by its leader), all of it told: led
    // by the longest in it after them if they led it; and no party left with one in it
    #quit(playerId, why) {
        const party = this.partyFor(playerId);

        if (!party) {
            return;
        }

        this.#tellParty(party, { change: why, who: playerId, name: this.players.get(playerId)?.hero.name ?? "" });
        party.members = party.members.filter((id) => id !== playerId);
        this.partyIds.delete(playerId);

        if (party.members.length < 2) {
            for (const id of party.members) {
                this.partyIds.delete(id);
                this.#event("party", { id, change: "disbanded" });
            }

            this.parties.delete(party.id);

            return;
        }

        if (party.leader === playerId) {
            party.leader = party.members[0];
            this.#tellParty(party, { change: "leader", who: party.leader, name: this.players.get(party.leader)?.hero.name ?? "" });
        }
    }

    // Something about a party told to each in it (by their id)
    #tellParty(party, what) {
        for (const id of party.members) {
            this.#event("party", { id, party: party.id, ...what });
        }
    }

    // One of a player's party (a follower, or a companion: #companion) told what to do by them:
    // to wait where they stand, to follow again, to fight whoever the player's set on ("assist":
    // till they're down), or to go their own way (gone)
    #orderUnit(player, id, order) {
        const one = this.followers.get(id) ?? this.companions.get(id);
        const unit = this.battle.actor(id);

        if (!one || one.leader !== player.id || !unit || unit.dead) {
            return refuse("follower");
        }

        if (order === "wait") {
            one.waiting = true;
            Object.assign(unit, { ai: "patrol", patrol: [[...unit.square]], patrolIndex: 0, leash: LEASH, post: unit.facing, spawnMap: unit.map, assist: null });
        } else if (order === "follow") {
            one.waiting = false;
            Object.assign(unit, { ai: "follow", patrol: null, leash: null });
        } else if (order === "assist") {
            const leader = this.battle.actor(player.id);
            const engaged = leader?.order?.type === "engage" ? leader.order.target : leader?.target;
            const target = engaged ? this.battle.actor(engaged) : null;

            if (!target || target.dead || target.map !== unit.map || target === unit || !this.canFight(leader, target)) {
                return refuse("untargeted");
            }

            // (Turned on someone who's no enemy of theirs, as the player did: held against them)
            if (!this.battle.hostile(unit, target)) {
                unit.foes[target.id] = this.battle.time + FOE_MS;
            }

            one.waiting = false;
            Object.assign(unit, { ai: "follow", patrol: null, leash: null, assist: target.id });
        } else if (order === "dismiss") {
            if (this.companions.has(id)) {
                this.#letGo(id, "dismissed");
            } else {
                this.followers.delete(id);
                this.battle.remove(id);
                this.#event("follower", { id: player.id, follower: id, name: one.name, change: "dismissed" });
                this.#event("gone", { id });
            }
        } else {
            return refuse("command");
        }

        return OK;
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
        this.#unwild(id);

        const squad = soldier?.fort ? this.squadsOut.get(soldier.fort) : null;

        if (squad) {
            squad.ids[soldier.squad] = (squad.ids[soldier.squad] ?? []).filter((each) => each !== id);
        }

        const mustered = soldier && (soldier.envoy || soldier.fort || soldier.barracks ? null : soldier.camp ? this.camps.get(soldier.camp) : soldier.works ? this.worksOut.get(soldier.works) : this.mustered.get(soldier.town));

        if (mustered) {
            mustered.ids = mustered.ids.filter((each) => each !== id);

            // (One of a town's or a works': relieved a while after, if it has soldiers left)
            if (!soldier.camp) {
                mustered.relief = this.battle.time + RELIEF_MS;
            }
        }

        this.#event("gone", { id });
    }

    // Someone fallen taken away `ms` from now (in turn: the soonest first)
    #fall(id, ms) {
        const at = this.battle.time + ms;
        const k = this.fallen.findIndex((each) => each.at > at);

        this.fallen.splice(k < 0 ? this.fallen.length : k, 0, { id, at });
    }

    // --- Magic's wonders (spells.js: the tomes' spells the host works) ---

    // The nearest foe someone can see within `reach` squares (a spell scroll read with none
    // named: goods.js SCROLLS), or null
    #foeNear(actor, reach) {
        const near = (one) => one !== actor && !one.dead && one.map === actor.map && distanceBetween(actor.square, one.square) <= reach && this.canFight(actor, one) && this.battle.hostile(actor, one) && this.battle.canSee(actor, one);

        return this.battle.actors.filter(near).sort((a, b) => hypot(a.x - actor.x, a.y - actor.y) - hypot(b.x - actor.x, b.y - actor.y))[0] ?? null;
    }

    // Gold found on the fallen, as much more as the charms someone carries have it (core/goods.js
    // CHARMS `fortune`: a lucky coin)
    #fortune(player, gold) {
        return gold ? Math.round(gold * (1 + player.progress.bonuses().fortune)) : 0;
    }

    // One of the wild's creatures fallen near someone lately, still lying there (the one named, or the nearest): or null
    #corpseNear(actor, reach, named = null) {
        const lies = (one) => Boolean(one?.dead && one.map === actor.map && this.wild.has(one.id) && hypot(one.x - actor.x, one.y - actor.y) <= reach);

        if (named !== null) {
            const one = this.battle.actor(named);

            return lies(one) ? one : null;
        }

        return this.battle.actors.filter(lies).sort((a, b) => hypot(a.x - actor.x, a.y - actor.y) - hypot(b.x - actor.x, b.y - actor.y))[0] ?? null;
    }

    // A spell landed that the host works the wonder of (a player's): raising the dead, calling a
    // creature or another player, drawing one out of the smoke, changing one, carrying the caster off
    #wonder({ id, spell, target, at }) {
        const player = this.players.get(id);
        const caster = this.battle.actor(id);

        if (!player || !caster || caster.dead) {
            return;
        }

        switch (spell) {
            case "zombify":
                this.#raiseDead(player, target);
                break;
            case "summon":
                if (target === id) {
                    this.#call(player);
                } else {
                    this.#summon(player, target);
                }

                break;
            case "attraction":
                this.#attract(player);
                break;
            case "polymorph":
                this.#polymorph(target);
                break;
            case "teleport":
                this.#teleport(player);
                break;
            case "wordOfRecall":
                this.#recall(player);
                break;
            case "wizardsWalk":
                this.#walkTo(player, at);
                break;
            default:
                break;
        }
    }

    // Zombify: one of the wild's creatures, fallen, risen to follow the player a while
    #raiseDead(player, corpseId) {
        const corpse = this.battle.actor(corpseId);
        const beast = this.wild.get(corpseId);

        if (!corpse || !beast) {
            return;
        }

        const at = { map: corpse.map, square: [...corpse.square] };

        this.fallen = this.fallen.filter(({ id }) => id !== corpseId);
        this.battle.remove(corpseId);
        this.#unwild(corpseId);
        this.#event("gone", { id: corpseId, risen: true });
        this.#companion(player, beast.creature, beast.tier, at, { risen: true });
    }

    // A creature at a player's side a while (SPELLS.summon.lasts), following them and fighting
    // whoever's their enemy: risen from the dead (Zombify), or called (Summon). Its id
    #companion(player, creature, tier, { map, square }, { risen = false } = {}) {
        const spec = CREATURES[creature];
        const power = tierPower(tier);
        const id = `companion-${this.nextCompanion++}`;
        const taken = new Set(this.battle.actors.filter((each) => each.map === map).map(({ square: [x, y] }) => squareKey(x, y)));
        let free;

        try {
            free = nearestFree(squaresOf(this.world.maps?.[map] ?? this.world), square, { taken, within: 8 });
        } catch {
            return null;
        }

        this.companions.set(id, { leader: player.id, creature, tier, until: this.battle.time + SPELLS[risen ? "zombify" : "summon"].lasts, risen });
        this.battle.add({
            id,
            kind: "beast",
            name: risen ? `Risen ${spec.name.toLowerCase()}` : spec.name,
            weapon: spec.weapon,
            team: player.realm,
            square: free,
            map,
            ai: "follow",
            leader: player.id,
            hp: Math.round(spec.hp * power),
            speed: spec.speed,
            chase: spec.chase,
            power: { melee: power, ranged: power },
            armor: spec.armor ?? 0,
            wild: { creature, tier, temper: "aggressive", guard: 0, roam: 0, leash: 0, pack: id, leader: null, menace: false, unique: false, ...traitsOf(creature), companion: risen ? "risen" : "called" },
        });
        this.#event("roused", { ids: [id], creature });
        this.#event("companion", { id: player.id, companion: id, creature, change: risen ? "risen" : "called" });

        return id;
    }

    // The creatures at the players' sides: gone when their time's up (or their player's gone);
    // one fallen too far behind (stuck, or left on another floor) brought to them, behind them
    #keepUp() {
        for (const [id, one] of [...this.companions]) {
            const actor = this.battle.actor(id);
            const leader = this.battle.actor(one.leader);

            if (!actor || !leader || !this.players.has(one.leader) || this.battle.time >= one.until) {
                this.#letGo(id, "over");
                continue;
            }

            if (!one.waiting && this.#caughtUp(actor, leader)) {
                this.#event("companion", { id: one.leader, companion: id, creature: one.creature, change: "caught up" });
            }
        }

        for (const [id, one] of this.followers) {
            const actor = this.battle.actor(id);
            const leader = this.battle.actor(one.leader);

            if (actor && leader && !one.waiting) {
                this.#caughtUp(actor, leader);
            }
        }
    }

    // One with a player (a follower, or a companion by magic: not one told to wait) fallen too far
    // behind them (battle.js FOLLOW.lost: stuck, or left on another floor) brought to them, quietly,
    // to a free square behind them (COMPANION.behind), out of any fight it was in: unless the
    // player's in a fight too, while it's in one. Whether it was
    #caughtUp(actor, leader) {
        if (actor.dead || leader.dead || (actor.map === leader.map && hypot(actor.x - leader.x, actor.y - leader.y) <= FOLLOW.lost)) {
            return false;
        }

        // (Fighting, it fights on while its leader's fighting too; else it breaks off)
        const fighting = leader.target !== null || leader.attack || this.battle.actors.some((other) => other.target === leader.id && !other.dead);

        if ((actor.target !== null || actor.attack) && fighting) {
            return false;
        }

        const square = this.#behind(leader);

        if (!square || !this.battle.place(actor.id, leader.map, square, { facing: leader.facing })) {
            return false;
        }

        actor.spawnMap = leader.map;

        return true;
    }

    // A companion gone (its time up; lost when its player was carried off): crumbled, or vanished
    #letGo(id, why) {
        const one = this.companions.get(id);

        this.companions.delete(id);
        this.battle.remove(id);
        this.#event("companion", { id: one?.leader ?? null, companion: id, creature: one?.creature ?? null, change: why });
        this.#event("gone", { id });
    }

    // A free square behind someone (the way they're facing: behind them), near them: or null
    #behind(actor) {
        const [dx, dy] = [sin(actor.facing), cos(actor.facing)];
        const goal = [Math.floor(actor.x - dx * COMPANION.behind), Math.floor(actor.y - dy * COMPANION.behind)];
        const taken = new Set(this.battle.actors.filter((each) => each.map === actor.map && each !== actor).map(({ square: [x, y] }) => squareKey(x, y)));

        taken.add(squareKey(...actor.square));

        try {
            return nearestFree(squaresOf(this.world.maps?.[actor.map] ?? this.world), goal, { taken, within: 6 });
        } catch {
            return null;
        }
    }

    // What lives where a player is (creatures.js encounterAt: as strong as it is there), or a
    // creature near home, with no world plan
    #local(player) {
        const actor = this.battle.actor(player.id);
        const plan = this.world.plan;
        const at = this.#whereIs(player) ?? [actor.x, actor.y];
        const found = plan ? encounterAt(plan, at, [this.#homeOf(player)], this.random, this.#dark()) : null;

        return found ?? { creature: "wolf", tier: 1 };
    }

    // Summon, on themselves: a creature of these parts at their side a while
    #call(player) {
        const actor = this.battle.actor(player.id);
        const { creature, tier } = this.#local(player);

        this.#companion(player, creature, tier, { map: actor.map, square: this.#behind(actor) ?? actor.square });
    }

    // Attraction: out of a puff of smoke in front of them, one of the creatures of these parts
    #attract(player) {
        const actor = this.battle.actor(player.id);
        const { creature, tier } = this.#local(player);
        const [dx, dy] = [sin(actor.facing), cos(actor.facing)];
        const ids = actor.map === "town" ? this.#pack({ creature, tier, count: 1 }, [actor.x + dx * 3, actor.y + dy * 3]) : [];

        if (ids.length) {
            const beast = this.battle.actor(ids[0]);

            this.#event("attracted", { id: player.id, creature, ids, x: beast.x, y: beast.y });
        }
    }

    // Polymorph: one of the wild's creatures made into another of the world's (not one of the
    // unique), as strong as its tier has it, as hurt as it was
    #polymorph(targetId) {
        const beast = this.wild.get(targetId);
        const actor = this.battle.actor(targetId);

        if (!beast || !actor || actor.dead) {
            return;
        }

        const from = beast.creature;
        const creature = this.random.pick(Object.keys(CREATURES).filter((id) => id !== from && !CREATURES[id].perilous));
        const spec = CREATURES[creature];
        const power = tierPower(beast.tier);

        beast.creature = creature;
        this.battle.reshape(targetId, { name: spec.name, weapon: spec.weapon, hp: Math.round(spec.hp * power), speed: spec.speed, chase: spec.chase, armor: spec.armor ?? 0, wild: { creature, temper: spec.temper, guard: spec.guard ?? 0, menace: menaces(creature), ...traitsOf(creature) } });
        this.#event("polymorphed", { id: targetId, creature, from });
    }

    // Teleport: somewhere, anywhere, on the world's land (away from its settlements), those with them left behind
    #teleport(player) {
        const plan = this.world.plan;
        const size = plan?.size ?? 0;

        for (let tries = 0; plan && this.world.maps?.town?.chunk && tries < 60; tries++) {
            const at = [200 + this.random.next() * (size - 400), 200 + this.random.next() * (size - 400)];

            if (landAt(plan, ...at).water || !clearOfSettlements(plan, at, WILDS.clear)) {
                continue;
            }

            if (this.#carry(player, "town", [Math.floor(at[0]), Math.floor(at[1])], "teleport")) {
                return;
            }
        }
    }

    // Word of Recall: to the door of the nearest temple
    #recall(player) {
        const door = this.#nearestTemple(this.#whereIs(player) ?? [0, 0]);

        if (door) {
            this.#carry(player, door.map, door.arrive, "recall", door.facing);
        }
    }

    // The way out of the nearest temple (the home town's, or a settlement's laid out now to find
    // it): { map, arrive, facing }, or null
    #nearestTemple([x, y]) {
        const buildings = this.world.interiors?.buildings;

        if (!buildings) {
            return null;
        }

        const apart = (at) => hypot(at[0] - x, at[1] - y);
        const home = [...buildings.values()].find(({ kind, place }) => kind === "church" && place === "home");
        const places = (this.world.plan?.places ?? []).filter(({ id, kind }) => TEMPLED.has(kind) && id !== this.world.start?.id).sort((a, b) => apart(a.at) - apart(b.at));
        const doorOf = (building) => building?.door?.ends?.[0] ?? null;

        for (const place of places.slice(0, 4)) {
            if (home?.at && apart(home.at) <= apart(place.at)) {
                break;
            }

            this.world.maps?.town?.settlements?.of(place);

            const temple = [...buildings.values()].find((building) => building.kind === "church" && building.place === place.id);

            if (doorOf(temple)) {
                return doorOf(temple);
            }
        }

        return doorOf(home);
    }

    // Wizard's Walk: to somewhere on the map they've uncovered (the nearest free square to it)
    #walkTo(player, at) {
        if (at && this.world.maps?.town) {
            this.#carry(player, "town", [Math.floor(at[0]), Math.floor(at[1])], "walk");
        }
    }

    // At the war table in a keep (core/wartable.js; docs/WAR.md *The war table*), a player of the
    // people whose keep it is (or of a people under the same liege), whose people serve no one:
    // - `counsel` ({ march: an enemy town's id }), from a Knight: where their army marches next
    //   (war.js counsel), weighing as their rank has it (COUNSEL);
    // - `orders` (war.js order's), from a Lord: for their people's army, or for one of their
    //   vassals' (`realm`), carried out before anything its rulers would have it do.
    #atTable(player, actor, { orders = null, realm = null, counsel = null }) {
        const table = warTableOn(this.world.maps?.[actor.map]);
        const building = this.world.interiors?.of(actor.map);
        const town = building && this.war ? this.war.town(townOf(building, { plan: this.world.plan, war: this.war, start: this.world.start })) : null;

        if (!table || !town || !atWarTable(table, actor.x, actor.y)) {
            return refuse("table");
        }

        const rank = player.standing.rank();
        const read = mayRead(this.war, player.realm, town.owner, rank);

        if (read !== "ok") {
            return refuse(read);
        }

        if (this.war.oppressor(player.realm)) {
            return refuse("serving");
        }

        if (counsel) {
            if (!counsel.march || rank < OPENS.march) {
                return refuse("rank");
            }

            if (!this.war.counsel(player.realm, { march: counsel.march }, COUNSEL[rank])) {
                return refuse("counsel");
            }

            this.#event("counsel", { id: player.id, advice: { march: counsel.march } });

            return OK;
        }

        if (rank < OPENS.orders) {
            return refuse("orderRank");
        }

        const whose = realm ?? player.realm;

        if (whose !== player.realm && this.war.realm(whose)?.overlord !== player.realm) {
            return refuse("notOurs");
        }

        // (Why not, where it can be told)
        const [kind, about] = Object.entries(orders ?? {})[0] ?? [];
        const army = this.war.armyOf(whose);
        const target = kind === "attack" ? (this.war.town(about) ?? this.war.workAt(about) ?? this.war.fort(about) ?? this.war.camp(about) ?? this.war.depot(about)) : null;
        const point = kind === "camp" || kind === "depot" ? about : null;

        if (kind === "raise" && army) {
            return refuse("raised");
        }

        if (!army && kind !== "raise" && kind !== "depot") {
            return refuse("noArmy");
        }

        if (kind === "attack" && !(target && this.war.hostile(whose, target.owner ?? target.realm))) {
            return refuse("peace");
        }

        if (Array.isArray(point) && (landAt(this.world.plan, point[0], point[1]).water || landAt(this.world.plan, point[0], point[1]).biome === "sea")) {
            return refuse("water");
        }

        if (kind === "supply" && army.mission === "muster") {
            return refuse("mustering");
        }

        if (kind === "supply" && this.war.forces.some((force) => force.kind === "supply" && force.target === army.id)) {
            return refuse("wagon");
        }

        if (!this.war.order(whose, orders, { by: player.realm })) {
            return refuse({ supply: "supplies", depot: "depot" }[kind] ?? "orders");
        }

        return OK;
    }

    // Through a guild's portal (core/portals.js) to another branch they've been into (`to`: its
    // place's id): from beside the portal of the branch they're in, a member of the guild, not in
    // the middle of a fight, paying its fare (none at Mithril). They come out of the other's
    // portal, facing into its hall, their followers with them (as through a door: #bring)
    #travel(player, actor, to) {
        const plan = this.world.plan;
        const from = branchOf(this.world.interiors?.of(actor.map), this.world.start);
        const portal = from && portalOn(this.world.maps?.[actor.map]);

        if (!plan || !portal || !atPortal(portal, actor.x, actor.y)) {
            return refuse("portal");
        }

        const rank = player.standing.guildRank();

        if (rank === null) {
            return refuse("unregistered");
        }

        if (to === from) {
            return refuse("here");
        }

        const [origin, place] = [from, to].map((id) => guilds(plan).find((each) => each.id === id));

        if (!place || !origin) {
            return refuse("command");
        }

        if (!player.explored.canTravelTo(to)) {
            return refuse("unexplored");
        }

        if (actor.attack || actor.casting) {
            return refuse("midst");
        }

        if (actor.target !== null || this.battle.actors.some((other) => other.target === actor.id && !other.dead)) {
            return refuse("fighting");
        }

        const fare = fareOf(hypot(place.at[0] - origin.at[0], place.at[1] - origin.at[1]), rank);

        if (player.progress.gold < fare) {
            return refuse("gold");
        }

        // (The branch there got ready: its settlement laid out, if it wasn't, and its hall made)
        this.world.maps?.town?.settlements?.of(place);

        const there = [...(this.world.interiors?.buildings.values() ?? [])].find((building) => branchOf(building, this.world.start) === to);

        if (!there) {
            return refuse("command");
        }

        this.#openBuilding(there.key);

        const hall = there.maps[0];
        const out = portalOn(this.world.maps?.[hall]);

        if (!out) {
            return refuse("command");
        }

        const { square, facing } = outOf(out, this.world.maps[hall]);
        const went = { map: actor.map, x: actor.x, y: actor.y };
        const came = this.battle.place(player.id, hall, square, { facing });

        if (!came) {
            return refuse("command");
        }

        player.progress.gold -= fare;
        this.#event("carried", { id: player.id, why: "portal", from: went, map: hall, square: came, to, fare });

        return { ok: true, to, fare };
    }

    // A player carried off by magic, to a square on a map: whoever was with them left behind.
    // Whether there was room for them there
    #carry(player, map, square, why, facing = null) {
        const actor = this.battle.actor(player.id);
        const from = { map: actor.map, x: actor.x, y: actor.y };

        this.#loseRetinue(player);

        const there = this.battle.place(player.id, map, square, { facing });

        if (there) {
            this.#event("carried", { id: player.id, why, from, map, square: there });
        }

        return Boolean(there);
    }

    // A Scroll of Safety being read: lost if the reader's fallen (in this step or before: the
    // death goes on as any does); read through, and they're carried to the market square of the
    // town they started in
    #safety(player, events) {
        const actor = this.battle.actor(player.id);

        if (!actor || actor.dead || events.some(({ type, id }) => type === "death" && id === player.id)) {
            player.safety = null;
            this.#event("safety", { id: player.id, change: "lost", why: "fell" });

            return;
        }

        if (player.safety.until > this.battle.time) {
            return;
        }

        const square = this.world.spawns?.player;

        player.safety = null;

        if (!square || !this.#carry(player, "town", [...square], "safety")) {
            this.#event("safety", { id: player.id, change: "lost", why: "nowhere" });
        }
    }

    // Those with a player, lost when they're carried off by magic: their followers gone back to
    // where they were hired (the next time it's open), their companions by magic vanished
    #loseRetinue(player) {
        for (const id of this.#company(player.id)) {
            const one = this.followers.get(id);

            this.followers.delete(id);
            this.battle.remove(id);

            if (one.from) {
                this.hired.delete(one.from);
            }

            this.#event("follower", { id: player.id, follower: id, name: one.name, change: "lost" });
            this.#event("gone", { id });
        }

        for (const [id, one] of [...this.companions]) {
            if (one.leader === player.id) {
                this.#letGo(id, "lost");
            }
        }
    }

    // Summon, on another player: asked if they'll come (their people not the caster's enemy:
    // battle.js), a while to answer
    #summon(player, targetId) {
        if (!this.players.has(targetId) || targetId === player.id) {
            return;
        }

        const until = this.battle.time + SUMMONING_MS;

        this.summonings.set(targetId, { by: player.id, until });
        this.#event("summons", { id: targetId, by: player.id, name: player.hero.name, until, change: "asked" });
        this.#event("summons", { id: player.id, target: targetId, name: this.players.get(targetId).hero.name, change: "sent" });
    }

    // A player summoned answering: coming (to the caster's side, behind them, those with them
    // left behind), or resisting
    #answer(player, come) {
        const asked = this.summonings.get(player.id);

        if (!asked) {
            return refuse("unsummoned");
        }

        this.summonings.delete(player.id);

        const caller = this.battle.actor(asked.by);
        const square = come && caller && !caller.dead ? this.#behind(caller) : null;
        const came = Boolean(square) && this.#carry(player, caller.map, square, "summoned", caller.facing);

        this.#event("summons", { id: asked.by, target: player.id, change: came ? "came" : "resisted" });
        this.#event("summons", { id: player.id, by: asked.by, change: came ? "came" : "resisted" });

        return OK;
    }

    // --- Commands ---

    #order(actor, order) {
        if (actor.dead) {
            return refuse("dead");
        }

        this.battle.command(actor.id, order);

        return OK;
    }

    // An emote (core/emotes.js: a wave, a bow, a cheer), shown to everyone (an "emote" event: {
    // id, emote }): standing, so wherever they were going they stop; not while a blow or a spell's
    // under way
    #emote(actor, emote) {
        if (!isEmote(emote)) {
            return refuse("command");
        }

        if (actor.dead) {
            return refuse("dead");
        }

        if (actor.attack || actor.casting) {
            return refuse("midst");
        }

        this.#order(actor, { type: "stop" });
        this.#event("emote", { id: actor.id, emote });

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

        // (One of the folk, a soldier who isn't an enemy, or one of their own followers)
        const theirs = npc?.kind === "follower" && this.followers.get(npc.id)?.leader === actor.id;

        if (!npc || npc.dead || npc === actor || !(npc.neutral || theirs || (npc.kind === "soldier" && !this.battle.hostile(npc, actor)))) {
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
        this.#gain(this.players.get(actor.id), "talk", XP.talk);

        return OK;
    }

    // Something done by talking, to whoever the player's talking to: paid for (if it has a
    // price, and they can), done (what's bought: BOUGHT), kept (the last few), and told of (an
    // "effect" event), for the world to act on
    #effect(player, actor, effect) {
        if (!effect || typeof effect !== "object" || Array.isArray(effect)) {
            return refuse("command");
        }

        if (actor.talkingTo === null) {
            return refuse("talking");
        }

        // (Work asked for or taken on, word of it brought, the armoury, counsel, signing up at a
        // guild: an official's)
        if (effect.work || effect.report || effect.armoury || effect.counsel || effect.guild) {
            return this.#official(player, actor, effect);
        }

        // (An adventurer hired; a follower told what to do: M9)
        if (effect.hire) {
            return this.#hire(player, actor);
        }

        if (effect.follower) {
            return this.#tell(player, actor, effect.follower);
        }

        // (A courtesan's company: only hers to give)
        if (effect.company && !this.#courtesan(actor)) {
            return refuse("command");
        }

        const price = Math.max(0, Math.floor(Number(effect.price ?? effect.pay) || 0));

        if (price > player.progress.gold) {
            return refuse("gold");
        }

        if (price) {
            player.progress.gold -= price;
            this.#gain(player, "trade", price * XP.trade);
        }

        // (What's bought for themselves: drunk, eaten, slept on, or a boon)
        const bought = effect.for === "them" ? null : BOUGHT[effect.buy ?? effect.rent];

        if (bought?.boon) {
            player.boons = [...player.boons.filter(({ id }) => id !== bought.boon.id), { ...bought.boon, until: this.battle.time + bought.boon.ms }];
            this.#outfit(player);
        } else if (bought) {
            this.battle.mend(actor.id, { hp: bought.hp ?? 0, stamina: bought.stamina ?? 0 });
        }

        // (A room taken: slept in, to the next sunrise or sunset)
        if (effect.rent === "room") {
            this.#sleep(player, actor, "room");
        }

        if (effect.company) {
            this.#keptCompany(player, actor);
        }

        this.#gain(player, "talk", XP.effect);

        const done = { ...structuredClone(effect), by: actor.talkingTo, player: actor.id, at: this.battle.time };

        this.done.push(done);
        this.done.splice(0, Math.max(0, this.done.length - KEEP_DONE));
        this.#event("effect", { id: actor.id, effect: done });

        return OK;
    }

    // Whether the one a player's talking with is a courtesan (her company hers to give)
    #courtesan(actor) {
        const one = this.folk.get(actor.talkingTo);

        return one?.role === "courtesan" || one?.talk === "courtesan";
    }

    // A courtesan's company kept (COMPANY): mostly an afterglow for the hour, the breath back
    // faster by the share rolled (any before it gone: the latest's); else the pox caught
    #keptCompany(player, actor) {
        if (!this.random.chance(COMPANY.chance)) {
            this.battle.afflict(actor.id, "pox", { ms: COMPANY.ms });

            return;
        }

        const boon = afterglow(this.random.int(...COMPANY.faster));

        player.boons = [...player.boons.filter(({ id }) => id !== boon.id), { ...boon, until: this.battle.time + boon.ms }];
        this.#outfit(player);
        this.#event("boon", { id: player.id, boon: boon.id, label: boon.label, change: "on" });
    }

    // --- Passing the time (the terrain plan's M7e, §9 Night in play) ---

    // Camping out in the world: not in a settlement, a fight, or with anything hostile near
    // (REST.clear); a fire built a step in front of them and their tent behind them, slept by
    // (#sleep), burning a while after (REST.burns)
    /**
     * Why a player (by id) can't make camp just now (a REFUSALS key: in a settlement, indoors, in a
     * fight, with something hostile near), or null if they can: asked before they're asked how long.
     */
    campRefusal(id) {
        const actor = this.battle.actor(id);

        if (!actor || actor.dead) {
            return "dead";
        }

        if (actor.map !== "town") {
            return "outdoors";
        }

        const plan = this.world.plan;

        if (plan && !clearOfSettlements(plan, [actor.x, actor.y], 0)) {
            return "settlement";
        }

        if (actor.target !== null || actor.attack || this.battle.actors.some((other) => other.target === actor.id && !other.dead)) {
            return "fighting";
        }

        if (this.battle.actors.some((other) => !other.dead && other.map === actor.map && this.battle.hostile(other, actor) && hypot(other.x - actor.x, other.y - actor.y) < REST.clear)) {
            return "hostiles";
        }

        return null;
    }

    #camp(player, actor, until = null) {
        if (until !== null && campFor(0, until) === null) {
            return refuse("howLong");
        }

        const why = this.campRefusal(actor.id);

        if (why) {
            return refuse(why);
        }

        const [dx, dy] = [sin(actor.facing), cos(actor.facing)];
        const camp = {
            id: `rest-${actor.id}`,
            player: actor.id,
            people: player.realm,
            fire: [actor.x + dx * 1.6, actor.y + dy * 1.6],
            tent: { at: [actor.x - dx * 2.4, actor.y - dy * 2.4], facing: actor.facing },
            until: this.battle.time + REST.burns,
        };

        this.campfires = [...this.campfires.filter(({ player: whose }) => whose !== actor.id), camp];
        this.battle.mend(actor.id, { hp: actor.maxHp, stamina: actor.maxStamina });
        this.#sleep(player, actor, "camp", until);

        return OK;
    }

    // A player asleep (at an inn, or by their camp's fire): if they're the world's host, its time
    // passed (as long as they chose to camp: CAMP_HOURS; else to the next sunrise or sunset at
    // least REST.least off; the war's turns meanwhile all played, as they would have been), and
    // everyone told (each woken); anyone else just rests
    #sleep(player, actor, where, until = null) {
        const host = player.id === HOST_PLAYER;
        const elapsed = elapsedOf(this.war);
        const passed = host && this.war ? (until !== null ? campFor(elapsed, until) : untilWaking(elapsed, REST.least)) : 0;

        if (passed) {
            this.#warOn(passed);
        }

        this.#event("slept", { id: actor.id, where, passed, ...(until !== null ? { until } : {}) });
    }

    // --- Standing in their people (core/standing.js) ---

    /**
     * Where one of the folk sits in their people's rule, if they do (by id): { id, role, name,
     * title, town (a war town's id), owner (who holds it), post ("hall" or "keep"), and what they
     * do (OFFICIALS) }; or null.
     */
    postOf(id) {
        const one = this.folk.get(id);
        const official = OFFICIALS[one?.role];
        const actor = this.battle.actor(id);

        if (!official || !actor || !this.war) {
            return null;
        }

        const building = this.world.interiors?.of(actor.map);
        const town = building && this.war.town(townOf(building, { plan: this.world.plan, war: this.war, start: this.world.start }));

        return town ? { id, role: one.role, name: one.name, title: one.title ?? "", town: town.id, owner: town.owner, ...official } : null;
    }

    /**
     * What a player can tell one of the folk (by id) of: letters for them, and what's been done
     * of what they asked (or a tithe to be paid them). Their requests, as the player carries them.
     */
    dueTo(playerId, id) {
        const player = this.players.get(playerId);
        const post = this.postOf(id);

        if (!player || !post?.report) {
            return [];
        }

        return player.standing.requests.filter((request) => {
            // (A letter, or a guild's package, for them)
            if (request.kind === "message" || request.kind === "courier") {
                return request.target.town === post.town && request.target.post === post.post;
            }

            // (Creatures' parts wanted at the guild: due once they're all in the pack)
            const brought = request.kind === "parts" && player.progress.held(request.target.part) >= request.target.need;

            return request.from.town === post.town && request.from.post === post.post && (request.state === "done" || request.kind === "tithe" || brought);
        });
    }

    // Something asked of an official the player's talking to: work (offered, then taken on), word
    // of what's done (rewarded), the armoury's gift for their rank, counsel to their rulers, or
    // signing up at an adventurers' guild
    #official(player, actor, effect) {
        const post = this.postOf(actor.talkingTo);

        if (!post) {
            return refuse("official");
        }

        const { standing } = player;
        const rank = standing.rank();
        const own = this.war.liege(post.owner) === this.war.liege(player.realm);

        // (Signed up at a guild's counter, of any people: one card, good at every branch)
        if (effect.guild === "register") {
            if (post.post !== "guild") {
                return refuse("official");
            }

            if (standing.register()) {
                this.#event("guild", { id: player.id, change: "registered", rank: 0, title: standing.guildTitle() });
            }

            return { ok: true, guild: { ...standing.guild } };
        }

        if (effect.work === "ask" || effect.work === "accept") {
            if (!post.work) {
                return refuse("official");
            }

            // (The guild's board is for anyone, of any people, once they've registered)
            if (!own && post.post !== "guild") {
                return refuse("stranger");
            }

            if (post.post === "guild" && standing.guildRank() === null) {
                return refuse("unregistered");
            }

            if (post.post === "keep" && rank < OPENS.keep) {
                return refuse("rank");
            }

            if (standing.requests.length >= MOST_REQUESTS) {
                return refuse("requests");
            }

            // (What they offer holds for the turn, until it's all taken: asking again doesn't
            // change it. A guild's board has several notices up, its courier work among them: any
            // can be taken, by what it asks, and the rest stay)
            const kept = player.offers[post.id];

            if (effect.work === "ask") {
                // (The parts a guild wants are what's found near it for them: as strong as it is
                // that far from their home)
                const asked = { war: this.war, realm: player.realm, town: post.town, post: post.post, giver: post, rank, guildRank: standing.guildRank() ?? 0, home: this.#homeOf(player), held: standing.requests, random: this.random };
                const board = kept?.turn === this.war.turn && kept.board.length ? kept.board : post.post === "guild" ? offerBoard(asked) : [offerRequest(asked)].filter(Boolean);

                player.offers[post.id] = { turn: this.war.turn, board };

                return board.length ? { ok: true, request: structuredClone(board[0]), board: structuredClone(board) } : refuse("work");
            }

            const chosen = kept?.board.find((offered) => effect.which === undefined || objectiveOf(offered) === effect.which);

            if (!chosen) {
                return refuse("work");
            }

            const taken = standing.take(chosen);

            kept.board = kept.board.filter((offered) => offered !== chosen);

            this.#event("request", { id: player.id, change: "taken", request: structuredClone(taken) });

            return { ok: true, request: structuredClone(taken) };
        }

        if (effect.report) {
            if (!post.report) {
                return refuse("official");
            }

            const due = this.dueTo(player.id, post.id);

            if (!due.length) {
                return refuse("due");
            }

            const handed = [];

            for (const request of due) {
                // (A tithe paid, if they've the gold: into their people's treasury)
                if (request.kind === "tithe") {
                    if (player.progress.gold < request.target.gold) {
                        continue;
                    }

                    player.progress.gold -= request.target.gold;
                    this.war.give(player.realm, request.target.gold * TITHE_RATE);
                }

                // (Creatures' parts handed over, out of the pack)
                if (request.kind === "parts" && !player.progress.remove(request.target.part, request.target.need)) {
                    continue;
                }

                handed.push(this.#rewarded(player, request));
            }

            return handed.length ? { ok: true, reported: handed } : refuse("gold");
        }

        if (effect.armoury) {
            if (!post.armoury) {
                return refuse("official");
            }

            if (!own) {
                return refuse("stranger");
            }

            if (rank < OPENS.armoury) {
                return refuse("rank");
            }

            // (The first rank's gift not had yet: something for the weapon they carry)
            const due = Array.from({ length: rank - OPENS.armoury + 1 }, (_, k) => OPENS.armoury + k).find((each) => !standing.claimed.includes(each));

            if (due === undefined) {
                return refuse("claimed");
            }

            const weapon = weaponOf(player.progress);
            const held = ITEMS[weapon]?.slot === "mainHand" ? weapon : "sword";
            const given = armouryGift(due, held, offHandFits(held, "shield") === null, player.realm);
            const gift = this.#made(given);

            if (!player.progress.stow(gift)) {
                return refuse("full");
            }

            standing.claimed.push(due);
            this.#event("gift", { id: player.id, item: gift, rank: due });

            return { ok: true, item: gift };
        }

        if (effect.counsel) {
            const [kind] = Object.keys(effect.counsel);

            if (!post.counsel) {
                return refuse("official");
            }

            if (!own) {
                return refuse("stranger");
            }

            if (!(rank >= (OPENS[kind] ?? Infinity))) {
                return refuse("rank");
            }

            // (A rising, counselled in their own people's keep, not their overlord's)
            if (kind === "rise") {
                if (post.owner !== player.realm) {
                    return refuse("stranger");
                }

                if (!this.war.rise(player.realm, { weight: COUNSEL[rank] })) {
                    return refuse("unready");
                }

                this.#event("counsel", { id: player.id, advice: { rise: true } });

                return OK;
            }

            if (!this.war.counsel(player.realm, effect.counsel, COUNSEL[rank])) {
                return refuse("counsel");
            }

            this.#event("counsel", { id: player.id, advice: { ...effect.counsel } });

            return OK;
        }

        return refuse("command");
    }

    // A request done and told of: set down, its reward paid (gold; standing, for a people's; the
    // guilds' merit, for a guild's: any rank it brings told of)
    #rewarded(player, request) {
        const { standing } = player;
        const { reward } = request;

        standing.close(request.id, "done");
        player.progress.gold += reward.gold;

        // (A tome from the guild's library besides: in the pack, or at their feet if there's no room)
        if (reward.tome) {
            this.#give(player, { id: tomeOf(reward.tome), quality: "common", count: 1 });
        }

        this.#event("request", { id: player.id, change: "done", request: structuredClone(request), reward: { ...reward } });

        for (const up of standing.gain(reward.standing)) {
            this.#event("standing", { id: player.id, ...up });
        }

        for (const up of standing.earn(meritIn(request))) {
            this.#event("guild", { id: player.id, change: "rank", ...up });
        }

        // (Done for their own people while they serve another, or from a guild's board: their people stirred)
        const own = this.war?.town(request.from.town)?.owner === player.realm;

        this.#stir(player, request.from.post === "guild" ? STIR.contract : !own ? 0 : request.kind === "tithe" ? STIR.tithe : STIR.request);

        return structuredClone(request);
    }

    // Something given to a player: into their pack, or, with no room there, at their feet (for
    // them alone, as spoils are)
    #give(player, item) {
        const actor = this.battle.actor(player.id);

        if (player.progress.stow(item, item.count) || !actor) {
            return;
        }

        const ground = `ground-${this.nextGround++}`;

        this.ground.set(ground, { id: ground, bundle: { gold: 0, items: [item] }, for: player.id, map: actor.map, square: [...actor.square], until: this.battle.time + GROUND_MS });
        this.#event("spoils", { id: player.id, ground, from: player.id, given: true });
    }

    // A player's people, serving another or fallen, stirred towards rising (M10) by what they've done
    #stir(player, amount) {
        if (!this.war?.oppressor(player.realm) || !(amount > 0)) {
            return;
        }

        const unrest = this.war.stir(player.realm, amount);

        this.#event("unrest", { id: player.id, realm: player.realm, unrest, amount });
    }

    // What the war's turns mean for each player's people (M10): won (honoured), brought under
    // another, fallen, risen again, or their rule undone; restless enough to rise
    #fate(event) {
        const war = this.war;

        for (const player of this.players.values()) {
            const mine = event.realm === player.realm;
            const fate =
                event.type === "victory"
                    ? mine
                        ? "victory"
                        : war.liege(player.realm) === event.realm
                          ? "serving"
                          : "defeat"
                    : !mine
                      ? null
                      : { subjugated: "subjugated", fallen: "fallen", rebelled: "risen", risen: "risen", undone: "undone", restless: "restless" }[event.type];

            if (!fate) {
                continue;
            }

            this.#event("fate", { id: player.id, fate, realm: player.realm, by: event.by ?? event.against ?? event.from ?? event.realm, town: event.town ?? null });

            // (Their people's victory: honours for them)
            if (fate === "victory") {
                for (const up of player.standing.gain(HONOURS)) {
                    this.#event("standing", { id: player.id, ...up });
                }
            }
        }
    }

    // A request given up: a little lost (standing, for a people's; the guilds' merit, for a guild's)
    #abandon(player, id) {
        const request = player.standing.close(id, "abandoned");

        if (!request) {
            return refuse("request");
        }

        this.#failed(player, request);
        this.#event("request", { id: player.id, change: "abandoned", request: structuredClone(request) });

        return OK;
    }

    // A foe a player's brought down, for the requests they carry: an enemy's soldier, or one of the
    // wild (a guild's, only near its town: standing.js GUILD_REACH; and only of the level it asks
    // for, if it asks for one). One of their oppressors' soldiers stirs their people (M10)
    #felled(player, fallen) {
        if (fallen.kind === "soldier" && this.war?.oppressor(player.realm) && this.war.liege(fallen.team) === this.war.oppressor(player.realm)) {
            this.#stir(player, STIR.soldier);
        }

        const at = this.#whereIs(player);

        for (const request of [...player.standing.requests]) {
            if (request.state !== "open") {
                continue;
            }

            const near = request.target.near;

            if (near) {
                const place = this.#placeOf(near.town);
                const middle = place ? this.#middleOf(place) : near.at;

                if (!at || hypot(at[0] - middle[0], at[1] - middle[1]) > near.reach) {
                    continue;
                }
            }

            const counts =
                request.kind === "bounty" || request.kind === "hunt"
                    ? fallen.kind === "soldier" && this.war?.liege(fallen.team) === request.target.realm
                    : (request.kind === "wild" || request.kind === "beasts") && !fallen.neutral && fallen.kind !== "soldier" && fallen.kind !== "player" && !this.war?.realm(fallen.team) && (fallen.wild?.tier ?? 1) >= (request.target.level ?? 1);

            if (counts) {
                request.count += 1;
                this.#settle(player, request, request.count >= request.target.need ? "ready" : "count");
            }
        }
    }

    // How the players' requests stand, as the war goes on and they go about the world: run out
    // of time; seen what they were to scout; there when their town needed holding (and it held);
    // come to nothing (their target gone, or gone over to their own)
    #watchRequests() {
        const war = this.war;

        if (!war) {
            return;
        }

        for (const player of this.players.values()) {
            const at = this.#whereIs(player);

            for (const request of [...player.standing.requests]) {
                const change = this.#check(player, request, at);

                if (change) {
                    this.#settle(player, request, change);
                }
            }
        }
    }

    #check(player, request, at) {
        const war = this.war;
        const liege = war.liege(player.realm);

        if (request.until !== null && war.turn > request.until) {
            return "failed";
        }

        if (request.state === "done") {
            return null;
        }

        // (How near a place a player is: from a town's middle, less its reach)
        const near = (point, reach) => Boolean(at && point) && hypot(at[0] - point[0], at[1] - point[1]) <= reach;
        const townAt = (town) => {
            const place = this.#placeOf(town.id);

            return { middle: place ? this.#middleOf(place) : town.at, radius: SETTLEMENT_KINDS[place?.kind]?.radius ?? 0 };
        };

        switch (request.kind) {
            case "message": {
                const to = war.town(request.target.town);

                return to && war.liege(to.owner) === liege ? null : "void";
            }
            case "scout": {
                if (request.target.force) {
                    const force = war.force(request.target.force) ?? war.camp(request.target.force);

                    return !force ? "void" : near(force.at, REQUEST_REACH.scout) ? "ready" : null;
                }

                const town = war.town(request.target.town);

                if (!town || !war.hostile(liege, war.liege(town.owner))) {
                    return "void";
                }

                const { middle, radius } = townAt(town);

                return near(middle, radius + REQUEST_REACH.scout) ? "ready" : null;
            }
            case "defend": {
                const town = war.town(request.target.town);

                if (!town || war.liege(town.owner) !== liege) {
                    return "failed";
                }

                const { middle, radius } = townAt(town);

                if (!request.there && near(middle, radius + REQUEST_REACH.defend)) {
                    request.there = true;
                    this.#event("request", { id: player.id, change: "there", request: structuredClone(request) });
                }

                return war.camp(request.target.camp) ? null : request.there ? "ready" : "void";
            }
            case "rout":
            case "camp": {
                const camp = war.camp(request.target.force);

                if (camp && !request.there && near(camp.at, REQUEST_REACH.rout)) {
                    request.there = true;
                    this.#event("request", { id: player.id, change: "there", request: structuredClone(request) });
                }

                if (camp) {
                    return null;
                }

                // (Gone: broken, or gone home; or it took the town, and the request's failed)
                return war.town(request.target.town)?.owner === request.target.realm ? "failed" : request.there ? "ready" : "void";
            }
            case "clear": {
                // (Cleared since it was given, and not with the player there: come to nothing)
                const kept = war.places?.[request.target.place];

                return kept && kept.cleared >= request.given ? "void" : null;
            }
            case "escort":
            case "waylay": {
                const envoy = war.force(request.target.force);

                if (envoy) {
                    if (request.kind === "escort" && !request.there && near(envoy.at, REQUEST_REACH.escort)) {
                        request.there = true;
                        this.#event("request", { id: player.id, change: "there", request: structuredClone(request) });
                    }

                    return null;
                }

                // (Gone: heard at the end of the road, or waylaid on it, and by whom)
                const end = war.log.findLast(({ force }) => force === request.target.force);

                if (request.kind === "escort") {
                    return end?.type === "treaty" ? (request.there ? "ready" : "void") : "failed";
                }

                return end?.type === "waylaid" && end.by && war.liege(end.by) === liege ? "ready" : end?.type === "waylaid" ? "void" : "failed";
            }
            case "convoy":
            case "plunder": {
                const convoy = war.force(request.target.force);

                if (convoy && !convoy.back) {
                    if (request.kind === "convoy" && !request.there && near(convoy.at, REQUEST_REACH.convoy)) {
                        request.there = true;
                        this.#event("request", { id: player.id, change: "there", request: structuredClone(request) });
                    }

                    return null;
                }

                // (Its goods in, or carried off, and by whom: fallen on in the world by the
                // player's people, it's theirs)
                const end = war.log.findLast(({ force, type, beaten }) => force === request.target.force && (type === "delivered" || type === "plundered" || (type === "ambushed" && !beaten)));

                if (request.kind === "convoy") {
                    return end?.type === "delivered" ? (request.there ? "ready" : "void") : end ? "failed" : "void";
                }

                return end?.type === "ambushed" && end.played && end.by && war.liege(end.by) === liege ? "ready" : end?.type === "delivered" ? "failed" : "void";
            }
            case "retake":
            case "seize": {
                const works = war.workAt(request.target.works);

                if (!works) {
                    return "void";
                }

                if (!request.there && near(works.at, REQUEST_REACH.works)) {
                    request.there = true;
                    this.#event("request", { id: player.id, change: "there", request: structuredClone(request) });
                }

                // (Won in the world since it was asked, by the player's people: done. Back in
                // their hands some other way, or, to be taken, in someone else's: come to nothing)
                const won = war.log.findLast((event) => event.works === works.id && event.played && event.turn >= request.given && (event.type === "seized" || event.type === "cleared"));

                if (won && war.liege(won.type === "seized" ? won.to : won.by) === liege) {
                    return "ready";
                }

                if (!works.held && war.liege(works.owner) === liege) {
                    return "void";
                }

                return request.kind === "seize" && (works.held || works.owner !== request.target.realm) ? "void" : null;
            }
            case "take": {
                const town = war.town(request.target.town);

                if (!town) {
                    return "void";
                }

                if (!request.there && near(town.at, REQUEST_REACH.take)) {
                    request.there = true;
                    this.#event("request", { id: player.id, change: "there", request: structuredClone(request) });
                }

                // (Its garrison put down to the last in the world since it was asked, and it taken by
                // the player's people: done. Taken some other way, or by anyone else: come to nothing)
                const taken = war.log.findLast((event) => event.type === "taken" && event.town === town.id && event.turn >= request.given);

                if (taken?.how === "played" && war.liege(taken.to) === liege) {
                    return "ready";
                }

                return taken || town.owner !== request.target.realm ? "void" : null;
            }
            default:
                return null;
        }
    }

    // A request moved on: counted, done (to be told of), failed (a little lost) or come to nothing
    #settle(player, request, change) {
        if (change === "ready") {
            request.state = "done";
        } else if (change === "failed" || change === "void") {
            player.standing.close(request.id, change);

            if (change === "failed") {
                this.#failed(player, request);
            }
        }

        this.#event("request", { id: player.id, change, request: structuredClone(request) });
    }

    // A request failed or given up: a people's costs a little standing with them; a guild's, a
    // little of the guilds' merit (never their standing: guild work neither gives nor takes it)
    #failed(player, request) {
        if (request.from.post === "guild") {
            player.standing.earn(-GUILD_FAILED);
        } else {
            player.standing.gain(-FAILED);
        }
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

        // (The settlements round each player laid out by the world itself, and its buildings
        // looked over in the order of their keys: so what's got ready, and when, doesn't hang on
        // what any game's drawn of the world, and every copy of it (docs/WAR.md M11) gets the same)
        const settlements = this.world.maps?.town?.settlements;

        if (settlements) {
            for (const place of places) {
                if (place?.out) {
                    const [cx, cy] = [Math.floor(place.x / CHUNK), Math.floor(place.y / CHUNK)];

                    for (let dy = -1; dy <= 1; dy++) {
                        for (let dx = -1; dx <= 1; dx++) {
                            settlements.settle(cx + dx, cy + dy);
                        }
                    }
                }
            }
        }

        for (const building of [...interiors.buildings.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))) {
            if (!building.entrance) {
                continue;
            }

            const { x, z } = building.entrance.door;
            const near = wanted.has(building.key) || places.some((place) => place?.out && hypot(x - place.x, z - place.y) < RELEVANCE.near);
            const far = !wanted.has(building.key) && places.every((place) => place && hypot(x - place.x, z - place.y) > RELEVANCE.far);

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
            // (A place worth finding gone into, `site:` its id: set down, its way in with it;
            // else a settlement's building, the settlement laid out)
            const site = key.startsWith("site:") ? this.#siteOf(key.slice(5)) : null;
            const place = site ? null : this.world.plan?.places.find(({ id }) => id === key.slice(0, key.indexOf(":")));

            if (site) {
                this.world.maps?.town?.sites?.heartOf(site);
            } else if (place) {
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
        this.#enthrone(building);

        const side = this.#sideOf(building.place === "home" ? this.world.start?.id : building.place, building.people);
        const folk = this.#notTheirs(building) ? [] : building.folk.filter((one) => this.#addFolk(one, side)).map(({ id }) => id);

        this.open.set(key, folk);
        this.#event("open", { key, folk });

        // (A barracks: its garrison in it)
        if (building.kind === "barracks") {
            this.#quarter(building);
        }
    }

    // Whether a place worth finding gone into (an abbey, a manor: `site:` its id) isn't its
    // people's now: held by outlaws, or empty a while once they're put to the sword (core/places.js
    // holderOf); its folk not in it
    #notTheirs(building) {
        const place = this.war && building.key.startsWith("site:") ? placesOf(this.world.plan).find(({ id }) => id === building.key.slice(5)) : null;

        return Boolean(place) && holderOf(this.world.plan, place, this.war.places[place.id], this.war.turn) !== "friendly";
    }

    // Who sits on a keep's throne, as the war has it: the ruler of the people who hold it, if
    // it's their seat (their name, and their title: "Queen"); else a governor for them (one of
    // them, whoever's town it was); a manor's, its lord or lady
    #enthrone(building) {
        const one = building.kind === "keep" ? building.folk.find(({ role }) => role === "ruler") : null;

        if (one && building.place === "site") {
            one.title = `${one.sex === "f" ? "Lady" : "Lord"} of ${building.name}`;

            return;
        }

        const town = one && this.war?.town(building.place === "home" ? this.world.start?.id : building.place);

        if (!town) {
            return;
        }

        const realm = this.war.realm(town.owner);

        one.born ??= { name: one.name, sex: one.sex, people: one.people };

        if (realm?.seat === town.id) {
            Object.assign(one, { name: realm.leader.name, title: realm.leader.title, sex: realm.leader.woman ? "f" : "m", people: realm.race ?? town.owner });
        } else {
            Object.assign(one, { name: one.born.name, title: `Governor of ${town.name}`, sex: one.born.sex, people: realm?.race ?? town.owner ?? one.born.people });
        }
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

        for (const [town, out] of [...this.quartered]) {
            if (out.key === key) {
                this.#unquarter(town);
            }
        }

        this.#event("close", { key, folk });
    }

    // One of the folk, going about their business in the battle (no one fights them), of the town
    // of `side`'s people (whose enemies they run from: battle.js #afraid)
    #addFolk(one, side = null) {
        if (this.battle.actor(one.id) || this.hired.has(one.id)) {
            return false;
        }

        this.folk.set(one.id, one);
        this.battle.add({ id: one.id, kind: "folk", name: one.name, team: "folk", square: one.square, map: one.map, ai: "routine", neutral: true, routine: one.routine, role: one.role, side, facing: one.facing });

        return true;
    }

    // Whose a place's folk are, for whom to fear: the people holding it in the war, if it's one of
    // the war's towns; else whose it is (`people`)
    #sideOf(id, people) {
        return (id && this.war?.town(id)?.owner) || people || null;
    }

    #event(type, details) {
        this.events.push({ type, time: this.battle.time, ...details });
    }
}
