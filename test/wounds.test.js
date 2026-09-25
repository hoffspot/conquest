// Battle damage on a character (client/js/world/wounds.js): marks and wounds of each weapon's
// kind, landing where the blow came from, worse below each threshold, gone when healed
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { gunzipSync } from "node:zlib";
import * as THREE from "three";
import { REACTIONS } from "../client/js/characters/actions.js";
import { HumanData } from "../client/js/characters/body.js";
import { Rig } from "../client/js/characters/rig.js";
import { KINDS, stageOf, THRESHOLDS, Wounds } from "../client/js/world/wounds.js";

const manifest = JSON.parse(readFileSync(new URL("../client/characters/human.json", import.meta.url), "utf8"));
const unpacked = gunzipSync(readFileSync(new URL("../client/characters/human.bin", import.meta.url)));
const human = new HumanData(manifest, unpacked.buffer.slice(unpacked.byteOffset, unpacked.byteOffset + unpacked.byteLength));

// One kit for every figure, as in the game (its texel map is worked out once)
const kit = { human };

/** The parts of a Character that wounds use, without its textures (which need a DOM). */
function figure() {
    const { positions } = human.shape({});
    let height = 0;

    for (let v = 0; v < human.vertexCount; v++) {
        if (human.partOf[v] === 0) {
            height = Math.max(height, positions[v * 3 + 1]);
        }
    }

    const body = new THREE.MeshStandardMaterial();
    const tunic = new THREE.MeshStandardMaterial();
    const helmet = new THREE.MeshStandardMaterial({ metalness: 0.8 });

    return {
        kit,
        human,
        positions,
        normals: human.normals(positions),
        height,
        rig: new Rig(human.bones),
        materials: { body },
        mesh: { material: [body, new THREE.MeshStandardMaterial()] },
        garments: [new THREE.Mesh(new THREE.BufferGeometry(), tunic), new THREE.Mesh(new THREE.BufferGeometry(), helmet)],
        shared: { tunic, helmet },
        look: { skin: { tone: "#c28560" } },
    };
}

// How much of each channel (blood, bruising, char, cut) a character's damage has
function channels(wounds) {
    const sums = [0, 0, 0, 0];

    for (let i = 0; i < wounds.data.length; i++) {
        sums[i % 4] += wounds.data[i];
    }

    return { blood: sums[0], bruise: sums[1], char: sums[2], cut: sums[3] };
}

// Blows from `reaction` taking a character from full health down through `hps` (of 50)
function beat(wounds, reaction, hps, from = 0) {
    let before = 50;

    return hps.map((hp) => {
        const landed = wounds.hit({ reaction, from, hp, maxHp: 50, before });

        before = hp;

        return landed;
    });
}

describe("battle damage (wounds.js)", () => {
    it("gets worse below three quarters, half and a quarter of a character's hit points", () => {
        assert.deepEqual(THRESHOLDS, [0.75, 0.5, 0.25]);
        assert.deepEqual([50, 38, 37.5, 37, 25, 24, 12.5, 12, 0].map((hp) => stageOf(hp, 50)), [0, 0, 0, 1, 1, 2, 2, 3, 3]);
    });

    it("has a kind of damage for every weapon's blow", () => {
        for (const reaction of Object.keys(REACTIONS)) {
            assert.ok(KINDS[reaction], reaction);
        }
    });

    it("leaves a mark every blow, and a wound for each threshold a blow takes it below", () => {
        const wounds = new Wounds(figure());

        const [nick] = beat(wounds, "slash", [45]);

        assert.equal(nick.mark, true);
        assert.equal(nick.stage, 0);
        assert.equal(wounds.stage, 0);

        // Down past three quarters: a wound; then past a half and a quarter at once: two more
        wounds.hit({ reaction: "slash", from: 0, hp: 30, maxHp: 50, before: 45 });
        wounds.hit({ reaction: "slash", from: 0, hp: 10, maxHp: 50, before: 30 });

        assert.deepEqual(wounds.list.map((wound) => [wound.mark, wound.stage]), [[true, 0], [false, 1], [false, 2], [false, 3]]);
        assert.equal(wounds.stage, 3);

        // Another blow down there: a mark, of that stage
        wounds.hit({ reaction: "slash", from: 0, hp: 5, maxHp: 50, before: 10 });
        assert.deepEqual(wounds.list.at(-1).mark, true);
        assert.deepEqual(wounds.list.at(-1).stage, 3);
    });

    it("paints each kind of blow its own way: cuts bleed, blunt blows bruise, fire chars, arcane light leaves veins", () => {
        const look = {};

        for (const reaction of Object.keys(KINDS)) {
            const wounds = new Wounds(figure(), { seed: 5 });

            beat(wounds, reaction, [40, 30, 20]);
            look[reaction] = channels(wounds);
        }

        for (const cut of ["slash", "hack"]) {
            assert.ok(look[cut].cut > 0 && look[cut].blood > look[cut].bruise, cut);
            assert.equal(look[cut].char, 0, cut);
        }

        // A cleaver's gashes are bigger than a sword's cuts
        assert.ok(look.hack.cut > look.slash.cut);

        assert.ok(look.pierce.blood > 0 && look.pierce.cut > 0);

        for (const blunt of ["crush", "strike", "punch"]) {
            assert.ok(look[blunt].bruise > 0, blunt);
            assert.equal(look[blunt].char, 0, blunt);
        }

        // Burns: charred, never bloody
        assert.ok(look.fire.char > look.fire.bruise);
        assert.equal(look.fire.blood, 0);

        assert.ok(look.arcane.bruise > 0 && look.arcane.char > 0);
    });

    it("lands where the blow came from, on the body (not the hands or head), at its kind's height", () => {
        const character = figure();
        const wounds = new Wounds(character, { seed: 3 });
        const facing = (wound) => character.normals[wound.vertex * 3 + 2];
        const bone = (wound) => human.bones[human.skinIndices[wound.vertex * 4]].name;

        const ahead = beat(wounds, "slash", [45, 40, 35, 30, 28, 26, 24]);
        const behind = beat(new Wounds(character, { seed: 4 }), "slash", [45, 40, 35, 30, 28, 26, 24], Math.PI);

        assert.ok(ahead.every((wound) => facing(wound) > 0), "in front, from the front");
        assert.ok(behind.every((wound) => facing(wound) < 0), "behind, from behind");

        const punches = beat(new Wounds(character, { seed: 6 }), "punch", [45, 40, 35, 30, 28, 26, 24]);

        for (const wound of [...ahead, ...behind, ...punches]) {
            const [low, high] = KINDS[wound.kind].heights;
            const share = character.positions[wound.vertex * 3 + 1] / character.height;

            assert.ok(share >= low && share <= high, `${wound.kind} at ${share.toFixed(2)}`);
            assert.doesNotMatch(bone(wound), /Hand|Head/);
        }
    });

    it("heals: back above a threshold, that stage's wounds and marks are gone, with their arrows; fully, all of them", () => {
        const wounds = new Wounds(figure());
        const arrows = [];

        for (const landed of beat(wounds, "pierce", [45, 30, 20, 10, 8])) {
            const arrow = new THREE.Group();

            new THREE.Group().add(arrow);
            wounds.keep(landed, arrow);
            arrows.push(arrow);
        }

        assert.equal(wounds.stage, 3);

        // Up to 30: a quarter and a half passed again, three quarters not
        wounds.heal(30, 50);
        assert.ok(wounds.list.length > 0);
        assert.ok(wounds.list.every((wound) => wound.stage <= 1));
        assert.equal(wounds.stage, 1);
        assert.deepEqual(
            arrows.map((arrow) => Boolean(arrow.parent)),
            [true, true, false, false, false],
        );

        const left = channels(wounds);

        assert.ok(left.cut > 0 && left.blood > 0);

        wounds.heal(50, 50);
        assert.equal(wounds.list.length, 0);
        assert.deepEqual(channels(wounds), { blood: 0, bruise: 0, char: 0, cut: 0 });
        assert.ok(arrows.every((arrow) => !arrow.parent));
    });

    it("is gone when they come back to life, burns and all", () => {
        const wounds = new Wounds(figure());

        beat(wounds, "fire", [40, 30, 20]);
        assert.equal(wounds.smouldering.length > 0, true);

        wounds.clear();
        assert.equal(wounds.list.length, 0);
        assert.equal(wounds.smouldering.length, 0);
        assert.equal(wounds.data.some((value) => value > 0), false);
    });

    it("burns smoulder and arcane veins glow a few seconds, then fade", () => {
        const wounds = new Wounds(figure());

        beat(wounds, "fire", [40]);
        beat(wounds, "arcane", [35]);
        wounds.update(0.1);
        assert.ok(wounds.uniforms.fireGlow.value > 0);
        assert.ok(wounds.uniforms.arcaneGlow.value > 0);

        for (let t = 0; t < 6; t += 0.1) {
            wounds.update(0.1);
        }

        assert.equal(wounds.uniforms.fireGlow.value, 0);
        assert.equal(wounds.uniforms.arcaneGlow.value, 0);
        assert.equal(wounds.smouldering.length, 0);
    });

    it("keeps no more than eight arrows in anyone, the oldest going first", () => {
        const wounds = new Wounds(figure());
        const arrows = beat(wounds, "pierce", [48, 46, 44, 42, 40, 39, 38, 38, 38, 38]).map((landed) => {
            const arrow = new THREE.Group();

            new THREE.Group().add(arrow);
            wounds.keep(landed, arrow);

            return arrow;
        });

        assert.deepEqual(
            arrows.map((arrow) => Boolean(arrow.parent)),
            [false, false, true, true, true, true, true, true, true, true],
        );
    });

    it("mixes the damage into the body's material and a copy of each garment's (shared with others who wear it), metal its own way", () => {
        const character = figure();
        const { tunic, helmet } = character.shared;
        const wounds = new Wounds(character);

        assert.equal(character.materials.body.customProgramCacheKey(), "wounded-skin");
        assert.equal(character.mesh.material[0], character.materials.body);
        assert.notEqual(character.garments[0].material, tunic);
        assert.equal(character.garments[0].material.customProgramCacheKey(), "wounded-cloth");
        assert.equal(character.garments[1].material.customProgramCacheKey(), "wounded-metal");
        assert.equal(tunic.onBeforeCompile.toString().includes("damageMap"), false);

        // Every frame, nothing more is copied; a new garment is
        const copy = character.garments[0].material;

        wounds.update(0.016);
        assert.equal(character.garments[0].material, copy);

        character.garments.push(new THREE.Mesh(new THREE.BufferGeometry(), helmet));
        wounds.update(0.016);
        assert.equal(character.garments[2].material, character.garments[1].material);

        // The skin under torn clothes: the character's own tone
        assert.equal(wounds.uniforms.skinTone.value.getHexString(), new THREE.Color("#c28560").getHexString());
    });
});
