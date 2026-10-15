// A creature drawn from a model (a glTF in the catalog, built by utilities/blenderpipeline), in
// place of the one built in code that stands in for it until the model's read: the asset
// streaming plan's A3 (generated/asset_streaming_plan.md §11.2). A body as BeastAvatar takes one
// (its `plan`): the model's clips posed each frame from what the game asks of a body (poseOf:
// walking, attacking, flinching, resting, flying, dying), its detail packed into it (one level
// shown at a time: showLevel), its shadow cast by its least detailed one only (drawn unseen when
// it isn't the one shown), and its fire breathed from its mouth (beasts/breath.js).

import * as THREE from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { ASSETS } from "../app/assets.js";
import { hashed } from "../app/catalog.js";
import { loadGltf } from "../world/art/engine/models.js";
import { Breath } from "./breath.js";

/**
 * The creatures drawn from a model, by their LOOKS id (which stands in for one until it's read):
 * the catalog's entry (`asset`); how long it's drawn (metres) and how long and tall it's made;
 * which of its clips are what (`clips`: `hover`, hanging in the air, battle.js #hover), and its
 * ways of attacking (`attacks`, the special ones `specials`, as named: weapons.js `animation`; up
 * in the air, `aloft`'s in their place) and resting (`rests`), each a clip; when in a clip it
 * breathes fire (`fire`, by clip: seconds into it); its joints for the game's (`joints`:
 * beast.js BONES' names, by the model's bones' names as the glTF loader gives them); and how fast
 * (metres a second, as it's drawn) it goes when its walk plays at its own pace (`pace`).
 */
export const MODELS = Object.freeze({
    dreadthorn: Object.freeze({
        asset: "beast-dreadthorn",
        length: 17,
        made: Object.freeze({ long: 10, tall: 2.27 }),
        clips: Object.freeze({ idle: "Idling", walk: "Crawling", fly: "Flying", glide: "Gliding", hover: "Hovering", react: "Hit React", dead: "Death" }),
        attacks: Object.freeze({ bite: "Bite", claw: "Claw", tailSweep: "Tail Sweep" }),
        specials: Object.freeze({ breath: "Fire Breath" }),
        aloft: Object.freeze({ breath: "Hover Breath" }),
        rests: Object.freeze({ roar: "Roar" }),
        fire: Object.freeze({ "Fire Breath": [1.0, 2.8], "Hover Breath": [1.0, 2.8] }),
        joints: Object.freeze({ torso: "Spine002", body: "Hip", head: "Head", mouth: "lipjaw", left: "Wing_L" }),
        mouth: Object.freeze({ upper: "lip", lower: "lipjaw", hinge: "Jaw" }),
        pace: 3.2,
        // (How much of a flinch's clip a flinch plays, seconds: its first start)
        flinch: 0.8,
    }),
});

// The models read, those asked for, and those still being fetched, by kind
const read = new Map();
const asked = new Map();
const fetching = new Set();

// How long (milliseconds) before a model that couldn't be read (offline, say) is asked for again
const RETRY = 60000;

// What fetches the catalog's files, once the game's said (fetchModelsWith); till then (a test, the
// labs) they're read straight from where they are
let fetcher = null;

/**
 * Fetch the models through the game's downloader (app/fetcher.js: in the background, out of the
 * way of play, kept once fetched, and only what's wanted now while saving data).
 */
export function fetchModelsWith(downloader) {
    fetcher = downloader;
}

// A model fetched (a Blob) read
async function readBlob(blob) {
    const url = URL.createObjectURL(blob);

    try {
        return await loadGltf(url);
    } finally {
        URL.revokeObjectURL(url);
    }
}

/** Whether a kind's drawn from a model (MODELS) that the catalog has. */
export function hasModel(id) {
    return Boolean(MODELS[id] && ASSETS.models[MODELS[id].asset]?.files?.length);
}

/** A kind's model, if it's been read ({ scene, animations }); or null (its stand-in's drawn). */
export function modelOf(id) {
    return read.get(id) ?? null;
}

/**
 * Ask for a kind's model to be read, once, as wanted as `priority` (the downloader's: "now" for
 * one coming into the battle, "soon" for one near; while saving data, only "now" is fetched): a
 * promise of it, or null if it isn't to be had (yet: asked for again it may be; one that couldn't
 * be read, a while after: RETRY); or null if it has none, or there's no page to read it from (a
 * test).
 */
export function wantModel(id, priority = "soon") {
    const page = globalThis.document?.baseURI ?? globalThis.location?.href;

    if (!hasModel(id) || !page) {
        return null;
    }

    const file = ASSETS.models[MODELS[id].asset].files[0];

    // (Wanted sooner than it was: fetched sooner)
    if (asked.has(id)) {
        if (fetching.has(id)) {
            fetcher.want(file, priority);
        }

        return asked.get(id);
    }

    let reading;

    if (fetcher) {
        fetching.add(id);
        reading = fetcher.want(file, priority).finally(() => fetching.delete(id)).then((blob) => blob && readBlob(blob));
    } else {
        reading = loadGltf(new URL(hashed(file.path, file.hash), page).href);
    }

    asked.set(
        id,
        reading.then(
            (gltf) => {
                if (gltf) {
                    read.set(id, gltf);
                } else {
                    // (Not fetched, while saving data: asked for again when it's wanted now)
                    asked.delete(id);
                }

                return gltf;
            },
            (error) => {
                // (Its stand-in drawn meanwhile)
                setTimeout(() => asked.delete(id), RETRY);
                console.warn(`Couldn't read ${id}'s model`, error);

                return null;
            },
        ),
    );

    return asked.get(id);
}

/** Lets a model be used as read (a test's, or the labs'), as if wantModel had read it. */
export function useModel(id, gltf) {
    read.set(id, gltf);
}

/**
 * Which kinds' models to ask for (wantModel), by where the player is (`at`: [x, z], metres) and
 * the great lairs (`lairs`: [{ at, beast }], as game.js #lairsAloft lists them, slain or not):
 * those whose lair's within `within` metres. A pure function: the game asks every so often.
 */
export function modelsNear(at, lairs, within = 1500) {
    return [...new Set(lairs.filter((lair) => MODELS[lair.beast] && Math.hypot(lair.at[0] - at[0], lair.at[1] - at[1]) < within).map(({ beast }) => beast))];
}

const smoothstep = (u) => {
    const v = Math.min(1, Math.max(0, u));

    return v * v * (3 - 2 * v);
};

/** The clip an attack's way (`style`) plays: up in the air (`aloft`), its way there's, if it has one. */
export function clipOf(model, style, aloft = false) {
    return (aloft && model.aloft?.[style]) || model.attacks[style] || model.specials[style] || null;
}

/**
 * How a model's clips are posed for what the game asks of a body (BeastAvatar's plan.pose: its
 * `speed`, `attack`, `rest`, `react`, `dead`, `fly` (hanging in the air, `hover`: its hover clip);
 * `t`, the beast's own clock, seconds): each
 * clip (by name) with its weight (all of them adding up to 1) and how far in it is (seconds).
 * `lengths`: each clip's length (seconds); `died`: how long it's been dead (seconds: its fall
 * plays at its own pace, longer than the game's). A pure function.
 */
export function poseOf(model, { speed = 0, attack = null, rest = null, react = null, dead = null, fly = null, t = 0 }, { lengths, died = 0 }) {
    const { clips } = model;
    const at = (clip, seconds) => {
        const length = lengths[clip] || 1;

        return Math.min(length - 1e-4, Math.max(0, seconds));
    };
    const loop = (clip, seconds) => {
        const length = lengths[clip] || 1;

        return ((seconds % length) + length) % length;
    };

    // (Dead: its fall, held at its end)
    if (dead) {
        return [{ clip: clips.dead, weight: 1, time: at(clips.dead, died) }];
    }

    // On the ground: standing, or walking as fast as it goes (its walk's pace)
    const walking = smoothstep(speed / (model.pace * 0.35));
    const rate = Math.max(0.5, Math.min(2, speed / model.pace));
    let posed = [
        { clip: clips.idle, weight: 1 - walking, time: loop(clips.idle, t) },
        { clip: clips.walk, weight: walking, time: loop(clips.walk, t * rate) },
    ];
    const over = (clip, weight, time) => {
        posed = posed.map((one) => ({ ...one, weight: one.weight * (1 - weight) })).concat([{ clip, weight, time }]);
    };

    // In the air: beating its wings or gliding, as hard as it beats them; or hanging there
    const hovering = Boolean(fly?.hover && clips.hover);

    if (fly?.amount > 0) {
        const beat = Math.min(1, Math.max(0, fly.beat ?? 0.5));
        const beating = { clip: clips.fly, weight: fly.amount * beat, time: loop(clips.fly, t) };
        const gliding = { clip: clips.glide, weight: fly.amount * (1 - beat), time: loop(clips.glide, t) };
        const hanging = { clip: clips.hover, weight: fly.amount, time: loop(clips.hover, t) };

        posed = posed.map((one) => ({ ...one, weight: one.weight * (1 - fly.amount) })).concat(hovering ? [hanging] : [beating, gliding]);
    }

    // Resting its way (a roar), eased in and out
    if (rest && model.rests[rest.name]) {
        over(model.rests[rest.name], rest.w, loop(model.rests[rest.name], rest.t));
    }

    // Attacking: the clip for its way, through to its end, eased in and out at either end
    const way = attack && clipOf(model, attack.style, hovering);

    if (way) {
        const u = Math.min(1, Math.max(0, attack.u));

        over(way, smoothstep(Math.min(u / 0.06, (1 - u) / 0.06)), at(way, u * (lengths[way] || 1)));
    }

    // Struck: the start of its flinch, eased in and out
    if (react) {
        const u = Math.min(1, Math.max(0, react.u));

        over(clips.react, Math.sin(Math.PI * u) * 0.85, at(clips.react, u * model.flinch));
    }

    return posed.filter(({ weight }) => weight > 1e-4);
}

/**
 * Whether a breath's fire is out at this moment of an attack (BeastAvatar's attack: { style, u }),
 * and so how far through its clip (`lengths`: each clip's length, seconds; `aloft`: hanging in
 * the air, its clip there's).
 */
export function breathing(model, attack, lengths, aloft = false) {
    const clip = attack && clipOf(model, attack.style, aloft);
    const window = clip && model.fire[clip];

    if (!window) {
        return false;
    }

    const seconds = attack.u * (lengths[clip] || 1);

    return seconds >= window[0] && seconds <= window[1];
}

/**
 * A body (BeastAvatar's plan) made from a kind's model as read (`gltf`), at the size BeastAvatar
 * scales it by (`scale`: drawn at MODELS' `length` all the same). `groundAt(x, z)`: the ground's
 * height, for its fire to spread along.
 */
export function modelBody(id, gltf, { scale = 1, groundAt = () => 0 } = {}) {
    const model = MODELS[id];
    const scene = clone(gltf.scene);
    const inner = new THREE.Group();
    const size = model.length / model.made.long / scale;
    const levels = [];
    let material = null;

    inner.scale.setScalar(size);
    inner.add(scene);

    // Its meshes: one level of detail each (the pipeline's packed lower details: extras.lod),
    // sharing one material of its own (flushed red when it's struck)
    scene.traverse((node) => {
        if (!node.isSkinnedMesh) {
            return;
        }

        material ??= node.material.clone();
        node.material = material;
        levels[node.userData.lod ?? 0] = node;
        node.castShadow = false;
        node.receiveShadow = true;
    });

    // (Its shadow from its least detailed level only: there all the time, casting it; not its own
    // level shown, drawn leaving nothing on the screen. A layer of its own won't do: three.js casts
    // only what the camera that's drawing sees)
    const shadow = levels.at(-1);
    const unseen = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });

    shadow.castShadow = true;

    const showLevel = (level) => {
        levels.forEach((mesh, i) => {
            const shown = i === Math.min(level, levels.length - 1);

            if (mesh === shadow) {
                mesh.material = shown ? material : unseen;
            } else {
                mesh.visible = shown;
            }
        });
    };

    showLevel(0);

    const mixer = new THREE.AnimationMixer(scene);
    const actions = new Map(gltf.animations.map((clip) => [clip.name, mixer.clipAction(clip)]));
    const lengths = Object.fromEntries(gltf.animations.map((clip) => [clip.name, clip.duration]));

    for (const action of actions.values()) {
        action.play();
        action.setEffectiveWeight(0);
    }

    // (One sphere round it however it moves, for all its levels to be culled by: worked out from
    // its least detailed one as it stands, its skin on (its positions are packed small, made full
    // size by its skin), made big enough for its wings spread wide)
    const idle = actions.get(model.clips.idle);

    idle.setEffectiveWeight(1);
    mixer.update(0);
    scene.updateMatrixWorld(true);
    shadow.computeBoundingSphere();
    idle.setEffectiveWeight(0);

    const sphere = shadow.boundingSphere.clone();

    sphere.radius *= 1.8;

    for (const mesh of levels) {
        mesh.boundingSphere = sphere;
    }

    const joints = Object.fromEntries(Object.entries(model.joints).map(([joint, bone]) => [joint, scene.getObjectByName(bone) ?? scene]));
    const lips = Object.fromEntries(Object.entries(model.mouth).map(([part, bone]) => [part, scene.getObjectByName(bone)]));
    const breath = new Breath({ groundAt });
    const object = new THREE.Group();
    const where = { upper: new THREE.Vector3(), lower: new THREE.Vector3(), hinge: new THREE.Vector3() };
    let died = 0;
    let stepped = 0;

    object.add(inner, breath.object);

    return {
        object,
        height: model.made.tall * size,
        // (Nose to tail, as the bodies built in code say theirs: scaled up by BeastAvatar's scale)
        length: model.length / scale,
        materials: { body: material },
        joints,
        attacks: [...Object.keys(model.attacks), ...Object.keys(model.specials)],
        rests: Object.keys(model.rests),
        look: { attacks: Object.keys(model.attacks), specials: Object.keys(model.specials), rests: Object.keys(model.rests) },
        model: id,
        levels,
        showLevel,
        breath,
        lengths,

        pose(inputs) {
            died = inputs.dead ? died + inputs.dt : 0;

            // (Its speed as it's drawn: BeastAvatar gives it as the body's own, scaled down)
            const speed = inputs.speed * scale;
            const posed = poseOf(model, { ...inputs, speed }, { lengths, died });
            const on = new Set(posed.map(({ clip }) => clip));

            for (const [name, action] of actions) {
                if (!on.has(name)) {
                    action.setEffectiveWeight(0);
                }
            }

            for (const { clip, weight, time } of posed) {
                const action = actions.get(clip);

                if (action) {
                    action.setEffectiveWeight(weight);
                    action.time = time;
                }
            }

            mixer.update(0);

            // (Footfalls: one a stride as it walks)
            if (inputs.onStep && speed > 0.2) {
                stepped += speed * inputs.dt;

                if (stepped > model.pace * 0.6) {
                    stepped = 0;
                    inputs.onStep(0, inputs.speed);
                }
            }

            // Its fire, out of its mouth while it breathes (where its lips are now)
            const fire = breathing(model, inputs.attack, lengths, Boolean(inputs.fly?.hover));

            if (fire) {
                object.updateWorldMatrix(true, true);
                lips.upper.getWorldPosition(where.upper);
                lips.lower.getWorldPosition(where.lower);
                lips.hinge.getWorldPosition(where.hinge);
            }

            breath.step(inputs.seen === false && !fire ? 0 : inputs.dt, fire ? where : null);
        },

        dispose() {
            unseen.dispose();
            breath.dispose();
            mixer.stopAllAction();
            mixer.uncacheRoot(scene);
        },
    };
}
