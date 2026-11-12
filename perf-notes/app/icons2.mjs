import { Host, HOST_PLAYER } from "/home/user/conquest/client/js/core/host.js";
import { buildWorld } from "/home/user/conquest/client/js/core/overworld.js";
import { Governor } from "/home/user/conquest/client/js/app/governor.js";
import { Throng } from "/home/user/conquest/client/js/app/throng.js";
import { InvasionBudget } from "/home/user/conquest/client/js/app/budget.js";
const hero = (name, race, weapon) => ({ name, race, weapon, boots: false, shape: {}, look: {} });
const world = buildWorld({ seed: 3 });
const host = new Host(world, { populate: false });
host.join({ id: HOST_PLAYER, hero: hero("Ada", "human", "sword"), progress: { gold: 40 } });
const war = host.war;
while (war.turn < 180) war.step();
const mine = host.players.get(HOST_PLAYER).realm;
const whose = (realm, stance) => { const people = String(realm); const theirs = `the ${people}${people.endsWith("s") ? "'" : "'s"}`; return realm === mine ? "your people's" : stance === "own" ? `${theirs}, your allies'` : stance === "enemy" ? `${theirs}, at war with yours` : theirs; };
const sites = world.maps.town?.sites;
const worksIcons = () => war.works.map((works) => { const [x, z] = sites?.set.get(works.id)?.heart ?? works.at; const stance = works.held ? "held" : mine && war.friendly(mine, works.owner) ? "own" : mine && war.hostile(mine, works.owner) ? "enemy" : "other"; return { id: works.id, kind: works.kind, x, z, rim: stance, about: `The ${works.name} ${works.kind}: ${stance === "held" ? "held by brigands" : whose(works.owner, stance)}` }; });
const fortIcons = () => war.forts.map((fort) => { const stance = mine && war.friendly(mine, fort.realm) ? "own" : mine && war.hostile(mine, fort.realm) ? "enemy" : "other"; return { id: fort.id, kind: fort.kind, x: fort.at[0], z: fort.at[1], rim: stance, own: stance === "own", about: `${fort.kind}: ${whose(fort.realm, stance)}` }; });
const dungeons = world.plan.sites.filter(({ kind }) => kind === "dungeon").map((site) => ({ id: site.id, about: site.name ? `${site.name} (dungeon)` : "Dungeon", rim: null }));
const dungeonIcons = () => { for (const icon of dungeons) { const cleared = Boolean(host.dungeons?.get(icon.id)?.cleared); icon.rim = cleared ? 1 : null; icon.about = `${icon.about.replace(/: cleared.*$/, "")}${cleared ? ": cleared, till something new stirs in it" : ""}`; } return dungeons; };
const measure = (name, calls, fn) => { for (let i = 0; i < 200; i++) fn(i); console.log(`BEGIN ${name}`); for (let i = 0; i < calls; i++) fn(i); console.log(`END ${name} ${calls}`); };
let sink = 0;
measure("minimap icons: works+forts+dungeons", 20000, () => { sink += [...worksIcons(), ...fortIcons(), ...dungeonIcons()].length; });
// The three judges of the frames, each once its window's full (60 frames a second)
const jitter = (now) => 16.667 + ((now * 7919) % 10) / 10 - 0.5;
for (const [name, make, call] of [
    ["governor.observe (a frame)", () => new Governor(), (g, now) => g.observe(now, jitter(now))],
    ["throng.observe (a frame)", () => new Throng(), (t, now) => t.observe(now, jitter(now), { crowdable: 12, inFull: 12 })],
    ["invasionBudget.observe (a frame)", () => new InvasionBudget(), (b, now) => b.observe(now, jitter(now), 6 + ((now * 31) % 10) / 10, "low")],
]) {
    const it = make(); let now = 0;
    for (let i = 0; i < 1500; i++) { now += 16.667; call(it, now); }
    console.log(`BEGIN ${name}`); for (let i = 0; i < 6000; i++) { now += 16.667; call(it, now); } console.log(`END ${name} 6000`);
}
