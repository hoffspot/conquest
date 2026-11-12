// What a building's inside costs to make the first time it's gone into (core/insides.js
// Interiors.make): a dungeon's levels all at once, and a town's buildings; and its navigation.
const ROOT = "/home/user/conquest/client/js/core";
const { buildWorld } = await import(`${ROOT}/overworld.js`);
const { navigatorOf } = await import(`${ROOT}/navigation.js`);

const cpu = () => {
    const { user, system } = process.threadCpuUsage();

    return (user + system) / 1000;
};
const wall = () => performance.now();
const stats = (list) => {
    const sorted = [...list].sort((a, b) => a - b);
    const at = (share) => sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))];

    return sorted.length ? { n: sorted.length, mean: +(sorted.reduce((a, b) => a + b, 0) / sorted.length).toFixed(2), p50: +at(0.5).toFixed(2), p90: +at(0.9).toFixed(2), max: +sorted.at(-1).toFixed(2) } : null;
};

const world = buildWorld({ seed: Number(process.argv[2] ?? 2) });
const overworld = world.maps.town;
const dungeons = world.plan.sites.filter(({ kind }) => kind === "dungeon");

console.log(`${dungeons.length} dungeons planned; ${world.plan.sites.length} sites; ${world.plan.places.length} places`);

const made = [];
const cpus = [];
const levels = [];
const squares = [];
const nav = [];

for (const site of dungeons.slice(0, 12)) {
    overworld.chunkAt(Math.floor(site.at[0]), Math.floor(site.at[1]));

    const building = world.interiors.buildings.get(`site:${site.id}`);

    if (!building) {
        continue;
    }

    const [w0, c0] = [wall(), cpu()];

    world.interiors.make(building.key);
    made.push(wall() - w0);
    cpus.push(cpu() - c0);
    levels.push(building.maps.length);
    squares.push(building.maps.reduce((sum, id) => sum + world.maps[id].width * world.maps[id].height, 0));

    // (Its first level's navigation, every tile: what going in waits for if it isn't baked ahead)
    const map = world.maps[building.maps[0]];
    const navigation = navigatorOf(map);
    const { tile } = navigation.measures;
    const n0 = wall();
    let tiles = 0;

    for (let ty = 0; ty * tile < navigation.size[1]; ty++) {
        for (let tx = 0; tx * tile < navigation.size[0]; tx++) {
            navigation.ensure(tx, ty);
            tiles++;
        }
    }

    nav.push((wall() - n0) / tiles);
}

console.log(`dungeon make, wall ms: ${JSON.stringify(stats(made))}`);
console.log(`dungeon make, cpu ms: ${JSON.stringify(stats(cpus))} (each: ${cpus.map((ms) => Math.round(ms)).join(", ")})`);
console.log(`levels each: ${levels.join(", ")}; squares each: ${squares.join(", ")}`);
console.log(`a level's navigation tile, wall ms each (mean over its tiles): ${JSON.stringify(stats(nav))}`);

// (A town's buildings)
const others = [...world.interiors.buildings.values()].filter(({ made, kind }) => !made && kind !== "dungeon" && kind !== "scenery");
const town = [];
const byKind = new Map();

for (const building of others.slice(0, 200)) {
    const w0 = wall();

    world.interiors.make(building.key);

    const ms = wall() - w0;

    town.push(ms);
    byKind.set(building.kind, [...(byKind.get(building.kind) ?? []), ms]);
}

console.log(`other buildings made (${town.length}), wall ms: ${JSON.stringify(stats(town))}`);
console.log([...byKind].map(([kind, list]) => `${kind} ${stats(list).mean}`).join("; "));
console.log(`maps ${Object.keys(world.maps).length}, links ${world.links.length}, heap ${Math.round(process.memoryUsage().heapUsed / 2 ** 20)} MB`);
