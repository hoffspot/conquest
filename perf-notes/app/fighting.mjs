// game.js #fighting (4454-4468), as the frame's pass over everyone asks it (4084): as written, and
// with the distance squared in place of Math.hypot; over a real battle (a field battle and an
// invasion: scripts/snapshot-fixture.js's world).
import { STEP_MS } from "/home/user/conquest/client/js/core/battle.js";
import { Host, HOST_PLAYER } from "/home/user/conquest/client/js/core/host.js";
import { buildWorld } from "/home/user/conquest/client/js/core/overworld.js";
import { longestReach } from "/home/user/conquest/client/js/core/weapons.js";

const hero = (name, race, weapon) => ({ name, race, weapon, boots: false, shape: {}, look: {} });
const size = Number(process.argv[2] ?? 4);
const world = buildWorld({ seed: 3 });
const host = new Host(world, { populate: false });
host.join({ id: HOST_PLAYER, hero: hero("Ada", "human", "sword"), progress: { gold: 40 } });
host.populate();
const battle = host.battle;
const me = battle.actor(HOST_PLAYER);
for (let i = 0; i < 200; i++) host.advance(STEP_MS);
console.log("field battle:", JSON.stringify(host.command(HOST_PLAYER, { type: "fieldBattle", size, facing: 0 })));
if (process.argv[3] !== "noinvade") host.command(HOST_PLAYER, { type: "invade" });
const DRAW_REACH = 160;
const inSight = (actor) => actor.map === me.map && !(actor !== me && (Math.abs(actor.x - me.x) > DRAW_REACH || Math.abs(actor.y - me.y) > DRAW_REACH));
// (When each last struck, as game.js keeps it: lastAttack, from the battle's "attack" events)
const lastAttack = new Map();
const note = () => { for (const a of battle.actors) if (a.attack) lastAttack.set(a.id, battle.time); };
const asWritten = (actor) => {
    if (actor.neutral) return false;
    if (actor.attack || battle.time - (lastAttack.get(actor.id) ?? -Infinity) < 2500) return true;
    const reach = longestReach(actor.weapon) + 2;
    return battle.actors.some((other) => !other.dead && other.map === actor.map && Math.hypot(other.x - actor.x, other.y - actor.y) <= reach && battle.hostile(other, actor) && battle.canSee(actor, other));
};
const squared = (actor) => {
    if (actor.neutral) return false;
    if (actor.attack || battle.time - (lastAttack.get(actor.id) ?? -Infinity) < 2500) return true;
    const reach = longestReach(actor.weapon) + 2;
    const reach2 = reach * reach;
    const { x, y, map } = actor;
    const actors = battle.actors;
    for (let k = 0; k < actors.length; k++) {
        const other = actors[k];
        if (other.dead || other.map !== map) continue;
        const dx = other.x - x, dy = other.y - y;
        if (dx * dx + dy * dy <= reach2 && battle.hostile(other, actor) && battle.canSee(actor, other)) return true;
    }
    return false;
};
const frame = (fn) => { let n = 0; for (const actor of battle.actors) { if (!inSight(actor)) continue; n += !actor.dead && actor.armed && fn(actor) ? 1 : 0; } return n; };
const time = (fn, N = 200) => { const out = []; for (let run = 0; run < 3; run++) { const s = performance.now(); let x = 0; for (let i = 0; i < N; i++) x += frame(fn); out.push(((performance.now() - s) / N).toFixed(3)); } return out.join(" / "); };
for (const seconds of [10, 20, 30, 45, 60]) {
    while (battle.time < 10000 + seconds * 1000) { host.advance(STEP_MS); note(); }
    const sight = battle.actors.filter(inSight);
    const armed = sight.filter((a) => !a.dead && a.armed);
    const scanning = armed.filter((a) => !a.neutral && !(a.attack || battle.time - (lastAttack.get(a.id) ?? -Infinity) < 2500)).length;
    const same = frame(asWritten) === frame(squared);
    console.log(`+${seconds}s actors ${battle.actors.length}, in sight ${sight.length}, armed ${armed.length}, scanning everyone ${scanning} | as written ${time(asWritten)} ms/frame | squared ${time(squared)} ms/frame | same answer ${same}`);
}
