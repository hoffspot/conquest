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
import { BeastAvatar, dressCreature } from "../beasts/beast.js";
import { STEP_MS, TALK_REACH } from "../core/battle.js";
import { CREATURES } from "../core/creatures.js";
import { Conversation, treeFor, upstairsIs } from "../core/dialogue.js";
import { HIRES, HOST_PLAYER, Host, PICK_REACH, REFUSALS, SHOP_REACH, SHOPKEEPERS, UNDO_MS } from "../core/host.js";
import { ABILITIES, itemLabel, ITEMS, priceOf, QUALITIES, TREES, wares } from "../core/progress.js";
import { PACE } from "../core/netplay.js";
import { COUNSEL, MOST_REQUESTS, OPENS, progressOf, STANDINGS, whereTo } from "../core/standing.js";
import { describeLeader } from "../core/war/peoples.js";
import { peopleOf, rumourOfRuler, rumoursAt } from "../core/war/news.js";
import { ADJECTIVES } from "../core/war/peoples.js";
import { RISING, STAGES } from "../core/war/war.js";
import { GODS } from "../core/lore/gods.js";
import { BECKON, PLAYER_RESTS_AFTER, REST_EVERY, ROLES } from "../core/roles.js";
import { squaresOf } from "../core/grid.js";
import { GROUND } from "../core/setpieces/pieces.js";
import { CAST_FAILURES, lookOf, SPELLS } from "../core/spells.js";
import { Variety } from "../core/variety.js";
import { distanceBetween, longestReach, weaponOf, WEAPONS } from "../core/weapons.js";
import { Avatar } from "../world/avatar.js";
import { Banners } from "../world/banners3d.js";
import { Camps } from "../world/camps3d.js";
import { Drops } from "../world/drops3d.js";
import { Effects, LOOKS } from "../world/effects.js";
import { Squares } from "../world/squares.js";
import { KINDS, Wounds } from "../world/wounds.js";
import { Chunks, DECK, REACH } from "../world/chunks3d.js";
import { buildGround } from "../world/ground.js";
import { buildTown } from "../world/town3d.js";
import { prepareAtlas } from "../world/art/engine/atlas.js";
import { buildInterior, cutFor } from "../world/interiors3d.js";
import { TREE_WIND } from "../world/art/kits/trees.js";
import { Minimap, treesOf } from "./minimap.js";
import { CameraFollow } from "./camera.js";
import { Doors } from "./doors.js";
import { FatePanel, fateWords } from "./fate.js";
import { itemPicture } from "./icons.js";
import { JournalPanel, bearing, regardOf } from "./journal.js";
import { PackPanel } from "./pack.js";
import { TalkPanel } from "./talk.js";
import { ActionWheel, actionOf, assignable, directionOf, PLACES, readWheels, SIDES, WHEELS } from "./wheel.js";

/** What every new character wears; their weapon (and a bow's quiver) are added to it. */
export const STARTING_OUTFIT = Object.freeze(["tunic", "bracers", "breeches", "boots"]);

/**
 * Everything a character with a starting weapon wears and carries (EQUIPMENT ids): in spiked
 * boots (`boots`, or the boots on their own), instead of leather ones; and any armour worn over
 * it all (`worn`: core/progress.js Progress worn).
 */
export function heroEquipment(weapon, boots = false, worn = [], parts = []) {
    const kicks = boots || weapon === "boots";

    return [...STARTING_OUTFIT.filter((id) => !(kicks && id === "boots")), ...WEAPONS[weapon].equipment, ...(kicks && weapon !== "boots" ? WEAPONS.boots.equipment : []), ...worn, ...parts];
}

/** How a character holds its weapon to fight (actions.js GUARDS, DRAWS), for its WEAPONS key. */
export const guardOf = (weapon) => weaponOf(weapon)?.attacks[0].animation ?? null;

// The sound of drawing each kind of weapon and putting it away (at the moment the hand takes it
// or lets it go): a blade from its scabbard, something slung off the back or from a belt, fists
// clenched
const DRAW_SOUNDS = { sword: ["unsheathe", "sheathe"], punch: ["knuckles", null], kick: ["knuckles", null] };

// How long the dead lie before sinking out of sight (s), and how long they take to sink
const LIE_STILL = 4;
const SINK = 1.5;

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

// How far the camera leans from the player towards who they're fighting: a share of the way,
// up to so many metres
const LEAN = { share: 0.4, most: 4.5 };

// The tavern's folk: how much hair they grow (at most: less than the player, as there are more
// of them), and what each of their acts is: its animation's timing (s) and the sound it makes
const FOLK_HAIR = 0.2;
const ACTS = {
    toast: { hitAt: 1, duration: 3.2, sound: "clink", volume: 1 },
    serve: { hitAt: 0.8, duration: 1.8, sound: "clink", volume: 0.45 },
    pour: { hitAt: 1, duration: 2.8, sound: "pour", volume: 1, early: 0.3 },
    beckon: { hitAt: BECKON.hitAt, duration: BECKON.duration },
    // The smithy's: three blows on the anvil (each ringing and throwing sparks, `beats`: s after
    // key 1), the work thrust into the coals, quenched in the trough (hissing, steam rising), the
    // bellows pumped (the forge's fire flaring), and the grindstone cranked (turning as it is)
    forge: { hitAt: 0.9, duration: 2.6, sound: "anvil", volume: 1, beats: [0, 0.37, 0.71], burst: "sparks", ahead: 0.62, height: 0.9 },
    heat: { hitAt: 0.9, duration: 2.4, sound: "bellows", volume: 0.5, burst: "embers", ahead: 0.9, height: 1, flare: 0.5 },
    quench: { hitAt: 0.8, duration: 2.2, sound: "hiss", volume: 1, burst: "steam", ahead: 0.7, height: 0.7 },
    pump: { hitAt: 0.7, duration: 2.1, sound: "bellows", volume: 1, beats: [0, 0.38, 0.76], flare: 0.8 },
    crank: { hitAt: 0.9, duration: 2.6, sound: "grind", volume: 1, drive: "grindstone" },
    // A temple's: the priest's blessing (a soft chime, a glimmer over the pews), and a candle lit
    bless: { hitAt: 1, duration: 2.8, sound: "healed", volume: 0.35, burst: "blessing", ahead: 0.5, height: 1.7 },
    light: { hitAt: 1, duration: 2.4, burst: "embers", ahead: 0.6, height: 1 },
    // A guild's: a notice stamped, twice (a thump on the counter each time), one filed on the
    // shelves, and the quest board read (paper rustling)
    stamp: { hitAt: 0.8, duration: 2.2, sound: "stepWood", volume: 2, beats: [0, 0.7] },
    file: { hitAt: 0.9, duration: 2, sound: "rustle", volume: 1 },
    read: { hitAt: 0.9, duration: 2, sound: "rustle", volume: 0.6 },
};

// Going through a door or up the stairs, the screen comes up from black this fast (s)
const FADE_IN = 0.45;

// Embers rise from the hearth this often (a second)
const EMBERS = 5;

// The buildings the host has got ready to go into (those near any player: core/host.js
// RELEVANCE), their floors and folk built a piece at a time, for at most `budget` ms a frame; and
// how often (s) the doors of the settlements come to since are picked up
const VISITS = Object.freeze({ every: 0.5, budget: 6 });

// How often a hosted world's goings-on are sent to those who've joined it (seconds: docs/WAR.md M11)
const FLUSH_EVERY = 0.1;

// How far away (metres, either way) anyone's drawn out in the world: another player far off, and
// whoever's near them, aren't (docs/WAR.md M11)
const DRAW_REACH = 160;

// Some of a thing, in words: "a healing draught", "3 healing draughts"
function thingsOf({ id, quality, count = 1 }) {
    const name = itemLabel({ id, quality }).toLowerCase();

    return count > 1 ? `${count} ${name.endsWith("s") ? name : `${name}s`}` : `${/^[aeiou]/.test(name) ? "an" : "a"} ${name}`;
}

// What a thing in the pack is, in words: what it does, and how well made it is
function aboutOf({ id, quality }) {
    const { use, slot, armor = 0 } = ITEMS[id];
    const power = QUALITIES[quality]?.power ?? 1;

    if (use) {
        return use.heal ? `Heals ${use.heal} hit points.` : "Fills your stamina.";
    }

    if (slot === "weapon") {
        return power > 1 ? `A weapon: its blows ${Math.round((power - 1) * 100)}% harder.` : "A weapon.";
    }

    return `Armour: takes ${Math.round(armor * power * 100)}% off each blow.`;
}

// What the host tells of besides the battle's events (#hear)
const HOST_EVENTS = new Set(["open", "close", "join", "leave", "explored", "talk", "effect", "war", "turn", "muster", "dismiss", "camp", "strike", "sortie", "sortied", "envoy", "envoyed", "farewell", "follower", "fate", "unrest", "gone", "rank", "loot", "bought", "sold", "used", "gear", "discarded", "dropped", "picked", "ability", "request", "standing", "gift", "counsel"]);

const _focus = new THREE.Vector3();
const _lean = new THREE.Vector3();
const _hearth = new THREE.Vector3();

export class Game {
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
     */
    constructor({ view, kit, world, hero, hud, sound = null, talks = { memory: {}, knowledge: [] }, onTalk = () => {}, explored = {}, onExplore = () => {}, onWorldMap = () => {}, host = null, me = HOST_PLAYER, war = null, onWar = () => {}, progress = {}, onProgress = () => {}, standing = {}, onStanding = () => {}, followers = [], onFollowers = () => {}, wheels = null, onWheels = () => {}, remote = null }) {
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

        if (!remote) {
            this.host.join({ id: me, hero, talks, explored, progress, standing, followers });
        }

        this.onFollowers = onFollowers;

        /** What's on the player's action wheels: their own and an enemy's, each two sides (app/wheel.js). */
        this.wheels = readWheels(wheels);
        this.onWheels = onWheels;
        this.onProgress = onProgress;
        this.onStanding = onStanding;

        /** Trading with a shopkeeper (from their talk): { shop, keeper (their id), name }, or null. */
        this.shopping = null;
        this.shopWanted = null;

        if (!remote) {
            this.host.populate();
        }

        this.battle = this.host.battle;
        this.avatars = new Map();
        this.previous = new Map();
        this.running = false;
        this.accumulator = 0;
        this.lastFrame = 0;

        /** Timings for the debug overlay (milliseconds, smoothed), and the last frames' times. */
        this.stats = { frame: 0, update: 0, render: 0, steps: 0, fps: 0 };
        this.frameTimes = new Float32Array(120);
        this.frameIndex = 0;
        this.frames = 0;
        this.fpsTime = 0;

        /** When each character last attacked (battle time), to stand on guard for a while after. */
        this.lastAttack = new Map();
        this.flights = new Map();
        this.flash = new Map();

        /** What's to happen a little later (the game's clock, s): [{ at, then }]. */
        this.later = [];

        /**
         * How each character's spells and bolts look (effects.js LOOKS: never the same twice in a
         * row), and the look of each spell being cast and on its way (by whom it's cast, and on
         * whom it lands).
         */
        this.variety = new Map();
        this.casting = new Map();
        this.landing = new Map();

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

        /** The soldiers the host's brought out, still to be drawn (a few a frame: #visit). */
        this.enlisting = [];

        /**
         * When the player last did anything (the game's clock, s), and when they next rest (null
         * until they've stood a while with nothing going on: roles.js PLAYER_RESTS_AFTER).
         */
        this.lastInput = 0;
        this.restAt = null;

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
        this.talking = null;
        this.approaching = null;
        this.talkVariety = new Variety();
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
    originOf(mapId) {
        return this.world.maps?.[mapId]?.origin ?? [0, 0];
    }

    /**
     * Build everything there is to see: the world round the player (or the ground), the town,
     * the player and the orc, and the shaders to draw them. `onProgress({ label, done, total })`
     * hears how far it's got.
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
        const steps = world.town.pieces.length + world.trees.length + chunks + 6 + floors.length + folk.length;
        let done = 0;
        const step = (label) => onProgress({ label, done: ++done, total: steps });

        // The buildings' textures, painted in workers while the land is laid
        const atlas = prepareAtlas();

        // The town's trees, for hearing their leaves (and the world's, as it's drawn)
        this.townTrees = treesOf(world).map(({ x, y }) => ({ x, z: y }));
        this.sound?.setTrees(this.townTrees);
        onProgress({ label: "Laying the land", done, total: steps });

        if (outside) {
            // The world round where the player starts, a chunk at a time (then more as they go)
            const [x, y] = world.spawns.player;

            this.chunks = new Chunks(world, { undergrowth: view.quality.undergrowth });
            view.scene.add(this.chunks.object);
            await time("chunks", async () => {
                while (this.chunks.update(x + 0.5, y + 0.5) || this.chunks.busy) {
                    onProgress({ label: `Laying the land (${this.chunks.drawn.size} of ${chunks})`, done: ++done, total: steps });
                    await new Promise((resolve) => setTimeout(resolve, 0));
                }
            });
            this.#hearTrees();
        } else {
            this.ground = await time("ground", () => buildGround(world));
            view.scene.add(this.ground);
        }

        step("Building the town");
        await time("atlas", () => atlas);

        const built = done;

        this.town = await time("town", () => buildTown(world, {
            onProgress: (count) => {
                done = built + count;
                onProgress({ label: count < world.town.pieces.length ? `Building the town (${count} of ${world.town.pieces.length})` : `Planting trees (${count - world.town.pieces.length} of ${world.trees.length})`, done, total: steps });
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
        this.drops = new Drops(view.scene, { picture: (id) => this.#itemPicture(id) });
        step(`Dressing ${this.hero.name}`);

        // Everyone in the world as the host has them: the player (and anyone else playing), the
        // orc, and the tavern's folk going about their business (no one fights them)
        let filled = 0;

        for (const actor of [...this.battle.actors]) {
            if (actor.kind === "folk") {
                step(`Filling the tavern (${++filled} of ${folk.length})`);
            } else if (actor.id !== this.me) {
                step(actor.kind === "player" ? `Dressing ${actor.name}` : `Waking the ${actor.name.toLowerCase()}`);
            }

            await time(actor.id === this.me ? "hero" : actor.id, () => this.#dress(actor));
        }

        step("Getting ready to draw");

        this.effects = new Effects(view.scene);

        for (const actor of this.battle.actors) {
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
        this.talk = new TalkPanel(this.hud.root);
        this.pack = new PackPanel(this.hud.root);
        this.pack.onCommand = (command) => this.#packCommand(command);
        this.pack.onWheel = (id) => this.#putOnWheel(id);
        this.pack.onClose = () => this.closePack();
        this.journal = new JournalPanel(this.hud.root);
        this.journal.onAbandon = (id) => {
            this.#command({ type: "abandon", request: id }, () => this.journal.open && this.#showJournal());
        };
        this.journal.onClose = () => this.closeJournal();
        this.fate = new FatePanel(this.hud.root);
        this.talk.onChoose = (index) => this.#say(index);
        this.talk.onClose = () => this.#endTalk();
        this.effects.camera = view.camera;

        // The black the screen dips to going through a door
        this.curtain = document.createElement("div");
        this.curtain.className = "curtain";
        this.hud.root.prepend(this.curtain);

        // Compile every shader now rather than when each thing first comes into view
        await time("shaders", () => view.renderer.compileAsync(view.scene, view.camera));
        step("Ready");

        this.timings = timings;

        const player = this.battle.actor(this.me);

        this.hud.clear();
        this.hud.setPlayer(player);
        this.hud.setGold(this.progress.gold);

        for (const actor of this.battle.actors.filter((other) => other.id !== this.me && !other.neutral)) {
            this.hud.track(actor.id, { ...actor, hostile: this.battle.hostile(actor, player) });
        }
    }

    // Someone in the battle, drawn (once): a player as they made themselves, the orc, one of the
    // folk. Returns their avatar
    #dress(actor) {
        if (this.avatars.has(actor.id)) {
            return this.avatars.get(actor.id);
        }

        const hairDetail = this.view.quality.hair;

        if (actor.kind === "folk") {
            return this.#addFolk(this.host.folk.get(actor.id));
        }

        // A soldier: as their people's are dressed, carrying what they fight with
        if (actor.kind === "soldier") {
            const soldier = this.host.soldiers.get(actor.id);
            const look = soldierLook(soldier);
            const character = new Character(this.kit, { shape: look.shape, look: look.look, equipment: look.equipment, hairDetail: Math.min(hairDetail, FOLK_HAIR) });

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
            const character = new Character(this.kit, { shape: look.shape, look: look.look, equipment: look.equipment, hairDetail: Math.min(hairDetail, FOLK_HAIR) });

            character.sheathe(true);

            return this.#addAvatar(actor.id, character, { walk: look.walk, guard: guardOf(actor.weapon) });
        }

        if (actor.kind === "player") {
            const { hero: { shape, look, weapon, boots }, progress } = this.host.players.get(actor.id);
            const character = new Character(this.kit, { shape, look, equipment: heroEquipment(weapon, boots, progress.worn(), this.host.players.get(actor.id).hero.parts ?? []), hairDetail });

            // (Weapons put away to start with: drawn for a fight)
            character.sheathe(true);

            return this.#addAvatar(actor.id, character, { walk: "natural", guard: guardOf(weapon) });
        }

        // One of the wild's creatures (core/creatures.js): as its kind looks (beasts/)
        if (actor.kind === "beast") {
            return this.#addBeast(actor);
        }

        // The orc
        const preset = PRESETS.orc;
        const character = new Character(this.kit, { shape: preset.shape, look: preset.look, equipment: [...preset.equipment, ...WEAPONS[actor.weapon].equipment], hairDetail });

        character.sheathe(true);

        return this.#addAvatar(actor.id, character, { walk: preset.walk, guard: guardOf(actor.weapon) });
    }

    // Everyone in the battle drawn, and no one who isn't: a player come or gone, the folk of a
    // building let go (those of a building being got ready are drawn a piece at a time: #visit)
    #mirror() {
        const me = this.battle.actor(this.me);

        for (const actor of this.battle.actors) {
            if (!this.avatars.has(actor.id) && actor.kind !== "folk" && actor.kind !== "soldier") {
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

        for (const each of [this.avatars, this.previous, this.flash, this.lastAttack, this.variety, this.casting, this.landing, this.wounds, this.pools]) {
            each.delete(id);
        }
    }

    // One of the folk, looking as they do (Wenches and Ale's as they always have; anyone else as
    // their part and seed have them). Returns their avatar
    #addFolk(one) {
        const look = one.preset ? FOLK[one.preset] : folkLook(one);
        const character = new Character(this.kit, { shape: look.shape, look: look.look, equipment: look.equipment, hairDetail: Math.min(this.view.quality.hair, FOLK_HAIR) });
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

        return avatar;
    }

    #addAvatar(id, character, { wounds = true, ...options }) {
        return this.#register(id, new Avatar(character, options), { wounds });
    }

    // One of the wild's creatures, as its kind looks (the same one of its kind every time, from
    // its id); holding its weapon, if it's people-shaped (and wounded as people are)
    #addBeast(actor) {
        const seed = [...actor.id].reduce((hash, letter) => (Math.imul(hash, 31) + letter.charCodeAt(0)) | 0, 7) >>> 0;
        const weapon = WEAPONS[actor.weapon];
        const avatar = dressCreature(this.kit, actor.wild.creature, { seed, equipment: weapon?.equipment ?? [], guard: weapon ? guardOf(actor.weapon) : null, hairDetail: Math.min(this.view.quality.hair, FOLK_HAIR) });

        avatar.character.sheathe(true);

        return this.#register(actor.id, avatar, { wounds: !(avatar instanceof BeastAvatar) });
    }

    // An avatar drawn, its footsteps heard
    #register(id, avatar, { wounds }) {
        const character = avatar.character;

        // Footsteps, on whatever ground the foot lands on
        avatar.walker.onStep = (foot, speed) => {
            const mapId = this.battle.actor(id)?.map ?? "town";
            const map = this.world.maps?.[mapId] ?? this.world;
            const [ox, oz] = this.originOf(mapId);
            const { x, z } = avatar.object.position;
            const ground = squaresOf(map).ground(Math.floor(x - ox), Math.floor(z - oz));

            this.sound?.step(ground, avatar.object.position, speed);
        };
        character.object.name = id;
        this.view.scene.add(character.object);
        this.avatars.set(id, avatar);

        if (wounds) {
            this.wounds.set(id, new Wounds(character, { seed: this.avatars.size * 17 + 3 }));
        }

        return avatar;
    }

    /** Start playing: the battle and the drawing run, and taps and clicks are listened to. */
    start() {
        // (Listening again, after a pause that couldn't stop the world: pause)
        if (!this.listeners.length) {
            this.#listen();
        }

        if (this.running) {
            return;
        }

        this.running = true;
        this.lastFrame = performance.now();
        this.view.renderer.setAnimationLoop((now) => this.#frame(now));
        this.sound?.setAmbient(this.mapId === "town");
        this.sound?.setPlace(this.#soundOf(this.mapId));
        this.sound?.setPaused(false);
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
     * core/host.js pausable), else it goes on, and only the player's taps and clicks aren't
     * listened to, until start() again. Returns whether it stopped.
     */
    pause() {
        if (this.host.pausable) {
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
    }

    /** Take everything out of the scene (before building another game). */
    dispose() {
        this.stop();
        this.sound?.setAmbient(false);
        this.sound?.setPlace("town");
        this.sound?.setHearth(null);
        this.hud.clear();

        for (const avatar of this.avatars.values()) {
            avatar.object.removeFromParent();
            avatar.character.dispose();
        }

        for (const wounds of this.wounds.values()) {
            wounds.dispose();
        }

        // The town's merged meshes and the ground are this game's own (their materials, but for
        // the ground's, are shared by every game)
        this.town?.object.traverse((node) => node.geometry?.dispose());
        this.ground?.geometry.dispose();
        this.ground?.material.dispose();
        this.chunks?.dispose();
        this.effects?.group.traverse((node) => node.geometry?.dispose());

        // The interiors' merged meshes (their materials are shared by every game)
        for (const interior of this.interiors.values()) {
            interior.object.traverse((node) => node.geometry?.dispose());
            interior.object.removeFromParent();
        }

        this.interiors.clear();
        this.doors?.dispose();
        this.banners?.dispose();
        this.camps?.dispose();

        for (const object of [this.ground, this.town?.object, this.chunks?.object, this.effects?.group, this.effects?.marker, this.effects?.targetRing, this.squares?.object]) {
            object?.removeFromParent();
        }

        this.minimap?.dispose();
        this.wheel?.element.remove();
        this.talk?.panel.remove();
        this.pack?.dispose();
        this.drops?.dispose();
        this.journal?.panel.remove();
        this.fate?.panel.remove();
        this.curtain?.remove();
        this.view.setOccluders(null);
        this.view.setFocus(null);
        this.view.setIndoors(null);
    }

    /** Show the minimap or not. */
    showMinimap(on) {
        this.minimapShown = on;
        this.minimap?.show(on);
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
     * Play on for `seconds` in frames of `frame` seconds without drawing them, then draw once
     * (unless not to `render`: for tests stepping through what happens, drawn only at the end,
     * and debugging on slow machines).
     */
    advance(seconds, { frame = 1 / 30, render = true } = {}) {
        for (let time = 0; time < seconds; time += frame) {
            this.#tick(frame);
        }

        if (render) {
            this.view.render();
        }
    }

    // --- Each frame ---

    #frame(now) {
        const frameStart = performance.now();
        const dt = Math.min(0.1, Math.max(0, (now - this.lastFrame) / 1000));

        this.lastFrame = now;

        const steps = this.#tick(dt);
        const updated = performance.now();

        this.view.render();

        const rendered = performance.now();

        // Timings for the debug overlay
        const smooth = (key, value) => (this.stats[key] += (value - this.stats[key]) * 0.1);

        smooth("frame", dt * 1000);
        smooth("update", updated - frameStart);
        smooth("render", rendered - updated);
        this.stats.steps = steps;
        this.frameTimes[this.frameIndex] = dt * 1000;
        this.frameIndex = (this.frameIndex + 1) % this.frameTimes.length;
        this.frames++;

        if (now - this.fpsTime >= 500) {
            this.stats.fps = (this.frames * 1000) / (now - this.fpsTime);
            this.frames = 0;
            this.fpsTime = now;
        }
    }

    // Run the battle's steps for `dt` seconds, and move everyone to match. Returns the steps run
    #tick(dt) {
        this.accumulator += dt * 1000;

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

        // (Fallen behind the host: caught up, a little at a time)
        for (let extra = 0; this.remote && this.remote.behind > PACE.behind && extra < PACE.catchUp; extra++) {
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

        this.#update(dt, this.accumulator / STEP_MS);

        return steps;
    }

    #update(dt, alpha) {
        const { battle, view, hud } = this;
        const mine = battle.actor(this.me);

        this.clock += dt;
        TREE_WIND.time.value = this.clock;

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

            const x = previous.x + (actor.x - previous.x) * alpha;
            const z = previous.y + (actor.y - previous.y) * alpha;

            avatar.actions.setGuard(!actor.dead && actor.armed && this.#fighting(actor));
            avatar.update(dt, ox + x, oz + z, actor.facing, !actor.attack);
            this.#updateBody(actor, avatar, dt, this.#standsAt(actor.map, x, z));
            hud.setStamina(actor.id, actor.stamina, actor.maxStamina);
        }

        // Projectiles, between their last two steps, rising and falling on the way
        for (const projectile of battle.projectiles) {
            const flight = this.flights.get(projectile.id);

            if (flight) {
                const [ox, oz] = this.originOf(projectile.map);
                const x = ox + flight.previous.x + (projectile.x - flight.previous.x) * alpha;
                const z = oz + flight.previous.y + (projectile.y - flight.previous.y) * alpha;
                const target = this.avatars.get(projectile.target);
                const left = Math.hypot(target.object.position.x - x, target.object.position.z - z);
                const along = flight.distance > 0 ? Math.min(1, Math.max(0, 1 - left / flight.distance)) : 1;
                const height = flight.height + (target.character.height * 0.72 - flight.height) * along;

                this.effects.fly(projectile.id, new THREE.Vector3(x, height + Math.sin(Math.PI * along) * flight.arc, z));
            }
        }

        // The wheel's spells and blows, greyed for as long as they're cooling down
        if (this.wheel?.open) {
            this.wheel.setCooldown(this.#cooldowns(this.wheel.slots));
        }

        // Light gathers in the hand of anyone casting a spell
        for (const actor of battle.actors) {
            if (actor.casting && this.avatars.has(actor.id) && Math.random() < dt * 30) {
                this.effects.charge(lookOf(actor.casting.spell), this.avatars.get(actor.id).hand("Left"), this.casting.get(actor.id) ?? 0);
            }
        }

        // Everything is heard from where the player is
        const me = this.avatars.get(this.me);

        this.sound?.setListener(me.object.position.x, me.object.position.z);
        this.sound?.update(dt);

        // The enemy the player is set to fight, ringed, with its bar lit
        const target = this.#target();
        const ringed = target ? this.avatars.get(target.id) : null;

        this.effects.setTarget(ringed?.object ?? null, ringed ? Math.max(0.5, ringed.character.height * 0.33) : 0.6);
        hud.setTarget(target?.id ?? null);
        this.#bleed(dt);
        this.#keepTalking();
        this.#keepShopping();
        this.#restPlayer();
        this.effects.update(dt, view.pixelsPerMetre());
        this.#drawDrops();
        this.#drawMinimap(target);

        if (this.squares?.object.visible) {
            this.showSquares(true);
            this.squares.update(battle);
        }

        // The world round the player, drawn as they go (a chunk a frame at most)
        if (this.chunks && this.mapId === "town") {
            const { x, z } = this.avatars.get(this.me).object.position;

            // (The undergrowth as thick as the quality asks, grown again if that's changed)
            this.chunks.setUndergrowth(this.view.quality.undergrowth);

            if (this.chunks.update(x, z)) {
                this.#hearTrees();
            }
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

        // Bars over the heads of the others on the player's map
        for (const actor of battle.actors) {
            const avatar = this.avatars.get(actor.id);

            if (actor.id !== this.me && avatar) {
                const head = avatar.point(1.08);

                hud.place(actor.id, actor.dead || actor.map !== this.mapId ? null : view.toScreen(head));
            }
        }

        // Skin flushing red where hit
        for (const [id, left] of this.flash) {
            const material = this.avatars.get(id).character.materials.body;
            const remaining = left - dt;

            material.emissive.setRGB(0.5, 0.04, 0.02).multiplyScalar(Math.max(0, remaining / 0.25));

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

        return this.battle.actors.some((other) => this.battle.hostile(other, actor) && !other.dead && other.map === actor.map && Math.hypot(other.x - actor.x, other.y - actor.y) <= reach && this.battle.canSee(actor, other));
    }

    // How high the ground is where someone stands on a map (metres): a bridge's deck, or the ground
    #standsAt(mapId, x, y) {
        const map = this.world.maps?.[mapId];

        return map?.chunk && squaresOf(map).ground(Math.floor(x), Math.floor(y)) === GROUND.planks ? DECK.top : 0;
    }

    // Standing on the ground (stepping up onto a bridge's deck, and down off it); or, dead, lying
    // still a while, then sinking out of sight until they come back to life
    #updateBody(actor, avatar, dt, ground = 0) {
        const object = avatar.object;

        if (!actor.dead) {
            object.visible = true;
            avatar.standing = (avatar.standing ?? ground) + (ground - (avatar.standing ?? ground)) * Math.min(1, dt * 12);
            object.position.y = avatar.standing;

            return;
        }

        avatar.deadFor = (avatar.deadFor ?? 0) + dt;

        const sinking = Math.max(0, avatar.deadFor - LIE_STILL) / SINK;

        object.position.y = -0.5 * Math.min(1, sinking);
        object.visible = sinking < 1;
    }

    // The camera (camera.js): following the player from behind the way they're going, or where a
    // drag has turned it, leaning towards whoever they're fighting so both are in view
    #follow(dt) {
        const player = this.avatars.get(this.me);

        if (!player || !this.cameraFollow) {
            return;
        }

        const position = player.object.position;
        const foe = this.#foe();
        const chest = player.point(0.55);

        _focus.copy(position);

        if (foe) {
            const [ox, oz] = this.originOf(foe.map);
            const lean = _lean.set(ox + foe.x - position.x, 0, oz + foe.y - position.z).multiplyScalar(LEAN.share);

            _focus.add(lean.clampLength(0, LEAN.most));
        }

        const { focus, yaw, pitch } = this.cameraFollow.update(dt, {
            player: { x: position.x, z: position.z, vx: player.follow.vx, vz: player.follow.vz },
            aim: { x: _focus.x, z: _focus.z },
            lowest: this.view.lowestPitch(),
        });

        this.view.look(_focus.set(focus.x, 0, focus.z), yaw, pitch, dt || Infinity);
        this.view.setFocus(chest);
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
        const rect = view.canvas.getBoundingClientRect();
        const corners = [[rect.left, rect.top], [rect.right, rect.top], [rect.right, rect.bottom], [rect.left, rect.bottom]].map(([x, y]) => {
            const ground = view.groundAt(x, y);

            return ground ? [ground.x - ox, ground.z - oz] : null;
        });

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
            view: corners,
            icons: this.mapId === "town" ? this.icons() : [],
        });
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
     * What the world map shows (app/worldmap.js): where the player is ({ x, z, facing }, metres
     * and radians, on the world outside: inside, at the building's door) and the icons.
     */
    worldMapView() {
        const actor = this.battle.actor(this.me);
        const building = this.world.interiors?.of(actor.map);
        const outside = actor.map === "town" ? [actor.x, actor.y] : (building?.at ?? building?.door?.ends[0].arrive ?? [actor.x, actor.y]);
        const facing = this.avatars.get(this.me)?.facing ?? actor.facing;

        return { player: { x: outside[0], z: outside[1], facing }, icons: this.icons(), marks: this.requestMarks() };
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

        if (this.battle.canTalk(player, npc) && !player.to) {
            this.approaching = null;
            this.#command({ type: "stop" });
            this.#openTalk(npc);

            return;
        }

        this.approaching = npc.id;
        this.#command({ type: "approach", target: npc.id, run });
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

        const soldier = npc.kind === "soldier" ? this.#soldierWords(npc) : null;
        const names = {};
        const official = this.#officialOf(npc, building, names);
        const title = soldier?.title ?? folk.find(({ id }) => id === npc.id)?.title ?? ROLES[npc.role]?.title ?? "";
        Object.assign(names, Object.fromEntries(folk.map(({ id, local = id, name }) => [local, name.split(" ")[0]])));

        const upstairs = building?.tavern?.storeys > 1 ? building.tavern.upstairs : null;

        names.keeper ??= names.innkeeper;

        // (The settlement's name, and in a temple, its patron: "Aurelia", "the Dawnmother")
        names.town = building?.place === "home" ? this.world.start?.name : this.world.plan?.places.find(({ id }) => id === building?.place)?.name;

        if (building?.patron) {
            names.patron = GODS[building.patron].name;
            names.patronTitle = GODS[building.patron].title;
        }

        Object.assign(names, soldier?.names, official?.words, this.#rumours(building));

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

                // (What can't be paid for, said)
                this.#command({ type: "effect", effect }, (result) => {
                    if (!result.ok) {
                        this.hud.message(REFUSALS[result.reason] ?? "Can't do that.", 1.6);
                    } else if (effect.price || effect.pay) {
                        this.hud.setGold(this.progress.gold);
                        this.onProgress(this.progress);
                    }
                });

                // (Their wares, once the talk's over)
                if (effect.shop && SHOPKEEPERS[npc.role]) {
                    this.shopWanted = { shop: effect.shop, keeper: npc.id, name: npc.name };
                }
            },
        });

        this.talking = { id: npc.id, conversation };
        this.avatars.get(npc.id)?.actions.stopResting();
        this.avatars.get(this.me)?.actions.stopResting();
        this.talk.show({ name: npc.name, title }, conversation);
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

    // What one of the officials of a town hall or keep (or those about them) can tell of, and
    // what they ask the game (dialogue.js's reeve, clerk, petitioner, ruler, steward, councillor
    // and sentry): their words (`words`: the town, who holds it and rules them, the war, the
    // player's rank and the next, what's said of the ruler, the counsel that can be given), their
    // conditions (`check`), and what's done by talking to them (`effect`: sent to the host, and
    // the talk's words, `names`, filled in from what came of it)
    #officialOf(npc, building, names) {
        const war = this.host.war;
        const town = building && war ? war.town(building.place === "home" ? this.world.start?.id : building.place) : null;

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
        const state = { offer: null, reported: false };
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
            due: () => this.host.dueTo(this.me, npc.id).length > 0,
            reported: () => state.reported,
            keep: () => rank >= OPENS.keep,
            armoury: () => own && giftDue(),
            counselMarch: () => own && !oppressor && rank >= OPENS.march && options.march.length > 0,
            counselPeace: () => own && !oppressor && rank >= OPENS.peace && options.peace.length > 0,
            counselWar: () => own && !oppressor && rank >= OPENS.war && options.war.length > 0,
            counselRise: () => Boolean(oppressor) && town.owner === this.self.realm && rank >= OPENS.rise,
            ready: () => ready,
            serving: () => Boolean(war.realm(town.owner)?.overlord),
        };
        // What came of something asked, for their words: heard at once; or, joined to another's
        // world (docs/WAR.md M11), a moment later, and what's being said said again as it now is
        const heard = (effect, result, kind, chosen) => {
            if (effect.work === "ask") {
                state.offer = result.ok ? result.request : null;
                names.offer = state.offer?.text ?? "";
                names.reward = state.offer ? (state.offer.reward.gold ? `${state.offer.reward.gold} gold` : "your name in the rolls") : "";
            } else if (effect.work === "accept") {
                state.offer = null;

                if (!result.ok) {
                    this.hud.message(REFUSALS[result.reason] ?? "Can't do that.", 1.6);
                }
            } else if (effect.report) {
                const handed = result.ok ? (result.reported ?? []) : [];
                const paid = handed.reduce((sum, { reward }) => sum + reward.gold, 0);
                const first = handed[0];

                state.reported = result.ok;
                names.reported = !first ? "" : `${first.kind === "message" ? `A letter from ${first.from.townName}? I'll see it read.` : first.kind === "tithe" ? "The treasury thanks you." : "Done, and well done."}${handed.length > 1 ? " And the rest besides." : ""}${paid ? ` ${paid} gold, for your trouble.` : ""}`;
            } else if (effect.armoury) {
                names.gift = result.ok && result.item ? `From the armoury, for your rank: ${itemLabel(result.item).toLowerCase()}. Wear it well.` : (REFUSALS[result.reason] ?? "There's nothing for you.");
            } else if (kind) {
                const said = { march: `So be it. We march on ${chosen?.name} when we can.`, peace: `Peace with ${chosen?.name}... Very well. An envoy will go, when one can be spared.`, war: `${chosen?.name}? Yes. They've had it coming.`, rise: `Then it's today. Send word to every town: we're done serving ${words.oppressor}!` };

                names.counsel = result.ok ? said[kind] : "No. That cannot be.";
            }

            this.hud.setGold(this.progress.gold);
            this.onProgress(this.progress);
            this.onStanding(this.standing);

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
            handles: (effect) => Boolean(effect.work || effect.report || effect.armoury || effect.counsel),
            effect: (effect) => {
                const [kind, index] = Object.entries(effect.counsel ?? {})[0] ?? [];
                const chosen = kind && kind !== "rise" ? options[kind]?.[index - 1] : null;

                this.#command({ type: "effect", effect: kind && kind !== "rise" ? { counsel: { [kind]: chosen?.id } } : effect }, (result) => heard(effect, result, kind, chosen));
            },
        };
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

        this.#keepTalks();

        if (conversation.ended) {
            this.#endTalk();
        } else {
            this.talk.update(conversation);
        }
    }

    // Stop talking: they go back to what they were doing
    #endTalk() {
        if (!this.talking) {
            return;
        }

        this.#command({ type: "talk", with: null });
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

        const still = !player.dead && !player.order && !player.attack && !player.casting && !player.to && !player.path.length && this.battle.time >= player.stunnedUntil;
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

                this.#after(delay, () => this.effects.burst(how.burst, new THREE.Vector3(x + Math.sin(actor.facing) * ahead, height, z + Math.cos(actor.facing) * ahead)));
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

        this.avatars.get(actor.id).place(ox + actor.x, oz + actor.y, actor.facing);
        this.previous.set(actor.id, { x: actor.x, y: actor.y });
    }

    // The player has come through a door or up or down the stairs (or woken elsewhere): the
    // screen comes up from black on the map they're on, the camera behind them the way they face
    #arrive(actor) {
        const position = this.avatars.get(this.me).object.position;

        this.#showMap(actor.map);
        this.cameraFollow = new CameraFollow({ x: position.x, z: position.z, yaw: Math.atan2(-Math.sin(actor.facing), -Math.cos(actor.facing)), pitch: this.cameraFollow?.pitch });
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

    // --- Going inside ---

    // Every frame, a little more of the buildings being got ready built (the host says which:
    // those near any player, core/host.js); and every so often, the doors of the settlements come
    // to since picked up
    #visit(dt) {
        if (!this.world.interiors) {
            return;
        }

        const until = performance.now() + VISITS.budget;

        for (const visit of this.visits.values()) {
            while (visit.queue.length && performance.now() < until) {
                visit.queue.shift()();
            }
        }

        // The soldiers brought out, drawn a few at a time (those on the player's map first)
        while (this.enlisting.length && performance.now() < until) {
            const actor = this.battle.actor(this.enlisting.shift());

            if (actor && !this.avatars.has(actor.id)) {
                this.#dress(actor);
                this.#place(actor);
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
            this.sound?.play("wake");
        } else if (event.type === "loot") {
            const things = [event.gold ? `${event.gold} gold` : null, ...event.items.map((item) => itemLabel(item).toLowerCase())].filter(Boolean);

            this.hud.message(`You find ${things.join(", ")}.`, 2.5);
        } else if (event.type === "picked") {
            this.hud.message(`You pick up ${thingsOf(event.item)}.`, 2);
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

        avatar.character.setEquipment(heroEquipment(weapon, hero.boots, worn, hero.parts ?? []));
        avatar.character.sheathe(!this.battle.actor(id)?.armed);
        avatar.actions.setWeapon(guardOf(weapon));
    }

    // --- Standing in their people (core/standing.js) ---

    // A request taken, moved on, done, failed; a new rank; the armoury's gift; counsel given:
    // told, shown in the journal, and kept
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
                there: `You're here to hold ${request.target.name}. Stay till they're gone.`,
                done: `${request.title}: done.${event.reward?.gold ? ` ${event.reward.gold} gold.` : ""}`,
                failed: `${request.title}: failed. Your standing suffers.`,
                void: `${request.title}: it's come to nothing.`,
                abandoned: `${request.title}: given up.`,
            }[change];

            if (told) {
                this.hud.message(told, 3);
            }
        } else if (event.type === "standing") {
            this.hud.message(`You're ${/^[AEIOU]/.test(event.title) ? "an" : "a"} ${event.title} of your people now. ${STANDINGS[event.rank].opens}`, 4);
            this.sound?.play("wake");
        }

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
            this.#showJournal();
        }
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
            if (actor.kind === "soldier" && !this.avatars.has(actor.id) && !this.enlisting.includes(actor.id)) {
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
            this.#showPack();
        }
    }

    /** Close the pack (and stop trading). */
    closePack() {
        this.shopping = null;
        this.pack?.hide();
    }

    // Trade with a shopkeeper: the pack open, their wares in it
    #openShop({ shop, keeper, name }) {
        this.closeJournal();
        this.shopping = { shop, keeper, name };
        this.#showPack();
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
        const gear = ["weapon", "body", "shield"].map((slot) => ({ slot, item: progress.gear[slot], label: progress.gear[slot] ? itemLabel(progress.gear[slot]) : null }));
        const pack = progress.pack.map((stack) => stack && { ...stack, label: itemLabel(stack), about: aboutOf(stack), use: ITEMS[stack.id].use ? (stack.id === "meal" ? "Eat" : "Drink") : null, equip: ITEMS[stack.id].slot ? (ITEMS[stack.id].slot === "weapon" ? "Wield" : "Wear") : null, price: priceOf(stack, { haggle, selling: true }) });
        const shop = this.shopping && {
            name: this.shopping.name,
            wares: wares(this.shopping.shop).map((item) => {
                const price = priceOf(item, { haggle });

                return { item, label: itemLabel(item), price, affordable: price <= progress.gold };
            }),
        };

        this.pack.show({ gold: progress.gold, skills, gear, pack, shop });
    }

    // Something asked of the pack: done by the host, or why not said (with whoever's being traded
    // with, buying or selling). Something thrown away can be taken back a moment after.
    #packCommand(asked) {
        const command = asked.type === "buy" ? { ...asked, from: this.shopping?.keeper } : asked.type === "sell" ? { ...asked, to: this.shopping?.keeper } : asked;

        return this.#command(command, (result) => {
            if (!result.ok) {
                this.hud.message(REFUSALS[result.reason] ?? CAST_FAILURES[result.reason] ?? "Can't do that.", 1.6);
                this.sound?.play("denied");
            } else {
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
    #putOnWheel(id) {
        const key = `item:${id}`;
        const label = actionOf(key)?.label ?? itemLabel({ id });
        const where = (side, place) => `your own wheel ${side ? "two" : "one"}, at ${place.toUpperCase()}`;
        const self = this.wheels.self;

        for (let side = 0; side < SIDES; side++) {
            const place = PLACES.find((each) => self[side][each] === key);

            if (place) {
                this.hud.message(`${label} is on ${where(side, place)} already.`, 3);

                return;
            }
        }

        for (let side = 0; side < SIDES; side++) {
            const place = PLACES.find((each) => !self[side][each]);

            if (place) {
                self[side][place] = key;
                this.setWheels(this.wheels);
                this.hud.message(`${label} put on ${where(side, place)}.`, 3);

                return;
            }
        }

        this.hud.message("Your own wheels are full: change them in Game options, Action wheels.", 3.5);
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

        this.drops.sync(this.host.ground, { map: me.map, near: { x: ox + me.x, z: oz + me.y }, reach: DRAW_REACH, originOf: (map) => this.originOf(map) });
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
    #muster({ town, people, ids, banners }) {
        const [ox, oz] = this.originOf("town");

        this.enlisting.push(...ids);
        this.banners?.raise(town, people, banners.map(({ at: [x, y], facing }) => ({ x: ox + x, z: oz + y, facing })));
    }

    // A camp near the player pitched: its tents and fire, its banner by the fire, and its sentries
    // to be drawn
    #pitch({ camp, people, ids, fire, tents }) {
        const [ox, oz] = this.originOf("town");
        const [fx, fy] = fire;

        this.camps?.pitch(camp, people, { fire: [ox + fx, oz + fy], tents: tents.map(({ at: [x, y], facing }) => ({ at: [ox + x, oz + y], facing })) });
        this.banners?.raise(`camp:${camp}`, people, [{ x: ox + fx + 2.2, z: oz + fy + 2.2, facing: 0 }]);
        this.enlisting.push(...ids);
    }

    // A camp struck (its tents down, its sentries gone), or a sortie's raiders or attackers back
    // to their camp: said how it went, if the player was there
    #strike(event) {
        const ids = event.type === "strike" ? event.ids : event.back;

        if (event.type === "strike") {
            this.camps?.strike(event.camp);
            this.banners?.lower(`camp:${event.camp}`);
        } else if (event.result) {
            const them = `the ${peopleOf(event.people)}`;
            const said = {
                raided: `${them[0].toUpperCase()}${them.slice(1)} have burnt ${event.name}'s fields, and gone back to their camp.`,
                repulsed: event.kind === "raid" ? `The raid on ${event.name} is driven off.` : `The assault on ${event.name} is thrown back.`,
                taken: `${event.name} has fallen to ${them}!`,
                broken: `The camp outside ${event.name} is broken.`,
            }[event.result];

            if (said) {
                this.hud.message(said, 4);
            }
        }

        this.enlisting = this.enlisting.filter((id) => !ids.includes(id));

        for (const id of ids) {
            this.#undress(id);
        }
    }

    // A camp's sortie out against the town the player's at: its raiders or attackers to be drawn,
    // and the player told
    #sortie({ kind, people, name, ids }) {
        const them = `the ${peopleOf(people)}`;

        this.enlisting.push(...ids);
        this.hud.message(kind === "raid" ? `Raiders of ${them} are coming for ${name}'s fields!` : `${them[0].toUpperCase()}${them.slice(1)} are storming ${name}!`, 4);
    }

    // An envoy near the player at the end of their road, or waylaid on it: the player told
    #envoyed({ people, to, over, by }) {
        const theirs = `The ${ADJECTIVES[people] ?? people} envoy`;

        this.hud.message(over === "arrived" ? `${theirs} has reached the ${peopleOf(to)}.` : `${theirs} to the ${peopleOf(to)} has been struck down${by ? ` by the ${peopleOf(by)}` : ""}!`, 4);
    }

    // Start building a building the host's got ready: each floor and each of its folk, one to a
    // piece of work, and the doors told of its insides
    #prepare(building) {
        const visit = { key: building.key, queue: [], maps: [], folk: [] };

        visit.queue.push(...building.maps.map((id) => () => this.#furnish(visit, id)));
        visit.queue.push(...(this.host.open.get(building.key) ?? []).map((id) => () => this.#people(visit, id)));
        visit.queue.push(() => this.doors?.sync());
        this.visits.set(building.key, visit);

        return visit;
    }

    // A building ready to go into now: whatever of it's still to build, built at once
    #ready(key) {
        const building = key ? this.world.interiors?.buildings.get(key) : null;

        // (Wenches and Ale's built with the town)
        if (!building?.entrance) {
            return;
        }

        const visit = this.visits.get(key) ?? this.#prepare(building);

        while (visit.queue.length) {
            visit.queue.shift()();
        }
    }

    // One of a building's floors, built and put away until the player goes in
    #furnish(visit, mapId) {
        const interior = buildInterior(this.world.maps[mapId]);

        interior.object.visible = this.mapId === mapId;
        this.view.scene.add(interior.object);
        this.interiors.set(mapId, interior);
        visit.maps.push(mapId);
    }

    // One of a building's folk (by id), drawn where they are in it
    #people(visit, id) {
        const actor = this.battle.actor(id);

        if (!actor || this.avatars.has(id)) {
            return;
        }

        this.#dress(actor);
        this.#place(actor);
        visit.folk.push(id);
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

        this.mapId = mapId;
        this.town.object.visible = !interior;

        for (const outside of [this.ground, this.chunks?.object]) {
            if (outside) {
                outside.visible = !interior;
            }
        }

        // Everyone else here where they are now (they weren't moved while out of sight)
        for (const actor of this.battle.actors) {
            if (actor.map === mapId && actor.id !== this.me) {
                this.#place(actor);
            }
        }

        for (const [id, each] of this.interiors) {
            each.object.visible = id === mapId;
        }

        this.view.setIndoors(interior);
        this.view.setOccluders(interior ? null : this.occluders);
        this.minimap?.setMap(this.world.maps[mapId]);

        // The tavern's music inside, heard through the floor upstairs; the town's out; and the
        // hearth's fire crackling in the taproom
        this.sound?.setPlace(this.#soundOf(mapId));
        this.sound?.setHearth(interior?.hearth ?? null);

        if (this.running) {
            this.sound?.setAmbient(!interior);
        }

        if (this.squares?.object.visible) {
            this.showSquares(true);
        }
    }

    // The trees whose leaves can be heard: the town's, and those of the world drawn round it
    #hearTrees() {
        this.sound?.setTrees([...this.townTrees, ...(this.chunks?.trees() ?? [])]);
    }

    // Indoors: the walls and anything tall in front of the player cut away, the fires and
    // the spit turning, the lamps flickering, embers rising from the hearth; and, in or out, the
    // glow round the doors and stairs the player's making for
    #inside(dt) {
        const interior = this.interiors.get(this.mapId);
        const player = this.battle.actor(this.me);

        if (interior) {
            cutFor(interior.map, this.avatars.get(this.me).object.position, this.view.camera.position);
            interior.update(dt, this.clock);
            this.view.flicker(this.clock);

            if (interior.hearth && Math.random() < dt * EMBERS) {
                const { x, y, z } = interior.hearth;

                this.effects.burst("embers", _hearth.set(x + (Math.random() - 0.5) * 0.6, y, z + (Math.random() - 0.5) * 1.2));
            }
        }

        this.doors?.update(dt, this.clock, { map: this.mapId, heading: player?.order?.type === "enter" ? player.order.link : null });
        this.camps?.update(this.clock);
    }

    // --- What happened in the battle ---

    #handle(events) {
        const { battle, hud, effects } = this;

        for (const event of events) {
            if (HOST_EVENTS.has(event.type)) {
                this.#hear(event);
                continue;
            }

            const avatar = this.avatars.get(event.id);

            // (Someone not drawn yet: one of the folk of a building being got ready)
            if (!avatar) {
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
                    break;
                }
                case "draw":
                    this.#draw(event, avatar);
                    break;
                case "projectile": {
                    const target = this.avatars.get(event.target);
                    const hand = weaponOf(battle.actor(event.id).weapon)?.equipment?.includes("bow") ? "Left" : "Right";
                    const from = avatar.hand(hand);

                    const [ox, oz] = this.originOf(battle.actor(event.id).map);

                    const look = LOOKS[event.kind] ? this.#look(event.id, event.kind) : 0;

                    effects.launch(event.projectile, event.kind, from, look);
                    this.sound?.launch(event.kind, from, { rate: LOOKS[event.kind]?.[look].pitch ?? 1 });
                    this.flights.set(event.projectile, {
                        previous: new THREE.Vector2(event.x, event.y),
                        distance: Math.hypot(target.object.position.x - ox - event.x, target.object.position.z - oz - event.y),
                        height: from.y,
                        arc: event.kind === "arrow" ? 0.25 : 0.05,
                    });
                    break;
                }
                case "hit":
                    this.#hit(event);
                    break;
                case "miss":
                    hud.damage(this.#screenAbove(event.target), "Miss");
                    break;
                case "fizzle":
                    effects.land(event.projectile);
                    this.flights.delete(event.projectile);
                    break;
                case "cast": {
                    const spell = SPELLS[event.spell];
                    const kind = lookOf(event.spell);
                    const look = this.#look(event.id, kind);

                    // (Gathering in the hand, and landing on whom it's cast on, in the same look)
                    this.casting.set(event.id, look);
                    this.landing.set(event.target, look);

                    avatar.actions.startAttack(kind === "heal" ? "castHeal" : "castStun", { hitAt: spell.castTime / 1000, duration: (spell.castTime / 1000) * 1.7 });
                    this.sound?.play(kind === "heal" ? "castHeal" : "bolt", { at: avatar.object.position });
                    break;
                }
                case "healed": {
                    const actor = battle.actor(event.id);

                    this.wounds.get(event.id)?.heal(actor.hp, actor.maxHp);
                    effects.heal(avatar.object.position, avatar.character.height, this.#landing(event.id, "heal"));
                    hud.damage(this.#screenAbove(event.id), `+${event.amount}`, { kind: "heal" });
                    hud.setHealth(event.id, actor.hp, actor.maxHp);
                    this.sound?.play("healed", { at: avatar.object.position });
                    break;
                }
                case "stunned":
                    effects.stun(avatar.point(0.9), avatar.object, avatar.character.height * 1.08, (event.until - battle.time) / 1000, this.#landing(event.id, "stun"));
                    hud.damage(this.#screenAbove(event.id), "Stunned", { kind: "stun" });
                    this.sound?.play("stun", { at: avatar.object.position });
                    break;
                case "knockdown": {
                    // Knocked off their feet (away from whoever did it), and up again when the
                    // battle lets them act again
                    const by = event.by ? this.avatars.get(event.by) : null;

                    avatar.actions.knockdown?.({ from: by ? avatar.angleTo(by.object.position.x, by.object.position.z) : 0, seconds: (event.until - battle.time) / 1000 });
                    hud.damage(this.#screenAbove(event.id), "Knocked down", { kind: "stun" });
                    this.sound?.play("fall", { at: avatar.object.position, delay: FALL_LANDS / 1.35 });

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

                    avatar.actions.die({ from: killer ? avatar.angleTo(killer.object.position.x, killer.object.position.z) : 0 });
                    avatar.deadFor = 0;
                    effects.clearDaze(avatar.object);
                    this.sound?.play("fall", { at: avatar.object.position, delay: FALL_LANDS });

                    // Blood pools under their chest once they're down
                    if (this.#bleeds(battle.actor(event.id))) {
                        this.pools.set(event.id, { left: FALL_LANDS + 0.2, spot: null });
                    }

                    if (event.id === this.me) {
                        hud.message("You have fallen. You'll wake in the market square…", (event.respawnAt - battle.time) / 1000);
                        this.sound?.play("fallen");
                    } else {
                        hud.message(`The ${battle.actor(event.id).name.toLowerCase()} is slain!`, 3);
                        this.sound?.play("slain", { delay: FALL_LANDS });
                    }

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
                    // Walked up to someone to talk to them
                    if (event.id === this.me && event.target === this.approaching) {
                        this.approaching = null;
                        this.#openTalk(battle.actor(event.target));
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

                    // A door opening and banging shut, heard on the player's side of it
                    if (event.kind === "door" && (event.to === this.mapId || event.from === this.mapId)) {
                        this.sound?.play("door", { at: event.to === this.mapId ? avatar.object.position : was });
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
            case "muster":
                this.#muster(event);
                break;
            case "camp":
                this.#pitch(event);
                break;
            case "strike":
            case "sortied":
                this.#strike(event);
                break;
            case "sortie":
                this.#sortie(event);
                break;
            case "envoy":
                this.enlisting.push(...event.ids);
                break;
            case "envoyed":
                this.#envoyed(event);
                break;
            case "follower":
                if (event.id === this.me) {
                    this.hud.message({ joined: `${event.name} follows you now.`, fallen: `${event.name} has fallen!`, dismissed: `${event.name} goes their own way.` }[event.change], 3);
                    this.hud.setGold(this.progress.gold);
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
                this.enlisting = this.enlisting.filter((id) => !event.ids.includes(id));

                for (const id of event.ids) {
                    this.#undress(id);
                }

                break;
            case "dismiss":
                this.banners?.lower(event.town);
                this.enlisting = this.enlisting.filter((id) => !event.ids.includes(id));

                // (Let go of, even if others are out at their posts already: a town's new holders'
                // soldiers have the old ones' ids, and are drawn as their own people)
                for (const id of event.ids) {
                    this.#undress(id);
                }

                this.#mirror();
                break;
            case "explored":
                // (Marked on the maps, and kept)
                if (event.id === this.me) {
                    this.#explored();
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
            case "rank":
            case "loot":
            case "bought":
            case "sold":
            case "used":
            case "discarded":
            case "dropped":
            case "picked":
                this.#progressed(event);
                break;
            case "request":
            case "standing":
            case "gift":
            case "counsel":
                this.#stood(event);
                break;
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

        avatar.actions.draw(guard, on);

        const sound = (DRAW_SOUNDS[guard] ?? ["unsling", "unsling"])[on ? 0 : 1];

        if (sound) {
            this.sound?.play(sound, { at: avatar.object.position, delay: DRAWS[guard]?.[on ? "draw" : "sheathe"].hitAt ?? 0 });
        }
    }

    #hit(event) {
        const { battle, hud, effects } = this;
        const victim = this.avatars.get(event.id);
        const attacker = event.by ? this.avatars.get(event.by) : null;
        const reaction = REACTIONS[event.reaction];
        const from = attacker ? victim.angleTo(attacker.object.position.x, attacker.object.position.z) : 0;
        const actor = battle.actor(event.id);

        victim.actions.react(event.reaction, { from });
        this.sound?.hit(event.reaction, victim.object.position);

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
        }

        if (kind.glow === "fire") {
            effects.burst("ash", at, direction);
        }

        if (event.projectile) {
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

    // Does a character bleed red (not a skeleton, a slime, a spider, a wisp...)?
    #bleeds(actor) {
        return actor?.kind !== "beast" || CREATURES[actor.wild?.creature]?.blood === "red";
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

            // Held on the player, an enemy, or a soldier to pick a fight with: the action wheel
            const who = this.pointers.size === 1 ? this.#whoIsAt(event.clientX, event.clientY, { soldiers: true }) : null;

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

                this.cameraFollow.turn((-(pointer.x - pointer.drag.x) / rect.width) * DRAG_TURN, ((pointer.y - pointer.drag.y) / rect.height) * DRAG_TILT, this.view.lowestPitch());
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

        // The pack: its button, or I; Escape closes it (not the menu)
        this.#on(this.hud.root.querySelector("#packbutton") ?? document.createElement("button"), "click", () => this.togglePack());
        this.#on(this.hud.root.querySelector("#journalbutton") ?? document.createElement("button"), "click", () => this.toggleJournal());
        this.#on(document, "keydown", (event) => {
            if (!this.running || this.talk?.open) {
                return;
            }

            const plain = !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey;

            if (event.key === "Escape" && (this.pack?.open || this.journal?.open || this.fate?.open)) {
                event.preventDefault();
                event.stopPropagation();
                this.closePack();
                this.closeJournal();
                this.fate?.hide();
            } else if ((event.key === "i" || event.key === "I") && plain) {
                this.togglePack();
            } else if ((event.key === "j" || event.key === "J") && plain) {
                this.toggleJournal();
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

        // Someone to talk to (one of the folk, a soldier who isn't an enemy): go up to them
        if (who && me && !this.battle.hostile(who, me)) {
            this.lastTap = { time, x: clientX, y: clientY, from: "view" };
            this.#talkTo(who, { run });

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
        const ground = enemy || door ? null : this.view.groundAt(clientX, clientY);
        const [ox, oz] = this.originOf(this.mapId);

        this.#order({ enemy, door, ground: ground && [ground.x - ox, ground.z - oz] }, { clientX, clientY, run, time, from: "view" });
    }

    /**
     * Go straight ahead the way the player faces, square after square, as far as the way is
     * clear: running while their stamina lasts, then walking (a swipe up from them).
     */
    forward() {
        this.#wake();

        const avatar = this.avatars.get(this.me);
        const player = this.battle.actor(this.me);

        if (!avatar || !player || player.dead) {
            return;
        }

        this.#command({ type: "ahead", facing: avatar.facing, run: true });

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
     * reason }, saying why not to the player.
     */
    act(action, target) {
        this.#wake();

        const { spell, order, ability, item } = actionOf(action) ?? {};
        const on = target === "self" ? null : target;
        const command = spell ? { type: "cast", spell, target: on } : ability ? { type: "ability", ability, target: on } : order ? { type: order, target } : item ? { type: "use", item } : null;

        const heard = (result) => {
            // (Setting on someone: the lock heard, as a tap on an enemy)
            if (order && result.ok) {
                this.sound?.play("lock");
            }

            if (!result.ok) {
                this.hud.message(REFUSALS[result.reason] ?? CAST_FAILURES[result.reason], 1.4);
                this.sound?.play("denied");
            }
        };

        if (!command) {
            heard({ ok: false, reason: "busy" });

            return { ok: false, reason: "busy" };
        }

        return this.#command(command, heard);
    }

    // Who is under a point on the screen, within PICK_RADIUS of their feet, middle or head: the
    // nearest living enemy, one of the folk or a soldier who isn't an enemy (if `folk`), a soldier
    // of a people not friendly to the player's (if `soldiers`: to pick a fight with), or the
    // player (if `player`); { actor, wheel: "enemy", "talk", "provoke" or "self" }
    #whoIsAt(clientX, clientY, { player: withPlayer = true, folk = false, soldiers = false } = {}) {
        const player = this.battle.actor(this.me);
        let best = null;
        let bestDistance = PICK_RADIUS;

        if (!player) {
            return null;
        }

        for (const actor of this.battle.actors) {
            const mine = actor === player;

            const enemy = !mine && this.battle.hostile(actor, player);
            const talks = actor.neutral || actor.kind === "soldier" || (actor.kind === "follower" && this.host.followers.get(actor.id)?.leader === this.me);
            const provokes = actor.kind === "soldier" && !enemy && this.host.canFight(player, actor);

            if (actor.dead || (mine && !withPlayer) || (!mine && !enemy && !(folk && talks) && !(soldiers && provokes)) || actor.map !== player.map || !this.avatars.has(actor.id)) {
                continue;
            }

            const avatar = this.avatars.get(actor.id);

            for (const share of [0.2, 0.5, 0.8]) {
                const point = this.view.toScreen(avatar.point(share));
                const distance = point ? Math.hypot(point.x - clientX, point.y - clientY) : Infinity;

                // (Enemies first, where they and the player overlap)
                if (distance < bestDistance - (mine ? 6 : 0)) {
                    best = { actor, wheel: mine ? "self" : enemy ? "enemy" : provokes && soldiers ? "provoke" : "talk" };
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
        const slots = open.kind === "provoke" ? WHEELS.provoke[0] : (this.wheels[open.kind]?.[open.side] ?? {});
        const counts = {};
        const off = [];
        const learnt = this.progress.abilities();
        const weapon = WEAPONS[this.battle.actor(this.me)?.weapon];

        for (const [direction, key] of Object.entries(slots)) {
            const action = actionOf(key);
            const blow = ABILITIES[action?.ability]?.blow;

            if (action?.item) {
                counts[action.item] = this.progress.count(action.item);
            }

            // (A thing all used up; an ability not learnt; a blow for another kind of weapon)
            if ((action?.item && !counts[action.item]) || (action?.learnt && !learnt.includes(action.learnt)) || (blow && !weapon?.attacks.some(({ kind }) => (kind === "ranged" ? "ranged" : "melee") === blow))) {
                off.push(direction);
            }
        }

        this.wheel.show(x, y, open.target, slots, { side: open.side, flip: open.kind !== "provoke", counts, off });
        this.wheel.setCooldown(this.#cooldowns(slots));
    }

    // How much of each slice's cooldown is left (0 to 1, by direction): the spells' (all cast
    // share one), and each blow's own
    #cooldowns(slots) {
        const shares = {};
        const spells = this.battle.cooldown(this.me);
        const readyAt = this.host.players.get(this.me)?.readyAt ?? {};

        for (const [direction, key] of Object.entries(slots ?? {})) {
            const action = actionOf(key);
            const cooldown = ABILITIES[action?.ability]?.cooldown;

            if (action?.spell) {
                shares[direction] = spells;
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
        this.wheel.hide({ after: 180 });
        this.act(action, open.target);
    }

    /**
     * What's on the player's action wheels (their own and an enemy's, two sides each), what can
     * be put on each (app/wheel.js assignable), and how many of each thing they carry: for the
     * Action wheels options.
     */
    wheelSetup() {
        const learnt = this.progress.abilities();
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
    #order({ enemy, door = null, ground }, { clientX, clientY, run, time, from }) {
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
        if (this.remote) {
            return this.remote.command(command, then);
        }

        const result = this.host.command(this.me, command);

        then?.(result);

        return result;
    }
}
