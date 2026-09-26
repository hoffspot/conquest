// Attacks, flinches and falls (client/js/characters/actions.js), on the real body
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { gunzipSync } from "node:zlib";
import * as THREE from "three";
import { Actions, ATTACKS, GUARDS, REACTIONS, RESTS } from "../client/js/characters/actions.js";
import { HumanData } from "../client/js/characters/body.js";
import { Walker, WALK_STYLES } from "../client/js/characters/locomotion.js";
import { PRESETS } from "../client/js/characters/presets.js";
import { ITEMS, socketOn } from "../client/js/characters/equipment.js";
import { buildItem } from "../client/js/characters/items.js";
import { limitRotation, Rig } from "../client/js/characters/rig.js";
import { Battle, STEP_MS } from "../client/js/core/battle.js";
import { PLAYER_RESTS_AFTER, REST_EVERY, ROLES } from "../client/js/core/roles.js";
import { pickAnother, Variety } from "../client/js/core/variety.js";
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

// A figure that walks (standing still) with actions layered over it, holding things (items'
// ids) as a Character holds them: each item's model on its hand's socket, turned in it, and the
// hand's hold (equipment.js)
function fighter(shape, held = []) {
    const character = figure(shape);

    for (const id of held) {
        const item = ITEMS[id];
        const socket = socketOn(character, item.socket);
        const model = buildItem(item.model, socket.fit);

        model.name = id;
        model.position.copy(socket.position);
        model.quaternion.copy(socket.quaternion);

        if (item.turn) {
            model.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...item.turn)));
        }

        character.rig.bone(socket.bone).add(model);
        character.items.push(model);
        character.holds[/left|Left/.test(item.socket) ? "Left" : "Right"] = { ...item.hold, grips: item.grips };
    }

    const walker = new Walker(character, WALK_STYLES.natural);
    const actions = new Actions(character);

    walker.overlay = (dt) => actions.apply(dt);
    walker.afterPose = () => actions.place();

    return { character, walker, actions };
}

const world = (bone, character) => character.rig.bone(bone).getWorldPosition(new THREE.Vector3());

// Where the hands are when an attack's blow lands, done a given way (world metres), and the
// shoulders and an arm's length, standing still
function atTheBlow(name, variant, { shape, hitAt = 0.4, duration = 0.8, held = [] } = {}) {
    const { character, walker, actions } = fighter(shape, held);

    walker.update(0);

    const shoulders = { right: world("RightArm", character), left: world("LeftArm", character) };
    const arm = shoulders.right.distanceTo(world("RightForeArm", character)) + world("RightForeArm", character).distanceTo(world("RightHand", character));

    actions.startAttack(name, { hitAt, duration, variant });
    walker.update(hitAt);

    return { character, shoulders, arm, right: world("RightHand", character), left: world("LeftHand", character), head: world("Head", character) };
}

describe("attacks (actions.js)", () => {
    it("has five ways of doing every weapon's attack and every spell, each timed with 1 as the blow and 2 as the end", () => {
        const names = [...new Set(Object.values(WEAPONS).flatMap(({ attacks }) => attacks.map(({ animation }) => animation))), "castHeal", "castStun"];

        for (const name of names) {
            const { variants } = ATTACKS[name] ?? {};

            assert.equal(variants?.length, 5, `${name} has five ways`);
            assert.equal(new Set(variants.map((variant) => variant.name)).size, 5, `${name}'s ways have their own names`);

            for (const { name: way, keys } of variants) {
                const times = keys.map(([time]) => time);

                assert.equal(times[0], 0);
                assert.ok(times.includes(1), `${name} (${way}) has a key at the blow`);
                assert.equal(times.at(-1), 2);
                assert.ok(times.every((time, k) => k === 0 || time > times[k - 1]), `${name} (${way})'s keys in order`);
                assert.deepEqual(keys[0][1], keys.at(-1)[1], `${name} (${way}) ends as it starts`);
            }

            // Each way really is different where the blow lands
            const blows = variants.map(({ keys }) => JSON.stringify(keys.find(([time]) => time === 1)[1]));

            assert.equal(new Set(blows).size, 5, `${name}'s blows all differ`);
        }
    });

    it("never does an attack the same way twice in a row, and does it every way", () => {
        const { walker, actions } = fighter();
        const ways = [];

        for (let k = 0; k < 200; k++) {
            ways.push(actions.startAttack("sword", { hitAt: 0.38, duration: 0.76 }));
            walker.update(0.8);
        }

        assert.ok(ways.every((way, k) => k === 0 || way !== ways[k - 1]), "never twice in a row");
        assert.deepEqual([...new Set(ways)].sort(), [0, 1, 2, 3, 4]);

        // The first, any of the five
        const firsts = new Set(Array.from({ length: 200 }, () => new Actions(figure()).startAttack("staff", { hitAt: 0.3, duration: 0.7 })));

        assert.equal(firsts.size, 5);

        // Each kind of action its own, and a way asked for is the way done
        assert.equal(actions.startAttack("hammer", { hitAt: 0.6, duration: 1.1, variant: 3 }), 3);
        assert.notEqual(actions.startAttack("hammer", { hitAt: 0.6, duration: 1.1 }), 3);
    });

    it("lands every way of every melee blow in front, at the enemy, between the hips and the top of the head", () => {
        for (const name of ["sword", "staff", "hammer", "cleaver", "punch"]) {
            for (let variant = 0; variant < 5; variant++) {
                const { character, shoulders, arm, right } = atTheBlow(name, variant, { shape: name === "cleaver" ? PRESETS.orc.shape : undefined });
                const way = `${name} (${ATTACKS[name].variants[variant].name})`;

                assert.ok(right.z > shoulders.right.z + arm * 0.45, `${way}: forward ${(right.z - shoulders.right.z).toFixed(2)} m`);
                assert.ok(right.y > character.height * 0.4 && right.y < character.height * 1.05, `${way}: at ${right.y.toFixed(2)} m`);
            }
        }
    });

    it("lets go of every bolt, fireball and stun from a hand held out towards the enemy, draws every bow to the face, and raises every heal", () => {
        for (const [name, hand] of [["wand", "right"], ["grimoire", "right"], ["castStun", "left"]]) {
            for (let variant = 0; variant < 5; variant++) {
                const blow = atTheBlow(name, variant);

                assert.ok(blow[hand].z > blow.shoulders[hand].z + blow.arm * 0.6, `${name} ${variant}: held out ${(blow[hand].z - blow.shoulders[hand].z).toFixed(2)} m`);
            }
        }

        for (let variant = 0; variant < 5; variant++) {
            const bow = atTheBlow("bow", variant, { hitAt: 0.66, duration: 1 });

            assert.ok(bow.left.z > bow.shoulders.left.z + bow.arm * 0.5, `bow ${variant}: the bow held out`);
            assert.ok(bow.right.distanceTo(bow.head) < 0.35, `bow ${variant}: drawn to the face (${bow.right.distanceTo(bow.head).toFixed(2)} m)`);

            const heal = atTheBlow("castHeal", variant, { hitAt: 0.6, duration: 1 });

            assert.ok(heal.left.y > heal.shoulders.left.y, `heal ${variant}: raised`);
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

            actions.startAttack("sword", { hitAt: hitAt / 1000, duration: duration / 1000, variant: 0 });
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

        actions.startAttack("hammer", { hitAt: hitAt / 1000, duration: duration / 1000, variant: 0 });
        walker.update(hitAt / 1000 * 0.6);

        const raised = world("RightHand", character);

        walker.update(hitAt / 1000 * 0.4);

        const struck = world("RightHand", character);

        assert.ok(raised.y > character.height * 0.95, `raised to ${raised.y.toFixed(2)}`);
        assert.ok(struck.y < raised.y - 0.3 && struck.z > raised.z + 0.3, "brought down and forward");
    });

    it("holds a two-handed weapon with both hands, one below the other, whichever way it's swung", () => {
        for (const name of ["staff", "hammer"]) {
            for (let variant = 0; variant < 5; variant++) {
                const { hitAt, duration } = WEAPONS[name === "staff" ? "staff" : "hammer"].attacks[0];
                const { left, right } = atTheBlow(name, variant, { hitAt: hitAt / 1000, duration: duration / 1000, held: [name === "staff" ? "staff" : "warHammer"] });
                const gap = left.distanceTo(right);

                // (A quarterstaff's hands about shoulder width apart; a war hammer's rear hand at the end of the handle)
                assert.ok(gap > (name === "staff" ? 0.25 : 0.15) && gap < 0.65, `${name} ${variant}: hands ${gap.toFixed(2)} m apart`);
            }
        }
    });

    it("punches with the left and right in turn", () => {
        const { character, walker, actions } = fighter();
        const { hitAt, duration } = WEAPONS.gauntlets.attacks[0];
        const reach = [];

        for (let k = 0; k < 2; k++) {
            actions.startAttack("punch", { hitAt: hitAt / 1000, duration: duration / 1000, variant: k });
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

describe("variety (variety.js)", () => {
    it("picks any at first, then never the last one again, all of the others equally often", () => {
        const counts = [0, 0, 0, 0, 0];

        for (let k = 0; k < 5000; k++) {
            counts[pickAnother(5, 2)]++;
        }

        assert.equal(counts[2], 0);
        assert.ok(counts.filter((_, k) => k !== 2).every((count) => Math.abs(count - 1250) < 150), counts.join());
        assert.equal(pickAnother(5, null, () => 0.999), 4);
        assert.equal(pickAnother(5, 4, () => 0.999), 3);
        assert.equal(pickAnother(5, 0, () => 0), 1);
        assert.equal(pickAnother(1, 0), 0);

        const variety = new Variety();
        const picks = Array.from({ length: 50 }, () => variety.next("fireball", 5));

        assert.ok(picks.every((pick, k) => k === 0 || pick !== picks[k - 1]));
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

describe("resting (actions.js RESTS, roles.js)", () => {
    // Where the hands are at a rest's key moment (world metres), with the head, the hips and the
    // shoulders, standing (or seated) still
    function atThePeak(role, variant, { shape } = {}) {
        const { character, walker, actions } = fighter(shape);
        const seated = Boolean(ROLES[role].seated);

        actions.setSeated(seated);
        walker.update(0);

        const shoulders = { right: world("RightArm", character), left: world("LeftArm", character) };
        const waist = world("Spine", character);

        actions.rest(role, { variant });
        walker.update(ROLES[role].rests[variant].hitAt);

        return { character, actions, shoulders, waist, right: world("RightHand", character), left: world("LeftHand", character), head: world("Head", character), pelvis: world("Hips", character) };
    }

    const wayOf = (role, name) => ROLES[role].rests.findIndex((rest) => rest.name === name);

    it("has five named rests for every role, each timed, posed from key time 0 to 2", () => {
        assert.deepEqual(Object.keys(RESTS).sort(), Object.keys(ROLES).sort());

        for (const [role, { title, rests }] of Object.entries(ROLES)) {
            assert.ok(title, role);
            assert.equal(rests.length, 5, role);
            assert.deepEqual(RESTS[role].map(({ name }) => name), rests.map(({ name }) => name), role);
            assert.equal(new Set(rests.map(({ name }) => name)).size, 5, `${role}: five different rests`);

            for (const { name, hitAt, duration } of rests) {
                assert.ok(hitAt > 0.3 && hitAt < duration && duration <= 4, `${role}: ${name}`);
            }

            for (const { name, keys } of RESTS[role]) {
                const times = keys.map(([time]) => time);

                assert.equal(times[0], 0, name);
                assert.equal(times.at(-1), 2, name);
                assert.ok(times.every((time, k) => k === 0 || time > times[k - 1]), `${name}: key times in order`);
            }
        }

        assert.ok(REST_EVERY[0] >= 3000 && REST_EVERY[1] <= 10000, "every several seconds");
        assert.equal(PLAYER_RESTS_AFTER, 15000);
    });

    it("rests any way at first, then never the same way twice running, and eases out when told to stop", () => {
        const { actions } = fighter();
        const ways = [];

        for (let k = 0; k < 120; k++) {
            ways.push(actions.rest("barmaid"));
        }

        assert.ok(ways.every((way, k) => k === 0 || way !== ways[k - 1]));
        assert.equal(new Set(ways).size, 5);
        assert.equal(actions.rest("barmaid", { variant: 3 }), 3);
        assert.equal(actions.rest("nobody"), null);

        // Told to stop, it eases out, then it's done
        const { character, walker, actions: resting } = fighter();

        resting.rest("adventurer", { variant: 0 });
        walker.update(0.6);
        assert.equal(resting.resting, true);
        resting.stopResting(0.3);
        assert.equal(resting.resting, false);
        walker.update(0.15);
        assert.ok(resting.attack, "still easing out");
        walker.update(0.2);
        assert.equal(resting.attack, null);
        assert.ok(character.rig.bone("Hips"));
    });

    it("puts the hands where each rest says: a beard stroked, a brow wiped, hands on the bar and on the hips, a toast raised, arms stretched high", () => {
        const beard = atThePeak("barkeep", wayOf("barkeep", "stroking his beard"));

        assert.ok(beard.right.distanceTo(beard.head) < 0.25, "a hand at the chin");

        const brow = atThePeak("barmaid", wayOf("barmaid", "wiping her brow"));

        assert.ok(brow.left.y > brow.shoulders.left.y + 0.1 && brow.left.distanceTo(brow.head) < 0.3, "a wrist at the brow");

        const hip = atThePeak("barmaid", wayOf("barmaid", "hand on her hip"));

        assert.ok(Math.abs(hip.left.y - hip.waist.y) < 0.2, "a hand at the hip");
        assert.ok(hip.left.x > hip.waist.x + 0.1, "at the side");

        const bar = atThePeak("barkeep", wayOf("barkeep", "leaning on the bar"));

        for (const side of ["right", "left"]) {
            assert.ok(bar[side].z > bar.shoulders[side].z + 0.25, `${side} hand on the bar in front`);
            assert.ok(bar[side].y < bar.shoulders[side].y - 0.2, `${side} hand down on it`);
        }

        const hips = atThePeak("madam", wayOf("madam", "hands on her hips"));

        assert.ok(hips.right.x < hips.waist.x - 0.1 && hips.left.x > hips.waist.x + 0.1, "one on each side");
        assert.ok(Math.abs(hips.right.y - hips.waist.y) < 0.2 && Math.abs(hips.left.y - hips.waist.y) < 0.2, "both at the hips");

        const toast = atThePeak("patron", wayOf("patron", "a toast"));

        assert.ok(toast.right.y > toast.shoulders.right.y + 0.15, "the tankard raised high");

        const stretch = atThePeak("adventurer", wayOf("adventurer", "stretching"));

        assert.ok(stretch.right.y > stretch.head.y && stretch.left.y > stretch.head.y, "both arms up over the head");
    });

    it("stays seated through a patron's rests, the pelvis down on the bench", () => {
        const standing = atThePeak("barmaid", 0);

        for (let way = 0; way < 5; way++) {
            const { pelvis } = atThePeak("patron", way);

            assert.ok(pelvis.y < standing.pelvis.y - 0.25, `${ROLES.patron.rests[way].name}: sitting`);
        }
    });
});

describe("arms and hands (actions.js, Rig.reachArm)", () => {
    const DEG = Math.PI / 180;

    // What each action is done holding (casting, a sword in the other hand, on guard), and what
    // each role carries resting (the player, a sword)
    const HELD = { sword: ["sword"], staff: ["staff"], wand: ["wand"], grimoire: ["grimoire"], hammer: ["warHammer"], bow: ["bow"], punch: ["spikedGauntlets", "spikedGauntletLeft"], cleaver: ["cleaver"], castHeal: ["sword"], castStun: ["sword"], toast: ["tankard"], serve: ["tankard"], pour: [] };
    const GUARDED = { castHeal: "sword", castStun: "sword" };
    const CARRIED = { barmaid: ["tankard"], patron: ["tankard"], adventurer: ["sword"] };

    const armed = (held = [], shape = {}) => fighter(shape, held);

    // Every way of every attack, cast and tavern action (from its weapon's guard), every rest and
    // every guard: what's held, how to start it, its keys, and when key times 1 and 2 come
    function everything() {
        const all = [];

        for (const [name, { variants }] of Object.entries(ATTACKS)) {
            variants.forEach(({ name: way, keys }, variant) => {
                all.push({ label: `${name} (${way})`, held: HELD[name], guard: GUARDS[name] ? name : GUARDED[name], keys, hitAt: 0.5, duration: 1, begin: (actions) => actions.startAttack(name, { hitAt: 0.5, duration: 1, variant }) });
            });
        }

        for (const [role, rests] of Object.entries(RESTS)) {
            rests.forEach(({ name: way, keys }, variant) => {
                const { hitAt, duration } = ROLES[role].rests[variant];

                all.push({ label: `${role} (${way})`, held: CARRIED[role] ?? [], seated: ROLES[role].seated, keys, hitAt, duration, begin: (actions) => actions.rest(role, { variant }) });
            });
        }

        for (const name of Object.keys(GUARDS)) {
            all.push({ label: `${name} guard`, held: HELD[name], guard: name, keys: [], hitAt: 0.5, duration: 1, begin: () => {} });
        }

        return all;
    }

    // Do an action, looking at it every `step` of key time and at each of its own keys:
    // look(key time, whether it's one of the action's keys, the fighter)
    function through({ held, guard, seated, keys, hitAt, duration, begin }, look, { step = 0.1, shape } = {}) {
        const fighting = armed(held, shape);
        const { walker, actions } = fighting;

        actions.setSeated(Boolean(seated));
        walker.update(0);

        if (guard) {
            actions.setWeapon(guard);
            actions.setGuard(true);

            for (let k = 0; k < 10; k++) {
                walker.update(0.1);
            }
        }

        begin(actions);

        const own = new Set(keys.map(([time]) => time).filter((time) => time > 0 && time < 2));
        const every = Array.from({ length: Math.round(2 / step) - 1 }, (_, k) => Math.round((k + 1) * step * 1000) / 1000);
        let last = 0;

        for (const key of [...new Set([...every, ...own])].sort((a, b) => a - b)) {
            const time = key <= 1 ? key * hitAt : hitAt + (key - 1) * (duration - hitAt);

            walker.update(time - last);
            last = time;
            look(key, own.has(key), fighting);
        }
    }

    // How far a joint is turned past its range (degrees)
    function beyond(rig, name) {
        const i = rig.index.get(name);
        const turned = rig.frames[human.bones[i].parent].clone().invert().multiply(rig.bones[i].quaternion).multiply(rig.frames[i]);
        const { kind, side } = rig.joints[i];

        return turned.angleTo(limitRotation(kind, side, turned.clone())) / DEG;
    }

    it("keeps every elbow, forearm and wrist in its range through every attack, rest and guard, the shoulders too at the key poses, and turns the hands as the keys ask", () => {
        let shoulders = 0;

        for (const action of everything()) {
            through(action, (key, own, { character, actions }) => {
                for (const side of ["Right", "Left"]) {
                    const at = `${action.label} at ${key}, the ${side.toLowerCase()} arm`;
                    const shoulder = beyond(character.rig, `${side}Arm`);
                    const strain = actions.strain[side.toLowerCase()];

                    assert.ok(beyond(character.rig, `${side}ForeArm`) < 1, `${at}: the elbow and forearm in range`);
                    assert.ok(beyond(character.rig, `${side}Hand`) < 1, `${at}: the wrist in range`);
                    assert.ok(shoulder < (own ? 5 : 20), `${at}: the shoulder ${shoulder.toFixed(0)} degrees past its range`);
                    shoulders = Math.max(shoulders, shoulder);

                    if (own) {
                        // (Strain: how far past their ranges the joints would have to go to reach
                        // and turn the hand exactly as asked)
                        assert.ok(strain < 35, `${at}: strained ${strain.toFixed(0)} degrees`);
                    }
                }
            });
        }

        assert.ok(shoulders > 0, "(the shoulders are measured)");
    });

    // Where a hand's thumb tip is, and its index finger's knuckle, in the hand's own frame
    // (metres: x towards the palm's side, y along the fingers, z towards the thumb's side)
    function thumbOf(rig, Side) {
        const hand = rig.bone(`${Side}Hand`);
        const frame = hand.getWorldQuaternion(new THREE.Quaternion()).multiply(rig.frames[rig.index.get(`${Side}Hand`)]).invert();
        const wrist = hand.getWorldPosition(new THREE.Vector3());
        const local = (point) => {
            const v = point.sub(wrist).applyQuaternion(frame);

            return new THREE.Vector3(Side === "Left" ? -v.x : v.x, -v.y, v.z);
        };
        const i = rig.index.get(`${Side}HandThumb3`);
        const tip = rig.bone(`${Side}HandThumb3`).localToWorld(rig.tails[i].clone().sub(rig.heads[i]));

        return { tip: local(tip), knuckle: local(rig.bone(`${Side}HandIndex1`).getWorldPosition(new THREE.Vector3())) };
    }

    it("closes the fingers and thumb round what's gripped, both fists round a two-handed shaft, and opens them for an open palm", () => {
        for (const [name, held, sides] of [["sword", ["sword"], ["Right"]], ["staff", ["staff"], ["Right", "Left"]], ["hammer", ["warHammer"], ["Right", "Left"]]]) {
            const { character, walker, actions } = armed(held);

            walker.update(0);
            actions.setWeapon(name);
            actions.setGuard(true);

            for (let k = 0; k < 10; k++) {
                walker.update(0.1);
            }

            const item = character.items[0];
            const along = new THREE.Vector3(0, 1, 0).applyQuaternion(item.getWorldQuaternion(new THREE.Quaternion()));
            const from = item.getWorldPosition(new THREE.Vector3());
            const off = (bone) => {
                const v = character.rig.bone(bone).getWorldPosition(new THREE.Vector3()).sub(from);

                return v.addScaledVector(along, -v.dot(along)).length();
            };

            for (const Side of sides) {
                const { tip, knuckle } = thumbOf(character.rig, Side);

                for (const finger of ["Index", "Middle", "Ring", "Pinky"]) {
                    assert.ok(off(`${Side}Hand${finger}2`) < 0.035, `${name}: the ${Side.toLowerCase()} ${finger.toLowerCase()} finger round the grip`);
                }

                assert.ok(tip.x > 0.015, `${name}: the ${Side.toLowerCase()} thumb in front of the palm`);
                assert.ok(tip.z < knuckle.z - 0.03, `${name}: the ${Side.toLowerCase()} thumb across the fingers`);
            }
        }

        // The stun's palm thrust: the hand open at the enemy, the thumb out to the side
        const { character, walker, actions } = armed(["sword"]);

        walker.update(0);
        actions.startAttack("castStun", { hitAt: 0.4, duration: 0.7, variant: 0 });
        walker.update(0.4);

        const { tip, knuckle } = thumbOf(character.rig, "Left");

        assert.ok(tip.z > knuckle.z + 0.03, "the thumb out from the fingers");
    });

    // Each body vertex's heaviest bone, and whether that's a hand's
    const heaviest = Array.from({ length: human.vertexCount }, (_, v) => {
        const weights = [0, 1, 2, 3].map((k) => human.skinWeights[v * 4 + k]);

        return human.skinIndices[v * 4 + weights.indexOf(Math.max(...weights))];
    });
    const onHand = heaviest.map((bone) => /Hand/.test(human.bones[bone].name));

    // Each model's points (once each, in its own frame)
    const pointsOf = new WeakMap();
    const points = (geometry) => {
        if (!pointsOf.has(geometry)) {
            const seen = new Map();
            const position = geometry.attributes.position;

            for (let i = 0; i < position.count; i++) {
                const point = new THREE.Vector3().fromBufferAttribute(position, i);

                seen.set(point.toArray().map((c) => Math.round(c * 500)).join(" "), point);
            }

            pointsOf.set(geometry, [...seen.values()]);
        }

        return pointsOf.get(geometry);
    };

    // How deep the deepest point of what's held is under the skin (metres; below 0, clear of it):
    // each point of its models against the nearest point of the posed body's skin, unless that's
    // a hand's (the hands hold it)
    function sunk(character) {
        const { rig, positions, normals } = character;
        const CELL = 0.05;
        const cellOf = (p) => (Math.floor(p.x / CELL) + 512) * 1048576 + (Math.floor(p.y / CELL) + 512) * 1024 + (Math.floor(p.z / CELL) + 512);
        const near = [-1, 0, 1].flatMap((dx) => [-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dz) => dx * 1048576 + dy * 1024 + dz)));
        const held = [];
        const around = new Set();
        const cells = new Map();
        const point = new THREE.Vector3();

        character.object.updateMatrixWorld(true);

        // Where what's held is, and the cells round it
        for (const model of character.items) {
            model.traverse((mesh) => {
                for (const local of mesh.isMesh ? points(mesh.geometry) : []) {
                    const q = local.clone().applyMatrix4(mesh.matrixWorld);

                    held.push(q);
                    near.forEach((step) => around.add(cellOf(q) + step));
                }
            });
        }

        // The skin there (roughly where each vertex is first, by its heaviest bone)
        const matrices = rig.bones.map((bone, i) => bone.matrixWorld.clone().multiply(rig.skeleton.boneInverses[i]));

        for (let v = 0; v < human.vertexCount; v++) {
            if (human.partOf[v] !== 0 || !around.has(cellOf(point.fromArray(positions, v * 3).applyMatrix4(matrices[heaviest[v]])))) {
                continue;
            }

            const at = new THREE.Vector3();
            const normal = new THREE.Vector3();

            for (let k = 0; k < 4; k++) {
                const weight = human.skinWeights[v * 4 + k] / 255;
                const matrix = matrices[human.skinIndices[v * 4 + k]];

                if (weight) {
                    at.addScaledVector(point.fromArray(positions, v * 3).applyMatrix4(matrix), weight);
                    normal.addScaledVector(point.fromArray(normals, v * 3).transformDirection(matrix), weight);
                }
            }

            const cell = cellOf(at);

            cells.set(cell, [...(cells.get(cell) ?? []), { at, normal: normal.normalize(), hand: onHand[v] }]);
        }

        let deepest = -Infinity;

        for (const q of held) {
            let nearest = null;
            let best = Infinity;

            for (const step of near) {
                for (const skin of cells.get(cellOf(q) + step) ?? []) {
                    const distance = skin.at.distanceToSquared(q);

                    if (distance < best) {
                        best = distance;
                        nearest = skin;
                    }
                }
            }

            if (nearest && !nearest.hand) {
                deepest = Math.max(deepest, nearest.at.clone().sub(q).dot(nearest.normal));
            }
        }

        return deepest;
    }

    it("keeps what's held out of its own body: a staff's or hammer's butt and a bow's limbs pass beside the legs, not through them", () => {
        // (On the hero's build and the default one; the cleaver, the orcs' weapon, on an orc's)
        const builds = { sword: [PRESETS.hero, null], staff: [PRESETS.hero, null], wand: [PRESETS.hero, null], hammer: [PRESETS.hero, null], bow: [PRESETS.hero, null], cleaver: [PRESETS.orc] };

        for (const action of everything().filter(({ label }) => builds[label.split(" ")[0]])) {
            for (const build of builds[action.label.split(" ")[0]]) {
                through(action, (key, own, { character }) => {
                    const depth = sunk(character);

                    assert.ok(depth < 0.02, `${action.label} at ${key}${build ? "" : " (the default build)"}: ${(depth * 100).toFixed(0)} cm into the body`);
                }, { shape: build?.shape });
            }
        }
    });
});
