// The rooms indoors (world/interiors3d.js): their ceilings, the daylight through their windows and
// the flames lighting them (world/roomlight.js), and the camera looking up at them (world/view.js)
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import { readPlan, tavernFloors } from "../client/js/core/interiors.js";
import { guildRooms, hallRooms, keepRooms, smithyRooms, tavernRooms, templeRooms } from "../client/js/core/insides.js";
import { buildInterior, cutFor, cutsAway, daylightOf, shaftsOf, STOREY } from "../client/js/world/interiors3d.js";
import { BOUNCE, fillOf, gather, pickLamps, ROOM_LIGHT, ROOM_LIGHTS, strengthOf } from "../client/js/world/roomlight.js";
import { View } from "../client/js/world/view.js";

const KINDS = Object.freeze({ taproom: tavernRooms, smithy: smithyRooms, temple: templeRooms, guild: guildRooms, hall: hallRooms, keep: keepRooms });

// The first floor of a kind of inside, as `people` builds it, at the world's corner
function insideOf(kind, people = "human") {
    const [floor] = KINDS[kind]({ seed: 3, name: "Inside", people, patron: "aurelia", tavern: { storeys: 2, upstairs: "inn" } });
    const map = readPlan(`rooms-${kind}`, floor.name, floor.rows, { ground: floor.ground });

    Object.assign(map, { origin: [0, 0], style: floor.style, look: floor.look ?? null, finish: floor.finish ?? null, patron: floor.patron ?? null, layout: floor.layout ?? null, people });

    return buildInterior(map);
}

const meshesOf = (built, test) => {
    const found = [];

    built.object.traverse((node) => node.isMesh && test(node) && found.push(node));

    return found;
};

describe("the rooms' ceilings (interiors3d.js)", () => {
    it("puts a ceiling over every floor of every kind, every people's, its underside at the storey's height", () => {
        for (const kind of Object.keys(KINDS)) {
            for (const people of ["human", "orc", "cat", "lizard", "elf", "darkElf"]) {
                const built = insideOf(kind, people);
                const [ceiling] = meshesOf(built, ({ material }) => material.name === "atlas-inside-ceiling");

                assert.ok(ceiling, `${people} ${kind}`);
                built.object.updateMatrixWorld(true);

                const box = new THREE.Box3().setFromObject(ceiling);

                assert.ok(box.max.y >= STOREY && box.min.y > STOREY - 0.6, `${people} ${kind}: ${box.min.y}-${box.max.y}`);
                assert.ok(box.max.x - box.min.x >= built.map.width - 0.01 && box.max.z - box.min.z >= built.map.height - 0.01, `${people} ${kind}: the whole room`);
                built.dispose();
            }
        }
    });

    it("can be seen from below: its boards, joists and beams have undersides, facing down", () => {
        const built = insideOf("taproom");
        const [ceiling] = meshesOf(built, ({ material }) => material.name === "atlas-inside-ceiling");
        const normals = ceiling.geometry.attributes.normal;
        let down = 0;

        for (let k = 0; k < normals.count; k++) {
            down += normals.getY(k) < -0.99 ? 1 : 0;
        }

        // (Looking straight up from the middle of the room, the first thing met is the ceiling's
        // underside, at the storey's height or just under it: a joist's, a beam's or the boards')
        built.object.updateMatrixWorld(true);

        const ray = new THREE.Raycaster(new THREE.Vector3(9.3, 1, 12.6), new THREE.Vector3(0, 1, 0));
        const [hit] = ray.intersectObject(ceiling);

        assert.ok(down >= 6 * 20, `${down} corners facing down`);
        assert.ok(hit && hit.face.normal.y < -0.99 && hit.point.y <= STOREY + 0.001 && hit.point.y > STOREY - 0.35, JSON.stringify(hit?.point));
        built.dispose();
    });

    it("leaves the stairwell open over the stairs, a dark well over it", () => {
        const { taproom } = tavernFloors();
        const built = buildInterior(taproom);
        const stair = taproom.pieces.find(({ kind }) => kind === "stairs");
        const [ox, oz] = taproom.origin;
        const [ceiling] = meshesOf(built, ({ material }) => material.name === "atlas-inside-ceiling");

        built.object.updateMatrixWorld(true);

        const up = (x, z) => new THREE.Raycaster(new THREE.Vector3(ox + x, 1, oz + z), new THREE.Vector3(0, 1, 0)).intersectObject(ceiling)[0]?.point.y;

        // (Over the stairs, the first thing up there is the well's top, well over the ceiling)
        assert.ok(up(stair.x + stair.w / 2, stair.y + stair.h / 2) > STOREY + 1, "the stairwell");
        assert.ok(up(stair.x + stair.w + 3, stair.y + 6) <= STOREY + 0.001, "beside it");
        built.dispose();
    });

    it("hangs every wheel of candles under it, over everyone's heads", () => {
        for (const kind of ["taproom", "temple", "guild", "hall", "keep"]) {
            const built = insideOf(kind);
            const wheels = built.lights.filter(({ kind: of }) => of === "lamp");

            assert.ok(wheels.length >= 1, kind);

            for (const wheel of wheels) {
                assert.ok(wheel.y > 2.2 && wheel.y < STOREY - 0.2, `${kind}: a wheel at ${wheel.y} metres`);
            }

            built.dispose();
        }
    });

    it("draws a ceiling only where it's higher than the camera: from under it all of it, from over it none", () => {
        const { taproom } = tavernFloors();
        const [ox, oz] = taproom.origin;
        const player = new THREE.Vector3(ox + 9, 0, oz + 9);

        cutFor(taproom, player, new THREE.Vector3(ox + 9, 0.6, oz + 12));
        assert.equal(cutsAway([ox + 9, STOREY - 0.2, oz + 10], { ceiling: true }), false, "under it");
        assert.equal(cutsAway([ox + 2, STOREY, oz + 2], { ceiling: true }), false, "under it, anywhere");

        cutFor(taproom, player, new THREE.Vector3(ox + 9, 7, oz + 18));
        assert.equal(cutsAway([ox + 9, STOREY, oz + 10], { ceiling: true }), true, "over it");
        assert.equal(cutsAway([ox + 2, STOREY - 0.2, oz + 2], { ceiling: true }), true, "over it, anywhere");
    });

    it("doesn't draw the ceiling at all while the camera's over all of it, but always draws its shadow", () => {
        const built = insideOf("taproom");
        const [ceiling] = meshesOf(built, ({ material }) => material.name === "atlas-inside-ceiling");
        const top = new THREE.Box3().setFromObject(ceiling).max.y;
        // (How much of it three.js draws into the view, and into the sun's shadows)
        const drawn = () => (ceiling.onBeforeRender(), ceiling.geometry.drawRange.count);
        const shadowed = () => (ceiling.onBeforeShadow(), ceiling.geometry.drawRange.count);

        built.seenFrom({ y: top + 2 });
        assert.equal(drawn(), 0, "over it all");
        assert.equal(shadowed(), Infinity, "its shadow");
        assert.equal(drawn(), 0, "over it all, again");

        built.seenFrom({ y: top - 0.1 });
        assert.equal(drawn(), Infinity, "level with it (cut in the shader)");

        built.seenFrom({ y: 1 });
        assert.equal(drawn(), Infinity, "under it");
        assert.equal(shadowed(), Infinity, "its shadow");
        built.dispose();
    });

    it("cuts away only what's in the way of seeing the player: looking up from low down, not what's overhead", () => {
        const { taproom } = tavernFloors();
        const [ox, oz] = taproom.origin;
        const player = new THREE.Vector3(ox + 9, 0, oz + 7);

        // (A wheel of candles 2.5 metres up, two metres from the player towards the camera: in the
        // way from high up, overhead from low down)
        cutFor(taproom, player, new THREE.Vector3(ox + 9, 7, oz + 15));
        assert.equal(cutsAway([ox + 9, 2.5, oz + 9]), true, "from high up");

        cutFor(taproom, player, new THREE.Vector3(ox + 9, 0.6, oz + 11));
        assert.equal(cutsAway([ox + 9, 2.5, oz + 9]), false, "from low down");

        // (From about head height, what's above it in the way)
        cutFor(taproom, player, new THREE.Vector3(ox + 9, 2.4, oz + 11));
        assert.equal(cutsAway([ox + 9, 2.1, oz + 9]), true, "level with it");
    });
});

describe("the daylight through the windows (interiors3d.js)", () => {
    it("comes in on the side with the most windows, the south's first, 35 degrees up, aslant", () => {
        const south = daylightOf([{ side: "n", at: 3 }, { side: "s", at: 3 }, { side: "w", at: 4 }]);
        const west = daylightOf([{ side: "w", at: 3 }, { side: "w", at: 9 }, { side: "s", at: 4 }]);

        assert.equal(daylightOf([]), null);
        assert.ok(Math.abs(Math.hypot(...south) - 1) < 1e-9);
        assert.ok(south[2] > 0.6 && Math.abs(south[0]) > 0.1, "from the south, a little round to one side");
        assert.ok(west[0] < -0.6, "from the west");
        assert.ok(Math.abs(Math.asin(south[1]) - (35 * Math.PI) / 180) < 1e-9);
    });

    it("shines in at every room with windows: through its sunny windows (open, their glass casting no shadow) onto the floor", () => {
        for (const kind of Object.keys(KINDS)) {
            const built = insideOf(kind);
            const glass = meshesOf(built, ({ material }) => material.name.startsWith("window"));
            const casters = meshesOf(built, (mesh) => mesh.castShadow);
            const from = new THREE.Vector3(...built.daylight);

            built.object.updateMatrixWorld(true);
            assert.ok(glass.length && glass.every(({ castShadow }) => !castShadow), kind);

            // (Somewhere on the floor the sun reaches, nothing between it and the sky)
            let lit = 0;

            for (let x = 0.25; x < built.map.width; x += 0.5) {
                for (let z = 0.25; z < built.map.height; z += 0.5) {
                    lit += new THREE.Raycaster(new THREE.Vector3(x, 0.02, z), from, 0, 60).intersectObjects(casters).length === 0 ? 1 : 0;
                }
            }

            assert.ok(lit >= 4, `${kind}: ${lit} spots of floor in the sun`);
            built.dispose();
        }
    });

    it("draws a beam of it in the air from each sunny window down to the floor", () => {
        const map = { width: 10, height: 8 };
        const daylight = daylightOf([{ side: "s", at: 3 }, { side: "s", at: 7 }]);
        const { positions, along, across } = shaftsOf(map, [{ side: "s", at: 3 }, { side: "s", at: 7 }, { side: "n", at: 5 }], daylight);

        // (Two windows' beams, four faces each, two triangles a face: none from the north window,
        // out of the sun)
        assert.equal(along.length, 2 * 4 * 6);
        assert.equal(across.length, along.length);

        for (let k = 0; k < along.length; k++) {
            const [x, y, z] = positions.slice(k * 3, k * 3 + 3);

            if (along[k] === 1) {
                assert.ok(Math.abs(y) < 1e-9 && z < map.height && x > 0 && x < map.width, `on the floor: ${x}, ${y}, ${z}`);
            } else {
                assert.ok(Math.abs(z - map.height) < 1e-9 && y >= 0.9 && y <= 2.35, `at the window: ${x}, ${y}, ${z}`);
            }
        }
    });
});

describe("the flames lighting the rooms (roomlight.js, interiors3d.js)", () => {
    it("lights each room by its every flame (its fires first), no more than the shader takes", () => {
        for (const kind of Object.keys(KINDS)) {
            for (const people of ["human", "elf"]) {
                const built = insideOf(kind, people);
                const kinds = new Set(built.lights.map(({ kind: of }) => of));

                assert.ok(built.lights.length >= 2 && built.lights.length <= ROOM_LIGHTS, `${people} ${kind}: ${built.lights.length}`);
                assert.ok(kinds.has("candle"), `${people} ${kind}: candles`);
                assert.ok(built.lights.every(({ intensity, distance, x, z }) => intensity > 0 && distance > 0 && x > -1 && z > -1 && x < built.map.width + 1 && z < built.map.height + 1), `${people} ${kind}`);

                if (kind === "smithy" || kind === "taproom") {
                    assert.equal(built.lights[0].kind, "fire", `${people} ${kind}: its fire first`);
                }

                built.dispose();
            }
        }
    });

    it("gives every flame a glow, and none for the daylight", () => {
        const built = insideOf("taproom");
        const glows = built.object.getObjectByName("glows");

        assert.ok(glows.isPoints && glows.geometry.attributes.position.count >= built.lights.length);
        built.dispose();
    });

    it("takes the nearest candles of a room with too many together, as bright, never its fires", () => {
        const candles = Array.from({ length: 20 }, (_, k) => ({ kind: "candle", x: k * 0.3, y: 1, z: 0, intensity: 1, distance: 5 }));
        const fire = { kind: "fire", x: 50, y: 1, z: 50, intensity: 9, distance: 14 };
        const lights = gather([fire, ...candles]);

        assert.equal(lights.length, ROOM_LIGHTS);
        assert.deepEqual(lights[0], fire);
        assert.equal(lights.reduce((sum, { intensity }) => sum + intensity, 0), 29);
        assert.ok(lights.slice(1).every(({ kind }) => kind === "candle"));
    });

    it("flickers each flame its own way, never out, and flares a forge's up and down again over a second", () => {
        const light = { intensity: 10, flicker: 0.25, seed: 3 };
        const strengths = Array.from({ length: 200 }, (_, k) => strengthOf(light, k * 0.05));

        assert.ok(Math.min(...strengths) >= 7.5 && Math.max(...strengths) <= 12.5);
        assert.ok(new Set(strengths.map((v) => v.toFixed(2))).size > 50);
        assert.ok(Math.abs(strengthOf({ intensity: 10 }, 3, { amount: 0.8, at: 3 }) - 18) < 1e-9);
        assert.equal(strengthOf({ intensity: 10 }, 4.5, { amount: 0.8, at: 3 }), 10);
    });

    it("lights the player by the two flames lighting them most (the view's lamps), keeping one already lit unless another's half as bright again", () => {
        const lights = [
            { x: 0, y: 2, z: 0, distance: 10 },
            { x: 3, y: 2, z: 0, distance: 10 },
            { x: 6, y: 2, z: 0, distance: 10 },
            { x: 40, y: 2, z: 0, distance: 10 },
        ];
        const strengths = [5, 5, 5, 100];

        assert.deepEqual(pickLamps(lights, strengths, { x: 3.2, y: 1.2, z: 0 }, 2), [1, 2]);
        assert.deepEqual(pickLamps(lights, strengths, { x: 3.2, y: 1.2, z: 0 }, 2, [0, 1]), [0, 1], "the held one kept");
        assert.deepEqual(pickLamps(lights, strengths, { x: 5.5, y: 1.2, z: 0 }, 2, [0, 1]), [1, 2], "a much nearer one taken");
        assert.deepEqual(pickLamps(lights, strengths, { x: 25, y: 1.2, z: 0 }, 2), [], "out of reach of all");
    });

    it("fills the room all round with the light its flames give off its walls, floor and ceiling", () => {
        const colours = [new THREE.Color(1, 0.5, 0.25), new THREE.Color(1, 1, 1)];
        const fill = fillOf(colours, [10, 2], 100, new THREE.Color());

        assert.ok(Math.abs(fill.r - (12 * BOUNCE) / 100) < 1e-9 && Math.abs(fill.g - (7 * BOUNCE) / 100) < 1e-9 && Math.abs(fill.b - (4.5 * BOUNCE) / 100) < 1e-9);
    });
});

describe("the camera indoors (view.js)", () => {
    // (The view's sums on a stand-in for it: where it looks from, and the room)
    const room = { x0: 100, z0: 0, x1: 118, z1: 15, ceiling: STOREY };
    const reach = (pitch, distance, focus, yaw = 0) => View.prototype.roomReach.call({ room, focus: new THREE.Vector3(...focus), yaw }, pitch, distance);

    it("looks up at the ceiling indoors, as out of doors it looks up into the sky", () => {
        const lowest = View.prototype.lowestPitch;

        assert.ok(lowest.call({ indoors: true, camera: { fov: 50 } }) <= -30);
        assert.ok(lowest.call({ indoors: false, camera: { fov: 50 } }) <= -30);
    });

    it("lights the room by its flames: the two lighting the player most the lamps, the rest listed one after another for the room's own shaders", () => {
        const flame = (x, intensity) => ({ kind: "candle", x, y: 2, z: 5, intensity, distance: 6, colour: 0xffaa66 });
        const lights = [flame(101, 3), flame(104, 3), flame(108, 3), flame(112, 3), flame(116, 3)];
        const stand = { room: { ...room, lights, colours: lights.map(({ colour }) => new THREE.Color(colour)), strengths: [], flares: [], lamps: [] }, lamps: [{ light: new THREE.PointLight() }, { light: new THREE.PointLight() }] };

        View.prototype.flicker.call(stand, 0, new THREE.Vector3(107, 1.2, 5));

        assert.deepEqual(stand.room.lamps, [1, 2]);
        assert.deepEqual(stand.lamps.map(({ light }) => light.position.x), [104, 108]);
        assert.equal(ROOM_LIGHT.count.value, 3, "only those not the lamps, each costing every pixel");
        assert.deepEqual(ROOM_LIGHT.at.value.slice(0, 3).map(({ x, w }) => [x, w]), [[101, 6], [112, 6], [116, 6]]);
    });

    it("keeps the camera inside the walls under the ceiling, and anywhere over it", () => {
        // (Looking down steeply from far off: over the ceiling, as far as it likes)
        assert.equal(reach(35, 10.5, [109, 0, 13]), 10.5);

        // (Looking up, or nearly level: under it, no further than the wall behind, 0.35 m in)
        assert.ok(Math.abs(reach(-20, 10.5, [109, 0, 12]) - 2.65) < 1e-9);
        assert.ok(Math.abs(reach(5, 10.5, [109, 0, 7]) - 7.65 / Math.cos((5 * Math.PI) / 180)) < 1e-9);

        // (Never nearer than a metre, the wall right behind)
        assert.equal(reach(-20, 10.5, [109, 0, 14.9]), 1);
    });
});
