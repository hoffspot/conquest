// Places worth finding (client/js/core/places.js; the terrain plan's M7.5): every site and wild camp
// a place on the maps, who holds each (mixed by the war, a world at a time), cleared and retaken;
// in play (core/host.js #places), the outlaws or the dead holding theirs, their leader by a locked
// chest, put to the sword for what's in it; the guilds' contracts to clear them (core/standing.js)
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { ICON_KINDS, PLACE_RIMS } from "../client/js/app/mapicons.js";
import { STEP_MS } from "../client/js/core/battle.js";
import { CREATURES, LAIRS, tierAt, tierPower } from "../client/js/core/creatures.js";
import { hypot } from "../client/js/core/exact.js";
import { squaresOf } from "../client/js/core/grid.js";
import { HOST_PLAYER, Host } from "../client/js/core/host.js";
import { WAY_IN_CLEAR } from "../client/js/core/insides.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { bandFolk, heldAtStart, HOLDERS, holderOf, PLACE_BANDS, PLACE_KINDS, PLACE_TIMES, placeOf, placesOf } from "../client/js/core/places.js";
import { RELICS, rollLoot, rollRelic, wares } from "../client/js/core/progress.js";
import { createRandom } from "../client/js/core/random.js";
import { GUILD_REACH, offerContract, progressOf, REQUESTS } from "../client/js/core/standing.js";
import { scalingOf } from "../client/js/core/strength.js";
import { War } from "../client/js/core/war/war.js";
import { decode, encode } from "../client/js/core/wire.js";
import { landAt, planWorld, WORKS } from "../client/js/core/worldplan/plan.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

function run(host, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...host.advance(STEP_MS));
    }

    return events;
}

const put = (actor, [x, y]) => Object.assign(actor, { square: [x, y], x: x + 0.5, y: y + 0.5, path: [], order: null, target: null, spawn: [x, y] });

// A world (seed 2, unless another's asked for) with its player in it, hard to kill, the orc gone
function hosted(seed = 2) {
    const world = buildWorld({ seed });
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

    it("are every site and wild camp in a world (but the dungeons), each with its icon on the maps and who may hold it", () => {
        for (const plan of plans) {
            const places = placesOf(plan);

            // (But the dungeons' ways in: no one holds them, the war passes them by; core/dungeons. Nor
            // the peoples' works: the war's, docs/WAR.md *The works*)
            assert.equal(places.length, plan.sites.filter(({ kind }) => kind !== "dungeon" && !WORKS.some((each) => each.kind === kind)).length + plan.camps.length, "every site and camp a place, but the dungeons and the works");
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
            // (The band each its kind in turn: the outlaws all bandits; the dead their bones, their
            // ghosts and a wraith)
            assert.ok(folk.every((one, k) => one.wild.creature === bandFolk(band, k) && one.wild.tier === tier && host.wild.get(one.id).place === place.id));

            if (holder === "dead") {
                assert.deepEqual(new Set(folk.map((one) => one.wild.creature)), new Set(["skeleton", "ghost", "wraith"]));
            }
            assert.ok([leader, ...folk].every((one) => one.wild.temper === "territorial" && one.wild.guard === PLACE_BANDS.guard));

            // Its chest by the leader, locked while they hold it: at the back of the cave, of the
            // crypt under the ruins, the top of the tower, gone into (insides.js: its plan's "h"
            // and "l"), as many of the band as it has room for guarding the way in, half at most,
            // the rest outside
            const chest = host.ground.get(`chest-${place.id}`);
            const building = world.interiors.buildings.get(`site:${place.id}`);

            assert.ok(chest.chest && chest.locked && chest.until === null);
            // (A cave's gone into, the crypt under the ruins, and a watchtower, broken or a
            // people's: all but the orcs', an open deck on poles: insides.js STRUCTURE_DOORS)
            assert.equal(Boolean(building), kind === "cave" || kind === "ruins" || (kind === "watchtower" && place.race !== "orc"), kind);

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
                assert.equal(within.length, Math.min(posts.length, Math.ceil(folk.length / 2)), `${kind}'s guards within`);

                // (Its chief and those within each put clear of where anyone comes in onto their
                // floor, its door's or its stairs' arriving square: insides.js WAY_IN_CLEAR rings, as
                // far as the floor has room; the chief where the plan has them when that's clear)
                const ways = [building.door.ends[1], ...(building.stairs?.ends ?? [])];
                const off = (one) => Math.min(...ways.filter((end) => end.map === one.map).map(({ arrive: [x, y] }) => Math.max(Math.abs(one.spawn[0] - x), Math.abs(one.spawn[1] - y))));
                const mark = world.maps[chest.map].marks.l[0];

                for (const one of [leader, ...within]) {
                    assert.ok(off(one) >= WAY_IN_CLEAR, `${kind}: ${one.id} ${off(one)} rings from the way in`);
                }

                if (off({ map: chest.map, spawn: mark }) >= WAY_IN_CLEAR) {
                    assert.deepEqual(leader.spawn, mark, `${kind}'s chief where the plan has them`);
                } else {
                    assert.ok(off(leader) > off({ map: chest.map, spawn: mark }), `${kind}'s chief moved further in than the plan has them`);
                }
                assert.ok(within.length >= 2 && folk.some((one) => one.map === "town"));
                me.map = chest.map;
            }

            put(me, [...chest.square]);
            assert.deepEqual(host.command(HOST_PLAYER, { type: "pickUp", ground: chest.id }), { ok: false, reason: "locked" });
            me.map = "town";

            // Come in among them (from outside, in sight of one of them): they go for the player
            const outside = folk.find((one) => one.map === "town");
            const [dx, dy] = [outside.x - at[0], outside.y - at[1]];
            const off = Math.hypot(dx, dy) || 1;

            put(me, [Math.floor(outside.x + (dx / off) * 3), Math.floor(outside.y + (dy / off) * 3)]);
            run(host, 1500);
            assert.equal(outside.target, HOST_PLAYER, `${kind}'s band guards it`);

            // Far: let go, the chest with them
            put(me, [Math.floor(at[0] + PLACE_BANDS.far + 60), Math.floor(at[1])]);
            run(host, 600);
            assert.ok(!host.held.has(place.id) && !host.ground.has(chest.id));
            assert.ok(held.ids.every((id) => !host.wild.has(id)));
        }
    });

    it("puts out their band against the side of the players near: two alike, their leader tougher, more of the band and each of them tougher (strength.js)", () => {
        const context = hosted();
        const { host, world, me } = context;
        const plan = world.plan;
        const place = placesOf(plan).find((each) => each.kind === "ruins" && heldAtStart(plan, each) !== "friendly");
        const band = PLACE_BANDS[heldAtStart(plan, place)];
        const at = host.world.maps.town.sites.heartOf(host.world.plan.sites.find((site) => site.id === place.id));

        host.join({ id: "guest", hero: { ...HERO, name: "Bram" } });
        Object.assign(host.battle.actor("guest"), { hp: 1e6, maxHp: 1e6 });
        put(me, [Math.floor(at[0] + 12), Math.floor(at[1])]);
        put(host.battle.actor("guest"), [Math.floor(at[0] + 12), Math.floor(at[1]) + 2]);
        run(host, 600);

        const held = host.held.get(place.id);
        const [leader, ...folk] = held.ids.map((id) => host.battle.actor(id));
        const scale = scalingOf(host.strengthOf(HOST_PLAYER).opposition);
        const alone = PLACE_BANDS.count[place.size] + Math.floor(held.tier / PLACE_BANDS.per);

        assert.equal(host.strengthOf(HOST_PLAYER).strength, 2);
        assert.equal(leader.maxHp, Math.round(CREATURES[band.leader].hp * tierPower(held.tier + PLACE_BANDS.lead) * scale.leader));
        assert.ok(folk.length >= Math.floor(alone * scale.count) && folk.length <= Math.ceil(alone * scale.count), `${folk.length} of them, ${alone} alone`);
        assert.ok(folk.every((one) => one.maxHp === Math.round(CREATURES[one.wild.creature].hp * tierPower(held.tier) * scale.health)));
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

        // (And what the dead guarded: one of their old relics, a legendary jewel with its own name)
        const relic = share.bundle.items.at(-1);
        const [what, whose] = relic.name.split(" of ");

        assert.ok(relic.quality === "legendary" && RELICS[relic.id]?.includes(what) && RELICS.of.includes(whose), relic.name);
        assert.ok(events.some((event) => event.type === "spoils" && event.creature === "chest" && event.ground === share.id && event.relic === relic.name), "told of the relic by name");
        // (Where the chest stood: down in the crypt under the ruins)
        me.map = share.map;
        put(me, [...share.square]);
        assert.equal(host.command(HOST_PLAYER, { type: "pickUp", ground: share.id }).ok, true);
        me.map = "town";

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

describe("the restless dead's relics (M7.5c-3: progress.js rollRelic)", () => {
    it("makes each a legendary amulet or ring of whoever lived there long ago, its bonuses rolled, the same for the same numbers; only the dead's chests hold one", () => {
        const random = createRandom(7);
        const relics = Array.from({ length: 40 }, () => rollRelic(random));

        for (const relic of relics) {
            const [what, whose] = relic.name.split(" of ");

            assert.ok(["amulet", "ring"].includes(relic.id) && relic.quality === "legendary", relic.name);
            assert.ok(RELICS[relic.id].includes(what) && RELICS.of.includes(whose), relic.name);
            assert.ok(relic.name.length <= 40 && Object.keys(relic.bonuses).length === 3, relic.name);
        }

        assert.deepEqual(new Set(relics.map(({ id }) => id)), new Set(["amulet", "ring"]));
        assert.deepEqual(rollRelic(createRandom(3)), rollRelic(createRandom(3)));

        // (A chest the dead didn't guard: none)
        const plain = rollLoot("chest", createRandom(5));
        const theirs = rollLoot("chest", createRandom(5), { relic: true });

        assert.deepEqual(theirs.items.slice(0, -1), plain.items);
        assert.ok(!plain.items.some((item) => item.name?.includes(" of the ")));
        assert.equal(theirs.items.at(-1).quality, "legendary");
    });
});

describe("the places gone into (M7.5b: a cave, the dragon's lair, a broken watchtower, the humans' abbeys and manors)", () => {
    it("a cave's gone into by its mouth, and the crypt under the ruins by the door of their stair-house, the way kept clear; its band held so while a player's within; put to the sword there, the chest's share lies where it stood", () => {
        for (const kind of ["cave", "ruins"]) {
            const context = hosted();
            const { host, world, me } = context;
            const place = placesOf(world.plan).find((each) => each.kind === kind);

            near(context, place);

            const set = world.maps.town.sites.set.get(place.id);
            const building = world.interiors.buildings.get(`site:${place.id}`);
            const squares = squaresOf(world.maps.town);

            assert.equal(building.kind, kind === "ruins" ? "crypt" : "cave");
            assert.ok([...set.entrance.front, set.entrance.outside].every((square) => !squares.blocked(...square)), `${kind}: the way in clear`);
            assert.deepEqual(building.door.ends[0].squares, set.entrance.front);

            // In by its way in, and a while within (kept hardy enough to stand among them, a
            // rank in endurance or not): they're there still
            const hardy = (ms) => {
                const events = [];

                for (let t = 0; t < ms; t += STEP_MS) {
                    events.push(...host.advance(STEP_MS));
                    Object.assign(me, { hp: 1e6, maxHp: 1e6 });
                }

                return events;
            };

            put(me, [...set.entrance.outside]);
            assert.equal(host.command(HOST_PLAYER, { type: "enter", link: building.door.id }).ok, true);
            hardy(3000);
            assert.equal(me.map, building.maps[0], kind);
            hardy(1200);

            const held = host.held.get(place.id);

            assert.ok(held?.maps.includes(me.map), `${kind}: held, the player within`);

            // Put to the sword with the player within
            for (const id of held.ids) {
                host.battle.afflict(id, "poison", { by: HOST_PLAYER, damage: 1e7 });
            }

            const events = hardy(3000);
            const share = [...host.ground.values()].find((dropped) => dropped.from === "chest" && dropped.for === HOST_PLAYER);

            assert.ok(events.some((event) => event.type === "cleared" && event.place === place.id));
            assert.equal(share?.map, building.maps[0], kind);
            assert.deepEqual(share.square, world.maps[share.map].marks.h[0]);
        }
    });

    it("a ruined castle's wight lord keeps within its keep's great hall, open to the sky, by its hoard, half of each kind of its dead with it, gone into by the breach where the keep's door was", () => {
        const context = hosted();
        const { host, world, me } = context;
        const site = world.plan.sites.find((one) => one.kind === "ruined castle");
        const heart = world.maps.town.sites.heartOf(site);

        put(me, [Math.floor(heart[0] + 12), Math.floor(heart[1])]);
        run(host, 600);

        const held = host.lairs.get(site.id);
        const building = world.interiors.buildings.get(`site:${site.id}`);
        const [hall] = building.maps;
        const band = held.ids.map((id) => host.battle.actor(id));
        const master = band.find((one) => host.wild.get(one.id)?.master);
        const chest = host.ground.get(`chest-${site.id}`);

        assert.equal(building.kind, "ruin");
        assert.equal(world.maps[hall].style, "ruin");
        assert.equal(master.map, hall, "the wight lord within");
        assert.ok(chest?.locked && chest.map === hall, "its hoard within, locked");
        assert.ok(Math.hypot(master.square[0] - world.maps[hall].marks.l[0][0], master.square[1] - world.maps[hall].marks.l[0][1]) < 1.5, "where the plan has it");
        // (Half of each kind, its bones, ghosts and wraith, as long as there are posts for them)
        let posts = building.maps.flatMap((id) => world.maps[id].marks.g ?? []).length;
        const within = LAIRS["ruined castle"].guards.reduce((sum, [, count]) => {
            const here = Math.min(posts, Math.ceil(count / 2));

            posts -= here;

            return sum + here;
        }, 0);

        assert.equal(band.filter((one) => one !== master && one.map === hall).length, within, "half of each of its dead with it");
        assert.ok(band.some((one) => one.map === "town"), "the rest in the courtyard");
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

    it("an abbey held by outlaws is theirs within: its chief before the altar by the chest, guards up the aisle, no priest or worshippers; a manor that's its people's has its folk", () => {
        const context = hosted();
        const { host, world, me } = context;
        const abbey = placesOf(world.plan).find((each) => each.kind === "abbey" && heldAtStart(world.plan, each) === "bandits");
        const manor = placesOf(world.plan).find((each) => each.kind === "manor" && heldAtStart(world.plan, each) === "friendly");

        near(context, abbey);

        const building = world.interiors.buildings.get(`site:${abbey.id}`);
        const set = world.maps.town.sites.set.get(abbey.id);
        const held = host.held.get(abbey.id);
        const nave = world.maps[building.maps[0]];
        const [leader, ...band] = held.ids.map((id) => host.battle.actor(id));
        const altar = nave.pieces.find(({ kind }) => kind === "altar");

        assert.equal(building.kind, "church");
        assert.ok(leader.map === nave.id && hypot(leader.x - (altar.x + altar.w / 2), leader.y - (altar.y + altar.h)) < 3, `the chief by the altar: ${leader.x}, ${leader.y}`);
        assert.equal(held.map, nave.id);
        assert.ok(Math.abs(held.chest[0] - (altar.x + altar.w)) <= 1 && Math.abs(held.chest[1] - altar.y) <= 1, `the chest by it: ${held.chest}`);
        assert.equal(band.filter((one) => one.map === nave.id).length, Math.ceil(band.length / 2));

        // In by the temple's door: no priest, no worshippers
        put(me, [...set.entrance.outside]);
        run(host, 600);
        assert.deepEqual(host.open.get(building.key), []);
        assert.ok(!building.folk.some(({ id }) => host.battle.actor(id)), "none of its folk");

        // The manor its people's: its folk about their business in its keep
        world.maps.town.sites.heartOf(world.plan.sites.find((site) => site.id === manor.id));

        const keep = world.interiors.buildings.get(`site:${manor.id}`);

        put(me, [...world.maps.town.sites.set.get(manor.id).entrance.outside]);
        run(host, 600);
        assert.equal(keep.kind, "keep");
        assert.ok(host.open.get(keep.key)?.includes(`${keep.key}/ruler`), JSON.stringify(host.open.get(keep.key)));
        assert.ok(!host.held.has(manor.id));
    });

    it("the friendlies' shops at their places (M7.5c-2): an abbey's herbalist sells its draughts, cures and holy jewels; a people's watchtower's quartermaster the watch's plain arms and armour, up to fine, its own shop and not a castle's", () => {
        // (Seed 4's abbey is its people's; seed 2's held by outlaws)
        const visit = (seed, kind, local) => {
            const { host, world, me } = hosted(seed);
            const { progress } = host.players.get(HOST_PLAYER);
            const place = placesOf(world.plan).find((each) => each.kind === kind && each.race && each.race !== "orc" && heldAtStart(world.plan, each) === "friendly");

            // (Into the place, and across the counter from whoever keeps its shop)
            world.maps.town.sites.heartOf(world.plan.sites.find((site) => site.id === place.id));

            const building = world.interiors.buildings.get(`site:${place.id}`);

            put(me, [...world.maps.town.sites.set.get(place.id).entrance.outside]);
            assert.equal(host.command(HOST_PLAYER, { type: "enter", link: building.door.id }).ok, true, place.kind);
            run(host, 4000);
            assert.equal(me.map, building.maps[0], place.kind);

            const keeper = host.battle.actor(`${building.key}/${local}`);

            put(me, [keeper.square[0], keeper.square[1] + 2]);
            progress.gold = 5000;

            return { host, keeper, progress };
        };

        const abbey = visit(4, "abbey", "herbalist");

        assert.ok(abbey.keeper && wares("abbey").some(({ id, quality }) => id === "amulet" && quality === "masterwork"));
        assert.deepEqual(abbey.host.command(HOST_PLAYER, { type: "buy", item: { id: "amulet", quality: "masterwork" }, from: abbey.keeper.id }), { ok: true });
        assert.deepEqual(abbey.host.command(HOST_PLAYER, { type: "buy", item: { id: "sword" }, from: abbey.keeper.id }), { ok: false, reason: "shop" });
        assert.deepEqual(abbey.progress.pack.filter(Boolean).map(({ id, quality }) => [id, quality]).at(-1), ["amulet", "masterwork"]);

        const tower = visit(2, "watchtower", "quartermaster");

        assert.ok(tower.keeper && tower.host.folk.get(tower.keeper.id).shop === "watch");
        assert.deepEqual(tower.host.command(HOST_PLAYER, { type: "buy", item: { id: "mail", quality: "fine" }, from: tower.keeper.id }), { ok: true });
        assert.deepEqual(tower.host.command(HOST_PLAYER, { type: "buy", item: { id: "sword", quality: "legendary" }, from: tower.keeper.id }), { ok: false, reason: "shop" });
        assert.deepEqual(tower.progress.pack.filter(Boolean).map(({ id, quality }) => [id, quality]).at(-1), ["mail", "fine"]);
    });

    it("the cat folk's sun temple and the lizard folk's ziggurat gone into (M7.5d): the sun temple held by outlaws theirs within, its chief before the altar by the chest, the rest before the foot of its stair; the ziggurat its people's, its priest and herbalist in it, the herbalist selling an abbey's goods", () => {
        const context = hosted();
        const { host, world, me } = context;
        const { progress } = host.players.get(HOST_PLAYER);
        // (Seed 2's sun temple is held by outlaws, its ziggurat its people's)
        const temple = placesOf(world.plan).find((each) => each.kind === "sun temple" && heldAtStart(world.plan, each) === "bandits");
        const ziggurat = placesOf(world.plan).find((each) => each.kind === "ziggurat" && heldAtStart(world.plan, each) === "friendly");

        near(context, temple);

        const building = world.interiors.buildings.get(`site:${temple.id}`);
        const held = host.held.get(temple.id);
        const nave = world.maps[building.maps[0]];
        const [leader, ...band] = held.ids.map((id) => host.battle.actor(id));
        const altar = nave.pieces.find(({ kind }) => kind === "altar");

        assert.equal(building.kind, "church");
        assert.ok(leader.map === nave.id && hypot(leader.x - (altar.x + altar.w / 2), leader.y - (altar.y + altar.h)) < 3, `the chief by the altar: ${leader.x}, ${leader.y}`);
        assert.equal(held.map, nave.id);
        assert.equal(band.filter((one) => one.map === nave.id).length, Math.ceil(band.length / 2));
        assert.ok(band.some((one) => one.map === "town"), "the rest outside, before the foot of its stair");

        // The ziggurat its people's: in by the portal at its foot, its priest and herbalist there;
        // the herbalist's an abbey's goods
        world.maps.town.sites.heartOf(world.plan.sites.find((site) => site.id === ziggurat.id));

        const sanctum = world.interiors.buildings.get(`site:${ziggurat.id}`);

        put(me, [...world.maps.town.sites.set.get(ziggurat.id).entrance.outside]);
        assert.equal(host.command(HOST_PLAYER, { type: "enter", link: sanctum.door.id }).ok, true);
        run(host, 4000);
        assert.equal(me.map, sanctum.maps[0]);
        assert.ok([`${sanctum.key}/priest`, `${sanctum.key}/herbalist`].every((id) => host.open.get(sanctum.key)?.includes(id)), JSON.stringify(host.open.get(sanctum.key)));

        const herbalist = host.battle.actor(`${sanctum.key}/herbalist`);

        put(me, [herbalist.square[0], herbalist.square[1] + 2]);
        progress.gold = 5000;
        assert.deepEqual(host.command(HOST_PLAYER, { type: "buy", item: { id: "amulet", quality: "masterwork" }, from: herbalist.id }), { ok: true });
        assert.ok(!host.held.has(ziggurat.id));
    });

    it("a people's watchtower that's theirs is kept, its lookout and sentry in it; one held by outlaws has the band's chief and chest at its top", () => {
        const context = hosted();
        const { host, world, me } = context;
        const towers = placesOf(world.plan).filter((each) => each.kind === "watchtower" && each.race && each.race !== "orc");
        const theirs = towers.find((each) => heldAtStart(world.plan, each) === "friendly");
        const taken = towers.find((each) => heldAtStart(world.plan, each) === "bandits");

        world.maps.town.sites.heartOf(world.plan.sites.find((site) => site.id === theirs.id));

        const kept = world.interiors.buildings.get(`site:${theirs.id}`);

        put(me, [...world.maps.town.sites.set.get(theirs.id).entrance.outside]);
        run(host, 600);
        assert.deepEqual(host.open.get(kept.key), [`${kept.key}/lookout`, `${kept.key}/sentry`, `${kept.key}/quartermaster`]);
        assert.ok(!host.held.has(theirs.id));

        near(context, taken);

        const held = host.held.get(taken.id);
        const building = world.interiors.buildings.get(`site:${taken.id}`);
        const [, top] = building.maps;

        assert.equal(held.map, top);
        assert.equal(host.battle.actor(held.leader).map, top);
        assert.deepEqual(host.open.get(building.key) ?? [], []);
    });

    it("the elves' tree hall held by outlaws, its door deep in its ground: those of the band outside stand before the way in, not in it, and it's walked up and gone into", () => {
        const context = hosted();
        const { host, world, me } = context;
        const hall = placesOf(world.plan).find((each) => each.kind === "tree hall" && heldAtStart(world.plan, each) === "bandits");

        near(context, hall);

        const set = world.maps.town.sites.set.get(hall.id);
        const building = world.interiors.buildings.get(`site:${hall.id}`);
        const way = new Set(set.entrance.clear.map(String));
        const outside = host.held.get(hall.id).ids.map((id) => host.battle.actor(id)).filter((one) => one.map === "town");

        assert.equal(building.kind, "keep");
        assert.ok(outside.length > 0 && outside.every((one) => !way.has(String(one.square))), "none in the way");

        put(me, [...set.entrance.outside]);
        assert.equal(host.command(HOST_PLAYER, { type: "enter", link: building.door.id }).ok, true);

        for (let t = 0; t < 12000 && me.map === "town"; t += STEP_MS) {
            me.hp = me.maxHp;
            host.advance(STEP_MS);
        }

        assert.equal(me.map, building.maps[0]);
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

        assert.ok(Math.hypot(place.at[0] - town.at[0], place.at[1] - town.at[1]) <= GUILD_REACH);
        assert.equal(GUILD_REACH, 1500);
        assert.ok(PLACE_BANDS[contract.target.holder]);
        assert.equal(contract.target.holder, holderOf(plan, place, undefined, war.turn));
        assert.deepEqual(contract.target.at, place.at);
        assert.match(contract.text, new RegExp(`${contract.target.name}, [0-9.]+ km (north|south|east|west|north-east|north-west|south-east|south-west) of ${town.name}`));
        assert.match(progressOf(contract), contract.target.holder === "dead" ? /Lay the dead of .+ to rest/ : /Put the outlaws at .+ to the sword/);
        assert.equal(contract.until, war.turn + REQUESTS.clear.turns);

        const { gold, size, tier } = REQUESTS.clear.reward;

        assert.ok(contract.reward.gold >= gold + size[place.size] + tier, `${contract.reward.gold}`);
        assert.equal(contract.reward.standing, 0);

        // Carried already, or cleared: not offered again (asked often enough to come up among
        // the dozen or so places within a guild's reach)
        const random = createRandom(9);
        const offered = (held) => Array.from({ length: 400 }, () => offerContract({ war, town: town.id, giver, held, random })).filter((each) => each?.target.place === place.id).length;

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
