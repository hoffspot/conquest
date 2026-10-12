// Players who play by themselves (core/bot.js), as the world server's soak plays them in Node and
// in each browser (scripts/soak.js): joined to a world with no host player, each comes in by
// their own people's town and keeps their copy of the world played as the host's steps come;
// they send themselves about near where they came in, an owner starts a fight and goes for its
// foes (a player who isn't one may not), and their copies never go astray from the host's
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { BOT, Bot } from "../client/js/core/bot.js";
import { Host } from "../client/js/core/host.js";
import { Hosting, Joining } from "../client/js/core/netplay.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { WorldRunner } from "../client/js/core/runner.js";

const character = (name, race) => ({ hero: { name, race, weapon: "sword", boots: false, shape: {}, look: {} } });

// A world with no host player, as the world server runs one, and a way for players to join it
// over links (what's sent queued, both ways, and delivered when asked)
function served() {
    const host = new Host(buildWorld({ seed: 2 }), { populate: false, rules: { rest: "everyone", debug: "owner" } });

    host.populate();

    const post = [];
    const hosting = new Hosting(host, { send: (peer, text) => post.push({ to: peer, text }) });
    const joinings = new Map();
    const deliver = () => {
        while (post.length) {
            const { to, from, text } = post.shift();

            if (from) {
                hosting.hear(from, text);
            } else {
                joinings.get(to)?.hear(text);
            }
        }
    };
    const join = (peer, hero, options) => {
        const joining = new Joining({ send: (text) => post.push({ from: peer, text }) });
        const bot = new Bot(joining, options);

        joinings.set(peer, joining);
        joining.hello(hero);
        deliver();

        return bot;
    };

    // (The first to join its owner: their fights theirs to start)
    hosting.roleOf = (peer) => (peer === "p1" ? "owner" : "player");

    return { host, hosting, join, deliver, runner: new WorldRunner(host, { hosting }) };
}

describe("players who play by themselves (core/bot.js)", () => {
    it("come in by their own people's towns, send themselves about, start fights if they may and go for their foes, their copies kept to the host's", () => {
        const { host, hosting, join, deliver, runner } = served();
        const timing = { ...BOT, firstFight: 2000 };
        const owner = join("p1", character("Ada", "human"), { seed: 1, timing });
        const elf = join("p2", character("Syl", "elf"), { seed: 2, timing });

        assert.equal(host.players.get(owner.joining.me).role, "owner");
        assert.equal(host.players.get(elf.joining.me).role, "player");
        assert.ok(owner.host && elf.host, "(each its copy of the world)");

        for (let time = 0; time < 40000; time += STEP_MS) {
            runner.advance(STEP_MS);
            deliver();
            owner.tick(STEP_MS);
            elf.tick(STEP_MS);
            deliver();
        }

        // (Everything sent and played)
        hosting.flush();
        deliver();
        owner.tick(0);
        elf.tick(0);

        const [ada, syl] = [owner, elf].map((bot) => host.battle.actor(bot.joining.me));

        assert.ok(Math.hypot(ada.x - syl.x, ada.y - syl.y) > 500, "(in towns far apart)");

        // (About: each sent somewhere near where they came in, every BOT.every, while they aren't
        // fighting; and every step of the host's played)
        assert.ok(elf.moves >= 7, "the elf sent about");
        assert.ok(owner.moves >= 1);

        for (const bot of [owner, elf]) {
            assert.ok(bot.steps > 790, "(the host's steps played)");
        }

        // (A fight: the owner's, theirs to start; the elf, only a player, can't)
        assert.equal(owner.fights, 1);
        assert.equal(elf.fights, 0);
        assert.ok(host.battle.actors.some(({ id }) => id.startsWith("field-")), "the owner's field battle");
        assert.ok(owner.engaged > 0 && owner.engaged < 10, "the owner went for its foes (one at a time)");
        assert.equal(elf.engaged, 0, "(none near the elves' town)");
        assert.ok(owner.host.battle.actors.some(({ id }) => id.startsWith("field-")), "(in their copy too)");

        // (Never astray: every check the host sent matched)
        for (const bot of [owner, elf]) {
            const report = bot.report();

            assert.equal(report.me, bot.joining.me);
            assert.ok(report.checks >= 7, `${report.me}'s copy checked`);
            assert.equal(report.desyncs, 0, `${report.me}'s copy never astray`);
            assert.equal(report.resyncs, 0);
            assert.equal(report.kicked, null);
            assert.equal(bot.host.checksum(), host.checksum(), "(at the host's step, as the host is)");
        }
    });

    it("does nothing at all if it's idle, but still keeps its copy played", () => {
        const { host, join, deliver, runner } = served();
        const idle = join("p1", character("Idle", "human"), { idle: true });
        const at = [...host.battle.actor(idle.joining.me).square];

        for (let time = 0; time < 12000; time += STEP_MS) {
            runner.advance(STEP_MS);
            deliver();
            idle.tick(STEP_MS);
        }

        assert.deepEqual(host.battle.actor(idle.joining.me).square, at);
        assert.equal(idle.moves + idle.fights + idle.engaged, 0);
        assert.ok(idle.steps >= 239);
        assert.equal(idle.report().desyncs, 0);
    });
});
