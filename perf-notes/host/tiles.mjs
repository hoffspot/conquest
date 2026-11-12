// What a navigation tile costs on the thread that asks for it: its triangles worked out (core/
// navigation.js input: always here, the worker only runs Recast), and Recast's part (in the
// worker in the browser and on the server; here when a way can't wait); and a room's tile.
const ROOT = "/home/user/conquest/client/js/core";
const { buildWorld, CHUNK } = await import(`${ROOT}/overworld.js`);
const { navigatorOf } = await import(`${ROOT}/navigation.js`);
const { bakeTile } = await import(`${ROOT}/navigation/bake.js`);
const { loadRecast } = await import(`${ROOT}/navigation/recast.js`);
const { startFor } = await import(`${ROOT}/worldplan/plan.js`);

const recast = await loadRecast();
const cpu = () => {
    const { user, system } = process.threadCpuUsage();

    return (user + system) / 1000;
};
const world = buildWorld({ seed: 2 });
const overworld = world.maps.town;
const navigation = navigatorOf(overworld);

for (const race of ["human", "orc"]) {
    const { at } = startFor(world.plan, race);
    const [cx, cy] = [Math.floor(at[0] / CHUNK), Math.floor(at[1] / CHUNK)];

    for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
            overworld.chunk(cx + dx, cy + dy);
        }
    }

    const [tx0, ty0] = navigation.tileOf(at[0] - 160, at[1] - 160);
    const inputs = [];
    let c0 = cpu();

    for (let ty = ty0; ty < ty0 + 10; ty++) {
        for (let tx = tx0; tx < tx0 + 10; tx++) {
            inputs.push([tx, ty, navigation.input(tx, ty)]);
        }
    }

    const inputMs = (cpu() - c0) / inputs.length;
    const bytes = inputs.reduce((sum, [, , input]) => sum + input.positions.byteLength + input.indices.byteLength + input.areas.byteLength, 0) / inputs.length;

    c0 = cpu();

    for (const [tx, ty, input] of inputs) {
        bakeTile(recast, input, tx, ty);
    }

    console.log(`${race}'s town, 100 tiles: triangles ${inputMs.toFixed(2)} ms cpu a tile (${Math.round(bytes / 1024)} KB sent to the worker each); Recast ${((cpu() - c0) / inputs.length).toFixed(2)} ms cpu a tile`);
}

// (A room's: a tavern's floors, a dungeon's level)
for (const building of world.interiors.buildings.values()) {
    if (building.kind !== "tavern" && building.kind !== "keep") {
        continue;
    }

    world.interiors.make(building.key);

    for (const id of building.maps) {
        const room = navigatorOf(world.maps[id]);
        const { tile } = room.measures;
        let tiles = 0;
        const c0 = cpu();

        for (let ty = 0; ty * tile < room.size[1]; ty++) {
            for (let tx = 0; tx * tile < room.size[0]; tx++) {
                room.ensure(tx, ty);
                tiles++;
            }
        }

        console.log(`${building.kind} ${id}: ${room.size.join("×")} squares, ${tiles} tile(s), ${((cpu() - c0) / tiles).toFixed(1)} ms cpu a tile`);
    }
}
