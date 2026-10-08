// The creature lab (creature-lab.html): every creature of the wilds (beasts/looks.js), one at a
// time, standing, walking, running, attacking, struck and dying, to look at from any side.
//
// ?creature=wolf&action=walk&seed=3 opens on one; window.lab lets a script do the same and step
// time on exactly (for renders: .shots). The ox is shown in its wagon's shafts, laden with
// ?load=wood (or stone, metal; none: empty) in ?people=human's timber.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { dressCreature } from "../beasts/beast.js";
import { LOOKS } from "../beasts/looks.js";
import { loadCharacterKit } from "../characters/kit.js";
import { WEAPONS } from "../core/weapons.js";
import { hitch } from "../world/art/kits/wagon.js";

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
    goblin: ["Goblin raider", "Far out", "cleaver"],
    skeleton: ["Skeleton", "Far out, and in ruins"],
    cultist: ["Cultist", "Far out, in camps", "wand"],
    banditChief: ["Bandit chief", "Leading the outlaws who hold a place", "sword"],
    troll: ["Troll", "The far wilds", "hammer"],
    ogre: ["Ogre", "The far wilds", "hammer"],
    wyvern: ["Wyvern", "The far wilds, and the mountains"],
    ox: ["Draught ox", "Not of the wild: drawing a works' wagon in a convoy"],
    blackShuck: ["Black shuck", "Only in the humans' wilds"],
    boggart: ["Boggart", "Only in the humans' wilds", "gauntlets"],
    wisp: ["Will-o'-wisp", "Only in the elves' wilds"],
    treant: ["Blighted treant", "Only in the elves' wilds"],
    caveSpider: ["Cave spider", "Only in the dark elves' wilds"],
    shadowStalker: ["Shadow stalker", "Only in the dark elves' wilds"],
    hyena: ["Hyena", "Only in the cat folk's wilds"],
    scorpion: ["Sand scorpion", "Only in the cat folk's wilds"],
    bogFrog: ["Bog frog", "Only in the lizard folk's wilds"],
    crocodile: ["Marsh crocodile", "Only in the lizard folk's wilds"],
    magmaSlime: ["Magma slime", "Only in the orcs' wilds"],
    rockTusker: ["Rock tusker", "Only in the orcs' wilds"],
    dragon: ["Dragon", "The dragon's lair: for the mightiest"],
    ghost: ["Restless ghost", "The ruins and ruined castles, with their dead"],
    wraith: ["Wraith", "The ruins and ruined castles, with their dead"],
    wightLord: ["Wight lord", "Ruined castles: for the mightiest"],
    frostTroll: ["Frost troll", "The snows: for the mightiest", "hammer"],
};

// --- The scene ---

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: params.has("shot") });

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

const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.95 }));

ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 200);
const controls = new OrbitControls(camera, canvas);

controls.enableDamping = true;

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
    map.repeat.set(60, 60);
    map.anisotropy = 8;
    map.colorSpace = THREE.SRGBColorSpace;

    return map;
}

function resize() {
    const { clientWidth: width, clientHeight: height } = canvas;
    const ratio = renderer.getPixelRatio();

    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
    }
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
let along = 0;

/** Show one of the creatures (a LOOKS id), one of its kind (`which`). */
function show(id, which = seed) {
    if (current) {
        current.avatar.object.removeFromParent();
        current.avatar.character.dispose();
    }

    const weapon = ABOUT[id]?.[2] ?? null;
    const avatar = dressCreature(kit, id, { seed: which, equipment: weapon ? WEAPONS[weapon].equipment : [], guard: weapon ? WEAPONS[weapon].attacks[0].animation : null });

    // (An ox in its wagon's shafts)
    if (id === "ox") {
        hitch(avatar, LOOKS.ox, { load: params.get("load") ?? "wood", people: params.get("people") ?? "human", seed: which });
    }

    scene.add(avatar.object);
    along = 0;
    avatar.place(0, 0, Math.PI / 2);
    current = { id, avatar, weapon, size: Math.max(avatar.character.height, (avatar.plan?.length ?? 0.6) * (avatar.scale ?? 1)) };
    seed = which;
    picker.value = id;
    document.querySelector("#name").textContent = ABOUT[id]?.[0] ?? id;
    document.querySelector("#about").textContent = ABOUT[id]?.[1] ?? "";
    frame();
    act("stand");

    // (Only a winged one flies, and comes down to land)
    for (const button of document.querySelectorAll("[data-action=fly], [data-action=land]")) {
        button.hidden = !avatar.winged;
    }

    return current;
}

// The camera on it: three-quarters from the front, far enough to see all of it
function frame() {
    const { avatar } = current;
    const height = avatar.character.height;
    const size = avatar.plan ? Math.max(height, avatar.plan.length * avatar.scale * 0.8) : height;
    const distance = size * 1.75 + 0.8;

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

/** Have it do something: stand, walk, run, attack, react (struck), rest or die (`which`: an attack's or rest's name). */
function act(what, which = null) {
    const { avatar, weapon } = current;

    action = what;

    for (const button of document.querySelectorAll("[data-action]")) {
        button.setAttribute("aria-pressed", String(button.dataset.action === what));
    }

    avatar.actions.revive();
    again = 0;

    if (what === "attack") {
        const attack = weapon ? WEAPONS[weapon].attacks[0] : { animation: "bite", hitAt: 450, duration: 900 };

        avatar.actions.setGuard?.(true);
        avatar.character.sheathe(false);
        avatar.actions.startAttack(which ?? attack.animation, { hitAt: attack.hitAt / 1000, duration: attack.duration / 1000 });

        if (which && avatar.doing?.attack) {
            avatar.doing.attack.style = which;
        }

        shown(avatar.doing?.attack?.style ?? attack.animation);
    } else if (what === "rest") {
        avatar.rest?.(which);
        avatar.restWeight = which ? 1 : avatar.restWeight;
        shown(avatar.resting?.name ?? "");
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
}

// What it's doing, named under what it is
function shown(name) {
    document.querySelector("#about").textContent = `${ABOUT[current.id]?.[1] ?? ""}${name ? ` · ${name}` : ""}`;
}

// Every few moments, it attacks (or flinches) again, while that's what it's showing
let again = 0;

/** Step time on (seconds): it moves and does what it's doing. */
function advance(seconds, step = 1 / 60) {
    const { avatar } = current;

    for (let left = seconds; left > 1e-6; left -= step) {
        const dt = Math.min(step, left);

        along += PACE[action] !== undefined ? PACE[action] * dt * (action === "fly" ? avatar.scale ?? 1 : 1) : 0;

        if (action === "fly") {
            // (Flying along level, a little over its own height up, beating and gliding by turns)
            const t = (avatar.clock ?? 0) + dt;

            avatar.soar(dt, along, avatar.character.height * 1.3, 0, Math.PI / 2, { beat: 0.55 + 0.45 * Math.sin(t * 0.4), bank: Math.sin(t * 0.3) * 0.15 });
        } else {
            avatar.update(dt, along, 0, Math.PI / 2, action !== "attack");
        }

        again += dt;

        if ((action === "attack" || action === "react" || action === "knockdown") && again > (action === "knockdown" ? 2.6 : 2)) {
            again = 0;
            act(action);
        }
    }

    // (The camera and the sun keep up with it, up in the air too)
    const { x, y, z } = avatar.object.position;
    const shift = new THREE.Vector3(x - controls.target.x, y + avatar.character.height * 0.5 - controls.target.y, z - controls.target.z);

    controls.target.add(shift);
    camera.position.add(shift);
    sun.position.add(shift);
    sun.target.position.set(x, 0, z);
}

// --- The controls ---

const groups = [
    ["Near home", ["rat", "porcupine", "slime", "bats", "wolf", "boar", "snake", "bandit", "bear", "puma", "direWolf", "goblin", "skeleton", "cultist", "troll", "ogre", "wyvern"]],
    ["Each people's own", ["blackShuck", "boggart", "wisp", "treant", "caveSpider", "shadowStalker", "hyena", "scorpion", "bogFrog", "crocodile", "magmaSlime", "rockTusker"]],
    ["The restless dead", ["ghost", "wraith"]],
    ["For the mightiest", ["dragon", "wightLord", "frostTroll", "banditChief"]],
];

for (const [label, ids] of groups) {
    const group = document.createElement("optgroup");

    group.label = label;

    for (const id of ids) {
        group.append(new Option(ABOUT[id][0], id));
    }

    picker.append(group);
}

picker.addEventListener("change", () => show(picker.value));
document.querySelector("#another").addEventListener("click", () => show(current.id, seed + 1));

for (const button of document.querySelectorAll("[data-action]")) {
    button.addEventListener("click", () => {
        again = 0;
        act(button.dataset.action);
    });
}

// --- Running ---

const start = params.get("creature") in LOOKS ? params.get("creature") : "wolf";

show(start);
act(params.get("action") ?? "stand");
status.hidden = true;

if (params.has("shot")) {
    document.body.classList.add("shot");
}

const clock = new THREE.Clock();
let playing = !params.has("shot");

renderer.setAnimationLoop(() => {
    resize();

    if (playing) {
        advance(Math.min(0.05, clock.getDelta()));
    }

    controls.update();
    renderer.render(scene, camera);
});

/** For scripts: show, act and step time on exactly, then draw. */
window.lab = {
    ids: Object.keys(LOOKS),
    show: (id, which) => {
        show(id, which);

        return true;
    },
    act,
    advance,
    avatar: () => current.avatar,
    current: () => ({ id: current.id, humanoid: !current.avatar.plan, attacks: current.avatar.attacks ?? [], specials: current.avatar.specials ?? [], rests: current.avatar.rests ?? [] }),
    pause: () => {
        playing = false;
    },
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
