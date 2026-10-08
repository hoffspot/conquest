// Makes the scanned and modelled things a dungeon's rooms are furnished with (client/models/dungeons,
// placed by client/js/world/dungeons3d.js), each free to use and change: most CC0
// (https://creativecommons.org/publicdomain/zero/1.0/), from Poly Haven's models, OpenGameArt's
// and museums' scans mirrored on Zenodo; some CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/),
// their makers named in PROPS' `by` (and so in the catalog, and the README's credits). Each
// source's page says so (checked 2026-10-08):
//
//   npm run build:props              (all of them)
//   npm run build:props -- jug bowls (only those files)
//
// Each model's files are downloaded once (into .cache): Poly Haven's glTF and its 1K pictures; a
// GLB (its meshes perhaps compressed, Draco's or meshoptimizer's); or an OBJ or STL and its PNG
// or JPEG pictures, in a .zip. Its colour darkened by its ambient occlusion (as the dungeons'
// photographs are: build-textures.js), its pictures made smaller (PROPS' `pixels`), its mesh made
// simpler where it has more triangles than it needs seen from a few metres off (PROPS'
// `triangles`, by meshoptimizer's simplifier, keeping its outline, its seams and where its
// pictures lie on it: SIMPLER), and the whole saved as one GLB, each of its materials' colour
// picture and normal map in it, how rough and how metal it is kept as a number (its picture's
// average). Bones (`bone`), whoever scanned or painted them, are all made one colour: BONE. Some
// models are sets (three candleholders, a heap of rocks, skulls and bones): each thing in a set is
// a prop of its own (`pieces`: its nodes), all of them in one file, sharing its pictures. Each file
// is listed in client/models/assets.json's catalog, with its pieces and whose it is, downloaded
// only once a dungeon's wanted (then: npm run build:manifest).

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { Document, NodeIO, getBounds } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import draco3d from "draco3dgltf";
import jpeg from "jpeg-js";
import { MeshoptDecoder, MeshoptSimplifier } from "meshoptimizer";
import { readObj, readStl } from "./lib/meshes.js";
import { readPng } from "./lib/png.js";
import { fetchSource } from "./sounds/sources.js";

const OUT = new URL("../client/models/dungeons/", import.meta.url);
const CATALOG = new URL("../client/models/assets.json", import.meta.url);

/**
 * The models' files, by name: which of Poly Haven's (`id`), or its own files (`from`: fromFiles,
 * whose they are and their licence in `by`, as the catalog's to say), what it is (`of`), how big its pictures
 * are made (`pixels` across), how many triangles it's let keep at most (each of its pieces, if
 * it's a set), how far from its shape that may take it (`error`: of its size, SIMPLER's if not
 * said), whether it keeps its normal maps (`normals`: true unless false), which of its
 * materials are left out (`drop`: their names; a candle's flame, drawn by the game's own fire),
 * and, for a set, its `pieces` ({ prop's name: [its nodes' names] }: nodes not in any piece are
 * left out). A model that isn't a set is one prop, by its file's name.
 */
// OpenGameArt's files (each a .zip of a model's files: `member`, the one inside it)
const opengameart = (file) => (member) => ({ url: `https://opengameart.org/sites/default/files/${file}`, member });
const SKULL = opengameart("skull-obj.zip");
const DEBRIS = ((pack) => (path) => pack(`dungeon_debris_-_skull_and_bones_1/${path}`))(opengameart("dungeon_debris_-_skull_and_bones_1_0.zip"));

// Zenodo's files (its mirror of the scans and models Sketchfab's makers let anyone have, each record
// saying whose and its licence: https://zenodo.org/records/<record>)
const zenodo = (record, file) => ({ glb: { url: `https://zenodo.org/api/records/${record}/files/${file}/content` } });

// Objaverse's copies of Sketchfab's models (https://huggingface.co/datasets/allenai/objaverse), each
// under its maker's licence (checked against Sketchfab's own)
const objaverse = (id) => ({ glb: { url: `https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/${id}.glb` } });

// A set's pieces, each one node by its own name
const each = (...names) => Object.fromEntries(names.map((name) => [name, [name]]));

export const PROPS = {
    // Furniture
    table: { id: "wooden_table_02", of: "a rough table", pixels: 512, triangles: 2000 },
    "table-plank": { id: "WoodenTable_01", of: "a plank table", pixels: 512, triangles: 1500 },
    "table-low": { id: "small_wooden_table_01", of: "a low table", pixels: 256, triangles: 1500 },
    stool: { id: "wooden_stool_01", of: "a stool", pixels: 256, triangles: 1200 },
    "stool-low": { id: "wooden_stool_02", of: "a low stool", pixels: 256, triangles: 1200 },
    "stool-folding": { id: "folding_wooden_stool", of: "a folding stool", pixels: 256, triangles: 1200 },
    bench: { id: "painted_wooden_bench", of: "a settle", pixels: 256, triangles: 700 },
    "chair-gothic": { id: "WoodenChair_01", of: "a tall carved chair", pixels: 512, triangles: 4000 },
    bookshelf: { id: "wooden_bookshelf_worn", of: "shelves", pixels: 512, triangles: 3000 },
    shelf: { id: "Shelf_01", of: "a narrow shelf", pixels: 256, triangles: 200 },
    "cabinet-gothic": { id: "GothicCabinet_01", of: "a carved cabinet", pixels: 512, triangles: 4000 },
    ladder: { id: "wooden_ladder_02", of: "a step ladder", pixels: 256, triangles: 1500 },
    // Barrels, crates, baskets and buckets
    barrel: { id: "wine_barrel_01", of: "a barrel", pixels: 512, triangles: 6000 },
    barrels: { id: "wooden_barrels_01", of: "old barrels and a broken one's staves", pixels: 256, triangles: 2000, pieces: { "barrel-old": ["wooden_barrels_01_barrel01"], "barrel-worn": ["wooden_barrels_01_barrel02"], staves: Array.from({ length: 17 }, (_, k) => `wooden_barrels_01_piece${String(k + 1).padStart(2, "0")}`) } },
    crate: { id: "wooden_crate_02", of: "a crate", pixels: 512, triangles: 2500 },
    "crate-long": { id: "wooden_crate_01", of: "a long crate with rope handles", pixels: 512, triangles: 2500 },
    "crate-big": { id: "wooden_military_crate", of: "an iron-bound chest", pixels: 512, triangles: 3000 },
    bucket: { id: "wooden_bucket_01", of: "a bucket", pixels: 256, triangles: 1500 },
    "bucket-wide": { id: "wooden_bucket_02", of: "a tub", pixels: 256, triangles: 2000 },
    basket: { id: "wicker_basket_01", of: "a flat basket", pixels: 256, triangles: 2500 },
    "basket-lidded": { id: "wicker_basket_02", of: "a lidded basket", pixels: 256, triangles: 2500 },
    // What's eaten and drunk from, and what's eaten
    goblets: { id: "brass_goblets", of: "brass goblets", pixels: 256, triangles: 800, pieces: { "goblet-a": ["brass_goblet_01"], "goblet-b": ["brass_goblet_02"], "goblet-c": ["brass_goblet_03"] } },
    bowl: { id: "wooden_bowl_01", of: "a carved bowl", pixels: 256, triangles: 1000 },
    "bowl-small": { id: "wooden_bowl_02", of: "a small bowl", pixels: 256, triangles: 600, normals: false },
    spoon: { id: "wooden_spoon", of: "a spoon", pixels: 128, triangles: 300, normals: false },
    plate: { id: "carved_wooden_plate", of: "a wooden plate", pixels: 256, triangles: 500, normals: false },
    board: { id: "wooden_cutting_board", of: "a board", pixels: 256, triangles: 400, normals: false },
    pot: { id: "ceramic_pot", of: "a lidded pot", pixels: 256, triangles: 1500 },
    "pot-brass": { id: "brass_pot_01", of: "a cooking pot", pixels: 256, triangles: 1200 },
    "pot-flat": { id: "brass_pot_02", of: "a shallow pot", pixels: 256, triangles: 1000 },
    "pot-clay": { id: "planter_pot_clay", of: "a clay pot", pixels: 256, triangles: 1000 },
    apple: { id: "food_apple_01", of: "an apple", pixels: 128, triangles: 400, normals: false },
    onion: { id: "yellow_onion", of: "an onion", pixels: 128, triangles: 400, normals: false },
    "sweet-potato": { id: "sweet_potato", of: "a root", pixels: 128, triangles: 300, normals: false },
    pomegranate: { id: "food_pomegranate_01", of: "a pomegranate", pixels: 128, triangles: 400, normals: false },
    // Vessels for an altar or an offering
    vase: { id: "brass_vase_04", of: "a brass vase, an altar's", pixels: 256, triangles: 1500 },
    "vase-antique": { id: "antique_ceramic_vase_01", of: "a painted vase", pixels: 256, triangles: 2000 },
    "vase-tall": { id: "brass_vase_01", of: "a tall vase", pixels: 256, triangles: 2000 },
    "vase-brass": { id: "brass_vase_02", of: "a brass ewer", pixels: 256, triangles: 1500 },
    "vase-small": { id: "brass_vase_03", of: "a small vase", pixels: 256, triangles: 800 },
    // Lights
    candlestick: { id: "wooden_candlestick", of: "a candlestick", pixels: 256, triangles: 1000 },
    candleholders: { id: "brass_candleholders", of: "brass candleholders", pixels: 256, triangles: 1200, drop: ["brass_candleholders_flame"], pieces: { "candleholder-a": ["brass_candleholder_01"], "candleholder-b": ["brass_candleholder_02"], "candleholder-c": ["brass_candleholder_03"] } },
    lantern: { id: "wooden_lantern_01", of: "a wooden lantern", pixels: 256, triangles: 1500 },
    // Tools and arms
    axe: { id: "wooden_axe", of: "a woodsman's axe", pixels: 256, triangles: 1200 },
    "axe-long": { id: "wooden_axe_02", of: "a long axe", pixels: 256, triangles: 800 },
    "axe-old": { id: "wooden_axe_03", of: "an old axe", pixels: 256, triangles: 800 },
    hatchet: { id: "hatchet", of: "a hatchet", pixels: 256, triangles: 800 },
    pickaxe: { id: "picke_dirty_01", of: "a pickaxe", pixels: 256, triangles: 1000 },
    spade: { id: "rusted_spade_01", of: "a spade", pixels: 256, triangles: 1000 },
    hammer: { id: "cross_pein_hammer", of: "a hammer", pixels: 128, triangles: 500 },
    mallet: { id: "wooden_hammer_01", of: "a mallet", pixels: 128, triangles: 500 },
    saw: { id: "handsaw_wood", of: "a saw", pixels: 256, triangles: 500 },
    estoc: { id: "antique_estoc", of: "a long sword", pixels: 256, triangles: 1200 },
    dagger: { id: "ornate_medieval_dagger", of: "a dagger and its sheath", pixels: 256, triangles: 1000 },
    mace: { id: "ornate_medieval_mace", of: "a mace", pixels: 256, triangles: 1500 },
    "war-hammer": { id: "ornate_war_hammer", of: "a war hammer", pixels: 256, triangles: 1000 },
    saber: { id: "wooden_handle_saber", of: "a sabre", pixels: 256, triangles: 800 },
    "shield-kite": { id: "kite_shield", of: "a kite shield", pixels: 512, triangles: 2500 },
    // Statues
    bust: { id: "marble_bust_01", of: "a marble bust on its plinth", pixels: 512, triangles: 4000 },
    "statue-gothic": { id: "gothic_statue", of: "a crowned king's statue", pixels: 512, triangles: 5000 },
    "lion-head": { id: "lion_head", of: "a bronze lion's head", pixels: 512, triangles: 3000 },
    "bull-head": { id: "bull_head", of: "a bronze bull's head", pixels: 512, triangles: 2500 },
    "horse-head": { id: "horse_head", of: "a bronze horse's head", pixels: 512, triangles: 2000 },
    "cat-statue": { id: "concrete_cat_statue", of: "a stone cat", pixels: 256, triangles: 2000 },
    // Rock, wood and what's fallen
    "fire-pit": { id: "stone_fire_pit", of: "a fire pit ringed with stones", pixels: 512, triangles: 2500 },
    boulder: { id: "moon_rock_02", of: "a fallen rock", pixels: 512, triangles: 1500 },
    "boulder-02": { id: "namaqualand_boulder_02", of: "a heap of broken rock", pixels: 512, triangles: 3000 },
    "boulder-03": { id: "namaqualand_boulder_03", of: "a squared boulder", pixels: 512, triangles: 3000 },
    "boulder-04": { id: "namaqualand_boulder_04", of: "a lichened boulder", pixels: 512, triangles: 3000 },
    "boulder-06": { id: "namaqualand_boulder_06", of: "a rounded boulder", pixels: 512, triangles: 3000 },
    "mossy-rocks": { id: "rock_moss_set_01", of: "mossy rocks", pixels: 512, triangles: 2000, pieces: Object.fromEntries(Array.from({ length: 6 }, (_, k) => [`mossrock-${"abcdef"[k]}`, [`rock_moss_set_01_rock0${k + 1}`]])) },
    "mossy-rocks-2": { id: "rock_moss_set_02", of: "mossy rocks", pixels: 512, triangles: 2000, pieces: Object.fromEntries(Array.from({ length: 7 }, (_, k) => [`mossrock2-${"abcdefg"[k]}`, [`rock_moss_set_02_rock${String(k + 7).padStart(2, "0")}`]])) },
    ...Object.fromEntries(["01", "03", "04", "05", "06", "07"].map((n, k) => [`rock-${"abcdef"[k]}`, { id: `moon_rock_${n}`, of: "a rock", pixels: 256, triangles: 1000 }])),
    "rock-flat": { id: "rock_07", of: "a flat rock", pixels: 256, triangles: 1000 },
    "rock-shard": { id: "rock_09", of: "a shard of rock", pixels: 256, triangles: 1000 },
    stone: { id: "stone_01", of: "a stone", pixels: 256, triangles: 1000 },
    pebbles: { id: "namaqualand_stones_01", of: "pebbles", pixels: 128, triangles: 400, normals: false, pieces: Object.fromEntries(["a", "b", "c", "d", "e"].map((l) => [`pebble-${l}`, [`namaqualand_stones_01_${l}`]])) },
    stones: { id: "namaqualand_rocks_01", of: "stones", pixels: 128, triangles: 500, normals: false, pieces: Object.fromEntries(["a", "b", "c", "d"].map((l) => [`stone-${l}`, [`namaqualand_rocks_02_${l}`]])) },
    log: { id: "dead_tree_trunk", of: "a dead log", pixels: 512, triangles: 3000 },
    "log-big": { id: "dead_tree_trunk_02", of: "a fallen trunk", pixels: 512, triangles: 4000 },
    "root-single": { id: "single_root", of: "an old root", pixels: 256, triangles: 2000 },
    stump: { id: "tree_stump_01", of: "a stump", pixels: 512, triangles: 3000 },
    "stump-2": { id: "tree_stump_02", of: "a stump", pixels: 512, triangles: 3000 },
    branches: { id: "dry_branches_medium_01", of: "dry branches", pixels: 256, triangles: 1000, pieces: Object.fromEntries(["a", "b", "c"].map((l) => [`branches-${l}`, [`dry_branches_medium_01_${l}`]])) },
    bark: { id: "bark_debris_01", of: "bark", pixels: 128, triangles: 400, normals: false, pieces: Object.fromEntries(["a", "b", "c", "d"].map((l) => [`bark-${l}`, [`bark_debris_01_${l}`]])) },
    // Bones (from OpenGameArt: CDmir's skull, and Paul_Wortmann's heaps of it and Ouren's bone)
    skull: { from: { mesh: SKULL("skull-obj/skull-Low4K.obj"), colour: SKULL("skull-obj/Skull-Low.png"), normal: SKULL("skull-obj/Skull-Low-normal.png"), occlusion: SKULL("skull-obj/Skull-AO.png") }, by: "CDmir on OpenGameArt, CC0", of: "a skull", scale: 0.075, rough: 0.7, saturation: 0.45, bone: true, pixels: 256, triangles: 1500 },
    bones: {
        from: {
            meshes: { "skull-worn": DEBRIS("export_obj/skull_1_001.obj"), "skull-side": DEBRIS("export_obj/skull_1_002.obj"), "skull-crossbones": DEBRIS("export_obj/bones_1_001.obj"), "bone-heap": DEBRIS("export_obj/bones_1_002.obj"), "skull-pile": DEBRIS("export_obj/bones_1_003.obj"), bone: { ...DEBRIS("export_obj/bones_1_004.obj"), within: [0.47, 0.35, 0.68, 0.65] } },
            colour: DEBRIS("textures/skull_1_001_d.png"),
            normal: DEBRIS("textures/skull_1_001_n.png"),
        },
        by: "Paul_Wortmann on OpenGameArt, CC0",
        of: "skulls and bones",
        scale: 0.26,
        rough: 0.7,
        bone: true,
        pixels: 256,
        triangles: 1200,
        pieces: each("skull-worn", "skull-side", "skull-crossbones", "bone-heap", "skull-pile", "bone"),
    },
    // Museums' scans and makers' models, from Zenodo (each its record's licence: CC0, or CC BY 4.0,
    // https://creativecommons.org/licenses/by/4.0/, its maker named)
    cart: { from: zenodo(10293610, "eb41c6490a5546269055916029e623ee.glb"), by: '"Wooden Cart" by filip.hans.nyberg on Sketchfab, CC BY 4.0', of: "a handcart", size: 2.6, pixels: 256, triangles: 3000 },
    wheelbarrow: { from: zenodo(10237410, "1033237cf4e24b27b618e1f3e7c45aa8.glb"), by: '"Mining cart medieval" by tijerin_art on Sketchfab, CC BY 4.0', of: "a wheelbarrow", size: 1.5, pixels: 256, triangles: 2500 },
    cauldron: { from: zenodo(21378444, "efe46979bbb647f2941a533d4df7e04a_normalized-0.100.glb"), by: "the Hunt Museum's Ballyscullion Bronze Cauldron, CC0", of: "a bronze cauldron", size: 0.55, pixels: 256, triangles: 2000 },
    "chest-old": { from: zenodo(10272532, "45f93c78e5174036801bfb535c139ac7.glb"), by: '"Old wooden chest" by Tim0 on Sketchfab, CC BY 4.0', of: "an old chest", size: 0.9, pixels: 256, triangles: 2500 },
    "weapon-rack": { from: zenodo(10233395, "8c55c5d985bf4d409766687007a4f734.glb"), by: '"Medieval weapon rack" by JosueBorghi on Sketchfab, CC BY 4.0', of: "a weapon rack", size: 1.7, pixels: 256, triangles: 1200 },
    sword: { from: zenodo(10282926, "c0eb5ba641964a25abbedf3b370307b9.glb"), by: '"Sæbø / Thurmuth sword" by JohnyNawalony on Sketchfab, CC BY 4.0', of: "a sword", size: 0.95, pixels: 256, triangles: 600 },
    pelt: { from: zenodo(21528084, "ff4431c4a6a0418aa78a548c69f8fc6d_normalized-0.100.glb"), by: "the Hunt Museum's Sheep Skin, CC0", of: "a sheepskin", size: 1.3, pixels: 256, triangles: 1500 },
    "sarcophagus-stone": { from: zenodo(10302681, "692ed495e6b64e83aff95bf65acc7650.glb"), by: "Minneapolis Institute of Art's Sarcophagus of Prince Yuan Mi, CC0", of: "a stone sarcophagus", size: 2.3, pixels: 512, triangles: 4000 },
    "sarcophagus-painted": { from: zenodo(21378183, "21642b701f9c45d6a472214fea274f75_normalized_optimized-0.100.glb"), by: '"Sarcophagus of Hunefer" by The Fitzwilliam Museum on Sketchfab, CC BY 4.0', of: "a painted coffin", size: 2, pixels: 512, triangles: 4000 },
    guardian: { from: zenodo(21567660, "2f47456dee4f4ad7a0f1468e7ee2d24e_normalized-0.100.glb"), by: "the Smithsonian's Kneeling Winged Monster, CC0", of: "a winged guardian", size: 1.2, pixels: 512, triangles: 4000 },
    "urn-face": { from: zenodo(21379266, "dffe3b1e1dbc4d16a3663f76ff9aa4f2_normalized-0.100.glb"), by: "the Archaeological Museum in Kraków's Face urn (Virtual Małopolska), CC0", of: "an urn", size: 0.45, pixels: 256, triangles: 2500 },
    "urn-carved": { from: zenodo(21492118, "36841f1bab36479fb02183a6d35c2fc5_normalized-0.100.glb"), by: '"Urn (cinerarium)" by The Fitzwilliam Museum on Sketchfab, CC BY 4.0', of: "a carved urn", size: 0.5, pixels: 256, triangles: 2500 },
    // (The Smithsonian's own lighter copy of what's in Zenodo's record 21370004, CC0)
    "bronze-vessel": { from: { glb: { url: "https://3d-api.si.edu/content/document/3d_package:d8c62f94-4ebc-11ea-b77f-2e728ce88125/f1930_54-part_01-smartscan-fixed-textured-20k-512-thumb.glb" } }, by: "the Smithsonian's Square lidded ritual wine container (fangyi), CC0", of: "a bronze vessel", size: 0.35, pixels: 256, triangles: 2500 },
    basin: { from: zenodo(21490838, "7d5b55c2c5204759b22e979327662421_normalized-0.100.glb"), by: '"Etruscan brazier" by GlobalDigitalHeritage on Sketchfab, CC BY 4.0', of: "a clay basin", size: 1, pixels: 256, triangles: 3000 },
    mushrooms: { from: zenodo(10229058, "f6adebbb4ed24f3591fa5b4dac4af4eb.glb"), by: '"Leponogi Goban Boletus calopus" by Prirodoslovni_muzej_Slovenije on Sketchfab, CC BY 4.0', of: "mushrooms", size: 0.2, pixels: 256, triangles: 1500 },
    fungus: { from: zenodo(21353381, "0715b186cb2642c38ca17a97aa73c8b0_normalized-0.100.glb"), by: '"Some kind of Fungus" by nebulousflynn on Sketchfab, CC BY 4.0', of: "bracket fungus on a branch", size: 0.35, pixels: 256, triangles: 1500 },
    // Beasts' skulls, and a body's bones (a CT scan's and an anatomy atlas's, without pictures: BONE
    // coloured)
    "wolf-skull": { from: zenodo(21492563, "f9430188e21f4e40a46d9e97875d6b2a_normalized_optimized-0.100.glb"), by: "the Virtual Museums of Małopolska's wolf skull, CC0", of: "a wolf's skull", size: 0.25, bone: true, pixels: 256, triangles: 2500 },
    "bear-skull": { from: objaverse("000-091/3fb00c98c70845a9bb2d989d0656a8ab"), by: '"Vertebrate: Ursus spelaeus (PRI 50009)" by Digital Atlas of Ancient Life on Sketchfab, CC0', of: "a cave bear's skull", size: 0.45, bone: true, pixels: 256, triangles: 2500 },
    "cow-skull": { from: objaverse("000-073/4de92a49cb8b4ffaacb515c64a5fbb37"), by: '"Cow Skull" by IsraelK on Sketchfab, CC BY 4.0', of: "a cow's skull", size: 0.6, bone: true, pixels: 256, triangles: 2500 },
    "stag-skull": { from: objaverse("000-061/ebd6e5b589cf41929f4748cdd27c5129"), by: '"Deer Skull - Photoscan" by Dmitry Schnein on Sketchfab, CC BY 4.0', of: "a stag's skull", size: 0.7, pixels: 256, triangles: 3000, saturation: 0.35, bone: true },
    "sheep-skull": { from: objaverse("000-116/2803d96915c4418b83618c17f45d50a6"), by: '"sheep skull 3D scan" by Model Thomas (daaanin) on Sketchfab, CC BY 4.0', of: "a ram's skull", size: 0.3, bone: 0.25, pixels: 256, triangles: 2500 },
    ribcage: { from: { glb: { url: "https://3d.nih.gov/api/download?submissionId=22678&fileIds=498606" }, plain: true }, by: '"Rib Cage_Human Skeleton" (3DPX-016836) by My Segmenter on NIH 3D, CC BY 4.0', of: "a ribcage", size: 0.36, bone: true, rough: 0.75, pixels: 256, triangles: 4000 },
    pelvis: { from: { glb: { url: "https://cdn.humanatlas.io/digital-objects/ref-organ/pelvis-male/v1.3/assets/3d-vh-m-pelvis.glb" }, plain: true }, by: "the Human Reference Atlas's male pelvis (v1.3), CC BY 4.0", of: "a pelvis", size: 0.3, bone: true, rough: 0.75, pixels: 256, triangles: 2500 },
    // And what lives in the dark
    rat: { id: "street_rat", of: "a rat", pixels: 256, triangles: 1200 },
};

// Poly Haven's file listing for a model (its 1K glTF and what that includes)
async function listing(id) {
    return JSON.parse(Buffer.from(await fetchSource({ url: `https://api.polyhaven.com/files/${id}` })).toString("utf8")).gltf["1k"].gltf;
}

const linear = (value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
const encoded = (value) => (value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055);

// A picture made `size` pixels square (from one of any size), each pixel the average of those it
// stands for (in linear light for a colour, renormalised for a normal map); a colour darkened by an
// occlusion picture's red channel (Poly Haven's ARM: occlusion, roughness, metal), of any size (its
// pixel at the same place), and its `saturation` changed (1: as it is; 0: grey)
function shrunk({ width, height, data }, size, kind, arm = null, saturation = 1) {
    const out = Buffer.alloc(size * size * 4);
    // (The first of the pixels each of the picture's rows and columns stands for, and the next's)
    const from = (k, across) => Math.floor((k * across) / size);

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const sum = [0, 0, 0];
            const [top, left] = [from(y, height), from(x, width)];
            const [bottom, right] = [Math.max(top + 1, from(y + 1, height)), Math.max(left + 1, from(x + 1, width))];

            for (let row = top; row < bottom; row++) {
                for (let column = left; column < right; column++) {
                    const p = (row * width + column) * 4;
                    const shade = arm ? arm.data[(Math.floor((row * arm.height) / height) * arm.width + Math.floor((column * arm.width) / width)) * 4] / 255 : 1;

                    for (let c = 0; c < 3; c++) {
                        sum[c] += kind === "normal" ? data[p + c] / 127.5 - 1 : linear(data[p + c] / 255) * shade;
                    }
                }
            }

            const q = (y * size + x) * 4;
            const length = kind === "normal" ? Math.hypot(...sum) || 1 : (bottom - top) * (right - left);
            const grey = (0.2126 * sum[0] + 0.7152 * sum[1] + 0.0722 * sum[2]) / length;

            for (let c = 0; c < 3; c++) {
                out[q + c] = kind === "normal" ? Math.round((sum[c] / length + 1) * 127.5) : Math.round(encoded(saturation === 1 ? sum[c] / length : grey + (sum[c] / length - grey) * saturation) * 255);
            }

            out[q + 3] = 255;
        }
    }

    return { width: size, height: size, data: out };
}

// The colour every bone is made (sRGB: PROPS' `bone`), a dry, aged bone's, so that heaped skulls,
// beasts' skulls and a body's bones lie together as one, whoever scanned or painted them
const BONE = [206, 192, 166];

// How far each of a bone's pixels is drawn to BONE's colour at its own lightness (0: kept its own;
// 1: all BONE's), so a scan's stains and tints are as dark as they were but of bone's hue
const BONE_HUE = 0.5;

// A bone's colour picture (sRGB, `picture`: changed) made BONE's colour: each channel times what
// brings the lighter part of it (`share`: the lighter half, or less where horn's more of it), as its
// meshes' corners see it (the bone, not horn, teeth or sockets), its material's colour factor taken
// in, to BONE, then each pixel drawn BONE_HUE of the way to BONE's colour as light as it is; its
// light and shade, and its horn, darker, kept. Its material's colour factor's then let go of.
function boned(picture, material, share) {
    const factor = material.getBaseColorFactor();
    const seen = [];

    for (const primitive of material.listParents().filter((parent) => parent.propertyType === "Primitive")) {
        const uv = primitive.getAttribute("TEXCOORD_0");

        for (let k = 0; uv && k < uv.getCount(); k++) {
            const [x, y] = uv.getElement(k, []).map((t, axis) => Math.min((axis ? picture.height : picture.width) - 1, Math.max(0, Math.floor((t - Math.floor(t)) * (axis ? picture.height : picture.width)))));
            const p = (y * picture.width + x) * 4;

            seen.push([0, 1, 2].map((c) => linear(picture.data[p + c] / 255) * factor[c]));
        }
    }

    const shade = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const lighter = seen.sort((a, b) => shade(b) - shade(a)).slice(0, Math.ceil(seen.length * share));
    const gain = [0, 1, 2].map((c) => (factor[c] * linear(BONE[c] / 255) * lighter.length) / Math.max(1e-4, lighter.reduce((sum, each) => sum + each[c], 0)));

    const bone = BONE.map((c) => linear(c / 255));

    for (let p = 0; p < picture.data.length; p += 4) {
        const own = [0, 1, 2].map((c) => linear(picture.data[p + c] / 255) * gain[c]);
        const light = shade(own) / shade(bone);

        for (let c = 0; c < 3; c++) {
            picture.data[p + c] = Math.round(encoded(Math.min(1, own[c] + (bone[c] * light - own[c]) * BONE_HUE)) * 255);
        }
    }

    material.setBaseColorFactor([1, 1, 1, factor[3]]);

    return picture;
}

// How rough and how metal a material is on average, from its ARM picture (green and blue: 0 to 1)
function averages({ data }) {
    let [rough, metal] = [0, 0];

    for (let p = 0; p < data.length; p += 4) {
        rough += data[p + 1];
        metal += data[p + 2];
    }

    const count = (data.length / 4) * 255;

    return { rough: rough / count, metal: metal / count };
}

// How the meshes are made simpler: no further from the model's shape than `error` (of its size), its
// pictures' places (`weights`: u, v) and which way it faces (x, y, z) kept as well as its shape, so
// that no triangle comes to stretch across the picture (a barrel's hoops, its staves); its open
// edges held where they are, unless that leaves it more than `slack` times the triangles it's let
// keep (a scan of a rock, all open edges), and then no further than `loose` if need be
const SIMPLER = Object.freeze({ error: 0.02, weights: [1, 1, 0.5, 0.5, 0.5], loose: 0.08, slack: 1.5 });

// A primitive's pictures' places and normals, five numbers to a point (for the simplifier)
function attributesOf(primitive) {
    const [uv, normal] = [primitive.getAttribute("TEXCOORD_0")?.getArray(), primitive.getAttribute("NORMAL")?.getArray()];
    const points = primitive.getAttribute("POSITION").getCount();
    const out = new Float32Array(points * 5);

    for (let p = 0; p < points; p++) {
        out.set([uv?.[p * 2] ?? 0, uv?.[p * 2 + 1] ?? 0, normal?.[p * 3] ?? 0, normal?.[p * 3 + 1] ?? 0, normal?.[p * 3 + 2] ?? 0], p * 5);
    }

    return out;
}

// A primitive keeping only the points its triangles (`kept`, indices into its points) still use,
// each of its attributes cut down to those
function compact(primitive, kept) {
    const remap = new Map();

    for (const p of kept) {
        if (!remap.has(p)) {
            remap.set(p, remap.size);
        }
    }

    for (const semantic of primitive.listSemantics()) {
        const attribute = primitive.getAttribute(semantic);
        const [size, from] = [attribute.getElementSize(), attribute.getArray()];
        const to = new from.constructor(remap.size * size);

        for (const [old, now] of remap) {
            to.set(from.subarray(old * size, old * size + size), now * size);
        }

        // (A copy of its own: another primitive may share the attribute)
        primitive.setAttribute(semantic, attribute.clone().setArray(to));
    }

    const indices = remap.size > 65535 ? new Uint32Array(kept.length) : new Uint16Array(kept.length);

    kept.forEach((p, k) => {
        indices[k] = remap.get(p);
    });
    primitive.setIndices(primitive.getIndices().clone().setArray(indices));
}

// A model's glTF and the files it names (Poly Haven's 1K), the materials that let light through
// made to show it as see-through (glass: KHR_materials_transmission, which isn't read here)
async function readSource({ id }) {
    const files = await listing(id);
    const json = JSON.parse(Buffer.from(await fetchSource({ url: files.url })).toString("utf8"));
    const resources = {};

    for (const [path, { url }] of Object.entries(files.include)) {
        resources[path] = new Uint8Array(await fetchSource({ url }));
    }

    for (const material of json.materials ?? []) {
        if (material.extensions?.KHR_materials_transmission) {
            material.alphaMode = "BLEND";
            material.pbrMetallicRoughness = { ...material.pbrMetallicRoughness, baseColorFactor: [...(material.pbrMetallicRoughness?.baseColorFactor ?? [1, 1, 1, 1]).slice(0, 3), 0.35] };
        }

        delete material.extensions;
    }

    delete json.extensionsUsed;
    delete json.extensionsRequired;

    return { json, resources };
}

// Each mesh node's piece (`pieces`' name, or null: left out), by the nearest of it and its parents
// a piece names
function piecesOf(root, pieces) {
    const named = new Map(Object.entries(pieces ?? {}).flatMap(([piece, nodes]) => nodes.map((node) => [node, piece])));
    const result = new Map();

    for (const node of root.listNodes()) {
        let [at, piece] = [node, null];

        while (at && piece === null) {
            piece = named.get(at.getName()) ?? null;
            at = at.getParentNode();
        }

        result.set(node, pieces ? piece : "");
    }

    return result;
}

// A picture's pixels (a JPEG's or a PNG's: { width, height, data }, four bytes to a pixel)
function pixelsOf(bytes, what) {
    if (bytes[0] === 0x89 && bytes[1] === 0x50) {
        return readPng(bytes);
    }

    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
        throw new Error(`${what}: only JPEG and PNG pictures are read`);
    }

    return jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 1024 });
}

const decode = (texture) => (texture ? pixelsOf(texture.getImage(), texture.getURI()) : null);

// A model that comes as a GLB (`source`: its file, or where it is in an archive): each of its
// scenes' nodes set under one more, standing it up (`up`: "z" if it's made with z up) and making it
// `scale` times as big, or `size` metres at its longest; its own extensions let go of (what's
// needed of its materials is read from what glTF has without them)
async function fromGlb(source, { scale, size, up }) {
    // (Its meshes may be compressed: Draco's, or meshoptimizer's)
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "draco3d.decoder": await draco3d.createDecoderModule(), "meshopt.decoder": MeshoptDecoder });
    const document = await io.readBinary(new Uint8Array(await fetchSource(source)));

    for (const extension of document.getRoot().listExtensionsUsed()) {
        extension.dispose();
    }

    for (const scene of document.getRoot().listScenes()) {
        const stood = document.createNode("stood").setRotation(up === "z" ? [-Math.SQRT1_2, 0, 0, Math.SQRT1_2] : [0, 0, 0, 1]);

        for (const child of scene.listChildren()) {
            stood.addChild(child);
        }

        scene.addChild(stood);

        const { min, max } = getBounds(scene);
        const times = size ? size / Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) : scale;

        stood.setScale([times, times, times]);
    }

    return document;
}

// A model made from its own files (`from`, not Poly Haven's): its mesh (an OBJ or an STL: `mesh`,
// one node by the model's name; or `meshes`, a node by each one's name), made `scale` times as big
// and stood up (`up`: "z" if it's made with z up, not y), and its pictures (`colour`, `normal`, a
// JPEG or PNG each; and `occlusion`, darkening its colour) on one material as rough as `rough`
// says, of the colour `tint` says (a scan's that has no picture: BONE's, if it's a `bone`). With the
// picture standing in for its ARM (Poly Haven's: occlusion, roughness, metal), if it has one.
async function fromFiles(name, { from, scale = 1, size = null, up = "y", rough = 0.8, bone = false, tint = bone ? BONE.map((c) => linear(c / 255)) : [1, 1, 1] }) {
    if (from.glb) {
        const document = await fromGlb(from.glb, { scale, size, up });

        // (A scan without pictures, of a colour of its own: `tint`, and how rough it is; its parts
        // without a material given one, not left white)
        for (const primitive of from.plain ? document.getRoot().listMeshes().flatMap((mesh) => mesh.listPrimitives()) : []) {
            primitive.getMaterial() ?? primitive.setMaterial(document.createMaterial("surface"));
        }

        for (const material of from.plain ? document.getRoot().listMaterials() : []) {
            material.setBaseColorFactor([...tint, 1]).setRoughnessFactor(rough).setMetallicFactor(0);
        }

        return { document, arms: new Map() };
    }

    const document = new Document();
    const buffer = document.createBuffer();
    const scene = document.createScene();
    const material = document.createMaterial("surface").setRoughnessFactor(rough).setMetallicFactor(0).setBaseColorFactor([...tint, 1]);
    const picture = async (source) => {
        const bytes = new Uint8Array(await fetchSource(source));

        return document.createTexture().setImage(bytes).setMimeType(bytes[0] === 0x89 ? "image/png" : "image/jpeg").setURI(source.member ?? source.url);
    };

    if (from.colour) {
        material.setBaseColorTexture(await picture(from.colour));
    }

    if (from.normal) {
        material.setNormalTexture(await picture(from.normal));
    }

    // (y up, as glTF has it: a model made with z up turned over onto its back)
    const stood = up === "z" ? (x, y, z) => [x, z, -y] : (x, y, z) => [x, y, z];

    for (const [node, source] of Object.entries(from.meshes ?? { [name]: from.mesh })) {
        const bytes = await fetchSource(source);
        const read = /\.stl$/i.test(source.member ?? source.url) ? readStl(bytes) : readObj(Buffer.from(bytes).toString("utf8"));
        const [positions, normals] = [new Float32Array(read.positions.length), new Float32Array(read.normals.length)];

        for (let at = 0; at < positions.length; at += 3) {
            positions.set(stood(...read.positions.subarray(at, at + 3)).map((value) => value * scale), at);
            normals.set(stood(...read.normals.subarray(at, at + 3)), at);
        }

        const accessor = (type, array) => document.createAccessor().setType(type).setArray(array).setBuffer(buffer);
        const primitive = document
            .createPrimitive()
            .setMaterial(material)
            .setAttribute("POSITION", accessor("VEC3", positions))
            .setAttribute("NORMAL", accessor("VEC3", normals))
            .setIndices(accessor("SCALAR", positions.length / 3 > 65535 ? read.indices : Uint16Array.from(read.indices)));

        // (An OBJ's pictures' places count up from the picture's foot; glTF's down from its top. A
        // mesh made for another picture than the one it's given has its places squeezed into the
        // part of it that suits it: `within`, [left, foot, right, top] of the picture as the OBJ
        // counts it)
        if (read.uvs) {
            const to = source.within ?? [0, 0, 1, 1];
            const from = [Infinity, Infinity, -Infinity, -Infinity];

            read.uvs.forEach((value, k) => {
                from[k % 2] = Math.min(from[k % 2], value);
                from[2 + (k % 2)] = Math.max(from[2 + (k % 2)], value);
            });

            // (Each place's u and v from where it lies in the mesh's own to where it's put)
            const placed = source.within ? (value, c) => to[c] + ((value - from[c]) / (from[c + 2] - from[c] || 1)) * (to[c + 2] - to[c]) : (value) => value;

            primitive.setAttribute("TEXCOORD_0", accessor("VEC2", read.uvs.map((value, k) => (k % 2 ? 1 - placed(value, 1) : placed(value, 0)))));
        }

        scene.addChild(document.createNode(node).setMesh(document.createMesh(node).addPrimitive(primitive)));
    }

    let arm = null;

    if (from.occlusion) {
        const { width, height, data } = pixelsOf(new Uint8Array(await fetchSource(from.occlusion)), from.occlusion.member ?? from.occlusion.url);

        arm = { width, height, data: new Uint8Array(data.length) };

        for (let p = 0; p < data.length; p += 4) {
            arm.data.set([data[p], 255, 0, 255], p);
        }
    }

    return { document, arms: new Map([[material, arm]]) };
}

/** Make one of PROPS' files (`name`), into `out`: { kept (triangles), bytes }. */
export async function make(name, prop, { out = OUT } = {}) {
    await MeshoptSimplifier.ready;

    const io = new NodeIO();
    const { document, arms } = prop.from ? await fromFiles(name, prop) : { document: await io.readJSON(await readSource(prop)), arms: new Map() };
    const root = document.getRoot();
    const dropped = new Set(prop.drop ?? []);

    // (A scan's lesser levels of detail let go of: only the finest kept)
    for (const node of root.listNodes()) {
        if (/_LOD[1-9]\d*$/.test(node.getName())) {
            node.dispose();
        }
    }

    // What isn't in any of a set's pieces, and the materials left out, let go of
    const piece = piecesOf(root, prop.pieces);

    for (const node of root.listNodes()) {
        if (node.getMesh() && piece.get(node) === null) {
            node.setMesh(null);
        }
    }

    for (const mesh of root.listMeshes()) {
        for (const primitive of mesh.listPrimitives()) {
            if (dropped.has(primitive.getMaterial()?.getName())) {
                mesh.removePrimitive(primitive);
                primitive.dispose();
            }
        }

        if (!mesh.listParents().some((parent) => parent !== root) || mesh.listPrimitives().length === 0) {
            mesh.dispose();
        }
    }

    // Each piece's meshes made simpler, all of them sharing its allowance by how many they have
    const byPiece = new Map();

    for (const node of root.listNodes()) {
        for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
            const key = piece.get(node);

            byPiece.set(key, new Set([...(byPiece.get(key) ?? []), primitive]));
        }
    }

    let kept = 0;

    for (const primitives of byPiece.values()) {
        const total = [...primitives].reduce((sum, primitive) => sum + primitive.getIndices().getCount() / 3, 0);

        for (const primitive of primitives) {
            const indices = primitive.getIndices();
            const count = indices.getCount();
            const target = Math.floor((count / 3) * Math.min(1, prop.triangles / total)) * 3;

            if (target < count) {
                const positions = primitive.getAttribute("POSITION").getArray();
                const simplify = (error, options) => MeshoptSimplifier.simplifyWithAttributes(new Uint32Array(indices.getArray()), new Float32Array(positions), 3, attributesOf(primitive), 5, SIMPLER.weights, null, target, error, options)[0];
                let simpler = simplify(prop.error ?? SIMPLER.error, ["LockBorder"]);

                // (A scan whose mesh is all open edges can't be made simpler with them held where
                // they are: let them move, then let it go further from its shape, till it's near
                // enough what it's let keep)
                for (const error of [prop.error ?? SIMPLER.error, SIMPLER.loose]) {
                    if (simpler.length > target * SIMPLER.slack) {
                        simpler = simplify(error, []);
                    }
                }

                compact(primitive, simpler);
            }

            kept += primitive.getIndices().getCount() / 3;
        }
    }

    // Its pictures: the colour darkened by its occlusion, the normal map (unless it's let go of),
    // a flame's glow made small; how rough and metal it is kept as numbers; the rest let go of
    const done = new Set();

    for (const material of root.listMaterials()) {
        if (!material.listParents().some((parent) => parent !== root)) {
            continue;
        }

        const [colour, normal, occlusion, worn, glow] = [material.getBaseColorTexture(), material.getNormalTexture(), material.getOcclusionTexture(), material.getMetallicRoughnessTexture(), material.getEmissiveTexture()];
        // (Its occlusion, darkening its colour; how rough and metal it is: one picture, Poly
        // Haven's ARM, or a picture of each)
        const a = arms.get(material) ?? decode(occlusion);
        const m = arms.get(material) ?? (worn === occlusion ? a : decode(worn));

        if (m) {
            const { rough, metal } = averages(m);

            material.setRoughnessFactor(material.getRoughnessFactor() * rough).setMetallicFactor(material.getMetallicFactor() * metal);
        } else {
            material.setMetallicFactor(0);
        }

        if (colour && !done.has(colour)) {
            const picture = shrunk(decode(colour), prop.pixels, "colour", a, prop.saturation);

            colour.setImage(new Uint8Array(jpeg.encode(prop.bone ? boned(picture, material, prop.bone === true ? 0.5 : prop.bone) : picture, 82).data)).setMimeType("image/jpeg").setURI(`${name}-${material.getName()}-colour.jpg`);
            done.add(colour);
        }

        if (normal && prop.normals === false) {
            material.setNormalTexture(null);
        } else if (normal && !done.has(normal)) {
            normal.setImage(new Uint8Array(jpeg.encode(shrunk(decode(normal), prop.pixels, "normal"), 86).data)).setMimeType("image/jpeg").setURI(`${name}-${material.getName()}-normal.jpg`);
            done.add(normal);
        }

        if (glow && !done.has(glow)) {
            glow.setImage(new Uint8Array(jpeg.encode(shrunk(decode(glow), 64, "colour"), 82).data)).setMimeType("image/jpeg").setURI(`${name}-${material.getName()}-glow.jpg`);
            done.add(glow);
        }

        material.setOcclusionTexture(null).setMetallicRoughnessTexture(null);
    }

    for (const texture of root.listTextures()) {
        if (!texture.listParents().some((parent) => parent !== root)) {
            texture.dispose();
        }
    }

    for (const accessor of root.listAccessors()) {
        if (!accessor.listParents().some((parent) => parent !== root)) {
            accessor.dispose();
        }
    }

    const glb = await io.writeBinary(document);

    await mkdir(out, { recursive: true });
    await writeFile(new URL(`${name}.glb`, out), glb);

    return { kept, bytes: glb.length };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
    const only = process.argv.slice(2);

    for (const [name, prop] of Object.entries(PROPS)) {
        if (only.length === 0 || only.includes(name)) {
            const { kept, bytes } = await make(name, prop);

            console.log(`${name}: ${Math.round(kept)} triangles, ${Math.round(bytes / 1024)} KB`);
        }
    }

    const catalog = JSON.parse(await readFile(CATALOG, "utf8"));

    // (The catalog's props made again from PROPS: any no longer in it let go of)
    for (const entry of Object.keys(catalog.models)) {
        if (entry.startsWith("dungeon-prop-") && !PROPS[entry.slice("dungeon-prop-".length)]) {
            delete catalog.models[entry];
        }
    }

    for (const [name, { id, by, of, pieces }] of Object.entries(PROPS)) {
        catalog.models[`dungeon-prop-${name}`] = {
            tier: "demand",
            label: `${of[0].toUpperCase()}${of.slice(1)} (${by ?? `Poly Haven ${id}, CC0`})`,
            files: [{ path: `models/dungeons/${name}.glb` }],
            ...(pieces ? { pieces } : {}),
        };
    }

    await writeFile(CATALOG, `${JSON.stringify(catalog, null, 4)}\n`);
    console.log("Now npm run build:manifest");
}
