// Invasions (core/invasions.js, core/host.js #invade): five minutes into a character's time in a
// town, a band of bandits comes down one of its roads, and the town's own people march out to
// meet them at its edge, the stronger side, two squads of bomb throwers among them. In a
// character's first the raiders leave them be till they strike one; in those after, they don't.
// Both sides reinforced a while from the first blow; then beaten down, the raiders run (the
// bandits fight to the last); whoever felled them is thanked for it. By night, now
// and then, the Behemoth of the Rift comes in a band's place, the town's whole strength against it.
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

let ALARM;
let BANDS;
let BEHEMOTH;
let BEHEMOTH_REWARD;
let ENGINES;
let COMMANDER;
let JOB;
let TROPHY;
let FIELD;
let FORMATION;
let behemothReward;
let behemothSides;
let isBehemoth;
let wayToward;
let RIFT;
let DAY;
let bandFor;
let raiderName;
let NATURAL;
let ROLES;
let BUDGET;
let InvasionBudget;
let SIZE;
let isSize;
let sizeFor;
let BOMBERS;
let bombersOf;
let INVASION;
let REWARD;
let clockOf;
let criesOf;
let dueAfter;
let isDue;
let raiderArms;
let rewardOf;
let sidesOf;
let thanksOf;
let OPENINGS;
let BOMBS;
let FOE_MS;
let KINDS;
let STEP_MS;
let Host;
let HOST_PLAYER;
let SNAPSHOT_STEPS;
let createRandom;
let compass;
let soldierLook;
let WEAPONS;
let weaponOf;
let buildWorld;
let decode;
let encode;
let world;

before(async () => {
    ({ ALARM, BANDS, BEHEMOTH, BEHEMOTH_REWARD, BOMBERS, ENGINES, INVASION, REWARD, SIZE, bandFor, behemothReward, behemothSides, bombersOf, clockOf, criesOf, dueAfter, isBehemoth, isDue, isSize, raiderArms, raiderName, rewardOf, sidesOf, sizeFor, thanksOf } = await import("../client/js/core/invasions.js"));
    ({ RIFT } = await import("../client/js/core/creatures.js"));
    ({ DAY } = await import("../client/js/core/daytime.js"));
    ({ FORMATION, ROLES } = await import("../client/js/core/formation.js"));
    ({ COMMANDER, FIELD, JOB, TROPHY } = await import("../client/js/core/engagement.js"));
    ({ BUDGET, InvasionBudget } = await import("../client/js/app/budget.js"));
    ({ OPENINGS } = await import("../client/js/core/crying.js"));
    ({ BOMBS, FOE_MS, KINDS, STEP_MS } = await import("../client/js/core/battle.js"));
    ({ Host, HOST_PLAYER, SNAPSHOT_STEPS } = await import("../client/js/core/host.js"));
    ({ wayToward } = await import("../client/js/core/settlements.js"));
    ({ createRandom } = await import("../client/js/core/random.js"));
    ({ compass } = await import("../client/js/core/ways.js"));
    ({ soldierLook } = await import("../client/js/characters/soldiers.js"));
    ({ NATURAL, WEAPONS, weaponOf } = await import("../client/js/core/weapons.js"));
    ({ buildWorld } = await import("../client/js/core/overworld.js"));
    ({ decode, encode } = await import("../client/js/core/wire.js"));
    world = buildWorld({ seed: 2 });
});

// A host with its player in the start town (its time in towns as `invasion` has it), the events
// of everything played kept
function inTown({ invasion = null, rules = undefined } = {}) {
    const host = new Host(world, { populate: false, ...(rules ? { rules } : {}) });

    host.join({ id: HOST_PLAYER, hero: HERO, ...(invasion ? { progress: { invasion } } : {}) });

    return { host, me: host.battle.actor(HOST_PLAYER), player: host.players.get(HOST_PLAYER), events: [] };
}

// Played on `ms`, a second at a time (or till `until` says), the invasions' events kept
function play(game, ms, until = () => false) {
    for (let played = 0; played < ms && !until(); played += 1000) {
        game.events.push(...game.host.advance(1000).filter(({ type }) => type === "invasion"));
    }
}

const standing = (host, ids) => ids.filter((id) => !host.battle.actor(id)?.dead);

// The player struck a raider: it set on, held beside them (it'd go back to its place in its line,
// as it's no enemy of theirs yet) and played on till they've landed a blow on it (`fell`: it
// falls to it). Whether they did: one felled by another first (the town's soldiers range about
// the player as its bodies wheel and break: core/engagement.js), not
function strike(game, id, { fell = false } = {}) {
    const { host, me } = game;
    const raider = host.battle.actor(id);

    raider.hp = fell ? 1 : 1000;
    raider.maxHp = Math.max(raider.maxHp, raider.hp);
    assert.ok(host.command(HOST_PLAYER, { type: "engage", target: id }).ok, "set on it");

    for (let k = 0; k < 400; k++) {
        host.battle.place(id, "town", [me.square[0] + 1, me.square[1]]);

        const events = host.advance(STEP_MS);

        game.events.push(...events.filter(({ type }) => type === "invasion"));

        if (events.some((event) => event.type === (fell ? "death" : "hit") && event.id === id && event.by === HOST_PLAYER)) {
            return true;
        }

        if (fell && events.some((event) => event.type === "death" && event.id === id)) {
            return false;
        }
    }

    assert.fail(`never struck ${id}`);
}

describe("invasions (core/invasions.js)", () => {
    it("keeps a character's time in towns safe to read: the first five minutes in, the rest half an hour to an hour apart", () => {
        assert.deepEqual(clockOf(null), { seen: 0, clock: 0, due: INVASION.first, place: null, here: 0 });
        assert.deepEqual(clockOf({ seen: 2, clock: -5, due: "soon", place: 3, here: 7.5 }), { seen: 2, clock: 0, due: INVASION.every[0], place: null, here: 7 });
        assert.equal(INVASION.first, 5 * 60000);
        assert.deepEqual([...INVASION.kinds], ["town", "city", "capital"]);

        const random = createRandom(7);

        assert.equal(dueAfter(0, random), INVASION.first);

        for (let k = 0; k < 50; k++) {
            const due = dueAfter(1 + (k % 3), random);

            assert.ok(due >= 30 * 60000 && due < 60 * 60000, `${due}`);
        }

        const clock = { seen: 0, clock: INVASION.first, due: INVASION.first, place: "town-1", here: INVASION.settleFirst };

        assert.ok(isDue(clock));
        assert.ok(!isDue({ ...clock, place: null }), "only in a town");
        assert.ok(!isDue({ ...clock, clock: INVASION.first - 1 }), "not before it's due");
        assert.ok(!isDue({ ...clock, seen: 1, due: INVASION.every[0], clock: INVASION.every[0] }), "never in the first few minutes in a town, after the first");
        assert.ok(isDue({ ...clock, seen: 1, due: INVASION.every[0], clock: INVASION.every[0], here: INVASION.settle }));
    });

    it("gives the town the bigger side, and two squads of bomb throwers at least two strong, each people's with its own bombs", () => {
        for (const size of [40, INVASION.size, 300, 400]) {
            const { invaders, defenders, bombers, squads } = sidesOf(size);

            assert.equal(invaders + defenders, size);
            assert.ok(defenders > invaders * 1.3, `${size}: the town's the bigger side`);
            assert.ok(bombers >= 2 && squads === 2, `${size}: bomb throwers`);
        }

        // (Each people's own bombs: as strong as one another, each its own kind, tossing whoever
        // they burst by; the orcs' goblin bombs, and any other people's)
        const peoples = ["human", "elf", "darkElf", "cat", "lizard", "orc"];
        const kinds = new Set();

        assert.deepEqual(Object.keys(BOMBERS).sort(), [...peoples].sort());

        for (const people of peoples) {
            const { weapon, name } = BOMBERS[people];
            const attacks = weaponOf(weapon).attacks;
            const bomb = attacks.find(({ kind }) => kind === "ranged");

            assert.ok(attacks.some(({ kind }) => kind === "melee"), `${people}: a sword up close`);
            assert.ok(BOMBS[bomb.bomb]?.toss > 0 && BOMBS[bomb.bomb].radius >= 2, `${people}: ${bomb.bomb} further off, tossing whoever they burst by`);
            assert.deepEqual(bomb.damage, weaponOf(BOMBERS.orc.weapon).attacks.find(({ kind }) => kind === "ranged").damage, `${people}: as strong as the rest`);
            assert.ok(name && !kinds.has(bomb.bomb), `${people}: its own`);
            kinds.add(bomb.bomb);
        }

        assert.equal(weaponOf(BOMBERS.orc.weapon).attacks.find(({ kind }) => kind === "ranged").bomb, "goblinBomb");
        assert.equal(bombersOf("bandits"), BOMBERS.orc);
        assert.equal(BOMBS.sunJar.afflict.kind, "burn", "the cat folk's naphtha setting them alight");
        assert.equal(BOMBS.gasBladder.afflict.kind, "poison", "the lizard folk's swamp gas poisoning them");
        assert.equal(BOMBS.shadowfireOrb.afflict.kind, "wither", "the dark elves' shadowfire withering them");
        assert.ok(BOMBS.grenado.toss > BOMBS.goblinBomb.toss && BOMBS.starfirePod.radius > BOMBS.goblinBomb.radius, "a grenado throwing them furthest; starfire bursting widest");
    });

    it("thanks whoever felled raiders: a bounty for each, merit and standing that grow, and the lord's reward for a share of them", () => {
        assert.deepEqual(rewardOf({ felled: 0, of: 50 }), { gold: 0, merit: 0, thanks: 0, big: false });

        const one = rewardOf({ felled: 1, of: 50 });
        const some = rewardOf({ felled: 7, of: 50 });
        const share = rewardOf({ felled: 8, of: 50 });

        assert.equal(one.gold, REWARD.bounty);
        assert.ok(some.merit > one.merit && some.thanks > one.thanks && !some.big, "more for more");
        assert.ok(share.big, "15% of them: the lord's own reward");
        assert.equal(share.gold, 8 * REWARD.bounty + REWARD.purse);
        assert.ok(!rewardOf({ felled: 8, of: 50, held: false }).big, "not for a town that fell");
        assert.ok(rewardOf({ felled: 500, of: 50 }).merit <= REWARD.merit[2] + REWARD.bigMerit, "merit kept in bounds");
    });

    it("cries the raiders' road and calls every able hand to defend the town, each band its own way, in no more than 90 characters", () => {
        for (const band of Object.keys(BANDS)) {
            for (const way of ["north", "south", "east", "west", "north-east", "north-west", "south-east", "south-west"]) {
                for (const cry of criesOf(band, way)) {
                    assert.ok(cry.length <= 90, cry);
                    assert.ok(cry.includes(`${way} road`), cry);
                }
            }

            assert.ok(thanksOf(band).length <= 90, thanksOf(band));
        }

        assert.match(criesOf("bandits", "north")[0], /^Bandits on the north road!.*able hand/);
        assert.ok(ALARM.length <= 90 && !OPENINGS.includes(ALARM), "his alarm, not one of his usual openings");
        assert.match(criesOf("bandits", "north")[1], /Adventurers/);

        // (Each band cried and thanked for in words of its own)
        const bands = Object.keys(BANDS);

        assert.equal(new Set(bands.map((band) => criesOf(band, "north")[0])).size, bands.length);
        assert.equal(new Set(bands.map((band) => thanksOf(band))).size, bands.length);
        assert.match(criesOf("corsairs", "west")[0], /^Corsairs up from the shore, on the west road!/);
        assert.match(thanksOf("cult"), /^The cult's fires are put out!/);
    });

    it("arms and dresses the bandits as cutthroats, brutes and archers, their chiefs cloaked, in no people's livery", () => {
        const bandits = BANDS.bandits;

        for (const role of ["front", "heavy", "archer"]) {
            for (let k = 0; k < 3; k++) {
                assert.ok(WEAPONS[raiderArms("bandits", role, k)], `${role} ${k}`);
            }
        }

        assert.equal(bandits.mix.caster + bandits.mix.healer, 0, "no casters or healers");

        const livery = (equipment) => equipment.filter((id) => /\./.test(id));
        const cutthroat = soldierLook({ people: "bandits", weapon: "cleaver", sex: "m", seed: 4 });
        const archer = soldierLook({ people: "bandits", weapon: "bow", sex: "f", seed: 5 });
        const chief = soldierLook({ people: "bandits", weapon: "sword", sex: "m", seed: 6, captain: true });

        assert.ok(cutthroat.equipment.includes("cleaver") && cutthroat.equipment.includes("roundShield"));
        assert.ok(archer.equipment.includes("bow") && archer.equipment.includes("quiver") && !archer.equipment.includes("sword"));
        assert.ok(chief.equipment.includes("travelCloak") && chief.equipment.includes("sword"));
        assert.deepEqual([...livery(cutthroat.equipment), ...livery(archer.equipment), ...livery(chief.equipment)], []);
        assert.ok(Object.entries(BOMBERS).every(([people, { weapon }]) => soldierLook({ people, weapon, seed: 3 }).equipment.includes("sword")), "the town's bomb throwers carry a sword");
    });
});

describe("an invasion in the world (core/host.js #invade)", () => {
    it("comes five minutes into a character's time in town, down one of its roads, the town's people marching out to meet the raiders", () => {
        const game = inTown();
        const { host, player } = game;

        play(game, INVASION.first - 1000);
        assert.equal(host.invasions.length, 0, "not before five minutes");

        play(game, 2000);
        assert.equal(host.invasions.length, 1);

        const [invasion] = host.invasions;
        const [coming] = game.events;
        const raiders = invasion.invaders.map((id) => host.battle.actor(id));
        const defenders = invasion.defenders.map((id) => host.battle.actor(id));
        const out = Math.hypot(invasion.from[0] - invasion.middle[0], invasion.from[1] - invasion.middle[1]);

        assert.equal(coming.change, "coming");
        assert.equal(coming.place, player.progress.invasion.place);
        assert.equal(coming.way, compass(invasion.middle, invasion.from));
        assert.deepEqual(coming.spared, [HOST_PLAYER]);
        assert.ok(Math.abs(out - (invasion.edge + INVASION.out)) < 1, "out beyond the town's edge");
        assert.ok(raiders.length >= 40 && defenders.length > raiders.length, "the town the stronger");
        assert.ok(raiders.every((one) => one.team === "bandits" && one.lone && one.kind === "soldier"));
        assert.ok(defenders.every((one) => one.team === "human"), "the town's own people");
        assert.equal(defenders.filter((one) => one.weapon === BOMBERS.human.weapon).length, 2 * sidesOf(INVASION.size).bombers, "two squads of bomb throwers");
        assert.ok(defenders.filter((one) => one.weapon === BOMBERS.human.weapon).every((one) => one.name === "Human grenadier"), "the humans' grenadiers");

        const chiefs = raiders.filter((one) => one.name === "Bandit chief");

        assert.ok(chiefs.length >= 1 && chiefs.every((one) => one.maxHp > KINDS.soldier.hp), "chiefs, harder to bring down");
        assert.ok(raiders.some((one) => one.name === "Bandit cutthroat") && raiders.some((one) => one.name === "Bandit brute") && raiders.some((one) => one.name === "Bandit archer"));
        assert.ok(host.battle.formations[invasion.formations.invaders].to && host.battle.formations[invasion.formations.defenders].to, "both lines marching");

        // (The player in it: their next half an hour to an hour of their time in towns from now)
        const clock = player.progress.invasion;

        assert.equal(clock.seen, 1);
        assert.ok(clock.clock < 5000 && clock.due >= INVASION.every[0] && clock.due < INVASION.every[1]);
        assert.deepEqual(player.progress.toJSON().invasion, clock, "kept with the character");
    });

    it("leaves a character be in their first till they strike a raider: that one theirs to fight from then on, its fellows not", () => {
        const game = inTown({ invasion: { clock: INVASION.first } });
        const { host, me } = game;

        play(game, INVASION.settleFirst + 2000, () => host.invasions.length > 0);

        const [invasion] = host.invasions;
        const [struck, ...others] = invasion.invaders;

        assert.ok(invasion.invaders.every((id) => !host.battle.hostile(host.battle.actor(id), me)), "none of them the player's enemy");
        assert.ok(invasion.invaders.every((id) => host.invader(id)), "each to be fought, not talked to (the game's)");

        strike(game, struck);
        assert.ok(host.battle.hostile(host.battle.actor(struck), me));

        // (Long after the grudge of the blow's worn off: theirs still; its fellows still not)
        play(game, FOE_MS + 5000);

        const fellows = others.filter((id) => host.battle.actor(id) && !host.battle.actor(id).dead);

        assert.ok(host.battle.hostile(host.battle.actor(struck), me));
        assert.ok(fellows.length && fellows.every((id) => !host.battle.hostile(host.battle.actor(id), me)), "its fellows leave them be");
    });

    it("leaves a character be in their first though they stand among the town's line in the thick of it, watching the raiders strike its soldiers: none of them their enemy, none at them", () => {
        const game = inTown({ invasion: { clock: INVASION.first } });
        const { host, me } = game;

        play(game, INVASION.settleFirst + 2000, () => host.invasions.length > 0);

        const [invasion] = host.invasions;
        const raiders = () => invasion.invaders.map((id) => host.battle.actor(id)).filter((actor) => actor && !actor.dead);
        const hits = [];
        let among = false;

        Object.assign(me, { hp: 1e6, maxHp: 1e6 });

        for (let t = 0; t < 40000; t += STEP_MS) {
            // (Once the first blow's struck, the player put by whichever of the town's is nearest a raider)
            if (!among && raiders().some((actor) => actor.attack)) {
                const nearest = invasion.defenders.map((id) => host.battle.actor(id)).filter((actor) => actor && !actor.dead).sort((a, b) => Math.min(...raiders().map((r) => Math.hypot(r.x - a.x, r.y - a.y))) - Math.min(...raiders().map((r) => Math.hypot(r.x - b.x, r.y - b.y))))[0];

                host.battle.place(HOST_PLAYER, "town", nearest.square);
                among = true;
            }

            hits.push(...host.advance(STEP_MS).filter((event) => event.type === "hit" && (event.id === HOST_PLAYER || event.by === HOST_PLAYER)));
            assert.ok(raiders().every((actor) => actor.target !== HOST_PLAYER && !host.battle.hostile(actor, me)), `at ${t} ms: none of them their enemy`);
        }

        assert.ok(among, "in the thick of it");
        assert.deepEqual(hits, [], "no blow struck at them, nor by them");
        assert.deepEqual(invasion.struck, []);
    });

    it("fights a character from the start in every invasion after their first", () => {
        const game = inTown({ invasion: { seen: 1, clock: INVASION.every[1], due: INVASION.every[0] } });
        const { host, me } = game;

        play(game, INVASION.settle - 2000);
        assert.equal(host.invasions.length, 0, "not in their first few minutes in the town");

        play(game, 4000);
        assert.equal(host.invasions.length, 1);
        assert.deepEqual(host.invasions[0].spared, []);
        assert.ok(host.invasions[0].invaders.every((id) => host.battle.hostile(host.battle.actor(id), me)));
        assert.equal(host.players.get(HOST_PLAYER).progress.invasion.seen, 2);
    });

    it("is fought out by the town's people: both sides reinforced a while from the first blow, the town always the stronger, the bandits fighting to the last; it's let go of after, and the war's none the worse", () => {
        const game = inTown({ invasion: { clock: INVASION.first } });
        const { host } = game;
        const garrisons = () => host.war.towns.map(({ id, garrison }) => [id, garrison]);
        const before = garrisons();

        play(game, INVASION.settleFirst + 2000, () => host.invasions.length > 0);

        const [invasion] = host.invasions;
        const ids = new Set([...invasion.invaders, ...invasion.defenders]);
        const sides = [];
        let broke = null;

        play(game, INVASION.lasts, () => {
            [...invasion.invaders, ...invasion.defenders].forEach((id) => ids.add(id));

            // (How each side stands while it's reinforced)
            if (invasion.fightAt !== null && invasion.broke === null && host.battle.time - invasion.fightAt < INVASION.reinforce.lasts) {
                sides.push([standing(host, invasion.invaders).length, standing(host, invasion.defenders).length]);
            }

            if (broke === null && invasion.broke !== null) {
                broke = { raiders: standing(host, invasion.invaders).length, at: invasion.broke };
            }

            return !host.invasions.length;
        });

        const changes = game.events.map(({ change }) => change);

        assert.equal(invasion.band, "bandits");
        assert.deepEqual(
            changes.filter((change) => change !== "reinforced"),
            ["coming", "charge", "repelled", "over"],
        );
        assert.ok(changes.filter((change) => change === "reinforced").length >= INVASION.reinforce.lasts / INVASION.reinforce.every / 2, "reinforced, again and again");
        assert.ok(invasion.came > invasion.size, `more came up (${invasion.came} of them)`);
        assert.ok(invasion.held, "the town held");
        assert.ok(sides.length > 0 && sides.every(([raiders, defenders]) => defenders > raiders), "the town the stronger all the while");
        assert.ok(broke.at - invasion.fightAt >= INVASION.reinforce.lasts, `none breaking while it's reinforced (${(broke.at - invasion.fightAt) / 1000} s)`);
        assert.equal(broke.raiders, 0, "the bandits fought to the last");
        assert.ok([...ids].every((id) => !host.battle.actor(id) && !host.soldiers.has(id)), "all of them let go of");
        assert.ok(!Object.keys(host.battle.formations).some((id) => id.startsWith(invasion.id)), "and their lines");
        assert.deepEqual(garrisons(), before, "no town's garrison lost to the war for it");
    });

    it("puts each side's reinforcements behind its hindmost rank as it stood, in ranks of five, not each newcomer a rank behind the last (a large wave hundreds of metres off its line): host.js #reinforceInvasion", () => {
        const game = inTown({ invasion: { clock: INVASION.first } });
        const { host } = game;

        play(game, INVASION.settleFirst + 2000, () => host.invasions.length > 0);

        const [invasion] = host.invasions;
        const lines = [invasion.formations.invaders, invasion.formations.defenders];
        const hindmost = (line) => Math.max(0, ...host.battle.actors.filter((actor) => !actor.dead && actor.formation?.id === line).map(({ formation: { slot } }) => slot[1]));
        const waves = [];

        for (let k = 0; k < (INVASION.reinforce.lasts + 60000) / STEP_MS && waves.length < 4 && host.invasions.length; k++) {
            const backs = new Map(lines.map((line) => [line, hindmost(line)]));

            for (const event of host.advance(STEP_MS)) {
                if (event.type === "invasion" && event.change === "reinforced") {
                    for (const line of lines) {
                        const depths = event.ids.map((id) => host.battle.actor(id)).filter((actor) => actor?.formation?.id === line).map(({ formation: { slot } }) => slot[1]);

                        if (depths.length) {
                            waves.push({ line, back: backs.get(line), depths });
                        }
                    }
                }
            }
        }

        assert.ok(waves.some(({ depths }) => depths.length > 5), "a wave of more than five");

        for (const { line, back, depths } of waves) {
            const ranks = [...new Set(depths.map((depth) => depth.toFixed(3)))].map(Number).sort((a, b) => a - b);
            const deepest = Math.max(...depths);
            const what = `${depths.length} come to ${line}, its hindmost rank ${back.toFixed(1)} m back: ${ranks.join(", ")}`;

            assert.equal(ranks.length, Math.ceil(depths.length / 5), `in ranks of five: ${what}`);
            assert.ok(ranks.every((depth, k) => k === 0 || Math.abs(depth - ranks[k - 1] - FORMATION.rank) < 1e-6), `each a rank behind the one before: ${what}`);
            assert.ok(deepest <= back + FORMATION.rank * Math.ceil(depths.length / 5) + 1e-6, `no further back than they need: ${what}`);
        }
    });

    it("charges once its lines are near, the town's halting first while its archers loose: both run at each other and meet between them, everyone of either side who fights up close going after the other; few of their lines standing in their ranks with an enemy near", () => {
        const game = inTown({ invasion: { clock: INVASION.first } });
        const { host } = game;

        play(game, INVASION.settleFirst + 2000, () => host.invasions.length > 0);

        const [invasion] = host.invasions;
        const { engagement } = invasion;
        // (Their lines' centres: core/engagement.js)
        const [theirs, ours] = [host.battle.formations[invasion.formations.invaders], host.battle.formations[invasion.formations.defenders]];
        const apart = () => Math.hypot(theirs.anchor[0] - ours.anchor[0], theirs.anchor[1] - ours.anchor[1]);
        const charges = [];
        let before = null;
        let halted = null;

        // (Marching on each other, till they're near; halting while the town's archers loose)
        for (let k = 0; k < 4000 && invasion.charged === null; k++) {
            before = { apart: apart(), speeds: [theirs.speed, ours.speed], raiders: [...theirs.anchor] };
            charges.push(...host.advance(STEP_MS).filter(({ type, change }) => type === "invasion" && change === "charge"));
            halted ??= engagement.phase === "volley" ? { at: host.battle.time, apart: apart() } : null;
        }

        assert.ok(invasion.charged !== null, "they charged");
        assert.ok(halted && halted.apart <= FIELD.volley.at + 1, `halted ${halted?.apart.toFixed(1)} m apart`);
        assert.ok(invasion.charged - halted.at >= FIELD.volley.ms, "the archers loosing a while first");
        assert.deepEqual(before.speeds, [BANDS.bandits.march, INVASION.march], "marching till then");
        assert.deepEqual([theirs.charge, ours.charge, theirs.speed, ours.speed], [true, true, FIELD.charge.speed, FIELD.charge.speed], "both charging, at a run");
        assert.equal(charges.length, 1, "the horns blown once");
        assert.deepEqual(charges[0].raiders, theirs.anchor);
        assert.deepEqual(charges[0].town, ours.anchor);

        // (Those who fight up close going after the enemy as far as the charge goes; the archers and
        // healers as they did)
        const close = (id) => INVASION.close.includes(host.soldiers.get(id).role) || host.soldiers.get(id).chief;
        const all = [...invasion.invaders, ...invasion.defenders].map((id) => host.battle.actor(id));

        assert.ok(all.filter(({ id }) => close(id)).every(({ leash, sight }) => leash === INVASION.charge.leash && sight === INVASION.charge.sight));
        assert.ok(all.filter(({ id }) => host.soldiers.get(id).role === "archer").every(({ leash, sight }) => leash === ROLES.archer.leash && sight === undefined));

        // (Met between them: the raiders' line came on as the town's did, and their fronts met)
        play(game, 15000, () => !theirs.charge && !ours.charge);
        assert.ok(Math.hypot(theirs.anchor[0] - before.raiders[0], theirs.anchor[1] - before.raiders[1]) > INVASION.charge.at / 4, "the raiders charged on");
        assert.ok(apart() <= INVASION.charge.gap + 0.5, `their fronts ${apart().toFixed(1)} m apart`);

        // (From the first blow, those of their lines who fight up close in the thick of it, few of
        // them standing in their ranks with an enemy near; not those held back behind them)
        play(game, 30000, () => invasion.fightAt !== null && host.battle.time - invasion.fightAt >= 10000);

        const lines = new Set(engagement.sides.flatMap(({ bodies }) => bodies.filter(({ part }) => ["left", "centre", "right"].includes(part)).map(({ formation }) => formation)));
        const standing = (ids) => ids.map((id) => host.battle.actor(id)).filter((one) => one && !one.dead && close(one.id) && lines.has(one.formation?.id));
        const [raiders, town] = [standing(invasion.invaders), standing(invasion.defenders)];
        const near = (one, foes, within) => foes.some((foe) => !foe.dead && Math.hypot(foe.x - one.x, foe.y - one.y) <= within);
        const enemies = (one) => (invasion.invaders.includes(one.id) ? invasion.defenders : invasion.invaders).map((id) => host.battle.actor(id)).filter(Boolean);

        for (const [side, ones] of [["raiders", raiders], ["town", town]]) {
            const thick = ones.filter((one) => near(one, enemies(one), 3)).length;
            const idle = ones.filter((one) => one.target === null && near(one, enemies(one), INVASION.charge.sight)).length;

            assert.ok(thick >= ones.length * 0.6, `${side}: ${thick} of ${ones.length} in the thick of it`);
            assert.ok(idle <= ones.length * 0.1, `${side}: ${idle} of ${ones.length} standing with an enemy near`);
        }
    });

    it("thanks the player for the raiders they felled, and a share of them brings the lord's purse and a rare piece from the armoury", () => {
        const game = inTown({ invasion: { clock: INVASION.first } });
        const { host, player } = game;

        player.standing.register();
        play(game, INVASION.settleFirst + 2000, () => host.invasions.length > 0);

        const [invasion] = host.invasions;
        let felled = 0;
        // (What they had just before they're thanked: the war goes on meanwhile, and its honours)
        let [gold, points, merit] = [];

        // (As many as the share of all who came, their reinforcements too, felled as it goes on)
        play(game, INVASION.lasts, () => {
            const raider = standing(host, invasion.invaders).find((id) => !host.soldiers.get(id).chief);

            if (invasion.broke === null) {
                [gold, points, merit] = [player.progress.gold, player.standing.points, player.standing.guild.merit];
            }

            if (invasion.broke === null && raider && felled < Math.ceil(invasion.came * REWARD.big) && strike(game, raider, { fell: true })) {
                felled += 1;
            }

            return invasion.broke !== null;
        });

        // (Those they struck down, and any more they felled fighting on beside the town's)
        const thanks = game.events.find(({ change }) => change === "thanks");
        const reward = rewardOf({ felled: thanks?.felled, of: invasion.came });

        assert.ok(thanks && thanks.player === HOST_PLAYER && thanks.felled >= felled && thanks.of === invasion.came && thanks.big);
        assert.equal(thanks.gold, reward.gold);
        assert.equal(player.progress.gold, gold + reward.gold);
        assert.equal(player.standing.points, points + reward.thanks, "the town's people's thanks: the player's own");
        assert.equal(player.standing.guild.merit, merit + reward.merit);
        assert.equal(thanks.piece.quality, REWARD.quality);
        assert.equal(thanks.band, invasion.band, "the band they were of (the game names them by it)");
        assert.ok(player.progress.pack.some((stack) => stack?.id === thanks.piece.id && stack.quality === REWARD.quality), "the lord's piece in their pack");
    });

    it("counts a character's time only in a town, and comes nowhere a world's rules say not", () => {
        const off = inTown({ rules: { invasions: false } });

        play(off, INVASION.first + 60000);
        assert.equal(off.host.invasions.length, 0);
        assert.equal(off.host.rules.invasions, false);

        const out = inTown();

        out.host.battle.place(HOST_PLAYER, "town", [out.me.square[0] + 400, out.me.square[1]]);
        play(out, INVASION.first + 60000);
        assert.equal(out.host.invasions.length, 0);
        assert.deepEqual(out.player.progress.invasion, { ...clockOf(null) }, "none of it in a town");
    });

    it("carries an invasion on in a copy of the world, alike; and a world kept before invasions starts with none", () => {
        const game = inTown({ invasion: { clock: INVASION.first } });
        const { host } = game;

        play(game, INVASION.settleFirst + 30000, () => host.invasions.length > 0 && host.battle.time - host.invasions[0].at >= 20000);

        const again = Host.restore(buildWorld({ seed: 2 }), decode(encode(host.snapshot())));

        assert.deepEqual(again.invasions, host.invasions);

        for (let k = 0; k < 400; k++) {
            host.advance(STEP_MS);
            again.advance(STEP_MS);
        }

        assert.equal(again.checksum(), host.checksum());
        assert.deepEqual(again.invasions, host.invasions);
        assert.ok(host.invasions[0].charged !== null, "its lines charging meanwhile, alike");

        const older = SNAPSHOT_STEPS[29]({ version: 29, battle: { actors: [] } });

        assert.equal(older.version, 30);
        assert.deepEqual([older.invaded, older.invasions], [0, []]);

        // (A world kept before the lines charged: its band's invasion's not yet, nor any line charging)
        const before = SNAPSHOT_STEPS[37]({ version: 37, invasions: [{ id: "invasion-0", fightAt: null }, { id: "invasion-1", beast: "rift-0" }], battle: { actors: [], formations: { "invasion-0-invaders": { anchor: [1, 2], advance: true } } } });

        assert.equal(before.version, 38);
        assert.deepEqual(before.invasions, [{ charged: null, id: "invasion-0", fightAt: null }, { id: "invasion-1", beast: "rift-0" }]);
        assert.deepEqual(before.battle.formations["invasion-0-invaders"], { charge: false, anchor: [1, 2], advance: true });
    });
});

describe("an invasion as big as the devices in it can draw (core/invasions.js sizeFor, app/budget.js)", () => {
    it("gives a computer three hundred and more, a phone a hundred and more, and fewer as its frames have less room, never fewer than sixty", () => {
        assert.equal(sizeFor(8, "high"), SIZE.most.high, "a computer with room to spare");
        assert.ok(sizeFor(8, "high") >= 300 && sizeFor(8, "high") <= 400);
        assert.ok(sizeFor(14, "medium") >= 100 && sizeFor(14, "medium") <= 160, `${sizeFor(14, "medium")}: a phone`);
        assert.ok(sizeFor(16, "low") >= 100 && sizeFor(16, "low") <= SIZE.most.low, `${sizeFor(16, "low")}: a smaller phone`);
        assert.ok(sizeFor(20, "high") < sizeFor(10, "high") || sizeFor(10, "high") === SIZE.most.high, "fewer with less room");
        assert.ok(sizeFor(22, "medium") < sizeFor(12, "medium"));
        assert.equal(sizeFor(40, "high"), SIZE.least, "one that can't keep up already: the least");
        assert.equal(sizeFor(NaN, "high"), SIZE.least);
        assert.equal(sizeFor(10, "something"), sizeFor(10, "low"), "a kind it doesn't know: a smaller phone's");

        // (Each as it has room for: what it's drawing, and so many more, inside a frame at 30 a second)
        for (const device of ["low", "medium", "high"]) {
            const size = sizeFor(12, device);

            assert.ok(size === SIZE.most[device] || 12 + size * SIZE.each[device] <= 1000 / 30, device);
        }

        assert.ok(isSize(SIZE.least) && isSize(SIZE.most.high) && !isSize(SIZE.least - 1) && !isSize(SIZE.most.high + 1) && !isSize(120.5) && !isSize("120"));
    });

    it("measures the frames a while before it tells the host, then tells it again only as that changes by a tenth", () => {
        const budget = new InvasionBudget();
        const play = (from, ms, work, device = "high") => {
            const told = [];

            for (let now = from; now < from + ms; now += 1000 / 60) {
                const size = budget.observe(now, 1000 / 60, work, device);

                if (size !== null) {
                    told.push(size);
                }
            }

            return told;
        };

        assert.deepEqual(play(0, BUDGET.warmup + BUDGET.window * 0.8, 10), [], "not yet");
        assert.deepEqual(play(BUDGET.warmup + BUDGET.window * 0.8, 2000, 10), [SIZE.most.high]);
        assert.deepEqual(play(20000, 20000, 10.5), [], "hardly changed");
        assert.deepEqual(play(40000, 20000, 24), [sizeFor(24, "high")], "less room");
        assert.equal(budget.told, sizeFor(24, "high"));

        // (Stopped a while, and while there's an invasion on: judged afresh)
        assert.equal(budget.observe(80000, 5000, 10, "high"), null);
        budget.hold();
        assert.deepEqual(play(90000, BUDGET.warmup + BUDGET.window * 0.8, 10), []);
    });

    it("keeps how big an invasion each player's device can draw, told it by their game, which is no sign they're there", () => {
        const { host, player } = inTown();

        assert.equal(player.budget, null);

        player.away = true;
        host.battle.time += 1000;

        const before = player.lastCommand;

        assert.deepEqual(host.command(HOST_PLAYER, { type: "budget", invasion: 200 }), { ok: true });
        assert.equal(player.budget, 200);
        assert.equal(player.lastCommand, before, "no sign they're there");
        assert.equal(player.away, true);

        for (const invasion of [SIZE.least - 1, SIZE.most.high + 1, 150.5, "150", null]) {
            assert.equal(host.command(HOST_PLAYER, { type: "budget", invasion }).ok, false, `${invasion}`);
        }

        assert.equal(player.budget, 200);
        assert.equal(Host.restore(buildWorld({ seed: 2 }), decode(encode(host.snapshot()))).players.get(HOST_PLAYER).budget, 200);

        const older = SNAPSHOT_STEPS[30]({ version: 30, players: [{ id: "p1" }] });

        assert.equal(older.version, 31);
        assert.equal(older.players[0].budget, null);
    });

    it("comes as big as the smallest told by the players in its town, or as big as it was with none told", () => {
        const sized = (budgets) => {
            const host = new Host(world, { populate: false });

            budgets.forEach((budget, k) => {
                const id = k ? `p${k}` : HOST_PLAYER;

                host.join({ id, hero: { ...HERO, name: `Ada ${k}` }, progress: { invasion: { clock: INVASION.first } } });

                if (budget !== null) {
                    host.command(id, { type: "budget", invasion: budget });
                }
            });

            for (let k = 0; k < 40 && !host.invasions.length; k++) {
                host.advance(1000);
            }

            const [invasion] = host.invasions;

            return invasion.invaders.length + invasion.defenders.length;
        };

        assert.equal(sized([null]), INVASION.size);
        assert.ok(Math.abs(sized([300]) - 300) <= 4, "a computer's (those that find no ground to stand on aside)");
        assert.ok(Math.abs(sized([300, 140, null]) - 140) <= 2, "the phone's, the smaller");
    });
});

describe("the bands that invade (core/invasions.js BANDS, characters/soldiers.js raiderLook)", () => {
    it("arms each band for each role it fields, names each, and has each break at a share of its own (the bandits fighting to the last); only the corsairs keep to the sea", () => {
        assert.deepEqual(Object.keys(BANDS).sort(), ["bandits", "corsairs", "cult", "northmen", "sellswords"]);

        for (const [id, band] of Object.entries(BANDS)) {
            const roles = Object.keys(band.mix).filter((role) => band.mix[role] > 0);

            assert.ok(Math.abs(Object.values(band.mix).reduce((sum, share) => sum + share, 0) - 1) < 1e-9, `${id}: a whole line`);
            assert.ok(weaponOf(band.chief), `${id}: its chiefs' weapon`);

            for (const role of roles) {
                for (let k = 0; k < 3; k++) {
                    const weapon = raiderArms(id, role, k);

                    assert.ok(weaponOf(weapon), `${id} ${role}: ${weapon}`);
                    assert.ok(raiderName(id, role, weapon), `${id} ${role}: a name`);
                }
            }

            assert.ok(id === "bandits" ? band.rout === 0 : band.rout > 0 && band.rout < 0.5, `${id}: breaks (the bandits, never)`);
            assert.equal(Boolean(band.coastal), id === "corsairs", `${id}: by the sea or not`);
            assert.ok(Object.entries(band.leash ?? {}).every(([role, leash]) => ROLES[role] && leash > 0), `${id}: its leashes`);
        }

        assert.equal(raiderName("northmen", "archer", "throwingAxes"), "axe-thrower");
        assert.equal(raiderName("northmen", "archer", "bow"), "archer");
        assert.equal(raiderName("cult", "caster", "grimoire"), "fire-caller");
        assert.ok(NATURAL.throwingAxes.attacks.some(({ projectile }) => projectile?.kind === "axe"), "thrown axes");
        assert.ok(NATURAL.ashenPriest.attacks.some(({ projectile }) => projectile?.kind === "fireball"), "hellfire");
        const breaking = Object.values(BANDS).map(({ rout }) => rout).filter((rout) => rout > 0);

        assert.ok(BANDS.sellswords.rout === Math.min(...breaking) && BANDS.corsairs.rout === Math.max(...breaking), "of those that break, the sellswords hold longest, the corsairs least");
        assert.equal(BANDS.cult.advance, false, "the cult stands off and lets the town come");
    });

    it("sends bandits in anyone's first, then any band at random, the corsairs only to a town by the sea", () => {
        const random = createRandom(11);
        const inland = new Set();
        const coastal = new Set();

        for (let k = 0; k < 200; k++) {
            assert.equal(bandFor({ first: true, coastal: k % 2 === 0, random }), "bandits");
            inland.add(bandFor({ first: false, coastal: false, random }));
            coastal.add(bandFor({ first: false, coastal: true, random }));
        }

        assert.deepEqual([...inland].sort(), ["bandits", "cult", "northmen", "sellswords"]);
        assert.deepEqual([...coastal].sort(), Object.keys(BANDS).sort());
    });

    it("dresses each band as its own, in no people's livery: furs and war paint, robes and ash, mismatched plate, sashes and boots", () => {
        const looks = (band, weapon, captain = false) => Array.from({ length: 12 }, (_, seed) => soldierLook({ people: band, weapon, sex: seed % 3 ? "m" : "f", seed: seed + 1, captain }));
        const emblems = (look) => look.equipment.filter((id) => /^(surcoat|livery|shield|cloak)\./.test(id));
        const wearing = (all, ids) => all.some((look) => look.equipment.some((id) => ids.includes(id)));

        for (const band of Object.keys(BANDS)) {
            for (const look of looks(band, raiderArms(band, "front"))) {
                assert.deepEqual(emblems(look), [], band);
            }
        }

        const northmen = looks("northmen", "axe");
        const cult = looks("cult", "grimoire");
        const sellswords = looks("sellswords", "sword");
        const corsairs = looks("corsairs", "cleaver");

        assert.ok(wearing(northmen, ["furMantleGrey", "furMantleBrown", "furMantleBlack"]) && northmen.every((look) => look.equipment.includes("battleAxe")));
        assert.ok(northmen.some((look) => look.look.skin.warpaint) && northmen.some((look) => !look.look.skin.warpaint), "most in war paint");
        assert.ok(cult.every((look) => look.look.skin.warpaint && look.equipment.some((id) => id.startsWith("robe."))), "robed, faces smeared with ash");
        assert.ok(sellswords.every((look) => look.equipment.some((id) => id === "kiteShield" || id === "towerShield")));
        assert.ok(new Set(sellswords.flatMap((look) => look.equipment.filter((id) => id.startsWith("mail") || id.startsWith("gambeson")))).size > 2, "no two alike");
        assert.ok(corsairs.every((look) => look.equipment.some((id) => /Sash/.test(id))));
        assert.ok(looks("corsairs", "sword", true).every((look) => look.equipment.includes("crierHat")), "their captains plumed");
        assert.ok(looks("northmen", "greatsword", true).every((look) => look.equipment.includes("orcHelm") && look.equipment.includes("furMantleBlack")), "their chieftains horned");
        assert.ok(looks("northmen", "throwingAxes").every((look) => look.equipment.includes("cleaver")), "a hand axe in hand");
        assert.ok(looks("cult", "ashenPriest", true).every((look) => look.equipment.includes("staff") && look.equipment.includes("kingsCape")), "their high priests");
    });

    it("brings each band in as it fights: the cult's fire-callers casting and its line standing off, berserkers ranging further, the sellswords' armour", () => {
        const called = (band) => {
            const game = inTown({ invasion: { seen: 1 } });

            assert.deepEqual(game.host.command(HOST_PLAYER, { type: "invade", band }), { ok: true });

            return { ...game, invasion: game.host.invasions[0] };
        };

        const cult = called("cult");
        const casters = cult.invasion.invaders.map((id) => cult.host.battle.actor(id)).filter((one) => cult.host.soldiers.get(one.id).role === "caster");

        assert.equal(cult.invasion.band, "cult");
        assert.ok(casters.length && casters.every((one) => one.casts?.length && one.name === "Ashen fire-caller"));
        assert.equal(cult.host.battle.formations[cult.invasion.formations.invaders].advance, false);

        // (Its line standing off as the town's charges on to it)
        const [cultLine, townLine] = [cult.host.battle.formations[cult.invasion.formations.invaders], cult.host.battle.formations[cult.invasion.formations.defenders]];

        play(cult, 120000, () => cult.invasion.charged !== null);
        assert.ok(cult.invasion.charged !== null);
        assert.deepEqual([cultLine.charge, townLine.charge], [false, true]);
        assert.ok(Math.hypot(townLine.to[0] - cultLine.anchor[0], townLine.to[1] - cultLine.anchor[1]) <= INVASION.charge.gap + 1e-9, "on to its front");

        // (Its jarl's household aside: core/engagement.js)
        const northmen = called("northmen");
        const household = (game, id) => game.host.soldiers.get(id).power !== undefined;
        const berserkers = northmen.invasion.invaders.filter((id) => !household(northmen, id)).map((id) => northmen.host.battle.actor(id)).filter((one) => northmen.host.soldiers.get(one.id).role === "heavy");

        assert.ok(berserkers.length && berserkers.every((one) => one.leash === BANDS.northmen.leash.heavy && one.name === "Northern berserker"));
        assert.ok(northmen.invasion.invaders.some((id) => northmen.host.battle.actor(id).name === "Northern chieftain"));
        assert.ok(northmen.invasion.invaders.some((id) => /^Jarl /.test(northmen.host.battle.actor(id).name)), "their jarl");
        assert.ok(northmen.invasion.invaders.some((id) => northmen.host.battle.actor(id).name === "Northern huscarl"), "and huscarls");

        const sellswords = called("sellswords");

        assert.ok(sellswords.invasion.invaders.filter((id) => !household(sellswords, id)).every((id) => sellswords.host.battle.actor(id).armor === BANDS.sellswords.armor));
        assert.ok(sellswords.invasion.invaders.filter((id) => household(sellswords, id)).every((id) => sellswords.host.battle.actor(id).armor > BANDS.sellswords.armor), "their captain's household the better armoured");
        assert.equal(sellswords.host.command(HOST_PLAYER, { type: "invade", band: "pirates" }).ok, false, "only a band there is (and one at a time)");
    });

    it("counts the town held once a band breaks, however few of the town's are left standing", () => {
        const game = inTown({ invasion: { seen: 1 } });
        const { host } = game;

        host.command(HOST_PLAYER, { type: "invade", band: "corsairs" });

        const [invasion] = host.invasions;
        const fell = (ids) => ids.forEach((id) => Object.assign(host.battle.actor(id), { hp: 0, dead: true, respawnAt: Infinity }));

        // (Down to the share they break at, and the town's fewer than them by then)
        fell(invasion.invaders.slice(Math.ceil(invasion.size * BANDS.corsairs.rout)));
        fell(invasion.defenders.slice(3));
        play(game, 2000);

        assert.ok(invasion.broke !== null && invasion.held);
        assert.deepEqual(game.events.map(({ change }) => change), ["coming", "repelled"]);
    });

    it("breaks once none of a band's who fight up close are left, however many of its archers and healers are", () => {
        const game = inTown({ invasion: { seen: 1 } });
        const { host } = game;

        host.command(HOST_PLAYER, { type: "invade", band: "sellswords" });

        const [invasion] = host.invasions;
        const close = (id) => INVASION.close.includes(host.soldiers.get(id).role) || host.soldiers.get(id).chief;
        const fell = (ids) => ids.forEach((id) => Object.assign(host.battle.actor(id), { hp: 0, dead: true, respawnAt: Infinity }));
        const [line, back] = [invasion.invaders.filter(close), invasion.invaders.filter((id) => !close(id))];

        assert.ok(back.length > Math.ceil(invasion.size * BANDS.sellswords.rout), "more of its archers and healers than it breaks at");

        // (All but one of its line: it stands)
        fell(line.slice(1));
        play(game, 2000);
        assert.equal(invasion.broke, null);

        // (And that one)
        fell(line);
        play(game, 2000);
        assert.ok(invasion.broke !== null && invasion.held);
        assert.equal(host.battle.formations[invasion.formations.invaders].broken, true);
        assert.deepEqual(game.events.map(({ change }) => change), ["coming", "repelled"]);
    });
});

// The world's clock set to `time` ms after midnight on its second day (core/daytime.js: the war's
// turns, a minute each, and the time into the next)
function clockTo(host, time) {
    const elapsed = DAY.length + time - DAY.start;

    Object.assign(host.war, { turn: Math.floor(elapsed / 60000), clock: elapsed % 60000 });
}

describe("an invasion fought as a battle (core/engagement.js; core/host.js #raiderSide, #townSide, #jobs, #trophy)", () => {
    // A band's invasion called up in the start town, its battle and its sides
    const battleOf = (band) => {
        const game = inTown({ invasion: { seen: 1 } });

        game.player.standing.register();
        assert.deepEqual(game.host.command(HOST_PLAYER, { type: "invade", band }), { ok: true });

        const [invasion] = game.host.invasions;

        return { ...game, invasion, engagement: invasion.engagement, raiders: invasion.engagement.sides[0], town: invasion.engagement.sides[1] };
    };
    const line = ({ part }) => ["left", "centre", "right"].includes(part);

    it("draws each side up in bodies across a wide front, its reserve and its commander's household behind; each commander foremost in their household, harder to bring down, a standard-bearer beside them; the town's bomb throwers behind its wings", () => {
        const { host, invasion, raiders, town } = battleOf("northmen");
        const members = (formation) => host.battle.actors.filter((actor) => !actor.dead && actor.formation?.id === formation);

        assert.deepEqual(
            raiders.bodies.map(({ part }) => part),
            ["left", "centre", "right", "reserve", "vanguard"],
        );
        assert.deepEqual(
            town.bodies.map(({ part }) => part),
            ["left", "centre", "right", "reserve", "vanguard"],
        );
        assert.equal(
            raiders.bodies.reduce((sum, { formation }) => sum + members(formation).length, 0),
            invasion.invaders.length,
        );
        assert.equal(raiders.bodies.find(({ part }) => part === "centre").formation, invasion.formations.invaders, "its centre its line as it was");
        assert.deepEqual(host.battle.formations[invasion.formations.invaders].layout, { wedge: true }, "the northmen's centre a wedge");

        // (A front of more than forty metres: the town's line's three bodies abreast)
        const middle = host.battle.formations[invasion.formations.defenders];
        const across = town.bodies.filter(line).flatMap(({ formation }) => members(formation)).map((actor) => {
            const [dx, dy] = [actor.x - middle.anchor[0], actor.y - middle.anchor[1]];

            return dx * Math.cos(middle.facing) - dy * Math.sin(middle.facing);
        });

        assert.ok(Math.max(...across) - Math.min(...across) > 40, `${(Math.max(...across) - Math.min(...across)).toFixed(1)} m across`);

        // (Their commanders and standard-bearers)
        const [jarl, captain] = [raiders.commander, town.commander].map((id) => host.battle.actor(id));

        assert.match(jarl.name, /^Jarl \w/);
        assert.match(captain.name, /^Captain of the Guard \w/);

        for (const [one, side] of [
            [jarl, raiders],
            [captain, town],
        ]) {
            assert.equal(one.maxHp, Math.round(KINDS.soldier.hp * COMMANDER.hp));
            assert.equal(one.rank, "commander", "their plate in gold");
            assert.ok(host.soldiers.get(one.id).commander);
            assert.equal(one.formation.id, side.bodies.find(({ part }) => part === "vanguard").formation, "at the head of their household");
            assert.equal(host.battle.actor(side.banner).rank, "standard");
            assert.equal(host.battle.actor(side.banner).formation.id, one.formation.id);
        }

        assert.equal(host.battle.actor(raiders.banner).name, "Northern standard-bearer");

        const bombers = invasion.defenders.filter((id) => host.battle.actor(id).weapon === BOMBERS.human.weapon);

        assert.equal(bombers.length, 2 * sidesOf(INVASION.size).bombers);
        assert.ok(bombers.every((id) => /:(left|right)$/.test(host.battle.actor(id).formation.id)), "behind its wings");
    });

    it("gives a player near the town's line a job as the lines charge, from the captain of its guard, and rewards it done; and a bounty and a trophy for felling the raiders' commander", () => {
        const game = battleOf("sellswords");
        const { host, me, player, invasion, engagement, raiders, town } = game;
        const events = [];

        // (By the town's line, as it charges)
        for (let k = 0; k < 4000 && engagement.phase !== "melee"; k++) {
            events.push(...host.advance(STEP_MS).filter(({ type }) => type === "engagement"));

            const centre = host.battle.formations[invasion.formations.defenders];

            if (k % 20 === 0 && centre) {
                host.battle.place(HOST_PLAYER, "town", [Math.floor(centre.anchor[0]), Math.floor(centre.anchor[1])]);
            }
        }

        for (let k = 0; k < 20; k++) {
            events.push(...host.advance(STEP_MS).filter(({ type }) => type === "engagement"));
        }

        const job = engagement.jobs?.[HOST_PLAYER];
        const given = events.find(({ change, player: who }) => change === "job" && who === HOST_PLAYER);

        assert.ok(job && given, "given a job");
        assert.equal(given.by, host.battle.actor(town.commander).name);
        assert.equal(job.side, 1);
        assert.ok(job.kind === "banner" ? job.target === raiders.banner : town.bodies.some(({ part }) => part === job.part));

        // (Bidden bring down their standard-bearer, and done: away from the press, where none of
        // the town's fell them first)
        Object.assign(job, { kind: "banner", part: null, target: raiders.banner });
        host.battle.place(HOST_PLAYER, "town", invasion.middle.map(Math.floor));

        const [gold, merit] = [player.progress.gold, player.standing.guild.merit];

        assert.ok(strike(game, raiders.banner, { fell: true }), "felled them");

        const done = game.host.advance(STEP_MS).find(({ type, change }) => type === "engagement" && change === "jobDone") ?? null;

        assert.ok(job.done !== null, "done");
        assert.ok(player.progress.gold >= gold + JOB.gold);
        assert.ok(player.standing.guild.merit >= merit + JOB.merit);
        assert.equal(done, null, "told as it was done, not again");

        // (Their commander felled: a bounty and a trophy, as fine as TROPHY says)
        const before = player.progress.gold;

        assert.ok(strike(game, raiders.commander, { fell: true }), "felled them");

        // (A second on: the battle's looked at again since)
        for (let t = 0; t < 1000; t += STEP_MS) {
            host.advance(STEP_MS);
        }

        assert.ok(player.progress.gold >= before + TROPHY.bounty);
        assert.ok(player.progress.pack.some((stack) => stack?.quality === TROPHY.quality), "the trophy in their pack");
        assert.equal(engagement.sides[0].tactics, false, "the raiders without their tactics now");
        assert.ok(me && !me.dead);
    });

    it("rewards a player who held the body of the town's line they were bidden hold, by it as the raiders break", () => {
        const { host, player, invasion, engagement, town } = battleOf("corsairs");

        for (let k = 0; k < 4000 && engagement.phase !== "melee"; k++) {
            host.advance(STEP_MS);

            const centre = host.battle.formations[invasion.formations.defenders];

            if (k % 20 === 0 && centre) {
                host.battle.place(HOST_PLAYER, "town", [Math.floor(centre.anchor[0]), Math.floor(centre.anchor[1])]);
            }
        }

        for (let k = 0; k < 4 && !engagement.jobs?.[HOST_PLAYER]; k++) {
            host.advance(STEP_MS);
        }

        const job = engagement.jobs[HOST_PLAYER];

        Object.assign(job, { kind: "hold", part: "centre", target: null });

        // (Beside it, the raiders all down, their fallen made good no more: the town held)
        const centre = host.battle.formations[town.bodies.find(({ part }) => part === "centre").formation];
        const standing = player.standing.points;

        host.battle.place(HOST_PLAYER, "town", [Math.floor(centre.anchor[0]), Math.floor(centre.anchor[1])]);
        invasion.fightAt = -Infinity;

        for (const id of invasion.invaders) {
            Object.assign(host.battle.actor(id), { hp: 0, dead: true, respawnAt: Infinity });
        }

        const events = [];

        for (let k = 0; k < 10 && invasion.broke === null; k++) {
            events.push(...host.advance(STEP_MS));
        }

        assert.ok(invasion.held);
        assert.ok(job.done !== null, "held as bidden");
        assert.ok(events.some(({ type, change, player: who, kind }) => type === "engagement" && change === "jobDone" && who === HOST_PLAYER && kind === "hold"));
        assert.ok(player.standing.points >= standing + JOB.thanks, "the town's thanks: the player's own people");
    });
});

describe("the Behemoth of the Rift's invasion (core/invasions.js BEHEMOTH, core/host.js #invade)", () => {
    it("comes by night only, one time in three of the invasions due then, never in anyone's first; as strong as the town's who meet it", () => {
        assert.equal(isBehemoth({ dark: true, first: false, roll: 0 }), true);
        assert.equal(isBehemoth({ dark: true, first: false, roll: BEHEMOTH.share - 1e-9 }), true);
        assert.equal(isBehemoth({ dark: true, first: false, roll: BEHEMOTH.share }), false, "one time in three");
        assert.equal(isBehemoth({ dark: false, first: false, roll: 0 }), false, "never by day");
        assert.equal(isBehemoth({ dark: true, first: true, roll: 0 }), false, "never in anyone's first");
        assert.ok(Math.abs(BEHEMOTH.share - 1 / 3) < 1e-9);

        for (const size of [SIZE.least, INVASION.size, SIZE.most.high]) {
            const { defenders, bombers, squads, engines, hp } = behemothSides(size);
            const rolled = Object.values(engines).reduce((sum, count) => sum + count, 0);
            const strength = defenders + rolled * ENGINES.worth;

            // (Its siege engines among it, a catapult and a ballista for every so many of it, at
            // least one of each, each taking the room of so many soldiers)
            assert.deepEqual(Object.keys(engines), ["catapult", "ballista"]);
            assert.ok(Object.values(engines).every((count) => count === Math.max(1, Math.round((size - BEHEMOTH.costs) / ENGINES.per))), `${size}: ${JSON.stringify(engines)}`);
            assert.equal(defenders + rolled * ENGINES.costs, size - BEHEMOTH.costs, `${size}: all of it the town's but the room the Behemoth takes`);
            assert.ok(bombers >= BEHEMOTH.least && bombers * squads < defenders / 4);
            assert.equal(hp, Math.round(strength * (BEHEMOTH.hp + BEHEMOTH.grows * strength)), "its hit points so many for each who meets it (an engine as many as it's worth), more for each the more of them");
        }
    });

    it("thanks whoever wounded it by the share they dealt it: half the bounty if the town fell, the lord's purse for a good share of it held", () => {
        assert.deepEqual(behemothReward({ share: 0 }), { gold: 0, merit: 0, thanks: 0, big: false });

        const little = behemothReward({ share: 0.01 });
        const more = behemothReward({ share: 0.05 });
        const big = behemothReward({ share: BEHEMOTH_REWARD.big });

        assert.ok(little.gold >= 1 && more.gold > little.gold && more.merit >= little.merit && more.thanks >= little.thanks, "more for more of it");
        assert.ok(!more.big && big.big && big.gold === Math.round(BEHEMOTH_REWARD.bounty * BEHEMOTH_REWARD.big) + REWARD.purse, "the lord's purse for a good share");
        assert.equal(behemothReward({ share: 0.05, held: false }).gold, Math.round(more.gold / 2), "half, the town not held");
        assert.equal(behemothReward({ share: BEHEMOTH_REWARD.big, held: false }).big, false);
        assert.deepEqual(behemothReward({ share: 2 }), behemothReward({ share: 1 }), "no more than all of it");
    });

    it("comes in place of a band now and then by night, once a character's past their first; never by day, nor in their first", () => {
        // (Each invasion's due, its id as `k` has it: whether it's the Behemoth rolled for each)
        const due = (time, k, invasion = { seen: 1, clock: INVASION.every[1], due: INVASION.every[0] }) => {
            const game = inTown({ invasion });

            clockTo(game.host, time);
            game.host.invaded = k;
            play(game, INVASION.settle + 2000, () => game.host.invasions.length > 0);

            return game.host.invasions[0]?.band;
        };
        const night = 58 * 60000;
        const bands = [0, 1, 2, 3, 4, 5].map((k) => due(night, k));

        assert.ok(bands.includes(BEHEMOTH.id) && bands.some((band) => Object.hasOwn(BANDS, band)), `by night, now and then (${bands})`);

        const rolled = bands.flatMap((band, k) => (band === BEHEMOTH.id ? [k] : [])).slice(0, 2);

        assert.ok(rolled.every((k) => Object.hasOwn(BANDS, due(30 * 60000, k))), "never by day");
        assert.ok(rolled.every((k) => due(night, k, { clock: INVASION.first }) === "bandits"), "never in their first");
    });

    it("brings the town's whole strength out against it, as many as the devices there can draw, everyone's enemy, coming on to the town's edge from the Tower of Sar Mordal's way", () => {
        const game = inTown({ invasion: { seen: 1 } });
        const { host, me } = game;

        assert.ok(host.command(HOST_PLAYER, { type: "budget", invasion: 120 }).ok);
        assert.ok(host.command(HOST_PLAYER, { type: "invade", band: BEHEMOTH.id }).ok);
        play(game, 1000);

        const [invasion] = host.invasions;
        const beast = host.battle.actor(invasion.beast);
        const defenders = invasion.defenders.map((id) => host.battle.actor(id));
        const sides = behemothSides(120);
        const out = Math.hypot(beast.x - invasion.middle[0], beast.y - invasion.middle[1]);

        assert.deepEqual(invasion.invaders, [invasion.beast], "it alone");
        assert.ok(beast.team === RIFT && beast.ai === "colossus" && beast.wild.creature === BEHEMOTH.creature);
        assert.equal(beast.maxHp, sides.hp);
        assert.ok(Math.abs(out - (invasion.edge + BEHEMOTH.out)) < 4, "out of the rift down the road");

        // (Down the way out of the town towards the Tower of Sar Mordal, its rift by it)
        const { plan } = host.world;
        const way = wayToward(plan, plan.places.find(({ id }) => id === invasion.place), plan.sites.find(({ kind }) => kind === "rift tower").at);
        const bearing = Math.atan2(beast.y - invasion.middle[1], beast.x - invasion.middle[0]);

        assert.ok(Math.abs(Math.atan2(Math.sin(bearing - way), Math.cos(bearing - way))) < 0.1, `from the tower's way (${bearing.toFixed(2)}, ${way.toFixed(2)})`);
        // (Its soldiers, and its siege engines, each with its crew keeping by it)
        const engines = defenders.filter((one) => one.engine);
        const soldiers = defenders.filter((one) => !one.engine);
        const crews = soldiers.filter((one) => host.soldiers.get(one.id).role === "crew");

        assert.equal(soldiers.length, sides.defenders, "the town's whole strength");
        assert.deepEqual(Object.fromEntries(Object.keys(sides.engines).map((kind) => [kind, engines.filter((one) => one.engine === kind).length])), sides.engines, "its siege engines");
        assert.equal(invasion.mustered, sides.defenders + engines.length);
        assert.equal(defenders.filter((one) => one.weapon === bombersOf(invasion.people).weapon).length, sides.bombers * sides.squads, "its bomb throwers");
        assert.ok(defenders.every((one) => one.team === "human"));
        assert.ok(defenders.filter((one) => !crews.includes(one)).every((one) => one.leash === BEHEMOTH.leash), "each after it as far as it goes");
        assert.equal(crews.length, engines.length * ENGINES.crew, "each engine's crew");
        assert.ok(crews.every((one) => one.ai === "follow" && one.leader === host.soldiers.get(one.id).engine && !one.formation), "following their engine");

        // (By it as it's rolled up behind the line: most of them at its side, any held up round
        // something in the way catching up)
        play(game, 6000);

        const apart = crews.map((one) => Math.hypot(one.x - host.battle.actor(one.leader).x, one.y - host.battle.actor(one.leader).y));

        assert.ok(apart.filter((metres) => metres < 4).length >= crews.length * 0.75 && apart.every((metres) => metres < 16), `keeping by their engine: ${apart.map((metres) => metres.toFixed(1))}`);
        assert.ok(host.battle.hostile(beast, me) && defenders.every((one) => host.battle.hostile(beast, one)), "everyone's enemy");
        assert.deepEqual(invasion.spared, [], "no one's first");
        assert.deepEqual(beast.wild.keepOut, { middle: invasion.middle, within: invasion.edge }, "never into the town after anyone");
        assert.ok(Math.abs(Math.hypot(beast.wild.goal[0] - invasion.middle[0], beast.wild.goal[1] - invasion.middle[1]) - (invasion.edge + BEHEMOTH.stops)) < 1, "on to its edge");

        const [coming] = game.events;

        assert.equal(coming.change, "coming");
        assert.equal(coming.band, BEHEMOTH.id);
        assert.ok(coming.ids.includes(invasion.beast));
    });

    it("is slain, the town held, and those who wounded it thanked by the share they dealt it", () => {
        const game = inTown({ invasion: { seen: 1 } });
        const { host, me, player } = game;

        player.standing.register();
        host.command(HOST_PLAYER, { type: "invade", band: BEHEMOTH.id });
        play(game, 1000);

        const [invasion] = host.invasions;
        const beast = host.battle.actor(invasion.beast);

        // (The player at it, up against its body, landing a few blows)
        const [x0, y0] = beast.footprint;
        let blows = 0;

        Object.assign(me, { hp: 1e6, maxHp: 1e6 });
        host.battle.place(HOST_PLAYER, "town", [x0 - 1, y0 + 2]);
        assert.ok(host.command(HOST_PLAYER, { type: "engage", target: beast.id }).ok);

        for (let k = 0; k < 2000 && blows < 3; k++) {
            blows += host.advance(STEP_MS).filter((event) => event.type === "hit" && event.id === beast.id && event.by === HOST_PLAYER).length;
        }

        assert.equal(blows, 3, "the player's blows landed");

        const dealt = invasion.dealt[HOST_PLAYER];
        const gold = player.progress.gold;

        assert.ok(dealt > 0, "counted for them");

        // (Slain)
        Object.assign(beast, { hp: 0, dead: true, respawnAt: Infinity });
        play(game, 2000);

        const thanks = game.events.find(({ change }) => change === "thanks");
        const reward = behemothReward({ share: dealt / beast.maxHp, held: true });

        assert.ok(invasion.held, "the town held");
        assert.deepEqual(game.events.map(({ change }) => change).slice(0, 2), ["coming", "repelled"]);
        assert.ok(thanks && thanks.player === HOST_PLAYER && thanks.band === BEHEMOTH.id && thanks.of === beast.maxHp);
        assert.equal(thanks.felled, Math.round(dealt));
        assert.equal(thanks.gold, reward.gold);
        assert.equal(player.progress.gold, gold + reward.gold);
        assert.equal(thanks.merit, reward.merit);
    });

    it("goes back the way it came once all but a few of the town's are down, the town not held, and is let go of", () => {
        const game = inTown({ invasion: { seen: 1 } });
        const { host } = game;

        host.command(HOST_PLAYER, { type: "invade", band: BEHEMOTH.id });

        const [invasion] = host.invasions;
        const beast = host.battle.actor(invasion.beast);
        const fell = (ids) => ids.forEach((id) => Object.assign(host.battle.actor(id), { hp: 0, dead: true, respawnAt: Infinity }));
        const last = Math.floor(invasion.mustered * BEHEMOTH.last);

        // (All but one more than a few: it fights on)
        fell(invasion.defenders.slice(last + 1));
        play(game, 2000);
        assert.equal(invasion.broke, null);

        fell(invasion.defenders.slice(last));
        play(game, 2000);
        assert.ok(invasion.broke !== null && invasion.held === false, "the town not held");
        assert.ok(beast.wild.leaving && Math.hypot(beast.wild.goal[0] - invasion.exit[0], beast.wild.goal[1] - invasion.exit[1]) < 1, "going back the way it came");

        play(game, BEHEMOTH.lasts, () => !host.invasions.length);
        assert.deepEqual(game.events.map(({ change }) => change), ["coming", "fell", "over"]);
        assert.equal(host.battle.actor(beast.id), null, "let go of, gone");
    });
});
