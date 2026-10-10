// The works' convoys on the roads near a player (core/host.js with core/war/war.js; docs/WAR.md
// *Convoys*): met with their wagons, captain and guards, going at the wagons' pace, their goods
// brought in at the road's end; fallen on, their guards put down, their goods carried off; the
// keep's requests to see one in or fall on an enemy's, to win back a works or take an enemy's; and
// a wagon drawn, an ox in its shafts (art/kits/wagon.js)
import assert from "node:assert/strict";
import { describe, it } from "node:test";

// (Textured materials paint a canvas: enough of one for them to in Node, every other drawing call
// doing nothing)
const noop = () => {};
const context = () =>
    new Proxy(
        {
            createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
            createLinearGradient: () => ({ addColorStop: noop }),
            createRadialGradient: () => ({ addColorStop: noop }),
            measureText: (text) => ({ width: String(text).length * 10 }),
        },
        { get: (target, key) => (key in target ? target[key] : noop) },
    );

globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: context }) };

const { STEP_MS } = await import("../client/js/core/battle.js");
const { CONVOY_NEAR, HOST_PLAYER, Host } = await import("../client/js/core/host.js");
const { buildWorld } = await import("../client/js/core/overworld.js");
const { createRandom } = await import("../client/js/core/random.js");
const { OPENS, offerRequest, progressOf, STANDINGS, whereTo } = await import("../client/js/core/standing.js");
const { CONVOY } = await import("../client/js/core/war/war.js");
const { decode, encode } = await import("../client/js/core/wire.js");
const { BeastAvatar } = await import("../client/js/beasts/beast.js");
const { LOOKS } = await import("../client/js/beasts/looks.js");
const { hitch, LADEN, trail, WAGON, wagonOf } = await import("../client/js/world/art/kits/wagon.js");
const { nearestFree, squaresOf } = await import("../client/js/core/grid.js");

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

function run(host, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...host.advance(STEP_MS));
    }

    return events;
}

function hosted(seed = 2) {
    const host = new Host(buildWorld({ seed }), { populate: false });

    host.join({ id: HOST_PLAYER, hero: HERO });
    host.populate();
    Object.assign(host.battle.actor("orc"), { dead: true, respawnAt: Infinity });

    return host;
}

const put = (actor, [x, y]) => Object.assign(actor, { square: [x, y], x: x + 0.5, y: y + 0.5, path: [], order: null, target: null });

// A convoy of `realm`'s from one of their works on the road just outside the player's town, bound
// for their seat (its road's end `length` metres on), laden with `cargo`; the player by it
function onTheRoad(host, { realm = "human", length = 40, cargo = { wood: 60 } } = {}) {
    const war = host.war;
    const [mx, my] = host.world.stamp.middle;
    const at = [mx + 90, my + 5];
    const path = [at, [at[0] + length / 2, at[1]], [at[0] + length, at[1]]];
    const works = war.works.find(({ owner }) => owner === realm);
    const convoy = { id: "force-970", realm, kind: "convoy", size: CONVOY.guards + 1, at: [...at], path, leg: 0, target: war.realm(realm).seat, home: works.id, mission: null, about: null, cargo, back: false, since: war.turn };

    war.forces.push(convoy);
    put(host.battle.actor(HOST_PLAYER), [Math.floor(at[0] - 12), Math.floor(at[1] + 8)]);

    return { war, convoy, works };
}

// Everyone of a convoy's guard put down by the player, made too strong to lose
function putDown(host, ids) {
    const player = host.battle.actor(HOST_PLAYER);
    const events = [];

    Object.assign(player, { hp: 50000, maxHp: 50000 });

    for (const id of ids) {
        Object.assign(host.battle.actor(id) ?? {}, { hp: 1 });
    }

    for (let k = 0; k < 60 && ids.some((id) => host.battle.actor(id) && !host.battle.actor(id).dead); k++) {
        const left = ids.map((id) => host.battle.actor(id)).find((one) => one && !one.dead);

        put(player, [left.square[0] + 1, left.square[1]]);
        host.command(HOST_PLAYER, { type: "engage", target: left.id });
        events.push(...run(host, 1500));
    }

    return events;
}

describe("convoys on the roads near a player (host.js, war.js)", () => {
    it("meets a convoy near a player: its wagons laden with its goods, its captain ahead and its guards beside them, of its people; lets it go once the player's far", () => {
        const host = hosted();
        const { convoy } = onTheRoad(host);
        const events = run(host, 1000);
        const met = host.convoys.get(convoy.id);

        assert.ok(met, "met");
        assert.equal(met.wagons.length, CONVOY.wagons);
        assert.equal(met.ids.length, convoy.size);
        assert.ok(events.some(({ type, convoy: id, load }) => type === "convoy" && id === convoy.id && load === "wood"));

        for (const id of met.wagons) {
            const wagon = host.battle.actor(id);

            assert.equal(wagon.kind, "wagon");
            assert.equal(wagon.team, "human");
            assert.ok(wagon.neutral, "no one fights a wagon");
            assert.equal(host.wagons.get(id).load, "wood");
        }

        assert.equal(host.soldiers.get(met.ids[0]).convoy, convoy.id);
        assert.match(host.battle.actor(met.ids[0]).name, /convoy captain$/);
        assert.ok(met.ids.every((id) => host.battle.actor(id).team === "human"));

        // (The player gone far: the convoy goes on in the war, on paper)
        put(host.battle.actor(HOST_PLAYER), [Math.floor(convoy.at[0] - CONVOY_NEAR.far - 50), Math.floor(convoy.at[1])]);

        const later = run(host, 1000);

        assert.ok(!host.convoys.has(convoy.id));
        assert.ok(later.some(({ type, convoy: id }) => type === "parted" && id === convoy.id));
        assert.ok([...met.ids, ...met.wagons].every((id) => !host.battle.actor(id)));
        assert.ok(host.war.force(convoy.id), "still on the road in the war");
    });

    it("goes along its road at the wagons' pace, the war told where it's got to; brings its goods in at its end, its wagons emptied, and turns for home", () => {
        const host = hosted();
        const { war, convoy } = onTheRoad(host, { length: 40 });
        const stores = war.realm("human").stores.wood;

        run(host, 1000);

        const met = host.convoys.get(convoy.id);
        const wagon = host.battle.actor(met.wagons[0]);
        const from = [wagon.x, wagon.y];
        const events = [];
        let furthest = 0;

        // (Its first wagon from where the war had it, as far as the road's end, till it's in)
        assert.ok(Math.hypot(from[0] - convoy.path[0][0], from[1] - convoy.path[0][1]) < 3, "met where the war had it");

        for (let t = 0; t < 60000 && !events.some(({ type, over }) => type === "convoyed" && over === "arrived"); t += 1000) {
            events.push(...run(host, 1000));
            furthest = Math.max(furthest, Math.hypot(wagon.x - from[0], wagon.y - from[1]));
        }

        assert.ok(furthest > 30, `on along the road: ${furthest.toFixed(1)} m`);
        assert.ok(events.some(({ type, convoy: id, over, cargo }) => type === "convoyed" && id === convoy.id && over === "arrived" && cargo?.wood === 60));
        assert.equal(war.realm("human").stores.wood, stores + 60);
        assert.ok(war.log.some(({ type, force }) => type === "delivered" && force === convoy.id));
        assert.ok(convoy.back && !convoy.cargo, "back for more");
        assert.ok(met.wagons.every((id) => host.wagons.get(id).load === null), "its wagons empty");
    });

    it("is plundered once a player at war with its people puts its guard down: half its goods theirs, gold for the player, its wagons left standing", () => {
        const host = hosted();
        const { war, convoy } = onTheRoad(host, { realm: "orc", length: 200, cargo: { metal: 40 } });

        war.relations["human|orc"] = { state: "hostile", since: 0 };
        war.known.push("human|orc");

        const metal = war.realm("human").stores.metal;

        run(host, 1000);

        const met = host.convoys.get(convoy.id);
        const events = putDown(host, [...met.ids]);

        assert.ok(!war.force(convoy.id), "carried off");
        assert.equal(war.realm("human").stores.metal, metal + 20);
        assert.ok(war.realm("orc").standing.human < 0, "a grudge borne for it");
        assert.ok(events.some(({ type, convoy: id, over, by }) => type === "convoyed" && id === convoy.id && over === "plundered" && by === "human"));

        const spoils = events.find(({ type, creature }) => type === "spoils" && creature === "convoy");

        assert.ok(spoils, "a share for the player");
        assert.equal(host.ground.get(spoils.ground).bundle.gold, Math.round(40 * CONVOY_NEAR.worth));
        assert.ok(met.wagons.every((id) => !host.battle.actor(id).ai && !host.battle.actor(id).path.length), "its wagons left standing");
    });

    it("keeps the convoys met with the world, and carries on from them exactly", () => {
        const host = hosted();

        onTheRoad(host, { length: 200 });
        run(host, 3000);

        const again = Host.restore(buildWorld({ seed: 2 }), decode(encode(host.snapshot())));

        assert.deepEqual([...again.convoys.keys()], [...host.convoys.keys()]);
        assert.deepEqual([...again.wagons.keys()], [...host.wagons.keys()]);
        assert.equal(encode(again.snapshot()), encode(host.snapshot()));

        for (let t = 0; t < 4000; t += STEP_MS) {
            assert.deepEqual(again.advance(STEP_MS), host.advance(STEP_MS));
        }
    });
});

describe("the keep's requests about the convoys and the works (standing.js, host.js)", () => {
    const giver = { id: "steward", name: "Wat Steward", title: "the steward" };

    // The humans at war with the orcs; a convoy of each on the road; one of the humans' works
    // held by brigands, and one of the orcs' to take
    function atWar() {
        const host = hosted();
        const war = host.war;
        const { convoy: ours } = onTheRoad(host, { length: 40 });
        const theirs = { ...structuredClone(ours), id: "force-971", realm: "orc", target: war.realm("orc").seat, home: war.works.find(({ owner }) => owner === "orc").id, cargo: { stone: 30 } };

        war.forces.push(theirs);
        war.relations["human|orc"] = { state: "hostile", since: 0 };
        war.known.push("human|orc");

        // (Of theirs, the one nearest the keep: the one it asks for)
        const seat = war.town(war.realm("human").seat).at;
        const lost = war.works.find(({ owner }) => owner === "human");
        const taken = war.works.filter(({ owner }) => owner === "orc").sort((a, b) => Math.hypot(a.at[0] - seat[0], a.at[1] - seat[1]) - Math.hypot(b.at[0] - seat[0], b.at[1] - seat[1]))[0];

        Object.assign(lost, { held: true, band: 3 });

        return { host, war, ours, theirs, lost, taken, capital: war.realm("human").seat };
    }

    // One of the keep's requests of `kind`, as offered to one of `rank`
    function ask(war, capital, kind, rank, random = createRandom(9)) {
        for (let k = 0; k < 300; k++) {
            const request = offerRequest({ war, realm: "human", town: capital, post: "keep", giver, rank, random });

            if (request?.kind === kind) {
                return request;
            }
        }

        return null;
    }

    it("asks at the keep to see a convoy in and fall on an enemy's, to win back a works and take an enemy's, each from its rank", () => {
        const { war, ours, theirs, lost, taken, capital } = atWar();
        const kinds = (rank, post = "keep") => new Set(Array.from({ length: 200 }, (_, k) => offerRequest({ war, realm: "human", town: capital, post, giver, rank, random: createRandom(k + 1) })?.kind));
        const most = kinds(5);

        for (const kind of ["convoy", "plunder", "retake", "seize"]) {
            assert.ok(most.has(kind), `${kind} at the keep`);
            assert.ok(!kinds(OPENS[kind] - 1).has(kind), `${kind} not below its rank`);
            assert.ok(!kinds(5, "hall").has(kind), `${kind} not at a town hall`);
        }

        const convoy = ask(war, capital, "convoy", 5);
        const plunder = ask(war, capital, "plunder", 5);
        const retake = ask(war, capital, "retake", 5);
        const seize = ask(war, capital, "seize", 5);

        assert.equal(convoy.target.force, ours.id);
        assert.match(convoy.text, /convoy of 60 wood is on the road/);
        assert.equal(progressOf(convoy), "Find it on the road.");
        assert.deepEqual(whereTo(convoy, war).at, ours.at);
        assert.equal(plunder.target.force, theirs.id);
        assert.match(plunder.text, /convoy of stone/);
        assert.equal(retake.target.works, lost.id);
        assert.match(retake.text, /^Brigands hold the /);
        assert.equal(retake.until, war.turn + 40);
        assert.equal(seize.target.works, taken.id);
        assert.equal(progressOf(seize), `Get to the ${taken.name} ${taken.kind}.`);
        assert.deepEqual(whereTo(seize, war).at, taken.at);
    });

    it("has a convoy seen in done once it's in with the player by it; an enemy's done once the player's people fall on it", () => {
        const { host, war, ours, theirs, capital } = atWar();
        const player = host.players.get(HOST_PLAYER);

        player.standing.gain(STANDINGS[5].points);

        const convoy = player.standing.take(ask(war, capital, "convoy", 5));
        const plunder = player.standing.take(ask(war, capital, "plunder", 5));

        run(host, 1000);
        assert.ok(player.standing.find(convoy.id).there, "found it");
        run(host, 60000);
        assert.ok(ours.back);
        assert.equal(player.standing.find(convoy.id).state, "done");

        // (Theirs carried off by the humans in the world: done)
        war.plundered(theirs.id, "human");
        run(host, 1000);
        assert.equal(player.standing.find(plunder.id).state, "done");
    });

    it("has a works won back or taken done once the player's people win it in the world; come to nothing won some other way", () => {
        const { host, war, lost, taken, capital } = atWar();
        const player = host.players.get(HOST_PLAYER);

        player.standing.gain(STANDINGS[5].points);

        const retake = player.standing.take(ask(war, capital, "retake", 5));
        const seize = player.standing.take(ask(war, capital, "seize", 5));

        // (The brigands put down: cleared for the humans)
        lost.band = 0;
        assert.equal(war.win(lost.id, "human"), "cleared");

        // (Its guard down: seized by the humans)
        taken.guard = 0;
        assert.equal(war.win(taken.id, "human"), "seized");
        run(host, 1000);
        assert.equal(player.standing.find(retake.id).state, "done");
        assert.equal(player.standing.find(seize.id).state, "done");

        // (Another taken by the elves meanwhile: come to nothing)
        const other = war.works.find(({ owner, id }) => owner === "orc" && id !== taken.id);
        const again = player.standing.take({ ...ask(war, capital, "seize", 5), key: other.id, target: { works: other.id, at: [...other.at], name: other.name, realm: "orc" } });

        other.owner = "elf";
        run(host, 1000);
        assert.ok(!player.standing.find(again.id), "come to nothing");
    });

    it("takes its wagons through a town's gate along its middle, each drawn behind its ox clear of the gatehouse's sides", () => {
        // (A cat player's home town (seed 2), walled; a convoy of theirs on the road in that passes
        // nearest one of its gates, from 100 m out along it)
        const world = buildWorld({ seed: 2, race: "cat" });
        const host = new Host(world, { populate: false });

        host.join({ id: HOST_PLAYER, hero: HERO });
        host.populate();
        Object.assign(host.battle.actor("orc"), { dead: true, respawnAt: Infinity });

        const war = host.war;
        const [mx, my] = world.start.at;
        const gates = world.maps.town.gatesNear(mx - 200, my - 200, mx + 200, my + 200);
        const off = (gate, [x, y]) => [(x - gate.x) * gate.along[1] - (y - gate.y) * gate.along[0], (x - gate.x) * gate.along[0] + (y - gate.y) * gate.along[1]];
        const nearest = (gate, points) =>
            Math.min(
                ...points.slice(1).map((b, k) => {
                    const a = points[k];
                    const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
                    const t = Math.max(0, Math.min(1, ((gate.x - a[0]) * dx + (gate.y - a[1]) * dy) / (dx * dx + dy * dy)));

                    return Math.hypot(a[0] + dx * t - gate.x, a[1] + dy * t - gate.y);
                }),
            );
        const { gate, path } = war.roads.edges
            .get(world.start.id)
            .filter(({ kind }) => kind !== "across")
            .flatMap(({ points }) => gates.map((each) => ({ gate: each, path: [...points].reverse(), apart: nearest(each, points) })))
            .reduce((best, each) => (each.apart < best.apart ? each : best));
        const lengths = path.map((point, k) => (k ? Math.hypot(point[0] - path[k - 1][0], point[1] - path[k - 1][1]) : 0));
        const total = lengths.reduce((sum, length) => sum + length, 0);
        let [leg, walked] = [0, 0];

        while (walked + lengths[leg + 1] < total - 100) {
            walked += lengths[++leg];
        }

        const t = (total - 100 - walked) / lengths[leg + 1];
        const at = [path[leg][0] + (path[leg + 1][0] - path[leg][0]) * t, path[leg][1] + (path[leg + 1][1] - path[leg][1]) * t];
        const convoy = { id: "force-970", realm: "cat", kind: "convoy", size: CONVOY.guards + 1, at, path, leg, target: world.start.id, home: war.works.find(({ owner }) => owner === "cat").id, mission: null, about: null, cargo: { wood: 60 }, back: false, since: war.turn };

        assert.ok(gates.length >= 2, "a walled town");
        assert.ok(nearest(gate, path) < gate.half, "its road in through a gate");
        war.forces.push(convoy);
        put(host.battle.actor(HOST_PLAYER), nearestFree(squaresOf(world.maps.town), [Math.floor(gate.x - gate.along[0] * 20 + gate.along[1] * 6), Math.floor(gate.y - gate.along[1] * 20 - gate.along[0] * 6)]));

        // Each wagon as it's drawn (art/kits/wagon.js): its ox, the shafts beside it, and the wagon
        // behind along the way the ox has gone. Within the gatehouse's depth, every part of it
        // within WAY of the middle of its way through: the narrowest of the peoples' drawn ways a
        // wagon goes through (a lizard folk's, between its pyramids: 2.6 m; a cat folk's arch,
        // 3 m), not the width of the street through it (4.4 m and more)
        const WAY = 1.3;
        const front = LOOKS.ox.length * 0.55 + WAGON.gap;
        const across = WAGON.wide / 2 + 0.2;
        const tracks = new Map();
        const through = new Set();
        let worst = { u: 0 };

        for (let time = 0; time < 150000 && host.convoys.get(convoy.id)?.cargo !== null; time += STEP_MS) {
            host.advance(STEP_MS);

            for (const id of host.convoys.get(convoy.id)?.wagons ?? []) {
                const wagon = host.battle.actor(id);
                const track = tracks.get(id) ?? tracks.set(id, []).get(id);
                const [fx, fy] = [Math.sin(wagon.facing), Math.cos(wagon.facing)];

                track.unshift([wagon.x, wagon.y]);

                const bed = trail(track.slice(1), [wagon.x, wagon.y], wagon.facing, front);
                const [bx, by] = [Math.sin(bed.facing), Math.cos(bed.facing)];
                const parts = [
                    ...[-0.52, 0, 0.52].flatMap((side) => [LOOKS.ox.length / 2, 0, -front].map((ahead) => [wagon.x + fx * ahead + fy * side, wagon.y + fy * ahead - fx * side])),
                    ...[-across, 0, across].flatMap((side) => [0, WAGON.long / 2, WAGON.long].map((back) => [bed.at[0] - bx * back + by * side, bed.at[1] - by * back - bx * side])),
                ];

                for (const part of parts) {
                    const [u, v] = off(gate, part);

                    if (Math.abs(v) <= gate.deep && Math.abs(u) > worst.u) {
                        worst = { u: Math.abs(u), id, time };
                    }
                }

                const [u, v] = off(gate, [wagon.x, wagon.y]);

                if (Math.abs(v) < 0.5 && Math.abs(u) < gate.half) {
                    through.add(id);
                }
            }
        }

        assert.equal(host.convoys.get(convoy.id)?.cargo, null, "its goods in");
        assert.equal(through.size, CONVOY.wagons, "each wagon through the gate");
        assert.ok(worst.u <= WAY, `${worst.id} ${worst.u.toFixed(2)} m from the middle of the gate's way at ${worst.time} ms`);
    });
});

describe("a convoy's wagon drawn (art/kits/wagon.js)", () => {
    it("puts an ox in a wagon's shafts, the wagon laden with each of the goods or empty, its wheels turning as the ox goes; within a budget", () => {
        const triangles = (object) => {
            let count = 0;

            object.traverse((node) => {
                if (node.isMesh) {
                    count += (node.geometry.index ? node.geometry.index.count : node.geometry.attributes.position.count) / 3;
                }
            });

            return count;
        };
        const ox = { length: LOOKS.ox.length, height: LOOKS.ox.height, width: LOOKS.ox.width };
        const empty = wagonOf(ox, { load: null, people: "orc" });
        const bare = triangles(empty.object);

        assert.equal(empty.wheels.length, 4);

        for (const load of LADEN) {
            const wagon = wagonOf(ox, { load, people: "human", seed: 3 });
            const laden = triangles(wagon.object);

            assert.ok(laden > bare, `${load} laden`);
            assert.ok(laden < 4000, `${load}: ${laden} triangles`);

            // (Emptied, its goods in)
            wagon.setLoad(null);
            assert.ok(triangles(wagon.object) < laden);
            wagon.dispose();
        }

        // (Behind the ox, its shafts reaching forward along it, its wheels on the ground)
        const avatar = new BeastAvatar("ox", { seed: 2 });
        const wagon = hitch(avatar, LOOKS.ox, { load: "stone", seed: 2 });

        assert.ok(avatar.object.children.includes(wagon.object));
        assert.ok(wagon.wheels.every((wheel) => wheel.position.z < 0 && Math.abs(wheel.position.y - WAGON.wheel) < 1e-9));

        // (Going on 2 m, its wheels turned as far)
        const before = wagon.wheels[0].rotation.x;

        for (let k = 0; k < 40; k++) {
            avatar.update(0.05, 0, (k + 1) * 0.05, 0);
        }

        assert.ok(wagon.wheels[0].rotation.x - before > 1, "turned");
        avatar.character.dispose();
        assert.ok(!wagon.object.parent, "let go with the ox");
    });
});
