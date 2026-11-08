// Horses (core/mounts.js): bought at a stable, kept as a mount whistle (core/progress.js), called
// up out of the ground and ridden in the battle (battle.js mount, dismount, #ride, #horseStruck)
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Battle, STEP_MS, TOSS } from "../client/js/core/battle.js";
import { WILD } from "../client/js/core/creatures.js";
import { HOST_PLAYER, Host } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { carries, COATS, holds, horseFrom, horseHealth, horseOf, HORSE_NAMES, MANES, MOUNT, nextPhase, out, phaseLength, STABLE } from "../client/js/core/mounts.js";
import { alike, ITEMS, itemLabel, thingOf } from "../client/js/core/progress.js";
import { createRandom } from "../client/js/core/random.js";
import { parseGrid } from "./helpers.js";

// An open field (no walls, nothing in the way) `size` squares across
const field = (size) => ({ blocked: parseGrid(Array.from({ length: size }, () => ".".repeat(size))).map((row) => Uint8Array.from(row)) });

function run(battle, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...battle.advance(STEP_MS));
    }

    return events;
}

const HERO_ADA = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

function runHost(host, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...host.advance(STEP_MS));
    }

    return events;
}

const HORSE = Object.freeze({ id: "h1", name: "Bramble", coat: "dapple", mane: "dark", tint: "#2a211b", fallen: false });

// A player on a field, their horse called and up in the saddle (`hp`: its health)
function riding({ hp = 75, seed = 3, size = 60 } = {}) {
    const battle = new Battle(field(size), { seed });
    const me = battle.add({ id: "me", kind: "player", weapon: "sword", team: "hero", square: [20, 30] });

    battle.mount("me", HORSE, { hp, maxHp: hp });
    run(battle, MOUNT.rise + MOUNT.mount + STEP_MS);
    assert.equal(me.mount.phase, "riding");

    return { battle, me };
}

describe("horses (core/mounts.js)", () => {
    it("draws a horse's coat, mane, its tint and its name from the random it's given, the same for the same draws", () => {
        const one = horseFrom(createRandom(7), "w1");
        const again = horseFrom(createRandom(7), "w1");

        assert.deepEqual(one, again);
        assert.ok(COATS.includes(one.coat));
        assert.ok(MANES[one.mane].tints.includes(one.tint));
        assert.ok(HORSE_NAMES.includes(one.name));
        assert.equal(one.fallen, false);

        // (Over many, every coat and both manes come up)
        const random = createRandom(11);
        const many = Array.from({ length: 400 }, (_, k) => horseFrom(random, `w${k}`));

        assert.deepEqual(new Set(many.map(({ coat }) => coat)), new Set(COATS));
        assert.deepEqual(new Set(many.map(({ mane }) => mane)), new Set(Object.keys(MANES)));
    });

    it("keeps only what a horse has, of the kinds it has (horseOf)", () => {
        assert.equal(horseOf(null), null);
        assert.equal(horseOf({ name: "No id" }), null);
        assert.deepEqual(horseOf(HORSE), HORSE);
        assert.deepEqual(horseOf({ id: "x", name: 5, coat: "zebra", mane: "dark", tint: "#ffffff", fallen: 1, extra: true }), { id: "x", name: HORSE_NAMES[0], coat: COATS[0], mane: "dark", tint: MANES.dark.tints[0], fallen: true });
    });

    it("goes rising, mounting, riding; then dismounting (quick to fight), sinking, gone; or fallen, then gone", () => {
        assert.equal(nextPhase("rising"), "mounting");
        assert.equal(nextPhase("mounting"), "riding");
        assert.equal(nextPhase("riding"), null);
        assert.equal(nextPhase("dismounting"), "sinking");
        assert.equal(nextPhase("sinking"), null);
        assert.equal(phaseLength({ phase: "riding" }), Infinity);
        assert.equal(phaseLength({ phase: "dismounting", quick: true }), MOUNT.hop);
        assert.equal(phaseLength({ phase: "dismounting", quick: false }), MOUNT.dismount);
        assert.equal(phaseLength({ phase: "fallen" }), MOUNT.fall + MOUNT.sink);

        // (Under its rider, taking their blows, rising to riding; its rider held getting up or down)
        assert.deepEqual(["rising", "mounting", "riding", "dismounting", "sinking", "fallen"].map((phase) => [carries({ phase }), holds({ phase }), out({ phase })]), [
            [true, true, true],
            [true, true, true],
            [true, false, true],
            [false, true, true],
            [false, false, false],
            [false, false, false],
        ]);
        assert.equal(carries(null), false);
        assert.equal(horseHealth(50), 75);
        assert.deepEqual(STABLE, { price: 400, revive: 100 });
    });
});

describe("the mount whistle (core/progress.js ITEMS)", () => {
    it("keeps its own horse, never stacking with another's, and is named for it", () => {
        const def = ITEMS.mountWhistle;

        assert.equal(def.whistle, true);
        assert.equal(def.price, STABLE.price);

        const whistle = thingOf({ id: "mountWhistle", horse: HORSE, unique: "w-1" });
        const other = thingOf({ id: "mountWhistle", horse: { ...HORSE, id: "h2", name: "Wren" }, unique: "w-2" });

        assert.deepEqual(whistle.horse, HORSE);
        assert.equal(itemLabel(whistle), "Mount whistle (Bramble)");
        assert.equal(itemLabel(other), "Mount whistle (Wren)");
        assert.equal(alike(whistle, other), false);
        assert.equal(alike(whistle, thingOf({ id: "mountWhistle", horse: HORSE, unique: "w-1" })), true);
    });
});

describe("riding (battle.js mount)", () => {
    it("rises at its rider's side, holds them while they get up, then carries them from where it stood, each phase told", () => {
        const battle = new Battle(field(60), { seed: 3 });
        const me = battle.add({ id: "me", kind: "player", weapon: "sword", team: "hero", square: [20, 30] });
        const mount = battle.mount("me", HORSE, { hp: 75, maxHp: 75 });

        assert.equal(mount.phase, "rising");
        assert.equal(mount.side, "left");
        assert.ok(Math.abs(Math.hypot(mount.spot[0] - me.x, mount.spot[1] - me.y) - MOUNT.beside) < 1e-9);
        // (A second call while it's out: none)
        assert.equal(battle.mount("me", HORSE, { hp: 75, maxHp: 75 }), null);

        // (Told to walk off as it rises: held till they're up)
        battle.command("me", { type: "move", to: [40, 30] });

        const events = run(battle, MOUNT.rise + MOUNT.mount - 2 * STEP_MS);

        assert.deepEqual([me.x, me.y], [20.5, 30.5]);
        assert.deepEqual(events.filter(({ type }) => type === "mount").map(({ phase }) => phase), ["rising", "mounting"]);

        const after = run(battle, 3 * STEP_MS);
        const up = after.find(({ type, phase }) => type === "mount" && phase === "riding");

        assert.ok(up, "up in the saddle");
        assert.equal(me.mount.phase, "riding");
        // (Then off, where the horse stood)
        assert.ok(me.x > mount.spot[0] - 0.01);
    });

    it("carries them MOUNT.speed times as fast, walking and running, sparing them some of a run's stamina", () => {
        const onFoot = new Battle(field(400), { seed: 3 });
        const walker = onFoot.add({ id: "me", kind: "player", weapon: "sword", team: "hero", square: [20, 30] });
        const { battle, me } = riding({ size: 400 });
        const [x0, x1] = [walker.x, me.x];

        onFoot.command("me", { type: "move", to: [190, 30] });
        battle.command("me", { type: "move", to: [190, 30] });
        run(onFoot, 4000);
        run(battle, 4000);

        const ratio = (me.x - x1) / (walker.x - x0);

        assert.ok(Math.abs(ratio - MOUNT.speed) < 0.05, `rode ${(me.x - x1).toFixed(2)} m to ${(walker.x - x0).toFixed(2)} on foot`);

        // (Running: as much faster, its stamina going half as fast)
        const runner = new Battle(field(400), { seed: 3 });
        const foot = runner.add({ id: "me", kind: "player", weapon: "sword", team: "hero", square: [20, 30] });
        const ridden = riding({ size: 400 });

        runner.command("me", { type: "move", to: [390, 30], run: true });
        ridden.battle.command("me", { type: "move", to: [390, 30], run: true });
        run(runner, 3000);
        run(ridden.battle, 3000);

        const used = [foot.maxStamina - foot.stamina, ridden.me.maxStamina - ridden.me.stamina];

        assert.ok(Math.abs(used[1] / used[0] - MOUNT.stamina) < 0.05, `stamina used ${used}`);
    });

    it("gets them down at its side and sinks back into the ground, then is gone; quickly, getting down to fight", () => {
        const { battle, me } = riding();
        const before = [me.x, me.y];

        assert.equal(battle.dismount("me"), true);
        assert.equal(me.mount.phase, "dismounting");
        assert.deepEqual(me.mount.spot, before);
        assert.ok(Math.abs(Math.hypot(me.x - before[0], me.y - before[1]) - MOUNT.beside) < 1e-9);
        assert.equal(battle.dismount("me"), false);

        const events = run(battle, MOUNT.dismount + MOUNT.sink + 2 * STEP_MS);

        assert.deepEqual(events.filter(({ type }) => type === "mount").map(({ phase }) => phase), ["dismounting", "sinking", null]);
        assert.equal(me.mount, null);

        // (Quickly: down in MOUNT.hop)
        const quick = riding();

        quick.battle.dismount("me", { quick: true });
        run(quick.battle, MOUNT.hop + STEP_MS);
        assert.equal(quick.me.mount.phase, "sinking");

        // (Called back as it rises: sinking at once, its rider free)
        const called = new Battle(field(60), { seed: 3 });
        const caller = called.add({ id: "me", kind: "player", weapon: "sword", team: "hero", square: [20, 30] });

        called.mount("me", HORSE, { hp: 75, maxHp: 75 });
        run(called, 500);
        assert.equal(called.dismount("me"), true);
        assert.equal(caller.mount.phase, "sinking");
        assert.equal(holds(caller.mount), false);
    });

    it("takes the blows aimed at its rider; struck down, it throws them, lies a while and sinks away", () => {
        // (Shot at from out of the rider's reach: they'd get down to fight one in it)
        const { battle, me } = riding({ hp: 12 });
        const orc = battle.add({ id: "orc", kind: "orc", weapon: "bow", team: "orcs", square: [26, 30], hp: 500, armed: true });
        const hp = me.hp;

        battle.command("orc", { type: "engage", target: "me" });

        const events = [];

        for (let t = 0; t < 20000 && me.mount?.phase !== "fallen"; t += STEP_MS) {
            events.push(...battle.advance(STEP_MS));
        }

        const hits = events.filter(({ type, id }) => type === "hit" && id === "me");

        assert.ok(hits.length > 0 && hits.every(({ mount }) => mount), "every blow on the horse");
        assert.equal(me.hp, hp, "none on its rider");
        assert.equal(me.mount.phase, "fallen");
        assert.equal(me.mount.hp, 0);

        const thrown = events.find(({ type }) => type === "thrown");
        const blast = events.find(({ type, throws }) => type === "blast" && throws?.[0]?.id === "me");

        assert.equal(thrown.horse, HORSE.id);
        assert.ok(blast, "thrown as by a shove");
        assert.ok(Math.hypot(me.x - me.mount.spot[0], me.y - me.mount.spot[1]) > 1, "thrown clear of it");
        assert.ok(me.downUntil >= battle.time + TOSS.down - 2 * STEP_MS, "down a while");

        // (Thrown, the next blow's theirs)
        const later = [];

        for (let t = 0; t < 20000 && me.hp === hp; t += STEP_MS) {
            later.push(...battle.advance(STEP_MS));
        }

        assert.ok(me.hp < hp);
        assert.ok(later.some(({ type, id, mount }) => type === "hit" && id === "me" && !mount));

        // (The horse gone once it's lain and sunk)
        run(battle, MOUNT.fall + MOUNT.sink);
        assert.equal(me.mount, null);
        assert.equal(orc.dead, false);
    });

    it("gets its rider down first when they go to fight, quickly, and they strike once they're down", () => {
        const { battle } = riding();

        battle.add({ id: "orc", kind: "orc", weapon: "cleaver", team: "orcs", square: [22, 30], hp: 500 }).stunnedUntil = 1e9;
        battle.command("me", { type: "engage", target: "orc" });

        const events = run(battle, 4000);
        const down = events.find(({ type, phase }) => type === "mount" && phase === "dismounting");
        const attack = events.find(({ type, id }) => type === "attack" && id === "me");

        assert.ok(down?.quick, "down quickly");
        assert.ok(attack, "then at it");
        assert.ok(attack.time >= down.time + MOUNT.hop, `struck at ${attack.time}, down from ${down.time}`);
    });

    it("casts a spell cast on horseback once they're down", () => {
        const { battle, me } = riding();
        const orc = battle.add({ id: "orc", kind: "orc", weapon: "cleaver", team: "orcs", square: [26, 30], hp: 500 });

        orc.stunnedUntil = 1e9;
        assert.deepEqual(battle.cast("me", "fireball", "orc"), { ok: true, mounted: true });
        assert.equal(me.casting, null);

        const events = run(battle, MOUNT.hop + 2 * STEP_MS);
        const cast = events.find(({ type, id }) => type === "cast" && id === "me");

        assert.ok(cast, "cast once down");
        assert.equal(cast.spell, "fireball");
        assert.equal(me.mount.phase, "sinking");
    });

    it("sinks where it stood as its rider's carried off, or killed", () => {
        const { battle, me } = riding();
        const at = [me.x, me.y];

        battle.place("me", "town", [40, 40]);
        assert.equal(me.mount.phase, "sinking");
        assert.deepEqual(me.mount.spot, at);

        const killed = riding();

        killed.me.hp = 1;
        killed.battle.afflict("me", "poison", { damage: 5 });
        run(killed.battle, 3000);
        assert.equal(killed.me.dead, true);
        assert.notEqual(killed.me.mount?.phase ?? null, "riding");
    });

    it("keeps its horse in the battle's snapshot", () => {
        const { battle, me } = riding();
        const restored = Battle.restore(field(60), battle.snapshot());

        assert.deepEqual(restored.actor("me").mount, me.mount);
    });
});

describe("stables and whistles (host.js #stableService, #whistle)", () => {
    // The home town (a town: a stable by the road in), its player out in it with gold in hand
    function inTown({ gold = 1000, pack = [] } = {}) {
        const host = new Host(buildWorld({ seed: 2 }), { populate: false });

        host.join({ id: HOST_PLAYER, hero: HERO_ADA, progress: { gold, pack } });
        host.populate();
        Object.assign(host.battle.actor("orc") ?? {}, { dead: true, respawnAt: Infinity });
        runHost(host, 2000);

        return { host, player: host.players.get(HOST_PLAYER), me: host.battle.actor(HOST_PLAYER) };
    }

    const stablemaster = (host) => host.battle.actors.find(({ id }) => id.startsWith("stablemaster:"));

    function talkTo(host, id) {
        const npc = host.battle.actor(id);

        host.battle.place(HOST_PLAYER, npc.map, [npc.square[0], npc.square[1] + 2]);
        assert.equal(host.command(HOST_PLAYER, { type: "talk", with: id }).ok, true);
    }

    const whistles = (player) => player.progress.pack.filter((stack) => stack?.id === "mountWhistle");

    it("has a stablemaster before a stable in a town, selling a horse with its whistle for STABLE price", () => {
        const { host, player } = inTown();
        const master = stablemaster(host);

        assert.ok(master, "a stablemaster out");
        assert.equal(host.folk.get(master.id).role, "stablemaster");

        talkTo(host, master.id);

        const bought = host.command(HOST_PLAYER, { type: "effect", effect: { stable: "buy" } });

        assert.equal(bought.ok, true);
        assert.equal(player.progress.gold, 1000 - STABLE.price);
        assert.equal(whistles(player).length, 1);
        assert.deepEqual(whistles(player)[0].horse, bought.horse);
        assert.ok(COATS.includes(bought.horse.coat));

        // (A second: its own whistle, its own horse)
        const again = host.command(HOST_PLAYER, { type: "effect", effect: { stable: "buy" } });

        assert.equal(again.ok, true);
        assert.notEqual(again.horse.id, bought.horse.id);
        assert.equal(whistles(player).length, 2);

        // (Bound to them: not sold, dropped or given)
        const index = player.progress.pack.findIndex((stack) => stack?.horse?.id === bought.horse.id);

        assert.equal(host.command(HOST_PLAYER, { type: "drop", index, count: 1 }).reason, "bound");

        // (Not without the gold, nor from anyone but a stablemaster)
        player.progress.gold = 10;
        assert.equal(host.command(HOST_PLAYER, { type: "effect", effect: { stable: "buy" } }).reason, "gold");
    });

    it("calls its horse up under the open sky with its whistle, and sends it back with it again; never in a fight, nor another's while one's out", () => {
        const { host, player, me } = inTown();

        talkTo(host, stablemaster(host).id);
        host.command(HOST_PLAYER, { type: "effect", effect: { stable: "buy" } });
        host.command(HOST_PLAYER, { type: "effect", effect: { stable: "buy" } });
        host.command(HOST_PLAYER, { type: "talk", with: null });

        const [first, second] = whistles(player).map((stack) => player.progress.pack.indexOf(stack));

        assert.equal(host.command(HOST_PLAYER, { type: "use", index: first }).ok, true);
        assert.equal(me.mount.phase, "rising");
        assert.equal(me.mount.maxHp, horseHealth(me.maxHp));
        assert.equal(host.command(HOST_PLAYER, { type: "use", index: second }).reason, "otherHorse");
        // (The whistle kept)
        assert.equal(whistles(player).length, 2);

        runHost(host, MOUNT.rise + MOUNT.mount + 200);
        assert.equal(me.mount.phase, "riding");

        // (The Action Bar's whistle: the one whose horse is out)
        assert.equal(host.command(HOST_PLAYER, { type: "use", item: "mountWhistle" }).ok, true);
        assert.equal(me.mount.phase, "dismounting");
        runHost(host, MOUNT.dismount + MOUNT.sink + 200);
        assert.equal(me.mount, null);

        // (Not with a foe on them)
        const foe = host.battle.add({ id: "wolf", kind: "orc", weapon: "cleaver", team: WILD, square: [me.square[0] + 3, me.square[1]], hp: 500 });

        foe.target = me.id;
        assert.equal(host.command(HOST_PLAYER, { type: "use", index: first }).reason, "fighting");
        host.battle.remove("wolf");

        // (Nor indoors)
        const guild = [...host.world.interiors.buildings.values()].find(({ kind, place }) => kind === "guild" && place === "home");

        const outside = host.battle.links.find(({ id }) => id === guild.door.id).ends.find(({ map }) => map === "town");

        host.battle.place(HOST_PLAYER, "town", outside.squares[0]);
        host.command(HOST_PLAYER, { type: "enter", link: guild.door.id });
        runHost(host, 3000);
        assert.notEqual(me.map, "town");
        assert.equal(host.command(HOST_PLAYER, { type: "use", index: first }).reason, "noSky");
    });

    it("marks a horse fallen under its rider on its whistle, refuses to call it, and any stable brings it back for STABLE revive", () => {
        const { host, player, me } = inTown();

        talkTo(host, stablemaster(host).id);
        host.command(HOST_PLAYER, { type: "effect", effect: { stable: "buy" } });
        host.command(HOST_PLAYER, { type: "talk", with: null });

        const index = player.progress.pack.findIndex((stack) => stack?.horse);
        const { horse } = player.progress.pack[index];

        host.command(HOST_PLAYER, { type: "use", index });
        runHost(host, MOUNT.rise + MOUNT.mount + 200);

        // (Shot at till it falls, from where the archer can see them)
        const archer = host.battle.add({ id: "archer", kind: "orc", weapon: "bow", team: WILD, square: [me.square[0], me.square[1]], hp: 500, armed: true });
        const shot = [[0, 6], [6, 0], [-6, 0], [0, -6], [4, 4], [-4, 4]].find(([dx, dy]) => {
            host.battle.place(archer.id, "town", [me.square[0] + dx, me.square[1] + dy]);

            return host.battle.canSee(archer, me);
        });

        assert.ok(shot, "somewhere to shoot from");

        me.mount.hp = 3;
        host.battle.command("archer", { type: "engage", target: me.id });

        const events = [];

        for (let t = 0; t < 20000 && me.mount?.phase !== "fallen"; t += STEP_MS) {
            events.push(...host.advance(STEP_MS));
        }

        assert.equal(me.mount.phase, "fallen");
        assert.equal(player.progress.pack[index].horse.fallen, true);
        assert.ok(events.some(({ type, horse: id }) => type === "horseFell" && id === horse.id));
        host.battle.remove(archer.id);
        runHost(host, MOUNT.fall + MOUNT.sink + 3000);
        assert.equal(me.mount, null);
        assert.equal(host.command(HOST_PLAYER, { type: "use", index }).reason, "horseFallen");

        // (Brought back)
        assert.deepEqual(host.stableOffer(HOST_PLAYER).fallen, [{ id: horse.id, name: horse.name }]);
        talkTo(host, stablemaster(host).id);

        const gold = player.progress.gold;
        const back = host.command(HOST_PLAYER, { type: "effect", effect: { stable: "revive" } });

        assert.equal(back.ok, true);
        assert.equal(player.progress.gold, gold - STABLE.revive);
        assert.equal(player.progress.pack[index].horse.fallen, false);
        assert.equal(host.command(HOST_PLAYER, { type: "effect", effect: { stable: "revive" } }).reason, "unfallen");
    });
});
