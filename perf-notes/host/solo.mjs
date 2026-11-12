// One player's own world, as the browser game hosts it (core/navigation.js KEEP_ROOMS as it is,
// nothing made ahead off the thread): how many rooms' navigation meshes are made as time goes by
// with the player standing in a town (each `new NavMesh` is one map's mesh made, or made again
// after it was let go of), and the steps' cost.
//
//     node solo.mjs [--race human] [--seconds 300] [--seed 2] [--capital]
import { parseArgs } from "node:util";

const ROOT = "/home/user/conquest/client/js/core";
const { loadRecast, wasmBytes } = await import(`${ROOT}/navigation/recast.js`);
const recast = await loadRecast();
let meshes = 0;
const initTiled = recast.NavMesh.prototype.initTiled;

recast.NavMesh.prototype.initTiled = function (...given) {
    meshes++;

    return initTiled.apply(this, given);
};

const { STEP_MS } = await import(`${ROOT}/battle.js`);
const { Host } = await import(`${ROOT}/host.js`);
const { buildWorld } = await import(`${ROOT}/overworld.js`);
const { startFor } = await import(`${ROOT}/worldplan/plan.js`);

const { values } = parseArgs({ options: { race: { type: "string", default: "human" }, seconds: { type: "string", default: "300" }, seed: { type: "string", default: "2" }, capital: { type: "boolean", default: false } } });
const world = buildWorld({ seed: Number(values.seed), race: values.race });
const host = new Host(world, { populate: false });
const hero = { name: "Solo", race: values.race, shape: {}, look: {}, weapon: "sword", boots: false };
let square;

if (values.capital) {
    const capital = world.plan.places.filter(({ kind }) => kind === "capital").sort((a, b) => b.radius - a.radius)[0];

    square = [Math.round(capital.at[0]), Math.round(capital.at[1])];
    console.log(`at the capital ${capital.name ?? capital.id} (${capital.owner ?? capital.race ?? ""})`);
}

host.join({ id: "player", hero, ...(square ? { square, map: "town" } : {}) });
host.populate();

const cpu = () => {
    const { user, system } = process.threadCpuUsage();

    return (user + system) / 1000;
};
let last = cpu();
let lastMeshes = 0;

for (let t = 0; t < Number(values.seconds) * 1000; t += STEP_MS) {
    if (t % 60000 === 0 && t) {
        const me = host.battle.actor("player");

        host.command("player", { type: "move", to: [Math.round(me.x) + (t % 120000 ? 1 : -1), Math.round(me.y)] });
    }

    host.advance(STEP_MS);

    if ((t + STEP_MS) % 30000 === 0) {
        const now = cpu();
        const roomMaps = [...host.open.keys()].reduce((sum, key) => sum + (world.interiors.buildings.get(key)?.maps.length ?? 0), 0);

        console.log(`${String((t + STEP_MS) / 1000).padStart(4)} s: ${((now - last) / 600).toFixed(2)} ms cpu a step; meshes made so far ${meshes} (+${meshes - lastMeshes}); open buildings ${host.open.size}, their floors ${roomMaps}; actors ${host.battle.actors.length}; wasm ${Math.round(wasmBytes() / 2 ** 20)} MB; heap ${Math.round(process.memoryUsage().heapUsed / 2 ** 20)} MB`);
        last = now;
        lastMeshes = meshes;
    }
}
