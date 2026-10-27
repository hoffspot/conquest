// Ambushes (client/js/core/ambush.js; in play, core/host.js #putAmbush, #ambushesAbout, #spring):
// one of the wilds director's cards, a band of the land lying in wait ahead of a player at a place
// made for it, hidden in cover; told as they come near (glimpsed then, those that can be); sprung
// as they walk into it or linger near it, each band its own way, by surprise and no harder; struck
// first, caught out (stunned a moment, its leader's stash theirs); let go once they're far off; at
// night laid for whoever has light about them, and set aside half the time for those with none;
// never in a quiet spell; now and then laid in silence instead of a build-up's hunters.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { AMBUSH, ambushBand, huntersOf, placeOf, STYLES, stylesFor } from "../client/js/core/ambush.js";
import { CACHE_BANDS } from "../client/js/core/caches.js";
import { CREATURES } from "../client/js/core/creatures.js";
import { DIRECTOR, PACING } from "../client/js/core/director.js";
import { HOST_PLAYER, Host } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { createRandom } from "../client/js/core/random.js";
import { decode, encode } from "../client/js/core/wire.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

function run(host, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...host.advance(STEP_MS));
    }

    return events;
}

const put = (actor, [x, y]) => Object.assign(actor, { square: [Math.floor(x), Math.floor(y)], x: Math.floor(x) + 0.5, y: Math.floor(y) + 0.5, path: [], order: null, target: null });
const of = (events, change) => events.filter((event) => event.type === "ambush" && event.change === change);

// A world (seed 2) with its player in it, hard to kill, the orc gone; the director's deck theirs to
// set (`deck`), its ambushes of a `style` (STYLES) whatever the land
function hosted(deck = ["ambush"], style = null) {
    const world = buildWorld({ seed: 2 });
    const host = new Host(world, { populate: false });

    host.join({ id: HOST_PLAYER, hero: HERO });
    host.populate();
    Object.assign(host.battle.actor("orc"), { dead: true, respawnAt: Infinity });

    const me = host.battle.actor(HOST_PLAYER);

    Object.assign(me, { hp: 1e6, maxHp: 1e6 });
    host.travel.set(HOST_PLAYER, { at: [me.x, me.y], walked: 0, next: null, heading: null, deck: [...deck] });

    if (style) {
        const pick = host.random.pickWeighted.bind(host.random);

        host.random.pickWeighted = (items, weight) => items.find((item) => item?.style === style) ?? (items.some((item) => item?.style) ? { style } : pick(items, weight));
    }

    return { host, world, me };
}

// The player walked out of the start town (north-east) till an ambush's laid before them (or, `any`,
// anything's dealt): it (or null)
function walkTo({ host, world, me }, { metres = 2000, step = 8, any = false } = {}) {
    const [sx, sy] = world.start.at;
    const before = host.nextAmbush;
    const finds = host.nextFind;

    for (let d = 0; d <= metres; d += step) {
        put(me, [sx + Math.SQRT1_2 * d, sy + Math.SQRT1_2 * d]);
        me.hp = me.maxHp;
        run(host, 500);

        if (host.nextAmbush > before) {
            return host.ambushes.get(`ambush-${before}`);
        }

        if (any && host.nextFind > finds) {
            return null;
        }
    }

    return null;
}

// Moved on till an ambush's sprung (as long as `most` ms): its event, or null
function untilSprung(host, most = 2000) {
    for (let t = 0; t < most; t += STEP_MS) {
        const sprung = host.advance(STEP_MS).find((event) => event.type === "ambush" && (event.change === "sprung" || event.change === "caught"));

        if (sprung) {
            return sprung;
        }
    }

    return null;
}

// The player stood `metres` short of an ambush's heart, the way they were coming
const shortOf = (me, ambush, metres) => put(me, [ambush.heart[0] - ambush.axis[0] * metres, ambush.heart[1] - ambush.axis[1] * metres]);
const bandOf = (host, ambush) => ambush.ids.map((id) => host.battle.actor(id));

describe("ambushes' rules (core/ambush.js)", () => {
    it("is a card in the director's deck", () => {
        assert.ok(DIRECTOR.cards.includes("ambush"));
    });

    it("lies in wait the land's own way: its bands' (outlaws, goblins, the dead, cultists), its pack hunters', the dark elves' spiders; outlaws where there's none else", () => {
        const styles = (biome, race, dark = false) => stylesFor(biome, race, { dark }).map(({ style }) => style).sort();

        assert.deepEqual(styles("farmland", "human"), ["bandits"]);
        assert.deepEqual(styles("woods", "human"), ["bandits", "wolves"]);
        assert.deepEqual(styles("marsh", "human"), ["cultists", "dead"]);
        assert.deepEqual(styles("mountain", "human"), ["goblins", "wolves"]);
        assert.ok(styles("darkwood", "darkElf").includes("spiders"));
        assert.deepEqual(styles("ocean", "human"), ["bandits"]);
        assert.equal(stylesFor("marsh", "human", { dark: true }).find(({ style }) => style === "dead").weight, 2);
        assert.equal(huntersOf("savannah", "cat"), "hyena");
        assert.equal(huntersOf("snow", "human"), "direWolf");
        assert.equal(huntersOf("woods", "human"), "wolf");
        assert.equal(huntersOf("farmland", "human"), null);
    });

    it("lays each band out its own way: the outlaws' pincer and bowman, the goblins' bombers, the wolves' bait, the dead's and spiders' ring, the cultists' lure", () => {
        const random = createRandom(4);
        const roles = (style, count = 5) => ambushBand(style, "woods", "human", count, random).map(({ role }) => role);

        assert.deepEqual(roles("bandits"), ["lead", "rear", "front", "front", "rear"]);
        assert.equal(ambushBand("bandits", "woods", "human", 5, random)[2].arms, "bow");
        assert.equal(ambushBand("bandits", "woods", "human", 5, random)[0].creature, CACHE_BANDS.bandits.leader);
        assert.ok(ambushBand("goblins", "badlands", "human", 5, random).some(({ creature }) => creature === "goblinBomber"));
        assert.equal(ambushBand("goblins", "snow", "human", 3, random)[0].creature, "troll");
        assert.deepEqual(roles("wolves", 3), ["bait", "front", "rear"]);
        assert.equal(ambushBand("dead", "marsh", "human", 3, random).length, 4);
        assert.ok(ambushBand("dead", "marsh", "human", 5, random).every(({ at: [u, v] }) => Math.abs(Math.hypot(u, v) - 4.5) < 1e-9));
        assert.ok(ambushBand("spiders", "darkwood", "darkElf", 5, random).every(({ creature }) => ["caveSpider", "centipede"].includes(creature)));
        assert.equal(roles("cultists", 4)[0], "lure");

        for (const style of Object.keys(STYLES)) {
            for (const { creature } of ambushBand(style, "woods", "human", 5, random)) {
                assert.ok(CREATURES[creature], `${style}: ${creature}`);
            }
        }
    });

    it("places each on along the way the player's coming, and to their left", () => {
        assert.deepEqual(placeOf([10, 0], [100, 100], [0, 1]), [100, 110]);
        // (Coming south (+y), their left is east (+x))
        assert.deepEqual(placeOf([0, 5], [100, 100], [0, 1]), [105, 100]);
    });
});

describe("an ambush in play (host.js #putAmbush, #ambushesAbout, #spring)", () => {
    it("laid ahead of a player, its band hidden in cover, no one's enemy till it springs; all of them one pack", () => {
        const context = hosted(["ambush"], "bandits");
        const ambush = walkTo(context);
        const { host, me } = context;

        assert.ok(ambush);
        assert.equal(ambush.style, "bandits");
        assert.ok(Math.hypot(ambush.heart[0] - me.x, ambush.heart[1] - me.y) >= AMBUSH.ahead[0] - 2);

        const band = bandOf(host, ambush);

        assert.ok(band.length >= 3);
        assert.ok(band.every((one) => one.hidden === true));
        assert.ok(band.every((one) => !host.battle.hostile(one, me)));
        assert.equal(new Set(band.map((one) => one.wild.pack)).size, 1);
        assert.ok(band.some((one) => one.weapon === "bow"));
        assert.ok(band.every((one) => host.wild.get(one.id).ambush === ambush.id));
    });

    it("told to the first to come within 24 metres, its band glimpsed in its cover (struck at, they could be); sprung once they walk into it, all of them after them at once", () => {
        const context = hosted(["ambush"], "bandits");
        const ambush = walkTo(context);
        const { host, me } = context;

        shortOf(me, ambush, 22);

        let events = run(host, 1000);

        assert.equal(of(events, "told").length, 1);
        assert.equal(of(events, "told")[0].tell, "glint");
        assert.ok(bandOf(host, ambush).every((one) => one.hidden === "glimpsed"));
        assert.ok(bandOf(host, ambush).every((one) => host.battle.hostile(one, me)));
        assert.ok(bandOf(host, ambush).every((one) => one.target === null));

        shortOf(me, ambush, 1);
        events = run(host, 1000);
        assert.equal(of(events, "sprung").length, 1);
        assert.ok(bandOf(host, ambush).every((one) => !one.hidden && one.target === HOST_PLAYER));
        assert.equal(ambush.sprung, true);
        assert.equal(ambush.caught, false);

        events = run(host, 8000);
        assert.ok(events.some((event) => event.type === "attack" && ambush.ids.includes(event.id) && event.target === HOST_PLAYER));
    });

    it("sprung on one who lingers near it after its tell, too", () => {
        const context = hosted(["ambush"], "bandits");
        const ambush = walkTo(context);
        const { host, me } = context;

        shortOf(me, ambush, 15);

        const events = run(host, AMBUSH.waits + 1500);

        assert.equal(of(events, "told").length, 1);
        assert.equal(of(events, "sprung").length, 1);
    });

    it("struck first, glimpsed: caught out, its band stunned a moment, and its leader's stash theirs once it falls", () => {
        const context = hosted(["ambush"], "bandits");
        const ambush = walkTo(context);
        const { host, me } = context;

        shortOf(me, ambush, 20);
        run(host, 600);

        const leader = bandOf(host, ambush).find((one) => host.wild.get(one.id).master);

        put(me, [leader.x, leader.y - 1]);
        host.battle.command(HOST_PLAYER, { type: "engage", target: leader.id });

        const events = run(host, 1500);

        assert.equal(of(events, "caught").length, 1);
        assert.equal(ambush.caught, true);
        assert.ok(bandOf(host, ambush).filter((one) => !one.dead).every((one) => one.stunnedUntil > host.battle.time - 1500));

        leader.hp = 1;

        const fell = run(host, 6000);
        const spoils = fell.filter((event) => event.type === "spoils" && event.from === leader.id);

        assert.equal(spoils.length, 1);

        const bundle = host.ground.get(spoils[0].ground).bundle;

        assert.ok(bundle.gold >= AMBUSH.stash[0]);
        assert.ok(bundle.items.some((item) => item.quality && item.quality !== "common"));
    });

    it("the goblins' snare: the first to step in it rooted a moment as it springs", () => {
        const context = hosted(["ambush"], "goblins");
        const ambush = walkTo(context);
        const { host, me } = context;

        shortOf(me, ambush, 0);

        assert.equal(untilSprung(host).snared, HOST_PLAYER);
        assert.ok(me.snaredUntil > host.battle.time);
        assert.ok(bandOf(host, ambush).some((one) => one.wild.creature === "goblinBomber"));
    });

    it("the wolves' bait: one shown ahead, the rest hidden; sprung once they come within eight metres of it", () => {
        const context = hosted(["ambush"], "wolves");
        const ambush = walkTo(context);
        const { host, me } = context;
        const bait = bandOf(host, ambush).find((one) => ambush.roles[one.id] === "bait");

        assert.ok(bait.lying && !bait.hidden);
        assert.ok(bandOf(host, ambush).filter((one) => one !== bait).every((one) => one.hidden === true));

        put(me, [bait.x - 6, bait.y]);

        const events = run(host, 600);

        assert.equal(of(events, "sprung").length, 1);
    });

    it("the dead: under the earth about its heart, never glimpsed, rising a moment as it springs", () => {
        const context = hosted(["ambush"], "dead");
        const ambush = walkTo(context);
        const { host, me } = context;

        shortOf(me, ambush, 20);
        run(host, 600);
        assert.ok(bandOf(host, ambush).every((one) => one.hidden === true));

        shortOf(me, ambush, 1);
        assert.ok(untilSprung(host));
        assert.ok(bandOf(host, ambush).every((one) => one.stunnedUntil >= host.battle.time + STYLES.dead.rise - STEP_MS));
    });

    it("the cultists' lure: a wounded traveller, no one's enemy, sprung on whoever goes up to them", () => {
        const context = hosted(["ambush"], "cultists");
        const ambush = walkTo(context);
        const { host, me } = context;
        const lure = bandOf(host, ambush).find((one) => ambush.roles[one.id] === "lure");

        assert.equal(lure.name, "Wounded traveller");
        assert.ok(lure.neutral && lure.lying);

        put(me, [lure.x, lure.y - 2]);
        assert.equal(host.command(HOST_PLAYER, { type: "talk", with: lure.id }).ok, true);
        assert.equal(ambush.sprung, true);
        assert.equal(lure.neutral, false);
        assert.equal(lure.name, CREATURES.cultist.name);
    });

    it("let go once they're far off, not fighting it", () => {
        const context = hosted(["ambush"], "bandits");
        const ambush = walkTo(context);
        const { host, me } = context;

        shortOf(me, ambush, AMBUSH.far + 20);

        const events = run(host, 2000);

        assert.equal(of(events, "gone").length, 1);
        assert.ok(!host.ambushes.has(ambush.id));
        assert.ok(ambush.ids.every((id) => !host.battle.actor(id)));
    });

    it("kept in a snapshot, and carried on from it the same", () => {
        const context = hosted(["ambush"], "bandits");
        const ambush = walkTo(context);
        const { host } = context;
        const restored = Host.restore(buildWorld({ seed: 2 }), decode(encode(host.snapshot())));

        assert.deepEqual(restored.ambushes.get(ambush.id), ambush);
        run(host, 1000);
        run(restored, 1000);
        assert.equal(restored.checksum(), host.checksum());
    });
});

describe("when an ambush is dealt (host.js #deal, #pace)", () => {
    it("never in a quiet spell after a hard fight: set aside for the next card", () => {
        const context = hosted(["ambush", "remains"]);
        const { host } = context;

        host.travel.get(HOST_PLAYER).pace = { fight: null, lastFight: 0, calm: 0, quietUntil: Infinity, build: null };

        const before = host.nextFind;

        walkTo(context, { metres: 1200 });
        assert.equal(host.nextAmbush, 1);
        assert.ok(host.nextFind > before);
    });

    it("at night, for those with no light about them, set aside half the time", () => {
        const context = hosted(["ambush", "remains"], "bandits");
        const { host } = context;

        host.war.turn = Math.ceil(host.war.turn / 60) * 60 + 34;
        host.war.clock = 0;
        host.random.chance = (share) => share === AMBUSH.dark;

        walkTo(context, { metres: 1200, any: true });
        assert.equal(host.nextAmbush, 1);
        assert.ok(host.nextFind > 1);
    });

    it("now and then laid in silence instead of a build-up's hunters after a long calm", () => {
        const context = hosted(["remains"], "bandits");
        const { host, me } = context;
        const [sx, sy] = context.world.start.at;

        put(me, [sx + 300, sy + 300]);
        host.travel.get(HOST_PLAYER).heading = [Math.SQRT1_2, Math.SQRT1_2];
        host.travel.get(HOST_PLAYER).walked = -1e6;
        host.travel.get(HOST_PLAYER).pace = { fight: null, lastFight: host.battle.time - PACING.calm, calm: PACING.calmMetres, quietUntil: 0, build: null };
        host.random.chance = (share) => share === AMBUSH.silent;

        const events = run(host, 2000);

        assert.ok(events.some((event) => event.type === "pace" && event.change === "silent"));
        assert.equal(host.ambushes.size, 1);
        assert.equal([...host.ambushes.values()][0].silent, true);
    });
});
