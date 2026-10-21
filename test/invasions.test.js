// Invasions (core/invasions.js, core/host.js #invade): five minutes into a character's time in a
// town, a band of bandits comes down one of its roads, and the town's own people march out to
// meet them at its edge, the stronger side, two squads of bomb throwers among them. In a
// character's first the raiders leave them be till they strike one; in those after, they don't.
// Beaten down to a quarter, the raiders run; whoever felled them is thanked for it.
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

let ALARM;
let BANDS;
let bandFor;
let raiderName;
let NATURAL;
let ROLES;
let BUDGET;
let InvasionBudget;
let SIZE;
let isSize;
let sizeFor;
let BOMBER;
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
    ({ ALARM, BANDS, BOMBER, INVASION, REWARD, SIZE, bandFor, clockOf, criesOf, dueAfter, isDue, isSize, raiderArms, raiderName, rewardOf, sidesOf, sizeFor, thanksOf } = await import("../client/js/core/invasions.js"));
    ({ ROLES } = await import("../client/js/core/formation.js"));
    ({ BUDGET, InvasionBudget } = await import("../client/js/app/budget.js"));
    ({ OPENINGS } = await import("../client/js/core/crying.js"));
    ({ BOMBS, FOE_MS, KINDS, STEP_MS } = await import("../client/js/core/battle.js"));
    ({ Host, HOST_PLAYER, SNAPSHOT_STEPS } = await import("../client/js/core/host.js"));
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
// falls to it)
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
            return;
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

    it("gives the town the bigger side, and two squads of bomb throwers at least two strong", () => {
        for (const size of [40, INVASION.size, 300, 400]) {
            const { invaders, defenders, bombers, squads } = sidesOf(size);

            assert.equal(invaders + defenders, size);
            assert.ok(defenders > invaders * 1.3, `${size}: the town's the bigger side`);
            assert.ok(bombers >= 2 && squads === 2, `${size}: bomb throwers`);
        }

        const bombs = weaponOf(BOMBER).attacks;

        assert.ok(bombs.some(({ kind }) => kind === "melee"), "a sword up close");
        assert.ok(bombs.some(({ kind, bomb }) => kind === "ranged" && BOMBS[bomb] === BOMBS.goblinBomb), "goblin bombs further off");
        assert.ok(BOMBS.goblinBomb.toss > 0, "that toss whoever they burst by");
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

    it("cries the raiders' road and calls every able hand to defend the town, in no more than 90 characters", () => {
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
        assert.ok(soldierLook({ people: "human", weapon: BOMBER, seed: 3 }).equipment.includes("sword"), "the town's bomb throwers carry a sword");
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
        assert.equal(defenders.filter((one) => one.weapon === BOMBER).length, 2 * sidesOf(INVASION.size).bombers, "two squads of bomb throwers");
        assert.ok(defenders.filter((one) => one.weapon === BOMBER).every((one) => one.name === "Human bomb thrower"));

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

    it("is beaten off by the town's people: the raiders break at a quarter left and run, it's let go of after, and the war's none the worse", () => {
        const game = inTown({ invasion: { clock: INVASION.first } });
        const { host } = game;
        const garrisons = () => host.war.towns.map(({ id, garrison }) => [id, garrison]);
        const before = garrisons();

        play(game, INVASION.settleFirst + 2000, () => host.invasions.length > 0);

        const [invasion] = host.invasions;
        const ids = [...invasion.invaders, ...invasion.defenders];
        let broke = null;

        play(game, INVASION.lasts, () => {
            if (broke === null && invasion.broke !== null) {
                broke = {
                    raiders: standing(host, invasion.invaders).length,
                    close: standing(host, invasion.invaders).filter((id) => INVASION.close.includes(host.soldiers.get(id).role) || host.soldiers.get(id).chief).length,
                    defenders: standing(host, invasion.defenders).length,
                    broken: host.battle.formations[invasion.formations.invaders].broken,
                };
            }

            return !host.invasions.length;
        });

        assert.deepEqual(
            game.events.map(({ change }) => change),
            ["coming", "repelled", "over"],
        );
        assert.ok(invasion.held, "the town held");
        assert.ok((broke.raiders <= Math.ceil(invasion.size * INVASION.rout) || broke.close === 0) && broke.defenders > broke.raiders && broke.broken, "they broke at a quarter, or with none left to fight up close, and ran");
        assert.ok(ids.every((id) => !host.battle.actor(id) && !host.soldiers.has(id)), "all of them let go of");
        assert.ok(!Object.keys(host.battle.formations).some((id) => id.startsWith(invasion.id)), "and their lines");
        assert.deepEqual(garrisons(), before, "no town's garrison lost to the war for it");
    });

    it("thanks the player for the raiders they felled, and a share of them brings the lord's purse and a rare piece from the armoury", () => {
        const game = inTown({ invasion: { clock: INVASION.first } });
        const { host, player } = game;

        player.standing.register();
        play(game, INVASION.settleFirst + 2000, () => host.invasions.length > 0);

        const [invasion] = host.invasions;
        const felled = Math.ceil(invasion.size * REWARD.big);

        for (const id of invasion.invaders.slice(0, felled)) {
            strike(game, id, { fell: true });
        }

        const [gold, points, merit] = [player.progress.gold, player.standing.points, player.standing.guild.merit];

        play(game, INVASION.lasts, () => invasion.broke !== null);

        const thanks = game.events.find(({ change }) => change === "thanks");
        const reward = rewardOf({ felled, of: invasion.size });

        assert.ok(thanks && thanks.player === HOST_PLAYER && thanks.felled === felled && thanks.big);
        assert.equal(thanks.gold, reward.gold);
        assert.equal(player.progress.gold, gold + reward.gold);
        assert.equal(player.standing.points, points + reward.thanks, "the town's people's thanks: the player's own");
        assert.equal(player.standing.guild.merit, merit + reward.merit);
        assert.equal(thanks.piece.quality, REWARD.quality);
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

        const older = SNAPSHOT_STEPS[29]({ version: 29, battle: { actors: [] } });

        assert.equal(older.version, 30);
        assert.deepEqual([older.invaded, older.invasions], [0, []]);
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
    it("arms each band for each role it fields, names each, and has each break at a share of its own; only the corsairs keep to the sea", () => {
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

            assert.ok(band.rout > 0 && band.rout < 0.5, `${id}: breaks`);
            assert.equal(Boolean(band.coastal), id === "corsairs", `${id}: by the sea or not`);
            assert.ok(Object.entries(band.leash ?? {}).every(([role, leash]) => ROLES[role] && leash > 0), `${id}: its leashes`);
        }

        assert.equal(raiderName("northmen", "archer", "throwingAxes"), "axe-thrower");
        assert.equal(raiderName("northmen", "archer", "bow"), "archer");
        assert.equal(raiderName("cult", "caster", "grimoire"), "fire-caller");
        assert.ok(NATURAL.throwingAxes.attacks.some(({ projectile }) => projectile?.kind === "axe"), "thrown axes");
        assert.ok(NATURAL.ashenPriest.attacks.some(({ projectile }) => projectile?.kind === "fireball"), "hellfire");
        assert.ok(BANDS.sellswords.rout < BANDS.bandits.rout && BANDS.corsairs.rout > BANDS.bandits.rout, "the sellswords hold longest, the corsairs least");
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

        const northmen = called("northmen");
        const berserkers = northmen.invasion.invaders.map((id) => northmen.host.battle.actor(id)).filter((one) => northmen.host.soldiers.get(one.id).role === "heavy");

        assert.ok(berserkers.length && berserkers.every((one) => one.leash === BANDS.northmen.leash.heavy && one.name === "Northern berserker"));
        assert.ok(northmen.invasion.invaders.some((id) => northmen.host.battle.actor(id).name === "Northern chieftain"));

        const sellswords = called("sellswords");

        assert.ok(sellswords.invasion.invaders.every((id) => sellswords.host.battle.actor(id).armor === BANDS.sellswords.armor));
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
