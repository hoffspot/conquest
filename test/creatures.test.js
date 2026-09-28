// The wild's creatures (client/js/core/creatures.js, core/battle.js, core/host.js; docs/WILDS.md):
// each with a look and a weapon, about a match for a new adventurer near home and stronger the
// further out; the uniques only in their people's lands, the mightiest only in the perilous
// places; about eight kept near each player out in the wilds, out of sight at first, let go once
// far; wandering, and fighting as their temper has it (a pack together); the people's soldiers
// going after those that are a menace; the wild camps and the perilous sites come to life near a
// player; and all of it carried on exactly from a snapshot
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LOOKS } from "../client/js/beasts/looks.js";
import { KINDS, STEP_MS } from "../client/js/core/battle.js";
import { CAMP_FOLK, candidatesAt, CREATURES, LAIRS, livesOn, packOf, TIER_LAND, tierAt, tierPower, TIERS, WILD } from "../client/js/core/creatures.js";
import { HOST_PLAYER, Host, WILDS } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { SETTLEMENT_KINDS } from "../client/js/core/setpieces/town.js";
import { armsOf, chooseAttack, NATURAL, weaponOf, WEAPONS } from "../client/js/core/weapons.js";
import { decode, encode } from "../client/js/core/wire.js";
import { FACTIONS } from "../client/js/core/worldplan/plan.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });
const TEMPERS = new Set(["aggressive", "territorial", "defensive"]);

function run(host, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...host.advance(STEP_MS));
    }

    return events;
}

const put = (actor, [x, y]) => Object.assign(actor, { square: [x, y], x: x + 0.5, y: y + 0.5, to: null, path: [], order: null, target: null, spawn: [x, y] });

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
                assert.equal(attack.kind === "ranged", Boolean(attack.projectile), `${id} ${attack.id}: a projectile`);
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
    it("keeps about eight creatures near a player out in the wilds, put out of sight, and lets them go once far", () => {
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

        for (const command of [{ type: "move", to: [me.square[0] - 3, me.square[1]] }, { type: "engage", target: "test-tusker" }, { type: "cast", spell: "heal" }]) {
            assert.deepEqual(host.command(HOST_PLAYER, command), { ok: false, reason: "down" }, command.type);
        }

        // (Up again: the tusker gone, they can go)
        host.battle.remove("test-tusker");
        run(host, me.downUntil - host.battle.time + STEP_MS);
        assert.equal(host.command(HOST_PLAYER, { type: "move", to: [me.square[0] - 3, me.square[1]] }).ok, true);
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

        // Slain: gone till it's back, even after the site's let go and come to again
        master.hp = 1;
        put(me, [master.square[0] + 3, master.square[1]]);
        host.command(HOST_PLAYER, { type: "engage", target: master.id });
        run(host, 8000);

        assert.ok(host.slain[site.id] > host.battle.time);

        put(me, [Math.floor(site.at[0] + 600), Math.floor(site.at[1])]);
        run(host, 600);
        put(me, [Math.floor(site.at[0] + 30), Math.floor(site.at[1])]);
        run(host, 600);

        assert.ok(!host.lairs.get(site.id).ids.some((id) => host.wild.get(id)?.master), "not back yet");
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
