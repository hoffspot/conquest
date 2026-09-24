import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { Color, Vector3, REVISION } from "three";
import { MODELS, modelFiles } from "../client/js/app/models.js";
import { aimCamera, createCamera, facingRotation, groundToScene, heightOnScreen, interpolatedHeading, isDrawnIn3D, packCells, recolour } from "../client/js/app/units3d.js";

// The JSON part of a .glb model file: its nodes, materials and extensions
function readModel(file) {
    const buffer = readFileSync(new URL(`../client/models/${file}`, import.meta.url));

    assert.equal(buffer.toString("ascii", 0, 4), "glTF", `${file} is a binary glTF file`);

    return JSON.parse(buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString("utf8"));
}

// Where a point in the 3D scene appears on a canvas showing `width` x `height` world pixels
function toCanvas(camera, point, width, height) {
    const ndc = new Vector3(point.x, point.y, point.z).project(camera);

    return { x: ((ndc.x + 1) / 2) * width, y: ((1 - ndc.y) / 2) * height, depth: ndc.z };
}

describe("3D units", () => {
    const width = 200;
    const height = 120;
    const camera = createCamera();

    aimCamera(camera, width, height);
    camera.updateMatrixWorld();

    test("ground positions line up exactly with the 2D map", () => {
        for (const [x, y] of [[0, 0], [50, 30], [199, 119], [123.5, 7.25]]) {
            const point = toCanvas(camera, groundToScene(x, y), width, height);

            assert.ok(Math.abs(point.x - x) < 1e-6, `x for ${x},${y}`);
            assert.ok(Math.abs(point.y - y) < 1e-6, `y for ${x},${y}`);
        }
    });

    test("height moves a point up the screen and towards the viewer", () => {
        const ground = groundToScene(100, 60);
        const onGround = toCanvas(camera, ground, width, height);
        const raised = toCanvas(camera, { ...ground, y: 20 }, width, height);

        assert.ok(Math.abs(raised.x - onGround.x) < 1e-6);
        assert.ok(Math.abs(onGround.y - raised.y - heightOnScreen(20)) < 1e-6);
        assert.ok(raised.depth < onGround.depth, "higher points are nearer the camera");

        // Further south on the map is nearer the camera too
        assert.ok(toCanvas(camera, groundToScene(100, 90), width, height).depth < onGround.depth);
    });

    test("units turn smoothly between ticks, the short way round", () => {
        const eighth = Math.PI / 4;

        // Directions run clockwise from north: 2 of 8 is east
        assert.equal(interpolatedHeading(2, 2, 8, 0), 2 * eighth);
        assert.equal(interpolatedHeading(1, 3, 8, -1), eighth);
        assert.equal(interpolatedHeading(1, 3, 8, 0), 3 * eighth);
        assert.equal(interpolatedHeading(1, 3, 8, -0.5), 2 * eighth);

        // From 7 to 1 turns through north, not all the way back round
        assert.equal(interpolatedHeading(7, 1, 8, -0.5), 8 * eighth);
        assert.equal(interpolatedHeading(1, 7, 8, -0.5), 0);
    });

    test("every vehicle, aircraft and building is drawn in 3D; the oil field stays a sprite", () => {
        for (const [type, name] of [["vehicles", "heavy-tank"], ["vehicles", "scout-tank"], ["vehicles", "harvester"], ["vehicles", "transport"],
            ["aircraft", "chopper"], ["aircraft", "wraith"], ["buildings", "base"], ["buildings", "starport"], ["buildings", "harvester"], ["buildings", "ground-turret"]]) {
            assert.equal(isDrawnIn3D({ type, name }), true, `${type}/${name}`);
        }

        assert.equal(isDrawnIn3D({ type: "terrain", name: "oilfield" }), false);
        assert.equal(isDrawnIn3D({ type: "bullets", name: "cannon-ball" }), false);
    });

    test("every model file exists, is credited, and has the parts the game uses", () => {
        const credits = readFileSync(new URL("../client/models/CREDITS.md", import.meta.url), "utf8");

        for (const file of modelFiles()) {
            assert.ok(credits.includes(`\`${file}\``), `${file} is credited in CREDITS.md`);

            // Only extensions Three.js's loader reads without extra decoders
            for (const extension of readModel(file).extensionsUsed ?? []) {
                assert.ok(["KHR_mesh_quantization", "KHR_materials_unlit", "KHR_texture_transform"].includes(extension), `${file} uses ${extension}`);
            }
        }

        for (const [key, model] of Object.entries(MODELS)) {
            for (const file of model.files ? Object.values(model.files) : [model.file]) {
                const json = readModel(file);
                const materials = new Set((json.materials ?? []).map((m) => m.name));
                const nodes = new Set((json.nodes ?? []).map((n) => n.name));

                for (const name of model.recolour ?? []) {
                    assert.ok(materials.has(name), `${key}: material ${name} is in ${file}`);
                }

                for (const name of [model.aim, ...(model.spin ?? []).map((s) => s.node)].filter(Boolean)) {
                    assert.ok(nodes.has(name), `${key}: part ${name} is in ${file}`);
                }
            }
        }
    });

    test("models are turned so that their front faces north", () => {
        const front = (facing) => {
            const vector = { "-z": new Vector3(0, 0, -1), "+z": new Vector3(0, 0, 1), "-x": new Vector3(-1, 0, 0), "+x": new Vector3(1, 0, 0) }[facing];

            return vector.applyAxisAngle(new Vector3(0, 1, 0), facingRotation(facing));
        };

        for (const facing of ["-z", "+z", "-x", "+x"]) {
            const north = front(facing);

            assert.ok(Math.abs(north.x) < 1e-9 && Math.abs(north.z + 1) < 1e-9, `${facing} ends up facing north`);
        }
    });

    test("cells are packed without overlapping", () => {
        const sizes = [120, 60, 60, 300, 90, 60, 60, 150];
        const { positions, width, height } = packCells(sizes);

        positions.forEach((a, i) => {
            assert.ok(a.x + sizes[i] <= width && a.y + sizes[i] <= height, "inside the canvas");

            positions.forEach((b, j) => {
                if (i < j) {
                    const apart = a.x + sizes[i] <= b.x || b.x + sizes[j] <= a.x || a.y + sizes[i] <= b.y || b.y + sizes[j] <= a.y;

                    assert.ok(apart, `cells ${i} and ${j} don't overlap`);
                }
            });
        });

        assert.deepEqual(packCells([]), { positions: [], width: 0, height: 0 });
    });

    test("team colours keep each material's lightness", () => {
        const light = new Color(recolour(0xe0a060, "blue")).getHSL({});
        const dark = new Color(recolour(0x603010, "blue")).getHSL({});
        const green = new Color(recolour(0xe0a060, "green")).getHSL({});

        assert.ok(light.l > dark.l, "light stays lighter than dark");
        assert.ok(Math.abs(light.h - dark.h) < 0.01, "both take the team's hue");
        assert.ok(Math.abs(light.h - green.h) > 0.1, "blue and green differ");
    });

    test("the vendored copy of Three.js matches the version in package.json", () => {
        const folder = new URL(`../client/vendor/three-r${REVISION}/`, import.meta.url);

        for (const file of ["three.core.min.js", "three.module.min.js", "LICENSE", "addons/loaders/GLTFLoader.js", "addons/utils/BufferGeometryUtils.js", "addons/utils/SkeletonUtils.js"]) {
            assert.ok(existsSync(new URL(file, folder)), `client/vendor/three-r${REVISION}/${file} exists (run npm run vendor:three)`);
        }

        assert.match(readFileSync(new URL("three.core.min.js", folder), "utf8"), new RegExp(`="${REVISION}"`));

        // The page's import map loads that copy
        const page = readFileSync(new URL("../client/index.html", import.meta.url), "utf8");

        assert.ok(page.includes(`"three": "./vendor/three-r${REVISION}/three.module.min.js"`));
        assert.ok(page.includes(`"three/addons/": "./vendor/three-r${REVISION}/addons/"`));
    });
});
