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
// placed, turned, struck and fallen as one is, its moves told to the crowd.

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
 *   near the camera, and beyond `from` metres from it.
 * - `walk`, `run`: how fast it walks and runs as those are recorded (metres a second: a soldier's,
 *   core/battle.js KINDS), and `pace`, between the two, over which it's drawn running; `still`,
 *   under which it's drawn standing.
 * - `guard`: how long its guard is recorded (seconds), played over and over; `lie`: how long it's
 *   recorded lying after its fall.
 * - `hair`: how much of its hair's grown (hair.js), little, from afar.
 * - `wait`: how many frames the figure's far level of detail is waited for (lod.js), at most.
 */
export const CROWD = Object.freeze({
    fps: 20,
    near: Object.freeze({ share: 0.45, error: 0.012 }),
    far: Object.freeze({ from: 24, share: 0.18, error: 0.05 }),
    walk: 1.3,
    run: 2.3,
    pace: 1.8,
    still: 0.25,
    guard: 2,
    lie: 0.6,
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

        if (!pixels && image) {
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
 * A character's figure, merged (as it's posed now, its far level of detail drawn: what it holds
 * where it is): every mesh drawn into one, in the space of its body as it's bound to its skeleton,
 * each corner bound to up to four bones; and one picture of its skin, its clothes and its hair
 * side by side (`size` pixels square each of the first two). Returns { geometry, picture, height }.
 */
export function figureOf(character, size = 256) {
    const object = character.object;

    object.updateMatrixWorld(true);

    const skeleton = character.rig.skeleton;
    const bones = skeleton.bones;
    const toObject = new THREE.Matrix4().copy(object.matrixWorld).invert();

    // Each bone's skinning now (in the body's space), and back again
    const unskin = bones.map((bone, i) => new THREE.Matrix4().multiplyMatrices(toObject, bone.matrixWorld).multiply(skeleton.boneInverses[i]).invert());

    // The picture: its skin's, then its clothes', side by side; its hair's and a corner of white below
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
    const painted = new Map();

    // A texture's picture painted into its place (the first time), in the picture's way up
    const paint = (texture, place, opaque) => {
        if (painted.has(place)) {
            return painted.get(place) === texture;
        }

        const image = texture?.image;

        if (!image) {
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
        }

        painted.set(place, texture);

        return true;
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
    const indices = [];
    let corners = 0;

    object.traverse((mesh) => {
        if (!mesh.isMesh || !shown(mesh, object) || !mesh.geometry?.attributes.position) {
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
            }

            // (A picture that isn't in the figure's: coloured by it, all told)
            const base = new THREE.Color(1, 1, 1).copy(material.color ?? _colour.setRGB(1, 1, 1));

            if (map && !place) {
                base.multiply(averageOf(map));
            }

            const folds = material.colours ?? null;
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

                    // Its colour and its place in the picture
                    if (place && uv) {
                        uvs.push(...place(uv.getX(v), uv.getY(v)));
                    } else {
                        uvs.push(...whiteAt);
                    }

                    if (eyes) {
                        _colour.setRGB(0.55, 0.52, 0.5);
                    } else if (folds && fold) {
                        const f = Math.round(fold.getX(v));

                        _colour.setRGB(folds[f * 3], folds[f * 3 + 1], folds[f * 3 + 2]);
                    } else {
                        _colour.copy(base);
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

    const merged = new THREE.BufferGeometry();

    merged.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    merged.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    merged.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    merged.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
    merged.setAttribute("crowdBones", new THREE.Float32BufferAttribute(boneIndices, 4));
    merged.setAttribute("crowdWeights", new THREE.Float32BufferAttribute(boneWeights, 4));
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

// Each of a skeleton's bones' skinning now, in its body's space, as three rows (12 numbers a
// bone) written into `into` at `at`
function recordPose(character, into, at) {
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
 * A character's moves (guard, walk, run, attack, hit, die), each played on it once and recorded CROWD.fps times a second, a
 * step at a time (each a yield): { data (a row of three numbers' worth for each bone at each
 * moment), rows, width (texels: three a bone), moves: name -> { start, frames, length (seconds),
 * loop }, stride: how far a walk's and a run's go over theirs (metres) }. `walk` its walk's style;
 * `guard` how it fights (actions.js GUARDS); `attack` its weapon's blow ({ animation, hitAt,
 * duration }: weapons.js, ms); `reaction` how it flinches (actions.js REACTIONS).
 */
export function* recordingMoves(character, { walk, guard, attack, reaction }) {
    const step = 1 / CROWD.fps;
    const width = character.rig.skeleton.bones.length * 3;
    const frames = [];
    const moves = {};

    // One move: `start` its avatar ready to play it, then each moment till `until` says it's done
    const play = (name, { loop = false, start, until, speed = 0, facing = 0 }) => {
        const avatar = new Avatar(character, { walk, guard });
        let z = 0;

        avatar.place(0, 0, facing);
        start(avatar);

        const move = { start: frames.length, frames: 0, length: 0, loop };
        const moving = () => {
            z += speed * step;
            avatar.update(step, 0, z, facing, true);
        };

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
            const row = new Float32Array(width * 4);

            recordPose(character, row, 0);
            frames.push(row);
            move.frames++;
            moving();
        } while (!until(avatar, move.frames * step) && move.frames < 6 * CROWD.fps);

        move.length = move.frames * step;
        moves[name] = move;
    };

    play("guard", { loop: true, start: (avatar) => avatar.actions.setGuard(true), until: (avatar, t) => t >= CROWD.guard });
    yield;

    for (const [name, speed] of [
        ["walk", CROWD.walk],
        ["run", CROWD.run],
    ]) {
        let last = Infinity;

        play(name, {
            loop: true,
            speed,
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

    play("hit", {
        start: (avatar) => {
            avatar.actions.setGuard(true);
            avatar.actions.react(reaction, { from: 0 });
        },
        until: (avatar, t) => t >= (REACTIONS[reaction]?.length ?? 0.45) + step,
    });
    yield;

    let lands = 1;

    play("die", {
        start: (avatar) => {
            lands = avatar.actions.die({ from: 0 }) ?? 1;
        },
        until: (avatar, t) => t >= lands + CROWD.lie,
    });
    moves.die.lands = lands;

    const data = new Float32Array(width * 4 * frames.length);

    frames.forEach((row, k) => data.set(row, k * width * 4));

    return { data, rows: frames.length, width, moves };
}

// --- Drawing them ---

// The figure's material: three.js's standard one, its corners moved by the bones they're bound
// to as each instance is posed (crowdFrame: the two moments of its moves it's between, and how
// far between), read from the picture of its moves (crowdMoves)
function crowdMaterial(picture, moves) {
    const material = new THREE.MeshStandardMaterial({ map: picture, vertexColors: true, roughness: 0.8, metalness: 0, side: THREE.DoubleSide, alphaTest: 0.4 });

    material.onBeforeCompile = (shader) => {
        shader.uniforms.crowdMoves = { value: moves };
        shader.vertexShader = shader.vertexShader
            .replace(
                "#include <common>",
                `#include <common>
uniform highp sampler2D crowdMoves;
attribute vec4 crowdBones;
attribute vec4 crowdWeights;
attribute vec3 crowdFrame;
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
}`,
            )
            .replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\n\tmat4 crowdSkin = crowdPose( crowdFrame.x ) * ( 1.0 - crowdFrame.z ) + crowdPose( crowdFrame.y ) * crowdFrame.z;\n\tobjectNormal = normalize( mat3( crowdSkin ) * objectNormal );")
            .replace("#include <begin_vertex>", "#include <begin_vertex>\n\ttransformed = ( crowdSkin * vec4( transformed, 1.0 ) ).xyz;");
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
        this.material = crowdMaterial(template.picture, template.moves);
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
                old.geometry.dispose();
                old.dispose();
            }

            this[name] = mesh;
        }
    }

    /** Draw these (each { matrix, frame: [row, row, between], far }), as many as are in view. */
    draw(members) {
        if (!members.length && !this.near) {
            return;
        }

        this.#fit(members.length);

        const counts = { near: 0, far: 0 };

        for (const { matrix, frame, far } of members) {
            const name = far ? "far" : "near";
            const mesh = this[name];
            const k = counts[name]++;

            mesh.setMatrixAt(k, matrix);
            mesh.geometry.attributes.crowdFrame.setXYZ(k, frame[0], frame[1], frame[2]);
        }

        for (const name of ["near", "far"]) {
            const mesh = this[name];

            mesh.count = counts[name];
            mesh.visible = counts[name] > 0;
            mesh.instanceMatrix.needsUpdate = true;
            mesh.geometry.attributes.crowdFrame.needsUpdate = true;
        }
    }

    dispose() {
        for (const mesh of [this.near, this.far]) {
            if (mesh) {
                mesh.removeFromParent();
                mesh.geometry.deleteAttribute("crowdFrame");
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
 * as `guard` has it, its pictures `size` pixels square: returns { key, geometry, farIndex,
 * picture, moves (a texture), table (MOVES' rows and lengths), height }.
 */
export function* makingTemplate(kit, key, { look, guard, attack, reaction = "slash", size = 256 }) {
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
        const { geometry, picture, height } = figureOf(character, size);

        yield;

        const recorded = yield* recordingMoves(character, { walk: look.walk, guard, attack, reaction });
        const moves = new THREE.DataTexture(recorded.data, recorded.width, recorded.rows, THREE.RGBAFormat, THREE.FloatType);

        moves.needsUpdate = true;

        const template = { key, geometry, nearIndex: null, farIndex: null, picture, moves, table: recorded.moves, height };

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
    } finally {
        character.dispose();
    }
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

    /** A kind's figure if it's made (and asked for, if not yet: `spec` as makingTemplate takes it), else null. */
    template(key, spec) {
        const kind = this.kinds.get(key);

        if (kind) {
            return kind.template ?? null;
        }

        this.kinds.set(key, { making: new Steps(makingTemplate(this.kit, key, { size: this.size, ...spec })) });
        this.waiting.push(key);

        return null;
    }

    /** Whether a kind's figure is being made, or waiting to be. */
    get busy() {
        return this.waiting.length > 0;
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
     * Draw everyone in the crowds as they are now, those in view of `camera`: each kind's in one
     * go near, one far. Returns how many were drawn.
     */
    draw(camera) {
        _view.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        _frustum.setFromProjectionMatrix(_view);

        const each = new Map();
        const eye = camera.position;
        let drawn = 0;

        for (const avatar of this.members) {
            const kind = this.kinds.get(avatar.key);

            if (!kind?.template || !avatar.object.visible) {
                continue;
            }

            const template = kind.template;
            const position = avatar.object.position;

            _sphere.center.set(position.x, position.y + template.height / 2, position.z);
            _sphere.radius = template.height;

            if (!_frustum.intersectsSphere(_sphere)) {
                continue;
            }

            const list = each.get(kind) ?? each.set(kind, []).get(kind);

            list.push({ matrix: avatar.placed(), frame: avatar.frameIn(template.table), far: Boolean(template.farIndex) && position.distanceTo(eye) > CROWD.far.from });
            drawn++;
        }

        for (const kind of this.kinds.values()) {
            kind.batch?.draw(each.get(kind) ?? []);
        }

        return drawn;
    }

    dispose() {
        for (const kind of this.kinds.values()) {
            if (kind.template) {
                kind.template.disposed = true;
                kind.template.geometry.dispose();
                kind.template.picture.dispose();
                kind.template.moves.dispose();
            }

            kind.batch?.dispose();
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
    constructor(crowd, key, { height = 1.75, tint = 1 } = {}) {
        this.crowd = crowd;
        this.key = key;
        this.object = new THREE.Object3D();
        this.object.name = "crowd";
        this.tint = tint;
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

        /** How far through a stride it is (0 to 1), walking or running. */
        this.stride = Math.random();

        const self = this;
        const sockets = new Map();

        this.character = {
            object: this.object,
            get height() {
                return crowd.kinds.get(key)?.template?.height ?? height;
            },
            sheathed: false,
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
            sheathe() {},
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
            setGuard: (on) => (this.guarding = on),
            setWeapon() {},
            setSeated() {},
            startAttack: (name, { duration = 1 } = {}) => this.#start("attack", duration),
            react: () => this.#start("hit"),
            dodge: () => this.#start("hit"),
            knockdown: () => this.#start("hit"),
            die: () => {
                this.fallen = this.time;
                this.doing = null;

                return crowd.kinds.get(key)?.template?.table.die.lands ?? 1;
            },
            revive: () => {
                this.fallen = null;
            },
            emote() {},
            stopEmote() {},
            rest() {},
            stopResting() {},
            draw() {},
            holdPose() {},
        };

        crowd.join(this);
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
            this.stride = (this.stride + moved / move.stride) % 1;
        }
    }

    // Walking or running, the move it's drawn with (null standing)
    #gait(table) {
        const speed = Math.hypot(this.follow.vx, this.follow.vz);

        return !table || speed < CROWD.still ? null : speed > CROWD.pace ? table.run : table.walk;
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

    /** Where it's drawn: its place, turned the way it faces. */
    placed() {
        _quaternion.setFromAxisAngle(_up, this.facing);

        return _matrix.compose(this.object.position, _quaternion, _scale).clone();
    }

    /**
     * Where it is in its moves (`table`: a template's), as two of their rows and how far between
     * them: fallen, its fall (then lying); in the middle of a blow or a flinch, that; walking or
     * running, its stride; else on guard.
     */
    frameIn(table) {
        let move = table.guard;
        let at = (this.time % table.guard.length) / table.guard.length;

        if (this.fallen !== null) {
            move = table.die;
            at = Math.min(1, (this.time - this.fallen) / move.length);
        } else {
            const doing = this.doing && table[this.doing.name];
            const through = doing ? ((this.time - this.doing.from) * this.doing.rate) / doing.length : Infinity;

            if (through < 1) {
                move = doing;
                at = through;
            } else {
                this.doing = null;

                const gait = this.#gait(table);

                if (gait) {
                    move = gait;
                    at = this.stride;
                }
            }
        }

        const exact = at * (move.frames - (move.loop ? 0 : 1));
        const first = Math.min(move.frames - 1, Math.floor(exact));
        const next = move.loop ? (first + 1) % move.frames : Math.min(move.frames - 1, first + 1);

        return [move.start + first, move.start + next, exact - Math.floor(exact)];
    }
}
