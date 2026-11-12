// What a game says it can play (generated/multiplayer_scaling_plan.md F-3): the netcodes it
// speaks, said in its hello, and a world played another way refusing it in words. Added and
// opted into, so nothing changes for a game that says nothing: it speaks lockstep alone.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HOST_PLAYER, Host } from "../client/js/core/host.js";
import { Hosting, Joining, NETCODES, NET_REFUSALS, NET_VERSION, SPEAKS, speaksOf } from "../client/js/core/netplay.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { decode, encode } from "../client/js/core/wire.js";
import { SERVER_REFUSALS } from "../client/js/app/servers.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });
const guest = (name) => ({ hero: { name, shape: {}, look: {}, weapon: "bow", boots: false, race: "human" }, progress: { gold: 50 } });

// A host's world opened to others, and what it answered each who said hello (by peer)
function opened() {
    const host = new Host(buildWorld({ seed: 2 }), { populate: false });

    host.join({ id: HOST_PLAYER, hero: HERO });
    host.populate();

    const answers = new Map();
    const hosting = new Hosting(host, {
        send: (peer, text) => {
            const message = decode(text);

            if (message.kind === "welcome" || message.kind === "refused") {
                answers.set(peer, message);
            }
        },
    });

    return { host, hosting, answers };
}

describe("what a game says it speaks (netplay.js SPEAKS)", () => {
    it("is lockstep, the only netcode there is, and a game that says nothing speaks lockstep alone", () => {
        assert.deepEqual([...NETCODES], ["lockstep"]);
        assert.deepEqual([...SPEAKS], ["lockstep"]);
        assert.deepEqual(speaksOf(undefined), ["lockstep"]);
        assert.deepEqual(speaksOf(null), ["lockstep"]);
        assert.deepEqual(speaksOf("views"), ["lockstep"]);
        assert.deepEqual(speaksOf(["lockstep", "views.1"]), ["lockstep", "views.1"]);

        // (What it says is taken as said: nothing, if it says it speaks nothing; and only names)
        assert.deepEqual(speaksOf([]), []);
        assert.deepEqual(speaksOf(["views.1", 7, null, "x".repeat(33)]), ["views.1"]);
        assert.equal(speaksOf(Array.from({ length: 40 }, (_, k) => `n${k}`)).length, 16);
    });

    it("is said in a joiner's hello, beside its version", () => {
        const said = [];
        const joining = new Joining({ send: (text) => said.push(decode(text)) });

        joining.hello(guest("Bryn"));
        assert.equal(said[0].kind, "hello");
        assert.equal(said[0].version, NET_VERSION);
        assert.deepEqual(said[0].speaks, ["lockstep"]);
    });

    it("lets into a lockstep world a game that says nothing, one that says lockstep, and one that speaks more besides", () => {
        const { hosting, answers } = opened();

        assert.equal(hosting.netcode, "lockstep");
        hosting.hear("old", encode({ kind: "hello", version: NET_VERSION, character: guest("Old") }));
        hosting.hear("now", encode({ kind: "hello", version: NET_VERSION, character: guest("Now"), speaks: ["lockstep"] }));
        hosting.hear("new", encode({ kind: "hello", version: NET_VERSION, character: guest("New"), speaks: ["views.1", "lockstep"] }));
        assert.deepEqual(["old", "now", "new"].map((peer) => answers.get(peer).kind), ["welcome", "welcome", "welcome"]);
    });

    it("refuses a game that can't play the world the way it's played, saying which way that is, in words it can show", () => {
        const { host, hosting, answers } = opened();
        const refusals = [];
        const joining = new Joining({ send: () => {} });

        joining.onRefused = (reason, message) => refusals.push({ reason, netcode: message.netcode });

        // (A game that speaks no lockstep, in a lockstep world)
        hosting.hear("p1", encode({ kind: "hello", version: NET_VERSION, character: guest("Bryn"), speaks: ["views.1"] }));
        assert.deepEqual(answers.get("p1"), { kind: "refused", reason: "netcode", netcode: "lockstep" });

        // (A world played another way, one day: a game that says nothing, or lockstep alone, is refused)
        hosting.netcode = "views.1";
        hosting.hear("p2", encode({ kind: "hello", version: NET_VERSION, character: guest("Cael") }));
        hosting.hear("p3", encode({ kind: "hello", version: NET_VERSION, character: guest("Dara"), speaks: ["lockstep"] }));
        assert.deepEqual(answers.get("p2"), { kind: "refused", reason: "netcode", netcode: "views.1" });
        assert.deepEqual(answers.get("p3"), { kind: "refused", reason: "netcode", netcode: "views.1" });
        assert.equal(host.players.size, 1, "nobody came in");

        // (Another version is said first: its words are the ones that help)
        hosting.hear("p4", encode({ kind: "hello", version: NET_VERSION + 1, character: guest("Eda") }));
        assert.equal(answers.get("p4").reason, "version");

        joining.hear(encode(answers.get("p2")));
        assert.deepEqual(refusals, [{ reason: "netcode", netcode: "views.1" }]);
        assert.match(NET_REFUSALS.netcode, /can't join\. Reload this page for the newest version\./);
        assert.match(SERVER_REFUSALS.netcode, /Reload this page for the newest version, or open the game from the server itself/);
    });
});
