// What the world keeps for good once it's been made near: each settlement's layout (core/
// settlements.js Settlements.laid), the sites set down, the buildings known (core/insides.js). The
// heap after laying out more and more of the world's places (a long session's end state), and each
// kind's own cost. Run with --expose-gc.
const ROOT = "/home/user/conquest/client/js/core";
const { buildWorld, CHUNK } = await import(`${ROOT}/overworld.js`);
const { squareOf } = await import(`${ROOT}/settlements.js`);

const heap = () => {
    globalThis.gc?.();
    globalThis.gc?.();

    const { heapUsed, arrayBuffers } = process.memoryUsage();

    return (heapUsed + arrayBuffers) / 2 ** 20;
};
const cpu = () => {
    const { user, system } = process.threadCpuUsage();

    return (user + system) / 1000;
};

const base0 = heap();
const world = buildWorld({ seed: Number(process.argv[2] ?? 2) });
const overworld = world.maps.town;
const settlements = overworld.settlements;
const built = heap();

console.log(`before the world ${base0.toFixed(0)} MB; the world built ${built.toFixed(0)} MB (the plan, the overworld, the start town)`);

const byKind = new Map();
let count = 0;

for (const kind of ["capital", "city", "town", "village", "hamlet", "farmstead"]) {
    const places = settlements.places.filter((place) => place.kind === kind);
    const before = heap();
    const c0 = cpu();
    const times = [];

    for (const place of places) {
        const t0 = cpu();

        settlements.of(place);
        times.push(cpu() - t0);
        count++;
    }

    const after = heap();

    byKind.set(kind, { places: places.length, side: places[0] ? squareOf(places[0]).size : 0, MBeach: +((after - before) / Math.max(1, places.length)).toFixed(2), MB: +(after - before).toFixed(1), cpuMsEach: +((cpu() - c0) / Math.max(1, places.length)).toFixed(1), cpuMsMost: Math.round(Math.max(0, ...times)) });
}

console.log(JSON.stringify(Object.fromEntries(byKind), null, 1));

const laid = heap();

console.log(`all ${count} settlements laid out: ${laid.toFixed(0)} MB (+${(laid - built).toFixed(0)} MB kept for good); buildings known ${world.interiors.buildings.size}; links ${world.links.length}`);

// (The sites set down: as the chunk each is in is made)
const c1 = cpu();

for (const site of world.plan.sites) {
    overworld.sites.heartOf(site);
}

const sited = heap();

console.log(`all ${world.plan.sites.length} sites set down: ${sited.toFixed(0)} MB (+${(sited - laid).toFixed(1)} MB), ${Math.round(cpu() - c1)} ms cpu; buildings known ${world.interiors.buildings.size}; links ${world.links.length}`);

// (And every building's inside made: what Host.snapshot's `made` would bring back on a restore)
const c2 = cpu();
let made = 0;

for (const building of [...world.interiors.buildings.values()]) {
    if (!building.made && building.kind !== "dungeon") {
        world.interiors.make(building.key);
        made++;
    }
}

const insides = heap();

console.log(`${made} buildings' insides made (no dungeons): ${insides.toFixed(0)} MB (+${(insides - sited).toFixed(1)} MB), ${Math.round(cpu() - c2)} ms cpu; maps ${Object.keys(world.maps).length}`);
