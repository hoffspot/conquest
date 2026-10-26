// The worlds the server runs (generated/world_server_plan.md §2, §4): each in a thread of its own
// (server/world-worker.js), its clock running only while someone's present and stopping (saved)
// in the step the last one goes; a kept world's heroes coming back where they left, as they were;
// no more than worldsAtOnce going, the next waiting its turn; a world empty a while set aside, its
// thread ended and its memory given back; the machine kept awake while anyone's in; and nothing
// outside the platform layer running a command only one system has
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { Joining, NET_VERSION } from "../client/js/core/netplay.js";
import { keepAwake } from "../server/platform/index.js";
import { recommendation, recommendedWorlds, Registry, WORLD_MEMORY } from "../server/registry.js";
import { WorldStore } from "../server/storage/worlds.js";
import { WorldThread } from "../server/world-thread.js";
import { encode } from "../client/js/core/wire.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const made = [];

async function scratch() {
    const folder = await mkdtemp(path.join(os.tmpdir(), "pellagos-registry-"));

    made.push(folder);

    return folder;
}

// Every world's thread started, ended after (if a test fails, its threads mustn't keep the tests going)
const threads = [];

function thread(stored, hooks) {
    const one = new WorldThread(stored, hooks);

    threads.push(one);

    return one;
}

after(async () => {
    await Promise.all(threads.map((one) => one.terminate()));
    await Promise.all(made.map((folder) => rm(folder, { recursive: true, force: true })));
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Until `test` holds (looked at every 50 ms), or `ms` have gone (failing, saying `what`)
async function until(test, what, ms = 20000) {
    const end = Date.now() + ms;

    while (!test()) {
        assert.ok(Date.now() < end, `waited for ${what}`);
        await wait(50);
    }
}

const HERO = Object.freeze({ name: "Ada", race: "human", shape: {}, look: {}, weapon: "sword" });

// A player's game in Node, come into a running world (its thread) as `peer`: hello'd with
// `hero` (a slot, or "new"), bringing `character`. No copy of the world's made: it says it's
// ready at once. Returns { joining, welcome (once it's come), refused }.
async function play(thread, peer, { player = "ADA0000001", role = "owner", hero = "new", character = { hero: HERO } } = {}) {
    const game = { welcome: null, refused: null, kicked: null };
    const joining = new Joining({ send: (text) => thread.data(peer, text), clock: () => performance.now() });

    joining.onWelcome = (message) => (game.welcome = message);
    joining.onRefused = (reason) => (game.refused = reason);
    joining.onKicked = (reason) => (game.kicked = reason);
    game.joining = joining;
    hearing.set(peer, joining);
    thread.enter(peer, { player, role });
    joining.send(encode({ kind: "hello", version: NET_VERSION, character, hero }));
    await until(() => game.welcome || game.refused, `${peer}'s welcome`);

    if (game.welcome) {
        joining.ready();
    }

    return game;
}

// What each world sends, to the player's game it's for (by peer)
const hearing = new Map();
const hear = (peer, text) => hearing.get(peer)?.hear(text);

// The kept world's actor for a hero, as a welcome's snapshot has it
const actorIn = (welcome, id) => welcome.snapshot.battle.actors.find((actor) => actor.id === id);

describe("a world in a thread of its own (server/world-worker.js, world-thread.js)", () => {
    it("runs its clock only while someone's present, stops and saves it as they go, and brings a kept hero back where they left, as they were", async () => {
        const store = new WorldStore(await scratch());
        const stored = await store.create({ name: "Thornwick", seed: 3, race: "human" });
        const states = [];
        let world = thread(stored, { onSend: hear, onState: (state) => states.push(state) });
        const opened = await world.opened;

        assert.equal(opened.from, null, "a new world, made from its seed");

        // (A new hero: from the character maker, its looks and nothing else, whatever it brings)
        const ada = await play(world, "p1", { character: { hero: HERO, progress: { gold: 99999 } } });

        assert.equal(ada.refused, null);
        assert.equal(ada.welcome.id, "ADA0000001.1");
        await until(() => states.at(-1)?.running, "the clock to run");

        // (Their action wheels and Action Bar set, the world map pinned and auto-snag on, in their
        // game: the world's to keep with the hero, core/host.js OWN)
        const own = { wheels: { self: [{ 0: "heal" }, {}], enemy: [{}, {}], quick: ["heal", "potion", null, null, null, null] }, pin: [40, -12], settings: { autoSnag: true, battleCam: false } };

        ada.joining.own(own);

        // (A second hero of the same player, from another device: their second slot)
        const second = await play(world, "p2", { character: { hero: { ...HERO, name: "Bea" } } });

        assert.equal(second.welcome.id, "ADA0000001.2");
        world.leave("p2");
        await wait(1500);
        world.leave("p1");
        await until(() => states.at(-1)?.running === false && states.at(-1).players.length === 0, "the clock to stop");

        const stopped = states.at(-1).worldTime;

        await wait(1000);
        await world.save("check");
        assert.equal(states.at(-1).worldTime, stopped, "nothing moves while nobody's in it");
        assert.ok(stopped > 1000, "it ran while they were in");

        const kept = await stored.heroes.get("ADA0000001", 1);

        assert.equal(kept.hero.name, "Ada");
        assert.equal(kept.progress.gold, 20, "a new hero's gold, not what was sent");
        assert.ok(Number.isFinite(kept.place.x) && kept.vitals);
        assert.deepEqual([kept.wheels, kept.pin, kept.settings], [own.wheels, own.pin, own.settings], "their wheels and Action Bar, their pin and their settings");
        assert.deepEqual(await stored.heroes.slotsOf("ADA0000001"), [1, 2]);

        // Set aside (its thread ended), a while later (the wall's time, not the world's), and in again
        const { turn, worldTime } = (await world.stop()).ok ? states.at(-1) : {};

        assert.ok(world.ended);
        await wait(500);

        const seen = states.length;

        world = thread(stored, { onSend: hear, onState: (state) => states.push(state) });
        assert.equal((await world.opened).from, "now.json.gz");
        await until(() => states.length > seen, "its first report");
        assert.equal(states.at(-1).worldTime, worldTime, "the world's time just where it stopped");
        assert.equal(states.at(-1).turn, turn);

        const back = await play(world, "p3", { hero: 1 });
        const actor = actorIn(back.welcome, "ADA0000001.1");

        assert.deepEqual([actor.x, actor.y], [kept.place.x, kept.place.y], "where they left");
        assert.equal(actor.hp, kept.vitals.hp ?? actor.maxHp);

        // (Their wheels, Action Bar, pin and settings told their game again, as they set them)
        const theirs = (welcome) => welcome.snapshot.players.find((player) => player.id === "ADA0000001.1");

        assert.deepEqual([theirs(back.welcome).wheels, theirs(back.welcome).pin, theirs(back.welcome).settings], [own.wheels, own.pin, own.settings]);

        // (In twice as the same hero, on another device: that one takes the hero over where they
        // stand, the first sent out, told why: core/netplay.js Hosting #takeOver)
        const again = await play(world, "p4", { hero: 1 });

        assert.equal(again.refused, null);
        assert.equal(again.welcome.id, "ADA0000001.1");
        assert.equal(again.welcome.took, true);
        assert.deepEqual(theirs(again.welcome).wheels, own.wheels, "theirs, on the device that took them over");
        await until(() => back.kicked, "the first sent out");
        assert.equal(back.kicked, "elsewhere");

        // The server going down with them in it: their hero kept from the world's last save when it's next opened
        await world.save("turn");
        await world.terminate();
        await rm(path.join(stored.folder, "heroes", "ADA0000001", "1.json"));
        world = thread(stored, { onSend: hear });
        await world.opened;
        assert.equal((await stored.heroes.get("ADA0000001", 1)).hero.name, "Ada");
        assert.deepEqual((await stored.heroes.get("ADA0000001", 1)).wheels, own.wheels);
        await world.stop();

        const journal = await readFile(path.join(stored.folder, "journal.log"), "utf8");

        assert.match(journal, /\(empty\)/, "saved as it emptied");
    });

    it("stops its clock for its one player (their menu open, or their page hidden), never by itself with anyone else in; for everyone only by one of its owners, till they let it go or their link drops; and a game back on its link says again how it is", async () => {
        const store = new WorldStore(await scratch());
        const stored = await store.create({ name: "Stillwater", seed: 3, race: "human" });
        const states = [];
        const world = thread(stored, { onSend: hear, onState: (state) => states.push(state) });
        const runs = (yes, what) => until(() => states.at(-1)?.running === yes, what);
        // (Nothing changes for a while: as it was)
        const still = async (yes, what) => {
            await wait(600);
            assert.equal(states.at(-1).running, yes, what);
        };

        await world.opened;

        const ada = await play(world, "p1", { character: { hero: { ...HERO, name: "Ada" } } });

        await runs(true, "the clock to run");

        // Alone: stopped while her page is hidden, and while her menu's open, and told why
        ada.joining.away(true);
        await runs(false, "stopped, her page hidden");
        await until(() => ada.joining.paused?.why === "alone", "her told why");
        ada.joining.away(false);
        await runs(true, "going again, her page shown");
        assert.equal(ada.joining.paused, null);
        ada.joining.hold(true);
        await runs(false, "stopped, her menu open");
        ada.joining.hold(false);
        await runs(true, "going again, her menu shut");

        // With another in: neither a hidden page nor a menu stops it
        const bea = await play(world, "p2", { player: "BEA0000001", role: "player", character: { hero: { ...HERO, name: "Bea" } } });

        await runs(true, "going, with Bea in");
        ada.joining.away(true);
        bea.joining.hold(true);
        await still(true, "not stopped by a page hidden or a menu, with anyone else in");

        // Pause for everyone: a player's (not an owner's) stops nothing; an owner's stops it for
        // everyone, saying who, and her link dropping ends it
        bea.joining.hold(true, { everyone: true });
        await still(true, "not stopped by a player's pause for everyone");
        bea.joining.hold(false);
        ada.joining.away(false);
        ada.joining.hold(true, { everyone: true });
        await runs(false, "stopped for everyone");
        await until(() => bea.joining.paused?.why === "host", "Bea told why");
        assert.deepEqual(bea.joining.paused, { why: "host", by: "Ada" });
        world.drop("p1");
        await runs(true, "going again for Bea, Ada's link dropped");
        await until(() => bea.joining.paused === null, "Bea told it's going");

        // Back, alone (Bea gone), her menu still open (and her page hidden meanwhile): her game
        // says so again as its link comes back, and it stops for her, as her pause for everyone
        // ended with her link; and her page shown again, and her menu shut, said while her link
        // was down, lost, said again as it's back: going again
        world.leave("p2");
        ada.joining.away(true);
        world.back("p1");
        ada.joining.resync();
        await runs(false, "stopped for her alone, as her game says");
        assert.equal(ada.joining.everyone, false);
        world.drop("p1");

        const send = ada.joining.send;

        ada.joining.send = () => {};
        ada.joining.away(false);
        ada.joining.hold(false);
        ada.joining.send = send;
        world.back("p1");
        await still(false, "still stopped: her page hidden, as it last heard");
        ada.joining.resync();
        await runs(true, "going again, as she's said again how she is");
        await until(() => ada.joining.paused === null, "her told it's going");
        await world.stop();
    });

    it("refuses to open a world a newer version kept, saying so, and ends its thread", async () => {
        const store = new WorldStore(await scratch());
        const stored = await store.create({ name: "Later", seed: 3, race: "human" });

        await stored.save({ version: 9999, battle: {} }, { why: "from the future" });

        const world = thread(stored);

        await assert.rejects(world.opened, (error) => error.name === "NewerDataError");
        await world.terminate();
    });
});

describe("the worlds the server runs (server/registry.js)", () => {
    it("runs worldsAtOnce at once, the next waiting its turn; sets aside a world empty a while, ending its thread and giving back its memory", async () => {
        const store = new WorldStore(await scratch());
        const ids = [];

        for (const name of ["One", "Two", "Three"]) {
            ids.push((await store.create({ name, seed: 3, race: "human" })).id);
        }

        const values = { worldsAtOnce: 2, setAsideMinutes: 10, keepAwake: true };
        const settings = { get: (key) => values[key] };
        const awake = { held: 0, let: 0 };
        const registry = new Registry({ store, settings, onSend: (_world, peer, text) => hear(peer, text), awake: () => (awake.held++, { stop: () => awake.let++ }) });
        const before = process.memoryUsage().rss;
        const [one, two] = await Promise.all([registry.enter(ids[0]), registry.enter(ids[1])]);
        const opened = process.memoryUsage().rss;
        let place = 0;
        const third = registry.enter(ids[2], { onWaiting: (at) => (place = at) });

        await until(() => place === 1, "the third to wait");
        assert.equal(registry.lifeOf(ids[2]).life, "waiting");
        assert.equal(registry.going.length, 2);

        // (Someone in one: the machine kept awake while they're present, and let sleep after)
        await play(one, "r1");
        await until(() => awake.held === 1, "kept awake");
        one.leave("r1");
        await until(() => awake.let === 1, "let sleep");

        // (One set aside: the third goes)
        assert.ok((await registry.setAside(ids[1])).ok);
        assert.ok(two.ended);
        assert.equal(registry.lifeOf(ids[1]).life, "stored");
        assert.equal((await third).id, ids[2]);

        // (Empty for the set-aside delay: set aside on its own)
        values.setAsideMinutes = 0;
        await play(one, "r2");
        one.leave("r2");
        await until(() => registry.lifeOf(ids[0]).life === "stored", "the empty world set aside");
        assert.ok(one.ended);

        await registry.shutdown();
        assert.equal(registry.going.length, 0);

        // (Its memory given back: the process smaller again by most of what two worlds took)
        global.gc?.();
        await wait(1000);

        const after = process.memoryUsage().rss;

        assert.ok(opened - after > (opened - before) / 2, `memory given back: ${Math.round(before / 1e6)} MB, then ${Math.round(opened / 1e6)} MB with two worlds, ${Math.round(after / 1e6)} MB after`);
        assert.ok(opened - before < 2 * WORLD_MEMORY, "two worlds within what's allowed for them");
    });

    it("recommends as many worlds as the memory past what's kept back holds and the cores can step, one at the least, saying what each allows", () => {
        assert.deepEqual(recommendation({ memory: 16 * 2 ** 30, cores: 8 }), { most: 7, memory: (12 * 2 ** 30) / WORLD_MEMORY, cpu: 7 });
        assert.deepEqual(recommendation({ memory: 64 * 2 ** 30, cores: 8 }), { most: 7, memory: (48 * 2 ** 30) / WORLD_MEMORY, cpu: 7 });
        assert.deepEqual(recommendation({ memory: 8 * 2 ** 30, cores: 12, largest: 2 ** 30 }), { most: 4, memory: 4, cpu: 11 });
        assert.equal(recommendedWorlds({ memory: 2 * 2 ** 30, cores: 8 }), 1);
        assert.equal(recommendedWorlds({ memory: 32 * 2 ** 30, cores: 1 }), 1);
        assert.ok(recommendedWorlds() >= 1);
    });
});

describe("the platform layer's keeping awake (server/platform)", () => {
    it("runs caffeinate on the Mac and a systemd inhibitor on Linux, each ending with the server, and nothing on Windows yet", () => {
        const ran = [];
        const spawn = (command, args) => {
            const child = { killed: false, on() {}, unref() {}, kill: () => (child.killed = true) };

            ran.push({ command, args, child });

            return child;
        };

        const mac = keepAwake({ system: "darwin", spawn, pid: 4242 });

        assert.deepEqual(mac.command, ["/usr/bin/caffeinate", "-i", "-w", "4242"]);
        mac.stop();
        assert.ok(ran[0].child.killed);

        const linux = keepAwake({ system: "linux", spawn, pid: 4242 });

        assert.equal(linux.command[0], "systemd-inhibit");
        assert.ok(linux.command.includes("--pid=4242"));
        assert.equal(keepAwake({ system: "win32", spawn }).command, null);
    });

    it("runs no command only one system has anywhere outside the platform layer", async () => {
        const files = (await readdir(path.join(ROOT, "server"), { recursive: true })).filter((file) => file.endsWith(".js") && !file.startsWith("platform"));
        const macOnly = /\b(caffeinate|pmset|dns-sd|launchctl|osascript|scutil|networksetup)\b|\/usr\/bin\/security/;

        for (const file of files) {
            assert.doesNotMatch(await readFile(path.join(ROOT, "server", file), "utf8"), macOnly, `server/${file}`);
        }
    });
});
