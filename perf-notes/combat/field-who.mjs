import { STEP_MS } from "/home/user/conquest/client/js/core/battle.js";
import { Host, HOST_PLAYER } from "/home/user/conquest/client/js/core/host.js";
import { buildWorld } from "/home/user/conquest/client/js/core/overworld.js";
import { squaresOf } from "/home/user/conquest/client/js/core/grid.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "bow", boots: false });
const world = buildWorld({ seed: 2 });
const host = new Host(world, { populate: false });

host.join({ id: HOST_PLAYER, hero: HERO });

const me = host.battle.actor(HOST_PLAYER);
const squares = squaresOf(host.battle.maps.town);
const open = (x0, y0) => {
    for (let y = y0 - 70; y < y0 + 10; y++) {
        for (let x = x0 - 25; x < x0 + 25; x++) {
            if (squares.blocked(x, y) || squares.opaque(x, y)) {
                return false;
            }
        }
    }

    return true;
};

out: for (let r = 60; r < 1500; r += 20) {
    for (let a = 0; a < 24; a++) {
        const [x, y] = [Math.round(me.x + r * Math.cos((a * Math.PI) / 12)), Math.round(me.y + r * Math.sin((a * Math.PI) / 12))];

        if (open(x, y)) {
            host.battle.place(HOST_PLAYER, "town", [x, y], { facing: Math.PI });
            break out;
        }
    }
}

host.command(HOST_PLAYER, { type: "fieldBattle", size: Number(process.argv[2] ?? 50), facing: Math.PI });

const tally = () => {
    const by = {};

    for (const actor of host.battle.actors) {
        const key = `${actor.kind}/${actor.ai}${actor.dead ? "/dead" : ""}${actor.formation ? "/formed" : ""}`;

        by[key] = (by[key] ?? 0) + 1;
    }

    return `${host.battle.actors.length}: ${JSON.stringify(by)}`;
};

for (let t = 0; t <= 60000; t += STEP_MS) {
    if (t % 10000 === 0) {
        console.log(`${t / 1000} s: ${tally()}; formations ${Object.keys(host.battle.formations).length}; projectiles ${host.battle.projectiles.length}`);
    }

    host.advance(STEP_MS);
}
