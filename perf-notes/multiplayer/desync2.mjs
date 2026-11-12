// As wire.mjs plays it (N guests, standing, then walking, then a field battle), with guest 1's
// copy compared with the host's after every step, to find the first step they differ at.
//
//   node desync2.mjs [guests=3] [fightSize=15] [walk=1]
const ROOT = "/home/user/conquest/client/js/core";
const { STEP_MS } = await import(`${ROOT}/battle.js`);
const { HOST_PLAYER, Host } = await import(`${ROOT}/host.js`);
const { Hosting, Joining } = await import(`${ROOT}/netplay.js`);
const { buildWorld } = await import(`${ROOT}/overworld.js`);

const GUESTS = Number(process.argv[2] ?? 3);
const FIGHT = Number(process.argv[3] ?? 15);
const WALK = Number(process.argv[4] ?? 1);
const SEED = 2;

const HERO = { name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false };
const guest = (name) => ({ hero: { name, shape: {}, look: {}, weapon: "sword", boots: false, race: "human" }, progress: { gold: 50 } });
const host = new Host(buildWorld({ seed: SEED }), { populate: false });

host.join({ id: HOST_PLAYER, hero: HERO });
host.populate();

const post = [];
const joiners = new Map();
const hosting = new Hosting(host, { send: (peer, text) => post.push({ to: peer, text }) });
let clockNow = 0;
let next = 1;

const deliver = () => {
    while (post.length) {
        const { to, from, text } = post.shift();

        if (from) {
            hosting.hear(from, text);
        } else {
            joiners.get(to)?.hear(text);
        }
    }
};

const join = (character) => {
    const peer = `p${next++}`;
    const joining = new Joining({ send: (text) => post.push({ from: peer, text }), clock: () => clockNow });

    joining.onWelcome = ({ seed, race, snapshot }) => joining.attach(Host.restore(buildWorld({ seed, race }), snapshot));
    joiners.set(peer, joining);
    joining.hello(character);
    deliver();

    return { peer, joining };
};

for (let k = 0; k < 200; k++) {
    host.advance(STEP_MS);
}

const guests = [];

for (let k = 0; k < GUESTS; k++) {
    guests.push(join(guest(`G${k + 1}`)));
}

const brief = (actor) => ({ id: actor.id, kind: actor.kind, name: actor.name, map: actor.map, x: actor.x, y: actor.y, hp: actor.hp, dead: actor.dead, target: actor.target, order: actor.order?.type ?? null, path: (actor.path ?? []).slice(0, 3), progress: actor.progress, facing: actor.facing, pace: actor.pace });
let first = null;
let label = "";
const watched = guests[0].joining;

const differ = () => {
    const mine = watched.host.battle;
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

    return apart.length ? { why: "actors", count: apart.length, first: apart.slice(0, 2) } : null;
};

function step(k) {
    clockNow += STEP_MS;
    host.advance(STEP_MS);
    hosting.flush();
    deliver();

    for (const { joining } of guests) {
        const before = joining.desyncs;

        for (let events = joining.step(); events; events = joining.step()) {
            // (played)
        }

        if (joining === watched && joining.desyncs > before) {
            console.log(`ASTRAY NOTICED by the copy in "${label}" at step ${k}, host time ${host.battle.time}`);
        }
    }

    if (!first && !watched.astray) {
        const apart = differ();

        if (apart) {
            first = { phase: label, step: k, time: host.battle.time, apart };
            console.log("FIRST DIFFERENCE", JSON.stringify(first, null, 1));
        }
    }

    deliver();
}

const pingAll = () => guests.forEach(({ joining }) => joining.ping());

label = "standing";

for (let k = 0; k < 600; k++) {
    if (k % 20 === 0) {
        pingAll();
    }

    step(k);
}

let random = 7;
const roll = () => ((random = (Math.imul(random, 1103515245) + 12345) >>> 0) / 2 ** 32 - 0.5) * 2;

label = "walking";

for (let k = 0; k < 600; k++) {
    if (k % 20 === 0) {
        pingAll();
    }

    if (WALK && k % 100 === 0) {
        const me = host.battle.actor(HOST_PLAYER);

        host.command(HOST_PLAYER, { type: "move", to: [Math.round(me.x + roll() * 20), Math.round(me.y + roll() * 20)] });

        for (const { joining } of guests.slice(1)) {
            const mine = joining.host.battle.actor(joining.me);

            joining.command({ type: "move", to: [Math.round(mine.x + roll() * 20), Math.round(mine.y + roll() * 20)] });
        }
    }

    if (k % 10 === 0) {
        watched.command({ type: "ahead", facing: Math.round((k / 200) * 1000) / 1000, run: true, reach: 30, held: true });
    }

    step(k);
}

console.log(`after walking: desyncs ${watched.desyncs}; actors ${host.battle.actors.length}`);

const fought = host.command(HOST_PLAYER, { type: "fieldBattle", size: FIGHT, facing: 0 });

console.log(`fieldBattle ${FIGHT}: ${JSON.stringify(fought)}; actors ${host.battle.actors.length}`);
label = "fight";

for (let k = 0; k < 1200; k++) {
    if (k % 20 === 0) {
        pingAll();
    }

    if (k % 10 === 0) {
        watched.command({ type: "ahead", facing: Math.round((k / 200) * 1000) / 1000, run: true, reach: 30, held: true });
    }

    step(k);
}

for (const { joining, peer } of guests) {
    console.log(`${peer}: checks ${joining.checks}, motion checks ${joining.motionChecks}, desyncs ${joining.desyncs}, resyncs ${joining.resyncs}`);
}
