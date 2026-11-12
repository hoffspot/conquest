// Garbage a call (V8, by what each scavenge freed) of a few of the frame's own gatherings, over a
// real battle (seed 3: a field battle of 4 a side and an invasion, 173 actors).
import { STEP_MS } from "/home/user/conquest/client/js/core/battle.js";
import { Host, HOST_PLAYER } from "/home/user/conquest/client/js/core/host.js";
import { buildWorld } from "/home/user/conquest/client/js/core/overworld.js";
const hero = (name, race, weapon) => ({ name, race, weapon, boots: false, shape: {}, look: {} });
const world = buildWorld({ seed: 3 });
const host = new Host(world, { populate: false });
host.join({ id: HOST_PLAYER, hero: hero("Ada", "human", "sword"), progress: { gold: 40 } });
host.populate();
const battle = host.battle; const me = battle.actor(HOST_PLAYER);
for (let i = 0; i < 200; i++) host.advance(STEP_MS);
host.command(HOST_PLAYER, { type: "fieldBattle", size: 4, facing: 0 });
host.command(HOST_PLAYER, { type: "invade" });
for (let i = 0; i < 600; i++) host.advance(STEP_MS);
console.log(`actors ${battle.actors.length}`);
const mapId = me.map; let sink = 0;
const measure = (name, calls, fn) => { for (let i = 0; i < 300; i++) fn(i); console.log(`BEGIN ${name}`); for (let i = 0; i < calls; i++) fn(i); console.log(`END ${name} ${calls}`); };
// game.js 6236-6246 (30 a second)
measure("minimap others+elites+criers (30 Hz)", 20000, () => { sink += battle.actors.filter((o) => o !== me && !o.dead && !o.lurking && !o.hidden && o.map === mapId && !o.wild?.elite && !/crier/.test(o.id)).map((o) => ({ x: o.x, z: o.y, hostile: battle.hostile(o, me), targeted: false, ally: false })).length + battle.actors.filter((o) => o.wild?.elite && !o.dead && o.map === mapId).map((o) => ({ x: o.x, z: o.y, targeted: false })).length + battle.actors.filter((o) => /crier/.test(o.id) && o.map === mapId).map((o) => ({ x: o.x, z: o.y })).length; });
// game.js 7912-7915 and 7952-7976 (every frame)
measure("#threats + #attackers lists (a frame)", 20000, () => {
    const near = (a) => Math.hypot(a.x - me.x, a.y - me.y);
    sink += battle.actors.filter((a) => !a.dead && a.map === me.map && (a.target === me.id || a.attack?.target === me.id) && battle.hostile(a, me)).sort((a, b) => near(a) - near(b)).slice(0, 3).length;
    const after = battle.actors.filter((a) => (!a.dead && a.map === me.map && (a.target === me.id || a.attack?.target === me.id) && battle.hostile(a, me)));
    const listed = new Set(after.map(({ id }) => id)); const ring = [...after]; const shown = [...ring].slice(0, 6); const fighting = new Set(after.map(({ id }) => id));
    sink += shown.map((a) => ({ id: a.id, name: a.name ?? "", hp: a.hp, maxHp: a.maxHp, target: false, locked: false, attacking: fighting.has(a.id), picture: null, standing: null, on: null })).length + listed.size + ring.map(({ id }) => id).length;
});
// game.js 7077 host.engagements() (each minimap draw: battleView)
measure("host.engagements() (30 Hz)", 20000, () => { sink += host.engagements().length; });
// game.js 15384 host.partyOf + fellows (each frame: #party, #partyIcons)
measure("host.partyOf + fellows x2 (a frame)", 20000, () => { sink += host.partyOf(HOST_PLAYER).length + host.fellows(HOST_PLAYER).length + host.fellows(HOST_PLAYER).length; });
