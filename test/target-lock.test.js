// Locked on an enemy (Auto target lock: battle.js `lock`, #keepLock): set on it with lock: true,
// it stays the player's target wherever they go, running from it among them, and is struck before
// whoever's nearer once they stand again, till it falls or is LOCK_REACH off; set on another,
// the lock goes with them (locked on it) or is let go (not); an "unlock" lets go, set on no one.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Battle, LOCK_REACH, STEP_MS } from "../client/js/core/battle.js";
import { HOST_PLAYER, Host, SNAPSHOT_STEPS, SNAPSHOT_VERSION } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { parseGrid } from "./helpers.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "bow", boots: false });

const open = (width, height) => ({ blocked: parseGrid(Array.from({ length: height }, () => ".".repeat(width))).map((row) => Uint8Array.from(row)) });

function run(battle, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...battle.advance(STEP_MS));
    }

    return events;
}

// A player with a bow, and two orcs that don't stir: "near" 4 m off, "far" 8 m off, both within a
// bow's shot
function field({ width = 60 } = {}) {
    const battle = new Battle(open(width, 5), { seed: 5 });
    const player = battle.add({ id: "player", kind: "player", weapon: "bow", team: "hero", square: [2, 2] });
    const near = battle.add({ id: "near", kind: "orc", weapon: "cleaver", team: "orcs", square: [6, 2], hp: 5000 });
    const far = battle.add({ id: "far", kind: "orc", weapon: "cleaver", team: "orcs", square: [10, 2], hp: 5000 });

    for (const orc of [near, far]) {
        orc.stunnedUntil = Infinity;
    }

    return { battle, player, near, far };
}

const shotAt = (events) => new Set(events.filter((event) => event.type === "attack" && event.id === "player").map(({ target }) => target));

const moveTo = (actor, x, y) => Object.assign(actor, { x: x + 0.5, y: y + 0.5, square: [x, y] });

describe("locked on an enemy (battle.js lock)", () => {
    it("keeps it the target as the player walks off from it, and shoots it, not whoever's nearer, once they stand", () => {
        const { battle, player } = field();

        assert.equal(player.lock, null, "locked on no one to start with");

        battle.command("player", { type: "engage", target: "far", stand: true, lock: true });
        assert.equal(player.lock, "far");
        assert.deepEqual(player.order, { type: "engage", target: "far", run: false, stand: true });

        // Walking off: no longer set on it, but locked on it still
        battle.command("player", { type: "move", to: [2, 4] });
        assert.equal(player.order.type, "move");
        run(battle, 3000);
        assert.equal(player.order, null, "got there");
        assert.equal(player.lock, "far");

        // Standing: the one locked on shot, though the other's nearer
        assert.deepEqual(shotAt(run(battle, 4000)), new Set(["far"]));
    });

    it("without a lock, standing, shoots whoever's nearest, as ever", () => {
        const { battle, player } = field();

        battle.command("player", { type: "engage", target: "far", stand: true });
        assert.equal(player.lock, null);
        battle.command("player", { type: "move", to: [2, 4] });
        run(battle, 3000);
        assert.deepEqual(shotAt(run(battle, 4000)), new Set(["near"]));
    });

    it(`lets it go once it's ${LOCK_REACH} m off, not before`, () => {
        assert.equal(LOCK_REACH, 40);

        const { battle, player, far } = field({ width: 80 });

        battle.command("player", { type: "engage", target: "far", stand: true, lock: true });
        moveTo(far, 2 + 39, 2);
        run(battle, STEP_MS * 2);
        assert.equal(player.lock, "far", "39 m off: kept");

        moveTo(far, 2 + 40, 2);
        run(battle, STEP_MS * 2);
        assert.equal(player.lock, null, "40 m off: let go");
    });

    it("lets it go once it's fallen", () => {
        const { battle, player, far } = field();

        battle.command("player", { type: "engage", target: "far", stand: true, lock: true });
        far.hp = 1;
        run(battle, 4000);
        assert.ok(far.dead, "shot down");
        assert.equal(player.lock, null);
    });

    it("lets it go once the player's fallen", () => {
        const { battle, player } = field();

        battle.command("player", { type: "engage", target: "far", stand: true, lock: true });
        Object.assign(player, { dead: true, respawnAt: Infinity });
        run(battle, STEP_MS * 2);
        assert.equal(player.lock, null);
    });

    it("lets it go once it's somewhere else (through a door), unless the player's going after it", () => {
        const { battle, player, far } = field();

        battle.command("player", { type: "engage", target: "far", lock: true });
        far.map = "cellar";
        run(battle, STEP_MS);
        assert.equal(player.lock, "far", "going after it: kept");

        // (No way after it here: given up, and the lock with it)
        assert.equal(player.order, null);
        run(battle, STEP_MS);
        assert.equal(player.lock, null, "not going after it: let go");
    });

    it("goes with the player's choice: set on another locked, locked on it instead; set on another without, let go; set on it again without, kept", () => {
        const { battle, player } = field();

        battle.command("player", { type: "engage", target: "far", stand: true, lock: true });
        battle.command("player", { type: "engage", target: "near", stand: true, lock: true });
        assert.equal(player.lock, "near", "swapped");

        battle.command("player", { type: "engage", target: "near", run: true });
        assert.equal(player.lock, "near", "the same one, run at: kept");

        battle.command("player", { type: "engage", target: "far", stand: true });
        assert.equal(player.lock, null, "another, without: let go");
        assert.equal(player.order.target, "far", "and set on it");
    });

    it("is let go by an unlock, set on no one; anywhere else they were going, still going", () => {
        const { battle, player, far } = field();

        moveTo(far, 30, 2);
        battle.command("player", { type: "engage", target: "far", lock: true });
        run(battle, 500);
        assert.ok(player.path.length, "going after it");

        battle.command("player", { type: "unlock" });
        assert.equal(player.lock, null);
        assert.equal(player.order, null, "set on no one");
        assert.equal(player.path.length, 0, "stopped");

        battle.command("player", { type: "engage", target: "far", lock: true });
        battle.command("player", { type: "move", to: [2, 4] });
        battle.command("player", { type: "unlock" });
        assert.equal(player.lock, null);
        assert.equal(player.order.type, "move", "still walking off");
    });
});

describe("locked on an enemy, by the host (host.js command)", () => {
    const world = buildWorld({ seed: 2 });

    it("locks on with an engage's lock: true, and lets go with an unlock", () => {
        const host = new Host(world, { populate: false });

        host.join({ id: HOST_PLAYER, hero: HERO });

        const me = host.battle.actor(HOST_PLAYER);

        host.battle.add({ id: "test-orc", kind: "orc", weapon: "cleaver", team: "orcs", square: [me.square[0] + 4, me.square[1]], hp: 5000 }).stunnedUntil = Infinity;
        assert.equal(me.lock, null);
        assert.equal(host.command(HOST_PLAYER, { type: "engage", target: "test-orc", stand: true, lock: true }).ok, true);
        assert.equal(me.lock, "test-orc");

        // (Kept with the world)
        assert.equal(Host.restore(world, host.snapshot()).battle.actor(HOST_PLAYER).lock, "test-orc");

        assert.equal(host.command(HOST_PLAYER, { type: "unlock" }).ok, true);
        assert.equal(me.lock, null);
        assert.equal(me.order, null);

        // (Set on it without: not locked on)
        host.command(HOST_PLAYER, { type: "engage", target: "test-orc", stand: true });
        assert.equal(me.lock, null);
    });

    it("brings a world kept before there were locks forward, everyone locked on no one", () => {
        assert.ok(SNAPSHOT_VERSION >= 40);

        const kept = { version: 39, players: [], battle: { actors: [{ id: "a" }, { id: "b", lock: "a" }] } };

        assert.deepEqual(SNAPSHOT_STEPS[39](kept), { version: 40, players: [], battle: { actors: [{ lock: null, id: "a" }, { id: "b", lock: "a" }] } });
    });
});
