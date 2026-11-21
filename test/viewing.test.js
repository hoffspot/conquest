// A replicated world's link (core/viewing.js; the scaling plan's 3-21): two games sent views
// of a world and holding no copy of it, each kept by what the world says, moving, fighting and
// trading; a replicated world refusing a game that asks for all of it; and lockstep as ever
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { Host } from "../client/js/core/host.js";
import { RESET } from "../client/js/core/mirror.js";
import { Hosting, Joining, NETCODES } from "../client/js/core/netplay.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { asRemote, REMOTE_MEMBERS } from "../client/js/core/remote.js";
import { SUMMARY, worldParts } from "../client/js/core/summary.js";
import { dressOf } from "../client/js/core/viewfeed.js";
import { Viewing, VIEW_ASKS } from "../client/js/core/viewing.js";
import { decode } from "../client/js/core/wire.js";
import { lookIn } from "./helpers.js";
import { answerOf, ASKED_FOR, ToldView } from "../client/js/core/worldview.js";

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
        assert.equal(link.self, null, "no word of its hero till a frame brings one");
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

        // (Its hero's word for the look ahead: from its frames, as the session last had them,
        // with what a copy would have had for itself; and no message of it beside)
        assert.equal(ann.link.received.self, undefined);
        assert.equal(ann.link.self.seq, world.hosting.session.done.get("a"));
        assert.equal(ann.link.self.hero.maxStamina, host.battle.actor(annId).maxStamina);
        assert.ok(Math.abs(ann.link.self.hero.x - host.battle.actor(annId).x) < 1 && ann.link.self.time <= host.battle.time);
        assert.equal(mine.battle.actor(annId).maxStamina, host.battle.actor(annId).maxStamina);

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

    it("has the game show its own hero's breath and cooldowns as the look ahead has them, in a replicated world alone (app/game.js)", async () => {
        const game = await readFile(new URL("../client/js/app/game.js", import.meta.url), "utf8");
        const session = await readFile(new URL("../client/js/app/session.js", import.meta.url), "utf8");

        assert.match(session, /const viewed = welcome\.mode === "view";/);
        assert.match(session, /me: welcome\.id, viewed, remote: asRemote\(joining\)/);
        assert.match(game, /this\.viewed = Boolean\(viewed && remote\);/, "never a solo or a lockstep game's");
        assert.match(game, /actor\.id === this\.me && this\.viewed && Number\.isFinite\(this\.forecast\?\.stamina\)/);
        assert.match(game, /\(this\.viewed \? this\.forecast\?\.cooldown\(action\.spell\) : null\) \?\? this\.battle\.cooldown\(this\.me, action\.spell\)/);
        assert.match(game, /const now = this\.viewed \? \(this\.forecast\?\.present \?\? this\.battle\.time\) : this\.battle\.time;/);
        assert.match(game, /const cooling = this\.viewed && command\.type === "ability"/);
        assert.equal(game.match(/this\.viewed/g).length, 5, "and nowhere else");
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
        assert.deepEqual(Object.keys(dressOf(host, host.battle.actor("host"))), ["hero", "worn", "wielded", "role", "maxStamina"]);
        assert.equal(dressOf(host, host.battle.actor("orc")), null);
        assert.deepEqual(dressOf(host, { kind: "beast", id: "b", wild: { creature: "wolf", elite: true, ai: { anything: 1 } } }), { wild: { creature: "wolf", elite: true } });
    });

    it("goes in at doors and into a dungeon on floors made here as the world has them, those of the map left let go of with the crossing", () => {
        const { host, come, play } = replicated();
        const ann = come("a", character("Ann"));
        const bob = come("b", character("Bob"));

        play(20);

        const [a, b] = [ann.welcome.id, bob.welcome.id];
        const { link } = ann;
        const kept = link.host;

        // (The buildings round her in the town, got ready as she came in: told with the first steps her game played)
        assert.ok(kept.open.size > 0, "buildings near her are ready in her game");
        assert.deepEqual([...kept.open.keys()].filter((key) => !ann.events.some((event) => event.type === "open" && event.key === key)), [], "each told to her game");
        const mine = () => kept.battle.actor(a);
        const plan = (world, map) => JSON.stringify([world.maps[map]?.width, world.maps[map]?.height, world.maps[map]?.rows ?? world.maps[map]?.grid ?? null]);
        // (Her commands go by her link, as a game's do: one who says nothing's taken to be away.)
        // (The world plays till her hero's on `map` there, and her game's played it too)
        const until = (map) => {
            for (let k = 0; k < 600 && !(host.battle.actor(a).map === map && mine()?.map === map); k++) {
                play();
            }

            assert.equal(mine()?.map, map, `her hero's on ${map} in her game (in the world: ${host.battle.actor(a).map}, order ${JSON.stringify(host.battle.actor(a).order)})`);
        };

        // A building: the tavern's door, then its stairs
        assert.ok(kept.battle.actor(b), "Bob's with her in the town");
        ann.events.length = 0;
        link.command({ type: "enter", link: "tavern-door", run: true });
        until("taproom");
        play(3);
        assert.ok(ann.events.some((event) => event.type === "cross" && event.id === a && event.to === "taproom"), "her game hears of her crossing");
        assert.ok(kept.world.maps.taproom, "the floor she's on is there in her game");
        assert.ok(ann.events.some((event) => event.type === "peopled" && event.key === "home:tavern" && event.folk.length > 0), "and her game's told who's come on it, to dress them");
        assert.ok(!kept.battle.actor(b), "Bob, out in the town, isn't in her game's battle now");
        assert.deepEqual(kept.battle.actors.filter((actor) => actor.map !== "taproom").map(({ id }) => id), [], "nor is anyone else of the town");
        assert.deepEqual([mine().x, mine().y], [host.battle.actor(a).x, host.battle.actor(a).y]);

        // (Those inside come in her frames, on the floor she's on)
        const inside = host.battle.actors.filter((actor) => actor.map === "taproom" && actor.id !== a).map(({ id }) => id).sort();

        assert.deepEqual(kept.battle.actors.filter((actor) => actor.id !== a).map(({ id }) => id).sort(), inside);

        link.command({ type: "enter", link: "tavern-door", run: true });
        until("town");
        play(3);
        assert.ok(kept.battle.actor(b), "back out, Bob's there again");

        // A dungeon: set down by its way in, she's told how strong it's made, and its floors
        // are made in her game as they are in the world before she goes in
        const site = host.world.plan.sites.find(({ id }) => id === "dungeon-28");
        const key = `site:${site.id}`;

        ann.events.length = 0;
        host.battle.place(a, "town", [Math.floor(site.at[0]) + 3, Math.floor(site.at[1]) + 3]);
        play(12);

        const door = host.world.interiors.buildings.get(key).door;

        assert.ok(host.open.has(key), "the world's got it ready");
        play(8);
        assert.equal(kept.dungeons.get(site.id)?.tier, host.dungeons.get(site.id).tier, "how strong it's made is said");
        assert.ok(kept.open.has(key), "and her game has it ready");
        assert.ok(ann.events.some((event) => event.type === "open" && event.key === key), "which her game's told, as a copy's host tells it");
        assert.equal(ann.events.some((event) => event.type === "close" || event.type === "open") && ann.events.filter((event) => event.type === "open").every((event) => kept.world.interiors.buildings.has(event.key)), true, "of buildings it has");
        link.command({ type: "enter", link: door.id, run: true });

        const first = host.world.interiors.buildings.get(key).maps[0];

        until(first);
        play(40);
        assert.deepEqual(kept.world.interiors.buildings.get(key).maps, host.world.interiors.buildings.get(key).maps, "the same floors");
        assert.equal(plan(kept.world, first), plan(host.world, first), "made the same");
        assert.equal(kept.battle.actors.every((actor) => actor.map === first), true, "and only those on her floor in her game");
        // (Its foes among them: every one standing within sight of her)
        const hers = host.battle.actor(a);
        const near = host.battle.actors.filter((actor) => actor.map === first && actor.id !== a && !actor.dead && Math.hypot(actor.x - hers.x, actor.y - hers.y) < 100).map(({ id }) => id);

        assert.ok(near.length > 0, "there are foes near her on it");
        assert.deepEqual(near.filter((id) => !kept.battle.actor(id)), [], "each of them in her game");
    });

    it("has the parties, everyone in the world, who's asked whom, where its party is and the war as its summary says, and asks its server what a shop needs", async () => {
        const world = replicated();
        const [ann, bea, cal] = [world.come("a", character("Ann")), world.come("b", character("Bea")), world.come("c", character("Cal"))];

        world.play(40);

        const { host } = world;
        const [annId, beaId, calId] = [ann.link.me, bea.link.me, cal.link.me];
        const mine = ann.link.host;

        // Everyone in the world, by name; and the world's not hers alone to stop
        assert.deepEqual([annId, beaId, calId].map((id) => mine.players.get(id)?.hero.name), ["Ann", "Bea", "Cal"]);
        assert.equal(mine.pausable, false);

        // A party: asked, the asking known to both; taken up, the party known to all
        ann.link.command({ type: "party", do: "invite", who: beaId });
        world.play(30);
        assert.equal(bea.link.host.invitation(beaId)?.from, annId, "Bea's game knows she's asked");
        assert.equal(mine.invitation(beaId)?.from, annId, "and Ann's that she asked");
        assert.equal(cal.link.host.invitation(beaId), null, "which is no one else's to know");
        bea.link.command({ type: "party", do: "accept" });
        world.play(30);
        assert.deepEqual(mine.partyFor(annId)?.members, host.partyFor(annId).members);
        assert.deepEqual(mine.fellows(annId), [beaId]);
        assert.deepEqual(cal.link.host.partyFor(beaId)?.members, host.partyFor(annId).members, "a party's anyone's to know of");
        assert.equal(mine.invitation(beaId), null);
        assert.ok(bea.events.some((event) => event.type === "party" && event.change === "joined"), "and its events are its members' to hear");

        // One of her party gone far out of sight: no longer in her game's battle, and where they are still told
        const there = host.battle.actor(annId);

        assert.equal(mine.afar.get(beaId)?.map, "town", "told of while in sight too");
        host.battle.place(beaId, "town", [Math.floor(there.x) + 700, Math.floor(there.y) + 20]);
        world.play(60);
        assert.ok(!mine.battle.actor(beaId), "Bea's out of sight");

        const [far, truth] = [mine.afar.get(beaId), host.battle.actor(beaId)];

        assert.ok(far && Math.abs(far.x - truth.x) <= 1 && Math.abs(far.y - truth.y) <= 1 && far.hp === Math.round(truth.hp) && far.dead === false, JSON.stringify(far));
        assert.equal(cal.link.host.afar.size, 0, "no one's told where another's party is");
        assert.equal(mine.players.get(beaId).hero.name, "Bea", "and she's still on the roster");

        // A ping's heard by the party alone
        ann.events.length = 0;
        cal.events.length = 0;
        bea.link.command({ type: "party", do: "ping", at: [Math.floor(truth.x), Math.floor(truth.y)] });
        world.play(10);
        assert.ok(ann.events.some((event) => event.type === "party" && event.change === "ping"));
        assert.ok(!cal.events.some((event) => event.type === "party"));

        // The war, as the world has it
        assert.equal(mine.war.turn, host.war.turn);
        assert.deepEqual(mine.war.towns.map(({ id, owner }) => [id, owner]), host.war.towns.map(({ id, owner }) => [id, owner]));
        assert.deepEqual(mine.war.realms.map(({ id }) => id), host.war.realms.map(({ id }) => id));
        assert.equal(mine.war.town(host.war.towns[0].id).owner, host.war.towns[0].owner);

        // A shop: asked of the server as it opens, answered as the world has it, and asked again once that's stood a while
        // (The folk of the buildings round her made, as they are when a player's told to go in)
        lookIn(host, [annId]);
        world.play(2);

        const keeper = [...host.folk.keys()].find((id) => host.battle.actor(id) && host.stockOf(id));

        assert.ok(keeper, "a shopkeeper with a day's stock");
        assert.deepEqual(await ann.link.ask({ what: "shop", keeper }), answerOf(host, annId, { what: "shop", keeper }));
        assert.equal(await ann.link.ask({ what: "shop", keeper: "no one" }), null);
        assert.equal(await ann.link.ask({ what: "world" }), null);

        let now = 0;
        const view = new ToldView(mine, (asked) => ann.link.ask(asked), () => now);
        const shop = await view.shop(keeper);
        const stocked = JSON.stringify(host.stockOf(keeper));

        assert.equal(JSON.stringify(shop.stock()), stocked);
        assert.equal(shop.times(), host.shopTimes(keeper));

        // (Something of it sold: read as it stood till it's asked again, then as it stands)
        const ware = host.stockOf(keeper).wares[0];

        host.players.get(annId).progress.gold += 100000;
        host.battle.place(annId, host.battle.actor(keeper).map, host.battle.actor(keeper).square.map((v, k) => v + (k ? 1 : 0)));

        const bought = host.command(annId, { type: "buy", item: ware, from: keeper });

        assert.deepEqual(bought, { ok: true });

        {
            assert.notEqual(JSON.stringify(host.stockOf(keeper)), stocked, "the world's stock's less");
            assert.equal(JSON.stringify(shop.stock()), stocked, "her game's is as it was told");
            now += ASKED_FOR;
            shop.stock();
            await Promise.resolve();
            await Promise.resolve();
            assert.equal(JSON.stringify(shop.stock()), JSON.stringify(host.stockOf(keeper)), "and, asked again, as it stands");
        }

        // A talk the same way: what the world would have said, with its reads
        const talk = await view.talk(annId, keeper);
        const said = answerOf(host, annId, { what: "talk", id: keeper });

        assert.deepEqual([talk.stranger, talk.hire, talk.messenger, talk.times], [said.stranger, said.hire, said.messenger, said.times]);
        assert.deepEqual(talk.menders(), said.menders);
        assert.equal(talk.hired("no one"), false);

        // (A lockstep link asks nothing: its game reads its copy)
        assert.equal(new Joining({ send: () => {} }).ask, null);
    });

    it("asks for its view again when its page is shown, plays nothing of what came while it was hidden, and has everyone where the world has them from what it's then told", async () => {
        const world = replicated();
        const [ann, bea] = [world.come("a", character("Ann")), world.come("b", character("Bea"))];

        world.play(40);
        await Promise.all([ann.link.started, bea.link.started]);

        const { host } = world;
        const [annId, beaId] = [ann.link.me, bea.link.me];
        const mine = ann.link.host;
        const states = [];
        const say = (game, command) => game.link.command(command, () => {});

        ann.link.onState = (state) => states.push(state);

        // (A trade open as her page is hidden, to be there when it's shown)
        const truth = host.battle.actor(annId);

        Object.assign(host.battle.actor(beaId), { x: truth.x + 1, y: truth.y, square: [Math.floor(truth.x) + 1, Math.floor(truth.y)], map: truth.map, path: [], order: null });
        world.play(4);
        say(ann, { type: "trade", with: beaId });
        world.play(4);
        say(bea, { type: "trade", with: annId });
        world.play(4);

        const open = [...host.trades.values()].find((trade) => trade.open);

        assert.ok(open && mine.trades.get(open.id), "a trade open");

        // (Hidden half a minute: her page frozen, the world's frames piling up for it; Bea two
        // squares on meanwhile, and her own trade forgotten as a page's memory may be)
        const held = ann.link.host;
        const kept = new Map(mine.battle.actors.map((actor) => [actor.id, actor]));

        ann.link.away(true);
        ann.link.host = null;
        host.battle.actor(beaId).x += 2;
        host.battle.actor(beaId).square[0] += 2;
        world.play(600);
        mine.trades.clear();
        ann.link.host = held;
        ann.events.length = 0;

        const [time, behind] = [mine.battle.time, ann.link.behind];

        assert.ok(behind > 500, `${behind} behind`);
        ann.link.away(false);
        assert.equal(ann.link.resyncs, 1, "told again at once");
        assert.ok(ann.link.dropped >= 600, `${ann.link.dropped} frames let go`);
        assert.equal(mine.battle.time, time, "and nothing played of them");

        // (Right within a second of being shown: the gate's number)
        world.play(20);
        assert.equal(mine.battle.time, host.battle.time, "the world's time");
        assert.deepEqual(states, [{ kind: "viewed" }], "her game told once to put everyone where they are");
        assert.deepEqual(ann.link.mirror.faults, []);
        assert.equal(ann.link.farBehind, false);

        for (const who of [annId, beaId]) {
            const [here, there] = [mine.battle.actor(who), host.battle.actor(who)];

            assert.ok(here === kept.get(who), `${who}: the same one, kept for what's drawn of them`);
            assert.deepEqual([here.x, here.y, here.map], [there.x, there.y, there.map]);
        }

        assert.deepEqual(mine.trades.get(open.id), host.trades.get(open.id), "her trade as the world has it, told with her view");
        assert.equal(mine.players.get(annId).progress.gold, host.players.get(annId).progress.gold);
        assert.ok(ann.events.length < 200, `${ann.events.length} events: none of the half minute's`);

        // (Shown again at once, the world answers no oftener than it will; asked again, it does)
        ann.link.away(true);
        ann.link.away(false);
        assert.equal(ann.link.resyncs, 1, "not told twice in a moment");
        world.play(Math.ceil(VIEW_ASKS / STEP_MS) + 2);
        assert.equal(ann.link.resyncs, 2, "asked again, and told");
        world.play(20);
        assert.equal(mine.battle.time, host.battle.time);
        assert.deepEqual(ann.link.mirror.faults, []);
    });

    it("lets go of whoever its view, told again, no longer tells of, and asks again when it's fallen further behind than it may catch up, never playing fast", async () => {
        const world = replicated();
        const [ann, bea] = [world.come("a", character("Ann")), world.come("b", character("Bea"))];

        world.play(40);
        await Promise.all([ann.link.started, bea.link.started]);

        const { host } = world;
        const [annId, beaId] = [ann.link.me, bea.link.me];
        const mine = ann.link.host;
        const held = ann.link.host;

        assert.ok(mine.battle.actor(beaId));

        // (Frozen without a word, as a page is that's given no time: no "hidden" said. Bea gone
        // far off meanwhile)
        ann.link.host = null;
        Object.assign(host.battle.actor(beaId), { x: host.battle.actor(beaId).x + 400, square: [Math.floor(host.battle.actor(beaId).x) + 400, Math.floor(host.battle.actor(beaId).y)], path: [], order: null });
        world.play(300);
        ann.link.host = held;

        const time = mine.battle.time;

        world.play(1);
        assert.equal(ann.link.resyncs, 1, "its view asked for again, and told");
        assert.ok(mine.battle.time - time <= 2 * STEP_MS, "and not played fast to where the world is");
        assert.ok(mine.battle.actor(beaId), "Bea kept a moment, lest she's told of again");
        world.play(Math.ceil(RESET.wait / STEP_MS) + 2);
        assert.ok(!mine.battle.actor(beaId), "and let go of, never told of");
        assert.ok(mine.battle.actor(annId));
        assert.equal(mine.battle.time, host.battle.time);
        assert.deepEqual(ann.link.mirror.faults, []);
    });

    it("has the director's props near its hero, the world at large and the rest of the war as its summary says, and flies a shot from its event", () => {
        const world = replicated();
        const [ann, bea] = [world.come("a", character("Ann")), world.come("b", character("Bea", "bow"))];

        world.play(40);

        const { host } = world;
        const [annId, beaId] = [ann.link.me, bea.link.me];
        const mine = ann.link.host;
        const hero = host.battle.actor(annId);
        const near = [Math.floor(hero.x) + 3, Math.floor(hero.y) + 2];

        // Props: what's on the ground and a campfire near her, by their ids; one far off, not;
        // gone from her game when it's gone from the world
        host.ground.set("g1", { id: "g1", map: hero.map, square: near, item: { id: "potion", count: 1 }, until: null, by: beaId });
        host.ground.set("g2", { id: "g2", map: hero.map, square: [near[0] + 2000, near[1]], item: { id: "potion", count: 1 }, until: null, by: beaId });
        host.campfires.push({ id: "c1", player: beaId, people: "human", fire: [near[0] + 5, near[1]], tent: { at: [near[0] + 6, near[1]], facing: 0 }, until: host.battle.time + 3600000 });
        host.campfires.push({ id: "c2", player: beaId, people: "human", fire: [near[0] + 2000, near[1]], tent: { at: [near[0] + 2001, near[1]], facing: 0 }, until: host.battle.time + 3600000 });
        host.caches.set("k1", { id: "k1", at: [near[0] + 20, near[1]], chest: near, band: "bandits", tier: 1, ids: [], opened: false });
        world.play(25);
        assert.deepEqual(mine.ground.get("g1"), host.ground.get("g1"));
        assert.ok(mine.ground instanceof Map && !mine.ground.has("g2"), "what's far off isn't told");
        assert.deepEqual(mine.campfires, [host.campfires[0]], "a campfire's told by where its fire is");
        assert.deepEqual(mine.caches.get("k1"), host.caches.get("k1"));
        host.ground.delete("g1");
        world.play(25);
        assert.ok(!mine.ground.has("g1"), "picked up in the world, gone from her game");

        // The world at large: what's burnt, a hell's rift, the rules, the legends
        host.burnt.push({ place: "p1", name: "Ashby", pieces: [], at: [near[0] + 900, near[1]] });
        // (When the last of hell's rifts was: the world's own word of them, whole)
        host.hellRifts = { ...host.hellRifts, last: 7 };
        world.play(25);
        assert.deepEqual(mine.burnt, host.burnt);
        assert.deepEqual(mine.hellRifts, host.hellRifts);
        assert.equal(mine.hellRifts.last, 7);
        assert.deepEqual(mine.rules, host.rules);
        assert.deepEqual(mine.done, host.done);
        assert.deepEqual(mine.invasions, host.invasions);

        // (The legends' clocks run on between one telling and the next: held to the world's at a step they're told at)
        do {
            world.play(1);
        } while (world.hosting.step() % SUMMARY.every);

        assert.deepEqual(mine.legends.toJSON(), host.legends.toJSON());
        assert.equal(typeof mine.legends.stepOf, "function", "the legends themselves, to ask");

        // The rest of the war: a camp, a depot, a place cleared, its news, and a battle on in the field
        host.war.camps.push({ id: "camp-t", realm: host.war.realms[0].id, at: [near[0] + 400, near[1]], toward: host.war.towns[0].id, front: 0, broken: [] });
        host.war.depots.push({ id: "depot-t", realm: host.war.realms[0].id, at: [near[0] + 500, near[1]] });
        host.war.places = { ...host.war.places, cleared: { ...host.war.places?.cleared, lair: host.war.turn } };
        host.war.log.push({ turn: host.war.turn, type: "told", town: host.war.towns[0].id }, { turn: host.war.turn, type: "told", town: host.war.towns[1].id });
        // (A battle that isn't an invasion's is in the summary as the game asks for it: read of the world, not played with a made-up one in it)
        host.leaders.set("stand-t", { engagement: { id: "e-t", phase: "march", sides: [] } });
        assert.deepEqual(decode(worldParts(host).battles.get("")), [{ id: "e-t", phase: "march", sides: [] }]);
        host.leaders.delete("stand-t");
        world.play(25);
        assert.deepEqual(mine.war.camps.at(-1), host.war.camps.at(-1));
        assert.deepEqual(mine.war.depots.at(-1), host.war.depots.at(-1));
        assert.deepEqual(mine.war.places, host.war.places);
        assert.deepEqual(mine.war.log.slice(-2), host.war.log.slice(-2), "its latest news, in the order it happened");
        assert.ok(mine.war.log.length <= SUMMARY.news);
        assert.deepEqual(mine.engagements(), host.engagements(), "the battles on, as the game asks");
        host.war.camps.pop();
        host.war.depots.pop();
        world.play(25);
        assert.deepEqual(mine.engagements(), host.engagements());
        assert.ok(!mine.war.camps.some(({ id }) => id === "camp-t"));

        // A fort out in the world and a wagon: told with what they're drawn as, when they come into sight
        host.fortsOut.set("orc", { realm: host.war.realms[0].id, kind: "tower" });
        assert.deepEqual(dressOf(host, host.battle.actor("orc")), { fort: { realm: host.war.realms[0].id, kind: "tower" } });
        host.fortsOut.delete("orc");
        host.wagons.set("orc", { convoy: "c", people: "human", load: "grain", seed: 5 });
        assert.deepEqual(dressOf(host, host.battle.actor("orc")), { wagon: host.wagons.get("orc") });
        host.wagons.delete("orc");

        // A shot: Bea looses at a foe set a way off; in Ann's game it's in the battle from its
        // event, flown a step at a time where the world has it, and gone when it lands
        const orc = host.battle.actor("orc");
        const shooter = host.battle.actor(beaId);
        const at = [Math.floor(shooter.x) + 9, Math.floor(shooter.y)];

        Object.assign(orc, { map: shooter.map, x: at[0] + 0.5, y: at[1] + 0.5, square: at, path: [], order: null, hp: 400, maxHp: 400, patrol: [at], dead: false, respawnAt: Infinity, stunnedUntil: Infinity });
        ann.events.length = 0;
        bea.link.command({ type: "engage", target: "orc", stand: true, lock: true });

        let [flown, worst] = [0, 0];

        for (let k = 0; k < 200; k++) {
            world.play(1);

            for (const theirs of host.battle.projectiles) {
                const hers = mine.battle.projectiles.find(({ id }) => id === theirs.id);

                if (hers) {
                    flown++;
                    worst = Math.max(worst, Math.hypot(hers.x - theirs.x, hers.y - theirs.y));
                }
            }

            // (None kept in her game that the world's let go of a step or more ago)
            assert.ok(mine.battle.projectiles.every(({ id, flown: far }) => host.battle.projectiles.some((one) => one.id === id) || far < 60), "no shot's left hanging");
        }

        assert.ok(ann.events.some((event) => event.type === "projectile" && event.id === beaId), "a shot's event is hers to hear");
        assert.ok(flown >= 3, `${flown} steps of a shot in flight seen in both`);
        assert.ok(worst < 0.5, `within ${worst.toFixed(2)} m of where the world has it`);
        bea.link.command({ type: "stop" });
        world.play(40);
        assert.deepEqual(mine.battle.projectiles, [], "and none's left once the shooting's done");
    });
});
