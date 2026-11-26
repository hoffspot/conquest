// The player's party (client/js/core/host.js partyOf, #orderUnit; core/battle.js #follow;
// docs/GAME.md): those with them, in order: their hired adventurers, the creatures they've called
// to their side, the dead they've raised; each told to wait, to follow, to fight whoever the
// player's set on, or to go; and what a creature at their side brings down counting for them.
// And parties of players (host.js PARTY, the "party" command): asked, and joined, said no to, or
// let lapse; four at most; left, put out of, led; never each other's enemies, whatever their
// peoples; and a foe one of them fells near the others counting for each of them; its leader's
// ready check, and countdown
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CREATURES } from "../client/js/core/creatures.js";
import { STEP_MS } from "../client/js/core/battle.js";
import { decode, encode } from "../client/js/core/wire.js";
import { GATHERING, HOST_PLAYER, Host, PARTY, READY, REFUSALS, SQUAD } from "../client/js/core/host.js";
import { nearestFree, squareKey, squaresOf } from "../client/js/core/grid.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { placesOf } from "../client/js/core/places.js";
import { CHUNK } from "../client/js/core/worldplan/plan.js";
import { SPELLS } from "../client/js/core/spells.js";
import { Standing } from "../client/js/core/standing.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "grimoire", boots: false });

function run(host, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...host.advance(STEP_MS));
    }

    return events;
}

const put = (actor, map, [x, y]) => Object.assign(actor, { map, square: [x, y], x: x + 0.5, y: y + 0.5, path: [], order: null, target: null });

// A world with its player in its home guild, gold in hand, a grimoire, and Summon and Zombify known
function atTheGuild() {
    const host = new Host(buildWorld({ seed: 2 }), { populate: false });

    host.join({ id: HOST_PLAYER, hero: HERO, progress: { gold: 500, spells: ["summon", "zombify"], gear: { mainHand: { id: "grimoire", quality: "common" } } } });
    host.populate();
    Object.assign(host.battle.actor("orc"), { dead: true, respawnAt: Infinity });

    const guild = [...host.world.interiors.buildings.values()].find(({ kind, place }) => kind === "guild" && place === "home");

    host.command(HOST_PLAYER, { type: "enter", link: guild.door.id });
    host.command(HOST_PLAYER, { type: "stop" });
    run(host, 1000);

    return { host, guild, player: host.players.get(HOST_PLAYER), me: host.battle.actor(HOST_PLAYER) };
}

// One of the guild's adventurers hired: their follower's id
function hire(host, guild) {
    const one = guild.folk.find(({ role, talk }) => role === "adventurer" || talk === "adventurer");
    const npc = host.battle.actor(one.id);
    const me = host.battle.actor(HOST_PLAYER);

    put(me, npc.map, [npc.square[0], npc.square[1] + 2]);
    assert.equal(host.command(HOST_PLAYER, { type: "talk", with: one.id }).ok, true);

    const result = host.command(HOST_PLAYER, { type: "effect", effect: { hire: true } });

    assert.equal(result.ok, true, JSON.stringify(result));
    host.command(HOST_PLAYER, { type: "talk", with: null });

    return result.follower;
}

// A spell cast where the player stands, and the world on till it's done
function cast(host, spell, rest = {}) {
    Object.assign(host.battle.actor(HOST_PLAYER), { spellReadyAt: 0, spellsReadyAt: {} });
    assert.deepEqual(host.command(HOST_PLAYER, { type: "cast", spell, ...rest }), { ok: true }, spell);

    return run(host, SPELLS[spell].castTime + STEP_MS * 2);
}

// One of the wild's creatures by the player, on their map (struck down if `dead`): its id
function creature(host, id, kind, square, { dead = false, hp = 60 } = {}) {
    const me = host.battle.actor(HOST_PLAYER);

    host.wild.set(id, { creature: kind, tier: 1, pack: id, camp: null, lair: null, master: false });
    host.battle.add({ id, kind: "beast", name: CREATURES[kind].name, weapon: CREATURES[kind].weapon, team: "beasts", square, map: me.map, ai: null, hp, wild: { creature: kind, tier: 1, temper: "aggressive", guard: 0, roam: 0, leash: 30, pack: id, leader: null, menace: true, unique: false } });

    if (dead) {
        host.battle.afflict(id, "bleed", { power: 1000 });
        run(host, 2500);
        assert.ok(host.battle.actor(id).dead);
    }

    return id;
}

// A free square a few steps from the player, not `taken`
function near(host, dx, dy, taken = new Set()) {
    const me = host.battle.actor(HOST_PLAYER);
    const square = nearestFree(squaresOf(host.world.maps[me.map] ?? host.world), [me.square[0] + dx, me.square[1] + dy], { within: 6, taken: new Set([squareKey(...me.square), ...taken]) });

    taken.add(squareKey(...square));

    return square;
}

describe("the party (host.js partyOf, #orderUnit)", () => {
    it("is the player's hired adventurers, then the creatures they've called, then the dead they've raised", () => {
        const { host, guild } = atTheGuild();

        // (Raised and called first, the follower hired after: the list's order isn't theirs)
        const wolf = creature(host, "test-wolf", "wolf", near(host, 2, 0), { dead: true });

        cast(host, "zombify", { target: wolf });
        cast(host, "summon");

        const follower = hire(host, guild);

        const party = host.partyOf(HOST_PLAYER);

        assert.deepEqual(party.map(({ kind }) => kind), ["adventurer", "summon", "risen"]);
        assert.equal(party[0].id, follower);
        assert.equal(host.companions.get(party[1].id).risen, false);
        assert.equal(host.companions.get(party[2].id).risen, true);
        assert.deepEqual(host.partyOf("guest-1"), [], "(no one's with anyone else)");
    });

    it("tells any of them to wait, to follow again, or to go: a follower and a called creature alike", () => {
        const { host, guild } = atTheGuild();
        const follower = hire(host, guild);

        cast(host, "summon");

        const [called] = [...host.companions.keys()];

        for (const id of [follower, called]) {
            const unit = host.battle.actor(id);

            assert.equal(host.command(HOST_PLAYER, { type: "order", unit: id, order: "wait" }).ok, true);
            assert.equal(unit.ai, "patrol");
            assert.equal(host.waiting(id), true);

            assert.equal(host.command(HOST_PLAYER, { type: "order", unit: id, order: "follow" }).ok, true);
            assert.equal(unit.ai, "follow");
            assert.equal(host.waiting(id), false);
        }

        // (Gone their own way, each)
        const events = [];

        assert.equal(host.command(HOST_PLAYER, { type: "order", unit: follower, order: "dismiss" }).ok, true);
        assert.equal(host.command(HOST_PLAYER, { type: "order", unit: called, order: "dismiss" }).ok, true);
        events.push(...run(host, 200));
        assert.ok(!host.followers.has(follower) && !host.battle.actor(follower));
        assert.ok(!host.companions.has(called) && !host.battle.actor(called));
        assert.deepEqual(host.partyOf(HOST_PLAYER), []);

        // (No one of theirs, or no such order: refused)
        assert.equal(host.command(HOST_PLAYER, { type: "order", unit: "orc", order: "wait" }).reason, "follower");
        assert.equal(host.command(HOST_PLAYER, { type: "order", unit: follower, order: "wait" }).reason, "follower");
    });

    it("sets one on whoever the player's set on, after them till they're down; refused with no one set on", () => {
        const { host, guild, me } = atTheGuild();
        const follower = hire(host, guild);
        const unit = host.battle.actor(follower);

        assert.equal(host.command(HOST_PLAYER, { type: "order", unit: follower, order: "assist" }).reason, "untargeted");

        // (A brigand off to the side, the player set on it where they stand)
        const taken = new Set();

        put(unit, me.map, near(host, -2, 0, taken));
        host.battle.add({ id: "brigand", kind: "orc", name: "Brigand", weapon: "cleaver", team: "wild", square: near(host, 4, 0, taken), map: me.map, ai: null });
        Object.assign(host.battle.actor("brigand"), { hp: 30, maxHp: 30 });
        Object.assign(unit, { hp: 5000, maxHp: 5000 });
        assert.equal(host.command(HOST_PLAYER, { type: "engage", target: "brigand", stand: true }).ok, true);
        assert.equal(host.command(HOST_PLAYER, { type: "order", unit: follower, order: "assist" }).ok, true);
        assert.equal(unit.assist, "brigand");

        const events = run(host, 20000);

        assert.ok(events.some(({ type, by, id }) => type === "hit" && by === follower && id === "brigand"), "(it went after it)");
        assert.ok(host.battle.actor("brigand").dead);
        assert.equal(unit.assist, null, "(and once it's down, back to following)");
    });

    it("counts what a creature at the player's side brings down for the player: what's on it theirs", () => {
        const { host, me } = atTheGuild();

        cast(host, "summon");

        const [called] = [...host.companions.keys()];
        const unit = host.battle.actor(called);
        const taken = new Set();

        Object.assign(unit, { hp: 5000, maxHp: 5000, power: { ...unit.power, melee: 50, ranged: 50 } });
        put(unit, me.map, near(host, 2, 0, taken));
        host.battle.add({ id: "brigand", kind: "orc", name: "Brigand", weapon: "cleaver", team: "wild", square: near(host, 4, 0, taken), map: me.map, ai: null });
        Object.assign(host.battle.actor("brigand"), { hp: 5, maxHp: 5 });

        const gold = host.players.get(HOST_PLAYER).progress.gold;
        const events = run(host, 20000);

        assert.ok(events.some(({ type, id, by }) => type === "death" && id === "brigand" && by === called), JSON.stringify(events.filter(({ type }) => type === "death")));
        assert.ok(events.some(({ type, id, from }) => type === "loot" && id === HOST_PLAYER && from === "brigand"));
        assert.ok(host.players.get(HOST_PLAYER).progress.gold > gold);
    });
});

describe("parties of players (host.js PARTY, the party command)", () => {
    const party = (host, id, what, who = null) => host.command(id, { type: "party", do: what, who });
    const told = (events, id) => events.filter(({ type, id: whose }) => type === "party" && whose === id).map(({ change }) => change);

    // A world with its player and a guest of another people in it (an orc), and `more` guests besides
    function together(more = 0) {
        const host = new Host(buildWorld({ seed: 2 }), { populate: false });

        host.join({ id: HOST_PLAYER, hero: HERO });
        host.join({ id: "guest", hero: { ...HERO, name: "Bea", race: "orc" } });

        for (let k = 2; k < 2 + more; k++) {
            host.join({ id: `guest-${k}`, hero: { ...HERO, name: `Guest ${k}` } });
        }

        return host;
    }

    it("asks another player to join, and makes a party of them as they say yes: led by whoever asked; never enemies after, whatever's passed between them", () => {
        const host = together();
        const [me, bea] = [host.battle.actor(HOST_PLAYER), host.battle.actor("guest")];

        // (Enemies: Bea struck at lately)
        me.foes[bea.id] = host.battle.time + 600000;
        assert.equal(host.battle.hostile(me, bea), true);
        assert.equal(party(host, HOST_PLAYER, "invite", HOST_PLAYER).reason, "invitee");
        assert.equal(party(host, "guest", "accept").reason, "uninvited");
        assert.equal(party(host, HOST_PLAYER, "invite", "guest").ok, true);
        assert.deepEqual(host.invitation("guest"), { from: HOST_PLAYER, until: host.battle.time + PARTY.askMs });
        assert.equal(party(host, HOST_PLAYER, "invite", "guest").reason, "asked", "(once is enough)");

        const events = run(host, 100);

        assert.ok(told(events, "guest").includes("invited") && told(events, HOST_PLAYER).includes("sent"));
        assert.equal(party(host, "guest", "accept").ok, true);
        assert.deepEqual(host.partyFor("guest"), { id: "party-1", leader: HOST_PLAYER, members: [HOST_PLAYER, "guest"] });
        assert.deepEqual(host.fellows(HOST_PLAYER), ["guest"]);
        assert.equal(host.invitation("guest"), null);
        assert.equal(host.battle.hostile(me, bea), false);
        assert.equal(host.canFight(me, bea), false);
        assert.equal(party(host, HOST_PLAYER, "invite", "guest").reason, "member");
        assert.ok(told(run(host, 100), "guest").includes("joined"));
    });

    it("pools what each had found before as one joins the other's party: the land each had been over, the buildings, the places worth finding (found by whoever had) and the homes tracked, each told", () => {
        const host = together();
        const [mine, beas] = [host.players.get(HOST_PLAYER).explored, host.players.get("guest").explored];
        // (A place worth finding neither's found, and one Bea alone had seen from high ground)
        const places = placesOf(host.world.plan).filter(({ id, at }) => !mine.knows(id, ...at) && !beas.knows(id, ...at));
        const [far, seen] = places;

        beas.visit(...far.at);
        beas.spot(seen.id);
        beas.enter("home:tavern");
        beas.track("camp-9");
        mine.visit(far.at[0] + 4 * CHUNK, far.at[1]);
        assert.ok(!mine.knows(far.id, ...far.at) && !mine.knows(seen.id, ...seen.at));
        assert.equal(party(host, HOST_PLAYER, "invite", "guest").ok, true);
        run(host, 100);
        assert.equal(party(host, "guest", "accept").ok, true);

        const events = run(host, 100).filter(({ type, pooled }) => type === "explored" && pooled);

        // Each has the other's: Ada, Bea's land and finds, found by Bea; Bea, Ada's land
        assert.ok(mine.knows(far.id, ...far.at) && mine.knows(seen.id, ...seen.at));
        assert.equal(mine.finderOf(far.id), "Bea");
        assert.equal(mine.finderOf(seen.id), "Bea");
        assert.ok(mine.hasEntered("home:tavern") && mine.tracked.has("camp-9"));
        assert.ok(beas.visitedAt(far.at[0] + 4 * CHUNK, far.at[1]));
        assert.deepEqual(
            events.map(({ id, by, name, chunks }) => ({ id, by, name, land: chunks > 0 })),
            [
                { id: "guest", by: HOST_PLAYER, name: HERO.name, land: true },
                { id: HOST_PLAYER, by: "guest", name: "Bea", land: true },
            ],
        );
        assert.ok(events.find(({ id }) => id === HOST_PLAYER).places.includes(far.id));
    });

    it("shares a request one of them carries with each of the others who could take it, as it stands (its progress and its time), each told who shared it: not one of another people (a people's request), nor one unsigned at a guild (a guild's contract), nor one carrying it already; past the most they'd take themselves", () => {
        const host = together(2);
        const [ada, bea, cal, dee] = [HOST_PLAYER, "guest", "guest-2", "guest-3"].map((id) => host.players.get(id));
        const town = host.war.towns.find(({ owner }) => owner === "human");

        // (Not in a party: none to share with)
        const bounty = ada.standing.take({ kind: "bounty", title: "Thin their numbers", from: { id: "reeve", name: "Ann", title: "Reeve", town: town.id, townName: town.name, post: "hall" }, given: 0, state: "open", count: 2, key: "orc", target: { realm: "orc", need: 4 }, text: "Bring down 4 of the orcs.", until: 30, reward: { standing: 28, gold: 16 } });

        assert.equal(host.command(HOST_PLAYER, { type: "share", request: bounty.id }).reason, "alone");

        for (const id of ["guest", "guest-2", "guest-3"]) {
            assert.equal(party(host, HOST_PLAYER, "invite", id).ok, true);
            assert.equal(party(host, id, "accept").ok, true);
        }

        assert.equal(host.command(HOST_PLAYER, { type: "share", request: "request-99" }).reason, "request");

        // (Cal carries it already; Dee as many as they'd take themselves)
        cal.standing.take({ ...bounty, count: 0 });

        for (const key of ["a", "b", "c"]) {
            dee.standing.take({ ...bounty, kind: "message", key, target: { town: key } });
        }

        const result = host.command(HOST_PLAYER, { type: "share", request: bounty.id });

        assert.deepEqual(result, {
            ok: true,
            shared: [{ id: "guest-3", name: "Guest 3" }],
            skipped: [
                { id: "guest", name: "Bea", why: "stranger" },
                { id: "guest-2", name: "Guest 2", why: "has" },
            ],
        });

        const given = dee.standing.requests.at(-1);

        assert.equal(dee.standing.requests.length, 4, "past the three they'd take");
        assert.deepEqual([given.kind, given.count, given.until, given.state, given.shared], ["bounty", 2, 30, "open", "Ada"], "as it stands: its progress and its time");
        assert.equal(new Standing(dee.standing.toJSON()).requests.length, 4, "kept so");
        assert.equal(bea.standing.requests.length, 0);

        const told = run(host, 100).filter(({ type, change }) => type === "request" && change === "shared");

        assert.deepEqual(
            told.map(({ id, by, request }) => [id, by, request.title]),
            [["guest-3", "Ada", "Thin their numbers"]],
        );

        // (A guild's contract: anyone signed up at a guild, whatever their people; Dee, past the
        // most they'd take, signed up too)
        const contract = ada.standing.take({ kind: "beasts", title: "Beasts on the roads", from: { id: "clerk", name: "Ivo", title: "Receptionist", town: town.id, townName: town.name, post: "guild" }, given: 0, state: "open", count: 0, key: "beasts", target: { wild: true, need: 3 }, text: "Bring down 3 beasts.", until: 40, reward: { standing: 0, gold: 31, merit: 3 } });

        bea.standing.register();
        dee.standing.register();

        const shared = host.command(HOST_PLAYER, { type: "share", request: contract.id });

        assert.deepEqual(
            shared.shared.map(({ name }) => name),
            ["Bea", "Guest 3"],
        );
        assert.deepEqual(shared.skipped, [{ id: "guest-2", name: "Guest 2", why: "unregistered" }]);
        assert.ok(bea.standing.requests.some(({ kind, shared: by }) => kind === "beasts" && by === "Ada"));
    });

    it("tells whoever asked when it's said no to, and when it lapses unanswered (ignored: the one asked not saying)", () => {
        const host = together(1);

        party(host, HOST_PLAYER, "invite", "guest");
        assert.equal(party(host, "guest", "decline").ok, true);

        const said = run(host, 100);

        assert.deepEqual(told(said, HOST_PLAYER).slice(-1), ["declined"]);
        assert.equal(host.partyFor("guest"), null);

        party(host, HOST_PLAYER, "invite", "guest-2");

        const quiet = run(host, PARTY.askMs + 500);

        assert.ok(told(quiet, HOST_PLAYER).includes("unanswered"));
        assert.ok(told(quiet, "guest-2").includes("lapsed"));
        assert.equal(host.invitation("guest-2"), null);
        assert.equal(party(host, "guest-2", "accept").reason, "uninvited");
    });

    it("holds four at most; its leader puts members out and passes the lead; leaving, the longest in it leads; with one left, there's no party", () => {
        const host = together(3);
        const ask = (from, to) => {
            party(host, from, "invite", to);
            party(host, to, "accept");
        };

        ask(HOST_PLAYER, "guest");
        ask("guest", "guest-2");
        ask(HOST_PLAYER, "guest-3");
        assert.deepEqual(host.partyFor(HOST_PLAYER).members, [HOST_PLAYER, "guest", "guest-2", "guest-3"], "(anyone in it can ask)");

        host.join({ id: "guest-5", hero: { ...HERO, name: "Fifth" } });
        assert.equal(party(host, HOST_PLAYER, "invite", "guest-5").reason, "partyFull");

        // (Only its leader puts out, or passes the lead)
        assert.equal(party(host, "guest", "remove", "guest-2").reason, "leader");
        assert.equal(party(host, HOST_PLAYER, "remove", "guest-2").ok, true);
        assert.equal(host.partyFor("guest-2"), null);
        assert.equal(party(host, HOST_PLAYER, "promote", "guest-2").reason, "member");
        assert.equal(party(host, HOST_PLAYER, "promote", "guest-3").ok, true);
        assert.equal(host.partyFor(HOST_PLAYER).leader, "guest-3");

        // (Its leader gone, the longest in it leads; down to one, none)
        assert.equal(party(host, "guest-3", "leave").ok, true);
        assert.equal(host.partyFor(HOST_PLAYER).leader, HOST_PLAYER);
        assert.deepEqual(host.partyFor(HOST_PLAYER).members, [HOST_PLAYER, "guest"]);

        const events = [];

        host.leave("guest");
        events.push(...run(host, 100));
        assert.equal(host.partyFor(HOST_PLAYER), null);
        assert.ok(told(events, HOST_PLAYER).includes("disbanded"));
        assert.equal(party(host, HOST_PLAYER, "leave").reason, "unpartied");
    });

    it("checks whether its members are ready: its leader asks, the rest each say, the leader ready; over once everyone's said, or its time's up with no answer from some, each told who was ready", () => {
        const host = together(2);
        const ask = (from, to) => {
            party(host, from, "invite", to);
            party(host, to, "accept");
        };
        const check = (id, what, more = {}) => host.command(id, { type: "party", do: what, ...more });
        const changes = (events, id) => events.filter(({ type, id: whose }) => type === "party" && whose === id);

        assert.equal(check(HOST_PLAYER, "readyCheck").reason, "unpartied");
        ask(HOST_PLAYER, "guest");
        ask(HOST_PLAYER, "guest-2");
        run(host, 100);

        // (Its leader's alone, and one at a time)
        assert.equal(check("guest", "readyCheck").reason, "leader");
        assert.equal(check("guest", "ready", { answer: true }).reason, "noReadyCheck");
        assert.equal(check(HOST_PLAYER, "readyCheck").ok, true);
        assert.equal(check(HOST_PLAYER, "readyCheck").reason, "readying");

        let events = run(host, 100);

        for (const id of [HOST_PLAYER, "guest", "guest-2"]) {
            const [asked] = changes(events, id).filter(({ change }) => change === "readyCheck");

            assert.deepEqual({ who: asked.who, name: asked.name, until: asked.until }, { who: HOST_PLAYER, name: "Ada", until: host.partyFor(HOST_PLAYER).ready.until }, id);
        }

        // (Each says; said again, the last word theirs; once everyone has, over)
        assert.equal(check("guest", "ready", { answer: "yes" }).reason, "command");
        assert.equal(check("guest", "ready", { answer: false }).ok, true);
        assert.equal(check("guest", "ready", { answer: true }).ok, true);
        events = run(host, 100);
        assert.deepEqual(
            changes(events, "guest-2")
                .filter(({ change }) => change === "readyAnswer")
                .map(({ who, ready }) => [who, ready]),
            [
                ["guest", false],
                ["guest", true],
            ],
        );
        assert.equal(check("guest-2", "ready", { answer: true }).ok, true);
        events = run(host, 100);

        const [done] = changes(events, HOST_PLAYER).filter(({ change }) => change === "readyDone");

        assert.deepEqual(done.answers, { [HOST_PLAYER]: "ready", guest: "ready", "guest-2": "ready" });
        assert.equal(done.all, true);
        assert.equal(host.partyFor(HOST_PLAYER).ready, null);

        // (Again: one says not, one says nothing; over as its time's up)
        assert.equal(check(HOST_PLAYER, "readyCheck").ok, true);
        assert.equal(check("guest", "ready", { answer: false }).ok, true);
        events = run(host, READY.askMs - 500);
        assert.ok(!changes(events, "guest-2").some(({ change }) => change === "readyDone"), "not over yet");
        events = run(host, 1000);

        const [lapsed] = changes(events, "guest-2").filter(({ change }) => change === "readyDone");

        assert.deepEqual(lapsed.answers, { [HOST_PLAYER]: "ready", guest: "not", "guest-2": "none" });
        assert.equal(lapsed.all, false);

        // (One who leaves while it's going not waited for)
        assert.equal(check(HOST_PLAYER, "readyCheck").ok, true);
        assert.equal(check("guest", "ready", { answer: true }).ok, true);
        assert.equal(check("guest-2", "leave").ok, true);
        events = run(host, 100);

        const [left] = changes(events, "guest").filter(({ change }) => change === "readyDone");

        assert.deepEqual(left.answers, { [HOST_PLAYER]: "ready", guest: "ready" });
        assert.equal(left.all, true);
    });

    it("counts down for its leader, whoever's ready or not: 3, 5 or 10 seconds, told to each in it with when it ends; a ready check going, over first", () => {
        const host = together(1);

        party(host, HOST_PLAYER, "invite", "guest");
        party(host, "guest", "accept");
        run(host, 100);

        const count = (id, seconds) => host.command(id, { type: "party", do: "countdown", seconds });

        assert.equal(count("guest", 5).reason, "leader");
        assert.equal(count(HOST_PLAYER, 4).reason, "command");
        assert.deepEqual(READY.countdowns, [3, 5, 10]);
        assert.equal(host.command(HOST_PLAYER, { type: "party", do: "readyCheck" }).ok, true);
        run(host, 100);

        const at = host.battle.time;

        assert.equal(count(HOST_PLAYER, 10).ok, true);

        const events = run(host, 100).filter(({ type, id }) => type === "party" && id === "guest");
        const changes = events.map(({ change }) => change);

        assert.deepEqual(changes, ["readyDone", "countdown"], "the check over first");
        assert.deepEqual(events[0].answers, { [HOST_PLAYER]: "ready", guest: "none" });
        assert.deepEqual({ who: events[1].who, seconds: events[1].seconds, at: events[1].at }, { who: HOST_PLAYER, seconds: 10, at: at + 10000 });
        assert.equal(count(HOST_PLAYER, 3).ok, true, "(again, with no check going)");
    });

    it("counts a foe one of a party fells for each of the others near it (as much skill as it had hit points, and what's on it), not for one far off", () => {
        const host = together(1);
        const me = host.battle.actor(HOST_PLAYER);
        const taken = new Set();

        party(host, HOST_PLAYER, "invite", "guest");
        party(host, "guest", "accept");
        party(host, HOST_PLAYER, "invite", "guest-2");
        party(host, "guest-2", "accept");

        // (Bea near, the third far off)
        put(host.battle.actor("guest"), me.map, near(host, -2, 0, taken));
        put(host.battle.actor("guest-2"), me.map, [me.square[0] + 60, me.square[1]]);
        host.battle.add({ id: "brigand", kind: "orc", name: "Brigand", weapon: "cleaver", team: "wild", square: near(host, 1, 0, taken), map: me.map, ai: null });
        Object.assign(host.battle.actor("brigand"), { hp: 2, maxHp: 30 });

        // (Their weapon's skill: a grimoire's bolts are shot, so the marksman's)
        const blade = (id) => host.players.get(id).progress.skills.blade + host.players.get(id).progress.skills.marksman;
        const [bea, third] = [blade("guest"), blade("guest-2")];

        assert.equal(host.command(HOST_PLAYER, { type: "engage", target: "brigand", stand: true }).ok, true);

        const events = run(host, 8000);

        assert.ok(events.some(({ type, id, by }) => type === "death" && id === "brigand" && by === HOST_PLAYER));
        assert.equal(blade("guest"), bea + 30, "(as much as it had hit points)");
        assert.equal(blade("guest-2"), third, "(too far off)");
        assert.ok(!events.some(({ type, id }) => type === "loot" && id === "guest-2"));
    });

    it("is kept in the host's snapshot, and taken from the party by leaving the world", () => {
        const host = together();

        party(host, HOST_PLAYER, "invite", "guest");
        party(host, "guest", "accept");

        const again = Host.restore(buildWorld({ seed: 2 }), decode(encode(host.snapshot())));

        assert.deepEqual(again.partyFor("guest"), host.partyFor("guest"));
        assert.equal(again.battle.hostile(again.battle.actor(HOST_PLAYER), again.battle.actor("guest")), false);
    });
});

describe("squads of parties (host.js SQUAD, the squad command; the scaling plan's 2-28)", () => {
    const IDS = [HOST_PLAYER, "bea", "cal", "dov", "eve", "fay", "gus", "hal"];
    const squad = (host, id, what, rest = {}) => host.command(id, { type: "squad", do: what, ...rest });
    const drained = (host) => host.advance(STEP_MS);
    const told = (events, id) => events.filter(({ type, id: whose }) => type === "squad" && whose === id).map(({ change }) => change);

    // A world of eight in four parties of two, each led by the first of its pair: Ada and Bea,
    // Cal and Dov, Eve and Fay, Gus and Hal
    function four() {
        const host = new Host(buildWorld({ seed: 2 }), { populate: false });

        for (const id of IDS) {
            host.join({ id, hero: { ...HERO, name: id === HOST_PLAYER ? "Ada" : id } });
        }

        for (let k = 0; k < IDS.length; k += 2) {
            assert.ok(host.command(IDS[k], { type: "party", do: "invite", who: IDS[k + 1] }).ok);
            assert.ok(host.command(IDS[k + 1], { type: "party", do: "accept" }).ok);
        }

        drained(host);

        return host;
    }

    const partyOf = (host, id) => host.partyFor(id).id;

    it("is formed by a party's leader, theirs to lead; another party joins one that's open, asks of one that's by asking (let in or not by its leader, or the asking lapsed), and can't join one that's closed", () => {
        const host = four();

        assert.deepEqual(SQUAD, { most: 5, askMs: 60000, entries: ["open", "ask", "closed"] });

        for (const reason of ["squadded", "squadless", "squadNone", "squadFull", "squadClosed", "squadAsked", "squadUnasked", "squadLeader"]) {
            assert.ok(REFUSALS[reason], reason);
        }

        // (Only a party's leader, of a party)
        host.join({ id: "ida", hero: { ...HERO, name: "ida" } });
        assert.equal(squad(host, "ida", "form").reason, "unpartied");
        host.leave("ida");
        assert.equal(squad(host, "bea", "form").reason, "leader");
        assert.equal(squad(host, HOST_PLAYER, "leave").reason, "squadless");
        assert.equal(squad(host, HOST_PLAYER, "form", { entry: "sometimes" }).reason, "command");
        assert.equal(host.squadFor(HOST_PLAYER), null);
        assert.deepEqual(host.allies(HOST_PLAYER), []);

        // Formed: by asking unless said, led by the party that formed it
        assert.ok(squad(host, HOST_PLAYER, "form").ok);

        const mine = host.squadFor("bea");

        assert.deepEqual(mine, { id: "squad-1", leader: partyOf(host, HOST_PLAYER), parties: [partyOf(host, HOST_PLAYER)], entry: "ask" });
        assert.deepEqual(told(drained(host), "bea"), ["joined"]);
        assert.equal(squad(host, HOST_PLAYER, "form").reason, "squadded");

        // By asking: Cal's party asks, Ada told; let in
        assert.equal(squad(host, "cal", "join", { squad: "nowhere" }).reason, "squadNone");
        assert.ok(squad(host, "cal", "join", { squad: mine.id }).ok);
        assert.equal(squad(host, "cal", "join", { squad: mine.id }).reason, "squadAsked");
        assert.equal(host.squadFor("cal"), null, "(not in till let in)");

        const asked = drained(host);

        assert.deepEqual(told(asked, HOST_PLAYER), ["asked"]);
        assert.deepEqual(asked.filter(({ type, change }) => type === "party" && change === "squadAsked").map(({ id }) => id).sort(), ["cal", "dov"]);
        assert.equal(squad(host, "cal", "admit", { party: partyOf(host, "cal") }).reason, "squadless", "(not theirs to say)");
        assert.equal(squad(host, HOST_PLAYER, "admit", { party: partyOf(host, "eve") }).reason, "squadUnasked");
        assert.ok(squad(host, HOST_PLAYER, "admit", { party: partyOf(host, "cal") }).ok);
        assert.deepEqual(host.squadFor("dov").parties, [partyOf(host, HOST_PLAYER), partyOf(host, "cal")]);
        assert.deepEqual(IDS.slice(0, 4).map((id) => told(drained(host), id)), [["joined"], [], [], []], "(each told once: drained)");

        // (Allies: the players of the other parties, never one's own)
        assert.deepEqual(host.allies(HOST_PLAYER), ["cal", "dov"]);
        assert.deepEqual(host.allies("dov"), [HOST_PLAYER, "bea"]);
        assert.deepEqual(host.fellows("dov"), ["cal"], "(a party's still its own)");

        // Refused; and an asking lapsed, never answered
        assert.ok(squad(host, "eve", "join", { squad: mine.id }).ok);
        assert.ok(squad(host, HOST_PLAYER, "refuse", { party: partyOf(host, "eve") }).ok);
        assert.ok(drained(host).some(({ type, change, id }) => type === "party" && change === "squadRefused" && id === "fay"));
        assert.equal(host.squadFor("eve"), null);
        assert.ok(squad(host, "eve", "join", { squad: mine.id }).ok);

        for (let t = 0; t <= SQUAD.askMs; t += 5000) {
            run(host, 5000);
        }

        assert.equal(squad(host, HOST_PLAYER, "admit", { party: partyOf(host, "eve") }).reason, "squadUnasked", "(lapsed)");

        // Open: joined at once. Closed: not at all. Only its leader sets which
        assert.equal(squad(host, "cal", "entry", { entry: "open" }).reason, "squadLeader");
        assert.ok(squad(host, HOST_PLAYER, "entry", { entry: "open" }).ok);
        assert.ok(squad(host, "eve", "join", { squad: mine.id }).ok);
        assert.deepEqual(host.squadFor("fay").parties.length, 3);
        assert.ok(squad(host, HOST_PLAYER, "entry", { entry: "closed" }).ok);
        assert.equal(squad(host, "gus", "join", { squad: mine.id }).reason, "squadClosed");
    });

    it("holds five parties at most; shares a ping with every ally, and nothing else of a party's; kept in a snapshot", () => {
        const host = four();

        assert.ok(squad(host, HOST_PLAYER, "form", { entry: "open" }).ok);
        assert.ok(squad(host, "cal", "join", { squad: "squad-1" }).ok);
        drained(host);

        // A ping: Ada's party told as ever, her allies each told it's the squad's; a mark is her party's alone
        const at = [host.battle.actor(HOST_PLAYER).x, host.battle.actor(HOST_PLAYER).y];

        assert.ok(host.command(HOST_PLAYER, { type: "party", do: "ping", at }).ok);
        host.command(HOST_PLAYER, { type: "party", do: "mark", at, icon: "skull", words: "Here" });

        const pinged = drained(host);

        assert.deepEqual(pinged.filter(({ type, change }) => type === "party" && change === "ping").map(({ id }) => id).sort(), [HOST_PLAYER, "bea"].sort());
        assert.deepEqual(pinged.filter(({ type, change }) => type === "squad" && change === "ping").map(({ id, who, at: where, squad: of }) => [id, who, where, of]), [["cal", HOST_PLAYER, at, "squad-1"], ["dov", HOST_PLAYER, at, "squad-1"]]);
        assert.ok(!pinged.some(({ type, change }) => type === "squad" && change === "mark"));
        assert.ok(!pinged.some(({ type, id }) => type === "squad" && ["eve", "fay", "gus", "hal"].includes(id)), "(no one out of it)");

        // (What each has found of the maps isn't pooled across a squad)
        host.players.get("cal").explored.enter("home:tavern");
        assert.equal(host.players.get(HOST_PLAYER).explored.entered.has("home:tavern"), false);

        // Kept
        const again = Host.restore(buildWorld({ seed: 2 }), decode(encode(host.snapshot())));

        assert.deepEqual(again.squadFor("dov"), host.squadFor("dov"));
        assert.deepEqual(again.allies("dov"), [HOST_PLAYER, "bea"]);
        assert.equal(again.nextSquad, 2);
        assert.ok(!("squads" in new Host(buildWorld({ seed: 2 }), { populate: false }).snapshot()));

        // Five at most (three more of its parties, as if there were players for them)
        assert.ok(squad(host, "eve", "join", { squad: "squad-1" }).ok);

        for (const id of ["party-x", "party-y"]) {
            host.parties.set(id, { id, leader: "nobody", members: [] });
            host.squadFor(HOST_PLAYER).parties.push(id);
            host.squadIds.set(id, "squad-1");
        }

        assert.equal(host.squadFor(HOST_PLAYER).parties.length, SQUAD.most);
        assert.equal(squad(host, "gus", "join", { squad: "squad-1" }).reason, "squadFull");
    });

    it("is left by a party, the longest in it leading if its leader's left; a party put out by its leader; a party that's no more out of it; and disbanded by its leader, or with its last party", () => {
        const host = four();
        const [a, c, e, g] = [HOST_PLAYER, "cal", "eve", "gus"].map((id) => partyOf(host, id));

        assert.ok(squad(host, HOST_PLAYER, "form", { entry: "open" }).ok);

        for (const id of ["cal", "eve", "gus"]) {
            assert.ok(squad(host, id, "join", { squad: "squad-1" }).ok);
        }

        drained(host);
        assert.deepEqual(host.squadFor("hal").parties, [a, c, e, g]);

        // Put out by its leader: not by another, nor itself
        assert.equal(squad(host, "cal", "remove", { party: g }).reason, "squadLeader");
        assert.equal(squad(host, HOST_PLAYER, "remove", { party: a }).reason, "squadUnasked");
        assert.ok(squad(host, HOST_PLAYER, "remove", { party: g }).ok);
        assert.deepEqual(told(drained(host), "hal"), ["removed"]);
        assert.equal(host.squadFor("gus"), null);
        assert.deepEqual(host.allies("gus"), []);

        // Its leader's party leaves: the longest in it leads
        assert.ok(squad(host, HOST_PLAYER, "leave").ok);

        const left = drained(host);

        assert.deepEqual(told(left, "bea"), ["left"]);
        assert.deepEqual(told(left, "dov"), ["left", "leader"]);
        assert.deepEqual(host.squadFor("cal"), { id: "squad-1", leader: c, parties: [c, e], entry: "open" });

        // A party that's no more (one of its two gone from the world): out of its squad
        host.leave("fay");
        assert.equal(host.partyFor("eve"), null);
        assert.deepEqual(host.squadFor("cal").parties, [c]);
        assert.ok(drained(host).some(({ type, change, id, party: which }) => type === "squad" && change === "disbanded" && id === "cal" && which === e));

        // Its last party leaves: no squad
        assert.ok(squad(host, "cal", "leave").ok);
        assert.equal(host.squads.size, 0);
        assert.deepEqual(told(drained(host), "dov"), ["left"], "(they've left it: no one's left in it to tell it's over)");

        // Disbanded by its leader: everyone in it told, each party free to form or join another
        assert.ok(squad(host, HOST_PLAYER, "form", { entry: "open" }).ok);
        assert.ok(squad(host, "cal", "join", { squad: "squad-2" }).ok);
        drained(host);
        assert.equal(squad(host, "cal", "disband").reason, "squadLeader");
        assert.ok(squad(host, HOST_PLAYER, "disband").ok);
        assert.deepEqual([HOST_PLAYER, "bea", "cal", "dov"].map((id) => told(drained(host), id)), [["disbanded"], [], [], []]);
        assert.equal(host.squads.size, 0);
        assert.equal(host.squadFor("cal"), null);
        assert.ok(squad(host, "cal", "form").ok);
    });

    it("is offered open at a hell rift or an invasion as a muster (the scaling plan's 2-30): joined by any party's leader within reach, the first beginning it; no one's to close, put a party out of or disband; another begun when it's full; and no more once what it gathered at is over", () => {
        const host = four();
        const ada = host.battle.actor(HOST_PLAYER);

        assert.deepEqual(GATHERING, { reach: 300 });
        assert.ok(REFUSALS.ungathered && REFUSALS.squadGathering);

        // Nothing about: no muster to join
        assert.equal(host.gatheringFor(HOST_PLAYER), null);
        assert.equal(squad(host, HOST_PLAYER, "gather").reason, "ungathered");

        // A rift opened 120 m off (the host's own, for trying it): a muster there for all of them
        assert.ok(host.command(HOST_PLAYER, { type: "hellrift" }).ok);

        const rift = host.hellRifts.open.id;

        assert.deepEqual(host.gatheringFor(HOST_PLAYER), { at: rift, kind: "rift", name: null });
        assert.deepEqual(host.gatheringFor("cal"), { at: rift, kind: "rift", name: null });

        // (An invasion nearer is the one offered, till it's over; one out of reach never)
        host.invasions.push({ id: "invasion-x", name: "Stonewick", middle: [ada.x + 50, ada.y], over: null });
        assert.deepEqual(host.gatheringFor(HOST_PLAYER), { at: "invasion-x", kind: "invasion", name: "Stonewick" });
        host.invasions[0].over = host.battle.time;
        assert.equal(host.gatheringFor(HOST_PLAYER).at, rift);
        Object.assign(host.invasions[0], { over: null, middle: [ada.x + GATHERING.reach + 200, ada.y] });
        assert.equal(host.gatheringFor(HOST_PLAYER).at, rift);
        host.invasions.pop();

        // The first to gather begins it: open, and marked with what it gathers at
        assert.equal(squad(host, "bea", "gather").reason, "leader");
        assert.ok(squad(host, HOST_PLAYER, "gather").ok);

        const muster = host.squadFor(HOST_PLAYER);

        assert.deepEqual(muster, { id: "squad-1", leader: partyOf(host, HOST_PLAYER), parties: [partyOf(host, HOST_PLAYER)], entry: "open", gathering: rift });
        assert.equal(squad(host, HOST_PLAYER, "gather").reason, "squadded");
        assert.ok(squad(host, "cal", "gather").ok);
        assert.equal(host.squadFor("dov"), muster, "(the one there, not another)");
        assert.deepEqual(host.allies(HOST_PLAYER), ["cal", "dov"]);

        // Not its first party's to close, to put anyone out of or to disband; anyone's to leave
        assert.equal(squad(host, HOST_PLAYER, "entry", { entry: "closed" }).reason, "squadGathering");
        assert.equal(squad(host, HOST_PLAYER, "remove", { party: partyOf(host, "cal") }).reason, "squadGathering");
        assert.equal(squad(host, HOST_PLAYER, "disband").reason, "squadGathering");
        assert.ok(squad(host, "cal", "leave").ok);
        assert.ok(squad(host, "cal", "join", { squad: muster.id }).ok, "(joined as any open squad is, from there)");

        // One far from it: no muster, by gathering or by its id
        const eve = host.battle.actor("eve");
        const [ex, ey] = [eve.x, eve.y];

        Object.assign(eve, { x: ex + 1000, y: ey + 1000 });
        assert.equal(host.gatheringFor("eve"), null);
        assert.equal(squad(host, "eve", "gather").reason, "ungathered");
        assert.equal(squad(host, "eve", "join", { squad: muster.id }).reason, "ungathered");
        Object.assign(eve, { x: ex, y: ey });

        // Kept with the world, as any squad
        const again = Host.restore(buildWorld({ seed: 2 }), decode(encode(host.snapshot())));

        assert.equal(again.squadFor("cal")?.gathering, rift);

        // Full (five parties; three stand-ins): the next to gather begins another at the same rift
        muster.parties.push("stand-in-1", "stand-in-2", "stand-in-3");
        assert.ok(squad(host, "eve", "gather").ok);

        const second = host.squadFor("eve");

        assert.notEqual(second.id, muster.id);
        assert.deepEqual([second.gathering, second.entry, second.parties], [rift, "open", [partyOf(host, "eve")]]);
        assert.ok(squad(host, "gus", "gather").ok);
        assert.equal(host.squadFor("gus"), second);
        muster.parties.splice(2);
        drained(host);
        assert.equal(host.squads.size, 2, "(while the rift's open, they stand)");

        // The rift ended: both musters no more, everyone of them told what's over
        host.hellRifts.open.until = host.battle.time;

        const events = [];

        for (let k = 0; k < 600 && host.squads.size; k++) {
            events.push(...drained(host));
        }

        assert.equal(host.hellRifts.open, null);
        assert.equal(host.squads.size, 0);
        assert.equal(host.squadFor(HOST_PLAYER), null);
        assert.deepEqual(host.allies("eve"), []);

        const over = events.filter(({ type, change }) => type === "squad" && change === "disbanded");

        assert.deepEqual(over.map(({ id }) => id).sort(), [...IDS].sort());
        assert.ok(over.every(({ ended }) => ended === rift));

        // A squad of their own making is untouched by a rift's end
        assert.ok(squad(host, HOST_PLAYER, "form").ok);
        assert.ok(host.command(HOST_PLAYER, { type: "hellrift" }).ok);
        host.hellRifts.open.until = host.battle.time;

        for (let k = 0; k < 600 && host.hellRifts.open; k++) {
            drained(host);
        }

        assert.equal(host.hellRifts.open, null);
        assert.equal(host.squadFor(HOST_PLAYER)?.gathering, undefined);
        assert.ok(host.squadFor(HOST_PLAYER));
    });
});
