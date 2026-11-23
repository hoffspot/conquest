// The tag ledger (client/js/core/battle.js TAGS; generated/multiplayer_scaling_plan.md 2-11): what
// each player's done to one of the wild or a raider, kept on it: harm done it (their followers'
// too), harm taken from it, and mending of those it's on; let go once they've been far off a
// minute. Recorded, and read by no rule yet
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Battle, STEP_MS, TAGS } from "../client/js/core/battle.js";
import { WILD } from "../client/js/core/creatures.js";
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

const harm = (events, by, id) => events.filter((event) => (event.type === "hit" || event.type === "ail") && event.by === by && event.id === id).reduce((sum, { damage }) => sum + damage, 0);

describe("the tag ledger (battle.js TAGS)", () => {
    it("is a minute's lapse at 60 m, mending at half weight, looked at every second", () => {
        assert.deepEqual(TAGS, { lapse: 60000, far: 60, healing: 0.5, every: 1000 });
    });

    it("keeps the harm a player does one of the wild, and the harm they take from it, each under the player; none on a player", () => {
        const { battle, wolf, near, far } = fight();

        assert.equal(wolf.tags, undefined);
        assert.deepEqual(battle.tagsOf("wolf"), []);
        Object.assign(far, { stunnedUntil: 0 });
        put(far, [wolf.square[0], wolf.square[1] - 1]);
        battle.strike("far", "wolf");

        const events = run(battle, 4000);
        const done = harm(events, "far", "wolf");
        const taken = harm(events, "wolf", "far");

        assert.ok(done > 0 && taken > 0, "struck, and bitten back (its bite, and the bleeding of it)");
        assert.deepEqual(wolf.tags.far.slice(0, 3), [done, taken, 0]);
        assert.equal(wolf.tags.far[3], battle.time, "(near, as of now)");
        assert.equal(harm(events, "wolf", "near"), (wolf.tags.near ?? [0, 0])[1]);
        assert.deepEqual(battle.tagsOf("wolf").find(({ player }) => player === "far"), { player: "far", done, taken, healed: 0, weight: done + taken });
        assert.equal(near.tags, undefined);
        assert.equal(far.tags, undefined);
        assert.deepEqual(battle.tagsOf("near"), []);
    });

    it("counts no more than the hit points there were to take", () => {
        const { battle, wolf, far } = fight();

        wolf.hp = 3;
        Object.assign(far, { stunnedUntil: 0 });
        put(far, [wolf.square[0], wolf.square[1] - 1]);
        battle.strike("far", "wolf");
        run(battle, 4000);
        assert.equal(wolf.dead, true);
        assert.equal(wolf.tags.far[0], 3);
    });

    it("puts a follower's harm down to the player it follows", () => {
        const { battle, wolf } = fight();

        battle.add({ id: "sword", kind: "follower", team: "hero", weapon: "sword", square: [30, 31], ai: "follow", leader: "far", hp: 1e6, rises: 1 });

        const events = run(battle, 6000);
        const done = harm(events, "sword", "wolf");

        assert.ok(done > 0, "the follower struck it");
        assert.equal(wolf.tags.far[0], done);
        assert.equal(wolf.tags.sword, undefined, "(none under the follower itself)");
    });

    it("keeps mending of one it's on, shared among those on them, at half weight", () => {
        const { battle, wolf, near } = fight();

        battle.add({ id: "healer", kind: "player", weapon: "staff", team: "hero", square: [30, 36], hp: 1e6 });
        battle.actor("healer").stunnedUntil = 0;
        run(battle, STEP_MS);
        assert.equal(wolf.target, "near");
        near.hp = 1000;

        const healed = run((battle.cast("healer", "vigor", "near"), battle), 3000)
            .filter(({ type, id, by }) => type === "healed" && id === "near" && by === "healer")
            .reduce((sum, { amount }) => sum + amount, 0);

        assert.ok(healed > 0, "healed");
        assert.equal(wolf.tags.healer[2], healed);

        const { done, taken, weight } = battle.tagsOf("wolf").find(({ player }) => player === "healer");

        assert.equal(weight, done + taken + healed * TAGS.healing);
    });

    it("lets a tag go once its player's been 60 m off, or on another map, for a minute; never while they're near", () => {
        const battle = new Battle(field(140), { seed: 3 });

        battle.add({ id: "wolf", kind: "beast", name: "Wolf", weapon: "wolf", team: WILD, square: [10, 10], ai: "wild", hp: 1e6, speed: 0, chase: 0, wild: { creature: "wolf", tier: 1, temper: "passive", guard: 0, roam: 0, leash: 0, pack: "p", leader: null } });

        for (const [id, square] of [["near", [40, 10]], ["far", [72, 10]], ["gone", [12, 12]]]) {
            battle.add({ id, kind: "player", weapon: "sword", team: "hero", square, hp: 1e6 });
            battle.actor(id).stunnedUntil = Infinity;
        }

        const wolf = battle.actor("wolf");

        battle.actor("gone").map = "elsewhere";
        wolf.tags = { near: [5, 0, 0, battle.time], far: [7, 0, 0, battle.time], gone: [9, 0, 0, battle.time] };
        run(battle, TAGS.lapse - 2000);
        assert.deepEqual(Object.keys(wolf.tags), ["near", "far", "gone"], "(not yet a minute)");
        run(battle, 4000);
        assert.deepEqual(Object.keys(wolf.tags), ["near"], "30 m off: kept; 62 m off, and on another map: let go");
        assert.equal(wolf.tags.near[0], 5);

        // (The last of them far off too: no ledger left, not an empty one)
        put(battle.actor("near"), [100, 10]);
        run(battle, TAGS.lapse + 2000);
        assert.equal(wolf.tags, undefined);
        assert.ok(Object.hasOwn(wolf, "tags"), "(of the one shape still: undefined, not deleted)");
    });

    it("forgets a player taken out of the battle, and comes back from a snapshot as it was", () => {
        const { battle, wolf } = fight();

        wolf.tags = { near: [5, 1, 0, 0], far: [7, 0, 2, 0] };

        const again = Battle.restore(field(60), JSON.parse(JSON.stringify(battle.snapshot())));

        assert.deepEqual(again.actor("wolf").tags, wolf.tags);
        assert.equal(again.actor("near").tags, undefined);
        battle.remove("far");
        assert.deepEqual(wolf.tags, { near: [5, 1, 0, 0] });
    });

    it("keeps none on a soldier that isn't a raider, and keeps them on one that picks its own fights", () => {
        const battle = new Battle(field(60), { seed: 3 });

        battle.add({ id: "far", kind: "player", weapon: "sword", team: "hero", square: [37, 30], hp: 1e6 });
        battle.add({ id: "guard", kind: "soldier", weapon: "sword", team: "foe", square: [37, 31], ai: "patrol", patrol: [[37, 31]], hp: 1e6 });
        battle.add({ id: "raider", kind: "soldier", weapon: "sword", team: "foe", square: [37, 29], ai: "patrol", patrol: [[37, 29]], hp: 1e6, lone: true });

        const events = run(battle, 20000);

        assert.ok(harm(events, "guard", "far") > 0 && harm(events, "raider", "far") > 0, "both struck the player");
        assert.equal(battle.actor("guard").tags, undefined);
        assert.equal(battle.actor("raider").tags.far[1], harm(events, "raider", "far"));
        assert.equal(battle.actor("raider").tags.far[0], harm(events, "far", "raider"));
    });
});
