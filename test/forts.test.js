// Each people's fortifications (docs/WAR.md *Fortifications*, M14): guard towers and forward
// garrisons, where a people may build them and where its council would (core/war/forts.js), built,
// kept up, besieged and razed in the war (war.js); stood up near a player, over their squares,
// shooting from their loops and struck down (host.js, battle.js); drawn near and from afar
// (art/kits/forts.js, world/forts3d.js); and the building screen a player counsels from
// (app/building.js, dialogue.js's ruler)
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

// (Textured materials paint a canvas: enough of one for them to in Node, every other drawing call
// doing nothing)
const noop = () => {};
const context = () =>
    new Proxy(
        {
            createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
            createLinearGradient: () => ({ addColorStop: noop }),
            createRadialGradient: () => ({ addColorStop: noop }),
            measureText: (text) => ({ width: String(text).length * 10 }),
        },
        { get: (target, key) => (key in target ? target[key] : noop) },
    );

globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: context }) };

const THREE = await import("three");
const { buildingView, BUILD_SHOWN, goodsText } = await import("../client/js/app/building.js");
const { FORT_ICONS, ICON_KINDS } = await import("../client/js/app/mapicons.js");
const { TREES } = await import("../client/js/core/dialogue.js");
const { OPENS } = await import("../client/js/core/standing.js");
const { affords, COUNCIL, footprintOf, FORT_KINDS, FORTS, mayBuild, PLACING, plansFor } = await import("../client/js/core/war/forts.js");
const { tell } = await import("../client/js/core/war/news.js");
const { FORT_SIEGE, TURN_MS, War, WAR_VERSION } = await import("../client/js/core/war/war.js");
const { landAt, planWorld, WATER } = await import("../client/js/core/worldplan/plan.js");
const { FORT_LOOKS, fortObject } = await import("../client/js/world/art/kits/forts.js");
const { FORT_HEIGHTS, FortAvatar, Forts, FORTS_VIEW } = await import("../client/js/world/forts3d.js");

const apart = ([ax, ay], [bx, by]) => Math.hypot(ax - bx, ay - by);
const keyOf = (a, b) => [a, b].sort().join("|");

// Two peoples at war
function atWar(war, a, b) {
    war.relations[keyOf(a, b)] = { state: "hostile", since: 0 };
    war.known.push(keyOf(a, b));
}

// The first point round `from` (rings `from` to `to` metres out) that `test` holds for, or null
function pointNear(from, test, { inner = 0, outer = 400, step = 8 } = {}) {
    for (let r = inner; r <= outer; r += step) {
        for (let k = 0; k < 48; k++) {
            const angle = (k / 48) * Math.PI * 2;
            const at = [Math.round(from[0] + Math.cos(angle) * r), Math.round(from[1] + Math.sin(angle) * r)];

            if (test(at)) {
                return at;
            }
        }
    }

    return null;
}

function trianglesOf(object) {
    let count = 0;

    object.traverse((node) => {
        if (node.isMesh) {
            count += (node.geometry.index ? node.geometry.index.count : node.geometry.attributes.position.count) / 3;
        }
    });

    return count;
}

describe("where each people may build, and where its council would (core/war/forts.js)", () => {
    let plan;

    before(() => {
        plan = planWorld(3);
    });

    it("lets a people build on its own first lands, dry, level and off the roads, clear of settlements, sites and other forts; not in another's", () => {
        const war = new War(plan);
        const capital = war.town(war.realm("human").capital);
        const radius = plan.places.find(({ id }) => id === capital.id).radius;
        const at = pointNear(capital.at, (p) => mayBuild(war, "human", p), { inner: radius + PLACING.clear + 4 });

        assert.ok(at, "somewhere near the capital");
        assert.equal(landAt(plan, ...at).race, "human");
        assert.equal(mayBuild(war, "orc", at), false, "not in another people's lands");
        assert.equal(mayBuild(war, "human", capital.at), false, "not on a settlement's ground");

        const road = pointNear(capital.at, (p) => landAt(plan, ...p).road && landAt(plan, ...p).race === "human", { inner: radius + 30, step: 2 });
        const water = pointNear(capital.at, (p) => landAt(plan, ...p).water !== WATER.none && landAt(plan, ...p).race === "human", { inner: radius + 30, outer: 3000, step: 16 });

        assert.equal(mayBuild(war, "human", road), false, "not on a road");
        assert.equal(mayBuild(war, "human", water), false, "not in the water");

        // (Built: none other within PLACING.forts of it)
        Object.assign(war.realm("human").stores, { wood: 500, stone: 500, metal: 500 });
        war.build("human", { kind: "tower", at });
        assert.equal(mayBuild(war, "human", [at[0] + PLACING.forts - 5, at[1]]), false);
    });

    it("lets a people build in another's lands only within PLACING.captured of the edge of a town it took from them", () => {
        const war = new War(plan);
        const human = war.town(war.realm("human").capital);
        const town = war.towns.filter(({ owner, kind }) => owner === "orc" && kind !== "capital").sort((a, b) => apart(a.at, human.at) - apart(b.at, human.at))[0];
        const radius = plan.places.find(({ id }) => id === town.id).radius;
        const theirs = (p) => landAt(plan, ...p).race === "orc";
        const near = pointNear(town.at, (p) => theirs(p) && mayBuild(war, "orc", p), { inner: radius + PLACING.clear + 4, outer: radius + PLACING.captured - 4, step: 4 });
        const far = pointNear(town.at, (p) => theirs(p) && mayBuild(war, "orc", p), { inner: radius + PLACING.captured + 20, outer: radius + PLACING.captured + 200, step: 8 });

        assert.ok(near && far, "orcish land near the town and further off");
        assert.equal(mayBuild(war, "human", near), false, "theirs, while they hold it");

        town.owner = "human";
        assert.equal(mayBuild(war, "human", near), true, "near a town taken from them");
        assert.equal(mayBuild(war, "human", far), false, "but no further");
    });

    it("plans a tower before each town facing another people's and by each works, a forward garrison only on a front with an enemy; each where it may build, the same each turn", () => {
        const war = new War(plan);

        assert.ok(plansFor(war, "human").every(({ kind }) => kind === "tower"), "at peace: no garrisons");

        atWar(war, "human", "orc");

        const plans = plansFor(war, "human");
        const keys = plans.map(({ key }) => key);

        assert.ok(plans.some(({ kind }) => kind === "tower") && plans.some(({ kind }) => kind === "garrison"), "both kinds");
        assert.equal(new Set(keys).size, keys.length, "each once");
        assert.deepEqual(plansFor(war, "human"), plans, "the same asked again");
        assert.deepEqual(
            plans.map(({ score }) => score),
            plans.map(({ score }) => score).sort((a, b) => b - a),
            "best first",
        );

        for (const each of plans) {
            assert.ok(mayBuild(war, "human", each.at), `${each.key}: where it may build`);
            assert.deepEqual(each.cost, FORTS[each.kind].cost);

            if (each.kind === "garrison") {
                assert.ok(war.hostile("human", war.town(each.toward).owner), `${each.key}: facing an enemy`);
            }
        }

        // (Each kept apart from the others of its kind it already has: FORTS apart)
        const first = plans.find(({ kind }) => kind === "garrison");

        Object.assign(war.realm("human").stores, { wood: 900, stone: 900, metal: 900 });
        assert.ok(war.build("human", first));
        assert.ok(plansFor(war, "human").filter(({ kind }) => kind === "garrison").every(({ at }) => apart(at, first.at) > FORTS.garrison.apart));
    });

    it("tells each fortification's squares, its kind's size round its point", () => {
        for (const kind of FORT_KINDS) {
            const [x0, y0, x1, y1] = footprintOf({ kind, at: [100, 200] });

            assert.equal(x1 - x0 + 1, FORTS[kind].size);
            assert.equal(y1 - y0 + 1, FORTS[kind].size);
            assert.ok(x0 <= 100 && x1 >= 100 && y0 <= 200 && y1 >= 200);
        }

        assert.ok(affords({ wood: 40, stone: 40, metal: 10 }, FORTS.tower.cost));
        assert.ok(!affords({ wood: 40, stone: 39, metal: 10 }, FORTS.tower.cost));
    });
});

describe("the fortifications in the war (war.js)", () => {
    let plan;

    before(() => {
        plan = planWorld(3);
    });

    // A war with a tower of the humans' built near their capital, its stores as given
    function withTower(stores = { wood: 500, stone: 500, metal: 500 }) {
        const war = new War(plan);
        const realm = war.realm("human");
        const capital = war.town(realm.capital);
        const radius = plan.places.find(({ id }) => id === capital.id).radius;
        const at = pointNear(capital.at, (p) => mayBuild(war, "human", p), { inner: radius + 40 });

        Object.assign(realm.stores, { wood: 500, stone: 500, metal: 500 });

        const fort = war.build("human", { kind: "tower", at, about: capital.id });

        Object.assign(realm.stores, stores);

        return { war, realm, fort, capital };
    }

    it("builds one from a people's stores, told; none it can't afford, nor more than the most it keeps", () => {
        const war = new War(plan);
        const realm = war.realm("human");
        const capital = war.town(realm.capital);
        const radius = plan.places.find(({ id }) => id === capital.id).radius;
        const at = pointNear(capital.at, (p) => mayBuild(war, "human", p), { inner: radius + 40 });

        Object.assign(realm.stores, { wood: 30, stone: 100, metal: 100 });
        assert.equal(war.build("human", { kind: "tower", at }), null, "short of wood");

        realm.stores.wood = 100;

        const fort = war.build("human", { kind: "tower", at, about: capital.id });
        const events = war.advance(0);

        assert.ok(fort);
        assert.deepEqual(realm.stores, { ...realm.stores, wood: 60, stone: 60, metal: 90 });
        assert.equal(fort.hp, FORTS.tower.hp);
        assert.equal(war.fort(fort.id), fort);
        assert.ok(events.some(({ type, fort: id }) => type === "built" && id === fort.id));
        assert.match(tell(events.find(({ type }) => type === "built"), war), /have raised a guard tower/);

        // (At the most it keeps: none more)
        for (let k = 1; k < FORTS.tower.most; k++) {
            war.forts.push({ ...fort, id: `fort-x${k}`, at: [fort.at[0] + k * 1000, fort.at[1]] });
        }

        Object.assign(realm.stores, { wood: 900, stone: 900, metal: 900 });

        const other = pointNear(capital.at, (p) => mayBuild(war, "human", p) && apart(p, at) > 200, { inner: radius + 40, outer: 800 });

        assert.equal(war.build("human", { kind: "tower", at: other }), null);
    });

    it("keeps each up a turn at a time from its people's stores, mending it; unkept, it falls into ruin and is given up", () => {
        const { war, realm, fort } = withTower({ wood: 50, stone: 50, metal: 9 });

        // (No convoy of theirs on the road to fill the stores this turn)
        war.forces = war.forces.filter(({ kind, realm: id }) => !(kind === "convoy" && id === "human"));
        fort.hp = 600;
        war.step();
        assert.deepEqual([realm.stores.wood, realm.stores.stone, realm.stores.metal], [49.9, 49.9, 9]);
        assert.equal(fort.hp, 600 + FORTS.tower.hp * FORT_SIEGE.mend);

        Object.assign(realm.stores, { wood: 0, stone: 0, metal: 0 });
        war.forces = war.forces.filter(({ kind, realm: id }) => !(kind === "convoy" && id === "human"));
        war.step();
        assert.equal(fort.hp, 600 + FORTS.tower.hp * (FORT_SIEGE.mend - FORT_SIEGE.decay));

        fort.hp = 10;
        war.forces = war.forces.filter(({ kind, realm: id }) => !(kind === "convoy" && id === "human"));
        Object.assign(realm.stores, { wood: 0, stone: 0, metal: 0 });
        war.step();

        const events = war.advance(0);

        assert.equal(war.fort(fort.id), null);
        assert.ok(events.some(({ type, fort: id }) => type === "abandoned" && id === fort.id));
    });

    it("has an enemy's army near one fall on it, losing some to its defenders, and raze it at nothing; not while a player's near it", () => {
        const { war, fort, capital } = withTower();

        atWar(war, "human", "orc");

        const home = war.towns.find(({ owner }) => owner === "orc").id;
        const at = [fort.at[0] + 100, fort.at[1]];
        const camp = { id: "force-test", realm: "orc", kind: "camp", size: 30, at, path: [at], leg: 0, target: capital.id, home, mission: null, about: null, since: war.turn };

        war.forces.push(camp);
        war.watch([fort.id]);
        war.step();
        assert.equal(fort.hp, FORTS.tower.hp, "a player's near: played out in the world");

        war.watch([]);
        fort.hp = 1000;
        war.step();
        assert.ok(fort.hp < 1000, `${fort.hp}: fallen on`);
        assert.ok(camp.size < 30, "its defenders bring some down");

        for (let k = 0; k < 10 && war.fort(fort.id); k++) {
            war.step();
        }

        const events = war.advance(0);

        assert.equal(war.fort(fort.id), null, "razed");
        assert.ok(events.some(({ type, by }) => type === "razed" && by === "orc"));
        assert.ok(war.realm("human").standing.orc < 0, "a grudge");
    });

    it("has one struck down in the world razed by the people who struck it", () => {
        const { war, fort } = withTower();

        assert.equal(war.strike(fort.id, 200, "orc"), true);
        assert.equal(fort.hp, FORTS.tower.hp - 200);
        assert.equal(war.strike(fort.id, 5000, "orc"), false);
        assert.equal(war.fort(fort.id), null);
        assert.ok(war.advance(0).some(({ type, by, played }) => type === "razed" && by === "orc" && played));
    });

    it("heeds a player's counsel where to build: the plan counselled built first, as soon as the stores allow", () => {
        const war = new War(plan);

        atWar(war, "human", "orc");

        const plans = plansFor(war, "human");
        // (One not the council's first, that a Councillor's counsel weighs above it)
        const last = plans.slice(1).find(({ score }) => score * (1 + COUNCIL.counsel) > plans[0].score);

        assert.ok(last, "one counsel can put first");
        assert.equal(war.counsel("human", { build: "tower:nowhere" }, 1), false, "not one of its plans");
        assert.equal(war.counsel("human", { build: last.key }, 1), true);
        assert.equal(war.realm("human").build.key, last.key);

        Object.assign(war.realm("human").stores, { wood: 900, stone: 900, metal: 900 });
        war.step();

        const built = war.forts.filter(({ realm }) => realm === "human");

        assert.equal(built.length, 1);
        assert.equal(built[0].about, last.about);
        assert.equal(war.realm("human").build, null, "heeded");
    });

    it("keeps its fortifications in its snapshot, and carries on a war kept before them", () => {
        const { war, fort } = withTower();
        const again = War.restore(plan, structuredClone(war.snapshot()));

        assert.equal(war.snapshot().version, WAR_VERSION);
        assert.deepEqual(again.forts, war.forts);
        assert.equal(again.nextFort, war.nextFort);
        assert.deepEqual(again.fort(fort.id), fort);

        const older = structuredClone(war.snapshot());

        delete older.forts;
        delete older.nextFort;
        older.version = 2;

        const restored = War.restore(plan, older);

        assert.deepEqual(restored.forts, []);
        assert.equal(restored.nextFort, 1);
    });

    it("has every people's council build as its stores allow, over a long war: none where it mayn't, never more than the most, never its stores below nothing", () => {
        const war = new War(plan);
        const events = [];

        war.setMight(8);

        for (let k = 0; k < 400; k++) {
            const before = war.forts.map((fort) => ({ ...fort }));

            for (const event of war.advance(TURN_MS)) {
                events.push(event);

                if (event.type === "built") {
                    const others = before.filter((fort) => fort.realm === event.realm && fort.kind === event.kind);

                    assert.ok(others.every((fort) => apart(fort.at, event.at) > FORTS[event.kind].apart), `${event.fort} kept apart`);
                }
            }

            for (const realm of war.realms) {
                assert.ok(Object.values(realm.stores).every((amount) => amount >= 0), `${realm.id}'s stores`);
            }

            for (const kind of FORT_KINDS) {
                for (const realm of war.realms) {
                    assert.ok(war.forts.filter((fort) => fort.realm === realm.id && fort.kind === kind).length <= FORTS[kind].most);
                }
            }
        }

        const built = events.filter(({ type }) => type === "built");

        assert.ok(built.length >= 6, `${built.length} built`);
        assert.ok(new Set(built.map(({ realm }) => realm)).size >= 3, "by several peoples");
        assert.ok(built.some(({ kind }) => kind === "tower"));
    });
});

describe("the fortifications near a player (host.js, battle.js)", () => {
    const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });
    let STEP_MS;
    let Host;
    let HOST_PLAYER;
    let FORT_NEAR;
    let buildWorld;

    before(async () => {
        ({ STEP_MS } = await import("../client/js/core/battle.js"));
        ({ Host, HOST_PLAYER, FORT_NEAR } = await import("../client/js/core/host.js"));
        ({ buildWorld } = await import("../client/js/core/overworld.js"));
    });

    const run = (host, ms) => {
        const events = [];

        for (let t = 0; t < ms; t += STEP_MS) {
            events.push(...host.advance(STEP_MS));
        }

        return events;
    };

    // A world with a human tower built near its player
    const nearTower = () => {
        const host = new Host(buildWorld({ seed: 2 }), { populate: false });

        host.join({ id: HOST_PLAYER, hero: HERO });

        const actor = host.battle.actor(HOST_PLAYER);
        const war = host.war;
        const at = pointNear([actor.x, actor.y], (p) => mayBuild(war, "human", p), { inner: 30, step: 6 });

        Object.assign(war.realm("human").stores, { wood: 500, stone: 500, metal: 500 });

        const fort = war.build("human", { kind: "tower", at });

        return { host, war, actor, fort };
    };

    it("stands one up near a player, over its squares, as strong as it stands in the war; lets it go once they're far", () => {
        const { host, war, actor, fort } = nearTower();
        const events = run(host, 1000);
        const town = host.world.maps.town;
        const [x0, y0, x1, y1] = footprintOf(fort);
        const out = host.battle.actor(fort.id);

        assert.ok(events.some(({ type, fort: id }) => type === "fortOut" && id === fort.id));
        assert.ok(out && out.kind === "fort" && out.team === "human");
        assert.deepEqual(out.footprint, [x0, y0, x1, y1]);
        assert.equal(out.hp, war.fort(fort.id).hp);
        assert.ok(town.squares.blocked(x0, y0) && town.squares.blocked(x1, y1), "its squares blocked");
        assert.ok(!town.squares.blocked(x0 - 3, y0 - 3), "round it open");
        assert.ok(war.watched.has(fort.id));

        // (Away, further from it than FORT_NEAR.far)
        const away = Math.sign(actor.x - fort.at[0]) || 1;

        Object.assign(actor, { square: [actor.square[0] + away * (FORT_NEAR.far + 50), actor.square[1]], x: actor.x + away * (FORT_NEAR.far + 50) });

        const later = run(host, 1000);

        assert.ok(later.some(({ type, fort: id, razed }) => type === "fortDown" && id === fort.id && !razed));
        assert.ok(!host.battle.actor(fort.id));
        assert.ok(war.fort(fort.id), "it stands on in the war");
    });

    it("shoots at its people's enemies from its loops, within 20 m; not at others, nor further off", () => {
        const { host, war, fort } = nearTower();

        run(host, 500);

        const [, , x1, y1] = footprintOf(fort);
        const add = (id, team, [x, y]) => host.battle.add({ id, kind: "soldier", name: id, weapon: "cleaver", team, square: [x, y], ai: null });

        add("friend", "elf", [x1 + 8, y1 + 6]);
        add("far-foe", "orc", [x1 + 28, y1]);

        const calm = run(host, 4000);

        assert.ok(!calm.some(({ type, id }) => type === "attack" && id === fort.id), "none at war with it in reach");

        atWar(war, "human", "orc");
        add("foe", "orc", [x1 + 10, y1]);

        const shot = run(host, 6000);
        const loosed = shot.filter(({ type, id }) => type === "attack" && id === fort.id);

        assert.ok(loosed.length >= 2, `${loosed.length} loosed`);
        assert.ok(loosed.every(({ target }) => target === "foe"));
        assert.ok(host.battle.actor("foe").hp < host.battle.actor("foe").maxHp || host.battle.actor("foe").dead);
        assert.equal(host.battle.actor("far-foe").hp, host.battle.actor("far-foe").maxHp);
    });

    it("has one struck in the world lose its strength in the war, and razed at nothing: let go, its squares open again", () => {
        const { host, war, fort } = nearTower();

        run(host, 500);
        atWar(war, "human", "orc");

        const [x0, y0, x1, y1] = footprintOf(fort);

        host.battle.add({ id: "raider", kind: "soldier", name: "raider", weapon: "cleaver", team: "orc", square: [x1 + 6, y0], ai: null });
        Object.assign(host.battle.actor("raider"), { hp: 50000, maxHp: 50000 });
        host.battle.actor(fort.id).hp = 20;
        war.fort(fort.id).hp = 20;
        host.command("raider", { type: "engage", target: fort.id });

        const raider = host.battle.actor("raider");

        Object.assign(raider, { ai: "patrol", patrol: [raider.square], target: fort.id });

        const events = run(host, 25000);

        assert.equal(war.fort(fort.id), null, "razed in the war");
        assert.ok(events.some(({ type, fort: id, razed, by }) => type === "fortDown" && id === fort.id && razed && by === "orc"));
        assert.ok(events.some(({ type, event }) => type === "war" && event.type === "razed" && event.by === "orc"));
        assert.ok(!host.battle.actor(fort.id));
        assert.ok(!host.world.maps.town.squares.blocked(x0, y0) && !host.world.maps.town.squares.blocked(x1, y1), "its squares open");
    });

    it("keeps the fortifications stood up in its snapshot", () => {
        const { host, fort } = nearTower();

        run(host, 1000);

        const again = Host.restore(buildWorld({ seed: 2 }), structuredClone(host.snapshot()));

        assert.deepEqual([...again.fortsOut], [...host.fortsOut]);
        assert.ok(again.fortsOut.has(fort.id));
    });
});

describe("the fortifications drawn (art/kits/forts.js, world/forts3d.js, app/mapicons.js)", () => {
    it("builds each people's tower and forward garrison, within a budget, their doors and gates lit", () => {
        for (const people of Object.keys(FORT_LOOKS)) {
            for (const kind of FORT_KINDS) {
                const object = fortObject(kind, people);
                const box = new THREE.Box3().setFromObject(object);
                const triangles = trianglesOf(object);

                assert.ok(triangles > 50 && triangles < 9000, `${people} ${kind}: ${triangles} triangles`);
                assert.ok(object.userData.lights?.length >= 1, `${people} ${kind}: a torch`);

                // (In world pixels, five to the metre: as wide as it stands over, about)
                const across = (box.max.x - box.min.x) / 5;

                assert.ok(across >= FORTS[kind].size - 0.5 && across <= FORTS[kind].size + 2.5, `${people} ${kind}: ${across.toFixed(1)} m across`);
            }
        }
    });

    it("draws those near whole, and lets them go once they're far; every one of them from afar", () => {
        const scene = new THREE.Scene();
        const farScene = new THREE.Scene();
        const forts = new Forts(scene, farScene);
        const list = [
            { id: "fort-1", kind: "tower", realm: "human", at: [100, 100], facing: 0 },
            { id: "fort-2", kind: "garrison", realm: "orc", at: [100 + FORTS_VIEW + 300, 100], facing: 1 },
        ];

        let { added, gone } = forts.sync(list, [100, 120]);

        assert.deepEqual(added.map(({ id }) => id), ["fort-1"]);
        assert.deepEqual(gone, []);
        assert.ok(scene.getObjectByName("fort:fort-1"));

        const afar = farScene.getObjectByName("fortifications from afar");

        assert.ok(afar?.visible && afar.geometry.getAttribute("position").count > 0, "seen from afar");

        ({ added, gone } = forts.sync(list, [100 + FORTS_VIEW + 300, 120]));
        assert.deepEqual(added.map(({ id }) => id), ["fort-2"]);
        assert.deepEqual(gone, ["fort-1"]);
        assert.equal(forts.lights().length, 1, "the garrison's torch by its gate");

        forts.sync([], [0, 0]);
        assert.equal(farScene.getObjectByName("fortifications from afar").visible, false);
        forts.dispose();
        assert.equal(scene.children.length, 0);
    });

    it("stands in for one in the battle: as tall as it is, loosing from its loops, doing nothing else", () => {
        for (const kind of FORT_KINDS) {
            const avatar = new FortAvatar(kind);

            avatar.place(10, 20, 0);
            assert.equal(avatar.character.height, FORT_HEIGHTS[kind].height);
            assert.equal(avatar.hand("Right").y, FORT_HEIGHTS[kind].loops);
            assert.deepEqual([avatar.hand().x, avatar.hand().z], [10, 20]);
            assert.equal(avatar.actions.die(), 0);
        }
    });

    it("has an icon for each kind on the maps", () => {
        for (const kind of FORT_KINDS) {
            assert.ok(ICON_KINDS.includes(FORT_ICONS[kind]), kind);
        }
    });
});

describe("the building screen (app/building.js, dialogue.js's ruler)", () => {
    let plan;

    before(() => {
        plan = planWorld(3);
    });

    it("shows a people's council's best plans, named, costed, whether the stores hold each, and their fortifications standing", () => {
        const war = new War(plan);

        atWar(war, "human", "orc");
        Object.assign(war.realm("human").stores, { wood: 50, stone: 45, metal: 12 });

        const view = buildingView(war, "human");
        const plans = plansFor(war, "human");

        assert.deepEqual(view.stores, { wood: 50, stone: 45, metal: 12 });
        assert.equal(view.plans.length, Math.min(BUILD_SHOWN, plans.length));
        assert.deepEqual(
            view.plans.map(({ key }) => key),
            plans.slice(0, BUILD_SHOWN).map(({ key }) => key),
        );

        for (const shown of view.plans) {
            assert.match(shown.name, /^A (guard tower|forward garrison) (before|by) /);
            assert.equal(shown.affordable, shown.kind === "tower", `${shown.key}: a tower's within the stores, a garrison's not`);
            assert.deepEqual([shown.x, shown.z], plans.find(({ key }) => key === shown.key).at);
            assert.deepEqual(shown.upkeep, FORTS[shown.kind].upkeep);
        }

        assert.deepEqual(view.plans.map(({ place }) => place), view.plans.map((_, k) => k + 1));
        assert.equal(view.counselled, null);

        // (Counselled: marked so; built: among its fortifications)
        war.counsel("human", { build: view.plans[1].key }, 1);
        assert.equal(buildingView(war, "human").plans[1].counselled, true);

        Object.assign(war.realm("human").stores, { wood: 900, stone: 900, metal: 900 });
        war.build("human", plans[0]);
        assert.equal(buildingView(war, "human").forts.length, 1);
        assert.equal(buildingView(war, "human").forts[0].maxHp, FORTS[plans[0].kind].hp);

        assert.equal(goodsText({ wood: 40, stone: 40, metal: 10 }), "40 wood, 40 stone and 10 metal");
        assert.equal(goodsText({ wood: 0.4, metal: 0.2 }), "0.4 wood and 0.2 metal");
        assert.equal(goodsText({}), "nothing");
    });

    it("is opened at the ruler's by a player of rank, asked where to build, once the council has plans", () => {
        const { more, build } = TREES.ruler.nodes;
        const ask = more.choices.find(({ if: condition }) => condition?.counselBuild);

        assert.ok(ask, "asked where to build");
        assert.equal(ask.next, "build");
        assert.ok(build.choices.some(({ if: condition, do: effects }) => condition?.plans && effects?.some(({ plans: open }) => open === "open")));
        assert.equal(OPENS.build, 3, "a Knight's");
        assert.ok(COUNCIL.counsel > 1, "a player's counsel weighs");
    });
});
