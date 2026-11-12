// What a snapshot of the world holds (core/host.js snapshot, as core/wire.js encodes it): its
// parts by size, an actor's fields by size (which make up most of it), and what taking and
// encoding it costs, timed several times.
const ROOT = "/home/user/conquest";
const { STEP_MS } = await import(`${ROOT}/client/js/core/battle.js`);
const { Host } = await import(`${ROOT}/client/js/core/host.js`);
const { buildWorld } = await import(`${ROOT}/client/js/core/overworld.js`);
const { startFor } = await import(`${ROOT}/client/js/core/worldplan/plan.js`);
const { encode, decode } = await import(`${ROOT}/client/js/core/wire.js`);
const { gzipSync } = await import("node:zlib");

const players = Number(process.argv[2] ?? 4);
const seconds = Number(process.argv[3] ?? 60);
const world = buildWorld({ seed: 2 });
const host = new Host(world, { populate: false, rules: { rest: "everyone", debug: "owner" } });
const peoples = ["human", "elf", "orc", "cat", "darkElf", "lizard"];

for (let k = 0; k < players; k++) {
    const race = peoples[k % peoples.length];
    const { at } = startFor(world.plan, race);

    host.join({ id: `p${k + 1}`, hero: { name: `P${k + 1}`, race, shape: {}, look: {}, weapon: "sword", boots: false }, square: [Math.round(at[0]) + Math.floor(k / peoples.length) * 3, Math.round(at[1])], map: "town", role: "owner" });
}

host.populate();

for (let t = 0; t < seconds * 1000; t += STEP_MS) {
    host.advance(STEP_MS);
}

const wall = () => performance.now();
const times = { snapshot: [], encode: [], decode: [], gzip: [], checksum: [] };
let text = "";
let snapshot = null;

for (let k = 0; k < 7; k++) {
    let t0 = wall();

    snapshot = host.snapshot();
    times.snapshot.push(wall() - t0);
    t0 = wall();
    text = encode(snapshot);
    times.encode.push(wall() - t0);
    t0 = wall();
    decode(text);
    times.decode.push(wall() - t0);
    t0 = wall();
    gzipSync(text);
    times.gzip.push(wall() - t0);
    t0 = wall();
    host.checksum();
    times.checksum.push(wall() - t0);
}

const spread = (list) => `${Math.min(...list).toFixed(1)}-${[...list].sort((a, b) => a - b)[3].toFixed(1)}-${Math.max(...list).toFixed(1)}`;

console.log(`${players} players, ${seconds} s in: ${host.battle.actors.length} actors; snapshot ${text.length} bytes of text (${gzipSync(text).length} gzipped)`);
console.log(`ms (least-median-most of 7): snapshot() ${spread(times.snapshot)}; encode ${spread(times.encode)}; decode ${spread(times.decode)}; gzip ${spread(times.gzip)}; checksum ${spread(times.checksum)}`);
console.log(`plain JSON.stringify of it (no replacer): ${(() => { const t0 = wall(); const size = JSON.stringify(snapshot).length; return `${(wall() - t0).toFixed(1)} ms, ${size} bytes`; })()}`);

const parts = Object.entries(snapshot).map(([key, value]) => [key, encode(value ?? null).length]).sort((a, b) => b[1] - a[1]);

console.log(`parts: ${parts.slice(0, 8).map(([key, bytes]) => `${key} ${bytes}`).join(", ")}`);

const battle = Object.entries(snapshot.battle).map(([key, value]) => [key, encode(value ?? null).length]).sort((a, b) => b[1] - a[1]);

console.log(`battle: ${battle.slice(0, 6).map(([key, bytes]) => `${key} ${bytes}`).join(", ")}`);

// (An actor's fields, by the bytes they take over all the actors; and by kind)
const fields = new Map();
const kinds = new Map();

for (const actor of snapshot.battle.actors) {
    const size = encode(actor).length;
    const kind = kinds.get(actor.kind) ?? { count: 0, bytes: 0 };

    kinds.set(actor.kind, { count: kind.count + 1, bytes: kind.bytes + size });

    for (const [key, value] of Object.entries(actor)) {
        fields.set(key, (fields.get(key) ?? 0) + key.length + 3 + encode(value ?? null).length);
    }
}

console.log(`actors by kind: ${[...kinds].map(([kind, { count, bytes }]) => `${kind} ×${count} ${Math.round(bytes / count)} B each`).join(", ")}`);
console.log(`an actor has ${Object.keys(snapshot.battle.actors[0]).length} fields; the biggest over all actors: ${[...fields].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([key, bytes]) => `${key} ${bytes}`).join(", ")}`);

// (How many fields are at what a fresh actor would have: null, false, 0, [] or {})
let empty = 0;
let all = 0;

for (const actor of snapshot.battle.actors) {
    for (const [key, value] of Object.entries(actor)) {
        const bytes = key.length + 3 + encode(value ?? null).length;

        all += bytes;

        if (value === null || value === false || value === 0 || (Array.isArray(value) && !value.length) || (value && typeof value === "object" && !Array.isArray(value) && !Object.keys(value).length)) {
            empty += bytes;
        }
    }
}

console.log(`of the actors' ${all} bytes, ${empty} (${Math.round((empty / all) * 100)}%) are fields that are null, false, 0, [] or {}`);

// (Reading it back: with wire.js's reviver, and without one where the text has none of its marks)
{
    const withReviver = [];
    const plain = [];

    for (let k = 0; k < 9; k++) {
        let t0 = wall();

        decode(text);
        withReviver.push(wall() - t0);
        t0 = wall();
        JSON.parse(text);
        plain.push(wall() - t0);
    }

    const marks = (text.match(/"\$":/g) ?? []).length;

    console.log(`decode with the reviver ${spread(withReviver)} ms; JSON.parse without ${spread(plain)} ms; the text has ${marks} of the reviver's marks ("$":)`);
}
