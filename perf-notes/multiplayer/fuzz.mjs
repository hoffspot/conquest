// What a broken or hostile joined game could say: malformed messages of every kind put to
// Hosting.hear, to see whether any throws out of it (on the world server that would end the
// world's thread: world-worker.js awaits heard() with no catch), and how long each takes.
//
//   node fuzz.mjs
const ROOT = "/home/user/conquest/client/js/core";
const { STEP_MS } = await import(`${ROOT}/battle.js`);
const { HOST_PLAYER, Host } = await import(`${ROOT}/host.js`);
const { Hosting, NET_VERSION } = await import(`${ROOT}/netplay.js`);
const { buildWorld } = await import(`${ROOT}/overworld.js`);
const { encode } = await import(`${ROOT}/wire.js`);

const host = new Host(buildWorld({ seed: 2 }), { populate: false });

host.join({ id: HOST_PLAYER, hero: { name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false } });
host.populate();

let sent = 0;
let sentChars = 0;
const hosting = new Hosting(host, {
    send: (peer, text) => {
        sent++;
        sentChars += text.length;
    },
});
const warn = console.warn;
let warned = 0;

console.warn = () => {
    warned++;
};

for (let k = 0; k < 40; k++) {
    host.advance(STEP_MS);
}

hosting.hear("p1", encode({ kind: "hello", version: NET_VERSION, character: { hero: { name: "Mallory", shape: {}, look: {}, weapon: "sword", race: "human" }, progress: {} } }));
console.log(`joined as ${hosting.players.get("p1")}`);

const TYPES = ["abandon", "ability", "agree", "ahead", "approach", "arrange", "budget", "burn", "buy", "camp", "cancel", "cast", "clear", "discard", "drop", "effect", "emote", "engage", "enter", "equip", "fieldBattle", "hellrift", "invade", "mission", "moonroad", "move", "offer", "order", "outfit", "party", "pick", "pickUp", "pray", "rare", "read", "rename", "rift", "rule", "sell", "share", "sort", "split", "stop", "summoned", "table", "talk", "trade", "travel", "treasure", "undiscard", "unequip", "unlock", "unoutfit", "use"];
const JUNK = [undefined, null, 0, -1, 1e308, NaN, Infinity, "", "x", "__proto__", "constructor", [], [1], ["a", "b"], {}, { length: 1e9 }, { id: "__proto__" }, [null, null], [1e9, 1e9], [-5, 0.5], true];
const KEYS = ["to", "target", "id", "slot", "item", "spell", "ability", "facing", "size", "at", "with", "count", "from", "index", "what", "change", "who", "request", "answer", "seconds", "name", "key", "building", "card", "thing", "quality", "offer", "gold", "items", "order", "reach", "run", "held", "stack", "band", "mission", "choice", "effect", "trade", "player", "place", "words", "icon", "kind", "party", "member"];

let thrown = 0;
const failures = new Map();
const put = (message) => {
    try {
        hosting.hear("p1", typeof message === "string" ? message : encode(message));
    } catch (error) {
        thrown++;

        const key = `${message?.kind}/${message?.command?.type ?? ""}: ${error.message}`.slice(0, 160);

        failures.set(key, (failures.get(key) ?? 0) + 1);
    }
};

const started = performance.now();
let seq = 1;
let count = 0;

// Every kind of message, with junk for each of its parts
for (const kind of ["hello", "ready", "away", "hold", "command", "again", "ping", "chat", "dms", "own", "nope", undefined]) {
    for (const junk of JUNK) {
        for (const key of ["version", "character", "hero", "hidden", "held", "everyone", "seq", "command", "t", "rtt", "text", "to", "party", "world", "own"]) {
            put({ kind, [key]: junk });
            count++;
        }
    }
}

// Every command, with junk for one or two of the things commands carry
for (const type of TYPES) {
    put({ kind: "command", seq: seq++, command: { type } });
    count++;

    for (const key of KEYS) {
        for (const junk of JUNK) {
            put({ kind: "command", seq: seq++, command: { type, [key]: junk } });
            count++;
        }
    }

    for (let k = 0; k < 300; k++) {
        const command = { type };

        for (let n = 0; n < 3; n++) {
            command[KEYS[(k * 7 + n * 13 + type.length) % KEYS.length]] = JUNK[(k * 5 + n * 3) % JUNK.length];
        }

        put({ kind: "command", seq: seq++, command });
        count++;
    }

    if (count % 5 === 0) {
        host.advance(STEP_MS);
    }
}

// Not JSON at all, and JSON that isn't a message
for (const text of ["", "{", "null", "[]", "1", '"x"', '{"kind":{"$":"Infinity"}}', '{"kind":"command","seq":1,"command":{"$":"NaN"}}', `{"kind":"chat","text":"${"x".repeat(100000)}"}`]) {
    put(text);
    count++;
}

for (let k = 0; k < 100; k++) {
    host.advance(STEP_MS);
}

hosting.flush();
console.warn = warn;
console.log(`${count} malformed messages in ${(performance.now() - started).toFixed(0)} ms: ${thrown} threw out of Hosting.hear; ${warned} refused with a warning logged (Host.command's catch); the host sent ${sent} messages, ${(sentChars / 1024).toFixed(0)} KB`);

for (const [key, times] of [...failures].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
    console.log(`  ${times}x ${key}`);
}

// "again", over and over: each makes the host take and encode the world for them
const before = { sent, sentChars };
const again = performance.now();

for (let k = 0; k < 100; k++) {
    hosting.hear("p1", '{"kind":"again"}');
}

console.log(`100 "again" in a row: ${(performance.now() - again).toFixed(0)} ms of the host's thread, ${((sentChars - before.sentChars) / 1024 / 1024).toFixed(1)} MB sent (${sent - before.sent} messages)`);
