// Going inside every building (client/js/core/insides.js): each one's front door among the
// world's links, its floors and folk made the first time they're wanted; a tavern's taproom set out
// one of several ways, upstairs as its name has it, its folk worked out from its plan; and the folk
// made up as they're wanted (characters/folk.js), the doors picked up as they come
// (app/doors.js), and characters let go of (battle.js remove)
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import * as THREE from "three";

// (Textured materials paint a canvas: enough of one for them to in Node)
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} }) }) };

const { Doors } = await import("../client/js/app/doors.js");
const { folkLook } = await import("../client/js/characters/folk.js");
const { EQUIPMENT } = await import("../client/js/characters/equipment.js");
const { Battle, STEP_MS } = await import("../client/js/core/battle.js");
const { upstairsIs } = await import("../client/js/core/dialogue.js");
const { ENTERABLE, ENTRANCES, entranceOf, FINISHES, LAYOUTS, openEntrances, smithyFolkOf, smithyRooms, taproomPlan, tavernFolkOf, tavernRooms } = await import("../client/js/core/insides.js");
const { squaresOf } = await import("../client/js/core/grid.js");
const { readPlan } = await import("../client/js/core/interiors.js");
const { CHUNK, buildWorld } = await import("../client/js/core/overworld.js");
const { findPath } = await import("../client/js/core/pathfinding.js");
const { ROLES } = await import("../client/js/core/roles.js");
const { PLOT } = await import("../client/js/core/setpieces/pieces.js");
const { squareOf } = await import("../client/js/core/settlements.js");
const { buildInterior } = await import("../client/js/world/interiors3d.js");

const reachable = (map, from, to) => findPath(map.blocked, from, to).length > 0;
const same = (a, b) => a[0] === b[0] && a[1] === b[1];

// A tavern as a settlement has one: its piece, its name and what's upstairs
const tavern = (upstairs, storeys = 2, seed = 5) => ({ key: `test:${upstairs}:${seed}`, name: "The Test", seed, tavern: { name: "The Test", upstairs, storeys } });

describe("a building's door (insides.js)", () => {
    it("stands where the art builds it, turned the way the building faces, with the way up to it clear", () => {
        for (const name of Object.keys(ENTRANCES)) {
            for (const facing of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
                const piece = { kind: "landmark", name, x: 40, y: 30, w: 4, h: 3, facing };
                const { door, front, outside, clear, size } = entranceOf(piece, [100, 200]);
                const spec = ENTRANCES[name];

                assert.deepEqual(size, [4 * PLOT, 3 * PLOT]);
                assert.equal(door.width, spec.width);
                assert.equal(door.facing, facing);

                // (As far out from the middle as the front is, less how far in the door is)
                const out = [Math.sin(facing), Math.cos(facing)];
                const along = (door.x - 140) * out[0] + (door.z - 230) * out[1];

                assert.ok(Math.abs(along - (size[1] / 2 - spec.depth)) < 1e-9, `${name} facing ${facing}: ${along}`);

                // The squares at the door, and the one to come out onto, a step or so out
                for (const square of front) {
                    assert.ok(Math.hypot(square[0] + 0.5 - door.x, square[1] + 0.5 - door.z) < 1.6, `${name}: ${square}`);
                }

                assert.ok(Math.hypot(outside[0] + 0.5 - door.x, outside[1] + 0.5 - door.z) < spec.depth + 2);
                assert.ok(front.every((square) => clear.some((each) => same(each, square))));
                assert.ok(clear.some((each) => same(each, outside)));
            }
        }
    });

    it("has the way up to it cleared: not blocked, and hiding nothing", () => {
        const piece = { kind: "landmark", name: "tavern", x: 12, y: 12, w: 4, h: 3, facing: Math.PI / 2 };
        const blocked = Array.from({ length: 30 }, () => new Uint8Array(30).fill(1));
        const opaque = Array.from({ length: 30 }, () => new Uint8Array(30).fill(1));

        openEntrances([piece, { ...piece, name: "house", kind: "house" }], blocked, opaque);

        for (const [x, y] of entranceOf(piece).clear) {
            assert.equal(blocked[y][x], 0);
            assert.equal(opaque[y][x], 0);
        }

        assert.ok(blocked.flat().filter((each) => each === 0).length < 60, "only the way in");
    });
});

describe("a tavern's floors and folk (insides.js)", () => {
    it("sets out its taproom one of several ways, every table, the bar and the barrels reachable from the door", () => {
        for (const layout of LAYOUTS) {
            for (const stairs of [true, false]) {
                const map = readPlan("t", "T", taproomPlan(layout, stairs));
                const door = map.marks.D[0];

                assert.equal(map.width, 18);
                assert.equal(map.height, 15);
                assert.equal(Boolean(map.marks["<"]), stairs, layout);
                assert.ok(map.pieces.filter(({ kind }) => kind === "table").length >= 2, layout);

                // Everywhere a table's end or bench is, where the barkeep stands, and the stairs'
                // foot: all got to from the door
                const tables = map.pieces.filter(({ kind }) => kind === "table").flatMap(({ x, y, w }) => [[x - 1, y], [x + w, y]]).filter(([x, y]) => !map.blocked[y][x]);
                const bar = map.pieces.find(({ kind }) => kind === "bar");

                for (const square of [...tables, [bar.x - 1, bar.y + 2], [bar.x + 1, bar.y + 1], [8, 12], ...(stairs ? [[1, 3]] : [])]) {
                    assert.ok(!map.blocked[square[1]][square[0]] && reachable(map, door, square), `${layout}: ${square}`);
                }

                for (const [x, y] of map.marks.b) {
                    assert.ok([[0, 1], [0, -1], [1, 0], [-1, 0]].some(([dx, dy]) => !map.blocked[y + dy]?.[x + dx] && map.blocked[y + dy]?.[x + dx] !== undefined), `${layout}: the bench at ${x}, ${y} can be sat on`);
                }
            }
        }
    });

    it("has a floor above as its name has it: rooms to let, a courtesan or two, or a madam's house; or none", () => {
        assert.deepEqual(tavernRooms(tavern(null, 1)).map(({ style }) => style), ["taproom"]);
        assert.deepEqual(tavernRooms(tavern("inn", 1)).map(({ style }) => style), ["taproom"]);

        for (const upstairs of ["inn", "mixed", "bordello"]) {
            const floors = tavernRooms(tavern(upstairs));

            assert.deepEqual(floors.map(({ style }) => style), ["taproom", "upstairs"]);
            assert.equal(floors[1].look, upstairs === "bordello" ? "bordello" : "inn");
            assert.ok(FINISHES.includes(floors[0].finish));
            assert.deepEqual(tavernRooms(tavern(upstairs)), floors, "the same every time");
        }

        const kinds = new Set(Array.from({ length: 30 }, (_, seed) => tavernRooms(tavern("inn", 2, seed)).map(({ layout, finish }) => `${layout} ${finish}`)[0]));

        assert.ok(kinds.size >= 8, `${kinds.size} ways`);
    });

    it("works out its folk from its plan: the barkeep behind the bar, wenches between it and the tables, patrons on the benches, and whoever keeps upstairs", () => {
        for (const upstairs of [null, "inn", "mixed", "bordello"]) {
            for (let seed = 1; seed < 12; seed++) {
                const building = tavern(upstairs, upstairs ? 2 : 1, seed);
                const floors = tavernRooms(building);
                const [taproom, above] = floors.map((floor, k) => readPlan(`t${k}`, floor.name, floor.rows));
                const folk = tavernFolkOf(building, taproom, above ?? null);
                const count = (role) => folk.filter((one) => one.role === role).length;

                assert.equal(count("barkeep"), 1);
                assert.ok(count("barmaid") >= 1 && count("barmaid") <= 2);
                assert.ok(count("patron") >= 4 && count("patron") <= 6);
                assert.equal(new Set(folk.map(({ local }) => local)).size, folk.length, "each their own part");

                for (const one of folk) {
                    const map = one.map === taproom.id ? taproom : above;

                    assert.ok(ROLES[one.role], one.role);
                    assert.ok(["f", "m"].includes(one.sex));

                    if (one.routine.seated) {
                        assert.equal(map.plan[one.square[1]][one.square[0]], "b", `${one.local} on a bench`);
                    } else {
                        assert.ok(!map.blocked[one.square[1]][one.square[0]], `${one.local} at ${one.square}`);
                    }

                    for (const { square } of one.routine.stops ?? []) {
                        assert.ok(same(one.square, square) || reachable(map, one.square, square), `${one.local} can get to ${square}`);
                    }
                }

                // Upstairs: a madam and four courtesans, an innkeeper and one or two, or an
                // innkeeper alone
                const expected = { bordello: [1, 0, 4, 4], mixed: [0, 1, 1, 2], inn: [0, 1, 0, 0] }[upstairs] ?? [0, 0, 0, 0];

                assert.equal(count("madam"), expected[0]);
                assert.equal(count("innkeeper"), expected[1]);
                assert.ok(count("courtesan") >= expected[2] && count("courtesan") <= expected[3], `${upstairs}: ${count("courtesan")}`);
            }
        }
    });
});

describe("a smithy's workshop and folk (insides.js)", () => {
    it("has its forge, bellows, anvil, trough and grindstone, all got to from the door, and the smith and apprentice at them", () => {
        for (let seed = 1; seed < 8; seed++) {
            const building = { key: `test:smithy:${seed}`, name: "the smithy", seed };
            const [floor] = smithyRooms(building);
            const forge = readPlan("forge", floor.name, floor.rows);
            const door = forge.marks.D[0];

            assert.equal(floor.style, "smithy");

            for (const kind of ["forge", "bellows", "anvil", "trough", "grindstone", "rack", "workbench", "coal"]) {
                assert.ok(forge.pieces.some((piece) => piece.kind === kind), kind);
            }

            const folk = smithyFolkOf(building, forge);

            assert.deepEqual(folk.map(({ role }) => role), ["smith", "apprentice"]);

            for (const one of folk) {
                assert.ok(ROLES[one.role]);

                for (const { square, act } of one.routine.stops) {
                    assert.ok(!forge.blocked[square[1]][square[0]] && reachable(forge, door, square), `${one.local} at ${square} (${act})`);
                }
            }

            assert.deepEqual(folk[0].routine.stops.map(({ act }) => act), ["heat", "forge", "quench", "forge"]);
            assert.deepEqual(folk[1].routine.stops.map(({ act }) => act), ["pump", "crank"]);
        }
    });
});

describe("the buildings (insides.js Interiors)", () => {
    let world;
    let interiors;
    let settlement;

    before(() => {
        world = buildWorld({ seed: 3 });
        interiors = world.interiors;

        // The villages nearest the start, laid out as the world round them is made
        const overworld = world.maps.town;
        const villages = world.plan.places.filter((place) => place.kind === "village").sort((a, b) => Math.hypot(a.at[0] - world.start.at[0], a.at[1] - world.start.at[1]) - Math.hypot(b.at[0] - world.start.at[0], b.at[1] - world.start.at[1])).slice(0, 4);

        for (const village of villages) {
            const { at, size } = squareOf(village);

            for (let cy = Math.floor(at[1] / CHUNK); cy <= Math.floor((at[1] + size) / CHUNK); cy++) {
                for (let cx = Math.floor(at[0] / CHUNK); cx <= Math.floor((at[0] + size) / CHUNK); cx++) {
                    overworld.chunk(cx, cy);
                }
            }
        }

        settlement = overworld.settlements.laid.get(villages[0].id);
    });

    it("knows Wenches and Ale as made already, with its own ids, first among the doors", () => {
        const home = interiors.buildings.get("home:tavern");

        assert.ok(home.made);
        assert.deepEqual(home.maps, ["taproom", "upstairs"]);
        assert.equal(interiors.of("taproom"), home);
        assert.equal(interiors.of("town"), null);
        assert.equal(world.links[0].id, "tavern-door");
        assert.equal(home.folk, world.folk);
    });

    it("puts every settlement's taverns' and smithies' doors among the world's links as it's laid out, their insides still to make", () => {
        const entered = settlement.town.pieces.filter((piece) => piece.kind === "landmark" && ENTERABLE.includes(piece.name));

        assert.deepEqual(new Set(entered.map(({ name }) => name)), new Set(["tavern", "blacksmith"]));

        for (const piece of entered) {
            const building = interiors.buildings.get(`${settlement.place.id}:${piece.id}`);
            const [outside, inside] = building.door.ends;

            assert.ok(world.links.includes(building.door));
            assert.equal(building.name, piece.tavern?.name ?? "the smithy");
            assert.equal(outside.map, "town");
            assert.ok(outside.door && outside.squares.length === 2);
            assert.ok(inside.pending);

            // (The way to the door walkable from the street)
            for (const [x, y] of [...outside.squares, outside.arrive]) {
                assert.ok(!squaresOf(world.maps.town).blocked(x, y), `${building.key}: ${x}, ${y}`);
            }
        }

        // Nothing that can't be gone into
        assert.ok([...interiors.buildings.values()].every(({ kind }) => ENTERABLE.includes(kind)));
    });

    it("makes a building's floors and folk the first time they're wanted, once, each building somewhere of its own", () => {
        const building = [...interiors.buildings.values()].find(({ place, made, kind }) => place === settlement.place.id && !made && kind === "tavern");
        const links = world.links.length;

        assert.equal(interiors.ensure(`${building.key}/taproom`), true);
        assert.ok(building.made);
        assert.equal(interiors.make(building.key), building);

        const [taproom, upstairs] = building.maps.map((id) => world.maps[id]);
        const [, inside] = building.door.ends;

        assert.equal(taproom.style, "taproom");
        assert.equal(inside.pending, false);
        assert.deepEqual(inside.squares, taproom.marks.D);
        assert.ok(!taproom.blocked[inside.arrive[1]][inside.arrive[0]]);

        if (upstairs) {
            assert.equal(world.links.length, links + 1);
            assert.equal(building.stairs.ends[1].map, upstairs.id);
            assert.ok(!upstairs.blocked[building.stairs.ends[1].arrive[1]][building.stairs.ends[1].arrive[0]]);
        }

        // Its folk, named, each with an id of their own and a seed for their looks
        assert.ok(building.folk.length >= 6);

        for (const one of building.folk) {
            assert.ok(one.id.startsWith(`${building.key}/`));
            assert.ok(/^\S+ \S+$/.test(one.name), one.name);
            assert.ok(Number.isFinite(one.seed));
            assert.ok(building.maps.includes(one.map));
        }

        // Somewhere of its own, clear of the others'
        const origins = Object.values(world.maps).filter((map) => map.origin && map.id !== "town").map(({ origin }) => origin.join());

        assert.equal(new Set(origins).size, origins.length);
    });

    it("names a smithy for its smith once it's made, and puts its folk to work", () => {
        const smithy = [...interiors.buildings.values()].find(({ kind }) => kind === "blacksmith");

        interiors.make(smithy.key);

        const [forge] = smithy.maps.map((id) => world.maps[id]);
        const smith = smithy.folk.find(({ local }) => local === "smith");

        assert.equal(forge.id, `${smithy.key}/forge`);
        assert.equal(forge.style, "smithy");
        assert.equal(smithy.name, `${smith.name.split(" ")[1]}'s Forge`);
        assert.equal(forge.name, smithy.name);
        assert.deepEqual(smithy.door.ends[1].squares, forge.marks.D);
        assert.ok(folkLook(smith).equipment.includes("smithHammer") && folkLook(smith).equipment.includes("tongs"));
        assert.ok(folkLook(smithy.folk.find(({ local }) => local === "apprentice")).equipment.includes("leatherApron"));
    });

    it("is gone into in the battle: a pending door made as someone goes through it", () => {
        const building = [...interiors.buildings.values()].find(({ made }) => !made);
        const [outside] = building.door.ends;
        const battle = new Battle(world);

        battle.add({ id: "player", kind: "player", weapon: "sword", team: "town", square: outside.arrive });
        battle.command("player", { type: "enter", link: building.door.id });

        let crossed = null;

        for (let t = 0; t < 20000 && !crossed; t += STEP_MS) {
            crossed = battle.advance(STEP_MS).find(({ type }) => type === "cross");
        }

        assert.ok(crossed, "went in");
        assert.equal(crossed.to, building.door.ends[1].map);
        assert.ok(building.made);
        assert.equal(battle.actor("player").map, building.door.ends[1].map);
    });

    it("is drawn by its floors' style, and its doors picked up as they come", () => {
        const building = [...interiors.buildings.values()].find(({ made, entrance }) => made && entrance);
        const scene = new THREE.Group();
        const doors = new Doors(world, scene);
        const count = doors.targets.length;

        assert.ok(doors.targets.some(({ link }) => link === building.door));

        const fresh = [...interiors.buildings.values()].find(({ made }) => !made);

        interiors.make(fresh.key);
        doors.sync();
        assert.ok(doors.targets.length > count);
        assert.ok(doors.targets.some(({ end }) => end === fresh.door.ends[1]));

        for (const id of building.maps) {
            const interior = buildInterior(world.maps[id]);

            assert.ok(interior.object.children.length > 0);
            interior.dispose();
        }
    });
});

describe("folk made up as they're wanted (characters/folk.js)", () => {
    it("look as their part and sex have them, the same for the same seed, and each their own", () => {
        const parts = [["barkeep", "barkeep", "m"], ["barmaid", "wench", "f"], ["patron", "drinker", "m"], ["patron", "alewife", "f"], ["patron", "greybeard", "m"], ["innkeeper", "innkeeper", "f"], ["madam", "madam", "f"], ["courtesan", "courtesan", "f"], ["smith", "smith", "m"], ["smith", "smith", "f"], ["apprentice", "apprentice", "m"]];

        for (const [role, local, sex] of parts) {
            const looks = new Set();

            for (let seed = 1; seed <= 12; seed++) {
                const look = folkLook({ role, local, sex, seed });

                assert.deepEqual(folkLook({ role, local, sex, seed }), look);
                assert.equal(look.shape.macro.gender, sex === "f" ? 0 : 1);
                assert.ok(look.equipment.length >= 3);

                for (const id of look.equipment) {
                    assert.ok(EQUIPMENT[id], `${local}: ${id}`);
                }

                const mix = look.shape.macro.african + look.shape.macro.asian + look.shape.macro.caucasian;

                assert.ok(Math.abs(mix - 1) < 1e-9);
                assert.ok(sex === "m" || look.look.hair.beard === "none");
                looks.add(JSON.stringify(look));
            }

            assert.equal(looks.size, 12, local);
        }

        assert.ok(folkLook({ role: "barmaid", sex: "f", seed: 3 }).equipment.includes("tankard"));
        assert.ok(folkLook({ role: "barkeep", sex: "m", seed: 3 }).equipment.includes("apron"));
        assert.ok(folkLook({ role: "courtesan", sex: "f", seed: 3 }).equipment.some((id) => id.startsWith("laceBra")));
    });
});

describe("what's upstairs, in talk (dialogue.js upstairsIs)", () => {
    it("holds for anything, nothing, or which", () => {
        assert.ok(upstairsIs(true, "inn") && upstairsIs(true, "bordello") && !upstairsIs(true, null));
        assert.ok(upstairsIs(false, null) && !upstairsIs(false, "mixed"));
        assert.ok(upstairsIs("mixed", "mixed") && !upstairsIs("bordello", "mixed"));
    });
});

describe("letting go of a character (battle.js remove)", () => {
    it("takes them out, and no one's after them or talking to them any more", () => {
        const world = buildWorld({ seed: 3 });
        const battle = new Battle(world);
        const [x, y] = world.spawns.player;

        battle.add({ id: "player", kind: "player", weapon: "sword", team: "town", square: [x, y] });
        battle.add({ id: "orc", kind: "orc", weapon: "cleaver", team: "orcs", square: [x + 2, y] });
        battle.add({ id: "someone", kind: "folk", team: "folk", square: [x, y + 2], neutral: true, ai: "routine", routine: { stops: [] } });
        battle.talk("player", "someone");
        battle.actor("orc").target = "player";

        assert.equal(battle.remove("someone"), true);
        assert.equal(battle.actor("someone"), null);
        assert.equal(battle.actor("player").talkingTo, null);
        assert.equal(battle.remove("someone"), false);

        battle.remove("player");
        assert.equal(battle.actor("orc").target, null);
        assert.deepEqual(battle.actors.map(({ id }) => id), ["orc"]);
    });
});
