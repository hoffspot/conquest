// The work a world's steps do, held to a budget (generated/multiplayer_scaling_plan.md 0-5): ten
// seconds of a world with 50 players spread over it, each in a settlement of their own, played
// with nothing drawn, nothing sent and nothing made ahead, and the work each pass did counted
// (client/js/core/probe.js). Counts, not times: the same on any machine, however busy, so they can
// be held here, among the unit tests, where times can't.
//
// What's counted is how many of the world's things each pass measured against how many players.
// Every such pass measured everything against everyone, and each budget below began as what that
// cost at 50 (counted on 12 November 2026: 100,000 pairs of players, 399,550 buildings, 325,000
// things to find, 134,000 towns and works, 48,450 peopled settlements, 5,300 of the wild, the
// battle's index made 200 times over 316,274 actors), with room for the world to change a little.
// (Since 1-10 the battle's index is brought up to date in place, and made afresh only as someone
// comes into the battle or leaves it: 19 times over 28,671 actors.) (Since 1-19 whoever asks after the
// players near it asks that index: 7,550 players measured, where it was 3,825,888.) As each pass is put on a grid (Stage
// 1: 1-7 to 1-11), its count falls to what's near each player, and its budget here is brought
// down to hold it there: a pass that goes back to measuring everyone fails this, on any machine.
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { Host, RELEVANCE } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { install, Probes, uninstall } from "../client/js/core/probe.js";
import { layoutOf } from "../scripts/load.js";

const PLAYERS = 50;
const SECONDS = 10;
const STEPS = (SECONDS * 1000) / STEP_MS;

// How often the passes that measure the world against its players run in that long
const LOOKS = (SECONDS * 1000) / RELEVANCE.every;

/**
 * The most each pass may count in those ten seconds: [counter, the most, what it's a count of].
 * A budget is brought down, never up, unless the world itself has grown (more settlements, more
 * of the wild): then say so where it's changed.
 */
const BUDGETS = [
    // (Each player against those in the cells round them, each time they're grouped: 40
    // groupings of 50 standing apart. It was every player against every player, 100,000)
    ["groups.pairs", 2_800, "pairs of players measured as they're grouped"],
    // (Each made building's door against the players in the cells round it, each look, since
    // 1-9: it was every building against every player, 399,550)
    ["lookAround.pairs", 9_500, "buildings measured against players' places"],
    // (What's to be found in the cells within a kilometre of each player out in the world, since
    // 1-9: it was everything to be found in the world for each, 325,000)
    ["spotting.pairs", 55_000, "things to be found gone through for players"],
    // (Each town and works against the players in the cells round it, since 1-9: it was every
    // one against every player, 134,000)
    ["muster.pairs", 1_900, "towns and works measured against players' places"],
    // (Each settlement whose folk are out, and each a player might be near, against the players
    // in the cells round it, since 1-9: it was every one out against every player, 48,450)
    ["townsfolk.pairs", 1_800, "peopled settlements measured against players' places"],
    // (Each creature of the wild against the players in the cells round it, since 1-8: it was
    // every creature against every player, 5,300)
    ["wilds.pairs", 150, "the wild's creatures measured against players' places"],
    // (The wild's creatures gone through for the packs' members, once a look for all the packs
    // since the rest of 1-8: it was once a look for each pack, 219 with the two packs there are
    // here, and grows as packs times creatures where this grows as creatures)
    ["packs.wild", 170, "the wild's creatures gone through for the packs' members"],
    // (The battle's index of where everyone stands made afresh, and over how many: since 1-10
    // only as someone's added or taken out, those who've changed cell moved between cells the
    // rest of the time. It was 200 times, once a step, over 316,274)
    ["battle.indexed", 26, "times the battle's index was made afresh"],
    ["battle.indexedActors", 40_000, "actors gone through making it"],
    // (The players measured for whoever asks after those near it: a soldier set on no one, the
    // folk resting and beckoning, a way to be found. Since 1-19 those the index has within
    // reach, about one for every eight askings with the players standing apart; it was every
    // player in the battle for each asking, 3,825,888)
    ["battle.playerPairs", 10_000, "players measured for whoever asks after those near it"],
];

describe("the work of a world's steps, by count (core/probe.js), at 50 players spread", () => {
    let counts;
    let host;

    before(() => {
        const world = buildWorld({ seed: 2 });
        const homes = layoutOf(world.plan, PLAYERS, "spread");
        let random = 50;
        const roll = () => ((random = (Math.imul(random, 1103515245) + 12345) >>> 0) / 2 ** 32 - 0.5) * 2;

        host = new Host(world, { populate: false, rules: { rest: "everyone" } });
        homes.forEach(({ race, at }, k) => host.join({ id: `p${k + 1}`, hero: { name: `P${k + 1}`, race, shape: {}, look: {}, weapon: "sword", boots: false }, square: at, map: "town" }));
        host.populate();

        let ticks = 0;
        const probes = install(new Probes({ clock: () => ticks++ }));

        try {
            for (let step = 0; step < STEPS; step++) {
                // (Everyone sent somewhere near every five seconds, as a walking player is)
                if (step % 100 === 0) {
                    homes.forEach(({ at }, k) => host.command(`p${k + 1}`, { type: "move", to: [Math.round(at[0] + roll() * 40), Math.round(at[1] + roll() * 40)] }));
                }

                host.advance(STEP_MS);
            }
        } finally {
            uninstall();
        }

        counts = probes.toJSON().counts;
    });

    it("played the steps asked for, with everyone in and standing apart", () => {
        assert.equal(counts.steps, STEPS);
        assert.equal(host.players.size, PLAYERS);
        assert.equal(host.battle.actors.filter(({ kind, dead }) => kind === "player" && !dead).length, PLAYERS);
    });

    it("measures each thing against the players near it, not against everyone: far fewer than the products they were", () => {
        // (Each look, every town and works was measured against every player's place; since 1-9
        // against those in the cells round it, and standing apart, in a settlement each, that's
        // about the one player there)
        const everyone = LOOKS * (host.war.towns.length + host.war.works.length) * PLAYERS;

        assert.equal(everyone, 134_000, "(what it was)");
        assert.ok(counts["muster.pairs"] < everyone / 50, `${counts["muster.pairs"]} of ${everyone}`);
        // (Since 1-7 a grouping measures each player against those in the cells round them:
        // standing apart, against themselves alone, where it was all 50 against all 50)
        assert.equal(counts["groups.pairs"], counts["groups.calls"] * PLAYERS);
    });

    for (const [counter, most, what] of BUDGETS) {
        it(`${counter} within its budget of ${most.toLocaleString("en")} (${what})`, () => {
            const counted = counts[counter] ?? 0;

            assert.ok(counted > 0, `${counter} wasn't counted at all: is its pass still probed?`);
            assert.ok(counted <= most, `${counter} came to ${counted.toLocaleString("en")}, over its budget of ${most.toLocaleString("en")}: ${what}`);
        });
    }

    it("holds every budget near what's counted, so a pass that gets cheaper has its budget brought down with it", () => {
        // (A budget more than half as much again as what's counted holds nothing)
        const slack = BUDGETS.filter(([counter, most]) => most > (counts[counter] ?? 0) * 1.5).map(([counter, most]) => `${counter}: ${(counts[counter] ?? 0).toLocaleString("en")} counted, ${most.toLocaleString("en")} allowed`);

        assert.deepEqual(slack, []);
    });
});
