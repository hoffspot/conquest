// The view-mode welcome and the world's summary (core/summary.js, core/viewfeed.js welcome,
// core/netplay.js Session; the scaling plan's 3-18): a game that says its mode is "view" is
// welcomed with its own record and the world's summary and no snapshot, then sent frames, which
// tell what changes of either; and never what lockstep sends
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { Battle } from "../client/js/core/battle.js";
import { Host } from "../client/js/core/host.js";
import { Mirror } from "../client/js/core/mirror.js";
import { Hosting, NET_VERSION } from "../client/js/core/netplay.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { OWN_PARTS, ownParts, patchesText, PROPS, readPatches, Summary, SUMMARY, summaryOf, textsOf, Told, WORLD_PARTS, worldParts } from "../client/js/core/summary.js";
import { decodeFrame } from "../client/js/core/view.js";
import { VIEW_MODE } from "../client/js/core/viewfeed.js";
import { decode, encode } from "../client/js/core/wire.js";

const character = (name, race = "human") => ({ hero: { name, race, weapon: "sword", boots: false, shape: {}, look: {} } });

// A world with no host player, its view feed as `mode` says, that can send bytes or can't; what
// each peer's sent kept by peer: texts (decoded) and frames
function served({ mode = "dark", bytes = true } = {}) {
    const world = buildWorld({ seed: 2 });
    const host = new Host(world, { populate: false });

    host.populate();

    const heard = new Map();
    const of = (peer) => heard.get(peer) ?? heard.set(peer, { texts: [], sizes: [], frames: [] }).get(peer);
    const hosting = new Hosting(host, {
        send: (peer, text) => {
            of(peer).texts.push(decode(text));
            of(peer).sizes.push(text.length);
        },
        ...(bytes ? { sendBinary: (peer, frame) => (of(peer).frames.push(Uint8Array.from(frame)), hosting.onBytes?.(peer, Uint8Array.from(frame))) } : {}),
    });

    hosting.views.mode = mode;

    const step = () => {
        const events = host.advance(STEP_MS);

        hosting.views.heard(events);
        hosting.flush();
    };

    return { world, host, hosting, of, step };
}

describe("the world's summary (core/summary.js)", () => {
    it("is the world's kept forms in parts of small entries, the same for every player but their own; and what's changed since a player was told is that entry and no other", () => {
        const { host, hosting } = served();

        hosting.hear("a", encode({ kind: "hello", version: NET_VERSION, character: character("Ann") }));
        hosting.hear("b", encode({ kind: "hello", version: NET_VERSION, character: character("Bea", "elf") }));

        const [ann, bea] = ["a", "b"].map((peer) => hosting.players.get(peer));
        const world = worldParts(host);
        const snapshot = host.snapshot();

        assert.deepEqual(Object.keys(world), WORLD_PARTS);
        assert.deepEqual(Object.keys(ownParts(host, ann)), OWN_PARTS);
        assert.equal(ownParts(host, "no one"), null);

        // (As the snapshot keeps them: every town, works and realm, each its own entry)
        assert.deepEqual([...world.towns.values()].map((text) => decode(text)), snapshot.war.towns);
        assert.deepEqual([...world.works.keys()], snapshot.war.works.map(({ id }) => id));
        assert.deepEqual(decode(world.clock.get("")), { turn: snapshot.war.turn, clock: snapshot.war.clock, stage: snapshot.war.stage, might: snapshot.war.might, victor: snapshot.war.victor });
        assert.deepEqual(decode(world.rules.get("")), snapshot.rules);
        assert.deepEqual([...world.roster.keys()].sort(), [ann, bea].sort());
        assert.deepEqual(decode(world.roster.get(bea)), { id: bea, name: "Bea", race: "elf", realm: host.players.get(bea).realm, role: host.players.get(bea).role ?? null, away: false });

        // (A player's own: their record as the world keeps it, field by field; no one else's)
        const kept = snapshot.players.find(({ id }) => id === ann);
        const own = Object.fromEntries([...ownParts(host, ann).own].map(([key, text]) => [key, decode(text)]));

        assert.deepEqual(own, Object.fromEntries(Object.entries(decode(encode(kept))).filter(([, value]) => value !== null && value !== undefined)));
        assert.equal(own.hero.name, "Ann");
        assert.ok(!JSON.stringify([...world.roster.values()]).includes("talks"), "the roster says who's here, not what each has done");

        // (Told once, nothing's changed; a town taken is that town's entry)
        const told = new Told();
        const first = told.diff(summaryOf(host, ann, world));

        assert.ok(first.length > 100 && first.every(([, , value]) => typeof value === "string"));
        assert.deepEqual(told.diff(summaryOf(host, ann)), []);

        const town = host.war.towns?.[3] ?? [...(host.war.towns?.values?.() ?? [])][3];

        town.owner = town.owner === "orc" ? "elf" : "orc";

        const changed = told.diff(summaryOf(host, ann));

        assert.deepEqual(changed.map(([part, key]) => [part, key]), [["towns", town.id]]);
        assert.equal(decode(changed[0][2]).owner, town.owner);

        // (A game's side: the patches taken, as the world has it; and one gone)
        const game = new Summary();

        game.take(readPatches(patchesText(first)));
        game.take(readPatches(patchesText(changed)));
        assert.deepEqual(game.texts(), textsOf(summaryOf(host, ann)));
        assert.equal(game.get("towns", town.id).owner, town.owner);
        assert.equal(game.get("rules").rest, snapshot.rules.rest);
        game.take([["roster", bea, null]]);
        assert.equal(game.get("roster", bea), undefined);
    });

    it("tells of the director's props near a player's hero, and of one that doesn't say where it is wherever they are", () => {
        const { host, hosting } = served();

        hosting.hear("a", encode({ kind: "hello", version: NET_VERSION, character: character("Ann") }));

        const ann = hosting.players.get("a");
        const hero = host.battle.actor(ann);

        host.ground.set("g1", { id: "g1", map: hero.map, at: [hero.x + 30, hero.y], item: "bread" });
        host.ground.set("g2", { id: "g2", map: hero.map, at: [hero.x + SUMMARY.near + 5, hero.y], item: "far off" });
        host.ground.set("g3", { id: "g3", map: "inside:9", at: [hero.x, hero.y], item: "on another map" });
        host.campfires.push({ id: "c1", map: hero.map, x: hero.x, y: hero.y + 40 });
        host.caches.set("k1", { id: "k1", band: "bandits" });

        assert.deepEqual([...ownParts(host, ann).props.keys()].sort(), ["caches:k1", "campfires:c1", "ground:g1"]);
        assert.ok(PROPS.includes("ground") && PROPS.includes("campfires"));

        // (The hero walks towards the far one: it's told of; away from the near: it's gone)
        const told = new Told();

        told.diff(summaryOf(host, ann));
        hero.x += 60;
        assert.deepEqual(told.diff(summaryOf(host, ann)).filter(([part]) => part === "props").map(([, key, value]) => [key, value === null]), [["ground:g2", false]]);
        hero.x += SUMMARY.near;
        assert.deepEqual(told.diff(summaryOf(host, ann)).filter(([part]) => part === "props").map(([, key, value]) => [key, value === null]).sort(), [["campfires:c1", true], ["ground:g1", true]]);
    });
});

describe("the view-mode welcome (core/netplay.js Session, core/viewfeed.js welcome)", () => {
    it("welcomes a game that says its mode is view with its own record and the world's summary and no snapshot, in 64 KB; then sends it frames, and nothing of lockstep's", () => {
        const { world, host, hosting, of, step } = served();

        // (A lockstep game in the world too, to be sent what lockstep sends)
        hosting.hear("l", encode({ kind: "hello", version: NET_VERSION, character: character("Lok") }));
        hosting.hear("v", encode({ kind: "hello", version: NET_VERSION, mode: VIEW_MODE, character: character("Vee", "elf") }));

        const [welcome] = of("v").texts.filter(({ kind }) => kind === "welcome");
        const size = of("v").sizes[of("v").texts.indexOf(welcome)];
        const me = hosting.players.get("v");

        assert.deepEqual(Object.keys(welcome).sort(), ["id", "kind", "mode", "own", "paused", "race", "seed", "step", "version", "world"]);
        assert.deepEqual([welcome.mode, welcome.id, welcome.seed, welcome.version, welcome.step], ["view", me, world.seed, NET_VERSION, hosting.step()]);
        assert.ok(!("snapshot" in welcome));
        assert.ok(size <= 64 * 1024, `${size} bytes`);
        assert.ok(size > 10000, `${size} bytes: the towns and works are in it`);
        assert.equal(welcome.own.hero.name, "Vee");
        assert.deepEqual(Object.keys(welcome.world).sort(), [...WORLD_PARTS, "invites", "props"].filter((part) => Object.keys(welcome.world).includes(part)).sort());
        assert.ok(Object.keys(welcome.world.towns).length >= 50 && welcome.world.roster[me].name === "Vee");

        // (The lockstep game's is as ever: the world itself)
        const theirs = of("l").texts.find(({ kind }) => kind === "welcome");

        assert.ok(theirs.snapshot && !("mode" in theirs) && !("own" in theirs));
        assert.ok(hosting.session.viewing.has("v") && !hosting.session.viewing.has("l"));

        // (Its game: a mirror begun from the welcome, taking every frame; held to the world as
        // each frame's made, which is as the step left it)
        const mirror = new Mirror(new Battle(world, { seed: 1 }));
        let held = 0;

        mirror.welcome(welcome);
        assert.deepEqual(mirror.summary.texts(), textsOf(summaryOf(host, me)));
        of("v").frames.splice(0).forEach((frame) => mirror.apply(frame));
        hosting.onBytes = (peer, frame) => {
            if (peer !== "v") {
                return;
            }

            assert.ok(mirror.apply(frame));

            // (Where the frame says everything's told as of this step: the summary, entry for entry)
            if (decodeFrame(frame).sections.world?.includes(`"at":${hosting.step()}`)) {
                assert.deepEqual(mirror.summary.texts(), textsOf(summaryOf(host, me)), `step ${hosting.step()}`);
                held++;
            }
        };

        const lok = hosting.players.get("l");
        const at = host.battle.actor(lok).square;

        for (let k = 0; k < 200; k++) {
            if (k % 40 === 0) {
                hosting.hear("l", encode({ kind: "command", seq: k / 40 + 1, command: { type: "move", to: [at[0] + (k % 80 ? 5 : -4), at[1] + 3], run: true } }));
            }

            // (Something of the world changes as it's played: a town changes hands)
            if (k === 90) {
                const town = host.war.towns?.[5] ?? [...(host.war.towns?.values?.() ?? [])][5];

                town.owner = town.owner === "orc" ? "elf" : "orc";
            }

            step();
        }

        assert.ok(held >= 9, `${held} times held to the world`);
        assert.deepEqual(mirror.faults, []);
        assert.equal(mirror.known[0].actor.id, me);
        assert.ok(mirror.size >= 2 && mirror.frames >= 190);
        assert.deepEqual(new Set(mirror.battle.actors.map(({ id }) => id)), new Set(hosting.views.viewers.get(me).list.filter(({ who }) => who).map(({ actor }) => actor.id)));

        // (And of lockstep's sendings, none: no ops, no sums, no world; the other has them)
        const kinds = (peer) => new Set(of(peer).texts.map(({ kind }) => kind));

        assert.ok(kinds("l").has("ops"), [...kinds("l")].join(", "));
        assert.deepEqual([...kinds("v")].filter((kind) => !["welcome", "self", "paused"].includes(kind)), []);
        assert.ok(of("v").sizes.reduce((sum, length) => sum + length, 0) < of("l").sizes.reduce((sum, length) => sum + length, 0));

        // (It asks for the world again, as a copy gone astray would: it has none, and is sent none)
        hosting.hear("v", encode({ kind: "again" }));
        step();
        assert.ok(!kinds("v").has("state"));

        // (Gone: nothing of it kept)
        hosting.gone("v");
        step();
        assert.ok(!hosting.session.viewing.has("v") && !hosting.views.viewers.has(me) && !hosting.views.shadowing.has(me));
    });

    it("refuses a view-mode hello where the view feed's off or bytes can't be sent, as a way of playing the world isn't played; and takes a hello with no mode as ever", () => {
        for (const options of [{ mode: "off" }, { bytes: false }]) {
            const { hosting, of } = served(options);

            hosting.hear("v", encode({ kind: "hello", version: NET_VERSION, mode: VIEW_MODE, character: character("Vee") }));
            assert.deepEqual(of("v").texts.map(({ kind, reason, netcode }) => [kind, reason, netcode]), [["refused", "netcode", "lockstep"]]);
            assert.ok(!hosting.players.has("v") && !hosting.session.viewing.size);

            hosting.hear("l", encode({ kind: "hello", version: NET_VERSION, character: character("Lok") }));
            assert.ok(of("l").texts.find(({ kind }) => kind === "welcome").snapshot);
        }

        assert.equal(VIEW_MODE, "view");
    });
});
