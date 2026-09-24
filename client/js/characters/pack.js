// Packing and unpacking the character data file (client/characters/human.bin).
//
// The file is gzip-compressed (the browser unpacks it with DecompressionStream). Inside, each
// section is a typed array stored either as it is ("raw"), or, for whole numbers that change
// smoothly from one vertex to the next, as "delta": each channel (x, y, z) separately, as the
// difference from the previous vertex, zigzag-encoded, with the low and high bytes stored apart.
// That turns smooth data into long runs of small, repetitive bytes, which gzip compresses about
// twice as well.
//
// Pure data, no DOM: shared by the build script (scripts/build-characters.js) and the engine.

const TYPES = { f32: Float32Array, u16: Uint16Array, i16: Int16Array, u8: Uint8Array };

const zigzag = (value) => ((value << 1) ^ (value >> 31)) & 0xffff;
const unzigzag = (value) => (value >>> 1) ^ -(value & 1);

/** Encode a typed array: returns { bytes (Uint8Array), section (its description, minus offset) }. */
export function encodeSection(array, { codec = "raw", channels = 1 } = {}) {
    const type = Object.keys(TYPES).find((name) => array instanceof TYPES[name]);

    if (codec === "raw") {
        return { bytes: new Uint8Array(array.buffer, array.byteOffset, array.byteLength), section: { type, codec, length: array.length } };
    }

    // "delta": 16-bit whole numbers, channel by channel
    const count = array.length / channels;
    const bytes = new Uint8Array(array.length * 2);
    let i = 0;

    for (let channel = 0; channel < channels; channel++) {
        let previous = 0;

        for (let v = 0; v < count; v++) {
            const value = array[v * channels + channel];

            // Differences wrap round in 16 bits, as the decoded values do
            const coded = zigzag(((value - previous) << 16) >> 16);

            previous = value;
            bytes[i] = coded & 255;
            bytes[array.length + i] = coded >> 8;
            i++;
        }
    }

    return { bytes, section: { type, codec, channels, length: array.length } };
}

/** Decode a section described by `section` from the unpacked file's bytes. */
export function decodeSection(buffer, section) {
    const Type = TYPES[section.type];

    if (section.codec === "raw") {
        return new Type(buffer.slice(section.offset, section.offset + section.length * Type.BYTES_PER_ELEMENT));
    }

    const bytes = new Uint8Array(buffer, section.offset, section.length * 2);
    const { channels, length } = section;
    const count = length / channels;
    const array = new Type(length);
    let i = 0;

    for (let channel = 0; channel < channels; channel++) {
        let previous = 0;

        for (let v = 0; v < count; v++) {
            previous += unzigzag(bytes[i] | (bytes[length + i] << 8));
            array[v * channels + channel] = previous;
            i++;
        }
    }

    return array;
}

/** Collects encoded sections into one file (before compression), 4-byte aligned. */
export class Packer {
    #parts = [];
    #length = 0;

    add(array, options) {
        const { bytes, section } = encodeSection(array, options);
        const padding = (4 - (this.#length % 4)) % 4;

        if (padding) {
            this.#parts.push(new Uint8Array(padding));
            this.#length += padding;
        }

        section.offset = this.#length;
        this.#parts.push(bytes);
        this.#length += bytes.length;

        return section;
    }

    get length() {
        return this.#length;
    }

    /** Everything added, as one Uint8Array. */
    toBytes() {
        const result = new Uint8Array(this.#length);
        let at = 0;

        for (const part of this.#parts) {
            result.set(part, at);
            at += part.length;
        }

        return result;
    }
}
