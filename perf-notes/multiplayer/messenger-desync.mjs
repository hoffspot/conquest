// The repro for a copy going astray when the war's messengers are sent (host.js #sendMessengers:
// `messengersAt` isn't in the snapshot, so a copy made from one checks at another phase than the
// host). One guest joins after `warm` steps; nobody does anything; played to `until` seconds.
//
//   node messenger-desync.mjs [warm=200] [until=130] [seed=2]
const ROOT = "/home/user/conquest/client/js/core";
const { STEP_MS } = await import(`${ROOT}/battle.js`);
const { HOST_PLAYER, Host } = await import(`${ROOT}/host.js`);
const { Hosting, Joining } = await import(`${ROOT}/netplay.js`);
const { buildWorld } = await import(`${ROOT}/overworld.js`);

const WARM = Number(process.argv[2] ?? 200);
const UNTIL = Number(process.argv[3] ?? 130);
const SEED = Number(process.argv[4] ?? 2);

const host = new Host(buildWorld({ seed: SEED }), { populate: false });

host.join({ id: HOST_PLAYER, hero: { name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false } });
host.populate();

const post = [];
let sentState = 0;
const hosting = new Hosting(host, {
    send: (peer, text) => {
        if (text.startsWith('{"kind":"state"')) {
            sentState += text.length;
        }

        post.push({ to: peer, text });
    },
});
let clockNow = 0;
const joining = new Joining({ send: (text) => post.push({ from: "p1", text }), clock: () => clockNow });

joining.onWelcome = ({ seed, race, snapshot }) => joining.attach(Host.restore(buildWorld({ seed, race }), snapshot));

const deliver = () => {
    while (post.length) {
        const { from, text } = post.shift();

        if (from) {
            hosting.hear(from, text);
        } else {
            joining.hear(text);
        }
    }
};

for (let k = 0; k < WARM; k++) {
    host.advance(STEP_MS);
}

joining.hello({ hero: { name: "Bryn", shape: {}, look: {}, weapon: "sword", boots: false, race: "human" }, progress: { gold: 50 } });
deliver();
console.log(`guest joined at host time ${host.battle.time} ms (seed ${SEED})`);

let first = null;
const FIGHT_AT = Number(process.argv[5] ?? 70);
let fought = false;

while (host.battle.time < UNTIL * 1000) {
    clockNow += STEP_MS;

    if (host.battle.time % 1000 === 0) {
        joining.ping();
    }

    if (!fought && FIGHT_AT > 0 && host.battle.time >= FIGHT_AT * 1000) {
        fought = true;
        console.log(`  field battle at ${host.battle.time} ms: ${JSON.stringify(host.command(HOST_PLAYER, { type: "fieldBattle", size: 15, facing: 0 }))}`);
    }

    host.advance(STEP_MS);
    hosting.flush();
    deliver();

    const before = joining.desyncs;

    for (let events = joining.step(); events; events = joining.step()) {
        // (played)
    }

    if (joining.desyncs > before) {
        console.log(`  the copy found itself astray at host time ${host.battle.time} ms`);
    }

    if (!first && !joining.astray && joining.host.battle.actors.length !== host.battle.actors.length) {
        const ids = new Set(joining.host.battle.actors.map(({ id }) => id));
        const theirs = new Set(host.battle.actors.map(({ id }) => id));

        first = host.battle.time;
        console.log(`  first difference at host time ${first} ms: host has ${host.battle.actors.length} actors, copy ${joining.host.battle.actors.length}; only the host's: ${host.battle.actors.filter(({ id }) => !ids.has(id)).map(({ id }) => id).join(", ") || "none"}; only the copy's: ${joining.host.battle.actors.filter(({ id }) => !theirs.has(id)).map(({ id }) => id).join(", ") || "none"}`);
    }

    deliver();
}

console.log(`played to ${host.battle.time / 1000} s: checks ${joining.checks}, motion checks ${joining.motionChecks}, desyncs ${joining.desyncs}, resyncs ${joining.resyncs}, world sent again ${(sentState / 1024).toFixed(0)} KB; messengers out on the host: ${host.messengers.size}`);
