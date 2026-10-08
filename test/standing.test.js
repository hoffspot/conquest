// A player's standing in their people (client/js/core/standing.js): the ranks, and the requests
// their rulers make of them, from the war as it stands
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { createRandom } from "../client/js/core/random.js";
import { armouryGift, COUNSEL, KEEP_REWARD, MOST_REQUESTS, offerRequest, OPENS, progressOf, REQUESTS, Standing, STANDINGS, whereTo } from "../client/js/core/standing.js";
import { War } from "../client/js/core/war/war.js";
import { planWorld } from "../client/js/core/worldplan/plan.js";

const apart = ([ax, ay], [bx, by]) => Math.hypot(ax - bx, ay - by);
const REEVE = { id: "reeve", name: "Osric Hale", title: "Reeve" };

// Many offers, from the same town and post, at a rank
function offers(war, { town, post = "hall", rank = 0, held = [], realm = "human", count = 200, seed = 1 }) {
    const random = createRandom(seed);

    return Array.from({ length: count }, () => offerRequest({ war, realm, town, post, giver: REEVE, rank, held, random }));
}

describe("standing (standing.js)", () => {
    let plan;
    let war;
    let home;

    before(() => {
        plan = planWorld(3);
        war = new War(plan);
        home = war.towns.find(({ owner, kind }) => owner === "human" && kind === "town");
    });

    it("climbs from commoner to councillor, each rank told as it's reached, and falls back if lost", () => {
        const standing = new Standing();

        assert.deepEqual([standing.rank(), standing.title()], [0, "Commoner"]);
        assert.deepEqual(standing.gain(59), []);
        assert.deepEqual(standing.gain(1), [{ rank: 1, title: "Freeholder" }]);
        assert.deepEqual(
            standing.gain(1000).map(({ title }) => title),
            ["Retainer", "Knight", "Lord"],
        );
        assert.deepEqual(standing.toNext(), { points: 1060, from: 800, to: 1500 });
        standing.gain(-900);
        assert.equal(standing.title(), "Freeholder");
        standing.gain(-9999);
        assert.equal(standing.points, 0);
        standing.gain(99999);
        assert.equal(standing.toNext().to, null);
        assert.equal(standing.title(), STANDINGS.at(-1).title);

        // (A say in the rulers' counsel only from a Knight up, weighing more with each rank)
        assert.deepEqual(COUNSEL.slice(0, OPENS.march), [0, 0, 0]);
        assert.ok(COUNSEL.slice(OPENS.march).every((weight, k, all) => weight > 0 && (k === 0 || weight > all[k - 1])));
    });

    it("gives the armoury's gift for each rank from a retainer up: their people's hauberk, then a masterwork of the player's own weapon, their people's shield if they can carry one (a helm if not), then a legend", () => {
        assert.equal(armouryGift(1, "bow", false, "elf"), null);
        assert.deepEqual(armouryGift(2, "bow", false, "elf"), { id: "hauberk", quality: "fine", people: "elf" });
        assert.deepEqual(armouryGift(3, "bow", false, "elf"), { id: "bow", quality: "masterwork" });
        assert.deepEqual(armouryGift(4, "sword", true, "orc"), { id: "shield", quality: "masterwork", people: "orc" });
        assert.deepEqual(armouryGift(4, "bow", false, "cat"), { id: "helm", quality: "masterwork", people: "cat" });
        assert.deepEqual(armouryGift(5, "hammer", false), { id: "hammer", quality: "legendary" });
    });

    it("asks a commoner to carry letters to their people's other towns, to clear the wild off the roads, or (the treasury thin) for a tithe: never to scout or hold a town", () => {
        const all = offers(war, { town: home.id }).filter(Boolean);
        const kinds = new Set(all.map(({ kind }) => kind));

        assert.ok(kinds.has("message") && kinds.has("wild"), [...kinds].join());
        assert.ok(!kinds.has("scout") && !kinds.has("defend"));

        for (const request of all) {
            assert.equal(request.from.town, home.id);
            assert.equal(request.state, "open");
            assert.ok(request.text.length > 20 && request.title === REQUESTS[request.kind].title);
            assert.ok(request.until > war.turn);
        }

        // Letters go to another of their own towns with someone to take them, further paying more
        const letters = all.filter(({ kind }) => kind === "message");

        for (const letter of letters) {
            const to = war.town(letter.target.town);

            assert.equal(to.owner, "human");
            assert.notEqual(to.id, home.id);
            assert.ok(["town", "city", "capital"].includes(to.kind));
            assert.equal(letter.target.post, to.kind === "capital" ? "keep" : "hall");
        }

        const [near, far] = [...letters].sort((a, b) => apart(a.target.at, home.at) - apart(b.target.at, home.at)).filter((letter, k, sorted) => k === 0 || k === sorted.length - 1);

        if (near !== far) {
            assert.ok(far.reward.standing >= near.reward.standing && far.until - far.given >= near.until - near.given);
        }

        // (A tithe only while the treasury's thin)
        war.realm("human").treasury = 10;
        assert.ok(offers(war, { town: home.id }).some((request) => request?.kind === "tithe"));
        war.realm("human").treasury = 500;
        assert.ok(!offers(war, { town: home.id }).some((request) => request?.kind === "tithe"));
    });

    it("asks for the enemy's soldiers brought down only in a war, and to scout once trusted: their camp if it's near, or their nearest town", () => {
        const fresh = new War(plan);
        const town = fresh.towns.find(({ id }) => id === home.id);

        assert.ok(!offers(fresh, { town: town.id }).some((request) => request?.kind === "bounty"));

        const enemy = fresh.realms.find(({ id }) => id !== "human").id;

        fresh.relations[["human", enemy].sort().join("|")] = { state: "hostile", since: 0 };
        fresh.known.push(["human", enemy].sort().join("|"));
        assert.ok(fresh.hostile("human", enemy));

        const bounties = offers(fresh, { town: town.id }).filter((request) => request?.kind === "bounty");

        assert.ok(bounties.length);
        assert.ok(bounties.every(({ target }) => target.realm === enemy && target.need >= 2));
        assert.ok(!offers(fresh, { town: town.id }).some((request) => request?.kind === "scout"));

        const scouting = offers(fresh, { town: town.id, rank: OPENS.scout }).filter((request) => request?.kind === "scout");
        const nearest = fresh.towns.filter(({ owner }) => owner === enemy).sort((a, b) => apart(a.at, town.at) - apart(b.at, town.at))[0];

        assert.ok(scouting.length);
        assert.ok(scouting.every(({ target }) => target.town === nearest.id));

        // An enemy camp near: that, instead
        fresh.camps.push({ id: "camp-99", realm: enemy, at: [town.at[0] + 600, town.at[1]], guard: 6, built: 0, done: 0, toward: town.id, used: 0, skirmished: 0 });

        const camped = offers(fresh, { town: town.id, rank: OPENS.scout }).filter((request) => request?.kind === "scout");

        assert.ok(camped.every(({ target }) => target.force === "camp-99"));
        assert.deepEqual(whereTo(camped[0], fresh).at, [town.at[0] + 600, town.at[1]]);

        // And, from a retainer up, to hold the town it threatens
        const defend = offers(fresh, { town: town.id, rank: OPENS.defend }).filter((request) => request?.kind === "defend");

        assert.ok(defend.length);
        assert.ok(defend.every(({ target, until }) => target.town === town.id && target.camp === "camp-99" && until === null));
        assert.ok(!offers(fresh, { town: town.id, rank: OPENS.defend - 1 }).some((request) => request?.kind === "defend"));

        // The keep asks the weightier things, for more
        const keep = offers(fresh, { town: town.id, rank: OPENS.defend, post: "keep" }).filter(Boolean);

        assert.ok(keep.every(({ kind }) => ["scout", "defend", "rout", "bounty"].includes(kind)));

        const [hall] = offers(fresh, { town: town.id, rank: OPENS.defend, seed: 5, count: 1 });
        const [kept] = offers(fresh, { town: town.id, rank: OPENS.defend, seed: 5, count: 1, post: "keep" });

        if (hall.kind === kept.kind && hall.key === kept.key) {
            assert.equal(kept.reward.standing, Math.round(hall.reward.standing * KEEP_REWARD) || kept.reward.standing);
        }
    });

    it("asks nothing of a player in a town not their people's, nor more than they can carry, nor the same thing twice", () => {
        const theirs = war.towns.find(({ owner }) => owner !== "human");

        assert.ok(offers(war, { town: theirs.id }).every((request) => request === null));

        const held = Array.from({ length: MOST_REQUESTS }, (_, k) => ({ kind: "wild", key: `x${k}` }));

        assert.ok(offers(war, { town: home.id, held }).every((request) => request === null));
        assert.ok(offers(war, { town: home.id, held: [{ kind: "wild", key: "wild" }] }).every((request) => request?.kind !== "wild"));
    });

    it("carries requests (so many at once), sets them down done or failed, tells how far each has come, and keeps it all", () => {
        const standing = new Standing();
        const [offer] = offers(war, { town: home.id, count: 1, seed: 3 });
        const taken = standing.take(offer);

        assert.equal(taken.id, "request-1");
        assert.equal(standing.find("request-1"), taken);
        assert.equal(typeof progressOf(taken), "string");

        for (let k = 1; k < MOST_REQUESTS; k++) {
            assert.ok(standing.take(offer));
        }

        assert.equal(standing.take(offer), null);
        assert.equal(standing.close("request-2", "done").state, "done");
        assert.equal(standing.close("request-2", "done"), null);
        assert.deepEqual(
            standing.requests.map(({ id }) => id),
            ["request-1", "request-3"],
        );
        assert.equal(standing.done[0].id, "request-2");

        const back = new Standing(JSON.parse(JSON.stringify(standing)));

        assert.deepEqual(back.toJSON(), standing.toJSON());
        assert.equal(back.take(offer).id, "request-4");

        // (Nonsense kept is let go)
        assert.deepEqual(new Standing({ points: -4, requests: [{ kind: "nonsense" }], claimed: ["x", 2], guild: { merit: "lots" } }).toJSON(), { points: 0, claimed: [2], requests: [], done: [], next: 1, guild: { merit: 0 } });
    });

    it("reads requests kept when the money was coppers as gold", () => {
        const kept = {
            requests: [{ id: "request-1", kind: "tithe", from: { name: "Ida Crane", townName: "Home" }, target: { coppers: 30 }, reward: { standing: 15, coppers: 0 } }],
            done: [{ id: "request-2", kind: "wild", target: { wild: true, need: 2 }, reward: { standing: 22, coppers: 14 } }],
            next: 3,
        };
        const standing = new Standing(kept);

        assert.deepEqual(standing.requests[0].target, { gold: 30 });
        assert.deepEqual(standing.requests[0].reward, { standing: 15, gold: 0 });
        assert.deepEqual(standing.done[0].target, { wild: true, need: 2 });
        assert.deepEqual(standing.done[0].reward, { standing: 22, gold: 14 });
        assert.equal(progressOf(standing.requests[0]), "Bring 30 gold to Ida Crane in Home.");
        // (What was kept is left as it was)
        assert.deepEqual(kept.requests[0].target, { coppers: 30 });
    });
});
