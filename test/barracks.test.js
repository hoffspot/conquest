// The barracks (docs/WAR.md M16): one in every settlement the war's fought over, a house made over
// (setpieces/town.js), drawn in each people's look, its long room inside; its guardsmen and
// captain stood up in it near a player, of whoever holds its town (core/host.js BARRACKS_NEAR);
// put down, the town taken by the people of whoever put them down, if they're at war with its
// holders and the age lets it be (core/war/war.js capture); the keep's request to take a town so;
// and the war half as fast as it was (TURNS_PER_STAGE, SIEGE)
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

// (Textured materials and signs paint a canvas: enough of one for them to in Node, every other
// drawing call doing nothing)
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
const { layoutTown, SETTLEMENT_KINDS } = await import("../client/js/core/setpieces/town.js");
const { ENTERED, PLOT } = await import("../client/js/core/setpieces/pieces.js");
const { barracksPosts, barracksRooms, ENTERABLE, ENTRANCES } = await import("../client/js/core/insides.js");
const { readPlan } = await import("../client/js/core/interiors.js");
const { QUARTERED } = await import("../client/js/core/war/muster.js");
const { tell } = await import("../client/js/core/war/news.js");
const { BARRACKS_TAKEN, HOLDINGS, SIEGE, STAGES, TURN_MS, TURNS_PER_STAGE, War } = await import("../client/js/core/war/war.js");
const { planWorld } = await import("../client/js/core/worldplan/plan.js");
const { offerRequest, OPENS, progressOf, REQUESTS, STANDINGS } = await import("../client/js/core/standing.js");
const { createRandom } = await import("../client/js/core/random.js");
const { landmark, LANDMARK_BUILDERS } = await import("../client/js/world/art/kits/landmarks.js");
const { builderFor } = await import("../client/js/world/art/peoples/index.js");
const { ICON_KINDS } = await import("../client/js/app/mapicons.js");

const PEOPLES = ["human", "elf", "darkElf", "cat", "lizard", "orc"];
const keyOf = (a, b) => [a, b].sort().join("|");

// Two peoples at war
function atWar(war, a, b) {
    war.relations[keyOf(a, b)] = { state: "hostile", since: 0 };
    war.known.push(keyOf(a, b));
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

function materialsOf(object) {
    const names = [];

    object.traverse((node) => {
        if (node.isMesh) {
            names.push(...[node.material].flat().map(({ name }) => name));
        }
    });

    return names;
}

describe("a barracks in every settlement the war's fought over (setpieces/town.js)", () => {
    it("makes over one house of every village, town, city and capital, of every people, out towards its edge, its door onto the street; none in a hamlet or a farmstead", () => {
        for (const people of PEOPLES) {
            for (const kind of ["village", "town", "city", "capital"]) {
                const town = layoutTown({ seed: 2, kind, people });
                const quarters = town.pieces.filter(({ name }) => name === "barracks");

                assert.equal(quarters.length, 1, `${people} ${kind}`);

                const [piece] = quarters;
                const out = Math.hypot(piece.x - town.centre[0], piece.y - town.centre[1]) / town.radius;

                assert.equal(piece.kind, "landmark");
                assert.equal(piece.grade, kind === "village" ? "guardhouse" : "barracks");
                assert.ok(out > 0.2 && out < 1, `${people} ${kind}: ${out.toFixed(2)} of the way out`);
                assert.ok(piece.w * PLOT >= 5 && piece.h * PLOT >= 5, `${people} ${kind}: ${piece.w * PLOT} by ${piece.h * PLOT} m`);
                assert.ok(!piece.water || people === "lizard", "over the water only where they build over it");
                assert.equal(typeof piece.seed, "number");
            }

            for (const kind of ["hamlet", "farmstead"]) {
                assert.ok(!layoutTown({ seed: 2, kind, people }).pieces.some(({ name }) => name === "barracks"), `${people} ${kind}`);
            }
        }

        assert.ok(["village", "town", "city", "capital"].every((kind) => SETTLEMENT_KINDS[kind].barracks));
    });

    it("is the same every time for a place, and leaves its seat as it was", () => {
        const [a, b] = [1, 2].map(() => layoutTown({ seed: 5, kind: "city" }));

        assert.deepEqual(a.pieces, b.pieces);

        const seat = a.pieces.find(({ name }) => name === "hall");
        const quarters = a.pieces.find(({ name }) => name === "barracks");

        assert.ok(seat && quarters && (seat.x !== quarters.x || seat.y !== quarters.y));
    });
});

describe("a barracks inside (core/insides.js)", () => {
    const [floor] = barracksRooms({ name: "the barracks" });
    const quarters = readPlan("barracks/quarters", floor.name, floor.rows, { ground: floor.ground });
    const at = (kind) => quarters.pieces.filter((piece) => piece.kind === kind);

    it("can be gone into, by its door where its art puts it", () => {
        assert.ok(ENTERED.includes("barracks") && ENTERABLE.includes("barracks"));
        assert.ok(ENTRANCES.barracks.width >= 1.6 && ENTRANCES.barracks.depth > 1);
    });

    it("has its garrison's bunks, its arms racked, its mess table, its captain's desk and their rolls, and a hearth", () => {
        assert.ok(at("bed").length >= 6, "bunks");
        assert.ok(at("bed").every(({ w, h }) => w === 1 && h === 2), "a metre by two, along the walls");
        assert.ok(at("rack").length && at("table").length && at("counter").length && at("shelves").length && at("hearth").length && at("chest").length);
        assert.equal(quarters.marks.D.length, 2);
    });

    it("stands its captain behind their desk, and its guardsmen at their posts on the floor, the furthest from the door first, enough for a capital's", () => {
        const { captain, posts } = barracksPosts(quarters);
        const [desk] = at("counter");
        const [door] = quarters.marks.D;
        const apart = ({ square: [x, y] }) => Math.hypot(x - door[0], y - door[1]);

        assert.ok(captain.square[1] < desk.y && captain.square[0] >= desk.x && captain.square[0] < desk.x + desk.w, "behind the desk");
        assert.ok(posts.length >= QUARTERED.capital);
        assert.ok(posts.every(({ square: [x, y] }) => !quarters.blocked[y][x]), "on the floor");
        assert.ok(posts.every((post, k) => k === 0 || apart(post) <= apart(posts[k - 1])), "the furthest first");
        assert.ok(posts.every((post) => apart(post) >= 3), "none at the door");
    });
});

describe("a barracks drawn (art/kits/landmarks.js, art/peoples, app/mapicons.js)", () => {
    it("builds each people's barracks and guardhouse in their look, within its lot and a few thousand triangles, its name on a board", async () => {
        assert.equal(typeof LANDMARK_BUILDERS.barracks, "function");

        for (const people of PEOPLES) {
            for (const kind of ["village", "town"]) {
                const piece = layoutTown({ seed: 3, kind, people }).pieces.find(({ name }) => name === "barracks");
                const build = builderFor(piece) ?? landmark;
                const object = await build(piece);
                const box = new THREE.Box3().setFromObject(object);
                const triangles = trianglesOf(object);
                const name = kind === "village" ? "Guardhouse" : "Barracks";

                assert.ok(triangles > 100 && triangles < 12000, `${people} ${kind}: ${triangles} triangles`);
                // (The orcs' longhouse's porch out over the street before it, as their guild's and hall's)
                const over = people === "orc" ? 10 : 7.5;

                assert.ok(box.min.x > -7.5 && box.min.z > -7.5 && box.max.x < piece.w * 20 + 7.5 && box.max.z < piece.h * 20 + over, `${people} ${kind}: spills out of its lot`);
                assert.ok(materialsOf(object).includes(`board ${name}`), `${people} ${kind}: its name`);
            }
        }
    });

    it("marks one gone into on the maps with its own icon", () => {
        assert.ok(ICON_KINDS.includes("barracks"));
    });
});

describe("a town taken by its barracks (war.js capture)", () => {
    let plan;

    before(() => {
        plan = planWorld(3);
    });

    const fresh = () => {
        const war = new War(plan);
        const town = war.towns.find((each) => each.owner === "orc" && each.kind === "town" && war.realm("orc").seat !== each.id);

        return { war, town };
    };

    it("is the people's who put its barracks down, at war with its holders, in an age that lets it be: held by a quarter of a full garrison of theirs", () => {
        const { war, town } = fresh();

        atWar(war, "human", "orc");
        war.stage = STAGES.findIndex(({ take }) => take.includes("town"));

        const grudge = war.realm("orc").standing.human ?? 0;

        assert.equal(war.capture(town.id, "human"), "taken");
        assert.equal(town.owner, "human");
        assert.equal(town.garrison, Math.ceil(HOLDINGS.town.garrison * BARRACKS_TAKEN));
        assert.ok(war.realm("orc").standing.human < grudge, "the orcs bear a grudge");

        const event = war.events.find(({ type }) => type === "taken");

        assert.deepEqual({ ...event, turn: 0 }, { type: "taken", turn: 0, town: town.id, from: "orc", to: "human", how: "barracks" });
        assert.match(tell(event, war), /has fallen to the .+, its barracks put to the sword/);
    });

    it("isn't, when they're not at war, or the age doesn't let towns of its kind be taken, or it's theirs", () => {
        const { war, town } = fresh();

        war.stage = STAGES.length - 1;
        assert.equal(war.capture(town.id, "human"), "peace");

        atWar(war, "human", "orc");
        war.stage = 0;
        assert.equal(war.capture(town.id, "human"), "age");
        war.stage = STAGES.findIndex(({ take }) => take.includes("village"));
        assert.equal(war.capture(town.id, "human"), "age", "only villages, in border wars");
        assert.equal(war.capture(town.id, "orc"), null, "their own");
        assert.equal(war.capture("nowhere", "human"), null);
        assert.equal(town.owner, "orc");
    });

    it("takes a people's seat the same way, in the age of conquest, making them their vassal", () => {
        const { war } = fresh();
        const seat = war.town(war.realm("orc").seat);

        atWar(war, "human", "orc");
        war.stage = STAGES.length - 1;
        assert.equal(war.capture(seat.id, "human"), "taken");
        assert.equal(war.realm("orc").overlord, "human");
        assert.equal(seat.owner, "orc", "theirs to rule from, under the humans");
    });
});

describe("a barracks' garrison near a player (host.js BARRACKS_NEAR)", () => {
    const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });
    let STEP_MS;
    let Host;
    let HOST_PLAYER;
    let BARRACKS_NEAR;
    let KINDS;
    let buildWorld;

    before(async () => {
        ({ KINDS, STEP_MS } = await import("../client/js/core/battle.js"));
        ({ Host, HOST_PLAYER, BARRACKS_NEAR } = await import("../client/js/core/host.js"));
        ({ buildWorld } = await import("../client/js/core/overworld.js"));
    });

    const run = (host, ms) => {
        const events = [];

        for (let t = 0; t < ms; t += STEP_MS) {
            events.push(...host.advance(STEP_MS));
        }

        return events;
    };
    const put = (actor, [x, y]) => Object.assign(actor, { x: x + 0.5, y: y + 0.5, square: [x, y], path: [], order: null, target: null });

    // A world whose player's at the door of the town they start in's barracks, its holders `owner`
    // (at war with the player's people, `war`, in an age it can be taken), and goes in
    const inBarracks = ({ owner = "orc", war: fighting = true, garrison = null } = {}) => {
        const host = new Host(buildWorld({ seed: 2 }), { populate: false });

        host.join({ id: HOST_PLAYER, hero: HERO });

        const war = host.war;
        const town = war.town(host.world.start.id);
        const building = [...host.world.interiors.buildings.values()].find(({ kind, place }) => kind === "barracks" && place === "home");
        const me = host.battle.actor(HOST_PLAYER);

        town.owner = owner;
        town.garrison = garrison ?? HOLDINGS[town.kind].garrison;
        war.stage = STAGES.length - 1;

        if (fighting) {
            atWar(war, "human", owner);
        }

        put(me, building.door.ends[0].squares[0]);
        me.map = "town";
        assert.equal(host.command(HOST_PLAYER, { type: "enter", link: building.door.id }).ok, true);

        const events = run(host, 1500);
        const out = host.quartered.get(town.id);

        return { host, war, town, building, me, out, events };
    };

    // Each of them put down by the player, one at a time (standing still for it, at a blow each)
    const putDown = (host, out) => {
        for (const id of out.ids) {
            Object.assign(host.battle.actor(id), { ai: null, hp: 1 });
        }

        const events = [];

        // (The fallen taken away a while after: down too)
        const standing = (id) => host.battle.actor(id) && !host.battle.actor(id).dead;

        for (const id of out.ids) {
            for (let tries = 0; tries < 20 && standing(id); tries++) {
                host.command(HOST_PLAYER, { type: "engage", target: id });
                events.push(...run(host, 1000));
            }
        }

        // (A moment for what follows on the last of them to be told)
        return [...events, ...run(host, 500)];
    };

    it("stands its captain and guardsmen up in it as the player comes to its door, of whoever holds the town, as many as its garrison has; its captain the stronger", () => {
        const { host, town, building, me, out, events } = inBarracks();
        const [captain, ...guardsmen] = out.ids.map((id) => host.battle.actor(id));

        assert.equal(me.map, building.maps[0]);
        assert.equal(out.people, "orc");
        assert.equal(guardsmen.length, QUARTERED[town.kind]);
        assert.ok([captain, ...guardsmen].every((actor) => actor.team === "orc" && actor.map === building.maps[0] && actor.kind === "soldier"));
        assert.match(captain.name, /captain$/);
        assert.ok(guardsmen.every(({ name }) => /guardsman$/.test(name)));
        assert.equal(captain.maxHp, Math.round(KINDS.soldier.hp * BARRACKS_NEAR.captain.hp));
        assert.equal(captain.power.melee, BARRACKS_NEAR.captain.power);
        assert.ok(guardsmen.every(({ maxHp }) => maxHp === KINDS.soldier.hp));
        assert.ok(host.soldiers.get(captain.id).captain, "in a captain's cloak");
        assert.ok(events.some(({ type, town: id, ids }) => type === "quartered" && id === town.id && ids.length === out.ids.length), "told, to be drawn");
    });

    it("has fewer guardsmen in it as its garrison's thinner, and its captain always", () => {
        const { out, town } = inBarracks({ garrison: 1 });

        assert.equal(out.ids.length, 1 + Math.ceil((1 / HOLDINGS[town.kind].garrison) * QUARTERED[town.kind]));
    });

    it("put down by the player, its town's theirs: their people's soldiers out round it, and in it once they've left", () => {
        const { host, war, town, building, me, out } = inBarracks();
        const events = putDown(host, out);

        assert.ok(out.ids.every((id) => !host.battle.actor(id) || host.battle.actor(id).dead));
        assert.ok(events.some(({ type, town: id, how, by }) => type === "barracks" && id === town.id && how === "taken" && by === "human"));
        assert.ok(events.some(({ type, event }) => type === "war" && event.type === "taken" && event.how === "barracks"));
        assert.equal(town.owner, "human");
        assert.equal(town.garrison, Math.ceil(HOLDINGS[town.kind].garrison * BARRACKS_TAKEN));

        // (Round it, its new holders' soldiers)
        assert.equal(host.mustered.get(town.id)?.people, "human");

        // (Still in it: its new garrison isn't, yet; out of it, it is)
        assert.equal(host.quartered.get(town.id).people, "orc");
        host.command(HOST_PLAYER, { type: "enter", link: building.door.id });

        const after = run(host, 8000);
        const now = host.quartered.get(town.id);

        assert.equal(me.map, "town");
        assert.equal(now.people, "human");
        assert.ok(now.ids.every((id) => host.battle.actor(id)?.team === "human"));
        assert.ok(after.some(({ type }) => type === "unquartered") && after.some(({ type }) => type === "quartered"));
        assert.ok(war.realm("orc").standing.human < 0);
    });

    it("put down by a player whose people aren't at war with its holders, isn't taken, and is made up again once they've left it a while", () => {
        const { host, town, building, out } = inBarracks({ owner: "orc", war: false });
        const events = putDown(host, out);

        assert.ok(events.some(({ type, how }) => type === "barracks" && how === "peace"));
        assert.equal(town.owner, "orc");

        host.command(HOST_PLAYER, { type: "enter", link: building.door.id });
        run(host, 8000);
        assert.ok(host.quartered.get(town.id).cleared, "not yet");
        run(host, BARRACKS_NEAR.relief);

        const now = host.quartered.get(town.id);

        assert.ok(!now.cleared && now.people === "orc" && now.ids.length >= 1, "made up");
        assert.ok(now.ids.every((id) => host.battle.actor(id) && !host.battle.actor(id).dead));
    });

    it("tells the war of each one fallen, and lets them go with the building; kept in the snapshot", () => {
        const { host, town, building, out } = inBarracks();
        const before = town.garrison;
        const victim = host.battle.actor(out.ids[1]);

        victim.hp = 1;
        host.battle.add({ id: "raider", kind: "soldier", name: "raider", weapon: "cleaver", team: "human", square: [victim.square[0] + 1, victim.square[1]], map: victim.map, ai: null });
        Object.assign(host.battle.actor("raider"), { hp: 50000, maxHp: 50000 });
        host.command("raider", { type: "engage", target: victim.id });
        run(host, 4000);
        assert.ok(victim.dead);
        assert.equal(town.garrison, before - 1);
        assert.ok(host.quartered.get(town.id).relief > host.battle.time, "to be made up");
        host.battle.remove("raider");

        const again = Host.restore(buildWorld({ seed: 2 }), structuredClone(host.snapshot()));

        assert.deepEqual([...again.quartered], [...host.quartered]);

        // (Every player gone far: its building let go, and its garrison with it)
        const me = host.battle.actor(HOST_PLAYER);
        const [x, y] = building.door.ends[0].squares[0];

        me.map = "town";
        put(me, [x + 200, y]);

        const events = run(host, 2000);

        assert.ok(!host.quartered.has(town.id));
        assert.ok(events.some(({ type, town: id }) => type === "unquartered" && id === town.id));
        assert.ok(out.ids.every((id) => !host.battle.actor(id) || host.battle.actor(id).dead));
    });
});

describe("the keep's request to take a town by its barracks (standing.js take)", () => {
    const giver = { id: "keep/ruler", name: "Queen Ada", title: "Queen" };
    let war;
    let capital;
    let target;

    before(() => {
        war = new War(planWorld(3));
        atWar(war, "human", "orc");
        war.stage = STAGES.findIndex(({ take }) => take.includes("town"));
        capital = war.realm("human").seat;
        target = war.towns.filter(({ owner, kind }) => owner === "orc" && STAGES[war.stage].take.includes(kind)).sort((a, b) => Math.hypot(a.at[0] - war.town(capital).at[0], a.at[1] - war.town(capital).at[1]) - Math.hypot(b.at[0] - war.town(capital).at[0], b.at[1] - war.town(capital).at[1]))[0];
    });

    const kinds = (rank, post = "keep", at = war) => new Set(Array.from({ length: 200 }, (_, k) => offerRequest({ war: at, realm: "human", town: capital, post, giver, rank, random: createRandom(k + 1) })?.kind));
    const ask = (rank = 5) => {
        for (let k = 0; k < 300; k++) {
            const request = offerRequest({ war, realm: "human", town: capital, post: "keep", giver, rank, random: createRandom(k + 1) });

            if (request?.kind === "take") {
                return request;
            }
        }

        return null;
    };

    it("is asked at the keep from a Knight up, while the age lets their enemy's towns be taken: the nearest of them", () => {
        assert.equal(OPENS.take, 3);
        assert.equal(STANDINGS[OPENS.take].title, "Knight");
        assert.ok(kinds(5).has("take"));
        assert.ok(!kinds(OPENS.take - 1).has("take"), "not below a Knight");
        assert.ok(!kinds(5, "hall").has("take"), "not at a town hall");

        const request = ask();

        assert.equal(request.target.town, target.id);
        assert.equal(request.until, war.turn + REQUESTS.take.turns);
        assert.match(request.text, new RegExp(`^${target.name} is held by .+\\. Get into its (barracks|guardhouse) and put down its guardsmen and their captain`));
        assert.equal(progressOf(request), `Get to ${target.name}.`);
        assert.match(progressOf({ ...request, there: true }), /^Get into its (barracks|guardhouse), and put down its guardsmen and their captain\.$/);

        // (In an uneasy peace, none)
        const peace = new War(planWorld(3));

        atWar(peace, "human", "orc");
        assert.ok(!kinds(5, "keep", peace).has("take"));
    });
});

describe("the war half as fast (war.js TURNS_PER_STAGE, SIEGE)", () => {
    it("brings each age on after three hours of play (180 turns) without the players' might, and has a camp sit six turns before it storms", () => {
        assert.equal(TURNS_PER_STAGE, 180);
        assert.equal(SIEGE, 6);
        assert.equal(TURN_MS, 60000);

        const war = new War(planWorld(4));
        let taken = null;

        for (let k = 0; k < TURNS_PER_STAGE + 4 && taken === null; k++) {
            for (const event of war.advance(TURN_MS)) {
                if (event.type === "taken") {
                    taken = war.turn;
                }

                if (event.type === "stage") {
                    assert.equal(war.turn, TURNS_PER_STAGE, "the border wars, at three hours");
                }
            }
        }

        assert.ok(taken === null || taken >= TURNS_PER_STAGE, `a town taken at turn ${taken}`);
    });
});
