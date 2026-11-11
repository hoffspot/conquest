// What a snapshot of the world holds (core/host.js snapshot, #load), against what the world is.
// The two are kept by hand, a long list each, and a field of the world's left out of them is one
// a copy made from a snapshot begins afresh: a clock begun again sends the war's messengers, or
// rolls the world's dice, at another step than the host's, and the copy goes astray. So a world
// played two minutes, a fight in it, is kept and carried on, and every field of the host, the
// battle and each character must come back as it was, or be listed here with why it needn't.
// The same of a copy set right in place (Host.adopt), its rare encounters too. And how each
// character is kept (core/keptactor.js): without what it has as one just added has it.
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { HOST_PLAYER, Host, SNAPSHOT_VERSION } from "../client/js/core/host.js";
import { ACTOR_DEFAULTS, ACTOR_FIELDS, spareActor, wholeActor } from "../client/js/core/keptactor.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { decode, encode } from "../client/js/core/wire.js";

/**
 * The host's fields a snapshot needn't hold, and why. A field added to the host that the rules
 * read goes in the snapshot (snapshot and #load, with a step in SNAPSHOT_STEPS); only one that's
 * made again from what is kept, or that isn't the world's, goes here.
 */
const NOT_KEPT = Object.freeze({
    world: "the land itself: made again from the snapshot's seed",
    battle: "kept, and compared field by field below",
    war: "kept as the war keeps itself (War.snapshot), compared as that",
    legends: "kept as they keep themselves (Legends.toJSON), compared as that",
    recorder: "whoever's listening to this world (netplay's Hosting), not the world",
    replay: "the host's ways waiting on a joined copy, not the world",
    findables: "made on first use from the world's plan",
    keepSites: "made on first use from the world's plan",
    settlementPlaces: "made on first use from the world's plan",
    stockaded: "made from the war's forts, as the war changes them",
});

/** The battle's fields its snapshot needn't hold, and why. */
const BATTLE_NOT_KEPT = Object.freeze({
    world: "the land itself",
    actors: "kept, each compared field by field below",
    navigation: "the navigation meshes: made as each copy needs them, the ways found sent (netplay's v ops)",
    onPath: "whoever's listening for the ways found",
    replay: "the host's ways waiting on a joined copy",
    relations: "the host's own answer, given the battle again",
    allied: "the host's own answer, given the battle again",
    haven: "the host's own answer, given the battle again",
    nerve: "the host's own answer, given the battle again",
    sworn: "the host's own answer, given the battle again",
    random: "kept as its state, compared as that",
    light: "worked out afresh each step by the host (#light)",
    lightMap: "worked out afresh each step by the host (#light)",
    bakedOnly: "a forecast's battle's alone",
});

// A value as plain data to compare: a Map as its entries in order of their keys (what it holds,
// not the order it came to hold it in), a Set as its members in order; anything of a class of its
// own by its JSON if it has one (its state, for dice), else only named (the land, a mesh: never
// followed into)
function plain(value, depth = 0) {
    if (typeof value === "function") {
        return "<function>";
    }

    if (depth > 12) {
        return "<deep>";
    }

    if (value instanceof Map) {
        return { $map: [...value.entries()].map(([key, each]) => [plain(key, depth + 1), plain(each, depth + 1)]).sort((a, b) => (JSON.stringify(a[0]) < JSON.stringify(b[0]) ? -1 : 1)) };
    }

    if (value instanceof Set) {
        return { $set: [...value].map((each) => plain(each, depth + 1)).sort() };
    }

    if (ArrayBuffer.isView(value)) {
        return { $bytes: value.length, sum: value.reduce((sum, each) => (sum + each) | 0, 0) };
    }

    if (Array.isArray(value)) {
        return value.map((each) => plain(each, depth + 1));
    }

    if (value && typeof value === "object") {
        const proto = Object.getPrototypeOf(value);

        if (typeof value.toJSON === "function") {
            return plain(value.toJSON(), depth + 1);
        }

        if ("state" in value && typeof value.next === "function") {
            return { $dice: value.state };
        }

        if (proto !== Object.prototype && proto !== null) {
            return `<${proto.constructor?.name}>`;
        }

        return Object.fromEntries(
            Object.keys(value)
                .sort()
                .map((key) => [key, plain(value[key], depth + 1)]),
        );
    }

    return typeof value === "number" && !Number.isFinite(value) ? String(value) : value;
}

// The fields of `a` and `b` that aren't alike, but for those in `skip`
function unlike(a, b, skip = {}) {
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((key) => !Object.hasOwn(skip, key) && JSON.stringify(plain(a[key])) !== JSON.stringify(plain(b[key])));
}

// Every field of a host and of a copy of it that should be alike, checked
function assertAlike(host, copy, what) {
    assert.deepEqual(unlike(host, copy, NOT_KEPT), [], `${what}: the host's fields a snapshot doesn't carry (put each in Host.snapshot and #load, or in NOT_KEPT with why)`);
    assert.deepEqual(unlike(host.battle, copy.battle, BATTLE_NOT_KEPT), [], `${what}: the battle's fields its snapshot doesn't carry`);
    assert.equal(host.battle.random.state, copy.battle.random.state, `${what}: the battle's dice`);
    assert.equal(host.random.state, copy.random.state, `${what}: the world's dice`);
    assert.deepEqual(plain(copy.war?.snapshot() ?? null), plain(host.war?.snapshot() ?? null), `${what}: the war`);
    assert.deepEqual(copy.legends.toJSON(), host.legends.toJSON(), `${what}: the rare encounters`);
    assert.equal(copy.battle.actors.length, host.battle.actors.length, `${what}: how many characters`);

    const fields = new Set();

    host.battle.actors.forEach((actor, index) => {
        for (const key of unlike(actor, copy.battle.actors[index])) {
            fields.add(key);
        }
    });

    assert.deepEqual([...fields], [], `${what}: characters' fields their snapshot doesn't carry`);
    assert.equal(copy.checksum(), host.checksum(), `${what}: the checksum`);
}

describe("what a snapshot holds (core/host.js snapshot, #load; core/keptactor.js)", () => {
    let host;
    let early;

    // Two minutes of a world: two players, one walking about and into the wilds, a field battle
    // begun at 70 s (so the war's messengers come, and soldiers fall), and a snapshot taken early
    before(() => {
        host = new Host(buildWorld({ seed: 2 }), { populate: false });
        host.join({ id: HOST_PLAYER, hero: { name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false } });
        host.join({ id: "guest-1", hero: { name: "Bryn", shape: {}, look: {}, weapon: "bow", boots: false, race: "human" }, progress: { gold: 50 } });
        host.populate();

        let dice = 7;
        const roll = () => ((dice = (Math.imul(dice, 1103515245) + 12345) >>> 0) / 2 ** 32 - 0.5) * 2;

        for (let t = 0; t < 125000; t += STEP_MS) {
            if (t % 5000 === 0) {
                const me = host.battle.actor(HOST_PLAYER);

                host.command(HOST_PLAYER, { type: "move", to: [Math.round(me.x + roll() * 20), Math.round(me.y + roll() * 20)] });
            }

            if (t === 10000) {
                early = decode(encode(host.snapshot()));
            }

            if (t === 70000) {
                assert.equal(host.command(HOST_PLAYER, { type: "fieldBattle", size: 15, facing: 0 }).ok, true);
            }

            host.advance(STEP_MS);
        }
    });

    it("carries every field of the host, the battle and each character to a world carried on from it", () => {
        // (The played world has what the guard is for: clocks running, the messengers out)
        assert.ok(host.messengersAt > 0 && host.messengers.size > 0, "the war's messengers have been sent");
        assert.ok(Number.isFinite(host.rareLooked), "the wilds director has looked at the rare encounters' clock");

        const copy = Host.restore(buildWorld({ seed: 2 }), decode(encode(host.snapshot())));

        assertAlike(host, copy, "carried on");

        // (And both play on alike)
        for (let k = 0; k < 200; k++) {
            host.advance(STEP_MS);
            copy.advance(STEP_MS);
        }

        assertAlike(host, copy, "played on 10 s");
    });

    it("sets a copy right in place with all of it, its rare encounters too (Host.adopt)", () => {
        const copy = Host.restore(buildWorld({ seed: 2 }), early);

        // (As the copy was: far behind the host, the rare encounters' clock with it)
        assert.ok(copy.legends.played < host.legends.played);

        copy.adopt(decode(encode(host.snapshot())));
        assertAlike(host, copy, "set right");
    });

    it("keeps when the Order's court last warned each player off, and lets go of it as they leave", () => {
        const world = buildWorld({ seed: 2 });
        const one = new Host(world, { populate: false });

        one.join({ id: HOST_PLAYER, hero: { name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false } });
        one.join({ id: "guest-1", hero: { name: "Bryn", shape: {}, look: {}, weapon: "bow", boots: false, race: "human" } });
        one.populate();
        one.advance(STEP_MS);
        one.courtWarned.set("guest-1", one.battle.time);
        one.travel.set("guest-1", { at: [1, 1], walked: 3, next: null, heading: null });
        one.messengersHeard.set("guest-1", one.battle.time);
        one.messengersHeard.set("guest-long-gone", -1e9);
        one.nextMessenger = 2;

        const copy = Host.restore(buildWorld({ seed: 2 }), decode(encode(one.snapshot())));

        assert.deepEqual([...copy.courtWarned], [...one.courtWarned]);
        assert.deepEqual([...copy.travel], [...one.travel]);

        // (Gone: nothing of theirs left, but word of a messenger new enough to hold their next back)
        one.leave("guest-1");
        assert.equal(one.courtWarned.has("guest-1"), false);
        assert.equal(one.travel.has("guest-1"), false);
        assert.deepEqual([...one.messengersHeard.keys()], ["guest-1"]);
        assert.equal(JSON.stringify(one.snapshot().travel).includes("guest-1"), false);
    });

    it("keeps each character without what it has as one just added has it, and reads it back whole", () => {
        const whole = host.battle.snapshot();
        const kept = host.snapshot().battle;
        const text = { whole: encode(whole.actors), kept: encode(kept.actors) };

        assert.equal(host.snapshot().version, SNAPSHOT_VERSION);
        assert.equal(kept.actors.length, whole.actors.length);

        for (const [index, actor] of whole.actors.entries()) {
            const back = wholeActor(decode(encode(spareActor(actor))));

            assert.deepEqual(back, actor, actor.id);
            // (Laid out as it was: the fields every character has in the same order, the rest after)
            assert.deepEqual(
                Object.keys(back).filter((key) => ACTOR_FIELDS.includes(key)),
                Object.keys(actor).filter((key) => ACTOR_FIELDS.includes(key)),
                actor.id,
            );
            // (One kept whole, as an older version kept it, reads the same)
            assert.deepEqual(wholeActor(decode(encode(actor))), actor, actor.id);
            assert.deepEqual(kept.actors[index], spareActor(actor));
        }

        // (Half the text and less; and scarcely a number JSON can't carry left in it, so whoever
        // reads it needn't go through it: core/wire.js decode)
        assert.ok(text.kept.length < text.whole.length * 0.5, `${text.kept.length} characters of text kept, ${text.whole.length} whole`);
        assert.ok(text.kept.split('"$"').length < text.whole.split('"$"').length / 4, "few marks left");
    });

    it("leaves out only fields every character has from the moment it's added, in the battle's own order (battle.js add)", () => {
        const world = buildWorld({ seed: 2 });
        const fresh = new Host(world, { populate: false });

        fresh.join({ id: HOST_PLAYER, hero: { name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false } });
        fresh.populate();

        const added = fresh.battle.add({ id: "just-added", kind: "player", team: "x", square: fresh.battle.actor(HOST_PLAYER).square });

        // (A field in ACTOR_DEFAULTS that only some characters had would come back on the rest)
        for (const actor of [...host.battle.actors, ...fresh.battle.actors]) {
            for (const key of Object.keys(ACTOR_DEFAULTS)) {
                assert.ok(Object.hasOwn(actor, key), `${actor.id} has no ${key}: take it out of ACTOR_DEFAULTS`);
            }
        }

        // (As one just added has them: add a new field to ACTOR_FIELDS where battle.js add has it,
        // and to ACTOR_DEFAULTS if every character's made with it)
        assert.deepEqual(
            Object.keys(added).filter((key) => key !== "restVariety" && key !== "chance"),
            [...ACTOR_FIELDS],
        );

        for (const [key, usual] of Object.entries(ACTOR_DEFAULTS)) {
            assert.deepEqual(added[key], usual, `a character just added has ${key} as ACTOR_DEFAULTS has it`);
        }

        assert.deepEqual(Object.keys(spareActor(fresh.battle.snapshot().actors.at(-1))).sort(), ["chance", "chaseSpeed", "hp", "id", "kind", "map", "maxHp", "maxStamina", "name", "pace", "respawnMs", "restVariety", "spawn", "spawnMap", "speed", "square", "stamina", "team", "walkPace", "x", "y"].sort());
    });
});
