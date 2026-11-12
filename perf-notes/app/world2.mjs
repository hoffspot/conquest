// A real world in Node: the player in their people's capital; a field battle and an invasion;
// how many actors and links; the per-frame passes of app/game.js #update replayed over them (no
// DOM, no drawing: only the loops over battle.actors that the frame makes), timed.
import { STEP_MS } from "/home/user/conquest/client/js/core/battle.js";
import { Host, HOST_PLAYER } from "/home/user/conquest/client/js/core/host.js";
import { spawnFor } from "/home/user/conquest/client/js/core/netplay.js";
import { buildWorld } from "/home/user/conquest/client/js/core/overworld.js";
import { encode } from "/home/user/conquest/client/js/core/wire.js";
import { linkAt } from "/home/user/conquest/client/js/core/interiors.js";
import { inFight } from "/home/user/conquest/client/js/app/fight.js";
import { longestReach } from "/home/user/conquest/client/js/core/weapons.js";

const hero = (name, race, weapon) => ({ name, race, weapon, boots: false, shape: {}, look: {} });
const seed = Number(process.argv[2] ?? 3);
const race = process.argv[3] ?? "elf";
const battleSize = Number(process.argv[4] ?? 0);
const world = buildWorld({ seed });
const host = new Host(world, { populate: false });
console.log("world.start", world.start?.race, world.start?.at, "plan places", world.plan?.places?.length);
host.join({ id: HOST_PLAYER, hero: hero("Ada", race, "sword"), progress: { gold: 40 }, ...spawnFor(world, race) });
host.populate();
const battle = host.battle;
const me = battle.actor(HOST_PLAYER);
const kinds = () => { const k = {}; for (const a of battle.actors) k[a.kind] = (k[a.kind] ?? 0) + 1; return JSON.stringify(k); };
const steps = (n) => { const s = performance.now(); for (let i = 0; i < n; i++) host.advance(STEP_MS); return (performance.now() - s) / n; };
console.log("start: actors", battle.actors.length, kinds(), "links", battle.links.length);
console.log("ms/step over 200 steps:", steps(200).toFixed(3));
console.log("after 10 s: actors", battle.actors.length, kinds(), "links", battle.links.length);
if (battleSize) {
    host.command(HOST_PLAYER, { type: "fieldBattle", size: battleSize, facing: 0 });
    host.command(HOST_PLAYER, { type: "invade" });
}
console.log("ms/step over 600 steps:", steps(600).toFixed(3));
console.log("after 40 s: actors", battle.actors.length, kinds(), "links", battle.links.length, "invasions", host.invasions.length, "fields", host.fields?.length);

const DRAW_REACH = 160;
const mapId = me.map;
const inSight = (actor, mine) => actor.map === mapId && !(mine && actor !== mine && (Math.abs(actor.x - mine.x) > DRAW_REACH || Math.abs(actor.y - mine.y) > DRAW_REACH));
const lastAttack = new Map();
const fighting = (actor) => {
    if (actor.neutral) return false;
    if (actor.attack || battle.time - (lastAttack.get(actor.id) ?? -Infinity) < 2500) return true;
    const reach = longestReach(actor.weapon) + 2;
    return battle.actors.some((other) => !other.dead && other.map === actor.map && Math.hypot(other.x - actor.x, other.y - actor.y) <= reach && battle.hostile(other, actor) && battle.canSee(actor, other));
};
const passes = {
    // game.js:4084 (inside the pass over everyone at 4018)
    "guard (#fighting for each in sight)": () => { let n = 0; for (const actor of battle.actors) { if (!inSight(actor, me)) continue; n += !actor.dead && actor.armed && fighting(actor) ? 1 : 0; } return n; },
    // game.js:4195
    "buffs linger": () => { let n = 0; for (const actor of battle.actors) for (const { kind } of actor.buffs ?? []) n += kind !== "invisibility" ? 1 : 0; return n; },
    // game.js:4214
    "inFight": () => inFight(me, battle.actors, (a, b) => battle.hostile(a, b), Infinity) ? 1 : 0,
    // game.js:7912 #threats
    "#threats": () => { const near = (a) => Math.hypot(a.x - me.x, a.y - me.y); return battle.actors.filter((a) => !a.dead && a.map === me.map && (a.target === me.id || a.attack?.target === me.id) && battle.hostile(a, me)).sort((a, b) => near(a) - near(b)).slice(0, 6).length; },
    // game.js:7952 #attackers (the filter only)
    "#attackers filter": () => battle.actors.filter((a) => (!a.dead && a.map === me.map && (a.target === me.id || a.attack?.target === me.id) && battle.hostile(a, me))).length,
    // game.js:18854 #underAttack
    "#underAttack": () => battle.actors.some((o) => (o.target === me.id || o.attack?.target === me.id) && !o.dead && o.map === me.map && battle.hostile(o, me)) ? 1 : 0,
    // game.js:11607 #partyIcons foesOn
    "#partyIcons foesOn": () => { const ids = new Set([me.id]); let n = 0; for (const a of battle.actors) { if (!a.dead && a.target !== null && ids.has(a.target) && battle.hostile(a, battle.actor(a.target))) n++; } return n; },
    // game.js:16333 #ailing
    "#ailing": () => { let n = 0; for (const a of battle.actors) { if ((!a.afflictions?.length && !a.buffs?.length) || a.dead) continue; n++; } return n; },
    // game.js:4365 bars wanted
    "bars wanted": () => { let n = 0; for (const a of battle.actors) { if (a.kind !== "soldier") continue; n += !a.dead && (battle.hostile(a, me) || a.hp < a.maxHp) ? 1 : 0; } return n; },
    // game.js:2067 #lightGlobes
    "#lightGlobes": () => { let n = 0; for (const a of battle.actors) n += a.map === mapId && !a.dead && battle.buffOf(a, "light") ? 1 : 0; return n; },
    // game.js:13331 + 13396 #wildWays (two passes)
    "#wildWays x2": () => { let n = 0; for (const a of battle.actors) n += a.hidden === true ? 1 : 0; for (const a of battle.actors) n += a.dead || a.hidden || a.map !== mapId ? 0 : 1; return n; },
    // game.js:6236-6246 minimap (30 a second): three filters and maps
    "minimap others/elites/criers (30 Hz)": () => battle.actors.filter((o) => o !== me && !o.dead && !o.lurking && !o.hidden && o.map === mapId && !o.wild?.elite).map((o) => ({ x: o.x, z: o.y, hostile: battle.hostile(o, me), targeted: false, ally: false })).length + battle.actors.filter((o) => o.wild?.elite && !o.dead && o.map === mapId).length + battle.actors.filter((o) => /crier/.test(o.id) && o.map === mapId).length,
    // game.js:3789 #remember (once a step)
    "linkAt (#stepIn)": () => linkAt(battle.links, me.map, [Math.floor(me.x), Math.floor(me.y)]) ? 1 : 0,
};
const inSightCount = battle.actors.filter((a) => inSight(a, me)).length;
console.log(`in sight ${inSightCount} of ${battle.actors.length}; armed&alive in sight ${battle.actors.filter((a) => inSight(a, me) && !a.dead && a.armed).length}; attacking ${battle.actors.filter((a) => a.attack).length}`);
for (const [name, pass] of Object.entries(passes)) {
    const out = [];
    for (let run = 0; run < 3; run++) { const N = 300; const s = performance.now(); let x = 0; for (let i = 0; i < N; i++) x += pass(); out.push(((performance.now() - s) / N * 1000).toFixed(1)); }
    console.log(`${name.padEnd(40)} us/frame: ${out.join("  ")}`);
}
// war save growth
const size = (label) => { const s = performance.now(); const snap = host.war.snapshot(); const text = encode({ created: 1, seed, war: snap, legends: host.legends?.toJSON?.() ?? null }); console.log(`${label}: war save ${text.length} chars, snapshot+encode ${(performance.now() - s).toFixed(2)} ms`); };
size(`turn ${host.war.turn}`);
for (const turns of [60, 120, 180, 360]) { while (host.war.turn < turns) host.war.step(); size(`turn ${host.war.turn}`); }
