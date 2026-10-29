// Enmity (client/js/core/battle.js ENMITY; docs/WILDS.md *Whom they go for*): the wild's creatures
// and the soldiers keep how much each of those set on them has done them, go for the one with the
// most, and keep to the one they're on till another's past them by a margin; the nearest first,
// with a seed, as ever
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Battle, ENMITY, STEP_MS } from "../client/js/core/battle.js";
import { WILD } from "../client/js/core/creatures.js";
import { SNAPSHOT_STEPS } from "../client/js/core/host.js";
import { parseGrid } from "./helpers.js";

const field = (size) => ({ blocked: parseGrid(Array.from({ length: size }, () => ".".repeat(size))).map((row) => Uint8Array.from(row)) });
const put = (actor, [x, y]) => Object.assign(actor, { square: [x, y], x: x + 0.5, y: y + 0.5, path: [] });

function run(battle, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...battle.advance(STEP_MS));
    }

    return events;
}

// A wolf in an open field, and two players by it, `near` 2 squares off and `far` 7, standing still
// (stunned: they fight no one of their own accord)
function fight() {
    const battle = new Battle(field(60), { seed: 3 });

    battle.add({ id: "wolf", kind: "beast", name: "Wolf", weapon: "wolf", team: WILD, square: [30, 30], ai: "wild", hp: 1e6, speed: 1, chase: 1, wild: { creature: "wolf", tier: 1, temper: "aggressive", guard: 0, roam: 0, leash: 40, pack: "p", leader: null, menace: true } });

    for (const [id, square] of [["near", [32, 30]], ["far", [37, 30]]]) {
        battle.add({ id, kind: "player", weapon: "sword", team: "hero", square, hp: 1e6 });
        battle.actor(id).stunnedUntil = Infinity;
    }

    return { battle, wolf: battle.actor("wolf"), near: battle.actor("near"), far: battle.actor("far") };
}

// Enmity as the battle keeps it: [how much, until when]
const kept = (battle, amount) => [amount, battle.time + 60000];

describe("enmity (battle.js ENMITY)", () => {
    it("goes first for the nearest, on them with a seed, and keeps to them as another comes nearer", () => {
        const { battle, wolf, far } = fight();

        run(battle, STEP_MS);
        assert.equal(wolf.target, "near");
        assert.equal(wolf.enmity.near[0], ENMITY.seed);

        // (The other nearer now: not gone for, with nothing done it)
        put(far, [wolf.square[0] - 1, wolf.square[1]]);
        run(battle, 1000);
        assert.equal(wolf.target, "near");
    });

    it("turns on another only once their enmity's past the one it's on by a tenth up close, by three tenths from further off", () => {
        const { battle, wolf, far } = fight();

        run(battle, STEP_MS);
        assert.equal(wolf.target, "near");

        // (From further off than ENMITY.hand: three tenths more wanted)
        assert.ok(Math.hypot(far.x - wolf.x, far.y - wolf.y) > ENMITY.hand + 1);
        wolf.enmity = { near: kept(battle, 100), far: kept(battle, 125) };
        run(battle, STEP_MS);
        assert.equal(wolf.target, "near", "a quarter more from afar: not enough");

        wolf.enmity.far = kept(battle, 131);
        run(battle, STEP_MS);
        assert.equal(wolf.target, "far");

        // (Up close: a tenth)
        put(far, [wolf.square[0], wolf.square[1] + 1]);
        wolf.enmity = { near: kept(battle, 200), far: kept(battle, 100) };
        run(battle, STEP_MS);
        assert.equal(wolf.target, "near");
        wolf.enmity.far = kept(battle, 215);
        run(battle, STEP_MS);
        assert.equal(wolf.target, "near", "under a tenth more: kept to the one it's on");
        wolf.enmity.far = kept(battle, 221);
        run(battle, STEP_MS);
        assert.equal(wolf.target, "far");
    });

    it("keeps the harm done it for its enmity (a blow that misses, a seed), and half a lingering ill's; turned by a blow only when it's on no one", () => {
        const { battle, wolf, far } = fight();

        run(battle, STEP_MS);

        // (Struck by the one it's not on: its enmity for them the more, still on the other)
        Object.assign(far, { stunnedUntil: 0 });
        put(far, [wolf.square[0], wolf.square[1] - 1]);
        battle.strike("far", "wolf");

        const events = run(battle, 3000).filter(({ type, by, id }) => (type === "hit" || type === "dodged" || type === "blocked") && by === "far" && id === "wolf");

        assert.ok(events.length > 0, "struck");

        const struck = events.reduce((sum, { type, damage }) => sum + (type === "hit" ? Math.max(ENMITY.seed, damage) : ENMITY.seed), 0);

        assert.ok(Math.abs(wolf.enmity.far[0] - struck) < 1e-9, `${wolf.enmity.far[0]} for ${struck}`);

        // (A lingering ill laid on it: half its harm)
        Object.assign(far, { stunnedUntil: Infinity, striking: null });

        const before = wolf.enmity.far[0];
        const after = run((battle.afflict("wolf", "poison", { by: "far" }), battle), 4000).filter(({ id, by }) => id === "wolf" && by === "far");
        const ails = after.filter(({ type }) => type === "ail");
        // (And a blow of theirs still landing, already on its way)
        const blows = after.filter(({ type }) => type === "hit" || type === "dodged" || type === "blocked").reduce((sum, { type, damage }) => sum + (type === "hit" ? Math.max(ENMITY.seed, damage) : ENMITY.seed), 0);

        assert.ok(ails.length > 0, "the poison ticked");
        assert.ok(Math.abs(wolf.enmity.far[0] - before - blows - ails.reduce((sum, { damage }) => sum + damage * ENMITY.lingering, 0)) < 1e-9, `${wolf.enmity.far[0] - before}`);
    });

    it("forgets one who falls (knocked down or dead) or is taken away; and lets go of all of it, given up", () => {
        const { battle, wolf, far } = fight();

        run(battle, STEP_MS);
        wolf.enmity = { near: kept(battle, 10), far: kept(battle, 100) };
        far.hp = 1;
        put(far, [wolf.square[0] + 1, wolf.square[1]]);
        run(battle, STEP_MS);
        assert.equal(wolf.target, "far");

        const fell = run(battle, 5000);

        assert.ok(fell.some(({ type, id }) => type === "death" && id === "far"));
        assert.equal(wolf.enmity.far, undefined, "the fallen forgotten");
        assert.equal(wolf.target, "near");
        battle.remove("far");

        battle.remove("near");
        assert.deepEqual(wolf.enmity, {});

        // (None left it can go for, given up: none kept)
        battle.add({ id: "away", kind: "player", weapon: "sword", team: "hero", square: [2, 2], hp: 1e6 });
        wolf.enmity = { away: kept(battle, 50) };
        wolf.target = "away";
        battle.actor("away").stunnedUntil = Infinity;
        run(battle, 5000);
        assert.equal(wolf.target, null);
        assert.deepEqual(wolf.enmity, {});
    });

    it("is kept in a snapshot, and two copies of a battle keep it alike step for step", () => {
        const { battle, wolf, far } = fight();

        run(battle, STEP_MS);
        Object.assign(far, { stunnedUntil: 0 });
        put(far, [wolf.square[0], wolf.square[1] - 1]);
        battle.strike("far", "wolf");
        run(battle, 1000);

        const snapshot = battle.snapshot();
        const [one, two] = [Battle.restore(battle.world, snapshot), Battle.restore(battle.world, snapshot)];

        assert.deepEqual(one.actor("wolf").enmity, wolf.enmity);

        for (let k = 0; k < 60; k++) {
            run(one, STEP_MS);
            run(two, STEP_MS);
            assert.deepEqual([one.actor("wolf").target, one.actor("wolf").enmity], [two.actor("wolf").target, two.actor("wolf").enmity]);
        }
    });

    it("brings a world kept from before forward with none yet (SNAPSHOT_STEPS 45)", () => {
        const forward = SNAPSHOT_STEPS[45]({ version: 45, battle: { actors: [{ id: "wolf" }, { id: "kept", enmity: { a: [1, 2] } }] } });

        assert.equal(forward.version, 46);
        assert.deepEqual(forward.battle.actors.map(({ enmity }) => enmity), [{}, { a: [1, 2] }]);
    });
});
