// A fixed scene's map drawn (core/scenery.js: Bellhaven's castle, its crag, chasm and bridge), as the
// castle lab measured it (lab/castle-lab.js): the scene's own art, its licensed model, cut into
// cells by the model pipeline (`<mesh>@<i>,<j>`, each its details, the nearest first), each cell
// drawn at its detail by how far it is from the camera; further off, blocks of cells merged into a
// mesh a material, a few draw calls for what's far; its shadows cast by a stand-in for each block
// (its far detail, one mesh of every material at once, on the layer only the sun's shadow sees).
// Without the art (a build without the licensed models, or before it's read), the walk is drawn
// instead, a block a square at its floor's height. Drawn out of doors: under the sky, in the sun,
// the fog the world's.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { forgetScenery, readyScenery, sceneryOf } from "../beasts/model.js";
import { SCENERY } from "../core/scenery.js";
import { floorAt } from "../core/walk.js";
import { SHADOWS_ONLY } from "./shadows.js";

/**
 * Which detail each cell's drawn at by how far its nearest point is from the camera (metres): the
 * nearest within `near`, the next beyond. Further off, blocks of cells `block` a side, each merged
 * into a mesh a material, drawn while none of their cells is near; and none drawn at all beyond
 * `far`, past the fog's far edge (view.js OUTDOORS: 130 m), where they'd be the sky's colour. In
 * the game at its bridge's foot, where the ground under the crag and its stairs are all near, the
 * castle drew 214 draw calls with blocks of 3 by 3 and its nearest detail out to 45 m.
 */
export const SCENERY_DETAIL = Object.freeze({ near: 35, block: 2, far: 140 });

// A cell's node, or one of its lower details' ("<cell>lod1": Three.js takes the dot out)
const CELL = /^(.*@-?\d+,-?\d+)(?:\.?lod\d+)?$/;

/**
 * A scene's cells, read from its art's nodes (those at the top of its scene, named for their
 * cells, `userData.lod` saying which detail each is): { name, at: [i, j], levels (nearest
 * first), box (round its nearest), shown (the detail drawn, -1 for none) }.
 */
export function cellsOf(root) {
    const byCell = new Map();

    root.updateMatrixWorld(true);

    for (const node of root.children) {
        const match = CELL.exec(node.name);

        if (match) {
            byCell.set(match[1], [...(byCell.get(match[1]) ?? []), [node.userData.lod ?? 0, node]]);
        }
    }

    return [...byCell.entries()].map(([name, levels]) => {
        const sorted = levels.sort((a, b) => a[0] - b[0]).map(([, node]) => node);

        for (const node of sorted) {
            node.traverse((part) => {
                if (part.isMesh) {
                    part.castShadow = false;
                    part.receiveShadow = true;
                }
            });
        }

        const [, i, j] = /@(-?\d+),(-?\d+)$/.exec(name).map(Number);

        return { name, at: [i, j], levels: sorted, box: new THREE.Box3().setFromObject(sorted[0]), shown: -1 };
    });
}

// Which block a cell's in
const blockOf = ({ at }) => at.map((value) => Math.floor(value / SCENERY_DETAIL.block)).join(",");

/**
 * Blocks of cells, each its cells' lowest detail merged into a mesh a material (and, for its
 * shadow, into one mesh of every material, on the layer only the sun's shadow sees): { cells,
 * group (hidden till it's wanted), shadow }.
 */
export function blocksOf(cells, parent) {
    const byBlock = new Map();
    const caster = new THREE.MeshBasicMaterial({ colorWrite: false });

    for (const cell of cells) {
        byBlock.set(blockOf(cell), [...(byBlock.get(blockOf(cell)) ?? []), cell]);
    }

    return [...byBlock.values()].map((members) => {
        const byMaterial = new Map();
        const shapes = [];

        for (const cell of members) {
            cell.levels.at(-1).traverse((part) => {
                if (!part.isMesh) {
                    return;
                }

                // (Only geometry with the same attributes merges)
                const key = `${part.material.uuid} ${Object.keys(part.geometry.attributes).sort().join(" ")}`;
                const shape = new THREE.BufferGeometry().setAttribute("position", part.geometry.attributes.position.clone());

                shape.setIndex(part.geometry.index?.clone() ?? null);
                shapes.push(shape.applyMatrix4(part.matrixWorld));
                byMaterial.set(key, { material: part.material, geometries: [...(byMaterial.get(key)?.geometries ?? []), part.geometry.clone().applyMatrix4(part.matrixWorld)] });
            });
        }

        const group = new THREE.Group();

        for (const { material, geometries } of byMaterial.values()) {
            const merged = mergeGeometries(geometries, false);

            geometries.forEach((geometry) => geometry.dispose());

            if (merged) {
                const mesh = new THREE.Mesh(merged, material);

                mesh.receiveShadow = true;
                group.add(mesh);
            }
        }

        const outline = mergeGeometries(shapes, false);
        const shadow = outline ? new THREE.Mesh(outline, caster) : null;

        shapes.forEach((shape) => shape.dispose());

        if (shadow) {
            shadow.castShadow = true;
            shadow.layers.set(SHADOWS_ONLY);
            parent.add(shadow);
        }

        group.visible = false;
        parent.add(group);

        return { cells: members, group, shadow, box: members.reduce((box, { box: cell }) => box.union(cell), new THREE.Box3()) };
    });
}

/** Without the art: the walk, a block a square at its floor's height, shaded by how high it is. */
export function walkStandIn(walk) {
    const level = walk.levels[0];
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92 });
    const blocks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.4, 1), material, level.squares);
    const [low, high] = [level.low, Math.max(level.high, level.low + 1)];
    const [matrix, colour, stone, deep] = [new THREE.Matrix4(), new THREE.Color(), new THREE.Color(0xd8d2c4), new THREE.Color(0x8c8a84)];
    let n = 0;

    for (let z = level.box[1]; z <= level.box[3]; z++) {
        for (let x = level.box[0]; x <= level.box[2]; x++) {
            const floor = floorAt(walk, 0, x, z);

            if (floor !== null) {
                blocks.setMatrixAt(n, matrix.makeTranslation(x + 0.5, floor - 0.2, z + 0.5));
                blocks.setColorAt(n++, colour.copy(deep).lerp(stone, (floor - low) / (high - low)));
            }
        }
    }

    blocks.receiveShadow = true;
    blocks.castShadow = true;

    return blocks;
}

/**
 * A scene's map's inside (as interiors3d.js buildingInterior's, for app/game.js: `outdoors`, so
 * it's lit as the world is and the world's hidden), a step at a time: its art, if it's been read
 * (beasts/model.js readyScenery), else its walk; the art put in once it's read, and let go of
 * once its map's left (leave), what it holds a castle's worth of memory.
 */
export function* sceneryInterior(map) {
    const asset = SCENERY[map.scenery].model;
    const object = new THREE.Group();
    // (The scene's own metres, as its art's laid out, from the map's corner: its walk's origin)
    const scene = new THREE.Group();
    const near = new THREE.Vector3();
    let drawn = null;
    // (Its art asked for, once its map's shown, if it wasn't got ready at its way in: someone
    // brought in by their party, or a game carried on in it)
    let asked = null;

    object.position.set(map.origin[0], 0, map.origin[1]);
    scene.position.set(map.offset[0], 0, map.offset[1]);
    object.add(scene);

    // The walk drawn, a block a square (the walk's squares are the map's)
    const standIn = () => {
        const blocks = walkStandIn(map.walk);

        object.add(blocks);

        return { art: false, cells: [], blocks: [], dispose: () => (blocks.removeFromParent(), blocks.geometry.dispose(), blocks.material.dispose(), blocks.dispose()) };
    };

    // The art drawn: its cells, its far blocks and their shadows (each worked out in the scene's
    // own metres, before it's put in its place)
    const art = (gltf) => {
        const root = gltf.scene;

        root.removeFromParent();

        const cells = cellsOf(root);
        const blocks = blocksOf(cells, scene);

        scene.add(root);

        return {
            art: true,
            cells,
            blocks,
            dispose() {
                for (const { group, shadow } of blocks) {
                    group.removeFromParent();
                    group.traverse((node) => node.isMesh && node.geometry.dispose());
                    shadow?.removeFromParent();
                    shadow?.geometry.dispose();
                }

                blocks[0]?.shadow?.material.dispose();
                root.removeFromParent();

                // (The art's own: its meshes and its textures, given back to the graphics card)
                root.traverse((node) => {
                    if (node.isMesh) {
                        node.geometry.dispose();

                        for (const material of [node.material].flat()) {
                            for (const texture of Object.values(material).filter((value) => value?.isTexture)) {
                                texture.dispose();
                            }

                            material.dispose();
                        }
                    }
                });
                forgetScenery(asset);
            },
        };
    };

    const gltf = sceneryOf(asset);

    yield;
    drawn = gltf ? art(gltf) : standIn();
    yield;

    // Each cell at its detail: a block with none near drawn whole, its cells not; one with a cell
    // near, cell by cell, each near one at its nearest, the rest at their next
    const showCell = (cell, level) => {
        if (level !== cell.shown) {
            cell.levels.forEach((node, k) => (node.visible = k === level));
            cell.shown = level;
        }
    };

    return {
        map,
        object,
        outdoors: true,
        lights: [],
        daylight: null,
        air: null,
        carried: null,
        motes: null,
        trickles: false,
        open: true,
        ceiling: Infinity,
        roof: () => null,
        props: [],
        hearth: null,
        heart: null,
        forge: null,
        /** Whether its art's drawn (not its walk). */
        get art() {
            return drawn?.art ?? false;
        },
        /** How many of its cells are drawn, and how many of its far blocks (the art's). */
        drawn() {
            return { cells: drawn?.cells.filter(({ shown }) => shown >= 0).length ?? 0, blocks: drawn?.blocks.filter(({ group }) => group.visible).length ?? 0 };
        },
        /** Shown: its art asked for if it isn't read, and put in its walk's place once it is. */
        update() {
            if (!drawn || drawn.art) {
                return;
            }

            if (sceneryOf(asset)) {
                drawn.dispose();
                drawn = art(sceneryOf(asset));
                asked = null;
            } else {
                asked ??= readyScenery(asset) ?? false;
            }
        },
        seenFrom(camera) {
            if (!drawn?.art) {
                return;
            }

            // (The camera in the scene's own metres)
            near.set(camera.x - object.position.x - scene.position.x, camera.y - object.position.y - scene.position.y, camera.z - object.position.z - scene.position.z);

            const isNear = (cell) => cell.box.distanceToPoint(near) < SCENERY_DETAIL.near;

            for (const block of drawn.blocks) {
                const gone = block.box.distanceToPoint(near) > SCENERY_DETAIL.far;
                const whole = !gone && !block.cells.some(isNear);

                block.group.visible = whole;

                for (const cell of block.cells) {
                    showCell(cell, gone || whole ? -1 : Math.min(isNear(cell) ? 0 : 1, cell.levels.length - 1));
                }
            }
        },
        drive() {},
        /** Its map's been left: its art let go of (read again when it's next gone into), its walk drawn meanwhile. */
        leave() {
            asked?.calm?.();
            asked = null;

            if (drawn?.art) {
                drawn.dispose();
                drawn = standIn();
            }
        },
        dispose() {
            drawn?.dispose();
            drawn = null;
            object.removeFromParent();
        },
    };
}
