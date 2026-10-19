// One running world, in a thread of its own (generated/world_server_plan.md §2, §4): made from its
// seed and carried on from its latest save (reopen.js), moved on in the battle's steps by the
// runner (core/runner.js) while anyone's playing in it, its players' games kept up with it
// (core/netplay.js Hosting), what's near them made ahead (ahead.js), and saved as it goes
// (keeper.js). The supervisor (world-thread.js) starts it when someone enters a world that's set
// aside, and ends it (which is the only way to give back Recast's memory) once it's been empty
// a while.
//
// The world's clock (§4) runs only while someone's present: their link open and their game
// finished loading (`ready`). It stops in the step the last present player goes (and the world's
// saved at once), and while every present player's page is hidden (if the world's
// pauseWhenHidden), or while anyone's still loading (if it holdsWhileJoining). Those in it while
// it's stopped are told so (Hosting.pause). A player whose link drops isn't present; their place
// is kept until the supervisor says they've gone.
//
// In a world that keeps its players' heroes (storage/heroes.js), a player's hero comes from the
// disk, not from their game: one of theirs by its slot, or a new one (from the character maker:
// its looks, nothing else), or on their first visit, if the world allows, the hero they bring.
// It plays under the id `<player>.<slot>`, so that if the server stops without its players
// leaving, each can still be put back in their slot when the world's next opened.
//
//   supervisor -> worker   { type: "enter", peer, player, role }   someone come in by a key
//                          { type: "data", peer, text }            what their game said
//                          { type: "drop", peer } / "back"         their link dropped, or came back
//                          { type: "leave", peer }                 they've gone
//                          { type: "meta", changes }               its name, description or settings changed
//                          { type: "save", why, id } / "stop"      saved (and, stopping, ended)
//                          { type: "backup", why, id }             saved, then backed up
//   worker -> supervisor   { type: "opened", from, forwarded, ms } / { type: "failed", name, message }
//                          { type: "send", peer, text }            to a player's game
//                          { type: "close", peer, reason }         sent out of the world (afk)
//                          { type: "state", ... }                  how it is (report)
//                          { type: "saved", id, ok } / "stopped"

import { performance } from "node:perf_hooks";
import { parentPort, workerData } from "node:worker_threads";
import { salvageKept } from "../client/js/app/character-file.js";
import { copyOf, freshOf, isGuid } from "../client/js/core/guid.js";
import { characterFrom, Hosting } from "../client/js/core/netplay.js";
import { STEP_MS } from "../client/js/core/battle.js";
import { elapsedOf } from "../client/js/core/daytime.js";
import { WorldRunner } from "../client/js/core/runner.js";
import { decode } from "../client/js/core/wire.js";
import { Ahead } from "./ahead.js";
import { Keeper } from "./keeper.js";
import { openWorld } from "./reopen.js";
import { MOST_HEROES } from "./storage/heroes.js";
import { StoredWorld } from "./storage/worlds.js";
import { installWorkers } from "./workers.js";

/** How often the world's looked at (ms), how often it says how it is, and how long a player may take loading before they're taken to be present anyway. */
export const WORKER = Object.freeze({ tick: 25, report: 1000, loading: 60000 });

const post = (message) => parentPort.postMessage(message);
const clock = () => performance.now();

// A hero's id in a kept world: its player's, and its slot ("K7Q2MXD4RT.2"); and back
const heroId = (player, slot) => `${player}.${slot}`;
const slotOf = (id) => /^([A-Za-z0-9_-]+)\.([1-9])$/.exec(id);

installWorkers();

const started = clock();
const stored = await StoredWorld.open(workerData.folder);
const kept = stored.meta.heroes === "kept";
let settings = { ...stored.meta.settings };
let opened;

try {
    opened = await openWorld(stored);
} catch (error) {
    post({ type: "failed", name: error.name, message: error.message });
    await new Promise(() => {});
}

const { host } = opened;
const saving = [];

// (Anyone the save had in the world, who never left it, as the server stopped: out of it, and
// their heroes kept where they were; or, visitors, what the world knows of them remembered)
for (const id of [...host.players.keys()]) {
    const place = host.placeOf(id);
    const vitals = host.vitalsOf(id);
    const character = host.leave(id);
    const [, player, slot] = slotOf(id) ?? [];

    if (kept && player && character) {
        saving.push(stored.heroes.keep(player, { ...character, place, vitals }, { slot: Number(slot) }));
    } else if (!kept && character) {
        saving.push(stored.visitors.keep(id, { ...character, place, vitals }));
    }
}

await Promise.all(saving);

const runner = new WorldRunner(host, { clock });
const keeper = new Keeper(runner, stored);
const ahead = new Ahead(host.world, { host, clock });
const hosting = new Hosting(host, { send: (peer, text) => post({ type: "send", peer, text }) });

runner.hosting = hosting;

/** Those who've come in, by peer: { player, role, slot, linked, ready, hidden, since, character }. */
const peers = new Map();

// Heroes being kept, one after another
let keeping = Promise.resolve();

hosting.most = settings.mostPlayers;
hosting.roleOf = (peer) => peers.get(peer)?.role ?? "player";
hosting.idOf = (peer) => {
    const one = peers.get(peer);

    return kept ? heroId(one.player, one.slot) : one.player;
};
hosting.characterOf = (peer) => peers.get(peer)?.character ?? null;
hosting.onReady = (peer) => {
    peers.get(peer).ready = true;
    look();
};
hosting.onAway = (peer, hidden) => {
    peers.get(peer).hidden = hidden;
    look();
};
hosting.onKick = (peer) => {
    peers.delete(peer);
    post({ type: "close", peer, reason: "afk" });
    look();
};
hosting.onLeave = (id, peer, character) => {
    const [, player, slot] = slotOf(id) ?? [];

    if (kept && player && character) {
        keeping = keeping.then(() => stored.heroes.keep(player, character, { slot: Number(slot) })).catch((error) => stored.journal(`Couldn't keep ${character.hero?.name}: ${error.message}`).catch(() => {}));
    } else if (!kept && character) {
        // (A visitor gone: what the world knows of them remembered, for their player, by their
        // character's id, for the next time they come; what they carry went with them)
        keeping = keeping.then(() => stored.visitors.keep(id, character)).catch((error) => stored.journal(`Couldn't remember ${character.hero?.name}: ${error.message}`).catch(() => {}));
    }
};

// A hero kept here, or brought in, as this version of the game plays them (character-file.js
// salvageKept): what it hasn't got left out or put right, and the world's journal told what
async function forward(character, player) {
    try {
        const { character: salvaged, left } = salvageKept(character, { seed: stored.meta.seed });

        if (left.length) {
            await stored.journal(`${salvaged.hero.name} (${player}), brought to this version of the game: ${left.join(" ")}`).catch(() => {});
        }

        return salvaged;
    } catch {
        return character;
    }
}

// What the world takes of a character brought to it: who they are and what they carry (their
// look, their own id, what they've grown into, their gear and gold); what another world knew of
// them stays there, and this one's is its own (docs/SERVER.md, "Visitors")
const carried = (brought) => ({ hero: brought.hero, talks: { memory: {}, knowledge: [] }, explored: {}, progress: brought.progress, standing: {}, followers: [] });

// The character a player comes in with (as Hosting.characterOf hands it over), from what their
// hello asked for, by the world's character rule (storage/worlds.js CHARACTER_RULES): visiting,
// theirs as they bring it, with what the world remembers of them from before (by their own id:
// client/js/core/guid.js); else one of their heroes kept here (by its slot), a new one ("new":
// made with their look), or, where the world takes copies, a copy of theirs ("copy": once for each
// character in the whole world, by its own id). Null if it can't be, or { refused } saying why
// ("copied": that character's been copied in already)
async function characterFor(one, { character, hero = "new" }) {
    if (!kept) {
        const brought = characterFrom(character);

        return brought && { ...carried(brought), ...((await stored.visitors.get(one.player, brought.hero.guid).catch(() => null)) ?? {}) };
    }

    const slots = await stored.heroes.slotsOf(one.player);

    if (Number.isInteger(hero) && slots.includes(hero)) {
        one.slot = hero;

        return forward(await stored.heroes.get(one.player, hero), one.player);
    }

    // (A slot neither kept nor taken by one of theirs in the world now, from another device, not yet kept)
    const playing = [...peers.values()].filter((other) => other !== one && other.player === one.player && other.slot).map((other) => other.slot);
    const free = Array.from({ length: MOST_HEROES }, (_, k) => k + 1).find((slot) => !slots.includes(slot) && !playing.includes(slot));
    const brought = characterFrom(character);

    if (!free || !brought) {
        return null;
    }

    // (A copy of theirs, where the world takes them: as it is, the world's own from now on, with an
    // id of its own and the one it was copied from as its origin; never one copied in already, by
    // anyone, nor one being copied in now)
    if (hero === "copy") {
        const origin = brought.hero.guid;
        const copying = [...peers.values()].some((other) => other !== one && other.origin === origin);

        if (stored.meta.firstHero !== "bring" || !isGuid(origin)) {
            return null;
        }

        if (copying || (await stored.heroes.origins()).has(origin)) {
            return { refused: "copied" };
        }

        one.slot = free;
        one.origin = origin;

        return forward({ ...carried(brought), hero: copyOf(brought.hero) }, one.player);
    }

    one.slot = free;

    // (Else new, as the character maker made it, with an id of its own)
    return { ...brought, hero: freshOf(brought.hero), talks: { memory: {}, knowledge: [] }, explored: {}, progress: {}, standing: {}, followers: [] };
}

// What a player's game said: its hello answered once their hero's found; the rest to the world
async function heard(peer, text) {
    const one = peers.get(peer);

    if (!one) {
        return;
    }

    let message = null;

    try {
        message = decode(text);
    } catch {
        return;
    }

    if (message?.kind !== "hello") {
        hosting.hear(peer, text);

        return;
    }

    if (one.asked) {
        return;
    }

    one.asked = true;

    try {
        one.character = await characterFor(one, message);
    } catch (error) {
        one.character = null;
        await stored.journal(`Couldn't bring a hero in for ${one.player}: ${error.message}`).catch(() => {});
    }

    // (Still here: in, if their hero's found; else refused, "character")
    if (peers.get(peer) === one) {
        hosting.hear(peer, text);
        one.since = clock();
        look();
    }
}

// ---- The world's clock

let running = false;
let present = 0;
let last = clock();
let reported = 0;

// Who's present (in, linked, loaded, or loading too long to wait on), and whether the world's clock runs
function look() {
    const now = clock();
    const here = [...peers.values()].filter((one) => one.linked && hosting.players.has(one.peer));
    const loaded = here.filter((one) => one.ready || now - one.since > WORKER.loading);
    const loading = here.length - loaded.length;
    const hidden = loaded.length > 0 && loaded.every((one) => one.hidden);
    const runs = loaded.length > 0 && !(settings.pauseWhenHidden && hidden) && !(settings.holdWhileJoining && loading > 0);
    const was = present;

    present = loaded.length;

    if (runs !== running) {
        running = runs;
        last = now;
        hosting.pause(!runs && hosting.players.size > 0);

        // (Stopped as the last who was present went: saved at once)
        if (!runs && was > 0 && present === 0) {
            keeper.save("empty");
        }
    }

    report();
}

// How the world is, for the supervisor (and its management page)
function report() {
    reported = clock();

    const players = [...peers.values()].map(({ peer, player, slot, linked, ready, hidden }) => {
        const id = hosting.players.get(peer) ?? null;
        const playing = id === null ? null : host.players.get(id);

        return { peer, player, slot, id, name: playing?.hero?.name ?? null, away: Boolean(playing?.away), linked, ready, hidden };
    });
    const memory = process.memoryUsage();

    post({
        type: "state",
        running,
        present,
        players,
        worldTime: host.battle.time,
        turn: host.war?.turn ?? 0,
        elapsed: elapsedOf(host.war),
        played: keeper.played,
        saved: keeper.saved,
        failed: keeper.failed ? { why: keeper.failed.why, message: keeper.failed.error.message } : null,
        steps: runner.times?.toJSON() ?? null,
        memory: { heap: memory.heapUsed, external: memory.external },
        // (The CPU time this thread has had, µs, user and system: how busy it is, apart from the
        // rest of the machine)
        cpu: process.threadCpuUsage?.() ?? null,
        actors: host.battle.actors.length,
        // (What's been made ahead between steps: chunks, and tiles of buildings' insides)
        made: { chunks: ahead.made, rooms: ahead.rooms },
    });
}

setInterval(() => {
    const now = clock();

    if (running) {
        runner.advance(now - last);
    }

    last = now;
    runner.bakeAhead(ahead);

    if (now - reported > WORKER.report) {
        look();
    }
}, WORKER.tick);

// ---- What the supervisor says

parentPort.on("message", async (message) => {
    switch (message.type) {
        case "enter":
            peers.set(message.peer, { peer: message.peer, player: message.player, role: message.role, slot: null, linked: true, ready: false, hidden: false, since: clock(), character: null, asked: false });
            look();
            break;
        case "data":
            await heard(message.peer, message.text);
            break;
        case "drop":
        case "back":
            if (peers.has(message.peer)) {
                peers.get(message.peer).linked = message.type === "back";
                look();
            }

            break;
        case "leave":
            hosting.gone(message.peer);
            peers.delete(message.peer);
            look();
            break;
        case "meta": {
            const { settings: changed = {}, ...rest } = message.changes;

            Object.assign(stored.meta, rest);
            stored.meta.settings = { ...stored.meta.settings, ...changed };
            settings = { ...settings, ...changed };
            hosting.most = settings.mostPlayers;
            look();
            break;
        }
        case "save":
            await keeper.save(message.why);
            post({ type: "saved", id: message.id, ok: !keeper.failed });
            break;
        case "backup": {
            // (Saved first, then copied: the copy waits for the save, so it's never taken mid-write)
            await keeper.save(message.why);

            const ok = await stored.backUp(message.why).then(() => !keeper.failed, () => false);

            post({ type: "saved", id: message.id, ok });
            break;
        }
        case "stop":
            for (const peer of [...peers.keys()]) {
                hosting.gone(peer);
            }

            peers.clear();
            running = false;
            await keeping;
            await keeper.save(message.why ?? "set aside");
            ahead.dispose();
            post({ type: "stopped", id: message.id, ok: !keeper.failed });
            break;
        default:
            break;
    }
});

post({ type: "opened", from: opened.from, forwarded: opened.forwarded, ms: Math.round(clock() - started), worldTime: host.battle.time, step: STEP_MS });
report();
