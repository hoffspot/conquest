// The wayside shrines and the twelve gods (client/js/core/shrines.js, core/lore/gods.js;
// docs/WILDS.md *Shrines*): the Six of the Hearth and the Wild Six, every one of them at two or
// three shrines; prayed at, a shrine's god's gift for half an hour, one god's at a time, each
// shrine once a world day; a shrine showing somewhere near it still to be found; and its
// sanctuary: nothing hostile put out near it, those chasing giving up at its edge, a camp always
// made there, and a rest there curing what's on the one resting
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { WILD } from "../client/js/core/creatures.js";
import { HOST_PLAYER, Host, SNAPSHOT_STEPS } from "../client/js/core/host.js";
import { GOD_IDS, GODS, PANTHEON, PANTHEON_IDS, WILD_GODS } from "../client/js/core/lore/gods.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { GIFT_BOONS, GIFTS, giftId, godWords, sanctuaryAt, SHRINE, shrineOf, shrinesOf } from "../client/js/core/shrines.js";
import { planWorld } from "../client/js/core/worldplan/plan.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

function run(host, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...host.advance(STEP_MS));
    }

    return events;
}

const put = (actor, [x, y]) => Object.assign(actor, { square: [x, y], x: x + 0.5, y: y + 0.5, path: [], order: null, target: null, spawn: [x, y] });

// The host's player in seed 2, by day, nothing about them
function world() {
    const built = buildWorld({ seed: 2 });
    const host = new Host(built, { populate: false });

    host.join({ id: HOST_PLAYER, hero: HERO });
    host.populate();
    Object.assign(host.battle.actor("orc"), { dead: true, respawnAt: Infinity });

    const me = host.battle.actor(HOST_PLAYER);

    Object.assign(me, { hp: 5000, maxHp: 5000 });

    return { host, me, plan: built.plan, player: host.players.get(HOST_PLAYER) };
}

// Before a shrine's heart, as the host has it
const before = (host, me, shrine) => {
    const [x, y] = host.world.maps.town.sites.heartOf(shrine.site);

    put(me, [Math.floor(x), Math.floor(y)]);
};

describe("the shrines and the twelve gods (core/shrines.js)", () => {
    const plan = planWorld(2);
    const shrines = shrinesOf(plan);

    it("has twelve gods, the Six of the Hearth (still the temples' alone) and the Wild Six, each with a gift in character", () => {
        assert.equal(PANTHEON_IDS.length, 12);
        assert.deepEqual(GOD_IDS, Object.keys(GODS), "the temples' gods are the Six");
        assert.equal(GOD_IDS.length, 6);
        assert.deepEqual(PANTHEON_IDS.slice(6), Object.keys(WILD_GODS));

        for (const id of PANTHEON_IDS) {
            const god = PANTHEON[id];

            assert.ok(god.name && god.title && god.domain && god.symbol && god.story && god.festival && god.sayings.length === 2, id);
            assert.ok(GIFTS[id]?.label && GIFTS[id].does, `${id}'s gift`);
            assert.equal(GIFT_BOONS[giftId(id)].ms, SHRINE.ms);
            assert.equal(GIFT_BOONS[giftId(id)].god, id);
            assert.ok(!/[!—–]/.test(`${god.story} ${GIFTS[id].does}`), `${id}: no exclamations or dashes`);
        }

        assert.equal(SHRINE.ms, 30 * 60 * 1000, "half an hour");
        assert.equal(godWords("tharos"), "Tharos, the Thunderlord");
    });

    it("deals the twelve out round the world's shrines, two or three each, the same every time", () => {
        assert.equal(shrinesOf(plan), shrines, "laid out once for a plan");
        assert.equal(shrines.length, plan.sites.filter(({ kind }) => kind === "shrine").length);

        const counts = {};

        for (const { site, god, at } of shrines) {
            counts[god] = (counts[god] ?? 0) + 1;
            assert.equal(shrineOf(plan, site.id).god, god);
            assert.ok(Math.hypot(at[0] - site.at[0], at[1] - site.at[1]) < 80, "resting near its spot");
            assert.equal(sanctuaryAt(plan, at)?.site, site);
            assert.equal(sanctuaryAt(plan, [at[0] + SHRINE.sanctuary + 5, at[1]])?.site === site, false);
        }

        assert.deepEqual(Object.keys(counts).sort(), [...PANTHEON_IDS].sort(), "every god has a shrine");
        assert.ok(Object.values(counts).every((count) => count >= 2 && count <= 3), JSON.stringify(counts));
        assert.equal(shrineOf(plan, "nowhere"), null);
    });

    it("answers a prayer with its god's gift for half an hour, one god's at a time, each shrine once a world day; and shows somewhere near it", () => {
        const { host, me, player } = world();
        const brannoc = shrines.find(({ god }) => god === "brannoc");
        const lunara = shrines.find(({ god }) => god === "lunara");

        // (None that isn't, none from afar)
        assert.deepEqual(host.command(HOST_PLAYER, { type: "pray", shrine: "nowhere" }), { ok: false, reason: "shrine" });
        put(me, [Math.floor(brannoc.at[0]) + 30, Math.floor(brannoc.at[1])]);
        assert.deepEqual(host.command(HOST_PLAYER, { type: "pray", shrine: brannoc.site.id }), { ok: false, reason: "far" });

        // (A priest's blessing on them already: it stays)
        player.boons = [...player.boons.filter(({ id }) => id !== "blessing"), { id: "blessing", label: "Blessed", melee: 0.05, until: host.battle.time + 600000 }];

        before(host, me, brannoc);

        const melee = me.power.melee;
        const result = host.command(HOST_PLAYER, { type: "pray", shrine: brannoc.site.id });
        const told = run(host, STEP_MS).filter(({ type }) => type === "prayed");

        assert.deepEqual(result, { ok: true });
        assert.equal(told.length, 1);
        assert.equal(told[0].god, "brannoc");
        assert.equal(told[0].boon, giftId("brannoc"));
        assert.ok(!told[0].hint || typeof told[0].hint === "string");
        // (A twelfth the harder; and the blessing's twentieth, taken up with it)
        assert.ok(Math.abs(me.power.melee - (melee + GIFTS.brannoc.melee + 0.05)) < 1e-9, `${melee} to ${me.power.melee}`);
        assert.equal(player.boons.find(({ id }) => id === giftId("brannoc")).until, host.battle.time - STEP_MS + SHRINE.ms);

        // (Again today: no)
        assert.deepEqual(host.command(HOST_PLAYER, { type: "pray", shrine: brannoc.site.id }), { ok: false, reason: "prayed" });

        // (Another god's: in place of the first's; the blessing still on them)
        before(host, me, lunara);
        assert.deepEqual(host.command(HOST_PLAYER, { type: "pray", shrine: lunara.site.id }), { ok: true });
        assert.deepEqual(player.boons.filter(({ god }) => god).map(({ id }) => id), [giftId("lunara")]);
        assert.ok(player.boons.some(({ id }) => id === "blessing"));
        assert.equal(me.darkSight, true, "Moonsight: seeing in the dark");

        // (Gone after half an hour)
        player.boons = player.boons.map((boon) => ({ ...boon, until: host.battle.time + STEP_MS }));
        run(host, STEP_MS * 3);
        assert.equal(me.darkSight, false);
    });

    it("is a sanctuary: those chasing give up at its edge, a camp's made there with them about, and a rest there cures", () => {
        const { host, me } = world();
        const shrine = shrines[0];

        // (A wolf set on them, just outside: they step in, and it gives up)
        put(me, [Math.floor(shrine.at[0]) + SHRINE.sanctuary + 6, Math.floor(shrine.at[1])]);

        host.battle.add({ id: "test-wolf", kind: "beast", name: "Wolf", weapon: "wolf", team: WILD, square: [me.square[0] + 3, me.square[1]], ai: "wild", hp: 5000, speed: 1, chase: 1, wild: { creature: "wolf", tier: 1, temper: "aggressive", guard: 6, roam: 0, leash: 200, pack: "test-wolf", leader: null, menace: false } });

        host.wild.set("test-wolf", { creature: "wolf", tier: 1, pack: "test-wolf", camp: null, lair: null, master: false });
        run(host, 600);
        assert.equal(host.battle.actor("test-wolf").target, HOST_PLAYER, "after them outside");
        put(me, [Math.floor(shrine.at[0]), Math.floor(shrine.at[1]) + 4]);
        Object.assign(host.battle.actor("test-wolf"), { struckBy: {} });
        run(host, 600);
        assert.equal(host.battle.actor("test-wolf").target, null, "given up at its edge");

        // (A camp made there, the wolf near or not; poisoned and sick, cured as they rest)
        put(host.battle.actor("test-wolf"), [me.square[0] + 6, me.square[1]]);
        host.battle.afflict(HOST_PLAYER, "poison", { ms: 60000 });
        host.battle.afflict(HOST_PLAYER, "disease", { ms: 60000 });
        assert.equal(host.campRefusal(HOST_PLAYER), null);

        assert.equal(host.command(HOST_PLAYER, { type: "camp" }).ok, true);

        const cured = run(host, STEP_MS).filter(({ type }) => type === "cured").map(({ kind }) => kind);

        assert.deepEqual(cured.sort(), ["disease", "poison"]);
        assert.ok(!me.afflictions.some(({ kind }) => kind === "poison" || kind === "disease"), JSON.stringify(me.afflictions));
    });

    it("carries a world kept from before there were gifts on, none prayed", () => {
        const { host } = world();
        const old = { ...host.snapshot(), version: 35 };

        old.players = old.players.map(({ prayed: _prayed, ...player }) => player);

        const stepped = SNAPSHOT_STEPS[35](structuredClone(old));

        assert.equal(stepped.version, 36);
        assert.ok(stepped.players.every(({ prayed }) => prayed && Object.keys(prayed).length === 0));
        assert.deepEqual(Host.restore(buildWorld({ seed: 2 }), stepped).players.get(HOST_PLAYER).prayed, {});
    });
});
