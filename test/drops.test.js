// Things lying on the ground, tapped to pick them up (client/js/world/drops3d.js `at`): found by a
// tap anywhere from where they lie up to their top, their icon over them (a chest stands up off
// the ground, its lid well over where it lies seen close, as indoors). Each thing dropped floats
// just off the ground, bobbing a few centimetres, over a ring glowing the colour of how rare it is.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import * as THREE from "three";
import { Drops, FLOAT, RARITY_GLOW, shownOf } from "../client/js/world/drops3d.js";
import { QUALITIES } from "../client/js/core/progress.js";

describe("tapping something lying on the ground (drops3d.js)", () => {
    // (A camera 4 m back from a chest, 2.4 m up, as indoors under the ceiling, on a screen 1280 by
    // 720; the chest 0.7 m high where it stands, and a tap on its lid)
    const camera = new THREE.PerspectiveCamera(36, 1280 / 720, 0.3, 100);

    camera.position.set(0, 2.4, 4);
    camera.lookAt(0, 0.8, 0);
    camera.updateMatrixWorld();

    const toScreen = (point) => {
        const projected = point.clone().project(camera);

        return projected.z > 1 ? null : { x: ((projected.x + 1) / 2) * 1280, y: ((1 - projected.y) / 2) * 720 };
    };
    const chest = new THREE.Group();

    chest.add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 0.46).translate(0, 0.35, 0)));
    chest.updateMatrixWorld();

    const drawn = { drawn: new Map([["chest-1", { object: chest, icon: null }]]) };
    const lid = toScreen(new THREE.Vector3(0, 0.6, 0));
    const foot = toScreen(new THREE.Vector3(0, 0, 0));

    it("finds a chest seen close by a tap on its lid, well over where it lies; not by one off to the side", () => {
        // (Its lid's further from its foot on the screen than a tap's reach from either)
        assert.ok(Math.hypot(lid.x - foot.x, lid.y - foot.y) > 40 * 2, `${Math.round(Math.hypot(lid.x - foot.x, lid.y - foot.y))} px`);
        assert.equal(Drops.prototype.at.call(drawn, lid.x, lid.y, toScreen), "chest-1");
        assert.equal(Drops.prototype.at.call(drawn, foot.x, foot.y, toScreen), "chest-1");
        assert.equal(Drops.prototype.at.call(drawn, lid.x + 200, lid.y, toScreen), null);
    });
});

describe("loot lying on the ground: each thing floating over its rarity's glow (drops3d.js)", () => {
    const wolf = { id: "g1", bundle: { gold: 5, items: [{ id: "sword", count: 1, quality: "legendary" }, { id: "wolfPelt", count: 2 }] }, for: "player", map: "town", square: [3, 4] };
    const laid = (ground) => {
        const drops = new Drops(new THREE.Scene(), { picture: () => new THREE.Texture() });

        drops.sync(new Map(ground.map((dropped) => [dropped.id, dropped])), { map: "town", near: { x: 0, z: 0 }, reach: 50, originOf: () => [0, 0], mine: "player" });
        drops.update(0);

        return drops;
    };

    it("shows each thing in a bundle on its own, its gold too, each as rare as it is", () => {
        assert.deepEqual(shownOf(wolf), [
            { id: "gold", grade: "common" },
            { id: "sword", grade: "legendary" },
            { id: "wolfPelt", grade: "common" },
        ]);
        assert.deepEqual(shownOf({ item: { id: "ring", quality: "rare", count: 1 } }), [{ id: "ring", grade: "rare" }]);

        const { things } = laid([wolf]).drawn.get("g1");

        assert.equal(things.length, 3);
        assert.deepEqual(things.map(({ ring }) => ring.material.color.getHex()), [RARITY_GLOW.common, RARITY_GLOW.legendary, RARITY_GLOW.common]);
        // (Apart from one another, round where it lies)
        assert.ok(things.every(({ icon }, k) => things.every((other, j) => j === k || icon.position.distanceTo(other.icon.position) > FLOAT.size * 0.6)));
    });

    it("glows each rarity in the pack's own colour for it (styles.css .rarity-*), every rarity its own", () => {
        const css = readFileSync(new URL("../client/styles.css", import.meta.url), "utf8");

        assert.deepEqual(Object.keys(RARITY_GLOW).sort(), Object.keys(QUALITIES).sort());

        for (const grade of Object.keys(QUALITIES).filter((each) => each !== "common")) {
            const colour = css.match(new RegExp(`\\.rarity-${grade} \\{\\s*--rarity: #([0-9a-f]{6});`))?.[1];

            assert.equal(RARITY_GLOW[grade], Number.parseInt(colour, 16), grade);
        }

        assert.equal(new Set(Object.values(RARITY_GLOW)).size, Object.keys(RARITY_GLOW).length);
    });

    it("bobs each a few centimetres up and down, never down to the ground, each in its own time", () => {
        const drops = laid([wolf]);
        const { object, things } = drops.drawn.get("g1");
        const feet = things.map(() => []);

        for (let time = 0; time < 6; time += 0.05) {
            drops.update(time);
            things.forEach(({ icon }, k) => feet[k].push(icon.position.y - icon.userData.ground - FLOAT.size / 2));
        }

        for (const foot of feet) {
            assert.ok(Math.min(...foot) > 0.01, `its foot ${Math.min(...foot).toFixed(3)} m off the ground at the lowest`);
            assert.ok(Math.max(...foot) - Math.min(...foot) >= 0.03 && Math.max(...foot) - Math.min(...foot) <= 0.08, "a few centimetres");
            assert.ok(Math.max(...foot) < 0.15, "just off the ground");
        }

        assert.notEqual(feet[0][10].toFixed(4), feet[1][10].toFixed(4), "not all in step");
        assert.ok(object.children.some((child) => child.isMesh && child.position.y < 0.05), "its ring on the ground");
    });

    it("is found by a tap on any of its things, and drawn again with fewer once some's taken", () => {
        const camera = new THREE.PerspectiveCamera(50, 1280 / 720, 0.3, 100);

        camera.position.set(3.5, 3, 9);
        camera.lookAt(3.5, 0, 4.5);
        camera.updateMatrixWorld();

        const toScreen = (point) => {
            const projected = point.clone().project(camera);

            return projected.z > 1 ? null : { x: ((projected.x + 1) / 2) * 1280, y: ((1 - projected.y) / 2) * 720 };
        };
        const drops = laid([wolf]);
        const { things } = drops.drawn.get("g1");

        drops.group.updateMatrixWorld(true);

        for (const { icon } of things) {
            const at = toScreen(icon.getWorldPosition(new THREE.Vector3()));

            assert.equal(drops.at(at.x, at.y, toScreen), "g1");
        }

        assert.equal(drops.at(5, 5, toScreen), null);

        // (The sword taken by auto-snag: the gold and the pelts left, drawn again)
        const left = { ...wolf, bundle: { gold: 5, items: [wolf.bundle.items[1]] } };

        drops.sync(new Map([["g1", left]]), { map: "town", near: { x: 0, z: 0 }, reach: 50, originOf: () => [0, 0], mine: "player" });
        assert.deepEqual(drops.drawn.get("g1").things.map(({ icon }) => icon.name), ["gold:common", "wolfPelt:common"]);
    });
});
