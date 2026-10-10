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
import { allAtOnce } from "../core/steps.js";
import { Avatar } from "../world/avatar.js";
import { arachnid } from "./arachnid.js";
import { biped } from "./biped.js";
import { blob } from "./blob.js";
import { championLook, championScale, wearing } from "./champions.js";
import { frog, swarm, wisp } from "./flyers.js";
import { humanoidLook, LOOKS } from "./looks.js";
import { quadruped } from "./quadruped.js";
import { serpent } from "./serpent.js";
import { fold, sculpting } from "./sculpt.js";
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

const wrapAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
const smoothstep = (u) => u * u * (3 - 2 * u);

// Which of a creature's joints stands for each of a person's bones the game asks for
const BONES = { Spine2: "torso", Spine1: "torso", Spine: "body", Head: "head", Neck: "head", RightHand: "mouth", LeftHand: "left" };

/** How big one of a kind is (its seed): a share of its look's size. */
export function sizeOf(id, seed) {
    const [least, most] = LOOKS[id]?.scale ?? [1, 1];

    return least + seeded(seed * 7919 + 13)() * (most - least);
}

// What each body steps on (audio/sound.js GAITS): a four-legged beast's paws or hooves, a
// two-legged one's feet, a spider's many legs, a slime's belly, a serpent's scales, a frog's
// webbed feet; nothing for what floats (spectres, wisps) or flies in a swarm. And how tall one of
// it stands that's about as heavy as a person (m), to weigh its steps by: on all fours, lower
const FEET = Object.freeze({ quadruped: "paws", biped: "feet", arachnid: "legs", blob: "slime", serpent: "scales", frog: "webbed" });
const AS_HEAVY = Object.freeze({ person: 1.75, quadruped: 1.2 });

/** A creature built in code, drawn and moved as an avatar is. */
export class BeastAvatar {
    /**
     * @param {string} id - A LOOKS id (not a people-shaped one's: dressCreature).
     * @param {object} [options]
     * @param {number} [options.seed] - Which one of its kind it is (its size, its markings).
     * @param {object} [options.champion] - A dungeon's boss's or mini-boss's look, if it's one
     *   (champions.js championLook): bigger, its body tinted, what glows on it brighter.
     */
    constructor(id, { seed = 1, champion = null } = {}) {
        const look = LOOKS[id];

        // (One of three of its kind, which it's built as, and shares its body with: the rest of
        // what makes it itself is its size and a little difference in its colour)
        const variant = seed % 3;
        const random = seeded([...id].reduce((sum, letter) => sum * 31 + letter.charCodeAt(0), 7) + variant * 7919);
        const own = seeded(seed * 2246822519 + 3);

        this.id = id;
        this.scale = sizeOf(id, seed);
        this.plan = BUILDERS[look.body](look, random, `${id}:${variant}`);
        this.scale *= champion ? championScale(champion, this.plan.height * this.scale) : 1;

        // (Its pieces folded into a few things to draw; its skin, whatever it became)
        const became = fold(this.plan.object, `${id}:${variant}`);

        this.plan.materials.body = became.get(this.plan.materials.body) ?? this.plan.materials.body;
        this.plan.materials.body.color?.multiplyScalar(0.9 + own() * 0.2);

        // (A champion's: its body tinted, what glows on it, folded into its own material, brighter)
        if (champion) {
            if (champion.tint !== null) {
                this.plan.materials.body.color?.multiply(new THREE.Color(champion.tint));
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
        this.facing = 0;
        this.last = new THREE.Vector3();
        this.follow = { x: 0, z: 0, vx: 0, vz: 0 };
        this.speed = 0;
        this.clock = own() * 100;
        this.doing = { attack: null, react: null, dead: null, tossed: null };
        this.random = own;

        /** Flying (a winged one: `winged`), if it is: { beat, bank, climb } (fly/soar/arrive). */
        this.flight = null;
        this.arrival = null;
        this.winged = Boolean(look.wings);
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
         * 1: AS_HEAVY), on the feet it has (`feet`: FEET; none for what floats or flies in a swarm).
         */
        this.gait = { size: (this.plan.height * this.scale) / (AS_HEAVY[look.body] ?? AS_HEAVY.person), feet: FEET[look.body] ?? null };

        const doing = this.doing;

        /** As a character's actions (characters/actions.js), as far as a creature does them. */
        this.actions = {
            // (`reach`: how far off what it's attacking is, metres, if it's known: a tongue shot
            // out that far)
            startAttack: (animation, { hitAt = 0.4, duration = 0.8, reach = null } = {}) => {
                doing.attack = { t: 0, hit: Math.min(0.9, hitAt / duration), duration, style: this.#styleFor(animation), reach: reach === null ? null : reach / this.scale };
            },
            react: () => {
                doing.react = { t: 0 };
            },
            // (Knocked about: a creature's only jolted)
            knockdown: () => {
                doing.react = { t: 0 };
                doing.attack = null;
            },
            die: ({ from = 0 } = {}) => {
                doing.attack = null;

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
            },
            // (Thrown by a blast: tumbling whole through the air, landing on its side, and righting
            // itself `seconds` after it was thrown; or, dead, lying there)
            toss: ({ to, flight, up, ground, seconds = null }) => {
                const [least, most] = TUMBLE.turns;
                const turns = least + Math.floor(this.random() * (most - least + 1)) + 0.25;

                doing.attack = null;
                doing.react = null;
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
        // its actor from there)
        if (this.doing.tossed) {
            this.#tumble(dt);
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

        this.animate(dt);
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

    /** Is it thrown (actions.toss) and not on its feet again yet? */
    get thrown() {
        return Boolean(this.doing.tossed);
    }

    /** Is it in the air, thrown, not down yet? */
    get airborne() {
        return Boolean(this.doing.tossed) && this.doing.tossed.t < this.doing.tossed.flight;
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

        // Standing a while, it rests one of its ways; moving, fighting or struck, it stops, easing
        // out of it
        const busy = speed > 0.15 || doing.attack || doing.react || doing.dead;

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
            dead: doing.dead ? { u: Math.min(1, doing.dead.u ?? 0), side: doing.dead.side } : null,
            onStep: (foot, pace) => this.walker.onStep?.(foot, pace * this.scale),
            fly: this.flight,
            seen: this.seen,
        });

        // (Attacking, it may reach further than its body: BOUNDS)
        if (this.bounds) {
            this.bounds.radius = this.reachless + (doing.attack ? Math.max(doing.attack.reach ?? 0, BOUNDS.reach) : 0);
        }

        // (Flying only while it's told to: soar and arrive say so each moment)
        if (!this.arrival) {
            this.flight = null;
        }

        // Its glow, and any flush of red on it
        const skin = this.plan.materials.body;

        skin.emissive.copy(this.glow).add(this.flush.emissive).multiplyScalar(1 / Math.max(0.001, skin.emissiveIntensity));
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

    /** Let go of what it's made of (its materials: its shapes are shared by its kind). */
    dispose() {
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
 * Draw one of the wild's creatures (a LOOKS id), one of its kind (`seed`): a BeastAvatar, or for
 * a people-shaped one, a character's Avatar, sized as its kind is, holding its weapon
 * (`equipment`: EQUIPMENT ids) and fighting as it does (`guard`: actions.js GUARDS); a dungeon's
 * boss or mini-boss (`champion`: "boss" or "mini", `regalia`: its id) as champions.js has it.
 */
export function dressCreature(kit, id, options) {
    return allAtOnce(dressingCreature(kit, id, options));
}

/**
 * The same (dressCreature), a step at a time (each a yield: a people-shaped one's character is
 * built in steps, Character.building's; a beast's body, the first time one of its kind's is
 * wanted, sculpted in steps, sculpting's), returning it.
 */
export function* dressingCreature(kit, id, { seed = 1, equipment = [], guard = null, hairDetail = 1, champion = null, regalia = null } = {}) {
    // (A dungeon's boss or mini-boss, `champion` its rank and `regalia` its id: champions.js)
    const own = championLook(champion, regalia);

    if (LOOKS[id].body !== "humanoid") {
        return yield* sculpting(() => new BeastAvatar(id, { seed, champion: own }));
    }

    const look = humanoidLook(id, seed);
    const character = yield* Character.building(kit, { shape: look.shape, look: look.look, equipment: wearing([...look.equipment, ...equipment], own?.wear ?? []), hairDetail, merge: true });
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

    // Standing a while, it passes the time as its kind does (actions.js's rests: a bandit as an
    // adventurer, the rest as a sentry), and stops when it moves or fights
    const role = id === "bandit" || id === "banditChief" ? "adventurer" : "sentry";
    const update = avatar.update.bind(avatar);
    const attack = avatar.actions.startAttack.bind(avatar.actions);
    let still = 0;
    let next = 3 + (seed % 5);
    let resting = false;

    avatar.rest = () => {
        resting = avatar.actions.rest(role) !== null;
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
