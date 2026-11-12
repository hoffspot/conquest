// Whether the host's look round (core/host.js advance: every RELEVANCE.every, #lookAround and the
// rest) costs more once more of the world has been made (a long session's: every settlement laid
// out, every site set down, so every building known): the steps that look, and those that don't,
// before and after.
const ROOT = "/home/user/conquest/client/js/core";
const { STEP_MS } = await import(`${ROOT}/battle.js`);
const { Host } = await import(`${ROOT}/host.js`);
const { buildWorld } = await import(`${ROOT}/overworld.js`);

const world = buildWorld({ seed: 2 });
const host = new Host(world, { populate: false });

host.join({ id: "player", hero: { name: "Solo", race: "human", shape: {}, look: {}, weapon: "sword", boots: false } });
host.populate();

const run = (label) => {
    const looks = [];
    const others = [];

    for (let k = 0; k < 2400; k++) {
        const looking = host.battle.time + STEP_MS >= host.lookAt;
        const t0 = performance.now();

        host.advance(STEP_MS);
        (looking ? looks : others).push(performance.now() - t0);
    }

    const median = (list) => [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)];
    const low = (list) => [...list].sort((a, b) => a - b)[Math.floor(list.length / 10)];

    console.log(`${label}: buildings known ${world.interiors.buildings.size}; a step that looks round ${median(looks).toFixed(2)} ms at the median (${low(looks).toFixed(2)} at the 10th centile), one that doesn't ${median(others).toFixed(2)} ms; ${host.battle.actors.length} in the world`);
};

for (let t = 0; t < 30000; t += STEP_MS) {
    host.advance(STEP_MS);
}

run("as the game begins");

for (const place of world.maps.town.settlements.places) {
    world.maps.town.settlements.of(place);
}

for (const site of world.plan.sites) {
    world.maps.town.sites.heartOf(site);
}

run("the whole world made");
