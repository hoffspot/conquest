// Everyone leaving at once (generated/multiplayer_scaling_plan.md 1-27): the look round after
// the players of a hundred towns have gone lets every town's folk, townsfolk and soldiers go in
// the one step, and each one taken out of the battle (client/js/core/battle.js remove) was
// forgotten by going through everyone still in it, and found by id in a list made again of
// everyone: 2,800 let go were most of a second. They're let go as they were, the same ones in
// the same order in the same step; everyone by id is brought up to date in place, and those let
// go together are forgotten in one going through (removeAll, forget; core/host.js #lookAround,
// #townsfolk, #dismiss). What's checked here is that the battle and the world are the same step
// for step either way (Battle.forgetting), and how many goings through each takes: counts, never
// times. (What's the authority's own, the ground and its navigation, is let go a little each
// look: test/letting-go.test.js.)
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { before, describe, it } from "node:test";
import { Battle, STEP_MS } from "../client/js/core/battle.js";
import { nearestFree, squaresOf } from "../client/js/core/grid.js";
import { Host } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { install, Probes, uninstall } from "../client/js/core/probe.js";
import { encode } from "../client/js/core/wire.js";
import { lookIn } from "./helpers.js";

const HERO = Object.freeze({ name: "Ada", race: "human", shape: {}, look: {}, weapon: "sword", boots: false });
const KEPT = ["foes", "seeing", "spared", "struckBy", "enmity"];

// `play` with the battle forgetting as it was (Battle.forgetting false), or as it does now
function asItWas(was, play) {
    Battle.forgetting = !was;

    try {
        return play();
    } finally {
        Battle.forgetting = true;
    }
}

// `play` with the probes' counters counting: [what it returned, the counts]
function counted(play) {
    let ticks = 0;
    const probes = install(new Probes({ clock: () => ticks++ }));

    try {
        return [play(), probes.toJSON().counts];
    } finally {
        uninstall();
    }
}

const hashOf = (battle) => createHash("sha1").update(encode(battle.snapshot())).digest("hex");

describe("characters taken out of a battle together (core/battle.js remove, removeAll, forget)", () => {
    let world;

    before(() => {
        world = buildWorld({ seed: 2 });
    });

    // Two lines of soldiers of every weapon set on each other on open ground till blows have been
    // struck and something's in the air; then every other one of them taken out by `take(battle,
    // ids)`, and the fight played on: the battle hashed as they went and after every step since
    function fight(take) {
        const host = new Host(world, { populate: false });

        host.join({ id: "p1", hero: HERO });

        const battle = host.battle;
        const squares = squaresOf(battle.maps.town);
        const me = battle.actor("p1");
        const open = (x0, y0) => {
            for (let y = y0 - 50; y < y0 + 10; y++) {
                for (let x = x0 - 16; x < x0 + 16; x++) {
                    if (squares.blocked(x, y) || squares.opaque(x, y)) {
                        return false;
                    }
                }
            }

            return true;
        };
        let at = null;

        for (let r = 60; r < 1500 && !at; r += 20) {
            for (let a = 0; a < 8 && !at; a++) {
                const [x, y] = [Math.round(me.x + r * [1, 1, 0, -1, -1, -1, 0, 1][a]), Math.round(me.y + r * [0, 1, 1, 1, 0, -1, -1, -1][a])];

                at = open(x, y) ? [x, y] : null;
            }
        }

        assert.ok(at, "(open ground)");
        battle.place("p1", "town", at, { facing: 0 });

        const weapons = ["sword", "bow", "hammer", "staff", "gauntlets", "cleaver", "wand"];

        for (const [team, from, to] of [
            ["a", -4, -40],
            ["b", -40, -4],
        ]) {
            for (let k = 0; k < 24; k++) {
                const x = Math.floor(me.x - 12 + (k % 12) * 2);

                battle.add({ id: `${team}-${k}`, kind: "soldier", team, weapon: weapons[(k + (team === "b")) % weapons.length], square: [x, Math.floor(me.y + from - Math.floor(k / 12) * 2)], ai: "patrol", patrol: [[x, Math.floor(me.y + to)]], leash: 60, armed: k % 2 === 0 });
            }
        }

        let steps = 0;

        // (Ten seconds of it, and then on till something's in the air from or at one who'll go)
        const going = new Set(battle.actors.filter(({ id }) => id !== "p1" && Number(id.slice(2)) % 2 === 0).map(({ id }) => id));
        const aloft = () => battle.projectiles.some(({ from, target }) => going.has(from) || going.has(target));

        while (steps < 10000 / STEP_MS || (!aloft() && steps < 30000 / STEP_MS)) {
            host.advance(STEP_MS);
            steps++;
        }

        // (And the player, who stays, has seen one who's going, spared another, is talking to a
        // third and was told to go up to a fourth: what a fight alone doesn't leave)
        const some = battle.actors.filter(({ id }) => going.has(id)).map(({ id }) => id);

        Object.assign(battle.actor("p1"), { talkingTo: some[0], order: { type: "approach", target: some[1] } });
        battle.actor("p1").seeing[some[2]] = battle.time;
        battle.actor("p1").spared[some[3]] = battle.time;

        // (Who of those staying is after one who's going, and what they keep of them, by kind)
        const staying = battle.actors.filter(({ id }) => !going.has(id));
        const held = {
            target: staying.filter(({ target }) => going.has(target)).length,
            attack: staying.filter(({ attack }) => going.has(attack?.target)).length,
            order: staying.filter(({ order }) => going.has(order?.target)).length,
            ...Object.fromEntries(KEPT.map((key) => [key, staying.reduce((sum, actor) => sum + Object.keys(actor[key] ?? {}).filter((id) => going.has(id)).length, 0)])),
            projectiles: battle.projectiles.filter(({ from, target }) => going.has(from) || going.has(target)).length,
        };
        const ids = battle.actors.filter(({ id }) => going.has(id)).map(({ id }) => id);
        const [there, counts] = counted(() => take(battle, ids));
        const hashes = [hashOf(battle)];
        const left = {
            order: battle.actors.map(({ id }) => id),
            refs: battle.actors.filter(({ target, attack, order, talkingTo }) => [target, attack?.target, order?.target, talkingTo].some((id) => going.has(id))).length + battle.actors.reduce((sum, actor) => sum + KEPT.reduce((kept, key) => kept + Object.keys(actor[key] ?? {}).filter((id) => going.has(id)).length, 0), 0) + battle.projectiles.filter(({ from, target }) => going.has(from) || going.has(target)).length,
            found: ids.filter((id) => battle.actor(id)).length,
        };

        for (let k = 0; k < 10000 / STEP_MS; k++) {
            host.advance(STEP_MS);
            hashes.push(hashOf(battle));
        }

        return { steps, ids, held, there, counts, hashes, left, events: encode(host.events ?? []), sum: host.checksum() };
    }

    it("leaves the battle exactly as taking each out in turn did, whoever was after them or remembered them, and plays on the same step for step", () => {
        const was = asItWas(true, () => fight((battle, ids) => ids.map((id) => battle.remove(id)).filter(Boolean).length));
        const one = fight((battle, ids) => ids.map((id) => battle.remove(id)).filter(Boolean).length);
        const all = fight((battle, ids) => battle.removeAll(ids));
        const later = fight((battle, ids) => {
            const gone = [];
            const there = ids.map((id) => battle.remove(id, gone)).filter(Boolean).length;

            assert.deepEqual(gone, ids, "each put in the list given");
            assert.ok(ids.every((id) => battle.actor(id) === null), "gone from the battle at once");
            battle.forget(gone);
            assert.deepEqual(gone, [], "and the list emptied once they're forgotten");

            return there;
        });

        // (There was something to forget: those staying were after those going, had fought them,
        // seen them, been struck by them and bore them enmity, and something was in the air)
        assert.equal(was.ids.length, 24);
        assert.ok(was.held.target > 0 && was.held.order > 0 && was.held.foes > 0 && was.held.seeing > 0 && was.held.spared > 0 && was.held.struckBy > 0 && was.held.enmity > 0 && was.held.projectiles > 0, JSON.stringify(was.held));

        for (const [name, now] of Object.entries({ one, all, later })) {
            assert.equal(now.steps, was.steps, name);
            assert.deepEqual(now.held, was.held, name);
            assert.equal(now.there, 24, name);
            assert.deepEqual(now.left, { ...was.left, refs: 0, found: 0 }, name);
            assert.deepEqual(now.hashes, was.hashes, `${name}: the same battle as they went and after every step since`);
            assert.equal(now.sum, was.sum, name);
        }

        assert.equal(was.left.refs, 0);
        assert.equal(was.hashes.length, 10000 / STEP_MS + 1);
        assert.ok(new Set(was.hashes).size > 100, "(and it went on changing)");

        // (How many times everyone still in was gone through: once for each as it was, and one
        // by one; once for them all, taken out together)
        assert.deepEqual([was.counts["battle.removed"], was.counts["battle.forgets"]], [24, 24]);
        assert.deepEqual([one.counts["battle.removed"], one.counts["battle.forgets"]], [24, 24]);
        assert.deepEqual([all.counts["battle.removed"], all.counts["battle.forgets"]], [24, 1]);
        assert.deepEqual([later.counts["battle.removed"], later.counts["battle.forgets"]], [24, 1]);
    });

    it("finds everyone by id as they come and go, two of one id among them, as making the list of everyone again does", () => {
        const play = () => {
            const host = new Host(world, { populate: false });

            host.join({ id: "p1", hero: HERO });

            const battle = host.battle;
            const me = battle.actor("p1");
            const soldier = (id, dx) => ({ id, kind: "soldier", team: "a", weapon: "sword", square: [me.square[0] + dx, me.square[1]], ai: "patrol", patrol: [[me.square[0] + dx, me.square[1]]] });
            const found = [];
            const note = () => found.push(["p1", "x", "y", "z"].map((id) => (battle.actor(id) ? battle.actors.indexOf(battle.actor(id)) : -1)));

            note();
            battle.add(soldier("x", 2));
            note();
            battle.add(soldier("y", 3));
            battle.add(soldier("z", 4));
            note();
            assert.equal(battle.remove("y"), true);
            assert.equal(battle.remove("y"), false);
            note();
            // (Two of one id: the later is the one found, and with it taken out, the other)
            battle.add(soldier("x", 5));
            note();
            assert.equal(battle.removeAll(["x", "nobody"]), 1);
            note();
            battle.add(soldier("y", 6));
            assert.equal(battle.removeAll(["x", "z"]), 2);
            note();
            assert.equal(battle.removeAll([]), 0);
            battle.forget([]);
            note();

            return { found, order: battle.actors.map(({ id }) => id), hash: hashOf(battle) };
        };
        const [now, was] = [play(), asItWas(true, play)];

        assert.deepEqual(now, was);
        assert.deepEqual(now.order, ["p1", "y"]);
        assert.deepEqual(now.found[4], [0, 3, -1, 2], "the later of two of an id found");
        assert.deepEqual(now.found[5], [0, 1, -1, 2], "and the other once it's gone");
    });
});

describe("players leaving their towns together (core/host.js #lookAround, #townsfolk, #dismiss)", () => {
    // Three players each in the middle of a town of their own (seed 2's first three towns and
    // cities), played till its buildings are open and its soldiers and townsfolk out; then two
    // leave in the one step, the third walking on, and one of them comes back: every step's
    // events and the world's sum after it, and what the look round after they went let go
    function leaving() {
        const world = buildWorld({ seed: 2 });
        const overworld = world.maps.town;
        const host = new Host(world, { populate: false });
        const towns = world.plan.places.filter(({ kind, race }) => ["city", "town"].includes(kind) && race === "human").slice(0, 3);
        const middle = (place) => nearestFree(squaresOf(overworld), [Math.round(place.at[0]), Math.round(place.at[1])], { within: 40 });
        const played = [];
        const play = (steps) => {
            for (let k = 0; k < steps; k++) {
                const [events, counts] = counted(() => host.advance(STEP_MS));

                played.push({ events, sum: host.checksum(), counts, actors: host.battle.actors.length });
            }
        };

        assert.equal(towns.length, 3);
        towns.forEach((place, k) => host.join({ id: `p${k + 1}`, hero: HERO, square: middle(place), map: "town" }));
        host.populate();
        play(12);

        // (Each told to go into the buildings round them and to stop: their folk in the battle,
        // as every building's near a player were before they were made only as one's told to go
        // in, core/host.js Host.peopling, plan 1-23)
        lookIn(host);
        play(12);

        const before = { actors: host.battle.actors.length, open: host.open.size, mustered: host.mustered.size, townsfolk: host.townsfolk.size, step: played.length };

        host.battle.command("p1", { type: "move", to: [host.battle.actor("p1").square[0] + 12, host.battle.actor("p1").square[1]] });
        host.leave("p2");
        host.leave("p3");
        play(24);

        const after = { actors: host.battle.actors.length, open: host.open.size, mustered: host.mustered.size, townsfolk: host.townsfolk.size, step: played.length };

        // (And one back to where they were: its buildings open again, the same folk in them)
        host.join({ id: "p2", hero: HERO, square: middle(towns[1]), map: "town" });
        play(12);
        lookIn(host, ["p2"]);
        play(12);

        return { host, towns, played, before, after, snapshot: encode(host.snapshot()) };
    }

    it("lets every building's folk, the townsfolk and the soldiers of the towns they left go in the one look, as it did, and the world's the same after every step", () => {
        const [now, was] = [leaving(), asItWas(true, leaving)];

        assert.deepEqual(now.before, was.before);
        assert.deepEqual(now.after, was.after);
        assert.deepEqual(now.played.map(({ sum }) => sum), was.played.map(({ sum }) => sum), "the world's sum after every step");
        assert.equal(encode(now.played.map(({ events }) => events)), encode(was.played.map(({ events }) => events)), "and every step's events");
        assert.deepEqual(now.played.map(({ actors }) => actors), was.played.map(({ actors }) => actors));
        assert.equal(now.snapshot, was.snapshot);

        // (Three towns out; then one's)
        assert.deepEqual([now.before.mustered, now.before.townsfolk], [3, 3]);
        assert.ok(now.before.open > 10, `${now.before.open} buildings open`);
        assert.deepEqual([now.after.mustered, now.after.townsfolk], [1, 1]);
        assert.ok(now.after.open > 0 && now.after.open < now.before.open);

        // (The one look that let them go: the first step after they went with anything closed.
        // All of it in that step: every building of the two towns, both towns' townsfolk home,
        // both towns' soldiers dismissed)
        const gone = now.played.slice(now.before.step, now.after.step);
        const look = gone.findIndex(({ events }) => events.some(({ type }) => type === "close"));
        const typesOf = ({ events }) => ["close", "dismiss", "townsfolk"].map((type) => events.filter((event) => event.type === type && (type !== "townsfolk" || event.change === "home")).length);
        const [closed, dismissed, home] = typesOf(gone[look]);
        const let_ = gone[look].events.filter(({ type, change }) => type === "close" || type === "dismiss" || (type === "townsfolk" && change === "home")).reduce((sum, event) => sum + (event.folk ?? event.ids).length, 0);

        assert.ok(look >= 0 && look < 10, "within the half second a look round comes by");
        assert.equal(closed, now.before.open - now.after.open);
        assert.deepEqual([dismissed, home], [2, 2]);
        assert.ok(gone.every((step, k) => k === look || typesOf(step).every((n) => n === 0)), "and in no other step");
        assert.ok(let_ > 50, `${let_} let go`);
        assert.ok(now.before.actors - gone[look].actors >= let_, "all out of the battle in that step");

        // (How many times the battle was gone through to forget them in that step: once for
        // every one of them as it was; now once for all the buildings' folk, once for all the
        // townsfolk, and once for each town's soldiers)
        const [nowLook, wasLook] = [gone[look].counts, was.played[now.before.step + look].counts];

        assert.equal(wasLook["battle.removed"], nowLook["battle.removed"]);
        assert.ok(nowLook["battle.removed"] >= let_);
        assert.equal(wasLook["battle.forgets"], wasLook["battle.removed"]);
        assert.ok(nowLook["battle.forgets"] <= 4 + (nowLook["battle.removed"] - let_), `${nowLook["battle.forgets"]} goings through for ${nowLook["battle.removed"]} let go`);
    });
});
