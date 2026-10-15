// Clips made up from the clips an asset has (clips.invent), for those its animator didn't make: a
// stretch of one of them with some of its bones turned or moved over it, eased from key to key,
// or with their motion taken from another clip. A bite is the idle with the neck thrown forward
// and the jaw snapped open and shut; a death is a flinch held still while the body sinks and rolls
// onto its side; a breath on the wing is the hover with the neck lowered and the jaw wide.
//
// Turns are about the creature's own axes, as the bone lies where the stretch starts, or at a
// moment of the clip made (`axes`: a wing spread by a graft, then laid down; the pipeline has every
// asset facing +z, up +y): pitch raises the bone's tip (nose up, tail down),
// yaw turns it to the creature's left, roll turns it about the way the creature faces (its right
// side down), and lift raises its tip whichever way it points (a wing held out to the side).
// Moves are metres along the creature's left, up and forward, in the bone's parent's frame.

import { Matrix3, Matrix4, Quaternion, Vector3 } from "three";
import { channelsByNode, duration, sampleChannel, worldMatrix } from "./animation.js";

const AXES = Object.freeze({ left: new Vector3(1, 0, 0), up: new Vector3(0, 1, 0), forward: new Vector3(0, 0, 1) });
const TURNS = Object.freeze({ pitch: AXES.left.clone().negate(), yaw: AXES.up, roll: AXES.forward, lift: null });

/** A key's value between keys ([[seconds, value]...], numbers or arrays): eased in and out of each. */
export function eased(keys, time) {
    if (time <= keys[0][0]) {
        return keys[0][1];
    }

    for (let i = 1; i < keys.length; i++) {
        const [t1, v1] = keys[i];
        const [t0, v0] = keys[i - 1];

        if (time <= t1) {
            const u = t1 > t0 ? (time - t0) / (t1 - t0) : 1;
            const s = u * u * (3 - 2 * u);

            return Array.isArray(v0) ? v0.map((v, k) => v + (v1[k] - v) * s) : v0 + (v1 - v0) * s;
        }
    }

    return keys[keys.length - 1][1];
}

// How far apart a clip's keyframes are (the shortest step in any of its channels: a bone held
// still may have only its first and last; a 30th of a second if none has two)
function stepOf(animation) {
    let step = Infinity;

    for (const channel of animation.listChannels()) {
        const times = channel.getSampler()?.getInput()?.getArray() ?? [];

        for (let i = 1; i < times.length; i++) {
            if (times[i] - times[i - 1] > 1e-6) {
                step = Math.min(step, times[i] - times[i - 1]);
            }
        }
    }

    return Number.isFinite(step) ? step : 1 / 30;
}

// Where a bone stands at rest, one way (translation, rotation or scale)
function restOf(node, path) {
    return { translation: node.getTranslation(), rotation: node.getRotation(), scale: node.getScale() }[path];
}

// A share of the way from one value of a channel to another (a turn's along the shortest arc)
function between(path, from, to, share) {
    if (path === "rotation") {
        return new Quaternion().fromArray(from).slerp(new Quaternion().fromArray(to), share).toArray();
    }

    return from.map((v, k) => v + (to[k] - v) * share);
}

/**
 * Adds the clip `spec` makes to the document, and returns it: { name, from, start = 0, seconds =
 * the rest of it, hold = null (seconds in, from which the clip it's made from is held still),
 * layers: [ { bones, turn, keys: [[seconds, degrees]...], weights?, lag? } | { bone, move:
 * [[seconds, [left, up, forward]]...] } | { graft: clip, bones, start?, keys? } ] }. A turn's
 * degrees are each bone's (times its weight, if it has one); `lag` (seconds) holds each bone back
 * on the one before it, as a tail whips; `axes` (seconds), the bone's axes as it lies then in the
 * clip made, as the layers before have it, not where the stretch starts. A graft gives the bones the other clip's motion, from its
 * `start`, round again if it's shorter; with `keys` ([[seconds, share]...], 0 to 1), only that
 * share of it, eased from key to key (a folded wing spread as the body falls).
 */
export function inventClip(document, spec) {
    const root = document.getRoot();
    const fail = (message) => {
        throw new Error(`clips.invent ${spec.name}: ${message}`);
    };
    const clip = (name) => root.listAnimations().find((animation) => animation.getName() === name) ?? fail(`there's no clip ${name}`);
    const bone = (name) => root.listNodes().find((node) => node.getName() === name) ?? fail(`there's no bone ${name}`);
    const source = clip(spec.from);
    const length = duration(source);
    const start = spec.start ?? 0;
    const seconds = spec.seconds ?? length - start;
    const step = stepOf(source);
    const frames = Math.max(1, Math.round(seconds / step));
    const times = Float32Array.from({ length: frames + 1 }, (_, i) => (i * seconds) / frames);
    const at = (t) => Math.min(length, start + Math.min(t, spec.hold ?? Infinity));
    const moving = channelsByNode(source);
    const channels = new Map();

    // Every channel of the stretch of the clip it's made from
    for (const [node, paths] of moving) {
        for (const [path, channel] of Object.entries(paths)) {
            channels.set(`${node.getName()}/${path}`, { node, path, values: [...times].map((t) => sampleChannel(channel, at(t))) });
        }
    }

    // (A bone's turn in the world at a moment of the clip made, as the layers so far have it)
    const turnAt = (node, i) => {
        const own = new Quaternion().fromArray(channels.get(`${node.getName()}/rotation`)?.values[i] ?? node.getRotation());
        const parent = node.getParentNode();

        return parent ? turnAt(parent, i).multiply(own) : own;
    };

    // (A bone the clip doesn't move: held where it stands at rest, to be moved now)
    const channelOf = (node, path) => {
        const key = `${node.getName()}/${path}`;

        if (!channels.has(key)) {
            const rest = restOf(node, path);

            channels.set(key, { node, path, values: [...times].map(() => [...rest]) });
        }

        return channels.get(key);
    };

    for (const layer of spec.layers) {
        if (layer.graft) {
            const other = clip(layer.graft);
            const otherLength = duration(other) || 1;
            const theirs = channelsByNode(other);

            for (const name of layer.bones) {
                const node = bone(name);

                for (const path of ["translation", "rotation", "scale"]) {
                    const channel = theirs.get(node)?.[path];

                    // (A way the other clip doesn't move the bone, it has it at rest: so too here,
                    // unless it's at rest here already)
                    if (!channel && !channels.has(`${name}/${path}`)) {
                        continue;
                    }

                    const rest = restOf(node, path);
                    const own = channelOf(node, path);

                    own.values = own.values.map((value, i) => {
                        const from = (layer.start ?? 0) + Math.min(times[i], spec.hold ?? Infinity);
                        // (Round again past its end; at its very end, there)
                        const grafted = channel ? sampleChannel(channel, from <= otherLength ? from : from % otherLength) : [...rest];
                        const share = layer.keys ? eased(layer.keys, times[i]) : 1;

                        return share === 1 ? grafted : between(path, value, grafted, share);
                    });
                }
            }
        } else if (layer.move) {
            const node = bone(layer.bone);
            const parent = node.getParentNode();
            // (A way and distance in the world, in the parent's frame where the stretch starts)
            const toParent = new Matrix3().setFromMatrix4(parent ? new Matrix4().copy(worldMatrix(parent, moving, start)).invert() : new Matrix4());
            const channel = channelOf(node, "translation");

            channel.values = channel.values.map((value, i) => {
                const [left, up, forward] = eased(layer.move, times[i]);
                const offset = new Vector3().addScaledVector(AXES.left, left).addScaledVector(AXES.up, up).addScaledVector(AXES.forward, forward).applyMatrix3(toParent);

                return value.map((v, k) => v + offset.getComponent(k));
            });
        } else {
            for (const [b, name] of layer.bones.entries()) {
                const node = bone(name);
                const posed = new Quaternion();

                if (layer.axes === undefined) {
                    worldMatrix(node, moving, start).decompose(new Vector3(), posed, new Vector3());
                } else {
                    posed.copy(turnAt(node, Math.min(frames, Math.max(0, Math.round((layer.axes / (seconds || 1)) * frames)))));
                }

                // (Lift: about the level line across the bone, so its tip rises; a bone standing
                // straight up lifts as the creature pitches)
                const along = new Vector3(0, 1, 0).applyQuaternion(posed);
                const across = new Vector3().crossVectors(along, AXES.up);
                const axis = TURNS[layer.turn] ?? (across.length() > 1e-3 ? across.normalize() : TURNS.pitch);
                const local = axis.clone().applyQuaternion(posed.clone().invert()).normalize();
                const weight = layer.weights?.[b] ?? 1;
                const channel = channelOf(node, "rotation");

                channel.values = channel.values.map((value, i) => {
                    const degrees = eased(layer.keys, times[i] - (layer.lag ?? 0) * b) * weight;

                    return new Quaternion().fromArray(value).multiply(new Quaternion().setFromAxisAngle(local, (degrees * Math.PI) / 180)).toArray();
                });
            }
        }
    }

    const animation = document.createAnimation(spec.name);
    const buffer = root.listBuffers()[0];
    const input = document.createAccessor().setType("SCALAR").setArray(times).setBuffer(buffer);

    for (const { node, path, values } of channels.values()) {
        const output = document
            .createAccessor()
            .setType(path === "rotation" ? "VEC4" : "VEC3")
            .setArray(Float32Array.from(values.flat()))
            .setBuffer(buffer);
        const sampler = document.createAnimationSampler().setInput(input).setOutput(output).setInterpolation("LINEAR");

        animation.addSampler(sampler).addChannel(document.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(sampler));
    }

    return animation;
}

/** Whether clips.invent is as it should be: calls `fail(message)` if not. */
export function checkInvented(list, fail) {
    if (!Array.isArray(list)) {
        fail("clips.invent is a list of clips to make up");
    }

    const keysOf = (keys, where, isValue) => {
        if (!Array.isArray(keys) || !keys.length || keys.some((key) => !Array.isArray(key) || key.length !== 2 || typeof key[0] !== "number" || !isValue(key[1]))) {
            fail(`${where} is a list of [seconds, value] keys`);
        }

        if (keys.some((key, i) => i > 0 && key[0] < keys[i - 1][0])) {
            fail(`${where}'s keys are in order of time`);
        }
    };
    const names = new Set();

    for (const [i, spec] of list.entries()) {
        const where = `clips.invent[${i}]`;

        if (!spec || typeof spec !== "object") {
            fail(`${where} is a clip to make up`);
        }

        for (const key of Object.keys(spec)) {
            if (!["name", "from", "start", "seconds", "hold", "layers"].includes(key)) {
                fail(`unknown setting ${where}.${key}`);
            }
        }

        if (typeof spec.name !== "string" || typeof spec.from !== "string") {
            fail(`${where} names the clip it makes (name) and the clip it's made from (from)`);
        }

        if (names.has(spec.name)) {
            fail(`${where}: there's another clip ${spec.name} made up`);
        }

        names.add(spec.name);

        for (const key of ["start", "seconds", "hold"]) {
            if (spec[key] !== undefined && spec[key] !== null && !(spec[key] >= 0)) {
                fail(`${where}.${key} is a number of seconds`);
            }
        }

        if (!Array.isArray(spec.layers)) {
            fail(`${where}.layers is a list`);
        }

        for (const [k, layer] of spec.layers.entries()) {
            const at = `${where}.layers[${k}]`;
            const kinds = ["turn", "move", "graft"].filter((kind) => layer?.[kind] !== undefined);

            if (kinds.length !== 1) {
                fail(`${at} turns bones (turn), moves one (move) or grafts another clip's motion on (graft)`);
            }

            if (layer.move) {
                if (typeof layer.bone !== "string") {
                    fail(`${at} names the bone it moves (bone)`);
                }

                keysOf(layer.move, `${at}.move`, (value) => Array.isArray(value) && value.length === 3 && value.every((v) => typeof v === "number"));
                continue;
            }

            if (!Array.isArray(layer.bones) || !layer.bones.length || layer.bones.some((name) => typeof name !== "string")) {
                fail(`${at}.bones is a list of bone names`);
            }

            if (layer.graft) {
                if (typeof layer.graft !== "string") {
                    fail(`${at}.graft names a clip`);
                }

                if (layer.keys !== undefined) {
                    keysOf(layer.keys, `${at}.keys`, (value) => typeof value === "number" && value >= 0 && value <= 1);
                }

                continue;
            }

            if (!(layer.turn in TURNS)) {
                fail(`${at}.turn is ${Object.keys(TURNS).join(", ")}, not ${JSON.stringify(layer.turn)}`);
            }

            keysOf(layer.keys, `${at}.keys`, (value) => typeof value === "number");

            if (layer.weights !== undefined && (!Array.isArray(layer.weights) || layer.weights.length !== layer.bones.length)) {
                fail(`${at}.weights has a weight for each bone`);
            }

            if (layer.lag !== undefined && !(layer.lag >= 0)) {
                fail(`${at}.lag is a number of seconds`);
            }

            if (layer.axes !== undefined && !(layer.axes >= 0)) {
                fail(`${at}.axes is a number of seconds`);
            }
        }
    }
}
