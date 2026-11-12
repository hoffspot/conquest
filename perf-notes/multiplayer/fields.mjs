// Which of a long-running Host's (and its Battle's) own fields a copy restored from its snapshot
// doesn't have alike: what the snapshot leaves out. Most are derived or caches; any that gate
// what the world does (as `messengersAt` does) make a copy go astray.
//
//   node fields.mjs [seconds=125]
const ROOT = "/home/user/conquest/client/js/core";
const { STEP_MS } = await import(`${ROOT}/battle.js`);
const { HOST_PLAYER, Host } = await import(`${ROOT}/host.js`);
const { buildWorld } = await import(`${ROOT}/overworld.js`);
const { decode, encode } = await import(`${ROOT}/wire.js`);

const SECONDS = Number(process.argv[2] ?? 125);
const host = new Host(buildWorld({ seed: 2 }), { populate: false });

host.join({ id: HOST_PLAYER, hero: { name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false } });
host.join({ id: "guest-1", hero: { name: "Bryn", shape: {}, look: {}, weapon: "bow", boots: false, race: "human" }, progress: { gold: 50 } });
host.populate();

let random = 7;
const roll = () => ((random = (Math.imul(random, 1103515245) + 12345) >>> 0) / 2 ** 32 - 0.5) * 2;

for (let t = 0; t < SECONDS * 1000; t += STEP_MS) {
    if (t % 5000 === 0) {
        const me = host.battle.actor(HOST_PLAYER);

        host.command(HOST_PLAYER, { type: "move", to: [Math.round(me.x + roll() * 20), Math.round(me.y + roll() * 20)] });
    }

    if (t === 70000) {
        host.command(HOST_PLAYER, { type: "fieldBattle", size: 15, facing: 0 });
    }

    host.advance(STEP_MS);
}

const copy = Host.restore(buildWorld({ seed: 2 }), decode(encode(host.snapshot())));

// A value as plain data, to compare (functions and big objects named, not followed)
const plain = (value, depth = 0) => {
    if (typeof value === "function") {
        return "<function>";
    }

    if (value instanceof Map) {
        return depth > 6 ? "<map>" : { $map: [...value.entries()].map(([key, each]) => [plain(key, depth + 1), plain(each, depth + 1)]) };
    }

    if (value instanceof Set) {
        return { $set: [...value].map((each) => plain(each, depth + 1)) };
    }

    if (ArrayBuffer.isView(value)) {
        return { $bytes: value.length, sum: Array.from(value.slice(0, 4096)).reduce((sum, each) => (sum + each) | 0, 0) };
    }

    if (Array.isArray(value)) {
        return depth > 6 ? "<array>" : value.map((each) => plain(each, depth + 1));
    }

    if (value && typeof value === "object") {
        if (depth > 6) {
            return "<object>";
        }

        const proto = Object.getPrototypeOf(value);

        if (proto !== Object.prototype && proto !== null && depth > 0) {
            return `<${proto.constructor?.name}>`;
        }

        return Object.fromEntries(Object.keys(value).sort().map((key) => [key, plain(value[key], depth + 1)]));
    }

    return typeof value === "number" && !Number.isFinite(value) ? String(value) : value;
};

const compare = (label, a, b, skip = []) => {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    const differing = [];

    for (const key of keys) {
        if (skip.includes(key)) {
            continue;
        }

        let [left, right] = ["?", "?"];

        try {
            left = JSON.stringify(plain(a[key]));
            right = JSON.stringify(plain(b[key]));
        } catch (error) {
            left = `!${error.message}`;
        }

        if (left !== right) {
            differing.push(`${key}: host ${String(left).slice(0, 110)} | copy ${String(right).slice(0, 110)}`);
        }
    }

    console.log(`\n${label}: ${keys.length} fields, ${differing.length} not alike after a restore`);

    for (const line of differing) {
        console.log(`  ${line}`);
    }
};

compare("Host", host, copy, ["world", "battle", "war", "recorder", "events"]);
compare("Battle", host.battle, copy.battle, ["world", "actors", "navigation", "onPath"]);

// (And each actor's own fields)
const actorKeys = new Map();

for (let index = 0; index < host.battle.actors.length; index++) {
    const [a, b] = [host.battle.actors[index], copy.battle.actors[index]];

    for (const key of new Set([...Object.keys(a), ...Object.keys(b ?? {})])) {
        let same = false;

        try {
            same = JSON.stringify(plain(a[key])) === JSON.stringify(plain(b?.[key]));
        } catch {
            same = false;
        }

        if (!same) {
            const noted = actorKeys.get(key) ?? { count: 0, example: null };

            noted.count++;
            noted.example ??= `${a.id}: host ${JSON.stringify(plain(a[key]))?.slice(0, 80)} | copy ${JSON.stringify(plain(b?.[key]))?.slice(0, 80)}`;
            actorKeys.set(key, noted);
        }
    }
}

console.log(`\nActors (${host.battle.actors.length}): fields not alike after a restore`);

for (const [key, { count, example }] of [...actorKeys].sort((x, y) => y[1].count - x[1].count)) {
    console.log(`  ${key}: ${count} actors; ${example}`);
}
