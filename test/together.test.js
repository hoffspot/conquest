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
import { CHECK_EVERY, Joining, LOCKSTEP_ENDS, lockstepNotice } from "../client/js/core/netplay.js";
import { Viewing } from "../client/js/core/viewing.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { HOW_WAIT, joinWorld, LINK_TIMING, openWorld, playedHow } from "../client/js/app/together.js";
import { attachRelay, RELAY_LIMITS, RELAY_PATH } from "../server/relay.js";
import { SETTINGS_DEFAULTS } from "../client/js/app/save.js";
import { unexpired } from "./helpers.js";
import { mirrored } from "./replicated.js";

// (Everything quick: pings every 50 ms, a link given up on after 200 ms unanswered)
const TIMING = Object.freeze({ ...LINK_TIMING, ping: 50, patience: 200, woken: 40, first: 20, most: 100, within: 3000 });
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

    // (And every player's mirror held to it as it's played: test/replicated.js)
    mirrored(host);

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

        const checked = joined.joining.checks;

        for (let k = 0; k < 5; k++) {
            await play(CHECK_EVERY);
        }

        // (The last of how the host said its world stood compared once it's come)
        await until(() => {
            while (joined.joining.step()) {
                // (Played)
            }

            return joined.joining.checks === checked + 5;
        });
        assert.equal(joined.joining.desyncs, 0);
        assert.equal(joined.joining.hostStep, joined.joining.host.battle.time / STEP_MS);
        close();
    });

    it("times round trips to the relay over the host's own link, when asked (for the downloader) and with its pings", async () => {
        const { world, close } = await together();
        const times = [];

        world.link.onRtt = (ms) => times.push(ms);
        world.link.measure();
        await until(() => times.length >= 1);
        assert.ok(times[0] >= 0 && times[0] < 1000, `${times[0]} ms`);

        const heard = times.length;

        world.link.measure();
        await until(() => times.length > heard);
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

    it("asks at once whether its link's still there when its page is shown again, and takes one that died while it was hidden for dropped well inside its usual patience", async () => {
        const { joined, heard, place, close } = await together();
        const socket = place().peers.get("p1").socket;
        const hear = socket.onMessage;

        // (Answering at first; shown again with the link alive, nothing comes of the asking)
        await new Promise((resolve) => setTimeout(resolve, TIMING.ping * 3));
        joined.link.woke();
        await new Promise((resolve) => setTimeout(resolve, TIMING.woken * 3));
        assert.deepEqual(heard.guest, []);

        // (Then dead without closing, as a socket is that a phone let go of while its page was hidden)
        socket.onMessage = (text) => (text === "ping" ? undefined : hear(text));

        const woken = Date.now();

        joined.link.woke();
        await until(() => heard.guest.includes("lost"));
        assert.ok(Date.now() - woken < TIMING.patience * 0.75, `${Date.now() - woken} ms`);
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

// A world opened to others the way `netcode` says, and a game that's joined it by its code alone
async function hosted(netcode) {
    const host = new Host(buildWorld({ seed: 2 }), { populate: false });

    host.join({ id: HOST_PLAYER, hero: HERO });
    host.populate();

    const game = { host, hosting: null };
    const world = await openWorld(game, { address, timing: TIMING, ...(netcode ? { netcode } : {}) });
    const joined = await joinWorld({ code: world.code, character: GUEST, address, timing: TIMING });
    const refused = [];

    joined.joining.onRefused = (reason) => refused.push(reason);

    return { host, world, joined, refused, close: () => (joined.close(), world.close()) };
}

describe("a world hosted in a browser, played by views or Classic (the scaling plan's 3-35)", () => {
    it("is Classic unless it's opened otherwise: one who joins asks how it's played, is told lockstep, and is sent the whole world", async () => {
        const { world, joined, refused, close } = await hosted();
        let welcome = null;

        joined.joining.onWelcome = (said) => (welcome = said);
        assert.equal(world.netcode, "lockstep");
        assert.equal(world.hosting.session.netcode, "lockstep");
        assert.equal(world.hosting.views.mode, "off");
        assert.equal(world.hosting.sendBinary, null, "no bytes are sent");
        assert.equal(joined.netcode, "lockstep");
        assert.ok(joined.joining instanceof Joining && !(joined.joining instanceof Viewing));
        await until(() => welcome);
        assert.ok(welcome.snapshot, "the world itself");
        assert.deepEqual(refused, []);
        close();
    });

    it("sends one who joins a world opened as replicated views and no copy: frames as text over the relay, played as they come", async () => {
        const { host, world, joined, refused, close } = await hosted("replicated");
        let welcome = null;

        assert.equal(world.netcode, "replicated");
        assert.equal(world.hosting.session.netcode, "replicated");
        assert.equal(world.hosting.views.mode, "on");
        assert.equal(joined.netcode, "replicated");
        assert.ok(joined.joining instanceof Viewing);

        joined.joining.onWelcome = (said) => {
            welcome = said;
            joined.joining.attach(new Host(buildWorld({ seed: said.seed, race: said.race }), { populate: false }), said);
        };
        await until(() => welcome);
        assert.equal(welcome.snapshot, undefined, "no copy of the world");
        assert.deepEqual(refused, []);

        // (The host's world played on, as core/runner.js plays it: each step's events told the feed)
        for (let k = 0; k < 40; k++) {
            world.hosting.views.heard(host.advance(STEP_MS));
            world.hosting.flush();
        }

        await until(() => {
            while (joined.joining.step()) {
                // (Played)
            }

            return joined.joining.frames >= 20;
        });

        const me = joined.joining.me;
        const theirs = host.battle.actors.find((actor) => actor.id === me);
        const seen = joined.joining.host.battle.actors.find((actor) => actor.id === me);

        assert.ok(theirs && seen, "their hero's in the world, and in what they're shown of it");
        assert.ok(Math.abs(theirs.x - seen.x) < 1 && Math.abs(theirs.y - seen.y) < 1, "where the world has it");
        assert.ok(joined.joining.host.battle.actors.length < host.battle.actors.length, "and they hold only what's near");
        close();
    });

    it("says nothing of lockstep's going till its date's set, and then tells a host and a guest each their own (the plan's 3-36)", () => {
        assert.equal(LOCKSTEP_ENDS, null, "no date: the owner's to set");
        assert.equal(lockstepNotice("host"), null);
        assert.equal(lockstepNotice("guest"), null);
        assert.equal(lockstepNotice("host", "soon"), null, "nothing but a date");
        assert.match(lockstepNotice("host", "2027-03-01"), /^Classic is being retired on 2027-03-01\./);
        assert.match(lockstepNotice("guest", "2027-03-01"), /retired on 2027-03-01\. Nothing of yours is lost/);
        unexpired("the notice of lockstep's going (LOCKSTEP_ENDS)", "2027-11-22");
    });

    it("is a switch that starts as it always was, and has its date", () => {
        assert.equal(SETTINGS_DEFAULTS.hostClassic, true, "Classic till its host says otherwise");
        unexpired("the host's Classic switch (hostClassic)", "2027-11-22");
    });

    it("takes a host that never says how its world's played for lockstep, after a wait; and one that names a way it doesn't know", async () => {
        const quiet = { onData: () => {}, said: [], data: (text) => quiet.said.push(text) };
        const started = Date.now();

        assert.ok(HOW_WAIT >= 1000 && HOW_WAIT <= 5000);
        assert.equal(await playedHow(quiet, 60), "lockstep");
        assert.ok(Date.now() - started >= 50);
        assert.deepEqual(quiet.said, ['{"kind":"how"}']);

        const odd = { onData: () => {}, data: () => setTimeout(() => odd.onData('{"kind":"played","netcode":"views.9"}'), 5) };

        assert.equal(await playedHow(odd, 2000), "lockstep");

        // (What else is said meanwhile isn't an answer; and the link's own hearing is put back after)
        const mine = () => {};
        const told = { onData: mine, data: () => setTimeout(() => (told.onData("not json"), told.onData('{"kind":"pong"}'), told.onData('{"kind":"played","netcode":"replicated"}')), 5) };

        assert.equal(await playedHow(told, 2000), "replicated");
        assert.equal(told.onData, mine);
    });
});
