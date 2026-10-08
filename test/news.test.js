// News and rumours, and the guild's board (client/js/core/war/news.js rumoursAt, rumourOfRuler;
// core/standing.js offerContract; core/host.js; core/dialogue.js; docs/WAR.md M8): the war's news
// as it's heard in a town, newest first, what's near and what's heard everywhere; what's said of
// its rulers; told in the taverns and by adventurers; the guild's contracts, for anyone, paid in
// gold, taken and told of at its counter
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { Conversation, TREES } from "../client/js/core/dialogue.js";
import { HOST_PLAYER, Host } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { createRandom } from "../client/js/core/random.js";
import { holderOf, PLACE_BANDS, placesOf } from "../client/js/core/places.js";
import { GUILD_REACH, GUILD_SIZES, MOST_REQUESTS, offerContract, progressOf, REQUESTS } from "../client/js/core/standing.js";
import { rumourOfRuler, rumoursAt, tell } from "../client/js/core/war/news.js";
import { TURN_MS, War } from "../client/js/core/war/war.js";
import { planWorld } from "../client/js/core/worldplan/plan.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

function run(host, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...host.advance(STEP_MS));
    }

    return events;
}

describe("news and rumours, and the guild's board (news.js, standing.js, host.js)", () => {
    const plan = planWorld(3);

    it("hears the war's news in a town, newest first: what's near, and what's heard everywhere", () => {
        const war = new War(plan);
        const here = war.towns[0];
        const apart = (town) => Math.hypot(town.at[0] - here.at[0], town.at[1] - here.at[1]);
        const far = [...war.towns].sort((a, b) => apart(b) - apart(a))[0];

        assert.ok(apart(far) > 5000, "(one far off)");
        const say = (event) => war.log.push({ turn: war.turn, ...event });

        say({ type: "raid", realm: "orc", town: here.id, owner: here.owner, killed: 2, lost: 1 });
        say({ type: "raid", realm: "orc", town: far.id, owner: far.owner, killed: 1, lost: 0 });
        say({ type: "declared", by: "orc", on: "elf" });
        say({ type: "counsel", realm: "human", march: here.id });

        const heard = rumoursAt(war, here.at);

        assert.deepEqual(heard, [tell(war.log.at(-2), war), tell(war.log.at(-4), war)]);
        assert.ok(!heard.some((words) => words.includes(far.name)), "(what's far off isn't heard)");
        assert.equal(rumoursAt(war, here.at, { count: 1 }).length, 1);
        assert.deepEqual(rumoursAt(new War(plan), here.at), []);
    });

    it("says what's said of a ruler, if anything's marked", () => {
        const war = new War(plan);
        const orcs = war.realm("orc");

        orcs.leader.traits.aggression = 0.95;

        assert.match(rumourOfRuler(war, "orc"), new RegExp(`^They say ${orcs.leader.title} ${orcs.leader.name} of the Orcs is .+\\.$`));

        Object.assign(orcs.leader.traits, { aggression: 0.5, greed: 0.5, loyalty: 0.5, grudge: 0.5, caution: 0.5 });
        assert.equal(rumourOfRuler(war, "orc"), null);
    });

    it("tells the war's news in the taverns, and by adventurers, when there's any", () => {
        for (const role of ["barkeep", "patron", "innkeeper", "barmaid", "adventurer"]) {
            const tree = TREES[role];

            assert.ok(tree.nodes.war, role);

            const heard = (rumour) =>
                new Conversation(tree, { speaker: { id: role, name: "Hob Miller", title: role }, names: { rumour1: "A", rumour2: "B", rumour3: "C", rumourRuler: "D" }, check: (condition) => ("rumour" in condition ? condition.rumour === rumour : true) });
            // (Asked from wherever they're asked what else: "more", or the adventurer's greeting)
            const conversation = heard(true);
            let found = conversation.choices.find(({ text }) => /war|road/.test(text));

            for (let k = 0; k < 3 && !found; k++) {
                conversation.choose(conversation.choices.findIndex(({ ends }) => !ends));
                found = conversation.choices.find(({ text }) => /war|road/.test(text));
            }

            assert.ok(found, `${role}: asked of the war`);
            conversation.choose(conversation.choices.indexOf(found));
            assert.match(conversation.line, /[ABCD]/, role);

            // (Not asked when there's nothing to tell)
            const quiet = heard(false);

            for (let k = 0; k < 3; k++) {
                assert.ok(!quiet.choices.some(({ next }) => next === "war"), role);

                if (quiet.choices.some(({ ends }) => !ends)) {
                    quiet.choose(quiet.choices.findIndex(({ ends }) => !ends));
                }
            }
        }
    });

    it("puts contracts on the guild's board for anyone: beasts, creatures' parts wanted, a bounty on the holders' enemies, the camp outside, a place near held by outlaws or the dead", () => {
        const war = new War(plan);
        const town = war.towns.find(({ kind, owner }) => kind === "town" && owner === "human");
        const giver = { id: "guild/receptionist", name: "Mirabel Wren", title: "" };
        const random = createRandom(2);
        // (Offered to a Copper, or to the rank that opens a bounty and the camp outside)
        const opens = Math.max(REQUESTS.hunt.rank, REQUESTS.camp.rank);
        const kinds = (guildRank = 0) => new Set(Array.from({ length: 60 }, () => offerContract({ war, town: town.id, giver, guildRank, random })?.kind));
        // (A place near held by outlaws or the dead, no bigger than the rank gives: to be cleared)
        const clear = (guildRank) => (placesOf(plan).some((place) => Math.hypot(place.at[0] - town.at[0], place.at[1] - town.at[1]) <= GUILD_REACH && PLACE_BANDS[holderOf(plan, place, undefined, war.turn)] && GUILD_SIZES[place.size] <= guildRank) ? ["clear"] : []);

        assert.deepEqual([...kinds()].sort(), ["beasts", ...clear(0), "parts"].sort());

        war.relations["human|orc"] = { state: "hostile", since: 0 };
        war.camps.push({ id: "camp-900", realm: "orc", at: [town.at[0] + 300, town.at[1]], guard: 6, built: 0, done: 0, toward: town.id, used: 0, skirmished: 0 });
        assert.deepEqual([...kinds()].sort(), ["beasts", ...clear(0), "parts"].sort(), "not for a Copper");
        assert.deepEqual([...kinds(opens)].sort(), ["beasts", "camp", ...clear(opens), "hunt", "parts"].sort());

        for (let k = 0; k < 30; k++) {
            const contract = offerContract({ war, town: town.id, giver, guildRank: opens, random });

            assert.equal(contract.from.post, "guild");
            assert.equal(contract.from.title, "Guild receptionist");
            assert.equal(contract.reward.standing, 0);
            assert.ok(contract.reward.gold > 0);
            assert.ok(progressOf(contract).length > 5);

            if (contract.kind === "hunt") {
                assert.equal(contract.target.realm, "orc");
            }

            if (contract.kind === "camp") {
                assert.equal(contract.target.force, "camp-900");
            }
        }

        assert.equal(offerContract({ war, town: town.id, giver, random, held: Array.from({ length: MOST_REQUESTS }, () => ({ kind: "x" })) }), null);
    });

    it("gives a guild's contracts to a player of any people at its counter, and pays in gold when they're done", () => {
        const host = new Host(buildWorld({ seed: 2 }), { populate: false });

        host.join({ id: HOST_PLAYER, hero: HERO });
        host.populate();

        const player = host.players.get(HOST_PLAYER);
        const guild = [...host.world.interiors.buildings.values()].find(({ kind, place }) => kind === "guild" && place === "home");

        // (A stranger: the town held by another people), into the guild, before its counter
        host.war.town(host.world.start.id).owner = "elf";
        host.command(HOST_PLAYER, { type: "enter", link: guild.door.id });
        host.command(HOST_PLAYER, { type: "stop" });
        run(host, 1000);

        const receptionist = host.battle.actor(guild.folk.find(({ role }) => role === "receptionist").id);
        const me = host.battle.actor(HOST_PLAYER);

        Object.assign(me, { map: receptionist.map, square: [receptionist.square[0], receptionist.square[1] + 2], path: [], order: null });
        Object.assign(me, { x: me.square[0] + 0.5, y: me.square[1] + 0.5 });
        assert.equal(host.command(HOST_PLAYER, { type: "talk", with: receptionist.id }).ok, true);

        // (Registered first: nothing off the board before)
        assert.equal(host.command(HOST_PLAYER, { type: "effect", effect: { work: "ask" } }).reason, "unregistered");
        assert.equal(host.command(HOST_PLAYER, { type: "effect", effect: { guild: "register" } }).ok, true);

        const offered = host.command(HOST_PLAYER, { type: "effect", effect: { work: "ask" } });

        assert.equal(offered.ok, true, JSON.stringify(offered));
        assert.equal(offered.request.from.post, "guild");

        const taken = host.command(HOST_PLAYER, { type: "effect", effect: { work: "accept" } }).request;
        const held = player.standing.find(taken.id);

        // Done (as if the beasts or soldiers were brought down, or the parts found), and told of at
        // the counter
        if (held.kind === "parts") {
            player.progress.stow({ id: held.target.part }, held.target.need);
        } else {
            Object.assign(held, { state: "done", count: held.target.need ?? 0 });
        }

        const [gold, points] = [player.progress.gold, player.standing.points];
        const told = host.command(HOST_PLAYER, { type: "effect", effect: { report: true } });

        assert.equal(told.ok, true, JSON.stringify(told));
        assert.equal(player.progress.gold, gold + taken.reward.gold);
        assert.equal(player.standing.points, points);
        assert.ok(taken.reward.merit > 0);
        assert.equal(player.standing.guild.merit, taken.reward.merit);
        assert.ok(!player.standing.find(taken.id));
        run(host, TURN_MS / 60);
    });
});
