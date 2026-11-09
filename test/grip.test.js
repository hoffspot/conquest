// Tests: a hand closed round a haft or a hilt as a real one closes (grip.js)
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import { readHumanData } from "../scripts/lib/human-data.js";
import { ITEMS } from "../client/js/characters/equipment.js";
import { closeHand, DIGITS } from "../client/js/characters/grip.js";
import { BODIES, dress, motions } from "../client/js/characters/motioncheck.js";
import { pinchOf, reinGrips } from "../client/js/characters/riding.js";

// Each body made from each data's default (MakeHuman's and Vitruvian's), holding each weapon with
// a round grip, each hand that holds it closed round it as the body rests (and what it holds as
// that hand holds it: its socket, how thick it is there, and its hilt's pommel and guard)
function* grips(weapons, bodies) {
    for (const data of ["human", "vitruvian"]) {
        const human = readHumanData(data);

        for (const [weapon, item] of weapons) {
            const motion = motions().find(({ id }) => id === `guard/${weapon}/still`);

            for (const body of bodies) {
                const { character } = dress(human, motion.look(body), { sheathed: false });
                const model = character.items.find(({ name }) => name === item);
                const hands = [["Right", model.userData.grip, model.userData.home, ITEMS[item].round, ITEMS[item].hilt]];

                if (model.userData.second) {
                    hands.push(["Left", model.userData.second.grip, model.userData.second, ITEMS[item].haftRound, null]);
                }

                character.rig.reset();

                for (const [Side, grip, socket, radius, hilt] of hands) {
                    closeHand(character.rig, Side, grip);
                    character.rig.apply();
                    character.object.updateMatrixWorld(true);
                    yield { label: `${data} ${body.id} ${item}, the ${Side.toLowerCase()} hand`, rig: character.rig, Side, socket, radius, hilt };
                }
            }
        }
    }
}

// What a hand holds, as it lies in it: how far a point is from the haft's axis, and along it
// (metres from its middle, towards the thumb's end); a bone (its head to its tail) as it's posed;
// and where a point is in the hand's anatomical frame, from the wrist (x into the palm)
function haftIn({ rig, Side, socket }) {
    const hand = rig.bone(`${Side}Hand`);
    const turn = hand.getWorldQuaternion(new THREE.Quaternion());
    const middle = socket.position.clone().applyMatrix4(hand.matrixWorld);
    const along = new THREE.Vector3(0, 1, 0).applyQuaternion(turn.clone().multiply(socket.quaternion));
    const toHand = turn.clone().multiply(rig.frames[rig.index.get(`${Side}Hand`)]).invert();
    const wrist = hand.getWorldPosition(new THREE.Vector3());
    const off = (point) => {
        const v = point.clone().sub(middle);

        return v.addScaledVector(along, -v.dot(along)).length();
    };
    const bone = (name) => {
        const i = rig.index.get(name);
        const skinning = rig.bones[i].matrixWorld.clone().multiply(rig.skeleton.boneInverses[i]);

        return [rig.heads[i].clone().applyMatrix4(skinning), rig.tails[i].clone().applyMatrix4(skinning)];
    };
    // (How near a bone comes to the axis, along it)
    const nearest = (name) => {
        const [a, b] = bone(name);
        let least = Infinity;

        for (let k = 0; k <= 10; k++) {
            least = Math.min(least, off(a.clone().lerp(b, k / 10)));
        }

        return least;
    };
    const local = (point) => {
        const v = point.clone().sub(wrist).applyQuaternion(toHand);

        return Side === "Left" ? v.setX(-v.x) : v;
    };

    return { middle, along, bone, nearest, local, palm: rig.bone(`${Side}HandMiddle1`).getWorldPosition(new THREE.Vector3()).distanceTo(wrist) };
}

describe("a hand round a haft or a hilt (grip.js)", () => {
    const WEAPONS = [["staff", "staff"], ["hammer", "warHammer"], ["sword", "sword"], ["cleaver", "cleaver"]];
    // (Every body for the staff, held in both hands; the ends of the build for the others)
    const cases = () => [...grips(WEAPONS.slice(0, 1), BODIES), ...grips(WEAPONS.slice(1), BODIES.filter(({ id }) => /^(human|orc)-(shortest|bulkiest)/.test(id)))];

    it("lays the haft across the palm on its skin, from the base of the index finger to the heel of the hand", () => {
        for (const grip of cases()) {
            const { middle, local, palm } = haftIn(grip);
            const at = local(middle);

            // (In front of the palm, not under the fingers: the old socket held it at the finger
            // bases, past the knuckles, and the fingers closed on air)
            assert.ok(at.x > 0.02, `${grip.label}: the haft ${(at.x * 100).toFixed(1)} cm in front of the hand's bones`);
            assert.ok(-at.y > 0.45 * palm && -at.y < 0.95 * palm, `${grip.label}: the haft across the palm, ${((-at.y / palm) * 100).toFixed(0)}% of the way from the wrist to the knuckles`);
        }
    });

    it("closes each finger round it, none in it, stacked down the diagonal, and the thumb across it", () => {
        for (const grip of cases()) {
            const { Side, radius, label } = grip;
            const { middle, along, bone, nearest } = haftIn(grip);

            for (const digit of DIGITS) {
                for (const j of [1, 2, 3]) {
                    const off = nearest(`${Side}Hand${digit}${j}`) - radius;

                    assert.ok(off > 0.002, `${label}: the ${digit.toLowerCase()} finger's bone ${j} ${(off * 100).toFixed(1)} cm off the haft (not in it)`);
                }

                const off = nearest(`${Side}Hand${digit}2`) - radius;

                assert.ok(off < 0.03, `${label}: the ${digit.toLowerCase()} finger's middle bone ${(off * 100).toFixed(1)} cm off the haft (round it)`);
            }

            // (The index finger nearest the thumb's end, the little finger furthest down it)
            const down = DIGITS.map((digit) => {
                const [a, b] = bone(`${Side}Hand${digit}2`);

                return a.add(b).multiplyScalar(0.5).sub(middle).dot(along);
            });

            assert.ok(down.every((x, k) => k === 0 || x < down[k - 1]), `${label}: the fingers in order down the haft (${down.map((x) => (x * 100).toFixed(1)).join(", ")} cm)`);

            const [a, b] = bone(`${Side}HandThumb3`);
            const lying = Math.abs(b.clone().sub(a).normalize().dot(along));

            assert.ok(lying < 0.8, `${label}: the thumb across the haft, not along it (${((Math.acos(lying) * 180) / Math.PI).toFixed(0)}° from it)`);
            assert.ok(nearest(`${Side}HandThumb3`) - radius > 0.002, `${label}: the thumb not in the haft`);
        }
    });

    it("holds a hilt below its guard, not round it", () => {
        for (const grip of cases().filter(({ hilt }) => hilt)) {
            const { Side, hilt, label } = grip;
            const { middle, along, bone } = haftIn(grip);
            // (How far up the hilt each finger's bones reach, from its middle)
            const reach = Math.max(...DIGITS.flatMap((digit) => [1, 2, 3].flatMap((j) => bone(`${Side}Hand${digit}${j}`).map((point) => point.sub(middle).dot(along)))));

            assert.ok(reach < hilt[1], `${label}: the fingers ${((reach - hilt[1]) * 100).toFixed(1)} cm past the guard`);
        }
    });
});

describe("a rider's hands on the reins (riding.js reinGrips, pinchOf: the owner's photos)", () => {
    // Each body made from each data's default, its hands closed on its reins as it rests: how far
    // each hand's closed (its index finger's tip from the wrist, as a share of how far it is with
    // the hand open), how far the thumb's pad is from the curled index finger, and where the rein
    // is held, each against the hand's palm (the wrist to the middle finger's knuckle)
    const hands = function* () {
        const motion = motions().find(({ id }) => id.startsWith("walk")) ?? motions()[0];

        for (const data of ["human", "vitruvian"]) {
            const human = readHumanData(data);

            for (const body of BODIES) {
                const { character } = dress(human, motion.look(body));
                const rig = character.rig;
                const grips = reinGrips(character);

                rig.reset();
                closeHand(rig, "Left", grips.Left);
                closeHand(rig, "Right", grips.Right);
                rig.apply();
                character.object.updateMatrixWorld(true);

                for (const Side of ["Left", "Right"]) {
                    const at = (name, share) => {
                        const i = rig.index.get(name);

                        return rig.bones[i].localToWorld(rig.tails[i].clone().sub(rig.heads[i]).multiplyScalar(share));
                    };
                    const wrist = rig.bone(`${Side}Hand`).getWorldPosition(new THREE.Vector3());
                    const palm = rig.bone(`${Side}HandMiddle1`).getWorldPosition(new THREE.Vector3()).distanceTo(wrist);
                    const open = rig.tails[rig.index.get(`${Side}HandIndex3`)].distanceTo(rig.heads[rig.index.get(`${Side}Hand`)]);
                    const pad = at(`${Side}HandThumb3`, 0.5);
                    const index = at(`${Side}HandIndex2`, 0.5);

                    yield { label: `${data} ${body.id}, the ${Side.toLowerCase()} hand`, closed: at(`${Side}HandIndex3`, 1).distanceTo(wrist) / open, thumb: pad.distanceTo(index) / palm, pinch: pinchOf(rig, Side), pad, index, wrist, palm };
                }
            }
        }
    };

    it("closes each hand in a loose fist, the thumb over the curled index finger", () => {
        for (const { label, closed, thumb } of hands()) {
            // (The index finger's tip brought back towards the wrist: about half as far as it
            // reaches with the hand open; a loose fist, not a clenched one)
            assert.ok(closed > 0.4 && closed < 0.7, `${label}: closed to ${(closed * 100).toFixed(0)}% of its reach`);
            // (The thumb's pad over the index finger's middle bone, a rein's width off it)
            assert.ok(thumb < 0.5, `${label}: the thumb's pad ${(thumb * 100).toFixed(0)}% of the palm from the index finger`);
        }
    });

    it("holds the rein under the thumb, between its pad and the index finger", () => {
        for (const { label, pinch, pad, index, wrist, palm } of hands()) {
            assert.ok(Math.abs(pinch.distanceTo(pad) - pinch.distanceTo(index)) < 1e-6, `${label}: the rein midway between the thumb's pad and the index finger`);
            assert.ok(pinch.distanceTo(wrist) < 1.2 * palm, `${label}: the rein in the hand, ${((pinch.distanceTo(wrist) / palm) * 100).toFixed(0)}% of the palm from the wrist`);
        }
    });
});
