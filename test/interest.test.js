// Who's near where (core/interest.js; the scaling plan's 1-3): the battle's characters kept by
// the 32 m square they stand on, and the motion stream packed from it byte for byte as it was
// packed by going through everyone
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { Host } from "../client/js/core/host.js";
import { INTEREST, Interest, interestOf } from "../client/js/core/interest.js";
import { MOTION, packMotion } from "../client/js/core/motion.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { startFor } from "../client/js/core/worldplan/plan.js";

// The same rolls every time
function roller(seed) {
    let state = seed;

    return () => (state = (Math.imul(state, 1103515245) + 12345) >>> 0) / 2 ** 32;
}

// Someone standing somewhere, with what packing them reads
const someone = (map, x, y) => ({ map, x, y, progress: null, dead: false, pace: 0, facing: 0, attack: null, target: null, order: null, running: false, path: [] });

// Everyone within a reach of a spot, found by going through them all: [[index, apart]], by index
const through = (actors, map, x, y, reach) => actors.flatMap((actor, index) => (actor.map === map && (actor.x - x) ** 2 + (actor.y - y) ** 2 <= reach * reach ? [[index, (actor.x - x) * (actor.x - x) + (actor.y - y) * (actor.y - y)]] : []));

// And by the grid
function asked(interest, map, x, y, reach) {
    const found = [];

    interest.near(map, x, y, reach, (index, apart) => found.push([index, apart]));

    return found.sort((a, b) => a[0] - b[0]);
}

describe("who's near where (core/interest.js)", () => {
    it("finds just those going through everyone finds, on every map, at the squares' edges and either side of nought", () => {
        const roll = roller(7);
        const actors = [];

        for (let k = 0; k < 600; k++) {
            actors.push(someone(["town", "inside:1", "wilds"][k % 3], (roll() - 0.5) * 900, (roll() - 0.5) * 900));
        }

        // (On the squares' edges and corners, and a hair off them)
        for (const x of [-64, -32, 0, 32, 64, 31.999999, -0.000001]) {
            actors.push(someone("town", x, 0), someone("town", 0, x), someone("town", x, x));
        }

        const interest = new Interest();

        interest.refresh(actors);
        assert.equal(interest.size, actors.length);

        for (let k = 0; k < 300; k++) {
            const map = ["town", "inside:1", "wilds", "nowhere"][k % 4];
            const [x, y] = k % 5 === 0 ? [(k % 7) * 32 - 96, (k % 3) * 32 - 32] : [(roll() - 0.5) * 1000, (roll() - 0.5) * 1000];
            const reach = [0, 1, 31.5, 32, 160, 400, 5000, Infinity][k % 8];

            assert.deepEqual(asked(interest, map, x, y, reach), through(actors, map, x, y, reach), `${map} ${x},${y} within ${reach}`);
        }

        // (Standing on someone, within no reach at all: them)
        assert.deepEqual(asked(interest, "town", actors[0].x, actors[0].y, 0), [[0, 0]]);
    });

    it("moves only those who cross into another square or onto another map, takes out those gone, and keeps each one's place in the battle's list", () => {
        const actors = [someone("town", 5, 5), someone("town", 6, 6), someone("town", 100, 5), someone("wilds", 5, 5)];
        const interest = new Interest();

        interest.refresh(actors);
        assert.equal(interest.squares, 3);

        const made = interest.moved;

        // (Within its square: not moved)
        actors[0].x = 31;
        actors[1].y = 0;
        interest.refresh(actors);
        assert.equal(interest.moved, made);
        assert.deepEqual(asked(interest, "town", 31, 5, 1), [[0, 0]]);

        // (Over the edge; and onto another map)
        actors[0].x = 33;
        actors[1].map = "wilds";
        interest.refresh(actors);
        assert.equal(interest.moved, made + 2);
        assert.deepEqual(asked(interest, "town", 0, 0, 40), [[0, 33 * 33 + 25]]);
        assert.deepEqual(asked(interest, "wilds", 0, 0, 40).map(([index]) => index), [1, 3]);
        assert.equal(interest.squares, 3, "the square left empty let go of");

        // (One gone from the list: taken out, and those after it known by their new places)
        actors.splice(1, 1);
        interest.refresh(actors);
        assert.equal(interest.size, 3);
        assert.deepEqual(asked(interest, "wilds", 0, 0, 40).map(([index]) => index), [2]);
        assert.deepEqual(asked(interest, "town", 100, 5, 1).map(([index]) => index), [1]);

        // (Everyone gone: nothing kept)
        interest.refresh([]);
        assert.equal(interest.size, 0);
        assert.equal(interest.squares, 0);
        assert.deepEqual(asked(interest, "town", 0, 0, Infinity), []);
        assert.equal(INTEREST.cell, 32);
    });

    it("packs the motion stream byte for byte as going through everyone does, on a world played with players in two towns", () => {
        const world = buildWorld({ seed: 2 });
        const host = new Host(world, { populate: false });
        const roll = roller(9);
        const homes = ["human", "elf"].map((race, k) => {
            const { at } = startFor(world.plan, race);

            host.join({ id: `p${k + 1}`, hero: { name: `P${k + 1}`, race, shape: {}, look: {}, weapon: "sword", boots: false }, square: [Math.round(at[0]), Math.round(at[1])], map: "town" });

            return at;
        });

        host.populate();

        const same = (options, what) => assert.deepEqual(packMotion(host, options), packMotion(host, { ...options, grid: false }), what);
        let packed = 0;

        for (let k = 0; k < 240; k++) {
            if (k % 20 === 0) {
                homes.forEach(([x, y], n) => host.command(`p${n + 1}`, { type: "move", to: [Math.round(x + (roll() - 0.5) * 60), Math.round(y + (roll() - 0.5) * 60)], run: k % 40 === 0 }));
            }

            host.advance(STEP_MS);

            if (k % MOTION.every === 0) {
                same({}, `step ${k}`);
                same({ most: 1000 }, `step ${k}, everyone near`);
                packed = Math.max(packed, packMotion(host, { most: 1000 }).length / MOTION.size);
            }
        }

        same({ reach: 0 }, "the players alone");
        same({ reach: 40, most: 5 }, "a few");
        same({ reach: 100000, most: 100000 }, "everyone on the players' maps");
        assert.ok(packed > 2, `others than the players were near (${packed})`);
        assert.equal(interestOf(host.battle).size, host.battle.actors.length);
        assert.equal(interestOf(host.battle), interestOf(host.battle), "one grid a battle");
    });

    it("looks at those near the players, not at everyone for each: 100 players spread among 3,500", () => {
        const roll = roller(3);
        const actors = [];
        const players = new Map();

        // (A hundred players over 8 km of land, each with 14 about them; the rest of the 3,500 on
        // maps no player's on, or far from any)
        for (let k = 0; k < 100; k++) {
            const [x, y] = [roll() * 8000, roll() * 8000];

            players.set(`p${k}`, actors.length);
            actors.push(someone("town", x, y));

            for (let n = 0; n < 14; n++) {
                actors.push(someone("town", x + (roll() - 0.5) * 200, y + (roll() - 0.5) * 200));
            }
        }

        while (actors.length < 3500) {
            actors.push(someone(`inside:${actors.length % 400}`, roll() * 300, roll() * 300));
        }

        const host = { battle: { actors, actor: (id) => actors[players.get(id)] }, players };
        const interest = interestOf(host.battle);
        let looked = 0;

        assert.deepEqual(packMotion(host), packMotion(host, { grid: false }));
        assert.deepEqual(packMotion(host, { most: 100000 }), packMotion(host, { most: 100000, grid: false }));

        for (const index of players.values()) {
            looked += interest.near("town", actors[index].x, actors[index].y, MOTION.reach, () => {});
        }

        assert.ok(looked < actors.length, `${looked} looked at for 100 players, where going through everyone looks at ${actors.length * 100}`);
    });
});
