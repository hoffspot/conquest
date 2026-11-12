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
let ROLE_ARMS;
let SNAPSHOT_STEPS;
let buildWorld;
let squaresOf;
let decode;
let encode;
let world;

before(async () => {
    ({ Battle, STEP_MS } = await import("../client/js/core/battle.js"));
    ({ Host, HOST_PLAYER, FIELD_BATTLE, ROLE_ARMS, SNAPSHOT_STEPS } = await import("../client/js/core/host.js"));
    ({ buildWorld } = await import("../client/js/core/overworld.js"));
    ({ squaresOf } = await import("../client/js/core/grid.js"));
    ({ decode, encode } = await import("../client/js/core/wire.js"));
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

    // Whoever's drawn to a player near (#drawnTo) goes through the players by their places in
    // their list, where it went through them with `for...of`: the same battle either way, and one
    // in which the player was gone for
    it("plays out a battle exactly as going through the players with for...of does", () => {
        const sparing = fight();

        Battle.sparing = false;

        try {
            const iterated = fight();

            assert.equal(sparing.hash, iterated.hash);
        } finally {
            Battle.sparing = true;
        }

        assert.ok(sparing.events.some(({ type, id }) => type === "hit" && id === HOST_PLAYER), "(the player was struck)");
    });

    // Everything that asks who's near a point (#standingNear) or who's nearest within reach
    // (#hold, #obey), on an open field: a guard tower shooting from its loops, a player standing
    // among their enemies, the tower's own footprint within a swordsman's reach, casters whose
    // spells strike all round and leap on, bombs, a war cry and a slipping away, and one unseen
    // beside a beast that sees through it
    const melee = () => {
        const battle = new Battle({ blocked: Array.from({ length: 120 }, () => new Uint8Array(120)) }, { seed: 11 });
        const weapons = ["sword", "bow", "hammer", "staff", "gauntlets", "cleaver", "wand"];
        const spells = [["burstflame", "fireball"], ["lightning", "shockbolt"], ["shatterstone", "rumble"], ["steamblast", "waterbolt"]];
        const events = [];

        battle.add({ id: "hero", kind: "player", team: "a", weapon: "sword", square: [60, 58], hp: 4000, armed: true });
        battle.add({ id: "unseen", kind: "player", team: "a", weapon: "bow", square: [52, 60], hp: 4000 });
        battle.add({ id: "tower", kind: "fort", team: "a", weapon: "tower", square: [60, 70], ai: "fort", armed: true, hp: 1200, footprint: [58, 68, 62, 72] });
        battle.add({ id: "seer", kind: "beast", team: "b", weapon: "claws", square: [50, 57], ai: "wild", hp: 2000, wild: { creature: "wolf", tier: 8, temper: "aggressive", guard: 0, roam: 6, leash: 40, pack: null, leader: null } });

        for (const [team, y, to] of [
            ["a", 66, 50],
            ["b", 44, 60],
        ]) {
            for (let k = 0; k < 30; k++) {
                const x = 46 + (k % 15) * 2;
                const caster = k % 5 === 3;

                battle.add({ id: `${team}-${k}`, kind: "soldier", team, weapon: caster ? "staff" : weapons[(k + (team === "b")) % weapons.length], square: [x, y - Math.floor(k / 15) * 2 * (team === "a" ? -1 : 1)], ai: "patrol", patrol: [[x, to]], leash: 60, hp: 400, armed: k % 2 === 0, ...(caster ? { casts: spells[k % spells.length] } : {}), ...(k % 5 === 4 ? { heals: ["vigor", "mendWounds"] } : {}) });
            }
        }

        battle.buff("unseen", "invisibility", { ms: 20000 });

        for (let t = 0; t < 30000; t += STEP_MS) {
            const foe = battle.actors.find((other) => other.team === "b" && !other.dead && Math.hypot(other.x - battle.actor("hero").x, other.y - battle.actor("hero").y) < 9);

            // (Every two seconds, as each is allowed: a bomb among them, a cry, a slipping away)
            if (t % 2000 === 0 && foe) {
                battle.lob("hero", foe.id, { kind: "goblinBomb", damage: [6, 10], reach: 10 });
            }

            if (t % 3000 === 1000) {
                battle.warCry("hero");
                battle.slipAway("a-0");
            }

            events.push(...battle.advance(STEP_MS));
        }

        const state = battle.actors.map((actor) => [actor.id, actor.x, actor.y, actor.hp, actor.dead, actor.target, actor.facing, Object.keys(actor.seeing ?? {}).join()]);

        return { hash: createHash("sha1").update(JSON.stringify([state, battle.random.state, events.map((event) => [event.type, event.time, event.id, event.target, event.amount, event.damage, event.took, event.from])])).digest("hex"), events, battle };
    };

    it("finds those near a point, and the nearest within reach, exactly as looking through everyone does", () => {
        const indexed = melee();

        Battle.indexing = false;

        try {
            assert.equal(indexed.hash, melee().hash);
        } finally {
            Battle.indexing = true;
        }

        // (And all of it happened: the tower shot, the player struck, spells struck several at
        // once, a bomb burst, the cry took, and the unseen one was seen through)
        const types = (type, test = () => true) => indexed.events.filter((event) => event.type === type && test(event)).length;

        assert.ok(types("attack", ({ id }) => id === "tower") > 3, "the tower shoots");
        assert.ok(types("attack", ({ id }) => id === "hero") > 3, "the player strikes");
        assert.ok(types("blast") > 0, "a bomb bursts");
        assert.ok(types("cried", ({ took }) => took > 0) > 0, "a war cry takes");
        assert.ok(types("slipped") > 0, "one slips away");
        assert.ok(types("spell") > 10, "spells are cast");
        assert.ok(types("seen") > 0, "the unseen one is seen through");
    });

    it("brings the index up to date by moving those who've changed cell, and plays out exactly as making it afresh every time does", async () => {
        const { install, Probes, uninstall } = await import("../client/js/core/probe.js");
        const counted = (play) => {
            let ticks = 0;
            const probes = install(new Probes({ clock: () => ticks++ }));

            try {
                return { ...play(), counts: probes.toJSON().counts };
            } finally {
                uninstall();
            }
        };

        for (const play of [fight, melee]) {
            const moved = counted(play);

            Battle.reindexing = false;

            try {
                const afresh = counted(play);

                assert.equal(moved.hash, afresh.hash);

                // (Afresh, it was made at least once every step, over everyone; brought up to
                // date, only as someone came, went or fell out of the roster, and the rest of
                // the time those who'd crossed into another cell were moved)
                const steps = 30000 / STEP_MS;

                assert.ok(afresh.counts["battle.indexed"] >= steps && !afresh.counts["battle.reindexed"], `${afresh.counts["battle.indexed"]} made afresh`);
                assert.ok(moved.counts["battle.indexed"] < steps / 4, `${moved.counts["battle.indexed"]} made afresh of ${steps} steps`);
                assert.ok(moved.counts["battle.indexed"] + moved.counts["battle.reindexed"] === afresh.counts["battle.indexed"], "brought up to date exactly when it was made afresh before");
                assert.ok(moved.counts["battle.reindexedMoves"] > 50 && moved.counts["battle.reindexedMoves"] < moved.counts["battle.reindexed"] * 4, `${moved.counts["battle.reindexedMoves"]} moved to another cell in ${moved.counts["battle.reindexed"]} times`);
            } finally {
                Battle.reindexing = true;
            }
        }
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
    it("musters two armies before the player, theirs near and another people's further, each drawn up for battle, making for each other", () => {
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

        // (The player's people, and the orcs; each soldier with what its people's carry in its role
        // (their general, a two-hander's), in its side's bodies, core/engagement.js: its line's
        // three, and its general's household behind them)
        const armed = (actor, people) => actor.team === people && ROLE_ARMS[people][host.soldiers.get(actor.id).commander ? "heavy" : host.soldiers.get(actor.id).role].includes(actor.weapon);
        const bodies = (side) => [...new Set(side.map(({ formation }) => formation.id))].sort();

        assert.ok(ours.every((actor) => armed(actor, "human")));
        assert.ok(theirs.every((actor) => armed(actor, "orc")));
        assert.deepEqual(bodies(ours), ["left", "centre", "right", "vanguard"].map((part) => (part === "centre" ? "field-friend-0" : `field-friend-0:${part}`)).sort());
        assert.deepEqual(bodies(theirs), ["left", "centre", "right", "vanguard"].map((part) => (part === "centre" ? "field-foe-0" : `field-foe-0:${part}`)).sort());

        for (const side of [ours, theirs]) {
            const generals = side.filter(({ id }) => host.soldiers.get(id).commander);

            assert.equal(generals.length, 1, "a general each");
            assert.match(generals[0].name, /^General /);
            assert.equal(generals[0].formation.id, side.find(({ formation }) => formation.id.endsWith(":vanguard")).formation.id, "at the head of their household");
        }

        // (North of the player, the way they faced: theirs nearer, its line's rear `near` off, its
        // reserve and household behind it, the others further, the fronts `apart`)
        const ahead = (actor) => me.y - actor.y;
        const line = ours.filter(({ formation }) => !/:(reserve|vanguard)$/.test(formation.id));
        const front = Math.max(...ours.map(ahead));

        assert.ok(Math.abs(Math.min(...line.map(ahead)) - FIELD_BATTLE.near) < 2);
        assert.ok(Math.abs(Math.min(...theirs.map(ahead)) - front - FIELD_BATTLE.apart) < 2);

        // (The others everyone's enemies; theirs the player's friends)
        assert.ok(theirs.every((actor) => host.battle.hostile(actor, me) && host.battle.hostile(actor, ours[0])));
        assert.ok(ours.every((actor) => !host.battle.hostile(actor, me)));

        // (A minute on, they've met and fought)
        run(host, 60000);
        assert.ok(fielded.some(({ dead }) => dead));

        // (And every character in it, the player among them, is still of one shape: the same
        // properties in the same order, whatever each has been given since it was made, battle.js
        // OPTIONAL; carried on from a snapshot's text, they still are)
        const shapes = (battle) => [...new Set(battle.actors.map((actor) => Object.keys(actor).join()))];
        const kept = Host.restore(world, decode(encode(host.snapshot())));

        assert.equal(shapes(host.battle).length, 1, "one shape");
        assert.deepEqual(shapes(kept.battle), shapes(host.battle));
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

    // (Its soldiers, by side, and the lines they're in)
    const fieldOf = (host) => {
        const fielded = host.battle.actors.filter(({ id }) => id.startsWith("field-"));

        return { fielded, foes: fielded.filter(({ id }) => host.soldiers.get(id).field === "foe"), lines: [...new Set(fielded.map(({ formation }) => formation.id))] };
    };

    it("is let go once it's done: a side all fallen, the rest stand a while, then go, their lines with them", () => {
        const { host } = outOfTown();

        host.command(HOST_PLAYER, { type: "fieldBattle", size: 4 });

        const { fielded, foes, lines } = fieldOf(host);

        assert.equal(lines.length, 2);
        assert.deepEqual(
            host.fields.map(({ engagement: _engagement, ...field }) => field),
            [{ ids: fielded.map(({ id }) => id), formations: lines, at: host.battle.time, over: null }],
        );
        assert.deepEqual(
            host.fields[0].engagement.sides.map(({ key, bodies }) => [key, bodies.map(({ formation }) => formation)]),
            [
                ["friend", [lines[0]]],
                ["foe", [lines[1]]],
            ],
            "fought as a battle's fought, each side one body (core/engagement.js)",
        );

        // (The others all fallen: it's over, and the victors stand a while)
        for (const foe of foes) {
            Object.assign(foe, { dead: true, respawnAt: Infinity });
        }

        run(host, STEP_MS);

        const over = host.battle.time;

        assert.equal(host.fields[0].over, over);
        run(host, FIELD_BATTLE.linger - 2 * STEP_MS);
        assert.equal(fieldOf(host).fielded.length, fielded.length);

        // (Then they go, the fallen with them, and their lines)
        const events = run(host, 2 * STEP_MS);

        assert.equal(fieldOf(host).fielded.length, 0);
        assert.deepEqual(events.filter(({ type }) => type === "gone").map(({ id }) => id).sort(), fielded.map(({ id }) => id).sort());
        assert.deepEqual(host.fields, []);
        assert.ok(lines.every((id) => !host.battle.formations[id]));
    });

    it("is let go when it's gone on too long, whoever's left", () => {
        const { host } = outOfTown();

        host.command(HOST_PLAYER, { type: "fieldBattle", size: 3 });
        run(host, 10 * STEP_MS);
        assert.equal(host.fields[0].over, null, "(both sides standing)");

        host.fields[0].at = host.battle.time + STEP_MS - FIELD_BATTLE.lasts;
        run(host, STEP_MS);

        assert.equal(fieldOf(host).fielded.length, 0);
        assert.deepEqual(host.fields, []);
        assert.equal(host.battle.actors.filter(({ formation }) => formation?.id.startsWith("field-")).length, 0);
    });

    it("is kept in the host's snapshot till it's let go; and a world kept before then has its field soldiers let go too", () => {
        const { host } = outOfTown();

        host.command(HOST_PLAYER, { type: "fieldBattle", size: 2 });
        run(host, STEP_MS);

        const snapshot = host.snapshot();

        assert.deepEqual(Host.restore(world, snapshot).fields, host.fields);

        // (Version 27 kept no field battles: those it had, as one mustered as it's brought forward)
        const { fields, ...older } = snapshot;
        const forward = SNAPSHOT_STEPS[27]({ ...older, version: 27 });

        assert.equal(forward.version, 28);
        assert.deepEqual(forward.fields, [{ ids: fields[0].ids, formations: fields[0].formations, at: snapshot.battle.time, over: null }]);
        assert.deepEqual(SNAPSHOT_STEPS[27]({ ...older, soldiers: [], battle: { ...older.battle, formations: {} }, version: 27 }).fields, []);
    });
});
