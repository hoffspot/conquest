// Places worth finding (client/js/core/places.js; the terrain plan's M7.5): every site and wild camp
// a place on the maps, who holds each (mixed by the war, a world at a time), cleared and retaken;
// in play (core/host.js #places), the outlaws or the dead holding theirs, their leader by a locked
// chest, put to the sword for what's in it; the guilds' contracts to clear them (core/standing.js)
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { ICON_KINDS, PLACE_RIMS } from "../client/js/app/mapicons.js";
import { STEP_MS } from "../client/js/core/battle.js";
import { tierAt } from "../client/js/core/creatures.js";
import { squaresOf } from "../client/js/core/grid.js";
import { HOST_PLAYER, Host } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { heldAtStart, HOLDERS, holderOf, PLACE_BANDS, PLACE_KINDS, PLACE_TIMES, placeOf, placesOf } from "../client/js/core/places.js";
import { createRandom } from "../client/js/core/random.js";
import { CLEAR_REACH, offerContract, progressOf, REQUESTS } from "../client/js/core/standing.js";
import { War } from "../client/js/core/war/war.js";
import { decode, encode } from "../client/js/core/wire.js";
import { landAt, planWorld } from "../client/js/core/worldplan/plan.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

function run(host, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...host.advance(STEP_MS));
    }

    return events;
}

const put = (actor, [x, y]) => Object.assign(actor, { square: [x, y], x: x + 0.5, y: y + 0.5, path: [], order: null, target: null, spawn: [x, y] });

// A world (seed 2) with its player in it, hard to kill, the orc gone
function hosted() {
    const world = buildWorld({ seed: 2 });
    const host = new Host(world, { populate: false });

    host.join({ id: HOST_PLAYER, hero: HERO });
    host.populate();
    Object.assign(host.battle.actor("orc"), { dead: true, respawnAt: Infinity });

    const me = host.battle.actor(HOST_PLAYER);

    Object.assign(me, { hp: 1e6, maxHp: 1e6 });

    return { host, world, me };
}

// The player a few steps from a place's heart (as the host has it)
function near(context, place, off = 12) {
    const { host, me } = context;
    const at = host.world.maps.town.sites.heartOf(host.world.plan.sites.find((site) => site.id === place.id));

    put(me, [Math.floor(at[0] + off), Math.floor(at[1])]);
    run(host, 600);

    return at;
}

// Every one of a place's band put to the sword (poisoned past bearing, by the player)
function putToTheSword(host, held) {
    for (const id of held.ids) {
        host.battle.afflict(id, "poison", { by: HOST_PLAYER, damage: 1e7 });
    }

    return run(host, 3000);
}

describe("places worth finding (places.js)", () => {
    let plans;

    before(() => {
        plans = [1, 2, 3].map((seed) => planWorld(seed));
    });

    it("are every site and wild camp in a world, each with its icon on the maps and who may hold it", () => {
        for (const plan of plans) {
            const places = placesOf(plan);

            assert.equal(places.length, plan.sites.length + plan.camps.length, "every site and camp a place");
            assert.equal(placesOf(plan), places, "worked out once");

            for (const place of places) {
                assert.ok(PLACE_KINDS[place.kind], place.kind);
                assert.ok(ICON_KINDS.includes(place.icon), `${place.kind}'s icon ${place.icon}`);
                assert.ok(["small", "medium", "large"].includes(place.size));
                assert.ok(place.holds.every((holder) => HOLDERS.includes(holder)));
            }
        }

        // (A kind not a place's: none)
        assert.equal(placeOf({ id: "x", kind: "nothing", at: [0, 0] }), null);
        assert.ok(Object.values(PLACE_RIMS).length === HOLDERS.length + 1);
    });

    it("are held at the start as the war has it: castles by their people, the ruins by the dead, caves and wild towers by outlaws, the lair by the dragon, holy stones by no one", () => {
        for (const plan of plans) {
            for (const place of placesOf(plan)) {
                const held = heldAtStart(plan, place);

                assert.equal(heldAtStart(plan, place), held, "the same every time");

                if (place.kind === "castle") {
                    assert.equal(held, "friendly");
                } else if (place.kind === "ruins" || place.kind === "ruined castle") {
                    assert.equal(held, "dead");
                } else if (place.kind === "cave" || (place.kind === "watchtower" && !place.race)) {
                    assert.equal(held, "bandits");
                } else if (place.kind === "dragon's lair") {
                    assert.equal(held, "beast");
                } else if (place.kind === "shrine" || place.kind === "standing stones" || place.kind === "camp") {
                    assert.equal(held, null);
                } else {
                    assert.ok(place.holds.includes(held), `${place.kind}: ${held}`);
                }
            }
        }

        // A people's places that may be taken: bandits hold about PLACE_TIMES.taken of them
        const takeable = plans.flatMap((plan) => placesOf(plan).filter((place) => place.race && place.holds.length > 1).map((place) => heldAtStart(plan, place)));
        const taken = takeable.filter((held) => held === "bandits").length / takeable.length;

        assert.ok(takeable.length > 60, `${takeable.length}`);
        assert.ok(Math.abs(taken - PLACE_TIMES.taken) < 0.12, `${taken} taken`);
    });

    it("empty a while once cleared, then held again; a people's own never cleared", () => {
        const [plan] = plans;
        const places = placesOf(plan);
        const ruins = places.find((place) => place.kind === "ruins");
        const castle = places.find((place) => place.kind === "castle");
        const kept = { cleared: 100, times: 1 };

        assert.equal(holderOf(plan, ruins, undefined, 100), "dead");
        assert.equal(holderOf(plan, ruins, kept, 100), "cleared");
        assert.equal(holderOf(plan, ruins, kept, 100 + PLACE_TIMES.retake - 1), "cleared");
        assert.equal(holderOf(plan, ruins, kept, 100 + PLACE_TIMES.retake), "dead", "the dead rise again");
        assert.equal(holderOf(plan, castle, kept, 100), "friendly");
    });

    it("cleared as the war keeps it, kept with the war and carried on from its snapshot", () => {
        const [plan] = plans;
        const war = new War(plan);

        war.turn = 7;
        war.clearPlace("ruins-3");
        war.turn = 300;
        war.clearPlace("ruins-3");
        assert.deepEqual(war.places["ruins-3"], { cleared: 300, times: 2 });

        const again = War.restore(plan, war.snapshot());

        assert.deepEqual(again.places, war.places);

        // (A war kept before places were cleared carries on with none cleared)
        const old = war.snapshot();

        delete old.places;
        assert.deepEqual(War.restore(plan, old).places, {});
    });
});

describe("the places held by outlaws or the dead, in play (host.js #places)", () => {
    it("puts out their band when a player comes near, as many and as strong as the place is big and its land dangerous, their leader stronger by a locked chest; lets them go once every player's far", () => {
        const context = hosted();
        const { host, world, me } = context;
        const plan = world.plan;
        const homes = [world.start?.at ?? [0, 0]];

        for (const kind of ["ruins", "cave", "watchtower"]) {
            const place = placesOf(plan).find((each) => each.kind === kind && heldAtStart(plan, each) !== "friendly");
            const holder = heldAtStart(plan, place);
            const band = PLACE_BANDS[holder];
            const at = near(context, place);
            const held = host.held.get(place.id);
            const tier = tierAt(at, homes, landAt(plan, ...at).biome);
            const [leader, ...folk] = held.ids.map((id) => host.battle.actor(id));

            assert.equal(held.holder, holder);
            assert.equal(held.tier, tier);
            assert.equal(leader.wild.creature, band.leader);
            assert.equal(leader.wild.tier, tier + PLACE_BANDS.lead);
            assert.ok(host.wild.get(leader.id).master);
            assert.equal(folk.length, PLACE_BANDS.count[place.size] + Math.floor(tier / PLACE_BANDS.per), `${kind}'s band`);
            assert.ok(folk.every((one) => one.wild.creature === band.folk && one.wild.tier === tier && host.wild.get(one.id).place === place.id));
            assert.ok([leader, ...folk].every((one) => one.wild.temper === "territorial" && one.wild.guard === PLACE_BANDS.guard));

            // Its chest by the leader, locked while they hold it: in the middle of the ruins; at
            // the back of the cave, the top of the tower, gone into (insides.js: its plan's "h"
            // and "l"), as many of the band as it has room for guarding the way in, half at most,
            // the rest outside
            const chest = host.ground.get(`chest-${place.id}`);
            const building = world.interiors.buildings.get(`site:${place.id}`);

            assert.ok(chest.chest && chest.locked && chest.until === null);
            // (A cave's gone into; a people's watchtower, standing, isn't yet: M7.5b-2)
            assert.equal(Boolean(building), kind === "cave" || (kind === "watchtower" && !world.plan.sites.find((site) => site.id === place.id).race), kind);

            if (!building) {
                assert.equal(chest.map, "town");
                assert.ok(!squaresOf(world.maps.town).blocked(...chest.square), "on open ground");
                assert.ok(Math.hypot(chest.square[0] - at[0], chest.square[1] - at[1]) <= PLACE_BANDS.ring[place.size], `${kind}'s chest in its middle`);
            } else {
                const within = folk.filter((one) => building.maps.includes(one.map));
                const posts = building.maps.flatMap((id) => world.maps[id].marks.g ?? []);

                assert.ok(building.maps.includes(chest.map), `${kind}'s chest within`);
                assert.deepEqual(chest.square, world.maps[chest.map].marks.h[0]);
                assert.equal(leader.map, chest.map, `${kind}'s chief by it`);
                assert.ok(Math.hypot(leader.square[0] - world.maps[chest.map].marks.l[0][0], leader.square[1] - world.maps[chest.map].marks.l[0][1]) < 1.5, `${kind}'s chief where the plan has them`);
                assert.equal(within.length, Math.min(posts.length, Math.ceil(folk.length / 2)), `${kind}'s guards within`);
                assert.ok(within.length >= 2 && folk.some((one) => one.map === "town"));
                me.map = chest.map;
            }

            put(me, [...chest.square]);
            assert.deepEqual(host.command(HOST_PLAYER, { type: "pickUp", ground: chest.id }), { ok: false, reason: "locked" });
            me.map = "town";

            // Come in among them: they go for the player
            const outside = folk.find((one) => one.map === "town");

            put(me, [outside.square[0] + 3, outside.square[1]]);
            run(host, 1500);
            assert.equal(outside.target, HOST_PLAYER, `${kind}'s band guards it`);

            // Far: let go, the chest with them
            put(me, [Math.floor(at[0] + PLACE_BANDS.far + 60), Math.floor(at[1])]);
            run(host, 600);
            assert.ok(!host.held.has(place.id) && !host.ground.has(chest.id));
            assert.ok(held.ids.every((id) => !host.wild.has(id)));
        }
    });

    it("is cleared once they're all put to the sword: the war keeps it, the chest opened with a share for each player near; empty a while, then held again", () => {
        const context = hosted();
        const { host, world, me } = context;
        const place = placesOf(world.plan).find((each) => each.kind === "ruins");
        const at = near(context, place);
        const held = host.held.get(place.id);
        const events = putToTheSword(host, held);

        assert.deepEqual(events.filter((event) => event.type === "cleared").map(({ place: id, holder }) => [id, holder]), [[place.id, "dead"]]);
        assert.equal(events.filter((event) => event.type === "spoils" || event.type === "cleared").at(-1).type, "cleared", "told after all that fell with them");
        assert.deepEqual(host.war.places[place.id], { cleared: host.war.turn, times: 1 });
        assert.equal(holderOf(world.plan, place, host.war.places[place.id], host.war.turn), "cleared");
        assert.ok(!host.ground.has(`chest-${place.id}`), "the locked chest gone");

        // The chest's share, the player's own to take
        const share = [...host.ground.values()].find((dropped) => dropped.from === "chest");

        assert.ok(share && share.for === HOST_PLAYER && share.bundle.gold > 0);
        assert.ok(events.some((event) => event.type === "spoils" && event.creature === "chest" && event.ground === share.id));
        put(me, [...share.square]);
        assert.equal(host.command(HOST_PLAYER, { type: "pickUp", ground: share.id }).ok, true);

        // Cleared: none come back while it's empty
        put(me, [Math.floor(at[0] + PLACE_BANDS.far + 60), Math.floor(at[1])]);
        run(host, 600);
        near(context, place);
        assert.ok(!host.held.has(place.id), "empty a while");

        // A while on, the dead rise again
        host.war.turn += PLACE_TIMES.retake;
        run(host, 600);
        assert.ok(host.held.get(place.id)?.ids.length > 1, "held again");
    });

    it("carries on exactly from a snapshot, the bands and chests and all", () => {
        const context = hosted();
        const { host, world } = context;

        near(context, placesOf(world.plan).find((each) => each.kind === "ruins"));
        assert.equal(host.held.size, 1);

        const again = Host.restore(buildWorld({ seed: 2 }), decode(encode(host.snapshot())));

        const [id] = host.held.keys();

        assert.deepEqual([...again.held.entries()], [...host.held.entries()]);
        assert.deepEqual(again.ground.get(`chest-${id}`), host.ground.get(`chest-${id}`));

        run(host, 4000);
        run(again, 4000);
        assert.equal(again.checksum(), host.checksum());
    });
});

describe("the places gone into (M7.5b: a cave, the dragon's lair, a broken watchtower)", () => {
    it("a cave's gone into by its mouth, the way kept clear; its band held so while a player's within; put to the sword there, the chest's share lies where it stood", () => {
        const context = hosted();
        const { host, world, me } = context;
        const place = placesOf(world.plan).find((each) => each.kind === "cave");

        near(context, place);

        const set = world.maps.town.sites.set.get(place.id);
        const building = world.interiors.buildings.get(`site:${place.id}`);
        const squares = squaresOf(world.maps.town);

        assert.ok([...set.entrance.front, set.entrance.outside].every((square) => !squares.blocked(...square)), "the way in clear");
        assert.deepEqual(building.door.ends[0].squares, set.entrance.front);

        // In by its mouth, and a while within: they're there still
        put(me, [...set.entrance.outside]);
        assert.equal(host.command(HOST_PLAYER, { type: "enter", link: building.door.id }).ok, true);
        run(host, 3000);
        assert.equal(me.map, building.maps[0]);
        run(host, 1200);

        const held = host.held.get(place.id);

        assert.ok(held?.maps.includes(me.map), "held, the player within");

        // Put to the sword with the player within
        const events = putToTheSword(host, held);
        const share = [...host.ground.values()].find((dropped) => dropped.from === "chest" && dropped.for === HOST_PLAYER);

        assert.ok(events.some((event) => event.type === "cleared" && event.place === place.id));
        assert.equal(share.map, building.maps[0]);
        assert.deepEqual(share.square, world.maps[share.map].marks.h[0]);
    });

    it("the dragon's hoard lies at the back of its lair, locked while the dragon lives; opened once it falls, a share of it for each player there", () => {
        const context = hosted();
        const { host, world, me } = context;
        const site = world.plan.sites.find((one) => one.kind === "dragon's lair");
        const heart = world.maps.town.sites.heartOf(site);

        put(me, [Math.floor(heart[0] + 12), Math.floor(heart[1])]);
        run(host, 600);

        const lair = host.lairs.get(site.id);
        const chest = host.ground.get(`chest-${site.id}`);

        assert.ok(chest?.locked && lair.maps.includes(chest.map), "locked, within");
        assert.deepEqual(chest.square, world.maps[chest.map].marks.h[0]);

        const [master] = lair.ids.filter((id) => host.wild.get(id)?.master);

        host.battle.afflict(master, "poison", { by: HOST_PLAYER, damage: 1e7 });
        run(host, 3000);

        const share = [...host.ground.values()].find((dropped) => dropped.from === "chest" && dropped.map === chest.map);

        assert.ok(!host.ground.has(chest.id), "opened");
        assert.ok(share?.for === HOST_PLAYER && share.bundle.gold >= 180, JSON.stringify(share?.bundle));
    });

    it("carries on exactly from a snapshot, the cave's floor made again and its band within it", () => {
        const context = hosted();
        const { host, world } = context;
        const place = placesOf(world.plan).find((each) => each.kind === "cave");

        near(context, place);

        const again = Host.restore(buildWorld({ seed: 2 }), decode(encode(host.snapshot())));
        const held = host.held.get(place.id);
        const within = held.ids.filter((id) => host.battle.actor(id).map !== "town");

        assert.ok(within.length > 1);
        assert.ok(within.every((id) => again.world.maps[again.battle.actor(id).map]), "its floor made again");
        assert.deepEqual([...again.held.entries()], [...host.held.entries()]);
        run(host, 4000);
        run(again, 4000);
        assert.equal(again.checksum(), host.checksum());
    });
});

describe("the guilds' contracts to clear the places held (standing.js \"clear\")", () => {
    const giver = { id: "guild/receptionist", name: "Mirabel Wren", title: "" };

    // A guild's contract to clear a place near its town (the first town with one near, and the
    // contract for the place asked for, if given)
    function contractFor(war, { place: wanted = null } = {}) {
        const random = createRandom(5);

        for (const town of war.towns) {
            for (let k = 0; k < 40; k++) {
                const contract = offerContract({ war, town: town.id, giver, random });

                if (contract?.kind === "clear" && (!wanted || contract.target.place === wanted)) {
                    return { town, contract };
                }
            }
        }

        return null;
    }

    it("offers a place near held by outlaws or the dead, which way it lies, paid more for a bigger place and a more dangerous land; none once it's cleared, or carried", () => {
        const plan = planWorld(2);
        const war = new War(plan);
        const { town, contract } = contractFor(war);
        const place = placesOf(plan).find((each) => each.id === contract.target.place);

        assert.ok(Math.hypot(place.at[0] - town.at[0], place.at[1] - town.at[1]) <= CLEAR_REACH);
        assert.ok(PLACE_BANDS[contract.target.holder]);
        assert.equal(contract.target.holder, holderOf(plan, place, undefined, war.turn));
        assert.deepEqual(contract.target.at, place.at);
        assert.match(contract.text, new RegExp(`${contract.target.name}, [0-9.]+ km (north|south|east|west|north-east|north-west|south-east|south-west) of ${town.name}`));
        assert.match(progressOf(contract), contract.target.holder === "dead" ? /Lay the dead of .+ to rest/ : /Put the outlaws at .+ to the sword/);
        assert.equal(contract.until, war.turn + REQUESTS.clear.turns);

        const { gold, size, tier } = REQUESTS.clear.reward;

        assert.ok(contract.reward.gold >= gold + size[place.size] + tier, `${contract.reward.gold}`);
        assert.equal(contract.reward.standing, 0);

        // Carried already, or cleared: not offered again
        const random = createRandom(9);
        const offered = (held) => Array.from({ length: 80 }, () => offerContract({ war, town: town.id, giver, held, random })).filter((each) => each?.target.place === place.id).length;

        assert.ok(offered([]) > 0);
        assert.equal(offered([{ ...contract, id: "request-1" }]), 0);
        war.clearPlace(place.id);
        assert.equal(offered([]), 0);
    });

    it("is done once the place is put to the sword with the player there (a ruined castle once its master falls); comes to nothing if it's cleared without them", () => {
        const { contract } = contractFor(new War(planWorld(2)));
        const castle = placesOf(planWorld(2)).find((each) => each.kind === "ruined castle");
        // (The same, for the ruined castle: its master, a lair's, clears it)
        const contracts = [contract, { ...contract, key: castle.id, target: { ...contract.target, place: castle.id, holder: "dead", at: [...castle.at], name: "the ruined castle", kind: castle.kind } }];

        for (const each of contracts) {
            const context = hosted();
            const { host, world } = context;
            const player = host.players.get(HOST_PLAYER);
            const place = placesOf(world.plan).find((one) => one.id === each.target.place);
            const taken = player.standing.take(each);

            near(context, place);

            const band = host.held.get(place.id);
            const events = band ? putToTheSword(host, band) : [];

            if (!band) {
                const master = host.lairs.get(place.id).ids.find((id) => host.wild.get(id)?.master);

                host.battle.afflict(master, "poison", { by: HOST_PLAYER, damage: 1e7 });
                events.push(...run(host, 3000));
            }

            // Done, to go back to the guild for its pay
            assert.equal(player.standing.find(taken.id).state, "done", place.kind);
            assert.ok(events.some((event) => event.type === "request" && event.change === "ready" && event.request.id === taken.id));
        }

        // Another's, cleared without them: come to nothing
        const { host } = hosted();
        const theirs = host.players.get(HOST_PLAYER).standing.take(contract);

        host.war.turn = contract.given + 1;
        host.war.clearPlace(contract.target.place);
        run(host, 3000);
        assert.equal(host.players.get(HOST_PLAYER).standing.find(theirs.id), null, "closed");
    });
});
