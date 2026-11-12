// Two checks of the rare encounters' state (core/rare.js Legends) on a joined copy:
//  (a) a copy that fell too far behind (PACE.tooFar) and was sent the world again: is its
//      legends as the host's? (Host.adopt doesn't load snapshot.legends.)
//  (b) a copy made from a snapshot while a player's out in the wilds: is its count of their time
//      in the wilds as the host's a few looks later? (`rareLooked` isn't in the snapshot.)
//
//   node legends-adopt.mjs
const ROOT = "/home/user/conquest/client/js/core";
const { STEP_MS } = await import(`${ROOT}/battle.js`);
const { HOST_PLAYER, Host, WILDS } = await import(`${ROOT}/host.js`);
const { clearOfSettlements } = await import(`${ROOT}/creatures.js`);
const { Hosting, Joining, PACE } = await import(`${ROOT}/netplay.js`);
const { buildWorld } = await import(`${ROOT}/overworld.js`);

const HERO = { name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false };
const world = buildWorld({ seed: 2 });

// A square out in the wilds near the start town
const [sx, sy] = world.spawns.player;
let wild = null;

for (let r = 150; r < 900 && !wild; r += 50) {
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, -1]]) {
        const at = [sx + dx * r, sy + dy * r];

        if (clearOfSettlements(world.plan, at, WILDS.clear)) {
            wild = at;
            break;
        }
    }
}

console.log(`start ${sx},${sy}; a wild square at ${wild}`);

const host = new Host(world, { populate: false });

host.join({ id: HOST_PLAYER, hero: HERO, square: wild, map: "town" });
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
const catchUp = () => {
    let played = 0;

    for (let events = joining.step(); events; events = joining.step()) {
        played++;
    }

    deliver();

    return played;
};
const hostPlays = (steps) => {
    for (let k = 0; k < steps; k++) {
        clockNow += STEP_MS;
        host.advance(STEP_MS);
        hosting.flush();
        deliver();
    }
};
const clocks = (one) => JSON.stringify({ played: one.legends.played, host: one.legends.clock(HOST_PLAYER) });
const where = () => {
    const me = host.battle.actor(HOST_PLAYER);

    return `${me.x.toFixed(0)},${me.y.toFixed(0)} (${clearOfSettlements(world.plan, [me.x, me.y], WILDS.clear) ? "in the wilds" : "by a settlement"})`;
};

for (let k = 0; k < 205; k++) {
    host.advance(STEP_MS);
}

console.log(`host's player at ${where()}`);
joining.hello({ hero: { name: "Bryn", shape: {}, look: {}, weapon: "sword", boots: false, race: "human" }, progress: { gold: 50 } });
deliver();

// (b) a few looks after joining
hostPlays(40);
catchUp();
console.log(`\n(b) 40 steps after joining (times ${host.battle.time} / ${joining.host.battle.time}; desyncs ${joining.desyncs}):`);
console.log(`  host  ${clocks(host)}`);
console.log(`  copy  ${clocks(joining.host)}`);

// (a) the copy plays nothing for 8 s (its page hidden), then plays: too far behind, the world again
hostPlays(160);
console.log(`\n(a) the copy ${joining.behind} steps behind (too far: ${PACE.tooFar})`);
console.log(`  before: host played ${host.legends.played}, copy played ${joining.host.legends.played}`);

const played = catchUp();

deliver();
catchUp();
console.log(`  steps played catching up: ${played}; skips ${joining.skips}, resyncs ${joining.resyncs}; times ${host.battle.time} / ${joining.host.battle.time}`);
console.log(`  host  ${clocks(host)}`);
console.log(`  copy  ${clocks(joining.host)}`);
console.log(`  checksums alike: ${host.checksum() === joining.host.checksum()} (the checksum doesn't cover the legends)`);
