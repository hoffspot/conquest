// Shared harness for the bodies review's Node scripts: the unit tests' DOM stand-ins
// (test/character-building.test.js), a kit at a given skin size, and counters for what a
// character holds (textures, buffers, meshes, bones, triangles).
export const REPO = "/home/user/conquest";

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

export const THREE = await import(`${REPO}/node_modules/three/build/three.module.js`);
export const { readHumanFiles } = await import(`${REPO}/scripts/lib/human-data.js`);
export const { HumanData } = await import(`${REPO}/client/js/characters/body.js`);
export const { Character } = await import(`${REPO}/client/js/characters/character.js`);
export const { SkinAtlas } = await import(`${REPO}/client/js/characters/skin.js`);
export const { allAtOnce } = await import(`${REPO}/client/js/core/steps.js`);

export function makeKit(skin = 512, { lods = false } = {}) {
    const files = readHumanFiles();
    const human = new HumanData(files.manifest, files.data);
    const kit = { human, atlas: new SkinAtlas(human, {}, skin) };

    return kit;
}

const CHANNELS = (format) => (format === THREE.RedFormat ? 1 : format === THREE.RGFormat ? 2 : 4);
const TYPE = (type) => (type === THREE.FloatType ? 4 : type === THREE.HalfFloatType ? 2 : 1);

/** One texture's facts: size, format, bytes on the card (with mips if it makes them) and on the page. */
export function textureFacts(texture) {
    const image = texture.image ?? {};
    const w = image.width ?? 0;
    const h = image.height ?? 0;
    const texel = CHANNELS(texture.format) * TYPE(texture.type);
    // (three.js makes mips when generateMipmaps and the min filter wants them)
    const mips = texture.generateMipmaps && texture.minFilter !== THREE.NearestFilter && texture.minFilter !== THREE.LinearFilter;
    const gpu = Math.round(w * h * texel * (mips ? 4 / 3 : 1));
    const page = image.data ? image.data.byteLength : image._data ? image._data.byteLength : image.getContext ? w * h * 4 : 0;

    return { w, h, channels: CHANNELS(texture.format), type: TYPE(texture.type), mips, gpu, page, kind: texture.isDataTexture ? "data" : texture.isCanvasTexture ? "canvas" : "image" };
}

/** Everything under `root`: its textures (by slot), geometries, skinned meshes, bones. */
export function census(root) {
    const textures = new Map(); // texture -> { slots:Set, facts }
    const geometries = new Map(); // geometry -> { bytes, name }
    const skeletons = new Set();
    let meshes = 0;
    let skinned = 0;
    let materials = new Set();

    root.traverse((node) => {
        if (!node.isMesh && !node.isPoints && !node.isLine) {
            return;
        }

        meshes++;
        skinned += node.isSkinnedMesh ? 1 : 0;

        if (node.skeleton) {
            skeletons.add(node.skeleton);
        }

        const geometry = node.geometry;

        if (geometry && !geometries.has(geometry)) {
            let bytes = 0;
            const per = {};

            for (const [name, attribute] of [...Object.entries(geometry.attributes), ["index", geometry.index]]) {
                if (attribute?.array) {
                    bytes += attribute.array.byteLength;
                    per[name] = attribute.array.byteLength;
                }
            }

            for (const list of Object.values(geometry.morphAttributes ?? {})) {
                for (const attribute of list) {
                    bytes += attribute.array.byteLength;
                    per.morph = (per.morph ?? 0) + attribute.array.byteLength;
                }
            }

            geometries.set(geometry, { bytes, per, name: node.name, vertices: geometry.attributes.position?.count ?? 0, index: geometry.index?.count ?? 0 });
        }

        for (const material of [node.material].flat()) {
            if (!material) {
                continue;
            }

            materials.add(material);

            for (const key of Object.keys(material)) {
                const value = material[key];

                if (value?.isTexture) {
                    const entry = textures.get(value) ?? { slots: new Set(), facts: textureFacts(value) };

                    entry.slots.add(`${node.name || node.type}.${key}`);
                    textures.set(value, entry);
                }
            }

            // (Uniforms a material patches in: the wounds', the faces')
            for (const uniform of Object.values(material.userData?.uniforms ?? {})) {
                if (uniform?.value?.isTexture) {
                    const entry = textures.get(uniform.value) ?? { slots: new Set(), facts: textureFacts(uniform.value) };

                    entry.slots.add(`${node.name}.uniform`);
                    textures.set(uniform.value, entry);
                }
            }
        }
    });

    return { textures, geometries, skeletons, meshes, skinned, materials };
}

export const MB = (bytes) => (bytes / 1048576).toFixed(2);
