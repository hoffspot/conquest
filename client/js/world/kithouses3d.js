// The humans' town houses drawn from the bought house kit (art/kits/kithouse.js lays each out of
// its pieces; Meshsmith Foundry's half-timbered building kit, the licensed model
// `scenery-meshsmith-houses`): a house of a town, city or capital built of the kit's own pieces
// once the kit's read, as one mesh of each of a few materials, merged with the rest of its block or
// chunk as the procedural houses are (town3d.js): the kit's frames, braces, windows, doors and
// footings in its own baked material; the plaster between its timbers, its windows' glass (lit at
// night) and the soffits and edges under its eaves in the game's own (art/engine/materials.js); its
// roof's slopes in the kit's tiles. Till the kit's read, and without the licensed models, the
// house is the game's own (kits/house.js), and it's drawn again once it is.
//
// Each piece is kept once, from the kit's lower detail (the near one for a look close up), its
// corners moved from where the kit's file sets it (the middle of a square of its own,
// HOUSE_KIT.cell metres a side, its node named `<kind>@<i>,<j>`) to its pivot.

import * as THREE from "three";
import { ASSETS } from "../app/assets.js";
import { readyScenery, sceneryOf } from "../beasts/model.js";
import { material } from "./art/engine/materials.js";
import { Solid } from "./art/engine/solid.js";
import { planHouse } from "./art/kits/house.js";
import { HOUSE_KIT, kitBuilt, kitHouse, ROOFS } from "./art/kits/kithouse.js";
import { AWNING, kitShop, kitShopBuilt, shopLookOf } from "./art/kits/kitshop.js";
import { hangingSign, nameBoard } from "./art/kits/landmarks.js";
import { chimney } from "./art/kits/roofs.js";
import { dressShop, SHOPFRONTS } from "./art/kits/shopfront.js";
import { emblemSignTexture, loadSignFont, nameBoardTexture } from "./art/kits/signs.js";
import { awning, AWNINGS } from "./cloth.js";
import { roomLit } from "./roomlight.js";
import { createRandom } from "../core/random.js";

// World pixels in a metre (the art kits')
const P = 5;

// What of a house is only worth drawing near (town3d.js joined: a chunk's further off than
// chunks3d.js DETAIL_NEAR is drawn without it): its windows' frames (their glass is drawn from
// afar, in the hole each leaves in the plaster), its finial
const NEAR = new Set(["window", "finial"]);

// What's drawn of each piece's kinds: the kit's own material (`walls`), the plaster between the
// timbers (`fills`), a window's glass (`glass`)
const KINDS = Object.freeze(["walls", "fills", "glass"]);

/** Ask for the kit to be read (beasts/model.js readyScenery): { ready }, or null if it's read or can't be. */
export function readyHouseKit() {
    if (!KIT_HOUSES.on || sceneryOf(HOUSE_KIT.asset)) {
        return null;
    }

    asking ??= readyScenery(HOUSE_KIT.asset);

    return asking;
}

let asking = null;

/** Whether the kit's been read (its houses drawn from it). */
export const houseKitRead = () => KIT_HOUSES.on && Boolean(sceneryOf(HOUSE_KIT.asset));

/**
 * Whether houses are built of the kit at all (the building lab's &kit=0: the game's own), and in
 * which of its details ("far": its lower, as the world's drawn; "near", for a look close up).
 */
export const KIT_HOUSES = { on: true, detail: "far" };

/**
 * A house of the layout (`piece`: its `settlement` the kind of place it's in) built of the kit, as
 * the art kits build theirs: a group in world pixels, its corner at the lot's north-west, facing
 * south; or null if it isn't one the kit builds, or the kit isn't read (the game's own's drawn).
 * `detail`: "far" (the kit's lower detail, as it's drawn in the world) or "near".
 */
export function kitHouseObject(piece, { detail = KIT_HOUSES.detail } = {}) {
    if (!KIT_HOUSES.on || piece.burnt || !kitBuilt(piece, piece.settlement)) {
        return null;
    }

    const gltf = sceneryOf(HOUSE_KIT.asset);

    if (!gltf) {
        return null;
    }

    const library = libraryOf(gltf);
    const plan = planHouse(piece);
    const built = kitHouse(plan);
    const object = buildKitHouse(built, plan, library, detail);

    object.name = `house (${HOUSE_KIT.asset})`;
    object.userData.kit = { kind: built.kind, storeys: built.storeys, pieces: built.pieces.length };

    return object;
}

/**
 * A shop of the layout built of the kit (kitshop.js: a specialist's or a master's of a people whose
 * shops are the kit's, in the look of its own its people's shops of its kind all have), as
 * kitHouseObject builds a house, and its front dressed: its name on its board over the door, its
 * sign hung from its corner post, its awnings, what it sells set out under them, a master's
 * banners, the Mystic Emporium's lanterns, the step at its door. A promise of a group in world
 * pixels, or null if it isn't one, or the kit isn't read (the game's own's drawn: landmarks.js).
 */
export async function kitShopObject(piece, { detail = KIT_HOUSES.detail } = {}) {
    if (!KIT_HOUSES.on || !kitShopBuilt(piece)) {
        return null;
    }

    const gltf = sceneryOf(HOUSE_KIT.asset);

    if (!gltf) {
        return null;
    }

    await loadSignFont();

    const library = libraryOf(gltf);
    const shop = kitShop(piece);
    const object = buildKitHouse(shop.built, shop.plan, library, detail);
    const solid = new Solid();
    const front = SHOPFRONTS[piece.name];
    const { board, sign, goods, step } = shop;
    const across = (z) => ({ origin: [0, 0, z * P], across: [1, 0, 0], out: [0, 0, 1] });

    nameBoard(solid, across(board.z), [board.x0 * P, board.x1 * P, board.y0 * P, board.y1 * P], nameBoardTexture({ name: front.name, ground: front.ground, dark: front.dark }), `board ${piece.name}`, shop.look.frame, { proud: board.depth * P });
    hangingSign(solid, across(sign.z), sign.x * P, sign.top * P, emblemSignTexture({ name: front.name, emblem: front.emblem, tint: front.tint }), `sign ${piece.name}`, { width: sign.width, height: sign.height, reach: sign.reach, above: sign.above });
    solid.box(step[0] * P, 0, step[3] * P, step[1] * P, step[2] * P, step[4] * P, material("stone"));
    dressShop(solid, piece.name, { x0: goods.x0 * P, z: goods.z * P, seed: shop.plan.seed & 0xffff, aside: goods.aside, under: goods.under, banners: goods.banners ?? false, lanterns: goods.lanterns });
    object.add(solid.toObject());
    object.name = `${piece.name} (${HOUSE_KIT.asset})`;
    object.userData.kit = { kind: shop.built.kind, storeys: shop.built.storeys, pieces: shop.built.pieces.length, shop: piece.name };

    return object;
}

/**
 * Each people's shops built of a kit (kitshop.js SHOP_LOOKS has their looks), by people: a promise
 * of the shop's group, or of null where it isn't built so (its kit not read yet). The humans' are
 * the house kit's; any other people's are its own kit's (art/peoples) till theirs are added here.
 */
export const SHOP_KITS = Object.freeze({ human: kitShopObject });

/** What builds a layout's shop of a kit (SHOP_KITS), if it's one a kit builds: else null. */
export const shopKitOf = (piece) => (piece.kind === "landmark" && shopLookOf(piece) && SHOP_KITS[piece.people ?? "human"]) || null;

/**
 * A house built of the kit (kitHouse's) drawn: a group in world pixels. Its meshes: the kit's own
 * (indexed, merged as they are: town3d.js partsOf), the plaster and the glass in the game's
 * materials, the roof's slopes in the kit's tiles, and its soffits and edges in the game's timber;
 * its chimney and its shop's awning the art kits' own.
 */
export function buildKitHouse(built, plan, library, detail = "far") {
    const group = new THREE.Group();
    const own = new THREE.Group();
    const { look } = built;
    const plaster = material(look.plaster);
    const stone = material(look.stone ?? "stone");
    const glass = material(plan.glazing === "leaded" ? "leaded" : "glass");
    const timber = material(look.frame ?? "timber");
    const tint = look.tint ?? [1, 1, 1];
    const lists = { walls: [], near: [], plaster: [], stone: [], glass: [] };

    for (const placed of built.pieces) {
        const shapes = library.pieces.get(placed.piece)?.[detail];

        if (!shapes) {
            continue;
        }

        const matrix = matrixOf(placed);

        for (const kind of KINDS) {
            if (shapes[kind]) {
                const list = kind === "walls" ? (NEAR.has(placed.look) ? lists.near : lists.walls) : kind === "glass" ? lists.glass : placed.look === "stone" ? lists.stone : lists.plaster;

                list.push([shapes[kind], matrix]);
            }
        }
    }

    // (Each list one mesh, its corners moved in metres; the group scaled to world pixels)
    own.scale.setScalar(P);

    // The kit's own pieces and the roof's tiles, in one material (kitMaterial): each corner's
    // `roof` 0 for a piece, else which of the kit's roofs its tiles are laid as (ROOFS)
    const kit = kitMaterial(library);
    const laid = (geometry, roof) => geometry.setAttribute("roof", new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count).fill(roof), 1));

    for (const [list, near] of [[lists.walls, false], [lists.near, true]]) {
        if (list.length) {
            const walls = new THREE.Mesh(laid(joinPlaced(list, { indexed: true }), 0), kit);

            walls.userData.indexed = true;
            walls.userData.near = near;
            own.add(walls);
        }
    }

    if (built.slopes.length) {
        const slopes = laid(facesOf(built.slopes, { box: built.box, uvs: true }), ROOF_NAMES.indexOf(look.roof) + 1);

        slopes.setIndex(Array.from({ length: slopes.attributes.position.count }, (_, k) => k));

        const roof = new THREE.Mesh(slopes, kit);

        roof.userData.indexed = true;
        own.add(roof);
    }

    for (const [list, drawn, colour] of [[lists.plaster, plaster, tint], [lists.stone, stone, [1, 1, 1]], [lists.glass, glass, [1, 1, 1]]]) {
        if (list.length) {
            own.add(new THREE.Mesh(paintedFlat(joinPlaced(list), colour), drawn));
        }
    }

    if (built.trims.length) {
        own.add(new THREE.Mesh(paintedFlat(facesOf(built.trims, { box: built.box }), [1, 1, 1]), timber));
    }

    if (built.shell.length) {
        own.add(new THREE.Mesh(paintedFlat(facesOf(built.shell, { box: built.box }), [1, 1, 1]), material("shadow")));
    }

    group.add(own);

    // Its chimney and its shop's awnings (in world pixels), the art kits' own
    const solid = new Solid();
    const random = createRandom((plan.seed ^ 0x7a11) >>> 0);

    // (A shop's its own: a forge's broad, smoking thick; an alchemist's smoking green: kitshop.js)
    if (built.extras.chimney) {
        const { x, z, base, height, w = 0.7, d = 0.7, name = plan.look.stack ?? "stone", smoke = 1, tint = null } = built.extras.chimney;

        chimney(solid, { x: x * P, z: z * P, w: w * P, d: d * P, base: base * P, height: height * P, name, pots: random.pick([0, 1, 2]), smoke, tint });
    }

    // (A house's of any of the houses' stripes; a shop's its own: cloth.js SHOP_AWNINGS)
    for (const { at: [x, z], out, width, y, look } of built.extras.awnings) {
        const { back, depth, fall, skirt } = AWNING;
        const stripes = random.pick(Object.keys(AWNINGS));

        awning(solid, [(x + out[0] * back) * P, y * P, (z + out[1] * back) * P], [out[0], 0, out[1]], { width: (width - 0.2) * P, depth: depth * P, fall: fall * P, skirt: skirt * P, look: look ?? stripes });
    }

    group.add(solid.toObject());

    return group;
}

// A placed piece's matrix: where it stands, turned (quarter turns about y: a piece faces +z
// unturned) and stretched
const _position = new THREE.Vector3();
const _turn = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function matrixOf({ at, turn, scale = [1, 1, 1] }) {
    return new THREE.Matrix4().compose(_position.fromArray(at), _turn.setFromAxisAngle(UP, (turn * Math.PI) / 2), _scale.fromArray(scale));
}

// Shapes ([geometry, matrix] pairs: position, normal, uv, maybe indexed) joined into one, each
// moved by its matrix; `indexed`, keeping their indices (else their corners laid out face by face)
function joinPlaced(list, { indexed = false } = {}) {
    let vertices = 0;
    let indices = 0;

    for (const [geometry] of list) {
        vertices += indexed ? geometry.attributes.position.count : geometry.index ? geometry.index.count : geometry.attributes.position.count;
        indices += geometry.index ? geometry.index.count : geometry.attributes.position.count;
    }

    const positions = new Float32Array(vertices * 3);
    const normals = new Float32Array(vertices * 3);
    const uvs = new Float32Array(vertices * 2);
    const order = indexed ? (vertices > 65535 ? new Uint32Array(indices) : new Uint16Array(indices)) : null;
    const normalMatrix = new THREE.Matrix3();
    const point = new THREE.Vector3();
    let v = 0;
    let i = 0;

    for (const [geometry, matrix] of list) {
        const { position, normal, uv } = geometry.attributes;
        const corners = geometry.index && !indexed ? geometry.index.array : null;
        const count = corners ? corners.length : position.count;
        const first = v;

        normalMatrix.getNormalMatrix(matrix);

        for (let k = 0; k < count; k++) {
            const c = corners ? corners[k] : k;

            point.fromBufferAttribute(position, c).applyMatrix4(matrix).toArray(positions, v * 3);
            point.fromBufferAttribute(normal, c).applyMatrix3(normalMatrix).normalize().toArray(normals, v * 3);
            uvs[v * 2] = uv ? uv.getX(c) : 0;
            uvs[v * 2 + 1] = uv ? uv.getY(c) : 0;
            v++;
        }

        if (order) {
            if (geometry.index) {
                for (const c of geometry.index.array) {
                    order[i++] = first + c;
                }
            } else {
                for (let k = 0; k < count; k++) {
                    order[i++] = first + k;
                }
            }
        }
    }

    const joined = new THREE.BufferGeometry();

    joined.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    joined.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    joined.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));

    if (order) {
        joined.setIndex(new THREE.BufferAttribute(order, 1));
    }

    return joined;
}

// A shape (in metres, corners face by face) painted in one of the game's materials, which are laid
// in world pixels: its texture's coordinates where each corner is, flat on its face (along the
// wall and up it on an upright face, across the ground on a flat one), and each corner `colour`
function paintedFlat(geometry, colour) {
    const { position, normal } = geometry.attributes;
    const uvs = new Float32Array(position.count * 2);
    const colours = new Float32Array(position.count * 3);

    for (let k = 0; k < position.count; k++) {
        const [x, y, z] = [position.getX(k), position.getY(k), position.getZ(k)];
        const [nx, ny, nz] = [normal.getX(k), normal.getY(k), normal.getZ(k)];
        const flat = Math.abs(ny) > 0.7;

        uvs[k * 2] = (flat ? x : Math.abs(nz) > Math.abs(nx) ? x : z) * P;
        uvs[k * 2 + 1] = (flat ? z : y) * P;
        colours.set(colour, k * 3);
    }

    geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));

    return geometry;
}

// Faces given by their corners (kitHouse's slopes and trims: { points, uvs?, out?, look? }), each
// laid as a fan of triangles, turned to face as the kit's rules mean (a slope up, or `out`; a
// soffit down; an edge away from the house's middle); `uvs` its own, `colour` each corner's
function facesOf(faces, { box, colour = null, uvs = false }) {
    const triangles = faces.reduce((count, { points }) => count + points.length - 2, 0);
    const positions = new Float32Array(triangles * 9);
    const normals = new Float32Array(triangles * 9);
    const coordinates = new Float32Array(triangles * 6);
    const middle = new THREE.Vector3((box[0] + box[1]) / 2, 0, (box[2] + box[3]) / 2);
    const [a, b, n, centre, facing] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    let v = 0;

    for (const face of faces) {
        const { points } = face;

        // (Its normal, from all its corners, Newell's way; and which way it should face)
        n.set(0, 0, 0);

        for (const [k, corner] of points.entries()) {
            a.fromArray(corner);
            b.fromArray(points[(k + 1) % points.length]);
            n.x += (a.y - b.y) * (a.z + b.z);
            n.y += (a.z - b.z) * (a.x + b.x);
            n.z += (a.x - b.x) * (a.y + b.y);
        }

        n.normalize();
        centre.set(0, 0, 0);

        for (const point of points) {
            centre.add(a.fromArray(point));
        }

        centre.divideScalar(points.length);

        if (face.out) {
            facing.fromArray(face.out);
        } else if (face.look === "soffit") {
            facing.set(0, -1, 0);
        } else if (face.look === "edge") {
            facing.subVectors(centre, middle).setY(0);
        } else {
            facing.set(0, 1, 0);
        }

        const flip = n.dot(facing) < 0;

        if (flip) {
            n.negate();
        }

        for (let k = 1; k < points.length - 1; k++) {
            const corners = flip ? [0, k + 1, k] : [0, k, k + 1];

            for (const corner of corners) {
                positions.set(points[corner], v * 3);
                normals.set([n.x, n.y, n.z], v * 3);

                if (uvs && face.uvs) {
                    coordinates.set(face.uvs[corner], v * 2);
                }

                v++;
            }
        }
    }

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(coordinates, 2));

    if (colour) {
        const colours = new Float32Array(v * 3);

        for (let k = 0; k < v; k++) {
            colours.set(colour, k * 3);
        }

        geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
    }

    return geometry;
}

// The kit's pieces, once for each time it's read: { pieces (by name: { far, near }, each its
// kinds' shapes, at their pivots), wood (its own material), tiles (by colour: its roof's tiles'
// material) }
const libraries = new WeakMap();

/** The kit's pieces as they're drawn (kitHouseObject's), from its glTF (sceneryOf's). */
export function libraryOf(gltf) {
    if (libraries.has(gltf)) {
        return libraries.get(gltf);
    }

    const library = { pieces: new Map(), wood: null, tiles: {}, house: null, floor: null };
    const names = ASSETS.models[HOUSE_KIT.asset]?.pieces ?? {};

    gltf.scene.updateMatrixWorld(true);

    for (const [name, nodes] of Object.entries(names)) {
        const shapes = { far: {}, near: {} };

        for (const node of nodes) {
            const [kind, cell] = node.split("@");
            const [i, j] = cell.split(",").map(Number);
            // (Its square's middle, where its pivot is)
            const back = new THREE.Matrix4().makeTranslation(-(i + 0.5) * HOUSE_KIT.cell, 0, -(j + 0.5) * HOUSE_KIT.cell);
            // (The lower detail's node is "<node>.lod1", which the glTF loader names "<node>lod1")
            const near = meshUnder(gltf.scene.getObjectByName(node));
            const far = meshUnder(gltf.scene.getObjectByName(`${node}lod1`) ?? gltf.scene.getObjectByName(`${node}.lod1`)) ?? near;

            if (!near) {
                continue;
            }

            if (kind.startsWith("RoofTiles_")) {
                library.tiles[kind.slice("RoofTiles_".length)] = near.material;
                continue;
            }

            if (kind === "walls") {
                library.wood ??= near.material;
            }

            shapes.near[kind] = atPivot(near, back);
            shapes.far[kind] = far === near ? shapes.near[kind] : atPivot(far, back);
        }

        library.pieces.set(name, shapes);
    }

    libraries.set(gltf, library);

    return library;
}

// The mesh a node is, or holds
function meshUnder(node) {
    let found = null;

    node?.traverse((child) => {
        found ??= child.isMesh ? child : null;
    });

    return found;
}

// A piece's shape at its pivot (in metres, its corners as plain numbers: the kit's are quantized)
function atPivot(mesh, back) {
    const matrix = new THREE.Matrix4().multiplyMatrices(back, mesh.matrixWorld);
    const source = mesh.geometry;
    const geometry = new THREE.BufferGeometry();

    for (const name of ["position", "normal", "uv"]) {
        const attribute = source.attributes[name];

        if (!attribute) {
            continue;
        }

        const size = attribute.itemSize;
        const numbers = new Float32Array(attribute.count * size);

        for (let k = 0; k < attribute.count; k++) {
            for (let d = 0; d < size; d++) {
                numbers[k * size + d] = attribute.getComponent(k, d);
            }
        }

        geometry.setAttribute(name, new THREE.BufferAttribute(numbers, size));
    }

    if (source.index) {
        geometry.setIndex(new THREE.BufferAttribute(Uint32Array.from(source.index.array), 1));
    }

    geometry.applyMatrix4(matrix);

    return geometry;
}

// The roofs' names (kithouse.js ROOFS), each corner's `roof` one more than its place in them
const ROOF_NAMES = Object.keys(ROOFS);

// What of the kit's own shading a roof's tiles take for themselves (its baked wood's texture's
// roughness, metal and shading looked up where its tiles' coordinates fall would be another
// piece's): how rough they are
const TILES_ROUGH = 0.85;

/**
 * The kit's material for a house's own pieces and its roof's tiles, one for all its houses, so a
 * block's or chunk's are one draw (town3d.js joined): its own baked texture for a piece (each
 * corner's `roof` 0), or, for the roof's tiles (`roof` its place in ROOFS, and one), the kit's red
 * or slate tiles laid repeating and tinted as that roof's are. It casts no shadows: the house's
 * plaster, its dark inside (the roof's underside) and its soffits, in the art's material, cast it.
 * Drawn from the front only (the kit's own is two-sided, as the pack's pieces were made in Unreal:
 * every piece of it is closed, and the houses' insides are dark).
 */
function kitMaterial(library) {
    if (library.house) {
        return library.house;
    }

    const red = library.tiles.Red;
    const slate = library.tiles.Slate ?? red;
    const house = library.wood.clone();

    for (const map of [red?.map, red?.normalMap, slate?.map, slate?.normalMap]) {
        if (map) {
            map.wrapS = THREE.RepeatWrapping;
            map.wrapT = THREE.RepeatWrapping;
            map.needsUpdate = true;
        }
    }

    house.name = "kit house";
    house.side = THREE.FrontSide;
    house.userData.shadow = false;
    // (Its corners' `roof` kept as they're merged: town3d.js partsOf)
    house.userData.attributes = ["roof"];

    // (Each roof's tint and whether it's slate: [r, g, b, slate], the first a piece's)
    const roofs = [new THREE.Vector4(1, 1, 1, 0), ...ROOF_NAMES.map((name) => new THREE.Vector4(...ROOFS[name].tint, ROOFS[name].tiles === "Slate" ? 1 : 0))];
    const tiled = (sampler, uv, fallback) => (sampler ? `texture2D( ${sampler}, ${uv} )` : fallback);

    house.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, {
            redMap: { value: red?.map ?? null },
            redNormalMap: { value: red?.normalMap ?? null },
            slateMap: { value: slate?.map ?? null },
            slateNormalMap: { value: slate?.normalMap ?? null },
            roofLooks: { value: roofs },
        });
        shader.vertexShader = shader.vertexShader
            .replace("#include <common>", `#include <common>
attribute float roof;
uniform vec4 roofLooks[${roofs.length}];
varying float vTiled;
varying vec4 vRoofLook;
varying vec2 vTileUv;`)
            .replace("#include <begin_vertex>", `#include <begin_vertex>
vTiled = step( 0.5, roof );
vRoofLook = roofLooks[ int( roof + 0.5 ) ];
vTileUv = uv;`);
        shader.fragmentShader = shader.fragmentShader
            .replace("#include <common>", `#include <common>
uniform sampler2D redMap;
uniform sampler2D redNormalMap;
uniform sampler2D slateMap;
uniform sampler2D slateNormalMap;
varying float vTiled;
varying vec4 vRoofLook;
varying vec2 vTileUv;`)
            .replace("#include <map_fragment>", THREE.ShaderChunk.map_fragment.replace("texture2D( map, vMapUv )", `mix( texture2D( map, vMapUv ), vec4( vRoofLook.rgb, 1.0 ) * mix( ${tiled("redMap", "vTileUv", "vec4( 1.0 )")}, ${tiled("slateMap", "vTileUv", "vec4( 1.0 )")}, vRoofLook.a ), vTiled )`))
            .replace("#include <normal_fragment_maps>", THREE.ShaderChunk.normal_fragment_maps.replaceAll("texture2D( normalMap, vNormalMapUv ).xyz", `mix( texture2D( normalMap, vNormalMapUv ).xyz, mix( ${tiled("redNormalMap", "vTileUv", "vec4( 0.5, 0.5, 1.0, 1.0 )")}.xyz, ${tiled("slateNormalMap", "vTileUv", "vec4( 0.5, 0.5, 1.0, 1.0 )")}.xyz, vRoofLook.a ), vTiled )`))
            .replace("#include <roughnessmap_fragment>", THREE.ShaderChunk.roughnessmap_fragment.replace("texture2D( roughnessMap, vRoughnessMapUv )", `mix( texture2D( roughnessMap, vRoughnessMapUv ), vec4( 1.0, ${TILES_ROUGH.toFixed(2)}, 0.0, 1.0 ), vTiled )`))
            .replace("#include <metalnessmap_fragment>", THREE.ShaderChunk.metalnessmap_fragment.replace("texture2D( metalnessMap, vMetalnessMapUv )", "mix( texture2D( metalnessMap, vMetalnessMapUv ), vec4( 0.0 ), vTiled )"))
            .replace("#include <aomap_fragment>", THREE.ShaderChunk.aomap_fragment.replace("texture2D( aoMap, vAoMapUv ).r", "mix( texture2D( aoMap, vAoMapUv ).r, 1.0, vTiled )"));
    };
    house.customProgramCacheKey = () => "kit house";
    library.house = house;

    return house;
}

// The kit's wood floor pieces, the largest first, and how far their tops stand over the floor
// they're laid on (metres: over its boards, under a rug's)
const FLOORS = Object.freeze({ piece: "WoodFloor_2x2m", size: 2, top: 0.2, over: 0.004 });

/**
 * The humans' floorboards inside (interiors3d.js floorboards': [[x0, z0, x1, z1, top]], metres)
 * laid with the kit's wood floor, its 2 m pieces end to end and the last of each row and column
 * cut to fit (stretched): one mesh, lit as the inside's furniture is by its flames
 * (roomlight.js); or null if the kit isn't read.
 */
export function kitFloors(boards) {
    const gltf = sceneryOf(HOUSE_KIT.asset);

    if (!gltf || !KIT_HOUSES.on) {
        return null;
    }

    const library = libraryOf(gltf);
    const shape = library.pieces.get(FLOORS.piece)?.far.walls;

    if (!shape) {
        return null;
    }

    const list = [];

    for (const [x0, z0, x1, z1, top] of boards) {
        for (let x = x0; x < x1 - 0.01; x += FLOORS.size) {
            for (let z = z0; z < z1 - 0.01; z += FLOORS.size) {
                const [w, d] = [Math.min(FLOORS.size, x1 - x), Math.min(FLOORS.size, z1 - z)];

                list.push([shape, matrixOf({ at: [x + w / 2, top - FLOORS.top + FLOORS.over, z + d / 2], turn: 0, scale: [w / FLOORS.size, 1, d / FLOORS.size] })]);
            }
        }
    }

    const mesh = new THREE.Mesh(joinPlaced(list, { indexed: true }), insideFloor(library));

    mesh.name = "kit floor";
    mesh.receiveShadow = true;

    return mesh;
}

// The kit's own material, lit by an inside's flames (roomlight.js) as its furniture is
function insideFloor(library) {
    if (!library.floor) {
        const floor = library.wood.clone();

        floor.name = "kit floor";
        floor.side = THREE.FrontSide;
        floor.onBeforeCompile = (shader) => {
            shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vCutWorld;").replace("#include <project_vertex>", "#include <project_vertex>\nvCutWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
            shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vCutWorld;");
            roomLit(shader);
        };
        floor.customProgramCacheKey = () => "kit floor";
        library.floor = floor;
    }

    return library.floor;
}
