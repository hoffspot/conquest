// What the minimap's icons cost to gather, as game.js #drawMinimap does 30 times a second
// (6251: icons(), placeIcons(), dungeonIcons(), denIcons(), worksIcons(), fortIcons()...): the
// parts made again every call, replayed on a real world's war (seed 3, three hours in).
import { Host, HOST_PLAYER } from "/home/user/conquest/client/js/core/host.js";
import { buildWorld } from "/home/user/conquest/client/js/core/overworld.js";
import { densOf } from "/home/user/conquest/client/js/core/dens.js";
import { placesOf } from "/home/user/conquest/client/js/core/places.js";
const hero = (name, race, weapon) => ({ name, race, weapon, boots: false, shape: {}, look: {} });
const world = buildWorld({ seed: 3 });
const host = new Host(world, { populate: false });
host.join({ id: HOST_PLAYER, hero: hero("Ada", "human", "sword"), progress: { gold: 40 } });
const war = host.war;
while (war.turn < 180) war.step();
const plan = world.plan;
const mine = host.players.get(HOST_PLAYER).realm;
console.log(`works ${war.works.length}, forts ${war.forts.length}, places ${placesOf(plan).length}, dens ${densOf(plan).length}, dungeons ${plan.sites.filter(({ kind }) => kind === "dungeon").length}, sites ${plan.sites.length}; JSON.stringify(war.places) ${JSON.stringify(war.places).length} chars`);
const whose = (realm, stance) => { const people = String(realm); const theirs = `the ${people}${people.endsWith("s") ? "'" : "'s"}`; return realm === mine ? "your people's" : stance === "own" ? `${theirs}, your allies'` : stance === "enemy" ? `${theirs}, at war with yours` : theirs; };
const sites = world.maps.town?.sites;
const worksIcons = () => war.works.map((works) => { const [x, z] = sites?.set.get(works.id)?.heart ?? works.at; const stance = works.held ? "held" : mine && war.friendly(mine, works.owner) ? "own" : mine && war.hostile(mine, works.owner) ? "enemy" : "other"; return { id: works.id, kind: works.kind, x, z, rim: stance, about: `The ${works.name} ${works.kind}: ${stance === "held" ? "held by brigands" : whose(works.owner, stance)}` }; });
const fortIcons = () => war.forts.map((fort) => { const stance = mine && war.friendly(mine, fort.realm) ? "own" : mine && war.hostile(mine, fort.realm) ? "enemy" : "other"; return { id: fort.id, kind: fort.kind, x: fort.at[0], z: fort.at[1], rim: stance, own: stance === "own", about: `${fort.kind}: ${whose(fort.realm, stance)}` }; });
const placeKey = () => `${war.turn}:${sites?.set.size ?? 0}:${world.maps.town?.campSpots?.size ?? 0}:${JSON.stringify(war.places)}`;
const dungeons = plan.sites.filter(({ kind }) => kind === "dungeon").map((site) => ({ id: site.id, about: site.name ? `${site.name} (dungeon)` : "Dungeon", rim: null }));
const dungeonIcons = () => { for (const icon of dungeons) { const cleared = Boolean(host.dungeons?.get(icon.id)?.cleared); icon.rim = cleared ? 1 : null; icon.about = `${icon.about.replace(/: cleared.*$/, "")}${cleared ? ": cleared, till something new stirs in it" : ""}`; } return dungeons; };
const all = () => [...worksIcons(), ...fortIcons(), ...dungeonIcons()].length + placeKey().length;
const time = (label, fn) => { const out = []; for (let run = 0; run < 3; run++) { const N = 2000; const s = performance.now(); let x = 0; for (let i = 0; i < N; i++) x += fn().length; out.push(((performance.now() - s) / N * 1000).toFixed(1)); } console.log(`${label.padEnd(34)} us a call: ${out.join(" / ")}`); };
time("worksIcons()", worksIcons);
time("fortIcons()", fortIcons);
time("placeIcons() key (JSON.stringify)", placeKey);
time("dungeonIcons() loop", dungeonIcons);
globalThis.gc?.();
const before = process.memoryUsage().heapUsed; const N = 3000; const s = performance.now();
for (let i = 0; i < N; i++) all();
console.log(`all four: ${((performance.now() - s) / N * 1000).toFixed(1)} us and ${((process.memoryUsage().heapUsed - before) / N / 1024).toFixed(1)} KB of garbage a call; at 30 a second ${(((process.memoryUsage().heapUsed - before) / N) * 30 / 1024).toFixed(0)} KB/s`);
