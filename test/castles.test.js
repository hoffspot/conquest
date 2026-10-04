// The peoples' castles as they stand (setpieces/castles.js; the terrain plan's M7.5b-3): walled all
// round but for their gates, their courtyards walked into through them, the cat folk's keep gone
// into from its courtyard
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { squaresOf } from "../client/js/core/grid.js";
import { HOST_PLAYER, Host } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { castleLayout, inCourt, solidAt } from "../client/js/core/setpieces/castles.js";
import { GROUND, PEOPLE_PLACES, PLOT } from "../client/js/core/setpieces/pieces.js";
import { WORLD_SIZE } from "../client/js/core/worldplan/plan.js";

const LAID = ["elf", "orc", "cat", "darkElf"];

// Each people's whose castle's keep is gone into: the lizard folk's too, from the end of its
// causeway (its courtyard's up on its platform, not walked onto)
const KEEPS = [...LAID, "lizard"];

// What each people's courtyard's ground is
const GROUNDS = Object.freeze({ elf: GROUND.courtyard, orc: GROUND.road, cat: GROUND.courtyard, darkElf: GROUND.cobbles });

// The metre cells of a castle's lot reached from just outside its gate (to the south), never
// through anything solid (nor `shut`, if it's given)
function walked(layout, [W, D], shut = null) {
    const open = (u, v) => u >= 0 && v >= 0 && u < W && v < D + 6 && !solidAt(layout, [u + 0.5, v + 0.5]) && !(shut && solidAt({ solid: [shut] }, [u + 0.5, v + 0.5], 0));
    const start = [Math.floor(layout.gate[0]), Math.min(Math.floor(layout.gate[1]) + 5, D + 5)];
    const seen = new Set([String(start)]);
    const queue = [start];

    while (queue.length) {
        const [u, v] = queue.shift();

        for (const [du, dv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const next = [u + du, v + dv];

            if (open(...next) && !seen.has(String(next))) {
                seen.add(String(next));
                queue.push(next);
            }
        }
    }

    return seen;
}

describe("the peoples' castles as they stand (setpieces/castles.js)", () => {
    it("are laid out for the elves, the orcs, the cat folk, the dark elves and the lizard folk, the same for the same lot; the lizard folk's solid all through but for the way to its keep", () => {
        for (const race of KEEPS) {
            const size = PEOPLE_PLACES[race].castle.map((plots) => plots * PLOT);

            assert.deepEqual(castleLayout(race, size), castleLayout(race, size), race);
        }

        const lizard = castleLayout("lizard", [64, 64]);

        assert.deepEqual([lizard.court, lizard.gate], [[], null]);
        assert.ok(solidAt(lizard, [32, 32]) && solidAt(lizard, [1, 63]), "its platform and moat");

        for (const race of ["human"]) {
            assert.equal(castleLayout(race, [60, 60]), null, race);
        }
    });

    it("are walled all round but for their gates, 3 m clear through: their courtyards walked into through them, and not with their gates shut", () => {
        for (const race of LAID) {
            const size = PEOPLE_PLACES[race].castle.map((plots) => plots * PLOT);
            const layout = castleLayout(race, size);
            const court = [];

            for (let v = 0; v < size[1]; v += 1) {
                for (let u = 0; u < size[0]; u += 1) {
                    if (inCourt(layout, [u + 0.5, v + 0.5]) && !solidAt(layout, [u + 0.5, v + 0.5])) {
                        court.push(String([u, v]));
                    }
                }
            }

            const reached = walked(layout, size);
            const shut = walked(layout, size, { disc: [...layout.gate, 4.5] });

            assert.ok(court.length > 200, `${race}: a courtyard (${court.length})`);
            assert.ok(!solidAt(layout, layout.gate) && inCourt(layout, layout.gate), `${race}: its gate's open, its gateway's ground its courtyard's`);

            // (3 m clear through its gate, so it's walked through at whatever turn it's set down
            // at: the squares blocked stand up to 0.7 m into a gap on the slant, and the
            // navigation mesh keeps walkers 0.5 m off them, navigation/settings.js AGENT)
            for (let v = layout.gate[1] - 2.5; v <= layout.gate[1] + 2; v += 0.25) {
                for (let u = -1.5; u <= 1.5; u += 0.25) {
                    assert.ok(!solidAt(layout, [layout.gate[0] + u, v]), `${race}: its gate clear at ${u}, ${v}`);
                }
            }
            assert.ok(court.filter((cell) => reached.has(cell)).length >= court.length * 0.98, `${race}: ${court.filter((cell) => reached.has(cell)).length} of ${court.length} reached`);
            assert.equal(court.filter((cell) => shut.has(cell)).length, 0, `${race}: none with its gate shut`);
        }
    });

    it("are set down in the world so, whichever way they're turned: their walls and towers blocked, their courtyards open ground reached from outside their gates; the lizard folk's none but the way to its keep", () => {
        const found = [];

        // (Seed 1's at many turns, the cat folk's at a slant of no eighth; in seed 2 the dark
        // elves' has no room where it's planned. The humans' are hill citadels, setpieces/citadel.js)
        for (const seed of [1, 2]) {
            const world = buildWorld({ seed });
            const squares = squaresOf(world.maps.town);

            for (const site of world.plan.sites.filter((each) => each.kind === "castle" && each.race !== "human")) {
                world.maps.town.sites.heartOf(site);

                const set = world.maps.town.sites.set.get(site.id);

                // (Unless there's no room for it where it's planned)
                if (!set) {
                    continue;
                }

                // (The lizard folk's: none but the way to its keep, where it reaches onto its lot)
                if (!LAID.includes(site.race)) {
                    const way = new Set(set.entrance.clear.map(([i, j]) => j * WORLD_SIZE + i));

                    assert.ok([...set.courts].every((k) => way.has(k)), site.race);
                    continue;
                }

                found.push(`${site.race} ${seed}`);

                const courts = [...set.courts].map((k) => [k % WORLD_SIZE, Math.floor(k / WORLD_SIZE)]);
                const r = Math.ceil(Math.hypot(set.w, set.h) * 2) + 2;
                const [hx, hy] = [Math.floor(set.x), Math.floor(set.y)];
                const out = [Math.floor(set.x + Math.sin(set.facing) * (set.h * 2 + 3)), Math.floor(set.y + Math.cos(set.facing) * (set.h * 2 + 3))];
                const seen = new Set([String(out)]);
                const queue = [out];

                while (queue.length) {
                    const [i, j] = queue.shift();

                    for (const next of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) {
                        if (Math.abs(next[0] - hx) <= r && Math.abs(next[1] - hy) <= r && !seen.has(String(next)) && !squares.blocked(...next)) {
                            seen.add(String(next));
                            queue.push(next);
                        }
                    }
                }

                const ground = GROUNDS[site.race];
                const reached = courts.filter((at) => seen.has(String(at))).length;

                assert.ok(courts.length > 200 && set.squares.size > 100, `${site.race} ${seed}: ${courts.length} in its courtyard, ${set.squares.size} blocked`);
                assert.ok(reached >= courts.length * 0.98, `${site.race} ${seed}: ${reached} of ${courts.length} reached`);
                assert.ok(courts.every(([i, j]) => world.maps.town.sites.courtAt(i, j) === ground && squares.ground(i, j) === ground), `${site.race} ${seed}`);
            }
        }

        assert.deepEqual(found.sort(), ["cat 1", "cat 2", "darkElf 1", "elf 1", "elf 2", "orc 1", "orc 2"]);
    });

    it("their keeps are gone into from their courtyards (the elves' tower at the back, the orcs' longhouse, the cat folk's tower house, the dark elves' Black Tower up the stairs on its terrace) or the end of the causeway (the lizard folk's palace on its platform): the great hall, their lord or lady on the throne, their folk there, their realm the nearest of their people's towns", () => {
        const world = buildWorld({ seed: 1 });
        const host = new Host(world, { populate: false });

        host.join({ id: HOST_PLAYER, hero: { name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false } });
        host.populate();
        Object.assign(host.battle.actor("orc"), { dead: true, respawnAt: Infinity });

        const me = host.battle.actor(HOST_PLAYER);

        for (const race of KEEPS) {
            const site = world.plan.sites.find((each) => each.kind === "castle" && each.race === race);

            world.maps.town.sites.heartOf(site);

            const set = world.maps.town.sites.set.get(site.id);
            const keep = world.interiors.buildings.get(`site:${site.id}`);
            const out = [Math.floor(set.x + Math.sin(set.facing) * (set.h * 2 + 3)), Math.floor(set.y + Math.cos(set.facing) * (set.h * 2 + 3))];
            const ground = GROUNDS[race];

            assert.equal(keep.kind, "keep", race);
            assert.equal(keep.people, race);

            if (LAID.includes(race)) {
                assert.ok(set.courts.has(set.entrance.outside[1] * WORLD_SIZE + set.entrance.outside[0]), `${race}: its door's in its courtyard`);
                assert.ok(set.entrance.clear.every(([i, j]) => world.maps.town.sites.courtAt(i, j) === ground), `${race}: its way in's the courtyard's ground, nothing grown in it`);
            }

            Object.assign(me, { hp: 1e6, maxHp: 1e6, map: "town", square: out, x: out[0] + 0.5, y: out[1] + 0.5, path: [], order: null, target: null, spawn: out });
            assert.equal(host.command(HOST_PLAYER, { type: "enter", link: keep.door.id }).ok, true, race);

            for (let t = 0; t < 60000 && me.map === "town"; t += STEP_MS) {
                host.advance(STEP_MS);
            }

            const post = host.postOf(`${keep.key}/ruler`);
            const nearest = world.plan.places.filter((place) => place.race === race && host.war.town(place.id)).sort((a, b) => Math.hypot(a.at[0] - keep.at[0], a.at[1] - keep.at[1]) - Math.hypot(b.at[0] - keep.at[0], b.at[1] - keep.at[1]))[0];

            assert.equal(me.map, keep.maps[0], race);
            assert.ok(host.open.get(keep.key)?.includes(`${keep.key}/ruler`), JSON.stringify(host.open.get(keep.key)));
            assert.match(host.folk.get(`${keep.key}/ruler`).title, new RegExp(`^(Lord|Lady) of ${keep.name}$`));
            assert.equal(post?.town, nearest.id, race);
        }
    });
});
