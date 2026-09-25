// Attacks, flinches and falls (client/js/characters/actions.js), on the real body
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { gunzipSync } from "node:zlib";
import * as THREE from "three";
import { Actions, ATTACKS, GUARDS, REACTIONS } from "../client/js/characters/actions.js";
import { HumanData } from "../client/js/characters/body.js";
import { Walker, WALK_STYLES } from "../client/js/characters/locomotion.js";
import { PRESETS } from "../client/js/characters/presets.js";
import { Rig } from "../client/js/characters/rig.js";
import { Battle, STEP_MS } from "../client/js/core/battle.js";
import { STARTING_WEAPONS, WEAPONS } from "../client/js/core/weapons.js";
import { Avatar } from "../client/js/world/avatar.js";

const manifest = JSON.parse(readFileSync(new URL("../client/characters/human.json", import.meta.url), "utf8"));
const unpacked = gunzipSync(readFileSync(new URL("../client/characters/human.bin", import.meta.url)));
const human = new HumanData(manifest, unpacked.buffer.slice(unpacked.byteOffset, unpacked.byteOffset + unpacked.byteLength));

// The parts of a Character the actions use (no meshes or textures, which need a DOM)
function figure(shape = {}) {
    const { positions, joints } = human.shape(shape);
    const rig = new Rig(human.bones);
    const object = new THREE.Group();
    let height = 0;

    for (let v = 0; v < human.vertexCount; v++) {
        if (human.partOf[v] === 0) {
            height = Math.max(height, positions[v * 3 + 1]);
        }
    }

    object.add(rig.root);
    rig.fit(joints);
    object.updateMatrixWorld(true);

    return { human, rig, object, positions, normals: human.normals(positions), joints, height, holds: {}, items: [] };
}

// A figure that walks (standing still) with actions layered over it
function fighter(shape) {
    const character = figure(shape);
    const walker = new Walker(character, WALK_STYLES.natural);
    const actions = new Actions(character);

    walker.overlay = (dt) => actions.apply(dt);
    walker.afterPose = () => actions.place();

    return { character, walker, actions };
}

const world = (bone, character) => character.rig.bone(bone).getWorldPosition(new THREE.Vector3());

describe("attacks (actions.js)", () => {
    it("has one for every weapon, timed with 1 as the blow and 2 as the end", () => {
        for (const [id, weapon] of Object.entries(WEAPONS)) {
            for (const { animation } of weapon.attacks) {
                const times = ATTACKS[animation]?.keys.map(([time]) => time);

                assert.ok(times, `${id} has an animation`);
                assert.equal(times[0], 0);
                assert.ok(times.includes(1), `${animation} has a key at the blow`);
                assert.equal(times.at(-1), 2);
                assert.ok(times.every((time, k) => k === 0 || time > times[k - 1]), `${animation}'s keys in order`);
            }
        }
    });

    it("has a guard for every starting weapon, and a reaction with an effect for every blow", () => {
        for (const id of STARTING_WEAPONS) {
            assert.ok(GUARDS[WEAPONS[id].attacks[0].animation], id);
        }

        for (const { attacks } of Object.values(WEAPONS)) {
            for (const { reaction } of attacks) {
                assert.ok(REACTIONS[reaction].length > 0, reaction);
                assert.equal(typeof REACTIONS[reaction].effect, "string");
            }
        }
    });

    it("reaches the sword hand forward, through where the enemy stands, when the blow lands, on any body", () => {
        for (const shape of [{ macro: { gender: 0, height: 0.2, muscle: 0.4 } }, PRESETS.orc.shape]) {
            const { character, walker, actions } = fighter(shape);
            const { hitAt, duration } = WEAPONS.sword.attacks[0];

            walker.update(0);

            const shoulder = world("RightArm", character);

            actions.startAttack("sword", { hitAt: hitAt / 1000, duration: duration / 1000 });
            walker.update(hitAt / 1000);

            const hand = world("RightHand", character);
            const arm = shoulder.distanceTo(world("RightForeArm", character)) + world("RightForeArm", character).distanceTo(hand);

            // In front (z), at chest height, most of an arm's length out
            assert.ok(hand.z > shoulder.z + arm * 0.55, `hand forward: ${hand.z.toFixed(2)} from ${shoulder.z.toFixed(2)}`);
            assert.ok(Math.abs(hand.y - character.height * 0.7) < 0.25, `hand at chest height: ${hand.y.toFixed(2)}`);
        }
    });

    it("raises the hammer over the head before the blow, then brings it down in front", () => {
        const { character, walker, actions } = fighter();
        const { hitAt, duration } = WEAPONS.hammer.attacks[0];

        actions.startAttack("hammer", { hitAt: hitAt / 1000, duration: duration / 1000 });
        walker.update(hitAt / 1000 * 0.6);

        const raised = world("RightHand", character);

        walker.update(hitAt / 1000 * 0.4);

        const struck = world("RightHand", character);

        assert.ok(raised.y > character.height * 0.95, `raised to ${raised.y.toFixed(2)}`);
        assert.ok(struck.y < raised.y - 0.3 && struck.z > raised.z + 0.3, "brought down and forward");
    });

    it("holds a two-handed weapon with both hands, one below the other", () => {
        const { character, walker, actions } = fighter();
        const { hitAt, duration } = WEAPONS.staff.attacks[0];

        actions.startAttack("staff", { hitAt: hitAt / 1000, duration: duration / 1000 });
        walker.update(hitAt / 1000);

        const gap = world("LeftHand", character).distanceTo(world("RightHand", character));

        assert.ok(gap > 0.2 && gap < 0.65, `hands ${gap.toFixed(2)} m apart`);
    });

    it("punches with the left and right in turn", () => {
        const { character, walker, actions } = fighter();
        const { hitAt, duration } = WEAPONS.gauntlets.attacks[0];
        const reach = [];

        for (let k = 0; k < 2; k++) {
            actions.startAttack("punch", { hitAt: hitAt / 1000, duration: duration / 1000 });
            walker.update(hitAt / 1000);
            reach.push(world("RightHand", character).z - world("LeftHand", character).z);
            walker.update(duration / 1000);
        }

        assert.ok(reach[0] > 0.15, "the right fist out first");
        assert.ok(reach[1] < -0.15, "then the left");
    });

    it("ends each attack back in the walk's pose", () => {
        const { character, walker, actions } = fighter();
        const pose = () => character.rig.bones.map((bone) => bone.quaternion.clone());

        walker.update(0);

        const before = pose();

        actions.startAttack("sword", { hitAt: 0.38, duration: 0.76 });

        for (let t = 0; t < 1; t += 0.05) {
            walker.update(0.05);
        }

        // (The legs may have shuffled to keep the feet planted through the lunge)
        assert.equal(actions.attack, null);
        pose().forEach((q, i) => {
            const name = character.rig.bones[i].name;

            if (!/Leg|Foot|Toe/.test(name)) {
                assert.ok(q.angleTo(before[i]) < 0.02, name);
            }
        });
    });
});

describe("reactions and falls (actions.js)", () => {
    it("flinches away from a blow and settles back", () => {
        const { character, walker, actions } = fighter();

        walker.update(0);

        const head = world("Head", character);

        // A hammer blow from in front knocks the head back
        actions.react("crush", { from: 0 });
        walker.update(REACTIONS.crush.length * 0.2);

        const hit = world("Head", character);

        assert.ok(hit.z < head.z - 0.05 || hit.y < head.y - 0.08, "knocked back or doubled over");

        walker.update(REACTIONS.crush.length);
        assert.equal(actions.reactions.length, 0);
        assert.ok(world("Head", character).distanceTo(head) < 0.01);
    });

    it("turns from a cut on the side it comes from", () => {
        const turned = [1, -1].map((side) => {
            const { character, walker, actions } = fighter();

            walker.update(0);
            actions.react("slash", { from: (side * Math.PI) / 2 });
            walker.update(REACTIONS.slash.length * 0.18);

            return world("Head", character).x - world("Hips", character).x;
        });

        assert.ok(Math.sign(turned[0]) !== Math.sign(turned[1]), "opposite ways for opposite sides");
    });

    it("falls down and lies on the ground, then gets up", () => {
        const { character, walker, actions } = fighter();

        actions.die({ from: 0 });

        for (let t = 0; t < 2; t += 0.05) {
            walker.update(0.05);
        }

        assert.ok(world("Head", character).y < 0.35, `head at ${world("Head", character).y.toFixed(2)}`);
        assert.ok(world("Hips", character).y < 0.3);
        assert.ok(world("Head", character).z < -0.8, "fallen backwards, away from the blow");

        actions.revive();
        walker.release();
        walker.update(0.05);
        assert.ok(world("Head", character).y > character.height * 0.85);
    });
});

describe("characters in the world (avatar.js)", () => {
    // Follow a battle's player as the game does, at 60 frames a second, between its steps
    function follow(order, seconds) {
        const battle = new Battle({ blocked: Array.from({ length: 30 }, () => new Uint8Array(60)) }, { seed: 1 });
        const player = battle.add({ id: "player", kind: "player", weapon: "sword", team: "hero", square: [2, 24] });
        const avatar = new Avatar(figure());
        const dt = 1 / 60;
        const frames = [];
        let previous = { x: player.x, y: player.y };
        let waiting = 0;

        avatar.place(player.x, player.y, player.facing);
        battle.command("player", order);

        for (let t = 0; t < seconds; t += dt) {
            for (waiting += dt * 1000; waiting >= STEP_MS; waiting -= STEP_MS) {
                previous = { x: player.x, y: player.y };
                battle.advance(STEP_MS);
            }

            const alpha = waiting / STEP_MS;
            const x = previous.x + (player.x - previous.x) * alpha;
            const z = previous.y + (player.y - previous.y) * alpha;

            avatar.update(dt, x, z, player.facing);
            frames.push({ facing: avatar.facing, x: avatar.object.position.x, z: avatar.object.position.z, lag: Math.hypot(avatar.object.position.x - x, avatar.object.position.z - z), pace: player.pace });
        }

        return { frames, player };
    }

    it("runs in smooth lines, not zig-zagging from square to square, and stops where its actor does", () => {
        // A path that goes straight, then zig-zags diagonally and straight to the north-east
        const { frames, player } = follow({ type: "move", to: [50, 3], run: true }, 9);
        const fast = frames.filter(({ pace }) => pace > 7);
        const turns = fast.slice(1).map(({ facing }, k) => Math.abs(Math.atan2(Math.sin(facing - fast[k].facing), Math.cos(facing - fast[k].facing))) * (180 / Math.PI));
        const last = frames.at(-1);

        assert.ok(fast.length > 200, "sprinted");
        // Square by square, it would turn 45° at every corner
        assert.ok(Math.max(...turns) < 5, `turns at most ${Math.max(...turns).toFixed(1)}° a frame`);
        assert.ok(Math.max(...fast.map(({ lag }) => lag)) < 1.5, "keeps close to its actor");
        assert.ok(Math.hypot(last.x - player.x, last.z - player.y) < 0.01, "and ends where it is");
    });

    it("keeps within a third of a metre of its actor walking", () => {
        const { frames } = follow({ type: "move", to: [50, 3] }, 12);

        assert.ok(Math.max(...frames.map(({ lag }) => lag)) < 0.33);
    });
});
