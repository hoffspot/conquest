// The game: the world drawn in 3D (world/view.js), the player and an orc in it, and the battle
// between them (core/battle.js).
//
// It shows the world, but doesn't change it: the world is the host's (core/host.js), the one
// authority over it, with however many players are in it. What this game's own player does (the
// player whose id is `me`) goes to the host as a command, and everyone in the battle is drawn as
// the host has them: so another player's game can later show the same world, sent to it over the
// wire (docs/WAR.md).
//
// The battle runs in fixed steps of STEP_MS, the same on every device; the picture is drawn as
// often as the screen allows, with everyone shown between where they were at the last two steps,
// so they move smoothly whatever the frame rate. Each step's events (attacks, hits, deaths) start
// the animations, projectiles, sparks and damage numbers that show them.
//
// Tap or click the ground to walk there, or an enemy to go and fight it, or a door or stairs to
// go through them; drag to turn the camera round the player (or tilt it); pinch or scroll to zoom.
//
// The world outside (the town set in it: core/overworld.js) and each floor of the tavern are maps
// of their own (core/interiors.js), drawn far apart (each at its origin), and only the one the
// player is on is shown: going through a door or up the stairs, the screen dips to black and
// comes up on the other side. The world outside is drawn a chunk at a time round the player
// (world/chunks3d.js), as they go.

import * as THREE from "three";
import { DRAWS, FALL_LANDS, REACTIONS } from "../characters/actions.js";
import { Character } from "../characters/character.js";
import { folkLook } from "../characters/folk.js";
import { soldierLook } from "../characters/soldiers.js";
import { FOLK, PRESETS } from "../characters/presets.js";
import { BeastAvatar, dressingCreature } from "../beasts/beast.js";
import { LOOKS as CREATURE_LOOKS } from "../beasts/looks.js";
import { AFFLICTIONS } from "../core/afflictions.js";
import { DAY, daylight, elapsedOf, HOUR, moonPhase, timeOfDay } from "../core/daytime.js";
import { cheering, greetingOf, isEmote } from "../core/emotes.js";
import { carriesTorch, sightAt, torchesLit } from "../core/light.js";
import { STEP_MS, TALK_REACH } from "../core/battle.js";
import { CACHE_BANDS } from "../core/caches.js";
import { CREATURES } from "../core/creatures.js";
import { townOf } from "../core/insides.js";
import { holderOf, PLACE_BANDS, placesOf } from "../core/places.js";
import { CHUNK } from "../core/worldplan/plan.js";
import { atPortal, beforePortal, branchesFrom, branchOf, fareOff, portalOn } from "../core/portals.js";
import { atWarTable, beforeWarTable, mayRead, warTableOn } from "../core/wartable.js";
import { ambienceOf, doorOf, TOLLS, tolled } from "../audio/ambience.js";
import { footing } from "../audio/footing.js";
import { useSound, wearSound } from "../audio/handling.js";
import { CREATURE_VOICES, creatureSounds, ITEM_SOUNDS, spellSounds } from "../audio/sound.js";
import { FORT_ICONS, PLACE_RIMS, WORKS_ICONS, WORKS_RIMS } from "./mapicons.js";
import { buildingView } from "./building.js";
import { battleMapView } from "./battlemap.js";
import { CLEARING, footprintOf, FORTS } from "../core/war/forts.js";
import { Steering } from "./steering.js";
import { Surroundings } from "./surroundings.js";
import { Conversation, treeFor, upstairsIs } from "../core/dialogue.js";
import { CAMP_HOURS, campFor, CONVOY_NEAR, HIRES, HOST_PLAYER, Host, OFFICIALS, PICK_REACH, REFUSALS, SAFETY, SHOP_REACH, SHOPKEEPERS, TRADE, UNDO_MS, WORKS_OUT } from "../core/host.js";
import { dress } from "../characters/liveries.js";
import { GEAR, GEAR_SLOTS, offHandFree } from "../core/gear.js";
import { ABILITIES, buys, itemLabel, ITEMS, priceOf, Progress, QUALITIES, shopOrder, TREES, WARE_KINDS, wareKind, wares } from "../core/progress.js";
import { PACE } from "../core/netplay.js";
import { BOARD_SIZE, briefOf, COUNSEL, GUILD_RANKS, MOST_REQUESTS, objectiveOf, OPENS, progressOf, STANDINGS, whereTo } from "../core/standing.js";
import { describeLeader } from "../core/war/peoples.js";
import { peopleOf, rumourOfRuler, rumoursAt } from "../core/war/news.js";
import { ADJECTIVES } from "../core/war/peoples.js";
import { RESOURCES, RISING, STAGES } from "../core/war/war.js";
import { GODS } from "../core/lore/gods.js";
import { ACT_TIMES, PLAYER_RESTS_AFTER, REST_EVERY, ROLES } from "../core/roles.js";
import { nearestFree, squaresOf } from "../core/grid.js";
import { crossingsOf, lengthOf, nearestAlong, pointAlong, wayAcross, wayFrom } from "../core/journey.js";
import { navigatorOf, releaseNavigation } from "../core/navigation.js";
import { GROUND } from "../core/setpieces/pieces.js";
import { CAST_FAILURES, ELEMENT_TOME_PRICE, ELEMENT_TOMES, GROWTH_XP, lookOf, SCHOOLS, SPELLS, TOMES } from "../core/spells.js";
import { Variety } from "../core/variety.js";
import { distanceBetween, longestReach, weaponOf, WEAPONS } from "../core/weapons.js";
import { Avatar, posingEvery } from "../world/avatar.js";
import { Crowd, CROWD_CASTS, CrowdAvatar } from "../world/crowd.js";
import { NavBaker } from "../world/navbaker.js";
import { fadeNear } from "../world/nearfade.js";
import { Banners } from "../world/banners3d.js";
import { Camps } from "../world/camps3d.js";
import { FortAvatar, Forts } from "../world/forts3d.js";
import { ContactShadows } from "../world/contacts.js";
import { Flyers } from "../world/flyers3d.js";
import { Drops } from "../world/drops3d.js";
import { Ailments3D } from "../world/ailments3d.js";
import { Effects, LOOKS } from "../world/effects.js";
import { missileTravel, SpellFx } from "../world/spellfx.js";
import { Squares } from "../world/squares.js";
import { QUALITY, ROOM_VIEW } from "../world/view.js";
import { KINDS, Wounds } from "../world/wounds.js";
import { Chunks, DECK, LOAD_BUDGET, REACH } from "../world/chunks3d.js";
import { TallGrass } from "../world/grass.js";
import { Motes } from "../world/motes.js";
import { EMBER_SCALE } from "../world/fire.js";
import { GLOW_SCALE } from "../world/lights.js";
import { CarriedTorches } from "../world/carried.js";
import { LightGlobes } from "../world/globes.js";
import { PinMarks, WAY_LINE } from "../world/pin3d.js";
import { SMOKE_SHARE } from "../world/smoke.js";
import { FarLand } from "../world/far/far.js";
import { farReach } from "../world/far/levels.js";
import { Silhouettes } from "../world/far/silhouettes.js";
import { Volcano } from "../world/far/volcano.js";
import { Look } from "../world/look.js";
import { allAtOnce, allWaiting, Steps } from "../core/steps.js";
import { buildGround } from "../world/ground.js";
import { buildTown } from "../world/town3d.js";
import { prepareAtlas } from "../world/art/engine/atlas.js";
import { buildInterior, buildingInterior, cutFor, INTERIOR_GLOW } from "../world/interiors3d.js";
import { TREE_WIND } from "../world/art/kits/trees.js";
import { hitch } from "../world/art/kits/wagon.js";
import { Minimap, treesOf } from "./minimap.js";
import { CameraFollow } from "./camera.js";
import { Doors } from "./doors.js";
import { FatePanel, fateWords } from "./fate.js";
import { plateScale } from "./hud.js";
import { itemPicture } from "./icons.js";
import { JournalPanel, bearing, regardOf } from "./journal.js";
import { Journey } from "./journey.js";
import { SpellbookPanel } from "./spellbook.js";
import { PackPanel } from "./pack.js";
import { Governor } from "./governor.js";
import { Pacing } from "./pacing.js";
import { Prediction } from "./predict.js";
import { describe, totals } from "./gearinfo.js";
import { TalkPanel } from "./talk.js";
import { QuickBar, QUICK_LINGER, QUICK_REFUSALS } from "./quickbar.js";
import { ACTIONS, ActionWheel, actionOf, assignable, directionOf, forFriends, offensive, PLACES, readWheels, SIDES, WHEELS } from "./wheel.js";

/** What every character wears under their gear: a tunic, and trousers if nothing's on their legs. */
export const BASE_OUTFIT = Object.freeze(["tunic", "trousers"]);

/**
 * Everything a character wears and carries (EQUIPMENT ids): what's under their gear, the weapon
 * in their hand (a WEAPONS key), each piece of gear they wear (`pieces`: core/progress.js
 * Progress worn; none given, what a new character starts with on: core/progress.js
 * startingGear), and the parts of their own (a cat's ears and tail).
 */
export function heroEquipment(weapon, pieces = null, parts = []) {
    const worn = pieces ?? new Progress({}, { weapon }).worn();

    return [...new Set([...BASE_OUTFIT, ...WEAPONS[weapon].equipment, ...dress(worn), ...parts])];
}

/** How a character holds its weapon to fight (actions.js GUARDS, DRAWS), for its WEAPONS key. */
export const guardOf = (weapon) => weaponOf(weapon)?.attacks[0].animation ?? null;

// The sound of drawing each kind of weapon and putting it away (at the moment the hand takes it
// or lets it go): a blade from its scabbard, something slung off the back or from a belt, fists
// clenched
const DRAW_SOUNDS = { sword: ["unsheathe", "sheathe"], punch: ["knuckles", null], kick: ["knuckles", null], grimoire: ["grimoire", "grimoire"] };

// What a character's armour sounds like (sound.js ARMOUR): what's worn over the chest, plate (a
// breastplate), mail, or leather (a jerkin or a hide vest); none, cloth (or a beast)
const ARMOUR_WORN = Object.freeze({ breastplate: "plate", mail: "mail", jerkin: "leather", hideVest: "leather" });

const armourOf = (character) => ARMOUR_WORN[character?.equipment?.get("armour")] ?? ARMOUR_WORN[character?.equipment?.get("chest")] ?? null;

// The blows that ring steel on a shield's iron (a blade's), not thud on its boards (sound.js clash)
const RINGING = new Set(["slash", "hack", "cleave", "chop"]);

// How long after trading blows with the player a death's still theirs to be told of (s: #ours)
const FOUGHT = 30;

// How long after a body hits the ground what it fought with clatters down after it (s)
const DROPPED = 0.15;

/**
 * The wild's creatures heard (sound.js CREATURE_VOICES): calling as one sets on someone (no
 * sooner than `again` seconds after its last call), and now and then about its business (every
 * `idle` seconds, from and to; never two creatures' within `apart` seconds of each other); a
 * people-shaped one grunting with `effort` of its blows (a beast's every one heard), each
 * `growl` seconds apart at least; crying out hurt no oftener than every `hurt` seconds; a
 * dragon's or a wyvern's wings beating `wings` seconds apart when it beats them hard (heard to
 * `aloft` metres off, up in the air), and coming down out of the sky, flaring to land `flare` of
 * the way down (arrive).
 */
const CALLS = Object.freeze({ again: 8, idle: Object.freeze([25, 70]), apart: 5, effort: 0.5, growl: 0.9, hurt: 0.7, wings: 1.1, aloft: 45, flare: Object.freeze([0.7, 0.86]) });

// Going up or down the stairs: how many treads are heard, how far apart (s), and how fast they're
// climbed (m/s, as a footstep's: a steady walk)
const STAIRS = Object.freeze({ treads: 4, apart: 0.26, speed: 1.5 });

// How long the dead lie once they've hit the ground before sinking out of sight (s), and how long
// they take to sink
const LIE_STILL = 4;
const SINK = 1.5;

// Following the ground: a change in its height smaller than this (metres, from one frame to the
// next) is followed at once, a bigger one (a step up onto a bridge) eased over; and how quickly
// the camera's height follows the player's (per second)
const STEP_EASE = 0.12;
const FOCUS_EASE = 6;

// How far the camera's eased height may lag under the ground the player's climbing (metres)
const FOCUS_LAG = 0.2;

// How long the shadow under someone takes to fade once they've hit the ground (s): they lie flat
const CONTACT_FADES = 0.6;

// A tap that moves less than this (pixels) is a tap, not a drag
const TAP_SLOP = 12;

// A second tap this soon after one (ms), and this close to it (pixels; on the minimap, less),
// makes a double tap: run
const DOUBLE_TAP_MS = 350;
const DOUBLE_TAP_SLOP = { view: 60, map: 16 };

// How far from an enemy (screen pixels, at its chest) a tap picks it
const PICK_RADIUS = 46;

// Holding this long (ms) on the player or an enemy opens the action wheel; a finger this far
// (pixels) from where it opened is in one of its slices
const HOLD_MS = 400;
const FLICK = 30;

// A swipe up from the player (straight ahead): this far up (pixels), mostly up, and quickly
// (within this long, ms)
const SWIPE = 40;
const SWIPE_MS = 600;

// Dragging turns the camera round the player: across the screen's width, half round; up or down
// its height, tilting it this far (degrees). From the player, a flick up is a swipe (above), not a
// drag: a drag from them turns the camera only if it sets off more across than up
const DRAG_TURN = Math.PI;
const DRAG_TILT = 60;

// A wyvern or dragon put out this near the player (metres) is seen coming down out of the sky
const ARRIVE_WITHIN = 140;

// The navigation tiles baked ahead round each player out in the world (metres: three tiles each
// way, the ways they and those near them find staying among baked tiles), asked for again once
// they've gone this far
const BAKE_AHEAD = Object.freeze({ reach: 96, again: 16 });

// The way to the world map's pin: found again at most this often (seconds), once the player's
// moved this far (metres), or (while the way over the navigation mesh is short of where it's
// wanted: its tiles still to come) this often anyway; over the mesh for as far along it as can
// be (metres, the furthest first: the rest across the world's cells, core/journey.js), to the
// point on the mesh within `snap` metres of there; found across the world again once they're
// this far off it (metres), at most this often (seconds)
const PIN_WAY = Object.freeze({ every: 0.3, moved: 1, short: 1.5, near: Object.freeze([160, 120, 88, 64, 40, 20]), snap: 6, astray: 40, again: 2 });

// How far round the player the chunks' lights are looked through for the nearest (metres: past
// the furthest any reaches, lights.js LIGHTS)
const LIGHT_REACH = 30;

// What's heard round the player (audio/ambience.js) worked out again this often (seconds)
const HEARD_EVERY = 0.5;

// Wooden stairs' creaks (a recording of three or four treads) played this much quicker, to fit a
// climb (STAIRS)
const CREAKS = 1.4;

// How far the camera leans from the player towards who they're fighting: a share of the way,
// up to so many metres, and no more than `away` of how far the camera is from where it looks
// across the ground (so the player isn't leant out of the bottom of the picture by a foe far
// off); and how it keeps them in view (camera.js keep): within `margin` of the way from the
// middle of the view to its side, for `hold` seconds after they stop being who the player's
// fighting (a moment's lull, a blow from another)
const LEAN = { share: 0.4, most: 4.5, away: 0.25 };
const FIGHT_VIEW = Object.freeze({ margin: 0.6, hold: 2 });
// Arrows at the screen's edge for those attacking the player out of view: the nearest `most`, so
// far in from its sides and top (pixels), and from its bottom, clear of the quick actions risen in
// a fight
const THREATS = Object.freeze({ most: 3, inset: 28, bottom: 96 });

// The tavern's folk: how much hair they grow (at most: less than the player, as there are more
// of them), and what each of their acts is: its animation's timing (s: core/roles.js ACT_TIMES)
// and the sound it makes
const FOLK_HAIR = 0.2;
const ACTS = {
    toast: { ...ACT_TIMES.toast, sound: "clink", volume: 1 },
    serve: { ...ACT_TIMES.serve, sound: "clink", volume: 0.45 },
    pour: { ...ACT_TIMES.pour, sound: "pour", volume: 1, early: 0.3 },
    beckon: { ...ACT_TIMES.beckon },
    // The smithy's: three blows on the anvil (each ringing and throwing sparks, `beats`: s after
    // key 1), the work thrust into the coals, quenched in the trough (hissing, steam rising), the
    // bellows pumped (the forge's fire flaring), and the grindstone cranked (turning as it is)
    forge: { ...ACT_TIMES.forge, sound: "anvil", volume: 1, beats: [0, 0.37, 0.71], burst: "sparks", ahead: 0.62, height: 0.9 },
    heat: { ...ACT_TIMES.heat, sound: "bellows", volume: 0.5, burst: "embers", ahead: 0.9, height: 1, flare: 0.5 },
    quench: { ...ACT_TIMES.quench, sound: "hiss", volume: 1, burst: "steam", ahead: 0.7, height: 0.7 },
    pump: { ...ACT_TIMES.pump, sound: "bellows", volume: 1, beats: [0, 0.38, 0.76], flare: 0.8 },
    crank: { ...ACT_TIMES.crank, sound: "grind", volume: 1, drive: "grindstone" },
    // A temple's: the priest's blessing (a soft chime, a glimmer over the pews), and a candle lit
    bless: { ...ACT_TIMES.bless, sound: "healed", volume: 0.35, burst: "blessing", ahead: 0.5, height: 1.7 },
    light: { ...ACT_TIMES.light, burst: "embers", ahead: 0.6, height: 1 },
    // A guild's: a notice stamped, twice (a thump on the counter each time), one filed on the
    // shelves, and the quest board read (paper rustling)
    stamp: { ...ACT_TIMES.stamp, sound: "stepWood", volume: 2, beats: [0, 0.7] },
    file: { ...ACT_TIMES.file, sound: "rustle", volume: 1 },
    read: { ...ACT_TIMES.read, sound: "rustle", volume: 0.6 },
};

// Going through a door or up the stairs, the screen comes up from black this fast (s)
const FADE_IN = 0.45;

// How long the screen takes to come up from black after a sleep (s)
const SLEEP_FADE = 2.4;

// Embers rise from the hearth this often (a second)
const EMBERS = 5;

// The buildings the host has got ready to go into (those near any player: core/host.js
// RELEVANCE), their floors and folk built a piece at a time, for at most `budget` ms a frame; and
// how often (s) the doors of the settlements come to since are picked up
const VISITS = Object.freeze({ every: 0.5, budget: 6 });

// How often a hosted world's goings-on are sent to those who've joined it (seconds: docs/WAR.md M11)
const FLUSH_EVERY = 0.1;

// Joined to another's world, the most of its time played in a frame (s): frames coming slowly,
// the time between them all the same (playing alone, a slow frame's a slower world instead)
const JOINED_FRAME = 1;

// How often a joined game times its link to the host (seconds); and how far ahead its hero's
// drawn going when swiped straight ahead (m: app/predict.js stops it soon enough)
const PING_EVERY = 1;
const AHEAD = 50;

// The commands that set the player's hero going otherwise than where they're sent, or stop them:
// not drawn ahead of the copy (app/predict.js)
const STEERING = new Set(["engage", "approach", "enter", "stop", "cancel", "summoned", "trade"]);

// How long a joined game goes without a step from the host before its player's told it's waiting (ms)
const WAITING_AFTER = 2000;

// What's shown while playing together isn't going as it should (Game #together)
const TOGETHER = Object.freeze({
    lost: "Your connection dropped. Reconnecting…",
    hosting: "Your world's link to the others dropped. Reconnecting…",
    away: "The host's connection dropped. Waiting for them…",
    paused: "The host has paused the game.",
    waiting: "Waiting for the host…",
});

// How far away (metres, either way) anyone's drawn out in the world: another player far off, and
// whoever's near them, aren't (docs/WAR.md M11)
const DRAW_REACH = 160;

// Soldiers in their crowds (world/crowd.js): a battle's, with more than `from` of them about the
// player (a town's own guards are never so many), those nearest, and whoever's fighting the
// player, drawn in full (as many as QUALITY soldiers' `full`) and the rest in the crowd, as their
// kind's figure is made. Looked at every `every` seconds; one drawn in full let go to the crowd
// only once it's `margin` places past the last drawn in full. Each kind's figure made with `share`
// of the frame's time for building those drawn (VISITS.budget), first
const MARSHAL = Object.freeze({ every: 0.5, from: 24, margin: 3, share: 0.5 });

// How near (metres) an adventurers' cache has to be to be seen, and marked on the maps from then
// on (core/caches.js: they're put out further off than this, ahead of the player)
const CACHE_SEEN = 60;
// Someone looking at the player passing near (#noticing): within `near` metres and `round` degrees
// of ahead, for `look` seconds (from, to), then not for `rest` more; and where on someone they look
// (a share of their height: their eyes)
const GAZE_NOTICE = Object.freeze({ near: 4.5, round: 100, look: [2, 5], rest: [4, 10] });
const GAZE_EYES = 0.935;

// Passing for one of a people's soldiers (core/host.js "disguise" events), in words
const DISGUISES = Object.freeze({
    on: (people) => `In their uniform, you pass for one of the ${people} soldiers.`,
    off: () => "Out of their uniform, you're yourself again.",
    seen: (people) => `One of the ${people} soldiers sees through your disguise!`,
    known: (people) => `You've shown yourself for what you are: the ${people} soldiers know you now.`,
});

// Some of a thing, in words: "a healing draught", "3 healing draughts"
function thingsOf({ id, quality, count = 1 }) {
    const name = itemLabel({ id, quality }).toLowerCase();

    return count > 1 ? `${count} ${name.endsWith("s") ? name : `${name}s`}` : `${/^[aeiou]/.test(name) ? "an" : "a"} ${name}`;
}

// What a request's reward is, in words: its gold, and any tome besides ("your name in the rolls", for nothing)
const rewardOf = ({ gold, tome }) => [gold ? `${gold} gold` : null, tome ? `the Tome of ${SPELLS[tome].label}` : null].filter(Boolean).join(", and ") || "your name in the rolls";

// What a thing in the pack is, in words: what it does, and how well made it is
function aboutOf({ id, quality }) {
    const { use, slot, armor = 0, part = false, price, tome } = ITEMS[id];
    const power = QUALITIES[quality]?.power ?? 1;
    const worth = part ? ` The adventurers' guild pays ${price} gold for it.` : "";

    if (tome && ITEMS[id].opens) {
        const school = SCHOOLS[ITEMS[id].opens].label;

        return `Read it to learn ${SPELLS[tome].label} at once, opening the school of ${school}: its other spells come as it grows. ${SPELLS[tome].about} (sold at any adventurers' guild)`;
    }

    if (tome) {
        return `Read it to learn ${SPELLS[tome].label} at once: ${SPELLS[tome].about} (${SPELLS[tome].tome}; the adventurers' guild buys tomes)`;
    }

    if (use?.cure) {
        const { label, about } = AFFLICTIONS[use.cure];

        return `Cures what's ${label.toLowerCase()} at once. (${about})`;
    }

    if (use?.boon || use?.safety) {
        return ITEMS[id].about;
    }

    if (use) {
        return `${use.heal ? `Heals ${use.heal} hit points.` : "Fills your stamina."}${worth}`;
    }

    if (part) {
        return worth.trim();
    }

    // (Gear: what it does is told piece by piece, app/gearinfo.js)
    return slot === "mainHand" ? "A weapon." : `Armour: takes ${Math.round(armor * power * 100)}% off each blow.`;
}

// What lingers on someone after some blows (core/afflictions.js), as it shows: rising off them
// now and then (`bursts`: effects.js BURSTS, every `every` seconds or so, from anywhere between
// `at` shares of their height up, `round` metres out from the middle of them: on them, not in
// them), the tinge on their skin (`tint`, pulsing), a number the colour of it when it hurts
// (`hurt`: a burst there too), and what's drawn on them (world/ailments3d.js), by its look
const AILING = Object.freeze({
    poison: { bursts: ["venomBubbles", "venomDrip"], every: 0.18, at: [0.3, 0.8], round: 0.2, tint: [0, 0.1, 0], hurt: "venomBubbles" },
    disease: { bursts: ["flies", "miasma"], every: 0.35, at: [0.75, 0.95], round: 0.3, tint: [0.07, 0.06, 0], hurt: "miasma" },
    // (What's caught at a bordello: a fly now and then, and a little sallow)
    pox: { bursts: ["flies"], every: 0.9, at: [0.75, 0.95], round: 0.3, tint: [0.04, 0.035, 0], hurt: null },
    wither: { bursts: ["wither", "shadows"], every: 0.25, at: [0.2, 0.9], round: 0.3, tint: [0.04, 0, 0.08], hurt: "wither", drawn: "curse" },
    burn: { bursts: ["flames", "smoke"], every: 0.06, at: [0.05, 0.85], round: 0.18, tint: [0.24, 0.07, 0], hurt: "flames" },
    bleed: { bursts: ["drip"], every: 0.22, at: [0.4, 0.65], round: 0.17, tint: null, hurt: "blood" },
    slow: { bursts: [], every: 0.3, at: [0.05, 0.4], round: 0.2, tint: null, hurt: null },
    fear: { bursts: ["shadows"], every: 0.3, at: [0.7, 1], round: 0.25, tint: [0.03, 0.03, 0.06], hurt: null },
});

// Slowed, as it was done: webbed, rooted, chilled (each drawn, and each its own icon and words)
const HELD = Object.freeze({
    web: { icon: "webbed", label: "Webbed: slowed", on: "You're caught in a web!", drawn: "web", bursts: ["webbed"] },
    roots: { icon: "rooted", label: "Rooted: slowed", on: "Roots hold you fast!", drawn: "roots", bursts: [] },
    frost: { icon: "chilled", label: "Chilled: slowed", on: "You're chilled to the bone!", drawn: "frost", bursts: ["frost"], tint: [0.03, 0.07, 0.14] },
});

// What the player's told when something takes hold of them
const TAKEN = Object.freeze({ poison: "You're poisoned!", disease: "You've caught a sickness!", pox: "You've caught something upstairs: you're diseased!", wither: "A curse withers you!", burn: "You're on fire!", bleed: "You're bleeding!", slow: "You're slowed!", fear: "You're terrified!" });

// The icon, words and what's drawn for what's lingering on someone (its kind, and look)
function ailmentOf(kind, look = null) {
    const held = kind === "slow" ? HELD[look] : null;
    const icons = { poison: "poisoned", disease: "diseased", pox: "diseased", wither: "withered", burn: "burning", bleed: "bleeding", slow: "slowed", fear: "fear" };

    return {
        icon: held?.icon ?? icons[kind],
        label: held?.label ?? AFFLICTIONS[kind]?.label ?? kind,
        on: held?.on ?? TAKEN[kind],
        drawn: held?.drawn ?? AILING[kind]?.drawn ?? null,
        bursts: held ? [...AILING[kind].bursts, ...held.bursts] : AILING[kind]?.bursts ?? [],
        tint: held?.tint ?? AILING[kind]?.tint ?? null,
    };
}

// How the wild's creatures' spit and the like fly (app/game.js #fly): lobbed in an arc (`arc`:
// how high, m), or along the ground (roots burrowing: `ground`)
const FLIGHT = Object.freeze({ arrow: { arc: 0.25 }, venom: { arc: 0.55 }, lava: { arc: 0.75 }, web: { arc: 0.4 }, roots: { ground: true }, flame: { arc: 0 } });

// What bursts where each of the creatures' own lands (besides the burst in its look)
const SPLASHES = Object.freeze({ venom: ["venomSplash"], lava: ["lavaSplash", "embers", "smoke"], web: ["webSplat"], roots: ["earth"], curse: ["shadows", "wither"], drain: ["shadows", "wither"], flame: ["flames", "smoke"] });

// What a creature that doesn't bleed red spills where it's struck (effects.js BURSTS): by its
// blood (creatures.js), or, with none, by what it is
const SPILLS = Object.freeze({
    slime: ["slimeSplash"],
    ichor: ["ichor"],
    sap: ["sap", "dust"],
    skeleton: ["boneChips", "dust"],
    wightLord: ["boneChips", "shadows"],
    ghost: ["wither"],
    wraith: ["shadows"],
    blackShuck: ["shadows"],
    shadowStalker: ["shadows"],
    wisp: ["wither"],
    magmaSlime: ["lavaSplash", "embers"],
    rockTusker: ["stoneChips", "dust"],
});

// How each school's spells are cast (the caster's movements and the sound: effects.js LOOKS):
// healing as healing, the elements as the fire and light bolts are. (How each looks gathering and
// landing is its own: spellfx.js)
const SPELL_LOOKS = Object.freeze({ fire: "fireball", earth: "roots", air: "bolt", water: "bolt" });

// A spell lasting on someone shows on them this often (a mote of its colour: times a second)
const LINGER = 5;

// Levitating: how high off the ground (m), bobbing so much (m), so fast (radians a second)
const LIFT = Object.freeze({ height: 0.35, swing: 0.06, bob: 2.2 });

// How fast the camera's shaking dies away (a share of it, a second)
const SHAKE_DIES = 4;

// What the host tells of besides the battle's events (#hear)
const HOST_EVENTS = new Set(["open", "close", "join", "leave", "explored", "talk", "effect", "war", "turn", "muster", "relieved", "fieldBattle", "dismiss", "worksOut", "worksDown", "works", "convoy", "convoyed", "parted", "fortOut", "fortDown", "squadsOut", "quartered", "unquartered", "barracks", "taken", "camp", "strike", "army", "supply", "skirmishers", "leaders", "envoy", "envoyed", "farewell", "follower", "fate", "unrest", "gone", "roused", "cleared", "rank", "loot", "bought", "sold", "used", "gear", "disguise", "discarded", "dropped", "picked", "spoils", "ability", "request", "standing", "guild", "gift", "counsel", "trade", "tier", "learnt", "grown", "companion", "summons", "carried", "polymorphed", "attracted", "slept", "boon", "safety", "townsfolk", "emote"]);

// What lies on the ground (core/battle.js HAZARDS), as it shows: what rises off it now and then,
// anywhere on it (effects.js BURSTS)
const GROUNDS = Object.freeze({
    fire: ["flames", "embers"],
    acid: ["venomBubbles", "steam"],
    rot: ["miasma", "flies"],
    lava: ["lavaSplash", "embers"],
    venom: ["venomBubbles"],
});

// What the player's told of a spell of theirs lasting on them wearing off, or being called off
// (Invisibility: they've been seen), by the spell
const WORN_OFF = Object.freeze({ invisibility: "You're seen again." });

const _focus = new THREE.Vector3();
const _gazeAt = new THREE.Vector3();
const _lean = new THREE.Vector3();
const _looking = new THREE.Vector3();
const _head = new THREE.Vector3();
const _hearth = new THREE.Vector3();
const _lit = new THREE.Vector3();

export class Game {
    #begin = null;

    /**
     * @param {object} options
     * @param {import("../world/view.js").View} options.view
     * @param {object} options.kit - The character kit (characters/kit.js).
     * @param {object} options.world - From buildWorld (core/overworld.js: the world, with the
     *     town set in it), or generateWorld (core/world.js: the town on its own).
     * @param {object} options.hero - The player's character: { name, shape, look, weapon }.
     * @param {import("./hud.js").Hud} options.hud
     * @param {object} [options.talks] - What the folk remember of the player, and what the player
     *     has learnt talking (save.js loadTalks): { memory, knowledge }.
     * @param {Function} [options.onTalk] - Hears them whenever they change (to keep them).
     * @param {object} [options.explored] - What the player has found of the world (save.js
     *     loadExplored: core/explored.js Explored's toJSON).
     * @param {Function} [options.onExplore] - Hears it whenever they find more (to keep it).
     * @param {Function} [options.onWorldMap] - Asked to open the world map (the minimap held).
     * @param {Host} [options.host] - The world's host (core/host.js): made here if not given
     *     (playing alone), with the player joining it.
     * @param {string} [options.me] - The player's id in it.
     * @param {object} [options.war] - The world's war as it was kept (save.js loadWorld), for a
     *     host made here to carry on from.
     * @param {Function} [options.onWar] - Hears the war (core/war/war.js) after each of its
     *     turns (to keep it).
     * @param {object} [options.progress] - The player's skills, gold, pack and gear, as kept
     *     (save.js loadProgress: core/progress.js Progress's toJSON).
     * @param {Function} [options.onProgress] - Hears them whenever they change (to keep them).
     * @param {object} [options.standing] - Where they stand with their people, and the requests
     *     they carry, as kept (save.js loadStanding: core/standing.js Standing's toJSON).
     * @param {Function} [options.onStanding] - Hears it whenever it changes (to keep it).
     * @param {object} [options.wheels] - What the player's put on their action wheels, as kept
     *     (save.js loadWheels: app/wheel.js readWheels), or nothing (what they start with).
     * @param {Function} [options.onWheels] - Hears them whenever they're changed (to keep them).
     * @param {Array} [options.pin] - Where the player's pinned on the world map ([x, z] metres, as
     *     kept: save.js loadPin), or null.
     * @param {Function} [options.onPin] - Hears it whenever it's dropped or taken away (to keep it).
     * @param {object} [options.place] - Where the player was out in the world when the game last
     *     stopped ({ x, y, facing }: save.js loadPlace), to carry on there; or null (where the
     *     world puts them: by their home town's tavern).
     * @param {object} [options.vitals] - How the player was then (save.js loadVitals: core/host.js
     *     vitalsOf: their hit points and stamina, what lingered and lasted on them, their boons,
     *     their abilities' and spells' waits), to carry on so; or null (whole, nothing on them).
     */
    constructor({ view, kit, world, hero, hud, sound = null, talks = { memory: {}, knowledge: [] }, onTalk = () => {}, explored = {}, onExplore = () => {}, onWorldMap = () => {}, host = null, me = HOST_PLAYER, war = null, onWar = () => {}, progress = {}, onProgress = () => {}, standing = {}, onStanding = () => {}, followers = [], onFollowers = () => {}, wheels = null, onWheels = () => {}, remote = null, pin = null, onPin = () => {}, place = null, vitals = null }) {
        this.view = view;
        this.kit = kit;
        this.sound = sound;
        this.world = world;
        this.hero = hero;
        this.hud = hud;

        // The world (the host's: made here, playing alone), this game's player in it (by id,
        // come in before the world's own people), and the battle as the host has it
        this.me = me;
        this.host = host ?? new Host(world, { populate: false, war });
        this.onWar = onWar;

        /**
         * Playing together (docs/WAR.md M11): joined to a world someone else hosts, how this game
         * plays its copy of it on and sends its player's commands (core/netplay.js Joining; its
         * player's already in it); or hosting one opened to others, what sends them what's done
         * (Hosting: set by whoever opens it).
         */
        this.remote = remote;
        this.hosting = null;
        this.flushedAt = 0;
        this.pingedAt = 0;

        /** A joined game's hero, drawn going where they're sent before the host's heard (app/predict.js). */
        this.predict = remote ? new Prediction() : null;

        /**
         * How the link to the others is (app/together.js onLink): null, all's well; "lost", this
         * game's dropped and coming back; "away", the host's. With when a joined game last played a
         * step of the host's, and what the HUD says of it all (#together).
         */
        this.link = null;
        this.steppedAt = 0;
        this.together = null;

        if (!remote) {
            // (Where they were when it last stopped, if it's somewhere that can be stood on still:
            // else the nearest square that can, near it; else where the world puts them)
            let square;

            try {
                square = place ? nearestFree(world.maps?.town ?? world, [Math.floor(place.x), Math.floor(place.y)], { within: 8 }) : undefined;
            } catch {
                place = null;
            }

            this.host.join({ id: me, hero, talks, explored, progress, standing, followers, ...(square ? { square } : {}) });

            const actor = place ? this.host.battle.actor(me) : null;

            if (actor && actor.square[0] === Math.floor(place.x) && actor.square[1] === Math.floor(place.y)) {
                Object.assign(actor, { x: place.x, y: place.y, facing: place.facing });
            }

            // (Getting up at home still, if they fall)
            if (actor && world.spawns?.player) {
                actor.spawn = [...world.spawns.player];
            }

            // (As they were: hurt, poisoned, blessed, a spell still on them)
            this.host.restoreVitals(me, vitals);
        }

        this.onFollowers = onFollowers;

        /**
         * What's on the player's action wheels: their own and an enemy's, each two sides; and their
         * quick actions, four (app/wheel.js).
         */
        this.wheels = readWheels(wheels);

        /** Hears a quick action held on (its slot), to change what's in it (main.js: Quick actions). */
        this.onChooseQuick = () => {};

        /** Till when (the clock) the quick actions stay up: a moment after the last of a fight. */
        this.fightUntil = -Infinity;
        this.onWheels = onWheels;
        this.onProgress = onProgress;
        this.onStanding = onStanding;

        // Where the player's pinned on the world map ([x, z] metres, or null), the way there
        // (core/journey.js: across the world, and along the ground near them), and running
        // somewhere far, set off from the map (app/journey.js), or null
        this.pin = Array.isArray(pin) && pin.length === 2 && pin.every(Number.isFinite) ? [...pin] : null;
        this.onPin = onPin;
        this.pinWay = null;
        this.journey = null;

        /** Trading with a shopkeeper (from their talk): { shop, keeper (their id), name }, or null. */
        this.shopping = null;
        this.shopWanted = null;

        if (!remote) {
            this.host.populate();
        }

        this.battle = this.host.battle;
        this.avatars = new Map();
        this.previous = new Map();
        // (Those in view who can be drawn in full this frame, the crowd biggest on the screen, if
        // there are more than that: #crowding)
        this.crowd = new Set();
        this.crowded = false;
        this.running = false;
        this.accumulator = 0;
        this.lastFrame = 0;

        /** When to draw the world: no oftener than the quality level does (app/pacing.js). */
        this.pacing = new Pacing();

        /**
         * Keeping up (Game options: Adaptive, app/governor.js): from the quality chosen down, as a
         * game before left it.
         */
        this.governor = new Governor({ levels: Object.keys(QUALITY), ceiling: view.chosenQuality ?? view.qualityName, at: { quality: view.qualityName, scale: view.adaptiveScale } });

        /** Heard when it draws a level, or a share of the pixels, it didn't (Adaptive): ({ quality, scale }). */
        this.onAdapt = null;

        /** Timings for the debug overlay (milliseconds, smoothed), and the last frames' times. */
        this.stats = { frame: 0, update: 0, render: 0, steps: 0, fps: 0 };

        // (The errors a frame's work has thrown, each reported once: #fault)
        this.faults = new Set();
        this.frameTimes = new Float32Array(120);
        this.frameIndex = 0;
        this.frames = 0;
        this.fpsTime = 0;

        /** Resolves once it's started and under way: its world stepped and drawn (a frame's). */
        this.underway = new Promise((resolve) => (this.#begin = resolve));

        /** When each character last attacked (battle time), to stand on guard for a while after. */
        this.lastAttack = new Map();
        this.flights = new Map();
        this.flash = new Map();

        // Those with something lingering on them (their ids), and when each's next shows it (by
        // id and kind: s); those whose skin's tinged by it
        this.ailed = new Set();

        /** Whether another player's Summon is said no to at once, not asked (Game options). */
        this.resistSummons = false;

        /**
         * How the camera's turned and shaken (Game options): whether it follows round behind the
         * player as they walk (app/camera.js `follows`), whether the greater spells shake it,
         * how far a drag turns and tilts it (times DRAG_TURN and DRAG_TILT), and whether dragging
         * up tilts it down rather than up.
         */
        this.cameraSettings = { follows: true, shake: true, drag: 1, invert: false };

        // (Who the camera's kept in view in a fight, and till when after: #kept)
        this.fightView = null;

        // What lies on the ground (battle.js hazards: by id, as told), and when each next shows
        this.grounds = new Map();
        this.groundsAt = new Map();
        this.ailingAt = new Map();
        this.tinged = new Set();

        // What lingering things the player's been told the cure for already (their kinds)
        this.curesTold = new Set();

        // Scrolls of Safety being read (by the reader's id: { until (the battle's time), ms,
        // circle (spellfx.js underfoot) }), and those carried home by one, not yet arrived
        this.reading = new Map();
        this.homeward = new Set();

        // Casts heard as they swell (by the caster's id: { source (sound.js play's), spell, until
        // (the battle's time it's let go) }), to be cut short if they're broken off
        this.castSounds = new Map();

        /** What's to happen a little later (the game's clock, s): [{ at, then }]. */
        this.later = [];

        /**
         * How each character's spells and bolts look (effects.js LOOKS: never the same twice in a
         * row), and the look of each spell on its way (on whom it lands).
         */
        this.variety = new Map();
        this.landing = new Map();

        /**
         * Those each spell landing struck ("caster:spell": their ids, told as "hit" before the
         * spell's "spell"), and how hard the camera's shaking (metres, dying away).
         */
        this.struck = new Map();
        this.shaking = 0;

        /** Each character's wounds (wounds.js), and the pools of blood under the fallen: { left, spot }. */
        this.wounds = new Map();
        this.pools = new Map();
        this.pointers = new Map();
        this.pinch = null;
        this.lastTap = null;
        this.listeners = [];
        this.onDeath = () => {};

        /** The map the player is on, the one shown (world.maps), and the game's clock (s). */
        this.mapId = "town";
        this.clock = 0;

        /** Each floor inside (interiors3d.js's), by map id. */
        this.interiors = new Map();

        /**
         * The buildings got ready to go into (their floors and folk built: world.interiors makes
         * their plans), by key: { key, queue (what's still to build, a piece at a time), maps,
         * folk (the ids of what's been built) }; and when they're next looked over (s).
         */
        this.visits = new Map();
        this.visitClock = 0;

        /** Wenches and Ale's folk being dressed from the start, the same way (build), or null. */
        this.tavernFolk = null;

        /** The soldiers the host's brought out, still to be drawn (a few a frame: #visit). */
        this.enlisting = [];

        // Soldiers waiting on their kind's figure in the crowds to be drawn (#marshal), and those crowds
        this.crowdWaiting = new Set();
        this.crowds = null;

        // Those of them begun, being drawn a step at a time (the nearest the player first: one
        // further off put by for one nearer, and taken up again after): id -> { actor, steps }
        this.enlistees = new Map();

        // (Whether what's built a step at a time can wait on work done elsewhere, a worker's: not
        // while playing on at once, advance)
        this.waits = true;

        /**
         * When the player last did anything (the game's clock, s), and when they next rest (null
         * until they've stood a while with nothing going on: roles.js PLAYER_RESTS_AFTER).
         */
        this.lastInput = 0;
        this.restAt = null;

        /** The folk about to cheer (#cheer): { id, at (the game's clock, s), emote }. */
        this.cheers = [];

        /** Who's traded blows with the player, and when last (the game's clock, s): #ours. */
        this.fought = new Map();

        /**
         * Talking (core/dialogue.js): who hears what the folk remember of the player and what the
         * player's learnt (the player's own: memory, knowledge), and the talk under way ({ id,
         * conversation }) or who the player's going to talk to (an id).
         */
        this.onTalk = onTalk;

        /**
         * What the player's found of the world (explored: the host keeps it, as they go): who
         * hears of it, and the icons over the buildings they've been in, for the maps (made again
         * as more are found).
         */
        this.onExplore = onExplore;
        this.onWorldMap = onWorldMap;
        this.landmarks = { version: -1, icons: [] };
        /** The adventurers' caches the player's seen (their ids: core/caches.js), marked on the maps. */
        this.cachesSeen = new Set();
        this.talking = null;
        this.approaching = null;
        this.talkVariety = new Variety();

        // The map whose guild's portal the player's walking up to (tapped: #keepToPortal), or null;
        // and whose war table (#keepToTable)
        this.toPortal = null;
        this.toTable = null;
    }

    /** This game's player, as the host has them (core/host.js players). */
    get self() {
        return this.host.players.get(this.me);
    }

    /** Where the player stands with their people, and the requests they carry (core/standing.js Standing). */
    get standing() {
        return this.self.standing;
    }

    /** The player's skills, gold, pack and gear (core/progress.js Progress). */
    get progress() {
        return this.self.progress;
    }

    /** What each of the folk remembers of the player (by id). */
    get memory() {
        return this.self.talks.memory;
    }

    /** What the player's learnt, talking (a Set). */
    get knowledge() {
        return this.self.talks.knowledge;
    }

    /** What the player's found of the world (core/explored.js). */
    get explored() {
        return this.self.explored;
    }

    /** What's been done in the world by talking (things bought, rooms rented: the host's). */
    get done() {
        return this.host.done;
    }

    /** Where a map is drawn in the world ([x, z] metres). */
    // The far land round the player at (x, z) (metres), out to the horizon (world/far/far.js): as
    // many levels of it as the quality level has (made again if that's changed)
    #farLand(x, z) {
        if (this.far?.levels.length !== this.view.quality.far) {
            this.far?.dispose();
            this.far = new FarLand(this.world.plan, { land: this.chunks.land, levels: this.view.quality.far });
            this.view.setFar(this.far.object);

            // (What's built, as far as the far land reaches)
            if (this.silhouettes) {
                this.view.setHorizon(this.silhouettes, false);
                this.silhouettes.dispose();
            }

            const land = this.world.maps.town;
            const start = land?.start && land.stamp ? { id: land.start.id, pieces: this.world.town.pieces, origin: land.stamp.at, width: land.stamp.width, height: land.stamp.height } : null;

            this.silhouettes = new Silhouettes(this.world.plan, { reach: farReach(this.view.quality.far), trees: this.view.quality.farTrees ?? 0, start, sun: this.view.sunDirection });
            this.view.setHorizon(this.silhouettes);
        }

        // (The world's landmark: the volcano, its fire and smoke)
        if (!this.volcano) {
            this.volcano = new Volcano(this.world.plan);
            this.view.setHorizon(this.volcano);
        }

        this.far.update(x, z);
        this.silhouettes.update(x, z, this.world.maps.town?.sites?.set);
        this.volcano.update(this.clock);
    }

    // How the world looks round the player at (x, z) (metres), `dt` seconds on (world/look.js: the
    // sky's colours, the sun's, the mist and the grade, as the lands round them have them)
    #landLook(x, z, dt) {
        this.landLook ??= new Look(this.world.plan);
        this.view.setLook(this.landLook.update(x, z, dt));
    }

    // The torches, lanterns, braziers and camp fires nearest the player at (x, z) (metres), and the
    // spells' fire and flashes, each lighting what's round it (world/lights.js: the view's lamps
    // and the world's list of lights; a spell's first)
    #lightNear(x, z) {
        const lights = this.chunks.lightsNear(x, z, LIGHT_REACH, (this.nearLights ??= []));

        lights.push(...(this.town?.lights ?? []), ...(this.camps?.lights() ?? []), ...(this.forts3d?.lights() ?? []), ...(this.banners?.lights() ?? []), ...(this.carried?.lights() ?? []), ...(this.globes?.lights() ?? []), ...(this.spellFx?.lightsNow() ?? []));
        GLOW_SCALE.value = this.view.pixelsPerMetre();
        EMBER_SCALE.value = GLOW_SCALE.value;
        this.view.lightNear(lights, _lit.set(x, this.avatars.get(this.me).object.position.y + 1.2, z));
    }

    // The torches carried at night (world/carried.js): by the soldiers with a hand free, out in
    // the world, as the rules have it (core/light.js carriesTorch), each burning in their hand
    #torchesCarried() {
        const dark = torchesLit(elapsedOf(this.host.war));
        const carriers = (this.carriers ??= []);

        carriers.length = 0;

        for (const actor of dark ? this.battle.actors : []) {
            const avatar = carriesTorch(actor, dark) && actor.map === "town" ? this.avatars.get(actor.id) : null;

            // (Not one of a crowd: world/crowd.js)
            if (avatar?.character && !(avatar instanceof CrowdAvatar)) {
                carriers.push({ id: actor.id, character: avatar.character, shown: avatar.object.visible });
            }
        }

        this.carried?.update(carriers);
    }

    // The Light spell's globes (world/globes.js): over everyone on the player's map with one shining
    // (core/spells.js light, a lasting spell: battle.js buffOf), drifting after them
    #lightGlobes(dt) {
        const casters = (this.globeCasters ??= []);

        casters.length = 0;

        for (const actor of this.battle.actors) {
            const avatar = actor.map === this.mapId && !actor.dead && this.battle.buffOf(actor, "light") ? this.avatars.get(actor.id) : null;

            if (avatar?.object) {
                casters.push({ id: actor.id, object: avatar.object, shown: avatar.object.visible });
            }
        }

        this.globes?.update(casters, dt, this.battle.time / 1000);
    }

    // The time of day the world's clock has (core/daytime.js: the war's, the same for every
    // player), outdoors and in: the sky, the sun or the moon, the daylight at the windows
    #daytime() {
        const elapsed = elapsedOf(this.host.war);
        const time = timeOfDay(elapsed);

        this.view.setTimeOfDay(time, moonPhase(elapsed));
        INTERIOR_GLOW.daylight.value = daylight(time);
    }

    originOf(mapId) {
        return this.world.maps?.[mapId]?.origin ?? [0, 0];
    }

    /**
     * The ground's height on a map at a point in the world (metres), as a function (x, z), or null
     * where it's flat at 0 (indoors, or a town on its own).
     */
    groundOf(mapId) {
        this.groundsOf ??= new Map();

        if (!this.groundsOf.has(mapId)) {
            const map = this.world.maps?.[mapId];
            const [ox, oz] = this.originOf(mapId);
            const most = map?.width - 0.01;

            this.groundsOf.set(mapId, map?.heightAt ? (x, z) => map.heightAt(Math.min(most, Math.max(0, x - ox)), Math.min(most, Math.max(0, z - oz))) : null);
        }

        return this.groundsOf.get(mapId);
    }

    // How high the ground is on a map at a point in the world (metres: 0 where it's flat)
    #groundOn(mapId, x, z) {
        return this.groundOf(mapId)?.(x, z) ?? 0;
    }

    // What's drawn on the map the player's on stands on its ground (null: flat at 0)
    #setGround(at) {
        this.view.setGround(at);
        this.effects?.setGround(at);
        this.drops?.setGround(at);

        if (this.contacts) {
            this.contacts.groundAt = at;
        }
    }

    /**
     * Build everything there is to see: the world round the player (or the ground), the town,
     * the player and the orc, and the shaders to draw them. `onProgress({ label, done, total })`
     * hears how far it's got: never past its total, and at it when ready (`loaded` keeps the last,
     * and the most it came to).
     */
    async build(onProgress = () => {}) {
        const { view, world } = this;
        const timings = {};
        const time = async (name, work) => {
            const start = performance.now();
            const result = await work();

            timings[name] = performance.now() - start;

            return result;
        };
        const floors = Object.values(world.maps ?? {}).filter(({ id }) => id !== "town");
        const folk = world.folk ?? [];
        const outside = Boolean(world.maps?.town?.chunk);
        const chunks = outside ? (2 * REACH.drawn + 1) ** 2 : 0;

        // (Wenches and Ale's folk, seen only inside it, dressed from the start as other buildings'
        // are as the player comes near, where there are other buildings: a little each frame)
        const later = Boolean(world.interiors) && floors.length > 0;
        const tavern = later ? world.interiors.of(floors[0].id)?.key : null;
        // (Everyone dressed before the first frame but the player: the orc, the soldiers and the
        // wild's creatures about, anyone else playing, and the tavern's folk unless they're later)
        const dressed = this.battle.actors.filter((actor) => actor.id !== this.me && !(actor.kind === "folk" && tavern)).length;
        // (The steps: the land's chunks, the town's pieces and trees, each floor, each one dressed;
        // and five more: the town begun, the player dressed, ready to draw, the map, ready)
        const steps = chunks + world.town.pieces.length + world.trees.length + floors.length + dressed + 5;
        let done = 0;
        const report = (label) => {
            done = Math.min(done, steps);
            this.loaded = { done, total: steps, most: Math.max(this.loaded?.most ?? 0, done) };
            onProgress({ label, done, total: steps });
        };
        const step = (label) => {
            done += 1;
            report(label);
        };

        this.loaded = null;

        // The buildings' textures, painted in workers while the land is laid
        const atlas = prepareAtlas();

        // The town's trees, for hearing their leaves (and the world's, as it's drawn)
        this.townTrees = treesOf(world).map(({ x, y }) => ({ x, z: y }));
        this.sound?.setTrees(this.townTrees);
        report("Laying the land");

        if (outside) {
            // The world round where the player starts (or carries on), a chunk at a time (then
            // more as they go)
            const [x, y] = this.battle.actor(this.me)?.map === "town" ? this.battle.actor(this.me).square : world.spawns.player;

            this.chunks = new Chunks(world, { undergrowth: view.quality.undergrowth, cliffs: view.quality.cliffs });
            this.chunks.setSpacing(view.quality.ground);
            view.scene.add(this.chunks.object);
            // (The tall grass over the land round the player, as the chunks there are drawn)
            this.grass = new TallGrass(this.chunks.overworld, { ready: (cx, cy) => this.chunks.isDrawn(cx, cy) });
            this.grass.setQuality(view.quality.grass);
            this.chunks.object.add(this.grass.object);
            // (And the land's motes drifting in the air round them)
            this.motes = new Motes();
            this.motes.setQuality(view.quality.motes);
            // (As much of the chimneys' smoke as the quality draws)
            SMOKE_SHARE.value = view.quality.smoke;
            this.chunks.object.add(this.motes.object);
            this.#farLand(x + 0.5, y + 0.5);
            this.#daytime();
            this.#landLook(x + 0.5, y + 0.5, 0);
            // (Counted by the chunks drawn, however many goes each takes)
            const landed = done;

            await time("chunks", async () => {
                while (this.chunks.update(x + 0.5, y + 0.5, { budget: LOAD_BUDGET }) || this.chunks.busy) {
                    const drawn = Math.min(this.chunks.drawn.size, chunks);

                    done = landed + drawn;
                    report(`Laying the land (${drawn} of ${chunks})`);
                    await new Promise((resolve) => setTimeout(resolve, 0));
                }
            });
            done = landed + chunks;
            this.#hearTrees();
        } else {
            this.ground = await time("ground", () => buildGround(world));
            view.scene.add(this.ground);
        }

        step("Building the town");
        await time("atlas", () => atlas);

        const built = done;

        this.town = await time("town", () => buildTown(world, {
            groundAt: this.groundOf("town") ?? undefined,
            landAt: (x, z) => world.maps?.town?.biomeAt?.(x, z) ?? "meadow",
            onProgress: (count) => {
                done = built + count;
                report(count < world.town.pieces.length ? `Building the town (${count} of ${world.town.pieces.length})` : `Planting trees (${count - world.town.pieces.length} of ${world.trees.length})`);
            },
        }));
        view.scene.add(this.town.object);

        // What can stand between the camera and the player: the town's buildings and trees, and
        // the world's trees round it
        this.occluders = {
            heights: { at: (x, z) => Math.max(this.town.heights.at(x, z), this.chunks?.heightAt(x, z) ?? 0) },
            buildings: this.town.buildings,
        };
        view.setOccluders(this.occluders);
        view.setGround(this.groundOf("town"));

        // Inside the tavern, each floor put away until the player goes in; and its doors and stairs
        for (const map of floors) {
            step(`Furnishing ${map.name}`);

            const interior = await time(map.id, () => buildInterior(map));

            interior.object.visible = false;
            view.scene.add(interior.object);
            this.interiors.set(map.id, interior);
        }

        this.doors = new Doors(world, view.scene);
        this.banners = new Banners(view.scene);
        this.camps = new Camps(view.scene);
        // (And the fortifications standing near the player: world/forts3d.js, #syncForts)
        this.forts3d = new Forts(view.scene, view.far.scene);
        this.fortsClock = 0;
        this.carried = new CarriedTorches(view.scene);
        this.globes = new LightGlobes(view.scene);
        this.pinMarks = new PinMarks(view.scene, view.far.scene);

        // (A pin kept from before: the world's ground for finding the way to it worked out now,
        // while it's loading, not in the first frames)
        if (this.pin && world.plan) {
            crossingsOf(world.plan);
        }
        this.drops = new Drops(view.scene, { picture: (id) => this.#itemPicture(id) });

        // (Banners and camps only ever outside, on the world's ground)
        this.banners.setGround(this.groundOf("town"));
        this.camps.setGround(this.groundOf("town"));
        this.forts3d.setGround(this.groundOf("town"));

        // What flies over the world outside: birds of each land, and the wyverns and the dragon
        // near their lairs (flyers3d.js)
        const overworld = world.maps?.town;

        if (overworld?.biomeAt) {
            this.flyers = new Flyers({ landAt: (x, z) => overworld.biomeAt(x, z), groundAt: this.groundOf("town"), lairs: () => this.#lairsAloft(), prepare: (object) => view.prepare(object) });
            view.scene.add(this.flyers.object);
        }
        step(`Dressing ${this.hero.name}`);

        // Everyone in the world as the host has them: the player (and anyone else playing), the
        // orc, and the tavern's folk going about their business (no one fights them). Each built a
        // step at a time, as they are in play, so that their skin's painted by the skins worker
        // (characters/skins.js) while the rest of them is built here, rather than here after it.
        // The tavern's folk, where there are other buildings, are dressed as theirs are, a little
        // each frame from the start (#visit), and all at once if the player goes straight in
        // (#ready): only seen inside, they needn't keep the player waiting to start
        let filled = 0;

        if (tavern) {
            const visit = { key: tavern, queue: [], maps: [], folk: [] };

            visit.queue.push(...this.battle.actors.filter(({ kind }) => kind === "folk").map(({ id }) => () => this.#people(visit, id)));
            this.tavernFolk = visit;
        }

        for (const actor of [...this.battle.actors]) {
            if (actor.kind === "folk" && tavern) {
                continue;
            }

            if (actor.kind === "folk") {
                step(`Filling the tavern (${++filled} of ${folk.length})`);
            } else if (actor.id !== this.me) {
                step(actor.kind === "player" ? `Dressing ${actor.name}` : `Waking the ${actor.name.toLowerCase()}`);
            }

            await time(actor.id === this.me ? "hero" : actor.id, () => allWaiting(this.#dressing(actor)));
        }

        // (Starting in the tavern: its folk there to see from the first)
        this.#ready(world.interiors?.of(this.battle.actor(this.me).map)?.key);

        step("Getting ready to draw");

        this.effects = new Effects(view.scene);
        this.contacts = new ContactShadows();
        view.scene.add(this.contacts.mesh);
        this.ailments = new Ailments3D(this.effects.group);
        // (Its fire, flashes and fireballs lighting what's round them as the world's fires do, each
        // a light of its own: lightsNow, #lightNear; not lent the view's lamps)
        this.spellFx = new SpellFx(this.effects, view.scene, { lights: [] });
        this.spellFx.camera = view.camera;
        this.spellFx.onShake = (amount) => (this.shaking = this.cameraSettings.shake ? Math.max(this.shaking, amount) : 0);
        this.spellFx.onScreen = (colour, strength, seconds) => this.#wash(colour, strength, seconds);
        this.spellFx.warm();
        this.#setGround(this.groundOf(this.battle.actor(this.me).map));

        for (const actor of this.battle.actors.filter(({ id }) => this.avatars.has(id))) {
            this.#place(actor);
        }

        // The camera starts on the player, looking north
        const start = this.avatars.get(this.me).object.position;

        this.cameraFollow = new CameraFollow({ x: start.x, z: start.z });
        this.#follow(0);
        step("Drawing the map");

        this.minimap = await time("minimap", () => new Minimap(this.hud.map, world, { onTap: (tap) => this.mapTap(tap), onHold: () => this.onWorldMap() }));
        this.minimap.show(this.minimapShown ?? true);
        this.wheel = new ActionWheel(this.hud.root);
        this.wheel.element.classList.add("action-wheel");
        this.quickBar = new QuickBar(this.hud.root);
        this.quickBar.onUse = (slot) => this.quick(slot);
        this.quickBar.onChoose = (slot) => this.onChooseQuick(slot);
        this.talk = new TalkPanel(this.hud.root);
        this.pack = new PackPanel(this.hud.root);
        this.pack.onCommand = (command) => this.#packCommand(command);
        this.pack.onWheel = (id) => this.#putOnWheel(`item:${id}`);
        this.dollTurn = 0;
        this.pack.onTurn = (angle) => {
            this.dollTurn += angle;
        };
        this.spellbook = new SpellbookPanel(this.hud.root);
        this.spellbook.onWheel = (id) => this.#putOnWheel(id, ACTIONS[id]?.on === "enemy" ? "enemy" : "self");
        this.spellbook.onClose = () => this.closeSpellbook();
        this.pack.onClose = () => this.closePack();
        this.pack.onPage = () => this.sound?.play("pageTurn");
        this.journal = new JournalPanel(this.hud.root);
        this.journal.onAbandon = (id) => {
            this.#command({ type: "abandon", request: id }, () => this.journal.open && this.#showJournal());
        };
        this.journal.onClose = () => this.closeJournal();
        this.fate = new FatePanel(this.hud.root);
        this.talk.onChoose = (index) => this.#say(index);
        this.talk.onClose = () => this.#endTalk();
        this.effects.camera = view.camera;

        // The black the screen dips to going through a door, and the colour it's washed with
        // by the greater spells
        this.curtain = document.createElement("div");
        this.curtain.className = "curtain";
        this.hud.root.prepend(this.curtain);
        this.washing = document.createElement("div");
        this.washing.className = "spellwash";
        this.hud.root.prepend(this.washing);

        // Compile every shader now rather than when each thing first comes into view
        await time("shaders", () => view.renderer.compileAsync(view.scene, view.camera));
        done = steps;
        report("Ready");

        this.timings = timings;

        const player = this.battle.actor(this.me);

        this.hud.clear();
        this.hud.setPlayer(player);
        this.hud.setGold(this.progress.gold);
        this.hud.setGuild(this.guildCard());

        for (const actor of this.battle.actors.filter((other) => other.id !== this.me && !other.neutral)) {
            this.hud.track(actor.id, { ...actor, hostile: this.battle.hostile(actor, player) });
        }
    }

    // Someone in the battle, drawn (once): a player as they made themselves, the orc, one of the
    // folk. Returns their avatar
    #dress(actor) {
        return allAtOnce(this.#dressing(actor));
    }

    // The same, a step at a time (each a yield: Character.building's), so that drawing someone new
    // is spread over frames. Returns their avatar (none if they've gone meanwhile)
    *#dressing(actor) {
        // (Drawn already: but one of a crowd's built in full, to take its place)
        if (this.#drawnInFull(actor.id)) {
            return this.avatars.get(actor.id);
        }

        const hairDetail = this.view.quality.hair;

        if (actor.kind === "folk") {
            return yield* this.#addingFolk(this.host.folk.get(actor.id));
        }

        // A soldier: as their people's are dressed, carrying what they fight with
        if (actor.kind === "soldier") {
            const soldier = this.host.soldiers.get(actor.id);
            const look = soldierLook(soldier);
            const character = yield* this.#built(actor, { shape: look.shape, look: look.look, equipment: look.equipment, hairDetail: Math.min(hairDetail, FOLK_HAIR), merge: true });

            if (!character) {
                return this.avatars.get(actor.id) ?? null;
            }

            character.sheathe(true);
            character.object.traverse((node) => {
                node.castShadow = false;
            });

            return this.#addAvatar(actor.id, character, { walk: look.walk, guard: guardOf(actor.weapon) });
        }

        // A follower: as the adventurer they were, their weapon put away till there's a fight
        if (actor.kind === "follower") {
            const { calling, sex, seed, people } = this.host.followers.get(actor.id) ?? { calling: "warrior" };
            const look = folkLook({ role: "adventurer", look: calling, sex, seed, people });
            const character = yield* this.#built(actor, { shape: look.shape, look: look.look, equipment: look.equipment, hairDetail: Math.min(hairDetail, FOLK_HAIR), merge: true });

            if (!character) {
                return this.avatars.get(actor.id) ?? null;
            }

            character.sheathe(true);

            return this.#addAvatar(actor.id, character, { walk: look.walk, guard: guardOf(actor.weapon) });
        }

        if (actor.kind === "player") {
            const { hero: { shape, look, weapon }, progress } = this.host.players.get(actor.id);
            const character = yield* this.#built(actor, { shape, look, equipment: heroEquipment(weapon, progress.worn(), this.host.players.get(actor.id).hero.parts ?? []), hairDetail });

            if (!character) {
                return this.avatars.get(actor.id) ?? null;
            }

            // (Weapons put away to start with: drawn for a fight)
            character.sheathe(true);

            return this.#addAvatar(actor.id, character, { walk: "natural", guard: guardOf(weapon) });
        }

        // One of the wild's creatures (core/creatures.js): as its kind looks (beasts/)
        if (actor.kind === "beast") {
            return yield* this.#addingBeast(actor);
        }

        // One of a convoy's wagons: an ox in its shafts
        if (actor.kind === "wagon") {
            return yield* this.#addingWagon(actor);
        }

        // A fortification (its stone drawn by world/forts3d.js): standing in for it in the battle
        if (actor.kind === "fort") {
            return this.#register(actor.id, new FortAvatar(this.host.fortsOut.get(actor.id)?.kind ?? "tower"), { wounds: false });
        }

        // The orc
        const preset = PRESETS.orc;
        const character = yield* this.#built(actor, { shape: preset.shape, look: preset.look, equipment: [...preset.equipment, ...WEAPONS[actor.weapon].equipment], hairDetail, merge: true });

        if (!character) {
            return this.avatars.get(actor.id) ?? null;
        }

        character.sheathe(true);

        return this.#addAvatar(actor.id, character, { walk: preset.walk, guard: guardOf(actor.weapon) });
    }

    // A character for someone, built a step at a time (Character.building); null (and thrown away)
    // if they've gone from the battle meanwhile, or been drawn some other way
    *#built(actor, options) {
        const character = yield* Character.building(this.kit, { far: Boolean(this.kit.lods), ...options });

        if (this.#drawnInFull(actor.id) || !this.battle.actor(actor.id)) {
            character.dispose();

            return null;
        }

        // (Drawn with fewer triangles when small on the screen, anyone but this player: #posing;
        // and into the shadow maps, everyone)
        if (this.kit.lods) {
            character.lowerDetail(this.kit.lods);
        }

        return character;
    }

    // Everyone in the battle drawn, and no one who isn't: a player come or gone, the folk of a
    // building let go (those of a building being got ready are drawn a piece at a time: #visit)
    #mirror() {
        const me = this.battle.actor(this.me);

        for (const actor of this.battle.actors) {
            if (!this.avatars.has(actor.id) && actor.kind !== "folk" && actor.kind !== "soldier" && actor.kind !== "wagon") {
                this.#dress(actor);
                this.#place(actor);
                this.hud.track(actor.id, { ...actor, hostile: Boolean(me) && this.battle.hostile(actor, me) });
            }
        }

        for (const id of [...this.avatars.keys()]) {
            if (!this.battle.actor(id)) {
                this.#undress(id);
            }
        }
    }

    // Someone gone from the battle, no longer drawn
    #undress(id) {
        const avatar = this.avatars.get(id);

        avatar?.character.object.removeFromParent();
        avatar?.character.dispose();
        this.wounds.get(id)?.dispose();
        this.hud.untrack(id);

        for (const each of [this.avatars, this.previous, this.flash, this.lastAttack, this.variety, this.landing, this.wounds, this.pools]) {
            each.delete(id);
        }

        // (And when what lingers on them next shows: the wild's creatures come and go all game)
        for (const kind in AILING) {
            this.ailingAt.delete(`${id}:${kind}`);
        }
    }

    // One of the folk, looking as they do (Wenches and Ale's as they always have; anyone else as
    // their part and seed have them), a step at a time. Returns their avatar
    *#addingFolk(one) {
        const look = one.preset ? FOLK[one.preset] : folkLook(one);
        const character = yield* this.#built(this.battle.actor(one.id), { shape: look.shape, look: look.look, equipment: look.equipment, hairDetail: Math.min(this.view.quality.hair, FOLK_HAIR), merge: true });

        if (!character) {
            return this.avatars.get(one.id) ?? null;
        }

        const avatar = this.#addAvatar(one.id, character, { walk: look.walk, wounds: false });

        // (Weapons put away: adventurers about the guild)
        if (look.sheathed) {
            character.sheathe(true);
        }

        // (Lit, but casting no shadows: there are a lot of them, and it's dim in there)
        character.object.traverse((node) => {
            node.castShadow = false;
        });

        avatar.actions.setSeated(Boolean(one.routine.seated));

        // (Their face at rest: their part's, a smile for some)
        if (character.expressions) {
            character.expressions.mood = ROLES[one.role]?.mood ?? null;
        }

        return avatar;
    }

    #addAvatar(id, character, { wounds = true, ...options }) {
        return this.#register(id, new Avatar(character, options), { wounds });
    }

    // One of the wild's creatures, as its kind looks (the same one of its kind every time, from
    // its id; a dungeon's boss or mini-boss its own way: beasts/champions.js); holding its weapon,
    // if it's people-shaped (and wounded as people are): a step at a time (a people-shaped one's
    // character is built in steps)
    *#addingBeast(actor) {
        const seed = [...actor.id].reduce((hash, letter) => (Math.imul(hash, 31) + letter.charCodeAt(0)) | 0, 7) >>> 0;
        const weapon = WEAPONS[actor.weapon];
        const avatar = yield* dressingCreature(this.kit, actor.wild.creature, { seed, equipment: weapon?.equipment ?? [], guard: weapon ? guardOf(actor.weapon) : null, hairDetail: Math.min(this.view.quality.hair, FOLK_HAIR), champion: actor.wild.champion ?? null, regalia: actor.wild.regalia ?? null });

        // (Gone from the battle, or drawn some other way, while it was being built)
        if (this.avatars.has(actor.id) || !this.battle.actor(actor.id)) {
            avatar.character.dispose();

            return this.avatars.get(actor.id) ?? null;
        }

        avatar.character.sheathe(true);

        // (One people-shaped drawn with fewer triangles when small on the screen, as folk are: #built)
        if (!(avatar instanceof BeastAvatar) && this.kit.lods) {
            avatar.character.lowerDetail(this.kit.lods);
        }

        // (Its voice downloaded now it's near: audio/sound.js want)
        this.sound?.want(creatureSounds(actor.wild.creature));

        return this.#register(actor.id, avatar, { wounds: !(avatar instanceof BeastAvatar) });
    }

    // One of a convoy's wagons (core/host.js #meetConvoy), or an army's supply wagon (#meetWagon):
    // an ox in its shafts (beasts/looks.js ox), the wagon behind it in its people's timber, laden
    // with what its works yields or with supplies (art/kits/wagon.js), a step at a time (the ox's
    // body sculpted in steps the first time)
    *#addingWagon(actor) {
        const { load = null, people = "human", seed = 1 } = this.host.wagons.get(actor.id) ?? {};
        const avatar = yield* dressingCreature(this.kit, "ox", { seed });

        if (this.avatars.has(actor.id) || !this.battle.actor(actor.id)) {
            avatar.character.dispose();

            return this.avatars.get(actor.id) ?? null;
        }

        hitch(avatar, CREATURE_LOOKS.ox, { load, people, seed });

        return this.#register(actor.id, avatar, { wounds: false });
    }

    // An avatar drawn, its footsteps heard
    #register(id, avatar, { wounds }) {
        const character = avatar.character;

        // Footsteps, on whatever the foot lands on (audio/footing.js), as heavy as the one
        // stepping (a creature's size) and as its feet are (`gait`: a beast's paws, a serpent's
        // slither...); none off the ground (a creature in the air, someone Levitating)
        avatar.walker.onStep = (foot, speed) => {
            const actor = this.battle.actor(id);

            if ((avatar.flight?.amount ?? 0) > 0.5 || (actor && this.battle.buffOf(actor, "levitate"))) {
                return;
            }

            const mapId = actor?.map ?? "town";
            const [ox, oz] = this.originOf(mapId);
            const { x, z } = avatar.object.position;

            this.sound?.step(this.#footingAt(this.world.maps?.[mapId] ?? this.world, x - ox, z - oz), avatar.object.position, { speed, ...avatar.gait, armour: armourOf(avatar.character) });
        };
        character.object.name = id;
        this.view.scene.add(character.object);

        // (One of a crowd till now, drawn in full in its place)
        if (this.avatars.get(id) instanceof CrowdAvatar) {
            this.avatars.get(id).character.dispose();
        }

        this.avatars.set(id, avatar);

        if (wounds) {
            this.wounds.set(id, new Wounds(character, { seed: this.avatars.size * 17 + 3 }));
        }

        // (Its shaders compiled before it's first drawn, hidden till then (#update), so that a
        // kind of creature, or garment, not drawn before doesn't stall a frame compiling them)
        const ready = () => (avatar.compiling = false);

        avatar.compiling = true;
        this.view.prepare(character.object).then(ready, ready);

        return avatar;
    }

    /** Start playing: the battle and the drawing run, and taps and clicks are listened to. */
    start() {
        // (Listening again, after a pause that couldn't stop the world: pause)
        if (!this.listeners.length) {
            this.#listen();
        }

        // (Stopped while steered by held keys or the thumb stick, nothing held now: stopping)
        if (this.stopOnStart) {
            this.stopOnStart = false;
            this.#command({ type: "stop" });
        }

        if (this.running) {
            return;
        }

        this.running = true;
        this.lastFrame = performance.now();
        this.steppedAt = this.lastFrame;
        this.view.renderer.setAnimationLoop((now) => this.#frame(now));
        this.sound?.setAmbient(this.mapId === "town");
        this.sound?.setPlace(this.#soundOf(this.mapId));
        this.sound?.setPaused(false);
        this.#wantSpells();
        this.#wantItems();
    }

    // The sounds of the spells the player can cast downloaded now (audio/sound.js want), so
    // they're in before they're first cast; and a spell breaking off's, and a Scroll of Safety's
    #wantSpells() {
        const known = Object.keys(SPELLS).filter((id) => this.progress.knows?.(id));

        this.sound?.want(["fizzle", "spellCircle", "teleportOut", "teleportIn", "breath", ...known.flatMap((id) => Object.values(spellSounds(id)).filter(Boolean))]);
    }

    // The sounds of the player's things in their hands downloaded now (audio/sound.js want), after
    // what's heard first: picked up, put on, used, opened
    #wantItems() {
        this.sound?.want(ITEM_SOUNDS);
    }

    /** Stop: nothing moves until start() again. */
    stop() {
        this.running = false;
        this.view.renderer.setAnimationLoop(null);
        this.sound?.setPaused(true);
        this.#deafen();
    }

    /**
     * Pause (the menu open, or the world map): the world stops if it can (with no one else in it:
     * core/host.js pausable) and `world` isn't false (the war table's map, read as the war goes
     * on), else it goes on, and only the player's taps and clicks aren't listened to, until start()
     * again. Returns whether it stopped.
     */
    pause({ world = true } = {}) {
        if (world && this.host.pausable) {
            this.stop();

            return true;
        }

        this.#deafen();

        return false;
    }

    // No more listening to taps, clicks and keys (and whatever the fingers were doing, let go)
    #deafen() {
        for (const [target, type, listener, options] of this.listeners) {
            target.removeEventListener(type, listener, options);
        }

        this.listeners = [];

        for (const pointer of this.pointers.values()) {
            clearTimeout(pointer.hold);
            this.#letGo(pointer);
        }

        this.pointers.clear();
        this.pinch = null;
        this.wheel?.hide();

        // (Whatever was steering the player as their keys and thumb stop being listened to: if the
        // world goes on, they're stopped now; if it's stopped, as soon as it starts again; never left
        // walking on with nothing held to stop them)
        if (this.steering?.steering) {
            if (this.running) {
                this.#command({ type: "stop" });
            } else {
                this.stopOnStart = true;
            }
        }

        this.steering?.dispose();
        this.steering = null;
    }

    /** Take everything out of the scene (before building another game). */
    dispose() {
        this.stop();
        this.sound?.setAmbient(false);
        this.sound?.setAmbience({});
        this.sound?.setPlace("town");
        this.sound?.setHearth(null);
        this.hud.clear();

        for (const avatar of this.avatars.values()) {
            avatar.object.removeFromParent();
            avatar.character.dispose();
        }

        this.crowds?.dispose();

        for (const wounds of this.wounds.values()) {
            wounds.dispose();
        }

        // The town's merged meshes and the ground are this game's own (their materials, but for
        // the ground's, are shared by every game)
        this.town?.object.traverse((node) => node.geometry?.dispose());
        this.ground?.geometry.dispose();
        this.ground?.material.dispose();
        this.grass?.dispose();
        this.motes?.dispose();
        this.chunks?.dispose();
        this.far?.dispose();
        this.view.setFar(null);

        for (const thing of [this.volcano, this.silhouettes]) {
            if (thing) {
                this.view.setHorizon(thing, false);
                thing.dispose();
            }
        }

        this.view.setTimeOfDay(null);
        this.view.setLook(null);
        INTERIOR_GLOW.daylight.value = 1;
        this.effects?.dispose();
        this.contacts?.dispose();
        this.navBaker?.dispose();
        this.navigationView?.dispose();

        // (The navigation meshes of this world's maps, the WebAssembly's memory given back)
        for (const map of Object.values(this.world.maps ?? {})) {
            releaseNavigation(map);
        }

        this.navigationView?.object.removeFromParent();

        // The interiors' merged meshes (their materials are shared by every game)
        for (const interior of this.interiors.values()) {
            interior.object.traverse((node) => node.geometry?.dispose());
            interior.object.removeFromParent();
        }

        this.interiors.clear();
        this.doors?.dispose();
        this.banners?.dispose();
        this.camps?.dispose();
        this.forts3d?.dispose();
        this.carried?.dispose();
        this.globes?.dispose();
        this.pinMarks?.dispose();
        this.flyers?.dispose();

        this.spellFx?.dispose();

        for (const object of [this.ground, this.town?.object, this.chunks?.object, this.squares?.object]) {
            object?.removeFromParent();
        }

        this.minimap?.dispose();
        this.wheel?.element.remove();
        this.quickBar?.dispose();
        this.talk?.panel.remove();
        this.pack?.dispose();
        this.drops?.dispose();
        this.journal?.panel.remove();
        this.spellbook?.panel.remove();
        this.fate?.panel.remove();
        this.curtain?.remove();
        this.washing?.remove();
        this.view.setOccluders(null);
        this.view.setFocus(null);
        this.view.setIndoors(null);
    }

    /**
     * Draw at a quality level, and a share of its pixels (Adaptive: app/governor.js), and say so
     * (onAdapt).
     */
    adapt({ quality, scale }) {
        if (quality !== this.view.qualityName) {
            this.view.adaptiveScale = scale;
            this.view.setQuality(quality);
        } else {
            this.view.adapt(scale);
        }

        this.onAdapt?.({ quality, scale });
    }

    /** Show the minimap or not. */
    showMinimap(on) {
        this.minimapShown = on;
        this.minimap?.show(on);
    }

    /**
     * Show the thumb stick, or not (Game options). Taken away mid-push, whatever it was holding is
     * let go of, so the player doesn't walk on with nothing on screen left to stop them. W, A, S
     * and D steer either way.
     */
    showStick(on) {
        this.stickShown = on;

        if (!on) {
            this.steering?.release();
        }
    }

    /** Whether the thumb stick springs up under the thumb in the bottom left (Game options), or stays in its corner. */
    floatStick(on) {
        this.steering?.release();

        if (this.steering) {
            this.steering.floating = on;
        }
    }

    /**
     * Show the squares characters walk on, which are blocked, and everyone's path (debug mode):
     * out in the world, those round the player.
     */
    showSquares(on) {
        const player = this.battle.actor(this.me);
        const around = player ? [player.x, player.y] : null;

        if (on && (this.squares?.mapId !== this.mapId || (around && this.squares.strayed(around)))) {
            this.squares?.object.removeFromParent();
            this.squares?.object.traverse((node) => {
                node.geometry?.dispose();
                node.material?.uniforms?.blocked?.value.dispose();
                node.material?.dispose();
            });
            this.squares = new Squares(this.world.maps?.[this.mapId] ?? this.world, { around });
            this.view.scene.add(this.squares.object);
        }

        if (this.squares) {
            this.squares.object.visible = on;
        }
    }

    /**
     * Show the navigation meshes round the player or not (debug mode: core/navigation.js, drawn
     * by world/navview.js, tiles baked in a worker). Out in the world only; loaded the first time
     * it's shown.
     */
    showNavigation(on) {
        this.navigationShown = on;

        if (on && !this.navigationView && !this.navigationLoading) {
            this.navigationLoading = import("../world/navview.js")
                .then(({ NavView }) => {
                    const baker = this.#navBaker();

                    this.navigationView = new NavView(baker.navigation, baker);
                    this.view.scene.add(this.navigationView.object);
                    this.navigationAt = null;
                    this.#drawNavigation();
                })
                .catch((error) => console.warn("The navigation meshes couldn't be shown:", error));
        }

        this.#drawNavigation();
    }

    // The overworld's navigation mesh's baker (the battle's mesh: core/navigation.js navigatorOf)
    #navBaker() {
        this.navBaker ??= new NavBaker(navigatorOf(this.world.maps.town));

        return this.navBaker;
    }

    // The navigation tiles round each player in the world outside baked ahead, off the page's
    // thread (a tile sent off a frame), so the ways found near them (core/battle.js) don't wait
    // on one being baked. (Not in a copy of someone else's world: its battle takes the host's
    // ways, and finds none of its own.)
    #bakeAhead() {
        if (this.remote || !this.world.maps?.town?.chunkAt) {
            return;
        }

        const baker = this.#navBaker();

        this.bakedAround ??= new Map();

        for (const actor of this.battle.actors) {
            if (actor.kind !== "player" || actor.map !== "town" || actor.dead) {
                continue;
            }

            const at = this.bakedAround.get(actor.id);

            if (!at || Math.abs(actor.x - at[0]) > BAKE_AHEAD.again || Math.abs(actor.y - at[1]) > BAKE_AHEAD.again) {
                this.bakedAround.set(actor.id, [actor.x, actor.y]);
                baker.around(actor.x, actor.y, BAKE_AHEAD.reach);
            }
        }

        baker.pump();
    }

    // The navigation meshes round the player, if they're shown (afresh when they've gone a tile)
    #drawNavigation() {
        const view = this.navigationView;

        if (!view) {
            return;
        }

        const player = this.battle.actor(this.me);
        const on = Boolean(this.navigationShown && player && this.mapId === "town");

        view.object.visible = on;

        if (on && (!this.navigationAt || Math.abs(player.x - this.navigationAt[0]) > 8 || Math.abs(player.y - this.navigationAt[1]) > 8)) {
            this.navigationAt = [player.x, player.y];
            view.around(player.x, player.y);
        }
    }

    /**
     * Play on for `seconds` in frames of `frame` seconds without drawing them, then draw once
     * (unless not to `render`: for tests stepping through what happens, drawn only at the end,
     * and debugging on slow machines). Nothing done elsewhere (a worker's skins) can come back
     * while it plays on, so what would wait on it is done here then, unless it's to `wait` (for
     * a caller that lets the page's events in between, as frames do).
     */
    advance(seconds, { frame = 1 / 30, render = true, wait = false } = {}) {
        this.waits = wait;

        try {
            for (let time = 0; time < seconds; time += frame) {
                this.#tick(frame);
            }
        } finally {
            this.waits = true;
        }

        if (render) {
            this.view.render();
        }
    }

    // --- Each frame ---

    #frame(now) {
        // (No oftener than the quality level draws: a phone's 120 Hz screen drawn at 60)
        if (!this.pacing.due(now, this.view.quality.frameRate)) {
            return;
        }

        const frameStart = performance.now();
        const elapsed = Math.max(0, (now - this.lastFrame) / 1000);
        const dt = Math.min(0.1, elapsed);

        this.lastFrame = now;

        // (An error in the frame's work is reported, and the world still drawn, rather than the
        // picture freezing on it)
        let steps = 0;

        try {
            steps = this.#tick(dt, elapsed);
        } catch (error) {
            this.#fault(error);
        }

        if (this.remote || this.hosting || this.together) {
            this.#together(steps ? (this.steppedAt = now) : now);
        }

        const updated = performance.now();
        const mine = this.avatars.get(this.me);

        // (The pack open on the paperdoll: the player alone drawn, live, the world behind it still)
        if (this.pack?.showingDoll && mine) {
            this.view.renderPreview(this.pack.dollView, mine.object, { height: mine.character.height ?? 1.7, turn: this.dollTurn, clip: this.pack.body });
        } else {
            this.view.render();
        }

        const rendered = performance.now();

        // (Less drawn while it can't keep up, more again when it can, if that's left to it:
        // Adaptive, app/governor.js)
        if (this.view.adaptive) {
            const rung = this.governor.observe(now, elapsed * 1000);

            if (rung) {
                this.adapt(rung);
            }
        }

        // Timings for the debug overlay
        const smooth = (key, value) => (this.stats[key] += (value - this.stats[key]) * 0.1);

        smooth("frame", dt * 1000);
        smooth("update", updated - frameStart);
        smooth("render", rendered - updated);
        this.stats.steps = steps;

        if (steps) {
            this.#begin?.();
            this.#begin = null;
        }

        this.frameTimes[this.frameIndex] = dt * 1000;
        this.frameIndex = (this.frameIndex + 1) % this.frameTimes.length;
        this.frames++;

        if (now - this.fpsTime >= 500) {
            this.stats.fps = (this.frames * 1000) / (now - this.fpsTime);
            this.frames = 0;
            this.fpsTime = now;
        }
    }

    // Any projectile drawn in flight that the battle no longer has, landed (taken away)
    #landStrays() {
        const flying = new Set(this.battle.projectiles.map(({ id }) => id));

        for (const id of [...this.flights.keys()]) {
            if (!flying.has(id)) {
                this.effects.land(id);
                this.flights.delete(id);
            }
        }
    }

    // An error thrown in a frame's work: told in the console once (it may be thrown every frame)
    #fault(error) {
        const told = String(error?.stack ?? error);

        if (!this.faults.has(told)) {
            this.faults.add(told);
            console.error("A frame's work failed:", error);
        }
    }

    // Run the battle's steps for `dt` seconds, and move everyone to match. Returns the steps run
    #tick(dt, elapsed = dt) {
        // (Joined: the host's steps played a little slower or faster, to keep a few in hand; and
        // as fast as time goes by, however slowly the frames come (a second's worth at most a
        // frame), or the host would leave it behind)
        const played = this.remote ? Math.min(JOINED_FRAME, elapsed) : dt;

        this.accumulator += played * 1000 * (this.remote ? this.remote.pace(played * 1000) : 1);

        // (What was put off till now: a spark off the anvil at each blow)
        if (this.later.length && this.later[0].at <= this.clock) {
            const due = this.later.filter(({ at }) => at <= this.clock);

            this.later = this.later.filter(({ at }) => at > this.clock);

            for (const { then } of due) {
                then();
            }
        }

        let steps = 0;

        while (this.accumulator >= STEP_MS) {
            for (const actor of this.battle.actors) {
                const previous = this.previous.get(actor.id);

                if (previous) {
                    previous.x = actor.x;
                    previous.y = actor.y;
                }
            }

            for (const projectile of this.battle.projectiles) {
                const flight = this.flights.get(projectile.id);

                if (flight) {
                    flight.previous.set(projectile.x, projectile.y);
                }
            }

            // (Joined to another's world: its steps as the host played them, when they've come)
            const events = this.remote ? this.remote.step() : this.host.advance(STEP_MS);

            if (!events) {
                this.accumulator = Math.min(this.accumulator, STEP_MS);

                break;
            }

            this.#handle(events);
            this.accumulator -= STEP_MS;
            steps++;
        }

        // (Projectiles the battle let go of without a word, their shooter or target taken out of
        // it: out of the air too)
        if (steps && this.flights.size) {
            this.#landStrays();
        }

        // (Fallen behind the host: caught up, a little at a time)
        const catching = performance.now();

        for (let extra = 0; this.remote && this.remote.behind > this.remote.delay + PACE.behind && extra < PACE.catchUp && performance.now() - catching < PACE.catchUpMs; extra++) {
            const events = this.remote.step();

            if (!events) {
                break;
            }

            this.#handle(events);
            steps++;
        }

        // (Hosting: what's been done, to those who've joined, every so often)
        if (this.hosting && this.clock - this.flushedAt >= FLUSH_EVERY) {
            this.flushedAt = this.clock;
            this.hosting.flush();
        }

        // (Joined: how long a word takes to the host and back, now and then)
        if (this.remote && this.clock - this.pingedAt >= PING_EVERY) {
            this.pingedAt = this.clock;
            this.remote.ping();
        }

        this.#update(dt, this.accumulator / STEP_MS);

        return steps;
    }

    // Why nothing's happening, while playing together: this game's link dropped (it's coming back),
    // or the host's, the host's paused, or no step's come from it for a while (a joined game);
    // shown on the HUD while it lasts (written only when it changes)
    #together(now) {
        const remote = this.remote;
        let status = null;

        if (this.link === "lost") {
            status = remote ? TOGETHER.lost : TOGETHER.hosting;
        } else if (remote && this.link === "away") {
            status = TOGETHER.away;
        } else if (remote?.paused) {
            status = TOGETHER.paused;
        } else if (remote && now - this.steppedAt > WAITING_AFTER) {
            status = TOGETHER.waiting;
        }

        if (status !== this.together) {
            this.together = status;
            this.hud.status(status);
        }
    }

    #update(dt, alpha) {
        const { battle, view, hud } = this;
        const mine = battle.actor(this.me);
        const pixels = view.pixelsPerMetre();

        this.clock += dt;
        TREE_WIND.time.value = this.clock;

        // (The fortifications standing near the player drawn, a couple of times a second)
        if ((this.fortsClock -= dt) <= 0) {
            this.fortsClock = 0.5;
            this.#syncForts();
        }
        this.contacts?.begin();
        this.#marshal(dt);
        this.#crowding();
        this.#cheered();

        for (const actor of battle.actors) {
            const avatar = this.avatars.get(actor.id);
            const previous = this.previous.get(actor.id);
            const [ox, oz] = this.originOf(actor.map);

            // (Not drawn yet: one of a building's folk)
            if (!avatar) {
                continue;
            }

            // (Only those on the player's map are seen, and moved; and out in the world, only
            // those near them)
            if (actor.map !== this.mapId || (mine && actor !== mine && (Math.abs(actor.x - mine.x) > DRAW_REACH || Math.abs(actor.y - mine.y) > DRAW_REACH))) {
                avatar.object.visible = false;
                continue;
            }

            let x = previous.x + (actor.x - previous.x) * alpha;
            let z = previous.y + (actor.y - previous.y) * alpha;

            // (Joined: their own hero drawn going where they're sent before the host's heard)
            if (actor === mine && this.predict) {
                [x, z] = this.predict.at(actor, x, z, this.clock * 1000);
            }

            // (A fortification: only where it stands, on the ground there)
            if (actor.kind === "fort") {
                avatar.update(dt, ox + x, oz + z, actor.facing);
                avatar.object.position.y = this.#groundOn(actor.map, ox + x, oz + z);
                continue;
            }

            avatar.actions.setGuard(!actor.dead && actor.armed && this.#fighting(actor));

            // (An emote's over once they're off somewhere, or fighting)
            if (avatar.actions.emoting && (actor.dead || actor.path.length || actor.attack || actor.casting)) {
                avatar.actions.stopEmote();
            }

            avatar.every = this.#posing(actor, avatar, dt, pixels);
            this.#gazing(actor, avatar, mine);
            avatar.update(dt, ox + x, oz + z, actor.facing, !actor.attack);
            // (Where they're drawn, which trails where they are a little)
            this.#updateBody(actor, avatar, dt, this.#standsAt(actor.map, avatar.object.position.x - ox, avatar.object.position.z - oz));
            hud.setStamina(actor.id, actor.stamina, actor.maxStamina);

            // (Not shown till its shaders are ready: #register)
            if (avatar.compiling) {
                avatar.object.visible = false;
            }

            this.#grounded(actor, avatar);
            this.#calling(actor, avatar);
        }

        this.contacts?.end();
        this.crowds?.draw(view.camera);

        // Projectiles, between their last two steps, rising and falling on the way
        for (const projectile of battle.projectiles) {
            const flight = this.flights.get(projectile.id);

            if (flight) {
                const [ox, oz] = this.originOf(projectile.map);
                const x = ox + flight.previous.x + (projectile.x - flight.previous.x) * alpha;
                const z = oz + flight.previous.y + (projectile.y - flight.previous.y) * alpha;
                // (Towards its target as drawn; or, its target not drawn, straight on at the height it left at)
                const target = this.avatars.get(projectile.target);
                const left = target ? Math.hypot(target.object.position.x - x, target.object.position.z - z) : flight.distance;
                const along = flight.distance > 0 ? Math.min(1, Math.max(0, 1 - left / flight.distance)) : 1;
                // (Along the ground: following its rise and fall)
                const height = flight.ground
                    ? this.#groundOn(projectile.map, x, z) + flight.height
                    : !target
                      ? flight.height
                      : flight.height + (target.object.position.y + target.character.height * 0.72 - flight.height) * along;

                this.effects.fly(projectile.id, new THREE.Vector3(x, height + Math.sin(Math.PI * along) * flight.arc, z));
            }
        }

        // The wheel's spells and blows, greyed for as long as they're cooling down
        if (this.wheel?.open) {
            this.wheel.setCooldown(this.#cooldowns(this.wheel.slots));
        }

        // Spells being cast and landing (light gathering in the casters' hands...), and those
        // lasting on anyone here showing on them now and then
        this.spellFx.update(dt);
        // (The sky as dark as the greatest spells have made it)
        this.view.setOmen(this.spellFx.darkness());

        for (const actor of battle.actors) {
            const avatar = this.avatars.get(actor.id);

            for (const { kind } of actor.buffs ?? []) {
                if (avatar?.object.visible && kind !== "invisibility" && Math.random() < dt * LINGER) {
                    this.spellFx.linger(kind, avatar.point(0.5));
                }
            }
        }

        // Everything is heard from where the player is
        const me = this.avatars.get(this.me);

        this.sound?.setListener(me.object.position.x, me.object.position.z);
        this.#hearAround(dt);
        this.sound?.update(dt);
        this.#castsHeard();

        // The enemy the player is set to fight, ringed, with its bar lit
        const target = this.#target();
        const ringed = target ? this.avatars.get(target.id) : null;

        this.effects.setTarget(ringed?.object ?? null, ringed ? Math.max(0.5, ringed.character.height * 0.33) : 0.6);
        hud.setTarget(target?.id ?? null);
        this.#quickActions(target);
        this.#bleed(dt);
        this.#ailing();
        this.#grounds();
        this.ailments?.update(dt);
        this.#keepTalking();
        this.#keepShopping();
        this.#keepToPortal();
        this.#keepToTable();
        this.#restPlayer();
        this.effects.update(dt, view.pixelsPerMetre());
        this.#drawDrops();
        this.#spyCaches();
        this.#drawMinimap(target);

        if (this.squares?.object.visible) {
            this.showSquares(true);
            this.squares.update(battle);
        }

        if (this.navigationShown) {
            this.#drawNavigation();
        }

        this.#bakeAhead();

        // The time of day, out in the world and indoors
        if (this.chunks) {
            this.#daytime();
        }

        // The world round the player, drawn as they go (a chunk a frame at most)
        // (The Light spell's globes over whoever has one, on the map the player's on)
        this.#lightGlobes(dt);

        // (The world map's pin, the way there, and running there)
        this.#pinned();

        if (this.chunks && this.mapId === "town") {
            const { x, z } = this.avatars.get(this.me).object.position;

            // (The undergrowth as thick as the quality asks, grown again if that's changed; the
            // ground as finely drawn; the cliffs, if it draws them)
            this.chunks.setUndergrowth(this.view.quality.undergrowth);
            this.chunks.setSpacing(this.view.quality.ground);
            this.chunks.setCliffs(this.view.quality.cliffs);

            if (this.chunks.update(x, z)) {
                this.#hearTrees();
            }

            // (The tall grass following them, as tall as the quality draws it, ahead of them the
            // way the camera looks)
            this.grass?.setQuality(this.view.quality.grass);
            this.grass?.update(x, z, 2, this.#lookAlong());

            // (The chimneys' smoke, as much as the quality draws)
            SMOKE_SHARE.value = this.view.quality.smoke;

            // (The land's motes round them, as many as the quality has)
            if (this.motes) {
                const { camera, renderer } = this.view;

                this.motes.setQuality(this.view.quality.motes);
                this.motes.update(x, this.avatars.get(this.me).object.position.y, z, dt, this.chunks.overworld.biomeAt(Math.floor(x), Math.floor(z)), renderer.domElement.height / (2 * Math.tan((camera.fov * Math.PI) / 360)));
            }

            this.#farLand(x, z);
            this.#landLook(x, z, dt);
            this.#torchesCarried();
            this.#restCamps();
            this.#lightNear(x, z);
        }

        this.#visit(dt);
        this.#follow(dt);
        this.#inside(dt);

        // Bars over the soldiers who are enemies (or hurt), none over the rest
        const player = battle.actor(this.me);

        for (const actor of battle.actors) {
            if (actor.kind !== "soldier" || !this.avatars.has(actor.id) || !player) {
                continue;
            }

            const shown = hud.tracked.has(actor.id);
            const wanted = !actor.dead && (battle.hostile(actor, player) || actor.hp < actor.maxHp);

            if (wanted && !shown) {
                hud.track(actor.id, { ...actor, hostile: battle.hostile(actor, player) });
            } else if (!wanted && shown) {
                hud.untrack(actor.id);
            }
        }

        // Bars over the heads of the others on the player's map (those that have one), smaller
        // and fainter the farther they are from the player's character, gone where the player
        // can't see them (less far in the dark: hud.js PLATE_SIZE); the nearer the camera over
        // the farther
        const eye = view.camera.position;
        const own = this.avatars.get(this.me)?.object.position;
        const lit = this.mapId === battle.lightMap ? battle.light : null;

        for (const actor of battle.actors) {
            const avatar = this.avatars.get(actor.id);

            if (actor.id !== this.me && avatar && hud.tracked.has(actor.id)) {
                const head = avatar.point(1.08, _head);
                const depth = eye.distanceTo(head);
                const at = avatar.object.position;
                const scale = own ? plateScale(Math.hypot(at.x - own.x, at.z - own.z), sightAt(lit, actor.square)) : 1;

                hud.place(actor.id, actor.dead || actor.map !== this.mapId ? null : view.toScreen(head), { scale, depth });
            }
        }

        // Skin flushing red where hit, and tinged by what lingers on them (green with venom, a
        // sickly yellow, a curse's violet, fire's glow), pulsing
        const tinged = new Set([...this.flash.keys(), ...this.ailed, ...this.tinged]);

        this.tinged.clear();

        for (const id of tinged) {
            const avatar = this.avatars.get(id);

            if (!avatar) {
                this.flash.delete(id);
                continue;
            }

            const material = avatar.character.materials.body;
            const left = this.flash.get(id) ?? 0;
            const remaining = left - dt;
            const tint = this.#tintOf(battle.actor(id));

            material.emissive.setRGB(0.5, 0.04, 0.02).multiplyScalar(Math.max(0, remaining / 0.25));

            if (tint) {
                material.emissive.add(tint);
                this.tinged.add(id);
            }

            if (!this.flash.has(id)) {
                continue;
            }

            if (remaining <= 0) {
                this.flash.delete(id);
            } else {
                this.flash.set(id, remaining);
            }
        }
    }

    // Is a character fighting (so standing on guard)? Attacking lately, or an enemy close by
    #fighting(actor) {
        // (The folk never fight)
        if (actor.neutral) {
            return false;
        }

        if (actor.attack || this.battle.time - (this.lastAttack.get(actor.id) ?? -Infinity) < 2500) {
            return true;
        }

        const reach = longestReach(actor.weapon) + 2;

        // (The cheap checks first: how their peoples stand, and what's in the way, only for one near)
        return this.battle.actors.some((other) => !other.dead && other.map === actor.map && Math.hypot(other.x - actor.x, other.y - actor.y) <= reach && this.battle.hostile(other, actor) && this.battle.canSee(actor, other));
    }

    // How high the ground is where someone stands on a map (metres): a bridge's deck (over its
    // beams), or the ground (the world's: core/terrain/ground.js; flat at 0 indoors)
    #standsAt(mapId, x, y) {
        const map = this.world.maps?.[mapId];

        if (!map?.chunk) {
            return 0;
        }

        const [px, py] = [Math.min(map.width - 0.01, Math.max(0, x)), Math.min(map.height - 0.01, Math.max(0, y))];
        const ground = map.heightAt?.(px, py) ?? 0;

        return squaresOf(map).ground(Math.floor(px), Math.floor(py)) === GROUND.planks ? ground + DECK.top : ground;
    }

    // How often a character's body is posed (Avatar.every): the player's every frame, anyone
    // else's as often as how big it is on the screen and how fast it's moving need
    // (posingEvery), and how many of its triangles are drawn (lod.js). One out of view is posed
    // seldom, unless its shadow may be seen (a player's).
    // (A creature's posed every frame, but what's only for looking at, a cape blown about, only
    // in view: BeastAvatar.seen)
    #posing(actor, avatar, dt, pixels) {
        if (avatar instanceof BeastAvatar) {
            avatar.seen = this.view.heightOnScreen(avatar.object.position, avatar.character.height, pixels) > 0;
        }

        if (actor.id === this.me || !(avatar instanceof Avatar)) {
            return 1;
        }

        const { position } = avatar.object;
        const { height, mesh } = avatar.character;
        const tall = this.view.heightOnScreen(position, height, pixels, { anywhere: mesh.castShadow });

        // (And drawn with fewer triangles if it's small, or one of a crowd but not among the biggest
        // on the screen: Character.fitDetail)
        avatar.character.fitDetail(tall, this.crowded && !this.crowd.has(actor.id) ? 1 : 0);

        return posingEvery(tall, (avatar.motion * dt * tall) / height);
    }

    // Where someone's looking (characters/gaze.js): whoever they're fighting, or talking with; the
    // player passing near and in front of them, now and then (not staring: GAZE_NOTICE); else
    // ahead, glancing about
    #gazing(actor, avatar, mine) {
        const gaze = avatar.character?.gaze;

        if (!gaze) {
            return;
        }

        gaze.on = !actor.dead;

        const battle = this.battle;
        const fighting = actor.attack?.target ?? actor.target;
        const foe = fighting === null || fighting === undefined ? null : battle.actor(fighting);
        const talking = this.talking && (actor === mine ? battle.actor(this.talking.id) : actor.id === this.talking.id ? mine : null);
        const other = (foe && !foe.dead && foe.map === actor.map ? foe : null) ?? talking ?? (actor !== mine ? this.#noticing(actor, avatar, mine) : null);
        const seen = other && this.avatars.get(other.id);

        gaze.at(seen && !actor.dead ? seen.point(GAZE_EYES, _gazeAt) : null);
    }

    // The player, if they're near and in front of someone (not one fighting them), for a few
    // seconds at a time, then not for a while
    #noticing(actor, avatar, mine) {
        const notice = (avatar.notice ??= { until: 0, again: 0 });

        if (!mine || mine.dead || actor.map !== mine.map || Math.hypot(actor.x - mine.x, actor.y - mine.y) > GAZE_NOTICE.near) {
            return null;
        }

        const seen = this.avatars.get(mine.id);

        if (!seen || Math.abs(avatar.angleTo(seen.object.position.x, seen.object.position.z)) > (GAZE_NOTICE.round * Math.PI) / 180) {
            return null;
        }

        if (this.clock >= notice.until && this.clock >= notice.again) {
            const [low, high] = GAZE_NOTICE.look;
            const [rest, longer] = GAZE_NOTICE.rest;

            notice.until = this.clock + low + Math.random() * (high - low);
            notice.again = notice.until + rest + Math.random() * (longer - rest);
        }

        return this.clock < notice.until ? mine : null;
    }

    // Whether someone's drawn as themselves (not one of a crowd, nor waiting to be drawn)
    #drawnInFull(id) {
        const avatar = this.avatars.get(id);

        return Boolean(avatar) && !(avatar instanceof CrowdAvatar);
    }

    // The soldiers about drawn in full or in the crowds (world/crowd.js, MARSHAL): with a battle's
    // near the player (more than MARSHAL.from), those nearest (whoever's fighting the player
    // first) in full (QUALITY soldiers), the rest in their kind's crowd once its figure's made;
    // one waiting on its kind's figure not drawn meanwhile, nor built in full (but where it can't
    // be made). A couple of times a second
    #marshal(dt) {
        if ((this.marshalClock = (this.marshalClock ?? 0) - dt) > 0) {
            return;
        }

        this.marshalClock = MARSHAL.every;

        const me = this.battle.actor(this.me);
        const full = this.view.quality.soldiers?.full ?? Infinity;

        if (!me) {
            return;
        }

        const near = (actor) => actor.map === me.map && Math.abs(actor.x - me.x) <= DRAW_REACH && Math.abs(actor.y - me.y) <= DRAW_REACH;
        const soldiers = this.battle.actors.filter((actor) => actor.kind === "soldier" && !actor.dead && near(actor) && this.host.soldiers.has(actor.id));

        if ((soldiers.length <= MARSHAL.from || soldiers.length <= full) && !this.crowds?.members.size) {
            return;
        }

        this.crowds ??= new Crowd(this.view.scene, this.kit, { size: this.view.quality.soldiers?.picture ?? 256 });

        const fighting = (actor) => actor.target === me.id || actor.attack?.target === me.id || me.target === actor.id || me.attack?.target === actor.id;
        const ranked = soldiers.map((actor) => [Math.hypot(actor.x - me.x, actor.y - me.y) - (fighting(actor) ? DRAW_REACH : 0), actor]).sort((a, b) => a[0] - b[0]);

        ranked.forEach(([, actor], place) => {
            const avatar = this.avatars.get(actor.id);
            const crowded = avatar instanceof CrowdAvatar;

            if (place < full) {
                // (In full: built, the crowd's in its place till it is)
                if (crowded && !this.enlisting.includes(actor.id) && !this.enlistees.has(actor.id)) {
                    this.enlisting.push(actor.id);
                }

                return;
            }

            if (crowded || (avatar && place < full + MARSHAL.margin)) {
                return;
            }

            const { key, spec } = this.#crowdKind(actor);

            if (this.crowds.failed(key)) {
                return;
            }

            if (!this.crowds.template(key, spec)) {
                // (Waiting on its kind's figure: not built in full meanwhile)
                if (!avatar && !this.enlistees.has(actor.id)) {
                    this.#unenlist([actor.id]);
                    this.crowdWaiting.add(actor.id);
                }

                return;
            }

            this.#toCrowd(actor, key);
        });

        // (Those waiting on a figure that couldn't be made, built in full after all; those gone, forgotten)
        for (const id of this.crowdWaiting) {
            const actor = this.battle.actor(id);

            if (!actor || this.avatars.has(id)) {
                this.crowdWaiting.delete(id);
            } else if (this.crowds.failed(this.#crowdKind(actor).key) || !ranked.some(([, each], place) => each === actor && place >= full)) {
                this.crowdWaiting.delete(id);

                if (!this.enlisting.includes(id) && !this.enlistees.has(id)) {
                    this.enlisting.push(id);
                }
            }
        }
    }

    // A soldier's kind in the crowds: their people's, their sex's, carrying their weapon, and what
    // its figure's made from (world/crowd.js makingTemplate)
    #crowdKind(actor) {
        const { people = "human", sex = "m", weapon = actor.weapon } = this.host.soldiers.get(actor.id) ?? {};
        const key = `${people}:${sex}:${weapon}`;

        return {
            key,
            spec: { look: soldierLook({ people, weapon, sex, seed: 1 }), guard: guardOf(weapon), attack: weaponOf(weapon)?.attacks[0] ?? { animation: "sword", hitAt: 380, duration: 760 }, cast: CROWD_CASTS[weapon] ?? null },
        };
    }

    // A soldier drawn in its kind's crowd from now on: where it's drawn in full now, or where it is
    // (its character drawn in full let go)
    #toCrowd(actor, key) {
        const old = this.avatars.get(actor.id);
        const avatar = new CrowdAvatar(this.crowds, key, { height: old?.character.height });

        this.view.scene.add(avatar.object);

        if (old) {
            avatar.place(old.follow.x, old.follow.z, old.facing);
            avatar.object.position.y = old.object.position.y;
            Object.assign(avatar, { standing: old.standing, ground: old.ground });
            old.object.removeFromParent();
            old.character.dispose();
            this.wounds.get(actor.id)?.dispose();
            this.wounds.delete(actor.id);
            this.avatars.set(actor.id, avatar);
        } else {
            this.avatars.set(actor.id, avatar);
            this.#place(actor);
        }

        this.crowdWaiting.delete(actor.id);
        avatar.actions.setGuard(actor.armed);
    }

    // The crowd drawn in full: only so many of those in view can be (QUALITY crowd), the biggest on
    // the screen as the world was last drawn; the rest at most at the middle level (lod.js)
    #crowding() {
        const cap = this.view.quality.crowd ?? Infinity;
        const pixels = this.view.pixelsPerMetre();
        const seen = [];

        for (const [id, avatar] of this.avatars) {
            if (id !== this.me && avatar instanceof Avatar && avatar.object.visible && avatar.character) {
                const tall = this.view.heightOnScreen(avatar.object.position, avatar.character.height, pixels);

                if (tall > 0) {
                    seen.push([tall, id]);
                }
            }
        }

        this.crowded = seen.length > cap;
        this.crowd.clear();

        if (this.crowded) {
            seen.sort((a, b) => b[0] - a[0]);

            for (let k = 0; k < cap; k++) {
                this.crowd.add(seen[k][1]);
            }
        }
    }

    // Someone drawn, the ground darkened under them (contacts.js), less as they rise off it (by
    // magic), die, or are hardly seen; not a creature, which casts its own shadow
    #grounded(actor, avatar) {
        if (!(avatar instanceof Avatar) || !avatar.object.visible) {
            return;
        }

        const { x, z } = avatar.object.position;
        const tall = avatar.character.height;
        const risen = Math.exp(-(avatar.lift ?? 0) / (tall * 0.4));
        const dying = actor.dead ? Math.max(0, 1 - Math.max(0, (avatar.deadFor ?? 0) - (avatar.lands ?? 0)) / CONTACT_FADES) : 1;
        const seen = this.battle.buffOf(actor, "invisibility") ? 0.22 : 1;

        this.contacts.add(x, actor.dead ? (avatar.ground ?? 0) : (avatar.standing ?? 0), z, tall, risen * dying * seen);
    }

    // One of the wild's creatures' voice (sound.js CREATURE_VOICES): its kind, or null (not one of
    // the wild's, or a woman among the bandits and cultists, a woman's voice not recorded yet)
    #voiced(actor, avatar) {
        const creature = actor?.wild?.creature;

        return CREATURE_VOICES[creature] && (avatar?.character?.shape?.macro?.gender ?? 1) >= 0.5 ? creature : null;
    }

    // One of the wild's creatures calling (CALLS): as it sets on someone, and now and then as it
    // goes about its business, wherever it is (the sound's heard only so far: sound.js)
    #calling(actor, avatar) {
        const creature = !actor.dead && !avatar.compiling && this.#voiced(actor, avatar);

        if (!creature) {
            return;
        }

        const heard = (avatar.calls ??= { target: null, quiet: 0, next: this.clock + Math.random() * CALLS.idle[1] });
        const [soonest, latest] = CALLS.idle;

        if (actor.target && actor.target !== heard.target && this.clock >= heard.quiet) {
            this.sound?.voice(creature, "call", avatar.object.position);
            heard.quiet = this.clock + CALLS.again;
        } else if (!actor.target && this.clock >= heard.next && this.clock >= (this.called ?? 0) + CALLS.apart) {
            this.sound?.voice(creature, "call", avatar.object.position);
            heard.next = this.clock + soonest + Math.random() * (latest - soonest);
            this.called = this.clock;
        }

        heard.target = actor.target;
    }

    // A wyvern or a dragon up in the air (flyers3d.js): its wings heard beating as it beats them
    // hard, and now and then its call (CALLS); its voice downloaded as it comes
    #aloft(flier) {
        const voice = CREATURE_VOICES[flier.kind];

        if (!voice) {
            return;
        }

        const at = { x: flier.x, z: flier.z };
        const [soonest, latest] = CALLS.idle;

        if (!flier.heard) {
            flier.heard = { beat: 0, call: this.clock + soonest + Math.random() * (latest - soonest) };
            this.sound?.want(creatureSounds(flier.kind));
        }

        if (voice.wings && flier.beat > 0.6 && this.clock >= flier.heard.beat) {
            this.sound?.play(voice.wings, { at, rate: voice.rate ?? 1, far: CALLS.aloft });
            flier.heard.beat = this.clock + CALLS.wings / (voice.rate ?? 1);
        }

        if (this.clock >= flier.heard.call) {
            this.sound?.voice(flier.kind, "call", at);
            flier.heard.call = this.clock + soonest + Math.random() * (latest - soonest);
        }
    }

    // Standing on the ground (stepping up onto a bridge's deck, and down off it); or, dead, lying
    // still a while, then sinking out of sight until they come back to life
    #updateBody(actor, avatar, dt, ground = 0) {
        const object = avatar.object;

        // (A winged one coming down out of the sky, drawn gliding down to the ground: arrive)
        if (avatar.arriving) {
            avatar.ground = ground;
            avatar.standing = ground;

            return;
        }

        if (!actor.dead) {
            const lift = this.battle.buffOf(actor, "levitate") ? LIFT.height + Math.sin(this.clock * LIFT.bob) * LIFT.swing : 0;

            object.visible = true;
            // (Following the ground as it rises and falls; easing up and down a step, onto a
            // bridge's deck and off it)
            const step = ground - (avatar.standing ?? ground);

            avatar.standing = Math.abs(step) < STEP_EASE ? ground : avatar.standing + step * Math.min(1, dt * 12);
            avatar.ground = ground;
            avatar.lift = (avatar.lift ?? 0) + (lift - (avatar.lift ?? 0)) * Math.min(1, dt * 4);
            object.position.y = avatar.standing + avatar.lift;

            return;
        }

        avatar.deadFor = (avatar.deadFor ?? 0) + dt;

        const sinking = Math.max(0, avatar.deadFor - (avatar.lands ?? 0) - LIE_STILL) / SINK;

        avatar.ground = ground;
        object.position.y = ground - 0.5 * Math.min(1, sinking);
        object.visible = sinking < 1;
    }

    // The camera (camera.js): following the player from behind the way they're going, or where a
    // drag has turned it, leaning towards whoever they're fighting so both are in view
    // Which way the camera looks over the ground ([x, z], a unit; [0, 0] straight down)
    #lookAlong() {
        const { elements } = this.view.camera.matrixWorld;
        const [x, z] = [-elements[8], -elements[10]];
        const length = Math.hypot(x, z);

        return length > 1e-6 ? [x / length, z / length] : [0, 0];
    }

    #follow(dt) {
        const player = this.avatars.get(this.me);

        if (!player || !this.cameraFollow) {
            return;
        }

        const position = player.object.position;
        const foe = this.#kept();
        const chest = player.point(0.55);

        // (On its leash at how far it is now from where it looks, across the ground)
        const eye = this.view.camera.position;
        const away = Math.hypot(eye.x - this.view.focus.x, eye.z - this.view.focus.z);

        _focus.copy(position);

        if (foe) {
            const [ox, oz] = this.originOf(foe.map);
            const lean = _lean.set(ox + foe.x - position.x, 0, oz + foe.y - position.z).multiplyScalar(LEAN.share);

            _focus.add(lean.clampLength(0, Math.min(LEAN.most, LEAN.away * away)));
        }

        this.cameraFollow.follows = this.cameraSettings.follows;

        // (In a fight, whoever it is kept in view: within so much of the way from the middle of the
        // view to its side, as wide as the screen is)
        const [ox, oz] = foe ? this.originOf(foe.map) : [0, 0];
        const lens = this.view.camera;
        const across = 2 * Math.atan(Math.tan((lens.fov * Math.PI) / 360) * lens.aspect);
        const { focus, yaw, pitch } = this.cameraFollow.update(dt, {
            player: { x: position.x, z: position.z, vx: player.follow.vx, vz: player.follow.vz },
            aim: { x: _focus.x, z: _focus.z },
            lowest: this.view.lowestPitch(),
            away,
            keep: foe ? { x: ox + foe.x, z: oz + foe.y } : null,
            half: (across / 2) * FIGHT_VIEW.margin,
        });
        const seen = foe && this.avatars.get(foe.id);

        this.view.setFoe(seen ? seen.point(0.55) : null, seen ? seen.point(1).y - seen.object.position.y : undefined, seen ? Math.hypot(seen.object.position.x - position.x, seen.object.position.z - position.z) : 0);
        this.#threats();

        // (Level with the ground the player stands on, eased so steps and bumps don't jolt it, but
        // never lagging far under it, climbing)
        const ground = player.standing ?? this.#groundOn(this.battle.actor(this.me)?.map, position.x, position.z);
        const eased = dt && this.focusHeight !== undefined ? this.focusHeight + (ground - this.focusHeight) * Math.min(1, dt * FOCUS_EASE) : ground;

        this.focusHeight = Math.max(eased, ground - FOCUS_LAG);
        this.view.look(_focus.set(focus.x, this.focusHeight, focus.z), yaw, pitch, dt || Infinity);
        this.view.setFocus(chest);

        // (Seen too close, as near walls and buildings can push the camera, they're dithered away:
        // each of their materials made so once, put on or changed: nearfade.js)
        fadeNear(player.object);

        // (Shaken by the greater spells, dying away)
        if (this.shaking > 0.005) {
            const camera = this.view.camera;

            camera.position.x += (Math.random() - 0.5) * this.shaking;
            camera.position.y += (Math.random() - 0.5) * this.shaking * 0.6;
            camera.position.z += (Math.random() - 0.5) * this.shaking;
            this.shaking *= Math.exp(-SHAKE_DIES * dt);
        } else {
            this.shaking = 0;
        }
    }

    // The screen washed with a colour a moment (the greater spells): strongest at its edges
    #wash(colour, strength, seconds) {
        const [r, g, b] = [(colour >> 16) & 255, (colour >> 8) & 255, colour & 255];

        if (!this.washing?.animate) {
            return;
        }

        this.washing.style.background = `radial-gradient(ellipse at 50% 55%, rgba(${r},${g},${b},${strength * 0.45}) 0%, rgba(${r},${g},${b},${strength}) 100%)`;
        this.washing.animate([{ opacity: 1 }, { opacity: 0 }], { duration: seconds * 1000, easing: "ease-in" });
    }

    // The minimap: everyone on it, where the player is going and what the camera sees
    #drawMinimap(target) {
        const minimap = this.minimap;

        if (!minimap?.due()) {
            return;
        }

        const { battle, view } = this;
        const actor = battle.actor(this.me);
        const me = this.avatars.get(this.me);
        const [ox, oz] = this.originOf(this.mapId);
        // (The way the camera looks over the ground; looking straight down, the way they face)
        const looking = view.camera.getWorldDirection(_looking);
        const look = Math.hypot(looking.x, looking.z) > 1e-3 ? Math.atan2(looking.x, looking.z) : me.facing;

        if (minimap.map.id !== this.mapId) {
            minimap.setMap(this.world.maps[this.mapId]);
        }

        minimap.draw({
            player: actor.dead ? null : { x: me.object.position.x - ox, z: me.object.position.z - oz, facing: me.facing },
            others: battle.actors.filter((other) => other !== actor && !other.dead && other.map === this.mapId && this.avatars.has(other.id)).map((other) => {
                const position = this.avatars.get(other.id).object.position;

                return { x: position.x - ox, z: position.z - oz, hostile: this.battle.hostile(other, actor), targeted: other === target };
            }),
            destination: actor.order?.type === "move" ? [actor.order.to[0] + 0.5, actor.order.to[1] + 0.5] : null,
            look: actor.dead ? null : look,
            icons: this.mapId === "town" ? [...this.icons(), ...this.placeIcons(), ...this.dungeonIcons(), ...this.worksIcons(), ...this.fortIcons(), ...this.cacheIcons()] : [],
        });
    }

    // An adventurers' cache come within sight of the player for the first time (CACHE_SEEN): said,
    // and marked on their maps from then on
    #spyCaches() {
        const me = this.battle.actor(this.me);

        if (!me || me.dead || me.map !== "town" || !this.host?.caches?.size) {
            return;
        }

        for (const cache of this.host.caches.values()) {
            if (!this.cachesSeen.has(cache.id) && !cache.opened && Math.hypot(me.x - cache.at[0], me.y - cache.at[1]) <= CACHE_SEEN) {
                this.cachesSeen.add(cache.id);
                this.hud.message(`An adventurer's cache, and ${CACHE_BANDS[cache.band]?.name ?? "brigands"} keeping it. Put them all down to open it.`, 4);
            }
        }
    }

    /**
     * Each people's works (docs/WAR.md *The works*), as icons for the maps: [{ id, kind (mill,
     * mine or quarry: app/mapicons.js), x, z (metres: its heart once it's set down, its plan's
     * spot till then), rim (by who holds it and how they stand with the player's people:
     * WORKS_RIMS) }].
     */
    worksIcons() {
        const war = this.host?.war;

        if (!war?.works) {
            return [];
        }

        const mine = this.self?.realm;
        const sites = this.world.maps.town?.sites;

        return war.works.map((works) => {
            const [x, z] = sites?.set.get(works.id)?.heart ?? works.at;
            const stance = works.held ? "held" : mine && war.friendly(mine, works.owner) ? "own" : mine && war.hostile(mine, works.owner) ? "enemy" : "other";

            return { id: works.id, kind: WORKS_ICONS[works.kind], x, z, rim: WORKS_RIMS[stance] };
        });
    }

    /**
     * Each people's fortifications standing (docs/WAR.md *Fortifications*), as icons for the maps:
     * [{ id, kind (guardTower or garrison: app/mapicons.js), x, z (metres), rim (by how its
     * people stand with the player's: WORKS_RIMS), own (its people the player's or an ally's: known
     * to them wherever it stands) }].
     */
    fortIcons() {
        const war = this.host?.war;

        if (!war?.forts) {
            return [];
        }

        const mine = this.self?.realm;

        return war.forts.map((fort) => {
            const stance = mine && war.friendly(mine, fort.realm) ? "own" : mine && war.hostile(mine, fort.realm) ? "enemy" : "other";

            return { id: fort.id, kind: FORT_ICONS[fort.kind], x: fort.at[0], z: fort.at[1], rim: WORKS_RIMS[stance], own: stance === "own" };
        });
    }

    // A works won near the player, or by their people (host.js #worksFell): said
    #worksWon({ works: id, how, by, owner }) {
        const works = this.host?.war?.workAt(id);
        const me = this.battle.actor(this.me);
        const ours = by === this.self?.realm;

        if (!works || (!ours && (!me || me.map !== "town" || Math.hypot(me.x - works.at[0], me.y - works.at[1]) > WORKS_OUT.far))) {
            return;
        }

        const name = `the ${works.name} ${works.kind}`;

        if (how === "seized") {
            this.hud.message(ours ? `${name[0].toUpperCase()}${name.slice(1)} is ours: the ${peopleOf(by)} hold it now.` : `The ${peopleOf(by)} have seized ${name}.`, 4);
        } else {
            const whose = peopleOf(owner).endsWith("s") ? `${peopleOf(owner)}'` : `${peopleOf(owner)}'s`;

            this.hud.message(`${name[0].toUpperCase()}${name.slice(1)} is cleared of its brigands, and the ${whose} again.`, 4);
        }

        this.sound?.play("wake");
    }

    // A barracks cleared, its captain and guardsmen put down (docs/WAR.md M16): told to the player
    // if it was their people's doing, or they're in it: the town theirs now, or why it isn't
    #barracksCleared({ town: id, by, how, people }) {
        const town = this.host?.war?.town(id);
        const me = this.battle.actor(this.me);
        const inside = me && this.host?.quartered.get(id)?.map === me.map;

        if (!town || (by !== this.self?.realm && !inside)) {
            return;
        }

        const stage = STAGES[this.host.war.stage];
        const said = {
            taken: `${town.name} is taken! The last of its garrison put to the sword, the ${peopleOf(by)} hold it now.`,
            garrison: `${town.name}'s barracks is cleared. The town's the ${peopleOf(by)}' once the rest of its garrison is put down too.`,
            leaders: `${town.name}'s barracks is cleared, and the last of its garrison with it. Now its ruler and the captain of its guard, at its keep.`,
            peace: `${town.name}'s barracks is cleared, but the ${peopleOf(by)} aren't at war with the ${peopleOf(people)}: it isn't theirs to take.`,
            age: `${town.name}'s barracks is cleared, but no ${town.kind} is taken in ${stage.name.replace(/^An? /, "the ").toLowerCase()}. Its garrison will be back.`,
        }[how];

        if (said) {
            this.hud.message(said, 5);
            this.sound?.play("wake");
        }
    }

    // A seat's ruler and the captain of its guard out at its keep, its garrison put down: drawn; the
    // player told, if it's their people's seat, or their people's who put its garrison down (not in
    // its barracks: that's said there)
    #lastStand({ town: id, people, by, ruler, title, ids }) {
        const town = this.host?.war?.town(id);
        const me = this.battle.actor(this.me);

        this.enlisting.push(...ids);

        if (!town || ![people, by].includes(this.self?.realm) || this.host?.quartered.get(id)?.map === me?.map) {
            return;
        }

        this.hud.message(people === this.self?.realm ? `${town.name}'s garrison is down! ${title} ${ruler} and the captain of the guard make their last stand at the keep.` : `${town.name}'s garrison is down. ${title} ${ruler} and the captain of the guard make their last stand at its keep: put them down, and it's ours.`, 5);
        this.sound?.play("newsHeard");
    }

    // A town taken by the player's people, the last of its garrison put down near them (not in its
    // barracks: that's said there): the player told
    #townTaken({ town: id, by, people }) {
        const town = this.host?.war?.town(id);
        const me = this.battle.actor(this.me);

        if (!town || by !== this.self?.realm || this.host?.quartered.get(id)?.map === me?.map) {
            return;
        }

        // (A seat: given back to its people, to rule from under their conquerors)
        const seat = town.owner === people && this.host.war.realm(people)?.seat === id;

        this.hud.message(seat ? `${town.name} has fallen! Its ruler and the captain of its guard put to the sword, the ${peopleOf(people)} serve the ${peopleOf(by)} now.` : `${town.name} is taken! The last of its garrison put to the sword, the ${peopleOf(by)} hold it now.`, 5);
        this.sound?.play("wake");
    }

    /**
     * The adventurers' caches out in the world the player's seen (core/caches.js), as icons for the
     * maps: [{ id, kind ("cache"), x, z (metres), rim (grey once it's opened) }]; gone with it.
     */
    cacheIcons() {
        const caches = this.host?.caches;

        if (!caches?.size || !this.cachesSeen.size) {
            return [];
        }

        return [...caches.values()].filter(({ id }) => this.cachesSeen.has(id)).map(({ id, at: [x, z], opened }) => ({ id, kind: "cache", x, z, rim: opened ? PLACE_RIMS.cleared : null }));
    }

    /**
     * The icons over the buildings the player has gone into ([{ kind, x, z }]: metres, on the
     * world outside), for the maps.
     */
    icons() {
        const { explored, landmarks } = this;

        if (landmarks.version !== explored.version) {
            const buildings = this.world.interiors?.buildings;

            landmarks.icons = [...explored.entered].map((key) => buildings?.get(key)).filter((building) => building?.at).map(({ kind, at }) => ({ kind, x: at[0], z: at[1] }));
            landmarks.version = explored.version;
        }

        return landmarks.icons;
    }

    /**
     * The places worth finding out in the world (core/places.js; the terrain plan's M7.5), as icons
     * for the maps: [{ id, kind (its icon: app/mapicons.js), x, z (metres: its heart once it's set
     * down, sites.js, or where a camp's pitched; its plan's spot till then), holder (who holds it
     * now), rim (its colour) }].
     */
    // A place's occupiers put to the sword (host.js #placeFell): said, if the player's near it or
    // within it (a cave, the crypt under the ruins, an abbey's temple: its floors)
    #cleared({ place: id, holder }) {
        const place = placesOf(this.world.plan).find((each) => each.id === id);
        const me = this.battle.actor(this.me);
        const within = me && this.world.interiors?.buildings.get(`site:${id}`)?.maps.includes(me.map);

        if (!place || !me || (!within && (me.map !== "town" || Math.hypot(me.x - place.at[0], me.y - place.at[1]) > PLACE_BANDS.far))) {
            return;
        }

        const name = place.name ?? `the ${place.kind}`;

        this.hud.message(holder === "dead" ? `The dead of ${name} are laid to rest, for now.` : `${name[0].toUpperCase()}${name.slice(1)} is cleared of its outlaws, for now.`, 4);
        this.sound?.play("wake");
    }

    // A dungeon's boss slain, or its hoard opened (host.js #delveFell, #openDungeonChest): said to
    // whoever's in it; its icon greyed once it's cleared, and made again (#remakeDungeon) back as
    // it was, nothing said
    #delved({ site, change, name, boss = null }) {
        const me = this.battle.actor(this.me);
        const within = me && this.world.interiors?.buildings.get(`site:${site}`)?.maps.includes(me.map);
        const called = name ? `${name[0].toUpperCase()}${name.slice(1)}` : "The dungeon";

        if (!within) {
            return;
        }

        if (change === "boss") {
            this.hud.message(`${boss ? `${boss[0].toUpperCase()}${boss.slice(1)} is` : "Its master is"} slain, and the hoard it kept lies unlocked.`, 4);
            this.sound?.play("wake");
        } else if (change === "cleared") {
            this.hud.message(`${called} is cleared. Something new will stir in it once everyone's left.`, 4);
        }
    }

    /**
     * The dungeons out in the world (core/worldplan/settle.js: their ways in), as icons for the
     * maps: [{ id, kind ("dungeon"), x, z (metres: where its way in stands once it's set down, its
     * plan's spot till then), rim (grey while it's cleared, till it's made again) }].
     */
    dungeonIcons() {
        const plan = this.world.plan;
        const sites = this.world.maps.town?.sites;

        if (!plan?.sites) {
            return [];
        }

        const known = (this.dungeonMarks ??= { placed: -1, icons: [] });

        if (known.placed !== (sites?.set.size ?? 0)) {
            known.icons = plan.sites.filter(({ kind }) => kind === "dungeon").map((site) => {
                const [x, z] = sites ? sites.placedAt(site) : site.at;

                return { id: site.id, kind: "dungeon", x, z, rim: null };
            });
            known.placed = sites?.set.size ?? 0;
        }

        for (const icon of known.icons) {
            icon.rim = this.host?.dungeons?.get(icon.id)?.cleared ? PLACE_RIMS.cleared : null;
        }

        return known.icons;
    }

    placeIcons() {
        const plan = this.world.plan;
        const war = this.host?.war;

        if (!plan?.sites || !war) {
            return [];
        }

        const overworld = this.world.maps.town;
        const sites = overworld?.sites;
        const key = `${war.turn}:${sites?.set.size ?? 0}:${overworld?.campSpots?.size ?? 0}:${JSON.stringify(war.places)}`;
        const known = (this.placeMarks ??= { key: null, icons: [], sites: new Map(plan.sites.map((site) => [site.id, site])), camps: new Map(plan.camps.map((camp) => [camp.id, camp])) });

        if (known.key !== key) {
            known.icons = placesOf(plan).map((place) => {
                const site = known.sites.get(place.id);
                const camp = known.camps.get(place.id);
                // (Where it stands once it's set down, or pitched; its plan's spot till then)
                const [x, z] = site && sites ? sites.placedAt(site) : camp && overworld?.campPlacedAt ? overworld.campPlacedAt(camp) : place.at;
                const holder = holderOf(plan, place, war.places[place.id], war.turn);

                return { id: place.id, kind: place.icon, x, z, holder, rim: holder ? PLACE_RIMS[holder] : null };
            });
            known.key = key;
        }

        return known.icons;
    }

    /**
     * What the world map shows (app/worldmap.js): where the player is ({ x, z, facing }, metres
     * and radians, on the world outside: inside, at the building's door) and the icons: the
     * buildings gone into, the places worth finding near where they've been (within a chunk), and
     * the fortifications there, and their own people's and their allies' wherever they stand.
     */
    worldMapView() {
        const actor = this.battle.actor(this.me);
        const outside = this.#outside(actor);
        const facing = this.avatars.get(this.me)?.facing ?? actor.facing;
        const seen = ({ x, z }) => [-1, 0, 1].some((dz) => [-1, 0, 1].some((dx) => this.explored.visitedAt(x + dx * CHUNK, z + dz * CHUNK)));

        return { player: { x: outside[0], z: outside[1], facing }, icons: [...this.icons(), ...this.placeIcons().filter(seen), ...this.dungeonIcons().filter(seen), ...this.worksIcons().filter(seen), ...this.fortIcons().filter((icon) => icon.own || seen(icon)), ...this.cacheIcons()], marks: this.requestMarks(), ...this.pinView() };
    }

    // --- The world map's pin ---

    /**
     * Where the player's pinned on the world map, and the way there from where they are, across
     * the world (for the map: { pin: { x, z } or null, way: [[x, z], ...] or null, none if there's
     * none to be found }).
     */
    pinView() {
        const player = this.battle.actor(this.me);

        if (this.pin && !this.pinLine && player) {
            this.#wayToPin(this.#outside(player));
        }

        return { pin: this.pin ? { x: this.pin[0], z: this.pin[1] } : null, way: this.pin ? this.pinLine : null };
    }

    /**
     * Drop the pin at a point on the world map ([x, z] metres; one pin: it's moved), and keep it:
     * only somewhere the player's been (not under the map's fog: the pin's left as it was).
     */
    setPin([x, z]) {
        if (!this.explored?.visitedAt(x, z)) {
            return this.pinView();
        }

        this.pin = [x, z];
        this.pinWay = null;
        this.pinLine = null;
        this.pinFrom = null;
        this.onPin([...this.pin]);
        this.sound?.play("pinSet");

        return this.pinView();
    }

    /** Take the pin away (the column and the ways go with it). */
    clearPin() {
        this.pin = null;
        this.pinWay = null;
        this.pinLine = null;
        this.pinShown = null;
        this.pinMarks?.setPin(null);
        this.onPin(null);
        this.sound?.play("tap");
    }

    /**
     * Run to a point on the world map ([x, z] metres: a double tap on it), the way across the
     * world, a leg at a time (app/journey.js): { ok }, or { ok: false, reason } ("indoors", or
     * "nopath" if there's no way there) and nothing's done.
     */
    journeyTo([x, z]) {
        const player = this.battle.actor(this.me);

        if (!player || player.dead) {
            return { ok: false, reason: "dead" };
        }

        if (player.map !== "town" || !this.world.plan) {
            return { ok: false, reason: "indoors" };
        }

        const way = wayAcross(this.world.plan, [player.x, player.y], [x, z]);

        if (!way) {
            return { ok: false, reason: "nopath" };
        }

        this.#endTalk();
        this.approaching = null;
        this.journey = new Journey(this.world.plan, way);

        return { ok: true };
    }

    // Where someone is on the world outside ([x, y] metres): inside, at the building's door
    #outside(actor) {
        const building = this.world.interiors?.of(actor.map);

        return actor.map === "town" ? [actor.x, actor.y] : (building?.at ?? building?.door?.ends[0].arrive ?? [actor.x, actor.y]);
    }

    // The world map's pin: its column where it stands, and the way there along the ground, found
    // again as the player moves (a few times a second at most, and only once they've moved); and
    // running there a leg at a time, if they've set off, told if they're stopped short
    #pinned() {
        const player = this.battle.actor(this.me);

        if (this.journey && player) {
            const command = this.journey.step(player, this.clock);

            if (command) {
                this.journeying = true;

                try {
                    this.#command(command);
                } finally {
                    this.journeying = false;
                }
            } else if (this.journey.ended) {
                if (this.journey.ended === "blocked") {
                    this.hud.message("The way there's blocked: you stop.", 3);
                }

                this.journey = null;
            }
        }

        if (!this.pinMarks) {
            return;
        }

        this.pinMarks.update(this.clock, this.view.far.camera.far);

        const shown = this.pin && player && this.mapId === "town" && this.world.plan ? this.pin : null;

        if (shown !== this.pinShown) {
            const ground = this.groundOf("town");

            this.pinShown = shown;
            this.pinMarks.setPin(shown && { x: shown[0], y: ground ? ground(shown[0], shown[1]) : 0, z: shown[1] });
            this.pinFrom = null;
        }

        if (!shown) {
            return;
        }

        const at = [player.x, player.y];
        const moved = !this.pinFrom || Math.hypot(at[0] - this.pinFrom[0], at[1] - this.pinFrom[1]) >= PIN_WAY.moved;
        const since = this.clock - (this.pinAt ?? -Infinity);

        if ((moved && since >= PIN_WAY.every) || (this.pinShort && since >= PIN_WAY.short)) {
            this.#wayToPin(at, { drawn: true });
        }
    }

    // The way to the pin from a point ([x, y] metres): across the world (found again once they've
    // strayed from it), the near part of it over the navigation mesh's tiles there already (none
    // baked for it), as a line for the world map and, `drawn`, along the ground: only the part over
    // the mesh, a way that can be walked, round whatever stands in it (the rest, across the world's
    // cells, is only good enough for the map)
    #wayToPin(at, { drawn = false } = {}) {
        const plan = this.world.plan;

        this.pinFrom = [...at];
        this.pinAt = this.clock;

        if (!plan) {
            return;
        }

        if (!this.pinWay || (nearestAlong(this.pinWay, at).off > PIN_WAY.astray && this.clock - (this.pinWayAt ?? -Infinity) >= PIN_WAY.again)) {
            this.pinWay = wayAcross(plan, at, this.pin) ?? false;
            this.pinWayAt = this.clock;
        }

        if (!this.pinWay) {
            this.pinLine = null;
            this.pinMarks?.setLine(null);

            return;
        }

        // (From where they are on: the near part over the mesh, as far along as it can be found
        // there, to the point on the mesh nearest the way across the world there)
        const rest = wayFrom(this.pinWay, nearestAlong(this.pinWay, at).along);
        const navigation = this.world.maps?.town?.chunkAt ? navigatorOf(this.world.maps.town) : null;
        let near = null;

        for (const reach of navigation ? PIN_WAY.near : []) {
            const join = navigation.nearestIn(pointAlong(rest, reach), PIN_WAY.snap);
            const found = join ? navigation.wayIn(at, join) : [];

            if (found.length > 1 && Math.hypot(found.at(-1)[0] - join[0], found.at(-1)[1] - join[1]) < 1) {
                near = { way: [[...at], ...found.slice(1).map(([x, y]) => [x, y])], reach };
                break;
            }
        }

        // (Short of the furthest wanted, short of the pin: found again soon, as the tiles come in)
        this.pinShort = !near || (near.reach < PIN_WAY.near[0] && lengthOf(rest) > near.reach + 1);
        this.pinLine = near ? [...near.way, ...wayFrom(rest, near.reach).slice(1)] : [[...at], ...rest];

        if (drawn) {
            this.pinMarks?.setLine(near ? this.#alongGround(near.way) : null);
        }
    }

    // A way's points ([x, y] metres) along the ground, every WAY_LINE.step metres for as far as
    // WAY_LINE.reach: [x, height, z]
    #alongGround(way) {
        const ground = this.groundOf("town");
        const points = [];

        for (let d = 0; d <= WAY_LINE.reach; d += WAY_LINE.step) {
            const [x, z] = pointAlong(way, d);

            points.push([x, ground ? ground(x, z) : 0, z]);

            if (Math.hypot(x - way.at(-1)[0], z - way.at(-1)[1]) < WAY_LINE.step / 2) {
                break;
            }
        }

        return points;
    }

    /** Where the requests the player carries take them (for the world map): [{ x, z, label }]. */
    requestMarks() {
        const war = this.host.war;

        return this.standing.requests
            .map((request) => ({ request, where: whereTo(request, war) }))
            .filter(({ where }) => where.at)
            .map(({ request, where }) => ({ x: where.at[0], z: where.at[1], label: request.title }));
    }

    // The player's found more of the world: keep it
    #explored() {
        this.onExplore(this.explored);
    }

    // Who the player was told to fight (and is still alive), or null
    #target() {
        const player = this.battle.actor(this.me);
        const order = player && !player.dead ? player.order : null;
        const target = order?.type === "engage" ? this.battle.actor(order.target) : null;

        return target && !target.dead && target.map === player.map ? target : null;
    }

    // Who the player is fighting: who they were told to fight, or the nearest enemy after them
    // Those attacking the player out of view: an arrow at the screen's edge for each, pointing the
    // way to them across the ground (in front, up; behind, down), the nearest THREATS.most (the
    // camera study, recommendation 6)
    #threats() {
        const player = this.battle.actor(this.me);
        const arrows = [];

        if (player && !player.dead) {
            const view = this.view;
            const rect = view.rect ?? view.canvas.getBoundingClientRect();
            const near = (actor) => Math.hypot(actor.x - player.x, actor.y - player.y);
            const after = this.battle.actors
                .filter((actor) => !actor.dead && actor.map === player.map && (actor.target === player.id || actor.attack?.target === player.id) && this.battle.hostile(actor, player) && this.avatars.has(actor.id))
                .sort((a, b) => near(a) - near(b))
                .slice(0, THREATS.most);

            for (const actor of after) {
                const at = this.avatars.get(actor.id).point(0.5);
                const spot = view.toScreen(at);

                if (spot && spot.x > rect.left && spot.x < rect.right && spot.y > rect.top && spot.y < rect.bottom) {
                    continue;
                }

                // (Which way, against the way the camera looks across the ground)
                const [dx, dz] = [at.x - view.camera.position.x, at.z - view.camera.position.z];
                const [fx, fz] = [-Math.sin(view.yaw), -Math.cos(view.yaw)];
                const angle = Math.atan2(dx * -fz + dz * fx, dx * fx + dz * fz);
                const [ux, uy] = [Math.sin(angle), -Math.cos(angle)];
                const [halfX, halfY] = [rect.width / 2 - THREATS.inset, rect.height / 2 - (uy > 0 ? THREATS.bottom : THREATS.inset)];
                const reach = Math.min(Math.abs(ux) > 1e-6 ? halfX / Math.abs(ux) : Infinity, Math.abs(uy) > 1e-6 ? halfY / Math.abs(uy) : Infinity);

                arrows.push({ x: rect.left + rect.width / 2 + ux * reach, y: rect.top + rect.height / 2 + uy * reach, angle });
            }
        }

        this.hud.threats(arrows);
    }

    // Whoever the camera keeps in view in a fight: who the player's fighting (#foe), or who they
    // were, for a moment after (FIGHT_VIEW.hold: a lull, a blow from another), while they're on
    // the same map and standing
    #kept() {
        const foe = this.#foe();
        const player = this.battle.actor(this.me);

        if (foe) {
            this.fightView = { id: foe.id, until: this.clock + FIGHT_VIEW.hold };

            return foe;
        }

        const was = this.fightView && this.clock < this.fightView.until ? this.battle.actor(this.fightView.id) : null;

        return was && !was.dead && player && was.map === player.map ? was : null;
    }

    #foe() {
        const battle = this.battle;
        const player = battle.actor(this.me);

        if (!player || player.dead) {
            return null;
        }

        const ordered = player.order?.type === "engage" ? battle.actor(player.order.target) : null;

        if (ordered && !ordered.dead && ordered.map === player.map) {
            return ordered;
        }

        const after = battle.actors.filter((actor) => this.battle.hostile(actor, player) && !actor.dead && actor.map === player.map && (actor.target === player.id || actor.attack?.target === player.id || player.attack?.target === actor.id));

        return after.sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y))[0] ?? null;
    }

    // --- Talking ---

    // Go and talk to one of the folk: at once if they're next to the player, or once the player's
    // walked up to them
    #talkTo(npc, { run = false } = {}) {
        const player = this.battle.actor(this.me);

        if (!player || player.dead || this.talking?.id === npc.id) {
            return;
        }

        this.#endTalk();
        this.#tradeOver(npc);

        if (this.battle.canTalk(player, npc)) {
            this.approaching = null;
            this.#command({ type: "stop" });
            this.#openTalk(npc);

            return;
        }

        this.approaching = npc.id;
        this.#command({ type: "approach", target: npc.id, run });
    }

    // Trading with someone else than `npc`, the player off to talk to them: the trade's done, and
    // the one they were trading with let go
    #tradeOver(npc) {
        if (this.shopping && this.shopping.keeper !== npc?.id) {
            this.closePack();
        }
    }

    // Start talking to one of the folk: they stop and face the player, and the talk shows
    #openTalk(npc) {
        // Where they are, and the folk there they might talk of (by their part: the barkeep, the
        // madam...), and what's upstairs
        const building = npc ? this.world.interiors?.of(npc.map) : null;
        const folk = building?.folk ?? this.world.folk ?? [];

        // (Their talk: their role's, or another's: an adventurer drinking at a guild's table)
        const tree = npc && !npc.dead ? treeFor({ ...npc, talk: npc.kind === "follower" ? "follower" : folk.find(({ id }) => id === npc.id)?.talk }) : null;

        if (!tree) {
            return;
        }

        this.#tradeOver(npc);

        const soldier = npc.kind === "soldier" ? this.#soldierWords(npc) : null;
        const names = {};
        const official = this.#officialOf(npc, building, names);
        // (One of the townsfolk out in the streets: theirs, and the place they're of)
        const out = !building ? this.host.folk.get(npc.id) : null;
        const title = soldier?.title ?? folk.find(({ id }) => id === npc.id)?.title ?? out?.title ?? ROLES[npc.role]?.title ?? "";
        Object.assign(names, Object.fromEntries(folk.map(({ id, local = id, name }) => [local, name.split(" ")[0]])));

        const upstairs = building?.tavern?.storeys > 1 ? building.tavern.upstairs : null;

        names.keeper ??= names.innkeeper;

        // (The settlement's name, and in a temple, its patron: "Aurelia", "the Dawnmother"; out in
        // the streets, the townsfolk's own)
        names.town = building ? this.world.plan?.places.find(({ id }) => id === this.#townOf(building))?.name : out?.townName || undefined;

        if (building?.patron) {
            names.patron = GODS[building.patron].name;
            names.patronTitle = GODS[building.patron].title;
        }

        Object.assign(names, soldier?.names, official?.words, this.#rumours(building ?? (out ? { place: out.place === this.world.start?.id ? "home" : out.place } : null)), this.#guildWords());

        // (An adventurer who could be hired, and for how much; a follower waiting or following)
        const one = folk.find(({ id }) => id === npc.id);
        const hire = one && (one.role === "adventurer" || one.talk === "adventurer") ? HIRES[one.look] : null;
        const following = npc.kind === "follower" ? this.host.followers.get(npc.id) : null;
        const company = [...this.host.followers.values()].filter(({ leader }) => leader === this.me).length;

        if (hire) {
            names.hirePrice = String(hire.price);
        }

        // (They stop and face the player, if they can talk now: the host says)
        if (!this.#command({ type: "talk", with: npc.id }, (result) => !result.ok && this.talking?.id === npc.id && this.#endTalk()).ok) {
            return;
        }

        this.memory[npc.id] ??= { talks: 0, flags: [] };

        const conversation = new Conversation(tree, {
            speaker: { id: npc.id, name: npc.name, title },
            player: { name: this.hero.name },
            place: building?.name,
            names,
            check: (condition) =>
                "upstairs" in condition
                    ? upstairsIs(condition.upstairs, upstairs)
                    : "stance" in condition
                      ? soldier?.stance === condition.stance
                      : "rumour" in condition
                        ? Boolean(names.rumour1) === condition.rumour
                        : "hire" in condition
                          ? Boolean(hire && company < this.host.mostFollowers(this.me)) === condition.hire
                          : "purse" in condition
                            ? (this.progress.gold >= (hire?.price ?? 0)) === condition.purse
                            : "waiting" in condition
                              ? Boolean(following?.waiting) === condition.waiting
                              : "member" in condition
                                ? (this.standing.guildRank() !== null) === condition.member
                                : official
                                  ? official.check(condition)
                                  : true,
            memory: this.memory[npc.id],
            knowledge: this.knowledge,
            variety: this.talkVariety,
            onEffect: (effect) => {
                // (Work, word of it, the armoury, counsel: an official's, their words filled in from what came of it)
                if (official?.handles(effect)) {
                    official.effect(effect);

                    return;
                }

                // (What can't be paid for, said; what is, the gold heard counted out)
                this.#command({ type: "effect", effect }, (result) => {
                    if (!result.ok) {
                        this.hud.message(REFUSALS[result.reason] ?? "Can't do that.", 1.6);
                        this.sound?.play(result.reason === "gold" ? "buyDenied" : "denied");
                    } else if (effect.price || effect.pay) {
                        this.hud.setGold(this.progress.gold);
                        this.onProgress(this.progress);
                        this.sound?.play("coins");
                    }
                });

                // (Their wares, once the talk's over: their own shop, or their part's, as the host
                // has it)
                const keeps = folk.find(({ id }) => id === npc.id)?.shop ?? SHOPKEEPERS[npc.role];

                if (effect.shop && keeps) {
                    this.shopWanted = { shop: keeps, keeper: npc.id, name: npc.name };
                }
            },
        });

        this.talking = { id: npc.id, conversation };
        this.#talkingFace(npc.id, true);
        this.avatars.get(npc.id)?.actions.stopResting();
        this.avatars.get(this.me)?.actions.stopResting();
        // (One of a guild's: the player's rank in the guilds, on the talk's card)
        this.talking.guild = OFFICIALS[npc.role]?.post === "guild";
        this.talk.show({ name: npc.name, title, card: this.talking.guild ? this.guildCard() ?? { title: null } : null }, conversation);
        this.sound?.play("talk");
        this.#keepTalks();
    }

    // The war's news as it's heard where the player's talking (docs/WAR.md M8): {rumour1} to
    // {rumour3}, newest first (the latest again, where there's less to tell), and {rumourRuler},
    // what's said of one of the rulers the town's people know of. None, with no war
    #rumours(building) {
        const war = this.host.war;
        const place = building?.place === "home" ? this.world.start : this.world.plan?.places.find(({ id }) => id === building?.place);
        const at = place?.at ?? this.world.start?.at;

        if (!war || !at) {
            return {};
        }

        const heard = rumoursAt(war, at);
        const town = war.holdingAt(at);
        const holders = town ? war.liege(town.owner) : war.liege(this.self.realm);
        const rulers = war.realms.filter((realm) => realm.alive && (realm.id === holders || war.relation(realm.id, holders) !== "unknown"));
        const sayings = rulers.map((realm) => rumourOfRuler(war, realm.id)).filter(Boolean);
        const ruler = sayings.length ? sayings[this.talkVariety.next("rumourRuler", sayings.length)] : null;

        if (!heard.length && !ruler) {
            return {};
        }

        const said = heard.length ? heard : [ruler];

        return { rumour1: said[0], rumour2: said[1] ?? said[0], rumour3: said[2] ?? said[0], rumourRuler: ruler ?? said[0] };
    }

    // Which settlement a building's in (its id: insides.js townOf; a manor's, a watchtower's, a
    // castle's keep's out in the land, the nearest town of its people's)
    #townOf(building) {
        return townOf(building, { plan: this.world.plan, war: this.host.war, start: this.world.start });
    }

    // What one of the officials of a town hall or keep (or those about them) can tell of, and
    // what they ask the game (dialogue.js's reeve, clerk, petitioner, ruler, steward, councillor
    // and sentry): their words (`words`: the town, who holds it and rules them, the war, the
    // player's rank and the next, what's said of the ruler, the counsel that can be given), their
    // conditions (`check`), and what's done by talking to them (`effect`: sent to the host, and
    // the talk's words, `names`, filled in from what came of it)
    #officialOf(npc, building, names) {
        const war = this.host.war;
        const town = building && war ? war.town(this.#townOf(building)) : null;

        if (!town || !["reeve", "clerk", "petitioner", "ruler", "steward", "councillor", "sentry", "receptionist"].includes(npc.role)) {
            return null;
        }

        const liege = war.liege(this.self.realm);
        const own = war.liege(town.owner) === liege;
        const rulers = war.realm(war.realm(town.owner)?.seat === town.id ? town.owner : war.liege(town.owner));
        const { leader } = rulers;
        const standing = this.standing;
        const rank = standing.rank();
        const next = STANDINGS[rank + 1];
        const seat = war.town(war.realm(liege)?.seat)?.at ?? town.at;
        const enemies = war.enemiesOf(liege);
        const people = (id) => ({ id, name: `the ${peopleOf(id)}` });
        const options = {
            march: war.towns
                .filter((each) => enemies.includes(war.liege(each.owner)))
                .sort((a, b) => Math.hypot(a.at[0] - seat[0], a.at[1] - seat[1]) - Math.hypot(b.at[0] - seat[0], b.at[1] - seat[1]))
                .slice(0, 3)
                .map(({ id, name }) => ({ id, name })),
            peace: enemies.slice(0, 3).map(people),
            war: war.realms.filter((realm) => realm.alive && !realm.overlord && realm.id !== liege && war.relation(liege, realm.id) === "neutral").slice(0, 3).map(({ id }) => people(id)),
        };
        const sayings = describeLeader(leader, rulers.id).map(({ saying }) => saying);
        const foes = war.enemiesOf(war.liege(town.owner)).map((id) => `the ${peopleOf(id)}`);

        // (Serving another people: how near they are to rising, and whether the player's word, as
        // it weighs by their rank, would be enough: docs/WAR.md M10)
        const oppressor = war.oppressor(this.self.realm);
        const unrest = war.realm(this.self.realm)?.unrest ?? 0;
        const ready = unrest >= RISING.ready * (1 - COUNSEL[rank] * (1 - RISING.early));
        const state = { offer: null, board: [], reported: false };
        const giftDue = () => rank >= OPENS.armoury && Array.from({ length: rank - OPENS.armoury + 1 }, (_, k) => OPENS.armoury + k).some((each) => !standing.claimed.includes(each));

        const words = {
            town: town.name,
            holder: `the ${peopleOf(town.owner)}`,
            ruler: `${leader.title} ${leader.name}`,
            age: STAGES[war.stage].name.toLowerCase(),
            foes: foes.length ? foes.join(" and ") : "no one, for now",
            rank: standing.title(),
            standingNext: next ? `Another ${next.points - standing.points} and you'd be ${next.title}: ${next.opens.charAt(0).toLowerCase()}${next.opens.slice(1)}` : "There's none higher.",
            traits: sayings.length ? `They say ${leader.title} ${leader.name} is ${sayings.slice(0, 2).join(", and ")}.` : `${leader.title} ${leader.name}? Hard to read. As steady as their people, they say.`,
            ...Object.fromEntries(Object.entries(options).flatMap(([kind, list]) => list.map(({ name }, k) => [`${kind}${k + 1}`, name]))),
            oppressor: oppressor ? `the ${peopleOf(oppressor)}` : "no one",
            unrest: `the people are ${Math.round((unrest / RISING.ready) * 100)}% of the way to rising`,
        };

        const holds = {
            own: () => own,
            room: () => standing.requests.length < MOST_REQUESTS,
            offer: () => Boolean(state.offer),
            // (A guild's board: its notices, each there or not)
            ...Object.fromEntries(Array.from({ length: BOARD_SIZE }, (_, k) => [`offer${k + 1}`, () => Boolean(state.board[k])])),
            due: () => this.host.dueTo(this.me, npc.id).length > 0,
            reported: () => state.reported,
            keep: () => rank >= OPENS.keep,
            armoury: () => own && giftDue(),
            counselMarch: () => own && !oppressor && rank >= OPENS.march && options.march.length > 0,
            counselPeace: () => own && !oppressor && rank >= OPENS.peace && options.peace.length > 0,
            counselWar: () => own && !oppressor && rank >= OPENS.war && options.war.length > 0,
            counselBuild: () => own && !oppressor && rank >= OPENS.build,
            plans: () => (buildingView(war, this.self.realm)?.plans.length ?? 0) > 0,
            counselRise: () => Boolean(oppressor) && town.owner === this.self.realm && rank >= OPENS.rise,
            ready: () => ready,
            serving: () => Boolean(war.realm(town.owner)?.overlord),
        };
        // What came of something asked, for their words: heard at once; or, joined to another's
        // world (docs/WAR.md M11), a moment later, and what's being said said again as it now is
        const heard = (effect, result, kind, chosen) => {
            if (effect.work === "ask") {
                state.offer = result.ok ? result.request : null;
                state.board = result.ok ? (result.board ?? [result.request]) : [];
                names.offer = state.offer?.text ?? "";
                names.reward = state.offer ? rewardOf(state.offer.reward) : "";

                // (Each of a guild's notices: what it asks in a few words, in full, and what it pays)
                for (let k = 0; k < BOARD_SIZE; k++) {
                    const notice = state.board[k];

                    names[`brief${k + 1}`] = notice ? briefOf(notice) : "";
                    names[`offer${k + 1}`] = notice?.text ?? "";
                    names[`reward${k + 1}`] = notice ? rewardOf(notice.reward) : "";
                }
            } else if (effect.work === "accept") {
                state.offer = null;
                state.board = result.ok ? state.board.filter((notice) => objectiveOf(notice) !== objectiveOf(result.request)) : state.board;

                if (!result.ok) {
                    this.hud.message(REFUSALS[result.reason] ?? "Can't do that.", 1.6);
                }
            } else if (effect.report) {
                const handed = result.ok ? (result.reported ?? []) : [];
                const paid = handed.reduce((sum, { reward }) => sum + reward.gold, 0);
                const first = handed[0];

                state.reported = result.ok;
                names.reported = !first ? "" : `${first.kind === "message" ? `A letter from ${first.from.townName}? I'll see it read.` : first.kind === "courier" ? `The package from ${first.from.townName}! Seal unbroken, too.` : first.kind === "tithe" ? "The treasury thanks you." : "Done, and well done."}${handed.length > 1 ? " And the rest besides." : ""}${paid ? ` ${paid} gold, for your trouble.` : ""}`;
            } else if (effect.guild) {
                if (!result.ok) {
                    this.hud.message(REFUSALS[result.reason] ?? "Can't do that.", 1.6);
                }
            } else if (effect.armoury) {
                names.gift = result.ok && result.item ? `From the armoury, for your rank: ${itemLabel(result.item).toLowerCase()}. Wear it well.` : (REFUSALS[result.reason] ?? "There's nothing for you.");
            } else if (kind) {
                const said = { march: `So be it. We march on ${chosen?.name} when we can.`, peace: `Peace with ${chosen?.name}... Very well. An envoy will go, when one can be spared.`, war: `${chosen?.name}? Yes. They've had it coming.`, rise: `Then it's today. Send word to every town: we're done serving ${words.oppressor}!` };

                names.counsel = result.ok ? said[kind] : "No. That cannot be.";
            }

            this.hud.setGold(this.progress.gold);
            this.onProgress(this.progress);
            this.onStanding(this.standing);

            // (Signed up, or work done: their guild card's words as it now is)
            Object.assign(names, this.#guildWords());
            this.#showGuild();

            if (this.remote && this.talking?.id === npc.id) {
                this.talking.conversation.retell();
                this.talk.update(this.talking.conversation);
            }
        };

        return {
            words,
            check: (condition) => {
                const [[key, value]] = Object.entries(condition);
                const choice = /^(march|peace|war)([1-3])$/.exec(key);

                if (choice) {
                    return Boolean(options[choice[1]][choice[2] - 1]) === value;
                }

                return holds[key] ? holds[key]() === value : true;
            },
            handles: (effect) => Boolean(effect.work || effect.report || effect.armoury || effect.counsel || effect.guild || effect.plans),
            effect: (effect) => {
                // (The council's plans: the building screen opened, and what's counselled there sent)
                if (effect.plans) {
                    names.planned = "Take your time. Show me which.";
                    this.#openPlans(npc, names);

                    return;
                }

                const [kind, index] = Object.entries(effect.counsel ?? {})[0] ?? [];
                const chosen = kind && kind !== "rise" ? options[kind]?.[index - 1] : null;
                // (A notice on a guild's board taken, by its place on it: sent as what it asks)
                const notice = effect.work === "accept" && Number.isInteger(effect.which) ? state.board[effect.which - 1] : null;
                const sent = kind && kind !== "rise" ? { counsel: { [kind]: chosen?.id } } : notice ? { work: "accept", which: objectiveOf(notice) } : effect;

                this.#command({ type: "effect", effect: sent }, (result) => heard(effect, result, kind, chosen));
            },
        };
    }

    // The building screen (app/building.js), opened at a ruler's: the council's plans on the world
    // map, one chosen counselled (host.js #official, war.js counsel's `build`), and the ruler's
    // words (`names.planned`) as it went
    #openPlans(npc, names) {
        const view = buildingView(this.host.war, this.self.realm);

        if (!view) {
            return;
        }

        this.onWorldMap({
            build: {
                ...view,
                choose: (key) => {
                    const plan = view.plans.find((each) => each.key === key);

                    this.#command({ type: "effect", effect: { counsel: { build: key } } }, (result) => {
                        names.planned = result.ok ? `${plan.name}. So be it: it's the next we build, as soon as the stores allow.` : "No. That cannot be.";

                        if (!result.ok) {
                            this.hud.message(REFUSALS[result.reason] ?? "Can't do that.", 1.6);
                        }

                        if (this.talking?.id === npc.id) {
                            this.talking.conversation.retell();
                            this.talk.update(this.talking.conversation);
                        }
                    });
                },
            },
        });
    }

    // What a soldier can tell of: the town they guard, whose it is, their ruler, the war (as
    // their words' {town}, {holder}, {ruler}, {age}, {foes}), how their people stand with the
    // player's (their `stance`: "own", "allied" or "neutral"), and their title
    #soldierWords(npc) {
        const war = this.host.war;
        const soldier = this.host.soldiers.get(npc.id);
        const town = war?.town(soldier?.town);
        const realm = war?.realm(war.liege(npc.team));
        const mine = this.self.realm;
        const relation = war?.relation(mine, npc.team);
        const foes = war ? war.enemiesOf(war.liege(npc.team)).map((id) => `the ${peopleOf(id)}`) : [];
        const stance = npc.team === mine || relation === "vassal" || relation === "overlord" ? "own" : relation === "allied" ? "allied" : "neutral";

        const met = soldier?.envoy ? this.host.envoys.get(soldier.envoy) : null;

        return {
            title: met ? (soldier.part === "envoy" ? `Envoy to the ${peopleOf(met.to)}` : `Escort to the envoy to the ${peopleOf(met.to)}`) : town ? `Of the guard of ${town.name}` : "",
            stance,
            names: {
                town: town?.name ?? "this place",
                holder: `the ${peopleOf(npc.team)}`,
                ruler: realm ? `${realm.leader.title} ${realm.leader.name}` : "our ruler",
                age: war ? STAGES[war.stage].name.toLowerCase() : "peace",
                foes: foes.length ? foes.join(" and ") : "no one, for now",
            },
        };
    }

    // Say one of the replies: the talk goes on, or ends
    #say(index) {
        const conversation = this.talking?.conversation;

        if (!conversation?.choose(index)) {
            return;
        }

        this.sound?.play("tap");
        this.#keepTalks();

        // (Heard: whoever they're talking with nods at every other reply)
        this.talking.replies = (this.talking.replies ?? 0) + 1;

        if (!conversation.ended && this.talking.replies % 2 === 1) {
            this.avatars.get(this.talking.id)?.actions.emote?.("nod");
        }

        if (conversation.ended) {
            this.#endTalk();
        } else {
            this.talk.update(conversation);
        }
    }

    // Someone's face while they're talked to, and after (characters/expressions.js): a little
    // smile, and their brows lifting now and then, as when speaking
    #talkingFace(id, talking) {
        const face = this.avatars.get(id)?.character.expressions;

        if (face) {
            face.talking = talking;
        }
    }

    // Stop talking: they go back to what they were doing
    #endTalk() {
        if (!this.talking) {
            return;
        }

        // (Over to trade with them: they're still the player's, standing at their counter or
        // wherever they were, rather than going back about their business, maybe off out of reach
        // and the trade with it, till it's done: #stopShopping)
        const trading = this.shopWanted?.keeper === this.talking.id;

        if (!trading) {
            this.#command({ type: "talk", with: null });
        }

        this.#talkingFace(this.talking.id, false);
        this.talking = null;
        this.talk?.hide();

        if (this.shopWanted) {
            this.#openShop(this.shopWanted);
            this.shopWanted = null;
        }
    }

    // Trading ends once the player's walked away from the shopkeeper (or they're gone)
    #keepShopping() {
        const keeper = this.shopping && this.battle.actor(this.shopping.keeper);
        const player = this.battle.actor(this.me);

        if (this.shopping && (!keeper || !player || keeper.map !== player.map || distanceBetween(player.square, keeper.square) > SHOP_REACH)) {
            this.closePack();
        }
    }

    // A talk ends if it can't go on: either of them gone (dead, or elsewhere), the player walked
    // away, or someone's after the player
    #keepTalking() {
        const talking = this.talking;

        if (!talking) {
            return;
        }

        const player = this.battle.actor(this.me);
        const npc = this.battle.actor(talking.id);

        if (!player || !npc || player.dead || npc.dead || npc.map !== player.map || distanceBetween(player.square, npc.square) > TALK_REACH.across + 1 || this.#threatened(player)) {
            this.#endTalk();
        }
    }

    // Keep what's been said (the game's save: save.js)
    #keepTalks() {
        this.onTalk({ memory: this.memory, knowledge: [...this.knowledge] });
    }

    // --- Resting ---

    // The player did something (tapped, clicked, typed, scrolled): no resting for a while
    #wake() {
        this.lastInput = this.clock;
        this.restAt = null;
        this.avatars.get(this.me)?.actions.stopResting();
    }

    // The player, standing a while with nothing going on (no input, no one to fight or after
    // them, no one to talk to): now and then one of the adventurer's rests (roles.js)
    #restPlayer() {
        const player = this.battle.actor(this.me);
        const actions = this.avatars.get(this.me)?.actions;

        if (!player || !actions) {
            return;
        }

        const still = !player.dead && !player.order && !player.attack && !player.casting && !player.path.length && this.battle.time >= player.stunnedUntil;
        const quiet = still && this.clock - this.lastInput >= PLAYER_RESTS_AFTER / 1000 && !this.talking && !this.#threatened(player);

        if (!quiet) {
            actions.stopResting();
            this.restAt = null;

            return;
        }

        this.restAt ??= this.clock;

        if (this.clock >= this.restAt && !actions.attack) {
            const rest = ROLES.adventurer.rests[actions.rest("adventurer")];

            this.restAt = this.clock + rest.duration + (REST_EVERY[0] + Math.random() * (REST_EVERY[1] - REST_EVERY[0])) / 1000;
        }
    }

    // Is anyone after the player, or can they see an enemy? (No time to rest.)
    #threatened(player) {
        return this.battle.actors.some((other) => this.battle.hostile(other, player) && !other.dead && other.map === player.map && (other.target === player.id || this.battle.canSee(player, other)));
    }

    // One of the folk rests (battle.js #rest): seen and heard only on the player's map
    #rest({ id, role, rest }, avatar) {
        const how = ROLES[role]?.rests[rest];

        if (!how || this.battle.actor(id).map !== this.mapId) {
            return;
        }

        avatar.actions.rest(role, { variant: rest });

        if (how.sound) {
            this.sound?.play(how.sound, { at: avatar.object.position, delay: how.hitAt, volume: how.volume ?? 1 });
        }
    }

    // What a foot at (x, z) (metres, on its map) lands on (audio/footing.js): the square's ground,
    // and out in the world the land's, how high it is and whether it's waded through
    #footingAt(map, x, z) {
        const [sx, sz] = [Math.floor(x), Math.floor(z)];
        const ground = squaresOf(map).ground(sx, sz);

        if (!map.biomeAt) {
            return footing(ground);
        }

        const chunk = map.chunkAt?.(sx, sz);
        const k = chunk ? (sz - chunk.y0) * CHUNK + (sx - chunk.x0) : -1;

        return footing(ground, { land: map.biomeAt(sx, sz), height: map.heightAt?.(x, z) ?? 0, wet: k >= 0 && Boolean(chunk.water[k]) && !chunk.bridge[k] });
    }

    // Someone going up or down the stairs (they're there at once: battle.js cross), heard as a few
    // treads on what's at the stairs' end (`at`, on the player's floor), coming up to it (`coming`)
    // louder and louder, going away quieter and quieter
    // What's heard round the player (audio/ambience.js), worked out every HEARD_EVERY seconds (or
    // `now`, on coming to another map): indoors, the place's beds and how far its hearth is; out
    // of doors, the land's, its waters', a settlement's and its fires' (surroundings.js), by the
    // time of day. And on the hours of prayer, a church's bell, if they're in a town
    #hearAround(dt, { now = false } = {}) {
        const me = this.avatars.get(this.me)?.object.position;

        this.hearing = (this.hearing ?? 0) - dt;

        if (!this.sound || !me || (this.hearing > 0 && !now)) {
            return;
        }

        this.hearing = HEARD_EVERY;

        const time = timeOfDay(elapsedOf(this.host.war));
        const interior = this.interiors.get(this.mapId);
        const overworld = this.world.maps?.town;
        let facts = { place: this.#soundOf(this.mapId), time };

        if (interior) {
            facts.hearth = interior.hearth ? Math.hypot(interior.hearth.x - me.x, interior.hearth.z - me.z) : Infinity;
        } else if (overworld?.biomeAt) {
            this.surroundings ??= new Surroundings(overworld);
            facts = { ...facts, ...this.surroundings.at(me.x, me.z, { height: me.y, lights: this.nearLights ?? [], lit: torchesLit(elapsedOf(this.host.war)) }) };
        }

        this.sound.setAmbience(ambienceOf(facts));

        // (Rung once as the hour comes, heard from the town's church, somewhere off)
        if (facts.settled > 0.3 && this.tolledAt !== undefined && tolled(this.tolledAt, time)) {
            const angle = Math.random() * 2 * Math.PI;
            const far = TOLLS.away[0] + Math.random() * (TOLLS.away[1] - TOLLS.away[0]);
            const at = { x: me.x + far * Math.cos(angle), z: me.z + far * Math.sin(angle) };

            for (let stroke = 0; stroke < TOLLS.strokes; stroke++) {
                this.sound.play("churchBell", { at, delay: stroke * TOLLS.apart, far: TOLLS.heard });
            }
        }

        this.tolledAt = time;
    }

    #climb(avatar, at, coming) {
        const map = this.world.maps?.[this.mapId] ?? this.world;
        const [ox, oz] = this.originOf(this.mapId);
        const surface = this.#footingAt(map, at.x - ox, at.z - oz);

        // (Wooden stairs creaking under the treads)
        if (surface === "wood") {
            this.sound?.play("stairs", { at, rate: CREAKS });
        }

        for (let tread = 0; tread < STAIRS.treads; tread++) {
            const near = (coming ? tread + 1 : STAIRS.treads - tread) / STAIRS.treads;

            this.sound?.step(surface, at, { ...avatar.gait, armour: armourOf(avatar.character), speed: STAIRS.speed, delay: tread * STAIRS.apart, volume: near });
        }
    }

    // Whether a death's the player's to be told of ("slain!"): one fallen at their hand or a
    // follower's, or one they'd traded blows with lately (FOUGHT); not the folk and soldiers
    // falling in fights that aren't theirs
    #ours({ id, by }) {
        const killer = by ? this.battle.actor(by) : null;
        const fought = this.clock - (this.fought.get(id) ?? -Infinity) < FOUGHT;

        this.fought.delete(id);

        return by === this.me || killer?.leader === this.me || fought;
    }

    // --- Emotes (core/emotes.js) ---

    // Someone showing an emote (host.js "emote": a player's, from their wheel or a quick action):
    // seen only on the player's map
    #emote({ id, emote }) {
        const actor = this.battle.actor(id);

        if (isEmote(emote) && actor?.map === this.mapId && !actor.dead) {
            this.avatars.get(id)?.actions.emote?.(emote);
        }
    }

    // One of the folk (a soldier, a follower) greeting someone who's come to talk to them (host.js
    // "talk"): bowing, nodding or waving, as befits what they are (GREETINGS); sat down, a nod
    #greet({ with: other }) {
        const npc = other ? this.battle.actor(other) : null;

        if (npc && npc.kind !== "player" && npc.map === this.mapId) {
            this.avatars.get(npc.id)?.actions.emote?.(npc.routine?.seated ? "nod" : greetingOf(npc.role, npc.kind));
        }
    }

    // A foe fallen near those who'll be glad of it (core/emotes.js cheering): each of them cheers
    // a moment after, seen on the player's map
    #cheer({ id, by }) {
        const fallen = this.battle.actor(id);

        if (fallen?.map === this.mapId) {
            this.cheers.push(...cheering(this.battle, fallen, by ? this.battle.actor(by) : null).map(({ id: who, after, emote }) => ({ id: who, at: this.clock + after, emote })));
        }
    }

    // The folk whose moment to cheer has come (#cheer), if they're still standing about
    #cheered() {
        if (!this.cheers.length) {
            return;
        }

        this.cheers = this.cheers.filter(({ id, at, emote }) => {
            if (this.clock < at) {
                return true;
            }

            const actor = this.battle.actor(id);

            if (actor && !actor.dead && !actor.path.length && !actor.attack && actor.map === this.mapId) {
                this.avatars.get(id)?.actions.emote?.(emote);
            }

            return false;
        });
    }

    // One of the looks of a spell's light or a bolt (effects.js LOOKS), for a character: any at
    // first, never the same as its last after
    #look(id, kind) {
        if (!this.variety.has(id)) {
            this.variety.set(id, new Variety());
        }

        return this.variety.get(id).next(kind, LOOKS[kind].length);
    }

    // The look a spell lands on a character in: the one it was cast in (then done with), or any
    #landing(id, spell) {
        const look = this.landing.get(id) ?? this.#look(id, spell);

        this.landing.delete(id);

        return look;
    }

    // --- Inside and out ---

    // One of the folk does something (battle.js #routine): raises a tankard, puts one down on a
    // table, draws ale from a barrel, beckons the player over (turning to them first); seen and
    // heard only on the player's map
    #act({ id, act, target }, avatar) {
        const how = ACTS[act];
        const actor = this.battle.actor(id);

        if (!how || actor.map !== this.mapId) {
            return;
        }

        avatar.actions.startAttack(act, { hitAt: how.hitAt, duration: how.duration });

        // Its sound at each beat (at key 1, or at each of its `beats`), and what flies up where
        // the work is (so far ahead of them, so high): sparks off the anvil, steam off the trough
        for (const beat of how.beats ?? [0]) {
            const delay = how.hitAt + beat;

            if (how.sound) {
                this.sound?.play(how.sound, { at: avatar.object.position, delay: delay - (how.early ?? 0), volume: how.volume });
            }

            if (how.burst) {
                const { x, z } = avatar.object.position;
                const [ahead, height] = [how.ahead, how.height];

                this.#after(delay, () => this.effects.burst(how.burst, new THREE.Vector3(x + Math.sin(actor.facing) * ahead, avatar.object.position.y + height, z + Math.cos(actor.facing) * ahead)));
            }

            if (how.flare) {
                this.#after(delay, () => this.view.flare(0, how.flare, this.clock));
            }
        }

        if (how.drive) {
            this.interiors.get(this.mapId)?.drive(how.drive, this.clock + how.hitAt * 0.5, how.duration - how.hitAt * 0.5);
        }

        if (act === "beckon" && target === this.me && !this.talking) {
            this.hud.message(`${actor.name.split(" ")[0]} beckons you over`, 2.5);
        }
    }

    // Do something `seconds` from now (the game's clock)
    #after(seconds, then) {
        this.later.push({ at: this.clock + seconds, then });
        this.later.sort((a, b) => a.at - b.at);
    }

    // Put a character where it is in the battle, on its map, at once (not walking there)
    #place(actor) {
        const [ox, oz] = this.originOf(actor.map);

        const avatar = this.avatars.get(actor.id);

        avatar.place(ox + actor.x, oz + actor.y, actor.facing);
        // (Stood straight on the ground there, not eased to it from wherever they were)
        avatar.standing = undefined;

        if (actor.id === this.me) {
            this.focusHeight = undefined;
        }

        this.previous.set(actor.id, { x: actor.x, y: actor.y });
    }

    // The player has come through a door or up or down the stairs (or woken elsewhere): the
    // screen comes up from black on the map they're on, the camera behind them the way they face.
    // Come into a room, it looks across it from under the ceiling (view.js ROOM_VIEW); back out of
    // doors, as it did before they went in
    #arrive(actor) {
        const position = this.avatars.get(this.me).object.position;
        const indoors = this.interiors.has(actor.map);
        let pitch = this.cameraFollow?.pitch;

        if (indoors) {
            this.outdoorView ??= { distance: this.view.distance, pitch };
            this.view.distance = ROOM_VIEW.distance;
            pitch = ROOM_VIEW.pitch;
        } else if (this.outdoorView) {
            ({ distance: this.view.distance, pitch } = this.outdoorView);
            this.outdoorView = null;
        }

        this.#showMap(actor.map);
        this.cameraFollow = new CameraFollow({ x: position.x, z: position.z, yaw: Math.atan2(-Math.sin(actor.facing), -Math.cos(actor.facing)), pitch });
        this.#follow(0);
        this.effects.markerAge = Infinity;

        if (this.curtain) {
            this.curtain.style.transition = "none";
            this.curtain.style.opacity = "1";
            this.curtain.getBoundingClientRect();
            this.curtain.style.transition = `opacity ${FADE_IN}s ease-out`;
            this.curtain.style.opacity = "0";
        }
    }

    // --- Passing the time (core/host.js REST) ---

    // Someone's slept (at an inn, or by a camp's fire): if the world's time passed, everyone's
    // woken with them, the screen up from black, told how long; if only they rested, just them
    // A Scroll of Safety read (its circle growing under the reader as they read it), or lost
    // (they fell first, or there was nowhere to take them: the circle gone at once)
    #safety({ id, change, ms = SAFETY.ms, why = null }) {
        const was = this.reading.get(id);
        const avatar = this.battle.actor(id)?.map === this.mapId ? this.avatars.get(id) : null;

        was?.circle?.end();
        this.reading.delete(id);

        // (Its sound swelling as the circle grows, loudest as they're carried off; lost, cut
        // short, fizzling out if there was nowhere to take them)
        if (was && change !== "reading") {
            this.sound?.cut(was.sound);

            if (why !== "fell") {
                this.sound?.play("fizzle", { at: avatar?.object.position ?? null });
            }
        }

        if (change === "reading") {
            this.reading.set(id, { until: this.battle.time + ms, ms, circle: this.#safetyCircle(id, { from: 0, to: 2, life: ms / 1000 }), sound: avatar ? this.sound?.play("spellCircle", { at: avatar.object.position, peakAt: ms / 1000 }) : null });
        }

        if (id === this.me) {
            const said = change === "reading" ? "You read the Scroll of Safety…" : why === "nowhere" ? "The scroll's light fades: there's nowhere for it to take you." : null;

            if (said) {
                this.hud.message(said, change === "reading" ? ms / 1000 : 3);
            }
        }
    }

    // A Scroll of Safety's circle turning under someone, `from` to `to` metres across over `life`
    // seconds, following them while they're on the map shown (spellfx.js underfoot)
    #safetyCircle(id, { from, to, life }) {
        const avatar = this.avatars.get(id);

        if (!avatar || life <= 0) {
            return null;
        }

        return this.spellFx.underfoot(() => (this.battle.actor(id)?.map === this.mapId && this.avatars.get(id) === avatar ? avatar.object.position : null), { from, to, life });
    }

    // Someone come somewhere (through a door, or carried by magic): read home by a Scroll of
    // Safety, its light there and its circle under them, shrinking away; or still reading one, and
    // the player gone to another map (what was showing on the last gone with it), its circle
    // under them again, as far grown as it was
    #safetyCrossed(id) {
        const avatar = this.avatars.get(id);

        if (this.homeward.delete(id)) {
            if (avatar && this.battle.actor(id)?.map === this.mapId) {
                this.spellFx.appear(avatar.object.position.clone(), "safety");
            }

            this.#safetyCircle(id, { from: 2, to: 0, life: SAFETY.ms / 1000 });

            return;
        }

        const reading = this.reading.get(id);

        if (reading && id === this.me) {
            const left = Math.max(0, reading.until - this.battle.time) / 1000;
            const read = 1 - left / (reading.ms / 1000);

            reading.circle?.end();
            reading.circle = this.#safetyCircle(id, { from: 2 * (1 - (1 - read) ** 2), to: 2, life: left });
        }
    }

    #slept({ id, where, passed, until = null }) {
        const mine = id === this.me;

        if (!passed && !mine) {
            return;
        }

        if (passed && this.curtain) {
            this.curtain.style.transition = "none";
            this.curtain.style.opacity = "1";
            this.curtain.getBoundingClientRect();
            this.curtain.style.transition = `opacity ${SLEEP_FADE}s ease-in`;
            this.curtain.style.opacity = "0";
        }

        // (Woken at sunrise or sunset: whichever the time's nearer)
        const morning = timeOfDay(elapsedOf(this.host.war)) < (DAY.rises + DAY.sets) / 2;
        const who = mine ? "You sleep" : `${this.battle.actor(id)?.name ?? "Your host"} sleeps`;
        const how = where === "camp" ? " by the fire" : "";

        // (As long as was chosen, making camp: so many hours, till sundown or the morning)
        const hours = until?.hours;
        const long = hours ? ` for ${hours} hour${hours === 1 ? "" : "s"}` : ` till ${until === "sundown" ? "sundown" : until === "morning" || morning ? "the sun's up" : "evening"}`;

        this.hud.message(passed ? `${who}${how}${long}, ${Math.round(passed / 60000)} minutes gone.` : `You rest${how}: the time's the host's to pass.`, 3.5);
        this.onWar?.(this.host.war);
    }

    // The players' camps out in the world (core/host.js campfires), drawn while their fires burn:
    // the sleeper's tent by its fire, pitched and struck as the host has them
    #restCamps() {
        const burning = this.host.campfires ?? [];
        const drawn = (this.restDrawn ??= new Set());
        const [ox, oz] = this.originOf("town");

        for (const { id, people, fire, tent } of burning) {
            if (!drawn.has(id)) {
                this.camps?.pitch(id, people, { fire: [ox + fire[0], oz + fire[1]], tents: [{ at: [ox + tent.at[0], oz + tent.at[1]], facing: tent.facing }] });
                drawn.add(id);
            }
        }

        for (const id of [...drawn]) {
            if (!burning.some((camp) => camp.id === id)) {
                this.camps?.strike(id);
                drawn.delete(id);
            }
        }
    }

    // --- Going inside ---

    // Some no longer to be drawn (those let go of, or gone): off the list, and any being drawn
    // stopped
    #unenlist(ids) {
        this.enlisting = this.enlisting.filter((id) => !ids.includes(id));

        for (const id of ids) {
            this.enlistees.delete(id);
        }
    }

    // Of those to be drawn, the one to take the next step of: the nearest the player (on their map
    // before any on another), begun if it isn't yet, and none of those put by this frame (waiting
    // on their skins, painted elsewhere). The townsfolk after everyone else, and none of them while
    // a building's being got ready (`busy`), as Wenches and Ale's folk: only there to be seen about,
    // they keep no one waiting, the soldiers and creatures nor a building's folk behind them in the
    // skins worker. { actor, steps }, or null if there's none
    #nextEnlistee(put, busy = false) {
        const me = this.battle.actor(this.me);
        const far = (actor) => (me && actor.map === me.map ? Math.hypot(actor.x - me.x, actor.y - me.y) : Infinity);
        const later = (actor) => this.host.folk.get(actor.id)?.role === "townsfolk";
        let nearest = null;

        // (Those gone, or drawn some other way meanwhile, off the list)
        this.enlisting = this.enlisting.filter((id) => this.battle.actor(id) && !this.#drawnInFull(id) && !this.enlistees.has(id));

        for (const actor of [...[...this.enlistees.values()].map(({ actor }) => actor), ...this.enlisting.map((id) => this.battle.actor(id))]) {
            if (put.has(actor.id) || (busy && later(actor))) {
                continue;
            }

            if (!nearest || (later(nearest) && !later(actor)) || (later(nearest) === later(actor) && far(actor) < far(nearest))) {
                nearest = actor;
            }
        }

        if (nearest && !this.enlistees.has(nearest.id)) {
            this.enlisting = this.enlisting.filter((id) => id !== nearest.id);
            this.enlistees.set(nearest.id, { actor: nearest, steps: new Steps(this.#dressing(nearest)) });
        }

        return nearest ? this.enlistees.get(nearest.id) : null;
    }

    // Every frame, a little more of the buildings being got ready built (the host says which:
    // those near any player, core/host.js); and every so often, the doors of the settlements come
    // to since picked up
    #visit(dt) {
        if (!this.world.interiors) {
            return;
        }

        const until = performance.now() + VISITS.budget;
        let busy = false;

        for (const visit of this.visits.values()) {
            this.#work(visit, until);
            busy ||= Boolean(visit.steps || visit.queue.length);
        }

        // (Then Wenches and Ale's folk, needed only once the player goes in: with any time left,
        // while no other building's being got ready, so that its folk's skins aren't kept waiting
        // behind theirs in the skins worker)
        if (this.tavernFolk && !busy) {
            this.#work(this.tavernFolk, until);
        }

        // The crowds' figures, each made a step at a time, with a share of the time first (world/crowd.js)
        if (this.crowds?.busy) {
            this.crowds.work(Math.min(until, performance.now() + VISITS.budget * MARSHAL.share), { wait: this.waits });
        }

        // The soldiers brought out and the wild's creatures put out, each drawn a step at a time,
        // the nearest the player first, then the townsfolk; a creature's bar over it
        const put = new Set();

        while (performance.now() < until) {
            const next = this.#nextEnlistee(put, busy);

            if (!next) {
                break;
            }

            const { actor, steps } = next;

            if (!steps.take(until, { wait: this.waits })) {
                // (Its skin not yet painted elsewhere: the next nearest meanwhile, and back to
                // them next frame)
                if (steps.waiting) {
                    put.add(actor.id);
                }

                continue;
            }

            this.enlistees.delete(actor.id);

            const avatar = steps.value;

            if (avatar) {
                this.#place(actor);

                if (actor.kind === "beast") {
                    const me = this.battle.actor(this.me);

                    this.hud.track(actor.id, { ...actor, hostile: Boolean(me) && this.battle.hostile(actor, me) });

                    // (A wyvern or the dragon put out near the player comes down out of the sky to
                    // land there: one already flying about, if there is one)
                    const { x, z } = avatar.object.position;
                    const mine = this.avatars.get(this.me)?.object.position;
                    const near = mine && me.map === actor.map && !this.interiors.get(actor.map) && Math.hypot(x - mine.x, z - mine.z) < ARRIVE_WITHIN;

                    if (avatar.winged && near && !actor.dead) {
                        avatar.arrive({ from: this.flyers?.takeAloft(avatar.id, [x, z]) ?? null, ground: this.#groundOn(actor.map, x, z) });

                        // (Its wings heard beating as it flares to land)
                        const wings = CREATURE_VOICES[actor.wild?.creature]?.wings;

                        for (const flare of wings ? CALLS.flare : []) {
                            this.sound?.play(wings, { at: avatar.object.position, delay: flare * (avatar.arrival?.duration ?? 0), far: CALLS.aloft });
                        }
                    }
                }
            }
        }

        this.visitClock -= dt;

        if (this.visitClock <= 0) {
            this.visitClock = VISITS.every;
            this.doors?.sync();
        }
    }

    // --- Growing stronger (core/progress.js) ---

    // The player's progress changed (a rank, loot, trade, gear): told, shown, and kept
    #progressed(event) {
        if (event.id !== this.me) {
            return;
        }

        const actor = this.battle.actor(this.me);

        if (event.type === "rank") {
            const ability = event.ability ? ` You can use ${ABILITIES[event.ability].label.toLowerCase()} now: put it on an action wheel (Game options).` : "";

            this.hud.message(`${TREES[event.tree].name}: ${event.title}!${ability}`, ability ? 5 : 3);
            this.sound?.play("levelUp");
        } else if (event.type === "loot") {
            const things = [event.gold ? `${event.gold} gold` : null, ...event.items.map((item) => itemLabel(item).toLowerCase())].filter(Boolean);

            this.hud.message(`You find ${things.join(", ")}.`, 2.5);
            this.sound?.play(event.gold ? "coins" : "pickup");
        } else if (event.type === "picked" && event.bundle) {
            const things = [event.bundle.gold ? `${event.bundle.gold} gold` : null, ...event.bundle.items.map(thingsOf)].filter(Boolean);

            this.hud.message(`You take ${things.join(", ")}.${event.left ? " There's no room for the rest: it's still there." : ""}`, 2.5);
            this.sound?.play(event.bundle.gold ? "coinPickup" : "pickup");

            // (A chest emptied, its lid shut)
            if (event.from === "chest" && !event.left) {
                this.sound?.play("chestClose", { delay: 0.35 });
            }
        } else if (event.type === "picked") {
            this.hud.message(`You pick up ${thingsOf(event.item)}.`, 2);
            this.sound?.play("pickup");
        } else if (event.type === "spoils" && event.given) {
            this.hud.message("There's no room in your pack: it's at your feet. Tap the sack to take it.", 3);
            this.sound?.play("drop");
        } else if (event.type === "spoils" && event.creature === "convoy") {
            this.hud.message("Your share of the convoy's goods, in gold: tap the sack to take it.", 3);
            this.sound?.play("coins");
        } else if (event.type === "spoils" && event.creature === "chest") {
            // (The dead's, an old relic of theirs in it, named; an adventurer's cache: its lock
            // turned, and its lid up)
            // (A dungeon's boss's hoard: a share of it for each player in the dungeon)
            this.hud.message(event.relic ? `The chest's open, and in your share an old relic of theirs: the ${event.relic}. Tap it to take it.` : event.cache ? "The adventurer's cache is open, your share in it: tap it to take it." : event.hoard ? "The hoard is open, and your share of it lies before you: tap it to take it." : "The chest's open, your share in it: tap it to take it.", event.relic || event.hoard ? 4 : 3);
            this.sound?.play("lockpick");
            this.sound?.play("chestOpen", { delay: 0.45 });
        } else if (event.type === "spoils") {
            this.hud.message(`The ${CREATURES[event.creature]?.name.toLowerCase() ?? "creature"} left something: tap the sack to take it.`, 2.5);
            this.sound?.play("drop");
        } else if (event.type === "bought" || event.type === "sold") {
            this.sound?.play("coins");
        } else if (event.type === "used" && useSound(event.item.id)) {
            this.sound?.play(useSound(event.item.id));
        } else if (event.type === "dropped") {
            this.sound?.play("drop");
        } else if (event.type === "discarded") {
            this.sound?.play("discard");
        }

        if (actor) {
            this.hud.setHealth(this.me, actor.hp, actor.maxHp);
        }

        this.hud.setGold(this.progress.gold);
        this.onProgress(this.progress);

        if (this.pack?.open) {
            this.#showPack();
        }
    }

    // Someone's gear changed: what they wear and carry shown (and how they hold their weapon)
    #regear({ id, weapon, worn }) {
        const avatar = this.avatars.get(id);
        const hero = this.host.players.get(id)?.hero;

        if (!avatar || !hero) {
            return;
        }

        avatar.character.setEquipment(heroEquipment(weapon, worn, hero.parts ?? []));
        avatar.character.sheathe(!this.battle.actor(id)?.armed);
        avatar.actions.setWeapon(guardOf(weapon));
    }

    // --- Standing in their people (core/standing.js) ---

    /**
     * The player's card from the adventurers' guilds (core/standing.js GUILD_RANKS): { title,
     * rank, merit, from, to (null at the top), opens, next (the next rank's row, or null) }; null
     * if they've not registered.
     */
    guildCard() {
        const rank = this.standing.guildRank();

        if (rank === null) {
            return null;
        }

        const { merit, from, to } = this.standing.guildNext();

        return { title: GUILD_RANKS[rank].title, rank, merit, from, to, opens: GUILD_RANKS[rank].opens, next: GUILD_RANKS[rank + 1] ?? null };
    }

    // Their guild card in words, for a guild's talk: its rank ({guildRank}), and how much more
    // merit to the next and what it opens ({guildNext})
    #guildWords() {
        const card = this.guildCard();
        const next = card?.next;

        return {
            guildRank: card?.title ?? "No",
            guildNext: !card ? "" : next ? `${card.to - card.merit} more merit and you're ${next.title}: ${next.opens.charAt(0).toLowerCase()}${next.opens.slice(1)}` : "Mithril! I've never stamped a Mithril card before. Can I... can I touch it?",
            // (What their rank takes off the portals' fares: core/portals.js)
            portalShare: !card ? "Register first, and they're yours to use too!" : card.rank === 0 ? "You're Copper, so it's the full fare for now, I'm afraid. Every rank takes a fifth off!" : fareOff(card.rank) >= 1 ? "And you're Mithril, so you don't pay a copper. Not one!" : `You're ${card.title}, so that's ${Math.round(fareOff(card.rank) * 100)}% off for you!`,
        };
    }

    // Their guild card as it is now: on their plate, and on the talk's card while they're talking
    // to one of a guild's
    #showGuild() {
        const card = this.guildCard();

        this.hud.setGuild(card);

        if (this.talking?.guild) {
            this.talk.setCard(card ?? { title: null });
        }
    }

    // A request taken, moved on, done, failed; a new rank (their people's, or the guilds'); the
    // armoury's gift; counsel given: told, shown in the journal, and kept
    #stood(event) {
        if (event.id !== this.me) {
            return;
        }

        if (event.type === "request") {
            const { change, request } = event;
            const back = `Back to ${request.from.name} in ${request.from.townName}.`;
            const told = {
                taken: `New request: ${request.title}. (J for your journal.)`,
                count: `${request.title}: ${request.count} of ${request.target.need}.`,
                ready: request.kind === "scout" ? `You've seen enough. ${back}` : `${request.title}: done. ${back}`,
                there: {
                    escort: `You've found ${request.target.name}. Stay with them to the end of the road.`,
                    convoy: `You've found ${request.target.name}. Stay with it to the end of the road.`,
                    rout: `You've found the camp outside ${request.target.name}. Bring its soldiers down.`,
                    camp: `You've found the camp outside ${request.target.name}. Bring its soldiers down.`,
                    retake: `You're at the ${request.target.name}. Bring down whoever holds it.`,
                    seize: `You're at the ${request.target.name}. Bring down whoever holds it.`,
                    take: `You're at ${request.target.name}. Get into its ${request.target.quarters ?? "barracks"}, and put down its guardsmen and their captain.`,
                }[request.kind] ?? `You're here to hold ${request.target.name}. Stay till they're gone.`,
                done: `${request.title}: done.${event.reward?.gold ? ` ${event.reward.gold} gold.` : ""}${event.reward?.tome ? ` And the Tome of ${SPELLS[event.reward.tome].label}.` : ""}`,
                failed: `${request.title}: failed. ${request.from.post === "guild" ? "The guild marks it on your card." : "Your standing suffers."}`,
                void: `${request.title}: it's come to nothing.`,
                abandoned: `${request.title}: given up.`,
            }[change];

            if (told) {
                this.hud.message(told, 3);
            }

            // (Taken: written in the journal; done: the cue, and any gold paid)
            const cue = { taken: "quill", done: "questDone", failed: "denied" }[change];

            if (cue) {
                this.sound?.play(cue);
            }
        } else if (event.type === "standing") {
            this.hud.message(`You're ${/^[AEIOU]/.test(event.title) ? "an" : "a"} ${event.title} of your people now. ${STANDINGS[event.rank].opens}`, 4);
            this.sound?.play("levelUp");
        } else if (event.type === "guild") {
            // (Signed up at a guild, their card written; or a new rank in them: what the guilds
            // give at it)
            this.hud.message(event.change === "registered" ? `An adventurer of the guilds, ${event.title} rank: your card's good at every branch.` : `${event.title} rank in the Adventurers' Guild! ${GUILD_RANKS[event.rank].opens}`, 4);
            this.sound?.play(event.change === "registered" ? "quill" : "levelUp");
        }

        this.#showGuild();

        this.hud.setGold(this.progress.gold);
        this.onProgress(this.progress);
        this.onStanding(this.standing);

        if (this.journal?.open) {
            this.#showJournal();
        }

        if (this.pack?.open) {
            this.#showPack();
        }
    }

    /**
     * Where the player is, to carry on from when the game next starts (save.js savePlace): { x, y,
     * facing } out in the world, or outside the door of the building they're in, or where they'll
     * get up if they're down; null if it's someone else's world.
     */
    place() {
        const actor = this.battle.actor(this.me);

        if (!actor || this.remote) {
            return null;
        }

        if (actor.dead) {
            return actor.spawnMap === "town" && actor.spawn ? { x: actor.spawn[0] + 0.5, y: actor.spawn[1] + 0.5, facing: actor.facing } : null;
        }

        if (actor.map === "town") {
            return { x: actor.x, y: actor.y, facing: actor.facing };
        }

        const entrance = this.world.interiors?.of(actor.map)?.entrance;
        const outside = entrance?.outside ?? this.world.tavern?.outside;

        return outside ? { x: outside[0] + 0.5, y: outside[1] + 0.5, facing: entrance?.facing ?? actor.facing } : null;
    }

    /**
     * How the player is, to carry on so next time (core/host.js vitalsOf: kept with where they are,
     * save.js saveVitals), or null (a world joined: kept by its host).
     */
    vitals() {
        return this.remote ? null : this.host.vitalsOf(this.me);
    }

    // Where the player is in the world ([x, y] metres): out in it, or at the door of the building they're in
    #whereAmI() {
        const actor = this.battle.actor(this.me);

        if (!actor) {
            return null;
        }

        if (actor.map === "town") {
            return [actor.x, actor.y];
        }

        const door = this.world.interiors?.of(actor.map)?.entrance?.door ?? this.world.tavern?.door;

        return door ? [door.x, door.z] : null;
    }

    /** Open the journal (or close it, if it's open): where the player stands, and what they've been asked. */
    toggleJournal() {
        if (this.journal?.open) {
            this.closeJournal();
        } else {
            this.closePack();
            this.closeSpellbook();
            this.#showJournal();
            this.sound?.play("bookOpen");
        }
    }

    /** Open the spellbook (or close it, if it's open): the player's magic, school by school. */
    toggleSpellbook() {
        if (this.spellbook?.open) {
            this.closeSpellbook();
        } else {
            this.closePack();
            this.closeJournal();
            this.#showSpellbook();
            this.sound?.play("bookOpen");
        }
    }

    /** Close the spellbook. */
    closeSpellbook() {
        this.spellbook?.hide();
    }

    // The spellbook as it is now
    #showSpellbook() {
        const progress = this.progress;
        const known = progress.known();
        const weapon = progress.gear.weapon;
        const spellOf = (id, extra = {}) => {
            const { label, about, tier = null, cooldown, castTime, target, needs = null } = SPELLS[id];

            return { id, label, about, tier, known: known.includes(id), cooldown, castTime, target, needs, ...extra };
        };

        this.spellbook.show({
            boost: ITEMS[weapon?.id]?.magic && weapon.boost ? { label: itemLabel({ id: weapon.id, quality: weapon.quality }), share: (1 + weapon.boost) * (ITEMS[weapon.id].spellTimes ?? 1) - 1 } : null,
            schools: Object.entries(SCHOOLS).map(([id, { label, tiers, xp }]) => {
                const { xp: has, from, to } = progress.toNextTier(id);
                const tier = progress.tierOf(id);
                // (An element not yet open: its first spell from its tome, bought at the guild)
                const opened = progress.opened(id);
                const tome = opened ? null : { label: `Tome of ${SPELLS[tiers[0]].label}`, price: ELEMENT_TOME_PRICE };

                return { id, label, tier, last: tiers.length, xp: has, from, to, next: to === null ? null : SPELLS[tiers[tier]].label, opened, tome, spells: tiers.map((spell, k) => spellOf(spell, tome && k === 0 ? { from: `the ${tome.label}` } : { at: `${xp[k]} ${label}` })) };
            }),
            hexes: ["stun", "hold"].map((id) => spellOf(id, { at: "Hexes: Adept" })),
            tomes: progress.spells.filter((id) => SPELLS[id]?.tome).map((id) => {
                const grows = SPELLS[id].grows;
                const level = grows ? progress.levelOf(id) : null;

                return spellOf(id, { level, growth: grows ? { xp: progress.spellXp[id] ?? 0, from: GROWTH_XP[level - 1], to: GROWTH_XP[level] ?? null } : null });
            }),
            more: TOMES.filter((id) => !progress.spells.includes(id)).length,
        });
    }

    /** Close the journal. */
    closeJournal() {
        this.journal?.hide();
    }

    // The journal as it is now
    #showJournal() {
        const war = this.host.war;
        const standing = this.standing;
        const rank = standing.rank();
        const { points, from, to } = standing.toNext();
        const at = this.#whereAmI();
        const liege = war?.liege(this.self.realm);
        const realm = war?.realm(this.self.realm);
        const people = (id) => `the ${peopleOf(id)}`;

        this.journal.show({
            standing: { title: standing.title(), points, from, to, opens: STANDINGS[rank].opens, next: STANDINGS[rank + 1] ?? null },
            guild: this.guildCard(),
            requests: standing.requests.map((request) => {
                const where = whereTo(request, war);

                return {
                    id: request.id,
                    title: request.title,
                    from: `${request.from.name}, ${request.from.title.toLowerCase()}, ${request.from.townName}`,
                    text: request.text,
                    progress: progressOf(request),
                    where: where.at && at ? bearing(at, where.at) : "",
                    left: request.until === null || !war ? "" : `${Math.max(0, request.until - war.turn)} min left`,
                };
            }),
            people: realm
                ? {
                      name: realm.name,
                      ruler: `${realm.leader.title} ${realm.leader.name}`,
                      seat: war.town(realm.seat)?.name ?? "nowhere",
                      war: war.enemiesOf(liege).map(people),
                      allies: war.realms.filter((other) => other.alive && other.id !== realm.id && war.friendly(realm.id, other.id)).map(({ id }) => people(id)),
                      towns: war.towns.filter(({ owner }) => owner === realm.id).length,
                      // (Their works, their stores, and those of theirs another people or brigands
                      // hold: docs/WAR.md *The works*)
                      works: war.works.filter(({ owner, held }) => owner === realm.id && !held).length,
                      stores: RESOURCES.map((resource) => `${Math.floor(realm.stores?.[resource] ?? 0)} ${resource}`).join(", "),
                      lost: war.works
                          .filter(({ race, owner, held }) => race === realm.id && (held || owner !== realm.id))
                          .map((works) => `${works.held ? "Brigands hold" : `${people(works.owner)[0].toUpperCase()}${people(works.owner).slice(1)} hold`} the ${works.name} ${works.kind}.`),
                      regard: war.realms
                          .filter((other) => other.alive && war.liege(other.id) !== liege && war.relation(other.id, realm.id) !== "unknown")
                          .map((other) => ({ name: people(other.id), ...regardOf(other.standing[realm.id] ?? 0) })),
                      fate: this.#fateLine(realm),
                  }
                : null,
            done: standing.done.slice(0, 6).map(({ title, from: giver, state }) => ({ title, from: giver.townName, state })),
            company: [...this.host.followers]
                .filter(([, { leader }]) => leader === this.me)
                .map(([id, { name, calling, waiting }]) => {
                    const actor = this.battle.actor(id);

                    return { name, calling, hp: actor?.hp ?? 0, maxHp: actor?.maxHp ?? 1, waiting };
                }),
            most: this.host.mostFollowers(this.me),
        });
    }

    // Where the player's people stand in the war's end (docs/WAR.md M10), in a line: serving
    // another, or fallen, and how near they are to rising; ruling the continent; or another's
    // ruling it. Null if none of these
    #fateLine(realm) {
        const war = this.host.war;
        const people = (id) => `the ${peopleOf(id)}`;
        const oppressor = war.oppressor(realm.id);
        const rising = `${Math.round(((realm.unrest ?? 0) / RISING.ready) * 100)}% of the way to rising`;

        if (war.victor === realm.id) {
            return "Your people rule the continent. Every other people serves them.";
        }

        if (oppressor && realm.alive) {
            return `You serve ${people(oppressor)}${war.victor === oppressor ? ", who rule the continent" : ""}. Your people are ${rising}.`;
        }

        if (oppressor) {
            return `Your people have fallen; ${people(oppressor)} hold most of their old towns. They're ${rising} again.`;
        }

        return war.victor ? `${people(war.victor)[0].toUpperCase()}${people(war.victor).slice(1)} rule the continent.` : null;
    }

    /**
     * Everyone else playing in the world (docs/WAR.md M11): { id, name, people ("Elves"), hostile
     * (their people at war with the player's) }.
     */
    others() {
        return [...this.host.players.values()]
            .filter(({ id }) => id !== this.me)
            .map((player) => ({ id: player.id, name: player.hero.name, people: peopleOf(player.realm), hostile: Boolean(this.host.war?.hostile(this.self.realm, player.realm)) }));
    }

    /**
     * The world as it now is, set right after it went astray (docs/WAR.md M11: a joined game's
     * copy, sent again): everyone in it drawn as they now are, and the buildings got ready that
     * weren't.
     */
    rehost() {
        this.battle = this.host.battle;

        for (const actor of this.battle.actors) {
            if ((actor.kind === "soldier" || actor.kind === "wagon") && !this.avatars.has(actor.id) && !this.enlisting.includes(actor.id) && !this.enlistees.has(actor.id)) {
                this.enlisting.push(actor.id);
            }
        }

        for (const key of this.host.open.keys()) {
            const building = this.world.interiors?.buildings.get(key);

            if (building && !this.visits.has(key)) {
                this.#prepare(building);
            }
        }

        this.#mirror();
    }

    /** Open the pack (or close it, if it's open): the player's skills, gear, and what they carry. */
    togglePack() {
        if (this.pack?.open) {
            this.closePack();
        } else {
            this.closeJournal();
            this.closeSpellbook();
            this.#showPack();
            this.sound?.play("packOpen");
        }
    }

    /** Close the pack (and stop trading). */
    closePack() {
        // (Its strap buckled, if it was open)
        if (this.pack?.open) {
            this.sound?.play("packClose");
        }

        this.#stopShopping();
        this.pack?.hide();

        // (Trading with another player: closed, it's called off)
        if (this.#tradeNow()) {
            this.#command({ type: "cancel" });
        }
    }

    // The trade the player's in with another player (host.js trades: both said yes), if any
    #tradeNow() {
        return [...(this.host.trades?.values() ?? [])].find((trade) => trade.open && (trade.from === this.me || trade.to === this.me)) ?? null;
    }

    // Ask another player to trade (or say yes to their asking), walking up to them first if
    // they're further off than trading's done from
    #tradeWith(other, { run = false } = {}) {
        const player = this.battle.actor(this.me);

        if (!player || player.dead || other.dead) {
            return;
        }

        this.#endTalk();

        if (player.map !== other.map || Math.hypot(player.x - other.x, player.y - other.y) > TRADE.reach - 0.5) {
            this.approaching = other.id;
            this.#command({ type: "approach", target: other.id, run });

            return;
        }

        this.approaching = null;
        this.#command({ type: "stop" });
        this.#command({ type: "trade", with: other.id }, (result) => {
            if (!result.ok) {
                this.hud.message(REFUSALS[result.reason] ?? "Can't do that.", 1.6);
                this.sound?.play("denied");
            }
        });
    }

    // How a trade with another player's going (host.js "trade" events): told, the pack showing it
    #traded(event) {
        if (event.id !== this.me) {
            return;
        }

        const them = event.name ?? "They";

        switch (event.change) {
            case "asked":
                if (event.from === this.me) {
                    this.hud.message(`You ask ${them} to trade.`, 2);
                } else {
                    this.hud.offer(`${them} would trade with you.`, "Trade", () => {
                        const other = this.battle.actor(event.with);

                        if (other) {
                            this.#tradeWith(other);
                        }
                    }, TRADE.asking / 1000);
                    this.sound?.play("wake");
                }

                return;
            case "open":
                this.closeJournal();
                this.#stopShopping();
                this.hud.message(`Trading with ${them}: offer what you will, then agree.`, 3);
                break;
            case "offer":
                if (event.by !== this.me) {
                    this.hud.message(`${them} changes their offer.`, 1.6);
                }

                break;
            case "agreed":
                if (event.by !== this.me) {
                    this.hud.message(`${them} agrees. Agree too, and it's done.`, 2.5);
                }

                break;
            case "failed":
                this.hud.message(event.reason === "full" ? (event.short === this.me ? "You haven't room for all that." : `${them} hasn't room for all that.`) : event.short === this.me ? "Something you offered isn't there any more." : `Something ${them} offered isn't there any more.`, 3);
                this.sound?.play("denied");
                break;
            case "done": {
                const got = [event.got.gold ? `${event.got.gold} gold` : null, ...event.got.items.map(thingsOf)].filter(Boolean);

                this.hud.message(`You trade with ${them}${got.length ? `: you get ${got.join(", ")}` : ""}.`, 3);
                this.sound?.play("tradeDone");
                this.hud.setGold(this.progress.gold);
                this.onProgress(this.progress);
                break;
            }
            case "off": {
                const told = {
                    cancelled: event.by === this.me ? (event.open ? "You call the trade off." : null) : event.open ? `${them} calls the trade off.` : `${them} won't trade just now.`,
                    apart: event.open ? `The trade's off: you and ${them} have parted.` : null,
                    unanswered: null,
                    left: `${them} has gone: the trade's off.`,
                }[event.why];

                if (told) {
                    this.hud.message(told, 2.5);
                }

                break;
            }
            default:
                break;
        }

        // (The pack showing the trade as it is now: opened for it, or as it was once it's over)
        if (event.change === "open" || this.pack?.open) {
            this.#showPack();
        }
    }

    // Trade with a shopkeeper: the pack open, their wares in it
    #openShop({ shop, keeper, name }) {
        this.closeJournal();
        this.shopping = { shop, keeper, name, people: this.host.folk.get(keeper)?.people ?? "human" };
        this.#showPack();
    }

    // Done trading with a shopkeeper: they're let go, back about their business (they were kept
    // standing for it, as they are talking: #endTalk), unless the player's talking to them again
    #stopShopping() {
        const keeper = this.shopping?.keeper;

        this.shopping = null;

        if (keeper && this.talking?.id !== keeper) {
            this.#command({ type: "talk", with: null });
        }
    }

    // The pack as it is now (and the shop's wares, trading)
    #showPack() {
        const progress = this.progress;
        const { haggle } = progress.bonuses();
        const skills = Object.entries(TREES).map(([tree, { name, grows, abilities }]) => {
            const rank = progress.rank(tree);
            const { xp, from, to } = progress.toNext(tree);
            const learnt = Object.entries(abilities).filter(([at]) => rank >= Number(at)).map(([, ability]) => ABILITIES[ability].label);

            return { tree, name, rank, title: ["Untried", "Trained", "Adept", "Veteran", "Master", "Legend"][rank], xp, from, to, grows, ability: learnt.length ? `Learnt: ${learnt.join(", ")}` : null };
        });
        // Each slot of the paperdoll: what's in it and what it does; the off hand greyed out behind
        // a two-handed weapon (but for a bow's quiver)
        const held = progress.gear.mainHand?.id ?? null;
        const gear = GEAR_SLOTS.map(({ id: slot, label, takes }) => {
            const piece = progress.gear[slot];
            const item = piece && { ...piece, label: itemLabel(piece) };

            return { slot, label, takes, item: item && { ...item, info: describe(piece, progress, { label: item.label, haggle }) }, locked: slot === "offHand" && !offHandFree(held) && !GEAR[held]?.quiver, only: slot === "offHand" && GEAR[held]?.quiver ? "Quiver" : null };
        });
        const pack = progress.pack.map((stack, index) => {
            if (!stack) {
                return null;
            }

            const def = ITEMS[stack.id];
            const label = itemLabel(stack);

            return { ...stack, label, about: aboutOf(stack), use: def.use ? (def.tome || def.scroll ? "Read" : stack.id === "meal" || def.food ? "Eat" : "Drink") : null, equip: def.slot ? (def.slot === "mainHand" ? "Wield" : "Wear") : null, takes: def.slot ?? null, price: priceOf(stack, { haggle, selling: true }), wanted: !this.shopping || buys(this.shopping.shop, stack.id), info: def.slot ? describe(stack, progress, { index, label, haggle }) : null };
        });
        const me = this.battle.actor(this.me);
        const summed = totals(progress, { hp: me ? me.maxHp - progress.bonuses().hp : 50, stamina: me ? me.maxStamina - progress.bonuses().stamina : 50 });
        // (A shop's wares by kind, the commoner made first; what it won't buy, said; what one is,
        // worked out as it's looked at: a piece of gear's with what's rolled on it as it's bought)
        const shop = this.shopping && {
            name: this.shopping.name,
            wares: wares(this.shopping.shop, this.shopping.people)
                .sort(shopOrder)
                .map((item) => {
                    const price = priceOf(item, { haggle });

                    return { item, label: itemLabel(item), price, affordable: price <= progress.gold, kind: WARE_KINDS[wareKind(item.id)] };
                }),
            unwanted: this.shopping.shop === "guild" ? null : "Only the adventurers' guild buys tomes and the spoils of the wild.",
            preview: (item) => ({ about: aboutOf(item), info: ITEMS[item.id]?.slot ? describe(item, progress, { label: itemLabel(item), haggle, ware: true }) : null }),
        };

        const trade = this.#tradeNow();
        const other = trade && (trade.from === this.me ? trade.to : trade.from);
        // (What each offers, each thing with what it is: gear as if it were carried)
        const offer = (side) => ({
            gold: side?.gold ?? 0,
            items: (side?.items ?? []).map((item) => ({ ...item, label: itemLabel(item), about: aboutOf(item), info: ITEMS[item.id]?.slot ? describe(item, progress, { label: itemLabel(item), haggle, outside: true }) : null })),
        });

        this.pack.show({
            gold: progress.gold,
            skills,
            gear,
            totals: summed,
            pack,
            shop,
            trade: trade && { name: this.host.players.get(other)?.hero.name ?? "them", mine: offer(trade.offers[this.me]), theirs: offer(trade.offers[other]), agreed: { mine: Boolean(trade.agreed[this.me]), theirs: Boolean(trade.agreed[other]) } },
        });
    }

    // Something asked of the pack: done by the host, or why not said (with whoever's being traded
    // with, buying or selling). Something thrown away can be taken back a moment after. A piece
    // put on or taken off is heard by what it's made of (the piece known before the pack changes).
    #packCommand(asked) {
        const command = asked.type === "buy" ? { ...asked, from: this.shopping?.keeper } : asked.type === "sell" ? { ...asked, to: this.shopping?.keeper } : asked;
        const worn = asked.type === "equip" ? this.progress.pack[asked.index] : asked.type === "unequip" ? this.progress.gear[asked.slot] : null;

        return this.#command(command, (result) => {
            if (!result.ok) {
                this.hud.message(REFUSALS[result.reason] ?? CAST_FAILURES[result.reason] ?? "Can't do that.", 1.6);
                this.sound?.play(result.reason === "gold" ? "buyDenied" : "denied");
            } else {
                const handled = worn ? wearSound(worn) : command.type === "undiscard" ? "pickup" : null;

                if (handled) {
                    this.sound?.play(handled);
                }

                // (The gold shown at once, and what's carried kept: the events it made are heard
                // with the next step, and moving things about makes none)
                this.hud.setGold(this.progress.gold);
                this.onProgress(this.progress);

                if (command.type === "discard" && result.item) {
                    this.hud.offer(`Thrown away: ${thingsOf(result.item)}.`, "Undo", () => this.#packCommand({ type: "undiscard" }), UNDO_MS / 1000);
                }
            }

            if (this.pack.open) {
                this.#showPack();
            }
        });
    }

    // A thing to use put on the player's own action wheel, in its first empty slice (unless it's
    // on one already), and kept
    // Something put on an action wheel (an ACTIONS key, or "item:" and a thing to use): the
    // player's own (`wheel`: "self"), or an enemy's; at the first empty slice
    #putOnWheel(key, wheel = "self") {
        const label = actionOf(key)?.label ?? itemLabel({ id: key.slice(5) });
        const whose = wheel === "self" ? "your own wheel" : "an enemy's wheel";
        const where = (side, place) => `${whose} ${side ? "two" : "one"}, at ${place.toUpperCase()}`;
        const sides = this.wheels[wheel];

        for (let side = 0; side < SIDES; side++) {
            const place = PLACES.find((each) => sides[side][each] === key);

            if (place) {
                this.hud.message(`${label} is on ${where(side, place)} already.`, 3);

                return;
            }
        }

        for (let side = 0; side < SIDES; side++) {
            const place = PLACES.find((each) => !sides[side][each]);

            if (place) {
                sides[side][place] = key;
                this.setWheels(this.wheels);
                this.hud.message(`${label} put on ${where(side, place)}.`, 3);

                return;
            }
        }

        this.hud.message(`${wheel === "self" ? "Your own" : "An enemy's"} wheels are full: change them in Game options, Action wheels.`, 3.5);
    }

    // Go and pick up something dropped on the ground: at once if the player's near it, or once
    // they've walked there
    #pickUp(id, { run = false } = {}) {
        const dropped = this.host.ground.get(id);
        const me = this.battle.actor(this.me);

        if (!dropped || !me || me.dead) {
            return;
        }

        if (dropped.map === me.map && Math.hypot(me.x - dropped.square[0] - 0.5, me.y - dropped.square[1] - 0.5) <= PICK_REACH) {
            this.#packCommand({ type: "pickUp", ground: id });

            return;
        }

        const [ox, oz] = this.originOf(dropped.map);

        this.picking = id;
        this.#command({ type: "move", to: [...dropped.square], run });
        this.effects.markTarget(ox + dropped.square[0] + 0.5, oz + dropped.square[1] + 0.5);
    }

    // What's dropped near the player drawn; and something they've walked up to, picked up
    #drawDrops() {
        const me = this.battle.actor(this.me);

        if (!this.drops || !me) {
            return;
        }

        const [ox, oz] = this.originOf(me.map);

        this.drops.sync(this.host.ground, { map: me.map, near: { x: ox + me.x, z: oz + me.y }, reach: DRAW_REACH, originOf: (map) => this.originOf(map), mine: this.me });
        this.drops.update(this.clock ?? 0);

        const picking = this.picking && this.host.ground.get(this.picking);

        if (this.picking && !picking) {
            this.picking = null;
        } else if (picking && picking.map === me.map && Math.hypot(me.x - picking.square[0] - 0.5, me.y - picking.square[1] - 0.5) <= PICK_REACH) {
            this.picking = null;
            this.#packCommand({ type: "pickUp", ground: picking.id });
        }
    }

    // A thing's icon painted for the world (over something dropped): made once for each kind, and
    // filled in once its picture's drawn
    #itemPicture(id) {
        this.itemPictures ??= new Map();

        if (!this.itemPictures.has(id)) {
            const canvas = document.createElement("canvas");
            const texture = new THREE.CanvasTexture(canvas);
            const image = new Image();

            canvas.width = canvas.height = 128;
            texture.colorSpace = THREE.SRGBColorSpace;
            image.onload = () => {
                canvas.getContext("2d").drawImage(image, 0, 0, 128, 128);
                texture.needsUpdate = true;
            };
            image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(itemPicture(id))}`;
            this.itemPictures.set(id, texture);
        }

        return this.itemPictures.get(id);
    }

    // A town's soldiers out: to be drawn, and its banners up, in its holders' colours
    #muster({ town, people, ids, banners, braziers = [] }) {
        const [ox, oz] = this.originOf("town");

        this.enlisting.push(...ids);
        this.banners?.raise(
            town,
            people,
            banners.map(({ at: [x, y], facing }) => ({ x: ox + x, z: oz + y, facing })),
            braziers.map(({ at: [x, y] }) => ({ x: ox + x, z: oz + y })),
        );
    }

    // A camp (or a supply depot) near the player pitched: its tents and fire (a depot's stores by
    // it), its banner by the fire, and its sentries to be drawn
    #pitch({ camp, people, ids, fire, tents, stores = [] }) {
        const [ox, oz] = this.originOf("town");
        const [fx, fy] = fire;
        const placed = (list) => list.map(({ at: [x, y], facing }) => ({ at: [ox + x, oz + y], facing }));

        this.camps?.pitch(camp, people, { fire: [ox + fx, oz + fy], tents: placed(tents), stores: placed(stores) });
        this.banners?.raise(`camp:${camp}`, people, [{ x: ox + fx + 2.2, z: oz + fy + 2.2, facing: 0 }]);
        this.enlisting.push(...ids);
    }

    // A camp struck (its tents down, its sentries gone)
    #strike({ camp, ids }) {
        this.camps?.strike(camp);
        this.banners?.lower(`camp:${camp}`);
        this.#unenlist(ids);

        for (const id of ids) {
            this.#undress(id);
        }
    }

    // The player's people's army's supplies not getting through (docs/WAR.md *Supply*): told, to a
    // Knight or above (who counsel where it marches, and from a Lord order it)
    #supplyCut({ type, realm, missed, deserted, why }) {
        if (!["unsupplied", "starved"].includes(type) || realm !== this.self?.realm || this.standing.rank() < OPENS.march) {
            return;
        }

        const said =
            type === "starved"
                ? "Our army's supplies were cut off too long: it has broken up."
                : missed === 1
                  ? `Our army's supplies haven't got through${why === "unpaid" ? ": there's no gold to pay for them" : why === "cut off" ? ": there's nowhere to send them from" : ""}.`
                  : `Our army's supplies are cut off again: ${deserted} have deserted.`;

        this.hud.message(said, 4);
        this.sound?.play("newsHeard");
    }

    // An envoy near the player at the end of their road, or waylaid on it: the player told
    #envoyed({ people, to, over, by }) {
        const theirs = `The ${ADJECTIVES[people] ?? people} envoy`;

        this.hud.message(over === "arrived" ? `${theirs} has reached the ${peopleOf(to)}.` : `${theirs} to the ${peopleOf(to)} has been struck down${by ? ` by the ${peopleOf(by)}` : ""}!`, 4);
        this.sound?.play("newsHeard");
    }

    // The fortifications standing near the player drawn (world/forts3d.js), each turned with its
    // front (its door, its gate) towards home, away from the enemy it faces, its people's banner
    // by it; those far off, or gone, let go
    #syncForts() {
        const war = this.host?.war;
        const me = this.battle.actor(this.me);

        if (!war?.forts || !me || !this.forts3d) {
            return;
        }

        const [ox, oz] = this.originOf("town");
        const forts =
            me.map === "town"
                ? war.forts.map((fort) => {
                      const toward = war.town(fort.toward)?.at;

                      return { id: fort.id, kind: fort.kind, realm: fort.realm, at: [ox + fort.at[0], oz + fort.at[1]], facing: toward ? Math.atan2(fort.at[0] - toward[0], fort.at[1] - toward[1]) : 0 };
                  })
                : [];
        const { added, gone } = this.forts3d.sync(forts, [ox + me.x, oz + me.y]);

        for (const { id, kind, realm, at: [x, z], facing } of added) {
            const [out, side] = kind === "garrison" ? [6.4, 2.4] : [3.2, 1.6];

            this.banners?.raise(`fort:${id}`, realm, [{ x: x + Math.sin(facing) * out + Math.cos(facing) * side, z: z + Math.cos(facing) * out - Math.sin(facing) * side, facing }]);
        }

        for (const id of gone) {
            this.banners?.lower(`fort:${id}`);
        }
    }

    // A fortification near the player let go from the battle: far off now, or razed (said, and its
    // stone taken down: #syncForts)
    #fortDown({ fort: id, razed = false, kind, people, by = null }) {
        this.#undress(id);

        if (razed) {
            const name = `${ADJECTIVES[people] ?? people} ${kind === "garrison" ? "forward garrison" : "guard tower"}`;

            this.hud.message(by && by === this.self?.realm ? `The ${name} is razed!` : `The ${name} has fallen!`, 3);
            this.sound?.play("newsHeard");
            this.fortsClock = 0;
        }
    }

    // A convoy met on the road near the player, in with its goods, or fallen on (host.js
    // #meetConvoy, #watchConvoys, #convoyFell): its wagons emptied once its goods are in; said, if
    // it's near the player, or it's their people's, or theirs who fell on it
    #convoyed({ convoy: id, people, over, by = null, wagons = [], cargo = null }) {
        const met = this.host.convoys.get(id);
        const me = this.battle.actor(this.me);
        const mine = this.self?.realm;
        const near = Boolean(met) && me?.map === "town" && Math.hypot(me.x - met.at[0], me.y - met.at[1]) <= CONVOY_NEAR.far;

        if (over === "arrived") {
            for (const wagon of wagons) {
                this.avatars.get(wagon)?.wagon?.setLoad(null);
            }
        }

        if (!met || over === "home" || (!near && !(over === "plundered" && (people === mine || by === mine)))) {
            return;
        }

        const war = this.host.war;
        const [load, amount] = Object.entries(cargo ?? met.cargo ?? {})[0] ?? [null, 0];
        const works = war?.workAt(met.works);
        const town = war?.town(met.to)?.name ?? "their seat";
        const theirs = people === mine ? "our convoy" : `the ${ADJECTIVES[people] ?? people} convoy`;
        const Theirs = `${theirs[0].toUpperCase()}${theirs.slice(1)}`;

        if (over === "met") {
            this.hud.message(load ? `${people === mine ? "Our" : `A ${ADJECTIVES[people] ?? people}`} convoy of ${Math.round(amount)} ${load} is on the road to ${town}.` : `${people === mine ? "Our" : `A ${ADJECTIVES[people] ?? people}`} convoy is on the road back to ${works ? `the ${works.name} ${works.kind}` : "its works"}, empty.`, 3);
        } else if (over === "arrived") {
            this.hud.message(`${Theirs} has brought its ${load ?? "goods"} in to ${town}.`, 3);
        } else if (by === mine) {
            this.hud.message(`We've taken ${theirs}'s ${load ?? "goods"}: half of it to our stores.`, 4);
            this.sound?.play("newsHeard");
        } else {
            this.hud.message(`${Theirs} has been fallen on${by ? ` by the ${peopleOf(by)}` : ""}, and its ${load ?? "goods"} carried off!`, 4);
            this.sound?.play("newsHeard");
        }
    }

    // Start building a building the host's got ready: each floor and each of its folk, one to a
    // piece of work, and the doors told of its insides
    #prepare(building) {
        const visit = { key: building.key, queue: [], maps: [], folk: [] };

        visit.queue.push(...building.maps.map((id) => () => this.#furnishing(visit, id)));
        visit.queue.push(...(this.host.open.get(building.key) ?? []).map((id) => () => this.#people(visit, id)));
        visit.queue.push(() => this.doors?.sync());
        this.visits.set(building.key, visit);

        return visit;
    }

    // A building ready to go into now: whatever of it's still to build, built at once
    #ready(key) {
        const building = key ? this.world.interiors?.buildings.get(key) : null;

        // (Wenches and Ale's floors built with the town: any of its folk not dressed yet, now)
        if (!building?.entrance) {
            if (key && this.tavernFolk?.key === key) {
                this.#work(this.tavernFolk);
            }

            return;
        }

        this.#work(this.visits.get(key) ?? this.#prepare(building));
    }

    // Do what can be done of a building's getting ready before `until` (performance.now()'s; all
    // of it, without): each piece of work at once, or a step at a time if it's in steps (its folk;
    // one waiting on work done elsewhere, a skin, come back to next frame)
    #work(visit, until = Infinity) {
        while ((visit.steps || visit.queue.length) && performance.now() < until) {
            if (!visit.steps) {
                const work = visit.queue.shift()();

                visit.steps = typeof work?.next === "function" ? new Steps(work) : null;
            }

            if (visit.steps?.take(until, { wait: this.waits && until !== Infinity })) {
                visit.steps = null;
            } else if (visit.steps?.waiting) {
                return;
            }
        }
    }

    // One of a building's floors, built a step at a time and put away until the player goes in
    *#furnishing(visit, mapId) {
        const interior = yield* buildingInterior(this.world.maps[mapId]);

        interior.object.visible = this.mapId === mapId;
        this.view.scene.add(interior.object);
        this.interiors.set(mapId, interior);
        visit.maps.push(mapId);
    }

    // One of a building's folk (by id), drawn where they are in it, a step at a time
    *#people(visit, id) {
        const actor = this.battle.actor(id);

        if (!actor || this.avatars.has(id)) {
            return;
        }

        if (yield* this.#dressing(actor)) {
            this.#place(actor);
            visit.folk.push(id);
        }
    }

    // A building the host's let go: its folk no longer drawn, its floors thrown away (built again
    // if it's got ready again)
    #release(key) {
        const visit = this.visits.get(key);

        if (!visit) {
            return;
        }

        this.visits.delete(key);

        for (const id of visit.folk) {
            this.#undress(id);
        }

        for (const id of visit.maps) {
            this.interiors.get(id)?.dispose();
            this.interiors.delete(id);
            this.minimap?.forget(id);
        }
    }

    // What's heard on a map: its own sound (a taproom's, upstairs'), or the map's
    #soundOf(mapId) {
        return this.world.maps?.[mapId]?.sound ?? mapId;
    }

    // Show one map (the town, or a floor inside), lit for being out or in, and nothing of the others
    #showMap(mapId) {
        const interior = this.interiors.get(mapId) ?? null;

        // (Spells on a map left gone, not those where they've come to on this one: carried
        // across it by magic; and the view's lamps lent to their flashes only out of doors)
        if (this.spellFx) {
            if (mapId !== this.mapId) {
                this.spellFx.clear();
            }

            this.spellFx.lit = !interior;
        }

        this.mapId = mapId;

        this.town.object.visible = !interior;

        for (const outside of [this.ground, this.chunks?.object]) {
            if (outside) {
                outside.visible = !interior;
            }
        }

        // Everyone else here where they are now (they weren't moved while out of sight; those still
        // being drawn, a step at a time, are put there when they are)
        for (const actor of this.battle.actors) {
            if (actor.map === mapId && actor.id !== this.me && this.avatars.has(actor.id)) {
                this.#place(actor);
            }
        }

        for (const [id, each] of this.interiors) {
            each.object.visible = id === mapId;
        }

        this.view.setIndoors(interior);
        this.view.setOccluders(interior ? null : this.occluders);
        this.#setGround(interior ? null : this.groundOf(mapId));
        this.minimap?.setMap(this.world.maps[mapId]);

        // The tavern's music inside, heard through the floor upstairs; the town's out; and the
        // hearth's fire crackling in the taproom
        this.sound?.setPlace(this.#soundOf(mapId));
        this.sound?.setHearth(interior?.hearth ?? null);

        if (this.running) {
            this.sound?.setAmbient(!interior);
        }

        this.#hearAround(0, { now: true });

        if (this.squares?.object.visible) {
            this.showSquares(true);
        }
    }

    // The trees whose leaves can be heard: the town's, and those of the world drawn round it
    #hearTrees() {
        this.sound?.setTrees([...this.townTrees, ...(this.chunks?.trees() ?? [])]);
    }

    // Indoors: the walls and anything tall in front of the player cut away (and the ceiling
    // not drawn while the camera's over it), the fires and the spit turning, the flames flickering (the two lighting the player most the view's lamps,
    // lighting them), embers rising from the hearth; and, in or out, the glow round the doors and
    // stairs the player's making for
    #inside(dt) {
        const interior = this.interiors.get(this.mapId);
        const player = this.battle.actor(this.me);

        if (interior) {
            const at = this.avatars.get(this.me).object.position;

            cutFor(interior.map, at, this.view.camera.position);
            interior.seenFrom(this.view.camera.position);
            interior.update(dt, this.clock);
            INTERIOR_GLOW.scale.value = this.view.pixelsPerMetre();
            this.view.flicker(this.clock, _lit.set(at.x, at.y + 1.2, at.z));

            if (interior.hearth && Math.random() < dt * EMBERS) {
                const { x, y, z } = interior.hearth;

                this.effects.burst("embers", _hearth.set(x + (Math.random() - 0.5) * 0.6, y, z + (Math.random() - 0.5) * 1.2));
            }
        }

        this.doors?.update(dt, this.clock, { map: this.mapId, heading: player?.order?.type === "enter" ? player.order.link : null });

        const me = this.avatars.get(this.me)?.object.position;

        if (me) {
            this.flyers?.update(dt, this.clock, { x: me.x, z: me.z }, { outdoors: !interior });

            for (const flier of interior ? [] : (this.flyers?.aloft ?? [])) {
                this.#aloft(flier);
            }
        }
    }

    // The dragons' lairs a dragon's to be seen circling over: those whose dragon's alive (as far as
    // this game knows) and isn't down on the ground near its lair to be fought
    #lairsAloft() {
        const onGround = [...this.avatars.values()].filter((avatar) => avatar.id === "dragon").map((avatar) => avatar.object.position);

        return this.world.plan.sites.filter((site) => site.kind === "dragon's lair" && (this.host?.slain?.[site.id] ?? -Infinity) <= this.battle.time && !onGround.some(({ x, z }) => Math.hypot(x - site.at[0], z - site.at[1]) < 250));
    }

    // --- What happened in the battle ---

    #handle(events) {
        const { battle, hud, effects } = this;

        // (A spell's "hit"s are told in the same step as its "spell")
        this.struck.clear();

        for (const event of events) {
            if (HOST_EVENTS.has(event.type)) {
                this.#hear(event);
                continue;
            }

            // (Something lying on the ground, or gone from it: no one's)
            if (event.type === "hazard") {
                if (event.change === "on") {
                    this.grounds.set(event.hazard, event);

                    if (event.map === this.mapId) {
                        const [ox, oz] = this.originOf(event.map);

                        this.spellFx.ground(new THREE.Vector3(ox + event.x, 0, oz + event.y), event.kind, event.radius, (event.until - battle.time) / 1000);
                    }
                } else {
                    this.grounds.delete(event.hazard);
                }

                continue;
            }

            // (A projectile gone astray, its target gone or through a door: no one's, out of the air)
            if (event.type === "fizzle") {
                effects.land(event.projectile);
                this.flights.delete(event.projectile);
                continue;
            }

            const avatar = this.avatars.get(event.id);

            // (Someone not drawn yet: one of the folk of a building being got ready; or taken out
            // of the battle in the same step, a building's folk let go, still drawn till the game
            // lets them go too: nothing to show)
            if (!avatar || !battle.actor(event.id)) {
                continue;
            }

            switch (event.type) {
                case "attack": {
                    const actor = battle.actor(event.id);
                    const target = battle.actor(event.target);

                    // (Kicking with a weapon in hand, the hands stay on guard; and its weapon in
                    // hand, whatever it looked like: once starting the attack has finished any
                    // drawing or putting away. How far off its target is, for a creature that
                    // reaches it: a frog's tongue)
                    avatar.actions.startAttack(event.animation, {
                        hitAt: event.hitAt / 1000,
                        duration: event.duration / 1000,
                        arms: event.animation !== "kick" || ["boots", "gauntlets"].includes(actor.weapon),
                        reach: target ? Math.hypot(target.x - actor.x, target.y - actor.y) : null,
                    });

                    if (avatar.character.sheathed) {
                        avatar.character.sheathe(false);
                    }

                    this.lastAttack.set(event.id, battle.time);
                    this.sound?.attack(event.animation, avatar.object.position, event.hitAt / 1000);

                    // (One of the wild's creatures snarling, hissing or grunting with it, loudest as
                    // it lands: a beast's every blow, a people-shaped one's now and then: CALLS)
                    const creature = this.#voiced(actor, avatar);

                    if (creature && this.clock >= (avatar.growled ?? 0) && (avatar instanceof BeastAvatar || Math.random() < CALLS.effort)) {
                        this.sound?.voice(creature, "attack", avatar.object.position, { hitAt: event.hitAt / 1000 });
                        avatar.growled = this.clock + CALLS.growl;
                    }

                    break;
                }
                case "draw":
                    this.#draw(event, avatar);
                    break;
                case "projectile": {
                    // (Its target as drawn, or, not drawn yet, where it is)
                    const target = this.avatars.get(event.target);
                    const aim = battle.actor(event.target);
                    const hand = weaponOf(battle.actor(event.id).weapon)?.equipment?.includes("bow") ? "Left" : "Right";
                    const from = avatar.hand(hand);

                    const [ox, oz] = this.originOf(battle.actor(event.id).map);
                    const [tx, ty] = target ? [target.object.position.x - ox, target.object.position.z - oz] : [aim?.x ?? event.x, aim?.y ?? event.y];

                    const look = LOOKS[event.kind] ? this.#look(event.id, event.kind) : 0;

                    const shape = FLIGHT[event.kind] ?? { arc: 0.05 };

                    effects.launch(event.projectile, event.kind, shape.ground ? from.clone().setY(this.#groundOn(battle.actor(event.id).map, from.x, from.z) + 0.08) : from, look);
                    this.sound?.launch(event.kind, from, { rate: LOOKS[event.kind]?.[look].pitch ?? 1 });
                    this.flights.set(event.projectile, {
                        previous: new THREE.Vector2(event.x, event.y),
                        distance: Math.hypot(tx - event.x, ty - event.y),
                        height: shape.ground ? 0.08 : from.y,
                        arc: shape.arc ?? 0,
                        ground: Boolean(shape.ground),
                    });

                    // (Fire breathed: a roaring stream from its jaws to whoever it's at, a moment)
                    if (event.kind === "flame" && target) {
                        effects.breathe(() => avatar.hand("Right"), () => target.point(0.6), 0.7);
                    }

                    break;
                }
                case "hit":
                    this.#hit(event);
                    break;
                case "miss":
                    hud.damage(this.#screenAbove(event.target), "Miss");
                    break;
                case "ail":
                    this.#ail(event, avatar);
                    break;
                case "afflicted":
                    this.#afflicted(event, avatar);
                    break;
                case "cast": {
                    const spell = SPELLS[event.spell];
                    const kind = SPELL_LOOKS[lookOf(event.spell)] ?? lookOf(event.spell);
                    const look = this.#look(event.id, kind);

                    // (Landing on whom it's cast on in the same look; and gathering in the hand,
                    // for as long as they're casting it, a heal's or a stun's in its look too)
                    this.landing.set(event.target, look);

                    if (battle.actor(event.id)?.map === this.mapId) {
                        const on = this.avatars.get(event.target);

                        this.spellFx.cast(event.id, event.spell, {
                            hand: () => avatar.hand("Left"),
                            feet: () => avatar.object.position,
                            target: () => on?.object.position ?? null,
                            aim: () => on?.point(0.6) ?? null,
                            still: () => battle.actor(event.id)?.casting?.spell === event.spell,
                            castTime: event.castTime,
                            glow: LOOKS[kind]?.[look]?.charge ?? null,
                        });
                    }

                    avatar.actions.startAttack(kind === "heal" ? "castHeal" : "castStun", { hitAt: spell.castTime / 1000, duration: (spell.castTime / 1000) * 1.7 });

                    // (Its sound swelling to its release, its missile's flying the last of it)
                    const heard = this.sound?.cast(event.spell, avatar.object.position, event.castTime / 1000, { travel: missileTravel(event.spell, event.castTime) });

                    this.castSounds.set(event.id, { source: heard ?? null, spell: event.spell, until: battle.time + event.castTime });
                    break;
                }
                case "healed": {
                    const actor = battle.actor(event.id);

                    this.wounds.get(event.id)?.heal(actor.hp, actor.maxHp);
                    effects.heal(avatar.object.position, avatar.character.height, this.#landing(event.id, "heal"));
                    hud.damage(this.#screenAbove(event.id), event.amount || !event.cured?.length ? `+${event.amount}` : "Cured", { kind: "heal" });
                    hud.setHealth(event.id, actor.hp, actor.maxHp);

                    // (A spell's healing or cure heard as it lands, its own: #spellLanded)
                    if (!spellSounds(event.spell).land) {
                        this.sound?.play("healed", { at: avatar.object.position });
                    }

                    break;
                }
                case "spell":
                    this.#spellLanded(event, avatar);
                    break;
                case "buffed":
                case "unbuffed":
                    this.#buffed(event, avatar);
                    break;
                case "dodged": {
                    const by = event.by ? this.avatars.get(event.by) : null;

                    hud.damage(this.#screenAbove(event.id), "Dodged", { kind: "stun" });
                    effects.burst("dust", avatar.point(0.1));
                    // (Slipping it: aside, away from where it came from, or back)
                    avatar.actions.dodge?.({ from: by ? avatar.angleTo(by.object.position.x, by.object.position.z) : 0 });
                    break;
                }
                case "blocked": {
                    // (Caught on a shield: braced behind it, the boss ringing; a spell on a
                    // spellward, its light)
                    const by = event.by ? this.avatars.get(event.by) : null;
                    const at = avatar.point(0.68);

                    hud.damage(this.#screenAbove(event.id), "Blocked", { kind: "stun" });
                    avatar.actions.react("block", { from: by ? avatar.angleTo(by.object.position.x, by.object.position.z) : 0 });
                    effects.impact(event.spell ? "arcane" : "sparks", at, by ? at.clone().sub(by.point(0.7)).setY(0).normalize() : null);
                    // (A blade's blow rings on the shield's iron; anything else thuds on its boards)
                    const blow = weaponOf(battle.actor(event.by)?.weapon)?.attacks.find(({ id }) => id === event.attack)?.reaction;

                    this.sound?.play(event.spell ? "arcane" : RINGING.has(blow) ? "clash" : "block", { at: avatar.object.position });
                    break;
                }
                case "resisted":
                    hud.damage(this.#screenAbove(event.id), event.always ? "Immune" : "Resisted", { kind: "stun" });

                    if (event.by === this.me) {
                        this.hud.message(`${battle.actor(event.id)?.name ?? "It"} ${event.used ? "is past fearing you, for now" : event.always ? "can't be swayed by that" : "shrugs off your spell"}.`, 2);
                    }

                    break;
                case "pacified":
                    hud.damage(this.#screenAbove(event.id), "Calmed", { kind: "heal" });
                    effects.burst("blessing", avatar.point(0.8));
                    break;
                case "seen":
                    if (event.target === this.me) {
                        this.hud.message(`${avatar.character ? battle.actor(event.id)?.name ?? "Something" : "Something"} sees through your invisibility!`, 3);
                        this.sound?.play("denied");
                    }

                    break;
                case "stunned":
                    effects.stun(avatar.point(0.9), avatar.object, avatar.character.height * 1.08, (event.until - battle.time) / 1000, this.#landing(event.id, "stun"));
                    hud.damage(this.#screenAbove(event.id), "Stunned", { kind: "stun" });
                    this.sound?.play("stun", { at: avatar.object.position });
                    break;
                case "knockdown": {
                    // Knocked off their feet (away from whoever did it), and up again when the
                    // battle lets them act again
                    const by = event.by ? this.avatars.get(event.by) : null;

                    const lands = avatar.actions.knockdown?.({ from: by ? avatar.angleTo(by.object.position.x, by.object.position.z) : 0, seconds: (event.until - battle.time) / 1000 }) ?? FALL_LANDS;

                    hud.damage(this.#screenAbove(event.id), "Knocked down", { kind: "stun" });
                    this.sound?.play(["mail", "plate"].includes(armourOf(avatar.character)) ? "fallArmoured" : "fall", { at: avatar.object.position, delay: lands });

                    if (event.id === this.me) {
                        hud.message("Knocked off your feet!", 1.2);
                    }

                    break;
                }
                case "exhausted":
                    if (event.id === this.me) {
                        hud.message("Out of breath", 1.5);
                        this.sound?.play("breath");
                    }

                    break;
                case "death": {
                    const killer = event.by ? this.avatars.get(event.by) : null;

                    // (Falling as they do, they hit the ground so long after: `lands`)
                    avatar.lands = avatar.actions.die({ from: killer ? avatar.angleTo(killer.object.position.x, killer.object.position.z) : 0 }) ?? FALL_LANDS;
                    avatar.deadFor = 0;
                    effects.clearDaze(avatar.object);

                    // (One of the wild's creatures dying as it does, and falling as it's made: a
                    // body's thud for its size, or none heard; anyone else as a person falls)
                    const dying = battle.actor(event.id);
                    const fall = CREATURE_VOICES[dying?.wild?.creature]?.fall;

                    if (this.#voiced(dying, avatar)) {
                        this.sound?.voice(dying.wild.creature, "death", avatar.object.position);
                    }

                    if (fall !== null) {
                        this.sound?.play(fall ?? (["mail", "plate"].includes(armourOf(avatar.character)) ? "fallArmoured" : "fall"), { at: avatar.object.position, delay: avatar.lands });
                    }

                    // (What they fought with falling from their hand after them)
                    if (battle.actor(event.id)?.kind !== "beast" && !["punch", "kick"].includes(guardOf(battle.actor(event.id)?.weapon) ?? "punch")) {
                        this.sound?.play("dropWeapon", { at: avatar.object.position, delay: avatar.lands + DROPPED });
                    }

                    // Blood pools under their chest once they're down
                    if (this.#bleeds(battle.actor(event.id))) {
                        this.pools.set(event.id, { left: avatar.lands + 0.2, spot: null });
                    }

                    if (event.id === this.me) {
                        hud.message("You have fallen. You'll wake in the market square…", (event.respawnAt - battle.time) / 1000);
                        this.sound?.play("fallen");
                    } else if (this.#ours(event)) {
                        hud.message(`The ${battle.actor(event.id).name.toLowerCase()} is slain!`, 3);
                        this.sound?.play("slain", { delay: avatar.lands });
                    }

                    this.#cheer(event);
                    this.onDeath(event);
                    break;
                }
                case "act":
                    this.#act(event, avatar);
                    break;
                case "rest":
                    this.#rest(event, avatar);
                    break;
                case "arrived":
                    // Walked up to someone to talk to them (or, another player, to trade)
                    if (event.id === this.me && event.target === this.approaching) {
                        const other = battle.actor(event.target);

                        this.approaching = null;

                        if (other?.kind === "player") {
                            this.#tradeWith(other);
                        } else {
                            this.#openTalk(other);
                        }
                    }

                    break;
                case "cross": {
                    const actor = battle.actor(event.id);
                    const was = avatar.object.position.clone();

                    this.#place(actor);

                    if (event.id === this.me) {
                        const building = this.world.interiors?.of(event.to);

                        // (Walked straight in: whatever of it isn't built yet, built now)
                        this.#ready(building?.key);
                        this.#arrive(actor);
                        this.sound?.setListener(avatar.object.position.x, avatar.object.position.z);
                    }

                    this.#safetyCrossed(event.id);

                    // A door opening and banging shut, or treads on the stairs, heard on the player's
                    // side of them
                    if (event.to === this.mapId || event.from === this.mapId) {
                        const at = event.to === this.mapId ? avatar.object.position : was;

                        // (The door's the building's: a keep's heavy one, a ruin's iron gate, none
                        // into a cave)
                        const door = event.kind === "door" ? doorOf(this.#soundOf(event.to === "town" ? event.from : event.to)) : null;

                        if (door) {
                            this.sound?.play(door, { at });
                        } else if (event.kind === "stairs") {
                            this.#climb(avatar, at, event.to === this.mapId);
                        }
                    }

                    break;
                }
                case "respawn": {
                    const actor = battle.actor(event.id);

                    avatar.actions.revive();
                    avatar.character.sheathe(true);
                    this.#place(actor);
                    avatar.deadFor = 0;

                    if (event.id === this.me && actor.map !== this.mapId) {
                        this.#arrive(actor);
                    }

                    effects.clearStuck(avatar.character.rig.bone("Spine2"));
                    this.wounds.get(event.id)?.clear();
                    effects.drain(this.pools.get(event.id)?.spot);
                    this.pools.delete(event.id);
                    hud.setHealth(actor.id, actor.hp, actor.maxHp);

                    if (event.id === this.me) {
                        hud.message("");
                        this.sound?.play("wake");
                    }

                    break;
                }
                default:
                    break;
            }
        }
    }

    // What the host tells of besides the battle (core/host.js advance): a building got ready or
    // let go, a player come or gone, the player finding more of the world
    #hear(event) {
        switch (event.type) {
            case "open": {
                const building = this.world.interiors?.buildings.get(event.key);

                if (building && !this.visits.has(event.key)) {
                    this.#prepare(building);
                }

                break;
            }
            case "close":
                this.#release(event.key);
                this.#mirror();
                break;
            case "join":
            case "leave":
                // (Someone else come into the world, or gone from it: docs/WAR.md M11)
                if (event.id !== this.me && event.name) {
                    this.hud.message(event.type === "join" ? `${event.name} has come into the world, of the ${peopleOf(event.realm)}.` : `${event.name} has left the world.`, 3);
                }

                this.#mirror();
                break;
            case "gone":
                this.#mirror();
                break;
            case "roused":
                // (The wild's creatures put out near a player: drawn a few at a time)
                this.enlisting.push(...event.ids);
                break;
            case "cleared":
                this.#cleared(event);
                break;
            case "squadsOut":
            case "quartered":
                // (A forward garrison's squads out near the player, or made up; a barracks'
                // garrison in it: to be drawn)
                this.enlisting.push(...event.ids);
                break;
            case "unquartered":
                this.#unenlist(event.ids);

                for (const id of event.ids) {
                    this.#undress(id);
                }

                break;
            case "barracks":
                this.#barracksCleared(event);
                break;
            case "worksOut":
                // (A works' guards out near the player, to be drawn; the brigands holding one are
                // roused, as the wild's are)
                if (event.people) {
                    this.enlisting.push(...event.ids);
                }

                break;
            case "worksDown":
                this.#unenlist(event.ids);

                for (const id of event.ids) {
                    this.#undress(id);
                }

                break;
            case "works":
                this.#worksWon(event);
                break;
            case "dungeon":
                this.#delved(event);
                break;
            case "cache":
                // (A cache let go, every player gone far from it: off the maps)
                if (event.change === "gone") {
                    this.cachesSeen.delete(event.cache);
                }

                break;
            case "muster":
                this.#muster(event);
                break;
            case "relieved":
                // (A town's fallen soldiers' places taken: those who took them drawn)
                this.enlisting.push(...event.ids);
                break;
            case "fieldBattle":
                // (Two armies mustered to see how many are drawn smoothly: the debug overlay's)
                this.enlisting.push(...event.ids);
                this.hud.message(`Two armies of ${event.size} take the field`, 3);
                break;
            case "townsfolk":
                // (A place's townsfolk out about their business, drawn nearest first; or home again)
                if (event.change === "out") {
                    this.enlisting.push(...event.ids);
                } else {
                    this.#unenlist(event.ids);

                    for (const id of event.ids) {
                        this.#undress(id);
                    }
                }

                break;
            case "camp":
                this.#pitch(event);
                break;
            case "emote":
                this.#emote(event);
                break;
            case "talk":
                this.#greet(event);
                break;
            case "strike":
                this.#strike(event);
                break;
            case "taken":
                this.#townTaken(event);
                break;
            case "envoy":
                this.enlisting.push(...event.ids);
                break;
            case "envoyed":
                this.#envoyed(event);
                break;
            case "convoy":
                // (A convoy met on the road near a player: its captain, guards and wagons drawn)
                this.enlisting.push(...event.ids, ...event.wagons);
                this.#convoyed({ ...event, over: "met" });
                break;
            case "convoyed":
                this.#convoyed(event);
                break;
            case "supply":
                // (A supply wagon met near the player: its ox, wagon and guards drawn; or taken)
                if (event.over === "met") {
                    this.enlisting.push(...event.ids, ...event.wagons);
                } else if (event.over === "taken" && (event.by === this.self?.realm || event.people === this.self?.realm)) {
                    const adjective = ADJECTIVES[event.people] ?? event.people;

                    this.hud.message(event.by === this.self?.realm ? `We've taken the ${adjective} supply wagon: their army goes short.` : "Our supply wagon has been taken!", 4);
                    this.sound?.play("newsHeard");
                }

                break;
            case "army":
                // (An army, a reserve or reinforcements met in the field near the player, in its
                // line: drawn, and the player told; or more of it stood up, joined it. Not of their
                // own people's reinforcements: they're out of their towns every turn)
                this.enlisting.push(...event.ids);

                if (event.met) {
                    const adjective = ADJECTIVES[event.people] ?? event.people;
                    const Adjective = `${adjective[0].toUpperCase()}${adjective.slice(1)}`;
                    const ours = event.people === this.self?.realm;

                    if (event.kind === "reinforcement" && !ours) {
                        this.hud.message(`${Adjective} reinforcements are on their way near you, ${event.ids.length} strong.`, 3);
                    } else if (event.kind !== "reinforcement") {
                        this.hud.message(`${ours ? `Our ${event.kind}` : `The ${Adjective} ${event.kind}`} is in the field near you, ${event.ids.length} strong.`, 3);
                    }
                }

                break;
            case "leaders":
                this.#lastStand(event);
                break;
            case "skirmishers": {
                // (A camp's skirmishers out near the player: drawn; the player told if they're after
                // something of their people's)
                this.enlisting.push(...event.ids);

                const after = { army: "army", reserve: "reserve", reinforcement: "reinforcements", supply: "supply wagon", convoy: "convoy", camp: "camp", depot: "supply depot", town: "town", works: "works" }[event.kind];

                if (after && event.against && event.against === this.self?.realm) {
                    const adjective = ADJECTIVES[event.people] ?? event.people;

                    this.hud.message(`${adjective[0].toUpperCase()}${adjective.slice(1)} skirmishers are out after our ${after}!`, 3);
                }

                break;
            }
            case "war":
                // (A fortification gone up or come down: the ground under it, and round it, drawn
                // again: core/overworld.js setForts. Not a camp: nothing's built under it)
                if (["built", "razed", "abandoned"].includes(event.event.type) && FORTS[event.event.kind]) {
                    this.chunks?.redraw(footprintOf({ kind: event.event.kind, at: event.event.at }, CLEARING));
                }

                this.#supplyCut(event.event);
                break;
            case "fortOut":
                // (A fortification near the player stood up in the battle: stood in for, its bar over it)
                this.#mirror();
                break;
            case "fortDown":
                this.#fortDown(event);
                break;
            case "parted":
                this.#unenlist(event.ids);

                for (const id of event.ids) {
                    this.#undress(id);
                }

                break;
            case "follower":
                if (event.id === this.me) {
                    this.hud.message({ joined: `${event.name} follows you now.`, fallen: `${event.name} has fallen!`, dismissed: `${event.name} goes their own way.`, lost: `${event.name} is left behind: back where you hired them, when you're next there.` }[event.change], 3);
                    this.hud.setGold(this.progress.gold);

                    // (Hired, paid in gold; fallen, mourned as the player would be)
                    if (event.change === "joined" || event.change === "fallen") {
                        this.sound?.play(event.change === "joined" ? "coins" : "fallen");
                    }
                    this.#mirror();

                    // (Kept with the character)
                    this.onFollowers(this.host.characterOf(this.host.players.get(this.me)).followers);
                }

                break;
            case "fate":
                if (event.id === this.me) {
                    this.#fate(event);
                }

                break;
            case "unrest":
                if (event.id === this.me && this.journal?.open) {
                    this.#showJournal();
                }

                break;
            case "farewell":
                this.#unenlist(event.ids);

                for (const id of event.ids) {
                    this.#undress(id);
                }

                break;
            case "dismiss":
                this.banners?.lower(event.town);
                this.#unenlist(event.ids);

                // (Let go of, even if others are out at their posts already: a town's new holders'
                // soldiers have the old ones' ids, and are drawn as their own people)
                for (const id of event.ids) {
                    this.#undress(id);
                }

                this.#mirror();
                break;
            case "slept":
                this.#slept(event);
                break;
            case "safety":
                this.#safety(event);
                break;
            case "boon":
                // (A Stamina Boost drunk, a courtesan's afterglow, or a boon worn off)
                if (event.id === this.me) {
                    const on = { staminaBoost: "Your stamina doubles, for five minutes.", afterglow: `${event.label}, for an hour.` }[event.boon] ?? `${event.label}.`;

                    this.hud.message(event.change === "on" ? on : `${event.label.split(":")[0]} wears off.`, 2.5);
                    this.#progressed(event);
                }

                break;
            case "explored":
                // (Marked on the maps, and kept; a branch of the guild's portal open to them now,
                // said)
                if (event.id === this.me) {
                    this.#explored();

                    if (event.portal) {
                        this.hud.message("This branch of the guild is open to you now: step through to it from any other branch's portal.", 4);
                    }
                }

                break;
            case "turn":
                // (The war kept as it goes; the journal's time left with it)
                this.onWar(this.host.war);

                if (this.journal?.open) {
                    this.#showJournal();
                }

                break;
            case "gear":
                this.#regear(event);
                this.#progressed(event);
                break;
            case "disguise":
                if (event.id === this.me) {
                    this.hud.message(DISGUISES[event.change]?.(ADJECTIVES[event.people] ?? event.people) ?? "", 3.5);
                }

                break;
            case "rank":
            case "loot":
            case "bought":
            case "sold":
            case "used":
            case "discarded":
            case "dropped":
            case "picked":
            case "spoils":
                this.#progressed(event);
                break;
            case "request":
            case "standing":
            case "guild":
            case "gift":
            case "counsel":
                this.#stood(event);
                break;
            case "trade":
                this.#traded(event);
                break;
            case "tier":
                // (A school of magic come to its next tier: its spell known now, and kept; its
                // sounds downloaded)
                if (event.id === this.me) {
                    this.#wantSpells();
                    this.hud.message(`${SCHOOLS[event.school].label}: you can cast ${SPELLS[event.spell].label} now! Put it on an action wheel (your spellbook, B).`, 5);
                    this.sound?.play("levelUp");
                    this.onProgress(this.progress);

                    if (this.spellbook?.open) {
                        this.#showSpellbook();
                    }
                }

                break;
            case "learnt":
                // (A spell learnt from a tome: known now, and kept; its sounds downloaded)
                if (event.id === this.me) {
                    this.#wantSpells();
                    this.hud.message(`You've learnt ${SPELLS[event.spell].label}! Put it on an action wheel (your spellbook, B).`, 5);
                    this.sound?.play("wake");
                    this.onProgress(this.progress);

                    if (this.spellbook?.open) {
                        this.#showSpellbook();
                    }
                }

                break;
            case "grown":
                // (A spell that grows with use grown: Vampirism, Dodge, Poison)
                if (event.id === this.me) {
                    this.hud.message(`${SPELLS[event.spell].label} grows stronger (${event.level} of 5).`, 3);
                    this.sound?.play("levelUp");
                    this.onProgress(this.progress);
                }

                if (this.spellbook?.open && event.id === this.me) {
                    this.#showSpellbook();
                }

                break;
            case "companion":
                this.#companion(event);
                break;
            case "summons":
                this.#summons(event);
                break;
            case "carried": {
                // (Gone with a pop from where they were, and come with one where they come to,
                // each if it's heard here; the player's own heard wherever they go)
                const [fx, fz] = event.from?.map === this.mapId ? this.originOf(event.from.map) : [];
                const [tx, tz] = event.map === this.mapId && event.square ? this.originOf(event.map) : [];

                this.sound?.carried(fx === undefined ? null : { x: fx + event.from.x, z: fz + event.from.y }, tx === undefined ? null : { x: tx + event.square[0] + 0.5, z: tz + event.square[1] + 0.5 }, { mine: event.id === this.me });

                // (Read home by a Scroll of Safety: its circle gone from where they were, a burst
                // of its light there, and it under them where they come to: #safetyCrossed)
                if (event.why === "safety") {
                    this.reading.get(event.id)?.circle?.end();
                    this.reading.delete(event.id);
                    this.homeward.add(event.id);

                    if (event.from?.map === this.mapId) {
                        const [ox, oz] = this.originOf(event.from.map);
                        const [x, z] = [ox + event.from.x, oz + event.from.y];

                        this.spellFx.appear(new THREE.Vector3(x, this.#groundOn(event.from.map, x, z), z), "safety");
                    }
                } else if (event.map === this.mapId) {
                    const [ox, oz] = this.originOf(event.map);

                    const [x, z] = [ox + event.square[0] + 0.5, oz + event.square[1] + 0.5];

                    this.spellFx.appear(new THREE.Vector3(x, this.#groundOn(event.map, x, z), z), event.why);
                }

                if (event.id === this.me) {
                    const branch = event.why === "portal" ? this.world.plan?.places.find(({ id }) => id === event.to)?.name : null;

                    this.hud.message({ teleport: "The world lurches, and you're somewhere else entirely.", recall: "You stand at the temple's door.", walk: "One step, and you're there.", summoned: "You're at their side.", safety: `Safe: the market square of ${this.world.start?.name ?? "home"}.`, portal: `Through the portal: the guild's branch in ${branch ?? "another town"}${event.fare ? `, for ${event.fare} gold` : ""}.` }[event.why] ?? "", 3);
                }

                break;
            }
            case "polymorphed": {
                // (Made again as what it is now, in a puff of smoke)
                const actor = this.battle.actor(event.id);

                if (actor && this.avatars.has(event.id)) {
                    const at = this.avatars.get(event.id).point(0.5);

                    this.#undress(event.id);
                    this.enlisting.push(event.id);
                    this.effects.burst("smoke", at);
                    this.effects.burst("arcane", at);
                }

                break;
            }
            case "attracted": {
                // (Out of a puff of smoke)
                const [ox, oz] = this.originOf("town");
                const at = new THREE.Vector3(ox + event.x, this.#groundOn("town", ox + event.x, oz + event.y) + 0.6, oz + event.y);

                this.effects.burst("smoke", at);
                this.effects.burst("dust", at);

                if (event.id === this.me) {
                    this.hud.message(`A ${CREATURES[event.creature]?.name.toLowerCase() ?? "creature"} comes out of the smoke!`, 2.5);
                }

                break;
            }
            default:
                break;
        }
    }

    // A turn of the war for the player's people (docs/WAR.md M10: host.js #fate): told in the
    // fate panel, or in a word (ready to rise); the war kept, and the journal as it is now
    #fate({ fate, realm, by, town }) {
        const war = this.host.war;
        const own = `the ${peopleOf(realm)}`;
        const them = by ? `the ${peopleOf(by)}` : "their overlords";

        if (fate === "restless") {
            this.hud.message(`${own[0].toUpperCase()}${own.slice(1)} are ready to rise against ${them}!`, 4);
        } else {
            const words = fateWords({ fate, own, by: them, town: town ? war?.town(town)?.name : null });

            if (words) {
                this.fate.show(words);
            }
        }

        this.onWar(war);
        this.onStanding(this.standing);

        if (this.journal?.open) {
            this.#showJournal();
        }
    }

    // Drawing a weapon, or putting it away (battle.js): its flourish and sound on the player's map,
    // else just done
    #draw({ id, on }, avatar) {
        const actor = this.battle.actor(id);
        const guard = guardOf(actor.weapon);

        if (actor.map !== this.mapId || actor.dead || actor.kind === "beast") {
            avatar.actions.stopResting();
            avatar.character.sheathe(!on);

            return;
        }

        // (A shield slung on the back: taken off it before the weapon's drawn, slung there again
        // after it's put away, each step heard as it comes: Actions.draw)
        const slung = guard !== "sling" && Boolean(avatar.character.slings);

        avatar.actions.draw(guard, on);

        const way = on ? "draw" : "sheathe";
        const own = DRAWS[guard]?.[way];
        const shield = slung ? DRAWS.sling?.[way] : null;
        const sound = (DRAW_SOUNDS[guard] ?? ["unsling", "unsling"])[on ? 0 : 1];

        if (sound) {
            this.sound?.play(sound, { at: avatar.object.position, delay: (on && shield ? shield.duration : 0) + (own?.hitAt ?? 0) });
        }

        if (shield) {
            this.sound?.play("shieldSling", { at: avatar.object.position, delay: (on ? 0 : (own?.duration ?? 0)) + shield.hitAt });
        }
    }

    #hit(event) {
        const { battle, hud, effects } = this;

        if (event.by && (event.by === this.me || event.id === this.me)) {
            this.fought.set(event.by === this.me ? event.id : event.by, this.clock);
        }
        const victim = this.avatars.get(event.id);
        const attacker = event.by ? this.avatars.get(event.by) : null;
        const reaction = REACTIONS[event.reaction];
        const from = attacker ? victim.angleTo(attacker.object.position.x, attacker.object.position.z) : 0;
        const actor = battle.actor(event.id);

        victim.actions.react(event.reaction, { from });

        // (One of the wild's creatures crying out, now and then; struck dead, it's its death
        // that's heard: CALLS)
        const hurt = !actor?.dead && this.#voiced(actor, victim);

        if (hurt && this.clock >= (victim.cried ?? 0)) {
            this.sound?.voice(hurt, "hurt", victim.object.position);
            victim.cried = this.clock + CALLS.hurt;
        }
        // (Armour heard under a weapon's or a fist's blow, not a spell's, whatever it feels like;
        // a spell's blow heard as it lands, its own, unless it's the fire it left on the ground or
        // it's turned back: #spellLanded)
        if (!(event.spell && !event.ground && !event.reflected && spellSounds(event.spell).land)) {
            this.sound?.hit(event.reaction, victim.object.position, event.spell ? null : armourOf(victim.character));
        }

        // (Struck by a spell: drawn with the rest it struck as it lands; or one turned back on
        // them, flashing from whoever turned it)
        if (event.spell && event.by && !event.ground && !event.reflected) {
            const key = `${event.by}:${event.spell}`;

            this.struck.set(key, [...(this.struck.get(key) ?? []), event.id]);
        }

        if (event.reflected && attacker && actor?.map === this.mapId) {
            this.spellFx.bounce(() => attacker.point(0.6), () => victim.point(0.6));
        }

        // The wound it leaves (or mark), where the blow lands, and which way it was going
        const wounds = this.wounds.get(event.id);
        const landed = wounds?.hit({ reaction: event.reaction, from: attacker ? from : null, hp: event.hp, maxHp: event.maxHp, before: event.hp + event.damage });
        const at = landed ? wounds.pointOf(landed) : victim.point(event.reaction === "punch" ? 0.88 : 0.7);
        const direction = attacker ? at.clone().sub(attacker.point(0.7)).setY(0).normalize() : null;
        const kind = KINDS[event.reaction] ?? KINDS.strike;

        effects.impact(reaction?.effect ?? "sparks", at, direction, event.projectile ? effects.lookOf(event.projectile) : null);

        // Blood sprays from it, gushing from a wound (and a killing blow), with a splash on the
        // ground beyond (not from a creature that doesn't bleed red); burns smoke
        if (kind.blood > 0 && this.#bleeds(actor)) {
            effects.bleed(at, direction, { amount: kind.blood * (landed?.mark ? 0.7 : 1.4), gush: !landed?.mark || event.hp <= 0 });
        } else if (actor?.kind === "beast") {
            // (Or what it spills instead: gel, ichor, sap, chips of bone or stone, shadow...)
            const { blood } = CREATURES[actor.wild?.creature] ?? {};

            for (const spill of SPILLS[blood] ?? SPILLS[actor.wild?.creature] ?? []) {
                effects.burst(spill, at, direction ? direction.clone().setY(0.4) : null);
            }
        }

        if (kind.glow === "fire") {
            effects.burst("ash", at, direction);
        }

        if (event.projectile) {
            const flown = effects.kindOf(event.projectile);

            // (Venom splashing, lava spattering, a web bursting, roots breaking the ground at
            // their feet, a curse's shadows)
            for (const splash of SPLASHES[flown] ?? []) {
                effects.burst(splash, flown === "roots" ? victim.point(0.02) : at, direction);
            }

            const arrow = effects.land(event.projectile, landed ? wounds.boneOf(landed) : victim.character.rig.bone("Spine2"), { at: landed ? at : null, keep: Boolean(landed) });

            if (arrow && landed) {
                wounds.keep(landed, arrow);
            }

            this.flights.delete(event.projectile);
        }

        hud.damage(this.#screenAbove(event.id), event.damage, { toPlayer: event.id === this.me });
        hud.setHealth(event.id, actor.hp, actor.maxHp);
        this.flash.set(event.id, 0.25);
    }

    // --- What lingers after some blows (core/afflictions.js) ---

    // It hurts them: a number the colour of it over them, their bar, and a puff of it
    #ail({ id, kind, damage, hp, maxHp }, avatar) {
        const hurt = AILING[kind]?.hurt;

        this.hud.setHealth(id, hp, maxHp);
        this.hud.damage(this.#screenAbove(id), damage, { toPlayer: id === this.me, kind: `ail ail-${kind}` });

        if (hurt && this.battle.actor(id)?.map === this.mapId) {
            this.effects.burst(hurt, this.#onThem(avatar, AILING[kind]));
        }
    }

    // It takes hold of someone (drawn on them: a web, roots...), or it's over (cured, or worn
    // off); the player told of their own (and, the first time, where the cure's to be had)
    #afflicted({ id, kind, change, look }, avatar) {
        const { drawn, on, label } = ailmentOf(kind, look);

        if (change === "on") {
            if (drawn) {
                this.ailments.add(id, drawn, avatar.object, avatar.character.height);
            }
        } else if (drawn) {
            this.ailments.remove(id, drawn);
        }

        if (id !== this.me) {
            return;
        }

        if (change === "on") {
            const cure = ITEMS[AFFLICTIONS[kind]?.cure];
            const told = this.curesTold.has(kind);

            this.curesTold.add(kind);
            this.hud.message(told || !cure ? on : `${on} (${cure.label}: the adventurers' guild sells them.)`, told ? 2 : 4);
            this.sound?.play("denied");
        } else {
            this.hud.message(`No longer ${label.split(":")[0].toLowerCase()}.`, change === "cured" ? 2 : 1.5);
        }
    }

    // A spell lasting on someone, or ended: shown on their plate (#ailing), and the player told of
    // their own (by whom, if it's someone else's); what's shown of them now (Invisibility)
    #buffed({ type, id, kind, by, over }, avatar) {
        const label = SPELLS[kind]?.label ?? kind;

        this.ailed.add(id);

        if (kind === "invisibility") {
            this.#unseen(avatar, type === "buffed");
        }

        if (id !== this.me) {
            return;
        }

        if (type === "buffed" && by && by !== this.me) {
            this.hud.message(`${this.battle.actor(by)?.name ?? "Someone"} casts ${label} on you.`, 2.5);
        } else if (type === "unbuffed") {
            this.hud.message(WORN_OFF[kind] ?? `${label} ${over ? "wears off" : "ends"}.`, 2);
        }
    }

    // A spell lands (battle.js "spell"): drawn where it lands, each its own, with those it struck
    // (told as "hit" first), on the player's map
    // Casts heard as they swell: one broken off before it's let go (its caster stunned, knocked
    // down, struck dead) cut short, fizzling out if they're still standing
    #castsHeard() {
        for (const [id, { source, spell, until }] of this.castSounds) {
            const actor = this.battle.actor(id);

            if (this.battle.time >= until) {
                this.castSounds.delete(id);
            } else if (actor?.casting?.spell !== spell) {
                this.castSounds.delete(id);
                this.sound?.cut(source);

                if (actor && !actor.dead && actor.map === this.mapId) {
                    this.sound?.play("fizzle", { at: this.avatars.get(id)?.object.position ?? null });
                }
            }
        }
    }

    #spellLanded(event, avatar) {
        const key = `${event.id}:${event.spell}`;
        const struck = this.struck.get(key) ?? [];
        const target = this.avatars.get(event.target);

        this.struck.delete(key);
        this.castSounds.delete(event.id);

        if (!target || this.battle.actor(event.target)?.map !== this.mapId) {
            this.spellFx.stop(event.id);

            return;
        }

        this.sound?.landed(event.spell, target.object.position);

        const where = (one) => ({ feet: () => one.object.position, point: () => one.point(0.6), hand: () => one.hand("Left") });
        const others = struck.filter((id) => id !== event.target && this.avatars.has(id)).map((id) => where(this.avatars.get(id)));

        this.spellFx.land(event.id, event.spell, { caster: where(avatar), target: where(target), struck: others });
    }

    // Someone unseen (Invisibility): all but gone, a shimmer of them (their materials made their
    // own the first time, copies of any shared with anyone else's, and made see-through while it lasts)
    #unseen(avatar, on) {
        avatar.object.traverse((part) => {
            if (part.material && !part.userData.ownMaterial) {
                part.material = Array.isArray(part.material) ? part.material.map((each) => each.clone()) : part.material.clone();
                part.userData.ownMaterial = true;
            }

            for (const material of [part.material].flat().filter(Boolean)) {
                material.userData.opacity ??= material.opacity;
                material.userData.transparent ??= material.transparent;
                material.transparent = on || material.userData.transparent;
                material.opacity = on ? material.userData.opacity * 0.22 : material.userData.opacity;
                material.needsUpdate = true;
            }
        });
    }

    // A creature at the player's side by magic, or gone from it: seen coming (or going), and told
    #companion({ id, companion, creature, change }) {
        // (Where it is: drawn, or, not drawn yet, where it's come; gone, where it was last drawn)
        const one = this.battle.actor(companion);
        const avatar = this.avatars.get(companion);
        const [ox, oz] = this.originOf(this.mapId);
        const at = avatar?.object.visible ? avatar.object.position.clone() : one?.map === this.mapId ? new THREE.Vector3(ox + one.x, this.#groundOn(one.map, ox + one.x, oz + one.y), oz + one.y) : null;

        if (at && ["risen", "called", "over", "lost"].includes(change)) {
            this.spellFx.appear(at, change);
        }

        if (id !== this.me) {
            return;
        }

        const name = CREATURES[creature]?.name.toLowerCase() ?? "creature";
        const said = { risen: `The ${name} rises from the dead to follow you!`, called: `A ${name} answers your call, at your side.`, over: `Your ${name} is gone, its time up.`, fallen: `Your ${name} has fallen.`, lost: `Your ${name} is left behind.` }[change];

        if (said) {
            this.hud.message(said, 3);
        }
    }

    // Summoned by another player (come, or resist: said no to at once, with Resist all summons
    // on), or someone they've summoned coming or not
    #summons(event) {
        if (event.id !== this.me) {
            return;
        }

        const nameOf = (id) => this.host.players.get(id)?.hero.name ?? "They";

        if (event.change === "asked" && this.resistSummons) {
            this.#command({ type: "summoned", come: false });
            this.hud.message(`You resist ${event.name}'s summons.`, 3);
        } else if (event.change === "asked") {
            this.sound?.play("wake");
            this.hud.choose(`${event.name} is summoning you to their side. Go?`, [{ label: `Go to ${event.name}`, value: true }, { label: "Resist", value: false }], (come) => come !== undefined && this.#command({ type: "summoned", come }), { cancel: null, seconds: Math.max(1, (event.until - this.battle.time) / 1000) });
        } else if (event.change === "sent") {
            this.hud.message(`You call to ${event.name}...`, 2.5);
        } else if (event.change === "came" && event.target) {
            this.hud.message(`${nameOf(event.target)} comes to your side.`, 3);
        } else if (event.change === "resisted" && event.target) {
            this.hud.message(`${nameOf(event.target)} resists your summons.`, 3);
        } else if (event.change === "resisted") {
            this.hud.choice?.withdraw();
        }
    }

    // What lies on the ground on the player's map, as it shows: flames licking up off it, acid
    // bubbling, rot festering... anywhere on it, now and then
    #grounds() {
        const point = new THREE.Vector3();

        for (const [id, ground] of this.grounds) {
            if (ground.map !== this.mapId || this.clock < (this.groundsAt.get(id) ?? 0)) {
                continue;
            }

            const [ox, oz] = this.originOf(ground.map);

            this.groundsAt.set(id, this.clock + 0.05 + Math.random() * 0.08 / Math.max(1, ground.radius));

            for (const burst of GROUNDS[ground.kind] ?? []) {
                const angle = Math.random() * Math.PI * 2;
                const reach = Math.sqrt(Math.random()) * ground.radius;

                const [x, z] = [ox + ground.x + Math.cos(angle) * reach, oz + ground.y + Math.sin(angle) * reach];

                this.effects.burst(burst, point.set(x, this.#groundOn(ground.map, x, z) + 0.05, z));
            }
        }

        for (const id of this.groundsAt.keys()) {
            if (!this.grounds.has(id)) {
                this.groundsAt.delete(id);
            }
        }
    }

    // What lingers on everyone shown, as it goes: an icon for each on their plate (the time it's
    // got left darkening round it; what harms them, then what does them good, each the soonest
    // over first), and rising off them now and then (bubbles, flies, motes, flames, blood,
    // silk...), those on the player's map
    #ailing() {
        const { battle, hud, effects } = this;
        const point = new THREE.Vector3();
        // (A player's boons, bought by talking: a blessing, a keen edge)
        const boonsOf = (actor) => this.host.players.get(actor.id)?.boons ?? [];

        for (const id of this.ailed) {
            const actor = battle.actor(id);

            if ((!actor?.afflictions?.length && !actor?.buffs?.length && !(actor && boonsOf(actor).length)) || actor.dead) {
                this.ailed.delete(id);
                hud.setAfflictions(id, []);

                if (!actor || actor.dead) {
                    this.ailments.clear(id);
                }
            }
        }

        for (const actor of battle.actors) {
            if ((!actor.afflictions?.length && !actor.buffs?.length && !(actor.kind === "player" && boonsOf(actor).length)) || actor.dead) {
                continue;
            }

            const avatar = this.avatars.get(actor.id);

            if (!avatar) {
                continue;
            }

            this.ailed.add(actor.id);
            // (What harms them first, then what does them good: the spells lasting on them, a ward,
            // Reflect..., and a player's boons; each the soonest over first)
            const soonest = (a, b) => a.until - b.until;

            hud.setAfflictions(actor.id, [
                ...[...actor.afflictions].sort(soonest).map(({ kind, until, look }) => ({ kind, ...ailmentOf(kind, look), left: (until - battle.time) / (AFFLICTIONS[kind]?.ms ?? 1) })),
                ...[
                    ...(actor.buffs ?? []).map(({ kind, until }) => ({ kind, icon: kind, label: SPELLS[kind]?.label ?? kind, until, left: (until - battle.time) / (SPELLS[kind]?.lasts ?? 1), buff: true })),
                    ...(actor.kind === "player" ? boonsOf(actor) : []).map(({ id, label, until, ms }) => ({ kind: id, icon: id, label, until, left: (until - battle.time) / ms, buff: true })),
                ].sort(soonest),
            ]);

            if (actor.map !== this.mapId || !avatar.object.visible) {
                continue;
            }

            for (const { kind, look } of actor.afflictions) {
                const style = AILING[kind];
                const key = `${actor.id}:${kind}`;

                if (!style || this.clock < (this.ailingAt.get(key) ?? 0)) {
                    continue;
                }

                this.ailingAt.set(key, this.clock + style.every * (0.7 + Math.random() * 0.6));

                for (const burst of ailmentOf(kind, look).bursts) {
                    effects.burst(burst, this.#onThem(avatar, style, point));
                }
            }
        }
    }

    // Somewhere on someone, for what lingers on them to show at: between its heights, round them
    #onThem(avatar, { at: [low, high], round }, point = new THREE.Vector3()) {
        const angle = Math.random() * Math.PI * 2;
        const scale = avatar.character.height / 1.75;

        avatar.point(low + Math.random() * (high - low), point);
        point.x += Math.cos(angle) * round * scale;
        point.z += Math.sin(angle) * round * scale;

        return point;
    }

    // How what lingers on someone tinges their skin just now (pulsing), or null
    #tintOf(actor) {
        if (!actor?.afflictions?.length || actor.dead) {
            return null;
        }

        const tint = new THREE.Color(0, 0, 0);
        const pulse = 0.6 + 0.4 * Math.sin(this.clock * 5);

        for (const { kind, look } of actor.afflictions) {
            const colour = ailmentOf(kind, look).tint;

            if (colour) {
                tint.r += colour[0] * pulse;
                tint.g += colour[1] * pulse;
                tint.b += colour[2] * pulse;
            }
        }

        return tint.r + tint.g + tint.b > 0 ? tint : null;
    }

    // Does a character bleed red (not a skeleton, a slime, a spider, a wisp...)?
    #bleeds(actor) {
        return actor?.kind !== "fort" && (actor?.kind !== "beast" || CREATURES[actor.wild?.creature]?.blood === "red");
    }

    // Wounds glow and fade; burns smoke and throw embers; the badly hurt drip blood (the worse
    // and the faster they're going, the more), leaving a trail; and blood pools under the fallen
    #bleed(dt) {
        const { effects } = this;
        const point = new THREE.Vector3();

        for (const [id, wounds] of this.wounds) {
            const actor = this.battle.actor(id);
            const avatar = this.avatars.get(id);

            wounds.update(dt);

            if (!actor || !avatar.object.visible) {
                continue;
            }

            for (const wound of wounds.smouldering) {
                if (Math.random() < dt * 5) {
                    effects.burst("smoke", wounds.pointOf(wound, point));
                }

                if (Math.random() < dt * 7) {
                    effects.burst("embers", wounds.pointOf(wound, point));
                }
            }

            const stage = actor.dead ? 0 : wounds.stage;
            const bleeding = stage >= 2 ? wounds.bleeding : [];

            if (bleeding.length) {
                const moving = Math.hypot(avatar.follow?.vx ?? 0, avatar.follow?.vz ?? 0) > 0.4;
                const rate = (stage >= 3 ? 3.5 : 1.3) * (moving ? 2 : 1);

                if (Math.random() < dt * rate) {
                    effects.drip(wounds.pointOf(bleeding[Math.floor(Math.random() * bleeding.length)], point));
                }
            }
        }

        for (const [id, pool] of this.pools) {
            pool.left -= dt;

            if (!pool.spot && pool.left <= 0) {
                const { character } = this.avatars.get(id);

                character.object.updateMatrixWorld();

                const chest = character.rig.bone("Spine1").getWorldPosition(point);

                pool.spot = effects.pool(chest.x, chest.z, 1.5 + Math.random() * 0.4);
            }
        }
    }

    #screenAbove(id) {
        const avatar = this.avatars.get(id);

        return avatar ? this.view.toScreen(avatar.point(0.95)) : null;
    }

    // --- Taps, clicks and zooming ---

    #on(target, type, listener, options) {
        target.addEventListener(type, listener, options);
        this.listeners.push([target, type, listener, options]);
    }

    #listen() {
        const canvas = this.view.canvas;

        this.#on(canvas, "pointerdown", (event) => {
            const pointer = { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, start: event.timeStamp, moved: false, hold: null, wheel: null, swipe: false, drag: null, done: false };

            canvas.setPointerCapture?.(event.pointerId);
            this.pointers.set(event.pointerId, pointer);

            // Held on the player, an enemy, a soldier to pick a fight with, or anyone else (to heal
            // them): the action wheel
            const who = this.pointers.size === 1 ? this.#whoIsAt(event.clientX, event.clientY, { soldiers: true, allies: true }) : null;

            if (who) {
                pointer.hold = setTimeout(() => this.#openWheel(pointer, who), HOLD_MS);

                // (From the player, it may be a swipe up: straight ahead)
                pointer.swipe = who.wheel === "self";
            }

            if (this.pointers.size === 2) {
                const [a, b] = [...this.pointers.values()];

                // Two fingers: a pinch, not a drag
                for (const each of this.pointers.values()) {
                    clearTimeout(each.hold);
                    each.done = true;
                    this.#letGo(each);
                }

                this.#closeWheel();
                this.pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y) };
            }
        });

        this.#on(canvas, "pointermove", (event) => {
            const pointer = this.pointers.get(event.pointerId);

            if (!pointer) {
                return;
            }

            pointer.x = event.clientX;
            pointer.y = event.clientY;

            if (pointer.wheel) {
                this.#steerWheel(pointer);

                return;
            }

            pointer.moved ||= Math.hypot(pointer.x - pointer.startX, pointer.y - pointer.startY) > TAP_SLOP;

            if (pointer.moved) {
                clearTimeout(pointer.hold);
            }

            // Swiped up from the player: straight ahead, as far as the way is clear
            const rise = pointer.startY - pointer.y;
            const across = pointer.x - pointer.startX;

            if (pointer.swipe && this.pointers.size === 1 && rise > SWIPE && rise > 1.5 * Math.abs(across) && event.timeStamp - pointer.start < SWIPE_MS) {
                pointer.swipe = false;
                pointer.done = true;
                this.forward();
            }

            // Dragged: the camera turns round the player (and tilts) with it
            if (pointer.moved && !pointer.drag && !pointer.done && !this.pinch && this.pointers.size === 1 && !(pointer.swipe && rise > 1.5 * Math.abs(across))) {
                pointer.swipe = false;
                pointer.drag = { x: pointer.startX, y: pointer.startY };
                this.cameraFollow?.grab();
            }

            if (pointer.drag && this.cameraFollow) {
                const rect = canvas.getBoundingClientRect();

                const { drag, invert } = this.cameraSettings;

                this.cameraFollow.turn((-(pointer.x - pointer.drag.x) / rect.width) * DRAG_TURN * drag, ((pointer.y - pointer.drag.y) / rect.height) * DRAG_TILT * drag * (invert ? -1 : 1), this.view.lowestPitch());
                pointer.drag.x = pointer.x;
                pointer.drag.y = pointer.y;
            }

            if (this.pinch && this.pointers.size === 2) {
                const [a, b] = [...this.pointers.values()];
                const distance = Math.hypot(a.x - b.x, a.y - b.y);

                if (distance > 0 && this.pinch.distance > 0) {
                    this.view.zoom(this.pinch.distance / distance);
                }

                this.pinch.distance = distance;
            }
        });

        const up = (event) => {
            const pointer = this.pointers.get(event.pointerId);

            if (!pointer) {
                return;
            }

            this.pointers.delete(event.pointerId);
            clearTimeout(pointer.hold);
            this.#letGo(pointer);

            // Let go with the wheel open: whatever was chosen, it closes (in the middle, nothing)
            if (pointer.wheel) {
                if (!pointer.wheel.done) {
                    this.#closeWheel();
                }

                return;
            }

            if (this.pinch) {
                if (this.pointers.size === 0) {
                    this.pinch = null;
                }

                return;
            }

            if (event.type === "pointerup" && !pointer.moved) {
                this.tap(event.clientX, event.clientY, { run: event.shiftKey, time: event.timeStamp });
            }
        };

        this.#on(canvas, "pointerup", up);
        this.#on(canvas, "pointercancel", up);

        // Anything the player does keeps them from resting
        for (const type of ["pointerdown", "keydown", "wheel"]) {
            this.#on(document, type, () => this.#wake(), { capture: true, passive: true });
        }

        // W, A, S, D (or the arrows), and a thumb stick on a touch screen: held, they come out as
        // the same "ahead" order the swipe up gives (app/steering.js)
        const zone = this.hud.root.querySelector("#stickzone");
        const knob = this.hud.root.querySelector("#stickknob");

        if (zone && knob) {
            this.steering = new Steering({
                zone,
                knob,
                ring: this.hud.root.querySelector("#stick"),
                looking: () => this.#steerable(),
                go: (facing, run) => {
                    this.#wake();
                    this.#command({ type: "ahead", facing, run });
                },
                stop: () => this.#command({ type: "stop" }),
            });
        }

        // The pack: its button, or I; Escape closes it (not the menu)
        this.#on(this.hud.root.querySelector("#packbutton") ?? document.createElement("button"), "click", () => this.togglePack());
        this.#on(this.hud.root.querySelector("#journalbutton") ?? document.createElement("button"), "click", () => this.toggleJournal());
        this.#on(this.hud.root.querySelector("#spellbookbutton") ?? document.createElement("button"), "click", () => this.toggleSpellbook());
        this.#on(document, "keydown", (event) => {
            if (!this.running || this.talk?.open) {
                return;
            }

            const plain = !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey;

            if (event.key === "Escape" && this.pack?.open && this.pack.unpeek()) {
                // (What was open in the pack to see what it is, put away first)
                event.preventDefault();
                event.stopPropagation();
            } else if (event.key === "Escape" && (this.pack?.open || this.journal?.open || this.spellbook?.open || this.fate?.open)) {
                event.preventDefault();
                event.stopPropagation();
                this.closePack();
                this.closeJournal();
                this.closeSpellbook();
                this.fate?.hide();
            } else if ((event.key === "i" || event.key === "I") && plain) {
                this.togglePack();
            } else if ((event.key === "j" || event.key === "J") && plain) {
                this.toggleJournal();
            } else if ((event.key === "b" || event.key === "B") && plain) {
                this.toggleSpellbook();
            } else if (/^[1-4]$/.test(event.key) && plain && this.quickBar?.up && !(event.target instanceof HTMLInputElement)) {
                this.quick(Number(event.key) - 1);
            }
        }, { capture: true });

        // Talking, the number keys say what's next to them, and Escape stops (not the menu)
        this.#on(document, "keydown", (event) => {
            if (!this.talk?.open || !this.running) {
                return;
            }

            if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                this.#endTalk();
            } else if (/^[1-9]$/.test(event.key)) {
                this.#say(Number(event.key) - 1);
            }
        }, { capture: true });
        this.#on(canvas, "wheel", (event) => {
            event.preventDefault();
            this.view.zoom(Math.exp(event.deltaY * 0.0015));
        }, { passive: false });
    }

    // A drag lets go of the camera: walking, it swings back round behind the player
    #letGo(pointer) {
        if (pointer.drag) {
            pointer.drag = null;
            this.cameraFollow?.release();
        }
    }

    /**
     * A tap or click at a point on the screen (client pixels), at `time` (ms, as performance.now()):
     * fight who's there, go through the door or up or down the stairs there, or walk there.
     * Tapped twice in quick succession (or with `run`: shift-clicked), run there.
     */
    tap(clientX, clientY, { run = false, time = performance.now() } = {}) {
        this.#wake();

        const who = this.#whoIsAt(clientX, clientY, { player: false, folk: true })?.actor ?? null;
        const me = this.battle.actor(this.me);

        // Someone to talk to (one of the folk, a soldier who isn't an enemy): go up to them; another
        // player (not an enemy): trade with them
        if (who && me && !this.battle.hostile(who, me)) {
            this.lastTap = { time, x: clientX, y: clientY, from: "view" };

            if (who.kind === "player") {
                this.#tradeWith(who, { run });
            } else {
                this.#talkTo(who, { run });
            }

            return;
        }

        // Something dropped on the ground: go and pick it up
        const dropped = who ? null : this.drops?.at(clientX, clientY, (point) => this.view.toScreen(point));

        this.picking = null;

        if (dropped) {
            this.lastTap = { time, x: clientX, y: clientY, from: "view" };
            this.#pickUp(dropped, { run });

            return;
        }

        const enemy = who;
        const door = enemy ? null : this.doors?.at(this.view.rayAt(clientX, clientY), this.mapId) ?? null;
        const portal = enemy || door ? null : this.#portalAt(clientX, clientY);
        const table = enemy || door || portal ? null : this.#warTableAt(clientX, clientY);
        const ground = enemy || door || portal || table ? null : this.view.pickGround(clientX, clientY);
        const [ox, oz] = this.originOf(this.mapId);

        this.#order({ enemy, door, portal, table, ground: ground && [ground.x - ox, ground.z - oz] }, { clientX, clientY, run, time, from: "view" });
    }

    /**
     * Two armies of `size` each mustered before the player, the way the camera looks (core/host.js
     * FIELD_BATTLE: the debug overlay's Field battle), to see how many this device draws and plays
     * smoothly; told why not,
     * if not (not out in the world, or not the world's own player).
     */
    fieldBattle(size) {
        const [x, z] = this.#lookAlong();

        this.#command({ type: "fieldBattle", size, facing: Math.atan2(x, z) }, (result) => {
            if (!result.ok) {
                this.hud.message("Only out in the world you've opened, not joined", 2.5);
            }
        });
    }

    // The portal of the guild's hall the player's in (core/portals.js), if that's what was tapped:
    // its arch, or the step before it
    #portalAt(clientX, clientY) {
        const portal = portalOn(this.world.maps?.[this.mapId]);

        if (!portal) {
            return null;
        }

        const [ox, oz] = this.originOf(this.mapId);
        const box = new THREE.Box3(new THREE.Vector3(ox + portal.x - 1, 0, oz + portal.y), new THREE.Vector3(ox + portal.x + portal.w, 2.9, oz + portal.y + portal.h));

        return this.view.rayAt(clientX, clientY).intersectsBox(box) ? portal : null;
    }

    // The war table of the keep's great hall the player's in (core/wartable.js), if that's what
    // was tapped: the table, or the map on it
    #warTableAt(clientX, clientY) {
        const table = warTableOn(this.world.maps?.[this.mapId]);

        if (!table) {
            return null;
        }

        const [ox, oz] = this.originOf(this.mapId);
        const box = new THREE.Box3(new THREE.Vector3(ox + table.x, 0, oz + table.y), new THREE.Vector3(ox + table.x + table.w, 1.1, oz + table.y + table.h));

        return this.view.rayAt(clientX, clientY).intersectsBox(box) ? table : null;
    }

    // Walking up to the war table (it was tapped): there and stopped, its map opens; told to do
    // anything else, gone through a door, or stopped short, it's forgotten
    #keepToTable() {
        if (!this.toTable) {
            return;
        }

        const me = this.battle.actor(this.me);
        const table = warTableOn(this.world.maps?.[this.mapId]);

        if (!me || me.dead || me.map !== this.toTable || !table) {
            this.toTable = null;

            return;
        }

        if (me.order || me.path.length) {
            return;
        }

        this.toTable = null;

        if (atWarTable(table, me.x, me.y)) {
            this.openWarTable();
        }
    }

    /**
     * Read the war table at the keep the player stands at (core/wartable.js; docs/WAR.md *The war
     * table*): the war as their people's council sees it, on the world map, drawn again as it goes
     * on (app/battlemap.js), if it's their people's (or a people's under the same liege) and
     * they're a Knight or above. Returns { ok, view }, or why not ({ ok: false, reason }: not at
     * a war table, "stranger" or "rank": said).
     */
    openWarTable() {
        const me = this.battle.actor(this.me);
        const table = warTableOn(this.world.maps?.[this.mapId]);
        const building = this.world.interiors?.of(this.mapId);
        const war = this.host.war;
        const town = building && war ? war.town(this.#townOf(building)) : null;

        if (!me || me.dead || !table || !town || !atWarTable(table, me.x, me.y)) {
            return { ok: false, reason: "table" };
        }

        const reason = mayRead(war, this.self.realm, town.owner, this.standing.rank());

        if (reason !== "ok") {
            const whose = `${peopleOf(town.owner)}${peopleOf(town.owner).endsWith("s") ? "'" : "'s"}`;

            this.hud.message(reason === "stranger" ? `The ${whose} war table: its map isn't for you to read.` : `The war table's for the council and its Knights to read. You're ${/^[AEIOU]/.test(this.standing.title()) ? "an" : "a"} ${this.standing.title()}.`, 3.5);

            return { ok: false, reason };
        }

        const refresh = () => battleMapView(this.host.war, this.self.realm, { explored: this.explored });
        const view = refresh();

        this.onWorldMap({ war: { view, refresh } });

        return { ok: true, view };
    }

    // Walking up to the portal (it was tapped): there and stopped, the travel map opens; told to
    // do anything else, gone through a door, or stopped short, it's forgotten
    #keepToPortal() {
        if (!this.toPortal) {
            return;
        }

        const me = this.battle.actor(this.me);
        const portal = portalOn(this.world.maps?.[this.mapId]);

        if (!me || me.dead || me.map !== this.toPortal || !portal) {
            this.toPortal = null;

            return;
        }

        if (me.order || me.path.length) {
            return;
        }

        this.toPortal = null;

        if (atPortal(portal, me.x, me.y)) {
            this.openPortal();
        }
    }

    /**
     * Open the travel map at the guild's portal the player stands at (core/portals.js): the
     * branches open to them, each with its fare at their rank; one chosen and agreed to, they step
     * through (`travel`). Returns { ok, branches } ([{ id, name, x, z, metres, fare, here }]), or
     * why not ({ ok: false, reason }: not at a portal, or not a member of the guild: said).
     */
    openPortal() {
        const me = this.battle.actor(this.me);
        const here = branchOf(this.world.interiors?.of(this.mapId), this.world.start);
        const portal = portalOn(this.world.maps?.[this.mapId]);

        if (!me || me.dead || !here || !portal || !atPortal(portal, me.x, me.y)) {
            return { ok: false, reason: "portal" };
        }

        const rank = this.standing.guildRank();

        if (rank === null) {
            this.hud.message("The veil stays dark: the portals are for the guild's members. Register at the counter first.", 4);

            return { ok: false, reason: "unregistered" };
        }

        const branches = branchesFrom(this.world.plan, this.explored.portals ?? new Set(), here, rank);

        this.onWorldMap({ travel: { branches, gold: this.progress.gold, rank: GUILD_RANKS[rank].title, off: fareOff(rank), choose: (id) => this.travel(id) } });

        return { ok: true, branches };
    }

    /**
     * Step through the portal the player stands at to another branch of the guild they've been
     * into (`to`: its place's id), for its fare: the host's (core/host.js #travel). Its result, as
     * the host gave it (refused: said).
     */
    travel(to) {
        return this.#command({ type: "travel", to }, (result) => {
            if (!result?.ok) {
                this.hud.message(REFUSALS[result?.reason] ?? REFUSALS.command, 3);

                if (result?.reason === "gold") {
                    this.sound?.play("buyDenied");
                }

                return;
            }

            this.hud.setGold(this.progress.gold);
            this.onProgress(this.progress);
        });
    }

    /**
     * Which way the camera looks over the ground (radians, as core/battle.js means "facing"), for
     * steering by held keys or a thumb stick; or null while there's nobody to steer — dead, paused,
     * talking, or reading a panel — so that held input stops instead of walking on blind.
     */
    #steerable() {
        const player = this.battle.actor(this.me);

        if (!this.running || !this.avatars.get(this.me) || !player || player.dead) {
            return null;
        }

        if (this.talk?.open || this.pack?.open || this.journal?.open || this.spellbook?.open || this.fate?.open) {
            return null;
        }

        const looking = this.view.camera.getWorldDirection(_looking);

        // (Looking straight down tells us nothing: the way they face stands in)
        return Math.hypot(looking.x, looking.z) > 1e-3 ? Math.atan2(looking.x, looking.z) : player.facing;
    }

    /**
     * Turn the player the way the camera looks, and go straight ahead that way as far as the way
     * is clear: running while their stamina lasts, then walking (a swipe up from them).
     */
    forward() {
        this.#wake();

        const avatar = this.avatars.get(this.me);
        const player = this.battle.actor(this.me);

        if (!avatar || !player || player.dead) {
            return;
        }

        // (The way the camera looks over the ground; looking straight down, the way they face)
        const looking = this.view.camera.getWorldDirection(_looking);
        const facing = Math.hypot(looking.x, looking.z) > 1e-3 ? Math.atan2(looking.x, looking.z) : avatar.facing;

        this.#command({ type: "ahead", facing, run: true });

        const goal = player.order?.to;
        const [ox, oz] = this.originOf(player.map);

        if (goal) {
            this.effects.markTarget(ox + goal[0] + 0.5, oz + goal[1] + 0.5);
        } else {
            this.sound?.play("denied");
        }
    }

    /**
     * Try an action (app/wheel.js: an ACTIONS key, or "item:" and a thing to use) on a target:
     * "self" (the player) or an enemy's id. Returns the battle's answer: { ok } or { ok: false,
     * reason }, saying why not to the player, and telling `refused` (the slot it was chosen from,
     * flashed refused), once the host's answered.
     */
    act(action, target, { refused = null } = {}) {
        this.#wake();

        const { spell, order, ability, item, emote } = actionOf(action) ?? {};
        const on = target === "self" ? null : target;

        // (Somewhere to go, picked on the world map; someone to summon, chosen)
        if (spell && SPELLS[spell].target === "place") {
            return this.#pickPlace(spell);
        }

        if (spell && SPELLS[spell].target === "summon" && on === null && this.#summonable().length) {
            return this.#chooseSummons(spell);
        }

        // (Making camp: how long, asked once it's somewhere a camp can be made)
        if (order === "camp") {
            return this.#chooseCamp();
        }

        const command = spell ? { type: "cast", spell, target: on } : ability ? { type: "ability", ability, target: on } : order ? { type: order, target } : item ? { type: "use", item } : emote ? { type: "emote", emote } : null;

        const heard = (result) => {
            // (Setting on someone: the lock heard, as a tap on an enemy)
            if (order === "engage" && result.ok) {
                this.sound?.play("lock");
            }

            if (!result.ok) {
                this.hud.message(REFUSALS[result.reason] ?? CAST_FAILURES[result.reason], 1.4);
                this.sound?.play("denied");
                refused?.();
            }
        };

        if (!command) {
            heard({ ok: false, reason: "busy" });

            return { ok: false, reason: "busy" };
        }

        return this.#command(command, heard);
    }

    // Why a spell can't be cast just now, before choosing where or on whom (or null): not known
    // (an element's first spell: not yet read, its tome at the guild), cooling down, or not the
    // right thing in hand
    #unready(spell) {
        const actor = this.battle.actor(this.me);
        const needs = SPELLS[spell].needs;

        if (!this.progress.knows(spell)) {
            return ELEMENT_TOMES.includes(spell) ? "unread" : "unknown";
        }

        return this.battle.cooldown(this.me, spell) > 0 ? "cooldown" : needs && actor?.weapon !== needs ? needs : null;
    }

    // Told why a spell wasn't cast (or nothing, if it was)
    #castHeard(result) {
        if (!result.ok) {
            this.hud.message(REFUSALS[result.reason] ?? CAST_FAILURES[result.reason], 1.4);
            this.sound?.play("denied");
        }
    }

    // Wizard's Walk: somewhere picked on the world map (somewhere they've been), then cast
    #pickPlace(spell) {
        const why = this.#unready(spell);

        if (why) {
            this.#castHeard({ ok: false, reason: why });

            return { ok: false, reason: why };
        }

        this.onWorldMap({ pick: (point) => point && this.#command({ type: "cast", spell, at: point }, (result) => this.#castHeard(result)) });

        return { ok: true };
    }

    // The other players who could be summoned (none of a people at war with the player's)
    #summonable() {
        const me = this.battle.actor(this.me);

        return [...this.host.players.values()].filter(({ id }) => id !== this.me && this.battle.actor(id) && !this.battle.hostile(this.battle.actor(id), me));
    }

    // Summon: a creature of these parts, or another player (chosen), then cast
    // How long to camp, asked (once a camp can be made here): so many hours (the last chosen to
    // start with), till sundown (when the night's creatures come out) or till the morning
    #chooseCamp() {
        const why = this.host.campRefusal(this.me);

        if (why) {
            this.hud.message(REFUSALS[why], 1.4);
            this.sound?.play("denied");

            return { ok: false, reason: why };
        }

        const elapsed = elapsedOf(this.host.war);

        this.hud.chooseCamp({ hours: this.campHours ?? 8, least: CAMP_HOURS.least, most: CAMP_HOURS.most, sundown: campFor(elapsed, "sundown") / HOUR, morning: campFor(elapsed, "morning") / HOUR }, (until) => {
            if (until === undefined) {
                return;
            }

            if (until.hours) {
                this.campHours = until.hours;
            }

            this.#command({ type: "camp", until }, (result) => {
                if (!result.ok) {
                    this.hud.message(REFUSALS[result.reason] ?? "Can't do that.", 1.4);
                    this.sound?.play("denied");
                }
            });
        });

        return { ok: true };
    }

    #chooseSummons(spell) {
        const why = this.#unready(spell);

        if (why) {
            this.#castHeard({ ok: false, reason: why });

            return { ok: false, reason: why };
        }

        this.hud.choose("Summon", [{ label: "A creature of these parts", value: null }, ...this.#summonable().map(({ id, hero }) => ({ label: hero.name, value: id }))], (target) => {
            if (target !== undefined) {
                this.#command({ type: "cast", spell, target }, (result) => this.#castHeard(result));
            }
        });

        return { ok: true };
    }

    // Who is under a point on the screen, within PICK_RADIUS of their feet, middle or head: the
    // nearest living enemy, one of the folk, a soldier who isn't an enemy or another player (if `folk`), a soldier
    // of a people not friendly to the player's (if `soldiers`: to pick a fight with), or the
    // player (if `player`); { actor, wheel: "enemy", "talk", "provoke" or "self" }
    #whoIsAt(clientX, clientY, { player: withPlayer = true, folk = false, soldiers = false, allies = false } = {}) {
        const player = this.battle.actor(this.me);
        let best = null;
        let bestDistance = PICK_RADIUS;

        if (!player) {
            return null;
        }

        for (const actor of this.battle.actors) {
            const mine = actor === player;

            const enemy = !mine && this.battle.hostile(actor, player);
            const talks = actor.neutral || actor.kind === "soldier" || actor.kind === "player" || (actor.kind === "follower" && this.host.followers.get(actor.id)?.leader === this.me);
            const provokes = actor.kind === "soldier" && !enemy && this.host.canFight(player, actor);

            // (Anyone else who isn't an enemy, `allies`: to heal them)
            if (actor.dead || (mine && !withPlayer) || (!mine && !enemy && !(folk && talks) && !(soldiers && provokes) && !allies) || actor.map !== player.map || !this.avatars.has(actor.id)) {
                continue;
            }

            const avatar = this.avatars.get(actor.id);

            for (const share of [0.2, 0.5, 0.8]) {
                const point = this.view.toScreen(avatar.point(share));
                const distance = point ? Math.hypot(point.x - clientX, point.y - clientY) : Infinity;

                // (Enemies first, where they and the player overlap)
                if (distance < bestDistance - (mine ? 6 : 0)) {
                    best = { actor, wheel: mine ? "self" : enemy ? "enemy" : provokes && soldiers ? "provoke" : allies ? "ally" : "talk" };
                    bestDistance = distance;
                }
            }
        }

        return best;
    }

    // The finger's been held on someone: open the wheel round them, at its first side
    #openWheel(pointer, { actor, wheel }) {
        const player = this.battle.actor(this.me);

        if (!this.running || player.dead || actor.dead || this.pointers.size !== 1) {
            return;
        }

        const centre = this.view.toScreen(this.avatars.get(actor.id).point(0.55));

        if (!centre) {
            return;
        }

        pointer.wheel = { originX: pointer.x, originY: pointer.y, target: wheel === "self" ? "self" : actor.id, kind: wheel, side: 0, refused: null, done: false };
        this.#showWheel(pointer.wheel, centre.x, centre.y);
        this.sound?.play("wheel");
        globalThis.navigator?.vibrate?.(12);
    }

    // A wheel open (or turned over) at a point on the screen: its side's slices, how many of each
    // thing to use there are, which can't be used as things are, and what's cooling down
    #showWheel(open, x, y) {
        const slots = open.kind === "provoke" ? WHEELS.provoke[0] : (this.wheels[open.kind === "ally" ? "self" : open.kind]?.[open.side] ?? {});
        const counts = {};
        const off = [];
        const learnt = [...this.progress.known(), ...this.progress.abilities()];
        const weapon = WEAPONS[this.battle.actor(this.me)?.weapon];

        for (const [direction, key] of Object.entries(slots)) {
            const action = actionOf(key);
            const blow = ABILITIES[action?.ability]?.blow;

            if (action?.item) {
                counts[action.item] = this.progress.count(action.item);
            }

            // (A thing all used up; an ability not learnt; a blow for another kind of weapon; held
            // on someone else who isn't an enemy, anything but a spell that can be cast on them)
            const notForThem = open.kind === "ally" && (action?.spell ? !forFriends(action.spell) : Boolean(action));

            if (notForThem || (action?.item && !counts[action.item]) || (action?.learnt && !learnt.includes(action.learnt)) || (blow && !weapon?.attacks.some(({ kind }) => (kind === "ranged" ? "ranged" : "melee") === blow))) {
                off.push(direction);
            }
        }

        this.wheel.show(x, y, open.target, slots, { side: open.side, flip: open.kind !== "provoke", counts, off });
        this.wheel.setCooldown(this.#cooldowns(slots));
    }

    // How much of each slice's cooldown is left (0 to 1, by direction): each spell's (its own, or
    // the one all share, whichever's longer), and each blow's own
    #cooldowns(slots) {
        const shares = {};
        const readyAt = this.host.players.get(this.me)?.readyAt ?? {};

        for (const [direction, key] of Object.entries(slots ?? {})) {
            const action = actionOf(key);
            const cooldown = ABILITIES[action?.ability]?.cooldown;

            if (action?.spell) {
                shares[direction] = this.battle.cooldown(this.me, action.spell);
            } else if (cooldown) {
                shares[direction] = Math.max(0, Math.min(1, ((readyAt[action.ability] ?? 0) - this.battle.time) / cooldown));
            }
        }

        return shares;
    }

    // The finger moves with the wheel open: into a slice, try its action (once); into S, turn
    // the wheel over, opened again under the finger
    #steerWheel(pointer) {
        const open = pointer.wheel;

        if (open.done) {
            return;
        }

        const direction = directionOf(pointer.x - open.originX, pointer.y - open.originY, FLICK);

        if (!direction) {
            open.refused = null;
            this.wheel.mark(null);

            return;
        }

        if (this.wheel.flipsAt(direction)) {
            open.side = (open.side + 1) % SIDES;
            open.originX = pointer.x;
            open.originY = pointer.y;
            open.refused = null;
            this.#showWheel(open, pointer.x, pointer.y);
            this.sound?.play("wheel");
            globalThis.navigator?.vibrate?.(8);

            return;
        }

        const action = this.wheel.actionAt(direction);
        const cooling = (this.#cooldowns({ [direction]: action })[direction] ?? 0) > 0;

        if (!action || cooling || this.wheel.offAt(direction)) {
            if (open.refused !== direction) {
                open.refused = direction;
                this.wheel.mark(direction, "refused");
                this.sound?.play("denied");
            }

            return;
        }

        open.done = true;
        this.wheel.mark(direction, "chosen");
        this.sound?.play("wheelSelect");
        this.wheel.hide({ after: 180 });
        this.act(action, open.target, { refused: () => this.wheel.mark(direction, "refused") });
    }

    /**
     * What's on the player's action wheels (their own and an enemy's, two sides each), what can
     * be put on each (app/wheel.js assignable), and how many of each thing they carry: for the
     * Action wheels options.
     */
    wheelSetup() {
        const learnt = [...this.progress.known(), ...this.progress.abilities()];
        const carries = this.progress.carried();

        const counts = Object.fromEntries(Object.keys(ITEMS).map((id) => [id, this.progress.count(id)]));

        return { wheels: structuredClone(this.wheels), choices: { self: assignable("self", { learnt, carries }), enemy: assignable("enemy", { learnt, carries }) }, counts };
    }

    /** Put things on the player's action wheels (as the Action wheels options have them), and keep them. */
    setWheels(wheels) {
        this.wheels = readWheels(wheels);
        this.onWheels(structuredClone(this.wheels));
    }

    #closeWheel() {
        if (this.wheel?.open) {
            this.wheel.hide();
        }
    }

    // --- The quick actions (app/quickbar.js) ---

    // Is anyone after the player: an enemy on their map set to fight them, or striking at them?
    #underAttack(player) {
        return this.battle.actors.some((other) => (other.target === player.id || other.attack?.target === player.id) && !other.dead && other.map === player.map && this.battle.hostile(other, player));
    }

    // The quick actions up in a fight (an enemy the player's set to fight, `target`, or anyone
    // after them) and for a moment after it, each greyed while it can't be used and swept over
    // while it cools down
    #quickActions(target) {
        const player = this.battle.actor(this.me);
        const alive = Boolean(player) && !player.dead;

        if (alive && (target || this.#underAttack(player))) {
            this.fightUntil = this.clock + QUICK_LINGER;
        }

        this.quickBar.raise(alive && this.clock < this.fightUntil);

        if (!this.quickBar.up) {
            return;
        }

        const keys = this.wheels.quick;
        const counts = {};
        const off = [];

        keys.forEach((key, slot) => {
            const item = actionOf(key)?.item;

            if (item) {
                counts[item] = this.progress.count(item);
            }

            if (this.#quickRefusal(key, target)) {
                off.push(slot);
            }
        });

        this.quickBar.fill(keys, { counts, off });

        const cooling = this.#cooldowns(Object.fromEntries(keys.map((key, slot) => [slot, key])));

        this.quickBar.setCooldown(keys.map((_, slot) => cooling[slot] ?? 0));
    }

    // Why a quick action can't be used as things are, but for cooling down (or null): nothing in
    // it ("empty"); not learnt (an element's first spell's tome not read); none of it left; a blow
    // for another kind of weapon, or a spell needing a wand or grimoire in hand; or an attack, a
    // hex or a blow with no enemy set on (`target`) to use it on
    #quickRefusal(key, target) {
        const action = actionOf(key);

        if (!action) {
            return "empty";
        }

        if (action.spell) {
            const unready = this.#unready(action.spell);

            if (unready && unready !== "cooldown") {
                return unready;
            }
        }

        if (action.ability && !this.progress.abilities().includes(action.ability)) {
            return "unknown";
        }

        if (action.item && !this.progress.count(action.item)) {
            return "none";
        }

        const blow = ABILITIES[action.ability]?.blow;
        const weapon = WEAPONS[this.battle.actor(this.me)?.weapon];

        if (blow && !weapon?.attacks.some(({ kind }) => (kind === "ranged" ? "ranged" : "melee") === blow)) {
            return "weapon";
        }

        return offensive(key) && !target ? "untargeted" : null;
    }

    /**
     * Use a quick action (its slot, 0 to 3, from the left): an attack, a hex or a blow on the enemy
     * the player's set to fight, anything else on themselves; refused (and said why) if it can't
     * be, as things are, or is cooling down. An empty slot's to be filled (onChooseQuick).
     */
    quick(slot) {
        const key = this.wheels.quick[slot] ?? null;
        const target = this.#target();
        const why = this.#quickRefusal(key, target) ?? ((this.#cooldowns({ slot: key }).slot ?? 0) > 0 ? "cooldown" : null);

        if (why === "empty") {
            this.onChooseQuick(slot);

            return { ok: false, reason: why };
        }

        if (why) {
            this.quickBar?.mark(slot, "refused");
            this.hud.message(QUICK_REFUSALS[why] ?? CAST_FAILURES[why] ?? REFUSALS[why], 1.4);
            this.sound?.play("denied");

            return { ok: false, reason: why };
        }

        this.quickBar?.mark(slot, "chosen");
        this.sound?.play("quickAction");

        return this.act(key, offensive(key) ? target.id : "self", { refused: () => this.quickBar?.mark(slot, "refused") });
    }

    /**
     * What's in the player's quick actions, what can be put in them (app/wheel.js assignable), and
     * how many of each thing they carry: for the Quick actions options.
     */
    quickSetup() {
        const learnt = [...this.progress.known(), ...this.progress.abilities()];
        const counts = Object.fromEntries(Object.keys(ITEMS).map((id) => [id, this.progress.count(id)]));

        return { quick: [...this.wheels.quick], choices: assignable("quick", { learnt, carries: this.progress.carried() }), counts };
    }

    /** Put things in the player's quick actions (as the Quick actions options have them), and keep them. */
    setQuick(quick) {
        this.wheels = readWheels({ ...this.wheels, quick });
        this.onWheels(structuredClone(this.wheels));
    }

    /**
     * A tap on the minimap, at a point on the player's map (x, z metres) and on the screen
     * (clientX, clientY): fight an enemy within `reach` metres of it, or walk there. Twice in
     * quick succession, run.
     */
    mapTap({ x, z, reach = 3, clientX = 0, clientY = 0, run = false, time = performance.now() }) {
        this.#wake();

        const player = this.battle.actor(this.me);
        const enemies = this.battle.actors.filter((actor) => player && this.battle.hostile(actor, player) && !actor.dead && actor.map === player.map);
        const distance = (actor) => Math.hypot(actor.x - x, actor.y - z);
        const enemy = enemies.filter((actor) => distance(actor) <= reach).sort((a, b) => distance(a) - distance(b))[0] ?? null;

        this.#order({ enemy, ground: enemy ? null : [x, z] }, { clientX, clientY, run, time, from: "map" });
    }

    // Send the player to fight an enemy, through a door (or up or down the stairs), or to a point
    // on the ground ([x, z] metres, on their map), running if told to or tapped twice in quick
    // succession (in the same place: the view or the minimap)
    #order({ enemy, door = null, portal = null, table = null, ground }, { clientX, clientY, run, time, from }) {
        const player = this.battle.actor(this.me);
        const last = this.lastTap;

        this.lastTap = { time, x: clientX, y: clientY, from };

        // Going somewhere else, or after someone: no more talking
        this.#endTalk();
        this.approaching = null;

        if (!player || player.dead) {
            return;
        }

        run ||= last !== null && last.from === from && time - last.time <= DOUBLE_TAP_MS && Math.hypot(clientX - last.x, clientY - last.y) <= DOUBLE_TAP_SLOP[from];

        if (enemy) {
            const chosen = player.order?.type === "engage" && player.order.target === enemy.id;

            this.#command({ type: "engage", target: enemy.id, run });

            if (!chosen) {
                this.sound?.play("lock");
            }

            return;
        }

        // The door's edge glows green as they make for it
        if (door) {
            this.#command({ type: "enter", link: door.link.id, run });
            this.doors.light(door, this.clock);

            return;
        }

        // The guild's portal: up to it, and its travel map opens (#keepToPortal)
        if (portal) {
            const [ox, oz] = this.originOf(player.map);
            const square = beforePortal(portal);

            if (atPortal(portal, player.x, player.y) && !player.path.length) {
                this.openPortal();

                return;
            }

            this.#command({ type: "move", to: square, run });
            this.toPortal = player.map;
            this.effects.markTarget(ox + square[0] + 0.5, oz + square[1] + 0.5);

            return;
        }

        // The war table: up to it, and its map opens (#keepToTable)
        if (table) {
            const [ox, oz] = this.originOf(player.map);
            const square = beforeWarTable(table);

            if (atWarTable(table, player.x, player.y) && !player.path.length) {
                this.openWarTable();

                return;
            }

            this.#command({ type: "move", to: square, run });
            this.toTable = player.map;
            this.effects.markTarget(ox + square[0] + 0.5, oz + square[1] + 0.5);

            return;
        }

        if (!ground) {
            return;
        }

        const map = this.world.maps?.[player.map] ?? this.world;
        const [ox, oz] = this.originOf(player.map);
        const x = Math.min(map.width - 1, Math.max(0, Math.floor(ground[0])));
        const y = Math.min(map.height - 1, Math.max(0, Math.floor(ground[1])));

        this.#command({ type: "move", to: [x, y], run });

        const goal = this.battle.actor(this.me).order?.to ?? [x, y];

        this.effects.markTarget(ox + goal[0] + 0.5, oz + goal[1] + 0.5);
    }

    // Joined, the player's hero sent somewhere (or straight ahead): drawn going at once, and
    // caught up with once it's done (`then` hearing what came of it as before)
    #predicting(command, then) {
        const player = this.battle.actor(this.me);

        if (!this.predict || !player) {
            return then;
        }

        if (command.type !== "move" && command.type !== "ahead") {
            if (STEERING.has(command.type)) {
                this.predict.other();
            }

            return then;
        }

        const to = command.type === "move" ? [command.to[0] + 0.5, command.to[1] + 0.5] : [player.x + Math.sin(command.facing) * AHEAD, player.y + Math.cos(command.facing) * AHEAD];

        this.predict.ordered(player, to, Boolean(command.run), this.clock * 1000);

        return (result) => {
            this.predict?.done(result, this.clock * 1000);
            then?.(result);
        };
    }

    // What the player does, sent to the host (core/host.js command): { ok }, or { ok: false,
    // reason } if it can't be done
    // A command of the player's, to the host: `then` hears what came of it (at once, playing alone
    // or hosting; joined to another's world, once the host's done it and it's been done here too)
    #command(command, then = null) {
        // (Anything the player does themselves ends running somewhere far: not resisting a
        // summons, done for them; and walking up to the portal or the war table)
        if (!this.journeying && !(command.type === "summoned" && !command.come)) {
            this.journey = null;
        }

        this.toPortal = null;
        this.toTable = null;

        if (this.remote) {
            return this.remote.command(command, this.#predicting(command, then));
        }

        const result = this.host.command(this.me, command);

        then?.(result);

        return result;
    }
}
