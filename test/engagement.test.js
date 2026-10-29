// Battles fought as battles were (client/js/core/engagement.js; docs/WAR.md *Battles*): each side's
// line in three bodies across a wide front, a reserve and its commander's household held back; the
// lines halting while the archers loose, then charging, each body at the one opposite; each body's
// morale its own, broken alone (a band that never breaks falling back and coming on again), its
// reserve and household sent in where its line gives way; its commander fallen, no tactics left
// and its morale shaken; its line held once they've charged, a break in the enemy's gone through
// to their archers, its archers giving ground from an enemy among them, and a body standing idle
// closing up, wheeling or coming up beside its own. Played on a battle of the engine's own making
// here: its soldiers, their formations and their fights set as each test wants
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BAND_TACTICS, BODIES, bodiesOf, breachesOf, COMMANDERS, engagementOf, FIELD, holdOf, layoutOf, MORALE, moraleAfter, offsetsOf, pairOf, relativeTo, stepEngagement, TACTICS, tacticsOf, towards } from "../client/js/core/engagement.js";
import { FORMATION, MIX, placeAt, placesOf } from "../client/js/core/formation.js";
import { SNAPSHOT_STEPS } from "../client/js/core/host.js";
import { KNIFE } from "../client/js/core/weapons.js";

// A battle of the engine's own: its formations kept as battle.js keeps them (the settings given
// over what they were), its soldiers as given
function battleOf(actors = []) {
    const formations = {};

    return {
        actors,
        formations,
        actor: (id) => actors.find((actor) => actor.id === id) ?? null,
        formation(id, settings) {
            if (settings === null) {
                delete formations[id];

                return null;
            }

            formations[id] ??= { anchor: [0, 0], facing: 0, to: null, speed: 1, advance: false, broken: false, charge: false, layout: null, engagedAt: -Infinity };

            for (const [key, value] of Object.entries(settings)) {
                formations[id][key] = Array.isArray(value) ? [...value] : value;
            }

            return formations[id];
        },
    };
}

// Two sides of `size` drawn up `apart` metres from each other across the y axis (side 0 at y 0
// facing +y, side 1 facing it), each body's soldiers at their places, as the host draws them up
function drawnUp({ size = 60, apart = 60, tactics = ["line", "line"], falters = [false, false], records = false } = {}) {
    const actors = [];
    const battle = battleOf(actors);
    const sides = [0, 1].map((k) => {
        const facing = k ? Math.PI : 0;
        const anchor = [0, k ? apart : 0];
        const bodies = bodiesOf(size, MIX, { tactic: tactics[k] }).map((body) => ({ ...body, places: placesOf(body.roles, layoutOf(body.part, tactics[k])) }));
        const offsets = offsetsOf(bodies);

        return {
            key: k ? "b" : "a",
            name: k ? "b" : "a",
            tactic: tactics[k],
            falters: falters[k],
            exit: placeAt({ anchor, facing }, [0, 60]),
            commander: `${k}/vanguard-0`,
            banner: bodies.some(({ part }) => part === "vanguard") ? `${k}/vanguard-1` : null,
            bodies: bodies.map((body) => {
                const formation = `${k}:${body.part}`;
                const at = placeAt({ anchor, facing }, offsets[body.part]);

                battle.formation(formation, { anchor: at, facing, layout: layoutOf(body.part, tactics[k]) });
                body.roles.forEach((role, n) => {
                    const [x, y] = placeAt({ anchor: at, facing }, body.places[n]);

                    actors.push({ id: `${k}/${body.part}-${n}`, x, y, dead: false, target: null, power: { melee: 1 }, formation: { id: formation, slot: body.places[n], role }, side: k });
                });

                return { part: body.part, formation, size: body.roles.length, offset: offsets[body.part] };
            }),
        };
    });
    const engagement = engagementOf({ id: "test", now: 0, sides });
    const told = [];
    const afflicted = [];
    // (The host's record of each, if it's wanted: their role, and whether they're its commander)
    const record = records ? (id) => ({ role: battle.actor(id)?.formation.role, commander: sides.some(({ commander }) => commander === id) }) : () => ({});
    const step = (now, { hold = false } = {}) => stepEngagement(engagement, { battle, now, hold, record, event: (change, data) => told.push({ change, ...data }), afflict: (id, kind, ms) => afflicted.push({ id, kind, ms }) });

    return { battle, engagement, told, afflicted, step, members: (k, part) => actors.filter(({ formation }) => formation.id === `${k}:${part}`) };
}

// Two sides drawn up (drawnUp's), their lines charged at each other once the archers' time is up,
// and there: every formation's march over. `now` the time they charged
function atIt(options = {}) {
    const drawn = drawnUp(options);

    drawn.engagement.phase = "volley";
    drawn.engagement.at = 0;
    drawn.step(FIELD.volley.ms);

    for (const formation of Object.values(drawn.battle.formations)) {
        formation.to = null;
    }

    return { ...drawn, now: FIELD.volley.ms };
}

const apart = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const SHOOTERS = ["archer", "caster", "healer"];

describe("a side drawn up for battle (core/engagement.js bodiesOf, layoutOf, offsetsOf)", () => {
    it("puts a side's line in three bodies, a reserve behind once it's 40 strong and its commander's household once it's 24, one body for too few", () => {
        const parts = (size, tactic) => bodiesOf(size, MIX, { tactic }).map(({ part, roles }) => [part, roles.length]);

        assert.deepEqual(parts(20), [["centre", 20]]);

        const thirty = parts(30);

        assert.deepEqual(
            thirty.map(([part]) => part),
            ["left", "centre", "right", "vanguard"],
        );
        assert.equal(thirty.at(-1)[1], BODIES.vanguard.least);

        const hundred = Object.fromEntries(parts(100));

        assert.equal(hundred.left + hundred.centre + hundred.right + hundred.reserve + hundred.vanguard, 100);
        assert.equal(hundred.vanguard, Math.round(100 * BODIES.vanguard.share));
        assert.equal(hundred.reserve, Math.round((100 - hundred.vanguard) * BODIES.reserve.share));
        assert.equal(hundred.left, hundred.right, "its wings alike");
        assert.ok(hundred.centre > hundred.left, "its centre the strongest");

        // (Each band's own: the bandits' none held back, the sellswords' deep)
        assert.equal(Object.fromEntries(parts(100, tacticsOf("bandits"))).reserve, undefined);
        assert.ok(Object.fromEntries(parts(100, tacticsOf("sellswords"))).reserve > hundred.reserve);
        assert.equal(tacticsOf("town"), "line");
        assert.deepEqual(Object.keys(BAND_TACTICS).sort(), Object.keys(COMMANDERS).filter((key) => !["town", "army"].includes(key)).sort(), "a commander for every band");
    });

    it("leads its household with its commander, foremost, then its shield line and two-handers", () => {
        const [vanguard] = bodiesOf(100, MIX).filter(({ part }) => part === "vanguard");

        assert.equal(vanguard.roles[0], "front");
        assert.ok(vanguard.roles.every((role) => role === "front" || role === "heavy"));
    });

    it("lays a body out shallow and wide (its shield line one rank up to BODIES.deep files, never narrower for one more), the northmen's centre a wedge", () => {
        const wide = (count) => {
            const places = placesOf(new Array(count).fill("front"), layoutOf("left"));

            return { files: new Set(places.filter(([, back]) => back === 0).map(([right]) => right)).size, ranks: new Set(places.map(([, back]) => back)).size };
        };

        assert.deepEqual(wide(BODIES.deep - 1), { files: BODIES.deep - 1, ranks: 1 });
        assert.ok(wide(BODIES.deep).files >= BODIES.deep - Math.round(BODIES.deep * FORMATION.rear), "not narrower for one more");
        assert.ok(wide(BODIES.deep + 10).files >= BODIES.deep - Math.round((BODIES.deep + 10) * FORMATION.rear));

        // (A wedge: ranks of one, three, five from its point, its two-handers foremost)
        assert.deepEqual(layoutOf("centre", "wedge"), { wedge: true });
        assert.deepEqual(layoutOf("left", "wedge"), { deep: BODIES.deep });

        const roles = [...new Array(4).fill("heavy"), ...new Array(5).fill("front"), "archer"];
        const places = placesOf(roles, { wedge: true });
        const rank = (r) => places.filter(([, back]) => Math.abs(back - r * FORMATION.rank) < 1e-9).length;

        assert.deepEqual([rank(0), rank(1), rank(2)], [1, 3, 5]);
        assert.deepEqual(places[0], [0, 0], "a two-hander at its point");
        assert.ok(places.at(-1)[1] > 2 * FORMATION.rank, "its archers behind it");
    });

    it("stands its line abreast BODIES.gap apart, its reserve behind it and its household behind that", () => {
        const bodies = bodiesOf(120, MIX).map((body) => ({ ...body, places: placesOf(body.roles, layoutOf(body.part)) }));
        const offsets = offsetsOf(bodies);
        const width = (part) => {
            const across = bodies.find((body) => body.part === part).places.map(([right]) => right);

            return Math.max(...across) - Math.min(...across) + FORMATION.apart;
        };

        assert.deepEqual(offsets.centre, [0, 0]);
        assert.ok(Math.abs(offsets.right[0] - (width("centre") / 2 + BODIES.gap + width("right") / 2)) < 1e-9);
        assert.equal(offsets.left[0], -offsets.right[0]);
        assert.ok(offsets.reserve[1] > 0 && offsets.vanguard[1] > offsets.reserve[1]);
        assert.ok(width("left") + width("centre") + width("right") + 2 * BODIES.gap > 50, "a front of more than fifty metres for 120");
    });

    it("pairs each body with the one opposite it, our left with their right, else the nearest they have", () => {
        assert.equal(pairOf("left", ["left", "centre", "right"]), "right");
        assert.equal(pairOf("centre", ["left", "centre", "right"]), "centre");
        assert.equal(pairOf("left", ["centre"]), "centre");
        assert.equal(pairOf("right", ["left", "right"]), "left");
        assert.equal(pairOf("right", []), null);
    });
});

describe("a body's morale (core/engagement.js moraleAfter)", () => {
    it("falls with its losses, the harder outnumbered, and steadies to as high as its odds hold it", () => {
        const even = moraleAfter(1, { seconds: 0.5, fallen: 0.1, odds: 1 });
        const outnumbered = moraleAfter(1, { seconds: 0.5, fallen: 0.1, odds: 0.5 });
        const outnumbering = moraleAfter(1, { seconds: 0.5, fallen: 0.1, odds: 2 });

        assert.ok(outnumbered < even && even < outnumbering);
        assert.ok(Math.abs(even - (1 - MORALE.loss * 0.1)) < 1e-9);
        assert.equal(moraleAfter(0.5, { seconds: 10, odds: 1 }), 0.5 + MORALE.steady * 10);
        assert.equal(moraleAfter(0.79, { seconds: 10, odds: 1 }), 0.8, "no higher than even odds hold it");
        assert.equal(moraleAfter(0.9, { seconds: 10, odds: 1 }), 0.9, "nor brought down to it");
        assert.ok(moraleAfter(0.5, { seconds: 10, odds: 1, flanked: true }) < 0.5 - MORALE.flanked * 10 + 1e-9, "beset on its flank: no steadying");
        assert.ok(moraleAfter(0.5, { seconds: 0, fresh: 0.2 }) > 0.5, "fresh soldiers come up to it");
        assert.ok(moraleAfter(1, { seconds: 1, fallen: 0.2, aura: true }) > moraleAfter(1, { seconds: 1, fallen: 0.2 }), "its commander near");
        assert.equal(moraleAfter(0.1, { seconds: 1, fallen: 1 }), 0);
    });
});

describe("a battle fought (core/engagement.js stepEngagement)", () => {
    it("marches each side's bodies on the other abreast, halts them while the archers loose from ahead of their line, then charges each body at the one opposite", () => {
        const { battle, engagement, told, step, members } = drawnUp({ apart: FIELD.volley.at + 5 });

        step(500);
        assert.equal(engagement.phase, "march");
        assert.ok(["left", "centre", "right"].every((part) => battle.formations[`0:${part}`].to !== null), "marching");

        // (Near enough: halted, their archers out ahead of their lines)
        battle.formations["0:centre"].anchor = [0, 3];
        battle.formations["1:centre"].anchor = [0, 3 + FIELD.volley.at - 1];
        step(1000);
        assert.equal(engagement.phase, "volley");
        assert.ok(["left", "centre", "right"].every((part) => battle.formations[`0:${part}`].to === null), "halted");

        const archers = members(0, "left").filter(({ formation }) => formation.role === "archer");

        assert.ok(archers.length && archers.every(({ formation }) => formation.post && relativeTo(battle.formations["0:left"], formation.post)[1] < 0), "out ahead");
        assert.ok(told.some(({ change }) => change === "volley"));

        // (Their time up: charging, each at the one opposite, the archers back in their places)
        step(1000 + FIELD.volley.ms);
        assert.equal(engagement.phase, "melee");
        assert.deepEqual(
            engagement.sides[0].bodies.filter(({ part }) => ["left", "centre", "right"].includes(part)).map(({ part, pair, state }) => [part, pair, state]),
            [
                ["left", "right", "charging"],
                ["centre", "centre", "charging"],
                ["right", "left", "charging"],
            ],
        );
        assert.ok(battle.formations["0:centre"].charge && battle.formations["0:centre"].speed === FIELD.charge.speed);
        assert.ok(archers.every(({ formation }) => !formation.post));
        assert.equal(engagement.sides[0].bodies.find(({ part }) => part === "vanguard").state, "held", "its household held back");
        assert.ok(told.some(({ change }) => change === "charge"));
    });

    it("breaks a body whose morale's gone, running for its side's exit, its enemy before it heartened; a band that never breaks falls back and comes on again", () => {
        const { battle, engagement, told, step } = drawnUp({ falters: [false, true] });

        engagement.phase = "melee";
        step(500);

        const [ours, theirs] = engagement.sides.map((side) => side.bodies.find(({ part }) => part === "left"));

        ours.morale = 0;
        theirs.morale = 0;
        engagement.sides[1].bodies.find(({ part }) => part === "right").pair = "left";
        step(1000);

        assert.equal(ours.state, "broken");
        assert.deepEqual([battle.formations["0:left"].broken, battle.formations["0:left"].to], [true, engagement.sides[0].exit]);
        assert.ok(told.some(({ change, side, part }) => change === "break" && side === "a" && part === "left"));
        assert.equal(theirs.state, "faltering", "the band that never breaks falls back");
        assert.ok(!battle.formations["1:left"].broken);

        step(1000 + MORALE.falter.ms);
        assert.equal(theirs.state, "charging", "and comes on again");
        assert.ok(theirs.morale >= MORALE.falter.to);
        assert.ok(told.some(({ change }) => change === "rally"));
    });

    it("holds every body above MORALE.hold while it's held (an invasion's while its fallen are made good)", () => {
        const { engagement, step } = drawnUp();

        engagement.phase = "melee";
        step(500);

        for (const body of engagement.sides[0].bodies) {
            body.morale = 0;
        }

        step(1000, { hold: true });
        assert.ok(engagement.sides[0].bodies.every(({ morale, state }) => morale >= MORALE.hold && state !== "broken"));
    });

    it("sends its reserve in where its line's giving way, its commander's household no sooner than FIELD.commit.wait after", () => {
        const { battle, engagement, told, step } = drawnUp({ size: 100 });
        const side = engagement.sides[0];
        const centre = side.bodies.find(({ part }) => part === "centre");

        engagement.phase = "melee";
        step(500);
        centre.morale = MORALE.waver - 0.1;
        battle.formations["0:centre"].engagedAt = 1000;
        step(1000);

        assert.equal(side.bodies.find(({ part }) => part === "reserve").state, "committed");
        assert.equal(side.bodies.find(({ part }) => part === "vanguard").state, "held");
        assert.ok(battle.formations["0:reserve"].charge && battle.formations["0:reserve"].to);
        assert.ok(told.some(({ change, part, at }) => change === "commit" && part === "reserve" && at === "centre"));

        // (Low enough to be giving way still, after so long steadying)
        centre.morale = MORALE.break + 0.05;
        battle.formations["0:centre"].engagedAt = 1500 + FIELD.commit.wait;
        step(1500 + FIELD.commit.wait);
        assert.equal(side.bodies.find(({ part }) => part === "vanguard").state, "committed", "then its household");
        assert.ok(told.some(({ change, part, commander }) => change === "commit" && part === "vanguard" && commander === side.commander));
    });

    it("leaves a side whose commander's fallen no tactics, every body of it shaken, those near where they fell afraid", () => {
        const { battle, engagement, told, afflicted, step } = drawnUp({ size: 100 });
        const side = engagement.sides[0];

        engagement.phase = "melee";
        step(500);

        const before = side.bodies.map(({ morale }) => morale);
        const commander = battle.actor(side.commander);

        commander.dead = true;
        step(1000);

        assert.equal(side.tactics, false);
        assert.equal(side.fell, 1000);
        assert.ok(side.bodies.every(({ morale }, k) => morale <= before[k] - MORALE.commander.blow + MORALE.steady + 1e-9), "every body shaken");
        assert.ok(afflicted.length && afflicted.every(({ kind, ms }) => kind === "fear" && ms === MORALE.commander.fear));
        assert.ok(afflicted.every(({ id }) => Math.hypot(battle.actor(id).x - commander.x, battle.actor(id).y - commander.y) <= MORALE.commander.near));
        assert.ok(told.some(({ change, side: key, fallen }) => change === "commanderFell" && key === "a" && fallen === commander.id));

        // (No reserve sent in now, however its line gives way)
        side.bodies.find(({ part }) => part === "centre").morale = MORALE.waver - 0.1;
        battle.formations["0:centre"].engagedAt = 1500;
        step(1500);
        assert.equal(side.bodies.find(({ part }) => part === "reserve").state, "held");
    });

    it("counts a body beset on its flank by an enemy's fighting near its end, facing it, not head on; not by the one before it, nor by one it's wheeled onto the flank of", () => {
        const { battle, engagement, step } = drawnUp();
        const ours = engagement.sides[0].bodies.find(({ part }) => part === "left");
        const mine = battle.formations["0:left"];

        engagement.phase = "melee";
        Object.assign(battle.formations["1:right"], { anchor: placeAt(mine, [0, -2]), facing: mine.facing + Math.PI, engagedAt: 500 });
        step(500);
        assert.equal(ours.flanked, false, "head on");

        // (Off its left end, facing it)
        Object.assign(battle.formations["1:right"], { anchor: placeAt(mine, [-12, 0]), facing: mine.facing - Math.PI / 2, engagedAt: 1000 });
        step(1000);
        assert.equal(ours.flanked, true, "on its flank");

        // (There, facing away: its own flank, wheeled onto)
        Object.assign(battle.formations["1:right"], { facing: mine.facing + Math.PI / 2, engagedAt: 1500 });
        step(1500);
        assert.equal(ours.flanked, false, "wheeled onto");
    });

    it("tells which sides are beaten: none of whose bodies stand", () => {
        const { battle, engagement, step } = drawnUp({ size: 20 });

        engagement.phase = "melee";
        assert.deepEqual(step(500), []);

        for (const actor of battle.actors.filter(({ side }) => side === 1)) {
            actor.dead = true;
        }

        assert.deepEqual(step(1000), [1]);
        assert.deepEqual(engagement.beaten, [1]);
    });
});

describe("holding the line (core/engagement.js FIELD charge, holdOf)", () => {
    it("has each who fights up close hold the line once the lines charge, no further from their place than their role's hold, looking so far; the archers keeping off a foe; every body helping its own within FIELD charge lap", () => {
        assert.equal(holdOf({ role: "front" }), FIELD.charge.hold.front);
        assert.equal(holdOf({ role: "heavy" }), FIELD.charge.hold.heavy);
        assert.equal(holdOf({ role: "front", chief: true }), FIELD.charge.hold.chief);
        assert.equal(holdOf({ role: "front", commander: true }), FIELD.charge.hold.chief);
        assert.equal(holdOf({ role: "archer" }), null);
        assert.equal(holdOf(null), null);
        assert.ok(FIELD.charge.hold.front < FIELD.charge.hold.heavy && FIELD.charge.hold.heavy <= FIELD.charge.lap, "the shield line the closest held");

        const { battle, engagement } = atIt({ size: 100, records: true });

        for (const actor of battle.actors) {
            const { role } = actor.formation;

            if (actor.id.endsWith("/vanguard-0")) {
                assert.deepEqual([actor.leash, actor.sight], [FIELD.charge.hold.chief, FIELD.charge.sight], actor.id);
            } else if (role === "front" || role === "heavy") {
                assert.deepEqual([actor.leash, actor.sight], [FIELD.charge.hold[role], FIELD.charge.sight], actor.id);
            } else {
                assert.deepEqual([actor.leash, actor.sight, actor.keep], [undefined, undefined, FIELD.archers.keep], actor.id);
            }
        }

        assert.ok(engagement.sides.every((side) => side.bodies.every(({ formation }) => battle.formations[formation].hold === FIELD.charge.lap)));
    });

    it("brings a world kept from before forward holding the lines of a battle at it, its archers with their knives, its standard-bearers' shields put down (SNAPSHOT_STEPS 46)", () => {
        const bow = { id: "shot", kind: "ranged", reach: 12 };
        const engagement = (id, phase) => ({ id, phase, sides: [{ bodies: [{ formation: `${id}:left` }] }] });
        const forward = SNAPSHOT_STEPS[46]({
            version: 46,
            soldiers: [
                ["front", { role: "front" }],
                ["chief", { role: "heavy", chief: true }],
                ["archer", { role: "archer" }],
                ["bearer", { role: "front", banner: true }],
                ["marching", { role: "front" }],
            ],
            invasions: [{ engagement: engagement("a", "melee") }],
            fields: [{ engagement: engagement("b", "march") }],
            clashes: [],
            leaders: [],
            battle: {
                formations: { "a:left": { anchor: [0, 0] }, "b:left": { anchor: [0, 0] }, other: { anchor: [0, 0], hold: 3 } },
                actors: [
                    { id: "front", leash: 30, sight: 30, formation: { id: "a:left", role: "front" } },
                    { id: "chief", leash: 30, sight: 30, formation: { id: "a:left:flank", role: "heavy" } },
                    { id: "archer", leash: 22, arms: [bow], formation: { id: "a:left", role: "archer" } },
                    { id: "bearer", leash: 30, shield: { chance: 0.3 }, formation: { id: "a:left", role: "front" } },
                    { id: "marching", leash: 4, arms: [bow], formation: { id: "b:left", role: "caster" } },
                    { id: "loose", leash: 9, arms: [bow] },
                ],
            },
        });

        assert.equal(forward.version, 47);
        assert.deepEqual(
            Object.entries(forward.battle.formations).map(([id, { hold, seek }]) => [id, hold, seek]),
            [
                ["a:left", FIELD.charge.lap, null],
                ["b:left", 0, null],
                ["other", 3, null],
            ],
        );
        assert.deepEqual(
            forward.battle.actors.map(({ id, leash, sight = null, keep = null, arms = null, shield }) => [id, leash, sight, keep, arms?.[0]?.id ?? null, shield ?? null]),
            [
                ["front", FIELD.charge.hold.front, FIELD.charge.sight, null, null, null],
                ["chief", FIELD.charge.hold.chief, FIELD.charge.sight, null, null, null],
                ["archer", 22, null, FIELD.archers.keep, KNIFE.id, null],
                ["bearer", FIELD.charge.hold.front, FIELD.charge.sight, null, null, null],
                ["marching", 4, null, null, KNIFE.id, null],
                ["loose", 9, null, null, "shot", null],
            ],
        );
    });
});

describe("a break in the enemy's line (core/engagement.js FIELD breach, TACTICS breach)", () => {
    it("finds a body of a side's line broken and run, and a hole torn between two of its bodies standing side by side; none as it's formed", () => {
        const { battle, engagement, step, members } = drawnUp({ size: 100 });
        const theirs = engagement.sides[1];
        const formationOf = (body) => battle.formations[body.formation] ?? null;
        const breaches = () => breachesOf(theirs, { members: new Map(theirs.bodies.map((body) => [body, members(1, body.part)])), formationOf });

        engagement.phase = "melee";
        step(500);
        assert.deepEqual(breaches(), [], "as it's formed");

        // (Its left drawn away from its centre: a hole between them)
        const [left, centre] = ["left", "centre"].map((part) => battle.formations[`1:${part}`]);
        const away = relativeTo(left, centre.anchor)[0] >= 0 ? -1 : 1;

        left.anchor = placeAt(left, [away * (FIELD.breach.hole + 0.5), 0]);
        assert.deepEqual(
            breaches().map(({ key, kind }) => [key, kind]),
            [["left|centre", "hole"]],
        );
        assert.ok(apart(breaches()[0].at, left.anchor) < apart(left.anchor, centre.anchor) && apart(breaches()[0].at, centre.anchor) < apart(left.anchor, centre.anchor), "between them");

        // (Its right run: a break where it stood)
        for (const actor of members(1, "right")) {
            actor.dead = true;
        }

        step(1000);
        assert.deepEqual(
            breaches().map(({ key, kind }) => [key, kind]),
            [
                ["right", "broken"],
                ["left|centre", "hole"],
            ],
        );
        assert.deepEqual(breaches()[0].at, battle.formations["1:right"].anchor);
    });

    it("has a bold band pour its nearest body's two-handers and rear ranks through a break, at the enemy's archers, then round on the back of their line; each break once", () => {
        assert.deepEqual(
            Object.entries(TACTICS).map(([tactic, { breach }]) => [tactic, breach]),
            [
                ["line", "commit"],
                ["steady", "commit"],
                ["wedge", "pour"],
                ["swarm", "pour"],
                ["standoff", null],
                ["skirmish", "pour"],
            ],
        );

        const { battle, engagement, told, step, members, now } = atIt({ size: 100, apart: 12, tactics: ["swarm", "line"], records: true });
        const ours = engagement.sides[0];

        for (const actor of members(1, "left")) {
            actor.dead = true;
        }

        step(now + 500);

        const breach = told.find(({ change }) => change === "breach");

        assert.ok(breach, "through the break");
        assert.deepEqual([breach.side, breach.by, breach.kind, breach.gap], ["a", "pour", "broken", "left"]);

        const body = ours.bodies.find(({ part }) => part === breach.part);
        const through = battle.formations[`0:${breach.part}:through`];
        const sent = battle.actors.filter(({ formation }) => formation.id === `0:${breach.part}:through`);

        assert.ok(through && through.to && through.charge && through.speed === FIELD.breach.speed, "running through");
        assert.deepEqual(through.seek, SHOOTERS, "at their archers");
        assert.ok(sent.length >= 2 && sent.every(({ formation: { role }, leash, sight }) => (role === "heavy" || role === "front") && leash === FIELD.breach.leash && sight === FIELD.breach.sight));
        assert.ok(sent.every(({ id }) => !id.endsWith("/vanguard-0")), "not its commander");
        assert.ok(
            members(0, breach.part).some(({ formation: { role } }) => role === "front"),
            "its front rank holding",
        );
        assert.deepEqual([body.through.stage, ours.breached.left], ["through", now + 500]);

        // (Through: at the nearest of their archers, casters and healers)
        through.to = null;
        step(now + 1000);
        assert.equal(body.through.stage, "archers");

        const shooters = battle.actors.filter(({ side, formation: { role } }) => side === 1 && SHOOTERS.includes(role));

        assert.ok(shooters.some(({ x, y }) => through.to && x === through.to[0] && y === through.to[1]), "at one of them");

        // (None of them left: round on the back of their nearest body)
        for (const actor of shooters) {
            actor.dead = true;
        }

        step(now + 1500);
        assert.equal(body.through.stage, "rear");
        assert.equal(through.seek, null);

        const rear = told.find(({ change }) => change === "rear");

        assert.ok(rear && rear.side === "a" && ["centre", "right"].includes(rear.on));
        assert.ok(relativeTo(battle.formations[`1:${rear.on}`], through.to)[1] > 0, "behind it");

        // (The break gone through once)
        step(now + 2000);
        assert.equal(told.filter(({ change }) => change === "breach").length, 1);
    });

    it("has a steady line send its reserve through a break, the bodies beside it holding; not the cult, who stand; not one whose commander's fallen", () => {
        for (const [tactics, kill, goes] of [
            [["line", "line"], false, true],
            [["standoff", "line"], false, false],
            [["line", "line"], true, false],
        ]) {
            const { battle, engagement, told, step, members, now } = atIt({ size: 100, apart: 12, tactics });
            const ours = engagement.sides[0];
            const [left, centre] = ["left", "centre"].map((part) => battle.formations[`1:${part}`]);

            if (kill) {
                battle.actor(ours.commander).dead = true;
            }

            left.anchor = placeAt(left, [(relativeTo(left, centre.anchor)[0] >= 0 ? -1 : 1) * (FIELD.breach.hole + 0.5), 0]);

            const lines = ["left", "centre", "right"].map((part) => battle.formations[`0:${part}`].to);

            step(now + 500);

            const breach = told.find(({ change }) => change === "breach");

            assert.equal(Boolean(breach), goes, tactics.join());

            if (!goes) {
                continue;
            }

            const reserve = ours.bodies.find(({ part }) => part === "reserve");

            assert.deepEqual([breach.by, breach.part, breach.kind, breach.gap], ["commit", "reserve", "hole", "left|centre"]);
            assert.equal(reserve.state, "committed");
            assert.deepEqual(battle.formations["0:reserve"].seek, SHOOTERS);
            assert.ok(battle.formations["0:reserve"].to && battle.formations["0:reserve"].speed === FIELD.breach.speed);
            assert.ok(members(0, "reserve").filter(({ formation: { role } }) => !SHOOTERS.includes(role)).every(({ leash }) => leash === FIELD.breach.leash));
            assert.deepEqual(
                ["left", "centre", "right"].map((part) => battle.formations[`0:${part}`].to),
                lines,
                "its line holding",
            );
        }
    });
});

describe("archers with an enemy among them (core/engagement.js FIELD archers)", () => {
    it("has them give ground behind a body of their own held back, shooting from there, their body beset from behind; back in their places once none's near", () => {
        const { battle, engagement, told, step, members, now } = atIt({ size: 100, records: true });
        const body = engagement.sides[0].bodies.find(({ part }) => part === "left");
        const formation = battle.formations["0:left"];
        const archer = members(0, "left")
            .filter(({ formation: { role } }) => role === "archer")
            .sort((a, b) => b.formation.slot[1] - a.formation.slot[1])[0];
        const enemy = members(1, "centre").find(({ formation: { role } }) => role === "front");

        Object.assign(enemy, { x: archer.x + 0.5, y: archer.y });
        assert.ok(relativeTo(formation, [enemy.x, enemy.y])[1] > FORMATION.rank, "come round behind its front");

        const before = body.morale;

        step(now + 1000);

        const refuge = engagement.sides[0].bodies.find(({ formation: id }) => id === archer.formation.refuge);

        assert.ok(refuge && refuge.state === "held" && refuge !== body, `behind ${archer.formation.refuge}`);
        assert.ok(relativeTo(battle.formations[refuge.formation], archer.formation.post)[1] > 0, "behind its rearmost rank");
        assert.ok(told.some(({ change, side, part }) => change === "fallBack" && side === "a" && part === "left"));
        assert.equal(body.rear, true);
        assert.ok(body.morale < before, "shaken");

        // (Gone: back in their places)
        Object.assign(enemy, { x: enemy.x + 200 });
        step(now + 1500);
        assert.deepEqual([archer.formation.refuge, archer.formation.post, body.rear], [undefined, undefined, false]);
    });
});

describe("a body standing idle (core/engagement.js FIELD idle)", () => {
    it("closes up with an enemy near it, after FIELD idle ms", () => {
        const { battle, engagement, step, members, now } = atIt();
        const body = engagement.sides[0].bodies.find(({ part }) => part === "left");
        const formation = battle.formations["0:left"];
        const enemy = members(1, "centre").find(({ formation: { role } }) => role === "front");

        Object.assign(enemy, { x: placeAt(formation, [0, -FIELD.idle.close + 2])[0], y: placeAt(formation, [0, -FIELD.idle.close + 2])[1] });
        step(now + 500);
        step(now + FIELD.idle.ms);
        assert.equal(formation.to, null, "not yet");

        step(now + 500 + FIELD.idle.ms);
        assert.equal(body.state, "closing");
        assert.ok(Math.abs(apart(formation.to, [enemy.x, enemy.y]) - FIELD.charge.gap) < 1e-9, "its front at them");
    });

    it("wheels on the flank of the nearest body of the enemy's line, the enemy massing elsewhere (a way that wheels); or comes up beside its own that's fighting (one that doesn't)", () => {
        const wheeling = atIt();
        const left = wheeling.engagement.sides[0].bodies.find(({ part }) => part === "left");

        wheeling.step(wheeling.now + 500);
        wheeling.step(wheeling.now + 500 + FIELD.idle.ms);
        assert.equal(left.state, "flanking");
        assert.ok(wheeling.told.some(({ change, side, part }) => change === "flank" && side === "a" && part === "left"));

        const flanked = wheeling.battle.formations[`1:${left.pair}`];

        assert.ok(Math.abs(relativeTo(flanked, wheeling.battle.formations["0:left"].to)[0]) > FORMATION.apart * 3, "off its end");

        // (The cult, who don't wheel: up beside their centre, fighting)
        const standing = atIt({ tactics: ["standoff", "line"] });
        const body = standing.engagement.sides[0].bodies.find(({ part }) => part === "left");
        const centre = standing.battle.formations["0:centre"];

        for (const at of [500, 500 + FIELD.idle.ms]) {
            centre.engagedAt = standing.now + at;
            standing.step(standing.now + at);
        }

        assert.equal(body.state, "reinforcing");
        assert.ok(standing.told.some(({ change, part, beside }) => change === "reinforce" && part === "left" && beside === "centre"));
        assert.equal(standing.battle.formations["0:left"].facing, centre.facing);
        assert.ok(apart(standing.battle.formations["0:left"].to, centre.anchor) > BODIES.gap, "beside it");
    });

    it("turns a body standing to face the nearest body of the enemy's near its front, once it's an eighth of a turn off it; not one held back", () => {
        const { battle, step, now } = atIt({ size: 100 });
        const [mine, reserve, them] = ["0:left", "0:reserve", "1:right"].map((id) => battle.formations[id]);
        const [facing, held] = [mine.facing, reserve.facing];

        // (A little off its front: not turned)
        them.anchor = placeAt(mine, [-4, -10]);
        step(now + 500);
        assert.equal(mine.facing, facing);

        // (Off its end: turned to face it)
        them.anchor = placeAt(mine, [-12, 0]);
        step(now + 1000);
        assert.equal(mine.facing, towards(mine.anchor, them.anchor));

        // (Near the reserve held back: it stands as it stood)
        them.anchor = placeAt(reserve, [-8, 0]);
        step(now + 1500);
        assert.equal(reserve.facing, held);
    });

    it("leaderless, only closes up or goes at the nearest of theirs, after FIELD idle leaderless times as long", () => {
        const { battle, engagement, told, step, now } = atIt();
        const side = engagement.sides[0];
        const left = side.bodies.find(({ part }) => part === "left");
        const formation = battle.formations["0:left"];

        battle.actor(side.commander).dead = true;
        step(now + 500);
        assert.equal(side.tactics, false);

        step(now + 500 + FIELD.idle.ms);
        assert.equal(formation.to, null, "not as soon");

        step(now + 500 + FIELD.idle.ms * FIELD.idle.leaderless);
        assert.equal(left.state, "closing");
        assert.ok(formation.to, "at them");
        assert.ok(!told.some(({ change, side: key }) => (change === "flank" || change === "reinforce") && key === "a"), "no wheeling");
    });
});
