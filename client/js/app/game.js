// The game: the world drawn in 3D (world/view.js), the player and an orc in it, and the battle
// between them (core/battle.js).
//
// The battle runs in fixed steps of STEP_MS, the same on every device; the picture is drawn as
// often as the screen allows, with everyone shown between where they were at the last two steps,
// so they move smoothly whatever the frame rate. Each step's events (attacks, hits, deaths) start
// the animations, projectiles, sparks and damage numbers that show them.
//
// Tap or click the ground to walk there, or an enemy to go and fight it; pinch or scroll to zoom.

import * as THREE from "three";
import { FALL_LANDS, REACTIONS } from "../characters/actions.js";
import { Character } from "../characters/character.js";
import { PRESETS } from "../characters/presets.js";
import { Battle, STEP_MS } from "../core/battle.js";
import { CAST_FAILURES, SPELLS } from "../core/spells.js";
import { longestReach, WEAPONS } from "../core/weapons.js";
import { Avatar } from "../world/avatar.js";
import { Effects } from "../world/effects.js";
import { Squares } from "../world/squares.js";
import { buildGround } from "../world/ground.js";
import { buildTown } from "../world/town3d.js";
import { Minimap, treesOf } from "./minimap.js";
import { ACTIONS, ActionWheel, directionOf } from "./wheel.js";

/** What every new character wears; their weapon (and a bow's quiver) are added to it. */
export const STARTING_OUTFIT = Object.freeze(["tunic", "bracers", "breeches", "boots"]);

/** Everything a character with a starting weapon wears and carries (EQUIPMENT ids). */
export function heroEquipment(weapon) {
    return [...STARTING_OUTFIT, ...WEAPONS[weapon].equipment];
}

// The orc, and what it fights with
const ORC_WEAPON = "cleaver";

// How long the dead lie before sinking out of sight (s), and how long they take to sink
const LIE_STILL = 4;
const SINK = 1.5;

// A tap that moves less than this (pixels) is a tap, not a drag
const TAP_SLOP = 12;

// A second tap this soon after one (ms), and this close to it (pixels; on the minimap, less),
// makes a double tap: run
const DOUBLE_TAP_MS = 350;
const DOUBLE_TAP_SLOP = { view: 60, map: 16 };

// How far from an enemy (screen pixels, at its chest) a tap picks it
const PICK_RADIUS = 46;

// Holding this long (ms) on the player or an enemy opens the action wheel; a finger this far
// (pixels) from where it opened is in one of its slices
const HOLD_MS = 400;
const FLICK = 30;

// How far the camera leans from the player towards who they're fighting: a share of the way,
// up to so many metres
const LEAN = { share: 0.4, most: 4.5 };

const ease = (rate, dt) => 1 - Math.exp(-rate * dt);
const _focus = new THREE.Vector3();
const _lean = new THREE.Vector3();

export class Game {
    /**
     * @param {object} options
     * @param {import("../world/view.js").View} options.view
     * @param {object} options.kit - The character kit (characters/kit.js).
     * @param {object} options.world - From generateWorld (core/world.js).
     * @param {object} options.hero - The player's character: { name, shape, look, weapon }.
     * @param {import("./hud.js").Hud} options.hud
     */
    constructor({ view, kit, world, hero, hud, sound = null }) {
        this.view = view;
        this.kit = kit;
        this.sound = sound;
        this.world = world;
        this.hero = hero;
        this.hud = hud;
        this.battle = new Battle(world, { seed: world.seed });
        this.avatars = new Map();
        this.previous = new Map();
        this.running = false;
        this.accumulator = 0;
        this.lastFrame = 0;

        /** Timings for the debug overlay (milliseconds, smoothed), and the last frames' times. */
        this.stats = { frame: 0, update: 0, render: 0, steps: 0, fps: 0 };
        this.frameTimes = new Float32Array(120);
        this.frameIndex = 0;
        this.frames = 0;
        this.fpsTime = 0;

        /** When each character last attacked (battle time), to stand on guard for a while after. */
        this.lastAttack = new Map();
        this.flights = new Map();
        this.flash = new Map();
        this.pointers = new Map();
        this.pinch = null;
        this.lastTap = null;
        this.listeners = [];
        this.onDeath = () => {};
    }

    /**
     * Build everything there is to see: the ground, the town, the player and the orc, and the
     * shaders to draw them. `onProgress({ label, done, total })` hears how far it's got.
     */
    async build(onProgress = () => {}) {
        const { view, world, kit } = this;
        const timings = {};
        const time = async (name, work) => {
            const start = performance.now();
            const result = await work();

            timings[name] = performance.now() - start;

            return result;
        };
        const steps = world.town.pieces.length + world.trees.length + 6;
        let done = 0;
        const step = (label) => onProgress({ label, done: ++done, total: steps });

        // The trees, for hearing their leaves
        this.sound?.setTrees(treesOf(world).map(({ x, y }) => ({ x, z: y })));
        onProgress({ label: "Laying the ground", done, total: steps });
        this.ground = await time("ground", () => buildGround(world));
        view.scene.add(this.ground);
        step("Building the town");

        this.town = await time("town", () => buildTown(world, {
            onProgress: (count) => {
                done = 1 + count;
                onProgress({ label: count < world.town.pieces.length ? `Building the town (${count} of ${world.town.pieces.length})` : `Planting trees (${count - world.town.pieces.length} of ${world.trees.length})`, done, total: steps });
            },
        }));
        view.scene.add(this.town.object);
        view.setOccluders(this.town);
        step(`Dressing ${this.hero.name}`);

        // The player
        const hairDetail = view.quality.hair;
        const hero = await time("hero", () => new Character(kit, { shape: this.hero.shape, look: this.hero.look, equipment: heroEquipment(this.hero.weapon), hairDetail }));

        this.#addAvatar("player", hero, { walk: "natural", guard: WEAPONS[this.hero.weapon].attacks[0].animation });
        this.battle.add({ id: "player", kind: "player", name: this.hero.name, weapon: this.hero.weapon, team: "town", square: world.spawns.player });
        step("Waking the orc");

        // The orc
        const preset = PRESETS.orc;
        const orc = await time("orc", () => new Character(kit, { shape: preset.shape, look: preset.look, equipment: [...preset.equipment, ...WEAPONS[ORC_WEAPON].equipment], hairDetail }));

        this.#addAvatar("orc", orc, { walk: preset.walk, guard: WEAPONS[ORC_WEAPON].attacks[0].animation });
        this.battle.add({ id: "orc", kind: "orc", name: "Orc", weapon: ORC_WEAPON, team: "orcs", square: world.spawns.orc, ai: "patrol", patrol: world.patrol });
        step("Getting ready to draw");

        this.effects = new Effects(view.scene);

        for (const actor of this.battle.actors) {
            const avatar = this.avatars.get(actor.id);

            avatar.place(actor.x, actor.y, actor.facing);
            this.previous.set(actor.id, { x: actor.x, y: actor.y });
        }

        this.#follow(1);
        step("Drawing the map");

        this.minimap = await time("minimap", () => new Minimap(this.hud.map, world, { onTap: (tap) => this.mapTap(tap) }));
        this.minimap.show(this.minimapShown ?? true);
        this.wheel = new ActionWheel(this.hud.root);
        this.effects.camera = view.camera;

        // Compile every shader now rather than when each thing first comes into view
        await time("shaders", () => view.renderer.compileAsync(view.scene, view.camera));
        step("Ready");

        this.timings = timings;

        const player = this.battle.actor("player");

        this.hud.clear();
        this.hud.setPlayer(player);

        for (const actor of this.battle.actors.filter((other) => other.id !== "player")) {
            this.hud.track(actor.id, { ...actor, hostile: actor.team !== player.team });
        }
    }

    #addAvatar(id, character, options) {
        const avatar = new Avatar(character, options);

        // Footsteps, on whatever ground the foot lands on
        avatar.walker.onStep = (foot, speed) => {
            const { x, z } = avatar.object.position;
            const ground = this.world.ground[Math.floor(z)]?.[Math.floor(x)];

            this.sound?.step(ground, avatar.object.position, speed);
        };
        character.object.name = id;
        this.view.scene.add(character.object);
        this.avatars.set(id, avatar);

        return avatar;
    }

    /** Start playing: the battle and the drawing run, and taps and clicks are listened to. */
    start() {
        if (this.running) {
            return;
        }

        this.running = true;
        this.lastFrame = performance.now();
        this.#listen();
        this.view.renderer.setAnimationLoop((now) => this.#frame(now));
        this.sound?.setAmbient(true);
        this.sound?.setPaused(false);
    }

    /** Stop (pause): nothing moves until start() again. */
    stop() {
        this.running = false;
        this.view.renderer.setAnimationLoop(null);
        this.sound?.setPaused(true);

        for (const [target, type, listener, options] of this.listeners) {
            target.removeEventListener(type, listener, options);
        }

        this.listeners = [];

        for (const pointer of this.pointers.values()) {
            clearTimeout(pointer.hold);
        }

        this.pointers.clear();
        this.pinch = null;
        this.wheel?.hide();
    }

    /** Take everything out of the scene (before building another game). */
    dispose() {
        this.stop();
        this.sound?.setAmbient(false);
        this.hud.clear();

        for (const avatar of this.avatars.values()) {
            avatar.object.removeFromParent();
            avatar.character.dispose();
        }

        // The town's merged meshes and the ground are this game's own (their materials, but for
        // the ground's, are shared by every game)
        this.town?.object.traverse((node) => node.geometry?.dispose());
        this.ground?.geometry.dispose();
        this.ground?.material.dispose();
        this.effects?.group.traverse((node) => node.geometry?.dispose());

        for (const object of [this.ground, this.town?.object, this.effects?.group, this.effects?.marker, this.effects?.targetRing, this.squares?.object]) {
            object?.removeFromParent();
        }

        this.minimap?.dispose();
        this.wheel?.element.remove();
        this.view.setOccluders(null);
        this.view.setFocus(null);
    }

    /** Show the minimap or not. */
    showMinimap(on) {
        this.minimapShown = on;
        this.minimap?.show(on);
    }

    /** Show the squares characters walk on, which are blocked, and everyone's path (debug mode). */
    showSquares(on) {
        if (on && !this.squares) {
            this.squares = new Squares(this.world);
            this.view.scene.add(this.squares.object);
        }

        if (this.squares) {
            this.squares.object.visible = on;
        }
    }

    /**
     * Play on for `seconds` in frames of `frame` seconds without drawing them, then draw once
     * (for tests and debugging on slow machines).
     */
    advance(seconds, { frame = 1 / 30 } = {}) {
        for (let time = 0; time < seconds; time += frame) {
            this.#tick(frame);
        }

        this.view.render();
    }

    // --- Each frame ---

    #frame(now) {
        const frameStart = performance.now();
        const dt = Math.min(0.1, Math.max(0, (now - this.lastFrame) / 1000));

        this.lastFrame = now;

        const steps = this.#tick(dt);
        const updated = performance.now();

        this.view.render();

        const rendered = performance.now();

        // Timings for the debug overlay
        const smooth = (key, value) => (this.stats[key] += (value - this.stats[key]) * 0.1);

        smooth("frame", dt * 1000);
        smooth("update", updated - frameStart);
        smooth("render", rendered - updated);
        this.stats.steps = steps;
        this.frameTimes[this.frameIndex] = dt * 1000;
        this.frameIndex = (this.frameIndex + 1) % this.frameTimes.length;
        this.frames++;

        if (now - this.fpsTime >= 500) {
            this.stats.fps = (this.frames * 1000) / (now - this.fpsTime);
            this.frames = 0;
            this.fpsTime = now;
        }
    }

    // Run the battle's steps for `dt` seconds, and move everyone to match. Returns the steps run
    #tick(dt) {
        this.accumulator += dt * 1000;

        let steps = 0;

        while (this.accumulator >= STEP_MS) {
            for (const actor of this.battle.actors) {
                const previous = this.previous.get(actor.id);

                previous.x = actor.x;
                previous.y = actor.y;
            }

            for (const projectile of this.battle.projectiles) {
                const flight = this.flights.get(projectile.id);

                if (flight) {
                    flight.previous.set(projectile.x, projectile.y);
                }
            }

            this.#handle(this.battle.advance(STEP_MS));
            this.accumulator -= STEP_MS;
            steps++;
        }

        this.#update(dt, this.accumulator / STEP_MS);

        return steps;
    }

    #update(dt, alpha) {
        const { battle, view, hud } = this;

        for (const actor of battle.actors) {
            const avatar = this.avatars.get(actor.id);
            const previous = this.previous.get(actor.id);
            const x = previous.x + (actor.x - previous.x) * alpha;
            const z = previous.y + (actor.y - previous.y) * alpha;

            avatar.actions.setGuard(!actor.dead && this.#fighting(actor));
            avatar.update(dt, x, z, actor.facing, !actor.attack);
            this.#updateBody(actor, avatar, dt);
            hud.setStamina(actor.id, actor.stamina, actor.maxStamina);
        }

        // Projectiles, between their last two steps, rising and falling on the way
        for (const projectile of battle.projectiles) {
            const flight = this.flights.get(projectile.id);

            if (flight) {
                const x = flight.previous.x + (projectile.x - flight.previous.x) * alpha;
                const z = flight.previous.y + (projectile.y - flight.previous.y) * alpha;
                const target = this.avatars.get(projectile.target);
                const left = Math.hypot(target.object.position.x - x, target.object.position.z - z);
                const along = flight.distance > 0 ? Math.min(1, Math.max(0, 1 - left / flight.distance)) : 1;
                const height = flight.height + (target.character.height * 0.72 - flight.height) * along;

                this.effects.fly(projectile.id, new THREE.Vector3(x, height + Math.sin(Math.PI * along) * flight.arc, z));
            }
        }

        // The wheel's spells, greyed for as long as they're cooling down
        if (this.wheel?.open) {
            this.wheel.setCooldown(battle.cooldown("player"));
        }

        // Light gathers in the hand of anyone casting a spell
        for (const actor of battle.actors) {
            if (actor.casting && Math.random() < dt * 30) {
                this.effects.burst(actor.casting.spell === "heal" ? "healCharge" : "stunCharge", this.avatars.get(actor.id).hand("Left"));
            }
        }

        // Everything is heard from where the player is
        const me = this.avatars.get("player");

        this.sound?.setListener(me.object.position.x, me.object.position.z);
        this.sound?.update(dt);

        // The enemy the player is set to fight, ringed, with its bar lit
        const target = this.#target();
        const ringed = target ? this.avatars.get(target.id) : null;

        this.effects.setTarget(ringed?.object ?? null, ringed ? Math.max(0.5, ringed.character.height * 0.33) : 0.6);
        hud.setTarget(target?.id ?? null);
        this.effects.update(dt, view.pixelsPerMetre());
        this.#drawMinimap(target);

        if (this.squares?.object.visible) {
            this.squares.update(battle);
        }
        this.#follow(ease(6, dt));

        // Bars over the other characters' heads
        for (const actor of battle.actors) {
            if (actor.id !== "player") {
                const avatar = this.avatars.get(actor.id);
                const head = avatar.point(1.08);

                hud.place(actor.id, actor.dead ? null : view.toScreen(head));
            }
        }

        // Skin flushing red where hit
        for (const [id, left] of this.flash) {
            const material = this.avatars.get(id).character.materials.body;
            const remaining = left - dt;

            material.emissive.setRGB(0.5, 0.04, 0.02).multiplyScalar(Math.max(0, remaining / 0.25));

            if (remaining <= 0) {
                this.flash.delete(id);
            } else {
                this.flash.set(id, remaining);
            }
        }
    }

    // Is a character fighting (so standing on guard)? Attacking lately, or an enemy close by
    #fighting(actor) {
        if (actor.attack || this.battle.time - (this.lastAttack.get(actor.id) ?? -Infinity) < 2500) {
            return true;
        }

        const reach = longestReach(actor.weapon) + 2;

        return this.battle.actors.some((other) => other.team !== actor.team && !other.dead && Math.hypot(other.x - actor.x, other.y - actor.y) <= reach && this.battle.canSee(actor, other));
    }

    // The dead lie still a while, then sink out of sight until they come back to life
    #updateBody(actor, avatar, dt) {
        const object = avatar.object;

        if (!actor.dead) {
            object.visible = true;
            object.position.y = 0;

            return;
        }

        avatar.deadFor = (avatar.deadFor ?? 0) + dt;

        const sinking = Math.max(0, avatar.deadFor - LIE_STILL) / SINK;

        object.position.y = -0.5 * Math.min(1, sinking);
        object.visible = sinking < 1;
    }

    // The camera follows the player, leaning towards whoever they're fighting so both are in view
    #follow(amount) {
        const player = this.avatars.get("player");

        if (!player) {
            return;
        }

        const position = player.object.position;
        const foe = this.#foe();

        _focus.copy(position);

        if (foe) {
            const lean = _lean.set(foe.x - position.x, 0, foe.y - position.z).multiplyScalar(LEAN.share);

            _focus.add(lean.clampLength(0, LEAN.most));
        }

        this.view.follow(_focus, amount);
        this.view.setFocus(player.point(0.55));
    }

    // The minimap: everyone on it, where the player is going and what the camera sees
    #drawMinimap(target) {
        const minimap = this.minimap;

        if (!minimap?.due()) {
            return;
        }

        const { battle, view } = this;
        const actor = battle.actor("player");
        const me = this.avatars.get("player");
        const rect = view.canvas.getBoundingClientRect();
        const corners = [[rect.left, rect.top], [rect.right, rect.top], [rect.right, rect.bottom], [rect.left, rect.bottom]].map(([x, y]) => {
            const ground = view.groundAt(x, y);

            return ground ? [ground.x, ground.z] : null;
        });

        minimap.draw({
            player: actor.dead ? null : { x: me.object.position.x, z: me.object.position.z, facing: me.facing },
            others: battle.actors.filter((other) => other !== actor && !other.dead).map((other) => {
                const position = this.avatars.get(other.id).object.position;

                return { x: position.x, z: position.z, hostile: other.team !== actor.team, targeted: other === target };
            }),
            destination: actor.order?.type === "move" ? [actor.order.to[0] + 0.5, actor.order.to[1] + 0.5] : null,
            view: corners,
        });
    }

    // Who the player was told to fight (and is still alive), or null
    #target() {
        const player = this.battle.actor("player");
        const order = player && !player.dead ? player.order : null;
        const target = order?.type === "engage" ? this.battle.actor(order.target) : null;

        return target && !target.dead ? target : null;
    }

    // Who the player is fighting: who they were told to fight, or the nearest enemy after them
    #foe() {
        const battle = this.battle;
        const player = battle.actor("player");

        if (!player || player.dead) {
            return null;
        }

        const ordered = player.order?.type === "engage" ? battle.actor(player.order.target) : null;

        if (ordered && !ordered.dead) {
            return ordered;
        }

        const after = battle.actors.filter((actor) => actor.team !== player.team && !actor.dead && (actor.target === player.id || actor.attack?.target === player.id || player.attack?.target === actor.id));

        return after.sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y))[0] ?? null;
    }

    // --- What happened in the battle ---

    #handle(events) {
        const { battle, hud, effects } = this;

        for (const event of events) {
            const avatar = this.avatars.get(event.id);

            switch (event.type) {
                case "attack":
                    avatar.actions.startAttack(event.animation, { hitAt: event.hitAt / 1000, duration: event.duration / 1000 });
                    this.lastAttack.set(event.id, battle.time);
                    this.sound?.attack(event.animation, avatar.object.position, event.hitAt / 1000);
                    break;
                case "projectile": {
                    const target = this.avatars.get(event.target);
                    const hand = WEAPONS[battle.actor(event.id).weapon].equipment.includes("bow") ? "Left" : "Right";
                    const from = avatar.hand(hand);

                    effects.launch(event.projectile, event.kind, from);
                    this.sound?.launch(event.kind, from);
                    this.flights.set(event.projectile, {
                        previous: new THREE.Vector2(event.x, event.y),
                        distance: Math.hypot(target.object.position.x - event.x, target.object.position.z - event.y),
                        height: from.y,
                        arc: event.kind === "arrow" ? 0.25 : 0.05,
                    });
                    break;
                }
                case "hit":
                    this.#hit(event);
                    break;
                case "miss":
                    hud.damage(this.#screenAbove(event.target), "Miss");
                    break;
                case "fizzle":
                    effects.land(event.projectile);
                    this.flights.delete(event.projectile);
                    break;
                case "cast": {
                    const spell = SPELLS[event.spell];

                    avatar.actions.startAttack(event.spell === "heal" ? "castHeal" : "castStun", { hitAt: spell.castTime / 1000, duration: (spell.castTime / 1000) * 1.7 });
                    this.sound?.play(event.spell === "heal" ? "castHeal" : "bolt", { at: avatar.object.position });
                    break;
                }
                case "healed": {
                    const actor = battle.actor(event.id);

                    effects.burst("heal", avatar.point(0.5));
                    effects.pulse(avatar.object.position.x, avatar.object.position.z);
                    hud.damage(this.#screenAbove(event.id), `+${event.amount}`, { kind: "heal" });
                    hud.setHealth(event.id, actor.hp, actor.maxHp);
                    this.sound?.play("healed", { at: avatar.object.position });
                    break;
                }
                case "stunned":
                    effects.burst("stun", avatar.point(0.9));
                    effects.daze(avatar.object, avatar.character.height * 1.08, (event.until - battle.time) / 1000);
                    hud.damage(this.#screenAbove(event.id), "Stunned", { kind: "stun" });
                    this.sound?.play("stun", { at: avatar.object.position });
                    break;
                case "exhausted":
                    if (event.id === "player") {
                        hud.message("Out of breath", 1.5);
                        this.sound?.play("breath");
                    }

                    break;
                case "death": {
                    const killer = event.by ? this.avatars.get(event.by) : null;

                    avatar.actions.die({ from: killer ? avatar.angleTo(killer.object.position.x, killer.object.position.z) : 0 });
                    avatar.deadFor = 0;
                    effects.clearDaze(avatar.object);
                    this.sound?.play("fall", { at: avatar.object.position, delay: FALL_LANDS });

                    if (event.id === "player") {
                        hud.message("You have fallen. You'll wake in the market square…", (event.respawnAt - battle.time) / 1000);
                        this.sound?.play("fallen");
                    } else {
                        hud.message(`The ${battle.actor(event.id).name.toLowerCase()} is slain!`, 3);
                        this.sound?.play("slain", { delay: FALL_LANDS });
                    }

                    this.onDeath(event);
                    break;
                }
                case "respawn": {
                    const actor = battle.actor(event.id);

                    avatar.actions.revive();
                    avatar.place(actor.x, actor.y, actor.facing);
                    avatar.deadFor = 0;
                    this.previous.set(actor.id, { x: actor.x, y: actor.y });
                    effects.clearStuck(avatar.character.rig.bone("Spine2"));
                    hud.setHealth(actor.id, actor.hp, actor.maxHp);

                    if (event.id === "player") {
                        hud.message("");
                        this.sound?.play("wake");
                    }

                    break;
                }
                default:
                    break;
            }
        }
    }

    #hit(event) {
        const { battle, hud, effects } = this;
        const victim = this.avatars.get(event.id);
        const attacker = event.by ? this.avatars.get(event.by) : null;
        const reaction = REACTIONS[event.reaction];
        const from = attacker ? victim.angleTo(attacker.object.position.x, attacker.object.position.z) : 0;
        const actor = battle.actor(event.id);

        victim.actions.react(event.reaction, { from });
        this.sound?.hit(event.reaction, victim.object.position);

        // Where the blow lands, and which way it was going
        const at = victim.point(event.reaction === "punch" ? 0.88 : 0.7);
        const direction = attacker ? at.clone().sub(attacker.point(0.7)).setY(0).normalize() : null;

        effects.impact(reaction?.effect ?? "sparks", at, direction);

        if (event.projectile) {
            effects.land(event.projectile, victim.character.rig.bone("Spine2"));
            this.flights.delete(event.projectile);
        }

        hud.damage(this.#screenAbove(event.id), event.damage, { toPlayer: event.id === "player" });
        hud.setHealth(event.id, actor.hp, actor.maxHp);
        this.flash.set(event.id, 0.25);
    }

    #screenAbove(id) {
        const avatar = this.avatars.get(id);

        return avatar ? this.view.toScreen(avatar.point(0.95)) : null;
    }

    // --- Taps, clicks and zooming ---

    #on(target, type, listener, options) {
        target.addEventListener(type, listener, options);
        this.listeners.push([target, type, listener, options]);
    }

    #listen() {
        const canvas = this.view.canvas;

        this.#on(canvas, "pointerdown", (event) => {
            const pointer = { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false, hold: null, wheel: null };

            canvas.setPointerCapture?.(event.pointerId);
            this.pointers.set(event.pointerId, pointer);

            // Held on the player or an enemy: the action wheel
            const who = this.pointers.size === 1 ? this.#whoIsAt(event.clientX, event.clientY) : null;

            if (who) {
                pointer.hold = setTimeout(() => this.#openWheel(pointer, who), HOLD_MS);
            }

            if (this.pointers.size === 2) {
                const [a, b] = [...this.pointers.values()];

                for (const each of this.pointers.values()) {
                    clearTimeout(each.hold);
                }

                this.#closeWheel();
                this.pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y) };
            }
        });

        this.#on(canvas, "pointermove", (event) => {
            const pointer = this.pointers.get(event.pointerId);

            if (!pointer) {
                return;
            }

            pointer.x = event.clientX;
            pointer.y = event.clientY;

            if (pointer.wheel) {
                this.#steerWheel(pointer);

                return;
            }

            pointer.moved ||= Math.hypot(pointer.x - pointer.startX, pointer.y - pointer.startY) > TAP_SLOP;

            if (pointer.moved) {
                clearTimeout(pointer.hold);
            }

            if (this.pinch && this.pointers.size === 2) {
                const [a, b] = [...this.pointers.values()];
                const distance = Math.hypot(a.x - b.x, a.y - b.y);

                if (distance > 0 && this.pinch.distance > 0) {
                    this.view.zoom(this.pinch.distance / distance);
                }

                this.pinch.distance = distance;
            }
        });

        const up = (event) => {
            const pointer = this.pointers.get(event.pointerId);

            if (!pointer) {
                return;
            }

            this.pointers.delete(event.pointerId);
            clearTimeout(pointer.hold);

            // Let go with the wheel open: whatever was chosen, it closes (in the middle, nothing)
            if (pointer.wheel) {
                if (!pointer.wheel.done) {
                    this.#closeWheel();
                }

                return;
            }

            if (this.pinch) {
                if (this.pointers.size === 0) {
                    this.pinch = null;
                }

                return;
            }

            if (event.type === "pointerup" && !pointer.moved) {
                this.tap(event.clientX, event.clientY, { run: event.shiftKey, time: event.timeStamp });
            }
        };

        this.#on(canvas, "pointerup", up);
        this.#on(canvas, "pointercancel", up);
        this.#on(canvas, "wheel", (event) => {
            event.preventDefault();
            this.view.zoom(Math.exp(event.deltaY * 0.0015));
        }, { passive: false });
    }

    /**
     * A tap or click at a point on the screen (client pixels), at `time` (ms, as performance.now()):
     * fight who's there, or walk there. Tapped twice in quick succession (or with `run`:
     * shift-clicked), run there.
     */
    tap(clientX, clientY, { run = false, time = performance.now() } = {}) {
        const enemy = this.#whoIsAt(clientX, clientY, { player: false })?.actor ?? null;
        const ground = enemy ? null : this.view.groundAt(clientX, clientY);

        this.#order({ enemy, ground: ground && [ground.x, ground.z] }, { clientX, clientY, run, time, from: "view" });
    }

    /**
     * Try an action (an ACTIONS key) on a target: "self" (the player) or an enemy's id. Returns
     * the battle's answer: { ok } or { ok: false, reason }, saying why not to the player.
     */
    act(action, target) {
        const spell = ACTIONS[action]?.spell;
        const result = spell ? this.battle.cast("player", spell, target === "self" ? null : target) : { ok: false, reason: "busy" };

        if (!result.ok) {
            this.hud.message(CAST_FAILURES[result.reason], 1.4);
            this.sound?.play("denied");
        }

        return result;
    }

    // Who is under a point on the screen, within PICK_RADIUS of their feet, middle or head: the
    // nearest living enemy, or the player (if `player`); { actor, wheel: "enemy" or "self" }
    #whoIsAt(clientX, clientY, { player: withPlayer = true } = {}) {
        const player = this.battle.actor("player");
        let best = null;
        let bestDistance = PICK_RADIUS;

        if (!player) {
            return null;
        }

        for (const actor of this.battle.actors) {
            const mine = actor === player;

            if (actor.dead || (mine && !withPlayer) || (!mine && actor.team === player.team)) {
                continue;
            }

            const avatar = this.avatars.get(actor.id);

            for (const share of [0.2, 0.5, 0.8]) {
                const point = this.view.toScreen(avatar.point(share));
                const distance = point ? Math.hypot(point.x - clientX, point.y - clientY) : Infinity;

                // (Enemies first, where they and the player overlap)
                if (distance < bestDistance - (mine ? 6 : 0)) {
                    best = { actor, wheel: mine ? "self" : "enemy" };
                    bestDistance = distance;
                }
            }
        }

        return best;
    }

    // The finger's been held on someone: open the wheel round them
    #openWheel(pointer, { actor, wheel }) {
        const player = this.battle.actor("player");

        if (!this.running || player.dead || actor.dead || this.pointers.size !== 1) {
            return;
        }

        const centre = this.view.toScreen(this.avatars.get(actor.id).point(0.55));

        if (!centre) {
            return;
        }

        pointer.wheel = { originX: pointer.x, originY: pointer.y, target: wheel === "self" ? "self" : actor.id, refused: null, done: false };
        this.wheel.show(centre.x, centre.y, wheel, pointer.wheel.target);
        this.wheel.setCooldown(this.battle.cooldown("player"));
        this.sound?.play("wheel");
        globalThis.navigator?.vibrate?.(12);
    }

    // The finger moves with the wheel open: into a slice, try its action (once)
    #steerWheel(pointer) {
        const open = pointer.wheel;

        if (open.done) {
            return;
        }

        const direction = directionOf(pointer.x - open.originX, pointer.y - open.originY, FLICK);
        const action = direction ? this.wheel.actionAt(direction) : null;

        if (!direction) {
            open.refused = null;
            this.wheel.mark(null);

            return;
        }

        const cooling = SPELLS[ACTIONS[action]?.spell] && this.battle.cooldown("player") > 0;

        if (!action || cooling) {
            if (open.refused !== direction) {
                open.refused = direction;
                this.wheel.mark(direction, "refused");
                this.sound?.play("denied");
            }

            return;
        }

        open.done = true;
        this.wheel.mark(direction, "chosen");
        this.wheel.hide({ after: 180 });
        this.act(action, open.target);
    }

    #closeWheel() {
        if (this.wheel?.open) {
            this.wheel.hide();
        }
    }

    /**
     * A tap on the minimap, at a point in the world (x, z metres) and on the screen (clientX,
     * clientY): fight an enemy within `reach` metres of it, or walk there. Twice in quick
     * succession, run.
     */
    mapTap({ x, z, reach = 3, clientX = 0, clientY = 0, run = false, time = performance.now() }) {
        const player = this.battle.actor("player");
        const enemies = this.battle.actors.filter((actor) => player && actor.team !== player.team && !actor.dead);
        const distance = (actor) => Math.hypot(actor.x - x, actor.y - z);
        const enemy = enemies.filter((actor) => distance(actor) <= reach).sort((a, b) => distance(a) - distance(b))[0] ?? null;

        this.#order({ enemy, ground: enemy ? null : [x, z] }, { clientX, clientY, run, time, from: "map" });
    }

    // Send the player to fight an enemy, or to a point on the ground ([x, z] metres), running if
    // told to or tapped twice in quick succession (in the same place: the view or the minimap)
    #order({ enemy, ground }, { clientX, clientY, run, time, from }) {
        const player = this.battle.actor("player");
        const last = this.lastTap;

        this.lastTap = { time, x: clientX, y: clientY, from };

        if (!player || player.dead) {
            return;
        }

        run ||= last !== null && last.from === from && time - last.time <= DOUBLE_TAP_MS && Math.hypot(clientX - last.x, clientY - last.y) <= DOUBLE_TAP_SLOP[from];

        if (enemy) {
            const chosen = player.order?.type === "engage" && player.order.target === enemy.id;

            this.battle.command("player", { type: "engage", target: enemy.id, run });

            if (!chosen) {
                this.sound?.play("lock");
            }

            return;
        }

        if (!ground) {
            return;
        }

        const x = Math.min(this.world.width - 1, Math.max(0, Math.floor(ground[0])));
        const y = Math.min(this.world.height - 1, Math.max(0, Math.floor(ground[1])));

        this.battle.command("player", { type: "move", to: [x, y], run });

        const goal = this.battle.actor("player").order?.to ?? [x, y];

        this.effects.markTarget(goal[0] + 0.5, goal[1] + 0.5);
    }
}
