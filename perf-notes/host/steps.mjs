// A world stepped on Node as the world server steps it (as scripts/step-budget.js does), with
// what the step budget doesn't tell: the host's own share of a step (apart from the battle's),
// the events a step makes, the time between steps spent making the world ahead on the same thread
// (server/ahead.js pump), how many are in the world, the host's Maps, and a snapshot's size and
// cost, as time goes by.
//
//     node steps.mjs [--players 4] [--seconds 60] [--seed 2] [--fights] [--no-ahead] [--every 60]
import { parseArgs } from "node:util";

const ROOT = "/home/user/conquest";
const { STEP_MS } = await import(`${ROOT}/client/js/core/battle.js`);
const { Host } = await import(`${ROOT}/client/js/core/host.js`);
const { buildWorld } = await import(`${ROOT}/client/js/core/overworld.js`);
const { StepTimes, WorldRunner } = await import(`${ROOT}/client/js/core/runner.js`);
const { startFor } = await import(`${ROOT}/client/js/core/worldplan/plan.js`);
const { encode } = await import(`${ROOT}/client/js/core/wire.js`);
const { Ahead } = await import(`${ROOT}/server/ahead.js`);
const { installWorkers } = await import(`${ROOT}/server/workers.js`);
const { navigatorOf } = await import(`${ROOT}/client/js/core/navigation.js`);
const { gzipSync } = await import("node:zlib");

const { values } = parseArgs({
    options: {
        players: { type: "string", default: "4" },
        seconds: { type: "string", default: "60" },
        seed: { type: "string", default: "2" },
        every: { type: "string", default: "60" },
        fights: { type: "boolean", default: false },
        "no-ahead": { type: "boolean", default: false },
        walk: { type: "boolean", default: false },
        json: { type: "boolean", default: false },
        dump: { type: "string" },
    },
});
const [players, seconds, seed, every] = [Number(values.players), Number(values.seconds), Number(values.seed), Number(values.every)];
const cpu = () => {
    const { user, system } = process.threadCpuUsage();

    return (user + system) / 1000;
};
const wall = () => performance.now();
const MB = (bytes) => Math.round(bytes / 2 ** 20);

installWorkers();

const world = buildWorld({ seed });
const host = new Host(world, { populate: false, rules: { rest: "everyone", debug: "owner" } });
const hero = (name, race) => ({ name, race, shape: {}, look: {}, weapon: "sword", boots: false });

// (The six peoples' start towns first; then the plan's other towns, the biggest first)
const peoples = ["human", "elf", "orc", "cat", "darkElf", "lizard"];
const starts = peoples.map((race) => ({ race, at: startFor(world.plan, race).at }));
const others = world.plan.places.filter((place) => !starts.some(({ at }) => Math.hypot(at[0] - place.at[0], at[1] - place.at[1]) < 300)).sort((a, b) => (b.radius ?? 0) - (a.radius ?? 0));
const homes = [];

for (let k = 0; k < players; k++) {
    const { race, at } = k < starts.length ? starts[k] : { race: peoples[k % peoples.length], at: others[k - starts.length].at };
    const square = [Math.round(at[0]), Math.round(at[1])];

    host.join({ id: `p${k + 1}`, hero: hero(`P${k + 1}`, race), square, map: "town", role: "owner" });
    homes.push(square);
}

host.populate();

const runner = new WorldRunner(host, { clock: wall });
const ahead = values["no-ahead"] ? null : new Ahead(world, { host, clock: wall });
let random = seed;
const roll = () => ((random = (Math.imul(random, 1103515245) + 12345) >>> 0) / 2 ** 32 - 0.5) * 2;

// (The battle's share of each step: its advance timed inside the host's)
let battleMs = 0;
const battleAdvance = host.battle.advance.bind(host.battle);

host.battle.advance = (ms) => {
    const before = wall();
    const events = battleAdvance(ms);

    battleMs += wall() - before;

    return events;
};

// (Chunks the steps made for themselves: the ground's asked for one it didn't have, inside a step)
let inStep = false;
let chunksInSteps = 0;
const groundChunk = world.maps.town.ground.chunk.bind(world.maps.town.ground);

world.maps.town.ground.chunk = (cx, cy) => {
    if (inStep && !world.maps.town.ground.peek(cx, cy)) {
        chunksInSteps++;
    }

    return groundChunk(cx, cy);
};

const openingCpu = cpu();
const openingWall = wall();

runner.advance(STEP_MS);

const opening = { cpu: Math.round(cpu() - openingCpu), wall: Math.round(wall() - openingWall) };
const loadingCpu = cpu();
const loadingWall = wall();

while (ahead && wall() - loadingWall < 45000) {
    runner.bakeAhead(ahead);

    if (ahead.settled) {
        break;
    }

    await new Promise((resolve) => setTimeout(resolve, 1));
}

const ready = { cpu: Math.round(cpu() - loadingCpu), wall: Math.round(wall() - loadingWall), chunks: ahead?.made ?? 0 };

runner.times = new StepTimes(1e9);
battleMs = 0;

const sizes = () => {
    const maps = {};

    for (const [name, value] of Object.entries(host)) {
        if (value instanceof Map || value instanceof Set) {
            maps[name] = value.size;
        } else if (Array.isArray(value)) {
            maps[name] = value.length;
        }
    }

    return maps;
};

const snapshotOf = () => {
    const before = cpu();
    const beforeWall = wall();
    const snapshot = host.snapshot();
    const took = wall() - beforeWall;
    const text = encode(snapshot);
    const encoded = wall() - beforeWall - took;
    const parts = Object.fromEntries(
        Object.entries(snapshot)
            .map(([key, value]) => [key, encode(value ?? null).length])
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8),
    );

    return { bytes: text.length, gzip: gzipSync(text).length, snapshotMs: +took.toFixed(1), encodeMs: +encoded.toFixed(1), cpuMs: Math.round(cpu() - before), parts, made: snapshot.made.length, open: snapshot.open.length, actors: snapshot.battle.actors?.length };
};

const marks = [];
const eventTypes = new Map();
let eventCount = 0;
let eventBytes = 0;
let stepsWithEvents = 0;
let mostEvents = 0;
let pumpWall = 0;
let pumpWorst = 0;
let pumpOver8 = 0;
let pumpOver25 = 0;
let pumps = 0;
const overBudget = [];
const stepCpu0 = cpu();
let pumpCpu = 0;
let stepCpu = 0;

for (let t = 0; t < seconds * 1000; t += STEP_MS) {
    if (t % 5000 === 0) {
        homes.forEach(([x, y], k) => {
            const id = `p${k + 1}`;
            const me = host.battle.actor(id);

            if (values.walk) {
                // (Walking away from home, east then south: new land all the way)
                host.command(id, { type: "move", to: [Math.round(Math.min(8100, me.x + 60)), Math.round(Math.min(8100, me.y + (k % 2 ? 25 : -25)))] });
            } else {
                host.command(id, { type: "move", to: [Math.round(x + roll() * 40), Math.round(y + roll() * 40)] });
            }
        });
    }

    if (values.fights && t % 240000 === 30000) {
        homes.forEach((home, k) => host.command(`p${k + 1}`, { type: "fieldBattle", size: 6, facing: roll() * Math.PI }));
    }

    if (ahead) {
        const before = wall();
        const beforeCpu = cpu();

        runner.bakeAhead(ahead);

        const took = wall() - before;

        pumpCpu += cpu() - beforeCpu;
        pumpWall += took;
        pumpWorst = Math.max(pumpWorst, took);
        pumpOver8 += took > 8 ? 1 : 0;
        pumpOver25 += took > 25 ? 1 : 0;
        pumps++;
    }

    const beforeCpu = cpu();

    inStep = true;
    runner.advance(STEP_MS, {
        after: (events) => {
            const ms = runner.times.recent.at(-1);

            if (ms > 20) {
                overBudget.push({ ms: Math.round(ms), at: t / 1000, events: [...new Set(events.map(({ type }) => type))].slice(0, 8) });
            }

            eventCount += events.length;
            stepsWithEvents += events.length ? 1 : 0;
            mostEvents = Math.max(mostEvents, events.length);

            for (const event of events) {
                eventTypes.set(event.type, (eventTypes.get(event.type) ?? 0) + 1);
            }

            if (events.length) {
                eventBytes += encode(events).length;
            }
        },
    });
    inStep = false;
    stepCpu += cpu() - beforeCpu;

    if ((t + STEP_MS) % (every * 1000) === 0) {
        const memory = process.memoryUsage();
        const navigation = navigatorOf(world.maps.town);

        marks.push({
            at: (t + STEP_MS) / 1000,
            actors: host.battle.actors.length,
            heap: MB(memory.heapUsed),
            buffers: MB(memory.arrayBuffers),
            rss: MB(memory.rss),
            chunksMadeAhead: ahead?.made ?? 0,
            chunksKept: world.maps.town.chunks.size,
            maps: Object.keys(world.maps).length,
            interiors: world.interiors?.order?.length ?? 0,
            navTiles: navigation.tiles?.size ?? navigation.count ?? null,
            navBakedHere: navigation.baked,
            navAdded: navigation.added,
            chunksInSteps,
            folk: host.folk.size,
            soldiers: host.soldiers.size,
            wild: host.wild.size,
            open: host.open.size,
        });
    }

    await new Promise((resolve) => setImmediate(resolve));
}

const steps = runner.times.toJSON();
const result = {
    players,
    seconds,
    opening,
    ready,
    steps: { count: steps.count, mean: +steps.mean.toFixed(3), p99: +steps.p99.toFixed(2), worst: +steps.worst.toFixed(1), worstAt: steps.worstAt / 1000 },
    stepCpuMeanMs: +(stepCpu / steps.count).toFixed(3),
    battleShare: +(battleMs / runner.times.total).toFixed(3),
    hostOwnMeanMs: +((runner.times.total - battleMs) / steps.count).toFixed(3),
    over20ms: overBudget,
    pump: { calls: pumps, meanMs: +(pumpWall / Math.max(1, pumps)).toFixed(2), cpuMeanMs: +(pumpCpu / Math.max(1, pumps)).toFixed(2), worstMs: +pumpWorst.toFixed(1), over8ms: pumpOver8, over25ms: pumpOver25, chunksMade: (ahead?.made ?? 0) - ready.chunks },
    events: { total: eventCount, perStep: +(eventCount / steps.count).toFixed(2), stepsWithAny: stepsWithEvents, most: mostEvents, bytesPerStep: Math.round(eventBytes / steps.count), types: Object.fromEntries([...eventTypes].sort((a, b) => b[1] - a[1]).slice(0, 14)) },
    marks,
    sizes: sizes(),
    snapshot: snapshotOf(),
    totalCpuMs: Math.round(cpu() - stepCpu0),
};

if (values.dump) {
    (await import("node:fs")).writeFileSync(values.dump, JSON.stringify(runner.times.recent.map((ms) => +ms.toFixed(2))));
}

ahead?.dispose();
console.log(JSON.stringify(result, null, values.json ? 0 : 1));
process.exit(0);
