// Prismatic chains (client/js/core/prismatic.js; docs/MAGIC.md, "Prismatic Destruction"): an
// element's spells cast in order, first to last, each within ten seconds of the one before,
// every attack spell 5% stronger a spell past the first, and at the last the element's piece
// of the sigil (25%, in place of the chain's stacks); anything out of order let be; let lapse,
// everything lost. Four pieces, the sigil whole: Prismatic Destruction, for fifteen seconds,
// killing all round its target but the mightiest, who lose three quarters of their whole health;
// cast, the sigil spent. Kept on the player in the battle, so every copy of the world sees it.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Battle, STEP_MS } from "../client/js/core/battle.js";
import { HOST_PLAYER, Host, SNAPSHOT_STEPS } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { bonusOf, CHAIN, chainAfter, ELEMENTS, isWhole, lapsed, mighty, nextOf, PRISMATIC } from "../client/js/core/prismatic.js";
import { SCHOOLS, SPELL_COOLDOWN, SPELLS } from "../client/js/core/spells.js";
import { parseGrid } from "./helpers.js";

const open = (width, height) => ({ blocked: parseGrid(Array.from({ length: height }, () => ".".repeat(width))).map((row) => Uint8Array.from(row)) });

function run(battle, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...battle.advance(STEP_MS));
    }

    return events;
}

// A caster in an open field, and enemies (orcs: hardy) where asked
function field(foes = []) {
    const battle = new Battle(open(40, 40), { seed: 5 });
    const caster = battle.add({ id: "caster", kind: "player", weapon: "sword", team: "hero", square: [5, 20] });

    foes.forEach(({ at, ...settings }, k) => battle.add({ id: `foe-${k}`, kind: "orc", weapon: "cleaver", team: "orcs", square: at, hp: 5000, ...settings }));

    return { battle, caster };
}

// A spell cast on the first foe and landed (ready again, as soon as it may be): the events
function land(battle, spell, target = "foe-0") {
    const cast = battle.cast("caster", spell, target);

    assert.deepEqual(cast, { ok: true }, spell);

    return run(battle, SPELLS[spell].castTime + SPELL_COOLDOWN);
}

// An element's spells cast through in order, first to last
function castThrough(battle, element) {
    return SCHOOLS[element].tiers.flatMap((spell) => land(battle, spell));
}

describe("a Prismatic chain (core/prismatic.js)", () => {
    it("goes up an element's spells in order, 5% stronger a spell past the first, and at the last gives its piece of the sigil in place of the stacks", () => {
        let prism = null;
        const seen = [];

        SCHOOLS.fire.tiers.forEach((id, k) => {
            const after = chainAfter(prism, SPELLS[id], 1000 * k);

            prism = after.prism;
            seen.push([after.change, Number(bonusOf(prism).toFixed(2))]);
        });

        assert.deepEqual(seen, [
            ["start", 0],
            ["step", 0.05],
            ["step", 0.1],
            ["step", 0.15],
            ["step", 0.2],
            ["step", 0.25],
            ["piece", 0.25],
        ]);
        assert.deepEqual(prism, { element: null, step: 0, at: 6000, pieces: ["fire"], readyAt: null });
        assert.deepEqual(ELEMENTS.map((element) => nextOf(prism, element)), [null, "rumble", "hurt", "blister"], "every element without its piece, from its first");
    });

    it("lets be whatever's out of order (another element's spell, a lower one, a skipped one, a heal, a hex, an element whose piece is held), neither counting nor breaking it", () => {
        const { prism: started } = chainAfter(null, SPELLS.burn, 0);
        const { prism } = chainAfter(started, SPELLS.fireball, 1000);

        for (const id of ["hurt", "burn", "fireball", "immolate", "vigor", "stun", "explosion"]) {
            assert.deepEqual(chainAfter(prism, SPELLS[id], 2000), { prism, change: null }, id);
        }

        assert.equal(nextOf(prism, "fire"), "burstflame");
        assert.equal(nextOf(prism, "air"), null, "mid-chain, no other element's");

        const held = { element: null, step: 0, at: 0, pieces: ["fire"], readyAt: null };

        assert.equal(chainAfter(held, SPELLS.burn, 1000).change, null, "fire's piece held");
        assert.equal(chainAfter(held, SPELLS.rumble, 1000).change, "start");
        assert.equal(bonusOf(chainAfter(chainAfter(held, SPELLS.rumble, 1000).prism, SPELLS.stoneCrush, 2000).prism).toFixed(2), "0.30", "a piece and a step");
    });

    it("comes whole with the fourth piece, every attack spell twice as strong, for fifteen seconds; a chain let lapse ten seconds, everything's lost", () => {
        let prism = null;
        let time = 0;

        for (const element of ["water", "air", "fire", "earth"]) {
            for (const id of SCHOOLS[element].tiers) {
                time += 9000;
                ({ prism } = chainAfter(prism, SPELLS[id], time));
            }
        }

        assert.deepEqual(prism.pieces, ELEMENTS, "in the sigil's order");
        assert.ok(isWhole(prism));
        assert.equal(bonusOf(prism), 1);
        assert.equal(prism.readyAt, time);
        assert.equal(chainAfter(prism, SPELLS.burn, time + 1000).change, null, "whole: nothing more counts");
        assert.equal(lapsed(prism, time + CHAIN.ready), false);
        assert.equal(lapsed(prism, time + CHAIN.ready + 1), true);

        const started = chainAfter(null, SPELLS.hurt, 0).prism;

        assert.equal(lapsed(started, CHAIN.window), false);
        assert.equal(lapsed(started, CHAIN.window + 1), true);
        assert.deepEqual(chainAfter(started, SPELLS.dustgust, CHAIN.window + 1), { prism: null, change: null }, "too late for the next");
    });

    it("counts the mightiest as a dungeon's boss, an elite, one of the perilous places' own, a seat's ruler and a player", () => {
        assert.deepEqual(
            [{ kind: "player" }, { kind: "soldier", ruler: true }, { kind: "orc", wild: { elite: true } }, { kind: "orc", wild: { unique: true } }, { kind: "orc", wild: { champion: "boss" } }, { kind: "orc", wild: { champion: "mini" } }, { kind: "soldier" }, { kind: "orc", wild: {} }].map(mighty),
            [true, true, true, true, true, false, false, false],
        );
    });
});

describe("a Prismatic chain in the battle", () => {
    it("is kept on the player as their spells land, told as it goes, makes their attack spells stronger, and breaks ten seconds after the last", () => {
        const { battle, caster } = field([{ at: [10, 20] }]);
        const told = castThrough(battle, "fire").filter(({ type }) => type === "prism");

        assert.deepEqual(
            told.map(({ change, step }) => [change, step]),
            [["start", 1], ["step", 2], ["step", 3], ["step", 4], ["step", 5], ["step", 6], ["piece", 0]],
        );
        assert.deepEqual(caster.prism.pieces, ["fire"]);

        // (A piece held, 25%: Burn's 9 to 15, 11 to 19)
        land(battle, "rumble");

        // (Its own blow, not the fire Hellfire left burning there)
        const hits = land(battle, "stoneCrush").filter(({ type, attack }) => type === "hit" && attack === "stoneCrush");

        assert.ok(hits[0].damage >= Math.round(12 * 1.3) && hits[0].damage <= Math.round(18 * 1.3), `Stone Crush at 30% more: ${hits[0].damage}`);

        // Nothing landed for ten seconds: broken, every stack and piece lost
        const broken = run(battle, CHAIN.window + STEP_MS).filter(({ type }) => type === "prism");

        assert.deepEqual(broken.map(({ change, pieces }) => [change, pieces]), [["broken", []]]);
        assert.equal(caster.prism, null);
    });

    it("makes every attack spell twice as strong with the sigil whole, and goes in a snapshot to every copy of the world", () => {
        const { battle, caster } = field([{ at: [10, 20] }]);

        caster.prism = { element: null, step: 0, at: battle.time, pieces: [...ELEMENTS], readyAt: battle.time };

        const hits = land(battle, "burn").filter(({ type, attack }) => type === "hit" && attack === "burn");

        assert.ok(hits[0].damage >= 18 && hits[0].damage <= 30, `Burn twice as strong: ${hits[0].damage}`);

        const copy = Battle.restore(open(40, 40), battle.snapshot());

        assert.deepEqual(copy.actor("caster").prism, caster.prism);
    });

    it("casts Prismatic Destruction only with the sigil whole: killing everything round its target but the mightiest, who lose three quarters of their whole health, past wards and shields; never a friend; the sigil spent", () => {
        const { battle, caster } = field([
            { at: [12, 20] },
            { at: [15, 20], wild: { creature: "orc", elite: true }, hp: 400 },
            { at: [12, 25], wild: { creature: "orc", champion: "boss" }, hp: 1000 },
            { at: [16, 24], hp: 90 },
            { at: [25, 20] },
            { at: [13, 20], wild: { creature: "orc", unique: true }, hp: 50 },
        ]);

        battle.add({ id: "friend", kind: "player", weapon: "sword", team: "hero", square: [12, 21] });
        battle.add({ id: "ruler", kind: "soldier", weapon: "sword", team: "orcs", square: [11, 22], hp: 120 });
        battle.actor("ruler").ruler = true;
        battle.actor("foe-5").hp = 20;

        assert.deepEqual(battle.cast("caster", "prismatic", "foe-0"), { ok: false, reason: "sigil" });

        caster.prism = { element: null, step: 0, at: battle.time, pieces: [...ELEMENTS], readyAt: battle.time };

        const events = land(battle, "prismatic");
        const hp = (id) => battle.actor(id).hp;
        const struck = (id) => events.find(({ type, attack, id: one }) => type === "hit" && attack === "prismatic" && one === id)?.damage;

        assert.equal(battle.actor("foe-0").dead, true, "an orc of 5000: dead");
        assert.equal(battle.actor("foe-3").dead, true);
        assert.equal(hp("foe-1"), 400 - Math.ceil(PRISMATIC.mighty * 400), "an elite: a quarter left");
        assert.equal(hp("foe-2"), 250, "a dungeon's boss");
        assert.equal(struck("ruler"), 90, "a seat's ruler (fought on after)");
        assert.equal(battle.actor("foe-5").dead, true, "one of the mightiest, with less than three quarters left: dead");
        assert.equal(hp("foe-4"), 5000, "beyond eight metres: untouched");
        assert.equal(struck("friend"), undefined, "never a friend");
        assert.equal(caster.prism, null);
        assert.deepEqual(events.filter(({ type }) => type === "prism").map(({ change }) => change), ["spent"]);
        assert.deepEqual(battle.cast("caster", "prismatic", "foe-4"), { ok: false, reason: "sigil" }, "spent");
    });

    it("fades with the sigil whole and not cast in fifteen seconds", () => {
        const { battle, caster } = field([{ at: [10, 20] }]);

        caster.prism = { element: null, step: 0, at: battle.time, pieces: [...ELEMENTS], readyAt: battle.time };

        assert.deepEqual(run(battle, CHAIN.ready - STEP_MS).filter(({ type }) => type === "prism"), []);
        assert.deepEqual(run(battle, STEP_MS * 3).filter(({ type }) => type === "prism").map(({ change }) => change), ["faded"]);
        assert.equal(caster.prism, null);
    });
});

describe("a Prismatic chain in a world", () => {
    it("lets a player with the sigil whole cast Prismatic Destruction, which no one learns", () => {
        const host = new Host(buildWorld({ seed: 2 }), { populate: false });

        host.join({ id: HOST_PLAYER, hero: { name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false } });

        const me = host.battle.actor(HOST_PLAYER);
        const [x, y] = me.square;

        host.battle.add({ id: "target", kind: "orc", weapon: "cleaver", team: "orcs", square: [x + 3, y], hp: 5000 });
        assert.deepEqual(host.command(HOST_PLAYER, { type: "cast", spell: "prismatic", target: "target" }), { ok: false, reason: "sigil" });

        me.prism = { element: null, step: 0, at: host.battle.time, pieces: [...ELEMENTS], readyAt: host.battle.time };
        assert.deepEqual(host.command(HOST_PLAYER, { type: "cast", spell: "prismatic", target: "target" }), { ok: true });
        assert.equal(host.players.get(HOST_PLAYER).progress.knows("prismatic"), false);
    });

    it("brings a world kept before chains forward: none yet, and a seat's ruler told as one", () => {
        const snapshot = { version: 28, battle: { actors: [{ id: "HOST" }, { id: "t1/ruler-0" }, { id: "t1/captain-0" }] } };
        const forward = SNAPSHOT_STEPS[28](snapshot);

        assert.equal(forward.version, 29);
        assert.deepEqual(
            forward.battle.actors.map(({ id, prism, ruler }) => [id, prism, ruler ?? false]),
            [
                ["HOST", null, false],
                ["t1/ruler-0", null, true],
                ["t1/captain-0", null, false],
            ],
        );
    });
});
