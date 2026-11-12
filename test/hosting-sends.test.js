// What a world's host sends everyone at once (core/netplay.js Hosting `sendAll`;
// generated/multiplayer_scaling_plan.md 1-2): what's been done, each step, goes as one word with
// the list of who it's for, where whoever runs the world can take that (the world server's
// thread, whose every word to its supervisor is a copy of the text), and is the same text to the
// same players in the same order as when each is sent it; what's for one player still goes to
// that one alone
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { HOST_PLAYER, Host } from "../client/js/core/host.js";
import { CHECK_EVERY, Hosting, NET_VERSION } from "../client/js/core/netplay.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { decode, encode } from "../client/js/core/wire.js";

const guest = (name) => ({ hero: { name, shape: {}, look: {}, weapon: "bow", boots: false, race: "human" }, progress: { gold: 50 } });

// A world with its host's player in it, opened to others, and `count` joined: what's sent each
// noted one by one (`single`) and what's sent several at once (`many`), if it takes that
function opened({ count = 3, all = true } = {}) {
    const host = new Host(buildWorld({ seed: 2 }), { populate: false });

    host.join({ id: HOST_PLAYER, hero: { name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false } });
    host.populate();

    const single = [];
    const many = [];
    const hosting = new Hosting(host, { send: (peer, text) => single.push({ peer, text }), ...(all ? { sendAll: (peers, text) => many.push({ peers, text }) } : {}) });
    const peers = Array.from({ length: count }, (_, k) => `p${k + 1}`);

    for (const peer of peers) {
        hosting.hear(peer, encode({ kind: "hello", version: NET_VERSION, character: guest(`Guest ${peer}`) }));
    }

    single.length = 0;
    many.length = 0;
    hosting.sent = {};

    const play = (steps) => {
        for (let k = 0; k < steps; k++) {
            host.advance(STEP_MS);
            hosting.flush();
        }
    };

    // Everything each was sent, in order, however it was sent
    const heardBy = (peer) => [...single.map((one, k) => ({ ...one, k })), ...many.flatMap((one, k) => one.peers.map((to) => ({ peer: to, text: one.text, k })))].filter((one) => one.peer === peer).map(({ text }) => text);

    return { host, hosting, peers, single, many, play, heardBy };
}

describe("what a world's host sends everyone at once (Hosting sendAll)", () => {
    it("sends what's been done in a step as one word for everyone joined, not one each", () => {
        const { hosting, peers, single, many, play } = opened();

        play(CHECK_EVERY * 5);

        const ops = many.filter(({ text }) => decode(text).kind === "ops");

        assert.equal(ops.length, CHECK_EVERY * 5, "one word a step");
        assert.ok(ops.every((one) => one.peers.join() === peers.join()), "each naming everyone, in the order they joined");
        assert.equal(single.filter(({ text }) => decode(text).kind === "ops").length, 0, "and none sent one by one");
        assert.ok(single.length > 0 && single.every(({ text }) => decode(text).kind === "self"), "each one's own hero still told them alone");
        assert.equal(hosting.sent.ops, ops.reduce((sum, { text }) => sum + text.length * peers.length, 0), "counted as sent to each");
    });

    it("sends the same text to the same players in the same order as a host that sends each their own", () => {
        const together = opened();
        const apart = opened({ all: false });

        for (const world of [together, apart]) {
            world.host.command("guest-2", { type: "move", square: [world.host.battle.actor("guest-2").square[0] + 3, world.host.battle.actor("guest-2").square[1]] });
            world.play(12);
            world.hosting.pause("host", "Ada");
            world.hosting.resync();
            world.hosting.pause(null);
            world.play(4);
        }

        assert.equal(apart.many.length, 0);

        for (const peer of together.peers) {
            const kinds = together.heardBy(peer).map((text) => decode(text).kind);

            assert.ok(["ops", "paused", "state"].every((kind) => kinds.includes(kind)), `${peer} heard ${[...new Set(kinds)]}`);
        }

        // (What's sent everyone goes in one word and what's for one in another, so against each
        // other they may come in another order than one by one: each kind's own order is the same)
        for (const peer of together.peers) {
            for (const mine of [true, false]) {
                const kept = (texts) => texts.filter((text) => (decode(text).kind === "self") === mine);

                assert.deepEqual(kept(together.heardBy(peer)), kept(apart.heardBy(peer)));
            }
        }

        assert.deepEqual(together.hosting.sent, apart.hosting.sent);
    });

    it("sends the world again to everyone who asked in a step as one word, and to one who asked alone by themselves", () => {
        const { hosting, single, many, play } = opened();

        play(2);
        single.length = 0;
        many.length = 0;

        // (Two ask between steps: the first answered at once, alone; the next step's two together)
        hosting.asked.add("p1");
        hosting.asked.add("p3");
        hosting.flush();

        const states = many.filter(({ text }) => decode(text).kind === "state");

        assert.equal(states.length, 1);
        assert.deepEqual(states[0].peers, ["p1", "p3"]);

        hosting.hear("p2", encode({ kind: "again" }));

        assert.deepEqual(single.filter(({ text }) => decode(text).kind === "state").map(({ peer }) => peer), ["p2"]);
        assert.equal(many.filter(({ text }) => decode(text).kind === "state").length, 1);
    });

    it("sends one joined alone their own, with no list", () => {
        const { single, many, play } = opened({ count: 1 });

        play(4);

        assert.equal(many.length, 0);
        assert.equal(single.filter(({ text }) => decode(text).kind === "ops").length, 4);
    });
});
