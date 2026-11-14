// A building's folk, and the soldiers quartered in a barracks, standing as they are while no
// player is on their map (client/js/core/battle.js Battle.idling, #stirred, #idles;
// generated/multiplayer_scaling_plan.md 1-22, the owner's ruling of 14 November 2026: they stand
// till someone comes in, go on from where they stood with their waits as they were, and start
// as the door is gone through). Held, one takes no turn, walks nowhere, looks for no danger and
// finds no way. Not the same battle as when they went about their rounds unseen, so
// `NET_VERSION` moved with it and the switch has a date; what is the same, and held here step
// for step, is a world with a player standing on every map that has folk.
//
// Who is stepped all the same, each a test: anyone set on someone or with someone set on them,
// anyone afraid, ailing or fallen, a follower, a soldier who went in after someone and is on
// its way out, everything in a dungeon; and, more than the plan's row asks, everyone on a map
// with any of those alive on it but the afraid, the ailing and the fallen, so that no one is
// held where anyone could fight or frighten them. Counts and steps are asked, never times.
//
//     node --import ./test/plan-cache.js --test test/idling.test.js
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { Battle, FLEE, STEP_MS } from "../client/js/core/battle.js";
import { squaresOf } from "../client/js/core/grid.js";
import { HOST_PLAYER, Host, RELIEF_MS } from "../client/js/core/host.js";
import { Hosting, Joining, NET_VERSION } from "../client/js/core/netplay.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { install, lap, Probes, uninstall } from "../client/js/core/probe.js";
import { decode, encode } from "../client/js/core/wire.js";
import { generateWorld } from "../client/js/core/world.js";
import { unexpired } from "./helpers.js";

// Battle.idling's expiry (contribution.md, section 3, *Two netcodes side by side*): off, it plays
// the rule the owner changed, not the same battle, so it's to be taken out once nothing's left
// to set beside it (Battle.counting with it, which only its old form has work for)
const EXPIRES = "2027-11-14";

const sha = (text) => createHash("sha1").update(text).digest("hex");
const ROOM = "taproom";
const ABOVE = "upstairs";
const SECOND = 1000 / STEP_MS;
const MINUTE = 60 * SECOND;

// A square of the taproom's floor by the middle of it, in sight of its tables; and one upstairs
const MIDDLE = [8, 7];

// With the folk about their rounds unseen, as they were, what `play` gives
function unseen(play) {
    assert.equal(Battle.idling, true, "Battle.idling is on");
    Battle.idling = false;

    try {
        return play();
    } finally {
        Battle.idling = true;
    }
}

const hero = (id, square, map) => ({ id, kind: "player", name: id, team: "human", weapon: "sword", square, map });
const wolf = (square, map, more = {}) => ({ id: "wolf", kind: "beast", name: "Wolf", team: "wild", weapon: "claws", square, map, hp: 400, wild: { temper: "aggressive" }, ...more });
const guard = (id, square, map, more = {}) => ({ id, kind: "soldier", name: "guardsman", team: "human", weapon: "sword", square, map, ai: "patrol", patrol: [square], leash: 12, ...more });

// Everything of someone that the battle keeps, as text; and all of it but when they next look
// about and when they next rest, with the dice the rest's moment is thrown on, which are kept up
// for one held (battle.js #lull): how they stand
const stateOf = (actor) => JSON.stringify(actor);
const standingOf = (actor) => JSON.stringify({ ...actor, lookAt: null, rethinkAt: null, restAt: null, chance: null });

/**
 * An evening in the tavern (core/world.js generateWorld: its taproom and the floor above, a
 * dozen folk between them, and the town outside its door), played in acts: each of `acts` is
 * { at: the step it's done before, does(battle, world) }; `first` adds whoever is in the battle
 * before the folk. Resolves to the battle, every step's events and the battle whole after it
 * (`steps`), the events themselves (`events`), what each of the folk was after each step by map
 * (`rooms`: for each step { taproom, upstairs }, a hash; `stood`, the same of all but when
 * each next looks about), which of the folk were afraid after
 * each (`afraid`: their ids), and the work counted in each step (`held`, `searches`, `paths`).
 * `dungeon` names a floor made a dungeon's level; `folk` false leaves the tavern's folk out.
 */
function evening({ first = () => {}, acts = [], steps, dungeon = null, folk = true }) {
    const world = generateWorld({ seed: 1 });

    // (A floor made a dungeon's level, as insides.js marks one: `dungeon`)
    if (dungeon) {
        world.maps[dungeon] = Object.assign(Object.create(Object.getPrototypeOf(world.maps[dungeon])), world.maps[dungeon], { dungeon: { theme: "caves", level: 1, levels: 1, lights: [], rooms: [], lurks: [] } });
    }

    const battle = new Battle(world, { seed: 1 });
    const played = { battle, world, steps: [], events: [], rooms: [], stood: [], afraid: [], held: [], searches: [], paths: [] };

    first(battle, world);

    for (const one of folk ? world.folk : []) {
        battle.add({ id: one.id, kind: "folk", name: one.name, team: "folk", square: one.square, map: one.map, ai: "routine", neutral: true, routine: one.routine, role: one.role, facing: one.facing });
    }

    let ticks = 0;
    const probes = install(new Probes({ clock: () => ticks++ }));
    const counted = {};
    const since = (name) => {
        const now = probes.toJSON().counts[name] ?? 0;
        const more = now - (counted[name] ?? 0);

        counted[name] = now;

        return more;
    };

    try {
        for (let step = 0; step < steps; step++) {
            for (const act of acts) {
                if (act.at === step) {
                    act.does(battle, world);
                }
            }

            // (Within a pass being timed, as the host steps it: the step's work is counted)
            lap("battle");

            const events = battle.advance(STEP_MS);

            lap(null);

            const room = (map, of = stateOf) => sha(battle.actors.filter((actor) => actor.map === map && actor.kind !== "player").map(of).join("\n"));

            played.steps.push(`${encode(events)} ${sha(JSON.stringify(battle.snapshot()))}`);
            played.events.push(events);
            played.rooms.push({ [ROOM]: room(ROOM), [ABOVE]: room(ABOVE) });
            played.stood.push({ [ROOM]: room(ROOM, standingOf), [ABOVE]: room(ABOVE, standingOf) });
            played.afraid.push(battle.actors.filter((actor) => actor.kind === "folk" && (actor.afraid ?? null) !== null).map(({ id }) => id));
            played.held.push(since("battle.held"));
            played.searches.push(since("battle.searches"));
            played.paths.push(since("battle.paths"));
        }
    } finally {
        uninstall();
    }

    return played;
}

const sum = (list, from = 0, to = list.length) => list.slice(from, to).reduce((total, each) => total + each, 0);
const folkOf = (battle, map) => battle.actors.filter((actor) => actor.kind === "folk" && actor.map === map);
const FOLK = { [ROOM]: 7, [ABOVE]: 5 };

// The first step two evenings differ at, by `what` of each step (-1: none)
const differs = (a, b, what = (played, k) => played.steps[k]) => {
    assert.equal(a.steps.length, b.steps.length);

    return a.steps.findIndex((_, k) => what(a, k) !== what(b, k));
};

// The step in which someone went through a door or up a stair, from step `from` on
const crossed = (played, id, from = 0) => played.events.findIndex((events, k) => k >= from && events.some((event) => event.type === "cross" && event.id === id));

describe("the folk of a building no player is in stand as they are (core/battle.js Battle.idling, plan 1-22)", () => {
    it("has a date, as a switch whose old form isn't the same battle has: taken out by then, with Battle.counting, or its date argued for", () => {
        unexpired("Battle.idling", EXPIRES);
        assert.equal(Battle.idling, true, "on: the owner's ruling");
        assert.ok(NET_VERSION >= 227, "a copy on the old rules would step them: it can't join");
    });

    it("takes no turn, walks nowhere, looks for no danger and finds no way for anyone in a tavern no player is in: every one of them as they were, ten minutes on", () => {
        const played = evening({ steps: 10 * MINUTE });
        const { battle, world } = played;

        assert.equal(battle.actors.length, 12);
        assert.ok(played.held.every((held) => held === 12), "all twelve held, every step");
        assert.equal(sum(played.searches) + sum(played.paths), 0, "no one looked for, no way found");
        assert.ok(played.events.every((events) => events.length === 0), "nothing happened");
        assert.equal(new Set(played.stood.map((rooms) => rooms[ROOM] + rooms[ABOVE])).size, 1, "nothing of any of them changed, but when each next looks about");

        for (const one of world.folk) {
            const actor = battle.actor(one.id);

            assert.deepEqual([actor.map, actor.square, actor.facing, actor.waitUntil, actor.path], [one.map, one.square, one.facing ?? 0, 0, []], `${one.id} as it was added`);
        }

        // (As they did: about their rounds, unseen)
        const was = unseen(() => evening({ steps: MINUTE }));

        assert.ok(was.held.every((held) => held === 0));
        assert.ok(sum(was.paths) > 0 && was.events.some((events) => events.some(({ type }) => type === "act")), "the old form walks them about and has them act");
        assert.ok(new Set(was.rooms.map((rooms) => rooms[ROOM])).size > MINUTE / 2);
    });

    it("plays the same step for step with the switch off and on while a player stands on every map that has folk: the equivalence this class of change is allowed", () => {
        const play = () =>
            evening({
                first: (battle) => {
                    battle.add(hero("ada", MIDDLE, ROOM));
                    battle.add(hero("bryn", [4, 4], ABOVE));
                },
                steps: 3 * MINUTE,
            });
        const [now, was] = [play(), unseen(play)];

        assert.equal(differs(now, was), -1, "the evenings differ");
        assert.ok(now.held.every((held) => held === 0), "no one held");
        assert.ok(sum(now.paths) > 20 && now.events.some((events) => events.some(({ type }) => type === "rest")), "and they were about their business");
    });

    it("holds those on a floor no player is on while the floor a player is on goes about its business, as it would have: the folk upstairs, a player in the taproom", () => {
        const play = () => evening({ first: (battle) => battle.add(hero("ada", MIDDLE, ROOM)), steps: 2 * MINUTE });
        const [now, was] = [play(), unseen(play)];

        // (The taproom's folk exactly as when everyone was stepped: each has dice of its own)
        assert.equal(differs(now, was, (played, k) => played.rooms[k][ROOM]), -1, "the taproom differs");
        assert.ok(now.held.every((held) => held === FOLK[ABOVE]), "the five upstairs held");
        assert.equal(new Set(now.stood.map((rooms) => rooms[ABOVE])).size, 1, "and as they were");
        assert.ok(new Set(was.rooms.map((rooms) => rooms[ABOVE])).size > 1);
    });

    it("holds no one while a player lies fallen in the room: they're there to see it", () => {
        const play = () =>
            evening({
                first: (battle) => {
                    battle.add(hero("ada", MIDDLE, ROOM));
                    battle.add(hero("bryn", [4, 4], ABOVE));
                    Object.assign(battle.actor("ada"), { dead: true, respawnAt: Infinity });
                },
                steps: MINUTE,
            });

        assert.equal(differs(play(), unseen(play)), -1);
    });

    it("starts them in the step after the one the door is gone through in, not as the player is told to go in; and holds them again from the step after the player has gone out", () => {
        const [TOLD, OUT] = [2 * SECOND, 30 * SECOND];
        const played = evening({
            first: (battle, world) => battle.add(hero("ada", [world.tavern.outside[0], world.tavern.outside[1] + 6], "town")),
            acts: [
                { at: TOLD, does: (battle) => battle.command("ada", { type: "enter", link: "tavern-door" }) },
                { at: OUT, does: (battle) => battle.command("ada", { type: "enter", link: "tavern-door" }) },
            ],
            steps: MINUTE,
        });
        const [came, went] = [crossed(played, "ada"), crossed(played, "ada", OUT)];

        assert.ok(came > TOLD + SECOND / 2 && went > OUT, `in at step ${came}, told at ${TOLD}; out at ${went}`);
        assert.equal(played.battle.actor("ada").map, "town");

        // (Told to go in and on the way to the door: held, all twelve; and in the step the door
        // is gone through, which began with no one in the room)
        assert.ok(played.held.slice(0, came + 1).every((held) => held === 12));
        assert.equal(new Set(played.stood.slice(0, came + 1).map((rooms) => rooms[ROOM])).size, 1);

        // (From the next: the taproom's seven stepped, the five upstairs held)
        assert.ok(played.held.slice(came + 1, went + 1).every((held) => held === FOLK[ABOVE]), "the taproom stepped while the player was in it");
        assert.notEqual(played.stood[came + 1][ROOM], played.stood[came][ROOM], "in the very next step");

        // (And from the step after the player went out, all twelve again, as they stood)
        assert.ok(played.held.slice(went + 1).every((held) => held === 12));
        assert.equal(new Set(played.stood.slice(went + 1).map((rooms) => rooms[ROOM])).size, 1);
        assert.equal(new Set(played.stood.map((rooms) => rooms[ABOVE])).size, 1, "no one upstairs stirred");
    });

    it("leaves a room for ten minutes with its folk standing where they were, and has them about their business within a second of a player coming back in", () => {
        const [IN, OUT, BACK] = [0, 20 * SECOND, 22 * SECOND + 10 * MINUTE];
        const enter = (battle) => battle.command("ada", { type: "enter", link: "tavern-door" });
        const played = evening({
            first: (battle, world) => battle.add(hero("ada", world.tavern.outside, "town")),
            acts: [IN, OUT, BACK].map((at) => ({ at, does: enter })),
            steps: BACK + 10 * SECOND,
        });
        const { battle } = played;
        const [went, back] = [crossed(played, "ada", OUT), crossed(played, "ada", BACK)];

        assert.ok(went > OUT && back > BACK && back - went >= 10 * MINUTE, `out at step ${went}, back in at ${back}`);

        // (Gone: every one of the room as it stood in the step the player went out, till the
        // step they came back in; some of them in the middle of a walk)
        const stood = played.stood[went][ROOM];

        assert.ok(played.stood.slice(went, back + 1).every((rooms) => rooms[ROOM] === stood), "the room as it was left");
        assert.ok(played.held.slice(went + 1, back + 1).every((held) => held === 12));
        assert.ok(played.events.slice(went + 1, back).every((events) => events.length === 0), "and nothing happened in it");

        // (Back: within a second some of them are resting or at their work, and every one of
        // them has taken a turn: its next look for danger is the one after the step they came in)
        const within = played.events.slice(back + 1, back + 1 + SECOND).flat();

        assert.ok(within.some(({ type }) => type === "rest" || type === "act"), "someone's resting or at their work within a second");
        assert.notEqual(played.stood[back + 1][ROOM], stood, "from the very next step");

        // (The owner's second answer: their waits as they were, none begun afresh; and their
        // answer of the same day on rests: those who sit, whose rests fell due while they stood,
        // don't all begin one in the step after the door's gone through, the player in sight of
        // them, but one after another in the three seconds after, each a moment of its own
        // after it's first seen, as they did when they were stepped unseen)
        const rests = (events) => events.filter(({ type }) => type === "rest").map(({ id }) => id);
        const seated = folkOf(battle, ROOM).filter((actor) => actor.routine.seated).map(({ id }) => id);
        const after = (run, from) => run.events.slice(from + 1, from + 1 + 3 * SECOND + 2);
        const spread = (run, from) => after(run, from).filter((events) => rests(events).length > 0).length;

        assert.equal(seated.length, 4);
        assert.ok(rests(played.events[back + 1]).length <= 1, "not together in the step after the door");
        assert.ok(seated.every((id) => rests(after(played, back).flat()).includes(id)), "the four who sit, each within three seconds");
        assert.ok(spread(played, back) >= 3, `in ${spread(played, back)} steps of their own`);

        const was = unseen(() => evening({ first: (b, world) => b.add(hero("ada", world.tavern.outside, "town")), acts: [IN, OUT, BACK].map((at) => ({ at, does: enter })), steps: BACK + 10 * SECOND }));
        const then = crossed(was, "ada", BACK);

        assert.ok(rests(was.events[then + 1]).length <= 1 && rests(after(was, then).flat()).length >= 3 && spread(was, then) >= 3, "as they were, unseen");
        assert.ok(folkOf(battle, ROOM).every((actor) => actor.map === ROOM && actor.lookAt > back * STEP_MS));
    });

    it("owes no one an act's sound for the time they stood: each of the folk acts once at most as a player comes in, none for the acts they'd have made unseen", () => {
        const BACK = 10 * MINUTE;
        const play = (steps) =>
            evening({
                first: (battle, world) => battle.add(hero("ada", world.tavern.outside, "town")),
                acts: [{ at: BACK, does: (battle) => battle.command("ada", { type: "enter", link: "tavern-door" }) }],
                steps,
            });
        const now = play(BACK + 5 * SECOND);
        const came = crossed(now, "ada");
        const acts = now.events.slice(came + 1, came + 1 + SECOND).flat().filter(({ type }) => type === "act");

        assert.equal(now.events.slice(0, came).flat().length, 0, "nothing said of anyone while they stood");
        assert.ok(acts.length <= FOLK[ROOM] && new Set(acts.map(({ id }) => id)).size === acts.length, `${acts.length} acts in the second after, one each at most`);
        assert.ok(acts.every(({ time }) => time > came * STEP_MS), "each said in the step it's made in");

        // (Unseen, as they were, they acted to no one all that while)
        const was = unseen(() => play(BACK));

        assert.ok(was.events.flat().filter(({ type }) => type === "act").length > 20);
    });
});

describe("who's stepped all the same, on a map no player is on (Battle.idling)", () => {
    // What the room's folk and whoever else is in it were after every step, with the switch on
    // and off: the same, where everyone in the room is stepped
    const sameRoom = (play, map = ROOM) => {
        const [now, was] = [play(), unseen(play)];

        assert.equal(differs(now, was, (played, k) => played.rooms[k][map]), -1, `${map} differs`);

        return now;
    };

    it("steps a room a creature of the wild has come into, the folk running from it within a look of its coming; and holds them again once it's out and they're calm", () => {
        const [IN, OUT] = [2 * SECOND, 20 * SECOND];
        const played = evening({
            first: (battle, world) => battle.add(wolf(world.tavern.outside, "town")),
            acts: [
                { at: IN, does: (battle) => battle.command("wolf", { type: "enter", link: "tavern-door" }) },
                { at: OUT, does: (battle) => battle.command("wolf", { type: "enter", link: "tavern-door" }) },
            ],
            steps: 2 * MINUTE,
        });
        const [came, went] = [crossed(played, "wolf"), crossed(played, "wolf", OUT)];
        const first = played.afraid.findIndex((ids) => ids.length > 0);

        assert.ok(came > IN && went > OUT, `in at step ${came}, out at ${went}`);
        assert.ok(played.held.slice(0, came + 1).every((held) => held === 12), "held till it came");
        assert.ok(played.held.slice(came + 1, went + 1).every((held) => held === FOLK[ABOVE]), "the taproom stepped while the wolf was in it");
        assert.ok(first > came && first <= came + 1 + FLEE.look / STEP_MS, `afraid at step ${first}, the wolf in at ${came}`);
        assert.ok(played.afraid.slice(first, went).some((ids) => ids.length >= 5), "most of the room afraid");
        assert.ok(played.afraid.every((ids) => ids.every((id) => played.battle.actor(id).map === ROOM)), "no one upstairs, who can't see it");

        // (Out: those still afraid stepped, the rest held; calm, and all held, a while after)
        const calm = played.afraid.findIndex((ids, k) => k > went && ids.length === 0);

        assert.ok(calm > went && calm <= went + (FLEE.calm + FLEE.look) / STEP_MS + 1, `calm at step ${calm}, the wolf out at ${went}`);
        assert.ok(played.held.slice(went + 1, calm).every((held, k) => held === 12 - played.afraid[went + k].length), "only those afraid stepped once it had gone");
        assert.ok(played.held.slice(calm + 1).every((held) => held === 12), "and no one once they're calm");
    });

    it("steps the folk still afraid once what frightened them has gone, till they're calm, and holds them where they are then: one that sits, up from its seat till someone comes in", () => {
        const [IN, GONE] = [SECOND, 10 * SECOND];
        const played = evening({
            acts: [
                { at: IN, does: (battle) => battle.add(wolf(MIDDLE, ROOM)) },
                { at: GONE, does: (battle) => battle.remove("wolf") },
            ],
            steps: MINUTE,
        });
        const { battle } = played;
        const calm = played.held.findIndex((held, k) => k > GONE && held === 12);

        assert.ok(played.held.slice(IN, GONE).every((held) => held === FOLK[ABOVE]), "the room stepped while the wolf was in it");
        assert.ok(played.held[GONE] < 12 && played.held[GONE] >= FOLK[ABOVE], "those afraid still stepped as it went");
        assert.ok(calm > GONE && calm <= GONE + (FLEE.calm + FLEE.look) / STEP_MS + 1, `all calm and held at step ${calm}, the wolf gone at ${GONE}`);
        assert.ok(folkOf(battle, ROOM).every((actor) => actor.afraid === null), "calm");
        assert.equal(new Set(played.stood.slice(calm).map((rooms) => rooms[ROOM])).size, 1, "and standing as they were when they calmed");
        assert.ok(folkOf(battle, ROOM).some((actor) => actor.routine.seated && actor.reseat), "one that sits is up from its seat yet");
    });

    it("steps one of the folk that's ailing till it's done, and one fallen till it's up again at its place: no one else in the room", () => {
        const played = evening({
            acts: [
                { at: SECOND, does: (battle, world) => battle.afflict(world.folk[0].id, "burn", { ms: 4000 }) },
                { at: 20 * SECOND, does: (battle, world) => battle.afflict(world.folk[1].id, "burn", { damage: 100000 }) },
            ],
            steps: 2 * MINUTE,
        });
        const { battle, world } = played;
        const ails = played.held.map((held, k) => (held === 11 ? k : -1)).filter((k) => k >= 0);

        assert.ok(played.held[SECOND] === 11 && played.held.slice(SECOND, SECOND + 3 * SECOND).every((held) => held === 11), "the one ailing stepped, the rest held");
        assert.ok(played.events.flat().some(({ type, id }) => type === "respawn" && id === world.folk[1].id), "the fallen one's up again");
        assert.ok(!battle.actor(world.folk[1].id).dead);
        assert.ok(played.held.at(-1) === 12 && ails.length < 2 * MINUTE - SECOND, "and everyone held again after");
    });

    it("holds a garrison at its posts as it stood unseen, in every way but that no one's looked for: an enemy come in after someone is fought blow for blow as it was, the whole battle the same step for step", () => {
        // (A long room with its garrison and no folk: a guardsman at its post does nothing
        // unseen but look, and held, its next look's time is kept as a look that found no one
        // leaves it, battle.js #lull. So this much of the change comes out the same either way)
        const CAME = 5 * SECOND;
        const play = () =>
            evening({
                first: (battle, world) => {
                    battle.add(guard("g1", [6, 6], ROOM));
                    battle.add(guard("g2", [10, 8], ROOM));
                    battle.add({ id: "raider", kind: "soldier", name: "raider", team: "orc", weapon: "cleaver", square: [world.tavern.outside[0] + 30, world.tavern.outside[1]], map: "town", ai: "patrol", patrol: [[world.tavern.outside[0] + 30, world.tavern.outside[1]]] });
                },
                acts: [{ at: CAME, does: (battle) => assert.ok(battle.place("raider", ROOM, MIDDLE)) }],
                steps: 40 * SECOND,
                folk: false,
            });
        const [now, was] = [play(), unseen(play)];

        assert.equal(differs(now, was), -1, "the battles differ");
        assert.ok(now.held.slice(0, CAME).every((held) => held === 2), "the two guardsmen held at their posts");
        // (The raider out in the town looks about in both; the two guardsmen only unseen)
        assert.ok(sum(was.searches, 0, CAME) - sum(now.searches, 0, CAME) >= 2 * (CAME / 5), `${sum(now.searches, 0, CAME)} searches while they were held, ${sum(was.searches, 0, CAME)} unseen`);
        assert.ok(now.held.slice(CAME, CAME + SECOND).every((held) => held === 0), "and stepped from the step the raider's in the room");
        assert.ok(now.events.flat().some(({ type }) => type === "attack") && now.events.flat().some(({ type, id }) => type === "death" && id === "raider"), "they fought, and put it down");

        // (The fight over and their swords put away, held again)
        assert.equal(now.held.at(-1), 2);
    });

    it("holds no one on a map with soldiers of two sides posted on it, which no barracks has: they fight as they did", () => {
        const play = () =>
            evening({
                first: (battle) => {
                    battle.add(guard("g1", [6, 6], ROOM));
                    battle.add(guard("o1", MIDDLE, ROOM, { team: "orc", weapon: "cleaver" }));
                },
                steps: 20 * SECOND,
                folk: false,
            });
        const [now, was] = [play(), unseen(play)];

        assert.equal(differs(now, was), -1, "the battles differ");
        assert.equal(now.held[0], 0);
        assert.ok(now.events.flat().some(({ type }) => type === "attack"), "they fought");
    });

    it("steps a follower left in a room and a soldier who came in after someone, who goes out again by the door; the room stepped with them, as it was", () => {
        const follows = () =>
            evening({
                first: (battle, world) => {
                    battle.add(hero("ada", world.tavern.outside, "town"));
                    battle.add({ id: "hound", kind: "beast", name: "Hound", team: "human", weapon: "claws", square: MIDDLE, map: ROOM, ai: "follow", leader: "ada", wild: { temper: "defensive" } });
                },
                steps: MINUTE,
            });

        assert.ok(sameRoom(follows).held.every((held) => held === FOLK[ABOVE]), "the room's stepped with a follower in it");

        const chased = () =>
            evening({
                first: (battle, world) => battle.add(guard("watch", world.tavern.outside, "town")),
                acts: [{ at: SECOND, does: (battle) => assert.ok(battle.place("watch", ROOM, MIDDLE)) }],
                steps: MINUTE,
            });
        const now = chased();
        const out = crossed(now, "watch", SECOND + 1);

        assert.ok(out > SECOND + 1, `out by the door at step ${out}`);
        assert.equal(now.battle.actor("watch").map, "town");
        assert.ok(now.held.slice(SECOND, out + 1).every((held) => held === FOLK[ABOVE]), "the room stepped while it was in it");
        assert.ok(now.held.slice(out + 1).every((held) => held === 12), "and held once it was out");
    });

    it("steps everything in a dungeon: its folk and a soldier posted on its level as they were, with no player there", () => {
        const play = () => evening({ first: (battle) => battle.add(guard("g1", [6, 6], ROOM)), dungeon: ROOM, steps: MINUTE });
        const now = sameRoom(play);

        assert.ok(now.held.every((held) => held === FOLK[ABOVE]), "only those upstairs, which is no dungeon's, held");
    });
});

describe("every copy of a world holds the same ones (Battle.idling)", () => {
    it("keeps nothing of it: a battle brought back from its snapshot in the middle of a hold, in the step the door's gone through and in the step after plays on as the one it was taken from", () => {
        const TOLD = 5 * SECOND;
        const steps = 30 * SECOND;
        const acts = [{ at: TOLD, does: (battle) => battle.command("ada", { type: "enter", link: "tavern-door" }) }];
        const first = (battle, world) => battle.add(hero("ada", [world.tavern.outside[0], world.tavern.outside[1] + 3], "town"));
        const whole = evening({ first, acts, steps });
        const came = crossed(whole, "ada");

        assert.ok(came > TOLD);

        for (const at of [TOLD - 2, came - 1, came, came + 1, came + SECOND]) {
            // (Played to `at`, taken, brought back, and played on)
            const world = generateWorld({ seed: 1 });
            const battle = new Battle(world, { seed: 1 });

            first(battle, world);
            world.folk.forEach((one) => battle.add({ id: one.id, kind: "folk", name: one.name, team: "folk", square: one.square, map: one.map, ai: "routine", neutral: true, routine: one.routine, role: one.role, facing: one.facing }));

            for (let step = 0; step <= at; step++) {
                acts.filter((act) => act.at === step).forEach((act) => act.does(battle));
                battle.advance(STEP_MS);
            }

            const again = Battle.restore(generateWorld({ seed: 1 }), JSON.parse(JSON.stringify(battle.snapshot())));

            for (let step = at + 1; step < steps; step++) {
                acts.filter((act) => act.at === step).forEach((act) => act.does(again));

                const events = again.advance(STEP_MS);

                assert.equal(`${encode(events)} ${sha(JSON.stringify(again.snapshot()))}`, whole.steps[step], `taken after step ${at}, differs at step ${step}`);
            }
        }
    });
});

// --- A whole world (core/host.js): its town's buildings got ready round a player ---

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });
const put = (actor, [x, y]) => Object.assign(actor, { x: x + 0.5, y: y + 0.5, square: [x, y], path: [], order: null, target: null });
const insideOf = (host) => [...new Set(host.battle.actors.filter((actor) => actor.map !== "town").map((actor) => actor.map))];

// A world (seed 2) with its player at the door of the barracks of the town they start in, not
// gone in, and everything near got ready: the barracks' garrison and the folk of the buildings
// round it, and the tavern's, all with no player on their maps. Played `seconds`
function atTheDoor(seconds = 2) {
    const host = new Host(buildWorld({ seed: 2 }), { populate: false });

    host.join({ id: HOST_PLAYER, hero: HERO });
    host.populate();

    const building = [...host.world.interiors.buildings.values()].find(({ kind, place }) => kind === "barracks" && place === "home");
    const me = host.battle.actor(HOST_PLAYER);

    put(me, building.door.ends[0].squares[0]);

    for (let t = 0; t < seconds * 1000; t += STEP_MS) {
        host.advance(STEP_MS);
    }

    return { host, building, me, town: host.war.town(host.world.start.id) };
}

describe("a world whose buildings are got ready round a player (core/host.js, Battle.idling)", () => {
    it("plays the same step for step with the switch off and on, a player kept standing on every floor of every open building: the plan's acceptance test", () => {
        // (Got ready with no one in them, taken, and carried on twice from the one snapshot:
        // someone stood on every map but the world's, and played with the switch on and off)
        const { host } = atTheDoor();
        const kept = encode(host.snapshot());
        const play = () => {
            const again = Host.restore(buildWorld({ seed: 2 }), decode(kept));
            const maps = insideOf(again);
            const steps = [];

            maps.forEach((map, k) => {
                const taken = new Set(again.battle.actors.filter((actor) => actor.map === map).map(({ square: [x, y] }) => `${x},${y}`));
                const one = again.battle.actors.find((actor) => actor.map === map);
                let square = null;

                // (A free square of the floor next to one of its own, wherever that is)
                for (let ring = 1; ring < 6 && !square; ring++) {
                    for (const [dx, dy] of [[ring, 0], [-ring, 0], [0, ring], [0, -ring]]) {
                        const at = [one.square[0] + dx, one.square[1] + dy];

                        if (!square && !squaresOf(again.battle.maps[map]).blocked(at[0], at[1]) && !taken.has(`${at[0]},${at[1]}`)) {
                            square = at;
                        }
                    }
                }

                assert.ok(square, `somewhere to stand on ${map}`);
                again.battle.add({ id: `stood-${k}`, kind: "player", name: `Stood ${k}`, team: "human", weapon: "sword", square, map });
            });

            let held;
            let ticks = 0;
            const probes = install(new Probes({ clock: () => ticks++ }));

            try {
                for (let step = 0; step < 30 * SECOND; step++) {
                    const events = again.advance(STEP_MS);

                    steps.push(`${encode(events)} ${again.checksum()}`);
                }

                held = probes.toJSON().counts["battle.held"] ?? 0;
            } finally {
                uninstall();
            }

            return { steps, held, maps, world: sha(encode(again.snapshot())), folk: again.battle.actors.filter((actor) => actor.map !== "town" && actor.kind !== "player").length };
        };
        const [now, was] = [play(), unseen(play)];
        const differs = now.steps.findIndex((step, k) => step !== was.steps[k]);

        assert.ok(now.maps.length >= 5 && now.folk >= 20, `${now.folk} indoors on ${now.maps.length} floors`);
        assert.equal(differs, -1, `the worlds differ from step ${differs}`);
        assert.equal(now.world, was.world, "the world at the end");
        assert.equal(now.held, 0, "no one held");
        assert.ok(new Set(now.steps).size > now.steps.length / 2, "(a world that's moving)");
    });

    it("holds the town's buildings' folk and its barracks' garrison from the step they're got ready, a player at the barracks' door; and the world's own sum goes on, the same from a snapshot", () => {
        const { host, town } = atTheDoor(0);
        let ticks = 0;
        const probes = install(new Probes({ clock: () => ticks++ }));
        const sums = [];

        try {
            for (let step = 0; step < 4 * SECOND; step++) {
                host.advance(STEP_MS);
                sums.push(host.checksum());
            }
        } finally {
            uninstall();
        }

        const out = host.quartered.get(town.id);
        const indoors = host.battle.actors.filter((actor) => actor.map !== "town");
        const counts = probes.toJSON().counts;

        assert.ok(out && out.ids.length >= 2, "the garrison stood up in its barracks");
        assert.ok(indoors.length >= 20 && indoors.every((actor) => actor.kind === "folk" || actor.kind === "soldier"));
        assert.ok(counts["battle.held"] >= indoors.length * 3 * SECOND, `${counts["battle.held"]} held in four seconds, ${indoors.length} indoors at the end`);
        assert.ok(indoors.every((actor) => !actor.path.length && actor.waitUntil === 0), "no one indoors has taken a turn");
        assert.ok(out.ids.every((id) => host.battle.actor(id).rethinkAt > host.battle.time - 250), "the garrison's next looks kept to their own steps");

        // (A copy made of it now plays the same on: nothing of who's held is kept anywhere)
        const again = Host.restore(buildWorld({ seed: 2 }), decode(encode(host.snapshot())));

        for (let step = 0; step < 2 * SECOND; step++) {
            host.advance(STEP_MS);
            again.advance(STEP_MS);
            assert.equal(again.checksum(), host.checksum(), `step ${step}`);
        }
    });

    it("still makes a barracks' garrison up again once the player's left it a while: its relief is the host's, not a turn of theirs", () => {
        const { host, building, me, town } = atTheDoor();
        const run = (ms) => {
            for (let t = 0; t < ms; t += STEP_MS) {
                host.advance(STEP_MS);
            }
        };
        const out = host.quartered.get(town.id);

        // (In, one of them put down, and out again)
        assert.equal(host.command(HOST_PLAYER, { type: "enter", link: building.door.id }).ok, true);
        run(1500);
        assert.equal(me.map, building.maps[0]);
        host.battle.afflict(out.ids[1], "burn", { by: HOST_PLAYER, damage: 100000 });
        run(2500);
        assert.ok(host.battle.actor(out.ids[1])?.dead ?? true, "one of the garrison down");
        assert.ok(host.quartered.get(town.id).relief > host.battle.time, "to be made up");
        host.command(HOST_PLAYER, { type: "enter", link: building.door.id });
        run(6000);
        assert.equal(me.map, "town");

        // (Its relief due with no one in it: the garrison stood up afresh, all of it, and held)
        run(RELIEF_MS);

        const now = host.quartered.get(town.id);

        assert.ok(now.relief === null && now.ids.length === out.ids.length, "made up");
        assert.ok(now.ids.every((id) => host.battle.actor(id) && !host.battle.actor(id).dead && host.battle.actor(id).map === building.maps[0]));
    });

    it("keeps every copy of a world with its host's while one player is in a tavern and another isn't, and as they come and go: never astray, the same sum at the end", () => {
        const host = new Host(buildWorld({ seed: 2 }), { populate: false });

        host.join({ id: HOST_PLAYER, hero: HERO });
        host.populate();

        const post = [];
        const hosting = new Hosting(host, { send: (peer, text) => post.push({ to: peer, text }) });
        const joining = new Joining({ send: (text) => post.push({ from: "peer", text }) });
        const deliver = () => {
            while (post.length) {
                const { from, text } = post.shift();

                from ? hosting.hear(from, text) : joining.hear(text);
            }
        };
        let astray = 0;
        const play = (steps) => {
            for (let step = 0; step < steps; step++) {
                host.advance(STEP_MS);
                hosting.flush();
                deliver();

                while (joining.step()) {
                    // (every step it's been sent)
                }

                astray += joining.astray ? 1 : 0;
                deliver();
            }
        };

        joining.onWelcome = ({ seed, race, snapshot }) => joining.attach(Host.restore(buildWorld({ seed, race }), snapshot));
        joining.hello({ hero: { ...HERO, name: "Bryn", race: "human" }, progress: { gold: 50 } });
        deliver();
        play(SECOND);

        const guest = joining.me;
        const door = host.battle.links.find(({ id }) => id === "tavern-door");
        const [mine, theirs] = [host.battle.actor(HOST_PLAYER), host.battle.actor(guest)];
        const folk = () => host.battle.actors.filter((actor) => actor.kind === "folk" && actor.map === ROOM);
        const stood = () => sha(folk().map(standingOf).join("\n"));

        assert.ok(door && theirs && folk().length >= 5, "(the town's tavern, its folk, and the guest in the world)");

        // (No one in: its folk as they stand, in the host's world and the copy's)
        const empty = stood();

        play(2 * SECOND);
        assert.equal(stood(), empty, "held with no one in");

        // (Each goes in and out by their own commands: to the door's step, then through it)
        const until = (met, said) => {
            for (let second = 0; second < 60 && !met(); second++) {
                play(SECOND);
            }

            assert.ok(met(), said);
        };
        const step = door.ends.find((end) => end.map === "town").arrive;
        const tell = (who, command) => (who === mine ? host.command(HOST_PLAYER, command) : joining.command(command));
        const goIn = (who, said) => {
            const near = () => Math.hypot(who.x - step[0] - 0.5, who.y - step[1] - 0.5) < 2.5 && !who.path.length;

            // (Told again if a way's found only part of the way there)
            for (let tries = 0; tries < 8 && !near(); tries++) {
                tell(who, { type: "move", to: step });
                play(4 * SECOND);
            }

            assert.ok(near(), `${said} at the door: ${who.x}, ${who.y}, the door's step ${step}`);
            tell(who, { type: "enter", link: door.id });
            until(() => who.map === ROOM, `${said} in the taproom`);
        };
        const goOut = (who, said) => {
            tell(who, { type: "enter", link: door.id });
            until(() => who.map === "town", `${said} out again`);
        };

        // (The host's player in, the guest out in the street: stepped, for every copy)
        goIn(mine, "the host's player");
        assert.equal(theirs.map, "town");

        const first = stood();

        play(3 * SECOND);
        assert.notEqual(stood(), first, "about their business with one player in and one not");

        // (The guest in too, and the host's player out: still stepped)
        goIn(theirs, "the guest");
        goOut(mine, "the host's player");
        assert.deepEqual([mine.map, theirs.map], ["town", ROOM]);

        const one = stood();

        play(3 * SECOND);
        assert.notEqual(stood(), one, "about their business with only the guest in");

        // (And the guest out: held again, as they stand)
        goOut(theirs, "the guest");
        play(1);

        const left = stood();

        play(5 * SECOND);
        assert.equal(stood(), left, "held again with no one in");
        assert.equal(astray, 0, "the copy never astray");
        assert.ok(joining.checks > 20, `${joining.checks} sums checked`);
        assert.equal(joining.host.checksum(), host.checksum());
    });
});
