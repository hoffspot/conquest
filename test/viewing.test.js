// A replicated world's link (core/viewing.js; the scaling plan's 3-21): two games sent views
// of a world and holding no copy of it, each kept by what the world says, moving, fighting and
// trading; a replicated world refusing a game that asks for all of it; and lockstep as ever
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { Host } from "../client/js/core/host.js";
import { Hosting, Joining, NETCODES } from "../client/js/core/netplay.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { asRemote, REMOTE_MEMBERS } from "../client/js/core/remote.js";
import { dressOf } from "../client/js/core/viewfeed.js";
import { Viewing } from "../client/js/core/viewing.js";
import { decode } from "../client/js/core/wire.js";

const character = (name, weapon = "sword") => ({ hero: { name, shape: {}, look: {}, weapon, boots: false, race: "human" }, progress: { gold: 50, skills: { blade: 300 } } });

// A replicated world hosted, and games that come into it over links that take no time: each a
// Viewing, its world a Host of the same seed that's never stepped
function replicated({ netcode = "replicated", mode = "on" } = {}) {
    const world = buildWorld({ seed: 2 });
    const host = new Host(world, { populate: false });
    const games = new Map();
    const refused = new Map();
    let now = 0;
    const hosting = new Hosting(host, {
        send: (peer, text) => games.get(peer)?.link.hear(text),
        sendBinary: (peer, bytes) => games.get(peer)?.link.frame(Uint8Array.from(bytes)),
    });

    host.join({ id: "host", hero: { name: "Host", shape: {}, look: {}, weapon: "sword", boots: false } });
    host.populate();
    hosting.session.netcode = netcode;
    hosting.views.mode = mode;

    return {
        host,
        hosting,
        games,
        refused,
        // Someone come in: `Link` the kind of link they ask with
        come(peer, who, Link = Viewing) {
            const link = new Link({ send: (text) => hosting.hear(peer, text), clock: () => now });
            const game = { link, events: [], welcome: null };

            games.set(peer, game);
            link.onRefused = (reason, more) => refused.set(peer, { reason, netcode: more?.netcode });
            link.onWelcome = (welcome) => {
                game.welcome = welcome;

                if (Link === Viewing) {
                    link.attach(new Host(buildWorld({ seed: welcome.seed, race: welcome.race }), { populate: false }), welcome);
                } else {
                    link.attach(Host.restore(buildWorld({ seed: welcome.seed, race: welcome.race }), welcome.snapshot));
                }
            };
            link.hello(who);

            return game;
        },
        // The world played `steps` on, each game playing what's come
        play(steps = 1) {
            for (let k = 0; k < steps; k++) {
                now += STEP_MS;
                // (As core/runner.js plays a world: the step's events told the view feed)
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

describe("a replicated world's link (core/viewing.js)", () => {
    it("is the link seam's second implementation, whole from the moment it's made, and says it speaks the replicated way alone", () => {
        const said = [];
        const link = new Viewing({ send: (text) => said.push(decode(text)) });

        assert.equal(asRemote(link), link);
        assert.ok(REMOTE_MEMBERS.every((name) => name in link));
        assert.equal(link.self, null, "nothing looked ahead from: its hero's where the world says");
        link.self = { time: 1 };
        assert.equal(link.self, null);
        link.hello(character("Ann"));
        assert.deepEqual([said[0].kind, said[0].mode, said[0].speaks], ["hello", "view", ["replicated"]]);
        assert.deepEqual(NETCODES, ["lockstep", "replicated"]);
        assert.equal(link.step(), null, "nothing to play before it has a world");
    });

    it("has two games move, fight and trade in a world neither holds a copy of: each sees the other where the world has them, its own record as the world keeps it, and what comes of its commands", async () => {
        const world = replicated();
        const [ann, bea] = [world.come("a", character("Ann")), world.come("b", character("Bea"))];

        world.play(40);
        await Promise.all([ann.link.started, bea.link.started]);

        const { host } = world;
        const [annId, beaId] = [ann.link.me, bea.link.me];

        // (Welcomed with no world: a summary and its own record; and no step of the world's sent)
        assert.equal(ann.welcome.snapshot, undefined);
        assert.equal(ann.welcome.mode, "view");
        assert.ok(JSON.stringify(ann.welcome).length < 64000, `${JSON.stringify(ann.welcome).length} characters`);
        assert.equal(ann.link.received.ops, undefined, "no ops");
        assert.equal(ann.link.host.battle.time, host.battle.time, "the world's time, by its frames");

        // (Its world: its own hero and the other, and the folk about, each drawn as the host has them)
        const mine = ann.link.host;

        assert.ok(mine.battle.actor(annId) && mine.battle.actor(beaId));
        assert.equal(mine.players.get(annId).hero.name, "Ann");
        assert.equal(mine.players.get(annId).progress.gold, host.players.get(annId).progress.gold);
        assert.equal(mine.players.get(beaId).hero.name, "Bea", "the other's hero, to draw them by");
        assert.deepEqual(mine.players.get(beaId).progress.worn(), host.players.get(beaId).progress.worn());

        const folk = mine.battle.actors.filter((actor) => actor.kind === "folk");

        assert.ok(folk.length >= 3 && folk.every((actor) => mine.folk.get(actor.id)?.id === actor.id), `${folk.length} of the folk known as who they are`);
        assert.ok(mine.battle.actors.length < host.battle.actors.length, "and not the whole world");
        assert.deepEqual(ann.link.mirror.faults, []);

        // Moving: sent as a command, done by the world, seen by both
        const from = { ...host.battle.actor(annId) };
        const results = [];

        ann.link.command({ type: "move", to: [from.square[0] + 4, from.square[1] + 2], run: true }, (result) => results.push(result));
        world.play(60);

        const [truth, own, seen] = [host.battle.actor(annId), mine.battle.actor(annId), bea.link.host.battle.actor(annId)];

        assert.ok(Math.abs(truth.x - from.x) + Math.abs(truth.y - from.y) > 3, "went");
        assert.ok(Math.abs(own.x - truth.x) < 0.02 && Math.abs(own.y - truth.y) < 0.02, "its own hero where the world has them");
        assert.ok(Math.abs(seen.x - truth.x) < 0.02 && Math.abs(seen.y - truth.y) < 0.02, "and so the other sees them");
        assert.deepEqual(results, [{ ok: true }].slice(0, results.length) && results, "told what came of it");
        assert.equal(results.length, 1);

        // Fighting: a foe set beside her, struck till it falls; the blows and the death heard
        const orc = host.battle.actor("orc");
        const at = [Math.floor(truth.x) + 1, Math.floor(truth.y)];

        Object.assign(orc, { map: truth.map, x: at[0] + 0.5, y: at[1] + 0.5, square: at, path: [], order: null, hp: 30, maxHp: 30, patrol: [at], dead: false, respawnAt: Infinity, stunnedUntil: Infinity });
        ann.events.length = 0;
        ann.link.command({ type: "engage", target: "orc", stand: true, lock: true });
        world.play(400);

        assert.ok(host.battle.actor("orc").dead, "the foe's fallen");
        assert.ok(mine.battle.actor("orc")?.dead ?? true, "and is as fallen to her game");
        assert.ok(ann.events.some((event) => event.type === "attack" && event.id === annId), "her blows heard");
        assert.ok(ann.events.some((event) => event.type === "death" && event.id === "orc"), "and its death");
        assert.equal(mine.players.get(annId).progress.gold, host.players.get(annId).progress.gold, "her record kept up");

        // Trading: asked, taken up, gold offered, both agreed; each game's trade as the world has it
        const gold = { ann: host.players.get(annId).progress.gold, bea: host.players.get(beaId).progress.gold };
        const said = [];
        const say = (game, command) => game.link.command(command, (result) => said.push([command.type, result?.ok ?? false, result?.reason ?? null]));

        // (Side by side, as a trade asks)
        Object.assign(host.battle.actor(beaId), { x: truth.x + 1, y: truth.y, square: [Math.floor(truth.x) + 1, Math.floor(truth.y)], map: truth.map, path: [], order: null });
        world.play(4);
        say(ann, { type: "trade", with: beaId });
        world.play(4);
        say(bea, { type: "trade", with: annId });
        world.play(4);

        const open = [...host.trades.values()].find((trade) => trade.open);

        assert.ok(open, `a trade's open (${JSON.stringify(said)})`);
        assert.deepEqual(mine.trades.get(open.id), open, "her game's trade as the world has it");
        assert.deepEqual(bea.link.host.trades.get(open.id), open);

        say(ann, { type: "offer", gold: 7 });
        world.play(4);

        const offered = host.trades.get(open.id);

        assert.deepEqual(bea.link.host.trades.get(open.id), offered, "the offer seen by the other");
        say(ann, { type: "agree", rev: offered.rev });
        say(bea, { type: "agree", rev: offered.rev });
        world.play(8);

        assert.equal(host.players.get(annId).progress.gold, gold.ann - 7, `the world's done it (${JSON.stringify(said)})`);
        assert.equal(host.players.get(beaId).progress.gold, gold.bea + 7);
        assert.equal(mine.players.get(annId).progress.gold, gold.ann - 7, "and each game's record says so");
        assert.equal(bea.link.host.players.get(beaId).progress.gold, gold.bea + 7);
        assert.equal(mine.trades.size, 0, "the trade done, and let go of");
        assert.ok(said.every(([, ok]) => ok), JSON.stringify(said));

        // (Nothing of lockstep's was ever sent either; and neither world was ever stepped but by frames)
        assert.equal(ann.link.received.ops, undefined);
        assert.equal(ann.link.dropped, 0);
        assert.ok(ann.link.frames > 400);
    });

    it("keeps a replicated world to games that ask for views, and a lockstep world as it was: the other kind's refused as a way it isn't played", () => {
        // (A replicated world: a game that asks for all of it, though it says it speaks the way)
        const world = replicated();

        class Whole extends Joining {
            hello(who) {
                this.send(JSON.stringify({ kind: "hello", version: 234, character: who, speaks: ["lockstep", "replicated"] }));
            }
        }

        world.come("w", character("Whole"), Whole);
        assert.deepEqual(world.refused.get("w"), { reason: "netcode", netcode: "replicated" });

        // (One that speaks lockstep alone, as every game before this did)
        world.come("l", character("Old"), Joining);
        assert.equal(world.refused.get("l")?.reason, "netcode");
        assert.equal(world.hosting.session.players.size, 0);

        // (Its views turned off, the kill switch: no one's let in)
        world.hosting.views.mode = "off";
        world.come("v", character("Late"));
        assert.equal(world.refused.get("v")?.reason, "netcode");

        // (A lockstep world: a lockstep game as ever, with the whole world; a view asked of it
        // while its views are off, refused)
        const lockstep = replicated({ netcode: "lockstep", mode: "off" });
        const whole = lockstep.come("j", character("Jo"), Joining);

        lockstep.play(5);
        assert.ok(whole.welcome.snapshot && whole.link.host.battle.actors.length === lockstep.host.battle.actors.length);

        class Asks extends Viewing {
            hello(who) {
                this.send(JSON.stringify({ kind: "hello", version: 234, mode: "view", character: who, speaks: ["lockstep"] }));
            }
        }

        lockstep.come("x", character("Asks"), Asks);
        assert.equal(lockstep.refused.get("x")?.reason, "netcode");
    });

    it("says what each newcomer's drawn as from what the host has of them, and nothing for one drawn from their character alone", () => {
        const world = replicated();
        const { host } = world;

        world.play(40);

        const folk = host.battle.actors.find((actor) => actor.kind === "folk");
        const soldier = host.battle.actors.find((actor) => actor.kind === "soldier");

        assert.equal(dressOf(host, folk).folk.id, folk.id);
        assert.equal(dressOf(host, folk).folk.routine, undefined, "their rounds are the host's own");
        assert.deepEqual(dressOf(host, soldier).soldier, host.soldiers.get(soldier.id));
        assert.deepEqual(Object.keys(dressOf(host, host.battle.actor("host"))), ["hero", "worn", "wielded", "role"]);
        assert.equal(dressOf(host, host.battle.actor("orc")), null);
        assert.deepEqual(dressOf(host, { kind: "beast", id: "b", wild: { creature: "wolf", elite: true, ai: { anything: 1 } } }), { wild: { creature: "wolf", elite: true } });
    });
});
