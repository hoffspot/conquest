// The motion check (client/js/characters/motioncheck.js, scripts/motion-check.js): it plays every
// motion the characters make, finds each kind of fault when one's put there on purpose, comes out
// the same every time, and tells what's worse than its baseline from what isn't
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import * as THREE from "three";
import { ATTACKS, DRAWS, REACTIONS } from "../client/js/characters/actions.js";
import { BODIES, failures, MEASURES, motions, play } from "../client/js/characters/motioncheck.js";
import { ACT_TIMES, ROLES } from "../client/js/core/roles.js";
import { compare, TOLERANCE } from "../scripts/motion-check.js";
import { readHumanData } from "../scripts/lib/human-data.js";

// (The game's body: body.js GAME_BODY)
const human = readHumanData();
const all = motions();
const baseline = JSON.parse(readFileSync(new URL("./motion-baseline.json", import.meta.url), "utf8"));

// A two-handed guard that's clean on this body (nothing past its limit), half a second of it, with
// `fault` done to the body after every frame
const GUARD = all.find(({ id }) => id === "guard/hammer/still");
const BODY = BODIES.find(({ id }) => id === "human-thinnest-f");
const planted = (fault = () => {}) => ({
    ...GUARD,
    seconds: 0.5,
    start: (dressed) => {
        GUARD.start(dressed);

        const update = dressed.walker.update.bind(dressed.walker);

        dressed.walker.update = (dt, options) => {
            update(dt, options);
            fault(dressed);
            dressed.character.object.updateMatrixWorld(true);
        };
    },
});
const worstOf = (fault) => play(human, planted(fault), BODY).worst;

describe("the motion check", () => {
    it("plays everything the characters do, on each people's bodies at the ends of their builds", () => {
        const ids = new Set(all.map(({ id }) => id));
        const peoples = new Set(BODIES.map(({ people }) => people));

        assert.equal(BODIES.length, peoples.size * 5);
        assert.ok(["human", "elf", "darkElf", "cat", "lizard", "orc"].every((people) => peoples.has(people)));
        assert.equal(new Set(BODIES.map(({ id }) => id)).size, BODIES.length);

        // Each weapon's guard, its every blow, and drawing it and putting it away
        for (const [weapon, guard] of Object.entries({ sword: "sword", staff: "staff", wand: "wand", grimoire: "grimoire", hammer: "hammer", bow: "bow", gauntlets: "punch", boots: "kick", cleaver: "cleaver" })) {
            assert.ok(["still", "walk", "run"].every((pace) => ids.has(`guard/${weapon}/${pace}`)), weapon);
            assert.ok(ATTACKS[guard].variants.every((_, variant) => ids.has(`attack/${weapon}/${variant}`)), weapon);
            assert.equal(ids.has(`draw/${weapon}`) && ids.has(`sheathe/${weapon}`), Boolean(DRAWS[guard]?.draw), weapon);
        }

        // Every flinch every way (keyed, and the clips'), each way of slipping a blow, every act and
        // every rest of every role
        assert.ok(Object.entries(REACTIONS).every(([name, { clips = [] }]) => ids.has(`flinch/${name}`) && clips.every((clip) => ids.has(`flinch/${name}/${clip}`))));
        assert.ok(["left", "right", "back"].every((way) => ids.has(`dodge/${way}`)));
        assert.ok(Object.keys(ACT_TIMES).every((act) => ids.has(`act/${act}`)));
        assert.ok(Object.entries(ROLES).every(([role, { rests = [] }]) => rests.every((_, variant) => ids.has(`rest/${role}/${variant}`))));
    });

    it("finds each kind of fault put there on purpose, and none on the clean guard", () => {
        const clean = worstOf();

        assert.deepEqual(failures(clean), [], "the guard's clean on this body");
        assert.ok(clean.grip, "(the second hand's measured)");

        const faults = {
            // The left knee bent sideways
            joint: ({ character }) => character.rig.bone("LeftLeg").quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.8)),
            // The hammer in the chest
            item: ({ character }) => {
                const hammer = character.items.find(({ name }) => name === "warHammer");
                const chest = hammer.parent.worldToLocal(character.rig.bone("Spine1").getWorldPosition(new THREE.Vector3()));

                hammer.position.copy(chest);
            },
            // The left arm hung from inside the chest
            limb: ({ character }) => {
                const arm = character.rig.bone("LeftArm");
                const into = arm.getWorldPosition(new THREE.Vector3()).lerp(character.rig.bone("Spine1").getWorldPosition(new THREE.Vector3()), 0.6);

                arm.position.copy(arm.parent.worldToLocal(into));
            },
            // The body moved a centimetre a frame, its feet planted
            slide: ({ character }) => {
                character.object.position.x += 0.01;
            },
            // The hips 10 cm lower, the feet with them
            ground: ({ character }) => {
                character.rig.bone("Hips").position.y -= 0.1;
            },
            // The second hand 10 cm from where it holds the haft
            grip: ({ actions }) => {
                actions.haft.left = { wanted: new THREE.Vector3(0, 1, 0), held: new THREE.Vector3(0.1, 1, 0), weight: 1 };
            },
        };

        assert.deepEqual(Object.keys(faults).toSorted(), Object.keys(MEASURES).toSorted());

        for (const [kind, fault] of Object.entries(faults)) {
            const worst = worstOf(fault);

            assert.ok(worst[kind].value > MEASURES[kind].limit, `${kind}: ${worst[kind].value} past ${MEASURES[kind].limit}`);
            assert.ok(failures(worst).some(([found]) => found === kind));
            assert.equal(worst[kind].at.length, 3, `${kind}: where it was`);
        }
    });

    it("comes out the same every time", () => {
        const motion = all.find(({ id }) => id === "attack/staff/0");
        const body = BODIES.find(({ id }) => id === "orc-bulkiest-m");

        assert.deepEqual(play(human, motion, body), play(human, motion, body));
    });

    it("plays to a moment and leaves the body there, for the contact sheet", () => {
        const motion = all.find(({ id }) => id === "attack/hammer/0");
        const { worst, dressed } = play(human, motion, BODY, { until: 0.4, every: Infinity });

        assert.ok(dressed.character.rig && dressed.walker);
        assert.ok(Object.values(worst).every(({ t }) => t <= 0.4 + 1e-9));
        assert.equal(worst.item, undefined, "(nothing measured in the body when told not to)");
    });

    it("fails on what's new or worse than its baseline, by more than a little, and says what's better", () => {
        const result = (values) => Object.fromEntries(Object.entries(values).map(([kind, value]) => [kind, { value, t: 0.5, what: "", at: [0, 0, 0] }]));
        const known = { "a|b": { limb: 0.05, joint: 10 } };

        // As it was, and a little worse: fine
        assert.deepEqual(compare({ "a|b": result({ limb: 0.05, joint: 10 + TOLERANCE.joint / 2 }) }, known).regressions, []);
        // Worse by more than a little
        assert.deepEqual(compare({ "a|b": result({ limb: 0.05 + TOLERANCE.limb * 2, joint: 10 }) }, known).regressions.map(({ kind }) => kind), ["limb"]);
        // New: only once well past its limit (just past it isn't a regression, being just inside it before)
        assert.deepEqual(compare({ "c|d": result({ item: MEASURES.item.limit + TOLERANCE.item / 2 }) }, known).regressions, []);
        assert.deepEqual(compare({ "c|d": result({ item: 0.05 }) }, known).regressions, [{ key: "c|d", kind: "item", value: 0.05, was: null }]);
        // Better, or no longer failing
        assert.deepEqual(compare({ "a|b": result({ limb: 0.01, joint: 5 }) }, known).better.map(({ kind }) => kind).toSorted(), ["joint", "limb"]);
    });

    it("keeps a baseline of motions and bodies it plays, past their limits", () => {
        const ids = new Set(all.map(({ id }) => id));
        const bodies = new Set(BODIES.map(({ id }) => id));

        for (const [key, kinds] of Object.entries(baseline.failures)) {
            const [motion, body] = key.split("|");

            assert.ok(ids.has(motion) && bodies.has(body), key);

            // (Kept to a tenth of a millimetre, a hundredth of a degree: just past may round to it)
            for (const [kind, value] of Object.entries(kinds)) {
                assert.ok(value >= MEASURES[kind].limit, `${key} ${kind}`);
            }
        }
    });
});
