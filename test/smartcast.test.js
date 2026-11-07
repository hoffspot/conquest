// Cure and Buff all choosing what to cast as things are (client/js/core/smartcast.js)

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AFFLICTIONS } from "../client/js/core/afflictions.js";
import { BUFF_ALL_LEAVES, BUFFS, buffsDue, CURE_SPELLS, cureFor, cureOrder, knowsABuff, knowsACure, REFRESH } from "../client/js/core/smartcast.js";
import { SPELLS } from "../client/js/core/spells.js";

// Something on someone from `now` (ms), as core/battle.js keeps it: for its whole time
const on = (kind, now = 0, left = AFFLICTIONS[kind].ms) => ({ kind, until: now + left, damage: AFFLICTIONS[kind].damage });

describe("Cure: the cure for whatever's on someone (core/smartcast.js)", () => {
    it("knows the tomes' seven cures, and no healing spell among them", () => {
        assert.deepEqual([...CURE_SPELLS].sort(), ["curePoison", "cureSickness", "embolden", "liftCurse", "quench", "staunch", "unbind"]);

        for (const id of ["renewal", "astralHeal", "detraumatize", "vigor"]) {
            assert.ok(!CURE_SPELLS.includes(id), id);
        }

        assert.equal(knowsACure(["vigor", "renewal"]), false);
        assert.equal(knowsACure(["vigor", "quench"]), true);
    });

    it("takes what hinders first (slowed, a venom's cramps), then whatever will do the most harm before it wears off", () => {
        assert.deepEqual(
            cureOrder([on("burn"), on("slow"), on("poison"), on("fear")]).map(({ kind }) => kind),
            ["slow", "poison", "burn", "fear"],
            "slowed first; poison's six blows to come over a burn's five; fear does no harm",
        );
        assert.deepEqual(cureOrder([on("bleed"), on("venom")]).map(({ kind }) => kind), ["venom", "bleed"], "venom's cramps slow them");

        // (What's worn off isn't there; nearly over, less harm to come)
        assert.deepEqual(cureOrder([on("burn", 0, -1), on("poison")]).map(({ kind }) => kind), ["poison"]);
        assert.deepEqual(cureOrder([on("poison", 0, 1600), on("bleed")]).map(({ kind }) => kind), ["bleed", "poison"]);
    });

    it("casts a cure spell the player knows that isn't cooling down, else uses a cure they carry: on themselves only", () => {
        const ailing = [on("burn"), on("poison")];

        assert.deepEqual(cureFor(ailing, { known: ["quench", "curePoison"] }), { kind: "poison", spell: "curePoison" });
        assert.deepEqual(cureFor(ailing, { known: ["quench"] }), { kind: "burn", spell: "quench" }, "poison first, but it can only cure the burn");
        assert.deepEqual(cureFor(ailing, { known: ["quench", "curePoison"], ready: (spell) => spell !== "curePoison" }), { kind: "burn", spell: "quench" }, "Cure Poison cooling down");
        assert.deepEqual(cureFor(ailing, { known: ["quench"], carried: ["antidote"] }), { kind: "poison", item: "antidote" });
        assert.deepEqual(cureFor(ailing, { known: ["quench"], carried: ["antidote"], self: false }), { kind: "burn", spell: "quench" }, "a friend: no draught given");
        assert.deepEqual(cureFor([on("venom")], { carried: ["antidote"] }), { kind: "venom", item: "antidote" }, "the antidote cures venom too");
        assert.equal(cureFor([on("fear")], { known: ["quench"], carried: ["antidote"] }), null);
        assert.equal(cureFor([], { known: CURE_SPELLS }), null);
    });

    it("never spends a healing spell's long wait on what a cure ends", () => {
        assert.equal(cureFor([on("burn")], { known: ["astralHeal", "renewal"] }), null);
    });
});

describe("Buff all: each buff that's off the player or running out (core/smartcast.js)", () => {
    const known = ["resistFire", "resistWater", "swole", "reflect", "light", "surge", "invisibility", "evaluate"];

    it("casts each buff they know but Light, Surge and Invisibility", () => {
        assert.deepEqual(BUFF_ALL_LEAVES, ["light", "surge", "invisibility"]);
        assert.equal(BUFFS.length, 16);
        assert.deepEqual(buffsDue([], { known }).due, ["resistFire", "resistWater", "swole", "reflect", "evaluate"]);
        assert.equal(knowsABuff(["light", "surge"]), false);
        assert.equal(knowsABuff(["light", "dodge"]), true);
    });

    it("leaves out one that's on with more than a fifth of its time left, and one past it, cast again", () => {
        const now = 1000;
        const left = (spell, share) => ({ kind: spell, until: now + share * SPELLS[spell].lasts });

        assert.equal(REFRESH, 0.2);
        assert.deepEqual(buffsDue([left("resistFire", 0.5), left("resistWater", 0.1), left("swole", 1), { kind: "evaluate", until: now - 1 }], { now, known }).due, ["resistWater", "reflect", "evaluate"]);
    });

    it("leaves out what needs something in hand that isn't, saying what", () => {
        const holds = (needs) => needs !== "wand";

        assert.deepEqual(buffsDue([], { known, holds }), { due: ["resistFire", "resistWater", "swole", "evaluate"], lacking: [{ spell: "reflect", needs: "wand" }] });
    });
});
