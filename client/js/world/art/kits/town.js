// A town's trees, grown for the game (trees.js). (Its props are the game's own too: props.js.)

import { Group } from "three";
import { treeObject } from "./trees.js";

const METRE = 5;

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
