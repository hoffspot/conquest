// The old graveyards outside the towns where the players start (core/worldplan/settle.js lays one
// out for each people; core/places.js; core/setpieces/neutral.js; core/host.js #places;
// docs/WILDS.md): one by a road outside each people's start town, in their lands, a few hundred
// metres out, where the wild's at its first tier and the town's guild reaches; held by the dead
// at the start, a few bones and a ghost led by a skeleton, out by day as by night, with no relic
// to guard; cleared for its chest, and the dead risen again a while on; the town's guild's to
// offer to clear
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { CREATURES, TIER_LAND, tierAt } from "../client/js/core/creatures.js";
import { squaresOf } from "../client/js/core/grid.js";
import { HOST_PLAYER, Host } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { bandFolk, bandOf, heldAtStart, PLACE_BANDS, PLACE_KINDS, PLACE_TIMES, placesOf } from "../client/js/core/places.js";
import { createRandom } from "../client/js/core/random.js";
import { GRAVEYARD, layoutNeutral, NEUTRAL } from "../client/js/core/setpieces/neutral.js";
import { GUILD_REACH, offerContract, progressOf } from "../client/js/core/standing.js";
import { War } from "../client/js/core/war/war.js";
import { CELL, CELLS, landAt, planWorld, RACES, startFor } from "../client/js/core/worldplan/plan.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });
const giver = Object.freeze({ id: "guild/receptionist", name: "Mirabel Wren", title: "" });
const apart = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function run(host, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...host.advance(STEP_MS));
    }

    return events;
}

const put = (actor, [x, y]) => Object.assign(actor, { square: [x, y], x: x + 0.5, y: y + 0.5, path: [], order: null, target: null, spawn: [x, y] });

describe("the old graveyards outside the start towns (worldplan/settle.js, places.js)", () => {
    it("lays one out by a road outside each people's start town, in their lands, clear of everything, within its guild's reach and the wild's first tier", () => {
        for (const seed of [1, 2, 3]) {
            const plan = planWorld(seed);
            const graveyards = plan.sites.filter(({ kind }) => kind === "graveyard");

            assert.equal(graveyards.length, RACES.length, `seed ${seed}`);

            RACES.forEach((race, r) => {
                const site = graveyards.find((each) => each.race === race.id);
                const start = startFor(plan, race.id);
                const k = site.cell[1] * CELLS + site.cell[0];
                const out = apart(site.at, start.at);

                assert.ok(site, `seed ${seed}: ${race.id}'s graveyard`);
                assert.equal(plan.territory[k], r + 1, `seed ${seed}: ${race.id}'s in their lands`);
                assert.ok(!plan.water[k] && !plan.road[k], `seed ${seed}: ${race.id}'s on dry land, off the road`);
                assert.ok(out >= GRAVEYARD_OUT[0] && out <= GRAVEYARD_OUT[1], `seed ${seed}: ${race.id}'s ${Math.round(out)} m out`);
                assert.ok(out + SPAN < GUILD_REACH && out + SPAN < TIER_LAND.from + TIER_LAND.every, `seed ${seed}: ${race.id}'s within reach and the first tier`);
                assert.equal(tierAt(site.at, [start.at], landAt(plan, ...site.at).biome), 1);

                // (Clear of every settlement, and apart from the other sites)
                assert.ok(plan.places.every((place) => apart(place.at, site.at) >= place.radius + 4 * CELL), `seed ${seed}: ${race.id}'s clear of the settlements`);
                assert.ok(plan.sites.every((other) => other === site || apart(other.cell, site.cell) >= 8), `seed ${seed}: ${race.id}'s apart from the sites`);
            });

            // (By a road, so they're found: within a few cells of one, most of them within two)
            const roads = graveyards.map((site) => toRoad(plan, site.cell));

            assert.ok(roads.every((d) => d <= 8) && roads.filter((d) => d <= 2).length >= RACES.length / 2, `seed ${seed}: ${roads}`);
            assert.deepEqual(planWorld(seed).sites.filter(({ kind }) => kind === "graveyard"), graveyards, `seed ${seed}: the same again`);
        }
    });

    it("is a small place held by the dead at the start, its own band: bones and a ghost, led by a skeleton, no relic to guard", () => {
        const plan = planWorld(2);
        const graveyards = placesOf(plan).filter(({ kind }) => kind === "graveyard");
        const ruins = placesOf(plan).find(({ kind }) => kind === "ruins");

        assert.equal(graveyards.length, RACES.length);

        for (const place of graveyards) {
            assert.deepEqual([place.size, place.icon, place.holds], ["small", "graveyard", ["dead"]]);
            assert.equal(heldAtStart(plan, place), "dead");
            assert.equal(bandOf(place, "dead"), PLACE_BANDS.graveyard);
            assert.equal(bandOf(place, null), null);
        }

        assert.equal(PLACE_KINDS.graveyard.band, "graveyard");
        assert.deepEqual([PLACE_BANDS.graveyard.leader, new Set(PLACE_BANDS.graveyard.folk)], ["skeleton", new Set(["skeleton", "ghost"])]);
        assert.ok(!PLACE_BANDS.graveyard.relic);

        // (The ruins' dead are still led by a wight lord, and guard their relic)
        assert.equal(bandOf(ruins, "dead"), PLACE_BANDS.dead);
        assert.ok(PLACE_BANDS.dead.relic && PLACE_BANDS.dead.leader === "wightLord");
    });

    it("is laid out as an old churchyard: walled round, gone into between two piers, a flagstone path to a mausoleum or a tomb, a yew by the gate on its west side, the graves east and west whichever way it faces", () => {
        const [width, depth] = NEUTRAL.graveyard.map((plots) => plots * 4);
        const cx = width / 2;
        // (A direction in the yard, turned `facing` as sites.js sets it down, as the world has it)
        const world = ([u, v], facing) => [u * Math.cos(facing) + v * Math.sin(facing), -u * Math.sin(facing) + v * Math.cos(facing)];
        const shapes = new Set();
        const grounds = new Set();
        let [west, all, north, south] = [0, 0, 0, 0];

        for (let seed = 1; seed <= 40; seed++) {
            const facing = ((seed * 7) % 24) * (Math.PI / 12);
            const laid = layoutNeutral({ kind: "graveyard", seed, facing });
            const graves = laid.parts.filter(({ part }) => part === "grave");
            const of = (part) => laid.parts.filter((each) => each.part === part);
            const [hx, hy] = laid.heart;

            assert.deepEqual(layoutNeutral({ kind: "graveyard", seed, facing }), laid, `${seed}: the same again`);
            assert.ok(graves.length >= 15 && graves.length <= 60, `${seed}: ${graves.length} graves`);
            assert.equal(of("gatepost").length, 2);
            assert.equal(of("flags").length, 1);
            assert.equal(of("tree").length, 1);
            assert.equal(of("mausoleum").length + of("tomb").filter(({ x }) => Math.abs(x - cx) < 0.01).length, 1, `${seed}: a mausoleum or a tomb at the path's end`);
            assert.ok(of("lowWall").every(({ h }) => h >= GRAVEYARD.wall.low && h <= GRAVEYARD.wall.high));

            // (Its way in and its path open, the heart on the path)
            const [flags] = of("flags");
            const across = (half, y) => laid.solid.some(([x0, , x1, y1]) => x0 < cx + half - 0.01 && x1 > cx - half + 0.01 && y1 > y + 0.01);

            assert.ok(!across(GRAVEYARD.gate.wide / 2, depth - 1.5), `${seed}: its way in open`);
            assert.ok(!across(GRAVEYARD.path / 2, flags.y0), `${seed}: its path open`);
            assert.ok(Math.abs(hx - cx) < 0.01 && hy > flags.y0 && hy < flags.y1);

            // (The graves east and west as the world lies, their headstones at the west end, none
            // on the path)
            for (const grave of graves) {
                const along = world([-Math.sin(grave.turn), Math.cos(grave.turn)], facing);

                assert.ok(along[0] > Math.cos(GRAVEYARD.grave.yaw + 0.01), `${seed}: a grave ${along} not east and west`);
                assert.ok(Math.abs(grave.x - cx) > GRAVEYARD.path / 2, `${seed}: a grave on the path`);

                if (grave.stone) {
                    const look = world([Math.cos(grave.look), Math.sin(grave.look)], facing);

                    all++;
                    west += look[0] < -0.9 ? 1 : 0;
                    shapes.add(grave.stone);
                }

                grounds.add(grave.ground);

                // (Which side of the yard it's on, north or south, as the world lies)
                const [, wy] = world([grave.x - width / 2, grave.y - depth / 2], facing);

                north += wy < -depth / 6 ? 1 : 0;
                south += wy > depth / 6 ? 1 : 0;
            }

            // (The yew on the path's west side, as the world lies)
            const [yew] = of("tree");
            const eastward = Math.cos(facing);

            if (Math.abs(eastward) > 0.2) {
                assert.equal(Math.sign(yew.x - cx), -Math.sign(eastward), `${seed}: the yew on the west`);
            }
        }

        // (Most headstones' faces to the west; every shape cut; every state of the ground; the
        // north side the emptier)
        assert.ok(west > all * 0.55 && west < all * 0.85, `${west} of ${all} face west`);
        assert.deepEqual([...shapes].sort(), Object.keys(GRAVEYARD.stones).sort());
        assert.deepEqual([...grounds].sort(), Object.keys(GRAVEYARD.ground).sort());
        assert.ok(north < south * 0.8, `${north} north, ${south} south`);
    });
});

describe("a graveyard in play (host.js #places)", () => {
    it("puts out its dead, by day, when a player comes near: bones and a ghost at the land's tier, a skeleton leading them two tiers up; cleared for its chest, no relic in it; risen again a while on", () => {
        const world = buildWorld({ seed: 2 });
        const host = new Host(world, { populate: false });

        host.join({ id: HOST_PLAYER, hero: HERO });
        host.populate();
        Object.assign(host.battle.actor("orc"), { dead: true, respawnAt: Infinity });

        const me = host.battle.actor(HOST_PLAYER);
        const plan = world.plan;
        const home = startFor(plan, "human").at;
        const place = placesOf(plan).find(({ kind, race }) => kind === "graveyard" && race === "human");
        const site = plan.sites.find(({ id }) => id === place.id);

        Object.assign(me, { hp: 1e6, maxHp: 1e6 });
        assert.ok(apart(place.at, world.start.at) < GUILD_REACH);

        const at = world.maps.town.sites.heartOf(site);

        put(me, [Math.floor(at[0] + 12), Math.floor(at[1])]);
        run(host, 600);

        const held = host.held.get(place.id);
        const tier = tierAt(at, [home], landAt(plan, ...at).biome);
        const [leader, ...folk] = held.ids.map((id) => host.battle.actor(id));

        assert.equal(held.holder, "dead");
        assert.equal(tier, 1);
        assert.equal(leader.wild.creature, "skeleton");
        assert.equal(leader.wild.tier, tier + PLACE_BANDS.lead);
        assert.equal(folk.length, PLACE_BANDS.count.small + Math.floor(tier / PLACE_BANDS.per));
        assert.ok(folk.every((one, k) => one.wild.creature === bandFolk(PLACE_BANDS.graveyard, k) && one.wild.tier === tier));
        assert.ok(folk.some((one) => one.wild.creature === "ghost"));
        assert.ok(CREATURES.skeleton.night === "only", "(the wild's skeletons the night's own; a graveyard's out by day)");

        // (Its chest on open ground by its leader, locked)
        const chest = host.ground.get(`chest-${place.id}`);

        assert.ok(chest.locked && chest.map === "town" && !squaresOf(world.maps.town).blocked(...chest.square));

        // Put to the sword: cleared, its chest's share for the player, and no relic in it
        for (const id of held.ids) {
            host.battle.afflict(id, "poison", { by: HOST_PLAYER, damage: 1e7 });
        }

        const events = run(host, 3000);
        const share = [...host.ground.values()].find((dropped) => dropped.from === "chest");

        assert.deepEqual(events.filter((event) => event.type === "cleared").map(({ place: id, holder }) => [id, holder]), [[place.id, "dead"]]);
        assert.ok(share && share.for === HOST_PLAYER && share.bundle.gold > 0);
        assert.ok(!events.some((event) => event.type === "spoils" && event.relic), "no relic");
        assert.ok(share.bundle.items.every((item) => item.quality !== "legendary"));

        // A while on, the dead rise again
        put(me, [Math.floor(at[0] + PLACE_BANDS.far + 60), Math.floor(at[1])]);
        run(host, 600);
        host.war.turn += PLACE_TIMES.retake;
        put(me, [Math.floor(at[0] + 12), Math.floor(at[1])]);
        run(host, 600);
        assert.ok(host.held.get(place.id)?.ids.length > 1, "risen again");
    });

    it("is the start town's guild's to offer to clear: the dead laid to rest, and the skeleton that leads them", () => {
        const plan = planWorld(2);
        const war = new War(plan);
        const start = startFor(plan, "human");
        const town = war.towns.find(({ at }) => apart(at, start.at) < 1);
        const place = placesOf(plan).find(({ kind, race }) => kind === "graveyard" && race === "human");
        const random = createRandom(4);
        const contract = Array.from({ length: 400 }, () => offerContract({ war, town: town.id, giver, home: start.at, random })).find((each) => each?.kind === "clear" && each.target.place === place.id);

        assert.ok(contract, "offered");
        assert.equal(contract.target.holder, "dead");
        assert.match(contract.text, /^The dead walk at the graveyard, [0-9.]+ km [a-z-]+ of .+ Lay them to rest, the skeleton that leads them with them\./);
        assert.match(progressOf(contract), /Lay the dead of the graveyard to rest/);
    });
});

// How far out from its start town's middle a graveyard's laid out (metres: settle.js GRAVEYARD's
// cells, give or take a cell's middle), and how far its ground reaches from its middle
const GRAVEYARD_OUT = [8 * CELL - CELL, 17 * CELL + CELL];
const SPAN = 16;

// How far a cell is from the nearest road (cells each way; 99 if none within 8)
function toRoad(plan, [x, y]) {
    let nearest = 99;

    for (let dy = -8; dy <= 8; dy++) {
        for (let dx = -8; dx <= 8; dx++) {
            if (plan.road[(y + dy) * CELLS + x + dx]) {
                nearest = Math.min(nearest, Math.max(Math.abs(dx), Math.abs(dy)));
            }
        }
    }

    return nearest;
}
