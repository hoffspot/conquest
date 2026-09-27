// Town and courtyard pieces: props (well, barrels, crates...) made from KayKit's Medieval Hexagon
// models (client/models/kaykit, CC0, by Kay Lousberg), and trees grown for the game (trees.js).
// (The special buildings are the game's own, landmarks.js: KayKit's are toy-like, with doors
// twice a person's height.)

import { Group } from "three";
import { loadModel, placeModel } from "../engine/models.js";
import { treeObject } from "./trees.js";

const KAYKIT = new URL("../../../../models/kaykit/", import.meta.url);
const model = (name) => loadModel(new URL(`${name}.gltf`, KAYKIT).href);

// Each prop: the models in it, where (world pixels in its footprint: 20 to a plot, 5 to a metre),
// how big at its longest (metres) and turned how far. They stand in the middle half of their
// footprint, which is all of it characters can't walk through (core/world.js)
const PROPS = {
    well: [["building_well_blue", 20, 20, 3.4, 0]],
    barrels: [["barrel", 7.5, 8, 0.95, 0], ["barrel", 12.5, 8.5, 0.95, 1], ["barrel", 10, 12.5, 0.95, 2]],
    crates: [["crate_A_big", 8.5, 9, 0.85, 0.3], ["crate_B_small", 12.5, 12, 0.57, 0.9]],
    sacks: [["sack", 8, 9, 0.8, 0.4], ["sack", 12, 8.5, 0.8, 1.8], ["sack", 10, 12, 0.8, 0.1]],
    cart: [["wheelbarrow", 10, 10, 1.6, 0.7]],
    lumber: [["resource_lumber", 20, 10, 3.2, 0]],
    stones: [["resource_stone", 10, 10, 1.6, 0.5]],
    weaponrack: [["weaponrack", 10, 10, 1.7, 0]],
    target: [["target", 10, 10, 1.6, 0]],
    tent: [["tent", 20, 20, 3, 0.4]],
};

const METRE = 5;

/** A small prop, or a cluster of them. */
export async function prop({ name, w, h }) {
    const group = new Group();

    for (const [file, x, z, metres, turn] of PROPS[name]) {
        group.add(placeModel(await model(file), { w, h }, { size: metres * METRE, turn, at: [x, z] }));
    }

    return group;
}

// Trees: grown for the game (trees.js), each variant a kind of tree grown one way, turned
// about its trunk as it stands

/** One of the trees (a VARIANTS index of trees.js), its trunk in the middle of its square. */
export async function tree({ variant }) {
    const holder = new Group();
    const object = treeObject(variant);

    object.rotation.y = ((variant * 2.39996) % (Math.PI * 2));
    holder.add(object);
    holder.scale.setScalar(METRE);
    holder.position.set(10, 0, 10);

    return holder;
}
