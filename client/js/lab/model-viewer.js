// The model viewer (model-viewer.html; it was the creature lab, creature-lab.html, which sends
// on here): every creature of the wilds (beasts/looks.js), each dungeon's bosses and
// mini-bosses, the game's people (an adventurer, a soldier, each of the folk's roles: of any
// people, a woman or a man), and its things (what's carried and worn, built in code:
// characters/items.js; the catalog's props, the treasure chest opening), and the creatures whose
// models are in the catalog but who aren't in the game yet (the werewolf), in any of their skins,
// one at a time, doing what each does in the game (standing, walking,
// running, attacking, struck, resting, dying, flying; a person's every motion, as the motion
// check plays them: characters/motioncheck.js), to look at from any side and watch move:
//
// - played slower or faster, paused, and stepped a frame at a time either way (inspect.js
//   Rewind), each move once or over and over;
// - its bones (THREE.SkeletonHelper) and its wireframe shown or not;
// - each of the game's moves for it by name (its attacks, specials and rests), and, drawn from a
//   model (beasts/model.js), each clip in the model's file by name, as it was made;
// - how much there is to draw of it (inspect.js detailsOf), how big it is, and whose it is.
//
// ?creature=wolf&action=walk&seed=3 opens on one (a dungeon's boss or mini-boss:
// ?creature=caves:boss:trollKing, its theme, its rank and its id there: beasts/champions.js; and
// ?clip=Roar one of its model's clips); ?person=smith&people=lizard&sex=m opens on one of the
// people (?person=adventurer or soldier, &weapon=bow); ?item=sword or ?prop=dungeon-prop-barrel
// on a thing; ?model=beast-werewolf on a creature not in the game yet (&skin=dusk in one of its
// skins); window.lab lets a script do the same and step time on
// exactly (for renders: .shots, and e2e/model-viewer.spec.js). The ox is shown in its wagon's
// shafts, laden with ?load=wood (or stone, metal; none: empty) in ?people=human's timber.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { clone as cloneScene } from "three/addons/utils/SkeletonUtils.js";
import { ASSETS } from "../app/assets.js";
import { HERO_PEOPLES } from "../app/heroes.js";
import { filesOf } from "../app/catalog.js";
import { dressCreature, restsOf } from "../beasts/beast.js";
import { LOOKS } from "../beasts/looks.js";
import { hasModel, MODELS, modelOf, wantModel } from "../beasts/model.js";
import { ATTACKS, EMOTE_WAYS, RESTS } from "../characters/actions.js";
import { Character } from "../characters/character.js";
import { EQUIPMENT } from "../characters/equipment.js";
import { folkLook } from "../characters/folk.js";
import { buildItem } from "../characters/items.js";
import { loadCharacterKit } from "../characters/kit.js";
import { motions } from "../characters/motioncheck.js";
import { ARMS, soldierLook } from "../characters/soldiers.js";
import { CREATURES } from "../core/creatures.js";
import { THEMES } from "../core/dungeons/themes.js";
import { ACT_TIMES, ROLES } from "../core/roles.js";
import { allAtOnce } from "../core/steps.js";
import { STARTING_WEAPONS, WEAPONS, weaponOf } from "../core/weapons.js";
import { loadGltf, readKtx2With } from "../world/art/engine/models.js";
import { hitch } from "../world/art/kits/wagon.js";
import { Avatar } from "../world/avatar.js";
import { detailsOf, Rewind, wireframe } from "./inspect.js";

const canvas = document.querySelector("#view");
const status = document.querySelector("#status");
const picker = document.querySelector("#picker");
const params = new URLSearchParams(location.search);

// What each is, where it lives, and what the people-shaped ones fight with
const ABOUT = {
    rat: ["Giant rat", "Near home, everywhere"],
    porcupine: ["Porcupine", "Near home, everywhere"],
    slime: ["Green slime", "Near home, everywhere"],
    bats: ["Bat swarm", "Near home, everywhere"],
    wolf: ["Wolf", "In packs, further out"],
    boar: ["Wild boar", "Further out"],
    snake: ["Adder", "Further out"],
    bandit: ["Bandit", "Further out", "sword"],
    bear: ["Brown bear", "Far out"],
    puma: ["Puma", "Far out, in the hills and woods"],
    direWolf: ["Dire wolf", "Far out"],
    werewolf: ["Werewolf", "Far out, only by night, at the head of its wolves"],
    goblin: ["Goblin raider", "Far out", "cleaver"],
    goblinBomber: ["Goblin bomber", "Among goblin raiders: keeps its distance and lobs lit bombs", null],
    goblinKing: ["Goblin King", "The goblins' elite, leading their war band: a great cleaver, and a bigger bomb now and then", "cleaver"],
    skeleton: ["Skeleton", "Far out, and in ruins"],
    cultist: ["Cultist", "Far out, in camps", "wand"],
    banditChief: ["Bandit chief", "Leading the outlaws who hold a place", "sword"],
    troll: ["Troll", "The far wilds", "hammer"],
    ogre: ["Ogre", "The far wilds", "hammer"],
    wyvern: ["Wyvern", "The far wilds, and the mountains"],
    ox: ["Draught ox", "Not of the wild: drawing a works' wagon in a convoy"],
    blackShuck: ["Black shuck", "Only in the humans' wilds"],
    boggart: ["Boggart", "Only in the humans' wilds", "gauntlets"],
    badger: ["Badger", "Only in the humans' wilds"],
    wildBull: ["Wild bull", "Only in the humans' wilds, in the meadows and fields"],
    rookFlock: ["Rook flock", "Only in the humans' wilds, over the fields"],
    knucker: ["Knucker", "Only in the humans' wilds, by woods and pools"],
    hodmedod: ["Hodmedod", "Only in the humans' wilds, in the fields at night"],
    wisp: ["Will-o'-wisp", "Only in the elves' wilds"],
    treant: ["Blighted treant", "Only in the elves' wilds"],
    mandrake: ["Mandrake", "Only in the elves' wilds"],
    cwnAnnwn: ["Hound of Annwn", "Only in the elves' wilds, in packs"],
    pixies: ["Pixie swarm", "Only in the elves' wilds"],
    hart: ["Hart", "Only in the elves' wilds, in the meadows and elfwood"],
    kelpie: ["Kelpie", "Only in the elves' wilds"],
    caveSpider: ["Cave spider", "Only in the dark elves' wilds"],
    shadowStalker: ["Shadow stalker", "Only in the dark elves' wilds"],
    olm: ["Cave olm", "Only in the dark elves' wilds"],
    centipede: ["Giant centipede", "Only in the dark elves' wilds"],
    basilisk: ["Basilisk", "Only in the dark elves' wilds"],
    draugr: ["Draugr", "Only in the dark elves' wilds"],
    mare: ["Mare", "Only in the dark elves' wilds, at night"],
    hyena: ["Hyena", "Only in the cat folk's wilds"],
    scorpion: ["Sand scorpion", "Only in the cat folk's wilds"],
    jackal: ["Jackal", "Only in the cat folk's wilds, in packs"],
    capeBuffalo: ["Cape buffalo", "Only in the cat folk's wilds"],
    nandiBear: ["Nandi bear", "Only in the cat folk's wilds"],
    locustSwarm: ["Locust swarm", "Only in the cat folk's wilds"],
    spittingCobra: ["Spitting cobra", "Only in the cat folk's wilds"],
    bogFrog: ["Bog frog", "Only in the lizard folk's wilds"],
    crocodile: ["Marsh crocodile", "Only in the lizard folk's wilds"],
    giantLeech: ["Giant leech", "Only in the lizard folk's wilds, in the marshes"],
    jaguar: ["Jaguar", "Only in the lizard folk's wilds, in the jungle"],
    boa: ["Great boa", "Only in the lizard folk's wilds"],
    bloodflies: ["Bloodfly swarm", "Only in the lizard folk's wilds, in the jungle and marshes"],
    ahuizotl: ["Ahuizotl", "Only in the lizard folk's wilds, in the marshes and jungle"],
    magmaSlime: ["Magma slime", "Only in the orcs' wilds"],
    rockTusker: ["Rock tusker", "Only in the orcs' wilds"],
    gilaMonster: ["Gila monster", "Only in the orcs' wilds"],
    salamander: ["Salamander", "Only in the orcs' wilds"],
    deathWorm: ["Death worm", "Only in the orcs' wilds, in the badlands"],
    vultureFlock: ["Vulture flock", "Only in the orcs' wilds, over the badlands"],
    chimera: ["Chimera", "Only in the orcs' wilds, in the volcanic lands and badlands"],
    dragon: ["Drake", "The drake's lair: for the mightiest"],
    dreadthorn: ["Dreadthorn", "A Dreadthorn's lair: the mightiest of all"],
    ghost: ["Restless ghost", "The ruins and ruined castles, with their dead"],
    wraith: ["Wraith", "The ruins and ruined castles, with their dead"],
    wightLord: ["Wight lord", "Ruined castles: for the mightiest"],
    frostTroll: ["Frost troll", "The snows: for the mightiest", "hammer"],
};

// --- The scene ---

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: params.has("shot") });

// (A model's KTX2 textures read for this renderer, as the game reads them: app/session.js)
readKtx2With(renderer, filesOf(ASSETS, "basis-transcoder", document.baseURI));

renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();

scene.background = new THREE.Color(0x1b2229);
scene.fog = new THREE.Fog(0x1b2229, 18, 60);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.6;

const sun = new THREE.DirectionalLight(0xfff1dc, 1.9);

sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(0xbcd4ff, 0x3a3025, 0.55));

const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.95 }));

ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 200);
const controls = new OrbitControls(camera, canvas);

controls.enableDamping = true;
controls.addEventListener("change", () => fogFor(camera.position.distanceTo(controls.target)));

function groundTexture() {
    const size = 256;
    const texture = document.createElement("canvas");
    const context = texture.getContext("2d");

    texture.width = texture.height = size;
    context.fillStyle = "#3e4a36";
    context.fillRect(0, 0, size, size);

    // (Grass: flecks of lighter and darker green)
    for (let k = 0; k < 1400; k++) {
        context.fillStyle = k % 2 ? "#46553c" : "#36422f";
        context.fillRect((k * 97) % size, (k * 57 + (k >> 3) * 13) % size, 2, 3);
    }

    const map = new THREE.CanvasTexture(texture);

    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(300, 300);
    map.anisotropy = 8;
    map.colorSpace = THREE.SRGBColorSpace;

    return map;
}

// (How much of the view the bars and the panel cover, at its top, right, foot and left (pixels):
// what's shown is centred in what's left, and fitted to it; set by layout)
const covered = { top: 0, right: 0, bottom: 0, left: 0 };
let drawnFor = "";

function resize() {
    const { clientWidth: width, clientHeight: height } = canvas;
    const ratio = renderer.getPixelRatio();
    const size = `${width} ${height} ${ratio} ${covered.top} ${covered.right} ${covered.bottom} ${covered.left}`;

    if (size !== drawnFor) {
        drawnFor = size;
        renderer.setSize(width, height, false);

        // (Drawn as part of a bigger view, so its middle's in the middle of what's left: as wide
        // and as tall as the screen and twice as far as its middle moves; of that view's shape, or
        // it would be drawn stretched; and zoomed out to see as much as the screen would)
        const [x, y] = [(covered.left - covered.right) / 2, (covered.top - covered.bottom) / 2];
        const [wide, tall] = [width + 2 * Math.abs(x), height + 2 * Math.abs(y)];

        camera.aspect = wide / tall;
        camera.zoom = height / tall;

        if (x || y) {
            camera.setViewOffset(wide, tall, Math.abs(x) - x, Math.abs(y) - y, width, height);
        } else {
            camera.clearViewOffset();
        }

        camera.updateProjectionMatrix();
    }
}

// --- The people ---

// Who's shown, of the game's people: of which people (a RACES id), a woman or a man ("f", "m"),
// and fighting with what (a WEAPONS key: an adventurer's or a soldier's), chosen in the panel
const person = {
    people: HERO_PEOPLES.some(({ id }) => id === params.get("people")) ? params.get("people") : "human",
    sex: params.get("sex") === "m" ? "m" : "f",
    weapon: params.get("weapon") in WEAPONS ? params.get("weapon") : "sword",
    // (And what the ox's wagon is laden with: wood, stone, metal or none, in its people's timber)
    load: ["wood", "stone", "metal", "none"].includes(params.get("load")) ? params.get("load") : "wood",
};

// The folk's roles, each of them shown as the game dresses them (characters/folk.js): all but
// the adventurer's and the sentry's, shown as an adventurer and a soldier
const FOLK_ROLES = Object.keys(ROLES).filter((role) => role !== "adventurer" && role !== "sentry");

// An adventurer's calling (their look: folk.js) by what they fight with
const CALLING = { sword: "warrior", hammer: "warrior", greatsword: "warrior", axe: "warrior", cleaver: "warrior", gauntlets: "rogue", boots: "rogue", bow: "ranger", wand: "mage", grimoire: "mage", staff: "cleric" };

// What's a weapon of what's carried (taken away for the one chosen)
const WEAPON_ITEMS = new Set(Object.values(WEAPONS).flatMap(({ equipment = [] }) => equipment));

// Every motion the characters make (the motion check's: characters/motioncheck.js), by its id
const MOTIONS = new Map(motions().map((motion) => [motion.id, motion]));

/** Whether an id in the picker is one of the people's ("person:" and a role, "adventurer" or "soldier"). */
const isPerson = (id) => String(id).startsWith("person:");

// The weapons one of the people may be shown with: an adventurer any a player may start with
// (and an orc's cleaver), a soldier their people's (soldiers.js ARMS); none, one of the folk
function weaponsOf(role, people) {
    return role === "adventurer" ? [...STARTING_WEAPONS, "cleaver"] : role === "soldier" ? [...new Set(ARMS[people] ?? ["sword"])] : [];
}

/**
 * One of the people (`role`: "adventurer", "soldier", or one of the folk's roles) as the game
 * dresses them, of `person`'s people and sex, one of their kind (`seed`): { role (whose rests
 * they have: roles.js), weapon, shape, look, equipment, walk }.
 */
function personLook(role, seed) {
    const { people, sex } = person;
    const arms = weaponsOf(role, people);
    const weapon = arms.length ? (arms.includes(person.weapon) ? person.weapon : arms[0]) : null;

    if (role === "soldier") {
        return { role: "sentry", weapon, ...soldierLook({ people, weapon, sex, seed }) };
    }

    if (role === "adventurer") {
        const look = folkLook({ role, look: CALLING[weapon] ?? "warrior", sex, seed, people });

        return { role, weapon, ...look, equipment: [...look.equipment.filter((item) => !WEAPON_ITEMS.has(item)), ...WEAPONS[weapon].equipment] };
    }

    // (A role with no one of that sex in it: the other)
    try {
        return { role, weapon: null, ...folkLook({ role, sex, seed, people }) };
    } catch {
        return { role, weapon: null, ...folkLook({ role, sex: sex === "f" ? "m" : "f", seed, people }) };
    }
}

// One of the people, drawn as the game draws them (app/game.js #dressing: a character, and an
// Avatar to move it), resting as their role does
function dressPerson(role, seed) {
    const look = personLook(role, seed);
    const character = allAtOnce(Character.building(kit, { shape: look.shape, look: look.look, equipment: look.equipment, hairDetail: 1, merge: true }));
    const avatar = new Avatar(character, { walk: look.walk, guard: look.weapon ? WEAPONS[look.weapon].attacks[0].animation : null });

    character.sheathe(true);
    avatar.rest = (variant = null) => {
        avatar.actions.setSeated(Boolean(ROLES[look.role]?.seated));
        avatar.actions.rest(look.role, { variant });
    };

    return { avatar, look };
}

// What one of the people's motions is called, under what sort it is ({ group, label }), for
// one of them with `weapon`, resting as `role` does; or null, if it isn't one of theirs
function motionOf({ id, group, label }, { weapon, role }) {
    const [, first, second] = id.split("/");

    switch (group) {
        case "attack":
            return first === weapon ? { group: `Attacks (${WEAPONS[weapon].label.toLowerCase()})`, label } : null;
        case "draw":
            return first === weapon ? { group: "Drawing and putting away", label: id.startsWith("draw/") ? "drawing it" : "putting it away" } : null;
        case "cast":
            return { group: "Spells", label: `${first === "castHeal" ? "a heal" : "a hex"}: ${label}` };
        case "flinch":
            return { group: "Struck and dodging", label: id.startsWith("dodge/") ? `dodging ${first}` : `${first}${second ? ` (${words(second)})` : ""}` };
        case "fall":
            return { group: "Falling", label: first.replace(/-/g, " ") };
        case "act":
            return ACT_TIMES[first].by === role ? { group: "Work", label: first } : null;
        case "emote":
            return id.endsWith("/armed") ? null : { group: "Emotes", label: EMOTE_WAYS[first]?.[Number(second)]?.name ?? first };
        case "rest":
            return first === role && /^rest\/[^/]+\/\d+$/.test(id) ? { group: "Rests", label } : null;
        default:
            return null;
    }
}

// --- The things ---

// What's carried and worn that's a model of its own (not fitted to a body as clothes are), built
// by the game's code (characters/items.js), by where: [id, its EQUIPMENT entry]
const WHERE = { mainHand: "held in the right hand", offHand: "held in the left hand", head: "worn on the head", back: "carried on the back", face: "worn on the face", tail: "a tail of one of the peoples" };
const ITEMS = Object.entries(EQUIPMENT).filter(([, { model, slot }]) => model && slot in WHERE);

// The catalog's models that are things (app/assets.js): the dungeons' and the shops' props, and
// the treasure chest, by their catalog ids
const PROPS = Object.keys(ASSETS.models).filter((id) => id.startsWith("dungeon-prop-") || id === "chest");

// The catalog's creatures with a model who aren't in the game yet (no kind is drawn from it:
// beasts/model.js MODELS), by their catalog ids: each shown as it was made, every clip in its file
// by name, in any of its skins
const COMING = Object.keys(ASSETS.models).filter((id) => id.startsWith("beast-") && !id.endsWith("-skins") && !Object.values(MODELS).some(({ asset }) => asset === id));

/**
 * A model's other skins (its catalog entry's, "<id>-skins": utilities/blenderpipeline's variants,
 * <name>.<skin>.bin, each only the textures that differ), by name: { dusk: url, ... }.
 */
function skinsOf(name) {
    return Object.fromEntries(Object.entries(filesOf(ASSETS, `${name}-skins`, document.baseURI)).map(([file, url]) => [file.match(/\.([a-z0-9-]+)\.bin$/)[1], url]));
}

/** Whether an id in the picker is a thing's ("item:" and an EQUIPMENT id, "prop:" or "model:" and a catalog id). */
const isThing = (id) => /^(item|prop|model):/.test(String(id));

// The props read (their glTFs, by catalog id), to show again at once
const propsRead = new Map();

// A thing (`object`) shown as a creature is, on the ground in the middle, its clips (if it has
// any: the chest's opening) played alone as a model's are (`hold`, by name)
function thingAvatar(object, clips = []) {
    const box = new THREE.Box3().setFromObject(object);
    const size = box.isEmpty() ? new THREE.Vector3(1, 1, 1) : box.getSize(new THREE.Vector3());
    const middle = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
    const holder = new THREE.Group();
    const mixer = new THREE.AnimationMixer(object);
    const actions = new Map(clips.map((clip) => [clip.name, mixer.clipAction(clip)]));

    object.position.sub(new THREE.Vector3(middle.x, box.isEmpty() ? 0 : box.min.y, middle.z));
    holder.add(object);
    object.traverse((node) => {
        node.castShadow = node.receiveShadow = Boolean(node.isMesh);
    });

    for (const action of actions.values()) {
        action.play();
        action.setEffectiveWeight(0);
    }

    const still = () => {};

    return {
        object: holder,
        scale: 1,
        size,
        character: { height: Math.max(0.05, size.y), dispose: () => mixer.stopAllAction(), sheathe: still },
        actions: { revive: still, setGuard: still, react: still, die: still, knockdown: still, startAttack: still },
        place(x, z, facing) {
            holder.position.set(x, 0, z);
            holder.rotation.y = facing;
        },
        update: still,
        plan: clips.length
            ? {
                  length: Math.max(size.x, size.z),
                  lengths: Object.fromEntries(clips.map(({ name, duration }) => [name, duration])),
                  hold(clip, time) {
                      for (const [name, action] of actions) {
                          action.setEffectiveWeight(name === clip ? 1 : 0);
                          action.time = name === clip ? time : action.time;
                      }

                      mixer.update(0);
                  },
              }
            : null,
    };
}

// --- The creature ---

status.textContent = "Loading the body…";

const kit = await loadCharacterKit();

let current = null;
let action = "stand";
let seed = Number(params.get("seed") ?? 1);

// Along the ground it goes, walking or running, as the battle would move it; or flying (metres a
// second)
const PACE = { stand: 0, walk: 1.3, run: 3.2, fly: 7 };

// How wide a view (to its height) the camera's distance from what's shown is made for: one
// narrower has the camera further back, to see all of it across
const FRAMED = 1.4;

// How high one that takes to the air over a fight hangs (metres: app/game.js HOVERING)
const HOVER_HEIGHT = 7;
let along = 0;

// How it's watched: played or paused, how fast, each move over and over (`loop`) or once; how
// long it's been doing what it's doing (seconds, as it's played); and, drawn from a model, the
// one of its clips played alone (`clip`, by name: playClip), and how far into it (`clipAt`)
const watch = { playing: !params.has("shot"), speed: 1, loop: true, elapsed: 0, clip: null, clipAt: 0 };

// A frame, stepped on or back (seconds)
const FRAME = 1 / 30;

// The last few seconds of it as they were drawn, to step back through
const rewind = new Rewind();

// Its bones, shown (THREE.SkeletonHelper), or null
let bones = null;

// One of its model's clips asked for (?clip=) before the model's been read, to play once it has
let clipWanted = params.get("clip");

// A dungeon's boss or mini-boss, by "theme:rank:id" (its theme, "boss" or "mini", its id there):
// { creature, rank, regalia, title, theme }, or null for any other creature
function championOf(key) {
    const [theme, rank, regalia] = key.split(":");
    const one = THEMES[theme]?.[rank === "boss" ? "bosses" : "minis"]?.find((each) => each.id === regalia);

    return one ? { creature: one.creature, rank, regalia, title: one.title, theme: THEMES[theme] } : null;
}

/**
 * Show one of the creatures (a LOOKS id, or a dungeon's champion: championOf), or one of the
 * people ("person:" and a role: isPerson), one of its kind (`which`).
 */
function show(id, which = seed) {
    if (current) {
        current.avatar.object.removeFromParent();
        current.avatar.character.dispose();
    }

    if (isPerson(id)) {
        showPerson(id, which);
    } else if (isThing(id)) {
        showThing(id);
    } else {
        showCreature(id, which);
    }

    scene.add(current.avatar.object);
    along = 0;
    current.avatar.place(0, 0, Math.PI / 2);
    seed = which;
    picker.value = id;
    document.querySelector("#name").textContent = current.name;
    document.querySelector("#about").textContent = current.about;
    frame();
    act("stand");

    // (Only a winged one flies, and comes down to land; only one that takes to the air over a
    // fight hovers: creatures.js `hover`; only one with a weapon or a bite attacks)
    for (const button of document.querySelectorAll("[data-action=fly], [data-action=land]")) {
        button.hidden = !current.avatar.winged;
    }

    document.querySelector("[data-action=hover]").hidden = !CREATURES[current.kind]?.hover;
    document.querySelector("[data-action=attack]").hidden = Boolean(current.person) && !current.weapon;

    // (A thing does none of it: it stands, or plays its clips)
    document.querySelector("#bottom").hidden = Boolean(current.thing);

    // (Its skins, if it has others: the one chosen worn, if it has that one)
    showSkins();

    // (Who one of the people is, chosen in the panel: of which people, a woman or a man, and with
    // what, if they fight)
    showWho();

    // (Watched as the last one was: its bones and wireframe shown if they were)
    showBones();
    wireframe(current.avatar.object, looks.wireframe.checked);
    listMoves();
    describe();

    return current;
}

// One of the creatures, as the game draws it (beasts/beast.js dressCreature)
function showCreature(id, which) {
    const champion = championOf(id);
    const kind = champion?.creature ?? id;
    const weapon = ABOUT[kind]?.[2] ?? null;
    const avatar = dressCreature(kit, kind, { seed: which, equipment: weapon ? WEAPONS[weapon].equipment : [], guard: weapon ? WEAPONS[weapon].attacks[0].animation : null, champion: champion?.rank ?? null, regalia: champion?.regalia ?? null });

    // (An ox in its wagon's shafts)
    if (id === "ox") {
        hitch(avatar, LOOKS.ox, { load: person.load === "none" ? null : person.load, people: person.people, seed: which });
    }

    current = {
        id,
        kind,
        avatar,
        weapon,
        person: null,
        thing: null,
        name: champion ? champion.title.replace(/^the /, "The ") : (ABOUT[id]?.[0] ?? id),
        about: champion ? `${champion.rank === "boss" ? "The boss" : "A mini-boss"} of ${champion.theme.name}: ${ABOUT[kind]?.[0] ?? kind}` : (ABOUT[id]?.[1] ?? ""),
    };

    // (One drawn from a model: its stand-in till the model's read, then the model, beasts/model.js,
    // doing what its stand-in was, or the clip asked for of the model meanwhile: ?clip=)
    if (hasModel(kind) && !modelOf(kind)) {
        wantModel(kind)?.then((gltf) => {
            if (gltf && current?.id === id && seed === which) {
                const doing = current.doing;

                show(id, which);

                if (!(clipWanted && playClip(clipWanted))) {
                    act(doing.what, doing.which, doing.variant);
                }

                clipWanted = null;
            }
        });
    }
}

// One of the people, of the people, sex and weapon chosen (`person`)
function showPerson(id, which) {
    const role = id.slice("person:".length);
    const { avatar, look } = dressPerson(role, which);
    const people = HERO_PEOPLES.find(({ id: each }) => each === person.people).label;

    current = {
        id,
        kind: id,
        avatar,
        weapon: look.weapon,
        person: { role, rests: look.role, weapon: look.weapon, people: person.people, sex: person.sex },
        thing: null,
        name: role === "adventurer" ? "Adventurer" : role === "soldier" ? "Soldier" : ROLES[role].title,
        about: [people, person.sex === "f" ? "woman" : "man", look.weapon ? WEAPONS[look.weapon].label.toLowerCase() : null, role === "adventurer" ? "as the players and their followers" : null].filter(Boolean).join(" · "),
    };
}

// One of the things: what's carried or worn, built as the game builds it; or one of the
// catalog's props, or a creature not in the game yet, read as the game reads it (shown once it's
// read: its full detail, the lower ones packed in hidden; in the skin chosen)
function showThing(id) {
    const [kind, name] = [id.slice(0, id.indexOf(":")), id.slice(id.indexOf(":") + 1)];
    const thing = { id, kind: id, weapon: null, person: null };

    if (kind === "item") {
        const item = EQUIPMENT[name];

        current = { ...thing, avatar: thingAvatar(buildItem(item.model, { headRadius: 0.1 })), thing: { item: name }, name: item.label, about: WHERE[item.slot] };

        return;
    }

    const asset = ASSETS.models[name];
    const read = propsRead.get(name);
    const label = asset.label.replace(/ \(.*$/, "");
    const object = read ? cloneScene(read.scene) : new THREE.Group();
    const made = kind === "model" ? "A creature's model, not in the game yet: its clips as it was made" : "A prop: one of the catalog's models";

    object.traverse((node) => {
        node.visible = !node.userData.lod;
    });
    current = { ...thing, avatar: thingAvatar(object, read?.animations ?? []), thing: { asset: name, read: Boolean(read), skins: Object.keys(skinsOf(name)) }, name: label, about: read ? made : "On its way…" };

    if (!read) {
        loadGltf(Object.values(filesOf(ASSETS, name, document.baseURI))[0])
            .then((gltf) => {
                propsRead.set(name, gltf);

                // (Doing the clip asked for of it meanwhile: ?clip=)
                if (current?.id === id) {
                    show(id);

                    if (clipWanted && playClip(clipWanted)) {
                        clipWanted = null;
                    }
                }
            })
            .catch(() => {
                if (current?.id === id) {
                    document.querySelector("#about").textContent = "Its model couldn't be read";
                }
            });
    }
}

// How big what's shown is to frame (metres): a thing by its biggest side, a beast by its height
// or most of its length, one of the people by their height
function sizeOf() {
    const { avatar } = current;
    const height = avatar.character.height;

    return current.thing ? Math.max(avatar.size.x, avatar.size.y, avatar.size.z) : avatar.plan ? Math.max(height, avatar.plan.length * avatar.scale * 0.8) : height;
}

// How far back the camera stands to see all of something `size` across in what the bars and the
// panel leave of the view: further on a narrow view (a phone held upright), and on a short one
function fitted(size) {
    const [width, height] = [canvas.clientWidth, canvas.clientHeight];
    const [across, up] = [Math.max(1, width - covered.left - covered.right), Math.max(1, height - covered.top - covered.bottom)];

    return (size * 1.75 + (current.thing ? 0.2 * size : 0.8)) * Math.max(1, FRAMED / (across / up)) * Math.max(1, (0.8 * height) / up);
}

// The fog and the camera's far plane as far off as the camera is from what's shown (metres), so
// that something big seen from far back isn't lost in the fog
function fogFor(distance) {
    scene.fog.near = Math.max(18, distance * 1.5);
    scene.fog.far = Math.max(60, distance * 4);

    if (camera.far < distance * 8) {
        camera.far = distance * 8;
        camera.updateProjectionMatrix();
    }
}

// The camera kept as near or far as the view left for it needs, its way round kept, as the panel
// opens or shuts or the screen turns
function fit() {
    if (!current?.fitted) {
        return;
    }

    const now = fitted(sizeOf());
    const offset = camera.position.clone().sub(controls.target).multiplyScalar(now / current.fitted);

    camera.position.copy(controls.target).add(offset);
    current.fitted = now;
    fogFor(offset.length());
}

// The camera on it: three-quarters from the front, far enough to see all of it in what the bars
// and the panel leave of the view
function frame() {
    const { avatar } = current;
    const height = avatar.character.height;
    const size = sizeOf();
    const distance = fitted(size);

    current.fitted = distance;
    fogFor(distance);
    controls.target.set(avatar.object.position.x, height * 0.5, avatar.object.position.z);
    camera.position.set(avatar.object.position.x + distance * 0.75, height * 0.55 + distance * 0.32, avatar.object.position.z + distance * 0.7);
    controls.minDistance = size * 0.4;
    controls.maxDistance = size * 8 + 4;

    const reach = size * 1.6 + 1;

    sun.position.set(avatar.object.position.x + reach, reach * 2, avatar.object.position.z + reach * 1.2);
    sun.target.position.copy(avatar.object.position);
    Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 0.1, far: reach * 6 });
    sun.shadow.camera.updateProjectionMatrix();
}

/**
 * Have it do something: stand, walk, run, attack, react (struck), rest or die (`which`: an
 * attack's or rest's name, a beast's; `variant`: which of its attacks or rests, a people-shaped
 * one's, actions.js ATTACKS' and RESTS'). Done `again` (shown over and over), what it did before
 * is kept to step back to.
 */
function act(what, which = null, variant = null, { again: repeated = false } = {}) {
    const { avatar, weapon, kind } = current;

    action = what;
    current.doing = { what, which, variant };
    watch.clip = null;
    watch.elapsed = 0;
    avatar.actions.revive();
    again = 0;

    // (One of the people standing, walking or running: off guard, their weapon put away, and not
    // sat down, as the game's are going about; each motion as the motion check plays it)
    if (current.person && what !== "motion") {
        avatar.actions.setSeated(false);
        avatar.actions.setGuard(what === "attack");
        avatar.character.sheathe(what !== "attack");
    }

    if (what === "motion") {
        const motion = MOTIONS.get(which);
        const { people, sex, weapon } = current.person;

        avatar.actions.setSeated(false);
        avatar.character.sheathe(motion.sheathed);
        motion.start({ actions: avatar.actions, walker: avatar.walker, character: avatar.character }, { people, sex });

        // (On guard as they are, with what they carry: a spell's cast or a flinch is played on
        // guard with their people's first weapon)
        if (!["attack", "draw"].includes(motion.group) && !motion.sheathed) {
            avatar.actions.setWeapon(weapon ? WEAPONS[weapon].attacks[0].animation : null);
            avatar.actions.setGuard(Boolean(weapon));
            avatar.character.sheathe(!weapon);
        }

        every = motion.seconds + 0.6;
        shown(motionOf(motion, { weapon, role: current.person.rests })?.label ?? which);
    } else if (what === "attack" || what === "hover") {
        // (A creature's own attack as the game times it: the one named, or its first bite or
        // swipe; a model's clips play over that. Hovering, its fire breathed down)
        const own = weaponOf(CREATURES[kind]?.weapon)?.attacks ?? [];
        const named = what === "hover" ? "breath" : which;
        const attack = weapon ? WEAPONS[weapon].attacks[0] : (own.find(({ animation }) => animation === named) ?? own.find(({ animation }) => animation === "melee") ?? { animation: "bite", hitAt: 450, duration: 900 });

        every = Math.max(2, attack.duration / 1000 + 0.6);

        avatar.actions.setGuard?.(true);
        avatar.character.sheathe(false);
        avatar.actions.startAttack(which ?? attack.animation, { hitAt: attack.hitAt / 1000, duration: attack.duration / 1000, variant });

        if (which && avatar.doing?.attack) {
            avatar.doing.attack.style = which;
        }

        shown(avatar.doing?.attack?.style ?? doingNow() ?? attack.animation);
    } else if (what === "rest") {
        // (A beast's, for a while; a people-shaped one's, once through)
        if (avatar.plan) {
            avatar.rest?.(which, which ? REST_FOR : null);
        } else {
            avatar.rest?.(variant);
        }

        avatar.restWeight = which ? 1 : avatar.restWeight;
        shown(avatar.resting?.name ?? doingNow() ?? "");
    } else if (what === "react") {
        avatar.actions.react(weapon ? "slash" : "strike", { from: 0.5 });
    } else if (what === "die") {
        avatar.actions.die({ from: 0.8 });
    } else if (what === "knockdown") {
        avatar.actions.knockdown?.({ from: 0, seconds: 1.5 });
    } else if (what === "land") {
        // (Coming down out of the sky from behind it and up)
        avatar.arrive?.({ from: [along - 30 * avatar.scale, 14 * avatar.scale, 6], duration: 4.5 });
    }

    pressed();

    if (!repeated) {
        rewind.clear();
        rewind.keep(avatar.object, 0);
    }

    showTime();
}

// How long a beast rests one of its ways of resting, asked for by name (seconds)
const REST_FOR = 6;

/** Play one of its model's clips (by name) alone, as it was made, from its start: whether it has it. */
function playClip(name) {
    const { avatar } = current;

    if (!avatar.plan?.hold || !(name in avatar.plan.lengths)) {
        return false;
    }

    action = "clip";
    current.doing = { what: "clip", which: name, variant: null };
    watch.clip = name;
    watch.clipAt = 0;
    watch.elapsed = 0;
    avatar.actions.revive();
    avatar.plan.hold(name, 0);
    shown(name);
    pressed();
    rewind.clear();
    showTime();

    return true;
}

// What a people-shaped one's doing, by name (an attack's or a rest's: actions.js), or null
function doingNow() {
    const doing = current.avatar.plan ? null : current.avatar.actions.attack;

    if (!doing) {
        return null;
    }

    return doing.rest ? (RESTS[current.person?.rests ?? restsOf(current.kind)]?.[doing.variant]?.name ?? null) : (ATTACKS[doing.name]?.variants?.[doing.variant]?.name ?? null);
}

// What it's doing, named under what it is
function shown(name) {
    document.querySelector("#about").textContent = `${current.about}${name ? ` · ${words(name)}` : ""}`;
}

// A name as it's written in the code ("tailSweep"), in words ("tail sweep")
function words(name) {
    return String(name).replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}

// Every few moments (`every` seconds: an attack's length and a little more), it attacks (or
// flinches, rests or dies) again, while that's what it's showing and it's shown over and over
let again = 0;
let every = 2;

// How long before it does it again, by what it's doing (seconds)
const AGAIN = { react: 2, knockdown: 2.6, rest: 8, die: 4 };

/** Step time on (seconds): it moves and does what it's doing. */
function advance(seconds, step = 1 / 60) {
    const { avatar } = current;

    watch.elapsed += seconds;

    // (One of its model's clips alone: on through it, round again or held at its end)
    if (watch.clip) {
        const length = avatar.plan.lengths[watch.clip];

        watch.clipAt = watch.loop ? (watch.clipAt + seconds) % length : Math.min(length, watch.clipAt + seconds);
        avatar.plan.hold(watch.clip, watch.clipAt);

        return;
    }

    for (let left = seconds; left > 1e-6; left -= step) {
        const dt = Math.min(step, left);

        along += PACE[action] !== undefined ? PACE[action] * dt * (action === "fly" ? avatar.scale ?? 1 : 1) : 0;

        if (action === "fly") {
            // (Flying along level, a little over its own height up, beating and gliding by turns)
            const t = (avatar.clock ?? 0) + dt;

            avatar.soar(dt, along, avatar.character.height * 1.3, 0, Math.PI / 2, { beat: 0.55 + 0.45 * Math.sin(t * 0.4), bank: Math.sin(t * 0.3) * 0.15 });
        } else if (action === "hover") {
            // (Hanging in the air over a fight: battle.js #hover)
            avatar.hover(1);
            avatar.ground = 0;
            avatar.update(dt, along, 0, Math.PI / 2, false);
            avatar.object.position.y = HOVER_HEIGHT;
        } else {
            avatar.update(dt, along, 0, Math.PI / 2, action !== "attack" && action !== "motion");
        }

        again += dt;

        const period = action === "attack" || action === "hover" || action === "motion" ? every : AGAIN[action];

        if (watch.loop && period !== undefined && again > period) {
            const { what, which, variant } = current.doing;

            again = 0;
            act(what, which, variant, { again: true });
        }
    }

    follow();
}

// The camera and the sun keep up with it, up in the air too
function follow() {
    const { avatar } = current;
    const { x, y, z } = avatar.object.position;
    const shift = new THREE.Vector3(x - controls.target.x, y + avatar.character.height * 0.5 - controls.target.y, z - controls.target.z);

    controls.target.add(shift);
    camera.position.add(shift);
    sun.position.add(shift);
    sun.target.position.set(x, 0, z);
}

// --- Watching it ---

const looks = {
    play: document.querySelector("#play"),
    back: document.querySelector("#back"),
    forward: document.querySelector("#forward"),
    speed: document.querySelector("#speed"),
    loop: document.querySelector("#loop"),
    time: document.querySelector("#time"),
    scrub: document.querySelector("#scrub"),
    skeleton: document.querySelector("#skeleton"),
    wireframe: document.querySelector("#wireframe"),
    moves: document.querySelector("#moves"),
    clips: document.querySelector("#clips"),
    details: document.querySelector("#details"),
};

/** Play on as it's drawn, or pause (`on`). */
function play(on) {
    watch.playing = on;
    looks.play.querySelector(".label").textContent = on ? "Pause" : "Play";
    looks.play.setAttribute("aria-label", on ? "Pause" : "Play");
    looks.play.dataset.playing = String(on);

    // (Played on from how it is now, whatever's been stepped back to)
    if (on && rewind.past) {
        rewind.latest();
        follow();
    }

    showTime();
}

// Play on `seconds` from how it is now, keeping each moment drawn to step back to
function playOn(seconds) {
    if (rewind.past) {
        rewind.latest();
    }

    advance(seconds);

    if (!watch.clip) {
        rewind.keep(current.avatar.object, watch.elapsed);
    }

    showTime();
}

/** Pause and step a frame on (1) or back (-1). */
function step(frames) {
    const { avatar } = current;

    play(false);

    // (One of its model's clips alone: anywhere in it, as it was made)
    if (watch.clip) {
        const length = avatar.plan.lengths[watch.clip];
        const at = watch.clipAt + frames * FRAME;

        watch.clipAt = watch.loop ? (at + length) % length : Math.max(0, Math.min(length, at));
        avatar.plan.hold(watch.clip, watch.clipAt);
        showTime();

        return;
    }

    // (Back through what's been kept; on through it, then on from now)
    const time = frames < 0 ? rewind.stepBack() : rewind.stepForward();

    if (time === null && frames > 0) {
        playOn(FRAME);
    } else {
        follow();
        showTime(time ?? undefined, time === null);
    }
}

// How far into what it's doing it is, under the controls (and on the clip's slider)
function showTime(time = rewind.kept[rewind.at]?.time ?? watch.elapsed, furthest = false) {
    if (watch.clip) {
        const length = current.avatar.plan.lengths[watch.clip];

        looks.time.replaceChildren(`${watch.clipAt.toFixed(2)} s of ${length.toFixed(2)} s`);
        looks.scrub.max = String(length);
        looks.scrub.value = String(watch.clipAt);
        looks.scrub.hidden = false;
    } else {
        // (The words after the time left out where there's no room: a phone's)
        const more = (text, as = "label") => Object.assign(document.createElement("span"), { className: as, textContent: text });

        looks.time.replaceChildren(`${time.toFixed(2)} s`, more(" into it"), ...(furthest ? [more(" (as far back as is kept)"), more(" ⇤", "icon")] : []));
        looks.scrub.hidden = true;
    }
}

// Which of the buttons is what it's doing
function pressed() {
    const { what, which, variant } = current.doing;

    for (const button of document.querySelectorAll("[data-action]")) {
        button.setAttribute("aria-pressed", String(button.dataset.action === what && !which && variant === null));
    }

    for (const button of document.querySelectorAll("#moves button, #clips button")) {
        const same = button.dataset.what === what && (button.dataset.which ?? null) === which && (button.dataset.variant === undefined ? null : Number(button.dataset.variant)) === variant;

        button.setAttribute("aria-pressed", String(same));
    }
}

// Its bones shown, or not
function showBones() {
    bones?.removeFromParent();
    bones?.dispose();
    bones = null;

    if (looks.skeleton.checked) {
        bones = new THREE.SkeletonHelper(current.avatar.object);
        scene.add(bones);
    }
}

/**
 * The game's moves for what's shown, each by name: { group, label, what, which, variant } (a
 * beast's attacks, its special ones and its ways of resting; a people-shaped one's weapon's
 * attacks and its ways of resting, actions.js's).
 */
function movesOf() {
    const { avatar, weapon, kind } = current;

    if (current.thing) {
        return [];
    }

    // (One of the people: every motion of theirs, as the motion check has them, their own first:
    // their weapon's, their work and their rests)
    if (current.person) {
        const { rests: role } = current.person;
        const order = (group) => ["Attacks", "Drawing", "Work", "Rests", "Emotes", "Spells", "Struck", "Falling"].findIndex((first) => group.startsWith(first));

        return [...MOTIONS.values()]
            .flatMap((motion) => {
                const named = motionOf(motion, { weapon, role });

                return named ? [{ group: named.group, label: named.label, what: "motion", which: motion.id, variant: null }] : [];
            })
            .sort((a, b) => order(a.group) - order(b.group));
    }

    if (avatar.plan) {
        return [
            ...avatar.attacks.map((style) => ({ group: "Attacks", label: words(style), what: "attack", which: style, variant: null })),
            ...avatar.specials.map((style) => ({ group: "Special attacks", label: words(style), what: "attack", which: style, variant: null })),
            ...avatar.rests.map((name) => ({ group: "Rests", label: words(name), what: "rest", which: name, variant: null })),
        ];
    }

    const animation = weapon ? WEAPONS[weapon].attacks[0].animation : null;

    return [
        ...(ATTACKS[animation]?.variants ?? []).map(({ name }, variant) => ({ group: "Attacks", label: name, what: "attack", which: null, variant })),
        ...(RESTS[restsOf(kind)] ?? []).map(({ name }, variant) => ({ group: "Rests", label: name, what: "rest", which: null, variant })),
    ];
}

// The game's moves for it (under what sort each is), and its model's clips, to choose from
function listMoves() {
    const { avatar, kind } = current;
    const moves = movesOf();

    looks.moves.replaceChildren(
        ...[...new Set(moves.map(({ group }) => group))].flatMap((group) => {
            const heading = document.createElement("h3");

            heading.textContent = group;

            return [
                heading,
                ...moves
                    .filter((move) => move.group === group)
                    .map(({ label, what, which, variant }) => {
                        const button = chip(label, () => act(what, which, variant));

                        button.dataset.what = what;

                        if (which !== null) {
                            button.dataset.which = which;
                        }

                        if (variant !== null) {
                            button.dataset.variant = String(variant);
                        }

                        return button;
                    }),
            ];
        }),
    );

    // (Its model's clips, each by name and how long it is; or why there are none)
    if (avatar.plan?.hold) {
        looks.clips.replaceChildren(
            ...Object.entries(avatar.plan.lengths).map(([name, length]) => {
                const button = chip(`${name} · ${length.toFixed(2)} s`, () => playClip(name));

                button.dataset.what = "clip";
                button.dataset.which = name;

                return button;
            }),
        );
    } else {
        const note = document.createElement("p");

        note.className = "note";
        note.textContent = current.thing ? (current.thing.asset && !current.thing.read ? "Its model's file is on its way." : "It has no clips: it doesn't move.") : hasModel(kind) ? "Its model's file is still on its way: its stand-in, built in code, is shown meanwhile." : "Built in code, it has no file of clips: its moves are worked out as it plays (the game's, above).";
        looks.clips.replaceChildren(note);
    }

    pressed();
}

// A button to choose something by
function chip(label, choose) {
    const button = document.createElement("button");

    button.type = "button";
    button.textContent = label;
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => {
        again = 0;
        choose();
    });

    return button;
}

// How much there is to draw of it, how big it is, and whose it is
function describe() {
    const { avatar, kind, thing } = current;
    const details = detailsOf(avatar.object);
    const model = avatar.plan?.model ? MODELS[avatar.plan.model] : null;
    const asset = model ? ASSETS.models[model.asset] : thing?.asset ? ASSETS.models[thing.asset] : null;
    const bytes = asset?.files.reduce((sum, file) => sum + file.bytes, 0) ?? 0;
    const sizes = details.textures.map(({ width, height, compressed }) => `${width}×${height}${compressed ? " (compressed)" : ""}`);
    const length = avatar.plan && !thing ? avatar.plan.length * (avatar.scale ?? 1) : null;
    const [source, licence] = whoseOf(asset, avatar);
    const metres = (value) => (value < 1 ? `${Math.round(value * 100)} cm` : `${value.toFixed(2)} m`);
    const rows = [
        ["Made", asset ? `From a model's file (${(bytes / 1048576).toFixed(1)} MB)` : thing ? "In code, by the game (characters/items.js)" : avatar.plan ? `In code, by the game (beasts/: a ${LOOKS[kind].body} body)` : "In code, by the game (characters/: a character)"],
        ["Source", source],
        ["Size", thing ? `${metres(avatar.size.x)} × ${metres(avatar.size.z)}, ${metres(avatar.size.y)} tall` : `${avatar.character.height.toFixed(2)} m tall${length ? `, ${length.toFixed(2)} m long` : ""}`],
        ["Triangles", details.triangles.toLocaleString("en")],
        ["Vertices", details.vertices.toLocaleString("en")],
        ["Meshes", String(details.meshes)],
        ["Materials", String(details.materials)],
        ["Textures", details.textures.length ? `${details.textures.length}: ${sizes.slice(0, 4).join(", ")}${sizes.length > 4 ? ", …" : ""}` : "None (colours only)"],
        ["Bones", details.bones ? String(details.bones) : "None (rigid parts)"],
    ];

    if (avatar.plan?.hold) {
        rows.push(["Clips", String(Object.keys(avatar.plan.lengths).length)]);
    }

    // (Its other skins, each a file of its own: only the textures that differ)
    if (thing?.skins?.length) {
        const extra = ASSETS.models[`${thing.asset}-skins`].files.reduce((sum, file) => sum + file.bytes, 0);

        rows.push(["Skins", `${thing.skins.length} more (${(extra / 1048576).toFixed(1)} MB): ${thing.skins.join(", ")}`]);
    }

    looks.details.replaceChildren(
        ...rows.flatMap(([name, value]) => {
            const term = document.createElement("dt");
            const description = document.createElement("dd");

            term.textContent = name;
            description.textContent = value;

            return [term, description];
        }),
    );

    // (Its licence, linked to)
    const term = document.createElement("dt");
    const description = document.createElement("dd");
    const link = document.createElement("a");

    term.textContent = "Licence";
    link.href = licence.href;
    link.textContent = licence.text;
    link.target = "_blank";
    link.rel = "noopener";
    description.append(link);
    looks.details.append(term, description);
}

// Whose something shown is, and its licence ({ text, href }): a model's, as the catalog says
// (app/assets.js: its label names it, whose it is and its licence's file), or the game's own
function whoseOf(asset, avatar) {
    if (asset) {
        const file = asset.label.match(/client\/([^\s;)]*LICEN[CS]E[^\s;)]*)/)?.[1] ?? null;
        const named = asset.label.match(/\b(CC0|CC BY 4\.0|MIT)\b/)?.[1] ?? null;
        const text = file ? `Its own (${file.split("/").pop()})` : named ? `${named} (the game's credits)` : "See the game's credits";

        return [asset.label.replace(/;?\s*client\/[^\s;)]*/, ""), { text, href: file ?? "https://github.com/hoffspot/conquest#credits-and-license" }];
    }

    const game = { text: "Apache License 2.0, as the game's code is", href: "https://github.com/hoffspot/conquest/blob/main/LICENSE" };

    return avatar.plan || current.thing ? ["Built by the game's code: no outside model", game] : ["CharMorph's Vitruvian body (CC0), with MakeHuman's shapes, skeleton and skin weights (CC0), dressed by the game's code", game];
}

// --- The controls ---

const groups = [
    ["Near home", ["rat", "porcupine", "slime", "bats", "wolf", "boar", "snake", "bandit", "bear", "puma", "direWolf", "werewolf", "goblin", "goblinBomber", "goblinKing", "skeleton", "cultist", "troll", "ogre", "wyvern"]],
    ["Each people's own", ["blackShuck", "boggart", "badger", "wildBull", "rookFlock", "knucker", "hodmedod", "wisp", "treant", "mandrake", "cwnAnnwn", "pixies", "hart", "kelpie", "caveSpider", "shadowStalker", "olm", "centipede", "basilisk", "draugr", "mare", "hyena", "scorpion", "jackal", "capeBuffalo", "nandiBear", "locustSwarm", "spittingCobra", "bogFrog", "crocodile", "giantLeech", "jaguar", "boa", "bloodflies", "ahuizotl", "magmaSlime", "rockTusker", "gilaMonster", "salamander", "deathWorm", "vultureFlock", "chimera"]],
    ["The restless dead", ["ghost", "wraith"]],
    ["For the mightiest", ["dreadthorn", "dragon", "wightLord", "frostTroll", "banditChief"]],
];

for (const [label, ids] of groups) {
    const group = document.createElement("optgroup");

    group.label = label;

    for (const id of ids) {
        group.append(new Option(ABOUT[id][0], id));
    }

    picker.append(group);
}

// (The people: an adventurer and a soldier, of any people, with a weapon of theirs; and each of
// the folk's roles)
{
    const group = document.createElement("optgroup");

    group.label = "People";
    group.append(new Option("Adventurer", "person:adventurer"), new Option("Soldier", "person:soldier"));

    for (const role of FOLK_ROLES) {
        group.append(new Option(ROLES[role].title, `person:${role}`));
    }

    picker.append(group);
}

// (Each dungeon theme's bosses and mini-bosses, as they're drawn there)
for (const [theme, { name, bosses, minis }] of Object.entries(THEMES)) {
    const group = document.createElement("optgroup");

    group.label = `Dungeons: ${name}`;

    for (const [rank, list] of [["boss", bosses], ["mini", minis]]) {
        for (const { id, title } of list) {
            group.append(new Option(`${title.replace(/^the /, "The ")}${rank === "boss" ? " (boss)" : ""}`, `${theme}:${rank}:${id}`));
        }
    }

    picker.append(group);
}

// (Things: the ox in its wagon's shafts; what's carried and worn, by where; and the catalog's
// props, the treasure chest first)
{
    const wagons = document.createElement("optgroup");
    const items = document.createElement("optgroup");
    const props = document.createElement("optgroup");

    wagons.label = "Wagons";
    wagons.append(new Option("A works' wagon and its ox", "ox"));
    items.label = "Things carried and worn";
    items.append(...ITEMS.map(([id, { label, slot }]) => new Option(`${label} (${WHERE[slot].replace(/^(held|worn|carried) /, "")})`, `item:${id}`)));
    props.label = "Props (the catalog's models)";
    props.append(...PROPS.sort((a, b) => (a === "chest" ? -1 : b === "chest" ? 1 : 0)).map((id) => new Option(ASSETS.models[id].label.replace(/ \(.*$/, ""), `prop:${id}`)));
    picker.append(wagons, items, props);
}

// (The creatures to come: their models, before they're in the game)
if (COMING.length) {
    const group = document.createElement("optgroup");

    group.label = "Coming to the wilds (models not in the game yet)";
    group.append(...COMING.map((id) => new Option(ASSETS.models[id].label.replace(/ \(.*$/, "").replace(/^the (.)/i, (_, first) => first.toUpperCase()), `model:${id}`)));
    picker.append(group);
}

picker.addEventListener("change", () => show(picker.value));

// Who one of the people is: their people, a woman or a man, and what they fight with; or the
// ox's wagon's people and load
const who = { section: document.querySelector("#person"), heading: document.querySelector("#personing"), people: document.querySelector("#people"), sex: document.querySelector("#sex"), weapon: document.querySelector("#weapon"), load: document.querySelector("#load") };

who.people.append(...HERO_PEOPLES.map(({ id, label }) => new Option(label, id)));

// (Shown with the choices for one of the people, as they are, or the ox's wagon; not for a
// creature or a thing)
function showWho() {
    const shown = current.person;
    const wagon = current.id === "ox";

    who.section.hidden = !shown && !wagon;
    who.heading.textContent = wagon ? "Wagon" : "Person";

    // (Its tab, on a phone, with it: named for it; another one shown if it's going)
    const tab = document.querySelector("#tabs [data-tab=person]");

    tab.hidden = who.section.hidden;
    tab.textContent = who.heading.textContent;

    if (tab.hidden && tab.getAttribute("aria-selected") === "true") {
        showTab("moving");
    }
    who.sex.hidden = wagon;
    who.load.hidden = !wagon;

    if (wagon) {
        who.people.value = person.people;
        who.load.value = person.load;
        who.weapon.hidden = true;

        return;
    }

    if (!shown) {
        return;
    }

    const arms = weaponsOf(shown.role, shown.people);

    who.people.value = shown.people;
    who.sex.value = shown.sex;
    who.weapon.replaceChildren(...arms.map((weapon) => new Option(WEAPONS[weapon].label, weapon)));
    who.weapon.value = shown.weapon ?? "";
    who.weapon.hidden = arms.length === 0;
}

// The skin worn by what's shown, if it has others ("" its own: ?skin=), chosen in the panel; the
// skins read (their glTFs, by URL)
const skins = { row: document.querySelector("#skinning"), select: document.querySelector("#skin") };
const skinsRead = new Map();
let skin = params.get("skin") ?? "";
let wearing = 0;

// The textures a skin's material may give, as three.js names them
const MAPS = ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "emissiveMap"];

// (Shown with what has other skins, the one chosen worn if it has it; not for anything else)
function showSkins() {
    const others = current.thing?.read ? (current.thing.skins ?? []) : [];

    skins.row.hidden = others.length === 0;
    skins.select.replaceChildren(new Option("Its own skin", ""), ...others.map((name) => new Option(`${name[0].toUpperCase()}${name.slice(1)}`, name)));
    skins.select.value = others.includes(skin) ? skin : "";

    if (others.length) {
        wear(skins.select.value);
    }
}

/**
 * Puts one of the skins on what's shown ("" its own): each of the skin's materials' textures in
 * place of those of the model's material of the same name, the rest of it as it is, as
 * utilities/blenderpipeline's variants are made to be worn. Resolves once it's on (or something
 * else is shown).
 */
async function wear(name) {
    const shown = current;
    const url = name && shown.thing?.asset ? skinsOf(shown.thing.asset)[name] : null;
    const ticket = ++wearing;

    if (!shown.thing?.skins?.length || (name && !url)) {
        return;
    }

    if (url && !skinsRead.has(url)) {
        skinsRead.set(url, loadGltf(url));
    }

    const materials = url ? await (await skinsRead.get(url)).parser.getDependencies("material") : [];

    // (Something else shown or worn meanwhile)
    if (current !== shown || ticket !== wearing) {
        return;
    }

    const made = new Map();

    shown.avatar.object.traverse((node) => {
        if (!node.isMesh) {
            return;
        }

        node.userData.ownMaterial ??= node.material;

        const own = node.userData.ownMaterial;
        const given = materials.find((material) => material.name === own.name);

        if (given && !made.has(own.name)) {
            const worn = own.clone();

            for (const map of MAPS.filter((one) => given[one])) {
                worn[map] = given[map];
            }

            made.set(own.name, worn);
        }

        node.material = given ? made.get(own.name) : own;
    });

    shown.thing.skin = name;
    wireframe(shown.avatar.object, looks.wireframe.checked);
}

skins.select.addEventListener("change", () => {
    skin = skins.select.value;
    wear(skin);
});

for (const [key, select] of [["people", who.people], ["sex", who.sex], ["weapon", who.weapon], ["load", who.load]]) {
    select.addEventListener("change", () => {
        person[key] = select.value;
        show(current.id);
    });
}
document.querySelector("#another").addEventListener("click", () => show(current.id, seed + 1));

for (const button of document.querySelectorAll("[data-action]")) {
    button.addEventListener("click", () => {
        again = 0;
        act(button.dataset.action);
    });
}

looks.play.addEventListener("click", () => play(!watch.playing));
looks.back.addEventListener("click", () => step(-1));
looks.forward.addEventListener("click", () => step(1));
looks.speed.addEventListener("change", () => {
    watch.speed = Number(looks.speed.value);
});
looks.loop.addEventListener("change", () => {
    watch.loop = looks.loop.checked;
});
looks.scrub.addEventListener("input", () => {
    // (Where it's slid to, before pausing puts the slider where the clip was)
    watch.clipAt = Number(looks.scrub.value);
    play(false);
    current.avatar.plan.hold(watch.clip, watch.clipAt);
    showTime();
});
looks.skeleton.addEventListener("change", showBones);
looks.wireframe.addEventListener("change", () => wireframe(current.avatar.object, looks.wireframe.checked));

// (The panel of all that, shown or not: shown to start with where there's room for it)
const inspect = document.querySelector("#inspect");

// A screen with little room (a phone, either way up): the bars one row each, their buttons icons,
// the panel in tabs
const COMPACT = window.matchMedia("(max-width: 759px), (max-height: 520px)");

/**
 * Lay the page out for the screen and the panel: compact or not; the panel beside what's shown
 * (a screen wider than it's tall, or a wide one) or under it (a phone or a tablet held upright,
 * its lower half),
 * between the bars however many lines they take; and how much of the view they cover (covered),
 * what's shown centred in what's left.
 */
function layout() {
    const body = document.body;
    const panel = document.querySelector("#panel");
    const open = body.classList.contains("panel-open");
    const compact = COMPACT.matches;
    const side = window.innerWidth > window.innerHeight || (!compact && window.innerWidth >= 1000);

    body.classList.toggle("compact", compact);
    body.classList.toggle("side", side);
    body.classList.toggle("below", !side);

    // (Drawn for a picture, nothing over it)
    if (body.classList.contains("shot")) {
        Object.assign(covered, { top: 0, right: 0, bottom: 0, left: 0 });

        return;
    }

    const top = document.querySelector("#top").getBoundingClientRect().bottom;
    const foot = document.querySelector("#foot").getBoundingClientRect().top;

    panel.style.top = `${side ? top + 8 : Math.max(top + 8, window.innerHeight * 0.45)}px`;
    panel.style.bottom = `${window.innerHeight - foot + 8}px`;

    const sheet = open ? panel.getBoundingClientRect() : null;

    Object.assign(covered, { top: top + 4, right: open && side ? window.innerWidth - sheet.left + 4 : 0, bottom: window.innerHeight - (open && !side ? sheet.top : foot) + 4, left: 0 });
}

function showPanel(on) {
    document.body.classList.toggle("panel-open", on);
    inspect.setAttribute("aria-expanded", String(on));
    layout();
    fit();
}

// (Laid out again as the screen turns or changes size, and as the bars take more or fewer lines)
window.addEventListener("resize", () => {
    layout();
    fit();
});

new ResizeObserver(() => layout()).observe(document.querySelector("#foot"));
new ResizeObserver(() => layout()).observe(document.querySelector("#top"));

inspect.addEventListener("click", () => showPanel(!document.body.classList.contains("panel-open")));
document.querySelector("#close").addEventListener("click", () => showPanel(false));
showPanel(!params.has("shot") && !COMPACT.matches);

// (The panel's tabs, on a phone: one part of it at a time, its moves to start with)
const tabs = [...document.querySelectorAll("#tabs [role=tab]")];

function showTab(name) {
    for (const tab of tabs) {
        tab.setAttribute("aria-selected", String(tab.dataset.tab === name));
    }

    for (const section of document.querySelectorAll("#panel section")) {
        section.classList.toggle("shown", section.dataset.tab === name);
    }
}

for (const tab of tabs) {
    tab.addEventListener("click", () => showTab(tab.dataset.tab));
}

showTab("moving");

// (Space plays or pauses, the arrows step a frame back or on: not while choosing something)
document.addEventListener("keydown", (event) => {
    if (event.target.closest?.("select, input, textarea, button, a") || event.metaKey || event.ctrlKey || event.altKey) {
        return;
    }

    if (event.key === " ") {
        play(!watch.playing);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        step(event.key === "ArrowLeft" ? -1 : 1);
    } else {
        return;
    }

    event.preventDefault();
});

// --- Running ---

const asked = params.has("person") ? `person:${params.get("person")}` : params.has("item") ? `item:${params.get("item")}` : params.has("prop") ? `prop:${params.get("prop")}` : params.has("model") ? `model:${params.get("model")}` : params.get("creature");
const known = (id) =>
    id in LOOKS ||
    championOf(id ?? "") ||
    (isPerson(id) && (FOLK_ROLES.includes(id.slice(7)) || ["adventurer", "soldier"].includes(id.slice(7)))) ||
    (id?.startsWith("item:") && ITEMS.some(([item]) => `item:${item}` === id)) ||
    (id?.startsWith("prop:") && PROPS.includes(id.slice(5))) ||
    (id?.startsWith("model:") && COMING.includes(id.slice(6)));
const start = known(asked) ? asked : "wolf";

show(start);

if (clipWanted && playClip(clipWanted)) {
    clipWanted = null;
} else {
    act(params.get("action") ?? "stand");
}

status.hidden = true;

if (params.has("shot")) {
    document.body.classList.add("shot");
}

play(watch.playing);

const clock = new THREE.Clock();

renderer.setAnimationLoop(() => {
    resize();

    const delta = Math.min(0.05, clock.getDelta());

    if (watch.playing) {
        playOn(delta * watch.speed);
    }

    controls.update();
    renderer.render(scene, camera);
});

/** For scripts: show, act and step time on exactly, then draw; and watch it as the panel does. */
window.lab = {
    ids: Object.keys(LOOKS),
    show: (id, which) => {
        show(id, which);

        return true;
    },
    act,
    advance,
    avatar: () => current.avatar,
    current: () => ({ id: current.id, humanoid: !current.avatar.plan, person: current.person, thing: current.thing, attacks: current.avatar.attacks ?? [], specials: current.avatar.specials ?? [], rests: current.avatar.rests ?? [] }),
    pause: () => play(false),
    play: () => play(true),
    step,
    clip: playClip,
    // (A skin put on what's shown, by name: "" its own; resolves once it's on)
    skin: async (name) => {
        skin = name;
        skins.select.value = name;
        await wear(name);

        return current.thing?.skin === name;
    },
    watch: () => ({ ...watch, past: rewind.past, kept: rewind.kept.length, bones: bones?.bones.length ?? 0, moves: movesOf().map(({ label }) => label), clips: Object.keys(current.avatar.plan?.lengths ?? {}) }),
    details: () => detailsOf(current.avatar.object),
    // (How it's laid out and seen: how much of the view the bars and panel cover; where the middle
    // of what's shown is on the screen; and the camera, how far back, its fog, its view's shape)
    layout: () => ({ covered: { ...covered }, compact: document.body.classList.contains("compact"), side: document.body.classList.contains("side") }),
    onScreen: () => {
        const at = controls.target.clone().project(camera);

        return [((at.x + 1) / 2) * canvas.clientWidth, ((1 - at.y) / 2) * canvas.clientHeight];
    },
    camera: () => ({ distance: camera.position.distanceTo(controls.target), fogFar: scene.fog.far, aspect: camera.aspect, view: camera.view && camera.view.enabled ? { ...camera.view } : null }),
    view: ({ turn = 0, lift = 0, zoom = 1, at = null } = {}) => {
        // (Looking at a height, metres: its head, say)
        if (at !== null) {
            const shift = at - controls.target.y;

            controls.target.y += shift;
            camera.position.y += shift;
        }

        const offset = camera.position.clone().sub(controls.target);
        const spherical = new THREE.Spherical().setFromVector3(offset);

        spherical.theta += turn;
        spherical.phi = Math.min(1.5, Math.max(0.2, spherical.phi - lift));
        spherical.radius *= zoom;
        camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
        controls.update();
    },
    draw: () => {
        resize();
        controls.update();
        renderer.render(scene, camera);
    },
};
