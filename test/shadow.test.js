// A shadow (core/shadow.js; the scaling plan's 3-17): a lockstep game also sent its player's
// frames by a world that runs the view feed, each held to its own copy. Played here as the world
// server plays it: a world with no host player, bots joined to it who walk about and fight
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { BOT, Bot } from "../client/js/core/bot.js";
import { Host } from "../client/js/core/host.js";
import { Hosting, Joining, NET_VERSION } from "../client/js/core/netplay.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { COUNTERS } from "../client/js/core/probe.js";
import { WorldRunner } from "../client/js/core/runner.js";
import { SHADOW, SHADOW_COUNTS, SHADOW_FAULTS, Shadow } from "../client/js/core/shadow.js";
import { decodeFrame, encodeFrame, VIEW, ViewState } from "../client/js/core/view.js";
import { SHADOW_KIND } from "../client/js/core/viewfeed.js";
import { decode, encode } from "../client/js/core/wire.js";

const character = (name, race) => ({ hero: { name, race, weapon: "sword", boots: false, shape: {}, look: {} } });

// A world with no host player and a way for bots to join it over links: what's sent queued both
// ways, text and bytes in the one order, delivered when asked. `mode` is its view feed's; `bytes`
// whether it can send them; `late`, how many deliveries each message of bytes is held back
function served({ mode = "dark", bytes = true, late = 0, meddle = null } = {}) {
    const host = new Host(buildWorld({ seed: 2 }), { populate: false, rules: { rest: "everyone", debug: "owner" } });

    host.populate();

    const post = [];
    const held = [];
    const sent = { texts: [], frames: [] };
    const hosting = new Hosting(host, {
        send: (peer, text) => {
            sent.texts.push(`${peer} ${text}`);
            post.push({ to: peer, text });
        },
        ...(bytes ? { sendBinary: (peer, frame) => {
            sent.frames.push({ peer, frame: Uint8Array.from(frame) });
            (late ? held : post).push({ to: peer, frame: Uint8Array.from(frame), wait: late });
        } } : {}),
    });
    const joinings = new Map();
    const deliver = () => {
        // (Bytes held back a delivery or more: as a frame that comes after its step's been played)
        for (let k = held.length - 1; k >= 0; k--) {
            if (--held[k].wait < 0) {
                post.push(...held.splice(k, 1));
            }
        }

        post.sort((a, b) => (a.wait ?? -9) - (b.wait ?? -9));

        while (post.length) {
            const { to, from, text, frame } = post.shift();

            if (from) {
                hosting.hear(from, text);
            } else if (frame) {
                joinings.get(to)?.frame(meddle ? meddle(frame) : frame);
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

    hosting.views.mode = mode;
    hosting.roleOf = (peer) => (peer === "p1" ? "owner" : "player");

    const runner = new WorldRunner(host, { hosting });
    const play = (ms, bots) => {
        for (let time = 0; time < ms; time += STEP_MS) {
            runner.advance(STEP_MS);
            deliver();
            bots.forEach((bot) => bot.tick(STEP_MS));
            deliver();
        }
    };

    return { host, hosting, join, deliver, runner, sent, play };
}

const timing = { ...BOT, firstFight: 2000 };

describe("a shadow (core/shadow.js)", () => {
    it("holds every frame of a game that's asked for them to its own copy: two players who walk and fight, 40 seconds, and no difference found", () => {
        const { host, hosting, join, play, sent } = served();
        const owner = join("p1", character("Ada", "human"), { seed: 1, timing });
        const elf = join("p2", character("Syl", "elf"), { seed: 2, timing });

        play(1000, [owner, elf]);
        assert.equal(sent.frames.length, 0, "no one's asked: none sent, though they're made");
        assert.ok(hosting.views.totals.frames > 0);
        assert.equal(owner.joining.shadow, null);

        owner.joining.shadowing(true);
        elf.joining.shadowing(true);
        play(40000, [owner, elf]);

        assert.ok(owner.fights >= 1 && owner.engaged >= 1, "the owner fought");
        assert.ok(!owner.joining.astray && !elf.joining.astray);

        for (const bot of [owner, elf]) {
            const { shadow, me } = bot.joining;
            const viewer = hosting.views.viewers.get(me);

            assert.ok(shadow.live);
            assert.deepEqual(shadow.lines, []);
            assert.equal(shadow.differences, 0);
            assert.ok(shadow.counts.frames >= 790 && shadow.counts.compared >= 790, JSON.stringify(shadow.counts));
            assert.deepEqual([shadow.counts.late, shadow.counts.skipped], [0, 0], "every frame held to its step");

            // (Its mirror knows just whom the feed says the player's been told of)
            assert.deepEqual(new Set(shadow.mirror.battle.actors.map(({ id }) => id)), new Set(viewer.list.filter(({ who }) => who).map(({ actor }) => actor.id)));
            assert.ok(shadow.mirror.size >= 2, `${shadow.mirror.size} known of`);
            assert.ok(shadow.mirror.heard > 0, "and it's heard its player's events");
            assert.equal(shadow.mirror.known[0].actor.id, me);
            assert.equal(shadow.played, Math.floor(host.battle.time / STEP_MS));
        }

        // (A frame every step for each, whether or not there was anything to say)
        const mine = sent.frames.filter(({ peer }) => peer === "p1").map(({ frame }) => decodeFrame(frame));

        assert.ok(mine.every((frame, k) => k === 0 || frame.step === mine[k - 1].step + 1), "one a step");
        assert.equal(encodeFrame(new ViewState(), { step: 5, origin: [0, 0], always: true }).bytes.length, VIEW.header, "with nothing to say, the step alone");
        assert.ok(sent.frames.every(({ frame }) => frame.length <= SHADOW.most));
        assert.ok(COUNTERS.includes("views.sent"));
        assert.deepEqual(SHADOW_FAULTS.filter((name) => !SHADOW_COUNTS.includes(name)), []);
        assert.equal(SHADOW_KIND, "views");

        // (Asked to stop: no more sent)
        const before = sent.frames.length;

        owner.joining.shadowing(false);
        elf.joining.shadowing(false);
        play(500, [owner, elf]);
        assert.ok(sent.frames.length - before <= 2, "none after the asking's heard");
        assert.equal(owner.joining.shadow, null);
        assert.equal(hosting.views.shadowing.size, 0);
    });

    it("holds a frame that comes after its step's been played to what the copy said of that step then", () => {
        const { join, play } = served({ late: 3 });
        const owner = join("p1", character("Ada", "human"), { seed: 1, timing });

        play(500, [owner]);
        owner.joining.shadowing(true);
        play(12000, [owner]);

        const { shadow } = owner.joining;

        assert.equal(shadow.differences, 0, shadow.lines.join("\n"));
        assert.ok(shadow.counts.compared >= 200, JSON.stringify(shadow.counts));
        assert.equal(shadow.counts.late, 0, "each found its step's capture");
    });

    it("keeps every frame that comes while its copy's still being made and has played no step, however many: the first of them say who everyone is", () => {
        const { join, play } = served();
        const owner = join("p1", character("Ada", "human"), { seed: 1, timing });

        // (Asked for, and then ten seconds in which the copy plays nothing, as a world still
        // loading in a browser plays nothing: 200 frames come, far more than are kept waiting
        // once it's playing)
        owner.joining.shadowing(true);
        play(10000, []);

        const { shadow } = owner.joining;

        assert.ok(shadow.live && shadow.counts.frames >= 190 && shadow.counts.frames > SHADOW.kept * 3, JSON.stringify(shadow.counts));
        assert.equal(shadow.counts.compared, 0);
        assert.equal(shadow.mirror, null);

        // (Then it plays. So far behind, it's sent the world again and begins where the world
        // is by then: the frames of the steps it never played are taken in their order, held to
        // nothing, and every step it does play is held to its frame. None's lost)
        play(8000, [owner]);
        assert.equal(shadow.differences, 0, shadow.lines.join("\n"));
        assert.ok(shadow.counts.late >= 190 && shadow.counts.compared >= 140, JSON.stringify(shadow.counts));
        assert.equal(shadow.counts.late + shadow.counts.compared, shadow.counts.frames);
        assert.ok(shadow.mirror.size >= 2);
        assert.deepEqual(shadow.mirror.faults, []);
    });

    it("begins again when it's asked again, taking nothing of what was on its way from before", () => {
        const { join, play, hosting } = served({ late: 2 });
        const owner = join("p1", character("Ada", "human"), { seed: 1, timing });

        play(500, [owner]);
        owner.joining.shadowing(true);
        play(3000, [owner]);

        const first = owner.joining.shadow;

        owner.joining.shadowing(true);
        play(6000, [owner]);

        const { shadow } = owner.joining;

        assert.notEqual(shadow, first);
        assert.ok(shadow.live && shadow.counts.stale >= 1, JSON.stringify(shadow.counts));
        assert.equal(shadow.differences, 0, shadow.lines.join("\n"));
        assert.ok(shadow.counts.compared >= 80);
        assert.equal(hosting.views.viewers.get(owner.joining.me).list.filter(({ who }) => who).length, shadow.mirror.size);
    });

    it("finds what differs: a frame whose bytes were changed on the way, a frame that never came", () => {
        // (Someone's place moved a little in one frame in ten, on its way)
        let n = 0;
        const moved = served({
            meddle: (frame) => {
                const read = decodeFrame(frame);

                if (!read.records.some((record) => record.x !== undefined) || read.leaves.length || ++n % 10) {
                    return frame;
                }

                const bytes = Uint8Array.from(frame);

                // (The first record's place: after the header, its index and its mask)
                bytes[VIEW.header + 2] ^= 0x40;

                return bytes;
            },
        });
        const one = moved.join("p1", character("Ada", "human"), { seed: 1, timing });

        moved.play(500, [one]);
        one.joining.shadowing(true);
        moved.play(8000, [one]);
        assert.ok(one.joining.shadow.counts.values >= 3, JSON.stringify(one.joining.shadow.counts));
        assert.match(one.joining.shadow.lines[0], /^step \d+, values: \S+ at .*, and the copy has /);
        assert.ok(one.joining.shadow.lines.length <= SHADOW.lines);
        assert.ok(!one.joining.astray, "lockstep's none the worse for it");

        // (A frame in seven lost: who came in it is never known of, and what's said of them after can't be so)
        let k = 0;
        const lost = served({ meddle: (frame) => (++k % 7 === 3 ? new Uint8Array(0) : frame) });
        const two = lost.join("p1", character("Ada", "human"), { seed: 1, timing });

        lost.play(500, [two]);
        two.joining.shadowing(true);
        lost.play(8000, [two]);

        const { counts, lines } = two.joining.shadow;

        assert.ok(counts.faults >= 5, JSON.stringify(counts));
        assert.ok(lines.some((line) => /0 bytes that aren't a frame/.test(line)));
        assert.ok(two.joining.shadow.differences >= counts.faults);

        // (And bytes that are no frame at all, with no step played: counted, nothing thrown)
        const bare = new Shadow();

        bare.take(new Uint8Array([1, 2, 3]));
        assert.equal(bare.counts.faults, 1);
        assert.equal(bare.mirror, null);
    });

    it("gets nothing from a world whose feed's off, or that can't send bytes, or that's never heard of the asking; and lockstep's the same for the asking", () => {
        const plain = served({ mode: "off" });
        const asked = served({ mode: "off" });
        const mute = served({ bytes: false });
        const bots = [plain, asked, mute].map((world) => world.join("p1", character("Ada", "human"), { seed: 1, timing }));

        [plain, asked, mute].forEach((world, n) => world.play(500, [bots[n]]));
        bots[1].joining.shadowing(true);
        bots[2].joining.shadowing(true);
        [plain, asked, mute].forEach((world, n) => world.play(6000, [bots[n]]));

        for (const bot of bots.slice(1)) {
            assert.deepEqual(bot.joining.shadow.counts, Object.fromEntries(SHADOW_COUNTS.map((name) => [name, 0])));
            assert.equal(bot.joining.shadow.live, false);
            assert.ok(!bot.joining.astray);
        }

        assert.deepEqual([asked.sent.frames.length, mute.sent.frames.length], [0, 0]);
        assert.ok(mute.hosting.views.totals.frames > 0, "made, where the feed's dark; not sent");

        // (Everything the world sent by lockstep is the same, asked or not)
        assert.deepEqual(asked.sent.texts, plain.sent.texts);
        assert.equal(asked.host.checksum(), plain.host.checksum());

        // (A hosting from before the kind was known: heard as any kind unknown, nothing closed or refused)
        const texts = [];
        const old = new Hosting(new Host(buildWorld({ seed: 2 }), { populate: false }), { send: (peer, text) => texts.push(decode(text)) });

        old.hear("z", encode({ kind: "hello", version: NET_VERSION, character: character("Zed", "human") }));
        old.views = { shadow: () => assert.fail("not asked of one who isn't a player"), flush() {}, idle() {}, stop() {}, heard() {} };
        old.hear("stranger", encode({ kind: SHADOW_KIND, shadow: true }));
        assert.ok(texts.every(({ kind }) => kind !== "refused"));
    });
});
