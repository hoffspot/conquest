// Measures what the netcode sends: a Host with its own player and N guests joined through
// Hosting/Joining in one Node process (as test/netplay.test.js does), in a quiet town, walking,
// and in a field battle. Counts the text of every message by kind and direction.
//
//   node wire.mjs [guests=3] [fightSize=15]
import { gzipSync, deflateRawSync } from "node:zlib";

const ROOT = "/home/user/conquest/client/js/core";
const { STEP_MS } = await import(`${ROOT}/battle.js`);
const { HOST_PLAYER, Host } = await import(`${ROOT}/host.js`);
const { Hosting, Joining } = await import(`${ROOT}/netplay.js`);
const { buildWorld } = await import(`${ROOT}/overworld.js`);
const { decode, encode } = await import(`${ROOT}/wire.js`);

const GUESTS = Number(process.argv[2] ?? 3);
const FIGHT = Number(process.argv[3] ?? 15);
const SEED = 2;

const HERO = { name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false };
const guest = (name) => ({ hero: { name, shape: {}, look: {}, weapon: "sword", boots: false, race: "human" }, progress: { gold: 50 } });

const t0 = performance.now();
const world = buildWorld({ seed: SEED });
const builtMs = performance.now() - t0;
const host = new Host(world, { populate: false });

host.join({ id: HOST_PLAYER, hero: HERO });
host.populate();

const post = [];
const joiners = new Map();
const down = {}; // by kind: { count, chars } to ONE guest (p1)
const downAll = {}; // by kind, everyone
const up = {}; // by kind from ONE guest (p1)
const note = (table, kind, chars) => {
    table[kind] ??= { count: 0, chars: 0 };
    table[kind].count++;
    table[kind].chars += chars;
};
const kindOf = (text) => /^\{"kind":"([a-z]+)"/.exec(text)?.[1] ?? "?";
const hosting = new Hosting(host, {
    send: (peer, text) => {
        const kind = kindOf(text);

        note(downAll, kind, text.length);

        if (peer === "p1") {
            note(down, kind, text.length);
        }

        post.push({ to: peer, text });
    },
});
let clockNow = 0;
let next = 1;
const welcomeStats = {};

const join = (character) => {
    const peer = `p${next++}`;
    const joining = new Joining({
        send: (text) => {
            if (peer === "p1") {
                note(up, kindOf(text), text.length);
            }

            post.push({ from: peer, text });
        },
        clock: () => clockNow,
    });

    joining.onWelcome = ({ seed, race, snapshot }) => {
        const a = performance.now();
        const copyWorld = buildWorld({ seed, race });
        const b = performance.now();

        joining.attach(Host.restore(copyWorld, snapshot));
        welcomeStats[peer] = { buildWorldMs: b - a, restoreMs: performance.now() - b };
    };
    joiners.set(peer, joining);
    joining.hello(character);
    deliver();

    return { peer, joining };
};

function deliver() {
    while (post.length) {
        const { to, from, text } = post.shift();

        if (from) {
            hosting.hear(from, text);
        } else {
            joiners.get(to)?.hear(text);
        }
    }
}

const hostStep = [];
const flushMs = [];
const guestStep = [];

// One step of the host's, flushed and delivered, each guest's copy playing all it has
function step() {
    clockNow += STEP_MS;

    let a = performance.now();

    host.advance(STEP_MS);

    let b = performance.now();

    hostStep.push(b - a);
    hosting.flush();
    flushMs.push(performance.now() - b);
    deliver();

    for (const [peer, joining] of joiners) {
        a = performance.now();

        let played = 0;

        for (let events = joining.step(); events; events = joining.step()) {
            played++;
        }

        if (peer === "p1" && played) {
            guestStep.push((performance.now() - a) / played);
        }
    }

    deliver();
}

const mean = (list) => (list.length ? list.reduce((sum, each) => sum + each, 0) / list.length : 0);
const pct = (list, share) => [...list].sort((a, b) => a - b)[Math.min(list.length - 1, Math.floor(share * list.length))] ?? 0;
const reset = () => {
    for (const table of [down, downAll, up]) {
        for (const key of Object.keys(table)) {
            delete table[key];
        }
    }

    hostStep.length = flushMs.length = guestStep.length = 0;
};
const report = (label, seconds) => {
    const total = (table) => Object.values(table).reduce((sum, { chars }) => sum + chars, 0);
    const line = (table) =>
        Object.entries(table)
            .sort((a, b) => b[1].chars - a[1].chars)
            .map(([kind, { count, chars }]) => `${kind} ${(chars / seconds).toFixed(0)} B/s (${(count / seconds).toFixed(1)}/s, ${(chars / count).toFixed(0)} B each)`)
            .join("; ");
    const packets = (table) => Object.values(table).reduce((sum, { count }) => sum + count, 0) / seconds;

    console.log(`\n== ${label} (${seconds} s, ${host.battle.actors.length} actors, ${joiners.size} guests)`);
    console.log(`  down to one guest: ${(total(down) / seconds).toFixed(0)} B/s in ${packets(down).toFixed(1)} messages/s: ${line(down)}`);
    console.log(`  host sends in all: ${(total(downAll) / seconds).toFixed(0)} B/s in ${packets(downAll).toFixed(1)} messages/s`);
    console.log(`  up from one guest: ${(total(up) / seconds).toFixed(0)} B/s in ${packets(up).toFixed(1)} messages/s: ${line(up)}`);
    console.log(`  host step: mean ${mean(hostStep).toFixed(2)} ms, p99 ${pct(hostStep, 0.99).toFixed(2)}, worst ${Math.max(...hostStep).toFixed(1)}; flush: mean ${mean(flushMs).toFixed(3)} ms, p99 ${pct(flushMs, 0.99).toFixed(3)}, worst ${Math.max(...flushMs).toFixed(2)}`);
    console.log(`  guest copy's step: mean ${mean(guestStep).toFixed(2)} ms, p99 ${pct(guestStep, 0.99).toFixed(2)}, worst ${Math.max(...guestStep).toFixed(1)}`);
};

// ---- Warm up alone, then the guests join
for (let k = 0; k < 200; k++) {
    host.advance(STEP_MS);
}

const guests = [];

for (let k = 0; k < GUESTS; k++) {
    guests.push(join(guest(`G${k + 1}`)));
}

console.log(`seed ${SEED}: buildWorld ${builtMs.toFixed(0)} ms; ${host.battle.actors.length} actors; guests ${GUESTS}`);
console.log(`welcome to p1: ${(downAll.welcome.chars / downAll.welcome.count / 1024).toFixed(0)} KB each; copy made: buildWorld ${welcomeStats.p1.buildWorldMs.toFixed(0)} ms, restore ${welcomeStats.p1.restoreMs.toFixed(0)} ms`);

// (A guest pings once a second, as game.js does)
const pingAll = () => {
    for (const { joining } of guests) {
        joining.ping();
    }
};

// ---- 1. Quiet town, everyone standing
reset();

for (let k = 0; k < 20 * 30; k++) {
    if (k % 20 === 0) {
        pingAll();
    }

    step();
}

report("quiet town, everyone standing", 30);

// ---- 2. Everyone walking about (a tap every 5 s; guest 1 steering by stick: "ahead" twice a second)
reset();

let random = 7;
const roll = () => ((random = (Math.imul(random, 1103515245) + 12345) >>> 0) / 2 ** 32 - 0.5) * 2;

for (let k = 0; k < 20 * 30; k++) {
    if (k % 20 === 0) {
        pingAll();
    }

    if (k % 100 === 0) {
        const me = host.battle.actor(HOST_PLAYER);

        host.command(HOST_PLAYER, { type: "move", to: [Math.round(me.x + roll() * 20), Math.round(me.y + roll() * 20)] });

        for (const { joining } of guests.slice(1)) {
            const mine = joining.host.battle.actor(joining.me);

            joining.command({ type: "move", to: [Math.round(mine.x + roll() * 20), Math.round(mine.y + roll() * 20)] });
        }
    }

    // (The stick: every half second, as app/steering.js gives it again; turning now and then)
    if (k % 10 === 0 && guests.length) {
        guests[0].joining.command({ type: "ahead", facing: Math.round((k / 200) * 1000) / 1000, run: true, reach: 30, held: true });
    }

    step();
}

report("walking about (guest 1 on the stick, the rest tapping)", 30);

// ---- 3. A field battle: FIGHT a side
const before = host.battle.actors.length;
const fought = host.command(HOST_PLAYER, { type: "fieldBattle", size: FIGHT, facing: 0 });

console.log(`\nfieldBattle size ${FIGHT}: ${JSON.stringify(fought)}; actors ${before} -> ${host.battle.actors.length}`);
reset();

for (let k = 0; k < 20 * 60; k++) {
    if (k % 20 === 0) {
        pingAll();
    }

    if (k % 10 === 0 && guests.length) {
        guests[0].joining.command({ type: "ahead", facing: Math.round((k / 200) * 1000) / 1000, run: true, reach: 30, held: true });
    }

    step();
}

report(`a field battle, ${FIGHT} a side`, 60);

for (const { joining, peer } of guests) {
    console.log(`  ${peer}: checks ${joining.checks}, motion checks ${joining.motionChecks}, desyncs ${joining.desyncs}, resyncs ${joining.resyncs}`);
}

// ---- 4. The snapshot: size, time to make, encode, decode, restore, adopt; and how it compresses
const times = { snapshot: [], encode: [], encodePlain: [], decode: [], parsePlain: [], adopt: [], restore: [] };
let text = "";

for (let k = 0; k < 7; k++) {
    let a = performance.now();
    const snapshot = host.snapshot();

    times.snapshot.push(performance.now() - a);
    a = performance.now();
    text = encode({ kind: "state", snapshot, paused: null });
    times.encode.push(performance.now() - a);
    a = performance.now();
    JSON.stringify({ kind: "state", snapshot, paused: null });
    times.encodePlain.push(performance.now() - a);
    a = performance.now();

    const back = decode(text);

    times.decode.push(performance.now() - a);
    a = performance.now();
    JSON.parse(text);
    times.parsePlain.push(performance.now() - a);
    a = performance.now();
    guests[0].joining.host.adopt(back.snapshot);
    times.adopt.push(performance.now() - a);
}

const med = (list) => pct(list, 0.5);
const gz = gzipSync(text, { level: 6 });
const gz1 = gzipSync(text, { level: 1 });
let a = performance.now();

for (let k = 0; k < 5; k++) {
    deflateRawSync(text, { level: 1 });
}

const deflate1Ms = (performance.now() - a) / 5;

a = performance.now();

for (let k = 0; k < 5; k++) {
    deflateRawSync(text, { level: 6 });
}

const deflate6Ms = (performance.now() - a) / 5;

console.log(`\n== the world again (state), after the fight: ${(text.length / 1024).toFixed(0)} KB of text, ${host.battle.actors.length} actors`);
console.log(`  host: snapshot() ${med(times.snapshot).toFixed(1)} ms (min ${Math.min(...times.snapshot).toFixed(1)}, max ${Math.max(...times.snapshot).toFixed(1)}); encode ${med(times.encode).toFixed(1)} ms (plain JSON.stringify ${med(times.encodePlain).toFixed(1)} ms)`);
console.log(`  guest: decode ${med(times.decode).toFixed(1)} ms (plain JSON.parse ${med(times.parsePlain).toFixed(1)} ms); adopt ${med(times.adopt).toFixed(1)} ms (min ${Math.min(...times.adopt).toFixed(1)}, max ${Math.max(...times.adopt).toFixed(1)})`);
console.log(`  has non-finite numbers ({"$":...}): ${(text.match(/\{"\$":/g) ?? []).length}`);
console.log(`  gzip -6: ${(gz.length / 1024).toFixed(0)} KB (${((gz.length / text.length) * 100).toFixed(0)}%), ${deflate6Ms.toFixed(1)} ms; gzip -1: ${(gz1.length / 1024).toFixed(0)} KB (${((gz1.length / text.length) * 100).toFixed(0)}%), ${deflate1Ms.toFixed(1)} ms`);

// (What the snapshot's made of, by its top-level keys)
const snapshot = host.snapshot();
const parts = Object.entries(snapshot)
    .map(([key, value]) => [key, encode(value ?? null).length])
    .sort((x, y) => y[1] - x[1])
    .slice(0, 12);

console.log(`  biggest parts: ${parts.map(([key, size]) => `${key} ${(size / 1024).toFixed(0)} KB`).join(", ")}`);

const battleParts = Object.entries(snapshot.battle)
    .map(([key, value]) => [key, encode(value ?? null).length])
    .sort((x, y) => y[1] - x[1])
    .slice(0, 8);

console.log(`  battle: ${battleParts.map(([key, size]) => `${key} ${(size / 1024).toFixed(0)} KB`).join(", ")}`);

if (Array.isArray(snapshot.battle.actors)) {
    const sizes = snapshot.battle.actors.map((actor) => encode(actor).length);

    console.log(`  actors: ${sizes.length}, mean ${(mean(sizes)).toFixed(0)} B each, biggest ${Math.max(...sizes)} B`);
}
