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
const { liveryKit, soldierKit } = await import("../client/js/characters/liveries.js");
const { GIVEN_NAMES, namePeople } = await import("../client/js/core/names.js");
const { EQUIPMENT } = await import("../client/js/characters/equipment.js");
const { Battle, STEP_MS } = await import("../client/js/core/battle.js");
const { treeFor, upstairsIs } = await import("../client/js/core/dialogue.js");
const { clearOfWaysIn, ENTERABLE, ENTRANCES, entranceOf, FINISHES, guildFolkOf, guildRooms, heldWithin, LAYOUTS, openEntrances, shrinesOf, SITE_PATRONS, smithyFolkOf, smithyRooms, STRUCTURE_DOORS, taproomPlan, tavernFolkOf, tavernRooms, templeFolkOf, templeRooms, WAY_IN_CLEAR } = await import("../client/js/core/insides.js");
const { GOD_IDS, GODS } = await import("../client/js/core/lore/gods.js");
const { squaresOf } = await import("../client/js/core/grid.js");
const { readPlan } = await import("../client/js/core/interiors.js");
const { CHUNK, buildWorld } = await import("../client/js/core/overworld.js");
const { ROLES } = await import("../client/js/core/roles.js");
const { PLOT } = await import("../client/js/core/setpieces/pieces.js");
const { squareOf } = await import("../client/js/core/settlements.js");
const { buildInterior, buildingInterior } = await import("../client/js/world/interiors3d.js");

const { reachable } = await import("./helpers.js");
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

describe("a temple's nave and folk (insides.js)", () => {
    it("has its patron's altar and statue, a shrine to each of the other five, pews, votive candles and basins, all got to from the door", () => {
        for (const patron of GOD_IDS) {
            const building = { key: `test:temple:${patron}`, name: `the Temple of ${GODS[patron].name}`, seed: patron.length * 7, patron };
            const [floor] = templeRooms(building);
            const nave = readPlan("nave", floor.name, floor.rows);
            const door = nave.marks.D[0];
            const count = (kind) => nave.pieces.filter((piece) => piece.kind === kind).length;

            assert.equal(floor.style, "temple");
            assert.equal(floor.patron, patron);
            assert.equal(count("altar"), 1);
            assert.equal(count("statue"), 1);
            assert.equal(count("shrine"), 5);
            assert.ok(count("pew") >= 20 && count("votive") === 1 && count("basin") === 2);
            assert.deepEqual(shrinesOf(patron), GOD_IDS.filter((id) => id !== patron));

            const folk = templeFolkOf(building, nave);
            const [priest, acolyte, ...worshippers] = folk;

            assert.equal(priest.role, "priest");
            assert.equal(acolyte.role, "acolyte");
            assert.ok(worshippers.length >= 2 && worshippers.length <= 4);

            // The priest blesses from before the altar and lights each shrine's candles; the
            // acolyte tends the votive candles and the basins; everywhere they go got to from the door
            assert.deepEqual([...new Set(priest.routine.stops.map(({ act }) => act))], ["bless", "light"]);
            assert.equal(priest.routine.stops.filter(({ act }) => act === "light").length, 5);

            for (const one of [priest, acolyte]) {
                for (const { square } of one.routine.stops) {
                    assert.ok(!nave.blocked[square[1]][square[0]] && reachable(nave, door, square), `${one.local} at ${square}`);
                }
            }

            // Worshippers seated in the pews, facing the altar
            for (const one of worshippers) {
                assert.equal(one.role, "worshipper");
                assert.equal(nave.plan[one.square[1]][one.square[0]], "p");
                assert.ok(one.routine.seated);
                assert.equal(one.facing, Math.PI);
            }
        }
    });

    it("dresses its priest in white vestments", () => {
        for (const [role, sex] of [["priest", "m"], ["priest", "f"], ["acolyte", "f"]]) {
            const { equipment } = folkLook({ role, sex, seed: 5 });

            assert.ok(equipment.includes("alb") && equipment.includes("albSkirt"), `${role} (${sex})`);
            assert.equal(role === "priest", equipment.includes("chasuble"));
        }

        assert.ok(EQUIPMENT.alb.colour === "#f1ede4" && EQUIPMENT.chasuble.trim);
    });
});

describe("a guild's hall and folk (insides.js)", () => {
    it("has its counter, shelves, quest board, tables, hearth and portal, all got to from the door, the receptionist behind the counter and adventurers at the board and tables", () => {
        for (const seed of [1, 2, 3, 4, 5, 6]) {
            const building = { key: `test:guild:${seed}`, name: "the Adventurers' Guild", seed };
            const [floor] = guildRooms(building);
            const hall = readPlan("hall", floor.name, floor.rows);
            const door = hall.marks.D[0];
            const count = (kind) => hall.pieces.filter((piece) => piece.kind === kind).length;

            assert.equal(floor.style, "guild");
            assert.equal(floor.sound, "guild");
            assert.ok(count("counter") === 1 && count("shelves") === 1 && count("board") === 1 && count("hearth") === 1);
            assert.ok(count("table") === 4 && count("barrels") === 2);

            // The portal on the east wall, across the room from the board on the west, beside the
            // hearth; the middle of the square before it got to from the door
            const portal = hall.pieces.find(({ kind }) => kind === "portal");

            assert.ok(portal && portal.x === hall.width - 1 && portal.w === 1 && portal.h === 3);
            assert.equal(hall.pieces.find(({ kind }) => kind === "board").x, 0);
            assert.ok(reachable(hall, door, [portal.x - 1, portal.y + 1]) && !hall.blocked[portal.y + 1][portal.x - 1]);

            const folk = guildFolkOf(building, hall);
            const [receptionist, ...adventurers] = folk;
            const counter = hall.pieces.find(({ kind }) => kind === "counter");
            const board = hall.pieces.find(({ kind }) => kind === "board");

            // The receptionist, a young woman, stamps notices behind the counter and files at the
            // shelves behind her
            assert.equal(receptionist.role, "receptionist");
            assert.equal(receptionist.sex, "f");
            assert.deepEqual([...new Set(receptionist.routine.stops.map(({ act }) => act))], ["stamp", "file"]);

            for (const { square, act } of receptionist.routine.stops) {
                assert.ok(!hall.blocked[square[1]][square[0]] && reachable(hall, door, square), `receptionist at ${square}`);

                if (act === "stamp") {
                    assert.equal(square[1], counter.y - 1);
                    assert.ok(square[0] >= counter.x && square[0] < counter.x + counter.w);
                }
            }

            // Two adventurers read the board (one going to the counter now and then), and two to
            // four more drink at the tables, of every calling before any's twice
            const [reader, reader2, ...drinkers] = adventurers;

            for (const one of [reader, reader2]) {
                assert.equal(one.role, "adventurer");
                assert.ok(one.routine.stops.some(({ act, square }) => act === "read" && square[0] === board.x + 1));

                for (const { square } of one.routine.stops) {
                    assert.ok(!hall.blocked[square[1]][square[0]] && reachable(hall, door, square), `${one.local} at ${square}`);
                }
            }

            assert.ok(drinkers.length >= 2 && drinkers.length <= 4);

            for (const one of drinkers) {
                assert.equal(one.role, "patron");
                assert.equal(one.talk, "adventurer");
                assert.equal(hall.plan[one.square[1]][one.square[0]], "b");
                assert.ok(one.routine.seated);
            }

            assert.equal(new Set(adventurers.slice(0, 5).map(({ look }) => look)).size, Math.min(5, adventurers.length));
            assert.ok(adventurers.every(({ look }) => ["warrior", "ranger", "mage", "rogue", "cleric"].includes(look)));
            assert.equal(new Set(folk.map(({ local }) => local)).size, folk.length);
        }
    });

    it("dresses its receptionist in the guild's uniform, her hair in twin tails or a bob; its adventurers armed but sheathed, tankards in hand at the tables", () => {
        for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
            const { equipment, look, sheathed } = folkLook({ role: "receptionist", sex: "f", seed });

            assert.deepEqual(equipment.slice(0, 3), ["guildBlouse", "guildVest", "guildSkirt"]);
            assert.ok(["twintails", "bob"].includes(look.hair.style));
            assert.ok(!sheathed);
        }

        for (const calling of ["warrior", "ranger", "mage", "rogue", "cleric"]) {
            for (const sex of ["f", "m"]) {
                const reading = folkLook({ role: "adventurer", look: calling, sex, seed: 3 });
                const drinking = folkLook({ role: "patron", look: calling, sex, seed: 3 });

                assert.ok(reading.sheathed, `${calling} (${sex})`);
                assert.ok(["sword", "bow", "staff", "warHammer"].some((id) => reading.equipment.includes(id)), `${calling} (${sex}): ${reading.equipment}`);
                assert.ok(drinking.equipment.includes("tankard"), `${calling} (${sex}): ${drinking.equipment}`);
                assert.ok(!["sword", "staff", "warHammer"].some((id) => drinking.equipment.includes(id)));
            }
        }

        assert.ok(treeFor({ id: "x", role: "receptionist" }) && treeFor({ id: "x", role: "patron", talk: "adventurer" }) !== treeFor({ id: "x", role: "patron" }));
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
        const [door] = world.links[0].ends[0].squares;

        assert.ok(home.made);
        assert.deepEqual(home.maps, ["taproom", "upstairs"]);
        assert.equal(interiors.of("taproom"), home);
        assert.equal(interiors.of("town"), null);
        assert.equal(world.links[0].id, "tavern-door");
        assert.ok(Math.hypot(home.at[0] - door[0], home.at[1] - door[1]) < 12, `Wenches and Ale at ${home.at}`);
        assert.equal(home.folk, world.folk);
    });

    it("puts every settlement's taverns', smithies', temples', guilds' and barracks' doors among the world's links as it's laid out, their insides still to make", () => {
        const entered = settlement.town.pieces.filter((piece) => piece.kind === "landmark" && ENTERABLE.includes(piece.name));

        assert.deepEqual(new Set(entered.map(({ name }) => name)), new Set(["tavern", "blacksmith", "church", "guild", "barracks"]));

        for (const piece of entered) {
            const building = interiors.buildings.get(`${settlement.place.id}:${piece.id}`);
            const [outside, inside] = building.door.ends;

            assert.ok(world.links.includes(building.door));

            // (Where it stands, for its icon on the maps: its middle, a few steps from its door)
            assert.ok(Math.hypot(building.at[0] - outside.squares[0][0], building.at[1] - outside.squares[0][1]) < 12, `${building.key}: at ${building.at}`);
            assert.equal(building.name, piece.tavern?.name ?? (piece.patron ? `the Temple of ${GODS[piece.patron].name}` : { blacksmith: "the smithy", guild: "the Adventurers' Guild", barracks: piece.grade === "guardhouse" ? "the guardhouse" : "the barracks" }[piece.name]));
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

        // (Every kind drawn: a taproom, a smithy's workshop, a temple's nave, a guild's hall, a town
        // hall's chamber, a keep's great hall, each shop: the nearest capital laid out for one)
        const capital = world.plan.places.filter(({ kind }) => kind === "capital").sort((a, b) => Math.hypot(a.at[0] - world.start.at[0], a.at[1] - world.start.at[1]) - Math.hypot(b.at[0] - world.start.at[0], b.at[1] - world.start.at[1]))[0];

        world.maps.town.settlements.of(capital);

        // (And a town of another people's)
        const foreign = world.plan.places.find(({ kind, race }) => kind === "town" && race && race !== "human");

        world.maps.town.settlements.of(foreign);

        // (And where each of its people's master shops is kept)
        for (const place of world.plan.places.filter(({ master, race }) => master && race === world.start.race)) {
            world.maps.town.settlements.of(place);
        }

        const theirs = [...interiors.buildings.values()].find(({ place }) => place === foreign.id);

        interiors.make(theirs.key);
        assert.ok(theirs.folk.length && theirs.folk.every(({ people }) => people === foreign.race), foreign.race);

        // (Each building's folk of the people whose place it is)
        for (const building of interiors.buildings.values()) {
            assert.equal(building.people, building.place === "home" ? world.start.race : (world.plan.places.find(({ id }) => id === building.place)?.race ?? "human"), building.key);
        }

        for (const kind of ENTERABLE) {
            const one = [...interiors.buildings.values()].find((each) => each.kind === kind && each.key !== "home:tavern");

            interiors.make(one.key);
            assert.ok(one.folk.every(({ people }) => people === one.people), kind);

            for (const id of one.maps) {
                const interior = buildInterior(world.maps[id]);

                assert.ok(interior.object.children.length > 0, `${kind}: ${id}`);
                interior.dispose();
            }
        }
    });

    it("lights a dark elves' inside more than others': their hanging lamps lit by witchlight, amethyst shards glowing on the walls between them", () => {
        const one = [...interiors.buildings.values()].find((each) => each.kind === "tavern" && each.key !== "home:tavern");

        interiors.make(one.key);

        const map = world.maps[one.maps[0]];
        const [theirs, ours] = ["darkElf", "human"].map((people) => buildInterior({ ...map, people }));
        const kinds = (interior) => interior.lights.map(({ kind }) => kind);
        const brightness = (interior) => interior.lights.reduce((sum, { intensity }) => sum + intensity, 0);

        assert.ok(kinds(theirs).includes("witchlight") && kinds(theirs).includes("shard"), kinds(theirs).join());
        assert.ok(!kinds(ours).includes("witchlight") && !kinds(ours).includes("shard"));
        assert.ok(brightness(theirs) > brightness(ours) * 1.3, `${brightness(theirs).toFixed(1)} against ${brightness(ours).toFixed(1)}`);
        assert.ok(theirs.lights.length <= 16, "(no more than a room may have)");
        theirs.dispose();
        ours.dispose();
    });

    it("builds a floor a step at a time (as a building's got ready while playing), the same as at once", () => {
        const one = [...interiors.buildings.values()].find((each) => each.kind === "tavern" && each.key !== "home:tavern");

        interiors.make(one.key);

        const map = world.maps[one.maps[0]];
        const meshes = (interior) => {
            const found = [];

            interior.object.updateMatrixWorld(true);
            interior.object.traverse((node) => node.isMesh && found.push([node.material.type, node.matrixWorld.elements.join(), ...Object.values(node.geometry.attributes).map(({ array }) => [...array].join())].join("|")));

            return found;
        };
        const whole = buildInterior(map);
        const steps = buildingInterior(map);
        let [step, count] = [steps.next(), 1];

        while (!step.done) {
            [step, count] = [steps.next(), count + 1];
        }

        assert.ok(count >= 4, `${count} steps`);
        assert.deepEqual(meshes(step.value), meshes(whole));
        assert.deepEqual(step.value.lights, whole.lights);
        whole.dispose();
        step.value.dispose();
    });
});

describe("the places worth finding gone into (insides.js: a cave, the dragon's lair, the crypt under the ruins, a ruined castle's keep, a broken watchtower, the humans' abbeys and manors)", () => {
    it("have their way in among the world's links as they're set down, their floors made when wanted: all in them got to from the way in, their holders' and chest's places marked, a tower's two floors joined by stairs; and are drawn", () => {
        const world = buildWorld({ seed: 1 });
        const sites = world.maps.town.sites;

        // (The ruins whosever they were: their crypt's the same)
        for (const [kind, floors] of [["cave", 1], ["dragon's lair", 1], ["ruins", 1], ["ruined castle", 1], ["watchtower", 2]]) {
            const site = world.plan.sites.find((one) => one.kind === kind && (kind === "ruins" || !one.race));

            sites.heartOf(site);

            const building = world.interiors.buildings.get(`site:${site.id}`);

            assert.ok(building && world.links.includes(building.door) && !building.made, kind);
            assert.deepEqual(building.door.ends[0].squares, sites.set.get(site.id).entrance.front);
            world.interiors.make(building.key);
            assert.equal(building.maps.length, floors, kind);

            // (Every floor got to: below from the way in, above from the stairs' top)
            const maps = building.maps.map((id) => world.maps[id]);
            const from = [building.door.ends[1].arrive, building.stairs?.ends[1].arrive];
            const marked = (char) => maps.flatMap((map) => map.marks[char] ?? []);

            maps.forEach((map, k) => {
                for (const char of ["l", "g", "h"]) {
                    for (const square of map.marks[char] ?? []) {
                        assert.ok(reachable(map, from[k], square), `${kind}: ${map.id}'s ${char} at ${square}`);
                    }
                }
            });
            assert.equal(marked("h").length > 0, true, `${kind}'s chest`);
            assert.equal(marked("l").length, 1, `${kind}'s chief`);
            assert.ok(kind === "dragon's lair" || marked("g").length >= 2, `${kind}'s guards`);

            for (const map of maps) {
                const interior = buildInterior(map);

                assert.ok(interior.object.children.length > 0 && interior.lights.length > 0 === (map.style !== "tower-top"), `${kind}: ${map.id}`);
                assert.equal(interior.open, map.style === "tower-top" || map.style === "ruin", `${map.id} open to the sky`);
                interior.dispose();
            }
        }
    });

    it("the humans' abbeys and manors gone into by their temple's and keep's door, the way kept clear; where outlaws holding one would stand worked out from it: their chief before the altar or the thrones, the chest beside them, guards up the aisle", () => {
        const world = buildWorld({ seed: 2 });
        const sites = world.maps.town.sites;
        const squares = squaresOf(world.maps.town);

        for (const [kind, building, by] of [["abbey", "church", "altar"], ["manor", "keep", "throne"]]) {
            const site = world.plan.sites.find((one) => one.kind === kind && one.race === "human");

            sites.heartOf(site);

            const set = sites.set.get(site.id);
            const inside = world.interiors.buildings.get(`site:${site.id}`);

            assert.equal(inside?.kind, building, kind);
            assert.equal(set.entrance.building, building);
            assert.deepEqual(inside.door.ends[0].squares, set.entrance.front);
            assert.ok([...set.entrance.front, set.entrance.outside].every((square) => !squares.blocked(...square)), `${kind}: the way in clear`);
            world.interiors.make(inside.key);

            const map = world.maps[inside.maps[0]];
            const held = heldWithin(inside.kind, map);
            const all = [held.leader, held.chest, ...held.guards];
            const near = (square, kinds, reach) => map.pieces.some((piece) => piece.kind === kinds && piece.squares.some((each) => Math.max(Math.abs(each[0] - square[0]), Math.abs(each[1] - square[1])) <= reach));

            assert.equal(new Set(all.map(String)).size, all.length, `${kind}: none the same`);
            assert.ok(all.every((square) => !map.blocked[square[1]][square[0]] && reachable(map, inside.door.ends[1].arrive, square)), `${kind}: each got to`);
            assert.ok(near(held.leader, by, 2) && near(held.chest, by, 1), `${kind}: by the ${by}`);
            assert.ok(held.guards.every(([, y]) => y > held.leader[1] + 2), `${kind}: guards between it and the door`);
        }

        // (A building with nothing to gather by: no one)
        assert.equal(heldWithin("tavern", readPlan("test", "Test", ["...", ".D."])), null);
    });

    it("keeps those holding any of them clear of where anyone comes in, on every floor: their chief and guards five rings or more from a door's or a stair's arriving square, on free ground got to from it", () => {
        const world = buildWorld({ seed: 1 });
        const sites = world.maps.town.sites;
        const rings = ([x, y], [u, v]) => Math.max(Math.abs(x - u), Math.abs(y - v));
        const kinds = [["cave"], ["ruins"], ["ruined castle"], ["watchtower"], ["watchtower", "human"], ["abbey", "human"], ["manor", "human"], ["tree hall", "elf"]];
        let floors = 0;

        for (const [kind, race = null] of kinds) {
            const site = world.plan.sites.find((one) => one.kind === kind && (race ? one.race === race : kind === "ruins" || !one.race));

            if (!site) {
                continue;
            }

            sites.heartOf(site);

            const building = world.interiors.buildings.get(`site:${site.id}`);

            if (!building) {
                continue;
            }

            world.interiors.make(building.key);

            const ways = [building.door.ends[1], ...(building.stairs?.ends ?? [])];

            building.maps.forEach((id, k) => {
                const map = world.maps[id];
                const held = k === 0 && !map.marks.l ? heldWithin(building.kind, map) : null;
                const posts = held ? [held.leader, ...held.guards] : [...(map.marks.l ?? []), ...(map.marks.g ?? [])];
                const arrivals = ways.filter((end) => end.map === id).map((end) => end.arrive);

                if (!posts.length) {
                    return;
                }

                const placed = clearOfWaysIn(map, arrivals, posts);

                floors++;
                assert.equal(new Set(placed.map(String)).size, placed.length, `${kind} ${id}: none the same`);

                for (const square of placed) {
                    assert.ok(!map.blocked[square[1]][square[0]], `${kind} ${id}: ${square} free`);
                    assert.ok(arrivals.every((arrive) => rings(square, arrive) >= WAY_IN_CLEAR), `${kind} ${id}: ${square} ${Math.min(...arrivals.map((arrive) => rings(square, arrive)))} rings from where they come in`);
                    assert.ok(reachable(map, arrivals[0], square), `${kind} ${id}: ${square} got to`);
                }

                // (Those already clear kept where they were)
                posts.forEach((post, n) => {
                    if (arrivals.every((arrive) => rings(post, arrive) >= WAY_IN_CLEAR) && posts.findIndex((other) => String(other) === String(post)) === n) {
                        assert.deepEqual(placed[n], post, `${kind} ${id}: ${post} kept`);
                    }
                });
            });
        }

        assert.ok(floors >= 7, `(${floors} floors)`);
    });

    it("each people's watchtower (but the orcs' open deck) and the elves' tree hall gone into by its door, the way clear: a watchtower kept, its two floors joined by stairs, its lookout and sentry where they can be got to; the tree hall a great hall of their own", () => {
        const world = buildWorld({ seed: 2 });
        const sites = world.maps.town.sites;
        const squares = squaresOf(world.maps.town);
        const peoples = new Set();

        for (const site of world.plan.sites.filter((one) => (one.kind === "watchtower" && one.race) || one.kind === "tree hall")) {
            sites.heartOf(site);

            const set = sites.set.get(site.id);
            const building = world.interiors.buildings.get(`site:${site.id}`);

            assert.equal(Boolean(building), site.race !== "orc", `${site.id}, the ${site.race}'s`);

            if (!building) {
                continue;
            }

            assert.equal(building.people, site.race);
            assert.equal(building.kind, site.kind === "tree hall" ? "keep" : "watchtower");
            assert.deepEqual(building.door.ends[0].squares, set.entrance.front);
            assert.ok([...set.entrance.front, set.entrance.outside].every((square) => !squares.blocked(...square)), `${site.id}: the way in clear`);
            assert.ok(set.pieces[0].door || site.kind === "tree hall", `${site.id}: its door drawn`);
            world.interiors.make(building.key);

            const maps = building.maps.map((id) => world.maps[id]);
            const from = [building.door.ends[1].arrive, building.stairs?.ends[1].arrive];

            // (Those on their feet: the seated sit on their seats)
            for (const one of building.folk.filter(({ routine }) => !routine?.seated)) {
                const k = building.maps.indexOf(one.map);

                assert.ok(reachable(maps[k], from[k], one.square), `${site.id}'s ${one.local}`);
            }

            if (building.kind === "watchtower") {
                assert.deepEqual(building.folk.map(({ role }) => role), ["sentry", "sentry", "quartermaster"]);
                assert.deepEqual(building.folk.filter(({ shop }) => shop).map(({ shop, talk }) => [shop, talk]), [["watch", "watchQuartermaster"]]);
                assert.ok(maps.every((map) => map.look === "kept") && building.stairs);
                assert.ok(maps.every((map, k) => ["l", "h", "g"].every((char) => (map.marks[char] ?? []).every((square) => reachable(map, from[k], square)))));
                peoples.add(site.race);
            }
        }

        assert.deepEqual([...peoples].sort(), ["cat", "darkElf", "elf", "human", "lizard"]);
    });

    it("the cat folk's sun temple and the lizard folk's ziggurat gone into (M7.5d): the sun temple by the door in its middle tower's foot, up on its platform, from the foot of its broad stair; the ziggurat by the portal at its foot; each a temple as an abbey's, under its patron, its priest and herbalist where they can be got to", () => {
        const world = buildWorld({ seed: 2 });
        const sites = world.maps.town.sites;
        const squares = squaresOf(world.maps.town);
        const kinds = new Set();

        for (const site of world.plan.sites.filter((one) => one.kind === "sun temple" || one.kind === "ziggurat")) {
            sites.heartOf(site);

            const set = sites.set.get(site.id);
            const building = world.interiors.buildings.get(`site:${site.id}`);
            const { door, front, outside } = set.entrance;
            const spec = STRUCTURE_DOORS[site.kind][site.race];

            assert.ok(building, site.id);
            assert.equal(building.kind, "church");
            assert.equal(building.people, site.race);
            assert.equal(building.patron, SITE_PATRONS[site.kind]);
            assert.match(building.name, site.kind === "ziggurat" ? / Ziggurat$/ : / Sun Temple$/);
            assert.deepEqual(building.door.ends[0].squares, front);
            assert.ok([...front, outside].every((square) => !squares.blocked(...square)), `${site.id}: the way in clear`);

            // (Where the door is drawn, and how far from where it's gone into: the sun temple's up on
            // its platform, back past its obelisk and altar from the foot of its stair; the
            // ziggurat's at its foot)
            const middle = [(front[0][0] + front[1][0]) / 2 + 0.5, (front[0][1] + front[1][1]) / 2 + 0.5];
            const off = Math.hypot(door.x - middle[0], door.z - middle[1]);

            assert.equal(door.floor, spec.floor);
            assert.ok(site.kind === "sun temple" ? off > 17 && off < 21 : off < 1.5, `${site.id}: ${off.toFixed(1)} m from its way in`);

            world.interiors.make(building.key);

            const [nave] = building.maps.map((id) => world.maps[id]);

            assert.equal(nave.patron, SITE_PATRONS[site.kind]);
            assert.ok(["priest", "herbalist"].every((role) => building.folk.some((one) => one.role === role)), site.id);

            for (const one of building.folk.filter(({ routine }) => !routine?.seated)) {
                assert.ok(reachable(nave, building.door.ends[1].arrive, one.square), `${site.id}'s ${one.local}`);
            }

            kinds.add(site.kind);
        }

        assert.deepEqual([...kinds].sort(), ["sun temple", "ziggurat"]);
    });
});

describe("a people's castle's keep's undercroft (insides.js)", () => {
    it("is down the stairs from its great hall (a town's keep, a manor's and the elves' tree hall's have none): its forge, its armoury and the arcanist's corner, all got to from the stairs' foot; the castle's smith and apprentice at the forge, its quartermaster and arcanist behind their counters; and is drawn, vaulted and lit", () => {
        const world = buildWorld({ seed: 1 });
        const sites = world.maps.town.sites;
        const peoples = [];

        for (const site of world.plan.sites.filter((one) => one.race && ["castle", "manor", "tree hall"].includes(one.kind))) {
            sites.heartOf(site);

            const building = world.interiors.buildings.get(`site:${site.id}`);

            if (!building || building.kind !== "keep") {
                continue;
            }

            world.interiors.make(building.key);

            if (site.kind !== "castle") {
                assert.equal(building.maps.length, 1, `${site.id}, the ${site.race}'s ${site.kind}`);
                continue;
            }

            const [hall, under] = building.maps.map((id) => world.maps[id]);
            const below = building.folk.filter(({ map }) => map === under.id);

            assert.equal(under.style, "undercroft", site.race);
            assert.deepEqual(building.stairs.ends.map(({ map }) => map), [under.id, hall.id], `${site.race}: the stairs' foot below, their top in the hall`);
            assert.ok(reachable(hall, building.door.ends[1].arrive, building.stairs.ends[1].arrive), `${site.race}: the stairs got to from the door`);

            // (Everything in it got to from the stairs' foot: every open square, and before each
            // piece of it)
            for (let y = 0; y < under.height; y++) {
                for (let x = 0; x < under.width; x++) {
                    assert.ok(under.blocked[y][x] || reachable(under, building.stairs.ends[0].arrive, [x, y]), `${site.race}: ${[x, y]}`);
                }
            }

            assert.deepEqual(below.map(({ role }) => role), ["smith", "apprentice", "quartermaster", "arcanist"]);
            assert.equal(below.find(({ role }) => role === "smith").talk, "castleSmith");

            for (const one of below) {
                for (const { square } of [one, ...(one.routine.stops ?? [])]) {
                    assert.ok(!under.blocked[square[1]][square[0]], `${site.race}'s ${one.local} at ${square}`);
                }

                assert.ok(treeFor(one) && ROLES[one.role], one.role);
            }

            for (const map of [hall, under]) {
                const interior = buildInterior(map);

                assert.ok(interior.object.children.length > 0 && interior.lights.length >= (map === under ? 5 : 2), `${site.race}: ${map.id}`);
                interior.dispose();
            }

            peoples.push(site.race);
        }

        assert.deepEqual(peoples.sort(), ["cat", "darkElf", "elf", "human", "lizard", "orc"]);
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

    it("of another people: their people's bodies, skins and parts, dressed for their part", () => {
        for (const people of ["elf", "darkElf", "cat", "lizard", "orc"]) {
            for (const [role, local, sex] of [["smith", "smith", "m"], ["barmaid", "wench", "f"], ["sentry", "sentry", "f"], ["reeve", "reeve", "m"]]) {
                const look = folkLook({ role, local, sex, seed: 4, people });
                const human = folkLook({ role, local, sex, seed: 4 });

                assert.deepEqual(folkLook({ role, local, sex, seed: 4, people }), look);
                assert.notDeepEqual(look.shape, human.shape, `${people} ${local}`);
                assert.equal(look.shape.macro.gender, sex === "f" ? 0 : 1);

                for (const id of look.equipment) {
                    assert.ok(EQUIPMENT[id], `${people} ${local}: ${id}`);
                }

                // (Dressed and carrying what their part has them do: a sentry in their people's
                // uniform, a reeve in its livery, liveries.js)
                const dressed = local === "sentry" ? soldierKit(people, "sword") : local === "reeve" ? liveryKit(people, "reeve", sex) : human.equipment.filter((each) => !["nasalHelm", "wizardHat"].includes(each));

                for (const id of dressed) {
                    assert.ok(look.equipment.includes(id), `${people} ${local}: ${id}`);
                }
            }
        }

        const cat = folkLook({ role: "sentry", sex: "m", seed: 2, people: "cat" });

        assert.ok(cat.equipment.includes("catEars") && cat.equipment.includes("catTail"));
        assert.ok(cat.equipment.includes("helm.cat"), "their helm opens round the ears");
        assert.ok(folkLook({ role: "sentry", sex: "m", seed: 2, people: "lizard" }).equipment.includes("helm.lizard"));
        assert.ok(!folkLook({ role: "mage", sex: "m", seed: 2, people: "cat" }).equipment.includes("wizardHat"), "no hat over a cat's ears");
        assert.ok(folkLook({ role: "reeve", sex: "m", seed: 2, people: "elf" }).equipment.includes("livery.elf"), "officials in their people's livery");
        assert.equal(folkLook({ role: "priest", sex: "m", seed: 2, people: "lizard" }).look.hair.style, "bald");
        assert.equal(folkLook({ role: "priest", sex: "m", seed: 2, people: "orc" }).walk, "orc");
        assert.ok(folkLook({ role: "ruler", sex: "f", seed: 2, people: "cat" }).equipment.includes("crown"), "a crown sits between the ears");
        assert.equal(folkLook({ role: "priest", sex: "m", seed: 2, people: "elf" }).look.hair.beard, "none");
        assert.deepEqual(folkLook({ role: "priest", sex: "m", seed: 2, people: "human" }), folkLook({ role: "priest", sex: "m", seed: 2 }));
    });

    it("are named in their own people's tongue", () => {
        const folk = Array.from({ length: 8 }, (_, k) => ({ sex: k % 2 ? "f" : "m" }));
        const human = namePeople(folk, 3);
        const given = new Set([...GIVEN_NAMES.f, ...GIVEN_NAMES.m]);

        assert.ok(human.every(({ name }) => given.has(name.split(" ")[0])));

        for (const people of ["elf", "darkElf", "cat", "lizard", "orc"]) {
            const named = namePeople(folk, 3, people);

            assert.deepEqual(namePeople(folk, 3, people), named);
            assert.equal(new Set(named.map(({ name }) => name)).size, folk.length, people);
            assert.ok(named.every(({ name }) => /^[A-Z][a-z]+ [A-Z][a-z]+$/.test(name) && !given.has(name.split(" ")[0])), `${people}: ${named.map(({ name }) => name)}`);
        }
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
