// Playing together over the relay (client/js/app/together.js, with server/relay.js and
// core/netplay.js), in Node against a real relay: a world opened and joined; the joined game's
// link cut, or gone quiet, and made again, a little later each try, the world sent again and
// played on the same; the host's link dropped and back, everyone told and sent the world again;
// lost for good once the relay's let the place go; a relay that doesn't answer pings never taken
// for gone because of them; the link to the host timed, and where the host's folk stand compared
import assert from "node:assert/strict";
import { once } from "node:events";
import http from "node:http";
import { after, before, describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { HOST_PLAYER, Host } from "../client/js/core/host.js";
import { MOTION } from "../client/js/core/motion.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { joinWorld, LINK_TIMING, openWorld } from "../client/js/app/together.js";
import { attachRelay, RELAY_LIMITS, RELAY_PATH } from "../server/relay.js";

// (Everything quick: pings every 50 ms, a link given up on after 200 ms unanswered)
const TIMING = Object.freeze({ ...LINK_TIMING, ping: 50, patience: 200, first: 20, most: 100, within: 3000 });
const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });
const GUEST = Object.freeze({ hero: { name: "Bryn", shape: {}, look: {}, weapon: "bow", boots: false, race: "human" }, progress: { gold: 50 } });

let httpServer;
let relay;
let address;

before(async () => {
    httpServer = http.createServer();
    relay = attachRelay(httpServer, { limits: { ...RELAY_LIMITS, grace: 2000 } });
    httpServer.listen(0);
    await once(httpServer, "listening");
    address = `ws://localhost:${httpServer.address().port}${RELAY_PATH}`;
});

after(() => {
    relay.close();
    httpServer.close();
});

// Till `check` holds (checking every 10 ms), failing after `ms`
async function until(check, ms = 3000) {
    const end = Date.now() + ms;

    while (!check()) {
        assert.ok(Date.now() < end, `waited ${ms} ms: ${check}`);
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
}

// A world opened to others, and a game that's joined it, its copy made when it's welcomed: with
// what each hears of their link, and the joined game's states and drops
async function together() {
    const host = new Host(buildWorld({ seed: 2 }), { populate: false });

    host.join({ id: HOST_PLAYER, hero: HERO });
    host.populate();

    const game = { host, hosting: null };
    const heard = { host: [], guest: [], states: 0, drops: 0 };
    const world = await openWorld(game, { address, timing: TIMING, onLink: (link) => heard.host.push(link) });
    const joined = await joinWorld({ code: world.code, character: GUEST, address, timing: TIMING, onLink: (link) => heard.guest.push(link), onDrop: () => heard.drops++ });

    joined.joining.onWelcome = ({ seed, race, snapshot }) => joined.joining.attach(Host.restore(buildWorld({ seed, race }), snapshot));
    joined.joining.onState = () => heard.states++;
    await until(() => joined.joining.host);

    // The host's world moved on, and the joined game's copy after it, all it's been sent
    const play = async (steps) => {
        for (let k = 0; k < steps; k++) {
            host.advance(STEP_MS);
        }

        world.hosting.flush();
        await until(() => joined.joining.host.battle.time + joined.joining.behind * STEP_MS >= host.battle.time && !joined.joining.astray);

        while (joined.joining.step()) {
            // (Played)
        }
    };

    const place = () => relay.rooms.get(world.code);
    const close = () => {
        joined.close();
        world.close();
    };

    return { host, world, joined, heard, play, place, close };
}

describe("playing together over the relay (together.js)", () => {
    it("brings a joined game whose link is cut back on a new one: shown reconnecting, the world asked for again, played on the same", async () => {
        const { host, joined, heard, play, place, close } = await together();

        await play(10);
        assert.equal(joined.joining.host.checksum(), host.checksum());

        // Cut, the relay's end: back before long, the world sent again
        place().peers.get("p1").socket.socket.destroy();
        await until(() => heard.guest.at(-1) === null && heard.states === 1);
        assert.deepEqual(heard.guest, ["lost", null]);
        await play(20);
        assert.equal(joined.joining.host.checksum(), host.checksum());
        assert.deepEqual(heard.host, [], "(the host's link was never the one lost)");
        assert.equal(heard.drops, 0);
        close();
    });

    it("times a word to the host and back over the relay, and has the joined copy compare where the host's folk stand: none astray", async () => {
        const { joined, play, close } = await together();

        joined.joining.ping();
        await until(() => joined.joining.rtt !== null);
        assert.ok(joined.joining.rtt >= 0 && joined.joining.rtt < 1000, `${joined.joining.rtt} ms`);

        for (let k = 0; k < 5; k++) {
            await play(MOTION.every);
        }

        // (The last of the host's motion compared once it's come)
        await until(() => {
            while (joined.joining.step()) {
                // (Played)
            }

            return joined.joining.motionChecks === 5;
        });
        assert.equal(joined.joining.desyncs, 0);
        assert.equal(joined.joining.hostStep, joined.joining.host.battle.time / STEP_MS);
        close();
    });

    it("comes back on a new link after closing its own saying it's only reconnecting (the relay saying so back)", async () => {
        const { host, joined, heard, play, close } = await together();

        joined.link.socket.close(4000);
        await until(() => heard.guest.at(-1) === null && heard.states === 1);
        assert.deepEqual(heard.guest, ["lost", null]);
        await play(10);
        assert.equal(joined.joining.host.checksum(), host.checksum());
        assert.equal(heard.drops, 0);
        close();
    });

    it("takes a link gone quiet for dropped, once the relay's been heard to answer, and comes back on a new one", async () => {
        const { heard, place, close } = await together();
        const socket = place().peers.get("p1").socket;
        const hear = socket.onMessage;

        // (Answering at first; then not a word, as a link that's died without closing)
        await new Promise((resolve) => setTimeout(resolve, TIMING.ping * 3));
        socket.onMessage = (text) => (text === "ping" ? undefined : hear(text));
        await until(() => heard.guest.at(-1) === null && heard.states === 1);
        assert.deepEqual(heard.guest, ["lost", null]);
        close();
    });

    it("tells a joined game when the host's link has dropped, and when it's back, when everyone's sent the world again", async () => {
        const { host, joined, heard, play, place, close } = await together();

        await play(5);
        place().host.socket.destroy();
        await until(() => heard.host.at(-1) === null && heard.guest.at(-1) === null && heard.states === 1);
        assert.deepEqual(heard.host, ["lost", null]);
        assert.deepEqual(heard.guest, ["away", null]);
        await play(20);
        assert.equal(joined.joining.host.checksum(), host.checksum());
        close();
    });

    it("gives up on a link that can't come back (its place gone from the relay): dropped", async () => {
        const { heard, place, close } = await together();
        const room = place();
        const { socket } = room.peers.get("p1");

        room.peers.delete("p1");
        socket.socket.destroy();
        await until(() => heard.drops === 1);
        assert.deepEqual(heard.guest, ["lost"]);
        close();
    });

    it("never takes a link for dropped because pings go unanswered by a relay that's never answered them", async () => {
        const host = new Host(buildWorld({ seed: 2 }), { populate: false });

        host.join({ id: HOST_PLAYER, hero: HERO });

        const heard = [];
        const game = { host, hosting: null };
        const world = await openWorld(game, { address, timing: TIMING, onLink: (link) => heard.push(link) });
        const socket = relay.rooms.get(world.code).host;
        const hear = socket.onMessage;

        socket.onMessage = (text) => (text === "ping" ? undefined : hear(text));
        await new Promise((resolve) => setTimeout(resolve, TIMING.patience * 4));
        assert.deepEqual(heard, []);
        world.close();
    });
});
