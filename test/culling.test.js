// What's near the players looked for by cell (client/js/core/near.js; core/host.js Host.culling;
// generated/multiplayer_scaling_plan.md 1-7 to 1-9): the grid only leaves out those too far off
// to pass the test that was always made, so every answer is the one going through everyone gave,
// and a world of 25 players, in fours, with fights among them, plays out the same step for step
// either way, and the same again carried on from a snapshot.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { nearestFree, squaresOf } from "../client/js/core/grid.js";
import { clearOfSettlements } from "../client/js/core/creatures.js";
import { Host } from "../client/js/core/host.js";
import { Culling, Near } from "../client/js/core/near.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { createRandom } from "../client/js/core/random.js";
import { groupsOf, STRENGTH } from "../client/js/core/strength.js";
import { decode, encode } from "../client/js/core/wire.js";
import { SETTLEMENTS } from "../client/js/core/worldplan/plan.js";
import { layoutOf } from "../scripts/load.js";

// With the grid off (everyone gone through, as it was), what `look` gives
function throughEveryone(look) {
    Culling.on = false;

    try {
        return look();
    } finally {
        Culling.on = true;
    }
}

// The players' groups as they were made before the grid: every member against every player
function groupsOfOld(players, apart = STRENGTH.apart) {
    const groups = [];
    const placed = new Set();

    for (const first of players) {
        if (placed.has(first.id)) {
            continue;
        }

        const group = [first];

        placed.add(first.id);

        for (let k = 0; k < group.length; k++) {
            for (const other of players) {
                const [dx, dy] = [other.x - group[k].x, other.y - group[k].y];
                const near = other.map === group[k].map && dx * dx + dy * dy <= apart * apart;

                if (!placed.has(other.id) && near) {
                    placed.add(other.id);
                    group.push(other);
                }
            }
        }

        groups.push(group.sort((a, b) => players.indexOf(a) - players.indexOf(b)));
    }

    return groups;
}

describe("who's near, by cell (core/near.js)", () => {
    it("answers as going through everyone does, for any points, cell and reach, the far side of zero too", () => {
        const random = createRandom(5);
        const roll = (most) => (random.next() - 0.5) * 2 * most;

        for (let round = 0; round < 200; round++) {
            const points = Array.from({ length: Math.floor(random.next() * 60) }, () => [roll(900), roll(900)]);
            const near = new Near(points, [8, 64, 512][round % 3]);
            const [x, y, reach] = [roll(900), roll(900), [0, 5, 64, 300, 2000, Infinity][round % 6]];
            const test = ([px, py]) => Math.hypot(px - x, py - y) <= reach;
            const all = points.map((point, k) => k).filter((k) => test(points[k]));

            assert.deepEqual(near.within(x, y, reach).filter((k) => test(points[k])), all, "those within, in the points' order");
            assert.equal(near.some(x, y, reach, test), all.length > 0);
            assert.deepEqual(throughEveryone(() => near.within(x, y, reach)), points.map((point, k) => k));
            assert.equal(throughEveryone(() => near.some(x, y, reach, test)), all.length > 0);
        }

        // (A point right on a cell's edge, and one exactly `reach` off)
        const edge = new Near([[64, 64], [0, 0], [128, 0]], 64);

        assert.deepEqual(edge.within(64, 0, 64), [0, 1, 2]);
        assert.equal(edge.some(64, 0, 64, ([px, py]) => Math.hypot(px - 64, py) <= 64), true);
        assert.equal(new Near([], 64).some(0, 0, 100, () => true), false);
    });

    it("measures few: one of fifty apart is measured against itself alone", () => {
        const points = Array.from({ length: 50 }, (each, k) => [k * 400, (k % 7) * 400]);
        const near = new Near(points, 64);
        let made = 0;

        near.some(points[20][0], points[20][1], 60, () => (made++, false));
        assert.equal(made, 1);
        assert.deepEqual(near.within(points[20][0], points[20][1], 60), [20]);
    });
});

describe("the players in groups, each measured against those near (core/strength.js groupsOf)", () => {
    it("groups them exactly as measuring each against everyone did: any scatter, chains, several maps, and right at the reach", () => {
        const random = createRandom(9);

        for (let round = 0; round < 300; round++) {
            const count = Math.floor(random.next() * 40);
            const spread = [30, 150, 600, 4000][round % 4];
            const players = Array.from({ length: count }, (each, k) => ({ id: `p${k}`, map: random.next() < 0.8 ? "town" : `in-${Math.floor(random.next() * 3)}`, x: Math.round((random.next() - 0.5) * spread * 4) / 4, y: Math.round((random.next() - 0.5) * spread * 4) / 4 }));
            const apart = round % 5 === 0 ? 40 : STRENGTH.apart;
            const ids = (groups) => groups.map((group) => group.map(({ id }) => id));
            const old = ids(groupsOfOld(players, apart));

            assert.deepEqual(ids(groupsOf(players, apart)), old);
            assert.deepEqual(ids(throughEveryone(() => groupsOf(players, apart))), old);
        }

        // (A chain, each exactly the reach from the next: one group; a hair further, not)
        const chain = (step) => Array.from({ length: 12 }, (each, k) => ({ id: `c${k}`, map: "town", x: k * step, y: 0 }));

        assert.deepEqual(groupsOf(chain(STRENGTH.apart)).map((group) => group.length), [12]);
        assert.deepEqual(groupsOf(chain(STRENGTH.apart + 0.001)).map((group) => group.length), Array(12).fill(1));
    });

    it("measures each against those in the cells round them: 50 apart, 50 measurings where there were 2,500", () => {
        const players = Array.from({ length: 50 }, (each, k) => ({ id: `p${k}`, map: "town", x: k * 400, y: (k % 7) * 400 }));
        const tally = { pairs: 0 };

        assert.equal(groupsOf(players, STRENGTH.apart, tally).length, 50);
        assert.equal(tally.pairs, 50);
    });
});

describe("clear of every settlement, measured against those near (core/creatures.js clearOfSettlements)", () => {
    it("answers as measuring against every settlement of the plan did, anywhere in two worlds and right at a town's edge", () => {
        for (const seed of [2, 7]) {
            const { plan } = buildWorld({ seed });
            const random = createRandom(seed);
            const old = ([x, y], beyond) => plan.places.every((place) => Math.hypot(x - place.at[0], y - place.at[1]) > (SETTLEMENTS[place.kind]?.radius ?? 40) + beyond);
            let [clear, not] = [0, 0];

            for (let round = 0; round < 4000; round++) {
                const place = plan.places[Math.floor(random.next() * plan.places.length)];
                const beyond = [0, 30, 60, 140, 400][round % 5];
                const edge = (SETTLEMENTS[place.kind]?.radius ?? 40) + beyond;
                // (Anywhere; or just inside or outside a settlement's edge, or exactly on it)
                const at = round % 3 === 0 ? [random.next() * 8192, random.next() * 8192] : [place.at[0] + edge + [-0.001, 0, 0.001, 5][round % 4], place.at[1]];
                const was = old(at, beyond);

                assert.equal(clearOfSettlements(plan, at, beyond), was, `${at}, ${beyond} m beyond`);
                assert.equal(throughEveryone(() => clearOfSettlements(plan, at, beyond)), was);
                was ? clear++ : not++;
            }

            assert.ok(clear > 500 && not > 500, `(${clear} clear, ${not} not)`);
        }

        // (A plan whose places are others: looked over afresh)
        const plan = { places: [{ kind: "village", at: [100, 100] }] };

        assert.equal(clearOfSettlements(plan, [100, 100], 0), false);
        plan.places = [{ kind: "village", at: [5000, 5000] }];
        assert.equal(clearOfSettlements(plan, [100, 100], 0), true);
        plan.places.push({ kind: "city", at: [150, 100] });
        assert.equal(clearOfSettlements(plan, [100, 100], 0), false);
    });
});

describe("a world of 25 players in fours, with fights, by cell and through everyone (Host.culling)", () => {
    const PLAYERS = 25;
    const STEPS = 1200;

    // The world (seed 2), its 25 players four to a town and all its owners (so the fights are
    // theirs to begin)
    const begin = () => {
        const world = buildWorld({ seed: 2 });
        const homes = layoutOf(world.plan, PLAYERS, "towns");
        const host = new Host(world, { populate: false, rules: { rest: "everyone", debug: "owner" } });

        // (One in four out in the wilds, 300 m from their town, where the wild comes out about them)
        const out = homes.map(({ race, at }, k) => ({ race, at: k % 4 === 3 ? nearestFree(squaresOf(world.maps.town), [Math.round(at[0] - 300), Math.round(at[1])], { within: 60 }) : at }));

        out.forEach(({ race, at }, k) => host.join({ id: `p${k + 1}`, hero: { name: `P${k + 1}`, race, shape: {}, look: {}, weapon: k % 3 ? "sword" : "bow", boots: false }, square: at, map: "town", role: "owner" }));
        host.populate();

        return { host, homes: out };
    };

    // Played from step `from` to `to`: everyone sent somewhere near every five seconds, five
    // fights of six a side begun ten seconds in, some of the players gone into the fight; each
    // step's events and the world's sum after it
    const play = ({ host, homes }, from, to) => {
        const played = [];

        for (let step = from; step < to; step++) {
            // (The same walks whichever step it's carried on from: the dice are the step's own)
            const random = createRandom(step);

            if (step % 100 === 0) {
                homes.forEach(({ at }, k) => host.command(`p${k + 1}`, { type: "move", to: [Math.round(at[0] + (random.next() - 0.5) * 80), Math.round(at[1] + (random.next() - 0.5) * 80)] }));
            }

            if (step === 200) {
                for (let k = 0; k < PLAYERS; k += 5) {
                    assert.equal(host.command(`p${k + 1}`, { type: "fieldBattle", size: 6, facing: k }).ok, true, "(a fight begun)");
                }
            }

            played.push([encode(host.advance(STEP_MS)), host.checksum()]);
        }

        return played;
    };

    it("plays out the same step for step either way, and carried on from a snapshot at 30 s", () => {
        const culled = begin();
        const first = play(culled, 0, STEPS / 2);
        const kept = encode(culled.host.snapshot());
        const second = play(culled, STEPS / 2, STEPS);

        const everyone = throughEveryone(() => {
            const game = begin();

            return { played: play(game, 0, STEPS), snapshot: encode(game.host.snapshot()) };
        });

        [...first, ...second].forEach((step, k) => assert.deepEqual(step, everyone.played[k], `step ${k}`));
        assert.equal(encode(culled.host.snapshot()), everyone.snapshot);

        // (And there was something to get wrong: groups of several, fights, the wild about)
        const events = [...first, ...second].map(([text]) => text).join("");

        assert.ok(events.includes('"fieldBattle"') && events.includes('"attack"'), "(fights)");
        assert.ok(culled.host.wild.size > 0 && events.includes('"roused"'), "(the wild put out about them)");
        assert.ok(culled.host.mustered.size > 0 && culled.host.townsfolk.size > 0 && culled.host.open.size > 0, "(towns' soldiers and folk out, buildings open)");

        // (Carried on from the snapshot, by cell: the second half again)
        const again = { host: Host.restore(buildWorld({ seed: 2 }), decode(kept)), homes: culled.homes };

        play(again, STEPS / 2, STEPS).forEach((step, k) => assert.deepEqual(step, second[k], `step ${STEPS / 2 + k}, carried on`));
    });
});
