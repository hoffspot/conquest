// The hell rifts (client/js/core/hellrift.js, core/host.js #hellRifts; docs/WILDS.md *Hell
// rifts*): once a day of the world, torn open out in the wilds within reach of the players, half an
// hour; its tears pouring out demons as strong as the mightiest hero about it, a tier over; sealed
// for a cache; its guards woken at its heart, its altar bare once they've fallen, smashed for a
// chest each (and more for brimstone), and its letter telling the way to a hell.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { DAY, dayOf } from "../client/js/core/daytime.js";
import { hypot } from "../client/js/core/exact.js";
import { BRIMSTONE, dueOf, HELL_RIFT, hellFor, inRift, letterOf, RIFT_DEMONS, RIFT_GUARDS, riftDue, riftSite, riftTier, tearsOf } from "../client/js/core/hellrift.js";
import { HOST_PLAYER, Host } from "../client/js/core/host.js";
import { calledTier } from "../client/js/core/might.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { createRandom } from "../client/js/core/random.js";
import { clearOfSettlements, CREATURES, packOf, tierPower } from "../client/js/core/creatures.js";
import { BODIES } from "../client/js/core/strength.js";
import { landAt, planWorld } from "../client/js/core/worldplan/plan.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

function run(host, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...host.advance(STEP_MS));
    }

    return events;
}

const put = (actor, [x, y]) => Object.assign(actor, { square: [Math.floor(x), Math.floor(y)], x: Math.floor(x) + 0.5, y: Math.floor(y) + 0.5, path: [], order: null, target: null, spawn: [Math.floor(x), Math.floor(y)] });

// The world's clock set to `elapsed` ms
const at = (host, elapsed) => Object.assign(host.war, { turn: Math.floor(elapsed / 60000), clock: elapsed % 60000 });

// The first moment a world's rift is due on a day past HELL_RIFT.first (ms of the world)
function dueTime(seed) {
    const day = dayOf(HELL_RIFT.first) + 1;

    return day * DAY.length - DAY.start + dueOf(seed, day);
}

function world() {
    const built = buildWorld({ seed: 2 });
    const host = new Host(built, { populate: false });

    host.join({ id: HOST_PLAYER, hero: HERO });
    host.populate();
    Object.assign(host.battle.actor("orc"), { dead: true, respawnAt: Infinity });

    const me = host.battle.actor(HOST_PLAYER);

    Object.assign(me, { hp: 1e6, maxHp: 1e6 });

    return { host, me, plan: built.plan };
}

// A rift torn open as its time comes (the player where they are), and its events
function opened() {
    const made = world();
    const events = [];

    at(made.host, dueTime(made.host.battle.seed) + 1000);
    events.push(...run(made.host, 2000));

    return { ...made, events, open: made.host.hellRifts.open };
}

// Felling one (or striking a tear or altar down) where it stands, the player beside it
function felled(host, actor, id) {
    const foe = host.battle.actor(id);
    const events = [];

    put(actor, [foe.square[0] + 1, foe.square[1]]);
    Object.assign(foe, { hp: 1 });
    Object.assign(actor, { power: { melee: 1e4, ranged: 1e4 } });
    host.command(actor.id, { type: "engage", target: id });

    for (let t = 0; t < 8000 && !foe.dead && host.battle.actor(id); t += 250) {
        Object.assign(actor, { hp: 1e6, maxHp: 1e6 });
        events.push(...run(host, 250));
    }

    events.push(...run(host, 500));

    return events;
}

// Stood a few metres from a point, the ground about it made, a moment to come
function standBy(host, me, [x, y], off = 6) {
    put(me, [x + off, y]);

    return run(host, 1500);
}

const riftEvents = (events, change) => events.filter((event) => event.type === "hellRift" && event.change === change);

describe("a hell rift's day and place (core/hellrift.js)", () => {
    const plan = planWorld(2);

    it("is due once a day of the world, at a time in its window that the day has, none in a world's first minutes", () => {
        for (let day = 0; day < 40; day++) {
            const due = dueOf(7, day);

            assert.ok(due >= HELL_RIFT.opens[0] && due < HELL_RIFT.opens[1], `${due}`);
            assert.equal(dueOf(7, day), due, "the same every time");
        }

        assert.ok(new Set(Array.from({ length: 20 }, (_, day) => dueOf(7, day))).size > 10, "not the same each day");
        assert.equal(riftDue(7, HELL_RIFT.first - 1), null);

        const day = dayOf(HELL_RIFT.first) + 1;
        const due = day * DAY.length - DAY.start + dueOf(7, day);

        assert.equal(riftDue(7, due - 1), null, "not before its time");
        assert.deepEqual(riftDue(7, due), { day });
        assert.deepEqual(riftDue(7, due + HELL_RIFT.late - 1), { day }, "a little late, if it couldn't then");
        assert.equal(riftDue(7, due + HELL_RIFT.late), null, "too late: none that day");
        assert.equal(riftDue(7, due, day), null, "that day's had");
    });

    it("tears open out in the wilds within reach of a player: dry land, clear of the settlements, inside the world", () => {
        const random = createRandom(3);
        const start = plan.places[0].at;

        for (let k = 0; k < 30; k++) {
            const heart = riftSite(plan, [start], random);

            assert.ok(heart, "somewhere found");

            const far = hypot(heart[0] - start[0], heart[1] - start[1]);

            assert.ok(far >= HELL_RIFT.from - 1e-6 && far <= HELL_RIFT.to + 1e-6, `${far}`);
            assert.ok(!landAt(plan, ...heart).water);
            assert.ok(clearOfSettlements(plan, heart, HELL_RIFT.clear));
            assert.ok(heart.every((each) => each >= HELL_RIFT.edge && each <= plan.size - HELL_RIFT.edge));
        }

        assert.equal(riftSite(plan, [], random), null, "no one about, nowhere");
        assert.equal(riftSite(plan, [start], random, () => false), null, "nowhere the host will have it");
    });

    it("scatters its tears through its land, each well apart, on dry ground", () => {
        const random = createRandom(4);
        const start = plan.places[0].at;

        for (let k = 0; k < 20; k++) {
            const heart = riftSite(plan, [start], random);
            const tears = tearsOf(plan, heart, random);

            assert.ok(tears.length >= 4 && tears.length <= HELL_RIFT.tears[1], `${tears.length}`);

            for (const [k2, tear] of tears.entries()) {
                const out = hypot(tear[0] - heart[0], tear[1] - heart[1]);

                assert.ok(out >= HELL_RIFT.tearsFrom - 1e-6 && out <= HELL_RIFT.radius - HELL_RIFT.inside + 1e-6, `${out}`);
                assert.ok(inRift({ at: heart }, tear));
                assert.ok(!landAt(plan, ...tear).water);
                assert.ok(tears.slice(k2 + 1).every((other) => hypot(other[0] - tear[0], other[1] - tear[1]) >= HELL_RIFT.apart));
            }
        }
    });

    it("is as strong as the mightiest hero about it, a tier over, up to the last", () => {
        assert.equal(riftTier([]), calledTier(0) + HELL_RIFT.up);
        assert.equal(riftTier([0]), 2);
        assert.equal(riftTier([12, 55]), calledTier(55) + 1);
        assert.equal(riftTier([95]), 10, "no more than the last tier");
        assert.ok(RIFT_DEMONS.every(({ weight }) => weight > 0));
    });

    it("leaves a letter on its altar telling the way to the nearest hell not yet found: which way, how far a walk", () => {
        const hells = plan.sites.filter((site) => site.theme === "hell");
        const from = plan.places[0].at;
        const far = (site) => hypot(site.at[0] - from[0], site.at[1] - from[1]);
        const nearest = [...hells].sort((a, b) => far(a) - far(b));

        assert.ok(hells.length >= 2);
        assert.equal(hellFor(plan, from), nearest[0]);
        assert.equal(hellFor(plan, from, (site) => site === nearest[0]), nearest[1], "one already found passed over");
        assert.equal(hellFor(plan, from, () => true), nearest[0], "all found: the nearest");

        for (let which = 0; which < 3; which++) {
            const letter = letterOf(plan, from, nearest[0], which);
            const text = letter.entries[0].text.join(" ");

            assert.equal(letter.title, "A cultist's letter");
            assert.ok(/(north|south|east|west)/.test(text), text);
            assert.ok(/walk/.test(text), text);
            assert.ok(!text.includes("{"), text);
        }
    });
});

describe("a hell rift in the world (core/host.js #hellRifts)", () => {
    it("tears open once its time comes, within reach of the player, for half an hour, and seals itself after; not again that day", () => {
        const { host, me, events, open } = opened();

        assert.ok(open, "open");

        const [told] = riftEvents(events, "opened");
        const far = hypot(open.at[0] - me.x, open.at[1] - me.y);

        assert.deepEqual(told.at, open.at);
        assert.equal(told.until - host.battle.time <= HELL_RIFT.lasts, true);
        assert.ok(far >= HELL_RIFT.from - 2 && far <= HELL_RIFT.to + 2, `${far}`);
        assert.ok(open.tears.length >= 4);
        assert.deepEqual(open.guards.left, [RIFT_GUARDS.warden, RIFT_GUARDS.priest, ...Array(HELL_RIFT.fiends).fill(RIFT_GUARDS.fiend)]);

        open.until = host.battle.time + 100;

        const after = run(host, 1500);

        assert.equal(riftEvents(after, "faded").length, 1);
        assert.equal(host.hellRifts.open, null);
        assert.equal(run(host, 2000).filter((event) => event.type === "hellRift").length, 0, "not again that day");
        assert.equal(host.hellRifts.last, dayOf(dueTime(host.battle.seed)));
    });

    it("stands its tears out as a hero comes near; each pours out demons a tier over the hero, brimstone as they fall; sealed for a cache", () => {
        const { host, me, open } = opened();
        const tear = open.tears[0];

        const events = [...standBy(host, me, tear.at, 20), ...run(host, 3000)];
        const actor = host.battle.actor(tear.id);

        assert.equal(actor?.kind, "tear");
        assert.equal(actor.hp, tear.most);

        const poured = riftEvents(events, "poured");

        assert.ok(poured.length >= 1, "a pack out of it");

        const [demon] = poured[0].ids;
        const one = host.wild.get(demon);

        assert.equal(one.hellRift, open.id);
        assert.equal(one.tier, riftTier([host.mightFor(HOST_PLAYER)]));

        const fell = felled(host, me, demon);
        const brimstone = fell.find((event) => event.type === "brimstone" && event.id === HOST_PLAYER);

        assert.deepEqual([brimstone.gained, brimstone.brimstone], [BRIMSTONE.each, BRIMSTONE.each]);

        const sealing = felled(host, me, tear.id);

        assert.equal(riftEvents(sealing, "sealed").length, 1);
        assert.ok(open.tears[0].sealed);
        assert.ok(sealing.some((event) => event.type === "spoils" && event.id === HOST_PLAYER && event.cache), "a cache for sealing it");
        assert.equal(host.battle.actors.filter((each) => each.kind === "tear" && !each.dead).every((each) => each.id !== `${open.id}/tear-0`), true);
    });

    it("pours out no more about a tear than the body budget there allows (BODIES)", () => {
        const { host, me, open } = opened();
        const tear = open.tears[0];
        const [x, y] = tear.at;

        // (The budget about the tear all but filled with the player's own: room for one more)
        for (let k = 0; k < BODIES.most - 2; k += 1) {
            const square = [Math.floor(x) + 10 + (k % 8), Math.floor(y) + 10 + Math.floor(k / 8)];

            host.battle.add({ id: `hireling-${k}`, kind: "follower", name: "Hireling", weapon: "sword", team: me.team, square, map: "town", hp: 100, power: { melee: 1, ranged: 1 }, armor: 0 });
        }

        const events = [...standBy(host, me, tear.at, 20), ...run(host, 3000)];
        const [poured] = riftEvents(events, "poured");
        const tier = riftTier([host.mightFor(HOST_PLAYER)]);
        const wanted = packOf(poured.creature, tier);

        assert.equal(poured.ids.length, 1, "one, for the one place left");
        assert.equal(host.battle.actor(poured.ids[0]).maxHp, Math.round(CREATURES[poured.creature].hp * tierPower(tier) * wanted), "the rest of the pack in its hit points");

        // (And none more while the budget's full: its next pack's time come and gone)
        const later = run(host, HELL_RIFT.every + 2000);

        assert.equal(riftEvents(later, "poured").length, 0);
    });

    it("wakes its guards at its heart (the Rift Warden a boss, the high priest, fiends); the altar bare once they've fallen, smashed for a chest each, more for brimstone; the rest gone back", () => {
        const { host, me, open } = opened();
        const events = standBy(host, me, open.at, 30);
        const [guards] = riftEvents([...events, ...run(host, 1000)], "guards");

        assert.ok(guards, "its guards woken");

        const warden = guards.ids.map((id) => [id, host.wild.get(id)]).find(([, one]) => one.riftGuard === RIFT_GUARDS.warden);

        assert.equal(host.battle.actor(warden[0]).name, RIFT_GUARDS.title);
        assert.equal(host.battle.actor(warden[0]).wild.champion, "boss");
        assert.equal(guards.ids.length, 2 + HELL_RIFT.fiends);
        assert.ok(!host.battle.actors.some((each) => each.kind === "altar"), "no altar to strike while they stand");

        const fell = guards.ids.flatMap((id) => felled(host, me, id));

        assert.equal(riftEvents(fell, "bare").length, 1);

        const won = fell.filter((event) => event.type === "brimstone" && event.id === HOST_PLAYER).reduce((sum, { gained }) => sum + gained, 0);

        assert.equal(won, BRIMSTONE.warden + (1 + HELL_RIFT.fiends) * BRIMSTONE.guard);

        const more = run(host, 1500);
        const altar = host.battle.actors.find((each) => each.kind === "altar" && !each.dead);

        assert.ok(altar, `the altar bare: ${JSON.stringify(more.filter((event) => event.type === "hellRift"))}`);

        const smashed = felled(host, me, altar.id);
        const [closed] = riftEvents(smashed, "closed");
        const chests = smashed.filter((event) => event.type === "spoils" && event.id === HOST_PLAYER && event.from === open.id);

        assert.deepEqual(closed.heroes, [HOST_PLAYER]);
        assert.equal(chests.length, 1 + Math.min(BRIMSTONE.most, Math.floor(won / BRIMSTONE.per)), "a great hoard, and one more for each ten brimstone");
        assert.equal(host.hellRifts.open, null);
        assert.ok(![...host.wild].some(([id, one]) => one.hellRift === open.id && host.battle.actor(id) && !host.battle.actor(id).dead), "its demons gone back through it");
        assert.ok(!host.battle.actors.some((each) => (each.kind === "tear" || each.kind === "altar") && each.id.startsWith(open.id)));
    });

    it("keeps an open rift, as it stands, with the world (its snapshot)", () => {
        const { host, open } = opened();
        const again = Host.restore(host.world, host.snapshot());

        assert.deepEqual(again.hellRifts, host.hellRifts);
        assert.equal(again.hellRifts.open.id, open.id);
    });

    it("is torn open before a player by the debug overlay's command, its heart 120 m off", () => {
        const { host, me } = world();
        const result = host.command(HOST_PLAYER, { type: "hellrift" });

        assert.deepEqual(result, { ok: true });
        assert.ok(Math.abs(hypot(host.hellRifts.open.at[0] - me.x, host.hellRifts.open.at[1] - me.y) - 120) < 1);
    });
});
