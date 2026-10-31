// A creature of the wild in the world, kept in step with its actor in the battle as a character's
// avatar is (world/avatar.js): following its place on the same spring, turning the same way, and
// answering the game as an avatar does (its `character`, `walker` and `actions`), so the game
// draws, moves, hurts and kills it as it does anyone.
//
// Most are built in code (beasts/*.js: LOOKS says how) and move themselves (their `pose`):
// walking, running, attacking, flinching and dying their own way. The people-shaped ones
// (bandits, goblins, trolls...) are characters (characters/character.js), bigger or smaller.

import * as THREE from "three";
import { Character } from "../characters/character.js";
import { keyOf, LODS } from "../characters/lod.js";
import { allAtOnce } from "../core/steps.js";
import { Avatar, POSING } from "../world/avatar.js";
import { arachnid } from "./arachnid.js";
import { biped } from "./biped.js";
import { blob } from "./blob.js";
import { championLook, championScale, wearing } from "./champions.js";
import { frog, swarm, wisp } from "./flyers.js";
import { humanoidLook, LOOKS } from "./looks.js";
import { holdModel, MODELS, modelBody, modelOf, releaseModel } from "./model.js";
import { quadruped } from "./quadruped.js";
import { serpent } from "./serpent.js";
import { fold, hold, release, sculpting } from "./sculpt.js";
import { spectre } from "./spectre.js";
import { seeded } from "./shapes.js";

/** What builds each body. */
export const BUILDERS = Object.freeze({ quadruped, blob, serpent, arachnid, swarm, wisp, frog, biped, spectre });

// As world/avatar.js: how fast it turns, how closely it follows its place, and how fast it has to
// go to face the way it's going
const TURN_SPEED = 9;
const FOLLOW = 12;
const HEADING_SPEED = 0.5;

// How long a flinch lasts, and a fall (seconds); faster than this (m/s, for its size), it runs
const REACT_TIME = 0.4;
const DIE_TIME = 1.1;

// Thrown by a blast (toss: a creature's body tumbles whole, docs/CHARACTERS.md *Thrown*): how far
// it rolls over on the way (turns, at least and at most, landing on its side), how long it lies
// there at least, and how long righting itself takes (s)
const TUMBLE = Object.freeze({ turns: [0.25, 1.25], lie: 0.3, right: 0.45 });
const RUN_SPEED = 1.9;

/**
 * How far round it a creature's drawn, for leaving it undrawn out of view (culled): its body's
 * shape at rest, the sphere round it made `margin` times as big for how it moves (none moves further
 * than 1.75 times, measured over every kind's walk, run, attacks, rests, flinch, fall and flight),
 * or where its body says it goes (a swarm: `spread`); and, attacking, further by as far as it
 * reaches or `reach` (in its own measures), for a tongue shot out at what it's attacking, a swarm
 * swirling round it, a slime engulfing.
 */
export const BOUNDS = Object.freeze({ margin: 2, reach: 2 });

// Creatures start counting to their first pose at different frames, as characters do (avatar.js)
let staggered = 0;

// Each of a creature's meshes with fewer triangles, at each of LODS' levels, by its whole one: made
// once for everyone of its kind built alike (who share the whole one), over its very vertices
const lowered = new WeakMap();

// The lower levels of a creature's mesh (`geometry`), asked for from `lods` (lod.js) and kept:
// resolves to a geometry for each of LODS' levels, sharing the whole one's vertices
function levelsOf(geometry, lods) {
    if (!lowered.has(geometry)) {
        const indices = geometry.index.array;
        const positions = geometry.attributes.position.array;
        const uvs = geometry.attributes.uv?.array ?? new Float32Array((positions.length / 3) * 2);
        const key = keyOf(`creature:${positions.length}`, indices);
        const levels = LODS.map(({ share, error }, k) => lods.of(`${key}@${k + 1}`, () => ({ indices, positions, uvs, share, error })));
        const made = Promise.all(levels).then((lows) =>
            lows.map((low) => {
                const lower = new THREE.BufferGeometry();

                for (const [name, attribute] of Object.entries(geometry.attributes)) {
                    lower.setAttribute(name, attribute);
                }

                lower.setIndex(new THREE.BufferAttribute(low, 1));
                lower.boundingSphere = geometry.boundingSphere;
                lower.boundingBox = geometry.boundingBox;

                return lower;
            }),
        );

        lowered.set(geometry, made);

        // (Let go of with the whole one: its look let go of, none of it drawn for a while, sculpt.js forget)
        geometry.addEventListener("dispose", () =>
            made.then(
                (lows) => lows.forEach((lower) => lower.dispose()),
                () => {},
            ),
        );
    }

    return lowered.get(geometry);
}

const wrapAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
const smoothstep = (u) => u * u * (3 - 2 * u);

// How long (seconds) one going on guard, or off it, takes to raise its guard, or lower it
const GUARD_EASE = 0.25;
const clamp01 = (u) => Math.min(1, Math.max(0, u));

// A stand-in's thread, hanging from the roof as it lurks (BeastAvatar.hang): one for all of them
let THREAD = null;

// Which of a creature's joints stands for each of a person's bones the game asks for
const BONES = { Spine2: "torso", Spine1: "torso", Spine: "body", Head: "head", Neck: "head", RightHand: "mouth", LeftHand: "left" };

/**
 * Which of its model's skins one of a kind wears (its seed): "" its own (beasts/model.js MODELS'
 * `skins`). (Its seed well mixed first, so that those whose seeds are near each other, a pack's,
 * wear a skin each of their own: murmur3's finaliser)
 */
export function skinOf(id, seed) {
    const skins = MODELS[id]?.skins ?? [""];
    let mixed = (seed * 104729 + 29) | 0;

    mixed ^= mixed >>> 16;
    mixed = Math.imul(mixed, 0x85ebca6b);
    mixed ^= mixed >>> 13;
    mixed = Math.imul(mixed, 0xc2b2ae35);
    mixed ^= mixed >>> 16;

    return skins[Math.floor(((mixed >>> 0) / 4294967296) * skins.length)];
}

/** How big one of a kind is (its seed): a share of its look's size. */
export function sizeOf(id, seed) {
    const [least, most] = LOOKS[id]?.scale ?? [1, 1];

    return least + seeded(seed * 7919 + 13)() * (most - least);
}

// What each body steps on (audio/sound.js GAITS): a four-legged beast's paws or hooves, a
// two-legged one's feet (a people-shaped one's too, drawn from its model), a spider's many legs,
// a slime's belly, a serpent's scales, a frog's webbed feet; nothing for what floats (spectres,
// wisps) or flies in a swarm. (A look may say its own: a centipede, a serpent's body, skitters on
// its legs.) And how tall one of it stands that's about as heavy as a person (m), to weigh its
// steps by: on all fours, lower
const FEET = Object.freeze({ quadruped: "paws", biped: "feet", humanoid: "feet", arachnid: "legs", blob: "slime", serpent: "scales", frog: "webbed" });
const AS_HEAVY = Object.freeze({ person: 1.75, quadruped: 1.2 });

/** A creature built in code, drawn and moved as an avatar is. */
export class BeastAvatar {
    /**
     * @param {string} id - A LOOKS id (not a people-shaped one's, but one drawn from its read model: dressCreature).
     * @param {object} [options]
     * @param {number} [options.seed] - Which one of its kind it is (its size, its markings).
     * @param {object} [options.champion] - A dungeon's boss's or mini-boss's look, if it's one
     *   (champions.js championLook): bigger, its body tinted, what glows on it brighter.
     */
    constructor(id, { seed = 1, champion = null } = {}) {
        // (One of three of its kind, which it's built as, and shares its body with: the rest of
        // what makes it itself is its size and a little difference in its colour)
        const variant = seed % 3;
        const random = seeded([...id].reduce((sum, letter) => sum * 31 + letter.charCodeAt(0), 7) + variant * 7919);
        const own = seeded(seed * 2246822519 + 3);
        // (A kind drawn from a model, once it's read: beasts/model.js; till then, its look built
        // in code stands in for it)
        const model = MODELS[id] ? modelOf(id) : null;

        this.id = id;
        this.scale = sizeOf(id, seed);
        this.plan = model ? modelBody(id, model, { scale: this.scale, groundAt: () => this.ground ?? this.object.position.y, skin: skinOf(id, seed) }) : BUILDERS[LOOKS[id].body](LOOKS[id], random, `${id}:${variant}`);
        this.scale *= champion ? championScale(champion, this.plan.height * this.scale) : 1;

        /** Is it drawn from its model (beasts/model.js), not its stand-in? */
        this.model = Boolean(model);

        // (Its model kept while it's drawn from it: let go of with it, dispose; and forgotten a
        // while after none is, beasts/model.js forgetModels)
        this.holding = model ? id : null;

        if (model) {
            holdModel(id);
        }

        // (Its ways of attacking and resting its model's, if it's drawn from one)
        const look = this.plan.look ? { ...LOOKS[id], ...this.plan.look } : LOOKS[id];

        // (Its pieces folded into a few things to draw; its skin, whatever it became. Its look's
        // body and pieces kept while it's drawn: let go of with it, dispose. A model's as it is)
        if (model) {
            this.body = null;
        } else {
            const became = fold(this.plan.object, `${id}:${variant}`);

            this.body = `${id}:${variant}`;
            hold(this.body);
            this.plan.materials.body = became.get(this.plan.materials.body) ?? this.plan.materials.body;
        }

        // (Its colour a little its own; a model's other materials, its fur's, with its body's)
        const skins = [this.plan.materials.body, ...(this.plan.materials.others ?? [])];
        const shade = 0.9 + own() * 0.2;

        for (const material of skins) {
            material.color?.multiplyScalar(shade);
        }

        // (A champion's: its body tinted, what glows on it, folded into its own material, brighter)
        if (champion) {
            if (champion.tint !== null) {
                for (const material of skins) {
                    material.color?.multiply(new THREE.Color(champion.tint));
                }
            }

            this.plan.object.traverse((node) => {
                if (node.isMesh && node.material.isMeshBasicMaterial) {
                    node.material.color.multiplyScalar(champion.glow);
                }
            });
        }

        this.plan.object.scale.setScalar(this.scale);
        this.object = new THREE.Group();
        this.object.add(this.plan.object);
        this.#bound();

        /** Is it in view? The game says so each frame: a creature out of view doesn't move what's only for looking at (a cape blown about). */
        this.seen = true;

        /**
         * How often its body's posed: every so many updates, as a character's is (avatar.js
         * posingEvery: the smaller on the screen, the seldomer). Where it is and which way it
         * faces, every update.
         */
        this.every = 1;
        this.unposed = { frames: staggered++ % POSING.unseen, dt: 0 };

        /** Does it cast its shadow? (castShadows: not when it's too small on the screen for one to show) */
        this.shadowed = true;
        this.casters = null;

        /** Which of LODS' levels it's drawn at (0: in full; lowerDetail, fitDetail), and its meshes' levels. */
        this.level = 0;
        this.levels = [];
        this.facing = 0;
        this.last = new THREE.Vector3();
        this.follow = { x: 0, z: 0, vx: 0, vz: 0 };
        this.speed = 0;
        this.clock = own() * 100;
        this.doing = { attack: null, react: null, dead: null, tossed: null, leap: null, guard: null };
        this.random = own;

        /** Flying (a winged one: `winged`), if it is: { beat, bank, climb } (fly/soar/arrive). */
        this.flight = null;
        this.arrival = null;
        this.winged = Boolean(look.wings);
        /** Lurking under the roof or dropping from it on its thread, if it is: { height, roof, u } (hang). */
        this.hanging = null;
        this.hung = false;
        this.thread = null;
        this.object.rotation.order = "YXZ";

        // Its ways of attacking and of resting (LOOKS: those its body can do)
        this.attacks = (look.attacks ?? this.plan.attacks ?? []).filter((style) => this.plan.attacks?.includes(style));
        this.specials = (look.specials ?? []).filter((style) => this.plan.attacks?.includes(style));
        this.rests = (look.rests ?? []).filter((name) => this.plan.rests?.includes(name));
        this.lastAttack = null;
        this.lastRest = null;

        /** What it's resting at, if anything: { name, t, length }, and how far in (0 to 1). */
        this.resting = null;
        this.restWeight = 0;
        this.still = 0;
        this.nextRest = 2 + own() * 4;

        // Its skin, and the glow it has of its own (a wisp's, a magma slime's), which a flush of red
        // when it's struck is added to (materials.body, as a person's skin)
        const skin = this.plan.materials.body;

        this.glow = skin.emissive.clone().multiplyScalar(skin.emissiveIntensity * (champion?.glow ?? 1));
        this.flush = { emissive: new THREE.Color(0, 0, 0) };

        // (A model's other materials, its fur's, each with its own glow, flushed with it)
        this.others = (this.plan.materials.others ?? []).map((material) => ({ material, glow: material.emissive.clone().multiplyScalar(material.emissiveIntensity * (champion?.glow ?? 1)) }));

        const joints = this.plan.joints;
        const bone = (name) => joints[BONES[name]] ?? joints.torso;
        const noop = () => {};

        /** As a character (characters/character.js), as far as the game asks one. */
        this.character = {
            object: this.object,
            height: this.plan.height * this.scale,
            materials: { body: this.flush },
            rig: { bone },
            sheathed: false,
            sheathe: noop,
            setEquipment: noop,
            dispose: () => this.dispose(),
        };

        /** Footfalls told (walker.onStep, as a person's walk tells them). */
        this.walker = { onStep: null };

        /**
         * How its footfalls sound (audio/sound.js step): as heavy as it's big (`size`, a person's
         * 1: AS_HEAVY), on the feet it has (`feet`: its look's, or FEET; none for what floats or
         * flies in a swarm).
         */
        this.gait = { size: (this.plan.height * this.scale) / (AS_HEAVY[look.body] ?? AS_HEAVY.person), feet: look.feet ?? FEET[look.body] ?? null };

        const doing = this.doing;

        /** As a character's actions (characters/actions.js), as far as a creature does them. */
        this.actions = {
            // (`reach`: how far off what it's attacking is, metres, if it's known: a tongue shot
            // out that far)
            startAttack: (animation, { hitAt = 0.4, duration = 0.8, reach = null } = {}) => {
                doing.attack = { t: 0, hit: Math.min(0.9, hitAt / duration), duration, style: this.#styleFor(animation), reach: reach === null ? null : reach / this.scale };
            },
            // (A blow caught on its guard (`block`), on guard: braced behind it, its own way (its
            // model's `guard`'s `struck`))
            react: (kind = null) => {
                if (kind === "block" && doing.guard) {
                    doing.guard.struck = 0;

                    return;
                }

                doing.react = { t: 0 };
            },
            // (Knocked about: a creature's only jolted)
            knockdown: () => {
                doing.react = { t: 0 };
                doing.attack = null;
                doing.guard = null;
            },
            // (Leaping (battle.js "leap": the Orc King's): springing up `lift` seconds from now and
            // coming down `land` seconds from now at `to` ([x, z]), over the ground (`ground`: how
            // high it is at x, z), `up` metres higher at the top of its arc than its clip has it)
            leap: ({ to, lift, land, up = 0, ground }) => {
                doing.leap = { t: 0, from: null, to: [...to], lift: Math.max(0, lift), land: Math.max(lift + 0.05, land), up, ground };
            },
            // (On guard a while (battle.js "guard": the Orc King's), `seconds`: its guard held up
            // (its model's `guard`'s `hold`))
            guard: ({ seconds }) => {
                doing.guard = { t: 0, seconds: Math.max(0.3, seconds), struck: null };
            },
            die: ({ from = 0 } = {}) => {
                doing.attack = null;
                doing.guard = null;
                doing.leap = null;

                // (Thrown, in the air: it falls dead where it lands)
                if (doing.tossed && doing.tossed.t < doing.tossed.flight) {
                    doing.tossed.dead = true;

                    return doing.tossed.flight - doing.tossed.t;
                }

                // (Falling away from whoever killed it)
                doing.tossed = null;
                doing.dead = { t: 0, side: from >= 0 ? 1 : -1 };

                return undefined;
            },
            revive: () => {
                doing.dead = null;
                doing.attack = null;
                doing.react = null;
                doing.tossed = null;
                doing.leap = null;
                doing.guard = null;
            },
            // (Thrown by a blast: tumbling whole through the air, landing on its side, and righting
            // itself `seconds` after it was thrown; or, dead, lying there)
            toss: ({ to, flight, up, ground, seconds = null }) => {
                const [least, most] = TUMBLE.turns;
                const turns = least + Math.floor(this.random() * (most - least + 1)) + 0.25;

                doing.attack = null;
                doing.react = null;
                doing.leap = null;
                doing.guard = null;
                doing.tossed = { t: 0, from: [this.object.position.x, this.object.position.z], to: [...to], flight: Math.max(0.3, flight), up, ground, rights: seconds === null ? Infinity : Math.max(flight + TUMBLE.lie, seconds - TUMBLE.right), roll: (this.random() < 0.5 ? -1 : 1) * turns * Math.PI * 2, dead: seconds === null };

                return doing.tossed.flight;
            },
            get tossed() {
                return doing.tossed;
            },
            draw: noop,
            setGuard: noop,
            setWeapon: noop,
            setSeated: noop,
            stopResting: noop,
            rest: noop,
        };
    }

    // One sphere round the whole of it for its skinned meshes and its cape to be culled by
    // (BOUNDS): three.js would otherwise work one out from the pose they were first drawn in,
    // which goes stale as it moves, so they were drawn wherever the camera looked
    #bound() {
        const skinned = [];
        const box = new THREE.Box3();

        this.plan.object.traverse((node) => {
            if (node.isSkinnedMesh && node.parent === this.plan.object) {
                node.geometry.boundingBox ?? node.geometry.computeBoundingBox();
                box.union(node.geometry.boundingBox);
                skinned.push(node);
            }
        });

        if (!skinned.length) {
            return;
        }

        const spread = this.plan.spread;

        // (Where it goes: the sphere round its body at rest, made bigger for how it moves, or
        // where its body says; the radius without reaching out to attack)
        this.bounds = spread ? new THREE.Sphere(new THREE.Vector3(...spread.centre), spread.radius) : box.getBoundingSphere(new THREE.Sphere());
        this.reachless = spread ? spread.radius : this.bounds.radius * BOUNDS.margin;
        this.bounds.radius = this.reachless;

        for (const mesh of skinned) {
            mesh.boundingSphere = this.bounds;
            mesh.frustumCulled = true;
        }

        if (this.plan.cloth) {
            this.plan.cloth.geometry.boundingSphere = this.bounds;
            this.plan.cloth.frustumCulled = true;
        }
    }

    // How it attacks: a special attack (its breath, its spit...) as it's named; otherwise one of
    // its ways, at random, never the same twice running
    #styleFor(animation) {
        if (this.specials.includes(animation) || (this.attacks.length === 0 && this.plan.attacks?.includes(animation))) {
            return animation;
        }

        const choices = this.attacks.filter((style) => style !== this.lastAttack);
        const style = choices.length ? choices[Math.floor(this.random() * choices.length)] : this.attacks[0] ?? animation;

        this.lastAttack = style;

        return style;
    }

    /** Rest one of its ways (a name its body has), for a while (seconds): sitting, lying down... */
    rest(name = null, length = null) {
        const choices = this.rests.filter((each) => each !== this.lastRest);
        const chosen = name ?? (choices.length ? choices[Math.floor(this.random() * choices.length)] : this.rests[0]);

        if (chosen) {
            this.resting = { name: chosen, t: 0, length: length ?? 4 + this.random() * 6 };
            this.lastRest = chosen;
        }
    }

    /** Put it straight somewhere (metres), facing a way (radians from south, towards east). */
    place(x, z, facing = 0) {
        this.object.position.set(x, 0, z);
        this.object.rotation.y = facing;
        this.facing = facing;
        this.last.copy(this.object.position);
        Object.assign(this.follow, { x, z, vx: 0, vz: 0 });
        this.speed = 0;
    }

    /**
     * Come down out of the sky to land where it's put (a winged one's: a wyvern's, a dragon's):
     * from `from` ([x, y, z], metres; or from far up behind it), gliding down and beating its
     * wings as it flares to land on the ground (`ground` metres up there, as it's kept after:
     * `ground`), over `duration` seconds. It's where its actor is all along; it's only drawn
     * coming down.
     */
    arrive({ from = null, duration = 5, ground = this.ground ?? 0 } = {}) {
        if (!this.winged) {
            return;
        }

        const { x, z } = this.object.position;
        const away = this.random() * Math.PI * 2;
        const start = from ? new THREE.Vector3(...from) : new THREE.Vector3(x + Math.sin(away) * 55, ground + 34 + this.random() * 10, z + Math.cos(away) * 55);

        this.ground = ground;

        this.arrival = { t: 0, duration, from: start };
    }

    /** Is it coming down out of the sky still (arrive)? */
    get arriving() {
        return Boolean(this.arrival);
    }

    /**
     * Hanging in the air over a fight (battle.js #hover), `share` of the way up (0 to 1: the game
     * lifts it there): its wings beating, harder going up and coming down, or its hover's clip if
     * it's drawn from a model (beasts/model.js). Said each moment it's up, before update, as soar
     * and arrive say it flies.
     */
    hover(share) {
        this.flight = share > 0 ? { amount: Math.min(1, share * 4), beat: share < 1 ? 1 : 0.7, hover: true } : null;
    }

    /**
     * Lurking under the roof (battle.js #lurk: a black widow), hanging from its thread, its middle
     * `height` metres up, still (`u` null), or dropping on it (`u`, 0 to 1 of the way: on its feet
     * at 1), the rock `roof` metres up over it; or not (null). Said each moment, before update, as
     * hover is. One drawn from a model hangs and drops by its own clip (model.js poseOf); a stand-in
     * is drawn upside down under its thread, let down on it and turned over onto its feet (#hangs).
     */
    hang(state) {
        this.hanging = state;
    }

    /**
     * Fly (a winged one), not following an actor: at a point (metres, `y` up), heading a way
     * (radians, as `facing`), beating its wings so hard (`beat`: 0 gliding to 1), leaning into its
     * turn (`bank`, radians, + to its right) and climbing (`climb`, radians, + nose up).
     */
    soar(dt, x, y, z, heading, { beat = 0.5, bank = 0, climb = 0 } = {}) {
        this.object.position.set(x, y, z);
        this.object.rotation.set(-climb, heading, bank);
        this.facing = heading;
        this.flight = { amount: 1, beat };
        this.speed = 0;
        this.animate(dt);
    }

    /** As Avatar.update: follow its actor there, turning the way it goes, and move itself. */
    update(dt, x, z, facing, steer = true) {
        const object = this.object;
        const follow = this.follow;

        // (Coming down out of the sky to where its actor is)
        if (this.arrival) {
            Object.assign(follow, { x, z, vx: 0, vz: 0 });
            this.last.set(x, 0, z);
            this.#land(dt, x, z, facing);

            return;
        }

        // (Thrown by a blast: tumbling, then righting itself where it lands, and walking back to
        // its actor from there; leaping, in the air, landing where its actor will be)
        if (this.doing.tossed || (this.doing.leap && this.#leaps(dt))) {
            if (this.doing.tossed) {
                this.#tumble(dt);
            }

            Object.assign(follow, { x: object.position.x, z: object.position.z, vx: 0, vz: 0 });
            this.last.set(object.position.x, 0, object.position.z);

            return;
        }

        const decay = Math.exp(-FOLLOW * dt);
        const ex = follow.x - x;
        const ez = follow.z - z;
        const jx = follow.vx + FOLLOW * ex;
        const jz = follow.vz + FOLLOW * ez;

        follow.x = x + (ex + jx * dt) * decay;
        follow.z = z + (ez + jz * dt) * decay;
        follow.vx = (follow.vx - FOLLOW * jx * dt) * decay;
        follow.vz = (follow.vz - FOLLOW * jz * dt) * decay;

        const moved = Math.hypot(follow.x - this.last.x, follow.z - this.last.z);
        const heading = steer && Math.hypot(follow.vx, follow.vz) > HEADING_SPEED ? Math.atan2(follow.vx, follow.vz) : facing;
        const most = TURN_SPEED * dt;
        const turn = wrapAngle(heading - this.facing);

        object.position.set(follow.x, object.position.y, follow.z);
        this.last.set(follow.x, 0, follow.z);
        this.facing = wrapAngle(this.facing + Math.max(-most, Math.min(most, turn)));
        object.rotation.y = this.facing;

        if (dt > 0) {
            this.speed += (moved / dt - this.speed) * Math.min(1, dt * 8);
        }

        // (Its body posed every so many updates, all the time since then at once)
        const unposed = this.unposed;

        unposed.frames++;
        unposed.dt += dt;

        if (unposed.frames >= this.every) {
            this.animate(unposed.dt);
            Object.assign(unposed, { frames: 0, dt: 0 });
        }
    }

    /**
     * Get ready to be drawn with fewer triangles when it's small on the screen (fitDetail): each of
     * its skinned meshes' triangles at each of LODS' levels, asked for from `lods` (the kit's:
     * lod.js), made once for everyone of its kind built alike, and put in when they come.
     */
    lowerDetail(lods) {
        // (A model's lower details are packed in it: shown a level at a time, fitDetail)
        if (this.plan.showLevel) {
            this.levels = this.plan.levels;

            return;
        }

        this.levels = [];
        this.object.traverse((node) => {
            if (node.isSkinnedMesh && node.geometry.index) {
                this.levels.push({ mesh: node, whole: node.geometry, lower: null });
            }
        });

        for (const each of this.levels) {
            levelsOf(each.whole, lods).then(
                (lower) => {
                    each.lower = lower;
                    each.mesh.geometry = this.level ? lower[this.level - 1] : each.whole;
                },
                () => {},
            );
        }
    }

    /**
     * Drawn with fewer triangles the smaller it is on the screen (`tall`, drawing buffer pixels), as
     * a character is (Character.fitDetail): at each of LODS' levels under its `below`, and at the
     * level above again over its `above`; out of view (0), left as it is.
     */
    fitDetail(tall) {
        if (tall <= 0 || !this.levels.length) {
            return;
        }

        let level = this.level;

        while (level < LODS.length && tall < LODS[level].below) {
            level++;
        }

        while (level > 0 && tall > LODS[level - 1].above) {
            level--;
        }

        if (level !== this.level) {
            this.level = level;

            if (this.plan.showLevel) {
                this.plan.showLevel(level);

                return;
            }

            for (const { mesh, whole, lower } of this.levels) {
                mesh.geometry = level && lower ? lower[level - 1] : whole;
            }
        }
    }

    /**
     * Its shadow cast or not (`on`): those of its pieces that cast one when it was built (not
     * what glows, nor what's seen through), all together.
     */
    castShadows(on) {
        if (on === this.shadowed) {
            return;
        }

        if (!this.casters) {
            this.casters = [];
            this.object.traverse((node) => {
                if (node.isMesh && node.castShadow) {
                    this.casters.push(node);
                }
            });
        }

        for (const mesh of this.casters) {
            mesh.castShadow = on;
        }

        this.shadowed = on;
    }

    // Gliding down to land at (x, z): along a curve from where it came from, sinking faster the
    // nearer it comes, its body level, then flaring (nose up, beating hard) and touching down,
    // turning to face the way its actor faces
    #land(dt, x, z, facing) {
        const arrival = this.arrival;

        arrival.t += dt;

        const u = Math.min(1, arrival.t / arrival.duration);
        const glide = 1 - (1 - u) ** 2;
        const { from } = arrival;
        const heading = Math.atan2(x - from.x, z - from.z);
        const flare = smoothstep(Math.max(0, (u - 0.72) / 0.28));
        const ground = this.ground ?? 0;
        const height = ground + (from.y - ground) * (1 - u) ** 1.7;

        this.object.position.set(from.x + (x - from.x) * glide, height, from.z + (z - from.z) * glide);
        this.facing = wrapAngle(heading + wrapAngle(facing - heading) * flare);
        this.object.rotation.set(-0.35 * flare * (1 - u) * 4, this.facing, 0);
        this.flight = { amount: 1 - smoothstep(Math.max(0, (u - 0.9) / 0.1)), beat: 0.15 + 0.85 * flare };
        this.speed = 0;
        this.animate(dt);

        if (u >= 1) {
            this.arrival = null;
            this.flight = null;
            this.object.position.y = ground;
            this.object.rotation.set(0, this.facing, 0);
        }
    }

    /** Is it breathing a beam (beasts/beam.js: one that breathes one, attacking), that reaches far beyond its body? */
    get beaming() {
        return Boolean(this.plan.beam && this.doing.attack) && !this.doing.dead;
    }

    /** Is it thrown (actions.toss) and not on its feet again yet, or in the air leaping (actions.leap)? */
    get thrown() {
        return Boolean(this.doing.tossed) || this.#aloft();
    }

    /** Is it in the air, thrown or leaping, not down yet? */
    get airborne() {
        return (Boolean(this.doing.tossed) && this.doing.tossed.t < this.doing.tossed.flight) || this.#aloft();
    }

    // In the air, leaping (actions.leap), from when it springs up
    #aloft() {
        const leap = this.doing.leap;

        return Boolean(leap) && leap.t >= leap.lift;
    }

    // Leaping (actions.leap): crouching till it springs up (its clip's), then over the ground from
    // where it sprang to where it lands, as fast all the way, facing the way it's going, its clip
    // taking it up and down (and `up` higher at the top); done once it's down. Whether it's in the air
    #leaps(dt) {
        const leap = this.doing.leap;

        leap.t += dt;

        if (leap.t < leap.lift) {
            return false;
        }

        leap.from ??= [this.object.position.x, this.object.position.z];

        const { from, to, ground, up } = leap;
        const u = Math.min(1, (leap.t - leap.lift) / (leap.land - leap.lift));
        const x = from[0] + (to[0] - from[0]) * u;
        const z = from[1] + (to[1] - from[1]) * u;

        if (Math.hypot(to[0] - from[0], to[1] - from[1]) > 0.1) {
            this.facing = Math.atan2(to[0] - from[0], to[1] - from[1]);
        }

        this.object.position.set(x, ground(x, z) + 4 * up * u * (1 - u), z);
        this.object.rotation.set(0, this.facing, 0);
        this.speed = 0;
        this.animate(dt);

        if (u >= 1) {
            this.doing.leap = null;
        }

        return true;
    }

    // Thrown (actions.toss): along its arc, rolling over and over, landing on its side; lying a
    // moment, then rolled back onto its feet (or, dead, falling dead there)
    #tumble(dt) {
        const tossed = this.doing.tossed;
        const { from, to, flight, up, ground, roll } = tossed;

        tossed.t += dt;

        const u = Math.min(1, tossed.t / flight);
        const x = from[0] + (to[0] - from[0]) * u;
        const z = from[1] + (to[1] - from[1]) * u;
        const below = ground(x, z);
        const height = this.plan.height * this.scale;
        let rolled = roll * (1 - (1 - u) ** 2);

        if (u >= 1) {
            if (tossed.dead && !this.doing.dead) {
                this.doing.dead = { t: 0, side: roll > 0 ? 1 : -1 };
            }

            // (Righting itself; dead, rolled back as it falls over as the dead do)
            const back = tossed.dead ? Math.min(1, (tossed.t - flight) / TUMBLE.right) : Math.max(0, Math.min(1, (tossed.t - tossed.rights) / TUMBLE.right));

            rolled = Math.sign(roll) * (Math.PI / 2) * (1 - smoothstep(back));

            if (!tossed.dead && back >= 1) {
                this.doing.tossed = null;
            }
        }

        // (On its side, its body kept out of the ground: about as thick as a third of its height)
        const lift = Math.abs(Math.sin(rolled)) * height * 0.3;

        this.object.position.set(x, below + 4 * up * u * (1 - u) + lift, z);
        this.object.rotation.set(0, this.facing, this.doing.tossed ? rolled : 0);
        this.speed = 0;
        this.animate(dt);
    }

    /** Move itself for a moment (dt seconds) as it's going and doing (update does this). */
    animate(dt) {
        const doing = this.doing;

        this.clock += dt;

        for (const [key, length] of [["attack", null], ["react", REACT_TIME], ["dead", DIE_TIME]]) {
            const one = doing[key];

            if (one) {
                one.t += dt;
                one.u = one.t / (length ?? one.duration);

                if (key !== "dead" && one.u >= 1) {
                    doing[key] = null;
                }
            }
        }

        // (Its own legs' speed: it's scaled up or down from the size it's built at)
        const speed = doing.dead ? 0 : this.speed / this.scale;

        // (On guard (actions.guard), as long as it's told; a blow caught on it, braced behind it)
        if (doing.guard) {
            doing.guard.t += dt;
            doing.guard.struck = doing.guard.struck === null ? null : doing.guard.struck + dt;

            if (doing.guard.t >= doing.guard.seconds || doing.dead) {
                doing.guard = null;
            }
        }

        // Standing a while, it rests one of its ways; moving, fighting, struck or on guard, it
        // stops, easing out of it
        const busy = speed > 0.15 || doing.attack || doing.react || doing.dead || doing.guard || this.hanging;

        this.still = busy ? 0 : this.still + dt;

        if (!this.resting && !busy && this.still > this.nextRest && this.rests.length) {
            this.rest();
            this.nextRest = 3 + this.random() * 6;
        }

        if (this.resting) {
            this.resting.t += dt;

            const ending = busy || this.resting.t > this.resting.length;

            this.restWeight += ((ending ? 0 : 1) - this.restWeight) * Math.min(1, dt * (busy ? 6 : 2));

            if (ending && this.restWeight < 0.02) {
                this.resting = null;
                this.restWeight = 0;
                this.still = 0;
            }
        }

        this.plan.pose({
            dt,
            t: this.clock,
            speed,
            run: this.speed > RUN_SPEED * Math.sqrt(this.scale),
            attack: doing.attack ? { u: Math.min(1, doing.attack.u ?? 0), hit: doing.attack.hit, style: doing.attack.style, reach: doing.attack.reach } : null,
            rest: this.resting ? { name: this.resting.name, w: smoothstep(this.restWeight), t: this.resting.t } : null,
            react: doing.react ? { u: Math.min(1, doing.react.u ?? 0) } : null,
            guard: doing.guard ? { w: smoothstep(Math.max(0, Math.min(1, doing.guard.t / GUARD_EASE, (doing.guard.seconds - doing.guard.t) / GUARD_EASE))), t: doing.guard.t, struck: doing.guard.struck } : null,
            dead: doing.dead ? { u: Math.min(1, doing.dead.u ?? 0), side: doing.dead.side } : null,
            onStep: (foot, pace) => this.walker.onStep?.(foot, pace * this.scale),
            fly: this.flight,
            hang: this.hanging,
            seen: this.seen,
        });

        this.#hangs();

        // (Attacking, it may reach further than its body: BOUNDS)
        if (this.bounds) {
            this.bounds.radius = this.reachless + (doing.attack ? Math.max(doing.attack.reach ?? 0, BOUNDS.reach) : 0);
        }

        // (Flying, and hanging, only while it's told to: soar, arrive and hang say so each moment)
        if (!this.arrival) {
            this.flight = null;
        }

        this.hanging = null;

        // Its glow, and any flush of red on it (on all of it: a model's fur too)
        const skin = this.plan.materials.body;

        skin.emissive.copy(this.glow).add(this.flush.emissive).multiplyScalar(1 / Math.max(0.001, skin.emissiveIntensity));

        for (const { material, glow } of this.others) {
            material.emissive.copy(glow).add(this.flush.emissive).multiplyScalar(1 / Math.max(0.001, material.emissiveIntensity));
        }
    }

    // Lurking (hang): drawn wherever the camera looks, its sphere being round where it stands, not
    // up there; a stand-in upside down under its thread, its middle as high as it's told, let down
    // on it over the first two thirds of its drop and turned over onto its feet over the last half,
    // its thread from its feet up to the roof. Put back as it was once it's down
    #hangs() {
        const hanging = this.hanging;
        const body = this.plan.object;

        if (hanging || this.hung) {
            body.traverse((node) => {
                if (node.isSkinnedMesh) {
                    node.frustumCulled = !hanging;
                }
            });
        }

        if (!hanging) {
            if (this.hung) {
                body.position.y = 0;
                body.rotation.x = 0;
                this.hung = false;

                if (this.thread) {
                    this.thread.visible = false;
                }
            }

            return;
        }

        this.hung = true;

        if (this.plan.lurks) {
            return;
        }

        const half = this.character.height / 2;
        const down = hanging.u === null ? 0 : smoothstep(clamp01(hanging.u / 0.65));
        const over = hanging.u === null ? 1 : 1 - smoothstep(clamp01((hanging.u - 0.5) / 0.4));
        const middle = half + (hanging.height - half) * (1 - down);
        const feet = middle + half;
        const top = hanging.roof ?? feet + 3;

        body.position.y = middle - half * Math.cos(Math.PI * over);
        body.rotation.x = Math.PI * over;

        THREAD ??= { geometry: new THREE.CylinderGeometry(0.012, 0.012, 1, 4, 1, true), material: new THREE.MeshBasicMaterial({ color: 0xdcdce4, transparent: true, opacity: 0.5, depthWrite: false }) };

        if (!this.thread) {
            this.thread = new THREE.Mesh(THREAD.geometry, THREAD.material);
            this.thread.frustumCulled = false;
            this.object.add(this.thread);
        }

        this.thread.visible = top > feet && over > 0.5;
        this.thread.position.set(0, (feet + top) / 2, 0);
        this.thread.scale.set(1, Math.max(0.01, top - feet), 1);
    }

    /** As Avatar.angleTo: which way a point is from it (0 ahead, positive to its left). */
    angleTo(x, z) {
        return wrapAngle(Math.atan2(x - this.object.position.x, z - this.object.position.z) - this.facing);
    }

    /** A point on it in the world, a share of its height up. */
    point(share = 0.72, target = new THREE.Vector3()) {
        return target.set(this.object.position.x, this.object.position.y + this.character.height * share, this.object.position.z);
    }

    /** Where it strikes from in the world (its mouth, its sting, its sword hand...). */
    hand(side = "Right", target = new THREE.Vector3()) {
        return this.character.rig.bone(`${side}Hand`).getWorldPosition(target);
    }

    /** Where what it carries in its hand is in the world (the Stone Golem's boulder: beasts/model.js `carry`), while it's held; else null. */
    carried(target = new THREE.Vector3()) {
        return this.plan.carried?.(target) ?? null;
    }

    /**
     * Let go of what it's made of (its materials), and of its hold on its look's body and pieces,
     * shared by its kind (let go of a while after none of its look is drawn: sculpt.js forget).
     */
    dispose() {
        if (this.body) {
            release(this.body);
            this.body = null;
        }

        if (this.holding) {
            releaseModel(this.holding);
            this.holding = null;
        }

        // (A model's own: its clips let go of, its fire put out)
        this.plan.dispose?.();

        const materials = new Set();
        const skeletons = new Set();

        this.object.traverse((node) => {
            if (node.material) {
                materials.add(node.material);
            }

            if (node.isSkinnedMesh) {
                skeletons.add(node.skeleton);
            }
        });

        for (const material of materials) {
            material.dispose();
        }

        // (Their bone textures, made when they were first drawn)
        for (const skeleton of skeletons) {
            skeleton.dispose();
        }
    }
}

/**
 * Whose ways of passing the time a people-shaped creature has as it stands (actions.js RESTS'
 * role): a bandit's an adventurer's, the rest a sentry's.
 */
export function restsOf(id) {
    return id === "bandit" || id === "banditChief" ? "adventurer" : "sentry";
}

/**
 * Whether one of a kind (a LOOKS id) is drawn as a beast (a BeastAvatar): every kind but the
 * people-shaped, and one of those drawn from a model once that's read (a hell's lord: till it is,
 * its stand-in's a character, as the rest of the people-shaped are).
 */
export function drawnAsBeast(id) {
    return LOOKS[id].body !== "humanoid" || Boolean(MODELS[id] && modelOf(id));
}

/**
 * Draw one of the wild's creatures (a LOOKS id), one of its kind (`seed`): a BeastAvatar, or for
 * a people-shaped one (but one drawn from its model: drawnAsBeast), a character's Avatar, sized
 * as its kind is, holding its weapon (`equipment`: EQUIPMENT ids) and fighting as it does
 * (`guard`: actions.js GUARDS); a dungeon's boss or mini-boss (`champion`: "boss" or "mini",
 * `regalia`: its id) as champions.js has it.
 */
export function dressCreature(kit, id, options) {
    return allAtOnce(dressingCreature(kit, id, options));
}

/**
 * The same (dressCreature), a step at a time (each a yield: a people-shaped one's character is
 * built in steps, Character.building's; a beast's body, the first time one of its kind's is
 * wanted, sculpted in steps, sculpting's), returning it. (`release`: a people-shaped one's skin
 * let go of once it's sent, Character's.)
 */
export function* dressingCreature(kit, id, { seed = 1, equipment = [], guard = null, hairDetail = 1, champion = null, regalia = null, release = false } = {}) {
    // (A dungeon's boss or mini-boss, `champion` its rank and `regalia` its id: champions.js)
    const own = championLook(champion, regalia);

    if (drawnAsBeast(id)) {
        return yield* sculpting(() => new BeastAvatar(id, { seed, champion: own }));
    }

    const look = humanoidLook(id, seed);
    const character = yield* Character.building(kit, { shape: look.shape, look: look.look, equipment: wearing([...look.equipment, ...equipment], own?.wear ?? []), hairDetail, merge: true, release });
    const scale = sizeOf(id, seed) * (own ? championScale(own, character.height * sizeOf(id, seed)) : 1);

    character.object.scale.setScalar(scale);
    character.height *= scale;

    const avatar = new Avatar(character, { walk: look.walk, guard });

    // (Its legs keep to the ground at its size: a stride as long as its legs, scaled)
    const walk = avatar.walker.update.bind(avatar.walker);

    avatar.walker.update = (dt, { moved = null, ...rest } = {}) => walk(dt, { ...rest, moved: moved === null ? null : moved / scale });
    avatar.scale = scale;

    // (Its footfalls as heavy as it's big: a goblin's lighter than a man's, a troll's heavier)
    avatar.gait = { size: scale };

    // Standing a while, it passes the time as its kind does (actions.js's rests: restsOf), and
    // stops when it moves or fights
    const role = restsOf(id);
    const update = avatar.update.bind(avatar);
    const attack = avatar.actions.startAttack.bind(avatar.actions);
    let still = 0;
    let next = 3 + (seed % 5);
    let resting = false;

    // (One of them, `variant` of its role's, or whichever's next)
    avatar.rest = (variant = null) => {
        resting = avatar.actions.rest(role, { variant }) !== null;
    };
    avatar.update = (dt, x, z, facing, steer) => {
        update(dt, x, z, facing, steer);

        if (Math.hypot(avatar.follow.vx, avatar.follow.vz) > 0.2) {
            if (resting) {
                avatar.actions.stopResting();
                resting = false;
            }

            still = 0;
        } else if ((still += dt) > next && !resting) {
            avatar.rest();
            next = still + 6 + (seed % 4);
        }
    };
    avatar.actions.startAttack = (...args) => {
        avatar.actions.stopResting();
        resting = false;
        still = 0;

        return attack(...args);
    };

    return avatar;
}
