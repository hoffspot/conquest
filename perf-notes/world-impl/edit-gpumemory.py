import sys
p = sys.argv[1] + '/client/js/world/gpumemory.js'
s = open(p).read()


def swap(a, b):
    global s
    assert s.count(a) == 1, a
    s = s.replace(a, b)


swap('''// What the graphics card's been given to hold (bytes), for the debug overlay and the debug log
// (app/telemetry.js): told at the calls that give it something to hold and take it back, a
// buffer's (bufferData), a picture's (texImage2D and 3D, texStorage2D and 3D,
// compressedTexImage2D, copyTexImage2D, generateMipmap's levels) and a render buffer's
// (renderbufferStorage, and with samples); deleteBuffer, deleteTexture and deleteRenderbuffer
// giving it back. Only those are wrapped, each of them rare (what's uploaded), never a frame's
// draws nor its binding, so it costs nothing a frame. On a phone the graphics card shares the
// phone's memory, and what a page has given it counts against the page as its own does: on an
// iPhone, where the browser tells nothing of a page's memory, most of what the game holds is here.
''', '''// What the graphics card's been given to hold (bytes), for the debug overlay and the debug log
// (app/telemetry.js): told at the calls that give it something to hold and take it back, a
// buffer's (bufferData), a picture's (texImage2D and 3D, texStorage2D and 3D,
// compressedTexImage2D, copyTexImage2D, generateMipmap's levels) and a render buffer's
// (renderbufferStorage, and with samples); deleteBuffer, deleteTexture and deleteRenderbuffer
// giving it back. Only those are wrapped, each of them rare (what's uploaded), never a frame's
// draws nor its binding, so it costs nothing a frame. On a phone the graphics card shares the
// phone's memory, and what a page has given it counts against the page as its own does: on an
// iPhone, where the browser tells nothing of a page's memory, most of what the game holds is here.
//
// A compressed picture's counted by its blocks (COMPRESSED: a bought model's or a prop's, KTX2,
// given as ASTC, ETC2 or BC7 as the device has them). three.js gives one as storage for all its
// levels (texStorage2D, with the compressed format) and then each level's blocks
// (compressedTexSubImage2D, which holds nothing more); counted at four bytes a texel, as a
// format not known was, a 1024 by 1024 ASTC picture with its mipmaps came to 5.33 MB where it
// holds 1.33.
//
// And what's gone with nothing said is counted out once the browser collects it (a
// FinalizationRegistry): three.js gives a buffer back only when its geometry's disposed of, and
// one whose geometry is simply let go (a body's index, made again as what it wears changes:
// characters/character.js) is freed by the browser when its last holder's collected, never
// deleted, so the count only grew.
''')

swap('''/** Bytes a texel of `internalformat` takes (given as `format` and `type` when it's unsized). */
export function texelBytes(internalformat, format = internalformat, type = 0x1401) {
    return SIZED.get(internalformat) ?? PACKED.get(type) ?? (CHANNELS.get(internalformat) ?? CHANNELS.get(format) ?? 4) * (TYPE_BYTES.get(type) ?? 1);
}
''', '''// A compressed format's blocks: how many texels across and up each covers, and its bytes. (Every
// one three.js can ask WebGL for: S3TC and its sRGB, RGTC, BPTC, ETC1, ETC2 and EAC, ASTC and its
// sRGB. PVRTC's are counted apart: pvrtcBytes)
const COMPRESSED = new Map([
    [0x83f0, [4, 4, 8]], // RGB_S3TC_DXT1
    [0x83f1, [4, 4, 8]], // RGBA_S3TC_DXT1
    [0x83f2, [4, 4, 16]], // RGBA_S3TC_DXT3
    [0x83f3, [4, 4, 16]], // RGBA_S3TC_DXT5
    [0x8c4c, [4, 4, 8]], // SRGB_S3TC_DXT1
    [0x8c4d, [4, 4, 8]], // SRGB_ALPHA_S3TC_DXT1
    [0x8c4e, [4, 4, 16]], // SRGB_ALPHA_S3TC_DXT3
    [0x8c4f, [4, 4, 16]], // SRGB_ALPHA_S3TC_DXT5
    [0x8dbb, [4, 4, 8]], // RED_RGTC1
    [0x8dbc, [4, 4, 8]], // SIGNED_RED_RGTC1
    [0x8dbd, [4, 4, 16]], // RED_GREEN_RGTC2
    [0x8dbe, [4, 4, 16]], // SIGNED_RED_GREEN_RGTC2
    [0x8e8c, [4, 4, 16]], // RGBA_BPTC_UNORM (BC7)
    [0x8e8d, [4, 4, 16]], // SRGB_ALPHA_BPTC_UNORM
    [0x8e8e, [4, 4, 16]], // RGB_BPTC_SIGNED_FLOAT (BC6H)
    [0x8e8f, [4, 4, 16]], // RGB_BPTC_UNSIGNED_FLOAT
    [0x8d64, [4, 4, 8]], // ETC1_RGB8
    [0x9270, [4, 4, 8]], // R11_EAC
    [0x9271, [4, 4, 8]], // SIGNED_R11_EAC
    [0x9272, [4, 4, 16]], // RG11_EAC
    [0x9273, [4, 4, 16]], // SIGNED_RG11_EAC
    [0x9274, [4, 4, 8]], // RGB8_ETC2
    [0x9275, [4, 4, 8]], // SRGB8_ETC2
    [0x9276, [4, 4, 8]], // RGB8_PUNCHTHROUGH_ALPHA1_ETC2
    [0x9277, [4, 4, 8]], // SRGB8_PUNCHTHROUGH_ALPHA1_ETC2
    [0x9278, [4, 4, 16]], // RGBA8_ETC2_EAC
    [0x9279, [4, 4, 16]], // SRGB8_ALPHA8_ETC2_EAC
    // (ASTC: 16 bytes a block, whatever it covers; RGBA from 0x93b0, sRGB with alpha from 0x93d0)
    ...[[4, 4], [5, 4], [5, 5], [6, 5], [6, 6], [8, 5], [8, 6], [8, 8], [10, 5], [10, 6], [10, 8], [10, 10], [12, 10], [12, 12]].flatMap(([across, up], k) => [
        [0x93b0 + k, [across, up, 16]],
        [0x93d0 + k, [across, up, 16]],
    ]),
]);

// PVRTC's bits a texel (RGB and RGBA, 4 and 2): held no smaller than 8 texels a side (16 across
// at 2 bits)
const PVRTC = new Map([
    [0x8c00, 4], // RGB_PVRTC_4BPPV1
    [0x8c01, 2], // RGB_PVRTC_2BPPV1
    [0x8c02, 4], // RGBA_PVRTC_4BPPV1
    [0x8c03, 2], // RGBA_PVRTC_2BPPV1
]);

/**
 * Bytes a texel of `internalformat` takes (given as `format` and `type` when it's unsized); a
 * compressed one's, its block's bytes over the texels it covers (a share of a byte, for some).
 */
export function texelBytes(internalformat, format = internalformat, type = 0x1401) {
    const block = COMPRESSED.get(internalformat);

    if (block) {
        return block[2] / (block[0] * block[1]);
    }

    if (PVRTC.has(internalformat)) {
        return PVRTC.get(internalformat) / 8;
    }

    return SIZED.get(internalformat) ?? PACKED.get(type) ?? (CHANNELS.get(internalformat) ?? CHANNELS.get(format) ?? 4) * (TYPE_BYTES.get(type) ?? 1);
}

/**
 * Bytes a picture `width` by `height` of `internalformat` takes (one level, one face or layer): a
 * compressed one's, its whole blocks (a level smaller than a block still takes one); any other's,
 * its texels' (texelBytes).
 */
export function imageBytes(internalformat, width, height, format = internalformat, type = 0x1401) {
    const block = COMPRESSED.get(internalformat);

    if (block) {
        return Math.ceil(width / block[0]) * Math.ceil(height / block[1]) * block[2];
    }

    if (PVRTC.has(internalformat)) {
        const bits = PVRTC.get(internalformat);

        return (Math.max(width, bits === 2 ? 16 : 8) * Math.max(height, 8) * bits) / 8;
    }

    return width * height * texelBytes(internalformat, format, type);
}
''')

swap('''export class GpuMemory {
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
''', '''export class GpuMemory {
    // What each holds: a buffer's or render buffer's bytes ({ kind, bytes }); a picture's, by
    // face and level ({ kind, levels })
    #buffers = new WeakMap();
    #renderbuffers = new WeakMap();
    #textures = new WeakMap();

    // Told when one's collected that was never given back (its record: #collected), where the
    // browser can say; and which drawing they were given to (a lost one's are all given back
    // already: reset)
    #gone = typeof FinalizationRegistry === "function" ? new FinalizationRegistry((record) => this.#collected(record)) : null;
    #drawing = 0;

    constructor() {
        /** Bytes held, by kind, and how many of each. */
        this.bytes = { buffers: 0, textures: 0, renderbuffers: 0 };
        this.count = { buffers: 0, textures: 0, renderbuffers: 0 };
        this.watching = false;
    }
''')

swap('''    reset() {
        this.bytes = { buffers: 0, textures: 0, renderbuffers: 0 };
        this.count = { buffers: 0, textures: 0, renderbuffers: 0 };
        this.#buffers = new WeakMap();
        this.#renderbuffers = new WeakMap();
        this.#textures = new WeakMap();
    }
''', '''    reset() {
        this.bytes = { buffers: 0, textures: 0, renderbuffers: 0 };
        this.count = { buffers: 0, textures: 0, renderbuffers: 0 };
        this.#buffers = new WeakMap();
        this.#renderbuffers = new WeakMap();
        this.#textures = new WeakMap();
        this.#drawing++;
    }

    // Something collected that was never given back (a buffer whose geometry was simply let go):
    // the browser's freed it, so it's held no more. Not one given back since, nor one of a
    // drawing that's been lost
    #collected(record) {
        if (record.gone || record.drawing !== this.#drawing) {
            return;
        }

        for (const bytes of record.levels?.values() ?? [record.bytes]) {
            this.bytes[record.kind] -= bytes;
        }

        this.count[record.kind]--;
    }
''')

swap('''            held(target, level, width * height * texelBytes(internalformat, whole ? args[3] : args[6], whole ? args[4] : args[7]));
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
''', '''            held(target, level, imageBytes(internalformat, width, height, whole ? args[3] : args[6], whole ? args[4] : args[7]));
        });
        wrap("texImage3D", ([target, level, internalformat, width, height, depth, , format, type]) => held(target, level, depth * imageBytes(internalformat, width, height, format, type)));
        wrap("copyTexImage2D", ([target, level, internalformat, , , width, height]) => held(target, level, imageBytes(internalformat, width, height)));
        wrap("compressedTexImage2D", ([target, level, , , , , data, offset = 0, length = 0]) => held(target, level, typeof data === "number" ? data : length || (data?.byteLength ?? 0) - offset));
        // (Storage for every level: a compressed picture's too, its blocks given after with
        // compressedTexSubImage2D, which holds no more than this)
        wrap("texStorage2D", ([target, levels, internalformat, width, height]) => {
            let bytes = 0;

            for (let level = 0; level < levels; level++) {
                bytes += imageBytes(internalformat, Math.max(1, width >> level), Math.max(1, height >> level));
            }

            held(target, "storage", bytes * (target === GL.TEXTURE_CUBE_MAP ? 6 : 1));
        });
        wrap("texStorage3D", ([target, levels, internalformat, width, height, depth]) => {
            let bytes = 0;

            for (let level = 0; level < levels; level++) {
                bytes += imageBytes(internalformat, Math.max(1, width >> level), Math.max(1, height >> level)) * (target === GL.TEXTURE_3D ? Math.max(1, depth >> level) : depth);
            }

            held(target, "storage", bytes);
        });
''')

swap('''        wrap("deleteTexture", ([texture]) => {
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
''', '''        wrap("deleteTexture", ([texture]) => {
            const record = this.#textures.get(texture);

            if (record) {
                for (const bytes of record.levels.values()) {
                    this.bytes.textures -= bytes;
                }

                this.#textures.delete(texture);
                this.count.textures--;
                record.gone = true;
                this.#gone?.unregister(texture);
            }
        });
        wrap("renderbufferStorage", ([, internalformat, width, height]) => this.#hold(this.#renderbuffers, "renderbuffers", gl.getParameter(GL.RENDERBUFFER_BINDING), width * height * texelBytes(internalformat)));
        wrap("renderbufferStorageMultisample", ([, samples, internalformat, width, height]) => this.#hold(this.#renderbuffers, "renderbuffers", gl.getParameter(GL.RENDERBUFFER_BINDING), Math.max(1, samples) * width * height * texelBytes(internalformat)));
''')

swap('''        wrap("generateMipmap", ([target]) => {
            const texture = bound(target);
            const levels = this.#textures.get(texture);

            if (levels) {''', '''        wrap("generateMipmap", ([target]) => {
            const texture = bound(target);
            const levels = this.#textures.get(texture)?.levels;

            if (levels) {''')

swap('''    // A buffer or render buffer (`object`, in `held`) holding `bytes` now (null: given back)
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
''', '''    // A buffer or render buffer (`object`, in `held`) holding `bytes` now (null: given back)
    #hold(held, kind, object, bytes) {
        if (!object) {
            return;
        }

        const was = held.get(object);

        this.bytes[kind] += (bytes ?? 0) - (was?.bytes ?? 0);

        if (bytes === null) {
            if (was) {
                held.delete(object);
                this.count[kind]--;
                was.gone = true;
                this.#gone?.unregister(object);
            }
        } else if (was) {
            was.bytes = bytes;
        } else {
            held.set(object, this.#record(object, { kind, bytes }));
            this.count[kind]++;
        }
    }

    // What something newly held holds, kept to count it out if it's collected with nothing said
    #record(object, record) {
        Object.assign(record, { gone: false, drawing: this.#drawing });
        this.#gone?.register(object, record, object);

        return record;
    }

    // A picture holding `bytes` at one of its faces' levels (`key`)
    #held(texture, key, bytes) {
        if (!texture) {
            return;
        }

        let record = this.#textures.get(texture);

        if (!record) {
            record = this.#record(texture, { kind: "textures", levels: new Map() });
            this.#textures.set(texture, record);
            this.count.textures++;
        }

        this.bytes.textures += bytes - (record.levels.get(key) ?? 0);
        record.levels.set(key, bytes);
    }
}
''')

open(p, 'w').write(s)
