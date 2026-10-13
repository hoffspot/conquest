// Certificates made on node:crypto alone (server/net/der.js, x509.js; generated/world_server_plan.md
// §9.2): DER encoded as X.690 has it and read back; certificate requests (PKCS #10) naming DNS names
// and IP addresses, signed and verified; certificates that Node's own X509Certificate reads, by the
// names they carry, signed by the key they say; TLS-ALPN-01's acmeIdentifier; and the store that
// keeps the server's (storage/certificates.js), refusing a pair that can't be used.
import assert from "node:assert/strict";
import { createHash, createPublicKey, X509Certificate } from "node:crypto";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import * as der from "../server/net/der.js";
import { canonical, certificate, derOf, describe as describeCert, newKey, pem, pemOfKey, readRequest, request, selfSigned } from "../server/net/x509.js";
import { CERT_FILE, certificateReason, CertificateStore, CERTIFICATES, KEY_FILE } from "../server/storage/certificates.js";

const made = [];

after(async () => {
    await Promise.all(made.map((folder) => rm(folder, { recursive: true, force: true })));
});

describe("DER (server/net/der.js)", () => {
    it("writes lengths short and long, integers kept positive, object identifiers, and times either side of 2050", () => {
        assert.deepEqual([...der.octets(Buffer.alloc(3))], [0x04, 0x03, 0, 0, 0]);
        assert.deepEqual([...der.octets(Buffer.alloc(200)).subarray(0, 3)], [0x04, 0x81, 200]);
        assert.deepEqual([...der.octets(Buffer.alloc(300)).subarray(0, 4)], [0x04, 0x82, 0x01, 0x2c]);

        // (INTEGER: no needless leading zeros, and one put in front of a high bit so it stays positive)
        assert.deepEqual([...der.integer(0)], [0x02, 0x01, 0x00]);
        assert.deepEqual([...der.integer(127)], [0x02, 0x01, 0x7f]);
        assert.deepEqual([...der.integer(128)], [0x02, 0x02, 0x00, 0x80]);
        assert.deepEqual([...der.integer(Buffer.from([0x00, 0x00, 0x01]))], [0x02, 0x01, 0x01]);
        assert.deepEqual([...der.integer(Buffer.from([0xff, 0x01]))], [0x02, 0x03, 0x00, 0xff, 0x01]);

        // (ecdsa-with-SHA256, as every certificate names it)
        assert.equal(der.oid("1.2.840.10045.4.3.2").toString("hex"), "06082a8648ce3d040302");
        assert.equal(der.oidOf(der.read(der.oid("1.3.6.1.5.5.7.1.31")).content), "1.3.6.1.5.5.7.1.31");

        assert.equal(der.time(Date.UTC(2026, 9, 13, 4, 5, 6)).toString("latin1"), "\x17\x0d261013040506Z");
        assert.equal(der.time(Date.UTC(2050, 0, 1)).toString("latin1"), "\x18\x0f20500101000000Z");
    });

    it("reads back what it wrote, children and all, and refuses what's cut short", () => {
        const value = der.sequence(der.integer(5), der.set(der.utf8("Thornwick"), der.boolean(true)), der.octets(Buffer.alloc(150, 7)));
        const read = der.read(value);

        assert.equal(read.tag, 0x30);
        assert.deepEqual(read.children.map((child) => child.tag), [0x02, 0x31, 0x04]);
        assert.equal(read.children[1].children[0].content.toString("utf8"), "Thornwick");
        assert.equal(read.children[2].content.length, 150);
        assert.deepEqual(read.whole, value);
        assert.throws(() => der.read(value.subarray(0, value.length - 1)), /cut short/);
        assert.throws(() => der.read(Buffer.from([0x30, 0x85, 1, 1, 1, 1, 1])), /length/);
    });
});

describe("certificates and their requests (server/net/x509.js)", () => {
    const { privateKey } = newKey();
    const names = ["pellagos-sam.duckdns.org", "203.0.113.7", "2001:db8::7"];

    it("asks for a certificate (PKCS #10) naming DNS names and IP addresses, signed by its key", () => {
        const asked = request({ key: privateKey, names });
        const read = readRequest(asked);

        assert.equal(read.verified, true);
        assert.deepEqual(read.names, names);
        assert.equal(read.publicKey.asymmetricKeyDetails.namedCurve, "prime256v1");

        // (Tampered with, it no longer verifies)
        const spoilt = Buffer.from(asked);

        spoilt[30] ^= 0xff;
        assert.equal(readRequest(spoilt).verified, false);
    });

    it("makes certificates Node reads: its names, its times, its issuer, signed by the issuer's key", () => {
        const authority = newKey();
        const notBefore = Date.UTC(2026, 9, 1);
        const made = new X509Certificate(pem("CERTIFICATE", certificate({ publicKey: privateKey, names, issuer: "Pellagos Test CA", issuerKey: authority.privateKey, notBefore, days: 90 })));

        assert.equal(made.subjectAltName, "DNS:pellagos-sam.duckdns.org, IP Address:203.0.113.7, IP Address:2001:DB8:0:0:0:0:0:7");
        assert.equal(made.issuer, "CN=Pellagos Test CA");
        assert.equal(made.subject, "CN=pellagos-sam.duckdns.org");
        assert.equal(Date.parse(made.validFrom), notBefore);
        assert.equal(Date.parse(made.validTo), notBefore + 90 * 86400000);
        assert.equal(made.verify(authority.publicKey), true);
        assert.equal(made.checkPrivateKey(privateKey), true);
        assert.equal(made.ca, false);
        assert.ok(made.keyUsage.includes("1.3.6.1.5.5.7.3.1"), "for TLS servers");
        assert.ok(made.checkHost("pellagos-sam.duckdns.org") && made.checkIP("203.0.113.7") && made.checkIP("2001:db8::7"));
        assert.equal(made.checkHost("evil.example"), undefined);
    });

    it("signs its own for TLS-ALPN-01, the key authorization's SHA-256 in the critical acmeIdentifier extension", () => {
        const authorization = "token-abc.thumbprint-xyz";
        const made = selfSigned({ key: privateKey, names: ["203.0.113.7"], hours: 1, acme: authorization });
        const tbs = der.read(made).children[0];
        const extensions = tbs.children.find((child) => child.tag === 0xa3).children[0].children;
        const acme = extensions.find((ext) => der.oidOf(ext.children[0].content) === "1.3.6.1.5.5.7.1.31");

        assert.ok(acme, "it carries acmeIdentifier");
        assert.equal(acme.children[1].tag, 0x01, "marked critical");
        assert.deepEqual(der.read(acme.children[2].content).content, createHash("sha256").update(authorization).digest());
        assert.equal(new X509Certificate(pem("CERTIFICATE", made)).verify(createPublicKey(privateKey)), true);
    });

    it("says what a certificate says of itself, names as it compares them; and reads PEM back", () => {
        const made = pem("CERTIFICATE", selfSigned({ key: privateKey, names: ["Pellagos.Example.com", "2001:0db8:0000::0007"], days: 7 }));
        const info = describeCert(made);

        assert.deepEqual(info.names, ["pellagos.example.com", "2001:db8::7"]);
        assert.equal(info.issuer, "pellagos.example.com");
        assert.match(info.fingerprint, /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
        assert.equal(Date.parse(info.notAfter) - Date.parse(info.notBefore), 7 * 86400000);
        assert.deepEqual(derOf(made), Buffer.from(new X509Certificate(made).raw));
        assert.throws(() => derOf("not pem"), /PEM/);
        assert.equal(canonical("2001:DB8::0:7"), "2001:db8::7");
        assert.equal(canonical("Studio-Mac.local"), "studio-mac.local");
    });
});

describe("the server's certificate, kept (server/storage/certificates.js)", () => {
    const pair = (names = ["localhost"], { hours = null, days = 7, key = newKey().privateKey } = {}) => ({ key: pemOfKey(key), cert: pem("CERTIFICATE", selfSigned({ key, names, days, hours })) });

    it("keeps a key and its certificate, 0600 in a folder 0700, and gives them back", async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), "pellagos-certificates-"));

        made.push(root);

        const store = new CertificateStore(root);
        const kept = pair(["pellagos.example.com"]);

        assert.equal(await store.current(), null, "none at first");

        const info = await store.save(kept);

        assert.deepEqual(info.names, ["pellagos.example.com"]);
        assert.deepEqual(await store.current(), { ...kept, info });

        if (process.platform !== "win32") {
            assert.equal((await stat(path.join(root, CERTIFICATES))).mode & 0o777, 0o700);
            assert.equal((await stat(path.join(root, CERTIFICATES, KEY_FILE))).mode & 0o777, 0o600);
            assert.equal((await stat(path.join(root, CERTIFICATES, CERT_FILE))).mode & 0o777, 0o600);
        }

        // (Spoilt by hand: it isn't used, and nothing's thrown)
        await writeFile(path.join(root, CERTIFICATES, CERT_FILE), "garbage");
        assert.equal(await store.current(), null);

        await store.remove();
        assert.equal(await store.current(), null);
    });

    it("refuses a pair that can't be used together, saying why", () => {
        const good = pair();

        assert.equal(certificateReason(good), null);
        assert.equal(certificateReason({ ...good, cert: "nope" }), "That isn't a certificate (PEM).");
        assert.equal(certificateReason({ ...good, key: "nope" }), "That isn't a private key (PEM).");
        assert.equal(certificateReason({ ...good, key: pair().key }), "The key isn't the certificate's.");

        const key = newKey().privateKey;
        const old = { key: pemOfKey(key), cert: pem("CERTIFICATE", certificate({ publicKey: key, names: ["localhost"], issuer: "localhost", issuerKey: key, notBefore: Date.UTC(2020, 0, 1), days: 30 })) };

        assert.equal(certificateReason(old), "The certificate ran out on 2020-01-31.");
    });
});
