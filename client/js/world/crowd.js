// Soldiers by the hundred: everyone of a kind (a people, a sex, a weapon) drawn at once, as one
// figure made from one of them, its moves played from a picture of them made once (a crowd).
//
// A soldier drawn in full is a character of its own (characters/character.js): a dozen or more
// meshes, a skin painted for it, its body posed every frame. Built a few at a time, a field
// battle's hundred would take a minute to come, and posed and drawn a dozen times each, slow any
// phone. In a crowd:
//  - **One figure for each kind.** A soldier of each people, sex and weapon is built once (a
//    template), its body, clothes, hair and what it carries merged into one mesh at the far level
//    of detail (lod.js), with one picture of its skin, its clothes and its hair side by side, and
//    what's only coloured (its eyes, its weapon and shield) coloured at its corners.
//  - **Its moves recorded.** Its walk, its run, standing on guard, a blow of its weapon, a flinch
//    and its fall are each played once on it (avatar.js, actions.js), and where each of its bones
//    is then, CROWD.fps times a second, kept in a picture of numbers (a row a moment).
//  - **Drawn all at once.** Everyone of a kind is one instance of its figure, drawn in one go,
//    each posed in the picture of moves where it is in what it's doing (between two moments): its
//    bones on the graphics card, nothing on the page. Those far from the camera are drawn with
//    fewer triangles still (CROWD.far), as another draw of the same.
// Each soldier drawn so has a CrowdAvatar: an avatar (avatar.js) as far as the game's concerned,
// placed, turned, struck and fallen as one is, its moves told to the crowd; thrown by a blast, its
// whole figure flung tumbling along its arc as its fall plays (one drawn in full goes limp).
//
// One drawn in full can be drawn in a crowd for a while too (a stand-in: app/game.js #thronging),
// its body kept but not drawn (OFFSTAGE) nor posed: the stand-in drawn where it is, as it's going
// (track), told what it's told to do (echo).

import * as THREE from "three";
import { Avatar } from "./avatar.js";
import { REACTIONS } from "../characters/actions.js";
import { Character } from "../characters/character.js";
import { LODS } from "../characters/lod.js";
import { Steps, WAITING } from "../core/steps.js";

/**
 * - `fps`: how many times a second each move is recorded (played between them).
 * - `near`, `far`: drawn with about `share` of its figure's triangles (never more than `error`
 *   metres out, taken off across its picture's seams too and its smallest pieces dropped: lod.js),
 *   near the camera, and beyond `from` metres from it or under `below` pixels tall on the screen
 *   (as a character's drawn at its lowest level of detail: lod.js LODS).
 * - `walk`, `run`: how fast it walks and runs as those are recorded (metres a second: a soldier's,
 *   core/battle.js KINDS), and `pace`, between the two, over which it's drawn running; `still`,
 *   under which it's drawn standing.
 * - `guard`: how long its guard is recorded (seconds), its sway (actions.js GUARD_SWAYS), and
 *   `stand` standing at ease or with its weapon in hand (still: none sways but on guard), each
 *   played over and over, the moments after its end eased into its start over `ease` seconds;
 *   each recorded once it's stood `settle` seconds (its guard eased into: actions.js setGuard);
 *   `turn`, how long it takes to go onto guard or off it; `lie`: how long it's recorded lying
 *   after its fall.
 * - `blend`: how long one in a crowd eases from one move into another (seconds: from where the
 *   last was drawn); `fade`: how long it takes to fade from sight once one drawn in full stands in
 *   its place.
 * - `hair`: how much of its hair's grown (hair.js), little, from afar.
 * - `wait`: how many frames the figure's far level of detail is waited for (lod.js), at most.
 */
export const CROWD = Object.freeze({
    fps: 20,
    near: Object.freeze({ share: 0.45, error: 0.012 }),
    far: Object.freeze({ from: 24, below: 140, share: 0.18, error: 0.05 }),
    walk: 1.3,
    run: 2.3,
    pace: 1.8,
    still: 0.25,
    guard: 2,
    stand: 1,
    ease: 0.4,
    settle: 0.6,
    turn: 0.3,
    lie: 0.6,
    blend: 0.2,
    fade: 0.25,
    hair: 0.15,
    wait: 900,
});

// What's drawn of a figure that's coloured only (its eyes; what it carries): a picture's corner of white
const WHITE = 4;

const _matrix = new THREE.Matrix4();
const _skin = new THREE.Matrix4();
const _vector = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _normalMatrix = new THREE.Matrix3();
const _colour = new THREE.Color();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);
const _up = new THREE.Vector3(0, 1, 0);
const _sphere = new THREE.Sphere();
const _frustum = new THREE.Frustum();
const _view = new THREE.Matrix4();

/** The layer what's drawn of one in full is put on while it's stood in for: seen by no camera, casting no shadow. */
export const OFFSTAGE = 31;

/**
 * How long a kind's figure is kept with nobody of its kind in the crowds (ms): then let go of, its
 * picture, its moves and its figure off the graphics card (6 MB or so on Low), and made again if
 * one's wanted. Kept for good, an iPhone that let the game's tab go held 18 kinds of soldier.
 */
export const CROWD_KEEP = 60000;

// A kind's figure let go of: its figure, its picture and its moves, and what draws it
function letGoOf(kind) {
    if (kind.template) {
        kind.template.disposed = true;
        kind.template.geometry.dispose();
        kind.template.picture.dispose();
        kind.template.moves.dispose();
    }

    kind.batch?.dispose();
}

/**
 * What's drawn of `object` (its meshes) kept from being seen, as each was kept in `hidden` (a Map,
 * made if it isn't given: what each one's layers were), those already kept left as they are; returns
 * `hidden`. (What's added to it since, a torch taken up, is kept from being seen the next time.)
 */
export function offstage(object, hidden = new Map()) {
    object.traverse((node) => {
        if ((node.isMesh || node.isLine || node.isPoints) && !hidden.has(node)) {
            hidden.set(node, node.layers.mask);
            node.layers.set(OFFSTAGE);
        }
    });

    return hidden;
}

/** What `offstage` kept from being seen, seen again as it was. */
export function onstage(hidden) {
    for (const [node, mask] of hidden) {
        node.layers.mask = mask;
    }

    hidden.clear();
}

// --- The figure ---

// Whether a node's drawn (it and everything it's in, up to `top`)
function shown(node, top) {
    for (let at = node; at && at !== top; at = at.parent) {
        if (!at.visible) {
            return false;
        }
    }

    return true;
}

// The bone of a skeleton a node hangs from (the nearest it's in), or the first if none
function boneOf(node, bones) {
    for (let at = node.parent; at; at = at.parent) {
        const index = bones.indexOf(at);

        if (index >= 0) {
            return index;
        }
    }

    return 0;
}

// The colour of a texture's picture, all told (its pixels' mean), as three.js's colours are
// (linear), kept for each texture
const averages = new WeakMap();

function averageOf(texture) {
    if (!averages.has(texture)) {
        const image = texture.image;
        let pixels = image?.data ?? null;

        // (A picture of data whose pixels have been let go of, once sent (world/release.js): white,
        // its material's colour all there is to go by)
        if (!pixels && image && !("data" in image)) {
            const scratch = document.createElement("canvas");

            scratch.width = 16;
            scratch.height = 16;

            const context = scratch.getContext("2d", { willReadFrequently: true });

            context.drawImage(image, 0, 0, 16, 16);
            pixels = context.getImageData(0, 0, 16, 16).data;
        }

        const sum = [0, 0, 0];
        let count = 0;

        for (let k = 0; pixels && k < pixels.length; k += 4 * Math.max(1, Math.floor(pixels.length / 4 / 4096))) {
            // (Where it's drawn: not what's see-through)
            if (pixels[k + 3] > 32) {
                sum[0] += pixels[k];
                sum[1] += pixels[k + 1];
                sum[2] += pixels[k + 2];
                count++;
            }
        }

        const colour = count ? new THREE.Color().setRGB(sum[0] / count / 255, sum[1] / count / 255, sum[2] / count / 255, THREE.SRGBColorSpace) : new THREE.Color(1, 1, 1);

        averages.set(texture, colour);
    }

    return averages.get(texture);
}

// The triangles of a mesh drawn now, each with its material: [{ material, first, count }] over its
// index (or its vertices, unindexed)
function drawnOf(mesh) {
    const geometry = mesh.geometry;
    const total = geometry.index ? geometry.index.count : geometry.attributes.position.count;
    const range = geometry.drawRange;
    const start = Math.max(0, range.start);
    const end = Math.min(total, range.count === Infinity ? total : start + range.count);
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

    if (geometry.groups.length) {
        return geometry.groups
            .map(({ start: first, count, materialIndex }) => ({ material: materials[materialIndex ?? 0], first: Math.max(first, start), count: Math.min(first + count, end) - Math.max(first, start) }))
            .filter(({ material, count }) => material && count > 0);
    }

    return [{ material: materials[0], first: start, count: end - start }];
}

/**
 * Which of what a figure carries each of its corners is (its `crowdSet`): what's there whatever
 * it's doing (its body, its clothes, a scabbard, a bow), its weapon in hand or put away (in its
 * sheath, on its back), its shield on its arm or slung on its back. Each moment of its moves
 * says which it shows (MOVES' flags, recordingMoves).
 */
export const CROWD_SETS = Object.freeze({ always: 0, weaponHeld: 1, weaponAway: 2, shieldHeld: 3, shieldAway: 4 });

// How many of what it carries a figure's picture has a place for (a shield's face, a blade)
const GEAR = 3;

// What of a character's `items` a mesh is part of (the nearest it's in), or null
function itemOf(mesh, items) {
    for (let at = mesh; at; at = at.parent) {
        if (items.has(at)) {
            return at;
        }
    }

    return null;
}

// Which of what it carries a mesh is (CROWD_SETS), held (`away` false) or put away: null if it
// isn't drawn so (put away, only what's put away somewhere other than where it's held is)
function setOf(mesh, items, away) {
    const item = items.size ? itemOf(mesh, items) : null;
    const { sling, sheath, holder } = item?.userData ?? {};

    if (!item || holder || (!sling && !sheath)) {
        return away ? null : CROWD_SETS.always;
    }

    return sling ? (away ? CROWD_SETS.shieldAway : CROWD_SETS.shieldHeld) : away ? CROWD_SETS.weaponAway : CROWD_SETS.weaponHeld;
}

// Whether a mesh's picture lies within its whole (its coordinates over the triangles drawn between
// 0 and 1), so that it can be painted into a place in the figure's: not one repeated across it
function within(geometry, first, count) {
    const uv = geometry.attributes.uv;

    for (let k = first; uv && k < first + count; k++) {
        const v = geometry.index ? geometry.index.getX(k) : k;
        const [u, w] = [uv.getX(v), uv.getY(v)];

        if (u < -0.01 || u > 1.01 || w < -0.01 || w > 1.01) {
            return false;
        }
    }

    return Boolean(uv);
}

/**
 * A character's figure, merged (as it's posed now, its far level of detail drawn: what it holds
 * where it is): every mesh drawn into one, in the space of its body as it's bound to its skeleton,
 * each corner bound to up to four bones; and one picture of its skin, its clothes and its hair
 * side by side (`size` pixels square each of the first two), and of what it carries (up to GEAR
 * of its pictures: a shield's face, a blade). `stowed`: what it carries put away too (in its
 * sheath, a shield slung on its back), as well as in hand, each corner marked which it is
 * (`crowdSet`: CROWD_SETS); and each corner shines as what it's of does (`crowdSurface`: its
 * metalness and roughness: a blade, a shield's rim and a helm as metal, not chalk). Returns {
 * geometry, picture, height }.
 */
export function figureOf(character, size = 256, { stowed = false } = {}) {
    const object = character.object;

    object.updateMatrixWorld(true);

    const skeleton = character.rig.skeleton;
    const bones = skeleton.bones;
    const toObject = new THREE.Matrix4().copy(object.matrixWorld).invert();
    const items = new Set(character.items ?? []);

    // The picture: its skin's, then its clothes', side by side; its hair's, a corner of white and
    // what it carries below
    const hairSize = [Math.max(16, size / 8), Math.max(32, size / 4)];
    const canvas = document.createElement("canvas");

    canvas.width = size * 2;
    canvas.height = size + hairSize[1];

    const context = canvas.getContext("2d");

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);

    const places = {
        skin: { x: 0, y: 0, w: size, h: size },
        clothes: { x: size, y: 0, w: size, h: size },
        hair: { x: 0, y: size, w: hairSize[0], h: hairSize[1] },
        white: { x: hairSize[0] + 2, y: size + 2, w: WHITE, h: WHITE },
    };

    for (let k = 0; k < GEAR; k++) {
        places[`gear${k}`] = { x: hairSize[0] + WHITE + 6 + k * (hairSize[1] + 2), y: size, w: hairSize[1], h: hairSize[1] };
    }

    const painted = new Map();

    // A texture's picture painted into its place (the first time), in the picture's way up
    const paint = (texture, place, opaque) => {
        if (painted.has(place)) {
            return painted.get(place) === texture;
        }

        const image = texture?.image;

        // (Nor a picture whose pixels have been let go of, once sent: world/release.js. Coloured
        // by its material, all told, then)
        if (!image || ("data" in image && !image.data)) {
            return false;
        }

        const { x, y, w, h } = places[place];

        if (image.data) {
            const pixels = new Uint8ClampedArray(image.width * image.height * 4);

            pixels.set(image.data.length === pixels.length ? image.data : image.data.subarray(0, pixels.length));

            // (A skin's alpha is its roughness: drawn solid)
            if (opaque) {
                for (let k = 3; k < pixels.length; k += 4) {
                    pixels[k] = 255;
                }
            }

            const scratch = document.createElement("canvas");

            scratch.width = image.width;
            scratch.height = image.height;
            scratch.getContext("2d").putImageData(new ImageData(pixels, image.width, image.height), 0, 0);
            context.clearRect(x, y, w, h);
            context.drawImage(scratch, x, y, w, h);
        } else {
            context.clearRect(x, y, w, h);
            context.drawImage(image, x, y, w, h);

            // (What it carries, drawn solid where its material is: what its picture leaves clear, white)
            if (opaque && place.startsWith("gear")) {
                context.globalCompositeOperation = "destination-over";
                context.fillRect(x, y, w, h);
                context.globalCompositeOperation = "source-over";
            }
        }

        painted.set(place, texture);

        return true;
    };

    // What it carries painted into a place of its own (the place it's in already, or the first
    // free): which, or null if there's none free
    const gear = (texture, opaque) => {
        for (let k = 0; k < GEAR; k++) {
            if (painted.get(`gear${k}`) === texture || (!painted.has(`gear${k}`) && paint(texture, `gear${k}`, opaque))) {
                return `gear${k}`;
            }
        }

        return null;
    };

    // Where a texture's coordinate is in the picture (its place's, the texture's way up)
    const placing = (place, flipped) => {
        const { x, y, w, h } = places[place];

        return (u, v) => [(x + Math.min(1, Math.max(0, u)) * w) / canvas.width, (y + (flipped ? 1 - Math.min(1, Math.max(0, v)) : Math.min(1, Math.max(0, v))) * h) / canvas.height];
    };
    const whiteAt = [(places.white.x + WHITE / 2) / canvas.width, (places.white.y + WHITE / 2) / canvas.height];

    const positions = [];
    const normals = [];
    const uvs = [];
    const colours = [];
    const boneIndices = [];
    const boneWeights = [];
    const sets = [];
    const surfaces = [];
    const indices = [];
    let corners = 0;

    // Every mesh drawn now merged in (`away`: what it carries put away, only that)
    const merge = (away) => {
        object.updateMatrixWorld(true);

        // Each bone's skinning now (in the body's space), and back again
        const unskin = bones.map((bone, i) => new THREE.Matrix4().multiplyMatrices(toObject, bone.matrixWorld).multiply(skeleton.boneInverses[i]).invert());

        object.traverse((mesh) => {
            if (!mesh.isMesh || !shown(mesh, object) || !mesh.geometry?.attributes.position) {
                return;
            }

            const set = setOf(mesh, items, away);

            if (set === null) {
                return;
            }

            const geometry = mesh.geometry;
            const { position, normal, uv, color, skinIndex, skinWeight, fold } = geometry.attributes;
            const bound = mesh.isSkinnedMesh && mesh.skeleton === skeleton;
            const anchor = bound ? 0 : mesh.isSkinnedMesh ? bones.indexOf(character.rig.bone("Spine2") ?? bones[0]) : boneOf(mesh, bones);
            const toBody = new THREE.Matrix4().multiplyMatrices(unskin[Math.max(0, anchor)], toObject).multiply(mesh.matrixWorld);

            _normalMatrix.getNormalMatrix(toBody);

            for (const { material, first, count } of drawnOf(mesh)) {
                // What this part's drawn with: a place in the picture, and a colour
                const map = material.map;
                let place = null;

                if (material === character.materials.body && map && paint(map, "skin", true)) {
                    place = placing("skin", map.flipY);
                } else if (character.garments.includes(mesh) && map && paint(map, "clothes", true)) {
                    place = placing("clothes", map.flipY);
                } else if (material === character.materials.hair && map && paint(map, "hair", false)) {
                    place = placing("hair", map.flipY);
                } else if (map && items.size && itemOf(mesh, items) && within(geometry, first, count)) {
                    // (What it carries: a shield's face, its device on it, as it's painted)
                    const into = gear(map, !(material.transparent || material.alphaTest > 0));

                    place = into ? placing(into, map.flipY) : null;
                }

                // (A picture that isn't in the figure's: coloured by it, all told)
                const base = new THREE.Color(1, 1, 1).copy(material.color ?? _colour.setRGB(1, 1, 1));

                if (map && !place) {
                    base.multiply(averageOf(map));
                }

                const folds = material.colours ?? null;
                const finish = material.surfaces ?? null;
                const eyes = material === character.materials.eyes;
                const seen = new Map();

                for (let k = first; k < first + count; k++) {
                    const v = geometry.index ? geometry.index.getX(k) : k;
                    let corner = seen.get(v);

                    if (corner === undefined) {
                        corner = corners++;
                        seen.set(v, corner);

                        // Where it is, bound to its bones as it is to its own, or to the bone it hangs
                        // from as it's posed now
                        if (bound) {
                            _vector.fromBufferAttribute(position, v);
                            _normal.fromBufferAttribute(normal, v);
                            boneIndices.push(skinIndex.getX(v), skinIndex.getY(v), skinIndex.getZ(v), skinIndex.getW(v));
                            boneWeights.push(skinWeight.getX(v), skinWeight.getY(v), skinWeight.getZ(v), skinWeight.getW(v));
                        } else {
                            if (mesh.isSkinnedMesh) {
                                mesh.getVertexPosition(v, _vector);
                            } else {
                                _vector.fromBufferAttribute(position, v);
                            }

                            _vector.applyMatrix4(toBody);

                            if (normal) {
                                _normal.fromBufferAttribute(normal, v).applyMatrix3(_normalMatrix).normalize();
                            } else {
                                _normal.set(0, 1, 0);
                            }

                            boneIndices.push(Math.max(0, anchor), 0, 0, 0);
                            boneWeights.push(1, 0, 0, 0);
                        }

                        positions.push(_vector.x, _vector.y, _vector.z);
                        normals.push(_normal.x, _normal.y, _normal.z);
                        sets.push(set);

                        // Its colour and its place in the picture
                        if (place && uv) {
                            uvs.push(...place(uv.getX(v), uv.getY(v)));
                        } else {
                            uvs.push(...whiteAt);
                        }

                        // (And how it shines: metal as its own metal does, what it is as its own is)
                        if (eyes) {
                            _colour.setRGB(0.55, 0.52, 0.5);
                            surfaces.push(0, 0.8);
                        } else if (folds && fold) {
                            const f = Math.round(fold.getX(v));

                            _colour.setRGB(folds[f * 3], folds[f * 3 + 1], folds[f * 3 + 2]);
                            surfaces.push(finish ? finish[f * 2] : 0, finish ? finish[f * 2 + 1] : 0.8);
                        } else {
                            _colour.copy(base);
                            surfaces.push(material.metalness ?? 0, material.roughness ?? 0.8);
                        }

                        if (color) {
                            _colour.r *= color.getX(v);
                            _colour.g *= color.getY(v);
                            _colour.b *= color.getZ(v);
                        }

                        colours.push(_colour.r, _colour.g, _colour.b);
                    }

                    indices.push(corner);
                }
            }
        });
    };

    merge(false);

    // (And what it carries put away, where it's put away: merged in as it is then, then taken up again)
    if (stowed && [...items].some(({ userData: { sling, sheath, holder } }) => (sling || sheath) && !holder)) {
        const { sheathed, slung } = character;

        character.sheathe(true);
        merge(true);
        character.sheathe(sheathed);

        if (character.slung !== slung) {
            character.sling(slung);
        }

        object.updateMatrixWorld(true);
    }

    const merged = new THREE.BufferGeometry();

    merged.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    merged.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    merged.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    merged.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
    merged.setAttribute("crowdBones", new THREE.Float32BufferAttribute(boneIndices, 4));
    merged.setAttribute("crowdWeights", new THREE.Float32BufferAttribute(boneWeights, 4));
    merged.setAttribute("crowdSet", new THREE.Float32BufferAttribute(sets, 1));
    merged.setAttribute("crowdSurface", new THREE.Float32BufferAttribute(surfaces, 2));
    merged.setIndex(corners > 65535 ? new THREE.Uint32BufferAttribute(indices, 1) : new THREE.Uint16BufferAttribute(indices, 1));
    merged.computeBoundingBox();
    merged.computeBoundingSphere();

    const picture = new THREE.CanvasTexture(canvas);

    picture.flipY = false;
    picture.colorSpace = THREE.SRGBColorSpace;
    picture.anisotropy = 2;

    return { geometry: merged, picture, height: character.height ?? merged.boundingBox.max.y };
}

// --- Its moves ---

/**
 * Each of a skeleton's bones' skinning now, in its body's space (`character`: its `object`, and its
 * `rig.skeleton`), as three rows (12 numbers a bone) written into `into` at `at`.
 */
export function recordPose(character, into, at) {
    const object = character.object;
    const skeleton = character.rig.skeleton;

    object.updateMatrixWorld(true);
    _matrix.copy(object.matrixWorld).invert();

    skeleton.bones.forEach((bone, i) => {
        const e = _skin.multiplyMatrices(_matrix, bone.matrixWorld).multiply(skeleton.boneInverses[i]).elements;
        const k = at + i * 12;

        into[k] = e[0];
        into[k + 1] = e[4];
        into[k + 2] = e[8];
        into[k + 3] = e[12];
        into[k + 4] = e[1];
        into[k + 5] = e[5];
        into[k + 6] = e[9];
        into[k + 7] = e[13];
        into[k + 8] = e[2];
        into[k + 9] = e[6];
        into[k + 10] = e[10];
        into[k + 11] = e[14];
    });
}

/**
 * How one carrying a weapon casts (actions.js): a grimoire's or a wand's spells at an enemy, a
 * staff's healing (a line of battle's casters and healers: core/formation.js); none, the rest.
 */
export const CROWD_CASTS = Object.freeze({ grimoire: "castStun", wand: "castStun", staff: "castHeal" });

// A cast as it's recorded (seconds): the hand's gathering till its release, the whole of it
const CAST = Object.freeze({ hitAt: 0.6, duration: 1.0 });

/**
 * A moment's flags (MOVES' last texel each row): whether its weapon (x) and its shield (y) are in
 * hand (1) or put away (0), or as the one drawn so is (AS: armed or not, CrowdAvatar `armed`).
 */
export const AS = 0.5;

// How a move ends, standing (recordingMoves: a draw ends with its weapon in hand, not on guard; a
// blow or a flinch on guard): which to go onto guard or off it from (CrowdAvatar frameIn)
const ENDS_AS = Object.freeze({ draw: "ready", lower: "ready", sheathe: "stand", rise: "guard", attack: "guard", cast: "guard", hit: "guard" });

/**
 * A character's moves, each played on it once and recorded CROWD.fps times a second, a step at a
 * time (each a yield):
 *  - on guard (`guard`, its weapon in hand), standing with it in hand (`ready`), and between the
 *    two (`rise`, `lower`: as an avatar's eased onto guard and off it); standing at ease, put
 *    away (`stand`);
 *  - walking (`walk`, its weapon in hand), walking at ease (`stroll`, put away), and running
 *    (`run`, on guard, as it's armed or not);
 *  - a blow (`attack`), a cast for one that casts (`cast`), a flinch (`hit`) and its fall (`die`);
 *  - drawing its weapon (`draw`, a shield slung on its back taken off it first) and putting it
 *    away (`sheathe`), each moment showing what's in hand then, for one that has a weapon or shield
 *    to put away.
 * Returns { data (a row of three numbers' worth for each bone at each moment, then its flags: AS),
 * rows, width (texels: three a bone, and one), flags (the texel of a row its flags are in),
 * moves: name -> { start, frames, length (seconds), loop }, stride: how far a walk's and a run's
 * go over theirs (metres) }. Each one played over and over has its end eased into its start (none
 * of it jumps going round), and those standing are recorded once they've settled. `walk` its
 * walk's style; `guard` how it fights (actions.js GUARDS); `attack` its weapon's blow ({
 * animation, hitAt, duration }: weapons.js, ms); `reaction` how it flinches (actions.js
 * REACTIONS); `cast` how it casts (CROWD_CASTS), if it does.
 */
export function* recordingMoves(character, { walk, guard, attack, reaction, cast = null }) {
    const step = 1 / CROWD.fps;
    const flags = character.rig.skeleton.bones.length * 3;
    const width = flags + 1;
    const frames = [];
    const moves = {};
    const stows = Boolean(character.items?.some(({ userData: { sheath, sling, holder } }) => (sheath || sling) && !holder));

    // What's in hand now (or as the one drawn so is, `as`): the flags written into a moment
    const heldNow = (as) => (as ? [AS, AS] : [character.sheathed ? 0 : 1, character.slung ? 0 : 1]);

    // One move: its weapons in hand or put away (`away`), `start` its avatar ready to play it, then
    // each moment till `until` says it's done; standing a while first (`settle` seconds), or got
    // going first if it's walking or running (`speed`). `as`: its flags as the one drawn so is
    const play = (name, { loop = false, start, until, speed = 0, facing = 0, settle = 0, away = false, as = false }) => {
        character.sheathe(away);

        const avatar = new Avatar(character, { walk, guard });
        let z = 0;

        avatar.place(0, 0, facing);
        start(avatar);

        const move = { start: frames.length, frames: 0, length: 0, loop };
        const moving = () => {
            z += speed * step;
            avatar.update(step, 0, z, facing, true);
        };
        const pose = () => {
            const row = new Float32Array(width * 4);

            recordPose(character, row, 0);
            row.set(heldNow(as), flags * 4);

            return row;
        };

        for (let k = 0; k < Math.round(settle * CROWD.fps); k++) {
            moving();
        }

        // (A walk or a run got going first, and recorded from the start of a stride to the next)
        if (speed > 0) {
            for (let k = 0; k < 3 * CROWD.fps; k++) {
                moving();
            }

            let last = avatar.walker.phase;

            for (let k = 0; k < 4 * CROWD.fps; k++) {
                moving();

                if (avatar.walker.phase < last) {
                    break;
                }

                last = avatar.walker.phase;
            }
        }

        do {
            frames.push(pose());
            move.frames++;
            moving();
        } while (!until(avatar, move.frames * step) && move.frames < 6 * CROWD.fps);

        // (Played on a moment past its end, eased into its start: none of it jumps going round)
        if (loop) {
            const count = Math.min(Math.round(CROWD.ease * CROWD.fps), Math.floor(move.frames / 2));

            for (let k = 0; k < count; k++) {
                const past = pose();
                const into = frames[move.start + k];
                const share = k / count;

                for (let n = 0; n < flags * 4; n++) {
                    into[n] = past[n] + (into[n] - past[n]) * share;
                }

                moving();
            }
        }

        move.length = move.frames * step;
        moves[name] = move;

        return avatar;
    };

    play("guard", { loop: true, settle: CROWD.settle, start: (avatar) => avatar.actions.setGuard(true), until: (avatar, t) => t >= CROWD.guard });
    yield;

    play("stand", { loop: true, away: true, settle: CROWD.settle, start: (avatar) => avatar.actions.setGuard(false), until: (avatar, t) => t >= CROWD.stand });
    play("ready", { loop: true, settle: CROWD.settle, start: (avatar) => avatar.actions.setGuard(false), until: (avatar, t) => t >= CROWD.stand });
    yield;

    // (Onto guard and off it, as an avatar eases there: from standing, its weapon in hand, and back)
    play("rise", {
        settle: CROWD.settle,
        start: () => {},
        until: (avatar, t) => {
            avatar.actions.setGuard(true);

            return t >= CROWD.turn;
        },
    });
    play("lower", {
        settle: CROWD.settle,
        start: (avatar) => avatar.actions.setGuard(true),
        until: (avatar, t) => {
            avatar.actions.setGuard(false);

            return t >= CROWD.turn;
        },
    });
    yield;

    for (const [name, speed, away] of [
        ["walk", CROWD.walk, false],
        ["stroll", CROWD.walk, true],
        ["run", CROWD.run, false],
    ]) {
        let last = Infinity;

        play(name, {
            loop: true,
            speed,
            away,
            as: name === "run",
            start: (avatar) => avatar.actions.setGuard(name === "run"),
            until: (avatar) => {
                const wrapped = avatar.walker.phase < last && last !== Infinity;

                last = avatar.walker.phase;

                return wrapped;
            },
        });
        moves[name].stride = speed * moves[name].length;
        yield;
    }

    play("attack", {
        start: (avatar) => {
            avatar.actions.setGuard(true);
            avatar.actions.startAttack(attack.animation, { hitAt: attack.hitAt / 1000, duration: attack.duration / 1000 });
        },
        until: (avatar, t) => t >= attack.duration / 1000 + step,
    });
    moves.attack.hitAt = attack.hitAt / 1000;
    yield;

    if (cast) {
        play("cast", {
            start: (avatar) => {
                avatar.actions.setGuard(true);
                avatar.actions.startAttack(cast, CAST);
            },
            until: (avatar, t) => t >= CAST.duration + step,
        });
        moves.cast.hitAt = CAST.hitAt;
        yield;
    }

    play("hit", {
        as: true,
        start: (avatar) => {
            avatar.actions.setGuard(true);
            avatar.actions.react(reaction, { from: 0 });
        },
        until: (avatar, t) => t >= (REACTIONS[reaction]?.length ?? 0.45) + step,
    });
    yield;

    // (Its weapon drawn, from standing at ease, and put away again, from standing with it in hand:
    // as an avatar draws, actions.js draw, each moment's flags what's in hand then)
    if (stows) {
        for (const [name, on] of [
            ["draw", true],
            ["sheathe", false],
        ]) {
            let lasts = 0;

            play(name, {
                away: on,
                settle: CROWD.settle,
                start: (avatar) => avatar.actions.setGuard(false),
                until: (avatar, t) => {
                    // (Begun once it's settled: the first moment as it stands)
                    if (t <= step + 1e-9) {
                        lasts = avatar.actions.draw(guard, on) + step;
                    }

                    return t >= lasts + step;
                },
            });
            yield;
        }
    }

    let lands = 1;

    play("die", {
        as: true,
        start: (avatar) => {
            lands = avatar.actions.die({ from: 0 }) ?? 1;
        },
        until: (avatar, t) => t >= lands + CROWD.lie,
    });
    moves.die.lands = lands;

    // (Its weapons in hand again, as its figure has them)
    character.sheathe(false);

    const data = new Float32Array(width * 4 * frames.length);

    frames.forEach((row, k) => data.set(row, k * width * 4));

    return { data, rows: frames.length, width, flags, moves };
}

// --- Drawing them ---

// The figure's material: three.js's standard one, its corners moved by the bones they're bound
// to as each instance is posed (crowdFrame: the two moments of its moves it's between, and how
// far between), read from the picture of its moves (crowdMoves); what it carries shown in hand or
// put away as that moment's flags say (the texel `flags` of each row, or none: -1; AS, as the
// instance is: crowdState's first), the rest folded away; each corner shining as what it's of
// does (crowdSurface: its metalness and roughness); and the instance faded from sight as
// crowdState's second says (1 all there, 0 gone), a few more of its pixels left out at a time
function crowdMaterial(picture, moves, flags = -1) {
    const material = new THREE.MeshStandardMaterial({ map: picture, vertexColors: true, roughness: 0.8, metalness: 0, side: THREE.DoubleSide, alphaTest: 0.4 });

    material.onBeforeCompile = (shader) => {
        shader.uniforms.crowdMoves = { value: moves };
        shader.uniforms.crowdFlags = { value: flags };
        shader.vertexShader = shader.vertexShader
            .replace(
                "#include <common>",
                `#include <common>
uniform highp sampler2D crowdMoves;
uniform int crowdFlags;
attribute vec4 crowdBones;
attribute vec4 crowdWeights;
attribute vec3 crowdFrame;
attribute vec2 crowdState;
attribute float crowdSet;
attribute vec2 crowdSurface;
varying vec2 vCrowdSurface;
varying float vCrowdShown;
mat4 crowdBone( float bone, float row ) {
	int x = int( bone ) * 3;
	int y = int( row );
	vec4 a = texelFetch( crowdMoves, ivec2( x, y ), 0 );
	vec4 b = texelFetch( crowdMoves, ivec2( x + 1, y ), 0 );
	vec4 c = texelFetch( crowdMoves, ivec2( x + 2, y ), 0 );
	return mat4( vec4( a.x, b.x, c.x, 0.0 ), vec4( a.y, b.y, c.y, 0.0 ), vec4( a.z, b.z, c.z, 0.0 ), vec4( a.w, b.w, c.w, 1.0 ) );
}
mat4 crowdPose( float row ) {
	mat4 pose = crowdBone( crowdBones.x, row ) * crowdWeights.x;
	if ( crowdWeights.y > 0.0 ) pose += crowdBone( crowdBones.y, row ) * crowdWeights.y;
	if ( crowdWeights.z > 0.0 ) pose += crowdBone( crowdBones.z, row ) * crowdWeights.z;
	if ( crowdWeights.w > 0.0 ) pose += crowdBone( crowdBones.w, row ) * crowdWeights.w;
	return pose;
}
bool crowdShows() {
	if ( crowdFlags < 0 || crowdSet < 0.5 ) return true;
	vec4 held = texelFetch( crowdMoves, ivec2( crowdFlags, int( crowdFrame.z < 0.5 ? crowdFrame.x : crowdFrame.y ) ), 0 );
	float inHand = crowdSet < 2.5 ? held.x : held.y;
	if ( abs( inHand - ${AS.toFixed(1)} ) < 0.25 ) inHand = crowdState.x;
	return mod( crowdSet, 2.0 ) > 0.5 ? inHand > 0.5 : inHand < 0.5;
}`,
            )
            .replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\n\tmat4 crowdSkin = crowdPose( crowdFrame.x ) * ( 1.0 - crowdFrame.z ) + crowdPose( crowdFrame.y ) * crowdFrame.z;\n\tobjectNormal = normalize( mat3( crowdSkin ) * objectNormal );")
            .replace("#include <begin_vertex>", "#include <begin_vertex>\n\ttransformed = crowdShows() ? ( crowdSkin * vec4( transformed, 1.0 ) ).xyz : vec3( 0.0 );\n\tvCrowdSurface = crowdSurface;\n\tvCrowdShown = crowdState.y;");
        shader.fragmentShader = shader.fragmentShader
            .replace(
                "#include <common>",
                `#include <common>
varying vec2 vCrowdSurface;
varying float vCrowdShown;
const float crowdBayer[ 16 ] = float[ 16 ]( 0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0 );`,
            )
            .replace("#include <roughnessmap_fragment>", "float roughnessFactor = vCrowdSurface.y;")
            .replace("#include <metalnessmap_fragment>", "float metalnessFactor = vCrowdSurface.x;")
            .replace(
                "#include <alphatest_fragment>",
                `#include <alphatest_fragment>
	if ( vCrowdShown < 1.0 ) {
		ivec2 cell = ivec2( gl_FragCoord.xy ) % 4;
		if ( ( crowdBayer[ cell.y * 4 + cell.x ] + 0.5 ) / 16.0 >= vCrowdShown ) discard;
	}`,
            );
    };
    material.customProgramCacheKey = () => "crowd";

    return material;
}

// How many instances a batch is made for to start with, and grown by (doubling)
const FIRST_ROOM = 32;

/**
 * Everyone of a kind drawn as instances of its figure (`template`), near and far (CROWD.far): two
 * meshes, each its own instances' places and moments over the figure's corners.
 */
class Batch {
    constructor(scene, template) {
        this.scene = scene;
        this.template = template;
        this.material = crowdMaterial(template.picture, template.moves, template.flags ?? -1);
        this.room = 0;
        this.near = null;
        this.far = null;
    }

    // Room for `count` instances in each (made again, bigger, when there isn't)
    #fit(count) {
        if (count <= this.room) {
            return;
        }

        this.room = Math.max(FIRST_ROOM, this.room * 2);

        while (this.room < count) {
            this.room *= 2;
        }

        for (const name of ["near", "far"]) {
            const old = this[name];
            const source = this.template.geometry;
            const geometry = new THREE.BufferGeometry();

            for (const [key, attribute] of Object.entries(source.attributes)) {
                geometry.setAttribute(key, attribute);
            }

            geometry.setIndex(this.template[`${name}Index`] ?? source.index);
            geometry.setAttribute("crowdFrame", new THREE.InstancedBufferAttribute(new Float32Array(this.room * 3), 3).setUsage(THREE.DynamicDrawUsage));
            geometry.setAttribute("crowdState", new THREE.InstancedBufferAttribute(new Float32Array(this.room * 2), 2).setUsage(THREE.DynamicDrawUsage));

            const mesh = new THREE.InstancedMesh(geometry, this.material, this.room);

            mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            mesh.count = 0;
            mesh.frustumCulled = false;
            mesh.castShadow = false;
            mesh.receiveShadow = true;
            mesh.name = `crowd ${this.template.key} ${name}`;
            this.scene.add(mesh);

            if (old) {
                old.removeFromParent();
                old.geometry.deleteAttribute("crowdFrame");
                old.geometry.deleteAttribute("crowdState");
                old.geometry.dispose();
                old.dispose();
            }

            this[name] = mesh;
        }
    }

    /** Draw these (each { matrix, frame: [row, row, between, armed], shown, far }), as many as are in view. */
    draw(members) {
        if (!members.length && !this.near) {
            return;
        }

        this.#fit(members.length);

        const counts = { near: 0, far: 0 };

        for (const { matrix, frame, shown = 1, far } of members) {
            const name = far ? "far" : "near";
            const mesh = this[name];
            const k = counts[name]++;

            mesh.setMatrixAt(k, matrix);
            mesh.geometry.attributes.crowdFrame.setXYZ(k, frame[0], frame[1], frame[2]);
            mesh.geometry.attributes.crowdState.setXY(k, frame[3] ?? 1, shown);
        }

        for (const name of ["near", "far"]) {
            const mesh = this[name];

            mesh.count = counts[name];
            mesh.visible = counts[name] > 0;
            mesh.instanceMatrix.needsUpdate = true;
            mesh.geometry.attributes.crowdFrame.needsUpdate = true;
            mesh.geometry.attributes.crowdState.needsUpdate = true;
        }
    }

    dispose() {
        for (const mesh of [this.near, this.far]) {
            if (mesh) {
                mesh.removeFromParent();
                mesh.geometry.deleteAttribute("crowdFrame");
                mesh.geometry.deleteAttribute("crowdState");
                mesh.geometry.dispose();
                mesh.dispose();
            }
        }

        this.material.dispose();
    }
}

/**
 * A kind's figure and its moves, made a step at a time (each a yield) from a character built as
 * `look` has it ({ shape, look, equipment, walk }: soldiers.js soldierLook), carrying `weapon`
 * (weapons.js: its first blow `attack`, `reaction` how a blow of it makes one flinch), fighting
 * as `guard` has it, casting as `cast` has it (CROWD_CASTS, or not at all), its pictures `size`
 * pixels square: returns { key, geometry, farIndex, picture, moves (a texture), table (MOVES'
 * rows and lengths), height }.
 */
export function* makingTemplate(kit, key, { look, guard, attack, reaction = "slash", cast = null, size = 256 }) {
    const character = yield* Character.building(kit, { shape: look.shape, look: look.look, equipment: look.equipment, hairDetail: CROWD.hair, merge: true, far: true });

    try {
        // (Its far level of detail, made elsewhere: waited for, a while)
        if (kit.lods) {
            character.lowerDetail(kit.lods);

            for (let k = 0; k < CROWD.wait && !(character.lowBodies && character.garments.every(({ userData }) => userData.detail)); k++) {
                yield WAITING;
            }
        }

        character.setDetail(LODS.length);
        character.sheathe(false);
        character.object.traverse((node) => {
            node.castShadow = false;
        });

        // (Stood on guard a moment, what it holds where it's held)
        const avatar = new Avatar(character, { walk: look.walk, guard });

        avatar.place(0, 0, 0);
        avatar.actions.setGuard(true);

        for (let k = 0; k < 10; k++) {
            avatar.update(1 / CROWD.fps, 0, 0, 0, true);
        }

        // (Its figure merged first: falling, it lets go of what it holds)
        const { geometry, picture, height } = figureOf(character, size, { stowed: true });

        yield;

        const recorded = yield* recordingMoves(character, { walk: look.walk, guard, attack, reaction, cast });

        return yield* templateFrom(kit, key, { geometry, picture, height, recorded });
    } finally {
        character.dispose();
    }
}

/**
 * A kind's figure (figureOf's `geometry`, `picture` and `height`) and its moves as they were
 * recorded (`recorded`: recordingMoves'), made a template to draw (makingTemplate's), its fewer
 * triangles near and far waited for a while (each a yield).
 */
export function* templateFrom(kit, key, { geometry, picture, height, recorded }) {
    // (Its moves as half floats: half the memory, a millimetre or so out at most where a figure's
    // a couple of metres tall; turned a few rows at a time)
    const halves = new Uint16Array(recorded.data.length);
    const row = recorded.width * 4;

    for (let k = 0; k < halves.length; k++) {
        halves[k] = THREE.DataUtils.toHalfFloat(recorded.data[k]);

        if (k % (row * 16) === row * 16 - 1) {
            yield;
        }
    }

    const moves = new THREE.DataTexture(halves, recorded.width, recorded.rows, THREE.RGBAFormat, THREE.HalfFloatType);

    moves.needsUpdate = true;

    const template = { key, geometry, nearIndex: null, farIndex: null, picture, moves, table: recorded.moves, flags: recorded.flags ?? -1, height };

    // (Fewer triangles near, and fewer still far off: made elsewhere, waited for a while; drawn
    // as merged till they come)
    if (kit.lods) {
        const lowering = ["near", "far"].map((level) =>
            kit.lods
                .of(`crowd:${key}@${level}`, () => ({ indices: geometry.index.array, positions: geometry.attributes.position.array, uvs: geometry.attributes.uv.array, share: CROWD[level].share, error: CROWD[level].error, flags: ["Permissive", "Prune"] }))
                .then(
                    (lower) => {
                        if (!template.disposed) {
                            template[`${level}Index`] = new THREE.BufferAttribute(geometry.index.array instanceof Uint32Array ? Uint32Array.from(lower) : Uint16Array.from(lower), 1);
                        }
                    },
                    () => {},
                ),
        );
        let lowered = false;

        Promise.all(lowering).then(() => (lowered = true));

        for (let k = 0; k < CROWD.wait && !lowered; k++) {
            yield WAITING;
        }
    }

    return template;
}

/**
 * The crowds: everyone drawn as one of a kind (CrowdAvatar), each kind's figure made once (a step
 * at a time, in the frame's time to spare: work), and drawn each frame (draw).
 */
export class Crowd {
    /**
     * @param {THREE.Scene} scene
     * @param {object} kit - What characters are made from (characters/kit.js).
     * @param {object} [options]
     * @param {number} [options.size] - Each figure's pictures' size (pixels square).
     */
    constructor(scene, kit, { size = 256 } = {}) {
        this.scene = scene;
        this.kit = kit;
        this.size = size;

        /** Each kind's figure: key -> { template, batch } once made, or { making } (Steps: makingTemplate's), or { failed }. */
        this.kinds = new Map();
        this.waiting = [];

        /** Everyone drawn in the crowds. */
        this.members = new Set();
    }

    /**
     * A kind's figure if it's made (and asked for, if not yet: `spec` as makingTemplate takes it, or
     * as its own `make` does, made as that has it: beasts/herd.js), else null.
     */
    template(key, spec) {
        const kind = this.kinds.get(key);

        if (kind) {
            return kind.template ?? null;
        }

        this.kinds.set(key, { making: new Steps((spec.make ?? makingTemplate)(this.kit, key, { size: this.size, ...spec }), `crowd figure ${key}`) });
        this.waiting.push(key);

        return null;
    }

    /** Whether a kind's figure is being made, or waiting to be. */
    get busy() {
        return this.waiting.length > 0;
    }

    /** Whether a kind's figure is made. */
    made(key) {
        return Boolean(this.kinds.get(key)?.template);
    }

    /** The kinds of `keys` waiting made first, in their order; the rest after them, as they were. */
    first(keys) {
        this.waiting = [...new Set([...keys.filter((key) => this.waiting.includes(key)), ...this.waiting])];
    }

    /**
     * Make what's waiting, a step at a time, till `until` (performance.now()'s), the first waiting
     * first; one waiting on work done elsewhere (its skin painted, its detail lowered) left till a
     * later frame, unless it's not to `wait`.
     */
    work(until, { wait = true } = {}) {
        for (const key of [...this.waiting]) {
            const kind = this.kinds.get(key);

            if (performance.now() >= until) {
                break;
            }

            try {
                if (kind.making.take(until, { wait })) {
                    this.waiting.splice(this.waiting.indexOf(key), 1);
                    this.kinds.set(key, { template: kind.making.value, batch: new Batch(this.scene, kind.making.value) });
                }
            } catch (error) {
                console.warn(`The crowd's ${key} couldn't be made`, error);
                this.waiting.splice(this.waiting.indexOf(key), 1);
                this.kinds.set(key, { failed: true });
            }
        }
    }

    /** Whether a kind's figure couldn't be made. */
    failed(key) {
        return Boolean(this.kinds.get(key)?.failed);
    }

    /** Someone drawn in the crowd (CrowdAvatar). */
    join(avatar) {
        this.members.add(avatar);
    }

    leave(avatar) {
        this.members.delete(avatar);
    }

    /**
     * Draw everyone in the crowds as they are now, those in view of `camera` (`pixels`: how many
     * pixels tall a metre is a metre from it, view.js pixelsPerMetre): each kind's in one go near,
     * one far; and the kinds nobody's been of for CROWD_KEEP let go of (`now`: ms, as
     * performance.now()). Returns how many were drawn.
     */
    draw(camera, pixels = 0, now = performance.now()) {
        _view.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        _frustum.setFromProjectionMatrix(_view);

        const each = new Map();
        const eye = camera.position;
        let drawn = 0;

        for (const avatar of this.members) {
            const kind = this.kinds.get(avatar.key);

            if (kind) {
                kind.used = now;
            }

            if (!kind?.template || !avatar.object.visible) {
                continue;
            }

            const template = kind.template;
            const position = avatar.object.position;

            const tall = template.height * avatar.size;

            _sphere.center.set(position.x, position.y + tall / 2, position.z);
            _sphere.radius = tall;

            if (!_frustum.intersectsSphere(_sphere)) {
                continue;
            }

            const list = each.get(kind) ?? each.set(kind, []).get(kind);

            const away = position.distanceTo(eye);

            list.push({ matrix: avatar.placed(), frame: avatar.frameIn(template.table), shown: avatar.shown, far: Boolean(template.farIndex) && (away > CROWD.far.from || (tall * pixels) / Math.max(away, 0.1) < CROWD.far.below) });
            drawn++;
        }

        for (const [key, kind] of this.kinds) {
            if (kind.template && now - (kind.used ??= now) > CROWD_KEEP) {
                letGoOf(kind);
                this.kinds.delete(key);
            } else {
                kind.batch?.draw(each.get(kind) ?? []);
            }
        }

        return drawn;
    }

    dispose() {
        for (const kind of this.kinds.values()) {
            letGoOf(kind);
        }

        this.kinds.clear();
        this.waiting = [];
        this.members.clear();
    }
}

// How closely a crowd's soldier follows its place in the battle (as avatar.js's FOLLOW), how fast it
// turns (radians a second), and over which it faces the way it's going (metres a second)
const FOLLOW = 12;
const TURN_SPEED = 9;
const HEADING_SPEED = 0.5;
const wrapAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

/**
 * One drawn in a crowd: to the game, an avatar (avatar.js) like any other, followed to where its
 * actor is, turned, struck, falling; drawn as one of its kind (`key`: the Crowd's), at what it's
 * doing in its moves. Its `character` stands for a character's few parts the game asks about; its
 * `object` (nothing drawn of its own) is put in the scene for what's left on it (arrows stuck in it).
 */
export class CrowdAvatar {
    /**
     * @param {Crowd} crowd
     * @param {string} key - Its kind (the crowd's).
     * @param {object} [options]
     * @param {number} [options.height] - How tall it is, till its kind's figure is made (metres).
     * @param {number} [options.size] - How big it's drawn, its figure's size times (a creature bigger or smaller than its kind's).
     * @param {boolean} [options.standIn] - Standing in for one drawn in full (track, echo), not an avatar of its own.
     */
    constructor(crowd, key, { height = 1.75, tint = 1, size = 1, standIn = false } = {}) {
        this.crowd = crowd;
        this.key = key;
        this.object = new THREE.Object3D();
        this.object.name = "crowd";
        this.tint = tint;
        this.size = size;
        this.standIn = standIn;
        this.facing = 0;
        this.last = new THREE.Vector3();
        this.follow = { x: 0, z: 0, vx: 0, vz: 0 };
        this.every = 1;
        this.compiling = false;

        /** Its own clock (seconds), and what it's doing: a move, from when, how fast; fallen, from when. */
        this.time = Math.random() * 10;
        this.doing = null;
        this.fallen = null;
        this.guarding = false;

        /** Whether its weapon's in hand (else put away, a shield slung on its back: its kind's moves' flags, AS). */
        this.armed = false;

        /** How much of it's seen (1 all of it: fading from sight, less, as one in full takes its place). */
        this.shown = 1;

        /** The move it was last drawn in (its name in its kind's), the row drawn and when, and easing from it into another (frameIn). */
        this.moveName = null;
        this.shownRow = null;
        this.blend = null;
        this.drawnAt = -Infinity;

        /** Thrown by a blast (#toss), if it is: { from, to, flight, up, ground, start, rises, axis, height }. */
        this.tossed = null;
        this.tumble = new THREE.Quaternion();

        /** How far through a stride it is (0 to 1), walking or running. */
        this.stride = Math.random();

        const self = this;
        const sockets = new Map();

        this.character = {
            object: this.object,
            get height() {
                return (crowd.kinds.get(key)?.template?.height ?? height) * self.size;
            },
            get sheathed() {
                return !self.armed;
            },
            slings: false,
            // (A flash of red on a blow, as a character's skin has: not shown in a crowd)
            materials: { body: { emissive: new THREE.Color() } },
            expressions: null,
            gaze: null,
            // (Where what lands on it stays, about where its bones would be: its head, its chest)
            rig: {
                bone: (name) => {
                    if (!sockets.has(name)) {
                        const socket = new THREE.Object3D();

                        socket.position.set(0, this.character.height * (/Head|Neck/.test(name) ? 0.92 : /Hips|Leg|Foot/.test(name) ? 0.5 : 0.72), 0);
                        this.object.add(socket);
                        sockets.set(name, socket);
                    }

                    return sockets.get(name);
                },
            },
            mesh: { castShadow: false },
            // (Its weapon put away or in hand, at once: its shield with it)
            sheathe(on = true) {
                self.armed = !on;
            },
            sling() {},
            setEquipment() {},
            fitDetail() {},
            lowerDetail() {},
            holdTorch() {
                return null;
            },
            dispose: () => {
                crowd.leave(self);
                self.object.removeFromParent();
            },
        };
        this.walker = { onStep: null, phase: 0, release() {} };
        this.actions = {
            emoting: false,
            busy: false,
            get quick() {
                return Boolean(self.doing);
            },
            resting: false,
            drawing: false,
            // (Onto guard or off it, as one in full eases there: frameIn)
            setGuard: (on) => (this.guarding = on),
            setWeapon() {},
            setSeated() {},
            // (A spell cast, as its kind casts if it does; any other, its weapon's blow)
            startAttack: (name, { duration = 1 } = {}) => this.#start(name.startsWith("cast") && this.crowd.kinds.get(key)?.template?.table.cast ? "cast" : "attack", duration),
            react: () => this.#start("hit"),
            dodge: () => this.#start("hit"),
            knockdown: () => this.#start("hit"),
            die: () => {
                this.fallen ??= this.time;
                this.doing = null;

                if (this.tossed) {
                    this.tossed.rises = null;
                }

                return crowd.kinds.get(key)?.template?.table.die.lands ?? 1;
            },
            revive: () => {
                this.fallen = null;
                this.tossed = null;
            },
            // (Thrown by a blast: flung whole, as one in full is limp, #toss)
            toss: (options) => this.#toss(options),
            emote() {},
            stopEmote() {},
            rest() {},
            stopResting() {},
            // (Its weapon drawn, its shield taken off its back first, or put away: as its kind's
            // moves have it, if they do, else at once)
            draw: (name, on = true) => {
                const move = this.crowd.kinds.get(key)?.template?.table[on ? "draw" : "sheathe"];

                this.armed = on;

                if (move && this.fallen === null) {
                    this.#start(on ? "draw" : "sheathe");
                }

                return move?.length ?? 0;
            },
            holdPose() {},
        };

        crowd.join(this);
    }

    // Thrown by a blast (as one drawn in full is, limp: actions.js toss; here its whole figure): from
    // where it is, to land about `to` ([x, z] in the world) `flight` seconds later, its arc `up`
    // metres high over the ground (`ground(x, z)`, metres), going once head over heels away from
    // where it was thrown from as its fall plays, to lie where it lands as its fall ends; up again
    // `seconds` after it was thrown (null: dead, it lies there). How long till it lands (seconds)
    #toss({ to, flight, up, ground, seconds = null }) {
        const from = this.object.position.clone();
        const way = new THREE.Vector3(to[0] - from.x, 0, to[1] - from.z);

        this.tossed = { from, to, flight: Math.max(0.3, flight), up, ground, start: this.time, rises: seconds, axis: way.lengthSq() > 1e-6 ? new THREE.Vector3().crossVectors(_up, way.normalize()) : new THREE.Vector3(1, 0, 0) };
        this.fallen = this.time;
        this.doing = null;

        return this.tossed.flight;
    }

    /** Is it thrown (#toss) and not on its feet again yet? */
    get thrown() {
        return Boolean(this.tossed);
    }

    /** Is it in the air, thrown (#toss), not down yet? */
    get airborne() {
        return Boolean(this.tossed) && this.time - this.tossed.start < this.tossed.flight;
    }

    // Thrown (#toss), `dt` seconds on: along its arc, turning over as it goes, down where it lands;
    // lying there, then up again once it's time (where its actor is, `x`, `z`). Whether it's still
    // thrown (and placed so)
    #flung(dt, x, z) {
        const tossed = this.tossed;
        const u = Math.min(1, (this.time + dt - tossed.start) / tossed.flight);
        const [lx, lz] = [tossed.from.x + (tossed.to[0] - tossed.from.x) * u, tossed.from.z + (tossed.to[1] - tossed.from.z) * u];

        this.time += dt;

        if (tossed.rises !== null && this.time - tossed.start >= tossed.rises) {
            this.tossed = null;
            this.fallen = null;
            this.tumble.identity();
            Object.assign(this.follow, { x: lx, z: lz, vx: 0, vz: 0 });

            return false;
        }

        this.object.position.set(lx, tossed.ground(lx, lz) + 4 * tossed.up * u * (1 - u), lz);
        this.last.copy(this.object.position);
        Object.assign(this.follow, { x, z, vx: 0, vz: 0 });
        this.tumble.setFromAxisAngle(tossed.axis, u < 1 ? Math.PI * 2 * (u * u * (3 - 2 * u)) : 0);

        return true;
    }

    // A move begun (`seconds` long, as it's played: the recorded one's sped up or slowed to it)
    #start(name, seconds = null) {
        const move = this.crowd.kinds.get(this.key)?.template?.table[name];

        this.doing = { name, from: this.time, rate: move && seconds ? move.length / seconds : 1 };
    }


    /** Put it straight somewhere (metres), facing a way (radians from south, towards east). */
    place(x, z, facing = 0) {
        this.object.position.set(x, 0, z);
        this.object.rotation.y = facing;
        this.facing = facing;
        this.last.copy(this.object.position);
        Object.assign(this.follow, { x, z, vx: 0, vz: 0 });
    }

    /** Follow its actor, as an avatar does (avatar.js update); its stride kept with how far it's gone. */
    update(dt, x, z, facing, steer = true) {
        // (Thrown: flung along its arc, lying where it lands, till it's up: #flung)
        if (this.tossed && this.#flung(dt, x, z)) {
            return;
        }

        const follow = this.follow;
        const decay = Math.exp(-FOLLOW * dt);
        const ex = follow.x - x;
        const ez = follow.z - z;
        const jx = follow.vx + FOLLOW * ex;
        const jz = follow.vz + FOLLOW * ez;

        follow.x = x + (ex + jx * dt) * decay;
        follow.z = z + (ez + jz * dt) * decay;
        follow.vx = (follow.vx - FOLLOW * jx * dt) * decay;
        follow.vz = (follow.vz - FOLLOW * jz * dt) * decay;

        const moved = Math.hypot(follow.x - this.last.x, follow.z - this.last.z);
        const heading = steer && Math.hypot(follow.vx, follow.vz) > HEADING_SPEED ? Math.atan2(follow.vx, follow.vz) : facing;
        const most = TURN_SPEED * dt;

        this.object.position.x = follow.x;
        this.object.position.z = follow.z;
        this.last.copy(this.object.position);
        this.facing = wrapAngle(this.facing + Math.max(-most, Math.min(most, wrapAngle(heading - this.facing))));
        this.object.rotation.y = this.facing;
        this.time += dt;

        // (Its stride: as far through as it's gone over a stride's length, walking or running)
        const table = this.crowd.kinds.get(this.key)?.template?.table;
        const move = this.#gait(table);

        if (move) {
            this.stride = (this.stride + moved / (move.stride * this.size)) % 1;
        }
    }

    // Walking or running, the move it's drawn with (null standing): running sooner the smaller it
    // is (as a beast does: beasts/beast.js)
    #gait(table) {
        const speed = Math.hypot(this.follow.vx, this.follow.vz);

        return !table || speed < CROWD.still ? null : speed > CROWD.pace * Math.sqrt(this.size) ? table.run : this.armed ? table.walk : (table.stroll ?? table.walk);
    }

    /** How fast the quickest of it is going (metres a second), as avatar.js's. */
    get motion() {
        return Math.hypot(this.follow.vx, this.follow.vz);
    }

    angleTo(x, z) {
        return wrapAngle(Math.atan2(x - this.object.position.x, z - this.object.position.z) - this.facing);
    }

    point(share = 0.72, target = new THREE.Vector3()) {
        return target.set(this.object.position.x, this.object.position.y + this.character.height * share, this.object.position.z);
    }

    /** Where a hand is, about: before it, at the chest's height, to that side. */
    hand(side = "Right", target = new THREE.Vector3()) {
        const across = side === "Right" ? -0.25 : 0.25;
        const [s, c] = [Math.sin(this.facing), Math.cos(this.facing)];

        return target.set(this.object.position.x + c * across + s * 0.3, this.object.position.y + this.character.height * 0.72, this.object.position.z - s * across + c * 0.3);
    }

    /** Where it's drawn: its place, turned the way it faces (and over about its middle, thrown: #flung), at its size. */
    placed() {
        _quaternion.setFromAxisAngle(_up, this.facing).premultiply(this.tumble);
        _scale.setScalar(this.size);

        if (!this.tossed) {
            return _matrix.compose(this.object.position, _quaternion, _scale).clone();
        }

        const middle = new THREE.Vector3(0, this.character.height * 0.5, 0);

        return _matrix.compose(this.object.position.clone().add(middle).sub(middle.clone().applyQuaternion(this.tumble)), _quaternion, _scale).clone();
    }

    /**
     * Standing in for `avatar` (one drawn in full, its body not drawn meanwhile), `dt` seconds on:
     * drawn where it is, the way it faces, seen as it is, going as fast (its stride kept with how
     * far it's gone).
     */
    track(avatar, dt) {
        const position = avatar.object.position;
        const moved = Math.hypot(position.x - this.object.position.x, position.z - this.object.position.z);

        this.object.position.copy(position);
        this.object.visible = avatar.object.visible;
        this.facing = avatar.facing;
        Object.assign(this.follow, avatar.follow);
        this.time += dt;

        // (Its weapon in hand or put away, and on guard or not, as it has them: but as its own
        // drawing or putting away plays)
        if (avatar.character && !["draw", "sheathe"].includes(this.doing?.name)) {
            this.armed = !avatar.character.sheathed;
        }

        this.actions.setGuard((avatar.actions?.guardTarget ?? 0) > 0);

        const move = this.#gait(this.crowd.kinds.get(this.key)?.template?.table);

        if (move) {
            this.stride = (this.stride + moved / (move.stride * this.size)) % 1;
        }
    }

    /**
     * Told what `avatar` is told to do from now (its actions: a blow, a cast, a flinch, a fall, back
     * up), as well as it, till what this returns is called; already down, lying (`deadFor` seconds).
     */
    echo(avatar, { deadFor = null } = {}) {
        const actions = avatar.actions;
        const names = ["startAttack", "react", "dodge", "knockdown", "die", "revive", "draw"];

        this.fallen = deadFor === null ? null : this.time - deadFor;
        this.doing = null;

        const before = new Map();

        for (const name of names) {
            const own = actions[name];

            // (Not one it does: a beast doesn't dodge)
            if (typeof own !== "function") {
                continue;
            }

            // (Its own, if it was one of its own, put back after: else what it is again)
            before.set(name, Object.hasOwn(actions, name) ? own : null);
            actions[name] = (...args) => {
                this.actions[name](...args);

                return own.apply(actions, args);
            };
        }

        return () => {
            for (const [name, own] of before) {
                if (own) {
                    actions[name] = own;
                } else {
                    delete actions[name];
                }
            }
        };
    }

    /**
     * Where it is in its moves (`table`: a template's), as two of their rows and how far between
     * them, and whether its weapon's in hand (1) or put away (0): fallen, its fall (then lying); in
     * the middle of a blow, a flinch, a draw or going onto guard or off it, that; walking (at ease
     * with its weapon put away) or running, its stride; else on guard, or standing, its weapon in
     * hand or put away.
     */
    frameIn(table) {
        let name = this.guarding ? "guard" : this.armed ? "ready" : "stand";
        let at = 0;

        if (!table[name]) {
            name = "guard";
        }

        if (this.fallen !== null) {
            name = "die";
            at = Math.min(1, (this.time - this.fallen) / table.die.length);
        } else {
            const doing = this.doing && table[this.doing.name];
            const through = doing ? ((this.time - this.doing.from) * this.doing.rate) / doing.length : Infinity;
            const gait = through < 1 ? null : this.#gait(table);

            if (through < 1) {
                name = this.doing.name;
                at = through;
            } else if (gait) {
                this.doing = null;
                name = Object.keys(table).find((key) => table[key] === gait);
                at = this.stride;
            } else {
                this.doing = null;

                // (Onto guard or off it as one in full eases there, from where it stood: rise, lower;
                // not if it wasn't drawn just now, out of sight)
                const was = this.time - this.drawnAt <= CROWD.blend ? (ENDS_AS[this.moveName] ?? this.moveName) : null;
                const turn = was === "ready" && name === "guard" ? "rise" : was === "guard" && name === "ready" ? "lower" : null;

                if (turn && table[turn]) {
                    this.#start(turn);
                    name = turn;
                } else {
                    at = (this.time % table[name].length) / table[name].length;
                }
            }
        }

        const move = table[name];
        const exact = at * (move.frames - (move.loop ? 0 : 1));
        const first = Math.min(move.frames - 1, Math.floor(exact));
        const next = move.loop ? (first + 1) % move.frames : Math.min(move.frames - 1, first + 1);
        let frame = [move.start + first, move.start + next, exact - Math.floor(exact), this.armed ? 1 : 0];

        // (Into one move from another: eased from where the last was drawn, over CROWD.blend, the
        // new move's moment first and the last drawn second, the share of that easing out; not if
        // it wasn't drawn just now, out of sight)
        if (name !== this.moveName) {
            this.blend = this.moveName !== null && this.shownRow !== null && this.time - this.drawnAt <= CROWD.blend ? { from: this.shownRow, start: this.time } : null;
            this.moveName = name;
        }

        this.drawnAt = this.time;

        const into = this.blend ? (this.time - this.blend.start) / CROWD.blend : 1;

        if (into < 1) {
            frame = [frame[2] < 0.5 ? frame[0] : frame[1], this.blend.from, 1 - into * into * (3 - 2 * into), frame[3]];
        } else {
            this.blend = null;
        }

        this.shownRow = frame[2] < 0.5 ? frame[0] : frame[1];

        return frame;
    }
}
