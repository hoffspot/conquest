// A hero's stash (client/js/core/progress.js STRONGROOM, core/strongroom.js, core/host.js
// #strongroom): the great chest in every adventurers' guild's hall, against the east wall on the
// hearth's other side from the portal, opens on the hero's own stash, kept with their gold and
// pack and carried wherever they go: every guild's chest the same stash. Tabs of forty places,
// each a stack of things alike as the pack's slots are; two to begin with, and more bought one at
// a time, in order, for 10,000 gold each, up to six. What's asked of it is the host's, only for a
// hero standing at a guild's chest, and all of it or nothing. Kept in a snapshot (SNAPSHOT_STEPS
// 53), on a device (app/save.js) and handed back with the character as they leave; and done the
// same on every copy of the world (NET_VERSION 229).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { salvageKept } from "../client/js/app/character-file.js";
import { exportCharacter, importCharacter, loadProgress, saveProgress, writeSave } from "../client/js/app/save.js";
import { STEP_MS } from "../client/js/core/battle.js";
import { CREATURES } from "../client/js/core/creatures.js";
import { GEAR, LEVELS, rollGear } from "../client/js/core/gear.js";
import { HOST_PLAYER, Host, REFUSALS, SNAPSHOT_STEPS, SNAPSHOT_VERSION } from "../client/js/core/host.js";
import { readPlan } from "../client/js/core/interiors.js";
import { guildRooms } from "../client/js/core/insides.js";
import { horseFrom } from "../client/js/core/mounts.js";
import { HEARD, Hosting, Joining, NET_VERSION } from "../client/js/core/netplay.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { beforePortal, portalOn } from "../client/js/core/portals.js";
import { PACK_SIZE, Progress, STRONGROOM, thingOf } from "../client/js/core/progress.js";
import { createRandom } from "../client/js/core/random.js";
import { makeUnique } from "../client/js/core/rare.js";
import { atStrongroom, beforeStrongroom, STRONGROOM_REACH, strongroomOn } from "../client/js/core/strongroom.js";
import { encode } from "../client/js/core/wire.js";
import { guilds } from "../client/js/core/worldplan/plan.js";
import { BROKER_LIMITS } from "../server/broker.js";
import { PLAY_LIMITS } from "../server/play.js";
import { mirrored } from "./replicated.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });
const empty = () => Array(STRONGROOM.size).fill(null);
const stack = (id, count = 1, quality = "common") => ({ ...thingOf({ id, quality }), count });
// (A piece of gear with a name of its own: alike only to one of the same name)
const named = (id, name, quality = "fine") => ({ ...thingOf({ id, quality }), name, count: 1 });

function run(host, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...host.advance(STEP_MS));
    }

    return events;
}

const put = (actor, map, [x, y]) => Object.assign(actor, { map, square: [x, y], x: x + 0.5, y: y + 0.5, path: [], order: null, target: null });

// A world (seed 2) with its player in the home town's guild, standing before its chest
function atTheChest({ gold = 100 } = {}) {
    const host = new Host(buildWorld({ seed: 2 }), { populate: false });

    // (And every player's mirror held to it as it's played: test/replicated.js)
    mirrored(host);

    host.join({ id: HOST_PLAYER, hero: HERO });
    host.populate();

    const player = host.players.get(HOST_PLAYER);
    const home = [...host.world.interiors.buildings.values()].find(({ kind, place }) => kind === "guild" && place === "home");

    put(host.battle.actor(HOST_PLAYER), "town", home.door.ends[0].arrive);
    host.command(HOST_PLAYER, { type: "enter", link: home.door.id });
    run(host, 4000);

    const hall = host.world.maps[home.maps[0]];
    const chest = strongroomOn(hall);

    put(host.battle.actor(HOST_PLAYER), hall.id, beforeStrongroom(chest));
    run(host, 500);
    player.progress.gold = gold;

    return { host, player, home, hall, chest, me: host.battle.actor(HOST_PLAYER), ask: (command) => host.command(HOST_PLAYER, { type: "strongroom", ...command }) };
}

describe("a hero's stash (progress.js STRONGROOM)", () => {
    it("starts with two tabs of forty places; more are bought one at a time, in order, for 10,000 gold each, up to six", () => {
        assert.deepEqual(STRONGROOM, { size: 40, tabs: 2, most: 6, price: 10000 });

        const progress = new Progress();

        assert.equal(progress.strongroom.tabs.length, 2);
        assert.deepEqual(progress.strongroom.tabs, [empty(), empty()]);
        assert.deepEqual(progress.toJSON().strongroom, { tabs: [empty(), empty()] });
    });

    it("keeps what's in it with the character; one kept before there were stashes has its first two tabs, empty; never more than six, its stacks as the pack's are", () => {
        const progress = new Progress({ gold: 30000, pack: [stack("potion", 4), stack("sword", 1, "fine")] });

        assert.equal(progress.lodge(0, 1, 7), null);
        assert.equal(progress.buyTab(2), null);
        assert.equal(progress.lodge(1, 2), null);

        const kept = JSON.parse(JSON.stringify(progress.toJSON()));
        const again = new Progress(kept);

        assert.deepEqual(again.toJSON(), progress.toJSON());
        assert.equal(again.strongroom.tabs.length, 3);
        assert.deepEqual(again.strongroom.tabs[1][7], stack("potion", 4));
        assert.deepEqual(again.strongroom.tabs[2][0], stack("sword", 1, "fine"));

        // (Kept before there were stashes, or nothing worth reading: two tabs, empty)
        for (const old of [{ gold: 5 }, { gold: 5, strongroom: null }, { gold: 5, strongroom: { tabs: "no" } }, { gold: 5, strongroom: { tabs: [] } }]) {
            assert.deepEqual(new Progress(old).strongroom.tabs, [empty(), empty()], JSON.stringify(old));
        }

        // (No more than six; what isn't a thing left out; a list of things kept loose put in, those alike together)
        const many = new Progress({ strongroom: { tabs: Array.from({ length: 8 }, () => [stack("ale", 2)]) } });

        assert.equal(many.strongroom.tabs.length, 6);

        const loose = new Progress({ strongroom: { tabs: [[{ id: "potion" }, { id: "potion" }, { id: "nothing" }, { id: "meal" }]] } });

        assert.deepEqual(loose.strongroom.tabs[0].slice(0, 3), [stack("potion", 2), stack("meal", 1), null]);
        assert.equal(loose.strongroom.tabs.length, 2);
    });

    it("puts a stack from the pack into a tab: onto a stack alike there, else the first free place; at a place, onto things alike, into it empty, or swapped with what's there", () => {
        const progress = new Progress({ pack: [stack("potion", 3), stack("potion", 2), stack("meal", 1), stack("ale", 5)] });
        const [tab] = progress.strongroom.tabs;

        assert.equal(progress.lodge(0, 0), null);
        assert.deepEqual([tab[0], progress.pack[0]], [stack("potion", 3), null]);

        // (Alike: onto it)
        assert.equal(progress.lodge(1, 0), null);
        assert.deepEqual([tab[0], tab[1], progress.pack[1]], [stack("potion", 5), null, null]);

        // (At a place: into it empty; onto things alike; swapped with what isn't)
        assert.equal(progress.lodge(2, 0, 12), null);
        assert.deepEqual(progress.strongroom.tabs[0][12], stack("meal", 1));
        assert.equal(progress.lodge(3, 0, 0), null);
        assert.deepEqual([progress.strongroom.tabs[0][0], progress.pack[3]], [stack("ale", 5), stack("potion", 5)]);

        // (Nothing there, a place that isn't one, a tab not bought)
        assert.equal(progress.lodge(9, 0), "item");
        assert.equal(progress.lodge(3, 0, STRONGROOM.size), "item");
        assert.equal(progress.lodge(3, 2), "strongroomLocked");
        assert.equal(progress.lodge(3, -1), "strongroomLocked");
    });

    it("takes a stack out into the pack, onto things alike or its first free slot on whichever page; refused with the pack full, nothing changed", () => {
        const progress = new Progress({ pack: [stack("potion", 1)], strongroom: { tabs: [[stack("potion", 4), stack("meal", 2)], []] } });

        assert.equal(progress.withdraw(0, 0), null);
        assert.deepEqual([progress.pack[0], progress.strongroom.tabs[0][0]], [stack("potion", 5), null]);
        assert.equal(progress.withdraw(0, 1, 33), null);
        assert.deepEqual(progress.pack[33], stack("meal", 2));
        assert.equal(progress.withdraw(0, 1), "item");
        assert.equal(progress.withdraw(3, 0), "strongroomLocked");

        // (The pack full, its every slot a sword of its own, the second page's last too)
        const full = new Progress({ pack: Array.from({ length: PACK_SIZE }, (_, k) => named("sword", `Blade ${k}`)) });

        full.strongroom.tabs[1][5] = named("bow", "Longbow");

        const before = JSON.stringify(full.toJSON());

        assert.equal(full.withdraw(1, 5), "full");
        assert.equal(JSON.stringify(full.toJSON()), before);

        // (Onto things alike it goes all the same; or swapped into a slot)
        full.strongroom.tabs[1][6] = named("sword", "Blade 0");
        assert.equal(full.withdraw(1, 6), null);
        assert.equal(full.pack[0].count, 2);
        assert.equal(full.withdraw(1, 5, 39), null);
        assert.deepEqual([full.pack[39].name, full.strongroom.tabs[1][5].name], ["Longbow", "Blade 39"]);
    });

    it("moves a stack to another tab (onto things alike, else its first free place) or a place of one; refused a tab that's full or not bought", () => {
        const progress = new Progress({ gold: 10000, strongroom: { tabs: [[stack("potion", 2), stack("meal")], [null, stack("potion", 1)]] } });

        assert.equal(progress.shift(0, 0, 1), null);
        assert.deepEqual([progress.strongroom.tabs[0][0], progress.strongroom.tabs[1][1]], [null, stack("potion", 3)]);
        assert.equal(progress.shift(0, 1, 1, 20), null);
        assert.deepEqual(progress.strongroom.tabs[1][20], stack("meal"));
        assert.equal(progress.shift(1, 20, 1, 1), null, "(swapped, in the one tab)");
        assert.deepEqual([progress.strongroom.tabs[1][1], progress.strongroom.tabs[1][20]], [stack("meal"), stack("potion", 3)]);
        assert.equal(progress.shift(1, 1, 1), null, "(onto its own tab: where it is)");
        assert.deepEqual(progress.strongroom.tabs[1][1], stack("meal"));
        assert.equal(progress.shift(1, 1, 2), "strongroomLocked");
        assert.equal(progress.buyTab(2), null);
        progress.strongroom.tabs[2] = Array.from({ length: STRONGROOM.size }, (_, k) => stack(k % 2 ? "ale" : "feedBag"));

        const before = JSON.stringify(progress.toJSON());

        assert.equal(progress.shift(1, 1, 2), "strongroomFull");
        assert.equal(JSON.stringify(progress.toJSON()), before);
    });

    it("puts a tab in order as the pack's sorted, and stows into it everything carried that stacks with what it holds", () => {
        const progress = new Progress({ pack: [stack("potion", 2), stack("meal"), stack("sword", 1, "fine"), stack("potion", 1)], strongroom: { tabs: [[null, stack("meal", 3), null, stack("sword", 1, "fine"), stack("potion", 1)], []] } });

        assert.equal(progress.sortTab(0), null);
        assert.deepEqual(progress.strongroom.tabs[0].slice(0, 4), [stack("sword", 1, "fine"), stack("potion", 1), stack("meal", 3), null]);
        assert.equal(progress.stowAlike(0), null);
        assert.deepEqual(progress.pack.slice(0, 4), [null, null, null, null]);
        assert.deepEqual(progress.strongroom.tabs[0].slice(0, 4), [stack("sword", 2, "fine"), stack("potion", 4), stack("meal", 4), null]);

        // (Nothing carried stacks with what it holds: said so; a tab not bought)
        progress.pack[0] = stack("ale");
        assert.equal(progress.stowAlike(0), "strongroomUnalike");
        assert.equal(progress.stowAlike(1), "strongroomUnalike");
        assert.equal(progress.sortTab(4), "strongroomLocked");
        assert.equal(progress.stowAlike(4), "strongroomLocked");
    });

    it("buys tabs one at a time, in order, for 10,000 gold each: refused short of gold, out of order, one owned, and a seventh", () => {
        const progress = new Progress({ gold: 9999 });

        assert.equal(progress.buyTab(2), "gold");
        progress.gold = 45000;
        assert.equal(progress.buyTab(3), "strongroomOrder");
        assert.equal(progress.buyTab(1), "strongroomOwned");
        assert.equal(progress.buyTab(2), null);
        assert.equal(progress.gold, 35000);
        assert.equal(progress.buyTab(2), "strongroomOwned", "(asked twice: bought once)");
        assert.equal(progress.buyTab(), null);
        assert.equal(progress.buyTab(), null);
        assert.equal(progress.buyTab(5), null);
        assert.deepEqual([progress.strongroom.tabs.length, progress.gold], [6, 5000]);
        assert.equal(progress.buyTab(6), "strongroomTabs");
        assert.ok(progress.strongroom.tabs.every((tab) => tab.length === STRONGROOM.size));
    });
});

describe("the chest in a guild's hall (insides.js GUILD, core/strongroom.js)", () => {
    it("stands against the east wall north of the hearth, two squares long, the portal and hearth where they were; got to from the door, and opened from the square before it", () => {
        const [floor] = guildRooms({ key: "test:guild:1", name: "the Adventurers' Guild", seed: 1 });
        const hall = readPlan("hall", floor.name, floor.rows);
        const piece = (kind) => hall.pieces.find((each) => each.kind === kind);
        const chest = strongroomOn(hall);

        assert.deepEqual([chest.x, chest.y, chest.w, chest.h], [19, 4, 1, 2]);
        assert.equal(hall.pieces.filter(({ kind }) => kind === "strongroom").length, 1);
        assert.ok(hall.blocked[4][19] && hall.blocked[5][19]);
        assert.deepEqual(["hearth", "portal"].map((kind) => [piece(kind).x, piece(kind).y, piece(kind).h]), [[19, 6, 3], [19, 11, 3]]);
        assert.deepEqual(beforePortal(piece("portal")), [18, 12]);

        // (The square before it open, and walked to from the door; near enough there, and not
        // from the middle of the room)
        const before = beforeStrongroom(chest);

        assert.deepEqual(before, [18, 5]);
        assert.ok(!hall.blocked[5][18]);
        assert.ok(atStrongroom(chest, before[0] + 0.5, before[1] + 0.5));
        assert.ok(!atStrongroom(chest, 15.5, 5.5));
        assert.equal(STRONGROOM_REACH, 2.5);

        const [door] = hall.marks.D;
        const seen = new Set([door.join()]);
        const queue = [door];

        while (queue.length) {
            const [x, y] = queue.shift();

            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const [nx, ny] = [x + dx, y + dy];

                if (nx >= 0 && ny >= 0 && nx < hall.width && ny < hall.height && !hall.blocked[ny][nx] && !seen.has(`${nx},${ny}`)) {
                    seen.add(`${nx},${ny}`);
                    queue.push([nx, ny]);
                }
            }
        }

        assert.ok(seen.has(before.join()), "the chest got to from the door");
        assert.ok(seen.has(beforePortal(piece("portal")).join()), "the portal still got to");

        // (Every square open in the room still got to from the door: the chest shuts nothing off)
        for (let y = 0; y < hall.height; y++) {
            for (let x = 0; x < hall.width; x++) {
                assert.ok(hall.blocked[y][x] || seen.has(`${x},${y}`), `${x}, ${y}`);
            }
        }
    });
});

describe("the stash at a guild's chest (host.js #strongroom)", () => {
    it("does what a hero at the chest asks: things put in, taken out and moved between tabs, a tab sorted, things alike stowed, a tab bought; each told", () => {
        const { host, player, ask } = atTheChest({ gold: 12000 });
        const progress = player.progress;

        progress.pack = [stack("potion", 3), stack("meal", 2), stack("potion", 1), ...Array(PACK_SIZE - 3).fill(null)];

        const heard = [];
        const listen = () => heard.push(...run(host, STEP_MS).filter(({ type }) => type === "strongroom"));

        assert.deepEqual(ask({ do: "put", index: 0, tab: 0 }), { ok: true });
        listen();
        assert.deepEqual(progress.strongroom.tabs[0][0], stack("potion", 3));
        assert.deepEqual(ask({ do: "put", index: 1, tab: 1, to: 9 }), { ok: true });
        assert.deepEqual(ask({ do: "shift", tab: 1, place: 9, into: 0 }), { ok: true });
        assert.deepEqual(progress.strongroom.tabs[0][1], stack("meal", 2));
        assert.deepEqual(ask({ do: "stow", tab: 0 }), { ok: true });
        assert.deepEqual([progress.strongroom.tabs[0][0], progress.pack[2]], [stack("potion", 4), null]);
        assert.deepEqual(ask({ do: "sort", tab: 0 }), { ok: true });
        assert.deepEqual(ask({ do: "take", tab: 0, place: 0, to: 20 }), { ok: true });
        assert.deepEqual(progress.pack[20], stack("potion", 4));
        assert.deepEqual(ask({ do: "buy", tab: 2 }), { ok: true, price: 10000, tabs: 3 });
        assert.equal(progress.gold, 2000);
        listen();

        assert.deepEqual(
            heard.map(({ id, do: what, tab, price }) => [id, what, tab, price ?? null]),
            [[HOST_PLAYER, "put", 0, null], [HOST_PLAYER, "put", 1, null], [HOST_PLAYER, "shift", 0, null], [HOST_PLAYER, "stow", 0, null], [HOST_PLAYER, "sort", 0, null], [HOST_PLAYER, "take", 0, null], [HOST_PLAYER, "buy", 2, 10000]],
        );
    });

    it("refuses a hero not at a guild's chest (across the hall, out in the town, at another building's chest) and the fallen, in words; nothing changed", () => {
        const { host, player, home, hall, me, ask } = atTheChest();

        player.progress.pack[0] = stack("potion", 2);

        const before = JSON.stringify(player.progress.toJSON());

        // (Across the hall, by its door)
        put(me, hall.id, hall.marks.D[0].map((v, k) => v - k));
        assert.deepEqual(ask({ do: "put", index: 0, tab: 0 }), { ok: false, reason: "strongroom" });

        // (Out in the town)
        put(me, "town", home.door.ends[0].arrive);
        assert.deepEqual(ask({ do: "put", index: 0, tab: 0 }), { ok: false, reason: "strongroom" });

        // (Upstairs at a tavern, by a chest that's the room's, not a stash's)
        const upstairs = Object.values(host.world.maps).find((map) => map?.pieces?.some(({ kind }) => kind === "chest"));
        const box = upstairs.pieces.find(({ kind }) => kind === "chest");

        put(me, upstairs.id, [box.x - 1, box.y]);
        assert.deepEqual(ask({ do: "put", index: 0, tab: 0 }), { ok: false, reason: "strongroom" });

        // (At the chest, but fallen)
        put(me, hall.id, beforeStrongroom(strongroomOn(hall)));
        me.dead = true;
        assert.deepEqual(ask({ do: "put", index: 0, tab: 0 }), { ok: false, reason: "dead" });
        me.dead = false;

        // (At the chest, asked nothing it knows)
        assert.deepEqual(ask({ do: "nothing", tab: 0 }), { ok: false, reason: "command" });
        assert.equal(JSON.stringify(player.progress.toJSON()), before);

        for (const reason of ["strongroom", "strongroomFull", "strongroomLocked", "strongroomTabs", "strongroomOwned", "strongroomOrder", "strongroomUnalike"]) {
            assert.ok(typeof REFUSALS[reason] === "string" && REFUSALS[reason].length > 10 && !/strongroom/i.test(REFUSALS[reason]), reason);
        }

        assert.match(REFUSALS.strongroom, /stash/);
    });

    it("does all of it or nothing: refused for want of room, a tab or gold, the pack, the stash and the gold are as they were", () => {
        const { player, ask } = atTheChest({ gold: 9000 });
        const progress = player.progress;

        progress.pack = Array.from({ length: PACK_SIZE }, (_, k) => named("sword", `Blade ${k}`));
        progress.strongroom.tabs[0] = Array.from({ length: STRONGROOM.size }, (_, k) => named("bow", `Bow ${k}`));

        const before = JSON.stringify(progress.toJSON());

        for (const [command, reason] of [
            [{ do: "put", index: 0, tab: 0 }, "strongroomFull"],
            [{ do: "take", tab: 0, place: 3 }, "full"],
            [{ do: "put", index: 0, tab: 2 }, "strongroomLocked"],
            [{ do: "shift", tab: 0, place: 0, into: 4 }, "strongroomLocked"],
            [{ do: "stow", tab: 0 }, "strongroomUnalike"],
            [{ do: "buy", tab: 2 }, "gold"],
            [{ do: "buy", tab: 3 }, "strongroomOrder"],
            [{ do: "take", tab: 1, place: 0 }, "item"],
        ]) {
            assert.deepEqual(ask(command), { ok: false, reason }, JSON.stringify(command));
            assert.equal(JSON.stringify(progress.toJSON()), before, JSON.stringify(command));
        }

        // (Swapped, though both are full: a place for a slot)
        assert.deepEqual(ask({ do: "put", index: 5, tab: 0, to: 7 }), { ok: true });
        assert.deepEqual([progress.pack[5].name, progress.strongroom.tabs[0][7].name], ["Bow 7", "Blade 5"]);
    });

    it("takes what's bound to the hero too (a unique, a horse's whistle): it stays theirs, in the stash as in the pack", () => {
        const { player, ask } = atTheChest();
        const unique = { ...makeUnique("sampleSignet", 3, createRandom(5)), count: 1 };
        const whistle = { ...thingOf({ id: "mountWhistle", horse: horseFrom(createRandom(9), "horse-1") }), count: 1 };

        player.progress.pack[0] = unique;
        player.progress.pack[1] = whistle;
        assert.deepEqual(ask({ do: "put", index: 0, tab: 0 }), { ok: true });
        assert.deepEqual(ask({ do: "put", index: 1, tab: 1 }), { ok: true });
        assert.equal(player.progress.strongroom.tabs[0][0].unique, "sampleSignet");
        assert.equal(player.progress.strongroom.tabs[1][0].horse.id, "horse-1");
        assert.deepEqual(ask({ do: "take", tab: 1, place: 0 }), { ok: true });
        assert.equal(player.progress.pack[0].horse.id, "horse-1");
    });

    it("opens the same stash at every guild's chest: what's put in at home is taken out at another branch", () => {
        const { host, player, ask } = atTheChest({ gold: 500 });
        const start = host.world.start;
        const other = guilds(host.world.plan)
            .filter(({ id }) => id !== start.id)
            .sort((a, b) => Math.hypot(a.at[0] - start.at[0], a.at[1] - start.at[1]) - Math.hypot(b.at[0] - start.at[0], b.at[1] - start.at[1]))[0];

        player.progress.pack[0] = stack("potion", 7);
        assert.deepEqual(ask({ do: "put", index: 0, tab: 1 }), { ok: true });

        // (Through the portal to the other branch, and up to its chest)
        const hall = host.world.maps[[...host.world.interiors.buildings.values()].find(({ kind, place }) => kind === "guild" && place === "home").maps[0]];

        player.explored.openPortal(other.id);
        player.standing.register();
        put(host.battle.actor(HOST_PLAYER), hall.id, beforePortal(portalOn(hall)));
        assert.equal(host.command(HOST_PLAYER, { type: "travel", to: other.id }).ok, true);
        run(host, 500);

        const there = host.world.maps[host.battle.actor(HOST_PLAYER).map];

        assert.notEqual(there.id, hall.id);
        assert.equal(host.world.interiors.of(there.id).kind, "guild");
        put(host.battle.actor(HOST_PLAYER), there.id, beforeStrongroom(strongroomOn(there)));
        assert.deepEqual(ask({ do: "take", tab: 1, place: 0 }), { ok: true });
        assert.deepEqual(player.progress.pack[0], stack("potion", 7));
    });

    it("keeps the stash in a snapshot and carries it on; brings a world kept before there were stashes forward with each player's first tabs, empty (SNAPSHOT_STEPS 53)", () => {
        const { host, player, ask } = atTheChest({ gold: 10000 });

        player.progress.pack[0] = stack("potion", 2);
        assert.equal(ask({ do: "put", index: 0, tab: 1, to: 3 }).ok, true);
        assert.equal(ask({ do: "buy", tab: 2 }).ok, true);

        const snapshot = host.snapshot();
        const again = Host.restore(buildWorld({ seed: 2 }), structuredClone(snapshot));

        assert.equal(SNAPSHOT_VERSION, 55);
        assert.deepEqual(again.players.get(HOST_PLAYER).progress.toJSON().strongroom, player.progress.toJSON().strongroom);
        assert.equal(again.players.get(HOST_PLAYER).progress.strongroom.tabs.length, 3);

        // (Kept by version 53: no stash in it)
        const old = structuredClone(snapshot);

        old.version = 53;

        for (const one of old.players) {
            delete one.progress.strongroom;
        }

        const forward = SNAPSHOT_STEPS[53](old);

        assert.equal(forward.version, 54);
        assert.deepEqual(forward.players[0].progress.strongroom, { tabs: [empty(), empty()] });
        assert.deepEqual(Host.restore(buildWorld({ seed: 2 }), old).players.get(HOST_PLAYER).progress.strongroom.tabs, [empty(), empty()]);
    });

    it("hands the stash back with the character as they leave, and brings it in with them", () => {
        const { host, player, ask } = atTheChest();

        player.progress.pack[0] = stack("meal", 3);
        assert.equal(ask({ do: "put", index: 0, tab: 0, to: 39 }).ok, true);

        const character = host.leave(HOST_PLAYER);

        assert.deepEqual(character.progress.strongroom.tabs[0][39], stack("meal", 3));

        const other = new Host(buildWorld({ seed: 2 }), { populate: false });

        other.join({ id: HOST_PLAYER, ...structuredClone(character) });
        assert.deepEqual(other.players.get(HOST_PLAYER).progress.strongroom.tabs[0][39], stack("meal", 3));
    });

    it("brings in a hero with every tab and their pack full of the longest pieces there are: what they say coming in is under what a host, a world server and its broker take from one who's joined", () => {
        const random = createRandom(7);
        let longest = null;

        for (const id of Object.keys(GEAR)) {
            for (let k = 0; k < 20; k++) {
                const piece = { ...rollGear(id, "legendary", random, { level: LEVELS.most, people: "darkElf" }), count: 1 };

                if (!longest || encode(piece).length > encode(longest).length) {
                    longest = piece;
                }
            }
        }

        const bestiary = Object.fromEntries(Object.keys(CREATURES).map((kind) => [kind, { points: 99999, seen: true, signs: 99999, slain: 99999 }]));
        const tabs = Array.from({ length: STRONGROOM.most }, () => Array(STRONGROOM.size).fill(longest));
        const progress = new Progress({ gold: 999999999, pack: Array(PACK_SIZE).fill(longest), bestiary, strongroom: { tabs } });
        let hello = null;

        // (As a game says it coming in: core/netplay.js Joining hello)
        new Joining({ send: (text) => (hello = text) }).hello({ hero: { ...HERO, name: "W".repeat(24) }, progress: progress.toJSON() });

        assert.equal(progress.strongroom.tabs.flat().filter(Boolean).length, STRONGROOM.most * STRONGROOM.size);
        assert.ok(hello.length > 64 * 1024, `${hello.length}: more than the 64 KB a joined game was held to before stashes`);
        assert.ok(hello.length < HEARD.most / 2, `${hello.length} characters, with room to spare under the host's ${HEARD.most}`);

        // (Relayed: a line before it saying who it's from)
        for (const [cap, said] of [[PLAY_LIMITS.message, "a world server's play socket"], [BROKER_LIMITS.small, "a world server's broker"]]) {
            assert.ok(cap >= HEARD.most, `${said} takes as much as a host does`);
            assert.ok(hello.length + 64 < cap, said);
        }

        // (Let in by a host, whole: their stash as they brought it)
        const host = new Host(buildWorld({ seed: 2 }), { populate: false });
        const post = [];

        host.join({ id: HOST_PLAYER, hero: HERO });
        host.populate();

        const hosting = new Hosting(host, { send: (peer, text) => post.push({ to: peer, text }) });

        hosting.hear("p2", hello);

        const said = post.map(({ text }) => JSON.parse(text).kind);
        const joined = [...host.players.values()].find(({ id }) => id !== HOST_PLAYER);

        assert.ok(!said.includes("refused"), said.join(", "));
        assert.deepEqual(joined?.progress.strongroom.tabs, tabs);
    });

    it("counts each stash in the world's checksum, as each pack is: a copy's gone astray shows before anything's taken out", () => {
        const { host, player } = atTheChest();
        const was = host.checksum();

        player.progress.strongroom.tabs[1][7] = stack("potion", 2);
        assert.notEqual(host.checksum(), was);
    });

    it("says what in a kept hero's stash this version of the game hasn't got, as it does for their pack, and keeps the rest", () => {
        const progress = new Progress().toJSON();

        progress.strongroom.tabs[0][3] = { id: "notAThingAnyMore", count: 2 };
        progress.strongroom.tabs[1][9] = stack("potion", 4);

        const { character, left } = salvageKept({ hero: { ...HERO, race: "human" }, progress }, { seed: 2 });

        assert.equal(character.progress.strongroom.tabs[0][3], null);
        assert.deepEqual(character.progress.strongroom.tabs[1][9], stack("potion", 4));
        assert.ok(left.some((said) => said.startsWith("2 things the game no longer has")), left.join(" "));
    });

    it("is done the same on a joined player's copy of the world: their stash as the host's, never astray (NET_VERSION 229)", () => {
        const { host, home } = atTheChest();
        const post = [];
        const hosting = new Hosting(host, { send: (peer, text) => post.push({ to: peer, text }) });
        const joining = new Joining({ send: (text) => post.push({ from: "peer", text }) });
        const deliver = () => {
            while (post.length) {
                const { from, text } = post.shift();

                if (from) {
                    hosting.hear(from, text);
                } else {
                    joining.hear(text);
                }
            }
        };
        let astray = 0;
        const play = (steps) => {
            for (let step = 0; step < steps; step++) {
                host.advance(STEP_MS);
                hosting.flush();
                deliver();

                while (joining.step()) {
                    // (every step it's been sent)
                }

                astray += joining.astray ? 1 : 0;
                deliver();
            }
        };

        assert.equal(NET_VERSION, 242, "242 loot by tags a world's rule, and one fallen with a tag paid in any world (the plan's 2-13), 241 the tag ledger kept on the wild's and raiders (the plan's 2-11), 240 a shout heard by every player near, and turned off (the plan's 2-9), 239 a world's away marks its rule, and no one marked away counted in a fight or its spoils (the plan's 2-8), 238 no rest passing a world's time with others in it, no pause for everyone, and a keeper's notice of stopping (the plan's 2-5 to 2-7), 237 duels, and players fighting only by them where the rules say (the plan's 2-2 and 2-3), 236 the rules a shared world changes, kept with every world (the plan's 2-1), 235 an ahead order looked along a leg at a time (docs/WAR.md, the plan's 3-29), 229 the stash's, 230 junk's (core/progress.js isJunk), 231 crafting's (docs/CRAFTING.md), 232 mercenaries never lost (docs/WAR.md), 233 a player's far way waiting (docs/WORLD.md), 234 insides drawn by their slots (insides.js INSIDE_SLOTS)");
        joining.onWelcome = ({ seed, race, snapshot }) => joining.attach(Host.restore(buildWorld({ seed, race }), snapshot));
        joining.hello({ hero: { ...HERO, name: "Bryn", race: "human" }, progress: { gold: 10500, pack: [stack("potion", 3), stack("meal", 2)] } });
        deliver();
        play(20);
        assert.ok(joining.host && joining.me, "(the copy made)");

        // (The one who joined stood at the home guild's chest, in every copy)
        for (const each of [host, joining.host]) {
            const hall = each.world.maps[each.world.interiors.buildings.get(home.key).maps[0]];

            put(each.battle.actor(joining.me), hall.id, beforeStrongroom(strongroomOn(hall)));
        }

        const heard = [];

        for (const command of [{ do: "put", index: 0, tab: 0 }, { do: "put", index: 1, tab: 1, to: 5 }, { do: "buy", tab: 2 }, { do: "shift", tab: 1, place: 5, into: 2 }, { do: "take", tab: 0, place: 0, to: 30 }]) {
            joining.command({ type: "strongroom", ...command }, (result) => heard.push(result.ok));
            deliver();
            play(4);
        }

        play(40);

        const [mine, theirs] = [joining.host, host].map((each) => each.players.get(joining.me).progress.toJSON());

        assert.deepEqual(heard, [true, true, true, true, true]);
        assert.deepEqual(theirs.strongroom.tabs.length, 3);
        assert.deepEqual(theirs.strongroom.tabs[2][0], stack("meal", 2));
        assert.deepEqual(theirs.pack[30], stack("potion", 3));
        assert.equal(theirs.gold, 500);
        assert.equal(encode(mine), encode(theirs));
        assert.equal(astray, 0, "never astray");
        assert.equal(joining.host.checksum(), host.checksum());
    });
});

describe("the stash kept on a device (app/save.js)", () => {
    // A stand-in for the browser's local storage
    const storage = () => {
        const items = new Map();

        globalThis.localStorage = { getItem: (key) => items.get(key) ?? null, setItem: (key, value) => items.set(key, String(value)), removeItem: (key) => items.delete(key) };

        return items;
    };

    it("keeps it with what the character carries, in a character's export too; one kept before there were stashes comes back with its first tabs, empty", () => {
        const items = storage();
        const save = { version: 2, id: "abcd1234", seed: 12, created: "2026-11-14T10:00:00.000Z", hero: { ...HERO, race: "human" } };
        const progress = new Progress({ gold: 10000, pack: [stack("potion", 5)] });

        assert.equal(progress.buyTab(2), null);
        assert.equal(progress.lodge(0, 2, 17), null);
        assert.equal(writeSave(save), true);
        assert.equal(saveProgress(save, progress), true);
        assert.deepEqual(new Progress(loadProgress(save)).toJSON(), progress.toJSON());

        // (Taken to another device: exported, and brought in)
        const brought = importCharacter(JSON.parse(JSON.stringify(exportCharacter(save))));

        assert.deepEqual(new Progress(brought.progress).strongroom.tabs[2][17], stack("potion", 5));

        // (Kept before there were stashes)
        const kept = JSON.parse(items.get("pellagos.abcd1234.progress"));

        delete kept.strongroom;
        items.set("pellagos.abcd1234.progress", JSON.stringify(kept));
        assert.equal(loadProgress(save).strongroom, null);
        assert.deepEqual(new Progress(loadProgress(save)).strongroom.tabs, [empty(), empty()]);
        delete globalThis.localStorage;
    });
});
