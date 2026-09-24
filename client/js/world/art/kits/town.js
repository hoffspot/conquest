// Town and courtyard pieces made from KayKit's Medieval Hexagon models (tools/artgen/models/kaykit,
// CC0, by Kay Lousberg): the special buildings (tavern, church, blacksmith, market, windmill),
// props (well, barrels, crates...) and trees.

import { Color, Group } from "three";
import { loadModel, placeModel } from "../engine/models.js";

const KAYKIT = new URL("../../../../models/kaykit/", import.meta.url);
const model = (name) => loadModel(new URL(`${name}.gltf`, KAYKIT).href);

// World pixels per KayKit unit for buildings (so their sizes stay in proportion to each other)
const BUILDING_UNIT = 45;

const LANDMARKS = {
    tavern: { model: "building_tavern_red" },
    church: { model: "building_church_blue", unit: 52 },
    blacksmith: { model: "building_blacksmith_yellow" },
    market: { model: "building_market_red" },
    windmill: { model: "building_windmill_yellow", unit: 50 },
};

/** A town's special building, filling its footprint. */
export async function landmark({ name, w, h }) {
    const { model: file, unit = BUILDING_UNIT } = LANDMARKS[name];

    return placeModel(await model(file), { w, h }, { unit });
}

// Each prop: the models in it, where (world pixels in its footprint), how big and turned how far
const PROPS = {
    well: [["building_well_blue", 20, 20, 48, 0]],
    barrels: [["barrel", 6, 7, 55, 0], ["barrel", 14, 8, 55, 1], ["barrel", 10, 14, 55, 2]],
    crates: [["crate_A_big", 8, 8, 55, 0.3], ["crate_B_small", 14, 14, 55, 0.9]],
    sacks: [["sack", 6, 8, 70, 0.4], ["sack", 13, 7, 70, 1.8], ["sack", 10, 13, 70, 0.1]],
    cart: [["wheelbarrow", 10, 10, 48, 0.7]],
    lumber: [["resource_lumber", 20, 10, 50, 0]],
    stones: [["resource_stone", 10, 10, 42, 0.5]],
    weaponrack: [["weaponrack", 10, 10, 60, 0]],
    target: [["target", 10, 10, 60, 0]],
    tent: [["tent", 20, 20, 70, 0.4]],
};

/** A small prop, or a cluster of them. */
export async function prop({ name, w, h }) {
    const group = new Group();

    for (const [file, x, z, unit, turn] of PROPS[name]) {
        group.add(placeModel(await model(file), { w, h }, { unit, turn, at: [x, z] }));
    }

    return group;
}

// Trees: two KayKit trees at different sizes and turns
const TREES = [
    ["tree_single_A", 36, 0],
    ["tree_single_B", 30, 1.2],
    ["tree_single_A", 30, 2.5],
    ["tree_single_B", 36, 4],
    ["tree_single_A", 42, 5.1],
    ["tree_single_B", 40, 0.6],
];

// KayKit's leaves are blue-green; tint them towards the yellower green of the map's grass
const LEAVES = new Color(1.2, 1.02, 0.55);

/** One of the trees, standing in the middle of its square. */
export async function tree({ variant }) {
    const [file, unit, turn] = TREES[variant % TREES.length];
    const object = await model(file);

    object.traverse((node) => {
        if (node.isMesh) {
            node.material = node.material.clone();
            node.material.color.multiply(LEAVES);
        }
    });

    return placeModel(object, { w: 1, h: 1 }, { unit, turn });
}
