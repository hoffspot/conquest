// As scripts/step-budget.js runs a world (4 players in 4 towns, what's round them made ahead), but
// timing everything the world's thread does each tick, not the step alone: the step (what the
// server's Health page shows), the flush to those joined, making ahead (server/ahead.js pump), and
// a save's snapshot and encode once a minute (keeper.js).
//
//   node tick-cost.mjs [seconds=120]
const ROOT = "/home/user/conquest";
const { STEP_MS } = await import(`${ROOT}/client/js/core/battle.js`);
const { Host } = await import(`${ROOT}/client/js/core/host.js`);
const { Hosting } = await import(`${ROOT}/client/js/core/netplay.js`);
const { buildWorld } = await import(`${ROOT}/client/js/core/overworld.js`);
const { WorldRunner } = await import(`${ROOT}/client/js/core/runner.js`);
const { startFor } = await import(`${ROOT}/client/js/core/worldplan/plan.js`);
const { encode } = await import(`${ROOT}/client/js/core/wire.js`);
const { Ahead } = await import(`${ROOT}/server/ahead.js`);
const { installWorkers } = await import(`${ROOT}/server/workers.js`);

const SECONDS = Number(process.argv[2] ?? 120);

installWorkers();

const world = buildWorld({ seed: 2 });
const host = new Host(world, { populate: false, rules: { rest: "everyone", debug: "none" } });
const homes = ["human", "elf", "orc", "cat"].map((race, k) => {
    const { at } = startFor(world.plan, race);
    const square = [Math.round(at[0]), Math.round(at[1])];

    host.join({ id: `p${k + 1}`, hero: { name: `P${k + 1}`, race, shape: {}, look: {}, weapon: "sword", boots: false }, square, map: "town" });

    return square;
});

host.populate();

const clock = () => performance.now();
const runner = new WorldRunner(host, { clock });
const ahead = new Ahead(world, { host, clock });
const hosting = new Hosting(host, { send: () => {} });
const chunkTimes = [];
const makeChunk = ahead.overworld.chunk.bind(ahead.overworld);
ahead.overworld.chunk = (...given) => { const a = clock(); const made = makeChunk(...given); chunkTimes.push(clock() - a); return made; };
let roomsBefore = 0;
const insideTicks = [];

// (Four fake peers, so the flush packs and encodes as for four joined games)
homes.forEach((_, k) => hosting.players.set(`x${k + 1}`, `p${k + 1}`));
runner.hosting = hosting;
runner.advance(STEP_MS);

const loading = clock();

while (clock() - loading < 60000) {
    runner.bakeAhead(ahead);

    if (ahead.settled) {
        break;
    }

    await new Promise((resolve) => setTimeout(resolve, 1));
}

const took = { step: [], flush: [], ahead: [], save: [], tick: [] };
let random = 2;
const roll = () => ((random = (Math.imul(random, 1103515245) + 12345) >>> 0) / 2 ** 32 - 0.5) * 2;
const flush = hosting.flush.bind(hosting);
let flushed = 0;

hosting.flush = () => {
    const a = clock();

    flush();
    flushed += clock() - a;
};
runner.onTurn = () => {
    const a = clock();

    encode(host.snapshot());
    took.save.push(clock() - a);
};

for (let t = 0; t < SECONDS * 1000; t += STEP_MS) {
    if (t % 5000 === 0) {
        homes.forEach(([x, y], k) => host.command(`p${k + 1}`, { type: "move", to: [Math.round(x + roll() * 40), Math.round(y + roll() * 40)] }));
    }

    const a = clock();

    flushed = 0;

    const saves = took.save.length;

    runner.advance(STEP_MS);

    const b = clock();

    runner.bakeAhead(ahead);

    const c = clock();
    const save = took.save.length > saves ? took.save.at(-1) : 0;

    took.step.push(runner.times.recent.at(-1));
    took.flush.push(flushed);
    took.ahead.push(c - b);
    if (ahead.rooms > roomsBefore) { roomsBefore = ahead.rooms; insideTicks.push(c - b); }
    took.tick.push(c - a);
    void save;
    await new Promise((resolve) => setImmediate(resolve));
}

const line = (list) => {
    const sorted = [...list].sort((x, y) => x - y);

    return list.length ? `mean ${(list.reduce((s, e) => s + e, 0) / list.length).toFixed(2)}, p99 ${sorted[Math.floor(sorted.length * 0.99)].toFixed(1)}, worst ${sorted.at(-1).toFixed(1)} ms` : "none";
};

console.log(`${SECONDS} s, 4 players in 4 towns, ${host.battle.actors.length} actors:`);
console.log(`  the step alone (the Health page's): ${line(took.step)}; over 50 ms: ${took.step.filter((ms) => ms > 50).length}`);
console.log(`  the flush to four joined: ${line(took.flush)}`);
console.log(`  making ahead between steps: ${line(took.ahead)}`);
console.log(`  a save's snapshot and encode (${took.save.length} war turns): ${line(took.save)}`);
console.log(`  the whole tick: ${line(took.tick)}; over 50 ms: ${took.tick.filter((ms) => ms > 50).length}`);
console.log(`  chunks made in the timed part (by the pump or a step): ${line(chunkTimes)} (n ${chunkTimes.length}); ticks that baked a tile of a building's inside: ${line(insideTicks)} (n ${insideTicks.length})`);
ahead.dispose();
process.exit(0);
