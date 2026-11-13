// The muster after a turn of the war (generated/multiplayer_scaling_plan.md 1-28). What a turn
// decides is acted on by the host's next look round, a step or a few later, all at once: an army
// turned back to within reach of a player and reinforcements set out near them are stood up in
// that one step, on ground no one had asked for, since till the turn they were nowhere near. So
// from SOON.turn before a turn falls the host says, changing nothing, what the war as it will be
// would want (core/host.js soon's `turn`, #foresee: a copy of the war played on a turn), and a
// world server's maker makes it between the steps before (server/ahead.js, Ahead.turns). Made in
// time, the look after the turn makes no ground of its own; and the world's the same step for
// step, with what it tells, whether it was or not.
//
// And the chunks read last are found again with nothing moved among those kept (core/overworld.js
// Overworld.recently): an army with nowhere to stand reads round each of its places across a
// chunk's edge a thousand times and more, and each reading moved a chunk to the end of them all.
// They're kept, and let go, in the same order either way.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { nearestFree, squaresOf } from "../client/js/core/grid.js";
import { ARMY_NEAR, Host, SOON } from "../client/js/core/host.js";
import { navigatorOf } from "../client/js/core/navigation.js";
import { buildWorld, CHUNK, CHUNKS, KEEP, Overworld, RECENT } from "../client/js/core/overworld.js";
import { createRandom } from "../client/js/core/random.js";
import { TURN_MS, War } from "../client/js/core/war/war.js";
import { encode } from "../client/js/core/wire.js";
import { Ahead } from "../server/ahead.js";

const HERO = Object.freeze({ name: "Ada", race: "human", shape: {}, look: {}, weapon: "sword", boots: false });

// Seed 2's war, 35 turns old with no one in the world: on its 36th turn the lizards' reserve
// turns back from an army it went out to meet and is 300 m nearer home, and two columns of
// reinforcements set out to join it. A player standing here is then within ARMY_NEAR.near of
// all three, having been near none of them, and four of the chunks they're stood on are
// further off than a maker makes round anyone
const TURNS = 35;
const STAND = [6280, 2115];
// (Come into the world this long before the turn; played on this many steps after it; and the
// maker pumped this often between steps, its clock a count of its own askings, so each pump
// makes the same whatever the machine)
const BEFORE = 20000;
const AFTER = 20;
const PUMPS = 4;

// The world played with no one in till `BEFORE` short of its war's 36th turn, then with one
// player stood at STAND, to AFTER steps past the turn. With `ahead`, what the turn will bring
// near is asked for and made ahead, and the chunks read last are kept by hand; without, neither,
// as both were. Each step with the player in is kept: { time, sum, events, chunks, tiles (made
// inside the step), actors (in the battle after it), ahead (chunks the maker made after it),
// boxes (said for the turn, at the maker's last asking) }. `each(game)` is called before every
// one of them
function play({ ahead, each = null }) {
    Ahead.turns = ahead;
    Overworld.recently = ahead;

    const world = buildWorld({ seed: 2 });
    const overworld = world.maps.town;
    const navigation = navigatorOf(overworld);
    const host = new Host(world, { populate: false });

    host.populate();

    for (let ms = 0; ms < (TURNS + 1) * TURN_MS - BEFORE; ms += STEP_MS) {
        host.advance(STEP_MS);
    }

    const game = { world, overworld, host, ticks: 0, played: [], turnAt: -1 };
    const maker = new Ahead(world, { host, clock: () => game.ticks++ });
    const square = nearestFree(squaresOf(overworld), STAND, { within: 40 });

    host.join({ id: "p1", hero: HERO, square, map: "town" });
    game.maker = maker;

    for (let k = 0; k < BEFORE / STEP_MS + AFTER; k++) {
        each?.(game, k);

        const [chunks, tiles, turn] = [overworld.chunksMade, navigation.baked, host.war.turn];
        const events = host.advance(STEP_MS);
        const one = { time: host.battle.time, sum: host.checksum(), events, chunks: overworld.chunksMade - chunks, tiles: navigation.baked - tiles, actors: host.battle.actors.length };

        if (host.war.turn !== turn) {
            game.turnAt = k;
        }

        const made = maker.made;

        for (let pump = 0; pump < PUMPS; pump++) {
            const me = host.battle.actor("p1");

            maker.around(me.x, me.y, 0);
            maker.pump();
        }

        game.played.push({ ...one, ahead: maker.made - made, boxes: maker.turn.boxes });
    }

    game.snapshot = encode(host.snapshot());
    maker.dispose();
    Ahead.turns = true;
    Overworld.recently = true;

    return game;
}

describe("the muster after a turn of the war (core/host.js soon's `turn`, server/ahead.js Ahead.turns)", () => {
    let made;
    let unmade;
    // (What the host said when asked, at moments of the run with the ground made ahead)
    const said = {};

    before(() => {
        made = play({
            ahead: true,
            each: ({ host }, k) => {
                const left = TURN_MS - host.war.clock;

                // (Just before it would say anything; as soon as it does; and just before the turn)
                if (left === SOON.turn + STEP_MS) {
                    const war = encode(host.war.snapshot());

                    said.early = { ...host.soon([], { turn: true }), foresights: host.foresights, same: encode(host.war.snapshot()) === war };
                }

                if (left === SOON.turn - 500) {
                    const [war, sum, snapshot] = [encode(host.war.snapshot()), host.checksum(), encode(host.snapshot())];
                    const plain = host.soon();
                    const asked = host.soon([], { turn: true });
                    const again = host.soon([], { turn: true });

                    said.near = { plain, asked, again, foresights: host.foresights, same: encode(host.war.snapshot()) === war && host.checksum() === sum && encode(host.snapshot()) === snapshot, forces: host.war.forces.map(({ id, at }) => ({ id, at: [...at] })), k };
                }

                if (left === TURN_MS && k > 0) {
                    said.after = host.war.forces.map(({ id, kind, mission, size, at }) => ({ id, kind, mission, size, at: [...at] }));
                }

                if (left === STEP_MS) {
                    said.last = { asked: host.soon([], { turn: true }), foresights: host.foresights, next: host.foreseen.war.forces.map(({ id, kind, mission, size, at }) => ({ id, kind, mission, size, at: [...at] })) };
                }
            },
        });
        unmade = play({ ahead: false });
    });

    after(() => {
        Ahead.turns = true;
        Overworld.recently = true;
    });

    it("the look after the turn stands up an army turned back and two columns of reinforcements at once, on four chunks of ground it makes for itself", () => {
        const { played, turnAt } = unmade;
        const turn = played[turnAt];
        // (The look round, twice a second: the first after the turn)
        const look = played.findIndex(({ events }, k) => k > turnAt && events.some(({ type, met }) => type === "army" && met));
        const armies = played[look].events.filter(({ type, met }) => type === "army" && met);

        assert.ok(turn.events.some(({ type, turn: number }) => type === "turn" && number === TURNS + 1));
        assert.ok(look > turnAt && look <= turnAt + 500 / STEP_MS, `${look - turnAt} steps after the turn`);
        assert.deepEqual(armies.map(({ kind }) => kind).sort(), ["reinforcement", "reinforcement", "reserve"]);
        assert.equal(played[look].chunks, 4);
        assert.equal(turn.chunks, 0);
        // (None of it was asked for, and nothing was made ahead in the steps between)
        assert.ok(played.every(({ boxes }) => boxes === 0));
        assert.equal(unmade.maker.turn.chunks, 0);
        // (The first ground any step from ten seconds before the turn made for itself; two
        // chunks more six steps on, with those three out, are the only other)
        assert.deepEqual(played.map(({ chunks }, k) => [k, chunks]).filter(([k, chunks]) => k >= turnAt - SOON.turn / STEP_MS && chunks > 0), [[look, 4], [look + 6, 2]]);
    });

    it("says nothing of the turn till SOON.turn before it, then what the war as it will be would want that nothing wants yet: asking changes nothing, and it's worked out once", () => {
        const holds = ([x0, y0, x1, y1], [x, y]) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

        assert.equal(SOON.turn, 10000);
        assert.deepEqual([said.early.foreseen, said.early.foresights, said.early.same], [[], 0, true]);

        // (The same boxes each asking, each the SOON.army round where a force will be; none of
        // them said unasked, as a browser's game asks; the war, the world's sum and its snapshot
        // as they were)
        const { plain, asked, again, foresights, same } = said.near;

        assert.deepEqual(plain.foreseen, []);
        assert.equal(asked.foreseen.length, 3);
        assert.deepEqual(again.foreseen, asked.foreseen);
        assert.deepEqual([foresights, same], [1, true]);
        assert.deepEqual(asked.boxes, [...plain.boxes, ...asked.foreseen]);
        assert.ok(asked.foreseen.every((box) => !plain.boxes.some((one) => String(one) === String(box))));

        // (Where the three will be after the turn, which is none of where any force is now; and
        // near enough the player to be met)
        const coming = said.last.next.filter(({ at }) => asked.foreseen.some((box) => String(box) === String([Math.floor(at[0] - SOON.army), Math.floor(at[1] - SOON.army), Math.ceil(at[0] + SOON.army), Math.ceil(at[1] + SOON.army)])));
        const me = made.host.battle.actor("p1");

        assert.deepEqual(coming.map(({ kind, mission }) => `${kind} ${mission ?? ""}`.trim()).sort(), ["reinforcement", "reinforcement", "reserve back"]);
        assert.ok(coming.every(({ at }) => Math.hypot(at[0] - me.x, at[1] - me.y) < ARMY_NEAR.near + SOON.margin));
        assert.ok(asked.foreseen.every((box) => !said.near.forces.some(({ at }) => holds(box, at))), "no force stands in any of them yet");
        // (Still once, the step before the turn)
        assert.equal(said.last.foresights, 1);
        assert.deepEqual(said.last.asked.foreseen, asked.foreseen);
    });

    it("the war as it will be is the war a turn on: the copy played comes out as the war itself does", () => {
        const { host } = made;

        // (A copy with the war's own roads, and one that works its own out: the same a turn on)
        const war = War.restore(made.world.plan, host.war.snapshot(), { roads: host.war.roads });
        const fresh = War.restore(made.world.plan, host.war.snapshot());

        assert.equal(war.roads, host.war.roads);
        war.step();
        fresh.step();
        assert.equal(encode(war.snapshot()), encode(fresh.snapshot()));

        // (And what was foreseen ten seconds before the turn is what the turn did: every force
        // where it said, as the step after the turn found them)
        assert.ok(said.after.length > 3);
        assert.deepEqual(said.last.next, said.after);
    });

    it("made ahead, the look after the turn makes no ground of its own: the maker made it in the ten seconds before", () => {
        const { played, turnAt, maker } = made;
        const from = turnAt - SOON.turn / STEP_MS;

        assert.equal(made.turnAt, unmade.turnAt);
        assert.deepEqual(played.map(({ chunks }, k) => [k, chunks]).filter(([k, chunks]) => k >= from && chunks > 0), []);
        // (Said from the first look within SOON.turn of the turn, till the turn; and every chunk
        // those boxes touch that nothing else wanted made before it fell)
        assert.ok(played.slice(0, from).every(({ boxes }) => boxes === 0));
        assert.ok(played.slice(from + 500 / STEP_MS, turnAt).every(({ boxes }) => boxes === 3));
        assert.ok(maker.turn.chunks >= 4 && maker.turn.chunks <= played.slice(from, turnAt + 1).reduce((sum, { ahead }) => sum + ahead, 0), `${maker.turn.chunks} chunks made for the turn`);

        for (const box of said.near.asked.foreseen) {
            for (let cy = Math.floor(box[1] / CHUNK); cy <= Math.floor(box[3] / CHUNK); cy++) {
                for (let cx = Math.floor(box[0] / CHUNK); cx <= Math.floor(box[2] / CHUNK); cx++) {
                    assert.ok(made.overworld.chunks.has(cy * CHUNKS + cx), `chunk ${cx},${cy} made`);
                }
            }
        }
    });

    it("the world's the same step for step, and what it tells, whether the turn's ground was made ahead or by the look after it", () => {
        assert.equal(made.played.length, unmade.played.length);

        for (const [k, step] of made.played.entries()) {
            const other = unmade.played[k];

            assert.deepEqual([step.time, step.sum, step.actors, step.tiles], [other.time, other.sum, other.actors, other.tiles], `step ${k}`);
            assert.equal(encode(step.events), encode(other.events), `step ${k}'s events`);
        }

        assert.equal(made.snapshot, unmade.snapshot);
    });
});

describe("the chunks read last, kept by hand (core/overworld.js Overworld.recently)", () => {
    after(() => {
        Overworld.recently = true;
    });

    // The same readings, markings and keepings of a world's chunks, with the last few read kept
    // by hand or each moved as it's read: the order they'd be let go in after each
    function orders(recently) {
        Overworld.recently = recently;

        const overworld = buildWorld({ seed: 2 }).maps.town;
        const random = createRandom(7).next;
        const [cx0, cy0] = [Math.floor(STAND[0] / CHUNK), Math.floor(STAND[1] / CHUNK)];
        const kept = [];
        const next = (n) => Math.floor(random() * n);

        // (Twelve chunks made, then read as a search across their edges reads them, two and four
        // turn about; some marked as wanted, as the maker marks them; one made a piece at a time)
        for (let k = 0; k < 12; k++) {
            overworld.chunk(cx0 + (k % 4), cy0 + Math.floor(k / 4));
        }

        kept.push(overworld.order());

        for (let k = 0; k < 400; k++) {
            const [cx, cy] = [cx0 + next(4), cy0 + next(3)];
            const kind = next(20);

            if (kind === 0) {
                overworld.wanted(cx, cy);
            } else if (kind === 1) {
                overworld.chunkWithin(cx0 + 4 + next(2), cy0 + next(3), 0, () => 1);
            } else {
                // (A square in it, and the one across its corner or its edge, turn about)
                for (let turn = 0; turn < 6; turn++) {
                    overworld.chunkAt(cx * CHUNK + (turn % 2 ? -1 : 0), cy * CHUNK + (turn % 3 ? 0 : -1));
                }
            }

            kept.push(overworld.order());
        }

        // (Fewer kept than it has: the longest unused let go, never fewer than KEEP)
        overworld.keep(1);
        kept.push(overworld.order());

        Overworld.recently = true;

        return { kept, made: overworld.chunksMade, recent: overworld.recent.length };
    }

    it("are kept, and would be let go, in the same order as when each was moved as it was read", () => {
        const [byHand, moved] = [orders(true), orders(false)];

        assert.equal(RECENT, 4);
        assert.ok(KEEP > 20);
        assert.equal(byHand.made, moved.made);
        assert.ok(byHand.made >= 12);
        assert.equal(byHand.kept.length, moved.kept.length);

        for (const [k, order] of byHand.kept.entries()) {
            assert.deepEqual(order, moved.kept[k], `after ${k}`);
        }

        // (And every chunk made is among them, each once)
        assert.equal(new Set(byHand.kept.at(-1)).size, byHand.kept.at(-1).length);
        assert.equal(moved.recent, 0);
    });

    it("lets go of the longest unused first as another's made, whichever were read last by hand", () => {
        const letGo = (recently) => {
            Overworld.recently = recently;

            const overworld = buildWorld({ seed: 2 }).maps.town;
            const [cx0, cy0] = [Math.floor(STAND[0] / CHUNK), Math.floor(STAND[1] / CHUNK)];

            // (Three made, the first read again by hand; with room for three, the next made
            // lets go of the second, not the first)
            overworld.kept = 3;
            overworld.chunk(cx0, cy0);
            overworld.chunk(cx0 + 1, cy0);
            overworld.chunk(cx0 + 2, cy0);
            overworld.chunk(cx0, cy0);
            overworld.chunk(cx0 + 2, cy0);
            overworld.chunk(cx0, cy0);
            overworld.chunk(cx0 + 3, cy0);
            Overworld.recently = true;

            return overworld.order().map((key) => (key % CHUNKS) - cx0);
        };

        assert.deepEqual(letGo(true), [2, 0, 3]);
        assert.deepEqual(letGo(false), [2, 0, 3]);
    });
});
