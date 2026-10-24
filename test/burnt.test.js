// Houses burnt by the Behemoth of the Rift (core/burnt.js, core/host.js #burn): a town it's
// turned back from left with the houses nearest it burning, more the less it was wounded; built
// again over three days (burning till sunrise, a burnt shell the next day, framed the day after,
// roofed till that evening), each stage as the world's clock has it; kept with the world and let
// go of once they stand whole. Drawn (world/art/kits/burnt.js) as each stage is, and heard.
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

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

let BURNT;
let burntCount;
let burntCry;
let burntIn;
let burntWords;
let housesToBurn;
let rebuiltWords;
let stageOf;
let stagesOf;
let wholeAt;
let DAY;
let timeOfDay;
let elapsedOf;
let BEHEMOTH;
let Host;
let HOST_PLAYER;
let SNAPSHOT_STEPS;
let errandsOf;
let ambienceOf;
let THREE;
let house;
let layoutTown;
let builderOf;
let BURNT_LOOKS;
let burntOf;
let clipped;
let shapeOf;
let WINDOWS;
let buildWorld;
let world;

before(async () => {
    ({ BURNT, burntCount, burntCry, burntIn, burntWords, housesToBurn, rebuiltWords, stageOf, stagesOf, wholeAt } = await import("../client/js/core/burnt.js"));
    ({ DAY, elapsedOf, timeOfDay } = await import("../client/js/core/daytime.js"));
    ({ BEHEMOTH } = await import("../client/js/core/invasions.js"));
    ({ Host, HOST_PLAYER, SNAPSHOT_STEPS } = await import("../client/js/core/host.js"));
    ({ errandsOf } = await import("../client/js/core/townsfolk.js"));
    ({ ambienceOf } = await import("../client/js/audio/ambience.js"));
    THREE = await import("three");
    ({ house } = await import("../client/js/world/art/kits/house.js"));
    ({ layoutTown } = await import("../client/js/core/setpieces/town.js"));
    ({ builderOf } = await import("../client/js/world/town3d.js"));
    ({ BURNT_LOOKS, burntOf, clipped, shapeOf } = await import("../client/js/world/art/kits/burnt.js"));
    ({ WINDOWS } = await import("../client/js/world/art/engine/atlas.js"));
    ({ buildWorld } = await import("../client/js/core/overworld.js"));
    world = buildWorld({ seed: 2 });
});

// When the world's been going so long that it's `minute` minutes past midnight (its day's), on
// its `day`th day
const at = (minute, day = 1) => day * DAY.length + minute * 60000 - DAY.start;

// A host with its player in the start town, the events of everything played kept
function inTown() {
    const host = new Host(world, { populate: false });

    host.join({ id: HOST_PLAYER, hero: HERO, progress: { invasion: { seen: 1 } } });

    return { host, me: host.battle.actor(HOST_PLAYER), events: [] };
}

function play(game, ms, until = () => false) {
    for (let played = 0; played < ms && !until(); played += 1000) {
        game.events.push(...game.host.advance(1000).filter(({ type }) => type === "invasion" || type === "burnt"));
    }
}

// The start town's layout, set down where it is
const startTown = (host) => ({ pieces: host.world.town.pieces, origin: Array.isArray(host.world.origin) ? host.world.origin : [host.world.origin ?? 0, host.world.origin ?? 0] });

describe("which houses burn, and how many (core/burnt.js)", () => {
    it("burns two houses with the Behemoth all but slain, six with it unhurt, and between by how hurt it is", () => {
        assert.equal(burntCount(0), BURNT.least);
        assert.equal(BURNT.least, 2);
        assert.equal(burntCount(1), BURNT.most);
        assert.equal(BURNT.most, 6);
        assert.equal(burntCount(0.5), 4);
        assert.equal(burntCount(2), 6, "no more than unhurt");
        assert.equal(burntCount(Number.NaN), 6, "not known: as if unhurt");
    });

    it("burns the houses nearest where it stood, nearest first, within reach of it; never what can be gone into, nor one burning already", () => {
        const pieces = [
            { kind: "house", x: 10, y: 0 },
            { kind: "landmark", name: "tavern", x: 1, y: 0 },
            { kind: "house", x: 4, y: 0 },
            { kind: "house", x: 30, y: 0, back: true },
            { kind: "prop", name: "well", x: 2, y: 0 },
            { kind: "house", x: 7, y: 0 },
            { kind: "house", x: 200, y: 0 },
        ];

        assert.deepEqual(housesToBurn(pieces, [100, 50], [100, 50], 3), [2, 5, 0], "the nearest houses, the tavern and the well spared");
        assert.deepEqual(housesToBurn(pieces, [100, 50], [100, 50], 6), [2, 5, 0, 3], "the back buildings too, none too far off");
        assert.deepEqual(housesToBurn(pieces, [100, 50], [100, 50], 2, new Set([2])), [5, 0], "none burning already");
        assert.deepEqual(housesToBurn(pieces, [0, 0], [500, 500], 4), [], "none near enough");
    });
});

describe("how far on a burnt house is (core/burnt.js stageOf)", () => {
    it("burns till sunrise, stands burnt the next day, framed the day after, roofed till that evening, then whole", () => {
        const fell = at(58);
        const ends = stagesOf(fell);

        assert.equal(timeOfDay(ends.burning), DAY.rises, "burning till the sun's up");
        assert.equal(ends.burnt - ends.burning, DAY.length);
        assert.equal(ends.framed - ends.burnt, DAY.length);
        assert.equal(timeOfDay(ends.roofed), DAY.sets, "roofed till sunset");
        assert.equal(wholeAt(fell), ends.roofed);
        assert.ok(wholeAt(fell) - fell > 2.5 * DAY.length && wholeAt(fell) - fell < 3 * DAY.length, "whole by the third evening: about three hours of play");

        assert.equal(stageOf(fell, fell - 1), null, "not before it burnt");
        assert.equal(stageOf(fell, fell), "burning");
        assert.equal(stageOf(fell, ends.burning - 1), "burning");
        assert.equal(stageOf(fell, ends.burning), "burnt");
        assert.equal(stageOf(fell, ends.burnt), "framed");
        assert.equal(stageOf(fell, ends.framed), "roofed");
        assert.equal(stageOf(fell, ends.roofed - 1), "roofed");
        assert.equal(stageOf(fell, ends.roofed), null, "whole again");
    });

    it("burns a while at least, the town fallen just before dawn", () => {
        const fell = at(DAY.rises / 60000 - 1);
        const ends = stagesOf(fell);

        assert.equal(ends.burning - fell, BURNT.burns, "burning past sunrise");
        assert.equal(ends.burnt, fell + 60000 + DAY.length, "burnt the day it dawned on");
    });

    it("tells the houses burnt in a place and how far on each is, from what the host keeps", () => {
        const now = at(30, 3);
        const burnt = [
            { place: "a", pieces: [3, 7], at: now - 1000 },
            { place: "b", pieces: [1], at: now - 1000 },
            { place: "a", pieces: [9], at: now - 1.5 * DAY.length },
            { place: "a", pieces: [11], at: now - 4 * DAY.length },
        ];

        assert.deepEqual([...burntIn(burnt, "a", now)], [[3, "burning"], [7, "burning"], [9, stageOf(now - 1.5 * DAY.length, now)]], "whole again: not");
        assert.deepEqual([...burntIn(burnt, "c", now)], []);
    });

    it("cries the fire, and tells it, in few words", () => {
        for (let count = 1; count <= BURNT.most; count++) {
            for (const way of ["north", "south-east"]) {
                assert.ok(burntCry(count, way).length <= 90, burntCry(count, way));
            }
        }

        assert.equal(burntCry(4, "north"), "Fire by the north road! Four houses burning! Every hand to the buckets!");
        assert.equal(burntCry(1, "west"), "Fire by the west road! A house burning! Every hand to the buckets!");
        assert.equal(burntWords(2), "Its breath sets two houses alight as it goes.");
        assert.equal(rebuiltWords("Marleyworth"), "The houses the Behemoth burnt in Marleyworth stand whole again.");
    });
});

describe("the houses burnt as the Behemoth's turned back (core/host.js #burn)", () => {
    it("sets the houses nearest it burning, as many as it's unhurt, keeps them with the world, and lets them go once they're whole", () => {
        const game = inTown();
        const { host } = game;

        host.command(HOST_PLAYER, { type: "invade", band: BEHEMOTH.id });
        play(game, 1000);

        const [invasion] = host.invasions;
        const beast = host.battle.actor(invasion.beast);
        const fell = (ids) => ids.forEach((id) => Object.assign(host.battle.actor(id), { hp: 0, dead: true, respawnAt: Infinity }));

        // (Come on to the town's edge, half its strength gone)
        Object.assign(beast, { x: beast.wild.goal[0], y: beast.wild.goal[1], hp: beast.maxHp * 0.5 });
        fell(invasion.defenders.slice(Math.floor(invasion.mustered * BEHEMOTH.last)));
        play(game, 2000);
        assert.equal(invasion.held, false, "the town not held");

        const [burnt] = host.burnt;
        const told = game.events.find(({ type }) => type === "burnt");
        const { pieces, origin } = startTown(host);
        const [mx, my] = invasion.middle;
        const out = Math.hypot(beast.x - mx, beast.y - my);
        const stand = [mx + ((beast.x - mx) / out) * (invasion.edge + BEHEMOTH.stops), my + ((beast.y - my) / out) * (invasion.edge + BEHEMOTH.stops)];

        assert.equal(host.burnt.length, 1);
        assert.equal(burnt.place, invasion.place);
        assert.equal(burnt.pieces.length, burntCount(beast.hp / beast.maxHp), "by how hurt it was");
        assert.deepEqual(burnt.pieces, housesToBurn(pieces, origin, stand, burnt.pieces.length), "the nearest it");
        assert.ok(burnt.pieces.every((index) => pieces[index].kind === "house"), "houses only");
        assert.ok(burnt.at <= elapsedOf(host.war) && elapsedOf(host.war) - burnt.at < 3000, "when it fell, by the world's clock");
        assert.deepEqual(game.events.filter(({ type }) => type === "invasion").map(({ change }) => change), ["coming", "fell"]);
        assert.ok(told && told.change === "alight" && told.place === invasion.place && told.way === invasion.way);
        assert.deepEqual(told.pieces, burnt.pieces);

        // (Kept with the world, and in what a copy that joins is sent)
        const snapshot = host.snapshot();

        assert.deepEqual(snapshot.burnt, host.burnt);
        assert.deepEqual(Host.restore(buildWorld({ seed: 2 }), structuredClone(snapshot)).burnt, host.burnt);

        // (Whole again three days on: let go of, and told)
        host.war.turn += Math.ceil((wholeAt(burnt.at) - elapsedOf(host.war)) / 60000) + 1;
        play(game, 1000);
        assert.deepEqual(host.burnt, []);
        assert.deepEqual(game.events.filter(({ type }) => type === "burnt").map(({ change }) => change), ["alight", "rebuilt"]);
    });

    it("burns none again that's burning, and none the town held", () => {
        const game = inTown();
        const { host, me } = game;

        assert.ok(host.command(HOST_PLAYER, { type: "burn", count: 3 }).ok, "the debug overlay's");

        const [first] = host.burnt;

        assert.equal(first.pieces.length, 3);
        assert.deepEqual(first.pieces, housesToBurn(startTown(host).pieces, startTown(host).origin, [me.x, me.y], 3), "the nearest the player");
        assert.ok(host.command(HOST_PLAYER, { type: "burn", count: 3 }).ok);
        assert.equal(new Set(host.burnt.flatMap(({ pieces }) => pieces)).size, 6, "the next nearest, none burning already");

        // (Back-dated, to see how far on it'd be)
        assert.ok(host.command(HOST_PLAYER, { type: "burn", count: 1, ago: 1.5 * DAY.length }).ok);
        assert.ok(["burnt", "framed"].includes(stageOf(host.burnt.at(-1).at, elapsedOf(host.war))));
        assert.equal(host.command(HOST_PLAYER, { type: "burn", count: 0 }).ok, false);
        assert.equal(host.command(HOST_PLAYER, { type: "burn", count: 3, ago: -1 }).ok, false);
        assert.equal(host.command(HOST_PLAYER, { type: "burn", ago: 5 * DAY.length }).ok, false);
    });

    it("brings a world kept before there were burnt houses forward with none", () => {
        assert.deepEqual(SNAPSHOT_STEPS[38]({ version: 38, players: [] }), { version: 39, players: [], burnt: [] });
    });

    it("sends none of its townsfolk to a burnt house: no one's home or trade, and no door to shelter at", () => {
        const layout = { pieces: [{ kind: "house", x: 10, y: 10, w: 2, h: 2, facing: 0 }, { kind: "house", x: 20, y: 10, w: 2, h: 2, facing: 0, use: "baker" }, { kind: "house", x: 30, y: 10, w: 2, h: 2, facing: 0 }], centre: [20, 20] };
        const free = ([x, y]) => [Math.floor(x), Math.floor(y)];
        const all = errandsOf(layout, [0, 0], free);
        const some = errandsOf(layout, [0, 0], free, { burnt: new Set([1, 2]) });

        assert.equal(all.home.length, 2);
        assert.equal(all.trade.length, 1);
        assert.equal(some.home.length, 1);
        assert.equal(some.trade.length, 0);
        assert.deepEqual(some.home[0], all.home[0]);
    });
});

describe("a burnt house drawn (world/art/kits/burnt.js)", () => {
    // A house of a town's layout, built, and its corners: { meshes, top (the highest), colour (the
    // mean of its corners' colours) }
    const piece = () => layoutTown({ seed: 4, kind: "town" }).pieces.find((one) => one.kind === "house" && !one.back && one.storeys !== 1) ?? layoutTown({ seed: 4, kind: "town" }).pieces.find((one) => one.kind === "house");
    const meshesOf = (object) => {
        const meshes = [];

        object.updateMatrixWorld(true);
        object.traverse((node) => node.isMesh && meshes.push(node));

        return meshes;
    };
    const corners = (meshes) => {
        let top = -Infinity;
        let sum = 0;
        let count = 0;

        for (const mesh of meshes) {
            const { position, color } = mesh.geometry.attributes;

            for (let i = 0; i < position.count; i++) {
                top = Math.max(top, new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).y);

                if (color) {
                    sum += color.getX(i) + color.getY(i) + color.getZ(i);
                    count += 3;
                }
            }
        }

        return { top, colour: sum / count };
    };
    const own = (made) => meshesOf(made.children[0]);
    const added = (made) => (made.children[1] ? meshesOf(made.children[1]) : []);
    const named = (meshes, name) => meshes.filter(({ material }) => material.name === name);

    it("burning: its glass gone, its walls broken off below its eaves and blackened, its beams fallen in on the ash, great fires in it", () => {
        const one = piece();
        const whole = house(one);
        const shape = shapeOf(meshesOf(whole));
        const made = burntOf(house(one), { ...one, burnt: "burning" });
        const left = corners(own(made));

        assert.ok(meshesOf(whole).some(({ material }) => WINDOWS.includes(material.name)), "it had windows");
        assert.ok(!own(made).some(({ material }) => WINDOWS.includes(material.name)), "its glass gone");
        assert.ok(left.top <= shape.eaves + 0.01, `its roof fallen in (${left.top.toFixed(1)} over eaves ${shape.eaves.toFixed(1)})`);
        assert.ok(left.top > shape.base + (shape.eaves - shape.base) * BURNT_LOOKS.burning.walls[0], "its walls standing in part");
        assert.ok(left.colour < corners(meshesOf(whole)).colour * 0.5, "blackened");
        assert.ok(named(added(made), "timber-char").length && named(added(made), "earth-sooty").length, "its charred beams, and the ash");

        const fires = made.userData.lights.filter(([, , , kind]) => kind === "blaze");

        assert.ok(fires.length >= BURNT_LOOKS.burning.fires[0] && fires.length <= BURNT_LOOKS.burning.fires[1], "great fires in it");
        made.traverse((node) => assert.ok(node === made || (!node.userData.smoke && !node.userData.lights && !node.userData.cloth), "its hearth, lamps and banners out"));
    });

    it("burnt the next day: the same shell, smoke rising from it, its fires out", () => {
        const one = piece();
        const made = burntOf(house(one), { ...one, burnt: "burnt" });

        assert.equal(made.userData.lights, undefined);
        assert.equal(made.userData.smoke.length, BURNT_LOOKS.burnt.smoke);
        assert.deepEqual(corners(own(made)), corners(own(burntOf(house(one), { ...one, burnt: "burning" }))), "the same shell");
    });

    it("framed: its walls mended up to its eaves, new rafters for its roof, scaffolding round it; no glass yet", () => {
        const one = piece();
        const shape = shapeOf(meshesOf(house(one)));
        const made = burntOf(house(one), { ...one, burnt: "framed" });
        const left = corners(own(made));
        const rafters = named(added(made), "timber-light");

        assert.ok(Math.abs(left.top - shape.eaves) < 1, "its walls up to its eaves");
        assert.ok(left.colour > corners(meshesOf(house(one))).colour * 0.85, "mended: soot left only here and there");
        assert.ok(rafters.length && corners(rafters).top > shape.eaves + 5, "its new rafters up over them");
        assert.ok(named(added(made), "timber-grey").length && named(added(made), "planks-pale").length, "scaffolding");
        assert.ok(!own(made).some(({ material }) => WINDOWS.includes(material.name)));
    });

    it("roofed: whole again, its glass in, the scaffolding still up", () => {
        const one = piece();
        const whole = house(one);
        const made = burntOf(house(one), { ...one, burnt: "roofed" });

        assert.ok(Math.abs(corners(own(made)).top - corners(meshesOf(whole)).top) < 0.01, "roofed again");
        assert.ok(own(made).some(({ material }) => WINDOWS.includes(material.name)), "glazed");
        assert.ok(named(added(made), "timber-grey").length, "the scaffolding still up");
        assert.ok(!named(added(made), "timber-light").length);
    });

    it("is built so by whatever builds the house, made over (town3d.js builderOf); a house not burnt as it was", () => {
        const one = piece();
        const built = builderOf({ ...one, burnt: "burnt" })({ ...one, burnt: "burnt" });

        assert.equal(built.userData.smoke.length, BURNT_LOOKS.burnt.smoke);
        assert.equal(builderOf(one), builderOf({ ...one, burnt: null }));
    });

    it("cuts a triangle across the cut along it, carrying every corner's attributes to the new ones", () => {
        const geometry = new THREE.BufferGeometry();

        geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 2, 0, 0, 0, 2, 0], 3));
        geometry.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));

        const cut = clipped(geometry, () => 1);
        const ys = Array.from({ length: cut.attributes.position.count }, (_, i) => cut.attributes.position.getY(i));
        const vs = Array.from({ length: cut.attributes.uv.count }, (_, i) => cut.attributes.uv.getY(i));

        assert.equal(cut.attributes.position.count, 6, "a four-sided piece left: two triangles");
        assert.ok(ys.every((y) => y <= 1 + 1e-6) && ys.some((y) => Math.abs(y - 1) < 1e-6));
        assert.ok(vs.every((v) => v <= 0.5 + 1e-6), "its picture cut with it");
        assert.equal(clipped(geometry, () => -1).attributes.position.count, 0, "wholly above it: gone");
        assert.equal(clipped(geometry, () => 5).attributes.position.count, 3, "wholly below: as it was");
    });
});

describe("a burnt house heard (audio/ambience.js)", () => {
    it("crackles louder and further off than a camp fire while it burns, and is hammered at by day as it's built again", () => {
        const out = (facts) => ambienceOf({ place: "town", land: "meadow", time: DAY.day + 60000, settled: 0.6, ...facts });

        assert.ok(out({ blaze: 20 }).beds.campfireLoop > 0.15, "heard 20 metres off");
        assert.ok(!out({ fire: 20 }).beds.campfireLoop, "where a camp fire isn't");
        assert.ok(out({ blaze: 4 }).beds.campfireLoop > out({ fire: 4 }).beds.campfireLoop);

        const works = { x: 3, z: 4, far: 10 };
        const hammer = out({ works }).calls.distantHammer;

        assert.ok(hammer && hammer.volume > 0.5);
        assert.deepEqual(hammer.at, works, "from the house");
        assert.deepEqual(out({ works, smithy: { x: 9, z: 9, far: 65 } }).calls.distantHammer.at, works, "nearer than the smithy");
        assert.ok(!ambienceOf({ place: "town", land: "meadow", time: 0, settled: 0.6, works }).calls.distantHammer, "not by night");
    });
});
