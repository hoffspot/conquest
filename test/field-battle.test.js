// Battles of hundreds (docs/GAME.md *Crowds*): the battle looks for the nearest enemy, who's in the
// way and who's on a square among those near (core/battle.js #indexed), which makes no difference
// to what happens; and the debug overlay's field battle (core/host.js FIELD_BATTLE): two armies
// mustered before the player, theirs beside them and the others' everyone's enemies
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { before, describe, it } from "node:test";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "bow", boots: false });

let Battle;
let STEP_MS;
let Host;
let HOST_PLAYER;
let FIELD_BATTLE;
let buildWorld;
let squaresOf;
let world;

before(async () => {
    ({ Battle, STEP_MS } = await import("../client/js/core/battle.js"));
    ({ Host, HOST_PLAYER, FIELD_BATTLE } = await import("../client/js/core/host.js"));
    ({ buildWorld } = await import("../client/js/core/overworld.js"));
    ({ squaresOf } = await import("../client/js/core/grid.js"));
    world = buildWorld({ seed: 2 });
});

// A player in the world, on open ground well out of town (facing north), with its host
function outOfTown() {
    const host = new Host(world, { populate: false });

    host.join({ id: HOST_PLAYER, hero: HERO });

    const me = host.battle.actor(HOST_PLAYER);
    const squares = squaresOf(host.battle.maps.town);
    const open = (x0, y0) => {
        for (let y = y0 - 70; y < y0 + 10; y++) {
            for (let x = x0 - 25; x < x0 + 25; x++) {
                if (squares.blocked(x, y) || squares.opaque(x, y)) {
                    return false;
                }
            }
        }

        return true;
    };

    for (let r = 60; r < 1500; r += 20) {
        for (let a = 0; a < 24; a++) {
            const [x, y] = [Math.round(me.x + r * Math.cos((a * Math.PI) / 12)), Math.round(me.y + r * Math.sin((a * Math.PI) / 12))];

            if (open(x, y)) {
                host.battle.place(HOST_PLAYER, "town", [x, y], { facing: Math.PI });

                return { host, me };
            }
        }
    }

    throw new Error("no open ground");
}

const run = (host, ms) => {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...host.advance(STEP_MS));
    }

    return events;
};

describe("the battle among those near (battle.js #indexed)", () => {
    // Two lines of soldiers making for each other past the player, of every weapon: everything that
    // happens, and where everyone ends, hashed
    const fight = () => {
        const { host, me } = outOfTown();
        const battle = host.battle;
        const weapons = ["sword", "bow", "hammer", "staff", "gauntlets", "cleaver", "wand"];

        for (const [team, from, to] of [
            ["a", -4, -40],
            ["b", -40, -4],
        ]) {
            for (let k = 0; k < 24; k++) {
                const x = Math.floor(me.x - 12 + (k % 12) * 2);

                battle.add({ id: `${team}-${k}`, kind: "soldier", team, weapon: weapons[(k + (team === "b")) % weapons.length], square: [x, Math.floor(me.y + from - Math.floor(k / 12) * 2)], ai: "patrol", patrol: [[x, Math.floor(me.y + to)]], leash: 60, armed: k % 2 === 0 });
            }
        }

        battle.command(HOST_PLAYER, { type: "move", to: [Math.floor(me.x), Math.floor(me.y - 22)] });

        const events = run(host, 30000);
        const state = battle.actors.map((actor) => [actor.id, actor.x, actor.y, actor.hp, actor.dead, actor.target, actor.facing]);

        return { hash: createHash("sha1").update(JSON.stringify([state, events.map((event) => [event.type, event.time, event.id, event.target, event.amount])])).digest("hex"), events, battle };
    };

    it("plays out a battle exactly as looking through everyone does", () => {
        const indexed = fight();

        Battle.indexing = false;

        try {
            const everyone = fight();

            assert.equal(indexed.hash, everyone.hash);
        } finally {
            Battle.indexing = true;
        }

        // (And there was a battle: blows, and the fallen on both sides)
        assert.ok(indexed.events.filter(({ type }) => type === "death").length > 10);
        assert.ok(["a", "b"].every((team) => indexed.battle.actors.some((actor) => actor.team === team && actor.dead)));
    });

    it("finds everyone by id as they come and go, and after it's carried on from a snapshot", () => {
        const { host } = outOfTown();
        const battle = host.battle;
        const me = battle.actor(HOST_PLAYER);

        battle.add({ id: "x", kind: "soldier", team: "a", weapon: "sword", square: [me.square[0] + 3, me.square[1]], ai: "patrol", patrol: [[me.square[0] + 3, me.square[1]]] });
        assert.equal(battle.actor("x").id, "x");
        assert.ok(battle.remove("x"));
        assert.equal(battle.actor("x"), null);
        battle.add({ id: "y", kind: "soldier", team: "a", weapon: "sword", square: [me.square[0] + 3, me.square[1]], ai: "patrol", patrol: [[me.square[0] + 3, me.square[1]]] });

        const again = Battle.restore(world, battle.snapshot());

        assert.equal(again.actor("y").id, "y");
        assert.equal(again.actor(HOST_PLAYER).id, HOST_PLAYER);
        assert.equal(again.actor("x"), null);
    });
});

describe("a field battle (host.js FIELD_BATTLE: the debug overlay's)", () => {
    it("musters two armies before the player, theirs near and another people's further, making for each other", () => {
        const { host, me } = outOfTown();
        const result = host.command(HOST_PLAYER, { type: "fieldBattle", size: 30, facing: Math.PI });
        const events = run(host, STEP_MS);
        const fielded = host.battle.actors.filter(({ id }) => id.startsWith("field-"));
        const ours = fielded.filter(({ id }) => host.soldiers.get(id).field === "friend");
        const theirs = fielded.filter(({ id }) => host.soldiers.get(id).field === "foe");

        assert.equal(result.ok, true);
        assert.equal(ours.length, 30);
        assert.equal(theirs.length, 30);
        assert.deepEqual(events.find(({ type }) => type === "fieldBattle").ids.sort(), fielded.map(({ id }) => id).sort());

        // (The player's people, and the orcs; each soldier with one of its people's weapons or a hammer)
        assert.ok(ours.every(({ team, weapon }) => team === "human" && ["sword", "bow", ...FIELD_BATTLE.arms].includes(weapon)));
        assert.ok(theirs.every(({ team, weapon }) => team === "orc" && ["cleaver", ...FIELD_BATTLE.arms].includes(weapon)));

        // (North of the player, the way they faced: theirs nearer, the others further off)
        const ahead = (actor) => me.y - actor.y;

        assert.ok(ours.every((actor) => ahead(actor) > 0 && ahead(actor) < FIELD_BATTLE.near + 6));
        assert.ok(theirs.every((actor) => ahead(actor) > FIELD_BATTLE.far - 6));

        // (The others everyone's enemies; theirs the player's friends)
        assert.ok(theirs.every((actor) => host.battle.hostile(actor, me) && host.battle.hostile(actor, ours[0])));
        assert.ok(ours.every((actor) => !host.battle.hostile(actor, me)));

        // (A minute on, they've met and fought)
        run(host, 60000);
        assert.ok(fielded.some(({ dead }) => dead));
    });

    it("is refused out of the world, too big or too small, or to anyone but the world's own player", () => {
        const { host } = outOfTown();

        for (const size of [0, FIELD_BATTLE.most + 1, 2.5, "10"]) {
            assert.equal(host.command(HOST_PLAYER, { type: "fieldBattle", size }).ok, false, `${size} a side`);
        }

        host.join({ id: "guest", hero: { ...HERO, name: "Bo" } });
        assert.equal(host.command("guest", { type: "fieldBattle", size: 10 }).ok, false);
        assert.equal(host.battle.actors.filter(({ id }) => id.startsWith("field-")).length, 0);
    });

    it("is kept in the host's snapshot, and numbers its soldiers on from there", () => {
        const { host } = outOfTown();

        host.command(HOST_PLAYER, { type: "fieldBattle", size: 5 });

        const again = Host.restore(world, host.snapshot());

        assert.equal(again.fielded, 10);
        assert.equal(again.soldiers.get("field-0").field, "friend");
        assert.equal(again.soldiers.get("field-9").field, "foe");
        again.command(HOST_PLAYER, { type: "fieldBattle", size: 1 });
        assert.ok(again.battle.actor("field-10") && again.battle.actor("field-11"));
    });
});
