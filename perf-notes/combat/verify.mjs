// Everything that happens in several battles, hashed: run once as the game is and once with a
// variant swapped in (node --import ./swap.mjs verify.mjs), the hashes the same if the variant
// changes nothing.
import { createHash } from "node:crypto";
import { muster } from "./bench.mjs";

const { Battle, STEP_MS } = await import("/home/user/conquest/client/js/core/battle.js");
const { Host, HOST_PLAYER } = await import("/home/user/conquest/client/js/core/host.js");
const { buildWorld } = await import("/home/user/conquest/client/js/core/overworld.js");
const { squaresOf } = await import("/home/user/conquest/client/js/core/grid.js");
const { navigatorOf } = await import("/home/user/conquest/client/js/core/navigation.js");

const hashOf = (value) => createHash("sha1").update(JSON.stringify(value, (key, each) => (typeof each === "number" && !Number.isFinite(each) ? String(each) : each))).digest("hex").slice(0, 16);
const stateOf = (battle) => battle.actors.map((actor) => [actor.id, actor.x, actor.y, actor.hp, actor.dead, actor.target, actor.facing, actor.stamina, actor.path.length, Object.keys(actor.foes).join(), Object.entries(actor.enmity ?? {}).join()]);

// (The open field's, each way it's mustered; by night too)
const world = { blocked: Array.from({ length: 160 }, () => new Uint8Array(160)) };

for (const [n, mode, night] of [[60, "natural", false], [100, "lasting", false], [100, "natural", true], [100, "formation", false], [200, "natural", false]]) {
    const { battle } = muster(n, mode, world);
    const events = [];

    for (let t = 0; t < 45000; t += STEP_MS) {
        if (night) {
            battle.light = { sky: 0.35, lit: battle.actors.filter((actor) => !actor.dead && ["sword", "cleaver", "wand"].includes(actor.weapon)).map(({ x, y }) => [x, y, 81]) };
        }

        events.push(...battle.advance(STEP_MS));
    }

    console.log(`open field n=${n} ${mode}${night ? " by night" : ""}: ${events.length} events, ${hashOf([events, stateOf(battle), battle.snapshot()])}`);
}

// (The test's own: two lines of soldiers past the player, with and without the index)
const real = buildWorld({ seed: 2 });

function outOfTown(populate = false) {
    const host = new Host(real, { populate });

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

    for (let r = 60; r < 1500; r += 20) {
        for (let a = 0; a < 24; a++) {
            const [x, y] = [Math.round(me.x + r * Math.cos((a * Math.PI) / 12)), Math.round(me.y + r * Math.sin((a * Math.PI) / 12))];

            if (open(x, y)) {
                host.battle.place(HOST_PLAYER, "town", [x, y], { facing: Math.PI });

                return { host, me };
            }
        }
    }

    throw new Error("no open ground");
}

for (const [size, seconds] of [[30, 60], [50, 75]]) {
    const { host } = outOfTown();
    const events = [];
    const ways = [];

    host.battle.onPath = (id, way) => ways.push([id, way]);
    host.command(HOST_PLAYER, { type: "fieldBattle", size, facing: Math.PI });

    for (let t = 0; t < seconds * 1000; t += STEP_MS) {
        events.push(...host.advance(STEP_MS));
    }

    console.log(`host's field battle, ${size} a side, ${seconds} s: ${events.length} events, ${ways.length} ways, ${hashOf([events, ways, stateOf(host.battle)])}; checksum ${host.checksum?.() ?? "-"}`);
}

// (A populated start town, the player walking about it and out: guards, folk, the wild's)
{
    const host = new Host(real, { populate: true });

    host.join({ id: HOST_PLAYER, hero: { name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false } });

    const me = host.battle.actor(HOST_PLAYER);
    const events = [];
    const [x0, y0] = [me.x, me.y];

    for (let t = 0; t < 90000; t += STEP_MS) {
        if (t % 6000 === 0) {
            const k = t / 6000;

            host.command(HOST_PLAYER, { type: "move", to: [Math.round(x0 + Math.cos(k * 1.3) * (20 + 12 * k)), Math.round(y0 + Math.sin(k * 1.3) * (20 + 12 * k))], run: k % 2 === 0 });
        }

        events.push(...host.advance(STEP_MS));
    }

    console.log(`populated start town, 90 s walking out of it: ${host.battle.actors.length} in the battle, ${events.length} events, ${hashOf([events, stateOf(host.battle)])}; checksum ${host.checksum?.() ?? "-"}`);
}

// (The battle among those near, or everyone: the lean one's other branches)
{
    Battle.indexing = false;

    const { battle } = muster(60, "natural", world);
    const events = [];

    for (let t = 0; t < 30000; t += STEP_MS) {
        events.push(...battle.advance(STEP_MS));
    }

    Battle.indexing = true;
    console.log(`open field n=60 natural, looking through everyone: ${events.length} events, ${hashOf([events, stateOf(battle)])}`);
}
