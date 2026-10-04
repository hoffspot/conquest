// The gold in an open chest (client/js/world/gold3d.js; the user: "The gold can look better... how
// to create a realistic pile of gold"): coins let fall onto a heap, lying over one another as
// coins do, drawn as a few instanced meshes, fewer sides further off and none far off, lit as gold
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import { drawGold, GOLD, goldLit, goldParts, heapOfCoins } from "../client/js/world/gold3d.js";

const { inside, radius, thickness } = GOLD;
const inChest = (coin) => Math.abs(coin.position.x) <= inside.x && Math.abs(coin.position.z) <= inside.z;

describe("coins let fall in a heap (heapOfCoins)", () => {
    it("cover the chest's inside, resting on the heap or other coins, heaped over the rim in the middle", () => {
        const heap = heapOfCoins(1);
        const coins = heap.coins.filter(inChest);
        let [covered, places] = [0, 0];

        for (let u = -inside.x * 0.9; u <= inside.x * 0.9; u += 0.01) {
            for (let v = -inside.z * 0.9; v <= inside.z * 0.9; v += 0.01) {
                places++;
                covered += coins.some((coin) => Math.hypot(coin.position.x - u, coin.position.z - v) <= radius * 0.95) ? 1 : 0;
            }
        }

        assert.ok(coins.length > 300, `${coins.length}`);
        assert.ok(covered / places > 0.7, `${covered} of ${places}`);
        // (None sunk in the heap; none floating over what's under it)
        assert.ok(coins.every((coin) => coin.position.y >= heap.under(coin.position.x, coin.position.z) - thickness));
        assert.ok(coins.every((coin) => coin.position.y <= heap.height(coin.position.x, coin.position.z) + radius));
        assert.ok(Math.max(...coins.map((coin) => coin.position.y)) > GOLD.rim.height);
        assert.ok(Math.max(...coins.map((coin) => coin.position.y)) < GOLD.rim.height + 0.07);
    });

    it("lie as coins heaped up do: most nearly flat, a few on edge; a few spilt on the rim and the ground", () => {
        const heap = heapOfCoins(1);
        const coins = heap.coins.filter(inChest);
        const onEdge = coins.filter((coin) => coin.normal.y < 0.6).length;
        const flat = coins.filter((coin) => coin.normal.y > Math.cos(Math.atan(GOLD.slope + 0.18))).length;

        assert.equal(flat + onEdge, coins.length);
        assert.ok(onEdge >= 2 && onEdge < coins.length * 0.05, `${onEdge}`);
        assert.equal(heap.coins.length - coins.length, GOLD.spilt.rim + GOLD.spilt.ground);
        const spilt = heap.coins.filter((coin) => !inChest(coin));

        assert.equal(spilt.filter((coin) => Math.abs(coin.position.y - GOLD.rim.height - thickness / 2) < 0.001).length, GOLD.spilt.rim);
        assert.equal(spilt.filter((coin) => coin.position.y < thickness).length, GOLD.spilt.ground);
    });

    it("the same for the same seed, another for another", () => {
        const where = (seed) => heapOfCoins(seed).coins.map((coin) => coin.position.toArray());

        assert.deepEqual(where(3), where(3));
        assert.notDeepEqual(where(3), where(4));
    });
});

describe("the gold drawn (goldParts, drawGold)", () => {
    const parts = goldParts(1);
    const triangles = (geometry) => (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;

    it("near, the coins, gems, goblet and glints, a draw each, the coins fewer-sided further off; far off, the heap alone", () => {
        const gold = drawGold(parts);
        const lod = gold.children.find((child) => child.isLOD);
        const [near, further, far] = lod.levels;
        const coins = (level) => level.object.getObjectByName("coins");

        assert.ok(gold.getObjectByName("gold-heap").isMesh);
        assert.deepEqual(lod.levels.map(({ distance }) => distance), [0, GOLD.fewer, GOLD.near]);
        assert.deepEqual(near.object.children.map(({ name }) => name), ["coins", "gems", "goblet", "glints"]);
        assert.equal(far.object.children.length, 0);
        assert.equal(coins(near).count, heapOfCoins(1).coins.length);
        assert.ok(coins(near).geometry === parts.coin && coins(further).geometry === parts.fewer);
        // (Where each lies, made once for every chest's)
        assert.equal(coins(near).instanceMatrix, coins(further).instanceMatrix);
        assert.equal(coins(near).instanceMatrix, coins(drawGold(parts).children[1].levels[0]).instanceMatrix);
        // (Nothing casting shadows)
        gold.traverse((node) => assert.ok(!node.castShadow, node.name));
    });

    it("within a phone's budget: about 15,000 triangles near, 9,000 further off", () => {
        const near = triangles(parts.coin) * parts.coins.count + triangles(parts.gem) * parts.gems.count + triangles(parts.cup);
        const further = triangles(parts.fewer) * parts.coins.count + triangles(parts.gem) * parts.gems.count + triangles(parts.cup);

        assert.ok(near < 18000, `${near}`);
        assert.ok(further < 11000, `${further}`);
        assert.ok(triangles(parts.heap) < 1200);
    });

    it("lit as gold: the sky it reflects less blue and warmer, the light among the coins, no smoother than it can be seen", () => {
        const material = goldLit(new THREE.MeshStandardMaterial({ metalness: 1 }));
        const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };

        material.onBeforeCompile(shader);

        assert.match(shader.fragmentShader, /radiance = mix\(vec3\(dot\(radiance/);
        assert.match(shader.fragmentShader, /indirectSpecular \+= \(irradiance \+ iblIrradiance\) \* material\.specularColorBlended/);
        assert.match(shader.fragmentShader, /roughnessFactor = sqrt\(sqrt\(/);
        // (And by the fires near, as all else)
        assert.match(shader.fragmentShader, /fireAt\[/);
    });
});
