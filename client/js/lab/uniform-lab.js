// The uniform lab (uniform-lab.html): each people's soldiers in their uniforms (a captain in their
// cloak with the weapon their guards carry, a soldier with their patrols'), and their officials in
// their livery (a reeve and their ruler), side by side, a row for each people
// (characters/liveries.js); or their townsfolk in their everyday dress (characters/dress.js: a
// shopper with their basket, a field hand with a hoe over the shoulder, a porter, merchants and a
// priest). ?people=<a people, or all>&show=<soldiers, officials, all, townsfolk>&facing=<front, side, back>
// &drawn=<merged: their garments drawn all at once, as in the game; apart: each on its own>

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { Character } from "../characters/character.js";
import { EVERYDAY, theirs } from "../characters/dress.js";
import { folkLook } from "../characters/folk.js";
import { loadCharacterKit } from "../characters/kit.js";
import { LIVERIED, LIVERIES } from "../characters/liveries.js";
import { Walker, WALK_STYLES } from "../characters/locomotion.js";
import { ARMS, soldierLook } from "../characters/soldiers.js";

const canvas = document.querySelector("#map");
const status = document.querySelector("#status");
const params = new URLSearchParams(location.search);
const choice = {
    people: LIVERIED.includes(params.get("people")) ? params.get("people") : "all",
    show: ["soldiers", "officials", "townsfolk"].includes(params.get("show")) ? params.get("show") : "all",
    facing: ["side", "back"].includes(params.get("facing")) ? params.get("facing") : "front",
    drawn: params.get("drawn") === "apart" ? "apart" : "merged",
};

// What each people's colours are, in words
const ABOUT = Object.freeze({
    human: "Royal blue and gold, bright steel; a crown.",
    elf: "Forest green and silver, silvered steel; a leaf.",
    darkElf: "Deep violet, black and silver, black steel; a spider.",
    cat: "Indigo and saffron, bronze; a sun. Their helms open round their ears.",
    lizard: "Crimson and turquoise, bronze; a serpent. Quilted cotton under the surcoat, a fan of feathers.",
    orc: "Blood red and black, blackened iron; claws. A breastplate over bare arms.",
});

// What each people's townsfolk wear, in words (dress.js)
const EVERYDAY_ABOUT = Object.freeze({
    human: "Homespun: tunics, kirtles and smocks, coifs, hoods and straw hats; a wicker basket.",
    elf: "Tunics over slim leggings, long gowns, of fine cloth in moss, silver and dusk, a vine worked round neck and hem; silk sashes, silver circlets; a willow basket like a leaf.",
    darkElf: "Close-fitted, high-necked black and violet, a silver web across the breast; leggings, the women's narrow skirts, tall boots, black hoods and circlets; a six-sided basket of black reed.",
    cat: "Light wraps in bold zigzagged bands of saffron, indigo and red; the men's wide trousers under a banded sash, the women's sarongs and shukas; beaded collars, bronze bangles, bare feet; a wide banded basket.",
    lizard: "White cotton with stepped frets in turquoise and crimson: huipils, short jackets, the women's wrap skirts, the men's loincloths or breeches, capes; jade bangles, feathered bands; a tall reed basket.",
    orc: "Patched, stitched hide; the men's hide trousers, the women's skirts of hide strips; fur mantles, strings of bone, iron bands; a basket of lashed sticks with a bone handle.",
});

// What the townsfolk carry (folk.js), each people's own (dress.js): what's taken off a look to
// give each of the townsfolk shown what they're to carry
const CARRIED = new Set(["pannier", "sack", "firewood", "jug", "pitchfork", "broom", "walkingStaff", "ledger", "hoe", "basket", ...Object.values(EVERYDAY).map(({ basket }) => basket[0])]);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });

renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();

scene.background = new THREE.Color(0xa9c8de);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.5;

const sun = new THREE.DirectionalLight(0xfff1dc, 2);

sun.position.set(4, 8, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target, new THREE.HemisphereLight(0xcfe0ff, 0x4a4030, 0.7));

const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0x6f7a55, roughness: 0.95 }));

ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
const controls = new OrbitControls(camera, canvas);

controls.enableDamping = true;

const kit = await loadCharacterKit({ textureSize: 512 });

// Each figure: its character and walker (standing), in a row for its people
const figures = [];

// One of a people's townsfolk in `calling`, carrying `carry` (their people's own: dress.js)
function townsfolk(people, calling, sex, seed, carry = null) {
    const look = folkLook({ role: "townsfolk", look: calling, sex, seed, people });

    return { ...look, equipment: [...look.equipment.filter((id) => !CARRIED.has(id)), ...(carry ? [theirs(people, carry)] : [])] };
}

// Who stands in each people's row: a captain and a soldier, a reeve and the ruler; or six of their
// townsfolk
function cast(people) {
    if (choice.show === "townsfolk") {
        return [
            { label: "Shopper", look: townsfolk(people, "shopper", "f", 21, "basket") },
            { label: "Field hand", look: townsfolk(people, "fieldhand", "m", 22, "hoe") },
            { label: "Porter", look: townsfolk(people, "porter", "m", 23, "sack") },
            { label: "Merchant", look: townsfolk(people, "merchant", "f", 24) },
            { label: "Merchant", look: townsfolk(people, "merchant", "m", 25) },
            { label: "Priest", look: townsfolk(people, "friar", "f", 26, "walkingStaff") },
        ];
    }

    const [guards, patrols] = ARMS[people];
    const soldiers = [
        { label: "Captain", look: soldierLook({ people, weapon: guards, sex: "m", seed: 11, captain: true }) },
        { label: "Soldier", look: soldierLook({ people, weapon: patrols, sex: "f", seed: 12 }) },
    ];
    const officials = [
        { label: "Reeve", look: folkLook({ role: "reeve", sex: "m", seed: 13, people }) },
        { label: "Ruler", look: folkLook({ role: "ruler", sex: "f", seed: 14, people }) },
    ];

    return choice.show === "soldiers" ? soldiers : choice.show === "officials" ? officials : [...soldiers, ...officials];
}

const peoples = choice.people === "all" ? LIVERIED : [choice.people];
const turn = { front: 0, side: Math.PI / 2, back: Math.PI }[choice.facing];

for (const [row, people] of peoples.entries()) {
    const standing = cast(people);

    for (const [column, { label, look }] of standing.entries()) {
        const character = new Character(kit, { shape: look.shape, look: look.look, equipment: look.equipment, merge: choice.drawn === "merged" });
        const walker = new Walker(character, WALK_STYLES[look.walk] ?? WALK_STYLES.natural);

        character.sheathe(true);
        character.object.position.set((column - (standing.length - 1) / 2) * 1.1, 0, (row - (peoples.length - 1) / 2) * 2.4);
        character.object.rotation.y = turn;
        scene.add(character.object);
        figures.push({ people, label, character, walker });
    }
}

// Framing all of them
const across = Math.max(choice.show === "townsfolk" ? 6.6 : 4.4, peoples.length * 2.4);

controls.target.set(0, 1, 0);
camera.position.set(0, 1.4 + across * 0.25, 2 + across * 1.25);

function resize() {
    const { clientWidth: width, clientHeight: height } = canvas;

    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
}

const timer = new THREE.Timer();

function frame(time) {
    timer.update(time);
    resize();

    const dt = Math.min(0.05, timer.getDelta());

    for (const { walker } of figures) {
        walker.update(dt, { speed: 0 });
    }

    controls.update();
    renderer.render(scene, camera);
    document.querySelector("#stats").textContent = `${figures.length} figures, ${renderer.info.render.calls} draw calls, ${Math.round(renderer.info.render.triangles / 1000)}k triangles`;
}

renderer.setAnimationLoop(frame);

// The settings: chosen again, the page's address changed and built afresh
for (const id of ["people", "show", "facing", "drawn"]) {
    const select = document.querySelector(`#${id}`);

    select.value = choice[id];
    select.addEventListener("change", () => {
        const next = new URLSearchParams({ ...choice, [id]: select.value });

        location.search = next.toString();
    });
}

document.querySelector("#about").textContent = peoples.map((people) => `${people === "darkElf" ? "Dark elves" : people[0].toUpperCase() + people.slice(1)}: ${(choice.show === "townsfolk" ? EVERYDAY_ABOUT : ABOUT)[people]}`).join(" ");
status.hidden = true;

window.lab = { THREE, scene, camera, controls, renderer, figures, LIVERIES, ready: true };
