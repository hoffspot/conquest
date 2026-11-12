// The warding elixir's half hour in test/goods.test.js, played through and with the clock put on:
// what's told of the ward's end and how the player's left, both ways. node goods-ward.mjs   (from the checkout)
import path from "node:path";
import { pathToFileURL } from "node:url";

const at = (file) => pathToFileURL(path.resolve(file)).href;
const { STEP_MS } = await import(at("client/js/core/battle.js"));
const { HOST_PLAYER, Host } = await import(at("client/js/core/host.js"));
const { buildWorld } = await import(at("client/js/core/overworld.js"));

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

function run(host, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...host.advance(STEP_MS));
    }

    return events;
}

function hosted(progress) {
    const host = new Host(buildWorld({ seed: 2 }), { populate: false });

    host.join({ id: HOST_PLAYER, hero: HERO, progress: { gear: { mainHand: { id: HERO.weapon } }, ...progress } });
    host.populate();

    return host;
}

function drunk() {
    const host = hosted({ pack: [{ id: "elixirOfFireWarding" }, { id: "phialOfShadows" }, { id: "glowcapDraught" }] });
    const player = host.battle.actor(HOST_PLAYER);

    for (const item of ["elixirOfFireWarding", "glowcapDraught", "phialOfShadows"]) {
        host.command(HOST_PLAYER, { type: "use", item });
    }

    return { host, player };
}

const told = (events) => events.filter(({ type }) => type === "unbuffed" || type === "buffed").map(({ type, id, kind, over }) => `${type} ${id} ${kind}${over ? " over" : ""}`);
const state = ({ host, player }) => JSON.stringify({ time: host.battle.time, buffs: player.buffs, ward: host.battle.buffOf(player, "resistFire"), hp: player.hp, square: player.square });

{
    const game = drunk();
    const start = process.cpuUsage();
    const events = run(game.host, 30 * 60000);
    const used = process.cpuUsage(start);

    console.log("played through:", ((used.user + used.system) / 1e6).toFixed(1), "s CPU;", events.length, "events; told", told(events).join(", "));
    console.log(" last step's:", told(events.slice(-3)).join(", "), state(game));
}

{
    const game = drunk();
    const start = process.cpuUsage();

    game.host.battle.time += 30 * 60000 - 1000;

    const before = state(game);
    const events = run(game.host, 1000);
    const used = process.cpuUsage(start);

    console.log("clock put on:", ((used.user + used.system) / 1e6).toFixed(2), "s CPU;", events.length, "events; told", told(events).join(", "));
    console.log(" before the last second:", before);
    console.log(" after:", state(game));
}
