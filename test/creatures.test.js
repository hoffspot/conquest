// The wild's creatures (client/js/core/creatures.js, core/battle.js, core/host.js; docs/WILDS.md):
// each with a look and a weapon, about a match for a new adventurer near home and stronger the
// further out; the uniques only in their people's lands, the mightiest only in the perilous
// places; about four kept near each player out in the wilds (five at night), out of sight at first,
// clear of the settlements and the roads, let go once far, the ground cleared of them left clear a
// while; wandering, and fighting as their temper has it (a pack together); the people's soldiers
// going after those that are a menace; the wild camps and the perilous sites come to life near a
// player; and all of it carried on exactly from a snapshot
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LOOKS } from "../client/js/beasts/looks.js";
import { elitePrize } from "../client/js/core/caches.js";
import { GEAR } from "../client/js/core/gear.js";
import { CHARMS } from "../client/js/core/goods.js";
import { Battle, BOMBS, KINDS, SIGHT, STEP_MS } from "../client/js/core/battle.js";
import { CAMP_FOLK, candidatesAt, clearOfSettlements, CREATURES, eliteName, eliteRound, ELITES, LAIRS, livesOn, packOf, TIER_LAND, tierAt, tierPower, TIERS, WILD } from "../client/js/core/creatures.js";
import { HOST_PLAYER, Host, WILDS } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { SETTLEMENT_KINDS } from "../client/js/core/setpieces/town.js";
import { scalingOf } from "../client/js/core/strength.js";
import { ITEMS } from "../client/js/core/progress.js";
import { createRandom } from "../client/js/core/random.js";
import { ELITE_SPOILS, PARTS, rollSpoils, SPOILS, TOME_DROP } from "../client/js/core/spoils.js";
import { GUILD_REACH, offerContract, WANTED_PARTS } from "../client/js/core/standing.js";
import { War } from "../client/js/core/war/war.js";
import { armsOf, chooseAttack, NATURAL, weaponOf, WEAPONS } from "../client/js/core/weapons.js";
import { decode, encode } from "../client/js/core/wire.js";
import { FACTIONS, landAt } from "../client/js/core/worldplan/plan.js";
import { parseGrid } from "./helpers.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });
const TEMPERS = new Set(["aggressive", "territorial", "defensive"]);

function run(host, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...host.advance(STEP_MS));
    }

    return events;
}

const put = (actor, [x, y]) => Object.assign(actor, { square: [x, y], x: x + 0.5, y: y + 0.5, path: [], order: null, target: null, spawn: [x, y] });

// A world with its player in it (the orc gone), and where its start town's middle and edge are
function hosted() {
    const world = buildWorld({ seed: 2 });
    const host = new Host(world, { populate: false });

    host.join({ id: HOST_PLAYER, hero: HERO });
    host.populate();
    Object.assign(host.battle.actor("orc"), { dead: true, respawnAt: Infinity });

    return { host, world, me: host.battle.actor(HOST_PLAYER), middle: world.stamp.middle, radius: SETTLEMENT_KINDS[world.start.kind].radius };
}

// The player out in the wilds, `out` metres past their town's edge (west, where the land's open)
function outside(context, out = 80) {
    const { me, middle, radius } = context;

    put(me, [Math.floor(middle[0] - radius - out), Math.floor(middle[1] - 20)]);
    Object.assign(me, { hp: 5000, maxHp: 5000 });

    return context;
}

// The creatures about, as the host has them
const about = (host) => [...host.wild.keys()].map((id) => host.battle.actor(id)).filter(Boolean);

// The elites out, as the host has them (their ids)
const elitesOf = (host) => [...host.wild].filter(([, one]) => one.elite === "lead").map(([id]) => id);

// A player walked west across the land past the first tier's in seed 2's world (4 m a second, from
// 1,460 m west of home) till an elite's put out near them, or `most` seconds: the elite's id and
// where the player was then
function walkTillElite(host, actor, most = 120) {
    const [hx, hy] = host.world.start.at;
    let at = [Math.floor(hx - 1460), Math.floor(hy)];

    for (let s = 0; s < most; s++) {
        Object.assign(actor, { square: [...at], x: at[0] + 0.5, y: at[1] + 0.5, path: [], order: null, target: null });
        run(host, 1000);

        const [elite] = elitesOf(host);

        if (elite) {
            return { elite, at: [actor.x, actor.y] };
        }

        at = [at[0] - 4, at[1]];
    }

    return { elite: null, at };
}

// An open field (no walls, nothing in the way) `size` squares across, for a battle alone
const field = (size) => ({ blocked: parseGrid(Array.from({ length: size }, () => ".".repeat(size))).map((row) => Uint8Array.from(row)) });

// The average damage a second of an attack
const perSecond = (attack) => ((attack.either?.[0] ?? attack).damage[0] + (attack.either?.[0] ?? attack).damage[1]) / 2 / ((attack.either?.[0] ?? attack).interval / 1000);

describe("the wild's creatures (creatures.js)", () => {
    it("gives every creature a look, a weapon, a temper, tiers and a pack that make sense", () => {
        for (const [id, creature] of Object.entries(CREATURES)) {
            assert.ok(LOOKS[id], `${id}: a look`);
            assert.ok(weaponOf(creature.weapon), `${id}: a weapon`);
            assert.ok(creature.hp > 0 && creature.speed > 0 && creature.chase >= creature.speed, `${id}: hit points and speeds`);
            assert.ok(TEMPERS.has(creature.temper), `${id}: a temper`);
            assert.equal(creature.temper === "territorial", creature.guard > 0, `${id}: a guard if it's territorial`);
            assert.ok(creature.tiers[0] >= 1 && creature.tiers[0] <= creature.tiers[1] && creature.tiers[1] <= TIERS, `${id}: tiers`);
            assert.ok(creature.pack[0] >= 1 && creature.pack[0] <= creature.pack[1], `${id}: a pack`);
            assert.ok(creature.leash > creature.roam, `${id}: chases further than it wanders`);
        }
    });

    it("gives the creatures' own weapons whole-number damage, sound timings and reactions the characters know", () => {
        const reactions = new Set(Object.values(WEAPONS).flatMap(({ attacks }) => attacks.map(({ reaction }) => reaction)));

        for (const [id, weapon] of Object.entries(NATURAL)) {
            for (const attack of armsOf(id).flatMap((each) => each.either ?? [each])) {
                const [least, most] = attack.damage;

                assert.ok(Number.isInteger(least) && Number.isInteger(most) && least >= 1 && most >= least, `${id} ${attack.id}: damage`);
                assert.ok(attack.hitAt < attack.duration && attack.duration <= attack.interval, `${id} ${attack.id}: timing`);
                assert.ok(reactions.has(attack.reaction), `${id} ${attack.id}: a reaction`);
                assert.equal(attack.kind === "ranged", Boolean(attack.projectile || attack.bomb), `${id} ${attack.id}: a projectile, or a bomb`);
                assert.ok(!attack.bomb || (BOMBS[attack.bomb] && !attack.projectile), `${id} ${attack.id}: a bomb of the battle's`);
            }

            assert.ok(weapon.label, id);
        }
    });

    it("makes what's near home about a match for a new adventurer, and each tier about a third more", () => {
        const sword = WEAPONS.sword.attacks[0];
        const adventurer = KINDS.player.hp * perSecond(sword);

        for (const [id, creature] of Object.entries(CREATURES).filter(([, each]) => each.tiers[0] === 1)) {
            const pack = packOf(id, 1);
            const strength = creature.hp * perSecond(armsOf(creature.weapon)[0]) * pack * pack;

            assert.ok(strength <= adventurer * 1.35, `${id}: ${Math.round(strength)} against ${Math.round(adventurer)}`);
        }

        assert.ok(Math.abs(tierPower(2) ** 2 - 1.39) < 0.01);
        assert.equal(tierPower(1), 1);
    });

    it("puts tiers up the further from home, two more in the high, cold and burning lands far out", () => {
        const home = [0, 0];
        const tiers = [0, 1000, 2100, 3000, 5000, 8000, 20000].map((out) => tierAt([out, 0], [home], "meadow"));

        assert.equal(tiers[0], 1);
        assert.deepEqual(tiers, [...tiers].sort((a, b) => a - b));
        assert.equal(tiers.at(-1), TIER_LAND.open);
        assert.equal(tierAt([20000, 0], [home], "snow"), TIERS);
        assert.equal(tierAt([1000, 0], [home], "snow"), 1);

        // (The second tier begins within a guild's reach of home: the first a ring 1,450 m out)
        assert.equal(tierAt([1440, 0], [home], "meadow"), 1);
        assert.equal(tierAt([0, 1460], [home], "meadow"), 2);
        assert.ok(TIER_LAND.from + TIER_LAND.every <= GUILD_REACH);
    });

    it("keeps each people's own creatures to their lands, the water empty, and the perilous masters out of the open", () => {
        assert.ok(livesOn("boggart", { biome: "farmland", race: "human" }));
        assert.ok(!livesOn("boggart", { biome: "farmland", race: "elf" }));
        assert.ok(!livesOn("rat", { biome: "lake", race: null }));

        for (let tier = 1; tier <= TIERS; tier++) {
            for (const land of [{ biome: "woods", race: "elf" }, { biome: "snow", race: null }, { biome: "volcanic", race: "orc" }]) {
                for (const { id } of candidatesAt(land, tier)) {
                    const creature = CREATURES[id];

                    assert.ok(!creature.people || creature.people === land.race, `${id} in ${land.race}'s lands`);
                    assert.ok(!creature.perilous || id === "frostTroll", `${id} out in the open`);
                    assert.ok(tier >= creature.tiers[0] && tier <= creature.tiers[1], `${id} at tier ${tier}`);
                }
            }
        }
    });

    it("grows packs further out, up to their most", () => {
        assert.equal(packOf("wolf", 2), 2);
        assert.equal(packOf("wolf", 4), 3);
        assert.equal(packOf("wolf", 9), 4);
        assert.equal(packOf("bear", 7), 1);
    });

    it("makes an elite far stronger than its kind, a tier up, named for it, walking a round about where it's put out", () => {
        assert.deepEqual([ELITES.hp, ELITES.power, ELITES.up, ELITES.least], [3, 1.25, 1, 2]);
        assert.equal(eliteName("wolf"), "Elite Wolf");
        assert.equal(eliteName("bear"), "Elite Brown bear");

        // (About four of its kind to beat, before its tier: hit points times blows)
        assert.ok(ELITES.hp * ELITES.power * tierPower(1 + ELITES.up) ** 2 > 5);

        // Put out further off than the rest (out of sight, but on the minimap as it comes), seeing
        // further, but going no further after anyone than a little beyond its round
        assert.ok(ELITES.from > WILDS.to && ELITES.from <= ELITES.marker + 20 && ELITES.to < ELITES.far);
        assert.ok(ELITES.sight > SIGHT && ELITES.sight < ELITES.loop + ELITES.leash);
        assert.ok(ELITES.apart > 2 * ELITES.far, "never two about one player");
        assert.ok(ELITES.chance <= 0.1 && ELITES.rest >= 5 * 60000, "rare");

        const round = eliteRound([100, 200]);

        assert.equal(round.length, ELITES.stops);

        for (const [x, y] of round) {
            assert.ok(Math.abs(Math.hypot(x - 100, y - 200) - ELITES.loop) < 0.01);
        }
    });

    it("has folk for every wild camp's faction, and a master and guards for every perilous site", () => {
        for (const { id } of FACTIONS) {
            assert.ok(CAMP_FOLK[id]?.every(([creature]) => CREATURES[creature]), id);
        }

        for (const lair of Object.values(LAIRS)) {
            assert.ok(CREATURES[lair.master[0]].perilous);
            assert.ok(lair.guards.every(([creature]) => CREATURES[creature]));
        }
    });
});

describe("the wild come to life near the players (host.js, battle.js)", () => {
    it("keeps about four creatures near a player out in the wilds, put out of sight, and lets them go once far", () => {
        const { host, me } = outside(hosted());

        // (The first look round: the first pack put out)
        run(host, 600);

        for (const beast of about(host)) {
            assert.equal(beast.team, WILD);
            assert.ok(Math.hypot(beast.x - me.x, beast.y - me.y) >= WILDS.from - 3, `${beast.name} put out of sight`);
        }

        run(host, 12000);

        const near = about(host).filter((beast) => !host.wild.get(beast.id).camp && Math.hypot(beast.x - me.x, beast.y - me.y) < WILDS.about);

        assert.ok(near.length >= WILDS.count - 2 && near.length <= WILDS.count, `${near.length} about`);

        // Near home: the first tier's
        assert.ok(near.every((beast) => beast.wild.tier === 1));

        const ids = near.map(({ id }) => id);

        put(me, [Math.floor(me.x + 600), Math.floor(me.y)]);
        run(host, 1500);

        assert.ok(ids.every((id) => !host.battle.actor(id)), "those far away let go");
    });

    it("puts them out clear of the settlements and the roads, and leaves the ground cleared of them clear two minutes, for everyone", () => {
        const { host, world, me } = outside(hosted(), 200);
        const roaming = () => about(host).filter((beast) => {
            const one = host.wild.get(beast.id);

            return !beast.dead && !one.camp && !one.lair && !one.place;
        });

        assert.deepEqual([WILDS.count, WILDS.night, WILDS.clear, WILDS.road, WILDS.cleared], [4, 1, 60, 10, 120000]);

        run(host, 12000);

        // Put out clear of the settlements and the roads (a pack a square or two round where it was
        // put; they may wander onto a road after)
        for (const beast of roaming()) {
            const spawn = beast.spawn.map((v) => v + 0.5);

            assert.ok(clearOfSettlements(world.plan, spawn, WILDS.clear - 4), `${beast.id} clear of the settlements`);
            assert.ok(!world.maps.town.nearRoad(...spawn, WILDS.road - 4), `${beast.id} clear of the roads`);
        }

        const near = roaming().filter((beast) => Math.hypot(beast.x - me.x, beast.y - me.y) < WILDS.about);

        assert.ok(near.length >= 2, `${near.length} about`);

        // All those about the player felled
        for (const beast of near) {
            host.battle.afflict(beast.id, "poison", { by: HOST_PLAYER, damage: 1e7 });
        }

        run(host, 3000);

        assert.ok(near.every(({ id }) => !host.battle.actor(id) || host.battle.actor(id).dead), "felled");
        assert.equal(host.cleared.length, near.length, "their ground cleared");

        const marks = host.cleared.map(({ at }) => at);
        const before = new Set(host.wild.keys());
        const fresh = () => roaming().filter(({ id }) => !before.has(id));

        // A friend joins them there: the ground they cleared stays clear for them too
        host.join({ id: "guest", hero: { ...HERO, name: "Bea" } });
        put(host.battle.actor("guest"), [Math.floor(me.x), Math.floor(me.y) + 2]);

        for (let t = 0; t < 100000; t += 5000) {
            run(host, 5000);

            for (const beast of fresh()) {
                assert.ok(marks.every(([x, y]) => Math.hypot(beast.spawn[0] - x, beast.spawn[1] - y) >= WILDS.about - 4), `${beast.id} put out away from the cleared ground`);
            }

            const about = roaming().filter((beast) => Math.hypot(beast.x - me.x, beast.y - me.y) < WILDS.about);

            assert.ok(about.length <= WILDS.count - near.length, `${about.length} about the cleared ground after ${t + 5000} ms`);
        }

        // Then, the two minutes out, they come back
        run(host, WILDS.cleared - 100000 + 15000);

        assert.equal(host.cleared.length, 0, "the cleared ground filled again");
        assert.ok(roaming().some((beast) => Math.hypot(beast.x - me.x, beast.y - me.y) < WILDS.about), "back about the player");
    });

    it("leaves the player be where a creature's defensive, till they strike it, then its pack turns on them", () => {
        const context = outside(hosted());
        const { host, me } = context;

        // (Out of the way of everything else about)
        run(host, 600);

        for (const beast of about(host)) {
            host.battle.remove(beast.id);
            host.wild.delete(beast.id);
        }

        const slimes = [[me.square[0] + 2, me.square[1]], [me.square[0] + 3, me.square[1] + 1]].map((square, k) => {
            const id = `test-slime-${k}`;

            host.battle.add({ id, kind: "beast", name: "Green slime", weapon: "slime", team: WILD, square, ai: "wild", hp: 30, speed: 0.8, chase: 1.5, wild: { creature: "slime", tier: 1, temper: "defensive", guard: 0, roam: 1, leash: 12, pack: "test-pack", leader: k ? "test-slime-0" : null, menace: false } });

            return host.battle.actor(id);
        });

        const quiet = run(host, 4000);
        const ids = new Set(slimes.map(({ id }) => id));

        assert.ok(!quiet.some((event) => event.type === "hit" && event.id === HOST_PLAYER && ids.has(event.by)), "the slimes haven't hit the player");

        host.command(HOST_PLAYER, { type: "engage", target: slimes[0].id });

        const fight = run(host, 3000);

        assert.ok(fight.some((event) => event.type === "hit" && event.id === slimes[0].id));
        assert.equal(slimes[1].target, HOST_PLAYER, "its pack turned on them");
    });

    it("knocks the player off their feet with a rock tusker's charge: nothing to be done till they're up", () => {
        const context = outside(hosted());
        const { host, me } = context;

        run(host, 600);

        for (const beast of about(host)) {
            host.battle.remove(beast.id);
            host.wild.delete(beast.id);
        }

        host.battle.add({ id: "test-tusker", kind: "beast", name: "Rock tusker", weapon: "rockTusker", team: WILD, square: [me.square[0] + 1, me.square[1]], ai: "wild", hp: 5000, speed: 1, chase: 1, wild: { creature: "rockTusker", tier: 4, temper: "aggressive", guard: 0, roam: 0, leash: 12, pack: "test-tusker", leader: null, menace: true } });

        let knocked = null;

        for (let t = 0; t < 8000 && !knocked; t += STEP_MS) {
            knocked = host.advance(STEP_MS).find((event) => event.type === "knockdown" && event.id === HOST_PLAYER) ?? null;
        }

        assert.ok(knocked, "the charge knocked them down");
        assert.equal(knocked.by, "test-tusker");
        assert.ok(me.downUntil > host.battle.time && me.stunnedUntil >= me.downUntil, "down, and stunned while they are");

        for (const command of [{ type: "move", to: [me.square[0] - 3, me.square[1]] }, { type: "engage", target: "test-tusker" }, { type: "cast", spell: "vigor" }]) {
            assert.deepEqual(host.command(HOST_PLAYER, command), { ok: false, reason: "down" }, command.type);
        }

        // (Up again: the tusker gone, they can go)
        host.battle.remove("test-tusker");
        run(host, me.downUntil - host.battle.time + STEP_MS);
        assert.equal(host.command(HOST_PLAYER, { type: "move", to: [me.square[0] - 3, me.square[1]] }).ok, true);
    });

    it("leaves each player near a creature that falls their own bundle, seen and taken by them alone", () => {
        const context = outside(hosted());
        const { host, me } = context;

        run(host, 600);

        for (const beast of about(host)) {
            host.battle.remove(beast.id);
            host.wild.delete(beast.id);
        }

        // (Another player beside them, and one far off)
        for (const [id, square] of [["p2", [me.square[0], me.square[1] + 2]], ["p3", [me.square[0] + 60, me.square[1]]]]) {
            host.join({ id, hero: { ...HERO, name: id } });
            put(host.battle.actor(id), square);
            Object.assign(host.battle.actor(id), { hp: 5000, maxHp: 5000, map: me.map });
        }

        // (A dragon, near dead: it always has gold on it)
        const square = [me.square[0] + 1, me.square[1]];

        host.wild.set("test-dragon", { creature: "dragon", tier: 10, pack: "test-dragon", camp: null, lair: null, master: false });
        host.battle.add({ id: "test-dragon", kind: "beast", name: "Dragon", weapon: "dragon", team: WILD, square, ai: "wild", hp: 1, speed: 0.1, chase: 0.1, wild: { creature: "dragon", tier: 10, temper: "defensive", guard: 0, roam: 0, leash: 2, pack: "test-dragon", leader: null, menace: false } });
        host.command(HOST_PLAYER, { type: "engage", target: "test-dragon" });

        const events = run(host, 5000);
        const found = events.filter((event) => event.type === "spoils");
        const bundles = [...host.ground.values()].filter((dropped) => dropped.bundle);

        assert.deepEqual(found.map(({ id }) => id).sort(), [HOST_PLAYER, "p2"].sort(), "those near found theirs; the one far off, none");
        assert.equal(bundles.length, 2);
        assert.ok(bundles.every((dropped) => dropped.bundle.gold > 0 && dropped.bundle.items.every(({ id }) => PARTS[id])));

        const mine = bundles.find((dropped) => dropped.for === HOST_PLAYER);
        const theirs = bundles.find((dropped) => dropped.for === "p2");
        const { progress } = host.players.get(HOST_PLAYER);
        const before = progress.gold;
        const bundle = structuredClone(mine.bundle);

        assert.deepEqual(host.command(HOST_PLAYER, { type: "pickUp", ground: theirs.id }), { ok: false, reason: "gone" }, "not theirs to take");
        assert.deepEqual(host.command(HOST_PLAYER, { type: "pickUp", ground: mine.id }), { ok: true });
        assert.equal(progress.gold, before + bundle.gold);
        assert.ok(bundle.items.every(({ id, count }) => progress.pack.some((stack) => stack?.id === id && stack.count >= count)));
        assert.ok(!host.ground.has(mine.id) && host.ground.has(theirs.id));
    });

    it("rolls creatures' spoils as their tables say, never certain but for a dragon's gold, worth more the mightier", () => {
        const random = createRandom(7);
        const tally = (creature, tier, n = 2000) => {
            let worth = 0;
            let nothing = 0;

            for (let k = 0; k < n; k++) {
                const { gold, items } = rollSpoils(creature, tier, random, CREATURES[creature].tiers[0]);
                const value = gold + items.reduce((sum, { id, count }) => sum + ITEMS[id].price * count, 0);

                worth += value;
                nothing += value === 0 ? 1 : 0;
            }

            return { worth: worth / n, nothing: nothing / n };
        };

        for (const [id, table] of Object.entries(SPOILS)) {
            assert.ok(CREATURES[id], id);
            assert.ok(table.items.every(({ id: item, chance }) => ITEMS[item] && chance > 0 && chance < 1), `${id}: things it might have`);
        }

        assert.deepEqual(Object.keys(SPOILS).sort(), Object.keys(CREATURES).sort(), "every creature has its spoils");

        // (Near home, a few gold's worth a kill, and often nothing; the mightiest, a fortune)
        const rat = tally("rat", 1);
        const wolf = tally("wolf", 2);
        const bear = tally("bear", 4);
        const dragon = tally("dragon", 10, 400);

        assert.ok(rat.worth > 0.5 && rat.worth < 3 && rat.nothing > 0.25, JSON.stringify(rat));
        assert.ok(wolf.worth > rat.worth && wolf.worth < 8, JSON.stringify(wolf));
        assert.ok(bear.worth > wolf.worth && bear.worth < 25, JSON.stringify(bear));
        assert.ok(dragon.worth > 200 && dragon.nothing === 0, JSON.stringify(dragon));
    });

    it("has the guild want creatures' parts brought in, paid better than over the counter, taken from the pack", () => {
        // (Offered on the board, now and then: some of what's near home, fewer of the dearer)
        const war = new War(buildWorld({ seed: 2 }).plan, { seed: 2 });
        const town = war.towns[0];
        const offered = [];

        for (let seed = 1; seed < 80; seed++) {
            const contract = offerContract({ war, town: town.id, giver: { id: "clerk", name: "Mira", title: "" }, random: createRandom(seed) });

            if (contract?.kind === "parts") {
                offered.push(contract);
            }
        }

        assert.ok(offered.length > 5, `${offered.length} parts contracts`);

        for (const { target, reward, text } of offered) {
            assert.ok(WANTED_PARTS.includes(target.part) && target.need >= 2 && target.need <= 5, JSON.stringify(target));
            assert.ok(reward.gold > PARTS[target.part].worth * target.need, "more than they'd fetch sold");
            assert.ok(text.includes(String(reward.gold)), text);
        }

        // Handed in at the guild: the parts out of the pack, the gold in hand
        const host = new Host(buildWorld({ seed: 2 }), { populate: false });

        host.join({ id: HOST_PLAYER, hero: HERO });
        host.populate();

        const player = host.players.get(HOST_PLAYER);
        const me = host.battle.actor(HOST_PLAYER);
        const guild = [...host.world.interiors.buildings.values()].find(({ kind, place }) => kind === "guild" && place === "home");

        put(me, guild.door.ends[0].squares[0]);
        Object.assign(me, { map: "town" });
        assert.equal(host.command(HOST_PLAYER, { type: "enter", link: guild.door.id }).ok, true);
        run(host, STEP_MS * 4);

        const receptionist = host.battle.actor(guild.folk.find(({ role }) => role === "receptionist").id);

        put(me, [receptionist.square[0], receptionist.square[1] + 2]);
        Object.assign(me, { map: receptionist.map });
        assert.equal(host.command(HOST_PLAYER, { type: "talk", with: receptionist.id }).ok, true);

        const contract = { kind: "parts", title: "Wanted at the guild", from: { id: receptionist.id, name: "Mira", title: "", town: host.world.start.id, townName: "Home", post: "guild" }, given: 0, state: "open", count: 0, until: 999, key: "wolfFang", target: { part: "wolfFang", name: "Wolf fang", need: 3 }, reward: { standing: 0, gold: 23 }, text: "" };

        player.standing.take(contract);
        player.progress.stow({ id: "wolfFang" }, 2);
        assert.equal(host.command(HOST_PLAYER, { type: "effect", effect: { report: true } }).reason, "due", "not all of them yet");

        player.progress.stow({ id: "wolfFang" }, 2);

        const gold = player.progress.gold;

        assert.equal(host.command(HOST_PLAYER, { type: "effect", effect: { report: true } }).ok, true);
        assert.equal(player.progress.gold, gold + 23);
        assert.equal(player.progress.held("wolfFang"), 1, "three handed over, one kept");
        assert.equal(player.standing.requests.length, 0);
    });

    it("lets a bog frog's tongue reach two squares off", () => {
        assert.equal(chooseAttack("bogFrog", [0, 0], [2, 1])?.id, "tongue");
        assert.equal(chooseAttack("bogFrog", [0, 0], [4, 0])?.id, "spit");
    });

    it("sends the town's guards after a menace near them, and leaves a harmless creature be", () => {
        const { host, me, middle, radius } = hosted();

        // (The player in the town: its soldiers out)
        run(host, 1000);

        const guards = [...host.soldiers.keys()].map((id) => host.battle.actor(id)).filter((actor) => actor && !actor.dead);

        assert.ok(guards.length > 0, "the town's soldiers are out");

        const guard = guards[0];
        const [gx, gy] = guard.square;
        const add = (id, creature, square, temper) => {
            host.battle.add({ id, kind: "beast", name: CREATURES[creature].name, weapon: CREATURES[creature].weapon, team: WILD, square, ai: "wild", hp: 200, speed: 0.5, chase: 0.5, wild: { creature, tier: 2, temper, guard: 0, roam: 0, leash: 4, pack: id, leader: null, menace: temper !== "defensive" } });

            return host.battle.actor(id);
        };

        const porcupine = add("test-porcupine", "porcupine", [gx + 3, gy], "defensive");

        run(host, 3000);
        assert.ok(porcupine.hp === 200, "the porcupine's left be");

        host.battle.remove(porcupine.id);

        const wolf = add("test-wolf", "wolf", [gx + 3, gy], "aggressive");
        const events = run(host, 6000);

        assert.ok(events.some((event) => event.type === "hit" && event.id === wolf.id && host.soldiers.has(event.by)), "a soldier struck the wolf");
        assert.ok(me && middle && radius);
    });

    it("brings a wild camp to life near a player, as strong as its distance from their home", () => {
        const { host, world, me } = hosted();
        const camp = world.plan.camps.find((each) => CAMP_FOLK[each.faction]);

        put(me, [Math.floor(camp.at[0] + camp.roam + 20), Math.floor(camp.at[1])]);
        Object.assign(me, { hp: 5000, maxHp: 5000 });
        run(host, 600);

        const held = host.wildCamps.get(camp.id);

        assert.ok(held?.ids.length > 0, "its folk are out");
        assert.ok(held.ids.every((id) => host.wild.get(id).camp === camp.id));

        put(me, [Math.floor(camp.at[0] + camp.roam + WILDS.campFar + 200), Math.floor(camp.at[1])]);
        run(host, 600);

        assert.ok(!host.wildCamps.has(camp.id), "let go once far");
    });

    it("keeps a perilous site's master there, gone a long while once slain, and its guards", () => {
        const { host, world, me } = hosted();
        const site = world.plan.sites.find((each) => each.kind === "ruined castle");

        put(me, [Math.floor(site.at[0] + 30), Math.floor(site.at[1])]);
        Object.assign(me, { hp: 1e6, maxHp: 1e6 });
        run(host, 600);

        const held = host.lairs.get(site.id);
        const master = held.ids.map((id) => host.battle.actor(id)).find((actor) => host.wild.get(actor.id).master);

        assert.equal(master.wild.creature, "wightLord");
        assert.equal(master.wild.tier, LAIRS["ruined castle"].master[1]);
        assert.ok(held.ids.length > 1, "its guards with it");
        // (The bones, ghosts and a wraith of its dead, as many of each as it keeps; none of those
        // within on another's post)
        const guards = held.ids.map((id) => host.battle.actor(id)).filter((actor) => !host.wild.get(actor.id).master);
        const within = guards.filter((actor) => actor.map !== "town").map((actor) => `${actor.map}:${Math.floor(actor.x)},${Math.floor(actor.y)}`);

        assert.deepEqual(Object.fromEntries(LAIRS["ruined castle"].guards.map(([kind]) => [kind, guards.filter((actor) => actor.wild.creature === kind).length])), Object.fromEntries(LAIRS["ruined castle"].guards.map(([kind, count]) => [kind, count])));
        assert.equal(new Set(within).size, within.length, within.join(" "));
        // (Within its keep's great hall, by its hoard)
        assert.ok(held.maps.includes(master.map) && host.ground.get(`chest-${site.id}`)?.map === master.map, master.map);

        // Slain: gone till it's back, even after the site's let go and come to again
        master.hp = 1;
        me.map = master.map;
        put(me, [master.square[0] + 3, master.square[1]]);
        host.command(HOST_PLAYER, { type: "engage", target: master.id });
        run(host, 8000);

        assert.ok(host.slain[site.id] > host.battle.time);
        me.map = "town";

        put(me, [Math.floor(site.at[0] + 600), Math.floor(site.at[1])]);
        run(host, 600);
        put(me, [Math.floor(site.at[0] + 30), Math.floor(site.at[1])]);
        run(host, 600);

        assert.ok(!host.lairs.get(site.id).ids.some((id) => host.wild.get(id)?.master), "not back yet");
    });

    it("puts out an elite now and then past the first tier's land, far off, leading its kind, and no other near it or that player a while", () => {
        const { host, world, me } = hosted();
        const home = world.start.at;

        Object.assign(me, { hp: 1e7, maxHp: 1e7 });

        const { elite, at } = walkTillElite(host, me);

        assert.ok(elite, "one put out");

        const leader = host.battle.actor(elite);
        const { creature, pack } = host.wild.get(elite);
        const spec = CREATURES[creature];
        const spawn = leader.spawn.map((v) => v + 0.5);
        const land = tierAt(spawn, [home], landAt(world.plan, ...spawn).biome);
        const tier = Math.min(TIERS, land + ELITES.up);

        // Far stronger than its kind, a tier up on the land's, named for it
        assert.ok(land >= ELITES.least && !spec.perilous);
        assert.equal(leader.name, eliteName(creature));
        assert.equal(leader.wild.tier, tier);
        assert.equal(leader.hp, Math.round(spec.hp * tierPower(tier) * ELITES.hp));
        assert.ok(Math.abs(leader.power.melee - tierPower(tier) * ELITES.power) < 1e-9);
        assert.deepEqual([leader.wild.elite, leader.wild.sight, leader.wild.leash, leader.wild.champion], [true, ELITES.sight, ELITES.loop + ELITES.leash, "elite"]);

        // Put out further off than the rest, clear of the settlements and the roads, the round it
        // walks on dry land
        const off = Math.hypot(spawn[0] - at[0], spawn[1] - at[1]);

        assert.ok(off >= ELITES.from - 3 && off <= ELITES.to + 3, `${Math.round(off)} m off`);
        assert.ok(clearOfSettlements(world.plan, spawn, WILDS.clear - 4));
        assert.ok(!world.maps.town.nearRoad(...spawn, WILDS.road - 4));
        assert.ok(leader.wild.round.length === ELITES.stops && leader.wild.round.every((stop) => !landAt(world.plan, ...stop).water));

        // Leading its kind, as many as a pack of theirs there, at the land's tier
        const escorts = [...host.wild].filter(([id, one]) => one.pack === pack && id !== elite);

        assert.equal(escorts.length, packOf(creature, land) - 1);

        for (const [id, one] of escorts) {
            const escort = host.battle.actor(id);

            assert.deepEqual([one.creature, one.elite, escort.wild.tier, escort.wild.leader, escort.name], [creature, "escort", land, elite, spec.name]);
            assert.ok(!escort.wild.elite);
        }

        // That player has no other a while
        assert.ok(host.eliteRest.get(HOST_PLAYER) > host.battle.time && host.eliteRest.get(HOST_PLAYER) <= host.battle.time + ELITES.rest);

        // All of it kept in a snapshot
        const again = Host.restore(buildWorld({ seed: 2 }), decode(encode(host.snapshot())));

        assert.deepEqual([...again.eliteRest], [...host.eliteRest]);
        assert.deepEqual([again.wild.get(elite).elite, again.battle.actor(elite).wild.sight, again.battle.actor(elite).name], ["lead", ELITES.sight, leader.name]);

        // None other near it: a friend with no elite lately walking all about it, many packs put
        // out near them, none an elite
        host.eliteRest.clear();
        host.join({ id: "guest", hero: { ...HERO, name: "Bea" } });

        const guest = host.battle.actor("guest");
        let roused = 0;

        Object.assign(guest, { hp: 1e7, maxHp: 1e7 });
        Object.assign(me, { square: [Math.floor(spawn[0]) + 120, Math.floor(spawn[1])], path: [], target: null });
        Object.assign(me, { x: me.square[0] + 0.5, y: me.square[1] + 0.5 });

        for (let k = 0; k < 24; k++) {
            const angle = k * 2.4;
            const square = [Math.floor(spawn[0] + Math.cos(angle) * (110 + (k % 4) * 10)), Math.floor(spawn[1] + Math.sin(angle) * (110 + (k % 4) * 10))];

            if (landAt(world.plan, ...square).water) {
                continue;
            }

            put(guest, square);
            roused += run(host, 4000).filter(({ type }) => type === "roused").length;
        }

        assert.ok(roused >= 10, `${roused} packs put out`);
        assert.deepEqual(elitesOf(host), [elite], "no other");

        // Still about a little beyond the rest's reach
        assert.ok(host.battle.actor(elite), "about");

        // Felled, with the player near: its prize on it for them, a piece of gear or a charm, made
        // better than common
        put(guest, [Math.floor(spawn[0]) + 600, Math.floor(spawn[1])]);
        put(me, [leader.square[0] + 1, leader.square[1]]);
        host.battle.afflict(elite, "poison", { by: HOST_PLAYER, damage: 1e7 });
        run(host, 3000);

        const found = [...host.ground.values()].filter((each) => each.for === HOST_PLAYER && each.from === creature);

        assert.ok(host.battle.actor(elite)?.dead ?? true, "felled");
        assert.ok(found.some(({ bundle }) => bundle.items.some(({ id, quality }) => (GEAR[id] || CHARMS[id]) && quality !== "common")), JSON.stringify(found.map(({ bundle }) => bundle)));

        // Its kind let go once every player's further
        put(me, [Math.floor(spawn[0]) + 600, Math.floor(spawn[1]) + 2]);
        run(host, 1500);

        assert.ok(escorts.every(([id]) => !host.battle.actor(id) || host.battle.actor(id).dead), "let go");
    });

    it("puts out one elite for players together, not one each: none while any of them has had one lately, and then none for any of them a while", () => {
        const { host, me } = hosted();

        host.join({ id: "guest", hero: { ...HERO, name: "Bea" } });

        const guest = host.battle.actor("guest");

        Object.assign(me, { hp: 1e7, maxHp: 1e7 });
        Object.assign(guest, { hp: 1e7, maxHp: 1e7 });

        // (Walking together, the guest a step behind)
        const together = (most) => {
            const [hx, hy] = host.world.start.at;

            for (let s = 0; s < most; s++) {
                const at = [Math.floor(hx - 1460 - 4 * s), Math.floor(hy)];

                put(me, at);
                put(guest, [at[0] + 3, at[1]]);
                run(host, 1000);

                if (elitesOf(host).length) {
                    return true;
                }
            }

            return false;
        };

        // The guest's had one lately: none for either of them
        host.eliteRest.set("guest", Infinity);
        assert.equal(together(120), false, "none while one of them rests from the last");

        // Neither has: one between them, and both rest from it
        host.eliteRest.clear();
        assert.equal(together(120), true, "one put out");
        assert.equal(elitesOf(host).length, 1);
        assert.ok(host.eliteRest.get(HOST_PLAYER) > host.battle.time && host.eliteRest.get("guest") === host.eliteRest.get(HOST_PLAYER));

        // Against the two of them (alike: a side of 2), tougher than it'd be against one, and
        // more of its kind with it (a lone kind still alone), each of them tougher too
        const [elite] = elitesOf(host);
        const leader = host.battle.actor(elite);
        const { creature, pack } = host.wild.get(elite);
        const scale = scalingOf(host.strengthOf(HOST_PLAYER).opposition);
        const spec = CREATURES[creature];
        const land = leader.wild.tier - ELITES.up;
        const escorts = [...host.wild].filter(([id, one]) => one.pack === pack && id !== elite).map(([id]) => host.battle.actor(id));
        const alone = packOf(creature, land) - 1;

        assert.equal(host.strengthOf(HOST_PLAYER).strength, 2);
        assert.equal(leader.maxHp, Math.round(spec.hp * tierPower(leader.wild.tier) * ELITES.hp * scale.leader));
        assert.ok(escorts.length >= Math.floor(alone * scale.count) && escorts.length <= Math.ceil(alone * scale.count), `${escorts.length} with it, ${alone} alone`);
        assert.ok(escorts.every((one) => one.maxHp === Math.round(CREATURES[one.wild.creature].hp * tierPower(land) * scale.health)));
    });

    it("keeps more about players together than about one, as many more as the opposition against their side has it, each a little tougher (strength.js)", () => {
        const context = outside(hosted());
        const { host, me } = context;

        host.join({ id: "guest", hero: { ...HERO, name: "Bea" } });

        const guest = host.battle.actor("guest");

        Object.assign(guest, { hp: 5000, maxHp: 5000 });
        put(guest, [me.square[0] + 2, me.square[1]]);

        const scale = scalingOf(host.strengthOf(HOST_PLAYER).opposition);
        let most = 0;
        let packs = 0;

        assert.equal(host.strengthOf(HOST_PLAYER).strength, 2);

        for (let s = 0; s < 40; s++) {
            const events = run(host, 1000);

            Object.assign(me, { hp: me.maxHp });
            Object.assign(guest, { hp: guest.maxHp });

            // (Each roaming one put out as tough as its kind at its tier, a little more)
            for (const { ids } of events.filter(({ type }) => type === "roused")) {
                for (const id of ids) {
                    const one = host.wild.get(id);
                    const actor = host.battle.actor(id);

                    if (one && !one.elite && !one.camp && !one.lair && !one.place && !one.cache && !one.dungeon) {
                        assert.equal(actor.maxHp, Math.round(CREATURES[one.creature].hp * tierPower(one.tier) * scale.health), `${one.creature} at tier ${one.tier}`);
                        packs++;
                    }
                }
            }

            const roaming = about(host).filter((actor) => !actor.dead && !host.wild.get(actor.id)?.elite && Math.hypot(actor.x - me.x, actor.y - me.y) < WILDS.about);

            most = Math.max(most, roaming.length);
        }

        // (More about them than about one, and no more than the opposition has room for)
        assert.ok(packs > 0);
        assert.ok(most > WILDS.count + WILDS.night, `at most ${most} about them`);
        assert.ok(most <= Math.round((WILDS.count + WILDS.night) * scale.count), `at most ${most} about them`);
    });

    it("sends more of a pack into a fight when the side it's fighting grows by one or more, each as tough as the side now has them, those there already as they were; kept in a snapshot (host.js #reinforce)", () => {
        const context = outside(hosted());
        const { host, me } = context;
        // (A pack put out against the player alone, and set on them)
        run(host, 5000);

        const fighting = [...host.packs.keys()][0];
        const foe = about(host).find((actor) => !actor.dead && host.wild.get(actor.id).pack === fighting);

        // (Too tough to fall while they fight)
        Object.assign(foe, { hp: 1e5, maxHp: 1e5 });
        host.command(HOST_PLAYER, { type: "engage", target: foe.id });

        for (let s = 0; s < 30 && foe.target !== HOST_PLAYER; s++) {
            run(host, 1000);
            Object.assign(me, { hp: me.maxHp });
        }

        assert.equal(foe.target, HOST_PLAYER);
        assert.equal(host.packs.get(fighting).strength, 1);

        const again = Host.restore(buildWorld({ seed: 2 }), decode(encode(host.snapshot())));

        assert.deepEqual([...again.packs], [...host.packs]);

        const members = () => about(host).filter((actor) => host.wild.get(actor.id)?.pack === fighting);
        const before = new Map(members().map((actor) => [actor.id, actor.maxHp]));
        const { creature, tier } = host.packs.get(fighting);

        // (Three more players beside them: a side four strong)
        for (const name of ["Bea", "Cy", "Di"]) {
            host.join({ id: name, hero: { ...HERO, name } });
            Object.assign(host.battle.actor(name), { hp: 5000, maxHp: 5000 });
            put(host.battle.actor(name), [me.square[0] + 1, me.square[1] + ["Bea", "Cy", "Di"].indexOf(name)]);
        }

        const events = run(host, 1000);
        const reinforced = events.filter(({ type, pack }) => type === "reinforced" && pack === fighting);
        const scale = scalingOf(host.strengthOf(HOST_PLAYER).opposition);

        assert.equal(host.strengthOf(HOST_PLAYER).strength, 4);
        assert.equal(reinforced.length, 1);
        assert.ok(reinforced[0].ids.length >= 1);
        assert.equal(host.packs.get(fighting).strength, 4);

        for (const id of reinforced[0].ids) {
            const actor = host.battle.actor(id);

            assert.equal(host.wild.get(id).creature, creature);
            assert.equal(actor.maxHp, Math.round(CREATURES[creature].hp * tierPower(tier) * scale.health));
        }

        for (const [id, maxHp] of before) {
            assert.equal(host.battle.actor(id).maxHp, maxHp);
        }

        // (No more while it stays as strong)
        Object.assign(me, { hp: me.maxHp });
        assert.ok(!run(host, 2000).some(({ type, pack }) => type === "reinforced" && pack === fighting));
    });

    it("carries on exactly from a snapshot, the creatures and all", () => {
        const { host } = outside(hosted());

        run(host, 8000);

        const again = Host.restore(buildWorld({ seed: 2 }), decode(encode(host.snapshot())));

        assert.equal(again.wild.size, host.wild.size);

        run(host, 8000);
        run(again, 8000);

        assert.equal(again.checksum(), host.checksum());
        assert.deepEqual([...again.wild.keys()], [...host.wild.keys()]);
    });
});

describe("the wild's elites (creatures.js ELITES, battle.js, spoils.js ELITE_SPOILS)", () => {
    it("leaves far richer spoils on an elite: its kind's gold thrice over, its things likelier, a tome likelier, and always a prize", () => {
        const tally = (creature, tier, elite, n = 3000) => {
            const random = createRandom(11);
            const counts = { gold: 0, nothing: 0, items: {}, tomes: 0 };

            for (let k = 0; k < n; k++) {
                const { gold, items } = rollSpoils(creature, tier, random, CREATURES[creature].tiers[0], { elite });

                counts.gold += gold / n;
                counts.nothing += gold || items.length ? 0 : 1 / n;
                counts.tomes += items.filter(({ id }) => ITEMS[id].use?.learn).length / n;

                for (const { id } of items) {
                    counts.items[id] = (counts.items[id] ?? 0) + 1 / n;
                }
            }

            return counts;
        };

        // Gold thrice over (and a purse on a beast that carries none), never nothing
        const [bandit, eliteBandit] = [tally("bandit", 3, false), tally("bandit", 3, true)];
        const [wolf, eliteWolf] = [tally("wolf", 3, false), tally("wolf", 3, true)];

        assert.ok(Math.abs(eliteBandit.gold / bandit.gold - ELITE_SPOILS.gold) < 0.3, `${eliteBandit.gold} against ${bandit.gold}`);
        assert.equal(wolf.gold, 0);
        assert.ok(eliteWolf.gold > 10 && eliteWolf.nothing === 0, JSON.stringify(eliteWolf));

        // Its kind's things much likelier
        for (const id of ["wolfPelt", "wolfFang"]) {
            assert.ok(eliteWolf.items[id] > wolf.items[id] + 0.25, `${id}: ${eliteWolf.items[id]} against ${wolf.items[id]}`);
        }

        // A tome, on one with hands, before the tiers others carry one at, and likelier
        assert.ok(3 < TOME_DROP.tier && !bandit.tomes);
        assert.ok(Math.abs(eliteBandit.tomes - TOME_DROP.chance * ELITE_SPOILS.tome) < 0.025, `${eliteBandit.tomes}`);
        assert.equal(eliteWolf.tomes, 0, "none on a beast");

        // Its prize: a piece of gear or a charm, never common, mostly fine to rare, now and then better
        const random = createRandom(5);
        const prizes = Array.from({ length: 1000 }, () => elitePrize(3, random));
        const share = (test) => prizes.filter(test).length / prizes.length;

        assert.ok(prizes.every(({ id }) => GEAR[id] || CHARMS[id]));
        assert.ok(Math.abs(share(({ id }) => CHARMS[id]) - ELITE_SPOILS.charm) < 0.05);
        assert.equal(share(({ quality }) => quality === "common"), 0);
        assert.ok(share(({ quality }) => ["fine", "masterwork", "rare"].includes(quality)) > 0.8);
        assert.ok(share(({ quality }) => ["veryRare", "legendary"].includes(quality)) > 0.03);
    });

    // An elite wolf on its round in an open field, and a player; and an ordinary wolf, to compare
    function patrol(seed = 3) {
        const battle = new Battle(field(80), { seed });
        const home = [40, 40];
        const wolf = { creature: "wolf", tier: 3, temper: "aggressive", guard: 0, roam: 12, pack: "e", leader: null, menace: true };

        battle.add({ id: "elite", kind: "beast", name: eliteName("wolf"), weapon: "wolf", team: WILD, square: home, ai: "wild", hp: 5000, speed: 1.4, chase: 3.2, wild: { ...wolf, leash: ELITES.loop + ELITES.leash, elite: true, sight: ELITES.sight, round: eliteRound(home), stop: 0 } });
        battle.add({ id: "player", kind: "player", weapon: "sword", team: "hero", square: [2, 2], hp: 1e6 });

        return { battle, home, elite: battle.actor("elite"), player: battle.actor("player") };
    }

    it("walks its round about where it was put out", () => {
        const { battle, home, elite } = patrol();
        const stops = new Set();

        for (let t = 0; t < 60000; t += 1000) {
            run(battle, 1000);

            const off = Math.hypot(elite.x - home[0] - 0.5, elite.y - home[1] - 0.5);

            assert.ok(off <= ELITES.loop + 3, `${off.toFixed(1)} m from where it was put out`);
            stops.add(elite.wild.stop);
            assert.equal(elite.target, null, "the player far off, left be");
        }

        assert.ok(stops.size >= 4, `${stops.size} stops of its round walked to`);
    });

    it("sees further than its kind, but leaves be anyone who keeps a wide berth, and goes no further after them than a little beyond its round", () => {
        // Further off than its kind sees, but near its round: seen, and gone after
        const { battle, home, elite, player } = patrol();

        put(player, [home[0] + SIGHT + 4, home[1]]);
        run(battle, 1000);
        assert.equal(elite.target, "player", "seen from further than its kind sees");

        // An ordinary wolf as far off doesn't
        const ordinary = new Battle(field(80), { seed: 3 });

        ordinary.add({ id: "wolf", kind: "beast", name: "Wolf", weapon: "wolf", team: WILD, square: home, ai: "wild", hp: 5000, speed: 1.4, chase: 3.2, wild: { creature: "wolf", tier: 2, temper: "aggressive", guard: 0, roam: 0, leash: 24, pack: "w", leader: null, menace: true } });
        ordinary.add({ id: "player", kind: "player", weapon: "sword", team: "hero", square: [home[0] + SIGHT + 4, home[1]], hp: 1e6 });
        run(ordinary, 1000);
        assert.equal(ordinary.actor("wolf").target, null, "its kind sees no further than SIGHT");

        // Off beyond its leash: given up, and back to its round
        put(player, [home[0] + ELITES.loop + ELITES.leash + 6, home[1]]);
        run(battle, 5000);
        assert.equal(elite.target, null, "given up");
        run(battle, 10000);
        assert.ok(Math.hypot(elite.x - home[0], elite.y - home[1]) <= ELITES.loop + 3, "back on its round");

        // A wide berth: walked by, past its round and beyond its leash, never gone after
        const { battle: again, home: there, elite: other, player: passer } = patrol(5);

        for (let y = 2; y < 78; y += 2) {
            put(passer, [there[0] + ELITES.loop + ELITES.leash + 2, y]);
            run(again, 1000);
            assert.equal(other.target, null, `left be at ${y}`);
        }
    });
});
