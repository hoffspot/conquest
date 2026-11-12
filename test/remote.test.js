// The link seam (core/remote.js; generated/multiplayer_scaling_plan.md 3-2): all a joined game
// asks of its link to the world, in one list, with lockstep's Joining its one implementation.
// What a machine can hold of it: Joining has every member; the game's code reaches its `remote`
// through no other; and no member is there that the game doesn't use.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { Joining } from "../client/js/core/netplay.js";
import { asRemote, REMOTE, REMOTE_MEMBERS } from "../client/js/core/remote.js";

const read = (file) => readFileSync(new URL(`../client/js/${file}`, import.meta.url), "utf8");

// The members of a `remote` that code reaches (remote.x, remote?.x: this.remote's, a game's; not
// this module's file as a comment names it)
const reached = (text) => new Set([...text.matchAll(/(?<![\w/])remote\??\.([A-Za-z_$][\w$]*)/g)].map(([, name]) => name));

// What's lockstep's own and not the seam's, which the debug overlay's line says of a joined game
// (app/debug.js netLine). A second kind of link brings a line of its own
const LOCKSTEP_DEBUG = ["rtt", "jitter", "checks", "motionChecks", "desyncs", "resyncs", "skips"];

describe("the link seam (core/remote.js REMOTE)", () => {
    it("names each member once, with what it's for", () => {
        assert.equal(new Set(REMOTE_MEMBERS).size, REMOTE_MEMBERS.length);
        assert.deepEqual(Object.keys(REMOTE), ["does", "tells", "hears"]);

        for (const group of Object.values(REMOTE)) {
            for (const [name, words] of Object.entries(group)) {
                assert.ok(typeof words === "string" && words.length > 10, name);
            }
        }

        assert.ok(Object.keys(REMOTE.hears).every((name) => /^on[A-Z]/.test(name)));
    });

    it("is implemented by lockstep's Joining, whole, from the moment it's made", () => {
        const joining = new Joining({ send: () => {}, clock: () => 0 });

        assert.equal(asRemote(joining), joining, "itself, not a copy: what's set on it is set on the link");

        for (const name of Object.keys(REMOTE.does)) {
            assert.equal(typeof joining[name], "function", name);
        }

        for (const name of [...Object.keys(REMOTE.tells), ...Object.keys(REMOTE.hears)]) {
            assert.ok(name in joining, name);
        }

        // (And as the game finds it before the world's said anything)
        assert.deepEqual([joining.self, joining.behind, joining.paused, joining.farBehind, joining.lately, joining.onWay], [null, 0, null, false, null, null]);
    });

    it("refuses what isn't a link, naming what it lacks; and takes anything that has every member", () => {
        assert.throws(() => asRemote(null), /Not a link a game can play over/);
        assert.throws(() => asRemote({}), new RegExp(`it has no ${REMOTE_MEMBERS.join(", ")}\\.$`));

        // (Another link, one day: made of nothing but the seam)
        const other = { ...Object.fromEntries(Object.keys(REMOTE.does).map((name) => [name, () => null])), ...Object.fromEntries([...Object.keys(REMOTE.tells), ...Object.keys(REMOTE.hears)].map((name) => [name, null])) };

        assert.equal(asRemote(other), other);

        for (const name of REMOTE_MEMBERS) {
            const { [name]: gone, ...rest } = other;

            assert.throws(() => asRemote(rest), new RegExp(`it has no ${name.replace("$", "\\$")}\\.$`), `without ${name} (${typeof gone})`);
        }

        assert.throws(() => asRemote({ ...other, step: 5 }), /it has no step\.$/, "what's called must be callable");
    });

    it("is all the game's code reaches of its link: app/game.js and app/main.js use no member that isn't in it, and every member is used", () => {
        const game = reached(read("app/game.js"));
        const main = reached(read("main.js"));
        const debug = reached(read("app/debug.js"));
        const beyond = (used) => [...used].filter((name) => !REMOTE_MEMBERS.includes(name));

        assert.ok(game.size >= 15, "the game's uses of its link are found");
        assert.deepEqual(beyond(game), [], "app/game.js reaches its link through the seam alone: a member it needs is added to core/remote.js REMOTE, and to every link");
        assert.deepEqual(beyond(main), [], "and so does main.js");
        assert.deepEqual(beyond(debug).sort(), [...LOCKSTEP_DEBUG].sort(), "the debug overlay's line says lockstep's own counters, and no others");
        assert.deepEqual(REMOTE_MEMBERS.filter((name) => !game.has(name) && !main.has(name) && !debug.has(name)), [], "no member the game doesn't use");
    });

    it("is where a joined game is given its link: app/session.js makes it a game's `remote` through asRemote, and nowhere else makes a game with one", () => {
        assert.match(read("app/session.js"), /new Game\(\{[^\n]*\bremote: asRemote\(joining\),/);
        assert.equal([...read("app/session.js").matchAll(/\bremote:/g)].length, 1);
        assert.equal([...read("main.js").matchAll(/\bremote:/g)].length, 0);
    });
});
