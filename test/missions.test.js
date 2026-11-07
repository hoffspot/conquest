// War missions (client/js/core/missions.js): what a messenger could bring a player near the war
// (each kind, found within reach, the nearest first, not twice), who sends it, what it pays at each
// rank (more the higher, a Commoner's already gold, standing and a fine piece), the three pieces
// to pick from, how each kind stands as the war moves (done with the player there, failed, come to
// nothing), and a commander's briefing.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Standing } from "../client/js/core/standing.js";
import { BONUS, briefingOf, checkMission, gearChoices, INTERCEPT_TURNS, MISSION_REACH, missionOf, MISSIONS, missionsNear, MORE_BY_RANK, rewardOf, rewardWords, senderName, senderOf } from "../client/js/core/missions.js";
import { REINFORCE } from "../client/js/core/war/armies.js";

// Just enough of a war (core/war/war.js): humans at war with orcs, at peace with elves
function warOf(parts = {}) {
    const war = {
        turn: 10,
        realms: {
            human: { id: "human", name: "the Westmarch", alive: true, seat: "hall", leader: { name: "Aldric", title: "King" } },
            orc: { id: "orc", name: "the Iron Horde", alive: true, seat: "skull", leader: { name: "Gorm", title: "Warlord" } },
            elf: { id: "elf", name: "Silverwood", alive: true, seat: "glade", leader: { name: "Ilyra", title: "Queen" } },
        },
        towns: [
            { id: "hall", name: "Hallbury", owner: "human", kind: "capital", at: [0, 0] },
            { id: "calbury", name: "Calbury", owner: "human", kind: "town", at: [1500, 0] },
            { id: "skull", name: "Skullcrag", owner: "orc", kind: "capital", at: [9000, 0] },
            { id: "glade", name: "Glade", owner: "elf", kind: "capital", at: [0, 9000] },
        ],
        forces: [],
        camps: [],
        works: [],
        forts: [],
        depots: [],
        log: [],
        ...parts,
    };

    return Object.assign(war, {
        realm: (id) => war.realms[id] ?? null,
        town: (id) => war.towns.find((each) => each.id === id) ?? null,
        force: (id) => war.forces.find((each) => each.id === id) ?? null,
        camp: (id) => war.camps.find((each) => each.id === id) ?? null,
        workAt: (id) => war.works.find((each) => each.id === id) ?? null,
        fort: (id) => war.forts.find((each) => each.id === id) ?? null,
        liege: (id) => id,
        hostile: (a, b) => (a === "human" && b === "orc") || (a === "orc" && b === "human"),
    });
}

const near = (from, reach = 150) => (point) => Math.hypot(point[0] - from[0], point[1] - from[1]) <= reach;
const at = [1000, 0];

describe("what's near a player", () => {
    it("finds each kind of thing of the war within reach, the nearest first, those far off and those held left out", () => {
        const war = warOf({
            camps: [{ id: "camp-1", realm: "orc", at: [1300, 200], toward: "calbury", guard: 12 }],
            forces: [
                { id: "convoy-1", realm: "orc", kind: "convoy", size: 6, at: [900, 300], cargo: { stone: 30 }, home: "works-2" },
                { id: "supply-1", realm: "orc", kind: "supply", size: 2, at: [1100, -100], target: "army-1" },
                { id: "column-1", realm: "orc", kind: "reinforcement", size: 9, at: [1600, 0], target: "army-1" },
                { id: "army-1", realm: "orc", kind: "army", size: 60, mission: "attack", target: "works-1", at: [2200, 0] },
                { id: "reserve-1", realm: "human", kind: "reserve", size: 40, mission: "defend", target: "army-1", at: [500, 0] },
                { id: "army-2", realm: "human", kind: "army", size: 50, mission: "attack", target: "camp-1", at: [800, 100] },
                { id: "far-1", realm: "orc", kind: "supply", size: 2, at: [6000, 0], target: "army-1" },
            ],
            works: [
                { id: "works-1", name: "Calbury", kind: "lumber mill", owner: "human", race: "human", at: [1700, 100] },
                { id: "works-2", name: "Gravel", kind: "quarry", owner: "orc", race: "orc", at: [2500, 0] },
            ],
            forts: [{ id: "fort-1", realm: "orc", kind: "tower", at: [2800, 0] }],
        });
        const found = missionsNear({ war, realm: "human", at });
        const kinds = found.map(({ kind }) => kind);

        assert.deepEqual(kinds.sort(), ["attack", "defend", "guard", "intercept", "plunder", "reserve", "rout", "seize", "tower", "wagons"].sort());
        assert.ok(found.every(({ at: point }) => Math.hypot(point[0] - at[0], point[1] - at[1]) <= MISSION_REACH));
        assert.equal(found[0].kind, "wagons");
        assert.ok(!found.some(({ key }) => key === "far-1"));
        assert.ok(!missionsNear({ war, realm: "human", at, held: [{ kind: "rout", key: "camp-1" }] }).some(({ kind }) => kind === "rout"));
        assert.deepEqual(missionsNear({ war, realm: "elf", at }).map(({ kind }) => kind), []);

        // (Each as it's offered, found at once with the player nowhere near: still to do, none
        // settled, as a messenger's offer is checked when it's taken on: core/host.js #overtaken)
        for (const { kind, key, target } of found) {
            assert.equal(checkMission(missionOf({ war, realm: "human", kind, key, target }), { war, realm: "human", near: () => false }), null, kind);
        }
    });

    it("doesn't offer to cut off reinforcements fewer than two turns' march from their army: they'd be with it before the player got there", () => {
        const march = INTERCEPT_TURNS * REINFORCE.speed + REINFORCE.join;
        const offered = (apart) => {
            const war = warOf({
                forces: [
                    { id: "column-1", realm: "orc", kind: "reinforcement", size: 9, at: [1100, 0], target: "army-1" },
                    { id: "army-1", realm: "orc", kind: "army", size: 60, mission: "attack", target: "calbury", at: [1100 + apart, 0] },
                ],
            });

            return missionsNear({ war, realm: "human", at }).some(({ kind }) => kind === "intercept");
        };

        assert.equal(INTERCEPT_TURNS, 2);
        assert.equal(offered(march + 20), true);
        assert.equal(offered(march - 20), false);
        assert.equal(offered(200), false);
    });

    it("finds their own works taken from them, and their own convoy with an enemy army about", () => {
        const war = warOf({
            forces: [
                { id: "convoy-2", realm: "human", kind: "convoy", size: 6, at: [1200, 0], cargo: { wood: 30 }, home: "works-3" },
                { id: "army-1", realm: "orc", kind: "army", size: 60, mission: "camp", at: [2600, 0] },
            ],
            works: [{ id: "works-3", name: "Ashford", kind: "mine", owner: "orc", race: "human", at: [900, 400] }],
        });

        assert.deepEqual(
            missionsNear({ war, realm: "human", at })
                .map(({ kind }) => kind)
                .sort(),
            ["convoy", "retake"],
        );
    });
});

describe("a mission offered", () => {
    it("comes from their ruler, the lord of their town nearest it, or the general of the force it's with, each named the same every time", () => {
        const war = warOf({ forces: [{ id: "army-2", realm: "human", kind: "army", size: 50, mission: "attack", target: "skull", at: [800, 0] }] });
        const ruler = senderOf(war, "human", "rout", { at: [1300, 0] });
        const lord = senderOf(war, "human", "defend", { at: [1400, 0] });
        const general = senderOf(war, "human", "attack", { force: "army-2", at: [800, 0] });

        assert.deepEqual([ruler.kind, ruler.title, ruler.name], ["ruler", "King", "Aldric"]);
        assert.equal(senderName(ruler), "King Aldric of the Westmarch");
        assert.deepEqual([lord.kind, lord.title, lord.of], ["lord", "Lord", "Calbury"]);
        assert.equal(general.kind, "general");
        assert.equal(general.title, "General");
        assert.deepEqual(senderOf(war, "human", "attack", { force: "army-2", at: [800, 0] }), general);
        assert.equal(senderOf(war, "human", "reserve", { force: "army-2", at: [800, 0] }).title, "Captain");
    });

    it("says what's asked, by whom, how long there is, and what it pays at their rank", () => {
        const war = warOf({ camps: [{ id: "camp-1", realm: "orc", at: [1300, 200], toward: "calbury" }] });
        const [found] = missionsNear({ war, realm: "human", at });
        const mission = missionOf({ war, realm: "human", ...found, rank: 0 });

        assert.equal(mission.title, MISSIONS.rout.title);
        assert.match(mission.text, /^The Iron Horde have a camp near Calbury\./);
        assert.equal(mission.until, war.turn + MISSIONS.rout.turns);
        assert.deepEqual(mission.reward, rewardOf("rout", 0));
        assert.equal(mission.state, "offered");
        assert.match(MORE_BY_RANK, /higher your rank/);
    });
});

describe("what a mission pays", () => {
    it("pays a Commoner gold, standing and a fine piece already, and more of each, better made, the higher their rank", () => {
        const commoner = rewardOf("rout", 0);
        const knight = rewardOf("rout", 3);
        const councillor = rewardOf("rout", 5);

        assert.deepEqual(commoner, { gold: 120, standing: 60, quality: "fine" });
        assert.ok(knight.gold > commoner.gold && knight.standing > commoner.standing);
        assert.equal(knight.quality, "rare");
        assert.equal(councillor.quality, "legendary");
        assert.equal(rewardOf("attack", 0).quality, "masterwork");
        assert.equal(rewardOf("rout", 0, { bonus: true }).gold, Math.round(120 * (1 + BONUS)));
        assert.match(rewardWords(commoner), /120 gold, 60 standing and your pick of three pieces from the armoury \(fine\)/);
        assert.equal(rewardOf("nonsense"), null);
    });

    it("offers three pieces to pick one of: for their weapon, armour of a kind they wear, and a ring or amulet, the same for the same seed", () => {
        const pieces = gearChoices({ weapon: "axe", worn: { chest: { id: "plate" }, head: { id: "cap" }, legs: { id: "breeches" }, boots: { id: "sabatons" }, gloves: { id: "warGloves" }, bracers: { id: "vambraces" } }, quality: "rare", level: 6, people: "human", seed: 42 });

        assert.equal(pieces.length, 3);
        assert.equal(pieces[0].id, "axe");
        assert.ok(["plate", "cap", "breeches", "sabatons", "warGloves", "vambraces"].includes(pieces[1].id));
        assert.ok(["ring", "amulet"].includes(pieces[2].id));
        assert.ok(pieces.every((piece) => piece.quality === "rare"));
        assert.deepEqual(gearChoices({ weapon: "axe", quality: "rare", level: 6, seed: 42 })[0], gearChoices({ weapon: "axe", quality: "rare", level: 6, seed: 42 })[0]);
        assert.equal(gearChoices({ weapon: "nonsense", seed: 1 })[0].id, "sword");
    });
});

describe("how a mission stands", () => {
    it("breaking a camp: done once it's gone with the player there; come to nothing without them; failed if it took the town, or the time ran out", () => {
        const war = warOf({ camps: [{ id: "camp-1", realm: "orc", at: [1300, 200], toward: "calbury" }] });
        const [found] = missionsNear({ war, realm: "human", at });
        const mission = missionOf({ war, realm: "human", ...found });

        assert.equal(checkMission(mission, { war, realm: "human", near: (point, reach) => near(at, reach)(point) }), null);
        assert.equal(mission.there, false);
        assert.equal(checkMission(mission, { war, realm: "human", near: (point, reach) => near([1300, 200], reach)(point) }), null);
        assert.equal(mission.there, true);
        war.camps = [];
        assert.equal(checkMission(mission, { war, realm: "human", near: () => false }), "ready");

        const other = missionOf({ war: warOf({ camps: [{ id: "camp-2", realm: "orc", at: [1300, 200], toward: "calbury" }] }), realm: "human", kind: "rout", key: "camp-2", target: { force: "camp-2", realm: "orc", at: [1300, 200], town: "calbury" } });

        assert.equal(checkMission(other, { war, realm: "human", near: () => false }), "void");
        war.towns[1].owner = "orc";
        assert.equal(checkMission({ ...other, there: true }, { war, realm: "human", near: () => false }), "failed");

        const late = missionOf({ war: warOf({ camps: [{ id: "camp-3", realm: "orc", at: [1300, 200] }] }), realm: "human", kind: "rout", key: "camp-3", target: { force: "camp-3", realm: "orc", at: [1300, 200] } });

        assert.equal(checkMission(late, { war: { ...warOf({ camps: [{ id: "camp-3", realm: "orc", at: [1300, 200] }] }), turn: 999 }, realm: "human", near: () => false }), "failed");
    });

    it("raiding wagons and cutting off reinforcements: done when they're lost to the player's people near where they were, with the player there; failed if they got through", () => {
        const war = warOf({ forces: [{ id: "column-1", realm: "orc", kind: "reinforcement", size: 9, at: [1600, 0], target: "army-1" }] });
        const mission = missionOf({ war, realm: "human", kind: "intercept", key: "column-1", target: { force: "column-1", realm: "orc", at: [1600, 0], size: 9 } });

        assert.equal(checkMission(mission, { war, realm: "human", near: () => true }), null);
        war.forces = [];
        war.log.push({ type: "intercepted", realm: "orc", by: "human", at: [1620, 10], turn: 11 });
        assert.equal(checkMission(mission, { war, realm: "human", near: () => false }), "ready");

        const through = missionOf({ war, realm: "human", kind: "wagons", key: "supply-9", target: { force: "supply-9", realm: "orc", at: [100, 100] } });

        assert.equal(checkMission(through, { war, realm: "human", near: () => false }), "failed");
    });

    it("cutting off reinforcements: followed into another column for the same army they've banded with on the march, still to do; their army gone, come to nothing; got through to it, failed", () => {
        const army = { id: "army-1", realm: "orc", kind: "army", size: 60, mission: "attack", target: "calbury", at: [4000, 0] };
        const offer = { force: "column-1", realm: "orc", at: [1600, 0], size: 9, to: "army-1" };

        // Taken into column-2 (before the mission was taken on, as the messenger came, and again
        // after: column-2 into column-3): followed, its place kept up with, still to do
        const war = warOf({ forces: [army, { id: "column-3", realm: "orc", kind: "reinforcement", size: 20, at: [1900, 0], target: "army-1" }] });

        war.log.push({ type: "banded", realm: "orc", from: "column-1", into: "column-2", at: [1700, 0], turn: 9 });
        war.log.push({ type: "banded", realm: "orc", from: "column-2", into: "column-3", at: [1800, 0], turn: 11 });

        const banded = missionOf({ war, realm: "human", kind: "intercept", key: "column-1", target: { ...offer } });

        assert.equal(checkMission(banded, { war, realm: "human", near: () => false }), null);
        assert.equal(banded.target.force, "column-3");
        assert.deepEqual(banded.target.at, [1900, 0]);

        // Cut off in it, with the player there: done
        war.forces = [army];
        war.log.push({ type: "intercepted", realm: "orc", by: "human", at: [1950, 0], turn: 12 });
        banded.there = true;
        assert.equal(checkMission(banded, { war, realm: "human", near: () => false }), "ready");

        // Gone with their army gone too (beaten, disbanded): gone home, come to nothing
        const home = missionOf({ war: warOf(), realm: "human", kind: "intercept", key: "column-1", target: { ...offer } });

        assert.equal(checkMission(home, { war: warOf(), realm: "human", near: () => false }), "void");

        // Gone, their army still there: with it, failed
        const joined = missionOf({ war: warOf({ forces: [army] }), realm: "human", kind: "intercept", key: "column-1", target: { ...offer } });

        assert.equal(checkMission(joined, { war: warOf({ forces: [army] }), realm: "human", near: () => false }), "failed");
    });

    it("standing with the reserve and marching with the army: done once the enemy's beaten with the player there; failed if ours were", () => {
        const war = warOf({
            forces: [
                { id: "reserve-1", realm: "human", kind: "reserve", size: 40, mission: "defend", target: "army-1", at: [500, 0] },
                { id: "army-1", realm: "orc", kind: "army", size: 60, mission: "attack", target: "calbury", at: [700, 0] },
            ],
        });
        const reserve = missionOf({ war, realm: "human", kind: "reserve", key: "reserve-1", target: { force: "reserve-1", realm: "human", at: [500, 0], against: "army-1", enemy: "orc" } });

        assert.equal(reserve.briefing, null);
        assert.equal(checkMission(reserve, { war, realm: "human", near: () => true }), null);
        war.forces = war.forces.filter(({ id }) => id !== "army-1");
        assert.equal(checkMission(reserve, { war, realm: "human", near: () => true }), "ready");

        const lost = warOf({ forces: [{ id: "army-1", realm: "orc", kind: "army", size: 60, at: [700, 0] }] });
        const beaten = { ...missionOf({ war: lost, realm: "human", kind: "reserve", key: "reserve-1", target: { force: "reserve-1", realm: "human", at: [500, 0], against: "army-1", enemy: "orc" } }), there: true };

        assert.equal(checkMission(beaten, { war: lost, realm: "human", near: () => false }), "failed");

        const marching = warOf({ forces: [{ id: "army-2", realm: "human", kind: "army", size: 50, mission: "attack", target: "skull", at: [8000, 0] }] });
        const attack = missionOf({ war: marching, realm: "human", kind: "attack", key: "army-2", target: { force: "army-2", realm: "human", at: [8000, 0], objective: "skull", objectiveKind: "town", objectiveName: "Skullcrag", enemy: "orc" } });

        assert.equal(checkMission(attack, { war: marching, realm: "human", near: () => true }), null);
        marching.towns[2].owner = "human";
        assert.equal(checkMission(attack, { war: marching, realm: "human", near: () => true }), "ready");
    });

    it("guarding works: done once the enemy army's gone with the player there; failed if the works fell", () => {
        const war = warOf({
            forces: [{ id: "army-1", realm: "orc", kind: "army", size: 60, mission: "attack", target: "works-1", at: [1800, 0] }],
            works: [{ id: "works-1", name: "Calbury", kind: "lumber mill", owner: "human", race: "human", at: [1700, 100] }],
        });
        const mission = missionOf({ war, realm: "human", kind: "guard", key: "works-1", target: { works: "works-1", realm: "human", at: [1700, 100], threat: "army-1", enemy: "orc" } });

        assert.equal(checkMission(mission, { war, realm: "human", near: () => true }), null);
        war.forces = [];
        assert.equal(checkMission(mission, { war, realm: "human", near: () => true }), "ready");
        war.works[0].owner = "orc";
        assert.equal(checkMission({ ...mission, state: "open" }, { war, realm: "human", near: () => true }), "failed");
    });

    it("bringing down a tower: done once razed by the player's people with them there; nothing if it was abandoned", () => {
        const war = warOf({ forts: [{ id: "fort-1", realm: "orc", kind: "tower", at: [1200, 0] }] });
        const mission = missionOf({ war, realm: "human", kind: "tower", key: "fort-1", target: { fort: "fort-1", realm: "orc", at: [1200, 0], fortKind: "tower", name: "the orcish guard tower" } });

        assert.equal(checkMission(mission, { war, realm: "human", near: () => true }), null);
        war.forts = [];
        war.log.push({ type: "razed", fort: "fort-1", by: "human", played: true });
        assert.equal(checkMission(mission, { war, realm: "human", near: () => false }), "ready");
        war.log.push({ type: "abandoned", fort: "fort-1" });
        assert.equal(checkMission(mission, { war, realm: "human", near: () => false }), "void");
    });
});

describe("missions carried (core/standing.js Standing)", () => {
    it("takes so many at once, not the same twice, sets them down done or failed, and keeps them all", () => {
        const war = warOf();
        const standing = new Standing();
        const offered = (key) => missionOf({ war, realm: "human", kind: "tower", key, target: { fort: key, realm: "orc", at: [1200, 0], name: "the orcish guard tower" } });
        const first = standing.takeMission(offered("fort-1"));

        assert.equal(first.id, "mission-1");
        assert.equal(first.state, "open");
        assert.equal(standing.takeMission(offered("fort-1")), null);
        assert.ok(standing.takeMission(offered("fort-2")));
        assert.equal(standing.takeMission(offered("fort-3")), null);
        standing.findMission("mission-1").state = "won";
        assert.ok(standing.takeMission(offered("fort-3")));
        assert.equal(standing.closeMission("mission-2", "failed").state, "failed");
        standing.messengerAt = 12;

        const back = new Standing(JSON.parse(JSON.stringify(standing.toJSON())));

        assert.deepEqual(back.toJSON(), standing.toJSON());
        assert.deepEqual(back.missionsDone.map(({ id }) => id), ["mission-2"]);
        assert.equal(back.messengerAt, 12);
        assert.deepEqual(new Standing({ missions: [{ kind: "nonsense", id: "x" }, { kind: "rout" }] }).missions, []);
    });
});

describe("a commander's briefing", () => {
    it("says what they face, the player's part and the objective worth more, the same for the same seed", () => {
        const war = warOf();
        const mission = missionOf({ war, realm: "human", kind: "attack", key: "army-2", target: { force: "army-2", realm: "human", at: [800, 0], objective: "skull", objectiveKind: "town", objectiveName: "Skullcrag", enemy: "orc" } });
        const briefing = briefingOf({ mission, enemy: { realm: "orc", size: 42, commander: "Warlord Gorm", engines: 2 }, ours: { size: 50 }, seed: 7 });

        assert.equal(briefing.lines.length, 4);
        assert.match(briefing.lines[0], /Skullcrag is held by 42 orcish soldiers under Warlord Gorm/);
        assert.match(briefing.lines[1], /50 strong, and they've 2 siege engines/);
        assert.ok(["left", "right", "centre", "archers"].includes(briefing.part));
        assert.ok(["standard", "commander"].includes(briefing.bonus));
        assert.deepEqual(briefingOf({ mission, enemy: { realm: "orc", size: 42 }, seed: 7 }).part, briefing.part);
    });
});
