// Chases the copy going astray seen in wire.mjs during a field battle: a Host with its player
// and one guest, the guest's copy compared with the host's after every step (every actor), to find
// the first step at which they differ and who differs.
//
//   node desync.mjs [fightSize=15] [stick=1] [warm=200] [seed=2]
const ROOT = "/home/user/conquest/client/js/core";
const { STEP_MS } = await import(`${ROOT}/battle.js`);
const { HOST_PLAYER, Host } = await import(`${ROOT}/host.js`);
const { Hosting, Joining } = await import(`${ROOT}/netplay.js`);
const { buildWorld } = await import(`${ROOT}/overworld.js`);

const FIGHT = Number(process.argv[2] ?? 15);
const STICK = Number(process.argv[3] ?? 1);
const WARM = Number(process.argv[4] ?? 200);
const SEED = Number(process.argv[5] ?? 2);

const HERO = { name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false };
const guest = (name) => ({ hero: { name, shape: {}, look: {}, weapon: "sword", boots: false, race: "human" }, progress: { gold: 50 } });
const host = new Host(buildWorld({ seed: SEED }), { populate: false });

host.join({ id: HOST_PLAYER, hero: HERO });
host.populate();

const post = [];
const hosting = new Hosting(host, { send: (peer, text) => post.push({ to: peer, text }) });
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

joining.hello(guest("G1"));
deliver();

const brief = (actor) => ({ id: actor.id, kind: actor.kind, name: actor.name, map: actor.map, x: actor.x, y: actor.y, hp: actor.hp, dead: actor.dead, target: actor.target, order: actor.order?.type ?? null, path: actor.path?.length ?? 0, facing: actor.facing });

let first = null;
const differ = (k) => {
    const mine = joining.host.battle;
    const theirs = host.battle;

    if (mine.time !== theirs.time) {
        return { why: "time", mine: mine.time, theirs: theirs.time };
    }

    if (mine.actors.length !== theirs.actors.length) {
        const ids = new Set(mine.actors.map(({ id }) => id));
        const hostIds = new Set(theirs.actors.map(({ id }) => id));

        return { why: "count", mine: mine.actors.length, theirs: theirs.actors.length, onlyHost: theirs.actors.filter(({ id }) => !ids.has(id)).map(brief).slice(0, 5), onlyCopy: mine.actors.filter(({ id }) => !hostIds.has(id)).map(brief).slice(0, 5) };
    }

    const apart = [];

    for (let index = 0; index < theirs.actors.length; index++) {
        const [a, b] = [theirs.actors[index], mine.actors[index]];

        if (a.id !== b.id || a.x !== b.x || a.y !== b.y || a.hp !== b.hp || a.dead !== b.dead || a.target !== b.target || a.map !== b.map) {
            apart.push({ index, host: brief(a), copy: brief(b) });
        }
    }

    return apart.length ? { why: "actors", step: k, count: apart.length, first: apart.slice(0, 3) } : null;
};

const play = (steps, each = () => {}) => {
    for (let k = 0; k < steps; k++) {
        clockNow += STEP_MS;

        if (k % 20 === 0) {
            joining.ping();
        }

        each(k);
        host.advance(STEP_MS);
        hosting.flush();
        deliver();

        const before = joining.desyncs;

        for (let events = joining.step(); events; events = joining.step()) {
            // (played)
        }

        if (joining.desyncs > before && !first) {
            first = { step: k, time: host.battle.time, note: "the copy found itself astray (motion or checksum)" };
            console.log("ASTRAY NOTICED", JSON.stringify(first));
        }

        if (!first && !joining.astray) {
            const apart = differ(k);

            if (apart) {
                first = { step: k, time: host.battle.time, apart };
                console.log("FIRST DIFFERENCE", JSON.stringify(first, null, 1));
            }
        }

        deliver();
    }
};

const stick = (k) => {
    if (STICK && k % 10 === 0) {
        joining.command({ type: "ahead", facing: Math.round((k / 200) * 1000) / 1000, run: true, reach: 30, held: true });
    }
};

play(600, stick);
console.log(`after 30 s quiet: desyncs ${joining.desyncs}, first ${first ? "found" : "none"}; actors ${host.battle.actors.length}`);

const fought = host.command(HOST_PLAYER, { type: "fieldBattle", size: FIGHT, facing: 0 });

console.log(`fieldBattle ${FIGHT}: ${JSON.stringify(fought)}; actors ${host.battle.actors.length}`);
play(1200, stick);
console.log(`after the fight: checks ${joining.checks}, motion checks ${joining.motionChecks}, desyncs ${joining.desyncs}, resyncs ${joining.resyncs}; actors ${host.battle.actors.length}`);
