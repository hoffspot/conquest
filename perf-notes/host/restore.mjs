// What carrying a world on from a snapshot costs (core/host.js Host.restore: a joining player's
// welcome, a world server's world entered again): reading the text, and the restore itself, on a
// world just built from its seed.
const ROOT = "/home/user/conquest";
const { STEP_MS } = await import(`${ROOT}/client/js/core/battle.js`);
const { Host } = await import(`${ROOT}/client/js/core/host.js`);
const { buildWorld } = await import(`${ROOT}/client/js/core/overworld.js`);
const { startFor } = await import(`${ROOT}/client/js/core/worldplan/plan.js`);
const { encode, decode } = await import(`${ROOT}/client/js/core/wire.js`);

const cpu = () => {
    const { user, system } = process.threadCpuUsage();

    return (user + system) / 1000;
};
const players = Number(process.argv[2] ?? 4);
const world = buildWorld({ seed: 2 });
const host = new Host(world, { populate: false, rules: { rest: "everyone", debug: "owner" } });
const peoples = ["human", "elf", "orc", "cat", "darkElf", "lizard"];

for (let k = 0; k < players; k++) {
    const race = peoples[k % peoples.length];
    const { at } = startFor(world.plan, race);

    host.join({ id: `p${k + 1}`, hero: { name: `P${k + 1}`, race, shape: {}, look: {}, weapon: "sword", boots: false }, square: [Math.round(at[0]) + Math.floor(k / peoples.length) * 3, Math.round(at[1])], map: "town", role: "owner" });
}

host.populate();

for (let t = 0; t < 60000; t += STEP_MS) {
    host.advance(STEP_MS);
}

const text = encode(host.snapshot());
const fresh = buildWorld({ seed: 2 });
let c0 = cpu();
const snapshot = decode(text);
const decoded = cpu() - c0;

c0 = cpu();

const restored = Host.restore(fresh, snapshot);
const took = cpu() - c0;

c0 = cpu();
restored.advance(STEP_MS);

const first = cpu() - c0;

console.log(`${players} players, ${host.battle.actors.length} actors, ${snapshot.made.length} buildings made, text ${Math.round(text.length / 1024)} KB: decode ${Math.round(decoded)} ms cpu; Host.restore ${Math.round(took)} ms cpu; its first step after ${Math.round(first)} ms cpu; same checksum ${restored.checksum() !== host.checksum() ? "no (one step on)" : "yes"}`);
