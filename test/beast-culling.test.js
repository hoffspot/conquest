// Creatures left undrawn out of view (client/js/beasts/beast.js BOUNDS): one sphere round each,
// which its skinned meshes and cape are culled by, holds it however it moves; the wight lord's
// cape isn't blown about out of view; and a creature small on the screen is drawn with fewer
// triangles
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";

// (The creatures' skins paint a canvas: enough of one for them to in Node, every other drawing
// call doing nothing)
const noop = () => {};
const context = () =>
    new Proxy(
        {
            createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
            getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
            createLinearGradient: () => ({ addColorStop: noop }),
            createRadialGradient: () => ({ addColorStop: noop }),
            measureText: (text) => ({ width: String(text).length * 10 }),
        },
        { get: (target, key) => (key in target ? target[key] : noop) },
    );

globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: context }) };

const { BeastAvatar } = await import("../client/js/beasts/beast.js");
const { LOOKS } = await import("../client/js/beasts/looks.js");
const { LODS, Lods } = await import("../client/js/characters/lod.js");

const KINDS = Object.keys(LOOKS).filter((id) => LOOKS[id].body !== "humanoid");
const DT = 1 / 30;
const _point = new THREE.Vector3();

describe("creatures culled out of view (beast.js BOUNDS)", () => {
    it("holds every creature inside its sphere through its walk, run, attacks, rests, flinch, fall and flight, and culls it by it", () => {
        const outside = [];
        let culled = 0;
        let capes = 0;

        for (const id of KINDS) {
            const beast = new BeastAvatar(id, { seed: 1 });
            const scene = new THREE.Scene();
            const skinned = [];

            scene.add(beast.object);
            beast.place(0, 0, 0);
            beast.object.traverse((node) => node.isSkinnedMesh && skinned.push(node));

            for (const mesh of skinned) {
                assert.ok(mesh.frustumCulled && mesh.boundingSphere === beast.bounds, `${id}'s skinned meshes are culled by its sphere`);
            }

            culled += skinned.length;
            capes += beast.plan.cloth ? 1 : 0;

            // Every seventeenth point of it, where its bones have it now: how far out of its sphere
            let worst = 0;
            const check = (doing) => {
                scene.updateMatrixWorld(true);

                for (const mesh of skinned) {
                    const position = mesh.geometry.attributes.position;

                    for (let i = 0; i < position.count; i += 17) {
                        mesh.applyBoneTransform(i, _point.fromBufferAttribute(position, i));

                        const over = _point.distanceTo(beast.bounds.center) - beast.bounds.radius;

                        if (over > worst) {
                            worst = over;
                            outside.push(`${id} ${doing}: ${over.toFixed(2)} out`);
                        }
                    }
                }

                // (A cape's points are where they are, in the same measures)
                const cape = beast.plan.cloth?.geometry.attributes.position;

                for (let i = 0; cape && i < cape.count; i++) {
                    const over = _point.fromBufferAttribute(cape, i).distanceTo(beast.bounds.center) - beast.bounds.radius;

                    if (over > worst) {
                        worst = over;
                        outside.push(`${id}'s cape ${doing}: ${over.toFixed(2)} out`);
                    }
                }
            };
            let x = 0;

            for (const speed of [1.5, 6]) {
                for (let k = 0; k < 40; k++) {
                    x += speed * DT;
                    beast.update(DT, x, 0, 0);

                    if (k % 8 === 0) {
                        check(`moving at ${speed} m/s`);
                    }
                }
            }

            for (const style of beast.plan.attacks ?? []) {
                beast.actions.startAttack(style, { hitAt: 0.4, duration: 0.9, reach: 4 });
                beast.doing.attack.style = style;

                for (let k = 0; k < 28; k++) {
                    beast.update(DT, x, 0, 0, false);

                    if (k % 4 === 0) {
                        check(`attacking (${style})`);
                    }
                }
            }

            for (const name of beast.plan.rests ?? []) {
                beast.rest(name, 2);

                for (let k = 0; k < 45; k++) {
                    beast.update(DT, x, 0, 0);

                    if (k % 15 === 0) {
                        check(`resting (${name})`);
                    }
                }

                beast.resting = null;
            }

            beast.actions.react();

            for (let k = 0; k < 12; k++) {
                beast.update(DT, x, 0, 0);
                check("flinching");
            }

            if (beast.winged) {
                for (const beat of [0, 1]) {
                    for (let k = 0; k < 24; k++) {
                        beast.soar(DT, x, 20, 0, 0, { beat, bank: 0.4, climb: 0.3 });

                        if (k % 4 === 0) {
                            check(`flying (beating ${beat})`);
                        }
                    }
                }
            }

            beast.actions.die({ from: 1 });

            for (let k = 0; k < 45; k++) {
                beast.update(DT, x, 0, 0);

                if (k % 5 === 0) {
                    check("falling dead");
                }
            }
        }

        assert.ok(culled > KINDS.length, "the creatures' skinned meshes are culled");
        assert.ok(capes > 0, "a cape's checked");
        assert.deepEqual(outside, [], outside.join("\n"));
    });

    it("leaves the wight lord's cape as it is out of view, and blows it about again when it's seen", () => {
        const lord = new BeastAvatar("wightLord", { seed: 1 });
        const cape = lord.plan.cloth;
        const scene = new THREE.Scene();
        const points = () => Float32Array.from(cape.geometry.attributes.position.array);
        let x = 0;
        const walk = (frames) => {
            for (let k = 0; k < frames; k++) {
                x += 1.5 * DT;
                lord.update(DT, x, 0, 0);
            }
        };

        scene.add(lord.object);
        lord.place(0, 0, 0);
        assert.ok(cape && cape.frustumCulled && cape.geometry.boundingSphere === lord.bounds, "its cape's culled by its sphere");

        walk(30);

        const blowing = points();

        lord.seen = false;
        walk(30);
        assert.deepEqual(points(), blowing, "out of view, left as it was");

        lord.seen = true;
        walk(5);
        assert.notDeepEqual(points(), blowing, "seen again, blown about");
    });

    it("draws a creature with fewer triangles the smaller it is on the screen, over its very vertices, made once for its kind alike (lowerDetail, fitDetail)", async () => {
        const lods = new Lods();
        const wolf = new BeastAvatar("wolf", { seed: 1 });
        const other = new BeastAvatar("wolf", { seed: 1 });
        const meshes = (beast) => beast.levels.map(({ mesh }) => mesh);
        const counts = (beast) => meshes(beast).map((mesh) => mesh.geometry.index.count);

        wolf.lowerDetail(lods);
        other.lowerDetail(lods);
        await Promise.all(lods.made.values());
        await new Promise((resolve) => setTimeout(resolve, 0));

        const whole = counts(wolf);

        assert.ok(wolf.levels.length > 0 && wolf.levels.every(({ lower }) => lower?.length === LODS.length), "every skinned mesh has each level");

        wolf.fitDetail(LODS[0].below - 1);
        assert.equal(wolf.level, 1);
        counts(wolf).forEach((count, k) => assert.ok(count < whole[k], `mesh ${k}: ${count} of ${whole[k]}`));

        wolf.fitDetail(LODS[1].below - 1);
        assert.equal(wolf.level, 2);

        for (const { mesh, whole: full } of wolf.levels) {
            assert.ok(mesh.geometry.index.count < full.index.count * LODS[0].share * 1.5);
            assert.equal(mesh.geometry.attributes.position, full.attributes.position, "over the whole one's vertices");
            assert.equal(mesh.geometry.attributes.skinIndex, full.attributes.skinIndex);
        }

        // (Up again only past each level's `above`, not at its `below`)
        wolf.fitDetail(LODS[1].below + 1);
        assert.equal(wolf.level, 2);
        wolf.fitDetail(LODS[0].above + 1);
        assert.equal(wolf.level, 0);
        assert.deepEqual(counts(wolf), whole);

        // (Out of view, left as it was)
        wolf.fitDetail(0);
        assert.equal(wolf.level, 0);

        other.fitDetail(1);
        wolf.fitDetail(1);
        meshes(other).forEach((mesh, k) => assert.equal(mesh.geometry, meshes(wolf)[k].geometry, "one of its kind alike shares them"));
        lods.dispose();
    });
});
