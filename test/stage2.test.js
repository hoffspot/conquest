// Stage 2's exit scenario for the world server's soak (scripts/stage2.js; the scaling plan's
// 2-35): what each player does in it, played here against one world with no link between (each
// player's "copy" the world itself), and what's asked of the world's rules.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { areaCap } from "../client/js/core/director.js";
import { Host, presetRules } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { judgeStage2, median, ruleFaults, STAGE2, Stage2Play } from "../scripts/stage2.js";

const hero = (name) => ({ name, race: "human", weapon: "sword", boots: false, shape: {}, look: {} });

// A `shared` world with `count` owners in the humans' town, each with a part in the scenario
// (parties of `party`), played with no link: what each asks is done at once
function staged({ count = 4, party = 2, timing = {} } = {}) {
    const host = new Host(buildWorld({ seed: 2 }), { populate: false, rules: { rest: "everyone", debug: "owner", ...presetRules("shared") } });
    const names = Array.from({ length: count }, (_, k) => `Soak${k + 1}`);

    for (const name of names) {
        host.join({ id: name.toLowerCase(), hero: hero(name), role: "owner" });
    }

    host.populate();

    const parts = names.map((name, k) => {
        const first = k - (k % party);
        const joining = { host, me: name.toLowerCase(), command: (command) => host.command(name.toLowerCase(), command) };

        return new Stage2Play(joining, { home: null }, { name, leader: names[first], mates: names.slice(first, first + party), party: first / party }, { ...STAGE2, party, ...timing });
    });
    const play = (ms, until = () => false) => {
        for (let t = 0; t < ms && !until(); t += STEP_MS) {
            const events = host.advance(STEP_MS);

            for (const part of parts) {
                part.hear(events);
                part.tick(STEP_MS);
            }
        }
    };

    return { host, names, parts, play };
}

describe("Stage 2's exit scenario (scripts/stage2.js; the scaling plan's 2-35)", () => {
    it("has each four's first ask the rest to a party, who say yes; an invasion called by the first party's leader and a rift torn open by the second's; and finds no rule broken", () => {
        const { host, parts, play } = staged({ timing: { invite: 1000, invade: 4000, rift: 8000, dungeon: Infinity } });

        assert.deepEqual([STAGE2.party, STAGE2.every, STAGE2.again], [4, 2000, 62000]);
        assert.equal(host.rules.director, "area");
        play(20000);

        assert.deepEqual(host.partyFor("soak1")?.members, ["soak1", "soak2"]);
        assert.deepEqual(host.partyFor("soak3")?.members, ["soak3", "soak4"]);
        assert.equal(host.partyFor("soak1").leader, "soak1");
        assert.equal(host.invasions.length, 1, "the invasion's on");
        assert.ok(host.hellRifts.open, "and a rift's open");

        const reports = parts.map((part, k) => ({ name: `Soak${k + 1}`, stage2: part.report() }));

        assert.deepEqual(reports.map(({ stage2 }) => [stage2.party, stage2.leads, stage2.invaded, stage2.rifted]), [[2, true, true, false], [2, false, false, false], [2, true, false, true], [2, false, false, false]]);
        assert.ok(reports.every(({ stage2 }) => stage2.checks >= 9 && stage2.faults.length === 0));

        const judged = judgeStage2(reports, { minutes: 1, timing: { ...STAGE2, party: 2 } });

        assert.deepEqual([judged.players, judged.partied, judged.invaded, judged.rifted, judged.delved, judged.faults, judged.failures], [4, 4, true, true, 0, [], []]);
    });

    it("has everyone make for the nearest dungeon and go in, each party into a run of its own, no floor or lane of one the other's", () => {
        const { host, parts, play } = staged({ timing: { invite: 1000, invade: Infinity, rift: Infinity, dungeon: 6000, enter: 2000 } });
        const site = host.world.plan.sites.filter(({ kind }) => kind === "dungeon").map((one) => ({ one, far: Math.hypot(one.at[0] - host.battle.actor("soak1").x, one.at[1] - host.battle.actor("soak1").y) })).sort((a, b) => a.far - b.far)[0].one;

        play(5000);
        assert.equal(host.partyFor("soak4")?.members.length, 2);

        // (Set down by its way in: the walk there's the soak's)
        ["soak1", "soak2", "soak3", "soak4"].forEach((id, k) => host.battle.place(id, "town", [Math.floor(site.at[0]) + 3 + k, Math.floor(site.at[1]) + 3]));
        play(120000, () => parts.every((part) => part.did.delved));

        assert.deepEqual(parts.map((part) => part.did.delved), [true, true, true, true]);
        assert.equal(parts[0].site.id, site.id);
        assert.equal([...host.runs.values()].filter((run) => run.site === site.id).length, 2, "a run for each party");

        const [one, two] = ["soak1", "soak3"].map((id) => host.battle.actor(id).map);

        assert.notEqual(one, two, "each party on a floor of its own");
        assert.equal(host.battle.actor("soak2").map, one);
        assert.deepEqual(ruleFaults(host), []);
        assert.ok(parts.every((part) => host.world.maps[part.inside]?.dungeon && Array.isArray(part.bot.home)), "(each roaming where it stands, inside)");
        assert.equal(judgeStage2(parts.map((part, k) => ({ name: `Soak${k + 1}`, stage2: part.report() })), { minutes: 60, timing: { ...STAGE2, party: 2 } }).failures.filter((why) => /dungeon/.test(why)).length, 0);
    });

    it("says where a shared world's rules don't hold: more of the director's things in three cells by three than an area holds, runs of one dungeon with a floor or a lane in common, and a bystander paid; and nothing of a world that doesn't play by them", () => {
        const { host, parts } = staged({ count: 2, party: 2 });
        const most = areaCap(host.players.size);

        assert.deepEqual(ruleFaults(host), []);

        for (let k = 0; k < most; k++) {
            host.finds.set(`test-${k}`, { at: [1000 + k * 200, 1000] });
        }

        assert.deepEqual(ruleFaults(host), [], "(as many as an area holds, in cells side by side)");
        host.finds.set("test-over", { at: [1100, 1300] });
        assert.ok(ruleFaults(host).some((fault) => new RegExp(`^${most + 1} of the director's things`).test(fault)));
        host.finds.delete("test-over");
        host.finds.set("test-far", { at: [5000, 5000] });
        assert.deepEqual(ruleFaults(host), [], "(one far off is another area's)");

        // Two runs of one dungeon
        host.runs.set("d~1", { id: "d~1", site: "d", lane: 1 });
        host.runs.set("d~2", { id: "d~2", site: "d", lane: 2 });
        host.runs.set("e~1", { id: "e~1", site: "e", lane: 1 });
        host.world.interiors.buildings.set("site:d~1", { maps: ["a", "b"] });
        host.world.interiors.buildings.set("site:d~2", { maps: ["c", "d"] });
        assert.deepEqual(ruleFaults(host), []);
        host.world.interiors.buildings.get("site:d~2").maps.push("b");
        assert.deepEqual(ruleFaults(host), ["runs d~1 and d~2 share 1 floor(s): b"]);
        host.world.interiors.buildings.get("site:d~2").maps.pop();
        host.runs.get("d~2").lane = 1;
        assert.deepEqual(ruleFaults(host), ["runs d~1 and d~2 are made in one lane (1)"]);

        // (A company's world: none of it asked)
        host.finds.set("test-over", { at: [1100, 1300] });
        host.rules = { ...host.rules, director: "player", instances: "site" };
        assert.deepEqual(ruleFaults(host), []);
        host.rules = { ...host.rules, ...presetRules("shared") };

        // A bystander paid: spoils of a foe to one who never struck it, nor had theirs strike it
        const [ada, bea] = parts;
        const foe = host.battle.add({ id: "wolf-x", kind: "beast", team: "wild", square: [...host.battle.actor("soak1").square], map: "town" });
        const pet = host.battle.add({ id: "pet-x", kind: "beast", team: host.battle.actor("soak2").team, leader: "soak2", square: [...host.battle.actor("soak2").square], map: "town" });

        ada.hear([{ type: "hit", id: foe.id, by: "soak1" }, { type: "hit", id: foe.id, by: pet.id }, { type: "death", id: foe.id }, { type: "spoils", id: "soak1", from: foe.id, creature: "wolf" }, { type: "spoils", id: "soak2", from: foe.id, creature: "wolf" }]);
        assert.deepEqual([...ada.faults], [], "(each struck it, one by their creature)");
        assert.deepEqual([ada.kills.length, ada.spoils], [1, 2]);
        bea.hear([{ type: "hit", id: "wolf-y", by: "soak1" }, { type: "spoils", id: "soak2", from: "wolf-y", creature: "wolf" }, { type: "spoils", id: "soak2", from: "chest-1", creature: "chest" }, { type: "spoils", id: "soak2", from: "soak1", given: true }]);
        assert.deepEqual([...bea.faults], ["Soak2 was given the spoils of a foe (wolf) they never struck"]);

        // And what a run came to: a fault fails it, as does what it had time for and didn't do
        assert.equal(median([]), 0);
        assert.deepEqual([median([3, 1, 2]), median([4, 1, 2, 3])], [2, 2.5]);

        const reports = parts.map((part, k) => ({ name: `Soak${k + 1}`, stage2: part.report() }));
        const short = judgeStage2(reports, { minutes: 1, timing: { ...STAGE2, party: 2 } });
        const long = judgeStage2(reports, { minutes: 120, timing: { ...STAGE2, party: 2 } });

        assert.deepEqual(short.failures, ["a rule broken: Soak2 was given the spoils of a foe (wolf) they never struck"]);
        assert.deepEqual(judgeStage2(reports.map((report) => ({ ...report, resyncs: 2 })), { minutes: 60, timing: { ...STAGE2, party: 2 } }).failures.filter((why) => /sent again/.test(why)), ["the world was sent again to a copy 4 times, where 2 is the most for 2 players in 60 minutes"]);
        assert.equal(judgeStage2(reports.map((report) => ({ ...report, resyncs: 1 })), { minutes: 60, timing: { ...STAGE2, party: 2 } }).failures.some((why) => /sent again/.test(why)), false);
        assert.deepEqual(long.failures.slice(1), ["2 of 2 players never came into a party of 2", "the invasion was never called", "the rift was never torn open", "no one went into the dungeon"]);
    });
});
