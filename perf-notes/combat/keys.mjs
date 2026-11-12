// Every property a battle's actors come to have over the field battle and a walk out of the start
// town, beyond those `add` gives each: for the one-shape variant (oneshape.py).
import { STEP_MS } from "/home/user/conquest/client/js/core/battle.js";
import { Host, HOST_PLAYER } from "/home/user/conquest/client/js/core/host.js";
import { buildWorld } from "/home/user/conquest/client/js/core/overworld.js";
import { squaresOf } from "/home/user/conquest/client/js/core/grid.js";
import { writeFileSync } from "node:fs";

const real = buildWorld({ seed: 2 });
const seen = new Map();
const note = (host) => {
    for (const actor of host.battle.actors) {
        for (const key of Object.keys(actor)) {
            seen.set(key, (seen.get(key) ?? 0) + 1);
        }
    }
};

{
    const host = new Host(real, { populate: false });

    host.join({ id: HOST_PLAYER, hero: { name: "Ada", shape: {}, look: {}, weapon: "bow", boots: false } });

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

    host.command(HOST_PLAYER, { type: "fieldBattle", size: 50, facing: Math.PI });

    for (let t = 0; t < 75000; t += STEP_MS) {
        host.advance(STEP_MS);

        if (t % 500 === 0) {
            note(host);
        }
    }
}

{
    const host = new Host(real, { populate: true });

    host.join({ id: HOST_PLAYER, hero: { name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false } });

    const me = host.battle.actor(HOST_PLAYER);
    const [x0, y0] = [me.x, me.y];

    for (let t = 0; t < 90000; t += STEP_MS) {
        if (t % 6000 === 0) {
            const k = t / 6000;

            host.command(HOST_PLAYER, { type: "move", to: [Math.round(x0 + Math.cos(k * 1.3) * (20 + 12 * k)), Math.round(y0 + Math.sin(k * 1.3) * (20 + 12 * k))], run: k % 2 === 0 });
        }

        host.advance(STEP_MS);

        if (t % 500 === 0) {
            note(host);
        }
    }
}

const most = Math.max(...seen.values());
const optional = [...seen].filter(([, count]) => count < most).map(([key]) => key);

console.log(`${seen.size} properties in all; ${optional.length} not on every actor: ${optional.join(", ")}`);
writeFileSync(new URL("./optional-keys.json", import.meta.url), JSON.stringify(optional));
