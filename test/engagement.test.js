// Battles fought as battles were (client/js/core/engagement.js; docs/WAR.md *Battles*): each side's
// line in three bodies across a wide front, a reserve and its commander's household held back; the
// lines halting while the archers loose, then charging, each body at the one opposite; each body's
// morale its own, broken alone (a band that never breaks falling back and coming on again), its
// reserve and household sent in where its line gives way; its commander fallen, no tactics left
// and its morale shaken. Played on a battle of the engine's own making here: its soldiers, their
// formations and their fights set as each test wants
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BAND_TACTICS, BODIES, bodiesOf, COMMANDERS, engagementOf, FIELD, layoutOf, MORALE, moraleAfter, offsetsOf, pairOf, relativeTo, stepEngagement, tacticsOf } from "../client/js/core/engagement.js";
import { FORMATION, MIX, placeAt, placesOf } from "../client/js/core/formation.js";

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
function drawnUp({ size = 60, apart = 60, tactics = ["line", "line"], falters = [false, false] } = {}) {
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
    const step = (now, { hold = false } = {}) => stepEngagement(engagement, { battle, now, hold, record: () => ({}), event: (change, data) => told.push({ change, ...data }), afflict: (id, kind, ms) => afflicted.push({ id, kind, ms }) });

    return { battle, engagement, told, afflicted, step, members: (k, part) => actors.filter(({ formation }) => formation.id === `${k}:${part}`) };
}

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

    it("counts a body beset on its flank by an enemy's fighting near its end, not facing it head on; not by the one before it", () => {
        const { battle, engagement, step } = drawnUp();
        const ours = engagement.sides[0].bodies.find(({ part }) => part === "left");
        const mine = battle.formations["0:left"];

        engagement.phase = "melee";
        Object.assign(battle.formations["1:right"], { anchor: placeAt(mine, [0, -2]), facing: mine.facing + Math.PI, engagedAt: 500 });
        step(500);
        assert.equal(ours.flanked, false, "head on");

        Object.assign(battle.formations["1:right"], { anchor: placeAt(mine, [-12, 0]), facing: mine.facing + Math.PI / 2, engagedAt: 1000 });
        step(1000);
        assert.equal(ours.flanked, true, "on its flank");
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
