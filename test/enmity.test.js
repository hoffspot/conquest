// Enmity (client/js/core/battle.js ENMITY; docs/WILDS.md *Whom they go for*): the wild's creatures
// and the soldiers keep how much each of those set on them has done them, go for the one with the
// most, and keep to the one they're on till another's past them by a margin; the nearest first,
// with a seed, as ever
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Battle, ENMITY, STEP_MS, TAUNT } from "../client/js/core/battle.js";
import { WILD } from "../client/js/core/creatures.js";
import { ENMITY_WEIGHTS, mercenaryOf } from "../client/js/core/followers.js";
import { HOST_PLAYER, Host, SHIELD_ENMITY, SNAPSHOT_STEPS } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
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

    it("brings a world kept from before forward with none yet, taunted by no one, a player's own weighed by their calling (SNAPSHOT_STEPS 45)", () => {
        const forward = SNAPSHOT_STEPS[45]({
            version: 45,
            followers: [["follower-1", { calling: "warrior", level: 2 }], ["follower-2", { calling: "rogue", level: 2 }]],
            companions: [["called-1", { creature: "wolf", risen: false }]],
            battle: { actors: [{ id: "wolf" }, { id: "kept", enmity: { a: [1, 2] } }, { id: "follower-1" }, { id: "follower-2" }, { id: "called-1" }] },
        });

        assert.equal(forward.version, 46);
        assert.deepEqual(
            forward.battle.actors.map(({ enmity, taunted, enmityWeight }) => [enmity, taunted, enmityWeight]),
            [
                [{}, null, 1],
                [{ a: [1, 2] }, null, 1],
                [{}, null, ENMITY_WEIGHTS.warrior],
                [{}, null, ENMITY_WEIGHTS.rogue],
                [{}, null, ENMITY_WEIGHTS.called],
            ],
        );
    });

    it("is made to go for one who taunts it, a while, its enmity for them half again the most it has for anyone; not by another while it holds; its pack after them too", () => {
        const { battle, wolf, far } = fight();

        battle.add({ id: "packmate", kind: "beast", name: "Wolf", weapon: "wolf", team: WILD, square: [20, 40], ai: "wild", hp: 1e6, speed: 1, chase: 1, wild: { creature: "wolf", tier: 1, temper: "defensive", guard: 0, roam: 0, leash: 40, pack: "p", leader: null, menace: true } });
        run(battle, STEP_MS);
        wolf.enmity = { near: kept(battle, 100) };
        assert.equal(battle.taunt("far", "wolf"), true);
        assert.equal(wolf.target, "far");
        assert.equal(wolf.enmity.far[0], 100 * TAUNT.over);
        assert.deepEqual(wolf.taunted, { by: "far", at: battle.time, until: battle.time + TAUNT.ms });

        // (Held to them while it lasts, whatever the other does it; another's taunt not taking)
        wolf.enmity.near = kept(battle, 1000);
        assert.equal(battle.taunt("near", "wolf"), false, "the first's holds");
        run(battle, TAUNT.ms - 500);
        assert.equal(wolf.target, "far");

        // (Over: its enmity decides again)
        run(battle, 1000);
        assert.equal(wolf.target, "near");

        // (Its pack set against the taunter too: one on no one goes for them)
        assert.ok(battle.actor("packmate").enmity.far, "the pack's enmity seeded");
        assert.ok(!battle.taunt("far", "near"), "no one taunts one who keeps no enmity");
        assert.equal(far.dead, false);
    });

    it("has a war cry taunt every foe that can see the crier within its reach at once", () => {
        const { battle, wolf } = fight();

        battle.add({ id: "wolf-2", kind: "beast", name: "Wolf", weapon: "wolf", team: WILD, square: [33, 31], ai: "wild", hp: 1e6, speed: 1, chase: 1, wild: { creature: "wolf", tier: 1, temper: "aggressive", guard: 0, roam: 0, leash: 40, pack: "q", leader: null, menace: true } });
        battle.add({ id: "wolf-far", kind: "beast", name: "Wolf", weapon: "wolf", team: WILD, square: [50, 50], ai: "wild", hp: 1e6, speed: 1, chase: 1, wild: { creature: "wolf", tier: 1, temper: "aggressive", guard: 0, roam: 0, leash: 40, pack: "r", leader: null, menace: true } });
        run(battle, STEP_MS);

        const events = [];
        const took = battle.warCry("near");

        events.push(...run(battle, STEP_MS));
        assert.equal(took, 2);
        assert.deepEqual([wolf.target, battle.actor("wolf-2").target], ["near", "near"]);
        assert.equal(battle.actor("wolf-far").taunted, null, "too far off to hear it");
        assert.ok(wolf.taunted.until - wolf.taunted.at === TAUNT.cry.ms);
    });

    it("has healing set those on the one healed against the healer by half what it mends, shared; none on anyone else", () => {
        const { battle, wolf, near } = fight();

        battle.add({ id: "healer", kind: "player", weapon: "staff", team: "hero", square: [30, 36], hp: 1e6 });
        battle.add({ id: "wolf-2", kind: "beast", name: "Wolf", weapon: "wolf", team: WILD, square: [10, 10], ai: "wild", hp: 1e6, speed: 1, chase: 1, wild: { creature: "wolf", tier: 1, temper: "defensive", guard: 0, roam: 0, leash: 40, pack: "q", leader: null, menace: true } });
        battle.actor("healer").stunnedUntil = 0;
        run(battle, STEP_MS);
        assert.equal(wolf.target, "near");
        near.hp = 1000;

        const before = wolf.enmity.healer?.[0] ?? 0;
        const healed = run((battle.cast("healer", "vigor", "near"), battle), 3000).filter(({ type, id, by }) => type === "healed" && id === "near" && by === "healer");

        assert.ok(healed.length > 0, "healed");
        assert.ok(Math.abs(wolf.enmity.healer[0] - before - healed.reduce((sum, { amount }) => sum + amount * ENMITY.healing, 0)) < 1e-9);
        assert.equal(battle.actor("wolf-2").enmity.healer, undefined, "none for one not on them");
    });

    it("weighs each of a player's own by their calling: a warrior three times (four at its mastery), a ranger and a rogue less; a creature called twice, one raised half again", () => {
        assert.equal(mercenaryOf({ calling: "warrior", level: 3 }).enmity, ENMITY_WEIGHTS.warrior);
        assert.equal(mercenaryOf({ calling: "warrior", level: 10 }).enmity, ENMITY_WEIGHTS.master);
        assert.deepEqual(["ranger", "rogue", "mage", "cleric"].map((calling) => mercenaryOf({ calling, level: 5 }).enmity), [0.7, 0.5, 1, 1]);
        assert.ok(ENMITY_WEIGHTS.warrior > 1 && ENMITY_WEIGHTS.called > 1 && ENMITY_WEIGHTS.risen > 1);

        // (Its blows that much more)
        const { battle, wolf, far } = fight();

        run(battle, STEP_MS);
        Object.assign(far, { stunnedUntil: 0, enmityWeight: 3 });
        put(far, [wolf.square[0], wolf.square[1] - 1]);
        battle.strike("far", "wolf");

        const hits = run(battle, 2000).filter(({ type, by, id }) => type === "hit" && by === "far" && id === "wolf");

        assert.ok(hits.length > 0);
        assert.ok(Math.abs(wolf.enmity.far[0] - hits.reduce((sum, { damage }) => sum + Math.max(ENMITY.seed, damage) * 3, 0)) < 1e-9);
    });
});

describe("enmity in play (host.js)", () => {
    const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

    // A world with its player leading those given (as a character brings them), the orc gone
    function leading(followers, progress = {}) {
        const host = new Host(buildWorld({ seed: 2 }), { populate: false });

        host.join({ id: HOST_PLAYER, hero: HERO, progress: { gear: { mainHand: { id: HERO.weapon } }, ...progress }, followers });
        host.populate();
        Object.assign(host.battle.actor("orc"), { dead: true, respawnAt: Infinity });

        return { host, me: host.battle.actor(HOST_PLAYER), ids: [...host.followers.keys()] };
    }

    // A wolf set on the player beside them, hardy, that goes nowhere much
    function wolfOn(host, me) {
        host.battle.add({ id: "test-wolf", kind: "beast", name: "Wolf", weapon: "wolf", team: WILD, square: [me.square[0] + 2, me.square[1]], ai: "wild", hp: 1e6, speed: 1, chase: 1, wild: { creature: "wolf", tier: 1, temper: "aggressive", guard: 0, roam: 0, leash: 40, pack: "test-wolf", leader: null, menace: true } });

        const wolf = host.battle.actor("test-wolf");

        Object.assign(wolf, { target: me.id, enmity: { [me.id]: [50, host.battle.time + 60000] } });

        return wolf;
    }

    it("has a hired warrior taunt a foe off its leader as it comes to it, as often as its taunt's ready; its blows three times as much", () => {
        const { host, me, ids } = leading([{ name: "Tam", calling: "warrior", level: 3 }]);
        const tam = host.battle.actor(ids[0]);

        assert.equal(tam.enmityWeight, ENMITY_WEIGHTS.warrior);

        const wolf = wolfOn(host, me);
        let events = [];

        for (let t = 0; t < 6000 && !wolf.taunted; t += STEP_MS) {
            events.push(...host.advance(STEP_MS));
        }

        assert.equal(wolf.taunted?.by, ids[0], "taunted by Tam");
        assert.equal(wolf.target, ids[0]);
        assert.ok(events.some(({ type, id, by }) => type === "taunted" && id === wolf.id && by === ids[0]));
        assert.ok(tam.tauntReadyAt > host.battle.time, "its taunt spent");

        // (One its leader taunted lately left to them; unless they're badly hurt)
        host.battle.remove(wolf.id);
        tam.tauntReadyAt = 0;

        const third = wolfOn(host, me);

        third.taunted = { by: me.id, at: host.battle.time, until: host.battle.time + 4000 };
        events = [];

        for (let t = 0; t < 3000; t += STEP_MS) {
            events.push(...host.advance(STEP_MS));
        }

        assert.ok(!events.some(({ type, by }) => type === "taunted" && by === ids[0]), "the leader's taunt left to them");
        me.hp = Math.floor(me.maxHp * TAUNT.rescue) - 1;

        for (let t = 0; t < 3000 && third.taunted.by !== ids[0]; t += STEP_MS) {
            host.advance(STEP_MS);
        }

        assert.equal(third.taunted.by, ids[0], "rescued, badly hurt");
    });

    it("has a player with a shield in hand count for more in foes' enmity, by their Shield's rank; and covers them, told to, with a warrior; not with a rogue", () => {
        const shielded = leading([{ name: "Tam", calling: "warrior", level: 3 }, { name: "Pip", calling: "rogue", level: 3 }], { gear: { mainHand: { id: "sword" }, offHand: { id: "shield" } }, skills: { shield: 1e6 } });

        assert.equal(shielded.me.enmityWeight, 1 + SHIELD_ENMITY * 5);
        assert.equal(leading([]).me.enmityWeight, 1, "none without a shield");

        const [tam, pip] = shielded.ids;

        assert.equal(shielded.host.command(HOST_PLAYER, { type: "order", unit: tam, order: "cover" }).ok, true);
        assert.equal(shielded.host.battle.actor(tam).coverUntil, shielded.host.battle.time + TAUNT.cover);
        assert.equal(shielded.host.command(HOST_PLAYER, { type: "order", unit: pip, order: "cover" }).reason, "cover");
    });
});
