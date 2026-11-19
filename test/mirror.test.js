// The mirror (core/mirror.js; the scaling plan's 3-16): what a game holds of a world it's sent
// views of, built from frames alone and never stepped; and test/replicated.js, which holds a
// mirror for each player to any Host a test plays
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { Battle, STEP_MS } from "../client/js/core/battle.js";
import { TAU } from "../client/js/core/exact.js";
import { Host } from "../client/js/core/host.js";
import { Mirror, Ring, RING, WIRED } from "../client/js/core/mirror.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { encodeFrame, GOING, NONE, originFor, SECTION, VIEW, ViewState, WHO, whoOf } from "../client/js/core/view.js";
import { ENTERS, ViewFeed } from "../client/js/core/viewfeed.js";
import { startFor } from "../client/js/core/worldplan/plan.js";
import { mirrored, mismatches } from "./replicated.js";

const hero = (name, race = "human") => ({ name, race, shape: {}, look: {}, weapon: "sword", boots: false });

describe("where a character's drawn (core/mirror.js Ring)", () => {
    it("is between the two tellings either side of the time asked, turning the short way; at the first before it, at the last after it", () => {
        const ring = new Ring();

        assert.equal(ring.at(100), null, "never told: nowhere");
        ring.push(1000, 10, 20, 250);
        assert.deepEqual(ring.at(500), { x: 10, y: 20, heading: 250 });
        assert.deepEqual(ring.at(5000), { x: 10, y: 20, heading: 250 });

        ring.push(1100, 12, 20, 10);
        assert.deepEqual(ring.at(1050), { x: 11, y: 20, heading: 2 }, "from 250 to 10 by way of 0, not back through 128");
        assert.deepEqual(ring.at(1025), { x: 10.5, y: 20, heading: 254 });
        assert.deepEqual(ring.at(1100), { x: 12, y: 20, heading: 10 });
        assert.deepEqual(ring.at(1200), { x: 12, y: 20, heading: 10 }, "past the last telling: there");

        // (Told again for the same time: the later telling stands, and it's still two)
        ring.push(1100, 14, 22, 10);
        assert.equal(ring.length, 2);
        assert.deepEqual(ring.at(1050), { x: 12, y: 21, heading: 2 });

        // (No more kept than RING.kept: the oldest let go of)
        for (let k = 0; k < 20; k++) {
            ring.push(1200 + k * 50, 14 + k, 22, 10);
        }

        assert.equal(ring.length, RING.kept);
        assert.deepEqual(ring.at(0), { x: 14 + 20 - RING.kept, y: 22, heading: 10 });
    });
});

describe("the mirror (core/mirror.js)", () => {
    let world;

    before(() => {
        world = buildWorld({ seed: 2 });
    });

    // Someone standing somewhere, with what the feed and its frames read
    let made = 0;
    const someone = (x, y, more = {}) => ({ id: `m${made++}`, kind: "folk", name: `Folk ${made}`, team: "human", map: "town", weapon: null, boots: false, neutral: true, role: null, side: "human", x, y, facing: 0, progress: null, dead: false, running: false, pace: 1.4, attack: null, target: null, order: null, hp: 20, maxHp: 20, ...more });

    // A feed over a few of them, one a player, and that player's mirror taking every frame
    function mirroredFew(actors, { strict = true } = {}) {
        const battle = { actors, actor: (id) => actors.find((actor) => actor.id === id) ?? null, hostile: () => false };
        const hosting = { host: { battle, players: new Map([[actors[0].id, {}]]) } };
        const feed = new ViewFeed(hosting);
        const mirror = new Mirror(new Battle(world, { seed: 1 }), { strict });
        const frames = [];
        let step = 0;

        feed.mode = "dark";
        feed.onFrame = (id, bytes) => {
            frames.push(bytes);
            assert.ok(mirror.apply(bytes));
        };

        return { feed, mirror, frames, hosting, run: (steps = 1) => Array.from({ length: steps }, () => feed.flush(step++)), index: (actor) => feed.viewers.get(actors[0].id).byActor.get(actor)?.index };
    }

    it("holds those it's told of as characters of a battle it never steps: added as they come, set as they're told of, taken out as they leave", () => {
        const [me, ann, far] = [someone(0, 0, { kind: "player", name: "Me", neutral: false }), someone(12.34, -5.5, { hp: 10, facing: TAU / 4 }), someone(900, 0)];
        const { mirror, run, index, feed, hosting } = mirroredFew([me, ann, far]);

        run(6);
        assert.equal(mirror.size, 2);
        assert.deepEqual(mirror.battle.actors.map(({ id }) => id).sort(), [me.id, ann.id].sort());
        assert.equal(mirror.battle.time, 0, "never stepped");

        // (Who she is, and how she is, on a character of the one shape every character is)
        const hers = mirror.actor(index(ann));

        assert.deepEqual(whoOf(hers), whoOf(ann));
        assert.deepEqual([hers.x, hers.y, hers.dead, hers.running, hers.target], [12.34, -5.5, false, false, null]);
        assert.ok(Math.abs(hers.hp - 10) <= 20 / 255, `${hers.hp}: her health to a 255th of its most`);
        assert.ok(Math.abs(hers.facing - TAU / 4) < TAU / 512);
        assert.equal(mirror.battle.actor(ann.id).id, ann.id, "found in the battle by her id, as anyone is");
        assert.ok("afflictions" in mirror.battle.actor(ann.id) && "path" in mirror.battle.actor(ann.id), "with all a character has, as one just made has it");

        // (As she changes: walking, hurt, aiming at the hero)
        Object.assign(ann, { x: 13, progress: 0.4, running: true, hp: 0.5, target: me.id });
        run(1);
        assert.deepEqual([hers.x, hers.running, hers.target], [13, true, me.id]);
        assert.ok(hers.hp > 0 && hers.hp < 1, `${hers.hp}: a hair left isn't none`);
        assert.equal(mirror.known[index(ann)].going, GOING.moving | GOING.running | GOING.fighting);
        assert.equal(mirror.known[index(ann)].target, index(me));

        // (Dead)
        Object.assign(ann, { dead: true, hp: 0 });
        run(1);
        assert.deepEqual([hers.dead, hers.hp], [true, 0]);

        // (She leaves; the one far off comes near: her index is theirs)
        const was = index(ann);

        ann.x = 5000;
        far.x = 30;
        run(6);
        assert.deepEqual(mirror.battle.actors.map(({ id }) => id).sort(), [me.id, far.id].sort());
        assert.equal(mirror.known[was].actor.id, far.id);
        assert.equal(mirror.battle.actor(ann.id), null);
        assert.deepEqual(mirror.faults, []);
        assert.equal(mirror.frames, feed.totals.frames);
        assert.deepEqual(mismatches(hosting.host, feed, new Map([[me.id, mirror]])), []);
    });

    it("is told again who someone is when that changes, and no longer has anyone aiming at one who's left", () => {
        const [me, ann, bea] = [someone(0, 0), someone(10, 0), someone(100, 0)];
        const { mirror, run, index } = mirroredFew([me, ann, bea]);

        ann.target = bea.id;
        run(6);
        assert.equal(mirror.actor(index(ann)).target, bea.id);

        // (Renamed, and of another people now: the same character, the same index)
        const [was, count] = [index(ann), mirror.battle.actors.length];

        Object.assign(ann, { name: "Ann the Bold", team: "elf" });
        run(6);
        assert.equal(index(ann), was);
        assert.deepEqual([mirror.actor(was).name, mirror.actor(was).team], ["Ann the Bold", "elf"]);
        assert.equal(mirror.battle.actors.length, count);

        // (Whom she aims at leaves: she aims at no one it knows of, with nothing more said of her)
        bea.x = 5000;
        run(6);
        assert.equal(mirror.actor(was).target, null);
        assert.equal(mirror.known[was].target, NONE);
        assert.deepEqual(mirror.faults, []);
    });

    it("lets a character be read only for what the wire says, where it's strict: the tests'", () => {
        const [me, ann] = [someone(0, 0), someone(10, 0)];
        const strict = mirroredFew([me, ann]);
        const loose = mirroredFew([me, ann], { strict: false });

        strict.run(6);
        loose.run(6);

        const hers = strict.mirror.actor(strict.index(ann));

        for (const field of WIRED) {
            assert.doesNotThrow(() => hers[field], field);
        }

        assert.deepEqual(WIRED, [...WHO, "x", "y", "facing", "running", "dead", "hp", "target"]);
        assert.throws(() => hers.afflictions, /"afflictions", which the wire never says/);
        assert.throws(() => hers.path, /never says/);
        assert.throws(() => hers.enmity, /never says/);
        assert.throws(() => JSON.stringify(hers), /never says/);
        assert.deepEqual(loose.mirror.actor(loose.index(ann)).afflictions, [], "not strict: as one just made has it");
        assert.equal(strict.mirror.actor(200), null);
    });

    it("takes nothing from bytes that aren't a frame, and says what it was told that couldn't be so", () => {
        const [me, ann] = [someone(0, 0), someone(10, 0)];
        const { mirror, run, frames } = mirroredFew([me, ann]);

        run(6);

        const [size, step] = [mirror.size, mirror.step];

        assert.equal(mirror.apply(new Uint8Array([9, 9, 9])), null);
        assert.equal(mirror.apply(frames[0].subarray(0, frames[0].length - 1)), null);
        assert.deepEqual([mirror.size, mirror.step, mirror.faults], [size, step, []]);

        // (A frame that reads, and says what can't be: someone leaving who was never known of, a
        // record for no one, someone aiming at no one known of)
        const state = new ViewState();
        const battle = { actor: () => null };
        const stray = someone(3, 3);
        const { bytes } = encodeFrame(state, { step: 99, origin: originFor(0, 0), leaves: [77], known: [{ index: 55, slot: state.touch(battle, stray, 99), sent: -1 }] });

        assert.ok(mirror.apply(bytes));
        assert.deepEqual(mirror.faults, ["77 left, and wasn't known of", "a record for 55, who isn't known of"]);
        assert.equal(mirror.size, size, "and no one made up for it");
    });

    it("keeps where each has lately been told it was, to be drawn a little behind the world between two tellings", () => {
        const [me, ann] = [someone(0, 0), someone(10, 0, { progress: 0.2 })];
        const { mirror, run, index } = mirroredFew([me, ann]);

        run(1);

        for (let k = 0; k < 10; k++) {
            ann.x += 0.1;
            run(1);
        }

        // (Told at steps 0 to 10, a tenth of a metre on each; the world's at step 10, 500 ms)
        const now = 10 * STEP_MS;
        const drawn = mirror.where(index(ann), now);

        assert.ok(Math.abs(drawn.x - (11 - 0.1 * (RING.delay / STEP_MS))) < 1e-9, `${drawn.x}: ${RING.delay} ms behind`);
        assert.ok(Math.abs(mirror.where(index(ann), now - STEP_MS / 2).x - (10.75)) < 1e-9, "half a step back: halfway between two tellings");
        assert.equal(mirror.where(index(ann), now + 10000).x, mirror.actor(index(ann)).x, "long after: where it was last told");
        assert.equal(mirror.where(99, now), null);
        assert.equal(mirror.actor(index(ann)).x, 11, "the character itself is where it was last told");
    });
});

describe("mirrors on a played world (test/replicated.js)", () => {
    function playing() {
        const world = buildWorld({ seed: 2 });
        const host = new Host(world, { populate: false });
        const homes = ["human", "elf"].map((race, k) => {
            const { at } = startFor(world.plan, race);

            host.join({ id: `p${k + 1}`, hero: hero(`P${k + 1}`, race), square: [Math.round(at[0]), Math.round(at[1])], map: "town" });

            return at;
        });

        host.populate();

        return { host, homes };
    }

    it("holds a mirror for each player to the world after every step, under a frame's budget and under a tenth of it: no one a player's been told of is other than the world has them", () => {
        for (const budget of [null, 64]) {
            const { host, homes } = playing();
            const told = mirrored(host, budget === null ? {} : { budget });
            let random = 5;
            const roll = () => (random = (Math.imul(random, 1103515245) + 12345) >>> 0) / 2 ** 32 - 0.5;

            for (let k = 0; k < 240; k++) {
                if (k % 20 === 0) {
                    homes.forEach(([x, y], n) => host.command(`p${n + 1}`, { type: "move", to: [Math.round(x + roll() * 60), Math.round(y + roll() * 60)], run: k % 40 === 0 }));
                }

                host.advance(STEP_MS);
            }

            assert.equal(told.checked, 240);
            assert.equal(told.mirrors.size, 2);

            for (const [id, mirror] of told.mirrors) {
                const viewer = told.feed.viewers.get(id);

                assert.ok(mirror.size >= 2 && mirror.size === viewer.list.filter(({ who }) => who).length, `${id}: ${mirror.size} known of`);
                assert.equal(mirror.known[0].actor.id, id, "their own hero first");
                assert.ok(mirror.frames > 20);
                assert.deepEqual(mirror.faults, []);
                assert.ok(mirror.battle.actors.length === mirror.size && mirror.battle.time === 0);
            }

            // (Each knows of those about their own hero, not the other's)
            const [one, other] = [...told.mirrors.values()].map((mirror) => new Set(mirror.battle.actors.map(({ id }) => id)));

            assert.ok(![...one].some((id) => other.has(id)), "two towns, no one in both");
            assert.ok(Object.keys(host).every((key) => key !== "advance"), "nothing that goes through the host's fields finds it");
        }
    });

    it("says how a mirror and the world differ when they do: someone moved in the mirror alone, a frame it never took", () => {
        const { host } = playing();
        const told = mirrored(host);

        for (let k = 0; k < 12; k++) {
            host.advance(STEP_MS);
        }

        assert.deepEqual(mismatches(host, told.feed, told.mirrors), []);

        // (Moved in the mirror alone)
        const mirror = told.mirrors.get("p1");
        const held = mirror.known[1];

        held.actor.x += 0.5;
        assert.match(mismatches(host, told.feed, told.mirrors).join("\n"), new RegExp(`^p1: ${held.actor.id} is at .* in the mirror, and at `));
        held.actor.x -= 0.5;
        held.health = (held.health + 100) % 256;
        assert.match(mismatches(host, told.feed, told.mirrors).join("\n"), /has \d+ of its health in the mirror, and \d+/);
        held.health = told.feed.state.health[told.feed.viewers.get("p1").byIndex[1].slot];
        assert.deepEqual(mismatches(host, told.feed, told.mirrors), []);

        // (Someone the feed says it's been told of, taken out of the mirror: as a frame lost would leave it)
        mirror.battle.remove(held.actor.id);
        mirror.known[1] = null;
        assert.match(mismatches(host, told.feed, told.mirrors).join("\n"), /p1: 1 is .*, whom the mirror doesn't know of/);
        assert.throws(() => host.advance(STEP_MS), /a mirror and the world disagree/);
    });

    it("tells a crowd's newcomers some nine a frame, who each is before how they are, beside what the frame's budget holds", () => {
        assert.deepEqual(SECTION, { events: 1, done: 2, self: 3, enters: 4, own: 5, world: 6 });
        assert.ok(ENTERS.frame + VIEW.budget < 2 * VIEW.frame);
        assert.deepEqual(WHO, ["id", "kind", "name", "team", "map", "weapon", "boots", "neutral", "role", "side", "maxHp"]);
    });
});
