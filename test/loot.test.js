// Who's paid for a foe brought down (core/host.js RULES `loot`; the scaling plan's 2-13): those
// near it ("near", as ever), or those with a tag on it ("tagged": core/battle.js TAGS,
// core/credit.js), wherever they stand and no one who only stood by. And in any world, one fallen
// near it with a tag on it is paid
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { DAY } from "../client/js/core/daytime.js";
import { Host, RULE_CHOICES, RULES, SPOILS_REACH, presetRules } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { SETTLEMENT_KINDS } from "../client/js/core/setpieces/town.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });
const MINUTE = 60000;
const put = (actor, [x, y]) => Object.assign(actor, { square: [x, y], x: x + 0.5, y: y + 0.5, path: [], order: null, target: null, spawn: [x, y] });

// A world a server runs: two players out in the wilds west of the town, 6 m apart, in no party
function served(loot) {
    const world = buildWorld({ seed: 2 });
    const host = new Host(world, { populate: false, rules: { ...RULES, rest: "everyone", debug: "owner", loot } });

    host.join({ id: "p1", hero: HERO, role: "owner" });
    host.join({ id: "p2", hero: { ...HERO, name: "Bryn" } });
    host.populate();
    Object.assign(host.battle.actor("orc"), { dead: true, respawnAt: Infinity });

    const [middle, radius] = [world.stamp.middle, SETTLEMENT_KINDS[world.start.kind].radius];

    put(host.battle.actor("p1"), [Math.floor(middle[0] - radius - 80), Math.floor(middle[1] - 20)]);
    put(host.battle.actor("p2"), [Math.floor(middle[0] - radius - 80), Math.floor(middle[1] - 14)]);
    Object.assign(host.war, { turn: Math.floor((DAY.length + 30 * MINUTE - DAY.start) / MINUTE), clock: 0 });
    host.events = [];

    let wolves = 0;

    // A pack's leader by the first player, felled by them, with `tags` on it as it falls (beside
    // the feller's own): who's given spoils of it
    const spoils = (tags = {}) => {
        const one = host.battle.actor("p1");
        const id = `test-wolf-${wolves++}`;

        host.wild.set(id, { creature: "wolf", tier: 1, pack: id, camp: null, lair: null, master: false, elite: "lead" });
        host.battle.add({ id, kind: "beast", name: "Wolf", weapon: "wolf", team: "wild", square: [one.square[0] + 1, one.square[1]], map: one.map, ai: "wild", hp: 1, wild: { creature: "wolf", tier: 1, temper: "defensive", guard: 0, roam: 0, leash: 40, pack: id, leader: null } });
        host.battle.actor(id).tags = Object.fromEntries(Object.entries(tags).map(([player, tag]) => [player, [...tag, host.battle.time]]));

        const events = [];

        assert.equal(host.command("p1", { type: "engage", target: id }).ok, true);

        for (let t = 0; t < 20000 && !events.some(({ type, id: whose }) => type === "death" && whose === id); t += STEP_MS) {
            events.push(...host.advance(STEP_MS));
        }

        assert.ok(events.some(({ type, id: whose }) => type === "death" && whose === id), "the wolf felled");

        return events.filter(({ type }) => type === "spoils").map(({ id: whose }) => whose).sort();
    };

    return { host, spoils, one: host.battle.actor("p1"), two: host.battle.actor("p2") };
}

describe("who's paid for a foe brought down (host.js RULES loot)", () => {
    it("is by nearness unless a world says, and by tags in a world shared by strangers", () => {
        assert.equal(RULES.loot, "near");
        assert.deepEqual(RULE_CHOICES.loot, { of: ["near", "tagged"], shared: "tagged", slice: "2-13", built: true });
        assert.equal(presetRules("shared").loot, "tagged");
        assert.equal(presetRules("company").loot, "near");
        assert.equal(new Host(buildWorld({ seed: 2 }), { populate: false, rules: { loot: "tagged" } }).rules.loot, "tagged");
        assert.equal(new Host(buildWorld({ seed: 2 }), { populate: false, rules: { loot: "nobody's" } }).rules.loot, "near");
    });

    it("by nearness: everyone standing near has a bundle, a hand in it or not; one fallen there only with a tag on it; no one further off, tagged or not", () => {
        const { spoils, two } = served("near");

        assert.deepEqual(spoils(), ["p1", "p2"], "a bystander 6 m off: paid, as ever");
        Object.assign(two, { dead: true, respawnAt: Infinity });
        assert.deepEqual(spoils(), ["p1"], "fallen, with no hand in it: nothing, as ever");
        assert.deepEqual(spoils({ p2: [12, 0, 0] }), ["p1", "p2"], "fallen with a tag on it: paid");
        two.dead = false;
        put(two, [two.square[0], two.square[1] + SPOILS_REACH + 10]);
        assert.deepEqual(spoils({ p2: [12, 0, 0] }), ["p1"], "too far off, tag or no: nothing, as ever");
    });

    it("by tags: a bystander has nothing; one who struck it, took its blows or mended those it was on has a bundle, standing or fallen, near or far; not one marked away", () => {
        const { host, spoils, two } = served("tagged");

        assert.deepEqual(spoils(), ["p1"], "a bystander 6 m off: nothing");
        assert.deepEqual(spoils({ p2: [3, 0, 0] }), ["p1", "p2"], "struck it");
        assert.deepEqual(spoils({ p2: [0, 4, 0] }), ["p1", "p2"], "took its blows");
        assert.deepEqual(spoils({ p2: [0, 0, 9] }), ["p1", "p2"], "a healer of the one it was on");
        assert.deepEqual(spoils({ p2: [0, 0, 0] }), ["p1"], "(a tag with nothing in it: nothing)");

        Object.assign(two, { dead: true, respawnAt: Infinity });
        assert.deepEqual(spoils({ p2: [3, 0, 0] }), ["p1", "p2"], "fallen: paid");
        two.dead = false;
        put(two, [two.square[0], two.square[1] + SPOILS_REACH + 10]);
        assert.deepEqual(spoils({ p2: [3, 0, 0] }), ["p1", "p2"], "further off than spoils reach, the tag not yet lapsed: paid");

        host.players.get("p2").away = true;
        assert.deepEqual(spoils({ p2: [3, 0, 0] }), ["p1"], "marked away: nothing");
    });
});
