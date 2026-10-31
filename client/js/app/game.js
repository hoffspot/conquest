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
import { folkLook, followerLook } from "../characters/folk.js";
import { folkBuild, folkFigureLook, folkKind, folkTint } from "../characters/folkcrowd.js";
import { soldierLook } from "../characters/soldiers.js";
import { FOLK, PRESETS } from "../characters/presets.js";
import { BeastAvatar, dressCreature, dressingCreature, sizeOf } from "../beasts/beast.js";
import { fetchModel, forgetModels, keptModels, MODEL_LINGER, MODELS, modelOf, modelsInside, modelsMet, modelsNear, readyModels, wantModel } from "../beasts/model.js";
import { herds, makingHerdTemplate } from "../beasts/herd.js";
import { forget as forgetBodies, kept as keptBodies } from "../beasts/sculpt.js";
import { LOOKS as CREATURE_LOOKS, humanoidLook } from "../beasts/looks.js";
import { AFFLICTIONS } from "../core/afflictions.js";
import { DAY, daylight, elapsedOf, HOUR, moonPhase, timeOfDay } from "../core/daytime.js";
import { cheering, greetingOf, isEmote } from "../core/emotes.js";
import { carriesTorch, playerSight, sightAt, torchesLit } from "../core/light.js";
import { aloftShare, BOMBS, LOCK_REACH, SIGHT, sitting, STEP_MS, TALK_REACH, WAIT_BEYOND } from "../core/battle.js";
import { CACHE_BANDS } from "../core/caches.js";
import { FINDS, foodFor, FRESH, HEALING_DRAUGHTS, OBSTACLES, STRANGERS } from "../core/director.js";
import { compass } from "../core/ways.js";
import { campOf, cardOf, keeperOf, LOCKS, lockSite, openerOf, talksFor, THREADS, threadTalk, threadTracks, threadWords, UNIQUES } from "../core/rare.js";
import { CREATURES, ELITES, LAIRS, notable } from "../core/creatures.js";
import { BESTIARY_LORE } from "../core/lore/bestiary.js";
import { homeWords, signOf, signsNear, TRAILS, trailsNear } from "../core/tracks.js";
import { denOf, densOf } from "../core/dens.js";
import { MASTERED, RESEARCH } from "../core/bestiary.js";
import { bestiaryOf } from "./bestiary.js";
import { townOf } from "../core/insides.js";
import { holderOf, LAIR_KINDS, PLACE_BANDS, placesOf } from "../core/places.js";
import { CHUNK } from "../core/worldplan/plan.js";
import { atPortal, beforePortal, branchesFrom, branchOf, fareOff, portalOn } from "../core/portals.js";
import { atWarTable, beforeWarTable, mayRead, warTableOn } from "../core/wartable.js";
import { atWriting, beforeWriting, keepRead, WRITINGS, writingOn } from "../core/writings.js";
import { ambienceOf, doorOf, TOLLS, tolled } from "../audio/ambience.js";
import { footing } from "../audio/footing.js";
import { useSound, wearSound } from "../audio/handling.js";
import { CREATURE_VOICES, creatureSounds, ITEM_SOUNDS, spellSounds } from "../audio/sound.js";
import { FORT_ICONS, ICON_NAMES, partyColour, PING, PLACE_RIMS, WORKS_ICONS, WORKS_RIMS } from "./mapicons.js";
import { buildingView } from "./building.js";
import { battleMapView, heededText } from "./battlemap.js";
import { PALISADE } from "../core/war/armies.js";
import { affords, CLEARING, footprintOf, FORTS } from "../core/war/forts.js";
import { brokenOf } from "../core/war/stockade.js";
import { HELD_REACH, Steering } from "./steering.js";
import { Surroundings } from "./surroundings.js";
import { Conversation, treeFor, upstairsIs } from "../core/dialogue.js";
import { CAMP_HOURS, campFor, CONVOY_NEAR, HIRES, HOST_PLAYER, Host, OFFICIALS, PARTY, PICK_REACH, REFUSALS, SAFETY, SHOP_REACH, SHOPKEEPERS, snagChoice, snaggable, STORM, TRADE, UNDO_MS, WORKS_OUT } from "../core/host.js";
import { dress } from "../characters/liveries.js";
import { GEAR, GEAR_SLOTS, levelOf, offHandFree } from "../core/gear.js";
import { EFFECTS } from "../core/legendary.js";
import { fightLook, mightTier } from "../core/might.js";
import { ABILITIES, buys, itemLabel, ITEMS, priceOf, Progress, shopOrder, TREES, WARE_KINDS, wareKind, wares } from "../core/progress.js";
import { TREASURE } from "../core/treasure.js";
import { atLevel, shopPrice } from "../core/stock.js";
import { isGuid } from "../core/guid.js";
import { CHAT, DMS_TAKEN, PACE } from "../core/netplay.js";
import { WorldRunner } from "../core/runner.js";
import { BOARD_SIZE, briefOf, COUNSEL, GUILD_RANKS, MOST_REQUESTS, objectiveOf, OPENS, progressOf, STANDINGS, whereTo } from "../core/standing.js";
import { describeLeader } from "../core/war/peoples.js";
import { CRY, newsCount, newsSince, peopleOf, rumourOfRuler, rumoursAt } from "../core/war/news.js";
import { bubbleSeconds, CALLING, callOf } from "../core/crying.js";
import { ALARM, bandOf, BEHEMOTH, BOMBERS, criesOf, INVASION, thanksOf } from "../core/invasions.js";
import { burntCry, burntIn, burntWords, rebuiltWords, stageOf } from "../core/burnt.js";
import { createRandom } from "../core/random.js";
import { cultNear, cultWays, cultWord } from "../core/cultword.js";
import { circleOf, rumouredBy, rumoursNear, rumourWord, RUMOURS } from "../core/rumours.js";
import { ADJECTIVES } from "../core/war/peoples.js";
import { RESOURCES, RISING, STAGES } from "../core/war/war.js";
import { GODS, PANTHEON } from "../core/lore/gods.js";
import { GIFTS, godWords, SHRINE, shrineOf, shrinesOf } from "../core/shrines.js";
import { FULL_MOON, NEW_MOON, nightOf, PHASES, phaseOfNight, ringName, ringOf, ringsOf, TRIAL, trialOf } from "../core/rings.js";
import { MoonGates } from "../world/moongates3d.js";
import { ACT_TIMES, PLAYER_RESTS_AFTER, REST_EVERY, ROLES } from "../core/roles.js";
import { squaresOf } from "../core/grid.js";
import { crossingsOf, lengthOf, nearestAlong, pointAlong, wayAcross, wayFrom } from "../core/journey.js";
import { MARKER_NAMES, MARKERS, markersOf, withMarker } from "../core/markers.js";
import { MARGIN as WAY_MARGIN, navigatorOf, releaseNavigation } from "../core/navigation.js";
import { wasmBytes } from "../core/navigation/recast.js";
import { RAISED } from "../core/overworld.js";
import { heightAt as landHeightAt } from "../core/terrain/height.js";
import { GROUND } from "../core/setpieces/pieces.js";
import { CAST_FAILURES, ELEMENT_TOME_PRICE, ELEMENT_TOMES, GROWTH_XP, lookOf, SCHOOLS, SPELLS, TOMES } from "../core/spells.js";
import { nextOf, sigilSpell } from "../core/prismatic.js";
import { Variety } from "../core/variety.js";
import { distanceBetween, longestReach, weaponOf, WEAPONS } from "../core/weapons.js";
import { Avatar, posingEvery } from "../world/avatar.js";
import { Crowd, CROWD, CROWD_CASTS, CrowdAvatar, offstage, onstage } from "../world/crowd.js";
import { megabytes } from "../world/gpumemory.js";
import { heldOnPage } from "../world/release.js";
import { NavBaker } from "../world/navbaker.js";
import { fadeNear } from "../world/nearfade.js";
import { Banners } from "../world/banners3d.js";
import { Camps } from "../world/camps3d.js";
import { FortAvatar, Forts } from "../world/forts3d.js";
import { EngineAvatar } from "../world/siege3d.js";
import { Stockades } from "../world/stockades3d.js";
import { ContactShadows } from "../world/contacts.js";
import { footAt, lookPrint, printOf, TAKES, Tracks } from "../world/tracks3d.js";
import { TrailSigns } from "../world/signs3d.js";
import { DEN_LOOK, DenProps } from "../world/dens3d.js";
import { FIND_LOOK, FindProps } from "../world/finds3d.js";
import { AmbushProps, BaitLook, EyeShine, WILD_LOOK } from "../world/wild3d.js";
import { BAIT, WARY } from "../core/wary.js";
import { STYLES as AMBUSH_STYLES } from "../core/ambush.js";
import { OBSTACLE_LOOK, ObstacleProps } from "../world/obstacles3d.js";
import { Flyers } from "../world/flyers3d.js";
import { Drops } from "../world/drops3d.js";
import { Ailments3D } from "../world/ailments3d.js";
import { Effects, LOOKS } from "../world/effects.js";
import { missileTravel, SpellFx } from "../world/spellfx.js";
import { Squares } from "../world/squares.js";
import { BIG_FOE, detectQuality, DISTANCE, DUNGEON_VIEW, dungeonPose, QUALITY, ROOM_VIEW } from "../world/view.js";
import { cutRock, DUNGEON_CUT } from "../world/dungeons3d.js";
import { showSilhouette, SILHOUETTE } from "../world/silhouette.js";
import { KINDS, Wounds } from "../world/wounds.js";
import { Chunks, DECK, LOAD_BUDGET, REACH } from "../world/chunks3d.js";
import { TallGrass } from "../world/grass.js";
import { Motes, MOTES_OF } from "../world/motes.js";
import { Trickles } from "../world/trickles.js";
import { EMBER_SCALE } from "../world/fire.js";
import { GLOW_SCALE } from "../world/lights.js";
import { CarriedTorches } from "../world/carried.js";
import { LightGlobes } from "../world/globes.js";
import { PingBeacons, PinMarks, WAY_LINE } from "../world/pin3d.js";
import { TreasureGlints } from "../world/treasure3d.js";
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
import { VEIL } from "../world/veil.js";
import { hitch } from "../world/art/kits/wagon.js";
import { compassTurn, Minimap, treesOf } from "./minimap.js";
import { CameraFollow, PITCH } from "./camera.js";
import { Doors } from "./doors.js";
import { VaultDoors } from "../world/vault3d.js";
import { Readying } from "./readying.js";
import { FatePanel, fateWords } from "./fate.js";
import { plateScale } from "./hud.js";
import { itemPicture } from "./icons.js";
import { JournalPanel, bearing, keepMessage, regardOf } from "./journal.js";
import { ReaderPanel } from "./reader.js";
import { Journey } from "./journey.js";
import { SpellbookPanel } from "./spellbook.js";
import { PartyPanel } from "./partypanel.js";
import { PackPanel } from "./pack.js";
import { Governor } from "./governor.js";
import { PHASE, telemetry } from "./telemetry.js";
import { InvasionBudget } from "./budget.js";
import { Throng } from "./throng.js";
import { Pacing } from "./pacing.js";
import { Forecast } from "./forecast.js";
import { FIGHT_LINGERS, inFight } from "./fight.js";
import { charmWords, describe, gearWords, kindOf, totals } from "./gearinfo.js";
import { TalkPanel } from "./talk.js";
import { QuickBar, QUICK_LINGER, QUICK_REFUSALS } from "./quickbar.js";
import { Sigil } from "./sigil.js";
import { Charge } from "./charge.js";
import { LegendaryLooks } from "../world/legendaries.js";
import { worldLinkOf } from "./worldlink.js";
import { abilityIcon, ACTIONS, ActionWheel, actionOf, assignable, directionOf, flicked, forFriends, iconOf, offensive, PLACES, QUICK_SHOWN, readWheels, SETTABLE, SIDES, WHEELS } from "./wheel.js";
import { BARKS, bynameOf, GIFTS as VETERAN_GIFTS, hirePrice, KNACKS, LEVEL_XP, MASTERY, MERCENARY, recallPrice, RENOWN, TRUST_PICKS, trustOf, wearable } from "../core/followers.js";
import { formationsOfBody } from "../core/engagement.js";

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

// The bait for the wild's beasts put on an enemy's wheel of itself the first time it's carried
// (#placeBait, core/wary.js)
const PLACED_OF_ITSELF = Object.freeze(["meatBait", "feedBag"]);

// A wary beast's warning (core/wary.js WARY `display`): a blow at nothing (`attack`, its kind's,
// as beasts/looks.js names them) or one of its ways of resting (`rest`), and what's heard with it
// (`sound`: synth.js's; "call", its own call: sound.js voice)
const WARNINGS = Object.freeze({
    snarl: Object.freeze({ attack: "snap", sound: "beastGrowl" }),
    snap: Object.freeze({ attack: "snap", sound: "beastGrowl" }),
    scrape: Object.freeze({ rest: "root", sound: "beastSnort" }),
    rear: Object.freeze({ attack: "maul", sound: "call" }),
    hiss: Object.freeze({ attack: "swipe", sound: "beastHiss" }),
    paw: Object.freeze({ attack: "stamp", sound: "beastSnort" }),
    antlers: Object.freeze({ attack: "toss", sound: "beastSnort" }),
    coil: Object.freeze({ rest: "coil", sound: "beastHiss" }),
    bristle: Object.freeze({ attack: "bristle", sound: "quillRattle" }),
    mob: Object.freeze({ rest: "scatter", sound: "call" }),
});

// How a wary beast's minded, said to a player who knows its kind (its page in their bestiary at
// MINDS_KNOWN or past: core/bestiary.js), once for each pack and mood
const MINDS = Object.freeze({
    warn: (name) => `The ${name}'s hackles are up: it'll come at you if you come on, or stay. Back away.`,
    stalk: (name) => `The ${name}'s watching you, keeping its distance: waiting for you to weaken.`,
    watch: (name) => `The ${name} watches you warily, keeping off.`,
    avoid: (name) => `The ${name} wants nothing to do with you.`,
    curious: (name) => `The ${name}'s curious about you. Feed it, and it may follow you.`,
});
const MINDS_KNOWN = 2;

// An ambush's tells (core/ambush.js STYLES `tell`): what's said to whoever's near it as it's told,
// what's heard (synth.js), and what's seen there (effects.js BURSTS: at one of those lying in
// wait, or over its heart in the trees, `over`)
const TELLS = Object.freeze({
    glint: Object.freeze({ said: "Steel glints in the brush ahead. Someone's waiting there.", sound: "steelGlint", burst: "sparks" }),
    twig: Object.freeze({ said: "A twig snaps in the brush ahead. Something's waiting there.", sound: "twigSnap", burst: "leaves" }),
    quiet: Object.freeze({ said: "The birds burst from the trees ahead, and go quiet.", sound: "birdsFlush", burst: "birds", over: true }),
    earth: Object.freeze({ said: "The earth ahead's been turned, not long since, and a cold hush hangs over it.", sound: null, burst: null }),
    webs: Object.freeze({ said: "Fresh webs strung across the way ahead, and nothing moving.", sound: null, burst: null }),
    mark: Object.freeze({ said: "Their sleeve bears a mark you've seen on cultists' robes.", sound: null, burst: null }),
});

// An ambush sprung, as it's said (by its style), and caught out; how near it a player is told it
// (metres)
const SPRUNG = Object.freeze({
    bandits: "Ambush! Outlaws, ahead and behind!",
    goblins: "Ambush! Goblins in the brush!",
    wolves: "Ambush! The pack comes in from the sides!",
    dead: "The dead rise from the earth round you!",
    spiders: "Spiders! All round you!",
    cultists: "It's a trap! Cultists!",
});
const AMBUSH_TOLD = 60;

// How long a goblins' snare's drawn tight round whoever stepped in it (s), and how near the player
// an ambush's signs are drawn (metres: world/wild3d.js AmbushProps)
const AMBUSH_SNARE_SECONDS = AMBUSH_STYLES.goblins.snare / 1000;
const AMBUSH_SIGNS = 70;

// How far up a fallen foe's height their fall's said from, rising off their body, if it has no
// bones to find its hips by (#slain, #lying)
const SLAIN_RISES = 0.3;

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

// How often what's under the mouse is looked at again for the pointer to show (ms): what's under a
// still mouse moves too (#aim)
const AIM_MS = 100;

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

// Q and E turn the camera round the player, as a drag does, this fast (radians a second, times
// how far a drag turns it: Game options); R swings it round behind them (recentre)
const KEY_TURN = 2;

// A dungeon's level's camera, its tilt and distance the space's (world/view.js DUNGEON_VIEW):
// the player's own tilt or zoom kept on them as a nudge while it's as open or as tight as where
// they set it (its share of the way from a tunnel's camera to an open cavern's within `space`),
// eased away, at `ease` a second, once it's not
const DUNGEON_NUDGE = Object.freeze({ space: 0.2, ease: 1.5 });

// Finding the way through (Game options, Camera: #openWay): walking where the walls or rock
// crowd the camera in by more than `crowded` of its distance for `after` seconds, it's turned the
// least way round (in `step`s, looked for every `every` seconds) to where it has `room` of its
// distance, looking from behind the way they're going rather than in front (each radian off
// that counting `behind` radians more turning); or, nowhere so roomy, to where it has the most,
// if that's `better` more of it than where it is
const OPEN_WAY = Object.freeze({ crowded: 0.5, after: 0.5, room: 0.8, better: 0.25, step: Math.PI / 36, every: 0.15, behind: 0.5 });

// A wyvern or dragon put out this near the player (metres) is seen coming down out of the sky
const ARRIVE_WITHIN = 140;

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

// Out of doors, the player's this long (seconds) in a people's lands before their music's heard
// there (audio/sound.js setLand), so walking along a border doesn't turn it back and forth
const LAND_HEARD = 2;

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

// The battle cam takes a fight over only once the player and whoever they're fighting are both
// wholly on the screen (#inFull): from their feet to the tops of their heads, and as wide as they
// are (`wide` of their height either side of them, a beast half its length), at least `edge` of
// the way in from the screen's edges to its middle, in front of the camera
const FULL_VIEW = Object.freeze({ wide: 0.2, edge: 0.02 });

// A message kept clear of those fighting (hud.js keepClear): each taken to be `wide` of their
// height either side of their feet (no less than `least` pixels tall), with `over` pixels over
// their head for their name and bar, and `under` under their feet
const MESSAGE_CLEAR = Object.freeze({ wide: 0.35, least: 40, over: 34, under: 6 });
// Arrows at the screen's edge for those attacking the player out of view: the nearest `most`, so
// far in from its sides and top (pixels), and from its bottom, clear of the Action Bar risen in
// a fight
const THREATS = Object.freeze({ most: 3, inset: 28, bottom: 96 });
// The icons down the right side for those attacking the player (hud.js attackers): the first
// `most` to set on them, in the order they did
const ATTACKERS = Object.freeze({ most: 6 });

// The foes in the enemies list besides those after the player (#attackers): those the player can
// see within `reach` metres (as far as the target lock holds: battle.js LOCK_REACH), looked for
// `every` so many seconds, not every frame; and Tab's order (#cycleTarget), kept as it was while
// the presses come within `keep` seconds of each other, not taken afresh as everyone moves
const ENEMIES = Object.freeze({ reach: LOCK_REACH, every: 0.25, keep: 4 });

// How often the party menu, open, is shown again as those in it change (s); and how long someone's
// drawn before their likeness is (s: game.js #likeness)
const PARTY_MENU_EVERY = 0.25;
const LIKENESS_AFTER = 0.5;

// The party menu's Players tab (#everyone): how near a town or a named place someone out in the
// world must be to be said to be at it (m)
const PLAYERS_TAB = Object.freeze({ near: 250 });

// A kind of creature's portrait in the bestiary (portraitOf): how big (pixels square), how much
// brighter than the screen it's toned, how much of the picture it fills (view.js portrait `fit`),
// how long after it's built it's drawn (ms: drawn at once, it comes out blank, as a likeness does)
// and how many times it's tried, how long its model's waited for (ms: else its stand-in's drawn),
// and how high above the camera it stands (metres: out of everything's shadow and every fire's
// light)
const PORTRAIT = Object.freeze({ size: 224, bright: 1.15, fit: 0.86, after: 600, tries: 3, patience: 8000, up: 600 });

// Whether a likeness came back with nothing on it, all one colour: drawn before its subject was
function blank({ data }) {
    for (let k = 4; k < data.length; k += 4 * 37) {
        if (data[k] !== data[0] || data[k + 1] !== data[1] || data[k + 2] !== data[2]) {
            return false;
        }
    }

    return true;
}

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

// How far off soil trickling from an ants' nest's roof is heard (metres)
const TRICKLE_HEARD = 16;

// The buildings the host has got ready to go into (those near any player: core/host.js
// RELEVANCE), their floors and folk built a piece at a time, for at most `budget` ms a frame; and
// how often (s) the doors of the settlements come to since are picked up
const VISITS = Object.freeze({ every: 0.5, budget: 6 });

// A building's folk (Wenches and Ale's too) dressed only once the player goes in: told to go
// through one of its ways in, or inside; and let go of again once they're `far` metres off its
// door (before its floors: FLOORS). Not as they come near its door: the
// folk of a town's buildings round its square aren't dressed, their skins on the page and the
// graphics card, for a player standing in it or walking past (Wenches and Ale's 25 dressed in six
// seconds as a player passed its door took an iPhone from 350 MB held to 490 MB, and Safari
// closed the page)
const DOORSTEP = Object.freeze({ far: 12 });

// A building's floors, built only once the player's `near` metres from its door, or going in (not
// as the host gets it ready, 22 metres off), a piece at a time; let go of again once they're `far`
// metres from it (or, inside another building, that building's door is), though the host keeps it
// got ready to RELEVANCE.far; or all at once if they go straight in. And no more than `most` held
// of those further off than `near`, the furthest let go of first. Each holds a few megabytes on the
// page (#interiorsHeld): built as each building was got ready and kept to 30 metres, an iPhone
// held 56 floors (82 MB) standing in its town's square, and let the game's tab go
const FLOORS = Object.freeze({ near: 8, far: 16, most: 12 });

// Gone into a building before its folk are all dressed: the screen kept dark while they're
// dressed, `budget` ms a frame (their skins painted elsewhere meanwhile), for `most` seconds at
// most (the rest come in as they're dressed after), rather than all of them in the one frame
const ENTERING = Object.freeze({ budget: 30, most: 3 });

// Joined to another's world, the most of its time played in a frame (s): frames coming slowly,
// the time between them all the same (playing alone, a slow frame's a slower world instead)
const JOINED_FRAME = 1;

// Joined, and the host's next step not come yet: everyone's drawn going on as they were, up to
// RUN_ON - 1 steps past the last (100 ms), before they're drawn waiting for it (a link held up a
// moment, as a phone's mobile network often is)
const RUN_ON = 3;

// How often a joined game times its link to the host (seconds)
const PING_EVERY = 1;

// How far (m) a body's drawn closing up to where it is, the world sent again; further, it's put
// there at once
const CLOSE_UP = 3;

// How often how the world's linked is looked at again, for the HUD (ms: #worldLink)
const LINK_EVERY = 500;

// How long a joined game goes without a step from the host before its player's told it's waiting (ms)
const WAITING_AFTER = 2000;

// What's shown while playing together isn't going as it should (Game #together)
const TOGETHER = Object.freeze({
    lost: "Your connection dropped. Reconnecting…",
    hosting: "Your world's link to the others dropped. Reconnecting…",
    away: "The host's connection dropped. Waiting for them…",
    // (Stopped, by why: core/netplay.js PAUSES; by someone named, "Bryn has paused the game.")
    paused: { host: "The host has paused the game.", away: "The host's game is in the background: the world waits for them.", still: "The game's paused." },
    behind: "Catching up with the world…",
    waiting: "Waiting for the host…",
});

// How far away (metres, either way) anyone's drawn out in the world: another player far off, and
// whoever's near them, aren't (docs/WAR.md M11)
const DRAW_REACH = 160;

// How many of those coming into view (someone new, or someone come into the player's building or
// near them, the camera turned to them) have their pictures sent to the graphics card each frame,
// each hidden till then (#sending): a skin's 5 MB or so, not all of a building's folk's in the one
// frame, nor, out in the world, those out of the camera's view given room on the graphics card;
// and how far round someone (metres, at least, or as tall as they are) counts as in view (their
// shadow, too)
const SENDING = Object.freeze({ every: 2, round: 3 });

// Soldiers in their crowds (world/crowd.js): a battle's, with more than `from` of them about the
// player (a town's own guards are never so many), those nearest, and whoever's fighting the
// player, drawn in full (as many as QUALITY soldiers' `full`) and the rest in the crowd, as their
// kind's figure is made. Looked at every `every` seconds; one drawn in full let go to the crowd
// only once it's `margin` places past the last drawn in full. Each kind's figure made with `share`
// of the frame's time for building those drawn (VISITS.budget), first
const MARSHAL = Object.freeze({ every: 0.5, from: 24, margin: 3, share: 0.5 });

// Shut in: while the player's inside (a building, or down in a dungeon), those out in the world
// they can't see from there (#walledOff, #onlySeenAbout) held in full only for `after` seconds of
// it, then let go (#shutIn): the soldiers to their crowds, the folk and the wild's people-shaped
// creatures undressed, each dressed again as the player comes out, the nearest first. An iPhone on
// Low let the game's tab go with 49 bodies held in a city's smithy, 3 of them in it (a player's
// crash report, 2026-10-27). No more than `each` let go of at a look, so as not to hold a frame up
// letting a town's go
const SHUT_IN = Object.freeze({ after: 3, each: 8 });

// The soldiers' figures sooner, seen in a fight from the first: a world kept or joined in the
// thick of one has the figures of the kinds of those within `reach` metres of the player made
// while it loads, the nearest first, for at most `most` seconds (#figuresFirst); and while any
// soldier near waits unseen on its kind's, the figures are made with `budget` ms of each frame,
// the kinds of those nearest the player first, not MARSHAL's share. Locally, a guest on Low
// joining a world as 50 Northmen invaded its town saw none of the 126 soldiers about for 45
// seconds, their 28 kinds' figures made 3 ms a frame (docs/GAME.md *Soldiers in their crowds*)
const FIGURES = Object.freeze({ reach: 60, most: 10, budget: 10 });

// How often (seconds) the beasts' bodies none of their look has been drawn on for a while
// (beasts/sculpt.js LINGER) are let go of (forget)
const FORGET_EVERY = 5;

// How near one of their lairs the player must be (metres) for the models of its master's kind to
// be kept, none drawn from them (beasts/model.js forgetModels): further than they're asked for
// from (modelsNear's 1500)
const KEEP_MODELS = 2000;

// How often (seconds) the game looks for creatures drawn from a model to ask for, near their lairs
// (#modelling)
const MODELLING = 2;

// How near a place's way in the player must be (metres, out in the world) for the models of the
// creatures in it to be fetched, not read (beasts/model.js fetchModel), so they're kept by the time
// the player's at its door (#modelling); and how long before one that couldn't be is asked for
// again (ms)
const APPROACH = 150;
const APPROACH_RETRY = 60000;

// How near a hell's way in the player must be (metres, out in the world) to be told its cult's
// rite is broken (#delved): as near as the rite's kept for (core/creatures.js RITES)
const RITE_HEARD = 110;

// The trails out of the wild's camps and lairs (core/tracks.js; #trailing): how near the player
// their signs are drawn (`signs`, metres) and their prints (`prints`), laid again once they've gone
// `again` metres on; how far apart a print falls from the next, against how big what made them
// is (`stride`: [a share of its size, least, most metres]), and how deep they are against fresh
// ones (`depth`); a rare card's kept at a site (the Stone Golem's) as deep as any print is, in any
// ground (`sunk`)
// How near the player a shrine can be tapped to pray at (metres, out in the world: #shrineAt), and
// how near a tap's ray passes the space before it (its heart, a little above the ground)
const SHRINE_TAP = Object.freeze({ seen: 40, near: 2.6, up: 1.2 });

const TRAIL_SEEN = Object.freeze({ signs: 40, prints: 45, again: 12, stride: Object.freeze([0.6, 0.45, 2.4]), depth: 0.85, sunk: 1 });

// Who's heard of the nearest hell's cult, and will say (#cultWords): those whose trade it is to
// hear things, always; of the rest who'd say (dialogue.js: those asked "Anything strange out
// there?"), one in so many
const CULT_KNOW = new Set(["receptionist", "barkeep", "adventurer"]);
const CULT_KNOWN = 2;

// How far from the camera anyone with a crowd to be drawn in (the soldiers; the players' hired
// adventurers and the wild's creatures: #thronging) is drawn in full at most (metres), however
// quick the frames: further off, a body's at its lowest detail already (lod.js LODS: a person's
// under 50 pixels tall on a phone held upright), and drawn in its kind's crowd it's posed on the
// graphics card with the rest of them. Within it, as many in full as the frames and the bodies'
// budget allow, the nearest the camera first (#marshal) or the biggest on the screen (#thronging);
// one drawn in full goes to its crowd only once it's `slack` metres past it, so none goes back and
// forth on the edge. Whoever's fighting the player, or the player's fighting, is drawn in full
// wherever they are
const DETAIL = Object.freeze({ reach: 45, slack: 10 });

// The many near a fight drawn for less (docs/WILDS.md *A ceiling*): a creature too small on the
// screen for its shadow to show casts none (under `shadow` drawing buffer pixels tall; again over
// `again`), and is posed as seldom as a character that size would be (avatar.js posingEvery); of
// the players' allies (hired adventurers, creatures called or raised in people's shape), the
// `full` nearest the player drawn in full and casting their shadows, the rest at the middle level
// of detail (lod.js) with only their contact shadows, and posed seldom out of view
const MANY = Object.freeze({ shadow: 40, again: 48, full: 4 });

// Who can be drawn in their kind's crowd (#thronging): past DETAIL.reach from the camera, or when a
// crowded fight comes too slowly (app/throng.js): the players' hired adventurers and the wild's
// people-shaped creatures (bandits, goblins, trolls...), their bodies kept but not drawn nor posed
// meanwhile; never a dungeon's boss or mini-boss, an elite, one thrown by a blast, nor whoever's
// fighting the player or the player's fighting. Looked at as often as the soldiers are (MARSHAL),
// those within `near` metres of the player only (as far as anyone's drawn)
const THRONGING = Object.freeze({ near: DRAW_REACH });

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

// The first time a fight leaves the character something (#once, kept with the character), what's
// to be done about it, short enough to read at a glance; never said again. How long it's shown (s)
const SPOILS_HINT = "Tap it to take it all, or turn on Auto-snag in Game options, Gameplay.";
const SPOILS_TOLD = 5;

// Some of a thing, in words: "a healing draught", "3 healing draughts"
function thingsOf({ id, quality, count = 1 }) {
    const name = itemLabel({ id, quality }).toLowerCase();

    return count > 1 ? `${count} ${name.endsWith("s") ? name : `${name}s`}` : `${/^[aeiou]/.test(name) ? "an" : "a"} ${name}`;
}

// What a request's reward is, in words: its gold, and any tome besides ("your name in the rolls", for nothing)
const rewardOf = ({ gold, tome }) => [gold ? `${gold} gold` : null, tome ? `the Tome of ${SPELLS[tome].label}` : null].filter(Boolean).join(", and ") || "your name in the rolls";

/** What a thing in the pack or a shop is, in words: what it does (and, gear, how well made it is). */
export function aboutOf({ id, quality, bonuses, level = 1 }) {
    const { use, slot, part = false, price, tome } = ITEMS[id];
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

    // (Anything else used that says what it does, in its own words: a boon, a spell's scroll, a
    // ward's or a spell's draught, a bomb...)
    if (use && ITEMS[id].about) {
        return `${ITEMS[id].about}${worth}`;
    }

    if (use?.heal || use?.stamina) {
        return `${use.heal ? `Heals ${use.heal} hit points.` : "Fills your stamina."}${worth}`;
    }

    if (part) {
        return worth.trim();
    }

    // (A charm: what it's for, and how much, as well made as it is, with what was rolled on it)
    if (ITEMS[id].charm) {
        return `${ITEMS[id].about.replace(/\.$/, "")} (${charmWords({ id, quality, bonuses, level }).join(", ")}). Carried in the pack: the strongest of each kind counts.`;
    }

    // (Gear: what it does is told piece by piece, app/gearinfo.js; here, what it gives worn, or
    // if nothing yet (a ring before its bonuses are rolled), what kind of thing it is)
    if (slot === "mainHand") {
        return "A weapon.";
    }

    const gives = GEAR[id] ? gearWords({ id, quality, bonuses, level }) : [];

    return gives.length ? `${gives.join(", ")}.` : `${GEAR[id] ? kindOf(id) : "Worn"}.`;
}

// What lingers on someone after some blows (core/afflictions.js), as it shows: rising off them
// now and then (`bursts`: effects.js BURSTS, every `every` seconds or so, from anywhere between
// `at` shares of their height up, `round` metres out from the middle of them: on them, not in
// them), the tinge on their skin (`tint`, pulsing), a number the colour of it when it hurts
// (`hurt`: a burst there too), and what's drawn on them (world/ailments3d.js), by its look
const AILING = Object.freeze({
    poison: { bursts: ["venomBubbles", "venomDrip"], every: 0.18, at: [0.3, 0.8], round: 0.2, tint: [0, 0.1, 0], hurt: "venomBubbles" },
    // (A black widow's venom: as poison, thicker and faster, darker in the skin)
    venom: { bursts: ["venomBubbles", "venomDrip"], every: 0.1, at: [0.25, 0.85], round: 0.22, tint: [0.03, 0.08, 0.02], hurt: "venomBubbles" },
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
const TAKEN = Object.freeze({ poison: "You're poisoned!", venom: "A black widow's venom burns in your veins!", disease: "You've caught a sickness!", pox: "You've caught something upstairs: you're diseased!", wither: "A curse withers you!", burn: "You're on fire!", bleed: "You're bleeding!", slow: "You're slowed!", fear: "You're terrified!" });

// The icon, words and what's drawn for what's lingering on someone (its kind, and look)
function ailmentOf(kind, look = null) {
    const held = kind === "slow" ? HELD[look] : null;
    const icons = { poison: "poisoned", venom: "envenomed", disease: "diseased", pox: "diseased", wither: "withered", burn: "burning", bleed: "bleeding", slow: "slowed", fear: "fear" };

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
const FLIGHT = Object.freeze({ arrow: { arc: 0.25 }, ballistaBolt: { arc: 0.4 }, axe: { arc: 0.45 }, venom: { arc: 0.55 }, lava: { arc: 0.75 }, web: { arc: 0.4 }, roots: { ground: true }, flame: { arc: 0 }, riftFire: { arc: 0 } });

// Fire breathed, a roaring stream from the jaws as it flies (effects.breathe): a drake's, and the
// rift's green fire, a rift stalker's (effects BURSTS)
const BREATHED = Object.freeze({ flame: "breath", riftFire: "riftBreath" });

/**
 * A blast heard and felt (#blast): heard as far as `far` metres (further than a blow); from
 * further than `clear`, the air taking the highs out of it (a low-pass at `highs` Hz there,
 * lower the further); from further than `late`, heard as long after as sound takes to come
 * (`sound` m/s); the camera shaken within `shaken` metres of it, harder the nearer (and within
 * `quaked` metres of the colossal's: COLOSSAL_BLASTS).
 */
const BLAST_HEARD = Object.freeze({ far: 60, clear: 10, highs: 8000, late: 15, sound: 343, shaken: 25, quaked: 60 });

// How far off (metres) the Behemoth of the Rift's atomic breath is heard, how long before it fires
// (seconds) the sound of its beam starts (as the model viewer plays it: beasts/sounds.js), and
// within how far of it its bar's across the top of the screen (#bossBar)
const ATOMIC_HEARD = 120;

// How often foes' plates are sized up again (s: #sizeUp); how long after a blow begins a legendary
// weapon's swing trails its look (ms: #wielding)
const SIZE_UP = 0.5;
const STRIKING_MS = 450;

// What a legendary weapon's effect let loose sends flying (spellfx.js spray and scatter: a burst's
// settings), and how each is heard (audio/synth.js): core/legendary.js, #unleashed
const mote = (colours, { count = 12, size = [0.06, 0.12], speed = [0.6, 1.6], life = [0.4, 0.8], gravity = -1, spread = 1.6, glow = true, opacity } = {}) => ({ count, colours, size, speed, life, gravity, spread, glow, swirl: 0, grow: 0, drag: 2.5, late: false, ...(opacity === undefined ? {} : { opacity }) });
const UNLEASHED_MOTES = Object.freeze({
    frost: mote([0xffffff, 0xbfeaff], { count: 24, size: [0.04, 0.09], speed: [0.6, 2], life: [0.8, 1.4], gravity: 1, spread: 2, glow: false, opacity: 0.95 }),
    fire: mote([0xffe08a, 0xff3a0a], { count: 16, size: [0.16, 0.32], speed: [0.8, 2.2], life: [0.35, 0.7], gravity: -3 }),
    dust: mote([0xb8a78a, 0x8a7a62], { count: 10, size: [0.3, 0.6], speed: [0.6, 1.6], life: [0.6, 1.1], gravity: -0.3, glow: false, opacity: 0.55 }),
    sparks: mote([0xffffff, 0x9ab8ff], { count: 18, size: [0.04, 0.09], speed: [2.5, 5], life: [0.15, 0.35], gravity: 6, spread: 1 }),
});
const UNLEASHED_SOUNDS = Object.freeze({ frostbind: "legendFrostbind", cinderburst: "legendCinderburst", earthsunder: "legendEarthsunder", stormlash: "legendStormlash", ruinblast: "legendRuinblast", cleave: "clash" });

// How a ward let loose on whoever wears it is drawn (core/legendary.js EFFECTS `ward`), by its
// element: the shell closing round them and holding while it lasts, the shards thrown off it, the
// ring of dust; heard as its element's casting (UNLEASHED_SOUNDS, if it's none of its own)
const WARD_LOOKS = Object.freeze({
    earth: { shell: 0xc8b48a, shards: 0x9a8c74, ring: 0xe8d4a0, sound: "castEarthMid" },
    fire: { shell: 0xff9a4a, shards: 0xd0602a, ring: 0xffc880, sound: "castFireMid" },
    water: { shell: 0x9ad8ff, shards: 0x6aa8d8, ring: 0xd0f0ff, sound: "castWaterMid" },
    air: { shell: 0xd8e8ff, shards: 0xa8b8d8, ring: 0xf0f6ff, sound: "castAirMid" },
});
const ATOMIC_LEAD = 0.05;
const BOSS_NEAR = 150;

// Within how far of the player (metres) the colossal's framed by the camera (#colossalFoe)
const COLOSSAL_FRAMED = 90;
// The bombs that burst as a small one does (not the Goblin King's, nor the Explosion spell): each
// people's bomb throwers' (core/invasions.js BOMBERS), goblin bombs among them
const SMALL_BOMBS = new Set(Object.values(BOMBERS).flatMap(({ weapon }) => weaponOf(weapon).attacks.flatMap(({ bomb }) => (bomb ? [bomb] : []))));

// What a creature leaves where it falls (battle.js BOMBS `look`) is heard doing: gathering, then
// bursting (a cinder husk's embers as fire does, a bloat gorger's bile as foul water); and a
// people's bomb that has no wick to fizz (by its kind), lying where it landed: a starfire seed pod
// shimmering, a shadowfire orb's flame, a swamp-gas bladder hissing, bursting as foul water does;
// and a catapult's pot of burning pitch, heard flying (`flying`, from where it's flung), nothing
// heard lying there (it bursts as it lands), bursting as a great blast; and the Stone Golem's
// boulder, a heavy stone heard flying, landing as the colossal's blows do (COLOSSAL_BLASTS)
const BURSTS = Object.freeze({
    firePot: { flying: "fireball", gathering: null, burst: "explosionLarge" },
    boulder: { flying: "stoneShot", gathering: null },
    // (A legendary weapon's Ruinblast: core/legendary.js)
    ruinblast: { burst: "legendRuinblast" },
    embers: { gathering: "castFireLow", burst: "impactFireMid" },
    bile: { gathering: "castWaterLow", burst: "impactWaterHigh" },
    starfirePod: { gathering: "castHealingLow" },
    shadowfireOrb: { gathering: "castFireLow" },
    gasBladder: { gathering: "castWaterLow", burst: "impactWaterHigh" },
});

// The colossal's blasts (battle.js #colossal, #rake, #stride: the Behemoth of the Rift's), each as
// the ground shakes under it (spellfx.js quake) and how hard the camera's shaken within
// BLAST_HEARD.quaked of it, and what's heard: its jaws slamming down, its roar, its tread; its
// breath's drawn by its beam (beasts/beam.js), whoever it lands on thrown as by any blast. And the
// Stone Golem's, as heavy: its hammer pounding the ground (battle.js #quake) and its boulder
// coming down (BOMBS boulder), each the ground heaving and the stone heard crashing down. And the
// Orc King's: coming down from his leap (the ground heaving, heard crashing down as the golem's
// hammer is) and his axe spun all round him (the dust thrown up round him; his swing's heard as
// he swings it); and a kick that throws whoever it lands on (battle.js #hit `toss`: its blow heard
// landing as any is), no more than they're thrown
const COLOSSAL_BLASTS = Object.freeze({
    colossalSlam: { quake: "slam", shake: 0.8, sound: "deathThudBig" },
    colossalRoar: { quake: "roar", shake: 0.6, sound: null },
    colossalTread: { quake: "tread", shake: 0.35, sound: null },
    atomicBreath: { quake: null, shake: 0.3, sound: null },
    golemPound: { quake: "slam", shake: 0.55, sound: "impactEarthMid" },
    orcSlam: { quake: "slam", shake: 0.45, sound: "impactEarthMid" },
    orcSpin: { quake: "spin", shake: 0.15, sound: null },
    shove: { quake: null, shake: 0, sound: null },
    boulder: { quake: "slam", shake: 0.5, sound: "impactEarthHigh" },
});

// How long (seconds) a rare card's foe's last words (core/rare.js RARE_CARDS `last`: the Orc
// King's) are shown before the player's told they've overcome it
const LAST_WORDS = 9;

// What bursts where each of the creatures' own lands (besides the burst in its look)
const SPLASHES = Object.freeze({ venom: ["venomSplash"], lava: ["lavaSplash", "embers", "smoke"], web: ["webSplat"], roots: ["earth"], curse: ["shadows", "wither"], drain: ["shadows", "wither"], flame: ["flames", "smoke"], riftFire: ["riftFlames", "smoke"] });

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
    pixies: ["wither"],
    magmaSlime: ["lavaSplash", "embers"],
    rockTusker: ["stoneChips", "dust"],
    // (What's cut stone: the Stone Golem's chips and grit)
    stone: ["stoneChips", "dust"],
    hodmedod: ["straw", "dust"],
    draugr: ["boneChips", "dust"],
    mare: ["shadows"],
});

// How each school's spells are cast (the caster's movements and the sound: effects.js LOOKS):
// healing as healing, the elements as the fire and light bolts are. (How each looks gathering and
// landing is its own: spellfx.js)
const SPELL_LOOKS = Object.freeze({ fire: "fireball", earth: "roots", air: "bolt", water: "bolt" });

// A spell lasting on someone shows on them this often (a mote of its colour: times a second)
const LINGER = 5;

// Levitating: how high off the ground (m), bobbing so much (m), so fast (radians a second)
const LIFT = Object.freeze({ height: 0.35, swing: 0.06, bob: 2.2 });

// Taken to the air over a fight (battle.js #hover: a Dreadthorn badly hurt): how high it hangs
// (m), rising and falling so much (m), so fast (radians a second)
const HOVERING = Object.freeze({ height: 7, swing: 0.4, bob: 1.6 });
// How a black widow hangs under the roof as it lurks (battle.js #lurk, #hanging): its middle
// `under` metres below the rock over it, never lower than `least` (out of a blade's reach) nor
// higher than `most`; under a roof not yet known, as high as `roof`
const HANG = Object.freeze({ under: 0.9, least: 3.4, most: 6, roof: 4.6 });

// How fast the camera's shaking dies away (a share of it, a second)
const SHAKE_DIES = 4;

// A place's crier, by his id (core/townsfolk.js crierOf)
const CRIER = /^crier:/;

// How near the player the war's news happens (metres, out in the world) to be told them there and
// then, in a message box; further off, a town's crier cries it (#crierOf: news.js newsSince)
const NEWS_NEAR = 300;

// A crier's bell rung to bring the player to him while there's news they've yet to hear from one:
// heard as far off as this (metres: no nearer than he calls out to them, core/crying.js CALLING),
// no oftener than this (seconds), and a little louder than as he rests
const BELL = Object.freeze({ reach: 160, every: 180, volume: 1.6 });

// An invasion's horns (audio/synth.js): heard as far off as this (metres); the raiders' blown again
// so long after it's first blown as they come (seconds), and the town's answering so long after
// that first; and the lord's thanks shown so long (seconds) for a good share of them felled
const HORNS = Object.freeze({ far: 450, again: 2.2, answer: 4.6, charge: 1.2, thanks: 14 });

// What one of the player's own's said to do as they're told (core/host.js #orderUnit); their
// ability, as it's used (the "unitAbility" event)
// One of the hired adventurers as they're called: by the player's name for them or their own,
// with their byname (core/followers.js bynameOf), as core/host.js #calledBy has it
const calledBy = (one) => {
    const byname = bynameOf(one.record ?? {});

    return `${one.called ?? one.name}${byname ? `, ${byname}` : ""}`;
};

// How seldom a hired adventurer says each kind of word over their head (#bark: game s), and how
// seldom any of them says anything
const BARK_EVERY = 45;
const BARK_GAP = 6;

// How often the player's told one of their own's drawn a foe off them, at most (seconds)
const DRAWN_OFF_EVERY = 30;

const UNIT_TOLD = Object.freeze({ follow: "follows you.", wait: "waits here.", assist: "goes for your target.", guard: "guards you.", fallback: "falls back to you.", hold: "holds fire.", free: "fights at will.", cover: "covers you." });

// Why another of the player's party wasn't given a request they shared (host.js #unshared), as told
const SHARE_SKIPPED = Object.freeze({
    has: "has it already",
    full: "carries all they can",
    unregistered: "isn't signed up at a guild",
    guildRank: "isn't of the guild rank it's for",
    stranger: "isn't of your people",
    rank: "isn't of the rank it's for",
});

/**
 * A battle's turns (core/engagement.js) told to a player within `near` metres of where each comes
 * (#battleTurn), at most one every `every` seconds (but a commander falling, and their own job,
 * trophy and reward, always); what each of a side's bodies is called (its `parts`).
 */
const BATTLE_TOLD = Object.freeze({ near: 160, every: 2.5, parts: Object.freeze({ left: "left", centre: "centre", right: "right", reserve: "reserve", vanguard: "household" }) });

// How far off the wild's hunters are heard in a build-up after a long calm (metres: core/director.js
// PACING's `from`, and more)
const PACE_HEARD = 160;

// How long after the drums are first heard in a build-up they're beaten again (seconds: as long as
// their beat, audio/synth.js warDrums)
const DRUMS_AGAIN = 2;

// What's said of what's across the way (core/director.js OBSTACLES), by its kind: when it's come
// upon (`seen`), what it's called in being told to hold on it (`it`, `pronoun`), and what spilled
// under it (`spilled`)
const OBSTACLE_WORDS = Object.freeze({
    tree: { seen: "A fallen tree lies across the way ahead. Go round it, or hold on it to clear it.", it: "the fallen tree", pronoun: "it", spilled: "Under the tree, a cart's load, crushed long ago." },
    rocks: { seen: "Rocks have come down across the way ahead. Go round them, or hold on them to clear them.", it: "the rocks", pronoun: "them", spilled: "Under the rocks, a cart's load, buried long ago." },
});

// What the strangers met out in the wilds say over their heads (core/director.js STRANGERS): hungry
// bandits' chief hailing the player, paid, and refused (or walked away from); a wounded hunter
// healed
const STRANGER_LINES = Object.freeze({
    hail: ["Hold there, friend!", "That's far enough!", "Not so fast, traveller."],
    paid: ["Pleasure doing business.", "On your way, then."],
    fight: ["Then we'll take it off you!", "Wrong answer. Get them, lads!", "Have it your way!"],
    tended: ["Bless you. That's better.", "Ah... I can stand. Thank you, friend.", "Gods, that's better. I owe you."],
});

// How many of the places the player's heard tell of and found since the journal keeps (the last)
const HEARD_FOUND = 5;

/** What the host tells of besides the battle's events (#hear: every kind it has a word for). */
export const HOST_EVENTS = new Set(["open", "close", "join", "leave", "explored", "bestiary", "talk", "effect", "war", "turn", "muster", "relieved", "fieldBattle", "invasion", "engagement", "burnt", "dismiss", "worksOut", "worksDown", "works", "convoy", "convoyed", "parted", "fortOut", "fortDown", "squadsOut", "quartered", "unquartered", "barracks", "taken", "camp", "strike", "stockades", "hacking", "breach", "stormed", "army", "standard", "supply", "skirmishers", "leaders", "envoy", "envoyed", "farewell", "follower", "fate", "unrest", "gone", "roused", "cleared", "rank", "loot", "bought", "sold", "used", "gear", "disguise", "discarded", "dropped", "picked", "spoils", "ability", "unitAbility", "request", "standing", "guild", "gift", "counsel", "trade", "tier", "learnt", "grown", "companion", "summons", "carried", "polymorphed", "attracted", "slept", "resting", "rose", "away", "boon", "safety", "townsfolk", "emote", "party", "treasure", "sign", "prayed", "cured", "ring", "trial", "dungeon", "cache", "find", "pace", "stranger", "obstacle", "obstacles", "ambush", "rare", "thread", "vault", "share", "rules"]);

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
const _foeChest = new THREE.Vector3();
const _looking = new THREE.Vector3();
const _across = new THREE.Vector3();
const _corner = new THREE.Vector3();
const _head = new THREE.Vector3();
const _eyes = new THREE.Vector3();
const _hearth = new THREE.Vector3();
const _lit = new THREE.Vector3();
// (What the camera sees, and round someone, for whose pictures to send: #sending)
const _seen = new THREE.Frustum();
const _seenMatrix = new THREE.Matrix4();
const _round = new THREE.Sphere();

// What a step of the world brought, for the debug log: each kind of news, how many of it, in the
// order it came (a few kinds)
const newsOf = (events) => {
    const counts = new Map();

    for (const { type } of events) {
        counts.set(type, (counts.get(type) ?? 0) + 1);
    }

    return [...counts].slice(0, 8).map(([type, count]) => (count > 1 ? `${type} ${count}` : type)).join(", ") || "nothing new";
};

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
     * @param {Function} [options.onPing] - Hears whenever the player's party shows them somewhere
     *     on the map: a ping (pingView), or a marker shared (markerView); for the world map to show
     *     it, if it's open.
     * @param {Host} [options.host] - The world's host (core/host.js): made here if not given
     *     (playing alone), with the player joining it.
     * @param {string} [options.me] - The player's id in it.
     * @param {object} [options.war] - The world's war as it was kept (save.js loadWorld), for a
     *     host made here to carry on from.
     * @param {Function} [options.onWar] - Hears the war (core/war/war.js) after each of its
     *     turns, and the world's legends (core/rare.js Legends) with it, after each turn and as a
     *     rare encounter's met (to keep them).
     * @param {object} [options.legends] - The world's legends as they were kept (save.js
     *     loadLegends), for a host made here to carry on from.
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
     * @param {Array} [options.markers] - The player's markers on the world map (core/markers.js:
     *     as kept, save.js loadMarkers).
     * @param {Function} [options.onMarkers] - Hears them whenever one's put down, shared with them
     *     or taken away (to keep them).
     * @param {object} [options.place] - Where the player was out in the world when the game last
     *     stopped ({ x, y, facing }: save.js loadPlace), to carry on there; or null (where the
     *     world puts them: by their home town's tavern).
     * @param {object} [options.vitals] - How the player was then (save.js loadVitals: core/host.js
     *     vitalsOf: their hit points and stamina, what lingered and lasted on them, their boons,
     *     their abilities' and spells' waits), to carry on so; or null (whole, nothing on them).
     * @param {Array} [options.messages] - The last messages the player was told across the screen,
     *     as kept (save.js loadMessages: journal.js keepMessage), for the journal.
     * @param {Function} [options.onMessages] - Hears them whenever another's kept (to keep them).
     * @param {string[]} [options.told] - What the character's been told once and needn't be again
     *     (save.js loadTold: `#once`).
     * @param {Function} [options.onTold] - Hears them whenever there's another (to keep them).
     */
    constructor({ view, kit, world, hero, hud, sound = null, talks = { memory: {}, knowledge: [] }, onTalk = () => {}, explored = {}, onExplore = () => {}, onWorldMap = () => {}, onPing = () => {}, host = null, me = HOST_PLAYER, war = null, onWar = () => {}, legends = null, progress = {}, onProgress = () => {}, standing = {}, onStanding = () => {}, followers = [], roll = [], onFollowers = () => {}, wheels = null, onWheels = () => {}, remote = null, pin = null, onPin = () => {}, markers = [], onMarkers = () => {}, place = null, vitals = null, messages = [], onMessages = () => {}, told = [], onTold = () => {} }) {
        this.view = view;
        this.kit = kit;
        this.sound = sound;
        this.world = world;
        this.hero = hero;
        this.hud = hud;

        // The last messages told the player across the screen (the journal shows them), and who
        // hears of them: each heard from the HUD as it's told
        this.messages = messages;
        this.onMessages = onMessages;
        this.toldOnce = new Set(told);
        this.onTold = onTold;
        hud.onMessage = (text, seconds) => this.#told(text, seconds);
        // (The lantern or the orb tapped: how the world's linked, said)
        hud.onWorldLink = () => this.linkView && hud.message(this.linkView.words, 4);

        // Those attacking the player, an icon each down the right side: since when each has been
        // (the game's clock, s), their likenesses (an ImageData, or null while it's drawn), and
        // the last of them tapped ({ id, time: ms })
        this.attackerSince = new Map();
        this.likenesses = new Map();
        this.lastIconTap = null;
        hud.onAttacker = (id, gesture, time) => this.#attackerPressed(id, gesture, time);

        // The player's party, an icon each down the left side: their likenesses (as the
        // attackers'), the one the player's chosen to help (their heals and wards go to them: an
        // id, or null), the last of their icons tapped ({ id, time: ms }), and how to let go of
        // the wheel held open on one
        this.partyLikenesses = new Map();
        this.likenessSince = new Map();

        // Each kind of creature's portrait in the bestiary, by its id: a picture's URL (or null,
        // if it couldn't be drawn), when it's drawn (portraitOf)
        this.portraits = new Map();
        this.allyTarget = null;
        this.lastMemberTap = null;
        this.memberWheel = null;
        hud.onPartyMember = (id, gesture, press) => this.#memberPressed(id, gesture, press);
        hud.onPartyMore = () => this.toggleParty();

        // The world (the host's: made here, playing alone), this game's player in it (by id,
        // come in before the world's own people), and the battle as the host has it
        this.me = me;
        this.host = host ?? new Host(world, { populate: false, war, legends });
        this.onWar = onWar;

        // Playing its own world: what moves it on, step by step as the frames give the time, and
        // sends what's done to those who've joined it, if it's opened to others (core/runner.js)
        this.runner = remote ? null : new WorldRunner(this.host);

        /**
         * Playing together (docs/WAR.md M11): joined to a world someone else hosts, how this game
         * plays its copy of it on and sends its player's commands (core/netplay.js Joining; its
         * player's already in it); or hosting one opened to others, what sends them what's done
         * (Hosting: set by whoever opens it, kept by the runner: hosting).
         */
        this.remote = remote;
        this.pingedAt = 0;

        /**
         * A joined game's hero, drawn where the game's rules will have them as soon as what's sent
         * now is done, ahead of the copy (app/forecast.js), from the host's word of them
         * (Joining.self).
         */
        this.forecast = remote ? new Forecast() : null;

        if (remote) {
            remote.onSelf = (self) => this.forecast.heard(self);

            if (remote.self) {
                this.forecast.heard(remote.self);
            }
        }

        /**
         * How the link to the others is (app/together.js onLink): null, all's well; "lost", this
         * game's dropped and coming back; "away", the host's. With when a joined game last played a
         * step of the host's, and what the HUD says of it all (#together).
         */
        this.link = null;
        this.steppedAt = 0;
        this.together = null;

        /**
         * How the world's linked, shown in the minimap's corner (app/worldlink.js: #worldLink),
         * and who it's with and how (`linkAbout`, set by whoever joins or opens it: { kind:
         * "server", world, server } on a world server, { kind: "friend", how () } in a friend's;
         * null, else), looked at every LINK_EVERY ms, drawn only when it changes.
         */
        this.linkAbout = null;
        this.linkView = null;
        this.linkKey = null;
        this.linkAt = -Infinity;

        if (!remote) {
            // (Where they were when it last stopped, and as they were: core/host.js join)
            this.host.join({ id: me, hero, talks, explored, progress, standing, followers, roll, place, vitals });

            const actor = place ? this.host.battle.actor(me) : null;

            // (Getting up at home still, if they fall)
            if (actor && world.spawns?.player) {
                actor.spawn = [...world.spawns.player];
            }
        }

        this.onFollowers = onFollowers;

        /**
         * What's on the player's action wheels: their own, an enemy's and their followers', each two
         * sides; and their Action Bar, six (four shown, or all six: app/wheel.js).
         */
        this.wheels = readWheels(wheels);

        /** Hears one of the Action Bar's actions held on (its slot), to change what's in it (main.js: Action Bar). */
        this.onChooseQuick = () => {};

        /** Whether the Action Bar is kept up out of a fight too (Game options: Always show). */
        this.quickAlways = false;
        // (Hired adventurers saying a word now and then over their heads: Game options; and when
        // each last did, by follower and what it was, game time s: #bark)
        this.chatter = true;
        this.barked = new Map();

        // (Whom foes are on, shown: Game options; the rings and dots on the enemies list, the
        // counts on the party's icons, a taunt's mark over a foe: #attackers, #partyIcons,
        // #tauntMarks; each taunt's mark as last shown, by foe; and when the player was last told
        // one of theirs drew a foe off them, game time s)
        this.showEnmity = true;
        this.tauntsShown = new Map();
        this.drawnOffAt = -Infinity;

        /**
         * Asks whether one of the party's to be let go, for good ({ name, note, go }: `go` lets them
         * go; main.js: the dismiss dialog), or null to let them go unasked.
         */
        this.onAskDismiss = null;

        /**
         * In a world on a server, its own panel opened (main.js: who's here; for its owner, invites
         * and keys; leaving it), from the party menu's World button; null elsewhere (no button).
         */
        this.onWorldPanel = null;

        /** How many of the Action Bar's actions are shown: four, or six across (QUICK_SHOWN; Game options: showQuick). */
        this.quickShown = QUICK_SHOWN.four;

        /** Till when (the clock) the Action Bar stays up: a moment after the last of a fight. */
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
        this.pinNear = null;
        this.journey = null;

        /** The player's markers on the world map (core/markers.js), and who hears of them. */
        this.markers = markersOf(markers);
        this.onMarkers = onMarkers;

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
        // (The players' allies about, and the nearest of them drawn in full: #allying)
        this.allies = new Set();
        this.alliesNear = new Set();
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

        /**
         * Keeping a crowded fight moving (Adaptive too, before the governor draws less: app/throng.js):
         * how many of those about who can be are drawn in full, the rest in their kind's crowd
         * (#thronging); and those that are: id -> { avatar, standIn, hidden, unecho }.
         */
        this.throng = new Throng();

        /**
         * How big an invasion this device can draw, measured from its frames while there's none
         * on and told to the host as it changes (app/budget.js; core/host.js `budget`).
         */
        this.invasionBudget = new InvasionBudget();

        /**
         * How it's going, for the debug log (app/telemetry.js): where the player is, what's drawn
         * and how, how many are about, the frame's timings, the memory (where the browser tells)
         * and the device. Only worked out when something's kept, or now and then for a crash.
         */
        this.telemetryState = () => {
            const view = this.view;
            const info = view.renderer.info;
            const me = this.battle.actor(this.me);
            const one = (value) => Math.round(value * 10) / 10;

            return {
                map: this.mapId,
                at: me ? [Math.round(me.x), Math.round(me.y)] : null,
                playing: Math.round(this.clock),
                quality: view.qualityName,
                pixels: view.adaptiveScale,
                adaptive: view.adaptive,
                inFull: Number.isFinite(this.throng.full) ? this.throng.full : "all",
                // (The soldiers about, and how many of them the bodies' budget left room for in full: #marshal)
                soldiers: this.marshalled ? { ...this.marshalled, room: Number.isFinite(this.marshalled.room) ? this.marshalled.room : "all" } : null,
                // (The wild's people-shaped creatures about, and how many the bodies' budget left
                // room for in full: #rationing)
                creatures: this.rationed ?? null,
                // (The folk out in the world, and how many the bodies' budget left room for in
                // full: #folkRoom)
                folk: this.folkRationed ?? null,
                bodies: { ...this.stats.bodies },
                actors: this.battle.actors.length,
                avatars: this.avatars.size,
                drawn: { calls: info.render.calls, triangles: info.render.triangles, geometries: info.memory.geometries, textures: info.memory.textures, programs: info.programs?.length ?? 0 },
                frame: { fps: one(this.stats.fps), update: one(this.stats.update), render: one(this.stats.render) },
                together: this.remote ? "joined" : this.hosting ? "hosting" : null,
                // (Joined: how often its own hero, drawn ahead, has been put right, and by how much
                // at most: app/forecast.js)
                ...(this.forecast ? { forecast: { ...this.forecast.corrections, most: one(this.forecast.corrections.most) } } : {}),
                memory: this.memoryNow(),
                device: { agent: globalThis.navigator?.userAgent ?? "", ratio: globalThis.devicePixelRatio ?? 1, screen: `${globalThis.screen?.width ?? 0}x${globalThis.screen?.height ?? 0}`, buffer: `${view.renderer.domElement.width}x${view.renderer.domElement.height}`, cores: globalThis.navigator?.hardwareConcurrency ?? null, memoryGB: globalThis.navigator?.deviceMemory ?? null },
            };
        };
        this.thronged = new Map();

        // (Those in a crowd fading from sight as one drawn in full takes their place: #handOver)
        this.fadingOut = [];

        // (Those about to be drawn whose pictures are still to be sent, this frame: #sending)
        this.unsent = [];
        this.throngCount = { crowdable: 0, inFull: 0 };

        /** Heard when it draws a level, or a share of the pixels, it didn't (Adaptive): ({ quality, scale }). */
        this.onAdapt = null;

        /** Timings for the debug overlay (milliseconds, smoothed), and the last frames' times. */
        this.stats = { frame: 0, update: 0, render: 0, steps: 0, fps: 0, bodies: { drawn: 0, posed: 0, shadows: 0, crowd: 0, standing: 0 } };

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

        // The bombs fizzing, their wicks heard (by the battle's bomb id: the sound's source, to cut)
        this.fuses = new Map();

        // Those with something lingering on them (their ids), and when each's next shows it (by
        // id and kind: s); those whose skin's tinged by it
        this.ailed = new Set();

        // The wild's elites drawn radiant (their ids: #radiant)
        this.radiant = new Set();

        /** Whether another player's Summon is said no to at once, not asked (Game options). */
        this.resistSummons = false;

        /** Whether another player asking this one to their party is let go unanswered, not asked (Game options). */
        this.refuseInvites = false;

        /**
         * Whether the player's spoils of a fight are picked up as they come within reach of them,
         * not left for a tap (Game options: Auto-snag; host.js `snaggable`); what of them it takes
         * (`snagFilter`); and those tried, each once (one there's no room for is left for a tap,
         * not asked for again and again; all tried again when what it takes is changed).
         */
        this.autoSnag = false;
        this.snagOnly = null;
        this.snagTried = new Set();

        // Whether whoever the player sets on is locked on (Game options: Auto target lock): their
        // target wherever they go, till it falls or is 40 m off (battle.js `lock`, #keepLock).
        // Off, only an enemy whose icon's held is locked on
        this.autoLock = true;

        // The mouse pointer (app/pointer.js), told what a click on the view would do where the
        // mouse is (#aim); where the mouse is over the view (null: off it), and when it was looked at
        this.cursor = null;
        this.hovering = null;
        this.aimedAt = -Infinity;

        /**
         * Party chat (core/netplay.js CHAT): what's been said in the player's party, and its comings
         * and goings, the oldest first ({ id, name, text, mine, system }: CHAT.kept at most); and how
         * many lines of others' they haven't seen (on the Party button: hud.js partyUnread).
         */
        this.chatLines = [];
        this.chatUnread = 0;
        this.chatCount = 0;

        /**
         * Direct messages and blocks (Game options: Chat and players): which kinds the player takes
         * (from their party, from anyone else in the world: core/netplay.js DMS_TAKEN, told to the
         * host: takeDms); who the party menu's Chat says a line to (`chatTo`: null, their party; or
         * a player's id, a direct message); whether what's said shows a moment on screen too
         * (`chatOnScreen`: hud.js chatLine); and the players blocked (`blocked`, in every world, as
         * save.js blocksOf keeps them: their direct messages and party invites let go of, unheard,
         * they none the wiser), each in the world `worldKey` names, by who it knows them as (whoIs).
         * Told as they change: onBlocked(blocked).
         */
        this.dmsTaken = { ...DMS_TAKEN };
        this.chatTo = null;
        this.chatOnScreen = true;
        this.blocked = [];
        this.worldKey = `world:${world.seed}`;
        this.onBlocked = () => {};

        if (remote) {
            remote.onChat = (line) => this.chatHeard(line);
            remote.onUnsaid = (reason, said) => this.#unsaid(reason, said);
        }

        /**
         * How the camera's turned and shaken (Game options): whether it follows round behind the
         * player as they walk (app/camera.js `follows`), whether the battle cam frames a fight
         * (`battle`), whether it finds the way through where walls crowd it (`openWay`: #openWay),
         * whether the greater spells shake it, how far a drag turns it (times DRAG_TURN, and Q and E
         * as fast) and tilts it (times DRAG_TILT), and whether dragging up tilts it down rather than
         * up.
         */
        this.cameraSettings = { follows: false, battle: true, openWay: true, shake: true, drag: 1, tilt: 1, invert: false };

        // (Who the camera's kept in view in a fight, and till when after: #kept; who the battle
        // cam's taken the fight with over, and those it's let be, turned by hand: #battleFoe)
        this.fightView = null;
        this.battleCamOn = null;
        this.battleCamLeft = new Set();

        // (The keys held turning the camera, Q and E, and whether they've taken hold of it)
        this.turnKeys = new Set();
        this.keyTurning = false;

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
         * folk (the ids of what's been built), door (where it is, its folk dressed only near it:
         * #doorstep), welcomed (whether they're wanted), people (their ids), dressing (whether
         * what's being built now is one of them) }; and when they're next looked over (s).
         */
        this.visits = new Map();
        this.visitClock = 0;

        /** How many of their floors are held at most, further off than they're built (FLOORS.most). */
        this.floorsMost = FLOORS.most;

        /** Wenches and Ale's folk being dressed from the start, the same way (build), or null. */
        this.tavernFolk = null;

        // (A building gone into before its folk were all dressed, dressed while the screen's dark:
        // { visit, until (performance.now()'s: the dark held no longer, however slow the frames) },
        // #entering; and whether the screen's kept dark; and when the player last came to another
        // map (performance.now()'s: #arrive)
        this.arriving = null;
        this.curtainHeld = false;
        this.arrivedAt = -Infinity;

        /** The soldiers the host's brought out, still to be drawn (a few a frame: #visit). */
        this.enlisting = [];

        // Soldiers waiting on their kind's figure in the crowds to be drawn (#marshal), and those crowds
        this.crowdWaiting = new Set();
        this.crowds = null;

        // The wild's people-shaped creatures past the bodies' budget waiting on their kind's figure
        // (#rationing)
        this.rationWaiting = new Set();

        // The folk out in the world past the bodies' budget, not drawn till there's room for them
        // (#folkRoom)
        this.folkWaiting = new Set();

        // Those of them begun, being drawn a step at a time (the nearest the player first: one
        // further off put by for one nearer, and taken up again after): id -> { actor, steps }
        this.enlistees = new Map();

        // Those put aside, a dungeon's walls between them and the player, or out in the world while
        // the player's inside, till the player comes to them (#walledOff, #shutIn): their ids
        this.aside = new Set();

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
        this.onPing = onPing;
        this.landmarks = { version: -1, icons: [] };

        /**
         * The party's pings ([{ id, who, name, x, z (metres), at (the clock's seconds) }]: the
         * newest PING.most, each for PING.lasts: #pinged), and when the player last made one.
         */
        this.pings = [];
        this.pingCount = 0;
        this.pingedAt = -Infinity;
        /** The adventurers' caches the player's seen (their ids: core/caches.js), marked on the maps. */
        this.cachesSeen = new Set();
        /** The wilds director's peaceful finds the player's seen (their ids: core/director.js), marked on the maps. */
        this.findsSeen = new Set();
        /**
         * The rare encounters out that the player or one of their party has seen (core/rare.js; by
         * their number: { n, card, at }), marked on the maps where they were seen, till they end.
         */
        this.raresSeen = new Map();
        /** The fresh tracks the player's come upon (their ids: core/director.js FRESH), said once. */
        this.freshSeen = new Set();
        /** The strangers the player's come upon (their ids: core/director.js STRANGERS), said once. */
        this.strangersSeen = new Set();
        // (The shrines come near, told whose each is: #nearShrine)
        this.shrinesNear = new Set();
        /** What's across the way the player's come upon (their ids: core/director.js OBSTACLES), said once. */
        this.obstaclesSeen = new Set();
        // (What's across the way the player's holding on, to clear it: its id, or null; #holdOn)
        this.toClear = null;
        this.talking = null;
        this.approaching = null;
        this.talkVariety = new Variety();

        // The map whose guild's portal the player's walking up to (tapped: #keepToPortal), or null;
        // whose war table (#keepToTable); and whose lectern, to read what's on it (#keepToLectern)
        this.toPortal = null;
        this.toTable = null;
        this.toLectern = null;
        // (And the sign on a trail they're walking up to, to read: #keepToSign; and the shrine, to
        // pray at: #keepToShrine)
        this.toSign = null;
        this.toShrine = null;
    }

    /** This game's player, as the host has them (core/host.js players). */
    get self() {
        return this.host.players.get(this.me);
    }

    /** In another's world, the name of whose it is (their hero's); else null. */
    get hostName() {
        return this.remote ? (this.host.players.get(HOST_PLAYER)?.hero?.name ?? null) : null;
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
    /**
     * What the game holds now (megabytes), for the debug overlay and log (app/telemetry.js): the
     * page's heap where the browser tells (Chromium's; null elsewhere), what the graphics card's
     * been given (world/gpumemory.js), the sounds' decoded copies (audio/sound.js memory), the
     * way-finding's WebAssembly (core/navigation/recast.js wasmBytes), the bodies' own copies on
     * the page (their meshes and pictures, kept to be posed and painted again: world/release.js
     * heldOnPage), the buildings' floors' own copies on the page (#interiorsHeld), all of them
     * together, and how many of what's kept for the world (the beasts' looks, and the models
     * read: beasts/model.js keptModels). Where the heap isn't told (Safari), the bodies' and the
     * floors' copies stand in for it in the total: the least of it, the most of what grows as more
     * are about (measured in Chromium, a town's 30 bodies took the heap from 325 to 485 MB).
     */
    memoryNow() {
        const heap = globalThis.performance?.memory;
        const gpu = this.view.gpuMemory?.report() ?? null;
        const sound = this.sound?.memory?.() ?? 0;
        const wasm = wasmBytes();
        const bodies = heldOnPage([...this.avatars.values()].map((avatar) => avatar.object ?? avatar.character?.object));
        const interiors = this.#interiorsHeld();
        const total = (heap?.usedJSHeapSize ?? bodies + interiors) + (this.view.gpuMemory?.total ?? 0) + sound + wasm;
        const beasts = keptBodies();
        const models = keptModels();

        return {
            totalMB: megabytes(total),
            heapMB: heap ? megabytes(heap.usedJSHeapSize) : null,
            limitMB: heap ? megabytes(heap.jsHeapSizeLimit) : null,
            gpu,
            soundMB: megabytes(sound),
            wasmMB: megabytes(wasm),
            bodiesMB: megabytes(bodies),
            interiorsMB: megabytes(interiors),
            held: { avatars: this.avatars.size, chunks: this.chunks?.drawn.size ?? 0, interiors: this.interiors.size, crowds: this.crowds?.kinds.size ?? 0, beasts: { looks: beasts.looks, unheld: beasts.unheld, MB: megabytes(beasts.bytes) }, models },
        };
    }

    // The buildings' floors' own copies on the page (world/release.js heldOnPage: their meshes and
    // pictures, the wares in them shared among them counted once), held while the player's near:
    // a floor put away till they go in is never given to the graphics card, so it's held here
    // alone, a few megabytes each (an iPhone let the game's tab go with 59 held, uncounted). Worked
    // out again only when what's held changes: a floor built or let go of, or its wares put in it
    #interiorsHeld() {
        let key = "";

        for (const [id, interior] of this.interiors) {
            key += `${id}:${interior.object.children.length};`;
        }

        if (this.interiorsCounted?.key !== key) {
            this.interiorsCounted = { key, bytes: heldOnPage([...this.interiors.values()].map((interior) => interior.object)) };
        }

        return this.interiorsCounted.bytes;
    }

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
    groundOf(mapId, { bare = false } = {}) {
        this.groundsOf ??= new Map();

        const key = `${mapId}${bare ? ":bare" : ""}`;

        if (!this.groundsOf.has(key)) {
            const map = this.world.maps?.[mapId];
            const [ox, oz] = this.originOf(mapId);
            const most = map?.width - 0.01;
            const heightAt = bare && map?.ground?.heightAt ? (x, y) => map.ground.heightAt(x, y) : map?.heightAt && ((x, y) => map.heightAt(x, y));

            this.groundsOf.set(key, heightAt ? (x, z) => heightAt(Math.min(most, Math.max(0, x - ox)), Math.min(most, Math.max(0, z - oz))) : null);
        }

        return this.groundsOf.get(key);
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
        // (Wenches and Ale's floors, built with the town: not those of the buildings the host's got
        // ready, whose plans a world kept or joined comes with, each built only as the player comes
        // to its door (#prepare): joining a world on a server, an iPhone built all 59 it came with,
        // 87 MB kept for good)
        const floors = Object.values(world.maps ?? {}).filter(({ id, building }) => id !== "town" && !building);
        const folk = world.folk ?? [];
        const outside = Boolean(world.maps?.town?.chunk);
        const chunks = outside ? (2 * REACH.drawn + 1) ** 2 : 0;

        // (Wenches and Ale's folk, seen only inside it, dressed from the start as other buildings'
        // are as the player comes near, where there are other buildings: a little each frame)
        const later = Boolean(world.interiors) && floors.length > 0;
        const tavern = later ? world.interiors.of(floors[0].id)?.key : null;
        // (Everyone dressed before the first frame but the player: the orc, anyone else playing, and
        // the tavern's folk unless they're later. Not the soldiers, wagons and wild's creatures about
        // already, a world kept or joined in the thick of things: drawn as those who come later are,
        // the nearest first, each in full or in its kind's crowd as there's room for it)
        const brought = (actor) => actor.kind === "soldier" || actor.kind === "wagon" || actor.kind === "beast";
        const dressed = this.battle.actors.filter((actor) => actor.id !== this.me && !(actor.kind === "folk" && tavern) && !brought(actor)).length;
        // (The steps: the land's chunks, the town's pieces and trees, each floor, each one dressed;
        // and five more: the town begun, the player dressed, ready to draw, the map, ready)
        // (And the figures of the kinds of soldiers near the player, a world kept or joined in the
        // thick of a fight: #figuresFirst)
        const figures = this.#figuresAhead();
        const steps = chunks + world.town.pieces.length + world.trees.length + floors.length + dressed + figures + 5;
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

            this.chunks = new Chunks(world, { undergrowth: view.quality.undergrowth, cliffs: view.quality.cliffs, rocks: view.quality.rocks });
            // (The settlements' houses the Behemoth of the Rift has burnt, as they are now: #syncBurnt)
            this.chunks.burntOf = (place, index) => this.#burntStage(place, index);
            this.chunks.setSpacing(view.quality.ground);
            view.scene.add(this.chunks.object);
            // (The tall grass over the land round the player, as the chunks there are drawn)
            this.grass = new TallGrass(this.chunks.overworld, { ready: (cx, cy) => this.chunks.isDrawn(cx, cy) });
            this.grass.setQuality(view.quality.grass);
            this.chunks.object.add(this.grass.object);
            // (And the land's motes drifting in the air round them; indoors a place's own, if it
            // has any: an ants' nest's spores)
            this.motes = new Motes();
            this.motes.setQuality(view.quality.motes);
            // (As much of the chimneys' smoke as the quality draws)
            SMOKE_SHARE.value = view.quality.smoke;
            view.scene.add(this.motes.object);
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
            // (Its houses the Behemoth of the Rift has burnt, as they are now: #syncBurnt)
            burntOf: (index) => this.#burntStage(world.start?.id, index),
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
            props: this.town.props,
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
        // (And the doors the rare encounters inside add to a dungeon's floors: world/vault3d.js)
        this.vaultDoors = new VaultDoors(world, view.scene);
        this.banners = new Banners(view.scene);
        this.camps = new Camps(view.scene);
        // (And the fortifications standing near the player: world/forts3d.js, #syncForts)
        this.forts3d = new Forts(view.scene, view.far.scene);
        this.fortsClock = 0;
        // (And the armies' camps' stockades: world/stockades3d.js, #syncStockades)
        this.stockades = new Stockades(view.scene);
        this.carried = new CarriedTorches(view.scene);
        this.globes = new LightGlobes(view.scene);
        this.pinMarks = new PinMarks(view.scene, view.far.scene);
        this.pingBeacons = new PingBeacons(view.scene, view.far.scene);
        this.glints = new TreasureGlints(view.scene);

        // (A pin kept from before: the world's ground for finding the way to it worked out now,
        // while it's loading, not in the first frames)
        if (this.pin && world.plan) {
            crossingsOf(world.plan);
        }
        this.drops = new Drops(view.scene, { picture: (id) => this.#itemPicture(id) });

        // (Banners and camps only ever outside, on the world's ground)
        this.banners.setGround(this.groundOf("town"));
        this.camps.setGround(this.groundOf("town"));
        // (Their far shapes on the land as it's seen from afar, where the far land and the places'
        // far shapes are: the ground itself would lay out the land round every one of them to say)
        const [lx, lz] = this.originOf("town");

        this.forts3d.setGround(this.groundOf("town"), world.plan ? (x, z) => landHeightAt(world.plan, x - lx, z - lz) : null);
        // (A stockade on the ground under it, not its walkway's deck: core/overworld.js RAISED)
        this.stockades.setGround(this.groundOf("town", { bare: true }));

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

        // (Its folk those on its own floors: not the townsfolk out in the streets, nor another
        // building's folk. All of those went in with them: 41 dressed in eight seconds as a
        // player went into Wenches and Ale in a town whose buildings round its square were open,
        // and Safari closed the page)
        if (tavern) {
            this.tavernFolk = { key: tavern, queue: [], maps: [], folk: [], door: world.tavern?.door ?? null, welcomed: false, people: () => this.battle.actors.filter(({ kind, map }) => kind === "folk" && world.interiors?.of(map)?.key === tavern).map(({ id }) => id) };
        }

        for (const actor of [...this.battle.actors]) {
            // (The folk out in the world already, the townsfolk in the streets and a stranger by
            // the road, drawn as those who come out are, nearest first, after everyone else:
            // #nextEnlistee; a building's own, once the player goes in: #doorstep, #ready)
            if (actor.kind === "folk" && tavern) {
                if (!world.interiors?.of(actor.map)) {
                    this.enlisting.push(actor.id);
                }

                continue;
            }

            // (The soldiers, wagons and wild's creatures about already, drawn as those who come
            // out later are, the nearest first, in full only as there's room (#marshal, #rationing,
            // #thronging): not all dressed in full before the first frame, as when an iPhone on Low
            // joined a world as an invasion's 120 soldiers fought in its town, dressed 132 (582
            // MB) and let the game's tab go)
            if (brought(actor)) {
                // (Not those already fallen, before the player came: never seen)
                if (!actor.dead) {
                    this.enlisting.push(actor.id);
                }

                continue;
            }

            if (actor.kind === "folk") {
                step(`Filling the tavern (${++filled} of ${folk.length})`);
            } else if (actor.id !== this.me) {
                step(actor.kind === "player" ? `Dressing ${actor.name}` : `Waking the ${actor.name.toLowerCase()}`);
            }

            await time(actor.id === this.me ? "hero" : actor.id, () => allWaiting(this.#dressing(actor), { label: `dressing ${actor.kind} ${actor.wild?.creature ?? actor.id}` }));
        }

        // (Starting in the tavern: its folk there to see from the first)
        this.#ready(world.interiors?.of(this.battle.actor(this.me).map)?.key, { now: true });

        step("Getting ready to draw");

        this.effects = new Effects(view.scene);
        this.contacts = new ContactShadows();
        view.scene.add(this.contacts.mesh);
        // (The prints on the ground out in the world: on its ground, whatever map the player's on)
        this.tracks = new Tracks();
        this.tracks.groundAt = this.groundOf("town");
        view.scene.add(this.tracks.mesh);
        // (And the trails out of the wild's camps and lairs near the player: their prints, which
        // don't fade, and their signs to read, #trailing; how big each kind's seen, for its prints)
        this.trailPrints = new Tracks();
        this.trailPrints.groundAt = this.groundOf("town");
        view.scene.add(this.trailPrints.mesh);
        this.trailSigns = new TrailSigns(view.scene);
        this.trailsAt = null;
        this.gaitsSeen = new Map();
        // (The roaming beasts' dens near the player: #denning)
        this.denProps = new DenProps(view.scene);
        // (And the rings of standing stones' middles, aglow by night while they're awake: #moonlit)
        this.moonGates = new MoonGates(view.scene);
        // (The wilds director's peaceful finds near the player: #findsNear)
        this.findProps = new FindProps(view.scene);
        // (The wild's ways: eyes shining in the dark, bait thrown, an ambush's signs: world/wild3d.js)
        this.eyeShine = new EyeShine(view.scene);
        this.baitLook = new BaitLook(view.scene);
        this.ambushProps = new AmbushProps(view.scene);
        this.lyingDrawn = new Map();
        this.moodsShown = new Map();
        this.mindsTold = new Set();
        this.obstacleProps = new ObstacleProps(view.scene);
        this.ailments = new Ailments3D(this.effects.group);
        // (Its fire, flashes and fireballs lighting what's round them as the world's fires do, each
        // a light of its own: lightsNow, #lightNear; not lent the view's lamps)
        this.spellFx = new SpellFx(this.effects, view.scene, { lights: [] });
        this.spellFx.camera = view.camera;
        this.spellFx.onShake = (amount) => (this.shaking = this.cameraSettings.shake ? Math.max(this.shaking, amount) : 0);
        this.spellFx.onScreen = (colour, strength, seconds) => this.#wash(colour, strength, seconds);
        this.spellFx.warm();
        // (A legendary weapon in hand: its effect's look about it, world/legendaries.js)
        this.legendaries = new LegendaryLooks(this.effects);
        this.#setGround(this.groundOf(this.battle.actor(this.me).map));

        for (const actor of this.battle.actors.filter(({ id }) => this.avatars.has(id))) {
            this.#place(actor);
        }

        // The camera starts on the player, looking north
        const start = this.avatars.get(this.me).object.position;

        this.cameraFollow = new CameraFollow({ x: start.x, z: start.z });
        this.#follow(0);

        // (A world kept or joined in the thick of a fight: the figures of the kinds of soldiers near
        // the player made now, so that they're seen from the first frame, and their shaders
        // compiled with the rest, below)
        const mustered = done;
        const muster = (made) => {
            done = mustered + Math.min(made, figures);
            report(figures ? `Mustering the soldiers (${Math.min(made, figures)} of ${figures})` : "Mustering the soldiers");
        };

        await time("figures", () => this.#figuresFirst(muster));
        done = mustered + figures;

        // (The navigation tiles round the player baked off the page's thread from now on, and the
        // ways the world's first steps find waited for, not baked here as the game begins: they
        // were baked so in its first frame, before the first bake ahead, and held an iPhone up
        // for a moment as it began. Those the ways found near the player never wait for, baked
        // all at once while it loads, and waited for before it begins, below)
        const near = this.#bakeNear();

        this.#bakeAhead();
        step("Drawing the map");

        this.minimap = await time("minimap", () => new Minimap(this.hud.map, world, { onTap: (tap) => this.mapTap(tap), onHold: () => this.onWorldMap() }));
        this.minimap.show(this.minimapShown ?? true);
        this.wheel = new ActionWheel(this.hud.root);
        this.wheel.element.classList.add("action-wheel");
        this.quickBar = new QuickBar(this.hud.root);
        this.quickBar.show(this.quickShown);
        this.quickBar.onUse = (slot) => this.quick(slot);
        this.quickBar.onChoose = (slot) => this.onChooseQuick(slot);
        this.quickBar.onFlick = (slot, way) => this.flickQuick(slot, way);
        this.quickBar.onStale = (slot, lost) => this.#pressLost(slot, lost);
        this.sigil = new Sigil(this.hud.plate);
        // (A legendary weapon's charge, beside it: app/charge.js)
        this.charge = new Charge(this.hud.plate);
        this.sigil.onCast = () => this.castPrismatic();
        this.talk = new TalkPanel(this.hud.root);
        this.pack = new PackPanel(this.hud.root);
        this.pack.onCommand = (command) => this.#packCommand(command);
        this.pack.onWheel = (id) => this.#putOnWheel(`item:${id}`, actionOf(`item:${id}`)?.on === "enemy" ? "enemy" : "self");
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
        this.journal.onShare = (id) => {
            this.#command({ type: "share", request: id }, (result) => this.#requestShared(result));
        };
        this.journal.onRead = (id) => this.read(id);
        this.journal.onGiveUpThread = (id) => {
            this.#command({ type: "abandon", thread: id }, () => this.journal.open && this.#showJournal());
        };
        this.journal.onGiveUpTreasure = (id) => {
            this.#command({ type: "treasure", do: "abandon", treasure: id }, () => this.journal.open && this.#showJournal());
        };
        this.journal.onClose = () => this.closeJournal();
        this.reader = new ReaderPanel(this.hud.root);
        this.reader.onTurn = () => this.sound?.play("pageTurn");
        this.reader.onClose = () => this.closeReader();
        this.partyPanel = new PartyPanel(this.hud.root);
        this.partyPanel.onOrder = (id, order) => this.#orderUnit(id, order);
        this.partyPanel.onPick = (id, pick) => this.#mercCommand({ type: "pick", follower: id, pick });
        this.partyPanel.onTakeBack = (id, slot) => this.#mercCommand({ type: "unoutfit", follower: id, slot });
        this.partyPanel.onRename = (id, name) => this.#mercCommand({ type: "rename", follower: id, name });
        this.partyPanel.onChoose = (id) => this.#chooseAlly(this.allyTarget === id ? null : id);
        this.partyPanel.onParty = (what, who) => this.#partyOrder(what, who);
        this.partyPanel.onSay = (text) => this.#sayToParty(text);
        this.partyPanel.onTab = () => this.#showParty();
        this.partyPanel.onClose = () => this.closeParty();
        this.partyPanel.onWorld = () => {
            this.closeParty();
            this.onWorldPanel?.();
        };
        this.partyPanel.onMessage = (id) => this.#messageTo(id);
        this.partyPanel.onChatTo = (id) => {
            this.chatTo = id;
            this.#showParty();
        };
        this.partyPanel.onBlock = (id, on) => this.block(id, on);
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

        // Compile every shader now rather than when each thing first comes into view (the far
        // land and sky, drawn first, theirs too)
        await time("shaders", () => Promise.all([view.renderer.compileAsync(view.scene, view.camera), view.renderer.compileAsync(view.far.scene, view.far.camera)]));

        // (And every picture of what's shown sent to the graphics card now, not in the first
        // frames drawn: those in sight with the rest)
        await time("pictures", () => {
            const mine = this.battle.actor(this.me);

            for (const [id, avatar] of this.avatars) {
                const actor = this.battle.actor(id);

                if (avatar.sent === false && actor && this.#inSight(actor, mine)) {
                    this.unsent.push(avatar);
                }
            }

            this.#sending(this.unsent, Infinity);
            view.upload();

            // (Waited on till they're there: sent, they're only on their way)
            return view.settled();
        });
        await time("navigation", () => near);

        // (The marshal's first look at the soldiers about in the first frame, not half a second
        // on: any come while it loaded drawn at once)
        this.marshalClock = 0;
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

        // A town's siege engine (core/invasions.js ENGINES): its own model (world/siege3d.js)
        if (actor.engine) {
            return this.#register(actor.id, new EngineAvatar(actor.engine), { wounds: false });
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

        // A follower: as the adventurer they were, in the armour they were given, their weapon put
        // away till there's a fight
        if (actor.kind === "follower") {
            const look = this.#followerLook(actor.id);
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

        // A fortification (its stone drawn by world/forts3d.js): standing in for it in the battle; and
        // a camp's stakes being hacked at (drawn by world/stockades3d.js) the same way
        if (actor.kind === "fort" || actor.kind === "stakes") {
            return this.#register(actor.id, new FortAvatar(actor.kind === "stakes" ? "stakes" : (this.host.fortsOut.get(actor.id)?.kind ?? "tower")), { wounds: false });
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
        const character = yield* Character.building(this.kit, { far: Boolean(this.kit.lods), release: true, ...options });

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
                // (The wild's creatures, put out a pack at a time, drawn a few a frame with the
                // rest, the nearest the player first (#visit): all dressed here at once, a pack
                // just put out, or a level of a dungeon, held the frame up for seconds on a phone.
                // So is a follower just hired: one dressed here at once held an iPhone up for
                // 0.6 s)
                if (actor.kind === "beast" || actor.kind === "follower") {
                    // (But one hired here and now, drawn as the adventurer they were, at once:
                    // queued, they were gone from where they stood till built, once the guild's
                    // own folk were, seconds on a phone)
                    if (actor.kind === "follower" && this.#adopted(actor)) {
                        this.#place(actor);
                        this.hud.track(actor.id, { ...actor, hostile: Boolean(me) && this.battle.hostile(actor, me) });

                        continue;
                    }

                    // (Not a creature that's died never drawn: one past the bodies' budget, say,
                    // #rationing; its body built only to lie there a while)
                    if (!this.enlisting.includes(actor.id) && !this.enlistees.has(actor.id) && !this.aside.has(actor.id) && !(actor.kind === "beast" && actor.dead)) {
                        this.enlisting.push(actor.id);
                    }

                    continue;
                }

                const started = performance.now();

                this.#dress(actor);

                const took = performance.now() - started;

                if (took > Steps.SLOW) {
                    Steps.slow?.(`dressing ${actor.kind} ${actor.id} at once`, took);
                }

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

    // A follower just hired drawn as the adventurer they were, their body kept as it is, not
    // dressed again from nothing at once (that held an iPhone's frame up 0.7 s): both are drawn
    // from the same calling, sex, seed and people (folkLook). Whether they were: not if the
    // adventurer's gone already, or was one of a crowd
    #adopted(actor) {
        const following = this.host.followers.get(actor.id);
        const was = following?.from ? this.avatars.get(following.from) : null;

        if (!(was instanceof Avatar) || this.battle.actor(following.from)) {
            return false;
        }

        const look = folkLook({ role: "adventurer", look: following.calling, sex: following.sex, seed: following.seed, people: following.people });
        const character = was.character;

        this.#undress(following.from, { keep: true });
        character.sheathe(true);

        const avatar = this.#addAvatar(actor.id, character, { walk: look.walk, guard: guardOf(actor.weapon) });

        // (Drawn already, its shaders made and its pictures sent, as a rule: shown at once, as it
        // was, facing the way it was)
        avatar.compiling = Boolean(was.compiling);
        avatar.sent = was.sent;
        avatar.facing = was.facing;
        character.object.visible = !avatar.compiling && avatar.sent !== false;

        return true;
    }

    // A follower hired from their drink (#adopted: their body as it was at the table, a tankard
    // in the hand their weapon goes in): the drink put down and their arms taken up, the
    // adventurer's own (folkLook's, as a follower's drawn anew), put away till there's a fight.
    // Once they've gone out through a door or up or down the stairs ("cross"), or as they draw for
    // a fight or swing before then
    #takeUpArms(actor, avatar) {
        const character = avatar?.character;

        if (actor?.kind !== "follower" || !character?.equipment || ![...character.equipment.values()].includes("tankard")) {
            return;
        }

        character.setEquipment(this.#followerLook(actor.id).equipment);
        character.sheathe(true);
    }

    // How one of the hired adventurers looks: as the adventurer they were, in the body armour
    // their leader gave them (characters/folk.js followerLook)
    #followerLook(id) {
        const { calling = "warrior", sex = "m", seed = 1, people = "human", gear } = this.host.followers.get(id) ?? {};

        return followerLook({ calling, sex, seed, people, body: gear?.body ?? null });
    }

    // One of the hired adventurers given body armour, or theirs taken back (core/host.js "follower"
    // events, "outfitted"): drawn in what they wear now, by anyone who sees them; out of their
    // crowd for now, its figure of them as they were (#throngKind) theirs no longer. Their weapon
    // in hand or put away as it was
    #redress(id) {
        const avatar = this.avatars.get(id);

        if (!(avatar instanceof Avatar) || !avatar.character?.equipment || [...avatar.character.equipment.values()].includes("tankard")) {
            return;
        }

        this.#unthrong(id);
        avatar.character.setEquipment(this.#followerLook(id).equipment);
    }

    // One of an army made its standard-bearer (core/host.js "standard" events): drawn bearing it
    // from now on. In full, given it in place of their shield, out of their crowd for now (its
    // figure of them as they were theirs no longer); in their crowd, drawn afresh, to go to the
    // bearers' own (#crowdKind)
    #bearsStandard(id) {
        const avatar = this.avatars.get(id);
        const soldier = this.host.soldiers.get(id);

        if (!avatar || !soldier) {
            return;
        }

        if (avatar instanceof CrowdAvatar) {
            this.#unenlist([id]);
            this.#undress(id);
            this.enlisting.push(id);
        } else if (avatar instanceof Avatar && avatar.character?.equipment) {
            this.#unthrong(id);
            avatar.character.setEquipment(soldierLook(soldier).equipment);
        }
    }

    // Someone gone from the battle, no longer drawn (their body kept, `keep`, for someone else)
    #undress(id, { keep = false } = {}) {
        this.#unthrong(id);

        const avatar = this.avatars.get(id);

        if (!keep) {
            avatar?.character.object.removeFromParent();
            avatar?.character.dispose();
        }
        this.wounds.get(id)?.dispose();
        this.hud.untrack(id);
        this.ailments?.clear(id);
        this.radiant.delete(id);

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
        const seed = this.#seedOf(actor);

        // (Its model asked for now, if it's drawn from one and it isn't read yet: its stand-in's
        // drawn till it is, #modelling)
        wantModel(actor.wild.creature, "now");

        const weapon = WEAPONS[actor.weapon];
        const avatar = yield* dressingCreature(this.kit, actor.wild.creature, { seed, equipment: weapon?.equipment ?? [], guard: weapon ? guardOf(actor.weapon) : null, hairDetail: Math.min(this.view.quality.hair, FOLK_HAIR), champion: actor.wild.champion ?? null, regalia: actor.wild.regalia ?? null, release: true });

        // (Gone from the battle, or drawn in full some other way, while it was being built: but
        // one in its crowd, built in full in its place, #rationing)
        if (this.#drawnInFull(actor.id) || !this.battle.actor(actor.id)) {
            avatar.character.dispose();

            return this.avatars.get(actor.id) ?? null;
        }

        avatar.character.sheathe(true);

        // (Drawn with fewer triangles when small on the screen: one people-shaped as folk are,
        // #built; a creature its own way, BeastAvatar.lowerDetail)
        if (this.kit.lods) {
            (avatar instanceof BeastAvatar ? avatar : avatar.character).lowerDetail(this.kit.lods);
        }

        // (Its voice downloaded now it's near: audio/sound.js want)
        this.sound?.want(creatureSounds(actor.wild.creature));

        const registered = this.#register(actor.id, avatar, { wounds: !(avatar instanceof BeastAvatar) });

        // (One of the elites, radiant: #radiant)
        if (actor.wild.elite && !actor.dead) {
            this.ailments.add(actor.id, "elite", avatar.object, avatar.character.height);
            this.radiant.add(actor.id);
        }

        return registered;
    }

    // The wild's elites (core/creatures.js ELITES) drawn radiant (world/ailments3d.js "elite"), from
    // when they're drawn till they fall
    #radiant() {
        for (const id of this.radiant) {
            const actor = this.battle.actor(id);

            if (!actor || actor.dead) {
                this.ailments.remove(id, "elite");
                this.radiant.delete(id);
            }
        }
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

            const footing = this.#footingAt(this.world.maps?.[mapId] ?? this.world, x - ox, z - oz);

            this.sound?.step(footing, avatar.object.position, { speed, ...avatar.gait, armour: armourOf(avatar.character) });

            // (One of the wild's, out in the world: its print left where its foot came down, as
            // deep as the ground there takes it, tracks3d.js; and how big its kind is, for the
            // prints on its trails)
            if (actor?.wild && avatar instanceof BeastAvatar && avatar.gait?.size) {
                this.gaitsSeen.set(actor.wild.creature, avatar.gait.size);
            }

            if (actor?.wild && mapId === "town" && TAKES[footing]) {
                this.#printed(actor, avatar, foot, footing);
            }
        };
        character.object.name = id;
        this.view.scene.add(character.object);

        // (One of a crowd till now, drawn in full in its place: as it was, its crowd's figure fading)
        if (this.avatars.get(id) instanceof CrowdAvatar) {
            this.#handOver(id, this.avatars.get(id), avatar);
        }

        this.avatars.set(id, avatar);

        if (wounds) {
            this.wounds.set(id, new Wounds(character, { seed: this.avatars.size * 17 + 3 }));
        }

        // (Its shaders compiled before it's first drawn, hidden till then (#update), so that a
        // kind of creature, or garment, not drawn before doesn't stall a frame compiling them;
        // and its pictures sent first, once it's about to be seen: #sending. Not a fortification,
        // drawn by world/forts3d.js)
        const ready = () => (avatar.compiling = false);

        avatar.compiling = true;
        this.view.prepare(character.object).then(ready, ready);

        if (!(avatar instanceof FortAvatar)) {
            avatar.sent = false;
            character.object.visible = false;
        }

        return avatar;
    }

    // Whether someone's drawn: on the player's map, and out in the world, near them
    #inSight(actor, mine) {
        return actor.map === this.mapId && !(mine && actor !== mine && (Math.abs(actor.x - mine.x) > DRAW_REACH || Math.abs(actor.y - mine.y) > DRAW_REACH));
    }

    // Those about to be drawn whose pictures haven't been sent to the graphics card (`unsent`):
    // `every` of those in the camera's view sent, the rest kept hidden till a later frame's
    // (someone new, or a building's folk as the player comes in, don't hold one frame up sending
    // all their skins at once), and out in the world, those out of its view till they're in it
    // (inside, in a room or two, all of them: a turn of the camera sees any of them)
    #sending(unsent, every = SENDING.every) {
        const camera = this.view.camera;
        const outside = !this.interiors.has(this.mapId);
        let sent = 0;

        camera.updateMatrixWorld();
        _seen.setFromProjectionMatrix(_seenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse), camera.coordinateSystem);

        for (const avatar of unsent) {
            const height = avatar.character?.height ?? 1.8;

            _round.center.copy(avatar.object.position);
            _round.center.y += height / 2;
            _round.radius = Math.max(SENDING.round, height);

            if (sent < every && (!outside || _seen.intersectsSphere(_round))) {
                this.view.upload([avatar.object], { hidden: true });
                avatar.sent = true;
                sent++;
            }
        }

        unsent.length = 0;
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

        // (Joined: the world held for no one now)
        this.remote?.hold(false);

        if (this.running) {
            return;
        }

        this.running = true;
        this.lastFrame = performance.now();
        this.steppedAt = this.lastFrame;
        telemetry.playing = true;
        telemetry.graphics = this.view.renderer.info;
        telemetry.madeFor = (programs) => this.#madeFor(programs);
        this.view.renderer.setAnimationLoop((now) => this.#frame(now));
        this.sound?.setAmbient(this.mapId === "town");
        this.sound?.setPlace(this.#soundOf(this.mapId));
        this.sound?.setPaused(false);
        this.#wantSpells();
        this.#wantItems();
    }

    // The sounds of the spells the player can cast downloaded now (audio/sound.js want), and the
    // made ones made and kept (makeAhead), so they're in before they're first cast; and a spell
    // breaking off's, and a Scroll of Safety's
    #wantSpells() {
        const known = Object.keys(SPELLS).filter((id) => this.progress.knows?.(id));
        const sounds = ["fizzle", "spellCircle", "teleportOut", "teleportIn", "breath", ...known.flatMap((id) => Object.values(spellSounds(id)).filter(Boolean))];

        this.sound?.want(sounds);
        this.sound?.makeAhead(sounds, { keep: true });
    }

    // The sounds of the player's things in their hands downloaded now (audio/sound.js want), after
    // what's heard first: picked up, put on, used, opened
    #wantItems() {
        this.sound?.want(ITEM_SOUNDS);
    }

    /** Stop: nothing moves until start() again. */
    stop() {
        this.running = false;
        telemetry.playing = false;
        telemetry.closed();
        this.view.renderer.setAnimationLoop(null);
        this.sound?.setPaused(true);
        this.#deafen();
    }

    /**
     * Pause (the menu open, or the world map): the world stops if it can (with no one else in it:
     * core/host.js pausable) and `world` isn't false (the war table's map, read as the war goes
     * on), else it goes on, and only the player's taps and clicks aren't listened to, until start()
     * again. Joined, the world's the host's to stop: it's held (core/netplay.js Joining hold), and a
     * world server stops it if they're the only one in it; this copy plays on as its steps come.
     * Returns whether it stopped.
     */
    pause({ world = true } = {}) {
        if (this.remote) {
            if (world) {
                this.remote.hold(true);
            }

            this.#deafen();

            return false;
        }

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
        this.#unaim();

        // (Q or E held: let go of, as its key's let go of unheard)
        this.turnKeys.clear();

        if (this.keyTurning) {
            this.keyTurning = false;
            this.cameraFollow?.release();
        }

        for (const pointer of this.pointers.values()) {
            clearTimeout(pointer.hold);
            this.#letGo(pointer);

            // (Held on what's across the way: let go of)
            if (pointer.clearing) {
                this.#leaveOff();
            }
        }

        this.pointers.clear();
        this.pinch = null;
        this.wheel?.hide();
        this.quickBar?.release();

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
        this.sound?.setLand("human");
        this.sound?.setBattle(false);
        this.sound?.setHearth(null);
        this.hud.clear();
        this.hud.onMessage = () => {};
        this.hud.onAttacker = () => {};
        this.hud.onPartyMember = () => {};
        this.hud.onPartyMore = () => {};
        this.memberWheel?.();

        for (const avatar of this.avatars.values()) {
            avatar.object.removeFromParent();
            avatar.character.dispose();
        }

        this.thronged.clear();
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
        this.motes?.object.removeFromParent();
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
        this.tracks?.dispose();
        this.trailPrints?.dispose();
        this.trailSigns?.dispose();
        this.denProps?.dispose();
        this.moonGates?.dispose();
        this.findProps?.dispose();
        this.eyeShine?.dispose();
        this.baitLook?.dispose();
        this.ambushProps?.dispose();
        this.obstacleProps?.dispose();
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
        this.vaultDoors?.dispose();
        this.banners?.dispose();
        this.camps?.dispose();
        this.forts3d?.dispose();
        this.stockades?.dispose();
        this.carried?.dispose();
        this.globes?.dispose();
        this.pinMarks?.dispose();
        this.pingBeacons?.dispose();
        this.glints?.dispose();
        this.flyers?.dispose();

        this.spellFx?.dispose();

        for (const object of [this.ground, this.town?.object, this.chunks?.object, this.squares?.object]) {
            object?.removeFromParent();
        }

        this.minimap?.dispose();
        this.wheel?.element.remove();
        this.quickBar?.dispose();
        this.sigil?.dispose();
        this.charge?.dispose();
        this.legendaries?.dispose();
        this.talk?.panel.remove();
        this.pack?.dispose();
        this.drops?.dispose();
        this.journal?.panel.remove();
        this.reader?.panel.remove();
        this.partyPanel?.panel.remove();
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

    /** Show the minimap or not (not: folded away into the compass in its corner, index.html #compass). */
    showMinimap(on) {
        this.minimapShown = on;
        this.minimap?.show(on);
        this.compassTurned = null;
    }

    // The compass turned for its N to point north as the camera sees it (minimap.js compassTurn),
    // only when that's changed (looking straight down, as it was): the minimap shown, the needle on
    // the button over its corner that folds it away (index.html #minimapneedle: drawn pointing up
    // whichever way the camera looked); folded away, the compass in its place (#compassrose)
    #turnCompass() {
        const [id, middle] = this.minimapShown === false ? ["#compassrose", 32] : ["#minimapneedle", 12];
        const turning = (this.compassTurning ??= new Map());
        const turned = turning.get(id) ?? this.hud.root.querySelector(id);
        const looking = this.view.camera.getWorldDirection(_looking);

        turning.set(id, turned);

        if (!turned || Math.hypot(looking.x, looking.z) <= 1e-3) {
            return;
        }

        const turn = compassTurn(Math.atan2(looking.x, looking.z));

        if (this.compassTurned !== null && Math.abs(turn - this.compassTurned) < 0.005) {
            return;
        }

        this.compassTurned = turn;
        turned.setAttribute("transform", `rotate(${(turn * 180) / Math.PI} ${middle} ${middle})`);
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
    // (The ways anyone but a player finds wait for the tiles not in yet, made off the page's
    // thread: navigation.js later, core/battle.js #pathTo)
    #navBaker() {
        if (!this.navBaker) {
            const navigation = navigatorOf(this.world.maps.town);

            this.navBaker = new NavBaker(navigation);

            if (this.navBaker.worker) {
                navigation.later = (tx, ty) => this.navBaker.want(tx, ty);
            }
        }

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

        this.runner.bakeAhead(this.#navBaker());
    }

    // The navigation tiles round the player that the ways found near them never wait for
    // (core/battle.js WAIT_BEYOND, and the few metres round a way its tiles are made for), baked
    // off the page's thread all at once as the game loads: resolves once they're in
    // (world/navbaker.js ready)
    #bakeNear() {
        const player = this.battle.actor(this.me);

        if (this.remote || !this.world.maps?.town?.chunkAt || player?.map !== "town") {
            return Promise.resolve();
        }

        return this.#navBaker().ready(player.x, player.y, WAIT_BEYOND + WAY_MARGIN);
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
     * Hosting a world opened to others: what sends them what's done (core/netplay.js Hosting, set
     * by app/together.js as it's opened and closed), or null. The runner sends it as it's due.
     */
    get hosting() {
        return this.runner?.hosting ?? null;
    }

    set hosting(hosting) {
        if (this.runner) {
            this.runner.hosting = hosting;
        }

        // (Which direct messages the host's own player takes, told to it)
        hosting?.takeDms(this.me, this.dmsTaken);
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

        // (Not while the screen's kept dark: #curtain)
        if (render && !this.curtainHeld) {
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
        telemetry.begin(frameStart);

        // (An error in the frame's work is reported, and the world still drawn, rather than the
        // picture freezing on it)
        let steps = 0;

        try {
            steps = this.#tick(dt, elapsed);
        } catch (error) {
            this.#fault(error);
        }

        this.#aim(now);

        if (this.remote || this.hosting || this.together) {
            this.#together(steps ? (this.steppedAt = now) : now);
        }

        this.#worldLink(now);

        const updated = performance.now();
        const mine = this.avatars.get(this.me);

        // (The pack open on the paperdoll: the player alone drawn, live, the world behind it still;
        // nothing, while the screen's kept dark going into a building, its folk dressed with the
        // frame's time instead: #curtain)
        if (this.pack?.showingDoll && mine) {
            this.view.renderPreview(this.pack.dollView, mine.object, { height: mine.character.height ?? 1.7, turn: this.dollTurn, clip: this.pack.body });
        } else if (!this.curtainHeld) {
            this.view.render();
        }

        const rendered = performance.now();

        telemetry.mark(PHASE.draw);

        // (Less drawn while it can't keep up, more again when it can, if that's left to it:
        // Adaptive. In a crowded fight, those least seen drawn in their kind's crowd first,
        // app/throng.js; then fewer pixels and a lower level, app/governor.js)
        if (this.view.adaptive) {
            const full = this.throng.observe(now, elapsed * 1000, this.throngCount);

            if (full !== null) {
                this.throngClock = 0;
                this.governor.hold(now);
            } else {
                const rung = this.governor.observe(now, elapsed * 1000);

                if (rung) {
                    this.adapt(rung);
                }
            }
        }

        // Timings for the debug overlay
        const smooth = (key, value) => (this.stats[key] += (value - this.stats[key]) * 0.1);

        smooth("frame", dt * 1000);
        smooth("update", updated - frameStart);
        smooth("render", rendered - updated);
        this.stats.steps = steps;
        this.#budget(now, elapsed * 1000, rendered - frameStart);

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

        // (The debug log: a freeze or slow going kept, with how it was going; and how it's going
        // written down now and then, for a crash to be found by: just after the frame, not in it)
        telemetry.end(elapsed * 1000, this.telemetryState);
        telemetry.aliveSoon(this.telemetryState);
    }

    // How big an invasion this device can draw (app/budget.js), from a frame's work (ms: updated
    // and drawn), told the host whenever it's changed enough: not while one's on (its frames
    // aren't what's measured), and not as the player's own doing (#command: nothing they were
    // about, a journey or the way to a portal, given up for it)
    #budget(now, interval, work) {
        if (this.host.invasions.length) {
            this.invasionBudget.hold();

            return;
        }

        this.device ??= detectQuality();

        const size = this.invasionBudget.observe(now, interval, work, this.device);

        if (size !== null) {
            const command = { type: "budget", invasion: size };

            this.remote ? this.remote.command(command) : this.host.command(this.me, command);
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
            telemetry.error(error, "frame", this.telemetryState);
        }
    }

    // What some shaders just made (three.js's programs) were for, for the debug log: each
    // material using one, by its type and name, and what it's on (the object and those it's in,
    // a few, by name: "MeshStandardMaterial body < home:guild-1/receptionist")
    #madeFor(programs) {
        const fresh = new Set(programs);
        const properties = this.view.renderer.properties;
        const found = new Set();

        this.view.scene.traverse((object) => {
            for (const material of [object.material].flat()) {
                if (material && fresh.has(properties.get(material).currentProgram)) {
                    const chain = [];

                    for (let at = object; at && chain.length < 3; at = at.parent) {
                        chain.push(at.name || at.type);
                    }

                    found.add(`${material.type}${material.name ? ` ${material.name}` : ""}: ${chain.join(" < ")}`);
                }
            }
        });

        return [...found];
    }

    // Where everyone and everything in the air was, before a step: drawn between that and where the
    // step leaves them, as the frames come
    #remember() {
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
    }

    // Run the battle's steps for `dt` seconds, and move everyone to match. Returns the steps run
    #tick(dt, elapsed = dt) {
        // (Joined: the host's steps played a little slower or faster, to keep a few in hand; and
        // as fast as time goes by, however slowly the frames come (a second's worth at most a
        // frame), or the host would leave it behind)
        const played = this.remote ? Math.min(JOINED_FRAME, elapsed) : dt;

        if (this.remote) {
            this.accumulator += played * 1000 * this.remote.pace(played * 1000);
        }

        // (What was put off till now: a spark off the anvil at each blow)
        if (this.later.length && this.later[0].at <= this.clock) {
            const due = this.later.filter(({ at }) => at <= this.clock);

            this.later = this.later.filter(({ at }) => at > this.clock);

            for (const { then } of due) {
                then();
            }
        }

        let steps = 0;

        if (this.remote) {
            while (this.accumulator >= STEP_MS) {
                // (Where everyone was, to draw them from: unless there's no step to play yet, when
                // they're drawn going on as they were a little while (RUN_ON), rather than stopped)
                if (this.remote.behind > 0) {
                    this.#remember();
                }

                // (Joined to another's world: its steps as the host played them, when they've come)
                const events = this.remote.step();

                if (!events) {
                    this.accumulator = Math.min(this.accumulator, STEP_MS * RUN_ON);

                    break;
                }

                this.#handleTimed(events);
                this.accumulator -= STEP_MS;
                steps++;
            }
        } else {
            // (Playing its own world: the runner moves it on, and sends what's done to any who've
            // joined it as that's due; each step timed, as its news is handled)
            let began = 0;

            steps = this.runner.advance(played * 1000, {
                before: () => {
                    this.#remember();
                    began = performance.now();
                },
                after: (events) => this.#handleTimed(events, began),
            });
        }

        telemetry.mark(PHASE.steps);

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

            this.#handleTimed(events);
            steps++;
        }

        // (Joined: how long a word takes to the host and back, now and then)
        if (this.remote && this.clock - this.pingedAt >= PING_EVERY) {
            this.pingedAt = this.clock;
            this.remote.ping();
        }

        this.#update(dt, (this.remote ? this.accumulator : this.runner.lag) / STEP_MS);
        telemetry.mark(PHASE.bars);

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
            const { why, by } = remote.paused;

            status = why === "host" && by ? `${by} has paused the game.` : (TOGETHER.paused[why] ?? TOGETHER.paused.still);
        } else if (remote?.farBehind) {
            status = TOGETHER.behind;
        } else if (remote && now - this.steppedAt > WAITING_AFTER) {
            status = TOGETHER.waiting;
        }

        if (status !== this.together) {
            this.together = status;
            this.hud.status(status);
        }
    }

    // How the world's linked, for the HUD's lantern or orb (app/worldlink.js), looked at every
    // LINK_EVERY ms (`now`): in another's, whose it is (or the world server's, `linkAbout`) and the
    // round trip to it; with friends in theirs, how many and the slowest of their links; drawn
    // only when it changes
    #worldLink(now) {
        if (now - this.linkAt < LINK_EVERY) {
            return;
        }

        this.linkAt = now;

        const guests = this.remote ? 0 : (this.hosting?.players.size ?? 0);
        const about = this.linkAbout ?? {};
        const view = worldLinkOf({
            joined: this.remote ? { rtt: this.remote.lately, host: this.hostName } : null,
            hosting: guests ? { guests, slowest: this.hosting.slowest() } : null,
            lost: this.link !== null,
            about: { ...about, how: typeof about.how === "function" ? about.how() : about.how },
        });
        const key = `${view.away} ${view.quality} ${view.words}`;

        if (key !== this.linkKey) {
            this.linkKey = key;
            this.linkView = view;
            this.hud.worldLink(view);
        }
    }

    #update(dt, alpha) {
        const { battle, view, hud } = this;
        const mine = battle.actor(this.me);
        const pixels = view.pixelsPerMetre();

        this.clock += dt;
        TREE_WIND.time.value = this.clock;

        // (On another map than the one shown, with no crossing seen taking them there: shown the one
        // they're on. A joined game begun inside, its player taken over upstairs in Wenches and Ale
        // from another device, was shown the town till the host happened to send the world again)
        if (mine && mine.map !== this.mapId && this.avatars.has(this.me)) {
            this.#arrive(mine);
        }

        // (The prints on the ground fading by the clock, seen only out in the world)
        if (this.tracks) {
            this.tracks.update(this.clock);
            this.tracks.mesh.visible = this.tracks.mesh.count > 0 && mine?.map === "town";
        }
        // (A hell's way in standing in the open swirling by the same clock as the veils indoors: veil.js)
        VEIL.time.value = this.clock % VEIL.loop;

        // (The fortifications and the camps' stockades standing near the player drawn, a couple of
        // times a second, named in the debug log if that's slow; a stockade's mended stakes rising
        // every frame)
        if ((this.fortsClock -= dt) <= 0) {
            const started = performance.now();

            this.fortsClock = 0.5;
            this.#syncForts();
            this.#syncStockades();
            this.#syncBurnt();
            this.#syncThreadCamps();

            const took = performance.now() - started;

            if (took > Steps.SLOW) {
                Steps.slow?.("fortifications and stockades drawn", took);
            }
        }

        this.stockades?.update(dt);
        this.contacts?.begin();
        this.#marshal(dt);
        this.#bossBar(dt);
        this.#allying();
        this.#rationing(dt);
        this.#shutIn(dt);
        this.#folkRoom(dt);
        this.#thronging(dt);
        this.#crowding();
        this.#forgetting(dt);
        this.#modelling(dt);

        const bodies = Object.assign(this.stats.bodies, { drawn: 0, posed: 0, shadows: 0 });
        this.#cheered();
        telemetry.mark(PHASE.setup);

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
            if (!this.#inSight(actor, mine)) {
                avatar.object.visible = false;

                if (this.thronged.has(actor.id)) {
                    this.thronged.get(actor.id).standIn.object.visible = false;
                }

                continue;
            }

            let x = previous.x + (actor.x - previous.x) * alpha;
            let z = previous.y + (actor.y - previous.y) * alpha;
            let facing = actor.facing;
            let acting = Boolean(actor.attack);

            // (Joined: their own hero drawn where the rules will have them as soon as what's sent
            // now is done, ahead of the copy, facing as they'll face, swinging and casting as they
            // begin to there: app/forecast.js)
            if (actor === mine && this.forecast) {
                const place = this.forecast.at(battle, this.me, this.remote.clock(), this.remote.lately ?? undefined);

                if (place && place.map === actor.map) {
                    [x, z, facing, acting] = [place.x, place.y, place.facing, place.acting];
                }

                // (Begun there, shown now, wherever they're drawn: the copy's of each not shown)
                for (const event of place?.begun ?? []) {
                    if (event.type === "attack") {
                        this.#attackSeen(event, avatar);
                    } else {
                        this.#castSeen(event, avatar, true);
                    }
                }
            }

            // (A fortification, or a camp's stakes: only where it stands, on the ground there; and a
            // siege engine, rolled there)
            if (actor.kind === "fort" || actor.kind === "stakes" || actor.engine) {
                avatar.update(dt, ox + x, oz + z, actor.facing);
                avatar.object.position.y = this.#groundOn(actor.map, ox + x, oz + z);

                // (A siege engine shown as anyone drawn is, once its shaders are ready and its
                // pictures sent: #register, #sending)
                if (actor.engine) {
                    avatar.object.visible = !avatar.compiling && avatar.sent !== false;

                    if (avatar.sent === false) {
                        this.unsent.push(avatar);
                    }
                }

                continue;
            }

            avatar.actions.setGuard(!actor.dead && actor.armed && this.#fighting(actor));

            // (One of the folk who sits: up and away in a fright, and back to its seat after)
            if (actor.routine?.seated) {
                avatar.actions.setSeated(sitting(actor));
            }

            // (An emote's over once they're off somewhere, or fighting)
            if (avatar.actions.emoting && (actor.dead || actor.path.length || actor.attack || actor.casting)) {
                avatar.actions.stopEmote();
            }

            // (Drawn in its kind's crowd for now: its body not posed, its stand-in drawn where it is)
            const thronged = this.thronged.get(actor.id);

            avatar.every = thronged ? Infinity : this.#posing(actor, avatar, dt, pixels);
            this.#gazing(actor, avatar, mine);

            // (Up in the air over a fight, badly hurt: battle.js #hover; its wings heard)
            if (actor.aloft && !actor.dead) {
                avatar.hover?.(aloftShare(actor.aloft, battle.time));
                this.#hovering(actor, avatar);
            }

            // (Lurking under the roof, or dropping from it on its thread: battle.js #lurk)
            if (actor.wild?.lurk) {
                avatar.hang?.(this.#hanging(actor, avatar, ox + x, oz + z));
            }

            avatar.update(dt, ox + x, oz + z, facing, !acting);

            if (!thronged) {
                this.#counted(avatar, bodies);
            }
            // (Where they're drawn, which trails where they are a little)
            this.#updateBody(actor, avatar, dt, this.#standsAt(actor.map, avatar.object.position.x - ox, avatar.object.position.z - oz));
            hud.setStamina(actor.id, actor.stamina, actor.maxStamina);

            // (Not shown till its shaders are ready and its pictures sent: #register, #sending)
            if (avatar.compiling || avatar.sent === false) {
                avatar.object.visible = false;
            }

            if (avatar.sent === false) {
                this.unsent.push(avatar);
            }

            this.#grounded(actor, avatar);
            this.#calling(actor, avatar);
            thronged?.standIn.track(avatar, dt);
        }

        this.#fading(dt);
        this.contacts?.end();
        this.#sending(this.unsent);
        bodies.crowd = this.crowds?.draw(view.camera, pixels) ?? 0;
        bodies.standing = this.thronged.size;
        telemetry.mark(PHASE.bodies);

        // Projectiles, between their last two steps, rising and falling on the way
        for (const projectile of battle.projectiles) {
            const flight = this.flights.get(projectile.id);

            if (flight) {
                const [ox, oz] = this.originOf(projectile.map);
                const x = ox + flight.previous.x + (projectile.x - flight.previous.x) * Math.min(1, alpha);
                const z = oz + flight.previous.y + (projectile.y - flight.previous.y) * Math.min(1, alpha);
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
        this.view.setOmen(this.spellFx.darkness(), this.spellFx.omenTint());

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

        // (In a fight, or lately: a fight's music; FIGHT_LINGERS after its last moment, what's
        // heard here again: fight.js)
        if (inFight(battle.actor(this.me), battle.actors, (a, b) => battle.hostile(a, b), battle.time - (this.lastAttack.get(this.me) ?? -Infinity))) {
            this.foughtAt = battle.time;
        }

        // (An invasion on round the player, till its raiders break: a fight's music, in it or not)
        if (this.#invadedHere()) {
            this.foughtAt = battle.time;
        }

        this.sound?.setBattle(battle.time - (this.foughtAt ?? -Infinity) < FIGHT_LINGERS);

        // (The criers near calling out, as often as what's heard is worked out)
        this.crying = (this.crying ?? 0) - dt;

        if (this.crying <= 0) {
            this.crying = HEARD_EVERY;
            this.#cryOut();
        }
        this.#castsHeard();

        // The enemy the player is set to fight, ringed, with its bar lit
        const target = this.#target();
        const ringed = target ? this.avatars.get(target.id) : null;

        this.effects.setTarget(ringed?.object ?? null, ringed ? Math.max(0.5, ringed.character.height * 0.33) : 0.6);
        hud.setTarget(target?.id ?? null);

        // The one of their party the player's chosen to help, ringed in green; and the party's
        // icons down the left (and the party menu, if it's open)
        const ally = this.#ally();
        const helped = ally ? this.avatars.get(ally.id) : null;

        this.effects.setAlly(helped?.object ?? null, helped ? Math.max(0.5, helped.character.height * 0.33) : 0.6);
        this.#partyIcons();
        this.#quickActions(target);
        this.sigil.show(this.#prism(), this.battle.time);
        this.charge.show(this.#charging(), this.battle.time);
        this.#sizeUp(dt);
        this.#wielding(dt);
        this.#bleed(dt);
        this.#ailing();
        this.#radiant();
        this.#grounds();
        this.ailments?.update(dt);
        this.#keepTalking();
        this.#keepShopping();
        this.#keepToPortal();
        this.#keepToTable();
        this.#keepToLectern();
        this.#keepToSign();
        this.#keepToShrine();
        this.#keepToObstacle();
        this.#restPlayer();
        this.effects.update(dt, view.pixelsPerMetre());
        this.#drawDrops();
        this.#spyCaches();
        this.#spyFinds();
        this.#spyStrangers();
        this.#spyObstacles();
        this.#drawMinimap(target);

        if (this.squares?.object.visible) {
            this.showSquares(true);
            this.squares.update(battle);
        }

        if (this.navigationShown) {
            this.#drawNavigation();
        }

        this.#bakeAhead();
        telemetry.mark(PHASE.effects);

        // The time of day, out in the world and indoors
        if (this.chunks) {
            this.#daytime();
        }

        // The world round the player, drawn as they go (a chunk a frame at most)
        // (The Light spell's globes over whoever has one, on the map the player's on)
        this.#lightGlobes(dt);

        // (The world map's pin, the way there, and running there)
        this.#pinned();

        // (Where a treasure the player's hunting is buried, once they're near: it glints)
        this.#glinting();
        // (The trails out of the wild's camps, dens and lairs near them: their prints and signs;
        // and the dens near them)
        this.#trailing();
        this.#denning();
        // (And a shrine come near: whose it is; the rings of standing stones aglow by night; and
        // the wilds director's finds near them)
        this.#nearShrine();
        this.#moonlit();
        this.#findsNear();
        this.#obstaclesNear();

        // (The party's pings, in the world: #pinging)
        this.#pinging();

        if (this.chunks && this.mapId === "town") {
            const { x, z } = this.avatars.get(this.me).object.position;

            // (The undergrowth as thick as the quality asks, grown again if that's changed; the
            // ground as finely drawn; the cliffs, if it draws them; the rocks as it draws them)
            this.chunks.setUndergrowth(this.view.quality.undergrowth);
            this.chunks.setSpacing(this.view.quality.ground);
            this.chunks.setCliffs(this.view.quality.cliffs);
            this.chunks.setRocks(this.view.quality.rocks);

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
                this.motes.update(x, this.avatars.get(this.me).object.position.y, z, dt, MOTES_OF[this.chunks.overworld.biomeAt(Math.floor(x), Math.floor(z))] ?? null, renderer.domElement.height / (2 * Math.tan((camera.fov * Math.PI) / 360)));
            }

            this.#farLand(x, z);
            this.#landLook(x, z, dt);
            this.#torchesCarried();
            this.#restCamps();
            this.#lightNear(x, z);
        }

        telemetry.mark(PHASE.world);
        this.#visit(dt);
        this.#follow(dt);
        this.#inside(dt);
        telemetry.mark(PHASE.inside);

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
        // can't see them (less far in the dark, if not as less far as others see: hud.js
        // PLATE_SIZE, light.js playerSight); the nearer the camera over the farther. A foe within
        // the player's reach they can't act on (too dark to see that far, or something in the way:
        // battle.js whyUnseen) dimmed, so it reads as not yet reachable, not as refused for nothing
        const eye = view.camera.position;
        const own = this.avatars.get(this.me)?.object.position;
        const lit = this.mapId === battle.lightMap ? battle.light : null;
        const reach = mine && !mine.dead ? this.#reachOf(mine) : 0;

        for (const actor of battle.actors) {
            const avatar = this.avatars.get(actor.id);

            if (actor.id !== this.me && avatar && hud.tracked.has(actor.id)) {
                const head = avatar.point(1.08, _head);
                const depth = eye.distanceTo(head);
                const at = avatar.object.position;
                const scale = own ? plateScale(Math.hypot(at.x - own.x, at.z - own.z), playerSight(sightAt(lit, actor.square))) : 1;
                const dim = reach > 0 && !actor.dead && actor.map === mine.map && Math.hypot(actor.x - mine.x, actor.y - mine.y) <= reach && battle.hostile(actor, mine) && !battle.canSee(mine, actor, reach);

                hud.place(actor.id, actor.dead || actor.map !== this.mapId || actor.hidden ? null : view.toScreen(head), { scale, depth, dim });
            }
        }

        this.#wildWays();

        // (What the criers are calling out, over their heads: #cryOut)
        for (const id of hud.said?.keys() ?? []) {
            const avatar = this.avatars.get(id);
            const head = avatar && battle.actor(id)?.map === this.mapId ? avatar.point(1.18, _head) : null;

            hud.placeSaid(id, head ? view.toScreen(head) : null, { depth: head ? eye.distanceTo(head) : 0 });
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
            return this.#posingBeast(avatar, dt, pixels);
        }

        if (actor.id === this.me || !(avatar instanceof Avatar)) {
            return 1;
        }

        const { position } = avatar.object;
        const { height, mesh } = avatar.character;
        // (One of the players' allies not among the nearest: casting no shadow, at the middle
        // level at most: MANY)
        const distant = this.allies.has(actor.id) && !this.alliesNear.has(actor.id);

        if (this.allies.has(actor.id)) {
            this.#shadowing(avatar, !distant);
        }

        const tall = this.view.heightOnScreen(position, height, pixels, { anywhere: mesh.castShadow });

        // (And drawn with fewer triangles if it's small, or one of a crowd but not among the biggest
        // on the screen: Character.fitDetail)
        avatar.character.fitDetail(tall, distant || (this.crowded && !this.crowd.has(actor.id)) ? 1 : 0);

        return posingEvery(tall, (avatar.motion * dt * tall) / height);
    }

    // A creature (BeastAvatar): whether it's in view (what's only for looking at, a cape blown
    // about, moved only then), whether it casts its shadow (not when it's too small on the screen
    // for one to show: MANY), how many of its triangles are drawn (BeastAvatar.fitDetail), and
    // how often it's posed, as a character as big is (posingEvery); out of view, as seldom as can
    // be, unless its shadow may be seen. (Breathing its beam, as if in view, every frame: the beam
    // reaches far beyond its body, into view when it isn't: the Behemoth of the Rift's)
    #posingBeast(avatar, dt, pixels) {
        const { position } = avatar.object;
        const { height } = avatar.character;
        const near = this.view.heightOnScreen(position, height, pixels, { anywhere: true });
        const seen = this.view.heightOnScreen(position, height, pixels);
        const beaming = avatar.beaming;

        avatar.seen = seen > 0 || beaming;
        avatar.castShadows(near >= (avatar.shadowed ? MANY.shadow : MANY.again));
        avatar.fitDetail(seen);

        if (beaming && seen <= 0) {
            return 1;
        }

        const tall = seen || (avatar.shadowed ? near : 0);

        return posingEvery(tall, (avatar.speed * dt * tall) / height);
    }

    // The players' allies about (hired adventurers, creatures called or raised: core/host.js
    // followers, companions), and the MANY.full of them nearest the player, drawn in full
    #allying() {
        const me = this.battle.actor(this.me);
        const ids = [...(this.host?.followers?.keys() ?? []), ...(this.host?.companions?.keys() ?? [])];

        this.allies = new Set(ids);
        this.alliesNear = new Set(
            ids
                .map((id) => this.battle.actor(id))
                .filter((actor) => actor && me && actor.map === me.map)
                .sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))
                .slice(0, MANY.full)
                .map(({ id }) => id),
        );
    }

    // A character's shadow cast or not (`on`): those of its pieces casting one as it was, put
    // back as they were
    #shadowing(avatar, on) {
        if (on === (avatar.shadowed ?? true)) {
            return;
        }

        if (!on) {
            avatar.casters = [];
            avatar.object.traverse((node) => {
                if (node.isMesh && node.castShadow) {
                    avatar.casters.push(node);
                    node.castShadow = false;
                }
            });
        } else {
            for (const node of avatar.casters ?? []) {
                node.castShadow = true;
            }

            avatar.casters = null;
        }

        avatar.shadowed = on;
    }

    // Someone drawn this frame counted (Game.stats.bodies, the debug overlay): posed this frame,
    // casting a shadow
    #counted(avatar, bodies) {
        if (!avatar.object.visible || !(avatar instanceof Avatar || avatar instanceof BeastAvatar)) {
            return;
        }

        bodies.drawn++;
        bodies.posed += avatar.unposed?.frames === 0 ? 1 : 0;
        bodies.shadows += (avatar instanceof BeastAvatar ? avatar.shadowed : avatar.character.mesh?.castShadow) ? 1 : 0;
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

    // How far the player can act on a foe from where they stand (metres): the furthest of their
    // weapon's reaches and of the spells they know to cast at one, and never less than they see
    #reachOf(player) {
        let reach = SIGHT;

        for (const { reach: arm = 0 } of player.arms ?? []) {
            reach = Math.max(reach, arm);
        }

        for (const id of this.progress?.known() ?? []) {
            if (SPELLS[id]?.target === "enemy") {
                reach = Math.max(reach, SPELLS[id].reach ?? 0);
            }
        }

        return reach;
    }

    // Whether someone's drawn as themselves (not one of a crowd, nor waiting to be drawn)
    #drawnInFull(id) {
        const avatar = this.avatars.get(id);

        return Boolean(avatar) && !(avatar instanceof CrowdAvatar);
    }

    // How many bodies are held in full (drawn as themselves, on any map, a building's folk too) or
    // being built so, of those `counted` (by id): what the memory holds most of (QUALITY bodies)
    #heldInFull(counted = () => true) {
        const held = new Set([...this.enlisting, ...this.enlistees.keys()].filter(counted));

        for (const [id, avatar] of this.avatars) {
            if (!(avatar instanceof CrowdAvatar) && counted(id)) {
                held.add(id);
            }
        }

        return held.size;
    }

    // The soldiers about drawn in full or in the crowds (world/crowd.js, MARSHAL): past DETAIL.reach
    // from the camera, in their kind's crowd once its figure's made (but whoever's fighting the
    // player); nearer, with a battle's near the player (more than MARSHAL.from), those nearest the
    // camera (whoever's fighting the player first) in full (QUALITY soldiers), the rest in their
    // crowd; fewer, as many as there's room for in full (QUALITY bodies: a phone's memory holds only
    // so many, each ten megabytes or so, page and graphics card), as many as the quality's budget
    // leaves beside everyone else drawn in full (a capital's guards and townsfolk, and a caravan's
    // escort passing: #heldInFull), never fewer than a battle's. One waiting on its kind's figure
    // not drawn meanwhile, nor built in full (but where it can't be made). A couple of times a second
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

        const soldiers = this.#soldiersAbout(me);
        const ids = new Set(soldiers.map(({ id }) => id));
        // (How many of them can be drawn in full: in a battle the quality's own, else as many as
        // the bodies' budget has room for beside everyone else drawn in full, or to be)
        const room = soldiers.length > MARSHAL.from ? full : Math.max(full, (this.view.quality.bodies ?? Infinity) - this.#heldInFull((id) => !ids.has(id)));
        const fighting = (actor) => actor.target === me.id || actor.attack?.target === me.id || me.target === actor.id || me.attack?.target === actor.id;
        const inFull = (actor) => this.#drawnInFull(actor.id);
        // (Past the reach from the camera: in their crowd, whatever room there is; the rest ranked
        // by how near the camera they are)
        const away = new Map(soldiers.map((actor) => [actor, this.#awayFromCamera(actor)]));
        const far = new Set(soldiers.filter((actor) => !fighting(actor) && away.get(actor) > DETAIL.reach + (inFull(actor) ? DETAIL.slack : 0)));
        const ranked = soldiers
            .filter((actor) => !far.has(actor))
            .map((actor) => [away.get(actor) - (fighting(actor) ? DRAW_REACH : 0), actor])
            .sort((a, b) => a[0] - b[0]);

        this.marshalled = { soldiers: soldiers.length, room, far: far.size };

        // (All of them with room in full, drawn so or to be: nothing to do; but any waiting on their
        // kind's figure, come within the reach since, to be built in full, below)
        if (!far.size && ranked.length <= room && !this.crowdWaiting.size && ![...(this.crowds?.members ?? [])].some(({ standIn }) => !standIn)) {
            return;
        }

        this.crowds ??= new Crowd(this.view.scene, this.kit, { size: this.view.quality.soldiers?.picture ?? 256 });

        // (One put in its crowd: once its kind's figure's made, its body in full let go)
        const crowd = (actor) => {
            const avatar = this.avatars.get(actor.id);
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
        };

        ranked.forEach(([, actor], place) => {
            const avatar = this.avatars.get(actor.id);
            const crowded = avatar instanceof CrowdAvatar;

            if (place < room) {
                // (In full: built, the crowd's in its place till it is; and one not drawn at all
                // yet, its kind's figure made, drawn in its crowd meanwhile, not unseen till it's
                // built: the nearest of a fight joined, still waiting on their kinds' figures as
                // it began, went unseen once they were made)
                const { key } = this.#crowdKind(actor);

                if (!avatar && this.crowds.made(key)) {
                    this.#toCrowd(actor, key);
                }

                if (this.avatars.get(actor.id) instanceof CrowdAvatar && !this.enlisting.includes(actor.id) && !this.enlistees.has(actor.id)) {
                    this.enlisting.push(actor.id);
                }

                return;
            }

            if (!crowded && !(avatar && place < room + MARSHAL.margin)) {
                crowd(actor);
            }
        });

        for (const actor of far) {
            if (!(this.avatars.get(actor.id) instanceof CrowdAvatar)) {
                crowd(actor);
            }
        }

        // (Those waiting on a figure that couldn't be made, built in full after all; those gone, or
        // fallen meanwhile, forgotten, never seen; those out of reach, still waiting; those with
        // room now, come nearer, built in full. Not the fallen and those out of reach built in
        // full, as they were: 38 of an invasion's dead were, far off, waiting their turn)
        const waiting = (actor) => !ids.has(actor.id) || far.has(actor) || ranked.some(([, each], place) => each === actor && place >= room);

        for (const id of this.crowdWaiting) {
            const actor = this.battle.actor(id);

            if (!actor || actor.dead || this.avatars.has(id)) {
                this.crowdWaiting.delete(id);
            } else if (this.crowds.failed(this.#crowdKind(actor).key) || !waiting(actor)) {
                this.crowdWaiting.delete(id);

                if (!this.enlisting.includes(id) && !this.enlistees.has(id)) {
                    this.enlisting.push(id);
                }
            }
        }

        // (The kinds of those still waiting made the nearest the player first, whoever's fighting
        // them before anyone: FIGURES)
        const nearest = new Map();

        for (const id of this.crowdWaiting) {
            const actor = this.battle.actor(id);
            const { key } = this.#crowdKind(actor);
            const away = fighting(actor) ? 0 : actor.map === me.map ? Math.hypot(actor.x - me.x, actor.y - me.y) : Infinity;

            nearest.set(key, Math.min(nearest.get(key) ?? Infinity, away));
        }

        this.crowds.first([...nearest].sort((a, b) => a[1] - b[1]).map(([key]) => key));
    }

    // The soldiers about the player (`me`) the marshal draws, in full or in their crowds: alive, on
    // their map and within DRAW_REACH of them, not a siege engine's (of `among`, if not everyone)
    #soldiersAbout(me, among = this.battle.actors) {
        const near = (actor) => actor.map === me.map && Math.abs(actor.x - me.x) <= DRAW_REACH && Math.abs(actor.y - me.y) <= DRAW_REACH;

        return among.filter((actor) => actor?.kind === "soldier" && !actor.engine && !actor.dead && near(actor) && this.host.soldiers.has(actor.id));
    }

    // How many kinds of soldiers' figures look to be made while the game loads (#figuresFirst): of
    // those within FIGURES.reach of the player, where there's a battle's about them (more than
    // MARSHAL.from, room in full for only a few). For the loading's steps
    #figuresAhead() {
        const me = this.battle.actor(this.me);
        const soldiers = me ? this.#soldiersAbout(me) : [];

        if (soldiers.length <= MARSHAL.from) {
            return 0;
        }

        return new Set(soldiers.filter((actor) => Math.hypot(actor.x - me.x, actor.y - me.y) <= FIGURES.reach).map((actor) => this.#crowdKind(actor).key)).size;
    }

    // A world kept or joined in the thick of a fight, as it loads (#build): the soldiers about put
    // in their crowds as the marshal has it, and the figures of the kinds of those within
    // FIGURES.reach of the player made now, the nearest first, for at most FIGURES.most seconds
    // (`onMade(made)` told how many are as it goes); then everyone about of a kind made drawn in
    // their crowd from the first frame, those nearest built in full in their place as there's
    // room. Not, as it was, each kind's figure a few milliseconds a frame once it's begun, the
    // fight unseen meanwhile
    async #figuresFirst(onMade = () => {}) {
        this.#marshal(MARSHAL.every);

        if (!this.crowdWaiting.size) {
            return;
        }

        const me = this.battle.actor(this.me);
        const away = (actor) => Math.hypot(actor.x - me.x, actor.y - me.y);
        const soldiers = this.#soldiersAbout(me).sort((a, b) => away(a) - away(b));
        const wanted = [];

        for (const actor of soldiers.filter((actor) => away(actor) <= FIGURES.reach)) {
            const { key, spec } = this.#crowdKind(actor);

            // (Asked for, if the marshal hasn't: the kind of one with room in full too, drawn in
            // its crowd till it's built so)
            if (!wanted.includes(key) && !this.crowds.failed(key)) {
                wanted.push(key);
                this.crowds.template(key, spec);
            }
        }

        this.crowds.first(wanted);

        const until = performance.now() + FIGURES.most * 1000;
        const made = () => wanted.filter((key) => this.crowds.made(key) || this.crowds.failed(key)).length;

        while (made() < wanted.length && performance.now() < until) {
            this.crowds.work(Math.min(until, performance.now() + LOAD_BUDGET), { wait: true });
            onMade(made());
            await new Promise((resolve) => setTimeout(resolve, 0));
        }

        for (const actor of soldiers) {
            const { key } = this.#crowdKind(actor);

            if (!this.avatars.has(actor.id) && this.crowds.made(key)) {
                this.#unenlist([actor.id]);
                this.#toCrowd(actor, key);
            }
        }

        this.#marshal(MARSHAL.every);
    }

    // A soldier's kind in the crowds: their people's, their sex's, carrying their weapon (and a
    // standard-bearer their standard), and what its figure's made from (world/crowd.js
    // makingTemplate)
    #crowdKind(actor) {
        const { people = "human", sex = "m", weapon = actor.weapon, banner = false } = this.host.soldiers.get(actor.id) ?? {};
        const key = `${people}:${sex}:${weapon}${banner ? ":standard" : ""}`;

        return {
            key,
            spec: { look: soldierLook({ people, weapon, sex, seed: 1, banner }), guard: guardOf(weapon), attack: weaponOf(weapon)?.attacks[0] ?? { animation: "sword", hitAt: 380, duration: 760 }, cast: CROWD_CASTS[weapon] ?? null },
        };
    }

    // A soldier (or one of the wild's people-shaped creatures past the bodies' budget, as big as
    // it is: `size`, #rationing; or one of the townsfolk, in their own colours and build: `own`,
    // #folkRoom) drawn in its kind's crowd from now on: where it's drawn in full now, or where it
    // is (its character drawn in full let go)
    #toCrowd(actor, key, size = 1, own = {}) {
        const old = this.avatars.get(actor.id);
        const avatar = new CrowdAvatar(this.crowds, key, { height: old ? old.character.height / size : undefined, size, ...own });

        this.ailments?.clear(actor.id);

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

        // (Its weapon in hand or put away as it is, on guard or not, and as far through a stride as
        // it was in full: none of it changed as it goes to its crowd)
        avatar.character.sheathe(!actor.armed);
        avatar.guarding = !actor.dead && actor.armed && this.#fighting(actor);
        avatar.stride = old?.walker?.phase ?? avatar.stride;
    }

    // One of a crowd (`crowd`) drawn in full in its place (`avatar`, of `id`): its weapon in hand or
    // put away as it was, on guard or not, as far through a stride; and its crowd's figure kept
    // where it is, as it's going, till the one in full is shown, then faded from sight over
    // CROWD.fade (#fading), so the two are never both gone, nor one swapped for the other at once
    #handOver(id, crowd, avatar) {
        avatar.character.sheathe?.(!crowd.armed);

        if (crowd.guarding && avatar.actions?.guardName) {
            avatar.actions.guard = avatar.actions.guardTarget = 1;
        }

        if (avatar.walker && "phase" in avatar.walker) {
            avatar.walker.phase = crowd.stride;
        }

        this.#unfade(id);
        this.fadingOut.push({ id, crowd, avatar, left: CROWD.fade, visible: crowd.object.visible });
    }

    // (Any crowd figure of `id` still fading from sight gone at once: another's taken its place)
    #unfade(id) {
        this.fadingOut = this.fadingOut.filter((fading) => {
            if (fading.id !== id) {
                return true;
            }

            fading.crowd.character.dispose();

            return false;
        });
    }

    // Those fading from sight (#handOver), each frame `dt` seconds on: kept where the one in full
    // is, as it's going, and seen as it was till it's shown (its shaders ready, its pictures sent:
    // #register), then less of it each frame, then gone; at once if the one in full is gone
    #fading(dt) {
        this.fadingOut = this.fadingOut.filter((fading) => {
            const { id, crowd, avatar } = fading;
            const ready = !avatar.compiling && avatar.sent !== false;

            if (this.avatars.get(id) === avatar && fading.left > 0) {
                crowd.track(avatar, dt);

                if (ready) {
                    fading.left -= dt;
                } else {
                    crowd.object.visible = fading.visible;
                }

                crowd.shown = Math.max(0, fading.left / CROWD.fade);

                if (fading.left > 0) {
                    return true;
                }
            }

            crowd.character.dispose();

            return false;
        });
    }

    // Is someone one of the wild's people-shaped creatures (a goblin, a troll, a bandit), each a
    // body in full as a person's is, drawn in its kind's crowd past the bodies' budget
    // (#rationing)? Not a dungeon's boss or mini-boss, nor an elite: always drawn in full
    #rationed(actor) {
        return actor.kind === "beast" && !actor.wild?.champion && !actor.wild?.elite && CREATURE_LOOKS[actor.wild?.creature]?.body === "humanoid";
    }

    // The wild's people-shaped creatures held in full no more than the bodies' budget has room for
    // (QUALITY bodies, as the soldiers are: #marshal), beside everyone else held in full: those
    // fighting the player first, then the nearest the camera (those on another map last); the rest
    // drawn in their kind's crowd, their body in full let go (or not built at all), and built in
    // full again once there's room for them. A dungeon's level, put out at once, had seventy-two
    // bodies held on an iPhone, which let the game's tab go (the crash report of 2026-10-14). A
    // couple of times a second (MARSHAL.every)
    #rationing(dt) {
        if ((this.rationClock = (this.rationClock ?? 0) - dt) > 0) {
            return;
        }

        this.rationClock = MARSHAL.every;

        const me = this.battle.actor(this.me);
        const budget = this.view.quality.bodies ?? Infinity;

        if (!me || budget === Infinity) {
            return;
        }

        const rationed = this.battle.actors.filter((actor) => !actor.dead && this.#rationed(actor));
        const ids = new Set(rationed.map(({ id }) => id));
        // (Room beside everyone else held in full, but the wild's beasts built in code: their
        // bodies shared, each one small)
        const room = Math.max(this.view.quality.soldiers?.full ?? 0, budget - this.#heldInFull((id) => !ids.has(id) && !(this.avatars.get(id) instanceof BeastAvatar)));
        const crowded = (id) => this.avatars.get(id) instanceof CrowdAvatar;

        if (rationed.length <= room && !rationed.some(({ id }) => crowded(id)) && !this.rationWaiting.size) {
            return;
        }

        const fighting = (actor) => actor.target === me.id || actor.attack?.target === me.id || me.target === actor.id || me.attack?.target === actor.id;
        const ranked = rationed
            .map((actor) => [actor.map === me.map ? this.#awayFromCamera(actor) - (fighting(actor) ? DRAW_REACH : 0) : Infinity, actor])
            .sort((a, b) => a[0] - b[0]);

        this.rationed = { rationed: rationed.length, room };
        this.crowds ??= new Crowd(this.view.scene, this.kit, { size: this.view.quality.soldiers?.picture ?? 256 });

        ranked.forEach(([, actor], place) => {
            const avatar = this.avatars.get(actor.id);

            // (With room: in full, built so if it's in its crowd, the crowd in its place till it is)
            if (place < room) {
                if (crowded(actor.id) && !this.enlisting.includes(actor.id) && !this.enlistees.has(actor.id)) {
                    this.enlisting.push(actor.id);
                }

                return;
            }

            // (In its crowd already; or in full, only just past the room: left as it is)
            if (crowded(actor.id) || (avatar && place < room + MARSHAL.margin)) {
                return;
            }

            const { key, spec, size } = this.#throngKind(actor);

            if (this.crowds.failed(key)) {
                return;
            }

            // (Its kind's figure not made yet: not built in full meanwhile, unless it's begun)
            if (!this.crowds.template(key, spec)) {
                if (!avatar && !this.enlistees.has(actor.id)) {
                    this.#unenlist([actor.id]);
                    this.rationWaiting.add(actor.id);
                }

                return;
            }

            this.#unthrong(actor.id);
            this.#unenlist([actor.id]);
            this.rationWaiting.delete(actor.id);
            this.#toCrowd(actor, key, size);
        });

        // (Those waiting on a figure that couldn't be made, built in full after all; those gone,
        // dead (never drawn) or drawn, forgotten; those with room now, built in full)
        const places = new Map(ranked.map(([, actor], place) => [actor.id, place]));

        for (const id of this.rationWaiting) {
            const actor = this.battle.actor(id);

            if (!actor || actor.dead || this.avatars.has(id)) {
                this.rationWaiting.delete(id);
            } else if (this.crowds.failed(this.#throngKind(actor).key) || (places.get(id) ?? 0) < room) {
                this.rationWaiting.delete(id);

                if (!this.enlisting.includes(id) && !this.enlistees.has(id)) {
                    this.enlisting.push(id);
                }
            }
        }
    }

    // Those out in the world the player can't see while they're inside (#walledOff: in a building,
    // or down in a dungeon) let go of once they've been in SHUT_IN.after seconds (a step in and out
    // again letting go of no one), SHUT_IN.each at a look: the soldiers to their crowds (where
    // their kind's figure's made; else undressed), the folk and the wild's people-shaped creatures
    // undressed; each put aside (#nextEnlistee) to be dressed again as the player comes out, the
    // nearest first, the soldiers and creatures as there's room (#marshal, #rationing). Not the
    // wild's beasts built in code (their bodies shared, each one small), nor anyone's own
    // (#onlySeenAbout). A couple of times a second
    #shutIn(dt) {
        if ((this.shutClock = (this.shutClock ?? 0) - dt) > 0) {
            return;
        }

        this.shutClock = MARSHAL.every;

        const me = this.battle.actor(this.me);

        if (!me) {
            return;
        }

        if (this.shut?.map !== me.map) {
            this.shut = { map: me.map, since: this.clock };
        }

        if (this.clock - this.shut.since < SHUT_IN.after) {
            return;
        }

        let left = SHUT_IN.each;

        for (const [id, avatar] of [...this.avatars]) {
            const actor = this.battle.actor(id);

            if (!actor || avatar instanceof CrowdAvatar || avatar instanceof BeastAvatar || !this.#onlySeenAbout(actor) || !this.#walledOff(actor, me)) {
                continue;
            }

            if (left-- <= 0) {
                break;
            }

            this.#unenlist([id]);

            const kind = actor.kind === "soldier" ? this.#crowdKind(actor).key : null;

            if (kind && this.crowds?.made(kind)) {
                this.#toCrowd(actor, kind);
            } else {
                this.#undress(id);
                this.aside.add(id);
            }
        }
    }

    // Is someone only there to be seen about out in the world, let go of while the player's
    // inside (#walledOff, #shutIn): the folk (the townsfolk in the streets, a stranger by the
    // road), the soldiers and the wild's creatures, but anyone's own (a follower, a tamed or
    // called beast) and the colossal and a town's engines (seen from far off, slow to make again)
    #onlySeenAbout(actor) {
        return (actor.kind === "folk" || actor.kind === "soldier" || actor.kind === "beast") && !actor.leader && !actor.wild?.colossus && !actor.engine;
    }

    // Is someone one of the folk out in the world (the townsfolk in the streets, a crier in his
    // square, a stranger by the road), drawn in full only as the bodies' budget has room
    // (#folkRoom)
    #streetFolk(actor) {
        return actor.kind === "folk" && !actor.leader && !this.world.interiors?.of(actor.map);
    }

    // The folk out in the world held in full no more than the bodies' budget has room for beside
    // everyone else held in full (QUALITY bodies, as the soldiers and the wild's people-shaped
    // creatures are: #marshal, #rationing): whoever the player's talking or trading with first,
    // then the nearest the camera (those on another map last). The townsfolk past it, or past
    // DETAIL.reach from the camera (DETAIL.slack further, drawn in full), drawn in their people's
    // and sex's crowd once its figure's made (characters/folkcrowd.js: asked for as they're
    // about), each in their own colours and build, their body in full let go or never built; and
    // dressed in full again once they're near with room, their crowd's figure fading as they're
    // shown (#handOver). Whoever's kept in full (the player talking or trading with them) never
    // in a crowd. The rest past the room (a crier, a stranger by the road, one the player can't
    // see from inside, or a townsfolk while their crowd's figure's made) undressed (one only just
    // past it, MARSHAL.margin, left as it is) or not dressed at all, the furthest first, and
    // dressed once there's room for them again. A couple of times a second
    #folkRoom(dt) {
        if ((this.folkClock = (this.folkClock ?? 0) - dt) > 0) {
            return;
        }

        this.folkClock = MARSHAL.every;

        const me = this.battle.actor(this.me);
        const budget = this.view.quality.bodies ?? Infinity;

        if (!me || budget === Infinity) {
            return;
        }

        const folk = this.battle.actors.filter((actor) => this.#streetFolk(actor));
        const ids = new Set(folk.map(({ id }) => id));
        // (Room beside everyone else held in full, but the wild's beasts built in code: their
        // bodies shared, each one small)
        const room = Math.max(0, budget - this.#heldInFull((id) => !ids.has(id) && !(this.avatars.get(id) instanceof BeastAvatar)));
        const crowded = (id) => this.avatars.get(id) instanceof CrowdAvatar;

        for (const id of this.folkWaiting) {
            if (!ids.has(id)) {
                this.folkWaiting.delete(id);
            }
        }

        const kept = (actor) => actor.id === this.talking?.id || actor.id === this.shopping?.keeper;
        // (Far from the camera, one the player can see: the townsfolk drawn in their crowd there)
        const far = (actor) => !kept(actor) && actor.map === me.map && !this.#walledOff(actor, me) && this.#awayFromCamera(actor) > DETAIL.reach + (this.#drawnInFull(actor.id) ? DETAIL.slack : 0);

        this.folkRationed = { folk: folk.length, room, crowd: folk.filter(({ id }) => crowded(id)).length };

        if (folk.length <= room && !this.folkWaiting.size && !folk.some((actor) => crowded(actor.id) || (this.#folkKind(actor) && far(actor)))) {
            return;
        }

        const ranked = folk.map((actor) => [kept(actor) ? -Infinity : actor.map === me.map ? this.#awayFromCamera(actor) : Infinity, actor]).sort((a, b) => a[0] - b[0]);
        const queued = (id) => this.enlisting.includes(id) || this.enlistees.has(id) || this.aside.has(id);

        ranked.forEach(([, actor], place) => {
            const { id } = actor;
            const kind = this.#folkKind(actor);

            // (One of the townsfolk past the room, or far off, that the player can see: in their
            // crowd, once its figure's made; one in full only just past the room, left as it is.
            // Till it's made, as anyone else of the folk)
            if (kind && !kept(actor) && (place >= room || far(actor)) && !this.#walledOff(actor, me)) {
                if (crowded(id) || (this.#drawnInFull(id) && place < room + MARSHAL.margin && !far(actor))) {
                    return;
                }

                this.crowds ??= new Crowd(this.view.scene, this.kit, { size: this.view.quality.soldiers?.picture ?? 256 });

                if (!this.crowds.failed(kind.key) && this.crowds.template(kind.key, kind.spec)) {
                    const look = folkLook(kind.one);

                    this.#unenlist([id]);
                    this.folkWaiting.delete(id);
                    this.#toCrowd(actor, kind.key, 1, { tint: folkTint(look, kind.figure), build: folkBuild(look, kind.figure) });

                    return;
                }
            }

            // (With room: dressed again if it was waiting, unless it's out of the player's sight;
            // or in its crowd, once the player can see it, its crowd's figure fading as it's
            // shown, #handOver)
            if (place < room) {
                if (this.folkWaiting.delete(id) && !this.avatars.has(id) && !queued(id)) {
                    (this.#walledOff(actor, me) ? this.aside.add(id) : this.enlisting.push(id));
                } else if (crowded(id) && !queued(id) && !this.#walledOff(actor, me)) {
                    this.enlisting.push(id);
                }

                return;
            }

            if (crowded(id) || this.folkWaiting.has(id) || (this.avatars.has(id) && place < room + MARSHAL.margin) || (!this.avatars.has(id) && !queued(id))) {
                return;
            }

            if (this.avatars.has(id)) {
                this.#undress(id);
            }

            this.#unenlist([id]);
            this.folkWaiting.add(id);
        });
    }

    // The crowd one of the townsfolk out in the world is drawn in past the room or far off
    // (#folkRoom), and what its figure's made from (characters/folkcrowd.js): their people's and
    // their sex's, calm (world/crowd.js recordingMoves); with who they are (`one`: the host's) and
    // the figure's look, for their own colours and build. Null for the rest of the folk (a crier in
    // his livery, a stranger by the road, one of a look of their own: presets.js FOLK)
    #folkKind(actor) {
        const one = this.host.folk.get(actor.id);

        if (one?.role !== "townsfolk" || one.preset) {
            return null;
        }

        const figure = folkFigureLook(one);

        return { key: folkKind(one), spec: { look: figure, calm: true }, figure, one };
    }

    // The great lairs, and the kind each one's master is (a drake, a Dreadthorn), slain or not
    #greatLairs() {
        this.greatLairs ??= this.world.plan.sites.filter((site) => LAIR_KINDS.includes(site.kind)).map((site) => ({ id: site.id, at: site.at, beast: LAIRS[site.kind].master[0] }));

        return this.greatLairs;
    }

    // Every lair and den kept by a kind drawn from a model (a Dreadthorn's lair; a werewolves' den,
    // its Moonfang and its werewolves), once for each such kind, its master or one of its guards:
    // their models asked for near it (#modelling), so none's met as its stand-in
    #modelLairs() {
        this.modelLairs ??= this.world.plan.sites.flatMap((site) => {
            const lair = LAIRS[site.kind];
            const kinds = lair ? [lair.master[0], ...lair.guards.map(([kind]) => kind)] : [];

            return [...new Set(kinds)].filter((kind) => MODELS[kind]).map((beast) => ({ id: site.id, at: site.at, beast }));
        });

        return this.modelLairs;
    }

    // The creatures drawn from a model (beasts/model.js): each kind's asked for once the player's
    // near one of its lairs, or where one may be met at that hour (a werewolf: #modelsHere), before
    // it's met (looked at every MODELLING seconds); and one drawn with its stand-in, its model read
    // since, drawn again from the model once it's out of view (the colossal, at once) and not
    // attacking, falling or coming down out of the sky (let go of, and put back on the list to be
    // drawn)
    #modelling(dt) {
        const me = this.avatars.get(this.me)?.object.position;

        if ((this.modelClock = (this.modelClock ?? 0) - dt) <= 0 && me) {
            this.modelClock = MODELLING;

            for (const kind of new Set([...modelsNear([me.x, me.z], this.#modelLairs()), ...this.#modelsHere()])) {
                wantModel(kind);
            }

            // (The colossal about, wherever it is: read now, it's met at once)
            for (const kind of this.#modelsAbout()) {
                wantModel(kind, "now");
            }

            // (The places near: their creatures' models fetched, not read; and those of the place
            // the player's in read, if they went in without waiting for them)
            this.approached ??= new Set();

            for (const kind of this.#modelsApproached()) {
                if (!this.approached.has(kind)) {
                    this.approached.add(kind);
                    fetchModel(kind, "soon").then((kept) => kept || setTimeout(() => this.approached.delete(kind), APPROACH_RETRY));
                }
            }

            for (const kind of this.#modelsInside()) {
                wantModel(kind, "now");
            }
        }

        for (const [id, avatar] of this.avatars) {
            // (The colossal, too big to be out of view for long: drawn again from its model as
            // soon as it's read, seen or not)
            const colossal = Boolean(this.battle.actor(id)?.wild?.colossus);

            if (avatar instanceof BeastAvatar && !avatar.model && MODELS[avatar.id] && modelOf(avatar.id) && (!avatar.seen || colossal) && !avatar.doing.attack && !avatar.doing.dead && !avatar.arriving && !this.battle.actor(id)?.aloft) {
                this.#undress(id);
                this.enlisting.push(id);
            } else if (!(avatar instanceof BeastAvatar) && this.#modelSince(id, avatar)) {
                this.#undress(id);
                this.enlisting.push(id);
            }
        }
    }

    // Whether one of the wild's people-shaped creatures drawn as its stand-in (a character: a
    // hell's lord) has had its model read since, and may be drawn again from it: out of view (a
    // world's boss, the Stone Golem, seen or not), not attacking or fallen
    #modelSince(id, avatar) {
        const actor = this.battle.actor(id);
        const kind = actor?.kind === "beast" ? actor.wild?.creature : null;

        if (!kind || !MODELS[kind] || !modelOf(kind) || actor.attack || actor.dead) {
            return false;
        }

        return Boolean(actor.wild?.worldBoss) || this.view.heightOnScreen(avatar.object.position, avatar.character.height, this.view.pixelsPerMetre()) <= 0;
    }

    // The kinds drawn from a model in the places with a way in near the player, out in the world
    // (APPROACH): a dungeon's foes, or all its theme may hold till it's made (beasts/model.js
    // modelsInside)
    #modelsApproached() {
        const actor = this.battle.actor(this.me);

        if (actor?.map !== "town" || !this.world.plan) {
            return [];
        }

        return this.world.plan.sites
            .filter((site) => site.kind === "dungeon" && Math.hypot(site.at[0] - actor.x, site.at[1] - actor.y) < APPROACH)
            .flatMap((site) => modelsInside(this.world.interiors?.buildings.get(`site:${site.id}`) ?? { kind: "dungeon", theme: site.theme }));
    }

    // The kinds drawn from a model in the place the player's in (beasts/model.js modelsInside), and
    // in the one whose door they're waiting at (#readyAtDoor): kept while they are, let go of a
    // little after they've left (forgetModels' `area`)
    #modelsInside() {
        const actor = this.battle.actor(this.me);
        const here = actor ? modelsInside(this.world.interiors?.of(actor.map)) : [];

        return [...new Set([...here, ...(this.readyingAt?.kinds ?? [])])];
    }

    // The kinds drawn from a model that may be met where the player is, out in the world, at this
    // hour (beasts/model.js modelsMet: its land, how far it is from their home, by night or day)
    // The kinds drawn from a model of the colossal (the Behemoth of the Rift: battle.js #colossus)
    // and of a world's boss (the Stone Golem) alive anywhere in the battle: each's model wanted as
    // soon as it's come, as big as it is; and those a world's boss calls to it as it's worn down
    // (creatures.js `rally`: the Orc King's champions), ready for when they come
    #modelsAbout() {
        const bosses = this.battle.actors.filter((actor) => (actor.wild?.colossus || actor.wild?.worldBoss) && !actor.dead);

        return [...new Set(bosses.flatMap((actor) => [actor.wild.creature, ...(actor.wild.rally ?? []).map(({ call }) => call.kind)]).filter((kind) => MODELS[kind]))];
    }

    #modelsHere() {
        const actor = this.battle.actor(this.me);

        return actor?.map === "town" && this.world.plan ? modelsMet(this.world.plan, [actor.x, actor.y], this.world.start?.at ?? [0, 0], torchesLit(elapsedOf(this.host.war))) : [];
    }

    // The beasts' bodies none of their look has been drawn on for a while let go of, every so often
    // (FORGET_EVERY); and the models none has been drawn from for a while, but those whose lairs
    // the player's near enough to want them for (KEEP_MODELS: a little further than they're asked
    // for from, so one isn't let go and read again going to and fro at the edge), those that may be
    // met where they are (#modelsHere), and those of the place they're in or at the door of
    // (#modelsInside: once they've left it, let go of soon after, beasts/model.js AREA_LINGER)
    #forgetting(dt) {
        if ((this.forgetClock = (this.forgetClock ?? FORGET_EVERY) - dt) > 0) {
            return;
        }

        this.forgetClock = FORGET_EVERY;
        forgetBodies();

        const me = this.avatars.get(this.me)?.object.position;

        forgetModels(performance.now(), MODEL_LINGER, me ? [...modelsNear([me.x, me.z], this.#modelLairs(), KEEP_MODELS), ...this.#modelsHere(), ...this.#modelsAbout()] : [], this.#modelsInside());
    }

    // Those about drawn in full or in their kind's crowd for now (THRONGING, app/throng.js): past
    // DETAIL.reach from the camera, in their crowd (but whoever's fighting the player, or the player's
    // fighting); nearer, as many as the throng has drawn in full (all, but with Adaptive in a crowded
    // fight that comes too slowly), the first of them first (#crowdable). One in full put in its crowd
    // only once it's DETAIL.slack metres past the reach, or MARSHAL.margin places past the last drawn
    // in full, and once its kind's figure's made (a step at a time meanwhile, as the soldiers' are). A
    // couple of times a second, and as soon as the throng changes how many
    #thronging(dt) {
        if ((this.throngClock = (this.throngClock ?? 0) - dt) > 0) {
            return;
        }

        this.throngClock = MARSHAL.every;

        const me = this.battle.actor(this.me);
        const ranked = me ? this.#crowdable(me) : [];
        const full = this.view.adaptive ? this.throng.full : Infinity;
        const kept = new Set();
        const far = new Set(ranked.filter(({ actor, first }) => !first && this.#awayFromCamera(actor) > DETAIL.reach + (this.thronged.has(actor.id) ? 0 : DETAIL.slack)));
        const near = ranked.filter((each) => !far.has(each));

        if (full !== Infinity || far.size) {
            this.crowds ??= new Crowd(this.view.scene, this.kit, { size: this.view.quality.soldiers?.picture ?? 256 });
        }

        // (One put in its crowd, or kept in it: once its kind's figure's made)
        const stand = ({ actor, avatar }) => {
            const thronged = this.thronged.get(actor.id);

            // (Still in its crowd: what's been put on it since, a torch taken up, not seen either)
            if (thronged?.avatar === avatar) {
                offstage(avatar.object, thronged.hidden);
                kept.add(actor.id);

                return;
            }

            const { key, spec, size } = this.#throngKind(actor);

            if (this.crowds.failed(key) || !this.crowds.template(key, spec)) {
                return;
            }

            this.#unthrong(actor.id);
            this.#throng(actor, avatar, key, size);
            kept.add(actor.id);
        };

        near.forEach((each, place) => {
            if (each.first || place < full || (!this.thronged.has(each.actor.id) && place < full + MARSHAL.margin)) {
                return;
            }

            stand(each);
        });
        far.forEach(stand);

        // (Those drawn in full again: among the first, come near, gone, out of reach)
        for (const id of [...this.thronged.keys()]) {
            if (!kept.has(id)) {
                this.#unthrong(id);
            }
        }

        // (What the throng judges by: those within the reach, of whom it says how many in full)
        this.throngCount = { crowdable: near.length, inFull: near.filter(({ actor }) => !this.thronged.has(actor.id)).length };
    }

    // How far someone is from the camera (metres): where they're drawn, or (not drawn yet) where
    // they are on the ground
    #awayFromCamera(actor) {
        const camera = this.view.camera.position;
        const avatar = this.avatars.get(actor.id);

        if (avatar) {
            return camera.distanceTo(avatar.object.position);
        }

        const [ox, oz] = this.originOf(actor.map);

        return Math.hypot(ox + actor.x - camera.x, oz + actor.y - camera.z);
    }

    // Those within THRONGING.near of the player who can be drawn in their kind's crowd: the players'
    // hired adventurers, the wild's creatures (not a boss, a mini-boss nor an elite): the
    // people-shaped, and the beasts that move by their bones alone (beasts/herd.js herds); the first
    // to be drawn in full first (`first`: whoever's fighting the player or the player's fighting,
    // the players' allies nearest (#allying), one thrown by a blast), then the biggest on the screen
    // (those out of view last)
    #crowdable(me) {
        const pixels = this.view.pixelsPerMetre();
        const fighting = (actor) => actor.target === me.id || actor.attack?.target === me.id || me.target === actor.id || me.attack?.target === actor.id;
        const list = [];

        for (const actor of this.battle.actors) {
            const avatar = this.avatars.get(actor.id);
            const creature = actor.kind === "beast" && !actor.wild?.champion && !actor.wild?.elite ? actor.wild?.creature : null;
            const people = CREATURE_LOOKS[creature]?.body === "humanoid";
            const crowdable = actor.kind === "follower" || people ? avatar instanceof Avatar : herds(creature) && avatar instanceof BeastAvatar;

            if (!crowdable || actor.map !== me.map || Math.hypot(actor.x - me.x, actor.y - me.y) > THRONGING.near) {
                continue;
            }

            const tall = avatar.object.visible ? this.view.heightOnScreen(avatar.object.position, avatar.character.height, pixels) : 0;

            list.push({ actor, avatar, tall, first: fighting(actor) || this.alliesNear.has(actor.id) || avatar.thrown });
        }

        return list.sort((a, b) => Number(b.first) - Number(a.first) || b.tall - a.tall);
    }

    // The crowd one's drawn in for now (#thronging), and what its kind's figure's made from
    // (world/crowd.js makingTemplate): a hired adventurer as they look, carrying their weapon; one of the wild's people-shaped creatures as one of its kind looks (beasts/looks.js
    // humanoidLook: a bandit's or a cultist's sex), holding its weapon, drawn as big as it is (`size`);
    // a beast as the one of three it's built as is (beasts/herd.js makingHerdTemplate), as big as it is
    #throngKind(actor) {
        if (actor.kind === "beast" && CREATURE_LOOKS[actor.wild.creature]?.body !== "humanoid") {
            const { creature } = actor.wild;
            const seed = this.#seedOf(actor);

            return { key: `herd:${creature}:${seed % 3}`, size: sizeOf(creature, seed), spec: { make: makingHerdTemplate, id: creature, seed: seed % 3 } };
        }

        const weapon = actor.weapon;
        const fights = { guard: guardOf(weapon), attack: weaponOf(weapon)?.attacks[0] ?? { animation: "sword", hitAt: 380, duration: 760 }, cast: CROWD_CASTS[weapon] ?? null };

        // (One of the players' own, named and on the party's icons: drawn as they look, a figure of their own)
        if (actor.kind === "follower") {
            const { calling = "warrior", sex = "m", seed = 1, people = "human", gear } = this.host.followers.get(actor.id) ?? {};
            const body = gear?.body ? `${gear.body.id}.${gear.body.people ?? ""}` : "";

            return { key: `follower:${people}:${sex}:${calling}:${seed}:${weapon}:${body}`, size: 1, spec: { ...fights, look: this.#followerLook(actor.id) } };
        }

        const creature = actor.wild.creature;
        const seed = this.#seedOf(actor);
        // (A bandit's, a chief's or a cultist's sex as its seed has it: humanoidLook)
        const kind = ["bandit", "banditChief", "cultist", "cultLeader"].includes(creature) && seed % 4 === 0 ? 4 : 1;
        const look = humanoidLook(creature, kind);

        return {
            key: `wild:${creature}:${kind}:${weapon}`,
            size: sizeOf(creature, seed),
            spec: { ...fights, look: { ...look, equipment: [...look.equipment, ...(WEAPONS[weapon]?.equipment ?? [])] } },
        };
    }

    // One of the wild's creatures' seed: which one of its kind it is (from its id), as it's drawn
    #seedOf(actor) {
        return [...actor.id].reduce((hash, letter) => (Math.imul(hash, 31) + letter.charCodeAt(0)) | 0, 7) >>> 0;
    }

    // Someone drawn in their kind's crowd for now: their body kept, not drawn nor posed; a stand-in
    // drawn where they are, told what they're told to do
    #throng(actor, avatar, key, size) {
        const standIn = new CrowdAvatar(this.crowds, key, { height: avatar.character.height / size, size, standIn: true });

        // (Its last stand-in, still fading as its body's not been shown, gone: this one's here)
        this.#unfade(actor.id);
        standIn.object.position.copy(avatar.object.position);
        standIn.facing = avatar.facing;

        // (Its weapon in hand or put away as it has it, on guard or not, as far through a stride)
        standIn.armed = !avatar.character.sheathed;
        standIn.guarding = (avatar.actions?.guardTarget ?? 0) > 0;
        standIn.stride = avatar.walker?.phase ?? standIn.stride;
        this.thronged.set(actor.id, { avatar, standIn, hidden: offstage(avatar.object), unecho: standIn.echo(avatar, { deadFor: actor.dead ? (avatar.deadFor ?? 0) : null }) });
    }

    // Someone drawn in full again: their body seen and posed again (all the time since at once, but
    // no more than a moment of it), their stand-in gone
    #unthrong(id) {
        const thronged = this.thronged.get(id);

        if (!thronged) {
            return;
        }

        const { avatar, standIn, hidden, unecho } = thronged;

        unecho();
        onstage(hidden);

        // (As far through a stride as its stand-in, which fades from sight: #handOver)
        if (avatar.walker && "phase" in avatar.walker) {
            avatar.walker.phase = standIn.stride;
        }

        this.#unfade(id);
        this.fadingOut.push({ id, crowd: standIn, avatar, left: CROWD.fade, visible: true });
        avatar.unposed.dt = Math.min(avatar.unposed.dt, 0.25);
        avatar.unposed.frames = Infinity;
        this.thronged.delete(id);
    }

    // The crowd drawn in full: only so many of those in view can be (QUALITY crowd), the biggest on
    // the screen as the world was last drawn; the rest at most at the middle level (lod.js)
    #crowding() {
        const cap = this.view.quality.crowd ?? Infinity;
        const pixels = this.view.pixelsPerMetre();
        const seen = [];

        for (const [id, avatar] of this.avatars) {
            if (id !== this.me && avatar instanceof Avatar && avatar.object.visible && avatar.character && !this.thronged.has(id)) {
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

    // One of the wild's creatures taking to the air, badly hurt (battle.js #hover): calling as it
    // goes, if it's drawn; whoever's fighting it, or it them, told no blow up close reaches it
    #takesOff(event) {
        const actor = this.battle.actor(event.id);
        const avatar = this.avatars.get(event.id);
        const me = this.battle.actor(this.me);
        const creature = avatar && this.#voiced(actor, avatar);

        if (creature) {
            this.sound?.voice(creature, "call", avatar.object.position);
        }

        if (actor && me && !me.dead && (me.target === event.id || me.order?.target === event.id || actor.target === this.me)) {
            this.hud.message(`The ${actor.name} takes to the air, out of reach of blows!`, 2.5);
        }
    }

    // One of the wild's creatures up in the air over a fight (battle.js #hover): its wings heard
    // beating as they beat (CALLS.wings apart)
    #hovering(actor, avatar) {
        const wings = CREATURE_VOICES[actor.wild?.creature]?.wings;

        if (wings && this.clock >= (avatar.beatHeard ?? 0)) {
            this.sound?.play(wings, { at: avatar.object.position, rate: CREATURE_VOICES[actor.wild.creature].rate ?? 1, far: CALLS.aloft });
            avatar.beatHeard = this.clock + CALLS.wings / (CREATURE_VOICES[actor.wild.creature].rate ?? 1);
        }
    }

    // A bomb lobbed (battle.js BOMBS): drawn flying from the hand of whoever threw it (or where
    // they stood) to where it lands, as its people make it (spellfx.js BOMB_LOOKS), fizzing there,
    // a ring warning how far it'll reach; its wick heard sputtering till it bursts (#blast), or
    // what has none, heard as it does (BURSTS). What a creature leaves where it falls (BOMBS
    // `look`: a cinder husk's embers, a bloat gorger's bile): swelling there, heard gathering
    #bomb(event) {
        if (event.map !== this.mapId) {
            return;
        }

        const [ox, oz] = this.originOf(event.map);
        const look = BOMBS[event.kind]?.look ?? null;
        const thrower = look ? null : this.avatars.get(event.id);
        // (From its hand; or, what it carries let go of, where that is: the Stone Golem's boulder)
        const from = () => (thrower ? (thrower.carried?.() ?? thrower.hand("Right")) : this.spellFx.onGround(ox + event.from[0], oz + event.from[1], look ? 0.2 : 1.2));
        const to = new THREE.Vector3(ox + event.x, 0, oz + event.y);
        const travel = Math.max(0.1, (event.lands - this.battle.time) / 1000);
        const fuse = (event.bursts - event.lands) / 1000;

        const heard = BURSTS[look ?? event.kind] ?? {};
        const gathering = "gathering" in heard ? heard.gathering : "fuse";

        this.spellFx.lob(event.bomb, from, to, { travel, fuse, radius: event.radius, big: event.kind === "bigBomb", kind: event.kind, look });
        this.fuses.set(event.bomb, gathering ? (this.sound?.play(gathering, { at: to, delay: travel, far: 20 }) ?? null) : null);

        if (heard.flying) {
            this.sound?.play(heard.flying, { at: from() });
        }
    }

    // A blast (battle.js #blast: a bomb bursting, the Explosion spell): the bomb gone and its wick
    // quiet; drawn and heard where it is (the nearer the player, the harder the camera's shaken;
    // heard further than a blow, and duller and later the further off: the air takes the highs
    // out of it, and sound's slower than light); whoever's caught thrown (Actions.toss, a
    // creature's body tumbling), each hitting the ground as it comes down
    #blast(event) {
        const { battle, hud } = this;

        if (event.bomb !== null) {
            this.spellFx.burst(event.bomb);
            this.sound?.cut(this.fuses.get(event.bomb));
            this.fuses.delete(event.bomb);
        }

        if (event.map !== this.mapId) {
            return;
        }

        const [ox, oz] = this.originOf(event.map);
        const at = new THREE.Vector3(ox + event.x, 0, oz + event.y);
        const me = this.avatars.get(this.me)?.object.position;
        const off = me ? Math.hypot(me.x - at.x, me.z - at.z) : Infinity;
        const look = BOMBS[event.kind]?.look ?? null;
        const grand = !SMALL_BOMBS.has(event.kind) && !look;
        const colossal = COLOSSAL_BLASTS[event.kind];
        const shaken = Math.max(0, 1 - off / (colossal ? BLAST_HEARD.quaked : BLAST_HEARD.shaken)) ** 2;

        if (colossal) {
            if (colossal.quake) {
                this.spellFx.quake(at, { radius: event.radius, kind: colossal.quake, shake: colossal.shake * shaken });
            } else if (shaken > 0) {
                this.spellFx.shake(colossal.shake * shaken);
            }

            if (colossal.sound) {
                this.sound?.play(colossal.sound, { at, far: BLAST_HEARD.far, delay: off > BLAST_HEARD.late ? off / BLAST_HEARD.sound : 0 });
            }
        } else {
            this.spellFx.blast(at, { radius: event.radius, grand, shake: shaken, look, kind: event.kind });
            this.sound?.play(BURSTS[look ?? event.kind]?.burst ?? (grand ? "explosionLarge" : "explosionSmall"), { at, far: BLAST_HEARD.far, muffle: off > BLAST_HEARD.clear ? BLAST_HEARD.highs * (BLAST_HEARD.clear / off) ** 1.3 : null, delay: off > BLAST_HEARD.late ? off / BLAST_HEARD.sound : 0 });
        }

        for (const { id, to, flight, up, until } of event.throws) {
            const avatar = this.avatars.get(id);
            const actor = battle.actor(id);

            if (!avatar?.actions.toss || !actor || actor.map !== this.mapId || avatar.object.visible === false) {
                continue;
            }

            const lands = avatar.actions.toss({ to: [ox + to[0], oz + to[1]], flight: flight / 1000, up, ground: (x, z) => this.#standsAt(actor.map, x - ox, z - oz), seconds: actor.dead ? null : (until - battle.time) / 1000 }) ?? flight / 1000;

            // (Hitting the ground: the dead are heard falling as they die)
            if (!actor.dead) {
                const fall = CREATURE_VOICES[actor.wild?.creature]?.fall;

                if (fall !== null) {
                    this.sound?.play(fall ?? (["mail", "plate"].includes(armourOf(avatar.character)) ? "fallArmoured" : "fall"), { at: new THREE.Vector3(ox + to[0], 0, oz + to[1]), delay: lands });
                }
            }

            if (id === this.me) {
                hud.message("Thrown off your feet!", 1.2);
            }
        }
    }

    // A blow about to land on the ground round a point (battle.js "telegraph": the Orc King's leap,
    // where he'll come down, and his spin all round him): how far it'll reach shown on the ground
    // till it lands (spellfx.js telegraph), on the player's own map
    #telegraphed(event) {
        if (event.map !== this.mapId) {
            return;
        }

        const [ox, oz] = this.originOf(event.map);

        this.spellFx.telegraph(new THREE.Vector3(ox + event.x, 0, oz + event.y), { radius: event.radius, seconds: Math.max(0.1, (event.lands - this.battle.time) / 1000) });
    }

    // Standing on the ground (stepping up onto a bridge's deck, and down off it); or, dead, lying
    // still a while, then sinking out of sight until they come back to life
    // How a black widow lurking hangs under the roof over where it is, and how far down its thread
    // it's dropped (battle.js #lurk): its middle as high as the rock over it lets it be (HANG), and
    // how high that is; null once it's down, or dead
    #hanging(actor, avatar, x, z) {
        const drop = actor.wild.lurk.drop;
        const since = actor.droppedAt === null || actor.droppedAt === undefined ? Infinity : this.battle.time - actor.droppedAt;

        if (actor.dead || (!actor.lurking && since >= drop)) {
            return null;
        }

        // (The rock over it, once its level's is built: till then, as high as a cavern's middle)
        avatar.lurkRoof ??= this.interiors.get(actor.map)?.roof?.(x, z) ?? null;

        const roof = avatar.lurkRoof ?? HANG.roof;

        return { height: Math.min(HANG.most, Math.max(HANG.least, roof - HANG.under)), roof, u: actor.lurking ? null : since / drop };
    }

    #updateBody(actor, avatar, dt, ground = 0) {
        const object = avatar.object;

        // (Thrown by a blast, flung where it's drawn (Actions.toss): in the air, or alive till
        // it's on its feet again)
        if (avatar.thrown && (!actor.dead || avatar.airborne)) {
            avatar.ground = ground;
            avatar.standing = ground;

            return;
        }

        // (A winged one coming down out of the sky, drawn gliding down to the ground: arrive)
        if (avatar.arriving) {
            avatar.ground = ground;
            avatar.standing = ground;

            return;
        }

        if (!actor.dead) {
            const hover = aloftShare(actor.aloft, this.battle.time);
            const lift = hover > 0 ? hover * (HOVERING.height + Math.sin(this.clock * HOVERING.bob) * HOVERING.swing) : this.battle.buffOf(actor, "levitate") ? LIFT.height + Math.sin(this.clock * LIFT.bob) * LIFT.swing : 0;

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

        // (Killed up in the air, or levitating: falling to the ground, faster and faster)
        avatar.lift = Math.max(0, (avatar.lift ?? 0) - 9.8 * avatar.deadFor * dt);
        avatar.ground = ground;
        object.position.y = ground - 0.5 * Math.min(1, sinking) + avatar.lift;
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
        const fighting = this.#colossalFoe() ?? this.#kept();
        const foe = this.#battleFoe(fighting, player);
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
        this.cameraFollow.battle = this.cameraSettings.battle;
        this.#keyTurn(dt);
        this.#openWay(dt, player, foe);

        // (In a fight, whoever it is kept in view: within so much of the way from the middle of the
        // view to its side, as wide as the screen is; with the battle cam, them and the player
        // seen clear of what stands round, where they can be)
        const [ox, oz] = foe ? this.originOf(foe.map) : [0, 0];
        const lens = this.view.camera;
        const across = 2 * Math.atan(Math.tan((lens.fov * Math.PI) / 360) * lens.aspect);
        // (Who's kept in sight: the foe the camera frames; or, the camera taken by hand from the
        // battle cam (#battleFoe), the one it framed still: the steering's the player's again, but
        // not the view, so a hole's still cut through whatever hides them and a big one's still
        // drawn back from)
        const viewed = foe ?? (fighting && this.battleCamLeft.has(fighting.id) ? fighting : null);
        const seen = viewed && this.avatars.get(viewed.id);
        const foeChest = seen ? seen.point(0.55, _foeChest) : null;
        const { focus, yaw } = this.cameraFollow.update(dt, {
            player: { x: position.x, z: position.z, vx: player.follow.vx, vz: player.follow.vz },
            aim: { x: _focus.x, z: _focus.z },
            lowest: this.view.lowestPitch(),
            away,
            keep: foe ? { x: ox + foe.x, z: oz + foe.y } : null,
            half: (across / 2) * FIGHT_VIEW.margin,
            blocked: foe && foeChest ? (way) => this.view.hiddenFrom(way, [chest, foeChest]) : undefined,
        });

        this.view.setFoe(foeChest, seen ? seen.point(1).y - seen.object.position.y : undefined, seen ? Math.hypot(seen.object.position.x - position.x, seen.object.position.z - position.z) : 0, viewed?.wild?.colossus ? BIG_FOE.colossal : undefined);
        this.#threats();
        this.#attackers();
        this.#clearOfFight(fighting);

        // (Level with the ground the player stands on, eased so steps and bumps don't jolt it, but
        // never lagging far under it, climbing)
        const ground = player.standing ?? this.#groundOn(this.battle.actor(this.me)?.map, position.x, position.z);
        const eased = dt && this.focusHeight !== undefined ? this.focusHeight + (ground - this.focusHeight) * Math.min(1, dt * FOCUS_EASE) : ground;

        this.focusHeight = Math.max(eased, ground - FOCUS_LAG);
        this.view.look(_focus.set(focus.x, this.focusHeight, focus.z), yaw, this.#dungeonPose(dt), dt || Infinity);
        this.#roofCut();
        this.#silhouettes(player, chest, seen, foeChest);
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
            camera.updateMatrixWorld();
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

    // The minimap: everyone on it, where the player is going and what the camera sees, the needle
    // on its corner's button turned as the camera turns; folded away (main.js), the compass in its
    // place turned so
    #drawMinimap(target) {
        const minimap = this.minimap;

        this.#turnCompass();

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

        // (The other players in their party, each in their own colour, however far: partyView. Out
        // in the world, one inside a building or down in a dungeon where its door is; inside, only
        // those on the same floor)
        const party = this.partyView().filter((member) => member.map === this.mapId || this.mapId === "town");
        const partied = new Set(party.map(({ id }) => id));

        minimap.draw({
            player: actor.dead ? null : { x: me.object.position.x - ox, z: me.object.position.z - oz, facing: me.facing },
            // (Not one lurking unseen overhead: battle.js #lurk; nor another of their party)
            others: battle.actors.filter((other) => other !== actor && !other.dead && !other.lurking && !other.hidden && other.map === this.mapId && this.avatars.has(other.id) && !other.wild?.elite && !CRIER.test(other.id) && !partied.has(other.id)).map((other) => {
                const position = this.avatars.get(other.id).object.position;

                return { x: position.x - ox, z: position.z - oz, hostile: this.battle.hostile(other, actor), targeted: other === target, ally: Boolean(this.allied?.has(other.id)) };
            }),
            // (The wild's elites, marked their own way as soon as they're near enough: core/
            // creatures.js ELITES `marker`, drawn or not)
            elites: battle.actors.filter((other) => other.wild?.elite && !other.dead && other.map === this.mapId && Math.hypot(other.x - actor.x, other.y - actor.y) <= ELITES.marker).map((other) => ({ x: other.x, z: other.y, targeted: other === target })),
            // (The criers out, each marked with his bell, at the edge the way he is if he's
            // further than shown: core/townsfolk.js crierOf)
            criers: battle.actors.filter((other) => CRIER.test(other.id) && other.map === this.mapId).map((other) => ({ x: other.x, z: other.y })),
            // (Not while held input steers them: where its order reaches is just a little way
            // on ahead of them, never where they're going)
            destination: actor.order?.type === "move" && !this.steering?.steering ? [actor.order.to[0] + 0.5, actor.order.to[1] + 0.5] : null,
            look: actor.dead ? null : look,
            icons: this.mapId === "town" ? [...this.icons(), ...this.#trackedMarks(this.placeIcons()), ...this.#trackedMarks(this.dungeonIcons()), ...this.#trackedMarks(this.denIcons()), ...this.worksIcons(), ...this.fortIcons(), ...this.cacheIcons(), ...this.findIcons(), ...this.rareIcons()] : [],
            // (The circles to search for the treasures they're hunting: #treasureCircles)
            searches: this.mapId === "town" ? this.treasureCircles() : [],
            // (The party's pings: pingView; and the player's markers: markerView)
            pings: this.mapId === "town" ? this.pingView() : [],
            markers: this.mapId === "town" ? this.markers : [],
            // (The fresh tracks they've come upon, the way they lead: #freshTrails)
            trails: this.mapId === "town" ? this.#freshTrails() : [],
            party: party.map(({ id, name, colour, x, z, map }) => (map === this.mapId ? { id, name, colour, x: this.battle.actor(id).x, z: this.battle.actor(id).y } : { id, name, colour, x, z })),
            // (The battles near: battleView)
            battles: this.mapId === "town" ? this.battleView() : { arrows: [], commanders: [] },
        });
    }

    /**
     * The battles out in the world, for the minimap (core/engagement.js: an invasion's, a field
     * battle's, the armies met, a seat's last stand): { arrows: [{ from, to, hostile }] (each body
     * charging, wheeling round a flank, sent in, or sent to try the enemy's line: from where it is
     * to where it's going), commanders: [{ id, x, z, hostile }] (each standing) }, each side's the
     * player's enemies' or not (`hostile`).
     */
    battleView() {
        const me = this.battle.actor(this.me);
        const view = { arrows: [], commanders: [] };

        for (const { sides } of me ? (this.host?.engagements?.() ?? []) : []) {
            for (const side of sides) {
                const ids = side.bodies.flatMap(({ formation }) => formationsOfBody(formation));
                const commander = side.commander === null ? null : this.battle.actor(side.commander);
                const one = commander && !commander.dead ? commander : this.battle.actors.find((actor) => !actor.dead && ids.includes(actor.formation?.id));

                if (!one) {
                    continue;
                }

                const hostile = this.battle.hostile(one, me);

                for (const formation of ids.map((id) => this.battle.formations[id]).filter((each) => each?.to && each.charge && !each.broken)) {
                    view.arrows.push({ from: [...formation.anchor], to: [...formation.to], hostile });
                }

                if (commander && !commander.dead && commander.map === "town") {
                    view.commanders.push({ id: commander.id, x: commander.x, z: commander.y, hostile });
                }
            }
        }

        return view;
    }

    // An adventurers' cache come within sight of the player for the first time (CACHE_SEEN): said,
    // and marked on their maps from then on
    #spyCaches() {
        const me = this.battle.actor(this.me);

        if (!me || me.dead || me.map !== "town" || !this.host?.caches?.size) {
            return;
        }

        for (const cache of this.host.caches.values()) {
            if (!cache.treasure && !this.cachesSeen.has(cache.id) && !cache.opened && Math.hypot(me.x - cache.at[0], me.y - cache.at[1]) <= CACHE_SEEN) {
                this.cachesSeen.add(cache.id);
                this.hud.message(`An adventurer's cache, and ${CACHE_BANDS[cache.band]?.name ?? "brigands"} keeping it. Put them all down to open it.`, 4);
            }
        }
    }

    // The wilds director's pacing for the player (core/director.js PACING; host.js #pace): a quiet
    // spell after a hard fight, said; a build-up after a long calm, the land's hunters heard ahead
    // (folk with hands drumming; beasts calling, others answering; drums, a beast with no call),
    // said which way; and as they come, said
    #paced({ change, creature, at }) {
        if (change === "quiet") {
            this.hud.message("The wild grows quiet round you, for a while.", 3);

            return;
        }

        // (An ambush laid ahead in a build-up's stead: the only tell, the quiet, core/ambush.js)
        if (change === "silent") {
            this.hud.message("The wild's gone quiet round you. Too quiet.", 3.5);

            return;
        }

        const name = CREATURES[creature]?.name?.toLowerCase() ?? "something";

        if (change === "hunt") {
            this.hud.message(CREATURES[creature]?.hands ? "Here they come!" : "They're on you!", 2.5);

            return;
        }

        const [ox, oz] = this.originOf("town");
        const heard = new THREE.Vector3(ox + at[0], this.#groundOn("town", at[0], at[1]), oz + at[1]);
        const which = bearing(this.#whereAmI(), at)?.replace(/^[\d.]+ k?m /, "") ?? "out there";
        const drums = CREATURES[creature]?.hands || !this.sound?.voice?.(creature, "call", heard, { far: PACE_HEARD });

        if (drums) {
            // (Beaten twice over, as they come on)
            this.sound?.play("warDrums", { at: heard, far: PACE_HEARD });
            this.sound?.play("warDrums", { at: heard, far: PACE_HEARD, delay: DRUMS_AGAIN });
            this.hud.message(`Drums, somewhere off to the ${which}. They're coming this way.`, 4);
        } else {
            this.sound?.voice?.(creature, "call", heard.clone().add(new THREE.Vector3(6, 0, -4)), { far: PACE_HEARD, delay: 1.3 });
            this.hud.message(`A ${name} calls, somewhere off to the ${which}, and others answer.`, 4);
        }
    }

    // A note found on a fallen adventurer's remains (core/director.js noteOf: of a place round about
    // the player hasn't found, `id`), or a place a wounded hunter they healed told of (`hunter`:
    // their name), heard tell of as a crier tells it, by the settlement nearest the place
    // (memory.heard: { id, town, turn, note or hunter }): written in the journal, its circle on the
    // map, said with a quill's scratch
    #noteFound(id, { hunter = null } = {}) {
        const plan = this.world.plan;
        const place = plan ? rumouredBy(plan, id) : null;

        if (!place || (this.memory.heard ?? []).some((one) => one.id === id)) {
            return;
        }

        const far = ({ at }) => Math.hypot(at[0] - place.at[0], at[1] - place.at[1]);
        const town = [...plan.places].sort((a, b) => far(a) - far(b))[0];

        this.memory.heard = [...(this.memory.heard ?? []), { id, town: town.id, turn: this.host.war?.turn ?? 0, ...(hunter ? { hunter: true } : { note: true }) }];
        this.#keepTalks();
        this.hud.message(hunter ? `${hunter} tells you of ${this.#placeCalled(id) ?? "somewhere"} near ${town.name}. It's in your journal, and on your map.` : `In their hand, a note: it tells of ${this.#placeCalled(id) ?? "somewhere"} near ${town.name}. It's in your journal, and on your map.`, 4.5);
        this.sound?.play("quill", { delay: 0.6 });
    }

    // A peaceful find the wilds director's dealt (core/director.js FINDS) come within sight of the
    // player for the first time: said, and marked on their maps from then on
    #spyFinds() {
        const me = this.battle.actor(this.me);

        if (!me || me.dead || me.map !== "town" || !this.host?.finds?.size) {
            return;
        }

        for (const find of this.host.finds.values()) {
            if (!this.findsSeen.has(find.id) && Math.hypot(me.x - find.at[0], me.y - find.at[1]) <= FINDS.seen) {
                this.findsSeen.add(find.id);

                if (!find.searched) {
                    this.hud.message(find.kind === "remains" ? "The remains of an adventurer who fell out here long ago. Search them: they may have left something." : "An old campsite: a ring of stones, the ashes long cold. A good place to make camp: safe from the wild, and you'd wake well rested.", 4);
                }
            }
        }
    }

    // A stranger the wilds director's put out (core/director.js STRANGERS) come upon by the player
    // for the first time: a pedlar or a wounded hunter said (hungry bandits say it themselves, as
    // they hail them: #strangerSaid)
    #spyStrangers() {
        const me = this.battle.actor(this.me);

        if (!me || me.dead || me.map !== "town" || !this.host?.strangers?.size) {
            return;
        }

        for (const stranger of this.host.strangers.values()) {
            const one = stranger.folk ? this.battle.actor(stranger.ids[0]) : null;

            if (one && !this.strangersSeen.has(stranger.id) && Math.hypot(me.x - one.x, me.y - one.y) <= STRANGERS.seen) {
                this.strangersSeen.add(stranger.id);

                if (stranger.kind === "pedlar") {
                    this.hud.message("A pedlar, resting by the way with their pack: they'll have odds and ends to sell.", 3.5);
                } else if (!stranger.tended && !stranger.off) {
                    this.hud.message("Someone's down ahead, hurt: a hunter, by the look of them. Talk to them: they may need help.", 3.5);
                }
            }
        }
    }

    // The strangers out (core/director.js STRANGERS; host.js "stranger" events): put out, drawn
    // (a few at a time, as the wild's are); and what's said as they deal with the player, over
    // their heads: hungry bandits' chief hailing them (and told what they want), paid, and refused
    // or walked away from, the bandits drawing their blades; a wounded hunter healed, thanking them
    // and telling of a place round about (#noteFound); and one let go, gone and forgotten
    #strangerSaid(event) {
        const { change, stranger: id } = event;

        if (change === "put") {
            this.enlisting.push(...event.ids);

            return;
        }

        if (change === "gone") {
            this.strangersSeen.delete(id);
            this.#unenlist(event.ids);

            for (const one of event.ids) {
                if (!this.battle.actor(one)) {
                    this.#undress(one);
                }
            }

            return;
        }

        const by = event.by ? this.battle.actor(event.by) : null;
        const say = (lines) => {
            const words = lines[Math.floor(Math.random() * lines.length)];

            if (by) {
                this.hud.say(by.id, words, 1 + bubbleSeconds(words));
            }
        };

        if (change === "hail" && event.id === this.me) {
            say(STRANGER_LINES.hail);
            this.hud.message("Bandits bar your way, hungry: they want food or gold to let you by. Talk to them, or walk away and fight.", 4);
        } else if (change === "paid" && event.id === this.me) {
            say(STRANGER_LINES.paid);
        } else if (change === "fight") {
            say(STRANGER_LINES.fight);

            if (by) {
                const [ox, oz] = this.originOf("town");

                this.sound?.play("unsheathe", { at: new THREE.Vector3(ox + by.x, this.#groundOn("town", by.x, by.y), oz + by.y) });
            }

            if (event.id === this.me) {
                this.hud.message("The bandits draw their blades!", 2.5);
            }
        } else if (change === "tended" && event.by === this.me) {
            const hunter = this.battle.actor(event.id);
            const name = hunter?.name?.split(" ")[0] ?? "The hunter";

            if (hunter) {
                const words = STRANGER_LINES.tended[Math.floor(Math.random() * STRANGER_LINES.tended.length)];

                this.hud.say(hunter.id, words, 1 + bubbleSeconds(words));
            }

            if (event.place) {
                this.#noteFound(event.place, { hunter: name });
            } else {
                this.hud.message(`${name} thanks you. There's nowhere round here you've not found already, they say, but they'll not forget it.`, 3.5);
            }
        }
    }

    // A healing spell the player would cast on someone (core/spells.js: one of the healing school's
    // they know that heals, ready now, the least of them first; or, none ready, the least), or null
    #healingSpell() {
        const known = Object.keys(SPELLS)
            .filter((id) => SPELLS[id].school === "healing" && (SPELLS[id].heal || SPELLS[id].full) && this.progress.knows(id))
            .sort((a, b) => SPELLS[a].tier - SPELLS[b].tier);

        return known.find((id) => this.battle.cooldown(this.me, id) === 0) ?? known[0] ?? null;
    }

    // Whether something a stranger's talk asks of the game (core/dialogue.js: a wounded hunter's,
    // hungry bandits') holds: they've been healed (`tended`), the player has a healing draught
    // (`draught`) or knows a healing spell (`healer`); they've been paid (`paid`), the player has
    // food they'd take (`food`: foodFor) or gold enough (`toll`). Null for anything else
    #strangerCheck(stranger, condition) {
        const [key, want] = Object.entries(condition)[0] ?? [];
        const holds = {
            tended: () => Boolean(stranger.tended),
            draught: () => HEALING_DRAUGHTS.some((id) => this.progress.held(id) > 0),
            healer: () => Boolean(this.#healingSpell()),
            paid: () => Boolean(stranger.paid),
            food: () => Boolean(foodFor(this.progress.pack)),
            toll: () => this.progress.gold >= (stranger.toll ?? Infinity),
        }[key];

        return holds ? holds() === want : null;
    }

    // What's across the way within OBSTACLE_LOOK.seen of the player, out in the world, each drawn
    // as its kind's is (obstacles3d.js), over its squares
    #obstaclesNear() {
        const me = this.battle.actor(this.me);
        const near = me && me.map === "town" && this.host?.obstacles?.size ? [...this.host.obstacles.values()].filter(({ at }) => Math.hypot(at[0] - me.x, at[1] - me.y) <= OBSTACLE_LOOK.seen) : [];

        if (near.length || this.obstacleProps.shown.size) {
            const [ox, oz] = this.originOf("town");

            this.obstacleProps.set(
                near.map(({ id, kind, at: [x, z], box: [x0, y0, x1, y1] }) => ({ id, kind, x: ox + x, z: oz + z, width: x1 - x0 + 1, depth: y1 - y0 + 1 })),
                (x, z) => this.#groundOn("town", x - ox, z - oz),
            );
        }
    }

    // What's across the way the player's come upon for the first time (within OBSTACLES seen of
    // it): said, and how to clear it
    #spyObstacles() {
        const me = this.battle.actor(this.me);

        if (!me || me.dead || me.map !== "town" || !this.host?.obstacles?.size) {
            return;
        }

        for (const obstacle of this.host.obstacles.values()) {
            if (!this.obstaclesSeen.has(obstacle.id) && Math.hypot(me.x - obstacle.at[0], me.y - obstacle.at[1]) <= OBSTACLES.seen) {
                this.obstaclesSeen.add(obstacle.id);
                this.hud.message(OBSTACLE_WORDS[obstacle.kind].seen, 4);
            }
        }
    }

    // What's across the way under a point on the screen (out in the world, drawn): its id, or null
    #obstacleAt(clientX, clientY) {
        return this.mapId === "town" && this.obstacleProps?.shown.size ? this.obstacleProps.at(this.view.rayAt(clientX, clientY)) : null;
    }

    // The player walked up beside what's across the way (`id`): to the square nearest them just
    // off it
    #walkTo(id, { run = false } = {}) {
        const me = this.battle.actor(this.me);
        const obstacle = this.host.obstacles.get(id);

        if (!me || !obstacle) {
            return;
        }

        const [x0, y0, x1, y1] = obstacle.box;
        const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
        const [x, y] = [clamp(Math.floor(me.x), x0 - 1, x1 + 1), clamp(Math.floor(me.y), y0 - 1, y1 + 1)];
        const inside = x >= x0 && x <= x1 && y >= y0 && y <= y1;

        this.#command({ type: "move", to: inside ? [x, y0 - 1] : [x, y], run });
    }

    // Held on what's across the way (`id`, by `pointer`): cleared now, if the player's beside it,
    // or once they've walked up to it (#keepToObstacle), for as long as it's held
    #holdOn(pointer, id) {
        const me = this.battle.actor(this.me);
        const obstacle = this.host.obstacles.get(id);

        if (!me || me.dead || !obstacle) {
            return;
        }

        pointer.clearing = id;
        this.toClear = id;

        if (!this.#beside(obstacle, me)) {
            this.#walkTo(id);
        }
    }

    // Whether someone (`actor`) is near enough what's across the way to clear it (OBSTACLES reach
    // of its nearest square)
    #beside({ box: [x0, y0, x1, y1] }, actor) {
        return Math.hypot(Math.max(x0 - actor.x, 0, actor.x - (x1 + 1)), Math.max(y0 - actor.y, 0, actor.y - (y1 + 1))) <= OBSTACLES.reach;
    }

    // Holding on what's across the way (#holdOn): once beside it and stopped, set to clearing it
    // (refused, told why, and no more); gone, forgotten
    #keepToObstacle() {
        const id = this.toClear;
        const me = this.battle.actor(this.me);
        const obstacle = id ? this.host.obstacles.get(id) : null;

        if (!id || me?.clearing === id) {
            return;
        }

        if (!me || me.dead || !obstacle) {
            this.toClear = null;

            return;
        }

        if (me.order || me.path.length || !this.#beside(obstacle, me)) {
            return;
        }

        this.#command({ type: "clear", obstacle: id }, (result) => {
            if (!result.ok) {
                this.toClear = null;
                this.hud.message(REFUSALS[result.reason] ?? "Can't do that.", 1.8);
                this.sound?.play("denied");
            }
        });
    }

    // Let go of what's across the way: no more cleared
    #leaveOff() {
        const me = this.battle.actor(this.me);

        this.toClear = null;

        if (me?.clearing) {
            this.#command({ type: "clear", obstacle: null });
        }
    }

    // What's said, seen and heard as what's across the way is cleared (core/director.js
    // OBSTACLES; host.js "obstacle" events): each swing at it (whoever's at it), their weapon
    // swung and the wood or the rock heard; the player left off for want of breath, told; cleared,
    // what it turned up for them (brigands jumping them, what spilled under it, or only the way
    // clear); and one let go, forgotten
    #obstacleSaid(event) {
        const { change, obstacle: id } = event;

        if (change === "gone") {
            this.obstaclesSeen.delete(id);

            return;
        }

        if (change === "swing") {
            const actor = this.battle.actor(event.id);
            const avatar = this.avatars.get(event.id);
            // (A blow as their weapon strikes one; with a bow, a wand or a book, as a sword does)
            const swing = actor && (WEAPONS[actor.weapon]?.attacks?.find(({ kind }) => kind === "melee") ?? WEAPONS.sword.attacks[0]);

            if (avatar && swing) {
                avatar.actions.startAttack(swing.animation, { hitAt: swing.hitAt / 1000, duration: swing.duration / 1000, arms: true });
                this.sound?.play(event.kind === "rocks" ? "crush" : "chop", { at: avatar.object.position, delay: swing.hitAt / 1000 });
            }

            return;
        }

        if (change === "left" && event.id === this.me && event.tired) {
            this.hud.message(REFUSALS.tired, 2.5);
            this.toClear = null;

            return;
        }

        if (change === "cleared" && event.by.includes(this.me)) {
            this.toClear = null;
            this.hud.message(event.turned === "brigands" ? "It was a trap! Brigands burst out of cover!" : event.turned === "spilled" ? `${OBSTACLE_WORDS[event.kind].spilled} Your share's at your feet: tap it to take it.` : "The way's clear.", 3.5);

            if (event.turned === "spilled") {
                this.sound?.play("coinPickup");
            }
        }
    }

    // The peaceful finds within FIND_LOOK.seen of the player, out in the world, each drawn as its
    // kind's is (finds3d.js), on the ground where it lies
    #findsNear() {
        const me = this.battle.actor(this.me);
        const near = me && me.map === "town" && this.host?.finds?.size ? [...this.host.finds.values()].filter(({ at }) => Math.hypot(at[0] - me.x, at[1] - me.y) <= FIND_LOOK.seen) : [];

        if (near.length || this.findProps.shown.size) {
            this.findProps.set(
                near.map(({ id, kind, at: [x, z] }) => ({ id, kind, x, z })),
                (x, z) => this.#groundOn("town", x, z),
            );
        }
    }

    /**
     * The peaceful finds the player's seen (core/director.js FINDS), as icons for the maps: [{ id,
     * kind ("remains" or "campsite"), x, z (metres), rim (grey once the remains are searched) }];
     * gone with them.
     */
    findIcons() {
        const finds = this.host?.finds;

        if (!finds?.size || !this.findsSeen.size) {
            return [];
        }

        return [...finds.values()].filter(({ id }) => this.findsSeen.has(id)).map(({ id, kind, at: [x, z], searched }) => ({ id, kind, x, z, rim: searched ? PLACE_RIMS.cleared : null, about: searched ? `${ICON_NAMES[kind]}: searched` : ICON_NAMES[kind] }));
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

            return { id: works.id, kind: WORKS_ICONS[works.kind], x, z, rim: WORKS_RIMS[stance], about: `The ${works.name} ${works.kind}: ${stance === "held" ? "held by brigands" : this.#whose(works.owner, stance)}` };
        });
    }

    /**
     * Each people's fortifications standing (docs/WAR.md *Fortifications*), as icons for the maps:
     * [{ id, kind (guardTower or garrison: app/mapicons.js), x, z (metres), rim (by how its
     * people stand with the player's: WORKS_RIMS), own (its people the player's or an ally's) }].
     * On the world map once seen, as anything is: their own side's too, wherever the war table
     * read uncovered them (core/host.js #tableRead).
     */
    fortIcons() {
        const war = this.host?.war;

        if (!war?.forts) {
            return [];
        }

        const mine = this.self?.realm;

        return war.forts.map((fort) => {
            const stance = mine && war.friendly(mine, fort.realm) ? "own" : mine && war.hostile(mine, fort.realm) ? "enemy" : "other";

            return { id: fort.id, kind: FORT_ICONS[fort.kind], x: fort.at[0], z: fort.at[1], rim: WORKS_RIMS[stance], own: stance === "own", about: `${ICON_NAMES[FORT_ICONS[fort.kind]]}: ${this.#whose(fort.realm, stance)}` };
        });
    }

    // Whose a people's works or fortification is, in words, by how they stand with the player's
    // (`stance`: WORKS_RIMS'): "your people's", "the Elves', your allies'", "the Orcs', at war with
    // yours", or "the Cats'"
    #whose(realm, stance) {
        const people = peopleOf(realm);
        const theirs = `the ${people}${people.endsWith("s") ? "'" : "'s"}`;

        return realm === this.self?.realm ? "your people's" : stance === "own" ? `${theirs}, your allies'` : stance === "enemy" ? `${theirs}, at war with yours` : theirs;
    }

    // A works won near the player, or by their people (host.js #worksFell): said
    #worksWon({ works: id, how, by, owner }) {
        const works = this.host?.war?.workAt(id);
        const me = this.battle.actor(this.me);
        const ours = by === this.self?.realm;

        // (Further off, even the player's people's: a crier cries it)
        if (!works || !me || me.map !== "town" || Math.hypot(me.x - works.at[0], me.y - works.at[1]) > WORKS_OUT.far) {
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
    #lastStand({ town: id, people, by, ruler, title, ids, guards = [] }) {
        const town = this.host?.war?.town(id);
        const me = this.battle.actor(this.me);

        this.enlisting.push(...ids, ...guards);

        if (!town || ![people, by].includes(this.self?.realm) || this.host?.quartered.get(id)?.map === me?.map) {
            return;
        }

        this.hud.message(people === this.self?.realm ? `${town.name}'s garrison is down! ${title} ${ruler} and the captain of the guard make their last stand at the keep, their household guard before them.` : `${town.name}'s garrison is down. ${title} ${ruler} and the captain of the guard make their last stand at its keep: put them down, and it's ours.`, 5);
        this.sound?.play("newsHeard");
    }

    // A town taken by the player's people, the last of its garrison put down near them (not in its
    // barracks: that's said there): the player told
    #townTaken({ town: id, by, people }) {
        const town = this.host?.war?.town(id);
        const me = this.battle.actor(this.me);

        // (Further off: a crier cries it)
        if (!town || by !== this.self?.realm || this.host?.quartered.get(id)?.map === me?.map || !this.#nearNews(town.at)) {
            return;
        }

        // (A seat: given back to its people, to rule from under their conquerors)
        const seat = town.owner === people && this.host.war.realm(people)?.seat === id;

        this.hud.message(seat ? `${town.name} has fallen! Its ruler and the captain of its guard put to the sword, the ${peopleOf(people)} serve the ${peopleOf(by)} now.` : `${town.name} is taken! The last of its garrison put to the sword, the ${peopleOf(by)} hold it now.`, 5);
        this.sound?.play("wake");
    }

    /**
     * The rare encounters out that the player or their party has seen (core/rare.js; raresSeen), as
     * icons for the maps where each was seen, and where the world's threads lead next: [{ id, kind
     * ("legend", "thread"), x, z (metres), about }]; gone as each ends, or its step's done.
     */
    rareIcons() {
        const seen = [...this.raresSeen.values()].filter(({ map }) => map === "town").map(({ n, card, at: [x, z] }) => ({ id: `rare-${n}`, kind: "legend", x, z, about: `${cardOf(card)?.title ?? "Something rare"}: seen here` }));
        // (And where the world's threads lead next, theirs to go to: core/rare.js `place` steps, a
        // fight's, and a card's kept at a site marked on the maps, `mark`: the Orc King's war camp;
        // and where a card's kept that they fell to, `fell`. None of a thread they've given up)
        const legends = this.host.legends;
        const threads = Object.entries(legends?.threads ?? {})
            .filter(([id]) => !legends.gaveUp?.(id, this.me))
            .map(([id, thread]) => ({ id, thread, def: legends.stepOf(id), fell: (thread.fell ?? []).includes(this.me) }))
            .filter(({ thread, def, fell }) => thread.place && (["place", "lock", "fight"].includes(def?.kind) || def?.mark || (def?.kind === "card" && fell)))
            .map(({ id, thread: { place: [x, z] }, def, fell }) => ({ id: `thread-${id}`, kind: "thread", x, z, about: `${THREADS[id]?.title ?? "A thread"}: ${def?.kind === "card" && fell ? "where you fell to it" : "where it leads"}` }));

        return [...seen, ...threads];
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

        return [...caches.values()].filter(({ id }) => this.cachesSeen.has(id)).map(({ id, at: [x, z], opened }) => ({ id, kind: "cache", x, z, rim: opened ? PLACE_RIMS.cleared : null, about: opened ? `${ICON_NAMES.cache}: opened` : ICON_NAMES.cache }));
    }

    /**
     * The roaming beasts' dens (core/dens.js), as icons for the maps: [{ id, kind ("lair"), x, z
     * (metres), rim (a beast's) }].
     */
    denIcons() {
        const plan = this.world.plan;

        if (this.denMarks?.plan !== plan) {
            this.denMarks = { plan, icons: plan ? densOf(plan).map(({ id, at: [x, z] }) => ({ id, kind: "lair", x, z, rim: PLACE_RIMS.beast })) : [] };
        }

        return this.denMarks.icons;
    }

    /**
     * The icons over the buildings the player has gone into ([{ kind, x, z }]: metres, on the
     * world outside), for the maps.
     */
    icons() {
        const { explored, landmarks } = this;

        if (landmarks.version !== explored.version) {
            const buildings = this.world.interiors?.buildings;

            landmarks.icons = [...explored.entered].map((key) => buildings?.get(key)).filter((building) => building?.at).map(({ kind, at, name }) => ({ kind, x: at[0], z: at[1], about: name && ICON_NAMES[kind] ? `${name} (${ICON_NAMES[kind].toLowerCase()})` : (name ?? null) }));
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

    // A dungeon's boss slain (or a hell's level's own, its portal down unsealed), or its hoard
    // opened (host.js #delveFell, #openDungeonChest): said to whoever's in it; its icon greyed once
    // it's cleared, and made again (#remakeDungeon) back as it was, nothing said. A hell's cult's
    // rite broken at its way in (host.js #riteFell): said to whoever's out there near it
    #delved({ site, change, name, boss = null }) {
        const me = this.battle.actor(this.me);
        const building = this.world.interiors?.buildings.get(`site:${site}`);
        const within = me && building?.maps.includes(me.map);
        const called = name ? `${name[0].toUpperCase()}${name.slice(1)}` : "The dungeon";

        if (change === "rite") {
            const at = this.world.plan?.sites.find((each) => each.id === site)?.at;

            if (me?.map === "town" && at && Math.hypot(me.x - at[0], me.y - at[1]) < RITE_HEARD) {
                this.hud.message("The last of the cult falls, and their rite is broken: the portal stands open till daybreak.", 4);
                this.sound?.play("wake");
            }

            return;
        }

        if (!within) {
            return;
        }

        const hell = Boolean(building?.dungeon?.levels.at(-1)?.exit);

        if (change === "boss") {
            this.hud.message(`${boss ? `${boss[0].toUpperCase()}${boss.slice(1)} is` : "Its master is"} slain, and the hoard it kept lies unlocked.${hell ? " The way out beyond it opens." : ""}`, 4);
            this.sound?.play("wake");
        } else if (change === "floor") {
            this.hud.message(`${boss ? `${boss[0].toUpperCase()}${boss.slice(1)} is` : "This level's master is"} slain, and the portal down is open.`, 4);
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

                return { id: site.id, kind: "dungeon", x, z, rim: null, about: site.name ? `${site.name} (dungeon)` : ICON_NAMES.dungeon };
            });
            known.placed = sites?.set.size ?? 0;
        }

        for (const icon of known.icons) {
            const cleared = Boolean(this.host?.dungeons?.get(icon.id)?.cleared);

            icon.rim = cleared ? PLACE_RIMS.cleared : null;
            icon.about = `${icon.about.replace(/: cleared.*$/, "")}${cleared ? ": cleared, till something new stirs in it" : ""}`;
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
                const held = { friendly: place.race ? `held by the ${peopleOf(place.race)}` : "held by its people", bandits: "held by outlaws", dead: "held by the dead", beast: "a great beast's" }[holder];
                // (Its name, and what it is if the name doesn't say: "Thornbury Abbey", "Gorthak (camp)")
                const called = place.name ? (place.name.toLowerCase().includes(place.kind) ? place.name : `${place.name} (${place.kind})`) : `${place.kind[0].toUpperCase()}${place.kind.slice(1)}`;

                return { id: place.id, kind: place.icon, x, z, holder, rim: holder ? PLACE_RIMS[holder] : null, about: held ? `${called}: ${held}` : called };
            });
            known.key = key;
        }

        return known.icons;
    }

    /**
     * What the world map shows (app/worldmap.js): where the player is ({ x, z, facing }, metres
     * and radians, on the world outside: inside, at the building's door) and the icons: the
     * buildings gone into, the places worth finding near where they've been (within a chunk), and
     * the works and fortifications there (their own side's uncovered by the war table read).
     */
    worldMapView() {
        const actor = this.battle.actor(this.me);
        const outside = this.#outside(actor);
        const facing = this.avatars.get(this.me)?.facing ?? actor.facing;
        const seen = ({ x, z }) => this.explored.sighted(x, z);
        // (Who found it for them, if another of their party did: core/explored.js finderOf)
        const finder = (icon) => (this.explored.finderOf(icon.id) ? { ...icon, finder: this.explored.finderOf(icon.id) } : icon);

        // (A place worth finding: been near, or seen from high ground, Explored knows; and the
        // camps and lairs they've tracked home, found or not: core/tracks.js. A fortification
        // once seen, whosever it is: their own side's uncovered by reading the war table)
        // (Or shown every player by one of the world's threads: core/rare.js CHANGES `reveal`)
        const revealed = new Set((this.host.legends?.lasting() ?? []).filter(({ kind }) => kind === "reveal").map(({ site }) => site));
        const known = (icon) => this.explored.knows(icon.id, icon.x, icon.z) || this.explored.tracked.has(icon.id) || revealed.has(icon.id);

        return { player: { x: outside[0], z: outside[1], facing }, icons: [...this.icons(), ...this.#trackedMarks(this.placeIcons().filter(known)).map(finder), ...this.#trackedMarks(this.dungeonIcons().filter(known)).map(finder), ...this.#trackedMarks(this.denIcons().filter(known)), ...this.worksIcons().filter(seen), ...this.fortIcons().filter(seen), ...this.cacheIcons(), ...this.findIcons(), ...this.rareIcons()], marks: this.requestMarks(), heard: this.heardCircles(), searches: this.treasureCircles(), ...this.pinView() };
    }

    /**
     * The treasures the player's hunting (theirs and their party's: core/treasure.js, Host
     * treasuresOf), as circles to search on the maps: [{ id, x, z (its middle, metres), radius,
     * grade (its map's make), own (theirs) }].
     */
    treasureCircles() {
        return (this.host?.treasuresOf?.(this.me) ?? []).map(({ id, centre: [x, z], radius, grade, owner }) => ({ id, x, z, radius, grade, own: owner === this.me }));
    }

    /**
     * The party's pings as they are now (#pinged), for the maps: [{ id, x, z (metres), age
     * (seconds), name (who made it), own (the player's) }].
     */
    /**
     * The other players in the player's party, where each is, for the maps ([{ id, name, colour
     * (core/mapicons.js PARTY_COLOURS: by their place in it, the same for each of them), x, z
     * (metres, the world's: one inside a building or down in a dungeon where its door or way in
     * is), map, inside (where they are then: "in Wenches and Ale"), dead }]), however far off.
     * None, out of a party.
     */
    partyView() {
        const party = this.host.partyFor(this.me);

        return (party?.members ?? []).flatMap((id) => {
            const actor = id === this.me ? null : this.battle.actor(id);

            if (!actor) {
                return [];
            }

            const [x, z] = this.#outside(actor);
            const name = this.world.maps?.[actor.map]?.name ?? this.world.interiors?.of(actor.map)?.name ?? null;

            return [{ id, name: this.host.players.get(id)?.hero.name ?? actor.name ?? "", colour: partyColour(party.members, id), x, z, map: actor.map, inside: actor.map === "town" ? null : name ? `in ${name.replace(/^The /, "the ")}` : "indoors", dead: Boolean(actor.dead) }];
        });
    }

    pingView() {
        return this.pings.filter(({ at }) => this.clock - at < PING.lasts).map(({ id, who, name, x, z, at }) => ({ id, x, z, age: this.clock - at, name, own: who === this.me }));
    }

    /**
     * Show the player's party somewhere on the map ([x, z] metres, the world's): a ping (core/
     * host.js, a "party" command's "ping"), one each PING.every at most. { ok, reason
     * ("unpartied", or "soon") }; refused by the host, what's refused said.
     */
    ping([x, z]) {
        if (!this.host.partyFor(this.me)) {
            return { ok: false, reason: "unpartied" };
        }

        if (this.clock - this.pingedAt < PING.every) {
            return { ok: false, reason: "soon" };
        }

        this.pingedAt = this.clock;
        this.#command({ type: "party", do: "ping", at: [x, z] }, (result) => {
            if (!result.ok) {
                this.hud.message(REFUSALS[result.reason] ?? "Can't do that.", 1.6);
                this.sound?.play("denied");
            }
        });

        return { ok: true };
    }

    // A ping from the player's party (their own too: core/host.js), shown on both maps and in the
    // world for PING.lasts, the newest PING.most; heard, and another's said (which way it is from
    // the player); and the world map told, to show it
    #pinged({ who, name, at: [x, z] }) {
        const where = bearing(this.#whereAmI(), [x, z]);

        this.pings = [...this.pings.filter(({ at }) => this.clock - at < PING.lasts), { id: ++this.pingCount, who, name, x, z, at: this.clock }].slice(-PING.most);
        this.sound?.play("pinSet");

        if (who !== this.me) {
            this.hud.message(`${name} pings the map${where === "here" ? ", right here" : where ? `, ${where}` : ""}.`, 3);
        }

        this.onPing();
    }

    // The party's pings out in the world, each a column of their green light where it was made,
    // fading as it gets older (world/pin3d.js PingBeacons)
    #pinging() {
        const ground = this.mapId === "town" ? this.groundOf("town") : null;
        const live = ground ? this.pingView() : [];

        if (live.length || this.pingBeacons.shown.size) {
            this.pingBeacons.set(live.map(({ id, x, z, age }) => ({ id, x, y: ground(x, z), z, fade: 1 - age / PING.lasts })));
        }

        this.pingBeacons.update(this.clock, this.view.far.camera.far);
    }

    // Where a treasure the player's hunting is buried (where its keepers were put out about, or
    // where the map has it) glinting, once they're near enough to see it (TREASURE.seen), out in
    // the world; and twinkling
    #glinting() {
        const me = this.battle.actor(this.me);
        const spots = [];

        if (me && this.mapId === "town" && this.host?.treasures?.size) {
            for (const treasure of this.host.treasuresOf(this.me)) {
                const [x, z] = treasure.spot ?? treasure.at;

                if (Math.hypot(me.x - x, me.y - z) <= TREASURE.seen) {
                    spots.push({ id: treasure.id, x, y: this.#groundOn("town", x, z), z });
                }
            }
        }

        if (spots.length || this.glints.shown.size) {
            this.glints.set(spots);
        }

        this.glints.update(this.clock);
    }

    // The trails out of the wild's camps and lairs near the player (core/tracks.js), out in the
    // world: their signs within TRAIL_SEEN.signs, each glinting till it's read (signs3d.js); and
    // their prints within TRAIL_SEEN.prints, laid again once they've gone TRAIL_SEEN.again on
    #trailing() {
        const me = this.battle.actor(this.me);
        const plan = this.world.plan;

        if (!plan || !me || me.map !== "town") {
            if (this.trailSigns.shown.size) {
                this.trailSigns.set([]);
            }

            this.trailPrints.mesh.visible = false;

            return;
        }

        const signs = signsNear(plan, [me.x, me.y], TRAIL_SEEN.signs).map(({ sign: { id, at: [x, z] } }) => ({ id, x, y: this.#groundOn("town", x, z), z, read: this.explored.signs.has(id) }));

        if (signs.length || this.trailSigns.shown.size) {
            this.trailSigns.set(signs);
        }

        this.trailSigns.update(this.clock);

        // (Laid again as the player goes, or as the wilds director lays fresh tracks or they go, or a
        // rare card's tracks come or go)
        const fresh = [...(this.host.fresh?.keys() ?? []), ...threadTracks(this.host.legends).map(({ id, points }) => `${id}:${points.at(-1)}`)].join();

        if (!this.trailsAt || Math.hypot(me.x - this.trailsAt[0], me.y - this.trailsAt[1]) > TRAIL_SEEN.again || fresh !== this.freshLaid) {
            this.trailsAt = [me.x, me.y];
            this.freshLaid = fresh;
            this.#layTrails(plan, me);
        }

        this.#spyFresh(me);

        this.trailPrints.mesh.visible = this.trailPrints.mesh.count > 0;
    }

    // The fresh tracks the player's come upon (#spyFresh), for the minimap to show the way they lead
    // (prints can be hard to see in long grass): [{ id, points }]
    #freshTrails() {
        return [...(this.host.fresh?.values() ?? [])].filter(({ id }) => this.freshSeen.has(id)).map(({ id, points }) => ({ id, points }));
    }

    // Fresh tracks the wilds director's laid (core/director.js FRESH) come upon by the player for
    // the first time (within FRESH.seen of their prints): said, what made them and which way they
    // lead
    #spyFresh(me) {
        // (A rare card's: core/rare.js threadTracks, the Stone Golem's sunk deep, the Orc King's war
        // band's; said as its step says, `spoor`)
        for (const tracks of threadTracks(this.host.legends)) {
            if (!this.freshSeen.has(tracks.id) && tracks.points.some(([x, y]) => Math.hypot(x - me.x, y - me.y) <= FRESH.seen)) {
                const way = compass(tracks.points[0], tracks.points.at(-1));

                this.freshSeen.add(tracks.id);
                this.hud.message(tracks.spoor ? threadWords(tracks.spoor, { way }) : `Tracks: the ${CREATURES[tracks.creature]?.name?.toLowerCase() ?? "creature"}'s. They lead off to the ${way}.`, 4.5);
            }
        }

        for (const tracks of this.host.fresh?.values() ?? []) {
            if (!this.freshSeen.has(tracks.id) && tracks.points.some(([x, y]) => Math.hypot(x - me.x, y - me.y) <= FRESH.seen)) {
                this.freshSeen.add(tracks.id);

                const name = CREATURES[tracks.creature]?.name?.toLowerCase() ?? "something";
                const way = compass(tracks.points[0], tracks.points.at(-1));

                this.hud.message(`Fresh tracks, not long made: ${/^[aeiou]/.test(name) ? "an" : "a"} ${name}'s, and not alone. They lead off to the ${way}: they're on your minimap.`, 4.5);
            }
        }
    }

    // The roaming beasts' dens within DEN_LOOK.seen of the player (core/dens.js), out in the world,
    // each drawn as its kind's is (dens3d.js), on the ground where it lies
    #denning() {
        const me = this.battle.actor(this.me);
        const plan = this.world.plan;
        const near = plan && me && me.map === "town" ? densOf(plan).filter(({ at }) => Math.hypot(at[0] - me.x, at[1] - me.y) <= DEN_LOOK.seen) : [];

        if (near.length || this.denProps.shown.size) {
            this.denProps.set(
                near.map(({ id, kind, at: [x, z], seed }) => ({ id, kind, x, z, seed })),
                (x, z) => this.#groundOn("town", x, z),
            );
        }
    }

    // The prints along the trails near the player (core/tracks.js), each of what wore it (Host
    // trailCreatureOf), as big as one of its kind's been seen (or as its look is: tracks3d.js
    // lookPrint), a stride apart, one foot and then the other, their toes toward its home; as deep
    // as the ground takes them, fainter than fresh ones, and lasting (laid at the clock's start,
    // their own clock never going on)
    #layTrails(plan, me) {
        const map = this.world.maps?.town;
        const [ox, oz] = this.originOf("town");
        const [share, least, most] = TRAIL_SEEN.stride;

        this.trailPrints.clear();

        if (!map) {
            return;
        }

        // (The trails out of the wild's homes, worn; and the wilds director's fresh tracks, made
        // not long ago, deeper: core/director.js FRESH; and a rare card's kept at a site, sunk deep
        // even into stony ground, `sunk`: the Stone Golem's, from the Lantern Company's remains to
        // where it is, core/rare.js threadTracks)
        const near = ({ points }) => points.some(([x, y]) => Math.hypot(x - me.x, y - me.y) <= TRAIL_SEEN.prints + 10);
        const fresh = [...(this.host.fresh?.values() ?? [])].filter(near).map((tracks) => ({ ...tracks, fresh: true }));
        const sunk = threadTracks(this.host.legends).filter(near).map((tracks) => ({ ...tracks, fresh: true, sunk: true }));

        for (const trail of [...trailsNear(plan, [me.x, me.y], TRAIL_SEEN.prints), ...fresh, ...sunk]) {
            const creature = trail.fresh ? trail.creature : this.host.trailCreatureOf(this.me, trail);
            const { print, size } = creature ? lookPrint(creature, CREATURE_LOOKS[creature], this.gaitsSeen.get(creature)) : { print: null };

            if (!print) {
                continue;
            }

            const stride = Math.min(most, Math.max(least, size * share));
            let on = 0;
            let foot = "left";

            for (let k = 1; k < trail.points.length; k++) {
                const [[hx, hy], [fx, fy]] = [trail.points[k - 1], trail.points[k]];
                const length = Math.hypot(fx - hx, fy - hy);
                const facing = Math.atan2(hx - fx, hy - fy);

                for (; on < length; on += stride) {
                    const [x, z] = [hx + ((fx - hx) * on) / length, hy + ((fy - hy) * on) / length];
                    const [across] = footAt(foot, size);
                    const [px, pz] = [x - Math.cos(facing) * across, z + Math.sin(facing) * across];
                    const footing = Math.hypot(px - me.x, pz - me.y) <= TRAIL_SEEN.prints ? (TAKES[this.#footingAt(map, px, pz)] ?? 0) : null;
                    const takes = footing === null ? 0 : trail.sunk ? Math.max(TRAIL_SEEN.sunk, footing) : footing;

                    foot = foot === "left" ? "right" : "left";

                    if (takes) {
                        this.trailPrints.print(print, ox + px, oz + pz, facing, size, takes * (trail.fresh ? 1 : TRAIL_SEEN.depth), 0);
                    }
                }

                on -= length;
            }
        }
    }

    // The places' icons (`icons`: placeIcons', dungeonIcons'), those the player's tracked home by
    // their trails' signs (core/tracks.js, Explored tracked) marked so (`tracked`) for the maps
    #trackedMarks(icons) {
        const tracked = this.explored.tracked;

        return tracked.size ? icons.map((icon) => (tracked.has(icon.id) ? { ...icon, tracked: true } : icon)) : icons;
    }

    /**
     * The places the player's heard tell of and is still to find, as faint circles on the world
     * map round about where each is (core/rumours.js circleOf): [{ x, z, radius (metres), hell (a
     * hell's cult's, said to be near: violet) }]. The newest RUMOURS.kept of the criers', and every
     * hell's; each gone once its place is found, and its icon shown.
     */
    heardCircles() {
        const plan = this.world.plan;
        const open = (this.memory.heard ?? []).filter((one) => (!one.hell || one.hell === "near") && !this.#foundOf(one));
        const hells = new Set(open.filter(({ hell }) => hell).map(({ id }) => id));
        const told = [...new Set(open.filter(({ hell }) => !hell).map(({ id }) => id))].slice(-RUMOURS.kept);

        return plan
            ? [...told, ...hells].map((id) => {
                  const place = rumouredBy(plan, id) ?? plan.sites.find((site) => site.id === id);
                  const { at, radius } = circleOf(id, place.at);

                  return { x: at[0], z: at[1], radius, hell: hells.has(id) };
              })
            : [];
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
        this.pinNear = null;
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
        this.pinNear = null;
        this.pinShown = null;
        this.pinMarks?.setPin(null);
        this.onPin(null);
        this.sound?.play("tap");
    }

    // --- The world map's markers (core/markers.js) ---

    /** The player's markers, for the maps: [{ id, x, z (metres), icon, words, from }]. */
    markerView() {
        return this.markers.map((marker) => ({ ...marker }));
    }

    /**
     * Put a marker down on the world map (`at`: [x, z] metres; anywhere, fog or no) of a kind
     * (`icon`: MARKER_ICONS'), with a few words of the player's own: { ok, marker }, or { ok:
     * false, reason: "full" } with MARKERS.most already (or "marker", if it isn't one).
     */
    addMarker(at, { icon, words = "" }) {
        const markers = withMarker(this.markers, { at, icon, words });

        if (!markers) {
            return { ok: false, reason: this.markers.length >= MARKERS.most ? "full" : "marker" };
        }

        this.markers = markers;
        this.onMarkers(this.markerView());
        this.sound?.play("pinSet");

        return { ok: true, marker: { ...markers.at(-1) } };
    }

    /** Take one of the player's markers away (its id). Whether there was one. */
    removeMarker(id) {
        const left = this.markers.filter((marker) => marker.id !== id);

        if (left.length === this.markers.length) {
            return false;
        }

        this.markers = left;
        this.onMarkers(this.markerView());
        this.sound?.play("tap");

        return true;
    }

    /**
     * Share one of the player's markers (its id) with their party (core/host.js, the "party"
     * command's "mark": each of the rest given it). { ok }, or { ok: false, reason } ("unpartied",
     * or "marker" if there's none of that id); refused by the host, what's refused said.
     */
    shareMarker(id) {
        const marker = this.markers.find((one) => one.id === id);

        if (!marker) {
            return { ok: false, reason: "marker" };
        }

        if (!this.host.partyFor(this.me)) {
            return { ok: false, reason: "unpartied" };
        }

        this.#command({ type: "party", do: "mark", at: [marker.x, marker.z], icon: marker.icon, words: marker.words }, (result) => {
            if (!result.ok) {
                this.hud.message(REFUSALS[result.reason] ?? "Can't do that.", 1.6);
                this.sound?.play("denied");
            }
        });

        return { ok: true };
    }

    // A marker shared by one of the player's party (core/host.js: `who`, named `name`; `at`, its
    // `icon` and `words`): another's kept as one of the player's own, said to be from them, if
    // they've room for it (MARKERS.most), and said (which way it is); their own, said to be shared;
    // and the world map told, to show it
    #markShared({ who, name, at: [x, z], icon, words }) {
        const said = `(${MARKER_NAMES[icon]}${words ? `: "${words}"` : ""})`;

        if (who === this.me) {
            this.hud.message("Shared with your party: it's on their maps now.", 3);
            this.sound?.play("tap");

            return;
        }

        const markers = withMarker(this.markers, { at: [x, z], icon, words, from: name });

        if (!markers) {
            this.hud.message(`${name} shares a marker with you ${said}, but you've ${MARKERS.most} already: take one away to keep the next.`, 4);

            return;
        }

        const where = bearing(this.#whereAmI(), [x, z]);

        this.markers = markers;
        this.onMarkers(this.markerView());
        this.hud.message(`${name} shares a marker with you ${said}${where && where !== "here" ? `, ${where}` : ""}. It's on your map.`, 4);
        this.sound?.play("pinSet");
        this.onPing();
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
        } else if (this.pinNear && this.chunks && this.chunks.groundVersion !== this.pinGround) {
            // (The ground drawn otherwise, a chunk's corners further apart or nearer: the line laid
            // on it again)
            this.pinMarks.setLine(this.#alongGround(this.pinNear));
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
            this.pinNear = null;
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
            this.pinNear = near?.way ?? null;
            this.pinMarks?.setLine(near ? this.#alongGround(near.way) : null);
        }
    }

    // A way's points ([x, y] metres) along the ground, every WAY_LINE.step metres for as far as
    // WAY_LINE.reach: [x, height, z]. On the ground as it's drawn (chunks3d.js groundDrawnAt: its
    // corners further apart away from the player, cutting across the land's heights, so that laid
    // on those the line went under it wherever the land dips); on a deck, the deck (a bridge's, a
    // walkway's)
    #alongGround(way) {
        const ground = this.groundOf("town");
        const bare = this.groundOf("town", { bare: true });
        const points = [];

        this.pinGround = this.chunks?.groundVersion ?? null;

        for (let d = 0; d <= WAY_LINE.reach; d += WAY_LINE.step) {
            const [x, z] = pointAlong(way, d);
            const on = ground ? ground(x, z) : 0;
            const decked = bare && Math.abs(on - bare(x, z)) > 1e-6;

            points.push([x, decked ? on : (this.chunks?.groundDrawnAt(x, z) ?? on), z]);

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

    // Places another of the player's party found for them (core/host.js #share: `places`, plan
    // place ids, found by `name`), said: the one by its name, or what it is; or how many
    #sharedFinds({ name, places = [], pooled = false }) {
        const what = places.length === 1 ? this.#placeCalled(places[0]) : null;

        // (Coming into a party, what each had found before: the land they'd been over, and the
        // places, on the map too: core/host.js #pool)
        if (pooled) {
            this.hud.message(`${name}'s map is yours too: ${places.length ? `${what ?? `${places.length} places`} and ` : ""}the land they've been over.`, 4);

            return;
        }

        this.hud.message(what ? `${name} found ${what}: it's on your map.` : `${name} found ${places.length} places: they're on your map.`, 3.5);
    }

    // The places worth finding the player's seen from high ground (core/sighting.js; the nearest
    // first), said with a quill's scratch, as anything written in: one by what it is and which way,
    // more by how many
    #spotted(places) {
        const one = places.length === 1 ? this.#placeOf(places[0]) : null;
        const where = one ? bearing(this.#whereAmI(), one.at) : null;

        this.hud.message(one ? `From up here you can see ${this.#placeCalled(places[0])}${where && where !== "here" ? `, ${where}` : ""}: it's on your map.` : `From up here you can see ${places.length} places: they're on your map.`, 4);
        this.sound?.play("quill");
    }

    // A place worth finding by its id (a plan's place, a dungeon's site, or a den), or null
    #placeOf(id) {
        const plan = this.world.plan;

        return placesOf(plan).find((place) => place.id === id) ?? plan.sites.find((site) => site.id === id) ?? denOf(plan, id);
    }

    // What a place worth finding (its id) is called: its name, or what it is ("a ruined castle");
    // null if there's none
    #placeCalled(id) {
        const one = this.#placeOf(id);

        return one?.name ?? (one ? `${/^[aeiou]/.test(one.kind) ? "an" : "a"} ${one.kind}` : null);
    }

    // Who the player was told to fight, or else is locked on (and is still alive), or null
    #target() {
        const player = this.battle.actor(this.me);

        if (!player || player.dead) {
            return null;
        }

        const target = this.battle.actor(player.order?.type === "engage" ? player.order.target : player.lock);

        return target && !target.dead && target.map === player.map ? target : null;
    }

    // What an engage order of the player's carries: locked on whoever it's at, with Auto target
    // lock on (#target, battle.js `lock`)
    #locking() {
        return this.autoLock ? { lock: true } : {};
    }

    // Who the player is fighting: who they were told to fight, or the nearest enemy after them
    // Those attacking the player out of view: an arrow at the screen's edge for each, pointing the
    // way to them across the ground (in front, up; behind, down), the nearest THREATS.most (the
    // camera study, recommendation 6); in its own colour for one that shoots or throws at them
    // (`ranged`), flashing while a blow or shot at them is drawn back, not yet let go (`winding`)
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

                const attack = actor.attack?.target === player.id ? actor.attack : null;

                arrows.push({ x: rect.left + rect.width / 2 + ux * reach, y: rect.top + rect.height / 2 + uy * reach, angle, ranged: Boolean((attack?.attack ?? actor.arms?.[0])?.projectile), winding: Boolean(attack && !attack.struck) });
            }
        }

        this.hud.threats(arrows);
    }

    // The foes in the enemies list, an icon each down the right side (hud.js attackers): whoever the
    // player's set on (#target) first, marked (and locked on, as such); then those attacking them,
    // in the order they came to it; then the rest the player can see within ENEMIES.reach, the
    // nearest first (#enemiesSeen): the first ATTACKERS.most; each with their likeness, drawn once
    // (view.js portrait) when they're drawn in full (not one of a crowd). And the order Z and X
    // step through (#cycleTarget: `enemyRing`), those after them and then the rest, the one set on
    // where it falls among them, so a press doesn't swap the same two
    #attackers() {
        const player = this.battle.actor(this.me);
        const target = this.#target();
        const after = player && !player.dead ? this.battle.actors.filter((actor) => actor === target || (!actor.dead && actor.map === player.map && (actor.target === player.id || actor.attack?.target === player.id) && this.battle.hostile(actor, player))) : [];
        const since = this.attackerSince;

        for (const id of since.keys()) {
            if (!after.some((actor) => actor.id === id)) {
                since.delete(id);
            }
        }

        for (const actor of after) {
            if (!since.has(actor.id)) {
                since.set(actor.id, this.clock);
            }
        }

        const attacking = after.sort((a, b) => since.get(a.id) - since.get(b.id) || (a.id < b.id ? -1 : 1));
        const listed = new Set(attacking.map(({ id }) => id));
        // (Those who've died since they were looked for let go at once, not left till the next look)
        const rest = player && !player.dead ? this.#enemiesSeen(player).filter((id) => !listed.has(id)).map((id) => this.battle.actor(id)).filter((actor) => actor && !actor.dead) : [];
        const ring = [...attacking, ...rest];

        this.enemyRing = ring.map(({ id }) => id);

        const shown = [...(target ? [target] : []), ...ring.filter((actor) => actor !== target)].slice(0, ATTACKERS.most);
        const fighting = new Set(attacking.filter((actor) => actor !== target || actor.target === player.id || actor.attack?.target === player.id).map(({ id }) => id));

        for (const id of this.likenesses.keys()) {
            if (!shown.some((actor) => actor.id === id)) {
                this.likenesses.delete(id);
            }
        }

        for (const actor of shown) {
            this.#likeness(this.likenesses, actor.id);
        }

        // (How the player stands in each one's enmity, and whom else it's on: Show whom foes are on)
        const enmity = this.showEnmity && player && !player.dead;

        this.hud.attackers(shown.map((actor) => ({ id: actor.id, name: actor.name ?? "", hp: actor.hp, maxHp: actor.maxHp, target: actor === target, locked: actor === target && player.lock === actor.id, attacking: fighting.has(actor.id), picture: this.likenesses.get(actor.id) ?? null, standing: enmity ? this.battle.enmityStanding(actor.id, player.id) : null, on: enmity ? this.#onWhom(actor, player) : null })));
    }

    // Whom a foe's on, if not the player: { name, colour (a player's in their party, or null) }, or null
    #onWhom(actor, player) {
        const one = actor.target === null || actor.target === player.id ? null : this.battle.actor(actor.target);

        if (!one || one.dead) {
            return null;
        }

        const members = this.host.partyFor(this.me)?.members ?? [];
        const colour = one.kind === "player" && members.includes(one.id) ? partyColour(members, one.id) : null;

        return { name: (one.kind === "player" ? this.host.players.get(one.id)?.hero.name : null) ?? one.name ?? "", colour };
    }

    // A taunt's mark over each foe tracked that's taunted (Show whom foes are on: hud.js taunt), its
    // time left swept round it, and whose it is; gone as it ends, or with the switch off
    #tauntMarks() {
        const battle = this.battle;

        for (const id of this.tauntsShown.keys()) {
            if (!this.hud.tracked.has(id)) {
                this.tauntsShown.delete(id);
            }
        }

        for (const id of this.hud.tracked.keys()) {
            const taunted = this.showEnmity ? battle.actor(id)?.taunted : null;
            const live = taunted && taunted.until > battle.time && !battle.actor(id).dead;
            // (Its time left, a twentieth at a time: shown again only as that changes)
            const left = live ? Math.ceil(((taunted.until - battle.time) / Math.max(1, taunted.until - taunted.at)) * 20) / 20 : null;
            const shown = this.tauntsShown.get(id) ?? null;

            if (shown?.left !== left || (live && shown?.by !== taunted.by)) {
                const by = live ? battle.actor(taunted.by) : null;

                this.tauntsShown.set(id, { left, by: live ? taunted.by : null });
                this.hud.taunt(id, left, taunted?.by === this.me ? "you" : (by?.name ?? ""));
            }
        }
    }

    // The foes the player can see about them (ids, the nearest first): on their map, within
    // ENEMIES.reach, seen (battle.js canSee, as far in the dark as a player sees: light.js
    // playerSight), drawn (not waiting to be, nor a fort's walls or a camp's stakes); looked for
    // every ENEMIES.every seconds, or at once (`now`)
    #enemiesSeen(player, { now = false } = {}) {
        if (!now && this.enemiesSeenAt && this.clock - this.enemiesSeenAt.clock < ENEMIES.every && this.enemiesSeenAt.map === player.map) {
            return this.enemiesSeenAt.ids;
        }

        const near = [];

        for (const actor of this.battle.actors) {
            if (actor === player || actor.dead || actor.map !== player.map || actor.kind === "fort" || actor.kind === "stakes" || !this.avatars.has(actor.id) || !this.battle.hostile(actor, player)) {
                continue;
            }

            const off = Math.hypot(actor.x - player.x, actor.y - player.y);

            if (off <= ENEMIES.reach && this.battle.canSee(player, actor, ENEMIES.reach)) {
                near.push([off, actor.id]);
            }
        }

        const ids = near.sort((a, b) => a[0] - b[0]).map(([, id]) => id);

        this.enemiesSeenAt = { clock: this.clock, map: player.map, ids };

        return ids;
    }

    // A foe set on from a key (Z or X, Tab), as a tap on its icon sets them (#attackerPressed):
    // where the player stands, locked on with Auto target lock (#locking)
    #setOn(id) {
        const player = this.battle.actor(this.me);

        if (!player || player.dead || !this.battle.actor(id)) {
            return;
        }

        this.#endTalk();
        this.approaching = null;
        this.#command({ type: "engage", target: id, stand: true, ...this.#locking() });
        this.sound?.play("lock");
    }

    /**
     * The next foe along (`step`: 1 on, -1 back) set on, as a tap on its icon sets them: through
     * the enemies list's order (`by` "list": Z and X; those after the player, as they came, then
     * the rest they can see within ENEMIES.reach, the nearest first), or by how far off they are
     * (`by` "distance": Tab, the nearest first, each press the next one out, round again to the
     * nearest; its order kept while the presses come, ENEMIES.keep). With no one set on, the first
     * (or, going back, the last). Said so, if there's no one in sight.
     */
    cycleTarget(step, by = "list") {
        const player = this.battle.actor(this.me);

        if (!player || player.dead) {
            return;
        }

        let ring;

        if (by === "list") {
            this.#attackers();
            ring = this.enemyRing ?? [];
        } else {
            const alive = (id) => {
                const actor = this.battle.actor(id);

                return Boolean(actor) && !actor.dead && actor.map === player.map;
            };
            const kept = this.tabbed && this.clock < this.tabbed.until ? this.tabbed.ids.filter(alive) : [];

            ring = kept.length ? kept : this.#enemiesSeen(player, { now: true });
            this.tabbed = { ids: ring, until: this.clock + ENEMIES.keep };
        }

        if (!ring.length) {
            this.hud.message("No foe in sight", 1.2);
            this.sound?.play("denied");

            return;
        }

        const at = ring.indexOf(this.#target()?.id ?? null);
        const next = at < 0 ? (step > 0 ? 0 : ring.length - 1) : (at + step + ring.length) % ring.length;

        if (next !== at) {
            this.#setOn(ring[next]);
        }
    }

    // An attacker's icon tapped or held (hud.js onAttacker; `time`: ms, as performance.now()): held,
    // set on them and locked on (Auto target lock on or not), walking up into reach of what's in
    // hand; tapped twice in quick succession, running; tapped once, set on them where the player
    // stands (whoever they were set on, they stop), or, tapped on whoever they're locked on, let
    // go (set on no one), or on whoever they're set on, stopping going after them. With Auto
    // target lock on, set on them, locked on (#locking); off, whoever they were locked on let go
    #attackerPressed(id, gesture, time) {
        const player = this.battle.actor(this.me);
        const enemy = this.battle.actor(id);
        const last = this.lastIconTap;

        this.lastIconTap = gesture === "tap" ? { id, time } : null;

        if (!player || player.dead || !enemy || enemy.dead) {
            return;
        }

        const chosen = player.order?.type === "engage" && player.order.target === id;
        let unlocked = false;

        this.#endTalk();
        this.approaching = null;

        if (gesture === "hold") {
            this.#command({ type: "engage", target: id, lock: true });
        } else if (last?.id === id && time - last.time <= DOUBLE_TAP_MS) {
            this.lastIconTap = null;
            this.#command({ type: "engage", target: id, run: true, ...this.#locking() });
        } else if (player.lock === id) {
            unlocked = true;
            this.#command({ type: "unlock" });
        } else if (chosen) {
            this.#halt();
        } else {
            this.#command({ type: "engage", target: id, stand: true, ...this.#locking() });
        }

        if (!chosen && !unlocked) {
            this.sound?.play("lock");
        }
    }

    // A message on the screen kept clear of those fighting (hud.js keepClear): the player, who
    // they're fighting (`foe`), and whoever's after them, each where they are on the screen with
    // their name and bar over them
    #clearOfFight(foe) {
        if (this.hud.banner.hidden) {
            return;
        }

        const player = this.battle.actor(this.me);
        const fighting = player && !player.dead ? this.battle.actors.filter((actor) => actor === foe || (!actor.dead && actor.map === player.map && (actor.target === player.id || actor.attack?.target === player.id) && this.battle.hostile(actor, player))) : [];
        const rects = [];

        for (const actor of fighting.length ? [player, ...fighting] : []) {
            const avatar = this.avatars.get(actor.id);
            const feet = avatar && this.view.toScreen(avatar.object.position);
            const head = avatar && this.view.toScreen(avatar.point(1, _head));

            if (feet && head) {
                const tall = Math.max(MESSAGE_CLEAR.least, feet.y - head.y);

                rects.push({ left: feet.x - tall * MESSAGE_CLEAR.wide, right: feet.x + tall * MESSAGE_CLEAR.wide, top: head.y - MESSAGE_CLEAR.over, bottom: feet.y + MESSAGE_CLEAR.under });
            }
        }

        this.hud.keepClear(rects);
    }

    /**
     * Who the camera's to frame a fight with (who it keeps in view: #kept). With the battle cam,
     * only once they and the player have both been wholly on the screen (#inFull) since they became
     * who the player's fighting, and from then on till the fight's over; till then (they're off
     * the screen, or only partly on it), none: the camera goes on as if there were no fight,
     * rather than swinging round to whoever came for the player, from wherever they were
     * (someone fighting the player from behind the camera has an arrow at the screen's edge:
     * #threats). And once only for each foe: the camera turned by hand (a drag) while it frames
     * the fight, it lets that foe be till the fight's over, rather than swinging back round to
     * frame it again a second after every drag.
     */
    // Q and E held, turning the camera round the player (KEY_TURN), as a drag does: taken hold of
    // as they're pressed, let go as the last is (unless a drag holds it still)
    #keyTurn(dt) {
        const way = (this.turnKeys.has("q") ? 1 : 0) - (this.turnKeys.has("e") ? 1 : 0);

        if (way && !this.keyTurning) {
            this.keyTurning = true;
            this.cameraFollow.grab();
        } else if (!way && this.keyTurning) {
            this.keyTurning = false;

            if (![...this.pointers.values()].some((pointer) => pointer.drag)) {
                this.cameraFollow.release();
            }
        }

        if (way && dt) {
            this.cameraFollow.turn(way * KEY_TURN * this.cameraSettings.drag * dt, 0, this.view.lowestPitch());
        }
    }

    // A dungeon's level's camera (DUNGEON_NUDGE): its tilt and distance by how much room there is
    // round the player, eased from one to the next as they go; the player's own tilt and zoom kept
    // on them as a nudge, and let go of once they've gone somewhere tighter or more open. Returns
    // the pitch to look from (anywhere else, the camera's own)
    #dungeonPose(dt) {
        const follow = this.cameraFollow;
        const space = this.view.space(dt || Infinity);

        if (!space) {
            this.dungeonCamera = null;

            return follow.pitch;
        }

        const pose = dungeonPose(space.share, space.over);
        const camera = (this.dungeonCamera ??= { pitch: pose.pitch, distance: pose.distance, nudge: 0, zoom: 1, share: space.share, set: null });
        const at = dt ? 1 - Math.exp(-DUNGEON_VIEW.ease * dt) : 1;

        camera.pitch += (pose.pitch - camera.pitch) * at;
        camera.distance += (pose.distance - camera.distance) * at;

        // (Tilted by hand, or zoomed: the nudge, where they are)
        if (follow.held || this.keyTurning) {
            camera.nudge = follow.pitch - camera.pitch;
            camera.share = space.share;
        }

        if (camera.set !== null && Math.abs(this.view.distance - camera.set) > 1e-3) {
            camera.zoom = this.view.distance / camera.distance;
            camera.share = space.share;
        }

        if (dt && Math.abs(space.share - camera.share) > DUNGEON_NUDGE.space) {
            const fade = Math.exp(-DUNGEON_NUDGE.ease * dt);

            camera.nudge *= fade;
            camera.zoom = 1 + (camera.zoom - 1) * fade;
        }

        follow.pitch = Math.max(PITCH.least, Math.min(PITCH.most, camera.pitch + camera.nudge));
        this.view.distance = Math.max(DISTANCE.least, Math.min(DISTANCE.most, camera.distance * camera.zoom));
        camera.set = this.view.distance;

        return follow.pitch;
    }

    // A dungeon's level's rock cut away while the camera's over its roof (world/view.js roofCut):
    // its heights told the shaders, and its rock drawn cut only while it's so (dungeons3d.js
    // cutRock), the cut drawing got ready as the level's first come to (view.js prepare)
    #roofCut() {
        const cut = this.view.roofCut();
        const interior = this.interiors.get(this.battle.actor(this.me)?.map) ?? null;

        DUNGEON_CUT.low.value = cut ? cut.low : 1000;
        DUNGEON_CUT.top.value = cut ? cut.top : -1000;

        if (interior && interior !== this.rockCutIn && !interior.cutReady) {
            const cuts = new Map();

            interior.cutReady = true;
            interior.object.traverse((node) => {
                if (node.isMesh && node.name !== "floor" && node.material?.userData?.rock) {
                    cuts.set(cutRock(node.material), node.geometry);
                }
            });

            for (const [material, geometry] of cuts) {
                this.view.prepare(new THREE.Mesh(geometry, material)).catch(() => {});
            }
        }

        if (Boolean(cut) === this.rockCut && interior === this.rockCutIn) {
            return;
        }

        this.rockCut = Boolean(cut);
        this.rockCutIn = interior;
        interior?.object.traverse((node) => {
            if (node.isMesh && node.name !== "floor" && node.material?.userData?.rock) {
                node.material = cutRock(node.material, this.rockCut);
            }
        });
    }

    // The player and whoever they're fighting (`foe`: their avatar, or null) seen through a
    // dungeon's rock where it hides them and isn't cut away (world/silhouette.js); whoever was
    // fought before let go of
    #silhouettes(me, chest, foe, foeChest) {
        showSilhouette(me.object, this.view.rockHides(chest), SILHOUETTE.player);

        if (this.silhouetted && this.silhouetted !== foe) {
            showSilhouette(this.silhouetted.object, false);
        }

        if (foe) {
            showSilhouette(foe.object, this.view.rockHides(foeChest), SILHOUETTE.foe);
        }

        this.silhouetted = foe ?? null;
    }

    // Finding the way through (OPEN_WAY): the camera crowded in by the walls as the player walks,
    // turned to where there's room, along the way through
    #openWay(dt, avatar, foe) {
        const follow = this.cameraFollow;
        const { vx, vz } = avatar.follow;
        const walking = Math.hypot(vx, vz) > 0.4;

        if (!this.cameraSettings.openWay || foe || !walking || follow.held || follow.waiting > 0 || follow.recentring !== null || this.view.roomAt(follow.yaw) > 1 - OPEN_WAY.crowded) {
            this.crowdedFor = 0;

            return;
        }

        this.crowdedFor = (this.crowdedFor ?? 0) + dt;

        if (this.crowdedFor < OPEN_WAY.after || (this.openWayAt ?? -Infinity) > this.clock) {
            return;
        }

        this.openWayAt = this.clock + OPEN_WAY.every;

        const behind = Math.atan2(-vx, -vz);
        const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
        const here = this.view.roomAt(follow.yaw);
        let best = null;
        let roomiest = null;

        // (Turned further than the best yet costs more than it, whatever the room: none looked at)
        for (let k = 1; k * OPEN_WAY.step <= Math.PI && !(best && k * OPEN_WAY.step >= best.cost); k++) {
            for (const way of [1, -1]) {
                const yaw = follow.yaw + way * k * OPEN_WAY.step;
                const cost = k * OPEN_WAY.step + OPEN_WAY.behind * Math.abs(wrap(yaw - behind));
                const room = this.view.roomAt(yaw);

                if ((!best || cost < best.cost) && room >= OPEN_WAY.room) {
                    best = { yaw, cost };
                }

                // (Of those with about as much room as the most, the one it turns least to)
                if (!roomiest || room > roomiest.room + 0.05 || (room > roomiest.room - 0.05 && cost < roomiest.cost)) {
                    roomiest = { yaw, cost, room: Math.max(room, roomiest?.room ?? 0) };
                }
            }
        }

        const to = best ?? (roomiest && roomiest.room >= here + OPEN_WAY.better ? roomiest : null);

        if (to) {
            follow.recentre(to.yaw, { tilt: false });
        }
    }

    /**
     * Swing the camera round behind the player, the way they face (R, or the player's own mark on
     * the minimap tapped), as if turned by hand: a fight the battle cam framed is let be, as after a
     * drag (#battleFoe).
     */
    recentre() {
        const me = this.avatars.get(this.me);

        if (!me || !this.cameraFollow) {
            return;
        }

        if (this.battleCamOn !== null) {
            this.battleCamLeft.add(this.battleCamOn);
            this.battleCamOn = null;
        }

        // (In a dungeon's level, the player's own tilt and zoom let go of: the space's again)
        if (this.dungeonCamera) {
            Object.assign(this.dungeonCamera, { nudge: 0, zoom: 1 });
        }

        // (The way they face, or are turning to face)
        this.cameraFollow.recentre((this.battle.actor(this.me)?.facing ?? me.facing) + Math.PI);
    }

    #battleFoe(foe, me) {
        if (!foe) {
            this.battleCamOn = null;
            this.battleCamLeft.clear();

            return null;
        }

        if (!this.cameraSettings.battle) {
            return foe;
        }

        if (this.battleCamOn === foe.id && this.cameraFollow.held) {
            this.battleCamLeft.add(foe.id);
            this.battleCamOn = null;
        }

        if (this.battleCamLeft.has(foe.id)) {
            return null;
        }

        if (this.battleCamOn !== foe.id) {
            const seen = this.avatars.get(foe.id);

            this.battleCamOn = seen && this.#inFull(me) && this.#inFull(seen) ? foe.id : null;
        }

        return this.battleCamOn === foe.id ? foe : null;
    }

    // Whether someone (their avatar) is wholly on the screen as the camera looks now (FULL_VIEW):
    // their feet and the tops of their heads, either side of them, all in front of the camera and
    // within the screen
    #inFull(avatar) {
        const camera = this.view.camera;
        const { x, y, z } = avatar.object.position;
        const tall = avatar.character?.height ?? 1.8;
        const wide = Math.max(tall * FULL_VIEW.wide, ((avatar.plan?.length ?? 0) * (avatar.scale ?? 1)) / 2);
        const inside = 1 - FULL_VIEW.edge;

        camera.updateMatrixWorld();
        _across.setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize();

        for (const up of [0, tall]) {
            for (const side of [-wide, wide]) {
                _corner.set(x + _across.x * side, y + up, z + _across.z * side).project(camera);

                if (!(_corner.z < 1 && Math.abs(_corner.x) <= inside && Math.abs(_corner.y) <= inside)) {
                    return false;
                }
            }
        }

        return true;
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

        // (Their talk: their role's, or another's: an adventurer drinking at a guild's table; a
        // stranger met out in the wilds, theirs: core/director.js STRANGERS)
        const stranger = npc ? this.host.strangerOf(npc.id) : null;
        const own = npc && !npc.dead ? treeFor({ ...npc, talk: npc.kind === "follower" ? "follower" : stranger ? (stranger.folk?.talk ?? "bandits") : folk.find(({ id }) => id === npc.id)?.talk }) : null;

        if (!own) {
            return;
        }

        // (A thread's word to ask them, its talk step theirs; or a rumour of theirs that begins one:
        // core/rare.js threadTalk)
        const asker = folk.find(({ id }) => id === npc.id) ?? npc;
        const asked = building && npc.role ? this.#threadAsked(asker, this.#townOf(building), folk.filter((each) => each.map === npc.map && !this.host.hired?.has(each.id)), building.kind === "guild") : null;
        const tree = asked ? threadTalk(own, asked, (text) => text.replace(/\{way\}/g, asked.way ?? "near").replace(/\{place\}/g, asked.place ?? "the village")) : own;

        this.#tradeOver(npc);

        const soldier = npc.kind === "soldier" ? this.#soldierWords(npc) : null;
        const names = {};
        // (One of the townsfolk out in the streets: theirs, and the place they're of)
        const out = !building ? this.host.folk.get(npc.id) : null;
        // (An official's words, and what they ask and do; or a crier's, his news)
        const official = this.#officialOf(npc, building, names) ?? this.#crierOf(npc, out, names);
        const title = soldier?.title ?? folk.find(({ id }) => id === npc.id)?.title ?? out?.title ?? (stranger?.kind === "bandits" ? "Outlaw" : null) ?? ROLES[npc.role]?.title ?? "";
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

        const heardAt = building ?? (out ? { place: out.place === this.world.start?.id ? "home" : out.place } : null);

        Object.assign(names, soldier?.names, official?.words, this.#rumours(heardAt), this.#cultWords(heardAt, npc), this.#guildWords());

        // (An adventurer who could be hired, how strong and for how much (core/host.js hireOffer);
        // a follower waiting or following, and how they're holding up; one of the player's mending
        // at the guild, to send for at a guild's desk: recallOffer)
        const one = folk.find(({ id }) => id === npc.id);
        const hire = one && (one.role === "adventurer" || one.talk === "adventurer") ? this.host.hireOffer(this.me, npc.id) : null;
        const following = npc.kind === "follower" ? this.host.followers.get(npc.id) : null;
        const company = [...this.host.followers.values()].filter(({ leader }) => leader === this.me).length + this.host.mendingOf(this.me).length;
        const recall = one?.role === "receptionist" ? this.host.recallOffer(this.me) : null;

        if (hire) {
            names.hirePrice = String(hire.price);
            names.hireLevel = String(hire.level);
            names.renown = RENOWN.traits[hire.renowned]?.label ?? "";
        }

        if (following) {
            const trust = trustOf(following.record.together);

            Object.assign(names, { level: String(following.level), kills: String(following.record.kills), wounds: String(following.wounds), trustWords: ["You keep paying, I keep swinging.", "You're all right, you know.", "I'd follow you a long way.", "I'd follow you anywhere."][trust] });
        }

        if (recall) {
            names.mending = recall.name;
            names.recallPrice = String(recall.price);
        }

        // (Hungry bandits: the gold they want)
        if (stranger?.toll) {
            names.toll = String(stranger.toll);
        }

        // (A shop with a daily stock: its special today, by name, and what it's asked for, brought to
        // the player's might's level as the shop shows and sells it: core/host.js #buy)
        const stock = this.host.stockOf(npc.id);

        if (stock?.special) {
            const special = atLevel(stock.special, levelOf(this.host.mightFor(this.me)));

            names.special = itemLabel(special).toLowerCase();
            names.specialPrice = String(shopPrice(special, stock.shop, { haggle: this.progress.bonuses().haggle, special: true, times: this.host.shopTimes(npc.id) }));
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
                (stranger ? this.#strangerCheck(stranger, condition) : null) ??
                ("upstairs" in condition
                    ? upstairsIs(condition.upstairs, upstairs)
                    : "stance" in condition
                      ? soldier?.stance === condition.stance
                      : "rumour" in condition
                        ? Boolean(names.rumour1) === condition.rumour
                        : "hell" in condition
                          ? Boolean(names.hellRumour) === condition.hell
                          : "hire" in condition
                            ? Boolean(hire && company < this.host.mostFollowers(this.me)) === condition.hire
                            : "purse" in condition
                              ? (this.progress.gold >= (hire?.price ?? 0)) === condition.purse
                              : "renowned" in condition
                                ? Boolean(hire?.renowned) === condition.renowned
                              : "mending" in condition
                                ? Boolean(recall) === condition.mending
                              : "recallPurse" in condition
                                ? (this.progress.gold >= (recall?.price ?? 0)) === condition.recallPurse
                              : "wounded" in condition
                                ? Boolean(following?.wounds) === condition.wounded
                              : "waiting" in condition
                                ? Boolean(following?.waiting) === condition.waiting
                                : "member" in condition
                                  ? (this.standing.guildRank() !== null) === condition.member
                                  : "special" in condition
                                    ? Boolean(stock?.specialLeft) === condition.special
                                  : official
                                    ? official.check(condition)
                                    : true),
            memory: this.memory[npc.id],
            knowledge: this.knowledge,
            variety: this.talkVariety,
            onEffect: (effect) => {
                // (Work, word of it, the armoury, counsel: an official's, their words filled in from what came of it)
                if (official?.handles(effect)) {
                    official.effect(effect);

                    return;
                }

                // (A hell's cult heard of: in the journal)
                if (effect.heard === "hell") {
                    this.#heardOfCult(heardAt);

                    return;
                }

                // (A healing spell cast on a wounded hunter, as on anyone: the host tells when
                // it's healed them)
                if (effect.tend === "spell") {
                    const spell = this.#healingSpell();
                    const why = spell ? this.#unready(spell) : "unknown";

                    if (why) {
                        this.#castHeard({ ok: false, reason: why });
                    } else {
                        this.#command({ type: "cast", spell, target: npc.id }, (result) => this.#castHeard(result));
                    }

                    return;
                }

                // (What can't be paid for, said; what is, the gold heard counted out)
                this.#command({ type: "effect", effect }, (result) => {
                    if (!result.ok) {
                        this.hud.message(REFUSALS[result.reason] ?? "Can't do that.", 1.6);
                        this.sound?.play(result.reason === "gold" ? "buyDenied" : "denied");
                    } else if (effect.price || effect.pay || effect.toll === "gold") {
                        this.hud.setGold(this.progress.gold);
                        this.onProgress(this.progress);
                        this.sound?.play("coins");
                    } else if (effect.toll === "food" || effect.tend === "draught") {
                        // (Food handed over to hungry bandits; a draught uncorked for a hunter)
                        this.onProgress(this.progress);
                        this.sound?.play(effect.tend ? "potionCork" : "drop");
                    }
                });

                // (Their wares, once the talk's over: their own shop, or their part's, as the host
                // has it)
                const keeps = folk.find(({ id }) => id === npc.id)?.shop ?? out?.shop ?? SHOPKEEPERS[npc.role];

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

    // A crier's talk (docs/GAME.md *The crier*), as an official's is (#officialOf's: { words,
    // check, handles, effect }): the war's news since the player last listened to any crier, as
    // it's cried where he stands, and their own people's wherever it happened (news.js newsSince:
    // what's no longer told them in a box, far off), how much of it there is ({newsCount}), and a
    // few pieces of it at a time ({news}, CRY.page, each `hear` of it: the player's cursor moved on
    // past them, kept with what they've talked of, memory.news); whether there's more ({ news }),
    // and whether the war's gone on past where they last listened ({ rolled }). And what's said of
    // the country round about (#hearsayOf). Null for anyone else, or with no war
    #crierOf(npc, out, names) {
        const war = this.host.war;
        const at = out && this.#crierAt(out);

        if (npc.role !== "crier" || !war || !at) {
            return null;
        }

        const memory = this.memory;
        const { told, rolled } = this.#crierNews(at);
        const hearsay = this.#hearsayOf({ id: out.place, at }, names);
        let heard = 0;

        return {
            words: { newsCount: newsCount(told.length), news: "", hearsay: "" },
            check: (condition) => ("news" in condition ? (heard < told.length) === condition.news : "rolled" in condition ? rolled === condition.rolled : hearsay.check(condition)),
            handles: (effect) => Boolean(effect.hear),
            effect: (effect) => {
                if (effect.hear === "hearsay") {
                    hearsay.tell();

                    return;
                }

                const cried = told.slice(heard, heard + CRY.page);

                heard += cried.length;
                names.news = cried.map(({ words }) => words).join(" ");

                if (cried.length) {
                    memory.news = cried.at(-1).after;
                    this.#keepTalks();
                }
            },
        };
    }

    // What a crier tells of the country round his town (`town`: { id, at }; docs/GAME.md *Rumours
    // of places*): the nearest place there the player's still to find and hasn't heard of
    // (core/rumours.js rumoursNear), as it's said there ({hearsay}: rumourWord), each `tell` of it
    // written in their journal and drawn on their map (memory.heard: { id, town, turn }). The first
    // time he's asked, RUMOURS.first of them; after, one a talk; and none while RUMOURS.open of
    // those he's told of are still to be found. { check (`hearsay`: one to tell; `toldAll`: all
    // he will this talk; `heardAll`: all he will till they've found some), tell }
    #hearsayOf(town, names) {
        const plan = this.world.plan;
        const heard = () => this.memory.heard ?? [];
        const here = heard().filter((one) => one.town === town.id);
        const most = here.length ? 1 : RUMOURS.first;
        const open = () => heard().filter((one) => one.town === town.id && !this.#foundOf(one)).length;
        const next = () => (plan ? (rumoursNear(plan, town.at, this.explored).find(({ id }) => !heard().some((one) => one.id === id)) ?? null) : null);
        let told = 0;
        const can = () => told < most && open() < RUMOURS.open && Boolean(next());

        return {
            check: (condition) =>
                "hearsay" in condition ? can() === condition.hearsay : "toldAll" in condition ? (told >= most) === condition.toldAll : "heardAll" in condition ? (open() >= RUMOURS.open) === condition.heardAll : true,
            tell: () => {
                const place = can() ? next() : null;

                if (!place) {
                    return;
                }

                told++;
                names.hearsay = rumourWord(plan, place, town);
                this.memory.heard = [...heard(), { id: place.id, town: town.id, turn: this.host.war?.turn ?? 0 }];
                this.#keepTalks();
                this.sound?.play("quill");
            },
        };
    }

    // Whether the place a rumour heard is of (memory.heard's: a place's id, core/rumours.js
    // rumouredBy; or a hell's, the plan's site) has been found (Explored knows: the maps' rule)
    #foundOf({ id }) {
        const plan = this.world.plan;
        const place = plan ? (rumouredBy(plan, id) ?? plan.sites.find((site) => site.id === id)) : null;

        return !place || this.explored.knows(place.id, place.at[0], place.at[1]);
    }

    // Where a crier cries the news ([x, y] metres: his place's, `out` his record, host.js folk), and
    // what of it the player's yet to hear there (news.js newsSince: since they last listened to any
    // crier, and their own people's from anywhere)
    #crierAt(out) {
        const plan = this.world.plan;

        return [...(plan?.places ?? []), ...(plan?.sites ?? [])].find(({ id }) => id === out.place)?.at ?? this.world.start?.at ?? null;
    }

    #crierNews(at) {
        return newsSince(this.host.war, at, this.memory.news ?? null, { realm: this.self?.realm });
    }

    // The criers out near the player (docs/GAME.md *The crier*): each one within CALLING.near
    // calling out to them now and then (core/crying.js callOf: "Oyez!" or another of his openings,
    // and the latest news they've yet to hear, else one of the town's own cries), over his head
    // (hud.say), ringing his bell as he does; not while they're talking or fighting. The news
    // they've yet to hear from the nearest, on the compass; and while there's some, his bell rung
    // now and then from where he is, to bring them to him (BELL). Every HEARD_EVERY seconds
    #cryOut() {
        const player = this.battle.actor(this.me);
        const war = this.host.war;
        const now = this.clock;
        const near = (this.battle.actors ?? [])
            .filter((one) => CRIER.test(one.id) && one.map === this.mapId && player && !player.dead && player.map === one.map)
            .map((one) => ({ one, far: Math.hypot(one.x - player.x, one.y - player.y) }))
            .filter(({ far }) => far <= BELL.reach)
            .sort((a, b) => a.far - b.far);
        const nearest = near[0];
        const out = nearest && this.host.folk.get(nearest.one.id);
        const at = out && war ? this.#crierAt(out) : null;
        const unheard = at ? this.#crierNews(at).told : [];

        this.hud.newsUnread(unheard.length);

        if (!nearest || this.talking || this.#fighting(player) || this.#threatened(player)) {
            return;
        }

        const avatar = this.avatars.get(nearest.one.id);

        // (Close enough: he calls out to them)
        if (nearest.far <= CALLING.near && avatar?.object.visible) {
            this.crierCalls ??= new Map();
            this.cryRandom ??= createRandom(Math.floor(Math.random() * 2 ** 31));

            const state = this.crierCalls.get(nearest.one.id) ?? {};
            const invasion = this.host.invasions.find(({ place, broke }) => broke === null && `crier:${place}` === nearest.one.id);
            const call = invasion ? this.#invasionCall(invasion, state, now * 1000) : callOf({ now: now * 1000, state, headline: unheard.at(-1)?.words ?? null, night: torchesLit(elapsedOf(war)), random: this.cryRandom });

            this.crierCalls.set(nearest.one.id, state);

            if (call) {
                const [opening, words] = call.lines;

                this.hud.say(nearest.one.id, `${opening}\n${words}`, 1 + bubbleSeconds(words));
                this.#rest({ id: nearest.one.id, role: "crier", rest: 0 }, avatar);
            }

            return;
        }

        // (Further off, with news for them: his bell, from where he is)
        if (unheard.length && avatar && now >= (this.bellNext ?? 0)) {
            this.bellNext = now + BELL.every;
            this.sound?.play(ROLES.crier.rests[0].sound, { at: avatar.object.position, volume: BELL.volume, far: BELL.reach });
        }
    }

    // A crier's call while an invasion's on at his town, its raiders not beaten off yet: his alarm
    // and his plea to every able hand (core/invasions.js ALARM, criesOf), each time he calls; or
    // null, too soon after his last
    #invasionCall(invasion, state, now) {
        if (now < (state.next ?? -Infinity)) {
            return null;
        }

        state.next = now + CALLING.every[0];

        return { lines: [ALARM, criesOf(invasion.band, invasion.way)[1]], news: false };
    }

    // An invasion (core/invasions.js; host.js #invade). Coming: its soldiers drawn, the raiders'
    // war horn blown where they come out and the town's answering from its line (#invasionHorn),
    // and, at the town the player's in or near, the player told the way the raiders come (in their
    // first, that the raiders leave them be this time till they strike one, and won't next time),
    // the town's crier crying it out (#invasionCry). Charging: the raiders' horn from their line,
    // and the town's answering from its own. Reinforced: those come up drawn. Beaten off: the raiders' horn as they run, the player told, and the crier's
    // thanks; the town's soldiers fallen, the raiders' horn, and told. And the player thanked for
    // the raiders they felled: the gold, the merit and the standing, and, for a good share of them,
    // the lord's thanks, in a panel of its own, the town's horn blown for it: their own purse and a
    // piece from the armoury
    #invasion(event) {
        const band = bandOf(event.band);
        const behemoth = event.band === BEHEMOTH.id;
        const invasion = this.host.invasions.find(({ id }) => id === event.id);
        const me = this.battle.actor(this.me);
        const near = this.progress.invasion.place === event.place || Boolean(invasion && me?.map === "town" && Math.hypot(me.x - invasion.middle[0], me.y - invasion.middle[1]) <= invasion.edge + INVASION.out + INVASION.away);

        switch (event.change) {
            case "charge":
                // (The two lines charging each other: core/host.js #charge)
                this.#invasionHorn("warHorn", event.raiders);
                this.#invasionHorn("townHorn", event.town, HORNS.charge);

                break;
            case "reinforced":
                // (More of either side come up to the fight: core/host.js #reinforceInvasion)
                this.enlisting.push(...event.ids);

                break;
            case "coming":
                this.enlisting.push(...event.ids);

                // (Its horns made now, the first time a raid's heard: the raiders' blown at once,
                // the town's answering, and the retreat when it's beaten off: audio/sound.js makeAhead)
                this.sound?.makeAhead(["warHorn", "townHorn", "retreatHorn"]);

                // (The Behemoth's: its roar heard from afar where it comes out of the rift, twice,
                // in place of the raiders' horn; its voice wanted now, to be heard)
                if (behemoth) {
                    const [ox, oz] = this.originOf("town");
                    const at = new THREE.Vector3(ox + event.at[0], 0, oz + event.at[1]);

                    this.sound?.want(creatureSounds(BEHEMOTH.creature));
                    this.sound?.voice(BEHEMOTH.creature, "call", at, { far: HORNS.far, delay: HORNS.again / 2 });
                    this.sound?.voice(BEHEMOTH.creature, "call", at, { far: HORNS.far, delay: HORNS.again * 1.5 });
                } else {
                    this.#invasionHorn("warHorn", event.at);
                    this.#invasionHorn("warHorn", event.at, HORNS.again);
                }

                if (invasion) {
                    this.#invasionHorn("townHorn", this.#invasionLine(invasion, -INVASION.inside), HORNS.answer);
                }

                if (near) {
                    const spared = event.spared.includes(this.me) ? " This time they'll leave you be, unless you strike one. Next time, they won't." : "";

                    this.hud.message(behemoth ? `${band.label} comes on the ${event.way} road! ${event.name} calls every able hand to its defence.` : `${band.label} on the ${event.way} road! ${event.name} calls every able hand to its defence.${spared}`, 6);
                    this.#invasionCry(event.place, criesOf(event.band, event.way)[0]);
                }

                break;
            case "repelled": {
                // (A band that fights to the last, cut down: no one left to sound the retreat)
                const last = !behemoth && band.rout === 0;

                if (invasion && !last) {
                    this.#invasionHorn("retreatHorn", this.#invasionLine(invasion, INVASION.meet));
                }

                if (near) {
                    this.hud.message(behemoth ? `${band.label} is slain before ${event.name}!` : last ? `The ${band.many} are cut down to the last before ${event.name}!` : `The ${band.many} are beaten back from ${event.name}!`, 4);
                    this.#invasionCry(event.place, thanksOf(event.band));
                }

                break;
            }
            case "fell":
                if (invasion) {
                    this.#invasionHorn("warHorn", this.#invasionLine(invasion, INVASION.meet));
                }

                // (The Behemoth's: what it burns as it goes told with it, #burnt)
                this.fell = behemoth ? event.place : null;

                if (near) {
                    this.hud.message(behemoth ? `${event.name}'s soldiers have fallen. The Behemoth goes back the way it came.` : `${event.name}'s soldiers have fallen. The ${band.many} go back the way they came.`, 4);
                }

                break;
            case "thanks": {
                if (event.player !== this.me) {
                    break;
                }

                const got = [`${event.gold} gold`, ...(event.merit ? [`${event.merit} merit with the guilds`] : []), ...(event.thanks ? [`${event.thanks} standing`] : [])];
                // (The Behemoth's: for the wounds they dealt it, a share of its strength)
                const felled = behemoth ? `${Math.max(1, Math.round((event.felled / Math.max(1, event.of)) * 100))}% of its strength` : `${event.felled} ${event.felled === 1 ? "raider" : band.many}`;

                this.hud.setGold(this.progress.gold);
                this.onProgress(this.progress);
                this.onStanding(this.standing);
                this.sound?.play("coins");

                if (!event.big) {
                    this.hud.message(behemoth ? `${event.name} thanks you for the wounds you dealt the Behemoth, ${felled}: ${got.join(", ")}.` : `${event.name} thanks you for the ${felled} you felled: ${got.join(", ")}.`, 7);
                    break;
                }

                // (A good share of them: the lord's own thanks, the town's horn blown for it)
                const piece = itemLabel(event.piece).toLowerCase();
                const given = `their own purse, ${/^[aeiou]/.test(piece) ? "an" : "a"} ${piece} from the armoury, and ${got.join(", ")}`;

                this.hud.choose(behemoth ? `The lord of ${event.name} thanks you, who dealt the Behemoth of the Rift ${felled}: ${given}.` : `The lord of ${event.name} thanks you, who felled ${felled} of the ${event.of} who came: ${given}.`, [{ label: "With thanks", value: true }], () => {}, { cancel: null, seconds: HORNS.thanks });
                this.sound?.play("townHorn", { delay: 0.4 });
                break;
            }
            default:
                break;
        }
    }

    // Houses burnt by the Behemoth of the Rift as it's turned back from a town, or built again
    // (core/host.js #burn, #burntOn; core/burnt.js): a player in that town told, with the fall
    // if that's what it followed, and its crier crying the fire; and its houses drawn as they are
    // now
    #burnt(event) {
        const me = this.battle.actor(this.me);
        const here = this.progress.invasion.place === event.place || Boolean(event.middle && me?.map === "town" && Math.hypot(me.x - event.middle[0], me.y - event.middle[1]) <= event.edge + INVASION.out + INVASION.away);

        if (event.change === "alight" && here) {
            const count = event.pieces.length;

            this.hud.message(this.fell === event.place ? `${event.name}'s soldiers have fallen. The Behemoth goes back the way it came. ${burntWords(count)}` : burntCry(count, event.way), 6);
            this.#invasionCry(event.place, burntCry(count, event.way), { alarm: false });
        } else if (event.change === "rebuilt" && here) {
            this.hud.message(rebuiltWords(event.name), 4);
        }

        this.fell = null;
        this.#syncBurnt();
    }

    // An invasion's horn (audio/synth.js) blown at a point of the open world's (the battle's
    // metres), `delay` seconds from now, heard as far off as HORNS.far
    #invasionHorn(name, [x, y], delay = 0) {
        const [ox, oz] = this.originOf("town");

        this.sound?.play(name, { at: new THREE.Vector3(ox + x, 0, oz + y), delay, far: HORNS.far });
    }

    // A turn in a battle (core/engagement.js; the "engagement" event: host.js #fight, #jobs,
    // #trophy). The player's own: their job from the commander of the side they fight for (to hold
    // the body of its line nearest them, or bring down the enemy's standard-bearer), and their
    // reward for it done; their bounty and trophy for felling a commander. Near them
    // (BATTLE_TOLD): the lines of a field battle or the armies met charging, each side's horn blown
    // from its line (an invasion's are its own: #invasion); a reserve or a commander's household
    // sent in, its side's horn blown twice where it's going; a commander falling, a standard
    // falling, a body breaking, wheeling onto a flank, falling back and coming on again
    #battleTurn(event) {
        const me = this.battle.actor(this.me);
        const engagement = this.host?.engagements?.().find(({ id }) => id === event.id) ?? null;
        const side = engagement?.sides.find(({ key }) => key === event.side) ?? null;
        const say = (words, seconds = 4) => this.hud.message(words, seconds);

        switch (event.change) {
            case "job":
                if (event.player === this.me) {
                    const part = event.part === "centre" ? "the centre" : `the ${BATTLE_TOLD.parts[event.part] ?? event.part} flank`;

                    say(`${event.by}: "${event.kind === "banner" ? "Bring down their standard-bearer!" : `Hold ${part}!`}"`, 6);
                    this.sound?.play("newsHeard");
                }

                return;
            case "jobDone":
                if (event.player === this.me) {
                    const got = [`${event.gold} gold`, ...(event.merit ? [`${event.merit} merit with the guilds`] : []), ...(event.thanks ? [`${event.thanks} standing`] : [])];

                    say(`${event.kind === "banner" ? "Their standard-bearer is down" : "You held your ground"}, as you were bid: ${got.join(", ")}.`, 6);
                    this.sound?.play("newsHeard");
                }

                return;
            case "trophy":
                if (event.player === this.me) {
                    say(`You felled ${event.name}! A bounty of ${event.gold} gold${event.merit ? `, ${event.merit} merit with the guilds` : ""}, and a trophy: ${itemLabel(event.piece).toLowerCase()}.`, 7);
                    this.sound?.play("newsHeard");
                }

                return;
            default:
                break;
        }

        // (Near the player, out in the world: where it came, the first of its places there is)
        const where = [event.at, event.to, ...(event.anchors ?? [])].find(Array.isArray) ?? null;

        if (!me || !where || me.map !== "town" || Math.hypot(me.x - where[0], me.y - where[1]) > BATTLE_TOLD.near) {
            return;
        }

        // (Whose: the player's enemies' or not, and what they're called; a storm's, by the army's
        // people: host.js #stormCommand)
        const one = side ? [side.commander, ...side.bodies.map(({ formation }) => formation)].map((each) => this.battle.actor(each) ?? this.battle.actors.find((actor) => !actor.dead && actor.formation?.id === each)).find(Boolean) : null;
        const people = side?.people ?? (event.storm ? (this.host?.war?.force(event.side)?.realm ?? null) : null);
        const hostile = one ? this.battle.hostile(one, me) : people ? Boolean(this.host?.war?.hostile(people, this.self?.realm)) : true;
        const invasion = event.invasion ? this.host.invasions.find(({ id }) => id === event.invasion) : null;
        const whose = invasion && side ? (side.key === "invaders" ? `the ${bandOf(invasion.band).many}'` : `${invasion.name}'s`) : `the ${ADJECTIVES[people] ?? people ?? "enemy"}`;
        const Whose = `${whose[0].toUpperCase()}${whose.slice(1)}`;
        const part = BATTLE_TOLD.parts[event.part] ?? event.part;
        const horn = hostile ? "warHorn" : "townHorn";
        const now = this.clock;
        const quiet = now < (this.battleTold ?? -Infinity);
        const told = (words) => {
            if (!quiet) {
                this.battleTold = now + BATTLE_TOLD.every;
                say(words);
            }
        };

        switch (event.change) {
            case "charge":
                // (An invasion's horns its own: #invasion)
                if (!event.invasion && event.anchors?.every(Boolean)) {
                    event.anchors.forEach((at, k) => this.#invasionHorn(k ? "townHorn" : "warHorn", at, k ? HORNS.charge : 0));
                    told("The lines charge!");
                }

                break;
            case "commit":
                this.#invasionHorn(horn, event.to);
                this.#invasionHorn(horn, event.to, HORNS.again);
                told(event.part === "vanguard" && event.commander ? `${this.battle.actor(event.commander)?.name ?? Whose} leads their household in!` : `${Whose} reserve goes in!`);
                break;
            case "commanderFell":
                this.battleTold = now + BATTLE_TOLD.every;
                say(`${event.name || "Their commander"} has fallen! ${Whose} lines are leaderless!`, 5);
                break;
            case "bannerFell":
                told(`${Whose} standard has fallen!`);
                break;
            case "break":
                told(`${Whose} ${part} breaks and runs!`);
                break;
            case "flank":
                told(`${Whose} ${part} wheels onto their flank!`);
                break;
            case "breach":
                this.#invasionHorn(horn, event.to);
                this.#invasionHorn(horn, event.to, HORNS.again);
                told(event.by === "pour" ? `${Whose} ${part} pours through the gap in their line!` : event.part === "vanguard" && event.commander ? `${this.battle.actor(event.commander)?.name ?? Whose} leads their household through the gap!` : `${Whose} reserve goes through the gap!`);
                break;
            case "rear":
                told(`${Whose} ${part} falls on their ${BATTLE_TOLD.parts[event.on] ?? event.on} from behind!`);
                break;
            case "reinforce":
                told(`${Whose} ${part} comes up beside the ${BATTLE_TOLD.parts[event.beside] ?? event.beside}!`);
                break;
            case "fallBack":
                told(`${Whose} archers fall back!`);
                break;
            case "falter":
                told(`${Whose} ${part} falls back!`);
                break;
            case "rally":
                told(`${Whose} ${part} comes on again!`);
                break;
            default:
                break;
        }
    }

    // Where on an invasion's road its lines are, so far out past the town's edge (`out` metres;
    // inside it, less): the town's forming (-INVASION.inside), where they meet (INVASION.meet)
    #invasionLine({ middle, from, edge }, out) {
        const [dx, dy] = [from[0] - middle[0], from[1] - middle[1]];
        const length = Math.hypot(dx, dy) || 1;

        return [middle[0] + (dx / length) * (edge + out), middle[1] + (dy / length) * (edge + out)];
    }

    // Whether an invasion's on round the player, its raiders yet to break (as near as they're
    // told of it: #invasion)
    #invadedHere() {
        const me = this.battle.actor(this.me);

        return Boolean(me?.map === "town") && this.host.invasions.some(({ broke, middle, edge }) => broke === null && Math.hypot(me.x - middle[0], me.y - middle[1]) <= edge + INVASION.out + INVASION.away);
    }

    // A town's crier crying out (an invasion's), if he's out and the player's within his bell's
    // reach (BELL): his words over his head, his bell rung, and his own cries put off a while
    #invasionCry(place, words, { alarm = true } = {}) {
        const crier = this.battle.actor(`crier:${place}`);
        const me = this.battle.actor(this.me);
        const avatar = crier ? this.avatars.get(crier.id) : null;

        if (!crier || !me || crier.map !== me.map || Math.hypot(crier.x - me.x, crier.y - me.y) > BELL.reach) {
            return;
        }

        this.hud.say(crier.id, alarm ? `${ALARM}\n${words}` : words, 1 + bubbleSeconds(words));
        this.crierCalls ??= new Map();
        this.crierCalls.set(crier.id, { ...this.crierCalls.get(crier.id), next: this.clock * 1000 + CALLING.every[0] });

        if (avatar) {
            this.#rest({ id: crier.id, role: "crier", rest: 0 }, avatar);
            this.sound?.play(ROLES.crier.rests[0].sound, { at: avatar.object.position, volume: BELL.volume, far: BELL.reach });
        }
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

    // What's said of the nearest hell's cult where the player's talking (core/cultword.js), as
    // {hellRumour}: which way it is from the town, more of it the nearer; known to the guild's
    // receptionists, the barkeeps and the adventurers, and to one in each CULT_KNOWN of the others
    // who'd say (by who they are and which hell, so the same ones know it every time). None in a
    // world with no hell, nor where it's heard of nowhere
    #cultWords(building, npc) {
        const place = building?.place === "home" ? this.world.start : this.world.plan?.places.find(({ id }) => id === building?.place);
        const near = place && this.world.plan ? cultNear(this.world.plan, place.at) : null;
        const role = this.world.interiors?.of(npc.map)?.folk?.find(({ id }) => id === npc.id)?.role ?? npc.role;
        const knows = (salt) => [...`${npc.id}:${salt}`].reduce((sum, letter) => (sum * 31 + letter.charCodeAt(0)) >>> 0, 7) % CULT_KNOWN === 0;

        if (!near || !(CULT_KNOW.has(role) || knows(near.site.id))) {
            return {};
        }

        return { hellRumour: cultWord(near, place.name, this.talkVariety.next(`hellRumour:${near.band}`, cultWays(near.band))) };
    }

    // The nearest hell's cult heard of where the player's talking (#cultWords'), written in their
    // journal (memory.heard: { id, town, turn, hell: how near it's said to be, cultword.js's band }):
    // near, drawn on their map too; far off, it's hearsay, and not written. Once a town
    #heardOfCult(building) {
        const plan = this.world.plan;
        const place = building?.place === "home" ? this.world.start : plan?.places.find(({ id }) => id === building?.place);
        const near = place && plan ? cultNear(plan, place.at) : null;
        const heard = this.memory.heard ?? [];

        if (!near || near.band === "far" || heard.some((one) => one.id === near.site.id && one.town === place.id)) {
            return;
        }

        this.memory.heard = [...heard, { id: near.site.id, town: place.id, turn: this.host.war?.turn ?? 0, hell: near.band }];
        this.#keepTalks();
        this.sound?.play("quill");
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
                names.reported = !first ? "" : `${first.kind === "message" ? `A letter from ${first.from.townName}? I'll see it read.` : first.kind === "courier" ? `The package from ${first.from.townName}! Seal unbroken, too.` : first.kind === "tithe" ? "The treasury thanks you." : first.kind === "survey" ? "Seen it with your own eyes? Good. That's one less tale." : "Done, and well done."}${handed.length > 1 ? " And the rest besides." : ""}${paid ? ` ${paid} gold, for your trouble.` : ""}`;
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

        // (On an army's camp's walkway, or a stair up to it: its boards)
        return footing(k >= 0 && chunk.bridge[k] === RAISED ? GROUND.planks : ground, { land: map.biomeAt(sx, sz), height: map.heightAt?.(x, z) ?? 0, wet: k >= 0 && Boolean(chunk.water[k]) && !chunk.bridge[k] });
    }

    // One of the wild's footfalls printed on the ground (tracks3d.js): as its feet are (its gait's,
    // or a person's boots or bare feet), where that foot came down beside it, its toes the way
    // it faces, as big as it is
    #printed(actor, avatar, foot, footing) {
        const kind = actor.wild.creature;
        const print = printOf(kind, avatar instanceof BeastAvatar ? avatar.gait : null, { hooves: Boolean(CREATURE_LOOKS[kind]?.hooves) });

        if (!print) {
            return;
        }

        const size = avatar.gait?.size ?? (avatar.character.height ?? 1.75) / 1.75;
        const facing = avatar.facing ?? avatar.object.rotation.y;
        const [across, ahead] = footAt(foot, size);
        const { x, z } = avatar.object.position;

        this.tracks.print(print, x - Math.cos(facing) * across + Math.sin(facing) * ahead, z + Math.sin(facing) * across + Math.cos(facing) * ahead, facing, size, TAKES[footing], this.clock);
    }

    // Someone going up or down the stairs (they're there at once: battle.js cross), heard as a few
    // treads on what's at the stairs' end (`at`, on the player's floor), coming up to it (`coming`)
    // louder and louder, going away quieter and quieter
    // What's heard round the player (audio/ambience.js), worked out every HEARD_EVERY seconds (or
    // `now`, on coming to another map): indoors, the place's beds and how far its hearth is (in a
    // hell, its heart, and where its Hellforge is); out
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
            const far = (at) => (at ? Math.hypot(at.x - me.x, at.z - me.z) : Infinity);

            facts.hearth = far(interior.hearth);
            facts.heart = far(interior.heart);
            facts.forge = interior.forge ? { ...interior.forge, far: far(interior.forge) } : null;
        } else if (overworld?.biomeAt) {
            this.surroundings ??= new Surroundings(overworld);
            facts = { ...facts, ...this.surroundings.at(me.x, me.z, { height: me.y, lights: this.nearLights ?? [], lit: torchesLit(elapsedOf(this.host.war)), works: this.#works() }) };

            // (Whose lands these are, as first claimed, for their music: straight away as the
            // game starts, then once they've been in them LAND_HEARD; in the wild between, it
            // stays as it was)
            const people = overworld.homeAt?.(me.x, me.z) ?? null;
            const first = this.landNear === undefined;

            this.landFor = people === this.landNear ? (this.landFor ?? 0) + HEARD_EVERY : 0;
            this.landNear = people;

            if (people && (first || this.landFor >= LAND_HEARD)) {
                this.sound.setLand(people);
            }
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

    // Someone showing an emote (host.js "emote": a player's, from their wheel or the Action Bar):
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

        // (A zoom being eased in let go of: the distance's the room's, or the one kept for outside;
        // a dungeon's level's camera as its space has it, afresh)
        this.view.zoomTo = null;
        this.dungeonCamera = null;

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

        // (Up from black; or kept dark while the folk of a building gone into before they were
        // all dressed are dressed: #entering)
        this.#curtain(Boolean(this.arriving) && this.world.interiors?.of(actor.map)?.key === this.arriving.visit.key);
        this.arrivedAt = performance.now();
    }

    // The screen black, kept so (`held`), or coming up from it
    #curtain(held) {
        this.curtainHeld = held;

        if (!this.curtain) {
            return;
        }

        this.curtain.style.transition = "none";
        this.curtain.style.opacity = "1";

        if (!held) {
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
        const together = this.host.rules?.rest === "everyone";

        // (Everyone woken together, where everyone rests: each told of their own sleep alone)
        if (!mine && (!passed || together)) {
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

        this.hud.message(passed ? `${who}${how}${long}, ${Math.round(passed / 60000)} minutes gone.` : together ? `You rest${how}.` : `You rest${how}: the time's the host's to pass.`, 3.5);
        this.onWar?.(this.host.war, this.host.legends);
    }

    // A player marked away (core/host.js AFK: no command for a while), or back: "AFK" by their
    // name, while there are others in the world to see it; this player told why, if it's them
    #away({ id, away }) {
        const shown = away && this.host.players.size > 1;

        this.hud.setAway(id, shown);

        if (shown && id === this.me) {
            this.hud.message(id === HOST_PLAYER ? "You're marked away (AFK) till you do something." : "You're marked away (AFK) till you do something. After 30 minutes away you'll be sent out of the world.", 5);
        }
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
            this.aside.delete(id);
        }
    }

    // Of those to be drawn, the one to take the next step of: the colossal (and siege engines)
    // first, then the nearest the player (on their map before any on another), begun if it isn't
    // yet, and none of those put by this frame (waiting on their skins, painted elsewhere). The
    // townsfolk after everyone else, and none of them while a building's being got ready (`busy`),
    // as Wenches and Ale's folk: only there to be seen about, they keep no one waiting, the
    // soldiers and creatures nor a building's folk behind them in the skins worker. { actor,
    // steps }, or null if there's none
    #nextEnlistee(put, busy = false) {
        const me = this.battle.actor(this.me);
        const far = (actor) => (me && actor.map === me.map ? Math.hypot(actor.x - me.x, actor.y - me.y) : Infinity);
        const later = (actor) => this.host.folk.get(actor.id)?.role === "townsfolk";
        let nearest = null;

        // (Those gone, or drawn some other way meanwhile, off the list; and those a dungeon's walls
        // stand between the player and put aside till they don't, the player come to them or
        // they to the player, any begun to be begun again then)
        for (const id of this.aside) {
            const actor = this.battle.actor(id);

            if (!actor || this.avatars.has(id)) {
                this.aside.delete(id);
            } else if (!this.#walledOff(actor, me)) {
                this.aside.delete(id);
                this.enlisting.push(id);
            }
        }

        // (Nor a soldier fallen while it waited its turn: never seen, not dressed only to lie there)
        this.enlisting = this.enlisting.filter((id) => this.battle.actor(id) && !(this.battle.actor(id).kind === "soldier" && this.battle.actor(id).dead) && !this.#drawnInFull(id) && !this.enlistees.has(id));

        for (const { actor } of [...this.enlistees.values()]) {
            if (this.#walledOff(actor, me)) {
                this.enlistees.delete(actor.id);
                this.aside.add(actor.id);
            }
        }

        for (const id of this.enlisting) {
            if (this.#walledOff(this.battle.actor(id), me)) {
                this.aside.add(id);
            }
        }

        this.enlisting = this.enlisting.filter((id) => !this.aside.has(id));

        // (The colossal before anyone: it's seen from far off, and comes for everyone; and a town's
        // siege engines with it, quick to make, each its model at once)
        const colossal = (actor) => Boolean(actor.wild?.colossus || actor.engine);

        for (const actor of [...[...this.enlistees.values()].map(({ actor }) => actor), ...this.enlisting.map((id) => this.battle.actor(id))]) {
            if (put.has(actor.id) || (busy && later(actor))) {
                continue;
            }

            if (!nearest || (colossal(actor) && !colossal(nearest)) || (colossal(actor) === colossal(nearest) && ((later(nearest) && !later(actor)) || (later(nearest) === later(actor) && far(actor) < far(nearest))))) {
                nearest = actor;
            }
        }

        if (nearest && !this.enlistees.has(nearest.id)) {
            this.enlisting = this.enlisting.filter((id) => id !== nearest.id);
            this.enlistees.set(nearest.id, { actor: nearest, steps: new Steps(this.#dressing(nearest), `dressing ${nearest.kind} ${nearest.wild?.creature ?? nearest.id}`) });
        }

        return nearest ? this.enlistees.get(nearest.id) : null;
    }

    // Whether a dungeon's walls stand between the player (`me`) and someone: one on another of its
    // levels, or outside the one the player's down in, or down in one the player isn't. Not
    // dressed till the player comes to them (#nextEnlistee), never seen meanwhile: a level's foes
    // are woken while the player's on the level above (core/host.js #dungeons), and the wild's
    // creatures round a dungeon's way in come and go while the player's below, each a body held
    // (a level's at once, more than a phone had room for). And those out in the world only there
    // to be seen about (#onlySeenAbout: the townsfolk in the streets and a stranger by the road,
    // the soldiers, the wild's creatures), while the player's inside anywhere: they're dressed as
    // the player comes out again (and any held in full let go of meanwhile: #shutIn)
    #walledOff(actor, me) {
        if (!me || actor.map === me.map) {
            return false;
        }

        const interiors = this.world.interiors;

        return interiors?.of(actor.map)?.kind === "dungeon" || interiors?.of(me.map)?.kind === "dungeon" || (this.#onlySeenAbout(actor) && !interiors?.of(actor.map) && Boolean(interiors?.of(me.map)));
    }

    // Every frame, a little more of the buildings being got ready built (the host says which:
    // those near any player, core/host.js); and every so often, the doors of the settlements come
    // to since picked up
    #visit(dt) {
        if (!this.world.interiors) {
            return;
        }

        // (Gone into a building whose folk weren't all dressed: dressed with more of the frame,
        // the screen dark meanwhile)
        this.#entering();

        // (Just come to another map, the screen still coming up from black: more of the frame
        // too, for those there, a level of a dungeon's foes, dressed only now, the nearest first)
        const arriving = performance.now() - this.arrivedAt < FADE_IN * 1000;
        let until = performance.now() + (arriving ? ENTERING.budget : VISITS.budget);
        let busy = false;

        for (const visit of this.visits.values()) {
            this.#doorstep(visit);
            this.#floorsWanted(visit);
            this.#work(visit, until);
            busy ||= Boolean(visit.steps || visit.queue.length);
        }

        this.#fewerFloors();

        if (this.tavernFolk) {
            this.#doorstep(this.tavernFolk);
        }

        // (Then Wenches and Ale's folk, needed only once the player goes in: with any time left,
        // while no other building's being got ready, so that its folk's skins aren't kept waiting
        // behind theirs in the skins worker)
        if (this.tavernFolk && !busy) {
            this.#work(this.tavernFolk, until);
        }

        // The crowds' figures, each made a step at a time, with a share of the time first (world/crowd.js);
        // while soldiers near wait unseen on theirs, more of it (FIGURES.budget: the kinds of those
        // nearest first, #marshal), and those drawn below their own share after
        if (this.crowds?.busy) {
            const me = this.battle.actor(this.me);
            const unseen = Boolean(me) && [...this.crowdWaiting].some((id) => this.#soldiersAbout(me, [this.battle.actor(id)]).length > 0);

            this.crowds.work(unseen ? performance.now() + FIGURES.budget : Math.min(until, performance.now() + VISITS.budget * MARSHAL.share), { wait: this.waits });

            if (unseen) {
                until = Math.max(until, performance.now() + VISITS.budget * (1 - MARSHAL.share));
            }
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

                // (A follower's bar over them, as a creature's is)
                if (actor.kind === "follower") {
                    const me = this.battle.actor(this.me);

                    this.hud.track(actor.id, { ...actor, hostile: Boolean(me) && this.battle.hostile(actor, me) });
                }

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
    // A kind of creature's research gone up a level in the player's bestiary (core/bestiary.js):
    // said and heard, and kept; Mastered, the guild's pay for their notes on it (gold, and merit on
    // their card) with it; the journal shown again if it's open
    #studied({ creature, to, gold = 0, merit = 0 }) {
        const name = CREATURES[creature]?.name ?? creature;

        if (to >= MASTERED) {
            this.hud.message(`${name}: mastered. You know where to strike it now, ${Math.round((RESEARCH.edge - 1) * 100)}% harder. The adventurers' guild pays you ${gold} gold for your notes${merit ? `, and ${merit} merit on your card` : ""}.`, 5);
            this.sound?.play("levelUp");
            this.sound?.play("coins", { delay: 0.4 });
            this.hud.setGold(this.progress.gold);
            this.onStanding(this.standing);
        } else {
            this.hud.message(to === 1 ? `New in your bestiary: ${name}. (J for your journal.)` : `Your bestiary: ${name}, ${RESEARCH.levels[to - 1].name.toLowerCase()} now.`, 3);
            this.sound?.play("quill");
        }

        this.onProgress(this.progress);

        if (this.journal?.open) {
            this.#showJournal();
        }
    }

    #progressed(event) {
        // (Someone else buying from the shop this player's trading with: what it has left, shown)
        if (event.type === "bought" && event.id !== this.me && event.from === this.shopping?.keeper && this.pack?.open) {
            this.#showPack();
        }

        if (event.id !== this.me) {
            return;
        }

        this.#placeBait();

        const actor = this.battle.actor(this.me);

        if (event.type === "rank") {
            const ability = event.ability ? ` You can use ${ABILITIES[event.ability].label.toLowerCase()} now: put it on an action wheel (Game options, Action Wheel and Bar).` : "";

            this.hud.message(`${TREES[event.tree].name}: ${event.title}!${ability}`, ability ? 5 : 3);
            this.sound?.play("levelUp");
        } else if (event.type === "loot") {
            // (What a felled soldier or the town's orc had on them, straight into the pack: rising
            // over the player as what's picked up does, not said across the screen; kept for the
            // journal all the same)
            const things = [event.gold ? `${event.gold} gold` : null, ...event.items.map((item) => itemLabel(item).toLowerCase())].filter(Boolean);

            this.#gained(things, `You find ${things.join(", ")}.`);
            this.sound?.play(event.gold ? "coins" : "pickup");
        } else if (event.type === "picked" && event.bundle) {
            const things = [event.bundle.gold ? `${event.bundle.gold} gold` : null, ...event.bundle.items.map(thingsOf)].filter(Boolean);

            // (Over the player as it's taken, not a message across the screen; but what there was
            // no room for, said)
            this.#gained(things, `You take ${things.join(", ")}.`);

            if (event.full) {
                this.hud.message("There's no room in your pack for the rest: it's still there.", 2.5);
            }

            this.sound?.play(event.bundle.gold ? "coinPickup" : "pickup");

            // (A chest emptied, its lid shut)
            if (event.from === "chest" && !event.left) {
                this.sound?.play("chestClose", { delay: 0.35 });
            }
        } else if (event.type === "picked") {
            this.#gained([thingsOf(event.item)], `You pick up ${thingsOf(event.item)}.`);
            this.sound?.play("pickup");
        } else if (event.type === "spoils" && event.given) {
            this.hud.message("There's no room in your pack: it's at your feet. Tap the sack to take it.", 3);
            this.sound?.play("drop");
        } else if (event.type === "spoils" && event.creature === "convoy") {
            // (Told the first time something's left for the character, never again: #once)
            if (this.#once("spoils")) {
                this.hud.message(`Your share of the convoy's gold lies where it fell. ${SPOILS_HINT}`, SPOILS_TOLD);
            }

            this.sound?.play("coins");
        } else if (event.type === "spoils" && event.creature === "remains") {
            // (One of a dungeon's fallen searched, or a fallen adventurer's out in the wilds: what's
            // left on them, a share for each player near; and now and then a note in their hand of
            // somewhere near, heard tell of: #noteFound)
            this.hud.message(event.find ? "You search the remains of the fallen adventurer: what was left on them is at your feet. Tap it to take it." : "You search the remains of one who fell here: what was left on them is at your feet. Tap it to take it.", 3);
            this.sound?.play("pickup");

            if (event.note) {
                this.#noteFound(event.note);
            }
        } else if (event.type === "spoils" && event.creature === "chest") {
            // (The dead's, an old relic of theirs in it, named; an adventurer's cache: its lock
            // turned, and its lid up)
            // (A dungeon's boss's hoard: a share of it for each player in the dungeon)
            this.hud.message(event.treasure ? (event.away ? "The treasure's dug up: your share waits where it was buried." : "You dig up the treasure: your share of it lies before you. Tap it to take it.") : event.relic ? `The chest's open, and in your share an old relic of theirs: the ${event.relic}. Tap it to take it.` : event.cache ? (event.away ? "The adventurer's cache is open: your share waits at its mark." : "The adventurer's cache is open, your share in it: tap it to take it.") : event.hoard ? "The hoard is open, and your share of it lies before you: tap it to take it." : "The chest's open, your share in it: tap it to take it.", event.relic || event.hoard ? 4 : 3);
            // (A treasure dug up isn't locked: its lid's just lifted)
            if (!event.treasure) {
                this.sound?.play("lockpick");
            }

            this.sound?.play("chestOpen", { delay: event.treasure ? 0 : 0.45 });
        } else if (event.type === "spoils") {
            if (this.#once("spoils")) {
                this.hud.message(`The ${CREATURES[event.creature]?.name.toLowerCase() ?? "creature"} dropped something. ${SPOILS_HINT}`, SPOILS_TOLD);
            }

            this.sound?.play("drop");
        } else if (event.type === "bought" || event.type === "sold") {
            this.sound?.play("coins");
        } else if (event.type === "used" && event.on) {
            // (Given to one of their own: core/host.js #handOver)
            this.hud.message(`You give ${this.battle.actor(event.on)?.name ?? "them"} ${itemLabel(event.item).toLowerCase()}.`, 1.6);
            this.sound?.play(useSound(event.item.id) ?? "tap");
        } else if (event.type === "used" && event.thrown) {
            // (Meat carved from a beast thrown to one, as bait: core/wary.js)
            this.sound?.play("pickup");
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
                shared: `${event.by} shared a request with you: ${request.title}. (J for your journal.)`,
                count: `${request.title}: ${request.count} of ${request.target.need}.`,
                ready: request.kind === "scout" || request.kind === "survey" ? `You've seen enough. ${back}` : `${request.title}: done. ${back}`,
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
            const cue = { taken: "quill", shared: "quill", done: "questDone", failed: "denied" }[change];

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
        return this.remote ? null : this.host.placeOf(this.me);
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
            this.closeParty();
            this.closeReader();
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
            this.closeParty();
            this.closeReader();
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

    /**
     * Open the party menu (or close it, if it's open): those with the player, and what to tell
     * them; on its chat (`chat`, or with lines said there they haven't seen), ready to type.
     */
    toggleParty({ chat = false } = {}) {
        if (this.partyPanel?.open) {
            this.closeParty();
        } else {
            this.closePack();
            this.closeJournal();
            this.closeSpellbook();
            this.closeReader();
            this.partyPanel.showTab(chat || this.chatUnread > 0 ? "chat" : "party");
            this.#showParty();
            this.sound?.play("bookOpen");

            if (this.partyPanel.tab === "chat" && chat) {
                this.partyPanel.input.focus();
            }
        }
    }

    /** Close the party menu. */
    closeParty() {
        this.partyPanel?.hide();
    }

    // The party menu as it is now (and when it was shown: game time, s)
    #showParty() {
        this.partyShownAt = this.clock;
        this.partyPanel.show({
            members: this.#party().filter(({ kind }) => kind !== "player").map(({ id, kind, actor, waiting, left, picture }) => {
                const follower = this.host.followers.get(id);
                const called = this.host.companions.get(id);

                const { guarding, holdFire } = this.host.stance(id);

                return { id, name: actor.name ?? follower?.name ?? "", kind, calling: follower?.calling ?? null, creature: CREATURES[called?.creature]?.name.toLowerCase() ?? null, hp: actor.hp, maxHp: actor.maxHp, waiting, guarding, holdFire, away: actor.map !== this.battle.actor(this.me)?.map, left: left?.ms ?? null, ally: id === this.allyTarget, picture, merc: follower ? this.#mercView(id, follower) : null };
            }),
            mending: this.host.mendingOf(this.me).map((id) => {
                const one = this.host.mending.get(id);

                return { name: one.called ?? one.name, calling: one.calling, level: one.level, price: recallPrice(hirePrice(HIRES[one.calling]?.price ?? 40, one.level, Boolean(one.renowned))) };
            }),
            most: this.host.mostFollowers(this.me),
            ...this.#partyPlayers(),
            chat: this.#chat(),
            world: Boolean(this.onWorldPanel),
        });
    }

    // The party chat as the menu shows it: { lines, unread, canSay }; seen, if it's on its tab
    #chat() {
        if (this.partyPanel?.open && this.partyPanel.tab === "chat" && this.chatUnread) {
            this.chatUnread = 0;
            this.hud.partyUnread(0);
        }

        // (Saying to someone who's gone, or blocked since: to the party again)
        if (this.chatTo && (!this.host.players.has(this.chatTo) || this.isBlocked(this.chatTo))) {
            this.chatTo = null;
        }

        const together = Boolean(this.hosting || this.remote);
        const party = together ? this.host.partyFor(this.me) : null;
        const others = together ? [...this.host.players.values()].filter(({ id }) => id !== this.me && !this.isBlocked(id)) : [];

        return {
            lines: this.chatLines,
            unread: this.chatUnread,
            canSay: Boolean(together && (this.chatTo || party)),
            to: this.chatTo,
            targets: others.map(({ id, hero }) => ({ id, name: hero.name, party: Boolean(party?.members.includes(id)) })).sort((a, b) => b.party - a.party || a.name.localeCompare(b.name)),
        };
    }

    /**
     * A line said in the player's party (core/netplay.js: heard as it's sent on to those in it,
     * their own lines too): into the chat; another's with a chime, and counted unread till it's seen.
     */
    chatHeard({ from, name, text, to = null, toName = "", dm = null }) {
        const mine = from === this.me;

        // (A direct message from someone the player's blocked: let go of, unheard; they're not told)
        if (dm && !mine && this.isBlocked(from)) {
            return;
        }

        // (A direct message by whom it's with: the one it's to, or from)
        const line = dm ? { name: mine ? toName : name, text, mine, dm, with: mine ? to : from } : { name: mine ? "You" : name, text, mine };
        const reading = this.partyPanel?.open && this.partyPanel.tab === "chat";

        this.#chatLine(line);

        if (!mine) {
            this.sound?.play("chatHeard");
            this.chatUnread++;
        }

        this.#chatShown();

        // (And a moment on screen, just above the Action Bar, unless the chat's open to read)
        if (this.chatOnScreen && !reading) {
            this.hud.chatLine({ who: dm ? `${mine ? "To" : "From"} ${line.name}` : line.name, text, mine, dm: Boolean(dm) });
        }
    }

    /** Which direct messages the player takes (Game options: from their party, from anyone else in the world), told to the host. */
    takeDms({ party = true, world = true } = {}) {
        this.dmsTaken = { party, world };
        this.hosting?.takeDms(this.me, this.dmsTaken);
        this.remote?.takeDms(this.dmsTaken);
    }

    /**
     * Who the world knows a player as, for a block (in this world alone): on a world server, the
     * player its tickets know (their id but for which of their heroes it is: "K7Q2MXD4RT");
     * elsewhere their hero's own id (core/guid.js), the same each time they come; else their id.
     */
    whoIs(id) {
        if (this.linkAbout?.kind === "server") {
            return /^([A-Za-z0-9_-]+)\.[1-9]$/.exec(id)?.[1] ?? id;
        }

        const guid = this.host.players.get(id)?.hero?.guid;

        return isGuid(guid) ? guid : id;
    }

    /** Whether a player's blocked (in this world). */
    isBlocked(id) {
        const who = this.whoIs(id);

        return this.blocked.some((one) => one.world === this.worldKey && one.who === who);
    }

    /**
     * Block a player in this world (`on`), or unblock them: their direct messages and party
     * invites let go of from now on, or heard again; kept (onBlocked), and the party menu shown
     * again. (A line being said to them said to the party instead.)
     */
    block(id, on = true) {
        const who = this.whoIs(id);
        const rest = this.blocked.filter((one) => !(one.world === this.worldKey && one.who === who));

        this.blocked = on ? [...rest, { world: this.worldKey, who, name: this.host.players.get(id)?.hero.name ?? "" }] : rest;

        if (on && this.chatTo === id) {
            this.chatTo = null;
        }

        this.onBlocked(this.blocked);
        this.sound?.play("tap");

        if (this.partyPanel?.open) {
            this.#showParty();
        }
    }

    // A direct message begun from the party menu (a player's Message, on the Party or Players
    // tab): its Chat, saying to them, ready to type
    #messageTo(id) {
        this.chatTo = id;
        this.partyPanel.showTab("chat");
        this.#showParty();
        this.partyPanel.input.focus();
    }

    // A line into the chat (the oldest let go past CHAT.kept)
    #chatLine(line) {
        this.chatLines.push({ id: ++this.chatCount, mine: false, system: false, ...line });

        if (this.chatLines.length > CHAT.kept) {
            this.chatLines.splice(0, this.chatLines.length - CHAT.kept);
        }
    }

    // The chat shown as it now is: the menu, if it's open (seen there, if it's on its tab), and
    // the Party button's badge
    #chatShown() {
        if (this.partyPanel?.open) {
            this.#showParty();
        }

        this.hud.partyUnread(this.chatUnread);
    }

    // Something the player says from the party menu's Chat (typed, or a quick phrase): to their
    // party, or, `chatTo` a player, to them alone (a direct message); to the host, which sends it
    // on (the host's own game: core/netplay.js Hosting.chat); said why not, if not
    #sayToParty(text) {
        const to = this.chatTo;
        const said = !to && !this.host.partyFor(this.me) ? { ok: false, reason: "unpartied" } : this.hosting ? this.hosting.chat(text, { to }) : this.remote ? this.remote.chat(text, { to }) : { ok: false, reason: "unpartied" };

        if (said.ok) {
            this.sound?.play("tap");
        } else {
            this.#unsaid(said.reason, said);
        }
    }

    // A line of the player's not said (core/netplay.js CHAT_REFUSED), and why (nothing to say:
    // nothing; to one not taking direct messages, whose they are: `name`)
    #unsaid(reason, { name = "" } = {}) {
        if (reason !== "empty") {
            this.hud.message(reason === "closed" && name ? `${name} isn't taking direct messages.` : (REFUSALS[reason] ?? "That wasn't said."), 1.8);
            this.sound?.play("denied");
        }
    }

    // Playing together, the party of players this one's in (core/host.js partyFor) and the
    // others in the world, for the party menu: { together, players, others, leads, full }
    #partyPlayers() {
        const party = this.host.partyFor(this.me);
        const nameOf = (id) => this.host.players.get(id)?.hero.name ?? "";
        const me = this.battle.actor(this.me);

        return {
            together: this.host.players.size > 1,
            players: (party?.members ?? []).map((id) => ({
                id,
                name: nameOf(id),
                leader: party.leader === id,
                me: id === this.me,
                away: id !== this.me && this.battle.actor(id)?.map !== me?.map,
                colour: partyColour(party.members, id),
                with: id === this.me ? [] : this.host.partyOf(id).map((one) => this.battle.actor(one.id)?.name ?? this.host.followers.get(one.id)?.name ?? "").filter(Boolean),
            })),
            others: [...this.host.players.keys()].filter((id) => id !== this.me && !party?.members.includes(id)).map((id) => ({ id, name: nameOf(id), asked: Boolean(this.host.invitation(id)) })),
            leads: party?.leader === this.me,
            full: (party?.members.length ?? 1) >= PARTY.most,
            partied: Boolean(party),
            everyone: this.#everyone(),
        };
    }

    // Everyone playing in the world, for the party menu's Players tab (partypanel.js show
    // `everyone`): the player first, then the rest of their party (the longest in it first), then
    // everyone else by name; each with their standing and people, how they stand (their party,
    // asked to one, away, resting, fallen, their people at war with the player's, blocked), where
    // they are, and what the player can do about them (ask them to their party, or, leading it,
    // put them out of it; message them; block them, or unblock them)
    #everyone() {
        const host = this.host;
        const mine = host.partyFor(this.me);
        const me = this.battle.actor(this.me);
        const nameOf = (id) => host.players.get(id)?.hero.name ?? "";
        const full = (mine?.members.length ?? 1) >= PARTY.most;
        const order = (id) => (id === this.me ? -1 : mine?.members.includes(id) ? mine.members.indexOf(id) : PARTY.most);

        return [...host.players.values()]
            .sort((a, b) => order(a.id) - order(b.id) || a.hero.name.localeCompare(b.hero.name) || (a.id < b.id ? -1 : 1))
            .map((player) => {
                const { id } = player;
                const actor = this.battle.actor(id);
                const party = host.partyFor(id);
                const asked = host.invitation(id);
                const yours = Boolean(party && party === mine);
                const can = id === this.me ? null : yours ? (mine.leader === this.me ? "dismiss" : null) : party ? null : asked ? "asked" : full ? "full" : "invite";

                return {
                    id,
                    name: player.hero.name,
                    me: id === this.me,
                    title: `${player.standing?.title?.() ?? STANDINGS[0].title}${player.realm ? ` of the ${peopleOf(player.realm)}` : ""}`,
                    where: this.#whereWords(actor, me),
                    party: party ? { yours, leads: party.leader === id, leader: nameOf(party.leader) } : null,
                    asked: asked ? (asked.from === this.me ? "you" : nameOf(asked.from)) : null,
                    away: Boolean(player.away),
                    resting: Boolean(player.resting),
                    dead: Boolean(actor?.dead),
                    hostile: id !== this.me && Boolean(host.war?.hostile(this.self.realm, player.realm)),
                    blocked: id !== this.me && this.isBlocked(id),
                    can,
                };
            });
    }

    // Where someone is, in words (the party menu's Players tab): inside, the floor they're on (or
    // its building); out in the world, the town or named place they're at (within
    // PLAYERS_TAB.near), or the wilds; and, someone else, which way that is from the player and
    // how far (journal.js bearing), unless they're near
    #whereWords(actor, me) {
        if (!actor) {
            return "";
        }

        let place;

        if (actor.map === "town") {
            const named = [...(this.host.war?.towns ?? []), ...(this.world.plan ? placesOf(this.world.plan).filter(({ name }) => name) : [])];
            let nearest = null;
            let best = PLAYERS_TAB.near;

            for (const one of named) {
                const off = Math.hypot(one.at[0] - actor.x, one.at[1] - actor.y);

                if (off <= best) {
                    [nearest, best] = [one, off];
                }
            }

            place = nearest ? `At ${nearest.name}` : "Out in the wilds";
        } else {
            const name = this.world.maps?.[actor.map]?.name ?? this.world.interiors?.of(actor.map)?.name ?? null;

            place = name ? `In ${name.replace(/^The /, "the ")}` : "Indoors";
        }

        if (!me || actor === me) {
            return place;
        }

        const way = bearing(this.#outside(me), this.#outside(actor));

        return way === "here" ? (actor.map === me.map ? `${place} · Near you` : place) : `${place} · ${way}`;
    }

    // What the player does about their party of players, from the party menu (a "party" command:
    // core/host.js); said why not, if not
    #partyOrder(what, who) {
        this.#command({ type: "party", do: what, who }, (result) => {
            if (!result.ok) {
                this.hud.message(REFUSALS[result.reason] ?? "Can't do that.", 1.6);
                this.sound?.play("denied");
            } else {
                this.sound?.play("tap");
            }

            if (this.partyPanel?.open) {
                this.#showParty();
            }
        });
    }

    // Parties of players (core/host.js PARTY): asked to one (Accept, Decline, or Ignore: let go
    // unanswered, the one asking not told; with Refuse party invites on, not even asked), and what
    // comes of asking, and of the party: who joins, leaves, is put out or leads, or that it's no more
    // A treasure map read, its keepers woken, it dug up or given up (core/host.js #treasures): told
    // the player if it's theirs or their party's. Read: where it leads, written in their journal
    // and drawn on their maps (a quill's scratch); woken: who keep it, to those near; dug up by
    // the others, who weren't there for it; given up, theirs
    #treasureEvent(event) {
        const host = this.host;
        const reader = event.id ?? event.owner;
        const ours = reader === this.me || host.fellows(this.me).includes(reader);
        const name = host.players.get(reader)?.hero.name ?? "Someone";
        const map = itemLabel({ id: "treasureMap", quality: event.grade ?? host.treasures.get(event.treasure)?.grade ?? "common" });

        if (!ours) {
            return;
        }

        if (event.change === "marked") {
            const at = this.#whereAmI();
            const where = at ? bearing(at, event.centre) : "";

            this.hud.message(reader === this.me ? `The ${map.toLowerCase()} shows somewhere ${where}: it's marked on your world map, and your party's. Search the circle.` : `${name}'s ${map.toLowerCase()}: where it leads is marked on your world map. Search the circle.`, 4);
            this.sound?.play("quill");
        } else if (event.change === "roused") {
            const treasure = host.treasures.get(event.treasure);
            const me = this.battle.actor(this.me);
            const keepers = CACHE_BANDS[treasure?.band]?.name ?? "brigands";

            if (treasure && me && Math.hypot(me.x - treasure.centre[0], me.y - treasure.centre[1]) <= treasure.radius + TREASURE.rouse * 2) {
                this.hud.message(`Whoever buried it left ${keepers} keeping it. Put them all down to dig it up.`, 4);
            }
        } else if (event.change === "found" && !event.shared.includes(this.me)) {
            this.hud.message(`${event.owner === this.me ? "Your" : `${name}'s`} treasure's been dug up, without you.`, 3);
        } else if (event.change === "abandoned" && reader === this.me) {
            this.hud.message("You give up the hunt: its circle's gone from your maps.", 3);
        }
    }

    // A sign on a trail read (host.js #readSign): what made it, what it is, and which way the trail
    // runs home from it, said, with how many of its home's signs they've read; the last of those,
    // its home tracked, where that is and that it's on their maps. Kept, and in their journal
    // (#trailNotes)
    #signRead({ sign, creature, way, read, again, tracked }) {
        const found = this.world.plan ? signOf(this.world.plan, sign) : null;

        if (!found) {
            return;
        }

        const name = CREATURES[creature]?.name ?? "Something";
        const what = BESTIARY_LORE[creature]?.sign ?? "the marks of something passing";
        const home = homeWords(found.trail.home);
        const where = bearing(this.#whereAmI(), found.trail.home.at);

        if (tracked) {
            this.hud.message(`${name} sign: ${what}. You've tracked it home: ${home}, ${where === "here" ? "close by" : where}. It's marked on your map.`, 5);
            this.sound?.play("pinSet");
        } else if (again || this.explored.tracked.has(found.trail.home.id)) {
            this.hud.message(`${name} sign${again ? ", read before" : `: ${what}`}. The trail runs ${way} from here, toward ${home}${this.explored.tracked.has(found.trail.home.id) ? ", which you've tracked" : ""}.`, 3.5);

            if (!again) {
                this.sound?.play("quill");
            }
        } else {
            this.hud.message(`${name} sign: ${what}. The trail runs ${way} from here, toward ${home} (${read} of ${TRAILS.tracked} signs read).`, 5);
            this.sound?.play("quill");
        }

        this.#explored();

        if (this.journal.open) {
            this.#showJournal();
        }
    }

    // A player's prayed at a shrine (host.js #pray): its god's gift on them, said, with a burst of
    // gold light about them and a healing's warmth heard; and somewhere near it they've still to
    // find, if the god shows them one, written in their journal as what's heard tell of is (a
    // shrine's: memory.heard `shrine`, its god) and circled on their map
    #prayed({ shrine, god, hint = null }) {
        const plan = this.world.plan;
        const { label, does } = GIFTS[god];
        const place = hint && plan ? rumouredBy(plan, hint) : null;
        const avatar = this.avatars.get(this.me);

        this.hud.message(`You kneel at the shrine of ${godWords(god)}. ${label}: ${does}, for half an hour.${place ? ` And as you rise, ${PANTHEON[god].name} shows you something not far off: it's written in your journal.` : ""}`, 6);
        this.sound?.play("healed");

        if (avatar) {
            this.spellFx.appear(avatar.object.position.clone(), "recall");
        }

        if (place && !(this.memory.heard ?? []).some((one) => one.id === place.id)) {
            this.memory.heard = [...(this.memory.heard ?? []), { id: place.id, town: shrine, turn: this.host.war?.turn ?? 0, shrine: god }];
            this.#keepTalks();
        }

        if (this.journal.open) {
            this.#showJournal();
        }
    }

    // A player come into a ring of standing stones' middle (host.js #ringStep): the first time,
    // what moon it wakes under (kept, and in their journal); by night under a new moon, that the
    // stones sleep; under a full moon, the moon roads opened for them to choose (openMoonRoads);
    // by day, that the stones are quiet. A moon road walked is said as it's carried ("carried")
    #ringEvent({ ring: id, phase, first, night, tonight }) {
        const said = [];

        if (first) {
            said.push(`These stones are Lunara's roads: this ring wakes under the ${PHASES[phase]}. It's in your journal.`);
            this.sound?.play("quill");
        }

        if (night && tonight === NEW_MOON) {
            said.push("The stones are cold and still: under the new moon the rings sleep.");
        } else if (night && tonight === FULL_MOON) {
            said.push("The full moon wakes every ring: choose one you've stood in, and the stones carry you there.");
        } else if (!night && !first) {
            said.push(`The stones are quiet by day. This ring wakes under the ${PHASES[phase]}.`);
        }

        if (said.length) {
            this.hud.message(said.join(" "), 5);
        }

        this.#explored();

        if (night && tonight === FULL_MOON) {
            this.openMoonRoads(id);
        }

        if (this.journal.open) {
            this.#showJournal();
        }
    }

    /**
     * Under a full moon, standing in a ring's middle (`here`: its site's id), the moon roads: the
     * world map showing the rings they've stood in (core/rings.js), each with the moon it wakes
     * under; one tapped and agreed to, the stones carry them there with their party in the ring
     * (a "moonroad" command: host.js #moonRoadTo). Returns the rings shown.
     */
    openMoonRoads(here) {
        const plan = this.world.plan;
        const from = plan ? ringOf(plan, here) : null;

        if (!from) {
            return [];
        }

        const rings = ringsOf(plan)
            .filter(({ site }) => this.explored.rings.has(site.id))
            .map((ring) => ({ id: ring.site.id, name: ringName(plan, ring).replace(/^the s/, "The s"), x: ring.at[0], z: ring.at[1], metres: Math.hypot(ring.at[0] - from.at[0], ring.at[1] - from.at[1]), fare: 0, here: ring === from, icon: "stones", note: PHASES[ring.phase] }));

        this.onWorldMap({
            travel: {
                branches: rings,
                gold: 0,
                rank: "",
                off: 0,
                moon: true,
                title: "The moon roads",
                choose: (to) =>
                    this.#command({ type: "moonroad", to }, (result) => {
                        if (!result?.ok) {
                            this.hud.message(REFUSALS[result?.reason] ?? REFUSALS.command, 3);
                        }
                    }),
            },
        });

        return rings;
    }

    // The full moon's trial (host.js #moonTrials): Lunara's guardian woken in a ring, or fallen, said
    // to the player if they're near it (TRIAL.far), with the wake's sound
    #trialEvent({ change, ring: id, title }) {
        const me = this.battle.actor(this.me);
        const ring = this.world.plan ? ringOf(this.world.plan, id) : null;

        if (!ring || !me || me.map !== "town" || Math.hypot(me.x - ring.at[0], me.y - ring.at[1]) > TRIAL.far) {
            return;
        }

        if (change === "woken") {
            this.hud.message(`In ${ringName(this.world.plan, ring)}, ${title}, Lunara's guardian, stands silver in the full moon's light. It keeps a relic of moonsilver.`, 5);
            this.sound?.play("wake");
        } else if (change === "fallen") {
            this.hud.message("Lunara's guardian falls, and its moonsilver is there to take on the flat stone.", 4);
        }
    }

    // The rings of standing stones near the player out in the world, their middles aglow by night
    // while the moon wakes them (not the new moon's: core/rings.js), the one tonight's moon is
    // bound to (or every one, under a full moon) the brighter (world/moongates3d.js)
    #moonlit() {
        const me = this.battle.actor(this.me);
        const plan = this.world.plan;
        const night = daylight(timeOfDay(elapsedOf(this.host.war))) < 0.2;
        const tonight = phaseOfNight(elapsedOf(this.host.war));
        const near = plan && me && me.map === "town" && night && tonight !== NEW_MOON ? ringsOf(plan).filter(({ at }) => Math.hypot(at[0] - me.x, at[1] - me.y) <= MoonGates.SEEN) : [];

        if (near.length || this.moonGates.shown.size) {
            this.moonGates.set(
                near.map((ring) => {
                    const [x, z] = this.world.maps.town?.sites?.placedAt(ring.site) ?? ring.at;

                    return { id: ring.site.id, x, y: this.#groundOn("town", x, z), z, bright: tonight === FULL_MOON || ring.phase === tonight };
                }),
            );
        }

        this.moonGates.update(this.clock);
    }

    #partyEvent(event) {
        if (event.id !== this.me) {
            return;
        }

        if (event.change === "ping") {
            this.#pinged({ who: event.who, name: event.name, at: event.at });

            return;
        }

        if (event.change === "mark") {
            this.#markShared(event);

            return;
        }

        const name = event.name || this.host.players.get(event.who)?.hero.name || "They";
        const mine = event.who === this.me;
        const leader = this.host.players.get(this.host.partyFor(this.me)?.leader)?.hero.name ?? "their";
        const said = {
            sent: `You ask ${name} to join your party.`,
            declined: `${name} says no to your party.`,
            unanswered: `${name} doesn't answer.`,
            joined: mine ? `You join ${leader}'s party.` : `${name} joins the party.`,
            left: mine ? "You leave the party." : `${name} leaves the party.`,
            removed: mine ? "You're put out of the party." : `${name} is put out of the party.`,
            leader: mine ? "You lead the party now." : `${name} leads the party now.`,
            disbanded: "The party's no more: no one's left in it with you.",
        }[event.change];

        // (The party's comings and goings in its chat too, among what's said)
        if (said && ["joined", "left", "removed", "leader", "disbanded"].includes(event.change)) {
            this.#chatLine({ name: "", text: said, system: true });
            this.#chatShown();
        }

        // (Asked by someone the player's blocked: let go unanswered, as with Refuse party invites)
        if (event.change === "invited" && !this.refuseInvites && !this.isBlocked(event.from)) {
            this.sound?.play("wake");
            this.invitePrompt = this.hud.choose(
                `${event.name} asks you to join their party.`,
                [
                    { label: "Accept", value: "accept" },
                    { label: "Decline", value: "decline" },
                ],
                (answer) => {
                    this.invitePrompt = null;

                    // (Ignored: let go, unanswered, as if never seen)
                    if (answer) {
                        this.#partyOrder(answer);
                    }
                },
                { cancel: "Ignore", seconds: Math.max(1, (event.until - this.battle.time) / 1000) },
            );
        } else if (event.change === "lapsed") {
            this.invitePrompt?.withdraw();
        } else if (said) {
            this.hud.message(said, 3);

            if (event.change === "joined") {
                this.sound?.play("wake");
            }
        }

        if (this.partyPanel?.open) {
            this.#showParty();
        }
    }

    // Those with the player still standing (or a hired adventurer knocked down, to be got up:
    // battle.js `downed`), in order: the other players in their party (core/host.js fellows, the
    // longest in it first), then their own (partyOf): { id, kind, actor,
    // waiting, left: a called creature's time left ({ ms, share }) or null, picture: their
    // likeness (an ImageData), or null till it's drawn }
    #party() {
        const player = this.battle.actor(this.me);

        if (!player) {
            return [];
        }

        const fellows = this.host.fellows(this.me).map((id) => ({ id, kind: "player" }));

        return [...fellows, ...this.host.partyOf(this.me)].flatMap(({ id, kind }) => {
            const actor = this.battle.actor(id);
            const called = this.host.companions.get(id);

            if (!actor || (actor.dead && !actor.downed)) {
                return [];
            }

            const lasts = called ? SPELLS[called.risen ? "zombify" : "summon"].lasts : 0;
            const ms = called ? Math.max(0, called.until - this.battle.time) : 0;

            // (A beast tamed: theirs till it falls, no time left to tell)
            return [{ id, kind, actor, waiting: this.host.waiting(id), left: called && !called.tamed ? { ms, share: lasts ? Math.min(1, ms / lasts) : 1 } : null, picture: this.partyLikenesses.get(id) ?? null }];
        });
    }

    // The player's party, an icon each down the left side (hud.js party), each with their
    // likeness, drawn once (view.js portrait) when they're drawn in full (not one of a crowd), the
    // one chosen to help (#chooseAlly) marked, and their names over them in green; the party menu
    // shown again, if it's open, every PARTY_MENU_EVERY
    #partyIcons() {
        const party = this.#party();
        const ids = new Set(party.map(({ id }) => id));

        for (const id of this.partyLikenesses.keys()) {
            if (!ids.has(id)) {
                this.partyLikenesses.delete(id);
            }
        }

        // (Their names and dots in green: theirs, and the other players' in their party and
        // theirs, who have no icon)
        const allied = new Set([...ids, ...this.host.fellows(this.me).flatMap((id) => this.host.partyOf(id).map((one) => one.id))]);

        for (const id of this.allied ?? []) {
            if (!allied.has(id)) {
                this.hud.setAlly(id, false);
            }
        }

        this.allied = allied;

        for (const id of allied) {
            this.hud.setAlly(id, true);
        }

        if (this.allyTarget && !ids.has(this.allyTarget)) {
            this.allyTarget = null;
        }

        const player = this.battle.actor(this.me);

        for (const { id } of party) {
            this.#likeness(this.partyLikenesses, id);
        }

        // (Those no longer drawn, forgotten for drawing their likenesses)
        for (const id of this.likenessSince.keys()) {
            if (!this.avatars.has(id)) {
                this.likenessSince.delete(id);
            }
        }

        // (How many foes are on each of them: Show whom foes are on)
        const foesOn = new Map();

        if (this.showEnmity && player && !player.dead) {
            for (const actor of this.battle.actors) {
                if (!actor.dead && actor.target !== null && ids.has(actor.target) && this.battle.hostile(actor, this.battle.actor(actor.target))) {
                    foesOn.set(actor.target, (foesOn.get(actor.target) ?? 0) + 1);
                }
            }
        }

        this.hud.party(
            player && !player.dead
                ? party.map(({ id, kind, actor, waiting, left, picture }) => ({ id, name: actor.name ?? "", hp: actor.hp, maxHp: actor.maxHp, kind, ally: id === this.allyTarget, waiting, away: actor.map !== player.map, left: left?.share ?? null, picture, leader: kind === "player" && this.host.partyFor(this.me)?.leader === id, colour: kind === "player" ? partyColour(this.host.partyFor(this.me)?.members ?? [], id) : null, foes: foesOn.get(id) ?? 0 }))
                : [],
        );

        if (this.partyPanel?.open && this.clock - (this.partyShownAt ?? -Infinity) >= PARTY_MENU_EVERY) {
            this.#showParty();
        }
    }

    /**
     * A kind of creature's portrait for its page in the bestiary (app/journal.js): one of its kind
     * as the game draws it (beasts/beast.js dressCreature: from its model, once that's read; its
     * stand-in if it can't be in time), holding what it fights with, whole, alone, lit as on a
     * fair day (view.js portrait). Drawn once, and kept for the rest of the game. Resolves with a
     * picture's URL, or null if it couldn't be drawn (and it's tried again next time it's asked).
     */
    portraitOf(kind) {
        if (!this.portraits.has(kind)) {
            this.portraits.set(
                kind,
                this.#portray(kind)
                    .catch(() => null)
                    .then((url) => {
                        if (!url) {
                            this.portraits.delete(kind);
                        }

                        return url;
                    }),
            );
        }

        return this.portraits.get(kind);
    }

    async #portray(kind) {
        const spec = CREATURES[kind];

        if (!spec || !this.kit) {
            return null;
        }

        // (Its model read first, if it's drawn from one: waited for a while)
        if (MODELS[kind] && !modelOf(kind)) {
            await Promise.race([wantModel(kind, "soon"), new Promise((resolve) => setTimeout(resolve, PORTRAIT.patience))]);
        }

        const weapon = WEAPONS[spec.weapon];
        const avatar = dressCreature(this.kit, kind, { seed: 1, equipment: weapon?.equipment ?? [], guard: weapon ? guardOf(spec.weapon) : null });
        const { x, z } = this.view.camera.position;
        const y = this.view.camera.position.y + PORTRAIT.up;

        // (High above the camera, seen by nothing but the portrait's: on no layer of its own;
        // standing as it does at rest, a moment in)
        avatar.place(x, z, 0);

        for (let k = 0; k < 6; k++) {
            avatar.object.position.y = y;
            avatar.update(0.1, x, z, 0);
        }

        avatar.object.position.y = y;
        avatar.object.traverse((node) => node.layers.disableAll());
        this.view.scene.add(avatar.object);
        this.view.upload([avatar.object], { hidden: true });

        try {
            for (let k = 0; k < PORTRAIT.tries; k++) {
                await new Promise((resolve) => setTimeout(resolve, PORTRAIT.after));

                const picture = await this.view.portrait(avatar.object, { facing: 0, whole: true, size: PORTRAIT.size, bright: PORTRAIT.bright, fair: true, fit: PORTRAIT.fit });

                if (picture && !blank(picture)) {
                    const canvas = Object.assign(document.createElement("canvas"), { width: picture.width, height: picture.height });

                    canvas.getContext("2d").putImageData(picture, 0, 0);

                    return canvas.toDataURL("image/png");
                }
            }

            return null;
        } finally {
            avatar.object.removeFromParent();
            avatar.character.dispose();
        }
    }

    // Someone's likeness for their icon (view.js portrait), into `cache` (by id: null while it's
    // drawn, then an ImageData), once they've been drawn in full (not one of a crowd) for
    // LIKENESS_AFTER: drawn the moment they're built, they'd come out blank (the picture all the
    // paperdoll's dark), and any that does is drawn again as long after. Their pictures are sent
    // first if they haven't been (out of the camera's view, they'd be kept hidden: #sending)
    #likeness(cache, id) {
        const avatar = this.avatars.get(id);

        if (cache.has(id) || !avatar || avatar instanceof CrowdAvatar) {
            return;
        }

        if (avatar.sent === false) {
            this.view.upload([avatar.object], { hidden: true });
            avatar.sent = true;
            this.likenessSince.set(id, this.clock);
        }

        if (!this.likenessSince.has(id)) {
            this.likenessSince.set(id, this.clock);
        }

        if (this.clock - this.likenessSince.get(id) < LIKENESS_AFTER) {
            return;
        }

        cache.set(id, null);
        this.view.portrait(avatar.object, { tall: avatar.point(1, _head).y - avatar.object.position.y, facing: avatar.facing, whole: avatar instanceof BeastAvatar }).then((picture) => {
            if (!cache.has(id) || this.avatars.get(id) !== avatar) {
                return;
            }

            if (picture && blank(picture)) {
                cache.delete(id);
                this.likenessSince.set(id, this.clock);
            } else {
                cache.set(id, picture);
            }
        });
    }

    // Whether someone's one of the player's own: a follower of theirs, or a creature they've called or raised
    #ownUnit(id) {
        return [this.host.followers.get(id), this.host.companions.get(id)].some((one) => one?.leader === this.me);
    }

    // The one of their party the player's chosen to help (and still can: standing, where they
    // are), or null
    #ally() {
        const player = this.battle.actor(this.me);
        const ally = this.allyTarget ? this.battle.actor(this.allyTarget) : null;

        return ally && !ally.dead && player && !player.dead && ally.map === player.map ? ally : null;
    }

    // Choose one of the party to help (their heals and wards from the Action Bar go to them,
    // ringed in green), or no one (null): theirs again
    #chooseAlly(id) {
        const was = this.allyTarget;

        this.allyTarget = id;
        this.sound?.play("tap");

        if (id && id !== was) {
            this.hud.message(`Your heals and wards go to ${this.battle.actor(id)?.name ?? "them"}.`, 1.6);
        } else if (!id && was) {
            this.hud.message("Your heals and wards are your own again.", 1.6);
        }

        if (this.partyPanel?.open) {
            this.#showParty();
        }
    }

    // Tell one of the party to follow, wait or go (core/host.js #orderUnit); said why not, if not.
    // Going's for good, so asked first (onAskDismiss), from the party menu or the wheel alike
    #orderUnit(id, order, { sure = false } = {}) {
        if (order === "dismiss" && !sure && this.onAskDismiss) {
            const name = this.battle.actor(id)?.name ?? "them";
            const called = Boolean(this.host.companions?.has(id));

            this.onAskDismiss({ name, note: called ? `${name} will be gone for good, its time with you over.` : `${name} will leave your party and go their own way, for good.`, go: () => this.#orderUnit(id, "dismiss", { sure: true }) });

            return;
        }

        this.#command({ type: "order", unit: id, order }, (result) => {
            if (!result.ok) {
                this.hud.message(REFUSALS[result.reason] ?? "Can't do that.", 1.4);
                this.sound?.play("denied");
            } else if (UNIT_TOLD[order]) {
                this.hud.message(`${this.battle.actor(id)?.name ?? "They"} ${UNIT_TOLD[order]}`, 1.4);
            }

            if (this.partyPanel?.open) {
                this.#showParty();
            }
        });
    }

    // What one of the player's hired adventurers has grown into, as the party menu's More shows it
    // (app/partypanel.js #grown): their level and experience (held at the most the player can lead
    // now: core/host.js capFor), wounds, whether they're down, their trust and its ways to grow,
    // what they wear, what they've done, a veteran's gift, knack and mastery, their renown
    #mercView(id, one) {
        const actor = this.battle.actor(id);
        const next = one.level >= MERCENARY.most ? null : LEVEL_XP[one.level + 1];
        const trust = trustOf(one.record.together);
        const picks = TRUST_PICKS.slice(0, trust).map((pair, rank) => ({ rank, picks: pair.map(({ id: pick, label, about }) => ({ id: pick, label, about, chosen: one.picks.includes(pick) })) }));
        const piece = (item) => (item ? `${itemLabel(item)}${(item.level ?? 1) > 1 ? ` (level ${item.level})` : ""}` : null);
        const { kills, falls, rises, best, earned } = one.record;
        const gift = VETERAN_GIFTS[one.calling];
        const knack = KNACKS[one.calling];
        const mastery = MASTERY[one.calling];
        const renown = RENOWN.traits[one.renowned];

        return {
            name: one.name,
            called: one.called,
            level: one.level,
            xp: one.xp,
            next,
            held: next !== null && one.level >= this.host.capFor(this.me) && one.xp >= next,
            wounds: one.wounds,
            down: Boolean(actor?.dead && actor.downed),
            trust,
            together: one.record.together,
            picks,
            choose: picks.some((rank) => !rank.picks.some(({ chosen }) => chosen)),
            gear: [
                { slot: "mainHand", label: "Weapon", piece: piece(one.gear.mainHand) },
                { slot: "body", label: "Armour", piece: piece(one.gear.body) },
            ],
            record: `Brought down ${kills} foe${kills === 1 ? "" : "s"}${best ? `, the mightiest a ${best.name.toLowerCase()}` : ""}; knocked down ${falls} time${falls === 1 ? "" : "s"}, up again ${rises}; earned ${earned} gold.`,
            gift: gift ? (one.level >= MERCENARY.gift ? `${gift.label}: ${gift.about}` : `At level ${MERCENARY.gift}, ${gift.label.toLowerCase()} for you: ${gift.about}`) : null,
            knack: knack ? (one.level >= knack.level ? `${knack.label}: ${knack.about}` : `At level ${knack.level}, ${knack.label.toLowerCase()}: ${knack.about}`) : null,
            mastery: mastery && one.level >= MERCENARY.mastery ? `${mastery.label}: ${mastery.about}` : null,
            renowned: renown ? `Renowned: ${renown.label}. ${renown.about}` : null,
            renownedName: renown ? "Renowned" : null,
        };
    }

    // A command about one of the player's hired adventurers (their gear, name, trust's ways),
    // refused with why, and the party menu shown again as it is
    #mercCommand(command) {
        this.#command(command, (result) => {
            if (!result.ok) {
                this.hud.message(REFUSALS[result.reason] ?? "Can't do that.", 2);
                this.sound?.play("denied");
            }

            if (this.partyPanel?.open) {
                this.#showParty();
            }
        });
    }

    /** Whether the player may change this world's rules (core/host.js "rule": its host's player, or an owner). */
    mayRule() {
        return this.me === HOST_PLAYER || this.host.players.get(this.me)?.role === "owner";
    }

    /** Whether this world's mercenaries can die (core/host.js RULES mortal), as the world's host says. */
    setMortal(on) {
        this.#command({ type: "rule", rule: "mortal", value: Boolean(on) }, (result) => {
            if (!result.ok) {
                this.hud.message(REFUSALS[result.reason] ?? "Can't do that.", 2);
            }
        });
    }

    // The player's followers kept with their character, and their roll (core/host.js characterOf)
    #keepFollowers() {
        const character = this.host.characterOf(this.host.players.get(this.me));

        this.onFollowers(character.followers, character.roll);
    }

    // A word from one of the player's hired adventurers over their head (core/followers.js BARKS:
    // `kind`'s), with chatter on (Game options), each kind of word from each of them at most once
    // a BARK_EVERY, and from any of them once a BARK_GAP
    #bark(id, kind, names = {}) {
        const lines = BARKS[kind];
        const now = this.clock;
        const key = `${id}:${kind}`;

        if (!this.chatter || !lines || !this.battle.actor(id) || now - (this.barked.get(key) ?? -Infinity) < BARK_EVERY || now - (this.barked.get("any") ?? -Infinity) < BARK_GAP) {
            return;
        }

        const words = lines[Math.floor(Math.random() * lines.length)].replace(/\{(\w+)\}/g, (all, name) => names[name] ?? all);

        this.barked.set(key, now);
        this.barked.set("any", now);
        this.hud.say(id, words, 1 + bubbleSeconds(words));
    }

    // What's come of one of the player's hired adventurers, told (core/host.js "follower" events):
    // in a line, a sound for some, a word from them for some (#bark); drawn as they are, and kept
    // with the character
    #followerNews(event) {
        const name = event.name;
        const plain = name.split(",")[0];
        const wounds = `${event.wounds} wound${event.wounds === 1 ? "" : "s"}`;
        const leader = { leader: this.hero.name, byname: event.byname ?? "" };
        const words = {
            joined: event.back ? null : `${name} follows you now${event.level > 1 ? `, at level ${event.level}` : ""}.`,
            fallen: `${name} has fallen, for good.`,
            dismissed: `${name} goes their own way.`,
            levelled: `${name} is level ${event.level} now.${event.level === MERCENARY.gift && event.gift ? ` A veteran: ${event.gift.toLowerCase()} for you while they're on their feet.` : ""}`,
            byname: `They're calling ${plain} ${event.byname} now.`,
            trusted: `${name} trusts you more: choose how they grow (party menu, More).`,
            down: `${name} is down (${wounds})! Stand by them, heal them, or give them a draught.`,
            up: `${name} is back on their feet.`,
            home: event.why === "lost" ? `${name} is left behind: they'll wait for you at the guild.` : `${name} can't go on, and goes home to mend. Send for them at any guild's desk.`,
            recalled: `${name} is back at your side, mended (${event.price} gold).`,
            outfitted: event.item ? `${name} wears what you gave them.` : `You take back what ${name} wore.`,
            renamed: `You call them ${name} now.`,
            picked: `${name} will grow as you chose.`,
            mended: `One of ${name}'s wounds is mended (${wounds} left).`,
            rested: `${name} is rested, their wounds mended.`,
        }[event.change];

        if (words) {
            this.hud.message(words, event.change === "down" || event.change === "home" ? 4 : 3);
        }

        this.hud.setGold(this.progress.gold);

        // (Hired or sent for, paid in gold; fallen, mourned as the player would be; grown, as the
        // player's skills grow)
        const sound = { joined: event.back ? null : "coins", recalled: "coins", fallen: "fallen", levelled: "levelUp", byname: "levelUp", trusted: "levelUp" }[event.change];

        if (sound) {
            this.sound?.play(sound);
        }

        const bark = { down: "down", up: "up", levelled: "level", byname: "byname", trusted: "trust" }[event.change];

        if (bark) {
            this.#bark(event.follower, bark, leader);
        }

        this.#mirror();

        // (Kept with the character)
        this.#keepFollowers();

        if (this.partyPanel?.open) {
            this.#showParty();
        }
    }

    // One of the party's icons tapped or held (hud.js onPartyMember; `time`: ms, as
    // performance.now()): held, the wheel opened at it (what to tell them, then, turned over, the
    // player's healing and wards for them), steered by the finger still down; tapped twice in
    // quick succession, running to them (and choosing them to help); tapped once, choosing them to
    // help, or, tapped on the one chosen, no one
    #memberPressed(id, gesture, { time, x, y, pointerId }) {
        const player = this.battle.actor(this.me);
        const member = this.battle.actor(id);
        const last = this.lastMemberTap;

        this.lastMemberTap = gesture === "tap" ? { id, time } : null;

        if (!player || player.dead || !member || member.dead) {
            return;
        }

        if (gesture === "hold") {
            this.#openMemberWheel(id, x, y, pointerId);
        } else if (last?.id === id && time - last.time <= DOUBLE_TAP_MS) {
            this.lastMemberTap = null;

            if (this.allyTarget !== id) {
                this.#chooseAlly(id);
            }

            this.#endTalk();
            this.approaching = null;
            this.#command({ type: "approach", target: id, run: true });
        } else {
            this.#chooseAlly(this.allyTarget === id ? null : id);
        }
    }

    // The wheel opened on one of the party's icons, under the finger (`x`, `y`), held by the
    // pointer `pointerId`: steered as it moves, closed as it's lifted
    #openMemberWheel(id, x, y, pointerId) {
        if (this.wheel?.open || pointerId === null) {
            return;
        }

        const own = this.#ownUnit(id);
        const pointer = { x, y, wheel: { originX: x, originY: y, target: id, kind: own ? "unit" : "ally", side: 0, refused: null, done: false } };
        const mine = (event) => event.pointerId === pointerId;
        const move = (event) => {
            if (mine(event)) {
                pointer.x = event.clientX;
                pointer.y = event.clientY;
                this.#steerWheel(pointer);
            }
        };
        const up = (event) => {
            if (mine(event)) {
                letGo();

                if (!pointer.wheel.done) {
                    this.#closeWheel();
                }
            }
        };
        const letGo = () => {
            document.removeEventListener("pointermove", move);
            document.removeEventListener("pointerup", up);
            document.removeEventListener("pointercancel", up);
            this.memberWheel = null;
        };

        this.memberWheel?.();
        this.memberWheel = letGo;
        document.addEventListener("pointermove", move);
        document.addEventListener("pointerup", up);
        document.addEventListener("pointercancel", up);
        this.#showWheel(pointer.wheel, x, y);
        this.sound?.play("wheel");
        globalThis.navigator?.vibrate?.(12);
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
                    shared: request.shared ?? null,
                };
            }),
            // (In a party with other players: each request to share with them)
            party: this.host.fellows(this.me).length > 0,
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
                .map(([id, one]) => {
                    const actor = this.battle.actor(id);

                    return { name: calledBy(one), calling: one.calling, level: one.level ?? 1, hp: actor?.hp ?? 0, maxHp: actor?.maxHp ?? 1, waiting: one.waiting, down: Boolean(actor?.dead && actor.downed) };
                }),
            // (Those mending at the guilds, and the roll of those who've left them: core/host.js)
            mending: this.host.mendingOf(this.me).map((id) => {
                const one = this.host.mending.get(id);

                return { name: calledBy(one), calling: one.calling, level: one.level ?? 1 };
            }),
            roll: this.host.players.get(this.me)?.roll ?? [],
            most: this.host.mostFollowers(this.me),
            heard: this.#heardTell(at),
            trails: this.#trailNotes(at),
            moonRoads: this.#moonNotes(at),
            legends: this.#legendNotes(at),
            // (The treasures they're hunting: their own to give up, their party's shown)
            treasures: this.host.treasuresOf(this.me).map(({ id, grade, owner, name, centre }) => ({ id, title: itemLabel({ id: "treasureMap", quality: grade }), from: owner === this.me ? "Your map" : `${name}'s map`, where: at ? bearing(at, centre) : "", grade, own: owner === this.me })),
            writings: (this.memory.writings ?? []).filter((id) => WRITINGS[id]).map((id) => ({ id, title: WRITINGS[id].title, found: WRITINGS[id].found })),
            bestiary: { ...bestiaryOf(this.progress.bestiary.kinds), portraitOf: (kind) => this.portraitOf(kind) },
            messages: this.messages,
        });
    }

    // A request shared with the player's party (the journal's Share: host.js #shareRequest): who
    // had it, and who didn't and why (SHARE_SKIPPED), told; the journal shown again
    #requestShared(result) {
        if (!result?.ok) {
            this.hud.message(REFUSALS[result?.reason] ?? "Can't do that.", 2);

            return;
        }

        const names = (list) => (list.length > 1 ? `${list.slice(0, -1).join(", ")} and ${list.at(-1)}` : (list[0] ?? ""));
        const given = result.shared.length ? `Shared with ${names(result.shared.map(({ name }) => name))}.` : "None of your party could take it.";
        const not = result.skipped.map(({ name, why }) => `${name} ${SHARE_SKIPPED[why] ?? SHARE_SKIPPED.has}.`);

        this.hud.message([given, ...not].join(" "), 4);

        if (result.shared.length) {
            this.sound?.play("quill");
        }

        if (this.journal.open) {
            this.#showJournal();
        }
    }

    // What the player's heard tell of (memory.heard: from the criers, core/rumours.js; of the
    // hells' cults, core/cultword.js), for the journal: [{ words (as it was said), from (who
    // said it, where), where (which way and how far it is from them now, roughly: the middle of its
    // circle, journal.js bearing), found }], those still to find first, the newest first; and of
    // those found, the last few
    #heardTell(at) {
        const plan = this.world.plan;

        if (!plan) {
            return [];
        }

        const towns = [...plan.places, ...plan.sites];
        const told = [...(this.memory.heard ?? [])].reverse().flatMap((one) => {
            const town = towns.find(({ id }) => id === one.town);
            const place = one.hell ? plan.sites.find(({ id }) => id === one.id) : rumouredBy(plan, one.id);

            if (!town || !place) {
                return [];
            }

            // (Shown by a shrine's god as they prayed: core/shrines.js; the shrine its "town")
            const words = one.hell ? cultWord(cultNear(plan, town.at), town.name) : rumourWord(plan, place, town, one.shrine ? { from: "the shrine" } : {});
            const found = this.#foundOf(one);
            const circle = !one.hell || one.hell === "near" ? circleOf(place.id, place.at) : null;
            const from = one.hell ? `Said in ${town.name}` : one.shrine ? `Shown at the shrine of ${PANTHEON[one.shrine]?.name ?? "a god"}` : one.note ? "A fallen adventurer's note" : one.hunter ? "A hunter you healed" : `The crier in ${town.name}`;

            return [{ words, from, where: circle && at && !found ? `About ${bearing(at, circle.at)}` : "", found }];
        });

        return [...told.filter(({ found }) => !found), ...told.filter(({ found }) => found).slice(0, HEARD_FOUND)];
    }

    // The world's legends (core/rare.js), for the journal: { notes: [{ title, state, words, where }]
    // (the rare encounters out that they or their party have seen, the world's threads still to
    // follow (each's next step, and where), then those overcome in this world, the latest first, by
    // whom and where, and the threads followed to their end), uniques: [{ name, about }] (those
    // their character's been given, kept with them into every world: progress.legends) }
    #legendNotes(at) {
        const names = (list) => (list.length > 1 ? `${list.slice(0, -1).join(", ")} and ${list.at(-1)}` : (list[0] ?? ""));
        const titleOf = (card) => cardOf(card)?.title ?? "Something rare";
        const out = [...this.raresSeen.values()].map(({ card, at: seen, map }) => ({ title: titleOf(card), state: map === "town" ? "Out there" : "Below ground", words: cardOf(card)?.word ?? "", where: at && map === "town" ? `Seen ${bearing(at, seen)}` : "" }));
        const met = [...(this.host.legends?.done ?? [])]
            .filter(({ how }) => how === "done")
            .reverse()
            .map(({ card, by, at: where, map }) => ({ title: titleOf(card), state: "Overcome", words: by.length ? `Overcome by ${names(by)}${cardOf(card)?.kind === "unique" ? ": it won't come again." : "."}` : "Overcome.", where: at && where && (map ?? "town") === "town" ? bearing(at, where) : "" }));
        const uniques = (this.progress.legends?.uniques ?? []).map((id) => UNIQUES[id]).filter(Boolean).map(({ name, about }) => ({ name, about }));
        // (The world's threads: what's next of each, and where, theirs to give up; those they've
        // given up, who'll take them back on it and where; those at an end, that they are)
        const threads = Object.entries(this.host.legends?.threads ?? {}).map(([id, thread]) => {
            const def = this.host.legends.stepOf(id);
            const title = THREADS[id]?.title ?? "A thread";

            if (!thread.done && this.host.legends.gaveUp?.(id, this.me)) {
                const back = this.#takenBackBy(id);

                return { title, state: "Given up", words: back.words, where: at && back.at ? `${back.name}, ${bearing(at, back.at)}` : "", thread: null };
            }

            // (Its card kept where they fell to it: there, and that it waits for them still)
            const fell = def?.kind === "card" && thread.place && (thread.fell ?? []).includes(this.me);
            const town = thread.town ? this.world.plan?.places.find((place) => place.id === thread.town) : null;
            const where = ((def?.kind === "place" || def?.kind === "lock" || def?.kind === "fight" || def?.mark) && thread.place) || fell ? thread.place : town?.at;

            return {
                title,
                state: thread.done ? "Its end" : `Step ${thread.step + 1} of ${THREADS[id]?.steps.length ?? thread.step + 1}`,
                words: thread.done ? (thread.by.length ? `Followed to its end by ${names(thread.by)}.` : "Followed to its end.") : `${this.#threadWordsOf(id)}${fell ? " You fell to it there, and it waits for you there still." : ""}`,
                where: !thread.done && at && where ? `${town && def?.kind !== "place" && !def?.mark && !fell ? `${town.name}, ` : ""}${bearing(at, where)}` : "",
                thread: thread.done ? null : id,
            };
        });

        return { notes: [...out, ...threads.filter(({ state }) => state !== "Its end"), ...met, ...threads.filter(({ state }) => state === "Its end")], uniques };
    }

    // The trails the player's read signs on (core/tracks.js; Explored signs), a note for each home
    // they lead to, for the journal: [{ title ("Wolf trail"), words (how many of its signs they've
    // read and which way the last ran, or that they've tracked it home), where (which way and how
    // far that sign is from them now, or its home), tracked }], those still to follow first, the
    // latest read first
    #trailNotes(at) {
        const plan = this.world.plan;
        const homes = new Map();

        if (!plan) {
            return [];
        }

        for (const id of this.explored.signs) {
            const found = signOf(plan, id);

            if (found) {
                const read = (homes.get(found.trail.home.id)?.read ?? 0) + 1;

                homes.delete(found.trail.home.id);
                homes.set(found.trail.home.id, { last: found, read });
            }
        }

        const notes = [...homes.values()].reverse().map(({ last: { trail, sign }, read }) => {
            const name = CREATURES[this.host.trailCreatureOf(this.me, trail)]?.name ?? "Something";
            const tracked = this.explored.tracked.has(trail.home.id);
            const home = homeWords(trail.home);

            return tracked
                ? { title: `${name} trail`, words: `Tracked home to ${home}: it's marked on your map.`, where: at ? `About ${bearing(at, trail.home.at)}` : "", tracked }
                : { title: `${name} trail`, words: `${read} of ${TRAILS.tracked} signs read. The last ran ${sign.way}, toward ${home}.`, where: at ? `Last sign about ${bearing(at, sign.at)}` : "", tracked };
        });

        return [...notes.filter(({ tracked }) => !tracked), ...notes.filter(({ tracked }) => tracked)];
    }

    // The rings of standing stones the player's stood in (core/rings.js; Explored rings), for the
    // journal: { tonight (tonight's moon, or the coming night's), rings: [{ name, phase (the moon it
    // wakes under), where (which way and how far it is from them), tonight (it wakes tonight) }] },
    // the nearest first; or null, if they've stood in none
    #moonNotes(at) {
        const plan = this.world.plan;

        if (!plan || !this.explored.rings.size) {
            return null;
        }

        const tonight = phaseOfNight(elapsedOf(this.host.war));
        const trial = tonight === FULL_MOON ? trialOf(plan, nightOf(elapsedOf(this.host.war))) : null;
        const far = (ring) => (at ? Math.hypot(ring.at[0] - at[0], ring.at[1] - at[1]) : 0);
        const rings = ringsOf(plan)
            .filter(({ site }) => this.explored.rings.has(site.id))
            .sort((a, b) => far(a) - far(b))
            .map((ring) => ({ name: ringName(plan, ring).replace(/^the s/, "The s"), phase: PHASES[ring.phase], where: at ? bearing(at, ring.at) : "", tonight: tonight === FULL_MOON || ring.phase === tonight }));

        // (Under a full moon, where Lunara's guardian keeps its moonsilver tonight: core/rings.js TRIAL)
        return { tonight: PHASES[tonight], rings, ...(trial?.ring ? { trial: `Tonight ${trial.guardian.title}, Lunara's guardian, keeps ${ringName(plan, trial.ring)}${at ? `, ${bearing(at, trial.ring.at)}` : ""}, and a relic of moonsilver with it.` } : {}) };
    }

    // Whether the character's yet to be told something told only once (`what`: "spoils", the first
    // time a fight leaves them something): true the first time, kept from then on (save.js saveTold)
    #once(what) {
        if (this.toldOnce.has(what)) {
            return false;
        }

        this.toldOnce.add(what);
        this.onTold([...this.toldOnce]);

        return true;
    }

    // What the player's picked up, or found on a foe they felled (`things`, in words), rising over
    // them rather than said across the screen in the middle of a fight; `said` kept for the journal
    // all the same
    #gained(things, said) {
        this.hud.damage(this.#screenAbove(this.me), `+${things.join(", ")}`, { kind: "loot" });
        this.#told(said, 2.5);
    }

    // A message told the player across the screen (hud.js message): kept for the journal if it's
    // news (journal.js keepMessage), and shown there at once if it's open on them
    #told(text, seconds) {
        const kept = keepMessage(this.messages, text, seconds, Date.now());

        if (kept !== this.messages) {
            this.messages = kept;
            this.onMessages(kept);

            if (this.journal?.open && this.journal.view === "messages") {
                this.#showJournal();
            }
        }
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
     * The world as it now is, set right after it went astray, or fell too far behind the host's
     * to catch up (docs/WAR.md M11: a joined game's copy, sent again): everyone in it drawn as
     * they now are, and the buildings got ready that weren't. What happened meanwhile wasn't
     * played here, so wasn't seen: anyone who died is seen falling now, and anyone who came back
     * to life getting up; and the player's taken to the map they're on, if it's another.
     */
    rehost() {
        this.battle = this.host.battle;

        for (const actor of this.battle.actors) {
            const avatar = this.avatars.get(actor.id);

            if (!avatar) {
                continue;
            }

            // (Drawn going there from where they were, as their bodies follow where they are
            // (world/avatar.js): unless that's further than it's drawn closing up to, when
            // they're put straight there (CLOSE_UP))
            const [ox, oz] = this.originOf(actor.map);
            const { x, z } = avatar.object.position;

            if (Math.hypot(x - ox - actor.x, z - oz - actor.y) > CLOSE_UP) {
                this.#place(actor);
            } else {
                this.previous.set(actor.id, { x: actor.x, y: actor.y });
            }

            if (actor.kind === "fort" || actor.kind === "stakes") {
                continue;
            }

            if (actor.dead && !avatar.actions.fall && !avatar.actions.tossed?.dead) {
                avatar.lands = avatar.actions.die() ?? FALL_LANDS;
                avatar.deadFor = 0;
            } else if (!actor.dead && (avatar.actions.fall || avatar.actions.tossed?.dead)) {
                avatar.actions.revive();
                avatar.deadFor = 0;
            }
        }

        const me = this.battle.actor(this.me);

        if (me && me.map !== this.mapId) {
            this.#arrive(me);
        }

        // (The soldiers and wagons, and the folk out in the world, not a building's, not drawn:
        // drawn now, nearest first; but not one waiting on its kind's figure in the crowds, to be
        // drawn there (#marshal), not dressed in full meanwhile, nor one fallen unseen)
        for (const actor of this.battle.actors) {
            const out = !actor.dead && (actor.kind === "soldier" || actor.kind === "wagon" || (actor.kind === "folk" && !this.world.interiors?.of(actor.map)));

            if (out && !this.avatars.has(actor.id) && !this.enlisting.includes(actor.id) && !this.enlistees.has(actor.id) && !this.crowdWaiting.has(actor.id)) {
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
            this.closeParty();
            this.closeReader();
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

            return { ...stack, label, about: aboutOf(stack), use: def.use ? (def.tome || def.scroll || def.map ? "Read" : def.oil ? "Apply" : def.bomb || def.bait ? "Throw" : stack.id === "meal" || def.food ? "Eat" : "Drink") : null, aimed: Boolean(def.use?.cast || def.use?.bomb || def.use?.bait), toss: Boolean(def.food), equip: def.slot ? (def.slot === "mainHand" ? "Wield" : "Wear") : null, takes: def.slot ?? null, price: priceOf(stack, { haggle, selling: true }), wanted: !stack.unique && (!this.shopping || buys(this.shopping.shop, stack.id)), bound: Boolean(stack.unique), info: def.slot || def.charm ? describe(stack, progress, { index, label, haggle }) : null, giveTo: stack.unique ? [] : this.#wearers(stack) };
        });
        const me = this.battle.actor(this.me);
        const might = this.host.mightFor(this.me);
        const summed = totals(progress, { hp: me ? me.maxHp - progress.bonuses().hp : 50, stamina: me ? me.maxStamina - progress.bonuses().stamina : 50, might });
        // (A shop's wares by kind, the commoner made first: a blacksmith's as well made as the
        // player's mighty; a shop with a daily stock's, what it has in today, how many of each left,
        // and its daily special, as it is; what it won't buy, said; what one is, worked out as it's
        // looked at: a piece of gear's with what's rolled on it as it's bought)
        const stock = this.shopping && this.host.stockOf(this.shopping.keeper);
        // (Its prices as the world's changes have them: a thread's festival, core/rare.js)
        const times = this.shopping ? this.host.shopTimes(this.shopping.keeper) : 1;
        const ask = (item, special = false) => shopPrice(item, this.shopping.shop, { haggle, special, times });
        // (Made for their might as they're bought: core/host.js #buy)
        const level = levelOf(might);
        const special = stock?.special ? atLevel(stock.special, level) : null;
        const shop = this.shopping && {
            name: this.shopping.name,
            wares: (stock ? stock.wares : [...wares(this.shopping.shop, this.shopping.people, { tier: mightTier(might) }), ...this.host.threadWaresOf(this.shopping.keeper)])
                .sort(shopOrder)
                .map((ware) => {
                    const item = { id: ware.id, quality: ware.quality, ...(ware.people ? { people: ware.people } : {}), ...(level > 1 && (ITEMS[ware.id]?.slot || ITEMS[ware.id]?.charm) ? { level } : {}) };
                    const price = ask(item);

                    return { item, label: itemLabel(item), price, affordable: price <= progress.gold, kind: WARE_KINDS[wareKind(item.id)], left: ware.left ?? null };
                }),
            special: special
                ? {
                      item: special,
                      label: itemLabel(special),
                      price: ask(special, true),
                      affordable: ask(special, true) <= progress.gold,
                      left: stock.specialLeft,
                      about: aboutOf(special),
                      info: ITEMS[special.id]?.slot || ITEMS[special.id]?.charm ? describe(special, progress, { label: itemLabel(special), haggle }) : null,
                  }
                : null,
            unwanted: this.shopping.shop === "guild" ? null : "They buy only their own line: the adventurers' guild buys everything.",
            preview: (item) => ({ about: aboutOf(item), info: ITEMS[item.id]?.slot || ITEMS[item.id]?.charm ? describe(item, progress, { label: itemLabel(item), haggle, ware: true }) : null }),
        };

        const trade = this.#tradeNow();
        const other = trade && (trade.from === this.me ? trade.to : trade.from);
        // (What each offers, each thing with what it is: gear as if it were carried)
        const offer = (side) => ({
            gold: side?.gold ?? 0,
            items: (side?.items ?? []).map((item) => ({ ...item, label: itemLabel(item), about: aboutOf(item), info: ITEMS[item.id]?.slot || ITEMS[item.id]?.charm ? describe(item, progress, { label: itemLabel(item), haggle, outside: true }) : null })),
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
    // The player's hired adventurers who could wear a piece of gear from their pack (core/followers.js
    // wearable: a weapon of their calling's, or body armour, made for no mightier than them), on
    // their feet: [{ id, name }] (the pack's Give to: the "outfit" command)
    #wearers(stack) {
        return [...this.host.followers]
            .filter(([id, one]) => one.leader === this.me && !this.battle.actor(id)?.dead && !wearable(stack, { weapon: HIRES[one.calling]?.weapon, level: one.level }))
            .map(([id]) => ({ id, name: this.battle.actor(id)?.name ?? "them" }));
    }

    #packCommand(asked) {
        const command = asked.type === "buy" ? { ...asked, from: this.shopping?.keeper } : asked.type === "sell" ? { ...asked, to: this.shopping?.keeper } : asked;
        const worn = asked.type === "equip" || asked.type === "outfit" ? this.progress.pack[asked.index] : asked.type === "unequip" ? this.progress.gear[asked.slot] : null;

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
    // A wary beast warning someone off (core/wary.js: its display, WARNINGS): a blow at nothing or
    // one of its ways of resting, its warning heard; warning the player, the ground round it
    // pulsing amber
    #warned(event, avatar) {
        const warning = WARNINGS[event.display] ?? WARNINGS.snarl;
        const actor = this.battle.actor(event.id);
        const at = avatar.object.position.clone();

        if (warning.attack) {
            avatar.actions.startAttack(warning.attack, { hitAt: 0.45, duration: 0.9, arms: true, reach: null });
        } else {
            avatar.rest?.(warning.rest, 1.6);
        }

        if (warning.sound === "call") {
            this.sound?.voice(this.#voiced(actor, avatar), "call", at);
        } else {
            this.sound?.play(warning.sound, { at });
        }

        if (event.target === this.me) {
            this.effects.pulse(at.x, at.z, 0xffa040);
        }
    }

    // A wary beast minded about the player (core/wary.js): said how, if they know its kind well
    // enough (MINDS_KNOWN), once for its pack and the mood
    #minded({ id, pack, kind, by }) {
        const actor = this.battle.actor(id);
        const creature = actor?.wild?.creature;
        const known = creature && (this.progress.bestiary?.levelOf(creature) ?? 0) >= MINDS_KNOWN;
        const key = `${pack}:${kind}`;
        const said = kind === "watch" && WARY[creature]?.predator ? MINDS.stalk : MINDS[kind];

        if (by !== this.me || !known || !said || this.mindsTold.has(key)) {
            return;
        }

        this.mindsTold.add(key);
        this.hud.message(said(CREATURES[creature].name.toLowerCase()), 4);
    }

    // An ambush (core/ambush.js), for a player near it (AMBUSH_TOLD): its tell as they come on
    // (TELLS: said, heard and seen); sprung (SPRUNG: its band out of cover, leaves kicked up where
    // they were, the dead rising out of the earth, a snare drawn tight round whoever stepped in
    // it), or caught out
    #ambushed(event) {
        const mine = this.battle.actor(this.me);

        if (!event.at || !mine || mine.map !== "town" || Math.hypot(mine.x - event.at[0], mine.y - event.at[1]) > AMBUSH_TOLD) {
            return;
        }

        const [ox, oz] = this.originOf("town");
        const place = (x, y, up = 0) => new THREE.Vector3(ox + x, this.#groundOn("town", x, y) + up, oz + y);
        const band = (event.ids ?? []).map((id) => this.battle.actor(id)).filter((actor) => actor && !actor.dead);

        if (event.change === "told") {
            const tell = TELLS[event.tell];
            const one = band.find((actor) => actor.hidden) ?? band[0];
            const at = tell.over || !one ? place(event.at[0], event.at[1], 6) : place(one.x, one.y, 1);

            this.hud.message(tell.said, 4);

            if (tell.sound) {
                this.sound?.play(tell.sound, { at });
            }

            if (tell.burst) {
                this.effects.burst(tell.burst, at);
            }

            return;
        }

        if (event.change !== "sprung" && event.change !== "caught") {
            return;
        }

        this.hud.message(event.change === "caught" ? "You've caught them out! They're reeling." : SPRUNG[event.style], 3);
        this.sound?.play("ambushSprung", { at: place(event.at[0], event.at[1]) });

        for (const actor of band) {
            const at = place(actor.x, actor.y);

            if (event.style === "dead" && event.change === "sprung") {
                this.ambushProps.hands(at.x, at.z, at.y, this.battle.time / 1000);
                this.effects.burst("earth", at);
                this.sound?.play("earthBreak", { at });
            } else {
                this.effects.burst(event.style === "spiders" ? "earth" : "leaves", at);
            }
        }

        const snared = event.snared ? this.battle.actor(event.snared) : null;

        if (snared && snared.map === "town") {
            const at = place(snared.x, snared.y);

            this.ambushProps.snare(at.x, at.z, at.y, this.battle.time / 1000, AMBUSH_SNARE_SECONDS);
            this.sound?.play("snareSnap", { at });

            if (snared.id === this.me) {
                this.hud.damage(this.#screenAbove(snared.id), "Snared!", { kind: "stun" });
            }
        }
    }

    // A rare encounter (core/rare.js; host.js "rare"): seen by the player (its sting where it is,
    // its word, its mark on the maps), or by one of their party (where, told, and marked); ended:
    // overcome (to those who took part, and to those who'd seen it, who did it; a unique's that it
    // won't come again), or gone (to those who'd seen it); its reward given them, or not again.
    // The world's legends kept as they change (playing alone: save.js saveWorld)
    #rareTold(event) {
        const card = cardOf(event.card);
        const unique = card?.kind === "unique";
        const title = card?.title ?? "Something rare";
        const named = title.replace(/^The /, "the ");
        const mine = this.battle.actor(this.me);
        const fellows = new Set(this.host.fellows?.(this.me) ?? []);
        const names = (list) => (list.length > 1 ? `${list.slice(0, -1).join(", ")} and ${list.at(-1)}` : (list[0] ?? ""));
        const saw = this.raresSeen.has(event.n) || (event.told ?? []).includes(this.me);

        switch (event.change) {
            case "seen": {
                if (event.id !== this.me && !fellows.has(event.id)) {
                    break;
                }

                const first = !this.raresSeen.has(event.n);
                // (Out in the wilds, or on one of a dungeon's floors: core/rare.js venues)
                const map = event.map ?? "town";

                this.raresSeen.set(event.n, { n: event.n, card: event.card, at: [...event.at], map });

                if (event.id === this.me) {
                    const [ox, oz] = this.originOf(map);
                    const at = new THREE.Vector3(ox + event.at[0], (map === "town" ? this.#groundOn("town", event.at[0], event.at[1]) : 0) + 1, oz + event.at[1]);

                    this.hud.message(card?.word ?? "Something waits ahead that has no business being there.", 5);
                    this.sound?.play("rareSting", { at });
                } else if (first) {
                    const who = this.battle.actor(event.id)?.name ?? "One of your party";
                    const way = map !== "town" ? " below ground" : mine?.map === "town" ? ` to the ${compass([mine.x, mine.y], event.at)}` : "";

                    this.hud.message(`${who} has seen something strange${way}.`, 4);
                    this.sound?.play("rareSting");
                }

                break;
            }
            case "done": {
                const took = (event.took ?? []).includes(this.me);
                const by = event.by ?? [];

                this.raresSeen.delete(event.n);

                // (Its foe's last words, if it has any (core/rare.js RARE_CARDS `last`: the Orc
                // King's), said first to those who took part)
                if (took && card?.last) {
                    this.hud.message(card.last, LAST_WORDS);
                    this.sound?.play("rareDone");
                    this.#after(LAST_WORDS, () => this.hud.message(`You've overcome ${named}${unique ? ". It won't come again." : "."}`, 5));
                } else if (took) {
                    this.hud.message(`You've overcome ${named}${unique ? ". It won't come again." : "."}`, 5);
                    this.sound?.play("rareDone");
                } else if (saw && by.length) {
                    this.hud.message(`${names(by)} ${by.length > 1 ? "have" : "has"} overcome ${named}${unique ? ": it won't come again" : ""}.`, 4);
                }

                break;
            }
            case "failed":
            case "passed":
                this.raresSeen.delete(event.n);

                if (saw) {
                    this.hud.message(`${title} is gone from here. It may yet be met again.`, 4);
                }

                break;
            case "given":
                // (Its reward: a unique, bound to them, and its gold in their purse)
                if (event.id === this.me) {
                    const purse = event.gold ? `${event.gold} gold` : null;

                    if (event.item) {
                        this.hud.message(`${event.item.name ?? "A unique"} is yours: found nowhere else, and bound to you.${purse ? ` And ${purse}.` : ""}`, 5);
                    } else if (purse) {
                        this.hud.message(`${cardOf(event.card)?.title ?? "Something rare"}: ${purse}.`, 4);
                    }

                    if (purse) {
                        this.hud.setGold(this.progress.gold);
                        this.sound?.play("coins");
                    }

                    this.onProgress(this.progress);
                }

                break;
            case "had":
                if (event.id === this.me) {
                    this.hud.message(`You've had ${UNIQUES[event.unique]?.name ?? "its reward"} already: it's given only once.`, 4);
                }

                break;
        }

        if (!this.remote) {
            this.onWar(this.host.war, this.host.legends);
        }
    }

    // A sealed room a rare encounter inside brings (core/rare.js VAULT; host.js "vault"): made, its
    // floor drawn (with the dungeon's, if they're drawn) and its door; its ward broken or its key
    // dropped, said to those who took part, and its door on the floor shown; opened by its key, its
    // keepers fallen, its chest opened, said to those there. The world's legends kept as it changes
    #vaultTold(event) {
        const me = this.battle.actor(this.me);
        const mine = (event.took ?? []).includes(this.me);
        const room = (n) => Object.values(this.host.legends?.vaults ?? {}).find((one) => one.n === n);
        const inRoom = (n) => me && room(n) && me.map === `${room(n).floor}/vault-${n}`;

        switch (event.change) {
            case "made": {
                const visit = this.visits.get(event.building);

                if (visit && !visit.bare) {
                    visit.queue.push(() => this.#furnishing(visit, event.map));
                }

                this.doors?.sync();
                this.vaultDoors?.sync();

                break;
            }
            case "warded":
                if (mine) {
                    this.hud.message("A ward breaks as it falls: a sealed door's open in the rock nearby.", 5);
                    this.sound?.play("chainBroken");
                }

                break;
            case "keyed":
                if (mine) {
                    this.hud.message("It drops a key as it falls, and a sealed door shows in the rock nearby.", 5);
                    this.sound?.play("drop");
                }

                break;
            case "opened":
                if (event.id === this.me) {
                    this.hud.message("The key turns in the seal, and crumbles: the way's open.", 4);
                    this.sound?.play("chainBroken");
                }

                break;
            case "cleared":
                if (inRoom(event.n)) {
                    this.hud.message("Its keepers are down. The chest is yours to open.", 4);
                }

                break;
        }

        if (!this.remote) {
            this.onWar(this.host.war, this.host.legends);
        }
    }

    // A thread's talk step for one of the folk (`one`: their role, their calling, core/rare.js
    // talksFor; in the settlement `town`, `hall` the folk with them): { thread, step } of the first
    // thread at one that's theirs; or a rumour of theirs that begins one (rare.js OPENERS, openerOf:
    // its card in play, the thread not begun), { thread, step: null, way (which way its place is
    // from here) }; or, first, a thread the player gave up that they'd take them back on (rare.js
    // keeperOf: its rumour's teller at its home's guild, else a guild's receptionist: `guild`, this
    // is one), { thread, back: true }; or null
    #threadAsked(one, town, hall, guild = false) {
        const legends = this.host.legends;

        for (const [id, thread] of Object.entries(legends?.threads ?? {})) {
            const keeper = keeperOf(id);

            if (!thread.done && legends.gaveUp?.(id, this.me) && talksFor(keeper, one, hall) && (keeper.home ? thread.home === town : guild)) {
                return { thread: id, back: true };
            }
        }

        for (const [id, thread] of Object.entries(legends?.threads ?? {})) {
            const def = legends.stepOf(id);

            if (def?.kind === "talk" && talksFor(def, one, hall) && thread.town === town) {
                return { thread: id, step: thread.step };
            }
        }

        for (const id of Object.keys(THREADS)) {
            const opener = legends?.opening?.(id) ? openerOf(this.world.plan, id) : null;

            if (opener && opener.town.id === town && talksFor(THREADS[id].opens, one, hall)) {
                return { thread: id, step: null, way: compass(opener.town.at, opener.site.at), place: opener.site.name ?? null };
            }
        }

        return null;
    }

    // Who'll take the player back on a thread they gave up (core/rare.js keeperOf), in words, and
    // where: { words, name (its settlement's), at } (at null: any guild's)
    #takenBackBy(id) {
        const keeper = keeperOf(id);
        const home = keeper.home ? this.world.plan?.places.find((place) => place.id === this.host.legends?.threads[id]?.home) : null;

        if (home) {
            return { words: `The ${keeper.calling ?? keeper.role} at the guild in ${home.name} who told you of it will take you back on it, where it stood.`, name: home.name, at: home.at };
        }

        return { words: "The receptionist at any guild will take you back on it, where it stood.", name: null, at: null };
    }

    // A thread's step's words, filled in as it is now (core/rare.js threadWords): its settlement's
    // name, and which way it is from where the thread was last
    #threadWordsOf(id) {
        const thread = this.host.legends?.threads[id];
        const def = this.host.legends?.stepOf(id);

        if (!thread || !def) {
            return "";
        }

        const town = thread.town ? this.world.plan?.places.find((place) => place.id === thread.town) : null;
        // (Which way: to a place, a lock's way in, or where a card kept at a site is, its tracks
        // leading there; else to its settlement)
        const to = def.kind === "place" || def.kind === "lock" || def.kind === "fight" || (def.kind === "card" && thread.place) ? thread.place : town?.at;
        // (A lock's place, by its name: core/rare.js LOCKS, lockSite)
        const site = def.kind === "lock" && LOCKS[def.lock] ? lockSite(this.world.plan, LOCKS[def.lock], this.world.seed ?? 1) : null;

        return threadWords(def.word, { town: town?.name, way: to ? compass(thread.at, to) : "near", place: site ? (site.name ?? `the ${site.kind}`) : undefined });
    }

    // A thread (core/rare.js THREADS; host.js "thread"): begun, or a step of it done, told to those
    // who took part (what's next, and that it's in their journal); its reward given them, and a
    // writing kept as read; a festival cried to those in its settlement. The world's legends kept
    // as they change (playing alone)
    #threadTold(event) {
        const title = THREADS[event.thread]?.title ?? "A thread";
        const mine = (event.ids ?? []).includes(this.me);

        switch (event.change) {
            case "left":
                // (Given up: who'll take them back on it, and where)
                if (event.id === this.me) {
                    this.hud.message(`You've given up ${title}. ${this.#takenBackBy(event.thread).words}`, 6);
                }

                break;
            case "back":
                if (event.id === this.me) {
                    this.hud.message(`${title}: yours again. ${this.#threadWordsOf(event.thread)}`, 6);
                    this.sound?.play("quill");
                }

                break;
            case "fell":
                // (Fallen to its card: where it waits marked for them)
                if (event.id === this.me) {
                    this.hud.message(`${title}: where you fell to it is on your map. It waits for you there.`, 6);
                }

                break;
            case "begun":
            case "step":
                if (mine) {
                    const next = this.#threadWordsOf(event.thread);

                    this.hud.message(event.change === "begun" ? `A thread: ${title}. ${next}` : `${title}: ${next}`, 6);
                    this.sound?.play("quill");
                }

                break;
            case "done":
                if (mine) {
                    this.hud.message(`${title}: its end. It's told in your journal.`, 5);
                    this.sound?.play("rareDone");
                }

                break;
            case "given":
                if (event.id === this.me) {
                    const what = [event.gold ? `${event.gold} gold` : null, event.item?.name ?? null].filter(Boolean);

                    if (what.length) {
                        this.hud.message(`For ${title}: ${what.join(" and ")}.`, 4);
                        this.hud.setGold(this.progress.gold);
                        this.sound?.play("coins");
                    }

                    if (event.had) {
                        this.hud.message(`You've had ${UNIQUES[event.had]?.name ?? "its reward"} already: it's given only once.`, 4);
                    }

                    // (A writing given: read again in the journal, app/reader.js)
                    if (event.writing && !(this.memory.writings ?? []).includes(event.writing)) {
                        this.memory.writings = [...(this.memory.writings ?? []), event.writing];
                        this.#keepTalks();
                    }

                    this.onProgress(this.progress);
                }

                break;
            case "festival": {
                const town = this.world.plan?.places.find((place) => place.id === event.town);

                if (town && this.#townOfMe() === event.town) {
                    this.hud.message(`${town.name} holds ${event.name}! Its shops' prices are down for the day.`, 5);
                    this.sound?.play("townHorn");
                }

                break;
            }
        }

        if (this.journal?.open) {
            this.#showJournal();
        }

        if (!this.remote) {
            this.onWar(this.host.war, this.host.legends);
        }
    }

    // The settlement the player's in or near (out in its streets, or in one of its buildings), or null
    #townOfMe() {
        const building = this.mapId !== "town" ? this.world.interiors?.of(this.mapId) : null;

        if (building) {
            return this.#townOf(building);
        }

        const me = this.battle.actor(this.me);
        const places = this.world.plan?.places ?? [];
        const near = me ? places.find((place) => Math.hypot(place.at[0] - me.x, place.at[1] - me.y) < 350) : null;

        return near?.id ?? null;
    }

    // The wild's ways, a frame (core/wary.js, core/ambush.js): those lying hidden in an ambush not
    // drawn at all, those glimpsed in their cover drawn faintly (as one unseen is); a wary beast's
    // mood marked on its plate; hunting beasts' eyes shining out in the dark, beyond the light;
    // bait in the air and lying on the ground; an ambush's signs (the turned earth, the webs)
    #wildWays() {
        const battle = this.battle;
        const mine = battle.actor(this.me);
        const [ox, oz] = this.originOf(this.mapId);
        const groundAt = (x, z) => this.#groundOn(this.mapId, x - ox, z - oz);

        for (const actor of battle.actors) {
            const avatar = this.avatars.get(actor.id);
            const was = this.lyingDrawn.get(actor.id) ?? null;
            const now = actor.hidden === true ? "hidden" : actor.hidden === "glimpsed" ? "glimpsed" : null;

            if (avatar && now === "hidden") {
                avatar.object.visible = false;
            }

            if (!avatar || now === was) {
                continue;
            }

            if (was === "glimpsed") {
                this.#unseen(avatar, false);
            }

            if (now === "glimpsed") {
                this.#unseen(avatar, true);
            }

            if (now !== "hidden") {
                avatar.object.visible = !avatar.compiling && avatar.sent !== false;
            }

            if (now) {
                this.lyingDrawn.set(actor.id, now);
            } else {
                this.lyingDrawn.delete(actor.id);
            }
        }

        // (One lying in wait gone, let go with its ambush: forgotten)
        for (const id of this.lyingDrawn.keys()) {
            if (!battle.actor(id)) {
                this.lyingDrawn.delete(id);
            }
        }

        // (A mood marked on the plate of each wary beast tracked: core/wary.js MOODS; one whose plate's
        // gone, forgotten, to be marked afresh on a plate made for it again)
        for (const id of this.moodsShown.keys()) {
            if (!this.hud.tracked.has(id)) {
                this.moodsShown.delete(id);
            }
        }

        for (const id of this.hud.tracked.keys()) {
            const actor = battle.actor(id);
            const mood = actor?.wild?.reacts && !actor.dead ? (actor.mood?.kind ?? null) : null;

            if ((this.moodsShown.get(id) ?? null) !== mood) {
                this.moodsShown.set(id, mood);
                this.hud.mood(id, mood, { hunts: Boolean(WARY[actor?.wild?.creature]?.predator) });
            }
        }

        this.#tauntMarks();

        // (Eyes in the dark: a hunting beast's, out beyond the light, at night)
        const light = daylight(timeOfDay(elapsedOf(this.host.war)));
        const lit = this.mapId === battle.lightMap ? battle.light : null;
        const eyes = [];

        if (mine && this.mapId === "town" && light < WILD_LOOK.eyes.dark) {
            for (const actor of battle.actors) {
                const avatar = this.avatars.get(actor.id);

                if (!avatar?.object.visible || actor.dead || actor.hidden || actor.map !== this.mapId || !WARY[actor.wild?.creature]?.predator || actor.wild.companion || Math.hypot(actor.x - mine.x, actor.y - mine.y) > WILD_LOOK.eyes.far || (lit && sightAt(lit, actor.square) > lit.sky + 0.02)) {
                    continue;
                }

                const head = avatar.point(0.8, _eyes);
                const reach = (avatar.gait?.size ?? 1) * 0.45;

                eyes.push({ x: head.x + Math.sin(actor.facing) * reach, y: head.y, z: head.z + Math.cos(actor.facing) * reach, facing: actor.facing, glow: Math.min(1, (WILD_LOOK.eyes.dark - light) / WILD_LOOK.eyes.dark + 0.2) });
            }
        }

        this.eyeShine.show(eyes);

        // (Bait in the air and on the ground, on the map shown)
        const baits = battle.baits.filter(({ map }) => map === this.mapId).map((bait) => ({ ...bait, x: ox + bait.x, y: oz + bait.y, from: bait.from ? [ox + bait.from[0], oz + bait.from[1]] : null }));

        this.baitLook.set(baits, battle.time, groundAt);

        // (An ambush's signs near the player, till it springs: the dead's turned earth, the spiders' webs)
        const laid = mine && this.mapId === "town" ? [...(this.host.ambushes?.values() ?? [])].filter((one) => !one.sprung && (one.style === "dead" || one.style === "spiders") && Math.hypot(one.heart[0] - mine.x, one.heart[1] - mine.y) <= AMBUSH_SIGNS).map((one) => ({ id: one.id, style: one.style, x: ox + one.heart[0], z: oz + one.heart[1] })) : [];

        this.ambushProps.set(laid, groundAt);
        this.ambushProps.update(battle.time / 1000);
    }

    // Bait for the wild's beasts (core/wary.js) carried for the first time: put on the first free
    // slice of an enemy's wheel of itself (unless it's on one, or the Action Bar, already), and told
    // how to throw it; once for each kind, ever (the wheels' `placed`), so it can be moved, or taken
    // off, in Game options and stay so
    #placeBait() {
        for (const id of PLACED_OF_ITSELF) {
            if (this.wheels.placed.includes(id) || !this.progress.held(id)) {
                continue;
            }

            const key = `item:${id}`;
            const on = this.wheels.quick.includes(key) || this.wheels.enemy.some((side) => PLACES.some((place) => side[place] === key));
            const side = on ? -1 : this.wheels.enemy.findIndex((slots) => PLACES.some((place) => !slots[place]));

            this.wheels.placed = [...this.wheels.placed, id];

            if (side >= 0) {
                const place = PLACES.find((each) => !this.wheels.enemy[side][each]);

                this.wheels.enemy[side][place] = key;
                this.hud.message(`${itemLabel({ id })} is on an enemy's wheel ${side ? "two" : "one"}, at ${place.toUpperCase()}: hold on a beast and throw it to them.`, 4.5);
            }

            this.setWheels(this.wheels);
        }
    }

    #putOnWheel(key, wheel = "self") {
        // (A spell's scroll by its own name, not its spell's: "Scroll of Fireball")
        const action = actionOf(key);
        const label = ITEMS[action?.item]?.use?.cast ? itemLabel({ id: action.item }) : (action?.label ?? itemLabel({ id: key.slice(5) }));
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

        this.hud.message(`${wheel === "self" ? "Your own" : "An enemy's"} wheels are full: change them in Game options, Action Wheel and Bar, Action wheels.`, 3.5);
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

        this.#snag(me);
    }

    /**
     * What auto-snag takes (Game options, Auto-snag: { grades, kinds }, host.js SNAG_GRADES,
     * SNAG_KINDS): only things as rare as these and of these kinds. Changed, what it's left is
     * looked at again.
     */
    set snagFilter(only) {
        this.snagOnly = snagChoice(only);
        this.snagTried.clear();
    }

    get snagFilter() {
        return this.snagOnly;
    }

    // Auto-snag (Game options): the player's own spoils of a fight picked up as they come within
    // reach of them (what of them it's set to take), each tried once
    #snag(me) {
        if (!this.autoSnag || me.dead) {
            return;
        }

        for (const dropped of this.host.ground.values()) {
            if (!this.snagTried.has(dropped.id) && snaggable(dropped, me, this.me, this.snagOnly)) {
                this.snagTried.add(dropped.id);
                this.#packCommand({ type: "pickUp", ground: dropped.id, ...(this.snagOnly && { only: this.snagOnly }) });
            }
        }

        // (Those gone forgotten, now and then)
        if (this.snagTried.size > 32) {
            for (const id of this.snagTried) {
                if (!this.host.ground.has(id)) {
                    this.snagTried.delete(id);
                }
            }
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

    // Where a supply wagon is (its id: host.js supplies), [x, y] metres; or null, gone
    #wagonAt(id) {
        const wagon = this.battle.actor(this.host.supplies?.get(id)?.wagon);

        return wagon ? [wagon.x, wagon.y] : null;
    }

    // Whether the war's news at `at` ([x, y] metres, out in the world) is near enough the player to
    // be told them there and then (NEWS_NEAR); further off, a crier cries it
    #nearNews(at) {
        const me = this.battle.actor(this.me);

        return Boolean(at) && me?.map === "town" && Math.hypot(me.x - at[0], me.y - at[1]) <= NEWS_NEAR;
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
    // How far on a house of a place's (by its id and its layout's index) is from being burnt by
    // the Behemoth of the Rift, as last looked at (#syncBurnt): core/burnt.js stageOf's, or null
    #burntStage(place, index) {
        this.burntNow ??= this.#burntPlaces();

        return this.burntNow.get(place)?.get(index) ?? null;
    }

    // The houses burnt in every place now, and how far on each is: Map(place, Map(index, stage))
    #burntPlaces() {
        const now = elapsedOf(this.host.war);

        return new Map([...new Set((this.host.burnt ?? []).map(({ place }) => place))].map((place) => [place, burntIn(this.host.burnt, place, now)]));
    }

    // The houses the Behemoth of the Rift burnt drawn as they are now (core/burnt.js): where any
    // has burnt, gone on to its next stage or stands whole again, its place's buildings built
    // again (the start town's blocks it's in: town3d.js rebuild; a settlement's chunks:
    // chunks3d.js rebuild)
    // The camps of the world's threads (core/rare.js STEPS `card`'s `camp`: the Orc King's war camp)
    // pitched where their cards are kept while their threads are at them (campOf: their people's
    // tents round a fire, world/camps3d.js), struck once they're past
    #syncThreadCamps() {
        const legends = this.host?.legends;
        const wanted = new Map();

        for (const [id, thread] of Object.entries(legends?.threads ?? {})) {
            const def = legends.stepOf(id);

            if (def?.camp && thread.place) {
                wanted.set(`thread-camp-${id}`, { ...def.camp, at: thread.place });
            }
        }

        this.threadCamps ??= new Set();

        for (const key of [...this.threadCamps]) {
            if (!wanted.has(key)) {
                this.camps?.strike(key);
                this.threadCamps.delete(key);
            }
        }

        const [ox, oz] = this.originOf("town");

        for (const [key, { people, tents, at }] of wanted) {
            if (!this.threadCamps.has(key)) {
                const camp = campOf(at, tents);

                this.camps?.pitch(key, people, { fire: [ox + camp.fire[0], oz + camp.fire[1]], tents: camp.tents.map((tent) => ({ at: [ox + tent.at[0], oz + tent.at[1]], facing: tent.facing })) });
                this.threadCamps.add(key);
            }
        }
    }

    #syncBurnt() {
        const was = this.burntNow ?? new Map();
        const now = this.#burntPlaces();

        this.burntNow = now;

        for (const place of new Set([...was.keys(), ...now.keys()])) {
            const [before, after] = [was.get(place) ?? new Map(), now.get(place) ?? new Map()];
            const changed = [...new Set([...before.keys(), ...after.keys()])].filter((index) => before.get(index) !== after.get(index));

            if (!changed.length) {
                continue;
            }

            if (place === this.world.start?.id) {
                this.town?.rebuild?.(changed);
            } else {
                this.chunks?.rebuild(place);
            }
        }
    }

    // The houses the Behemoth of the Rift burnt being built again now (framed or roofed: core/
    // burnt.js), [{ x, z }] (their middles, metres): in the start town, or a settlement laid out
    #works() {
        const works = [];

        for (const [place, houses] of this.burntNow ?? []) {
            const start = place === this.world.start?.id;
            const laid = start ? null : this.world.maps?.town?.settlements?.laid?.get(place);
            const pieces = start ? this.world.town.pieces : laid?.town.pieces;
            const origin = start ? this.world.origin ?? 0 : laid?.at;
            const [ox, oz] = Array.isArray(origin) ? origin : [origin, origin];

            for (const [index, stage] of houses) {
                if ((stage === "framed" || stage === "roofed") && pieces?.[index]) {
                    works.push({ x: ox + pieces[index].x, z: oz + pieces[index].y });
                }
            }
        }

        return works;
    }

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

    // The armies' camps' stockades standing near the player drawn (world/stockades3d.js): each
    // camp's once it's built, broken open where it's breached, with fresh stakes ready by a breach
    // while its people have the wood to mend it (war.js PALISADE)
    #syncStockades() {
        const war = this.host?.war;
        const me = this.battle.actor(this.me);

        if (!war?.camps || !me || !this.stockades) {
            return;
        }

        const [ox, oz] = this.originOf("town");
        const stockades =
            me.map === "town"
                ? war.camps
                      .filter((camp) => camp.built !== null)
                      .map((camp) => ({ id: camp.id, people: camp.realm, stockade: war.stockade(camp.id), broken: brokenOf(camp), mendable: affords(war.realm(camp.realm)?.stores, PALISADE.stakes) }))
                : [];

        this.stockades.sync(stockades, [ox + me.x, oz + me.y], [ox, oz]);
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

    // A camp's stockade stormed near a player (host.js STORM), and a force routed in a fight there:
    // the stakes being hacked at stood in for (#mirror), and the crash of them coming down fetched
    // for when they do; a breach heard and seen, its dust thrown up (its stakes drawn down:
    // world/stockades3d.js); and each said, if it's near the player, or it's their people's camp
    // or force, or their people storming it or routing it
    #storm(event) {
        const mine = this.self?.realm;
        const me = this.battle.actor(this.me);
        const near = me?.map === "town" && Boolean(event.at) && Math.hypot(me.x - event.at[0], me.y - event.at[1]) <= STORM.near * 2;
        const adjective = (realm) => ADJECTIVES[realm] ?? realm;
        const say = (text, seconds = 3, heard = false) => {
            this.hud.message(text, seconds);

            if (heard) {
                this.sound?.play("newsHeard");
            }
        };

        if (event.type === "hacking") {
            this.#mirror();
            this.sound?.want(["chop", "treantDeath"]);

            if (event.people === mine) {
                say(`The ${peopleOf(event.by)} are hacking at our camp's palisade!`);
            } else if (event.by === mine) {
                say(`We're hacking at the ${adjective(event.people)} camp's palisade: break it open!`);
            }

            return;
        }

        if (event.type === "breach") {
            const [ox, oz] = this.originOf("town");
            const [x, z] = [ox + event.at[0], oz + event.at[1]];
            const at = new THREE.Vector3(x, this.#groundOn("town", x, z) + 0.6, z);

            this.#mirror();
            this.sound?.play("treantDeath", { at });

            for (let k = 0; k < 3; k++) {
                this.effects?.burst("dust", at);
            }

            if (event.people === mine) {
                say("Our camp's palisade is breached!", 3, true);
            } else if (event.by === mine) {
                say(`The ${adjective(event.people)} palisade is breached: we're through!`, 3, true);
            } else if (near) {
                say(`The ${adjective(event.people)} camp's palisade is breached.`);
            }

            return;
        }

        // (How a storm or a rout came out: near the player, told; further off, even their
        // people's, a crier cries it)
        if (!near) {
            return;
        }

        if (event.type === "stormed") {
            const Them = event.by ? peopleOf(event.by) : "enemy";

            if (event.people === mine) {
                say(event.held ? `Our camp holds: the ${Them} are beaten off!` : `Our camp has fallen to the ${Them}, and burns!`, 4, true);
            } else if (event.by === mine) {
                say(event.held ? `We're beaten off from the ${adjective(event.people)} camp!` : `The ${adjective(event.people)} camp is carried, and burns: their army runs!`, 4, true);
            } else {
                say(event.held ? `The ${adjective(event.people)} camp holds: the ${Them} are beaten off.` : `The ${Them} have carried the ${adjective(event.people)} camp, and burn it.`, 4);
            }

            return;
        }

        // (Routed: `against` broken by `realm`)
        const kind = event.kind === "reserve" ? "reserve" : "army";

        if (event.against === mine) {
            say(`Our ${kind} breaks and runs!`, 4, true);
        } else if (event.realm === mine) {
            say(`The ${adjective(event.against)} ${kind} breaks and runs!`, 4, true);
        } else {
            say(`The ${adjective(event.against)} ${kind} breaks before the ${peopleOf(event.realm)}, and runs.`, 4);
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

        // (Further off, even the player's people's fallen on: a crier cries it)
        if (!met || over === "home" || !near) {
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

    // Take on a building the host's got ready: its floors built, each one to a piece of work, and
    // the doors told of its insides, once the player comes to its door (#floorsWanted); its folk
    // once they go in (#doorstep)
    #prepare(building) {
        const visit = { key: building.key, queue: [], maps: [], folk: [], door: building.entrance?.door ?? null, welcomed: false, bare: true, people: () => this.host.open.get(building.key) ?? [] };

        this.visits.set(building.key, visit);

        // (Its floors built only as the player comes to its door, or goes in: #floorsWanted, at once
        // if they're there already; one without a door of its own to come to, now)
        if (visit.door) {
            this.#floorsWanted(visit);
        } else {
            this.#furnish(visit);
        }

        return visit;
    }

    // The work of building a building's floors, one to a piece of work, and telling the doors of
    // its insides after
    #floorsOf(visit, building) {
        // (And the sealed rooms the rare encounters inside have added to it: core/rare.js VAULT)
        return [...[...building.maps, ...(building.vaults ?? [])].map((id) => () => this.#furnishing(visit, id)), () => this.doors?.sync(), () => this.vaultDoors?.sync()];
    }

    // A building's floors let go of, the player well away from it (FLOORS), though it's still got
    // ready: built again (#furnish) when they come near it again
    #bare(visit) {
        for (const id of visit.maps.splice(0)) {
            this.interiors.get(id)?.dispose();
            this.interiors.delete(id);
            this.minimap?.forget(id);
        }

        visit.bare = true;
    }

    // A building's floors let go of (#bare) built again: first, before any of its folk
    #furnish(visit) {
        const building = this.world.interiors?.buildings.get(visit.key);

        visit.bare = false;

        if (building) {
            visit.queue.unshift(...this.#floorsOf(visit, building));
        }
    }

    // A building's folk wanted, the player going in (told to go through one of its ways in, or
    // inside: DOORSTEP), or let go of, the player well away from it out in the world
    #doorstep(visit) {
        const me = this.battle.actor(this.me);

        if (!me || !visit.door) {
            return;
        }

        const ours = (map) => this.world.interiors?.of(map)?.key === visit.key;
        const inside = ours(me.map);
        const away = me.map === "town" ? Math.hypot(visit.door.x - me.x, visit.door.z - me.y) : Infinity;
        const making = me.order?.type === "enter" && Boolean(this.battle.links?.find(({ id }) => id === me.order.link)?.ends.some(({ map }) => ours(map)));

        if (!visit.welcomed && (inside || making)) {
            this.#welcome(visit);
        } else if (visit.welcomed && !inside && !making && away > DOORSTEP.far) {
            this.#farewell(visit);
        }
    }

    // A building's floors (one the host's got ready: not Wenches and Ale, built with the town) let
    // go of, the player well away from it, or wanted again, as they come near it (FLOORS): how
    // far measured from where the player is out in the world, or from the door of the building
    // they're in (not let go of while they're somewhere else, a cave or a dungeon); let go of only
    // once they're all built, and nothing else of it's being done
    #floorsWanted(visit) {
        const { near, off } = this.#floorsOff(visit) ?? {};

        if (near === undefined) {
            return;
        }

        if (visit.bare && (near || (off !== null && off < FLOORS.near))) {
            this.#furnish(visit);
        } else if (!visit.bare && !near && off !== null && off > FLOORS.far && !visit.steps && !visit.queue.length) {
            this.#bare(visit);
        }
    }

    // Whether the player's in a building or making for its door (`near`), and how far they are
    // from its door (`off`: metres, or null while they're somewhere else, a cave or a dungeon);
    // or null if there's no telling
    #floorsOff(visit) {
        const me = this.battle.actor(this.me);

        if (!me || !visit.door) {
            return null;
        }

        const ours = (map) => this.world.interiors?.of(map)?.key === visit.key;
        const near = ours(me.map) || (me.order?.type === "enter" && Boolean(this.battle.links?.find(({ id }) => id === me.order.link)?.ends.some(({ map }) => ours(map))));
        const from = me.map === "town" ? { x: me.x, z: me.y } : (this.world.interiors?.of(me.map)?.entrance?.door ?? null);

        return { near, off: from ? Math.hypot(visit.door.x - from.x, visit.door.z - from.z) : null };
    }

    // More floors held than FLOORS.most (`floorsMost`): those of the buildings furthest off let go of first, all
    // built and none of it being done, as #floorsWanted does further off; only those further off
    // than FLOORS.near, so that none's let go of only to be built again at once
    #fewerFloors() {
        let held = 0;

        for (const visit of this.visits.values()) {
            held += visit.maps.length;
        }

        if (held <= this.floorsMost) {
            return;
        }

        const spare = [];

        for (const visit of this.visits.values()) {
            const { near, off } = this.#floorsOff(visit) ?? {};

            if (!visit.bare && visit.maps.length && near === false && off !== null && off >= FLOORS.near && !visit.steps && !visit.queue.length) {
                spare.push({ visit, off });
            }
        }

        for (const { visit } of spare.sort((a, b) => b.off - a.off)) {
            if (held <= this.floorsMost) {
                break;
            }

            held -= visit.maps.length;
            this.#bare(visit);
        }
    }

    // A building's folk wanted: each of those not dressed yet, one to a piece of work, after its
    // floors
    #welcome(visit) {
        if (visit.welcomed) {
            return;
        }

        visit.welcomed = true;

        for (const id of visit.people()) {
            visit.queue.push(Object.assign(() => this.#people(visit, id), { folk: true }));
        }
    }

    // A building's folk no longer wanted: those dressed let go of (their bodies, skins and all),
    // those still to be not dressed (one being dressed now let go of once it is: #people)
    #farewell(visit) {
        visit.welcomed = false;
        visit.queue = visit.queue.filter((work) => !work.folk);

        for (const id of visit.folk.splice(0)) {
            this.#undress(id);
        }
    }

    // A building ready to go into now: its floors built at once, and its folk (wanted now, if they
    // weren't) dressed with more of each frame while the screen's dark, for a while (#entering);
    // or all of it at once (`now`: starting in it, while the game's loading)
    #ready(key, { now = false } = {}) {
        const building = key ? this.world.interiors?.buildings.get(key) : null;
        // (Wenches and Ale's floors built with the town: only its folk to dress)
        const visit = building?.entrance ? (this.visits.get(key) ?? this.#prepare(building)) : key && this.tavernFolk?.key === key ? this.tavernFolk : null;

        if (!visit) {
            return;
        }

        // (Its floors let go of, the player having been well away: built again, first)
        if (visit.bare) {
            this.#furnish(visit);
        }

        this.#welcome(visit);
        this.#work(visit, Infinity, { floors: !now });

        if (visit.steps || visit.queue.length) {
            this.arriving = { visit, until: performance.now() + ENTERING.most * 1000 };
        }
    }

    // Gone into a building whose folk weren't all dressed (#ready): dressed with ENTERING.budget
    // ms a frame, the screen kept dark (#arrive), till they all are, ENTERING.most seconds have
    // gone, or the player's left it; then the screen's lit
    #entering() {
        const arriving = this.arriving;

        if (!arriving) {
            return;
        }

        this.#work(arriving.visit, performance.now() + ENTERING.budget);

        const me = this.battle.actor(this.me);
        const done = !arriving.visit.steps && !arriving.visit.queue.length;
        const left = this.world.interiors?.of(me?.map)?.key !== arriving.visit.key;

        if (done || left || performance.now() >= arriving.until) {
            this.arriving = null;

            // (Lit, if it's still dark: not again, if the player's come out and it's lit already;
            // drawn once first while it's still dark, behind it, so the shaders it needs (the
            // shadows' too) are made and its pictures sent then, not in the first frame seen)
            if (this.curtainHeld) {
                this.view.render();
                this.#curtain(false);
            }
        }
    }

    // Do what can be done of a building's getting ready before `until` (performance.now()'s; all
    // of it, without; only its floors, if `floors`): each piece of work at once, or a step at a
    // time if it's in steps (its folk; one waiting on work done elsewhere, a skin, come back to
    // next frame)
    #work(visit, until = Infinity, { floors = false } = {}) {
        while ((visit.steps || visit.queue.length) && performance.now() < until) {
            if (floors && (visit.steps ? visit.dressing : visit.queue[0].folk)) {
                return;
            }

            if (!visit.steps) {
                const started = performance.now();
                const next = visit.queue.shift();
                const work = next();
                const took = performance.now() - started;

                if (took > Steps.SLOW) {
                    Steps.slow?.(`building ${visit.key}`, took);
                }

                visit.steps = typeof work?.next === "function" ? new Steps(work, `building ${visit.key}`) : null;
                visit.dressing = Boolean(next.folk);
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
            // (Not wanted any more while they were dressed: let go of)
            if (!visit.welcomed) {
                this.#undress(id);

                return;
            }

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
        // (The motes in the air gone at once through the door: the next place's own drift in; and
        // no soil trickling till a while after coming in)
        this.motes?.cut();
        this.trickles?.reset();
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

            // (What drifts in its air, if anything: an ants' nest's spores)
            if (this.motes) {
                const { camera, renderer } = this.view;

                this.motes.setQuality(this.view.quality.motes);
                this.motes.update(at.x, at.y, at.z, dt, interior.motes, renderer.domElement.height / (2 * Math.tan((camera.fov * Math.PI) / 360)));
            }

            // (Soil trickling from its roof now and then, where it does: an ants' nest's; heard where
            // it falls as it starts)
            if (interior.trickles && this.effects) {
                this.trickles ??= new Trickles();

                for (const { kind, at: from } of this.trickles.update(dt, at, interior.roof)) {
                    this.effects.burst(kind, from);
                }

                if (this.trickles.started) {
                    this.sound?.play("soilTrickle", { at: this.trickles.started, far: TRICKLE_HEARD });
                }
            }

            if (interior.hearth && Math.random() < dt * EMBERS) {
                const { x, y, z } = interior.hearth;

                this.effects.burst("embers", _hearth.set(x + (Math.random() - 0.5) * 0.6, y, z + (Math.random() - 0.5) * 1.2));
            }
        }

        this.doors?.update(dt, this.clock, { map: this.mapId, heading: player?.order?.type === "enter" ? player.order.link : null });
        this.vaultDoors?.update(this.clock, { map: this.mapId, shut: (link) => Boolean(this.host.shutOf?.(link.id, this.mapId, this.me)) });

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
        const onGround = [...this.avatars.values()].filter((avatar) => this.#greatLairs().some(({ beast }) => beast === avatar.id));

        return this.#greatLairs().filter((lair) => (this.host?.slain?.[lair.id] ?? -Infinity) <= this.battle.time && !onGround.some(({ id, object: { position } }) => id === lair.beast && Math.hypot(position.x - lair.at[0], position.z - lair.at[1]) < 250));
    }

    // --- What happened in the battle ---

    // A step of the world's news handled (#handle), and the step's own time (from `began`,
    // performance.now()'s, when this game played it) and the handling's each told to the debug
    // log if it took long (Steps.slow: a freeze's jobs), by the news it brought: so a freeze in
    // the battle's steps says what took its time
    #handleTimed(events, began = null) {
        const stepped = performance.now();

        this.#handle(events);

        const handled = performance.now();
        const step = began === null ? 0 : stepped - began;

        if (step > Steps.SLOW) {
            Steps.slow?.(`a step of the world (${newsOf(events)})`, step);
        }

        if (handled - stepped > Steps.SLOW) {
            Steps.slow?.(`handling the world's news (${newsOf(events)})`, handled - stepped);
        }
    }

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

            // (A bomb lobbed, and a blast: no one's, drawn and heard where they are)
            if (event.type === "bomb") {
                this.#bomb(event);
                continue;
            }

            if (event.type === "blast") {
                this.#blast(event);
                continue;
            }

            // (One of the wild's creatures taking to the air, drawn yet or not)
            if (event.type === "aloft") {
                this.#takesOff(event);
                continue;
            }

            // (A Prismatic chain of the player's going on, or gone: told and heard, whether
            // they're drawn or not)
            if (event.type === "prism") {
                this.#prismHeard(event);
                continue;
            }

            // (A blow's warning on the ground, drawn whether whoever's to strike it is or not)
            if (event.type === "telegraph") {
                this.#telegraphed(event);
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
                case "attack":
                    // (Their own, joined: shown already, as the forecast began it (app/forecast.js),
                    // not again)
                    if (event.id === this.me && this.forecast?.claim(event)) {
                        this.lastAttack.set(event.id, battle.time);
                    } else {
                        this.#attackSeen(event, avatar);
                    }

                    break;
                case "call": {
                    // (One of the wild's calling its flock to it, as its call goes out: heard far
                    // off, and told to whoever it's after; its flock comes running, host.js #flock)
                    const actor = battle.actor(event.id);
                    const creature = this.#voiced(actor, avatar);

                    if (creature) {
                        this.sound?.voice(creature, "call", avatar.object.position);
                    }

                    // (One rallying a champion of its own to it as it's worn down, by name: battle.js
                    // #rallies, the Orc King's)
                    if (event.target === this.me) {
                        this.hud.message(event.title ? `${actor.name[0].toUpperCase()}${actor.name.slice(1)} roars a battlecry: ${event.title} is coming!` : `${actor.name[0].toUpperCase()}${actor.name.slice(1)} calls its flock: more ${CREATURES[event.kind]?.name.toLowerCase() ?? "creature"}s are coming!`, 2.5);
                    }

                    break;
                }
                case "leap": {
                    // (Leaping at someone (battle.js #moves: the Orc King's): springing up as its clip
                    // has it and coming down where it lands (beast.js actions.leap; a people-shaped
                    // stand-in's walked there), its warning on the ground there (#telegraphed); told to them)
                    const actor = battle.actor(event.id);
                    const [ox, oz] = this.originOf(event.map);

                    avatar.actions.leap?.({ to: [ox + event.to[0], oz + event.to[1]], lift: event.lift / 1000, land: event.land / 1000, up: event.up, ground: (x, z) => this.#standsAt(actor.map, x - ox, z - oz) });

                    if (event.target === this.me) {
                        this.hud.message(`${actor.name[0].toUpperCase()}${actor.name.slice(1)} leaps at you!`, 1.5);
                    }

                    break;
                }
                case "guard": {
                    // (Standing on guard a while (battle.js #onGuard: the Orc King's): its guard held
                    // up (beast.js actions.guard); told to whoever it's after, and how to get round it)
                    const actor = battle.actor(event.id);

                    avatar.actions.guard?.({ seconds: (event.until - battle.time) / 1000 });

                    if (event.target === this.me) {
                        this.hud.message(`${actor.name[0].toUpperCase()}${actor.name.slice(1)} stands on guard: strike from the side or behind!`, 2.5);
                    }

                    break;
                }
                case "drop": {
                    // (A black widow dropping on its thread from where it lurked, unseen, onto
                    // whoever came beneath it: battle.js #lurk; heard, and told to them)
                    const actor = battle.actor(event.id);
                    const creature = this.#voiced(actor, avatar);

                    if (creature) {
                        this.sound?.voice(creature, "attack", avatar.object.position);
                    }

                    if (event.target === this.me) {
                        this.hud.message(`${actor.name[0].toUpperCase()}${actor.name.slice(1)} drops on you from the dark above!`, 2.5);
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

                    // (Fire breathed: a roaring stream from its jaws to whoever it's at, a moment;
                    // a creature drawn from a model breathes its own, beasts/model.js)
                    if (BREATHED[event.kind] && target && !avatar.plan?.breath) {
                        effects.breathe(() => avatar.hand("Right"), () => target.point(0.6), 0.7, BREATHED[event.kind]);
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
                case "cast":
                    // (Their own, joined: shown already, as the forecast began it, not again)
                    if (!(event.id === this.me && this.forecast?.claim(event))) {
                        this.#castSeen(event, avatar);
                    }

                    break;
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
                case "warning":
                    this.#warned(event, avatar);
                    break;
                case "charge":
                    // (A wary beast coming at them at last: its cry)
                    this.sound?.voice(this.#voiced(battle.actor(event.id), avatar), "attack", avatar.object.position);
                    break;
                case "curious":
                    avatar.rest?.("sniff", 2);
                    break;
                case "fled":
                    // (A wary beast's nerve gone: limping off, a cry of pain)
                    hud.damage(this.#screenAbove(event.id), "Flees", { kind: "stun" });
                    this.sound?.voice(this.#voiced(battle.actor(event.id), avatar), "hurt", avatar.object.position);
                    break;
                case "eat":
                    // (Its head down to what was thrown it, a while, crunching)
                    avatar.rest?.("root", BAIT.eat / 1000);
                    this.sound?.play("beastEat", { at: avatar.object.position.clone() });
                    break;
                case "bait": {
                    // (Thrown: heard landing, as it lands: drawn as it flies, world/wild3d.js BaitLook)
                    const [ox, oz] = this.originOf(event.map);
                    const at = new THREE.Vector3(ox + event.x, this.#groundOn(event.map, event.x, event.y), oz + event.y);

                    this.#after(Math.max(0, (event.lands - battle.time) / 1000), () => this.sound?.play("baitLand", { at }));
                    break;
                }
                case "mood":
                    this.#minded(event);
                    break;
                case "dodged": {
                    const by = event.by ? this.avatars.get(event.by) : null;

                    hud.damage(this.#screenAbove(event.id), "Dodged", { kind: "stun" });
                    effects.burst("dust", avatar.point(0.1));
                    // (Slipping it: aside, away from where it came from, or back)
                    avatar.actions.dodge?.({ from: by ? avatar.angleTo(by.object.position.x, by.object.position.z) : 0 });
                    break;
                }
                case "covered": {
                    // (A shot taken by the stakes before someone up on a camp's walkway: splinters
                    // off them between whoever shot and them, a knock on wood)
                    const by = event.by ? this.avatars.get(event.by) : null;
                    const at = avatar.point(0.6);
                    const direction = by ? at.clone().sub(by.point(0.7)).setY(0).normalize() : null;

                    if (direction) {
                        at.addScaledVector(direction, -1);
                    }

                    hud.damage(this.#screenAbove(event.id), "Cover", { kind: "stun" });
                    effects.burst("woodChips", at, direction);
                    this.sound?.play("block", { at });
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
                case "taunted":
                    // (A foe made to go for someone, heard where they are: a war cry's, as its own
                    // ("cried"); one the player's taunted, told over it)
                    if (!event.cried) {
                        this.sound?.play("taunt", { at: (this.avatars.get(event.by) ?? avatar).object.position });
                    }

                    if (event.by === this.me) {
                        hud.damage(this.#screenAbove(event.id), "Taunted", { kind: "stun" });
                    }

                    // (One of the player's own drawing a foe off them: told, now and then)
                    if (this.showEnmity && event.from === this.me && !event.cried && this.battle.actor(event.by)?.leader === this.me && this.clock - this.drawnOffAt >= DRAWN_OFF_EVERY) {
                        this.drawnOffAt = this.clock;
                        hud.message(`${this.battle.actor(event.by).name} draws the ${(this.battle.actor(event.id).name ?? "foe").toLowerCase()} off you.`, 2.5);
                    }

                    break;
                case "cried":
                    this.sound?.play("warCry", { at: avatar.object.position });
                    break;
                case "slipped":
                    this.sound?.play("slipAway", { at: avatar.object.position });
                    break;
                case "stunned":
                    effects.stun(avatar.point(0.9), avatar.object, avatar.character.height * 1.08, (event.until - battle.time) / 1000, this.#landing(event.id, "stun"));
                    hud.damage(this.#screenAbove(event.id), event.effect === "frost" ? "Frozen" : "Stunned", { kind: "stun" });

                    // (Frozen by a legendary weapon: heard as its effect, #unleashed)
                    if (event.effect !== "frost") {
                        this.sound?.play("stun", { at: avatar.object.position });
                    }

                    break;
                case "unleashed":
                    this.#unleashed(event);
                    break;
                case "charged":
                    // (The player's own legendary weapon's charge full: core/legendary.js)
                    if (event.id === this.me) {
                        this.sound?.play("legendCharged");
                    }

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
                case "unstruck":
                    // (An Action Bar blow, pressed while steering, that never came into reach:
                    // nothing spent, its slot flashed red and why said, as a spell out of reach is)
                    if (event.id === this.me && event.tag) {
                        const slot = this.#quickKeys().keys.findIndex((key) => actionOf(key)?.ability === event.tag);

                        if (slot >= 0) {
                            this.quickBar?.mark(slot, "refused");
                        }

                        hud.message(CAST_FAILURES.range, 1.4);
                        this.sound?.play("denied");
                    }

                    break;
                case "exhausted":
                    if (event.id === this.me) {
                        hud.message("Out of breath", 1.5);
                        this.sound?.play("breath");
                        // (Held keys walk on till enough of it's back: steering.js RUN_AGAIN)
                        this.steering?.outOfBreath();
                    }

                    break;
                case "death": {
                    const killer = event.by ? this.avatars.get(event.by) : null;

                    // (A camp's stakes hacked through: heard and seen coming down as its breach
                    // is: #storm)
                    if (battle.actor(event.id)?.kind === "stakes") {
                        this.onDeath(event);
                        break;
                    }

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
                        this.#slain(event.id, avatar);
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
                    this.#takeUpArms(actor, avatar);

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
                if (event.type === "leave") {
                    this.hud.setAway(event.id, false);
                }

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
            case "find":
                // (A peaceful find let go, every player gone far from it: off the maps)
                if (event.change === "gone") {
                    this.findsSeen.delete(event.find);
                }

                break;
            case "pace":
                if (event.id === this.me) {
                    this.#paced(event);
                }

                break;
            case "stranger":
                this.#strangerSaid(event);
                break;
            case "obstacle":
                this.#obstacleSaid(event);
                break;
            case "ambush":
                this.#ambushed(event);
                break;
            case "rare":
                this.#rareTold(event);
                break;
            case "thread":
                this.#threadTold(event);
                break;
            case "vault":
                this.#vaultTold(event);
                break;
            case "obstacles":
                // (Something across the way come down or cleared: the ground under it drawn again,
                // as the world's squares were made again: core/overworld.js setObstacles)
                for (const box of event.boxes) {
                    this.chunks?.redraw(box);
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
            case "invasion":
                this.#invasion(event);
                break;
            case "engagement":
                this.#battleTurn(event);
                break;
            case "burnt":
                this.#burnt(event);
                break;
            case "townsfolk":
                // (One of a place's townsfolk in at a door from the Behemoth of the Rift, or out of it
                // again after (core/host.js #sheltering): the door heard there)
                if (event.at && this.mapId === "town") {
                    const [ox, oz] = this.originOf("town");
                    const [x, z] = [ox + event.at[0], oz + event.at[1]];

                    this.sound?.play("door", { at: new THREE.Vector3(x, this.#groundOn("town", x, z), z) });
                }

                // (A place's townsfolk out about their business, drawn nearest first; or home again,
                // or indoors)
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
                } else if (event.over === "taken" && (event.by === this.self?.realm || event.people === this.self?.realm) && this.#nearNews(this.#wagonAt(event.wagon))) {
                    // (Further off: a crier cries it)
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
            case "hacking":
            case "breach":
            case "stormed":
                this.#storm(event);
                break;
            case "stockades":
                // (A camp's stockade gone up or come down, breached or mended: the ground under it
                // and round it drawn again, as the world's squares were made again: core/
                // overworld.js setStockades)
                for (const box of event.boxes) {
                    this.chunks?.redraw(box);
                }

                break;
            case "war":
                // (A fortification gone up or come down: the ground under it, and round it, drawn
                // again: core/overworld.js setForts. Not a camp: nothing's built under it)
                if (["built", "razed", "abandoned"].includes(event.event.type) && FORTS[event.event.kind]) {
                    this.chunks?.redraw(footprintOf({ kind: event.event.kind, at: event.event.at }, CLEARING));
                }

                // (A force routed in a fight played out near a player: told, as a storm is)
                if (event.event.type === "battle" && event.event.routed) {
                    this.#storm({ ...event.event, type: "routed" });
                }

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
            case "standard":
                this.#bearsStandard(event.id);
                break;
            case "follower":
                if (event.change === "outfitted" && event.slot === "body") {
                    this.#redress(event.follower);
                }

                if (event.id === this.me) {
                    this.#followerNews(event);
                }

                break;
            case "share":
                // (What the player's hired adventurers took of gold won with them: core/host.js #won)
                if (event.id === this.me) {
                    this.hud.message(event.taken.length === 1 ? `${event.taken[0].name} takes their share: ${event.gold} gold.` : `Your company takes its share: ${event.gold} gold.`, 2);
                    this.hud.setGold(this.progress.gold);
                }

                break;
            case "rules":
                // (Whether mercenaries can die here, changed by the world's host: core/host.js #setRule)
                this.hud.message(event.rules.mortal ? "In this world, mercenaries can die now: a third fall is their last." : "In this world, mercenaries no longer die: a third fall sends them home to mend.", 4);
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
            case "resting":
                // (Resting in a world where everyone rests at once: core/host.js RULES rest)
                if (event.ids.includes(this.me)) {
                    this.hud.message(`You rest. Time passes once everyone's resting: ${event.waiting} still up.`, 3.5);
                }

                break;
            case "rose":
                if (event.id === this.me) {
                    this.hud.message("You're up, and no longer resting.", 2);
                }

                break;
            case "away":
                this.#away(event);
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
                // said; the places another of their party found for them, said: #sharedFinds; and
                // those seen from high ground: #spotted)
                if (event.id === this.me) {
                    this.#explored();

                    if (event.portal) {
                        this.hud.message("This branch of the guild is open to you now: step through to it from any other branch's portal.", 4);
                    }

                    if (event.places?.length || event.pooled) {
                        this.#sharedFinds(event);
                    }

                    if (event.spotted?.length) {
                        this.#spotted(event.spotted);
                    }
                }

                break;
            case "bestiary":
                if (event.id === this.me) {
                    this.#studied(event);
                }

                break;
            case "turn":
                // (The war kept as it goes; the journal's time left with it; and the player's time
                // in towns, for the invasions to come: core/invasions.js clockOf)
                this.onWar(this.host.war, this.host.legends);
                this.onProgress(this.progress);
                this.#keepFollowers();

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
            case "unitAbility":
                // (One of the player's own using their ability, told to: core/host.js #unitAbility)
                if (event.id === this.me) {
                    this.hud.message(`${this.battle.actor(event.unit)?.name ?? "They"}: ${event.label}!`, 1.4);
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
                // (A spell that grows with use grown: Vampirism, Dodge, Poison; Summon and Zombify,
                // more at once)
                if (event.id === this.me) {
                    const { label, company } = SPELLS[event.spell];

                    this.hud.message(company ? `${label} grows (${event.level} of 5): up to ${company[event.level - 1]} at your side at once.` : `${label} grows stronger (${event.level} of 5).`, 3);
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
            case "party":
                this.#partyEvent(event);
                break;
            case "treasure":
                this.#treasureEvent(event);
                break;
            case "sign":
                if (event.id === this.me) {
                    this.#signRead(event);
                }

                break;
            case "prayed":
                if (event.id === this.me) {
                    this.#prayed(event);
                }

                break;
            case "ring":
                if (event.id === this.me) {
                    this.#ringEvent(event);
                }

                break;
            case "trial":
                this.#trialEvent(event);
                break;
            case "cured":
                // (Rested in a shrine's sanctuary: core/shrines.js)
                if (event.id === this.me) {
                    this.hud.message(`The shrine's peace eases you as you rest: no longer ${AFFLICTIONS[event.kind]?.label.toLowerCase() ?? event.kind}.`, 3);
                }

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

                    // (A moon road walked: core/rings.js)
                    const ring = event.why === "moon" && this.world.plan ? ringOf(this.world.plan, event.ring) : null;

                    this.hud.message({ moon: ring ? `The stones hum, and the moonlight carries you: you stand in ${ringName(this.world.plan, ring)}.` : "", teleport: "The world lurches, and you're somewhere else entirely.", recall: "You stand at the temple's door.", walk: "One step, and you're there.", summoned: "You're at their side.", safety: `Safe: the market square of ${this.world.start?.name ?? "home"}.`, portal: `Through the portal: the guild's branch in ${branch ?? "another town"}${event.fare ? `, for ${event.fare} gold` : ""}.` }[event.why] ?? "", 3);
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

        this.onWar(war, this.host.legends);
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

        if (on) {
            this.#takeUpArms(actor, avatar);
        }

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

        // (One of the player's hired adventurers striking the kind of foe that last knocked them
        // down: a word about it, now and then, #bark)
        const striker = event.by ? this.host.followers.get(event.by) : null;
        const nemesis = striker?.leader === this.me ? striker.record?.nemesis : null;

        if (nemesis && actor?.kind === "beast" && actor.wild?.creature === nemesis) {
            this.#bark(event.by, "again", { foe: CREATURES[nemesis]?.name.toLowerCase() ?? "" });
        }

        // (One of the wild's creatures crying out, now and then; struck dead, it's its death
        // that's heard: CALLS)
        const hurt = !actor?.dead && this.#voiced(actor, victim);

        if (hurt && this.clock >= (victim.cried ?? 0)) {
            this.sound?.voice(hurt, "hurt", victim.object.position);
            victim.cried = this.clock + CALLS.hurt;
        }
        // (A camp's stakes hacked at: a blade chopping into the wood)
        const stakes = actor?.kind === "stakes" && !event.spell;

        // (Armour heard under a weapon's or a fist's blow, not a spell's, whatever it feels like;
        // a spell's blow heard as it lands, its own, unless it's the fire it left on the ground or
        // it's turned back: #spellLanded)
        if (stakes) {
            this.sound?.play("chop", { at: victim.object.position });
        } else if (!(event.spell && !event.ground && !event.reflected && spellSounds(event.spell).land)) {
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

        // (On a camp's stakes, where it bites into them before whoever struck: splinters flying)
        if (stakes && attacker && actor.footprint) {
            const [x0, y0, x1, y1] = actor.footprint;
            const by = battle.actor(event.by);
            const [ox, oz] = this.originOf(actor.map);
            const [x, z] = [ox + Math.min(Math.max(by.x, x0), x1 + 1), oz + Math.min(Math.max(by.y, y0), y1 + 1)];

            at.set(x, this.#groundOn(actor.map, x, z) + 1.1, z);
            effects.burst("woodChips", at, direction);
        } else {
            effects.impact(reaction?.effect ?? "sparks", at, direction, event.projectile ? effects.lookOf(event.projectile) : null);
        }

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
    // Someone's swing begun (battle.js "attack"): shown and heard as it begins, as the copy has it,
    // or, joined, their own as the forecast's begun it (app/forecast.js), ahead of the copy
    #attackSeen(event, avatar) {
        const battle = this.battle;
        const actor = battle.actor(event.id);
        const target = battle.actor(event.target);

        this.#takeUpArms(actor, avatar);

        // (Kicking with a weapon in hand, the hands stay on guard; and its weapon in hand, whatever
        // it looked like: once starting the attack has finished any drawing or putting away. How
        // far off its target is, for a creature that reaches it: a frog's tongue)
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

        // (Its swing heard; a creature's own way with a great axe in hand, the Orc King's and his
        // champions', as a battle axe's is)
        if (!this.sound?.attack(event.animation, avatar.object.position, event.hitAt / 1000) && actor.wild && weaponOf(actor.weapon)?.equipment?.includes("battleAxe")) {
            this.sound?.attack("hammer", avatar.object.position, event.hitAt / 1000);
        }

        // (The Behemoth of the Rift drawing breath: its atomic breath heard as its clip has it
        // (beasts/sounds.js CLIP_SOUNDS): charging, loudest as it fires, and fired, the beam's
        // sound fitted to it)
        if (event.attack === "atomicBreath") {
            const at = avatar.object.position.clone();

            this.sound?.play("kaijuCharge", { at, far: ATOMIC_HEARD, peakAt: event.hitAt / 1000 });
            this.sound?.play("kaijuBreath", { at, far: ATOMIC_HEARD, delay: Math.max(0, event.hitAt / 1000 - ATOMIC_LEAD) });
        }

        // (One of the wild's creatures snarling, hissing or grunting with it, loudest as it lands:
        // a beast's every blow, a people-shaped one's now and then: CALLS)
        const creature = this.#voiced(actor, avatar);

        if (creature && this.clock >= (avatar.growled ?? 0) && (avatar instanceof BeastAvatar || Math.random() < CALLS.effort)) {
            this.sound?.voice(creature, "attack", avatar.object.position, { hitAt: event.hitAt / 1000 });
            avatar.growled = this.clock + CALLS.growl;
        }
    }

    // Someone's cast begun (battle.js "cast"): shown and heard swelling to its release, as the
    // copy has it, or, joined (`ahead`), their own as the forecast's begun it, ahead of the copy:
    // then how long they're casting it, and whether it's broken off, the forecast's (#castsHeard)
    #castSeen(event, avatar, ahead = false) {
        const battle = this.battle;
        const spell = SPELLS[event.spell];
        const kind = SPELL_LOOKS[lookOf(event.spell)] ?? lookOf(event.spell);
        const look = this.#look(event.id, kind);
        const casting = () => (ahead ? this.forecast?.casting : battle.actor(event.id)?.casting?.spell) === event.spell;

        // (Landing on whom it's cast on in the same look; and gathering in the hand, for as long
        // as they're casting it, a heal's or a stun's in its look too)
        this.landing.set(event.target, look);

        if (battle.actor(event.id)?.map === this.mapId) {
            const on = this.avatars.get(event.target);

            this.spellFx.cast(event.id, event.spell, {
                hand: () => avatar.hand("Left"),
                feet: () => avatar.object.position,
                target: () => on?.object.position ?? null,
                aim: () => on?.point(0.6) ?? null,
                still: casting,
                castTime: event.castTime,
                glow: LOOKS[kind]?.[look]?.charge ?? null,
            });
        }

        avatar.actions.startAttack(kind === "heal" ? "castHeal" : "castStun", { hitAt: spell.castTime / 1000, duration: (spell.castTime / 1000) * 1.7 });

        // (Its sound swelling to its release, its missile's flying the last of it)
        const heard = this.sound?.cast(event.spell, avatar.object.position, event.castTime / 1000, { travel: missileTravel(event.spell, event.castTime) });

        this.castSounds.set(event.id, { source: heard ?? null, spell: event.spell, until: (ahead ? event.time : battle.time) + event.castTime, ahead });
    }

    // Casts heard as they swell: one broken off before it's let go (its caster stunned, knocked
    // down, struck dead) cut short, fizzling out if they're still standing
    #castsHeard() {
        for (const [id, { source, spell, until, ahead }] of this.castSounds) {
            const actor = this.battle.actor(id);

            // (Their own, begun ahead of the copy: as the forecast has them, at its present)
            const [now, casting] = ahead ? [this.forecast?.present ?? Infinity, this.forecast?.casting] : [this.battle.time, actor?.casting?.spell];

            if (now >= until) {
                this.castSounds.delete(id);
            } else if (casting !== spell) {
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

        const where = (one) => ({ feet: () => one.object.position, point: () => one.point(0.6), hand: () => one.hand("Left"), height: one.character?.height ?? 1.8 });
        const others = struck.filter((id) => id !== event.target && this.avatars.has(id)).map((id) => where(this.avatars.get(id)));

        this.spellFx.land(event.id, event.spell, { caster: where(avatar), target: where(target), struck: others });
    }

    // A Prismatic chain of the player's gone on, or gone (core/prismatic.js; battle.js "prism"):
    // each spell of it a glass bell, higher as it climbs; a piece of the sigil, the sigil whole,
    // and everything lost, heard and shown on the sigil alone (app/sigil.js), never told in a
    // message: a piece or the sigil whole, flaring; let lapse, broken or faded, shown going
    #prismHeard({ id, change, spell, step }) {
        if (id !== this.me) {
            return;
        }

        if (change === "start" || change === "step") {
            this.sound?.play("chainStep", { rate: 2 ** ((step - 1) / 12) });
        } else if (change === "piece") {
            this.sigil.flare(SPELLS[spell]?.school);
            this.sound?.play("sigilPiece");
        } else if (change === "whole") {
            this.sigil.flare("whole");
            this.sound?.play("sigilWhole");
        } else if (change === "broken" || change === "faded") {
            this.sigil.end(change, this.battle.time);
            this.sound?.play("chainBroken");
        }
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

        if (at && ["risen", "called", "over", "lost", "dismissed", "replaced"].includes(change)) {
            this.spellFx.appear(at, ["dismissed", "replaced"].includes(change) ? "over" : change);
        }

        if (id !== this.me) {
            return;
        }

        const name = CREATURES[creature]?.name.toLowerCase() ?? "creature";
        const said = { risen: `The ${name} rises from the dead to follow you!`, called: `A ${name} answers your call, at your side.`, over: `Your ${name} is gone, its time up.`, fallen: `Your ${name} has fallen.`, lost: `Your ${name} is left behind.`, dismissed: `You let your ${name} go.`, replaced: `Your ${name} goes, to make room for another.`, tamed: `The ${name} follows you now, fed and tamed: yours till it falls, or you let it go.` }[change];

        if (said) {
            this.hud.message(said, change === "tamed" ? 4 : 3);
        }

        // (A beast tamed: heard, and kept with the character, as their followers are: core/wary.js)
        if (change === "tamed") {
            this.sound?.play("tamedChime");
        }

        this.#keepFollowers();
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
        return actor?.kind !== "fort" && actor?.kind !== "stakes" && (actor?.kind !== "beast" || CREATURES[actor.wild?.creature]?.blood === "red");
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

    // A foe the player's to be told of fallen (#ours): one of note (creatures.js `notable`: an
    // elite, a boss, a perilous place's own or master) said across the screen, as ever; anyone
    // else's fall said rising off their body as it lands (`avatar.lands`), in red, as what's
    // picked up rises over the player (#gained), and not kept for the journal. Their body off the
    // screen (or behind the camera), it rises over the player instead
    #slain(id, avatar) {
        const actor = this.battle.actor(id);
        const said = `The ${actor.name.toLowerCase()} is slain!`;

        if (notable(actor.wild, { master: Boolean(this.host?.wild?.get(id)?.master) })) {
            this.hud.message(said, 3);

            return;
        }

        this.#after(avatar.lands ?? 0, () => {
            const body = this.avatars.get(id);
            const at = body ? this.view.toScreen(this.#lying(body)) : null;
            const seen = at && at.x >= 0 && at.y >= 0 && at.x <= globalThis.innerWidth && at.y <= globalThis.innerHeight;

            this.hud.damage(seen ? at : this.#screenAbove(this.me), said, { kind: "slain" });
        });
    }

    // Where a fallen body lies in the world: its hips (a beast's, its body), as it's thrown down
    // from where it stood; one drawn in a crowd, without bones, SLAIN_RISES of its height over
    // where it stood
    #lying(avatar) {
        const hips = avatar.character?.rig?.bone?.("Hips");

        return hips?.getWorldPosition ? hips.getWorldPosition(new THREE.Vector3()) : avatar.point(SLAIN_RISES);
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

            // Held on what's across the way: cleared, for as long as it's held (#holdOn)
            const obstacle = !who && this.pointers.size === 1 ? this.#obstacleAt(event.clientX, event.clientY) : null;

            if (obstacle) {
                pointer.hold = setTimeout(() => this.#holdOn(pointer, obstacle), HOLD_MS);
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

            // (A mouse over the view: what's under it, for the pointer to show: #aim)
            if (event.pointerType === "mouse") {
                this.hovering = { x: event.clientX, y: event.clientY };
            }

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

                const { drag, tilt, invert } = this.cameraSettings;

                this.cameraFollow.turn((-(pointer.x - pointer.drag.x) / rect.width) * DRAG_TURN * drag, ((pointer.y - pointer.drag.y) / rect.height) * DRAG_TILT * tilt * (invert ? -1 : 1), this.view.lowestPitch());
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

            // Let go of what's across the way: no more cleared
            if (pointer.clearing) {
                this.#leaveOff();

                return;
            }

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
        this.#on(canvas, "pointerleave", () => this.#unaim());

        // Anything the player does keeps them from resting
        for (const type of ["pointerdown", "keydown", "wheel"]) {
            this.#on(document, type, () => this.#wake(), { capture: true, passive: true });
        }

        // W, A, S, D (or the arrows), and a thumb stick on a touch screen: held, they come out as
        // the same "ahead" order the swipe up gives, reaching only as far as held input needs
        // (app/steering.js)
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
                    this.#command({ type: "ahead", facing, run, reach: HELD_REACH });
                },
                stop: () => this.#command({ type: "stop" }),
                lost: (lost) => this.#pressLost("stick", lost),
                breath: () => {
                    const player = this.battle.actor(this.me);

                    return player?.maxStamina ? player.stamina / player.maxStamina : 1;
                },
            });
        }

        // The pack: its button, or I; Escape closes it (not the menu)
        this.#on(this.hud.root.querySelector("#packbutton") ?? document.createElement("button"), "click", () => this.togglePack());
        this.#on(this.hud.root.querySelector("#journalbutton") ?? document.createElement("button"), "click", () => this.toggleJournal());
        this.#on(this.hud.root.querySelector("#spellbookbutton") ?? document.createElement("button"), "click", () => this.toggleSpellbook());
        this.#on(this.hud.root.querySelector("#partybutton") ?? document.createElement("button"), "click", () => this.toggleParty());
        this.#on(document, "keydown", (event) => {
            if (!this.running || this.talk?.open) {
                return;
            }

            // (Typing, in the party's chat, isn't asking for anything with a key; Escape still closes)
            const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
            const plain = !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey && !typing;

            if (event.key === "Escape" && this.pack?.open && this.pack.unpeek()) {
                // (What was open in the pack to see what it is, put away first)
                event.preventDefault();
                event.stopPropagation();
            } else if (event.key === "Escape" && (this.pack?.open || this.journal?.open || this.reader?.open || this.spellbook?.open || this.partyPanel?.open || this.fate?.open)) {
                event.preventDefault();
                event.stopPropagation();
                this.closePack();
                this.closeJournal();
                this.closeReader();
                this.closeSpellbook();
                this.closeParty();
                this.fate?.hide();
            } else if ((event.key === "ArrowRight" || event.key === "ArrowLeft") && this.reader?.open && plain) {
                // (Reading, the arrow keys turn its pages)
                event.preventDefault();
                event.stopPropagation();
                this.reader.turn(event.key === "ArrowRight" ? 1 : -1);
            } else if ((event.key === "i" || event.key === "I") && plain) {
                this.togglePack();
            } else if ((event.key === "j" || event.key === "J") && plain) {
                this.toggleJournal();
            } else if ((event.key === "b" || event.key === "B") && plain) {
                this.toggleSpellbook();
            } else if ((event.key === "p" || event.key === "P") && plain) {
                this.toggleParty();
            } else if (event.key === "Enter" && plain && (event.target === document.body || event.target instanceof HTMLCanvasElement) && !this.partyPanel?.open && (this.hosting || this.remote) && this.host.partyFor(this.me)) {
                // (Enter, in a party of players, with nothing else to press: its chat, ready to type)
                event.preventDefault();
                this.toggleParty({ chat: true });
            } else if (/^[1-6]$/.test(event.key) && Number(event.key) <= this.quickShown && plain && this.quickBar?.up && !(event.target instanceof HTMLInputElement)) {
                this.quick(Number(event.key) - 1);
            } else if ((event.key === "x" || event.key === "X" || event.key === "z" || event.key === "Z") && plain) {
                // (X and Z: the next foe in the enemies list set on, or the last)
                this.cycleTarget(event.key.toLowerCase() === "x" ? 1 : -1, "list");
            } else if (event.key === "Tab" && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey && !typing && !(this.pack?.open || this.journal?.open || this.reader?.open || this.spellbook?.open || this.partyPanel?.open || this.fate?.open)) {
                // (Tab: the nearest foe in sight set on, then each next one out; Shift+Tab back.
                // Not the browser's: its focus taken off the game to the next button, for nothing)
                event.preventDefault();
                this.cycleTarget(event.shiftKey ? -1 : 1, "distance");
            } else if (/^[qe]$/i.test(event.key) && !typing && !event.ctrlKey && !event.metaKey && !event.altKey) {
                // (The camera turned round the player while Q or E is held)
                this.turnKeys.add(event.key.toLowerCase());
            } else if ((event.key === "r" || event.key === "R") && plain) {
                this.recentre();
            }
        }, { capture: true });
        this.#on(document, "keyup", (event) => {
            this.turnKeys.delete(event.key.toLowerCase());
        });
        // (Keys let go of unseen, the page or the window left: none held)
        this.#on(window, "blur", () => this.turnKeys.clear());

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
            this.view.zoomSmoothly(Math.exp(event.deltaY * 0.0015));
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
     * set on the enemy there (where the player stands: tapped twice in quick succession, or
     * shift-clicked, running up to them), go through the door or up or down the stairs there, or
     * walk there (tapped twice, or with `run`, run there). On the player themselves, going
     * somewhere, they stop.
     */
    tap(clientX, clientY, { run = false, time = performance.now() } = {}) {
        this.#wake();

        let who = this.#whoIsAt(clientX, clientY, { player: true, folk: true })?.actor ?? null;
        const me = this.battle.actor(this.me);

        // The player themselves: going somewhere, they stop (set on someone, still set on them)
        if (who && who === me) {
            who = null;

            if (this.#halt()) {
                this.lastTap = { time, x: clientX, y: clientY, from: "view" };

                return;
            }
        }

        // Someone to talk to (one of the folk, a soldier who isn't an enemy, nor one of an
        // invasion's raiders, leaving the player be till they strike one): go up to them; another
        // player (not an enemy): trade with them
        if (who && me && !this.battle.hostile(who, me) && !this.host.invader(who.id)) {
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

        // What's across the way: walked up to, and told it's to be held on to clear it
        const obstacle = who ? null : this.#obstacleAt(clientX, clientY);

        if (obstacle) {
            this.lastTap = { time, x: clientX, y: clientY, from: "view" };
            this.#walkTo(obstacle, { run });
            this.hud.message(`Hold on ${OBSTACLE_WORDS[this.host.obstacles.get(obstacle)?.kind ?? "tree"].it} to clear ${OBSTACLE_WORDS[this.host.obstacles.get(obstacle)?.kind ?? "tree"].pronoun}, or go round.`, 2.5);

            return;
        }

        const enemy = who;
        // (A lectern before any way out behind it: it stands in the room, in front of its stairs)
        const lectern = enemy ? null : this.#lecternAt(clientX, clientY);
        // (A sign on a trail, out in the wilds: core/tracks.js; a shrine, to pray at: core/shrines.js)
        const sign = enemy || lectern ? null : this.#signAt(clientX, clientY);
        const shrine = enemy || lectern || sign ? null : this.#shrineAt(clientX, clientY);
        const door = enemy || lectern || sign || shrine ? null : this.doors?.at(this.view.rayAt(clientX, clientY), this.mapId) ?? null;
        const portal = enemy || door || lectern || sign || shrine ? null : this.#portalAt(clientX, clientY);
        const table = enemy || door || portal || lectern || sign || shrine ? null : this.#warTableAt(clientX, clientY);
        const ground = enemy || door || portal || table || lectern || sign || shrine ? null : this.view.pickGround(clientX, clientY);
        const [ox, oz] = this.originOf(this.mapId);

        this.#order({ enemy, door, portal, table, lectern, sign, shrine, ground: ground && [ground.x - ox, ground.z - oz] }, { clientX, clientY, run, time, from: "view" });
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

    /**
     * An invasion at the town the player's in, now (core/host.js #invadeNow: the debug overlay's
     * Invasion), of a band (core/invasions.js BANDS), or as one due would come (`band` null); told
     * why not, if not (not in a town or city, one on already, or not the world's own player).
     */
    invade(band = null) {
        this.#command({ type: "invade", band }, (result) => {
            if (!result.ok) {
                this.hud.message("Only in a town or city of the world you've opened, with no invasion on", 2.5);
            }
        });
    }

    /**
     * Houses near the player burnt as the Behemoth of the Rift burns them, as if the town had
     * fallen so long ago that they're halfway through `stage` now (core/burnt.js BURNT.stages: to
     * see each stage of their burning and building again), `count` of them or as many as it burns
     * unhurt (the debug overlay's): host.js "burn".
     */
    burn(stage = "burning", count = null) {
        const now = elapsedOf(this.host.war);
        const agos = Array.from({ length: 4 * 60 + 1 }, (_, k) => k * (DAY.length / 60)).filter((ago) => stageOf(now - ago, now) === stage);
        const ago = stage === "burning" ? 0 : (agos[Math.floor(agos.length / 2)] ?? 0);

        this.#command({ type: "burn", ago, count }, (result) => {
            if (!result.ok) {
                this.hud.message("Only in a town or city of the world you've opened, with a house near you not burnt yet", 2.5);
            }
        });
    }

    /**
     * Debug mode's sample rare encounter (core/rare.js SAMPLE) dealt ahead of the player at once,
     * their clock aside, or (`inside`) its inside sample put on the dungeon floor they're on
     * (SAMPLE_DEEP) (the debug overlay's): host.js "rare".
     */
    rare({ inside = false } = {}) {
        this.#command({ type: "rare", ...(inside ? { inside: true } : {}) }, (result) => {
            if (!result.ok) {
                this.hud.message(REFUSALS[result.reason] ?? "Only out in the wilds of the world you've opened, with no rare encounter out", 2.5);
            }
        });
    }

    /** A card in play (core/rare.js RARE_CARDS: the Stone Golem's, the Orc King's) dealt before the player at once by its id, its thread brought to it (the debug overlay's): host.js "rare", `card`. */
    dealCard(card) {
        this.#command({ type: "rare", card }, (result) => {
            if (!result.ok) {
                this.hud.message(REFUSALS[result.reason] ?? "Only out in the world of the world you've opened, with no rare encounter out and that card not done", 2.5);
            }
        });
    }

    /** The Behemoth of the Rift called up before the player (the debug overlay's): host.js "rift". */
    rift() {
        this.#command({ type: "rift" }, (result) => {
            if (!result.ok) {
                this.hud.message("Only out in the world of the world you've opened, with no Behemoth about", 2.5);
            }
        });
    }

    // The colossal near the player (the Behemoth of the Rift: #bossBar's, within COLOSSAL_FRAMED
    // metres of them), framed by the camera whoever they're fighting, drawn back from as far as
    // it's tall (view.js BIG_FOE `colossal`); or null
    #colossalFoe() {
        const me = this.battle.actor(this.me);
        const boss = this.bossId === null || this.bossId === undefined ? null : this.battle.actor(this.bossId);

        return me && boss && !boss.dead && boss.map === me.map && Math.hypot(boss.x - me.x, boss.y - me.y) <= COLOSSAL_FRAMED ? boss : null;
    }

    // The bar across the top for the great foe nearest the player (hud.js boss): the Behemoth of
    // the Rift (battle.js #colossus), or a world's boss (creatures.js `worldBoss`: the Stone
    // Golem), alive within BOSS_NEAR metres of them; looked for a couple of times a second
    // (MARSHAL.every), its health kept up with every frame
    #bossBar(dt) {
        const me = this.battle.actor(this.me);

        if ((this.bossClock = (this.bossClock ?? 0) - dt) <= 0) {
            this.bossClock = MARSHAL.every;
            this.bossId = me ? (this.battle.actors.find((actor) => (actor.ai === "colossus" || actor.wild?.worldBoss) && !actor.dead && actor.map === me.map && Math.hypot(actor.x - me.x, actor.y - me.y) <= BOSS_NEAR)?.id ?? null) : null;
        }

        const boss = this.bossId === null || this.bossId === undefined ? null : this.battle.actor(this.bossId);

        // (Its name as a title: "The Stone Golem of Harrowstone", a rare card's foe's)
        this.hud.boss(boss && !boss.dead ? { name: boss.name.replace(/^the /, "The "), hp: boss.hp, maxHp: boss.maxHp } : null);
    }

    // What the mouse pointer shows over the view, looked at again every AIM_MS while the mouse is
    // over it: what a click there would do (#aimAt)
    #aim(now) {
        if (!this.cursor || !this.hovering || now - this.aimedAt < AIM_MS) {
            return;
        }

        this.aimedAt = now;
        this.cursor.aim(this.#aimAt(this.hovering.x, this.hovering.y));
    }

    // The mouse gone off the view, or the game no longer listening: the plain sword
    #unaim() {
        this.hovering = null;
        this.cursor?.aim(null);
    }

    /**
     * What a click at a point on the view would do, for the pointer to show (app/pointer.js AIMS):
     * "attack" an enemy, "talk" to someone (or trade with another player), "hand" for something
     * on the ground to pick up or search (or the war table, to open its map; or a lectern, to read
     * what's on it; or a sign on a trail; or a shrine, to pray at), "enter" for a door,
     * the stairs or the guild's portal; null for the ground (or the player). As tap() chooses, in
     * its order, without doing any of it.
     */
    #aimAt(clientX, clientY) {
        const me = this.battle.actor(this.me);
        const found = this.#whoIsAt(clientX, clientY, { player: true, folk: true })?.actor ?? null;
        const who = found === me ? null : found;

        if (who) {
            return me && !this.battle.hostile(who, me) && !this.host.invader(who.id) ? "talk" : "attack";
        }

        if (this.drops?.at(clientX, clientY, (point) => this.view.toScreen(point)) || this.#lecternAt(clientX, clientY) || this.#signAt(clientX, clientY) || this.#shrineAt(clientX, clientY) || this.#obstacleAt(clientX, clientY)) {
            return "hand";
        }

        if (this.doors?.at(this.view.rayAt(clientX, clientY), this.mapId) || this.#portalAt(clientX, clientY)) {
            return "enter";
        }

        return this.#warTableAt(clientX, clientY) ? "hand" : null;
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

    // The lectern on the floor the player's on with something written lying on it (core/
    // writings.js: Sinclair's journal, in his study), if that's what was tapped: { id, piece }
    #lecternAt(clientX, clientY) {
        const writing = writingOn(this.world.maps?.[this.mapId]);

        if (!writing) {
            return null;
        }

        const [ox, oz] = this.originOf(this.mapId);
        const { x, y, w, h } = writing.piece;
        const box = new THREE.Box3(new THREE.Vector3(ox + x, 0, oz + y), new THREE.Vector3(ox + x + w, 1.3, oz + y + h));

        return this.view.rayAt(clientX, clientY).intersectsBox(box) ? writing : null;
    }

    // Walking up to a lectern (it was tapped): there and stopped, what's on it opens; told to do
    // anything else, gone through a door, or stopped short, it's forgotten
    #keepToLectern() {
        if (!this.toLectern) {
            return;
        }

        const me = this.battle.actor(this.me);
        const writing = writingOn(this.world.maps?.[this.mapId]);

        if (!me || me.dead || me.map !== this.toLectern || !writing) {
            this.toLectern = null;

            return;
        }

        if (me.order || me.path.length) {
            return;
        }

        this.toLectern = null;

        if (atWriting(writing.piece, me.x, me.y)) {
            this.readHere();
        }
    }

    // A sign on a trail out in the wilds (core/tracks.js; signs3d.js), if that's what was tapped:
    // its id
    #signAt(clientX, clientY) {
        return this.mapId === "town" && this.trailSigns.shown.size ? this.trailSigns.at(this.view.rayAt(clientX, clientY)) : null;
    }

    // Walking up to a sign on a trail (it was tapped): there and stopped, it's read; told to do
    // anything else, gone in somewhere, or stopped short, it's forgotten
    #keepToSign() {
        if (!this.toSign) {
            return;
        }

        const me = this.battle.actor(this.me);
        const found = this.world.plan ? signOf(this.world.plan, this.toSign) : null;

        if (!me || me.dead || me.map !== "town" || !found) {
            this.toSign = null;

            return;
        }

        if (me.order || me.path.length) {
            return;
        }

        const id = this.toSign;

        this.toSign = null;

        if (Math.hypot(me.x - found.sign.at[0], me.y - found.sign.at[1]) <= TRAILS.reach) {
            this.#readSign(id);
        }
    }

    // Read a sign on a trail the player's beside (host.js #readSign): what came of it's said as
    // it's heard (#signRead)
    #readSign(id) {
        this.#command({ type: "read", sign: id }, (result) => {
            if (!result.ok) {
                this.hud.message(REFUSALS[result.reason] ?? "Can't do that.", 1.6);
            }
        });
    }

    // A shrine out in the world come within SHRINE_TAP.seen of the player for the first time this
    // game (core/shrines.js): said whose it is, and that they may pray there (tapping it)
    #nearShrine() {
        const me = this.battle.actor(this.me);
        const plan = this.world.plan;

        if (!plan || !me || me.dead || me.map !== "town") {
            return;
        }

        const shrine = shrinesOf(plan).find(({ site, at }) => !this.shrinesNear.has(site.id) && Math.hypot(at[0] - me.x, at[1] - me.y) <= SHRINE_TAP.seen);

        if (shrine) {
            this.shrinesNear.add(shrine.site.id);
            this.hud.message(`A shrine to ${godWords(shrine.god)}: ${PANTHEON[shrine.god].domain}. Tap it to pray there.`, 4);
        }
    }

    // Where a shrine's heart is (sites.js heartOf: the space before its figure, where they kneel)
    #shrineHeart(id) {
        const shrine = shrineOf(this.world.plan, id);

        return this.world.maps.town?.sites?.heartOf(shrine.site) ?? shrine.at;
    }

    // A shrine out in the world (core/shrines.js) within SHRINE_TAP.seen of the player, if that's
    // what was tapped (the space before it): its site's id
    #shrineAt(clientX, clientY) {
        const me = this.battle.actor(this.me);
        const plan = this.world.plan;

        if (this.mapId !== "town" || !me || !plan) {
            return null;
        }

        const ray = this.view.rayAt(clientX, clientY);
        let found = null;
        let nearest = Infinity;

        for (const { site, at } of shrinesOf(plan)) {
            if (Math.hypot(at[0] - me.x, at[1] - me.y) > SHRINE_TAP.seen) {
                continue;
            }

            const [x, z] = this.#shrineHeart(site.id);
            const point = new THREE.Vector3(x, this.#groundOn("town", x, z) + SHRINE_TAP.up, z);
            const along = ray.origin.distanceTo(point);

            if (ray.distanceToPoint(point) <= SHRINE_TAP.near && along < nearest) {
                [found, nearest] = [site.id, along];
            }
        }

        return found;
    }

    // Walking up to a shrine (it was tapped): there and stopped, they pray; told to do anything
    // else, gone in somewhere, or stopped short, it's forgotten
    #keepToShrine() {
        if (!this.toShrine) {
            return;
        }

        const me = this.battle.actor(this.me);

        if (!me || me.dead || me.map !== "town" || !this.world.plan) {
            this.toShrine = null;

            return;
        }

        if (me.order || me.path.length) {
            return;
        }

        const id = this.toShrine;
        const [x, y] = this.#shrineHeart(id);

        this.toShrine = null;

        if (Math.hypot(me.x - x, me.y - y) <= SHRINE.reach) {
            this.#pray(id);
        }
    }

    // Pray at the shrine the player's before (host.js #pray): what came of it's said as it's heard
    // (#prayed)
    #pray(id) {
        this.#command({ type: "pray", shrine: id }, (result) => {
            if (!result.ok) {
                this.hud.message(REFUSALS[result.reason] ?? "Can't do that.", 2.5);
            }
        });
    }

    /**
     * Read what's written on the lectern the player stands at (core/writings.js: Sinclair's
     * journal): it opens at its first page, and it's kept in their journal to read again
     * (memory.writings: told so the first time). Returns { ok, id }, or { ok: false } if they're
     * at none.
     */
    readHere() {
        const me = this.battle.actor(this.me);
        const writing = writingOn(this.world.maps?.[this.mapId]);

        if (!me || me.dead || !writing || me.map !== this.mapId || !atWriting(writing.piece, me.x, me.y)) {
            return { ok: false };
        }

        const read = this.memory.writings ?? [];

        if (!read.includes(writing.id)) {
            this.memory.writings = keepRead(read, writing.id);
            this.#keepTalks();
            this.hud.message(`${WRITINGS[writing.id].title}: kept in your journal, under Writings.`, 3);
        }

        this.read(writing.id);

        return { ok: true, id: writing.id };
    }

    /** Open a writing the player's read (core/writings.js WRITINGS' id) at its first page, everything else closed. */
    read(id) {
        if (!WRITINGS[id] || !(this.memory.writings ?? []).includes(id)) {
            return;
        }

        this.closePack();
        this.closeJournal();
        this.closeSpellbook();
        this.closeParty();
        this.reader.show(id);
        this.sound?.play("bookOpen");
    }

    /** Close what's being read. */
    closeReader() {
        this.reader?.hide();
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

        const refresh = () => battleMapView(this.host.war, this.self.realm, { explored: this.explored, rank: this.standing.rank() });
        const view = refresh();

        // (Read: what its scouts see, and where their side's towns, works and forts stand,
        // uncovered on the player's own maps from now on: core/host.js #tableRead)
        this.#command({ type: "table", read: true });

        this.onWorldMap({ war: { view, refresh, realm: town.owner, act: (action, then) => this.atTable(action, then) } });

        return { ok: true, view };
    }

    /**
     * Orders given, or counsel, at the war table the player stands at (app/battlemap.js
     * actionsAt's: core/host.js #atTable). `then` hears what's said of it, and whether it was
     * heeded: "So be it: the army marches on Grimhold."; or why not.
     */
    atTable({ orders = null, realm = null, counsel = null }, then = null) {
        return this.#command({ type: "table", orders, realm, counsel }, (result) => {
            then?.(result?.ok ? heededText({ orders, counsel }, this.host.war) : (REFUSALS[result?.reason] ?? REFUSALS.command), Boolean(result?.ok));
        });
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

        if (this.talk?.open || this.pack?.open || this.journal?.open || this.spellbook?.open || this.partyPanel?.open || this.fate?.open) {
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

        const { spell, order, ability, item, emote, unit } = actionOf(action) ?? {};
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

        // (What one of the player's own's told: core/host.js #orderUnit; holding fire, or at will
        // again if they are)
        if (unit) {
            this.#orderUnit(target, unit === "stance" ? (this.host.stance(target).holdFire ? "free" : "hold") : unit);

            return { ok: true };
        }

        const command = spell ? { type: "cast", spell, target: on } : ability ? { type: "ability", ability, target: on } : order ? { type: order, target, ...(order === "engage" ? this.#locking() : {}) } : item ? { type: "use", item, target: on } : emote ? { type: "emote", emote } : null;

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
                // (Enemies first, where they and the player overlap: the player counted a little
                // further off than they are, whichever's looked at first, so a tap on whoever's
                // just beyond their head, the camera behind them, is that one's)
                const distance = point ? Math.hypot(point.x - clientX, point.y - clientY) + (mine ? 6 : 0) : Infinity;

                if (distance < bestDistance) {
                    best = { actor, wheel: mine ? "self" : enemy ? "enemy" : provokes && soldiers ? "provoke" : allies ? (this.#ownUnit(actor.id) ? "unit" : "ally") : "talk" };
                    bestDistance = distance;
                }
            }
        }

        return best;
    }

    // The finger's been held on someone: open the wheel at its first side, its middle right under
    // where the finger went down, which the way it's flicked is measured from
    #openWheel(pointer, { actor, wheel }) {
        const player = this.battle.actor(this.me);

        if (!this.running || player.dead || actor.dead || this.pointers.size !== 1) {
            return;
        }

        pointer.wheel = { originX: pointer.startX, originY: pointer.startY, target: wheel === "self" ? "self" : actor.id, kind: wheel, side: 0, refused: null, done: false };
        this.#showWheel(pointer.wheel, pointer.startX, pointer.startY);
        this.sound?.play("wheel");
        globalThis.navigator?.vibrate?.(12);
    }

    // A wheel open (or turned over) at a point on the screen: its side's slices, how many of each
    // thing to use there are, which can't be used as things are, and what's cooling down
    #showWheel(open, x, y) {
        // (One of the player's own: their followers' wheel, what to tell them and what to cast on
        // them or give them, their ability by its own name and holding fire or fighting at will
        // as they are; anyone else not an enemy: the player's own, only what can be cast on them)
        const commands = open.kind === "unit";
        const friendly = open.kind === "ally";
        const slots = open.kind === "provoke" ? WHEELS.provoke[0] : (this.wheels[friendly ? "self" : open.kind]?.[open.side] ?? {});
        const unit = commands ? this.battle.actor(open.target) : null;
        const waiting = commands && this.host.waiting(open.target);
        const stance = commands ? this.host.stance(open.target) : null;
        const ability = commands ? this.host.unitAbility(open.target) : null;
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
            // on someone else who isn't an enemy, anything but a spell that can be cast on them,
            // and on one of their own, a thing to give them besides)
            const notForThem = (friendly || commands) && (action?.spell ? !forFriends(action.spell) : action?.item ? !(commands && action.give) : action?.unit ? !commands : Boolean(action));
            // (Told to do what they're doing already: following, waiting or guarding; or to use an
            // ability they haven't)
            const already = commands && ((action?.unit === "wait" && waiting) || (action?.unit === "follow" && !waiting && !unit?.assist && !stance.guarding) || (action?.unit === "guard" && !waiting && stance.guarding) || (action?.unit === "ability" && !ability));

            if (notForThem || already || (action?.item && !counts[action.item]) || (action?.learnt && !learnt.includes(action.learnt)) || (blow && !weapon?.attacks.some(({ kind }) => (kind === "ranged" ? "ranged" : "melee") === blow))) {
                off.push(direction);
            }
        }

        const looks = commands ? this.#unitLooks(stance, ability) : null;

        this.wheel.show(x, y, open.target, slots, { side: open.side, flip: open.kind !== "provoke", counts, off, looks });
        this.wheel.setCooldown(this.#cooldowns(slots, commands ? open.target : null));
    }

    // How the followers' wheel's own slices look held on one of them: their ability by its name and
    // icon (core/followers.js UNIT_ABILITIES); Hold fire, or At will if they're holding fire
    #unitLooks(stance, ability) {
        return {
            ...(ability ? { "unit:ability": { label: ability.label, icon: abilityIcon(ability) } } : {}),
            ...(stance?.holdFire ? { "unit:stance": { label: "At will", icon: iconOf("unit:free") } } : {}),
        };
    }

    // How much of each slice's cooldown is left (0 to 1, by direction): each spell's (its own, or
    // the one all share, whichever's longer), and each blow's own; on one of the player's own's
    // wheel (`unit`: their id), their ability's
    #cooldowns(slots, unit = null) {
        const shares = {};
        const readyAt = this.host.players.get(this.me)?.readyAt ?? {};
        const theirs = unit ? this.host.unitAbility(unit) : null;

        for (const [direction, key] of Object.entries(slots ?? {})) {
            const action = actionOf(key);
            const cooldown = ABILITIES[action?.ability]?.cooldown;

            if (action?.unit === "ability" && theirs) {
                shares[direction] = Math.max(0, Math.min(1, (theirs.readyAt - this.battle.time) / theirs.cooldown));
            } else if (action?.spell) {
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
        const cooling = (this.#cooldowns({ [direction]: action }, open.kind === "unit" ? open.target : null)[direction] ?? 0) > 0;

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
     * What's on the player's action wheels (their own, an enemy's and their followers', two sides
     * each), what can be put on each (app/wheel.js assignable), and how many of each thing they
     * carry: for the Action wheels options.
     */
    wheelSetup() {
        const learnt = [...this.progress.known(), ...this.progress.abilities()];
        const carries = this.progress.carried();

        const counts = Object.fromEntries(Object.keys(ITEMS).map((id) => [id, this.progress.count(id)]));

        return { wheels: structuredClone(this.wheels), choices: Object.fromEntries(SETTABLE.map((wheel) => [wheel, assignable(wheel, { learnt, carries })])), counts };
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

    // --- The Action Bar (app/quickbar.js) ---

    // Is anyone after the player: an enemy on their map set to fight them, or striking at them?
    #underAttack(player) {
        return this.battle.actors.some((other) => (other.target === player.id || other.attack?.target === player.id) && !other.dead && other.map === player.map && this.battle.hostile(other, player));
    }

    // The Action Bar up in a fight (an enemy the player's set to fight, `target`, or anyone
    // after them) and for a moment after it, or always (`quickAlways`), each greyed while it can't
    // be used and swept over while it cools down
    #quickActions(target) {
        const player = this.battle.actor(this.me);
        const alive = Boolean(player) && !player.dead;

        if (alive && (target || this.#underAttack(player))) {
            this.fightUntil = this.clock + QUICK_LINGER;
        }

        this.quickBar.raise(alive && (this.quickAlways || this.clock < this.fightUntil));

        // (A Prismatic chain's next spell rolled in, up, where it's come in place of another)
        const { keys, chain } = this.#quickKeys();
        const shown = this.quickShowing ?? keys;

        this.quickShowing = keys;

        if (!this.quickBar.up) {
            return;
        }

        keys.forEach((key, slot) => {
            if (key !== shown[slot] && chain[slot]) {
                this.quickBar.roll(slot, "up", key);
            }
        });

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

        this.quickBar.fill(keys, { counts, off, chain });

        const cooling = this.#cooldowns(Object.fromEntries(keys.map((key, slot) => [slot, key])));

        this.quickBar.setCooldown(keys.map((_, slot) => cooling[slot] ?? 0));
    }

    // The player's Prismatic chain, as the battle has it (core/prismatic.js), or null for none
    #prism() {
        return this.battle.actor(this.me)?.prism ?? null;
    }

    // The player's legendary weapon's charge, as the battle has it (core/legendary.js: app/
    // charge.js), or null for none in hand
    #charging() {
        const actor = this.battle.actor(this.me);

        // (No charge to an effect on every blow: a unique's cleave, core/legendary.js `always`)
        return actor?.legendary && !EFFECTS[actor.legendary.effect]?.always ? { effect: actor.legendary.effect, charge: actor.charge ?? 0, of: actor.legendary.charge, foughtAt: actor.foughtAt ?? -Infinity } : null;
    }

    // How each foe with a plate over it looks to the player (core/might.js: Host fightFor), every
    // SIZE_UP seconds: its plate coloured by how a fight with it would go for them, and, while
    // Evaluate's on them (spells.js evaluate), its power by its name
    #sizeUp(dt) {
        this.sizingIn = (this.sizingIn ?? 0) - dt;

        if (this.sizingIn > 0) {
            return;
        }

        this.sizingIn = SIZE_UP;

        const me = this.battle.actor(this.me);
        const evaluating = Boolean(me && this.battle.buffOf(me, "evaluate"));
        const might = me ? this.host.mightFor(this.me) : 0;

        for (const id of this.hud.tracked.keys()) {
            const foe = this.battle.actor(id);
            const fight = me && foe && !foe.dead && foe.kind !== "fort" && foe.kind !== "stakes" && this.battle.hostile(foe, me) ? this.host.fightFor(this.me, id) : null;

            this.hud.sizeUp(id, fight ? { look: fightLook(might - fight.power), power: evaluating ? fight.power : null, pack: fight.pack } : {});
        }
    }

    // Each legendary weapon in hand drawn with its effect's look (world/legendaries.js), more of it
    // trailing a blow being struck
    #wielding(dt) {
        const wielders = [];

        for (const id of this.host.players.keys()) {
            const actor = this.battle.actor(id);
            const avatar = this.avatars.get(id);

            if (actor?.legendary && !actor.dead && avatar && actor.map === this.mapId) {
                wielders.push({ id, effect: actor.legendary.effect, avatar, striking: Boolean(actor.attack && !actor.attack.struck) || this.battle.time - (this.lastAttack.get(id) ?? -Infinity) < STRIKING_MS });
            }
        }

        this.legendaries?.update(dt, wielders);
    }

    // A legendary weapon's effect let loose (battle.js "unleashed": core/legendary.js), where it
    // was: ice bursting round the foe frozen in it, a ring of fire, stone spears from the ground,
    // lightning leaping foe to foe, a white flash and a ring round a blast (the blast itself, and
    // those it throws, as a blast's: #blast), an axe's blow cleaving on through others; heard,
    // and, the player's own, their charge flaring as it empties
    #unleashed(event) {
        // (A ward's let loose on whoever wears it (Stoneheart's stone skin), not by a weapon's charge:
        // they're told what it does to them; a cleave by every blow, with none)
        const def = EFFECTS[event.effect];
        const ward = def?.ward ? (WARD_LOOKS[def.element] ?? WARD_LOOKS.earth) : null;

        if (event.id === this.me && !ward && !def?.always) {
            this.charge.flare();
        } else if (event.id === this.me && ward) {
            this.hud.message(`${def.label}: ${def.felt ?? "it's let loose on you!"}`, 1.6);
        }

        if (event.map !== this.mapId) {
            return;
        }

        const [ox, oz] = this.originOf(event.map);
        const at = new THREE.Vector3(ox + event.x, 0, oz + event.y);
        const point = this.avatars.get(event.target)?.point(0.6) ?? at.clone().setY(1);
        const fx = this.spellFx;
        const radius = event.radius ?? 1.5;

        if (event.effect === "frostbind") {
            fx.flash(point, { colour: 0xbfe8ff, intensity: 40, distance: 10, life: 0.35, size: 3 });
            fx.spikes(at, { count: 16, radius: 0.45, height: 1.7, colour: 0xa8dcf8, life: 2.2, lean: 0.22, glow: true });
            fx.shards(point, { count: 30, colour: 0xdff4ff, size: 0.08, speed: 3, up: 1.5, life: 0.8, glow: true });
            fx.ring(at, { colour: 0x8fd8ff, from: 0.2, to: 2.2, life: 0.5 });
            fx.spray(UNLEASHED_MOTES.frost, point);
        } else if (event.effect === "cinderburst") {
            fx.flash(point, { colour: 0xff7a2a, intensity: 45, distance: 12, life: 0.4, size: 3 });
            fx.ring(at, { colour: 0xff4a0a, from: 0.3, to: radius, life: 0.45 });
            fx.ring(at, { colour: 0xffc060, from: 0.2, to: radius * 0.8, life: 0.6 });
            fx.decal(at, { texture: "scorch", colour: 0x1a0a04, radius, life: 6 });
            fx.scatter(UNLEASHED_MOTES.fire, at, radius, 3, { seconds: 0.3 });
        } else if (event.effect === "earthsunder") {
            fx.spikes(at, { count: 8 + Math.round(radius * 6), radius, height: 1.3, colour: 0x8a7a66, life: 1.4, lean: 0.35, scatter: true, stagger: 0.15 });
            fx.decal(at, { texture: "cracks", colour: 0x2a2218, radius: radius * 1.2, life: 5 });
            fx.ring(at, { colour: 0xe8c880, from: 0.3, to: radius + 0.6, life: 0.5 });
            fx.scatter(UNLEASHED_MOTES.dust, at, radius, 2, { seconds: 0.2 });
            fx.shake(0.12);
        } else if (event.effect === "stormlash") {
            fx.lightning(point.clone().add(new THREE.Vector3(0.6, 6, 0.3)), point.clone(), { colour: 0x9ab8ff, width: 0.07, life: 0.35, jag: 0.8, branches: 2 });
            fx.flash(point, { colour: 0xcfe0ff, intensity: 45, distance: 12, life: 0.3, size: 3 });

            let from = point;

            for (const id of event.struck.slice(1)) {
                const to = this.avatars.get(id)?.point(0.6);

                if (to) {
                    fx.lightning(from.clone(), to.clone(), { colour: 0x9ab8ff, width: 0.05, life: 0.35, jag: 0.45, branches: 1 });
                    fx.spray(UNLEASHED_MOTES.sparks, to);
                    from = to;
                }
            }
        } else if (event.effect === "ruinblast") {
            fx.flash(point, { colour: 0xfff4c0, intensity: 60, distance: 14, life: 0.3, size: 4 });
            fx.ring(at, { colour: 0xffd060, from: 0.3, to: radius * 1.4, life: 0.55 });
        } else if (event.effect === "cleave") {
            // (A blow carried on through the others before its wielder: a pale arc swept out to its
            // reach, and a bright spray off each it caught)
            fx.ring(at, { colour: 0xe8eef4, from: 0.6, to: radius, life: 0.28, opacity: 0.55 });

            for (const id of event.struck) {
                const hit = this.avatars.get(id)?.point(0.6);

                if (hit) {
                    fx.spray(UNLEASHED_MOTES.sparks, hit);
                }
            }
        } else if (ward) {
            // (A ward on whoever wears it a while (Stoneheart's skin of stone): a shell the colour of
            // its element closing round them and holding while it lasts, shards thrown off, a ring
            // of dust)
            const avatar = this.avatars.get(event.target);

            fx.wardShell(() => this.avatars.get(event.target)?.object.position ?? null, { colour: ward.shell, height: avatar?.character?.height ?? 1.8, life: Math.max(1, (event.until - this.battle.time) / 1000), rise: 0.08, opacity: 0.7 });
            fx.shards(point, { count: 18, colour: ward.shards, size: 0.07, speed: 2.5, up: 1.4, life: 0.7 });
            fx.ring(at, { colour: ward.ring, from: 0.3, to: 1.6, life: 0.45 });
            fx.scatter(UNLEASHED_MOTES.dust, at, 1.2, 2, { seconds: 0.2 });
        }

        // (A blast heard as a blast: #blast)
        if (event.effect !== "ruinblast") {
            this.sound?.play(UNLEASHED_SOUNDS[event.effect] ?? ward?.sound, { at, far: BLAST_HEARD.far });
        }
    }

    // What each of the Action Bar's actions shows, and is used for: what the player's put in it; but, while a
    // Prismatic chain of theirs is live, one holding a spell of an element it goes on with (the
    // element being cast up through, or, between chains, any whose piece isn't held) the chain's
    // next spell of it (core/prismatic.js nextOf), if they know it, ringed (`chain`: its element,
    // by slot). What they've put there is kept as it is, and shown again as the chain moves on.
    #quickKeys() {
        const prism = this.#prism();
        const chain = {};
        const keys = this.wheels.quick.map((key, slot) => {
            const element = SPELLS[actionOf(key)?.spell]?.school;
            const next = nextOf(prism, element);

            if (!next || !this.progress.knows(next)) {
                return key;
            }

            chain[slot] = element;

            return next;
        });

        return { keys, chain };
    }

    // Why an Action Bar action can't be used as things are, but for cooling down (or null): nothing in
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

    /** Show four of the Action Bar's actions (with their names) or six across (`count`: QUICK_SHOWN; Game options). */
    showQuick(count) {
        this.quickShown = count === QUICK_SHOWN.six ? QUICK_SHOWN.six : QUICK_SHOWN.four;
        this.quickBar?.show(this.quickShown);
    }

    /**
     * An Action Bar action flicked `way` ("up" or "down"): a school's spell in it turned to the next of
     * its school's spells the player knows, or the last (app/wheel.js flicked), rolled in, and kept
     * as if it had been put there in the Action Bar options; at either end of its school, or
     * not a school's spell, it bounces. Returns what's in it now, and whether it turned.
     */
    flickQuick(slot, way) {
        const quick = [...this.wheels.quick];
        const key = quick[slot] ?? null;
        const next = flicked(key, way, this.progress.known());

        if (!next) {
            this.quickBar?.bounce(slot, way);
            this.sound?.play("tap");

            return { key, turned: false };
        }

        quick[slot] = next;
        this.setQuick(quick);
        this.quickBar?.roll(slot, way, next);
        this.sound?.play("wheelSelect");

        return { key: next, turned: true };
    }

    // An Action Bar press lost, or the thumb stick's (`slot`: "stick"; app/press.js,
    // app/steering.js: its lift never heard, as a phone's Safari can lose it, and dropped as the
    // next began or once no finger was on the screen), kept in the debug log: which slot, what was
    // in it, how long it was held, how it was found and whether the bar was up
    #pressLost(slot, { ms, how, last = null }) {
        const found = how === "bare" ? "let go of once no finger was on the screen" : "taken over by the next";
        const what = slot === "stick" ? "The thumb stick's touch" : `Action Bar slot ${slot + 1}'s press`;

        telemetry.keep("press", {
            summary: `${what} was lost, its lift never heard: ${found}, ${(ms / 1000).toFixed(1)} s after it began`,
            slot,
            action: slot === "stick" ? null : (this.wheels.quick[slot] ?? null),
            ms: Math.round(ms),
            how,
            last,
            up: this.quickBar.up,
            state: this.telemetryState(),
        });
    }

    /**
     * Use one of the Action Bar's actions (its slot, 0 to 5, from the left): an attack, a hex or a blow on the enemy
     * the player's set to fight, anything else on themselves; refused (and said why) if it can't
     * be, as things are, or is cooling down. An empty slot's to be filled (onChooseQuick).
     */
    quick(slot) {
        const key = this.#quickKeys().keys[slot] ?? null;
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

        // (Healing or a ward, with one of the party chosen to help: on them)
        const ally = this.#ally();
        const on = offensive(key) ? target.id : ally && forFriends(actionOf(key)?.spell) ? ally.id : "self";

        return this.act(key, on, { refused: () => this.quickBar?.mark(slot, "refused") });
    }

    /**
     * The Prismatic sigil tapped (app/sigil.js): what it may be spent on cast on the enemy the
     * player's set to fight (core/prismatic.js sigilSpell: whole, Prismatic Destruction; an
     * element's piece just earned, that element's Prismatic spell); refused (and said why) if
     * there's nothing to spend it on, or no one to cast it on.
     */
    castPrismatic() {
        const spell = sigilSpell(this.#prism());
        const target = this.#target();
        const why = !spell ? "sigil" : !target ? "untargeted" : null;

        if (why) {
            this.hud.message(QUICK_REFUSALS[why] ?? CAST_FAILURES[why], 1.6);
            this.sound?.play("denied");

            return { ok: false, reason: why };
        }

        return this.act(spell, target.id);
    }

    /**
     * What's on the player's Action Bar, what can be put on it (app/wheel.js assignable), and
     * how many of each thing they carry: for the Action Bar options.
     */
    quickSetup() {
        const learnt = [...this.progress.known(), ...this.progress.abilities()];
        const counts = Object.fromEntries(Object.keys(ITEMS).map((id) => [id, this.progress.count(id)]));

        return { quick: [...this.wheels.quick], choices: assignable("quick", { learnt, carries: this.progress.carried() }), counts };
    }

    /** Put things on the player's Action Bar (as the Action Bar options have them), and keep them. */
    setQuick(quick) {
        this.wheels = readWheels({ ...this.wheels, quick });
        this.onWheels(structuredClone(this.wheels));
    }

    /**
     * A tap on the minimap, at a point on the player's map (x, z metres) and on the screen
     * (clientX, clientY): fight an enemy within `reach` metres of it, or walk there. Twice in
     * quick succession, run.
     */
    mapTap({ x, z, reach = 3, clientX = 0, clientY = 0, run = false, time = performance.now(), member = null }) {
        this.#wake();

        // (Another of their party marked at the edge, tapped: who it is and how far, which way)
        const fellow = member ? this.partyView().find(({ id }) => id === member) : null;

        if (fellow) {
            const way = bearing(this.#whereAmI(), [fellow.x, fellow.z], 10);

            this.hud.message(`${fellow.name}${fellow.inside ? `, ${fellow.inside}` : ""}${way && way !== "here" ? `: ${way}` : ""}`, 3);

            return;
        }

        const player = this.battle.actor(this.me);
        const enemies = this.battle.actors.filter((actor) => player && this.battle.hostile(actor, player) && !actor.dead && actor.map === player.map);
        const distance = (actor) => Math.hypot(actor.x - x, actor.y - z);
        const enemy = enemies.filter((actor) => distance(actor) <= reach).sort((a, b) => distance(a) - distance(b))[0] ?? null;

        // (Their own mark tapped, as near as an enemy's would be picked, where going would take
        // them nowhere: the camera swung round behind them instead)
        if (!enemy && player && distance(player) <= reach) {
            this.recentre();

            return;
        }

        this.#order({ enemy, ground: enemy ? null : [x, z] }, { clientX, clientY, run, time, from: "map" });
    }

    // The player going somewhere (walking or running: after someone, to a place, through a door),
    // stopped: still set on whoever they were after, where they stand. Whether they were
    #halt() {
        const player = this.battle.actor(this.me);
        const order = player?.order;

        if (!player || player.dead || !order || (order.type === "engage" && order.stand)) {
            return false;
        }

        this.#endTalk();
        this.approaching = null;
        this.#command(order.type === "engage" ? { type: "engage", target: order.target, stand: true } : { type: "stop" });

        return true;
    }

    // A door into a place whose creatures are drawn from models not read yet (beasts/model.js
    // modelsInside): the player waits at it while they're got ready, fetched and read
    // (readyModels), the world stopped if no one else is in it, a card saying how far it's got
    // (app/readying.js); then through it, as tapped. Go in now goes through at once (those not
    // ready drawn as their stand-ins till they are), Not now stays out (what's begun fetched on, no
    // longer hurried). Returns whether it's waiting.
    #readyAtDoor(door, run) {
        const player = this.battle.actor(this.me);
        const building = player?.map === "town" ? this.world.interiors?.buildings.get(door.link.building) : null;
        const kinds = modelsInside(building).filter((kind) => !modelOf(kind));

        if (!kinds.length) {
            return false;
        }

        const readying = readyModels(kinds);
        const waiting = { kinds: readying.kinds };

        this.readyingAt = waiting;
        this.readyCard ??= new Readying(document);
        this.pause();
        this.readyCard.show({
            name: building.name,
            kinds: readying.kinds.map((id) => ({ id, name: CREATURES[id]?.name ?? id })),
            progress: readying.progress,
            onClose: (how) => {
                if (this.readyingAt === waiting) {
                    this.readyingAt = null;
                }

                if (how === "back") {
                    readying.calm();
                }

                this.start();

                if (how !== "back") {
                    this.#command({ type: "enter", link: door.link.id, run }, (result) => this.#doorRefused(result));
                    this.doors.light(door, this.clock);
                }
            },
        });
        readying.ready.then(() => this.readyingAt === waiting && this.readyCard.ready());

        return true;
    }

    // A way in that wouldn't let the player through: why, said (a hell's portal sealed, or cold by
    // day; a thread's lock)
    #doorRefused(result) {
        if (!result?.ok && result?.reason) {
            this.hud.message(REFUSALS[result.reason] ?? "There's no way through there.", 3);
            this.sound?.play("denied");
        }
    }

    // Send the player to fight an enemy, through a door (or up or down the stairs), or to a point
    // on the ground ([x, z] metres, on their map), running if told to or tapped twice in quick
    // succession (in the same place: the view or the minimap)
    #order({ enemy, door = null, portal = null, table = null, lectern = null, sign = null, shrine = null, ground }, { clientX, clientY, run, time, from }) {
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

        // An enemy: set on them where the player stands (whoever they were set on, or going up to,
        // they stop: tapped on whoever they're set on, they stop going after them); tapped twice
        // in quick succession, running up to them, into reach of what's in hand
        if (enemy) {
            const chosen = player.order?.type === "engage" && player.order.target === enemy.id;

            this.#command(run ? { type: "engage", target: enemy.id, run, ...this.#locking() } : { type: "engage", target: enemy.id, stand: true, ...this.#locking() });

            if (!chosen) {
                this.sound?.play("lock");
            }

            return;
        }

        // The door's edge glows green as they make for it (once what's in there's ready, if it
        // isn't: #readyAtDoor)
        if (door) {
            // (A way in kept shut, a thread's lock or a hell's seal: what might open it said at once,
            // and not walked to: core/rare.js LOCKS)
            const shut = this.host.shutOf?.(door.link.id, player.map, this.me);

            if (shut) {
                this.hud.message(shut.hint, 4);
                this.sound?.play("denied");

                return;
            }

            if (!this.#readyAtDoor(door, run)) {
                this.#command({ type: "enter", link: door.link.id, run }, (result) => this.#doorRefused(result));
                this.doors.light(door, this.clock);
            }

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

        // A lectern, what's written on it to be read: up to it, and it opens (#keepToLectern)
        if (lectern) {
            const [ox, oz] = this.originOf(player.map);
            const square = beforeWriting(lectern.piece);

            if (atWriting(lectern.piece, player.x, player.y) && !player.path.length) {
                this.readHere();

                return;
            }

            this.#command({ type: "move", to: square, run });
            this.toLectern = player.map;
            this.effects.markTarget(ox + square[0] + 0.5, oz + square[1] + 0.5);

            return;
        }

        // A sign on a trail: up to it, and it's read (#keepToSign)
        if (sign) {
            const [ox, oz] = this.originOf(player.map);
            const [x, y] = signOf(this.world.plan, sign).sign.at;
            const square = [Math.floor(x), Math.floor(y)];

            if (Math.hypot(player.x - x, player.y - y) <= TRAILS.reach && !player.path.length) {
                this.#readSign(sign);

                return;
            }

            this.#command({ type: "move", to: square, run });
            this.toSign = sign;
            this.effects.markTarget(ox + square[0] + 0.5, oz + square[1] + 0.5);

            return;
        }

        // A shrine: up to it, and they pray there (#keepToShrine)
        if (shrine) {
            const [ox, oz] = this.originOf(player.map);
            const [x, y] = this.#shrineHeart(shrine);
            const square = [Math.floor(x), Math.floor(y)];

            if (Math.hypot(player.x - x, player.y - y) <= SHRINE.reach && !player.path.length) {
                this.#pray(shrine);

                return;
            }

            this.#command({ type: "move", to: square, run });
            this.toShrine = shrine;
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

    // What the player does, sent to the host (core/host.js command): { ok }, or { ok: false,
    // reason } if it can't be done
    // A command of the player's, to the host: `then` hears what came of it (at once, playing alone
    // or hosting; joined to another's world, once the host's done it and it's been done here too)
    #command(command, then = null) {
        // (Anything the player does themselves ends running somewhere far: not resisting a
        // summons, done for them; and walking up to the portal, the war table, a lectern, a sign or
        // a shrine)
        if (!this.journeying && !(command.type === "summoned" && !command.come)) {
            this.journey = null;
        }

        this.toPortal = null;
        this.toTable = null;
        this.toLectern = null;
        this.toSign = null;
        this.toShrine = null;

        // (Joined: told to the forecast too, which has the hero do it as the host will, as soon as
        // the host will: app/forecast.js)
        if (this.remote) {
            const sent = this.remote.command(command, then);

            this.forecast?.sending(sent.seq, command, this.remote.clock());

            return sent;
        }

        const result = this.host.command(this.me, command);

        then?.(result);

        return result;
    }
}
