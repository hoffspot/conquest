// Soldiers in their crowds (client/js/world/crowd.js): a kind's figure merged from one of them,
// bound to its skeleton so that posed as the moves recorded have it, every corner of it is where
// the character's own would be; its moves recorded; and one drawn in a crowd posed as it's doing:
// on guard, walking or running with its stride, striking, flinching, falling and lying
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readHumanFiles } from "../scripts/lib/human-data.js";

// (Pictures put on a canvas: enough of one for that in Node)
globalThis.ImageData ??= class {
    constructor(data, width, height) {
        Object.assign(this, { data, width, height });
    }
};

globalThis.document ??= {
    createElement: () => {
        const canvas = { width: 0, height: 0, style: {}, _data: null };
        const context = {
            putImageData: (image) => (canvas._data = image.data),
            getImageData: (x, y, w, h) => ({ data: canvas._data ?? new Uint8ClampedArray(w * h * 4), width: w, height: h }),
            createImageData: (w, h) => new globalThis.ImageData(new Uint8ClampedArray(w * h * 4), w, h),
            createLinearGradient: () => ({ addColorStop() {} }),
            createRadialGradient: () => ({ addColorStop() {} }),
            measureText: () => ({ width: 10 }),
        };

        canvas.getContext = () => new Proxy(context, { get: (target, key) => (key in target ? target[key] : () => {}) });

        return canvas;
    },
};

const THREE = await import("three");
const { HumanData } = await import("../client/js/characters/body.js");
const { Character } = await import("../client/js/characters/character.js");
const { SkinAtlas } = await import("../client/js/characters/skin.js");
const { soldierLook } = await import("../client/js/characters/soldiers.js");
const { allAtOnce, WAITING } = await import("../client/js/core/steps.js");
const { WEAPONS } = await import("../client/js/core/weapons.js");
const { Avatar } = await import("../client/js/world/avatar.js");
const { AS, CROWD, CROWD_CASTS, CROWD_KEEP, CROWD_PARTS, CROWD_SETS, Crowd, CrowdAvatar, figureOf, offstage, OFFSTAGE, onstage, recordingMoves, templateFrom } = await import("../client/js/world/crowd.js");
const { folkFigureLook } = await import("../client/js/characters/folkcrowd.js");
const { released } = await import("../client/js/world/release.js");

const humanFiles = readHumanFiles();
const human = new HumanData(humanFiles.manifest, humanFiles.data);
const kit = { human, atlas: new SkinAtlas(human, {}, 128) };

// A human soldier with a sword and shield (and helm), drawn, standing on guard
function soldier() {
    const look = soldierLook({ people: "human", weapon: "sword", seed: 3 });
    const character = new Character(kit, { shape: look.shape, look: look.look, equipment: look.equipment, hairDetail: 0.2, merge: true });

    character.sheathe(false);

    const avatar = new Avatar(character, { walk: look.walk, guard: "sword" });

    avatar.place(0, 0, 0);
    avatar.actions.setGuard(true);

    for (let k = 0; k < 10; k++) {
        avatar.update(1 / 20, 0, 0, 0, true);
    }

    return { character, look };
}

// Where every corner of everything drawn of a character is now, in its body's space: { points (xyz
// in turn), count }
function cornersOf(character) {
    const object = character.object;
    const toObject = new THREE.Matrix4().copy(object.matrixWorld).invert();
    const points = [];
    const at = new THREE.Vector3();

    object.updateMatrixWorld(true);
    object.traverse((mesh) => {
        let shown = mesh.isMesh;

        for (let up = mesh; shown && up && up !== object; up = up.parent) {
            shown = up.visible;
        }

        if (!shown) {
            return;
        }

        const geometry = mesh.geometry;
        const used = new Set(geometry.index ? geometry.index.array : geometry.attributes.position.array.keys());

        for (const v of used) {
            if (v >= geometry.attributes.position.count) {
                continue;
            }

            if (mesh.isSkinnedMesh) {
                mesh.getVertexPosition(v, at);
            } else {
                at.fromBufferAttribute(geometry.attributes.position, v);
            }

            at.applyMatrix4(mesh.matrixWorld).applyMatrix4(toObject);
            points.push(at.x, at.y, at.z);
        }
    });

    return points;
}

// The figure's corners posed as the character's skeleton is now (each bone's skinning, in the
// body's space, as the moves are recorded): xyz in turn
function posedFigure(character, geometry) {
    const object = character.object;
    const skeleton = character.rig.skeleton;
    const toObject = new THREE.Matrix4().copy(object.matrixWorld).invert();

    object.updateMatrixWorld(true);

    const skins = skeleton.bones.map((bone, i) => new THREE.Matrix4().multiplyMatrices(toObject, bone.matrixWorld).multiply(skeleton.boneInverses[i]));
    const { position, crowdBones, crowdWeights } = geometry.attributes;
    const points = [];
    const at = new THREE.Vector3();
    const sum = new THREE.Vector3();

    for (let v = 0; v < position.count; v++) {
        sum.set(0, 0, 0);

        for (let k = 0; k < 4; k++) {
            const weight = crowdWeights.getComponent(v, k);

            if (weight > 0) {
                sum.addScaledVector(at.fromBufferAttribute(position, v).applyMatrix4(skins[crowdBones.getComponent(v, k)]), weight);
            }
        }

        points.push(sum.x, sum.y, sum.z);
    }

    return points;
}

// How far each of `points` is from the nearest of `among` (both xyz in turn), at most; Infinity
// for one further than `within` (metres) from all of them, as far as it looks
function furthestFrom(points, among, within = 0.01) {
    const cell = within;
    const grid = new Map();
    const key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;

    for (let k = 0; k < among.length; k += 3) {
        const at = key(among[k], among[k + 1], among[k + 2]);

        grid.set(at, [...(grid.get(at) ?? []), k]);
    }

    let worst = 0;

    for (let k = 0; k < points.length; k += 3) {
        const [x, y, z] = [points[k], points[k + 1], points[k + 2]];
        let best = Infinity;

        for (let dz = -1; dz <= 1; dz++) {
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    for (const j of grid.get(key(x + dx * cell, y + dy * cell, z + dz * cell)) ?? []) {
                        best = Math.min(best, Math.hypot(among[j] - x, among[j + 1] - y, among[j + 2] - z));
                    }
                }
            }
        }

        worst = Math.max(worst, best);
    }

    return worst;
}

describe("a kind's figure (crowd.js figureOf)", () => {
    it("merges everything drawn of a soldier, its sword, shield and helm too, into one mesh bound to its skeleton", () => {
        const { character } = soldier();
        const { geometry, picture, height } = figureOf(character, 64);
        const { position, normal, uv, color, crowdBones, crowdWeights } = geometry.attributes;
        const bones = character.rig.skeleton.bones.length;

        assert.ok(position.count > 1000, `${position.count} corners`);

        for (const attribute of [normal, uv, color, crowdBones, crowdWeights]) {
            assert.equal(attribute.count, position.count);
        }

        for (let v = 0; v < position.count; v++) {
            const weights = [0, 1, 2, 3].map((k) => crowdWeights.getComponent(v, k));

            assert.ok(Math.abs(weights.reduce((a, b) => a + b, 0) - 1) < 0.02, `corner ${v}'s weights add up to 1`);
            assert.ok([0, 1, 2, 3].every((k) => crowdBones.getComponent(v, k) < bones), `corner ${v}'s bones are the skeleton's`);
            assert.ok(uv.getX(v) >= 0 && uv.getX(v) <= 1 && uv.getY(v) >= 0 && uv.getY(v) <= 1);
        }

        // (Its picture: its skin's and its clothes' side by side, its hair's below)
        assert.equal(picture.image.width, 128);
        assert.ok(picture.image.height > 64);
        assert.ok(height > 1.5 && height < 2.2, `${height} m tall`);
    });

    it("is where the soldier is, corner for corner, posed as it was merged and posed anew, its weapon in its hand", () => {
        const { character, look } = soldier();
        const { geometry } = figureOf(character, 64);

        assert.ok(furthestFrom(posedFigure(character, geometry), cornersOf(character)) < 0.002, "as merged");

        // (Mid-swing: every corner, the sword's and shield's too, still the character's)
        const avatar = new Avatar(character, { walk: look.walk, guard: "sword" });

        avatar.place(0, 0, 0);
        avatar.actions.setGuard(true);
        avatar.actions.startAttack("sword", { hitAt: 0.38, duration: 0.76 });

        for (let k = 0; k < 7; k++) {
            avatar.update(1 / 20, 0, 0, 0, true);
        }

        assert.ok(furthestFrom(posedFigure(character, geometry), cornersOf(character)) < 0.002, "mid-swing");
    });
});

describe("a kind's figure carrying its weapon in hand and put away (crowd.js figureOf stowed)", () => {
    it("has its sword and shield put away too, each corner marked which it is: in hand where the soldier holds them, put away where the soldier puts them, the shield across its back", () => {
        const { character, look } = soldier();
        const { geometry } = figureOf(character, 64, { stowed: true });
        const { crowdSet, crowdSurface, position } = geometry.attributes;
        const of = (set) => Array.from({ length: crowdSet.count }, (_, v) => v).filter((v) => crowdSet.getX(v) === set);
        const pointsOf = (points, corners) => corners.flatMap((v) => [points[v * 3], points[v * 3 + 1], points[v * 3 + 2]]);

        assert.equal(crowdSet.count, position.count);
        assert.equal(character.sheathed, false, "its weapons in hand again, as it was");

        for (const set of Object.values(CROWD_SETS)) {
            assert.ok(of(set).length > 30, `some corners of set ${set}`);
        }

        assert.equal(of(CROWD_SETS.weaponHeld).length, of(CROWD_SETS.weaponAway).length, "the same sword, twice");
        assert.equal(of(CROWD_SETS.shieldHeld).length, of(CROWD_SETS.shieldAway).length);

        // In hand: its body and what's in hand where the soldier's are, posed anew
        const avatar = new Avatar(character, { walk: look.walk, guard: "sword" });
        const held = [...of(CROWD_SETS.always), ...of(CROWD_SETS.weaponHeld), ...of(CROWD_SETS.shieldHeld)];

        avatar.place(0, 0, 0);
        avatar.actions.setGuard(true);

        for (let k = 0; k < 7; k++) {
            avatar.update(1 / 20, 0, 0, 0, true);
        }

        assert.ok(furthestFrom(pointsOf(posedFigure(character, geometry), held), cornersOf(character)) < 0.002, "in hand");

        // Put away: its body and what's put away where the soldier's are, the shield on its back
        character.sheathe(true);
        avatar.actions.setGuard(false);

        for (let k = 0; k < 12; k++) {
            avatar.update(1 / 20, 0, 0, 0, true);
        }

        const posed = posedFigure(character, geometry);

        const corners = cornersOf(character);

        assert.ok(furthestFrom(pointsOf(posed, [...of(CROWD_SETS.always), ...of(CROWD_SETS.weaponAway)]), corners) < 0.002, "put away");

        // (The shield slung where it's slung, but for the centimetre or so a body keeps what it
        // carries clear of itself by as it moves, which a figure's can't: as far as it's moved,
        // looked for as far off as that may be, not the centimetre the rest are looked for within)
        const slung = furthestFrom(pointsOf(posed, of(CROWD_SETS.shieldAway)), corners, 0.03);

        assert.ok(slung < 0.03, `the shield ${(slung * 100).toFixed(1)} cm out`);

        const shield = new THREE.Box3().setFromArray(pointsOf(posed, of(CROWD_SETS.shieldAway)));
        const chest = new THREE.Box3().setFromArray(pointsOf(posed, of(CROWD_SETS.always)));

        assert.ok(shield.max.z < chest.getCenter(new THREE.Vector3()).z, "the shield behind it (it faces +z)");

        // (Shining as what it's of: the blade and the shield's rim metal, not chalk)
        const metal = (corners) => corners.reduce((sum, v) => sum + crowdSurface.getX(v), 0) / corners.length;

        assert.ok(metal(of(CROWD_SETS.weaponHeld)) > 0.5, "the sword mostly metal");
        assert.ok(crowdSurface.count === position.count && [...crowdSurface.array].every((value) => value >= 0 && value <= 1));
        character.sheathe(false);
    });

    it("is merged with nothing put away but what's in hand, and nothing marked, unless it's asked", () => {
        const { character } = soldier();
        const { geometry } = figureOf(character, 64);

        assert.ok([...geometry.attributes.crowdSet.array].every((set) => set === CROWD_SETS.always || set === CROWD_SETS.weaponHeld || set === CROWD_SETS.shieldHeld));
        assert.equal([...geometry.attributes.crowdSet.array].filter((set) => set === CROWD_SETS.weaponAway).length, 0);
    });
});

describe("a character's skin let go of once it's sent (character.js release)", () => {
    it("lets go of the page's copy of its skin and bumps as they're sent, if it's one of the game's; painted again, they're sent and let go of again; and a figure's still merged from it", () => {
        const look = soldierLook({ people: "human", weapon: "sword", seed: 5 });
        const kept = new Character(kit, { shape: look.shape, look: look.look, equipment: look.equipment, hairDetail: 0.2, merge: true });
        const character = new Character(kit, { shape: look.shape, look: look.look, equipment: look.equipment, hairDetail: 0.2, merge: true, release: true });
        const { map, bumpMap } = character.materials.body;
        // (Sent to the graphics card, as three.js tells once it has: its onUpdate)
        const send = (texture) => texture.onUpdate?.(texture);

        assert.ok(map.image.data && bumpMap.image.data, "kept till it's sent");

        for (const texture of [map, bumpMap, kept.materials.body.map]) {
            send(texture);
        }

        assert.equal(map.image.data, null);
        assert.equal(bumpMap.image.data, null);
        assert.equal(released.any, true, "the page loads again if the drawing's lost (main.js)");
        assert.ok(kept.materials.body.map.image.data, "not one that isn't the game's (the lab's)");
        assert.equal(character.skinCanvas, null);

        // (Painted again, the same texture's given the new picture, sent, and let go of again)
        const version = map.version;

        character.setLook({ ...look.look, skin: { ...look.look.skin, tone: "#5a3a2a" } });
        assert.equal(character.materials.body.map, map);
        assert.ok(map.image.data && map.version > version, "the new picture, to send");
        send(map);
        assert.equal(map.image.data, null);

        // (Merged into a crowd's figure: its skin's place left as its colour, not painted from
        // pixels it no longer has)
        character.sheathe(false);

        const { geometry, picture } = figureOf(character, 64);

        assert.ok(geometry.attributes.position.count > 1000);
        assert.equal(picture.image.width, 128);
    });
});

describe("a kind's moves (crowd.js recordingMoves)", () => {
    it("records its guard, standing ready and at ease, onto guard and off it, walking, strolling, running, a blow, a cast (for one that casts), a flinch, drawing and putting away, and its fall, each so many times a second", () => {
        const { character, look } = soldier();
        const recorded = allAtOnce(recordingMoves(character, { walk: look.walk, guard: "sword", attack: WEAPONS.sword.attacks[0], reaction: "slash", cast: CROWD_CASTS.grimoire }));
        const { moves, width, rows, data, flags } = recorded;
        const bones = character.rig.skeleton.bones.length;

        assert.equal(width, bones * 3 + 1, "three texels a bone, and its flags");
        assert.equal(flags, bones * 3);
        assert.equal(data.length, width * 4 * rows);
        assert.deepEqual(Object.keys(moves).sort(), ["attack", "cast", "die", "draw", "guard", "hit", "lower", "ready", "rise", "run", "sheathe", "stand", "stroll", "walk"]);

        // (Each after the last, every row one of them)
        let next = 0;

        for (const [name, move] of Object.entries(moves).sort((a, b) => a[1].start - b[1].start)) {
            assert.equal(move.start, next, `${name} follows the last`);
            assert.ok(move.frames > 3, `${name}: ${move.frames} frames`);
            assert.ok(Math.abs(move.length - move.frames / CROWD.fps) < 1e-9);
            next += move.frames;
        }

        assert.equal(next, rows);

        const loops = ["guard", "stand", "ready", "walk", "stroll", "run"];

        assert.deepEqual(Object.keys(moves).filter((name) => moves[name].loop).sort(), [...loops].sort());

        // (A stride's as long as a walk or run goes in it; the blow lasts as the sword's does)
        assert.ok(Math.abs(moves.walk.stride - CROWD.walk * moves.walk.length) < 1e-9);
        assert.ok(Math.abs(moves.stroll.stride - CROWD.walk * moves.stroll.length) < 1e-9);
        assert.ok(moves.run.stride > moves.walk.stride);
        assert.ok(moves.walk.length > 0.7 && moves.walk.length < 1.6, `a stride walking: ${moves.walk.length} s`);
        assert.ok(moves.attack.length >= WEAPONS.sword.attacks[0].duration / 1000);
        assert.ok(!moves.cast.loop && moves.cast.length >= 1 && moves.cast.hitAt > 0 && moves.cast.hitAt < moves.cast.length);
        assert.deepEqual(CROWD_CASTS, { grimoire: "castStun", wand: "castStun", staff: "castHeal" });

        // Where a bone's head is at a moment (its skinning there, as the figure's posed by it)
        const index = (name) => character.rig.skeleton.bones.findIndex((bone) => bone.name === name);
        const placeOf = (row, bone) => {
            const rest = new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().copy(character.rig.skeleton.boneInverses[bone]).invert());
            const k = row * width * 4 + bone * 12;

            return new THREE.Vector3(
                data[k] * rest.x + data[k + 1] * rest.y + data[k + 2] * rest.z + data[k + 3],
                data[k + 4] * rest.x + data[k + 5] * rest.y + data[k + 6] * rest.z + data[k + 7],
                data[k + 8] * rest.x + data[k + 9] * rest.y + data[k + 10] * rest.z + data[k + 11],
            );
        };
        const hands = ["RightHand", "LeftHand", "Head", "Hips"].map(index);
        const gap = (a, b) => Math.max(...hands.map((bone) => placeOf(a, bone).distanceTo(placeOf(b, bone))));

        // (Fallen, its hips are far lower than on guard)
        const hips = index("Hips");

        assert.ok(placeOf(moves.die.start + moves.die.frames - 1, hips).y < placeOf(moves.guard.start, hips).y - 0.4, "lying");

        // Each played over and over goes round with no jump bigger than its own moments' (its
        // guard's took the arms from hanging down to on guard as it began: 33 and 48 cm)
        for (const name of loops) {
            const { start, frames } = moves[name];
            let inside = 0;

            for (let k = 0; k < frames - 1; k++) {
                inside = Math.max(inside, gap(start + k, start + k + 1));
            }

            const round = gap(start + frames - 1, start);

            assert.ok(round <= Math.max(inside * 1.2, 0.005), `${name} goes round ${(round * 100).toFixed(1)} cm, its moments ${(inside * 100).toFixed(1)} cm at most`);
        }

        // Onto guard from standing with its weapon in hand, and back; a draw from standing at ease
        // to standing with it in hand, and putting it away the other way: each where the other is
        const first = (name) => moves[name].start;
        const last = (name) => moves[name].start + moves[name].frames - 1;

        assert.ok(gap(first("ready"), first("rise")) < 0.01);
        assert.ok(gap(last("rise"), first("guard")) < 0.08);
        assert.ok(gap(first("guard"), first("lower")) < 0.08);
        assert.ok(gap(last("lower"), first("ready")) < 0.05);
        assert.ok(gap(first("stand"), first("draw")) < 0.01);
        assert.ok(gap(last("draw"), first("ready")) < 0.01);
        assert.ok(gap(first("ready"), first("sheathe")) < 0.01);
        assert.ok(gap(last("sheathe"), first("stand")) < 0.01);

        // (Its hands on guard, ready, and onto guard and off it the same every time they're
        // recorded: each from the start of its guard's sway, not at random, so onto guard ends where
        // on guard begins on every load, as above; its head turns as its gaze wanders, at random)
        const again = soldier();
        const twice = allAtOnce(recordingMoves(again.character, { walk: again.look.walk, guard: "sword", attack: WEAPONS.sword.attacks[0], reaction: "slash", cast: CROWD_CASTS.grimoire }));

        for (const name of ["guard", "ready", "rise", "lower"]) {
            assert.deepEqual(twice.moves[name], moves[name], name);

            for (let k = 0; k < moves[name].frames; k++) {
                const row = moves[name].start + k;

                for (const bone of ["RightHand", "LeftHand"].map(index)) {
                    const at = row * width * 4 + bone * 12;

                    assert.ok(
                        [...Array(12).keys()].every((n) => Math.abs(twice.data[at + n] - data[at + n]) < 1e-6),
                        `${name} ${k}: its hands recorded where they were before`,
                    );
                }
            }
        }

        // Each moment says what's in hand: on guard, its weapon and shield; at ease, both put
        // away; as the one drawn so is, running, flinching and falling; drawn, the shield taken
        // off its back first, then the sword; put away, the sword first
        const flagsOf = (name) => Array.from({ length: moves[name].frames }, (_, k) => data.slice((moves[name].start + k) * width * 4 + flags * 4, (moves[name].start + k) * width * 4 + flags * 4 + 2).join(""));
        const once = (list) => list.filter((each, k) => each !== list[k - 1]);

        for (const [names, held] of [
            [["guard", "ready", "rise", "lower", "walk", "attack", "cast"], "11"],
            [["stand", "stroll"], "00"],
            [["run", "hit", "die"], `${AS}${AS}`],
        ]) {
            for (const name of names) {
                assert.deepEqual(once(flagsOf(name)), [held], name);
            }
        }

        assert.deepEqual(once(flagsOf("draw")), ["00", "01", "11"]);
        assert.deepEqual(once(flagsOf("sheathe")), ["11", "01", "00"]);
        assert.equal(character.sheathed, false, "its weapons in hand again, as its figure has them");
    });

    it("has nothing to draw or put away for one with nothing to put away", () => {
        const look = soldierLook({ people: "human", weapon: "sword", seed: 3 });
        const character = new Character(kit, { shape: look.shape, look: look.look, equipment: look.equipment.filter((id) => !/sword|shield/i.test(id)), hairDetail: 0.2, merge: true });
        const { moves } = allAtOnce(recordingMoves(character, { walk: look.walk, guard: "sword", attack: WEAPONS.sword.attacks[0], reaction: "slash" }));

        assert.equal(moves.draw, undefined);
        assert.equal(moves.sheathe, undefined);
        assert.ok(moves.stand && moves.ready && moves.guard);
    });
});

describe("a kind's moves kept as half floats (crowd.js templateFrom)", () => {
    it("keeps its moves at half the size, as near as half floats hold them, with where its flags are", () => {
        const { character, look } = soldier();
        const recorded = allAtOnce(recordingMoves(character, { walk: look.walk, guard: "sword", attack: WEAPONS.sword.attacks[0], reaction: "slash" }));
        const template = allAtOnce(templateFrom({}, "human:m:sword", { geometry: new THREE.BufferGeometry(), picture: null, height: 1.8, recorded }));

        assert.equal(template.moves.type, THREE.HalfFloatType);
        assert.equal(template.moves.image.data.length, recorded.data.length);
        assert.equal(template.flags, recorded.flags);
        assert.equal(template.table, recorded.moves);

        let worst = 0;

        for (let k = 0; k < recorded.data.length; k += 7) {
            worst = Math.max(worst, Math.abs(THREE.DataUtils.fromHalfFloat(template.moves.image.data[k]) - recorded.data[k]));
        }

        assert.ok(worst < 0.002, `${worst} out at most`);
    });
});

describe("a kind's figure let go of once nobody's of it (crowd.js Crowd)", () => {
    it("keeps a kind while anyone's of it, and lets one go a minute after the last of it's gone: its figure, picture, moves and what draws it, all off the graphics card", () => {
        const table = { guard: { start: 0, frames: 40, length: 2, loop: true } };
        const crowd = new Crowd(new THREE.Scene(), kit);
        const freed = [];
        const kindOf = (key) => {
            const thing = (name) => ({ dispose: () => freed.push(`${key} ${name}`) });

            return { template: { key, table, height: 1.8, geometry: thing("figure"), picture: thing("picture"), moves: thing("moves") }, batch: { draw() {}, dispose: () => freed.push(`${key} batch`) } };
        };
        const camera = new THREE.PerspectiveCamera();

        crowd.kinds.set("human:m:sword", kindOf("human:m:sword"));
        crowd.kinds.set("orc:m:axe", kindOf("orc:m:axe"));
        camera.updateMatrixWorld();

        // (A soldier of the first kind about, out of sight; nobody of the second)
        const one = new CrowdAvatar(crowd, "human:m:sword");

        one.object.visible = false;

        crowd.draw(camera, 0, 0);
        crowd.draw(camera, 0, CROWD_KEEP);
        assert.deepEqual([...crowd.kinds.keys()], ["human:m:sword", "orc:m:axe"], "a minute: both kept");
        assert.deepEqual(freed, []);

        crowd.draw(camera, 0, CROWD_KEEP + 1);
        assert.deepEqual([...crowd.kinds.keys()], ["human:m:sword"], "the one nobody's of let go");
        assert.deepEqual(freed.sort(), ["orc:m:axe batch", "orc:m:axe figure", "orc:m:axe moves", "orc:m:axe picture"]);

        // The last of the first gone: let go of a minute after
        one.character.dispose();
        crowd.draw(camera, 0, CROWD_KEEP * 2);
        assert.ok(crowd.kinds.has("human:m:sword"));
        crowd.draw(camera, 0, CROWD_KEEP * 3 + 2);
        assert.equal(crowd.kinds.size, 0);
        assert.equal(CROWD_KEEP, 60000);
    });
});

describe("the kinds' figures made in turn (crowd.js Crowd)", () => {
    it("makes them in the order they're asked for, those it's told to make first before the rest, in that order; and says which are made", () => {
        const crowd = new Crowd(new THREE.Scene(), kit);
        // (Each kind's steps, taken as far as waiting on work done elsewhere, each time: by kind)
        const taken = [];
        const make = function* (kit, key) {
            while (true) {
                taken.push(key);
                yield WAITING;
            }
        };

        for (const key of ["human:m:sword", "human:f:spear", "northman:m:axe", "northman:f:bow"]) {
            assert.equal(crowd.template(key, { make }), null);
        }

        crowd.work(performance.now() + 50);
        assert.deepEqual(taken, ["human:m:sword", "human:f:spear", "northman:m:axe", "northman:f:bow"]);

        // The northmen's axemen first, then the men with swords (those the player's nearest);
        // one not asked for not made for it
        crowd.first(["northman:m:axe", "elf:m:bow", "human:m:sword"]);
        taken.length = 0;
        crowd.work(performance.now() + 50);
        assert.deepEqual(taken, ["northman:m:axe", "human:m:sword", "human:f:spear", "northman:f:bow"]);
        assert.equal(crowd.kinds.has("elf:m:bow"), false);

        assert.equal(crowd.made("northman:m:axe"), false);
        crowd.kinds.set("northman:m:axe", { template: { key: "northman:m:axe" }, batch: { draw() {}, dispose() {} } });
        assert.equal(crowd.made("northman:m:axe"), true);
        assert.equal(crowd.made("elf:m:bow"), false);
    });
});

describe("one drawn in a crowd (crowd.js CrowdAvatar)", () => {
    // A crowd with one kind, its moves as recorded at 20 a second
    const table = {
        guard: { start: 0, frames: 40, length: 2, loop: true },
        walk: { start: 40, frames: 22, length: 1.1, loop: true, stride: 1.43 },
        run: { start: 62, frames: 14, length: 0.7, loop: true, stride: 1.61 },
        attack: { start: 76, frames: 16, length: 0.8, loop: false, hitAt: 0.38 },
        hit: { start: 92, frames: 10, length: 0.5, loop: false },
        die: { start: 102, frames: 30, length: 1.5, loop: false, lands: 0.9 },
    };
    const casting = { ...table, cast: { start: 132, frames: 20, length: 1, loop: false, hitAt: 0.6 } };
    const crowdOf = () => ({ kinds: new Map([["human:m:sword", { template: { table, height: 1.8 } }], ["human:m:grimoire", { template: { table: casting, height: 1.8 } }]]), members: new Set(), join(one) { this.members.add(one); }, leave(one) { this.members.delete(one); } });
    const moveOf = (frame) => Object.entries(casting).find(([, { start, frames }]) => frame[0] >= start && frame[0] < start + frames)[0];

    it("stands on guard, its guard played over and over", () => {
        const crowd = crowdOf();
        const one = new CrowdAvatar(crowd, "human:m:sword");

        assert.ok(crowd.members.has(one));
        one.place(10, 20, 0);

        for (let k = 0; k < 50; k++) {
            one.update(0.05, 10, 20, 0);

            const frame = one.frameIn(table);

            assert.equal(moveOf(frame), "guard");
            assert.ok(frame[1] < 40 && frame[2] >= 0 && frame[2] < 1);
        }

        assert.equal(one.character.height, 1.8);
        one.character.dispose();
        assert.ok(!crowd.members.has(one));
    });

    // (And one whose kind stands at ease and with its weapon in hand, goes onto guard and off it,
    // strolls and draws, as a soldier's do)
    const armed = {
        ...table,
        stand: { start: 152, frames: 20, length: 1, loop: true },
        ready: { start: 172, frames: 20, length: 1, loop: true },
        rise: { start: 192, frames: 6, length: 0.3, loop: false },
        lower: { start: 198, frames: 6, length: 0.3, loop: false },
        stroll: { start: 204, frames: 22, length: 1.1, loop: true, stride: 1.43 },
        draw: { start: 226, frames: 50, length: 2.5, loop: false },
        sheathe: { start: 276, frames: 50, length: 2.5, loop: false },
    };
    const armedOf = () => ({ kinds: new Map([["human:m:sword", { template: { table: armed, height: 1.8 } }]]), members: new Set(), join(one) { this.members.add(one); }, leave(one) { this.members.delete(one); } });
    const moveIn = (frame) => Object.entries(armed).find(([, { start, frames }]) => frame[0] >= start && frame[0] < start + frames)[0];

    it("stands at ease with its weapon put away, or with it in hand, on guard only while it's fighting, easing onto guard and off it; strolls at ease, walks with it in hand; draws and puts it away", () => {
        const one = new CrowdAvatar(armedOf(), "human:m:sword");
        const step = (dt = 0.05, x = 0, z = 0) => {
            one.update(dt, x, z, 0);

            return one.frameIn(armed);
        };

        one.place(0, 0, 0);

        // (At ease, its weapon put away: standing, and strolling; shown so, its flags' fourth 0)
        let frame = step();

        assert.equal(moveIn(frame), "stand");
        assert.equal(frame[3], 0);
        assert.equal(one.character.sheathed, true);

        // (Drawn: the draw played, then standing with it in hand)
        one.actions.draw("sword", true);
        assert.equal(moveIn(step()), "draw");
        assert.equal(one.armed, true);

        for (let t = 0; t < 2.5; t += 0.05) {
            frame = step();
        }

        frame = step(0.3);
        assert.equal(moveIn(frame), "ready");
        assert.equal(frame[3], 1);

        // (Fighting: onto guard, as one in full eases onto it, then on guard; done, off it)
        one.actions.setGuard(true);
        assert.equal(moveIn(step()), "rise");
        step(0.3);
        assert.equal(moveIn(step(0.3)), "guard");
        one.actions.setGuard(false);
        assert.equal(moveIn(step()), "lower");
        step(0.3);
        assert.equal(moveIn(step(0.3)), "ready");

        // (Walking with it in hand; put away, strolling)
        for (let k = 1; k <= 10; k++) {
            frame = step(0.05, 0, 0.065 * k);
        }

        assert.equal(moveIn(frame), "walk");
        one.character.sheathe(true);

        for (let k = 11; k <= 20; k++) {
            frame = step(0.05, 0, 0.065 * k);
        }

        assert.equal(moveIn(frame), "stroll");
        assert.equal(frame[3], 0);

        // (Put away from standing with it in hand: the sheathe played, then at ease)
        one.character.sheathe(false);

        for (let k = 0; k < 20; k++) {
            step(0.1, 0, 1.3);
        }

        one.actions.draw("sword", false);
        assert.equal(moveIn(step()), "sheathe");
        assert.equal(one.armed, false);

        for (let t = 0; t < 2.6; t += 0.1) {
            frame = step(0.1, 0, 1.3);
        }

        assert.equal(moveIn(frame), "stand");
    });

    it("eases from one move into another over a moment, from where it was drawn: but not from where it was drawn long ago, out of sight", () => {
        const one = new CrowdAvatar(armedOf(), "human:m:sword");

        one.place(0, 0, 0);
        one.character.sheathe(false);
        one.update(0.05, 0, 0, 0);

        const ready = one.frameIn(armed);

        assert.equal(moveIn(ready), "ready");

        // (A blow begun: its first moments eased from where it stood, the share of that going)
        one.actions.startAttack("sword", { hitAt: 0.38, duration: 0.8 });
        one.update(0.05, 0, 0, 0);

        const eased = one.frameIn(armed);

        assert.equal(moveIn(eased), "attack");
        assert.ok(eased[1] >= armed.ready.start && eased[1] < armed.ready.start + armed.ready.frames, "from where it stood");
        assert.ok(eased[2] > 0.5, `mostly where it stood still: ${eased[2]}`);

        one.update(CROWD.blend + 0.01, 0, 0, 0);

        const struck = one.frameIn(armed);

        assert.ok(struck[0] >= armed.attack.start && struck[1] >= armed.attack.start && struck[1] < armed.attack.start + armed.attack.frames, "eased in");

        // (Out of sight a while: seen again, where it is, not eased from long ago)
        one.update(1, 0, 0, 0);
        one.actions.startAttack("sword", { hitAt: 0.38, duration: 0.8 });
        one.update(0.05, 0, 0, 0);
        assert.equal(moveIn(one.frameIn(armed)), "attack");
        one.update(2, 0, 0, 0);

        const later = one.frameIn(armed);

        assert.equal(moveIn(later), "ready");
        assert.ok(later[1] >= armed.ready.start && later[1] < armed.ready.start + armed.ready.frames, "not eased from the blow it was drawn in long ago");
        assert.equal(CROWD.blend, 0.2);
    });

    it("stands in for one in full as it has its weapon, in hand or put away, and on guard or not; told when it draws", () => {
        const told = [];
        const full = { object: new THREE.Object3D(), facing: 0, follow: { x: 0, z: 0, vx: 0, vz: 0 }, character: { sheathed: true }, actions: { guardTarget: 0, draw: (name, on) => told.push(on) } };
        const one = new CrowdAvatar(armedOf(), "human:m:sword", { standIn: true });
        const unecho = one.echo(full);

        one.track(full, 0.05);
        assert.equal(moveIn(one.frameIn(armed)), "stand");
        full.character.sheathed = false;
        full.actions.guardTarget = 1;
        one.track(full, 0.05);
        assert.equal(one.armed, true);
        assert.equal(one.guarding, true);

        // (Its draw played, its weapon as the draw has it meanwhile, not as the one in full's says)
        full.actions.draw("sword", false);
        assert.deepEqual(told, [false]);
        one.track(full, 0.05);
        assert.equal(moveIn(one.frameIn(armed)), "sheathe");
        assert.equal(one.armed, false);
        unecho();
    });

    it("thrown by a blast, is flung whole along its arc, over about its middle as its fall plays, lying where it lands till it's up; dead, it lies there", () => {
        const ground = () => 0;
        const one = new CrowdAvatar(crowdOf(), "human:m:sword");

        one.place(0, 0, 0);

        const lands = one.actions.toss({ to: [0, 6], flight: 1, up: 2, ground, seconds: 2.6 });
        const heights = [];

        assert.equal(lands, 1);
        assert.ok(one.thrown && one.airborne);

        // (The battle has it where it lands at once; it's drawn along its arc)
        for (let t = 0; t < 0.95; t += 0.05) {
            one.update(0.05, 0, 6, 0);
            heights.push(one.object.position.y);
            assert.equal(moveOf(one.frameIn(table)), "die", "its fall playing");
        }

        assert.ok(Math.max(...heights) > 1.9 && Math.max(...heights) <= 2 + 1e-9, "as high as its arc");
        assert.ok(one.object.position.z > 5.5 && one.object.position.z <= 6 + 1e-9, "nearly there");

        // (Turned over about its middle on the way, the right way up as it lands)
        const half = new CrowdAvatar(crowdOf(), "human:m:sword");

        half.place(0, 0, 0);
        half.actions.toss({ to: [0, 6], flight: 1, up: 2, ground, seconds: 2.6 });
        half.update(0.5, 0, 6, 0);

        const middle = new THREE.Vector3(0, 0.9, 0).applyMatrix4(half.placed());

        assert.ok(Math.abs(middle.y - (half.object.position.y + 0.9)) < 1e-6 && Math.abs(middle.z - half.object.position.z) < 1e-6, "over about its middle");

        for (let t = 0; t < 1.2; t += 0.05) {
            one.update(0.05, 0, 6, 0);
        }

        assert.ok(!one.airborne && one.thrown, "lying there");
        assert.equal(one.object.position.y, 0);
        assert.equal(moveOf(one.frameIn(table)), "die");

        // (Up again when it's let up, where its actor is)
        for (let t = 0; t < 0.5; t += 0.05) {
            one.update(0.05, 0, 6, 0);
        }

        assert.ok(!one.thrown);
        assert.notEqual(moveOf(one.frameIn(table)), "die");

        // (Dead, it lies there)
        const dead = new CrowdAvatar(crowdOf(), "human:m:sword");

        dead.place(0, 0, 0);
        dead.actions.toss({ to: [3, 0], flight: 0.8, up: 1.5, ground, seconds: null });

        for (let t = 0; t < 5; t += 0.05) {
            dead.update(0.05, 3, 0, 0);
        }

        assert.ok(dead.thrown && !dead.airborne);
        assert.equal(moveOf(dead.frameIn(table)), "die");
    });

    it("walks, or runs, its stride as far through as it's gone", () => {
        const one = new CrowdAvatar(crowdOf(), "human:m:sword");

        one.place(0, 0, 0);

        for (const [speed, gait] of [
            [1.3, "walk"],
            [2.3, "run"],
        ]) {
            let z = 0;
            let stride = null;

            for (let k = 0; k < 60; k++) {
                z += speed * 0.05;
                one.update(0.05, 0, z, 0);
            }

            assert.equal(moveOf(one.frameIn(table)), gait);

            // (Another stride's worth on, it's where it was in it)
            stride = one.stride;

            for (let gone = 0; gone < table[gait].stride; gone += speed * 0.05) {
                z += speed * 0.05;
                one.update(0.05, 0, z, 0);
            }

            assert.ok(Math.min(Math.abs(one.stride - stride), 1 - Math.abs(one.stride - stride)) < 0.1, `${gait}: ${stride} then ${one.stride}`);

            // (Facing the way it's going)
            assert.ok(Math.abs(one.facing) < 0.01);
        }
    });

    it("casts a spell as its kind casts, as long as the cast lasts; one whose kind doesn't, with its weapon", () => {
        const crowd = crowdOf();

        for (const [key, played] of [
            ["human:m:grimoire", "cast"],
            ["human:m:sword", "attack"],
        ]) {
            const one = new CrowdAvatar(crowd, key);
            const moves = crowd.kinds.get(key).template.table;

            one.place(0, 0, 0);
            one.actions.startAttack("castStun", { hitAt: 0.6, duration: 1.2 });

            for (let t = 0; t < 1.15; t += 0.05) {
                one.update(0.05, 0, 0, 0);
                assert.equal(moveOf(one.frameIn(moves)), played, `${key} at ${t}`);
            }

            // (And its weapon's blow as any other)
            one.update(0.2, 0, 0, 0);
            one.actions.startAttack("grimoire", { hitAt: 0.4, duration: 0.8 });
            one.update(0.05, 0, 0, 0);
            assert.equal(moveOf(one.frameIn(moves)), "attack");
        }
    });

    it("strikes as long as the blow lasts, flinches, falls and lies still, and gets up again", () => {
        const one = new CrowdAvatar(crowdOf(), "human:m:sword");

        one.place(0, 0, 0);
        one.actions.startAttack("sword", { hitAt: 0.76, duration: 1.6 });
        assert.ok(one.actions.quick);

        for (let t = 0; t < 1.55; t += 0.05) {
            one.update(0.05, 0, 0, 0);
            assert.equal(moveOf(one.frameIn(table)), "attack", `at ${t}`);
        }

        // (Played at half the speed it was recorded, for a blow twice as long)
        one.update(0.1, 0, 0, 0);
        assert.equal(moveOf(one.frameIn(table)), "guard");

        one.actions.react("slash", { from: 0 });
        one.update(0.1, 0, 0, 0);
        assert.equal(moveOf(one.frameIn(table)), "hit");

        assert.equal(one.actions.die({ from: 0 }), table.die.lands);

        for (let k = 0; k < 60; k++) {
            one.update(0.05, 0, 0, 0);
        }

        const lying = one.frameIn(table);

        assert.deepEqual(lying.slice(0, 2), [table.die.start + table.die.frames - 1, table.die.start + table.die.frames - 1]);

        one.actions.revive();
        one.update(0.05, 0, 0, 0);
        assert.equal(moveOf(one.frameIn(table)), "guard");
    });

    it("is placed where it is, turned the way it faces, and what lands on it stays on it", () => {
        const one = new CrowdAvatar(crowdOf(), "human:m:sword");

        one.place(3, 4, Math.PI / 2);
        one.object.position.y = 1.5;

        const placed = one.placed();
        const at = new THREE.Vector3(0, 0, 1).applyMatrix4(placed);

        assert.ok(at.distanceTo(new THREE.Vector3(4, 1.5, 4)) < 1e-6, "a metre ahead of it is to the east");

        const chest = one.character.rig.bone("Spine2");

        assert.equal(chest.parent, one.object);
        assert.ok(Math.abs(chest.position.y - 1.8 * 0.72) < 1e-9);
        assert.equal(one.character.rig.bone("Spine2"), chest);
        assert.ok(one.point(0.5).distanceTo(new THREE.Vector3(3, 1.5 + 0.9, 4)) < 1e-9);
    });

    it("stands in for one drawn in full: drawn where it is, as big, going as it goes, told what it's told to do, till it's let be", () => {
        // (One drawn in full, half as big again as its kind's figure, its actions its class's, as a character's are)
        class Acts {
            told = [];
            startAttack(name) {
                this.told.push(name);

                return "struck";
            }
            react() {}
            dodge() {}
            knockdown() {}
            die() {
                this.told.push("die");

                return 0.7;
            }
            revive() {}
        }
        const full = { object: new THREE.Object3D(), facing: 0.5, follow: { x: 0, z: 0, vx: 0, vz: 1.3 }, actions: new Acts() };
        const one = new CrowdAvatar(crowdOf(), "human:m:sword", { size: 1.5, standIn: true });
        const unecho = one.echo(full);

        assert.equal(one.character.height, 1.8 * 1.5);

        for (let k = 1; k <= 40; k++) {
            full.object.position.set(0, 0.2, 1.3 * 0.05 * k);
            one.track(full, 0.05);
        }

        assert.ok(one.object.position.distanceTo(new THREE.Vector3(0, 0.2, 2.6)) < 1e-9);
        assert.equal(one.facing, 0.5);
        assert.equal(moveOf(one.frameIn(table)), "walk");

        // (Drawn half as big again: a metre ahead of it is a metre and a half ahead)
        const ahead = new THREE.Vector3(0, 0, 1).applyMatrix4(one.placed()).sub(one.object.position);

        assert.ok(Math.abs(ahead.length() - 1.5) < 1e-9);

        // (Told what it's told: the one in full does it too, and says what it says)
        assert.equal(full.actions.startAttack("sword", { hitAt: 0.38, duration: 0.8 }), "struck");
        one.track(full, 0.05);
        assert.equal(moveOf(one.frameIn(table)), "attack");
        assert.equal(full.actions.die({ from: 0 }), 0.7);
        assert.deepEqual(full.actions.told, ["sword", "die"]);
        assert.notEqual(one.fallen, null);

        // (Not seen when it isn't)
        full.object.visible = false;
        one.track(full, 0.05);
        assert.equal(one.object.visible, false);

        // (Let be: what it's told is its own again)
        unecho();
        assert.equal(Object.hasOwn(full.actions, "startAttack"), false);
        full.actions.revive();
        assert.notEqual(one.fallen, null);

        // (One whose actions are its own, as a creature's are, has them back as they were; one
        // already down lies there)
        const own = { startAttack: () => "own", react() {}, dodge() {}, knockdown() {}, die: () => 1, revive() {} };
        const creature = { object: new THREE.Object3D(), facing: 0, follow: { x: 0, z: 0, vx: 0, vz: 0 }, actions: own };
        const other = new CrowdAvatar(crowdOf(), "human:m:sword", { standIn: true });
        const first = own.startAttack;
        const undo = other.echo(creature, { deadFor: 5 });

        other.track(creature, 0.05);
        assert.deepEqual(other.frameIn(table).slice(0, 2), [table.die.start + table.die.frames - 1, table.die.start + table.die.frames - 1]);
        undo();
        assert.equal(own.startAttack, first);
    });

    it("keeps what's drawn of one in full from being seen while it's stood in for, and seen again after, as it was", () => {
        const object = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BufferGeometry());
        const sword = new THREE.Mesh(new THREE.BufferGeometry());

        sword.layers.enable(3);
        object.add(body, new THREE.Object3D().add(sword));

        const hidden = offstage(object);

        assert.equal(hidden.size, 2);
        assert.ok(!body.layers.isEnabled(0) && body.layers.isEnabled(OFFSTAGE) && !sword.layers.isEnabled(3));

        // (What's put on it since kept from being seen too, the rest as they were kept)
        const torch = new THREE.Mesh(new THREE.BufferGeometry());

        object.add(torch);
        offstage(object, hidden);
        assert.equal(hidden.size, 3);
        assert.ok(torch.layers.isEnabled(OFFSTAGE));

        onstage(hidden);
        assert.ok(body.layers.isEnabled(0) && !body.layers.isEnabled(OFFSTAGE));
        assert.ok(sword.layers.isEnabled(0) && sword.layers.isEnabled(3));
        assert.ok(torch.layers.isEnabled(0));
        assert.equal(hidden.size, 0);
    });
});

// One of the townsfolk's figures, a man's or a woman's (characters/folkcrowd.js), built
function townsfolk(sex) {
    const look = folkFigureLook({ people: "human", sex });

    return { look, character: new Character(kit, { shape: look.shape, look: look.look, equipment: look.equipment, hairDetail: 0.2, merge: true }) };
}

describe("the townsfolk's figure, what of it each corner is marked (crowd.js figureOf, CROWD_PARTS)", () => {
    it("marks its skin, its clothes above its hips and below them to its knees (a skirt all of it below), its hair, and the rest (its boots, its eyes) as it's made", () => {
        for (const sex of ["m", "f"]) {
            const { character } = townsfolk(sex);
            const { geometry } = figureOf(character, 64);
            const { crowdPart, position } = geometry.attributes;
            const head = (name) => character.rig.heads[character.rig.index.get(name)].y;
            const [hips, knees] = [head("Hips"), head("LeftLeg")];
            const of = (part) => Array.from({ length: crowdPart.count }, (_, v) => v).filter((v) => crowdPart.getX(v) === part);

            assert.equal(crowdPart.count, position.count);

            for (const [name, part] of Object.entries(CROWD_PARTS)) {
                assert.ok(of(part).length > 50, `${sex}: ${of(part).length} corners of its ${name}`);
            }

            assert.ok(
                of(CROWD_PARTS.upper).every((v) => position.getY(v) >= hips),
                `${sex}: its clothes above its hips`,
            );
            assert.ok(
                of(CROWD_PARTS.hair).every((v) => position.getY(v) > character.height * 0.75),
                `${sex}: its hair on its head`,
            );

            if (sex === "m") {
                assert.ok(
                    of(CROWD_PARTS.lower).every((v) => position.getY(v) < hips && position.getY(v) >= knees),
                    "his trousers to his knees, his boots below",
                );
            } else {
                assert.ok(
                    of(CROWD_PARTS.lower).some((v) => position.getY(v) < knees),
                    "her skirt down past her knees",
                );
            }
        }
    });
});

describe("the townsfolk's moves (crowd.js recordingMoves calm)", () => {
    it("records only standing, strolling and running at ease, a flinch and a fall for one that never fights", () => {
        const { character, look } = townsfolk("f");
        const { moves, rows } = allAtOnce(recordingMoves(character, { walk: look.walk, guard: null, attack: null, reaction: "slash", calm: true }));
        let next = 0;

        assert.deepEqual(Object.keys(moves).sort(), ["die", "hit", "run", "stand", "stroll"]);

        for (const [name, move] of Object.entries(moves).sort((a, b) => a[1].start - b[1].start)) {
            assert.equal(move.start, next, `${name} follows the last`);
            assert.ok(move.frames > 3, `${name}: ${move.frames} frames`);
            next += move.frames;
        }

        assert.equal(next, rows);
        assert.ok(moves.stroll.stride > 0.8 && moves.run.stride > moves.stroll.stride);
    });
});

describe("one of the townsfolk in a crowd (crowd.js CrowdAvatar, Batch)", () => {
    // (Its kind's moves, calm: recordingMoves')
    const calm = {
        stand: { start: 0, frames: 20, length: 1, loop: true },
        stroll: { start: 20, frames: 22, length: 1.1, loop: true, stride: 1.43 },
        run: { start: 42, frames: 14, length: 0.7, loop: true, stride: 1.61 },
        hit: { start: 56, frames: 10, length: 0.5, loop: false },
        die: { start: 66, frames: 30, length: 1.5, loop: false, lands: 0.9 },
    };
    const moveOf = (frame) => Object.entries(calm).find(([, { start, frames }]) => frame[0] >= start && frame[0] < start + frames)[0];

    it("stands at ease whatever it's told, strolls and runs at ease, and is drawn as tall and broad as it's built", () => {
        const crowd = { kinds: new Map([["folk:human:f", { template: { table: calm, height: 1.7 } }]]), members: new Set(), join(one) { this.members.add(one); }, leave(one) { this.members.delete(one); } };
        const one = new CrowdAvatar(crowd, "folk:human:f", { build: [1.05, 0.95] });

        one.place(0, 0, 0);
        one.guarding = true;
        one.armed = true;
        one.update(0.05, 0, 0, 0);
        assert.equal(moveOf(one.frameIn(calm)), "stand");

        for (const [speed, move] of [
            [1.3, "stroll"],
            [2.6, "run"],
        ]) {
            for (let k = 0; k < 40; k++) {
                one.update(0.05, 0, (k + 1) * speed * 0.05 + speed * 2, 0);
            }

            assert.equal(moveOf(one.frameIn(calm)), move, `at ${speed} m/s`);
            one.place(0, 0, 0);
        }

        const scale = new THREE.Vector3();

        one.placed().decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
        assert.ok(scale.distanceTo(new THREE.Vector3(1.05, 0.95, 1.05)) < 1e-9);
        assert.ok(Math.abs(one.character.height - 1.7 * 0.95) < 1e-9);
    });

    it("is drawn with its own colours in its own place in the picture of them, near and far, and one with none as its figure is; the figure's shader dyes each part so", () => {
        const geometry = new THREE.BufferGeometry();

        geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0.5, 1.7, 0, -0.5, 1.7, 0], 3));
        geometry.setIndex([0, 1, 2]);

        const template = { key: "folk:human:f", geometry, nearIndex: null, farIndex: geometry.index, picture: new THREE.Texture(), moves: new THREE.DataTexture(new Uint16Array(4), 1, 1), table: calm, flags: -1, height: 1.7 };
        const crowd = new Crowd(new THREE.Scene(), kit);
        const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);

        crowd.template("folk:human:f", {
            // eslint-disable-next-line require-yield
            make: function* () {
                return template;
            },
        });
        crowd.work(performance.now() + 1000);
        assert.ok(crowd.made("folk:human:f"));

        // (One dyed near, one as its figure is, one dyed far off)
        const tint = Float32Array.from({ length: 16 }, (_, k) => k / 16);
        const farTint = Float32Array.from({ length: 16 }, (_, k) => 1 - k / 16);
        const dyed = new CrowdAvatar(crowd, "folk:human:f", { tint });
        const plain = new CrowdAvatar(crowd, "folk:human:f");
        const far = new CrowdAvatar(crowd, "folk:human:f", { tint: farTint });

        dyed.place(0, 0, 0);
        plain.place(1, 0, 0);
        far.place(0, -40, 0);
        camera.position.set(0, 1, 6);
        camera.lookAt(0, 1, 0);
        camera.updateMatrixWorld();
        assert.equal(crowd.draw(camera, 600, 0), 3);

        const batch = crowd.kinds.get("folk:human:f").batch;
        const near = batch.near.geometry.attributes.crowdState;
        const data = batch.tints.value.image.data;
        const room = batch.near.instanceMatrix.count;

        assert.deepEqual([near.getZ(0), near.getZ(1)], [0, -1]);
        assert.equal(batch.far.geometry.attributes.crowdState.getZ(0), room, "the far ones' after the near");
        assert.deepEqual([...data.subarray(0, 16)], [...tint]);
        assert.deepEqual([...data.subarray(room * 16, room * 16 + 16)], [...farTint]);
        assert.equal(batch.tints.value.image.width, 64 * 4);

        // Its shader: each part dyed as its colours say, from its figure's lightness there
        const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };

        batch.material.onBeforeCompile(shader);
        assert.equal(shader.uniforms.crowdTints, batch.tints);
        assert.match(shader.vertexShader, /attribute float crowdPart;/);
        assert.match(shader.vertexShader, /vCrowdDye = crowdDye\.rgb;/);
        assert.match(shader.fragmentShader, /diffuseColor\.rgb = mix\( diffuseColor\.rgb, vCrowdDye \* dot\( diffuseColor\.rgb, vec3\( 0\.2126, 0\.7152, 0\.0722 \) \), vCrowdDyed \);/);

        crowd.dispose();
    });
});
