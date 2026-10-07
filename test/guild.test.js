// The adventurers' guilds' boards (client/js/core/standing.js offerBoard, offerContract,
// offerCourier; core/host.js; core/dialogue.js; docs/WAR.md M8): up to BOARD_SIZE notices, none
// asking the same as another; everything a contract asks for within GUILD_REACH of the guild's
// town (the soldiers and beasts brought down, counted only there; the creatures whose parts are
// wanted; the camp; the places held); and the courier work among them, a package taken to the
// guild in the town of the player's people or their friends nearest a people they aren't friends
// with
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { candidatesAt, CREATURES, TIER_LAND, tierAt } from "../client/js/core/creatures.js";
import { Conversation, TREES } from "../client/js/core/dialogue.js";
import { HOST_PLAYER, Host } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { createRandom } from "../client/js/core/random.js";
import { PARTS, SPOILS } from "../client/js/core/spoils.js";
import { bandOf, holderOf, placesOf } from "../client/js/core/places.js";
import { BOARD_SIZE, briefOf, FAILED, GUILD_DEARER, GUILD_FAILED, GUILD_RANKS, GUILD_REACH, GUILD_SIZES, meritIn, MOST_REQUESTS, objectiveOf, offerBoard, offerContract, offerCourier, progressOf, REQUESTS, SOLDIERS_OUT, Standing, WANTED_PARTS } from "../client/js/core/standing.js";
import { War } from "../client/js/core/war/war.js";
import { landAt, planWorld, startFor } from "../client/js/core/worldplan/plan.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });
const giver = Object.freeze({ id: "guild/receptionist", name: "Mirabel Wren", title: "" });
const HALLED = ["town", "city", "capital"];

// The guild ranks that open a bounty and the camp outside (standing.js GUILD_RANKS)
const IRON = REQUESTS.hunt.rank;
const BRONZE = REQUESTS.camp.rank;

const apart = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function run(host, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...host.advance(STEP_MS));
    }

    return events;
}

const put = (actor, map, [x, y]) => Object.assign(actor, { map, square: [x, y], x: x + 0.5, y: y + 0.5, path: [], order: null, target: null });

// What a guild's board offers, asked many times (by someone whose people start at `home`, of a
// rank in the guilds)
const offers = (war, town, count = 200, seed = 3, home = undefined, guildRank = 0) => {
    const random = createRandom(seed);

    return Array.from({ length: count }, () => offerContract({ war, town: town.id, giver, home, guildRank, random })).filter(Boolean);
};

describe("the guilds' contracts, all within reach of their towns (standing.js offerContract)", () => {
    const plan = planWorld(3);

    it("puts a bounty only on a people at war whose soldiers are near: a town or a camp of theirs within reach", () => {
        const war = new War(plan);
        const town = war.towns.find(({ kind, owner }) => kind === "town" && owner === "human");
        // (A people at war, with no town near: one whose nearest town is well out of reach)
        const far = war.realms.find(({ id }) => id !== "human" && war.towns.filter(({ owner }) => owner === id).every((each) => apart(each.at, town.at) > GUILD_REACH + 500));

        assert.ok(far, "(a people far off)");
        war.relations[["human", far.id].sort().join("|")] = { state: "hostile", since: 0 };
        assert.ok(!offers(war, town, 200, 3, undefined, IRON).some(({ kind }) => kind === "hunt"), "none while they're far off");

        // A camp of theirs, but not near: still none; near: a bounty, saying where they are (to
        // an adventurer of the rank that opens bounties: none to a Copper)
        war.forces.push({ id: "force-900", realm: far.id, kind: "camp", size: 20, at: [town.at[0] + GUILD_REACH, town.at[1]], path: [], leg: 0, target: "elsewhere", home: war.realm(far.id).capital, since: 0 });
        assert.ok(!offers(war, town, 200, 3, undefined, IRON).some(({ kind }) => kind === "hunt"));
        war.force("force-900").at = [town.at[0] + GUILD_REACH - SOLDIERS_OUT.camp - 200, town.at[1]];
        assert.ok(!offers(war, town).some(({ kind }) => kind === "hunt"), "none for a Copper");

        const hunts = offers(war, town, 200, 3, undefined, IRON).filter(({ kind }) => kind === "hunt");

        assert.ok(hunts.length > 10, `${hunts.length} bounties`);

        for (const hunt of hunts) {
            assert.equal(hunt.target.realm, far.id);
            assert.deepEqual(hunt.target.near, { town: town.id, name: town.name, at: town.at, reach: GUILD_REACH });
            assert.match(hunt.text, new RegExp(`brought down within 1.5 km of ${town.name}\\. They have a camp 1\\.3 km east of ${town.name}\\.`));
            assert.match(progressOf(hunt), new RegExp(`^0 of ${hunt.target.need} brought down within 1.5 km of ${town.name}\\.$`));
        }
    });

    it("puts a bounty on a people at war with a town near, saying which", () => {
        const war = new War(plan);
        // (A town of the humans' with another people's town within reach)
        const pairs = war.towns.flatMap((town) => (town.owner === "human" ? war.towns.filter((other) => other.owner !== "human" && apart(other.at, town.at) + SOLDIERS_OUT.town <= GUILD_REACH).map((other) => ({ town, other })) : []));

        assert.ok(pairs.length, "(a border town)");

        const { town, other } = pairs[0];

        war.relations[["human", other.owner].sort().join("|")] = { state: "hostile", since: 0 };

        const hunts = offers(war, town, 200, 3, undefined, IRON).filter(({ kind }) => kind === "hunt" && kind);

        assert.ok(hunts.length > 5);
        assert.ok(hunts.every(({ target }) => target.realm === war.liege(other.owner)));
        assert.ok(hunts.some(({ text }) => text.includes(`They hold `)));
    });

    it("sees off the beasts near the town: counted only within reach of it", () => {
        const war = new War(plan);
        const town = war.towns.find(({ kind }) => kind === "city");
        const beasts = offers(war, town).filter(({ kind }) => kind === "beasts");

        assert.ok(beasts.length > 10);

        for (const { target, text } of beasts) {
            assert.equal(target.wild, true);
            assert.deepEqual(target.near, { town: town.id, name: town.name, at: town.at, reach: GUILD_REACH });
            assert.match(text, new RegExp(`within 1.5 km of ${town.name}`));
        }
    });

    it("wants only the parts of what's found within reach, as strong as it is there for whoever's asking: tiers from their home", () => {
        const war = new War(plan);
        const home = startFor(plan, "human").at;
        // (What could be met within reach of a town, by day or night, at the tiers the land has
        // that far from the home)
        const metNear = (town) => {
            const met = new Set();

            for (let y = -GUILD_REACH; y <= GUILD_REACH; y += 100) {
                for (let x = -GUILD_REACH; x <= GUILD_REACH; x += 100) {
                    if (x * x + y * y <= GUILD_REACH * GUILD_REACH) {
                        const at = [town.at[0] + x, town.at[1] + y];
                        const land = landAt(plan, ...at);

                        candidatesAt(land, tierAt(at, [home], land.biome), true).forEach(({ id }) => met.add(id));
                    }
                }
            }

            return met;
        };
        const source = (part) => Object.keys(SPOILS).filter((id) => SPOILS[id].items.some(({ id: item }) => item === part));
        const towns = war.towns.filter(({ kind }) => HALLED.includes(kind)).sort((a, b) => apart(a.at, home) - apart(b.at, home));
        const fierce = new Set(Object.keys(SPOILS).filter((id) => CREATURES[id].tiers[0] >= 3).flatMap((id) => SPOILS[id].items.map(({ id: item }) => item)));
        const mild = new Set(Object.keys(SPOILS).filter((id) => CREATURES[id].tiers[0] < 3).flatMap((id) => SPOILS[id].items.map(({ id: item }) => item)));
        const wanted = new Map();

        // (The nearest dozen to the home, and a dozen of the furthest)
        for (const town of [...towns.slice(0, 12), ...towns.slice(-12)]) {
            const met = metNear(town);
            const parts = offers(war, town, 60, 3, home).filter(({ kind }) => kind === "parts").map(({ target }) => target.part);

            for (const part of parts) {
                assert.ok(WANTED_PARTS.includes(part));
                assert.ok(source(part).some((id) => met.has(id)), `${town.name}: ${part}, from ${source(part).join(", ")}; met ${[...met].join(", ")}`);
            }

            wanted.set(town, parts);
        }

        // (Near home, the land's at its mildest: none of the fiercer creatures' parts wanted; far
        // from it, some of them are)
        const near = towns.filter((town) => apart(town.at, home) + GUILD_REACH < TIER_LAND.from + TIER_LAND.every * 2).flatMap((town) => wanted.get(town) ?? []);
        const far = towns.slice(-12).flatMap((town) => wanted.get(town));

        assert.ok(near.length > 5 && far.length > 20, `${near.length} near, ${far.length} far`);
        assert.ok(near.every((part) => mild.has(part) || !fierce.has(part)), near.filter((part) => fierce.has(part) && !mild.has(part)).join(", "));
        assert.ok(far.some((part) => fierce.has(part) && !mild.has(part)), far.join(", "));

        // (The ruins' dead never wander, so a guild never wants what only they leave)
        assert.ok([...wanted.values()].flat().every((part) => source(part).some((id) => CREATURES[id].biomes?.length !== 0)));

        // (And with no home given, as from the town itself)
        const town = towns.at(-1);
        const own = new Set(offers(war, town, 60).filter(({ kind }) => kind === "parts").map(({ target }) => target.part));

        assert.ok([...own].every((part) => mild.has(part) || !fierce.has(part)), [...own].join(", "));
    });

    it("breaks up only a camp near the town", () => {
        const war = new War(plan);
        const town = war.towns.find(({ kind, owner }) => kind === "town" && owner === "human");

        war.relations["human|orc"] = { state: "hostile", since: 0 };
        war.forces.push({ id: "force-900", realm: "orc", kind: "camp", size: 20, at: [town.at[0], town.at[1] + GUILD_REACH + 100], path: [], leg: 0, target: town.id, home: war.realm("orc").capital, since: 0 });
        assert.ok(!offers(war, town, 200, 3, undefined, BRONZE).some(({ kind }) => kind === "camp"));

        war.force("force-900").at = [town.at[0], town.at[1] + 400];
        assert.ok(!offers(war, town).some(({ kind }) => kind === "camp"), "none for a Copper");

        const camps = offers(war, town, 200, 3, undefined, BRONZE).filter(({ kind }) => kind === "camp");

        assert.ok(camps.length > 10);
        assert.ok(camps.every(({ target, text }) => target.force === "force-900" && text.includes(`0.4 km south of ${town.name}`)));
    });
});

describe("the guilds' courier work, on the way to strangers (standing.js offerCourier)", () => {
    const plan = planWorld(3);

    // Where a courier from a town should go, worked out the long way: for each town of a people
    // the player's aren't friends with, nearest first, the nearest of their friends' towns to it,
    // nearer it than the guild's town
    const expected = (war, realm, town) => {
        const halled = war.towns.filter(({ kind }) => HALLED.includes(kind));
        const strangers = halled.filter((each) => each !== town && !war.friendly(realm, each.owner)).sort((a, b) => apart(a.at, town.at) - apart(b.at, town.at));

        for (const towards of strangers) {
            const ours = halled.filter((each) => each !== town && war.friendly(realm, each.owner) && apart(each.at, towards.at) < apart(town.at, towards.at)).sort((a, b) => apart(a.at, towards.at) - apart(b.at, towards.at));

            if (ours.length) {
                return { to: ours[0], towards };
            }
        }

        return null;
    };

    it("takes a sealed package to the town of the player's people or their friends nearest the strangers, never to the strangers' own", () => {
        const war = new War(plan);
        let checked = 0;

        for (const realm of ["human", "orc", "elf"]) {
            for (const town of war.towns.filter(({ kind, owner }) => HALLED.includes(kind) && owner === realm)) {
                const courier = offerCourier({ war, realm, town: town.id, giver });
                const { to, towards } = expected(war, realm, town);
                const destination = war.town(courier.target.town);

                assert.equal(courier.kind, "courier");
                assert.equal(courier.target.town, to.id);
                assert.equal(courier.target.towards, towards.id);
                assert.equal(courier.target.post, "guild");
                assert.ok(war.friendly(realm, destination.owner), "to their own, or their friends");
                assert.ok(!war.friendly(realm, war.town(towards.id).owner), "on the way to strangers");
                assert.notEqual(destination.id, town.id);
                assert.ok(HALLED.includes(destination.kind));
                assert.ok(apart(destination.at, towards.at) < apart(town.at, towards.at), "nearer them than here");
                assert.equal(courier.from.post, "guild");
                assert.equal(courier.reward.standing, 0);

                const km = apart(destination.at, town.at) / 1000;

                assert.equal(courier.reward.gold, Math.round(REQUESTS.courier.reward.gold + REQUESTS.courier.reward.perKm.gold * km));
                assert.equal(courier.until, war.turn + Math.ceil(REQUESTS.courier.turns + km * REQUESTS.courier.perKm));
                assert.match(courier.text, new RegExp(`^The guild in ${destination.name} wants this package, sealed, .+ on the way to ${war.realm(towards.owner).name} at ${towards.name}\\.$`));
                assert.equal(progressOf(courier), `Take it to the guild in ${destination.name}.`);
                checked++;
            }
        }

        assert.ok(checked > 10, `${checked} towns`);
    });

    it("goes towards strangers the player's own people are at peace with, at war with, or haven't met; none while they carry one, or when every people's a friend", () => {
        const war = new War(plan);
        const town = war.towns.find(({ kind, owner }) => kind === "town" && owner === "human");
        const first = offerCourier({ war, realm: "human", town: town.id, giver });
        const people = war.town(first.target.towards).owner;

        // (At war with them: still them)
        war.relations[["human", people].sort().join("|")] = { state: "hostile", since: 0 };
        assert.equal(offerCourier({ war, realm: "human", town: town.id, giver }).target.towards, first.target.towards);

        // (Friends with them: the next strangers)
        war.relations[["human", people].sort().join("|")] = { state: "allied", since: 0 };

        const next = offerCourier({ war, realm: "human", town: town.id, giver });

        assert.notEqual(war.town(next.target.towards).owner, people);
        assert.ok(war.friendly("human", war.town(next.target.town).owner));

        assert.equal(offerCourier({ war, realm: "human", town: town.id, giver, held: [{ ...first, id: "request-1" }] }), null);
        assert.equal(offerCourier({ war, realm: "human", town: town.id, giver, held: Array.from({ length: MOST_REQUESTS }, () => ({ kind: "x" })) }), null);

        for (const realm of war.realms) {
            if (realm.id !== "human") {
                war.relations[["human", realm.id].sort().join("|")] = { state: "allied", since: 0 };
            }
        }

        assert.equal(offerCourier({ war, realm: "human", town: town.id, giver }), null);
    });
});

describe("the guilds' boards (standing.js offerBoard)", () => {
    it("puts up to four notices on a board, its courier work last, no two asking the same thing, nor what the player carries", () => {
        const war = new War(planWorld(3));
        const random = createRandom(7);
        let full = 0;

        war.relations["human|orc"] = { state: "hostile", since: 0 };

        for (const town of war.towns.filter(({ kind }) => HALLED.includes(kind))) {
            for (let k = 0; k < 5; k++) {
                const board = offerBoard({ war, realm: "human", town: town.id, giver, random });
                const objectives = board.map(objectiveOf);

                assert.ok(board.length <= BOARD_SIZE);
                assert.equal(new Set(objectives).size, objectives.length, objectives.join(" "));
                assert.ok(board.slice(0, -1).every(({ kind }) => kind !== "courier"));
                assert.ok(board.every((notice) => briefOf(notice).length > 5));
                full += board.length === BOARD_SIZE && board.at(-1).kind === "courier" ? 1 : 0;

                // (What's carried already: not on it)
                const held = [{ ...board[0], id: "request-1" }];

                assert.ok(!offerBoard({ war, realm: "human", town: town.id, giver, held, random }).some((notice) => objectiveOf(notice) === objectiveOf(board[0])));
            }
        }

        assert.ok(full > 50, `${full} full boards`);
        assert.equal(BOARD_SIZE, 4);
    });
});

describe("the guild's board at its counter (host.js, dialogue.js)", () => {
    // A world with its player before the home town's guild's receptionist
    const atTheCounter = () => {
        const host = new Host(buildWorld({ seed: 2 }), { populate: false });

        host.join({ id: HOST_PLAYER, hero: HERO });
        host.populate();

        const guild = [...host.world.interiors.buildings.values()].find(({ kind, place }) => kind === "guild" && place === "home");

        host.command(HOST_PLAYER, { type: "enter", link: guild.door.id });
        host.command(HOST_PLAYER, { type: "stop" });
        run(host, 1000);

        const receptionist = host.battle.actor(guild.folk.find(({ role }) => role === "receptionist").id);

        put(host.battle.actor(HOST_PLAYER), receptionist.map, [receptionist.square[0], receptionist.square[1] + 2]);
        assert.equal(host.command(HOST_PLAYER, { type: "talk", with: receptionist.id }).ok, true);
        assert.equal(host.command(HOST_PLAYER, { type: "effect", effect: { guild: "register" } }).ok, true);

        return { host, player: host.players.get(HOST_PLAYER), receptionist };
    };

    it("puts its notices up, the package among them, any taken and the rest kept; the package told of at the guild it's for, and paid", () => {
        const { host, player } = atTheCounter();
        const offered = host.command(HOST_PLAYER, { type: "effect", effect: { work: "ask" } });
        const { board } = offered;

        assert.equal(offered.ok, true, JSON.stringify(offered));
        assert.equal(board.length, BOARD_SIZE);
        assert.deepEqual(offered.request, board[0]);
        assert.ok(board.every(({ from }) => from.post === "guild"));
        assert.equal(board.at(-1).kind, "courier");
        assert.equal(new Set(board.map(objectiveOf)).size, BOARD_SIZE);

        // (Asked again: the same)
        assert.deepEqual(host.command(HOST_PLAYER, { type: "effect", effect: { work: "ask" } }), offered);

        // The package taken, by what it asks; then another, the rest still up
        const package_ = host.command(HOST_PLAYER, { type: "effect", effect: { work: "accept", which: objectiveOf(board.at(-1)) } }).request;

        assert.equal(package_.kind, "courier");
        assert.deepEqual(host.command(HOST_PLAYER, { type: "effect", effect: { work: "ask" } }).board, board.slice(0, -1));
        assert.equal(host.command(HOST_PLAYER, { type: "effect", effect: { work: "accept", which: "beasts:nowhere" } }).reason, "work");

        const contract = host.command(HOST_PLAYER, { type: "effect", effect: { work: "accept", which: objectiveOf(board[1]) } }).request;

        assert.equal(objectiveOf(contract), objectiveOf(board[1]));
        assert.deepEqual(host.command(HOST_PLAYER, { type: "effect", effect: { work: "ask" } }).board, [board[0], board[2]]);
        assert.deepEqual(player.standing.requests.map(objectiveOf), [objectiveOf(package_), objectiveOf(contract)]);

        // Not told of here, but at the guild it's for
        assert.equal(host.command(HOST_PLAYER, { type: "effect", effect: { report: true } }).reason, "due");

        const place = host.world.plan.places.find(({ id }) => id === package_.target.town);

        host.world.maps.town.settlements.of(place);

        const there = [...host.world.interiors.buildings.values()].find(({ kind, place: at }) => kind === "guild" && at === place.id);
        const actor = host.battle.actor(HOST_PLAYER);

        host.command(HOST_PLAYER, { type: "talk", with: null });
        put(actor, "town", host.world.spawns.player);
        host.command(HOST_PLAYER, { type: "enter", link: there.door.id });
        host.command(HOST_PLAYER, { type: "stop" });

        const clerk = host.battle.actor(there.folk.find(({ role }) => role === "receptionist").id);

        put(actor, clerk.map, [clerk.square[0], clerk.square[1] + 2]);
        assert.equal(host.command(HOST_PLAYER, { type: "talk", with: clerk.id }).ok, true);
        assert.deepEqual(host.dueTo(HOST_PLAYER, clerk.id).map(({ kind }) => kind), ["courier"]);

        const gold = player.progress.gold;
        const told = host.command(HOST_PLAYER, { type: "effect", effect: { report: true } });

        assert.equal(told.ok, true, JSON.stringify(told));
        assert.equal(player.progress.gold, gold + package_.reward.gold);
        assert.deepEqual(player.standing.requests.map(objectiveOf), [objectiveOf(contract)]);
    });

    it("counts the beasts and soldiers brought down for a guild's contract only within reach of its town", () => {
        const { host, player } = atTheCounter();
        const actor = host.battle.actor(HOST_PLAYER);
        const home = host.war.town(host.world.start.id);
        const far = host.war.towns.find((town) => apart(town.at, home.at) > GUILD_REACH * 2);
        const enemy = host.war.realms.find(({ id }) => id !== "human").id;
        const contract = (kind, town, target) => ({ kind, title: kind, from: { id: "guild/receptionist", name: "Mira", title: "", town: town.id, townName: town.name, post: "guild" }, given: 0, state: "open", count: 0, until: 999, reward: { standing: 0, gold: 10 }, text: "", key: `${kind}-${town.id}`, target: { ...target, near: { town: town.id, name: town.name, at: [...town.at], reach: GUILD_REACH } } });

        host.war.relations[["human", enemy].sort().join("|")] = { state: "hostile", since: 0 };
        host.command(HOST_PLAYER, { type: "talk", with: null });
        player.standing.take(contract("beasts", home, { wild: true, need: 1 }));
        player.standing.take(contract("beasts", far, { wild: true, need: 1 }));
        player.standing.take(contract("hunt", far, { realm: enemy, need: 1 }));

        // Out at home: the wild's orc and a soldier of theirs beside the player, each nearly dead
        put(actor, "town", host.world.spawns.player);
        Object.assign(actor, { hp: 5000, maxHp: 5000 });
        host.battle.add({ id: "beast", kind: "orc", name: "Orc", weapon: "cleaver", team: "orcs", square: [actor.square[0] + 1, actor.square[1]] });
        host.battle.add({ id: "foe", kind: "soldier", name: "Foe", weapon: "sword", team: enemy, square: [actor.square[0], actor.square[1] + 1] });

        const events = [];

        for (const id of ["beast", "foe"]) {
            host.battle.actor(id).hp = 1;

            if (!host.battle.actor(id).dead) {
                host.command(HOST_PLAYER, { type: "engage", target: id });
                events.push(...run(host, 20000));
            }
        }

        for (const id of ["beast", "foe"]) {
            assert.ok(events.some(({ type, id: fallen, by }) => type === "death" && fallen === id && by === HOST_PLAYER), id);
        }

        assert.deepEqual(
            player.standing.requests.map(({ kind, key, state, count }) => [kind, key, state, count]),
            [
                ["beasts", `beasts-${home.id}`, "done", 1],
                ["beasts", `beasts-${far.id}`, "open", 0],
                ["hunt", `hunt-${far.id}`, "open", 0],
            ],
        );
    });

    it("reads out the notices on the board, each in full, and takes the one chosen", () => {
        const tree = TREES.receptionist;
        const talk = (count) => {
            const holds = Object.fromEntries([1, 2, 3, 4].map((k) => [`offer${k}`, k <= count]));
            const names = Object.fromEntries([1, 2, 3, 4].flatMap((k) => [[`brief${k}`, `Notice ${k}`], [`offer${k}`, `Wanted: number ${k}.`], [`reward${k}`, `${k * 10} gold`]]));
            const conversation = new Conversation(tree, {
                speaker: { id: "receptionist", name: "Mirabel Wren", title: "" },
                names,
                memory: { talks: 1, flags: ["registered"] },
                check: (condition) => {
                    const [[key, value]] = Object.entries(condition);

                    return key in holds ? holds[key] === value : true;
                },
            });

            conversation.choose(conversation.choices.findIndex(({ text }) => text === "Anything on the board for me?"));

            return conversation;
        };

        assert.equal(Object.keys(tree.nodes).filter((id) => id.startsWith("notice")).length, BOARD_SIZE);

        const full = talk(4);

        assert.deepEqual(full.choices.map(({ text }) => text), ["Notice 1, for 10 gold.", "Notice 2, for 20 gold.", "Notice 3, for 30 gold.", "Notice 4, for 40 gold.", "None of them, thanks."]);

        // (One read: taken, or back to the rest)
        full.choose(2);
        assert.match(full.line, /^Wanted: number 3\. (It pays 30 gold\.|30 gold, when it's done\. Don't die!)$/);
        assert.deepEqual(full.choices.map(({ text, effects }) => [text, effects]), [
            ["I'll take it.", [{ work: "accept", which: 3 }]],
            ["Let me look at the others.", []],
        ]);
        full.choose(1);
        assert.equal(full.choices.length, 5);

        assert.deepEqual(talk(2).choices.map(({ text }) => text), ["Notice 1, for 10 gold.", "Notice 2, for 20 gold.", "None of them, thanks."]);
        assert.deepEqual(talk(0).choices.map(({ text }) => text), ["I'll come back."]);
    });
});

describe("the guilds' ranks: one card, good at every branch (standing.js GUILD_RANKS, Standing)", () => {
    it("climbs from Copper to Mithril by merit, each rank asking more than the last; earned only by the guilds' work, and a rank earned kept", () => {
        // (The ladder: as the receptionist tells it, each further than the last, each paying more,
        // asking more and of stronger beasts, never less)
        assert.deepEqual(GUILD_RANKS.map(({ title }) => title), ["Copper", "Iron", "Bronze", "Silver", "Gold", "Mithril"]);
        assert.equal(GUILD_RANKS[0].merit, 0);

        for (let rank = 1; rank < GUILD_RANKS.length; rank++) {
            const [last, next] = [GUILD_RANKS[rank - 1], GUILD_RANKS[rank]];

            assert.ok(next.merit - last.merit > (GUILD_RANKS[rank - 2] ? last.merit - GUILD_RANKS[rank - 2].merit : 0), `${next.title}: further than the last`);
            assert.ok(next.pay > last.pay && next.more >= last.more && next.level >= last.level, next.title);
            assert.ok(next.more > last.more || next.level > last.level || Object.values(REQUESTS).some(({ rank: opens }) => opens === rank) || Object.values(GUILD_SIZES).includes(rank), `${next.title}: harder work than ${last.title}'s`);
        }

        // (Every contract of the guilds' earns merit, and none of a people's)
        for (const kind of ["beasts", "hunt", "camp", "parts", "courier", "clear"]) {
            const merit = REQUESTS[kind].reward.merit;

            assert.ok(Number.isFinite(merit) ? merit > 0 : Object.values(merit).every((each) => each > 0), kind);
            assert.equal(REQUESTS[kind].reward.standing, 0, kind);
        }

        assert.equal(meritIn({ kind: "wild", from: { post: "hall" }, reward: { standing: 6, gold: 6 } }), 0);
        assert.equal(meritIn({ kind: "beasts", from: { post: "guild" }, reward: { gold: 9 } }), REQUESTS.beasts.reward.merit, "one given before merit was kept: its kind's");

        const standing = new Standing();

        // Not registered: no card, no rank, no merit to earn
        assert.equal(standing.guildRank(), null);
        assert.equal(standing.guildTitle(), null);
        assert.equal(standing.guildNext(), null);
        assert.deepEqual(standing.earn(50), []);
        assert.equal(standing.guild, null);

        // Registered: Copper, once
        assert.equal(standing.register(), true);
        assert.equal(standing.register(), false);
        assert.equal(standing.guildTitle(), "Copper");
        assert.deepEqual(standing.guildNext(), { merit: 0, from: 0, to: GUILD_RANKS[1].merit });

        // Merit: each rank reached told, two at once if it's so much
        assert.deepEqual(standing.earn(GUILD_RANKS[1].merit - 1), []);
        assert.deepEqual(standing.earn(1), [{ rank: 1, title: "Iron" }]);
        assert.deepEqual(standing.earn(GUILD_RANKS[3].merit - GUILD_RANKS[1].merit), [
            { rank: 2, title: "Bronze" },
            { rank: 3, title: "Silver" },
        ]);

        // A contract failed costs merit, but never the rank earned; and never their people's standing
        standing.earn(GUILD_FAILED + 1);
        standing.earn(-GUILD_FAILED);
        assert.equal(standing.guild.merit, GUILD_RANKS[3].merit + 1);
        standing.earn(-GUILD_FAILED);
        assert.equal(standing.guild.merit, GUILD_RANKS[3].merit);
        assert.equal(standing.guildTitle(), "Silver");
        assert.equal(standing.points, 0);

        // To the top, and kept as it is
        standing.earn(10000);
        assert.equal(standing.guildTitle(), "Mithril");
        assert.equal(standing.guildNext().to, null);
        assert.deepEqual(new Standing(JSON.parse(JSON.stringify(standing))).toJSON(), standing.toJSON());
        assert.deepEqual(new Standing({}).toJSON().guild, null);
    });

    it("gives harder work the higher the rank: more to bring down or in, stronger beasts, bigger places, bounties from Iron and camps from Bronze, and better pay", () => {
        const plan = planWorld(3);
        const war = new War(plan);
        const home = startFor(plan, "human").at;
        const towns = war.towns.filter(({ kind }) => HALLED.includes(kind)).sort((a, b) => apart(a.at, home) - apart(b.at, home));
        const levels = [];

        war.relations["human|orc"] = { state: "hostile", since: 0 };

        // (Near home, and far out; a town with a camp outside it, of a people at war with its own)
        for (const town of [towns[0], towns[Math.floor(towns.length / 2)], towns.at(-1)]) {
            const foe = town.owner === "orc" ? "human" : "orc";

            war.relations[[town.owner, foe].sort().join("|")] = { state: "hostile", since: 0 };
            war.forces.push({ id: `force-${town.id}`, realm: foe, kind: "camp", size: 20, at: [town.at[0] + 300, town.at[1]], path: [], leg: 0, target: town.id, home: war.realm(foe).capital, since: 0 });

            // (The places near held by outlaws or the dead)
            const held = placesOf(plan).filter((place) => apart(place.at, town.at) <= GUILD_REACH && bandOf(place, holderOf(plan, place, war.places?.[place.id], war.turn)));

            for (let rank = 0; rank < GUILD_RANKS.length; rank++) {
                const { more, level, pay } = GUILD_RANKS[rank];
                const offered = offers(war, town, 120, 5, home, rank);
                const kinds = new Set(offered.map(({ kind }) => kind));

                assert.ok(offered.length > 50, `${town.name}, ${GUILD_RANKS[rank].title}: ${offered.length}`);

                // (Only the work the rank opens; the camp outside from Bronze)
                assert.ok(offered.every(({ kind }) => REQUESTS[kind].rank <= rank), [...kinds].join(", "));
                assert.equal(kinds.has("camp"), rank >= REQUESTS.camp.rank, `${GUILD_RANKS[rank].title}: the camp`);

                for (const contract of offered) {
                    const { kind, target, reward } = contract;

                    assert.equal(reward.standing, 0);
                    assert.equal(reward.merit, kind === "clear" ? REQUESTS.clear.reward.merit[held.find(({ id }) => id === target.place).size] : REQUESTS[kind].reward.merit, kind);

                    // (More of them, the higher the rank)
                    if (kind === "beasts" || kind === "hunt") {
                        assert.ok(target.need >= 2 + more && target.need <= 4 + more, `${kind}: ${target.need}`);
                    }

                    if (kind === "parts") {
                        const least = PARTS[target.part].worth <= 4 ? 3 : 2;

                        assert.ok(target.need >= least + more && target.need <= least + more + 2, `${kind}: ${target.need}`);
                    }

                    // (Beasts of the rank's level, as near as the land has them)
                    if (kind === "beasts") {
                        assert.ok(target.level >= 1 && target.level <= level, `level ${target.level}`);
                        assert.equal(target.level > 1, contract.text.includes(`level ${target.level} or more`));
                        levels[rank] = Math.max(levels[rank] ?? 0, target.level);
                    }

                    // (The biggest place near that the rank gives)
                    if (kind === "clear") {
                        const most = Math.max(...held.filter((place) => GUILD_SIZES[place.size] <= rank).map((place) => GUILD_SIZES[place.size]));
                        const size = held.find(({ id }) => id === target.place).size;

                        assert.equal(GUILD_SIZES[size], most, `${GUILD_RANKS[rank].title}: ${size}`);
                    }

                    // (Paid as the rank has it: the camp's, a fixed sum)
                    if (kind === "camp") {
                        assert.equal(reward.gold, Math.round(REQUESTS.camp.reward.gold * pay));
                    }
                }

                // (From GUILD_DEARER, the dearer half of the parts wanted: never the cheapest)
                const parts = new Set(offered.filter(({ kind }) => kind === "parts").map(({ target }) => target.part));
                const all = new Set(offers(war, town, 120, 5, home, 0).filter(({ kind }) => kind === "parts").map(({ target }) => target.part));

                if (rank >= GUILD_DEARER && all.size > 1) {
                    const cheapest = Math.min(...[...all].map((part) => PARTS[part].worth));

                    assert.ok([...parts].every((part) => PARTS[part].worth > cheapest || [...all].every((each) => PARTS[each].worth === cheapest)), [...parts].join(", "));
                }
            }
        }

        // (Stronger beasts asked for far out, by the higher ranks)
        assert.ok(levels.every((each, rank) => rank === 0 || each >= levels[rank - 1]), levels.join(", "));
        assert.ok(levels.at(-1) >= 4, levels.join(", "));
    });
});

describe("the guilds' ranks at their counters (host.js)", () => {
    // A world with its player before a town's guild's receptionist (the home town's, or the
    // town's whose place is given), talking
    const counter = (host, place = "home") => {
        const guild = [...host.world.interiors.buildings.values()].find(({ kind, place: at }) => kind === "guild" && at === place);
        const actor = host.battle.actor(HOST_PLAYER);

        host.command(HOST_PLAYER, { type: "talk", with: null });
        put(actor, "town", host.world.spawns.player);
        host.command(HOST_PLAYER, { type: "enter", link: guild.door.id });
        host.command(HOST_PLAYER, { type: "stop" });

        // (At home, a while for its folk to settle; another town's, straight to its counter)
        if (place === "home") {
            run(host, 1000);
        }

        const receptionist = host.battle.actor(guild.folk.find(({ role }) => role === "receptionist").id);

        put(actor, receptionist.map, [receptionist.square[0], receptionist.square[1] + 2]);
        assert.equal(host.command(HOST_PLAYER, { type: "talk", with: receptionist.id }).ok, true);

        return receptionist;
    };
    const world = (character = {}) => {
        const host = new Host(buildWorld({ seed: 2 }), { populate: false });

        host.join({ id: HOST_PLAYER, hero: HERO, ...character });
        host.populate();

        return { host, player: host.players.get(HOST_PLAYER) };
    };

    it("signs a player up once, and knows their card at every branch: work off any guild's board, of their rank there", () => {
        const { host, player } = world();
        const ask = () => host.command(HOST_PLAYER, { type: "effect", effect: { work: "ask" } });

        counter(host);
        assert.equal(ask().reason, "unregistered");

        const events = [];
        const signed = host.command(HOST_PLAYER, { type: "effect", effect: { guild: "register" } });

        events.push(...run(host, STEP_MS));
        assert.equal(signed.ok, true);
        assert.equal(player.standing.guildTitle(), "Copper");
        assert.deepEqual(events.filter(({ type }) => type === "guild").map(({ change, title }) => [change, title]), [["registered", "Copper"]]);
        assert.equal(ask().ok, true);

        // At another town's guild: the same card, never another
        const other = host.world.plan.places.find((place) => place.id !== host.world.start.id && HALLED.includes(place.kind));

        host.world.maps.town.settlements.of(other);
        player.standing.earn(GUILD_RANKS[2].merit);
        counter(host, other.id);

        const board = ask();

        assert.equal(board.ok, true, JSON.stringify(board));
        assert.ok(board.board.filter(({ kind }) => kind !== "courier").every(({ target }) => !target.need || target.need >= 2 + GUILD_RANKS[2].more), "a Bronze's work");
        assert.equal(host.command(HOST_PLAYER, { type: "effect", effect: { guild: "register" } }).ok, true);
        assert.equal(player.standing.guild.merit, GUILD_RANKS[2].merit, "signed up again: the same card");
        assert.ok(!run(host, STEP_MS).some(({ type }) => type === "guild"));

        // (Signing up only at a guild)
        assert.deepEqual(new Standing(player.standing.toJSON()).toJSON(), player.standing.toJSON());
    });

    it("earns the guilds' merit for their work, never standing; failed or given up, merit lost and never standing; a people's still costs standing", () => {
        const { host, player } = world();
        const home = host.war.town(host.world.start.id);
        const guild = (kind, extra = {}) => ({ kind, title: kind, from: { id: "guild/receptionist", name: "Mira", title: "", town: home.id, townName: home.name, post: "guild" }, given: 0, state: "open", count: 0, until: 999, text: "", key: `${kind}-${home.id}-${extra.key ?? 0}`, target: { wild: true, need: 1, near: { town: home.id, name: home.name, at: [...home.at], reach: GUILD_REACH } }, reward: { standing: 0, gold: 10, merit: GUILD_RANKS[1].merit }, ...extra });

        counter(host);
        host.command(HOST_PLAYER, { type: "effect", effect: { guild: "register" } });
        run(host, STEP_MS);

        // Done and told of: the merit, and a rank with it; their standing as it was
        const done = player.standing.take(guild("beasts"));

        done.state = "done";

        const told = host.command(HOST_PLAYER, { type: "effect", effect: { report: true } });
        const events = run(host, STEP_MS);

        assert.equal(told.ok, true, JSON.stringify(told));
        assert.equal(player.standing.guild.merit, GUILD_RANKS[1].merit);
        assert.equal(player.standing.points, 0);
        assert.deepEqual(events.filter(({ type }) => type === "guild").map(({ change, title }) => [change, title]), [["rank", "Iron"]]);
        assert.ok(!events.some(({ type }) => type === "standing"));

        // Given up, and let run out: merit lost, but not the rank; never standing
        player.standing.points = 50;
        player.standing.earn(GUILD_FAILED * 2);

        const given = player.standing.take(guild("beasts", { key: 1 }));

        assert.equal(host.command(HOST_PLAYER, { type: "abandon", request: given.id }).ok, true);
        assert.equal(player.standing.guild.merit, GUILD_RANKS[1].merit + GUILD_FAILED);
        player.standing.take(guild("beasts", { key: 2, until: host.war.turn - 1 }));
        run(host, 2000);
        assert.equal(player.standing.guild.merit, GUILD_RANKS[1].merit);
        assert.equal(player.standing.guildTitle(), "Iron");
        player.standing.take(guild("beasts", { key: 3 }));
        assert.equal(host.command(HOST_PLAYER, { type: "abandon", request: player.standing.requests[0].id }).ok, true);
        assert.equal(player.standing.guild.merit, GUILD_RANKS[1].merit, "never below Iron");
        assert.equal(player.standing.points, 50);

        // (A reeve's given up: standing lost, and no merit)
        const reeve = player.standing.take({ ...guild("wild", { key: 4 }), from: { id: "hall/reeve", name: "Ida", title: "Reeve", town: home.id, townName: home.name, post: "hall" } });

        assert.equal(host.command(HOST_PLAYER, { type: "abandon", request: reeve.id }).ok, true);
        assert.equal(player.standing.points, 50 - FAILED);
        assert.equal(player.standing.guild.merit, GUILD_RANKS[1].merit);
    });

    it("counts only beasts of the level a contract asks for", () => {
        const { host, player } = world();
        const home = host.war.town(host.world.start.id);
        const actor = host.battle.actor(HOST_PLAYER);
        const near = { town: home.id, name: home.name, at: [...home.at], reach: GUILD_REACH };

        player.standing.register();
        player.standing.take({ kind: "beasts", title: "Beasts", from: { id: "guild/receptionist", name: "Mira", title: "", town: home.id, townName: home.name, post: "guild" }, given: 0, state: "open", count: 0, until: 999, text: "", key: home.id, target: { wild: true, need: 2, level: 3, near }, reward: { standing: 0, gold: 10, merit: 3 } });
        put(actor, "town", host.world.spawns.player);
        Object.assign(actor, { hp: 5000, maxHp: 5000 });

        // (One too weak to count, then one strong enough)
        for (const [id, tier] of [
            ["weak", 2],
            ["strong", 3],
        ]) {
            host.battle.add({ id, kind: "orc", name: "Orc", weapon: "cleaver", team: "orcs", square: [actor.square[0] + 1, actor.square[1]], wild: { creature: "orc", tier } });
            host.battle.actor(id).hp = 1;
            host.command(HOST_PLAYER, { type: "engage", target: id });
            run(host, 20000);
            assert.ok(host.battle.actor(id)?.dead ?? true, id);
        }

        assert.equal(player.standing.requests[0].count, 1);
    });

    it("gives a player who'd registered before the guilds kept a card theirs, with the merit of the guild work they'd done", () => {
        const done = [
            { id: "request-1", kind: "beasts", title: "Beasts", from: { post: "guild", town: "x", townName: "X" }, state: "done", target: { wild: true, need: 2 }, reward: { standing: 0, gold: 20 } },
            { id: "request-2", kind: "clear", title: "Clear", from: { post: "guild", town: "x", townName: "X" }, state: "done", target: { place: "p" }, reward: { standing: 0, gold: 40 } },
            { id: "request-3", kind: "hunt", title: "Hunt", from: { post: "guild", town: "x", townName: "X" }, state: "failed", target: { realm: "orc", need: 2 }, reward: { standing: 0, gold: 20 } },
            { id: "request-4", kind: "wild", title: "Roads", from: { post: "hall", town: "x", townName: "X" }, state: "done", target: { wild: true, need: 2 }, reward: { standing: 20, gold: 20 } },
        ];
        const { player } = world({ talks: { memory: {}, knowledge: ["guildMember"] }, standing: { points: 30, done } });

        assert.equal(player.standing.guild.merit, REQUESTS.beasts.reward.merit + REQUESTS.clear.reward.merit.small);
        assert.equal(world({ standing: { points: 30, done } }).player.standing.guild, null, "never registered");
        assert.equal(world({ talks: { knowledge: ["guildMember"] }, standing: { guild: { merit: 7 } } }).player.standing.guild.merit, 7, "a card kept: as it is");
    });

    it("talks of the player's card: registering only without one, the board and their rank with it", () => {
        const tree = TREES.receptionist;
        const talk = (member, met = true) => {
            const conversation = new Conversation(tree, {
                speaker: { id: "receptionist", name: "Mirabel Wren", title: "" },
                player: { name: "Ada" },
                names: { guildRank: "Bronze", guildNext: "40 more merit and you're Silver.", town: "Redemoor" },
                memory: { talks: met ? 1 : 0, flags: [] },
                check: (condition) => ("member" in condition ? condition.member === member : true),
            });

            return conversation;
        };
        const said = (conversation) => conversation.choices.map(({ text }) => text);

        // (A card from another branch, the first time here: known)
        assert.match(talk(true, false).line, /Bronze rank/);
        assert.ok(!said(talk(true)).some((text) => text.includes("register")));
        assert.ok(said(talk(true)).includes("Anything on the board for me?"));
        assert.ok(said(talk(false)).includes("I'd like to register as an adventurer."));
        assert.ok(!said(talk(false)).includes("Anything on the board for me?"));
        assert.ok(!said(talk(false)).includes("How's my card looking?"));

        const asked = talk(true);

        asked.choose(said(asked).indexOf("How's my card looking?"));
        assert.match(asked.line, /Bronze( rank)?! 40 more merit and you're Silver\.$/);

        // (Signing up: the host told, besides what she and the player remember)
        const signing = talk(false);

        signing.choose(said(signing).indexOf("I'd like to register as an adventurer."));
        assert.deepEqual(signing.choices[0].effects, [{ remember: "registered" }, { learn: "guildMember" }, { guild: "register" }]);
    });
});
