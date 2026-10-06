// Attacks, flinches and falls (client/js/characters/actions.js), on the real body
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import { Actions, ATTACKS, DODGES, DRAWS, FALLS, GUARD_SWAYS, GUARDS, REACTIONS, RESTS } from "../client/js/characters/actions.js";
import { CLIP_HEIGHT, CLIP_KEYS } from "../client/js/characters/clip-keys.js";
import { Character, placed, slung } from "../client/js/characters/character.js";
import { groundPoints, lowestPoint } from "../client/js/characters/grounding.js";
import { Walker, WALK_STYLES } from "../client/js/characters/locomotion.js";
import { PRESETS } from "../client/js/characters/presets.js";
import { ITEMS, SLING, socketOn } from "../client/js/characters/equipment.js";
import { buildItem } from "../client/js/characters/items.js";
import { limitRotation, Rig } from "../client/js/characters/rig.js";
import { Battle, STEP_MS } from "../client/js/core/battle.js";
import { PLAYER_RESTS_AFTER, REST_EVERY, ROLES } from "../client/js/core/roles.js";
import { pickAnother, Variety } from "../client/js/core/variety.js";
import { STARTING_WEAPONS, WEAPONS } from "../client/js/core/weapons.js";
import { Avatar, POSING, posingEvery } from "../client/js/world/avatar.js";
import { folkLook } from "../client/js/characters/folk.js";
import { BODIES, dress, FRAME } from "../client/js/characters/motioncheck.js";
import { soldierLook } from "../client/js/characters/soldiers.js";
import { readHumanData } from "../scripts/lib/human-data.js";

// (The game's body: body.js GAME_BODY)
const human = readHumanData();

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
// hand's hold (equipment.js); and putting its weapons away as a Character does
function fighter(shape, held = [], { phase = 0 } = {}) {
    const character = figure(shape);

    character.equipment = new Map();

    for (const method of ["sheathe", "sling", "arrange", "showOffHand", "sheathPose", "settle"]) {
        character[method] = Character.prototype[method].bind(character);
    }

    Object.defineProperty(character, "slings", Object.getOwnPropertyDescriptor(Character.prototype, "slings"));

    for (const id of held) {
        const item = ITEMS[id];
        const socket = socketOn(character, item.socket);
        const model = buildItem(item.model, socket.fit);

        // (A shield that's slung on the back, where it goes: measured as it is, before it's put on the arm)
        model.userData.sling = item.sling ? slung(socketOn(character, SLING.socket), model) : null;
        model.name = id;
        model.position.copy(socket.position);
        model.quaternion.copy(socket.quaternion);

        if (item.turn) {
            model.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...item.turn)));
        }

        character.rig.bone(socket.bone).add(model);
        character.items.push(model);
        character.holds[/left|Left/.test(item.socket) ? "Left" : "Right"] = { ...item.hold, grips: item.grips };
        character.equipment.set(item.slot, id);
        model.userData.home = { bone: socket.bone, position: model.position.clone(), quaternion: model.quaternion.clone() };
        model.userData.hand = /^(left|right)Hand$/.test(item.socket) ? (item.socket.startsWith("left") ? "Left" : "Right") : null;

        if (item.sheath && !item.sheath.worn) {
            model.userData.sheath = placed(socketOn(character, item.sheath.socket), item.sheath);
        }
    }

    const walker = new Walker(character, WALK_STYLES.natural);
    const actions = new Actions(character, { phase });

    walker.overlay = (dt, walking) => actions.apply(dt, walking);
    walker.afterPose = () => actions.place();
    walker.freed = (side) => actions.free[side];

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
    it("has at least five ways of doing every weapon's attack and every spell, each timed with 1 as the blow and 2 as the end", () => {
        const names = [...new Set(Object.values(WEAPONS).flatMap(({ attacks }) => attacks.map(({ animation }) => animation))), "castHeal", "castStun"];

        for (const name of names) {
            const { variants } = ATTACKS[name] ?? {};

            assert.ok(variants?.length >= 5, `${name} has five ways`);
            assert.equal(new Set(variants.map((variant) => variant.name)).size, variants.length, `${name}'s ways have their own names`);

            for (const { name: way, keys, clip } of variants) {
                const times = keys.map(([time]) => time);

                assert.equal(times[0], 0);
                assert.ok(times.includes(1), `${name} (${way}) has a key at the blow`);
                assert.equal(times.at(-1), 2);
                assert.ok(times.every((time, k) => k === 0 || time > times[k - 1]), `${name} (${way})'s keys in order`);
                // (A clip's ends where the clip does: eased out of before then)
                if (!clip) {
                    assert.deepEqual(keys[0][1], keys.at(-1)[1], `${name} (${way}) ends as it starts`);
                }
            }

            // Each way really is different where the blow lands
            const blows = variants.map(({ keys }) => JSON.stringify(keys.find(([time]) => time === 1)[1]));

            assert.equal(new Set(blows).size, variants.length, `${name}'s blows all differ`);
        }
    });

    it("plays animators' clips as key poses: each baked clip's every key a value for every channel, timed from 0 through the blow to 2, and in an attack, a rest, a guard's sway, a flinch or a dodge", () => {
        assert.ok(CLIP_HEIGHT > 1.5 && CLIP_HEIGHT < 1.9);

        for (const [clip, { channels, keys, hit, seconds }] of Object.entries(CLIP_KEYS)) {
            const times = keys.map(([time]) => time);

            assert.ok(hit > 0 && hit < seconds, `${clip}: the blow inside it`);
            assert.equal(new Set(channels).size, channels.length, `${clip}: each channel once`);
            assert.ok(keys.every((key) => key.length === channels.length + 1), `${clip}: a value for every channel`);
            assert.ok(keys.every((key) => key.slice(1).every((value, c) => (channels[c].endsWith(".shape") ? typeof value === "string" : Number.isFinite(value)))), `${clip}: numbers (and hands' shapes)`);
            assert.deepEqual([times[0], times.at(-1)], [0, 2], `${clip}: from 0 to 2`);
            assert.ok(times.includes(1) && times.every((time, k) => k === 0 || time > times[k - 1]), `${clip}: in order, through the blow`);

            // (The body and hands, the pelvis kept over the feet: no legs but a kicking one)
            assert.ok(channels.includes("Spine2.turn") && channels.includes("right.at.2") && channels.includes("offset.1"), clip);
            assert.ok(channels.filter((channel) => /(UpLeg|Leg|Foot|ToeBase)\./.test(channel)).every((channel) => channel.startsWith("Right")), `${clip}: only a kicking leg`);
        }

        const clipped = [...Object.values(ATTACKS).flatMap(({ variants }) => variants), ...Object.values(RESTS).flat()].flatMap(({ clip }) => (clip ? [clip] : [])).concat(Object.values(GUARD_SWAYS).map(({ clip }) => clip), Object.values(REACTIONS).flatMap(({ clips = [] }) => clips), Object.values(DODGES));

        assert.deepEqual([...new Set(clipped)].sort(), Object.keys(CLIP_KEYS).sort(), "every baked clip played");
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
            for (let variant = 0; variant < ATTACKS[name].variants.length; variant++) {
                const { character, shoulders, arm, right } = atTheBlow(name, variant, { shape: name === "cleaver" ? PRESETS.orc.shape : undefined });
                const way = `${name} (${ATTACKS[name].variants[variant].name})`;

                assert.ok(right.z > shoulders.right.z + arm * 0.45, `${way}: forward ${(right.z - shoulders.right.z).toFixed(2)} m`);
                assert.ok(right.y > character.height * 0.4 && right.y < character.height * 1.05, `${way}: at ${right.y.toFixed(2)} m`);
            }
        }
    });

    it("lets go of every bolt, fireball and stun from a hand held out towards the enemy, draws every bow to the face, and raises every heal", () => {
        for (const [name, hand] of [["wand", "right"], ["grimoire", "right"], ["castStun", "left"]]) {
            for (let variant = 0; variant < ATTACKS[name].variants.length; variant++) {
                const blow = atTheBlow(name, variant);

                assert.ok(blow[hand].z > blow.shoulders[hand].z + blow.arm * 0.6, `${name} ${variant}: held out ${(blow[hand].z - blow.shoulders[hand].z).toFixed(2)} m`);
            }
        }

        for (let variant = 0; variant < ATTACKS.bow.variants.length; variant++) {
            const bow = atTheBlow("bow", variant, { hitAt: 0.66, duration: 1 });

            assert.ok(bow.left.z > bow.shoulders.left.z + bow.arm * 0.5, `bow ${variant}: the bow held out`);
            assert.ok(bow.right.distanceTo(bow.head) < 0.35, `bow ${variant}: drawn to the face (${bow.right.distanceTo(bow.head).toFixed(2)} m)`);
        }

        for (let variant = 0; variant < ATTACKS.castHeal.variants.length; variant++) {
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
            for (let variant = 0; variant < ATTACKS[name].variants.length; variant++) {
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

        // (The straight each time: a hook lands no further out than the lead fist's guard)
        for (let k = 0; k < 2; k++) {
            actions.startAttack("punch", { hitAt: hitAt / 1000, duration: duration / 1000, variant: 0 });
            walker.update(hitAt / 1000);
            reach.push(world("RightHand", character).z - world("LeftHand", character).z);
            walker.update(duration / 1000);
        }

        assert.ok(reach[0] > 0.15, "the right fist out first");
        assert.ok(reach[1] < -0.15, "then the left");
    });

    it("kicks every way, with the right leg and the left in turn: the foot off the ground and out at the enemy, the standing foot staying put", () => {
        const { hitAt, duration } = WEAPONS.boots.attacks[0];

        for (let variant = 0; variant < ATTACKS.kick.variants.length; variant++) {
            for (const mirror of [false, true]) {
                const { character, walker, actions } = fighter();

                walker.update(0);

                for (let k = 0; k < 10; k++) {
                    walker.update(0.05);
                }

                actions.attacks = mirror ? 1 : 0;
                actions.startAttack("kick", { hitAt: hitAt / 1000, duration: duration / 1000, variant });

                const kicking = actions.attack.mirror ? "Left" : "Right";
                const standing = kicking === "Left" ? "Right" : "Left";
                // (The standing foot pivots on its heel or the ball of the foot as the body turns:
                // that stays put, or slides a little where the leg would have to stretch)
                const pivots = () => ["heel", "ball"].map((which) => walker.footPoint(standing === "Left" ? 0 : 1, which).clone());
                const before = pivots();
                const label = `${ATTACKS.kick.variants[variant].name} (${kicking.toLowerCase()} leg)`;

                assert.equal(actions.attack.mirror, mirror, label);

                for (let t = 0; t < hitAt / 1000 - 1e-6; t += 1 / 60) {
                    walker.update(Math.min(1 / 60, hitAt / 1000 - t));
                }

                const toe = world(`${kicking}ToeBase`, character);
                const slid = Math.min(...pivots().map((point, k) => Math.hypot(point.x - before[k].x, point.z - before[k].z)));

                assert.equal(actions.free[kicking], 1, `${label}: its foot let go of the ground`);
                assert.equal(actions.free[standing], 0, `${label}: the other not`);
                assert.ok(toe.z > 0.6 && toe.y > 0.2, `${label}: kicking out in front (${toe.toArray().map((v) => v.toFixed(2))})`);
                assert.ok(slid < 0.07, `${label}: the standing foot stays put (${slid.toFixed(3)})`);

                for (let t = 0; t < (duration - hitAt) / 1000 + 0.2; t += 1 / 30) {
                    walker.update(1 / 30);
                }

                assert.ok(world(`${kicking}Foot`, character).y < 0.12, `${label}: back down`);
            }
        }
    });

    it("sways on guard as an animator's fighting idle does, standing: the chest and sword hand going round a loop, each fighter at its own place in it, and not walking", () => {
        // Where the chest and the sword hand are on the body (metres, in its own frame; the hand
        // from its shoulder), a tenth of a second at a time over two seconds on guard, at `speed`
        const swaying = (phase, speed) => {
            const { character, walker, actions } = fighter(undefined, ["sword"], { phase });
            const local = (bone) => character.object.worldToLocal(world(bone, character));

            actions.setWeapon("sword");
            actions.setGuard(true);
            walker.update(1, { speed });

            return Array.from({ length: 20 }, () => {
                walker.update(0.1, { speed });

                return { chest: local("Spine2"), hand: local("RightHand").sub(local("RightArm")) };
            });
        };
        const spread = (points) => Math.max(...["x", "y", "z"].map((axis) => Math.max(...points.map((p) => p[axis])) - Math.min(...points.map((p) => p[axis]))));
        const standing = swaying(0, 0);
        const other = swaying(0.5, 0);

        assert.ok(spread(standing.map(({ chest }) => chest)) > 0.02, "the weight shifts");
        assert.ok(spread(standing.map(({ hand }) => hand)) > 0.02, "the sword hand goes, from the shoulder");
        assert.ok(standing.some(({ chest }, k) => chest.distanceTo(other[k].chest) > 0.01), "another fighter at another place in it");

        // (Walking, the walk's own: the same for both)
        const walking = swaying(0, 1.3);
        const otherWalking = swaying(0.5, 1.3);

        assert.ok(walking.every(({ chest, hand }, k) => chest.distanceTo(otherWalking[k].chest) < 1e-6 && hand.distanceTo(otherWalking[k].hand) < 1e-6), "no sway walking");
    });

    it("kicks with a weapon in hand without moving the hands off guard", () => {
        const { character, walker, actions } = fighter(undefined, ["sword"]);
        const { hitAt, duration } = WEAPONS.boots.attacks[0];

        actions.setWeapon("sword");
        actions.setGuard(true);

        for (let k = 0; k < 10; k++) {
            walker.update(0.1);
        }

        const guard = world("RightHand", character).sub(world("RightArm", character));

        actions.startAttack("kick", { hitAt: hitAt / 1000, duration: duration / 1000, variant: 0, arms: false });
        walker.update(hitAt / 1000);

        assert.ok(world("RightHand", character).sub(world("RightArm", character)).distanceTo(guard) < 0.08, "the sword hand where it was, from the shoulder");
        assert.equal(actions.free.Right, 1);
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

describe("drawing weapons and putting them away (actions.js DRAWS, Character.sheathe)", () => {
    it("has a draw ending on guard and a put-away ending with the hands free for every weapon, the hand taking hold at key time 1", () => {
        for (const id of [...STARTING_WEAPONS, "cleaver"]) {
            const guard = WEAPONS[id].attacks[0].animation;
            const { draw, sheathe } = DRAWS[guard] ?? {};

            assert.ok(draw && sheathe, id);

            for (const how of [draw, sheathe]) {
                assert.ok(how.hitAt > 0 && how.hitAt < how.duration && how.duration < 2.5, `${id}: timing`);
                assert.deepEqual(how.keys.map(([time]) => time).filter((time) => time <= 0 || time >= 2), [0, 2], `${id}: keys from 0 to 2`);
            }

            assert.equal(draw.keys.at(-1)[1].right, GUARDS[guard].right, `${id}: drawn to its guard`);
            assert.ok(!sheathe.keys.at(-1)[1].right && !sheathe.keys.at(-1)[1].left, `${id}: put away, the hands free`);
        }
    });

    it("takes a sword from its scabbard into the hand as the hand gets there, and puts it back", () => {
        const { character, walker, actions } = fighter(undefined, ["sword"]);
        const sword = character.items[0];
        const { draw, sheathe } = DRAWS.sword;

        character.sheathe(true);
        walker.update(0);
        assert.equal(sword.parent.name, "Hips");
        assert.equal(character.holds.Right, undefined, "the hand empty");

        const took = actions.draw("sword", true);

        assert.equal(took, draw.duration);
        walker.update(draw.hitAt - 0.05);
        assert.equal(sword.parent.name, "Hips", "not yet");

        // (Where it's put away, the hand's there too)
        const hand = world("RightHand", character);
        const away = character.sheathPose("Right").position;

        walker.update(0.1);
        assert.equal(sword.parent.name, "RightHand");
        assert.ok(hand.distanceTo(away) < 0.2, "the hand at the hilt");
        assert.ok(character.holds.Right?.grips, "gripped");

        for (let t = 0; t < took; t += 0.1) {
            walker.update(0.1);
        }

        assert.equal(actions.attack, null);
        assert.ok(!character.sheathed);

        // Put away
        actions.draw("sword", false);
        walker.update(sheathe.hitAt + 0.05);
        assert.equal(sword.parent.name, "Hips");
        assert.ok(character.sheathed && !character.holds.Right);
    });

    it("finishes drawing or putting away at once if something else is done meanwhile", () => {
        const { character, walker, actions } = fighter(undefined, ["warHammer"]);
        const hammer = character.items[0];

        character.sheathe(true);
        walker.update(0);
        assert.equal(hammer.parent.name, "Spine2", "on the back");

        actions.draw("hammer", true);
        walker.update(0.1);
        actions.startAttack("hammer", { hitAt: 0.64, duration: 1.1 });
        assert.equal(hammer.parent.name, "RightHand");
        assert.ok(!character.sheathed);

        actions.draw("hammer", false);
        walker.update(0.1);
        actions.die();
        assert.equal(hammer.parent.name, "Spine2");
        assert.ok(character.sheathed);
    });

    it("says of every shield whether it's slung on the back: round, kite and leaf shields, not hide on a stick or a spiked long kite", () => {
        const shields = Object.entries(ITEMS).filter(([, item]) => item.slot === "offHand" && /^left(Forearm|Fist)$/.test(item.socket));

        assert.ok(shields.length >= 8);

        for (const [id, item] of shields) {
            assert.equal(typeof item.sling, "boolean", `${id}: a new shield says`);
        }

        assert.deepEqual(shields.filter(([, item]) => !item.sling).map(([id]) => id).sort(), ["shield.cat", "shield.darkElf"]);
    });

    it("takes a slung shield off the back before drawing the sword, and slings it there again after putting the sword away", () => {
        const { character, walker, actions } = fighter(undefined, ["sword", "kiteShield"]);
        const [sword, shield] = character.items;
        const { home, sling } = shield.userData;

        character.sheathe(true);
        walker.update(0);
        assert.equal(shield.parent.name, sling.bone, "slung");
        assert.ok(character.slung);

        // Drawn: the shield onto the arm first, then the sword
        const took = actions.draw("sword", true);

        assert.ok(Math.abs(took - DRAWS.sling.draw.duration - DRAWS.sword.draw.duration) < 1e-9);
        walker.update(DRAWS.sling.draw.hitAt + 0.05);
        assert.equal(shield.parent.name, home.bone, "on the arm");
        assert.equal(sword.parent.name, "Hips", "the sword not yet");

        for (let t = DRAWS.sling.draw.hitAt + 0.05; t < took + 0.1; t += 0.1) {
            walker.update(0.1);
        }

        assert.equal(sword.parent.name, "RightHand");
        assert.equal(actions.attack, null);
        assert.ok(!character.sheathed && !character.slung);

        // Put away: the sword first, then the shield onto the back
        const away = actions.draw("sword", false);

        walker.update(DRAWS.sword.sheathe.hitAt + 0.05);
        assert.equal(sword.parent.name, "Hips");
        assert.equal(shield.parent.name, home.bone, "the shield not yet");

        for (let t = DRAWS.sword.sheathe.hitAt + 0.05; t < away + 0.1; t += 0.05) {
            walker.update(0.05);
        }

        assert.equal(shield.parent.name, sling.bone, "slung again");
        assert.ok(character.sheathed && character.slung);

        // Something else done meanwhile: all of it at once
        actions.draw("sword", true);
        walker.update(0.1);
        actions.startAttack("sword", { hitAt: 0.4, duration: 0.8 });
        assert.equal(shield.parent.name, home.bone);
        assert.equal(sword.parent.name, "RightHand");
    });

    it("keeps a shield that can't be slung on the arm, drawing only the sword", () => {
        const { character, walker, actions } = fighter(undefined, ["sword", "shield.darkElf"]);
        const shield = character.items[1];

        character.sheathe(true);
        walker.update(0);
        assert.equal(shield.userData.sling, null);
        assert.equal(shield.parent.name, shield.userData.home.bone);
        assert.ok(!character.slung);
        assert.equal(actions.draw("sword", true), DRAWS.sword.draw.duration);
    });
});

describe("a blade hung at the hip (equipment.js SHEATHS, Character.hang, Actions: the hand on its pommel)", () => {
    // A soldier of `body`'s build carrying `weapon`, the shield slung (or not, `shield`)
    const soldier = (body, weapon = "sword", { shield = true } = {}) => {
        const look = soldierLook({ people: body.people, weapon, sex: body.sex, seed: 11 });
        const shape = structuredClone(look.shape);

        Object.assign(shape.macro, body.macro);

        if (body.belly !== null) {
            shape.details = { ...shape.details, belly: body.belly };
        }

        return dress(human, { ...look, shape, equipment: look.equipment.filter((id) => shield || !/shield/i.test(id)) });
    };
    const blade = (character) => character.items.find((model) => model.userData.hangs);
    // (Where the left hand grips, in the world)
    const grip = (character) => character.rig.bone("LeftHand").localToWorld(socketOn(character, "leftHand").position.clone());
    const walk = (walker, speed, seconds) => {
        for (let t = 0; t < seconds; t += FRAME) {
            walker.update(FRAME, { speed });
        }
    };

    it("hangs a sword or cleaver from its frog round the front of the hip, canted 45° down and back past the thigh, as tight to every body as it can be", () => {
        for (const body of BODIES) {
            for (const weapon of ["sword", "cleaver"]) {
                const { character, walker } = soldier(body, weapon);
                const model = blade(character);

                walker.update(FRAME, { speed: 0 });

                const hips = character.rig.bone("Hips");
                const turn = hips.getWorldQuaternion(new THREE.Quaternion());
                const along = new THREE.Vector3(0, 1, 0).applyQuaternion(turn.clone().multiply(model.quaternion));
                const frame = turn.clone().invert();
                const [down, back] = [-along.clone().applyQuaternion(frame).y, -along.clone().applyQuaternion(frame).z];
                const cant = (Math.atan2(back, down) * 180) / Math.PI;
                const hilt = character.pommelOf("Left").position.applyQuaternion(frame);
                const side = world("LeftUpLeg", character).applyQuaternion(frame);

                assert.ok(cant > 38 && cant < 55, `${body.id} ${weapon}: canted ${cant.toFixed(0)}°`);
                assert.ok(hilt.z > side.z + 0.08, `${body.id} ${weapon}: the hilt forward of the hip`);
                assert.ok(model.userData.hangs.stand <= 0.06, `${body.id} ${weapon}: off the belt ${(model.userData.hangs.stand * 100).toFixed(1)} cm`);
            }
        }
    });

    it("rests the left hand on the pommel walking and running, the blade held back off the legs, and lets it fall to the side standing", () => {
        for (const body of BODIES.filter(({ people }) => people === "human")) {
            const { character, walker } = soldier(body);
            const hangs = blade(character).userData.hangs;

            for (const speed of [1.3, 3.5]) {
                walk(walker, speed, 1.5);
                assert.ok(character.held > 0.99, `${body.id} at ${speed} m/s: holding it`);
                assert.ok(hangs.angle >= (4 * Math.PI) / 180, `${body.id} at ${speed} m/s: tipped back`);

                // (On it through a stride: running, the tallest's shoulder lets the hand come off
                // it a little for a moment as the hips turn)
                const off = [];

                for (let t = 0; t < 1; t += FRAME) {
                    walker.update(FRAME, { speed });
                    off.push(grip(character).distanceTo(character.pommelOf("Left").position));
                }

                assert.ok(off.reduce((sum, d) => sum + d, 0) / off.length < 0.025, `${body.id} at ${speed} m/s: the hand on the pommel`);
                assert.ok(Math.max(...off) < 0.045, `${body.id} at ${speed} m/s: the hand never far off it`);
            }

            // (Slowing to a stop from a run takes a second and a half)
            walk(walker, 0, 2.5);
            assert.ok(character.held < 0.01, `${body.id}: let go standing`);
            assert.ok(grip(character).distanceTo(character.pommelOf("Left").position) > 0.15, `${body.id}: the hand fallen to the side`);
        }
    });

    it("keeps the hand off it with a shield on the arm, or the sword drawn", () => {
        const [body] = BODIES;
        const shielded = soldier({ ...body, people: "darkElf" });

        walk(shielded.walker, 1.3, 1.5);
        assert.ok(!shielded.character.slung && shielded.character.held === 0, "a dark elf's shield stays on the arm");

        const drawn = soldier(body);

        drawn.character.sheathe(false);
        walk(drawn.walker, 1.3, 1.5);
        assert.equal(drawn.character.held, 0, "nothing to hold in the scabbard");
    });

    it("rests the hand on the pommel shifting the weight, armed; without a blade at the hip, the thumb in the belt", () => {
        const variant = ROLES.adventurer.rests.findIndex(({ name }) => name === "shifting the weight");

        for (const [calling, armed] of [["warrior", true], ["mage", false]]) {
            const { character, walker, actions } = dress(human, folkLook({ role: "adventurer", look: calling, sex: "m", seed: 5 }));

            actions.rest("adventurer", { variant });
            walk(walker, 0, 1);

            const pommel = character.pommelOf?.("Left");

            assert.equal(Boolean(pommel), armed, `${calling}: a blade at the hip`);

            if (armed) {
                assert.ok(grip(character).distanceTo(pommel.position) < 0.03, `${calling}: the hand on the pommel`);
            } else {
                assert.ok(grip(character).distanceTo(world("Hips", character)) < 0.35, `${calling}: the hand at the belt`);
            }
        }
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

    it("flinches each way in turn, keyed and as the animators' hits do, and settles back", () => {
        const { character, walker, actions } = fighter();

        walker.update(0);

        const head = world("Head", character);
        const ways = [];

        for (let k = 0; k < 6; k++) {
            actions.react("punch", { from: 0 });
            ways.push(actions.reactions[0].move ? "clip" : "keyed");
            walker.update(REACTIONS.punch.length * 0.5);
            assert.ok(world("Head", character).distanceTo(head) > 0.01, `${ways.at(-1)}: the head moves`);
            walker.update(REACTIONS.punch.length * 0.6);
            assert.equal(actions.reactions.length, 0);
            assert.ok(world("Head", character).distanceTo(head) < 0.01, `${ways.at(-1)}: back as it was`);
        }

        assert.ok(ways.every((way, k) => k === 0 || way !== ways[k - 1]), "never the same way twice running");
    });

    it("slips a blow, ducking under it aside away from it (from ahead either way) or swaying back, the feet where they were, and comes back to guard", () => {
        // How far the head is from where it'd be on guard (another fighter, swaying the same, not
        // dodging), in the body's own frame, a tenth of a second at a time; how far a foot slid;
        // and whether it's back on guard after
        const slipping = (options) => {
            const [dodging, still] = [0, 1].map(() => fighter(undefined, ["sword"]));

            for (const { walker, actions } of [dodging, still]) {
                actions.setWeapon("sword");
                actions.setGuard(true);
                walker.update(1, { speed: 0 });
            }

            const head = ({ character }) => character.object.worldToLocal(world("Head", character));
            const feet = ["LeftFoot", "RightFoot"].map((bone) => world(bone, dodging.character));

            dodging.actions.dodge(options);

            const moved = Array.from({ length: 10 }, () => {
                dodging.walker.update(0.1, { speed: 0 });
                still.walker.update(0.1, { speed: 0 });

                return head(dodging).sub(head(still));
            });
            const slid = Math.max(...["LeftFoot", "RightFoot"].map((bone, i) => world(bone, dodging.character).distanceTo(feet[i])));

            dodging.walker.update(0.5, { speed: 0 });
            still.walker.update(0.5, { speed: 0 });

            return { moved, slid, done: dodging.actions.dodging === null, back: head(dodging).distanceTo(head(still)) };
        };
        const most = (moved, axis) => moved.reduce((best, p) => (Math.abs(p[axis]) > Math.abs(best) ? p[axis] : best), 0);
        const fromRight = slipping({ from: -Math.PI / 2 });
        const fromLeft = slipping({ from: Math.PI / 2 });

        assert.ok(Math.sign(most(fromRight.moved, "x")) === -Math.sign(most(fromLeft.moved, "x")) && Math.abs(most(fromLeft.moved, "x")) > 0.03, "aside, away from either side");

        for (const way of ["left", "right", "back"]) {
            const { moved, slid, done, back } = slipping({ way });

            assert.ok(Math.max(...moved.map((p) => p.length())) > 0.15, `${way}: the head out of the way`);
            assert.ok(way === "back" ? most(moved, "z") < -0.1 : most(moved, "y") < -0.1, `${way}: ${way === "back" ? "back" : "ducking"}`);
            assert.ok(slid < 0.01, `${way}: the feet where they were (${slid.toFixed(3)} m)`);
            assert.ok(done && back < 0.01, `${way}: back on guard`);
        }
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

    // Where a body's lowest point is, and each arm's, off the ground (metres), as it's posed now
    const lowest = (character) => {
        const arms = [new THREE.Vector3(), new THREE.Vector3()];

        character.object.updateMatrixWorld(true);

        return { body: lowestPoint(character.rig, character.positions, groundPoints(human), arms), arms: arms.map(({ y }) => y) };
    };

    it("falls dead back, or onto its knees and over onto its face, whole, and lies on the ground whatever its build; then gets up", () => {
        for (const shape of [{}, { macro: { gender: 0, height: 0.15, muscle: 0.3, weight: 0.3 } }, PRESETS.orc.shape]) {
            for (const [clip, mirror, ahead] of [["deathBack", false, -1], ["deathBack", true, -1], ["deathFront", false, 1], ["deathFront", true, 1]]) {
                const { character, walker, actions } = fighter(shape);
                const lands = actions.die({ from: 0, way: { clip, mirror } });
                let [standing, down] = [0, Infinity];

                for (let t = 0; t < FALLS[clip].seconds + 0.5; t += 1 / 30) {
                    walker.update(1 / 30);

                    // (The body never in the ground, nor an arm, as it goes down: but for a sole,
                    // by up to three centimetres, as a heel lifts standing on its planted foot or a
                    // foot's let go of as the body sinks onto it)
                    const low = lowest(character);

                    assert.ok(low.body > -0.03 && Math.min(...low.arms) > -0.02, `${clip}: ${low.body.toFixed(3)}, arms ${low.arms.map((y) => y.toFixed(3))} at ${t.toFixed(2)} s`);
                    standing = t < 0.1 ? Math.max(standing, world("Hips", character).y) : standing;
                    down = Math.min(down, world("Spine2", character).y);
                }

                const what = `${clip}${mirror ? " mirrored" : ""} (${JSON.stringify(shape.macro ?? {})})`;

                assert.ok(lands > 0.5 && lands < FALLS[clip].seconds, what);
                assert.ok(world("Hips", character).y < standing * 0.3 && world("Head", character).y < 0.35, `${what}: lying, hips at ${world("Hips", character).y.toFixed(2)}, head at ${world("Head", character).y.toFixed(2)}`);
                assert.ok(lowest(character).body < 0.01, `${what}: on the ground, not over it`);
                assert.ok(Math.sign(world("Head", character).z) === ahead && Math.abs(world("Head", character).z) > 0.5, `${what}: head at ${world("Head", character).z.toFixed(2)}`);
                assert.ok(world("Spine2", character).y < down + 0.06, `${what}: lying still`);

                actions.revive();
                walker.release();
                walker.update(0.05);
                assert.ok(world("Head", character).y > character.height * 0.85);
            }
        }
    });

    it("falls back from a blow in front, either way, and forward from one behind, turned towards it", () => {
        const { character, walker, actions } = fighter();
        const ways = new Set();

        for (let k = 0; k < 12; k++) {
            actions.revive();
            actions.die({ from: 0 });
            ways.add(actions.fall.parts[0].clip === FALLS.deathBack ? "back" : "front");
        }

        assert.deepEqual([...ways].sort(), ["back", "front"]);

        actions.revive();
        actions.die({ from: Math.PI, way: { mirror: false } });
        assert.equal(actions.fall.parts[0].clip, FALLS.deathFront, "forward, from behind");

        for (let t = 0; t < 4.8; t += 0.05) {
            walker.update(0.05);
        }

        assert.ok(world("Head", character).z > 0.5, "onto its face, away from the blow behind");
    });

    it("keeps each foot where it stands while the clip's stands, steps where it steps, and is knocked off its feet and up again by when it's let up", () => {
        const { character, walker, actions } = fighter();

        for (let t = 0; t < 1; t += 0.05) {
            walker.update(0.05);
        }

        // (Sinking to its knees, the feet planted where they were, never sliding)
        const planted = walker.feet.map(({ lock }) => lock.clone());

        actions.die({ from: 0, way: { clip: "deathFront", mirror: false } });

        for (let t = 0; t < 1.8; t += 1 / 30) {
            walker.update(1 / 30);
            walker.feet.forEach((foot, i) => {
                assert.ok(foot.planted && foot.lock.distanceTo(planted[i]) < 0.005, `foot ${i} at ${t.toFixed(2)} s`);
                assert.ok(Math.abs(walker.footHeight(i)) < 0.01);
            });
        }

        // Knocked down: thrown onto its back, and up again, the feet planted under it, by when
        // it's let up (if that's not too soon: then a little after)
        for (const seconds of [1.5, 2.5, 0.9]) {
            actions.revive();
            walker.release();

            for (let t = 0; t < 0.5; t += 0.05) {
                walker.update(0.05);
            }

            const standing = world("Hips", character).y;

            actions.knockdown({ from: 0, seconds });

            let lowestHips = Infinity;
            let t = 0;

            for (; actions.fall; t += 1 / 30) {
                walker.update(1 / 30);
                lowestHips = Math.min(lowestHips, world("Hips", character).y);
                assert.ok(lowest(character).body > -0.01, `in the ground at ${t.toFixed(2)} s`);
            }

            assert.ok(lowestHips < 0.3, `thrown down: ${lowestHips.toFixed(2)}`);
            assert.ok(t <= Math.max(seconds, FALLS.knockedDown.lands + 0.15 + FALLS.gettingUp.seconds / 1.6) + 0.05, `up by ${t.toFixed(2)} s for ${seconds}`);
            assert.ok(world("Hips", character).y > standing - 0.08, "standing again");
            assert.ok(walker.feet.every((foot) => foot.planted), "on its feet");
        }
    });

    it("lets go of what's in its hands dying, each lying on the ground beside it, and takes it back alive", () => {
        const { character, walker, actions } = fighter({}, ["sword", "roundShield"]);

        for (const method of ["drop", "pickUp"]) {
            character[method] = Character.prototype[method].bind(character);
        }

        actions.die({ from: 0, way: { clip: "deathBack", mirror: false } });

        for (let t = 0; t < 3; t += 1 / 30) {
            walker.update(1 / 30);
        }

        for (const id of ["sword", "roundShield"]) {
            const model = character.items.find((item) => item.name === id);
            const box = new THREE.Box3().setFromObject(model);

            assert.equal(model.parent, character.object, `${id} let go of`);
            assert.ok(box.min.y > -0.005 && box.min.y < 0.02, `${id} on the ground: ${box.min.y.toFixed(3)}`);
            assert.ok(box.max.y - box.min.y < 0.12, `${id} lying flat: ${(box.max.y - box.min.y).toFixed(3)} high`);
        }

        assert.ok(!character.holds.Right && !character.holds.Left, "the hands open");

        actions.revive();
        assert.equal(character.items.find((item) => item.name === "sword").parent.name, "RightHand");
        assert.ok(character.holds.Right?.grips);
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

    it("is posed every frame big on the screen, less often smaller, seldom out of view, and more often moving fast", () => {
        assert.equal(posingEvery(400), 1);
        assert.equal(posingEvery(150), 1);
        assert.equal(posingEvery(100), 2);
        assert.equal(posingEvery(50), 3);
        assert.equal(posingEvery(20), 4);
        assert.equal(posingEvery(0), POSING.unseen);
        // (Going across the screen a pixel a frame, a foot on the ground mustn't slide more than
        // POSING.slide between poses: every other frame at most)
        assert.equal(posingEvery(20, 1), 2);
        assert.equal(posingEvery(20, 0.4), 4);
        assert.equal(posingEvery(20, 5), 1);

        // In the middle of a blow, its hands go as fast as a sprinter: even 50 pixels tall, it's
        // posed every frame (at 60 frames a second)
        const avatar = new Avatar(figure());

        assert.equal(avatar.motion, 0);
        avatar.actions.startAttack("sword", { hitAt: 0.4, duration: 0.8 });
        assert.equal(avatar.motion, POSING.swing);
        assert.equal(posingEvery(50, (avatar.motion * 50) / 60 / avatar.character.height), 1);
    });

    it("posed every so many frames, follows its actor every frame, and is posed for all the time and way since", () => {
        const avatar = new Avatar(figure());
        const walker = avatar.walker;
        const update = walker.update.bind(walker);
        const dt = 1 / 60;
        const poses = [];
        const positions = [];

        // (Each pose: for how long and how far, where it was then, and its feet)
        walker.update = (seconds, { moved }) => {
            update(seconds, { moved });
            poses.push({ seconds, moved, at: avatar.object.position.z, feet: Math.min(walker.footHeight(0), walker.footHeight(1)) });
        };

        avatar.place(0, 0, 0);
        avatar.every = 3;

        for (let k = 1; k <= 90; k++) {
            avatar.update(dt, 0, k * dt * 1.3, 0);
            positions.push(avatar.object.position.z);
        }

        // (Its first pose comes whenever its count, started anywhere up to POSING.unseen, reaches 3)
        assert.ok(poses.length >= 29 && poses.length <= 30, `posed ${poses.length} times in 90 frames`);
        assert.equal(new Set(positions).size, 90, "moved every frame");
        assert.ok(poses.slice(1).every(({ seconds }) => Math.abs(seconds - 3 * dt) < 1e-9), "posed for three frames' time");
        assert.ok(Math.abs(poses.reduce((sum, { moved }) => sum + moved, 0) - poses.at(-1).at) < 1e-9, "and all the way it went");
        assert.ok(poses.every(({ feet }) => Math.abs(feet) < 0.01), "with a foot on the ground");

        // Seen big on the screen again, it's posed at the very next update
        const before = poses.length;

        avatar.every = 1;
        avatar.update(dt, 0, 91 * dt * 1.3, 0);
        assert.equal(poses.length, before + 1);
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

    it("has at least five named rests for every role (five keyed, then animators' clips'), each timed, posed from key time 0 to 2", () => {
        assert.deepEqual(Object.keys(RESTS).sort(), Object.keys(ROLES).sort());

        for (const [role, { title, rests }] of Object.entries(ROLES)) {
            assert.ok(title, role);
            assert.ok(rests.length >= 5, role);
            assert.deepEqual(RESTS[role].map(({ name }) => name), rests.map(({ name }) => name), role);
            assert.equal(new Set(rests.map(({ name }) => name)).size, rests.length, `${role}: all different rests`);
            assert.ok(RESTS[role].slice(0, 5).every(({ clip }) => !clip), `${role}: its own five first`);

            for (const { name, hitAt, duration } of rests) {
                assert.ok(hitAt > 0.3 && hitAt < duration && duration <= 4, `${role}: ${name}`);
            }

            // (A clip's timed as it was baked)
            RESTS[role].forEach(({ clip }, way) => {
                if (clip) {
                    assert.equal(rests[way].clip, clip, `${role}: ${rests[way].name}`);
                    assert.deepEqual([rests[way].hitAt, rests[way].duration], [CLIP_KEYS[clip].hit, CLIP_KEYS[clip].seconds], `${role}: ${rests[way].name} timed as its clip`);
                }
            });

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
    const HELD = { sword: ["sword"], staff: ["staff"], wand: ["wand"], grimoire: ["grimoire"], hammer: ["warHammer"], bow: ["bow"], sling: ["sword", "kiteShield"], punch: ["spikedGauntlets", "spikedGauntletLeft"], cleaver: ["cleaver"], castHeal: ["sword"], castStun: ["sword"], toast: ["tankard"], serve: ["tankard"], pour: [], forge: ["smithHammer", "tongs"], heat: ["smithHammer", "tongs"], quench: ["smithHammer", "tongs"], pump: [], crank: [] };
    const GUARDED = { castHeal: "sword", castStun: "sword" };
    const CARRIED = { barmaid: ["tankard"], patron: ["tankard"], adventurer: ["sword"], smith: ["smithHammer", "tongs"] };

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

        // (Drawing each weapon and putting it away: held as it's drawn, the hands reaching for it
        // where it's put away as they would for its place, `at`)
        for (const [name, { draw, sheathe }] of Object.entries(DRAWS)) {
            for (const [on, how] of [[true, draw], [false, sheathe]]) {
                all.push({
                    label: `${on ? "drawing" : "putting away"} the ${name}`, held: HELD[name], guard: on ? null : name, keys: how.keys, hitAt: how.hitAt, duration: how.duration,
                    begin: (actions) => {
                        actions.character.sheathe(on);
                        actions.draw(name, on);
                    },
                });
            }
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
                    // (Reaching for a weapon where it's put away, it then settles into the hand
                    // the rest of the way: the shoulder may go a little further, the hand needn't
                    // be turned exactly as asked)
                    const reaching = action.keys.find(([time]) => time === key)?.[1][side.toLowerCase()]?.sheath;

                    assert.ok(shoulder < (own && !reaching ? 5 : 20), `${at}: the shoulder ${shoulder.toFixed(0)} degrees past its range`);
                    shoulders = Math.max(shoulders, shoulder);

                    // (Strain: how far past their ranges the joints would have to go to reach
                    // and turn the hand exactly as asked)
                    if (own && !reaching) {
                        assert.ok(strain < 35, `${at}: strained ${strain.toFixed(0)} degrees`);
                    }
                }
            });
        }

        assert.ok(shoulders > 0, "(the shoulders are measured)");
    });

    // A hand's bones' joints (`at`) and ends (`tip`), in the hand's own frame (metres: x towards
    // the palm's side, y along the fingers, z towards the thumb's side)
    function inHand(rig, Side) {
        const hand = rig.bone(`${Side}Hand`);
        const frame = hand.getWorldQuaternion(new THREE.Quaternion()).multiply(rig.frames[rig.index.get(`${Side}Hand`)]).invert();
        const wrist = hand.getWorldPosition(new THREE.Vector3());
        const local = (point) => {
            const v = point.sub(wrist).applyQuaternion(frame);

            return new THREE.Vector3(Side === "Left" ? -v.x : v.x, -v.y, v.z);
        };
        const at = (bone) => local(rig.bone(`${Side}Hand${bone}`).getWorldPosition(new THREE.Vector3()));
        const tip = (bone) => {
            const i = rig.index.get(`${Side}Hand${bone}`);

            return local(rig.bone(`${Side}Hand${bone}`).localToWorld(rig.tails[i].clone().sub(rig.heads[i])));
        };

        return { at, tip };
    }

    // Where a hand's thumb tip is, and its index finger's knuckle, in the hand's own frame
    function thumbOf(rig, Side) {
        const { at, tip } = inHand(rig, Side);

        return { tip: tip("Thumb3"), knuckle: at("Index1") };
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

    it("clenches a fist as a real one closes: the fingers side by side, their tips on the palm, the thumb across them", () => {
        // (The gauntlets' guard, whose fists are the gauntlets' hold, and the kick guard's, a key pose's fist shape)
        for (const [name, held] of [["punch", ["spikedGauntlets", "spikedGauntletLeft"]], ["kick", []]]) {
            const { character, walker, actions } = armed(held);

            walker.update(0);
            actions.setWeapon(name);
            actions.setGuard(true);

            for (let k = 0; k < 10; k++) {
                walker.update(0.1);
            }

            for (const Side of ["Right", "Left"]) {
                const { at, tip } = inHand(character.rig, Side);
                const fingers = ["Index", "Middle", "Ring", "Pinky"];
                const hand = `${name}: the ${Side.toLowerCase()}`;

                // Curled down in front of their own knuckles, not splayed apart (fanned as they rest,
                // they were: a fist's index and middle finger's middle bones 1 cm further apart than their knuckles)
                for (let k = 0; k < 3; k++) {
                    const knuckles = at(`${fingers[k]}1`).z - at(`${fingers[k + 1]}1`).z;
                    const middles = at(`${fingers[k]}2`).z - at(`${fingers[k + 1]}2`).z;

                    assert.ok(middles < knuckles + 0.003, `${hand} ${fingers[k].toLowerCase()} and ${fingers[k + 1].toLowerCase()} fingers side by side (${(middles * 100).toFixed(1)} cm apart, their knuckles ${(knuckles * 100).toFixed(1)})`);
                }

                // Their tips curled back on the palm, before its bones (they went through the hand)
                for (const finger of fingers) {
                    const end = tip(`${finger}3`);

                    assert.ok(end.x > 0.005 && end.y < at(`${finger}1`).y - 0.02, `${hand} ${finger.toLowerCase()} finger's tip on the palm: ${end.toArray().map((v) => (v * 100).toFixed(1))}`);
                }

                // The thumb across the outside of the fingers, its tip on the middle finger's middle bone
                const thumb = tip("Thumb3");
                const middle = at("Middle2").lerp(at("Middle3"), 0.5);

                assert.ok(thumb.distanceTo(middle) < 0.02 && thumb.x > middle.x, `${hand} thumb across the middle finger: ${thumb.toArray().map((v) => (v * 100).toFixed(1))}`);
            }
        }
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

            if (!cells.has(cell)) {
                cells.set(cell, []);
            }

            cells.get(cell).push({ at, normal: normal.normalize(), hand: onHand[v] });
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
