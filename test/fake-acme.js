// A certificate authority for the tests, speaking ACME (RFC 8555) as Let's Encrypt does, on
// loopback: a directory with profiles ("classic", 90 days; "shortlived", 160 hours, the only one
// for IP addresses) and renewal information (RFC 9773); accounts, orders, authorizations and
// challenges; every request's JWS checked (its nonce used once, its URL, its signature, by the
// account's key or URL); dns-01 checked against a fake DNS (`dns`: a name's TXT values), and
// tls-alpn-01 by connecting to the address's port as a validator would (RFC 8737, RFC 8738: the
// reverse name by SNI, acme-tls/1 by ALPN, the critical acmeIdentifier extension checked); the
// certificate request checked and a chain issued from its own CA. Its first nonce is refused as
// stale, as a real CA's may be, so the client's retry is proved every time. And the DNS hosts'
// APIs (DuckDNS, Cloudflare, deSEC) faked, writing to its DNS, and the DNS that answers from it.

import { createHash, createPublicKey, randomBytes, verify, X509Certificate } from "node:crypto";
import http from "node:http";
import tls from "node:tls";
import * as der from "../server/net/der.js";
import { ACME_TLS, dnsValueOf, reverseNameOf, thumbprint } from "../server/net/acme.js";
import { certificate, keyIdOf, newKey, pem, readRequest } from "../server/net/x509.js";

const PROFILES = Object.freeze({ classic: { hours: 90 * 24 }, shortlived: { hours: 160 } });
const b64u = (bytes) => Buffer.from(bytes).toString("base64url");
const json = (value) => JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
const without = (object, ...keys) => Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)));

class Problem extends Error {
    constructor(status, type, detail) {
        super(detail);
        Object.assign(this, { status, type });
    }
}

export class FakeAcme {
    /**
     * @param {object} options
     * @param {Map<string, Set<string>>} [options.dns] - TXT records by name (the DNS hosts' fakes write here).
     * @param {object} [options.ports] - Where tls-alpn-01 connects for an address ({ "127.0.0.1": port }).
     * @param {number} [options.window] - Renewal information: how long before the end the window opens (a share of the lifetime).
     */
    constructor({ dns = new Map(), ports = {}, window = 1 / 3 } = {}) {
        Object.assign(this, { dns, ports, window });
        this.ca = newKey();
        this.caCert = pem("CERTIFICATE", certificate({ publicKey: this.ca.publicKey, names: ["Fake ACME CA"], issuer: "Fake ACME CA", issuerKey: this.ca.privateKey, days: 3650, ca: true }));
        this.nonces = new Set();
        this.staleOnce = true;
        this.accounts = new Map();
        this.orders = new Map();
        this.authorizations = new Map();
        this.challenges = new Map();
        this.issued = new Map();
        this.requests = [];
        this.fail = null;
    }

    async start() {
        this.server = http.createServer((request, response) => this.#handle(request, response));
        await new Promise((resolve) => this.server.listen(0, "127.0.0.1", resolve));
        this.base = `http://127.0.0.1:${this.server.address().port}`;
        this.directory = `${this.base}/directory`;

        return this;
    }

    close() {
        this.server?.closeAllConnections();
        this.server?.close();
    }

    #nonce() {
        const nonce = b64u(randomBytes(16));

        this.nonces.add(nonce);

        return nonce;
    }

    #send(response, status, body, headers = {}) {
        const text = typeof body === "string" ? body : JSON.stringify(body);

        response.writeHead(status, { "Replay-Nonce": this.#nonce(), "Cache-Control": "no-store", "Content-Type": typeof body === "string" ? "application/pem-certificate-chain" : "application/json", ...headers });
        response.end(text);
    }

    async #handle(request, response) {
        const url = `${this.base}${request.url}`;
        const parts = [];

        for await (const part of request) {
            parts.push(part);
        }

        try {
            const route = request.url.split("/").filter(Boolean);

            this.requests.push(`${request.method} /${route[0] ?? ""}`);

            if (request.url === "/directory") {
                this.#send(response, 200, {
                    newNonce: `${this.base}/nonce`,
                    newAccount: `${this.base}/account`,
                    newOrder: `${this.base}/order`,
                    renewalInfo: `${this.base}/renewal-info`,
                    meta: { termsOfService: `${this.base}/terms`, profiles: { classic: `${this.base}/docs#classic`, shortlived: `${this.base}/docs#shortlived` } },
                });

                return;
            }

            if (route[0] === "nonce") {
                this.#send(response, request.method === "HEAD" ? 200 : 204, "");

                return;
            }

            if (route[0] === "renewal-info" && request.method === "GET") {
                const cert = this.issued.get(route[1]);

                if (!cert) {
                    throw new Problem(404, "malformed", "No such certificate.");
                }

                const end = Date.parse(cert.validTo);
                const lifetime = end - Date.parse(cert.validFrom);
                const start = end - lifetime * this.window;

                this.#send(response, 200, { suggestedWindow: { start: new Date(start).toISOString(), end: new Date(start + lifetime * 0.05).toISOString() } }, { "Retry-After": "21600" });

                return;
            }

            if (request.method !== "POST") {
                throw new Problem(405, "malformed", "POST, please.");
            }

            const { account, payload } = this.#verify(url, Buffer.concat(parts).toString("utf8"), route[0] === "account");

            this.#route(response, route, account, payload, url);
        } catch (error) {
            if (!(error instanceof Problem)) {
                throw error;
            }

            this.#send(response, error.status, { type: `urn:ietf:params:acme:error:${error.type}`, detail: error.message }, { "Content-Type": "application/problem+json" });
        }
    }

    // A JWS checked (RFC 8555 §6.2): its nonce (once), its URL, its key, its signature
    #verify(url, body, newAccount) {
        const { protected: head, payload, signature } = JSON.parse(body);
        const header = json(head);

        if (header.alg !== "ES256") {
            throw new Problem(400, "badSignatureAlgorithm", "ES256 alone.");
        }

        if (!this.nonces.delete(header.nonce) || this.staleOnce) {
            this.staleOnce = false;
            throw new Problem(400, "badNonce", "That nonce is stale.");
        }

        if (header.url !== url) {
            throw new Problem(401, "unauthorized", "The JWS names another URL.");
        }

        let key;
        let account = null;

        if (newAccount) {
            if (!header.jwk || header.kid) {
                throw new Problem(400, "malformed", "A new account is signed by its key itself.");
            }

            key = createPublicKey({ key: header.jwk, format: "jwk" });
        } else {
            account = this.accounts.get(header.kid);

            if (!account || header.jwk) {
                throw new Problem(400, "accountDoesNotExist", "No such account.");
            }

            key = account.key;
        }

        if (!verify("sha256", Buffer.from(`${head}.${payload}`), { key, dsaEncoding: "ieee-p1363" }, Buffer.from(signature, "base64url"))) {
            throw new Problem(400, "malformed", "The signature doesn't verify.");
        }

        return { account: account ?? { key }, payload: payload === "" ? "" : json(payload) };
    }

    #route(response, [what, id], account, payload, url) {
        switch (what) {
            case "account": {
                const found = [...this.accounts.entries()].find(([, one]) => thumbprint(one.key) === thumbprint(account.key));

                if (found) {
                    this.#send(response, 200, { status: "valid" }, { Location: found[0] });

                    return;
                }

                if (payload.termsOfServiceAgreed !== true) {
                    throw new Problem(403, "userActionRequired", "The terms of service must be agreed.");
                }

                const kid = `${this.base}/acct/${this.accounts.size + 1}`;

                this.accounts.set(kid, { key: account.key, contact: payload.contact ?? [] });
                this.#send(response, 201, { status: "valid" }, { Location: kid });

                return;
            }

            case "order": {
                if (id) {
                    this.#send(response, 200, this.#orderOf(id));

                    return;
                }

                const profile = payload.profile ?? "classic";

                if (!PROFILES[profile]) {
                    throw new Problem(400, "invalidProfile", `No profile "${profile}".`);
                }

                if (payload.identifiers.some((one) => one.type === "ip") && profile !== "shortlived") {
                    throw new Problem(400, "rejectedIdentifier", "IP addresses take the shortlived profile alone.");
                }

                const orderId = b64u(randomBytes(6));
                const authorizations = payload.identifiers.map((identifier) => {
                    const authzId = b64u(randomBytes(6));
                    const kinds = identifier.type === "ip" ? ["tls-alpn-01", "http-01"] : ["dns-01", "http-01"];
                    const challenges = kinds.map((type) => {
                        const challengeId = b64u(randomBytes(6));
                        const challenge = { type, url: `${this.base}/chall/${challengeId}`, token: b64u(randomBytes(16)), status: "pending", authz: authzId };

                        this.challenges.set(challengeId, challenge);

                        return challenge;
                    });

                    this.authorizations.set(authzId, { identifier, status: "pending", challenges, account });

                    return `${this.base}/authz/${authzId}`;
                });

                this.orders.set(orderId, { status: "pending", identifiers: payload.identifiers, authorizations, profile, replaces: payload.replaces ?? null, finalize: `${this.base}/finalize/${orderId}` });
                this.#send(response, 201, this.#orderOf(orderId), { Location: `${this.base}/order/${orderId}` });

                return;
            }

            case "authz": {
                const authorization = this.authorizations.get(id);

                this.#send(response, 200, { identifier: authorization.identifier, status: authorization.status, challenges: authorization.challenges.map((one) => without(one, "authz")) });

                return;
            }

            case "chall": {
                const challenge = this.challenges.get(id);

                if (challenge.status === "pending") {
                    challenge.status = "processing";
                    this.#validate(challenge, account);
                }

                const { authz, ...shown } = challenge;

                this.#send(response, 200, shown, { Link: `<${this.base}/authz/${authz}>;rel="up"` });

                return;
            }

            case "finalize": {
                const order = this.orders.get(id);

                if (this.#orderOf(id).status !== "ready") {
                    throw new Problem(403, "orderNotReady", "Not every name's been proved.");
                }

                const csr = readRequest(Buffer.from(payload.csr, "base64url"));
                const asked = order.identifiers.map((one) => one.value).sort();

                if (!csr.verified || JSON.stringify([...csr.names].sort()) !== JSON.stringify(asked)) {
                    throw new Problem(400, "badCSR", "The request doesn't match the order.");
                }

                const leaf = pem("CERTIFICATE", certificate({ publicKey: csr.publicKey, names: csr.names, issuer: "Fake ACME CA", issuerKey: this.ca.privateKey, hours: PROFILES[order.profile].hours }));
                const parsed = new X509Certificate(leaf);
                const certId = `${b64u(keyIdOf(this.ca.publicKey.export({ type: "spki", format: "der" })))}.${b64u(der.read(parsed.raw).children[0].children[1].content)}`;

                this.issued.set(certId, parsed);
                order.status = "processing";
                order.certificate = `${this.base}/cert/${id}`;
                order.chain = `${leaf}${this.caCert}`;
                this.#send(response, 200, this.#orderOf(id), { "Retry-After": "1" });

                return;
            }

            case "cert": {
                this.#send(response, 200, this.orders.get(id).chain);

                return;
            }

            default:
                throw new Problem(404, "malformed", `No ${url}.`);
        }
    }

    #orderOf(id) {
        const order = this.orders.get(id);
        const states = order.authorizations.map((url) => this.authorizations.get(url.split("/").at(-1)).status);

        if (order.status === "processing" && order.certificate) {
            // (Processing for one look, then done: the client's made to wait as for a real CA)
            order.looked = (order.looked ?? 0) + 1;
            order.status = order.looked > 1 ? "valid" : "processing";
        } else if (order.status === "pending" && states.every((state) => state === "valid")) {
            order.status = "ready";
        } else if (states.includes("invalid")) {
            order.status = "invalid";
        }

        return { ...without(order, "chain", "looked"), ...(order.status === "valid" ? {} : { certificate: undefined }) };
    }

    // A challenge checked as a CA's validator would, a moment later
    async #validate(challenge, account) {
        const authorization = this.authorizations.get(challenge.authz);
        const keyAuthorization = `${challenge.token}.${thumbprint(account.key)}`;
        let error = null;

        await new Promise((resolve) => setTimeout(resolve, 20));

        try {
            if (this.fail?.(authorization.identifier, challenge)) {
                throw new Error("The test made it fail.");
            }

            if (challenge.type === "dns-01") {
                const values = this.dns.get(`_acme-challenge.${authorization.identifier.value}`) ?? new Set();

                if (!values.has(dnsValueOf(keyAuthorization))) {
                    throw new Error(`No TXT record for _acme-challenge.${authorization.identifier.value} with the expected value.`);
                }
            } else if (challenge.type === "tls-alpn-01") {
                await this.#alpn(authorization.identifier.value, keyAuthorization);
            } else {
                throw new Error(`${challenge.type} isn't checked here.`);
            }
        } catch (failed) {
            error = { type: "urn:ietf:params:acme:error:incorrectResponse", detail: failed.message };
        }

        challenge.status = error ? "invalid" : "valid";
        challenge.error = error ?? undefined;
        authorization.status = challenge.status;
    }

    // TLS-ALPN-01 (RFC 8737 §3): the reverse name by SNI, acme-tls/1 alone by ALPN; the certificate
    // must name the address alone and carry the key authorization's SHA-256, critically
    #alpn(address, keyAuthorization) {
        return new Promise((resolve, reject) => {
            const socket = tls.connect({ host: "127.0.0.1", port: this.ports[address], servername: reverseNameOf(address), ALPNProtocols: [ACME_TLS], rejectUnauthorized: false }, () => {
                try {
                    if (socket.alpnProtocol !== ACME_TLS) {
                        throw new Error("acme-tls/1 wasn't agreed.");
                    }

                    const cert = socket.getPeerX509Certificate();

                    if (cert.subjectAltName !== `IP Address:${address.toUpperCase()}`) {
                        throw new Error(`The certificate names ${cert.subjectAltName}.`);
                    }

                    const extensions = der.read(cert.raw).children[0].children.find((child) => child.tag === 0xa3).children[0].children;
                    const acme = extensions.find((ext) => der.oidOf(ext.children[0].content) === "1.3.6.1.5.5.7.1.31");

                    if (!acme || acme.children[1].tag !== 0x01) {
                        throw new Error("No critical acmeIdentifier extension.");
                    }

                    if (!der.read(acme.children[2].content).content.equals(createHash("sha256").update(keyAuthorization).digest())) {
                        throw new Error("The acmeIdentifier doesn't match the key authorization.");
                    }

                    resolve();
                } catch (error) {
                    reject(error);
                } finally {
                    socket.destroy();
                }
            });

            socket.on("error", reject);
        });
    }
}

// The tokens a DNS host would take
export const TOKENS = Object.freeze({ duckdns: "0f9e8d7c-6b5a-4c3d-2e1f-a0b1c2d3e4f5", cloudflare: "cf-Edit-Zone-DNS-token-0123456789", desec: "desecTokenAbcdef0123456789" });

/**
 * The DNS hosts' APIs, faked as each answers, each writing to the CA's DNS (`dns`: a name's TXT
 * values) as the real ones would to theirs; anything else fetched for real (the fake CA on
 * loopback). `asked` is every request made of them; `home` the address DuckDNS sees.
 */
export function dnsHosts(dns, { zones = ["example.com"], home = "198.51.100.20" } = {}) {
    const asked = [];
    const records = new Map();
    const reply = (status, body) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "Content-Type": typeof body === "string" ? "text/plain" : "application/json" } });

    const fetch = async (url, options = {}) => {
        const where = new URL(url);
        const headers = options.headers ?? {};
        const body = options.body ? JSON.parse(options.body) : null;

        if (!["www.duckdns.org", "api.cloudflare.com", "desec.io"].includes(where.hostname)) {
            return globalThis.fetch(url, options);
        }

        asked.push({ host: where.hostname, method: options.method ?? "GET", url: String(url), headers, body });

        if (where.hostname === "www.duckdns.org") {
            const query = where.searchParams;

            if (query.get("token") !== TOKENS.duckdns) {
                return reply(200, "KO");
            }

            if (query.has("txt")) {
                const name = `_acme-challenge.${query.get("domains")}.duckdns.org`;

                if (query.get("clear") === "true") {
                    dns.delete(name);
                } else {
                    dns.set(name, new Set([query.get("txt")]));
                }

                return reply(200, `OK\n${query.get("txt")}\n\nUPDATED`);
            }

            return reply(200, `OK\n${home}\n\n${asked.filter((one) => one.url.includes("ip=")).length > 1 ? "NOCHANGE" : "UPDATED"}`);
        }

        if (where.hostname === "api.cloudflare.com") {
            if (headers.Authorization !== `Bearer ${TOKENS.cloudflare}`) {
                return reply(403, { success: false, errors: [{ code: 9109, message: "Invalid access token" }] });
            }

            const [, , , kind, zone, , record] = where.pathname.split("/");

            if (kind === "zones" && !zone) {
                const name = where.searchParams.get("name");

                return reply(200, { success: true, result: zones.includes(name) ? [{ id: `zone-${name}`, name }] : [] });
            }

            if (options.method === "POST") {
                const id = `record-${records.size + 1}`;

                records.set(id, body.name);
                dns.set(body.name, new Set([body.content.replace(/^"|"$/g, "")]));

                return reply(200, { success: true, result: { id } });
            }

            if (options.method === "DELETE") {
                dns.delete(records.get(record));
                records.delete(record);

                return reply(200, { success: true, result: { id: record } });
            }
        }

        if (where.hostname === "desec.io") {
            if (headers.Authorization !== `Token ${TOKENS.desec}`) {
                return reply(401, { detail: "Invalid token." });
            }

            if (where.pathname === "/api/v1/domains/") {
                const name = where.searchParams.get("owns_qname");

                return reply(200, zones.filter((zone) => name === zone || name.endsWith(`.${zone}`)).map((zone) => ({ name: zone })));
            }

            const domain = where.pathname.split("/")[4];

            for (const { subname, records: values } of body) {
                const name = subname ? `${subname}.${domain}` : domain;

                if (values.length) {
                    dns.set(name, new Set(values.map((value) => value.replace(/^"|"$/g, ""))));
                } else {
                    dns.delete(name);
                }
            }

            return reply(200, body);
        }

        return reply(404, { detail: "Not found." });
    };

    return { fetch, asked };
}

/**
 * The DNS, faked: every zone answered by one nameserver (192.0.2.53), which answers from `dns`.
 * `asked` is which servers each TXT lookup asked; `late` how many lookups see nothing yet.
 */
export function lookupOf(dns, { zones = ["duckdns.org", "example.com"], late = 0 } = {}) {
    const asked = [];
    let unseen = late;

    return {
        asked,
        ns: async (name) => {
            if (!zones.includes(name)) {
                throw Object.assign(new Error("queryNs ENODATA"), { code: "ENODATA" });
            }

            return [`ns1.${name}`];
        },
        addresses: async () => ["192.0.2.53"],
        txt: async (name, servers) => {
            asked.push({ name, servers });

            if (unseen > 0) {
                unseen--;

                return [];
            }

            return [...(dns.get(name) ?? [])];
        },
    };
}
