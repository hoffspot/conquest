// Someone seen through what hides them (the camera study's recommendation 7, as Super Mario
// Sunshine and Odyssey draw Mario behind a wall, and Baldur's Gate 3 its party): where nothing's
// cut away for them (a dungeon's rock, below its cut), the player and whoever they're fighting are
// drawn again over what stands in front of them, in a flat colour (`SILHOUETTE`: the player's
// cool, a foe's the hostile red), half of it let through (a screen door: no transparency, so it's
// drawn in its place among the rest). Each of their meshes has a copy of itself under it, sharing
// its shape, its bones and its face's shapes: drawn after the world and before them (renderOrder),
// only where something nearer hides them (the depth test turned round), and only while they're
// hidden; what of them can be seen drawn over it as ever.
//
// No more than a draw a mesh while it's shown, and none at all while it isn't.

import * as THREE from "three";

/** The colours they're drawn in: the player, and whoever they're fighting. */
export const SILHOUETTE = Object.freeze({ player: 0x9fd2ff, foe: 0xff6a50 });

// Drawn after the world (whose order is 0) and before them, so their own body never shows
// through itself
const BEHIND = 1;
const IN_FRONT = 2;

// Each colour's material: flat, unlit, unfogged, drawn only behind what's nearer, writing no depth,
// half its pixels thrown away in a fine checker
const materials = new Map();

function materialOf(colour) {
    if (!materials.has(colour)) {
        const material = new THREE.MeshBasicMaterial({ color: colour, depthFunc: THREE.GreaterDepth, depthWrite: false, fog: false, toneMapped: false });

        material.name = "silhouette";
        material.onBeforeCompile = (shader) => {
            shader.fragmentShader = shader.fragmentShader.replace("#include <clipping_planes_fragment>", "#include <clipping_planes_fragment>\nif (mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0) < 1.0) discard;");
        };
        material.customProgramCacheKey = () => "silhouette";
        materials.set(colour, material);
    }

    return materials.get(colour);
}

// A mesh's copy, drawn as a silhouette: its shape, its bones and its face's shapes its own
function copyOf(mesh, material) {
    const copy = mesh.isSkinnedMesh ? new THREE.SkinnedMesh(mesh.geometry, material) : new THREE.Mesh(mesh.geometry, material);

    if (mesh.isSkinnedMesh) {
        copy.bindMode = mesh.bindMode;
        copy.bind(mesh.skeleton, mesh.bindMatrix);
    }

    copy.morphTargetInfluences = mesh.morphTargetInfluences;
    copy.morphTargetDictionary = mesh.morphTargetDictionary;
    copy.renderOrder = BEHIND;
    copy.frustumCulled = mesh.frustumCulled;
    copy.castShadow = false;
    copy.receiveShadow = false;
    copy.name = "silhouette";
    copy.userData.silhouetteOf = mesh;
    // (Never picked out, as they're under the player's finger: nothing but what they copy)
    copy.raycast = () => {};

    return copy;
}

/**
 * Draw someone (`object`: their avatar's) as a silhouette through whatever hides them, in a colour
 * (SILHOUETTE's), or not (`on` false). Their meshes' copies made the first time, and again whenever
 * what they're made of changes (gear put on or taken off).
 */
export function showSilhouette(object, on, colour = SILHOUETTE.player) {
    const kept = object.userData.silhouette ?? null;

    if (!on) {
        for (const copy of kept?.copies ?? []) {
            copy.visible = false;
        }

        return;
    }

    const meshes = [];

    object.traverse((node) => {
        if (node.isMesh && !node.userData.silhouetteOf) {
            meshes.push(node);
        }
    });

    const key = meshes.map(({ id }) => id).join(",");

    if (!kept || kept.key !== key || kept.colour !== colour) {
        for (const copy of kept?.copies ?? []) {
            copy.removeFromParent();
        }

        const material = materialOf(colour);
        const copies = meshes.map((mesh) => {
            const copy = copyOf(mesh, material);

            mesh.renderOrder = Math.max(mesh.renderOrder, IN_FRONT);
            mesh.add(copy);

            return copy;
        });

        object.userData.silhouette = { key, colour, copies };
    }

    // (Shown as what they copy is)
    for (const copy of object.userData.silhouette.copies) {
        copy.visible = copy.userData.silhouetteOf.visible;
    }
}
