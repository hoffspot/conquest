// Junk (client/js/core/progress.js isJunk, markJunk, junkSale; core/host.js #sellJunk;
// docs/GAME.md *Junk*): anything a hero carries that sells somewhere can be marked as junk by its
// player, and only by them, and every shop's Sell tab sells all the junk that shop buys at once.
// The mark is the player's own: it goes with a thing into the stash and back, and stays on a
// stack split or put in order; it's never put on what wasn't marked (a junk stack and an unmarked
// one of the same thing never stack together), and it's gone from whatever leaves the hero (sold,
// dropped, given, traded, used, worn). Selling all of it is the host's, as selling one thing is:
// at a shopkeeper, alive, each stack for what #sell pays, the Trade skill grown by all of it, all
// of it or nothing, and only as the player was shown it. Kept in a snapshot, on a device, in a
// character's file, by a world server with the hero, and done the same on every copy of the world
// (NET_VERSION 230).
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { salvageKept } from "../client/js/app/character-file.js";
import { actionFor, keyMap, keysOf, KEY_ACTIONS } from "../client/js/app/keys.js";
import { exportCharacter, importCharacter, loadProgress, saveProgress, writeSave } from "../client/js/app/save.js";
import { STEP_MS } from "../client/js/core/battle.js";
import { HOST_PLAYER, Host, REFUSALS, SHOPKEEPERS, SNAPSHOT_VERSION } from "../client/js/core/host.js";
import { horseFrom } from "../client/js/core/mounts.js";
import { Hosting, Joining, NET_VERSION } from "../client/js/core/netplay.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { isJunk, junkable, junkSale, PACK_SIZE, priceOf, Progress, RANKS, stacksWith, thingOf } from "../client/js/core/progress.js";
import { createRandom } from "../client/js/core/random.js";
import { makeUnique } from "../client/js/core/rare.js";
import { decode, encode } from "../client/js/core/wire.js";
import { KeptHeroes } from "../server/storage/heroes.js";
import { mirrored } from "./replicated.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });
const stack = (id, count = 1, quality = "common") => ({ ...thingOf({ id, quality }), count });
const junk = (id, count = 1, quality = "common") => ({ ...stack(id, count, quality), junk: true });
// (What's in a pack, by slot: [slot, id, count, junk] each)
const laid = (pack) => pack.flatMap((each, slot) => (each ? [[slot, each.id, each.count, isJunk(each)]] : []));

function run(host, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...host.advance(STEP_MS));
    }

    return events;
}

const put = (actor, map, [x, y]) => Object.assign(actor, { map, square: [x, y], x: x + 0.5, y: y + 0.5, path: [], order: null, target: null });

// A world (seed 2) with its player in it, carrying `pack` and `gold` (and leading `followers`, as
// a character brings them), the orc out of the way
function hosted({ pack = [], gold = 0, skills = {}, followers = [] } = {}) {
    const host = new Host(buildWorld({ seed: 2 }), { populate: false });

    // (And every player's mirror held to it as it's played: test/replicated.js)
    mirrored(host);

    host.join({ id: HOST_PLAYER, hero: HERO, progress: { gold, pack, skills, gear: { mainHand: { id: HERO.weapon } } }, followers });
    host.populate();
    Object.assign(host.battle.actor("orc"), { dead: true, respawnAt: Infinity });

    return { host, player: host.players.get(HOST_PLAYER), me: host.battle.actor(HOST_PLAYER) };
}

// The player at the home tavern's bar, beside its barkeep (a tavern buys only ale and meals:
// progress.js SHOPS `line`)
function atTheBar(options) {
    const world = hosted(options);
    const barkeep = world.host.battle.actor(world.host.world.folk.find(({ role }) => role === "barkeep").id);

    put(world.me, barkeep.map, [barkeep.square[0], barkeep.square[1] + 1]);

    return { ...world, keeper: barkeep, sell: (more = {}) => world.host.command(HOST_PLAYER, { type: "sellJunk", to: barkeep.id, ...more }) };
}

// The player in the home town's guild hall, beside its receptionist at her counter (the guild buys
// everything: progress.js buys); its great chest by the hearth, for the stash
function atTheGuild(options) {
    const world = hosted(options);
    const { host, me } = world;
    const home = [...host.world.interiors.buildings.values()].find(({ kind, place }) => kind === "guild" && place === "home");

    put(me, "town", home.door.ends[0].arrive);
    host.command(HOST_PLAYER, { type: "enter", link: home.door.id });
    run(host, 4000);

    const hall = host.world.maps[home.maps[0]];
    const receptionist = host.battle.actors.find((actor) => actor.map === hall.id && actor.role === "receptionist");

    put(me, hall.id, [receptionist.square[0], receptionist.square[1] + 1]);

    return { ...world, hall, keeper: receptionist, sell: (more = {}) => host.command(HOST_PLAYER, { type: "sellJunk", to: receptionist.id, ...more }) };
}

// What the junk carried comes to at a shop (its keeper's), as the pack's question has it (and the
// host sells by)
const asked = ({ player, keeper, host }) => {
    const sale = junkSale(player.progress.pack, host.folk.get(keeper.id)?.shop ?? SHOPKEEPERS[keeper.role], { haggle: player.progress.bonuses().haggle });

    return { price: sale.price, count: sale.count };
};

describe("marking things as junk (progress.js markJunk)", () => {
    it("marks a stack carried as junk, and unmarks it; only true is a mark, and only a stack there", () => {
        const progress = new Progress({ pack: [stack("potion", 3), stack("sword", 1, "fine")] });

        assert.equal(progress.markJunk(0, true), null);
        assert.deepEqual(progress.pack[0], junk("potion", 3));
        assert.equal(isJunk(progress.pack[0]), true);
        assert.equal(progress.markJunk(0, true), null, "(marked again: as it was)");
        assert.equal(progress.markJunk(0), "command", "(neither true nor false: nothing changed)");
        assert.deepEqual(progress.pack[0], junk("potion", 3));
        assert.equal(progress.markJunk(0, false), null);
        assert.deepEqual(progress.pack[0], stack("potion", 3));
        assert.equal("junk" in progress.pack[0], false, "(unmarked, no mark kept at all)");

        // (Neither true nor false; nothing there, or no slot of the pack)
        for (const value of ["yes", 1, 0, null, {}]) {
            assert.equal(progress.markJunk(1, value), "command", JSON.stringify(value));
        }

        for (const index of [2, -1, 40, 1.5, "0", null, undefined, "constructor"]) {
            assert.equal(progress.markJunk(index, true), "item", String(index));
        }

        assert.deepEqual(laid(progress.pack), [[0, "potion", 3, false], [1, "sword", 1, false]]);
    });

    it("never marks what's bound to its hero (a unique, a horse's whistle): no shop buys it", () => {
        const unique = makeUnique("sampleSignet", 3, createRandom(5));
        const whistle = thingOf({ id: "mountWhistle", horse: horseFrom(createRandom(9), "horse-1") });
        const progress = new Progress({ pack: [{ ...unique, count: 1 }, { ...whistle, count: 1 }] });

        assert.ok(progress.pack[0].unique && progress.pack[1].horse, "(the unique and the whistle, as they're kept)");
        assert.equal(junkable(progress.pack[0]), false);
        assert.equal(progress.markJunk(0, true), "bound");
        assert.equal(progress.markJunk(1, true), "bound");
        assert.equal(progress.markJunk(1, false), null, "(unmarked: as it was)");
        assert.deepEqual(progress.pack.slice(0, 2).map(isJunk), [false, false]);

        // (Nor kept marked, if a save says so)
        const kept = new Progress({ pack: [{ ...unique, count: 1, junk: true }] });

        assert.equal(isJunk(kept.pack[0]), false);
    });

    it("is the host's command, for the player's own pack, refused as the pack refuses it", () => {
        const { host, player } = hosted({ pack: [stack("ale", 2)] });

        assert.deepEqual(host.command(HOST_PLAYER, { type: "markJunk", index: 0, junk: true }), { ok: true });
        assert.deepEqual(player.progress.pack[0], junk("ale", 2));
        assert.deepEqual(host.command(HOST_PLAYER, { type: "markJunk", index: 0, junk: false }), { ok: true });
        assert.deepEqual(player.progress.pack[0], stack("ale", 2));
        assert.deepEqual(host.command(HOST_PLAYER, { type: "markJunk", index: 5, junk: true }), { ok: false, reason: "item" });
        assert.deepEqual(host.command(HOST_PLAYER, { type: "markJunk", index: 0 }), { ok: false, reason: "command" });
        assert.deepEqual(host.command(HOST_PLAYER, { type: "markJunk", index: "0", junk: true }), { ok: false, reason: "item" });
    });

    it("isn't worn: a junk piece put on is worn without its mark, and what it replaces comes into the pack unmarked, never onto junk", () => {
        const progress = new Progress({ pack: [junk("sword", 1, "fine"), junk("sword", 1)], gear: { mainHand: { id: "sword" } } }, HERO);

        // (The fine sword on: the common one worn before comes off, into the fine one's slot, not
        // onto the junk common sword)
        assert.equal(progress.equip(0), null);
        assert.equal(progress.gear.mainHand.quality, "fine");
        assert.equal("junk" in progress.gear.mainHand, false);
        assert.deepEqual(laid(progress.pack), [[0, "sword", 1, false], [1, "sword", 1, true]]);

        // (The junk common sword on: worn without its mark; the fine one off, unmarked)
        assert.equal(progress.equip(1), null);
        assert.deepEqual(progress.gear.mainHand, thingOf({ id: "sword" }));
        assert.deepEqual(laid(progress.pack), [[0, "sword", 1, false], [1, "sword", 1, false]]);
        assert.equal(progress.pack[1].quality, "fine");
    });

    it("isn't worn: taken off onto a junk stack alike is refused, onto an unmarked one it stacks", () => {
        const progress = new Progress({ pack: [junk("leatherBoots"), stack("leatherBoots")], gear: { mainHand: { id: "sword" }, boots: { id: "leatherBoots" } } }, HERO);

        assert.equal(progress.unequip("boots", 0), "full");
        assert.equal(progress.gear.boots.id, "leatherBoots");
        assert.equal(progress.unequip("boots", 1), null);
        assert.deepEqual(laid(progress.pack), [[0, "leatherBoots", 1, true], [1, "leatherBoots", 2, false]]);
    });
});

describe("junk and stacking (progress.js stacksWith)", () => {
    it("never stacks junk with what isn't: what comes in goes on an unmarked stack alike or a slot of its own, never on a junk one", () => {
        const progress = new Progress({ pack: [junk("potion", 2), null, stack("meal", 1)] });

        assert.equal(stacksWith(junk("potion"), stack("potion")), false);
        assert.equal(stacksWith(junk("potion"), junk("potion", 5)), true);

        // (Picked up, bought, found: the junk draughts left as they were)
        assert.equal(progress.stow({ id: "potion" }, 3), true);
        assert.deepEqual(laid(progress.pack), [[0, "potion", 2, true], [1, "potion", 3, false], [2, "meal", 1, false]]);
        assert.equal(progress.stow({ id: "potion" }), true);
        assert.deepEqual(progress.pack[1], stack("potion", 4));
        assert.equal(progress.heldAlike({ id: "potion" }), 6, "(all of them, junk or not, alike: what a trade takes from)");

        // (Moved onto each other: swapped, not put together; junk onto junk, together)
        assert.equal(progress.move(1, 0), null);
        assert.deepEqual(laid(progress.pack), [[0, "potion", 4, false], [1, "potion", 2, true], [2, "meal", 1, false]]);
        assert.equal(progress.markJunk(0, true), null);
        assert.equal(progress.move(0, 1), null);
        assert.deepEqual(laid(progress.pack), [[1, "potion", 6, true], [2, "meal", 1, false]]);
    });

    it("in a pack with no other room, puts what comes on a stack of its kind marked otherwise, the two then not junk: nothing found's lost for a mark, and nothing's sold that wasn't marked", () => {
        const progress = new Progress({ pack: [junk("potion", 2)] });

        for (let slot = 1; slot < PACK_SIZE; slot++) {
            progress.pack[slot] = stack("meal");
        }

        // (Picked up, bought, found: on the junk draughts, which are junk no longer)
        assert.equal(progress.stow({ id: "potion" }), true);
        assert.deepEqual(progress.pack[0], stack("potion", 3));

        // (Taken out of the stash, junk, onto the unmarked meals: not junk either)
        progress.strongroom.tabs[0][0] = junk("meal", 2);
        assert.equal(progress.withdraw(0, 0), null);
        assert.deepEqual(progress.pack[1], stack("meal", 3));
        assert.equal(progress.strongroom.tabs[0][0], null);

        // (Nothing alike, and no room: as ever)
        assert.equal(progress.stow({ id: "ale" }), false);
    });

    it("keeps the mark on both halves of a stack split, and on a stack put in order: junk after everything else", () => {
        const progress = new Progress({ pack: [junk("potion", 6), stack("meal", 2), junk("sword"), stack("wolfPelt", 3), stack("sword", 1, "fine")] });

        assert.equal(progress.split(0, 2), null);
        assert.deepEqual(laid(progress.pack), [[0, "potion", 4, true], [1, "meal", 2, false], [2, "sword", 1, true], [3, "wolfPelt", 3, false], [4, "sword", 1, false], [5, "potion", 2, true]]);
        assert.equal(progress.sort(), null);
        assert.deepEqual(laid(progress.pack), [
            [0, "sword", 1, false],
            [1, "meal", 2, false],
            [2, "wolfPelt", 3, false],
            [3, "sword", 1, true],
            [4, "potion", 4, true],
            [5, "potion", 2, true],
        ]);
    });

    it("keeps each stack as it was kept, junk or not, even alike; a pack kept loose put together only with its own kind of stack; anything but true no mark", () => {
        const progress = new Progress({ pack: [junk("potion", 2), stack("potion", 3), { ...stack("ale"), junk: "yes" }, { ...stack("meal"), junk: 1 }] });

        assert.deepEqual(laid(progress.pack), [[0, "potion", 2, true], [1, "potion", 3, false], [2, "ale", 1, false], [3, "meal", 1, false]]);
        assert.deepEqual(new Progress(JSON.parse(JSON.stringify(progress.toJSON()))).toJSON(), progress.toJSON());

        // (Kept before things stacked: a list of things, one each, those alike together, junk
        // with junk)
        const loose = new Progress({ pack: [{ id: "potion", junk: true }, { id: "potion" }, { id: "potion", junk: true }] });

        assert.deepEqual(laid(loose.pack), [[0, "potion", 2, true], [1, "potion", 1, false]]);
    });
});

describe("junk in the stash (progress.js STRONGROOM)", () => {
    it("goes in and out with its mark; stacks there with junk alone; a tab put in order puts it last", () => {
        const progress = new Progress({ pack: [junk("potion", 2), stack("potion", 3), stack("ale"), junk("ale", 2)] });
        const tab = () => laid(progress.strongroom.tabs[0]);

        assert.equal(progress.lodge(0, 0), null);
        assert.equal(progress.lodge(1, 0), null);
        assert.deepEqual(tab(), [[0, "potion", 2, true], [1, "potion", 3, false]]);

        // (Stow alike: the unmarked ale has nothing to go on, the junk ale nothing either)
        assert.equal(progress.stowAlike(0), "strongroomUnalike");
        assert.equal(progress.lodge(2, 0, 5), null);
        assert.equal(progress.stowAlike(0), "strongroomUnalike", "(the junk ale: the stash's ale isn't junk, so it goes on nothing)");
        assert.deepEqual(laid(progress.pack), [[3, "ale", 2, true]]);
        assert.equal(progress.lodge(3, 0, 5), null, "(dropped on the unmarked ale: swapped, not put together)");
        assert.deepEqual(tab(), [[0, "potion", 2, true], [1, "potion", 3, false], [5, "ale", 2, true]]);
        assert.deepEqual(laid(progress.pack), [[3, "ale", 1, false]]);

        // (Put in order: the junk last)
        assert.equal(progress.sortTab(0), null);
        assert.deepEqual(tab(), [[0, "potion", 3, false], [1, "potion", 2, true], [2, "ale", 2, true]]);

        // (Taken out: junk still, onto the junk alike in the pack if there's any)
        assert.equal(progress.markJunk(3, true), null);
        assert.equal(progress.withdraw(0, 2), null);
        assert.equal(progress.withdraw(0, 1), null);
        assert.deepEqual(laid(progress.pack), [[0, "potion", 2, true], [3, "ale", 3, true]]);
        assert.deepEqual(tab(), [[0, "potion", 3, false]]);
    });
});

describe("selling all the junk carried (host.js #sellJunk)", () => {
    it("at the guild: every stack marked as junk, each for what selling it alone fetches, the haggling and a creature's part at all it's worth; the rest kept; the Trade skill grown by all of it", () => {
        const pack = [junk("potion", 3), stack("potion", 2), junk("wolfPelt", 4), junk("sword", 1, "fine"), stack("meal", 1), junk("ale", 5)];
        const trained = { trade: RANKS[2].xp };
        const guild = atTheGuild({ pack, gold: 10, skills: trained });
        const { host, player } = guild;
        const { haggle } = player.progress.bonuses();

        assert.ok(haggle > 0, "(haggling, from the Trade skill)");

        const each = [junk("potion", 3), junk("wolfPelt", 4), junk("sword", 1, "fine"), junk("ale", 5)].map((one) => priceOf(one, { haggle, selling: true }) * one.count);
        const price = each.reduce((sum, gold) => sum + gold, 0);

        assert.equal(priceOf(stack("wolfPelt"), { selling: true }), priceOf(stack("wolfPelt")), "(a creature's part: all it's worth)");
        assert.deepEqual(asked(guild), { price, count: 13 });

        // (The same, sold one stack at a time with #sell, in a world the same)
        const twin = atTheGuild({ pack, gold: 10, skills: trained });

        for (const index of [0, 2, 3, 5]) {
            assert.deepEqual(twin.host.command(HOST_PLAYER, { type: "sell", index, to: twin.keeper.id, count: pack[index].count }), { ok: true });
        }

        const trade = player.progress.skills.trade;
        const result = guild.sell({ price, count: 13 });
        const events = run(host, STEP_MS);

        assert.deepEqual(result, { ok: true, count: 13, price, left: 0 });
        assert.equal(player.progress.gold, 10 + price);
        assert.equal(player.progress.gold, twin.player.progress.gold, "(what selling each stack alone would have paid)");
        assert.deepEqual(laid(player.progress.pack), [[1, "potion", 2, false], [4, "meal", 1, false]]);
        assert.deepEqual(player.progress.pack, twin.player.progress.pack);
        assert.equal(player.progress.skills.trade, Math.round((trade + price * 0.5) * 10) / 10, "(half a point a gold piece, as selling grows it)");
        const told = events.filter(({ type }) => type === "junkSold");

        assert.equal(told.length, 1);
        assert.deepEqual(
            (({ id, items, count, price: paid, to, left }) => ({ id, items, count, price: paid, to, left }))(told[0]),
            {
                id: HOST_PLAYER,
                items: [
                    { id: "potion", quality: "common", count: 3 },
                    { id: "wolfPelt", quality: "common", count: 4 },
                    { id: "sword", quality: "fine", count: 1 },
                    { id: "ale", quality: "common", count: 5 },
                ],
                count: 13,
                price,
                to: guild.keeper.id,
                left: 0,
            },
        );

        // (Nothing marked now)
        assert.deepEqual(guild.sell({ price: 0, count: 0 }), { ok: false, reason: "junkNone" });
    });

    it("at another shop: only the junk it buys, the rest still junk and said; refused, saying why, when it buys none of it", () => {
        const bar = atTheBar({ pack: [junk("ale", 3), junk("wolfPelt", 2), stack("meal", 1), junk("meal", 2), junk("potion", 1)], gold: 0 });
        const { player } = bar;
        const ale = priceOf(stack("ale"), { selling: true });
        const meal = priceOf(stack("meal"), { selling: true });

        assert.deepEqual(asked(bar), { price: 3 * ale + 2 * meal, count: 5 });
        assert.deepEqual(bar.sell(asked(bar)), { ok: true, count: 5, price: 3 * ale + 2 * meal, left: 3 });
        assert.equal(player.progress.gold, 3 * ale + 2 * meal);
        assert.deepEqual(laid(player.progress.pack), [[1, "wolfPelt", 2, true], [2, "meal", 1, false], [4, "potion", 1, true]]);

        // (Nothing left they buy: refused, the pack and the gold as they were)
        assert.deepEqual(bar.sell({ price: 0, count: 0 }), { ok: false, reason: "junkUnwanted" });
        assert.equal(REFUSALS.junkUnwanted, "They buy none of the junk you carry: the adventurers' guild buys everything.");
        assert.deepEqual(laid(player.progress.pack), [[1, "wolfPelt", 2, true], [2, "meal", 1, false], [4, "potion", 1, true]]);
        assert.equal(player.progress.gold, 3 * ale + 2 * meal);
    });

    it("is refused with nothing marked, away from a shopkeeper, dead, or for what the player wasn't shown; and never sells the stash", () => {
        const guild = atTheGuild({ pack: [stack("potion", 2), junk("ale", 2)], gold: 7 });
        const { host, player, me, hall } = guild;
        const before = () => [player.progress.gold, laid(player.progress.pack)];
        const was = before();

        // (In the stash too: never sold from there)
        player.progress.strongroom.tabs[0][3] = junk("meal", 4);

        assert.deepEqual(guild.sell({ price: 3, count: 2 }), { ok: false, reason: "junkChanged" }, "(another price)");
        assert.deepEqual(guild.sell({ price: priceOf(stack("ale"), { selling: true }) * 2, count: 3 }), { ok: false, reason: "junkChanged" }, "(another count)");
        assert.deepEqual(guild.sell({}), { ok: false, reason: "command" });
        assert.deepEqual(guild.sell({ price: "4", count: 2 }), { ok: false, reason: "command" });
        assert.deepEqual(host.command(HOST_PLAYER, { type: "sellJunk", to: "nobody", ...asked(guild) }), { ok: false, reason: "far" });
        assert.deepEqual(before(), was);

        // (Too far from her)
        const at = [...me.square];

        put(me, hall.id, [at[0] + 6, at[1] + 6]);
        assert.deepEqual(guild.sell(asked(guild)), { ok: false, reason: "far" });
        put(me, hall.id, at);

        // (Dead)
        me.dead = true;
        assert.deepEqual(guild.sell(asked(guild)), { ok: false, reason: "dead" });
        me.dead = false;
        assert.deepEqual(before(), was);

        // (Done: the ale alone, the stash's meals still there, still junk)
        assert.deepEqual(guild.sell(asked(guild)), { ok: true, count: 2, price: 2 * priceOf(stack("ale"), { selling: true }), left: 0 });
        assert.deepEqual(player.progress.strongroom.tabs[0][3], junk("meal", 4));
        assert.deepEqual(laid(player.progress.pack), [[0, "potion", 2, false]]);
        assert.deepEqual(guild.sell({ price: 0, count: 0 }), { ok: false, reason: "junkNone" });
        assert.deepEqual(Object.keys(REFUSALS).filter((key) => key.startsWith("junk")), ["junkNone", "junkUnwanted", "junkChanged"]);
    });

    it("is all of it or nothing: should any of it fail, the pack and the gold are as they were", () => {
        const guild = atTheGuild({ pack: [junk("potion", 3), junk("ale", 2), stack("meal")], gold: 5 });
        const { player } = guild;
        const was = JSON.stringify(player.progress.toJSON());
        const take = player.progress.take.bind(player.progress);
        let calls = 0;

        // (The second stack can't be taken: refused, the first given back)
        player.progress.take = (index, count) => (++calls === 2 ? null : take(index, count));
        assert.deepEqual(guild.sell(asked(guild)), { ok: false, reason: "count" });
        assert.equal(JSON.stringify(player.progress.toJSON()), was);

        // (Or it fails outright: refused, all as it was)
        calls = 0;
        player.progress.take = (index, count) => {
            if (++calls === 2) {
                throw new Error("a failure");
            }

            return take(index, count);
        };

        const warn = console.warn;

        console.warn = () => {};

        try {
            assert.deepEqual(guild.sell(asked(guild)), { ok: false, reason: "command" });
        } finally {
            console.warn = warn;
        }

        assert.equal(JSON.stringify(player.progress.toJSON()), was);
    });

    it("ends the seller's Invisibility, as selling one thing does: it's trade (docs/MAGIC.md)", () => {
        const guild = atTheGuild({ pack: [junk("ale", 2)], gold: 7 });
        const { host, me } = guild;

        host.battle.buff(me.id, "invisibility", { ms: 60000 });
        assert.ok(host.battle.buffOf(me, "invisibility"));
        assert.equal(guild.sell(asked(guild)).ok, true);
        assert.equal(host.battle.buffOf(me, "invisibility"), null);
    });
});

describe("a thing that leaves the hero is junk no longer", () => {
    it("dropped and picked up again, sold one at a time, used, given to a follower or for a contract: what's left of a stack still junk, what went not", () => {
        const bar = atTheBar({ pack: [junk("ale", 4), junk("meal", 3), junk("wolfPelt", 5)], gold: 0 });
        const { host, player, keeper } = bar;

        // (Dropped, and picked up again: not junk)
        const dropped = host.command(HOST_PLAYER, { type: "drop", index: 0, count: 1 });

        assert.equal(dropped.ok, true);
        assert.deepEqual(host.ground.get(dropped.ground).item, stack("ale", 1));
        assert.deepEqual(host.command(HOST_PLAYER, { type: "pickUp", ground: dropped.ground }), { ok: true });
        assert.deepEqual(laid(player.progress.pack), [[0, "ale", 3, true], [1, "meal", 3, true], [2, "wolfPelt", 5, true], [3, "ale", 1, false]]);

        // (One sold: the rest still junk)
        assert.deepEqual(host.command(HOST_PLAYER, { type: "sell", index: 1, to: keeper.id, count: 1 }), { ok: true });
        assert.deepEqual(player.progress.pack[1], junk("meal", 2));

        // (One drunk: the rest still junk)
        assert.deepEqual(host.command(HOST_PLAYER, { type: "use", index: 0 }), { ok: true });
        assert.deepEqual(player.progress.pack[0], junk("ale", 2));

        // (Given for a contract: progress.js remove, as the guild's counter takes creatures' parts)
        assert.equal(player.progress.remove("wolfPelt", 2), true);
        assert.deepEqual(player.progress.pack[2], junk("wolfPelt", 3));
    });

    it("thrown away and taken back: junk again, as it was", () => {
        const { host, player } = hosted({ pack: [junk("potion", 2), stack("potion", 1)] });
        const thrown = host.command(HOST_PLAYER, { type: "discard", index: 0 });

        assert.deepEqual(thrown, { ok: true, item: stack("potion", 2) });
        assert.deepEqual(host.command(HOST_PLAYER, { type: "undiscard" }), { ok: true });
        assert.deepEqual(laid(player.progress.pack), [[0, "potion", 2, true], [1, "potion", 1, false]]);

        // (Its slot taken meanwhile by what isn't junk: wherever there's room, junk still)
        host.command(HOST_PLAYER, { type: "discard", index: 0 });
        assert.equal(player.progress.move(1, 0), null);
        assert.deepEqual(host.command(HOST_PLAYER, { type: "undiscard" }), { ok: true });
        assert.deepEqual(laid(player.progress.pack), [[0, "potion", 1, false], [1, "potion", 2, true]]);
    });

    it("traded to another player: theirs, and not junk; what's left of the giver's stack still junk", () => {
        const host = new Host(buildWorld({ seed: 2 }), { populate: false });

        host.join({ id: HOST_PLAYER, hero: HERO, progress: { pack: [junk("potion", 5), stack("meal", 1)] } });
        host.join({ id: "bryn", hero: { ...HERO, name: "Bryn" }, progress: { pack: [junk("potion", 1)] } });
        host.populate();

        const [ada, bryn] = [host.battle.actor(HOST_PLAYER), host.battle.actor("bryn")];

        put(bryn, ada.map, [ada.square[0] + 1, ada.square[1]]);
        assert.equal(host.command(HOST_PLAYER, { type: "trade", with: "bryn" }).ok, true);
        assert.equal(host.command("bryn", { type: "trade", with: HOST_PLAYER }).ok, true);
        assert.deepEqual(host.command(HOST_PLAYER, { type: "offer", gold: 0, items: [{ ...stack("potion"), count: 3 }] }), { ok: true });

        const rev = [...host.trades.values()][0].rev;

        assert.deepEqual(host.command(HOST_PLAYER, { type: "agree", rev }), { ok: true });
        assert.deepEqual(host.command("bryn", { type: "agree", rev }), { ok: true });
        assert.deepEqual(laid(host.players.get(HOST_PLAYER).progress.pack), [[0, "potion", 2, true], [1, "meal", 1, false]]);
        assert.deepEqual(laid(host.players.get("bryn").progress.pack), [[0, "potion", 1, true], [1, "potion", 3, false]], "(theirs, not on their own junk)");
    });

    it("given to one of their hired adventurers to wear: worn as theirs, not junk; given back, not junk either", () => {
        const { host, player } = hosted({ pack: [junk("mail", 2)], followers: [{ name: "Tam", calling: "warrior" }] });
        const [id] = [...host.followers.keys()];

        assert.deepEqual(host.command(HOST_PLAYER, { type: "outfit", follower: id, index: 0 }), { ok: true });
        assert.deepEqual(host.followers.get(id).gear.body, thingOf({ id: "mail" }));
        assert.deepEqual(player.progress.pack[0], junk("mail", 1), "(the other still junk)");
        assert.deepEqual(host.command(HOST_PLAYER, { type: "unoutfit", follower: id, slot: "body" }), { ok: true });
        assert.deepEqual(laid(player.progress.pack), [[0, "mail", 1, true], [1, "mail", 1, false]]);
    });
});

describe("junk kept (host.js snapshot, app/save.js, app/character-file.js, server/storage/heroes.js)", () => {
    it("comes back in a world carried on from a snapshot, the same as the host's; SNAPSHOT_VERSION as it was", () => {
        const { host, player } = hosted({ pack: [junk("potion", 2), stack("potion", 3)] });

        player.progress.strongroom.tabs[1][4] = junk("meal", 2);

        const again = Host.restore(buildWorld({ seed: 2 }), decode(encode(host.snapshot())));
        const theirs = again.players.get(HOST_PLAYER).progress;

        assert.deepEqual(laid(theirs.pack), [[0, "potion", 2, true], [1, "potion", 3, false]]);
        assert.deepEqual(theirs.strongroom.tabs[1][4], junk("meal", 2));
        assert.equal(again.checksum(), host.checksum());

        // (A mark is in the checksum: a copy gone astray on one is told apart)
        theirs.markJunk(1, true);
        assert.notEqual(again.checksum(), host.checksum());
        assert.equal(SNAPSHOT_VERSION, 55, "(a stack's mark, kept only where it's set, needs no step: absent, it's what an older snapshot meant; 55 is the rules a shared world changes, the plan's 2-1)");
    });

    it("is kept on a device with what's carried, and in a character's file taken to another device", () => {
        const items = new Map();

        globalThis.localStorage = { getItem: (key) => items.get(key) ?? null, setItem: (key, value) => items.set(key, String(value)), removeItem: (key) => items.delete(key) };

        try {
            const save = { version: 2, id: "junk1234", seed: 12, created: "2026-11-15T10:00:00.000Z", hero: { ...HERO, race: "human" } };
            const progress = new Progress({ gold: 40, pack: [junk("potion", 5), stack("ale", 2), junk("sword", 1, "fine")] });

            progress.strongroom.tabs[0][2] = junk("meal", 3);
            assert.equal(writeSave(save), true);
            assert.equal(saveProgress(save, progress), true);
            assert.deepEqual(new Progress(loadProgress(save)).toJSON(), progress.toJSON());

            const brought = importCharacter(JSON.parse(JSON.stringify(exportCharacter(save))));
            const there = new Progress(brought.progress);

            assert.deepEqual(laid(there.pack), [[0, "potion", 5, true], [1, "ale", 2, false], [2, "sword", 1, true]]);
            assert.deepEqual(there.strongroom.tabs[0][2], junk("meal", 3));

            // (Salvaged, kept by another version: what it has, as it was)
            const { character } = salvageKept({ hero: save.hero, progress: progress.toJSON() }, { seed: 12 });

            assert.deepEqual(laid(new Progress(character.progress).pack), [[0, "potion", 5, true], [1, "ale", 2, false], [2, "sword", 1, true]]);
        } finally {
            delete globalThis.localStorage;
        }
    });

    it("is handed back with the hero as they leave a world, kept by a world server with them, and theirs again as they come back", async () => {
        const { host } = hosted({ pack: [junk("potion", 2), stack("meal", 1)] });
        const folder = await mkdtemp(path.join(tmpdir(), "pellagos-junk-"));

        try {
            const heroes = new KeptHeroes(folder);
            const left = host.leave(HOST_PLAYER);
            const { slot } = await heroes.keep("p-ada", left);
            const kept = await heroes.get("p-ada", slot);
            const again = new Host(buildWorld({ seed: 2 }), { populate: false });

            // (As the world server brings a kept hero in: salvaged, as this version can play them)
            again.join({ id: HOST_PLAYER, ...salvageKept(kept, { seed: 2 }).character });
            assert.deepEqual(laid(again.players.get(HOST_PLAYER).progress.pack), [[0, "potion", 2, true], [1, "meal", 1, false]]);
        } finally {
            await rm(folder, { recursive: true, force: true });
        }
    });
});

describe("junk on a joined player's copy of the world (NET_VERSION 230)", () => {
    it("is theirs as they bring it, marked and sold all at once on every copy alike, never astray", () => {
        const guild = atTheGuild({ gold: 0 });
        const { host, hall } = guild;
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

        assert.equal(NET_VERSION, 236, "236 the rules a shared world changes, kept with every world (the plan's 2-1), 235 an ahead order looked along a leg at a time (docs/WAR.md, the plan's 3-29), 230 junk's, 231 crafting's (docs/CRAFTING.md), 232 mercenaries never lost (docs/WAR.md), 233 a player's far way waiting (docs/WORLD.md), 234 insides drawn by their slots (insides.js INSIDE_SLOTS)");
        joining.onWelcome = ({ seed, race, snapshot }) => joining.attach(Host.restore(buildWorld({ seed, race }), snapshot));
        joining.hello({ hero: { ...HERO, name: "Bryn", race: "human" }, progress: { gold: 3, pack: [junk("potion", 3), stack("meal", 2), junk("ale", 4), { ...stack("ale"), junk: "x".repeat(20) }] } });
        deliver();
        play(20);
        assert.ok(joining.host && joining.me, "(the copy made)");
        assert.deepEqual(laid(host.players.get(joining.me).progress.pack), [[0, "potion", 3, true], [1, "meal", 2, false], [2, "ale", 4, true], [3, "ale", 1, false]], "(as they brought it; only true a mark)");

        // (The one who joined stood by the receptionist, in every copy)
        for (const each of [host, joining.host]) {
            const keeper = each.battle.actors.find((actor) => actor.map === hall.id && actor.role === "receptionist");

            put(each.battle.actor(joining.me), hall.id, [keeper.square[0] - 1, keeper.square[1] + 1]);
        }

        const heard = [];
        const keeper = host.battle.actors.find((actor) => actor.map === hall.id && actor.role === "receptionist");
        const { haggle } = joining.host.players.get(joining.me).progress.bonuses();

        joining.command({ type: "markJunk", index: 1, junk: true }, (result) => heard.push(result.ok));
        deliver();
        play(4);
        joining.command({ type: "markJunk", index: 2, junk: false }, (result) => heard.push(result.ok));
        deliver();
        play(4);

        const sale = junkSale(joining.host.players.get(joining.me).progress.pack, "guild", { haggle });

        assert.deepEqual([sale.count, sale.left], [5, 0]);
        joining.command({ type: "sellJunk", to: keeper.id, price: sale.price, count: sale.count }, (result) => heard.push(result));
        deliver();
        play(40);

        const [mine, theirs] = [joining.host, host].map((each) => each.players.get(joining.me).progress.toJSON());

        assert.deepEqual(heard, [true, true, { ok: true, count: 5, price: sale.price, left: 0 }]);
        assert.deepEqual(laid(theirs.pack), [[2, "ale", 4, false], [3, "ale", 1, false]]);
        assert.equal(theirs.gold, 3 + sale.price);
        assert.equal(encode(mine), encode(theirs));
        assert.equal(astray, 0, "never astray");
        assert.equal(joining.host.checksum(), host.checksum());
    });
});

describe("J in the Pack (app/keys.js)", () => {
    it("marks a thing as junk with the Pack open, and opens the Journal anywhere else; no other key does two things there", () => {
        const keys = keysOf();

        assert.deepEqual(keys.junk, ["KeyJ", null]);
        assert.equal(actionFor(keyMap(keys, ["pack", "world"]), "KeyJ"), "junk");
        assert.equal(actionFor(keyMap(keys, ["pack", "talk"]), "KeyJ"), "junk");
        assert.equal(actionFor(keyMap(keys, ["world"]), "KeyJ"), "journal");
        assert.equal(actionFor(keyMap(keys, ["pack", "world"]), "KeyI"), "pack", "(the Pack's own key still shuts it)");

        // (In the Pack, the Pack's own keys first: nothing else of its scope or the world's shares one)
        const seen = new Map();

        for (const one of KEY_ACTIONS.filter((each) => each.scope === "pack")) {
            for (const key of keys[one.id].filter(Boolean)) {
                assert.ok(!seen.has(key), `${key}: ${seen.get(key)} and ${one.id}`);
                seen.set(key, one.id);
            }
        }

        assert.deepEqual([...seen], [["KeyJ", "junk"]]);
    });
});
