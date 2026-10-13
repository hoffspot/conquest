// An ACME client (RFC 8555), on node:crypto and fetch alone (generated/world_server_plan.md §9.2):
// it gets the server free certificates from Let's Encrypt (or any ACME CA). Its account key is an
// ECDSA P-256 key (ES256); everything it asks is a JWS, signed, carrying a nonce the CA gave it.
//
//   new AcmeClient({ directory, accountKey })   a CA (its directory's URL), as an account
//   issue({ client, names, key, solvers, profile, replaces })
//       an order for `names` (DNS names and IP addresses), each proved by one of `solvers`
//       (dns-01 for names, tls-alpn-01 for addresses: RFC 8737, RFC 8738), finalized with a
//       certificate request for `key` (x509.js), and the certificate chain fetched (PEM)
//
// Also from the drafts Let's Encrypt follows: profiles (draft-ietf-acme-profiles: "shortlived"
// for IP addresses, 160 hours), and renewal information (RFC 9773: when the CA would have a
// certificate renewed, and `replaces` naming the one an order renews).

import { createHash, createPublicKey, sign, X509Certificate } from "node:crypto";
import { isIP } from "node:net";
import * as der from "./der.js";
import { request } from "./x509.js";

/** The CAs it knows (Let's Encrypt's directories). */
export const DIRECTORIES = Object.freeze({
    letsencrypt: "https://acme-v02.api.letsencrypt.org/directory",
    staging: "https://acme-staging-v02.api.letsencrypt.org/directory",
});

/** The challenges it answers, by the kind of name: an IP address (RFC 8738) and a DNS name. */
export const CHALLENGE_FOR = Object.freeze({ ip: "tls-alpn-01", dns: "dns-01" });

/** TLS-ALPN-01's protocol (RFC 8737 §6.2). */
export const ACME_TLS = "acme-tls/1";

/** How long it waits for a CA's answer (ms), and for an order or authorization to settle. */
export const ACME_LIMITS = Object.freeze({ request: 30000, settle: 180000, poll: 2000 });

const b64u = (bytes) => Buffer.from(bytes).toString("base64url");

/** A problem the CA reported (RFC 7807): its type (without the ACME prefix), what it said, and its HTTP status. */
export class AcmeError extends Error {
    constructor({ type = "serverInternal", detail = "The certificate authority refused.", status = 0, subproblems = [] } = {}) {
        const kind = String(type).replace(/^urn:ietf:params:acme:error:/, "");

        super(`${detail}${subproblems.length ? ` (${subproblems.map((one) => one.detail).filter(Boolean).join("; ")})` : ""}`);
        Object.assign(this, { type: kind, status, subproblems });
    }
}

/** A public key as a JWK (RFC 7517): just its members, for ES256. */
export function jwkOf(key) {
    const { crv, kty, x, y } = (key.type === "public" ? key : createPublicKey(key)).export({ format: "jwk" });

    return { crv, kty, x, y };
}

/** A key's JWK thumbprint (RFC 7638): its required members in lexical order, hashed. */
export function thumbprint(key) {
    const { crv, kty, x, y } = jwkOf(key);

    return b64u(createHash("sha256").update(JSON.stringify({ crv, kty, x, y })).digest());
}

/** A challenge's key authorization (RFC 8555 §8.1): its token and the account key's thumbprint. */
export const keyAuthorizationOf = (token, accountKey) => `${token}.${thumbprint(accountKey)}`;

/** What DNS-01 puts in `_acme-challenge.<name>`'s TXT record: the key authorization's SHA-256. */
export const dnsValueOf = (keyAuthorization) => b64u(createHash("sha256").update(keyAuthorization).digest());

/** An IP address's reverse name (RFC 8738 §6): what a TLS-ALPN-01 validator asks for by SNI. */
export function reverseNameOf(address) {
    if (isIP(address) === 4) {
        return `${address.split(".").reverse().join(".")}.in-addr.arpa`;
    }

    const bytes = new URL(`http://[${address}]`).hostname.slice(1, -1);
    const [head, tail = ""] = bytes.split("::");
    const groups = (part) => (part ? part.split(":") : []);
    const all = bytes.includes("::") ? [...groups(head), ...Array(8 - groups(head).length - groups(tail).length).fill("0"), ...groups(tail)] : groups(head);
    const nibbles = all.map((group) => group.padStart(4, "0")).join("");

    return `${[...nibbles].reverse().join(".")}.ip6.arpa`;
}

/**
 * A certificate's renewal information id (RFC 9773 §4.1): its authority key identifier and its
 * serial number, each base64url, joined by a dot. Null if it carries no authority key identifier.
 */
export function renewalIdOf(pemOrDer) {
    const cert = new X509Certificate(pemOrDer);
    const tbs = der.read(cert.raw).children[0];
    const serial = tbs.children[tbs.children[0].tag === 0xa0 ? 1 : 0].content;
    const extensions = tbs.children.find((child) => child.tag === 0xa3)?.children[0].children ?? [];

    for (const extension of extensions) {
        if (der.oidOf(extension.children[0].content) === "2.5.29.35") {
            const keyId = der.read(extension.children.at(-1).content).children.find((child) => child.tag === 0x80);

            return keyId ? `${b64u(keyId.content)}.${b64u(serial)}` : null;
        }
    }

    return null;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * How long a response says to wait before asking again (Retry-After: seconds or a date), in ms,
 * kept between `least` and `most`; or `otherwise`.
 */
function retryAfter(response, otherwise, { least = 1000, most = 60000 } = {}) {
    const given = response.headers.get("retry-after");
    const seconds = Number(given);
    const ms = !given ? NaN : Number.isFinite(seconds) ? seconds * 1000 : Date.parse(given) - Date.now();

    return Number.isFinite(ms) ? Math.min(Math.max(ms, least), most) : otherwise;
}

export class AcmeClient {
    /**
     * A CA, by its directory's URL (`directory`), as the account whose key is `accountKey` (a
     * private KeyObject, ECDSA P-256). `contact` an email (or null); `fetch` for the tests;
     * `poll` how long to wait between asking how an order's going (ms).
     */
    constructor({ directory, accountKey, contact = null, fetch = globalThis.fetch, poll = ACME_LIMITS.poll, settle = ACME_LIMITS.settle }) {
        Object.assign(this, { directoryUrl: directory, accountKey, contact, fetch, poll, settle });
        this.kid = null;
        this.nonces = [];
        this.known = null;
    }

    /** The CA's directory: its URLs, and `meta` (terms of service, profiles, website). */
    async directory() {
        if (!this.known) {
            const response = await this.#fetch(this.directoryUrl, { method: "GET" });

            this.known = await response.json();
        }

        return this.known;
    }

    /** The CA's terms of service (a URL), and its profiles ({ name: url }). */
    async meta() {
        const { meta = {} } = await this.directory();

        return { termsOfService: meta.termsOfService ?? null, profiles: meta.profiles ?? {}, website: meta.website ?? null };
    }

    async #fetch(url, options) {
        let response;

        try {
            response = await this.fetch(url, { ...options, signal: AbortSignal.timeout(ACME_LIMITS.request) });
        } catch (error) {
            throw new AcmeError({ type: "connection", detail: `The certificate authority couldn't be reached (${error.cause?.code ?? error.message}).` });
        }

        const nonce = response.headers.get("replay-nonce");

        if (nonce) {
            this.nonces.push(nonce);
        }

        return response;
    }

    async #nonce() {
        if (!this.nonces.length) {
            await this.#fetch((await this.directory()).newNonce, { method: "HEAD" });
        }

        const nonce = this.nonces.pop();

        if (!nonce) {
            throw new AcmeError({ type: "badNonce", detail: "The certificate authority gave no nonce." });
        }

        return nonce;
    }

    /**
     * A signed request (RFC 8555 §6.2): `payload` an object, or "" for POST-as-GET. Signed with
     * the account's key itself until there's an account (`jwk`), then by its URL (`kid`). A
     * badNonce refusal is tried again (§6.5), once. Returns the response, or throws the problem.
     */
    async post(url, payload, { jwk = false, accept = "application/json" } = {}) {
        for (let attempt = 0; ; attempt++) {
            const head = { alg: "ES256", nonce: await this.#nonce(), url, ...(jwk ? { jwk: jwkOf(this.accountKey) } : { kid: this.kid }) };
            const protectedPart = b64u(JSON.stringify(head));
            const payloadPart = payload === "" ? "" : b64u(JSON.stringify(payload));
            const signature = b64u(sign("sha256", Buffer.from(`${protectedPart}.${payloadPart}`), { key: this.accountKey, dsaEncoding: "ieee-p1363" }));
            const response = await this.#fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/jose+json", Accept: accept },
                body: JSON.stringify({ protected: protectedPart, payload: payloadPart, signature }),
            });

            if (response.ok) {
                return response;
            }

            const problem = await response.json().catch(() => ({}));
            const error = new AcmeError({ ...problem, status: response.status });

            if (error.type === "badNonce" && attempt === 0) {
                continue;
            }

            throw error;
        }
    }

    /** POST-as-GET (§6.3): a resource read as the account. Returns its JSON. */
    async get(url) {
        return (await this.post(url, "")).json();
    }

    /**
     * The account (§7.3): made the first time (its terms of service agreed: `agree` must be
     * true), or found again by its key. Returns its URL.
     */
    async account({ agree = false } = {}) {
        if (this.kid) {
            return this.kid;
        }

        const { newAccount } = await this.directory();
        const response = await this.post(newAccount, { termsOfServiceAgreed: Boolean(agree), ...(this.contact ? { contact: [`mailto:${this.contact}`] } : {}) }, { jwk: true });

        this.kid = response.headers.get("location");

        if (!this.kid) {
            throw new AcmeError({ detail: "The certificate authority made no account." });
        }

        return this.kid;
    }

    /** An order (§7.4) for `names`, under `profile` if given, renewing `replaces` (RFC 9773) if given. Returns { url, ...order }. */
    async order(names, { profile = null, replaces = null } = {}) {
        const { newOrder } = await this.directory();
        const identifiers = names.map((value) => ({ type: isIP(value) ? "ip" : "dns", value }));
        const response = await this.post(newOrder, { identifiers, ...(profile ? { profile } : {}), ...(replaces ? { replaces } : {}) });

        return { url: response.headers.get("location"), ...(await response.json()) };
    }

    /** A resource asked about again and again (POST-as-GET) until `done(it)`; refused if it goes `invalid`, or takes longer than `settle`. */
    async settled(url, done, what) {
        const end = Date.now() + this.settle;

        for (;;) {
            const response = await this.post(url, "");
            const it = await response.json();

            if (done(it)) {
                return it;
            }

            if (it.status === "invalid") {
                const failed = it.challenges?.find((challenge) => challenge.error)?.error ?? it.error;

                throw new AcmeError({ ...failed, detail: failed?.detail ?? `The certificate authority wouldn't accept the ${what}.` });
            }

            if (Date.now() > end) {
                throw new AcmeError({ type: "timeout", detail: `The certificate authority took too long over the ${what}.` });
            }

            await wait(retryAfter(response, this.poll));
        }
    }

    /** The certificate chain an order's made (PEM). */
    async chain(url) {
        return (await this.post(url, "", { accept: "application/pem-certificate-chain" })).text();
    }

    /**
     * When the CA would have a certificate renewed (RFC 9773): { start, end (ms), explanation,
     * retry (ms: when to ask again) }, or null if it doesn't say (or can't).
     */
    async renewalInfo(cert) {
        const { renewalInfo } = await this.directory();
        const id = renewalInfo ? renewalIdOf(cert) : null;

        if (!id) {
            return null;
        }

        const response = await this.#fetch(`${renewalInfo.replace(/\/$/, "")}/${id}`, { method: "GET" });

        if (!response.ok) {
            return null;
        }

        const { suggestedWindow, explanationURL = null } = await response.json();
        const start = Date.parse(suggestedWindow?.start);
        const end = Date.parse(suggestedWindow?.end);

        return Number.isFinite(start) && Number.isFinite(end) ? { start, end, explanation: explanationURL, retry: retryAfter(response, 6 * 3600 * 1000, { least: 60000, most: 86400000 }) } : null;
    }
}

/**
 * A certificate got: an order for `names`, each proved by the solver for its challenge
 * (`solvers`: { "dns-01": { prepare({ name, keyAuthorization, value }) }, "tls-alpn-01":
 * { prepare({ address, keyAuthorization }) } }, each prepare returning a function that undoes
 * it), then finalized for `key` (its private KeyObject). `log` is told how it's going. Returns
 * { cert (the chain, PEM), order }.
 */
export async function issue({ client, names, key, solvers, profile = null, replaces = null, agree = false, log = () => {} }) {
    await client.account({ agree });
    log(`Asking for a certificate for ${names.join(", ")}${profile ? ` (the ${profile} profile)` : ""}.`);

    const order = await client.order(names, { profile, replaces });
    const undo = [];

    try {
        const pending = [];

        for (const url of order.authorizations) {
            const authorization = await client.get(url);

            if (authorization.status === "valid") {
                continue;
            }

            const { type, value } = authorization.identifier;
            const kind = CHALLENGE_FOR[type];
            const challenge = authorization.challenges.find((one) => one.type === kind);
            const solver = solvers[kind];

            if (!challenge || !solver) {
                throw new AcmeError({ type: "unsupportedIdentifier", detail: `${value} can't be proved here (no ${kind}).` });
            }

            const keyAuthorization = keyAuthorizationOf(challenge.token, client.accountKey);

            log(`Proving ${value} (${kind}).`);
            undo.push(await solver.prepare(type === "ip" ? { address: value, keyAuthorization } : { name: value, keyAuthorization, value: dnsValueOf(keyAuthorization) }));
            pending.push({ url, challenge, value });
        }

        for (const { url, challenge, value } of pending) {
            await client.post(challenge.url, {});
            await client.settled(url, (it) => it.status === "valid", `proof of ${value}`);
            log(`${value} proved.`);
        }
    } finally {
        for (const step of undo.reverse()) {
            await Promise.resolve(step?.()).catch(() => {});
        }
    }

    const ready = await client.settled(order.url, (it) => it.status === "ready" || it.status === "valid", "order");
    let done = ready;

    if (ready.status === "ready") {
        await client.post(ready.finalize ?? order.finalize, { csr: b64u(request({ key, names })) });
        done = await client.settled(order.url, (it) => it.status === "valid", "certificate request");
    }

    log("Issued.");

    return { cert: await client.chain(done.certificate), order: done };
}
