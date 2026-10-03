// Passing the time (core/host.js REST, core/daytime.js untilWaking; the terrain plan's M7e, §9
// Night in play): a room taken at an inn, or a camp made out in the world where nothing hostile's
// near, slept in to the next sunrise or sunset, hurts mended and stamina filled; the war's turns
// meanwhile all played; the camp's fire burning a while after, lighting what's round it; only the
// world's host passing the time (anyone else just rests), and every copy of the world the same
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { WILD } from "../client/js/core/creatures.js";
import { DAY, elapsedOf, timeOfDay, untilWaking } from "../client/js/core/daytime.js";
import { HOST_PLAYER, Host, REFUSALS, REST } from "../client/js/core/host.js";
import { Hosting, Joining } from "../client/js/core/netplay.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { SETTLEMENT_KINDS } from "../client/js/core/setpieces/town.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });
const MINUTE = 60000;

// How long the world's been going (ms) when it's a time of day (ms from midnight) on day `day`
const at = (time, day = 1) => day * DAY.length + time - DAY.start;
const clockTo = (host, elapsed) => Object.assign(host.war, { turn: Math.floor(elapsed / MINUTE), clock: elapsed % MINUTE });
const put = (actor, [x, y]) => Object.assign(actor, { square: [x, y], x: x + 0.5, y: y + 0.5, path: [], order: null, target: null, spawn: [x, y] });

// A world with its player in it (the orc gone), and a way to put someone out in the wilds west of
// their town
function hosted() {
    const world = buildWorld({ seed: 2 });
    const host = new Host(world, { populate: false });

    host.join({ id: HOST_PLAYER, hero: HERO });
    host.populate();
    Object.assign(host.battle.actor("orc"), { dead: true, respawnAt: Infinity });

    const [middle, radius] = [world.stamp.middle, SETTLEMENT_KINDS[world.start.kind].radius];
    const outside = (actor, along = 0) => put(actor, [Math.floor(middle[0] - radius - 80), Math.floor(middle[1] - 20 + along)]);

    return { host, world, me: host.battle.actor(HOST_PLAYER), outside };
}

const hurt = (actor) => Object.assign(actor, { hp: 3, stamina: 1 });

describe("passing the time (core/daytime.js, core/host.js)", () => {
    it("sleeps to the next sunrise or sunset, five minutes off at the least", () => {
        assert.equal(untilWaking(at(29 * MINUTE), REST.least), DAY.sets - 29 * MINUTE, "noon: to the evening");
        assert.equal(untilWaking(at(0), REST.least), DAY.rises, "midnight: to the morning");
        assert.equal(untilWaking(at(DAY.sets - MINUTE), REST.least), DAY.length - DAY.sets + MINUTE + DAY.rises, "a minute before sunset: through the night to the morning");
        assert.equal(untilWaking(at(DAY.rises + MINUTE), REST.least), DAY.sets - DAY.rises - MINUTE);
    });

    it("has the host's player sleep in a room taken at an inn to the morning, mended, the war's turns played meanwhile", () => {
        const { host, me } = hosted();

        clockTo(host, at(55 * MINUTE));
        hurt(me);
        me.talkingTo = "someone";
        host.events = [];

        const turn = host.war.turn;
        const result = host.command(HOST_PLAYER, { type: "effect", effect: { rent: "room", price: 8 } });
        const events = host.advance(STEP_MS);

        assert.deepEqual(result, { ok: true });
        assert.equal(timeOfDay(elapsedOf(host.war)) - DAY.rises < STEP_MS + 1, true, `woken at sunrise: ${timeOfDay(elapsedOf(host.war)) / MINUTE}`);
        assert.equal(host.war.turn - turn, 14, "the war's 14 turns played");
        assert.ok(me.hp === me.maxHp && me.stamina === me.maxStamina);
        assert.ok(events.some(({ type, id, where, passed }) => type === "slept" && id === HOST_PLAYER && where === "room" && passed === 14 * MINUTE));
        assert.ok(events.filter(({ type }) => type === "turn").length >= 1);
    });

    it("makes camp out in the wilds: slept by to the evening, its fire burning a while after and lighting the dark round it", () => {
        const { host, me, outside } = hosted();

        outside(me);
        clockTo(host, at(30 * MINUTE));
        hurt(me);

        assert.deepEqual(host.command(HOST_PLAYER, { type: "camp" }), { ok: true });
        assert.equal(timeOfDay(elapsedOf(host.war)), DAY.sets, "woken at sunset");
        assert.ok(me.hp === me.maxHp && me.stamina === me.maxStamina);

        const [camp] = host.campfires;

        assert.equal(host.campfires.length, 1);
        assert.equal(camp.player, HOST_PLAYER);
        assert.ok(Math.hypot(camp.fire[0] - me.x, camp.fire[1] - me.y) < 2 && Math.hypot(camp.tent.at[0] - me.x, camp.tent.at[1] - me.y) < 3);

        // (Kept with the world, and carried on from)
        assert.deepEqual(Host.restore(buildWorld({ seed: 2 }), host.snapshot()).campfires, host.campfires);

        // (Into the night: the fire lighting what's round it)
        clockTo(host, at(58 * MINUTE));
        host.advance(STEP_MS);
        assert.ok(host.battle.light.lit.some(([x, y]) => x === camp.fire[0] && y === camp.fire[1]), "the camp's fire lights the dark");

        // (Burnt out after a while)
        for (let t = 0; t < REST.burns; t += 1000) {
            host.advance(1000);
        }

        assert.equal(host.campfires.length, 0);
    });

    it("won't make camp in a settlement, indoors, in a fight or with anything hostile near", () => {
        const { host, me, world, outside } = hosted();
        const turn = host.war.turn;

        put(me, world.stamp.middle);
        assert.deepEqual(host.command(HOST_PLAYER, { type: "camp" }), { ok: false, reason: "settlement" });

        outside(me);
        host.battle.add({ id: "wolf-near", kind: "beast", weapon: "wolf", team: WILD, square: [me.square[0] + 20, me.square[1]], ai: "wild", wild: { creature: "wolf", tier: 1, temper: "aggressive", guard: 0, roam: 4, leash: 10, pack: "p", leader: null, menace: true, unique: false, darkSight: true } });
        assert.deepEqual(host.command(HOST_PLAYER, { type: "camp" }), { ok: false, reason: "hostiles" });
        host.battle.remove("wolf-near");

        me.target = "someone";
        assert.deepEqual(host.command(HOST_PLAYER, { type: "camp" }), { ok: false, reason: "fighting" });
        me.target = null;

        me.map = "taproom";
        assert.deepEqual(host.command(HOST_PLAYER, { type: "camp" }), { ok: false, reason: "outdoors" });
        me.map = "town";

        assert.equal(host.war.turn, turn, "no time passed");
        assert.equal(host.campfires.length, 0);

        for (const reason of ["settlement", "hostiles", "fighting", "outdoors"]) {
            assert.equal(typeof REFUSALS[reason], "string");
        }

        // (Far enough off: made)
        assert.deepEqual(host.command(HOST_PLAYER, { type: "camp" }), { ok: true });
    });

    it("leaves the time alone when someone who's joined sleeps: they rest", () => {
        const { host, me, outside } = hosted();

        host.join({ id: "guest-1", hero: { ...HERO, name: "Bryn", race: "human" } });

        const guest = host.battle.actor("guest-1");

        clockTo(host, at(30 * MINUTE));
        outside(guest, 6);
        outside(me);
        hurt(guest);

        const elapsed = elapsedOf(host.war);

        assert.deepEqual(host.command("guest-1", { type: "camp" }), { ok: true });
        assert.equal(elapsedOf(host.war), elapsed, "a guest's sleep passes no time");
        assert.equal(guest.hp, guest.maxHp, "but they rest");
        assert.equal(host.campfires.length, 1);

        assert.deepEqual(host.command(HOST_PLAYER, { type: "camp" }), { ok: true });
        assert.equal(timeOfDay(elapsedOf(host.war)), DAY.sets, "the host's: woken at sunset");
        assert.equal(host.campfires.length, 2);
    });

    it("has every copy of a world opened to others pass the time alike when its host sleeps", () => {
        const { host, me, outside } = hosted();
        const sent = [];
        const hosting = new Hosting(host, { send: (peer, text) => sent.push({ to: peer, text }) });
        const joining = new Joining({ send: (text) => sent.push({ from: "p1", text }) });
        const deliver = () => {
            while (sent.length) {
                const { to, from, text } = sent.shift();

                if (from) {
                    hosting.hear(from, text);
                } else if (to === "p1") {
                    joining.hear(text);
                }
            }
        };

        // (Out in the wilds before anyone joins: sent with the world)
        outside(me);
        clockTo(host, at(30 * MINUTE));
        joining.onWelcome = ({ seed, race, snapshot }) => joining.attach(Host.restore(buildWorld({ seed, race }), snapshot));
        joining.hello({ hero: { ...HERO, name: "Bryn", race: "human" }, progress: { gold: 50 } });
        deliver();

        assert.deepEqual(host.command(HOST_PLAYER, { type: "camp" }), { ok: true });

        for (let k = 0; k < 20; k++) {
            host.advance(STEP_MS);
        }

        hosting.flush();
        deliver();

        while (joining.step()) {
            deliver();
        }

        assert.equal(timeOfDay(elapsedOf(host.war)) >= DAY.sets, true);
        assert.equal(elapsedOf(joining.host.war), elapsedOf(host.war), "the same hour in both");
        assert.deepEqual(joining.host.campfires, host.campfires);
        assert.equal(joining.host.checksum(), host.checksum());
    });
});
