// A player who plays from their views alone (core/bot.js ViewBot; the scaling plan's 3-30): in
// a replicated world hosted in Node, holding a mirror and no copy, steering from what its
// frames say of its own hero and going for a foe the mirror shows
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { BOT, ViewBot } from "../client/js/core/bot.js";
import { Host } from "../client/js/core/host.js";
import { Hosting } from "../client/js/core/netplay.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { decode } from "../client/js/core/wire.js";

const character = (name) => ({ hero: { name, shape: {}, look: {}, weapon: "sword", boots: false, race: "human" }, progress: { gold: 50, skills: { blade: 300 } } });

// A replicated world hosted, and view bots come into it over links that take no time; their
// mirrors' battles all in the one world made here (never stepped)
function hosted(names, options = {}) {
    const world = buildWorld({ seed: 2 });
    const host = new Host(world, { populate: false });
    const bots = new Map();
    const said = new Map();
    let now = 0;
    const hosting = new Hosting(host, {
        send: (peer, text) => bots.get(peer)?.hear(text),
        sendBinary: (peer, bytes) => bots.get(peer)?.frame(Uint8Array.from(bytes)),
    });
    const shared = buildWorld({ seed: 2 });

    host.join({ id: "host", hero: { name: "Host", shape: {}, look: {}, weapon: "sword", boots: false } });
    host.populate();
    hosting.session.netcode = "replicated";
    hosting.views.mode = "on";

    names.forEach((name, k) => {
        const kinds = [];
        const bot = new ViewBot({
            send: (text) => {
                kinds.push(decode(text));
                hosting.hear(name, text);
            },
            seed: k + 1,
            clock: () => now,
            build: () => shared,
            ...options,
        });

        bots.set(name, bot);
        said.set(name, kinds);
        bot.hello(character(name));
    });

    return {
        host,
        hosting,
        bots,
        said,
        play(steps) {
            for (let k = 0; k < steps; k++) {
                now += STEP_MS;
                hosting.views.heard(host.advance(STEP_MS));
                hosting.flush();

                for (const bot of bots.values()) {
                    bot.tick(STEP_MS);
                }
            }
        },
    };
}

describe("a player who plays from their views alone (core/bot.js ViewBot)", () => {
    it("asks for views and no copy, is welcomed with no world, and takes a frame a step into a mirror that's told nothing that couldn't be so", () => {
        const world = hosted(["a", "b", "c"]);

        world.play(600);

        for (const [name, bot] of world.bots) {
            const report = bot.report();
            const hello = world.said.get(name)[0];

            assert.deepEqual([hello.kind, hello.mode, hello.speaks], ["hello", "view", ["replicated"]]);
            assert.ok(report.me, `${name} welcomed`);
            assert.equal(report.viewer, true);
            assert.equal(report.heard.welcome.messages, 1);
            assert.ok(report.heard.welcome.chars < 64 * 1024, `a welcome of ${report.heard.welcome.chars} characters, with no world in it`);
            assert.equal(report.heard.ops, undefined, "no step of the world's sent to it");
            assert.equal(report.unread, 0);
            assert.deepEqual([report.faults, report.lines], [0, []]);
            assert.ok(report.frames >= 590 && report.frames === report.steps, `${report.frames} frames over ${report.steps} steps`);
            assert.equal(report.self, true, "its own hero's among those its mirror knows of");
            assert.ok(report.known >= 2 && report.most >= report.now, `it knew of ${report.known} on the mean`);
            // (Told the world what it had seen, as a game does: every other frame)
            assert.ok(world.said.get(name).filter(({ kind }) => kind === "seen").length >= report.frames / 2 - 2);
            assert.ok(world.said.get(name).some(({ kind }) => kind === "ping"));
            // (A town, three walking in it: well under the plan's 20 KB a second each)
            assert.ok(report.bytes / 30 < 20 * 1024, `${Math.round(report.bytes / 30)} bytes a second`);
        }
    });

    it("steers from what its frames say of its hero: it's where the world has it, and walks where it sent itself", () => {
        const world = hosted(["a"]);
        const bot = world.bots.get("a");

        world.play(440);

        const hero = world.host.battle.actor(bot.me);
        const from = bot.home;

        assert.ok(from, "home's where its frames first said its hero was");

        const report = bot.report();

        assert.ok(report.moves >= 3, `${report.moves} moves`);
        assert.equal(report.results.done, report.moves + report.engaged, "each asked once the last was answered, and done");
        assert.equal(report.results.refused, 0);
        // (As last told: a hero walking is a few steps on from the word of them)
        assert.ok(Math.abs(bot.at.x - hero.x) < 2 && Math.abs(bot.at.y - hero.y) < 2, `its word of its hero is the world's: ${bot.at.x},${bot.at.y} and ${hero.x},${hero.y}`);
        assert.ok((hero.x - from[0]) ** 2 + (hero.y - from[1]) ** 2 > 1, "and its hero's walked");
        assert.ok((hero.x - from[0]) ** 2 + (hero.y - from[1]) ** 2 <= 2 * (BOT.roam + 2) ** 2, "no further than it roams");
    });

    it("goes for a foe its mirror shows near (the orc who walks by the town), and for no one the world wouldn't have it fight", () => {
        const world = hosted(["a"]);
        const bot = world.bots.get("a");

        world.play(40);
        assert.equal(bot.report().engaged, 0, "no one near to fight as it comes in");
        world.play(400);

        const report = bot.report();
        const hero = world.host.battle.actor(bot.me);
        const went = world.said.get("a").filter(({ kind, command }) => kind === "command" && command.type === "engage").map(({ command }) => command.target);

        assert.ok(report.engaged >= 1 && went.length === report.engaged, `${report.engaged} gone for`);

        for (const id of new Set(went)) {
            const foe = world.host.battle.actor(id);

            assert.ok(foe && world.host.canFight(hero, foe), `${id} is one the world lets it fight`);
        }

        assert.equal(report.results.refused, 0, "and the world took each");
    });
});
