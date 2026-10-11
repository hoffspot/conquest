// What the graphics card's been given to hold (bytes), for the debug overlay and the debug log
// (app/telemetry.js): told at the calls that give it something to hold and take it back, a
// buffer's (bufferData), a picture's (texImage2D and 3D, texStorage2D and 3D,
// compressedTexImage2D, copyTexImage2D, generateMipmap's levels) and a render buffer's
// (renderbufferStorage, and with samples); deleteBuffer, deleteTexture and deleteRenderbuffer
// giving it back. Only those are wrapped, each of them rare (what's uploaded), never a frame's
// draws nor its binding, so it costs nothing a frame. On a phone the graphics card shares the
// phone's memory, and what a page has given it counts against the page as its own does: on an
// iPhone, where the browser tells nothing of a page's memory, most of what the game holds is here.

const GL = Object.freeze({
    TEXTURE_2D: 0x0de1,
    TEXTURE_CUBE_MAP: 0x8513,
    TEXTURE_CUBE_MAP_POSITIVE_X: 0x8515,
    TEXTURE_CUBE_MAP_NEGATIVE_Z: 0x851a,
    TEXTURE_3D: 0x806f,
    TEXTURE_2D_ARRAY: 0x8c1a,
    RENDERBUFFER: 0x8d41,
    RENDERBUFFER_BINDING: 0x8ca7,
});

// Which binding to ask for the buffer or picture a call's about (its target's)
const BUFFER_BINDINGS = new Map([
    [0x8892, 0x8894], // ARRAY_BUFFER
    [0x8893, 0x8895], // ELEMENT_ARRAY_BUFFER
    [0x8a11, 0x8a28], // UNIFORM_BUFFER
    [0x8f36, 0x8f36], // COPY_READ_BUFFER
    [0x8f37, 0x8f37], // COPY_WRITE_BUFFER
    [0x88eb, 0x88ed], // PIXEL_PACK_BUFFER
    [0x88ec, 0x88ef], // PIXEL_UNPACK_BUFFER
    [0x8c8e, 0x8c8f], // TRANSFORM_FEEDBACK_BUFFER
]);
const TEXTURE_BINDINGS = new Map([
    [GL.TEXTURE_2D, 0x8069],
    [GL.TEXTURE_CUBE_MAP, 0x8514],
    [GL.TEXTURE_3D, 0x806a],
    [GL.TEXTURE_2D_ARRAY, 0x8c1d],
]);

// Bytes a texel of each sized format takes (an RGB one held as RGBA, as the cards do)
const SIZED = new Map([
    [0x8229, 1], // R8
    [0x822b, 2], // RG8
    [0x8051, 4], // RGB8
    [0x8058, 4], // RGBA8
    [0x8c41, 4], // SRGB8
    [0x8c43, 4], // SRGB8_ALPHA8
    [0x8056, 2], // RGBA4
    [0x8057, 2], // RGB5_A1
    [0x8d62, 2], // RGB565
    [0x8059, 4], // RGB10_A2
    [0x8c3a, 4], // R11F_G11F_B10F
    [0x8c3d, 4], // RGB9_E5
    [0x822d, 2], // R16F
    [0x822f, 4], // RG16F
    [0x881b, 8], // RGB16F
    [0x881a, 8], // RGBA16F
    [0x822e, 4], // R32F
    [0x8230, 8], // RG32F
    [0x8815, 16], // RGB32F
    [0x8814, 16], // RGBA32F
    [0x8232, 1], // R8UI
    [0x8234, 2], // R16UI
    [0x8236, 4], // R32UI
    [0x8d7c, 4], // RGBA8UI
    [0x8d70, 16], // RGBA32UI
    [0x81a5, 2], // DEPTH_COMPONENT16
    [0x81a6, 4], // DEPTH_COMPONENT24
    [0x8cac, 4], // DEPTH_COMPONENT32F
    [0x88f0, 4], // DEPTH24_STENCIL8
    [0x8cad, 8], // DEPTH32F_STENCIL8
    [0x8d48, 1], // STENCIL_INDEX8
]);

// An unsized one's: its channels (by format) times its type's bytes (packed types two, or four)
const CHANNELS = new Map([
    [0x1906, 1], // ALPHA
    [0x1909, 1], // LUMINANCE
    [0x190a, 2], // LUMINANCE_ALPHA
    [0x1903, 1], // RED
    [0x8227, 2], // RG
    [0x1907, 4], // RGB (held as RGBA)
    [0x1908, 4], // RGBA
    [0x1902, 1], // DEPTH_COMPONENT
    [0x84f9, 1], // DEPTH_STENCIL
]);
const TYPE_BYTES = new Map([
    [0x1401, 1], // UNSIGNED_BYTE
    [0x1400, 1], // BYTE
    [0x1403, 2], // UNSIGNED_SHORT
    [0x1402, 2], // SHORT
    [0x1405, 4], // UNSIGNED_INT
    [0x1404, 4], // INT
    [0x1406, 4], // FLOAT
    [0x140b, 2], // HALF_FLOAT
    [0x8d61, 2], // HALF_FLOAT_OES
]);
const PACKED = new Map([
    [0x8033, 2], // UNSIGNED_SHORT_4_4_4_4
    [0x8034, 2], // UNSIGNED_SHORT_5_5_5_1
    [0x8363, 2], // UNSIGNED_SHORT_5_6_5
    [0x84fa, 4], // UNSIGNED_INT_24_8
    [0x8368, 4], // UNSIGNED_INT_2_10_10_10_REV
    [0x8c3b, 4], // UNSIGNED_INT_10F_11F_11F_REV
    [0x8c3e, 4], // UNSIGNED_INT_5_9_9_9_REV
    [0x8dad, 8], // FLOAT_32_UNSIGNED_INT_24_8_REV
]);

/** Bytes a texel of `internalformat` takes (given as `format` and `type` when it's unsized). */
export function texelBytes(internalformat, format = internalformat, type = 0x1401) {
    return SIZED.get(internalformat) ?? PACKED.get(type) ?? (CHANNELS.get(internalformat) ?? CHANNELS.get(format) ?? 4) * (TYPE_BYTES.get(type) ?? 1);
}

// A picture's size given whole (an image, a canvas, a bitmap, a video, pixels)
function sourceSize(source) {
    return [source?.naturalWidth || source?.videoWidth || source?.displayWidth || source?.width || 0, source?.naturalHeight || source?.videoHeight || source?.displayHeight || source?.height || 0];
}

/** Bytes held, in megabytes (one place after the point). */
export const megabytes = (bytes) => Math.round(bytes / 104857.6) / 10;

export class GpuMemory {
    // What each holds: a buffer's or render buffer's bytes; a picture's, by face and level
    #buffers = new WeakMap();
    #renderbuffers = new WeakMap();
    #textures = new WeakMap();

    constructor() {
        /** Bytes held, by kind, and how many of each. */
        this.bytes = { buffers: 0, textures: 0, renderbuffers: 0 };
        this.count = { buffers: 0, textures: 0, renderbuffers: 0 };
        this.watching = false;
    }

    /** Everything held, in bytes. */
    get total() {
        return this.bytes.buffers + this.bytes.textures + this.bytes.renderbuffers;
    }

    /** What's held, in megabytes, and how many of each: for the overlay and the log. */
    report() {
        const { buffers, textures, renderbuffers } = this.bytes;

        return { totalMB: megabytes(this.total), buffersMB: megabytes(buffers), texturesMB: megabytes(textures), targetsMB: megabytes(renderbuffers), count: { ...this.count } };
    }

    /** Nothing held (the drawing lost: everything given back, to be given again). */
    reset() {
        this.bytes = { buffers: 0, textures: 0, renderbuffers: 0 };
        this.count = { buffers: 0, textures: 0, renderbuffers: 0 };
        this.#buffers = new WeakMap();
        this.#renderbuffers = new WeakMap();
        this.#textures = new WeakMap();
    }

    /**
     * Told what `gl` (a WebGL context) is given to hold and gives back, from now on: its calls
     * that do so wrapped, on the context itself. Returns this.
     */
    watch(gl) {
        if (!gl || this.watching) {
            return this;
        }

        this.watching = true;

        const wrap = (name, told) => {
            const call = gl[name];

            if (typeof call === "function") {
                gl[name] = function (...args) {
                    const result = call.apply(gl, args);

                    told(args);

                    return result;
                };
            }
        };
        const bound = (target) => {
            const binding = TEXTURE_BINDINGS.get(target >= GL.TEXTURE_CUBE_MAP_POSITIVE_X && target <= GL.TEXTURE_CUBE_MAP_NEGATIVE_Z ? GL.TEXTURE_CUBE_MAP : target);

            return binding ? gl.getParameter(binding) : null;
        };
        // (A picture's face and level given `bytes`: what it held there before given back)
        const held = (target, level, bytes) => this.#held(bound(target), `${target}:${level}`, bytes);

        wrap("bufferData", ([target, sizeOrData]) => {
            const binding = BUFFER_BINDINGS.get(target);
            const buffer = binding ? gl.getParameter(binding) : null;

            this.#hold(this.#buffers, "buffers", buffer, typeof sizeOrData === "number" ? sizeOrData : (sizeOrData?.byteLength ?? 0));
        });
        wrap("deleteBuffer", ([buffer]) => this.#hold(this.#buffers, "buffers", buffer, null));
        wrap("texImage2D", (args) => {
            const [target, level, internalformat] = args;
            const whole = args.length === 6;
            const [width, height] = whole ? sourceSize(args[5]) : [args[3], args[4]];

            held(target, level, width * height * texelBytes(internalformat, whole ? args[3] : args[6], whole ? args[4] : args[7]));
        });
        wrap("texImage3D", ([target, level, internalformat, width, height, depth, , format, type]) => held(target, level, width * height * depth * texelBytes(internalformat, format, type)));
        wrap("copyTexImage2D", ([target, level, internalformat, , , width, height]) => held(target, level, width * height * texelBytes(internalformat)));
        wrap("compressedTexImage2D", ([target, level, , , , , data, offset = 0, length = 0]) => held(target, level, typeof data === "number" ? data : length || (data?.byteLength ?? 0) - offset));
        wrap("texStorage2D", ([target, levels, internalformat, width, height]) => {
            let bytes = 0;

            for (let level = 0; level < levels; level++) {
                bytes += Math.max(1, width >> level) * Math.max(1, height >> level) * texelBytes(internalformat);
            }

            held(target, "storage", bytes * (target === GL.TEXTURE_CUBE_MAP ? 6 : 1));
        });
        wrap("texStorage3D", ([target, levels, internalformat, width, height, depth]) => {
            let bytes = 0;

            for (let level = 0; level < levels; level++) {
                bytes += Math.max(1, width >> level) * Math.max(1, height >> level) * (target === GL.TEXTURE_3D ? Math.max(1, depth >> level) : depth) * texelBytes(internalformat);
            }

            held(target, "storage", bytes);
        });
        // (Its levels below the first: a third as much again as the first, each face's)
        wrap("generateMipmap", ([target]) => {
            const texture = bound(target);
            const levels = this.#textures.get(texture);

            if (levels) {
                const faces = target === GL.TEXTURE_CUBE_MAP ? Array.from({ length: 6 }, (_, k) => GL.TEXTURE_CUBE_MAP_POSITIVE_X + k) : [target];

                for (const face of faces) {
                    this.#held(texture, `${face}:mips`, Math.round((levels.get(`${face}:0`) ?? 0) / 3));
                }
            }
        });
        wrap("deleteTexture", ([texture]) => {
            const levels = this.#textures.get(texture);

            if (levels) {
                for (const bytes of levels.values()) {
                    this.bytes.textures -= bytes;
                }

                this.#textures.delete(texture);
                this.count.textures--;
            }
        });
        wrap("renderbufferStorage", ([, internalformat, width, height]) => this.#hold(this.#renderbuffers, "renderbuffers", gl.getParameter(GL.RENDERBUFFER_BINDING), width * height * texelBytes(internalformat)));
        wrap("renderbufferStorageMultisample", ([, samples, internalformat, width, height]) => this.#hold(this.#renderbuffers, "renderbuffers", gl.getParameter(GL.RENDERBUFFER_BINDING), Math.max(1, samples) * width * height * texelBytes(internalformat)));
        wrap("deleteRenderbuffer", ([renderbuffer]) => this.#hold(this.#renderbuffers, "renderbuffers", renderbuffer, null));

        return this;
    }

    // A buffer or render buffer (`object`, in `held`) holding `bytes` now (null: given back)
    #hold(held, kind, object, bytes) {
        if (!object) {
            return;
        }

        const was = held.get(object);

        this.bytes[kind] += (bytes ?? 0) - (was ?? 0);

        if (bytes === null) {
            if (was !== undefined) {
                held.delete(object);
                this.count[kind]--;
            }
        } else {
            if (was === undefined) {
                this.count[kind]++;
            }

            held.set(object, bytes);
        }
    }

    // A picture holding `bytes` at one of its faces' levels (`key`)
    #held(texture, key, bytes) {
        if (!texture) {
            return;
        }

        let levels = this.#textures.get(texture);

        if (!levels) {
            levels = new Map();
            this.#textures.set(texture, levels);
            this.count.textures++;
        }

        this.bytes.textures += bytes - (levels.get(key) ?? 0);
        levels.set(key, bytes);
    }
}
