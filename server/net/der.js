// DER, ASN.1's distinguished encoding (ITU-T X.690), as much of it as certificates and their
// requests need (generated/world_server_plan.md §9.2): the server makes its own certificate
// requests for ACME, and the self-signed certificate TLS-ALPN-01 asks for, on node:crypto alone.
//
// Encoding: each helper returns a Buffer (tag, length, content). Decoding: read(buffer) gives the
// value at the start of it, { tag, constructed, header, content, children, end }.

/** A length, as DER writes it (short form below 128, else 0x80 + its bytes). */
function lengthOf(length) {
    if (length < 0x80) {
        return Buffer.from([length]);
    }

    const bytes = [];

    for (let left = length; left > 0; left = Math.floor(left / 256)) {
        bytes.unshift(left % 256);
    }

    return Buffer.from([0x80 | bytes.length, ...bytes]);
}

/** A value: its tag byte and content. */
export const tlv = (tag, content) => Buffer.concat([Buffer.from([tag]), lengthOf(content.length), content]);

export const sequence = (...items) => tlv(0x30, Buffer.concat(items.flat()));
export const set = (...items) => tlv(0x31, Buffer.concat(items.flat()));
export const nul = () => Buffer.from([0x05, 0x00]);
export const boolean = (value) => tlv(0x01, Buffer.from([value ? 0xff : 0x00]));
export const octets = (content) => tlv(0x04, Buffer.from(content));
export const utf8 = (text) => tlv(0x0c, Buffer.from(String(text), "utf8"));
export const ia5 = (text) => tlv(0x16, Buffer.from(String(text), "ascii"));

/** A BIT STRING of whole bytes (no unused bits). */
export const bits = (content) => tlv(0x03, Buffer.concat([Buffer.from([0x00]), Buffer.from(content)]));

/** An INTEGER: from a number, a bigint or (unsigned, big-endian) bytes; kept positive. */
export function integer(value) {
    let bytes;

    if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
        bytes = Buffer.from(value);
    } else {
        let hex = BigInt(value).toString(16);

        hex = hex.length % 2 ? `0${hex}` : hex;
        bytes = Buffer.from(hex, "hex");
    }

    let start = 0;

    while (start < bytes.length - 1 && bytes[start] === 0x00 && !(bytes[start + 1] & 0x80)) {
        start += 1;
    }

    bytes = bytes.subarray(start);

    return tlv(0x02, bytes[0] & 0x80 ? Buffer.concat([Buffer.from([0x00]), bytes]) : bytes);
}

/** An OBJECT IDENTIFIER, from its dotted form ("1.2.840.10045.4.3.2"). */
export function oid(dotted) {
    const arcs = String(dotted).split(".").map(Number);
    const bytes = [40 * arcs[0] + arcs[1]];

    for (const arc of arcs.slice(2)) {
        const sevens = [];

        for (let left = arc; ; left = Math.floor(left / 128)) {
            sevens.unshift(left % 128);

            if (left < 128) {
                break;
            }
        }

        bytes.push(...sevens.map((seven, index) => (index < sevens.length - 1 ? seven | 0x80 : seven)));
    }

    return tlv(0x06, Buffer.from(bytes));
}

/** A time: UTCTime before 2050, GeneralizedTime from then (RFC 5280 §4.1.2.5). */
export function time(date) {
    const when = new Date(date);
    const iso = when.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/[-:T]/g, "");

    return when.getUTCFullYear() < 2050 ? tlv(0x17, Buffer.from(iso.slice(2), "ascii")) : tlv(0x18, Buffer.from(iso, "ascii"));
}

/** [n] EXPLICIT: a context-specific tag around a whole value. */
export const explicit = (n, value) => tlv(0xa0 | n, Buffer.from(value));

/** [n] IMPLICIT, primitive: a context-specific tag in place of the value's own. */
export const implicit = (n, content) => tlv(0x80 | n, Buffer.from(content));

/** [n] IMPLICIT, constructed (as a SET OF or SEQUENCE's tag replaced). */
export const implicitConstructed = (n, content) => tlv(0xa0 | n, Buffer.from(content));

/** The value at the start of `buffer` (from `at`): { tag, constructed, header, content, children, end }. Throws if it isn't DER. */
export function read(buffer, at = 0) {
    const bytes = Buffer.from(buffer);

    if (at + 2 > bytes.length) {
        throw new Error("DER: cut short");
    }

    const tag = bytes[at];
    let length = bytes[at + 1];
    let header = 2;

    if (length & 0x80) {
        const count = length & 0x7f;

        if (count === 0 || count > 4 || at + 2 + count > bytes.length) {
            throw new Error("DER: a length it can't read");
        }

        length = 0;

        for (let i = 0; i < count; i++) {
            length = length * 256 + bytes[at + 2 + i];
        }

        header += count;
    }

    const start = at + header;
    const end = start + length;

    if (end > bytes.length) {
        throw new Error("DER: cut short");
    }

    const content = bytes.subarray(start, end);
    const constructed = Boolean(tag & 0x20);
    const children = [];

    if (constructed) {
        for (let next = 0; next < content.length; ) {
            const child = read(content, next);

            children.push(child);
            next = child.end;
        }
    }

    return { tag, constructed, header: bytes.subarray(at, start), content, children, end, whole: bytes.subarray(at, end) };
}

/** An OBJECT IDENTIFIER's dotted form, from its content. */
export function oidOf(content) {
    const arcs = [Math.floor(content[0] / 40), content[0] % 40];
    let value = 0;

    for (const byte of content.subarray(1)) {
        value = value * 128 + (byte & 0x7f);

        if (!(byte & 0x80)) {
            arcs.push(value);
            value = 0;
        }
    }

    return arcs.join(".");
}
