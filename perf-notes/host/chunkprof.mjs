// A profile of making chunks with their land's heights given beforehand (as the browser's terrain
// worker gives them): what's left on the thread that asks for a chunk.
const ROOT = "/home/user/conquest/client/js/core";
const { buildWorld, CHUNK, CHUNKS } = await import(`${ROOT}/overworld.js`);
const { heightsOf } = await import(`${ROOT}/terrain/height.js`);
const { CORNERS } = await import(`${ROOT}/terrain/ground.js`);
const { startFor } = await import(`${ROOT}/worldplan/plan.js`);

const world = buildWorld({ seed: 2 });
const overworld = world.maps.town;

function giveHeights(cx, cy) {
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            if (cx + dx >= 0 && cy + dy >= 0 && cx + dx < CHUNKS && cy + dy < CHUNKS && !overworld.ground.has(cx + dx, cy + dy)) {
                overworld.ground.give(cx + dx, cy + dy, heightsOf(world.plan, (cx + dx) * CHUNK, (cy + dy) * CHUNK, CORNERS, 1));
            }
        }
    }
}

function makeChunk(cx, cy) {
    return overworld.chunk(cx, cy);
}

let made = 0;

for (const race of ["human", "elf", "orc", "cat", "darkElf", "lizard"]) {
    const { at } = startFor(world.plan, race);
    const [hx, hy] = [Math.floor(at[0] / CHUNK), Math.floor(at[1] / CHUNK)];

    for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
            const [cx, cy] = [hx + dx, hy + dy];

            if (cx < 0 || cy < 0 || cx >= CHUNKS || cy >= CHUNKS || overworld.made(cx * CHUNK, cy * CHUNK, cx * CHUNK, cy * CHUNK)) {
                continue;
            }

            giveHeights(cx, cy);
            makeChunk(cx, cy);
            made++;
        }
    }
}

console.log(`made ${made} chunks`);
