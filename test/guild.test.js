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
import { candidatesAt, CREATURES, tierAt } from "../client/js/core/creatures.js";
import { Conversation, TREES } from "../client/js/core/dialogue.js";
import { HOST_PLAYER, Host } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { createRandom } from "../client/js/core/random.js";
import { SPOILS } from "../client/js/core/spoils.js";
import { BOARD_SIZE, briefOf, GUILD_REACH, MOST_REQUESTS, objectiveOf, offerBoard, offerContract, offerCourier, progressOf, REQUESTS, SOLDIERS_OUT, WANTED_PARTS } from "../client/js/core/standing.js";
import { War } from "../client/js/core/war/war.js";
import { landAt, planWorld } from "../client/js/core/worldplan/plan.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });
const giver = Object.freeze({ id: "guild/receptionist", name: "Mirabel Wren", title: "" });
const HALLED = ["town", "city", "capital"];

const apart = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function run(host, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...host.advance(STEP_MS));
    }

    return events;
}

const put = (actor, map, [x, y]) => Object.assign(actor, { map, square: [x, y], x: x + 0.5, y: y + 0.5, path: [], order: null, target: null });

// What a guild's board offers, asked many times
const offers = (war, town, count = 200, seed = 3) => {
    const random = createRandom(seed);

    return Array.from({ length: count }, () => offerContract({ war, town: town.id, giver, random })).filter(Boolean);
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
        assert.ok(!offers(war, town).some(({ kind }) => kind === "hunt"), "none while they're far off");

        // A camp of theirs, but not near: still none; near: a bounty, saying where they are
        war.forces.push({ id: "force-900", realm: far.id, kind: "camp", size: 20, at: [town.at[0] + GUILD_REACH, town.at[1]], path: [], leg: 0, target: "elsewhere", home: war.realm(far.id).capital, since: 0 });
        assert.ok(!offers(war, town).some(({ kind }) => kind === "hunt"));
        war.force("force-900").at = [town.at[0] + GUILD_REACH - SOLDIERS_OUT.camp - 200, town.at[1]];

        const hunts = offers(war, town).filter(({ kind }) => kind === "hunt");

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

        const hunts = offers(war, town).filter(({ kind }) => kind === "hunt" && kind);

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

    it("wants only the parts of the creatures that live within reach, at the tiers they're found at there", () => {
        const war = new War(plan);

        for (const town of war.towns.filter(({ kind }) => HALLED.includes(kind)).slice(0, 12)) {
            // (What could be met within reach, by day or night, as dangerous as the land is that far from the town)
            const met = new Set();

            for (let y = -GUILD_REACH; y <= GUILD_REACH; y += 100) {
                for (let x = -GUILD_REACH; x <= GUILD_REACH; x += 100) {
                    if (x * x + y * y <= GUILD_REACH * GUILD_REACH) {
                        const at = [town.at[0] + x, town.at[1] + y];
                        const land = landAt(plan, ...at);
                        const tier = tierAt(at, [town.at], land.biome);

                        for (const dark of [false, true]) {
                            candidatesAt(land, tier, dark).forEach(({ id }) => met.add(id));
                        }
                    }
                }
            }

            const from = (part) => Object.keys(SPOILS).filter((id) => met.has(id) && SPOILS[id].items.some(({ id: item }) => item === part));

            for (const { target } of offers(war, town, 60).filter(({ kind }) => kind === "parts")) {
                assert.ok(WANTED_PARTS.includes(target.part));
                assert.ok(from(target.part).length, `${town.name}: ${target.part}, from ${Object.keys(SPOILS).filter((id) => SPOILS[id].items.some(({ id: item }) => item === target.part)).join(", ")}; met ${[...met].join(", ")}`);
            }
        }

        // (Near a town, the land's at its mildest: none of the fiercer creatures' parts wanted)
        const fierce = new Set(Object.keys(SPOILS).filter((id) => CREATURES[id].tiers[0] >= 3).flatMap((id) => SPOILS[id].items.map(({ id: item }) => item)));
        const mild = new Set(Object.keys(SPOILS).filter((id) => CREATURES[id].tiers[0] < 3).flatMap((id) => SPOILS[id].items.map(({ id: item }) => item)));
        const wanted = war.towns.flatMap((town) => offers(war, town, 20).filter(({ kind }) => kind === "parts").map(({ target }) => target.part));

        assert.ok(wanted.length > 20);
        assert.ok(wanted.every((part) => mild.has(part) || !fierce.has(part)), wanted.filter((part) => fierce.has(part) && !mild.has(part)).join(", "));
    });

    it("breaks up only a camp near the town", () => {
        const war = new War(plan);
        const town = war.towns.find(({ kind, owner }) => kind === "town" && owner === "human");

        war.relations["human|orc"] = { state: "hostile", since: 0 };
        war.forces.push({ id: "force-900", realm: "orc", kind: "camp", size: 20, at: [town.at[0], town.at[1] + GUILD_REACH + 100], path: [], leg: 0, target: town.id, home: war.realm("orc").capital, since: 0 });
        assert.ok(!offers(war, town).some(({ kind }) => kind === "camp"));

        war.force("force-900").at = [town.at[0], town.at[1] + 400];

        const camps = offers(war, town).filter(({ kind }) => kind === "camp");

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
