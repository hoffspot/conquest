// An Action Bar blow at an enemy, and the stick (host.js #ability, battle.js strike, #obey,
// #move): in reach, struck where the player is, wherever they're going kept, the swing holding
// them a moment; out of reach while they steer, refused as a spell out of reach is, nothing spent;
// out of reach otherwise, after them at a run, the lock kept. A swing that's begun isn't called
// off by walking away.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Battle, STEP_MS } from "../client/js/core/battle.js";
import { BLOW_WAIT, HOST_PLAYER, Host } from "../client/js/core/host.js";
import { navigatorOf } from "../client/js/core/navigation.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { parseGrid } from "./helpers.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

const put = (actor, map, [x, y]) => Object.assign(actor, { map, square: [x, y], x: x + 0.5, y: y + 0.5, path: [], order: null, target: null });

const steps = (host, ms) => {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...host.advance(STEP_MS));
    }

    return events;
};

// The player with a sword and Power strike, and the orc beside them, `apart` squares off the way
// with the longest clear run from them (they're steered the other way, or along it), never stirring
function fight({ apart = 6, across = false } = {}) {
    const host = new Host(buildWorld({ seed: 2 }), { populate: false });

    host.join({ id: HOST_PLAYER, hero: HERO, progress: { gear: { mainHand: { id: "sword" } }, skills: { blade: 300 } } });
    host.populate();

    const player = host.battle.actor(HOST_PLAYER);
    const orc = host.battle.actor("orc");
    const navigator = navigatorOf(host.battle.maps[player.map]);
    const clear = (facing) => {
        const ray = navigator.raycast([player.x, player.y], [player.x + Math.sin(facing) * 30, player.y + Math.cos(facing) * 30]);

        return ray ? Math.hypot(ray.point[0] - player.x, ray.point[1] - player.y) : 0;
    };
    const ways = Array.from({ length: 32 }, (_, k) => (k / 32) * Math.PI * 2).sort((a, b) => clear(b) - clear(a));
    const way = ways[0];
    // (The orc off to one side of the way, or along it behind them)
    const side = across ? way + Math.PI / 2 : way + Math.PI;

    put(orc, player.map, [Math.floor(player.x + Math.sin(side) * apart), Math.floor(player.y + Math.cos(side) * apart)]);
    Object.assign(orc, { hp: 1e6, maxHp: 1e6, stunnedUntil: Infinity, patrol: [orc.square] });

    return { host, player, orc, way, progress: host.players.get(HOST_PLAYER) };
}

const lockOn = (host) => host.command(HOST_PLAYER, { type: "engage", target: "orc", stand: true, lock: true });

describe("an Action Bar blow, and the stick (host.js #ability, battle.js strike)", () => {
    it(`refuses a blow at a locked enemy further than ${BLOW_WAIT.near} m off while the player's steering, as a spell out of reach: nothing spent, nothing cooling down, still running the way they're steered`, () => {
        const { host, player, way, progress } = fight({ apart: 8 });

        lockOn(host);
        assert.equal(player.lock, "orc");
        assert.deepEqual(host.command(HOST_PLAYER, { type: "ahead", facing: way, run: true, reach: 30 }), { ok: true });
        assert.equal(player.order.held, true, "held input's move");
        steps(host, 400);

        const before = [player.x, player.y];

        assert.deepEqual(host.command(HOST_PLAYER, { type: "ability", ability: "powerStrike", target: "orc" }), { ok: false, reason: "range" });
        assert.equal(player.empowered ?? null, null);
        assert.equal(progress.readyAt.powerStrike ?? 0, 0, "still ready");
        assert.equal(player.order.type, "move");
        assert.equal(player.lock, "orc", "still locked on");

        steps(host, 500);
        assert.ok(Math.hypot(player.x - before[0], player.y - before[1]) > 2, "going on the way they're steered");
    });

    it("waits a moment on a blow at a locked enemy near but not yet in reach while steering, and strikes it as they come into reach, still steering", () => {
        const { host, player, way } = fight({ apart: 3 });

        Object.assign(player, { lock: "orc", armed: true });

        // (Steered past it: toward it, a little to one side)
        const orc = host.battle.actor("orc");
        const toward = Math.atan2(orc.x - player.x, orc.y - player.y) + 0.2;

        host.command(HOST_PLAYER, { type: "ahead", facing: toward, run: true, reach: 30 });
        assert.ok(!host.battle.reachable(HOST_PLAYER, "orc"), "out of reach at first");
        assert.deepEqual(host.command(HOST_PLAYER, { type: "ability", ability: "powerStrike", target: "orc" }), { ok: true });
        assert.equal(player.striking.target, "orc");
        assert.equal(player.striking.until, host.battle.time + BLOW_WAIT.ms);

        let swung = false;

        for (let t = 0; t < BLOW_WAIT.ms && !swung; t += STEP_MS) {
            host.advance(STEP_MS);
            swung = Boolean(player.attack && player.attack.target === "orc");
        }

        assert.ok(swung, "struck as it came into reach");
        assert.equal(player.order?.held, true, "still steering");
        assert.ok(way !== null);
    });

    it("gives a blow waited on back if its target never comes into reach: refused (unstruck), ready again at once, the next blow no stronger, still running", () => {
        const { host, player, way, progress } = fight({ apart: 2.5 });

        Object.assign(player, { lock: "orc", armed: true });
        host.command(HOST_PLAYER, { type: "ahead", facing: way, run: true, reach: 30 });
        assert.deepEqual(host.command(HOST_PLAYER, { type: "ability", ability: "powerStrike", target: "orc" }), { ok: true });
        assert.ok(progress.readyAt.powerStrike > host.battle.time, "cooling down while it's waited on");

        const events = steps(host, BLOW_WAIT.ms + 200);
        const unstruck = events.filter(({ type, id }) => type === "unstruck" && id === HOST_PLAYER);

        assert.deepEqual(unstruck.map(({ target, tag }) => [target, tag]), [["orc", "powerStrike"]]);
        assert.equal(progress.readyAt.powerStrike, 0, "ready again");
        assert.equal(player.empowered ?? null, null, "no stronger");
        assert.equal(player.striking, null);
        assert.equal(player.attack ?? null, null, "never swung");
        assert.equal(player.order?.held, true, "still running the way they're steered");
    });

    it("standing still, goes after a locked enemy out of reach at a run, the lock kept, and strikes it once in reach, the blow made stronger", () => {
        const { host, player, progress } = fight({ apart: 6 });

        lockOn(host);
        steps(host, 200);
        assert.deepEqual(host.command(HOST_PLAYER, { type: "ability", ability: "powerStrike", target: "orc" }), { ok: true });
        assert.deepEqual(player.order, { type: "engage", target: "orc", run: true });
        assert.equal(player.lock, "orc", "the lock kept");
        assert.ok(progress.readyAt.powerStrike > host.battle.time, "cooling down");

        const hit = steps(host, 6000).find(({ type, by, id }) => type === "hit" && by === HOST_PLAYER && id === "orc");

        assert.ok(hit, "struck it");
        assert.equal(player.empowered, null, "the stronger blow spent on it");
    });

    it("strikes a locked enemy in reach where the player is, the swing holding them a moment, then goes on the way they're steered (not turned to go after it)", () => {
        const { host, player, way } = fight({ apart: 1, across: true });

        // (In a fight already: locked on it, the sword out)
        Object.assign(player, { lock: "orc", armed: true });
        host.command(HOST_PLAYER, { type: "ahead", facing: way, run: true, reach: 30 });
        assert.deepEqual(host.command(HOST_PLAYER, { type: "ability", ability: "powerStrike", target: "orc" }), { ok: true });
        assert.deepEqual(player.striking, { target: "orc", until: null, tag: "powerStrike" });
        assert.equal(player.order.held, true, "still steering");

        // (The swing begun)
        let swung = false;

        for (let t = 0; t < 300 && !swung; t += STEP_MS) {
            host.advance(STEP_MS);
            swung = Boolean(player.attack && player.attack.target === "orc");
        }

        assert.ok(swung, "struck at it");

        // (Held while it swings: not moved)
        const at = [player.x, player.y];

        while (player.attack) {
            host.advance(STEP_MS);
            assert.deepEqual([player.x, player.y], at, "held by the swing");
        }

        // (Then on the way they were going)
        steps(host, 600);
        assert.equal(player.order?.type, "move");
        assert.ok(Math.hypot(player.x - at[0], player.y - at[1]) > 1.5, "going on");
        assert.equal(player.striking, null);
    });
});

describe("a swing begun (battle.js order)", () => {
    const open = (width, height) => ({ blocked: parseGrid(Array.from({ length: height }, () => ".".repeat(width))).map((row) => Uint8Array.from(row)) });
    const advance = (battle, ms) => {
        const events = [];

        for (let t = 0; t < ms; t += STEP_MS) {
            events.push(...battle.advance(STEP_MS));
        }

        return events;
    };

    it("doesn't call off a swing that hasn't landed when the player walks away: it lands, then they go", () => {
        const battle = new Battle(open(30, 9), { seed: 3 });
        const player = battle.add({ id: "player", kind: "player", weapon: "sword", team: "hero", square: [5, 4], armed: true });
        const orc = battle.add({ id: "orc", kind: "orc", weapon: "cleaver", team: "orcs", square: [6, 4], hp: 5000 });

        orc.stunnedUntil = Infinity;
        battle.command("player", { type: "engage", target: "orc", stand: true });

        for (let t = 0; t < 2000 && !player.attack; t += STEP_MS) {
            battle.advance(STEP_MS);
        }

        assert.ok(player.attack && !player.attack.struck, "a swing begun");

        const swing = player.attack;

        battle.command("player", { type: "move", to: [20, 4] });
        assert.equal(player.attack, swing, "not called off");

        const events = advance(battle, 1500);

        assert.ok(events.some(({ type, by }) => (type === "hit" || type === "miss") && by === "player"), "it landed");
        assert.ok(player.x > 6, "then they went");
    });
});
