// The shadow maps drawn with only what they need (the terrain plan's M7k: the whole frame measured
// on the phone's profile). Two kinds of waste, found measuring:
// - A lamp's shadows (a cube: six maps, one each way from its flame, out to its reach) drew every
//   merged mesh its reach touched whole, six times: a chunk's buildings, merged into one mesh
//   (town3d.js joined), for one building by the lamp. In an elven town, about a million triangles
//   a lamp each time it's drawn again. Now a merged mesh keeps where each building's corners are in
//   it (`runs`: town3d.js joined, from partsOf's buildings), and a lamp's shadows, and the sun's,
//   draw only the runs of those in their view (as a few draws of its parts at most: SHADOW_PASSES
//   `gap`), or none.
// - The sun's shadows (a box round the player, drawn every frame) drew everyone in it: characters
//   and creatures out of the camera's view whose shadows can't fall where it looks, 40,000 to
//   80,000 triangles each. Now something small (SHADOW_PASSES `small`) is drawn into them only if
//   its shadow may be seen: the camera's view (this frame's: setShadowView) reaching where its
//   shadow lies, from it as far down the sun's light as it could fall.
// Neither changes a shadow that's seen: what's left out lies outside a shadow map's view, or casts
// where the camera doesn't look.
//
// three.js asks each mesh whether it's in a shadow camera's view (Mesh.intersectsFrustum, with that
// light's own frustum), which is where this is answered; the frustums known are the lights' that
// watchShadows was given.

import * as THREE from "three";

/**
 * `gap`: corners between two runs in view drawn anyway, to draw them as one (fewer draws); `loose`:
 * how far across (metres) a run of what's in no building can grow (a yard's things, in a row);
 * `small`: how big (its bounding sphere's radius, metres) something can be and be left out of the
 * sun's shadows when its shadow can't be seen; `fall`: how far down the sun's light (metres) a
 * shadow can fall at most, from something `small` (`over`: metres taken for the ground being below
 * it).
 */
export const SHADOW_PASSES = Object.freeze({ gap: 1500, loose: 16, small: 6, fall: 40, over: 2 });

// The shadow frustums watched: { kind: "lamp" | "sun" }
const passes = new WeakMap();

// What the camera sees this frame, and the way the sun's light goes (setShadowView)
const seen = { frustum: new THREE.Frustum(), down: new THREE.Vector3(0, -1, 0), set: false };

const _sphere = new THREE.Sphere();
const _matrix = new THREE.Matrix4();
const base = THREE.Mesh.prototype.intersectsFrustum;

/**
 * Shadow maps drawn with only what they need, for the sun and the lamps (point lights) given: what
 * three.js draws into each asked through Mesh.intersectsFrustum (done once; then for each light).
 */
export function watchShadows({ sun = null, lamps = [] }) {
    if (THREE.Mesh.prototype.intersectsFrustum !== inView) {
        THREE.Mesh.prototype.intersectsFrustum = inView;
    }

    if (sun) {
        passes.set(sun.shadow.getFrustum(0), { kind: "sun" });
    }

    for (const lamp of lamps) {
        passes.set(lamp.shadow.getFrustum(0), { kind: "lamp" });
    }
}

/**
 * What the camera sees this frame (its matrices up to date) and the way the sun's light travels
 * (`down`, a unit vector, from the sun to the ground), before it's drawn; or (`camera` null) none,
 * everything that's in the sun's shadows' view drawn into them.
 */
export function setShadowView(camera, down) {
    seen.set = Boolean(camera);

    if (camera) {
        seen.frustum.setFromProjectionMatrix(_matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse), camera.coordinateSystem);
        seen.down.copy(down).normalize();
    }
}

/**
 * Where each of what was merged into a geometry lies in it: `parts` [{ geometry, key }] in the
 * order merged (what's merged in a row with the same key, as one; with none, null, as one while
 * it's `loose` across): [{ start, count (indices if it's indexed, else corners), sphere (round them
 * all, as merged) }], or null if all are one.
 */
export function runsOf(parts) {
    const runs = [];
    const _box = new THREE.Box3();
    const _size = new THREE.Vector3();
    let at = 0;

    for (const { geometry, key } of parts) {
        const count = geometry.index ? geometry.index.count : geometry.attributes.position.count;

        if (!geometry.boundingBox) {
            geometry.computeBoundingBox();
        }

        const last = runs.at(-1);
        const joins = last && last.key === key && (key !== null || _box.copy(last.box).union(geometry.boundingBox).getSize(_size).length() <= SHADOW_PASSES.loose);

        if (joins) {
            last.count += count;
            last.box.union(geometry.boundingBox);
        } else {
            runs.push({ key, start: at, count, box: geometry.boundingBox.clone() });
        }

        at += count;
    }

    if (runs.length < 2) {
        return null;
    }

    return runs.map(({ start, count, box }) => ({ start, count, sphere: box.getBoundingSphere(new THREE.Sphere()) }));
}

/** Draw only the runs (runsOf's) of a mesh in a watched shadow map's view into it. */
export function castByRuns(mesh, runs) {
    if (!runs || Array.isArray(mesh.material)) {
        return mesh;
    }

    mesh.userData.runs = runs;
    mesh.onAfterShadow = afterShadow;

    return mesh;
}

// (Mesh.intersectsFrustum: as three.js has it; then, for a watched shadow map, the runs in its
// view, or whether a small thing's shadow may be seen)
function inView(frustum) {
    restore(this);

    if (!base.call(this, frustum)) {
        return false;
    }

    const pass = passes.get(frustum);

    if (!pass) {
        return true;
    }

    if (this.userData.runs) {
        return byRuns(this, frustum);
    }

    return pass.kind !== "sun" || !seen.set || shadowSeen(this);
}

// Whether something's shadow may fall where the camera looks: round it and as far down the sun's
// light as its shadow could fall (from its top to the ground under it, as low as the sun is)
function shadowSeen(mesh) {
    worldSphere(mesh, _sphere);

    if (_sphere.radius > SHADOW_PASSES.small) {
        return true;
    }

    const steep = Math.max(0.1, -seen.down.y);
    const fall = Math.min(SHADOW_PASSES.fall, (2 * _sphere.radius + SHADOW_PASSES.over) / steep);

    _sphere.center.addScaledVector(seen.down, fall / 2);
    _sphere.radius += fall / 2;

    return seen.frustum.intersectsSphere(_sphere);
}

// The runs of a merged mesh in a shadow map's view: none (false), all (true), or some, drawn as
// its parts (the mesh drawn by groups, its material as a list of one, as it is again afterwards)
function byRuns(mesh, frustum) {
    const runs = mesh.userData.runs;
    const spans = [];
    let shown = 0;

    for (const run of runs) {
        _sphere.copy(run.sphere).applyMatrix4(mesh.matrixWorld);

        if (!frustum.intersectsSphere(_sphere)) {
            continue;
        }

        shown++;

        const last = spans.at(-1);

        if (last && run.start - (last.start + last.count) <= SHADOW_PASSES.gap) {
            last.count = run.start + run.count - last.start;
        } else {
            spans.push({ start: run.start, count: run.count, materialIndex: 0 });
        }
    }

    if (!shown) {
        return false;
    }

    if (shown === runs.length || !mesh.material.visible) {
        return true;
    }

    mesh.userData.drawn = mesh.material;
    mesh.userData.groups = mesh.geometry.groups;
    mesh.geometry.groups = spans;
    mesh.material = [mesh.material];

    return true;
}

// (After the last of its parts is drawn into a shadow map, the mesh as it was)
function afterShadow(renderer, scene, camera, shadowCamera, geometry, depthMaterial, group) {
    if (!group || group === geometry.groups.at(-1)) {
        restore(this);
    }
}

function restore(mesh) {
    if (mesh.userData.drawn) {
        mesh.material = mesh.userData.drawn;
        mesh.geometry.groups = mesh.userData.groups;
        mesh.userData.drawn = null;
        mesh.userData.groups = null;
    }
}

// A mesh's bounding sphere in the world, as three.js's Frustum.intersectsObject has it
function worldSphere(mesh, target) {
    if (mesh.boundingSphere !== undefined) {
        if (mesh.boundingSphere === null) {
            mesh.computeBoundingSphere();
        }

        return target.copy(mesh.boundingSphere).applyMatrix4(mesh.matrixWorld);
    }

    if (!mesh.geometry.boundingSphere) {
        mesh.geometry.computeBoundingSphere();
    }

    return target.copy(mesh.geometry.boundingSphere).applyMatrix4(mesh.matrixWorld);
}
