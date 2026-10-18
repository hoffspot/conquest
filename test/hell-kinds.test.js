// A hell's own kinds (creatures.js): its flayed, six kinds met only in its first two levels, three
// in each, and its gorgers, six more met only in its last two; and what they do that nothing else
// does: the cinder husk's embers and the bloat gorger's bile bursting as they fall (`burst`,
// battle.js BOMBS), fire hardly hurting the cinder husk (`wards`), and the flayed hierarch's curse
// and the chained glutton's bite drawing back into them the life they take (weapons.js `drain`)
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Battle, BOMBS, STEP_MS } from "../client/js/core/battle.js";
import { CREATURES, traitsOf, WILD } from "../client/js/core/creatures.js";
import { THEMES } from "../client/js/core/dungeons/themes.js";
import { NATURAL } from "../client/js/core/weapons.js";
import { parseGrid } from "./helpers.js";

const BREACH = ["flayling", "cinderHusk", "pyreAcolyte"];
const BONE = ["ossuaryPriest", "dirgeWarden", "flayedHierarch"];
const FIRE = ["slagGorger", "forgeBrute", "chainedGlutton"];
const PIT = ["bloatGorger", "pitRavager", "gorgerWarlord"];
const OWN = [...BREACH, ...BONE, ...FIRE, ...PIT];

// An open field (no walls, nothing in the way) `size` squares across
const field = (size) => ({ blocked: parseGrid(Array.from({ length: size }, () => ".".repeat(size))).map((row) => Uint8Array.from(row)) });

function run(battle, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...battle.advance(STEP_MS));
    }

    return events;
}

// One of the wild's creatures in a battle, as the host puts one out (host.js #rouse: its wards too)
function creature(battle, id, kind, square, { hp = 500 } = {}) {
    const { weapon, speed, chase, wards = null } = CREATURES[kind];

    return battle.add({ id, kind: "beast", name: CREATURES[kind].name, weapon, team: WILD, square, ai: "wild", hp, speed, chase, armed: true, wards, wild: { creature: kind, tier: 9, temper: "aggressive", guard: 0, roam: 0, leash: 40, pack: id, leader: null, menace: true, ...traitsOf(kind) } });
}

describe("a hell's flayed (creatures.js)", () => {
    it("are met only in a hell: three of its flayed in its Breach and three in its Halls of Bone, three of its gorgers in its River of Fire and three in its Pit; each of them its own weapon", () => {
        const kinds = (realm) => new Set(THEMES.hell.realms.find(({ id }) => id === realm).packs.flatMap(({ creatures }) => creatures));

        for (const [realm, own] of [["breach", BREACH], ["bone", BONE], ["fire", FIRE], ["pit", PIT]]) {
            assert.deepEqual([...kinds(realm)].filter((kind) => OWN.includes(kind)), own, realm);
        }

        for (const kind of OWN) {
            const spec = CREATURES[kind];

            assert.deepEqual([spec.biomes, spec.tiers], [[], [9, 10]], kind);
            assert.ok(NATURAL[spec.weapon], kind);
            assert.ok(!spec.perilous, `${kind}: robust, not a boss`);
        }

        // (Each of the other dungeons' themes has none of them)
        for (const [id, theme] of Object.entries(THEMES)) {
            if (id !== "hell") {
                assert.ok(!(theme.packs ?? []).some(({ creatures }) => creatures.some((kind) => OWN.includes(kind))), id);
            }
        }
    });

    it("leaves the cinder husk's embers where it falls, glowing a moment, then bursting on its foes about it, never its own kind", () => {
        const battle = new Battle(field(30), { seed: 4 });
        const me = battle.add({ id: "me", kind: "player", weapon: "sword", team: "hero", square: [10, 15], hp: 500 });
        const husk = creature(battle, "husk", "cinderHusk", [11, 15], { hp: 1 });
        const other = creature(battle, "other", "cinderHusk", [12, 16]);
        const far = battle.add({ id: "far", kind: "player", weapon: "sword", team: "hero", square: [20, 15], hp: 500 });

        me.stunnedUntil = far.stunnedUntil = other.stunnedUntil = 1e9;
        battle.afflict("husk", "poison", { by: "me", damage: 50 });

        const events = run(battle, 3000);
        const death = events.find(({ type, id }) => type === "death" && id === "husk");
        const bomb = events.find(({ type }) => type === "bomb");
        const blast = events.find(({ type }) => type === "blast");

        assert.ok(death && bomb && blast, "died, its embers left, and burst");
        assert.equal(husk.dead, true);
        assert.deepEqual([bomb.kind, bomb.id, bomb.x, bomb.y], ["cinders", "husk", husk.x, husk.y]);
        assert.equal(bomb.lands, death.time, "where it fell, as it fell");
        assert.equal(bomb.bursts - bomb.lands, BOMBS.cinders.fuse);
        assert.equal(blast.radius, BOMBS.cinders.radius);
        assert.ok(me.hp < 500, "its foe beside it burnt");
        assert.equal(far.hp, 500, "one further off than it reaches untouched");
        assert.equal(other.hp, 500, "never one of its own");
    });

    it("keeps half of fire's harm off a cinder husk (its wards, as a player's charms do), not other harm", () => {
        const hurt = (wards) => {
            const battle = new Battle(field(30), { seed: 5 });
            const me = battle.add({ id: "me", kind: "player", weapon: "sword", team: "hero", square: [5, 15], hp: 500 });
            const husk = battle.add({ id: "husk", kind: "beast", weapon: "cinderHusk", team: WILD, square: [11, 15], hp: 500, wards });

            husk.stunnedUntil = 1e9;
            me.stunnedUntil = 1e9;
            battle.lob("me", "husk", { kind: "goblinBomb", damage: [40, 40], reach: 12 });
            run(battle, 3500);

            return 500 - husk.hp;
        };

        assert.equal(CREATURES.cinderHusk.wards.fire, 0.5);
        assert.equal(hurt(CREATURES.cinderHusk.wards), Math.round(hurt(null) / 2));
        assert.equal(hurt({ water: 0.5 }), hurt(null), "a ward against another element keeps none of it off");
    });

    it("heals a flayed hierarch by a share of what its flaying curse takes, never past its whole", () => {
        const battle = new Battle(field(30), { seed: 6 });
        const me = battle.add({ id: "me", kind: "player", weapon: "sword", team: "hero", square: [10, 15], hp: 500 });
        const hierarch = creature(battle, "hierarch", "flayedHierarch", [15, 15], { hp: 400 });
        const { drain } = NATURAL.flayedHierarch.attacks.find(({ id }) => id === "flay");

        me.stunnedUntil = 1e9;
        hierarch.hp = 100;

        const events = run(battle, 15000);
        const flays = events.filter(({ type, attack, by }) => type === "hit" && attack === "flay" && by === "hierarch");
        const healed = events.filter(({ type, id, attack }) => type === "healed" && id === "hierarch" && attack === "flay");

        assert.ok(flays.length > 0 && healed.length > 0, "cursed from afar, and healed by it");
        assert.equal(healed[0].amount, Math.max(1, Math.round(flays[0].damage * drain)));
        assert.equal(healed[0].from, "me");
        assert.ok(hierarch.hp <= hierarch.maxHp);

        // (Whole: none more)
        hierarch.hp = hierarch.maxHp;

        const more = run(battle, 8000);

        assert.ok(more.some(({ type, attack }) => type === "hit" && attack === "flay"), "still cursing");
        assert.ok(!more.some(({ type, id }) => type === "healed" && id === "hierarch"), "nothing to heal");
    });

    it("gives the others what makes them their own: the acolyte keeping off and its fire left burning, the priest raising skeletons, the warden's sweep knocking its foe down and its dirge chilling, the flaylings' claws bleeding", () => {
        const attack = (kind, id) => NATURAL[CREATURES[kind].weapon].attacks.flatMap((one) => one.either ?? [one]).find((one) => one.id === id);

        assert.equal(traitsOf("pyreAcolyte").keep, 5);
        assert.equal(attack("pyreAcolyte", "pyre").pool.kind, "lava");
        assert.equal(traitsOf("ossuaryPriest").call.kind, "skeleton");
        assert.ok(attack("dirgeWarden", "sweep").knockdown > 0);
        assert.deepEqual(attack("dirgeWarden", "dirge").afflict, { kind: "slow", chance: 1, look: "frost" });
        assert.equal(attack("flayling", "rake").afflict.kind, "bleed");
        assert.ok(traitsOf("cinderHusk").burst.damage[0] > 0);
    });
});

describe("a hell's gorgers (creatures.js)", () => {
    it("leaves the bloat gorger's bile where it falls, swelling a moment, then bursting on its foes about it, poisoning them", () => {
        const battle = new Battle(field(30), { seed: 7 });
        const me = battle.add({ id: "me", kind: "player", weapon: "sword", team: "hero", square: [10, 15], hp: 500 });
        const gorger = creature(battle, "gorger", "bloatGorger", [11, 15], { hp: 1 });
        const other = creature(battle, "other", "bloatGorger", [12, 16]);

        me.stunnedUntil = other.stunnedUntil = 1e9;
        battle.afflict("gorger", "poison", { by: "me", damage: 50 });

        const events = run(battle, 2500);
        const bomb = events.find(({ type }) => type === "bomb");
        const blast = events.find(({ type }) => type === "blast");

        assert.equal(gorger.dead, true);
        assert.deepEqual([bomb?.kind, bomb?.id], ["bile", "gorger"]);
        assert.equal(bomb.bursts - bomb.lands, BOMBS.bile.fuse);
        assert.equal(blast?.radius, BOMBS.bile.radius);
        assert.ok(me.hp < 500, "its foe beside it hurt");
        assert.equal(other.hp, 500, "never one of its own");
        assert.ok(events.some(({ type, id, kind }) => type === "afflicted" && id === "me" && kind === "poison") || me.afflictions.some(({ kind }) => kind === "poison"), "poisoned");
    });

    it("heals a chained glutton by a share of what its devouring bite takes", () => {
        const battle = new Battle(field(30), { seed: 8 });
        const me = battle.add({ id: "me", kind: "player", weapon: "sword", team: "hero", square: [10, 15], hp: 5000 });
        const glutton = creature(battle, "glutton", "chainedGlutton", [11, 15], { hp: 400 });
        const devour = NATURAL.chainedGlutton.attacks[0].either.find(({ id }) => id === "devour");

        me.stunnedUntil = 1e9;
        glutton.hp = 50;

        const events = run(battle, 30000);
        const bites = events.filter(({ type, attack, by }) => type === "hit" && attack === "devour" && by === "glutton");
        const healed = events.filter(({ type, id, attack }) => type === "healed" && id === "glutton" && attack === "devour");

        assert.ok(bites.length > 0 && healed.length > 0, "bitten, and fed by it");
        assert.equal(healed[0].amount, Math.max(1, Math.round(bites[0].damage * devour.drain)));
        assert.ok(!events.some(({ type, id, attack }) => type === "healed" && id === "glutton" && attack === "smash"), "never by its club");
    });

    it("gives the others what makes them their own: the slag gorger's slag left burning and fire hardly hurting it, the forge brute's club knocking its foe down, the warlord roaring its bloat gorgers to it, the ravager quick and its blows bleeding", () => {
        const attacks = (kind) => NATURAL[CREATURES[kind].weapon].attacks.flatMap((one) => one.either ?? [one]);
        const attack = (kind, id) => attacks(kind).find((one) => one.id === id);

        assert.equal(attack("slagGorger", "slag").pool.kind, "lava");
        assert.equal(CREATURES.slagGorger.wards.fire, 0.5);
        assert.ok(attack("forgeBrute", "smash").knockdown > 0);
        assert.equal(traitsOf("gorgerWarlord").call.kind, "bloatGorger");
        assert.equal(traitsOf("bloatGorger").burst.kind, "bile");
        assert.ok(CREATURES.pitRavager.chase > Math.max(...[...FIRE, ...PIT].filter((kind) => kind !== "pitRavager").map((kind) => CREATURES[kind].chase)));
        assert.ok(attacks("pitRavager").every(({ afflict }) => afflict?.kind === "bleed"));
    });
});
