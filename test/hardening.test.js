// What a world takes from another's game, and what it tells one (the scaling plan's 3-29): a
// command's shape (core/commandshape.js), its number, who may give the debugger's; a hundred
// thousand messages no game would send, none of which throws or holds the world up; and what a
// player far from another is told of them, which is who they are and nothing of where.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { AHEAD, AHEAD_LEG, STEP_MS } from "../client/js/core/battle.js";
import { COMMAND_SHAPES, DEBUG_COMMANDS, misshapen, MISSHAPEN, SHAPE } from "../client/js/core/commandshape.js";
import { Host } from "../client/js/core/host.js";
import { SIZE } from "../client/js/core/invasions.js";
import { navigatorOf } from "../client/js/core/navigation.js";
import { HEARD, Hosting, NET_VERSION } from "../client/js/core/netplay.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { decodeFrame } from "../client/js/core/view.js";
import { Viewing } from "../client/js/core/viewing.js";
import { decode, encode } from "../client/js/core/wire.js";
import { cpuMs } from "./helpers.js";

const hero = (name) => ({ name, shape: {}, look: {}, weapon: "sword", boots: false, race: "human" });
const character = (name) => ({ hero: hero(name), progress: { gold: 50, skills: { blade: 300 } } });

// A world with two joined by plain messages, as a server hears them: `netcode` the way it's played
function hosted(netcode = "lockstep", { rules = {} } = {}) {
    const host = new Host(buildWorld({ seed: 2 }), { populate: false, rules });
    const sent = new Map();
    const hosting = new Hosting(host, { send: (peer, text) => sent.set(peer, [...(sent.get(peer) ?? []), text]), sendBinary: () => {} });

    host.join({ id: "host", hero: hero("Host") });
    host.populate();
    hosting.session.netcode = netcode;
    hosting.views.mode = netcode === "replicated" ? "on" : "off";

    for (const peer of ["a", "b"]) {
        hosting.hear(peer, encode({ kind: "hello", version: NET_VERSION, character: character(peer), speaks: [netcode], ...(netcode === "replicated" ? { mode: "view" } : {}) }));
        hosting.hear(peer, encode({ kind: "ready" }));
    }

    const results = (peer) => (sent.get(peer) ?? []).map((text) => decode(text)).filter(({ kind }) => kind === "result");

    return { host, hosting, sent, results, ids: Object.fromEntries([...hosting.session.players]), say: (peer, seq, command) => hosting.hear(peer, encode({ kind: "command", seq, command })) };
}

describe("a command's shape (core/commandshape.js)", () => {
    it("has a shape for every command the host takes, and no other; the debugger's are those the host asks its leave for", async () => {
        const source = await readFile(new URL("../client/js/core/host.js", import.meta.url), "utf8");
        const from = source.indexOf("        switch (command.type) {\n            case \"move\":");
        const body = source.slice(from, source.indexOf("            default:\n                return refuse(\"command\");", from));
        const cases = [...body.matchAll(/^ {12}case "([A-Za-z]+)":/gm)].map(([, type]) => type);

        assert.ok(from > 0 && cases.length > 50, `${cases.length} commands read of the host`);
        assert.deepEqual([...cases].sort(), Object.keys(COMMAND_SHAPES).filter((type) => type !== "ask").sort());

        // (Each of the debugger's is given only by its leave: the case's own lines say so)
        const gated = cases.filter((type, k) => body.slice(body.indexOf(`case "${type}":`), k + 1 < cases.length ? body.indexOf(`case "${cases[k + 1]}":`) : body.length).includes("this.debugs(playerId)"));

        assert.deepEqual(gated.sort(), [...DEBUG_COMMANDS].sort());
        assert.deepEqual([...DEBUG_COMMANDS].sort(), ["burn", "fieldBattle", "hellrift", "invade", "rare", "rift"]);
        assert.equal(Object.hasOwn(COMMAND_SHAPES, MISSHAPEN.type), false, "what a misshapen one's put in place of is no command");
    });

    it("takes the commands the game sends as they are", () => {
        for (const command of [
            { type: "move", to: [4012, 3999], run: true },
            { type: "ahead", facing: -2.4, run: false },
            { type: "ahead", facing: 0.3, run: true, reach: 6 },
            { type: "engage", target: "site:12:guard:3", stand: true, lock: true },
            { type: "approach", target: "folk-7" },
            { type: "enter", link: "home:tavern:door" },
            { type: "stop" },
            { type: "cast", spell: "heal", target: null },
            { type: "cast", spell: "wizardsWalk", target: null, at: [4100.5, 3900.25] },
            { type: "talk", with: null },
            { type: "party", do: "mark", at: [4000, 4000], icon: "camp", words: "meet here" },
            { type: "buy", item: { id: "bread", quality: 0 }, from: "folk-2", special: true },
            { type: "sell", index: 3, to: "folk-2", count: 2 },
            { type: "craft", from: "folk-9", base: "longsword", using: ["iron", "iron", null], fee: 40 },
            { type: "use", item: "potion", target: "guest-2", toss: true },
            { type: "strongroom", do: "shift", tab: 1, place: 4, into: 2, to: 0 },
            { type: "order", unit: "merc-1", order: { type: "attack", target: "wolf-3" } },
            { type: "offer", gold: 5, items: Array.from({ length: 24 }, (_, k) => ({ id: "sword", quality: 3, count: 1, boost: { affixes: ["trueShot", "keen"], level: 40 + k, maker: "north" } })) },
            { type: "table", orders: [{ army: "a1", to: "town-3", stance: "storm" }], realm: "human", counsel: true, read: 3 },
            { type: "rename", follower: "merc-1", name: "Old Tam" },
            { type: "budget", invasion: 160 },
            { type: "ask", what: "shop", keeper: "folk-2" },
        ]) {
            assert.equal(misshapen(command), null, JSON.stringify(command).slice(0, 80));
        }
    });

    it("says what's wrong with one that isn't as it may be", () => {
        const deep = { type: "buy", item: { a: { b: { c: { d: 1 } } } } };
        const kind = new (class Thing {})();

        for (const [command, wrong] of [
            [null, "plain"],
            ["move", "plain"],
            [[{ type: "stop" }], "plain"],
            [Object.assign(kind, { type: "stop" }), "plain"],
            [new Map([["type", "stop"]]), "plain"],
            [{}, "type"],
            [{ type: "teleport" }, "type"],
            [{ type: "toString" }, "type"],
            [{ type: "__proto__" }, "type"],
            [{ type: 7 }, "type"],
            [{ type: "move" }, "to"],
            [{ type: "move", to: [1, 2, 3] }, "to"],
            [{ type: "move", to: [1, "2"] }, "to"],
            [{ type: "move", to: [1, 1e12] }, "to"],
            [{ type: "move", to: [1, Infinity] }, "plain"],
            [{ type: "ahead", facing: "north" }, "facing"],
            [{ type: "ahead", facing: 1, reach: -4 }, "reach"],
            [{ type: "ahead", facing: 1, reach: 1e6 }, "reach"],
            [{ type: "engage" }, "target"],
            [{ type: "engage", target: "x".repeat(SHAPE.word + 1) }, "target"],
            [{ type: "engage", target: { id: "wolf" } }, "target"],
            [{ type: "stop", extra: [1, 2, 3] }, "extra"],
            [{ type: "stop", extra: "x".repeat(SHAPE.text + 1) }, "plain"],
            [{ type: "rename", follower: "m", name: 5 }, "name"],
            [{ type: "stop", constructor: 1 }, "plain"],
            [{ type: "abandon", thread: "__proto__" }, "plain"],
            [{ type: "engage", target: "constructor" }, "plain"],
            [{ type: "cast", spell: "toString" }, "plain"],
            [{ type: "order", unit: "m", order: { type: "attack", target: "hasOwnProperty" } }, "plain"],
            [JSON.parse("{\"type\":\"stop\",\"__proto__\":{\"a\":1}}"), "plain"],
            [deep, "plain"],
            [{ type: "sell", index: 1, to: "f", count: 1, ...Object.fromEntries(Array.from({ length: SHAPE.nodes }, (_, k) => [`f${k}`, k])) }, "big"],
            [{ type: "offer", gold: 1, items: Array.from({ length: SHAPE.bigNodes }, () => ({ id: "x" })) }, "big"],
            [{ type: "budget" }, "invasion"],
            [{ type: "ask", id: "folk-1" }, "what"],
        ]) {
            assert.equal(misshapen(command), wrong, JSON.stringify(command)?.slice(0, 70));
        }
    });
});

describe("what a world takes from another's game (core/netplay.js Session)", () => {
    it("does each of a game's commands once, numbered on from its last: one sent again, or out of its turn, is let go of", () => {
        for (const netcode of ["lockstep", "replicated"]) {
            const world = hosted(netcode);
            const { host, hosting, ids } = world;
            const done = [];
            const real = host.command.bind(host);

            host.command = (id, command) => (done.push([id, command.type]), real(id, command));
            world.say("a", 1, { type: "emote", emote: "wave" });
            world.say("a", 2, { type: "stop" });
            world.say("a", 2, { type: "emote", emote: "bow" });
            world.say("a", 1, { type: "emote", emote: "bow" });
            world.say("a", 0, { type: "emote", emote: "bow" });
            world.say("a", -3, { type: "emote", emote: "bow" });
            world.say("a", 2.5, { type: "emote", emote: "bow" });
            world.say("a", "3", { type: "emote", emote: "bow" });
            world.say("a", 2 ** 53, { type: "emote", emote: "bow" });
            world.say("b", 1, { type: "stop" });
            world.say("a", 7, { type: "stop" });
            world.say("a", 5, { type: "emote", emote: "bow" });
            assert.deepEqual(done, [[ids.a, "emote"], [ids.a, "stop"], [ids.b, "stop"], [ids.a, "stop"]], netcode);
            assert.equal(hosting.session.unordered, 8);
            assert.equal(hosting.session.done.get("a"), 7);

            // (Gone and come again: numbered from the first again)
            hosting.gone("a");
            hosting.hear("a", encode({ kind: "hello", version: NET_VERSION, character: character("a"), speaks: [netcode], ...(netcode === "replicated" ? { mode: "view" } : {}) }));
            hosting.hear("a", encode({ kind: "ready" }));
            done.length = 0;
            world.say("a", 1, { type: "stop" });
            assert.equal(done.length, 1, "taken from the first again");
        }
    });

    it("gives the world a misshapen command as one there's no such kind of: refused, and every copy told the same", () => {
        const world = hosted("replicated");
        const { host, hosting } = world;
        const given = [];
        const real = host.command.bind(host);

        host.command = (id, command) => (given.push(command), real(id, command));
        world.say("a", 1, { type: "move", to: [1, 2, 3] });
        world.say("a", 2, { type: "stop", constructor: { a: 1 } });
        world.say("a", 3, "stop");
        world.say("a", 4, { type: "stop" });
        assert.deepEqual(given, [MISSHAPEN, MISSHAPEN, MISSHAPEN, { type: "stop" }]);
        assert.equal(hosting.session.misshapen, 3);
        assert.deepEqual(world.results("a").map(({ seq, result }) => [seq, result.ok, result.reason ?? null]), [[1, false, "command"], [2, false, "command"], [3, false, "command"], [4, true, null]]);
    });

    it("gives the debugger's commands to no one but the world's debugger, whatever their game says", () => {
        // (A world server's: its owners debug it; a player and a trusted one don't)
        const world = hosted("lockstep", { rules: { debug: "owner" } });
        const { host, ids } = world;
        const tried = { fieldBattle: { size: 20, facing: 0 }, invade: { band: "raiders" }, rift: {}, hellrift: {}, rare: { card: "stoneGolem" }, burn: { count: 1, ago: 0 } };

        assert.deepEqual(Object.keys(tried).sort(), [...DEBUG_COMMANDS].sort());

        for (const role of ["player", "trusted"]) {
            host.players.get(ids.a).role = role;

            for (const [k, type] of DEBUG_COMMANDS.entries()) {
                assert.equal(misshapen({ type, ...tried[type] }), null);
                assert.deepEqual(host.command(ids.a, { type, ...tried[type] }), { ok: false, reason: "command" }, `${type}, by a ${role} (${k})`);
            }

            assert.equal(host.debugs(ids.a), false);
        }

        host.players.get(ids.a).role = "owner";
        assert.equal(host.debugs(ids.a), true);

        // (And a world with no debugger at all: no one)
        const none = hosted("lockstep", { rules: { debug: "none" } });

        none.host.players.get(none.ids.a).role = "owner";
        assert.equal(none.host.debugs(none.ids.a), false);
        assert.equal(none.host.debugs("host"), false);
        assert.deepEqual(none.host.command(none.ids.a, { type: "rift" }), { ok: false, reason: "command" });
    });

    it("gives up no thread that isn't one, whatever it's named: nothing's set on what every object is", () => {
        const { host, ids } = hosted();

        // (Given straight to the host, as its own player's game gives them: no shape checked)
        for (const thread of ["__proto__", "constructor", "toString", "no such thread", 7, null]) {
            assert.equal(host.command(ids.a, { type: "abandon", thread }).ok, false, String(thread));
        }

        assert.deepEqual(Object.keys(Object.prototype), []);
        assert.equal(Object.hasOwn(Object.prototype, "left") || Object.hasOwn(Object.prototype, "fell"), false);
        assert.equal(host.command(ids.a, { type: "cast", spell: "toString", target: null }).ok, false);
    });

    it("holds what a game says of its device to what an invasion may be, and how long its words take to what a link's kept for", () => {
        const world = hosted();
        const { host, hosting, ids } = world;
        const most = Math.max(...Object.values(SIZE.most));

        // (A size an invasion may be, or it's not taken: none bigger than any device draws,
        // none smaller than the least there is)
        assert.deepEqual(host.command(ids.a, { type: "budget", invasion: 160 }), { ok: true });

        for (const said of [1e9, most + 1, 0, -50, SIZE.least - 1, 99.6, "big", NaN]) {
            assert.equal(host.command(ids.a, { type: "budget", invasion: said }).ok, false, `${said}`);
            assert.equal(host.players.get(ids.a).budget, 160);
        }

        hosting.hear("a", encode({ kind: "ping", t: 1, rtt: 1e12 }));
        assert.equal(hosting.session.rtts.get("a"), HEARD.rtt);
    });

    it("walks another's hero no further at one asking than HEARD.walk, and looks ahead of anyone a leg at a time", () => {
        const world = hosted();
        const { host, ids } = world;
        const actor = host.battle.actor(ids.a);
        const [x, y] = [actor.x, actor.y];
        const asked = [];
        const real = host.command.bind(host);

        // (Asked a world away: given the world as that far towards there, which every copy's told)
        host.command = (id, command) => (asked.push(command), real(id, command));
        world.say("a", 1, { type: "move", to: [Math.floor(x) + 9000, Math.floor(y)], run: true });
        world.say("a", 2, { type: "move", to: [Math.floor(x) + 20, Math.floor(y) + 3] });
        host.command = real;
        assert.deepEqual(asked.map(({ type, run }) => [type, run]), [["move", true], ["move", undefined]]);
        assert.ok(Math.abs(asked[0].to[0] - (x + HEARD.walk)) <= 1 && Math.abs(asked[0].to[1] - y) <= 1, `${asked[0].to}`);
        assert.deepEqual(asked[1].to, [Math.floor(x) + 20, Math.floor(y) + 3], "one within it as it was asked");
        assert.ok(HEARD.walk > 72 && HEARD.walk < 160, "further than a journey's leg, within the ground a server keeps made");

        // (Ahead, with none of the way's tiles made but those beside them: a leg, the rest kept
        // for when they've walked it. No second of the world's time making a hundred tiles)
        const before = navigatorOf(host.battle.maps[actor.map]).baked;
        const took = cpuMs(() => host.command(ids.a, { type: "ahead", facing: 0.6 }));
        const made = navigatorOf(host.battle.maps[actor.map]).baked - before;

        assert.ok(made <= 30, `${made} tiles made for it`);
        assert.ok(took < 400, `${took.toFixed(0)} ms`);

        if (actor.order?.ahead) {
            assert.ok(actor.order.ahead.left <= AHEAD - AHEAD_LEG + 2 && actor.order.ahead.left > 1, JSON.stringify(actor.order.ahead));

            const goal = [...actor.order.to];

            // (Walked to its end: on along the rest)
            for (let k = 0; k < 2000 && (actor.order?.to[0] === goal[0] && actor.order?.to[1] === goal[1]); k++) {
                host.advance(STEP_MS);
            }

            assert.ok(Math.hypot(actor.x - x, actor.y - y) >= AHEAD_LEG - 6, "a leg walked");
        }
    });
});

// One seeded roll after another
function roller(from) {
    let seed = from;

    return () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
}

describe("a hundred thousand messages no game would send", () => {
    // The hundred thousand, heard by two worlds (one played in step, one from views), from the
    // same roll each time: what was slow (by its place among them), what the host said broke,
    // and how it went
    function heard() {
        const roll = roller(20261121);
        const pick = (list) => list[Math.floor(roll() * list.length)];
        const NASTY = [null, undefined, true, false, 0, -1, 1, 0.5, -0, 1e9, -1e9, 1e308, NaN, Infinity, -Infinity, 2 ** 53, "", "x", "__proto__", "constructor", "toString", "hasOwnProperty", "a".repeat(300), "a".repeat(5000), [], [1], [1, 2], [1, 2, 3], [NaN, 1], ["a", "b"], [[1, 2]], {}, { a: 1 }, { length: 2, 0: 1, 1: 2 }, { toString: 1 }, [[[[[[[[1]]]]]]]], Array.from({ length: 500 }, (_, k) => k), { id: "sword", quality: 3 }, { id: "__proto__" }];
        const FIELDS = ["to", "facing", "reach", "target", "stand", "lock", "link", "spell", "at", "come", "do", "who", "icon", "words", "answer", "seconds", "treasure", "sign", "shrine", "item", "from", "special", "index", "count", "price", "junk", "base", "using", "fee", "slot", "tab", "place", "into", "ground", "only", "ability", "thread", "request", "with", "unit", "order", "follower", "name", "pick", "rule", "value", "effect", "act", "id", "which", "until", "obstacle", "emote", "gold", "items", "rev", "orders", "realm", "counsel", "read", "size", "band", "card", "inside", "ago", "invasion", "run", "toss", "what", "keeper", "hirable", "type"];
        const worlds = ["lockstep", "replicated"].map((netcode) => {
            const world = hosted(netcode);
            const navigation = navigatorOf(world.host.battle.maps.town);
            const wanted = [];

            // (As a world server keeps its world: the navigation's tiles and the ground round
            // each player made ahead of them, off the world's own time, and those a way waits
            // for made as it waits: server/ahead.js. What's timed is what a message costs it)
            navigation.later = (tx, ty) => wanted.push([tx, ty]);
            navigation.widenLater = true;

            return {
                ...world,
                seq: { a: 1, b: 1 },
                ahead() {
                    for (const [tx, ty] of wanted.splice(0)) {
                        navigation.ensure(tx, ty);
                    }

                    for (const id of world.host.players.keys()) {
                        const actor = world.host.battle.actor(id);

                        if (actor?.map === "town") {
                            navigation.around(actor.x, actor.y, 160);

                            for (let dx = -160; dx <= 160; dx += 64) {
                                for (let dy = -160; dy <= 160; dy += 64) {
                                    world.host.world.chunkAt?.(actor.x + dx, actor.y + dy);
                                }
                            }
                        }
                    }
                },
            };
        });
        const idsOf = (world) => [...world.host.battle.actors.slice(0, 40).map((actor) => actor.id), "nobody", "", "__proto__", "constructor", "toString"];
        const near = (world, far) => {
            const from = world.host.battle.actor(pick([...world.host.players.keys()]));
            const span = far ? pick([400, 2000, 8000]) : 40;

            return [Math.floor(from.x + (roll() - 0.5) * span), Math.floor(from.y + (roll() - 0.5) * span)];
        };
        const TEMPLATES = [
            (w) => ({ type: "move", to: near(w, roll() < 0.3), run: roll() < 0.5 }),
            () => ({ type: "ahead", facing: roll() * 7 - 3.5, run: roll() < 0.5, ...(roll() < 0.5 ? { reach: pick([1, 6, 40, 4000, 1e9]) } : {}) }),
            (w) => ({ type: pick(["engage", "approach"]), target: pick(idsOf(w)), stand: roll() < 0.3, lock: roll() < 0.3 }),
            (w) => ({ type: "enter", link: pick([...w.host.battle.links.slice(0, 60).map(({ id }) => id), "no door"]) }),
            (w) => ({ type: "cast", spell: pick(["heal", "fireball", "burn", "ward", "zombify", "wizardsWalk", "toString"]), target: pick([null, ...idsOf(w)]), at: near(w, roll() < 0.3) }),
            (w) => ({ type: "talk", with: pick([null, ...idsOf(w)]) }),
            (w) => ({ type: "party", do: pick(["invite", "accept", "decline", "leave", "ping", "mark", "readyCheck", "countdown", "ready", "remove", "promote", "nope"]), who: pick(idsOf(w)), at: near(w, true), icon: "camp", words: "here", seconds: pick([3, 1e9, -1]) }),
            (w) => ({ type: "trade", with: pick(idsOf(w)) }),
            () => ({ type: "offer", gold: pick([0, 5, 1e9, -5, 0.5]), items: Array.from({ length: Math.floor(roll() * 5) }, () => ({ id: pick(["sword", "bread", "nothing"]), quality: pick([0, 1, 9, -1]), count: pick([1, 0, -1, 1e9, 0.5]) })) }),
            () => ({ type: "agree", rev: Math.floor(roll() * 4) }),
            (w) => ({ type: "cancel", with: pick(idsOf(w)) }),
            (w) => ({ type: "buy", item: { id: pick(["bread", "sword", "x"]), quality: pick([0, 1, 5]) }, from: pick(idsOf(w)), special: roll() < 0.2 }),
            (w) => ({ type: pick(["sell", "drop", "discard", "equip", "use", "split", "salvage", "markJunk", "arrange", "unequip"]), index: pick([0, 1, 5, 99, -1, 0.5, 1e9]), count: pick([1, 0, -1, 1e9]), to: pick([0, 3, "left", ...idsOf(w)]), from: pick([0, 3, ...idsOf(w)]), slot: pick(["weapon", "body", "ring", "x"]), junk: true }),
            () => ({ type: "strongroom", do: pick(["put", "take", "shift", "sort", "stow", "buy", "x"]), tab: pick([0, 1, 9, -1]), index: pick([0, 1, 99]), place: pick([0, 5]), into: pick([0, 1]), to: pick([0, 3]) }),
            (w) => ({ type: "use", item: pick(["bread", "potion", "whistle", "bait", "x"]), target: pick(idsOf(w)), toss: roll() < 0.3 }),
            (w) => ({ type: "pickUp", ground: pick(["g1", "x", ...idsOf(w)]) }),
            (w) => ({ type: "ability", ability: pick(["powerStrike", "slipAway", "x"]), target: pick(idsOf(w)) }),
            () => ({ type: "emote", emote: pick(["wave", "bow", "x"]) }),
            () => ({ type: "camp", until: pick(["dawn", "dusk", 5, null]) }),
            (w) => ({ type: "travel", to: pick([near(w, true), "home", 3]) }),
            (w) => ({ type: "moonroad", to: pick(["x", 3, near(w, true)]) }),
            (w) => ({ type: "order", unit: pick(idsOf(w)), order: { type: pick(["follow", "hold", "attack", "x"]), target: pick(idsOf(w)), to: near(w, true) } }),
            () => ({ type: "table", orders: [{ army: pick(["a1", "x"]), to: pick(["t1", 3]) }], realm: pick(["human", "x"]), counsel: true, read: 3 }),
            () => ({ type: "budget", invasion: pick([60, 120, 360, 0, 1e9, -5, 99.5]) }),
            () => ({ type: pick(DEBUG_COMMANDS), size: 200, facing: 1, band: "x", card: "x", count: 10, ago: 1 }),
            () => ({ type: "rule", rule: "mortal", value: roll() < 0.5 }),
            (w) => ({ type: "ask", what: pick(["talk", "shop", "world", "x"]), id: pick(idsOf(w)), keeper: pick(idsOf(w)), hirable: true }),
            (w) => ({ type: "rename", follower: pick(idsOf(w)), name: pick(["Bob", "", "a".repeat(200)]) }),
            () => ({ type: "mission", act: pick(["take", "drop", "x"]), id: pick(["m1", 3]), which: 0 }),
            () => ({ type: "effect", effect: pick(["rest", "rent", "hire", "x", { type: "x" }]) }),
        ];
        const command = (world) => {
            if (roll() < 0.6) {
                const made = pick(TEMPLATES)(world);

                if (roll() < 0.3) {
                    made[pick(FIELDS)] = pick(NASTY);
                }

                return made;
            }

            const made = { type: roll() < 0.9 ? pick(Object.keys(COMMAND_SHAPES)) : pick(["", "nope", "__proto__", "constructor", 7, null]) };

            for (let k = Math.floor(roll() * 6); k > 0; k--) {
                const how = roll();

                made[pick(FIELDS)] = how < 0.35 ? pick(idsOf(world)) : how < 0.5 ? near(world, roll() < 0.2) : how < 0.6 ? Math.floor(roll() * 12) : pick(NASTY);
            }

            return made;
        };
        const message = (world, peer) => {
            const how = roll();

            if (how < 0.75) {
                return encode({ kind: "command", seq: roll() < 0.9 ? world.seq[peer]++ : pick([0, -1, 1, 1.5, "1", null, 2 ** 53, world.seq[peer] - 2]), command: command(world) });
            }

            if (how < 0.85) {
                return encode({ kind: pick(["hello", "ready", "again", "seen", "away", "hold", "ping", "own", "chat", "dms", "views", "command", "nope", 7, null]), [pick(FIELDS)]: pick(NASTY), step: pick(NASTY), t: pick(NASTY), rtt: pick(NASTY), own: pick(NASTY), text: pick(NASTY), hidden: pick(NASTY), seq: pick([null, "1", 0, -3, 0.5]), command: pick(NASTY) });
            }

            if (how < 0.92) {
                return JSON.stringify(pick(NASTY) ?? null);
            }

            if (how < 0.97) {
                return Array.from({ length: Math.floor(roll() * 200) }, () => String.fromCharCode(Math.floor(roll() * 65536))).join("");
            }

            return pick(["", "{", "[", "null", "{\"kind\":", "{\"kind\":\"command\",\"seq\":1,\"command\":{\"type\":\"move\",\"to\":[1e400,2]}}", "\u0000", "{\"__proto__\":{\"kind\":\"command\"}}"]);
        };
        const warned = [];
        const warn = console.warn;
        const slow = new Map();
        const done = new Map();
        let [worstMessage, worstStep, steps] = [0, 0, 0];

        for (const world of worlds) {
            const real = world.host.command.bind(world.host);

            world.host.command = (id, given) => {
                const result = real(id, given);

                done.set(given?.type, (done.get(given?.type) ?? 0) + (result?.ok ? 1 : 0));

                return result;
            };
            world.ahead();

            for (let k = 0; k < 40; k++) {
                world.hosting.views.heard(world.host.advance(STEP_MS));
                world.hosting.flush();
            }
        }

        console.warn = (...said) => warned.push(said.join(" ").slice(0, 200));

        try {
            for (let k = 0; k < 100000; k++) {
                const world = worlds[k % 2];
                const peer = k % 4 < 2 ? "a" : "b";
                const text = message(world, peer);
                const took = cpuMs(() => world.hosting.hear(peer, text));

                worstMessage = Math.max(worstMessage, took);

                if (took > 50) {
                    slow.set(k, `${took.toFixed(0)} ms: ${text.slice(0, 120)}`);
                }

                if (k % 8 === 0) {
                    world.ahead();
                }

                if (k % 40 === 0) {
                    const step = cpuMs(() => {
                        world.hosting.views.heard(world.host.advance(STEP_MS));
                        world.hosting.flush();
                    });

                    worstStep = Math.max(worstStep, step);
                    steps++;

                    if (step > 50) {
                        slow.set(`step ${k}`, `a step of ${step.toFixed(0)} ms`);
                    }
                }
            }
        } finally {
            console.warn = warn;
        }

        return {
            slow,
            warned,
            kinds: [...done].filter(([, ok]) => ok > 0).length,
            sessions: worlds.map(({ hosting }) => hosting.session),
            told: `${[...done].filter(([, ok]) => ok > 0).length} kinds of command done; the longest message ${worstMessage.toFixed(1)} ms, the longest of ${steps} steps ${worstStep.toFixed(1)} ms`,
        };
    }

    it("throw nothing, break no command, and hold neither a message nor a step of the world past 50 ms", { timeout: 900000 }, () => {
        const first = heard();

        // (Nothing thrown: hear would have, and the test with it. No command that failed to be
        // carried out, which the host says in the console: core/host.js command)
        assert.deepEqual(first.warned, [], "no command broke");

        // (None held the world past 50 ms of the processor's time. One that did is heard again,
        // the same hundred thousand from the start: a busy machine's slow at another place the
        // second time, where a message that's slow is slow at the same, test/helpers.js
        // quickEnough)
        if (first.slow.size) {
            const again = heard();
            const both = [...first.slow].filter(([at]) => again.slow.has(at)).map(([, what]) => what);

            assert.deepEqual(both, [], `${first.told}; again, ${again.told}`);
        }

        // (Nothing set on what every object is: a command that named "__proto__" for a thread
        // once did, and every world in the process had it)
        const everywhere = [];

        for (const key in {}) {
            everywhere.push(key);
        }

        assert.deepEqual(everywhere, [], "nothing written on every object");

        // (And it was heard: commands done, misshapen ones refused, ones out of turn let go of)
        assert.ok(first.kinds >= 12, first.told);

        for (const session of first.sessions) {
            assert.ok(session.misshapen > 2000 && session.unordered > 1000, `${session.misshapen} misshapen, ${session.unordered} out of turn`);
            assert.equal(session.players.size, 2, "both still in");
        }

        console.log(`# ${first.told}`);
    });
});

// A world played from views, three in it by links of their own, and everything it sends each
// kept: its messages (texts) and its frames (bytes)
function viewed() {
    const host = new Host(buildWorld({ seed: 2 }), { populate: false });
    const games = new Map();
    let now = 0;
    const hosting = new Hosting(host, {
        send: (peer, text) => {
            games.get(peer)?.texts.push(text);
            games.get(peer)?.link.hear(text);
        },
        sendBinary: (peer, bytes) => {
            games.get(peer)?.frames.push(Uint8Array.from(bytes));
            games.get(peer)?.link.frame(Uint8Array.from(bytes));
        },
    });

    host.join({ id: "host", hero: hero("Host") });
    host.populate();
    hosting.session.netcode = "replicated";
    hosting.views.mode = "on";

    return {
        host,
        hosting,
        come(peer, name) {
            const link = new Viewing({ send: (text) => hosting.hear(peer, text), clock: () => now });
            const game = { link, texts: [], frames: [], events: [] };

            games.set(peer, game);
            link.onWelcome = (welcome) => link.attach(new Host(buildWorld({ seed: welcome.seed, race: welcome.race }), { populate: false }), welcome);
            link.hello(character(name));

            return game;
        },
        play(steps = 1, each = () => {}) {
            for (let k = 0; k < steps; k++) {
                now += STEP_MS;
                each(k);
                hosting.views.heard(host.advance(STEP_MS));
                hosting.flush();

                for (const game of games.values()) {
                    for (let events; (events = game.link.host ? game.link.step() : null); ) {
                        game.events.push(...events);
                    }
                }
            }
        },
    };
}

// Where a value names someone (their id a text in it, or a key of it): the ways to each, as
// "part.key.field"
function namings(value, id, at = "") {
    if (typeof value === "string") {
        return value === id ? [at] : [];
    }

    if (value instanceof Map) {
        return [...value].flatMap(([key, held]) => [...(key === id ? [`${at}.${key}`] : []), ...namings(held, id, `${at}.${key}`)]);
    }

    if (value && typeof value === "object") {
        return Object.entries(value).flatMap(([key, held]) => [...(key === id ? [`${at}.${key}`] : []), ...namings(held, id, `${at}.${key}`)]);
    }

    return [];
}

describe("what a player's told of another far from them (core/viewfeed.js, core/summary.js)", () => {
    it("is who they are and whose party they're in, and nothing of where they are, what they do or what befalls them: not a byte, 300 m off and further", async () => {
        const world = viewed();
        const { host, hosting } = world;
        const [ann, bea, spy] = [world.come("a", "Ann"), world.come("b", "Bea"), world.come("s", "Spy")];

        world.play(40);
        await Promise.all([ann.link.started, bea.link.started, spy.link.started]);

        const [annId, beaId, spyId] = [ann.link.me, bea.link.me, spy.link.me];
        const say = (game, command) => new Promise((resolve) => game.link.command(command, resolve));
        const truth = host.battle.actor(annId);
        const roll = roller(329);

        // (Ann and Bea a party, side by side; the spy in none)
        Object.assign(host.battle.actor(beaId), { x: truth.x + 1, y: truth.y, square: [Math.floor(truth.x) + 1, Math.floor(truth.y)], map: truth.map, path: [], order: null });
        world.play(4);
        assert.equal((await say(ann, { type: "party", do: "invite", who: beaId })).ok, true);
        world.play(2);
        assert.equal((await say(bea, { type: "party", do: "accept" })).ok, true);
        world.play(25);

        // (Seen while they're near: the test's teeth. The spy's told of Ann, and where)
        assert.ok(spy.link.host.battle.actor(annId), "near her, the spy sees her");

        for (const [far, turn] of [[300, 0], [300, 2], [420, 4], [900, 1]]) {
            // (The spy sent off, `far` metres from her, and all it's been told forgotten)
            const [sx, sy] = [Math.floor(truth.x + [1, 0.7, 0, -0.7, -1][turn] * far), Math.floor(truth.y + [0, 0.7, 1, 0.7, 0][turn] * far)];

            host.battle.place(spyId, truth.map, [sx, sy]);

            const there = host.battle.actor(spyId);
            const off = Math.hypot(there.x - truth.x, there.y - truth.y);

            assert.ok(off >= far - 30, `${off.toFixed(0)} m off`);
            world.play(80);
            assert.equal(spy.link.host.battle.actor(annId), null, `${far} m off: she's gone from its world`);
            [spy.texts.length, spy.frames.length, spy.events.length] = [0, 0, 0];

            // (Ann walks, waves, marks the map for her party, trades with Bea, is hurt and
            // mended, falls and is raised: and Bea beside her, whom the spy mayn't place either)
            world.play(240, (k) => {
                if (k % 40 === 0) {
                    say(ann, { type: "move", to: [Math.floor(truth.x + (roll() - 0.5) * 30), Math.floor(truth.y + (roll() - 0.5) * 30)], run: roll() < 0.5 });
                } else if (k % 40 === 8) {
                    say(ann, { type: "emote", emote: "wave" });
                } else if (k % 40 === 12) {
                    say(ann, { type: "party", do: "mark", at: [Math.floor(truth.x) + 5, Math.floor(truth.y) + 5], icon: "camp", words: "here" });
                } else if (k % 40 === 16) {
                    say(ann, { type: "party", do: "ping", at: [Math.floor(truth.x) + 3, Math.floor(truth.y)] });
                } else if (k % 40 === 20) {
                    say(ann, { type: "trade", with: beaId });
                    say(bea, { type: "trade", with: annId });
                } else if (k % 40 === 24) {
                    say(ann, { type: "offer", gold: 1, items: [] });
                    say(ann, { type: "cancel", with: beaId });
                } else if (k % 40 === 28) {
                    truth.hp = Math.max(1, truth.hp - 5);
                    say(ann, { type: "cast", spell: "heal", target: null });
                } else if (k === 150) {
                    host.battle.hurt?.(annId, 1e6);
                }
            });

            const about = (what) => `${far} m off: ${what}`;

            // (Her game knows of none of it)
            assert.equal(spy.link.host.battle.actor(annId), null, about("never in its world"));
            assert.deepEqual(spy.events.filter((event) => namings(event, annId).length), [], about("no event of hers"));

            // (Nor was a byte of it sent: every message and every frame read for her id. Who
            // she is, and whose party she's in, are everyone's to know: the roster and the
            // parties, which say nothing of where)
            const allowed = (way) => /^\.(roster|parties)\./.test(way);

            for (const text of spy.texts) {
                const message = decode(text);

                assert.deepEqual(namings(message.world ?? {}, annId).filter((way) => !allowed(way)), [], about(`a ${message.kind}`));
                assert.deepEqual(namings({ ...message, world: null }, annId), [], about(`a ${message.kind}: ${text.slice(0, 200)}`));
            }

            for (const bytes of spy.frames) {
                const frame = decodeFrame(bytes);
                const { world: summary, ...rest } = frame.sections;
                const patches = summary ? JSON.parse(summary).p ?? [] : [];

                assert.deepEqual(patches.filter(([part, key, value]) => part !== "roster" && part !== "parties" && (key === annId || namings(value, annId).length)), [], about("a patch of the summary"));

                for (const [name, held] of Object.entries(rest)) {
                    const read = typeof held === "string" ? held : typeof held === "number" ? "" : Buffer.from(held).toString("latin1");

                    assert.equal(read.includes(annId), false, about(`a frame's ${name}: ${read.slice(0, 160)}`));
                }

                assert.equal(frame.records.length <= spy.link.mirror.size + 64, true);
            }

            assert.ok(spy.frames.length >= 200, about(`${spy.frames.length} frames read`));
        }

        // (What everyone's told of her: who, and nothing of where. A Nanny Mode player's
        // whereabouts are no one's outside their party, and here they're no one's at all)
        const roster = spy.link.mirror.summary.parts.get("roster");

        assert.deepEqual(Object.keys(roster.get(annId)).sort(), ["away", "id", "name", "race", "realm", "role"]);

        for (const party of spy.link.mirror.summary.parts.get("parties").values()) {
            assert.deepEqual(Object.keys(party).sort(), ["id", "leader", "members"]);
        }

        for (const part of ["own", "fellows", "invites", "trades", "props"]) {
            assert.deepEqual(namings(spy.link.mirror.summary.parts.get(part) ?? new Map(), annId), [], `the spy's own ${part}`);
        }

        // (Her party's told where she is, wherever they are: Bea, sent as far off)
        host.battle.place(beaId, truth.map, [Math.floor(truth.x) - 300, Math.floor(truth.y)]);
        world.play(60);

        const fellow = bea.link.mirror.summary.parts.get("fellows")?.get(annId);

        assert.ok(fellow && Number.isFinite(fellow.x) && Number.isFinite(fellow.y), "her party knows where");
        assert.equal(hosting.views.viewers.get(spyId).ids.has(annId), false);
    });
});
