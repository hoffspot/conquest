// A player's horse in the world (core/mounts.js; battle.js mount), as its rider's game draws it:
// rising out of a ring of light at their side, standing for them to get up, carrying them at its
// gaits, standing again for them to get down and sinking back into its ring; struck down under
// them, lying dead a while before it sinks away. Its coat and mane its whistle's (the catalog's
// beast-horse, beasts/model.js MODELS horse; till that's read, or without the licensed models, a
// bay built in code stands in, beasts/looks.js). Its rider's posed on it from the rider's clips
// (characters/riding.js: the catalog's beast-horse-rider), in time with its own, their feet in its
// stirrups (STIRRUPS); till those are read (or without them), sat up on it as on a bench.
//
// Nothing here is the world's: where a horse is and what it's doing is the battle's (actor.mount),
// the same on every copy. This only draws it.

import * as THREE from "three";
import { BeastAvatar } from "../beasts/beast.js";
import { modelOf, wantClips, wantModel } from "../beasts/model.js";
import { closeHand } from "../characters/grip.js";
import { MOUNTING, pinchOf, reinGrips, RIDER_CLIPS, RiderClips, SEAT } from "../characters/riding.js";
import { HORSE_MODEL, MANES, MOUNT } from "../core/mounts.js";

/**
 * How a horse comes and goes: how far under the ground it is before it's risen and once it's sunk
 * (metres: all of it), the ring of light it comes and goes in (its diameter, metres, its colours),
 * how high its rider's sat on it till their clips are read (metres: the stand-in's back), and how
 * much higher the camera looks with them up on it (metres).
 */
export const HORSEBACK = Object.freeze({ depth: 2.4, ring: Object.freeze({ from: 0.6, to: 3.4 }), colour: 0xffc65a, bright: 0xfff3c8, saddle: 1.05, camera: 0.8 });

// The horse's coats, by its whistle's (core/mounts.js COATS): its model's skins ("" its own bay)
const SKINS = Object.freeze({ bay: "", gray: "gray", dapple: "dapple", palomino: "palomino", white: "white" });

// Its manes' materials (the model's two: the light hair's, the long dark mane's)
const MANE_MATERIALS = Object.freeze({ light: "MI_Hair_White", dark: "MI_Mane02_Black" });

/**
 * A rider's feet in the stirrups (on horseback, whatever their legs' length, at every gait): the
 * ball of each foot (`ball` of the way from the ball, the toes' joint, back to the ankle) set `up`
 * metres over the lowest of its stirrup's tread (the saddle's lowest vertices on that side, as it
 * hangs from the horse as it goes), each leg bent to reach it; put there over the last `into`
 * seconds of getting up, and let go over the first `outOf` of getting down.
 */
export const STIRRUPS = Object.freeze({ ball: 0.35, up: 0.04, treads: 12, into: 0.25, outOf: 0.3 });

/**
 * The reins in their rider's hands: the bones the horse's reins hang from at their ends (`bones`,
 * by the side: the horse's left its rider's left), each put where its hand holds it, under the
 * thumb of a hand closed on it (characters/riding.js REIN_HOLD, pinchOf), as far as the rider's
 * feet are in the stirrups (getting up, riding, getting down: STIRRUPS), the hands closed as far;
 * else the reins hang as the horse's clips have them, on its neck before the saddle.
 */
export const REINS = Object.freeze({ bones: Object.freeze({ Left: "Reins_Bn_Hand_L", Right: "Reins_Bn_Hand_R" }) });

const ease = (u) => {
    const t = Math.min(1, Math.max(0, u));

    return t * t * (3 - 2 * t);
};

const _cg = new THREE.Vector3();
const _feet = new THREE.Vector3();
const _tread = new THREE.Vector3();
const _vertex = new THREE.Vector3();
const _ankle = new THREE.Vector3();
const _toes = new THREE.Vector3();
const _ball = new THREE.Vector3();
const _pinch = new THREE.Vector3();

// A saddle's stirrups' treads: the lowest of its vertices on each side as it's made (the horse's
// left its +x), by its geometry ({ Left, Right }: vertex indices)
const TREADS = new WeakMap();

function treadsOf(saddle) {
    const geometry = saddle.geometry;

    if (!TREADS.has(geometry)) {
        const position = geometry.attributes.position;
        const side = (sign) => {
            const ids = [];

            for (let i = 0; i < position.count; i++) {
                if (Math.sign(position.getX(i)) === sign) {
                    ids.push(i);
                }
            }

            return ids.sort((a, b) => position.getY(a) - position.getY(b)).slice(0, STIRRUPS.treads);
        };

        TREADS.set(geometry, { Left: side(1), Right: side(-1) });
    }

    return TREADS.get(geometry);
}

/** The horses of those riding (by their actor's id), drawn under them. */
export class Mounts {
    /**
     * @param {THREE.Object3D} scene - What they're drawn in.
     * @param {object} options
     * @param {object} [options.fx] - The game's spell effects (world/spellfx.js SpellFx): the rings they come and go in.
     * @param {object} [options.sound] - The game's sounds (audio/sound.js), or null.
     */
    constructor(scene, { fx = null, sound = null } = {}) {
        this.scene = scene;
        this.fx = fx;
        this.sound = sound;
        this.horses = new Map();
        /** Each rider's hands' grips on the reins, fitted to their hands (by their body's rig). */
        this.grips = new WeakMap();
        this.clips = null;
        this.asked = false;
    }

    // The horse's model, and its rider's clips, asked for once anyone has a horse out
    #want() {
        if (this.asked) {
            return;
        }

        this.asked = true;
        wantModel(HORSE_MODEL, "now");
        wantClips(RIDER_CLIPS, "now")?.then((gltf) => {
            if (gltf) {
                this.clips = new RiderClips(gltf);
            }
        });
    }

    /** Whether someone's up on their horse (getting up, riding or getting down), for the camera. */
    up(id) {
        const one = this.horses.get(id);

        return Boolean(one && ["mounting", "riding", "dismounting"].includes(one.phase));
    }

    /**
     * Draw an actor's horse (`actor.mount`, if they've one out) for a frame `dt` seconds long, the
     * battle's time `time` (ms), where their body's drawn (`avatar`, its own update done: they're
     * put up on the horse here), the map's origin in the world (`origin`: [x, z]), and the ground's
     * height at a point of the map (`groundAt(x, y)`, the battle's metres).
     */
    update(actor, avatar, dt, { time, origin: [ox, oz], groundAt }) {
        const mount = actor.mount;
        let one = this.horses.get(actor.id);

        if (!mount) {
            if (one) {
                this.drop(actor.id, avatar);
            }

            return;
        }

        this.#want();

        // (A new horse, or its model read since it was made: made afresh)
        const model = Boolean(modelOf(HORSE_MODEL));

        if (!one || one.horse !== mount.horse.id || one.model !== model) {
            if (one) {
                this.#remove(one);
            }

            one = this.#make(mount.horse, model);
            this.horses.set(actor.id, one);
        }

        const since = Math.max(0, time - mount.at) / 1000;
        const changed = one.phase !== mount.phase;

        one.phase = mount.phase;

        // Where it stands: where its rider's drawn, ridden; else where it came up, or fell
        const riding = mount.phase === "riding";
        const [x, z] = riding ? [avatar.object.position.x, avatar.object.position.z] : [ox + mount.spot[0], oz + mount.spot[1]];
        const facing = riding ? avatar.facing : mount.facing;
        const ground = riding ? (avatar.standing ?? avatar.object.position.y) : groundAt(mount.spot[0], mount.spot[1]);

        if (changed) {
            this.#began(mount, x, ground, z);
        }

        // How far under the ground: rising out of it, or sinking back (once it's lain dead a while)
        const fallen = mount.phase === "fallen";
        const sinking = mount.phase === "sinking" ? since / (MOUNT.sink / 1000) : fallen ? (since - MOUNT.fall / 1000) / (MOUNT.sink / 1000) : 0;
        const under = mount.phase === "rising" ? 1 - ease(since / (MOUNT.rise / 1000)) : ease(sinking);
        const horse = one.beast;

        // (Its speed its rider's, ridden: its gait theirs)
        horse.speed = riding ? Math.hypot(avatar.follow.vx, avatar.follow.vz) : 0;
        horse.object.position.set(x, ground - under * HORSEBACK.depth, z);
        horse.object.rotation.y = facing;
        horse.facing = facing;
        horse.object.visible = under < 0.999 && avatar.object.visible !== false;

        // (Its reins' ends back where they hang, for its clips to move or leave: the rider's hands
        // take them again below)
        for (const end of Object.values(one.reins)) {
            end.bone.position.copy(end.rest);
        }

        horse.animate(dt);

        if (fallen && fallen !== one.dead) {
            horse.actions.die({ from: 1 });
        }

        if (fallen && sinking > 0 && !one.sank) {
            this.#sinksAway(x, ground, z);
            one.sank = true;
        }

        one.dead = fallen;

        // Its rider: up on it, getting up or down, or riding; else as they are; their feet in its
        // stirrups, the horse posed as it is now
        this.#rider(one, mount, avatar, { since, x, z, facing, ground });
        this.#stirrups(one, mount, avatar, since);
        this.#reins(one, mount, avatar, since);
    }

    // How far a rider's in the saddle, posed from their clips on a horse drawn from its model (0 to
    // 1): getting up, all the way at its end; riding; getting down, out of it at its start
    #inSaddle(one, mount, since) {
        if (!one.saddle || !this.clips || one.seated) {
            return 0;
        }

        const getting = mount.quick ? MOUNT.hop : MOUNT.dismount;

        return mount.phase === "riding" ? 1
            : mount.phase === "mounting" ? ease((since - (MOUNT.mount / 1000 - STIRRUPS.into)) / STIRRUPS.into)
            : mount.phase === "dismounting" ? 1 - ease(since / Math.min(STIRRUPS.outOf, getting / 1000))
            : 0;
    }

    // The reins' ends put in their rider's hands, under the thumb (REINS: pinchOf), as far as
    // they're in the saddle
    #reins(one, mount, avatar, since) {
        const amount = this.#inSaddle(one, mount, since);

        if (amount <= 0) {
            return;
        }

        const rig = avatar.character.rig;

        avatar.object.updateMatrixWorld(true);

        for (const [side, end] of Object.entries(one.reins)) {
            pinchOf(rig, side, _pinch);
            end.bone.parent.worldToLocal(_pinch);
            end.bone.position.lerp(_pinch, amount);
            end.bone.updateMatrixWorld(true);
        }
    }

    // A body's hands closed round its reins (REIN_HOLD), fitted to its hands once: what it holds
    // in a hand (a torch at night) closed round as that's held instead
    #hands(character) {
        let grips = this.grips.get(character.rig);

        if (!grips) {
            grips = reinGrips(character);
            this.grips.set(character.rig, grips);
        }

        return { Left: character.holds?.Left?.grip ?? grips.Left, Right: character.holds?.Right?.grip ?? grips.Right };
    }

    // A rider's feet put in the stirrups (STIRRUPS), up on a horse drawn from its model, posed from
    // their clips: as far as they're in them (getting up, all the way in at its end; riding; getting
    // down, out of them at its start)
    #stirrups(one, mount, avatar, since) {
        const saddle = one.saddle;
        const amount = this.#inSaddle(one, mount, since);

        if (amount <= 0) {
            return;
        }

        const rig = avatar.character.rig;
        const space = rig.root.parent;

        avatar.object.updateMatrixWorld(true);
        one.beast.object.updateMatrixWorld(true);
        saddle.skeleton.update();

        for (const side of ["Left", "Right"]) {
            this.#tread(one, side, _tread);

            // (The ankle moved as far as the ball of the foot's to go, the foot turned as it was)
            rig.bone(`${side}Foot`).getWorldPosition(_ankle);
            rig.bone(`${side}ToeBase`).getWorldPosition(_toes);
            _ball.copy(_toes).lerp(_ankle, STIRRUPS.ball);
            _ankle.addScaledVector(_tread.sub(_ball), amount);
            rig.reach(`${side}UpLeg`, `${side}Leg`, `${side}Foot`, space ? space.worldToLocal(_ankle) : _ankle);
        }
    }

    // A horse begun on its next phase: the ring it comes up in or sinks into, and what's heard
    #began(mount, x, y, z) {
        const at = new THREE.Vector3(x, y, z);
        const ring = (life, from, to) => this.fx?.underfoot(() => at, { from, to, life, colour: HORSEBACK.colour, bright: HORSEBACK.bright });

        if (mount.phase === "rising") {
            ring((MOUNT.rise + MOUNT.mount * 0.3) / 1000, HORSEBACK.ring.from, HORSEBACK.ring.to);
            this.sound?.play("horseRise", { at });
            this.sound?.play("horseWhinny", { at, delay: MOUNT.rise / 1000 });
        } else if (mount.phase === "mounting" || mount.phase === "dismounting") {
            this.sound?.play("saddle", { at });
        } else if (mount.phase === "sinking") {
            ring(MOUNT.sink / 1000 + 0.4, HORSEBACK.ring.to, HORSEBACK.ring.from);
            this.sound?.play("horseSink", { at });
        } else if (mount.phase === "fallen") {
            this.sound?.play("horseFall", { at });
        }
    }

    // A fallen horse, lain dead its while, sinking away into a ring of its own
    #sinksAway(x, y, z) {
        const at = new THREE.Vector3(x, y, z);

        this.fx?.underfoot(() => at, { from: HORSEBACK.ring.to, to: HORSEBACK.ring.from, life: MOUNT.sink / 1000 + 0.4, colour: HORSEBACK.colour, bright: HORSEBACK.bright });
        this.sound?.play("horseSink", { at });
    }

    // Its rider posed on it (their clips, in time with the horse's: getting up or down from the side
    // they do it from, riding each gait as the horse goes), drawn in its frame; or, their clips not
    // read, sat on it; or, not up on it (it's rising, sinking or fallen), as they are
    #rider(one, mount, avatar, { since, x, z, facing, ground }) {
        const actions = avatar.actions;
        const up = ["mounting", "riding", "dismounting"].includes(mount.phase);

        if (!up) {
            actions.setRiding?.(null);

            if (one.seated) {
                actions.setSeated(false);
                one.seated = false;
            }

            return;
        }

        const clips = this.clips;
        const side = MOUNTING[mount.side] ?? MOUNTING.left;
        const object = avatar.object;

        // (Getting up or down: drawn where the horse stands, as it faces, the clip taking them from
        // its side up into the saddle or back down; getting up, what follows where they are is put
        // there, so riding off they're where it is)
        if (mount.phase !== "riding") {
            object.position.set(x, ground, z);
            object.rotation.y = facing;
            avatar.facing = facing;

            if (mount.phase === "mounting") {
                Object.assign(avatar.follow, { x, z, vx: 0, vz: 0 });
            }
        }

        if (clips?.has(side.up)) {
            if (one.seated) {
                actions.setSeated(false);
                one.seated = false;
            }

            const posed = mount.phase === "mounting" ? [{ clip: side.up, weight: 1, time: (since * clips.length(side.up)) / (MOUNT.mount / 1000) }] : mount.phase === "dismounting" ? [{ clip: side.down, weight: 1, time: (since * clips.length(side.down)) / ((mount.quick ? MOUNT.hop : MOUNT.dismount) / 1000) }] : one.beast.plan.posed;
            // (Riding: their seat under the horse's CG bone as it rises and falls with its gait)
            const lift = mount.phase === "riding" ? this.#seat(one) : 0;

            // (Their hands closed on the reins as far as they're in the saddle: REINS)
            const holding = this.#inSaddle(one, mount, since);
            const hands = holding > 0 ? this.#hands(avatar.character) : null;

            actions.setRiding?.((rig) => {
                const done = clips.pose(rig, posed?.length ? posed : [{ clip: "Idle", weight: 1, time: since }], lift);

                if (done && hands) {
                    closeHand(rig, "Left", hands.Left, holding);
                    closeHand(rig, "Right", hands.Right, holding);
                }

                return done;
            });

            return;
        }

        // (No clips to be had: sat up on it, as on a bench at its saddle's height)
        actions.setRiding?.(null);

        if (!one.seated) {
            actions.setSeated(true);
            one.seated = true;
        }

        object.position.y = ground + HORSEBACK.saddle;
    }

    // Where the ball of a rider's foot goes in a stirrup (`side`: "Left" or "Right", the horse's
    // and theirs), as the horse is posed now (in the world): STIRRUPS.up over its tread
    #tread(one, side, target) {
        const ids = treadsOf(one.saddle)[side];

        target.set(0, 0, 0);

        for (const i of ids) {
            one.saddle.getVertexPosition(i, _vertex);
            target.add(one.saddle.localToWorld(_vertex));
        }

        target.multiplyScalar(1 / ids.length);
        target.y += STIRRUPS.up;

        return target;
    }

    /**
     * Where the balls of a rider's feet go in their horse's stirrups as it's posed now (world:
     * { Left, Right }), or null (none out, or drawn without its model).
     */
    stirrupsOf(id) {
        const one = this.horses.get(id);

        if (!one?.saddle) {
            return null;
        }

        one.beast.object.updateMatrixWorld(true);
        one.saddle.skeleton.update();

        return { Left: this.#tread(one, "Left", new THREE.Vector3()), Right: this.#tread(one, "Right", new THREE.Vector3()) };
    }

    /**
     * Where the ends of a rider's reins are as their horse is posed now (world: { Left, Right }),
     * or null (none out, or drawn without its model).
     */
    reinsOf(id) {
        const one = this.horses.get(id);

        if (!one?.reins.Left || !one.reins.Right) {
            return null;
        }

        one.beast.object.updateMatrixWorld(true);

        return { Left: one.reins.Left.bone.getWorldPosition(new THREE.Vector3()), Right: one.reins.Right.bone.getWorldPosition(new THREE.Vector3()) };
    }

    // How high a rider's seat is over the horse's feet as it goes (metres): under its CG bone, as
    // the rider's clips have it (SEAT)
    #seat(one) {
        const bone = one.beast.plan.joints?.body;

        if (!bone) {
            return 0;
        }

        bone.getWorldPosition(_cg);
        one.beast.object.getWorldPosition(_feet);

        return _cg.y - _feet.y - SEAT.under;
    }

    // A horse to draw: in its coat, with its mane (tinted its whistle's tint), saddled
    #make(horse, model) {
        const mane = MANES[horse.mane] ?? MANES.dark;
        const seed = [...horse.id].reduce((hash, character) => (Math.imul(hash, 31) + character.charCodeAt(0)) | 0, 7) >>> 0;
        const beast = new BeastAvatar(HORSE_MODEL, { seed, skin: SKINS[horse.coat] ?? "", parts: ["Body", "Saddle", mane.part] });

        if (model) {
            const material = MANE_MATERIALS[horse.mane];
            const tint = new THREE.Color(horse.tint);

            beast.object.traverse((node) => {
                if (node.isMesh && node.material?.name === material) {
                    node.material.color.copy(tint);
                }
            });
        }

        // (Its hooves heard, a stride at a time, the quicker the faster it goes: from its model only,
        // which tells its strides)
        let heard = -Infinity;

        beast.walker.onStep = (foot, pace) => {
            const rate = Math.min(1.3, Math.max(0.8, 0.8 + pace / 20));
            const now = performance.now();

            // (A stride's four hooves at a time: no sooner than the last's done)
            if (now - heard >= 450 / rate) {
                heard = now;
                this.sound?.play("hoofbeats", { at: beast.object.position, rate, volume: 1 });
            }
        };
        this.scene.add(beast.object);

        // (Its saddle as most finely drawn: its stirrups, for its rider's feet)
        let saddle = null;

        if (model) {
            beast.object.traverse((node) => {
                if (node.isSkinnedMesh && node.name === "Saddle") {
                    saddle = node;
                }
            });
        }

        // (Its reins' ends, for its rider's hands: their bones, and where they hang as it's made)
        const reins = {};

        for (const [side, name] of Object.entries(REINS.bones)) {
            const bone = saddle?.skeleton.bones.find((one) => one.name === name);

            if (bone) {
                reins[side] = { bone, rest: bone.position.clone() };
            }
        }

        return { horse: horse.id, model, beast, saddle, reins, phase: null, dead: false, sank: false, seated: false };
    }

    #remove(one) {
        one.beast.object.removeFromParent();
        one.beast.dispose();
    }

    /** Whether an actor's horse is drawn (their horse's map shown) or not. */
    show(id, shown) {
        const one = this.horses.get(id);

        if (one && !shown) {
            one.beast.object.visible = false;
        }
    }

    /**
     * An actor's horse struck under them (battle.js #horseStruck): it flinches. Where it's struck (a
     * point in the world, its chest), or null if it isn't drawn.
     */
    struck(id) {
        const one = this.horses.get(id);

        if (!one || !one.beast.object.visible) {
            return null;
        }

        one.beast.actions.react();

        return one.beast.point(0.6);
    }

    /** An actor's horse no longer drawn (it's gone, or they have), their body let go of it. */
    drop(id, avatar = null) {
        const one = this.horses.get(id);

        if (!one) {
            return;
        }

        if (avatar) {
            avatar.actions.setRiding?.(null);

            if (one.seated) {
                avatar.actions.setSeated(false);
            }
        }

        this.#remove(one);
        this.horses.delete(id);
    }

    /** Every horse let go of (the game's over, or the world's drawn afresh). */
    dispose() {
        for (const one of this.horses.values()) {
            this.#remove(one);
        }

        this.horses.clear();
    }
}
