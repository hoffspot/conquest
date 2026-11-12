// Host.checksum() and packMotion() timed on a world of 8 players over 6 towns (some 230 actors).
const ROOT = "/home/user/conquest/client/js/core";
const { STEP_MS } = await import(`${ROOT}/battle.js`);
const { Host } = await import(`${ROOT}/host.js`);
const { packMotion } = await import(`${ROOT}/motion.js`);
const { buildWorld } = await import(`${ROOT}/overworld.js`);
const { RACE, startFor } = await import(`${ROOT}/worldplan/plan.js`);
const { toBase64, encode } = await import(`${ROOT}/wire.js`);
const peoples = Object.keys(RACE);
const world = buildWorld({ seed: 2 });
const host = new Host(world, { populate: false });
for (let k = 0; k < 8; k++) {
    const race = peoples[k % peoples.length];
    const { at } = startFor(world.plan, race);
    host.join({ id: `p${k + 1}`, hero: { name: `P${k + 1}`, race, shape: {}, look: {}, weapon: "sword", boots: false }, square: [Math.round(at[0]) + Math.floor(k / peoples.length) * 3, Math.round(at[1])], map: "town" });
}
host.populate();
for (let k = 0; k < 400; k++) host.advance(STEP_MS);
const time = (work, n = 2000) => { const a = performance.now(); for (let k = 0; k < n; k++) work(); return ((performance.now() - a) / n) * 1000; };
for (let round = 0; round < 3; round++) {
    console.log(`${host.battle.actors.length} actors: checksum ${time(() => host.checksum()).toFixed(1)} µs; packMotion + base64 + encode ${time(() => encode({ kind: "motion", step: 1, units: toBase64(packMotion(host)) })).toFixed(1)} µs (${encode({ kind: "motion", step: 1, units: toBase64(packMotion(host)) }).length} chars)`);
}
