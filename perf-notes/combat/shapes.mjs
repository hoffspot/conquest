// Whether the battle's actors keep V8's fast properties, and how many shapes they have between
// them (node --allow-natives-syntax shapes.mjs [field|bench]).
import { STEP_MS, Battle } from "/home/user/conquest/client/js/core/battle.js";
import { Host, HOST_PLAYER } from "/home/user/conquest/client/js/core/host.js";
import { buildWorld } from "/home/user/conquest/client/js/core/overworld.js";
import { squaresOf } from "/home/user/conquest/client/js/core/grid.js";
import { muster } from "./bench.mjs";

const fast = new Function("o", "return %HasFastProperties(o)");
const sameMap = new Function("a", "b", "return %HaveSameMap(a, b)");

function report(label, actors) {
    const shapes = [];

    for (const actor of actors) {
        if (!shapes.some((one) => sameMap(one[0], actor))) {
            shapes.push([actor]);
        } else {
            shapes.find((one) => sameMap(one[0], actor)).push(actor);
        }
    }

    const keys = actors.map((actor) => Object.keys(actor).length);

    if (process.env.KEYS) {
        // (Each shape's keys beyond the first 100 or so every actor's made with, in order; and how
        // its fields that differ in kind are kept)
        const base = Object.keys(shapes.reduce((a, b) => (Object.keys(a[0]).length <= Object.keys(b[0]).length ? a : b))[0]);

        for (const one of shapes) {
            const keys = Object.keys(one[0]);
            const extra = keys.filter((key) => !base.includes(key));
            const missing = base.filter((key) => !keys.includes(key));

            console.log(`    ${String(one.length).padStart(3)} x ${one[0].kind}/${one[0].ai}: +[${extra.join(", ")}] -[${missing.join(", ")}] (${keys.length} keys; key order ${keys.slice(100).join(",")})`);
        }
    }

    console.log(`${label}: ${actors.length} actors, ${actors.filter((actor) => fast(actor)).length} with fast properties, ${shapes.length} shapes (the biggest of ${Math.max(...shapes.map((one) => one.length))}); ${Math.min(...keys)} to ${Math.max(...keys)} properties each`);
}

if (process.argv[2] === "bench") {
    const world = { blocked: Array.from({ length: 160 }, () => new Uint8Array(160)) };
    const { battle } = muster(100, "lasting", world);

    report("open field, as mustered", battle.actors);

    for (let t = 0; t < 30000; t += STEP_MS) {
        battle.advance(STEP_MS);
    }

    report("open field, 30 s on", battle.actors);
} else {
    const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "bow", boots: false });
    const world = buildWorld({ seed: 2 });
    const host = new Host(world, { populate: process.argv[2] === "populated" });

    host.join({ id: HOST_PLAYER, hero: HERO });
    report("host, as joined", host.battle.actors);

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

    if (process.argv[2] !== "populated") {
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
        report("field battle, as mustered", host.battle.actors);
    }

    for (let t = 0; t < 30000; t += STEP_MS) {
        host.advance(STEP_MS);
    }

    report("30 s on", host.battle.actors);

    const again = Host.restore(world, host.snapshot());

    report("restored from a snapshot", again.battle.actors);

    for (let t = 0; t < 5000; t += STEP_MS) {
        again.advance(STEP_MS);
    }

    report("restored, 5 s on", again.battle.actors);
}
