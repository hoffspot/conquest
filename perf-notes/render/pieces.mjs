import { load } from "./harness.mjs";
const { buildWorld, CHUNK, CHUNKS } = await load("core/overworld.js");
const world = buildWorld({ seed: 1 });
const ow = world.maps.town;
const s = ow.settlements;
for (const id of ["human-capital-1", "human-city-1", "elf-capital-1", "orc-capital-1", "human-town-2"]) {
    const place = s.places.find((p) => p.id === id);
    if (!place) { console.log(id, "none"); continue; }
    const [x, z] = place.at;
    const [cx, cy] = [Math.floor(x / CHUNK), Math.floor(z / CHUNK)];
    let total = 0; const per = [];
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { ow.chunk(cx + dx, cy + dy); const n = s.piecesIn(cx + dx, cy + dy).length; total += n; per.push(n); }
    console.log(id, place.at, "radius", place.radius, "pieces in 5x5", total, per.join(","), "start?", world.start?.id);
}
