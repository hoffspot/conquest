// core/wire.js decode (JSON.parse with a reviver) against a plain JSON.parse followed by a walk
// that puts back the non-finite numbers in place, and a plain parse alone where the text holds
// none; on a real snapshot, an ops message, a motion message and a self message.
//
//   node decode-bench.mjs
import assert from "node:assert/strict";

const ROOT = "/home/user/conquest/client/js/core";
const { STEP_MS } = await import(`${ROOT}/battle.js`);
const { HOST_PLAYER, Host } = await import(`${ROOT}/host.js`);
const { Hosting } = await import(`${ROOT}/netplay.js`);
const { buildWorld } = await import(`${ROOT}/overworld.js`);
const { RACE, startFor } = await import(`${ROOT}/worldplan/plan.js`);
const { decode, encode } = await import(`${ROOT}/wire.js`);

// The same as decode, without a reviver: parsed plain, then walked, each { "$": "Infinity" } put
// back as the number it was; and not walked at all where the text has no "$" key in it
const KEEP = "$";

function revive(value) {
    if (Array.isArray(value)) {
        for (let k = 0; k < value.length; k++) {
            const each = value[k];

            if (each !== null && typeof each === "object") {
                value[k] = revive(each);
            }
        }

        return value;
    }

    const kept = value[KEEP];

    if (typeof kept === "string") {
        let count = 0;

        for (const key in value) {
            if (++count > 1) {
                break;
            }
        }

        if (count === 1) {
            return Number(kept);
        }
    }

    for (const key in value) {
        const each = value[key];

        if (each !== null && typeof each === "object") {
            value[key] = revive(each);
        }
    }

    return value;
}

function decodeFast(text) {
    const value = JSON.parse(text);

    return text.includes('"$"') && value !== null && typeof value === "object" ? revive(value) : value;
}

const peoples = Object.keys(RACE);
const world = buildWorld({ seed: 2 });
const host = new Host(world, { populate: false });

host.join({ id: HOST_PLAYER, hero: { name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false } });

for (let k = 1; k < 8; k++) {
    const race = peoples[k % peoples.length];
    const { at } = startFor(world.plan, race);

    host.join({ id: `p${k}`, hero: { name: `P${k}`, race, shape: {}, look: {}, weapon: "sword", boots: false }, square: [Math.round(at[0]) + k, Math.round(at[1])], map: "town" });
}

host.populate();

const samples = { ops: [], motion: [], self: [] };
const hosting = new Hosting(host, {
    send: (peer, text) => {
        const kind = /^\{"kind":"([a-z]+)"/.exec(text)?.[1];

        samples[kind]?.push(text);
    },
});

hosting.players.set("x", "p1");

for (let k = 0; k < 400; k++) {
    if (k % 40 === 0) {
        const me = host.battle.actor("p1");

        host.command("p1", { type: "move", to: [Math.round(me.x + 8), Math.round(me.y + 5)] });
    }

    host.advance(STEP_MS);
    hosting.flush();
}

const state = encode({ kind: "state", snapshot: host.snapshot(), paused: null });
const texts = { state: [state], ops: samples.ops.slice(-200), motion: samples.motion.slice(-50), self: samples.self.slice(-50) };

// (The same data, every one)
for (const list of Object.values(texts)) {
    for (const text of list) {
        assert.deepStrictEqual(decodeFast(text), decode(text));
    }
}

console.log("decodeFast gives the same data as decode for every sample");

const time = (work, runs) => {
    const took = [];

    for (let k = 0; k < runs; k++) {
        const a = performance.now();

        work();
        took.push(performance.now() - a);
    }

    took.sort((a, b) => a - b);

    return took[Math.floor(took.length / 2)];
};

for (const [kind, list] of Object.entries(texts)) {
    const chars = list.reduce((sum, text) => sum + text.length, 0);
    const runs = kind === "state" ? 15 : 200;
    const rounds = [];

    for (let round = 0; round < 3; round++) {
        rounds.push([time(() => list.forEach((text) => decode(text)), runs), time(() => list.forEach((text) => decodeFast(text)), runs), time(() => list.forEach((text) => JSON.parse(text)), runs)]);
    }

    const each = (k) => rounds.map((round) => ((round[k] * 1000) / list.length).toFixed(kind === "state" ? 0 : 1)).join(" / ");

    console.log(`${kind}: ${list.length} messages, ${(chars / list.length).toFixed(0)} chars each, "$" in ${list.filter((text) => text.includes('"$"')).length}; µs each over 3 rounds: decode (reviver) ${each(0)}; plain parse + walk ${each(1)}; plain parse alone ${each(2)}`);
}

// And encode: with its replacer, against plain JSON.stringify (which would lose the non-finite)
const snapshot = host.snapshot();
const rounds = [];

for (let round = 0; round < 3; round++) {
    rounds.push([time(() => encode(snapshot), 15), time(() => JSON.stringify(snapshot), 15)]);
}

console.log(`encode of the snapshot (${(state.length / 1024).toFixed(0)} KB), ms over 3 rounds: with the replacer ${rounds.map((r) => r[0].toFixed(1)).join(" / ")}; plain stringify ${rounds.map((r) => r[1].toFixed(1)).join(" / ")}`);
