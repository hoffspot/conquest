// The war's end (docs/WAR.md M10: client/js/core/war/war.js, core/host.js): a people that serves
// another grows restless, stirred on by its players, and rises; a fallen people rises again in one
// of its old towns; a rising called at a player's counsel in their own keep, once the people are
// ready enough for their word; and each player told of their people's fate: victory (and honours),
// brought under another, fallen, risen, their rule undone
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { HONOURS, HOST_PLAYER, Host, STIR } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { COUNSEL, OPENS, STANDINGS } from "../client/js/core/standing.js";
import { tell } from "../client/js/core/war/news.js";
import { HOLDINGS, RISING, TURN_MS, War } from "../client/js/core/war/war.js";
import { planWorld } from "../client/js/core/worldplan/plan.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

function play(war, turns) {
    const events = [];

    for (let k = 0; k < turns; k++) {
        events.push(...war.advance(TURN_MS));
    }

    return events;
}

function run(host, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...host.advance(STEP_MS));
    }

    return events;
}

const put = (actor, map, [x, y]) => Object.assign(actor, { map, square: [x, y], x: x + 0.5, y: y + 0.5, to: null, path: [], order: null, target: null });

// The words for a war's events: each told, none left blank
const told = (events, war) => events.map((event) => tell(event, war)).filter((words) => !/undefined|null/.test(words));

describe("the war's end (war.js)", () => {
    let plan;

    before(() => {
        plan = planWorld(3);
    });

    it("makes a people that serves another restless as it serves, the more for a grudge, and stirred by its players; ready, it rises", () => {
        const war = new War(plan);
        const human = war.realm("human");

        assert.equal(human.unrest, 0);
        assert.equal(war.oppressor("human"), null);
        assert.equal(war.stir("human", 10), null, "(a free people has nothing to rise against)");

        Object.assign(human, { overlord: "orc", since: war.turn });
        assert.equal(war.oppressor("human"), "orc");

        play(war, 4);
        assert.ok(Math.abs(human.unrest - 4 * RISING.perTurn) < 1e-9, `${human.unrest}`);

        human.standing.orc = -50;
        play(war, 4);
        assert.ok(Math.abs(human.unrest - 4 * RISING.perTurn - 4 * (RISING.perTurn + RISING.grudge)) < 1e-9, `${human.unrest}`);

        // Stirred to the brim: restless, then risen at the next turn, at war with its overlord
        assert.equal(war.stir("human", 50), human.unrest);
        assert.ok(human.unrest > 50);

        war.stir("human", 100);
        assert.equal(human.unrest, RISING.ready);

        const events = play(war, 1);

        assert.ok(war.log.some(({ type, realm, against }) => type === "restless" && realm === "human" && against === "orc"));
        assert.ok(events.some(({ type, realm, from, against, led }) => type === "rebelled" && realm === "human" && from === "orc" && against === "orc" && led === false));
        assert.equal(human.overlord, null);
        assert.equal(human.unrest, 0);
        assert.equal(war.relation("human", "orc"), "hostile");
        assert.ok((war.realm("orc").standing.human ?? 0) <= -30);
        assert.ok(told(war.log, war).some((words) => words === "The Humans have risen against the Orcs!"), told(war.log, war).join(" / "));
        assert.ok(told(war.log, war).some((words) => words.startsWith("The Humans are restless under the Orcs")));
    });

    it("rises at a player's counsel only once the people are ready enough for their word: the weightier, the sooner", () => {
        const war = new War(plan);
        const human = war.realm("human");

        Object.assign(human, { overlord: "orc", since: war.turn, unrest: 60 });

        assert.equal(war.rise("human"), false, "(not ready of itself)");
        assert.equal(war.rise("human", { weight: COUNSEL[OPENS.rise] }), false, "(a knight's word isn't enough yet)");
        assert.equal(human.overlord, "orc");

        human.unrest = RISING.ready * (1 - COUNSEL[OPENS.rise] * (1 - RISING.early));
        assert.equal(war.rise("human", { weight: COUNSEL[OPENS.rise] }), true);
        assert.equal(human.overlord, null);
        assert.equal(war.relation("human", "orc"), "hostile");
        assert.ok(war.events.some(({ type, led }) => type === "rebelled" && led === true));

        // (Free, there's nothing to rise against)
        assert.equal(war.rise("human", { weight: 1 }), false);

        // A councillor's word: at half the way
        const other = new War(plan);

        Object.assign(other.realm("elf"), { overlord: "human", since: 0, unrest: RISING.ready * RISING.early });
        assert.equal(other.rise("elf", { weight: 1 }), true);
    });

    it("lets a vassal of a vassal rise against the one at the top", () => {
        const war = new War(plan);

        Object.assign(war.realm("orc"), { overlord: "cat", since: 0 });
        Object.assign(war.realm("human"), { overlord: "orc", since: 0, unrest: RISING.ready });
        assert.equal(war.oppressor("human"), "cat");
        assert.equal(war.rise("human"), true);
        assert.equal(war.relation("human", "cat"), "hostile");
    });

    it("raises a fallen people again in the old town of theirs nearest a player, held by some of its own, at war with those who held it", () => {
        const war = new War(plan);
        const human = war.realm("human");
        const old = war.towns.filter(({ race }) => race === "human");

        // (Every one of its towns the orcs')
        for (const town of old) {
            town.owner = "orc";
        }

        Object.assign(human, { alive: false, overlord: null });
        assert.equal(war.oppressor("human"), "orc");

        // Stirred: a fallen people doesn't grow restless of itself
        play(war, 3);
        assert.equal(human.unrest, 0);
        war.stir("human", 40);
        assert.equal(human.unrest, 40);

        const far = old.reduce((best, each) => (each.at[0] > best.at[0] ? each : best));

        assert.equal(war.rise("human", { near: far.at }), false, "(not ready)");
        war.stir("human", 60);
        assert.equal(war.rise("human", { near: [far.at[0] + 10, far.at[1]] }), true);
        assert.equal(far.owner, "human");
        assert.equal(far.garrison, Math.ceil(HOLDINGS[far.kind].garrison * RISING.garrison));
        assert.equal(human.alive, true);
        assert.equal(human.seat, far.id);
        assert.equal(war.relation("human", "orc"), "hostile");

        const risen = war.events.find(({ type }) => type === "risen");

        assert.deepEqual({ realm: risen.realm, town: risen.town, from: risen.from, against: risen.against }, { realm: "human", town: far.id, from: "orc", against: "orc" });
        assert.equal(tell(risen, war), `The Humans have risen in ${far.name}, and thrown out the Orcs!`);

        // (It rules from there, and plays its part again)
        play(war, 3);
        assert.ok(war.towns.some(({ owner }) => owner === "human"));
    });

    it("undoes a victory when one who served rises", () => {
        const war = new War(plan);

        for (const realm of war.realms.filter(({ id }) => id !== "orc")) {
            Object.assign(realm, { overlord: "orc", since: war.turn });
        }

        assert.ok(play(war, 1).some(({ type, realm }) => type === "victory" && realm === "orc"));
        assert.equal(war.victor, "orc");

        war.stir("human", RISING.ready);

        const events = play(war, 1);

        assert.ok(events.some(({ type, realm }) => type === "rebelled" && realm === "human"));
        assert.ok(events.some(({ type, realm }) => type === "undone" && realm === "orc"));
        assert.equal(war.victor, null);
    });

    it("keeps each people's unrest, and carries on a war kept before there was any", () => {
        const war = new War(plan);

        Object.assign(war.realm("human"), { overlord: "orc", since: 0 });
        war.stir("human", 33);

        const again = War.restore(plan, war.snapshot());

        assert.equal(again.realm("human").unrest, 33);

        // (Kept before M10: none)
        const old = war.snapshot();

        for (const realm of old.realms) {
            delete realm.unrest;
        }

        const older = War.restore(plan, old);

        assert.equal(older.stir("human", 5), 5);
        play(older, 1);
        assert.ok(older.realm("human").unrest > 5);
    });
});

describe("a player's people at the war's end (host.js)", () => {
    // A world with its player in it, its war kept going by the tests
    const hosted = () => {
        const host = new Host(buildWorld({ seed: 2 }), { populate: false });

        host.join({ id: HOST_PLAYER, hero: HERO });

        return { host, war: host.war, player: host.players.get(HOST_PLAYER) };
    };

    const fates = (events) => events.filter(({ type }) => type === "fate").map(({ fate, by, town }) => ({ fate, by, town }));

    it("tells the player of their people brought under another, restless, risen; and their victory, with honours", () => {
        const { host, war, player } = hosted();

        // Brought under the orcs (as the war tells it)
        war.events.push({ type: "subjugated", turn: war.turn, realm: "human", by: "orc", was: null });
        Object.assign(war.realm("human"), { overlord: "orc", since: war.turn });
        assert.deepEqual(fates(run(host, STEP_MS)), [{ fate: "subjugated", by: "orc", town: null }]);

        // Stirred to the brim: restless, then risen
        war.stir("human", RISING.ready);
        assert.deepEqual(fates(run(host, STEP_MS)), [{ fate: "restless", by: "orc", town: null }]);
        assert.deepEqual(fates(run(host, TURN_MS)), [{ fate: "risen", by: "orc", town: null }]);

        // Every other people brought under the humans: victory, and honours
        const before = player.standing.points;

        for (const realm of war.realms.filter(({ id }) => id !== "human")) {
            Object.assign(realm, { overlord: "human", since: war.turn });
        }

        const events = run(host, TURN_MS);

        assert.deepEqual(fates(events), [{ fate: "victory", by: "human", town: null }]);
        assert.equal(player.standing.points, before + HONOURS);
        assert.ok(events.some(({ type, id }) => type === "standing" && id === HOST_PLAYER));
    });

    it("tells them of another's victory: serving the victors, or fallen", () => {
        const { host, war } = hosted();

        for (const realm of war.realms.filter(({ id }) => id !== "orc")) {
            Object.assign(realm, { overlord: "orc", since: war.turn });
        }

        assert.deepEqual(fates(run(host, TURN_MS)), [{ fate: "serving", by: "orc", town: null }]);

        // (Fallen, with the orcs ruling the rest)
        const other = hosted();

        for (const realm of other.war.realms.filter(({ id }) => id !== "orc" && id !== "human")) {
            Object.assign(realm, { overlord: "orc", since: 0 });
        }

        for (const town of other.war.towns.filter(({ owner }) => owner === "human")) {
            town.owner = "orc";
        }

        other.war.realm("human").alive = false;
        assert.deepEqual(fates(run(other.host, TURN_MS)), [{ fate: "defeat", by: "orc", town: null }]);
    });

    it("stirs their people with work done for their own rulers while they serve (a tithe the more), and for the guilds; not for their overlords", () => {
        const { host, war, player } = hosted();
        const home = host.world.start.id;
        const theirs = war.towns.find(({ owner }) => owner === "orc").id;
        const actor = host.battle.actor(HOST_PLAYER);
        const human = war.realm("human");

        Object.assign(human, { overlord: "orc", since: war.turn });
        player.progress.gold = 500;

        // Word brought to one of the folk (in a building of the home town, got ready), of work done
        const report = (key, role, request) => {
            const building = host.world.interiors.buildings.get(key);

            host.command(HOST_PLAYER, { type: "talk", with: null });
            put(actor, "town", building.door.ends[0].squares[0]);
            assert.equal(host.command(HOST_PLAYER, { type: "enter", link: building.door.id }).ok, true);
            run(host, STEP_MS);

            const { id } = building.folk.find((one) => one.role === role);
            const npc = host.battle.actor(id);

            put(actor, npc.map, [npc.square[0], npc.square[1] + 2]);
            assert.equal(host.command(HOST_PLAYER, { type: "talk", with: id }).ok, true);
            player.standing.take({ title: request.kind, given: 0, state: "open", count: 0, until: 999, reward: { standing: 5, coppers: 5 }, text: "", key: request.kind, ...request });
            assert.equal(host.command(HOST_PLAYER, { type: "effect", effect: { report: true } }).ok, true);

            return human.unrest;
        };
        const from = (town, post) => ({ id: "someone", name: "Someone", title: "Steward", town, townName: "There", post });
        const letter = (town) => ({ kind: "message", from: from(town, "keep"), target: { town: home, name: "Home", at: [0, 0], post: "hall" } });

        // A letter from the overlords: no stir; from their own: stirred; a tithe for their own, the more
        assert.equal(report("home:hall-1", "reeve", letter(theirs)), 0);
        assert.equal(report("home:hall-1", "reeve", letter(home)), STIR.request);
        assert.equal(report("home:hall-1", "reeve", { kind: "tithe", from: from(home, "hall"), target: { coppers: 20 } }), STIR.request + STIR.tithe);

        // A guild's contract
        const guild = [...host.world.interiors.buildings.values()].find(({ kind, place }) => kind === "guild" && place === "home");

        assert.equal(report(guild.key, "receptionist", { kind: "beasts", from: from(home, "guild"), state: "done", target: { wild: true, need: 1 }, count: 1 }), STIR.request + STIR.tithe + STIR.contract);

        // (Free again: nothing stirs)
        human.overlord = null;
        assert.equal(report("home:hall-1", "reeve", letter(home)), STIR.request + STIR.tithe + STIR.contract);
    });

    it("hears a rising counselled at the ruler's feet in their own keep, once the people are ready enough for the counsellor's rank", () => {
        const { host, war, player } = hosted();
        const capital = host.world.plan.places.find(({ kind, race }) => kind === "capital" && race === "human");

        host.world.maps.town.settlements.of(capital);

        const keep = [...host.world.interiors.buildings.values()].find(({ kind, place }) => kind === "keep" && place === capital.id);

        host.command(HOST_PLAYER, { type: "enter", link: keep.door.id });
        host.command(HOST_PLAYER, { type: "stop" });

        const ruler = keep.folk.find(({ role }) => role === "ruler");
        const npc = host.battle.actor(ruler.id);

        put(host.battle.actor(HOST_PLAYER), npc.map, [npc.square[0], npc.square[1] + 2]);
        assert.equal(host.command(HOST_PLAYER, { type: "talk", with: ruler.id }).ok, true);

        const rise = () => host.command(HOST_PLAYER, { type: "effect", effect: { counsel: { rise: true } } });

        // Free: nothing to rise against; serving, not of the rank
        Object.assign(war.realm("human"), { overlord: "orc", since: war.turn, unrest: 70 });
        assert.equal(rise().reason, "rank");

        // A knight: not ready enough; then ready
        player.standing.gain(STANDINGS[OPENS.rise].points);
        assert.equal(rise().reason, "unready");
        war.realm("human").unrest = 80;
        assert.equal(rise().ok, true);
        assert.equal(war.realm("human").overlord, null);
        assert.equal(war.relation("human", "orc"), "hostile");
    });
});
