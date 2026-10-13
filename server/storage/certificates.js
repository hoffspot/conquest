// The server's certificate (generated/world_server_plan.md §9.2): its key and its chain, kept in
// certificates/ in the data folder, each file 0600 in a folder 0700. TLS on the one port answers
// with it (world-server.js), and it decides whether the server can be reached from the internet at
// all. ACME (S6b) puts it here, and renews it; an owner with a certificate of their own can put
// theirs here too (server.key and server.crt, PEM), and it's taken up when the server next looks.
//
//   certificates/server.key    the certificate's private key (PKCS #8 PEM)
//   certificates/server.crt    the certificate, then the rest of its chain (PEM)

import { X509Certificate, createPrivateKey } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { describe } from "../net/x509.js";
import { ensureFolder, exists, writeAtomic } from "./files.js";

/** Where in the data folder the certificates are kept. */
export const CERTIFICATES = "certificates";
export const KEY_FILE = "server.key";
export const CERT_FILE = "server.crt";

/** Why a key and certificate can't be used together (a sentence), or null if they can. */
export function certificateReason({ key, cert }) {
    let parsed;
    let keyObject;

    try {
        parsed = new X509Certificate(cert);
    } catch {
        return "That isn't a certificate (PEM).";
    }

    try {
        keyObject = createPrivateKey(key);
    } catch {
        return "That isn't a private key (PEM).";
    }

    if (!parsed.checkPrivateKey(keyObject)) {
        return "The key isn't the certificate's.";
    }

    if (Date.parse(parsed.validTo) <= Date.now()) {
        return `The certificate ran out on ${new Date(parsed.validTo).toISOString().slice(0, 10)}.`;
    }

    return null;
}

export class CertificateStore {
    constructor(root) {
        this.folder = path.join(root, CERTIFICATES);
    }

    /** The certificate kept: { key, cert (PEM), info (x509.js describe) }, or null if there's none (or what's there can't be used). */
    async current() {
        const keyFile = path.join(this.folder, KEY_FILE);
        const certFile = path.join(this.folder, CERT_FILE);

        if (!(await exists(keyFile)) || !(await exists(certFile))) {
            return null;
        }

        const pair = { key: await readFile(keyFile, "utf8"), cert: await readFile(certFile, "utf8") };

        if (certificateReason(pair)) {
            return null;
        }

        return { ...pair, info: describe(pair.cert) };
    }

    /** A key and certificate kept (checked first: refused, saying why, if they can't be used together). Returns its info. */
    async save({ key, cert }) {
        const reason = certificateReason({ key, cert });

        if (reason) {
            throw new Error(reason);
        }

        await ensureFolder(this.folder);
        await writeAtomic(path.join(this.folder, KEY_FILE), key);
        await writeAtomic(path.join(this.folder, CERT_FILE), cert);

        return describe(cert);
    }

    /** The certificate let go (the server no longer answers TLS). */
    async remove() {
        await rm(path.join(this.folder, KEY_FILE), { force: true });
        await rm(path.join(this.folder, CERT_FILE), { force: true });
    }
}
