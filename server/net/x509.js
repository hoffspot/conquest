// Certificates and certificate requests, made on node:crypto alone (generated/world_server_plan.md
// §9.2): Node reads certificates (crypto.X509Certificate) but can't make them, so these are put
// together here in DER (der.js). The server makes three kinds:
//
//   request(...)     a certificate request (PKCS #10, RFC 2986) for ACME's finalize, naming the
//                    server's DNS names and IP addresses in its subjectAltName;
//   selfSigned(...)  a certificate signed by its own key: TLS-ALPN-01's answer (RFC 8737, with the
//                    critical acmeIdentifier extension), and the tests' stand-in;
//   certificate(...) one signed by another key (the tests' own certificate authority).
//
// Keys are ECDSA P-256, signed with SHA-256 (ecdsa-with-SHA256): every browser and ACME CA takes them.

import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign, verify, X509Certificate } from "node:crypto";
import { isIP } from "node:net";
import * as der from "./der.js";

const OID = Object.freeze({
    ecdsaWithSHA256: "1.2.840.10045.4.3.2",
    commonName: "2.5.4.3",
    subjectAltName: "2.5.29.17",
    basicConstraints: "2.5.29.19",
    keyUsage: "2.5.29.15",
    extKeyUsage: "2.5.29.37",
    serverAuth: "1.3.6.1.5.5.7.3.1",
    acmeIdentifier: "1.3.6.1.5.5.7.1.31",
    extensionRequest: "1.2.840.113549.1.9.14",
});

/** A new key for a certificate (or an ACME account): ECDSA P-256, { privateKey, publicKey } as KeyObjects. */
export function newKey() {
    return generateKeyPairSync("ec", { namedCurve: "P-256" });
}

/** A key from its PEM (PKCS #8), and back. */
export const keyOf = (pem) => createPrivateKey(pem);
export const pemOfKey = (key) => key.export({ type: "pkcs8", format: "pem" });

/** DER as PEM, under its label ("CERTIFICATE", "CERTIFICATE REQUEST"). */
export function pem(label, bytes) {
    const lines = Buffer.from(bytes).toString("base64").match(/.{1,64}/g) ?? [];

    return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}

/** The DER inside a PEM (its first block). */
export function derOf(text) {
    const found = /-----BEGIN [^-]+-----([\s\S]*?)-----END [^-]+-----/.exec(String(text));

    if (!found) {
        throw new Error("That isn't PEM.");
    }

    return Buffer.from(found[1].replace(/\s+/g, ""), "base64");
}

/** An address as compared and shown: IPv6 compressed and lower-case (as a URL writes it), anything else as it is. */
export const canonical = (name) => (isIP(name) === 6 ? new URL(`http://[${name}]`).hostname.slice(1, -1) : String(name).toLowerCase());

// A key's public half as SubjectPublicKeyInfo (DER): from a public key, or a private one's
const spkiOf = (key) => (key.type === "public" ? key : createPublicKey(key)).export({ type: "spki", format: "der" });

const algorithm = () => der.sequence(der.oid(OID.ecdsaWithSHA256));
const nameOf = (commonName) => der.sequence(der.set(der.sequence(der.oid(OID.commonName), der.utf8(commonName))));

// An IP address's bytes (4 for IPv4, 16 for IPv6), as iPAddress carries it
function ipBytes(address) {
    if (isIP(address) === 4) {
        return Buffer.from(address.split(".").map(Number));
    }

    const [head, tail = ""] = address.split("::");
    const groups = (part) => (part ? part.split(":") : []);
    const left = groups(head);
    const right = groups(tail);
    const all = address.includes("::") ? [...left, ...Array(8 - left.length - right.length).fill("0"), ...right] : left;

    return Buffer.concat(all.map((group) => Buffer.from(group.padStart(4, "0"), "hex")));
}

/** subjectAltName's GeneralNames for DNS names and IP addresses (canonical): dNSName [2], iPAddress [7]. */
function altNames(names) {
    return der.sequence(...names.map((name) => (isIP(name) ? der.implicit(7, ipBytes(name)) : der.implicit(2, Buffer.from(name, "ascii")))));
}

const extension = (id, value, critical = false) => der.sequence(der.oid(id), ...(critical ? [der.boolean(true)] : []), der.octets(value));

/** The extensions a server's certificate carries: its names, not a CA, for signing, for TLS servers; and `more`. */
function serverExtensions(names, more = []) {
    return [
        extension(OID.subjectAltName, altNames(names)),
        extension(OID.basicConstraints, der.sequence(), true),
        extension(OID.keyUsage, der.tlv(0x03, Buffer.from([0x07, 0x80])), true),
        extension(OID.extKeyUsage, der.sequence(der.oid(OID.serverAuth))),
        ...more,
    ];
}

/**
 * A certificate request (PKCS #10, DER) for `names` (DNS names and IP addresses, each made
 * canonical), signed by `key` (its private KeyObject). Its subject is the first name; all are in
 * subjectAltName.
 */
export function request({ key, names: given }) {
    const names = given.map(canonical);
    const publicKey = spkiOf(key);
    const attributes = der.implicitConstructed(0, der.sequence(der.oid(OID.extensionRequest), der.set(der.sequence(extension(OID.subjectAltName, altNames(names))))));
    const info = der.sequence(der.integer(0), nameOf(names[0]), publicKey, attributes);

    return der.sequence(info, algorithm(), der.bits(sign("sha256", info, { key, dsaEncoding: "der" })));
}

/**
 * A certificate (DER) for `publicKey` (a KeyObject or SPKI DER) naming `names`, signed by
 * `issuerKey` under `issuer` (a common name), valid from `notBefore` for `days`; `extensions`
 * more DER extensions.
 */
export function certificate({ publicKey, names: given, issuer, issuerKey, notBefore = Date.now() - 60000, days = 90, hours = null, serial = randomBytes(16), extensions = [] }) {
    const names = given.map(canonical);
    const spki = Buffer.isBuffer(publicKey) ? publicKey : spkiOf(publicKey);
    const notAfter = notBefore + (hours ?? days * 24) * 3600 * 1000;
    const tbs = der.sequence(
        der.explicit(0, der.integer(2)),
        der.integer(Buffer.concat([Buffer.from([0x01]), Buffer.from(serial).subarray(0, 15)])),
        algorithm(),
        nameOf(issuer),
        der.sequence(der.time(notBefore), der.time(notAfter)),
        nameOf(names[0]),
        spki,
        der.explicit(3, der.sequence(...serverExtensions(names, extensions))),
    );

    return der.sequence(tbs, algorithm(), der.bits(sign("sha256", tbs, { key: issuerKey, dsaEncoding: "der" })));
}

/**
 * A certificate signed by its own `key` for `names`. `acme` is a TLS-ALPN-01 key authorization
 * (RFC 8737 §3): its SHA-256 goes in the critical acmeIdentifier extension.
 */
export function selfSigned({ key, names, days = 7, hours = null, acme = null }) {
    const more = acme === null ? [] : [extension(OID.acmeIdentifier, der.octets(createHash("sha256").update(acme).digest()), true)];

    return certificate({ publicKey: key, names, issuer: canonical(names[0]), issuerKey: key, days, hours, extensions: more });
}

/** What a certificate (PEM) says of itself: { names, notBefore, notAfter, issuer, fingerprint }. */
export function describe(text) {
    const cert = new X509Certificate(text);
    const names = String(cert.subjectAltName ?? "")
        .split(/,\s*/)
        .map((entry) => /^(?:DNS|IP Address):(.+)$/.exec(entry)?.[1])
        .filter(Boolean)
        .map(canonical);

    return { names, notBefore: new Date(cert.validFrom).toISOString(), notAfter: new Date(cert.validTo).toISOString(), issuer: cert.issuer.replace(/^CN=/, ""), fingerprint: cert.fingerprint256 };
}

/**
 * A certificate request read back (DER): { publicKey (a KeyObject), names, verified (its
 * signature good) }. The tests' certificate authority reads the server's this way.
 */
export function readRequest(bytes) {
    const top = der.read(bytes);
    const [info, , signature] = top.children;
    const spki = info.children[2].whole;
    const publicKey = createPublicKey({ key: spki, format: "der", type: "spki" });
    const names = [];

    for (const attribute of info.children[3]?.children ?? []) {
        if (der.oidOf(attribute.children[0].content) !== OID.extensionRequest) {
            continue;
        }

        for (const ext of attribute.children[1].children[0].children) {
            if (der.oidOf(ext.children[0].content) !== OID.subjectAltName) {
                continue;
            }

            for (const general of der.read(ext.children.at(-1).content).children) {
                if (general.tag === 0x82) {
                    names.push(general.content.toString("ascii"));
                } else if (general.tag === 0x87) {
                    const ip = general.content;

                    names.push(canonical(ip.length === 4 ? [...ip].join(".") : (ip.toString("hex").match(/.{4}/g) ?? []).join(":")));
                }
            }
        }
    }

    return { publicKey, names, verified: verify("sha256", info.whole, { key: publicKey, dsaEncoding: "der" }, signature.content.subarray(1)) };
}
