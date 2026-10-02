// The land's fields, worked out when a piece of the world is drawn: how far water is from its
// shore (client/js/world/water.js), and how much of the sky's hidden near what stands on the
// ground (client/js/world/ground.js), from the distances and blurs they're made of
// (client/js/world/fields.js); and the ground darkened under everyone standing on it
// (client/js/world/contacts.js)
import assert from "node:assert/strict";
import { describe, it } from "node:test";

// (The ground's textures are painted on canvases: enough of one for them in Node)
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData: () => {} }) }) };

const { blurred, distancesFrom } = await import("../client/js/world/fields.js");
const { FIELD, fieldTexture, SHORE, shoreBytes, shoreDistances } = await import("../client/js/world/water.js");
const { contactOf, HOMES, landColour, landLayers } = await import("../client/js/world/ground.js");
const { CONTACT, ContactShadows } = await import("../client/js/world/contacts.js");
const THREE = await import("three");

// A grid from rows of text: "#" for a marked square
function grid(rows) {
    const [width, height] = [rows[0].length, rows.length];
    const cells = new Uint8Array(width * height);

    rows.forEach((row, y) => [...row].forEach((c, x) => (cells[y * width + x] = c === "#" ? 1 : 0)));

    return { cells, width, height };
}

describe("the land's fields (fields.js)", () => {
    it("measure how far each square is from the nearest marked one, across and corner to corner", () => {
        const { cells, width, height } = grid(["#....", ".....", "....."]);
        const distance = distancesFrom(cells, width, height);

        assert.equal(distance[0], 0);
        assert.equal(distance[1], 1);
        assert.equal(distance[4], 4);
        assert.ok(Math.abs(distance[width + 1] - Math.SQRT2) < 1e-6);
        assert.ok(Math.abs(distance[2 * width + 2] - 2 * Math.SQRT2) < 1e-6);
        assert.equal(distancesFrom(new Uint8Array(4), 2, 2)[3], Infinity);
    });

    it("blur softly, keeping the total, and a lone square fading to nothing a few squares off", () => {
        const { cells, width, height } = grid([".........", ".........", ".........", ".........", "....#....", ".........", ".........", ".........", "........."]);
        const soft = blurred(cells, width, height, 2);
        const total = soft.reduce((sum, value) => sum + value, 0);

        assert.ok(Math.abs(total - 1) < 1e-6, `${total}`);
        assert.ok(soft[4 * width + 4] > soft[4 * width + 5] && soft[4 * width + 5] > soft[4 * width + 6]);
        assert.ok(soft[0] < 0.01);
    });
});

describe("the water's shore (water.js)", () => {
    const lake = grid(["..........", "..######..", ".########.", ".########.", "..######..", ".........."]);

    it("lies between the wet squares and the dry, deeper further in, and below nothing on land", () => {
        const field = shoreDistances(lake.cells, lake.width, lake.height);
        const at = (x, y) => field[y * lake.width + x];

        // (A wet square at the water's edge and the dry one beside it either side of the shore)
        assert.ok(at(1, 2) > 0 && at(0, 2) < 0);
        assert.ok(at(4, 2) > at(2, 2), "further in, deeper");
        assert.ok(at(0, 0) < at(1, 0), "further out, further below");
        assert.ok(field.every((value) => Math.abs(value) <= SHORE.reach));
    });

    it("rounds its corners off, rather than stepping square by square", () => {
        const field = shoreDistances(lake.cells, lake.width, lake.height);

        // (A corner's outer dry square nearer the water than a dry square as far out along an edge)
        assert.ok(field[1 * lake.width + 1] > field[1 * lake.width + 0]);
    });

    it("is kept in bytes, the shoreline at 128, a square SHORE.steps", () => {
        const bytes = shoreBytes(Float32Array.from([0, 1, -1, 100, -100]));

        assert.deepEqual([...bytes], [128, 128 + SHORE.steps, 128 - SHORE.steps, 255, 0]);
    });

    it("keeps how the water runs and how deep it is beside it: a river's current, a lagoon's depth a way in from its shore", () => {
        const shore = Float32Array.from([2, 0.5, -1]);
        const river = fieldTexture(shore, 3, 1, { flow: Float32Array.from([1.5, -0.5, 0, 0, 9, 0]), depth: Float32Array.from([1.2, 0.2, 0]) }).image.data;
        const lagoon = fieldTexture(shore, 3, 1).image.data;

        assert.deepEqual([...river.slice(0, 4)], [128 + 2 * SHORE.steps, Math.round(128 + 1.5 * FIELD.flow), Math.round(128 - 0.5 * FIELD.flow), Math.round(1.2 * FIELD.depth)]);
        assert.equal(river[9], 255, "the fastest kept");
        assert.deepEqual([lagoon[1], lagoon[2]], [128, 128], "a lagoon's still");
        assert.ok(lagoon[3] > lagoon[7] && lagoon[11] === 0, "deeper further in");
    });
});

describe("the ground where something stands on it (ground.js)", () => {
    it("is darkest at a wall's foot, fades a few metres off, and none where nothing stands", () => {
        // (A great building from x = 10 on, across the whole chunk)
        const { texture, area } = contactOf((x) => x >= 10, [0, 0, 16]);
        const [x0, , across] = area;
        const at = (x) => texture.image.data[8 * across + (x - x0)];

        assert.ok(at(9) > 100 && at(9) < 160, `at the foot: ${at(9)}`);
        assert.ok(at(8) < at(9) && at(6) < at(8) && at(3) < 5, [3, 6, 8, 9].map(at).join(" "));
        assert.equal(contactOf(() => false, [0, 0, 16]), null);
    });

    it("reads a land's maps as two texture arrays: its colours (sRGB), and its homelands and farmland", () => {
        // (A heath in the dark elves' homeland: its colour, and their mark in the second home
        // map's first channel)
        const land = landColour("heath", "darkElf");
        const { colours, marks } = landLayers(land);
        const home = HOMES.indexOf("darkElf");

        assert.equal(landLayers(land), land.userData.layers, "made once a land");
        assert.ok(colours.isDataArrayTexture && marks.isDataArrayTexture);
        assert.deepEqual([colours.image.depth, marks.image.depth], [2, 3], "colour and grass afar; two home maps and the farmland");
        assert.deepEqual([colours.colorSpace, marks.colorSpace], [THREE.SRGBColorSpace, THREE.NoColorSpace]);
        assert.deepEqual([...colours.image.data.subarray(0, 4)], [...land.image.data], "its colour first");
        assert.deepEqual([...colours.image.data.subarray(4, 8)], [0, 0, 0, 0], "no grass afar of its own");
        assert.deepEqual([...marks.image.data.subarray(0, 8)], [...land.userData.home[0].image.data, ...land.userData.home[1].image.data]);
        assert.equal(marks.image.data[4 + (home & 3)], 255, "the dark elves' in the second map");
        assert.deepEqual([...marks.image.data.subarray(8, 12)], [0, 0, 0, 0], "no farmland");
    });

    it("barely darkens round a lone trunk", () => {
        const { texture, area } = contactOf((x, y) => x === 8 && y === 8, [0, 0, 16]);
        const [x0, y0, across] = area;

        assert.ok(texture.image.data[(8 - y0) * across + (9 - x0)] < 10);
    });
});

describe("the ground under someone standing on it (contacts.js)", () => {
    it("is one instanced mesh of those listed this frame, as wide as they're tall, at their feet", () => {
        const contacts = new ContactShadows();
        const { mesh } = contacts;
        const matrix = new THREE.Matrix4();
        const [at, turn, size] = [new THREE.Vector3(), new THREE.Quaternion(), new THREE.Vector3()];

        contacts.begin();
        contacts.add(3, 0.5, -2, 1.8);
        contacts.add(5, 0, 5, 1.2, 0.5);
        // (Hardly there at all: not drawn)
        contacts.add(9, 0, 9, 1.8, 0.005);
        contacts.end();

        assert.ok(mesh.count === 2 && mesh.visible);
        assert.deepEqual([...mesh.geometry.attributes.contact.array.slice(0, 2)], [1, 0.5]);
        mesh.getMatrixAt(0, matrix);
        matrix.decompose(at, turn, size);
        assert.deepEqual(at.toArray(), [3, 0.5, -2]);
        assert.ok(Math.abs(size.x - 1.8 * CONTACT.across) < 1e-6 && Math.abs(size.z - size.x) < 1e-6 && size.y === 1);
        assert.deepEqual(mesh.instanceMatrix.updateRanges, [{ start: 0, count: 32 }], "only those listed sent");

        // (Next frame, nobody: nothing drawn)
        contacts.begin();
        contacts.end();
        assert.ok(mesh.count === 0 && !mesh.visible);

        // (No more than it has room for)
        contacts.begin();

        for (let k = 0; k < CONTACT.most + 5; k++) {
            contacts.add(k, 0, 0, 1.7);
        }

        contacts.end();
        assert.equal(mesh.count, CONTACT.most);
        contacts.dispose();
    });

    it("darkens as a soft round shadow, faded where it's thinner", () => {
        const { mesh } = new ContactShadows();
        const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader };

        mesh.material.onBeforeCompile(shader);
        assert.ok(shader.vertexShader.includes("vContact = contact;") && shader.fragmentShader.includes("diffuseColor.a *= contactStrength * vContact"), "its shader's lines replace three.js's");
        assert.equal(shader.uniforms.contactStrength.value, CONTACT.strength);
        assert.ok(mesh.material.transparent && !mesh.material.depthWrite && mesh.material.polygonOffset, "over the ground without fighting it");
    });
});
