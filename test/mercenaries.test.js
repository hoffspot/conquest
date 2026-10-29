// Mercenaries that grow (client/js/core/followers.js, core/host.js, core/battle.js; docs/WAR.md
// *Mercenaries that grow*): a hired adventurer grows a level at a time, no higher than their
// leader's might and Command let them, offered at the guilds a level under that and dearer the
// higher; knocked down when they fall, up again a while after, wounded, and home to mend after
// the third (sent for, or let go, at any guild), dead only where the world's rule has it; taking a
// share of the gold won with them; wearing what they're given; and remembered: their record,
// their byname, their name, their trust's ways, a veteran's gift, the roll of those who've left
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DOWNED, STEP_MS } from "../client/js/core/battle.js";
import { bynameOf, capOf, freshRecord, GIFTS, hirePrice, LEVEL_XP, levelOfXp, levelPower, MENDING, MERC_GEAR, mercenaryOf, MERCENARY, recallPrice, renownOf, SHARE, sharesOf, trustOf, wearable, xpToNext } from "../client/js/core/followers.js";
import { nearestFree, squareKey, squaresOf } from "../client/js/core/grid.js";
import { HIRES, HOST_PLAYER, Host, ROLL_MOST, SNAPSHOT_STEPS } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { QUALITIES, RANKS } from "../client/js/core/progress.js";
import { decode, encode } from "../client/js/core/wire.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });
const made = (quality) => QUALITIES[quality]?.power ?? 1;

function run(host, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...host.advance(STEP_MS));
    }

    return events;
}

const put = (actor, map, [x, y]) => Object.assign(actor, { map, square: [x, y], x: x + 0.5, y: y + 0.5, path: [], order: null, target: null });
const adventurer = ({ role, talk }) => role === "adventurer" || talk === "adventurer";

// A world with its player in the home guild's hall, gold in hand (and how commanding they are,
// what's in their pack, who they lead), by the guild's adventurers and its receptionist
function atTheGuild({ gold = 200, command = 0, pack = [], followers = [] } = {}) {
    const host = new Host(buildWorld({ seed: 2 }), { populate: false });

    host.join({ id: HOST_PLAYER, hero: HERO, progress: { gold, skills: { command }, pack }, followers });
    host.populate();
    Object.assign(host.battle.actor("orc"), { dead: true, respawnAt: Infinity });

    const guild = [...host.world.interiors.buildings.values()].find(({ kind, place }) => kind === "guild" && place === "home");

    host.command(HOST_PLAYER, { type: "enter", link: guild.door.id });
    host.command(HOST_PLAYER, { type: "stop" });
    run(host, 1000);

    return { host, guild, player: host.players.get(HOST_PLAYER), me: host.battle.actor(HOST_PLAYER) };
}

// Talk to one of the folk (by id), from two squares off
function talkTo(host, id) {
    const npc = host.battle.actor(id);

    host.command(HOST_PLAYER, { type: "talk", with: null });
    put(host.battle.actor(HOST_PLAYER), npc.map, [npc.square[0], npc.square[1] + 2]);
    assert.equal(host.command(HOST_PLAYER, { type: "talk", with: id }).ok, true);
}

// Hire one of the guild's adventurers (by their place in its folk): what the host said, and them
function hire(host, guild, k = 0) {
    const one = guild.folk.filter(adventurer)[k];

    talkTo(host, one.id);

    const result = host.command(HOST_PLAYER, { type: "effect", effect: { hire: true } });

    host.command(HOST_PLAYER, { type: "talk", with: null });

    return { one, result, follower: host.battle.actor(result.follower) };
}

// A world with its player out in the town, leading those given (as a character brings them)
function leading(followers, { command = 0, pack = [], rules = undefined } = {}) {
    const host = new Host(buildWorld({ seed: 2 }), { populate: false, ...(rules ? { rules } : {}) });

    host.join({ id: HOST_PLAYER, hero: HERO, progress: { gold: 0, skills: { command }, pack, gear: { mainHand: { id: HERO.weapon } } }, followers });
    host.populate();
    Object.assign(host.battle.actor("orc"), { dead: true, respawnAt: Infinity });

    const ids = [...host.followers.keys()];

    return { host, ids, player: host.players.get(HOST_PLAYER), me: host.battle.actor(HOST_PLAYER) };
}

// A brigand set down on a free square near someone (`away` squares off, east), as strong as asked
function brigandBy(host, actor, { away = 1, hp = 5000, id = "brigand", creature = null } = {}) {
    const taken = new Set(host.battle.actors.filter((each) => each.map === actor.map && each.id !== id).map(({ square: [x, y] }) => squareKey(x, y)));
    const square = nearestFree(squaresOf(host.world.maps?.[actor.map] ?? host.world), [actor.square[0] + away, actor.square[1]], { taken });

    host.battle.add({ id, kind: "orc", name: "Brigand", weapon: "cleaver", team: "wild", square, map: actor.map, ai: null });
    Object.assign(host.battle.actor(id), { hp, maxHp: hp });

    if (creature) {
        host.wild.set(id, { creature, tier: 1, pack: id, camp: null, lair: null, master: false });
    }

    return host.battle.actor(id);
}

const followerEvents = (events, change) => events.filter((event) => event.type === "follower" && event.change === change);

// One of the player's own set down `away` squares east of them, a brigand beside them: the
// brigand's (a player strikes at a foe by them, and it at them)
function fightAway(host, unit, { away = 6, ...brigand } = {}) {
    const me = host.battle.actor(HOST_PLAYER);
    const taken = new Set(host.battle.actors.filter((each) => each.map === me.map && each.id !== unit.id).map(({ square: [x, y] }) => squareKey(x, y)));

    put(unit, me.map, nearestFree(squaresOf(host.world.maps?.[me.map] ?? host.world), [me.square[0] + away, me.square[1]], { taken }));

    return brigandBy(host, unit, { away: 1, ...brigand });
}

// (The foes a hired adventurer must bring down with its leader to trust them: the first rank)
const TRUST_RANK = 30;

describe("mercenaries that grow (core/followers.js)", () => {
    it("grow a level at a time, ten at most, each 50 L (L + 1) experience more, each level as much again stronger", () => {
        assert.deepEqual([1, 2, 3, 9].map(xpToNext), [100, 300, 600, 4500]);
        assert.deepEqual(LEVEL_XP, [0, 0, 100, 400, 1000, 2000, 3500, 5600, 8400, 12000, 16500]);
        assert.deepEqual([0, 99, 100, 399, 400, 16499, 16500, 1e9].map((xp) => levelOfXp(xp)), [1, 1, 2, 2, 3, 9, 10, 10]);
        assert.equal(levelOfXp(1e9, 4), 4, "(no higher than the most they can be)");
        assert.equal(levelPower(1), 1);
        assert.ok(Math.abs(levelPower(10) - 1.18 ** 9) < 1e-9, `${levelPower(10)}`);
        assert.equal(levelPower(12), levelPower(10));

        const fresh = mercenaryOf({ calling: "warrior", level: 1 });
        const veteran = mercenaryOf({ calling: "warrior", level: 10 });

        assert.equal(fresh.hp, 50);
        assert.equal(veteran.hp, Math.round(50 * levelPower(10)));
        assert.ok(Math.abs(veteran.power.melee / fresh.power.melee - levelPower(10)) < 1e-9);
        assert.ok(veteran.cooldown < fresh.cooldown, "(their ability sooner from level four)");
        assert.equal(mercenaryOf({ calling: "rogue", level: 10 }).dodge, 0.2, "(a rogue's mastery)");
    });

    it("can be led no higher than the land their leader's might is fit for and half their Command more; dearer the higher, a renowned one dearer still; called back from mending for a quarter of it", () => {
        assert.deepEqual([capOf(0), capOf(0, 1), capOf(0, 2), capOf(2, 3), capOf(10, 5), capOf(null, null)], [1, 2, 2, 5, 10, 1]);
        assert.equal(hirePrice(40, 1), 40);
        assert.equal(hirePrice(40, 4), 320);
        assert.equal(hirePrice(40, 10), 1265, "(about thirty times a fresh one's)");
        assert.equal(hirePrice(40, 1, true), 60);
        assert.equal(hirePrice(30, 3, true), 235);
        assert.equal(recallPrice(320), 80);
        assert.equal(recallPrice(10), 5, "(never less than five)");
    });

    it("wears a weapon of its calling's kind and body armour, neither made for anyone ten times mightier; its armour taking no more than the player's can", () => {
        assert.equal(wearable({ id: "sword" }, { weapon: "sword" }), null);
        assert.equal(wearable({ id: "mail", level: 10 }, { weapon: "bow", level: 1 }), null);
        assert.equal(wearable({ id: "mail", level: 11 }, { weapon: "bow", level: 1 }), "level");
        assert.equal(wearable({ id: "mail", level: 11 }, { weapon: "bow", level: 2 }), null);
        assert.equal(wearable({ id: "bow" }, { weapon: "sword" }), "calling");
        assert.equal(wearable({ id: "nasalHelm" }, { weapon: "sword" }), "slot");
        assert.equal(wearable({ id: "healingDraught" }, { weapon: "sword" }), "slot");

        const plated = mercenaryOf({ calling: "warrior", level: 1, gear: { mainHand: null, body: { id: "plate", quality: "legendary" } }, picks: ["sworn"] }, { made });

        assert.ok(Math.abs(plated.armor - (0.2 * made("legendary") + 0.05)) < 1e-9, `${plated.armor}`);
        assert.equal(mercenaryOf({ calling: "warrior", level: 10, gear: { mainHand: null, body: { id: "plate", quality: "legendary", level: 100 } }, picks: ["sworn"] }, { made }).armor, MERC_GEAR.armor);
        assert.ok(mercenaryOf({ calling: "warrior", gear: { body: { id: "mail" } } }, { made }).armor > 0);

        const armed = mercenaryOf({ calling: "warrior", gear: { mainHand: { id: "sword", quality: "rare" }, body: null } }, { made });

        assert.ok(Math.abs(armed.power.melee - made("rare")) < 1e-9, "(their weapon's make in their blows)");
    });

    it("is wounded a tenth at a fall, and can't go on with three", () => {
        const hp = (wounds) => mercenaryOf({ calling: "warrior", wounds }).hp;

        assert.deepEqual([0, 1, 2, 5].map(hp), [50, 45, 40, 40]);
        assert.equal(MENDING.most, 3);
    });

    it("takes five in a hundred of the gold won with it, a point less each rank of its trust; all of them together never more than a fifth; a little at a time adding up", () => {
        assert.deepEqual(sharesOf(100, [{ id: "a" }]), [{ id: "a", gold: 5, owed: 0 }]);
        assert.deepEqual(sharesOf(10, [{ id: "a" }]), [{ id: "a", gold: 0, owed: 5000 }]);
        assert.deepEqual(sharesOf(10, [{ id: "a", owed: 5000 }]), [{ id: "a", gold: 1, owed: 0 }], "(two halves of a gold piece, one)");
        assert.deepEqual(sharesOf(100, [{ id: "a", trust: 3 }]), [{ id: "a", gold: 2, owed: 0 }]);
        assert.deepEqual(
            sharesOf(1000, ["a", "b", "c", "d", "e"].map((id) => ({ id }))).map(({ gold }) => gold),
            [40, 40, 40, 40, 40],
            "(five of them: a fifth in all)",
        );
        assert.equal(SHARE.most, 20);
        assert.deepEqual([0, 29, 30, 119, 120, 300, 1e6].map(trustOf), [0, 0, 1, 1, 2, 3, 3]);
    });

    it("earns a byname by what it's done: the mightiest it's brought down first, then many foes, getting up again and again, so many of a kind", () => {
        assert.equal(bynameOf(freshRecord()), null);
        assert.equal(bynameOf({ ...freshRecord(), kills: 100 }), "the Bloodied");
        assert.equal(bynameOf({ ...freshRecord(), kills: 300 }), "the Grim");
        assert.equal(bynameOf({ ...freshRecord(), rises: 10, kills: 100 }), "the Unbroken");
        assert.equal(bynameOf({ ...freshRecord(), slain: { Wolfsbane: 25 }, kills: 100 }), "Wolfsbane");
        assert.equal(bynameOf({ ...freshRecord(), best: { name: "Troll", power: 70 }, kills: 300 }), "the Dauntless");
    });

    it("is renowned one in six or so, by its seed: the same in every browser", () => {
        const seeds = Array.from({ length: 600 }, (_, k) => k + 1);
        const renowned = seeds.filter((seed) => renownOf(seed));

        assert.ok(renowned.length > 60 && renowned.length < 150, `${renowned.length}`);
        assert.deepEqual(seeds.map(renownOf), seeds.map(renownOf));
    });
});

describe("mercenaries that grow, in play (core/host.js)", () => {
    it("are offered at the guild a level under the most their hirer can lead, a renowned one at it; hired at that level, for that price", () => {
        const { host, guild, player } = atTheGuild({ gold: 5000 });
        const offer = (one) => host.hireOffer(HOST_PLAYER, one.id);
        const adventurers = guild.folk.filter(adventurer);

        assert.equal(host.capFor(HOST_PLAYER), 1);

        for (const one of adventurers) {
            const renowned = renownOf(one.seed);

            assert.deepEqual(offer(one), { calling: one.look, level: 1, price: hirePrice(HIRES[one.look].price, 1, Boolean(renowned)), renowned });
        }

        assert.equal(offer(guild.folk.find(({ role }) => role === "receptionist")), null);

        // (A Veteran in Command: they can lead them as high as the third level)
        player.progress.skills.command = RANKS[3].xp;
        assert.equal(host.capFor(HOST_PLAYER), 3);

        for (const one of adventurers) {
            const renowned = renownOf(one.seed);
            const level = renowned ? 3 : 2;

            assert.deepEqual(offer(one), { calling: one.look, level, price: hirePrice(HIRES[one.look].price, level, Boolean(renowned)), renowned });
        }

        const asked = offer(adventurers[0]);
        const { result, follower } = hire(host, guild);

        assert.deepEqual({ ok: result.ok, level: result.level, price: result.price }, { ok: true, level: asked.level, price: asked.price });
        assert.equal(player.progress.gold, 5000 - asked.price);

        const one = host.followers.get(follower.id);

        assert.deepEqual({ level: one.level, xp: one.xp, wounds: one.wounds }, { level: asked.level, xp: LEVEL_XP[asked.level], wounds: 0 });
        assert.equal(follower.maxHp, mercenaryOf(one, { made }).hp);
    });

    it("learns from its own blows and half its leader's near it, three times as fast two levels or more under the most it can be, twice one under; held at the most till that grows", () => {
        const { host, ids, me, player } = leading([{ name: "Tam", calling: "warrior" }], { command: RANKS[3].xp, pack: [{ id: "cap" }] });
        const [id] = ids;
        const one = host.followers.get(id);
        const unit = host.battle.actor(id);
        const cap = host.capFor(HOST_PLAYER);

        assert.equal(cap, 3);
        Object.assign(unit, { hp: 5000, maxHp: 5000 });
        brigandBy(host, me, { hp: 60 });
        host.command(HOST_PLAYER, { type: "engage", target: "brigand" });

        const events = run(host, 20000);
        const hits = events.filter(({ type, by, damage }) => type === "hit" && damage > 0 && (by === id || by === HOST_PLAYER));

        assert.ok(hits.some(({ by }) => by === id) && hits.some(({ by }) => by === HOST_PLAYER), "(both of them fought)");

        // (Each blow as the rule has it, the level it was then)
        let [xp, level] = [0, 1];

        for (const { by, damage } of hits) {
            const times = level < cap - 1 ? MERCENARY.further : level < cap ? MERCENARY.behind : 1;

            xp += Math.max(1, Math.round((by === id ? damage : damage * MERCENARY.leader) * times));
            level = levelOfXp(xp, cap);
        }

        assert.equal(one.xp, xp);
        assert.equal(one.level, level);

        // Held at the most they can be, whatever they've learnt; up as soon as that's grown
        player.progress.skills.command = 0;
        one.xp = LEVEL_XP[8];
        host.command(HOST_PLAYER, { type: "equip", index: 0 });
        assert.equal(one.level, level, "(never down a level)");

        player.progress.skills.command = RANKS[5].xp;
        host.events = [];
        host.command(HOST_PLAYER, { type: "unequip", slot: "head" });
        assert.equal(host.capFor(HOST_PLAYER), 4);
        assert.equal(one.level, 4);
        assert.deepEqual(followerEvents(host.events, "levelled").map(({ level: at }) => at), [4]);
        assert.equal(host.battle.actor(id).maxHp, mercenaryOf(one, { made }).hp);
    });

    it("is knocked down when it falls, wounded; up again a while after, sooner with its leader by it; home to mend after the third fall, sent for at any guild's desk for a quarter of its price", () => {
        const { host, guild, player, me } = atTheGuild({ gold: 500 });
        const { result, follower } = hire(host, guild);
        const id = follower.id;
        const one = host.followers.get(id);
        let brigands = 0;
        const knock = () => {
            const brigand = brigandBy(host, follower, { id: `brigand-${++brigands}` });

            follower.hp = 1;

            const events = run(host, 4000);

            Object.assign(brigand, { dead: true, respawnAt: Infinity });

            return events;
        };

        // (Their leader well off, out of reach of helping them up)
        put(me, follower.map, nearestFree(squaresOf(host.world.maps[follower.map]), [follower.square[0], follower.square[1] + 8], { taken: new Set([squareKey(...follower.square)]) }));

        const first = knock();

        assert.deepEqual(followerEvents(first, "down").map(({ wounds }) => wounds), [1]);
        assert.ok(first.some(({ type, id: who, downed }) => type === "death" && who === id && downed));
        assert.ok(host.followers.has(id) && follower.dead && follower.downed);
        assert.equal(one.wounds, 1);
        assert.equal(one.record.falls, 1);
        assert.equal(follower.maxHp, mercenaryOf(one, { made }).hp);
        assert.ok(follower.maxHp < mercenaryOf({ ...one, wounds: 0 }, { made }).hp);

        // Up again where they fell, a while after
        host.command(HOST_PLAYER, { type: "stop" });

        const waited = run(host, DOWNED.ms);

        assert.ok(waited.some(({ type, id: who, rose }) => type === "respawn" && who === id && rose));
        assert.deepEqual(followerEvents(waited, "up").length, 1);
        assert.ok(!follower.dead && !follower.downed);
        assert.equal(follower.hp, Math.round(follower.maxHp * DOWNED.hp));
        assert.equal(one.record.rises, 1);

        // Sooner with their leader by them
        knock();

        const fell = host.battle.time;

        put(me, follower.map, nearestFree(squaresOf(host.world.maps[follower.map]), follower.square, { taken: new Set([squareKey(...follower.square)]) }));

        const helped = run(host, DOWNED.near + 1000);
        const rose = helped.find(({ type, id: who }) => type === "respawn" && who === id);

        assert.ok(rose && rose.time - fell <= DOWNED.near + 500, `${rose?.time - fell}`);
        assert.equal(one.wounds, 2);

        // The third fall: home to mend, out of the world
        put(me, follower.map, nearestFree(squaresOf(host.world.maps[follower.map]), [follower.square[0], follower.square[1] + 8], { taken: new Set([squareKey(...follower.square)]) }));

        const third = knock();

        assert.equal(followerEvents(third, "home")[0]?.why, "wounded");
        assert.ok(!host.followers.has(id) && !host.battle.actor(id));
        assert.deepEqual(host.mendingOf(HOST_PLAYER), [id]);

        // (Still theirs: no room for another in their company)
        assert.equal(hire(host, guild, 1).result.reason, "company");

        // Sent for at the guild's desk
        const receptionist = guild.folk.find(({ role }) => role === "receptionist");
        const offer = host.recallOffer(HOST_PLAYER);

        assert.deepEqual(offer, { id, name: one.name, price: recallPrice(result.price) });
        talkTo(host, receptionist.id);

        const gold = player.progress.gold;
        const back = host.command(HOST_PLAYER, { type: "effect", effect: { recall: true } });

        assert.equal(back.ok, true, JSON.stringify(back));
        assert.equal(player.progress.gold, gold - offer.price);
        assert.deepEqual(host.mendingOf(HOST_PLAYER), []);

        const again = host.followers.get(back.follower);

        assert.deepEqual({ name: again.name, level: again.level, wounds: again.wounds, falls: again.record.falls }, { name: one.name, level: one.level, wounds: 0, falls: 3 });
        assert.equal(host.battle.actor(back.follower).maxHp, mercenaryOf(again, { made }).hp);
    });

    it("let go at the guild's desk while mending, asked first: what they wore given back, their name on the roll, room for another", () => {
        const { host, guild, player: mine } = atTheGuild({ gold: 0, followers: [{ name: "Tam", calling: "warrior", level: 3, away: true, gear: { mainHand: null, body: { id: "mail", quality: "common" } } }] });
        const receptionist = guild.folk.find(({ role }) => role === "receptionist");

        assert.equal(host.mendingOf(HOST_PLAYER).length, 1);
        assert.equal(hire(host, guild).result.reason, "company");
        talkTo(host, receptionist.id);
        assert.equal(host.command(HOST_PLAYER, { type: "effect", effect: { recall: true } }).reason, "gold");
        assert.equal(host.command(HOST_PLAYER, { type: "effect", effect: { release: true } }).ok, true);
        assert.deepEqual(host.mendingOf(HOST_PLAYER), []);
        assert.ok(mine.progress.pack.some((stack) => stack?.id === "mail"), "(their mail back in the pack)");
        assert.deepEqual(mine.roll.map(({ name, level, gone }) => ({ name, level, gone })), [{ name: "Tam", level: 3, gone: "dismissed" }]);
        assert.equal(host.command(HOST_PLAYER, { type: "effect", effect: { release: true } }).reason, "recall", "(no one left to let go)");
        assert.notEqual(hire(host, guild).result.reason, "company", "(room for another)");
    });

    it("dies where the world's rule has it, the fall that would send it home its last: what it wore given back, its name on its leader's roll", () => {
        const { host, ids, player, me } = leading([{ name: "Tam", calling: "warrior", level: 2, wounds: 2, gear: { mainHand: { id: "sword", quality: "fine" }, body: null } }], { rules: { rest: "host", debug: "host", invasions: true, mortal: true } });
        const [id] = ids;
        const unit = host.battle.actor(id);

        brigandBy(host, unit);
        unit.hp = 1;
        put(me, me.map, nearestFree(squaresOf(host.world.maps[me.map]), [unit.square[0], unit.square[1] + 8], { taken: new Set(host.battle.actors.filter((each) => each.map === me.map && each.id !== HOST_PLAYER).map(({ square: [x, y] }) => squareKey(x, y))) }));

        const events = run(host, 6000);

        assert.equal(followerEvents(events, "fallen").length, 1);
        assert.ok(!host.followers.has(id));
        assert.deepEqual(host.mendingOf(HOST_PLAYER), []);
        assert.ok(player.progress.pack.some((stack) => stack?.id === "sword" && stack.quality === "fine") || events.some(({ type, id: who }) => type === "spoils" && who === HOST_PLAYER), "(their sword back)");
        assert.deepEqual(player.roll.map(({ name, calling, level, gone, kills }) => ({ name, calling, level, gone, kills })), [{ name: "Tam", calling: "warrior", level: 2, gone: "fallen", kills: 0 }]);
        assert.ok(Number.isInteger(player.roll[0].day));
        assert.ok(ROLL_MOST >= 10);
    });

    it("wears what it's given, as strong for it, and gives it back when asked; not what it can't wear, nor from afar", () => {
        const pack = [{ id: "sword", quality: "rare" }, { id: "mail" }, { id: "bow" }, { id: "nasalHelm" }, { id: "plate", level: 50 }];
        const { host, ids, player, me } = leading([{ name: "Tam", calling: "warrior" }], { pack });
        const [id] = ids;
        const unit = host.battle.actor(id);
        const one = host.followers.get(id);
        const index = (want) => player.progress.pack.findIndex((stack) => stack?.id === want);
        const give = (want) => host.command(HOST_PLAYER, { type: "outfit", follower: id, index: index(want) });
        const melee = unit.power.melee;

        assert.equal(unit.armor, 0);

        host.events = [];
        assert.equal(give("sword").ok, true);
        assert.deepEqual(one.gear.mainHand, { id: "sword", quality: "rare" });
        assert.ok(Math.abs(unit.power.melee - melee * made("rare")) < 1e-9);
        assert.deepEqual(host.events.filter(({ type }) => type === "follower").map(({ change, slot, item }) => ({ change, slot, item })), [{ change: "outfitted", slot: "mainHand", item: { id: "sword", quality: "rare", level: 1 } }]);
        assert.equal(index("sword"), -1, "(out of the pack)");

        assert.equal(give("mail").ok, true);
        assert.equal(unit.armor, mercenaryOf(one, { made }).armor);
        assert.ok(unit.armor > 0);

        assert.equal(give("bow").reason, "calling");
        assert.equal(give("nasalHelm").reason, "item");
        assert.equal(give("plate").reason, "mightier");

        // Taken back: in the pack again
        assert.equal(host.command(HOST_PLAYER, { type: "unoutfit", follower: id, slot: "body" }).ok, true);
        assert.equal(one.gear.body, null);
        assert.equal(unit.armor, 0);
        assert.ok(index("mail") >= 0);
        assert.equal(host.command(HOST_PLAYER, { type: "unoutfit", follower: id, slot: "body" }).reason, "item");

        // (From afar: not)
        const far = nearestFree(squaresOf(host.world.maps[me.map]), [me.square[0] + 30, me.square[1]], { within: 24 });

        put(unit, me.map, far);
        assert.equal(give("mail").reason, "far");
    });

    it("takes its share of the gold won with it near, told of, a little at a time adding up; none of what's won far from it", () => {
        const { host, ids, player, me } = leading([{ name: "Tam", calling: "warrior" }]);
        const [id] = ids;
        const one = host.followers.get(id);
        const orc = host.battle.actor("orc");

        Object.assign(orc, { dead: false, hp: 1, maxHp: 1, respawnAt: 0 });
        Object.assign(me, { hp: 5000, maxHp: 5000 });
        put(orc, me.map, [me.square[0] + 1, me.square[1]]);
        host.command(HOST_PLAYER, { type: "order", unit: id, order: "hold" });
        host.command(HOST_PLAYER, { type: "engage", target: "orc" });

        const gold = player.progress.gold;
        const events = run(host, 20000);
        const loot = events.find(({ type, id: who }) => type === "loot" && who === HOST_PLAYER);

        assert.ok(loot, "(the orc brought down, and looted)");

        const share = events.find(({ type }) => type === "share");
        const won = loot.gold + (share?.gold ?? 0);
        const [due] = sharesOf(won, [{ id, trust: 0, owed: 0 }]);

        assert.ok(won > 0, `${won}`);
        assert.equal(share?.gold ?? 0, due.gold);
        assert.deepEqual(share ? share.taken.map(({ follower, gold: taken }) => ({ follower, gold: taken })) : [], due.gold ? [{ follower: id, gold: due.gold }] : []);
        assert.equal(one.owed, due.owed);
        assert.equal(one.record.earned, due.gold);
        assert.equal(player.progress.gold, gold + loot.gold);
    });

    it("comes to trust its leader by the foes brought down together, a way to grow chosen at each rank (one already chosen chosen again only in a guild hall); called what its leader likes", () => {
        const { host, ids } = leading([{ name: "Tam", calling: "warrior", record: { together: TRUST_RANK } }]);
        const [id] = ids;
        const one = host.followers.get(id);
        const unit = host.battle.actor(id);
        const pick = (chosen) => host.command(HOST_PLAYER, { type: "pick", follower: id, pick: chosen });
        const melee = unit.power.melee;

        assert.equal(trustOf(one.record.together), 1);
        assert.equal(pick("steady").reason, "unpicked", "(a rank they've not come to)");
        assert.equal(pick("flying").reason, "command");
        assert.equal(pick("fierce").ok, true);
        assert.deepEqual(one.picks, ["fierce"]);
        assert.ok(Math.abs(unit.power.melee - melee * 1.15) < 1e-9);
        assert.equal(pick("hardy").reason, "guildhall");

        // Called what their leader likes, their own name again
        assert.equal(host.command(HOST_PLAYER, { type: "rename", follower: id, name: "  Old \u0007  Tam   the  Patient one " }).ok, true);
        assert.equal(one.called, "Old Tam the Patient");
        assert.equal(unit.name, "Old Tam the Patient");
        assert.equal(host.command(HOST_PLAYER, { type: "rename", follower: id, name: "" }).ok, true);
        assert.equal(one.called, null);
        assert.equal(unit.name, "Tam");
        assert.equal(host.command(HOST_PLAYER, { type: "rename", follower: "follower-99", name: "X" }).reason, "follower");
    });

    it("earns its byname bringing foes down, and remembers the kind that knocked it down", () => {
        const { host, ids, me } = leading([{ name: "Tam", calling: "warrior", record: { kills: 99 } }]);
        const [id] = ids;
        const unit = host.battle.actor(id);
        const one = host.followers.get(id);

        Object.assign(unit, { hp: 5000, maxHp: 5000 });
        fightAway(host, unit, { hp: 1, creature: "wolf" });

        const events = run(host, 10000);

        assert.equal(one.record.kills, 100);
        assert.deepEqual(one.record.slain, { Wolfsbane: 1 });
        assert.deepEqual(followerEvents(events, "byname").map(({ byname, name }) => ({ byname, name })), [{ byname: "the Bloodied", name: "Tam, the Bloodied" }]);
        assert.equal(unit.name, "Tam, the Bloodied");

        fightAway(host, unit, { id: "wolf", creature: "wolf" });
        unit.hp = 1;
        run(host, 4000);
        assert.ok(unit.dead && unit.downed);
        assert.equal(one.record.nemesis, "wolf");
        assert.ok(me);
    });

    it("gives its leader a veteran's gift from the seventh level while it's on its feet: never their might", () => {
        const bare = leading([]).me.armor;
        const { host, ids, me, player } = leading([{ name: "Tam", calling: "warrior", level: 7 }]);
        const [id] = ids;

        assert.ok(Math.abs(me.armor - (bare + GIFTS.warrior.armor)) < 1e-9, `${me.armor} from ${bare}`);
        assert.equal(host.mightFor(HOST_PLAYER), leading([]).host.mightFor(HOST_PLAYER), "(not their might)");

        // (Knocked down: none, till they're up)
        const unit = host.battle.actor(id);

        fightAway(host, unit);
        unit.hp = 1;
        run(host, 3000);
        assert.ok(unit.dead && unit.downed);
        assert.ok(Math.abs(me.armor - bare) < 1e-9);
        assert.ok(player);
    });

    it("is kept with the character as it's grown, those mending too, and the roll; and with the world, exactly", () => {
        const { host, ids, player } = leading([
            { name: "Tam", calling: "warrior", level: 4, xp: LEVEL_XP[4] + 7, wounds: 1, owed: 1234, gear: { mainHand: { id: "sword", quality: "fine" }, body: null }, record: { ...freshRecord(), kills: 12, together: 40 }, called: "Old Tam", picks: ["hardy"] },
            { name: "Pip", calling: "cleric", level: 2, away: true },
        ]);

        player.roll = [{ name: "Bryn", calling: "mage", level: 5, byname: null, gone: "fallen", kills: 30, day: 2 }];
        run(host, 1000);

        const character = host.characterOf(player);

        assert.deepEqual(
            character.followers.map(({ name, level, xp, wounds, owed, called, picks, away = false }) => ({ name, level, xp, wounds, owed, called, picks, away })),
            [
                { name: "Tam", level: 4, xp: LEVEL_XP[4] + 7, wounds: 1, owed: 1234, called: "Old Tam", picks: ["hardy"], away: false },
                { name: "Pip", level: 2, xp: LEVEL_XP[2], wounds: 0, owed: 0, called: null, picks: [], away: true },
            ],
        );
        assert.deepEqual(character.followers[0].gear, { mainHand: { id: "sword", quality: "fine" }, body: null });
        assert.equal(character.followers[0].record.kills, 12);
        assert.deepEqual(character.roll, player.roll);

        // Carried on exactly
        const again = Host.restore(buildWorld({ seed: 2 }), decode(encode(host.snapshot())));

        assert.deepEqual([...again.followers.keys()], ids.slice(0, 1));
        assert.equal(again.mendingOf(HOST_PLAYER).length, 1);
        assert.deepEqual(again.players.get(HOST_PLAYER).roll, player.roll);
        assert.equal(encode(again.snapshot()), encode(host.snapshot()));

        for (let t = 0; t < 3000; t += STEP_MS) {
            assert.deepEqual(again.advance(STEP_MS), host.advance(STEP_MS));
        }
    });

    it("brings a world kept from before forward: its followers fresh ones of the first level, knocked down when they fall, none mending, no rolls (SNAPSHOT_STEPS 44)", () => {
        const snapshot = {
            version: 44,
            followers: [["follower-1", { leader: HOST_PLAYER, name: "Tam", calling: "warrior", sex: "m", seed: 3, people: "human", from: null, waiting: false }]],
            players: [{ id: HOST_PLAYER }],
            battle: { actors: [{ id: "follower-1", kind: "follower" }, { id: "orc", kind: "orc" }] },
        };
        const forward = SNAPSHOT_STEPS[44](snapshot);

        assert.equal(forward.version, 45);
        assert.deepEqual(forward.followers, [["follower-1", { level: 1, xp: 0, wounds: 0, owed: 0, gear: { mainHand: null, body: null }, record: freshRecord(), called: null, picks: [], renowned: null, ...snapshot.followers[0][1] }]]);
        assert.deepEqual(forward.mending, []);
        assert.deepEqual(forward.players, [{ id: HOST_PLAYER, roll: [] }]);
        assert.deepEqual(forward.battle.actors, [{ rises: 1, downed: false, dodge: 0, abilityTimes: 1, id: "follower-1", kind: "follower" }, { id: "orc", kind: "orc" }]);
    });
});
