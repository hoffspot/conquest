// The crowds' figures kept between sessions (world/crowd.js): a kind's figure costs one to seven
// seconds of the processor to make, a step at a time (a whole character built, its moves played
// and recorded, then merged and lowered), and comes out the same for the same kind, picture size
// and code. So once made it's kept in the browser's Cache storage, as one run of bytes (what it's
// drawn with: its packed corners, its triangles near and far, its picture and its moves), and the
// next session's read from there in a frame or two, not made.
//  - **Under the code's version** (app/version.js): a figure made by other code isn't read, and is
//    let go of. A copy run from the repository ("dev": npm start, the tests) keeps none.
//  - **By what it's made from**: its kind, its picture's size, the kit's skin size and all its
//    maker's told (its look, its weapon's ways), hashed; a kind made its own way (beasts/herd.js)
//    isn't kept.
//  - **The most recent kept**, FIGURES_KEPT.most of them (about a megabyte and a half each), by
//    when each was last made or read; the rest let go of.
//  - **Never needed**: where the storage refuses, is full or gives back something else, the
//    figure's made as it always was.
// The cache is one of the service worker's own (client/sw.js `FIGURES`: listed there, so it's left
// alone when the worker tidies up), but nothing's ever fetched from it: it's read and written here.

import * as THREE from "three";
import { codeVersion } from "../app/version.js";
import { releaseAttribute, releaseGeometry, releaseTexture } from "./release.js";

/**
 * - `cache`: the Cache storage's name for them (client/sw.js FIGURES: the same).
 * - `most`: how many figures are kept, the most recent.
 * - `format`: how a figure's laid out as bytes (figureBytes): another's not read.
 * - `settle`: how long after a figure's read or kept its time's written down (ms: once for the
 *   several read as a game starts).
 * - `wait`: how many frames the storage is waited on for a figure, at most (world/crowd.js
 *   keptOrMade): it answers in one or two; one that never does is made.
 */
export const FIGURES_KEPT = Object.freeze({ cache: "pellagos-figures-v1", most: 40, format: 1, settle: 2000, wait: 180 });

// What a figure's bytes begin with ("PFIG"), then FIGURES_KEPT.format, then how long its facts are
const MAGIC = 0x47494650;

// The kinds of array a figure's numbers are kept in, by name
const KINDS = { Float32Array, Int8Array, Uint8Array, Uint16Array, Uint32Array };

// The next multiple of eight (every run of numbers starts on one, whatever its kind)
const aligned = (length) => Math.ceil(length / 8) * 8;

/**
 * A kind's figure as one run of bytes (an ArrayBuffer), to keep: a template as templateFrom makes
 * it (world/crowd.js), packed (only the corners its fewer triangles use), with its picture's
 * pixels as they're painted; read before any of it's let go of off the page (as it's made). Null
 * if it can't be kept so: not packed, or with no picture to read.
 */
export function figureBytes(template) {
    const { geometry, nearIndex, farIndex, picture, moves } = template;
    const canvas = picture?.image;

    if (!template.packed || !nearIndex?.array || !farIndex?.array || !moves?.image?.data || !canvas?.getContext) {
        return null;
    }

    const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    const runs = [];
    let length = 0;
    const run = (array) => {
        const at = { kind: array.constructor.name === "Uint8ClampedArray" ? "Uint8Array" : array.constructor.name, offset: length, count: array.length };

        runs.push([array, length]);
        length += aligned(array.byteLength);

        return at;
    };
    const facts = {
        key: template.key,
        height: template.height,
        flags: template.flags,
        table: template.table,
        box: geometry.boundingBox ? [...geometry.boundingBox.min.toArray(), ...geometry.boundingBox.max.toArray()] : null,
        sphere: geometry.boundingSphere ? [...geometry.boundingSphere.center.toArray(), geometry.boundingSphere.radius] : null,
        attributes: Object.entries(geometry.attributes).map(([name, { array, itemSize, normalized }]) => ({ name, itemSize, normalized, ...run(array) })),
        near: run(nearIndex.array),
        far: run(farIndex.array),
        moves: { width: moves.image.width, rows: moves.image.height, ...run(moves.image.data) },
        picture: { width: canvas.width, height: canvas.height, ...run(pixels) },
    };
    const text = new TextEncoder().encode(JSON.stringify(facts));
    const start = aligned(12 + text.byteLength);
    const bytes = new Uint8Array(start + length);
    const head = new DataView(bytes.buffer);

    head.setUint32(0, MAGIC, true);
    head.setUint32(4, FIGURES_KEPT.format, true);
    head.setUint32(8, text.byteLength, true);
    bytes.set(text, 12);

    for (const [array, offset] of runs) {
        bytes.set(new Uint8Array(array.buffer, array.byteOffset, array.byteLength), start + offset);
    }

    return bytes.buffer;
}

/**
 * A kind's figure from its bytes (figureBytes'), a template to draw as templateFrom's is: its
 * corners, triangles, moves and picture read where they are in `buffer`, none copied, and each
 * let go of off the page once the graphics card has it (world/release.js). Its picture is its
 * pixels as they were painted, drawn as the canvas they were read from was (mipmapped, smoothed).
 * Throws if the bytes aren't a figure's as this code lays them out.
 */
export function figureFrom(buffer, key) {
    const head = new DataView(buffer);

    if (buffer.byteLength < 12 || head.getUint32(0, true) !== MAGIC || head.getUint32(4, true) !== FIGURES_KEPT.format) {
        throw new Error("Not a figure as it's kept now");
    }

    const length = head.getUint32(8, true);
    const facts = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 12, length)));
    const start = aligned(12 + length);
    const read = ({ kind, offset, count }) => {
        const Kind = KINDS[kind];

        if (!Kind || start + offset + count * Kind.BYTES_PER_ELEMENT > buffer.byteLength) {
            throw new Error("A figure's bytes cut short");
        }

        return new Kind(buffer, start + offset, count);
    };

    if (facts.key !== key) {
        throw new Error(`The figure kept is ${facts.key}'s, not ${key}'s`);
    }

    const geometry = new THREE.BufferGeometry();

    for (const { name, itemSize, normalized, ...at } of facts.attributes) {
        geometry.setAttribute(name, new THREE.BufferAttribute(read(at), itemSize, normalized));
    }

    const nearIndex = new THREE.BufferAttribute(read(facts.near), 1);
    const farIndex = new THREE.BufferAttribute(read(facts.far), 1);

    geometry.setIndex(nearIndex);
    geometry.boundingBox = facts.box ? new THREE.Box3(new THREE.Vector3().fromArray(facts.box, 0), new THREE.Vector3().fromArray(facts.box, 3)) : null;
    geometry.boundingSphere = facts.sphere ? new THREE.Sphere(new THREE.Vector3().fromArray(facts.sphere), facts.sphere[3]) : null;

    const moves = new THREE.DataTexture(read(facts.moves), facts.moves.width, facts.moves.rows, THREE.RGBAFormat, THREE.HalfFloatType);
    const picture = new THREE.DataTexture(read(facts.picture), facts.picture.width, facts.picture.height, THREE.RGBAFormat, THREE.UnsignedByteType);

    moves.needsUpdate = true;

    // (As the canvas it was painted on is drawn: world/crowd.js figureOf)
    picture.flipY = false;
    picture.colorSpace = THREE.SRGBColorSpace;
    picture.anisotropy = 2;
    picture.magFilter = THREE.LinearFilter;
    picture.minFilter = THREE.LinearMipmapLinearFilter;
    picture.generateMipmaps = true;
    picture.needsUpdate = true;

    releaseGeometry(geometry);
    releaseAttribute(farIndex);
    releaseTexture(moves);
    releaseTexture(picture);

    return { key, geometry, nearIndex, farIndex, picture, moves, table: facts.table, flags: facts.flags, height: facts.height, packed: true, kept: true };
}

// A string's hash, as eight hex digits (FNV-1a, from `seed`)
function hashOf(text, seed) {
    let hash = seed;

    for (let k = 0; k < text.length; k++) {
        hash = Math.imul(hash ^ text.charCodeAt(k), 0x01000193);
    }

    return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * What a figure's kept under: its kind (`key`), and all it's made from, hashed: the kit's skin
 * size and what its maker's told (`spec`: its picture's size, its look, how it fights). Null for
 * one made its own way (`spec.make`: a beast's), or whose spec can't be written down: not kept.
 */
export function figureId(kit, key, spec) {
    if (spec.make) {
        return null;
    }

    try {
        const text = JSON.stringify([key, kit.atlas?.size ?? kit.textureSize ?? null, Boolean(kit.lods), spec]);

        return `${key.replace(/[^a-z0-9]+/gi, "-")}-${hashOf(text, 0x811c9dc5)}${hashOf(text, 0x1000193)}`;
    } catch {
        return null;
    }
}

/**
 * The figures kept in the browser's Cache storage: `find(id)` a figure's bytes, or null;
 * `keep(id, bytes)` them. Neither ever fails: where the storage can't be had, nothing's found and
 * nothing kept.
 */
export class FigureStore {
    /**
     * @param {object} [options]
     * @param {CacheStorage} [options.caches] - The browser's (none: nothing's kept).
     * @param {string} [options.version] - The code's (app/version.js codeVersion: "dev" keeps none).
     * @param {string} [options.base] - The page's address, which each figure's own is made under.
     * @param {number} [options.most] - How many are kept.
     * @param {Function} [options.now] - The time (ms).
     * @param {number} [options.settle] - How long after one's used its time's written down (ms).
     */
    constructor({ caches = globalThis.caches ?? null, version = codeVersion(), base = globalThis.document?.baseURI ?? globalThis.location?.href ?? "http://localhost/", most = FIGURES_KEPT.most, now = Date.now, settle = FIGURES_KEPT.settle } = {}) {
        this.caches = caches;
        this.version = version;
        this.base = base;
        this.most = most;
        this.now = now;
        this.settle = settle;
        this.opening = null;
        this.writing = null;
    }

    /** Whether anything's kept: there's storage, and the code says which it is. */
    get on() {
        return Boolean(this.caches) && this.version !== "dev";
    }

    // A figure's address in the cache (never fetched: a name for it), under the code's version;
    // and where the times they were last used are written down
    #address(id) {
        return new URL(`figures/${this.version}/${id}.bin`, this.base).href;
    }

    get #times() {
        return new URL("figures/used.json", this.base).href;
    }

    // The cache, opened once, with when each figure in it was last used ({ address: ms }): those
    // of other code's versions let go of, and any it has no time for taken as the oldest
    #open() {
        this.opening ??= (async () => {
            const cache = await this.caches.open(FIGURES_KEPT.cache);
            const written = await cache.match(this.#times);
            const told = written ? await written.json().catch(() => ({})) : {};
            const mine = new URL(`figures/${this.version}/`, this.base).href;
            const used = {};

            for (const { url } of await cache.keys()) {
                if (url.startsWith(mine)) {
                    used[url] = Number(told[url]) || 0;
                } else if (url !== this.#times) {
                    await cache.delete(url);
                }
            }

            return { cache, used };
        })();

        return this.opening;
    }

    // A figure used now: its time written down in a while (once for several), and those past the
    // most kept let go of, the longest unused first
    async #used(address) {
        const { cache, used } = await this.#open();

        used[address] = this.now();

        for (const old of Object.keys(used).sort((a, b) => used[b] - used[a]).slice(this.most)) {
            delete used[old];
            await cache.delete(old);
        }

        this.writing ??= setTimeout(() => {
            this.writing = null;
            cache.put(this.#times, new Response(JSON.stringify(used), { headers: { "Content-Type": "application/json" } })).catch(() => {});
        }, this.settle);
    }

    /** A figure's bytes (an ArrayBuffer), or null if it isn't kept or can't be read. */
    async find(id) {
        if (!this.on) {
            return null;
        }

        try {
            const { cache } = await this.#open();
            const kept = await cache.match(this.#address(id));

            if (!kept) {
                return null;
            }

            const bytes = await kept.arrayBuffer();

            await this.#used(this.#address(id));

            return bytes;
        } catch {
            return null;
        }
    }

    /** Keep a figure's bytes; whether they were. */
    async keep(id, bytes) {
        if (!this.on || !bytes) {
            return false;
        }

        try {
            const { cache } = await this.#open();

            await cache.put(this.#address(id), new Response(bytes, { headers: { "Content-Type": "application/octet-stream" } }));
            await this.#used(this.#address(id));

            return true;
        } catch {
            return false;
        }
    }
}

// The game's own store, made once
let shared;

/** The store the crowds keep their figures in, or null where none's kept (no storage; "dev"). */
export function figureStore() {
    shared ??= new FigureStore();

    return shared.on ? shared : null;
}
