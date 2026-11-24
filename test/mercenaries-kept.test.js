// Hired adventurers never lost (core/host.js; docs/WAR.md *Followers (M9)*, *Never lost*): one
// left in a dungeon as it's made again, or in a sealed room as it's let go of, brought out to
// their leader; one with no body in the battle given one again by them; magic leaving them behind
// only once it carries their leader off; any of those mending sent for, or let go, by name at the
// guild's desk, never another in their place; one following or mending never at their guild for
// hire too, whatever the world's forgotten, and one let go back there, for hire again (to the one
// who let them go, as they were); and one knocked down told so when they're given an order
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DOWNED, STEP_MS } from "../client/js/core/battle.js";
import { buildDungeon } from "../client/js/core/dungeons/build.js";
import { DELVES } from "../client/js/core/dungeons/play.js";
import { hypot } from "../client/js/core/exact.js";
import { nearestFree, squareKey, squaresOf } from "../client/js/core/grid.js";
import { recallPrice, hirePrice } from "../client/js/core/followers.js";
import { HIRES, HOST_PLAYER, Host, REFUSALS } from "../client/js/core/host.js";
import { characterFrom, rollFrom } from "../client/js/core/netplay.js";
import { buildWorld } from "../client/js/core/overworld.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });
const MERC = (over = {}) => ({ name: "Bram", calling: "warrior", sex: "m", seed: 7, people: "human", from: null, level: 3, xp: 400, wounds: 0, owed: 0, gear: { mainHand: null, body: null }, record: {}, called: null, picks: [], renowned: null, ...over });

function run(host, ms, me = null) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        if (me) {
            me.hp = me.maxHp;
        }

        events.push(...host.advance(STEP_MS));
    }

    return events;
}

const put = (actor, [x, y], map = actor.map) => Object.assign(actor, { map, square: [x, y], x: x + 0.5, y: y + 0.5, path: [], order: null, target: null });
const adventurer = ({ role, talk }) => role === "adventurer" || talk === "adventurer";

// Through a door or a flight: stood where one comes off it on this side, told to go through, and
// played on till they've crossed
function cross(host, me, link) {
    const end = link.ends.find(({ map }) => map === me.map);

    put(me, end.arrive);
    host.command(HOST_PLAYER, { type: "enter", link: link.id });

    for (let t = 0; t < 60000; t += 250) {
        if (run(host, 250, me).some(({ type, id }) => type === "cross" && id === HOST_PLAYER)) {
            return true;
        }
    }

    return false;
}

// Their player at the home guild's hall (as a character brings them: gold, who they lead, their
// roll), the guild's folk about them
function atTheGuild({ seed = 2, gold = 200, followers = [], roll = [] } = {}) {
    const host = new Host(buildWorld({ seed }), { populate: false });

    host.join({ id: HOST_PLAYER, hero: HERO, progress: { gold }, followers, roll });
    host.populate();
    Object.assign(host.battle.actor("orc"), { dead: true, respawnAt: Infinity });

    const guild = [...host.world.interiors.buildings.values()].find(({ kind, place }) => kind === "guild" && place === "home");

    host.command(HOST_PLAYER, { type: "enter", link: guild.door.id });
    host.command(HOST_PLAYER, { type: "stop" });
    run(host, 1000);

    return { host, guild, player: host.players.get(HOST_PLAYER), me: host.battle.actor(HOST_PLAYER) };
}

function talkTo(host, id) {
    const npc = host.battle.actor(id);

    host.command(HOST_PLAYER, { type: "talk", with: null });
    put(host.battle.actor(HOST_PLAYER), [npc.square[0], npc.square[1] + 2], npc.map);
    assert.equal(host.command(HOST_PLAYER, { type: "talk", with: id }).ok, true);
}

// The player in the dungeon nearest their start (one of two levels or more), its foes out of the
// way, those with them as asked: { host, me, site, building, delve, outside, ids }
function inADungeon({ followers }) {
    const world = buildWorld({ seed: 1 });
    const host = new Host(world, { populate: false });

    host.join({ id: HOST_PLAYER, hero: HERO, followers });
    host.populate();
    Object.assign(host.battle.actor("orc"), { dead: true, respawnAt: Infinity });

    const me = host.battle.actor(HOST_PLAYER);

    Object.assign(me, { hp: 1e6, maxHp: 1e6 });

    const [sx, sy] = world.start.at;
    const site = world.plan.sites
        .filter(({ kind }) => kind === "dungeon")
        .sort((a, b) => hypot(a.at[0] - sx, a.at[1] - sy) - hypot(b.at[0] - sx, b.at[1] - sy))
        .find((one) => buildDungeon({ seed: one.seed, theme: one.theme, tier: 1 }).levels.length >= 2);

    world.maps.town.sites.heartOf(site);

    const outside = world.maps.town.sites.set.get(site.id).entrance.outside;

    put(me, outside);
    run(host, 1500, me);

    const building = world.interiors.buildings.get(`site:${site.id}`);
    const delve = host.delveOf(site.id);

    assert.ok(cross(host, me, building.door), "(into the dungeon)");
    run(host, 1000, me);

    for (const [id, one] of [...host.wild]) {
        if (one.dungeon === site.id && host.battle.actor(id)) {
            Object.assign(host.battle.actor(id), { dead: true, respawnAt: Infinity });
        }
    }

    return { host, me, site, building, delve, outside, ids: [...host.followers.keys()] };
}

describe("hired adventurers never lost (core/host.js)", () => {
    it("are brought out of a dungeon made again to their leader: one told to wait there, one knocked down there (up again by them), one in a sealed room, a beast they've tamed", () => {
        const { host, me, building, delve, outside, ids } = inADungeon({ followers: [MERC(), MERC({ name: "Tam", seed: 8 }), MERC({ name: "Wren", seed: 9 }), { tamed: true, creature: "wolf", tier: 1, name: "Fang" }] });
        const [bram, tam, wren] = ids;
        const [fang] = [...host.companions].filter(([, one]) => one.tamed).map(([id]) => id);
        const floor = building.maps[0];

        // (A sealed room off its first floor, as #vaultMake records one, built by #vaultsAbout)
        const vault = { n: 900, card: "test", building: building.key, generation: building.generation ?? 0, level: 0, floor, door: { square: [...me.square], arrive: [...me.square], facing: 0 }, opens: "ward", open: true, took: [], woken: false, keepers: [], cleared: true, given: true };

        host.legends.vaults[vault.n] = vault;
        run(host, 1500, me);

        const room = `${floor}/vault-${vault.n}`;
        const inside = host.world.maps[room].marks["^"][0];

        put(host.battle.actor(wren), [inside[0], inside[1] - 2], room);

        for (const id of [bram, wren, fang]) {
            assert.equal(host.command(HOST_PLAYER, { type: "order", unit: id, order: "wait" }).ok, true);
        }

        // (Tam knocked down away from them, as a blow would: up again only a while after)
        const taken = new Set(host.battle.actors.filter((each) => each.map === me.map && each.id !== tam).map(({ square: [x, y] }) => squareKey(x, y)));

        put(host.battle.actor(tam), nearestFree(squaresOf(host.world.maps[me.map]), [me.square[0] + 10, me.square[1]], { taken }), me.map);
        host.battle.afflict(tam, "poison", { by: null, damage: 1e7 });
        run(host, 1500, me);
        assert.ok(host.battle.actor(tam).dead && host.battle.actor(tam).downed);
        assert.equal(host.command(HOST_PLAYER, { type: "order", unit: tam, order: "follow" }).reason, "downed", "(down: told so, not that he isn't theirs)");
        assert.ok(REFUSALS.downed);

        // Cleared, left, and made again
        delve.cleared = true;
        assert.ok(cross(host, me, building.door));
        put(me, [outside[0] + DELVES.far + 30, outside[1]]);

        const events = run(host, 2000, me);

        assert.ok(events.some(({ type, change }) => type === "dungeon" && change === "remade"));

        for (const id of [bram, tam, wren, fang]) {
            const actor = host.battle.actor(id);

            assert.ok(actor, `${id} still in the battle`);
            assert.equal(actor.map, me.map, `${id} by their leader`);
            assert.ok(hypot(actor.x - me.x, actor.y - me.y) < 8, `${id} near their leader`);
            assert.equal(host.waiting(id), false, `${id} following again`);
        }

        assert.deepEqual(host.mendingOf(HOST_PLAYER), [], "(none sent home)");
        assert.ok(host.battle.actor(tam).dead, "(Tam still down where he was brought)");

        run(host, DOWNED.ms, me);
        assert.ok(!host.battle.actor(tam).dead, "(and up again by them)");

        // (The sealed room let go of, coming back: nobody on a map that's gone)
        put(me, outside);
        run(host, 3000, me);
        assert.equal(host.world.maps[room], undefined);

        for (const id of [bram, tam, wren, fang]) {
            assert.ok(host.world.maps[host.battle.actor(id).map] || host.battle.actor(id).map === "town");
        }

        // (Each theirs to tell what to do)
        for (const id of [bram, tam, wren]) {
            assert.equal(host.command(HOST_PLAYER, { type: "order", unit: id, order: "follow" }).ok, true);
        }
    });

    it("given a body again by their leader when it's gone from the battle with them still in the company", () => {
        const { host, ids } = inADungeon({ followers: [MERC()] });
        const [id] = ids;
        const me = host.battle.actor(HOST_PLAYER);

        host.command(HOST_PLAYER, { type: "order", unit: id, order: "wait" });
        host.battle.remove(id);
        run(host, 500, me);

        const actor = host.battle.actor(id);

        assert.ok(actor && host.followers.has(id));
        assert.equal(actor.map, me.map);
        assert.equal(actor.kind, "follower");
        assert.equal(host.waiting(id), false);
        assert.equal(host.command(HOST_PLAYER, { type: "order", unit: id, order: "wait" }).ok, true);
    });

    it("left behind by magic only once it carries their leader off: none sent home when there's no room for them where it would", () => {
        const host = new Host(buildWorld({ seed: 2 }), { populate: false });

        host.join({ id: HOST_PLAYER, hero: HERO, progress: { pack: [{ id: "scrollOfSafety", count: 2 }] }, followers: [MERC()] });
        host.populate();
        Object.assign(host.battle.actor("orc"), { dead: true, respawnAt: Infinity });

        const me = host.battle.actor(HOST_PLAYER);
        const [id] = [...host.followers.keys()];
        const place = host.battle.place.bind(host.battle);
        const index = () => host.players.get(HOST_PLAYER).progress.pack.findIndex((stack) => stack?.id === "scrollOfSafety");

        // (Nowhere for them where they'd be carried)
        host.battle.place = (who, ...rest) => (who === HOST_PLAYER ? null : place(who, ...rest));
        assert.equal(host.command(HOST_PLAYER, { type: "use", index: index() }).ok, true);

        const nowhere = run(host, 4000, me);

        assert.ok(nowhere.some(({ type, change, why }) => type === "safety" && change === "lost" && why === "nowhere"));
        assert.ok(host.followers.has(id) && host.battle.actor(id), "(still with them)");
        assert.deepEqual(host.mendingOf(HOST_PLAYER), []);

        // (Carried: left behind, waiting at the guild)
        host.battle.place = place;
        host.battle.actor(HOST_PLAYER).square = [me.square[0] + 40, me.square[1]];
        Object.assign(me, { x: me.square[0] + 0.5, y: me.square[1] + 0.5 });
        assert.equal(host.command(HOST_PLAYER, { type: "use", index: index() }).ok, true);

        const carried = run(host, 4000, me);

        assert.ok(carried.some(({ type, id: who, why }) => type === "carried" && who === HOST_PLAYER && why === "safety"));
        assert.deepEqual(host.mendingOf(HOST_PLAYER), [id]);
    });

    it("sent for, or let go, by name at the guild's desk: any of those mending, not only the first; one no longer mending refused, never another in their place", () => {
        const { host, guild, player } = atTheGuild({ gold: 60, followers: [MERC({ name: "Mira", calling: "mage", level: 10, away: true }), MERC({ name: "Pip", calling: "rogue", level: 1, away: true, gear: { mainHand: null, body: { id: "leather", quality: "common" } } })] });
        const [mira, pip] = host.mendingOf(HOST_PLAYER);
        const receptionist = guild.folk.find(({ role }) => role === "receptionist");
        const price = (one) => recallPrice(hirePrice(HIRES[one.calling].price, one.level, Boolean(one.renowned)));

        assert.deepEqual(host.recallOffer(HOST_PLAYER), { id: mira, name: "Mira", price: price(host.mending.get(mira)) }, "(the first, unnamed)");
        assert.deepEqual(host.recallOffer(HOST_PLAYER, pip), { id: pip, name: "Pip", price: price(host.mending.get(pip)) });
        assert.equal(host.recallOffer(HOST_PLAYER, "follower-99"), null);
        assert.equal(host.recallOffer("someone-else", pip), null, "(only their own)");

        talkTo(host, receptionist.id);
        assert.equal(host.command(HOST_PLAYER, { type: "effect", effect: { recall: true } }).reason, "gold", "(Mira's too dear)");

        const back = host.command(HOST_PLAYER, { type: "effect", effect: { recall: pip } });

        assert.equal(back.ok, true, JSON.stringify(back));
        assert.equal(host.followers.get(back.follower).name, "Pip");
        assert.equal(player.progress.gold, 60 - price({ calling: "rogue", level: 1 }));
        assert.deepEqual(host.mendingOf(HOST_PLAYER), [mira], "(Mira mending still)");

        // (Pip's no longer mending: letting him go refused, Mira never let go in his place)
        assert.equal(host.command(HOST_PLAYER, { type: "effect", effect: { release: pip } }).reason, "recall");
        assert.deepEqual(host.mendingOf(HOST_PLAYER), [mira]);
        assert.deepEqual(player.roll, []);

        assert.equal(host.command(HOST_PLAYER, { type: "effect", effect: { release: mira } }).ok, true);
        assert.deepEqual(host.mendingOf(HOST_PLAYER), []);
        assert.deepEqual(player.roll.map(({ name, gone }) => ({ name, gone })), [{ name: "Mira", gone: "dismissed" }]);
    });

    it("let go in their guild's hall, back at their place in it at once, for hire again, as they were to the one who let them go; let go at the desk while mending, the same", () => {
        const { host, guild, player } = atTheGuild({ gold: 10_000 });
        const [one, two] = guild.folk.filter(adventurer);
        const hire = (folk) => {
            talkTo(host, folk.id);

            const result = host.command(HOST_PLAYER, { type: "effect", effect: { hire: true } });

            host.command(HOST_PLAYER, { type: "talk", with: null });

            return result;
        };

        host.mostFollowers = () => 2;

        const [first, second] = [one, two].map(hire);

        assert.ok(first.ok && second.ok);
        assert.ok(!host.folk.has(one.id) && !host.battle.actor(one.id));
        host.followers.get(first.follower).called = "Bran";

        host.command(HOST_PLAYER, { type: "order", unit: first.follower, order: "dismiss" });

        const events = run(host, 500);

        assert.ok(host.folk.has(one.id) && host.battle.actor(one.id), "(back at their place in the hall)");
        assert.deepEqual(host.battle.actor(one.id).square, one.square);
        assert.ok(events.some(({ type, key, folk }) => type === "peopled" && key === guild.key && folk.includes(one.id)), "(told, to be drawn)");
        assert.equal(host.hireOffer(HOST_PLAYER, one.id).back, true);

        const again = hire(one);

        assert.equal(again.ok, true);
        assert.equal(host.followers.get(again.follower).called, "Bran");
        assert.deepEqual(player.roll, []);

        // (Sent home to mend, then let go at the desk: back in the hall the same)
        const receptionist = guild.folk.find(({ role }) => role === "receptionist");
        const mending = host.followers.get(second.follower);

        host.followers.delete(second.follower);
        host.battle.remove(second.follower);
        host.mending.set(second.follower, { ...mending, since: 0 });
        talkTo(host, receptionist.id);
        assert.equal(host.command(HOST_PLAYER, { type: "effect", effect: { release: second.follower } }).ok, true);
        assert.ok(host.folk.has(two.id) && host.battle.actor(two.id));
        assert.equal(host.hireOffer(HOST_PLAYER, two.id).back, true);
    });

    it("never at their guild for hire while they follow or mend, nor once fallen for good, the world made afresh (a game started again); let go, back where they were found, for hire again, to the one who let them go as they were", () => {
        const first = atTheGuild();
        const [one, two, three, four] = first.guild.folk.filter(adventurer);
        const hire = (host, folk) => {
            talkTo(host, folk.id);

            const result = host.command(HOST_PLAYER, { type: "effect", effect: { hire: true } });

            host.command(HOST_PLAYER, { type: "talk", with: null });

            return result;
        };

        first.player.progress.gold = 10_000;
        first.host.mostFollowers = () => 4;

        const hired = [one, two, three, four].map((folk) => hire(first.host, folk));

        assert.ok(hired.every(({ ok }) => ok), JSON.stringify(hired));

        // (Three, grown and renamed, let go: back on the guild's books, as they were)
        const tam = first.host.followers.get(hired[2].follower);

        Object.assign(tam, { xp: tam.xp + 50, called: "Old Three", record: { ...tam.record, kills: 42 } });
        first.host.command(HOST_PLAYER, { type: "order", unit: hired[2].follower, order: "dismiss" });
        assert.deepEqual(first.player.roll.map(({ from, gone }) => ({ from, gone })), [{ from: three.id, gone: "dismissed" }], "(who they were among the folk, on the roll)");
        assert.equal(first.player.roll[0].kept.called, "Old Three");
        assert.ok(!first.host.hired.has(three.id), "(no longer held hired: at their guild the next time it's peopled)");

        // (Four fallen for good, where the world's rule has it: on the roll, never back)
        first.player.roll = [{ name: four.name, calling: "warrior", level: 2, byname: null, gone: "fallen", kills: 3, day: 1, from: four.id }, ...first.player.roll];
        first.host.followers.delete(hired[3].follower);
        first.host.battle.remove(hired[3].follower);

        const character = first.host.characterOf(first.player);

        character.followers[1].away = true;

        // (Carried on as a character brings it: core/netplay.js)
        const brought = characterFrom(character);

        assert.deepEqual(brought.roll.map(({ from }) => from), [four.id, three.id]);
        assert.deepEqual({ name: brought.roll[1].kept.name, called: brought.roll[1].kept.called, kills: brought.roll[1].kept.record.kills, gear: brought.roll[1].kept.gear }, { name: three.name, called: "Old Three", kills: 42, gear: { mainHand: null, body: null } });
        assert.equal(brought.roll[0].kept, undefined, "(none kept of one fallen for good)");
        assert.deepEqual(rollFrom([{ name: "X", calling: "warrior", level: 1, gone: "fallen", kills: 0, day: 1, from: 7 }])[0].from, null);

        const again = atTheGuild({ gold: 10_000, followers: brought.followers, roll: brought.roll });

        for (const folk of [one, two, four]) {
            assert.ok(!again.host.folk.has(folk.id) && !again.host.battle.actor(folk.id), `${folk.name} not at the guild`);
            assert.equal(again.host.hireOffer(HOST_PLAYER, folk.id), null);
        }

        // Three back where they were found, for hire again: to the one who let them go, as they were
        assert.ok(again.host.folk.has(three.id), "(three at the guild again)");

        const offer = again.host.hireOffer(HOST_PLAYER, three.id);

        assert.equal(offer.back, true);
        again.host.mostFollowers = () => 4;

        const rehired = hire(again.host, three);
        const back = again.host.followers.get(rehired.follower);

        assert.equal(rehired.ok, true, JSON.stringify(rehired));
        assert.deepEqual({ called: back.called, kills: back.record.kills, from: back.from }, { called: "Old Three", kills: 42, from: three.id });
        assert.ok(back.level >= offer.level && back.xp >= tam.xp);
        assert.deepEqual(again.player.roll.map(({ from }) => from), [four.id], "(off their roll, theirs again)");
        assert.ok(again.host.hired.has(three.id));
    });
});
